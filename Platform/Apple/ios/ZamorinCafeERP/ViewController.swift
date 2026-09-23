import UIKit
import WebKit

/// ZAMORIN CAFÉ ERP — iOS PRIMARY VIEW CONTROLLER
/// Implements Section 3 & 4 hardened WKWebView hosting and device integrations.
public class ViewController: UIViewController, WKNavigationDelegate, ZamorinNativeBridge.BridgeDelegate {

    private var webView: WKWebView!
    private var bridge: ZamorinNativeBridge!

    public override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.06, green: 0.09, blue: 0.16, alpha: 1.0)

        configureWebView()
        loadInitialUrl()
    }

    private func configureWebView() {
        let config = WKWebViewConfiguration()
        let contentController = WKUserContentController()

        bridge = ZamorinNativeBridge(delegate: self)
        contentController.add(bridge, name: "ZamorinNativeBridge")
        config.userContentController = contentController

        // Security Hardening: Disable arbitrary local file access
        config.preferences.setValue(false, forKey: "allowFileAccessFromFileURLs")

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.navigationDelegate = self
        bridge.webView = webView

        view.addSubview(webView)
    }

    private func loadInitialUrl() {
        if let url = URL(string: ZamorinSecurityConfig.productionBaseUrl) {
            webView.load(URLRequest(url: url))
        }
    }

    public func handleUniversalLink(url: URL) -> Bool {
        if let cafeRef = ZamorinSecurityConfig.parseCafeLoginReference(url: url) {
            let targetUrl = ZamorinSecurityConfig.buildCafeLoginUrl(publicRef: cafeRef)
            webView.load(URLRequest(url: targetUrl))
            return true
        }
        return false
    }

    // --- WKNavigationDelegate ---

    public func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }

        if ZamorinSecurityConfig.isAllowedOrigin(url: url) {
            decisionHandler(.allow)
            return
        }

        // External unapproved link: Launch in Safari
        UIApplication.shared.open(url, options: [:], completionHandler: nil)
        decisionHandler(.cancel)
    }

    // --- BridgeDelegate ---

    public func onRequestDirectoryPicker(requestId: String) {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.folder], asCopy: false)
        picker.modalPresentationStyle = .formSheet
        present(picker, animated: true)
    }

    public func onTakePhoto(requestId: String) {
        guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
            bridge.respond(requestId: requestId, success: false, result: nil, errorCode: "CAMERA_UNAVAILABLE", errorMessage: "Device camera is unavailable.")
            return
        }
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        present(picker, animated: true)
    }

    public func onChoosePhoto(requestId: String) {
        let picker = UIImagePickerController()
        picker.sourceType = .photoLibrary
        present(picker, animated: true)
    }

    public func onChooseFile(requestId: String) {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.item], asCopy: true)
        picker.modalPresentationStyle = .formSheet
        present(picker, animated: true)
    }

    public func onOpenSystemPrint(requestId: String, jobName: String) {
        let printController = UIPrintInteractionController.shared
        let printInfo = UIPrintInfo(dictionary: nil)
        printInfo.outputType = .general
        printInfo.jobName = jobName
        printController.printInfo = printInfo
        printController.printFormatter = webView.viewPrintFormatter()

        printController.present(animated: true) { [weak self] (_, completed, error) in
            self?.bridge.respond(
                requestId: requestId,
                success: completed,
                result: ["jobName": jobName],
                errorCode: error != nil ? "PRINT_FAILED" : nil,
                errorMessage: error?.localizedDescription
            )
        }
    }

    public func onShareDocument(requestId: String, filename: String, data: Data) {
        let tempUrl = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
        do {
            try data.write(to: tempUrl, options: .atomic)
            let activityVc = UIActivityViewController(activityItems: [tempUrl], applicationActivities: nil)
            present(activityVc, animated: true) { [weak self] in
                self?.bridge.respond(requestId: requestId, success: true, result: ["shared": true])
            }
        } catch {
            bridge.respond(requestId: requestId, success: false, result: nil, errorCode: "SHARE_FAILED", errorMessage: error.localizedDescription)
        }
    }
}
