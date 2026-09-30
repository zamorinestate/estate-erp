// =============================================================================
// ZAMORIN CAFÉ ERP — ATTENDANCE SECURE EVIDENCE VIEWER MODAL
// =============================================================================

'use strict';

import { apiGet, apiPost, getAccessToken, getOrCreateDeviceId, API_BASE_URL } from '../../apiClient.js';
import { showToast } from '../../components.js';
import { CANONICAL_ZAMORIN_COMPANY_LOGO_SVG } from '../../utils/qrCodeGen.js';

function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function fetchEvidencePhotoBlob(mediaId) {
  const token = getAccessToken();
  const headers = {
    'x-device-id': getOrCreateDeviceId(),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE_URL}/attendance/evidence/media/${encodeURIComponent(mediaId)}`, {
    method: 'GET',
    credentials: 'include',
    headers,
  });
  if (!res.ok) {
    let code = '';
    let message = '';
    try {
      const payload = await res.json();
      code = String(payload?.code || payload?.error?.code || '').trim();
      message = String(payload?.message || payload?.error?.message || '').trim();
    } catch (_) {}

    if ([409, 423].includes(res.status) && code.startsWith('ATTENDANCE_EVIDENCE_')) {
      throw new Error(
        message || 'Attendance evidence failed its integrity verification and cannot be displayed.'
      );
    }

    throw new Error(
      message || `Failed to load evidence photograph (${res.status})`
    );
  }
  return await res.blob();
}

/**
 * Opens the canonical Attendance Evidence Viewer Modal.
 * Supports viewing Check-In and Check-Out selfies, QR & GPS verification indicators.
 *
 * @param {Object} options
 * @param {string} options.attendanceId
 * @param {'CHECK_IN'|'CHECK_OUT'} [options.initialType='CHECK_IN']
 */
export async function openAttendanceEvidenceViewer({ attendanceId, initialType = 'CHECK_IN' } = {}) {
  let modalMount = document.getElementById('zamorin-evidence-viewer-mount');
  if (!modalMount) {
    modalMount = document.createElement('div');
    modalMount.id = 'zamorin-evidence-viewer-mount';
    document.body.appendChild(modalMount);
  }

  modalMount.innerHTML = `
    <div class="modal-backdrop" id="evidence-viewer-backdrop" style="position:fixed;inset:0;background:rgba(12,11,10,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px);">
      <div class="modal-card card" style="width:680px;max-width:96vw;max-height:92vh;overflow-y:auto;background:var(--surface-raised, #242220);border:1px solid var(--border-subtle, #3d3935);box-shadow:var(--shadow-2xl);border-radius:12px;padding:24px;color:var(--ink, #ede8e1);">
        <div style="display:flex;align-items:center;justify-content:center;padding:48px 0;">
          <div class="za-spinner" style="width:36px;height:36px;border:3px solid rgba(177,125,56,0.2);border-top-color:var(--primary, #b17d38);border-radius:50%;animation:spin 0.8s linear infinite;"></div>
          <span style="margin-left:14px;font-size:14px;color:var(--muted);">Loading Authoritative Evidence...</span>
        </div>
      </div>
    </div>
  `;

  let currentObjectUrl = null;

  const cleanup = () => {
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
    }
    window.removeEventListener('keydown', onKey);
    modalMount.innerHTML = '';
  };

  const onKey = (e) => {
    if (e.key === 'Escape' || e.keyCode === 27) {
      cleanup();
    }
  };
  window.addEventListener('keydown', onKey);

  try {
    const res = await apiGet(`/attendance/evidence/record/${encodeURIComponent(attendanceId)}`);
    const data = res?.data;

    if (!data) {
      throw new Error('Evidence record unavailable.');
    }

    let currentPunch = initialType === 'CHECK_OUT' && data.checkOut ? 'CHECK_OUT' : 'CHECK_IN';

    const render = () => {
      const isCheckIn = currentPunch === 'CHECK_IN';
      const evidence = isCheckIn ? data.checkIn : data.checkOut;

      modalMount.innerHTML = `
        <div class="modal-backdrop" id="evidence-viewer-backdrop" style="position:fixed;inset:0;background:rgba(12,11,10,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px);">
          <div class="modal-card card" style="width:680px;max-width:96vw;max-height:92vh;overflow-y:auto;background:var(--surface-raised, #242220);border:1px solid var(--border-subtle, #3d3935);box-shadow:var(--shadow-2xl);border-radius:12px;padding:24px;color:var(--ink, #ede8e1);">
            
            <!-- Header -->
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;border-bottom:1px solid var(--border-subtle, #33302c);padding-bottom:12px;">
              <div style="display:flex;align-items:center;gap:12px;">
                <div style="width:34px;height:34px;flex-shrink:0;display:flex;align-items:center;justify-content:center;">
                  ${CANONICAL_ZAMORIN_COMPANY_LOGO_SVG}
                </div>
                <div>
                  <div style="display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--bronze-400, #d4a359);margin-bottom:2px;">
                    <span>📷</span> PHYSICAL PRESENCE VERIFICATION
                  </div>
                  <h3 style="margin:0 0 2px;font-size:18px;font-weight:800;color:var(--ink);">${escHtml(data.employeeName)}</h3>
                  <div style="font-size:12px;font-family:var(--font-mono, monospace);color:var(--muted);">
                    Emp ID: ${escHtml(data.permanentEmployeeId || data.userId)} · ${escHtml(data.cafeName)} (${escHtml(data.cafeId)})
                  </div>
                </div>
              </div>
              <button class="btn btn-xs btn-ghost" id="evidence-close-x" type="button" style="font-size:16px;line-height:1;cursor:pointer;">✕</button>
            </div>

            <!-- Punch Selector Tabs -->
            <div style="display:flex;gap:8px;margin-bottom:16px;">
              <button class="btn btn-sm ${isCheckIn ? 'btn-primary' : 'btn-secondary'}" id="btn-select-checkin" type="button" style="font-weight:700;">
                🟢 Check-In Evidence
              </button>
              <button class="btn btn-sm ${!isCheckIn ? 'btn-primary' : 'btn-secondary'}" id="btn-select-checkout" type="button" style="font-weight:700;" ${!data.checkOut ? 'disabled title="Not checked out yet"' : ''}>
                🔴 Check-Out Evidence ${!data.checkOut ? '(Pending)' : ''}
              </button>
            </div>

            <!-- Verification Metadata Cards -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(170px, 1fr));gap:10px;margin-bottom:16px;">
              <div style="background:var(--surface-sunken, #121110);border:1px solid var(--border-subtle, #33302c);border-radius:8px;padding:10px 14px;">
                <div style="font-size:10.5px;text-transform:uppercase;color:var(--muted);font-weight:700;">Punch Timestamp</div>
                <div style="font-size:13.5px;font-weight:700;color:var(--ink);margin-top:2px;">
                  ${evidence?.time ? new Date(evidence.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }) : '—'}
                </div>
                <div style="font-size:10.5px;color:var(--muted);">${escHtml(data.businessDate)} · ${escHtml(data.shiftName)}</div>
              </div>

              <div style="background:var(--surface-sunken, #121110);border:1px solid var(--border-subtle, #33302c);border-radius:8px;padding:10px 14px;">
                <div style="font-size:10.5px;text-transform:uppercase;color:var(--muted);font-weight:700;">QR Challenge</div>
                <div style="font-size:13.5px;font-weight:700;color:${evidence?.qrVerified ? 'var(--mint-400, #34d399)' : 'var(--coral-400, #f87171)'};margin-top:2px;">
                  ${evidence?.qrVerified ? '✓ Verified' : '✕ Unverified'}
                </div>
                <div style="font-size:10.5px;color:var(--muted);">Rotating Token Challenge</div>
              </div>

              <div style="background:var(--surface-sunken, #121110);border:1px solid var(--border-subtle, #33302c);border-radius:8px;padding:10px 14px;">
                <div style="font-size:10.5px;text-transform:uppercase;color:var(--muted);font-weight:700;">Geolocation Proof</div>
                <div style="font-size:13.5px;font-weight:700;color:${evidence?.geofenceVerified ? 'var(--mint-400, #34d399)' : 'var(--coral-400, #f87171)'};margin-top:2px;">
                  ${evidence?.geofenceVerified ? '✓ Geofence Verified' : '✕ Outside Geofence'}
                </div>
                <div style="font-size:10.5px;color:var(--muted);">
                  ${typeof evidence?.distanceMeters === 'number' ? `${evidence.distanceMeters}m from café` : 'Authorised location'}
                </div>
              </div>
            </div>

            ${ 
              evidence?.integrityState === 'QUARANTINED' || evidence?.verificationStatus === 'FLAGGED'
                ? `
              <div style="background:rgba(239,68,68,0.12);border:1px solid #ef4444;border-radius:8px;padding:12px 14px;margin-bottom:16px;font-size:12px;color:#fca5a5;">
                <strong>🔒 Evidence Quarantined:</strong>
                <span>This attendance photograph failed one or more integrity checks and cannot be displayed until investigated.</span>
                ${ 
                  Array.isArray(evidence?.integrityFailedChecks) && evidence.integrityFailedChecks.length
                    ? `<div style="margin-top:6px;color:var(--muted);">Failed checks: ${evidence.integrityFailedChecks.map(escHtml).join(', ')}</div>`
                    : ''
                }
                ${ 
                  evidence?.integrityAuditEventId
                    ? `<div style="margin-top:4px;color:var(--muted);">Failure audit event: ${escHtml(evidence.integrityAuditEventId)}</div>`
                    : ''
                }
                ${data.canReleaseQuarantine ? `
                  <button class="btn btn-sm btn-danger" id="release-evidence-quarantine-btn" type="button" style="margin-top:10px;">
                    Re-verify &amp; Release Quarantine
                  </button>
                ` : ''}
              </div>
            `
                : ''
            }

            ${data.canManageRetentionHold && evidence?.selfieMediaId ? `
              <div style="background:${evidence?.retentionHoldStatus === 'HELD' ? 'rgba(59,130,246,0.12)' : 'rgba(148,163,184,0.08)'};border:1px solid ${evidence?.retentionHoldStatus === 'HELD' ? '#3b82f6' : 'var(--border-subtle, #3d3935)'};border-radius:8px;padding:12px 14px;margin-bottom:16px;font-size:12px;">
                <div style="font-weight:800;color:${evidence?.retentionHoldStatus === 'HELD' ? '#93c5fd' : 'var(--ink)'};">
                  ${evidence?.retentionHoldStatus === 'HELD' ? '🛡️ Retention Hold Active' : '🗂️ Retention Hold'}
                </div>
                <div style="margin-top:4px;color:var(--muted);">
                  ${evidence?.retentionHoldStatus === 'HELD'
                    ? 'This committed selfie is explicitly protected from any future retention purge until the hold is released.'
                    : 'No retention hold is active. Committed-evidence purge is still disabled until a formal retention policy is approved.'}
                </div>
                ${evidence?.retentionHoldStatus === 'HELD' && evidence?.retentionHoldReason
                  ? `<div style="margin-top:6px;color:var(--muted);">Reason: ${escHtml(evidence.retentionHoldReason)}</div>`
                  : ''}
                ${evidence?.retentionHoldStatus === 'HELD' && evidence?.retentionHoldPlacedByUserId
                  ? `<div style="margin-top:4px;color:var(--muted);">Placed by: ${escHtml(evidence.retentionHoldPlacedByUserId)}</div>`
                  : ''}
                <button
                  class="btn btn-sm ${evidence?.retentionHoldStatus === 'HELD' ? 'btn-secondary' : 'btn-primary'}"
                  id="evidence-retention-hold-btn"
                  type="button"
                  style="margin-top:10px;"
                >
                  ${evidence?.retentionHoldStatus === 'HELD' ? 'Release Retention Hold' : 'Place Retention Hold'}
                </button>
              </div>
            ` : ''}

            <!-- Management Correction Warning -->
            ${
              data.isCorrection
                ? `
              <div style="background:rgba(217,119,6,0.12);border:1px solid #d97706;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:#fbbf24;">
                <strong>⚠️ Management Correction Applied:</strong>
                <span>The attendance times have been administratively adjusted. Original visual proof, QR token, and location evidence remain immutable.</span>
                ${data.correctionReason ? `<div style="margin-top:4px;color:var(--muted);">Reason: "${escHtml(data.correctionReason)}"</div>` : ''}
              </div>
            `
                : ''
            }

            <!-- Large Authenticated Selfie Display -->
            <div style="background:var(--surface-sunken, #121110);border:1px solid var(--border-subtle, #33302c);border-radius:10px;padding:16px;text-align:center;margin-bottom:18px;">
              <div id="evidence-photo-container" style="min-height:280px;display:flex;align-items:center;justify-content:center;flex-direction:column;">
                <div class="za-spinner" style="width:28px;height:28px;border:3px solid rgba(177,125,56,0.2);border-top-color:var(--primary, #b17d38);border-radius:50%;animation:spin 0.8s linear infinite;"></div>
                <span style="font-size:12px;color:var(--muted);margin-top:8px;">Decrypting Secure Visual Evidence...</span>
              </div>
              <div style="font-size:11px;color:var(--muted);margin-top:10px;">
                Media ID: <span style="font-family:var(--font-mono, monospace);">${escHtml(evidence?.selfieMediaId || 'NOT_CAPTURED')}</span> · Authenticated Access Logged
              </div>
            </div>

            <!-- Action Controls -->
            <div style="display:flex;justify-content:flex-end;gap:10px;">
              <button class="btn btn-sm btn-ghost" id="evidence-close-btn" type="button" style="padding:6px 18px;">Close</button>
            </div>
          </div>
        </div>
      `;

      // Event handlers
      modalMount.querySelector('#evidence-close-x')?.addEventListener('click', cleanup);
      modalMount.querySelector('#evidence-close-btn')?.addEventListener('click', cleanup);

      modalMount.querySelector('#evidence-retention-hold-btn')?.addEventListener('click', async () => {
        const currentlyHeld = evidence?.retentionHoldStatus === 'HELD';
        const action = currentlyHeld ? 'RELEASE' : 'HOLD';
        const reason = String(
          window.prompt(
            currentlyHeld
              ? 'Enter the reason for releasing this retention hold (minimum 10 characters):'
              : 'Enter the legal/administrative reason for placing this retention hold (minimum 10 characters):',
            ''
          ) || ''
        ).trim();

        if (reason.length < 10) {
          showToast('A specific hold reason of at least 10 characters is required.', 'warning');
          return;
        }

        const confirmationMessage = currentlyHeld
          ? 'Release this retention hold? This does not delete the selfie or enable purge.'
          : 'Place a retention hold on this committed selfie?';
        if (!window.confirm(confirmationMessage)) {
          return;
        }

        try {
          await apiPost('/attendance/evidence/retention/hold', {
            attendanceId,
            punchType: currentPunch,
            action,
            reason,
            confirmation: currentlyHeld
              ? 'RELEASE_ATTENDANCE_EVIDENCE_HOLD'
              : 'PLACE_ATTENDANCE_EVIDENCE_HOLD',
          });
          showToast(
            currentlyHeld
              ? 'Retention hold released. Evidence remains stored; committed purge is still disabled.'
              : 'Retention hold placed. Evidence is protected from future purge.',
            'success'
          );
          const reopenType = currentPunch;
          cleanup();
          await openAttendanceEvidenceViewer({ attendanceId, initialType: reopenType });
        } catch (err) {
          showToast(err?.message || 'Retention hold change failed.', 'error');
        }
      });

      modalMount.querySelector('#release-evidence-quarantine-btn')?.addEventListener('click', async () => {
        const reason = String(
          window.prompt(
            'Enter the investigation reason for releasing this quarantine (minimum 10 characters):',
            ''
          ) || ''
        ).trim();

        if (reason.length < 10) {
          showToast('A specific release reason of at least 10 characters is required.', 'warning');
          return;
        }

        if (!window.confirm('Run a fresh full forensic verification and release this evidence only if every applicable integrity check passes?')) {
          return;
        }

        try {
          await apiPost('/attendance/evidence/integrity/release', {
            attendanceId,
            punchType: currentPunch,
            reason,
            confirmation: 'RELEASE_QUARANTINED_ATTENDANCE_EVIDENCE',
          });
          showToast('Evidence quarantine released after a fresh forensic integrity pass.', 'success');
          const reopenType = currentPunch;
          cleanup();
          await openAttendanceEvidenceViewer({ attendanceId, initialType: reopenType });
        } catch (err) {
          showToast(err?.message || 'Evidence remains quarantined because release verification did not pass.', 'error');
        }
      });

      modalMount.querySelector('#btn-select-checkin')?.addEventListener('click', () => {
        if (currentPunch !== 'CHECK_IN') {
          currentPunch = 'CHECK_IN';
          render();
        }
      });

      modalMount.querySelector('#btn-select-checkout')?.addEventListener('click', () => {
        if (currentPunch !== 'CHECK_OUT' && data.checkOut) {
          currentPunch = 'CHECK_OUT';
          render();
        }
      });

      // Load authenticated selfie image
      const photoContainer = modalMount.querySelector('#evidence-photo-container');
      const evidenceQuarantined =
        evidence?.integrityState === 'QUARANTINED' ||
        evidence?.verificationStatus === 'FLAGGED';

      if (evidenceQuarantined) {
        if (photoContainer) {
          photoContainer.innerHTML = `
            <div style="color:var(--coral-400, #f87171);font-size:13px;padding:32px;max-width:460px;">
              🔒 Photograph blocked by attendance evidence quarantine. Review the integrity failure details and immutable audit event before taking further action.
            </div>
          `;
        }
      } else if (evidence?.selfieMediaId) {
        fetchEvidencePhotoBlob(evidence.selfieMediaId)
          .then((blob) => {
            if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
            currentObjectUrl = URL.createObjectURL(blob);
            if (photoContainer) {
              photoContainer.innerHTML = `
                <img src="${currentObjectUrl}" alt="Contemporaneous Attendance photograph evidence" style="max-width:100%;max-height:360px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);box-shadow:0 8px 24px rgba(0,0,0,0.4);object-fit:cover;" />
              `;
            }
          })
          .catch((err) => {
            if (photoContainer) {
              photoContainer.innerHTML = `
                <div style="color:var(--coral-400, #f87171);font-size:13px;padding:24px;">
                  ⚠️ Could not display photograph: ${escHtml(err.message || 'Access denied')}
                </div>
              `;
            }
          });
      } else {
        if (photoContainer) {
          photoContainer.innerHTML = `
            <div style="color:var(--muted);font-size:13px;padding:32px;">
              📷 No photographic evidence was attached to this punch record.
            </div>
          `;
        }
      }
    };

    render();
  } catch (err) {
    modalMount.innerHTML = `
      <div class="modal-backdrop" style="position:fixed;inset:0;background:rgba(12,11,10,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;">
        <div class="modal-card card" style="width:440px;background:var(--surface-raised, #242220);padding:24px;border-radius:12px;border:1px solid var(--border-subtle);text-align:center;">
          <h3 style="color:var(--coral-400, #f87171);margin-top:0;">Failed to Load Evidence</h3>
          <p style="font-size:13px;color:var(--muted);">${escHtml(err.message || 'Evidence record could not be retrieved.')}</p>
          <button class="btn btn-sm btn-primary" id="evidence-err-close">Close</button>
        </div>
      </div>
    `;
    modalMount.querySelector('#evidence-err-close')?.addEventListener('click', cleanup);
  }
}
