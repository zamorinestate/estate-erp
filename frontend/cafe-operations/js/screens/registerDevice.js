/* =====================================================================
   js/screens/registerDevice.js
   ---------------------------------------------------------------------
   Shown when no device token exists yet (login spec Section 17-20).
   One-time enrollment code -> device becomes trusted -> Attendance Kiosk.
   Never asks for a MASTER/OWNER password to register a device.
   ===================================================================== */
(function (global) {
  'use strict';
  const UI = global.CafeOpsUI;

  function resolveEnrollmentPlatform() {
    const injected = String(global.ZamorinNativeCapabilities?.platform || '').trim().toUpperCase();
    if (injected === 'ANDROID') return 'android';
    if (injected === 'IOS') return 'ios';
    if (injected === 'MACOS') return 'macos';
    if (injected === 'WINDOWS') return 'windows';

    if (global.ZamorinNativeBridge || global.ZamorinAndroidSAF || global.AndroidStorageBridge) {
      return 'android';
    }
    if (global.chrome?.webview) {
      return 'windows';
    }
    if (global.webkit?.messageHandlers?.ZamorinNativeBridge) {
      const isMac = Boolean(
        global.ZamorinIsMac ||
        (global.navigator?.platform && global.navigator.platform.toUpperCase().includes('MAC'))
      );
      return isMac ? 'macos' : 'ios';
    }
    return 'web';
  }

  function render(root) {
    root.innerHTML = `
      <div class="auth-card">
        ${UI.brandHeader({ title: 'Register Cafe Device', subtitle: 'Enter the one-time registration code provided by an authorised administrator.' })}
        <form class="auth-form" id="enrollForm" novalidate>
          <div class="auth-field">
            <label for="enrollCode">Registration code</label>
            <input id="enrollCode" name="enrollCode" class="auth-input" type="text"
                   autocomplete="off" autocapitalize="characters" spellcheck="false"
                   placeholder="e.g. K7M2-QRT9" required
                   style="font-family:var(--font-mono);letter-spacing:.06em;text-transform:uppercase" />
          </div>
          <div class="auth-field">
            <label for="deviceName">Device name <span style="font-weight:500;color:var(--muted)">(optional)</span></label>
            <input id="deviceName" name="deviceName" class="auth-input" type="text"
                   autocomplete="off" placeholder="e.g. Main Counter Mobile" />
          </div>
          <div id="errorSlot"></div>
          <button type="submit" class="auth-btn-primary" id="enrollSubmitBtn">
            <span class="auth-btn-label">Register device</span>
            <span class="auth-spinner" aria-hidden="true"></span>
          </button>
        </form>
        <div class="cafeops-textlinks">
          <button type="button" class="cafeops-textlink cafeops-textlink--muted" id="deviceHelpLink">Device Help</button>
        </div>
      </div>`;

    const form = root.querySelector('#enrollForm');
    const codeInput = root.querySelector('#enrollCode');
    const nameInput = root.querySelector('#deviceName');
    const submitBtn = root.querySelector('#enrollSubmitBtn');
    const errorSlot = root.querySelector('#errorSlot');

    root.querySelector('#deviceHelpLink').addEventListener('click', () => global.CafeOpsApp.navigate('deviceStatus', { preAuth: true }));

    function setLoading(isLoading) {
      submitBtn.disabled = isLoading;
      submitBtn.dataset.loading = String(isLoading);
      submitBtn.querySelector('.auth-btn-label').textContent = isLoading ? 'Registering…' : 'Register device';
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorSlot.innerHTML = '';
      const code = codeInput.value.trim();
      if (!code) {
        errorSlot.innerHTML = UI.inlineError('Enter the registration code.');
        return;
      }
      setLoading(true);
      try {
        const data = await global.CafeOpsApi.enrollDevice({
          enrollmentCode: code,
          displayName: nameInput.value.trim() || undefined,
          platform: resolveEnrollmentPlatform(),
          appVersion: global.CAFE_OPS_APP_VERSION || '1.0.0',
        });
        global.CafeOpsTokens.setDeviceToken(data.deviceToken);
        renderSuccess(root, data.device);
      } catch (err) {
        setLoading(false);
        if (err.code === 'ENROLLMENT_UNAVAILABLE') {
          UI.showErrorPopup({
            title: 'Registration Unavailable',
            message: 'This registration code is invalid, expired, or has already been used.',
            onClose: () => { codeInput.value = ''; codeInput.focus(); },
          });
        } else {
          errorSlot.innerHTML = UI.inlineError(err.message || 'Unable to register this device right now. Please try again.');
        }
      }
    });
  }

  function renderSuccess(root, device) {
    UI.renderStatusScreen(root, {
      tone: 'success',
      title: 'Device Registered',
      message: `This device is now an active Cafe Operations terminal for ${device.cafeName || 'this cafe'}.`,
      device: { cafeName: device.cafeName || 'Cafe assigned', deviceName: device.displayName },
      actions: [{ label: 'Continue to Attendance', onClick: () => global.CafeOpsApp.navigate('kiosk') }],
    });
  }

  global.CafeOpsScreens = global.CafeOpsScreens || {};
  global.CafeOpsScreens.registerDevice = { render };
})(window);
