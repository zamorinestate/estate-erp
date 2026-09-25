import assert from 'node:assert';
import { renderFlowbiteMarketingBanner, renderFlowbiteBottomNav, renderFlowbiteBannerAndBottomNavShowcase, Dismiss, initDismiss } from '../Frontend/src/js/flowbiteUtils.js';

console.log("=== Testing Flowbite Sticky Banner & Bottom Navigation ===");

// 1. Marketing CTA Sticky Banner
const banner = renderFlowbiteMarketingBanner();

assert(banner.includes('id="marketing-banner"'), 'Banner must have id="marketing-banner"');
assert(banner.includes('fixed z-50 flex flex-col md:flex-row justify-between w-[calc(100%-2rem)] p-4 -translate-x-1/2 bg-neutral-primary-soft border border-default rounded-base shadow-xs lg:max-w-7xl left-1/2 top-6'), 'Banner must match exact Flowbite layout classes');
assert(banner.includes('https://flowbite.com/docs/images/logo.svg'), 'Banner must include Flowbite logo');
assert(banner.includes('Flowbite</span>'), 'Banner must include Flowbite title');
assert(banner.includes('Build websites even faster with components on top of Tailwind'), 'Banner must include announcement copy');
assert(banner.includes('Sign Up'), 'Banner must include Sign Up CTA');
assert(banner.includes('data-dismiss-target="#marketing-banner"'), 'Banner must include data-dismiss-target');
assert(banner.includes('hidden shrink-0 md:inline-flex justify-center text-sm w-7 h-7 items-center text-body hover:bg-neutral-tertiary hover:text-heading rounded-sm'), 'Banner must have desktop close button with Flowbite classes');
assert(banner.includes('md:hidden text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-4 focus:ring-neutral-tertiary-soft shadow-xs font-medium leading-5 rounded-base text-xs px-3 py-1.5 focus:outline-none'), 'Banner must have mobile close button with Flowbite classes');
console.log("✓ Flowbite Sticky Marketing Banner generated correctly with exact classes");

// 2. Default Bottom Navigation (Tablet & Mobile)
const bottomNav = renderFlowbiteBottomNav();

assert(bottomNav.includes('fixed bottom-0 left-0 z-50 w-full h-16 bg-neutral-primary-soft border-t border-default'), 'Bottom nav must match exact Flowbite container classes');
assert(bottomNav.includes('grid h-full max-w-lg grid-cols-4 mx-auto font-medium'), 'Bottom nav must have 4-col responsive grid');
assert(bottomNav.includes('inline-flex flex-col items-center justify-center px-5 hover:bg-neutral-secondary-medium group'), 'Items must have Flowbite button classes');
assert(bottomNav.includes('Home'), 'Must include Home item');
assert(bottomNav.includes('Wallet'), 'Must include Wallet item');
assert(bottomNav.includes('Settings'), 'Must include Settings item');
assert(bottomNav.includes('Profile'), 'Must include Profile item');
assert(bottomNav.includes('lg:hidden'), 'Must be targeted for tablet and mobile (hidden on large screens)');
console.log("✓ Flowbite Bottom Navigation generated correctly for tablet and mobile");

// 3. Showcase Renderer
const showcase = renderFlowbiteBannerAndBottomNavShowcase();
assert(showcase.includes('Sticky Marketing CTA Banner'));
assert(showcase.includes('Bottom Navigation Bar (Tablet & Mobile)'));
assert(showcase.includes('marketing-banner-showcase'));
assert(showcase.includes('bottom-navigation-showcase'));
console.log("✓ renderFlowbiteBannerAndBottomNavShowcase renders correctly");

console.log("\nALL FLOWBITE BANNER & BOTTOM NAV TESTS PASSED!");
