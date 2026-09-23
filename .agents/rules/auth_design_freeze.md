# STRICT DIRECTIVE: AUTH & LOGIN PAGE 2.0 DESIGN FREEZE

> **PERMANENT DESIGN FREEZE IN EFFECT**  
> **Directive from User**: *"here after no one should change anything."*  
> **Locked Commit**: `ae6735f16fbbbec82a20b2e5eafa560d55a05bea`  
> **Status**: FROZEN / LOCKED — ZERO MODIFICATIONS PERMITTED.

---

## Strict Inviolable Rules

1. **NO DESIGN CHANGES TO AUTH/LOGIN**:
   - The visual layout, styling, dimensions, fonts, colors, and components of `Login 2.0` (`frontend/src/js/pages/login2.js`, `frontend/src/styles/login2.css`) are strictly finalized and frozen.
   - Do NOT modify the layout, spacing, colors, buttons, or styling of the Login or Register screens.

2. **PROTECTED INTERFACES & COMPONENTS**:
   - **Regular Card Size**: The card dimensions and compact vertical rhythm must be preserved. Do not add full-width middle bars or containers that elongate the card.
   - **Organisation ID**: Must remain above Email with default `ZAMORIN`.
   - **Bottom Utility Row**:
     - `[ 📜 Terms & Conditions  ✓ ]` and `[ 🔑 Passkey / Biometrics ]` must remain side-by-side on a single non-wrapping line.
     - The `✓` agreed badge must remain nested cleanly inside the Terms button pill.
   - **Terms & Conditions Modal**:
     - The modal buttons `[ Close ]` and `[ I Agree ]` (amber brand gradient) must remain immediately active without scroll blockers.
   - **4K Dynamic Wallpapers**:
     - Dynamic rotation across curated 4K estate images on refresh must be preserved.

3. **ANY FUTURE AGENTS OR DEVELOPERS**:
   - MUST NOT alter `frontend/src/js/pages/login2.js` or `frontend/src/styles/login2.css` without explicit, unambiguous instructions from the user.
