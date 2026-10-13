package com.njarrar.brain.data

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement

/** Reads the server's JSON like the iPhone does: unknown keys are skipped, snake_case keys become camelCase. */
val BrainJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    coerceInputValues = true
    isLenient = true
}

fun camelKeys(e: JsonElement): JsonElement = when (e) {
    is JsonObject -> JsonObject(e.entries.associate { (k, v) -> camel(k) to camelKeys(v) })
    is JsonArray -> JsonArray(e.map { camelKeys(it) })
    else -> e
}

private fun camel(key: String): String {
    if ('_' !in key) return key
    val parts = key.split('_').filter { it.isNotEmpty() }
    if (parts.isEmpty()) return key
    return parts.first() + parts.drop(1).joinToString("") { p -> p.replaceFirstChar { it.uppercaseChar() } }
}

/** Parses a response, with its keys made camelCase. */
fun parse(text: String): JsonElement = camelKeys(BrainJson.parseToJsonElement(text))

inline fun <reified T> decode(text: String): T = BrainJson.decodeFromJsonElement(parse(text))

inline fun <reified T> decode(e: JsonElement): T = BrainJson.decodeFromJsonElement(e)
