import XCTest
@testable import ZamorinCafeERP

/// ZAMORIN CAFÉ ERP — macOS CLIENT SECURITY & NATIVE BRIDGE UNIT TEST SUITE
/// Covers all required macOS native-bridge, origin-gating, document-security, and bookmark categories.
final class ZamorinMacBridgeTests: XCTestCase {

    var bridge: ZamorinNativeBridge!
    let trustedOrigin = URL(string: "https://zamorin-cafe-erp.vercel.app")!
    let untrustedOrigin = URL(string: "https://attacker-controlled.site")!

    override func setUp() {
        super.setUp()
        bridge = ZamorinNativeBridge()
    }

    override func tearDown() {
        bridge = nil
        super.tearDown()
    }

    // =========================================================================
    // 1. ORIGIN ALLOWLIST
    // =========================================================================
    func testMacProductionOriginsAllowed() {
        XCTAssertTrue(ZamorinSecurityConfig.isAllowedOrigin(url: URL(string: "https://zamorin-cafe-erp.vercel.app")))
        XCTAssertTrue(ZamorinSecurityConfig.isAllowedOrigin(url: URL(string: "https://zamorin.app")))
        XCTAssertTrue(ZamorinSecurityConfig.isAllowedOrigin(url: URL(string: "https://zamorin-cafe-erp-backend.onrender.com")))
    }

    // =========================================================================
    // 2. ORIGIN DENYLIST
    // =========================================================================
    func testMacDisallowedOriginsRejected() {
        XCTAssertFalse(ZamorinSecurityConfig.isAllowedOrigin(url: URL(string: "http://zamorin-cafe-erp.vercel.app")))
        XCTAssertFalse(ZamorinSecurityConfig.isAllowedOrigin(url: URL(string: "https://phishing.com")))
        XCTAssertFalse(ZamorinSecurityConfig.isAllowedOrigin(url: URL(string: "file:///System/Library")))
        XCTAssertFalse(ZamorinSecurityConfig.isAllowedOrigin(url: URL(string: "https://zamorin.app.attacker.com")))
        XCTAssertFalse(ZamorinSecurityConfig.isAllowedOrigin(url: nil))
    }

    // =========================================================================
    // 3. UNIVERSAL LINK VALID
    // =========================================================================
    func testMacUniversalLinkParsing() {
        let ref1 = ZamorinSecurityConfig.parseCafeLoginReference(url: URL(string: "https://zamorin-cafe-erp.vercel.app/cafe/CB5A84F8/login"))
        XCTAssertEqual(ref1, "CB5A84F8")

        let ref2 = ZamorinSecurityConfig.parseCafeLoginReference(url: URL(string: "https://zamorin.app/cafe/CAFE_KZD_01/login"))
        XCTAssertEqual(ref2, "CAFE_KZD_01")
    }

    // =========================================================================
    // 4. UNIVERSAL LINK INVALID / TAMPERED
    // =========================================================================
    func testMacTamperedUniversalLinkRejected() {
        XCTAssertNil(ZamorinSecurityConfig.parseCafeLoginReference(url: URL(string: "https://evil.com/cafe/CB5A84F8/login")))
        XCTAssertNil(ZamorinSecurityConfig.parseCafeLoginReference(url: URL(string: "https://zamorin-cafe-erp.vercel.app/cafe/CB5A84F8/admin")))
        XCTAssertNil(ZamorinSecurityConfig.parseCafeLoginReference(url: URL(string: "https://zamorin-cafe-erp.vercel.app/cafe/../../System/login")))
        XCTAssertNil(ZamorinSecurityConfig.parseCafeLoginReference(url: URL(string: "http://zamorin-cafe-erp.vercel.app/cafe/CB5A84F8/login")))
    }

    // =========================================================================
    // 5. VALID NATIVE BRIDGE REQUEST
    // =========================================================================
    func testMacValidNativeBridgeRequest() {
        let expectation = self.expectation(description: "Valid macOS Native Request Handled")
        let rawBody: [String: Any] = [
            "requestId": "mac_req_001",
            "action": "GET_DEVICE_CAPABILITIES",
            "payload": ["source": "unit_test"]
        ]

        bridge.handleMessage(url: trustedOrigin, rawBody: rawBody) { response in
            XCTAssertEqual(response["requestId"] as? String, "mac_req_001")
            XCTAssertEqual(response["success"] as? Bool, true)
            guard let result = response["result"] as? [String: Any] else {
                XCTFail("Missing result payload in response")
                return
            }
            XCTAssertEqual(result["platform"] as? String, "MACOS")
            XCTAssertEqual(result["isNative"] as? Bool, true)
            XCTAssertEqual(result["canChooseDirectory"] as? Bool, true)
            XCTAssertEqual(result["canPrint"] as? Bool, true)
            expectation.fulfill()
        }

        waitForExpectations(timeout: 2.0, handler: nil)
    }

    // =========================================================================
    // 6. MALFORMED REQUEST — MISSING requestId
    // =========================================================================
    func testMacMissingRequestIdRejected() {
        let expectation = self.expectation(description: "macOS Missing Request ID Rejected")
        let rawBody: [String: Any] = [
            "action": "GET_STORAGE_CAPABILITY",
            "payload": [:]
        ]

        bridge.handleMessage(url: trustedOrigin, rawBody: rawBody) { response in
            XCTAssertEqual(response["success"] as? Bool, false)
            XCTAssertEqual(response["errorCode"] as? String, "MISSING_REQUEST_ID")
            expectation.fulfill()
        }

        waitForExpectations(timeout: 2.0, handler: nil)
    }

    // =========================================================================
    // 7. MALFORMED REQUEST — MISSING ACTION
    // =========================================================================
    func testMacMissingActionRejected() {
        let expectation = self.expectation(description: "macOS Missing Action Rejected")
        let rawBody: [String: Any] = [
            "requestId": "mac_req_002",
            "action": "   "
        ]

        bridge.handleMessage(url: trustedOrigin, rawBody: rawBody) { response in
            XCTAssertEqual(response["requestId"] as? String, "mac_req_002")
            XCTAssertEqual(response["success"] as? Bool, false)
            XCTAssertEqual(response["errorCode"] as? String, "MISSING_ACTION")
            expectation.fulfill()
        }

        waitForExpectations(timeout: 2.0, handler: nil)
    }

    // =========================================================================
    // 8. UNKNOWN / UNSUPPORTED ACTION
    // =========================================================================
    func testMacUnsupportedActionRejected() {
        let expectation = self.expectation(description: "macOS Unsupported Action Rejected")
        let rawBody: [String: Any] = [
            "requestId": "mac_req_003",
            "action": "EXECUTE_ARBITRARY_TERMINAL_COMMAND",
            "payload": ["cmd": "rm -rf /"]
        ]

        bridge.handleMessage(url: trustedOrigin, rawBody: rawBody) { response in
            XCTAssertEqual(response["requestId"] as? String, "mac_req_003")
            XCTAssertEqual(response["success"] as? Bool, false)
            XCTAssertEqual(response["errorCode"] as? String, "UNSUPPORTED_ACTION")
            expectation.fulfill()
        }

        waitForExpectations(timeout: 2.0, handler: nil)
    }

    // =========================================================================
    // 9. MALFORMED PAYLOAD TYPE
    // =========================================================================
    func testMacMalformedPayloadTypeRejected() {
        let expectation = self.expectation(description: "macOS Malformed Payload Type Rejected")
        let rawBody: [String: Any] = [
            "requestId": "mac_req_004",
            "action": "GET_DEVICE_CAPABILITIES",
            "payload": "UNEXPECTED_RAW_STRING_NOT_DICT"
        ]

        bridge.handleMessage(url: trustedOrigin, rawBody: rawBody) { response in
            XCTAssertEqual(response["requestId"] as? String, "mac_req_004")
            XCTAssertEqual(response["success"] as? Bool, false)
            XCTAssertEqual(response["errorCode"] as? String, "MALFORMED_PAYLOAD")
            expectation.fulfill()
        }

        waitForExpectations(timeout: 2.0, handler: nil)
    }

    // =========================================================================
    // 10. UNTRUSTED ORIGIN + PRIVILEGED BRIDGE REQUEST
    // =========================================================================
    func testMacUntrustedOriginPrivilegedBridgeAttemptDenied() {
        let expectation = self.expectation(description: "macOS Untrusted Origin Denied")
        let rawBody: [String: Any] = [
            "requestId": "mac_req_005",
            "action": "SAVE_DOCUMENT",
            "payload": ["base64Data": "SGVsbG8=", "filename": "evil.sh"]
        ]

        bridge.handleMessage(url: untrustedOrigin, rawBody: rawBody) { response in
            XCTAssertEqual(response["success"] as? Bool, false)
            XCTAssertEqual(response["errorCode"] as? String, "UNAUTHORIZED_ORIGIN")
            expectation.fulfill()
        }

        waitForExpectations(timeout: 2.0, handler: nil)
    }

    // =========================================================================
    // 11. SECURITY-SCOPED BOOKMARK & PATH TRAVERSAL PROHIBITION
    // =========================================================================
    func testMacSecurityScopedBookmarkAndTraversalProhibition() {
        let manager = ZamorinMacStorageManager.shared
        manager.clearAuthorizedDirectory()

        // Unconfigured directory must fail closed
        let unconfiguredResult = manager.writeDocument(subfolder: "Exports", filename: "invoice.pdf", data: Data([0x25, 0x50, 0x44, 0x46]))
        XCTAssertFalse(unconfiguredResult.success)
        XCTAssertEqual(unconfiguredResult.errorCode, "STORAGE_PERMISSION_REQUIRED")

        // Path traversal must fail closed
        let traversalResult = manager.writeDocument(subfolder: "../../usr/bin", filename: "exploit", data: Data())
        XCTAssertFalse(traversalResult.success)
        XCTAssertTrue(traversalResult.errorCode == "PATH_TRAVERSAL_PROHIBITED" || traversalResult.errorCode == "STORAGE_PERMISSION_REQUIRED")

        // Root slash path must fail closed
        let rootResult = manager.writeDocument(subfolder: "/etc", filename: "passwd", data: Data())
        XCTAssertFalse(rootResult.success)
    }

    // =========================================================================
    // 12. BOOKMARK INVALID / STALE HANDLING
    // =========================================================================
    func testMacBookmarkInvalidAndStaleHandling() {
        let manager = ZamorinMacStorageManager.shared

        // Inject corrupt bookmark bytes into UserDefaults
        UserDefaults.standard.set(Data([0xDE, 0xAD, 0xBE, 0xEF, 0x00, 0x01]), forKey: "zamorin_macos_storage_bookmark")
        
        // Restore must safely recover, clear the corrupt bookmark, and leave authorized URL as nil
        manager.restoreBookmark()
        XCTAssertNil(manager.getAuthorizedDirectory())
        XCTAssertNil(UserDefaults.standard.data(forKey: "zamorin_macos_storage_bookmark"))

        // Re-clearing must be safe and idempotent
        manager.clearAuthorizedDirectory()
        XCTAssertNil(manager.getAuthorizedDirectory())
    }

    // =========================================================================
    // 13. RESPONSE CONTRACT & ZERO SECRET/STACK LEAKAGE
    // =========================================================================
    func testMacBridgeResponseContractAndIntegrity() {
        let response = bridge.buildResponse(
            requestId: "mac_req_006",
            success: false,
            result: nil,
            errorCode: "STORAGE_PERMISSION_REQUIRED",
            errorMessage: "No user-authorized directory configured."
        )

        XCTAssertEqual(response["requestId"] as? String, "mac_req_006")
        XCTAssertEqual(response["success"] as? Bool, false)
        XCTAssertEqual(response["errorCode"] as? String, "STORAGE_PERMISSION_REQUIRED")
        XCTAssertEqual(response["errorMessage"] as? String, "No user-authorized directory configured.")
        XCTAssertNil(response["stack"])
        XCTAssertNil(response["secret"])
        XCTAssertNil(response["token"])

        // Test JSON serialization round-trip
        XCTAssertNoThrow(try JSONSerialization.data(withJSONObject: response))
    }

    // =========================================================================
    // 14. SERIALIZATION SAFETY WITH MALFORMED & EMPTY DATA
    // =========================================================================
    func testMacSerializationSafetyWithMalformedData() {
        let expectation = self.expectation(description: "macOS Malformed Serialization Safety")
        bridge.handleMessage(url: trustedOrigin, rawBody: "PRIMITIVE_STRING_NOT_A_MAP") { response in
            XCTAssertEqual(response["success"] as? Bool, false)
            XCTAssertEqual(response["errorCode"] as? String, "MALFORMED_MESSAGE")
            expectation.fulfill()
        }
        waitForExpectations(timeout: 2.0, handler: nil)

        let emptyExpectation = self.expectation(description: "macOS Empty Dictionary Handled Safely")
        bridge.handleMessage(url: trustedOrigin, rawBody: [:] as [String: Any]) { response in
            XCTAssertEqual(response["success"] as? Bool, false)
            XCTAssertEqual(response["errorCode"] as? String, "MISSING_REQUEST_ID")
            emptyExpectation.fulfill()
        }
        waitForExpectations(timeout: 2.0, handler: nil)
    }

    // =========================================================================
    // 15. EXTERNAL URL ROUTING & NAVIGATION POLICY
    // =========================================================================
    func testMacExternalUrlRoutingAndNavigationPolicy() {
        let externalPaymentUrl = URL(string: "https://pg.razorpay.com/payment")!
        XCTAssertFalse(ZamorinSecurityConfig.isAllowedOrigin(url: externalPaymentUrl))

        let httpOriginUrl = URL(string: "http://zamorin-cafe-erp.vercel.app/pos")!
        XCTAssertFalse(ZamorinSecurityConfig.isAllowedOrigin(url: httpOriginUrl))

        let fileOriginUrl = URL(string: "file:///Applications/Calculator.app")!
        XCTAssertFalse(ZamorinSecurityConfig.isAllowedOrigin(url: fileOriginUrl))
    }
}
