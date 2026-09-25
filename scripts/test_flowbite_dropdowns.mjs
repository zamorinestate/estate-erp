/**
 * test_flowbite_dropdowns.mjs
 * Test suite for Flowbite Dropdown class and all generators.
 * Runs in Node.js with happy-dom for browser globals.
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import { readFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── Setup happy-dom globals ───────────────────────────────────────
let HappyDom;
try {
  HappyDom = (await import('happy-dom')).Window;
} catch {
  console.error('happy-dom not found. Run: npm install -D happy-dom');
  process.exit(1);
}

const win = new HappyDom({ url: 'http://localhost' });
// Safely assign globals (some may be read-only in newer Node.js)
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

// ── Import the module under test ─────────────────────────────────
const utils = await import(`file:///${ROOT}/Frontend/src/js/flowbiteUtils.js`);

const {
  Dropdown,
  initDropdowns,
  renderFlowbiteDropdown,
  renderFlowbiteDropdownHover,
  renderFlowbiteDropdownHeader,
  renderFlowbiteMultiLevelDropdown,
  renderFlowbiteDropdownCheckbox,
  renderFlowbiteDropdownRadio,
  renderFlowbiteDropdownToggleSwitch,
  renderFlowbiteDropdownScrolling,
  renderFlowbiteDropdownSearch,
  renderFlowbiteDropdownNotification,
  renderFlowbiteDropdownUserAvatar,
  renderFlowbiteDropdownNavbar,
  renderFlowbiteDropdownDatepicker,
  renderFlowbiteDropdownShowcase,
} = utils;

// ── Simple test harness ───────────────────────────────────────────
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

function expectTruthy(description, value) {
  if (value) {
    console.log(`  ✅ ${description}`);
    passed++;
  } else {
    console.error(`  ❌ ${description}`);
    console.error(`     Expected truthy, got: ${JSON.stringify(value)}`);
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
    console.error(`     Got (first 200 chars): ${String(html).substring(0, 200)}`);
    failed++;
  }
}

// Helper to create a DOM element from HTML
function parseHTML(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  document.body.appendChild(div);
  return div;
}

// ── SUITE 1: Dropdown Class ───────────────────────────────────────
console.log('\n📦 Suite 1: Dropdown class');

{
  // Setup
  document.body.innerHTML = `
    <button id="test-trigger-1">Open</button>
    <div id="test-target-1" class="hidden">Content</div>
  `;
  const trigger = document.getElementById('test-trigger-1');
  const target = document.getElementById('test-target-1');

  const dd = new Dropdown(target, trigger, { placement: 'bottom', triggerType: 'click' });

  expect('constructor sets _visible=false (hidden initially)', dd.isVisible(), false);
  expect('target has _fbDropdownInstance', !!target._fbDropdownInstance, true);
  expect('trigger has _fbDropdownInstance', !!trigger._fbDropdownInstance, true);

  dd.show();
  expect('show() sets _visible=true', dd.isVisible(), true);
  expect('show() removes hidden class', target.classList.contains('hidden'), false);

  dd.hide();
  expect('hide() sets _visible=false', dd.isVisible(), false);
  expect('hide() adds hidden class', target.classList.contains('hidden'), true);

  dd.toggle();
  expect('toggle() shows when hidden', dd.isVisible(), true);
  dd.toggle();
  expect('toggle() hides when visible', dd.isVisible(), false);

  const events = [];
  dd.updateOnShow(() => events.push('onShow'));
  dd.updateOnHide(() => events.push('onHide'));
  dd.updateOnToggle(() => events.push('onToggle'));
  dd.show();
  dd.hide();
  dd.toggle();
  expect('onShow callback fired', events.includes('onShow'), true);
  expect('onHide callback fired', events.includes('onHide'), true);
  expect('onToggle callback fired', events.includes('onToggle'), true);

  dd.destroy();
  expect('destroy() removes _fbDropdownInstance from target', !target._fbDropdownInstance, true);
  expect('destroy() removes _fbDropdownInstance from trigger', !trigger._fbDropdownInstance, true);
}

// ── SUITE 2: Dropdown.getInstance() ──────────────────────────────
console.log('\n📦 Suite 2: Dropdown.getInstance()');

{
  document.body.innerHTML = `
    <button id="inst-trigger">Open</button>
    <div id="inst-target" class="hidden">Content</div>
  `;
  const trigger = document.getElementById('inst-trigger');
  const target = document.getElementById('inst-target');
  const dd = new Dropdown(target, trigger, {});

  const retrieved = Dropdown.getInstance('inst-target');
  expectTruthy('getInstance() returns instance by id', retrieved);
  expect('getInstance() returns same instance', retrieved === dd, true);

  const missing = Dropdown.getInstance('non-existent-id');
  expect('getInstance() returns null for missing id', missing, null);
}

// ── SUITE 3: Dropdown positioning ────────────────────────────────
console.log('\n📦 Suite 3: Dropdown positioning');

{
  const placements = ['top', 'bottom', 'left', 'right', 'bottom-start', 'bottom-end', 'right-start', 'right-end', 'left-start', 'left-end', 'top-start', 'top-end'];
  for (const placement of placements) {
    document.body.innerHTML = `
      <button id="pos-trigger-${placement}">Btn</button>
      <div id="pos-target-${placement}" class="hidden">Menu</div>
    `;
    const trigger = document.getElementById(`pos-trigger-${placement}`);
    const target = document.getElementById(`pos-target-${placement}`);
    const dd = new Dropdown(target, trigger, { placement });
    dd.show();
    const attr = target.getAttribute('data-popper-placement');
    expect(`placement "${placement}" sets data-popper-placement`, attr, placement);
    dd.destroy();
  }
}

// ── SUITE 4: initDropdowns ────────────────────────────────────────
console.log('\n📦 Suite 4: initDropdowns');

{
  document.body.innerHTML = `
    <button id="init-trigger" data-dropdown-toggle="init-menu" data-dropdown-placement="bottom" data-dropdown-trigger="click">Open</button>
    <div id="init-menu" class="hidden">
      <ul><li>Item</li></ul>
    </div>
  `;

  initDropdowns(document);

  const trigger = document.getElementById('init-trigger');
  const menu = document.getElementById('init-menu');

  expectTruthy('initDropdowns binds fbDropdownBound attribute', trigger.dataset.fbDropdownBound);
  expectTruthy('initDropdowns creates Dropdown instance on target', !!menu._fbDropdownInstance);

  trigger.click();
  expect('clicking trigger shows dropdown', menu._fbDropdownInstance.isVisible(), true);

  trigger.click();
  expect('clicking trigger again hides dropdown', menu._fbDropdownInstance.isVisible(), false);
}

// ── SUITE 5: initDropdowns with hover ─────────────────────────────
console.log('\n📦 Suite 5: initDropdowns with hover trigger');

{
  document.body.innerHTML = `
    <button id="hover-trigger" data-dropdown-toggle="hover-menu" data-dropdown-trigger="hover" data-dropdown-delay="0">Hover</button>
    <div id="hover-menu" class="hidden"><ul><li>Item</li></ul></div>
  `;

  initDropdowns(document);

  const trigger = document.getElementById('hover-trigger');
  const menu = document.getElementById('hover-menu');
  const inst = menu._fbDropdownInstance;

  expectTruthy('hover dropdown creates instance', !!inst);
  expect('hover dropdown triggerType is hover', inst._options.triggerType, 'hover');
}

// ── SUITE 6: renderFlowbiteDropdown ───────────────────────────────
console.log('\n📦 Suite 6: renderFlowbiteDropdown');

{
  const html = renderFlowbiteDropdown();
  expectTruthy('returns a string', typeof html === 'string');
  expectContains('contains default triggerId', html, 'id="dropdownDefaultButton"');
  expectContains('contains data-dropdown-toggle', html, 'data-dropdown-toggle="dropdown"');
  expectContains('contains dropdown menu id', html, 'id="dropdown"');
  expectContains('contains Dashboard link', html, 'Dashboard');

  const html2 = renderFlowbiteDropdown({ triggerId: 'myBtn', dropdownId: 'myMenu' });
  expectContains('custom triggerId respected', html2, 'id="myBtn"');
  expectContains('custom dropdownId respected', html2, 'id="myMenu"');
}

// ── SUITE 7: renderFlowbiteDropdownHover ──────────────────────────
console.log('\n📦 Suite 7: renderFlowbiteDropdownHover');

{
  const html = renderFlowbiteDropdownHover();
  expectContains('contains hover trigger id', html, 'id="dropdownHoverButton"');
  expectContains('contains data-dropdown-trigger="hover"', html, 'data-dropdown-trigger="hover"');
  expectContains('contains dropdownHover id', html, 'id="dropdownHover"');
}

// ── SUITE 8: renderFlowbiteDropdownHeader ─────────────────────────
console.log('\n📦 Suite 8: renderFlowbiteDropdownHeader');

{
  const html = renderFlowbiteDropdownHeader();
  expectContains('contains trigger id', html, 'id="dropdownInformationButton"');
  expectContains('contains dropdown id', html, 'id="dropdownInformation"');
  expectContains('contains PRO badge', html, 'PRO');
  expectContains('contains dark mode toggle', html, 'Dark mode');
  expectContains('has w-72 width class', html, 'w-72');

  const html2 = renderFlowbiteDropdownHeader({ userName: 'Alice', userEmail: 'alice@test.com' });
  expectContains('custom userName rendered', html2, 'Alice');
  expectContains('custom userEmail rendered', html2, 'alice@test.com');
}

// ── SUITE 9: renderFlowbiteMultiLevelDropdown ─────────────────────
console.log('\n📦 Suite 9: renderFlowbiteMultiLevelDropdown');

{
  const html = renderFlowbiteMultiLevelDropdown();
  expectContains('contains main trigger id', html, 'id="multiLevelDropdownButton"');
  expectContains('contains main dropdown id', html, 'id="multi-dropdown"');
  expectContains('contains nested trigger id', html, 'id="doubleDropdownButton"');
  expectContains('contains nested dropdown id', html, 'id="doubleDropdown"');
  expectContains('nested has right-start placement', html, 'data-dropdown-placement="right-start"');
}

// ── SUITE 10: renderFlowbiteDropdownCheckbox ──────────────────────
console.log('\n📦 Suite 10: renderFlowbiteDropdownCheckbox');

{
  const html = renderFlowbiteDropdownCheckbox();
  expectContains('contains trigger id', html, 'id="dropdownCheckboxButton"');
  expectContains('contains dropdown id', html, 'id="dropdownDefaultCheckbox"');
  expectContains('contains checkbox inputs', html, 'type="checkbox"');
  expectContains('contains 3 checkboxes (checkbox-1)', html, 'checkbox-1');
  expectContains('contains 3 checkboxes (checkbox-3)', html, 'checkbox-3');
}

// ── SUITE 11: renderFlowbiteDropdownRadio ────────────────────────
console.log('\n📦 Suite 11: renderFlowbiteDropdownRadio');

{
  const html = renderFlowbiteDropdownRadio();
  expectContains('contains trigger id', html, 'id="dropdownRadioButton"');
  expectContains('contains dropdown id', html, 'id="dropdownDefaultRadio"');
  expectContains('contains radio inputs', html, 'type="radio"');
  expectContains('uses same radio group name', html, 'name="dropdownDefaultRadio-radio"');
}

// ── SUITE 12: renderFlowbiteDropdownToggleSwitch ─────────────────
console.log('\n📦 Suite 12: renderFlowbiteDropdownToggleSwitch');

{
  const html = renderFlowbiteDropdownToggleSwitch();
  expectContains('contains trigger id', html, 'id="dropdownToggleButton"');
  expectContains('contains dropdown id', html, 'id="dropdownToggle"');
  expectContains('has w-72 width', html, 'w-72');
  expectContains('has Email notifications toggle', html, 'Email notifications');
  expectContains('has Dark mode toggle', html, 'Dark mode');
  expectContains('has Show status toggle', html, 'Show status');
}

// ── SUITE 13: renderFlowbiteDropdownScrolling ────────────────────
console.log('\n📦 Suite 13: renderFlowbiteDropdownScrolling');

{
  const html = renderFlowbiteDropdownScrolling();
  expectContains('contains trigger id', html, 'id="dropdownUsersButton"');
  expectContains('contains dropdown id', html, 'id="dropdownUsers"');
  expectContains('has w-54 width', html, 'w-54');
  expectContains('has h-48 scrollable area', html, 'h-48');
  expectContains('has overflow-y-auto', html, 'overflow-y-auto');
  expectContains('contains Add new user footer', html, 'Add new user');
  expectContains('contains Bonnie Green user', html, 'Bonnie Green');
}

// ── SUITE 14: renderFlowbiteDropdownSearch ───────────────────────
console.log('\n📦 Suite 14: renderFlowbiteDropdownSearch');

{
  const html = renderFlowbiteDropdownSearch();
  expectContains('contains trigger id', html, 'id="dropdownUsersSearchButton"');
  expectContains('contains dropdown id', html, 'id="dropdownSearch"');
  expectContains('has search input', html, 'type="text"');
  expectContains('has w-54 width', html, 'w-54');
  expectContains('has h-48 scrollable list', html, 'h-48');
  expectContains('contains search placeholder', html, 'Search');
}

// ── SUITE 15: renderFlowbiteDropdownNotification ─────────────────
console.log('\n📦 Suite 15: renderFlowbiteDropdownNotification');

{
  const html = renderFlowbiteDropdownNotification();
  expectContains('contains trigger id', html, 'id="dropdownNotificationButton"');
  expectContains('contains dropdown id', html, 'id="dropdownNotification"');
  expectContains('has Notifications heading', html, 'Notifications');
  expectContains('has View all footer', html, 'View all');
  expectContains('has default count badge', html, '>5<');

  const html2 = renderFlowbiteDropdownNotification({ count: 12 });
  expectContains('custom count rendered', html2, '>12<');
}

// ── SUITE 16: renderFlowbiteDropdownUserAvatar ───────────────────
console.log('\n📦 Suite 16: renderFlowbiteDropdownUserAvatar');

{
  const html = renderFlowbiteDropdownUserAvatar();
  expectContains('contains trigger id', html, 'id="dropdownUserAvatarButton"');
  expectContains('contains dropdown id', html, 'id="dropdownAvatar"');
  expectContains('has user initials BG', html, 'BG');
  expectContains('has email in dropdown', html, 'name@flowbite.com');

  const html2 = renderFlowbiteDropdownUserAvatar({ userName: 'John Doe', userEmail: 'john@test.com' });
  expectContains('custom user initials JD', html2, 'JD');
  expectContains('custom user email', html2, 'john@test.com');
}

// ── SUITE 17: renderFlowbiteDropdownNavbar ───────────────────────
console.log('\n📦 Suite 17: renderFlowbiteDropdownNavbar');

{
  const html = renderFlowbiteDropdownNavbar();
  expectContains('contains trigger id', html, 'id="dropdownNavbarLink"');
  expectContains('contains dropdown id', html, 'id="dropdownNavbar"');
  expectContains('has nav wrapper', html, '<nav');
  expectContains('has data-dropdown-toggle', html, 'data-dropdown-toggle="dropdownNavbar"');
}

// ── SUITE 18: renderFlowbiteDropdownDatepicker ───────────────────
console.log('\n📦 Suite 18: renderFlowbiteDropdownDatepicker');

{
  const html = renderFlowbiteDropdownDatepicker();
  expectContains('contains trigger id', html, 'id="dateRangeButton"');
  expectContains('contains dropdown id', html, 'id="dateRangeDropdown"');
  expectContains('has ignore-click-outside-class=datepicker', html, 'data-dropdown-ignore-click-outside-class="datepicker"');
  expectContains('has datepicker class', html, 'class="datepicker"');
  expectContains('has Start date label', html, 'Start date');
  expectContains('has End date label', html, 'End date');
  expectContains('has Apply button', html, 'Apply');
}

// ── SUITE 19: renderFlowbiteDropdownShowcase ─────────────────────
console.log('\n📦 Suite 19: renderFlowbiteDropdownShowcase');

{
  const html = renderFlowbiteDropdownShowcase();
  expectTruthy('returns a non-empty string', html.length > 100);
  expectContains('has showcase wrapper class', html, 'flowbite-dropdown-showcase');
  expectContains('includes default dropdown', html, 'dropdownDefaultButton');
  expectContains('includes hover dropdown', html, 'dropdownHoverButton');
  expectContains('includes header dropdown', html, 'dropdownInformationButton');
  expectContains('includes multi-level dropdown', html, 'multiLevelDropdownButton');
  expectContains('includes checkbox dropdown', html, 'dropdownCheckboxButton');
  expectContains('includes radio dropdown', html, 'dropdownRadioButton');
  expectContains('includes toggle switch dropdown', html, 'dropdownToggleButton');
  expectContains('includes scrolling dropdown', html, 'dropdownUsersButton');
  expectContains('includes search dropdown', html, 'dropdownUsersSearchButton');
  expectContains('includes notification bell', html, 'dropdownNotificationButton');
  expectContains('includes user avatar dropdown', html, 'dropdownUserAvatarButton');
  expectContains('includes navbar dropdown', html, 'dropdownNavbarLink');
  expectContains('includes datepicker dropdown', html, 'dateRangeButton');
}

// ── SUITE 20: Dropdown with ignoreClickOutsideClass ───────────────
console.log('\n📦 Suite 20: ignoreClickOutsideClass');

{
  document.body.innerHTML = `
    <button id="ignore-trigger" data-dropdown-toggle="ignore-menu" data-dropdown-ignore-click-outside-class="datepicker">Open</button>
    <div id="ignore-menu" class="hidden"><ul><li>Item</li></ul></div>
  `;
  initDropdowns(document);
  const trigger = document.getElementById('ignore-trigger');
  const menu = document.getElementById('ignore-menu');
  const inst = menu._fbDropdownInstance;
  expect('ignoreClickOutsideClass is set in options', inst._options.ignoreClickOutsideClass, 'datepicker');
}

// ── SUITE 21: Dropdown offset and skidding options ────────────────
console.log('\n📦 Suite 21: Dropdown offset and skidding via data attributes');

{
  document.body.innerHTML = `
    <button id="offset-trigger" data-dropdown-toggle="offset-menu" data-dropdown-offset-distance="20" data-dropdown-offset-skidding="10">Open</button>
    <div id="offset-menu" class="hidden"><ul><li>Item</li></ul></div>
  `;
  initDropdowns(document);
  const menu = document.getElementById('offset-menu');
  const inst = menu._fbDropdownInstance;
  expect('offsetDistance set from data attr', inst._options.offsetDistance, 20);
  expect('offsetSkidding set from data attr', inst._options.offsetSkidding, 10);
}

// ── Final Results ─────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failed === 0) {
  console.log('🎉 All dropdown tests passed!');
  process.exit(0);
} else {
  console.error(`❌ ${failed} test(s) failed.`);
  process.exit(1);
}
