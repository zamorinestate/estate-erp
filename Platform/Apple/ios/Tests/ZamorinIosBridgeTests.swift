import XCTest
@testable import ZamorinCafeERP

/// ZAMORIN CAFÉ ERP — iOS CLIENT SECURITY & NATIVE BRIDGE UNIT TEST SUITE
/// Covers all 15 required native-bridge, origin-gating, and document-security categories.
final class ZamorinIosBridgeTests: XCTestCase {

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
    func testProductionOriginsAllowed() {
        XCTAssertTrue(ZamorinSecurityConfig.isAllowedOrigin(url: URL(string: "https://zamorin-cafe-erp.vercel.app")))
        XCTAssertTrue(ZamorinSecurityConfig.isAllowedOrigin(url: URL(string: "https://zamorin.app")))
        XCTAssertTrue(ZamorinSecurityConfig.isAllowedOrigin(url: URL(string: "https://zamorin-cafe-erp-backend.onrender.com")))
    }

    // =========================================================================
    // 2. ORIGIN DENYLIST
    // =========================================================================
    func testDisallowedOriginsRejected() {
        XCTAssertFalse(ZamorinSecurityConfig.isAllowedOrigin(url: URL(string: "http://zamorin-cafe-erp.vercel.app")))
        XCTAssertFalse(ZamorinSecurityConfig.isAllowedOrigin(url: URL(string: "https://malicious-domain.com")))
        XCTAssertFalse(ZamorinSecurityConfig.isAllowedOrigin(url: URL(string: "file:///etc/passwd")))
        XCTAssertFalse(ZamorinSecurityConfig.isAllowedOrigin(url: URL(string: "https://zamorin-cafe-erp.vercel.app.attacker.com")))
        XCTAssertFalse(ZamorinSecurityConfig.isAllowedOrigin(url: nil))
    }

    // =========================================================================
    // 3. UNIVERSAL LINK VALID
    // =========================================================================
    func testValidCafeUniversalLink() {
        let ref1 = ZamorinSecurityConfig.parseCafeLoginReference(url: URL(string: "https://zamorin-cafe-erp.vercel.app/cafe/CB5A84F8/login"))
        XCTAssertEqual(ref1, "CB5A84F8")

        let ref2 = ZamorinSecurityConfig.parseCafeLoginReference(url: URL(string: "https://zamorin.app/cafe/CAFE_KZD_01/login"))
        XCTAssertEqual(ref2, "CAFE_KZD_01")
    }

    // =========================================================================
    // 4. UNIVERSAL LINK INVALID / TAMPERED
    // =========================================================================
    func testInvalidOrTamperedUniversalLink() {
        XCTAssertNil(ZamorinSecurityConfig.parseCafeLoginReference(url: URL(string: "https://untrusted.com/cafe/CB5A84F8/login")))
        XCTAssertNil(ZamorinSecurityConfig.parseCafeLoginReference(url: URL(string: "https://zamorin-cafe-erp.vercel.app/cafe/../../etc/passwd/login")))
        XCTAssertNil(ZamorinSecurityConfig.parseCafeLoginReference(url: URL(string: "https://zamorin-cafe-erp.vercel.app/cafe/CB5A84F8")))
        XCTAssertNil(ZamorinSecurityConfig.parseCafeLoginReference(url: URL(string: "http://zamorin-cafe-erp.vercel.app/cafe/CB5A84F8/login")))
    }

    // =========================================================================
    // 5. VALID NATIVE BRIDGE REQUEST
    // =========================================================================
    func testValidNativeBridgeRequest() {
        let expectation = self.expectation(description: "Valid Request Handled")
        let rawBody: [String: Any] = [
            "requestId": "req_test_001",
            "action": "GET_DEVICE_CAPABILITIES",
            "payload": ["source": "unit_test"]
        ]

        bridge.handleMessage(url: trustedOrigin, rawBody: rawBody) { response in
            XCTAssertEqual(response["requestId"] as? String, "req_test_001")
            XCTAssertEqual(response["success"] as? Bool, true)
            guard let result = response["result"] as? [String: Any] else {
                XCTFail("Missing result payload")
                return
            }
            XCTAssertEqual(result["platform"] as? String, "IOS")
            XCTAssertEqual(result["isNative"] as? Bool, true)
            XCTAssertEqual(result["canSaveFile"] as? Bool, true)
            expectation.fulfill()
        }

        waitForExpectations(timeout: 2.0, handler: nil)
    }

    // =========================================================================
    // 6. MALFORMED REQUEST — MISSING requestId
    // =========================================================================
    func testMissingRequestIdRejected() {
        let expectation = self.expectation(description: "Missing Request ID Rejected")
        let rawBody: [String: Any] = [
            "action": "GET_DEVICE_CAPABILITIES",
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
    func testMissingActionRejected() {
        let expectation = self.expectation(description: "Missing Action Rejected")
        let rawBody: [String: Any] = [
            "requestId": "req_test_002",
            "action": "   "
        ]

        bridge.handleMessage(url: trustedOrigin, rawBody: rawBody) { response in
            XCTAssertEqual(response["requestId"] as? String, "req_test_002")
            XCTAssertEqual(response["success"] as? Bool, false)
            XCTAssertEqual(response["errorCode"] as? String, "MISSING_ACTION")
            expectation.fulfill()
        }

        waitForExpectations(timeout: 2.0, handler: nil)
    }

    // =========================================================================
    // 8. UNKNOWN / UNSUPPORTED ACTION
    // =========================================================================
    func testUnsupportedActionRejected() {
        let expectation = self.expectation(description: "Unsupported Action Rejected")
        let rawBody: [String: Any] = [
            "requestId": "req_test_003",
            "action": "EXECUTE_ARBITRARY_SHELL_COMMAND",
            "payload": ["cmd": "whoami"]
        ]

        bridge.handleMessage(url: trustedOrigin, rawBody: rawBody) { response in
            XCTAssertEqual(response["requestId"] as? String, "req_test_003")
            XCTAssertEqual(response["success"] as? Bool, false)
            XCTAssertEqual(response["errorCode"] as? String, "UNSUPPORTED_ACTION")
            expectation.fulfill()
        }

        waitForExpectations(timeout: 2.0, handler: nil)
    }

    // =========================================================================
    // 9. MALFORMED PAYLOAD TYPE
    // =========================================================================
    func testMalformedPayloadTypeRejected() {
        let expectation = self.expectation(description: "Malformed Payload Type Rejected")
        let rawBody: [String: Any] = [
            "requestId": "req_test_004",
            "action": "GET_DEVICE_CAPABILITIES",
            "payload": "NOT_A_DICTIONARY_STRING"
        ]

        bridge.handleMessage(url: trustedOrigin, rawBody: rawBody) { response in
            XCTAssertEqual(response["requestId"] as? String, "req_test_004")
            XCTAssertEqual(response["success"] as? Bool, false)
            XCTAssertEqual(response["errorCode"] as? String, "MALFORMED_PAYLOAD")
            expectation.fulfill()
        }

        waitForExpectations(timeout: 2.0, handler: nil)
    }

    // =========================================================================
    // 10. UNTRUSTED ORIGIN + PRIVILEGED BRIDGE REQUEST
    // =========================================================================
    func testUntrustedOriginPrivilegedBridgeAttemptDenied() {
        let expectation = self.expectation(description: "Untrusted Origin Denied")
        let rawBody: [String: Any] = [
            "requestId": "req_test_005",
            "action": "SAVE_DOCUMENT",
            "payload": ["base64Data": "SGVsbG8=", "filename": "evil.txt"]
        ]

        bridge.handleMessage(url: untrustedOrigin, rawBody: rawBody) { response in
            XCTAssertEqual(response["success"] as? Bool, false)
            XCTAssertEqual(response["errorCode"] as? String, "UNAUTHORIZED_ORIGIN")
            expectation.fulfill()
        }

        waitForExpectations(timeout: 2.0, handler: nil)
    }

    // =========================================================================
    // 11. DOCUMENT URL VALID PATH SANITIZATION
    // =========================================================================
    func testDocumentUrlValidPathSanitization() {
        let manager = ZamorinDocumentManager.shared
        // Without active security-scoped directory, write must safely fail closed
        let result = manager.writeDocument(subfolder: "Exports/2026", filename: "valid_invoice.pdf", data: Data([0x25, 0x50, 0x44, 0x46]))
        XCTAssertFalse(result.success)
        XCTAssertEqual(result.errorCode, "SECURITY_SCOPED_DIRECTORY_REQUIRED")
    }

    // =========================================================================
    // 12. DOCUMENT URL TRAVERSAL AND UNAUTHORIZED LOCATION DENIED
    // =========================================================================
    func testDocumentUrlTraversalAndUnauthorizedDenied() {
        let manager = ZamorinDocumentManager.shared

        // Attempt path traversal via subfolder
        let traversalResult = manager.writeDocument(subfolder: "../../System/Library", filename: "exploit.pdf", data: Data())
        XCTAssertFalse(traversalResult.success)
        // Traversal is caught first before root check
        XCTAssertTrue(traversalResult.errorCode == "PATH_TRAVERSAL_PROHIBITED" || traversalResult.errorCode == "SECURITY_SCOPED_DIRECTORY_REQUIRED")

        // Attempt root slash subfolder
        let rootResult = manager.writeDocument(subfolder: "/etc/cron.d", filename: "cron_job", data: Data())
        XCTAssertFalse(rootResult.success)
    }

    // =========================================================================
    // 13. RESPONSE CONTRACT & ZERO SECRET/STACK LEAKAGE
    // =========================================================================
    func testBridgeResponseContractAndIntegrity() {
        let response = bridge.buildResponse(
            requestId: "req_test_006",
            success: false,
            result: nil,
            errorCode: "INTERNAL_GATE_ERROR",
            errorMessage: "Safe client-facing error message."
        )

        XCTAssertEqual(response["requestId"] as? String, "req_test_006")
        XCTAssertEqual(response["success"] as? Bool, false)
        XCTAssertEqual(response["errorCode"] as? String, "INTERNAL_GATE_ERROR")
        XCTAssertEqual(response["errorMessage"] as? String, "Safe client-facing error message.")
        XCTAssertNil(response["stack"])
        XCTAssertNil(response["password"])
        XCTAssertNil(response["token"])

        // Test JSON serialization round-trip
        XCTAssertNoThrow(try JSONSerialization.data(withJSONObject: response))
    }

    // =========================================================================
    // 14. SERIALIZATION SAFETY WITH MALFORMED & EMPTY DATA
    // =========================================================================
    func testSerializationSafetyWithMalformedData() {
        let expectation = self.expectation(description: "Malformed Serialization Safety")
        // Send a primitive string instead of dictionary body
        bridge.handleMessage(url: trustedOrigin, rawBody: "RAW_PRIMITIVE_STRING_NOT_DICT") { response in
            XCTAssertEqual(response["success"] as? Bool, false)
            XCTAssertEqual(response["errorCode"] as? String, "MALFORMED_MESSAGE")
            expectation.fulfill()
        }
        waitForExpectations(timeout: 2.0, handler: nil)

        // Send empty dictionary
        let emptyExpectation = self.expectation(description: "Empty Dictionary Handled Safely")
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
    func testExternalUrlRoutingAndNavigationPolicy() {
        // External URLs outside Zamorin allowlist must never be considered valid in-app origins
        let externalBankUrl = URL(string: "https://hdfcbank.com/netbanking")!
        XCTAssertFalse(ZamorinSecurityConfig.isAllowedOrigin(url: externalBankUrl))

        let httpSchemeUrl = URL(string: "http://zamorin-cafe-erp.vercel.app/admin")!
        XCTAssertFalse(ZamorinSecurityConfig.isAllowedOrigin(url: httpSchemeUrl))

        let fileSchemeUrl = URL(string: "file:///var/mobile/Containers/Data")!
        XCTAssertFalse(ZamorinSecurityConfig.isAllowedOrigin(url: fileSchemeUrl))
    }
}
