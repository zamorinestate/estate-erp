package com.zamorin.cafe.erp

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * ZAMORIN CAFÉ ERP — STORAGE ACCESS FRAMEWORK (SAF) RESTRICTION & VALIDATION SUITE
 *
 * Verifies ANDROID-SAF-REAL-01 through ANDROID-SAF-REAL-09:
 * - ANDROID-SAF-REAL-07: Download root restrictions (Android 11+)
 * - ANDROID-SAF-REAL-08: Android/data & Android/obb restrictions
 * - ANDROID-SAF-REAL-09: Primary internal root and SD-card volume root restrictions
 * - Authoritative non-bypassable Scoped Storage validation
 */
class ZamorinSafManagerTest {

    @Test
    fun testAndroidSafReal07_DownloadRootRestricted() {
        // Direct Download root tree URIs must be rejected
        assertTrue(
            "Primary Download root must be restricted",
            ZamorinSafManager.isRestrictedLocation("content://com.android.externalstorage.documents/tree/primary%3adownload")
        )
        assertTrue(
            "Primary Download root with slash must be restricted",
            ZamorinSafManager.isRestrictedLocation("content://com.android.externalstorage.documents/tree/primary:download/")
        )
        assertTrue(
            "Providers Download root must be restricted",
            ZamorinSafManager.isRestrictedLocation("content://com.android.providers.downloads.documents/tree/downloads")
        )
        assertTrue(
            "Providers Download root with trailing slash must be restricted",
            ZamorinSafManager.isRestrictedLocation("content://com.android.providers.downloads.documents/tree/downloads/")
        )
    }

    @Test
    fun testAndroidSafReal08_AndroidDataAndObbRestricted() {
        // Direct or subfolder trees targeting Android/data or Android/obb must be rejected
        assertTrue(
            "Android/data encoded must be restricted",
            ZamorinSafManager.isRestrictedLocation("content://com.android.externalstorage.documents/tree/primary%3aAndroid%2fdata")
        )
        assertTrue(
            "Android/data unencoded must be restricted",
            ZamorinSafManager.isRestrictedLocation("content://com.android.externalstorage.documents/tree/primary:Android/data")
        )
        assertTrue(
            "Android/obb encoded must be restricted",
            ZamorinSafManager.isRestrictedLocation("content://com.android.externalstorage.documents/tree/primary%3aAndroid%2fobb")
        )
        assertTrue(
            "Android/obb unencoded must be restricted",
            ZamorinSafManager.isRestrictedLocation("content://com.android.externalstorage.documents/tree/primary:Android/obb")
        )
    }

    @Test
    fun testAndroidSafReal09_StorageRootsRestricted() {
        // Primary internal root /tree/primary: or secondary SD root /tree/1234-5678:
        assertTrue(
            "Primary storage root must be restricted",
            ZamorinSafManager.isRestrictedLocation("content://com.android.externalstorage.documents/tree/primary%3a")
        )
        assertTrue(
            "Primary storage root plain colon must be restricted",
            ZamorinSafManager.isRestrictedLocation("content://com.android.externalstorage.documents/tree/primary:")
        )
        assertTrue(
            "Secondary SD volume root must be restricted",
            ZamorinSafManager.isRestrictedLocation("content://com.android.externalstorage.documents/tree/1A2B-3C4D%3a")
        )
        assertTrue(
            "Secondary SD volume root plain colon must be restricted",
            ZamorinSafManager.isRestrictedLocation("content://com.android.externalstorage.documents/tree/ABCD-1234:")
        )
    }

    @Test
    fun testAndroidSafReal_PermittedUserDirectoriesAllowed() {
        // User-created folder or document trees are permitted
        assertFalse(
            "User-selected Documents subfolder is allowed",
            ZamorinSafManager.isRestrictedLocation("content://com.android.externalstorage.documents/tree/primary%3aDocuments%2fZamorinExports")
        )
        assertFalse(
            "User-selected custom POS folder is allowed",
            ZamorinSafManager.isRestrictedLocation("content://com.android.externalstorage.documents/tree/primary%3aZamorinERP")
        )
        assertFalse(
            "Secondary SD card custom folder is allowed",
            ZamorinSafManager.isRestrictedLocation("content://com.android.externalstorage.documents/tree/1A2B-3C4D%3aZamorinBackup")
        )
    }

    @Test
    fun testNullOrEmptyUriTreatedAsRestricted() {
        assertTrue(ZamorinSafManager.isRestrictedLocation(null as String?))
        assertTrue(ZamorinSafManager.isRestrictedLocation(""))
        assertTrue(ZamorinSafManager.isRestrictedLocation("   "))
    }
}
