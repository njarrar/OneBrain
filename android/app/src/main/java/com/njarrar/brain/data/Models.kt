package com.njarrar.brain.data

import kotlinx.serialization.Serializable
import java.time.Instant

@Serializable
data class Item(
    val id: String,
    val title: String? = null,
    val summary: String? = null,
    val body: String? = null,
    val note: String? = null,
    val url: String? = null,
    val kind: String = "note",
    val category: String? = null,
    val categoryColor: String? = null,
    val subtopic: String? = null,
    val lang: String? = null,
    val sensitive: Int? = null,
    val status: String = "inbox",
    val deletedAt: String? = null,
    val readAt: String? = null,
    val author: String? = null,
    val authorHandle: String? = null,
    val postedAt: String? = null,
    val createdAt: String = "",
    val media: List<String> = emptyList(),
    val images: List<String>? = null,
    val sources: List<String>? = null,
    val tags: List<String>? = null,
    /** When it comes back in Resurface. */
    val remindAt: String? = null,
    /** What was said in a voice memo or video, or the text in a picture. */
    val transcript: String? = null,
    /** The people and dates the AI found in it. */
    val facts: Facts? = null,
    /** Why it was kept: use, learn, buy, someone or idea. */
    val keptWhy: String? = null,
) {
    val isSensitive get() = (sensitive ?: 0) != 0
    val isUnread get() = readAt == null && deletedAt == null
    val inTrash get() = deletedAt != null
    val isArabic get() = lang == "ar"

    /** Files added to Brain first, then pictures that came with the post. */
    val pictures: List<String>
        get() = images.orEmpty().map { Config.fileUrl(it) } + media.filter { it.startsWith("http") }

    val mainText: String
        get() = title?.takeIf { it.isNotEmpty() } ?: body?.takeIf { it.isNotEmpty() } ?: url ?: "Untitled"

    val date: Instant? get() = Dates.parse(postedAt ?: createdAt)

    /** Where it came from, for the row's tile: the first source, or the kind for things added by hand. */
    val sourceKey: String
        get() {
            val s = sources?.firstOrNull() ?: "manual"
            if (s != "manual") return s
            return when (kind) {
                "image" -> "image"
                "note" -> "note"
                "video" -> "video"
                "audio" -> "audio"
                "email" -> "email"
                "pin" -> "pin"
                "file" -> "file"
                else -> if (url == null) "note" else "link"
            }
        }
}

@Serializable
data class ItemPage(
    val items: List<Item> = emptyList(),
    /** Counted on the first page only. */
    val total: Int? = null,
    /** Pass back for the next page; null on the last one. */
    val nextCursor: String? = null,
)

@Serializable
data class ItemDetail(
    val item: Item,
    val saves: List<Save> = emptyList(),
    val tags: List<Tag> = emptyList(),
    val files: List<FileRef> = emptyList(),
    /** Why the server couldn't hear or read this save, when it tried and failed. */
    val textError: String? = null,
) {
    @Serializable
    data class Save(
        val sourceId: String,
        val name: String,
        val savedAt: String? = null,
        val originalUrl: String? = null,
        val createdAt: String = "",
    )

    @Serializable
    data class Tag(val name: String, val addedBy: String = "user")

    @Serializable
    data class FileRef(val id: String, val filename: String = "", val mime: String = "") {
        private val ext: String get() = filename.substringAfterLast('.', "").lowercase()
        val isVideo: Boolean get() = mime.startsWith("video/") || (mime == "application/octet-stream" && ext in VIDEO_EXTENSIONS)
        val isSound: Boolean get() = isVideo || mime.startsWith("audio/") || (mime == "application/octet-stream" && ext in AUDIO_EXTENSIONS)
    }

    /** Voice memos and videos, to play. */
    val sounds: List<FileRef> get() = files.filter { it.isSound }

    companion object {
        private val VIDEO_EXTENSIONS = setOf("mp4", "mov", "m4v")
        private val AUDIO_EXTENSIONS = setOf("m4a", "mp3", "wav", "aac", "caf", "ogg", "oga", "opus", "flac", "webm", "3gp", "amr")
    }
}

/** The people and dates the AI found in a save. */
@Serializable
data class Facts(
    val people: List<Person> = emptyList(),
    val dates: List<Day> = emptyList(),
) {
    @Serializable
    data class Person(val name: String, val about: String = "")

    /** date is YYYY-MM-DD, or MM-DD when the year isn't known. */
    @Serializable
    data class Day(val date: String, val what: String = "", val person: String? = null, val yearly: Boolean = false)

    val isEmpty get() = people.isEmpty() && dates.isEmpty()

    companion object {
        private val months = listOf(
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December",
        )

        /** "14 March" or "14 March 1990". */
        fun dayLabel(date: String): String {
            val parts = date.split("-")
            if (parts.size < 2) return date
            val month = parts[parts.size - 2].toIntOrNull() ?: return date
            val day = parts[parts.size - 1].toIntOrNull() ?: return date
            if (month !in 1..12) return date
            return if (parts.size == 3) "$day ${months[month - 1]} ${parts[0]}" else "$day ${months[month - 1]}"
        }
    }
}

@Serializable
data class MenuData(
    val views: Views = Views(),
    val categories: List<Category> = emptyList(),
    val tags: List<TagCount> = emptyList(),
    val sources: List<SourceInfo> = emptyList(),
) {
    @Serializable
    data class Views(
        val inbox: Int = 0,
        val all: Int = 0,
        val archived: Int = 0,
        val media: Int = 0,
        val sensitive: Int = 0,
        val trash: Int? = null,
        val unread: Int? = null,
        val unsorted: Int? = null,
        /** Resurface cards waiting today. */
        val resurface: Int? = null,
        /** Saves left in the pile. */
        val pile: Int? = null,
    )

    @Serializable
    data class Category(val name: String, val color: String? = null, val count: Int = 0)

    @Serializable
    data class TagCount(val name: String, val count: Int = 0)
}

/** A source as the web app sees it. Sources connect once, on the web, and every device shares them. */
@Serializable
data class SourceInfo(
    val id: String,
    val name: String = "",
    val status: String = "",
    val lastSyncAt: String? = null,
    val lastError: String? = null,
    val items: Int = 0,
)

/** A Resurface card: a save coming back today, and why ("reminder" or "on_this_day"). */
data class ResurfaceCard(val item: Item, val reason: String) {
    val id get() = item.id
    val why: String
        get() = if (reason == "reminder") "You asked to see this again" else "From this day, ${Dates.short(item.date)}"
}

/** An answer from your own saves, citing them as [1], [2] … */
@Serializable
data class Answer(
    /** null without an AI key; the sources are still worth showing then. */
    val answer: String? = null,
    val sources: List<Item> = emptyList(),
    /** What Brain looked for to link saves up. */
    val searched: List<String>? = null,
)

/** One week's write-up of what was saved, with [n] pointing at items[n-1]. */
@Serializable
data class Digest(
    val weekStart: String,
    val body: String = "",
    val saved: Int = 0,
    val createdAt: String = "",
    val items: List<Item> = emptyList(),
) {
    val title: String
        get() {
            val d = runCatching { java.time.LocalDate.parse(weekStart) }.getOrNull() ?: return "Week of $weekStart"
            return "Week of " + d.format(java.time.format.DateTimeFormatter.ofPattern("MMMM d"))
        }
}

@Serializable
data class Digests(val made: Boolean? = null, val reason: String? = null, val digests: List<Digest> = emptyList())

/** Which web build is live. */
@Serializable
data class ServerBuild(val version: String = "", val commit: String = "", val builtAt: String? = null)

@Serializable
data class LinkPreview(val title: String? = null, val description: String? = null, val image: String? = null)

@Serializable
data class Prefs(val mode: String = "system")

@Serializable
data class Saved(val id: String = "", val existed: Boolean? = null)

/** Which AI does Brain's work, and which keys are saved (never the keys themselves). */
@Serializable
data class AIState(val provider: String = "", val providers: List<Provider> = emptyList()) {
    @Serializable
    data class Provider(
        val id: String,
        val name: String = "",
        val model: String = "",
        val defaultModel: String = "",
        val keyHint: String = "",
        val keyUrl: String = "",
        val last4: String? = null,
        val fromEnv: Boolean = false,
    ) {
        val hasKey get() = last4 != null || fromEnv
    }

    val current: Provider? get() = providers.firstOrNull { it.id == provider }
}

@Serializable
data class TestResult(val ok: Boolean = false, val message: String = "")

/** What the item list shows. Matches the web app's filters. Also the route of a list screen. */
@Serializable
data class Filter(
    /** inbox, all, archived or trash. */
    val view: String = "inbox",
    val category: String? = null,
    val tag: String? = null,
    val source: String? = null,
    val q: String? = null,
    /** with or without. */
    val media: String? = null,
    val lang: String? = null,
    val sensitive: Boolean = false,
    val unread: Boolean = false,
    val subtopic: String? = null,
) {
    val title: String
        get() = when {
            !q.isNullOrEmpty() -> "“$q”"
            subtopic != null -> subtopic
            category != null -> category
            tag != null -> "#$tag"
            source != null -> Sources.label(source)
            sensitive -> "Sensitive"
            media == "with" && view != "inbox" -> "With media"
            unread && view == "inbox" -> "Unread"
            view == "all" -> "All"
            view == "archived" -> "Archive"
            view == "trash" -> "Trash"
            else -> "Inbox"
        }

    val query: List<Pair<String, String>>
        get() {
            val out = mutableListOf("view" to view)
            fun add(name: String, value: String?) {
                if (!value.isNullOrEmpty()) out += name to value
            }
            add("category", category)
            add("subtopic", subtopic)
            add("tag", tag)
            add("source", source)
            add("q", q)
            add("media", media)
            add("lang", lang)
            if (sensitive) add("sensitive", "1")
            if (unread) add("unread", "1")
            return out
        }
}

/** Why a save was kept. Ask Brain, the digest and the podcast read it. */
enum class KeptWhy(val raw: String, val label: String) {
    Use("use", "To use"),
    Learn("learn", "To learn"),
    Buy("buy", "To buy"),
    Someone("someone", "For someone"),
    Idea("idea", "An idea");

    companion object {
        fun of(raw: String?): KeptWhy? = entries.firstOrNull { it.raw == raw }
    }
}

/** The next saves in the pile, oldest first, and how many are left. */
@Serializable
data class PilePage(val items: List<Item> = emptyList(), val left: Int = 0)

/** The topic map. x, y and r are on a 1000 by 1000 square, worked out by the server. */
@Serializable
data class TopicMap(val nodes: List<Node> = emptyList(), val links: List<Link> = emptyList(), val total: Int = 0) {
    @Serializable
    data class Sub(val name: String, val count: Int = 0)

    @Serializable
    data class Node(
        val name: String,
        val color: String? = null,
        val count: Int = 0,
        val x: Double = 0.0,
        val y: Double = 0.0,
        val r: Double = 0.0,
        val subtopics: List<Sub> = emptyList(),
    )

    @Serializable
    data class Link(val a: String, val b: String, val shared: Int = 0)
}

/** One podcast episode: two hosts talking through thirty days of saves. */
@Serializable
data class Podcast(
    val id: String,
    val title: String = "",
    val fromDay: String = "",
    val toDay: String = "",
    val seconds: Double? = null,
    val createdAt: String = "",
    val audio: String = "",
    val lines: List<Line> = emptyList(),
    val items: List<Save> = emptyList(),
) {
    @Serializable
    data class Line(val host: String = "", val text: String = "")

    @Serializable
    data class Save(val id: String, val title: String = "", val category: String? = null)

    val span: String
        get() {
            val f = java.time.format.DateTimeFormatter.ofPattern("MMM d")
            fun day(s: String) = runCatching { java.time.LocalDate.parse(s).format(f) }.getOrDefault(s)
            return "${day(fromDay)} to ${day(toDay)}"
        }
}

@Serializable
data class Made(val made: Boolean = false, val reason: String? = null)
