package com.zamorin.cafe.erp

import android.content.Context
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.mockito.Mockito.mock

/**
 * ZAMORIN CAFÉ ERP — NATIVE BRIDGE PROTOCOL UNIT TESTS
 *
 * Verifies Phase 4 message protocol boundaries:
 * - Malformed JSON rejection
 * - Unknown action rejection
 * - Typed callback routing for directory, camera, file picker, and printing
 * - Authoritative error propagation
 */
class ZamorinNativeBridgeTest {

    private lateinit var mockContext: Context
    private lateinit var bridge: ZamorinNativeBridge
    private var lastRequestedDirectoryPickerId: String? = null
    private var lastCameraRequestId: String? = null
    private var lastFilePickerRequestId: String? = null
    private var lastPrintJobName: String? = null

    @Before
    fun setup() {
        mockContext = mock(Context::class.java)
        bridge = ZamorinNativeBridge(
            mockContext,
            object : ZamorinNativeBridge.BridgeCallbacks {
                override fun onRequestDirectoryPicker(requestId: String) {
                    lastRequestedDirectoryPickerId = requestId
                }

                override fun onOpenSystemPrint(requestId: String, jobName: String) {
                    lastPrintJobName = jobName
                }

                override fun onOpenCamera(requestId: String) {
                    lastCameraRequestId = requestId
                }

                override fun onOpenFilePicker(requestId: String, mimeType: String?, allowMultiple: Boolean) {
                    lastFilePickerRequestId = requestId
                }
            }
        )
    }

    @Test
    fun testMalformedJsonRejected() {
        val response = bridge.handleMessage("{ invalid json string }")
        assertNotNull(response)
        assertFalse(response!!.success)
        assertEquals("MALFORMED_JSON", response.errorCode)
    }

    @Test
    fun testUnknownActionRejected() {
        val req = JSONObject().apply {
            put("requestId", "req_99")
            put("action", "EXECUTE_ARBITRARY_COMMAND")
        }.toString()

        val response = bridge.handleMessage(req)
        assertNotNull(response)
        assertFalse(response!!.success)
        assertEquals("UNKNOWN_NATIVE_ACTION", response.errorCode)
    }

    @Test
    fun testDirectoryPickerTriggered() {
        val req = JSONObject().apply {
            put("requestId", "req_pick_1")
            put("action", "SELECT_EXPORT_DIRECTORY")
        }.toString()

        val response = bridge.handleMessage(req)
        // Returns null for asynchronous operations
        assertNull(response)
        assertEquals("req_pick_1", lastRequestedDirectoryPickerId)
    }

    @Test
    fun testCameraTriggered() {
        val req = JSONObject().apply {
            put("requestId", "req_cam_1")
            put("action", "OPEN_CAMERA")
        }.toString()

        val response = bridge.handleMessage(req)
        assertNull(response)
        assertEquals("req_cam_1", lastCameraRequestId)
    }

    @Test
    fun testFilePickerTriggered() {
        val req = JSONObject().apply {
            put("requestId", "req_file_1")
            put("action", "OPEN_FILE_PICKER")
            put("payload", JSONObject().apply {
                put("mimeType", "application/pdf")
            })
        }.toString()

        val response = bridge.handleMessage(req)
        assertNull(response)
        assertEquals("req_file_1", lastFilePickerRequestId)
    }

    @Test
    fun testSystemPrintTriggered() {
        val req = JSONObject().apply {
            put("requestId", "req_print_1")
            put("action", "OPEN_SYSTEM_PRINT")
            put("payload", JSONObject().apply {
                put("jobName", "Invoice_INV-2026-001")
            })
        }.toString()

        val response = bridge.handleMessage(req)
        assertNull(response)
        assertEquals("Invoice_INV-2026-001", lastPrintJobName)
    }

    private fun assertNotNull(obj: Any?) {
        assertTrue(obj != null)
    }
}
