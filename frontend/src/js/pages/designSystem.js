/**
 * =============================================================================
 * ZAMORIN CAFÉ ERP — DESIGN SYSTEM SHOWCASE
 * =============================================================================
 * A living component library demonstrating all Flowbite-integrated UI primitives
 * built for the Zamorin Café ERP. Accessible only to Primary Master role.
 *
 * Organised into sections:
 *   1.  Typography
 *   2.  Buttons & Button Groups
 *   3.  Badges
 *   4.  Avatars
 *   5.  Indicators (Legend, Count, Status, Badge, Loading)
 *   6.  Clipboard
 *   7.  Datepicker & Timepicker
 *   8.  Dropdowns (all 13 variants)
 *   9.  Drawers (all variants)
 *   10. Device Mockups
 *   11. Banners & Bottom Navigation
 *   12. Footers (all 4 variants)
 *   13. RTL / Directionality
 *   14. Accordion & Dismiss
 * =============================================================================
 */

import {
  renderFlowbiteTypography,
  renderFlowbiteButton,
  renderFlowbiteButtonsShowcase,
  renderFlowbiteButtonGroup,
  renderFlowbiteButtonGroupShowcase,
  renderFlowbiteBadge,
  renderFlowbiteBadgesShowcase,
  renderFlowbiteAvatarShowcase,
  renderFlowbiteLegendIndicator,
  renderFlowbiteCountIndicator,
  renderFlowbiteStatusIndicator,
  renderFlowbiteBadgeIndicator,
  renderFlowbiteLoadingIndicator,
  renderFlowbiteClipboardShowcase,
  renderFlowbiteDatepickerShowcase,
  renderFlowbiteDropdownShowcase,
  renderFlowbiteDrawerShowcase,
  renderFlowbiteDeviceMockupShowcase,
  renderFlowbiteBannerAndBottomNavShowcase,
  renderFlowbiteFooter,
  renderFlowbiteFooterSitemap,
  renderFlowbiteFooterSocial,
  renderFlowbiteFooterSticky,
  renderFlowbiteFooterIndicatorShowcase,
  renderFlowbiteRtlNav,
  renderNestedAccordionSample,
  initAccordions,
  initDropdowns,
  initDrawers,
  initCopyClipboards,
  initDatepickers,
  initDismiss,
} from '../flowbiteUtils.js';
import { state } from '../state.js';

// ─── Section registry ──────────────────────────────────────────────────────────
// Each entry: { id, label, icon, render }
const SECTIONS = [
  {
    id: 'typography',
    label: 'Typography',
    icon: '𝑻',
    render: () => renderFlowbiteTypography(),
  },
  {
    id: 'buttons',
    label: 'Buttons',
    icon: '⬛',
    render: () => renderFlowbiteButtonsShowcase(),
  },
  {
    id: 'button-groups',
    label: 'Button Groups',
    icon: '▪▪▪',
    render: () => renderFlowbiteButtonGroupShowcase(),
  },
  {
    id: 'badges',
    label: 'Badges',
    icon: '🏷',
    render: () => renderFlowbiteBadgesShowcase(),
  },
  {
    id: 'avatars',
    label: 'Avatars',
    icon: '👤',
    render: () => renderFlowbiteAvatarShowcase(),
  },
  {
    id: 'indicators',
    label: 'Indicators',
    icon: '●',
    render: () => renderFlowbiteFooterIndicatorShowcase(),
  },
  {
    id: 'clipboard',
    label: 'Clipboard',
    icon: '📋',
    render: () => renderFlowbiteClipboardShowcase(),
  },
  {
    id: 'datepicker',
    label: 'Datepicker',
    icon: '📅',
    render: () => renderFlowbiteDatepickerShowcase(),
  },
  {
    id: 'dropdowns',
    label: 'Dropdowns',
    icon: '▾',
    render: () => renderFlowbiteDropdownShowcase(),
  },
  {
    id: 'drawers',
    label: 'Drawers',
    icon: '◫',
    render: () => renderFlowbiteDrawerShowcase(),
  },
  {
    id: 'device-mockups',
    label: 'Device Mockups',
    icon: '📱',
    render: () => renderFlowbiteDeviceMockupShowcase(),
  },
  {
    id: 'banners',
    label: 'Banners & Nav',
    icon: '📢',
    render: () => renderFlowbiteBannerAndBottomNavShowcase(),
  },
  {
    id: 'footers',
    label: 'Footers',
    icon: '⊥',
    render: () => _renderFooterSection(),
  },
  {
    id: 'rtl',
    label: 'RTL / i18n',
    icon: '↔',
    render: () => renderFlowbiteRtlNav(),
  },
  {
    id: 'accordions',
    label: 'Accordions',
    icon: '⊞',
    render: () => renderNestedAccordionSample(),
  },
];

// ─── Footer section (combines all 4 variants clearly) ─────────────────────────
function _renderFooterSection() {
  return `
<div class="space-y-8">
  <div>
    <p class="text-xs font-semibold text-body uppercase tracking-widest mb-3">1 · Default Footer</p>
    ${renderFlowbiteFooter({ brand: 'Zamorin Café ERP', year: 2025 })}
  </div>
  <div>
    <p class="text-xs font-semibold text-body uppercase tracking-widest mb-3">2 · Sitemap Footer</p>
    ${renderFlowbiteFooterSitemap({
      brand: 'Zamorin Café',
      year: 2025,
      tagline: 'Full-stack Café Management ERP',
      columns: [
        { heading: 'Operations', links: [{ label: 'POS & Billing', href: '#' }, { label: 'Inventory', href: '#' }, { label: 'Procurement', href: '#' }] },
        { heading: 'Finance', links: [{ label: 'Cash Book', href: '#' }, { label: 'Payroll', href: '#' }, { label: 'Reports', href: '#' }] },
        { heading: 'System', links: [{ label: 'Settings', href: '#' }, { label: 'System Health', href: '#' }, { label: 'Design System', href: '#' }] },
      ],
    })}
  </div>
  <div>
    <p class="text-xs font-semibold text-body uppercase tracking-widest mb-3">3 · Social Footer</p>
    ${renderFlowbiteFooterSocial({ brand: 'Zamorin Café', year: 2025 })}
  </div>
  <div>
    <p class="text-xs font-semibold text-body uppercase tracking-widest mb-3">4 · Sticky Footer (preview — not actually fixed here)</p>
    <div class="relative overflow-hidden rounded-base border border-default" style="height:80px;">
      <div class="absolute bottom-0 left-0 right-0">
        ${renderFlowbiteFooterSticky({ brand: 'Zamorin Café', year: 2025 }).replace('fixed bottom-0 left-0 z-20', 'relative')}
      </div>
    </div>
  </div>
</div>
  `.trim();
}

// ─── Shell renderer ────────────────────────────────────────────────────────────
export function renderDesignSystem() {
  const navItems = SECTIONS.map(
    (s) => `
    <li>
      <button
        class="ds-nav-btn w-full flex items-center gap-2.5 px-3 py-2 rounded-base text-sm font-medium text-body hover:bg-neutral-secondary-soft hover:text-heading transition-colors"
        data-ds-section="${s.id}"
        id="ds-nav-${s.id}"
        type="button"
      >
        <span class="text-base leading-none opacity-70" aria-hidden="true">${s.icon}</span>
        <span>${s.label}</span>
      </button>
    </li>`
  ).join('');

  return `
<div id="ds-shell" class="flex min-h-screen bg-neutral-secondary-soft">

  <!-- ── Sidebar rail ──────────────────────────────────────────────────── -->
  <aside
    id="ds-sidebar"
    class="flex-shrink-0 w-56 bg-neutral-primary-soft border-r border-default flex flex-col sticky top-0 h-screen overflow-y-auto"
    aria-label="Component sections"
  >
    <div class="px-4 pt-5 pb-3 border-b border-default">
      <span class="text-xs font-bold text-body uppercase tracking-widest">Design System</span>
      <p class="text-[11px] text-neutral-tertiary mt-0.5">Flowbite Component Library</p>
    </div>
    <nav class="flex-1 px-2 py-3">
      <ul class="space-y-0.5" role="list">
        ${navItems}
      </ul>
    </nav>
    <div class="px-4 py-3 border-t border-default">
      <span class="text-[10px] text-neutral-tertiary">Zamorin Café ERP v1.0 · Master Only</span>
    </div>
  </aside>

  <!-- ── Main content ───────────────────────────────────────────────────── -->
  <main id="ds-main" class="flex-1 min-w-0 overflow-auto">

    <!-- Page header -->
    <header class="sticky top-0 z-10 bg-neutral-primary-soft border-b border-default px-6 py-4 flex items-center justify-between">
      <div>
        <h1 class="text-lg font-bold text-heading leading-tight" id="ds-section-title">Flowbite Design System</h1>
        <p class="text-xs text-body mt-0.5" id="ds-section-sub">Select a component category from the sidebar</p>
      </div>
      <div class="flex items-center gap-2">
        <span class="inline-flex items-center bg-brand-softer border border-brand-subtle text-fg-brand-strong text-xs font-semibold px-2.5 py-1 rounded-full">
          PRIMARY MASTER
        </span>
        <span class="inline-flex items-center gap-1 text-xs text-body">
          <span class="w-2 h-2 rounded-full bg-success animate-pulse"></span>
          Live Components
        </span>
      </div>
    </header>

    <!-- Welcome / landing state -->
    <div id="ds-welcome" class="p-10 text-center">
      <div class="max-w-lg mx-auto">
        <div class="text-6xl mb-5">🎨</div>
        <h2 class="text-2xl font-bold text-heading mb-3">Zamorin Café ERP Design System</h2>
        <p class="text-body text-sm leading-relaxed mb-6">
          A living library of all UI primitives — Flowbite components adapted for the Zamorin
          design tokens. Select any section from the sidebar to preview fully wired, production-grade components.
        </p>
        <div class="grid grid-cols-2 gap-3 text-left text-sm">
          ${SECTIONS.map(s => `
          <button
            class="ds-nav-btn p-3 rounded-base border border-default bg-neutral-primary-soft hover:border-brand-subtle hover:bg-brand-softer transition-all text-left flex items-center gap-2"
            data-ds-section="${s.id}" type="button"
          >
            <span class="text-lg" aria-hidden="true">${s.icon}</span>
            <span class="font-medium text-heading text-sm">${s.label}</span>
          </button>`).join('')}
        </div>
      </div>
    </div>

    <!-- Section content pane -->
    <div id="ds-content" class="p-6 hidden"></div>

  </main>
</div>
  `.trim();
}

// ─── Wire: navigation + section switching ──────────────────────────────────────
export function wireDesignSystem(root) {
  if (!root) return;

  const contentPane = root.querySelector('#ds-content');
  const welcomePane = root.querySelector('#ds-welcome');
  const titleEl     = root.querySelector('#ds-section-title');
  const subEl       = root.querySelector('#ds-section-sub');

  function activateSection(sectionId) {
    const section = SECTIONS.find(s => s.id === sectionId);
    if (!section) return;

    // Update header
    if (titleEl) titleEl.textContent = section.label;
    if (subEl)   subEl.textContent   = `Flowbite · ${section.label} Components`;

    // Render content
    if (contentPane) {
      contentPane.innerHTML = `
        <div class="ds-section" data-section="${sectionId}">
          ${section.render()}
        </div>
      `;
      contentPane.classList.remove('hidden');
    }
    if (welcomePane) welcomePane.classList.add('hidden');

    // Highlight active nav button
    root.querySelectorAll('.ds-nav-btn').forEach(btn => {
      const isActive = btn.dataset.dsSection === sectionId;
      btn.classList.toggle('bg-brand-softer',        isActive);
      btn.classList.toggle('text-fg-brand-strong',   isActive);
      btn.classList.toggle('font-semibold',          isActive);
      btn.classList.toggle('border-brand-subtle',    isActive);
    });

    // Wire Flowbite interactivity after render
    requestAnimationFrame(() => {
      try { initDropdowns(contentPane);    } catch (_) {}
      try { initDrawers(contentPane);      } catch (_) {}
      try { initAccordions(contentPane);   } catch (_) {}
      try { initCopyClipboards(contentPane); } catch (_) {}
      try { initDatepickers(contentPane);  } catch (_) {}
      try { initDismiss(contentPane);      } catch (_) {}
    });

    // Scroll content pane to top
    if (contentPane) contentPane.scrollTop = 0;
  }

  // Attach click handlers to ALL ds-nav-btn buttons in the root
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ds-section]');
    if (btn) {
      e.preventDefault();
      activateSection(btn.dataset.dsSection);
    }
  });

  // Auto-open first section (Typography)
  activateSection(SECTIONS[0].id);
}
