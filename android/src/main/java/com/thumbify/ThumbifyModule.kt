package com.thumbify

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinitionBuilder
import java.io.File
import java.io.FileOutputStream
import kotlin.math.min
import kotlin.math.roundToInt

class ThumbifyModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("Thumbify")

        // ─── generate ─────────────────────────────────────────────────────────

        AsyncFunction("generate") { options: Map<String, Any?> ->
            val uri = options["uri"] as? String
            if (uri.isNullOrBlank()) throw Exception("INVALID_URI: uri is required and must be non-empty")

            val timeMs    = (options["timeMs"]    as? Double)?.toLong() ?: 0L
            val format    = options["format"]     as? String ?: "jpeg"
            val quality   = (options["quality"]   as? Double)?.toInt() ?: 80
            val maxWidth  = (options["maxWidth"]  as? Double)?.toInt() ?: 0
            val maxHeight = (options["maxHeight"] as? Double)?.toInt() ?: 0
            val cacheDir  = options["cacheDir"]   as? String
                ?: appContext.reactContext?.cacheDir?.absolutePath
                ?: ""
            val cacheFile = options["cacheFilename"] as? String ?: "thumb.jpg"

            @Suppress("UNCHECKED_CAST")
            val headers   = (options["headers"] as? Map<String, String>) ?: emptyMap()

            val outputFile = File(cacheDir, cacheFile)

            // Return cached file if it exists
            if (outputFile.exists() && outputFile.length() > 0) {
                val boundsOpts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeFile(outputFile.absolutePath, boundsOpts)
                return@AsyncFunction mapOf(
                    "path"   to outputFile.absolutePath,
                    "width"  to boundsOpts.outWidth.coerceAtLeast(0),
                    "height" to boundsOpts.outHeight.coerceAtLeast(0),
                    "size"   to outputFile.length().toInt(),
                )
            }

            ensureCacheDir(cacheDir)

            val retriever = MediaMetadataRetriever()
            try {
                setDataSource(retriever, uri, headers)

                val rawBitmap: Bitmap? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                    retriever.getScaledFrameAtTime(
                        timeMs * 1_000L,
                        MediaMetadataRetriever.OPTION_CLOSEST_SYNC,
                        if (maxWidth > 0) maxWidth else Int.MAX_VALUE,
                        if (maxHeight > 0) maxHeight else Int.MAX_VALUE,
                    )
                } else {
                    retriever.getFrameAtTime(timeMs * 1_000L, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
                }

                if (rawBitmap == null) {
                    throw Exception("DECODE_FAILED: MediaMetadataRetriever returned null frame at ${timeMs}ms")
                }

                val bitmap = if (maxWidth > 0 || maxHeight > 0) resize(rawBitmap, maxWidth, maxHeight) else rawBitmap
                val (compressFormat, _) = resolveFormat(format)

                outputFile.parentFile?.mkdirs()
                val thumbWidth  = bitmap.width
                val thumbHeight = bitmap.height

                FileOutputStream(outputFile).use { out -> bitmap.compress(compressFormat, quality, out) }

                if (bitmap !== rawBitmap) rawBitmap.recycle()
                bitmap.recycle()

                mapOf(
                    "path"   to outputFile.absolutePath,
                    "width"  to thumbWidth,
                    "height" to thumbHeight,
                    "size"   to outputFile.length().toInt(),
                )
            } catch (e: Exception) {
                throw Exception(mapError(e), e)
            } finally {
                retriever.release()
            }
        }

        // ─── clearCache ───────────────────────────────────────────────────────

        AsyncFunction("clearCache") { directory: String ->
            val dir = File(directory)
            if (dir.exists()) {
                dir.listFiles()
                    ?.filter { it.name.startsWith("thumbify_") }
                    ?.forEach { it.delete() }
            }
        }

        // ─── getCacheSize ─────────────────────────────────────────────────────

        AsyncFunction("getCacheSize") { directory: String ->
            val dir = File(directory)
            dir.listFiles()
                ?.filter { it.name.startsWith("thumbify_") }
                ?.sumOf { it.length() }
                ?.toDouble() ?: 0.0
        }
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private fun setDataSource(retriever: MediaMetadataRetriever, uri: String, headers: Map<String, String>) {
        if (uri.startsWith("http://") || uri.startsWith("https://")) {
            val headerMap = HashMap<String, String>(headers).apply { put("Connection", "keep-alive") }
            retriever.setDataSource(uri, headerMap)
        } else {
            val path = if (uri.startsWith("file://")) uri.removePrefix("file://") else uri
            retriever.setDataSource(path)
        }
    }

    private fun resize(bitmap: Bitmap, maxWidth: Int, maxHeight: Int): Bitmap {
        val w = bitmap.width.toFloat()
        val h = bitmap.height.toFloat()
        if (w <= 0 || h <= 0) return bitmap
        val scaleW = if (maxWidth > 0) maxWidth / w else Float.MAX_VALUE
        val scaleH = if (maxHeight > 0) maxHeight / h else Float.MAX_VALUE
        val scale  = min(scaleW, scaleH).coerceAtMost(1.0f)
        if (scale >= 1.0f) return bitmap
        val newW = (w * scale).roundToInt().coerceAtLeast(1)
        val newH = (h * scale).roundToInt().coerceAtLeast(1)
        return Bitmap.createScaledBitmap(bitmap, newW, newH, true)
    }

    private fun resolveFormat(format: String): Pair<Bitmap.CompressFormat, String> = when (format.lowercase()) {
        "png"  -> Pair(Bitmap.CompressFormat.PNG, "png")
        "webp" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            @Suppress("NewApi")
            Pair(Bitmap.CompressFormat.WEBP_LOSSY, "webp")
        } else {
            @Suppress("DEPRECATION")
            Pair(Bitmap.CompressFormat.WEBP, "webp")
        }
        else -> Pair(Bitmap.CompressFormat.JPEG, "jpg")
    }

    private fun ensureCacheDir(dir: String) {
        val f = File(dir)
        if (!f.exists()) f.mkdirs()
    }

    private fun mapError(e: Exception): String {
        // If already prefixed (re-thrown), preserve the prefix
        val existing = e.message ?: ""
        if (existing.contains(":") && listOf(
                "INVALID_URI", "DECODE_FAILED", "TIMEOUT", "CANCELLED",
                "NETWORK_ERROR", "PERMISSION_DENIED", "DISK_FULL", "NATIVE_ERROR"
            ).any { existing.startsWith(it) }
        ) return existing

        val msg = existing.lowercase()
        return when {
            msg.contains("timeout")                          -> "TIMEOUT: $existing"
            msg.contains("permission") || msg.contains("denied") -> "PERMISSION_DENIED: $existing"
            msg.contains("space") || msg.contains("disk")   -> "DISK_FULL: $existing"
            msg.contains("codec") || msg.contains("decode")
                || msg.contains("format")                   -> "DECODE_FAILED: $existing"
            msg.contains("network") || msg.contains("connect")
                || msg.contains("socket")                   -> "NETWORK_ERROR: $existing"
            msg.contains("cancel") || msg.contains("abort") -> "CANCELLED: $existing"
            else                                             -> "NATIVE_ERROR: $existing"
        }
    }
}
