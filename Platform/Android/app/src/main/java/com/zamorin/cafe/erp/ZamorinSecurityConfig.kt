package com.zamorin.cafe.erp

import android.net.Uri
import java.net.URI

/**
 * ZAMORIN CAFÉ ERP — ANDROID NATIVE SECURITY & ORIGIN GOVERNANCE
 * Enforces production origin isolation, App Link path verification, and protocol boundaries.
 */
object ZamorinSecurityConfig {

    const val PRODUCTION_HOST = "zamorin-cafe-erp.vercel.app"
    const val ALT_PRODUCTION_HOST = "zamorin.app"
    const val PRODUCTION_BASE_URL = "https://$PRODUCTION_HOST"
    const val BACKEND_HOST = "zamorin-cafe-erp-backend.onrender.com"

    val PRODUCTION_ORIGINS = setOf(
        "https://$PRODUCTION_HOST",
        "https://$ALT_PRODUCTION_HOST",
        "https://$BACKEND_HOST"
    )

    val DEBUG_ORIGINS = setOf(
        "http://10.0.2.2:3000",
        "http://localhost:3000",
        "http://10.0.2.2:4000",
        "http://localhost:4000"
    )

    /**
     * Determines whether a given URL is allowed to be loaded or execute native bridge methods.
     */
    fun isAllowedOrigin(url: String?, isDebug: Boolean = false): Boolean {
        if (url.isNullOrBlank()) return false
        val uri = try {
            URI(url)
        } catch (_: Exception) {
            return false
        }

        val scheme = uri.scheme?.lowercase() ?: return false
        val host = uri.host?.lowercase() ?: return false
        val port = uri.port

        // In production: Strictly HTTPS only
        if (scheme == "https") {
            return host == PRODUCTION_HOST || host == ALT_PRODUCTION_HOST || host == BACKEND_HOST
        }

        // In debug builds: Allow explicit local development servers
        if (isDebug && scheme == "http") {
            val originString = if (port != -1) "http://$host:$port" else "http://$host"
            return DEBUG_ORIGINS.contains(originString)
        }

        return false
    }

    fun getAllowedOriginRules(isDebug: Boolean = false): Set<String> {
        return if (isDebug) {
            PRODUCTION_ORIGINS + DEBUG_ORIGINS
        } else {
            PRODUCTION_ORIGINS
        }
    }

    /**
     * Extracts and validates the café identifier/public reference from an App Link string.
     * Expected format: https://<host>/cafe/<public-reference>/login
     * Returns the sanitized public-reference string, or null if invalid.
     */
    fun parseCafeLoginReference(urlOrUri: String?): String? {
        if (urlOrUri.isNullOrBlank()) return null
        val uri = try {
            URI(urlOrUri)
        } catch (_: Exception) {
            return null
        }

        val host = uri.host?.lowercase() ?: return null
        if (host != PRODUCTION_HOST && host != ALT_PRODUCTION_HOST) return null
        val scheme = uri.scheme?.lowercase() ?: return null
        if (scheme != "https") return null

        val path = uri.path ?: return null
        val segments = path.split('/').filter { it.isNotBlank() }
        // /cafe/<ref>/login -> ["cafe", "<ref>", "login"]
        if (segments.size >= 3 &&
            segments[0].equals("cafe", ignoreCase = true) &&
            segments[2].equals("login", ignoreCase = true)
        ) {
            val ref = segments[1].trim()
            // Validate alphanumeric / permitted token characters
            if (ref.matches(Regex("^[A-Za-z0-9_-]{3,64}$"))) {
                return ref
            }
        }
        return null
    }

    fun parseCafeLoginReference(uri: Uri?): String? {
        return parseCafeLoginReference(uri?.toString())
    }

    /**
     * Builds the authoritative internal WebView target URL for a café login.
     */
    fun buildCafeLoginUrl(publicRef: String, isDebug: Boolean = false): String {
        val base = if (isDebug) "http://10.0.2.2:3000" else PRODUCTION_BASE_URL
        return "$base/cafe/$publicRef/login"
    }
}
