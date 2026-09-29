package com.zamorin.cafe.erp

import android.content.Context
import org.json.JSONObject

/**
 * Persists the non-secret binding between an Android spooler job id and the
 * server-issued REC-04D/REC-04E acknowledgement context. The private signing
 * key never enters this store.
 *
 * The local binding must not outlive the server's print-ack challenge window.
 */
object ZamorinPrintAttestationStore {
    private const val PREFS = "zamorin_print_attestation_bindings"
    private const val MAX_AGE_MS = 15L * 60L * 1000L

    fun bind(
        context: Context,
        platformJobId: String,
        attestationContext: JSONObject
    ) {
        val id = platformJobId.trim()
        if (id.isEmpty()) return

        val record = JSONObject().apply {
            put("boundAt", System.currentTimeMillis())
            put("context", JSONObject(attestationContext.toString()))
        }

        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(id, record.toString())
            .apply()
    }

    fun get(context: Context, platformJobId: String): JSONObject? {
        val id = platformJobId.trim()
        if (id.isEmpty()) return null

        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val raw = prefs.getString(id, null) ?: return null

        return try {
            val record = JSONObject(raw)
            val boundAt = record.optLong("boundAt", 0L)
            if (boundAt <= 0L || System.currentTimeMillis() - boundAt > MAX_AGE_MS) {
                prefs.edit().remove(id).apply()
                null
            } else {
                record.optJSONObject("context")
            }
        } catch (_: Exception) {
            prefs.edit().remove(id).apply()
            null
        }
    }

    fun clear(context: Context, platformJobId: String) {
        val id = platformJobId.trim()
        if (id.isEmpty()) return
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove(id)
            .apply()
    }
}
