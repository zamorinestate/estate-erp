import assert from 'node:assert';
import { renderFlowbiteBadge, renderFlowbiteBadgesShowcase } from '../Frontend/src/js/flowbiteUtils.js';

console.log("=== Testing Flowbite Badges ===");

// 1. Large bordered badges
const largeBorderedBrand = renderFlowbiteBadge({ variant: 'brand', size: 'lg', bordered: true, label: 'Brand' });
assert(largeBorderedBrand.includes('ring-1 ring-inset ring-brand-subtle text-fg-brand-strong text-sm font-medium rounded bg-brand-softer'));
assert(largeBorderedBrand.includes('Brand'));
console.log("✓ Large bordered badge (brand) generated correctly");

// 2. Badges with icon (clock)
const iconBadge = renderFlowbiteBadge({ variant: 'brand', icon: 'clock', label: '2 mins ago' });
assert(iconBadge.includes('bg-brand-softer border border-brand-subtle text-fg-brand-strong text-xs font-medium px-1.5 py-0.5 rounded'));
assert(iconBadge.includes('w-3 h-3 me-1'));
assert(iconBadge.includes('2 mins ago'));
console.log("✓ Badge with icon generated correctly");

// 3. Large badges with icon
const largeIconBadge = renderFlowbiteBadge({ variant: 'brand', size: 'lg', icon: 'clock', label: '2 mins ago' });
assert(largeIconBadge.includes('inline-flex items-center bg-brand-softer border border-brand-subtle text-fg-brand-strong text-sm font-medium leading-none px-2 py-1 rounded'));
assert(largeIconBadge.includes('w-3.5 h-3.5 me-1.5'));
console.log("✓ Large badge with icon generated correctly");

// 4. Badges with SVG loader
const loaderBadge = renderFlowbiteBadge({ variant: 'brand', loader: true, label: '2 mins ago' });
assert(loaderBadge.includes('animate-spin text-fg-brand'));
assert(loaderBadge.includes('fill="#1C64F2"'));
console.log("✓ Badge with SVG loader generated correctly");

// 5. Dismissible badges (chips)
const dismissBadge = renderFlowbiteBadge({ variant: 'brand', dismissible: true, id: 'badge-dismiss-brand', label: 'Brand' });
assert(dismissBadge.includes('id="badge-dismiss-brand"'));
assert(dismissBadge.includes('data-dismiss-target="#badge-dismiss-brand"'));
assert(dismissBadge.includes('rounded-xs hover:bg-brand-soft'));
console.log("✓ Dismissible badge (chip) generated correctly");

// 6. Chips with avatar
const avatarBadge = renderFlowbiteBadge({ variant: 'brand', avatar: '/src/assets/zamorin-app-icon-1024.png', dismissible: true, id: 'badge-avatar-dismiss-brand', label: 'Brand' });
assert(avatarBadge.includes('id="badge-avatar-dismiss-brand"'));
assert(avatarBadge.includes('w-3.5 h-3.5 rounded-full me-1'));
assert(avatarBadge.includes('data-dismiss-target="#badge-avatar-dismiss-brand"'));
console.log("✓ Chip with avatar generated correctly");

// 7. Notification badge on button
const notificationBtn = renderFlowbiteBadge({ asButtonNotification: true, count: 20 });
assert(notificationBtn.includes('relative text-white bg-brand'));
assert(notificationBtn.includes('-top-2 -end-2'));
assert(notificationBtn.includes('border-2 border-buffer rounded-full'));
assert(notificationBtn.includes('>20<'));
console.log("✓ Notification badge on button generated correctly");

// 8. Button with count badge
const buttonWithBadge = renderFlowbiteBadge({ asButtonWithBadge: true, label: 'Messages', count: 2 });
assert(buttonWithBadge.includes('Messages'));
assert(buttonWithBadge.includes('inline-flex items-center justify-center w-4 h-4 ms-2 text-xs font-semibold text-white bg-danger rounded-full'));
assert(buttonWithBadge.includes('2'));
console.log("✓ Button with badge generated correctly");

// 9. Full Showcase
const showcase = renderFlowbiteBadgesShowcase();
assert(showcase.includes('Large Bordered Badges'));
assert(showcase.includes('Badges with Icon'));
assert(showcase.includes('Large Badges with Icon'));
assert(showcase.includes('Badges with SVG Loader'));
assert(showcase.includes('Dismissible Badges (Chips)'));
assert(showcase.includes('Chips with Avatar'));
assert(showcase.includes('Badges inside Buttons'));
assert(showcase.includes('badge-dismiss-brand'));
assert(showcase.includes('badge-avatar-dismiss-brand'));
console.log("✓ renderFlowbiteBadgesShowcase renders all 8 badge sections");

console.log("\nALL 9 FLOWBITE BADGE TESTS PASSED!");
