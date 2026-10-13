package com.njarrar.brain.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import java.io.ByteArrayOutputStream

/**
 * Pictures made ready to upload: a JPEG no longer than 2048 pixels on its long side. Small enough
 * to upload fast, big enough for the AI to read a screenshot.
 */
object Pictures {
    private const val MAX = 2048

    fun jpeg(context: Context, uri: Uri): ByteArray? = runCatching {
        val resolver = context.contentResolver
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= MAX) sample *= 2
        val opts = BitmapFactory.Options().apply { inSampleSize = sample }
        var bitmap = resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) } ?: return null
        val long = maxOf(bitmap.width, bitmap.height)
        if (long > MAX) {
            val scale = MAX.toFloat() / long
            bitmap = Bitmap.createScaledBitmap(bitmap, (bitmap.width * scale).toInt(), (bitmap.height * scale).toInt(), true)
        }
        val degrees = resolver.openInputStream(uri)?.use { rotation(ExifInterface(it)) } ?: 0
        if (degrees != 0) {
            val m = Matrix().apply { postRotate(degrees.toFloat()) }
            bitmap = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, m, true)
        }
        ByteArrayOutputStream().use { out ->
            bitmap.compress(Bitmap.CompressFormat.JPEG, 80, out)
            out.toByteArray()
        }
    }.getOrNull()

    private fun rotation(exif: ExifInterface): Int =
        when (exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
            ExifInterface.ORIENTATION_ROTATE_90 -> 90
            ExifInterface.ORIENTATION_ROTATE_180 -> 180
            ExifInterface.ORIENTATION_ROTATE_270 -> 270
            else -> 0
        }

    /** A small picture for the Add sheet's strip. */
    fun thumbnail(data: ByteArray, size: Int = 256): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(data, 0, data.size, bounds)
        var sample = 1
        while (minOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= size) sample *= 2
        return BitmapFactory.decodeByteArray(data, 0, data.size, BitmapFactory.Options().apply { inSampleSize = sample })
    }
}

/** A voice memo or video to save: spoken in the Add sheet, picked from Files, or shared. */
class PickedAudio(val data: ByteArray, val filename: String, val mime: String) {
    companion object {
        /** Up to the server's 20 MB limit. */
        const val MAX_BYTES = 20 * 1024 * 1024

        /** Reads a sound or video file, or returns null for anything else (or a file that's too big). */
        fun from(context: Context, uri: Uri): PickedAudio? {
            val mime = mimeOf(context, uri) ?: return null
            if (!mime.startsWith("audio/") && !mime.startsWith("video/")) return null
            if ((sizeOf(context, uri) ?: 0L) > MAX_BYTES) return null
            val data = runCatching { context.contentResolver.openInputStream(uri)?.use { it.readBytes() } }.getOrNull() ?: return null
            if (data.size > MAX_BYTES) return null
            return PickedAudio(data, nameOf(context, uri) ?: "Voice memo", mime)
        }
    }
}

private val fallbackMimes = mapOf(
    "m4a" to "audio/mp4", "mp3" to "audio/mpeg", "wav" to "audio/wav", "aac" to "audio/aac",
    "caf" to "audio/x-caf", "ogg" to "audio/ogg", "oga" to "audio/ogg", "opus" to "audio/opus",
    "flac" to "audio/flac", "webm" to "audio/webm", "amr" to "audio/amr", "3gp" to "video/3gpp",
    "mp4" to "video/mp4", "mov" to "video/quicktime", "m4v" to "video/x-m4v",
    "jpg" to "image/jpeg", "jpeg" to "image/jpeg", "png" to "image/png", "webp" to "image/webp",
    "gif" to "image/gif", "heic" to "image/heic", "heif" to "image/heif",
)

/** A shared or picked file's type, from the app that has it or from its name. */
fun mimeOf(context: Context, uri: Uri): String? {
    val reported = context.contentResolver.getType(uri)?.takeIf { it != "application/octet-stream" }
    if (reported != null) return reported
    val name = nameOf(context, uri).orEmpty()
    val ext = name.substringAfterLast('.', "").ifEmpty { MimeTypeMap.getFileExtensionFromUrl(uri.toString()) }.lowercase()
    if (ext.isEmpty()) return context.contentResolver.getType(uri)
    return MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: fallbackMimes[ext]
}

fun nameOf(context: Context, uri: Uri): String? = runCatching {
    context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
        if (c.moveToFirst()) c.getString(0) else null
    }
}.getOrNull() ?: uri.lastPathSegment

fun sizeOf(context: Context, uri: Uri): Long? = runCatching {
    context.contentResolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { c ->
        if (c.moveToFirst() && !c.isNull(0)) c.getLong(0) else null
    }
}.getOrNull()
