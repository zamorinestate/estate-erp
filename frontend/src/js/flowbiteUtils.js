// =============================================================================
// ZAMORIN CAFÉ ERP — FLOWBITE UTILITY MODULE
// Phase 2: Shared JS helpers that wire Flowbite JS behaviors + QR generation
// to the existing Zamorin component system.
// =============================================================================

// ─── Speed Dial ──────────────────────────────────────────────────────────────
/**
 * Initialises a speed-dial floating action button.
 * @param {string} triggerId  - ID of the trigger button element
 * @param {string} actionsId  - ID of the actions container element
 */
export function initSpeedDial(triggerId, actionsId) {
  const trigger = document.getElementById(triggerId);
  const actions = document.getElementById(actionsId);
  if (!trigger || !actions) return;

  let open = false;

  function setOpen(val) {
    open = val;
    trigger.classList.toggle('open', open);
    actions.classList.toggle('open', open);
    trigger.setAttribute('aria-expanded', String(open));
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(!open);
  });

  document.addEventListener('click', (e) => {
    if (open && !trigger.contains(e.target) && !actions.contains(e.target)) {
      setOpen(false);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) setOpen(false);
  });
}

// ─── Mega Menu ───────────────────────────────────────────────────────────────
/**
 * Initialises a mega-menu dropdown.
 * @param {string} triggerId  - ID of the nav button that opens the menu
 * @param {string} menuId     - ID of the .mega-menu-dropdown element
 */
export function initMegaMenu(triggerId, menuId) {
  const trigger = document.getElementById(triggerId);
  const menu    = document.getElementById(menuId);
  if (!trigger || !menu) return;

  let open = false;

  function setOpen(val) {
    open = val;
    menu.classList.toggle('open', open);
    trigger.setAttribute('aria-expanded', String(open));
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(!open);
  });

  document.addEventListener('click', (e) => {
    if (open && !trigger.contains(e.target) && !menu.contains(e.target)) {
      setOpen(false);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) setOpen(false);
  });
}

// ─── Drawer ───────────────────────────────────────────────────────────────────
/**
 * Initialises a side drawer + its backdrop.
 * @param {Object} opts
 * @param {string} opts.drawerId     - ID of the .drawer element
 * @param {string} opts.backdropId   - ID of the .drawer-backdrop element
 * @param {string} [opts.openBtnId]  - Optional ID of the button that opens it
 * @param {string} [opts.closeBtnId] - Optional ID of the close button inside drawer
 * @returns {{ open: Function, close: Function }}
 */
export function initDrawer({ drawerId, backdropId, openBtnId, closeBtnId } = {}) {
  const drawer   = document.getElementById(drawerId);
  const backdrop = document.getElementById(backdropId);
  if (!drawer) return { open: () => {}, close: () => {} };

  function openDrawer() {
    drawer.classList.add('open');
    if (backdrop) backdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    drawer.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
    document.body.style.overflow = '';
  }

  if (openBtnId) {
    const openBtn = document.getElementById(openBtnId);
    if (openBtn) openBtn.addEventListener('click', openDrawer);
  }

  if (closeBtnId) {
    const closeBtn = document.getElementById(closeBtnId);
    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  }

  if (backdrop) backdrop.addEventListener('click', closeDrawer);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer();
  });

  return { open: openDrawer, close: closeDrawer };
}

// ─── Accordion ────────────────────────────────────────────────────────────────
/**
 * Initialises accordion items inside a container.
 * @param {HTMLElement|string} containerOrId - Container element or its ID
 * @param {Object} [opts]
 * @param {boolean} [opts.allowMultiple=false] - Allow multiple open items simultaneously
 */
export function initAccordion(containerOrId, { allowMultiple = false } = {}) {
  const container = typeof containerOrId === 'string'
    ? document.getElementById(containerOrId)
    : containerOrId;
  if (!container) return;

  const headers = container.querySelectorAll('.accordion-header');

  headers.forEach((header) => {
    header.addEventListener('click', () => {
      const isOpen = header.classList.contains('open');
      const body   = header.nextElementSibling;

      if (!allowMultiple) {
        // Close all others
        headers.forEach((h) => {
          h.classList.remove('open');
          const b = h.nextElementSibling;
          if (b) b.classList.remove('open');
        });
      }

      if (!isOpen) {
        header.classList.add('open');
        if (body) body.classList.add('open');
      }
    });
  });
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
/**
 * Initialises a tab set.
 * @param {HTMLElement|string} containerOrId - Container element or its ID
 */
export function initTabs(containerOrId) {
  const container = typeof containerOrId === 'string'
    ? document.getElementById(containerOrId)
    : containerOrId;
  if (!container) return;

  const buttons = container.querySelectorAll('.tab-btn');
  const panels  = container.querySelectorAll('.tab-panel');

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;

      buttons.forEach((b) => b.classList.remove('active'));
      panels.forEach((p) => p.classList.remove('active'));

      btn.classList.add('active');
      const panel = container.querySelector(`.tab-panel[data-tab="${target}"]`);
      if (panel) panel.classList.add('active');
    });
  });

  // Activate first tab by default if none active
  if (!container.querySelector('.tab-btn.active') && buttons.length > 0) {
    buttons[0].click();
  }
}

import { generateQrSvg } from "./utils/qrCodeGen.js";

// ─── QR Code Generator ───────────────────────────────────────────────────────
/**
 * Generates a QR code into a container element.
 * Uses window.QRCode if available, with zero-dependency ISO/IEC SVG fallback.
 *
 * @param {Object} opts
 * @param {string}  opts.containerId  - ID of the .qr-canvas-wrap element
 * @param {string}  opts.value        - Data to encode (UPI URI, URL, text, etc.)
 * @param {number}  [opts.size=180]   - Canvas size in px
 * @param {string}  [opts.color='#17140f'] - Dark module color (foreground)
 * @param {string}  [opts.bg='#ffffff']    - Light module color (background)
 * @returns {Promise<void>}
 */
export async function generateQR({ containerId, value, size = 180, color = '#17140f', bg = '#ffffff' } = {}) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;

  wrap.classList.add('qr-loading');
  wrap.innerHTML = '';

  if (window.QRCode && window.QRCode.toCanvas) {
    try {
      const canvas = document.createElement('canvas');
      await window.QRCode.toCanvas(canvas, value, {
        width: size,
        margin: 2,
        color: { dark: color, light: bg },
      });
      wrap.classList.remove('qr-loading');
      wrap.appendChild(canvas);
      return;
    } catch {
      // Fallback to SVG below
    }
  }

  // Instant zero-dependency SVG QR generator
  try {
    const svgStr = generateQrSvg(value, {
      size,
      margin: 2,
      darkColor: color,
      lightColor: bg,
      includeLogo: false,
    });
    wrap.classList.remove('qr-loading');
    wrap.innerHTML = svgStr;
  } catch (err) {
    wrap.classList.remove('qr-loading');
    wrap.innerHTML = `<span style="font-size:12px;color:var(--danger);text-align:center;padding:8px;">QR Error: ${err.message}</span>`;
  }
}

/**
 * Builds a UPI deep-link URI for QR generation at POS.
 * @param {Object} opts
 * @param {string} opts.upiId     - Merchant UPI ID (e.g. zamorincafe@hdfc)
 * @param {string} opts.name      - Merchant name
 * @param {number} opts.amount    - Amount in INR (e.g. 350.00)
 * @param {string} [opts.tn]      - Transaction note (e.g. "Order #ORD-0042")
 * @param {string} [opts.cu='INR'] - Currency
 * @returns {string} UPI URI
 */
export function buildUpiUri({ upiId, name, amount, tn = 'Zamorin Cafe Payment', cu = 'INR' } = {}) {
  const params = new URLSearchParams({
    pa: upiId,
    pn: name,
    am: amount.toFixed(2),
    tn,
    cu,
  });
  return `upi://pay?${params.toString()}`;
}

// ─── Clipboard ───────────────────────────────────────────────────────────────

/**
 * Flowbite CopyClipboard class.
 * Handles copying text, code or form values to the clipboard with visual success indicators.
 */
export class CopyClipboard {
  /**
   * @param {HTMLElement} triggerEl - Trigger button or element
   * @param {HTMLElement} targetEl - Source element containing the text/value
   * @param {Object} [options={}]
   * @param {string} [options.contentType='input'] - 'input'|'innerHTML'|'textContent'
   * @param {boolean} [options.htmlEntities=false] - Decode HTML entities
   * @param {Function} [options.onCopy] - Callback when copied
   * @param {number} [options.resetMs=2000] - Timeout in ms before restoring default state
   * @param {Object} [instanceOptions={}]
   * @param {string} [instanceOptions.id]
   * @param {boolean} [instanceOptions.override=true]
   */
  constructor(triggerEl, targetEl, options = {}, instanceOptions = {}) {
    this._triggerEl = triggerEl;
    this._targetEl = targetEl;
    this._options = {
      contentType: options.contentType || (targetEl && targetEl.tagName === 'INPUT' ? 'input' : 'textContent'),
      htmlEntities: options.htmlEntities || false,
      onCopy: options.onCopy || null,
      resetMs: options.resetMs !== undefined ? options.resetMs : 2000,
    };
    this._instanceOptions = {
      id: instanceOptions.id || (triggerEl ? triggerEl.id : null),
      override: instanceOptions.override !== undefined ? instanceOptions.override : true,
    };
    this._resetTimeout = null;
    this._clickHandler = (e) => {
      if (e) e.preventDefault();
      this.copy();
    };

    this._init();
  }

  _init() {
    if (this._triggerEl) {
      this._triggerEl.addEventListener('click', this._clickHandler);
    }
  }

  /**
   * Decodes HTML entities for code blocks and text.
   * @param {string} html
   * @returns {string}
   */
  decodeHTML(html) {
    if (!html) return '';
    if (typeof document !== 'undefined') {
      const txt = document.createElement('textarea');
      txt.innerHTML = html;
      return txt.value;
    }
    return html;
  }

  /**
   * Gets the extracted value of the target element.
   * @returns {string}
   */
  getTargetValue() {
    if (!this._targetEl) return '';
    let val = '';
    const ct = this._options.contentType;
    if (ct === 'input' && typeof this._targetEl.value !== 'undefined') {
      val = this._targetEl.value;
    } else if (ct === 'innerHTML') {
      val = this._targetEl.innerHTML;
    } else if (ct === 'textContent') {
      val = this._targetEl.textContent || this._targetEl.innerText || '';
    } else {
      val = typeof this._targetEl.value !== 'undefined' ? this._targetEl.value : (this._targetEl.textContent || this._targetEl.innerText || '');
    }

    if (this._options.htmlEntities) {
      val = this.decodeHTML(val);
    }
    return val;
  }

  /**
   * Copies the target value to clipboard and switches UI to success state.
   */
  async copy() {
    const textToCopy = this.getTargetValue();

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      } else if (typeof document !== 'undefined') {
        const ta = document.createElement('textarea');
        ta.value = textToCopy;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
    } catch (err) {
      console.warn('[Flowbite CopyClipboard] Copy error:', err);
    }

    this._showSuccess();

    if (typeof this._options.onCopy === 'function') {
      this._options.onCopy(this);
    }

    if (this._resetTimeout) clearTimeout(this._resetTimeout);
    if (this._options.resetMs > 0) {
      this._resetTimeout = setTimeout(() => {
        this._showDefault();
      }, this._options.resetMs);
    }
  }

  /**
   * Updates UI to show success state.
   */
  _showSuccess() {
    if (!this._triggerEl) return;
    this._triggerEl.classList.add('copied');

    const defMsg = this._triggerEl.querySelector('#default-message, [id^="default-message"]');
    const succMsg = this._triggerEl.querySelector('#success-message, [id^="success-message"]');
    if (defMsg) defMsg.classList.add('hidden');
    if (succMsg) succMsg.classList.remove('hidden');

    const defIcon = this._triggerEl.querySelector('#default-icon, [id^="default-icon"], .fb-clipboard-icon-copy');
    const succIcon = this._triggerEl.querySelector('#success-icon, [id^="success-icon"], .fb-clipboard-icon-check');
    if (defIcon) defIcon.classList.add('hidden');
    if (succIcon) succIcon.classList.remove('hidden');

    const tooltipId = this._triggerEl.getAttribute('data-tooltip-target');
    if (tooltipId && typeof document !== 'undefined') {
      const tooltipEl = document.getElementById(tooltipId);
      if (tooltipEl) {
        const defTooltipMsg = tooltipEl.querySelector('#default-tooltip-message, [id^="default-tooltip-message"]');
        const succTooltipMsg = tooltipEl.querySelector('#success-tooltip-message, [id^="success-tooltip-message"]');
        if (defTooltipMsg) defTooltipMsg.classList.add('hidden');
        if (succTooltipMsg) succTooltipMsg.classList.remove('hidden');
      }
    }
  }

  /**
   * Updates UI to restore default state.
   */
  _showDefault() {
    if (!this._triggerEl) return;
    this._triggerEl.classList.remove('copied');

    const defMsg = this._triggerEl.querySelector('#default-message, [id^="default-message"]');
    const succMsg = this._triggerEl.querySelector('#success-message, [id^="success-message"]');
    if (defMsg) defMsg.classList.remove('hidden');
    if (succMsg) succMsg.classList.add('hidden');

    const defIcon = this._triggerEl.querySelector('#default-icon, [id^="default-icon"], .fb-clipboard-icon-copy');
    const succIcon = this._triggerEl.querySelector('#success-icon, [id^="success-icon"], .fb-clipboard-icon-check');
    if (defIcon) defIcon.classList.remove('hidden');
    if (succIcon) succIcon.classList.add('hidden');

    const tooltipId = this._triggerEl.getAttribute('data-tooltip-target');
    if (tooltipId && typeof document !== 'undefined') {
      const tooltipEl = document.getElementById(tooltipId);
      if (tooltipEl) {
        const defTooltipMsg = tooltipEl.querySelector('#default-tooltip-message, [id^="default-tooltip-message"]');
        const succTooltipMsg = tooltipEl.querySelector('#success-tooltip-message, [id^="success-tooltip-message"]');
        if (defTooltipMsg) defTooltipMsg.classList.remove('hidden');
        if (succTooltipMsg) succTooltipMsg.classList.add('hidden');
      }
    }
  }

  /**
   * Updates the onCopy callback.
   * @param {Function} callback
   */
  updateOnCopyCallback(callback) {
    this._options.onCopy = callback;
  }

  /**
   * Destroys the clipboard instance and removes event listeners.
   */
  destroy() {
    if (this._triggerEl) {
      this._triggerEl.removeEventListener('click', this._clickHandler);
      delete this._triggerEl._fbClipboardInstance;
    }
    if (this._resetTimeout) {
      clearTimeout(this._resetTimeout);
    }
  }
}

/**
 * Wires a clipboard copy button (Flowbite compatible).
 * @param {string} btnId     - ID of the .clipboard-btn element
 * @param {string} sourceId  - ID of the element whose text to copy
 * @param {number} [resetMs=2000] - ms before button resets to default state
 * @returns {CopyClipboard|null}
 */
export function initClipboard(btnId, sourceId, resetMs = 2000) {
  if (typeof document === 'undefined') return null;
  const btn    = document.getElementById(btnId);
  const source = document.getElementById(sourceId);
  if (!btn || !source) return null;

  btn.setAttribute('data-copy-to-clipboard-target', sourceId);
  const contentType = btn.getAttribute('data-copy-to-clipboard-content-type') || (source.tagName === 'INPUT' ? 'input' : 'textContent');
  const htmlEntities = btn.getAttribute('data-copy-to-clipboard-html-entities') === 'true';

  const instance = new CopyClipboard(btn, source, { contentType, htmlEntities, resetMs });
  btn._fbClipboardInstance = instance;
  return instance;
}

/**
 * Initializes all copy to clipboard triggers in the DOM with [data-copy-to-clipboard-target].
 * @param {HTMLElement|Document} [root=document]
 */
export function initCopyClipboards(root = document) {
  if (typeof document === 'undefined' || !root || !root.querySelectorAll) return;
  const triggers = Array.from(root.querySelectorAll('[data-copy-to-clipboard-target]'));

  triggers.forEach((trigger) => {
    if (trigger.dataset.fbClipboardBound) return;
    trigger.dataset.fbClipboardBound = 'true';

    const targetId = trigger.getAttribute('data-copy-to-clipboard-target');
    const targetEl = document.getElementById(targetId);
    if (!targetEl) return;

    const contentType = trigger.getAttribute('data-copy-to-clipboard-content-type') || (targetEl.tagName === 'INPUT' ? 'input' : 'textContent');
    const htmlEntities = trigger.getAttribute('data-copy-to-clipboard-html-entities') === 'true';

    const instance = new CopyClipboard(trigger, targetEl, { contentType, htmlEntities });
    trigger._fbClipboardInstance = instance;
  });

  if (typeof initTooltips === 'function') {
    initTooltips(root);
  }
}

/**
 * Global delegated clipboard handler supporting Flowbite data-copy-to-clipboard-target,
 * data-copy-value, .clipboard-btn, and .fb-clipboard-btn.
 */
export function setupGlobalClipboard() {
  if (typeof window === 'undefined' || window.__zamorinClipboardWired) return;
  window.__zamorinClipboardWired = true;

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-copy-to-clipboard-target], [data-copy-value], .clipboard-btn, .fb-clipboard-btn');
    if (!btn) return;
    if (btn._fbClipboardInstance) return; // Handled by instance

    let text = '';
    const targetId = btn.getAttribute('data-copy-to-clipboard-target');
    let targetEl = null;
    if (targetId) {
      targetEl = document.getElementById(targetId);
      if (targetEl) {
        const ct = btn.getAttribute('data-copy-to-clipboard-content-type') || (targetEl.tagName === 'INPUT' ? 'input' : 'textContent');
        if (ct === 'textContent') {
          text = targetEl.textContent || targetEl.innerText || '';
        } else if (ct === 'innerHTML') {
          text = targetEl.innerHTML || '';
        } else {
          text = typeof targetEl.value !== 'undefined' ? targetEl.value : (targetEl.textContent || targetEl.innerText || '');
        }
      }
    } else if (btn.getAttribute('data-copy-value')) {
      text = btn.getAttribute('data-copy-value');
    } else {
      const parentInput = btn.closest('.fb-clipboard-wrap')?.querySelector('.fb-clipboard-input')
        || btn.closest('.qr-panel, .fb-qr-panel')?.querySelector('.qr-value-display, .fb-qr-value');
      if (parentInput) {
        text = parentInput.value || parentInput.textContent || '';
      }
    }

    if (!text && btn.dataset.copySource) {
      const srcEl = document.getElementById(btn.dataset.copySource);
      if (srcEl) text = srcEl.value || srcEl.textContent || '';
    }

    if (!text.trim()) return;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text.trim());
      } else {
        const ta = document.createElement('textarea');
        ta.value = text.trim();
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }

      btn.classList.add('copied');
      const defIcon = btn.querySelector('#default-icon, [id^="default-icon"], .fb-clipboard-icon-copy');
      const succIcon = btn.querySelector('#success-icon, [id^="success-icon"], .fb-clipboard-icon-check');
      const defMsg = btn.querySelector('#default-message, [id^="default-message"]');
      const succMsg = btn.querySelector('#success-message, [id^="success-message"]');

      if (defIcon && succIcon) {
        defIcon.classList.add('hidden');
        succIcon.classList.remove('hidden');
      }
      if (defMsg && succMsg) {
        defMsg.classList.add('hidden');
        succMsg.classList.remove('hidden');
      }

      const tooltipId = btn.getAttribute('data-tooltip-target');
      let defTooltipMsg = null;
      let succTooltipMsg = null;
      if (tooltipId) {
        const tooltipEl = document.getElementById(tooltipId);
        if (tooltipEl) {
          defTooltipMsg = tooltipEl.querySelector('#default-tooltip-message, [id^="default-tooltip-message"]');
          succTooltipMsg = tooltipEl.querySelector('#success-tooltip-message, [id^="success-tooltip-message"]');
          if (defTooltipMsg && succTooltipMsg) {
            defTooltipMsg.classList.add('hidden');
            succTooltipMsg.classList.remove('hidden');
          }
        }
      }

      if (!defIcon && !defMsg) {
        btn.dataset._origHTML = btn.dataset._origHTML || btn.innerHTML;
        btn.innerHTML = '✓ Copied';
      }

      setTimeout(() => {
        btn.classList.remove('copied');
        if (defIcon && succIcon) {
          defIcon.classList.remove('hidden');
          succIcon.classList.add('hidden');
        }
        if (defMsg && succMsg) {
          defMsg.classList.remove('hidden');
          succMsg.classList.add('hidden');
        }
        if (defTooltipMsg && succTooltipMsg) {
          defTooltipMsg.classList.remove('hidden');
          succTooltipMsg.classList.add('hidden');
        }
        if (!defIcon && !defMsg && btn.dataset._origHTML) {
          btn.innerHTML = btn.dataset._origHTML;
        }
      }, 2000);
    } catch (err) {
      console.warn('[Zamorin ERP] Clipboard copy failed:', err);
    }
  });
}

// Auto-wire on script load
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupGlobalClipboard();
      initCopyClipboards();
      initDatepickers();
    });
  } else {
    setupGlobalClipboard();
    initCopyClipboards();
    initDatepickers();
  }
}

// ─── Dismiss Banner / Alert ───────────────────────────────────────────────────
// Note: See unified Flowbite Dismiss class and initDismiss() implementation below.


// ─── Progress Bar ─────────────────────────────────────────────────────────────
/**
 * Animates a progress bar to a target percentage.
 * @param {string} fillId     - ID of the .progress-fill element
 * @param {number} pct        - Target percentage (0–100)
 * @param {number} [delay=50] - Delay in ms before animation starts
 */
export function setProgress(fillId, pct, delay = 50) {
  const fill = document.getElementById(fillId);
  if (!fill) return;
  fill.style.width = '0%';
  setTimeout(() => { fill.style.width = `${Math.min(100, Math.max(0, pct))}%`; }, delay);
}

// ─── Stepper ──────────────────────────────────────────────────────────────────
/**
 * Creates a stepper controller.
 * @param {string} containerId  - ID of .stepper-container or .stepper-vertical
 * @returns {{ goTo: Function, next: Function, prev: Function, current: Function }}
 */
export function initStepper(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return { goTo: () => {}, next: () => {}, prev: () => {}, current: () => 0 };

  const steps = Array.from(container.querySelectorAll('.stepper-step'));
  let current = 0;

  function render() {
    steps.forEach((step, i) => {
      step.classList.remove('active', 'completed', 'error');
      if (i < current)  step.classList.add('completed');
      if (i === current) step.classList.add('active');
    });
  }

  render();

  return {
    goTo(index) {
      current = Math.max(0, Math.min(steps.length - 1, index));
      render();
    },
    next() {
      if (current < steps.length - 1) { current++; render(); }
    },
    prev() {
      if (current > 0) { current--; render(); }
    },
    current() { return current; },
    markError(index) {
      const step = steps[index];
      if (step) { step.classList.remove('active', 'completed'); step.classList.add('error'); }
    },
  };
}

// ─── Simple-Datatables initialiser ────────────────────────────────────────────
/**
 * Initialises a Simple-Datatables instance on a <table>.
 * Waits for the library to load (it's deferred).
 *
 * @param {string} tableId   - ID of the <table> element
 * @param {Object} [opts={}] - simple-datatables options
 * @returns {Promise<Object|null>} DataTable instance or null
 */
export async function initDataTable(tableId, opts = {}) {
  const table = document.getElementById(tableId);
  if (!table) return null;

  const timeout = 8000;
  const start   = Date.now();
  while (!window.simpleDatatables?.DataTable && Date.now() - start < timeout) {
    await new Promise((r) => setTimeout(r, 150));
  }

  if (!window.simpleDatatables?.DataTable) {
    console.warn(`[Zamorin ERP] simpleDatatables not loaded — table #${tableId} will render without pagination/search.`);
    return null;
  }

  const defaultOpts = {
    searchable: true,
    sortable: true,
    perPage: 20,
    perPageSelect: [10, 20, 50, 100],
    labels: {
      placeholder: 'Search...',
      searchTitle: 'Search within table',
      perPage: 'rows per page',
      noRows: 'No records found',
      info: 'Showing {start} to {end} of {rows} entries',
    },
    ...opts,
  };

  try {
    return new window.simpleDatatables.DataTable(`#${tableId}`, defaultOpts);
  } catch (err) {
    console.error(`[Zamorin ERP] DataTable init failed for #${tableId}:`, err);
    return null;
  }
}

// ─── Flowbite Typography & Icon Utilities ──────────────────────────────────────
export { FLOWBITE_ICONS, flowbiteIcon } from "./icons.js";

/**
 * Renders a standard Flowbite typography container using Tailwind text/dark mode utilities.
 * Default template:
 * <div>
 *     <p class="text-lg font-medium text-gray-900 dark:text-white">${text}</p>
 * </div>
 *
 * @param {Object} opts
 * @param {string} opts.text - Text content
 * @param {string} [opts.className="text-lg font-medium text-gray-900 dark:text-white"] - Tailwind utility classes
 * @param {string} [opts.tag="p"] - HTML tag
 * @param {string} [opts.containerClass=""] - Optional wrapper container classes
 * @returns {string} HTML string
 */
export function renderFlowbiteTypography({
  text = "",
  className = "text-lg font-medium text-gray-900 dark:text-white",
  tag = "p",
  containerClass = ""
} = {}) {
  const inner = `<${tag} class="${className}">${text}</${tag}>`;
  return containerClass ? `<div class="${containerClass}">${inner}</div>` : `<div>${inner}</div>`;
}

// ─── Flowbite RTL (Right-to-Left) Utilities ──────────────────────────────────
const DIR_STORAGE_KEY = 'zamorin-dir';

/**
 * Returns current text direction ('ltr' or 'rtl').
 * @returns {'ltr'|'rtl'}
 */
export function getTextDirection() {
  return document.documentElement.getAttribute('dir') || localStorage.getItem(DIR_STORAGE_KEY) || 'ltr';
}

/**
 * Sets document text direction ('ltr' or 'rtl') and persists to localStorage.
 * @param {'ltr'|'rtl'} dir
 */
export function setTextDirection(dir) {
  const targetDir = dir === 'rtl' ? 'rtl' : 'ltr';
  document.documentElement.setAttribute('dir', targetDir);
  try {
    localStorage.setItem(DIR_STORAGE_KEY, targetDir);
  } catch {}
  document.dispatchEvent(new CustomEvent('zamorin:dirchange', { detail: { dir: targetDir } }));
  return targetDir;
}

/**
 * Toggles text direction between LTR and RTL.
 * @returns {'ltr'|'rtl'} New text direction
 */
export function toggleTextDirection() {
  const current = getTextDirection();
  const next = current === 'rtl' ? 'ltr' : 'rtl';
  return setTextDirection(next);
}

/**
 * Initialises an RTL/LTR toggle button.
 * @param {string} triggerId - ID of trigger button
 * @param {string} [labelId]  - Optional ID of span inside displaying current mode
 */
export function initRtlToggle(triggerId = 'rtl-toggle', labelId = 'rtl-toggle-label') {
  const trigger = document.getElementById(triggerId);
  if (!trigger) return;

  function updateUi() {
    const current = getTextDirection();
    const label = document.getElementById(labelId);
    if (label) label.textContent = current.toUpperCase();
    trigger.setAttribute('title', `Text direction: ${current.toUpperCase()} (Click to toggle LTR / RTL)`);
    trigger.setAttribute('aria-label', `Switch text direction (currently ${current.toUpperCase()})`);
  }

  updateUi();

  trigger.addEventListener('click', (e) => {
    e.preventDefault();
    toggleTextDirection();
    updateUi();
  });

  document.addEventListener('zamorin:dirchange', () => {
    updateUi();
  });
}

/**
 * Renders the official Flowbite bidirectional (LTR/RTL) responsive navbar component.
 * Uses logical properties (me-3), md:space-x-8, and rtl:space-x-reverse.
 *
 * @param {Object} [opts]
 * @param {string} [opts.brandName="Zamorin Cafe"]
 * @param {Array<{label: string, href: string, active?: boolean}>} [opts.items]
 * @returns {string} HTML string
 */
export function renderFlowbiteRtlNav({
  brandName = "Zamorin Cafe",
  items = [
    { label: "Home", href: "#dashboard", active: true },
    { label: "About", href: "#reports" },
    { label: "Services", href: "#pos" },
    { label: "Pricing", href: "#menu" },
    { label: "Contact", href: "#settings" },
  ]
} = {}) {
  const linksHtml = items.map((item) => `
    <li>
      <a href="${item.href}" class="block py-2 px-3 ${item.active ? 'text-white bg-brand rounded md:bg-transparent md:text-fg-brand md:p-0' : 'text-heading rounded hover:bg-neutral-tertiary md:hover:bg-transparent md:border-0 md:hover:text-fg-brand md:p-0 md:dark:hover:bg-transparent'}" ${item.active ? 'aria-current="page"' : ''}>${item.label}</a>
    </li>
  `).join('');

  return `
    <nav class="bg-neutral-primary border-default rounded-lg mb-4">
      <div class="max-w-screen-xl flex flex-wrap items-center justify-between mx-auto p-4">
        <a href="#dashboard" class="flex items-center">
            <span class="self-center text-xl text-heading font-semibold whitespace-nowrap">${brandName}</span>
        </a>
        <button data-collapse-toggle="navbar-default" type="button" class="inline-flex items-center p-2 w-10 h-10 justify-center text-sm text-body rounded-base md:hidden hover:bg-neutral-secondary-soft hover:text-heading focus:outline-none focus:ring-2 focus:ring-neutral-tertiary" aria-controls="navbar-default" aria-expanded="false">
            <span class="sr-only">Open main menu</span>
            <svg class="w-6 h-6" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M5 7h14M5 12h14M5 17h14"/></svg>
        </button>
        <div class="hidden w-full md:block md:w-auto" id="navbar-default">
          <ul class="font-medium flex flex-col p-4 md:p-0 mt-4 border border-default rounded-base bg-neutral-secondary-soft md:flex-row md:space-x-8 rtl:space-x-reverse md:mt-0 md:border-0 md:bg-neutral-primary">
            ${linksHtml}
          </ul>
        </div>
      </div>
    </nav>
  `;
}

// ─── Flowbite Accordion & Nesting Accordions ──────────────────────────────────

/**
 * Flowbite Accordion object per official JavaScript specification.
 * Supports nested accordions without cross-level item collision.
 */
export class Accordion {
  /**
   * @param {HTMLElement|string} accordionEl - Parent accordion element
   * @param {Array<Object>} [items=[]] - [{ id, triggerEl, targetEl, active, iconEl }]
   * @param {Object} [options={}] - Options (alwaysOpen, activeClasses, inactiveClasses, onOpen, onClose, onToggle)
   * @param {Object} [instanceOptions={}] - Instance options ({ id, override })
   */
  constructor(accordionEl, items = [], options = {}, instanceOptions = {}) {
    this._accordionEl = typeof accordionEl === 'string' ? document.querySelector(accordionEl) : accordionEl;
    this._items = items || [];
    this._options = {
      alwaysOpen: false,
      activeClasses: 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white',
      inactiveClasses: 'text-body',
      onOpen: () => {},
      onClose: () => {},
      onToggle: () => {},
      ...options,
    };
    this._instanceOptions = {
      id: this._accordionEl?.id || `accordion-${Date.now()}`,
      override: true,
      ...instanceOptions,
    };
    this._clickHandlerMap = new Map();
    this._isInitialized = false;

    if (this._accordionEl) {
      this.init();
    }
  }

  init() {
    if (!this._accordionEl) return;

    // If items were not provided, auto-discover scoped strictly to THIS accordion
    // IMPORTANT: Exclude elements that belong to nested [data-accordion] instances
    if (!this._items.length) {
      const allTriggers = Array.from(this._accordionEl.querySelectorAll('[data-accordion-target]'));
      const scopedTriggers = allTriggers.filter(
        (trigger) => trigger.closest('[data-accordion]') === this._accordionEl
      );

      this._items = scopedTriggers.map((trigger, idx) => {
        const targetSelector = trigger.getAttribute('data-accordion-target');
        const targetEl = targetSelector ? (this._accordionEl.querySelector(targetSelector) || document.querySelector(targetSelector)) : null;
        const iconEl = trigger.querySelector('[data-accordion-icon]');
        const isExpanded = trigger.getAttribute('aria-expanded') === 'true';

        return {
          id: trigger.id || `${this._instanceOptions.id}-heading-${idx + 1}`,
          triggerEl: trigger,
          targetEl,
          iconEl,
          active: isExpanded,
        };
      });
    }

    // Attach listeners and sync initial visual classes
    this._items.forEach((item) => {
      if (!item.triggerEl || !item.targetEl) return;

      const clickHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggle(item.id);
      };

      this._clickHandlerMap.set(item.triggerEl, clickHandler);
      item.triggerEl.addEventListener('click', clickHandler);

      // Apply initial styling
      if (item.active) {
        this._applyOpenStyles(item, false);
      } else {
        this._applyCloseStyles(item, false);
      }
    });

    this._isInitialized = true;
  }

  getItem(id) {
    return this._items.find((item) => item.id === id);
  }

  open(id) {
    const item = this.getItem(id);
    if (!item) return;

    // If alwaysOpen is false, close all other items in THIS accordion
    if (!this._options.alwaysOpen) {
      this._items.forEach((other) => {
        if (other.id !== id && other.active) {
          this._applyCloseStyles(other, true);
        }
      });
    }

    this._applyOpenStyles(item, true);
  }

  close(id) {
    const item = this.getItem(id);
    if (!item || !item.active) return;
    this._applyCloseStyles(item, true);
  }

  toggle(id) {
    const item = this.getItem(id);
    if (!item) return;

    if (item.active) {
      this.close(id);
    } else {
      this.open(id);
    }

    if (typeof this._options.onToggle === 'function') {
      this._options.onToggle(item);
    }
  }

  _applyOpenStyles(item, fireCallback = true) {
    item.active = true;
    item.triggerEl.setAttribute('aria-expanded', 'true');
    item.targetEl.classList.remove('hidden');

    this._removeClass(item.triggerEl, this._options.inactiveClasses);
    this._addClass(item.triggerEl, this._options.activeClasses);

    if (item.iconEl) {
      item.iconEl.classList.add('rotate-180');
    }

    if (fireCallback && typeof this._options.onOpen === 'function') {
      this._options.onOpen(item);
    }
  }

  _applyCloseStyles(item, fireCallback = true) {
    item.active = false;
    item.triggerEl.setAttribute('aria-expanded', 'false');
    item.targetEl.classList.add('hidden');

    this._removeClass(item.triggerEl, this._options.activeClasses);
    this._addClass(item.triggerEl, this._options.inactiveClasses);

    if (item.iconEl) {
      item.iconEl.classList.remove('rotate-180');
    }

    if (fireCallback && typeof this._options.onClose === 'function') {
      this._options.onClose(item);
    }
  }

  _addClass(el, classes) {
    if (!el || !classes) return;
    const tokens = Array.isArray(classes) ? classes : classes.split(/\s+/).filter(Boolean);
    tokens.forEach((t) => el.classList.add(t));
  }

  _removeClass(el, classes) {
    if (!el || !classes) return;
    const tokens = Array.isArray(classes) ? classes : classes.split(/\s+/).filter(Boolean);
    tokens.forEach((t) => el.classList.remove(t));
  }

  updateOnOpen(callback) {
    this._options.onOpen = callback;
  }

  updateOnClose(callback) {
    this._options.onClose = callback;
  }

  updateOnToggle(callback) {
    this._options.onToggle = callback;
  }

  destroy() {
    this._items.forEach((item) => {
      if (item.triggerEl && this._clickHandlerMap.has(item.triggerEl)) {
        item.triggerEl.removeEventListener('click', this._clickHandlerMap.get(item.triggerEl));
        this._clickHandlerMap.delete(item.triggerEl);
      }
    });
    this._isInitialized = false;
  }
}

/**
 * Initializes all Flowbite accordions (including nested ones) within a container.
 * Safely partitions nested [data-accordion] containers without cross-querying children.
 *
 * @param {HTMLElement|Document} [root=document]
 * @returns {Array<Accordion>} Array of initialized Accordion instances
 */
export function initAccordions(root = document) {
  const accordionEls = Array.from(root.querySelectorAll('[data-accordion]'));
  const instances = [];

  accordionEls.forEach((accordionEl) => {
    if (accordionEl.dataset.fbAccordionBound) return;
    accordionEl.dataset.fbAccordionBound = 'true';

    const behavior = accordionEl.getAttribute('data-accordion') || 'collapse';
    const alwaysOpen = behavior === 'open';
    const activeClasses = accordionEl.getAttribute('data-active-classes') || 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white';
    const inactiveClasses = accordionEl.getAttribute('data-inactive-classes') || 'text-body';

    // Strictly scope triggers to this accordion only
    const allTriggers = Array.from(accordionEl.querySelectorAll('[data-accordion-target]'));
    const scopedTriggers = allTriggers.filter(
      (btn) => btn.closest('[data-accordion]') === accordionEl
    );

    const items = scopedTriggers.map((btn, idx) => {
      const targetSelector = btn.getAttribute('data-accordion-target');
      const targetEl = targetSelector ? (accordionEl.querySelector(targetSelector) || document.querySelector(targetSelector)) : null;
      const iconEl = btn.querySelector('[data-accordion-icon]');
      const active = btn.getAttribute('aria-expanded') === 'true';

      return {
        id: btn.id || `${accordionEl.id || 'accordion'}-heading-${idx + 1}`,
        triggerEl: btn,
        targetEl,
        iconEl,
        active,
      };
    });

    const acc = new Accordion(accordionEl, items, {
      alwaysOpen,
      activeClasses,
      inactiveClasses,
    });

    instances.push(acc);
  });

  return instances;
}

/**
 * Renders the official Flowbite nested accordion HTML markup.
 * Compatible with LTR, RTL, dark mode, and Tailwind v4.
 *
 * @param {Object} [opts]
 * @param {string} [opts.id="accordion-collapse-2"]
 * @returns {string} HTML string
 */
export function renderNestedAccordionSample({ id = "accordion-collapse-2" } = {}) {
  return `
<div id="${id}" data-accordion="collapse" class="rounded-base border border-default overflow-hidden shadow-xs mb-6">
  <h2 id="${id}-heading-6">
    <button type="button" class="flex items-center justify-between w-full p-5 font-medium rtl:text-right text-body rounded-t-base border border-t-0 border-x-0 border-b-default hover:text-heading hover:bg-neutral-secondary-medium gap-3" data-accordion-target="#${id}-body-6" aria-expanded="true" aria-controls="${id}-body-6">
      <span>What is Flowbite?</span>
      <svg data-accordion-icon class="w-5 h-5 rotate-180 shrink-0" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m5 15 7-7 7 7"/></svg>
    </button>
  </h2>
  <div id="${id}-body-6" class="border border-s-0 border-e-0 border-t-0 border-b-default p-4 md:p-5" aria-labelledby="${id}-heading-6">
      <p class="mb-2 text-body">Flowbite is an open-source library of interactive components built on top of Tailwind CSS including buttons, dropdowns, modals, navbars, and more.</p>
      <p class="text-body mb-4">Check out this guide to learn how to <a href="https://flowbite.com/docs/getting-started/introduction/" target="_blank" rel="noopener noreferrer" class="text-fg-brand hover:underline">get started</a> and start developing websites even faster with components on top of Tailwind CSS.</p>
    <!-- Nested accordion -->
    <div id="${id}-nested" data-accordion="collapse" class="rounded-base border border-default overflow-hidden shadow-xs">
      <h2 id="${id}-nested-heading-1">
        <button type="button" class="flex items-center justify-between w-full p-5 font-medium rtl:text-right text-body rounded-t-base border border-t-0 border-x-0 border-b-default hover:text-heading hover:bg-neutral-secondary-medium gap-3" data-accordion-target="#${id}-nested-body-1" aria-expanded="true" aria-controls="${id}-nested-body-1">
          <span>What is Flowbite?</span>
          <svg data-accordion-icon class="w-5 h-5 rotate-180 shrink-0" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m5 15 7-7 7 7"/></svg>
        </button>
      </h2>
      <div id="${id}-nested-body-1" class="border border-s-0 border-e-0 border-t-0 border-b-default" aria-labelledby="${id}-nested-heading-1">
        <div class="p-4 md:p-5">
          <p class="mb-2 text-body">Flowbite is an open-source library of interactive components built on top of Tailwind CSS including buttons, dropdowns, modals, navbars, and more.</p>
          <p class="text-body">Check out this guide to learn how to <a href="https://flowbite.com/docs/getting-started/introduction/" target="_blank" rel="noopener noreferrer" class="text-fg-brand hover:underline">get started</a> and start developing websites even faster with components on top of Tailwind CSS.</p>
        </div>
      </div>
      <h2 id="${id}-nested-heading-2">
        <button type="button" class="flex items-center justify-between w-full p-5 font-medium rtl:text-right text-body border border-x-0 border-b-default border-t-0 bg-neutral-primary-soft hover:text-heading hover:bg-neutral-secondary-medium gap-3" data-accordion-target="#${id}-nested-body-2" aria-expanded="false" aria-controls="${id}-nested-body-2">
          <span>Is there a Figma file available?</span>
          <svg data-accordion-icon class="w-5 h-5 shrink-0" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m5 15 7-7 7 7"/></svg>
        </button>
      </h2>
      <div id="${id}-nested-body-2" class="hidden border border-s-0 border-e-0 border-t-0 border-b-default" aria-labelledby="${id}-nested-heading-2">
        <div class="p-4 md:p-5">
          <p class="mb-2 text-body">Flowbite is first conceptualized and designed using the Figma software so everything you see in the library has a design equivalent in our Figma file.</p>
          <p class="text-body">Check out the <a href="https://flowbite.com/figma/" target="_blank" rel="noopener noreferrer" class="text-fg-brand hover:underline">Figma design system</a> based on the utility classes from Tailwind CSS and components from Flowbite.</p>
        </div>
      </div>
      <h2 id="${id}-nested-heading-3">
        <button type="button" class="flex items-center justify-between w-full p-5 font-medium rtl:text-right text-body bg-neutral-primary-soft hover:text-heading hover:bg-neutral-secondary-medium gap-3" data-accordion-target="#${id}-nested-body-3" aria-expanded="false" aria-controls="${id}-nested-body-3">
          <span>What are the differences between Flowbite and Tailwind UI?</span>
          <svg data-accordion-icon class="w-5 h-5 shrink-0" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m5 15 7-7 7 7"/></svg>
        </button>
      </h2>
      <div id="${id}-nested-body-3" class="hidden" aria-labelledby="${id}-nested-heading-3">
        <div class="p-4 md:p-5 border border-t-default border-b-0 border-x-0">
          <p class="mb-2 text-body">The main difference is that the core components from Flowbite are open source under the MIT license, whereas Tailwind UI is a paid product. Another difference is that Flowbite relies on smaller and standalone components, whereas Tailwind UI offers sections of pages.</p>
          <p class="mb-2 text-body">However, we actually recommend using both Flowbite, Flowbite Pro, and even Tailwind UI as there is no technical reason stopping you from using the best of two worlds.</p>
          <p class="mb-2 text-body">Learn more about these technologies:</p>
          <ul class="text-body ps-5 list-disc">
            <li><a href="https://flowbite.com/pro/" target="_blank" rel="noopener noreferrer" class="text-fg-brand hover:underline">Flowbite Pro</a></li>
            <li><a href="https://tailwindui.com/" target="_blank" rel="nofollow noopener noreferrer" class="text-fg-brand hover:underline">Tailwind UI</a></li>
          </ul>
        </div>
      </div>
    </div>
    <!-- End of Nested accordion -->
  </div>
  <h2 id="${id}-heading-7">
    <button type="button" class="flex items-center justify-between w-full p-5 font-medium rtl:text-right text-body bg-neutral-primary-soft hover:text-heading hover:bg-neutral-secondary-medium gap-3" data-accordion-target="#${id}-body-7" aria-expanded="false" aria-controls="${id}-body-7">
      <span>What are the differences between Flowbite and Tailwind UI?</span>
      <svg data-accordion-icon class="w-5 h-5 shrink-0" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m5 15 7-7 7 7"/></svg>
    </button>
  </h2>
  <div id="${id}-body-7" class="hidden" aria-labelledby="${id}-heading-7">
    <div class="p-4 md:p-5 border border-t-default border-b-0 border-x-0">
      <p class="mb-2 text-body">The main difference is that the core components from Flowbite are open source under the MIT license, whereas Tailwind UI is a paid product. Another difference is that Flowbite relies on smaller and standalone components, whereas Tailwind UI offers sections of pages.</p>
      <p class="mb-2 text-body">However, we actually recommend using both Flowbite, Flowbite Pro, and even Tailwind UI as there is no technical reason stopping you from using the best of two worlds.</p>
      <p class="mb-2 text-body">Learn more about these technologies:</p>
      <ul class="text-body list-disc ps-5">
        <li><a href="https://flowbite.com/pro/" target="_blank" rel="noopener noreferrer" class="text-fg-brand hover:underline">Flowbite Pro</a></li>
        <li><a href="https://tailwindui.com/" target="_blank" rel="nofollow noopener noreferrer" class="text-fg-brand hover:underline">Tailwind UI</a></li>
      </ul>
    </div>
  </div>
</div>
  `;
}

// ─── Flowbite Alerts & Dismiss Class ─────────────────────────────────────────

/**
 * Flowbite Dismiss class per official JavaScript specification.
 * Hides target elements with Tailwind transitions and fires onHide callback.
 */
export class Dismiss {
  /**
   * @param {HTMLElement|string} targetEl - Element to be dismissed
   * @param {HTMLElement|string} [triggerEl=null] - Trigger element that initiates dismiss on click
   * @param {Object} [options={}] - { transition, duration, timing, onHide }
   * @param {Object} [instanceOptions={}] - { id, override }
   */
  constructor(targetEl, triggerEl = null, options = {}, instanceOptions = {}) {
    this._targetEl = typeof targetEl === 'string' ? document.querySelector(targetEl) : targetEl;
    this._triggerEl = typeof triggerEl === 'string' ? document.querySelector(triggerEl) : triggerEl;
    this._options = {
      transition: 'transition-opacity',
      duration: 300,
      timing: 'ease-out',
      onHide: () => {},
      ...options,
    };
    this._instanceOptions = {
      id: this._targetEl?.id || `dismiss-${Date.now()}`,
      override: true,
      ...instanceOptions,
    };
    this._clickHandler = null;
    this._isDismissed = false;

    this.init();
  }

  init() {
    if (this._triggerEl && !this._clickHandler) {
      this._clickHandler = (e) => {
        e.preventDefault();
        this.hide();
      };
      this._triggerEl.addEventListener('click', this._clickHandler);
    }
  }

  hide() {
    if (!this._targetEl || this._isDismissed) return;

    const { transition, duration, timing } = this._options;

    // Apply Tailwind transition classes
    if (transition) this._targetEl.classList.add(transition);
    if (timing) this._targetEl.classList.add(timing);
    this._targetEl.style.transitionDuration = `${duration}ms`;

    // Start transition
    this._targetEl.classList.add('opacity-0');

    setTimeout(() => {
      this._targetEl.classList.add('hidden');
      this._isDismissed = true;

      if (typeof this._options.onHide === 'function') {
        this._options.onHide(this, this._targetEl);
      }
    }, duration);
  }

  updateOnHide(callback) {
    this._options.onHide = callback;
  }

  destroy() {
    if (this._triggerEl && this._clickHandler) {
      this._triggerEl.removeEventListener('click', this._clickHandler);
      this._clickHandler = null;
    }
  }
}

/**
 * Initializes dismissible elements.
 * Supports both:
 * 1. Flowbite attribute discovery: initDismiss(root = document)
 * 2. Legacy banner dismissal: initDismiss(bannerId, btnId)
 *
 * @param {HTMLElement|Document|string} [rootOrBannerId=document]
 * @param {string} [btnId]
 * @returns {Array<Dismiss>|Dismiss|null}
 */
export function initDismiss(rootOrBannerId = document, btnId) {
  if (typeof rootOrBannerId === 'string' && btnId) {
    const banner = document.getElementById(rootOrBannerId);
    const btn    = document.getElementById(btnId);
    if (!banner || !btn) return null;
    return new Dismiss(banner, btn);
  }

  const root = (typeof rootOrBannerId === 'object' && rootOrBannerId) ? rootOrBannerId : document;
  const triggerEls = Array.from(root.querySelectorAll('[data-dismiss-target]'));
  const instances = [];

  triggerEls.forEach((trigger) => {
    if (trigger.dataset.fbDismissBound) return;
    trigger.dataset.fbDismissBound = 'true';

    const targetSelector = trigger.getAttribute('data-dismiss-target');
    const targetEl = targetSelector ? (root.querySelector(targetSelector) || document.querySelector(targetSelector)) : null;

    if (targetEl) {
      const dismissInstance = new Dismiss(targetEl, trigger);
      instances.push(dismissInstance);
    }
  });

  return instances;
}

/**
 * Renders the official Flowbite dismissible alerts with additional content.
 * Covers Info, Danger, Success, Warning, and Default variants.
 * @returns {string} HTML string
 */
export function renderFlowbiteAdditionalContentAlerts() {
  return `
<div id="alert-additional-content-1" class="p-4 mb-4 text-sm text-fg-brand-strong rounded-base bg-brand-softer border border-brand-subtle" role="alert">
  <div class="flex items-center justify-between">
    <div class="flex items-center">
      <svg class="w-4 h-4 shrink-0 me-2" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 11h2v5m-2 0h4m-2.592-8.5h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
      <span class="sr-only">Info</span>
      <h3 class="font-medium">This is a info alert</h3>
    </div>
    <button type="button" data-dismiss-target="#alert-additional-content-1" aria-label="Close" class="ms-auto -mx-1.5 -my-1.5 rounded focus:ring-2 focus:ring-brand-medium hover:bg-brand-soft inline-flex items-center justify-center h-8 w-8 shrink-0">
      <span class="sr-only">Close</span>
      <svg class="w-4 h-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 17.94 6M18 18 6.06 6"/></svg>
    </button>
  </div>
  <div class="mt-2 mb-4 text-body">
    More info about this info alert goes here. This example text is going to run a bit longer so that you can see how spacing within an alert works with this kind of content.
  </div>
  <button type="button" class="inline-flex items-center text-white bg-brand hover:bg-brand-strong box-border border border-transparent focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-xs px-3 py-1.5 focus:outline-none">
  <svg class="w-3.5 h-3.5 me-1.5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-width="2" d="M21 12c0 1.2-4.03 6-9 6s-9-4.8-9-6c0-1.2 4.03-6 9-6s9 4.8 9 6Z"/><path stroke="currentColor" stroke-width="2" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg>
  View more
  </button>
</div>

<div id="alert-additional-content-2" class="p-4 mb-4 text-sm text-fg-danger-strong rounded-base bg-danger-soft border border-danger-subtle" role="alert">
  <div class="flex items-center justify-between">
    <div class="flex items-center">
      <svg class="w-4 h-4 shrink-0 me-2" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 11h2v5m-2 0h4m-2.592-8.5h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
      <span class="sr-only">Info</span>
      <h3 class="font-medium">This is a danger alert</h3>
    </div>
    <button type="button" data-dismiss-target="#alert-additional-content-2" aria-label="Close" class="ms-auto -mx-1.5 -my-1.5 bg-danger-soft text-fg-danger-strong rounded focus:ring-2 focus:ring-danger-medium p-1.5 hover:bg-danger-medium inline-flex items-center justify-center h-8 w-8 shrink-0">
      <span class="sr-only">Close</span>
      <svg class="w-4 h-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 17.94 6M18 18 6.06 6"/></svg>
    </button>
  </div>
  <div class="mt-2 mb-4 text-body">
    More info about this info alert goes here. This example text is going to run a bit longer so that you can see how spacing within an alert works with this kind of content.
  </div>
  <button type="button" class="inline-flex items-center text-white bg-danger box-border border border-transparent hover:bg-danger-strong focus:ring-4 focus:ring-danger-medium shadow-xs font-medium leading-5 rounded-base text-xs px-3 py-1.5 focus:outline-none">
  <svg class="w-3.5 h-3.5 me-1.5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-width="2" d="M21 12c0 1.2-4.03 6-9 6s-9-4.8-9-6c0-1.2 4.03-6 9-6s9 4.8 9 6Z"/><path stroke="currentColor" stroke-width="2" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg>
  View more
  </button>
</div>

<div id="alert-additional-content-3" class="p-4 mb-4 text-sm text-fg-success-strong rounded-base bg-success-soft border border-success-subtle" role="alert">
  <div class="flex items-center justify-between">
    <div class="flex items-center">
      <svg class="w-4 h-4 shrink-0 me-2" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 11h2v5m-2 0h4m-2.592-8.5h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
      <span class="sr-only">Info</span>
      <h3 class="font-medium">This is a success alert</h3>
    </div>
    <button type="button" data-dismiss-target="#alert-additional-content-3" aria-label="Close" class="ms-auto -mx-1.5 -my-1.5 bg-success-soft text-fg-success-strong rounded focus:ring-2 focus:ring-success-medium p-1.5 hover:bg-success-medium inline-flex items-center justify-center h-8 w-8 shrink-0">
      <span class="sr-only">Close</span>
      <svg class="w-4 h-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 17.94 6M18 18 6.06 6"/></svg>
    </button>
  </div>
  <div class="mt-2 mb-4 text-body">
    More info about this info alert goes here. This example text is going to run a bit longer so that you can see how spacing within an alert works with this kind of content.
  </div>
  <button type="button" class="inline-flex items-center text-white bg-success box-border border border-transparent hover:bg-success-strong focus:ring-4 focus:ring-success-medium shadow-xs font-medium leading-5 rounded-base text-xs px-3 py-1.5 focus:outline-none">
  <svg class="w-3.5 h-3.5 me-1.5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-width="2" d="M21 12c0 1.2-4.03 6-9 6s-9-4.8-9-6c0-1.2 4.03-6 9-6s9 4.8 9 6Z"/><path stroke="currentColor" stroke-width="2" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg>
  View more
  </button>
</div>

<div id="alert-additional-content-4" class="p-4 mb-4 text-sm text-fg-warning rounded-base bg-warning-soft border border-warning-subtle" role="alert">
  <div class="flex items-center justify-between">
    <div class="flex items-center">
      <svg class="w-4 h-4 shrink-0 me-2" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 11h2v5m-2 0h4m-2.592-8.5h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
      <span class="sr-only">Info</span>
      <h3 class="font-medium">This is a warning alert</h3>
    </div>
    <button type="button" data-dismiss-target="#alert-additional-content-4" aria-label="Close" class="ms-auto -mx-1.5 -my-1.5 bg-warning-soft text-fg-warning-strong rounded focus:ring-2 focus:ring-warning-medium p-1.5 hover:bg-warning-medium inline-flex items-center justify-center h-8 w-8 shrink-0">
      <span class="sr-only">Close</span>
      <svg class="w-4 h-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 17.94 6M18 18 6.06 6"/></svg>
    </button>
  </div>
  <div class="mt-2 mb-4 text-body">
    More info about this info alert goes here. This example text is going to run a bit longer so that you can see how spacing within an alert works with this kind of content.
  </div>
  <button type="button" class="inline-flex items-center text-white bg-warning box-border border border-transparent hover:bg-warning-strong focus:ring-4 focus:ring-warning-medium shadow-xs font-medium leading-5 rounded-base text-xs px-3 py-1.5 focus:outline-none">
  <svg class="w-3.5 h-3.5 me-1.5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-width="2" d="M21 12c0 1.2-4.03 6-9 6s-9-4.8-9-6c0-1.2 4.03-6 9-6s9 4.8 9 6Z"/><path stroke="currentColor" stroke-width="2" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg>
  View more
  </button>
</div>

<div id="alert-additional-content-5" class="p-4 text-sm text-heading rounded-base bg-neutral-secondary-medium border border-default-medium" role="alert">
  <div class="flex items-center justify-between">
    <div class="flex items-center">
      <svg class="w-4 h-4 shrink-0 me-2" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 11h2v5m-2 0h4m-2.592-8.5h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
      <span class="sr-only">Info</span>
      <h3 class="font-medium">This is a default alert</h3>
    </div>
    <button type="button" data-dismiss-target="#alert-additional-content-5" aria-label="Close" class="ms-auto -mx-1.5 -my-1.5 rounded focus:ring-2 focus:ring-neutral-tertiary p-1.5 hover:bg-neutral-tertiary-medium inline-flex items-center justify-center h-8 w-8 shrink-0">
      <span class="sr-only">Close</span>
      <svg class="w-4 h-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 17.94 6M18 18 6.06 6"/></svg>
    </button>
  </div>
  <div class="mt-2 mb-4 text-body">
    More info about this info alert goes here. This example text is going to run a bit longer so that you can see how spacing within an alert works with this kind of content.
  </div>
  <button type="button" class="inline-flex items-center text-white bg-dark-soft box-border border border-transparent hover:bg-dark-strong focus:ring-4 focus:ring-neutral-tertiary shadow-xs font-medium leading-5 rounded-base text-xs px-3 py-1.5 focus:outline-none">
  <svg class="w-3.5 h-3.5 me-1.5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-width="2" d="M21 12c0 1.2-4.03 6-9 6s-9-4.8-9-6c0-1.2 4.03-6 9-6s9 4.8 9 6Z"/><path stroke="currentColor" stroke-width="2" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg>
  View more
  </button>
</div>
  `;
}

// ─── Flowbite Avatar & Dropdown / Tooltip Components ──────────────────────────

/**
 * Initializes tooltips triggered by [data-tooltip-target].
 * @param {HTMLElement|Document} [root=document]
 */
export function initTooltips(root = document) {
  const triggers = Array.from(root.querySelectorAll('[data-tooltip-target]'));
  triggers.forEach((trigger) => {
    if (trigger.dataset.fbTooltipBound) return;
    trigger.dataset.fbTooltipBound = 'true';

    const targetId = trigger.getAttribute('data-tooltip-target');
    const tooltipEl = document.getElementById(targetId);
    if (!tooltipEl) return;

    function showTooltip() {
      tooltipEl.classList.remove('invisible', 'opacity-0');
      tooltipEl.classList.add('opacity-100');
    }

    function hideTooltip() {
      tooltipEl.classList.remove('opacity-100');
      tooltipEl.classList.add('invisible', 'opacity-0');
    }

    trigger.addEventListener('mouseenter', showTooltip);
    trigger.addEventListener('mouseleave', hideTooltip);
    trigger.addEventListener('focus', showTooltip);
    trigger.addEventListener('blur', hideTooltip);
  });
}

/**
 * Flowbite Dropdown Class
 *
 * Implements the official Flowbite Dropdown specification:
 * - Parameters: targetElement, triggerElement, options, instanceOptions
 * - Options: placement (top|right|bottom|left|*-start|*-end), triggerType (click|hover|none),
 *   offsetDistance, offsetSkidding, delay, ignoreClickOutsideClass, onHide, onShow, onToggle
 * - Methods: show(), hide(), toggle(), isVisible(), updateOnShow(), updateOnHide(), updateOnToggle(), destroy()
 */
export class Dropdown {
  /**
   * @param {HTMLElement} targetElement
   * @param {HTMLElement} triggerElement
   * @param {Object} [options={}]
   * @param {Object} [instanceOptions={}]
   */
  constructor(targetElement, triggerElement, options = {}, instanceOptions = {}) {
    this._targetEl = targetElement;
    this._triggerEl = triggerElement;
    this._options = {
      placement: options.placement || 'bottom',
      triggerType: options.triggerType || 'click',
      offsetDistance: options.offsetDistance !== undefined ? Number(options.offsetDistance) : 10,
      offsetSkidding: options.offsetSkidding !== undefined ? Number(options.offsetSkidding) : 0,
      delay: options.delay !== undefined ? Number(options.delay) : 300,
      ignoreClickOutsideClass: options.ignoreClickOutsideClass || false,
      onHide: options.onHide || (() => {}),
      onShow: options.onShow || (() => {}),
      onToggle: options.onToggle || (() => {}),
    };
    this._instanceOptions = {
      id: instanceOptions.id || (targetElement ? targetElement.id : 'dropdown-' + Math.random().toString(36).substr(2, 9)),
      override: instanceOptions.override !== undefined ? instanceOptions.override : true,
      ...instanceOptions,
    };
    this._visible = this._targetEl ? !this._targetEl.classList.contains('hidden') : false;
    this._hoverShowTimer = null;
    this._hoverHideTimer = null;

    if (this._targetEl) {
      this._targetEl._fbDropdownInstance = this;
    }
    if (this._triggerEl) {
      this._triggerEl._fbDropdownInstance = this;
    }

    this._init();
  }

  static getInstance(id) {
    if (typeof document === 'undefined') return null;
    const el = document.getElementById(id);
    return el ? el._fbDropdownInstance || null : null;
  }

  _init() {
    if (!this._targetEl || !this._triggerEl) return;

    if (this._options.triggerType === 'click') {
      this._clickHandler = (e) => {
        e.stopPropagation();
        this.toggle();
      };
      this._triggerEl.addEventListener('click', this._clickHandler);
    } else if (this._options.triggerType === 'hover') {
      this._triggerEnterHandler = () => {
        if (this._hoverHideTimer) {
          clearTimeout(this._hoverHideTimer);
          this._hoverHideTimer = null;
        }
        if (!this._visible) {
          this._hoverShowTimer = setTimeout(() => {
            this.show();
          }, this._options.delay);
        }
      };
      this._triggerLeaveHandler = () => {
        if (this._hoverShowTimer) {
          clearTimeout(this._hoverShowTimer);
          this._hoverShowTimer = null;
        }
        if (this._visible) {
          this._hoverHideTimer = setTimeout(() => {
            this.hide();
          }, this._options.delay);
        }
      };

      this._triggerEl.addEventListener('mouseenter', this._triggerEnterHandler);
      this._triggerEl.addEventListener('mouseleave', this._triggerLeaveHandler);
      this._targetEl.addEventListener('mouseenter', this._triggerEnterHandler);
      this._targetEl.addEventListener('mouseleave', this._triggerLeaveHandler);
    }

    // Global document click listener for click-outside
    this._clickOutsideHandler = (e) => {
      if (!this._visible || !this._targetEl || !this._triggerEl) return;

      // Click inside target or trigger?
      if (this._targetEl.contains(e.target) || this._triggerEl.contains(e.target)) {
        return;
      }

      // Check ignoreClickOutsideClass
      if (this._options.ignoreClickOutsideClass) {
        const cls = String(this._options.ignoreClickOutsideClass).replace(/^\./, '');
        if (e.target.classList && e.target.classList.contains(cls)) return;
        if (e.target.closest && (e.target.closest(`.${cls}`) || (cls === 'datepicker' && e.target.closest('.flowbite-datepicker-popover')))) {
          return;
        }
      }

      // If click was inside a child/nested dropdown
      const childDropdowns = Array.from(document.querySelectorAll('[data-popper-placement], [id$="Dropdown"], [id*="-dropdown"]'))
        .filter((el) => el._fbDropdownInstance && el._fbDropdownInstance.isVisible());
      const isInsideDescendant = childDropdowns.some((el) => {
        const inst = el._fbDropdownInstance;
        if (inst && inst._triggerEl && this._targetEl.contains(inst._triggerEl)) {
          return el.contains(e.target) || inst._triggerEl.contains(e.target);
        }
        return false;
      });
      if (isInsideDescendant) return;

      this.hide();
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('click', this._clickOutsideHandler);
    }
  }

  position() {
    if (!this._targetEl || !this._triggerEl) return;
    const placement = this._options.placement || 'bottom';
    const offsetDistance = Number(this._options.offsetDistance) || 10;
    const offsetSkidding = Number(this._options.offsetSkidding) || 0;

    this._targetEl.setAttribute('data-popper-placement', placement);
    this._targetEl.style.position = 'absolute';
    this._targetEl.style.margin = '0px';

    if (typeof window === 'undefined' || !this._triggerEl.getBoundingClientRect) return;

    const triggerRect = this._triggerEl.getBoundingClientRect();
    const targetRect = this._targetEl.getBoundingClientRect();
    const targetWidth = targetRect.width || 176;
    const targetHeight = targetRect.height || 160;

    const offsetParent = this._targetEl.offsetParent || document.body;
    const isBody = !offsetParent || offsetParent === document.body || offsetParent === document.documentElement;
    const parentRect = isBody ? { top: 0, left: 0 } : offsetParent.getBoundingClientRect();
    const scrollY = isBody ? (window.pageYOffset || document.documentElement.scrollTop || 0) : offsetParent.scrollTop;
    const scrollX = isBody ? (window.pageXOffset || document.documentElement.scrollLeft || 0) : offsetParent.scrollLeft;

    const refTop = triggerRect.top - parentRect.top + scrollY;
    const refBottom = triggerRect.bottom - parentRect.top + scrollY;
    const refLeft = triggerRect.left - parentRect.left + scrollX;
    const refRight = triggerRect.right - parentRect.left + scrollX;
    const triggerWidth = triggerRect.width || 0;
    const triggerHeight = triggerRect.height || 0;

    let top = 0;
    let left = 0;

    switch (placement) {
      case 'top':
        top = refTop - targetHeight - offsetDistance;
        left = refLeft + (triggerWidth / 2) - (targetWidth / 2) + offsetSkidding;
        break;
      case 'top-start':
        top = refTop - targetHeight - offsetDistance;
        left = refLeft + offsetSkidding;
        break;
      case 'top-end':
        top = refTop - targetHeight - offsetDistance;
        left = refRight - targetWidth + offsetSkidding;
        break;
      case 'bottom':
        top = refBottom + offsetDistance;
        left = refLeft + (triggerWidth / 2) - (targetWidth / 2) + offsetSkidding;
        break;
      case 'bottom-start':
        top = refBottom + offsetDistance;
        left = refLeft + offsetSkidding;
        break;
      case 'bottom-end':
        top = refBottom + offsetDistance;
        left = refRight - targetWidth + offsetSkidding;
        break;
      case 'right':
        top = refTop + (triggerHeight / 2) - (targetHeight / 2) + offsetSkidding;
        left = refRight + offsetDistance;
        break;
      case 'right-start':
        top = refTop + offsetSkidding;
        left = refRight + offsetDistance;
        break;
      case 'right-end':
        top = refBottom - targetHeight + offsetSkidding;
        left = refRight + offsetDistance;
        break;
      case 'left':
        top = refTop + (triggerHeight / 2) - (targetHeight / 2) + offsetSkidding;
        left = refLeft - targetWidth - offsetDistance;
        break;
      case 'left-start':
        top = refTop + offsetSkidding;
        left = refLeft - targetWidth - offsetDistance;
        break;
      case 'left-end':
        top = refBottom - targetHeight + offsetSkidding;
        left = refLeft - targetWidth - offsetDistance;
        break;
      default:
        top = refBottom + offsetDistance;
        left = refLeft + offsetSkidding;
        break;
    }

    this._targetEl.style.top = `${Math.round(top)}px`;
    this._targetEl.style.left = `${Math.round(left)}px`;
  }

  show() {
    if (!this._targetEl) return;
    this._targetEl.classList.remove('hidden');
    if (this._triggerEl) {
      this._triggerEl.setAttribute('aria-expanded', 'true');
    }
    this._visible = true;
    this.position();
    if (typeof this._options.onShow === 'function') {
      this._options.onShow(this);
    }
  }

  hide() {
    if (!this._targetEl) return;
    this._targetEl.classList.add('hidden');
    if (this._triggerEl) {
      this._triggerEl.setAttribute('aria-expanded', 'false');
    }
    this._visible = false;
    if (typeof this._options.onHide === 'function') {
      this._options.onHide(this);
    }
  }

  toggle() {
    if (this.isVisible()) {
      this.hide();
    } else {
      this.show();
    }
    if (typeof this._options.onToggle === 'function') {
      this._options.onToggle(this);
    }
  }

  isVisible() {
    return this._visible;
  }

  updateOnShow(callback) {
    this._options.onShow = callback;
  }

  updateOnHide(callback) {
    this._options.onHide = callback;
  }

  updateOnToggle(callback) {
    this._options.onToggle = callback;
  }

  destroy() {
    if (this._visible) {
      this.hide();
    }
    if (this._triggerEl) {
      if (this._clickHandler) {
        this._triggerEl.removeEventListener('click', this._clickHandler);
      }
      if (this._triggerEnterHandler) {
        this._triggerEl.removeEventListener('mouseenter', this._triggerEnterHandler);
        this._triggerEl.removeEventListener('mouseleave', this._triggerLeaveHandler);
      }
      delete this._triggerEl._fbDropdownInstance;
    }
    if (this._targetEl) {
      if (this._triggerEnterHandler) {
        this._targetEl.removeEventListener('mouseenter', this._triggerEnterHandler);
        this._targetEl.removeEventListener('mouseleave', this._triggerLeaveHandler);
      }
      delete this._targetEl._fbDropdownInstance;
    }
    if (this._clickOutsideHandler && typeof document !== 'undefined') {
      document.removeEventListener('click', this._clickOutsideHandler);
    }
  }
}

/**
 * Initializes all Flowbite dropdowns triggered by [data-dropdown-toggle].
 * Supports data attributes:
 * - data-dropdown-toggle="id"
 * - data-dropdown-trigger="click|hover|none"
 * - data-dropdown-placement="top|right|bottom|left|..."
 * - data-dropdown-offset-distance="pixels"
 * - data-dropdown-offset-skidding="pixels"
 * - data-dropdown-ignore-click-outside-class="class"
 * - data-dropdown-delay="milliseconds"
 *
 * @param {HTMLElement|Document} [root=document]
 */
export function initDropdowns(root = document) {
  if (typeof document === 'undefined' || !root || !root.querySelectorAll) return;

  const triggers = Array.from(root.querySelectorAll('[data-dropdown-toggle]'));
  triggers.forEach((trigger) => {
    if (trigger.dataset.fbDropdownBound) return;
    trigger.dataset.fbDropdownBound = 'true';

    const targetId = trigger.getAttribute('data-dropdown-toggle');
    const targetEl = root.getElementById ? root.getElementById(targetId) : document.getElementById(targetId);
    if (!targetEl) return;

    const placement = trigger.getAttribute('data-dropdown-placement') || 'bottom';
    const triggerType = trigger.getAttribute('data-dropdown-trigger') || 'click';
    const offsetDistance = trigger.getAttribute('data-dropdown-offset-distance');
    const offsetSkidding = trigger.getAttribute('data-dropdown-offset-skidding');
    const ignoreClickOutsideClass = trigger.getAttribute('data-dropdown-ignore-click-outside-class') || false;
    const delay = trigger.getAttribute('data-dropdown-delay');

    const options = {
      placement,
      triggerType,
      ignoreClickOutsideClass,
    };
    if (offsetDistance !== null && offsetDistance !== undefined) {
      options.offsetDistance = Number(offsetDistance);
    }
    if (offsetSkidding !== null && offsetSkidding !== undefined) {
      options.offsetSkidding = Number(offsetSkidding);
    }
    if (delay !== null && delay !== undefined) {
      options.delay = Number(delay);
    }

    new Dropdown(targetEl, trigger, options, { id: targetId, override: true });

    // Wire live search filter if dropdown has search input
    const searchInput = targetEl.querySelector('input#search, input[type="text"][placeholder*="Search"]');
    if (searchInput && !searchInput.dataset.fbSearchBound) {
      searchInput.dataset.fbSearchBound = 'true';
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const listItems = targetEl.querySelectorAll('ul > li');
        listItems.forEach((li) => {
          const text = li.textContent.toLowerCase();
          if (!query || text.includes(query)) {
            li.style.display = '';
          } else {
            li.style.display = 'none';
          }
        });
      });
    }
  });

  // Global ESC key listener to dismiss open dropdowns
  if (!document._fbDropdownEscBound) {
    document._fbDropdownEscBound = true;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const openDropdowns = Array.from(document.querySelectorAll('[data-popper-placement], [id$="Dropdown"], [id*="-dropdown"], [id^="dropdown"]'))
          .filter((el) => el._fbDropdownInstance && el._fbDropdownInstance.isVisible());
        openDropdowns.forEach((el) => el._fbDropdownInstance.hide());
      }
    });
  }
}

/**
 * Renders the official Flowbite Avatar showcase with multiple styles, sizes, tooltips,
 * profile text, and user dropdown menu.
 * @returns {string} HTML string
 */
export function renderFlowbiteAvatarShowcase() {
  return `
<div class="flowbite-avatar-showcase space-y-6">
  <!-- Avatar Styles -->
  <div class="flex items-center gap-4">
    <img class="w-10 h-10 rounded-full" src="/src/assets/zamorin-app-icon-1024.png" alt="Rounded avatar">
    <img class="w-10 h-10 rounded-base" src="/src/assets/zamorin-app-icon-1024.png" alt="Default avatar">
  </div>

  <!-- Avatar Sizes -->
  <div class="flex items-end gap-3 flex-wrap">
    <img class="w-4.5 h-4.5 rounded-sm" src="/src/assets/zamorin-app-icon-1024.png" alt="Extra small avatar">
    <img class="w-6 h-6 rounded-sm" src="/src/assets/zamorin-app-icon-1024.png" alt="Small avatar">
    <img class="w-8 h-8 rounded-base" src="/src/assets/zamorin-app-icon-1024.png" alt="Base avatar">
    <img class="w-10 h-10 rounded-base" src="/src/assets/zamorin-app-icon-1024.png" alt="Medium avatar">
    <img class="w-11 h-11 rounded-base" src="/src/assets/zamorin-app-icon-1024.png" alt="Large avatar">
    <img class="w-14 h-14 rounded-base" src="/src/assets/zamorin-app-icon-1024.png" alt="xl avatar">
    <img class="w-16 h-16 rounded-base" src="/src/assets/zamorin-app-icon-1024.png" alt="2xl avatar">
  </div>

  <!-- Avatar Tooltips -->
  <div class="flex items-center gap-4">
    <div style="position:relative; display:inline-block;">
      <div id="tooltip-jese" role="tooltip" class="absolute z-10 invisible inline-block px-3 py-2 text-sm font-medium text-white transition-opacity duration-300 bg-dark rounded-base shadow-xs opacity-0 tooltip" style="bottom:calc(100% + 8px); left:50%; transform:translateX(-50%); white-space:nowrap;">
          Jese Leos
          <div class="tooltip-arrow" data-popper-arrow></div>
      </div>
      <img data-tooltip-target="tooltip-jese" class="w-10 h-10 rounded-base cursor-pointer" src="/src/assets/zamorin-app-icon-1024.png" alt="Medium avatar">
    </div>

    <div style="position:relative; display:inline-block;">
      <div id="tooltip-roberta" role="tooltip" class="absolute z-10 invisible inline-block px-3 py-2 text-sm font-medium text-white transition-opacity duration-300 bg-dark rounded-base shadow-xs opacity-0 tooltip" style="bottom:calc(100% + 8px); left:50%; transform:translateX(-50%); white-space:nowrap;">
          Roberta Casas
          <div class="tooltip-arrow" data-popper-arrow></div>
      </div>
      <img data-tooltip-target="tooltip-roberta" class="w-10 h-10 rounded-base cursor-pointer" src="/src/assets/zamorin-app-icon-1024.png" alt="Medium avatar">
    </div>

    <div style="position:relative; display:inline-block;">
      <div id="tooltip-bonnie" role="tooltip" class="absolute z-10 invisible inline-block px-3 py-2 text-sm font-medium text-white transition-opacity duration-300 bg-dark rounded-base shadow-xs opacity-0 tooltip" style="bottom:calc(100% + 8px); left:50%; transform:translateX(-50%); white-space:nowrap;">
          Bonnie Green
          <div class="tooltip-arrow" data-popper-arrow></div>
      </div>
      <img data-tooltip-target="tooltip-bonnie" class="w-10 h-10 rounded-base cursor-pointer" src="/src/assets/zamorin-app-icon-1024.png" alt="Medium avatar">
    </div>
  </div>

  <!-- Avatar Text -->
  <div class="flex items-center gap-2.5">
      <img class="w-10 h-10 rounded-full" src="/src/assets/zamorin-app-icon-1024.png" alt="">
      <div class="font-medium text-heading">
          <div>Jese Leos</div>
          <div class="text-sm font-normal text-body">Joined in August 2014</div>
      </div>
  </div>

  <!-- User Dropdown -->
  <div style="position:relative; display:inline-block;">
    <img id="avatarButton" type="button" data-dropdown-toggle="userDropdown" data-dropdown-placement="bottom-start" class="w-10 h-10 rounded-full cursor-pointer" src="/src/assets/zamorin-app-icon-1024.png" alt="User dropdown">

    <!-- Dropdown menu -->
    <div id="userDropdown" class="z-10 hidden bg-neutral-primary-medium border border-default-medium rounded-base shadow-lg w-44" style="position:absolute; top:calc(100% + 6px); left:0;">
        <div class="px-4 py-3 border-b border-default-medium text-sm text-heading">
          <div class="font-medium">Bonnie Green</div>
          <div class="truncate text-xs text-body">name@flowbite.com</div>
        </div>
        <ul class="p-2 text-sm text-body font-medium" aria-labelledby="avatarButton">
          <li>
            <a href="#dashboard" class="block w-full p-2 hover:bg-neutral-tertiary-medium hover:text-heading rounded-md">Dashboard</a>
          </li>
          <li>
            <a href="#settings" class="block w-full p-2 hover:bg-neutral-tertiary-medium hover:text-heading rounded-md">Settings</a>
          </li>
          <li>
            <a href="#sales-cash" class="block w-full p-2 hover:bg-neutral-tertiary-medium hover:text-heading rounded-md">Earnings</a>
          </li>
          <li>
            <a href="#logout" class="block w-full p-2 hover:bg-neutral-tertiary-medium text-fg-danger rounded-md">Sign out</a>
          </li>
        </ul>
    </div>
  </div>
</div>
  `;
}

// ─── Flowbite Badges ──────────────────────────────────────────────────────────
const BADGE_CLOCK_SVG_SM = `<svg class="w-3 h-3 me-1" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>`;
const BADGE_CLOCK_SVG_LG = `<svg class="w-3.5 h-3.5 me-1.5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>`;
const BADGE_CLOSE_SVG = `<svg class="w-3 h-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 17.94 6M18 18 6.06 6"/></svg>`;

const BADGE_VARIANTS = {
  brand: {
    name: 'Brand',
    largeBorderedRing: 'ring-brand-subtle',
    largeBorderedFg: 'text-fg-brand-strong',
    largeBorderedBg: 'bg-brand-softer',
    standard: 'bg-brand-softer border border-brand-subtle text-fg-brand-strong',
    hoverBg: 'hover:bg-brand-soft',
    loaderText: 'text-fg-brand',
    loaderFill: '#1C64F2',
  },
  alternative: {
    name: 'Alternative',
    largeBorderedRing: 'ring-default',
    largeBorderedFg: 'text-heading',
    largeBorderedBg: 'bg-neutral-primary-soft',
    standard: 'bg-neutral-primary-soft border border-default text-heading',
    hoverBg: 'hover:bg-neutral-tertiary',
    loaderText: 'text-neutral-tertiary',
    loaderFill: '#6A7282',
  },
  gray: {
    name: 'Gray',
    largeBorderedRing: 'ring-default-medium',
    largeBorderedFg: 'text-heading',
    largeBorderedBg: 'bg-neutral-secondary-medium',
    standard: 'bg-neutral-secondary-medium border border-default-medium text-heading',
    hoverBg: 'hover:bg-neutral-quaternary',
    loaderText: 'text-neutral-quaternary',
    loaderFill: '#6A7282',
  },
  danger: {
    name: 'Danger',
    largeBorderedRing: 'ring-danger-subtle',
    largeBorderedFg: 'text-fg-danger-strong',
    largeBorderedBg: 'bg-danger-soft',
    standard: 'bg-danger-soft border border-danger-subtle text-fg-danger-strong',
    hoverBg: 'hover:bg-danger-medium',
    loaderText: 'text-danger-medium',
    loaderFill: '#C70036',
  },
  success: {
    name: 'Success',
    largeBorderedRing: 'ring-success-subtle',
    largeBorderedFg: 'text-fg-success-strong',
    largeBorderedBg: 'bg-success-soft',
    standard: 'bg-success-soft border border-success-subtle text-fg-success-strong',
    hoverBg: 'hover:bg-success-medium',
    loaderText: 'text-success-medium',
    loaderFill: '#009966',
  },
  warning: {
    name: 'Warning',
    largeBorderedRing: 'ring-warning-subtle',
    largeBorderedFg: 'text-fg-warning',
    largeBorderedBg: 'bg-warning-soft',
    standard: 'bg-warning-soft border border-warning-subtle text-fg-warning',
    hoverBg: 'hover:bg-warning-medium',
    loaderText: 'text-warning-medium',
    loaderFill: '#D03801',
  },
};

function getBadgeLoaderSvg(textColor, fillHex) {
  return `<svg aria-hidden="true" role="status" class="w-3 h-3 me-1 animate-spin ${textColor}" viewBox="0 0 100 101" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z" fill="currentColor"/><path d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z" fill="${fillHex}"/></svg>`;
}

/**
 * Generates an accessible Flowbite badge component string according to Flowbite guidelines.
 *
 * @param {Object} options
 * @param {string} [options.variant='brand']  - 'brand'|'alternative'|'gray'|'danger'|'success'|'warning'
 * @param {string} [options.label='']         - Badge label text
 * @param {string} [options.size='sm']        - 'sm'|'lg'
 * @param {boolean} [options.bordered=false]  - Use ring-1 ring-inset bordered styling
 * @param {string} [options.icon]             - 'clock'|'loader'|custom SVG string
 * @param {boolean} [options.dismissible=false] - If true, renders close button with [data-dismiss-target]
 * @param {string} [options.id]               - Explicit element ID (needed for dismissible target)
 * @param {string} [options.avatar]           - Image src url if chip with avatar
 * @param {boolean} [options.loader=false]    - If true, renders animated SVG spinner
 * @param {boolean} [options.asButtonNotification=false] - Button with notification count badge
 * @param {boolean} [options.asButtonWithBadge=false]    - Button with inline count badge
 * @param {string|number} [options.count]     - Count value for notification / button badges
 * @returns {string}
 */
export function renderFlowbiteBadge(options = {}) {
  const {
    variant = 'brand',
    label = '',
    size = 'sm',
    bordered = false,
    icon = null,
    dismissible = false,
    id = null,
    avatar = null,
    loader = false,
    asButtonNotification = false,
    asButtonWithBadge = false,
    count = '2',
  } = options;

  if (asButtonNotification) {
    return `
<button type="button" class="relative text-white bg-brand box-border border border-transparent hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-sm p-3 focus:outline-none">
  <svg class="w-5 h-5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="m3.5 5.5 7.893 6.036a1 1 0 0 0 1.214 0L20.5 5.5M4 19h16a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1Z"/></svg>
  <span class="sr-only">${label || 'Notifications'}</span>
  <div class="absolute inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-white bg-danger border-2 border-buffer rounded-full -top-2 -end-2">${count}</div>
</button>`.trim();
  }

  if (asButtonWithBadge) {
    return `
<button type="button" class="text-white bg-brand box-border border border-transparent hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none">
${label || 'Messages'}
<span class="inline-flex items-center justify-center w-4 h-4 ms-2 text-xs font-semibold text-white bg-danger rounded-full">
${count}
</span>
</button>`.trim();
  }

  const v = BADGE_VARIANTS[variant] || BADGE_VARIANTS.brand;
  const idAttr = id ? ` id="${id}"` : '';

  // 1. Large Bordered Badges
  if (bordered && size === 'lg') {
    return `<span${idAttr} class="inline-flex items-center px-2 py-1 ring-1 ring-inset ${v.largeBorderedRing} ${v.largeBorderedFg} text-sm font-medium rounded ${v.largeBorderedBg}">${label || v.name}</span>`.trim();
  }

  // 2. Chips with Avatar (Dismissible)
  if (avatar) {
    const targetId = id || `badge-avatar-dismiss-${variant}`;
    return `
<span id="${targetId}" class="inline-flex items-center ${v.standard} text-xs font-medium ps-1.5 pe-0.5 py-0.5 rounded gap-1">
<img class="w-3.5 h-3.5 rounded-full me-1" src="${avatar}" alt="Rounded avatar">
${label || v.name}
${dismissible ? `<button type="button" class="inline-flex items-center p-0.5 text-sm bg-transparent rounded-xs ${v.hoverBg}" data-dismiss-target="#${targetId}" aria-label="Remove">
  ${BADGE_CLOSE_SVG}
  <span class="sr-only">Remove badge</span>
</button>` : ''}
</span>`.trim();
  }

  // 3. Dismissible Badges (Chips)
  if (dismissible) {
    const targetId = id || `badge-dismiss-${variant}`;
    return `
<span id="${targetId}" class="inline-flex items-center ${v.standard} text-xs font-medium ps-1.5 pe-0.5 py-0.5 rounded gap-1">
<span>${label || v.name}</span>
<button type="button" class="inline-flex items-center p-0.5 text-sm bg-transparent rounded-xs ${v.hoverBg}" data-dismiss-target="#${targetId}" aria-label="Remove">
  ${BADGE_CLOSE_SVG}
  <span class="sr-only">Remove badge</span>
</button>
</span>`.trim();
  }

  // 4. Badges with SVG Loader
  if (loader || icon === 'loader') {
    return `
<span${idAttr} class="flex items-center ${v.standard} text-xs font-medium px-1.5 py-0.5 rounded gap-1">
  ${getBadgeLoaderSvg(v.loaderText, v.loaderFill)}
  <span>${label || '2 mins ago'}</span>
</span>`.trim();
  }

  // 5. Large Badges with Icon
  if (size === 'lg' && (icon === 'clock' || icon)) {
    const iconSvg = icon === 'clock' ? BADGE_CLOCK_SVG_LG : icon;
    return `
<span${idAttr} class="inline-flex items-center ${v.standard} text-sm font-medium leading-none px-2 py-1 rounded">
${iconSvg}
${label || '2 mins ago'}
</span>`.trim();
  }

  // 6. Badges with Icon (Standard)
  if (icon === 'clock' || icon) {
    const iconSvg = icon === 'clock' ? BADGE_CLOCK_SVG_SM : icon;
    return `
<span${idAttr} class="flex items-center ${v.standard} text-xs font-medium px-1.5 py-0.5 rounded">
${iconSvg}
${label || '2 mins ago'}
</span>`.trim();
  }

  // Default Standard Badge
  return `<span${idAttr} class="inline-flex items-center ${v.standard} text-xs font-medium px-2 py-0.5 rounded">${label || v.name}</span>`.trim();
}

/**
 * Renders the complete Flowbite Badges showcase containing all 8 badge categories:
 * 1. Large bordered badges
 * 2. Badges with icon
 * 3. Large badges with icon
 * 4. Badges with SVG loader
 * 5. Dismissible badges (chips)
 * 6. Chips with avatar
 * 7. Notification badge on button
 * 8. Button with count badge
 *
 * @returns {string} HTML markup
 */
export function renderFlowbiteBadgesShowcase() {
  const avatarImg = '/src/assets/zamorin-app-icon-1024.png';

  return `
<div class="flowbite-badges-showcase space-y-6 p-4">
  <!-- 1. Large bordered badges -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Large Bordered Badges</h4>
    <div class="flex flex-wrap items-center gap-2">
      <span class="inline-flex items-center px-2 py-1 ring-1 ring-inset ring-brand-subtle text-fg-brand-strong text-sm font-medium rounded bg-brand-softer">Brand</span>
      <span class="inline-flex items-center px-2 py-1 ring-1 ring-inset ring-default text-heading text-sm font-medium rounded bg-neutral-primary-soft">Alternative</span>
      <span class="inline-flex items-center px-2 py-1 ring-1 ring-inset ring-default-medium text-heading text-sm font-medium rounded bg-neutral-secondary-medium">Gray</span>
      <span class="inline-flex items-center px-2 py-1 ring-1 ring-inset ring-danger-subtle text-fg-danger-strong text-sm font-medium rounded bg-danger-soft">Danger</span>
      <span class="inline-flex items-center px-2 py-1 ring-1 ring-inset ring-success-subtle text-fg-success-strong text-sm font-medium rounded bg-success-soft">Success</span>
      <span class="inline-flex items-center px-2 py-1 ring-1 ring-inset ring-warning-subtle text-fg-warning text-sm font-medium rounded bg-warning-soft">Warning</span>
    </div>
  </div>

  <!-- 2. Badges with icon -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Badges with Icon</h4>
    <div class="flex flex-wrap items-center gap-2">
      <span class="flex items-center bg-brand-softer border border-brand-subtle text-fg-brand-strong text-xs font-medium px-1.5 py-0.5 rounded">
        ${BADGE_CLOCK_SVG_SM}
        2 mins ago
      </span>
      <span class="flex items-center bg-neutral-primary-soft border border-default text-heading text-xs font-medium px-1.5 py-0.5 rounded">
        ${BADGE_CLOCK_SVG_SM}
        2 mins ago
      </span>
      <span class="flex items-center bg-neutral-secondary-medium border border-default-medium text-heading text-xs font-medium px-1.5 py-0.5 rounded">
        ${BADGE_CLOCK_SVG_SM}
        2 mins ago
      </span>
      <span class="flex items-center bg-danger-soft border border-danger-subtle text-fg-danger-strong text-xs font-medium px-1.5 py-0.5 rounded">
        ${BADGE_CLOCK_SVG_SM}
        2 mins ago
      </span>
      <span class="flex items-center bg-success-soft border border-success-subtle text-fg-success-strong text-xs font-medium px-1.5 py-0.5 rounded">
        ${BADGE_CLOCK_SVG_SM}
        2 mins ago
      </span>
      <span class="flex items-center bg-warning-soft border border-warning-subtle text-fg-warning text-xs font-medium px-1.5 py-0.5 rounded">
        ${BADGE_CLOCK_SVG_SM}
        2 mins ago
      </span>
    </div>
  </div>

  <!-- 3. Large badges with icon -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Large Badges with Icon</h4>
    <div class="flex flex-wrap items-center gap-2">
      <span class="inline-flex items-center bg-brand-softer border border-brand-subtle text-fg-brand-strong text-sm font-medium leading-none px-2 py-1 rounded">
        ${BADGE_CLOCK_SVG_LG}
        2 mins ago
      </span>
      <span class="inline-flex items-center bg-neutral-primary-soft border border-default text-heading text-sm font-medium leading-none px-2 py-1 rounded">
        ${BADGE_CLOCK_SVG_LG}
        2 mins ago
      </span>
      <span class="inline-flex items-center bg-neutral-secondary-medium border border-default-medium text-heading text-sm font-medium leading-none px-2 py-1 rounded">
        ${BADGE_CLOCK_SVG_LG}
        2 mins ago
      </span>
      <span class="inline-flex items-center bg-danger-soft border border-danger-subtle text-fg-danger-strong text-sm font-medium leading-none px-2 py-1 rounded">
        ${BADGE_CLOCK_SVG_LG}
        2 mins ago
      </span>
      <span class="inline-flex items-center bg-success-soft border border-success-subtle text-fg-success-strong text-sm font-medium leading-none px-2 py-1 rounded">
        ${BADGE_CLOCK_SVG_LG}
        2 mins ago
      </span>
      <span class="inline-flex items-center bg-warning-soft border border-warning-subtle text-fg-warning text-sm font-medium leading-none px-2 py-1 rounded">
        ${BADGE_CLOCK_SVG_LG}
        2 mins ago
      </span>
    </div>
  </div>

  <!-- 4. Badges with SVG loader -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Badges with SVG Loader</h4>
    <div class="flex flex-wrap items-center gap-2">
      <span class="flex items-center bg-brand-softer border border-brand-subtle text-fg-brand-strong text-xs font-medium px-1.5 py-0.5 rounded gap-1">
        ${getBadgeLoaderSvg('text-fg-brand', '#1C64F2')}
        <span>2 mins ago</span>
      </span>
      <span class="flex items-center bg-neutral-primary-soft border border-default text-heading text-xs font-medium px-1.5 py-0.5 rounded gap-1">
        ${getBadgeLoaderSvg('text-neutral-tertiary', '#6A7282')}
        <span>2 mins ago</span>
      </span>
      <span class="flex items-center bg-neutral-secondary-medium border border-default-medium text-heading text-xs font-medium px-1.5 py-0.5 rounded gap-1">
        ${getBadgeLoaderSvg('text-neutral-quaternary', '#6A7282')}
        <span>2 mins ago</span>
      </span>
      <span class="flex items-center bg-danger-soft border border-danger-subtle text-fg-danger-strong text-xs font-medium px-1.5 py-0.5 rounded gap-1">
        ${getBadgeLoaderSvg('text-danger-medium', '#C70036')}
        <span>2 mins ago</span>
      </span>
      <span class="flex items-center bg-success-soft border border-success-subtle text-fg-success-strong text-xs font-medium px-1.5 py-0.5 rounded gap-1">
        ${getBadgeLoaderSvg('text-success-medium', '#009966')}
        <span>2 mins ago</span>
      </span>
      <span class="flex items-center bg-warning-soft border border-warning-subtle text-fg-warning text-xs font-medium px-1.5 py-0.5 rounded gap-1">
        ${getBadgeLoaderSvg('text-warning-medium', '#D03801')}
        <span>2 mins ago</span>
      </span>
    </div>
  </div>

  <!-- 5. Dismissible badges (chips) -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Dismissible Badges (Chips)</h4>
    <div class="flex flex-wrap items-center gap-2">
      <span id="badge-dismiss-brand" class="inline-flex items-center bg-brand-softer border border-brand-subtle text-fg-brand-strong text-xs font-medium ps-1.5 pe-0.5 py-0.5 rounded gap-1">
        <span>Brand</span>
        <button type="button" class="inline-flex items-center p-0.5 text-sm bg-transparent rounded-xs hover:bg-brand-soft" data-dismiss-target="#badge-dismiss-brand" aria-label="Remove">
          ${BADGE_CLOSE_SVG}
          <span class="sr-only">Remove badge</span>
        </button>
      </span>

      <span id="badge-dismiss-alternative" class="inline-flex items-center bg-neutral-primary-soft border border-default text-heading text-xs font-medium ps-1.5 pe-0.5 py-0.5 rounded gap-1">
        <span>Alternative</span>
        <button type="button" class="inline-flex items-center p-0.5 text-sm bg-transparent rounded-xs hover:bg-neutral-tertiary" data-dismiss-target="#badge-dismiss-alternative" aria-label="Remove">
          ${BADGE_CLOSE_SVG}
          <span class="sr-only">Remove badge</span>
        </button>
      </span>

      <span id="badge-dismiss-gray" class="inline-flex items-center bg-neutral-secondary-medium border border-default-medium text-heading text-xs font-medium ps-1.5 pe-0.5 py-0.5 rounded gap-1">
        <span>Gray</span>
        <button type="button" class="inline-flex items-center p-0.5 text-sm bg-transparent rounded-xs hover:bg-neutral-quaternary" data-dismiss-target="#badge-dismiss-gray" aria-label="Remove">
          ${BADGE_CLOSE_SVG}
          <span class="sr-only">Remove badge</span>
        </button>
      </span>

      <span id="badge-dismiss-danger" class="inline-flex items-center bg-danger-soft border border-danger-subtle text-fg-danger-strong text-xs font-medium ps-1.5 pe-0.5 py-0.5 rounded gap-1">
        <span>Danger</span>
        <button type="button" class="inline-flex items-center p-0.5 text-sm bg-transparent rounded-xs hover:bg-danger-medium" data-dismiss-target="#badge-dismiss-danger" aria-label="Remove">
          ${BADGE_CLOSE_SVG}
          <span class="sr-only">Remove badge</span>
        </button>
      </span>

      <span id="badge-dismiss-success" class="inline-flex items-center bg-success-soft border border-success-subtle text-fg-success-strong text-xs font-medium ps-1.5 pe-0.5 py-0.5 rounded gap-1">
        <span>Success</span>
        <button type="button" class="inline-flex items-center p-0.5 text-sm bg-transparent rounded-xs hover:bg-success-medium" data-dismiss-target="#badge-dismiss-success" aria-label="Remove">
          ${BADGE_CLOSE_SVG}
          <span class="sr-only">Remove badge</span>
        </button>
      </span>

      <span id="badge-dismiss-warning" class="inline-flex items-center bg-warning-soft border border-warning-subtle text-fg-warning text-xs font-medium ps-1.5 pe-0.5 py-0.5 rounded gap-1">
        <span>Warning</span>
        <button type="button" class="inline-flex items-center p-0.5 text-sm bg-transparent rounded-xs hover:bg-warning-medium" data-dismiss-target="#badge-dismiss-warning" aria-label="Remove">
          ${BADGE_CLOSE_SVG}
          <span class="sr-only">Remove badge</span>
        </button>
      </span>
    </div>
  </div>

  <!-- 6. Chips with avatar -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Chips with Avatar</h4>
    <div class="flex flex-wrap items-center gap-2">
      <span id="badge-avatar-dismiss-brand" class="inline-flex items-center bg-brand-softer border border-brand-subtle text-fg-brand-strong text-xs font-medium ps-1.5 pe-0.5 py-0.5 rounded gap-1">
        <img class="w-3.5 h-3.5 rounded-full me-1" src="${avatarImg}" alt="Rounded avatar">
        Brand
        <button type="button" class="inline-flex items-center p-0.5 text-sm bg-transparent rounded-xs hover:bg-brand-soft" data-dismiss-target="#badge-avatar-dismiss-brand" aria-label="Remove">
          ${BADGE_CLOSE_SVG}
          <span class="sr-only">Remove badge</span>
        </button>
      </span>

      <span id="badge-avatar-dismiss-alternative" class="inline-flex items-center bg-neutral-primary-soft border border-default text-heading text-xs font-medium ps-1.5 pe-0.5 py-0.5 rounded gap-1">
        <img class="w-3.5 h-3.5 rounded-full me-1" src="${avatarImg}" alt="Rounded avatar">
        Alternative
        <button type="button" class="inline-flex items-center p-0.5 text-sm bg-transparent rounded-xs hover:bg-neutral-tertiary" data-dismiss-target="#badge-avatar-dismiss-alternative" aria-label="Remove">
          ${BADGE_CLOSE_SVG}
          <span class="sr-only">Remove badge</span>
        </button>
      </span>

      <span id="badge-avatar-dismiss-gray" class="inline-flex items-center bg-neutral-secondary-medium border border-default-medium text-heading text-xs font-medium ps-1.5 pe-0.5 py-0.5 rounded gap-1">
        <img class="w-3.5 h-3.5 rounded-full me-1" src="${avatarImg}" alt="Rounded avatar">
        Gray
        <button type="button" class="inline-flex items-center p-0.5 text-sm bg-transparent rounded-xs hover:bg-neutral-quaternary" data-dismiss-target="#badge-avatar-dismiss-gray" aria-label="Remove">
          ${BADGE_CLOSE_SVG}
          <span class="sr-only">Remove badge</span>
        </button>
      </span>

      <span id="badge-avatar-dismiss-danger" class="inline-flex items-center bg-danger-soft border border-danger-subtle text-fg-danger-strong text-xs font-medium ps-1.5 pe-0.5 py-0.5 rounded gap-1">
        <img class="w-3.5 h-3.5 rounded-full me-1" src="${avatarImg}" alt="Rounded avatar">
        Danger
        <button type="button" class="inline-flex items-center p-0.5 text-sm bg-transparent rounded-xs hover:bg-danger-medium" data-dismiss-target="#badge-avatar-dismiss-danger" aria-label="Remove">
          ${BADGE_CLOSE_SVG}
          <span class="sr-only">Remove badge</span>
        </button>
      </span>

      <span id="badge-avatar-dismiss-success" class="inline-flex items-center bg-success-soft border border-success-subtle text-fg-success-strong text-xs font-medium ps-1.5 pe-0.5 py-0.5 rounded gap-1">
        <img class="w-3.5 h-3.5 rounded-full me-1" src="${avatarImg}" alt="Rounded avatar">
        Success
        <button type="button" class="inline-flex items-center p-0.5 text-sm bg-transparent rounded-xs hover:bg-success-medium" data-dismiss-target="#badge-avatar-dismiss-success" aria-label="Remove">
          ${BADGE_CLOSE_SVG}
          <span class="sr-only">Remove badge</span>
        </button>
      </span>

      <span id="badge-avatar-dismiss-warning" class="inline-flex items-center bg-warning-soft border border-warning-subtle text-fg-warning text-xs font-medium ps-1.5 pe-0.5 py-0.5 rounded gap-1">
        <img class="w-3.5 h-3.5 rounded-full me-1" src="${avatarImg}" alt="Rounded avatar">
        Warning
        <button type="button" class="inline-flex items-center p-0.5 text-sm bg-transparent rounded-xs hover:bg-warning-medium" data-dismiss-target="#badge-avatar-dismiss-warning" aria-label="Remove">
          ${BADGE_CLOSE_SVG}
          <span class="sr-only">Remove badge</span>
        </button>
      </span>
    </div>
  </div>

  <!-- 7. Notification badge & 8. Button with badge -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Badges inside Buttons</h4>
    <div class="flex flex-wrap items-center gap-4">
      <!-- Notification badge -->
      <button type="button" class="relative text-white bg-brand box-border border border-transparent hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-sm p-3 focus:outline-none">
        <svg class="w-5 h-5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="m3.5 5.5 7.893 6.036a1 1 0 0 0 1.214 0L20.5 5.5M4 19h16a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1Z"/></svg>
        <span class="sr-only">Notifications</span>
        <div class="absolute inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-white bg-danger border-2 border-buffer rounded-full -top-2 -end-2">20</div>
      </button>

      <!-- Button with badge -->
      <button type="button" class="text-white bg-brand box-border border border-transparent hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none">
        Messages
        <span class="inline-flex items-center justify-center w-4 h-4 ms-2 text-xs font-semibold text-white bg-danger rounded-full">
          2
        </span>
      </button>
    </div>
  </div>
</div>
  `.trim();
}

// ─── Flowbite Sticky Marketing Banner ─────────────────────────────────────────
const BANNER_CLOSE_SVG = `<svg class="w-4 h-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 17.94 6M18 18 6.06 6"/></svg>`;

/**
 * Generates a Flowbite Marketing CTA sticky banner component string.
 *
 * @param {Object} options
 * @param {string} [options.id='marketing-banner']
 * @param {string} [options.logoSrc='https://flowbite.com/docs/images/logo.svg']
 * @param {string} [options.brandName='Flowbite']
 * @param {string} [options.brandUrl='https://flowbite.com/']
 * @param {string} [options.message='Build websites even faster with components on top of Tailwind']
 * @param {string} [options.ctaText='Sign Up']
 * @param {string} [options.ctaUrl='#signup']
 * @param {string} [options.closeLabel='Close banner']
 * @returns {string} HTML markup
 */
export function renderFlowbiteMarketingBanner(options = {}) {
  const {
    id = 'marketing-banner',
    logoSrc = 'https://flowbite.com/docs/images/logo.svg',
    brandName = 'Flowbite',
    brandUrl = 'https://flowbite.com/',
    message = 'Build websites even faster with components on top of Tailwind',
    ctaText = 'Sign Up',
    ctaUrl = '#signup',
    closeLabel = 'Close banner',
  } = options;

  return `
<div id="${id}" tabindex="-1" class="fixed z-50 flex flex-col md:flex-row justify-between w-[calc(100%-2rem)] p-4 -translate-x-1/2 bg-neutral-primary-soft border border-default rounded-base shadow-xs lg:max-w-7xl left-1/2 top-6">
    <div class="flex flex-col items-start mb-3 me-4 md:items-center md:flex-row md:mb-0">
        <a href="${brandUrl}" class="flex items-center mb-2 border-default md:pe-4 md:me-4 md:border-e md:mb-0">
            <img src="${logoSrc}" class="h-6 me-2" alt="${brandName} Logo">
            <span class="text-heading self-center text-lg font-semibold whitespace-nowrap">${brandName}</span>
        </a>
        <p class="flex items-center text-sm font-normal text-body">${message}</p>
    </div>
    <div class="flex items-center shrink-0">
        <button type="button" class="text-white bg-brand hover:bg-brand-strong box-border border border-transparent focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-xs px-3 py-1.5 focus:outline-none me-2" data-cta-url="${ctaUrl}">${ctaText}</button>
        <button data-dismiss-target="#${id}" type="button" class="hidden shrink-0 md:inline-flex justify-center text-sm w-7 h-7 items-center text-body hover:bg-neutral-tertiary hover:text-heading rounded-sm">
            ${BANNER_CLOSE_SVG}
            <span class="sr-only">${closeLabel}</span>
        </button>
        <button data-dismiss-target="#${id}" type="button" class="md:hidden text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-4 focus:ring-neutral-tertiary-soft shadow-xs font-medium leading-5 rounded-base text-xs px-3 py-1.5 focus:outline-none">Close</button>
    </div>
</div>`.trim();
}

// ─── Flowbite Bottom Navigation (Tablet & Mobile) ─────────────────────────────
const BOTTOM_NAV_SVGS = {
  home: `<svg class="w-6 h-6 mb-1 text-body group-hover:text-fg-brand" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m4 12 8-8 8 8M6 10.5V19a1 1 0 0 0 1 1h3v-3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3h3a1 1 0 0 0 1-1v-8.5"/></svg>`,
  wallet: `<svg class="w-6 h-6 mb-1 text-body group-hover:text-fg-brand" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8H5m12 0a1 1 0 0 1 1 1v2.6M17 8l-4-4M5 8a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.6M5 8l4-4 4 4m6 4h-4a2 2 0 1 0 0 4h4a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1Z"/></svg>`,
  settings: `<svg class="w-6 h-6 mb-1 text-body group-hover:text-fg-brand" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M6 4v10m0 0a2 2 0 1 0 0 4m0-4a2 2 0 1 1 0 4m0 0v2m6-16v2m0 0a2 2 0 1 0 0 4m0-4a2 2 0 1 1 0 4m0 0v10m6-16v10m0 0a2 2 0 1 0 0 4m0-4a2 2 0 1 1 0 4m0 0v2"/></svg>`,
  profile: `<svg class="w-6 h-6 mb-1 text-body group-hover:text-fg-brand" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 0a8.949 8.949 0 0 0 4.951-1.488A3.987 3.987 0 0 0 13 16h-2a3.987 3.987 0 0 0-3.951 3.512A8.948 8.948 0 0 0 12 21Zm3-11a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg>`,
};

const DEFAULT_BOTTOM_NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: BOTTOM_NAV_SVGS.home, route: '#dashboard' },
  { id: 'wallet', label: 'Wallet', icon: BOTTOM_NAV_SVGS.wallet, route: '#sales-cash' },
  { id: 'settings', label: 'Settings', icon: BOTTOM_NAV_SVGS.settings, route: '#settings' },
  { id: 'profile', label: 'Profile', icon: BOTTOM_NAV_SVGS.profile, route: '#profile' },
];

/**
 * Generates a Flowbite Bottom Navigation Bar component string (targeted for tablet and mobile).
 *
 * @param {Object} options
 * @param {string} [options.id='bottom-navigation']
 * @param {Array<Object>} [options.items]           - Array of items { id, label, icon, route }
 * @param {string} [options.activeId='home']        - Active item identifier
 * @param {boolean} [options.mobileTabletOnly=true] - Limit to tablet & mobile via lg:hidden
 * @param {string} [options.extraClasses='']
 * @returns {string} HTML markup
 */
export function renderFlowbiteBottomNav(options = {}) {
  const {
    id = 'bottom-navigation',
    items = DEFAULT_BOTTOM_NAV_ITEMS,
    activeId = 'home',
    mobileTabletOnly = true,
    extraClasses = '',
  } = options;

  const visibilityClass = mobileTabletOnly ? 'lg:hidden fb-bottom-nav-mobile-only' : '';
  const combinedClasses = `fixed bottom-0 left-0 z-50 w-full h-16 bg-neutral-primary-soft border-t border-default ${visibilityClass} ${extraClasses}`.trim();

  const renderedItems = items.map((item) => {
    const isActive = item.id === activeId || item.label.toLowerCase() === String(activeId).toLowerCase();
    const activeTextClass = isActive ? 'text-fg-brand font-semibold' : 'text-body group-hover:text-fg-brand';
    const activeIconClass = isActive ? 'text-fg-brand' : 'text-body group-hover:text-fg-brand';

    let iconHtml = item.icon || BOTTOM_NAV_SVGS[item.id] || BOTTOM_NAV_SVGS.home;
    if (isActive) {
      iconHtml = iconHtml.replace('text-body group-hover:text-fg-brand', activeIconClass);
    }

    return `
        <button type="button" class="inline-flex flex-col items-center justify-center px-5 hover:bg-neutral-secondary-medium group" data-nav-id="${item.id}" data-nav-route="${item.route || ''}">
            ${iconHtml}
            <span class="text-sm ${activeTextClass}">${item.label}</span>
        </button>`;
  }).join('\n');

  return `
<div id="${id}" class="${combinedClasses}">
    <div class="grid h-full max-w-lg grid-cols-4 mx-auto font-medium">
${renderedItems}
    </div>
</div>`.trim();
}

/**
 * Initializes interactive behaviors for Flowbite Bottom Navigation.
 *
 * @param {HTMLElement|Document} [root=document]
 * @param {Function} [onNavigate]
 */
export function wireFlowbiteBottomNav(root = document, onNavigate) {
  const buttons = root.querySelectorAll('button[data-nav-id]');
  buttons.forEach((btn) => {
    if (btn.dataset.fbNavBound) return;
    btn.dataset.fbNavBound = 'true';

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const navId = btn.getAttribute('data-nav-id');
      const route = btn.getAttribute('data-nav-route');

      // Update active state in UI
      buttons.forEach((b) => {
        const textSpan = b.querySelector('span');
        const iconSvg = b.querySelector('svg');
        const isTarget = b === btn;

        if (textSpan) {
          textSpan.className = isTarget ? 'text-sm text-fg-brand font-semibold' : 'text-sm text-body group-hover:text-fg-brand';
        }
        if (iconSvg) {
          iconSvg.classList.toggle('text-fg-brand', isTarget);
          iconSvg.classList.toggle('text-body', !isTarget);
        }
      });

      if (typeof onNavigate === 'function') {
        onNavigate({ id: navId, route });
      } else if (route && window.location.hash !== route) {
        window.location.hash = route;
      }
    });
  });
}

/**
 * Renders a complete showcase of Flowbite Sticky Marketing Banner and Bottom Navigation.
 *
 * @returns {string} HTML markup
 */
export function renderFlowbiteBannerAndBottomNavShowcase() {
  return `
<div class="flowbite-banner-bottom-nav-showcase space-y-8 p-4">
  <!-- Sticky Banner Showcase -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Sticky Marketing CTA Banner</h4>
    <div class="relative min-h-[140px] p-4 bg-neutral-secondary-medium rounded-base border border-default">
      ${renderFlowbiteMarketingBanner({ id: 'marketing-banner-showcase' })}
    </div>
  </div>

  <!-- Bottom Navigation Showcase (Tablet & Mobile) -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Bottom Navigation Bar (Tablet & Mobile)</h4>
    <div class="relative min-h-[80px] p-2 bg-neutral-secondary-medium rounded-base border border-default overflow-hidden">
      ${renderFlowbiteBottomNav({ id: 'bottom-navigation-showcase', mobileTabletOnly: false, extraClasses: 'static!' })}
    </div>
  </div>
</div>
  `.trim();
}

// ─── Flowbite Buttons ─────────────────────────────────────────────────────────
const BUTTON_CART_SVGS = {
  xs: `<svg class="w-3.5 h-3.5 me-1.5 -ms-0.5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 4h1.5L9 16m0 0h8m-8 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm8 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm-8.5-3h9.25L19 7H7.312"/></svg>`,
  sm: `<svg class="w-4 h-4 me-1.5 -ms-0.5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 4h1.5L9 16m0 0h8m-8 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm8 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm-8.5-3h9.25L19 7H7.312"/></svg>`,
  base: `<svg class="w-4 h-4 me-1.5 -ms-0.5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 4h1.5L9 16m0 0h8m-8 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm8 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm-8.5-3h9.25L19 7H7.312"/></svg>`,
  lg: `<svg class="w-4 h-4 me-1.5 -ms-0.5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 4h1.5L9 16m0 0h8m-8 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm8 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm-8.5-3h9.25L19 7H7.312"/></svg>`,
  xl: `<svg class="w-5 h-5 me-1.5 -ms-0.5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 4h1.5L9 16m0 0h8m-8 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm8 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm-8.5-3h9.25L19 7H7.312"/></svg>`,
};

const BUTTON_ARROW_RIGHT_SVG = `<svg class="w-4 h-4 ms-1.5 -me-0.5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 12H5m14 0-4 4m4-4-4-4"/></svg>`;

const BUTTON_HEART_SVG = `<svg class="w-5 h-5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12.01 6.001C6.5 1 1 8 5.782 13.001L12.011 20l6.23-7C23 8 17.5 1 12.01 6.002Z"/></svg>`;

function getButtonLoaderSvg(spinnerColorClass = 'text-white') {
  return `<svg aria-hidden="true" role="status" class="w-4 h-4 me-2 ${spinnerColorClass} animate-spin" viewBox="0 0 100 101" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z" fill="#E5E7EB"/><path d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z" fill="currentColor"/></svg>`;
}

const FLOWBITE_BUTTON_VARIANTS = {
  brand: 'text-white bg-brand box-border border border-transparent hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium shadow-xs',
  default: 'text-white bg-brand box-border border border-transparent hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium shadow-xs',
  secondary: 'text-body bg-neutral-secondary-medium box-border border border-default-medium hover:bg-neutral-tertiary-medium hover:text-heading focus:ring-4 focus:ring-neutral-tertiary shadow-xs',
  tertiary: 'text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-4 focus:ring-neutral-tertiary-soft shadow-xs',
  success: 'text-white bg-success box-border border border-transparent hover:bg-success-strong focus:ring-4 focus:ring-success-medium shadow-xs',
  danger: 'text-white bg-danger box-border border border-transparent hover:bg-danger-strong focus:ring-4 focus:ring-danger-medium shadow-xs',
  warning: 'text-white bg-warning box-border border border-transparent hover:bg-warning-strong focus:ring-4 focus:ring-warning-medium shadow-xs',
  dark: 'text-white bg-dark box-border border border-transparent hover:bg-dark-strong focus:ring-4 focus:ring-neutral-tertiary shadow-xs',
  ghost: 'text-heading bg-transparent box-border border border-transparent hover:bg-neutral-secondary-medium focus:ring-4 focus:ring-neutral-tertiary',
  disabled: 'text-fg-disabled bg-disabled box-border border border-default-medium shadow-xs',

  // Outline variants
  'outline-brand': 'text-fg-brand bg-neutral-primary border border-brand hover:bg-brand hover:text-white focus:ring-4 focus:ring-brand-subtle',
  'outline-gray': 'text-body bg-neutral-primary border border-default hover:bg-neutral-secondary-soft hover:text-heading focus:ring-4 focus:ring-neutral-tertiary',
  'outline-success': 'text-success bg-neutral-primary border border-success hover:bg-success hover:text-white focus:ring-4 focus:ring-neutral-tertiary',
  'outline-danger': 'text-danger bg-neutral-primary border border-danger hover:bg-danger hover:text-white focus:ring-4 focus:ring-neutral-tertiary',
  'outline-warning': 'text-warning bg-neutral-primary border border-warning hover:bg-warning hover:text-white focus:ring-4 focus:ring-neutral-tertiary',
};

const FLOWBITE_BUTTON_SIZES = {
  xs: 'font-medium leading-5 rounded-base text-xs px-3 py-1.5',
  sm: 'font-medium leading-5 rounded-base text-sm px-3 py-2',
  base: 'font-medium leading-5 rounded-base text-sm px-4 py-2.5',
  lg: 'font-medium rounded-base text-base px-5 py-3',
  xl: 'font-medium rounded-base text-base px-6 py-3.5',
};

/**
 * Generates an accessible Flowbite Button component string according to Flowbite guidelines.
 *
 * @param {Object} options
 * @param {string} [options.text='Button']
 * @param {string} [options.variant='brand']  - 'brand'|'secondary'|'tertiary'|'success'|'danger'|'warning'|'dark'|'ghost'|'outline-brand'|'outline-gray'|'outline-success'|'outline-danger'|'outline-warning'|'disabled'
 * @param {string} [options.size='base']      - 'xs'|'sm'|'base'|'lg'|'xl'
 * @param {boolean} [options.outline=false]   - Render outline variant
 * @param {string} [options.type='button']    - 'button'|'submit'|'reset'
 * @param {string} [options.icon]             - Custom SVG or 'cart'|'arrow-right'|'heart'
 * @param {string} [options.iconPosition='left'] - 'left'|'right'
 * @param {boolean} [options.iconOnly=false]  - Render square icon button
 * @param {string} [options.iconSize='w-8 h-8'] - 'w-8 h-8'|'w-9 h-9'|'w-10 h-10'
 * @param {string|number} [options.badge]     - Render helper badge/count inside button
 * @param {boolean} [options.loader=false]    - Render disabled button with animated SVG spinner
 * @param {boolean} [options.disabled=false]
 * @param {string} [options.id]
 * @param {string} [options.extraClasses='']
 * @param {string} [options.attributes='']
 * @returns {string} HTML markup
 */
export function renderFlowbiteButton(options = {}) {
  const {
    text = 'Button',
    variant = 'brand',
    size = 'base',
    outline = false,
    type = 'button',
    icon = null,
    iconPosition = 'left',
    iconOnly = false,
    iconSize = 'w-8 h-8',
    badge = null,
    loader = false,
    disabled = false,
    id = null,
    extraClasses = '',
    attributes = '',
  } = options;

  let resolvedVariant = variant;
  if (outline && !resolvedVariant.startsWith('outline-')) {
    resolvedVariant = `outline-${variant}`;
  }

  const variantClasses = FLOWBITE_BUTTON_VARIANTS[resolvedVariant] || FLOWBITE_BUTTON_VARIANTS.brand;
  const sizeClasses = FLOWBITE_BUTTON_SIZES[size] || FLOWBITE_BUTTON_SIZES.base;
  const idAttr = id ? ` id="${id}"` : '';
  const disabledAttr = (disabled || loader) ? ' disabled' : '';

  // 1. Icon-only Button
  if (iconOnly) {
    const iconSvg = icon === 'heart' || !icon ? BUTTON_HEART_SVG : icon;
    const isOutline = resolvedVariant.startsWith('outline-');
    const srText = (text && text !== 'Button') ? text : 'Icon description';
    const baseClasses = isOutline
      ? `inline-flex items-center justify-center text-fg-brand bg-neutral-primary border border-brand hover:bg-brand hover:text-white focus:ring-4 focus:ring-brand-subtle rounded-base ${iconSize} focus:outline-none`
      : `inline-flex items-center justify-center text-white bg-brand hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium shadow-xs rounded-base ${iconSize} focus:outline-none`;

    return `<button${idAttr} type="${type}" class="${baseClasses} ${extraClasses}"${disabledAttr} ${attributes}>
${iconSvg}
<span class="sr-only">${srText}</span>
</button>`.trim();
  }

  // 2. Loader Button
  if (loader) {
    const isSecondary = resolvedVariant === 'secondary' || resolvedVariant === 'tertiary';
    const spinnerClass = isSecondary ? 'text-fg-brand' : 'text-white';
    const loaderVariant = isSecondary
      ? 'inline-flex items-center text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-4 focus:ring-neutral-tertiary shadow-xs'
      : 'inline-flex items-center text-white bg-brand box-border border border-transparent hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium shadow-xs';

    return `<button${idAttr} disabled type="${type}" class="${loaderVariant} ${sizeClasses} focus:outline-none ${extraClasses}" ${attributes}>
${getButtonLoaderSvg(spinnerClass)}
${text || 'Loading...'}
</button>`.trim();
  }

  // 3. Disabled Button
  if (disabled || resolvedVariant === 'disabled') {
    return `<button${idAttr} type="${type}" class="${FLOWBITE_BUTTON_VARIANTS.disabled} ${sizeClasses} focus:outline-none ${extraClasses}" disabled ${attributes}>${text || 'Disabled button'}</button>`.trim();
  }

  // 4. Button with Badge / Label
  if (badge !== null && badge !== undefined) {
    return `<button${idAttr} type="${type}" class="inline-flex items-center ${variantClasses} ${sizeClasses} focus:outline-none ${extraClasses}" ${attributes}>
${text}
<span class="inline-flex items-center justify-center w-4.5 h-4.5 ms-2 text-xs font-medium text-fg-brand-strong bg-brand-soft rounded-full dark:text-fg-brand-subtle">${badge}</span>
</button>`.trim();
  }

  // 5. Button with Icon
  if (icon) {
    let iconSvg = icon;
    if (icon === 'cart') {
      iconSvg = BUTTON_CART_SVGS[size] || BUTTON_CART_SVGS.base;
    } else if (icon === 'arrow-right') {
      iconSvg = BUTTON_ARROW_RIGHT_SVG;
    }

    if (iconPosition === 'right') {
      return `<button${idAttr} type="${type}" class="inline-flex items-center ${variantClasses} ${sizeClasses} focus:outline-none ${extraClasses}" ${attributes}>
${text}
${iconSvg}
</button>`.trim();
    }

    return `<button${idAttr} type="${type}" class="inline-flex items-center ${variantClasses} ${sizeClasses} focus:outline-none ${extraClasses}" ${attributes}>
${iconSvg}
${text}
</button>`.trim();
  }

  // Default Standard Button
  return `<button${idAttr} type="${type}" class="${variantClasses} ${sizeClasses} focus:outline-none ${extraClasses}" ${attributes}>${text}</button>`.trim();
}

/**
 * Renders the complete Flowbite Buttons showcase containing all 10 button categories:
 * 1. Default buttons (Default, Secondary, Tertiary, Success, Danger, Warning, Dark, Ghost)
 * 2. Outline buttons (Brand, Gray, Success, Danger, Warning)
 * 3. Button sizes (Extra small, Small, Base, Large, Extra large)
 * 4. Outline button sizes (Extra small, Small, Base, Large, Extra large)
 * 5. Button sizes with icon
 * 6. Buttons with icon (Left and Right)
 * 7. Button with label (badge)
 * 8. Icon buttons (w-8 h-8, w-9 h-9, w-10 h-10; solid & outline)
 * 9. Loader (disabled loading buttons)
 * 10. Disabled button
 *
 * @returns {string} HTML markup
 */
export function renderFlowbiteButtonsShowcase() {
  return `
<div class="flowbite-buttons-showcase space-y-8 p-4">
  <!-- 1. Default button -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Default Buttons</h4>
    <div class="flex flex-wrap items-center gap-3">
      <button type="button" class="text-white bg-brand box-border border border-transparent hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none">Default</button>
      <button type="button" class="text-body bg-neutral-secondary-medium box-border border border-default-medium hover:bg-neutral-tertiary-medium hover:text-heading focus:ring-4 focus:ring-neutral-tertiary shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none">Secondary</button>
      <button type="button" class="text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-4 focus:ring-neutral-tertiary-soft shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none">Tertiary</button>
      <button type="button" class="text-white bg-success box-border border border-transparent hover:bg-success-strong focus:ring-4 focus:ring-success-medium shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none">Success</button>
      <button type="button" class="text-white bg-danger box-border border border-transparent hover:bg-danger-strong focus:ring-4 focus:ring-danger-medium shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none">Danger</button>
      <button type="button" class="text-white bg-warning box-border border border-transparent hover:bg-warning-strong focus:ring-4 focus:ring-warning-medium shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none">Warning</button>
      <button type="button" class="text-white bg-dark box-border border border-transparent hover:bg-dark-strong focus:ring-4 focus:ring-neutral-tertiary shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none">Dark</button>
      <button type="button" class="text-heading bg-transparent box-border border border-transparent hover:bg-neutral-secondary-medium focus:ring-4 focus:ring-neutral-tertiary font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none">Ghost</button>
    </div>
  </div>

  <!-- 2. Outline buttons -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Outline Buttons</h4>
    <div class="flex flex-wrap items-center gap-3">
      <button type="button" class="text-fg-brand bg-neutral-primary border border-brand hover:bg-brand hover:text-white focus:ring-4 focus:ring-brand-subtle font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none">Brand</button>
      <button type="button" class="text-body bg-neutral-primary border border-default hover:bg-neutral-secondary-soft hover:text-heading focus:ring-4 focus:ring-neutral-tertiary font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none">Gray</button>
      <button type="button" class="text-success bg-neutral-primary border border-success hover:bg-success hover:text-white focus:ring-4 focus:ring-neutral-tertiary font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none">Success</button>
      <button type="button" class="text-danger bg-neutral-primary border border-danger hover:bg-danger hover:text-white focus:ring-4 focus:ring-neutral-tertiary font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none">Danger</button>
      <button type="button" class="text-warning bg-neutral-primary border border-warning hover:bg-warning hover:text-white focus:ring-4 focus:ring-neutral-tertiary font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none">Warning</button>
    </div>
  </div>

  <!-- 3. Button sizes -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Button Sizes</h4>
    <div class="flex flex-wrap items-center gap-3">
      <button type="button" class="text-white bg-brand hover:bg-brand-strong box-border border border-transparent focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-xs px-3 py-1.5 focus:outline-none">Extra small</button>
      <button type="button" class="text-white bg-brand hover:bg-brand-strong box-border border border-transparent focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-sm px-3 py-2 focus:outline-none">Small</button>
      <button type="button" class="text-white bg-brand hover:bg-brand-strong box-border border border-transparent focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none">Base</button>
      <button type="button" class="text-white bg-brand hover:bg-brand-strong box-border border border-transparent focus:ring-4 focus:ring-brand-medium shadow-xs font-medium rounded-base text-base px-5 py-3 focus:outline-none">Large</button>
      <button type="button" class="text-white bg-brand hover:bg-brand-strong box-border border border-transparent focus:ring-4 focus:ring-brand-medium shadow-xs font-medium rounded-base text-base px-6 py-3.5 focus:outline-none">Extra large</button>
    </div>
  </div>

  <!-- 4. Outline button sizes -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Outline Button Sizes</h4>
    <div class="flex flex-wrap items-center gap-3">
      <button type="button" class="text-fg-brand bg-neutral-primary border border-brand hover:bg-brand hover:text-white focus:ring-4 focus:ring-brand-subtle font-medium leading-5 rounded-base text-xs px-3 py-1.5 focus:outline-none">Extra small</button>
      <button type="button" class="text-fg-brand bg-neutral-primary border border-brand hover:bg-brand hover:text-white focus:ring-4 focus:ring-brand-subtle font-medium leading-5 rounded-base text-xs px-3 py-2 focus:outline-none">Small</button>
      <button type="button" class="text-fg-brand bg-neutral-primary border border-brand hover:bg-brand hover:text-white focus:ring-4 focus:ring-brand-subtle font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none">Base</button>
      <button type="button" class="text-fg-brand bg-neutral-primary border border-brand hover:bg-brand hover:text-white focus:ring-4 focus:ring-brand-subtle font-medium rounded-base text-base px-5 py-3 focus:outline-none">Large</button>
      <button type="button" class="text-fg-brand bg-neutral-primary border border-brand hover:bg-brand hover:text-white focus:ring-4 focus:ring-brand-subtle font-medium rounded-base text-base px-6 py-3.5 focus:outline-none">Extra large</button>
    </div>
  </div>

  <!-- 5. Button sizes with icon -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Button Sizes with Icon</h4>
    <div class="flex flex-wrap items-center gap-3">
      <button type="button" class="inline-flex items-center text-white bg-brand hover:bg-brand-strong box-border border border-transparent focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-xs px-3 py-1.5 focus:outline-none">
        ${BUTTON_CART_SVGS.xs}
        Extra small
      </button>
      <button type="button" class="inline-flex items-center text-white bg-brand hover:bg-brand-strong box-border border border-transparent focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-sm px-3 py-2 focus:outline-none">
        ${BUTTON_CART_SVGS.sm}
        Small
      </button>
      <button type="button" class="inline-flex items-center text-white bg-brand hover:bg-brand-strong box-border border border-transparent focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none">
        ${BUTTON_CART_SVGS.base}
        Base
      </button>
      <button type="button" class="inline-flex items-center text-white bg-brand hover:bg-brand-strong box-border border border-transparent focus:ring-4 focus:ring-brand-medium shadow-xs font-medium rounded-base text-base px-5 py-3 focus:outline-none">
        ${BUTTON_CART_SVGS.lg}
        Large
      </button>
      <button type="button" class="inline-flex items-center text-white bg-brand hover:bg-brand-strong box-border border border-transparent focus:ring-4 focus:ring-brand-medium shadow-xs font-medium rounded-base text-base px-6 py-3.5 focus:outline-none">
        ${BUTTON_CART_SVGS.xl}
        Extra large
      </button>
    </div>
  </div>

  <!-- 6. Buttons with icon (Left and Right) -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Buttons with Icon</h4>
    <div class="flex flex-wrap items-center gap-3">
      <button type="button" class="inline-flex items-center text-white bg-brand hover:bg-brand-strong box-border border border-transparent focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none">
        ${BUTTON_CART_SVGS.base}
        Buy now
      </button>
      <button type="button" class="inline-flex items-center text-white bg-brand hover:bg-brand-strong box-border border border-transparent focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none">
        Choose plan
        ${BUTTON_ARROW_RIGHT_SVG}
      </button>
    </div>
  </div>

  <!-- 7. Button with label (badge) -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Button with Label</h4>
    <div>
      <button type="button" class="inline-flex items-center text-white bg-brand hover:bg-brand-strong box-border border border-transparent focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none">
        Messages
        <span class="inline-flex items-center justify-center w-4.5 h-4.5 ms-2 text-xs font-medium text-fg-brand-strong bg-brand-soft rounded-full dark:text-fg-brand-subtle">2</span>
      </button>
    </div>
  </div>

  <!-- 8. Icon buttons -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Icon Buttons</h4>
    <div class="flex flex-wrap items-center gap-3">
      <!-- Solid Icon Buttons -->
      <button type="button" class="inline-flex items-center justify-center text-white bg-brand hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium shadow-xs rounded-base w-8 h-8 focus:outline-none">
        ${BUTTON_HEART_SVG}
        <span class="sr-only">Icon description</span>
      </button>
      <button type="button" class="inline-flex items-center justify-center text-white bg-brand hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium shadow-xs rounded-base w-9 h-9 focus:outline-none">
        ${BUTTON_HEART_SVG}
        <span class="sr-only">Icon description</span>
      </button>
      <button type="button" class="inline-flex items-center justify-center text-white bg-brand hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium shadow-xs rounded-base w-10 h-10 focus:outline-none">
        ${BUTTON_HEART_SVG}
        <span class="sr-only">Icon description</span>
      </button>

      <!-- Outline Icon Buttons -->
      <button type="button" class="inline-flex items-center justify-center text-fg-brand bg-neutral-primary border border-brand hover:bg-brand hover:text-white focus:ring-4 focus:ring-brand-subtle rounded-base w-8 h-8 focus:outline-none">
        ${BUTTON_HEART_SVG}
        <span class="sr-only">Icon description</span>
      </button>
      <button type="button" class="inline-flex items-center justify-center text-fg-brand bg-neutral-primary border border-brand hover:bg-brand hover:text-white focus:ring-4 focus:ring-brand-subtle rounded-base w-9 h-9 focus:outline-none">
        ${BUTTON_HEART_SVG}
        <span class="sr-only">Icon description</span>
      </button>
      <button type="button" class="inline-flex items-center justify-center text-fg-brand bg-neutral-primary border border-brand hover:bg-brand hover:text-white focus:ring-4 focus:ring-brand-subtle rounded-base w-10 h-10 focus:outline-none">
        ${BUTTON_HEART_SVG}
        <span class="sr-only">Icon description</span>
      </button>
    </div>
  </div>

  <!-- 9. Loader -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Buttons with Loader</h4>
    <div class="flex flex-wrap items-center gap-3">
      <button disabled type="button" class="text-white bg-brand inline-flex items-center box-border border border-transparent hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none">
        ${getButtonLoaderSvg('text-white')}
        Loading...
      </button>
      <button disabled type="button" class="inline-flex items-center text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-4 focus:ring-neutral-tertiary shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none">
        ${getButtonLoaderSvg('text-fg-brand')}
        Loading...
      </button>
    </div>
  </div>

  <!-- 10. Disabled button -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Disabled Button</h4>
    <div>
      <button type="button" class="text-fg-disabled bg-disabled box-border border border-default-medium shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none" disabled>Disabled button</button>
    </div>
  </div>
</div>
  `.trim();
}

// ─── Flowbite Button Groups ───────────────────────────────────────────────────
const BTN_GROUP_SVGS = {
  download: `<svg class="w-4 h-4 me-1.5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 13V4M7 14H5a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1h-2m-1-5-4 5-4-5m9 8h.01"/></svg>`,
  bookmark: `<svg class="w-4 h-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m17 21-5-4-5 4V3.889a.92.92 0 0 1 .244-.629.808.808 0 0 1 .59-.26h8.333a.81.81 0 0 1 .589.26.92.92 0 0 1 .244.63V21Z"/></svg>`,
  alignLeft: `<svg class="w-4 h-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 6h8m-8 4h12M6 14h8m-8 4h12"/></svg>`,
  alignCenter: `<svg class="w-4 h-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 6h8M6 10h12M8 14h8M6 18h12"/></svg>`,
  alignJustify: `<svg class="w-4 h-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 6H6m12 4H6m12 4H6m12 4H6"/></svg>`,
  alignRight: `<svg class="w-4 h-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 6h-8m8 4H6m12 4h-8m8 4H6"/></svg>`,
  myFiles: `<svg class="w-4 h-4 me-1.5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 3v4a1 1 0 0 1-1 1H5m4 8h6m-6-4h6m4-8v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7.914a1 1 0 0 1 .293-.707l3.914-3.914A1 1 0 0 1 9.914 3H18a1 1 0 0 1 1 1Z"/></svg>`,
  dotsHorizontal: `<svg class="w-4 h-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-width="3" d="M6 12h.01m6 0h.01m5.99 0h.01"/></svg>`,
  chevronDown: `<svg class="w-4 h-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m19 9-7 7-7-7"/></svg>`,
  qrCode: `<svg class="w-4 h-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linejoin="round" stroke-width="2" d="M4 4h6v6H4V4Zm10 10h6v6h-6v-6Zm0-10h6v6h-6V4Zm-4 10h.01v.01H10V14Zm0 4h.01v.01H10V18Zm-3 2h.01v.01H7V20Zm0-4h.01v.01H7V16Zm-3 2h.01v.01H4V18Zm0-4h.01v.01H4V14Z"/><path stroke="currentColor" stroke-linejoin="round" stroke-width="2" d="M7 7h.01v.01H7V7Zm10 10h.01v.01H17V17Z"/></svg>`,
  prev: `<svg class="w-4 h-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m15 19-7-7 7-7"/></svg>`,
  next: `<svg class="w-4 h-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 5 7 7-7 7"/></svg>`,
  profile: `<svg class="w-4 h-4 me-1.5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 0a8.949 8.949 0 0 0 4.951-1.488A3.987 3.987 0 0 0 13 16h-2a3.987 3.987 0 0 0-3.951 3.512A8.948 8.948 0 0 0 12 21Zm3-11a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg>`,
  settings: `<svg class="w-4 h-4 me-1.5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M6 4v10m0 0a2 2 0 1 0 0 4m0-4a2 2 0 1 1 0 4m0 0v2m6-16v2m0 0a2 2 0 1 0 0 4m0-4a2 2 0 1 1 0 4m0 0v10m6-16v10m0 0a2 2 0 1 0 0 4m0-4a2 2 0 1 1 0 4m0 0v2"/></svg>`,
  messages: `<svg class="w-4 h-4 me-1.5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 13h3.439a.991.991 0 0 1 .908.6 3.978 3.978 0 0 0 7.306 0 .99.99 0 0 1 .908-.6H20M4 13v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6M4 13l2-9h12l2 9M9 7h6m-7 3h8"/></svg>`,
};

/**
 * Generates an accessible Flowbite Button Group component string.
 *
 * @param {Object} options
 * @param {Array<Object>} [options.items=[]]
 * @param {boolean} [options.vertical=false]
 * @param {string} [options.role='group']
 * @param {string} [options.id]
 * @param {string} [options.extraClasses='']
 * @returns {string} HTML markup
 */
export function renderFlowbiteButtonGroup(options = {}) {
  const {
    items = [],
    vertical = false,
    role = 'group',
    id = null,
    extraClasses = '',
  } = options;

  const idAttr = id ? ` id="${id}"` : '';
  const groupClasses = vertical
    ? `rounded-base shadow-xs w-56 -space-y-px ${extraClasses}`.trim()
    : `inline-flex rounded-base shadow-xs -space-x-px ${extraClasses}`.trim();

  const renderedItems = items.map((item, index) => {
    const isFirst = index === 0;
    const isLast = index === items.length - 1;

    let cornerClass = '';
    if (vertical) {
      if (isFirst) cornerClass = 'rounded-t-base';
      else if (isLast) cornerClass = 'rounded-b-base';
    } else {
      if (isFirst) cornerClass = 'rounded-s-base';
      else if (isLast) cornerClass = 'rounded-e-base';
    }

    const baseClass = item.isLink
      ? `text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:bg-neutral-secondary-medium focus:text-heading focus:ring-neutral-tertiary-soft font-medium leading-5 text-sm px-3 py-2 focus:outline-none ${cornerClass}`
      : `text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 text-sm px-3 py-2 focus:outline-none ${cornerClass}`;

    const iconHtml = item.icon ? `${item.icon} ` : '';
    const disabledAttr = item.disabled ? ' disabled' : '';

    if (item.isLink) {
      return `<a href="${item.href || '#'}" class="${baseClass.trim()}">${iconHtml}${item.label}</a>`;
    }

    return `<button type="button" class="${baseClass.trim()}"${disabledAttr}>${iconHtml}${item.label}</button>`;
  }).join('\n  ');

  return `
<div${idAttr} class="${groupClasses}" role="${role}">
  ${renderedItems}
</div>`.trim();
}

/**
 * Renders the complete Flowbite Button Group showcase containing all 13 official sections.
 *
 * @returns {string} HTML markup
 */
export function renderFlowbiteButtonGroupShowcase() {
  return `
<div class="flowbite-button-group-showcase space-y-8 p-4">
  <!-- 1. Default example -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Default Example</h4>
    <div class="inline-flex rounded-base shadow-xs -space-x-px" role="group">
      <button type="button" class="text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 rounded-s-base text-sm px-3 py-2 focus:outline-none">
        Profile
      </button>
      <button type="button" class="text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 text-sm px-3 py-2 focus:outline-none">
        Settings
      </button>
      <button type="button" class="text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 rounded-e-base text-sm px-3 py-2 focus:outline-none">
        Messages
      </button>
    </div>
  </div>

  <!-- 2. Button group info -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Button Group Info</h4>
    <div class="inline-flex rounded-base shadow-xs -space-x-px" role="group">
      <button type="button" class="inline-flex items-center text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 rounded-s-base text-sm px-3 py-2 focus:outline-none">
        ${BTN_GROUP_SVGS.download}
        Download
      </button>
      <button type="button" class="text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 rounded-e-base text-sm px-3 py-2 focus:outline-none" disabled>
        456k
      </button>
    </div>
  </div>

  <!-- 3. Button group icon action -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Button Group Icon Action</h4>
    <div class="inline-flex rounded-base shadow-xs -space-x-px" role="group">
      <button type="button" class="inline-flex items-center text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 rounded-s-base text-sm px-3 py-2 focus:outline-none" disabled>
        Save book
      </button>
      <button type="button" class="inline-flex items-center justify-center text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 rounded-e-base text-sm w-9 h-full focus:outline-none">
        ${BTN_GROUP_SVGS.bookmark}
      </button>
    </div>
  </div>

  <!-- 4. Button group icons -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Button Group Icons</h4>
    <div class="inline-flex rounded-base shadow-xs -space-x-px" role="group">
      <button data-tooltip-target="tooltip-option-1" type="button" class="inline-flex items-center justify-center text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 rounded-s-base text-sm w-9 h-9 focus:outline-none">
        ${BTN_GROUP_SVGS.alignLeft}
      </button>
      <div id="tooltip-option-1" role="tooltip" class="absolute z-10 invisible inline-block px-3 py-2 text-sm leading-4 font-medium text-white transition-opacity duration-300 bg-dark rounded-base shadow-xs opacity-0 tooltip">
        Align left
        <div class="tooltip-arrow" data-popper-arrow></div>
      </div>
      <button data-tooltip-target="tooltip-option-2" type="button" class="inline-flex items-center justify-center text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 text-sm w-9 h-9 focus:outline-none">
        ${BTN_GROUP_SVGS.alignCenter}
      </button>
      <div id="tooltip-option-2" role="tooltip" class="absolute z-10 invisible inline-block px-3 py-2 text-sm leading-4 font-medium text-white transition-opacity duration-300 bg-dark rounded-base shadow-xs opacity-0 tooltip">
        Align center
        <div class="tooltip-arrow" data-popper-arrow></div>
      </div>
      <button data-tooltip-target="tooltip-option-3" type="button" class="inline-flex items-center justify-center text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 text-sm w-9 h-9 focus:outline-none">
        ${BTN_GROUP_SVGS.alignJustify}
      </button>
      <div id="tooltip-option-3" role="tooltip" class="absolute z-10 invisible inline-block px-3 py-2 text-sm leading-4 font-medium text-white transition-opacity duration-300 bg-dark rounded-base shadow-xs opacity-0 tooltip">
        Align justify
        <div class="tooltip-arrow" data-popper-arrow></div>
      </div>
      <button data-tooltip-target="tooltip-option-4" type="button" class="inline-flex items-center justify-center text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 rounded-e-base text-sm w-9 h-9 focus:outline-none">
        ${BTN_GROUP_SVGS.alignRight}
      </button>
      <div id="tooltip-option-4" role="tooltip" class="absolute z-10 invisible inline-block px-3 py-2 text-sm leading-4 font-medium text-white transition-opacity duration-300 bg-dark rounded-base shadow-xs opacity-0 tooltip">
        Align right
        <div class="tooltip-arrow" data-popper-arrow></div>
      </div>
    </div>
  </div>

  <!-- 5. Button group dropdown -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Button Group Dropdown</h4>
    <div class="inline-flex rounded-base shadow-xs -space-x-px relative" role="group">
      <button type="button" class="inline-flex items-center text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 rounded-s-base text-sm px-3 py-2 focus:outline-none" disabled>
        ${BTN_GROUP_SVGS.myFiles}
        My files
      </button>
      <button type="button" class="inline-flex items-center text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 text-sm px-3 py-2 focus:outline-none">
        ${BTN_GROUP_SVGS.download}
        Download
      </button>
      <button id="dropdownOptions" data-dropdown-toggle="dropdown-options" type="button" class="text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 rounded-e-base text-sm px-3 py-2 focus:outline-none">
        ${BTN_GROUP_SVGS.dotsHorizontal}
      </button>
      <div id="dropdown-options" class="z-10 bg-neutral-primary-medium border border-default-medium rounded-base shadow-lg w-40 block hidden" style="position:absolute; top:calc(100% + 4px); right:0;">
        <ul class="p-2 text-sm text-body font-medium" aria-labelledby="dropdownOptions">
          <li>
            <a href="#" class="inline-flex items-center w-full p-2 hover:bg-neutral-tertiary-medium hover:text-heading rounded-md">Save as PDF</a>
          </li>
          <li>
            <a href="#" class="inline-flex items-center w-full p-2 hover:bg-neutral-tertiary-medium hover:text-heading rounded-md">Save as doc</a>
          </li>
          <li>
            <a href="#" class="inline-flex items-center w-full p-2 hover:bg-neutral-tertiary-medium hover:text-heading rounded-md">Save as image</a>
          </li>
        </ul>
      </div>
    </div>
  </div>

  <!-- 6. Button group badge -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Button Group Badge</h4>
    <div class="inline-flex rounded-base shadow-xs -space-x-px relative" role="group">
      <button type="button" class="inline-flex items-center text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 rounded-s-base text-sm px-3 py-2 focus:outline-none" disabled>
        Messages
        <span class="inline-flex items-center justify-center w-4.5 h-4.5 ms-2 text-xs font-medium text-fg-danger-strong bg-danger-soft border border-danger-subtle rounded-full">2</span>
      </button>
      <button id="dropdownMessages" data-dropdown-toggle="dropdown-messages" type="button" class="inline-flex items-center justify-center text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 rounded-e-base text-sm w-9 h-full focus:outline-none">
        ${BTN_GROUP_SVGS.chevronDown}
      </button>
      <div id="dropdown-messages" class="z-10 bg-neutral-primary-medium border border-default-medium rounded-base shadow-lg w-36 block hidden" style="position:absolute; top:calc(100% + 4px); right:0;">
        <ul class="p-2 text-sm text-body font-medium" aria-labelledby="dropdownMessages">
          <li>
            <a href="#" class="inline-flex items-center w-full p-2 hover:bg-neutral-tertiary-medium hover:text-heading rounded-md">Mark as read</a>
          </li>
          <li>
            <a href="#" class="inline-flex items-center w-full p-2 hover:bg-neutral-tertiary-medium hover:text-heading rounded-md">Archive all</a>
          </li>
          <li>
            <a href="#" class="inline-flex items-center w-full p-2 hover:bg-neutral-tertiary-medium hover:text-heading rounded-md">Delete all</a>
          </li>
        </ul>
      </div>
    </div>
  </div>

  <!-- 7. QR code button group -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">QR Code Button Group</h4>
    <div class="inline-flex rounded-base shadow-xs -space-x-px" role="group">
      <button type="button" class="inline-flex items-center justify-center text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 rounded-s-base text-sm w-9 h-full focus:outline-none" disabled>
        ${BTN_GROUP_SVGS.qrCode}
      </button>
      <button type="button" class="inline-flex items-center text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 rounded-e-base text-sm px-3 py-2 focus:outline-none">
        Sign In
      </button>
    </div>
  </div>

  <!-- 8. Pagination button group -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Pagination Button Group</h4>
    <div class="flex flex-col gap-4">
      <div class="inline-flex rounded-base shadow-xs -space-x-px" role="group">
        <button type="button" class="inline-flex items-center justify-center text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 rounded-s-base text-sm w-9 h-9 focus:outline-none">
          ${BTN_GROUP_SVGS.prev}
        </button>
        <button type="button" class="inline-flex items-center justify-center text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 text-sm w-9 h-9 focus:outline-none">1</button>
        <button type="button" class="inline-flex items-center justify-center text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 text-sm w-9 h-9 focus:outline-none">2</button>
        <button type="button" class="inline-flex items-center justify-center text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 text-sm w-9 h-9 focus:outline-none">3</button>
        <button type="button" class="inline-flex items-center justify-center text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 text-sm w-9 h-9 focus:outline-none">4</button>
        <button type="button" class="inline-flex items-center justify-center text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 text-sm w-9 h-9 focus:outline-none">5</button>
        <button type="button" class="inline-flex items-center justify-center text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 text-sm w-9 h-9 focus:outline-none">...</button>
        <button type="button" class="inline-flex items-center justify-center text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 text-sm w-9 h-9 focus:outline-none">99</button>
        <button type="button" class="inline-flex items-center justify-center text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 rounded-e-base text-sm w-9 h-9 focus:outline-none">
          ${BTN_GROUP_SVGS.next}
        </button>
      </div>

      <div class="inline-flex rounded-base shadow-xs -space-x-px" role="group">
        <button data-tooltip-target="tooltip-previous" type="button" class="inline-flex items-center justify-center text-body bg-neutral-primary-soft rounded-s-base box-border border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary leading-5 w-9 h-9 focus:outline-none">
          ${BTN_GROUP_SVGS.prev}
        </button>
        <div id="tooltip-previous" role="tooltip" class="absolute z-10 invisible inline-block px-3 py-2 text-sm leading-4 font-medium text-white transition-opacity duration-300 bg-dark rounded-base shadow-xs opacity-0 tooltip">
          Previous
          <div class="tooltip-arrow" data-popper-arrow></div>
        </div>
        <button data-tooltip-target="tooltip-next" type="button" class="inline-flex items-center justify-center text-body bg-neutral-primary-soft rounded-e-base box-border border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary leading-5 w-9 h-9 focus:outline-none">
          ${BTN_GROUP_SVGS.next}
        </button>
        <div id="tooltip-next" role="tooltip" class="absolute z-10 invisible inline-block px-3 py-2 text-sm leading-4 font-medium text-white transition-opacity duration-300 bg-dark rounded-base shadow-xs opacity-0 tooltip">
          Next
          <div class="tooltip-arrow" data-popper-arrow></div>
        </div>
      </div>
    </div>
  </div>

  <!-- 9. Vertical button groups -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Vertical Button Groups</h4>
    <div class="flex flex-wrap items-start gap-6">
      <div class="rounded-base shadow-xs w-56 -space-y-px" role="group">
        <button type="button" class="block w-full text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft rounded-t-base font-medium leading-5 text-sm px-3 py-2 focus:outline-none">
          Profile
        </button>
        <button type="button" class="block w-full text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 text-sm px-3 py-2 focus:outline-none">
          Settings
        </button>
        <button type="button" class="block w-full text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft rounded-b-base font-medium leading-5 text-sm px-3 py-2 focus:outline-none">
          Messages
        </button>
      </div>

      <div class="rounded-base shadow-xs -space-y-px" role="group">
        <button data-tooltip-target="tooltip-option-5" type="button" class="grid place-items-center text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 rounded-t-base text-sm w-9 h-9 focus:outline-none">
          ${BTN_GROUP_SVGS.alignLeft}
        </button>
        <div id="tooltip-option-5" role="tooltip" class="absolute z-10 invisible inline-block px-3 py-2 text-sm leading-4 font-medium text-white transition-opacity duration-300 bg-dark rounded-base shadow-xs opacity-0 tooltip">
          Align left
          <div class="tooltip-arrow" data-popper-arrow></div>
        </div>
        <button data-tooltip-target="tooltip-option-6" type="button" class="grid place-items-center text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 text-sm w-9 h-9 focus:outline-none">
          ${BTN_GROUP_SVGS.alignCenter}
        </button>
        <div id="tooltip-option-6" role="tooltip" class="absolute z-10 invisible inline-block px-3 py-2 text-sm leading-4 font-medium text-white transition-opacity duration-300 bg-dark rounded-base shadow-xs opacity-0 tooltip">
          Align center
          <div class="tooltip-arrow" data-popper-arrow></div>
        </div>
        <button data-tooltip-target="tooltip-option-7" type="button" class="grid place-items-center text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 text-sm w-9 h-9 focus:outline-none">
          ${BTN_GROUP_SVGS.alignJustify}
        </button>
        <div id="tooltip-option-7" role="tooltip" class="absolute z-10 invisible inline-block px-3 py-2 text-sm leading-4 font-medium text-white transition-opacity duration-300 bg-dark rounded-base shadow-xs opacity-0 tooltip">
          Align justify
          <div class="tooltip-arrow" data-popper-arrow></div>
        </div>
        <button data-tooltip-target="tooltip-option-8" type="button" class="grid place-items-center text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 rounded-b-base text-sm w-9 h-9 focus:outline-none">
          ${BTN_GROUP_SVGS.alignRight}
        </button>
        <div id="tooltip-option-8" role="tooltip" class="absolute z-10 invisible inline-block px-3 py-2 text-sm leading-4 font-medium text-white transition-opacity duration-300 bg-dark rounded-base shadow-xs opacity-0 tooltip">
          Align right
          <div class="tooltip-arrow" data-popper-arrow></div>
        </div>
      </div>
    </div>
  </div>

  <!-- 10. Button group with colors -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Button Group with Colors</h4>
    <div class="flex flex-wrap items-center gap-3">
      <div class="inline-flex rounded-base shadow-xs -space-x-px" role="group">
        <button type="button" class="inline-flex items-center justify-center text-body bg-neutral-primary-soft rounded-s-base box-border border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary leading-5 w-9 h-9 focus:outline-none">
          ${BTN_GROUP_SVGS.prev}
        </button>
        <button type="button" class="inline-flex items-center justify-center text-body bg-neutral-primary-soft rounded-e-base box-border border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary leading-5 w-9 h-9 focus:outline-none">
          ${BTN_GROUP_SVGS.next}
        </button>
      </div>

      <div class="inline-flex rounded-base shadow-xs -space-x-px" role="group">
        <button type="button" class="inline-flex items-center justify-center text-white bg-brand box-border border-e border-brand-strong hover:bg-brand-strong focus:ring-3 focus:ring-brand-medium shadow-xs leading-5 rounded-s-base w-9 h-9 focus:outline-none">
          ${BTN_GROUP_SVGS.prev}
        </button>
        <button type="button" class="inline-flex items-center justify-center text-white bg-brand box-border border-s border-brand-strong hover:bg-brand-strong focus:ring-3 focus:ring-brand-medium shadow-xs leading-5 rounded-e-base w-9 h-9 focus:outline-none">
          ${BTN_GROUP_SVGS.next}
        </button>
      </div>

      <div class="inline-flex rounded-base shadow-xs -space-x-px" role="group">
        <button type="button" class="inline-flex items-center justify-center text-body bg-neutral-secondary-medium rounded-s-base box-border border border-default-medium hover:bg-neutral-tertiary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary leading-5 w-9 h-9 focus:outline-none">
          ${BTN_GROUP_SVGS.prev}
        </button>
        <button type="button" class="inline-flex items-center justify-center text-body bg-neutral-secondary-medium rounded-e-base box-border border border-default-medium hover:bg-neutral-tertiary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary leading-5 w-9 h-9 focus:outline-none">
          ${BTN_GROUP_SVGS.next}
        </button>
      </div>

      <div class="inline-flex rounded-base shadow-xs -space-x-px" role="group">
        <button type="button" class="inline-flex items-center justify-center text-white bg-danger box-border border-e border-danger-strong hover:bg-danger-strong focus:ring-3 focus:ring-danger-medium shadow-xs leading-5 rounded-s-base w-9 h-9 focus:outline-none">
          ${BTN_GROUP_SVGS.prev}
        </button>
        <button type="button" class="inline-flex items-center justify-center text-white bg-danger box-border border-s border-danger-strong hover:bg-danger-strong focus:ring-3 focus:ring-danger-medium shadow-xs leading-5 rounded-e-base w-9 h-9 focus:outline-none">
          ${BTN_GROUP_SVGS.next}
        </button>
      </div>

      <div class="inline-flex rounded-base shadow-xs -space-x-px" role="group">
        <button type="button" class="inline-flex items-center justify-center text-white bg-success box-border border-e border-success-strong hover:bg-success-strong focus:ring-3 focus:ring-success-medium shadow-xs leading-5 rounded-s-base w-9 h-9 focus:outline-none">
          ${BTN_GROUP_SVGS.prev}
        </button>
        <button type="button" class="inline-flex items-center justify-center text-white bg-success box-border border-s border-success-strong hover:bg-success-strong focus:ring-3 focus:ring-success-medium shadow-xs leading-5 rounded-e-base w-9 h-9 focus:outline-none">
          ${BTN_GROUP_SVGS.next}
        </button>
      </div>
    </div>
  </div>

  <!-- 11. Button group as links -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Button Group as Links</h4>
    <div class="inline-flex rounded-base shadow-xs -space-x-px">
      <a href="#" aria-current="page" class="text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:bg-neutral-secondary-medium focus:text-heading focus:ring-neutral-tertiary-soft font-medium leading-5 rounded-s-base text-sm px-3 py-2 focus:outline-none">
        Profile
      </a>
      <a href="#" class="text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:bg-neutral-secondary-medium focus:text-heading focus:ring-neutral-tertiary-soft font-medium leading-5 text-sm px-3 py-2 focus:outline-none">
        Settings
      </a>
      <a href="#" class="text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:bg-neutral-secondary-medium focus:text-heading focus:ring-neutral-tertiary-soft font-medium leading-5 rounded-e-base text-sm px-3 py-2 focus:outline-none">
        Messages
      </a>
    </div>
  </div>

  <!-- 12. Group buttons with icons -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Group Buttons with Icons</h4>
    <div class="inline-flex rounded-base shadow-xs -space-x-px" role="group">
      <button type="button" class="inline-flex items-center text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 rounded-s-base text-sm px-3 py-2 focus:outline-none">
        ${BTN_GROUP_SVGS.profile}
        Profile
      </button>
      <button type="button" class="inline-flex items-center text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 text-sm px-3 py-2 focus:outline-none">
        ${BTN_GROUP_SVGS.settings}
        Settings
      </button>
      <button type="button" class="inline-flex items-center text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 rounded-e-base text-sm px-3 py-2 focus:outline-none">
        ${BTN_GROUP_SVGS.messages}
        Messages
      </button>
    </div>
  </div>

  <!-- 13. Button group outline -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Button Group Outline</h4>
    <div class="flex flex-col gap-4">
      <div class="inline-flex rounded-base -space-x-px" role="group">
        <button type="button" class="text-heading bg-neutral-primary border border-dark-strong hover:bg-dark hover:text-white focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 rounded-s-base text-sm px-3 py-2 focus:outline-none">
          Profile
        </button>
        <button type="button" class="text-heading bg-neutral-primary border border-dark-strong hover:bg-dark hover:text-white focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 text-sm px-3 py-2 focus:outline-none">
          Settings
        </button>
        <button type="button" class="text-heading bg-neutral-primary border border-dark-strong hover:bg-dark hover:text-white focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 rounded-e-base text-sm px-3 py-2 focus:outline-none">
          Downloads
        </button>
      </div>

      <div class="inline-flex rounded-base -space-x-px" role="group">
        <button type="button" class="inline-flex items-center text-heading bg-neutral-primary border border-dark-strong hover:bg-dark hover:text-white focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 rounded-s-base text-sm px-3 py-2 focus:outline-none">
          ${BTN_GROUP_SVGS.profile}
          Profile
        </button>
        <button type="button" class="inline-flex items-center text-heading bg-neutral-primary border border-dark-strong hover:bg-dark hover:text-white focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 text-sm px-3 py-2 focus:outline-none">
          ${BTN_GROUP_SVGS.settings}
          Settings
        </button>
        <button type="button" class="inline-flex items-center text-heading bg-neutral-primary border border-dark-strong hover:bg-dark hover:text-white focus:ring-3 focus:ring-neutral-tertiary-soft font-medium leading-5 rounded-e-base text-sm px-3 py-2 focus:outline-none">
          ${BTN_GROUP_SVGS.messages}
          Messages
        </button>
      </div>
    </div>
  </div>
</div>
  `.trim();
}

// ─── Flowbite Copy to Clipboard SVGs & Showcase ──────────────────────────────
const CLIPBOARD_SVGS = {
  checkSm: `<svg class="w-3 h-3 me-1" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 11.917 9.724 16.5 19 7.5"/></svg>`,
  checkWhiteSm: `<svg class="w-3 h-3 text-white me-1.5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 16 12"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M1 5.917 5.724 10.5 15 1.5"/> </svg>`,
  copyBase: `<svg class="w-4 h-4 me-1.5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 4h3a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3m0 3h6m-6 5h6m-6 4h6M10 3v4h4V3h-4Z"/></svg>`,
  checkBrandBase: `<svg class="w-4 h-4 text-fg-brand me-1.5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 4h3a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3m0 3h6m-6 7 2 2 4-4m-5-9v4h4V3h-4Z"/></svg>`,
  copyInputGroup: `<svg class="w-4 h-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 4h3a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3m0 3h6m-3 5h3m-6 0h.01M12 16h3m-6 0h.01M10 3v4h4V3h-4Z" /></svg>`,
  checkInputGroup: `<svg class="w-4 h-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 4h3a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3m0 3h6m-6 7 2 2 4-4m-5-9v4h4V3h-4Z" /></svg>`,
  copyPlain: `<svg class="w-4 h-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 4h3a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3m0 3h6m-6 5h6m-6 4h6M10 3v4h4V3h-4Z"/></svg>`,
  checkBrandPlain: `<svg class="w-4 h-4 text-fg-brand" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 4h3a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3m0 3h6m-6 7 2 2 4-4m-5-9v4h4V3h-4Z"/></svg>`,
};

/**
 * Generates an accessible Flowbite copy to clipboard component string.
 *
 * @param {Object} options
 * @param {string} [options.variant='default'] - 'default'|'buttonWithText'|'inputGroup'|'urlShortener'|'contactDetails'
 * @param {string} [options.id='npm-install']
 * @param {string} [options.value='npm install flowbite']
 * @param {string} [options.label='Label']
 * @param {string} [options.prefix='URL']
 * @param {string} [options.helperText]
 * @param {Object} [options.contactDetails]
 * @returns {string} HTML markup
 */
export function renderFlowbiteClipboard(options = {}) {
  const {
    variant = 'default',
    id = 'npm-install',
    value = 'npm install flowbite',
    label = 'Label',
    prefix = 'URL',
    helperText = '',
    contactDetails = {
      name: 'Bonnie Green',
      email: 'name@flowbite.com',
      phone: '+ 12 345 67890',
    },
  } = options;

  if (variant === 'buttonWithText') {
    return `
<div class="w-full max-w-[18rem]">
    <div class="relative">
        <label for="${id}" class="sr-only">${label}</label>
        <input id="${id}" type="text" class="col-span-6 bg-neutral-secondary-medium border border-default-medium text-body text-sm rounded-base focus:ring-brand focus:border-brand block w-full px-3 py-2.5 shadow-xs placeholder:text-body" value="${value}" disabled readonly>
        <button data-copy-to-clipboard-target="${id}" class="absolute flex items-center end-1.5 top-1/2 -translate-y-1/2 text-body bg-neutral-primary-strong border border-default-strong hover:bg-neutral-secondary-strong/70 hover:text-heading focus:ring-4 focus:ring-neutral-tertiary-soft font-medium leading-5 rounded text-xs px-3 py-1.5 focus:outline-none">
            <span id="default-message">
                <span class="flex items-center">
                    ${CLIPBOARD_SVGS.copyBase}
                    <span class="text-xs font-semibold">Copy</span>
                </span>
            </span>
            <span id="success-message" class="hidden">
                <span class="flex items-center">
                    ${CLIPBOARD_SVGS.checkBrandBase}
                    <span class="text-xs font-semibold text-fg-brand">Copied</span>
                </span>
            </span>
        </button>
    </div>
</div>`.trim();
  }

  if (variant === 'inputGroup') {
    const tooltipId = `tooltip-${id}`;
    return `
<div class="w-full max-w-sm">
  <label for="${id}" class="block mb-2.5 text-sm font-medium text-heading">${label || 'Verify your website:'}</label>
  <div class="flex items-stretch rounded-base shadow-xs">
    <!-- Prefix -->
    <span class="shrink-0 z-10 inline-flex items-center px-3 py-2.5 text-sm text-body bg-neutral-tertiary border border-default-medium border-e-0 rounded-s-base">${prefix}</span>
    <!-- Input -->
    <div class="relative w-full">
      <input id="${id}" type="text" aria-describedby="${id}-helper" class="bg-neutral-secondary-medium border border-default-medium border-e-0 text-body text-sm focus:ring-brand focus:border-brand block w-full px-3 py-2.5 placeholder:text-body" value="${value}" readonly disabled />
    </div>
    <!-- Button -->
    <button data-tooltip-target="${tooltipId}" data-copy-to-clipboard-target="${id}" type="button" class="shrink-0 z-10 inline-flex items-center justify-center text-white bg-brand hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium font-medium rounded-e-base text-sm px-4 py-2.5 focus:outline-none border border-brand border-s-0">
      <span id="default-icon">
        ${CLIPBOARD_SVGS.copyInputGroup}
      </span>
      <span id="success-icon" class="hidden">
        ${CLIPBOARD_SVGS.checkInputGroup}
      </span>
    </button>
    <!-- Tooltip -->
    <div id="${tooltipId}" role="tooltip"
      class="absolute z-10 invisible inline-block px-3 py-2 text-sm font-medium text-white transition-opacity duration-300 bg-dark rounded-base shadow-xs opacity-0 tooltip">
      <span id="default-tooltip-message">Copy link</span>
      <span id="success-tooltip-message" class="hidden">Copied!</span>
      <div class="tooltip-arrow" data-popper-arrow></div>
    </div>
  </div>
  ${helperText ? `<p id="${id}-helper" class="mt-2.5 text-sm text-body">${helperText}</p>` : ''}
</div>`.trim();
  }

  if (variant === 'urlShortener') {
    const tooltipId = `tooltip-${id}`;
    return `
<div class="w-full max-w-sm">
    <label for="${id}" class="block mb-2.5 text-sm font-medium text-heading">${label || 'Shorten URL:'}</label>
  <div class="flex items-stretch shadow-xs rounded-base">
    <!-- Generate Button -->
    <button class="shrink-0 z-10 inline-flex items-center justify-center text-white bg-brand hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium font-medium rounded-s-base text-sm px-4 py-2.5 focus:outline-none border border-brand" type="button">
      Generate
    </button>
    <!-- Input -->
    <div class="relative w-full">
      <input id="${id}" type="text" aria-describedby="${id}-helper" class="bg-neutral-secondary-medium border border-default-medium border-s-0 border-e-0 text-body text-sm focus:ring-brand focus:border-brand block w-full px-3 py-2.5 placeholder:text-body" value="${value}" readonly disabled/>
    </div>
    <!-- Button -->
    <button data-tooltip-target="${tooltipId}" data-copy-to-clipboard-target="${id}" class="shrink-0 z-10 inline-flex items-center justify-center text-body bg-neutral-secondary-medium box-border border border-default-medium border-s-0 hover:bg-neutral-tertiary-medium hover:text-heading focus:ring-4 focus:ring-neutral-tertiary font-medium leading-5 rounded-e-base text-sm px-4 py-2.5 focus:outline-none" type="button">
      <span id="default-icon">
        ${CLIPBOARD_SVGS.copyInputGroup}
      </span>
      <span id="success-icon" class="hidden text-fg-brands">
        ${CLIPBOARD_SVGS.checkInputGroup}
      </span>
    </button>
    <!-- Tooltip -->
    <div id="${tooltipId}" role="tooltip" class="absolute z-10 invisible inline-block px-3 py-2 text-sm font-medium text-white transition-opacity duration-300 bg-dark rounded-base shadow-xs opacity-0 tooltip">
      <span id="default-tooltip-message">Copy link</span>
      <span id="success-tooltip-message" class="hidden">Copied!</span>
      <div class="tooltip-arrow" data-popper-arrow></div>
    </div>
  </div>
  ${helperText ? `<p id="${id}-helper" class="mt-2.5 text-sm text-body">${helperText}</p>` : ''}
</div>`.trim();
  }

  if (variant === 'contactDetails') {
    const tooltipId = `tooltip-${id}`;
    return `
<div class="w-full max-w-md bg-neutral-primary-soft border border-default shadow-xs rounded-base p-4 sm:p-6">
    <h2 class="text-lg font-semibold text-heading mb-4">${label || 'Contact details'}</h2>
    <address class="relative bg-neutral-secondary-medium p-4 rounded-base border border-default-medium font-italic grid grid-cols-2">
        <div class="space-y-2 text-body leading-loose hidden sm:block">
            Name <br />
            Email <br />
            Phone Number
        </div>
        <div id="${id}" class="space-y-2 text-heading font-medium leading-loose">
            ${contactDetails.name} <br />
            ${contactDetails.email} <br />
            ${contactDetails.phone}
        </div>
        <button data-copy-to-clipboard-target="${id}" data-copy-to-clipboard-content-type="textContent" data-tooltip-target="${tooltipId}" class="absolute end-2 top-2 text-body hover:bg-neutral-quaternary hover:text-heading rounded-base p-2 inline-flex items-center justify-center">
            <span id="default-icon-${id}">
                ${CLIPBOARD_SVGS.copyPlain}
            </span>
            <span id="success-icon-${id}" class="hidden">
                ${CLIPBOARD_SVGS.checkBrandPlain}
            </span>
        </button>
        <div id="${tooltipId}" role="tooltip" class="absolute z-10 invisible inline-block px-3 py-2 text-sm font-medium text-white transition-opacity duration-300 bg-dark rounded-base shadow-xs opacity-0 tooltip">
            <span id="default-tooltip-message-${id}">Copy to clipboard</span>
            <span id="success-tooltip-message-${id}" class="hidden">Copied!</span>
            <div class="tooltip-arrow" data-popper-arrow></div>
        </div>
    </address>
</div>`.trim();
  }

  // Default variant
  return `
<div class="grid grid-cols-8 gap-2 w-full max-w-[23rem]">
    <label for="${id}" class="sr-only">${label}</label>
    <input id="${id}" type="text" class="col-span-6 bg-neutral-secondary-medium border border-default-medium text-body text-sm rounded-base focus:ring-brand focus:border-brand block w-full px-3 py-2.5 shadow-xs placeholder:text-body" value="${value}" disabled readonly>
    <button data-copy-to-clipboard-target="${id}" class="col-span-2 col-span-2 text-white bg-brand box-border border border-transparent hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-sm py-2.5 focus:outline-none sm:w-auto">
        <span id="default-message">Copy</span>
        <span id="success-message" class="hidden">
            <div class="inline-flex items-center">
                ${CLIPBOARD_SVGS.checkSm}
                Copied!
            </div>
        </span>
    </button>
</div>`.trim();
}

/**
 * Renders the complete Flowbite Copy to Clipboard showcase containing all 5 official sections.
 *
 * @returns {string} HTML markup
 */
export function renderFlowbiteClipboardShowcase() {
  return `
<div class="flowbite-clipboard-showcase space-y-8 p-4">
  <!-- 1. Default copy to clipboard -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Default Copy to Clipboard</h4>
    <div class="grid grid-cols-8 gap-2 w-full max-w-[23rem]">
        <label for="npm-install" class="sr-only">Label</label>
        <input id="npm-install" type="text" class="col-span-6 bg-neutral-secondary-medium border border-default-medium text-body text-sm rounded-base focus:ring-brand focus:border-brand block w-full px-3 py-2.5 shadow-xs placeholder:text-body" value="npm install flowbite" disabled readonly>
        <button data-copy-to-clipboard-target="npm-install" class="col-span-2 col-span-2 text-white bg-brand box-border border border-transparent hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-sm py-2.5 focus:outline-none sm:w-auto">
            <span id="default-message">Copy</span>
            <span id="success-message" class="hidden">
                <div class="inline-flex items-center">
                    ${CLIPBOARD_SVGS.checkSm}
                    Copied!
                </div>
            </span>
        </button>
    </div>
  </div>

  <!-- 2. Copy button with text -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Copy Button with Text</h4>
    <div class="w-full max-w-[18rem]">
        <div class="relative">
            <label for="npm-install-copy-text" class="sr-only">Label</label>
            <input id="npm-install-copy-text" type="text" class="col-span-6 bg-neutral-secondary-medium border border-default-medium text-body text-sm rounded-base focus:ring-brand focus:border-brand block w-full px-3 py-2.5 shadow-xs placeholder:text-body" value="npm install flowbite" disabled readonly>
            <button data-copy-to-clipboard-target="npm-install-copy-text" class="absolute flex items-center end-1.5 top-1/2 -translate-y-1/2 text-body bg-neutral-primary-strong border border-default-strong hover:bg-neutral-secondary-strong/70 hover:text-heading focus:ring-4 focus:ring-neutral-tertiary-soft font-medium leading-5 rounded text-xs px-3 py-1.5 focus:outline-none">
                <span id="default-message">
                    <span class="flex items-center">
                        ${CLIPBOARD_SVGS.copyBase}
                        <span class="text-xs font-semibold">Copy</span>
                    </span>
                </span>
                <span id="success-message" class="hidden">
                    <span class="flex items-center">
                        ${CLIPBOARD_SVGS.checkBrandBase}
                        <span class="text-xs font-semibold text-fg-brand">Copied</span>
                    </span>
                </span>
            </button>
        </div>
    </div>
  </div>

  <!-- 3. Input group with copy -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Input Group with Copy</h4>
    <div class="w-full max-w-sm">
      <label for="website-url" class="block mb-2.5 text-sm font-medium text-heading">Verify your website:</label>
      <div class="flex items-stretch rounded-base shadow-xs">
        <!-- Prefix -->
        <span class="shrink-0 z-10 inline-flex items-center px-3 py-2.5 text-sm text-body bg-neutral-tertiary border border-default-medium border-e-0 rounded-s-base">URL</span>
        <!-- Input -->
        <div class="relative w-full">
          <input id="website-url" type="text" aria-describedby="helper-text-explanation" class="bg-neutral-secondary-medium border border-default-medium border-e-0 text-body text-sm focus:ring-brand focus:border-brand block w-full px-3 py-2.5 placeholder:text-body" value="https://flowbite.com" readonly disabled />
        </div>
        <!-- Button -->
        <button data-tooltip-target="tooltip-website-url" data-copy-to-clipboard-target="website-url" type="button" class="shrink-0 z-10 inline-flex items-center justify-center text-white bg-brand hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium font-medium rounded-e-base text-sm px-4 py-2.5 focus:outline-none border border-brand border-s-0">
          <span id="default-icon">
            ${CLIPBOARD_SVGS.copyInputGroup}
          </span>
          <span id="success-icon" class="hidden">
            ${CLIPBOARD_SVGS.checkInputGroup}
          </span>
        </button>
        <!-- Tooltip -->
        <div id="tooltip-website-url" role="tooltip"
          class="absolute z-10 invisible inline-block px-3 py-2 text-sm font-medium text-white transition-opacity duration-300 bg-dark rounded-base shadow-xs opacity-0 tooltip">
          <span id="default-tooltip-message">Copy link</span>
          <span id="success-tooltip-message" class="hidden">Copied!</span>
          <div class="tooltip-arrow" data-popper-arrow></div>
        </div>
      </div>
      <p id="helper-text-explanation" class="mt-2.5 text-sm text-body">Security certificate is required for approval</p>
    </div>
  </div>

  <!-- 4. URL shortener input group -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">URL Shortener Input Group</h4>
    <div class="w-full max-w-sm">
        <label for="url-shortener" class="block mb-2.5 text-sm font-medium text-heading">Shorten URL:</label>
      <div class="flex items-stretch shadow-xs rounded-base">
        <!-- Generate Button -->
        <button class="shrink-0 z-10 inline-flex items-center justify-center text-white bg-brand hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium font-medium rounded-s-base text-sm px-4 py-2.5 focus:outline-none border border-brand" type="button">
          Generate
        </button>
        <!-- Input -->
        <div class="relative w-full">
          <input id="url-shortener" type="text" aria-describedby="helper-text-explanation-shortener" class="bg-neutral-secondary-medium border border-default-medium border-s-0 border-e-0 text-body text-sm focus:ring-brand focus:border-brand block w-full px-3 py-2.5 placeholder:text-body" value="https://bit.ly/3U2SXcF" readonly disabled/>
        </div>
        <!-- Button -->
        <button data-tooltip-target="tooltip-url-shortener" data-copy-to-clipboard-target="url-shortener" class="shrink-0 z-10 inline-flex items-center justify-center text-body bg-neutral-secondary-medium box-border border border-default-medium border-s-0 hover:bg-neutral-tertiary-medium hover:text-heading focus:ring-4 focus:ring-neutral-tertiary font-medium leading-5 rounded-e-base text-sm px-4 py-2.5 focus:outline-none" type="button">
          <span id="default-icon">
            ${CLIPBOARD_SVGS.copyInputGroup}
          </span>
          <span id="success-icon" class="hidden text-fg-brands">
            ${CLIPBOARD_SVGS.checkInputGroup}
          </span>
        </button>
        <!-- Tooltip -->
        <div id="tooltip-url-shortener" role="tooltip" class="absolute z-10 invisible inline-block px-3 py-2 text-sm font-medium text-white transition-opacity duration-300 bg-dark rounded-base shadow-xs opacity-0 tooltip">
          <span id="default-tooltip-message">Copy link</span>
          <span id="success-tooltip-message" class="hidden">Copied!</span>
          <div class="tooltip-arrow" data-popper-arrow></div>
        </div>
      </div>
      <p id="helper-text-explanation-shortener" class="mt-2.5 text-sm text-body">Make sure that your URL is valid</p>
    </div>
  </div>

  <!-- 5. Copy contact details -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Copy Contact Details</h4>
    <div class="w-full max-w-md bg-neutral-primary-soft border border-default shadow-xs rounded-base p-4 sm:p-6">
        <h2 class="text-lg font-semibold text-heading mb-4">Contact details</h2>
        <address class="relative bg-neutral-secondary-medium p-4 rounded-base border border-default-medium font-italic grid grid-cols-2">
            <div class="space-y-2 text-body leading-loose hidden sm:block">
                Name <br />
                Email <br />
                Phone Number
            </div>
            <div id="contact-details" class="space-y-2 text-heading font-medium leading-loose">
                Bonnie Green <br />
                name@flowbite.com <br />
                + 12 345 67890
            </div>
            <button data-copy-to-clipboard-target="contact-details" data-copy-to-clipboard-content-type="textContent" data-tooltip-target="tooltip-contact-details" class="absolute end-2 top-2 text-body hover:bg-neutral-quaternary hover:text-heading rounded-base p-2 inline-flex items-center justify-center">
                <span id="default-icon-contact-details">
                    ${CLIPBOARD_SVGS.copyPlain}
                </span>
                <span id="success-icon-contact-details" class="hidden">
                    ${CLIPBOARD_SVGS.checkBrandPlain}
                </span>
            </button>
            <div id="tooltip-contact-details" role="tooltip" class="absolute z-10 invisible inline-block px-3 py-2 text-sm font-medium text-white transition-opacity duration-300 bg-dark rounded-base shadow-xs opacity-0 tooltip">
                <span id="default-tooltip-message-contact-details">Copy to clipboard</span>
                <span id="success-tooltip-message-contact-details" class="hidden">Copied!</span>
                <div class="tooltip-arrow" data-popper-arrow></div>
            </div>
        </address>
    </div>
  </div>
</div>
  `.trim();
}

// ─── Flowbite Datepicker & Timepicker ─────────────────────────────────────────

const DATEPICKER_SVGS = {
  calendar: `<svg class="w-4 h-4 text-body" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 10h16m-8-3V4M7 7V4m10 3V4M5 20h14a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1Zm3-7h.01v.01H8V13Zm4 0h.01v.01H12V13Zm4 0h.01v.01H16V13Zm-8 4h.01v.01H8V17Zm4 0h.01v.01H12V17Zm4 0h.01v.01H16V17Z"/></svg>`,
  clock: `<svg class="w-4 h-4 text-body" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>`,
  prev: `<svg class="w-4 h-4" aria-hidden="true" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m15 19-7-7 7-7"/></svg>`,
  next: `<svg class="w-4 h-4" aria-hidden="true" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 5 7 7-7 7"/></svg>`,
};

/**
 * Helper to format a Date object according to format string.
 * Supports: 'mm/dd/yyyy', 'yyyy-mm-dd', 'dd/mm/yyyy', 'mm-dd-yyyy'.
 */
export function formatFlowbiteDate(date, format = 'mm/dd/yyyy') {
  if (!(date instanceof Date) || isNaN(date.getTime())) return '';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');

  switch (format.toLowerCase()) {
    case 'yyyy-mm-dd':
      return `${yyyy}-${mm}-${dd}`;
    case 'dd/mm/yyyy':
      return `${dd}/${mm}/${yyyy}`;
    case 'mm-dd-yyyy':
      return `${mm}-${dd}-${yyyy}`;
    case 'mm/dd/yyyy':
    default:
      return `${mm}/${dd}/${yyyy}`;
  }
}

/**
 * Helper to parse a date string according to format string or fallback.
 */
export function parseFlowbiteDate(dateStr, format = 'mm/dd/yyyy') {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const parts = dateStr.trim().split(/[-/]/);
  if (parts.length === 3) {
    const fmt = format.toLowerCase();
    let year, month, day;
    if (fmt.startsWith('yyyy')) {
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      day = parseInt(parts[2], 10);
    } else if (fmt.startsWith('dd')) {
      day = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      year = parseInt(parts[2], 10);
    } else {
      month = parseInt(parts[0], 10) - 1;
      day = parseInt(parts[1], 10);
      year = parseInt(parts[2], 10);
    }
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Flowbite Datepicker class component.
 */
export class Datepicker {
  /**
   * @param {HTMLElement} datepickerEl
   * @param {Object} [options={}]
   * @param {Object} [instanceOptions={}]
   */
  constructor(datepickerEl, options = {}, instanceOptions = {}) {
    this._datepickerEl = datepickerEl;
    this._options = {
      defaultDatepickerId: options.defaultDatepickerId || null,
      autohide: options.autohide !== undefined ? options.autohide : (datepickerEl?.hasAttribute('datepicker-autohide') || false),
      format: options.format || datepickerEl?.getAttribute('datepicker-format') || 'mm/dd/yyyy',
      maxDate: options.maxDate || datepickerEl?.getAttribute('datepicker-max-date') || null,
      minDate: options.minDate || datepickerEl?.getAttribute('datepicker-min-date') || null,
      orientation: options.orientation || datepickerEl?.getAttribute('datepicker-orientation') || 'bottom',
      buttons: options.buttons !== undefined ? options.buttons : (datepickerEl?.hasAttribute('datepicker-buttons') || false),
      autoSelectToday: options.autoSelectToday !== undefined ? options.autoSelectToday : (datepickerEl?.hasAttribute('datepicker-autoselect-today') ? 1 : 0),
      title: options.title || datepickerEl?.getAttribute('datepicker-title') || null,
      rangePicker: options.rangePicker !== undefined ? options.rangePicker : false,
      onShow: options.onShow || (() => {}),
      onHide: options.onHide || (() => {}),
      ...options,
    };
    this._instanceOptions = {
      id: instanceOptions.id || (datepickerEl ? datepickerEl.id : null),
      override: instanceOptions.override !== undefined ? instanceOptions.override : true,
    };

    this._selectedDate = null;
    this._viewDate = new Date();
    this._popoverEl = null;
    this._isOpen = false;

    if (this._datepickerEl && this._datepickerEl.value) {
      const parsed = parseFlowbiteDate(this._datepickerEl.value, this._options.format);
      if (parsed) {
        this._selectedDate = parsed;
        this._viewDate = new Date(parsed);
      }
    } else if (this._options.autoSelectToday) {
      this.setDate(new Date());
    }

    this._init();
  }

  _init() {
    if (!this._datepickerEl || typeof document === 'undefined') return;

    this._focusHandler = () => this.show();
    this._clickHandler = (e) => {
      e.stopPropagation();
      this.show();
    };

    this._datepickerEl.addEventListener('focus', this._focusHandler);
    this._datepickerEl.addEventListener('click', this._clickHandler);

    this._docClickHandler = (e) => {
      if (this._isOpen && this._popoverEl && !this._popoverEl.contains(e.target) && e.target !== this._datepickerEl) {
        this.hide();
      }
    };
    document.addEventListener('click', this._docClickHandler);
  }

  getDate() {
    return this._selectedDate ? new Date(this._selectedDate) : undefined;
  }

  setDate(date) {
    if (!date) {
      this._selectedDate = null;
      if (this._datepickerEl) this._datepickerEl.value = '';
    } else {
      const d = date instanceof Date ? date : parseFlowbiteDate(String(date), this._options.format);
      if (d && !isNaN(d.getTime())) {
        this._selectedDate = d;
        this._viewDate = new Date(d);
        if (this._datepickerEl) {
          this._datepickerEl.value = formatFlowbiteDate(d, this._options.format);
          this._datepickerEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }
    if (this._isOpen) this._renderCalendar();
  }

  show() {
    if (this._isOpen) return;
    this._isOpen = true;

    if (typeof document !== 'undefined') {
      if (!this._popoverEl) {
        this._createPopover();
      }
      this._renderCalendar();
      this._positionPopover();
      if (this._popoverEl) {
        this._popoverEl.classList.remove('hidden');
      }
    }

    if (typeof this._options.onShow === 'function') {
      this._options.onShow(this);
    }
  }

  hide() {
    if (!this._isOpen) return;
    this._isOpen = false;
    if (this._popoverEl) {
      this._popoverEl.classList.add('hidden');
    }
    if (typeof this._options.onHide === 'function') {
      this._options.onHide(this);
    }
  }

  _createPopover() {
    this._popoverEl = document.createElement('div');
    this._popoverEl.className = 'flowbite-datepicker-popover hidden';
    document.body.appendChild(this._popoverEl);
  }

  _positionPopover() {
    if (!this._popoverEl || !this._datepickerEl) return;
    const rect = this._datepickerEl.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset || 0;
    const scrollY = window.scrollY || window.pageYOffset || 0;

    let top = rect.bottom + scrollY + 6;
    let left = rect.left + scrollX;

    const orientation = String(this._options.orientation).toLowerCase();
    if (orientation.includes('top')) {
      top = rect.top + scrollY - this._popoverEl.offsetHeight - 6;
    }
    if (orientation.includes('right')) {
      left = rect.right + scrollX - this._popoverEl.offsetWidth;
    }

    this._popoverEl.style.top = `${Math.max(0, top)}px`;
    this._popoverEl.style.left = `${Math.max(0, left)}px`;
  }

  _renderCalendar() {
    if (!this._popoverEl) return;
    const year = this._viewDate.getFullYear();
    const month = this._viewDate.getMonth();

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const minD = this._options.minDate ? parseFlowbiteDate(this._options.minDate, this._options.format) : null;
    const maxD = this._options.maxDate ? parseFlowbiteDate(this._options.maxDate, this._options.format) : null;

    let titleHtml = '';
    if (this._options.title) {
      titleHtml = `<div class="p-2 mb-2 text-center font-semibold text-sm text-heading border-b border-default-medium">${this._options.title}</div>`;
    }

    let buttonsHtml = '';
    if (this._options.buttons) {
      buttonsHtml = `
      <div class="flex items-center justify-between mt-3 pt-2 border-t border-default-medium">
        <button type="button" data-dp-action="today" class="text-xs font-semibold text-fg-brand hover:text-brand-strong px-2 py-1 rounded hover:bg-brand-softer">Today</button>
        <button type="button" data-dp-action="clear" class="text-xs font-semibold text-body hover:text-heading px-2 py-1 rounded hover:bg-neutral-secondary-medium">Clear</button>
      </div>`;
    }

    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthTotalDays = new Date(year, month, 0).getDate();

    let cellsHtml = '';

    for (let i = firstDay - 1; i >= 0; i--) {
      const dNum = prevMonthTotalDays - i;
      cellsHtml += `<div class="flowbite-datepicker-cell muted" data-dp-date="${year}-${month}-${dNum}">${dNum}</div>`;
    }

    const today = new Date();
    for (let d = 1; d <= totalDays; d++) {
      const cellDate = new Date(year, month, d);
      const isToday = cellDate.toDateString() === today.toDateString();
      const isSelected = this._selectedDate && cellDate.toDateString() === this._selectedDate.toDateString();

      let disabled = false;
      if (minD && cellDate < minD) disabled = true;
      if (maxD && cellDate > maxD) disabled = true;

      const classes = [
        'flowbite-datepicker-cell',
        isToday ? 'today' : '',
        isSelected ? 'selected' : '',
        disabled ? 'disabled' : '',
      ].filter(Boolean).join(' ');

      cellsHtml += `<div class="${classes}" data-dp-day="${d}">${d}</div>`;
    }

    const remaining = 42 - (firstDay + totalDays);
    for (let n = 1; n <= remaining; n++) {
      cellsHtml += `<div class="flowbite-datepicker-cell muted">${n}</div>`;
    }

    this._popoverEl.innerHTML = `
      ${titleHtml}
      <div class="flex items-center justify-between mb-2">
        <button type="button" data-dp-nav="prev" class="p-1.5 rounded-base text-body hover:bg-neutral-secondary-medium hover:text-heading">
          ${DATEPICKER_SVGS.prev}
        </button>
        <div class="text-sm font-semibold text-heading">${monthNames[month]} ${year}</div>
        <button type="button" data-dp-nav="next" class="p-1.5 rounded-base text-body hover:bg-neutral-secondary-medium hover:text-heading">
          ${DATEPICKER_SVGS.next}
        </button>
      </div>
      <div class="flowbite-datepicker-grid mb-1 text-xs font-medium text-body">
        <div>Su</div><div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div>
      </div>
      <div class="flowbite-datepicker-grid">
        ${cellsHtml}
      </div>
      ${buttonsHtml}
    `;

    this._popoverEl.querySelectorAll('[data-dp-nav]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dir = btn.getAttribute('data-dp-nav');
        if (dir === 'prev') {
          this._viewDate.setMonth(this._viewDate.getMonth() - 1);
        } else {
          this._viewDate.setMonth(this._viewDate.getMonth() + 1);
        }
        this._renderCalendar();
      });
    });

    this._popoverEl.querySelectorAll('[data-dp-day]').forEach((cell) => {
      cell.addEventListener('click', (e) => {
        e.stopPropagation();
        if (cell.classList.contains('disabled')) return;
        const day = parseInt(cell.getAttribute('data-dp-day'), 10);
        const newDate = new Date(this._viewDate.getFullYear(), this._viewDate.getMonth(), day);
        this.setDate(newDate);

        if (this._options.autohide) {
          this.hide();
        }
      });
    });

    const todayBtn = this._popoverEl.querySelector('[data-dp-action="today"]');
    if (todayBtn) {
      todayBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setDate(new Date());
        if (this._options.autohide) this.hide();
      });
    }

    const clearBtn = this._popoverEl.querySelector('[data-dp-action="clear"]');
    if (clearBtn) {
      clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setDate(null);
        if (this._options.autohide) this.hide();
      });
    }
  }

  getDatepickerInstance() {
    return this;
  }

  updateOnShow(callback) {
    this._options.onShow = callback;
  }

  updateOnHide(callback) {
    this._options.onHide = callback;
  }

  destroy() {
    if (this._datepickerEl) {
      this._datepickerEl.removeEventListener('focus', this._focusHandler);
      this._datepickerEl.removeEventListener('click', this._clickHandler);
      delete this._datepickerEl._fbDatepickerInstance;
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('click', this._docClickHandler);
    }
    if (this._popoverEl && this._popoverEl.parentNode) {
      this._popoverEl.parentNode.removeChild(this._popoverEl);
    }
  }
}

/**
 * Flowbite DateRangePicker class component.
 */
export class DateRangePicker {
  /**
   * @param {HTMLElement} rangePickerEl
   * @param {Object} [options={}]
   * @param {Object} [instanceOptions={}]
   */
  constructor(rangePickerEl, options = {}, instanceOptions = {}) {
    this._rangePickerEl = rangePickerEl;
    this._options = options;
    this._instanceOptions = instanceOptions;

    this._startInput = rangePickerEl ? rangePickerEl.querySelector('input[name="start"], input:first-of-type') : null;
    this._endInput = rangePickerEl ? rangePickerEl.querySelector('input[name="end"], input:last-of-type') : null;

    this.startDatepicker = this._startInput ? new Datepicker(this._startInput, { ...options, rangePicker: true }) : null;
    this.endDatepicker = this._endInput ? new Datepicker(this._endInput, { ...options, rangePicker: true }) : null;
  }

  getDates() {
    return [
      this.startDatepicker ? this.startDatepicker.getDate() : undefined,
      this.endDatepicker ? this.endDatepicker.getDate() : undefined,
    ];
  }

  setDates(startDate, endDate) {
    if (this.startDatepicker) this.startDatepicker.setDate(startDate);
    if (this.endDatepicker) this.endDatepicker.setDate(endDate);
  }

  destroy() {
    if (this.startDatepicker) this.startDatepicker.destroy();
    if (this.endDatepicker) this.endDatepicker.destroy();
  }
}

/**
 * Automatically initializes datepickers and date range pickers in root.
 * @param {HTMLElement|Document} [root=document]
 */
export function initDatepickers(root = document) {
  if (typeof document === 'undefined' || !root || !root.querySelectorAll) return;

  const singlePickers = Array.from(root.querySelectorAll('[datepicker], [data-datepicker]'));
  singlePickers.forEach((el) => {
    if (el.dataset.fbDatepickerBound || el.closest('[date-rangepicker], [data-date-rangepicker]')) return;
    el.dataset.fbDatepickerBound = 'true';
    const dp = new Datepicker(el);
    el._fbDatepickerInstance = dp;
  });

  const rangePickers = Array.from(root.querySelectorAll('[date-rangepicker], [data-date-rangepicker]'));
  rangePickers.forEach((el) => {
    if (el.dataset.fbRangePickerBound) return;
    el.dataset.fbRangePickerBound = 'true';
    const drp = new DateRangePicker(el);
    el._fbRangePickerInstance = drp;
  });
}

/**
 * Generates markup for a single Flowbite Datepicker input.
 *
 * @param {Object} options
 * @param {string} [options.id='default-datepicker']
 * @param {string} [options.placeholder='Select date']
 * @param {boolean} [options.autohide=false]
 * @param {boolean} [options.buttons=false]
 * @param {boolean} [options.autoSelectToday=false]
 * @param {string} [options.format]
 * @param {string} [options.minDate]
 * @param {string} [options.maxDate]
 * @param {string} [options.orientation]
 * @param {string} [options.title]
 * @returns {string} HTML markup
 */
export function renderFlowbiteDatepicker(options = {}) {
  const {
    id = 'default-datepicker',
    placeholder = 'Select date',
    autohide = false,
    buttons = false,
    autoSelectToday = false,
    format = null,
    minDate = null,
    maxDate = null,
    orientation = null,
    title = null,
  } = options;

  const attrs = ['datepicker'];
  if (autohide) attrs.push('datepicker-autohide');
  if (buttons) attrs.push('datepicker-buttons');
  if (autoSelectToday) attrs.push('datepicker-autoselect-today');
  if (format) attrs.push(`datepicker-format="${format}"`);
  if (minDate) attrs.push(`datepicker-min-date="${minDate}"`);
  if (maxDate) attrs.push(`datepicker-max-date="${maxDate}"`);
  if (orientation) attrs.push(`datepicker-orientation="${orientation}"`);
  if (title) attrs.push(`datepicker-title="${title}"`);

  return `
<div class="relative max-w-sm">
  <div class="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
    ${DATEPICKER_SVGS.calendar}
  </div>
  <input id="${id}" type="text" class="block w-full ps-9 pe-3 py-2.5 bg-neutral-secondary-medium border border-default-medium text-heading text-sm rounded-base focus:ring-brand focus:border-brand px-3 py-2.5 shadow-xs placeholder:text-body" placeholder="${placeholder}" ${attrs.join(' ')}>
</div>`.trim();
}

/**
 * Generates markup for a Flowbite Date Range Picker.
 *
 * @param {Object} options
 * @param {string} [options.id='date-range-picker']
 * @param {string} [options.startId='datepicker-range-start']
 * @param {string} [options.endId='datepicker-range-end']
 * @param {string} [options.startPlaceholder='Select date start']
 * @param {string} [options.endPlaceholder='Select date end']
 * @returns {string} HTML markup
 */
export function renderFlowbiteDateRangePicker(options = {}) {
  const {
    id = 'date-range-picker',
    startId = 'datepicker-range-start',
    endId = 'datepicker-range-end',
    startPlaceholder = 'Select date start',
    endPlaceholder = 'Select date end',
  } = options;

  return `
<div id="${id}" date-rangepicker class="flex items-center">
  <div class="relative">
    <div class="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
        ${DATEPICKER_SVGS.calendar}
    </div>
    <input id="${startId}" name="start" type="text" class="block w-full ps-9 pe-3 py-2.5 bg-neutral-secondary-medium border border-default-medium text-heading text-sm rounded-base focus:ring-brand focus:border-brand px-3 py-2.5 shadow-xs placeholder:text-body" placeholder="${startPlaceholder}">
  </div>
  <span class="mx-4 text-body">to</span>
  <div class="relative">
    <div class="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
        ${DATEPICKER_SVGS.calendar}
    </div>
    <input id="${endId}" name="end" type="text" class="block w-full ps-9 pe-3 py-2.5 bg-neutral-secondary-medium border border-default-medium text-heading text-sm rounded-base focus:ring-brand focus:border-brand px-3 py-2.5 shadow-xs placeholder:text-body" placeholder="${endPlaceholder}">
  </div>
</div>`.trim();
}

/**
 * Generates markup for a Flowbite Timepicker input.
 *
 * @param {Object} options
 * @param {string} [options.id='time']
 * @param {string} [options.label='Select time:']
 * @param {string} [options.min='09:00']
 * @param {string} [options.max='18:00']
 * @param {string} [options.value='00:00']
 * @returns {string} HTML markup
 */
export function renderFlowbiteTimepicker(options = {}) {
  const {
    id = 'time',
    label = 'Select time:',
    min = '09:00',
    max = '18:00',
    value = '00:00',
  } = options;

  return `
<form class="max-w-[8rem] mx-auto">
    <label for="${id}" class="block mb-2 text-sm font-medium text-heading">${label}</label>
    <div class="relative">
        <div class="absolute inset-y-0 end-0 top-0 flex items-center pe-3.5 pointer-events-none">
            ${DATEPICKER_SVGS.clock}
        </div>
        <input type="time" id="${id}" class="block w-full px-3 py-2.5 bg-neutral-secondary-medium border border-default-medium text-heading text-sm rounded-base focus:ring-brand focus:border-brand shadow-xs placeholder:text-body" min="${min}" max="${max}" value="${value}" required />
    </div>
</form>`.trim();
}

/**
 * Renders the complete Flowbite Datepicker showcase containing all 9 official sections.
 *
 * @returns {string} HTML markup
 */
export function renderFlowbiteDatepickerShowcase() {
  return `
<div class="flowbite-datepicker-showcase space-y-8 p-4">
  <!-- 1. Datepicker example -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Datepicker Example</h4>
    <div class="relative max-w-sm">
      <div class="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
        ${DATEPICKER_SVGS.calendar}
      </div>
      <input datepicker id="default-datepicker" type="text" class="block w-full ps-9 pe-3 py-2.5 bg-neutral-secondary-medium border border-default-medium text-heading text-sm rounded-base focus:ring-brand focus:border-brand px-3 py-2.5 shadow-xs placeholder:text-body" placeholder="Select date">
    </div>
  </div>

  <!-- 2. Date range picker -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Date Range Picker</h4>
    <div id="date-range-picker" date-rangepicker class="flex items-center">
      <div class="relative">
        <div class="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
            ${DATEPICKER_SVGS.calendar}
        </div>
        <input id="datepicker-range-start" name="start" type="text" class="block w-full ps-9 pe-3 py-2.5 bg-neutral-secondary-medium border border-default-medium text-heading text-sm rounded-base focus:ring-brand focus:border-brand px-3 py-2.5 shadow-xs placeholder:text-body" placeholder="Select date start">
      </div>
      <span class="mx-4 text-body">to</span>
      <div class="relative">
        <div class="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
            ${DATEPICKER_SVGS.calendar}
        </div>
        <input id="datepicker-range-end" name="end" type="text" class="block w-full ps-9 pe-3 py-2.5 bg-neutral-secondary-medium border border-default-medium text-heading text-sm rounded-base focus:ring-brand focus:border-brand px-3 py-2.5 shadow-xs placeholder:text-body" placeholder="Select date end">
      </div>
    </div>
  </div>

  <!-- 3. Autohide -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Autohide</h4>
    <div class="relative max-w-sm">
      <div class="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
            ${DATEPICKER_SVGS.calendar}
      </div>
      <input id="datepicker-autohide" datepicker datepicker-autohide type="text" class="block w-full ps-9 pe-3 py-2.5 bg-neutral-secondary-medium border border-default-medium text-heading text-sm rounded-base focus:ring-brand focus:border-brand px-3 py-2.5 shadow-xs placeholder:text-body" placeholder="Select date">
    </div>
  </div>

  <!-- 4. Action buttons -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Action Buttons</h4>
    <div class="relative max-w-sm">
      <div class="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
            ${DATEPICKER_SVGS.calendar}
      </div>
      <input id="datepicker-actions" datepicker datepicker-buttons datepicker-autoselect-today type="text" class="block w-full ps-9 pe-3 py-2.5 bg-neutral-secondary-medium border border-default-medium text-heading text-sm rounded-base focus:ring-brand focus:border-brand px-3 py-2.5 shadow-xs placeholder:text-body" placeholder="Select date">
    </div>
  </div>

  <!-- 5. Date format -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Date Format (mm-dd-yyyy)</h4>
    <div class="relative max-w-sm">
      <div class="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
            ${DATEPICKER_SVGS.calendar}
      </div>
      <input id="datepicker-format" datepicker datepicker-format="mm-dd-yyyy" type="text" class="block w-full ps-9 pe-3 py-2.5 bg-neutral-secondary-medium border border-default-medium text-heading text-sm rounded-base focus:ring-brand focus:border-brand px-3 py-2.5 shadow-xs placeholder:text-body" placeholder="Select date">
    </div>
  </div>

  <!-- 6. Max and min dates -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Max and Min Dates</h4>
    <div class="relative max-w-sm">
      <div class="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
            ${DATEPICKER_SVGS.calendar}
      </div>
      <input id="datepicker-minmax" datepicker datepicker-min-date="06/04/2024" datepicker-max-date="05/05/2025" type="text" class="block w-full ps-9 pe-3 py-2.5 bg-neutral-secondary-medium border border-default-medium text-heading text-sm rounded-base focus:ring-brand focus:border-brand px-3 py-2.5 shadow-xs placeholder:text-body" placeholder="Select date">
    </div>
  </div>

  <!-- 7. Orientation -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Orientation (bottom right)</h4>
    <div class="relative max-w-sm">
      <div class="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
            ${DATEPICKER_SVGS.calendar}
      </div>
      <input id="datepicker-orientation" datepicker datepicker-orientation="bottom right" type="text" class="block w-full ps-9 pe-3 py-2.5 bg-neutral-secondary-medium border border-default-medium text-heading text-sm rounded-base focus:ring-brand focus:border-brand px-3 py-2.5 shadow-xs placeholder:text-body" placeholder="Select date">
    </div>
  </div>

  <!-- 8. Title -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Title</h4>
    <div class="relative max-w-sm">
      <div class="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
            ${DATEPICKER_SVGS.calendar}
      </div>
      <input id="datepicker-title" datepicker datepicker-title="Flowbite datepicker" type="text" class="block w-full ps-9 pe-3 py-2.5 bg-neutral-secondary-medium border border-default-medium text-heading text-sm rounded-base focus:ring-brand focus:border-brand px-3 py-2.5 shadow-xs placeholder:text-body" placeholder="Select date">
    </div>
  </div>

  <!-- 9. Timepicker -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-3">Timepicker</h4>
    <form class="max-w-[8rem] mx-auto">
        <label for="time" class="block mb-2 text-sm font-medium text-heading">Select time:</label>
        <div class="relative">
            <div class="absolute inset-y-0 end-0 top-0 flex items-center pe-3.5 pointer-events-none">
                ${DATEPICKER_SVGS.clock}
            </div>
            <input type="time" id="time" class="block w-full px-3 py-2.5 bg-neutral-secondary-medium border border-default-medium text-heading text-sm rounded-base focus:ring-brand focus:border-brand shadow-xs placeholder:text-body" min="09:00" max="18:00" value="00:00" required />
        </div>
    </form>
  </div>
</div>
  `.trim();
}

// ─── Flowbite Device Mockups ──────────────────────────────────────────────────
const MOCKUP_IMAGES = {
  phone1Light: 'https://flowbite.s3.amazonaws.com/blocks/marketing-ui/hero/mockup-1-light.png',
  phone1Dark: 'https://flowbite.s3.amazonaws.com/blocks/marketing-ui/hero/mockup-1-dark.png',
  phone2Light: 'https://flowbite.s3.amazonaws.com/blocks/marketing-ui/hero/mockup-2-light.png',
  phone2Dark: 'https://flowbite.s3.amazonaws.com/blocks/marketing-ui/hero/mockup-2-dark.png',
  tabletLight: 'https://flowbite.s3.amazonaws.com/docs/device-mockups/tablet-mockup-image.png',
  tabletDark: 'https://flowbite.s3.amazonaws.com/docs/device-mockups/tablet-mockup-image-dark.png',
  laptopLight: 'https://flowbite.s3.amazonaws.com/docs/device-mockups/laptop-screen.png',
  laptopDark: 'https://flowbite.s3.amazonaws.com/docs/device-mockups/laptop-screen-dark.png',
  desktopLight: 'https://flowbite.s3.amazonaws.com/docs/device-mockups/screen-image-imac.png',
  desktopDark: 'https://flowbite.s3.amazonaws.com/docs/device-mockups/screen-image-imac-dark.png',
  watchLight: 'https://flowbite.s3.amazonaws.com/docs/device-mockups/watch-screen-image.png',
  watchDark: 'https://flowbite.s3.amazonaws.com/docs/device-mockups/watch-screen-image-dark.png',
};

/**
 * Generates markup for a Phone Mockup (supports Default, iPhone 12 iOS, Google Pixel Android, or Custom Colors).
 *
 * @param {Object} options
 * @param {'default'|'iphone'|'android'|'colors'} [options.variant='default']
 * @param {string} [options.lightImage]
 * @param {string} [options.darkImage]
 * @param {string} [options.alt='']
 * @param {string} [options.slotContent]
 * @param {string} [options.colorClass='bg-base']
 * @returns {string} HTML markup
 */
export function renderFlowbitePhoneMockup(options = {}) {
  const {
    variant = 'default',
    lightImage,
    darkImage,
    alt = '',
    slotContent,
    colorClass = 'bg-base',
  } = options;

  const defaultLight = variant === 'iphone' ? MOCKUP_IMAGES.phone2Light : MOCKUP_IMAGES.phone1Light;
  const defaultDark = variant === 'iphone' ? MOCKUP_IMAGES.phone2Dark : MOCKUP_IMAGES.phone1Dark;

  const lightImg = lightImage || defaultLight;
  const darkImg = darkImage || defaultDark;

  const contentHtml = slotContent || `
        <img src="${lightImg}" class="dark:hidden w-[272px] h-[572px]" alt="${alt}">
        <img src="${darkImg}" class="hidden dark:block w-[272px] h-[572px]" alt="${alt}">
  `.trim();

  if (variant === 'iphone') {
    return `
<div class="relative mx-auto border-default ${colorClass} border-[14px] rounded-[2.5rem] h-[600px] w-[300px] shadow-xl">
    <div class="w-[148px] h-[18px] bg-base top-0 rounded-b-[1rem] left-1/2 -translate-x-1/2 absolute"></div>
    <div class="h-[46px] w-[3px] bg-base absolute -start-[17px] top-[124px] rounded-s-lg"></div>
    <div class="h-[46px] w-[3px] bg-base absolute -start-[17px] top-[178px] rounded-s-lg"></div>
    <div class="h-[64px] w-[3px] bg-base absolute -end-[17px] top-[142px] rounded-e-lg"></div>
    <div class="rounded-[2rem] overflow-hidden w-[272px] h-[572px] bg-neutral-primary ">
        ${contentHtml}
    </div>
</div>`.trim();
  }

  if (variant === 'android') {
    return `
<div class="relative mx-auto border-default ${colorClass} border-[14px] rounded-xl h-[600px] w-[300px] shadow-xl">
    <div class="w-[148px] h-[18px] bg-base top-0 rounded-b-[1rem] left-1/2 -translate-x-1/2 absolute"></div>
    <div class="h-[32px] w-[3px] bg-base absolute -start-[17px] top-[72px] rounded-s-lg"></div>
    <div class="h-[46px] w-[3px] bg-base absolute -start-[17px] top-[124px] rounded-s-lg"></div>
    <div class="h-[46px] w-[3px] bg-base absolute -start-[17px] top-[178px] rounded-s-lg"></div>
    <div class="h-[64px] w-[3px] bg-base absolute -end-[17px] top-[142px] rounded-e-lg"></div>
    <div class="rounded-xl overflow-hidden w-[272px] h-[572px] bg-neutral-primary ">
        ${contentHtml}
    </div>
</div>`.trim();
  }

  if (variant === 'colors') {
    return `
<div class="relative mx-auto border-default bg-base dark:bg-base border-[14px] rounded-[2.5rem] h-[600px] w-[300px]">
    <div class="h-[32px] w-[3px] bg-base absolute -start-[17px] top-[72px] rounded-s-lg"></div>
    <div class="h-[46px] w-[3px] bg-base absolute -start-[17px] top-[124px] rounded-s-lg"></div>
    <div class="h-[46px] w-[3px] bg-base absolute -start-[17px] top-[178px] rounded-s-lg"></div>
    <div class="h-[64px] w-[3px] bg-base absolute -end-[17px] top-[142px] rounded-e-lg"></div>
    <div class="rounded-[2rem] overflow-hidden w-[272px] h-[572px] bg-neutral-primary ">
        ${contentHtml}
    </div>
</div>`.trim();
  }

  // Default phone mockup
  return `
<div class="relative mx-auto border-default ${colorClass} border-[14px] rounded-[2.5rem] h-[600px] w-[300px]">
    <div class="h-[32px] w-[3px] bg-base absolute -start-[17px] top-[72px] rounded-s-lg"></div>
    <div class="h-[46px] w-[3px] bg-base absolute -start-[17px] top-[124px] rounded-s-lg"></div>
    <div class="h-[46px] w-[3px] bg-base absolute -start-[17px] top-[178px] rounded-s-lg"></div>
    <div class="h-[64px] w-[3px] bg-base absolute -end-[17px] top-[142px] rounded-e-lg"></div>
    <div class="rounded-[2rem] overflow-hidden w-[272px] h-[572px] bg-neutral-primary ">
        ${contentHtml}
    </div>
</div>`.trim();
}

/**
 * Generates markup for a Tablet Mockup.
 *
 * @param {Object} options
 * @param {string} [options.lightImage]
 * @param {string} [options.darkImage]
 * @param {string} [options.alt='']
 * @param {string} [options.slotContent]
 * @param {string} [options.colorClass='bg-base']
 * @returns {string} HTML markup
 */
export function renderFlowbiteTabletMockup(options = {}) {
  const {
    lightImage = MOCKUP_IMAGES.tabletLight,
    darkImage = MOCKUP_IMAGES.tabletDark,
    alt = '',
    slotContent,
    colorClass = 'bg-base',
  } = options;

  const contentHtml = slotContent || `
        <img src="${lightImage}" class="dark:hidden h-[426px] md:h-[654px]" alt="${alt}">
        <img src="${darkImage}" class="hidden dark:block h-[426px] md:h-[654px]" alt="${alt}">
  `.trim();

  return `
<div class="relative mx-auto border-default ${colorClass} border-[14px] rounded-[2.5rem] h-[454px] max-w-[341px] md:h-[682px] md:max-w-[512px]">
    <div class="h-[32px] w-[3px] bg-base absolute -start-[17px] top-[72px] rounded-s-lg"></div>
    <div class="h-[46px] w-[3px] bg-base absolute -start-[17px] top-[124px] rounded-s-lg"></div>
    <div class="h-[46px] w-[3px] bg-base absolute -start-[17px] top-[178px] rounded-s-lg"></div>
    <div class="h-[64px] w-[3px] bg-base absolute -end-[17px] top-[142px] rounded-e-lg"></div>
    <div class="rounded-[2rem] overflow-hidden h-[426px] md:h-[654px] bg-neutral-primary ">
        ${contentHtml}
    </div>
</div>`.trim();
}

/**
 * Generates markup for a Laptop Mockup.
 *
 * @param {Object} options
 * @param {string} [options.lightImage]
 * @param {string} [options.darkImage]
 * @param {string} [options.alt='']
 * @param {string} [options.slotContent]
 * @param {string} [options.colorClass='bg-base']
 * @returns {string} HTML markup
 */
export function renderFlowbiteLaptopMockup(options = {}) {
  const {
    lightImage = MOCKUP_IMAGES.laptopLight,
    darkImage = MOCKUP_IMAGES.laptopDark,
    alt = '',
    slotContent,
    colorClass = 'bg-base',
  } = options;

  const contentHtml = slotContent || `
        <img src="${lightImage}" class="dark:hidden h-[156px] md:h-[278px] w-full rounded-lg" alt="${alt}">
        <img src="${darkImage}" class="hidden dark:block h-[156px] md:h-[278px] w-full rounded-lg" alt="${alt}">
  `.trim();

  return `
<div class="relative mx-auto border-default ${colorClass} border-[8px] rounded-t-xl h-[172px] max-w-[301px] md:h-[294px] md:max-w-[512px]">
    <div class="rounded-lg overflow-hidden h-[156px] md:h-[278px] bg-neutral-primary ">
        ${contentHtml}
    </div>
</div>
<div class="relative mx-auto bg-base rounded-b-xl rounded-t-sm h-[17px] max-w-[351px] md:h-[21px] md:max-w-[597px]">
    <div class="absolute left-1/2 top-0 -translate-x-1/2 rounded-b-xl w-[56px] h-[5px] md:w-[96px] md:h-[8px] bg-base"></div>
</div>`.trim();
}

/**
 * Generates markup for a Desktop Mockup (iMac style).
 *
 * @param {Object} options
 * @param {string} [options.lightImage]
 * @param {string} [options.darkImage]
 * @param {string} [options.alt='']
 * @param {string} [options.slotContent]
 * @param {string} [options.colorClass='bg-base']
 * @returns {string} HTML markup
 */
export function renderFlowbiteDesktopMockup(options = {}) {
  const {
    lightImage = MOCKUP_IMAGES.desktopLight,
    darkImage = MOCKUP_IMAGES.desktopDark,
    alt = '',
    slotContent,
    colorClass = 'bg-base',
  } = options;

  const contentHtml = slotContent || `
        <img src="${lightImage}" class="dark:hidden h-[140px] md:h-[262px] w-full rounded-xl" alt="${alt}">
        <img src="${darkImage}" class="hidden dark:block h-[140px] md:h-[262px] w-full rounded-xl" alt="${alt}">
  `.trim();

  return `
<div class="relative mx-auto border-default ${colorClass} border-[16px] rounded-t-xl h-[172px] max-w-[301px] md:h-[294px] md:max-w-[512px]">
    <div class="rounded-xl overflow-hidden h-[140px] md:h-[262px]">
        ${contentHtml}
    </div>
</div>
<div class="relative mx-auto bg-base rounded-b-xl h-[24px] max-w-[301px] md:h-[42px] md:max-w-[512px]"></div>
<div class="relative mx-auto bg-base rounded-b-xl h-[55px] max-w-[83px] md:h-[95px] md:max-w-[142px]"></div>`.trim();
}

/**
 * Generates markup for a Smartwatch Mockup.
 *
 * @param {Object} options
 * @param {string} [options.lightImage]
 * @param {string} [options.darkImage]
 * @param {string} [options.alt='']
 * @param {string} [options.slotContent]
 * @param {string} [options.colorClass='bg-base']
 * @returns {string} HTML markup
 */
export function renderFlowbiteSmartwatchMockup(options = {}) {
  const {
    lightImage = MOCKUP_IMAGES.watchLight,
    darkImage = MOCKUP_IMAGES.watchDark,
    alt = '',
    slotContent,
    colorClass = 'bg-base',
  } = options;

  const contentHtml = slotContent || `
        <img src="${lightImage}" class="dark:hidden h-[193px] w-[188px]" alt="${alt}">
        <img src="${darkImage}" class="hidden dark:block h-[193px] w-[188px]" alt="${alt}">
  `.trim();

  return `
<div class="relative mx-auto bg-base rounded-t-[2.5rem] h-[63px] max-w-[133px]"></div>
<div class="relative mx-auto ${colorClass} border-default border-[10px] rounded-[2.5rem] h-[213px] w-[208px]">
    <div class="h-[41px] w-[6px] bg-base absolute -end-[16px] top-[40px] rounded-e-lg"></div>
    <div class="h-[32px] w-[6px] bg-base absolute -end-[16px] top-[88px] rounded-e-lg"></div>
    <div class="rounded-[2rem] overflow-hidden h-[193px] w-[188px]">
        ${contentHtml}
    </div>
</div>
<div class="relative mx-auto bg-base rounded-b-[2.5rem] h-[63px] max-w-[133px]"></div>`.trim();
}

/**
 * Unified Flowbite Device Mockup dispatcher function.
 *
 * @param {Object} options
 * @param {'default'|'iphone'|'android'|'tablet'|'laptop'|'desktop'|'smartwatch'|'colors'} [options.device='default']
 * @returns {string} HTML markup
 */
export function renderFlowbiteDeviceMockup(options = {}) {
  const device = options.device || options.type || options.variant || 'default';
  switch (device) {
    case 'iphone':
      return renderFlowbitePhoneMockup({ ...options, variant: 'iphone' });
    case 'android':
      return renderFlowbitePhoneMockup({ ...options, variant: 'android' });
    case 'colors':
      return renderFlowbitePhoneMockup({ ...options, variant: 'colors' });
    case 'tablet':
      return renderFlowbiteTabletMockup(options);
    case 'laptop':
      return renderFlowbiteLaptopMockup(options);
    case 'desktop':
      return renderFlowbiteDesktopMockup(options);
    case 'smartwatch':
      return renderFlowbiteSmartwatchMockup(options);
    case 'default':
    default:
      return renderFlowbitePhoneMockup({ ...options, variant: 'default' });
  }
}

/**
 * Renders the complete Flowbite Device Mockups showcase featuring all 8 official examples.
 *
 * @returns {string} HTML markup
 */
export function renderFlowbiteDeviceMockupShowcase() {
  return `
<div class="flowbite-device-mockups-showcase space-y-12 p-4">
  <!-- 1. Default mockup -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-4">Default Mockup (Phone)</h4>
    <div class="p-4 bg-neutral-secondary-medium rounded-base border border-default">
      ${renderFlowbitePhoneMockup({ variant: 'default' })}
    </div>
  </div>

  <!-- 2. iPhone 12 mockup (iOS) -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-4">iPhone 12 Mockup (iOS)</h4>
    <div class="p-4 bg-neutral-secondary-medium rounded-base border border-default">
      ${renderFlowbitePhoneMockup({ variant: 'iphone' })}
    </div>
  </div>

  <!-- 3. Google Pixel (Android) -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-4">Google Pixel (Android)</h4>
    <div class="p-4 bg-neutral-secondary-medium rounded-base border border-default">
      ${renderFlowbitePhoneMockup({ variant: 'android' })}
    </div>
  </div>

  <!-- 4. Tablet mockup -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-4">Tablet Mockup</h4>
    <div class="p-4 bg-neutral-secondary-medium rounded-base border border-default overflow-x-auto">
      ${renderFlowbiteTabletMockup()}
    </div>
  </div>

  <!-- 5. Laptop mockup -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-4">Laptop Mockup</h4>
    <div class="p-4 bg-neutral-secondary-medium rounded-base border border-default overflow-x-auto">
      ${renderFlowbiteLaptopMockup()}
    </div>
  </div>

  <!-- 6. Desktop mockup -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-4">Desktop Mockup</h4>
    <div class="p-4 bg-neutral-secondary-medium rounded-base border border-default overflow-x-auto">
      ${renderFlowbiteDesktopMockup()}
    </div>
  </div>

  <!-- 7. Smartwatch mockup -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-4">Smartwatch Mockup</h4>
    <div class="p-4 bg-neutral-secondary-medium rounded-base border border-default">
      ${renderFlowbiteSmartwatchMockup()}
    </div>
  </div>

  <!-- 8. Mockup colors -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-4">Mockup Colors</h4>
    <div class="p-4 bg-neutral-secondary-medium rounded-base border border-default">
      ${renderFlowbitePhoneMockup({ variant: 'colors' })}
    </div>
  </div>
</div>
  `.trim();
}

// ─── Flowbite Drawer (Offcanvas) ──────────────────────────────────────────────
const DRAWER_CLOSE_SVG = `<svg class="w-5 h-5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 17.94 6M18 18 6.06 6"/></svg>`;

/**
 * Flowbite Drawer (off-canvas) class component.
 */
export class Drawer {
  /**
   * @param {HTMLElement} targetEl
   * @param {Object} [options={}]
   * @param {Object} [instanceOptions={}]
   */
  constructor(targetEl, options = {}, instanceOptions = {}) {
    this._targetEl = targetEl;
    this._options = {
      placement: options.placement || targetEl?.getAttribute('data-drawer-placement') || 'left',
      backdrop: options.backdrop !== undefined ? options.backdrop : (targetEl?.getAttribute('data-drawer-backdrop') !== 'false'),
      bodyScrolling: options.bodyScrolling !== undefined ? options.bodyScrolling : (targetEl?.getAttribute('data-drawer-body-scrolling') === 'true'),
      edge: options.edge !== undefined ? options.edge : (targetEl?.getAttribute('data-drawer-edge') === 'true'),
      edgeOffset: options.edgeOffset || targetEl?.getAttribute('data-drawer-edge-offset') || 'bottom-[60px]',
      backdropClasses: options.backdropClasses || 'bg-gray-900/50 dark:bg-gray-900/80 fixed inset-0 z-30',
      onHide: options.onHide || (() => {}),
      onShow: options.onShow || (() => {}),
      onToggle: options.onToggle || (() => {}),
      ...options,
    };
    this._instanceOptions = {
      id: instanceOptions.id || (targetEl ? targetEl.id : null),
      override: instanceOptions.override !== undefined ? instanceOptions.override : true,
    };

    this._visible = false;
    this._backdropEl = null;

    if (this._targetEl) {
      this._targetEl._fbDrawerInstance = this;
    }
  }

  show() {
    if (this._visible) return;
    this._visible = true;

    if (this._targetEl) {
      const placement = this._options.placement;

      // Handle translation classes
      if (placement === 'left') {
        this._targetEl.classList.remove('-translate-x-full');
        this._targetEl.classList.add('transform-none');
      } else if (placement === 'right') {
        this._targetEl.classList.remove('translate-x-full');
        this._targetEl.classList.add('transform-none');
      } else if (placement === 'top') {
        this._targetEl.classList.remove('-translate-y-full');
        this._targetEl.classList.add('transform-none');
      } else if (placement === 'bottom') {
        if (this._options.edge) {
          this._targetEl.classList.remove('translate-y-full');
          this._targetEl.classList.remove('bottom-[60px]');
          this._targetEl.classList.add('transform-none', 'bottom-0');
        } else {
          this._targetEl.classList.remove('translate-y-full');
          this._targetEl.classList.add('transform-none');
        }
      }

      this._targetEl.setAttribute('aria-hidden', 'false');
      this._targetEl.setAttribute('aria-modal', 'true');
      if (typeof this._targetEl.focus === 'function') {
        this._targetEl.focus();
      }
    }

    // Body scrolling
    if (!this._options.bodyScrolling && typeof document !== 'undefined') {
      this._prevBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }

    // Backdrop
    if (this._options.backdrop && typeof document !== 'undefined') {
      this._createBackdrop();
    }

    if (typeof this._options.onShow === 'function') {
      this._options.onShow(this);
    }
  }

  hide() {
    if (!this._visible) return;
    this._visible = false;

    if (this._targetEl) {
      const placement = this._options.placement;

      if (placement === 'left') {
        this._targetEl.classList.remove('transform-none');
        this._targetEl.classList.add('-translate-x-full');
      } else if (placement === 'right') {
        this._targetEl.classList.remove('transform-none');
        this._targetEl.classList.add('translate-x-full');
      } else if (placement === 'top') {
        this._targetEl.classList.remove('transform-none');
        this._targetEl.classList.add('-translate-y-full');
      } else if (placement === 'bottom') {
        if (this._options.edge) {
          this._targetEl.classList.remove('transform-none', 'bottom-0');
          this._targetEl.classList.add('translate-y-full', 'bottom-[60px]');
        } else {
          this._targetEl.classList.remove('transform-none');
          this._targetEl.classList.add('translate-y-full');
        }
      }

      this._targetEl.setAttribute('aria-hidden', 'true');
    }

    // Restore body scrolling
    if (!this._options.bodyScrolling && typeof document !== 'undefined') {
      document.body.style.overflow = this._prevBodyOverflow || '';
    }

    // Remove backdrop
    if (this._backdropEl && this._backdropEl.parentNode) {
      this._backdropEl.parentNode.removeChild(this._backdropEl);
      this._backdropEl = null;
    }

    if (typeof this._options.onHide === 'function') {
      this._options.onHide(this);
    }
  }

  toggle() {
    if (this._visible) {
      this.hide();
    } else {
      this.show();
    }
    if (typeof this._options.onToggle === 'function') {
      this._options.onToggle(this);
    }
  }

  isVisible() {
    return this._visible;
  }

  _createBackdrop() {
    if (typeof document === 'undefined' || this._backdropEl) return;
    this._backdropEl = document.createElement('div');
    this._backdropEl.className = this._options.backdropClasses;
    this._backdropEl.setAttribute('data-drawer-backdrop-element', 'true');
    this._backdropEl.addEventListener('click', () => {
      this.hide();
    });
    document.body.appendChild(this._backdropEl);
  }

  updateOnShow(callback) {
    this._options.onShow = callback;
  }

  updateOnHide(callback) {
    this._options.onHide = callback;
  }

  updateOnToggle(callback) {
    this._options.onToggle = callback;
  }

  destroy() {
    if (this._visible) {
      this.hide();
    }
    if (this._targetEl) {
      delete this._targetEl._fbDrawerInstance;
    }
  }
}

/**
 * Initializes drawers and triggers matching [data-drawer-show], [data-drawer-hide], [data-drawer-toggle].
 * @param {HTMLElement|Document} [root=document]
 */
export function initDrawers(root = document) {
  if (typeof document === 'undefined' || !root || !root.querySelectorAll) return;

  const getDrawerInstance = (targetId) => {
    const el = document.getElementById(targetId);
    if (!el) return null;
    if (!el._fbDrawerInstance) {
      new Drawer(el);
    }
    return el._fbDrawerInstance;
  };

  root.querySelectorAll('[data-drawer-show]').forEach((btn) => {
    if (btn.dataset.fbDrawerShowBound) return;
    btn.dataset.fbDrawerShowBound = 'true';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetId = btn.getAttribute('data-drawer-show') || btn.getAttribute('data-drawer-target');
      const drawer = getDrawerInstance(targetId);
      if (drawer) drawer.show();
    });
  });

  root.querySelectorAll('[data-drawer-hide]').forEach((btn) => {
    if (btn.dataset.fbDrawerHideBound) return;
    btn.dataset.fbDrawerHideBound = 'true';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetId = btn.getAttribute('data-drawer-hide') || btn.getAttribute('data-drawer-target');
      const drawer = getDrawerInstance(targetId);
      if (drawer) drawer.hide();
    });
  });

  root.querySelectorAll('[data-drawer-toggle]').forEach((btn) => {
    if (btn.dataset.fbDrawerToggleBound) return;
    btn.dataset.fbDrawerToggleBound = 'true';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetId = btn.getAttribute('data-drawer-toggle') || btn.getAttribute('data-drawer-target');
      const drawer = getDrawerInstance(targetId);
      if (drawer) drawer.toggle();
    });
  });

  // Global ESC key listener to dismiss open drawer
  if (!document._fbDrawerEscBound) {
    document._fbDrawerEscBound = true;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const openDrawers = Array.from(document.querySelectorAll('[tabindex="-1"]')).filter(
          (el) => el._fbDrawerInstance && el._fbDrawerInstance.isVisible()
        );
        openDrawers.forEach((el) => el._fbDrawerInstance.hide());
      }
    });
  }
}

/**
 * Generates markup for the Default Flowbite Drawer.
 *
 * @param {Object} options
 * @param {string} [options.id='drawer-example']
 * @param {string} [options.buttonText='Show drawer']
 * @param {string} [options.title='Drawer heading']
 * @returns {string} HTML markup
 */
export function renderFlowbiteDrawer(options = {}) {
  const {
    id = 'drawer-example',
    buttonText = 'Show drawer',
    title = 'Drawer heading',
  } = options;

  return `
<!-- drawer init and toggle -->
<div class="text-center">
   <button class="inline-flex items-center justify-center text-white bg-brand box-border border border-transparent hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none" type="button" data-drawer-target="${id}" data-drawer-show="${id}" aria-controls="${id}">
   ${buttonText}
   </button>
</div>

<!-- drawer component -->
<div id="${id}" class="fixed top-0 left-0 z-40 h-screen p-4 overflow-y-auto transition-transform -translate-x-full bg-neutral-primary-soft w-96 border-e border-default" tabindex="-1" aria-labelledby="${id}-label">
   <div class="border-b border-default pb-4 mb-5 flex items-center">
      <h5 id="${id}-label" class="inline-flex items-center text-lg font-medium text-body">
         <svg class="w-5 h-5 me-1.5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 11h2v5m-2 0h4m-2.592-8.5h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
         ${title}
      </h5>
      <button type="button" data-drawer-hide="${id}" aria-controls="${id}" class="text-body bg-transparent hover:text-heading hover:bg-neutral-tertiary rounded-base w-9 h-9 absolute top-2.5 end-2.5 flex items-center justify-center">
         ${DRAWER_CLOSE_SVG}
         <span class="sr-only">Close menu</span>
      </button>
   </div>
   <p class="mb-3 text-sm text-body">Upgrade your Figma toolkit with a design system built on top <a href="#" class="font-medium text-heading underline hover:no-underline">Flowbite CSS</a> featuring variants, style guide and auto layout.</p>
   <p class="mb-5 text-sm text-body">Recommended for professional developers and companies building enterprise-level.</p>
   <div class="flex items-center gap-4">
      <button type="button" class="text-body bg-neutral-secondary-medium box-border border border-default-medium hover:bg-neutral-tertiary-medium hover:text-heading focus:ring-4 focus:ring-neutral-tertiary shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none">Pricing & FAQ</button>
      <button type="button" class="inline-flex items-center justify-center text-white bg-brand box-border border border-transparent hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none">
         Get access
         <svg class="rtl:rotate-180 w-4 h-4 ms-1.5 -me-0.5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 12H5m14 0-4 4m4-4-4-4"/></svg>
      </button>
   </div>
</div>`.trim();
}

/**
 * Generates markup for the Flowbite Drawer Navigation.
 *
 * @param {Object} options
 * @param {string} [options.id='drawer-navigation']
 * @param {string} [options.buttonText='Show navigation']
 * @param {string} [options.brandName='Flowbite']
 * @returns {string} HTML markup
 */
export function renderFlowbiteDrawerNavigation(options = {}) {
  const {
    id = 'drawer-navigation',
    buttonText = 'Show navigation',
    brandName = 'Flowbite',
  } = options;

  return `
<!-- drawer init and show -->
<div class="text-center">
   <button class="inline-flex items-center justify-center text-white bg-brand box-border border border-transparent hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none" type="button" data-drawer-target="${id}" data-drawer-show="${id}" aria-controls="${id}">
   ${buttonText}
   </button>
</div>

<!-- drawer component -->
<div id="${id}" class="fixed top-0 left-0 z-40 h-screen p-4 overflow-y-auto transition-transform -translate-x-full bg-neutral-primary-soft w-80 border-e border-default" tabindex="-1" aria-labelledby="${id}-label">
   <div class="border-b border-default pb-4 flex items-center">
      <a href="https://flowbite.com/" class="flex items-center space-x-2 rtl:space-x-reverse">
         <img src="https://flowbite.com/docs/images/logo.svg" class="h-6 w-6" alt="${brandName} Logo" />
         <span class="self-center text-lg font-semibold whitespace-nowrap text-heading">${brandName}</span>
      </a>
      <button type="button" data-drawer-hide="${id}" aria-controls="${id}" class="text-body bg-transparent hover:text-heading hover:bg-neutral-tertiary rounded-base w-9 h-9 absolute top-2.5 end-2.5 flex items-center justify-center">
         ${DRAWER_CLOSE_SVG}
         <span class="sr-only">Close menu</span>
      </button>
   </div>
  <div class="py-5 overflow-y-auto">
      <ul class="space-y-2 font-medium">
         <li>
            <a href="#" class="flex items-center px-2 py-1.5 text-body rounded-base hover:bg-neutral-tertiary hover:text-fg-brand group">
               <svg class="w-5 h-5 transition duration-75 group-hover:text-fg-brand" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6.025A7.5 7.5 0 1 0 17.975 14H10V6.025Z"/><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.5 3c-.169 0-.334.014-.5.025V11h7.975c.011-.166.025-.331.025-.5A7.5 7.5 0 0 0 13.5 3Z"/></svg>
               <span class="ms-3">Dashboard</span>
            </a>
         </li>
         <li>
            <button type="button" class="flex items-center w-full justify-between px-2 py-1.5 text-body rounded-base hover:bg-neutral-tertiary hover:text-fg-brand group" aria-controls="dropdown-${id}" data-collapse-toggle="dropdown-${id}">
                  <svg class="shrink-0 w-5 h-5 transition duration-75 group-hover:text-fg-brand" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 4h1.5L9 16m0 0h8m-8 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm8 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm-8.5-3h9.25L19 7H7.312"/></svg>
                  <span class="flex-1 ms-3 text-left rtl:text-right whitespace-nowrap">E-commerce</span>
                  <svg class="w-5 h-5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m19 9-7 7-7-7"/></svg>
            </button>
            <ul id="dropdown-${id}" class="hidden py-2 space-y-2">
                  <li>
                     <a href="#" class="pl-10 flex items-center px-2 py-1.5 text-body rounded-base hover:bg-neutral-tertiary hover:text-fg-brand group">Products</a>
                  </li>
                  <li>
                     <a href="#" class="pl-10 flex items-center px-2 py-1.5 text-body rounded-base hover:bg-neutral-tertiary hover:text-fg-brand group">Billing</a>
                  </li>
                  <li>
                     <a href="#" class="pl-10 flex items-center px-2 py-1.5 text-body rounded-base hover:bg-neutral-tertiary hover:text-fg-brand group">Invoice</a>
                  </li>
            </ul>
         </li>
         <li>
            <a href="#" class="flex items-center px-2 py-1.5 text-body rounded-base hover:bg-neutral-tertiary hover:text-fg-brand group">
               <svg class="shrink-0 w-5 h-5 transition duration-75 group-hover:text-fg-brand" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 5v14M9 5v14M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/></svg>
               <span class="flex-1 ms-3 whitespace-nowrap">Kanban</span>
               <span class="bg-neutral-secondary-medium border border-default-medium text-heading text-xs font-medium px-1.5 py-0.5 rounded-sm">Pro</span>
            </a>
         </li>
         <li>
            <a href="#" class="flex items-center px-2 py-1.5 text-body rounded-base hover:bg-neutral-tertiary hover:text-fg-brand group">
               <svg class="shrink-0 w-5 h-5 transition duration-75 group-hover:text-fg-brand" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 13h3.439a.991.991 0 0 1 .908.6 3.978 3.978 0 0 0 7.306 0 .99.99 0 0 1 .908-.6H20M4 13v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6M4 13l2-9h12l2 9M9 7h6m-7 3h8"/></svg>
               <span class="flex-1 ms-3 whitespace-nowrap">Inbox</span>
               <span class="inline-flex items-center justify-center w-4.5 h-4.5 ms-2 text-xs font-medium text-fg-danger-strong bg-danger-soft border border-danger-subtle rounded-full">2</span>
            </a>
         </li>
         <li>
            <a href="#" class="flex items-center px-2 py-1.5 text-body rounded-base hover:bg-neutral-tertiary hover:text-fg-brand group">
               <svg class="shrink-0 w-5 h-5 transition duration-75 group-hover:text-fg-brand" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M16 19h4a1 1 0 0 0 1-1v-1a3 3 0 0 0-3-3h-2m-2.236-4a3 3 0 1 0 0-4M3 18v-1a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Zm8-10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg>
               <span class="flex-1 ms-3 whitespace-nowrap">Users</span>
            </a>
         </li>
         <li>
            <a href="#" class="flex items-center px-2 py-1.5 text-body rounded-base hover:bg-neutral-tertiary hover:text-fg-brand group">
               <svg class="shrink-0 w-5 h-5 transition duration-75 group-hover:text-fg-brand" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10V6a3 3 0 0 1 3-3v0a3 3 0 0 1 3 3v4m3-2 .917 11.923A1 1 0 0 1 17.92 21H6.08a1 1 0 0 1-.997-1.077L6 8h12Z"/></svg>
               <span class="flex-1 ms-3 whitespace-nowrap">Products</span>
            </a>
         </li>
         <li>
            <a href="#" class="flex items-center px-2 py-1.5 text-body rounded-base hover:bg-neutral-tertiary hover:text-fg-brand group">
               <svg class="shrink-0 w-5 h-5 transition duration-75 group-hover:text-fg-brand" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 12H4m12 0-4 4m4-4-4-4m3-4h2a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-2"/></svg>
               <span class="flex-1 ms-3 whitespace-nowrap">Sign In</span>
            </a>
         </li>
      </ul>
   </div>
</div>`.trim();
}

/**
 * Generates markup for the Flowbite Contact Form Drawer.
 *
 * @param {Object} options
 * @param {string} [options.id='drawer-contact']
 * @param {string} [options.buttonText='Show contact form']
 * @returns {string} HTML markup
 */
export function renderFlowbiteDrawerContactForm(options = {}) {
  const {
    id = 'drawer-contact',
    buttonText = 'Show contact form',
  } = options;

  return `
<!-- drawer init and show -->
<div class="text-center">
   <button class="inline-flex items-center justify-center text-white bg-brand box-border border border-transparent hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none" type="button" data-drawer-target="${id}" data-drawer-show="${id}" aria-controls="${id}">
   ${buttonText}
   </button>
</div>

<!-- drawer component -->
<div id="${id}" class="fixed top-0 left-0 z-40 h-screen p-4 overflow-y-auto transition-transform -translate-x-full bg-neutral-primary-soft w-80 border-e border-default" tabindex="-1" aria-labelledby="${id}-label">
   <div class="border-b border-default pb-4 mb-5 flex items-center">
      <h5 id="${id}-label" class="inline-flex items-center text-lg font-medium text-body">
         <svg class="w-5 h-5 me-1.5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.283 8h-4.285m3.85 3h-3.85m4.061-6H11v11h8.27l1.715-9.847A.983.983 0 0 0 20.059 5ZM6.581 13.23h-.838A13.752 13.752 0 0 1 5.622 11c-.02-.745.02-1.49.12-2.23h1.04c.252 0 .496-.088.683-.245a.927.927 0 0 0 .329-.61l.2-1.872a.888.888 0 0 0-.045-.39.936.936 0 0 0-.212-.34 1.017 1.017 0 0 0-.341-.231A1.08 1.08 0 0 0 6.983 5h-2.06a1.27 1.27 0 0 0-.699.204 1.135 1.135 0 0 0-.442.543A15.066 15.066 0 0 0 3.007 11a15.656 15.656 0 0 0 .795 5.229c.165.462 1.342.771 1.864.771h1.116c.142 0 .283-.028.413-.082.13-.053.246-.132.341-.23a.936.936 0 0 0 .212-.34.889.889 0 0 0 .046-.391l-.201-1.873a.927.927 0 0 0-.33-.609 1.059 1.059 0 0 0-.682-.245ZM10 18v1h10v-1a2 2 0 0 0-2-2h-6a2 2 0 0 0-2 2Z"/></svg>
         Contact Us
      </h5>
      <button type="button" data-drawer-hide="${id}" aria-controls="${id}" class="text-body bg-transparent hover:text-heading hover:bg-neutral-tertiary rounded-base w-9 h-9 absolute top-2.5 end-2.5 flex items-center justify-center">
         ${DRAWER_CLOSE_SVG}
         <span class="sr-only">Close menu</span>
      </button>
   </div>
   <form class="mb-6 space-y-4">
      <label for="${id}-email" class="block mb-2.5 text-sm font-medium text-heading">Your Email<span class="ms-1 text-fg-danger">*</span></label>
      <div class="relative">
         <div class="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
            <svg class="w-4 h-4 text-body" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="m3.5 5.5 7.893 6.036a1 1 0 0 0 1.214 0L20.5 5.5M4 19h16a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1Z"/></svg>
         </div>
         <input type="text" id="${id}-email" class="block w-full ps-9 pe-3 py-2.5 bg-neutral-secondary-medium border border-default-medium text-heading text-sm rounded-base focus:ring-brand focus:border-brand px-3 py-2.5 shadow-xs placeholder:text-body" placeholder="name@flowbite.com" required>
      </div>
      <label for="${id}-subject" class="block mb-2.5 text-sm font-medium text-heading">Subject<span class="ms-1 text-fg-danger">*</span></label>
      <div class="relative">
         <div class="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
            <svg class="w-4 h-4 text-body" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="m3.5 5.5 7.893 6.036a1 1 0 0 0 1.214 0L20.5 5.5M4 19h16a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1Z"/></svg>
         </div>
         <input type="text" id="${id}-subject" class="block w-full ps-9 pe-3 py-2.5 bg-neutral-secondary-medium border border-default-medium text-heading text-sm rounded-base focus:ring-brand focus:border-brand px-3 py-2.5 shadow-xs placeholder:text-body" placeholder="Let us know how we can help you" required>
      </div>
      <label for="${id}-message" class="block mb-2.5 text-sm font-medium text-heading">Your message</label>
      <textarea id="${id}-message" rows="4" class="bg-neutral-secondary-medium border border-default-medium text-heading text-sm rounded-base focus:ring-brand focus:border-brand block w-full p-3.5 shadow-xs placeholder:text-body" placeholder="Write your thoughts here..."></textarea>
      <button type="submit" class="w-full text-white bg-brand box-border border border-transparent hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none">Send message</button>
   </form>
   <p class="mb-2 text-sm text-body">
      <a href="#" class="hover:underline">info@company.com</a>
   </p>
   <p class="text-sm text-body">
      <a href="#" class="hover:underline">212-456-7890</a>
   </p>
</div>`.trim();
}

/**
 * Generates markup for the Flowbite Form Elements Drawer.
 *
 * @param {Object} options
 * @param {string} [options.id='drawer-form']
 * @param {string} [options.buttonText='Show drawer form']
 * @returns {string} HTML markup
 */
export function renderFlowbiteDrawerFormElements(options = {}) {
  const {
    id = 'drawer-form',
    buttonText = 'Show drawer form',
  } = options;

  return `
<!-- drawer init and show -->
<div class="text-center">
   <button class="inline-flex items-center justify-center text-white bg-brand box-border border border-transparent hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none" type="button" data-drawer-target="${id}" data-drawer-show="${id}" aria-controls="${id}">
   ${buttonText}
   </button>
</div>

<!-- drawer component -->
<div id="${id}" class="fixed top-0 left-0 z-40 h-screen p-4 overflow-y-auto transition-transform -translate-x-full bg-neutral-primary-soft w-80 border-e border-default" tabindex="-1" aria-labelledby="${id}-label">
   <div class="border-b border-default pb-4 mb-5 flex items-center">
      <h5 id="${id}-label" class="text-lg font-medium text-body">
         New event
      </h5>
      <button type="button" data-drawer-hide="${id}" aria-controls="${id}" class="text-body bg-transparent hover:text-heading hover:bg-neutral-tertiary rounded-base w-9 h-9 absolute top-2.5 end-2.5 flex items-center justify-center">
         ${DRAWER_CLOSE_SVG}
         <span class="sr-only">Close menu</span>
      </button>
   </div>
   <form class="mb-6 space-y-4">
        <div>
            <label for="${id}-title" class="block mb-2.5 text-sm font-medium text-heading">Title<span class="ms-1 text-fg-danger">*</span></label>
            <input type="text" id="${id}-title" class="bg-neutral-secondary-medium border border-default-medium text-heading text-sm rounded-base focus:ring-brand focus:border-brand block w-full px-3 py-2.5 shadow-xs placeholder:text-body" placeholder="Apple Keynote" required />
        </div>
      <label for="${id}-description" class="block mb-2.5 text-sm font-medium text-heading">Description</label>
      <textarea id="${id}-description" rows="4" class="bg-neutral-secondary-medium border border-default-medium text-heading text-sm rounded-base focus:ring-brand focus:border-brand block w-full p-3.5 shadow-xs placeholder:text-body" placeholder="Write your description here..."></textarea>
      <div class="relative max-w-sm">
         <div class="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
            <svg class="w-4 h-4 text-body" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 10h16m-8-3V4M7 7V4m10 3V4M5 20h14a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1Zm3-7h.01v.01H8V13Zm4 0h.01v.01H12V13Zm4 0h.01v.01H16V13Zm-8 4h.01v.01H8V17Zm4 0h.01v.01H12V17Zm4 0h.01v.01H16V17Z"/></svg>
         </div>
         <input datepicker id="${id}-datepicker" type="text" class="block w-full ps-9 pe-3 py-2.5 bg-neutral-secondary-medium border border-default-medium text-heading text-sm rounded-base focus:ring-brand focus:border-brand px-3 py-2.5 shadow-xs placeholder:text-body" placeholder="Select date">
      </div>
      <div class="mb-4">
         <label for="${id}-guests" class="mb-2 text-sm font-medium text-heading sr-only">Invite guests</label>
         <div class="relative">
            <input type="search" id="${id}-guests" class="bg-neutral-secondary-medium border border-default-medium text-heading text-sm rounded-base focus:ring-brand focus:border-brand block w-full px-3 py-2.5 shadow-xs placeholder:text-body" placeholder="Add guest email" required />
            <button type="button" class="absolute flex items-center end-1.5 top-1/2 -translate-y-1/2 text-body bg-neutral-primary-strong border border-default-strong hover:bg-neutral-secondary-strong/70 hover:text-heading focus:ring-4 focus:ring-neutral-tertiary-soft font-medium leading-5 rounded text-xs px-3 py-1.5 focus:outline-none">
               <span class="flex items-center">
                  <svg class="w-4 h-4 me-1.5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M16 12h4m-2 2v-4M4 18v-1a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Zm8-10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg>
                  <span class="text-xs font-semibold">Add</span>
               </span>
            </button>
         </div>
      </div>
      <div class="flex mb-4 -space-x-4 rtl:space-x-reverse">
         <img class="w-8 h-8 border-2 border-buffer-medium rounded-full" src="/src/assets/zamorin-app-icon-1024.png" alt="">
         <img class="w-8 h-8 border-2 border-buffer-medium rounded-full" src="/src/assets/zamorin-app-icon-1024.png" alt="">
         <img class="w-8 h-8 border-2 border-buffer-medium rounded-full" src="/src/assets/zamorin-app-icon-1024.png" alt="">
         <img class="w-8 h-8 border-2 border-buffer-medium rounded-full" src="/src/assets/zamorin-app-icon-1024.png" alt="">
      </div>
      <button type="submit" class="inline-flex items-center justify-center w-full text-white bg-brand box-border border border-transparent hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none">
         <svg class="w-4 h-4 me-1.5 -ms-0.5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path fill="currentColor" d="M4 9.05H3v2h1v-2Zm16 2h1v-2h-1v2ZM10 14a1 1 0 1 0 0 2v-2Zm4 2a1 1 0 1 0 0-2v2Zm-3 1a1 1 0 1 0 2 0h-2Zm2-4a1 1 0 1 0-2 0h2Zm-2-5.95a1 1 0 1 0 2 0h-2Zm2-3a1 1 0 1 0-2 0h2Zm-7 3a1 1 0 0 0 2 0H6Zm2-3a1 1 0 1 0-2 0h2Zm8 3a1 1 0 1 0 2 0h-2Zm2-3a1 1 0 1 0-2 0h2Zm-13 3h14v-2H5v2Zm14 0v12h2v-12h-2Zm0 12H5v2h14v-2Zm-14 0v-12H3v12h2Zm0 0H3a2 2 0 0 0 2 2v-2Zm14 0v2a2 2 0 0 0 2-2h-2Zm0-12h2a2 2 0 0 0-2-2v2Zm-14-2a2 2 0 0 0-2 2h2v-2Zm-1 6h16v-2H4v2ZM10 16h4v-2h-4v2Zm3 1v-4h-2v4h2Zm0-9.95v-3h-2v3h2Zm-5 0v-3H6v3h2Zm10 0v-3h-2v3h2Z"/></svg>
         Create event
      </button>
   </form>
</div>`.trim();
}

/**
 * Generates markup for the Flowbite Swipeable Edge Drawer.
 *
 * @param {Object} options
 * @param {string} [options.id='drawer-swipe']
 * @param {string} [options.buttonText='Show swipeable drawer']
 * @returns {string} HTML markup
 */
export function renderFlowbiteDrawerSwipeableEdge(options = {}) {
  const {
    id = 'drawer-swipe',
    buttonText = 'Show swipeable drawer',
  } = options;

  return `
<!-- drawer init and toggle -->
<div class="text-center">
   <button class="inline-flex items-center justify-center text-white bg-brand box-border border border-transparent hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none" type="button" data-drawer-target="${id}" data-drawer-show="${id}" data-drawer-placement="bottom" data-drawer-edge="true" data-drawer-edge-offset="bottom-[60px]" aria-controls="${id}">
   ${buttonText}
   </button>
</div>

<!-- drawer component -->
<div id="${id}" class="fixed z-40 w-full overflow-y-auto bg-neutral-primary-soft border-t border-default rounded-t-base transition-transform bottom-0 left-0 right-0 translate-y-full bottom-[60px]" tabindex="-1" aria-labelledby="${id}-label">
   <div class="p-4 cursor-pointer hover:bg-neutral-secondary-soft" data-drawer-toggle="${id}">
      <span class="absolute w-8 h-1 -translate-x-1/2 bg-neutral-quaternary rounded-lg top-3 left-1/2"></span>
      <h5 id="${id}-label" class="inline-flex items-center text-base text-body font-medium">
         <svg class="w-5 h-5 me-1.5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 17h6m-3 3v-6M4.857 4h4.286c.473 0 .857.384.857.857v4.286a.857.857 0 0 1-.857.857H4.857A.857.857 0 0 1 4 9.143V4.857C4 4.384 4.384 4 4.857 4Zm10 0h4.286c.473 0 .857.384.857.857v4.286a.857.857 0 0 1-.857.857h-4.286A.857.857 0 0 1 14 9.143V4.857c0-.473.384-.857.857-.857Zm-10 10h4.286c.473 0 .857.384.857.857v4.286a.857.857 0 0 1-.857.857H4.857A.857.857 0 0 1 4 19.143v-4.286c0-.473.384-.857.857-.857Z"/></svg>
         Add widget
      </h5>
   </div>
   <div class="grid grid-cols-3 gap-4 p-4 lg:grid-cols-4">
      <div class="p-4 rounded-base cursor-pointer bg-neutral-secondary-medium border border-default-medium hover:bg-neutral-tertiary-medium">
         <div class="flex justify-center items-center p-2 mx-auto mb-2 bg-neutral-primary-strong border border-default-strong rounded-full w-12 h-12">
            <svg class="w-7 h-7 inline text-body" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6.025A7.5 7.5 0 1 0 17.975 14H10V6.025Z"/><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.5 3c-.169 0-.334.014-.5.025V11h7.975c.011-.166.025-.331.025-.5A7.5 7.5 0 0 0 13.5 3Z"/></svg>
         </div>
         <div class="font-medium text-center text-body">Chart</div>
      </div>
      <div class="p-4 rounded-base cursor-pointer bg-neutral-secondary-medium border border-default-medium hover:bg-neutral-tertiary-medium">
         <div class="flex justify-center items-center p-2 mx-auto mb-2 bg-neutral-primary-strong border border-default-strong rounded-full w-12 h-12">
            <svg class="w-7 h-7 inline text-body" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-width="2" d="M3 11h18M3 15h18M8 10.792V19m4-8.208V19m4-8.208V19M4 19h16a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1Z"/></svg>
         </div>
         <div class="font-medium text-center text-body">Table</div>
      </div>
      <div class="hidden p-4 rounded-base cursor-pointer bg-neutral-secondary-medium border border-default-medium hover:bg-neutral-tertiary-medium lg:block">
         <div class="flex justify-center items-center p-2 mx-auto mb-2 bg-neutral-primary-strong border border-default-strong rounded-full w-12 h-12">
            <svg class="w-7 h-7 inline text-body" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.5 12A2.5 2.5 0 0 1 21 9.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v2.5a2.5 2.5 0 0 1 0 5V17a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-2.5a2.5 2.5 0 0 1-2.5-2.5Z"/></svg>
         </div>
         <div class="hidden font-medium text-center text-body">Ticket</div>
      </div>
      <div class="p-4 rounded-base cursor-pointer bg-neutral-secondary-medium border border-default-medium hover:bg-neutral-tertiary-medium">
         <div class="flex justify-center items-center p-2 mx-auto mb-2 bg-neutral-primary-strong border border-default-strong rounded-full w-12 h-12">
            <svg class="w-7 h-7 inline text-body" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6h8m-8 6h8m-8 6h8M4 16a2 2 0 1 1 3.321 1.5L4 20h5M4 5l2-1v6m-2 0h4"/></svg>
         </div>
         <div class="font-medium text-center text-body">List</div>
      </div>
      <div class="p-4 rounded-base cursor-pointer bg-neutral-secondary-medium border border-default-medium hover:bg-neutral-tertiary-medium">
         <div class="flex justify-center items-center p-2 mx-auto mb-2 bg-neutral-primary-strong border border-default-strong rounded-full w-12 h-12">
            <svg class="w-7 h-7 inline text-body" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M8 7V6a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-1M3 18v-7a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Zm8-3.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z"/></svg>
         </div>
         <div class="font-medium text-center text-body">Price</div>
      </div>
      <div class="p-4 rounded-base cursor-pointer bg-neutral-secondary-medium border border-default-medium hover:bg-neutral-tertiary-medium">
         <div class="flex justify-center items-center p-2 mx-auto mb-2 bg-neutral-primary-strong border border-default-strong rounded-full w-12 h-12">
            <svg class="w-7 h-7 inline text-body" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M4.5 17H4a1 1 0 0 1-1-1 3 3 0 0 1 3-3h1m0-3.05A2.5 2.5 0 1 1 9 5.5M19.5 17h.5a1 1 0 0 0 1-1 3 3 0 0 0-3-3h-1m0-3.05a2.5 2.5 0 1 0-2-4.45m.5 13.5h-7a1 1 0 0 1-1-1 3 3 0 0 1 3-3h3a3 3 0 0 1 3 3 1 1 0 0 1-1 1Zm-1-9.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z"/></svg>
         </div>
         <div class="font-medium text-center text-body">Users</div>
      </div>
      <div class="hidden p-4 rounded-base cursor-pointer bg-neutral-secondary-medium border border-default-medium hover:bg-neutral-tertiary-medium lg:block">
         <div class="flex justify-center items-center p-2 mx-auto mb-2 bg-neutral-primary-strong border border-default-strong rounded-full w-12 h-12">
            <svg class="w-7 h-7 inline text-body" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 4h3a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3m0 3h6m-3 5h3m-6 0h.01M12 16h3m-6 0h.01M10 3v4h4V3h-4Z"/></svg>
         </div>
         <div class="font-medium text-center text-body">Task</div>
      </div>
      <div class="p-4 rounded-base cursor-pointer bg-neutral-secondary-medium border border-default-medium hover:bg-neutral-tertiary-medium">
         <div class="flex justify-center items-center p-2 mx-auto mb-2 bg-neutral-primary-strong border border-default-strong rounded-full w-12 h-12">
            <svg class="w-7 h-7 inline text-body" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M6 4v10m0 0a2 2 0 1 0 0 4m0-4a2 2 0 1 1 0 4m0 0v2m6-16v2m0 0a2 2 0 1 0 0 4m0-4a2 2 0 1 1 0 4m0 0v10m6-16v10m0 0a2 2 0 1 0 0 4m0-4a2 2 0 1 1 0 4m0 0v2"/></svg>
         </div>
         <div class="font-medium text-center text-body">Custom</div>
      </div>
   </div>
</div>`.trim();
}

/**
 * Renders the complete Flowbite Drawer showcase featuring all 7 official examples.
 *
 * @returns {string} HTML markup
 */
export function renderFlowbiteDrawerShowcase() {
  return `
<div class="flowbite-drawer-showcase space-y-10 p-4">
  <!-- 1. Default drawer -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-4">1. Default Drawer</h4>
    ${renderFlowbiteDrawer({ id: 'drawer-showcase-default' })}
  </div>

  <!-- 2. Drawer navigation -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-4">2. Drawer Navigation</h4>
    ${renderFlowbiteDrawerNavigation({ id: 'drawer-showcase-navigation' })}
  </div>

  <!-- 3. Contact form -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-4">3. Contact Form Drawer</h4>
    ${renderFlowbiteDrawerContactForm({ id: 'drawer-showcase-contact' })}
  </div>

  <!-- 4. Form elements -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-4">4. Form Elements Drawer</h4>
    ${renderFlowbiteDrawerFormElements({ id: 'drawer-showcase-form' })}
  </div>

  <!-- 5. Body scrolling disabled -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-4">5. Body Scrolling Disabled (Default)</h4>
    <div class="text-center">
       <button class="inline-flex items-center justify-center text-white bg-brand box-border border border-transparent hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none" type="button" data-drawer-target="drawer-disable-body-scrolling" data-drawer-show="drawer-disable-body-scrolling" data-drawer-body-scrolling="false" aria-controls="drawer-disable-body-scrolling">
       Show body scrolling disabled
       </button>
    </div>
    ${renderFlowbiteDrawerNavigation({ id: 'drawer-disable-body-scrolling' })}
  </div>

  <!-- 6. Backdrop enabled -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-4">6. Backdrop Enabled (Default)</h4>
    <div class="text-center">
       <button class="inline-flex items-center justify-center text-white bg-brand box-border border border-transparent hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none" type="button" data-drawer-target="drawer-backdrop-sample" data-drawer-show="drawer-backdrop-sample" data-drawer-backdrop="true" aria-controls="drawer-backdrop-sample">
       Show drawer with backdrop
       </button>
    </div>
    ${renderFlowbiteDrawerNavigation({ id: 'drawer-backdrop-sample' })}
  </div>

  <!-- 7. Swipeable edge -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-4">7. Swipeable Edge Drawer</h4>
    ${renderFlowbiteDrawerSwipeableEdge({ id: 'drawer-showcase-swipe' })}
  </div>
</div>
  `.trim();
}

/* ============================================================
   FLOWBITE DROPDOWN GENERATORS
   ============================================================ */

/**
 * Renders the default Flowbite Dropdown example.
 * @param {Object} [options={}]
 * @param {string} [options.triggerId='dropdownDefaultButton']
 * @param {string} [options.dropdownId='dropdown']
 * @returns {string} HTML markup
 */
export function renderFlowbiteDropdown(options = {}) {
  const {
    triggerId = 'dropdownDefaultButton',
    dropdownId = 'dropdown',
  } = options;
  return `
<button id="${triggerId}" data-dropdown-toggle="${dropdownId}" class="inline-flex items-center justify-center text-white bg-brand box-border border border-transparent hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none" type="button">
  Dropdown button
  <svg class="w-2.5 h-2.5 ms-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 10 6">
    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m1 1 4 4 4-4"/>
  </svg>
</button>

<!-- Dropdown menu -->
<div id="${dropdownId}" class="hidden z-10 bg-neutral-primary-soft divide-y divide-default rounded-base shadow-lg w-44 border border-default">
  <ul class="py-2 text-sm text-body" aria-labelledby="${triggerId}">
    <li>
      <a href="#" class="block px-4 py-2 hover:bg-neutral-tertiary hover:text-heading">Dashboard</a>
    </li>
    <li>
      <a href="#" class="block px-4 py-2 hover:bg-neutral-tertiary hover:text-heading">Settings</a>
    </li>
    <li>
      <a href="#" class="block px-4 py-2 hover:bg-neutral-tertiary hover:text-heading">Earnings</a>
    </li>
  </ul>
  <div class="py-2">
    <a href="#" class="block px-4 py-2 text-sm text-body hover:bg-neutral-tertiary hover:text-heading">Sign out</a>
  </div>
</div>`.trim();
}

/**
 * Renders the Flowbite Hover Dropdown example.
 * @param {Object} [options={}]
 * @param {string} [options.triggerId='dropdownHoverButton']
 * @param {string} [options.dropdownId='dropdownHover']
 * @returns {string} HTML markup
 */
export function renderFlowbiteDropdownHover(options = {}) {
  const {
    triggerId = 'dropdownHoverButton',
    dropdownId = 'dropdownHover',
  } = options;
  return `
<button id="${triggerId}" data-dropdown-toggle="${dropdownId}" data-dropdown-trigger="hover" class="inline-flex items-center justify-center text-white bg-brand box-border border border-transparent hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none" type="button">
  Dropdown hover
  <svg class="w-2.5 h-2.5 ms-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 10 6">
    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m1 1 4 4 4-4"/>
  </svg>
</button>

<div id="${dropdownId}" class="hidden z-10 bg-neutral-primary-soft divide-y divide-default rounded-base shadow-lg w-44 border border-default">
  <ul class="py-2 text-sm text-body" aria-labelledby="${triggerId}">
    <li><a href="#" class="block px-4 py-2 hover:bg-neutral-tertiary hover:text-heading">Dashboard</a></li>
    <li><a href="#" class="block px-4 py-2 hover:bg-neutral-tertiary hover:text-heading">Settings</a></li>
    <li><a href="#" class="block px-4 py-2 hover:bg-neutral-tertiary hover:text-heading">Earnings</a></li>
  </ul>
  <div class="py-2">
    <a href="#" class="block px-4 py-2 text-sm text-body hover:bg-neutral-tertiary hover:text-heading">Sign out</a>
  </div>
</div>`.trim();
}

/**
 * Renders the Flowbite Dropdown Header (user profile with PRO badge and toggle).
 * @param {Object} [options={}]
 * @param {string} [options.triggerId='dropdownInformationButton']
 * @param {string} [options.dropdownId='dropdownInformation']
 * @param {string} [options.userName='Bonnie Green']
 * @param {string} [options.userEmail='name@flowbite.com']
 * @returns {string} HTML markup
 */
export function renderFlowbiteDropdownHeader(options = {}) {
  const {
    triggerId = 'dropdownInformationButton',
    dropdownId = 'dropdownInformation',
    userName = 'Bonnie Green',
    userEmail = 'name@flowbite.com',
  } = options;
  return `
<button id="${triggerId}" data-dropdown-toggle="${dropdownId}" class="inline-flex items-center justify-center text-white bg-brand box-border border border-transparent hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none" type="button">
  ${userName}
  <svg class="w-2.5 h-2.5 ms-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 10 6">
    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m1 1 4 4 4-4"/>
  </svg>
</button>

<div id="${dropdownId}" class="hidden z-10 bg-neutral-primary-soft divide-y divide-default rounded-base shadow-lg w-72 border border-default">
  <div class="px-4 py-3 text-sm text-body">
    <div class="flex items-center justify-between">
      <div>
        <div class="font-semibold text-heading">${userName}</div>
        <div class="truncate">${userEmail}</div>
      </div>
      <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-brand-softer text-fg-brand-strong ring-1 ring-inset ring-brand-subtle">PRO</span>
    </div>
  </div>
  <div class="px-4 py-3">
    <div class="flex items-center justify-between">
      <span class="text-sm text-body">Dark mode</span>
      <label class="relative inline-flex items-center cursor-pointer">
        <input type="checkbox" class="sr-only peer" id="${dropdownId}-dark-toggle">
        <div class="relative w-11 h-6 bg-neutral-secondary-medium peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-medium rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand"></div>
      </label>
    </div>
  </div>
  <ul class="py-2 text-sm text-body">
    <li><a href="#" class="block px-4 py-2 hover:bg-neutral-tertiary hover:text-heading">Dashboard</a></li>
    <li><a href="#" class="block px-4 py-2 hover:bg-neutral-tertiary hover:text-heading">Settings</a></li>
    <li><a href="#" class="block px-4 py-2 hover:bg-neutral-tertiary hover:text-heading">Earnings</a></li>
  </ul>
  <div class="py-2">
    <a href="#" class="block px-4 py-2 text-sm text-body hover:bg-neutral-tertiary hover:text-heading">Sign out</a>
  </div>
</div>`.trim();
}

/**
 * Renders the Flowbite Multi-Level Dropdown example.
 * @param {Object} [options={}]
 * @param {string} [options.triggerId='multiLevelDropdownButton']
 * @param {string} [options.dropdownId='multi-dropdown']
 * @param {string} [options.nestedTriggerId='doubleDropdownButton']
 * @param {string} [options.nestedDropdownId='doubleDropdown']
 * @returns {string} HTML markup
 */
export function renderFlowbiteMultiLevelDropdown(options = {}) {
  const {
    triggerId = 'multiLevelDropdownButton',
    dropdownId = 'multi-dropdown',
    nestedTriggerId = 'doubleDropdownButton',
    nestedDropdownId = 'doubleDropdown',
  } = options;
  return `
<button id="${triggerId}" data-dropdown-toggle="${dropdownId}" class="inline-flex items-center justify-center text-white bg-brand box-border border border-transparent hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none" type="button">
  Dropdown
  <svg class="w-2.5 h-2.5 ms-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 10 6">
    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m1 1 4 4 4-4"/>
  </svg>
</button>

<div id="${dropdownId}" class="hidden z-10 bg-neutral-primary-soft divide-y divide-default rounded-base shadow-lg w-44 border border-default">
  <ul class="py-2 text-sm text-body" aria-labelledby="${triggerId}">
    <li><a href="#" class="block px-4 py-2 hover:bg-neutral-tertiary hover:text-heading">Dashboard</a></li>
    <li class="relative">
      <button id="${nestedTriggerId}" data-dropdown-toggle="${nestedDropdownId}" data-dropdown-placement="right-start" class="flex items-center justify-between w-full px-4 py-2 hover:bg-neutral-tertiary hover:text-heading">
        Dropdown
        <svg class="w-2.5 h-2.5 ms-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 6 10">
          <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m1 9 4-4-4-4"/>
        </svg>
      </button>
      <div id="${nestedDropdownId}" class="hidden z-10 bg-neutral-primary-soft divide-y divide-default rounded-base shadow-lg w-44 border border-default">
        <ul class="py-2 text-sm text-body" aria-labelledby="${nestedTriggerId}">
          <li><a href="#" class="block px-4 py-2 hover:bg-neutral-tertiary hover:text-heading">Overview</a></li>
          <li><a href="#" class="block px-4 py-2 hover:bg-neutral-tertiary hover:text-heading">My downloads</a></li>
          <li><a href="#" class="block px-4 py-2 hover:bg-neutral-tertiary hover:text-heading">Billing</a></li>
        </ul>
      </div>
    </li>
    <li><a href="#" class="block px-4 py-2 hover:bg-neutral-tertiary hover:text-heading">Earnings</a></li>
  </ul>
  <div class="py-2">
    <a href="#" class="block px-4 py-2 text-sm text-body hover:bg-neutral-tertiary hover:text-heading">Sign out</a>
  </div>
</div>`.trim();
}

/**
 * Renders a Flowbite Dropdown with Checkbox items.
 * @param {Object} [options={}]
 * @param {string} [options.triggerId='dropdownCheckboxButton']
 * @param {string} [options.dropdownId='dropdownDefaultCheckbox']
 * @returns {string} HTML markup
 */
export function renderFlowbiteDropdownCheckbox(options = {}) {
  const {
    triggerId = 'dropdownCheckboxButton',
    dropdownId = 'dropdownDefaultCheckbox',
  } = options;
  return `
<button id="${triggerId}" data-dropdown-toggle="${dropdownId}" class="inline-flex items-center justify-center text-white bg-brand box-border border border-transparent hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none" type="button">
  Dropdown checkbox
  <svg class="w-2.5 h-2.5 ms-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 10 6">
    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m1 1 4 4 4-4"/>
  </svg>
</button>

<div id="${dropdownId}" class="hidden z-10 w-48 bg-neutral-primary-soft divide-y divide-default rounded-base shadow-lg border border-default">
  <ul class="p-3 space-y-3 text-sm text-body" aria-labelledby="${triggerId}">
    <li>
      <div class="flex items-center">
        <input id="${dropdownId}-checkbox-1" type="checkbox" value="" class="w-4 h-4 text-brand bg-neutral-secondary-medium border-default-medium rounded focus:ring-brand">
        <label for="${dropdownId}-checkbox-1" class="ms-2 text-sm font-medium text-body">Default checkbox</label>
      </div>
    </li>
    <li>
      <div class="flex items-center">
        <input checked id="${dropdownId}-checkbox-2" type="checkbox" value="" class="w-4 h-4 text-brand bg-neutral-secondary-medium border-default-medium rounded focus:ring-brand">
        <label for="${dropdownId}-checkbox-2" class="ms-2 text-sm font-medium text-body">Checked state</label>
      </div>
    </li>
    <li>
      <div class="flex items-center">
        <input id="${dropdownId}-checkbox-3" type="checkbox" value="" class="w-4 h-4 text-brand bg-neutral-secondary-medium border-default-medium rounded focus:ring-brand">
        <label for="${dropdownId}-checkbox-3" class="ms-2 text-sm font-medium text-body">Third state</label>
      </div>
    </li>
  </ul>
</div>`.trim();
}

/**
 * Renders a Flowbite Dropdown with Radio items.
 * @param {Object} [options={}]
 * @param {string} [options.triggerId='dropdownRadioButton']
 * @param {string} [options.dropdownId='dropdownDefaultRadio']
 * @returns {string} HTML markup
 */
export function renderFlowbiteDropdownRadio(options = {}) {
  const {
    triggerId = 'dropdownRadioButton',
    dropdownId = 'dropdownDefaultRadio',
  } = options;
  return `
<button id="${triggerId}" data-dropdown-toggle="${dropdownId}" class="inline-flex items-center justify-center text-white bg-brand box-border border border-transparent hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none" type="button">
  Dropdown radio
  <svg class="w-2.5 h-2.5 ms-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 10 6">
    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m1 1 4 4 4-4"/>
  </svg>
</button>

<div id="${dropdownId}" class="hidden z-10 w-48 bg-neutral-primary-soft divide-y divide-default rounded-base shadow-lg border border-default">
  <ul class="p-3 space-y-3 text-sm text-body" aria-labelledby="${triggerId}">
    <li>
      <div class="flex items-center">
        <input id="${dropdownId}-radio-1" type="radio" value="" name="${dropdownId}-radio" class="w-4 h-4 text-brand bg-neutral-secondary-medium border-default-medium focus:ring-brand">
        <label for="${dropdownId}-radio-1" class="ms-2 text-sm font-medium text-body">Default radio</label>
      </div>
    </li>
    <li>
      <div class="flex items-center">
        <input checked id="${dropdownId}-radio-2" type="radio" value="" name="${dropdownId}-radio" class="w-4 h-4 text-brand bg-neutral-secondary-medium border-default-medium focus:ring-brand">
        <label for="${dropdownId}-radio-2" class="ms-2 text-sm font-medium text-body">Checked state</label>
      </div>
    </li>
    <li>
      <div class="flex items-center">
        <input id="${dropdownId}-radio-3" type="radio" value="" name="${dropdownId}-radio" class="w-4 h-4 text-brand bg-neutral-secondary-medium border-default-medium focus:ring-brand">
        <label for="${dropdownId}-radio-3" class="ms-2 text-sm font-medium text-body">Third state</label>
      </div>
    </li>
  </ul>
</div>`.trim();
}

/**
 * Renders a Flowbite Dropdown with Toggle Switches.
 * @param {Object} [options={}]
 * @param {string} [options.triggerId='dropdownToggleButton']
 * @param {string} [options.dropdownId='dropdownToggle']
 * @returns {string} HTML markup
 */
export function renderFlowbiteDropdownToggleSwitch(options = {}) {
  const {
    triggerId = 'dropdownToggleButton',
    dropdownId = 'dropdownToggle',
  } = options;
  return `
<button id="${triggerId}" data-dropdown-toggle="${dropdownId}" class="inline-flex items-center justify-center text-white bg-brand box-border border border-transparent hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none" type="button">
  Toggle settings
  <svg class="w-2.5 h-2.5 ms-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 10 6">
    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m1 1 4 4 4-4"/>
  </svg>
</button>

<div id="${dropdownId}" class="hidden z-10 w-72 bg-neutral-primary-soft divide-y divide-default rounded-base shadow-lg border border-default">
  <ul class="p-3 space-y-3 text-sm text-body" aria-labelledby="${triggerId}">
    <li class="flex items-center justify-between">
      <span class="text-sm font-medium text-body">Email notifications</span>
      <label class="relative inline-flex items-center cursor-pointer">
        <input type="checkbox" checked class="sr-only peer" id="${dropdownId}-notif">
        <div class="relative w-11 h-6 bg-neutral-secondary-medium peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-medium rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand"></div>
      </label>
    </li>
    <li class="flex items-center justify-between">
      <span class="text-sm font-medium text-body">Dark mode</span>
      <label class="relative inline-flex items-center cursor-pointer">
        <input type="checkbox" class="sr-only peer" id="${dropdownId}-dark">
        <div class="relative w-11 h-6 bg-neutral-secondary-medium peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-medium rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand"></div>
      </label>
    </li>
    <li class="flex items-center justify-between">
      <span class="text-sm font-medium text-body">Show status</span>
      <label class="relative inline-flex items-center cursor-pointer">
        <input type="checkbox" checked class="sr-only peer" id="${dropdownId}-status">
        <div class="relative w-11 h-6 bg-neutral-secondary-medium peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-medium rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand"></div>
      </label>
    </li>
  </ul>
</div>`.trim();
}

/**
 * Renders a Flowbite Dropdown with a scrollable user list.
 * @param {Object} [options={}]
 * @param {string} [options.triggerId='dropdownUsersButton']
 * @param {string} [options.dropdownId='dropdownUsers']
 * @returns {string} HTML markup
 */
export function renderFlowbiteDropdownScrolling(options = {}) {
  const {
    triggerId = 'dropdownUsersButton',
    dropdownId = 'dropdownUsers',
  } = options;
  const users = [
    { name: 'Bonnie Green', email: 'bonnie@flowbite.com' },
    { name: 'Jese Leos', email: 'jese@flowbite.com' },
    { name: 'Robert Gouth', email: 'robert@flowbite.com' },
    { name: 'Joseph Mcfall', email: 'joseph@flowbite.com' },
    { name: 'Leslie Livingston', email: 'leslie@flowbite.com' },
    { name: 'Neil Sims', email: 'neil@flowbite.com' },
  ];
  const initials = (name) => name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase();
  const userItems = users
    .map(
      (u) => `
    <li class="flex items-center px-4 py-2 hover:bg-neutral-tertiary cursor-pointer">
      <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-brand-softer text-fg-brand-strong text-xs font-semibold me-2">${initials(u.name)}</span>
      <div class="min-w-0 flex-1">
        <div class="text-sm font-medium text-heading truncate">${u.name}</div>
        <div class="text-xs text-body truncate">${u.email}</div>
      </div>
    </li>`
    )
    .join('\n');

  return `
<button id="${triggerId}" data-dropdown-toggle="${dropdownId}" class="inline-flex items-center justify-center text-white bg-brand box-border border border-transparent hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none" type="button">
  Users
  <svg class="w-2.5 h-2.5 ms-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 10 6">
    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m1 1 4 4 4-4"/>
  </svg>
</button>

<div id="${dropdownId}" class="hidden z-10 bg-neutral-primary-soft rounded-base shadow-lg w-54 border border-default">
  <ul class="h-48 py-2 overflow-y-auto text-sm text-body" aria-labelledby="${triggerId}">
    ${userItems}
  </ul>
  <a href="#" class="flex items-center p-3 text-sm font-medium text-fg-brand border-t border-default rounded-b-base hover:bg-neutral-tertiary hover:underline">
    <svg class="w-4 h-4 me-2" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
      <path d="M10 5a1 1 0 0 1 1 1v3h3a1 1 0 0 1 0 2h-3v3a1 1 0 0 1-2 0v-3H6a1 1 0 0 1 0-2h3V6a1 1 0 0 1 1-1Z"/>
    </svg>
    Add new user
  </a>
</div>`.trim();
}

/**
 * Renders a Flowbite Dropdown with a search input and scrollable user list.
 * @param {Object} [options={}]
 * @param {string} [options.triggerId='dropdownUsersSearchButton']
 * @param {string} [options.dropdownId='dropdownSearch']
 * @returns {string} HTML markup
 */
export function renderFlowbiteDropdownSearch(options = {}) {
  const {
    triggerId = 'dropdownUsersSearchButton',
    dropdownId = 'dropdownSearch',
  } = options;
  const users = [
    'Bonnie Green',
    'Jese Leos',
    'Robert Gouth',
    'Joseph Mcfall',
    'Leslie Livingston',
    'Neil Sims',
  ];
  const initials = (name) => name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase();
  const userItems = users
    .map(
      (name) => `
    <li class="flex items-center px-4 py-2 hover:bg-neutral-tertiary cursor-pointer">
      <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-brand-softer text-fg-brand-strong text-xs font-semibold me-2">${initials(name)}</span>
      <span class="text-sm font-medium text-heading">${name}</span>
    </li>`
    )
    .join('\n');

  return `
<button id="${triggerId}" data-dropdown-toggle="${dropdownId}" class="inline-flex items-center justify-center text-white bg-brand box-border border border-transparent hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none" type="button">
  Search users
  <svg class="w-2.5 h-2.5 ms-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 10 6">
    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m1 1 4 4 4-4"/>
  </svg>
</button>

<div id="${dropdownId}" class="hidden z-10 bg-neutral-primary-soft rounded-base shadow-lg w-54 border border-default">
  <div class="p-3">
    <label for="${dropdownId}-search" class="sr-only">Search</label>
    <div class="relative">
      <div class="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
        <svg class="w-4 h-4 text-body" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 20">
          <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m19 19-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z"/>
        </svg>
      </div>
      <input type="text" id="${dropdownId}-search" placeholder="Search" class="block w-full p-2 ps-9 text-sm text-heading border border-default-medium rounded-base bg-neutral-secondary-medium focus:ring-brand focus:border-brand placeholder:text-body">
    </div>
  </div>
  <ul class="h-48 px-3 pb-3 overflow-y-auto text-sm text-body" aria-labelledby="${triggerId}">
    ${userItems}
  </ul>
</div>`.trim();
}

/**
 * Renders a Flowbite Notification Bell Dropdown.
 * @param {Object} [options={}]
 * @param {string} [options.triggerId='dropdownNotificationButton']
 * @param {string} [options.dropdownId='dropdownNotification']
 * @param {number} [options.count=5]
 * @returns {string} HTML markup
 */
export function renderFlowbiteDropdownNotification(options = {}) {
  const {
    triggerId = 'dropdownNotificationButton',
    dropdownId = 'dropdownNotification',
    count = 5,
  } = options;
  const notifications = [
    { name: 'Bonnie Green', action: 'mentioned you in a comment', time: '1 hour ago', unread: true },
    { name: 'Jese Leos', action: 'liked your post', time: '2 hours ago', unread: true },
    { name: 'Robert Gouth', action: 'requested your feedback', time: '3 hours ago', unread: false },
    { name: 'Leslie Livingston', action: 'shared a file with you', time: '5 hours ago', unread: false },
  ];
  const initials = (name) => name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase();
  const items = notifications
    .map(
      (n) => `
    <li class="flex px-4 py-3 ${n.unread ? 'bg-neutral-secondary-medium' : ''} hover:bg-neutral-tertiary cursor-pointer border-b border-default last:border-b-0">
      <div class="shrink-0 relative me-3">
        <span class="inline-flex items-center justify-center w-10 h-10 rounded-full bg-brand-softer text-fg-brand-strong text-sm font-semibold">${initials(n.name)}</span>
        ${n.unread ? '<span class="absolute top-0 end-0 block w-2.5 h-2.5 bg-brand border-2 border-neutral-primary-soft rounded-full"></span>' : ''}
      </div>
      <div class="w-full">
        <div class="text-sm text-body"><span class="font-semibold text-heading">${n.name}</span> ${n.action}</div>
        <div class="text-xs text-body mt-1">${n.time}</div>
      </div>
    </li>`
    )
    .join('\n');

  return `
<button id="${triggerId}" data-dropdown-toggle="${dropdownId}" type="button" class="relative inline-flex items-center p-2 text-sm font-medium text-center text-body bg-neutral-primary-soft rounded-base hover:bg-neutral-tertiary hover:text-heading focus:ring-4 focus:outline-none focus:ring-neutral-tertiary-soft border border-default">
  <svg class="w-5 h-5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 14 20">
    <path d="M12.133 10.632v-1.8A5.406 5.406 0 0 0 7.979 3.57.946.946 0 0 0 8 3.464V1.1a1 1 0 0 0-2 0v2.364a.946.946 0 0 0 .021.106 5.406 5.406 0 0 0-4.154 5.262v1.8C1.867 13.018 0 13.614 0 14.807 0 15.4 0 16 .538 16h12.924C14 16 14 15.4 14 14.807c0-1.193-1.867-1.789-1.867-4.175ZM3.823 17a3.453 3.453 0 0 0 6.354 0H3.823Z"/>
  </svg>
  <span class="sr-only">Notifications</span>
  <div class="absolute inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-danger border-2 border-neutral-primary-soft rounded-full -top-1 -end-1">${count}</div>
</button>

<div id="${dropdownId}" class="hidden z-20 w-full max-w-sm bg-neutral-primary-soft divide-y divide-default rounded-base shadow-lg border border-default">
  <div class="block px-4 py-2 font-medium text-center text-body bg-neutral-secondary-medium rounded-t-base">
    Notifications
  </div>
  <ul class="divide-y divide-default" aria-labelledby="${triggerId}">
    ${items}
  </ul>
  <a href="#" class="block py-2 text-sm font-medium text-center text-fg-brand bg-neutral-secondary-medium rounded-b-base hover:bg-neutral-tertiary hover:underline">
    View all
  </a>
</div>`.trim();
}

/**
 * Renders the Flowbite User Avatar Dropdown.
 * @param {Object} [options={}]
 * @param {string} [options.triggerId='dropdownUserAvatarButton']
 * @param {string} [options.dropdownId='dropdownAvatar']
 * @param {string} [options.userName='Bonnie Green']
 * @param {string} [options.userEmail='name@flowbite.com']
 * @returns {string} HTML markup
 */
export function renderFlowbiteDropdownUserAvatar(options = {}) {
  const {
    triggerId = 'dropdownUserAvatarButton',
    dropdownId = 'dropdownAvatar',
    userName = 'Bonnie Green',
    userEmail = 'name@flowbite.com',
  } = options;
  const initials = userName.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase();
  return `
<button id="${triggerId}" data-dropdown-toggle="${dropdownId}" type="button" class="flex text-sm rounded-full focus:ring-4 focus:ring-brand-medium">
  <span class="sr-only">Open user menu</span>
  <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-brand-softer text-fg-brand-strong text-xs font-semibold">${initials}</span>
</button>

<div id="${dropdownId}" class="hidden z-50 my-4 text-base list-none bg-neutral-primary-soft divide-y divide-default rounded-base shadow-lg border border-default">
  <div class="px-4 py-3">
    <span class="block text-sm font-semibold text-heading">${userName}</span>
    <span class="block text-sm text-body truncate">${userEmail}</span>
  </div>
  <ul class="py-2" aria-labelledby="${triggerId}">
    <li><a href="#" class="block px-4 py-2 text-sm text-body hover:bg-neutral-tertiary hover:text-heading">Dashboard</a></li>
    <li><a href="#" class="block px-4 py-2 text-sm text-body hover:bg-neutral-tertiary hover:text-heading">Settings</a></li>
    <li><a href="#" class="block px-4 py-2 text-sm text-body hover:bg-neutral-tertiary hover:text-heading">Earnings</a></li>
  </ul>
  <div class="py-2">
    <a href="#" class="block px-4 py-2 text-sm text-body hover:bg-neutral-tertiary hover:text-heading">Sign out</a>
  </div>
</div>`.trim();
}

/**
 * Renders the Flowbite Navbar Dropdown (mega-menu style link).
 * @param {Object} [options={}]
 * @param {string} [options.triggerId='dropdownNavbarLink']
 * @param {string} [options.dropdownId='dropdownNavbar']
 * @returns {string} HTML markup
 */
export function renderFlowbiteDropdownNavbar(options = {}) {
  const {
    triggerId = 'dropdownNavbarLink',
    dropdownId = 'dropdownNavbar',
  } = options;
  return `
<nav class="bg-neutral-primary-soft border border-default rounded-base shadow-xs px-4 py-2 inline-flex items-center gap-4">
  <button id="${triggerId}" data-dropdown-toggle="${dropdownId}" class="flex items-center justify-between w-full text-sm font-medium text-body hover:text-heading focus:outline-none px-2 py-1.5 rounded hover:bg-neutral-tertiary" type="button">
    Dropdown
    <svg class="w-2.5 h-2.5 ms-2" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 10 6">
      <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m1 1 4 4 4-4"/>
    </svg>
  </button>
</nav>

<div id="${dropdownId}" class="hidden z-10 font-normal bg-neutral-primary-soft divide-y divide-default rounded-base shadow-lg w-44 border border-default">
  <ul class="py-2 text-sm text-body" aria-labelledby="${triggerId}">
    <li><a href="#" class="block px-4 py-2 hover:bg-neutral-tertiary hover:text-heading">Overview</a></li>
    <li><a href="#" class="block px-4 py-2 hover:bg-neutral-tertiary hover:text-heading">My downloads</a></li>
    <li><a href="#" class="block px-4 py-2 hover:bg-neutral-tertiary hover:text-heading">Billing</a></li>
    <li><a href="#" class="block px-4 py-2 hover:bg-neutral-tertiary hover:text-heading">Rewards</a></li>
  </ul>
  <div class="py-2">
    <a href="#" class="block px-4 py-2 text-sm text-body hover:bg-neutral-tertiary hover:text-heading">Sign out</a>
  </div>
</div>`.trim();
}

/**
 * Renders a Flowbite Dropdown Datepicker example.
 * @param {Object} [options={}]
 * @param {string} [options.triggerId='dateRangeButton']
 * @param {string} [options.dropdownId='dateRangeDropdown']
 * @returns {string} HTML markup
 */
export function renderFlowbiteDropdownDatepicker(options = {}) {
  const {
    triggerId = 'dateRangeButton',
    dropdownId = 'dateRangeDropdown',
  } = options;
  return `
<button id="${triggerId}" data-dropdown-toggle="${dropdownId}" data-dropdown-ignore-click-outside-class="datepicker" type="button" class="inline-flex items-center justify-center text-body bg-neutral-primary-soft border border-default-medium hover:bg-neutral-tertiary hover:text-heading focus:ring-4 focus:ring-neutral-tertiary shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none">
  <svg class="w-4 h-4 text-body me-2" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
    <path d="M20 4a2 2 0 0 0-2-2h-2V1a1 1 0 0 0-2 0v1h-3V1a1 1 0 0 0-2 0v1H6V1a1 1 0 0 0-2 0v1H2a2 2 0 0 0-2 2v2h20V4ZM0 18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8H0v10Zm5-8h10a1 1 0 0 1 0 2H5a1 1 0 0 1 0-2Z"/>
  </svg>
  Last 30 days
  <svg class="w-2.5 h-2.5 ms-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 10 6">
    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m1 1 4 4 4-4"/>
  </svg>
</button>

<div id="${dropdownId}" class="hidden z-10 bg-neutral-primary-soft divide-y divide-default rounded-base shadow-lg p-4 border border-default">
  <div class="datepicker">
    <p class="text-sm text-body mb-3">Select a date range:</p>
    <div class="flex gap-3">
      <div>
        <label class="block text-xs font-medium text-body mb-1">Start date</label>
        <input type="date" class="block w-full p-2 text-sm text-heading border border-default-medium rounded-base bg-neutral-secondary-medium focus:ring-brand focus:border-brand">
      </div>
      <div>
        <label class="block text-xs font-medium text-body mb-1">End date</label>
        <input type="date" class="block w-full p-2 text-sm text-heading border border-default-medium rounded-base bg-neutral-secondary-medium focus:ring-brand focus:border-brand">
      </div>
    </div>
    <div class="flex justify-end mt-3 gap-2">
      <button type="button" class="text-body bg-neutral-secondary-medium box-border border border-default-medium hover:bg-neutral-tertiary-medium font-medium text-sm px-3 py-1.5 rounded-base">Cancel</button>
      <button type="button" class="text-white bg-brand hover:bg-brand-strong font-medium text-sm px-3 py-1.5 rounded-base">Apply</button>
    </div>
  </div>
</div>`.trim();
}

/**
 * Renders the complete Flowbite Dropdown showcase with all variants.
 * @returns {string} HTML markup
 */
export function renderFlowbiteDropdownShowcase() {
  return `
<div class="flowbite-dropdown-showcase space-y-8 p-4">
  <h3 class="text-base font-semibold text-heading mb-6">Flowbite Dropdown Components</h3>

  <!-- 1. Default Dropdown -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-4">1. Default Dropdown</h4>
    <div class="relative inline-block">
      ${renderFlowbiteDropdown()}
    </div>
  </div>

  <!-- 2. Hover Dropdown -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-4">2. Hover Trigger</h4>
    <div class="relative inline-block">
      ${renderFlowbiteDropdownHover()}
    </div>
  </div>

  <!-- 3. Dropdown Header (User profile + PRO badge + toggle) -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-4">3. Dropdown Header</h4>
    <div class="relative inline-block">
      ${renderFlowbiteDropdownHeader()}
    </div>
  </div>

  <!-- 4. Multi-level Dropdown -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-4">4. Multi-Level Dropdown</h4>
    <div class="relative inline-block">
      ${renderFlowbiteMultiLevelDropdown()}
    </div>
  </div>

  <!-- 5. Checkbox Dropdown -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-4">5. Checkbox Dropdown</h4>
    <div class="relative inline-block">
      ${renderFlowbiteDropdownCheckbox()}
    </div>
  </div>

  <!-- 6. Radio Dropdown -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-4">6. Radio Dropdown</h4>
    <div class="relative inline-block">
      ${renderFlowbiteDropdownRadio()}
    </div>
  </div>

  <!-- 7. Toggle Switch Dropdown -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-4">7. Toggle Switch Dropdown</h4>
    <div class="relative inline-block">
      ${renderFlowbiteDropdownToggleSwitch()}
    </div>
  </div>

  <!-- 8. Scrollable User List Dropdown -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-4">8. Scrollable User List</h4>
    <div class="relative inline-block">
      ${renderFlowbiteDropdownScrolling()}
    </div>
  </div>

  <!-- 9. Search Dropdown -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-4">9. Search Dropdown</h4>
    <div class="relative inline-block">
      ${renderFlowbiteDropdownSearch()}
    </div>
  </div>

  <!-- 10. Notification Bell -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-4">10. Notification Bell</h4>
    <div class="relative inline-block">
      ${renderFlowbiteDropdownNotification()}
    </div>
  </div>

  <!-- 11. User Avatar Dropdown -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-4">11. User Avatar Dropdown</h4>
    <div class="relative inline-block">
      ${renderFlowbiteDropdownUserAvatar()}
    </div>
  </div>

  <!-- 12. Navbar Dropdown -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-4">12. Navbar Dropdown</h4>
    <div class="relative inline-block">
      ${renderFlowbiteDropdownNavbar()}
    </div>
  </div>

  <!-- 13. Datepicker Dropdown -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-4">13. Datepicker Dropdown</h4>
    <div class="relative inline-block">
      ${renderFlowbiteDropdownDatepicker()}
    </div>
  </div>
</div>
  `.trim();
}

/* ============================================================
   FLOWBITE FOOTER GENERATORS
   ============================================================ */

/**
 * Renders the default Flowbite Footer.
 * @param {Object} [options={}]
 * @param {string} [options.brand='Flowbite™']
 * @param {string} [options.brandUrl='https://flowbite.com/']
 * @param {number} [options.year]
 * @param {Array<{label:string,href:string}>} [options.links]
 * @returns {string} HTML markup
 */
export function renderFlowbiteFooter(options = {}) {
  const {
    brand = 'Flowbite™',
    brandUrl = 'https://flowbite.com/',
    year = 2023,
    logo = null,
    links = [
      { label: 'About', href: '#' },
      { label: 'Privacy Policy', href: '#' },
      { label: 'Licensing', href: '#' },
      { label: 'Contact', href: '#' },
    ],
    className = 'bg-neutral-primary-soft rounded-base shadow-xs border border-default m-4',
  } = options;

  const linkItems = links
    .map(
      (l, i) =>
        `<li><a href="${l.href}" class="hover:underline${i < links.length - 1 ? ' me-4 md:me-6' : ''}">${l.label}</a></li>`
    )
    .join('\n        ');

  const logoMarkup = logo ? `${logo} ` : '';

  return `
<footer class="${className}">
  <div class="w-full mx-auto max-w-screen-xl p-4 md:flex md:items-center md:justify-between">
    <span class="text-sm text-body sm:text-center inline-flex items-center gap-1.5 flex-wrap">
      &copy; ${year} ${logoMarkup}<a href="${brandUrl}" class="hover:underline">${brand}</a>. All Rights Reserved.
    </span>
    <ul class="flex flex-wrap items-center mt-3 text-sm font-medium text-body sm:mt-0">
        ${linkItems}
    </ul>
  </div>
</footer>`.trim();
}

/**
 * Renders a Flowbite Footer with logo and sitemap columns.
 * @param {Object} [options={}]
 * @param {string} [options.brand='Flowbite']
 * @param {string} [options.brandUrl='https://flowbite.com/']
 * @param {string} [options.tagline]
 * @param {number} [options.year]
 * @param {Array<{heading:string, links:Array<{label:string,href:string}>}>} [options.columns]
 * @returns {string} HTML markup
 */
export function renderFlowbiteFooterSitemap(options = {}) {
  const {
    brand = 'Flowbite',
    brandUrl = 'https://flowbite.com/',
    tagline = 'Open-source library of over 400+ web components.',
    year = 2023,
    columns = [
      {
        heading: 'Resources',
        links: [
          { label: 'Flowbite', href: '#' },
          { label: 'Tailwind CSS', href: '#' },
          { label: 'Components', href: '#' },
        ],
      },
      {
        heading: 'Follow us',
        links: [
          { label: 'Github', href: '#' },
          { label: 'Discord', href: '#' },
          { label: 'Twitter', href: '#' },
        ],
      },
      {
        heading: 'Legal',
        links: [
          { label: 'Privacy Policy', href: '#' },
          { label: 'Licensing', href: '#' },
          { label: 'Terms', href: '#' },
        ],
      },
    ],
  } = options;

  const columnHtml = columns
    .map(
      (col) => `
    <div>
      <h2 class="mb-6 text-sm font-semibold text-heading uppercase">${col.heading}</h2>
      <ul class="text-body font-medium">
        ${col.links.map((l) => `<li class="mb-4"><a href="${l.href}" class="hover:underline">${l.label}</a></li>`).join('\n        ')}
      </ul>
    </div>`
    )
    .join('\n');

  return `
<footer class="bg-neutral-primary-soft border border-default">
  <div class="mx-auto w-full max-w-screen-xl p-4 py-6 lg:py-8">
    <div class="md:flex md:justify-between">
      <div class="mb-6 md:mb-0">
        <a href="${brandUrl}" class="flex items-center">
          <span class="self-center text-2xl font-semibold whitespace-nowrap text-heading">${brand}</span>
        </a>
        <p class="mt-2 text-sm text-body max-w-xs">${tagline}</p>
      </div>
      <div class="grid grid-cols-2 gap-8 sm:grid-cols-3">
        ${columnHtml}
      </div>
    </div>
    <hr class="my-6 border-default sm:mx-auto">
    <div class="sm:flex sm:items-center sm:justify-between">
      <span class="text-sm text-body sm:text-center">
        &copy; ${year} <a href="${brandUrl}" class="hover:underline">${brand}&#x2122;</a>. All Rights Reserved.
      </span>
    </div>
  </div>
</footer>`.trim();
}

/**
 * Renders a Flowbite Footer with social media icons.
 * @param {Object} [options={}]
 * @param {string} [options.brand='Flowbite']
 * @param {string} [options.brandUrl='https://flowbite.com/']
 * @param {number} [options.year]
 * @param {Array<{label:string,href:string}>} [options.links]
 * @returns {string} HTML markup
 */
export function renderFlowbiteFooterSocial(options = {}) {
  const {
    brand = 'Flowbite',
    brandUrl = 'https://flowbite.com/',
    year = 2023,
    links = [
      { label: 'About', href: '#' },
      { label: 'Privacy Policy', href: '#' },
      { label: 'Licensing', href: '#' },
      { label: 'Contact', href: '#' },
    ],
  } = options;

  const socialLinks = [
    {
      label: 'Facebook',
      href: '#',
      svg: `<svg class="w-4 h-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 8 19"><path fill-rule="evenodd" d="M6.135 3H8V0H6.135a4.147 4.147 0 0 0-4.142 4.142V6H0v3h2v9.938h3V9h2.021l.592-3H5V3.591A.6.6 0 0 1 5.592 3h.543Z" clip-rule="evenodd"/></svg>`,
    },
    {
      label: 'Twitter',
      href: '#',
      svg: `<svg class="w-4 h-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 17"><path fill-rule="evenodd" d="M20 1.892a8.178 8.178 0 0 1-2.355.635 4.074 4.074 0 0 0 1.8-2.235 8.344 8.344 0 0 1-2.605.981A4.13 4.13 0 0 0 13.85 0a4.068 4.068 0 0 0-4.1 4.038 4 4 0 0 0 .105.919A11.705 11.705 0 0 1 1.4.734a4.006 4.006 0 0 0 1.268 5.392 4.165 4.165 0 0 1-1.859-.5v.05A4.057 4.057 0 0 0 4.1 9.635a4.19 4.19 0 0 1-1.856.07 4.108 4.108 0 0 0 3.831 2.807A8.36 8.36 0 0 1 0 14.184 11.732 11.732 0 0 0 6.291 16 11.502 11.502 0 0 0 17.964 4.5c0-.177 0-.35-.012-.523A8.143 8.143 0 0 0 20 1.892Z" clip-rule="evenodd"/></svg>`,
    },
    {
      label: 'GitHub',
      href: '#',
      svg: `<svg class="w-4 h-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 .333A9.911 9.911 0 0 0 6.866 19.65c.5.092.678-.215.678-.477 0-.237-.01-1.017-.014-1.845-2.757.6-3.338-1.169-3.338-1.169a2.627 2.627 0 0 0-1.1-1.451c-.9-.615.07-.6.07-.6a2.084 2.084 0 0 1 1.518 1.021 2.11 2.11 0 0 0 2.884.823c.044-.503.268-.973.63-1.325-2.2-.25-4.516-1.1-4.516-4.9A3.832 3.832 0 0 1 4.7 7.068a3.56 3.56 0 0 1 .095-2.623s.832-.266 2.726 1.016a9.409 9.409 0 0 1 4.962 0c1.89-1.282 2.717-1.016 2.717-1.016.366.83.402 1.768.1 2.623a3.827 3.827 0 0 1 1.02 2.659c0 3.807-2.319 4.644-4.525 4.889a2.366 2.366 0 0 1 .673 1.834c0 1.326-.012 2.394-.012 2.72 0 .263.18.572.681.475A9.911 9.911 0 0 0 10 .333Z" clip-rule="evenodd"/></svg>`,
    },
  ];

  const linkItems = links
    .map((l, i) => `<li><a href="${l.href}" class="hover:underline${i < links.length - 1 ? ' me-4 md:me-6' : ''}">${l.label}</a></li>`)
    .join('\n        ');

  const socialItems = socialLinks
    .map((s) => `<a href="${s.href}" class="text-body hover:text-heading ms-4" aria-label="${s.label}">${s.svg}<span class="sr-only">${s.label}</span></a>`)
    .join('\n      ');

  return `
<footer class="bg-neutral-primary-soft border border-default rounded-base shadow-xs m-4">
  <div class="mx-auto w-full max-w-screen-xl p-4 md:py-8">
    <div class="sm:flex sm:items-center sm:justify-between">
      <a href="${brandUrl}" class="flex items-center mb-4 sm:mb-0 space-x-3 rtl:space-x-reverse">
        <span class="self-center text-xl font-semibold whitespace-nowrap text-heading">${brand}</span>
      </a>
      <ul class="flex flex-wrap items-center mb-6 text-sm font-medium text-body sm:mb-0">
        ${linkItems}
      </ul>
    </div>
    <hr class="my-6 border-default sm:mx-auto">
    <div class="sm:flex sm:items-center sm:justify-between">
      <span class="text-sm text-body sm:text-center">
        &copy; ${year} <a href="${brandUrl}" class="hover:underline">${brand}&#x2122;</a>. All Rights Reserved.
      </span>
      <div class="flex mt-4 sm:justify-center sm:mt-0">
        ${socialItems}
      </div>
    </div>
  </div>
</footer>`.trim();
}

/**
 * Renders a Flowbite Sticky Footer (fixed to bottom of viewport).
 * @param {Object} [options={}]
 * @param {string} [options.brand='Flowbite']
 * @param {string} [options.brandUrl='https://flowbite.com/']
 * @param {number} [options.year]
 * @returns {string} HTML markup
 */
export function renderFlowbiteFooterSticky(options = {}) {
  const {
    brand = 'Flowbite',
    brandUrl = 'https://flowbite.com/',
    year = 2023,
  } = options;
  return `
<footer class="fixed bottom-0 left-0 z-20 w-full p-4 bg-neutral-primary-soft border-t border-default shadow-xs md:flex md:items-center md:justify-between md:p-6">
  <span class="text-sm text-body sm:text-center">
    &copy; ${year} <a href="${brandUrl}" class="hover:underline">${brand}&#x2122;</a>. All Rights Reserved.
  </span>
  <ul class="flex flex-wrap items-center mt-3 text-sm font-medium text-body sm:mt-0">
    <li><a href="#" class="hover:underline me-4 md:me-6">About</a></li>
    <li><a href="#" class="hover:underline me-4 md:me-6">Privacy Policy</a></li>
    <li><a href="#" class="hover:underline me-4 md:me-6">Licensing</a></li>
    <li><a href="#" class="hover:underline">Contact</a></li>
  </ul>
</footer>`.trim();
}

/* ============================================================
   FLOWBITE INDICATOR GENERATORS
   ============================================================ */

/**
 * Renders a Flowbite Legend Indicator row (coloured dot + label).
 * @param {Object} [options={}]
 * @param {Array<{label:string, color:string}>} [options.items]
 * @returns {string} HTML markup
 */
export function renderFlowbiteLegendIndicator(options = {}) {
  const {
    items = [
      { label: 'Visitors', color: 'bg-brand' },
      { label: 'Sessions', color: 'bg-purple' },
      { label: 'Customers', color: 'bg-indigo' },
      { label: 'Revenue', color: 'bg-teal' },
    ],
  } = options;

  return items
    .map(
      (item) =>
        `<span class="flex items-center text-sm font-medium text-heading me-3"><span class="flex w-2.5 h-2.5 ${item.color} rounded-full me-1.5 shrink-0"></span>${item.label}</span>`
    )
    .join('\n');
}

/**
 * Renders a Flowbite Count Indicator button.
 * @param {Object} [options={}]
 * @param {string} [options.label='Messages']
 * @param {number} [options.count=8]
 * @param {string} [options.id='indicatorCountBtn']
 * @returns {string} HTML markup
 */
export function renderFlowbiteCountIndicator(options = {}) {
  const {
    label = 'Messages',
    count = 8,
    id = 'indicatorCountBtn',
  } = options;
  return `
<button type="button" id="${id}" class="relative inline-flex items-center text-white bg-brand box-border border border-transparent hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none">
  <svg class="w-4 h-4 me-1.5 -ms-0.5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 13h3.439a.991.991 0 0 1 .908.6 3.978 3.978 0 0 0 7.306 0 .99.99 0 0 1 .908-.6H20M4 13v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6M4 13l2-9h12l2 9M9 7h6m-7 3h8"/></svg>
  <span class="sr-only">Notifications</span>
  ${label}
  <div class="absolute inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-white bg-danger border-2 border-buffer rounded-full -top-2 -end-2">${count}</div>
</button>`.trim();
}

/**
 * Renders Flowbite Status Indicators (avatar + online/offline dot).
 * @param {Object} [options={}]
 * @param {Array<{status:'online'|'offline'|'away', imgAlt:string}>} [options.users]
 * @returns {string} HTML markup
 */
export function renderFlowbiteStatusIndicator(options = {}) {
  const {
    users = [
      { status: 'online', imgAlt: 'User online' },
      { status: 'offline', imgAlt: 'User offline' },
    ],
  } = options;

  const statusColor = (s) => {
    if (s === 'online') return 'bg-success';
    if (s === 'offline') return 'bg-danger';
    return 'bg-warning';
  };

  const avatarInitials = (alt) => {
    const cleaned = alt.replace(/User\s*/i, '').replace(/[^a-zA-Z]/g, '');
    return (cleaned.substring(0, 2).toUpperCase() || 'US');
  };

  return users
    .map(
      (u) => `<div class="relative me-4">
  <div class="w-10 h-10 rounded-full bg-brand-softer inline-flex items-center justify-center text-fg-brand-strong text-sm font-semibold" title="${u.imgAlt}">${avatarInitials(u.imgAlt)}</div>
  <span class="top-0 start-7 absolute w-3.5 h-3.5 ${statusColor(u.status)} border-2 border-buffer rounded-full"></span>
</div>`
    )
    .join('\n');
}

/**
 * Renders a Flowbite Badge Indicator list (user list with availability badges).
 * @param {Object} [options={}]
 * @param {Array<{name:string, email:string, available:boolean}>} [options.users]
 * @returns {string} HTML markup
 */
export function renderFlowbiteBadgeIndicator(options = {}) {
  const {
    users = [
      { name: 'Neil Sims', email: 'email@flowbite.com', available: true },
      { name: 'Bonnie Green', email: 'email@flowbite.com', available: false },
    ],
  } = options;

  const initials = (name) =>
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();

  const listItems = users
    .map(
      (u) => `  <li class="py-3 sm:py-4">
    <div class="flex items-center space-x-3 rtl:space-x-reverse">
      <div class="shrink-0">
        <div class="w-8 h-8 rounded-full bg-brand-softer inline-flex items-center justify-center text-fg-brand-strong text-xs font-semibold">${initials(u.name)}</div>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold text-heading truncate">${u.name}</p>
        <p class="text-sm text-body truncate">${u.email}</p>
      </div>
      ${u.available
        ? `<span class="inline-flex items-center bg-success-soft border border-success-subtle text-fg-success-strong text-xs font-medium px-1.5 py-0.5 rounded-sm"><span class="w-2 h-2 me-1 bg-success rounded-full"></span>Available</span>`
        : `<span class="inline-flex items-center bg-danger-soft border border-danger-subtle text-fg-danger-strong text-xs font-medium px-1.5 py-0.5 rounded-sm"><span class="w-2 h-2 me-1 bg-danger rounded-full"></span>Unavailable</span>`}
    </div>
  </li>`
    )
    .join('\n');

  return `<ul role="list" class="max-w-md divide-y divide-default">
${listItems}
</ul>`.trim();
}

/**
 * Renders a Flowbite Loading Indicator card.
 * @param {Object} [options={}]
 * @param {string} [options.label='loading...']
 * @param {string} [options.wClass='w-56']
 * @param {string} [options.hClass='h-56']
 * @returns {string} HTML markup
 */
export function renderFlowbiteLoadingIndicator(options = {}) {
  const {
    label = 'loading...',
    wClass = 'w-56',
    hClass = 'h-56',
  } = options;
  return `
<div class="flex items-center justify-center bg-neutral-secondary-soft ${hClass} ${wClass} border border-default text-fg-brand-strong text-xs font-medium rounded-base">
  <div class="px-2 py-px ring-brand-subtle text-fg-brand-strong text-xs font-medium rounded-sm bg-brand-softer animate-pulse">${label}</div>
</div>`.trim();
}

/**
 * Renders the complete Flowbite Footer and Indicator showcase.
 * @returns {string} HTML markup
 */
export function renderFlowbiteFooterIndicatorShowcase() {
  return `
<div class="flowbite-footer-indicator-showcase space-y-10 p-4">
  <h3 class="text-base font-semibold text-heading mb-6">Flowbite Footer &amp; Indicator Components</h3>

  <!-- 1. Default Footer -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-4">1. Default Footer</h4>
    ${renderFlowbiteFooter()}
  </div>

  <!-- 2. Sitemap Footer -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-4">2. Sitemap Footer</h4>
    ${renderFlowbiteFooterSitemap()}
  </div>

  <!-- 3. Social Footer -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-4">3. Social Footer</h4>
    ${renderFlowbiteFooterSocial()}
  </div>

  <!-- 4. Legend Indicators -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-4">4. Legend Indicators</h4>
    <div class="flex flex-wrap gap-2">
      ${renderFlowbiteLegendIndicator()}
    </div>
  </div>

  <!-- 5. Count Indicator -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-4">5. Count Indicator</h4>
    <div class="relative inline-block">
      ${renderFlowbiteCountIndicator()}
    </div>
  </div>

  <!-- 6. Status Indicators -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-4">6. Status Indicators (Online / Offline)</h4>
    <div class="flex items-center gap-2">
      ${renderFlowbiteStatusIndicator()}
    </div>
  </div>

  <!-- 7. Badge Indicator List -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-4">7. Badge Indicators</h4>
    ${renderFlowbiteBadgeIndicator()}
  </div>

  <!-- 8. Loading Indicator -->
  <div>
    <h4 class="text-xs font-semibold text-body uppercase tracking-wider mb-4">8. Loading Indicator</h4>
    ${renderFlowbiteLoadingIndicator()}
  </div>
</div>
  `.trim();
}













