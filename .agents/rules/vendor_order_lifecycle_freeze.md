# STRICT DIRECTIVE: VENDOR PROCUREMENT & ORDER VERIFICATION LIFECYCLE FREEZE

> **PERMANENT ARCHITECTURAL & DESIGN FREEZE IN EFFECT**  
> **Directive from User**: *"even if tomorrow when the consolidated options bring new options, this idea remain same as it is. do not change. lock it."*  
> **Status**: FROZEN / LOCKED — ZERO MODIFICATIONS, OMISSIONS, OR BYPASSES PERMITTED.  
> **Scope**: End-to-end procurement, order request placement, delivery counting, discrepancy tracking, vendor bill upload, dual automatic inventory & notification actions, Master approval, and pre/post-approval edit governance.

---

## Inviolable Architectural Law

Even if future updates, consolidated options, bulk management tools, or new UI views are introduced into the Zamorin Café ERP, the core workflow, business rules, and behavior defined below **MUST REMAIN EXACTLY AS THEY ARE**. No agent, developer, or automated consolidation script is permitted to alter, remove, bypass, or dilute this lifecycle.

---

## The 7 Mandatory Pillars of the Lifecycle

### 1. Order Request Creation & Timing
- **Initiator**: Cashier or Café Admin creates new vendor order requests for their assigned café location.
- **Timing Toggle**:
  - `Same Day` (Today)
  - `Next Day` (Tomorrow)
  - Custom required delivery date.
- **Master Instant Visibility**:
  - As soon as the order request is submitted, it appears immediately in the Master window with items, ordered quantities, vendor details, and destination café.
  - Master immediately receives an instant notification (`NT-YYYYMMDD-XXXX`).

### 2. Pre-Approval Edit Tracking & Governance
- Cashier or Café Admin can edit the order request prior to Master approval (items, quantities, notes, dates).
- Every edit prior to approval increments `editCountBeforeApproval`.
- Master receives an instant notification whenever an order request is edited before approval.

### 3. Arriving Delivery Counting & Discrepancy Verification
- When the vendor supplies the order to the café, Cashier or Café Admin physically counts all items.
- In the delivery verification modal, staff enter:
  - `deliveredQuantity`
  - `acceptedQuantity`
- **Automatic Shortage Calculation**:
  - Missing/short counts are calculated automatically: `missingQty = orderedQuantity - acceptedQuantity`.
- **Mandatory Discrepancy Reason**:
  - If any item count is short or missing (`missingQty > 0`), a clear discrepancy reason is strictly mandatory. The form cannot be submitted without it.

### 4. Vendor Bill & Receipt Submission (PDF & JPEG/PNG)
- Within the verification module, staff submit the vendor bill/receipt in `.pdf`, `.jpg`, `.jpeg`, or `.png` format.
- Stored durably with file metadata and binary data in Base64 for instantaneous retrieval.
- **Accounts Handoff**: Master can download the original attached bill directly via `/receipt-bill/download` (`📥 Download Vendor Bill for Accounts`) to hand over to the accounts department for payment.

### 5. Dual Immediate Automatic Actions (Triggered Upon GRN Submission)
Submitting the delivery verification MUST trigger TWO automatic actions simultaneously:
- **⚡ Action 1 (Instant Responsive Inventory Addition)**:
  - Accepted quantities are immediately credited to `CafeInventoryConfig.currentQuantityBase`.
  - An immutable `StockMovement` ledger entry is posted (`referenceType: 'PURCHASE_ORDER'`, `referenceId: po._id`).
  - An `InventoryLot` is created with status `AVAILABLE`.
  - Café stock is live, responsive, and available for POS billing without manual intervention.
- **⚡ Action 2 (Master Review Alert & Work Queue)**:
  - Master receives an instant notification: delivery has been verified and vendor bill is attached.
  - Order status advances to `VERIFIED_PENDING_MASTER_APPROVAL`.

### 6. Master Verification & Approval
- Master reviews ordered quantities, delivered counts, missing items, discrepancy reasons, and the attached bill.
- Master downloads the bill for Accounts handoff.
- Master approves the order (`masterApproveOrderAndBill`), transitioning status to `APPROVED` and finalizing the process.

### 7. Post-Approval Edit & Re-Approval Safeguard
- If Cashier or Café Admin edits an order request *after* Master has already approved it:
  - `editCountAfterApproval` increments.
  - Previous approval is **automatically revoked** (`isApproved: false`, `approvedByUserId: null`, `needsReapproval: true`).
  - PO status is reverted to `SUBMITTED`, mandating Master review and re-approval.
- The UI table and PO 360 viewer display explicit audit badges:
  - `✏️ X edits pre-approval`
  - `⚠️ Y edits post-approval`
  - `⚠️ Re-approval Mandated` (amber pulsing badge when edited post-approval).

---

## Implementation Reference & Canonical Anchors

The following codebase implementations serve as the canonical standard and must not be broken or bypassed:

| Component | File Path | Inviolable Functions / Features |
| :--- | :--- | :--- |
| **Model** | [PurchaseOrder.js](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/backend/src/models/PurchaseOrder.js) | `VERIFIED_PENDING_MASTER_APPROVAL`, `missingQty`, `discrepancyReason`, `receiptAttachments`, `editHistory`, `editCountBeforeApproval`, `editCountAfterApproval`, `needsReapproval` |
| **Controller** | [procurementController.js](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/backend/src/controllers/procurementController.js) | `editOrder`, `verifyDeliveryAndSubmitBill`, `masterApproveOrderAndBill`, `downloadOrderReceiptBill` |
| **Routes** | [procurementRoutes.js](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/backend/src/routes/procurementRoutes.js) | `/orders/:id/edit`, `/orders/:id/verify-delivery`, `/orders/:id/master-approve`, `/orders/:id/receipt-bill/download` |
| **Frontend** | [procurement.js](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/frontend/src/js/pages/procurement.js) | Timing selector, verification modal with drag-and-drop bill upload, shortage calculation, download bill for accounts, edit badges |
| **Test Suite** | [vendorOrderLifecycle.test.js](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/backend/test/vendorOrderLifecycle.test.js) | 5/5 passing lifecycle test suite (Order Placement, Pre-approval Edit, Post-approval Revocation, Delivery Verification & Auto-Inventory, Master Download & Approval) |

---

## Instruction for Future AI Agents & Developers

When future prompts or consolidated options ask for updates or new screens:
1. **NEVER** remove or combine away the distinct steps of this lifecycle.
2. **NEVER** bypass the dual automatic actions (inventory auto-credit + Master alert).
3. **NEVER** allow short deliveries without mandatory discrepancy reasons.
4. **NEVER** allow bill uploads to be disabled or restricted from PDF / JPEG formats.
5. **NEVER** allow post-approval edits without incrementing `editCountAfterApproval` and revoking approval for mandatory Master re-approval.
6. This directive is **LOCKED** per user order.
