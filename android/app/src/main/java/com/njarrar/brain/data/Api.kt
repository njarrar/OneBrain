package com.njarrar.brain.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.net.UnknownHostException
import java.time.Instant
import java.util.concurrent.TimeUnit

/** The key is gone or no longer works. */
class SignedOutException : Exception("Sign in again.")

/** The server said no, with its reason. */
class ServerException(message: String) : Exception(message)

/** A plain-words message for an error. */
fun Throwable.friendly(): String = when (this) {
    is UnknownHostException -> "No connection. Check the internet and try again."
    is IOException -> "Couldn't reach Brain. Try again."
    else -> message ?: "Something went wrong."
}

/** How a save is handled: sort false skips the AI's sorting; tags are added at once. */
data class SaveOptions(val sort: Boolean = true, val tags: List<String> = emptyList())

/** One change to an item. Only the fields that change go out; the server refuses unknown ones. */
data class Change(
    val status: String? = null,
    /** true marks read, false unread. */
    val read: Boolean? = null,
    /** true moves to Trash, false brings back. */
    val trash: Boolean? = null,
    val category: String? = null,
    /** true sends category: null, which clears the category. */
    val clearCategory: Boolean = false,
    val note: String? = null,
    val addTags: List<String>? = null,
    val removeTags: List<String>? = null,
    /** When the item comes back in Resurface. */
    val remindAt: Instant? = null,
    /** true sends remindAt: null, which clears the reminder. */
    val clearReminder: Boolean = false,
) {
    fun json(): JsonObject = buildJsonObject {
        status?.let { put("status", it) }
        read?.let { put("read", it) }
        trash?.let { put("trash", it) }
        if (clearCategory) put("category", JsonNull) else category?.let { put("category", it) }
        note?.let { put("note", it) }
        addTags?.let { t -> put("addTags", JsonArray(t.map { JsonPrimitive(it) })) }
        removeTags?.let { t -> put("removeTags", JsonArray(t.map { JsonPrimitive(it) })) }
        if (clearReminder) put("remindAt", JsonNull) else remindAt?.let { put("remindAt", Dates.iso(it)) }
    }
}

/** Talks to the web app's /api/app routes with the app's key. */
object Api {
    private val jsonType = "application/json".toMediaType()

    val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS)
        .build()

    private fun url(path: String, query: List<Pair<String, String>> = emptyList()): HttpUrl {
        val b = "${Config.baseUrl}/$path".toHttpUrl().newBuilder()
        query.forEach { (k, v) -> b.addQueryParameter(k, v) }
        return b.build()
    }

    private fun request(
        path: String,
        query: List<Pair<String, String>> = emptyList(),
        method: String = "GET",
        body: RequestBody? = null,
    ): Request {
        val token = KeyStore.token ?: throw SignedOutException()
        return Request.Builder()
            .url(url(path, query))
            .header("Authorization", "Bearer $token")
            .method(method, body)
            .build()
    }

    private fun jsonBody(e: JsonElement): RequestBody = e.toString().toRequestBody(jsonType)

    private val empty: RequestBody get() = ByteArray(0).toRequestBody(jsonType)

    /** Sends a request and returns the body with camelCase keys. A 401 signs the phone out. */
    private suspend fun send(req: Request): JsonElement = withContext(Dispatchers.IO) {
        client.newCall(req).execute().use { res ->
            val text = res.body?.string().orEmpty()
            if (res.code == 401) {
                AppSession.signOut()
                throw SignedOutException()
            }
            if (!res.isSuccessful) {
                val message = runCatching {
                    BrainJson.parseToJsonElement(text).jsonObject["error"]?.jsonPrimitive?.contentOrNull
                }.getOrNull()
                throw ServerException(message ?: "Something went wrong (${res.code}).")
            }
            if (text.isBlank()) JsonObject(emptyMap()) else parse(text)
        }
    }

    // Items

    /** The first page, or the one after `cursor` (nextCursor from the page before). */
    suspend fun items(filter: Filter, cursor: String? = null): ItemPage {
        val more = cursor?.let { listOf("cursor" to it) } ?: emptyList()
        return decode(send(request("api/app/items", filter.query + more)))
    }

    suspend fun item(id: String): ItemDetail = decode(send(request("api/app/items/$id")))

    suspend fun change(id: String, change: Change): ItemDetail =
        decode(send(request("api/app/items/$id", method = "PATCH", body = jsonBody(change.json()))))

    /** Deletes an item for good. It must be in Trash. */
    suspend fun purge(id: String) {
        send(request("api/app/items/$id", method = "DELETE"))
    }

    /** Deletes everything in Trash for good. */
    suspend fun emptyTrash() {
        send(request("api/app/items", listOf("view" to "trash"), method = "DELETE"))
    }

    /** Hears or reads an item again from the start (voice memo, picture or note). */
    suspend fun reread(id: String): ItemDetail =
        decode(send(request("api/app/items/$id/read", method = "POST", body = empty)))

    /** Saves about the same thing as this one. Empty until the server has read it. */
    suspend fun related(id: String): List<Item> =
        decode(send(request("api/app/items/$id/related")).jsonObject["items"] ?: JsonArray(emptyList()))

    // Memory

    /** Today's Resurface cards. */
    suspend fun resurface(): List<ResurfaceCard> {
        val cards = send(request("api/app/resurface")).jsonObject["cards"]?.jsonArray ?: return emptyList()
        return cards.map { c ->
            val reason = c.jsonObject["reason"]?.jsonPrimitive?.contentOrNull ?: ""
            ResurfaceCard(decode<Item>(c), reason)
        }
    }

    /** Answers a card: keep (comes back later, then less often), later (tomorrow) or done. */
    suspend fun review(id: String, how: String) {
        send(request("api/app/resurface", method = "POST", body = jsonBody(buildJsonObject { put("id", id); put("how", how) })))
    }

    /** Asks a question of your own saves. */
    suspend fun ask(question: String): Answer =
        decode(send(request("api/app/ask", method = "POST", body = jsonBody(buildJsonObject { put("q", question) }))))

    /** The latest weekly digests. Reading never makes a new one. */
    suspend fun digests(): List<Digest> = decode<Digests>(send(request("api/app/digest"))).digests

    /** Asks the AI for this week's digest now. */
    suspend fun makeDigest(): Digests = decode(send(request("api/app/digest", method = "POST", body = empty)))

    // App

    suspend fun menu(): MenuData = decode(send(request("api/app/menu")))

    /** Which web build is live. */
    suspend fun serverBuild(): ServerBuild = decode(send(request("api/app/version")))

    /** A link's title and picture, for the Add sheet. */
    suspend fun unfurl(link: String): LinkPreview = decode(send(request("api/app/unfurl", listOf("url" to link))))

    /** Light, dark or system, shared with the web. */
    suspend fun prefs(): Prefs = decode(send(request("api/app/prefs")))

    suspend fun savePrefs(mode: Mode): Prefs =
        decode(send(request("api/app/prefs", method = "PUT", body = jsonBody(buildJsonObject { put("mode", mode.raw) }))))

    /** Sources as the web app sees them. */
    suspend fun sources(): List<SourceInfo> =
        decode(send(request("api/app/sources")).jsonObject["sources"] ?: JsonArray(emptyList()))

    // Saving

    /** A link or a note. title is a web page's own title, when the app shares one. */
    suspend fun save(url: String?, text: String?, title: String? = null, options: SaveOptions = SaveOptions()): Saved {
        val body = buildJsonObject {
            url?.let { put("url", it) }
            text?.let { put("text", it) }
            title?.let { put("title", it) }
            put("sort", options.sort)
            put("tags", JsonArray(options.tags.map { JsonPrimitive(it) }))
        }
        return decode(send(request("api/app/save", method = "POST", body = jsonBody(body))))
    }

    /** A picture, voice memo, video or other file. The server reads it, writes out what was said and pulls out names and dates. */
    suspend fun saveFile(
        data: ByteArray,
        filename: String,
        mime: String,
        text: String? = null,
        options: SaveOptions = SaveOptions(),
    ): Saved {
        val form = MultipartBody.Builder().setType(MultipartBody.FORM)
        text?.let { form.addFormDataPart("text", it) }
        if (!options.sort) form.addFormDataPart("sort", "0")
        if (options.tags.isNotEmpty()) form.addFormDataPart("tags", options.tags.joinToString(","))
        form.addFormDataPart("file", filename, data.toRequestBody(mime.toMediaType()))
        return decode(send(request("api/app/save", method = "POST", body = form.build())))
    }

    /** Loads one of Brain's own files, such as a voice memo, with the key. */
    suspend fun fileBytes(id: String): ByteArray = withContext(Dispatchers.IO) {
        val token = KeyStore.token ?: throw SignedOutException()
        val req = Request.Builder().url(Config.fileUrl(id)).header("Authorization", "Bearer $token").build()
        client.newCall(req).execute().use { res ->
            if (!res.isSuccessful) throw ServerException("File not found")
            res.body?.bytes() ?: throw ServerException("File not found")
        }
    }

    // AI

    suspend fun ai(): AIState = decode(send(request("api/app/ai")))

    /**
     * Changes the AI in use, one model name (modelOf) or one key (keyOf). With modelOf, a null model
     * goes back to the default; with keyOf, a null key removes it.
     */
    suspend fun setAI(
        provider: String? = null,
        modelOf: String? = null,
        model: String? = null,
        keyOf: String? = null,
        key: String? = null,
    ): AIState {
        val body = buildJsonObject {
            provider?.let { put("provider", it) }
            modelOf?.let { put("model", buildJsonObject { put("provider", it); put("name", model) }) }
            keyOf?.let { put("key", buildJsonObject { put("provider", it); put("value", key) }) }
        }
        return decode(send(request("api/app/ai", method = "PUT", body = jsonBody(body))))
    }

    suspend fun testAI(provider: String): TestResult =
        decode(send(request("api/app/ai/test", method = "POST", body = jsonBody(buildJsonObject { put("provider", provider) }))))
}
