package com.zamorin.cafe.erp

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.view.View
import android.webkit.CookieManager
import android.webkit.SslErrorHandler
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ProgressBar
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

/**
 * ZAMORIN CAFÉ ERP — PRIMARY ANDROID CONTAINER
 *
 * Implements hardened WebView hosting of the Zamorin ERP frontend:
 * - Strictly isolated production and debug origins
 * - Safe Browsing and non-bypassable SSL validation (cancellation on error)
 * - Prohibited file://, content://, and arbitrary navigation
 * - Native Storage Access Framework (SAF) integration
 * - Android Print Framework integration
 * - Native Camera & File chooser coordination
 * - Universal Verified Android App Links (/cafe/<public-ref>/login)
 */
class MainActivity : AppCompatActivity(), ZamorinNativeBridge.BridgeCallbacks {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar

    private lateinit var nativeBridge: ZamorinNativeBridge
    private lateinit var attachmentCoordinator: ZamorinAttachmentCoordinator

    private lateinit var directoryPickerLauncher: ActivityResultLauncher<Uri?>
    private lateinit var cameraCaptureLauncher: ActivityResultLauncher<Uri>
    private lateinit var filePickerLauncher: ActivityResultLauncher<Intent>

    private var pendingDirectoryPickerRequestId: String? = null
    private var pendingDirectoryReplyProxy: JavaScriptReplyProxy? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.zamorin_webview)
        progressBar = findViewById(R.id.loading_progress)

        nativeBridge = ZamorinNativeBridge(this, this)
        attachmentCoordinator = ZamorinAttachmentCoordinator(this)

        registerActivityLaunchers()
        configureWebView()
        setupMessageBridge()
        setupBackNavigation()

        handleAppLaunchIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleAppLaunchIntent(intent)
    }

    private fun registerActivityLaunchers() {
        directoryPickerLauncher = registerForActivityResult(
            ActivityResultContracts.OpenDocumentTree()
        ) { treeUri: Uri? ->
            handleDirectoryPickerResult(treeUri)
        }

        cameraCaptureLauncher = registerForActivityResult(
            ActivityResultContracts.TakePicture()
        ) { success: Boolean ->
            attachmentCoordinator.handleCameraResult(success)
        }

        filePickerLauncher = registerForActivityResult(
            ActivityResultContracts.StartActivityForResult()
        ) { result ->
            attachmentCoordinator.handlePickerResult(result.resultCode, result.data)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        val settings = webView.settings

        // Enable required client-side execution while strictly locking filesystem and scheme vectors
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = false

        // Security Hardening: Never allow file or content URL traversal
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        settings.allowFileAccessFromFileURLs = false
        settings.allowUniversalAccessFromFileURLs = false

        // Prohibit mixed cleartext HTTP content within HTTPS pages
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW

        // Enable Google Safe Browsing where supported
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.safeBrowsingEnabled = true
        }

        // Enable WebView DevTools debugging strictly for debug builds
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        // Session & Cookie Governance
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true)
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val url = request?.url?.toString() ?: return false
                if (ZamorinSecurityConfig.isAllowedOrigin(url, BuildConfig.DEBUG)) {
                    return false // Approved ERP origin: render inside container
                }

                // External/unapproved URL: Launch in system browser, never inside privileged container
                try {
                    val browserIntent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    startActivity(browserIntent)
                } catch (_: Exception) {
                    // Ignore unroutable external links
                }
                return true
            }

            override fun onReceivedSslError(
                view: WebView?,
                handler: SslErrorHandler?,
                error: SslError?
            ) {
                // Architectural Invariant: Never override or bypass SSL certificates with proceed()
                handler?.cancel()
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                injectBridgeCompatibilityPolyfill()
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                if (newProgress < 100) {
                    progressBar.visibility = View.VISIBLE
                    progressBar.progress = newProgress
                } else {
                    progressBar.visibility = View.GONE
                }
            }

            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                return attachmentCoordinator.onShowFileChooser(
                    filePathCallback = filePathCallback,
                    fileChooserParams = fileChooserParams,
                    cameraLauncher = cameraCaptureLauncher,
                    filePickerLauncher = filePickerLauncher
                )
            }
        }
    }

    private fun setupMessageBridge() {
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            val allowedOriginRules = ZamorinSecurityConfig.getAllowedOriginRules(BuildConfig.DEBUG)
            WebViewCompat.addWebMessageListener(
                webView,
                "ZamorinNativeBridge",
                allowedOriginRules,
                object : WebViewCompat.WebMessageListener {
                    override fun onPostMessage(
                        view: WebView,
                        message: WebMessageCompat,
                        sourceOrigin: Uri,
                        isMainFrame: Boolean,
                        replyProxy: JavaScriptReplyProxy
                    ) {
                        val originStr = sourceOrigin.toString()
                        if (!ZamorinSecurityConfig.isAllowedOrigin(originStr, BuildConfig.DEBUG)) {
                            replyProxy.postMessage(
                                JSONObject().apply {
                                    put("success", false)
                                    put("errorCode", "UNAUTHORIZED_ORIGIN")
                                    put("errorMessage", "Origin '$originStr' is not authorized to invoke Zamorin native bridge.")
                                }.toString()
                            )
                            return
                        }

                        val rawData = message.data ?: return
                        val response = nativeBridge.handleMessage(rawData)
                        if (response != null) {
                            replyProxy.postMessage(response.toJsonString())
                        } else {
                            // Asynchronous operation registered (e.g. directory picker)
                            try {
                                val json = JSONObject(rawData)
                                val action = json.optString("action", "")
                                if (action == "SELECT_EXPORT_DIRECTORY" || action == "CHANGE_EXPORT_DIRECTORY") {
                                    pendingDirectoryReplyProxy = replyProxy
                                }
                            } catch (_: Exception) {}
                        }
                    }
                }
            )
        }
    }

    /**
     * Injects client-side bridge polyfill so both modern WebMessageListener
     * and destinationManager.js bridge hooks (window.ZamorinAndroidSAF) resolve natively.
     */
    private fun injectBridgeCompatibilityPolyfill() {
        val polyfillJs = """
            (function() {
                if (window.__zamorinNativeBridgeInitialized) return;
                window.__zamorinNativeBridgeInitialized = true;

                window.ZamorinAndroidSAF = {
                    isNative: true,
                    checkUriPermission: async function(treeUri) {
                        return new Promise((resolve) => {
                            if (!window.ZamorinNativeBridge) { resolve(false); return; }
                            const reqId = 'check_perm_' + Date.now();
                            const handler = function(event) {
                                try {
                                    const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                                    if (data.requestId === reqId) {
                                        window.removeEventListener('message', handler);
                                        resolve(Boolean(data.result && data.result.isValid));
                                    }
                                } catch(_) {}
                            };
                            window.addEventListener('message', handler);
                            window.ZamorinNativeBridge.postMessage(JSON.stringify({
                                requestId: reqId,
                                action: 'CHECK_STORAGE_PERMISSION',
                                payload: { treeUri: treeUri }
                            }));
                        });
                    },
                    openDocumentTree: async function() {
                        return new Promise((resolve, reject) => {
                            if (!window.ZamorinNativeBridge) { reject(new Error('SAF_BRIDGE_UNAVAILABLE')); return; }
                            const reqId = 'open_tree_' + Date.now();
                            const handler = function(event) {
                                try {
                                    const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                                    if (data.requestId === reqId) {
                                        window.removeEventListener('message', handler);
                                        if (data.success && data.result && data.result.treeUri) {
                                            resolve({ treeUri: data.result.treeUri });
                                        } else if (data.result && data.result.cancelled) {
                                            resolve({ cancelled: true });
                                        } else {
                                            reject(new Error(data.errorMessage || 'SAF_SELECTION_FAILED'));
                                        }
                                    }
                                } catch(_) {}
                            };
                            window.addEventListener('message', handler);
                            window.ZamorinNativeBridge.postMessage(JSON.stringify({
                                requestId: reqId,
                                action: 'SELECT_EXPORT_DIRECTORY',
                                payload: {}
                            }));
                        });
                    },
                    releasePersistableUriPermission: async function(treeUri) {
                        return new Promise((resolve) => {
                            if (!window.ZamorinNativeBridge) { resolve(false); return; }
                            const reqId = 'release_perm_' + Date.now();
                            window.ZamorinNativeBridge.postMessage(JSON.stringify({
                                requestId: reqId,
                                action: 'RELEASE_STORAGE_PERMISSION',
                                payload: { treeUri: treeUri }
                            }));
                            resolve(true);
                        });
                    },
                    createFile: async function(treeUri, filename, mimeType, base64Data) {
                        return new Promise((resolve, reject) => {
                            if (!window.ZamorinNativeBridge) { reject(new Error('SAF_BRIDGE_UNAVAILABLE')); return; }
                            const reqId = 'create_file_' + Date.now();
                            const handler = function(event) {
                                try {
                                    const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                                    if (data.requestId === reqId) {
                                        window.removeEventListener('message', handler);
                                        if (data.success && data.result) {
                                            resolve({ uri: data.result.documentUri });
                                        } else {
                                            const err = new Error(data.errorMessage || 'WRITE_FAILED');
                                            err.code = data.errorCode;
                                            reject(err);
                                        }
                                    }
                                } catch(_) {}
                            };
                            window.addEventListener('message', handler);
                            window.ZamorinNativeBridge.postMessage(JSON.stringify({
                                requestId: reqId,
                                action: 'SAVE_DOCUMENT',
                                payload: {
                                    filename: filename,
                                    mimeType: mimeType,
                                    base64Data: base64Data,
                                    subfolder: 'ZAMORIN ERP/Exports'
                                }
                            }));
                        });
                    }
                };
            })();
        """.trimIndent()
        webView.evaluateJavascript(polyfillJs, null)
    }

    private fun handleAppLaunchIntent(intent: Intent?) {
        val appLinkUri = intent?.data
        val cafeRef = ZamorinSecurityConfig.parseCafeLoginReference(appLinkUri)

        val targetUrl = if (cafeRef != null) {
            ZamorinSecurityConfig.buildCafeLoginUrl(cafeRef, BuildConfig.DEBUG)
        } else {
            if (BuildConfig.DEBUG) "http://10.0.2.2:3000" else ZamorinSecurityConfig.PRODUCTION_BASE_URL
        }

        webView.loadUrl(targetUrl)
    }

    private fun handleDirectoryPickerResult(treeUri: Uri?) {
        val reqId = pendingDirectoryPickerRequestId ?: "req_dir_${System.currentTimeMillis()}"
        val proxy = pendingDirectoryReplyProxy

        pendingDirectoryPickerRequestId = null
        pendingDirectoryReplyProxy = null

        if (treeUri == null) {
            val resObj = JSONObject().apply {
                put("requestId", reqId)
                put("success", false)
                put("result", JSONObject().apply { put("cancelled", true) })
            }
            proxy?.postMessage(resObj.toString())
            dispatchJsEvent(resObj.toString())
            return
        }

        try {
            val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            ZamorinSafManager.takePersistableUriPermission(this, treeUri, flags)

            val resObj = JSONObject().apply {
                put("requestId", reqId)
                put("success", true)
                put("result", JSONObject().apply {
                    put("treeUri", treeUri.toString())
                    put("reused", false)
                })
            }
            proxy?.postMessage(resObj.toString())
            dispatchJsEvent(resObj.toString())
        } catch (e: Exception) {
            val resObj = JSONObject().apply {
                put("requestId", reqId)
                put("success", false)
                put("errorCode", "RESTRICTED_OR_INVALID_DIRECTORY")
                put("errorMessage", e.message ?: "Failed to take persistable permission for directory.")
            }
            proxy?.postMessage(resObj.toString())
            dispatchJsEvent(resObj.toString())
        }
    }

    private fun dispatchJsEvent(jsonString: String) {
        val script = "window.postMessage($jsonString, '*');"
        webView.post { webView.evaluateJavascript(script, null) }
    }

    private fun setupBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })
    }

    // --- BridgeCallbacks implementations ---

    override fun onRequestDirectoryPicker(requestId: String) {
        pendingDirectoryPickerRequestId = requestId
        directoryPickerLauncher.launch(null)
    }

    override fun onOpenSystemPrint(requestId: String, jobName: String) {
        val result = ZamorinPrintManager.printWebView(this, webView, jobName)
        val response = JSONObject().apply {
            put("requestId", requestId)
            put("success", result.success)
            put("jobName", result.jobName)
            if (result.error != null) put("error", result.error)
        }
        dispatchJsEvent(response.toString())
    }

    override fun onOpenCamera(requestId: String) {
        attachmentCoordinator.launchCameraCapture(cameraCaptureLauncher)
    }

    override fun onOpenFilePicker(requestId: String, mimeType: String?, allowMultiple: Boolean) {
        val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = mimeType ?: "*/*"
            if (allowMultiple) putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        }
        filePickerLauncher.launch(Intent.createChooser(intent, "Select Attachment"))
    }
}
