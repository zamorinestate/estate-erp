import assert from 'node:assert';
import { renderFlowbiteButton, renderFlowbiteButtonsShowcase } from '../Frontend/src/js/flowbiteUtils.js';

console.log("=== Testing Flowbite Buttons ===");

// 1. Default Buttons
const defaultBtn = renderFlowbiteButton({ text: 'Default', variant: 'brand' });
assert(defaultBtn.includes('text-white bg-brand box-border border border-transparent hover:bg-brand-strong focus:ring-4 focus:ring-brand-medium shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none'));
assert(defaultBtn.includes('Default'));

const secondaryBtn = renderFlowbiteButton({ text: 'Secondary', variant: 'secondary' });
assert(secondaryBtn.includes('text-body bg-neutral-secondary-medium box-border border border-default-medium hover:bg-neutral-tertiary-medium hover:text-heading focus:ring-4 focus:ring-neutral-tertiary shadow-xs'));

const tertiaryBtn = renderFlowbiteButton({ text: 'Tertiary', variant: 'tertiary' });
assert(tertiaryBtn.includes('text-body bg-neutral-primary-soft border border-default hover:bg-neutral-secondary-medium hover:text-heading focus:ring-4 focus:ring-neutral-tertiary-soft shadow-xs'));

const ghostBtn = renderFlowbiteButton({ text: 'Ghost', variant: 'ghost' });
assert(ghostBtn.includes('text-heading bg-transparent box-border border border-transparent hover:bg-neutral-secondary-medium focus:ring-4 focus:ring-neutral-tertiary'));
console.log("✓ Default buttons generated correctly");

// 2. Outline Buttons
const outlineBrandBtn = renderFlowbiteButton({ text: 'Brand', outline: true, variant: 'brand' });
assert(outlineBrandBtn.includes('text-fg-brand bg-neutral-primary border border-brand hover:bg-brand hover:text-white focus:ring-4 focus:ring-brand-subtle'));

const outlineGrayBtn = renderFlowbiteButton({ text: 'Gray', variant: 'outline-gray' });
assert(outlineGrayBtn.includes('text-body bg-neutral-primary border border-default hover:bg-neutral-secondary-soft hover:text-heading focus:ring-4 focus:ring-neutral-tertiary'));
console.log("✓ Outline buttons generated correctly");

// 3. Button sizes
const xsBtn = renderFlowbiteButton({ text: 'Extra small', size: 'xs' });
assert(xsBtn.includes('text-xs px-3 py-1.5'));

const smBtn = renderFlowbiteButton({ text: 'Small', size: 'sm' });
assert(smBtn.includes('text-sm px-3 py-2'));

const baseBtn = renderFlowbiteButton({ text: 'Base', size: 'base' });
assert(baseBtn.includes('text-sm px-4 py-2.5'));

const lgBtn = renderFlowbiteButton({ text: 'Large', size: 'lg' });
assert(lgBtn.includes('text-base px-5 py-3'));

const xlBtn = renderFlowbiteButton({ text: 'Extra large', size: 'xl' });
assert(xlBtn.includes('text-base px-6 py-3.5'));
console.log("✓ Button sizes (xs, sm, base, lg, xl) generated correctly");

// 4. Button sizes with icon
const xsIconBtn = renderFlowbiteButton({ text: 'Extra small', size: 'xs', icon: 'cart' });
assert(xsIconBtn.includes('w-3.5 h-3.5 me-1.5 -ms-0.5'));
assert(xsIconBtn.includes('Extra small'));

const xlIconBtn = renderFlowbiteButton({ text: 'Extra large', size: 'xl', icon: 'cart' });
assert(xlIconBtn.includes('w-5 h-5 me-1.5 -ms-0.5'));
console.log("✓ Button sizes with icon generated correctly");

// 5. Buttons with icon (Left and Right)
const buyNowBtn = renderFlowbiteButton({ text: 'Buy now', icon: 'cart', iconPosition: 'left' });
assert(buyNowBtn.includes('Buy now'));

const choosePlanBtn = renderFlowbiteButton({ text: 'Choose plan', icon: 'arrow-right', iconPosition: 'right' });
assert(choosePlanBtn.includes('Choose plan'));
assert(choosePlanBtn.includes('ms-1.5 -me-0.5'));
console.log("✓ Left and Right icon buttons generated correctly");

// 6. Button with label (badge)
const badgeBtn = renderFlowbiteButton({ text: 'Messages', badge: '2' });
assert(badgeBtn.includes('Messages'));
assert(badgeBtn.includes('inline-flex items-center justify-center w-4.5 h-4.5 ms-2 text-xs font-medium text-fg-brand-strong bg-brand-soft rounded-full dark:text-fg-brand-subtle'));
assert(badgeBtn.includes('>2<'));
console.log("✓ Button with label / badge generated correctly");

// 7. Icon buttons
const iconBtn8 = renderFlowbiteButton({ iconOnly: true, iconSize: 'w-8 h-8' });
assert(iconBtn8.includes('w-8 h-8'));
assert(iconBtn8.includes('w-5 h-5'));
assert(iconBtn8.includes('Icon description'));

const outlineIconBtn9 = renderFlowbiteButton({ iconOnly: true, outline: true, iconSize: 'w-9 h-9' });
assert(outlineIconBtn9.includes('w-9 h-9'));
assert(outlineIconBtn9.includes('text-fg-brand bg-neutral-primary border border-brand'));
console.log("✓ Icon-only buttons (solid and outline) generated correctly");

// 8. Loader
const loaderBtn = renderFlowbiteButton({ loader: true, text: 'Loading...' });
assert(loaderBtn.includes('disabled'));
assert(loaderBtn.includes('animate-spin'));
assert(loaderBtn.includes('Loading...'));
console.log("✓ Loader buttons generated correctly");

// 9. Disabled
const disabledBtn = renderFlowbiteButton({ disabled: true, text: 'Disabled button' });
assert(disabledBtn.includes('text-fg-disabled bg-disabled box-border border border-default-medium shadow-xs font-medium leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none'));
assert(disabledBtn.includes('disabled'));
console.log("✓ Disabled button generated correctly");

// 10. Showcase
const showcase = renderFlowbiteButtonsShowcase();
assert(showcase.includes('Default Buttons'));
assert(showcase.includes('Outline Buttons'));
assert(showcase.includes('Button Sizes'));
assert(showcase.includes('Outline Button Sizes'));
assert(showcase.includes('Button Sizes with Icon'));
assert(showcase.includes('Buttons with Icon'));
assert(showcase.includes('Button with Label'));
assert(showcase.includes('Icon Buttons'));
assert(showcase.includes('Buttons with Loader'));
assert(showcase.includes('Disabled Button'));
console.log("✓ renderFlowbiteButtonsShowcase renders all 10 button categories");

console.log("\nALL 10 FLOWBITE BUTTON TESTS PASSED!");
