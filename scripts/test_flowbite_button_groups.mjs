import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { renderFlowbiteButtonGroup, renderFlowbiteButtonGroupShowcase } from '../Frontend/src/js/flowbiteUtils.js';
import { renderFlowbiteButtonGroup as compRenderBtnGroup, renderFlowbiteButtonGroupShowcase as compRenderBtnGroupShowcase } from '../Frontend/src/js/components.js';

console.log('--- Testing Flowbite Button Groups Integration ---');

// 1. Export parity check from components.js
assert.strictEqual(typeof renderFlowbiteButtonGroup, 'function', 'renderFlowbiteButtonGroup must be exported from flowbiteUtils.js');
assert.strictEqual(typeof renderFlowbiteButtonGroupShowcase, 'function', 'renderFlowbiteButtonGroupShowcase must be exported from flowbiteUtils.js');
assert.strictEqual(typeof compRenderBtnGroup, 'function', 'renderFlowbiteButtonGroup must be re-exported from components.js');
assert.strictEqual(typeof compRenderBtnGroupShowcase, 'function', 'renderFlowbiteButtonGroupShowcase must be re-exported from components.js');
console.log('✓ Component import & export parity verified');

// 2. Test horizontal button group rendering
const horizontalGroup = renderFlowbiteButtonGroup({
  items: [
    { label: 'Profile' },
    { label: 'Settings' },
    { label: 'Messages' },
  ],
});
assert(horizontalGroup.includes('role="group"'), 'Horizontal group must have role="group"');
assert(horizontalGroup.includes('-space-x-px'), 'Horizontal group must have -space-x-px utility');
assert(horizontalGroup.includes('rounded-s-base'), 'First item must have rounded-s-base');
assert(horizontalGroup.includes('rounded-e-base'), 'Last item must have rounded-e-base');
assert(horizontalGroup.includes('Profile') && horizontalGroup.includes('Settings') && horizontalGroup.includes('Messages'), 'Must contain all 3 labels');
console.log('✓ Horizontal button group rendering verified');

// 3. Test vertical button group rendering
const verticalGroup = renderFlowbiteButtonGroup({
  vertical: true,
  items: [
    { label: 'Profile' },
    { label: 'Settings' },
    { label: 'Messages' },
  ],
});
assert(verticalGroup.includes('-space-y-px'), 'Vertical group must have -space-y-px');
assert(verticalGroup.includes('rounded-t-base'), 'First item must have rounded-t-base');
assert(verticalGroup.includes('rounded-b-base'), 'Last item must have rounded-b-base');
assert(verticalGroup.includes('w-56'), 'Vertical group must have w-56');
console.log('✓ Vertical button group rendering verified');

// 4. Test button group with links
const linkGroup = renderFlowbiteButtonGroup({
  items: [
    { label: 'Profile', isLink: true, href: '#profile' },
    { label: 'Settings', isLink: true, href: '#settings' },
    { label: 'Messages', isLink: true, href: '#messages' },
  ],
});
assert(linkGroup.includes('<a href="#profile"'), 'First item must be an anchor link');
assert(linkGroup.includes('<a href="#settings"'), 'Second item must be an anchor link');
assert(linkGroup.includes('<a href="#messages"'), 'Third item must be an anchor link');
console.log('✓ Button group with links rendering verified');

// 5. Test button group with icon and disabled status
const iconGroup = renderFlowbiteButtonGroup({
  items: [
    { label: 'Download', icon: '<svg class="w-4 h-4"></svg>' },
    { label: '456k', disabled: true },
  ],
});
assert(iconGroup.includes('<svg class="w-4 h-4"></svg>'), 'Must render icon');
assert(iconGroup.includes('disabled'), 'Must render disabled attribute on second button');
console.log('✓ Button group with icon and disabled item verified');

// 6. Test complete Flowbite showcase rendering all 13 sections
const showcase = renderFlowbiteButtonGroupShowcase();
assert(typeof showcase === 'string' && showcase.length > 500, 'Showcase must return non-empty HTML string');

// Section 1: Default example
assert(showcase.includes('Default Example') && showcase.includes('rounded-s-base') && showcase.includes('rounded-e-base'), 'Section 1 (Default Example) must be present');

// Section 2: Button group info
assert(showcase.includes('Button Group Info') && showcase.includes('Download') && showcase.includes('456k'), 'Section 2 (Button group info) must be present');

// Section 3: Button group icon action
assert(showcase.includes('Button Group Icon Action') && showcase.includes('Save book'), 'Section 3 (Button group icon action) must be present');

// Section 4: Button group icons (with tooltips)
assert(showcase.includes('Button Group Icons') && showcase.includes('data-tooltip-target="tooltip-option-1"'), 'Section 4 (Button group icons) must be present with tooltips');

// Section 5: Button group dropdown
assert(showcase.includes('Button Group Dropdown') && showcase.includes('data-dropdown-toggle="dropdown-options"'), 'Section 5 (Button group dropdown) must be present with dropdown toggle');

// Section 6: Button group badge
assert(showcase.includes('Button Group Badge') && showcase.includes('data-dropdown-toggle="dropdown-messages"') && showcase.includes('text-fg-danger-strong bg-danger-soft'), 'Section 6 (Button group badge) must be present with badge styling');

// Section 7: QR code button group
assert(showcase.includes('QR Code Button Group') && showcase.includes('Sign In'), 'Section 7 (QR code button group) must be present');

// Section 8: Pagination button group
assert(showcase.includes('Pagination Button Group') && showcase.includes('tooltip-previous') && showcase.includes('tooltip-next'), 'Section 8 (Pagination button group) must be present');

// Section 9: Vertical button groups
assert(showcase.includes('Vertical Button Groups') && showcase.includes('w-56 -space-y-px') && showcase.includes('tooltip-option-5'), 'Section 9 (Vertical button groups) must be present');

// Section 10: Button group with colors
assert(showcase.includes('Button Group with Colors') && showcase.includes('bg-brand') && showcase.includes('bg-danger') && showcase.includes('bg-success'), 'Section 10 (Button group with colors) must be present');

// Section 11: Button group as links
assert(showcase.includes('Button Group as Links') && showcase.includes('<a href="#" aria-current="page"'), 'Section 11 (Button group as links) must be present');

// Section 12: Group buttons with icons
assert(showcase.includes('Group Buttons with Icons') && showcase.includes('Profile') && showcase.includes('Settings') && showcase.includes('Messages'), 'Section 12 (Group buttons with icons) must be present');

// Section 13: Button group outline
assert(showcase.includes('Button Group Outline') && showcase.includes('border-dark-strong hover:bg-dark hover:text-white'), 'Section 13 (Button group outline) must be present');

console.log('✓ renderFlowbiteButtonGroupShowcase renders all 13 official sections');

// 7. Verify CSS utilities presence in flowbite-integration.css
const cssPath = path.resolve('Frontend/src/styles/flowbite-integration.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');

const requiredCssUtilities = [
  '.-space-x-px > :not([hidden]) ~ :not([hidden])',
  'margin-inline-start: -1px',
  '.-space-y-px > :not([hidden]) ~ :not([hidden])',
  'margin-top: -1px',
  '.rounded-s-base',
  'border-start-start-radius',
  'border-end-start-radius',
  '.rounded-e-base',
  'border-start-end-radius',
  'border-end-end-radius',
  '.rounded-t-base',
  '.rounded-b-base',
  '.focus\\:ring-3:focus',
  '.w-56',
  '.w-36',
  '.w-40',
  '.h-full',
  '.leading-4',
  '.place-items-center',
  '.border-brand-strong',
  '.border-danger-strong',
  '.border-success-strong',
  '.border-dark-strong',
  '.hover\\:bg-dark:hover',
  '.focus\\:bg-neutral-secondary-medium:focus',
  '.focus\\:text-heading:focus',
];

for (const util of requiredCssUtilities) {
  assert(cssContent.includes(util), `flowbite-integration.css must contain "${util}"`);
}
console.log('✓ All CSS utilities for button groups verified in flowbite-integration.css');

console.log('\n--- ALL 7 FLOWBITE BUTTON GROUP TESTS PASSED SUCCESSFULLY ---');
