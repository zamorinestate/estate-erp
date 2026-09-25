import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  renderFlowbitePhoneMockup,
  renderFlowbiteTabletMockup,
  renderFlowbiteLaptopMockup,
  renderFlowbiteDesktopMockup,
  renderFlowbiteSmartwatchMockup,
  renderFlowbiteDeviceMockup,
  renderFlowbiteDeviceMockupShowcase,
} from '../Frontend/src/js/flowbiteUtils.js';
import {
  renderFlowbitePhoneMockup as compRenderFlowbitePhoneMockup,
  renderFlowbiteTabletMockup as compRenderFlowbiteTabletMockup,
  renderFlowbiteLaptopMockup as compRenderFlowbiteLaptopMockup,
  renderFlowbiteDesktopMockup as compRenderFlowbiteDesktopMockup,
  renderFlowbiteSmartwatchMockup as compRenderFlowbiteSmartwatchMockup,
  renderFlowbiteDeviceMockup as compRenderFlowbiteDeviceMockup,
  renderFlowbiteDeviceMockupShowcase as compRenderFlowbiteDeviceMockupShowcase,
} from '../Frontend/src/js/components.js';

console.log('=== Testing Flowbite Device Mockups Integration ===');

// 1. Export parity check from components.js
assert.strictEqual(typeof renderFlowbitePhoneMockup, 'function', 'renderFlowbitePhoneMockup must be exported');
assert.strictEqual(typeof renderFlowbiteTabletMockup, 'function', 'renderFlowbiteTabletMockup must be exported');
assert.strictEqual(typeof renderFlowbiteLaptopMockup, 'function', 'renderFlowbiteLaptopMockup must be exported');
assert.strictEqual(typeof renderFlowbiteDesktopMockup, 'function', 'renderFlowbiteDesktopMockup must be exported');
assert.strictEqual(typeof renderFlowbiteSmartwatchMockup, 'function', 'renderFlowbiteSmartwatchMockup must be exported');
assert.strictEqual(typeof renderFlowbiteDeviceMockup, 'function', 'renderFlowbiteDeviceMockup must be exported');
assert.strictEqual(typeof renderFlowbiteDeviceMockupShowcase, 'function', 'renderFlowbiteDeviceMockupShowcase must be exported');

assert.strictEqual(typeof compRenderFlowbitePhoneMockup, 'function', 'renderFlowbitePhoneMockup must be re-exported from components.js');
assert.strictEqual(typeof compRenderFlowbiteTabletMockup, 'function', 'renderFlowbiteTabletMockup must be re-exported from components.js');
assert.strictEqual(typeof compRenderFlowbiteLaptopMockup, 'function', 'renderFlowbiteLaptopMockup must be re-exported from components.js');
assert.strictEqual(typeof compRenderFlowbiteDesktopMockup, 'function', 'renderFlowbiteDesktopMockup must be re-exported from components.js');
assert.strictEqual(typeof compRenderFlowbiteSmartwatchMockup, 'function', 'renderFlowbiteSmartwatchMockup must be re-exported from components.js');
assert.strictEqual(typeof compRenderFlowbiteDeviceMockup, 'function', 'renderFlowbiteDeviceMockup must be re-exported from components.js');
assert.strictEqual(typeof compRenderFlowbiteDeviceMockupShowcase, 'function', 'renderFlowbiteDeviceMockupShowcase must be re-exported from components.js');
console.log('✓ Export and import parity verified');

// 2. Default Phone Mockup
const defaultPhone = renderFlowbitePhoneMockup({ variant: 'default' });
assert(defaultPhone.includes('border-[14px] rounded-[2.5rem] h-[600px] w-[300px]'), 'Default phone must have exact chassis dimensions');
assert(defaultPhone.includes('rounded-[2rem] overflow-hidden w-[272px] h-[572px]'), 'Default phone must have exact screen dimensions');
assert(defaultPhone.includes('top-[72px] rounded-s-lg'), 'Default phone must have top side button');
assert(defaultPhone.includes('top-[124px] rounded-s-lg'), 'Default phone must have volume up button');
assert(defaultPhone.includes('top-[178px] rounded-s-lg'), 'Default phone must have volume down button');
assert(defaultPhone.includes('top-[142px] rounded-e-lg'), 'Default phone must have power button');
assert(defaultPhone.includes('mockup-1-light.png') && defaultPhone.includes('mockup-1-dark.png'), 'Default phone must include light and dark screenshots');
console.log('✓ Default Phone Mockup verified');

// 3. iPhone 12 Mockup (iOS)
const iphone = renderFlowbitePhoneMockup({ variant: 'iphone' });
assert(iphone.includes('shadow-xl'), 'iPhone mockup must include shadow-xl');
assert(iphone.includes('w-[148px] h-[18px] bg-base top-0 rounded-b-[1rem] left-1/2 -translate-x-1/2 absolute'), 'iPhone mockup must include notch');
assert(iphone.includes('mockup-2-light.png') && iphone.includes('mockup-2-dark.png'), 'iPhone mockup must include iPhone screenshots');
console.log('✓ iPhone 12 Mockup verified');

// 4. Google Pixel Mockup (Android)
const android = renderFlowbitePhoneMockup({ variant: 'android' });
assert(android.includes('rounded-xl h-[600px] w-[300px] shadow-xl'), 'Pixel mockup must have rounded-xl chassis');
assert(android.includes('w-[148px] h-[18px] bg-base top-0 rounded-b-[1rem] left-1/2 -translate-x-1/2 absolute'), 'Pixel mockup must include camera bar');
assert(android.includes('rounded-xl overflow-hidden w-[272px] h-[572px]'), 'Pixel mockup must have rounded-xl screen');
console.log('✓ Google Pixel (Android) Mockup verified');

// 5. Tablet Mockup
const tablet = renderFlowbiteTabletMockup();
assert(tablet.includes('border-[14px] rounded-[2.5rem] h-[454px] max-w-[341px] md:h-[682px] md:max-w-[512px]'), 'Tablet mockup must have responsive dimensions');
assert(tablet.includes('h-[426px] md:h-[654px]'), 'Tablet mockup must have responsive screen height');
assert(tablet.includes('tablet-mockup-image.png') && tablet.includes('tablet-mockup-image-dark.png'), 'Tablet mockup must include tablet screenshots');
console.log('✓ Tablet Mockup verified');

// 6. Laptop Mockup
const laptop = renderFlowbiteLaptopMockup();
assert(laptop.includes('border-[8px] rounded-t-xl h-[172px] max-w-[301px] md:h-[294px] md:max-w-[512px]'), 'Laptop must have upper screen frame');
assert(laptop.includes('rounded-b-xl rounded-t-sm h-[17px] max-w-[351px] md:h-[21px] md:max-w-[597px]'), 'Laptop must have lower base chassis');
assert(laptop.includes('w-[56px] h-[5px] md:w-[96px] md:h-[8px]'), 'Laptop must include trackpad/opening lip');
assert(laptop.includes('laptop-screen.png') && laptop.includes('laptop-screen-dark.png'), 'Laptop must include laptop screenshots');
console.log('✓ Laptop Mockup verified');

// 7. Desktop Mockup (iMac style)
const desktop = renderFlowbiteDesktopMockup();
assert(desktop.includes('border-[16px] rounded-t-xl h-[172px] max-w-[301px] md:h-[294px] md:max-w-[512px]'), 'Desktop must have screen frame');
assert(desktop.includes('rounded-b-xl h-[24px] max-w-[301px] md:h-[42px] md:max-w-[512px]'), 'Desktop must have lower chin');
assert(desktop.includes('rounded-b-xl h-[55px] max-w-[83px] md:h-[95px] md:max-w-[142px]'), 'Desktop must have stand foot');
assert(desktop.includes('screen-image-imac.png') && desktop.includes('screen-image-imac-dark.png'), 'Desktop must include desktop screenshots');
console.log('✓ Desktop Mockup verified');

// 8. Smartwatch Mockup
const watch = renderFlowbiteSmartwatchMockup();
assert(watch.includes('rounded-t-[2.5rem] h-[63px] max-w-[133px]'), 'Smartwatch must have top strap');
assert(watch.includes('border-[10px] rounded-[2.5rem] h-[213px] w-[208px]'), 'Smartwatch must have watch body');
assert(watch.includes('h-[41px] w-[6px] bg-base absolute -end-[16px] top-[40px]'), 'Smartwatch must have digital crown');
assert(watch.includes('h-[32px] w-[6px] bg-base absolute -end-[16px] top-[88px]'), 'Smartwatch must have side button');
assert(watch.includes('rounded-[2rem] overflow-hidden h-[193px] w-[188px]'), 'Smartwatch must have watch screen');
assert(watch.includes('rounded-b-[2.5rem] h-[63px] max-w-[133px]'), 'Smartwatch must have bottom strap');
assert(watch.includes('watch-screen-image.png') && watch.includes('watch-screen-image-dark.png'), 'Smartwatch must include watch screenshots');
console.log('✓ Smartwatch Mockup verified');

// 9. Mockup Colors
const colorMockup = renderFlowbitePhoneMockup({ variant: 'colors' });
assert(colorMockup.includes('bg-base dark:bg-base border-[14px]'), 'Mockup colors must include dark:bg-base');
console.log('✓ Mockup Colors verified');

// 10. Custom Slot Content & Image Overrides
const customPhone = renderFlowbitePhoneMockup({
  variant: 'default',
  slotContent: '<div id="custom-app-screen" class="p-4 text-center">Zamorin Cafe ERP POS</div>',
});
assert(customPhone.includes('id="custom-app-screen"'), 'Custom slot content should be rendered inside mockup');
assert(customPhone.includes('Zamorin Cafe ERP POS'), 'Custom text should be rendered');

const customImages = renderFlowbiteLaptopMockup({
  lightImage: 'https://zamorin.com/preview-light.png',
  darkImage: 'https://zamorin.com/preview-dark.png',
  alt: 'Zamorin Cafe POS Laptop Preview',
});
assert(customImages.includes('https://zamorin.com/preview-light.png'), 'Custom light image should be used');
assert(customImages.includes('https://zamorin.com/preview-dark.png'), 'Custom dark image should be used');
assert(customImages.includes('alt="Zamorin Cafe POS Laptop Preview"'), 'Custom alt text should be used');
console.log('✓ Custom Slot Content and Image Overrides verified');

// 11. Unified Dispatcher renderFlowbiteDeviceMockup
assert(renderFlowbiteDeviceMockup({ device: 'default' }).includes('border-[14px] rounded-[2.5rem]'), 'Dispatcher handles default');
assert(renderFlowbiteDeviceMockup({ device: 'iphone' }).includes('w-[148px] h-[18px] bg-base top-0'), 'Dispatcher handles iphone');
assert(renderFlowbiteDeviceMockup({ device: 'android' }).includes('rounded-xl h-[600px]'), 'Dispatcher handles android');
assert(renderFlowbiteDeviceMockup({ device: 'tablet' }).includes('h-[454px] max-w-[341px]'), 'Dispatcher handles tablet');
assert(renderFlowbiteDeviceMockup({ device: 'laptop' }).includes('border-[8px] rounded-t-xl'), 'Dispatcher handles laptop');
assert(renderFlowbiteDeviceMockup({ device: 'desktop' }).includes('border-[16px] rounded-t-xl'), 'Dispatcher handles desktop');
assert(renderFlowbiteDeviceMockup({ device: 'smartwatch' }).includes('rounded-t-[2.5rem] h-[63px]'), 'Dispatcher handles smartwatch');
assert(renderFlowbiteDeviceMockup({ device: 'colors' }).includes('dark:bg-base'), 'Dispatcher handles colors');
console.log('✓ Unified Dispatcher renderFlowbiteDeviceMockup verified');

// 12. Complete Showcase containing all 8 official sections
const showcase = renderFlowbiteDeviceMockupShowcase();
assert(typeof showcase === 'string' && showcase.length > 2000, 'Showcase must return non-empty markup');
assert(showcase.includes('Default Mockup (Phone)'), 'Showcase section 1 must exist');
assert(showcase.includes('iPhone 12 Mockup (iOS)'), 'Showcase section 2 must exist');
assert(showcase.includes('Google Pixel (Android)'), 'Showcase section 3 must exist');
assert(showcase.includes('Tablet Mockup'), 'Showcase section 4 must exist');
assert(showcase.includes('Laptop Mockup'), 'Showcase section 5 must exist');
assert(showcase.includes('Desktop Mockup'), 'Showcase section 6 must exist');
assert(showcase.includes('Smartwatch Mockup'), 'Showcase section 7 must exist');
assert(showcase.includes('Mockup Colors'), 'Showcase section 8 must exist');
console.log('✓ renderFlowbiteDeviceMockupShowcase verified with all 8 official sections');

// 13. CSS utilities verification in flowbite-integration.css
const cssPath = fs.existsSync('Frontend/src/styles/flowbite-integration.css')
  ? path.resolve('Frontend/src/styles/flowbite-integration.css')
  : path.resolve(import.meta.dirname, '../Frontend/src/styles/flowbite-integration.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');

const requiredCssSelectors = [
  '.bg-base',
  '.border-\\[8px\\]',
  '.border-\\[10px\\]',
  '.border-\\[14px\\]',
  '.border-\\[16px\\]',
  '.rounded-\\[2\\.5rem\\]',
  '.rounded-\\[2rem\\]',
  '.rounded-t-\\[2\\.5rem\\]',
  '.rounded-b-\\[2\\.5rem\\]',
  '.rounded-b-\\[1rem\\]',
  '.rounded-s-lg',
  '.rounded-e-lg',
  '.h-\\[600px\\]',
  '.w-\\[300px\\]',
  '.w-\\[272px\\]',
  '.h-\\[572px\\]',
  '.h-\\[32px\\]',
  '.w-\\[3px\\]',
  '.h-\\[46px\\]',
  '.h-\\[64px\\]',
  '.-start-\\[17px\\]',
  '.-end-\\[17px\\]',
  '.top-\\[72px\\]',
  '.top-\\[124px\\]',
  '.top-\\[178px\\]',
  '.top-\\[142px\\]',
  '.w-\\[148px\\]',
  '.h-\\[18px\\]',
  '.h-\\[454px\\]',
  '.max-w-\\[341px\\]',
  '.h-\\[426px\\]',
  '.h-\\[172px\\]',
  '.max-w-\\[301px\\]',
  '.h-\\[156px\\]',
  '.h-\\[17px\\]',
  '.max-w-\\[351px\\]',
  '.w-\\[56px\\]',
  '.h-\\[5px\\]',
  '.h-\\[140px\\]',
  '.h-\\[24px\\]',
  '.h-\\[55px\\]',
  '.max-w-\\[83px\\]',
  '.h-\\[63px\\]',
  '.max-w-\\[133px\\]',
  '.h-\\[213px\\]',
  '.w-\\[208px\\]',
  '.h-\\[41px\\]',
  '.w-\\[6px\\]',
  '.-end-\\[16px\\]',
  '.top-\\[40px\\]',
  '.top-\\[88px\\]',
  '.h-\\[193px\\]',
  '.w-\\[188px\\]',
  '.md\\:h-\\[682px\\]',
  '.md\\:max-w-\\[512px\\]',
  '.md\\:h-\\[654px\\]',
  '.md\\:h-\\[294px\\]',
  '.md\\:h-\\[278px\\]',
  '.md\\:h-\\[21px\\]',
  '.md\\:max-w-\\[597px\\]',
  '.md\\:w-\\[96px\\]',
  '.md\\:h-\\[8px\\]',
  '.md\\:h-\\[262px\\]',
  '.md\\:h-\\[42px\\]',
  '.md\\:h-\\[95px\\]',
  '.md\\:max-w-\\[142px\\]',
];

requiredCssSelectors.forEach((sel) => {
  assert(cssContent.includes(sel), `CSS must include utility selector: ${sel}`);
});
console.log('✓ All 67 required Device Mockup CSS utility selectors verified in flowbite-integration.css');

console.log('\nALL FLOWBITE DEVICE MOCKUP TESTS PASSED SUCCESSFULLY! 🎉');
