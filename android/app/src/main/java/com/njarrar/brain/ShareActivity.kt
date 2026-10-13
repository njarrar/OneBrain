package com.njarrar.brain

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.GraphicEq
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.IntentCompat
import com.njarrar.brain.data.Api
import com.njarrar.brain.data.Detected
import com.njarrar.brain.data.KeyStore
import com.njarrar.brain.data.PickedAudio
import com.njarrar.brain.data.Pictures
import com.njarrar.brain.data.SaveOptions
import com.njarrar.brain.data.Sources
import com.njarrar.brain.data.friendly
import com.njarrar.brain.data.mimeOf
import com.njarrar.brain.data.parseTags
import com.njarrar.brain.ui.CaptureChips
import com.njarrar.brain.ui.SourceMark
import com.njarrar.brain.ui.Spinner
import com.njarrar.brain.ui.theme.BrainTheme
import com.njarrar.brain.ui.theme.Theme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * "Save to Brain" in the share sheet. Takes a link (Chrome, Instagram, X), text, up to ten
 * pictures, each saved as its own item, or a voice memo or video, which the server writes out in full.
 */
class ShareActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val shared = Shared.read(this, intent)
        setContent {
            BrainTheme { ShareSheet(shared, onClose = { finish() }) }
        }
    }
}

/** What another app shared: its text and title, any link, pictures (as their addresses) and one sound or video. */
class Shared(
    val url: String?,
    val title: String?,
    val text: String?,
    val images: List<Uri>,
    val media: Uri?,
) {
    val isEmpty get() = url == null && title == null && text == null && images.isEmpty() && media == null

    companion object {
        /** Matches the iPhone's limit. */
        const val MAX_IMAGES = 10

        fun read(context: Context, intent: Intent?): Shared {
            val texts = mutableListOf<String>()
            val streams = mutableListOf<Uri>()
            if (intent != null) {
                listOf(intent.getStringExtra(Intent.EXTRA_SUBJECT), intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString())
                    .mapNotNull { it?.trim()?.takeIf { t -> t.isNotEmpty() } }
                    .forEach { texts += it }
                when (intent.action) {
                    Intent.ACTION_SEND ->
                        IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)?.let { streams += it }
                    Intent.ACTION_SEND_MULTIPLE ->
                        IntentCompat.getParcelableArrayListExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)?.let { streams += it }
                }
            }
            // Sound and video first; only one goes along.
            var media: Uri? = null
            val images = mutableListOf<Uri>()
            for (u in streams) {
                val mime = mimeOf(context, u) ?: intent?.type.orEmpty()
                when {
                    media == null && (mime.startsWith("audio/") || mime.startsWith("video/")) -> media = u
                    mime.startsWith("image/") && images.size < MAX_IMAGES -> images += u
                }
            }

            // X and others often share the text of a post with its link inside.
            val url = if (images.isEmpty()) texts.firstNotNullOfOrNull { Detected.firstUrl(it) } else null
            // With a link, one short line without a link of its own is the page title; anything else is kept as text.
            var title: String? = null
            val kept = mutableListOf<String>()
            for (t in texts.distinct()) {
                if (t == url) continue
                val oneLine = '\n' !in t && t.length <= 200 && Detected.firstUrl(t) == null
                val t0 = title
                if (url != null && t0 == null && oneLine) {
                    title = t
                } else if (!(t0 != null && t.contains(t0) && t.length < t0.length + 4)) {
                    kept += t
                }
            }
            return Shared(url, title, kept.takeIf { it.isNotEmpty() }?.joinToString("\n\n"), images, media)
        }
    }
}

private sealed class ShareState {
    data object Ready : ShareState()
    data class Saving(val done: Int, val of: Int) : ShareState()
    data object Saved : ShareState()
    data class Failed(val message: String) : ShareState()
}

/** Save to Brain, from the share sheet in any app: what's being saved, a note, and one Save button. */
@Composable
private fun ShareSheet(shared: Shared, onClose: () -> Unit) {
    val c = Theme.colors
    val context = androidx.compose.ui.platform.LocalContext.current
    val scope = rememberCoroutineScope()
    var state by remember {
        mutableStateOf<ShareState>(
            when {
                shared.isEmpty -> ShareState.Failed("Nothing to save here.")
                KeyStore.token == null -> ShareState.Failed("Open Brain and sign in first.")
                else -> ShareState.Ready
            },
        )
    }
    var note by remember { mutableStateOf("") }
    var sort by remember { mutableStateOf(true) }
    var tagging by remember { mutableStateOf(false) }
    var tagText by remember { mutableStateOf("") }
    val canSave = when (state) {
        ShareState.Ready -> true
        // After a failed save, try again; not when there's nothing to save or no sign in.
        is ShareState.Failed -> KeyStore.token != null && !shared.isEmpty
        else -> false
    }

    fun save() {
        scope.launch {
            val extra = note.trim()
            val options = SaveOptions(sort = sort, tags = if (tagging) parseTags(tagText) else emptyList())
            try {
                if (shared.media != null) {
                    // The memo is the item; a note typed here goes with it. The words the app shared
                    // (often just the file's name) become the note only when nothing was typed.
                    state = ShareState.Saving(0, 1)
                    val audio = withContext(Dispatchers.IO) { PickedAudio.from(context, shared.media) }
                        ?: throw IllegalStateException(
                            if ((com.njarrar.brain.data.sizeOf(context, shared.media) ?: 0L) > PickedAudio.MAX_BYTES)
                                "That file is too big. Brain takes up to 20 MB."
                            else "Couldn't read that file.",
                        )
                    Api.saveFile(audio.data, audio.filename, audio.mime, extra.ifEmpty { shared.text }, options)
                } else if (shared.url == null && shared.images.isNotEmpty()) {
                    // Each picture becomes its own item, with the note on each.
                    val caption = extra.ifEmpty { shared.text }
                    shared.images.forEachIndexed { i, u ->
                        state = ShareState.Saving(i, shared.images.size)
                        val jpeg = withContext(Dispatchers.IO) { Pictures.jpeg(context, u) }
                            ?: throw IllegalStateException("Couldn't read that picture.")
                        Api.saveFile(jpeg, "shared-${i + 1}.jpg", "image/jpeg", caption, options)
                    }
                } else {
                    state = ShareState.Saving(0, 1)
                    val body = listOfNotNull(shared.text, extra.ifEmpty { null }).joinToString("\n\n")
                    Api.save(shared.url, body.ifEmpty { null }, if (shared.url == null) null else shared.title, options)
                }
                state = ShareState.Saved
                delay(700)
                onClose()
            } catch (e: Exception) {
                state = ShareState.Failed(e.friendly())
            }
        }
    }

    Box(
        Modifier.fillMaxSize()
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { onClose() },
        contentAlignment = Alignment.BottomCenter,
    ) {
        Column(
            Modifier.imePadding().navigationBarsPadding().padding(8.dp).fillMaxWidth()
                .shadow(16.dp, RoundedCornerShape(34.dp)).clip(RoundedCornerShape(34.dp)).background(c.bg)
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {}
                .padding(start = 18.dp, end = 18.dp, top = 10.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                Box(Modifier.width(36.dp).height(5.dp).clip(CircleShape).background(c.lineStrong))
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Image(
                    painterResource(R.drawable.ic_launcher_foreground), null,
                    modifier = Modifier.size(32.dp).clip(RoundedCornerShape(8.dp)).background(androidx.compose.ui.graphics.Color(0xFFE7ECEF)),
                )
                Text("Save to Brain", fontSize = 17.sp, fontWeight = FontWeight.SemiBold, color = c.ink, modifier = Modifier.weight(1f))
                Box(
                    Modifier.size(32.dp).clip(CircleShape).background(c.fill).clickable { onClose() },
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Outlined.Close, "Close", tint = c.soft, modifier = Modifier.size(16.dp)) }
            }
            when (val s = state) {
                ShareState.Saved -> Row(
                    Modifier.fillMaxWidth().heightIn(min = 80.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                ) {
                    Icon(Icons.Filled.CheckCircle, null, tint = c.ok)
                    Text(
                        "  " + when {
                            shared.media != null -> "Saved. Brain is listening to it now"
                            shared.url == null && shared.images.size > 1 -> "Saved ${shared.images.size} pictures"
                            else -> "Saved to your inbox"
                        },
                        fontSize = 17.sp, fontWeight = FontWeight.SemiBold, color = c.ok,
                    )
                }
                else -> {
                    if (s is ShareState.Failed) Text(s.message, color = c.bad, fontSize = 15.sp)
                    if (!shared.isEmpty && KeyStore.token != null) {
                        Preview(shared)
                        BasicTextField(
                            value = note, onValueChange = { note = it }, maxLines = 5,
                            textStyle = TextStyle(fontSize = 15.sp, color = c.ink), cursorBrush = SolidColor(c.accentFill),
                            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                            modifier = Modifier.fillMaxWidth().heightIn(min = 46.dp).clip(RoundedCornerShape(12.dp)).background(c.fill)
                                .padding(horizontal = 14.dp, vertical = 12.dp),
                            decorationBox = { inner ->
                                Box {
                                    if (note.isEmpty()) Text("Add a note (optional)", fontSize = 15.sp, color = c.faint)
                                    inner()
                                }
                            },
                        )
                        if (tagging) {
                            BasicTextField(
                                value = tagText, onValueChange = { tagText = it }, singleLine = true,
                                textStyle = TextStyle(fontSize = 15.sp, color = c.ink), cursorBrush = SolidColor(c.accentFill),
                                modifier = Modifier.fillMaxWidth().height(40.dp).clip(RoundedCornerShape(10.dp)).background(c.fill)
                                    .padding(horizontal = 12.dp, vertical = 10.dp),
                                decorationBox = { inner ->
                                    Box {
                                        if (tagText.isEmpty()) Text("Tags, split with commas", fontSize = 15.sp, color = c.faint)
                                        inner()
                                    }
                                },
                            )
                        }
                        CaptureChips(sort, { sort = it }, tagging, { tagging = it })
                        if (s is ShareState.Saving && s.of > 1) {
                            Text("Saving ${s.done + 1} of ${s.of}", fontSize = 13.sp, color = c.soft)
                            LinearProgressIndicator(
                                progress = { s.done.toFloat() / s.of }, modifier = Modifier.fillMaxWidth(),
                                color = c.accentFill, trackColor = c.fill,
                            )
                        }
                        Box(
                            Modifier.fillMaxWidth().height(52.dp).clip(CircleShape).background(c.accentFill)
                                .clickable(enabled = canSave) { save() },
                            contentAlignment = Alignment.Center,
                        ) {
                            if (s is ShareState.Saving) Spinner(20.dp, c.accentInk)
                            else Text("Save to inbox", fontSize = 17.sp, fontWeight = FontWeight.SemiBold, color = c.accentInk)
                        }
                    }
                }
            }
        }
    }
}

/** The post or page being shared, or the pictures, or the sound. */
@Composable
private fun Preview(shared: Shared) {
    val c = Theme.colors
    val context = androidx.compose.ui.platform.LocalContext.current
    val box = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).border(1.dp, c.line, RoundedCornerShape(14.dp))
    when {
        shared.media != null -> Row(
            box.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(Icons.Outlined.GraphicEq, null, tint = c.accent)
            Column(Modifier.weight(1f)) {
                Text(
                    com.njarrar.brain.data.nameOf(context, shared.media) ?: "Voice memo", fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold, color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
                Text("Brain keeps the sound, writes it out and picks out names and dates.", fontSize = 12.sp, color = c.faint)
            }
        }
        shared.url == null && shared.images.isNotEmpty() -> {
            var thumb by remember { mutableStateOf<androidx.compose.ui.graphics.ImageBitmap?>(null) }
            LaunchedEffect(shared.images.first()) {
                thumb = withContext(Dispatchers.IO) {
                    Pictures.jpeg(context, shared.images.first())?.let { Pictures.thumbnail(it, 600) }?.asImageBitmap()
                }
            }
            Box(Modifier.fillMaxWidth().height(160.dp).clip(RoundedCornerShape(14.dp)).background(c.raised)) {
                thumb?.let { Image(it, null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
                if (shared.images.size > 1) {
                    Text(
                        "${shared.images.size} pictures, each saved on its own", fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                        color = c.accentInk,
                        modifier = Modifier.align(Alignment.TopEnd).padding(8.dp).clip(CircleShape).background(c.accentFill)
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                }
            }
        }
        else -> {
            val source = shared.url?.let { Detected.sourceOf(it) } ?: "note"
            val host = shared.url?.let { Detected.hostOf(it) }?.ifEmpty { null }
            Column(box.padding(horizontal = 14.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    SourceMark(source, 15.dp)
                    Text(
                        shared.title ?: Sources.label(source), fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = c.ink,
                        maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false),
                    )
                    host?.let { Text(it, fontSize = 12.sp, fontFamily = FontFamily.Monospace, color = c.faint, maxLines = 1) }
                }
                (shared.text ?: shared.url)?.let {
                    Text(it, fontSize = 15.sp, lineHeight = 20.sp, color = c.ink2, maxLines = 3, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}
