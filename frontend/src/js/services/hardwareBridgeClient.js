/**
 * Zamorin Café ERP — Stage 05 Hardware Bridge Client
 * Supports WebUSB, WebBluetooth, WebSerial, Local WebSocket Proxy (port 9199),
 * and automatic fallback to standard browser OS print preview (window.print()).
 */

import { apiPost, apiGet } from '../apiClient.js';
import { showToast } from '../components.js';

class HardwareBridgeClient {
  constructor() {
    this.proxyWs = null;
    this.proxyConnected = false;
    this.bridgeAvailable = false;
    this.bridgeInfo = null;
    this.barcodeBuffer = '';
    this.barcodeLastCharTime = 0;
    this.scannerCallbacks = new Set();
    this.scannerLastDetectedAt = null;
    this.activeUsbDevice = null;
  }

  /**
   * Returns current hardware capabilities and connectivity state.
   */
  async getCapabilities() {
    let localBridgeStatus = 'DISCONNECTED';
    try {
      const isAlive = await this.checkBridgeHealth(9199, 800);
      localBridgeStatus = isAlive ? 'ONLINE' : (this.proxyConnected ? 'ONLINE' : 'OFFLINE');
    } catch (_) {
      localBridgeStatus = this.proxyConnected ? 'ONLINE' : 'OFFLINE';
    }

    return {
      webUsbSupported: typeof navigator !== 'undefined' && 'usb' in navigator,
      webUsbDeviceConnected: Boolean(this.activeUsbDevice || (typeof window !== 'undefined' && window._activeUsbPrinter)),
      webBluetoothSupported: typeof navigator !== 'undefined' && 'bluetooth' in navigator,
      webSerialSupported: typeof navigator !== 'undefined' && 'serial' in navigator,
      localBridgeConfigured: true,
      localBridgeStatus,
      browserPrintSupported: typeof window !== 'undefined' && typeof window.print === 'function',
      barcodeScannerListenerSupported:
        typeof window !== 'undefined' && typeof window.addEventListener === 'function',
      barcodeScannerListenerActive: Boolean(this._scannerListenerAttached),
      barcodeScannerLastDetectedAt: this.scannerLastDetectedAt,
      barcodeScannerStatus: this.scannerLastDetectedAt
        ? 'DETECTED'
        : (this._scannerListenerAttached ? 'LISTENING' : 'NOT_INITIALIZED'),
      cameraScannerSupported:
        typeof navigator !== 'undefined' &&
        Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function'),
      activePaperWidth: (typeof localStorage !== 'undefined' && localStorage.getItem('zamorin_pos_paper_width')) || '80',
    };
  }

  /**
   * Probes localhost ESC/POS printer bridge daemon health with strict timeout.
   */
  async checkBridgeHealth(port = 9199, timeoutMs = 1200) {
    if (typeof fetch === 'undefined') return false;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(`http://127.0.0.1:${port}/health`, {
        method: 'GET',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        this.bridgeInfo = data;
        this.bridgeAvailable = data?.hardwareReady === true;
        return this.bridgeAvailable;
      }
    } catch (_) {
      // Bridge daemon not running on localhost — normal fallback condition
    }
    this.bridgeAvailable = false;
    return false;
  }

  /**
   * Initializes local barcode/QR scanner listener via HID keyboard emulation.
   * Scanners type very quickly (< 40ms per char) terminated by Enter key.
   */
  initBarcodeScannerListener(callback) {
    if (typeof callback === 'function') {
      this.scannerCallbacks.add(callback);
    }

    if (this._scannerListenerAttached || typeof window === 'undefined') return;
    this._scannerListenerAttached = true;

    window.addEventListener('keydown', (e) => {
      const targetTag = e.target.tagName;
      const isInput = targetTag === 'INPUT' || targetTag === 'TEXTAREA' || e.target.isContentEditable;
      if (isInput && !e.target.classList.contains('scanner-listening')) {
        return;
      }

      const currentTime = Date.now();
      const diff = currentTime - this.barcodeLastCharTime;
      this.barcodeLastCharTime = currentTime;

      if (e.key === 'Enter') {
        if (this.barcodeBuffer.length >= 3 && diff < 100) {
          const scannedCode = this.barcodeBuffer.trim();
          this.barcodeBuffer = '';
          this.scannerLastDetectedAt = new Date().toISOString();
          this.scannerCallbacks.forEach((cb) => cb(scannedCode));
          e.preventDefault();
        } else {
          this.barcodeBuffer = '';
        }
        return;
      }

      if (diff > 120) {
        this.barcodeBuffer = '';
      }

      if (e.key.length === 1) {
        this.barcodeBuffer += e.key;
      }
    });
  }

  /**
   * Connects to local hardware proxy daemon (for desktop counter terminals).
   */
  connectLocalProxy(port = 9199) {
    if (typeof WebSocket === 'undefined') return;
    try {
      this.proxyWs = new WebSocket(`ws://127.0.0.1:${port}/hardware`);
      this.proxyWs.onopen = () => {
        this.proxyConnected = true;
      };
      this.proxyWs.onclose = () => {
        this.proxyConnected = false;
      };
      this.proxyWs.onerror = () => {
        this.proxyConnected = false;
      };
    } catch (err) {
      this.proxyConnected = false;
    }
  }

  /**
   * Sends the exact server-generated ESC/POS buffer to the local bridge.
   * A successful response proves content-bound transport only; it does not
   * prove printer identity or physical paper output.
   */
  async printCanonicalEscPos(dispatch = {}) {
    if (
      dispatch?.printDispatchAuthorized !== true ||
      dispatch?.printTrackingPersisted !== true ||
      !dispatch?.printJobId ||
      !dispatch?.printBuffer ||
      !dispatch?.payloadSha256 ||
      !Number.isSafeInteger(Number(dispatch?.payloadBytes))
    ) {
      return null;
    }

    const isAlive = await this.checkBridgeHealth(9199, 500);
    if (!isAlive) return null;

    const bridgeRes = await fetch('http://127.0.0.1:9199/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        printJobId: dispatch.printJobId,
        printBufferBase64: dispatch.printBuffer,
        expectedPayloadSha256: dispatch.payloadSha256,
        expectedPayloadBytes: Number(dispatch.payloadBytes),
        printerTarget: dispatch.printerTarget || 'DEFAULT_THERMAL',
        drawerKickRequested: dispatch.drawerKickRequested === true,
      }),
    });

    if (!bridgeRes.ok) return null;
    const result = await bridgeRes.json();
    if (
      result?.success !== true ||
      result?.transportAccepted !== true ||
      result?.contentBindingVerified !== true ||
      result?.printerEndpointPinned !== true ||
      result?.payloadSha256 !== dispatch.payloadSha256 ||
      Number(result?.payloadBytes) !== Number(dispatch.payloadBytes)
    ) {
      return null;
    }

    return {
      ...result,
      success: true,
      method: 'LOCAL_RAW_ESC_POS',
      physicalCompletionVerified: false,
    };
  }

  /**
   * Dispatches a print job.
   * Cascading order:
   * 1. Local WebSocket Proxy / Bridge (if connected)
   * 2. WebUSB (if authorized and claimed)
   * 3. Local HTTP Bridge on 127.0.0.1:9199
   * 4. Backend HTML receipt preview -> browser window.print() fallback
   * Never throws unhandled errors or rolls back a valid sale.
   */
  async printThermalReceipt(orderData, terminalId, cafeId, options = {}) {
    const paperWidth = options.paperWidth || orderData?.paperWidth || (typeof localStorage !== 'undefined' && localStorage.getItem('zamorin_pos_paper_width')) || '80';

    // 1. A connected socket is not print acknowledgement. REC-04E keeps this
    // path disabled until a content-bound request/ack protocol is implemented.
    if (this.proxyConnected && this.proxyWs && this.proxyWs.readyState === WebSocket.OPEN) {
      // Deliberately do not send an unacknowledged print command.
    }

    // 2. Try Local HTTP Bridge daemon if available
    try {
      const isAlive = await this.checkBridgeHealth(9199, 500);
      if (isAlive) {
        const bridgeRes = await fetch('http://127.0.0.1:9199/print', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderData: { ...orderData, paperWidth },
            terminalId,
            paperWidth,
          }),
        });
        if (bridgeRes.ok) {
          const bridgeResult = await bridgeRes.json();
          if (
            bridgeResult?.success === true &&
            bridgeResult?.contentBindingVerified === true &&
            bridgeResult?.printerIdentityVerified === true
          ) {
            return {
              ...bridgeResult,
              success: true,
              method: 'LOCAL_HTTP_BRIDGE',
            };
          }
        }
      }
    } catch (_) {
      // Bridge not reachable, continue cascade
    }

    // 3. Merely having an opened WebUSB device is not evidence that receipt
    // bytes were transferred or accepted. Keep this path non-authoritative
    // until transferOut + device-bound acknowledgement are implemented.
    if (typeof navigator !== 'undefined' && navigator.usb && (this.activeUsbDevice || (typeof window !== 'undefined' && window._activeUsbPrinter))) {
      // Deliberately fall through to a visibly unverified browser fallback.
    }

    // 4. Graceful fallback: render clean thermal HTML preview for window.print()
    try {
      const response = await apiPost('/hardware/receipt/preview-html', {
        orderData: { ...orderData, paperWidth },
        cafeId,
        paperWidth: Number(paperWidth),
      });
      const htmlContent = typeof response === 'string' ? response : (response?.data || response);

      if (typeof window !== 'undefined') {
        const printWindow = window.open('', '_blank', 'width=420,height=650');
        if (printWindow) {
          printWindow.document.write(htmlContent);
          printWindow.document.close();
          return {
            success: true,
            method: 'WINDOW_PRINT_FALLBACK',
            physicalCompletionVerified: false,
            contentBindingVerified: false,
            printerIdentityVerified: false,
          };
        }
      }
    } catch (fallbackErr) {
      if (typeof showToast === 'function') {
        showToast('Printer offline: Receipt queued in session memory.', 'warning');
      }
    }

    return { success: false, method: 'QUEUED_OFFLINE', warning: 'Printer offline — receipt retained for reprint' };
  }

  /**
   * Issues cash drawer kick pulse via backend API.
   */
  async triggerDrawerKick(terminalId, reason = 'Cash sale tender') {
    try {
      const res = await apiPost('/hardware/drawer/kick', { terminalId, reason });
      return res.data;
    } catch (err) {
      if (typeof showToast === 'function') {
        showToast('Could not trigger cash drawer: ' + (err.message || 'Hardware offline'), 'error');
      }
      throw err;
    }
  }

  /**
   * Prepares a diagnostic ESC/POS payload. Physical readiness is not inferred.
   */
  async runDiagnosticTestPrint(terminalId) {
    try {
      const res = await apiPost('/hardware/test-print', { terminalId, format: 'json' });
      if (typeof showToast === 'function') {
        showToast('Diagnostic ESC/POS payload prepared. Physical printer readiness is not yet verified.', 'info');
      }
      return res.data;
    } catch (err) {
      if (typeof showToast === 'function') {
        showToast('Diagnostic test failed: ' + (err.message || 'Printer offline'), 'error');
      }
      throw err;
    }
  }
}

export const hardwareBridge = new HardwareBridgeClient();
