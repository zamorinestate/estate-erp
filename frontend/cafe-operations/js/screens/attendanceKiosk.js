/* =====================================================================
   js/screens/attendanceKiosk.js
   ---------------------------------------------------------------------
   The default safe screen (login spec Section 31) for a registered,
   ACTIVE device with no authenticated Operator/Master. Public-safe only
   — no staff roster, no operational data, ever (Section 32).

   The kiosk consumes the canonical device-bound Attendance QR endpoint.
   The QR opens the employee Geo-Selfie attendance flow and never exposes
   roster, payroll, POS, or other operational data.
   ===================================================================== */
(function (global) {
  'use strict';
  const UI = global.CafeOpsUI;

  const DEFAULT_QR_ROTATE_SECONDS = 45;
  let clockTimer = null;
  let qrTimer = null;
  let serverOffsetMs = 0;
  let qrCycleDurationSeconds = DEFAULT_QR_ROTATE_SECONDS;
  let qrExpiresAtMs = 0;

  function istFormatter(opts) {
    return new Intl.DateTimeFormat('en-IN', Object.assign({ timeZone: 'Asia/Kolkata' }, opts));
  }
  const timeFmt = istFormatter({ hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const dateFmt = istFormatter({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  function render(root, params) {
    stopTimers();
    const device = (params && params.device) || {};

    root.innerHTML = `
      <div class="auth-card">
        ${UI.brandHeader({ device: { cafeName: device.cafeName || 'Cafe', deviceName: device.deviceName || 'Cafe Operations Device' } })}
        <div class="cafeops-kiosk-clock" id="kioskClock">--:--:--</div>
        <div class="cafeops-kiosk-date" id="kioskDate">&nbsp;</div>

        <div class="cafeops-qr-wrap">
          <svg class="cafeops-qr-ring" viewBox="0 0 208 208" aria-hidden="true">
            <circle class="cafeops-qr-ring-track" cx="104" cy="104" r="98"></circle>
            <circle class="cafeops-qr-ring-progress" id="qrRingProgress" cx="104" cy="104" r="98"
                    stroke-dasharray="${2 * Math.PI * 98}" stroke-dashoffset="0"></circle>
          </svg>
          <div class="cafeops-qr-surface" id="qrSurface">
            <span class="cafeops-qr-refreshing">Loading…</span>
          </div>
        </div>
        <p class="cafeops-kiosk-instructions">Scan with your Zamorin app to check in or out for your shift.</p>

        <button type="button" class="auth-btn-secondary" id="openCafeOpsBtn">
          <span class="auth-btn-label">Open Cafe Operations</span>
        </button>

        <div class="cafeops-connection" id="connectionIndicator">
          <span class="cafeops-connection-dot"></span><span>Online</span>
        </div>
      </div>`;

    root.querySelector('#openCafeOpsBtn').addEventListener('click', () => global.CafeOpsApp.navigate('operatorSignIn', { device }));

    startClock();
    refreshQr(root);
    tickRing(root);

    global.CafeOpsApi.deviceStatus()
      .then((data) => {
        if (data.serverTime) serverOffsetMs = new Date(data.serverTime).getTime() - Date.now();
        setConnection(root, true);
      })
      .catch(() => setConnection(root, false));
  }

  function setConnection(root, online) {
    const el = root.querySelector('#connectionIndicator');
    if (!el) return;
    el.classList.toggle('cafeops-connection--offline', !online);
    el.querySelector('span:last-child').textContent = online ? 'Online' : "You're Offline";
  }

  function startClock() {
    stopClock();
    clockTimer = setInterval(tickClock, 1000);
    tickClock();
  }
  function stopClock() { if (clockTimer) clearInterval(clockTimer); clockTimer = null; }

  function tickClock() {
    const clockEl = document.getElementById('kioskClock');
    const dateEl = document.getElementById('kioskDate');
    if (!clockEl) { stopClock(); return; } // screen navigated away
    const now = new Date(Date.now() + serverOffsetMs);
    clockEl.textContent = timeFmt.format(now);
    dateEl.textContent = dateFmt.format(now) + ' · IST';
  }

  let qrElapsed = 0;
  function tickRing(root) {
    const ring = root.querySelector('#qrRingProgress');
    if (!ring) return; // navigated away

    const circumference = 2 * Math.PI * 98;
    let fraction = 0;

    if (qrExpiresAtMs > 0) {
      const remainingMs = Math.max(0, qrExpiresAtMs - Date.now());
      const cycleMs = Math.max(1000, qrCycleDurationSeconds * 1000);
      fraction = 1 - Math.min(1, remainingMs / cycleMs);
    } else {
      qrElapsed = (qrElapsed + 1) % DEFAULT_QR_ROTATE_SECONDS;
      fraction = qrElapsed / DEFAULT_QR_ROTATE_SECONDS;
    }

    ring.style.strokeDashoffset = String(circumference * Math.max(0, Math.min(1, fraction)));
    requestAnimationFrame(() => setTimeout(() => tickRing(root), 1000));
  }

  function scheduleQrRefresh(root, delayMs) {
    if (qrTimer) clearTimeout(qrTimer);
    qrTimer = setTimeout(() => refreshQr(root), Math.max(1000, Number(delayMs) || 1000));
  }

  async function refreshQr(root) {
    const surface = root.querySelector('#qrSurface');
    if (!surface) return;
    qrElapsed = 0;

    try {
      const body = global.CafeOpsApi?.attendanceQr
        ? await global.CafeOpsApi.attendanceQr()
        : null;

      if (!body?.attendanceUrl) {
        throw new Error('ATTENDANCE_QR_URL_UNAVAILABLE');
      }

      if (!global.QRCode || typeof global.QRCode.toDataURL !== 'function') {
        surface.innerHTML = '<span class="cafeops-qr-refreshing">Preparing secure QR renderer…</span>';
        setTimeout(() => refreshQr(root), 500);
        return;
      }

      const imageUrl = await global.QRCode.toDataURL(body.attendanceUrl, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 200,
      });

      surface.innerHTML = `<img src="${imageUrl}" alt="Attendance check-in and check-out QR code" style="width:100%;height:100%;object-fit:contain;" />`;

      const serverRemainingSeconds = Number(body.remainingSeconds);
      const parsedExpiry = Date.parse(body.expiresAt || '');
      qrCycleDurationSeconds = Number.isFinite(serverRemainingSeconds) && serverRemainingSeconds > 0
        ? Math.max(1, Math.ceil(serverRemainingSeconds))
        : DEFAULT_QR_ROTATE_SECONDS;
      qrExpiresAtMs = Number.isFinite(parsedExpiry) && parsedExpiry > Date.now()
        ? parsedExpiry
        : Date.now() + qrCycleDurationSeconds * 1000;

      scheduleQrRefresh(root, qrExpiresAtMs - Date.now() + 250);
    } catch (e) {
      qrExpiresAtMs = 0;
      surface.innerHTML = '<span class="cafeops-qr-refreshing">Unable to load secure attendance code</span>';
      scheduleQrRefresh(root, 5000);
    }
  }

  function stopTimers() {
    stopClock();
    if (qrTimer) clearTimeout(qrTimer);
    qrTimer = null;
    qrExpiresAtMs = 0;
    qrCycleDurationSeconds = DEFAULT_QR_ROTATE_SECONDS;
  }

  global.CafeOpsScreens = global.CafeOpsScreens || {};
  global.CafeOpsScreens.kiosk = { render, stopTimers };
})(window);
