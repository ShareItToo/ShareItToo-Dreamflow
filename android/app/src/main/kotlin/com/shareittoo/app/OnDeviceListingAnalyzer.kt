package com.shareittoo.app

import android.content.Context
import android.net.Uri
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.label.ImageLabeling
import com.google.mlkit.vision.label.defaults.ImageLabelerOptions
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.Closeable
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

internal class OnDeviceListingAnalyzer(
    private val context: Context,
) : Closeable {
    private val executor = Executors.newSingleThreadExecutor()

    fun analyze(
        rawPaths: List<String>,
        callback: (Result<List<Map<String, Any>>>) -> Unit,
    ) {
        executor.execute {
            callback(runCatching { analyzeBlocking(rawPaths) })
        }
    }

    private fun analyzeBlocking(rawPaths: List<String>): List<Map<String, Any>> {
        require(rawPaths.isNotEmpty() && rawPaths.size <= maximumImageCount) {
            "on_device_listing_image_count_invalid"
        }
        val files = rawPaths.map(::safeImageFile)
        val labeler = ImageLabeling.getClient(
            ImageLabelerOptions.Builder()
                .setConfidenceThreshold(minimumLabelConfidence)
                .build(),
        )
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        try {
            return files.map { file ->
                val image = InputImage.fromFilePath(context, Uri.fromFile(file))
                val labelTask = labeler.process(image)
                val textTask = recognizer.process(image)
                Tasks.await(
                    Tasks.whenAll(labelTask, textTask),
                    maximumAnalysisSeconds,
                    TimeUnit.SECONDS,
                )
                val labels = labelTask.result
                    .sortedByDescending { it.confidence }
                    .take(maximumLabelCount)
                    .map { label ->
                        mapOf(
                            "text" to label.text.take(maximumLabelTextLength),
                            "confidence" to label.confidence.toDouble(),
                            "index" to label.index,
                        )
                    }
                val recognized = textTask.result
                    .text
                    .replace(Regex("\\s+"), " ")
                    .trim()
                    .take(maximumOcrLength)
                mapOf(
                    "modelVersion" to modelVersion,
                    "labels" to labels,
                    "ocrText" to recognized,
                )
            }
        } finally {
            labeler.close()
            recognizer.close()
        }
    }

    private fun safeImageFile(path: String): File {
        require(path.isNotBlank() && path.length <= maximumPathLength) {
            "on_device_listing_image_path_invalid"
        }
        val file = File(path).canonicalFile
        val roots = buildList {
            add(context.cacheDir.canonicalFile)
            add(context.filesDir.canonicalFile)
            context.externalCacheDir?.canonicalFile?.let(::add)
            context.getExternalFilesDirs(null).filterNotNull().mapTo(this) { it.canonicalFile }
        }
        require(roots.any { root -> file.path == root.path || file.path.startsWith("${root.path}/") }) {
            "on_device_listing_image_path_outside_app_storage"
        }
        require(file.isFile && file.length() in 1..maximumImageBytes) {
            "on_device_listing_image_file_invalid"
        }
        return file
    }

    override fun close() {
        executor.shutdownNow()
    }

    companion object {
        const val modelVersion =
            "mlkit-image-labeling-17.0.9+text-recognition-16.0.1+sit-rules-v1"
        private const val maximumImageCount = 4
        private const val maximumImageBytes = 16L * 1024L * 1024L
        private const val maximumPathLength = 1_024
        private const val maximumLabelCount = 20
        private const val maximumLabelTextLength = 80
        private const val maximumOcrLength = 1_000
        private const val minimumLabelConfidence = 0.35f
        private const val maximumAnalysisSeconds = 30L
    }
}
