package com.zamorin.cafe.erp

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Environment
import android.provider.MediaStore
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import androidx.activity.result.ActivityResultLauncher
import androidx.core.content.FileProvider
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * ZAMORIN CAFÉ ERP — ATTACHMENT COORDINATOR
 *
 * Implements native camera capture, system photo picking, and document selection
 * for both WebChromeClient file input hooks (<input type="file">) and direct native bridge requests.
 *
 * Architectural Invariant:
 * The Android client is strictly an acquisition channel. The backend Universal Attachment Service
 * remains authoritative for MIME verification, magic bytes inspection, size limits, and security quarantine.
 */
class ZamorinAttachmentCoordinator(private val activity: Activity) {

    companion object {
        const val FILE_PROVIDER_AUTHORITY = "com.zamorin.cafe.erp.fileprovider"
    }

    private var activeFilePathCallback: ValueCallback<Array<Uri>>? = null
    private var pendingCameraCaptureUri: Uri? = null

    /**
     * Handles WebChromeClient.onShowFileChooser requests.
     */
    fun onShowFileChooser(
        filePathCallback: ValueCallback<Array<Uri>>?,
        fileChooserParams: WebChromeClient.FileChooserParams?,
        cameraLauncher: ActivityResultLauncher<Uri>,
        filePickerLauncher: ActivityResultLauncher<Intent>
    ): Boolean {
        // Cancel any existing pending callback to prevent WebView deadlock
        activeFilePathCallback?.onReceiveValue(null)
        activeFilePathCallback = filePathCallback

        val isCapture = fileChooserParams?.isCaptureEnabled == true
        val acceptTypes = fileChooserParams?.acceptTypes ?: arrayOf()
        val isOnlyImages = acceptTypes.any { it.startsWith("image/") }

        if (isCapture && isOnlyImages) {
            return launchCameraCapture(cameraLauncher)
        }

        return launchFilePicker(fileChooserParams, filePickerLauncher)
    }

    /**
     * Prepares a FileProvider URI and triggers native camera capture.
     */
    fun launchCameraCapture(cameraLauncher: ActivityResultLauncher<Uri>): Boolean {
        return try {
            val photoFile = createImageFile(activity)
            val photoUri = FileProvider.getUriForFile(
                activity,
                FILE_PROVIDER_AUTHORITY,
                photoFile
            )
            pendingCameraCaptureUri = photoUri
            cameraLauncher.launch(photoUri)
            true
        } catch (e: Exception) {
            cancelPendingCallback()
            false
        }
    }

    /**
     * Launches the system file/document picker with appropriate MIME filtering and multi-select support.
     */
    fun launchFilePicker(
        fileChooserParams: WebChromeClient.FileChooserParams?,
        filePickerLauncher: ActivityResultLauncher<Intent>
    ): Boolean {
        return try {
            val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                val types = fileChooserParams?.acceptTypes?.filter { it.isNotBlank() }
                if (!types.isNullOrEmpty()) {
                    if (types.size == 1) {
                        type = types[0]
                    } else {
                        type = "*/*"
                        putExtra(Intent.EXTRA_MIME_TYPES, types.toTypedArray())
                    }
                } else {
                    type = "*/*"
                }

                if (fileChooserParams?.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) {
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                }
            }

            val chooserIntent = Intent.createChooser(intent, "Select Attachment")
            filePickerLauncher.launch(chooserIntent)
            true
        } catch (e: Exception) {
            cancelPendingCallback()
            false
        }
    }

    /**
     * Receives camera capture result and forwards to active callback.
     */
    fun handleCameraResult(success: Boolean) {
        val callback = activeFilePathCallback ?: return
        activeFilePathCallback = null

        if (success && pendingCameraCaptureUri != null) {
            callback.onReceiveValue(arrayOf(pendingCameraCaptureUri!!))
        } else {
            callback.onReceiveValue(null)
        }
        pendingCameraCaptureUri = null
    }

    /**
     * Receives file picker result and forwards to active callback.
     */
    fun handlePickerResult(resultCode: Int, data: Intent?) {
        val callback = activeFilePathCallback ?: return
        activeFilePathCallback = null

        if (resultCode != Activity.RESULT_OK || data == null) {
            callback.onReceiveValue(null)
            return
        }

        val results = mutableListOf<Uri>()
        val clipData = data.clipData
        if (clipData != null) {
            for (i in 0 until clipData.itemCount) {
                results.add(clipData.getItemAt(i).uri)
            }
        } else if (data.data != null) {
            results.add(data.data!!)
        }

        if (results.isNotEmpty()) {
            callback.onReceiveValue(results.toTypedArray())
        } else {
            callback.onReceiveValue(null)
        }
    }

    fun cancelPendingCallback() {
        activeFilePathCallback?.onReceiveValue(null)
        activeFilePathCallback = null
        pendingCameraCaptureUri = null
    }

    private fun createImageFile(context: Context): File {
        val timeStamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
        val storageDir = File(context.cacheDir, "photos")
        if (!storageDir.exists()) {
            storageDir.mkdirs()
        }
        return File.createTempFile(
            "IMG_${timeStamp}_",
            ".jpg",
            storageDir
        )
    }
}
