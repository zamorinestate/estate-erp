/* =====================================================================
   js/screens/masterSignIn.js
   ---------------------------------------------------------------------
   "Sign in with Master Account" — Primary Master strong
   authentication (master spec Section 10-31). Never a PIN. This screen
   never learns whether an account exists from a failed attempt (Section
   23/165) — success and failure paths both take the generic route
   through statusShell's showErrorPopup with the same message.

   Two steps rendered into the same card: credentials, then an MFA
   challenge ONLY if the backend says one is required (Section 17-18) —
   this device can't do the silent trusted-device MFA the personal login
   page uses, because it was never enrolled as any specific Master's
   trusted device (see ARCHITECTURE_DECISIONS.md section 6).
   ===================================================================== */
(function (global) {
  'use strict';
  const UI = global.CafeOpsUI;

  const ACCESS_REASONS = [
    ['ON_SITE_OPERATIONS', 'On-site Operations'],
    ['ISSUE_RESOLUTION', 'Issue Resolution'],
    ['CASH_SALES_REVIEW', 'Cash / Sales Review'],
    ['INVENTORY_PROCUREMENT', 'Inventory / Procurement'],
    ['ATTENDANCE_REVIEW', 'Attendance Review'],
    ['MAINTENANCE_QUALITY', 'Maintenance / Quality'],
    ['OTHER', 'Other'],
  ];

  function render(root, params) {
    const device = (params && params.device) || {};
    renderCredentialsStep(root, device);
  }

  function renderCredentialsStep(root, device) {
    root.innerHTML = `
      <div class="auth-card">
        ${UI.brandHeader({
          device: { cafeName: device.cafeName || 'Cafe', deviceName: device.deviceName || 'Cafe Operations Device' },
          title: 'Master Access',
          subtitle: 'Cafe Operations',
        })}
        <form class="auth-form" id="masterForm" novalidate>
          <div class="auth-field">
            <label for="masterIdentifier">Email / User ID</label>
            <input id="masterIdentifier" class="auth-input" type="text" autocomplete="username" required />
          </div>
          <div class="auth-field">
            <label for="masterPassword">Password</label>
            <div class="auth-password">
              <input id="masterPassword" type="password" autocomplete="current-password" placeholder="Password" required />
              <button type="button" class="auth-show-toggle" id="togglePw" aria-pressed="false">Show</button>
            </div>
          </div>
          <div class="auth-field" id="accessReasonField" style="display:none">
            <label for="accessReason">Reason for Master access <span id="reasonOptionalTag" style="font-weight:500;color:var(--muted)">(optional)</span></label>
            <select id="accessReason" class="auth-input">
              <option value="">Select a reason…</option>
              ${ACCESS_REASONS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
            </select>
          </div>
          <div id="errorSlot"></div>
          <button type="submit" class="auth-btn-primary" id="continueBtn">
            <span class="auth-btn-label">Continue</span>
            <span class="auth-spinner" aria-hidden="true"></span>
          </button>
        </form>
        <div class="cafeops-textlinks">
          <button type="button" class="cafeops-textlink cafeops-textlink--muted" id="backLink">Back to Operator Sign-In</button>
        </div>
      </div>`;

    const form = root.querySelector('#masterForm');
    const identifierInput = root.querySelector('#masterIdentifier');
    const passwordInput = root.querySelector('#masterPassword');
    const reasonSelect = root.querySelector('#accessReason');
    const reasonField = root.querySelector('#accessReasonField');
    const continueBtn = root.querySelector('#continueBtn');
    const errorSlot = root.querySelector('#errorSlot');

    root.querySelector('#togglePw').addEventListener('click', () => {
      const showing = passwordInput.type === 'text';
      passwordInput.type = showing ? 'password' : 'text';
      root.querySelector('#togglePw').textContent = showing ? 'Show' : 'Hide';
      root.querySelector('#togglePw').setAttribute('aria-pressed', String(!showing));
    });
    root.querySelector('#backLink').addEventListener('click', () => global.CafeOpsApp.navigate('operatorSignIn', { device }));

    // Access reason is always offered (governance value in knowing why),
    // but only blocks submission when the backend's central policy says
    // so (master spec Section 46 — never hardcoded per-screen).
    let reasonRequired = false;
    global.CafeOpsApi.devicePolicy().then((data) => {
      reasonField.style.display = '';
      reasonRequired = !!(data.policy && data.policy.masterAccessReasonRequired);
      reasonSelect.required = reasonRequired;
      root.querySelector('#reasonOptionalTag').style.display = reasonRequired ? 'none' : '';
    }).catch(() => {});

    function setLoading(isLoading) {
      continueBtn.disabled = isLoading;
      continueBtn.dataset.loading = String(isLoading);
      continueBtn.querySelector('.auth-btn-label').textContent = isLoading ? 'Verifying…' : 'Continue';
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorSlot.innerHTML = '';
      if (reasonRequired && !reasonSelect.value) {
        errorSlot.innerHTML = UI.inlineError('Select a reason for Master access to continue.');
        return;
      }
      setLoading(true);
      try {
        const data = await global.CafeOpsApi.masterSignInCredentials(
          identifierInput.value.trim(), passwordInput.value, reasonSelect.value || undefined
        );
        setLoading(false);
        if (data.requiresMfa) {
          renderMfaStep(root, device, data.mfaChallengeId, reasonSelect.value || undefined);
        } else {
          onMasterSignedIn(data, device);
        }
      } catch (err) {
        setLoading(false);
        if (err.status === 429) {
          global.CafeOpsApp.navigate('status', {
            tone: 'warning', title: 'Sign-In Temporarily Unavailable',
            message: 'Too many unsuccessful attempts were detected. Please try again later or contact an authorised administrator.',
            supportReference: err.supportReference,
            actions: [{ label: 'Back to Attendance', onClick: () => global.CafeOpsApp.navigate('kiosk', { device }) }],
          });
          return;
        }
        UI.showErrorPopup({
          title: 'Master Access Unavailable',
          message: err.message || 'Master access could not be verified on this device. Check your details or try again.',
          supportReference: err.supportReference,
        });
      }
    });
  }

  function renderMfaStep(root, device, mfaChallengeId, accessReason) {
    root.innerHTML = `
      <div class="auth-card">
        ${UI.brandHeader({
          device: { cafeName: device.cafeName || 'Cafe', deviceName: device.deviceName || 'Cafe Operations Device' },
          title: 'Verification Required',
        })}
        <p class="cafeops-mfa-hint">Enter the verification code from your authenticator to confirm it's really you.</p>
        <div class="auth-code-row" id="codeRow" role="group" aria-label="Verification code">
          ${Array.from({ length: 6 }).map((_, i) => `<input class="auth-code-digit" inputmode="numeric" pattern="[0-9]*" maxlength="1" data-code-index="${i}" />`).join('')}
        </div>
        <div id="errorSlot"></div>
        <button type="button" class="auth-btn-primary" id="verifyBtn" disabled>
          <span class="auth-btn-label">Verify</span>
          <span class="auth-spinner" aria-hidden="true"></span>
        </button>
        <div class="cafeops-textlinks">
          <button type="button" class="cafeops-textlink cafeops-textlink--muted" id="backLink">Back to Operator Sign-In</button>
        </div>
      </div>`;

    const digits = Array.from(root.querySelectorAll('[data-code-index]'));
    const verifyBtn = root.querySelector('#verifyBtn');
    const errorSlot = root.querySelector('#errorSlot');

    function currentCode() { return digits.map((d) => d.value).join(''); }
    function refreshBtn() { verifyBtn.disabled = currentCode().length !== 6; }

    digits.forEach((input, i) => {
      input.addEventListener('input', () => {
        input.value = input.value.replace(/[^0-9]/g, '').slice(0, 1);
        if (input.value && digits[i + 1]) digits[i + 1].focus();
        refreshBtn();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !input.value && digits[i - 1]) digits[i - 1].focus();
      });
    });
    digits[0].focus();

    root.querySelector('#backLink').addEventListener('click', () => global.CafeOpsApp.navigate('operatorSignIn', { device }));

    function setLoading(isLoading) {
      verifyBtn.disabled = isLoading || currentCode().length !== 6;
      verifyBtn.querySelector('.auth-btn-label').textContent = isLoading ? 'Verifying…' : 'Verify';
      digits.forEach((d) => { d.disabled = isLoading; });
    }

    verifyBtn.addEventListener('click', async () => {
      errorSlot.innerHTML = '';
      setLoading(true);
      try {
        const data = await global.CafeOpsApi.masterSignInMfa(mfaChallengeId, currentCode(), accessReason);
        onMasterSignedIn(data, device);
      } catch (err) {
        setLoading(false);
        digits.forEach((d) => { d.value = ''; });
        digits[0].focus();
        UI.showErrorPopup({
          title: 'Master Access Unavailable',
          message: err.message || 'That code could not be verified. Check your authenticator and try again.',
        });
      }
    });
  }

  function onMasterSignedIn(data, device) {
    global.CafeOpsTokens.setSessionToken(data.sessionToken);
    global.CafeOpsApp.setIdentity({
      name: null, employeeCode: data.operator.employeeId,
      sessionType: 'MASTER_ACCOUNT', badge: data.operator.role,
      device: { cafeId: data.operator.cafeId, cafeName: data.operator.cafeName || device.cafeName, deviceName: device.deviceName },
    });
    global.CafeOpsApp.navigate('welcome', {
      name: null, employeeCode: data.operator.employeeId,
      cafeName: data.operator.cafeName || device.cafeName, badge: data.operator.role,
    });
  }

  global.CafeOpsScreens = global.CafeOpsScreens || {};
  global.CafeOpsScreens.masterSignIn = { render };
})(window);
