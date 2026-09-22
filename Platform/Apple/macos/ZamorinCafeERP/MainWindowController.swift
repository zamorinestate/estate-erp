import AppKit
import WebKit

/// ZAMORIN CAFÉ ERP — macOS PRIMARY WINDOW CONTROLLER
/// Implements Section 10 desktop window, App Sandbox file panels, and print operations.
public class MainWindowController: NSWindowController, WKNavigationDelegate, ZamorinNativeBridge.BridgeDelegate {

    private var webView: WKWebView!
    private var bridge: ZamorinNativeBridge!

    public convenience init() {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1200, height: 800),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Zamorin Café ERP"
        window.center()
        window.minSize = NSSize(width: 900, height: 600)

        self.init(window: window)
        configureWebView()
        loadInitialUrl()
    }

    private func configureWebView() {
        let config = WKWebViewConfiguration()
        let contentController = WKUserContentController()

        bridge = ZamorinNativeBridge(delegate: self)
        contentController.add(bridge, name: "ZamorinNativeBridge")
        config.userContentController = contentController

        webView = WKWebView(frame: window!.contentView!.bounds, configuration: config)
        webView.autoresizingMask = [.width, .height]
        webView.navigationDelegate = self
        bridge.webView = webView

        window?.contentView?.addSubview(webView)
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

        // External unapproved link: Launch in default macOS browser
        NSWorkspace.shared.open(url)
        decisionHandler(.cancel)
    }

    // --- BridgeDelegate ---

    public func onRequestDirectoryPicker(requestId: String) {
        let panel = NSOpenPanel()
        panel.title = "Select Zamorin ERP Export Directory"
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.canCreateDirectories = true

        panel.beginSheetModal(for: window!) { [weak self] response in
            if response == .OK, let selectedUrl = panel.url {
                let saved = ZamorinMacStorageManager.shared.saveBookmark(url: selectedUrl)
                self?.bridge.respond(
                    requestId: requestId,
                    success: saved,
                    result: ["directory": selectedUrl.path, "destinationDisplay": selectedUrl.path],
                    errorCode: saved ? nil : "BOOKMARK_SAVE_FAILED",
                    errorMessage: saved ? nil : "Failed to persist App Sandbox bookmark."
                )
            } else {
                self?.bridge.respond(requestId: requestId, success: false, result: ["cancelled": true], errorCode: "SELECTION_CANCELLED")
            }
        }
    }

    public func onOpenFilePicker(requestId: String) {
        let panel = NSOpenPanel()
        panel.title = "Select Attachment"
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false

        panel.beginSheetModal(for: window!) { [weak self] response in
            if response == .OK, let selectedUrl = panel.url {
                self?.bridge.respond(requestId: requestId, success: true, result: ["filePath": selectedUrl.path])
            } else {
                self?.bridge.respond(requestId: requestId, success: false, result: ["cancelled": true], errorCode: "FILE_PICKER_CANCELLED")
            }
        }
    }

    public func onOpenSystemPrint(requestId: String, jobName: String) {
        let printInfo = NSPrintInfo.shared
        printInfo.orientation = .portrait
        printInfo.topMargin = 20
        printInfo.bottomMargin = 20

        let printOperation = webView.printOperation(with: printInfo)
        printOperation.jobTitle = jobName
        printOperation.showsPrintPanel = true

        printOperation.runModal(for: window!, delegate: nil, didRun: nil, contextInfo: nil)
        bridge.respond(requestId: requestId, success: true, result: ["jobName": jobName])
    }

    public func onShareDocument(requestId: String, filename: String, data: Data) {
        let tempUrl = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
        do {
            try data.write(to: tempUrl, options: .atomic)
            NSWorkspace.shared.activateFileViewerSelecting([tempUrl])
            bridge.respond(requestId: requestId, success: true, result: ["shared": true])
        } catch {
            bridge.respond(requestId: requestId, success: false, result: nil, errorCode: "SHARE_FAILED", errorMessage: error.localizedDescription)
        }
    }
}
