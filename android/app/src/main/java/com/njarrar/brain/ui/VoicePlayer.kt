package com.njarrar.brain.ui

import android.content.Context
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.os.Build
import android.widget.MediaController
import android.widget.VideoView
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.outlined.GraphicEq
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.njarrar.brain.data.Api
import com.njarrar.brain.data.ItemDetail
import com.njarrar.brain.ui.theme.Theme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/** "1:05". */
fun clock(seconds: Int): String = "%d:%02d".format(seconds / 60, seconds % 60)

/** Loads one of Brain's files into a copy on the phone, once, so a player can read it. */
private suspend fun localCopy(context: Context, file: ItemDetail.FileRef): File {
    val ext = file.filename.substringAfterLast('.', "").ifEmpty { if (file.mime.startsWith("video/")) "mp4" else "m4a" }
    val out = File(context.cacheDir, "brain-${file.id}.$ext")
    if (out.exists() && out.length() > 0) return out
    val data = Api.fileBytes(file.id)
    withContext(Dispatchers.IO) { out.writeBytes(data) }
    return out
}

/** Plays a voice memo or video saved in Brain. The file needs the key, so it is loaded first. */
@Composable
fun VoicePlayer(file: ItemDetail.FileRef) {
    if (file.mime.startsWith("video/")) VideoPlayer(file) else AudioPlayer(file)
}

@Composable
private fun AudioPlayer(file: ItemDetail.FileRef) {
    val c = Theme.colors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var player by remember { mutableStateOf<MediaPlayer?>(null) }
    var playing by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }
    var length by remember { mutableIntStateOf(0) }
    var at by remember { mutableIntStateOf(0) }

    DisposableEffect(file.id) {
        onDispose {
            player?.release()
            player = null
        }
    }
    // The time, while it plays.
    LaunchedEffect(playing) {
        while (playing) {
            at = (player?.currentPosition ?: 0) / 1000
            delay(250)
        }
    }

    fun toggle() {
        val p = player
        if (p != null) {
            if (p.isPlaying) p.pause() else p.start()
            playing = p.isPlaying
            return
        }
        loading = true
        scope.launch {
            try {
                val local = localCopy(context, file)
                val mp = MediaPlayer()
                mp.setDataSource(local.absolutePath)
                withContext(Dispatchers.IO) { mp.prepare() }
                mp.setOnCompletionListener {
                    playing = false
                    it.seekTo(0)
                    at = 0
                }
                length = mp.duration / 1000
                player = mp
                mp.start()
                playing = true
                failed = false
            } catch (e: Exception) {
                failed = true
            }
            loading = false
        }
    }

    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).border(1.dp, c.line, RoundedCornerShape(12.dp)).padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            Modifier.size(40.dp).clip(CircleShape).background(c.accentFill).clickable(enabled = !loading) { toggle() },
            contentAlignment = Alignment.Center,
        ) {
            if (loading) Spinner(18.dp, c.accentInk)
            else Icon(if (playing) Icons.Filled.Pause else Icons.Filled.PlayArrow, if (playing) "Pause" else "Play", tint = c.accentInk)
        }
        Column(Modifier.weight(1f)) {
            Text("Voice memo", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = c.ink)
            Text(
                when {
                    failed -> "Couldn't load the sound."
                    length > 0 -> if (playing || at > 0) "${clock(at)} / ${clock(length)}" else clock(length)
                    else -> file.filename
                },
                fontSize = 12.sp, fontFamily = FontFamily.Monospace, color = if (failed) c.bad else c.faint, maxLines = 1,
            )
        }
        Icon(Icons.Outlined.GraphicEq, null, tint = c.faint)
    }
}

@Composable
private fun VideoPlayer(file: ItemDetail.FileRef) {
    val c = Theme.colors
    val context = LocalContext.current
    var path by remember { mutableStateOf<String?>(null) }
    var failed by remember { mutableStateOf(false) }
    LaunchedEffect(file.id) {
        try {
            path = localCopy(context, file).absolutePath
        } catch (e: Exception) {
            failed = true
        }
    }
    Box(
        Modifier.fillMaxWidth().aspectRatio(16f / 9f).clip(RoundedCornerShape(14.dp)).background(c.raised),
        contentAlignment = Alignment.Center,
    ) {
        val p = path
        when {
            failed -> Text("Couldn't load the video.", fontSize = 13.sp, color = c.bad)
            p == null -> Spinner()
            else -> AndroidView(
                factory = { ctx ->
                    VideoView(ctx).apply {
                        val controls = MediaController(ctx)
                        controls.setAnchorView(this)
                        setMediaController(controls)
                        setVideoPath(p)
                        setOnPreparedListener { seekTo(1) }
                    }
                },
                onRelease = { it.stopPlayback() },
                modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f),
            )
        }
    }
}

/** Records a voice memo as an m4a file, for the Add sheet. The server writes it out in full. */
class Recorder(private val context: Context) {
    var recording by mutableStateOf(false)
        private set
    /** The memo from the last recording, once stopped. */
    var file by mutableStateOf<File?>(null)
        private set
    var seconds by mutableIntStateOf(0)
    private var recorder: MediaRecorder? = null
    private var startedAt = 0L

    fun start(): Boolean {
        discard()
        val out = File(context.cacheDir, "memo-${System.currentTimeMillis()}.m4a")
        val r = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(context) else @Suppress("DEPRECATION") MediaRecorder()
        return try {
            r.setAudioSource(MediaRecorder.AudioSource.MIC)
            r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            r.setAudioEncodingBitRate(96_000)
            r.setAudioSamplingRate(44_100)
            r.setOutputFile(out.absolutePath)
            r.prepare()
            r.start()
            recorder = r
            file = out
            startedAt = System.currentTimeMillis()
            seconds = 0
            recording = true
            true
        } catch (e: Exception) {
            r.release()
            out.delete()
            false
        }
    }

    /** Called every so often while recording, for the clock. */
    fun tick() {
        if (recording) seconds = ((System.currentTimeMillis() - startedAt) / 1000).toInt()
    }

    fun stop() {
        val r = recorder ?: return
        recorder = null
        recording = false
        try {
            r.stop()
        } catch (e: RuntimeException) {
            // Stopped before any sound was kept.
            file?.delete()
            file = null
        }
        r.release()
    }

    fun discard() {
        if (recording) stop()
        file?.delete()
        file = null
        seconds = 0
    }
}
