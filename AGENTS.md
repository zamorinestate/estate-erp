# Zamorin Café ERP — Core Agent Rules & Architectural Freezes

This document establishes the mandatory, locked architectural constraints for the Zamorin Café ERP project. All AI agents, contributors, and scripts working in this repository must strictly adhere to these rules without exception.

## Permanent Design & Workflow Freezes

1. **Vendor Procurement & Order Verification Lifecycle**:
   - **Rule File**: [.agents/rules/vendor_order_lifecycle_freeze.md](file:///.agents/rules/vendor_order_lifecycle_freeze.md)
   - **Directive**: The end-to-end lifecycle between Café Staff (Cashier / Café Admin) and Master (Primary & Normal Master) is **permanently locked**.
   - **Key Guarantees**:
     - Cashier order request creation with Same Day (Today) / Next Day (Tomorrow) timing.
     - Arriving delivery physical counting with automatic shortage calculation and mandatory discrepancy reasons.
     - Vendor bill and receipt submission in PDF or JPEG/PNG format.
     - Dual immediate automatic actions on GRN verification submission:
       1. Instant auto-inventory addition to `CafeInventoryConfig`, `StockMovement`, and `InventoryLot` (keeping stock live and responsive).
       2. Instant Master review notification and transition to `VERIFIED_PENDING_MASTER_APPROVAL`.
     - Master approval and direct bill download (`📥 Download Vendor Bill for Accounts`) for Accounts payable handoff.
     - Edit tracking before and after approval (`✏️ X edits pre-approval | ⚠️ Y edits post-approval`). Any edit after Master approval automatically revokes approval and mandates Master re-approval.
   - **Non-Negotiable Constraint**: Even if consolidated options, new screens, or bulk actions are introduced tomorrow or in future iterations, this foundational workflow and every single one of its guarantees **MUST REMAIN AS-IS AND UNTOUCHED**.

2. **Auth & Login Page 2.0 Design Freeze**:
   - **Rule File**: [.agents/rules/auth_design_freeze.md](file:///.agents/rules/auth_design_freeze.md)
   - **Directive**: The visual layout, styling, dimensions, card size, and branding of Login 2.0 (`frontend/src/js/pages/login2.js`, `frontend/src/styles/login2.css`) are strictly finalized and frozen. Zero modifications permitted.

3. **Permanent 4-Window Topology & Normal Master Abolition**:
   - By explicit user mandate, the **Normal Master** role and window have been permanently deleted and abolished.
   - The ERP operates with strictly **4 dedicated windows**:
     1. **Primary Master Window**: Exclusively held by Pradeesh K (`MU-0001` / `pradeeshk331@gmail.com`). Sole Master account with full system governance.
     2. **Owner Portal** (`OWNER`): Executive reporting, P&L, CAPEX, risk, and corporate oversight.
     3. **Café Operations Window** (`CAFE_ADMIN`): Daily store operations, POS, inventory counting, roster, and outlet management.
     4. **Employee / Staff Window** (`STAFF`): Cashier POS till, timesheets, shift records, and self-service.
   - Master window access is non-assignable. Onboarding and employee management support only the 3 operational roles: `STAFF`, `CAFE_ADMIN`, and `OWNER`.
   - Zero Kitchen Display System (KDS) files or tickets (strictly excluded by user mandate).
   - Core design tokens (`tokens.css`) must remain preserved.

