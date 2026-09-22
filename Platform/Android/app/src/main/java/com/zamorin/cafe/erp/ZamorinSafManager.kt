package com.zamorin.cafe.erp

import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Build
import android.provider.DocumentsContract
import androidx.documentfile.provider.DocumentFile
import java.io.IOException

/**
 * ZAMORIN CAFÉ ERP — PRODUCTION STORAGE ACCESS FRAMEWORK (SAF) MANAGER
 *
 * Implements authoritative Android native storage operations:
 * - ACTION_OPEN_DOCUMENT_TREE native system directory picker
 * - ContentResolver.takePersistableUriPermission
 * - Native persisted permission validation (ContentResolver is authoritative, not localStorage)
 * - Android 11+ Scoped Storage restrictions (Download root, Android/data, Android/obb, Storage roots)
 * - Structured Zamorin folder hierarchy creation within user-authorized tree
 * - Streaming ContentResolver binary document write
 */
object ZamorinSafManager {

    private const val PREFS_NAME = "zamorin_saf_preferences"
    private const val KEY_PERSISTED_TREE_URI = "persisted_tree_uri"

    data class WriteResult(
        val success: Boolean,
        val documentUri: String? = null,
        val filename: String = "",
        val mimeType: String = "",
        val bytesWritten: Long = 0,
        val errorCode: String? = null,
        val errorMessage: String? = null
    )

    private fun getPrefs(context: Context): SharedPreferences {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    fun getStoredTreeUri(context: Context): Uri? {
        val uriString = getPrefs(context).getString(KEY_PERSISTED_TREE_URI, null) ?: return null
        return try {
            Uri.parse(uriString)
        } catch (_: Exception) {
            null
        }
    }

    fun setStoredTreeUri(context: Context, treeUri: Uri?) {
        getPrefs(context).edit().apply {
            if (treeUri != null) {
                putString(KEY_PERSISTED_TREE_URI, treeUri.toString())
            } else {
                remove(KEY_PERSISTED_TREE_URI)
            }
            apply()
        }
    }

    /**
     * Checks if a tree URI targets an Android 11+ prohibited Scoped Storage location:
     * - Internal storage root
     * - Secondary SD-card roots
     * - Download directory root
     * - Android/data and Android/obb
     */
    fun isRestrictedLocation(uriString: String?): Boolean {
        if (uriString.isNullOrBlank()) return true
        val uriStr = uriString.lowercase()

        // 1. Android/data and Android/obb
        if (uriStr.contains("android%2fdata") ||
            uriStr.contains("android/data") ||
            uriStr.contains("android%2fobb") ||
            uriStr.contains("android/obb")
        ) {
            return true
        }

        // 2. Download directory root (prohibited from direct tree selection on Android 11+)
        if (uriStr == "content://com.android.externalstorage.documents/tree/primary%3adownload" ||
            uriStr == "content://com.android.externalstorage.documents/tree/primary%3adownload/" ||
            uriStr == "content://com.android.externalstorage.documents/tree/primary:download" ||
            uriStr == "content://com.android.externalstorage.documents/tree/primary:download/" ||
            uriStr == "content://com.android.providers.downloads.documents/tree/downloads" ||
            uriStr == "content://com.android.providers.downloads.documents/tree/downloads/"
        ) {
            return true
        }

        // 3. Primary internal storage root or secondary volume roots
        // e.g. /tree/primary: or /tree/primary%3a or /tree/<UUID>: or /tree/<UUID>%3a
        val primaryRoot = Regex("tree/primary(%3a|:)?/?$", RegexOption.IGNORE_CASE)
        val sdCardRoot = Regex("tree/[a-f0-9]{4}-[a-f0-9]{4}(%3a|:)?/?$", RegexOption.IGNORE_CASE)
        if (primaryRoot.containsMatchIn(uriStr) || sdCardRoot.containsMatchIn(uriStr)) {
            return true
        }

        return false
    }

    fun isRestrictedLocation(uri: Uri?): Boolean {
        return isRestrictedLocation(uri?.toString())
    }

    /**
     * Verifies that the native ContentResolver actually holds an active, valid persistable permission
     * for the provided tree URI with both read and write flags.
     * This is the authoritative security boundary.
     */
    fun validatePersistedTreePermission(context: Context, treeUri: Uri?): Boolean {
        if (treeUri == null) return false
        if (isRestrictedLocation(treeUri)) return false

        val resolver = context.contentResolver
        val permissions = resolver.persistedUriPermissions
        for (perm in permissions) {
            if (perm.uri == treeUri && perm.isWritePermission && perm.isReadPermission) {
                return true
            }
        }
        return false
    }

    /**
     * Captures and persists the native ContentResolver permission from an ACTION_OPEN_DOCUMENT_TREE intent result.
     */
    fun takePersistableUriPermission(context: Context, treeUri: Uri, takeFlags: Int): Boolean {
        if (isRestrictedLocation(treeUri)) {
            throw SecurityException("RESTRICTED_DIRECTORY_DENIED: Selected directory root is prohibited under Android Scoped Storage.")
        }

        val requiredFlags = takeFlags and (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        try {
            context.contentResolver.takePersistableUriPermission(treeUri, requiredFlags)
            setStoredTreeUri(context, treeUri)
            return true
        } catch (e: Exception) {
            setStoredTreeUri(context, null)
            throw SecurityException("FAILED_TO_TAKE_PERSISTABLE_PERMISSION: ${e.message}", e)
        }
    }

    /**
     * Releases a previously persisted tree permission and clears the cached preference.
     */
    fun releaseTreePermission(context: Context, treeUri: Uri) {
        try {
            val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            context.contentResolver.releasePersistableUriPermission(treeUri, flags)
        } catch (_: Exception) {
            // Already released or invalid
        }
        setStoredTreeUri(context, null)
    }

    /**
     * Navigates or creates a subfolder path (e.g. "ZAMORIN ERP/POS/Invoices") inside the user-authorized tree.
     */
    fun getOrCreateSubDirectory(
        context: Context,
        treeUri: Uri,
        subfolderPath: String
    ): DocumentFile {
        if (!validatePersistedTreePermission(context, treeUri)) {
            throw SecurityException("STORAGE_PERMISSION_REAUTH_REQUIRED: No active persistable URI permission for tree.")
        }

        val rootDoc = DocumentFile.fromTreeUri(context, treeUri)
            ?: throw IOException("INVALID_TREE_ROOT: Unable to resolve root document from tree URI.")

        if (!rootDoc.canWrite()) {
            throw SecurityException("STORAGE_PERMISSION_REAUTH_REQUIRED: Root document tree is not writable.")
        }

        val cleanPath = subfolderPath.trim().replace('\\', '/')
        if (cleanPath.contains("..") || cleanPath.startsWith("/")) {
            throw SecurityException("DESTINATION_OUTSIDE_TREE: Path traversal outside authorized tree is prohibited.")
        }

        val segments = cleanPath.split('/').filter { it.isNotBlank() }
        var currentDir = rootDoc

        for (segment in segments) {
            val existing = currentDir.findFile(segment)
            currentDir = if (existing != null && existing.isDirectory) {
                existing
            } else if (existing != null && !existing.isDirectory) {
                throw IOException("CONFLICT_FILE_EXISTS_WITH_NAME: A file already exists with folder name '$segment'.")
            } else {
                currentDir.createDirectory(segment)
                    ?: throw IOException("FAILED_TO_CREATE_DIRECTORY: Unable to create subfolder '$segment'.")
            }
        }

        return currentDir
    }

    /**
     * Writes a document payload into the user-authorized SAF directory tree.
     */
    fun writeDocument(
        context: Context,
        treeUri: Uri,
        subfolderPath: String,
        filename: String,
        mimeType: String,
        data: ByteArray
    ): WriteResult {
        if (!validatePersistedTreePermission(context, treeUri)) {
            return WriteResult(
                success = false,
                errorCode = "STORAGE_PERMISSION_REAUTH_REQUIRED",
                errorMessage = "ContentResolver persistable permission is missing or has been revoked."
            )
        }

        val sanitizedFilename = filename.trim().replace(Regex("[/\\\\:*?\"<>|]"), "_")
        if (sanitizedFilename.isBlank()) {
            return WriteResult(
                success = false,
                errorCode = "INVALID_FILENAME",
                errorMessage = "Filename cannot be empty or contain invalid characters."
            )
        }

        return try {
            val targetDir = getOrCreateSubDirectory(context, treeUri, subfolderPath)
            
            // Check if file already exists; overwrite or create new
            val existingFile = targetDir.findFile(sanitizedFilename)
            val targetFile = existingFile ?: targetDir.createFile(mimeType, sanitizedFilename)
            ?: return WriteResult(
                success = false,
                errorCode = "DOCUMENT_CREATION_FAILED",
                errorMessage = "DocumentFile.createFile returned null inside authorized tree."
            )

            context.contentResolver.openOutputStream(targetFile.uri, "wt")?.use { outputStream ->
                outputStream.write(data)
                outputStream.flush()
            } ?: return WriteResult(
                success = false,
                errorCode = "STREAM_OPEN_FAILED",
                errorMessage = "ContentResolver failed to open output stream for document URI."
            )

            WriteResult(
                success = true,
                documentUri = targetFile.uri.toString(),
                filename = sanitizedFilename,
                mimeType = mimeType,
                bytesWritten = data.size.toLong()
            )
        } catch (e: SecurityException) {
            WriteResult(
                success = false,
                errorCode = e.message?.substringBefore(':') ?: "SECURITY_ERROR",
                errorMessage = e.message
            )
        } catch (e: Exception) {
            WriteResult(
                success = false,
                errorCode = "IO_ERROR",
                errorMessage = e.message ?: "Unknown I/O error during native write."
            )
        }
    }
}
