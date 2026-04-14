package com.thumbify

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.os.Build
import com.facebook.react.bridge.*
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import kotlin.math.min
import kotlin.math.roundToInt

class ThumbifyModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "RNThumbify"

    // ─── Generate ───────────────────────────────────────────────────────────────

    @ReactMethod
    fun generate(options: ReadableMap, promise: Promise) {
        val uri = options.getString("uri")
        if (uri.isNullOrBlank()) {
            promise.reject("INVALID_URI", "uri is required and must be non-empty")
            return
        }

        val timeMs    = if (options.hasKey("timeMs")) options.getDouble("timeMs").toLong() else 0L
        val format    = if (options.hasKey("format")) options.getString("format") ?: "jpeg" else "jpeg"
        val quality   = if (options.hasKey("quality")) options.getDouble("quality").toInt() else 80
        val maxWidth  = if (options.hasKey("maxWidth")) options.getDouble("maxWidth").toInt() else 0
        val maxHeight = if (options.hasKey("maxHeight")) options.getDouble("maxHeight").toInt() else 0
        val timeoutMs = if (options.hasKey("timeoutMs")) options.getDouble("timeoutMs").toLong() else 15_000L
        val cacheDir  = if (options.hasKey("cacheDir")) options.getString("cacheDir") ?: reactApplicationContext.cacheDir.absolutePath else reactApplicationContext.cacheDir.absolutePath
        val cacheFile = if (options.hasKey("cacheFilename")) options.getString("cacheFilename") ?: "thumb.jpg" else "thumb.jpg"
        val headers   = parseHeaders(options)

        val outputFile = File(cacheDir, cacheFile)

        // Return cached file if exists
        if (outputFile.exists() && outputFile.length() > 0) {
            val boundsOpts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(outputFile.absolutePath, boundsOpts)
            val result = Arguments.createMap().apply {
                putString("path", outputFile.absolutePath)
                putInt("width", boundsOpts.outWidth.coerceAtLeast(0))
                putInt("height", boundsOpts.outHeight.coerceAtLeast(0))
                putInt("size", outputFile.length().toInt())
            }
            promise.resolve(result)
            return
        }

        ensureCacheDir(cacheDir)

        Thread {
            try {
                val retriever = MediaMetadataRetriever()
                setDataSource(retriever, uri, headers, timeoutMs)

                // Extract frame — OPTION_CLOSEST_SYNC for speed, OPTION_CLOSEST for precision
                val rawBitmap: Bitmap? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                    retriever.getScaledFrameAtTime(
                        timeMs * 1_000L, // microseconds
                        MediaMetadataRetriever.OPTION_CLOSEST_SYNC,
                        if (maxWidth > 0) maxWidth else Int.MAX_VALUE,
                        if (maxHeight > 0) maxHeight else Int.MAX_VALUE
                    )
                } else {
                    retriever.getFrameAtTime(timeMs * 1_000L, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
                }

                retriever.release()

                if (rawBitmap == null) {
                    promise.reject("DECODE_FAILED", "MediaMetadataRetriever returned null frame at ${timeMs}ms")
                    return@Thread
                }

                val bitmap = if (maxWidth > 0 || maxHeight > 0) {
                    resize(rawBitmap, maxWidth, maxHeight)
                } else {
                    rawBitmap
                }

                val (compressFormat, mimeExt) = resolveFormat(format)

                outputFile.parentFile?.mkdirs()
                val thumbWidth = bitmap.width
                val thumbHeight = bitmap.height

                FileOutputStream(outputFile).use { out ->
                    bitmap.compress(compressFormat, quality, out)
                }

                if (bitmap !== rawBitmap) rawBitmap.recycle()
                bitmap.recycle()

                val result = Arguments.createMap().apply {
                    putString("path", outputFile.absolutePath)
                    putInt("width", thumbWidth)
                    putInt("height", thumbHeight)
                    putInt("size", outputFile.length().toInt())
                }
                promise.resolve(result)

            } catch (e: Exception) {
                promise.reject(mapError(e), e.message ?: "Unknown error", e)
            }
        }.start()
    }

    // ─── Data Source ─────────────────────────────────────────────────────────

    private fun setDataSource(
        retriever: MediaMetadataRetriever,
        uri: String,
        headers: Map<String, String>,
        timeoutMs: Long,
    ) {
        if (uri.startsWith("http://") || uri.startsWith("https://")) {
            // Remote — use setDataSource with headers map
            val headerMap = HashMap<String, String>(headers).apply {
                // Forward timeout hint via user-agent if no explicit timeout API
                put("Connection", "keep-alive")
            }
            retriever.setDataSource(uri, headerMap)
        } else {
            // Local file
            val path = if (uri.startsWith("file://")) uri.removePrefix("file://") else uri
            retriever.setDataSource(path)
        }
    }

    // ─── Resize ──────────────────────────────────────────────────────────────

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

    // ─── Format ──────────────────────────────────────────────────────────────

    private fun resolveFormat(format: String): Pair<Bitmap.CompressFormat, String> {
        return when (format.lowercase()) {
            "png" -> Pair(Bitmap.CompressFormat.PNG, "png")
            "webp" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                @Suppress("NewApi")
                Pair(Bitmap.CompressFormat.WEBP_LOSSY, "webp")
            } else {
                @Suppress("DEPRECATION")
                Pair(Bitmap.CompressFormat.WEBP, "webp")
            }
            else -> Pair(Bitmap.CompressFormat.JPEG, "jpg")
        }
    }

    // ─── Cache Ops ───────────────────────────────────────────────────────────

    @ReactMethod
    fun clearCache(directory: String, promise: Promise) {
        try {
            val dir = File(directory)
            if (dir.exists()) {
                dir.listFiles()
                    ?.filter { it.name.startsWith("thumbify_") }
                    ?.forEach { it.delete() }
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("NATIVE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getCacheSize(directory: String, promise: Promise) {
        try {
            val dir = File(directory)
            val total = dir.listFiles()
                ?.filter { it.name.startsWith("thumbify_") }
                ?.sumOf { it.length() } ?: 0L
            promise.resolve(total.toDouble())
        } catch (e: Exception) {
            promise.reject("NATIVE_ERROR", e.message, e)
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private fun parseHeaders(options: ReadableMap): Map<String, String> {
        if (!options.hasKey("headers")) return emptyMap()
        val raw = options.getMap("headers") ?: return emptyMap()
        val result = mutableMapOf<String, String>()
        val iter = raw.keySetIterator()
        while (iter.hasNextKey()) {
            val k = iter.nextKey()
            result[k] = raw.getString(k) ?: ""
        }
        return result
    }

    private fun ensureCacheDir(dir: String) {
        val f = File(dir)
        if (!f.exists()) f.mkdirs()
    }

    private fun mapError(e: Exception): String {
        val msg = e.message?.lowercase() ?: ""
        return when {
            msg.contains("timeout")          -> "TIMEOUT"
            msg.contains("permission")       -> "PERMISSION_DENIED"
            msg.contains("space") ||
            msg.contains("disk")             -> "DISK_FULL"
            msg.contains("codec") ||
            msg.contains("decode") ||
            msg.contains("format")           -> "DECODE_FAILED"
            msg.contains("network") ||
            msg.contains("connect") ||
            msg.contains("socket")           -> "NETWORK_ERROR"
            msg.contains("cancel") ||
            msg.contains("abort")            -> "CANCELLED"
            else                             -> "NATIVE_ERROR"
        }
    }
}
