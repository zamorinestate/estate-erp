/**
 * test_flowbite_footer_indicators.mjs
 * Test suite for Flowbite Footer and Indicator generators.
 */
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── Setup happy-dom globals ───────────────────────────────────────
const HappyDomMod = await import('happy-dom');
const HappyDom = HappyDomMod.Window;
const win = new HappyDom({ url: 'http://localhost' });

function safeGlobal(key, value) {
  try { global[key] = value; } catch (_) {}
}
global.window = win;
global.document = win.document;
safeGlobal('HTMLElement', win.HTMLElement);
safeGlobal('Element', win.Element);
safeGlobal('Node', win.Node);
safeGlobal('navigator', win.navigator);
safeGlobal('location', win.location);
safeGlobal('localStorage', win.localStorage);
safeGlobal('sessionStorage', win.sessionStorage);

// ── Import module under test ──────────────────────────────────────
const utils = await import(`file:///${ROOT}/Frontend/src/js/flowbiteUtils.js`);

const {
  renderFlowbiteFooter,
  renderFlowbiteFooterSitemap,
  renderFlowbiteFooterSocial,
  renderFlowbiteFooterSticky,
  renderFlowbiteLegendIndicator,
  renderFlowbiteCountIndicator,
  renderFlowbiteStatusIndicator,
  renderFlowbiteBadgeIndicator,
  renderFlowbiteLoadingIndicator,
  renderFlowbiteFooterIndicatorShowcase,
} = utils;

// ── Harness ───────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function expect(description, value, expected) {
  if (value === expected) {
    console.log(`  ✅ ${description}`);
    passed++;
  } else {
    console.error(`  ❌ ${description}`);
    console.error(`     Expected: ${JSON.stringify(expected)}`);
    console.error(`     Got:      ${JSON.stringify(value)}`);
    failed++;
  }
}

function expectContains(description, html, fragment) {
  if (typeof html === 'string' && html.includes(fragment)) {
    console.log(`  ✅ ${description}`);
    passed++;
  } else {
    console.error(`  ❌ ${description}`);
    console.error(`     Expected HTML to contain: ${fragment}`);
    console.error(`     Got (first 300 chars): ${String(html).substring(0, 300)}`);
    failed++;
  }
}

function expectNotContains(description, html, fragment) {
  if (typeof html === 'string' && !html.includes(fragment)) {
    console.log(`  ✅ ${description}`);
    passed++;
  } else {
    console.error(`  ❌ ${description} — HTML should NOT contain: ${fragment}`);
    failed++;
  }
}

function expectTruthy(description, value) {
  if (value) {
    console.log(`  ✅ ${description}`);
    passed++;
  } else {
    console.error(`  ❌ ${description}: got ${JSON.stringify(value)}`);
    failed++;
  }
}

// ── SUITE 1: renderFlowbiteFooter ────────────────────────────────
console.log('\n📦 Suite 1: renderFlowbiteFooter (default)');
{
  const html = renderFlowbiteFooter();
  expectTruthy('returns a string', typeof html === 'string');
  expectContains('has <footer> tag', html, '<footer');
  expectContains('has bg-neutral-primary-soft', html, 'bg-neutral-primary-soft');
  expectContains('has max-w-screen-xl', html, 'max-w-screen-xl');
  expectContains('has md:flex', html, 'md:flex');
  expectContains('has copyright symbol', html, '&copy;');
  expectContains('has default year 2023', html, '2023');
  expectContains('has Flowbite™ brand', html, 'Flowbite™');
  expectContains('has About link', html, 'About');
  expectContains('has Privacy Policy link', html, 'Privacy Policy');
  expectContains('has Licensing link', html, 'Licensing');
  expectContains('has Contact link', html, 'Contact');
  expectContains('has hover:underline', html, 'hover:underline');
  expectContains('has me-4 spacing on non-last links', html, 'me-4');

  // Custom options
  const html2 = renderFlowbiteFooter({
    brand: 'Zamorin Café',
    brandUrl: 'https://zamorin.cafe/',
    year: 2025,
    links: [
      { label: 'Home', href: '/home' },
      { label: 'Support', href: '/support' },
    ],
  });
  expectContains('custom brand name', html2, 'Zamorin Café');
  expectContains('custom brandUrl', html2, 'https://zamorin.cafe/');
  expectContains('custom year', html2, '2025');
  expectContains('custom link Home', html2, 'Home');
  expectContains('custom link Support', html2, 'Support');
  expectNotContains('custom links do not have Privacy Policy', html2, 'Privacy Policy');
}

// ── SUITE 2: renderFlowbiteFooterSitemap ─────────────────────────
console.log('\n📦 Suite 2: renderFlowbiteFooterSitemap');
{
  const html = renderFlowbiteFooterSitemap();
  expectContains('has <footer> tag', html, '<footer');
  expectContains('has max-w-screen-xl', html, 'max-w-screen-xl');
  expectContains('has grid grid-cols-2', html, 'grid-cols-2');
  expectContains('has Resources heading', html, 'Resources');
  expectContains('has Follow us heading', html, 'Follow us');
  expectContains('has Legal heading', html, 'Legal');
  expectContains('has Flowbite column link', html, 'Flowbite');
  expectContains('has Github link', html, 'Github');
  expectContains('has Privacy Policy link', html, 'Privacy Policy');
  expectContains('has tagline', html, 'Open-source library');
  expectContains('has copyright year', html, '2023');
  expectContains('has <hr> separator', html, '<hr');

  const html2 = renderFlowbiteFooterSitemap({
    brand: 'Zamorin',
    year: 2026,
    tagline: 'Zamorin Café ERP',
    columns: [
      { heading: 'Menu', links: [{ label: 'Dashboard', href: '/dash' }] },
    ],
  });
  expectContains('custom brand in sitemap', html2, 'Zamorin');
  expectContains('custom year in sitemap', html2, '2026');
  expectContains('custom tagline', html2, 'Zamorin Café ERP');
  expectContains('custom column heading Menu', html2, 'Menu');
  expectContains('custom column link Dashboard', html2, 'Dashboard');
}

// ── SUITE 3: renderFlowbiteFooterSocial ──────────────────────────
console.log('\n📦 Suite 3: renderFlowbiteFooterSocial');
{
  const html = renderFlowbiteFooterSocial();
  expectContains('has <footer> tag', html, '<footer');
  expectContains('has max-w-screen-xl', html, 'max-w-screen-xl');
  expectContains('has copyright', html, '&copy;');
  expectContains('has Facebook social icon', html, 'Facebook');
  expectContains('has Twitter social icon', html, 'Twitter');
  expectContains('has GitHub social icon', html, 'GitHub');
  expectContains('has sr-only for social labels', html, 'sr-only');
  expectContains('has space-x-3 for brand name row', html, 'space-x-3');
  expectContains('has About footer link', html, 'About');
  expectContains('has <hr> separator', html, '<hr');

  const html2 = renderFlowbiteFooterSocial({ brand: 'Zamorin', year: 2024 });
  expectContains('custom brand in social footer', html2, 'Zamorin');
  expectContains('custom year in social footer', html2, '2024');
}

// ── SUITE 4: renderFlowbiteFooterSticky ──────────────────────────
console.log('\n📦 Suite 4: renderFlowbiteFooterSticky');
{
  const html = renderFlowbiteFooterSticky();
  expectContains('has fixed positioning', html, 'fixed');
  expectContains('has bottom-0', html, 'bottom-0');
  expectContains('has left-0', html, 'left-0');
  expectContains('has z-20', html, 'z-20');
  expectContains('has border-t', html, 'border-t');
  expectContains('has copyright', html, '&copy;');
  expectContains('has About link', html, 'About');
  expectContains('has sm:text-center', html, 'sm:text-center');

  const html2 = renderFlowbiteFooterSticky({ brand: 'CafeERP', year: 2025 });
  expectContains('custom brand in sticky footer', html2, 'CafeERP');
  expectContains('custom year in sticky footer', html2, '2025');
}

// ── SUITE 5: renderFlowbiteLegendIndicator ────────────────────────
console.log('\n📦 Suite 5: renderFlowbiteLegendIndicator');
{
  const html = renderFlowbiteLegendIndicator();
  expectTruthy('returns non-empty string', html.length > 50);
  expectContains('has Visitors item', html, 'Visitors');
  expectContains('has Sessions item', html, 'Sessions');
  expectContains('has Customers item', html, 'Customers');
  expectContains('has Revenue item', html, 'Revenue');
  expectContains('has bg-brand dot', html, 'bg-brand');
  expectContains('has bg-purple dot', html, 'bg-purple');
  expectContains('has bg-indigo dot', html, 'bg-indigo');
  expectContains('has bg-teal dot', html, 'bg-teal');
  expectContains('has w-2.5 h-2.5 sizing', html, 'w-2.5 h-2.5');
  expectContains('has rounded-full', html, 'rounded-full');
  expectContains('has shrink-0', html, 'shrink-0');
  expectContains('has me-3 spacing', html, 'me-3');

  // Custom items
  const html2 = renderFlowbiteLegendIndicator({
    items: [
      { label: 'Sales', color: 'bg-success' },
      { label: 'Returns', color: 'bg-danger' },
    ],
  });
  expectContains('custom label Sales', html2, 'Sales');
  expectContains('custom color bg-success', html2, 'bg-success');
  expectContains('custom label Returns', html2, 'Returns');
  expectContains('custom color bg-danger', html2, 'bg-danger');
  expectNotContains('no default Visitors in custom', html2, 'Visitors');
}

// ── SUITE 6: renderFlowbiteCountIndicator ─────────────────────────
console.log('\n📦 Suite 6: renderFlowbiteCountIndicator');
{
  const html = renderFlowbiteCountIndicator();
  expectContains('has <button> tag', html, '<button');
  expectContains('has default id', html, 'id="indicatorCountBtn"');
  expectContains('has relative positioning', html, 'relative');
  expectContains('has Messages label', html, 'Messages');
  expectContains('has default count 8', html, '>8<');
  expectContains('has bg-danger badge', html, 'bg-danger');
  expectContains('has border-buffer', html, 'border-buffer');
  expectContains('has -top-2 positioning', html, '-top-2');
  expectContains('has -end-2 positioning', html, '-end-2');
  expectContains('has bg-brand button class', html, 'bg-brand');
  expectContains('has sr-only Notifications', html, 'sr-only');

  const html2 = renderFlowbiteCountIndicator({ label: 'Alerts', count: 42, id: 'myAlertBtn' });
  expectContains('custom id', html2, 'id="myAlertBtn"');
  expectContains('custom label Alerts', html2, 'Alerts');
  expectContains('custom count 42', html2, '>42<');
}

// ── SUITE 7: renderFlowbiteStatusIndicator ────────────────────────
console.log('\n📦 Suite 7: renderFlowbiteStatusIndicator');
{
  const html = renderFlowbiteStatusIndicator();
  expectTruthy('returns non-empty string', html.length > 50);
  expectContains('has online status bg-success', html, 'bg-success');
  expectContains('has offline status bg-danger', html, 'bg-danger');
  expectContains('has border-buffer ring', html, 'border-buffer');
  expectContains('has start-7 positioning', html, 'start-7');
  expectContains('has w-3.5 h-3.5 dot size', html, 'w-3.5 h-3.5');
  expectContains('has rounded-full dot', html, 'rounded-full');
  expectContains('has me-4 spacing', html, 'me-4');

  // Online user
  const htmlOnline = renderFlowbiteStatusIndicator({
    users: [{ status: 'online', imgAlt: 'John Smith' }],
  });
  expectContains('online → bg-success', htmlOnline, 'bg-success');
  expectNotContains('online → no bg-danger', htmlOnline, 'bg-danger');

  // Offline user
  const htmlOffline = renderFlowbiteStatusIndicator({
    users: [{ status: 'offline', imgAlt: 'Jane Doe' }],
  });
  expectContains('offline → bg-danger', htmlOffline, 'bg-danger');
  expectNotContains('offline → no bg-success', htmlOffline, 'bg-success');

  // Away user
  const htmlAway = renderFlowbiteStatusIndicator({
    users: [{ status: 'away', imgAlt: 'Away User' }],
  });
  expectContains('away → bg-warning', htmlAway, 'bg-warning');
}

// ── SUITE 8: renderFlowbiteBadgeIndicator ─────────────────────────
console.log('\n📦 Suite 8: renderFlowbiteBadgeIndicator');
{
  const html = renderFlowbiteBadgeIndicator();
  expectContains('has <ul role="list">', html, 'role="list"');
  expectContains('has max-w-md', html, 'max-w-md');
  expectContains('has Neil Sims', html, 'Neil Sims');
  expectContains('has Bonnie Green', html, 'Bonnie Green');
  expectContains('Neil shows Available badge', html, 'Available');
  expectContains('Bonnie shows Unavailable badge', html, 'Unavailable');
  expectContains('Available badge has bg-success-soft', html, 'bg-success-soft');
  expectContains('Unavailable badge has bg-danger-soft', html, 'bg-danger-soft');
  expectContains('available dot bg-success', html, 'bg-success');
  expectContains('unavailable dot bg-danger', html, 'bg-danger');
  expectContains('has email@flowbite.com', html, 'email@flowbite.com');
  expectContains('has NS initials', html, 'NS');
  expectContains('has BG initials', html, 'BG');
  expectContains('has shrink-0', html, 'shrink-0');
  expectContains('has divide-y divide-default', html, 'divide-y divide-default');

  // Custom users
  const html2 = renderFlowbiteBadgeIndicator({
    users: [
      { name: 'Alice Johnson', email: 'alice@test.com', available: true },
      { name: 'Bob Smith', email: 'bob@test.com', available: false },
    ],
  });
  expectContains('custom Alice user', html2, 'Alice Johnson');
  expectContains('Alice initials AJ', html2, 'AJ');
  expectContains('custom Bob user', html2, 'Bob Smith');
  expectContains('Bob initials BS', html2, 'BS');
  expectContains('Alice Available badge', html2, 'Available');
  expectContains('Bob Unavailable badge', html2, 'Unavailable');
}

// ── SUITE 9: renderFlowbiteLoadingIndicator ───────────────────────
console.log('\n📦 Suite 9: renderFlowbiteLoadingIndicator');
{
  const html = renderFlowbiteLoadingIndicator();
  expectContains('has outer wrapper div', html, '<div');
  expectContains('has default h-56', html, 'h-56');
  expectContains('has default w-56', html, 'w-56');
  expectContains('has border border-default', html, 'border border-default');
  expectContains('has rounded-base', html, 'rounded-base');
  expectContains('has default label loading...', html, 'loading...');
  expectContains('has animate-pulse', html, 'animate-pulse');
  expectContains('has bg-brand-softer', html, 'bg-brand-softer');

  const html2 = renderFlowbiteLoadingIndicator({ label: 'Please wait...', wClass: 'w-32', hClass: 'h-32' });
  expectContains('custom label', html2, 'Please wait...');
  expectContains('custom w-32', html2, 'w-32');
  expectContains('custom h-32', html2, 'h-32');
  expectNotContains('no default w-56', html2, 'w-56');
}

// ── SUITE 10: renderFlowbiteFooterIndicatorShowcase ───────────────
console.log('\n📦 Suite 10: renderFlowbiteFooterIndicatorShowcase');
{
  const html = renderFlowbiteFooterIndicatorShowcase();
  expectTruthy('returns non-empty string', html.length > 200);
  expectContains('has showcase wrapper class', html, 'flowbite-footer-indicator-showcase');
  expectContains('includes default footer', html, 'bg-neutral-primary-soft rounded-base shadow-xs border border-default m-4');
  expectContains('includes sitemap footer', html, 'max-w-screen-xl p-4 py-6');
  expectContains('includes social footer', html, 'Facebook');
  expectContains('includes legend indicator', html, 'Visitors');
  expectContains('includes count indicator', html, 'indicatorCountBtn');
  expectContains('includes status indicators', html, 'bg-success');
  expectContains('includes badge indicator list', html, 'Neil Sims');
  expectContains('includes loading indicator', html, 'animate-pulse');
  expectContains('has section heading h3', html, '<h3');
  expectContains('has all 8 h4 subheadings (1.)', html, '1. Default Footer');
  expectContains('has all 8 h4 subheadings (8.)', html, '8. Loading Indicator');
}

// ── Final Results ─────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failed === 0) {
  console.log('🎉 All footer and indicator tests passed!');
  process.exit(0);
} else {
  console.error(`❌ ${failed} test(s) failed.`);
  process.exit(1);
}
