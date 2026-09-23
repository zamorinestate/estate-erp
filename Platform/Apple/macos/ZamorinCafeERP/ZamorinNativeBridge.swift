import Foundation
import WebKit

/// ZAMORIN CAFÉ ERP — macOS NATIVE MESSAGE BRIDGE
/// Implements Section 10 & 24 WKScriptMessageHandler protocol for macOS desktop.
public class ZamorinNativeBridge: NSObject, WKScriptMessageHandler {

    public protocol BridgeDelegate: AnyObject {
        func onRequestDirectoryPicker(requestId: String)
        func onOpenFilePicker(requestId: String)
        func onOpenSystemPrint(requestId: String, jobName: String)
        func onShareDocument(requestId: String, filename: String, data: Data)
    }

    public weak var delegate: BridgeDelegate?
    public weak var webView: WKWebView?

    public init(delegate: BridgeDelegate? = nil, webView: WKWebView? = nil) {
        self.delegate = delegate
        self.webView = webView
    }

    public func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        handleMessage(url: message.webView?.url, rawBody: message.body)
    }

    public func handleMessage(url: URL?, rawBody: Any?, completion: (([String: Any]) -> Void)? = nil) {
        // 1. Origin Verification
        guard ZamorinSecurityConfig.isAllowedOrigin(url: url) else {
            let res = buildResponse(requestId: "unknown", success: false, result: nil, errorCode: "UNAUTHORIZED_ORIGIN", errorMessage: "Origin is not permitted to access Zamorin native bridge.")
            deliverResponse(res, completion: completion)
            return
        }

        // 2. Message format validation
        guard let body = rawBody as? [String: Any] else {
            let res = buildResponse(requestId: "unknown", success: false, result: nil, errorCode: "MALFORMED_MESSAGE", errorMessage: "Message body must be a dictionary.")
            deliverResponse(res, completion: completion)
            return
        }

        // 3. Request ID validation
        guard let requestId = body["requestId"] as? String, !requestId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            let res = buildResponse(requestId: "unknown", success: false, result: nil, errorCode: "MISSING_REQUEST_ID", errorMessage: "requestId is required.")
            deliverResponse(res, completion: completion)
            return
        }

        // 4. Action validation
        guard let rawAction = body["action"] as? String, !rawAction.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            let res = buildResponse(requestId: requestId, success: false, result: nil, errorCode: "MISSING_ACTION", errorMessage: "action is required.")
            deliverResponse(res, completion: completion)
            return
        }
        let action = rawAction.uppercased().trimmingCharacters(in: .whitespacesAndNewlines)

        // 5. Payload validation
        let payload: [String: Any]
        if let explicitPayload = body["payload"] {
            guard let dictPayload = explicitPayload as? [String: Any] else {
                let res = buildResponse(requestId: requestId, success: false, result: nil, errorCode: "MALFORMED_PAYLOAD", errorMessage: "Payload must be a dictionary.")
                deliverResponse(res, completion: completion)
                return
            }
            payload = dictPayload
        } else {
            payload = [:]
        }

        switch action {
        case "GET_DEVICE_CAPABILITIES", "GET_STORAGE_CAPABILITY":
            let dir = ZamorinMacStorageManager.shared.getAuthorizedDirectory()?.path
            let resPayload: [String: Any] = [
                "platform": "MACOS",
                "isNative": true,
                "canSaveFile": true,
                "canChooseDirectory": true,
                "canPrint": true,
                "canTakePhoto": false,
                "canChoosePhoto": true,
                "canChooseFile": true,
                "canShare": true,
                "currentExportDirectory": dir ?? "",
                "destinationDisplay": dir ?? "Not Configured"
            ]
            let res = buildResponse(requestId: requestId, success: true, result: resPayload)
            deliverResponse(res, completion: completion)

        case "SELECT_EXPORT_DIRECTORY", "CHANGE_EXPORT_DESTINATION":
            delegate?.onRequestDirectoryPicker(requestId: requestId)
            let res = buildResponse(requestId: requestId, success: true, result: ["action": "DIRECTORY_PICKER_INVOKED"])
            deliverResponse(res, completion: completion)

        case "SAVE_DOCUMENT":
            guard let base64Str = payload["base64Data"] as? String,
                  let data = Data(base64Encoded: base64Str) else {
                let res = buildResponse(requestId: requestId, success: false, result: nil, errorCode: "INVALID_BASE64_DATA", errorMessage: "Document data could not be base64 decoded.")
                deliverResponse(res, completion: completion)
                return
            }
            let filename = payload["filename"] as? String ?? "zamorin_export"
            let subfolder = payload["subfolder"] as? String ?? "ZAMORIN ERP/Exports"

            let writeRes = ZamorinMacStorageManager.shared.writeDocument(subfolder: subfolder, filename: filename, data: data)
            if writeRes.success {
                let resPayload: [String: Any] = [
                    "filePath": writeRes.filePath ?? "",
                    "filename": writeRes.filename,
                    "bytesWritten": writeRes.bytesWritten
                ]
                let res = buildResponse(requestId: requestId, success: true, result: resPayload)
                deliverResponse(res, completion: completion)
            } else {
                let res = buildResponse(requestId: requestId, success: false, result: nil, errorCode: writeRes.errorCode ?? "WRITE_FAILED", errorMessage: writeRes.errorMessage)
                deliverResponse(res, completion: completion)
            }

        case "PRINT_DOCUMENT", "OPEN_SYSTEM_PRINT":
            let jobName = payload["jobName"] as? String ?? "Zamorin_Document"
            delegate?.onOpenSystemPrint(requestId: requestId, jobName: jobName)
            let res = buildResponse(requestId: requestId, success: true, result: ["jobName": jobName])
            deliverResponse(res, completion: completion)

        case "CHOOSE_FILE", "SELECT_FILE":
            delegate?.onOpenFilePicker(requestId: requestId)
            let res = buildResponse(requestId: requestId, success: true, result: ["action": "FILE_PICKER_INVOKED"])
            deliverResponse(res, completion: completion)

        case "SHARE_DOCUMENT":
            let filename = payload["filename"] as? String ?? "share_document"
            let base64Str = payload["base64Data"] as? String ?? ""
            guard let data = Data(base64Encoded: base64Str) else {
                let res = buildResponse(requestId: requestId, success: false, result: nil, errorCode: "INVALID_BASE64_DATA", errorMessage: "Data decoding failed.")
                deliverResponse(res, completion: completion)
                return
            }
            delegate?.onShareDocument(requestId: requestId, filename: filename, data: data)
            let res = buildResponse(requestId: requestId, success: true, result: ["shared": true])
            deliverResponse(res, completion: completion)

        default:
            let res = buildResponse(requestId: requestId, success: false, result: nil, errorCode: "UNSUPPORTED_ACTION", errorMessage: "Action '\(action)' is not supported on macOS.")
            deliverResponse(res, completion: completion)
        }
    }

    public func buildResponse(
        requestId: String,
        success: Bool,
        result: [String: Any]?,
        errorCode: String? = nil,
        errorMessage: String? = nil
    ) -> [String: Any] {
        var responseDict: [String: Any] = [
            "requestId": requestId,
            "success": success
        ]
        if let result = result { responseDict["result"] = result }
        if let errorCode = errorCode { responseDict["errorCode"] = errorCode }
        if let errorMessage = errorMessage { responseDict["errorMessage"] = errorMessage }
        return responseDict
    }

    private func deliverResponse(_ responseDict: [String: Any], completion: (([String: Any]) -> Void)? = nil) {
        completion?(responseDict)
        guard let jsonData = try? JSONSerialization.data(withJSONObject: responseDict),
              let jsonString = String(data: jsonData, encoding: .utf8) else {
            return
        }

        let js = "window.postMessage(\(jsonString), '*');"
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript(js, completionHandler: nil)
        }
    }

    public func respond(
        requestId: String,
        success: Bool,
        result: [String: Any]?,
        errorCode: String? = nil,
        errorMessage: String? = nil
    ) {
        let responseDict = buildResponse(
            requestId: requestId,
            success: success,
            result: result,
            errorCode: errorCode,
            errorMessage: errorMessage
        )
        deliverResponse(responseDict, completion: nil)
    }
}
