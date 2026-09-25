import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  Drawer,
  initDrawers,
  renderFlowbiteDrawer,
  renderFlowbiteDrawerNavigation,
  renderFlowbiteDrawerContactForm,
  renderFlowbiteDrawerFormElements,
  renderFlowbiteDrawerSwipeableEdge,
  renderFlowbiteDrawerShowcase,
} from '../Frontend/src/js/flowbiteUtils.js';
import {
  Drawer as CompDrawer,
  initDrawers as compInitDrawers,
  renderFlowbiteDrawer as compRenderFlowbiteDrawer,
  renderFlowbiteDrawerNavigation as compRenderFlowbiteDrawerNavigation,
  renderFlowbiteDrawerContactForm as compRenderFlowbiteDrawerContactForm,
  renderFlowbiteDrawerFormElements as compRenderFlowbiteDrawerFormElements,
  renderFlowbiteDrawerSwipeableEdge as compRenderFlowbiteDrawerSwipeableEdge,
  renderFlowbiteDrawerShowcase as compRenderFlowbiteDrawerShowcase,
} from '../Frontend/src/js/components.js';

console.log('=== Testing Flowbite Drawer (Offcanvas) Integration ===');

// 1. Export and import parity from components.js
assert.strictEqual(typeof Drawer, 'function', 'Drawer class must be exported');
assert.strictEqual(typeof initDrawers, 'function', 'initDrawers must be exported');
assert.strictEqual(typeof renderFlowbiteDrawer, 'function', 'renderFlowbiteDrawer must be exported');
assert.strictEqual(typeof renderFlowbiteDrawerNavigation, 'function', 'renderFlowbiteDrawerNavigation must be exported');
assert.strictEqual(typeof renderFlowbiteDrawerContactForm, 'function', 'renderFlowbiteDrawerContactForm must be exported');
assert.strictEqual(typeof renderFlowbiteDrawerFormElements, 'function', 'renderFlowbiteDrawerFormElements must be exported');
assert.strictEqual(typeof renderFlowbiteDrawerSwipeableEdge, 'function', 'renderFlowbiteDrawerSwipeableEdge must be exported');
assert.strictEqual(typeof renderFlowbiteDrawerShowcase, 'function', 'renderFlowbiteDrawerShowcase must be exported');

assert.strictEqual(typeof CompDrawer, 'function', 'Drawer must be re-exported from components.js');
assert.strictEqual(typeof compInitDrawers, 'function', 'initDrawers must be re-exported from components.js');
assert.strictEqual(typeof compRenderFlowbiteDrawer, 'function', 'renderFlowbiteDrawer must be re-exported from components.js');
assert.strictEqual(typeof compRenderFlowbiteDrawerNavigation, 'function', 'renderFlowbiteDrawerNavigation must be re-exported from components.js');
assert.strictEqual(typeof compRenderFlowbiteDrawerContactForm, 'function', 'renderFlowbiteDrawerContactForm must be re-exported from components.js');
assert.strictEqual(typeof compRenderFlowbiteDrawerFormElements, 'function', 'renderFlowbiteDrawerFormElements must be re-exported from components.js');
assert.strictEqual(typeof compRenderFlowbiteDrawerSwipeableEdge, 'function', 'renderFlowbiteDrawerSwipeableEdge must be re-exported from components.js');
assert.strictEqual(typeof compRenderFlowbiteDrawerShowcase, 'function', 'renderFlowbiteDrawerShowcase must be re-exported from components.js');
console.log('✓ Export and import parity verified');

// 2. Drawer class methods and lifecycle (Left placement)
class MockClassList {
  constructor(initial = []) {
    this._classes = new Set(initial);
  }
  add(...cls) { cls.forEach((c) => this._classes.add(c)); }
  remove(...cls) { cls.forEach((c) => this._classes.delete(c)); }
  contains(cls) { return this._classes.has(cls); }
}

const mockDrawerEl = {
  id: 'test-left-drawer',
  classList: new MockClassList(['fixed', 'top-0', 'left-0', '-translate-x-full']),
  setAttribute: (k, v) => { mockDrawerEl[k] = v; },
  removeAttribute: (k) => { delete mockDrawerEl[k]; },
  focus: () => {},
  getAttribute: (attr) => {
    if (attr === 'data-drawer-placement') return 'left';
    return null;
  },
};

const leftDrawer = new Drawer(mockDrawerEl, { placement: 'left', backdrop: false, bodyScrolling: true });
assert.strictEqual(leftDrawer.isVisible(), false, 'Drawer should initially be not visible');

let showCount = 0;
let hideCount = 0;
let toggleCount = 0;
leftDrawer.updateOnShow(() => { showCount++; });
leftDrawer.updateOnHide(() => { hideCount++; });
leftDrawer.updateOnToggle(() => { toggleCount++; });

leftDrawer.show();
assert.strictEqual(leftDrawer.isVisible(), true, 'isVisible() should be true after show()');
assert.strictEqual(mockDrawerEl.classList.contains('transform-none'), true, 'show() should add transform-none');
assert.strictEqual(mockDrawerEl.classList.contains('-translate-x-full'), false, 'show() should remove -translate-x-full');
assert.strictEqual(showCount, 1, 'onShow callback should be invoked');

leftDrawer.hide();
assert.strictEqual(leftDrawer.isVisible(), false, 'isVisible() should be false after hide()');
assert.strictEqual(mockDrawerEl.classList.contains('-translate-x-full'), true, 'hide() should re-add -translate-x-full');
assert.strictEqual(mockDrawerEl.classList.contains('transform-none'), false, 'hide() should remove transform-none');
assert.strictEqual(hideCount, 1, 'onHide callback should be invoked');

leftDrawer.toggle();
assert.strictEqual(leftDrawer.isVisible(), true, 'toggle() should show drawer if hidden');
assert.strictEqual(toggleCount, 1, 'onToggle callback should be invoked');

leftDrawer.destroy();
assert.strictEqual(leftDrawer.isVisible(), false, 'destroy() should hide drawer if visible');
console.log('✓ Left Drawer class methods, callbacks, and lifecycle verified');

// 3. Right, Top, and Bottom placement translation handling
const mockRightEl = {
  classList: new MockClassList(['translate-x-full']),
  setAttribute: () => {},
  removeAttribute: () => {},
  focus: () => {},
  getAttribute: () => 'right',
};
const rightDrawer = new Drawer(mockRightEl, { placement: 'right', backdrop: false });
rightDrawer.show();
assert.strictEqual(mockRightEl.classList.contains('transform-none'), true, 'Right drawer show should add transform-none');
assert.strictEqual(mockRightEl.classList.contains('translate-x-full'), false, 'Right drawer show should remove translate-x-full');
rightDrawer.hide();
assert.strictEqual(mockRightEl.classList.contains('translate-x-full'), true, 'Right drawer hide should restore translate-x-full');

const mockTopEl = {
  classList: new MockClassList(['-translate-y-full']),
  setAttribute: () => {},
  removeAttribute: () => {},
  focus: () => {},
  getAttribute: () => 'top',
};
const topDrawer = new Drawer(mockTopEl, { placement: 'top', backdrop: false });
topDrawer.show();
assert.strictEqual(mockTopEl.classList.contains('transform-none'), true, 'Top drawer show should add transform-none');
assert.strictEqual(mockTopEl.classList.contains('-translate-y-full'), false, 'Top drawer show should remove -translate-y-full');
topDrawer.hide();
assert.strictEqual(mockTopEl.classList.contains('-translate-y-full'), true, 'Top drawer hide should restore -translate-y-full');

// 4. Swipeable edge drawer handling
const mockEdgeEl = {
  classList: new MockClassList(['translate-y-full', 'bottom-[60px]']),
  setAttribute: () => {},
  removeAttribute: () => {},
  focus: () => {},
  getAttribute: () => null,
};
const edgeDrawer = new Drawer(mockEdgeEl, { placement: 'bottom', edge: true, edgeOffset: 'bottom-[60px]', backdrop: false });
edgeDrawer.show();
assert.strictEqual(mockEdgeEl.classList.contains('transform-none'), true, 'Edge drawer show should add transform-none');
assert.strictEqual(mockEdgeEl.classList.contains('bottom-0'), true, 'Edge drawer show should set bottom-0');
assert.strictEqual(mockEdgeEl.classList.contains('bottom-[60px]'), false, 'Edge drawer show should remove bottom-[60px]');
edgeDrawer.hide();
assert.strictEqual(mockEdgeEl.classList.contains('bottom-[60px]'), true, 'Edge drawer hide should restore bottom-[60px]');
assert.strictEqual(mockEdgeEl.classList.contains('translate-y-full'), true, 'Edge drawer hide should restore translate-y-full');
console.log('✓ Right, Top, and Swipeable Edge drawer placements verified');

// 5. Markup generator functions
const defaultDrawerHtml = renderFlowbiteDrawer({ id: 'my-drawer', buttonText: 'Open Drawer', title: 'Admin Controls' });
assert(defaultDrawerHtml.includes('data-drawer-target="my-drawer"'), 'Default drawer button must link target');
assert(defaultDrawerHtml.includes('data-drawer-show="my-drawer"'), 'Default drawer button must declare show');
assert(defaultDrawerHtml.includes('id="my-drawer"'), 'Default drawer must set container ID');
assert(defaultDrawerHtml.includes('data-drawer-hide="my-drawer"'), 'Default drawer close button must declare hide');
assert(defaultDrawerHtml.includes('w-96'), 'Default drawer must use w-96');
assert(defaultDrawerHtml.includes('-translate-x-full'), 'Default drawer must be off-canvas with -translate-x-full');
assert(defaultDrawerHtml.includes('Admin Controls'), 'Default drawer must render title');
console.log('✓ renderFlowbiteDrawer generator verified');

const navDrawerHtml = renderFlowbiteDrawerNavigation({ id: 'custom-nav', buttonText: 'Open Menu', brandName: 'Zamorin Cafe' });
assert(navDrawerHtml.includes('id="custom-nav"'), 'Navigation drawer must set ID');
assert(navDrawerHtml.includes('data-collapse-toggle="dropdown-custom-nav"'), 'Navigation drawer must declare collapsible menu');
assert(navDrawerHtml.includes('Kanban'), 'Navigation drawer must include Kanban item');
assert(navDrawerHtml.includes('w-80'), 'Navigation drawer must use w-80');
assert(navDrawerHtml.includes('Zamorin Cafe'), 'Navigation drawer must render brand name');
console.log('✓ renderFlowbiteDrawerNavigation generator verified');

const contactDrawerHtml = renderFlowbiteDrawerContactForm({ id: 'custom-contact', buttonText: 'Contact Us' });
assert(contactDrawerHtml.includes('id="custom-contact"'), 'Contact drawer must set ID');
assert(contactDrawerHtml.includes('id="custom-contact-email"'), 'Contact drawer must have email input');
assert(contactDrawerHtml.includes('id="custom-contact-subject"'), 'Contact drawer must have subject input');
assert(contactDrawerHtml.includes('id="custom-contact-message"'), 'Contact drawer must have message textarea');
assert(contactDrawerHtml.includes('Send message'), 'Contact drawer must have submit button');
console.log('✓ renderFlowbiteDrawerContactForm generator verified');

const formDrawerHtml = renderFlowbiteDrawerFormElements({ id: 'custom-form' });
assert(formDrawerHtml.includes('id="custom-form"'), 'Form drawer must set ID');
assert(formDrawerHtml.includes('id="custom-form-title"'), 'Form drawer must have title input');
assert(formDrawerHtml.includes('id="custom-form-datepicker"'), 'Form drawer must have datepicker input');
assert(formDrawerHtml.includes('datepicker'), 'Form drawer datepicker must have datepicker attribute');
assert(formDrawerHtml.includes('id="custom-form-guests"'), 'Form drawer must have guests input');
assert(formDrawerHtml.includes('Create event'), 'Form drawer must have Create event button');
console.log('✓ renderFlowbiteDrawerFormElements generator verified');

const swipeDrawerHtml = renderFlowbiteDrawerSwipeableEdge({ id: 'custom-swipe' });
assert(swipeDrawerHtml.includes('id="custom-swipe"'), 'Swipeable drawer must set ID');
assert(swipeDrawerHtml.includes('data-drawer-placement="bottom"'), 'Swipeable drawer must set placement="bottom"');
assert(swipeDrawerHtml.includes('data-drawer-edge="true"'), 'Swipeable drawer must set edge="true"');
assert(swipeDrawerHtml.includes('data-drawer-edge-offset="bottom-[60px]"'), 'Swipeable drawer must set edge-offset');
assert(swipeDrawerHtml.includes('data-drawer-toggle="custom-swipe"'), 'Swipeable drawer handle must toggle drawer');
assert(swipeDrawerHtml.includes('Add widget'), 'Swipeable drawer must render header');
assert(swipeDrawerHtml.includes('Chart') && swipeDrawerHtml.includes('Table'), 'Swipeable drawer must render widget cards');
console.log('✓ renderFlowbiteDrawerSwipeableEdge generator verified');

// 6. Complete Showcase containing all 7 official sections
const showcase = renderFlowbiteDrawerShowcase();
assert(typeof showcase === 'string' && showcase.length > 2000, 'Showcase must return non-empty markup');
assert(showcase.includes('1. Default Drawer'), 'Showcase section 1 must exist');
assert(showcase.includes('2. Drawer Navigation'), 'Showcase section 2 must exist');
assert(showcase.includes('3. Contact Form Drawer'), 'Showcase section 3 must exist');
assert(showcase.includes('4. Form Elements Drawer'), 'Showcase section 4 must exist');
assert(showcase.includes('5. Body Scrolling Disabled'), 'Showcase section 5 must exist');
assert(showcase.includes('data-drawer-body-scrolling="false"'), 'Showcase section 5 must declare body-scrolling="false"');
assert(showcase.includes('6. Backdrop Enabled'), 'Showcase section 6 must exist');
assert(showcase.includes('data-drawer-backdrop="true"'), 'Showcase section 6 must declare backdrop="true"');
assert(showcase.includes('7. Swipeable Edge Drawer'), 'Showcase section 7 must exist');
console.log('✓ renderFlowbiteDrawerShowcase verified with all 7 official sections');

// 7. CSS utilities verification in flowbite-integration.css
const cssPath = fs.existsSync('Frontend/src/styles/flowbite-integration.css')
  ? path.resolve('Frontend/src/styles/flowbite-integration.css')
  : path.resolve(import.meta.dirname, '../Frontend/src/styles/flowbite-integration.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');

const requiredCssSelectors = [
  '.w-96',
  '.w-80',
  '.h-screen',
  '.-translate-x-full',
  '.translate-x-full',
  '.-translate-y-full',
  '.translate-y-full',
  '.transform-none',
  '.bottom-\\[60px\\]',
  '.transition-transform',
  '.bg-dark\\/50',
  '.bg-gray-900\\/50',
  '.dark\\:bg-gray-900\\/80',
];

requiredCssSelectors.forEach((sel) => {
  assert(cssContent.includes(sel), `flowbite-integration.css must contain "${sel}"`);
});
console.log('✓ All 13 required Drawer CSS utility selectors verified in flowbite-integration.css');

console.log('\nALL FLOWBITE DRAWER TESTS PASSED SUCCESSFULLY! 🎉');
