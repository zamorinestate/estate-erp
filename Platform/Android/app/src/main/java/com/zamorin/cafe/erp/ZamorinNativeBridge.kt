package com.zamorin.cafe.erp

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import java.util.Base64
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream

/**
 * ZAMORIN CAFÉ ERP — SECURE ORIGIN-CONSTRAINED NATIVE BRIDGE
 *
 * Implements Phase 4 strict message protocol over WebViewCompat.addWebMessageListener:
 * - Only verified trusted Zamorin origins can communicate with this bridge.
 * - Typed request-response framing: { requestId, action, payload } -> { requestId, success, result, errorCode, errorMessage }
 * - Zero exposure of arbitrary shell, file paths, private keystore, or database access.
 */
class ZamorinNativeBridge(
    private val context: Context,
    private val callbacks: BridgeCallbacks
) {

    interface BridgeCallbacks {
        fun onRequestDirectoryPicker(requestId: String)
        fun onOpenSystemPrint(requestId: String, jobName: String)
        fun onOpenCamera(requestId: String)
        fun onOpenFilePicker(requestId: String, mimeType: String?, allowMultiple: Boolean)
    }

    data class BridgeResponse(
        val requestId: String,
        val success: Boolean,
        val result: JSONObject? = null,
        val errorCode: String? = null,
        val errorMessage: String? = null
    ) {
        fun toJsonString(): String {
            val obj = JSONObject()
            obj.put("requestId", requestId)
            obj.put("success", success)
            if (result != null) {
                obj.put("result", result)
            }
            if (errorCode != null) {
                obj.put("errorCode", errorCode)
            }
            if (errorMessage != null) {
                obj.put("errorMessage", errorMessage)
            }
            return obj.toString()
        }
    }

    /**
     * Processes a JSON message payload received from an authorized origin.
     */
    fun handleMessage(rawJson: String): BridgeResponse? {
        val json = try {
            JSONObject(rawJson)
        } catch (_: Exception) {
            return BridgeResponse(
                requestId = "unknown",
                success = false,
                errorCode = "MALFORMED_JSON",
                errorMessage = "Request payload must be valid JSON."
            )
        }

        val requestId = json.optString("requestId", "req_${System.currentTimeMillis()}")
        val action = json.optString("action", "").trim().uppercase()
        val payload = json.optJSONObject("payload") ?: JSONObject()

        return when (action) {
            "GET_STORAGE_CAPABILITY" -> {
                val storedTreeUri = ZamorinSafManager.getStoredTreeUri(context)
                val isValid = ZamorinSafManager.validatePersistedTreePermission(context, storedTreeUri)
                val res = JSONObject().apply {
                    put("platform", "ANDROID_NATIVE_SAF")
                    put("isAndroidNative", true)
                    put("hasSaf", true)
                    put("persistedUriConfigured", isValid)
                    if (isValid && storedTreeUri != null) {
                        put("treeUri", storedTreeUri.toString())
                    } else {
                        put("treeUri", JSONObject.NULL)
                    }
                    put("destinationDisplay", if (isValid) "Authorized SAF Directory" else "Not Configured")
                }
                BridgeResponse(requestId = requestId, success = true, result = res)
            }

            "CHECK_STORAGE_PERMISSION" -> {
                val uriStr = payload.optString("treeUri", null)
                val treeUri = if (!uriStr.isNullOrBlank()) {
                    try { Uri.parse(uriStr) } catch (_: Exception) { null }
                } else {
                    ZamorinSafManager.getStoredTreeUri(context)
                }
                val isValid = ZamorinSafManager.validatePersistedTreePermission(context, treeUri)
                val res = JSONObject().apply {
                    put("isValid", isValid)
                    put("treeUri", treeUri?.toString())
                }
                BridgeResponse(requestId = requestId, success = true, result = res)
            }

            "SELECT_EXPORT_DIRECTORY", "CHANGE_EXPORT_DIRECTORY" -> {
                callbacks.onRequestDirectoryPicker(requestId)
                null // Asynchronous response once user selects directory
            }

            "RELEASE_STORAGE_PERMISSION" -> {
                val storedTreeUri = ZamorinSafManager.getStoredTreeUri(context)
                if (storedTreeUri != null) {
                    ZamorinSafManager.releaseTreePermission(context, storedTreeUri)
                }
                val res = JSONObject().apply {
                    put("released", true)
                }
                BridgeResponse(requestId = requestId, success = true, result = res)
            }

            "SAVE_DOCUMENT" -> {
                val filename = payload.optString("filename", "zamorin_export")
                val mimeType = payload.optString("mimeType", "application/octet-stream")
                val subfolder = payload.optString("subfolder", "ZAMORIN ERP/Exports")
                val base64Data = payload.optString("base64Data", "")

                val storedTreeUri = ZamorinSafManager.getStoredTreeUri(context)
                if (storedTreeUri == null || !ZamorinSafManager.validatePersistedTreePermission(context, storedTreeUri)) {
                    return BridgeResponse(
                        requestId = requestId,
                        success = false,
                        errorCode = "STORAGE_PERMISSION_REAUTH_REQUIRED",
                        errorMessage = "Persisted SAF tree permission is absent or revoked."
                    )
                }

                val bytes = try {
                    Base64.getDecoder().decode(base64Data)
                } catch (e: Exception) {
                    return BridgeResponse(
                        requestId = requestId,
                        success = false,
                        errorCode = "INVALID_BASE64_DATA",
                        errorMessage = "Document content could not be decoded from base64."
                    )
                }

                val writeResult = ZamorinSafManager.writeDocument(
                    context = context,
                    treeUri = storedTreeUri,
                    subfolderPath = subfolder,
                    filename = filename,
                    mimeType = mimeType,
                    data = bytes
                )

                if (writeResult.success) {
                    val res = JSONObject().apply {
                        put("documentUri", writeResult.documentUri)
                        put("filename", writeResult.filename)
                        put("bytesWritten", writeResult.bytesWritten)
                        put("mimeType", writeResult.mimeType)
                    }
                    BridgeResponse(requestId = requestId, success = true, result = res)
                } else {
                    BridgeResponse(
                        requestId = requestId,
                        success = false,
                        errorCode = writeResult.errorCode ?: "WRITE_FAILED",
                        errorMessage = writeResult.errorMessage ?: "Failed to write document into authorized SAF tree."
                    )
                }
            }

            "OPEN_SYSTEM_PRINT" -> {
                val jobName = payload.optString("jobName", "Zamorin_Print_Job")
                callbacks.onOpenSystemPrint(requestId, jobName)
                null // Asynchronous completion handled via callbacks
            }

            "OPEN_CAMERA" -> {
                callbacks.onOpenCamera(requestId)
                null
            }

            "OPEN_FILE_PICKER" -> {
                val mimeType = payload.optString("mimeType", "*/*")
                val allowMultiple = payload.optBoolean("allowMultiple", false)
                callbacks.onOpenFilePicker(requestId, mimeType, allowMultiple)
                null
            }

            "SHARE_DOCUMENT" -> {
                val filename = payload.optString("filename", "share_document")
                val mimeType = payload.optString("mimeType", "application/octet-stream")
                val base64Data = payload.optString("base64Data", "")

                try {
                    val bytes = Base64.getDecoder().decode(base64Data)
                    val shareDir = File(context.cacheDir, "exports")
                    if (!shareDir.exists()) shareDir.mkdirs()
                    val shareFile = File(shareDir, filename)
                    FileOutputStream(shareFile).use { it.write(bytes) }

                    val contentUri = FileProvider.getUriForFile(
                        context,
                        ZamorinAttachmentCoordinator.FILE_PROVIDER_AUTHORITY,
                        shareFile
                    )

                    val shareIntent = Intent(Intent.ACTION_SEND).apply {
                        type = mimeType
                        putExtra(Intent.EXTRA_STREAM, contentUri)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }

                    val chooser = Intent.createChooser(shareIntent, "Share Document").apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(chooser)

                    val res = JSONObject().apply {
                        put("shared", true)
                        put("filename", filename)
                    }
                    BridgeResponse(requestId = requestId, success = true, result = res)
                } catch (e: Exception) {
                    BridgeResponse(
                        requestId = requestId,
                        success = false,
                        errorCode = "SHARE_FAILED",
                        errorMessage = e.message ?: "Failed to dispatch share Intent."
                    )
                }
            }

            else -> {
                BridgeResponse(
                    requestId = requestId,
                    success = false,
                    errorCode = "UNKNOWN_NATIVE_ACTION",
                    errorMessage = "Action '$action' is not recognized by the native bridge protocol."
                )
            }
        }
    }
}
