package com.njarrar.brain.ui

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.outlined.AttachFile
import androidx.compose.material.icons.outlined.GraphicEq
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material.icons.outlined.Photo
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import coil.compose.AsyncImage
import com.njarrar.brain.data.Api
import com.njarrar.brain.data.Detected
import com.njarrar.brain.data.LinkPreview
import com.njarrar.brain.data.PickedAudio
import com.njarrar.brain.data.Pictures
import com.njarrar.brain.data.SaveOptions
import com.njarrar.brain.data.friendly
import com.njarrar.brain.data.mimeOf
import com.njarrar.brain.data.parseTags
import com.njarrar.brain.ui.theme.Theme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

private const val MAX_PICTURES = 10

/** A picture ready to upload, with a small copy for the strip. */
private class Picked(val jpeg: ByteArray) {
    val thumb = Pictures.thumbnail(jpeg)?.asImageBitmap()
}

/**
 * Add to Brain: one field for a link or a note, plus photos, the camera, a voice memo and files.
 * A voice memo is kept as sound: Brain writes it out in full on the server and pulls out names and
 * dates, so what you said can be found and asked about later.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddSheet(onDismiss: () -> Unit, saved: suspend () -> Unit) {
    val c = Theme.colors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val focus = remember { FocusRequester() }

    var text by remember { mutableStateOf("") }
    var sort by remember { mutableStateOf(true) }
    var tagging by remember { mutableStateOf(false) }
    var tagText by remember { mutableStateOf("") }
    val pictures = remember { mutableStateListOf<Picked>() }
    var picked by remember { mutableStateOf<PickedAudio?>(null) }
    var preview by remember { mutableStateOf<LinkPreview?>(null) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val recorder = remember { Recorder(context.applicationContext) }
    val haptic = LocalHapticFeedback.current
    // The camera button only greys out on a phone with no camera at all.
    val hasCamera = remember { context.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY) }
    var cameraFile by remember { mutableStateOf<Uri?>(null) }

    val url = Detected.firstUrl(text)
    val hasVoice = (recorder.file != null && !recorder.recording) || picked != null
    val detected = Detected.of(text, url, pictures.size, hasVoice)
    val canSave = !saving && !recorder.recording && detected != Detected.Empty

    fun close() {
        scope.launch { sheet.hide() }.invokeOnCompletion { onDismiss() }
    }

    fun addPictures(uris: List<Uri>) {
        scope.launch {
            for (u in uris) {
                if (pictures.size >= MAX_PICTURES) break
                val jpeg = withContext(Dispatchers.IO) { Pictures.jpeg(context, u) }
                if (jpeg != null) pictures.add(Picked(jpeg))
            }
        }
    }

    val photos = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(MAX_PICTURES)) { uris ->
        addPictures(uris)
    }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val u = cameraFile
        if (ok && u != null) addPictures(listOf(u))
    }
    val files = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        scope.launch {
            for (u in uris) {
                val mime = mimeOf(context, u).orEmpty()
                if (mime.startsWith("audio/") || mime.startsWith("video/")) {
                    val a = withContext(Dispatchers.IO) { PickedAudio.from(context, u) }
                    if (a != null) {
                        picked = a
                    } else {
                        val tooBig = (com.njarrar.brain.data.sizeOf(context, u) ?: 0L) > PickedAudio.MAX_BYTES
                        error = if (tooBig) "That file is too big. Brain takes up to 20 MB." else "Couldn't read that file."
                    }
                } else if (mime.startsWith("image/")) {
                    addPictures(listOf(u))
                }
            }
        }
    }
    val mic = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) {
            if (!recorder.start()) error = "Couldn't start recording."
        } else {
            error = "Brain needs the microphone. Allow it in Settings, Apps, Brain."
        }
    }

    fun toggleRecording() {
        error = null
        when {
            recorder.recording -> recorder.stop()
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED ->
                if (!recorder.start()) error = "Couldn't start recording."
            else -> mic.launch(Manifest.permission.RECORD_AUDIO)
        }
    }

    fun openCamera() {
        val u = cameraUri(context)
        cameraFile = u
        try {
            camera.launch(u)
        } catch (e: Exception) {
            error = "No camera app on this phone."
        }
    }

    fun save() {
        recorder.stop()
        saving = true
        error = null
        scope.launch {
            val options = SaveOptions(sort = sort, tags = if (tagging) parseTags(tagText) else emptyList())
            val note = text.trim()
            try {
                val memo = picked ?: recorder.file?.let { f ->
                    PickedAudio(withContext(Dispatchers.IO) { f.readBytes() }, "Voice memo.m4a", "audio/mp4")
                }
                if (memo != null) {
                    // The server writes the memo out, so only what you typed goes along as a note.
                    Api.saveFile(memo.data, memo.filename, memo.mime, note.ifEmpty { null }, options)
                    recorder.discard()
                    picked = null
                }
                if (pictures.isNotEmpty()) {
                    // Each picture is its own save, with the text as its caption.
                    var n = 0
                    while (pictures.isNotEmpty()) {
                        n += 1
                        Api.saveFile(pictures.first().jpeg, "added-$n.jpg", "image/jpeg", note.ifEmpty { null }, options)
                        pictures.removeAt(0)
                    }
                } else if (memo == null || url != null) {
                    // A link or a note (a link typed beside a memo is saved as its own item too).
                    Api.save(url, note.ifEmpty { null }, options = options)
                }
                haptic.confirm()
                saved()
                close()
            } catch (e: Exception) {
                error = e.friendly()
            }
            saving = false
        }
    }

    LaunchedEffect(Unit) {
        delay(300)
        runCatching { focus.requestFocus() }
    }
    // A link's title and picture, a moment after it is typed.
    LaunchedEffect(url) {
        preview = null
        if (url == null) return@LaunchedEffect
        delay(400)
        preview = runCatching { Api.unfurl(url) }.getOrNull()
    }
    LaunchedEffect(recorder.recording) {
        while (recorder.recording) {
            recorder.tick()
            delay(250)
        }
    }
    DisposableEffect(Unit) { onDispose { recorder.stop() } }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheet,
        containerColor = c.bg,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
    ) {
        Column(
            Modifier.fillMaxWidth().imePadding().navigationBarsPadding().padding(start = 16.dp, end = 16.dp, bottom = 14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = { close() }) { Text("Cancel", color = c.ink2, fontSize = 16.sp) }
                Text(
                    "Add to Brain", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = c.ink,
                    modifier = Modifier.weight(1f), textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                )
                Box(
                    Modifier.heightIn(min = 34.dp).clip(CircleShape).background(c.accentFill).alpha(if (canSave || saving) 1f else 0.45f)
                        .clickable(enabled = canSave) { save() }.padding(horizontal = 14.dp, vertical = 6.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    if (saving) Spinner(16.dp, c.accentInk)
                    else Text("Save", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = c.accentInk)
                }
            }

            BasicTextField(
                value = text, onValueChange = { text = it },
                textStyle = TextStyle(fontSize = 17.sp, color = c.ink), cursorBrush = SolidColor(c.accentFill),
                maxLines = 8,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                modifier = Modifier.fillMaxWidth().heightIn(min = 32.dp).padding(vertical = 4.dp).focusRequester(focus),
                decorationBox = { inner ->
                    Box {
                        if (text.isEmpty()) Text("Paste a link or write a note", fontSize = 17.sp, color = c.faint)
                        inner()
                    }
                },
            )

            val p = preview
            if (url != null && p != null) LinkCard(url, p)
            if (pictures.isNotEmpty()) {
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    pictures.toList().forEach { pic ->
                        Box(Modifier.size(72.dp).clip(RoundedCornerShape(12.dp)).background(c.raised)) {
                            pic.thumb?.let { Image(it, null, contentScale = ContentScale.Crop, modifier = Modifier.size(72.dp)) }
                            Icon(
                                Icons.Filled.Cancel, "Remove picture", tint = Color.White,
                                modifier = Modifier.align(Alignment.TopEnd).padding(3.dp).size(20.dp)
                                    .clip(CircleShape).background(Color.Black.copy(alpha = 0.55f)).clickable { pictures.remove(pic) },
                            )
                        }
                    }
                }
            }
            if (recorder.recording || hasVoice) {
                VoiceChip(
                    title = when {
                        picked != null -> picked!!.filename
                        recorder.recording -> "Recording, ${clock(recorder.seconds)}"
                        else -> "Voice memo, ${clock(recorder.seconds)}"
                    },
                    recording = recorder.recording,
                    onRemove = { if (picked != null) picked = null else recorder.discard() },
                )
            }
            if (tagging) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Tags", fontSize = 13.sp, fontWeight = FontWeight.Medium, color = c.soft, modifier = Modifier.padding(start = 4.dp))
                    BasicTextField(
                        value = tagText, onValueChange = { tagText = it }, singleLine = true,
                        textStyle = TextStyle(fontSize = 15.sp, color = c.ink), cursorBrush = SolidColor(c.accentFill),
                        modifier = Modifier.fillMaxWidth().heightIn(min = 40.dp).clip(RoundedCornerShape(12.dp)).background(c.fill)
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        decorationBox = { inner ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text("#", fontSize = 15.sp, color = c.soft, modifier = Modifier.padding(end = 6.dp))
                                Box(Modifier.weight(1f)) {
                                    if (tagText.isEmpty()) Text("Tags, split with commas", fontSize = 15.sp, color = c.faint)
                                    inner()
                                }
                            }
                        },
                    )
                }
            }
            CaptureChips(sort, { sort = it }, tagging, { tagging = it })
            error?.let { Text(it, fontSize = 13.sp, color = c.bad) }

            RowDivider()
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                RoundIcon(Icons.Outlined.Photo, "Photos", enabled = pictures.size < MAX_PICTURES) {
                    photos.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                }
                RoundIcon(Icons.Outlined.PhotoCamera, "Camera", enabled = hasCamera && pictures.size < MAX_PICTURES) { openCamera() }
                RoundIcon(
                    if (recorder.recording) Icons.Filled.Stop else Icons.Outlined.Mic,
                    if (recorder.recording) "Stop" else "Record a voice memo",
                    on = recorder.recording,
                ) { toggleRecording() }
                RoundIcon(Icons.Outlined.AttachFile, "Files") { files.launch(arrayOf("image/*", "audio/*", "video/*")) }
                Spacer(Modifier.weight(1f))
                if (detected != Detected.Empty) {
                    Row(
                        Modifier.heightIn(min = 26.dp).clip(RoundedCornerShape(6.dp)).background(c.raised).padding(horizontal = 9.dp, vertical = 3.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        SourceMark(detected.source, 13.dp, c.soft)
                        Text(detected.label, fontSize = 12.5.sp, fontWeight = FontWeight.Medium, color = c.soft)
                    }
                }
            }
        }
    }
}

/** A file in the cache for the camera app to write the photo into. */
private fun cameraUri(context: Context): Uri {
    val dir = File(context.cacheDir, "camera").apply { mkdirs() }
    val file = File(dir, "photo-${System.currentTimeMillis()}.jpg")
    return FileProvider.getUriForFile(context, "${context.packageName}.files", file)
}

@Composable
private fun LinkCard(url: String, p: LinkPreview) {
    val c = Theme.colors
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).border(1.dp, c.line, RoundedCornerShape(12.dp)).padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        p.image?.let {
            AsyncImage(
                model = it, contentDescription = null, contentScale = ContentScale.Crop,
                modifier = Modifier.size(60.dp).clip(RoundedCornerShape(12.dp)).background(c.raised),
            )
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(p.title ?: url, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = c.ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(Detected.hostOf(url), fontSize = 12.sp, fontFamily = FontFamily.Monospace, color = c.faint, maxLines = 1)
        }
    }
}

@Composable
private fun VoiceChip(title: String, recording: Boolean, onRemove: () -> Unit) {
    val c = Theme.colors
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).border(1.dp, c.line, RoundedCornerShape(12.dp)).padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(Icons.Outlined.GraphicEq, null, tint = if (recording) c.bad else c.accent)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, fontSize = 15.sp, fontWeight = FontWeight.Medium, color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                if (recording) "Tap stop when you're done." else "Brain keeps the sound and writes it out in full.",
                fontSize = 12.sp, color = c.faint,
            )
        }
        if (!recording) {
            Icon(
                Icons.Filled.Cancel, "Remove voice memo", tint = c.faint,
                modifier = Modifier.size(22.dp).clip(CircleShape).clickable(onClick = onRemove),
            )
        }
    }
}
