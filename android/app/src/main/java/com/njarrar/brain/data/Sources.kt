package com.njarrar.brain.data

import java.net.URI

object Sources {
    private val labels = mapOf(
        "x" to "X", "youtube" to "YouTube", "instagram" to "Instagram", "photos" to "Screenshots", "feedly" to "RSS",
        "gmail" to "Gmail", "outlook" to "Outlook", "pinterest" to "Pinterest", "email" to "Email", "pin" to "Pins",
        "manual" to "Added by hand", "image" to "Pictures", "note" to "Notes", "link" to "Links", "video" to "Videos",
        "audio" to "Voice memos",
    )

    fun label(id: String): String = labels[id] ?: id
}

/** What a typed or shared text holds, for the badge in the Add sheet. */
sealed class Detected {
    data class Link(val site: String) : Detected()
    data object Note : Detected()
    data class Pictures(val count: Int) : Detected()
    data object Voice : Detected()
    data object Empty : Detected()

    val label: String
        get() = when (this) {
            is Link -> if (site == "link") "Link" else Sources.label(site)
            Note -> "Note"
            is Pictures -> if (count == 1) "Photo" else "$count photos"
            Voice -> "Voice memo"
            Empty -> ""
        }

    val source: String
        get() = when (this) {
            is Link -> site
            Note -> "note"
            is Pictures -> "image"
            Voice -> "audio"
            Empty -> "note"
        }

    companion object {
        private val urlPattern = Regex("""https?://[^\s<>"']+""")

        fun of(text: String, url: String?, pictures: Int, voice: Boolean = false): Detected = when {
            pictures > 0 -> Pictures(pictures)
            voice -> Voice
            url != null -> Link(sourceOf(url))
            text.isBlank() -> Empty
            else -> Note
        }

        /** Same rules as the server's save route. */
        fun sourceOf(url: String): String {
            val host = hostOf(url).lowercase()
            return when {
                host.endsWith("instagram.com") -> "instagram"
                host.endsWith("youtube.com") || host == "youtu.be" -> "youtube"
                host == "x.com" || host == "twitter.com" || host.endsWith(".x.com") || host.endsWith(".twitter.com") -> "x"
                else -> "link"
            }
        }

        /** "example.com", without www. */
        fun hostOf(url: String): String =
            runCatching { URI(url).host }.getOrNull().orEmpty().removePrefix("www.")

        /** The first web link in some text. */
        fun firstUrl(text: String): String? = urlPattern.find(text)?.value
    }
}

/** Tags typed as "a, b, #c" into a clean list. */
fun parseTags(text: String): List<String> =
    text.split(',', '\n').map { it.trim().trim('#').trim() }.filter { it.isNotEmpty() }
