'use strict';

/**
 * Dedicated Safe Kiosk Attendance Display Mode for Cafe-Owned Hardware.
 *
 * PRIVACY & SECURITY INVARIANT:
 * This display renders ONLY the cafe name, current IST date/time, rotating QR code,
 * countdown timer, fullscreen toggle, and connectivity status.
 *
 * It NEVER exposes employee rosters, payroll/salary, cashbook balances, POS history,
 * inventory stock, vendor contacts, or administrative secrets.
 */

import { apiGet } from '../apiClient.js';
import { generateQrSvg } from '../utils/qrCodeGen.js';
import { state } from '../state.js';

export class CafeAttendanceDisplayPage {
  constructor() {
    this.cafeId = null;
    this.cafeName = 'Zamorin Café Terminal';
    this.deviceId = null;
    this.activeChallenge = null;
    this.rotationTimer = null;
    this.clockTimer = null;
    this.countdownSeconds = 45;
    this.status = 'INITIALIZING'; // 'ACTIVE' | 'REFRESHING' | 'OFFLINE'
  }

  async init(containerElement, deviceContext = {}) {
    this.container = containerElement;
    this.deviceId = deviceContext.deviceId || 'OPS_CONSOLE';
    this.cafeId = deviceContext.boundCafeId || state.currentCafeId || state.user?.primaryCafeId || '';

    this.render();
    this.bindEvents();
    await this.fetchNewChallenge();
    this.startRotationTimer();
  }

  render() {
    this.container.innerHTML = `
      <div class="kiosk-container" id="kiosk-fullscreen-root" style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; background:#0c0b0a; color:#ede8e1; font-family:var(--font-sans, system-ui, -apple-system, sans-serif); text-align:center; padding:2rem; position:relative;">
        <!-- Top Toolbar -->
        <div style="position:absolute; top:1.5rem; right:1.5rem; display:flex; gap:10px; align-items:center;">
          <button id="btn-kiosk-fullscreen" class="btn btn-ghost btn-sm" type="button" style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color:#ede8e1; font-size:12px; padding:6px 12px; border-radius:6px; cursor:pointer;" title="Toggle Fullscreen">
            ⛶ Fullscreen
          </button>
        </div>

        <header style="margin-bottom:1.8rem; max-width:640px;">
          <div style="display:inline-flex; align-items:center; gap:6px; padding:0.25rem 0.85rem; border-radius:9999px; background:rgba(177,125,56,0.15); border:1px solid rgba(177,125,56,0.35); color:#c89d5c; font-size:0.8rem; font-weight:700; letter-spacing:0.5px; text-transform:uppercase; margin-bottom:0.75rem;">
            <span>☕</span>
            <span>Authoritative Attendance Terminal</span>
          </div>
          <h1 style="font-size:2.2rem; font-weight:800; margin:0 0 0.4rem 0; color:#f5f0eb; letter-spacing:-0.5px;" id="kiosk-cafe-name">${this.cafeName}</h1>
          <p style="margin:0; font-size:1.15rem; color:#a8a29e; font-family:var(--font-mono, monospace);" id="kiosk-clock">Loading IST Clock...</p>
          <div style="display:inline-block; margin-top:0.6rem; padding:0.25rem 0.85rem; border-radius:9999px; background:rgba(52,211,153,0.1); border:1px solid rgba(52,211,153,0.25); color:#34d399; font-size:0.82rem; font-family:var(--font-mono, monospace);">
            ● TERMINAL: ${this.cafeId || 'PRIMARY'} · DEVICE: ${this.deviceId || 'ACTIVE_KIOSK'}
          </div>
        </header>

        <main style="background:#181614; border-radius:1.25rem; padding:2rem 2.5rem; box-shadow:0 25px 50px -12px rgba(0,0,0,0.7); border:1px solid rgba(255,255,255,0.08); max-width:440px; width:100%; display:flex; flex-direction:column; align-items:center;">
          <div id="qr-code-wrapper" style="background:#ffffff; padding:1.25rem; border-radius:1rem; display:inline-flex; align-items:center; justify-content:center; margin-bottom:1.5rem; box-shadow:0 10px 25px rgba(0,0,0,0.5); min-width:240px; min-height:240px; position:relative;" aria-label="QR code for staff attendance">
            <div id="qr-placeholder" style="width:240px; height:240px; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#1c1917; font-weight:700; gap:8px;">
              <div class="za-spinner" style="width:32px; height:32px; border:3px solid rgba(0,0,0,0.1); border-top-color:#c89d5c; border-radius:50%; animation:spin 0.8s linear infinite;"></div>
              <span style="font-size:12px; color:#57534e;">Generating Secure Token...</span>
            </div>
          </div>

          <div style="margin-bottom:1.4rem; text-align:center;">
            <p style="margin:0 0 0.35rem 0; font-size:0.95rem; font-weight:600; color:#e7e5e4;">
              Scan with your personal Zamorin App
            </p>
            <p style="margin:0; font-size:0.82rem; color:#a8a29e;">
              Rotating cryptographic challenge verified against café geofence
            </p>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.85rem; color:#78716c; border-top:1px solid rgba(255,255,255,0.08); padding-top:1rem; width:100%;">
            <span>Auto-rotates in: <strong id="kiosk-countdown" style="color:#c89d5c; font-family:var(--font-mono, monospace); font-size:0.95rem;">${this.countdownSeconds}s</strong></span>
            <span id="kiosk-network-status" style="color:#22c55e; font-weight:600;">● ${this.status}</span>
          </div>
        </main>

        <footer style="margin-top:2rem;">
          <button id="btn-admin-unlock" style="background:transparent; border:1px solid rgba(255,255,255,0.15); color:#a8a29e; padding:0.5rem 1.25rem; border-radius:0.5rem; cursor:pointer; font-size:0.85rem;" onclick="window.location.hash='cafe-operator-signin'">
            🔒 Cafe Operator Sign-In
          </button>
        </footer>
      </div>
    `;

    this.updateClock();
    if (this.clockTimer) clearInterval(this.clockTimer);
    this.clockTimer = setInterval(() => this.updateClock(), 1000);
  }

  bindEvents() {
    const fsBtn = this.container.querySelector('#btn-kiosk-fullscreen');
    if (fsBtn) {
      fsBtn.addEventListener('click', () => {
        const root = this.container.querySelector('#kiosk-fullscreen-root') || this.container;
        if (!document.fullscreenElement) {
          root.requestFullscreen?.().catch(() => {});
          fsBtn.textContent = '✕ Exit Fullscreen';
        } else {
          document.exitFullscreen?.().catch(() => {});
          fsBtn.textContent = '⛶ Fullscreen';
        }
      });
    }
  }

  updateClock() {
    const clockEl = this.container.querySelector('#kiosk-clock');
    if (clockEl) {
      clockEl.textContent = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'full',
        timeStyle: 'medium',
      }).format(new Date());
    }
  }

  async fetchNewChallenge() {
    this.status = 'REFRESHING';
    const statusEl = this.container.querySelector('#kiosk-network-status');
    if (statusEl) {
      statusEl.textContent = '● REFRESHING';
      statusEl.style.color = '#fbbf24';
    }

    try {
      const query = this.cafeId ? `?cafeId=${encodeURIComponent(this.cafeId)}` : '';
      const res = await apiGet(`/attendance/qr/active${query}`);

      if (res?.data?.qrToken) {
        this.activeChallenge = res.data;
        this.countdownSeconds = Math.max(1, res.data.remainingSeconds || res.data.secondsRemaining || 45);

        if (res.data.cafeName) {
          this.cafeName = res.data.cafeName;
          const nameEl = this.container.querySelector('#kiosk-cafe-name');
          if (nameEl) nameEl.textContent = this.cafeName;
        }

        const qrWrap = this.container.querySelector('#qr-code-wrapper');
        if (qrWrap) {
          const svg = generateQrSvg(res.data.attendanceUrl || res.data.qrToken, { size: 240, margin: 2, darkColor: '#121212', lightColor: '#ffffff' });
          qrWrap.innerHTML = svg;
        }

        this.status = 'ACTIVE';
        if (statusEl) {
          statusEl.textContent = '● ACTIVE';
          statusEl.style.color = '#22c55e';
        }
      } else {
        throw new Error('Invalid QR challenge response');
      }
    } catch (err) {
      this.status = 'OFFLINE';
      if (statusEl) {
        statusEl.textContent = '● OFFLINE';
        statusEl.style.color = '#ef4444';
      }
      const qrWrap = this.container.querySelector('#qr-code-wrapper');
      if (qrWrap) {
        qrWrap.innerHTML = `
          <div style="width:240px; height:240px; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#ef4444; padding:12px; text-align:center;">
            <div style="font-size:28px; margin-bottom:8px;">⚠️</div>
            <div style="font-size:12px; font-weight:700;">Challenge Sync Failed</div>
            <div style="font-size:11px; color:#a8a29e; margin-top:4px;">${err?.message || 'Server unreachable'}</div>
            <button id="btn-retry-qr" class="btn btn-xs btn-primary" style="margin-top:12px; padding:4px 10px; font-size:11px;" type="button">Retry</button>
          </div>
        `;
        qrWrap.querySelector('#btn-retry-qr')?.addEventListener('click', () => this.fetchNewChallenge());
      }
    }
  }

  startRotationTimer() {
    if (this.rotationTimer) clearInterval(this.rotationTimer);
    this.rotationTimer = setInterval(() => {
      this.countdownSeconds -= 1;
      const countEl = this.container.querySelector('#kiosk-countdown');
      if (countEl) countEl.textContent = `${Math.max(0, this.countdownSeconds)}s`;

      if (this.countdownSeconds <= 0) {
        this.fetchNewChallenge();
      }
    }, 1000);
  }

  destroy() {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }
    if (this.clockTimer) {
      clearInterval(this.clockTimer);
      this.clockTimer = null;
    }
  }
}
