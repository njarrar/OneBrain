package com.njarrar.brain.data

/** Where the web app lives. Settings can point the app at another server. */
object Config {
    /** The web app. Same default as the iPhone app. */
    const val DEFAULT_SERVER = "https://brain.example.workers.dev"
    /** The web page hands the key back through brain://paired?token=… */
    const val CALLBACK_SCHEME = "brain"

    val baseUrl: String get() = Store.server.trimEnd('/')

    /** One of Brain's own files, such as a picture added by hand. */
    fun fileUrl(id: String) = "$baseUrl/files/$id"

    /** The host of the web app, to tell its pictures (which need the key) from others. */
    val host: String? get() = runCatching { java.net.URI(baseUrl).host }.getOrNull()
}
