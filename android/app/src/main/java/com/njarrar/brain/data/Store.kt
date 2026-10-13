package com.njarrar.brain.data

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/** Light, dark, or follow the phone. Syncs with the web. */
enum class Mode(val raw: String, val label: String) {
    System("system", "System"), Light("light", "Light"), Dark("dark", "Dark");

    companion object {
        fun of(raw: String?) = entries.firstOrNull { it.raw == raw } ?: System
    }
}

/** The phone's own settings: look, server, blur and recent questions. */
object Store {
    private lateinit var prefs: SharedPreferences

    var mode by mutableStateOf(Mode.System)
        private set
    var server by mutableStateOf(Config.DEFAULT_SERVER)
        private set
    var blur by mutableStateOf(true)
        private set
    var recent by mutableStateOf(listOf<String>())
        private set

    fun init(context: Context) {
        prefs = context.getSharedPreferences("brain", Context.MODE_PRIVATE)
        mode = Mode.of(prefs.getString("mode", null))
        server = prefs.getString("server", null) ?: Config.DEFAULT_SERVER
        blur = prefs.getBoolean("blurSensitive", true)
        recent = prefs.getString("recentQuestions", "").orEmpty().split("\n").filter { it.isNotBlank() }
    }

    fun saveMode(m: Mode) {
        mode = m
        prefs.edit().putString("mode", m.raw).apply()
    }

    fun saveServer(url: String) {
        server = url.trim().trimEnd('/').ifEmpty { Config.DEFAULT_SERVER }
        prefs.edit().putString("server", server).apply()
    }

    fun saveBlur(on: Boolean) {
        blur = on
        prefs.edit().putBoolean("blurSensitive", on).apply()
    }

    /** The last five questions, newest first. */
    fun remember(question: String) {
        recent = (listOf(question) + recent.filter { it != question }).take(5)
        prefs.edit().putString("recentQuestions", recent.joinToString("\n")).apply()
    }
}
