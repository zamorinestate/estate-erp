import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  CopyClipboard,
  initClipboard,
  initCopyClipboards,
  renderFlowbiteClipboard,
  renderFlowbiteClipboardShowcase,
} from '../Frontend/src/js/flowbiteUtils.js';
import {
  CopyClipboard as CompCopyClipboard,
  initCopyClipboards as compInitCopyClipboards,
  renderFlowbiteClipboard as compRenderFlowbiteClipboard,
  renderFlowbiteClipboardShowcase as compRenderFlowbiteClipboardShowcase,
} from '../Frontend/src/js/components.js';

console.log('=== Testing Flowbite Copy to Clipboard Integration ===');

// 1. Export parity check from components.js
assert.strictEqual(typeof CopyClipboard, 'function', 'CopyClipboard class must be exported');
assert.strictEqual(typeof initClipboard, 'function', 'initClipboard must be exported');
assert.strictEqual(typeof initCopyClipboards, 'function', 'initCopyClipboards must be exported');
assert.strictEqual(typeof renderFlowbiteClipboard, 'function', 'renderFlowbiteClipboard must be exported');
assert.strictEqual(typeof renderFlowbiteClipboardShowcase, 'function', 'renderFlowbiteClipboardShowcase must be exported');

assert.strictEqual(typeof CompCopyClipboard, 'function', 'CopyClipboard must be re-exported from components.js');
assert.strictEqual(typeof compInitCopyClipboards, 'function', 'initCopyClipboards must be re-exported from components.js');
assert.strictEqual(typeof compRenderFlowbiteClipboard, 'function', 'renderFlowbiteClipboard must be re-exported from components.js');
assert.strictEqual(typeof compRenderFlowbiteClipboardShowcase, 'function', 'renderFlowbiteClipboardShowcase must be re-exported from components.js');
console.log('✓ Export and import parity verified');

// 2. Test CopyClipboard class methods
const mockInput = {
  tagName: 'INPUT',
  value: 'npm install flowbite',
};
const mockTrigger = {
  id: 'copy-btn',
  addEventListener: () => {},
  removeEventListener: () => {},
  classList: { add: () => {}, remove: () => {} },
  querySelector: () => null,
  getAttribute: () => null,
};

const clipboard = new CopyClipboard(mockTrigger, mockInput, { contentType: 'input' });
assert.strictEqual(clipboard.getTargetValue(), 'npm install flowbite', 'getTargetValue() must return input value');
assert.strictEqual(clipboard.decodeHTML('&lt;div&gt;Hello&lt;/div&gt;'), '&lt;div&gt;Hello&lt;/div&gt;', 'decodeHTML in Node should return input string fallback');

let callbackCalled = false;
clipboard.updateOnCopyCallback(() => { callbackCalled = true; });
assert.strictEqual(typeof clipboard._options.onCopy, 'function', 'updateOnCopyCallback must update callback');

clipboard.destroy();
console.log('✓ CopyClipboard class methods and lifecycle verified');

// 3. Test CopyClipboard with textContent
const mockAddress = {
  tagName: 'ADDRESS',
  textContent: 'Bonnie Green\nname@flowbite.com\n+ 12 345 67890',
};
const addressClipboard = new CopyClipboard(mockTrigger, mockAddress, { contentType: 'textContent' });
assert(addressClipboard.getTargetValue().includes('Bonnie Green'), 'getTargetValue() must extract textContent');
console.log('✓ CopyClipboard textContent extraction verified');

// 4. Test renderFlowbiteClipboard helper for all variants
const defComp = renderFlowbiteClipboard({ variant: 'default', id: 'npm-test', value: 'npm test' });
assert(defComp.includes('id="npm-test"'), 'Default variant must contain target ID');
assert(defComp.includes('grid-cols-8'), 'Default variant must use grid-cols-8');
assert(defComp.includes('data-copy-to-clipboard-target="npm-test"'), 'Default variant must have data attribute');

const textComp = renderFlowbiteClipboard({ variant: 'buttonWithText', id: 'npm-text-test' });
assert(textComp.includes('id="npm-text-test"'), 'buttonWithText must contain target ID');
assert(textComp.includes('max-w-[18rem]'), 'buttonWithText must have max-w-[18rem]');
assert(textComp.includes('text-fg-brand'), 'buttonWithText must include text-fg-brand check icon');

const inputGroupComp = renderFlowbiteClipboard({ variant: 'inputGroup', id: 'web-test', value: 'https://test.com' });
assert(inputGroupComp.includes('URL'), 'inputGroup must include prefix');
assert(inputGroupComp.includes('data-tooltip-target="tooltip-web-test"'), 'inputGroup must include tooltip target');

const urlShortenerComp = renderFlowbiteClipboard({ variant: 'urlShortener', id: 'url-test' });
assert(urlShortenerComp.includes('Generate'), 'urlShortener must have Generate button');
assert(urlShortenerComp.includes('data-tooltip-target="tooltip-url-test"'), 'urlShortener must have tooltip target');

const contactComp = renderFlowbiteClipboard({ variant: 'contactDetails', id: 'contact-test' });
assert(contactComp.includes('<address'), 'contactDetails must render address tag');
assert(contactComp.includes('data-copy-to-clipboard-content-type="textContent"'), 'contactDetails must have content-type textContent');
assert(contactComp.includes('data-tooltip-target="tooltip-contact-test"'), 'contactDetails must have tooltip target');
console.log('✓ renderFlowbiteClipboard handles all 5 variants');

// 5. Test renderFlowbiteClipboardShowcase containing all 5 official sections
const showcase = renderFlowbiteClipboardShowcase();
assert(typeof showcase === 'string' && showcase.length > 500, 'Showcase must return non-empty string');

// Section 1: Default copy to clipboard
assert(showcase.includes('Default Copy to Clipboard') && showcase.includes('id="npm-install"'), 'Section 1 must be present');
assert(showcase.includes('data-copy-to-clipboard-target="npm-install"'), 'Section 1 target must match');
assert(showcase.includes('id="default-message"') && showcase.includes('id="success-message"'), 'Section 1 messages must be present');

// Section 2: Copy button with text
assert(showcase.includes('Copy Button with Text') && showcase.includes('id="npm-install-copy-text"'), 'Section 2 must be present');
assert(showcase.includes('data-copy-to-clipboard-target="npm-install-copy-text"'), 'Section 2 target must match');

// Section 3: Input group with copy
assert(showcase.includes('Input Group with Copy') && showcase.includes('id="website-url"'), 'Section 3 must be present');
assert(showcase.includes('tooltip-website-url'), 'Section 3 tooltip must be present');

// Section 4: URL shortener input group
assert(showcase.includes('URL Shortener Input Group') && showcase.includes('id="url-shortener"'), 'Section 4 must be present');
assert(showcase.includes('tooltip-url-shortener'), 'Section 4 tooltip must be present');

// Section 5: Copy contact details
assert(showcase.includes('Copy Contact Details') && showcase.includes('id="contact-details"'), 'Section 5 must be present');
assert(showcase.includes('data-copy-to-clipboard-content-type="textContent"'), 'Section 5 must declare textContent');
assert(showcase.includes('tooltip-contact-details'), 'Section 5 tooltip must be present');

console.log('✓ renderFlowbiteClipboardShowcase renders all 5 official sections');

// 6. CSS utilities in flowbite-integration.css
const cssPath = path.resolve('Frontend/src/styles/flowbite-integration.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');

const requiredCssUtilities = [
  '.grid-cols-8',
  '.col-span-6',
  '.col-span-2',
  '.max-w-\\[23rem\\]',
  '.max-w-\\[18rem\\]',
  '.end-1\\.5',
  '.end-2',
  '.top-1\\/2',
  '.-translate-y-1\\/2',
  '.bg-neutral-primary-strong',
  '.border-default-strong',
  '.hover\\:bg-neutral-secondary-strong\\/70:hover',
  '.border-e-0',
  '.border-s-0',
  '.leading-loose',
  '.font-italic',
  '.text-fg-brands',
  '.focus\\:border-brand:focus',
  '.focus\\:ring-brand:focus',
  '.sm\\:w-auto',
  '.sm\\:block',
];

for (const util of requiredCssUtilities) {
  assert(cssContent.includes(util), `flowbite-integration.css must contain "${util}"`);
}
console.log('✓ All CSS utilities for Flowbite Clipboard verified in flowbite-integration.css');

console.log('\n--- ALL 6 FLOWBITE CLIPBOARD TESTS PASSED SUCCESSFULLY ---');
