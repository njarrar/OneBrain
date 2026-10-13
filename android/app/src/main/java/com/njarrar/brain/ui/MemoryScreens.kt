package com.njarrar.brain.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import com.njarrar.brain.data.Answer
import com.njarrar.brain.data.Api
import com.njarrar.brain.data.Dates
import com.njarrar.brain.data.Digest
import com.njarrar.brain.data.Item
import com.njarrar.brain.data.MenuStore
import com.njarrar.brain.data.ResurfaceCard
import com.njarrar.brain.data.SignedOutException
import com.njarrar.brain.data.friendly
import com.njarrar.brain.ui.theme.Theme
import kotlinx.coroutines.launch

/** A small row for an item inside another screen: category square (or its number), text, date. Taps open the item. */
@Composable
fun MiniItemRow(item: Item, number: Int? = null) {
    val c = Theme.colors
    val nav = LocalNav.current
    Row(
        Modifier.fillMaxWidth().heightIn(min = 44.dp).clickable { nav.open(item) }.padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (number != null) {
            Text(
                "$number", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, fontFamily = FontFamily.Monospace, color = c.accent,
                textAlign = TextAlign.Center, modifier = Modifier.width(18.dp),
            )
        } else {
            Swatch(item.categoryColor)
        }
        Text(
            item.mainText, fontSize = 15.sp, color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis,
            textAlign = if (item.isArabic) TextAlign.End else TextAlign.Start, modifier = Modifier.weight(1f),
        )
        Text(Dates.row(item.date), fontSize = 12.sp, fontFamily = FontFamily.Monospace, color = c.faint)
    }
}

/** A pushed screen on the grouped background, with a back bar and a scrolling column. */
@Composable
private fun MemoryPage(title: String, content: @Composable () -> Unit) {
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

// Resurface

class ResurfaceModel : ViewModel() {
    val cards = mutableStateListOf<ResurfaceCard>()
    var index by mutableIntStateOf(0)
    var loaded by mutableStateOf(false)
    var busy by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)

    init {
        viewModelScope.launch {
            try {
                cards.addAll(Api.resurface())
            } catch (_: SignedOutException) {
            } catch (e: Exception) {
                error = e.friendly()
            }
            loaded = true
        }
    }

    fun review(card: ResurfaceCard, how: String) {
        busy = true
        viewModelScope.launch {
            try {
                Api.review(card.id, how)
                error = null
                index += 1
                if (index >= cards.size) MenuStore.load()
            } catch (e: Exception) {
                error = e.friendly()
            }
            busy = false
        }
    }
}

/**
 * A few saves each day: ones you asked to see again, and ones from this day in past years.
 * Keep brings a card back later (then less and less often), Tomorrow brings it back tomorrow, Done lets it go.
 */
@Composable
fun ResurfaceScreen() {
    val c = Theme.colors
    val m: ResurfaceModel = viewModel { ResurfaceModel() }
    MemoryPage("Resurface") {
        Text("A few things from your memory, every day.", fontSize = 15.sp, color = c.soft)
        when {
            !m.loaded -> Box(Modifier.fillMaxWidth().padding(top = 40.dp), contentAlignment = Alignment.Center) { Spinner() }
            m.index < m.cards.size -> {
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    m.cards.indices.forEach { i ->
                        Box(Modifier.weight(1f).height(3.dp).clip(CircleShape).background(if (i <= m.index) c.accent else c.line))
                    }
                }
                AnimatedContent(
                    targetState = m.cards[m.index],
                    transitionSpec = { (slideInHorizontally { it / 2 } + fadeIn(tween(220))) togetherWith fadeOut(tween(150)) },
                    label = "card",
                ) { card -> ResurfaceCardView(card) }
                val card = m.cards[m.index]
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    ReviewButton("Done", Icons.Outlined.Check, enabled = !m.busy) { m.review(card, "done") }
                    ReviewButton("Tomorrow", Icons.Outlined.Schedule, enabled = !m.busy) { m.review(card, "later") }
                    ReviewButton("Keep", Icons.Outlined.AutoAwesome, main = true, enabled = !m.busy) { m.review(card, "keep") }
                }
            }
            else -> Column(
                Modifier.fillMaxWidth().padding(top = 50.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Icons.Outlined.AutoAwesome, null, tint = c.accent, modifier = Modifier.size(36.dp))
                Text(
                    if (m.cards.isEmpty()) "Nothing to look back on today." else "That's all for today.",
                    fontSize = 17.sp, fontWeight = FontWeight.SemiBold, color = c.ink,
                )
                Text("Use Remind me on any save to have it come back here.", fontSize = 14.sp, color = c.soft, textAlign = TextAlign.Center)
            }
        }
        m.error?.let { Text(it, fontSize = 13.sp, color = c.bad) }
    }
}

@Composable
private fun ResurfaceCardView(card: ResurfaceCard) {
    val c = Theme.colors
    val nav = LocalNav.current
    val item = card.item
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.card)) {
        Box(Modifier.fillMaxWidth().height(3.dp).background(Theme.swatch(item.categoryColor, c.faint)))
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(
                card.why, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = c.accent,
                modifier = Modifier.clip(CircleShape).background(c.accentBG).padding(horizontal = 10.dp, vertical = 4.dp),
            )
            item.author?.let { Text(it, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = c.soft) }
            Text(
                item.mainText, fontSize = if (item.isArabic) 21.sp else 19.sp, fontWeight = FontWeight.Medium,
                lineHeight = if (item.isArabic) 33.sp else 26.sp, color = c.ink,
                textAlign = if (item.isArabic) TextAlign.End else TextAlign.Start, modifier = Modifier.fillMaxWidth(),
            )
            item.summary?.takeIf { it.isNotEmpty() }?.let { Text(it, fontSize = 15.sp, color = c.ink2) }
            item.pictures.firstOrNull()?.let { url ->
                AsyncImage(
                    model = url, contentDescription = null, contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxWidth().aspectRatio(16f / 10f).clip(RoundedCornerShape(12.dp)).background(c.raised),
                )
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
private fun androidx.compose.foundation.layout.RowScope.ReviewButton(
    label: String,
    icon: ImageVector,
    main: Boolean = false,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    val c = Theme.colors
    val ink = if (main) c.accentInk else c.ink
    Row(
        Modifier.weight(1f).heightIn(min = 46.dp).clip(RoundedCornerShape(12.dp)).background(if (main) c.accentFill else c.card)
            .clickable(enabled = enabled, onClick = onClick),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        Icon(icon, null, tint = ink, modifier = Modifier.size(18.dp))
        Text(" $label", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = ink)
    }
}

// Weekly digest

class DigestModel : ViewModel() {
    val digests = mutableStateListOf<Digest>()
    var loaded by mutableStateOf(false)
    var writing by mutableStateOf(false)
    var note by mutableStateOf<String?>(null)

    init {
        viewModelScope.launch {
            try {
                digests.addAll(Api.digests())
            } catch (_: SignedOutException) {
            } catch (e: Exception) {
                note = e.friendly()
            }
            loaded = true
        }
    }

    fun make() {
        writing = true
        viewModelScope.launch {
            try {
                val out = Api.makeDigest()
                digests.clear()
                digests.addAll(out.digests)
                note = if (out.made == true) null else out.reason
            } catch (e: Exception) {
                note = e.friendly()
            }
            writing = false
        }
    }
}

/** One short write-up per week of what was saved, made by the chosen AI on Sunday evenings. */
@Composable
fun DigestScreen() {
    val c = Theme.colors
    val m: DigestModel = viewModel { DigestModel() }
    MemoryPage("Weekly digest") {
        Text("Your AI writes one every Sunday evening from what you saved that week.", fontSize = 15.sp, color = c.soft)
        Row(
            Modifier.heightIn(min = 40.dp).clip(CircleShape).background(c.accentBG).clickable(enabled = !m.writing) { m.make() }
                .padding(horizontal = 14.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (m.writing) Spinner(16.dp, c.accent) else Icon(Icons.Outlined.AutoAwesome, null, tint = c.accent, modifier = Modifier.size(18.dp))
            Text(if (m.writing) "Writing…" else "Write this week's now", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = c.accent)
        }
        m.note?.let { Text(it, fontSize = 13.sp, color = c.soft) }
        if (!m.loaded) {
            Box(Modifier.fillMaxWidth().padding(top = 30.dp), contentAlignment = Alignment.Center) { Spinner() }
        } else if (m.digests.isEmpty()) {
            Text("No digests yet.", color = c.faint, modifier = Modifier.padding(top = 20.dp))
        }
        m.digests.forEach { d ->
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                GroupCaption("${d.title} · ${d.saved} saved")
                GroupBox {
                    SelectionContainer {
                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            d.body.split("\n").map { it.trim() }.filter { it.isNotEmpty() }.forEach { p ->
                                Text(p, fontSize = 15.sp, lineHeight = 21.sp, color = c.ink)
                            }
                        }
                    }
                }
                val cited = d.items.withIndex().filter { it.value.deletedAt == null }
                if (cited.isNotEmpty()) {
                    GroupBox { cited.forEach { (n, item) -> MiniItemRow(item, n + 1) } }
                }
            }
        }
    }
}

// Ask Brain

class AnswerModel(question: String) : ViewModel() {
    var answer by mutableStateOf<Answer?>(null)
    var error by mutableStateOf<String?>(null)

    init {
        viewModelScope.launch {
            try {
                answer = Api.ask(question)
            } catch (_: SignedOutException) {
            } catch (e: Exception) {
                error = e.friendly()
            }
        }
    }
}

/** Ask a question of your own saves. The chosen AI answers from the closest ones and cites them as [1], [2] … */
@Composable
fun AnswerScreen(question: String) {
    val c = Theme.colors
    val m: AnswerModel = viewModel { AnswerModel(question) }
    MemoryPage("Ask Brain") {
        Text(question, fontSize = 20.sp, fontWeight = FontWeight.SemiBold, color = c.ink)
        val answer = m.answer
        val error = m.error
        if (answer != null) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.accentBG).padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(Icons.Outlined.AutoAwesome, null, tint = c.accent, modifier = Modifier.size(15.dp))
                    Text("From your saves", fontSize = 12.5.sp, fontWeight = FontWeight.Medium, color = c.accent)
                }
                SelectionContainer {
                    Text(
                        answer.answer ?: if (answer.sources.isEmpty()) "Nothing you've saved seems to be about that yet."
                        else "Add an AI key in Settings, AI to get written answers. These look closest:",
                        fontSize = 16.sp, lineHeight = 23.sp, color = c.ink,
                    )
                }
                answer.searched?.takeIf { it.isNotEmpty() }?.let {
                    Text("Looked for: " + it.joinToString(" · "), fontSize = 12.5.sp, color = c.soft)
                }
            }
            if (answer.sources.isNotEmpty()) {
                Column {
                    GroupCaption("Sources")
                    GroupBox { answer.sources.forEachIndexed { n, item -> MiniItemRow(item, n + 1) } }
                }
            }
        } else if (error != null) {
            Text(error, fontSize = 13.sp, color = c.bad)
        } else {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 10.dp)) {
                Spinner(18.dp)
                Text("Looking through your saves and linking them up…", color = c.soft)
            }
        }
    }
}

