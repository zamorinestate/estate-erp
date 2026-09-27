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
 *   13. Forms & Inputs
 *   14. Mega Menu
 *   15. Modals
 *   16. Navbars
 *   17. Pagination
 *   18. Popovers
 *   19. Progress Bars
 *   20. Sidebars
 *   21. RTL / Directionality
 *   22. Accordion & Dismiss
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
  renderFlowbiteFormsShowcase,
  renderFlowbiteMegaMenuShowcase,
  renderFlowbiteModalShowcase,
  renderFlowbiteNavbarShowcase,
  renderFlowbitePaginationShowcase,
  renderFlowbitePopoverShowcase,
  renderFlowbiteProgressShowcase,
  renderFlowbiteSidebarShowcase,
  initAccordions,
  initDropdowns,
  initDrawers,
  initCopyClipboards,
  initDatepickers,
  initDismiss,
  initCollapses,
  initModals,
  initPopovers,
  initProgressBars,
  initSidebars,
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
    id: 'forms',
    label: 'Forms & Inputs',
    icon: '📝',
    render: () => renderFlowbiteFormsShowcase(),
  },
  {
    id: 'mega-menu',
    label: 'Mega Menu',
    icon: '▤',
    render: () => renderFlowbiteMegaMenuShowcase(),
  },
  {
    id: 'modals',
    label: 'Modals',
    icon: '🗖',
    render: () => renderFlowbiteModalShowcase(),
  },
  {
    id: 'navbars',
    label: 'Navbars',
    icon: '🧭',
    render: () => renderFlowbiteNavbarShowcase(),
  },
  {
    id: 'pagination',
    label: 'Pagination',
    icon: '🔢',
    render: () => renderFlowbitePaginationShowcase(),
  },
  {
    id: 'popovers',
    label: 'Popovers',
    icon: '💬',
    render: () => renderFlowbitePopoverShowcase(),
  },
  {
    id: 'progress',
    label: 'Progress Bars',
    icon: '▰',
    render: () => renderFlowbiteProgressShowcase(),
  },
  {
    id: 'sidebars',
    label: 'Sidebars',
    icon: '◧',
    render: () => renderFlowbiteSidebarShowcase(),
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
        class="ds-nav-btn w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-blue-50 hover:text-blue-700 transition-all duration-150"
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
<div id="ds-shell" class="flex min-h-screen" style="background:#f0f4ff;">

  <!-- ── Sidebar rail ──────────────────────────────────────────────────── -->
  <aside
    id="ds-sidebar"
    class="flex-shrink-0 w-60 flex flex-col sticky top-0 h-screen overflow-y-auto"
    style="background:#ffffff; border-right:1px solid #dbeafe;"
    aria-label="Component sections"
  >
    <!-- Sidebar header -->
    <div class="px-4 pt-5 pb-4" style="border-bottom:1px solid #dbeafe; background:linear-gradient(135deg,#1d4ed8 0%,#2563eb 100%);">
      <div class="flex items-center gap-2 mb-1">
        <div class="w-7 h-7 rounded-lg flex items-center justify-center text-sm" style="background:rgba(255,255,255,0.2);">🎨</div>
        <span class="text-sm font-bold text-white tracking-wide">Design System</span>
      </div>
      <p class="text-xs" style="color:rgba(255,255,255,0.7); padding-left:2.25rem;">Flowbite · ${SECTIONS.length} Components</p>
    </div>

    <!-- Nav list -->
    <nav class="flex-1 px-2 py-3 overflow-y-auto">
      <ul class="space-y-0.5" role="list">
        ${navItems}
      </ul>
    </nav>

    <!-- Sidebar footer -->
    <div class="px-4 py-3" style="border-top:1px solid #dbeafe;">
      <span class="text-[10px]" style="color:#93c5fd;">Zamorin Café ERP · Master Only</span>
    </div>
  </aside>

  <!-- ── Main content ───────────────────────────────────────────────────── -->
  <main id="ds-main" class="flex-1 min-w-0 overflow-auto">

    <!-- Page header -->
    <header class="sticky top-0 z-10 px-6 py-4 flex items-center justify-between" style="background:#ffffff; border-bottom:1px solid #dbeafe; box-shadow:0 1px 8px rgba(37,99,235,0.08);">
      <div>
        <h1 class="text-lg font-bold leading-tight" style="color:#1e3a8a;" id="ds-section-title">Flowbite Design System</h1>
        <p class="text-xs mt-0.5" style="color:#64748b;" id="ds-section-sub">Select a component category from the sidebar</p>
      </div>
      <div class="flex items-center gap-3">
        <span class="inline-flex items-center text-xs font-semibold px-3 py-1 rounded-full" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;">
          PRIMARY MASTER
        </span>
        <span class="inline-flex items-center gap-1.5 text-xs" style="color:#64748b;">
          <span class="w-2 h-2 rounded-full animate-pulse" style="background:#22c55e;"></span>
          Live Components
        </span>
      </div>
    </header>

    <!-- Welcome / landing state -->
    <div id="ds-welcome" class="p-10 text-center">
      <div class="max-w-2xl mx-auto">
        <div class="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center text-4xl" style="background:linear-gradient(135deg,#dbeafe,#eff6ff); box-shadow:0 4px 20px rgba(37,99,235,0.15);">🎨</div>
        <h2 class="text-2xl font-bold mb-3" style="color:#1e3a8a;">Zamorin Café ERP — Design System</h2>
        <p class="text-sm leading-relaxed mb-8" style="color:#64748b;">
          A living library of all UI primitives — Flowbite components adapted for the Zamorin
          design tokens. Select any section from the sidebar or click a card below to preview
          fully wired, production-grade components.
        </p>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-left text-sm">
          ${SECTIONS.map(s => `
          <button
            class="ds-nav-btn p-3 rounded-xl text-left flex items-center gap-2.5 transition-all duration-150 group"
            style="background:#ffffff; border:1px solid #e2e8f0; box-shadow:0 1px 4px rgba(0,0,0,0.04);"
            onmouseover="this.style.borderColor='#93c5fd';this.style.background='#eff6ff';this.style.boxShadow='0 4px 12px rgba(37,99,235,0.12)';"
            onmouseout="this.style.borderColor='#e2e8f0';this.style.background='#ffffff';this.style.boxShadow='0 1px 4px rgba(0,0,0,0.04)';"
            data-ds-section="${s.id}" type="button"
          >
            <span class="text-lg flex-shrink-0" aria-hidden="true">${s.icon}</span>
            <span class="font-medium text-sm" style="color:#1e3a8a;">${s.label}</span>
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

    // Highlight active nav button — blue pill style
    root.querySelectorAll('.ds-nav-btn[data-ds-section]').forEach(btn => {
      const isActive = btn.dataset.dsSection === sectionId;
      if (isActive) {
        btn.style.background = '#eff6ff';
        btn.style.color = '#1d4ed8';
        btn.style.fontWeight = '600';
        btn.style.borderColor = '#bfdbfe';
      } else {
        btn.style.background = '';
        btn.style.color = '';
        btn.style.fontWeight = '';
        btn.style.borderColor = '';
      }
    });

    // Wire Flowbite interactivity after render
    requestAnimationFrame(() => {
      try { initDropdowns(contentPane);    } catch (_) {}
      try { initDrawers(contentPane);      } catch (_) {}
      try { initAccordions(contentPane);   } catch (_) {}
      try { initCopyClipboards(contentPane); } catch (_) {}
      try { initDatepickers(contentPane);  } catch (_) {}
      try { initDismiss(contentPane);      } catch (_) {}
      try { initCollapses(contentPane);    } catch (_) {}
      try { initModals(contentPane);       } catch (_) {}
      try { initPopovers(contentPane);     } catch (_) {}
      try { initProgressBars(contentPane); } catch (_) {}
      try { initSidebars(contentPane);     } catch (_) {}
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
