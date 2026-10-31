package com.njarrar.brain.ui

import android.content.Context
import android.media.MediaPlayer
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Undo
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.GraphicEq
import androidx.compose.material.icons.outlined.Snooze
import androidx.compose.material3.Icon
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import com.njarrar.brain.data.Api
import com.njarrar.brain.data.Dates
import com.njarrar.brain.data.Filter
import com.njarrar.brain.data.Item
import com.njarrar.brain.data.KeptWhy
import com.njarrar.brain.data.MenuStore
import com.njarrar.brain.data.Podcast
import com.njarrar.brain.data.SignedOutException
import com.njarrar.brain.data.Sources
import com.njarrar.brain.data.TopicMap
import com.njarrar.brain.data.friendly
import com.njarrar.brain.ui.theme.Theme
import kotlinx.coroutines.DelicateCoroutinesApi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import kotlin.math.roundToInt

/** A pushed screen on the grouped background, with a back bar and a scrolling column. */
@Composable
private fun KeepPage(title: String, content: @Composable () -> Unit) {
    val c = Theme.colors
    val nav = LocalNav.current
    Column(Modifier.fillMaxSize().background(c.grouped)) {
        TopBar(title, onBack = { nav.back() })
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                .padding(start = 16.dp, end = 16.dp, top = 8.dp, bottom = barSpace(110.dp)),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) { content() }
    }
}

// Clear the pile

class PileModel : ViewModel() {
    val cards = mutableStateListOf<Item>()
    var left by mutableIntStateOf(0)
    var cleared by mutableIntStateOf(0)
    var loaded by mutableStateOf(false)
    var asking by mutableStateOf<Item?>(null)
    var picked by mutableStateOf<KeptWhy?>(null)
    var error by mutableStateOf<String?>(null)
    private val history = ArrayDeque<Pair<Item, String>>()
    private val handled = mutableListOf<String>()
    private var loading = false
    val canUndo get() = history.isNotEmpty()

    init {
        viewModelScope.launch {
            try {
                val page = Api.pile()
                cards.addAll(page.items)
                left = page.left
            } catch (_: SignedOutException) {
            } catch (e: Exception) {
                error = e.friendly()
            }
            loaded = true
        }
    }

    /** Moves on at once and saves behind you. If saving fails, the card comes back. */
    fun decide(item: Item, how: String) {
        cards.remove(item)
        left = maxOf(0, left - 1)
        cleared += 1
        history.addLast(item to how)
        if (history.size > 20) history.removeFirst()
        handled.add(item.id)
        asking = if (how == "done") item else null
        picked = null
        error = null
        viewModelScope.launch {
            try {
                Api.pileCall(item.id, how)
            } catch (e: Exception) {
                cards.remove(item)
                cards.add(0, item)
                left += 1
                cleared = maxOf(0, cleared - 1)
                error = "Couldn't save that. Try again."
            }
            more()
        }
    }

    fun why(w: KeptWhy) {
        val item = asking ?: return
        val next = if (picked == w) null else w
        picked = next
        viewModelScope.launch { runCatching { Api.keptWhy(item.id, next) } }
    }

    fun undo() {
        val (item, _) = history.removeLastOrNull() ?: return
        cards.remove(item)
        cards.add(0, item)
        left += 1
        cleared = maxOf(0, cleared - 1)
        asking = null
        viewModelScope.launch {
            try {
                Api.pileCall(item.id, "undo")
            } catch (e: Exception) {
                error = "Couldn't take that back. Try again."
            }
        }
    }

    /** Fetches more before the screen runs out. */
    private suspend fun more() {
        if (loading || cards.size >= 6 || left <= cards.size) return
        loading = true
        try {
            val page = Api.pile(cards.map { it.id } + handled.takeLast(60))
            val have = cards.map { it.id }.toSet()
            cards.addAll(page.items.filter { it.id !in have })
        } catch (_: Exception) {
        }
        loading = false
    }

    // The Library's count catches up once you leave.
    @OptIn(DelicateCoroutinesApi::class)
    override fun onCleared() {
        GlobalScope.launch { runCatching { MenuStore.load() } }
    }
}

/** Every inbox save, oldest first, one at a time, until none are left. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun PileScreen() {
    val c = Theme.colors
    val haptic = LocalHapticFeedback.current
    val m: PileModel = viewModel { PileModel() }
    KeepPage("Clear the pile") {
        Text("Oldest first. Decide on each save until none are left.", fontSize = 15.sp, color = c.soft)
        if (!m.loaded) {
            Box(Modifier.fillMaxWidth().padding(top = 40.dp), contentAlignment = Alignment.Center) { Spinner() }
            return@KeepPage
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("%,d".format(m.left), fontSize = 28.sp, fontWeight = FontWeight.SemiBold, fontFamily = FontFamily.Monospace, color = c.ink)
            Text("left", fontSize = 14.sp, fontFamily = FontFamily.Monospace, color = c.soft)
            if (m.cleared > 0) Text("· ${m.cleared} cleared", fontSize = 13.sp, color = c.faint)
            Box(Modifier.weight(1f))
            Row(
                Modifier.clip(RoundedCornerShape(8.dp)).clickable(enabled = m.canUndo) { m.undo() }.padding(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val tint = if (m.canUndo) c.accent else c.faint
                Icon(Icons.AutoMirrored.Outlined.Undo, null, tint = tint, modifier = Modifier.size(18.dp))
                Text(" Undo", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = tint)
            }
        }
        if (m.asking != null) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.accentBG).padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text("Why did you keep it?", fontSize = 13.sp, fontWeight = FontWeight.Medium, color = c.soft)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    KeptWhy.entries.forEach { w ->
                        val on = m.picked == w
                        Text(
                            w.label, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = if (on) c.accentInk else c.ink,
                            modifier = Modifier.clip(CircleShape).background(if (on) c.accentFill else c.card)
                                .clickable { haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove); m.why(w) }
                                .padding(horizontal = 12.dp, vertical = 8.dp),
                        )
                    }
                }
            }
        }
        val card = m.cards.firstOrNull()
        if (card == null) {
            Column(
                Modifier.fillMaxWidth().padding(top = 40.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text("0", fontSize = 40.sp, fontWeight = FontWeight.SemiBold, fontFamily = FontFamily.Monospace, color = c.accent)
                Text("The pile is clear.", fontSize = 17.sp, fontWeight = FontWeight.SemiBold, color = c.ink)
                Text("New saves land here. Snoozed ones come back in two weeks.", fontSize = 14.sp, color = c.soft, textAlign = TextAlign.Center)
            }
        } else {
            PileCard(card)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                CallButton("Let go", Icons.Outlined.Delete) { haptic.performHapticFeedback(HapticFeedbackType.LongPress); m.decide(card, "letgo") }
                CallButton("Snooze", Icons.Outlined.Snooze) { haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove); m.decide(card, "snooze") }
                CallButton("Keep", Icons.Outlined.Check, main = true) { haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove); m.decide(card, "done") }
            }
        }
        m.error?.let { Text(it, fontSize = 13.sp, color = c.bad) }
    }
}

@Composable
private fun PileCard(item: Item) {
    val c = Theme.colors
    val nav = LocalNav.current
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.card)) {
        Box(Modifier.fillMaxWidth().height(3.dp).background(Theme.swatch(item.categoryColor, c.faint)))
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(
                "${Sources.label(item.sources?.firstOrNull() ?: "manual")} · ${Dates.short(item.date)}",
                fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = c.accent,
                modifier = Modifier.clip(CircleShape).background(c.accentBG).padding(horizontal = 10.dp, vertical = 4.dp),
            )
            (item.author ?: item.authorHandle)?.let { Text(it, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = c.soft) }
            Text(
                item.mainText, fontSize = if (item.isArabic) 21.sp else 19.sp, fontWeight = FontWeight.Medium,
                lineHeight = if (item.isArabic) 33.sp else 26.sp, color = c.ink, maxLines = 12,
                textAlign = if (item.isArabic) TextAlign.End else TextAlign.Start, modifier = Modifier.fillMaxWidth(),
            )
            item.summary?.takeIf { it.isNotEmpty() }?.let { Text(it, fontSize = 15.sp, color = c.ink2) }
            if (!item.isSensitive) {
                item.pictures.firstOrNull()?.let { url ->
                    AsyncImage(
                        model = url, contentDescription = null, contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxWidth().aspectRatio(16f / 10f).clip(RoundedCornerShape(12.dp)).background(c.raised),
                    )
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f)) { item.category?.let { CategoryLabel(it, item.categoryColor) } }
                Text(
                    "Open", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = c.accent,
                    modifier = Modifier.clip(RoundedCornerShape(6.dp)).clickable { nav.open(item) }.padding(6.dp),
                )
            }
        }
    }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.CallButton(label: String, icon: ImageVector, main: Boolean = false, onClick: () -> Unit) {
    val c = Theme.colors
    val ink = if (main) c.accentInk else c.ink
    Row(
        Modifier.weight(1f).heightIn(min = 46.dp).clip(RoundedCornerShape(12.dp)).background(if (main) c.accentFill else c.card)
            .clickable(onClick = onClick),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        Icon(icon, null, tint = ink, modifier = Modifier.size(18.dp))
        Text(" $label", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = ink)
    }
}

// Topic map

class MapModel : ViewModel() {
    var map by mutableStateOf<TopicMap?>(null)
    var error by mutableStateOf<String?>(null)

    init {
        viewModelScope.launch {
            try {
                map = Api.topicMap()
            } catch (_: SignedOutException) {
            } catch (e: Exception) {
                error = e.friendly()
            }
        }
    }
}

/** Each circle is a category, sized by how much you saved in it. Lines join categories whose saves share tags. */
@Composable
fun TopicMapScreen() {
    val c = Theme.colors
    val nav = LocalNav.current
    val m: MapModel = viewModel { MapModel() }
    KeepPage("Topic map") {
        val map = m.map
        when {
            map != null -> {
                Text("${"%,d".format(map.total)} saves. Bigger circles hold more. Lines join topics that share tags.", fontSize = 15.sp, color = c.soft)
                if (map.nodes.isEmpty()) {
                    Text("Nothing is sorted yet.", color = c.faint, modifier = Modifier.padding(top = 20.dp))
                } else {
                    MapCanvas(map) { nav.list(Filter(view = "all", category = it)) }
                    GroupBox {
                        map.nodes.forEachIndexed { i, n ->
                            Column(Modifier.clickable { nav.list(Filter(view = "all", category = n.name)) }) {
                                GroupRow(n.name, "%,d".format(n.count), divider = false, minHeight = 40.dp) {
                                    Box(Modifier.padding(horizontal = 5.dp)) { Swatch(n.color, 10.dp) }
                                }
                                if (n.subtopics.isNotEmpty()) {
                                    Text(
                                        n.subtopics.joinToString(" · ") { "${it.name} ${it.count}" }, fontSize = 12.5.sp, color = c.soft, maxLines = 2,
                                        modifier = Modifier.padding(start = 14.dp, end = 14.dp, bottom = 10.dp),
                                    )
                                }
                                if (i < map.nodes.size - 1) RowDivider()
                            }
                        }
                    }
                }
            }
            m.error != null -> Text(m.error!!, fontSize = 13.sp, color = c.bad)
            else -> Box(Modifier.fillMaxWidth().padding(top = 40.dp), contentAlignment = Alignment.Center) { Spinner() }
        }
    }
}

@Composable
private fun MapCanvas(map: TopicMap, onOpen: (String) -> Unit) {
    val c = Theme.colors
    val density = LocalDensity.current
    BoxWithConstraints(Modifier.fillMaxWidth().aspectRatio(1040f / 1060f)) {
        val widthPx = with(density) { maxWidth.toPx() }
        val scale = widthPx / 1040f
        fun at(x: Double, y: Double) = Offset(((x + 20) * scale).toFloat(), ((y + 20) * scale).toFloat())
        val byName = map.nodes.associateBy { it.name }
        val most = (map.links.maxOfOrNull { it.shared } ?: 1).toFloat()
        val lineColor = c.soft
        Canvas(Modifier.fillMaxSize()) {
            map.links.forEach { l ->
                val a = byName[l.a] ?: return@forEach
                val b = byName[l.b] ?: return@forEach
                val w = l.shared / most
                drawLine(
                    lineColor.copy(alpha = 0.25f + 0.5f * w), at(a.x, a.y), at(b.x, b.y),
                    strokeWidth = (1.5f + 4f * w) * scale * 2, pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 8f)),
                )
            }
            map.nodes.forEach { n ->
                val col = Theme.swatch(n.color, c.accent)
                drawCircle(col.copy(alpha = 0.22f), (n.r * scale).toFloat(), at(n.x, n.y))
                drawCircle(col, (n.r * scale).toFloat(), at(n.x, n.y), style = androidx.compose.ui.graphics.drawscope.Stroke(width = 1.5.dp.toPx()))
            }
        }
        map.nodes.forEach { n ->
            val center = at(n.x, n.y)
            val r = (n.r * scale).toFloat()
            val size = with(density) { (r * 2).toDp() }
            Box(
                Modifier.offset { IntOffset((center.x - r).roundToInt(), (center.y - r).roundToInt()) }
                    .size(size).clip(CircleShape).clickable { onOpen(n.name) },
                contentAlignment = Alignment.Center,
            ) {
                Text("%,d".format(n.count), fontSize = maxOf(9f, with(density) { (r * 0.5f).toSp().value }).sp, fontWeight = FontWeight.SemiBold, fontFamily = FontFamily.Monospace, color = c.ink)
            }
            Text(
                n.name.uppercase(), fontSize = 9.sp, fontWeight = FontWeight.SemiBold, fontFamily = FontFamily.Monospace, color = c.ink, maxLines = 1,
                modifier = Modifier.offset { IntOffset((center.x - r * 1.6f).roundToInt(), (center.y + r + 2).roundToInt()) }
                    .size(with(density) { (r * 3.2f).toDp() }, 14.dp),
                textAlign = TextAlign.Center,
            )
        }
    }
}

// Podcast

class PodcastModel : ViewModel() {
    val episodes = mutableStateListOf<Podcast>()
    var loaded by mutableStateOf(false)
    var making by mutableStateOf(false)
    var note by mutableStateOf<String?>(null)

    init {
        viewModelScope.launch { load() }
    }

    private suspend fun load() {
        try {
            val list = Api.podcasts()
            episodes.clear()
            episodes.addAll(list)
        } catch (_: SignedOutException) {
        } catch (e: Exception) {
            note = e.friendly()
        }
        loaded = true
    }

    fun make() {
        making = true
        viewModelScope.launch {
            try {
                val out = Api.makePodcast()
                note = if (out.made) null else out.reason
                load()
            } catch (e: Exception) {
                note = e.friendly()
            }
            making = false
        }
    }
}

/** Two hosts talk through the last thirty days of what you kept. Make writes a new episode. */
@Composable
fun PodcastScreen() {
    val c = Theme.colors
    val m: PodcastModel = viewModel { PodcastModel() }
    KeepPage("Podcast") {
        Text("Maya and Sam talk through the last thirty days of what you saved and kept, and push back on each other.", fontSize = 15.sp, color = c.soft)
        Row(
            Modifier.heightIn(min = 40.dp).clip(CircleShape).background(c.accentBG).clickable(enabled = !m.making) { m.make() }
                .padding(horizontal = 14.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (m.making) Spinner(16.dp, c.accent) else Icon(Icons.Outlined.GraphicEq, null, tint = c.accent, modifier = Modifier.size(18.dp))
            Text(
                if (m.making) "Making it, about a minute…" else if (m.episodes.isEmpty()) "Make" else "Make a new one",
                fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = c.accent,
            )
        }
        m.note?.let { Text(it, fontSize = 13.sp, color = c.soft) }
        if (!m.loaded) {
            Box(Modifier.fillMaxWidth().padding(top = 30.dp), contentAlignment = Alignment.Center) { Spinner() }
        } else if (m.episodes.isEmpty()) {
            Text("No episode yet.", color = c.faint, modifier = Modifier.padding(top = 20.dp))
        }
        m.episodes.forEach { p -> Episode(p) }
    }
}

@Composable
private fun Episode(p: Podcast) {
    val c = Theme.colors
    var script by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        GroupCaption(p.span)
        GroupBox {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(p.title, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, color = c.ink)
                EpisodePlayer(p)
                Text(
                    if (script) "Hide the script" else "Read the script", fontSize = 14.sp, fontWeight = FontWeight.Medium, color = c.accent,
                    modifier = Modifier.clickable { script = !script },
                )
                if (script) {
                    p.lines.forEach { l ->
                        Text(
                            buildAnnotatedString {
                                withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append("${l.host}: ") }
                                append(l.text)
                            },
                            fontSize = 14.5.sp, lineHeight = 20.sp, color = c.ink,
                        )
                    }
                }
            }
        }
    }
}

private suspend fun episodeCopy(context: Context, p: Podcast): File {
    val out = File(context.cacheDir, "brain-podcast-${p.id}.mp3")
    if (out.exists() && out.length() > 0) return out
    val data = Api.podcastAudio(p)
    withContext(Dispatchers.IO) { out.writeBytes(data) }
    return out
}

/** Plays one episode. The sound needs the key, so it is loaded first, then played from a copy. */
@Composable
private fun EpisodePlayer(p: Podcast) {
    val c = Theme.colors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var player by remember { mutableStateOf<MediaPlayer?>(null) }
    var playing by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }
    var length by remember { mutableIntStateOf(0) }
    var at by remember { mutableFloatStateOf(0f) }

    DisposableEffect(p.id) {
        onDispose {
            player?.release()
            player = null
        }
    }
    LaunchedEffect(playing) {
        while (playing) {
            at = (player?.currentPosition ?: 0) / 1000f
            delay(250)
        }
    }

    fun toggle() {
        val mp = player
        if (mp != null) {
            if (mp.isPlaying) mp.pause() else mp.start()
            playing = mp.isPlaying
            return
        }
        loading = true
        scope.launch {
            var made: MediaPlayer? = null
            try {
                val local = episodeCopy(context, p)
                val created = MediaPlayer()
                made = created
                created.setDataSource(local.absolutePath)
                withContext(Dispatchers.IO) { created.prepare() }
                created.setOnCompletionListener {
                    playing = false
                    it.seekTo(0)
                    at = 0f
                }
                length = created.duration / 1000
                player = created
                made = null
                created.start()
                playing = true
                failed = false
            } catch (e: Throwable) {
                made?.release()
                if (e is kotlinx.coroutines.CancellationException) throw e
                failed = true
            }
            loading = false
        }
    }

    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(
            Modifier.size(44.dp).clip(CircleShape).background(c.accentFill).clickable(enabled = !loading) { toggle() },
            contentAlignment = Alignment.Center,
        ) {
            if (loading) Spinner(18.dp, c.accentInk)
            else Icon(if (playing) Icons.Filled.Pause else Icons.Filled.PlayArrow, if (playing) "Pause" else "Play", tint = c.accentInk)
        }
        if (length > 0) {
            Slider(
                value = at.coerceIn(0f, length.toFloat()), onValueChange = { at = it },
                onValueChangeFinished = { player?.seekTo((at * 1000).toInt()) },
                valueRange = 0f..length.toFloat(),
                colors = SliderDefaults.colors(thumbColor = c.accent, activeTrackColor = c.accent),
                modifier = Modifier.weight(1f),
            )
        } else {
            Box(Modifier.weight(1f))
        }
        Text(
            if (failed) "Couldn't load" else "${clock(at.toInt())} / ${clock(if (length > 0) length else (p.seconds ?: 0.0).toInt())}",
            fontSize = 12.sp, fontFamily = FontFamily.Monospace, color = if (failed) c.bad else c.faint,
        )
    }
}
