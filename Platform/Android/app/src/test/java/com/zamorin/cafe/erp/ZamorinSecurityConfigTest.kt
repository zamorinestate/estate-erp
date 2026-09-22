package com.zamorin.cafe.erp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * ZAMORIN CAFÉ ERP — SECURITY CONFIG & APP LINK UNIT TESTS
 */
class ZamorinSecurityConfigTest {

    @Test
    fun testProductionOriginsAccepted() {
        assertTrue(ZamorinSecurityConfig.isAllowedOrigin("https://zamorin-cafe-erp.vercel.app"))
        assertTrue(ZamorinSecurityConfig.isAllowedOrigin("https://zamorin.app"))
        assertTrue(ZamorinSecurityConfig.isAllowedOrigin("https://zamorin-cafe-erp-backend.onrender.com"))
    }

    @Test
    fun testDisallowedOriginsRejected() {
        assertFalse(ZamorinSecurityConfig.isAllowedOrigin("http://zamorin-cafe-erp.vercel.app")) // cleartext in prod
        assertFalse(ZamorinSecurityConfig.isAllowedOrigin("https://malicious-phishing.com"))
        assertFalse(ZamorinSecurityConfig.isAllowedOrigin("https://attacker.zamorin-cafe-erp.vercel.app"))
        assertFalse(ZamorinSecurityConfig.isAllowedOrigin("javascript:alert(1)"))
        assertFalse(ZamorinSecurityConfig.isAllowedOrigin("file:///android_asset/index.html"))
        assertFalse(ZamorinSecurityConfig.isAllowedOrigin(null))
        assertFalse(ZamorinSecurityConfig.isAllowedOrigin(""))
    }

    @Test
    fun testDebugOriginsOnlyInDebugMode() {
        assertFalse(ZamorinSecurityConfig.isAllowedOrigin("http://10.0.2.2:3000", isDebug = false))
        assertFalse(ZamorinSecurityConfig.isAllowedOrigin("http://localhost:3000", isDebug = false))

        assertTrue(ZamorinSecurityConfig.isAllowedOrigin("http://10.0.2.2:3000", isDebug = true))
        assertTrue(ZamorinSecurityConfig.isAllowedOrigin("http://localhost:3000", isDebug = true))
    }

    @Test
    fun testValidCafeAppLinkParsing() {
        val ref1 = ZamorinSecurityConfig.parseCafeLoginReference("https://zamorin-cafe-erp.vercel.app/cafe/CB5A84F8/login")
        assertEquals("CB5A84F8", ref1)

        val ref2 = ZamorinSecurityConfig.parseCafeLoginReference("https://zamorin.app/cafe/CAFE_KZD_01/login")
        assertEquals("CAFE_KZD_01", ref2)
    }

    @Test
    fun testInvalidOrTamperedCafeAppLinkRejected() {
        // Non-production host
        assertNull(ZamorinSecurityConfig.parseCafeLoginReference("https://untrusted.com/cafe/CB5A84F8/login"))
        // HTTP instead of HTTPS
        assertNull(ZamorinSecurityConfig.parseCafeLoginReference("http://zamorin-cafe-erp.vercel.app/cafe/CB5A84F8/login"))
        // Malformed path or missing login segment
        assertNull(ZamorinSecurityConfig.parseCafeLoginReference("https://zamorin-cafe-erp.vercel.app/cafe/CB5A84F8/admin"))
        assertNull(ZamorinSecurityConfig.parseCafeLoginReference("https://zamorin-cafe-erp.vercel.app/cafe/CB5A84F8"))
        // Path traversal attack in token
        assertNull(ZamorinSecurityConfig.parseCafeLoginReference("https://zamorin-cafe-erp.vercel.app/cafe/../../etc/passwd/login"))
        // Malicious characters
        assertNull(ZamorinSecurityConfig.parseCafeLoginReference("https://zamorin-cafe-erp.vercel.app/cafe/<script>/login"))
    }

    @Test
    fun testBuildCafeLoginUrl() {
        val prodUrl = ZamorinSecurityConfig.buildCafeLoginUrl("CB5A84F8", isDebug = false)
        assertEquals("https://zamorin-cafe-erp.vercel.app/cafe/CB5A84F8/login", prodUrl)

        val debugUrl = ZamorinSecurityConfig.buildCafeLoginUrl("CB5A84F8", isDebug = true)
        assertEquals("http://10.0.2.2:3000/cafe/CB5A84F8/login", debugUrl)
    }
}
