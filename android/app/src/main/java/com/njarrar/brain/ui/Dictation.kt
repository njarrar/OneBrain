package com.njarrar.brain.ui

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat

/** Turns speech into text as you talk, for the search and Ask fields. Uses the phone's own speech recognizer. */
class Dictation(private val context: Context) {
    var listening by mutableStateOf(false)
        private set
    var text by mutableStateOf("")
        private set
    var error by mutableStateOf<String?>(null)

    /** Called with the words once you stop talking. */
    var onDone: (String) -> Unit = {}
    internal var askPermission: () -> Unit = {}
    private var recognizer: SpeechRecognizer? = null

    fun toggle() = if (listening) stop() else start()

    fun start() {
        error = null
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            askPermission()
            return
        }
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            error = "Speech recognition isn't available on this phone."
            return
        }
        text = ""
        val r = recognizer ?: SpeechRecognizer.createSpeechRecognizer(context).also { recognizer = it }
        r.setRecognitionListener(listener)
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        listening = true
        r.startListening(intent)
    }

    fun stop() {
        recognizer?.stopListening()
    }

    fun destroy() {
        recognizer?.destroy()
        recognizer = null
        listening = false
    }

    private fun words(results: Bundle?): String? =
        results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.takeIf { it.isNotBlank() }

    private val listener = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {}
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) {}
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() {}
        override fun onEvent(eventType: Int, params: Bundle?) {}

        override fun onPartialResults(partialResults: Bundle?) {
            words(partialResults)?.let { text = it }
        }

        override fun onResults(results: Bundle?) {
            words(results)?.let { text = it }
            listening = false
            if (text.isNotBlank()) onDone(text)
        }

        override fun onError(code: Int) {
            listening = false
            error = when (code) {
                SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> if (text.isBlank()) "Didn't catch that. Try again." else null
                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Brain needs the microphone. Allow it in Settings, Apps, Brain."
                SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Speech recognition needs a connection."
                else -> "Speech recognition stopped. Try again."
            }
            if (text.isNotBlank()) onDone(text)
        }
    }
}

/** A Dictation for this screen, which asks for the microphone the first time. */
@Composable
fun rememberDictation(onDone: (String) -> Unit): Dictation {
    val context = LocalContext.current
    val d = remember { Dictation(context.applicationContext) }
    val latest by rememberUpdatedState(onDone)
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) d.start() else d.error = "Brain needs the microphone. Allow it in Settings, Apps, Brain."
    }
    d.askPermission = { ask.launch(Manifest.permission.RECORD_AUDIO) }
    d.onDone = { latest(it) }
    DisposableEffect(d) { onDispose { d.destroy() } }
    return d
}
