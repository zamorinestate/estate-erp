# ZAMORIN CAFE ERP — MASTER APPLICATION SPECIFICATION
## THE DEFINITIVE AS-BUILT SYSTEM BLUEPRINT, FIVE-WORKSPACE ARCHITECTURE & EVIDENCE RECONCILIATION BASELINE

> [!IMPORTANT]
> **AUTHORITATIVE ARCHITECTURAL BASELINE (ACP-04B RECONCILED):**
> This document represents the permanent, definitive, and unassailable Master Application Specification for the **Zamorin Cafe ERP** enterprise restaurant management platform.
> It has been directly compiled and verified against the live source code and empirical test execution records of development snapshot:
> **Repository:** `zamorinestate/estate-erp`  
> **Branch:** `owner-strategic-batch-03`  
> **Committed HEAD SHA:** `59ebb1005c8ccfd2915751b2457705aee08266f7`  
> **Full Automated Test Suite:** `282/282 FILES PASS` · `5,071/5,071 TEST CASES PASS` (`0 FAILED`, `0 SKIPPED`)  
> **Effective Backend HTTP Endpoints:** `1,107`  
> **Production Deployment Freeze:** `ACTIVE`  
> **Production Release Status:** `NO-GO`  
> **External Master-MD Scope Review:** `PENDING`  
> **Physical Printer Hardware UAT:** `PENDING`

---

## TABLE OF CONTENTS

1. [Executive Summary & Authoritative Development Snapshot](#1-executive-summary--authoritative-development-snapshot)
2. [Architectural Topology & Multi-Client Stack](#2-architectural-topology--multi-client-stack)
3. [Multi-Tenant Hierarchy & Store Partitioning](#3-multi-tenant-hierarchy--store-partitioning)
4. [Authentication, Passkeys & Unified RBAC Matrix](#4-authentication-passkeys--unified-rbac-matrix)
5. [The Five Operational Workspaces (Exhaustive Specification)](#5-the-five-operational-workspaces-exhaustive-specification)
   - 5.1 Primary Master Workspace (System Governance & Superuser)
   - 5.2 Master Workspace (Enterprise Administration & Procurement Approvals)
   - 5.3 Owner Strategic Workspace (15 Executive Governance Modules)
   - 5.4 Café Operations Workspace (Branch Management & Cash Drawer)
   - 5.5 Employee & Staff Workspace (POS Terminal & Self-Service)
6. [Core Functional Modules (As-Built Breakdown)](#6-core-functional-modules-as-built-breakdown)
   - 6.1 Point of Sale (POS), Dual-Width Printing (58mm/80mm) & Bridge Port 9199
   - 6.2 Multi-Store Concurrency, Distributed Transactions & Process-Local Locking
   - 6.3 Inventory, Recipe Depletion & FEFO Stock Management
   - 6.4 Procurement, Receiving & 3-Way Match Verification
   - 6.5 Biometric/QR Attendance & Statutory Code on Wages Payroll
   - 6.6 Financial Accounting & Rule 46(b) Multi-Series GST Invoicing
   - 6.7 Document Storage, GridFS Object Management & Malware Defense
7. [Verification & Reality Taxonomy](#7-verification--reality-taxonomy)
   - 7.1 Four Tiers of Technical Evidence (Inventory, Structure, Tests, Runtime)
   - 7.2 Pre-Existing Functionality vs ACP-03 Simulation-Only Scope
   - 7.3 Simulated vs Physical Reality Distinctions (Printers & Scanners)
   - 7.4 Permanent Architectural Negations (Intentional Non-Features / Zero KDS)
   - 7.5 Process-Local Locking vs Multi-Node Concurrency
8. [Deferred Infrastructure & Hardware UAT Registers](#8-deferred-infrastructure--hardware-uat-registers)
   - 8.1 Deferred Infrastructure Register (Workload-Based Sizing)
   - 8.2 Physical Thermal Printer Hardware UAT Register
9. [Authoritative Frontend Route & Navigation Matrix (48 / 98 / 71)](#9-authoritative-frontend-route--navigation-matrix)
10. [Comprehensive 1,107 Backend HTTP Endpoint Inventory](#10-comprehensive-1107-backend-http-endpoint-inventory)
11. [Automated Test Suite Verification Summary (282 Suites / 5,071 Cases)](#11-automated-test-suite-verification-summary)
12. [Release Governance, Safety Boundaries & Final Sign-Off](#12-release-governance-safety-boundaries--final-sign-off)

---

## 1. EXECUTIVE SUMMARY & AUTHORITATIVE DEVELOPMENT SNAPSHOT

Zamorin Cafe ERP is an enterprise multi-location restaurant and hospitality management platform engineered specifically for regional café chains, institutional dining, and franchise networks. The platform unifies high-volume point-of-sale terminal billing, dual-width thermal receipt generation (58mm/80mm), real-time inventory management with FEFO (First-Expired, First-Out) recipe depletion, automated procurement order workflows with strict MASTER-only financial authorization, Indian statutory labor compliance (Code on Wages, EPF Scheme 1952, ESI Rule 50), and executive governance across five dedicated workspace personas.

### Development Snapshot Metadata

| Parameter | Authoritative Baseline Value | Audit Proof / Evidence Reference |
| :--- | :--- | :--- |
| **Canonical Repository** | `zamorinestate/estate-erp` | `git remote -v` verified (`https://github.com/zamorinestate/estate-erp.git`) |
| **Development Branch** | `owner-strategic-batch-03` | Active Git working branch |
| **Authoritative HEAD SHA** | `59ebb1005c8ccfd2915751b2457705aee08266f7` | Commit `test(acp04a): remediate test debt...` |
| **Working Tree State** | `CLEAN` | 0 untracked files, 0 uncommitted modifications |
| **Production Freeze** | `ACTIVE` | Absolute prohibition on production deployment or merge to `main` |
| **Commercial Release Gate** | `NO-GO` | Awaiting physical printer UAT and Master-MD external review |
| **Runnable Test Files** | `282` | 100% discovered across `backend/test` and `tests/cafe-operations` |
| **Passing Test Files** | `282 / 282 (100% PASS)` | Validated by sequential isolated full-suite test runner |
| **Total Test Cases** | `5,071` | Exact sum of all runnable test assertions |
| **Passing Test Cases** | `5,071 / 5,071 (100% PASS)` | 0 failures, 0 skips, 0 todos, 0 cancellations, 0 unexecuted |
| **Primary Regression Gate** | `529 / 529 PASS` | Standard `npm test` across 13 certified regression suites |
| **Flaky Test Cases** | `0` | Deterministic timing verified under repeated execution |
| **Modular Backend Routes** | `1,086` | Declared across 68 feature router files in `backend/src/routes/*.js` |
| **Router Root Endpoints** | `1` | Declared in `backend/src/routes/index.js` (`GET /` API identity) |
| **Top-Level App Endpoints** | `20` | Declared directly on Express instance in `backend/src/server.js` |
| **Total Effective HTTP APIs** | `1,107` | Exact sum of concrete HTTP endpoints servicing requests |
| **Canonical Nav Routes** | `48` | Top-level navigation items defined in `frontend/src/js/navigation.js` |
| **Router Switch Cases** | `98` | Concrete switch statements in `frontend/src/js/router.js` |
| **Distinct Page View Templates**| `71` | Active view containers and standalone operational workflows |
| **Mongoose Data Models** | `229` | Schemas declared in `backend/src/models/*.js` |
| **Application Source Changes** | `0` | Zero lines of non-test production code modified during ACP-04 |

---

## 2. ARCHITECTURAL TOPOLOGY & MULTI-CLIENT STACK

The system utilizes a decoupled, high-performance architecture optimized for resilient offline-capable operations, zero-framework frontend simplicity, and backend transaction isolation.

```mermaid
graph TD
    subgraph Client Layer
        A1[Desktop Web Browser]
        A2[Mobile Chrome / Safari PWA]
        A3[Dedicated POS Android Tablet]
        A4[ESC/POS Hardware Bridge Daemon :9199]
    end

    subgraph Edge & In-Browser Resilience
        B1[ServiceWorker Cache-First Engine]
        B2[IndexedDB ZamorinOfflineDB_v2]
        B3[Local pos_queue & Replay Journal]
    end

    subgraph API & Application Layer [Node.js 24 LTS]
        C1[Express Master Router / 1,107 Endpoints]
        C2[W3C WebAuthn & MFA Security Middleware]
        C3[RBAC Authorize & Dynamic Permission Filter]
        C4[Process-Local PoLock Mutex & In-Memory Locks]
        C5[Multi-Tenant Context Resolver orgId / cafeId]
    end

    subgraph Persistence Layer [MongoDB 8.0]
        D1[(Primary Database - Mongoose Models 229)]
        D2[(GridFS Binary Object Store - Receipts & Attachments)]
        D3[(Audit Events & Immutable Financial Ledger)]
    end

    A1 --> B1
    A2 --> B1
    A3 --> B1
    B1 --> B2
    B2 --> B3
    B3 -.->|Late Offline Sync Replay| C1
    A1 --> C1
    A2 --> C1
    A3 --> C1
    A3 --> A4
    C1 --> C2 --> C3 --> C5
    C5 --> C4 --> D1
    C5 --> D2
    C5 --> D3
```

### Technology Component Stack

1. **Backend Engine:**
   - **Runtime:** Node.js 24 LTS.
   - **Framework:** Express 4.x with custom modular router aggregation and error envelopes.
   - **Database Driver & ODM:** Mongoose 8.x with MongoDB Atlas 8.0 wire protocol support.
   - **Transaction Management:** Multi-document ACID transactions with retry policies (`executeTransactionWithRetry` + `commitWithRetry`) for financial, stock, and receiving mutations.
   - **Concurrency Management:** Intra-process serialization via JavaScript `Map`-based mutexes (`withPoLock`) coupled with database ACID atomic updates for multi-instance safety.
   - **Cryptography & Security:** Native Node.js `crypto` for WebAuthn challenge generation, SHA-256 document checksumming, and constant-time HMAC token comparisons.

2. **Frontend Engine:**
   - **Framework:** Vanilla ES6+ JavaScript, Native HTML5, and Modular Vanilla CSS. Zero framework overhead; zero client build/bundling bottlenecks.
   - **Styling Tokens:** Centralized CSS design token system (`css/variables.css`, `navy-gradient-standard`, responsive CSS grid).
   - **Routing Architecture:** Client-side router (`frontend/src/js/router.js`) managing 98 route cases and dynamic navigation permission gating.
   - **Offline Engine:** Service Worker (`frontend/sw.js`) caching application shells, static icons, and stylesheets. Client-side database (`ZamorinOfflineDB_v2`) storing offline product catalogs and transaction queues (`pos_queue`).

3. **POS Printing & Hardware Architecture (ACP-02 & Codebase Verified):**
   - **Dual-Width Layout Engine:** Native CSS media print queries dynamically rendering `58mm` (compact 32-column roll) and `80mm` (standard 48-column roll) thermal receipt layouts.
   - **Micro-Margin Optimization:** Custom zero-padding layout preventing roll clipping, blank feed overflow, and thermal paper wastage.
   - **ESC/POS Command Generator:** In-browser and server-side byte-stream generators converting receipt structures into standard ESC/POS binary buffers.
   - **Hardware Bridge Connector Daemon:** Local daemon listening on **Port 9199** (`http://127.0.0.1:9199/print` and `ws://127.0.0.1:9199/hardware`) allowing web clients to dispatch raw binary commands to local USB/Network thermal printers without browser print dialog interruptions.

---

## 3. MULTI-TENANT HIERARCHY & STORE PARTITIONING

The platform enforces strict multi-tenant boundary isolation across every database collection and operational workflow:

```mermaid
graph TD
    subgraph Enterprise Level
        ORG[Organisation: ORG-ZAMORIN]
        PM[PRIMARY_MASTER / MASTER Governance]
    end

    subgraph Store Level Partitioning
        C1[Café Branch 1: ZC-0001 Calicut Beach]
        C2[Café Branch 2: ZC-0002 Wayanad Road]
    end

    subgraph Store 1 Actors & Devices
        ADM1[CAFE_ADMIN: Store Manager]
        STF1[OPERATOR: Counter POS Staff]
        DEV1[Enrolled Device: Counter Tablet 01]
        TIL1[Till Session: Morning Register]
    end

    subgraph Store 2 Actors & Devices
        ADM2[CAFE_ADMIN: Store Manager]
        STF2[OPERATOR: Counter POS Staff]
        DEV2[Enrolled Device: Counter Tablet 02]
        TIL2[Till Session: Afternoon Register]
    end

    ORG --> PM
    PM --> C1
    PM --> C2
    C1 --> ADM1
    C1 --> STF1
    C1 --> DEV1
    DEV1 --> TIL1
    C2 --> ADM2
    C2 --> STF2
    C2 --> DEV2
    DEV2 --> TIL2

    STF1 -.->|STRICT CROSS-CAFE ACCESS DENIED| C2
    STF2 -.->|STRICT CROSS-CAFE ACCESS DENIED| C1
```

### Isolation Guarantees

1. **Mandatory Compound Tenant Keying:** Every operational document schema (`Bill`, `InventoryLot`, `CashTransaction`, `AttendanceRecord`, `PurchaseOrder`) strictly mandates `organisationId` and `cafeId`.
2. **Server-Enforced Scope Filter:** Authorization middleware automatically injects tenant constraints into queries based on verified JWT claims:
   - `PRIMARY_MASTER` / `MASTER`: Accesses all café branches within the verified organisation.
   - `OWNER`: Accesses all café branches for strategic oversight; denied operational till mutations.
   - `CAFE_ADMIN`: Strictly restricted to `req.user.assignedCafeIds` (single or multi-branch assignment).
   - `STAFF` / `OPERATOR`: Strictly restricted to the currently active enrolled device's café (`req.cafeId`). Cross-branch queries return HTTP 403 `CAFE_ACCESS_DENIED`.

---

## 4. AUTHENTICATION, PASSKEYS & UNIFIED RBAC MATRIX

Authentication is governed by a unified security perimeter supporting canonical password authentication, WebAuthn biometric passkeys, TOTP multi-factor verification, and hardware-enrolled operator PIN sessions.

### Authoritative Role Permission Matrix

| Role Key | Role Title | Portal Exposure | Purchase Order Approval | Till Operation & POS | Personal Ledger Access | Emergency Bypass / DR |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `PRIMARY_MASTER` | Superuser / System Architect | Full Platform | **AUTHORIZED** | View / Audit Only | Full Access | **UNCONDITIONAL** |
| `MASTER` | Enterprise Executive Administrator | Master Hub | **AUTHORIZED (Exclusive)** | View / Audit Only | Self Only | Denied |
| `OWNER` | Strategic Investor / Business Owner | Owner Portal | Denied (Read-Only PO) | Denied | Denied | Bypass Token Only |
| `CAFE_ADMIN` | Branch / Store Manager | Café Admin View | Denied | Supervise / Cash In-Out | Denied | Denied |
| `STAFF` / `OPERATOR` | Service Employee / Cashier | POS Terminal | Denied | **AUTHORIZED** | Self Only | Denied |

### Key Authentication Invariants

- **WebAuthn Passkey Support:** Standard W3C WebAuthn protocol implementation for passwordless biometric login. When disabled via `ENABLE_PASSKEY_AUTH='false'`, endpoints return structured 404 responses without challenge generation.
- **Anti-Account Enumeration:** Password recovery requests for non-existent users return the identical generic status response (`PASSWORD_RECOVERY_UNAVAILABLE` or generic 200) as existing users, completely eliminating identity harvesting vulnerabilities.
- **Device Enrollment & Operator PIN:** In-store POS tablets enroll via time-limited one-time registration tokens (`deviceEnrollmentService`). Once enrolled, cashiers authenticate via fast 6-digit PINs scoped solely to that hardware device. Reassigning or revoking a device immediately invalidates active sessions within 0 milliseconds.

---

## 5. THE FIVE OPERATIONAL WORKSPACES (EXHAUSTIVE SPECIFICATION)

The application provides five distinct, fully tailored workspaces matching the enterprise operational hierarchy:

### 5.1 Primary Master Workspace (`PRIMARY_MASTER`)
- **Primary Persona:** Chief Technology Officer, Lead System Architect, Platform Administrator.
- **Access Boundary:** Unrestricted superuser access across all corporate entities, database schemas, and café locations.
- **Applicable Screens & Views:**
  - System Health & Diagnostics Hub (`#system-health`, `#ops`).
  - Disaster Recovery Runbook & Backup Restore Verification (`#owner-bcdr`).
  - Master Tenant & Store Provisioning (`#admin`, `#cafes`).
  - Security Incident Management & Emergency Lockdown Console.
- **Key Capabilities & Authorizations:**
  - Unconditional maintenance mode bypass (`SYSTEM_OPERATIONS_BYPASS`).
  - Database-level backup evaluation, simulated non-destructive restore drills.
  - Multi-tenant data partition inspection and audit log verification.
  - Emergency token revocation and system-wide operator session termination.

### 5.2 Master Workspace (`MASTER`)
- **Primary Persona:** Managing Director, General Manager, Head of Procurement, Chief Financial Officer.
- **Access Boundary:** Enterprise-wide administrative control across all café branches; denied direct till operation.
- **Applicable Screens & Views:**
  - Master Command Center Dashboard (`#dashboard`).
  - Central Procurement Hub & PO Authorizations (`#procurement`).
  - Central Recipe & Master Catalog Management (`#menu`).
  - Vendor Directory, Commercial Terms & Payable Ledger (`#vendors`).
  - Organization-Wide Financial Statements & Tax Summary (`#finance`, `#reports`).
  - Multi-Branch Inventory Oversight & Stock Reallocations (`#inventory`).
- **Key Capabilities & Authorizations:**
  - **Exclusive Purchase Order Approval Authority:** Approves/rejects POs exceeding store limits.
  - Authorization of 3-way matching price variances on Goods Receipt Notes (`master-approve`).
  - Approval of vendor bank detail changes and credit terms modifications.
  - Central payroll finalization and corporate bank passbook treasury reconciliations.

### 5.3 Owner Strategic Workspace (`OWNER`)
- **Primary Persona:** Franchise Investor, Non-Executive Business Owner, Board Member.
- **Access Boundary:** Organization-wide strategic oversight, analytics, and governance; **strictly read-only for store operational mutations** (denied till operation, denied PO approval, denied cash transactions).
- **Applicable Screens & Views (15 Dedicated Modules):**
  1. Food Safety Governance (`#owner-food-safety` / `#food-safety`).
  2. Risk & Internal Audit Console (`#owner-risk-audit` / `#risk-audit`).
  3. Strategic Planning & Capital Expenditure (`#owner-planning` / `#planning`).
  4. Compliance, Contracts & Insurance (`#owner-compliance` / `#compliance`).
  5. Supplier Intelligence & Price Volatility (`#owner-supplier-intelligence` / `#supplier-intelligence`).
  6. Barista Training & SOP Academy (`#owner-academy` / `#academy`).
  7. Kitchen Asset Reliability & Equipment Maintenance (`#owner-asset-reliability` / `#asset-reliability`).
  8. Privacy & Cybersecurity Governance (`#owner-privacy-cyber` / `#privacy-cyber`).
  9. Business Continuity & Disaster Recovery Oversight (`#owner-bcdr` / `#bcdr`).
  10. Master Data Governance & SKU Standardization (`#owner-master-data` / `#master-data`).
  11. Customer Complaints & SLA Escalation (`#owner-complaints` / `#complaints`).
  12. Menu Pricing Intelligence & Margin Elasticity (`#owner-menu-pricing` / `#menu-pricing`).
  13. Customer Loyalty & Retention Analytics (`#owner-customer-loyalty` / `#customer-loyalty`).
  14. Utilities, Energy & Food Waste Metrics (`#owner-utilities-waste` / `#utilities-waste`).
  15. Corporate Governance & Delegation Powers (`#owner-governance-delegation` / `#governance-delegation`).
- **Key Capabilities & Authorizations:**
  - Read-only audit access across all store performance metrics and reports.
  - Board-level delegation tracking and statutory policy oversight.

### 5.4 Café Operations Workspace (`CAFE_ADMIN`)
- **Primary Persona:** Café Store Manager, Shift Supervisor, Head Barista.
- **Access Boundary:** Strictly isolated to the assigned café branch (`req.user.assignedCafeIds`); denied cross-branch access and corporate financial modifications.
- **Applicable Screens & Views:**
  - Store Operations Hub & Live Shift Dashboard.
  - Cash Drawer Opening Float Declaration & Mid-Day Cash Drops (`#sales-cash`).
  - Store Petty Cash Vouchers & Local Operating Expense Logging (`#expenses`).
  - Local Shift Scheduling & Attendance Regularization (`#attendance`, `#shifts`).
  - Store Inventory Physical Count Audits & Wastage Journaling (`#inventory`).
  - Goods Receipt Entry (GRN) against authorized Purchase Orders (`#procurement`).
  - In-Store Device Status & Local Thermal Printer Configuration (`#cafe-ops-devices`).
- **Key Capabilities & Authorizations:**
  - Blind end-of-shift till closing verification and cash drawer balancing.
  - Authorization of local bill item voids with required reason codes.
  - Reception of physical inventory deliveries and stock lot verification.

### 5.5 Employee & Staff Workspace (`STAFF` / `OPERATOR`)
- **Primary Persona:** Cashier, Barista, Counter Service Employee.
- **Access Boundary:** Restricted to active POS terminal operations on enrolled store devices and personal self-service data.
- **Applicable Screens & Views:**
  - High-Speed POS Terminal Billing Interface (`#pos`, `#pos-till`).
  - Touchscreen Bill Modifier & Item Selection Grid.
  - Print Preview Modal & Dual-Width Thermal Slip Reprints (`#bills`).
  - Biometric / QR Attendance Clock-In/Clock-Out Surface (`#staff-attendance`).
  - Employee Self-Service Home (`#staff-home`).
  - Personal Monthly Payslips & Loan/Advance Ledger (`#ledger`, `#staff-leave`).
- **Key Capabilities & Authorizations:**
  - Punching orders, tender collection (Cash, Card, UPI QR, Split), and receipt dispatch.
  - Fast PIN-based operator switching on shared counter devices.
  - Personal leave applications and historical wage slip viewing.

---

## 6. CORE FUNCTIONAL MODULES (AS-BUILT BREAKDOWN)

### 6.1 Point of Sale (POS), Thermal Printing & Bridge Port 9199
- **Order Processing:** Fast order entry with categories, sub-recipes, modifiers, and instant discount limits.
- **Dual-Width Thermal Printing (ACP-02):**
  - `58mm` (compact 32-column roll) and `80mm` (standard 48-column counter roll) supported via CSS media queries.
  - Pre-print preview modal allows visual audit of items, CGST/SGST taxes, and totals without mutating sales databases.
  - Print cascade prioritizes local hardware bridge, WebUSB, local bridge daemon on **Port 9199**, and browser `window.print()` fallback.
- **Cash Till Management:** Float declarations, cash drops, and blind closing audits prevent till discrepancies.

### 6.2 Multi-Store Concurrency, Distributed Transactions & Process-Local Locking
- **Multi-Location Concurrency (ACP-03):** Verified operational concurrency across multiple branches with independent numbering series and isolated cash drawers.
- **Process-Local Mutex (`withPoLock`):** Concurrency lock implemented via an intra-process JavaScript `Map` (`const poLocks = new Map()`) to serialize local async operations on the same Purchase Order during receiving. Across multiple application instances, concurrency safety is provided by MongoDB ACID transactions and unique compound indexes.
- **Non-Lossy Late Offline Sync:** When internet connectivity drops, transactions accumulate in browser IndexedDB (`ZamorinOfflineDB_v2`). Upon reconnection, transactions sync idempotently via `LATE_OFFLINE_SYNC`, preventing duplicate stock decrements.

### 6.3 Inventory, Recipe Depletion & FEFO Stock Management
- **Recipe Depletion Engine:** Real-time stock decrement triggered immediately upon bill settlement. Configured Bills of Materials (BOM) automatically deplete sub-ingredients.
- **FEFO Lot Accounting:** Consumes raw inventory lots based on First-Expired, First-Out rules.
- **Wastage & Spoilage Journaling:** Audit-logged waste entries tracking barista training waste, dropped items, and daily shrinkage.

### 6.4 Procurement, Receiving & 3-Way Match Verification
- **Approval Hierarchy:** Strictly restricted to `MASTER` role. Store managers and owners are denied approval authority.
- **Three-Way Matching:** Compares PO quantities and prices against Goods Receipt Notes (GRN) and Vendor Invoices. Price variances trigger `MATCH_VARIANCE_BLOCKED` requiring explicit master authorization.
- **Advance Shipping Notices (ASN):** Supports supplier ASN manifests pre-allocating inventory reservations prior to physical unloading.

### 6.5 Biometric/QR Attendance & Statutory Code on Wages Payroll
- **Secure Attendance:** Dual-verification capturing geofenced GPS coordinates, device fingerprints, or rotating QR codes.
- **Indian Statutory Wage Compliance:**
  - **EPF Scheme 1952:** Complies with the ₹15,000/month statutory wage ceiling. Calculates 12% employee contribution, splitting employer contribution into 8.33% EPS (capped) and 3.67% EPF. Workers aged 58+ receive 0% EPS and full 12% to EPF.
  - **ESI Rule 50:** Complies with the ₹21,000 gross wage threshold. Mid-period wage increases retain statutory coverage until contribution period end (Apr-Sep or Oct-Mar). Calculates exact 0.75% employee and 3.25% employer contributions.

### 6.6 Financial Accounting & Rule 46(b) Multi-Series GST Invoicing
- **Rule 46(b) Immutability:** Tax invoice serial numbers adhere strictly to Section 46(b): maximum length of 16 characters, alphanumeric plus hyphen/slash only, unique per GSTIN and Financial Year.
- **Multi-Series Capacity:** Independent concurrent numbering sequences for sales channels (e.g., POS, Online, Catering). Cancelled invoice serials are permanently preserved and never recycled.

### 6.7 Document Storage, GridFS Object Management & Malware Defense
- **Storage Subsystem:** High-capacity object storage utilizing MongoDB GridFS with local disk staging.
- **Malware Scanner Integration:** ClamAV / ICAP-ready upload inspection interface verifying MIME types, magic bytes, and file signatures.
- **Document Immutability:** Cryptographic SHA-256 checksumming guaranteeing document integrity across storage lifecycles.

---

## 7. VERIFICATION & REALITY TAXONOMY

### 7.1 Four Tiers of Technical Evidence
1. **Endpoint Inventory:** 1,107 declared HTTP endpoints discovered via static AST and router code parsing.
2. **Structural Verification:** Code and middleware structure auditing (verifying that every route applies `authorize()`, `authenticate()`, parameter guards, and standardized error envelopes).
3. **Automated Test Coverage:** 5,071 automated unit/integration test assertions executed across 282 test files using in-memory MongoDB servers (`MongoMemoryServer`) and mocked external dependencies.
4. **Runtime Verification:** Live HTTP request/response validation against a running Node.js server with real network sockets, real database transactions, and browser client interactions (Stage 1–10 browser gates, ACP-03 simulation, live session flows).

### 7.2 Pre-Existing Functionality vs ACP-03 Simulation-Only Scope
- **Pre-Existing Functionality:** Multi-café tenancy routing, till cash reconciliation, distributed locking logic, offline sync queues, and role-based access control were all pre-existing architectural capabilities in the application codebase.
- **ACP-03 Simulation Scope:** ACP-03 did not create new application features; commit `5cf018d` added a dedicated **multi-café operational simulation test suite** (`acp03MultiCafeOperationalSimulation.test.js`, 654 lines) validating pre-existing multi-store concurrency and isolation under simulated simultaneous load.

### 7.3 Simulated vs Physical Reality Distinctions (Printers & Scanners)
- **Physical Thermal Printer Compatibility:** Automated tests verify HTML/CSS rendering and binary ESC/POS byte sequence generation. **Automated tests DO NOT prove that a physical USB/Network thermal printer will advance paper, fire the automatic guillotine cutter, or render micro-fonts legibly without physical hardware UAT.**
- **Biometric Hardware Fingerprint Scanners:** Geofencing and QR codes are software-verified. Physical USB biometric fingerprint scanner integration is simulated via software adapters.
- **Payment Gateways:** UPI QR dynamic strings are correctly formatted. Live banking cutover requires external bank merchant account activation.

### 7.4 Permanent Architectural Negations (Intentional Non-Features)
- **Zero Kitchen Display System (KDS):** By approved business specification, a dedicated Kitchen Display System (KDS) is **permanently absent** from the architecture. The café operates on physical printed thermal KOT (Kitchen Order Ticket) slips only.
- **Zero Cross-Organisation Tenancy Sharing:** Organizations never share database documents, inventory catalogs, or employee directories under any circumstance.

### 7.5 Process-Local Locking vs Multi-Node Concurrency
- **`withPoLock` Implementation:** The Purchase Order concurrency lock is implemented as an intra-process JavaScript `Map` (`const poLocks = new Map()`) within a single Node.js process. In multi-instance clustered deployments, race condition protection is enforced by MongoDB ACID transactions and unique compound indexes.

---

## 8. DEFERRED INFRASTRUCTURE & HARDWARE UAT REGISTERS

### 8.1 Register 1: Deferred Infrastructure Work (Workload-Based Sizing)

| Issue Key | Severity | Description & Architectural Context | Current Operational Impact | Future Production Recommendation |
| :--- | :--- | :--- | :--- | :--- |
| **INFRA-P2-01** | `P2` | **Shared Physical MongoDB Atlas Cluster:** Production and staging logical databases currently reside on the same physical MongoDB Atlas Free/M0 tier cluster. | Staging load testing or test execution could contend for physical IOPS and memory with production data. | **Workload-Based Cluster Sizing Decision:** Migrate production database to a dedicated, physically isolated MongoDB Atlas replica set cluster sized according to projected concurrent store transaction volume, working-set RAM requirements, and regional high-availability SLA needs. |

### 8.2 Register 2: Physical Hardware UAT Register (Printer Hardware)

| Hardware Test Key | Target Hardware | Test Objective & Verification Criteria | Current Status | Blocker For |
| :--- | :--- | :--- | :--- | :--- |
| **UAT-PRN-01** | EPSON TM-T82III (80mm) | Verify physical paper advance, zero top-margin clipping, barcode legibility, and automatic guillotine paper cut. | `PENDING` | Store Opening |
| **UAT-PRN-02** | TVS RP-3150 STAR (80mm) | Verify ESC/POS command stream compatibility and character code page 437 currency symbol rendering. | `PENDING` | Store Opening |
| **UAT-PRN-03** | Retsol D58 (58mm Compact) | Verify 32-column compact layout formatting, zero horizontal word wrap on item descriptions, and manual tear-off alignment. | `PENDING` | Mobile POS Till |
| **UAT-PRN-04** | USB WebUSB Direct Print | Verify browser-to-USB direct printing without native OS print dialog popup on Windows 11 POS terminal. | `PENDING` | Desktop Terminal |

---

## 9. AUTHORITATIVE FRONTEND ROUTE & NAVIGATION MATRIX

### Summary: 48 Canonical Navigation Routes | 98 Router Switch Cases | 71 View Templates

#### A. 48 Canonical Navigation Routes
`dashboard`, `pos`, `approvals`, `attendance`, `dept-orders`, `inventory`, `procurement`, `assets`, `quality`, `employees`, `staff-home`, `payroll`, `bills`, `expenses`, `sales-cash`, `finance`, `passbook`, `ledger`, `customers`, `menu`, `vendors`, `revenue-share`, `reports`, `admin`, `cafe-ops-devices`, `system-health`, `settings`, `owner-food-safety`, `owner-risk-audit`, `owner-planning`, `owner-compliance`, `owner-supplier-intelligence`, `owner-academy`, `owner-asset-reliability`, `owner-privacy-cyber`, `owner-bcdr`, `owner-master-data`, `owner-complaints`, `owner-menu-pricing`, `owner-customer-loyalty`, `owner-utilities-waste`, `owner-governance-delegation`, `performance`, `tasks`, `announcements`, `staff-attendance`, `staff-leave`, `staff-settings`.

#### B. Complete 98 Router Switch Cases & Alias Target Mappings
The client router (`frontend/src/js/router.js`) implements exactly 98 switch branches, mapping canonical routes, aliases, deep links, and modal controllers:

| Case # | Router Switch Pattern | Category | Canonical Target / Description |
| :--- | :--- | :--- | :--- |
| 1 | `dashboard` | Canonical | Main Enterprise Command Center Dashboard |
| 2 | `pos` | Canonical | Point of Sale Billing Terminal & Cash Register |
| 3 | `pos-till` | Alias | Redirects to `pos` till operational view |
| 4 | `approvals` | Canonical | Corporate Multi-Module Approval Hub |
| 5 | `attendance` | Canonical | Workforce Attendance & Biometric Clock-in |
| 6 | `dept-orders` | Canonical | Inter-Department Stock Requisition Orders |
| 7 | `department-orders` | Alias | Redirects to `dept-orders` |
| 8 | `inventory` | Canonical | Warehouse & Recipe Lot Inventory Management |
| 9 | `procurement` | Canonical | Source-to-Pay Purchase Orders & GRN Receiving |
| 10 | `assets` | Canonical | Fixed Asset Register & Equipment Maintenance |
| 11 | `quality` | Canonical | Food Quality Standards & Audit Checklists |
| 12 | `employees` | Canonical | Employee Directory & Employment Management |
| 13 | `staff-home` | Canonical | Employee Self-Service Mobile Portal |
| 14 | `payroll` | Canonical | Code on Wages Payroll Calculation & Payslips |
| 15 | `bills` | Canonical | Historical Invoices, Voids & Receipt Reprints |
| 16 | `expenses` | Canonical | Petty Cash Vouchers & Store Operating Expenses |
| 17 | `sales-cash` | Canonical | Daily Sales Summary & Cash Drawer Balancing |
| 18 | `finance` | Canonical | Chart of Accounts, Bank Ledger & P&L Statements |
| 19 | `passbook` | Canonical | Bank Account Passbook & Treasury Reconciliation |
| 20 | `passbook-treasury` | Alias | Redirects to `passbook` |
| 21 | `ledger` | Canonical | Personal Employee Ledger & Advance Balances |
| 22 | `personal-ledger` | Alias | Redirects to `ledger` |
| 23 | `customers` | Canonical | Customer Directory & Loyalty Accounts |
| 24 | `menu` | Canonical | Recipe Catalog, Category & Price Configuration |
| 25 | `vendors` | Canonical | Supplier Accounts & Commercial Terms Registry |
| 26 | `revenue-share` | Canonical | Franchise & Investor Royalty Revenue Share |
| 27 | `reports` | Canonical | Enterprise BI Analytics & Report Generator |
| 28 | `admin` | Canonical | System Administration & User Management |
| 29 | `cafe-ops-devices` | Canonical | In-Store Enrolled Device Registry |
| 30 | `devices` | Alias | Redirects to `cafe-ops-devices` |
| 31 | `system-health` | Canonical | Operational System Diagnostics & DB Latency |
| 32 | `ops` | Alias | Redirects to `system-health` |
| 33 | `settings` | Canonical | Global Configuration & Store Parameters |
| 34–48 | `owner-food-safety` to `owner-governance-delegation` | Canonical | 15 Dedicated Strategic Owner Modules |
| 49–63 | `food-safety` to `governance-delegation` | Alias | 15 Direct Aliases pointing to respective Owner modules |
| 64 | `performance` | Canonical | Store KPI Performance Benchmarking |
| 65 | `tasks` | Canonical | Task Allocation & Operations Ticketing |
| 66 | `announcements` | Canonical | Broadcast Notices & Policy Bulletin Board |
| 67 | `staff-attendance` | Canonical | Personal Attendance Clocking & Regularization |
| 68 | `staff-leave` | Canonical | Vacation & Sick Leave Application Hub |
| 69 | `staff-settings` | Canonical | Personal Security, Passkey & PIN Settings |
| 70 | `staff-loans` | Alias | Redirects to Staff Loan & Advance portal |
| 71 | `staff-loans-advances` | Alias | Redirects to Staff Loan portal |
| 72 | `profile` | Alias | Redirects to `my-profile` |
| 73 | `my-profile` | Alias | Redirects to Employee Profile card |
| 74 | `employee-profile` | Alias | Redirects to Employee Directory Profile |
| 75 | `employment` | Alias | Redirects to Employment Details view |
| 76 | `my-employment` | Alias | Redirects to Self-Employment details |
| 77 | `org-identity` | Alias | Redirects to Organisation Branding parameters |
| 78 | `organisation-identity` | Alias | Organisation Corporate Branding Profile |
| 79 | `c` | Alias | Legacy café QR deep-link alias |
| 80 | `cafe` | Alias | Canonical café gateway redirect |
| 81 | `cafe-gateway` | Alias | Redirects to `cafe-access` |
| 82 | `cafe-access` | Public | Store Access Gateway & Till QR Check-In |
| 83 | `login` | Public | Canonical Login 2.0 Entry Portal |
| 84 | `login2` | Alias | Redirects to canonical `login` |
| 85 | `forgot-password` | Public | Anti-Enumeration Password Recovery Request |
| 86 | `reset-password` | Public | Cryptographic Token Password Reset Completion |
| 87 | `404` | System | Not Found Standard Fallback View |
| 88 | `500` | System | Application Internal Error View |
| 89 | `offline` | System | ServiceWorker Offline Network Failure View |
| 90–98 | Sub-routes / Deep Links | Operational | Modal work surfaces & print preview overlays |

---

## 10. COMPREHENSIVE 1,107 BACKEND HTTP ENDPOINT INVENTORY

Below is the authoritative categorical enumeration of all **1,107 concrete HTTP endpoints** servicing the application:

### 10.1 Authentication & Session Governance

| Source File | HTTP Method | Endpoint Route Path | Architectural Description |
| :--- | :--- | :--- | :--- |
| `authRoutes.js:221` | `POST` | `/login` | Authentication & credential verification |
| `authRoutes.js:222` | `POST` | `/password/forgot` | Operational REST API endpoint |
| `authRoutes.js:223` | `POST` | `/password/reset/verify` | Operational REST API endpoint |
| `authRoutes.js:224` | `POST` | `/password/reset` | Operational REST API endpoint |
| `authRoutes.js:225` | `POST` | `/refresh` | Operational REST API endpoint |
| `authRoutes.js:242` | `POST` | `/passkeys/register/options` | W3C WebAuthn challenge/assertion handler |
| `authRoutes.js:243` | `POST` | `/passkeys/register/verify` | W3C WebAuthn challenge/assertion handler |
| `authRoutes.js:244` | `POST` | `/passkeys/authenticate/options` | W3C WebAuthn challenge/assertion handler |
| `authRoutes.js:245` | `POST` | `/passkeys/authenticate/verify` | W3C WebAuthn challenge/assertion handler |
| `authRoutes.js:246` | `GET` | `/passkeys` | W3C WebAuthn challenge/assertion handler |
| `authRoutes.js:247` | `PATCH` | `/passkeys/:credentialId` | W3C WebAuthn challenge/assertion handler |
| `authRoutes.js:248` | `DELETE` | `/passkeys/:credentialId` | W3C WebAuthn challenge/assertion handler |
| `authRoutes.js:251` | `GET` | `/trusted-devices` | Operational REST API endpoint |
| `authRoutes.js:252` | `DELETE` | `/trusted-devices/:deviceTrustId` | Operational REST API endpoint |
| `authRoutes.js:253` | `DELETE` | `/trusted-devices` | Operational REST API endpoint |
| `authRoutes.js:256` | `POST` | `/mfa/setup` | Operational REST API endpoint |
| `authRoutes.js:257` | `POST` | `/mfa/confirm` | Operational REST API endpoint |
| `authRoutes.js:258` | `POST` | `/mfa/verify` | Operational REST API endpoint |
| `authRoutes.js:261` | `GET` | `/mfa/status` | Operational REST API endpoint |
| `authRoutes.js:262` | `POST` | `/mfa/recovery-codes/regenerate` | Operational REST API endpoint |
| `authRoutes.js:264` | `GET` | `/me` | Operational REST API endpoint |
| `authRoutes.js:265` | `GET` | `/me/privacy-security` | Operational REST API endpoint |
| `authRoutes.js:267` | `POST` | `/step-up` | Operational REST API endpoint |
| `authRoutes.js:275` | `POST` | `/password/change` | Operational REST API endpoint |
| `authRoutes.js:276` | `POST` | `/logout` | Operational REST API endpoint |
| `authRoutes.js:277` | `POST` | `/logout-all` | Operational REST API endpoint |
| `authRoutes.js:278` | `GET` | `/sessions` | Operational REST API endpoint |
| `authRoutes.js:279` | `DELETE` | `/sessions/:sessionId` | Operational REST API endpoint |
| `authRoutes.js:280` | `POST` | `/sessions/revoke-others` | Operational REST API endpoint |
| `operatorSessionRoutes.js:12` | `GET` | `/directory` | Operational REST API endpoint |
| `operatorSessionRoutes.js:15` | `POST` | `/signin` | Authentication & credential verification |
| `operatorSessionRoutes.js:16` | `POST` | `/sign-in` | Operational REST API endpoint |
| `operatorSessionRoutes.js:19` | `POST` | `/signin-master` | Authentication & credential verification |
| `operatorSessionRoutes.js:22` | `POST` | `/lock` | Operational REST API endpoint |
| `operatorSessionRoutes.js:25` | `POST` | `/unlock` | Operational REST API endpoint |
| `operatorSessionRoutes.js:28` | `POST` | `/switch` | Operational REST API endpoint |
| `operatorSessionRoutes.js:31` | `POST` | `/end` | Operational REST API endpoint |
| `operatorSessionRoutes.js:34` | `GET` | `/current` | Operational REST API endpoint |
| `operatorSessionRoutes.js:37` | `GET` | `/sessions` | Operational REST API endpoint |
| `operatorSessionRoutes.js:45` | `POST` | `/pin/set` | Operational REST API endpoint |
| `operatorSessionRoutes.js:52` | `POST` | `/cafe-pin/set` | Operational REST API endpoint |
| `operatorSessionRoutes.js:60` | `POST` | `/:operatorSessionId/handover/acknowledge` | Operational REST API endpoint |

### 10.2 Store Operations & Café Access Provisioning

| Source File | HTTP Method | Endpoint Route Path | Architectural Description |
| :--- | :--- | :--- | :--- |
| `cafeRoutes.js:36` | `GET` | `/compliance/alerts` | Operational REST API endpoint |
| `cafeRoutes.js:39` | `POST` | `/validate` | Operational REST API endpoint |
| `cafeRoutes.js:40` | `POST` | `/preview` | Operational REST API endpoint |
| `cafeRoutes.js:41` | `POST` | `/draft` | Operational REST API endpoint |
| `cafeRoutes.js:42` | `PUT` | `/:cafeId/draft` | Operational REST API endpoint |
| `cafeRoutes.js:43` | `POST` | `/:cafeId/provision` | Operational REST API endpoint |
| `cafeRoutes.js:44` | `POST` | `/:cafeId/verify` | Operational REST API endpoint |
| `cafeRoutes.js:45` | `POST` | `/:cafeId/activate` | Operational REST API endpoint |
| `cafeRoutes.js:57` | `PATCH` | `/:cafeId/status` | Operational REST API endpoint |
| `cafeRoutes.js:62` | `POST` | `/:cafeId/archive` | Operational REST API endpoint |
| `cafeRoutes.js:68` | `GET` | `/:cafeId/readiness` | Operational REST API endpoint |
| `cafeRoutes.js:73` | `POST` | `/:cafeId/readiness/checklist` | Operational REST API endpoint |
| `cafeRoutes.js:78` | `POST` | `/:cafeId/readiness/transition` | Operational REST API endpoint |
| `cafeRoutes.js:83` | `GET` | `/:cafeId/compliance-alerts` | Operational REST API endpoint |
| `cafeRoutes.js:88` | `GET` | `/:cafeId/compliance-licences` | Operational REST API endpoint |
| `cafeRoutes.js:94` | `POST` | `/:cafeId/qr/regenerate` | Operational REST API endpoint |
| `cafeRoutes.js:99` | `GET` | `/:cafeId/qr/card` | Operational REST API endpoint |
| `cafeAccessRoutes.js:23` | `GET` | `/qr/:token` | Operational REST API endpoint |
| `cafeAccessRoutes.js:24` | `GET` | `/c/:token` | Operational REST API endpoint |
| `cafeAccessRoutes.js:25` | `POST` | `/resolve` | Operational REST API endpoint |
| `cafeAccessRoutes.js:30` | `POST` | `/verify-binding` | Operational REST API endpoint |
| `cafeAccessRoutes.js:31` | `GET` | `/:cafeId` | Operational REST API endpoint |
| `cafeAccessRoutes.js:32` | `POST` | `/:cafeId/reveal-pin` | Operational REST API endpoint |
| `cafeAccessRoutes.js:33` | `POST` | `/:cafeId/rotate-qr` | Operational REST API endpoint |
| `cafeAccessRoutes.js:34` | `POST` | `/:cafeId/revoke-qr` | Operational REST API endpoint |
| `cafeAccessRoutes.js:35` | `POST` | `/:cafeId/rotate-link` | Operational REST API endpoint |
| `cafeAccessRoutes.js:36` | `POST` | `/:cafeId/emergency-lock` | Operational REST API endpoint |
| `cafeAccessRoutes.js:37` | `POST` | `/:cafeId/emergency-unlock` | Operational REST API endpoint |
| `cafeAccessRoutes.js:38` | `POST` | `/:cafeId/test-access` | Operational REST API endpoint |
| `deviceRoutes.js:16` | `GET` | `/` | Operational REST API endpoint |
| `deviceRoutes.js:25` | `POST` | `/enrollment/start` | Operational REST API endpoint |
| `deviceRoutes.js:28` | `POST` | `/:deviceId/approve` | Authoritative approval transition |
| `deviceRoutes.js:37` | `POST` | `/:deviceId/revoke` | Operational REST API endpoint |
| `deviceRoutes.js:46` | `POST` | `/:deviceId/lost` | Operational REST API endpoint |
| `deviceRoutes.js:55` | `POST` | `/:deviceId/retire` | Operational REST API endpoint |
| `deviceRoutes.js:64` | `POST` | `/:deviceId/replace` | Operational REST API endpoint |
| `deviceRoutes.js:73` | `POST` | `/attendance/challenges` | Workforce time & attendance tracking |
| `deviceRoutes.js:81` | `POST` | `/attendance/leases` | Workforce time & attendance tracking |
| `hardwareRoutes.js:21` | `GET` | `/terminals/:cafeId` | Operational REST API endpoint |
| `hardwareRoutes.js:28` | `POST` | `/terminals` | Operational REST API endpoint |
| `hardwareRoutes.js:35` | `POST` | `/test-print` | Thermal print layout / ESC/POS generator |
| `hardwareRoutes.js:42` | `POST` | `/drawer/kick` | Operational REST API endpoint |
| `hardwareRoutes.js:49` | `POST` | `/kot/route` | Operational REST API endpoint |
| `hardwareRoutes.js:56` | `GET` | `/terminals/:terminalId/health` | Infrastructure liveness/readiness health probe |
| `hardwareRoutes.js:63` | `POST` | `/receipt/preview-html` | Operational REST API endpoint |

### 10.3 Point of Sale (POS), Billing & Cash Management

| Source File | HTTP Method | Endpoint Route Path | Architectural Description |
| :--- | :--- | :--- | :--- |
| `posRoutes.js:32` | `POST` | `/orders/commit` | Operational REST API endpoint |
| `posRoutes.js:33` | `POST` | `/offline-sync` | Operational REST API endpoint |
| `posRoutes.js:34` | `POST` | `/orders/preview` | Operational REST API endpoint |
| `posRoutes.js:35` | `POST` | `/orders/:billId/print` | Thermal print layout / ESC/POS generator |
| `posRoutes.js:36` | `POST` | `/orders/:billId/reprint` | Thermal print layout / ESC/POS generator |
| `posRoutes.js:37` | `GET` | `/orders/active/:cafeId` | Operational REST API endpoint |
| `posRoutes.js:38` | `GET` | `/orders/last/:cafeId` | Operational REST API endpoint |
| `posRoutes.js:41` | `GET` | `/orders/status/:transactionId` | Operational REST API endpoint |
| `posRoutes.js:44` | `GET` | `/reconciliation/pending` | Operational REST API endpoint |
| `posRoutes.js:45` | `POST` | `/reconciliation/:jobId/retry` | Operational REST API endpoint |
| `posRoutes.js:48` | `GET` | `/offline-reviews/pending` | Operational REST API endpoint |
| `posRoutes.js:49` | `POST` | `/offline-reviews/:reviewId/review` | Operational REST API endpoint |
| `billRoutes.js:42` | `GET` | `/overview` | Operational REST API endpoint |
| `billRoutes.js:43` | `GET` | `/tax/gst-register` | Operational REST API endpoint |
| `billRoutes.js:44` | `GET` | `/reconciliation/status` | Operational REST API endpoint |
| `billRoutes.js:45` | `POST` | `/eod/close` | Operational REST API endpoint |
| `billRoutes.js:48` | `GET` | `/history/stats` | Operational REST API endpoint |
| `billRoutes.js:49` | `GET` | `/history/calendar` | Operational REST API endpoint |
| `billRoutes.js:52` | `GET` | `/tickets/open` | Operational REST API endpoint |
| `billRoutes.js:53` | `POST` | `/tickets/hold` | Operational REST API endpoint |
| `billRoutes.js:56` | `GET` | `/register/session/current` | Operational REST API endpoint |
| `billRoutes.js:57` | `POST` | `/register/session/open` | Operational REST API endpoint |
| `billRoutes.js:58` | `POST` | `/register/session/event` | Operational REST API endpoint |
| `billRoutes.js:59` | `POST` | `/register/session/close` | Operational REST API endpoint |
| `billRoutes.js:62` | `GET` | `/` | Operational REST API endpoint |
| `billRoutes.js:63` | `GET` | `/:billId/pdf` | Operational REST API endpoint |
| `billRoutes.js:64` | `GET` | `/:billId` | Operational REST API endpoint |
| `billRoutes.js:67` | `POST` | `/` | Operational REST API endpoint |
| `billRoutes.js:68` | `POST` | `/commit` | Operational REST API endpoint |
| `billRoutes.js:69` | `POST` | `/preview` | Operational REST API endpoint |
| `billRoutes.js:70` | `POST` | `/offline-sync` | Operational REST API endpoint |
| `billRoutes.js:71` | `POST` | `/:billId/split` | Operational REST API endpoint |
| `billRoutes.js:74` | `POST` | `/:billId/reprint` | Thermal print layout / ESC/POS generator |
| `billRoutes.js:75` | `POST` | `/:billId/void` | Operational REST API endpoint |
| `billRoutes.js:76` | `POST` | `/:billId/refund` | Operational REST API endpoint |
| `cashRoutes.js:30` | `GET` | `/summary` | Operational REST API endpoint |
| `cashRoutes.js:35` | `GET` | `/:cashTransactionId` | Operational REST API endpoint |
| `cashRoutes.js:40` | `POST` | `/:cashTransactionId/reverse` | Operational REST API endpoint |
| `universalQrRoutes.js:15` | `POST` | `/verify` | Operational REST API endpoint |
| `universalQrRoutes.js:36` | `GET` | `/:qrId` | Operational REST API endpoint |
| `universalQrRoutes.js:62` | `GET` | `/:qrId/svg` | Operational REST API endpoint |
| `universalQrRoutes.js:82` | `GET` | `/:qrId/card-pdf` | Operational REST API endpoint |
| `universalQrRoutes.js:108` | `POST` | `/generate` | Operational REST API endpoint |
| `universalQrRoutes.js:141` | `POST` | `/:qrId/revoke` | Operational REST API endpoint |
| `universalQrRoutes.js:160` | `POST` | `/:qrId/regenerate` | Operational REST API endpoint |

### 10.4 Inventory Control & Recipe Stock Depletion

| Source File | HTTP Method | Endpoint Route Path | Architectural Description |
| :--- | :--- | :--- | :--- |
| `inventoryRoutes.js:59` | `GET` | `/overview` | Operational REST API endpoint |
| `inventoryRoutes.js:66` | `GET` | `/items` | Operational REST API endpoint |
| `inventoryRoutes.js:72` | `GET` | `/items/:itemId` | Operational REST API endpoint |
| `inventoryRoutes.js:78` | `POST` | `/items` | Operational REST API endpoint |
| `inventoryRoutes.js:84` | `PATCH` | `/items/:itemId` | Operational REST API endpoint |
| `inventoryRoutes.js:90` | `POST` | `/items/:itemId/archive` | Operational REST API endpoint |
| `inventoryRoutes.js:97` | `GET` | `/cafes/:cafeId/stock` | Operational REST API endpoint |
| `inventoryRoutes.js:103` | `GET` | `/cafes/:cafeId/stock/:itemId` | Operational REST API endpoint |
| `inventoryRoutes.js:109` | `PATCH` | `/cafes/:cafeId/stock/:itemId/configure` | Operational REST API endpoint |
| `inventoryRoutes.js:116` | `POST` | `/movements` | Operational REST API endpoint |
| `inventoryRoutes.js:122` | `GET` | `/movements` | Operational REST API endpoint |
| `inventoryRoutes.js:128` | `POST` | `/receipts` | Operational REST API endpoint |
| `inventoryRoutes.js:135` | `GET` | `/transfers` | Operational REST API endpoint |
| `inventoryRoutes.js:141` | `POST` | `/transfers` | Operational REST API endpoint |
| `inventoryRoutes.js:147` | `POST` | `/transfers/:transferId/dispatch` | Operational REST API endpoint |
| `inventoryRoutes.js:153` | `POST` | `/transfers/:transferId/receive` | Goods receipt note & stock increment |
| `inventoryRoutes.js:160` | `GET` | `/lots` | Operational REST API endpoint |
| `inventoryRoutes.js:166` | `GET` | `/expiry-schedule` | Operational REST API endpoint |
| `inventoryRoutes.js:172` | `GET` | `/fefo/alerts` | Operational REST API endpoint |
| `inventoryRoutes.js:178` | `POST` | `/fefo/plan` | Operational REST API endpoint |
| `inventoryRoutes.js:184` | `POST` | `/lots/:lotId/quarantine` | Operational REST API endpoint |
| `inventoryRoutes.js:190` | `POST` | `/lots/:lotId/release` | Operational REST API endpoint |
| `inventoryRoutes.js:196` | `POST` | `/lots/:lotId/disposition` | Operational REST API endpoint |
| `inventoryRoutes.js:203` | `GET` | `/incoming-inspections` | Operational REST API endpoint |
| `inventoryRoutes.js:209` | `POST` | `/incoming-inspections` | Operational REST API endpoint |
| `inventoryRoutes.js:216` | `GET` | `/recalls` | Operational REST API endpoint |
| `inventoryRoutes.js:222` | `GET` | `/recalls/trace/forward` | Operational REST API endpoint |
| `inventoryRoutes.js:228` | `GET` | `/recalls/trace/backward` | Operational REST API endpoint |
| `inventoryRoutes.js:234` | `POST` | `/recalls` | Operational REST API endpoint |
| `inventoryRoutes.js:241` | `GET` | `/replenishment/recommendations` | Operational REST API endpoint |
| `inventoryRoutes.js:248` | `GET` | `/counts` | Operational REST API endpoint |
| `inventoryRoutes.js:254` | `GET` | `/cycle-counts` | Operational REST API endpoint |
| `inventoryRoutes.js:260` | `POST` | `/counts` | Operational REST API endpoint |
| `inventoryRoutes.js:266` | `POST` | `/cycle-counts` | Operational REST API endpoint |
| `inventoryRoutes.js:272` | `POST` | `/counts/:countId/approve` | Authoritative approval transition |
| `inventoryRoutes.js:278` | `POST` | `/cycle-counts/:countId/approve` | Authoritative approval transition |
| `inventoryRoutes.js:285` | `POST` | `/wastage` | Operational REST API endpoint |
| `inventoryRoutes.js:292` | `GET` | `/reservations` | Operational REST API endpoint |
| `inventoryRoutes.js:298` | `POST` | `/reservations` | Operational REST API endpoint |
| `inventoryRoutes.js:304` | `POST` | `/reservations/:reservationId/release` | Operational REST API endpoint |
| `inventoryRoutes.js:311` | `POST` | `/internal-transfers` | Operational REST API endpoint |
| `inventoryRoutes.js:318` | `GET` | `/items/:itemId/360` | Operational REST API endpoint |
| `inventoryRoutes.js:325` | `GET` | `/consumption/variance` | Operational REST API endpoint |
| `inventoryRoutes.js:331` | `GET` | `/reports/recipe-variance` | Operational REST API endpoint |
| `inventoryRoutes.js:338` | `GET` | `/reports/valuation` | Operational REST API endpoint |
| `inventoryRoutes.js:345` | `GET` | `/integrity` | Operational REST API endpoint |
| `menuRoutes.js:46` | `GET` | `/overview` | Operational REST API endpoint |
| `menuRoutes.js:53` | `GET` | `/items` | Operational REST API endpoint |
| `menuRoutes.js:59` | `GET` | `/items/:menuItemId` | Operational REST API endpoint |
| `menuRoutes.js:65` | `POST` | `/items` | Operational REST API endpoint |
| `menuRoutes.js:71` | `PATCH` | `/items/:menuItemId` | Operational REST API endpoint |
| `menuRoutes.js:77` | `DELETE` | `/items/:menuItemId` | Operational REST API endpoint |
| `menuRoutes.js:84` | `GET` | `/recipes` | Operational REST API endpoint |
| `menuRoutes.js:90` | `GET` | `/recipes/:recipeId` | Operational REST API endpoint |
| `menuRoutes.js:96` | `POST` | `/recipes` | Operational REST API endpoint |
| `menuRoutes.js:102` | `PATCH` | `/recipes/:recipeId` | Operational REST API endpoint |
| `menuRoutes.js:109` | `GET` | `/modifier-groups` | Operational REST API endpoint |
| `menuRoutes.js:115` | `GET` | `/modifiers` | Operational REST API endpoint |
| `menuRoutes.js:121` | `POST` | `/modifier-groups` | Operational REST API endpoint |
| `menuRoutes.js:127` | `POST` | `/modifiers` | Operational REST API endpoint |
| `menuRoutes.js:134` | `GET` | `/combos` | Operational REST API endpoint |
| `menuRoutes.js:140` | `POST` | `/combos` | Operational REST API endpoint |
| `menuRoutes.js:147` | `GET` | `/menus` | Operational REST API endpoint |
| `menuRoutes.js:153` | `POST` | `/menus` | Operational REST API endpoint |
| `menuRoutes.js:160` | `GET` | `/outlets/:outletId/offerings` | Operational REST API endpoint |
| `menuRoutes.js:166` | `POST` | `/outlets/:outletId/offerings/:menuItemId/availability` | Operational REST API endpoint |
| `menuRoutes.js:172` | `POST` | `/outlets/:outletId/offerings/:menuItemId/price` | Operational REST API endpoint |
| `menuRoutes.js:179` | `GET` | `/change-sets` | Operational REST API endpoint |
| `menuRoutes.js:185` | `GET` | `/changesets` | Operational REST API endpoint |
| `menuRoutes.js:191` | `POST` | `/change-sets` | Operational REST API endpoint |
| `menuRoutes.js:197` | `POST` | `/changesets` | Operational REST API endpoint |
| `menuRoutes.js:203` | `POST` | `/change-sets/:changeSetId/publish` | Operational REST API endpoint |
| `menuRoutes.js:209` | `POST` | `/changesets/:changeSetId/publish` | Operational REST API endpoint |
| `menuRoutes.js:215` | `POST` | `/publications/:publicationId/rollback` | Operational REST API endpoint |
| `menuRoutes.js:222` | `GET` | `/simulator` | Operational REST API endpoint |
| `menuRoutes.js:229` | `GET` | `/integrity` | Operational REST API endpoint |
| `menuRoutes.js:235` | `GET` | `/analytics` | Operational REST API endpoint |

### 10.5 Procurement, Goods Receipt & Vendor Ledger

| Source File | HTTP Method | Endpoint Route Path | Architectural Description |
| :--- | :--- | :--- | :--- |
| `procurementRoutes.js:94` | `GET` | `/overview` | Operational REST API endpoint |
| `procurementRoutes.js:100` | `GET` | `/integrity` | Operational REST API endpoint |
| `procurementRoutes.js:107` | `GET` | `/suppliers/:vendorId/intelligence` | Operational REST API endpoint |
| `procurementRoutes.js:114` | `GET` | `/catalogue` | Operational REST API endpoint |
| `procurementRoutes.js:121` | `GET` | `/requisitions` | Operational REST API endpoint |
| `procurementRoutes.js:127` | `POST` | `/requisitions` | Operational REST API endpoint |
| `procurementRoutes.js:133` | `POST` | `/requisitions/:requisitionId/convert-to-po` | Operational REST API endpoint |
| `procurementRoutes.js:140` | `GET` | `/asns` | Operational REST API endpoint |
| `procurementRoutes.js:146` | `GET` | `/asns/:asnNumber` | Operational REST API endpoint |
| `procurementRoutes.js:152` | `POST` | `/asns` | Operational REST API endpoint |
| `procurementRoutes.js:158` | `POST` | `/asns/:asnNumber/status` | Operational REST API endpoint |
| `procurementRoutes.js:164` | `POST` | `/asns/:asnNumber/cancel` | Operational REST API endpoint |
| `procurementRoutes.js:171` | `GET` | `/rfqs` | Operational REST API endpoint |
| `procurementRoutes.js:177` | `POST` | `/rfqs` | Operational REST API endpoint |
| `procurementRoutes.js:184` | `GET` | `/grns` | Goods receipt note & stock increment |
| `procurementRoutes.js:190` | `POST` | `/grns` | Goods receipt note & stock increment |
| `procurementRoutes.js:197` | `GET` | `/matching` | Operational REST API endpoint |
| `procurementRoutes.js:204` | `GET` | `/orders` | Operational REST API endpoint |
| `procurementRoutes.js:210` | `GET` | `/orders/:purchaseOrderId` | Operational REST API endpoint |
| `procurementRoutes.js:217` | `GET` | `/orders/:purchaseOrderId/documents` | Operational REST API endpoint |
| `procurementRoutes.js:223` | `POST` | `/orders/:purchaseOrderId/documents` | Operational REST API endpoint |
| `procurementRoutes.js:230` | `GET` | `/orders/:purchaseOrderId/documents/:documentId/preview` | Operational REST API endpoint |
| `procurementRoutes.js:236` | `GET` | `/orders/:purchaseOrderId/documents/:documentId/download` | Operational REST API endpoint |
| `procurementRoutes.js:242` | `POST` | `/orders/:purchaseOrderId/documents/:documentId/replace-version` | Operational REST API endpoint |
| `procurementRoutes.js:249` | `DELETE` | `/orders/:purchaseOrderId/documents/:documentId` | Operational REST API endpoint |
| `procurementRoutes.js:255` | `GET` | `/orders/:purchaseOrderId/matching-status` | Operational REST API endpoint |
| `procurementRoutes.js:262` | `POST` | `/orders` | Operational REST API endpoint |
| `procurementRoutes.js:268` | `POST` | `/orders/:purchaseOrderId/submit` | Operational REST API endpoint |
| `procurementRoutes.js:274` | `POST` | `/orders/:purchaseOrderId/approve` | Authoritative approval transition |
| `procurementRoutes.js:280` | `POST` | `/orders/:purchaseOrderId/order` | Operational REST API endpoint |
| `procurementRoutes.js:286` | `POST` | `/orders/:purchaseOrderId/receive` | Goods receipt note & stock increment |
| `procurementRoutes.js:292` | `POST` | `/orders/:purchaseOrderId/cancel` | Operational REST API endpoint |
| `procurementRoutes.js:299` | `POST` | `/orders/:purchaseOrderId/vendor-confirm` | Operational REST API endpoint |
| `procurementRoutes.js:305` | `POST` | `/orders/:purchaseOrderId/lines/:lineId/backorder` | Operational REST API endpoint |
| `procurementRoutes.js:311` | `POST` | `/orders/:purchaseOrderId/lines/:lineId/vendor-unavailable` | Operational REST API endpoint |
| `procurementRoutes.js:317` | `POST` | `/orders/:purchaseOrderId/lines/:lineId/close-short` | Operational REST API endpoint |
| `procurementRoutes.js:323` | `POST` | `/orders/:purchaseOrderId/lines/:lineId/cancel-line` | Operational REST API endpoint |
| `procurementRoutes.js:329` | `POST` | `/orders/:purchaseOrderId/lines/:lineId/substitute/propose` | Operational REST API endpoint |
| `procurementRoutes.js:335` | `POST` | `/orders/:purchaseOrderId/lines/:lineId/substitute/decide` | Operational REST API endpoint |
| `procurementRoutes.js:341` | `POST` | `/orders/:purchaseOrderId/lines/:lineId/source-elsewhere` | Operational REST API endpoint |
| `procurementRoutes.js:347` | `GET` | `/suppliers/:vendorId/fulfillment-metrics` | Operational REST API endpoint |
| `procurementRoutes.js:353` | `POST` | `/orders/:purchaseOrderId/send-to-accounts` | Operational REST API endpoint |
| `vendorRoutes.js:40` | `GET` | `/performance` | Operational REST API endpoint |
| `vendorRoutes.js:46` | `GET` | `/continuity` | Operational REST API endpoint |
| `vendorRoutes.js:52` | `GET` | `/reports/zurf-pdf` | Operational REST API endpoint |
| `vendorRoutes.js:59` | `POST` | `/orders/:poId/place` | Operational REST API endpoint |
| `vendorRoutes.js:65` | `POST` | `/orders/:poId/acknowledge` | Operational REST API endpoint |
| `vendorRoutes.js:71` | `POST` | `/orders/:poId/receipts` | Operational REST API endpoint |
| `vendorRoutes.js:77` | `POST` | `/orders/:poId/invoices` | Operational REST API endpoint |
| `vendorRoutes.js:83` | `GET` | `/orders/:poId/match` | Operational REST API endpoint |
| `vendorRoutes.js:90` | `POST` | `/orders/:poId/master-approve` | Authoritative approval transition |
| `vendorRoutes.js:96` | `POST` | `/orders/:poId/retry-posting` | Operational REST API endpoint |
| `vendorRoutes.js:103` | `GET` | `/` | Operational REST API endpoint |
| `vendorRoutes.js:109` | `GET` | `/:vendorId` | Operational REST API endpoint |
| `vendorRoutes.js:115` | `GET` | `/:vendorId/360` | Operational REST API endpoint |
| `vendorRoutes.js:122` | `POST` | `/` | Operational REST API endpoint |
| `vendorRoutes.js:128` | `PATCH` | `/:vendorId` | Operational REST API endpoint |
| `vendorRoutes.js:134` | `POST` | `/:vendorId/status` | Operational REST API endpoint |
| `vendorRoutes.js:140` | `PATCH` | `/:vendorId/status` | Operational REST API endpoint |
| `vendorRoutes.js:147` | `POST` | `/:vendorId/bank-change-request` | Operational REST API endpoint |
| `vendorRoutes.js:153` | `POST` | `/:vendorId/bank-change-approve` | Authoritative approval transition |
| `vendorRoutes.js:159` | `POST` | `/:vendorId/bank-change-reject` | Operational REST API endpoint |
| `vendorRoutes.js:165` | `POST` | `/:vendorId/holds` | Operational REST API endpoint |
| `vendorRoutes.js:171` | `DELETE` | `/:vendorId/holds/:holdId` | Operational REST API endpoint |
| `vendorLedgerRoutes.js:29` | `GET` | `/vendors/:vendorId` | Operational REST API endpoint |
| `vendorLedgerRoutes.js:38` | `GET` | `/vendors/:vendorId/statement` | Operational REST API endpoint |
| `vendorLedgerRoutes.js:47` | `POST` | `/vendors/:vendorId/opening-balance` | Operational REST API endpoint |
| `vendorLedgerRoutes.js:53` | `POST` | `/vendors/:vendorId/rebuild-summary` | Operational REST API endpoint |
| `vendorLedgerRoutes.js:60` | `POST` | `/bills/from-po/:purchaseOrderId` | Operational REST API endpoint |
| `vendorLedgerRoutes.js:70` | `GET` | `/ap/queue` | Operational REST API endpoint |
| `vendorLedgerRoutes.js:80` | `POST` | `/payments` | Operational REST API endpoint |
| `vendorLedgerRoutes.js:86` | `POST` | `/payments/:paymentId/reverse` | Operational REST API endpoint |
| `vendorLedgerRoutes.js:93` | `POST` | `/advances` | Operational REST API endpoint |
| `vendorLedgerRoutes.js:99` | `POST` | `/advances/apply` | Operational REST API endpoint |
| `vendorLedgerRoutes.js:105` | `POST` | `/credits/apply` | Operational REST API endpoint |
| `vendorLedgerRoutes.js:115` | `POST` | `/bills/:invoiceId/holds/release` | Operational REST API endpoint |
| `vendorLedgerRoutes.js:122` | `GET` | `/reports/aging` | Operational REST API endpoint |
| `vendorLedgerRoutes.js:131` | `GET` | `/reports/gst-180-days` | Operational REST API endpoint |

### 10.6 Human Resources, Biometric Attendance & Shift Management

| Source File | HTTP Method | Endpoint Route Path | Architectural Description |
| :--- | :--- | :--- | :--- |
| `employeeRoutes.js:55` | `GET` | `/overview` | Operational REST API endpoint |
| `employeeRoutes.js:62` | `GET` | `/positions` | Operational REST API endpoint |
| `employeeRoutes.js:67` | `POST` | `/positions` | Operational REST API endpoint |
| `employeeRoutes.js:74` | `GET` | `/staffing-requests` | Operational REST API endpoint |
| `employeeRoutes.js:79` | `POST` | `/staffing-requests` | Operational REST API endpoint |
| `employeeRoutes.js:86` | `GET` | `/integrity` | Operational REST API endpoint |
| `employeeRoutes.js:93` | `GET` | `/` | Operational REST API endpoint |
| `employeeRoutes.js:99` | `GET` | `/search` | Operational REST API endpoint |
| `employeeRoutes.js:106` | `POST` | `/` | Operational REST API endpoint |
| `employeeRoutes.js:113` | `POST` | `/register` | Operational REST API endpoint |
| `employeeRoutes.js:120` | `GET` | `/alerts/compliance` | Operational REST API endpoint |
| `employeeRoutes.js:127` | `GET` | `/me/dashboard` | Operational REST API endpoint |
| `employeeRoutes.js:137` | `GET` | `/me` | Operational REST API endpoint |
| `employeeRoutes.js:147` | `PATCH` | `/me` | Operational REST API endpoint |
| `employeeRoutes.js:157` | `GET` | `/me/change-requests` | Operational REST API endpoint |
| `employeeRoutes.js:167` | `POST` | `/me/change-requests` | Operational REST API endpoint |
| `employeeRoutes.js:177` | `POST` | `/me/change-requests/:requestId/withdraw` | Operational REST API endpoint |
| `employeeRoutes.js:187` | `GET` | `/me/history` | Operational REST API endpoint |
| `employeeRoutes.js:197` | `POST` | `/me/attestation` | Operational REST API endpoint |
| `employeeRoutes.js:207` | `GET` | `/me/documents` | Operational REST API endpoint |
| `employeeRoutes.js:217` | `POST` | `/me/documents/upload` | Operational REST API endpoint |
| `employeeRoutes.js:227` | `GET` | `/me/documents/:documentId/download` | Operational REST API endpoint |
| `employeeRoutes.js:237` | `DELETE` | `/me/documents/:documentId` | Operational REST API endpoint |
| `employeeRoutes.js:247` | `GET` | `/me/profile-summary/export` | Standardized OOXML XLSX / PDF export |
| `employeeRoutes.js:258` | `GET` | `/me/training` | Operational REST API endpoint |
| `employeeRoutes.js:268` | `POST` | `/me/sops/:sopId/acknowledge` | Operational REST API endpoint |
| `employeeRoutes.js:279` | `GET` | `/team/training` | Operational REST API endpoint |
| `employeeRoutes.js:286` | `GET` | `/:userId` | Operational REST API endpoint |
| `employeeRoutes.js:295` | `GET` | `/:userId/360` | Operational REST API endpoint |
| `employeeRoutes.js:305` | `POST` | `/:userId/movements` | Operational REST API endpoint |
| `employeeRoutes.js:312` | `POST` | `/:userId/probation` | Operational REST API endpoint |
| `employeeRoutes.js:319` | `POST` | `/:userId/skills` | Operational REST API endpoint |
| `employeeRoutes.js:326` | `GET` | `/food-safety/trainings` | Operational REST API endpoint |
| `employeeRoutes.js:332` | `POST` | `/:userId/training` | Operational REST API endpoint |
| `employeeRoutes.js:339` | `POST` | `/:userId/documents/generate` | Operational REST API endpoint |
| `employeeRoutes.js:346` | `POST` | `/:userId/offboard` | Operational REST API endpoint |
| `employeeRoutes.js:353` | `GET` | `/:userId/readiness` | Operational REST API endpoint |
| `employeeRoutes.js:359` | `PATCH` | `/:userId/readiness` | Operational REST API endpoint |
| `employeeRoutes.js:366` | `POST` | `/:userId/lifecycle` | Operational REST API endpoint |
| `employeeRoutes.js:373` | `POST` | `/:userId/qr/generate` | Operational REST API endpoint |
| `employeeRoutes.js:380` | `POST` | `/:userId/sensitive/view` | Operational REST API endpoint |
| `userRoutes.js:66` | `POST` | `/:userId/role-impact` | Operational REST API endpoint |
| `userRoutes.js:72` | `POST` | `/:userId/role/preview` | Operational REST API endpoint |
| `userRoutes.js:78` | `PATCH` | `/:userId/role` | Operational REST API endpoint |
| `userRoutes.js:84` | `PATCH` | `/:userId/status` | Operational REST API endpoint |
| `userRoutes.js:90` | `POST` | `/:userId/archive` | Operational REST API endpoint |
| `shiftRoutes.js:32` | `GET` | `/me/requests` | Operational REST API endpoint |
| `shiftRoutes.js:33` | `POST` | `/me/requests` | Operational REST API endpoint |
| `shiftRoutes.js:34` | `GET` | `/me/schedule` | Operational REST API endpoint |
| `shiftRoutes.js:37` | `GET` | `/requests` | Operational REST API endpoint |
| `shiftRoutes.js:38` | `PATCH` | `/requests/:requestId` | Operational REST API endpoint |
| `shiftRoutes.js:41` | `GET` | `/handovers` | Operational REST API endpoint |
| `shiftRoutes.js:42` | `GET` | `/handovers/latest` | Operational REST API endpoint |
| `shiftRoutes.js:43` | `POST` | `/handovers` | Operational REST API endpoint |
| `shiftRoutes.js:44` | `POST` | `/handovers/:handoverId/acknowledge` | Operational REST API endpoint |
| `shiftRoutes.js:46` | `GET` | `/` | Operational REST API endpoint |
| `shiftRoutes.js:47` | `GET` | `/:shiftId` | Operational REST API endpoint |
| `shiftRoutes.js:48` | `POST` | `/` | Operational REST API endpoint |
| `shiftRoutes.js:49` | `PATCH` | `/:shiftId` | Operational REST API endpoint |
| `shiftRoutes.js:50` | `PATCH` | `/:shiftId/deactivate` | Operational REST API endpoint |
| `shiftRoutes.js:51` | `PATCH` | `/:shiftId/activate` | Operational REST API endpoint |
| `holidayRoutes.js:18` | `GET` | `/` | Operational REST API endpoint |
| `holidayRoutes.js:19` | `GET` | `/:holidayId` | Operational REST API endpoint |
| `holidayRoutes.js:20` | `POST` | `/` | Operational REST API endpoint |
| `holidayRoutes.js:21` | `PATCH` | `/:holidayId` | Operational REST API endpoint |
| `holidayRoutes.js:22` | `DELETE` | `/:holidayId` | Operational REST API endpoint |
| `leaveRoutes.js:31` | `GET` | `/balances` | Operational REST API endpoint |
| `leaveRoutes.js:32` | `GET` | `/types` | Operational REST API endpoint |
| `leaveRoutes.js:33` | `GET` | `/ledger` | Operational REST API endpoint |
| `leaveRoutes.js:34` | `POST` | `/calculate` | Operational REST API endpoint |
| `leaveRoutes.js:35` | `POST` | `/preview` | Operational REST API endpoint |
| `leaveRoutes.js:36` | `POST` | `/requests` | Operational REST API endpoint |
| `leaveRoutes.js:37` | `GET` | `/requests` | Operational REST API endpoint |
| `leaveRoutes.js:38` | `GET` | `/requests/:leaveId` | Operational REST API endpoint |
| `leaveRoutes.js:39` | `POST` | `/requests/:leaveId/withdraw` | Operational REST API endpoint |
| `leaveRoutes.js:40` | `POST` | `/requests/:leaveId/cancel` | Operational REST API endpoint |
| `leaveRoutes.js:41` | `GET` | `/calendar` | Operational REST API endpoint |
| `leaveRoutes.js:42` | `GET` | `/statement` | Operational REST API endpoint |

### 10.7 Statutory Code on Wages Payroll & Loans

| Source File | HTTP Method | Endpoint Route Path | Architectural Description |
| :--- | :--- | :--- | :--- |
| `payrollRoutes.js:71` | `GET` | `/me/payslips` | Operational REST API endpoint |
| `payrollRoutes.js:76` | `GET` | `/me/payslips/:payslipId` | Operational REST API endpoint |
| `payrollRoutes.js:81` | `GET` | `/payslip/:employeeId/:month` | Operational REST API endpoint |
| `payrollRoutes.js:86` | `GET` | `/export/bank-disbursement/:payrollRunId` | Statutory payroll calculation & salary slip |
| `payrollRoutes.js:91` | `POST` | `/me/queries` | Operational REST API endpoint |
| `payrollRoutes.js:96` | `GET` | `/me/queries` | Operational REST API endpoint |
| `payrollRoutes.js:101` | `GET` | `/queries` | Operational REST API endpoint |
| `payrollRoutes.js:106` | `PATCH` | `/queries/:queryId` | Operational REST API endpoint |
| `payrollRoutes.js:111` | `GET` | `/overview` | Operational REST API endpoint |
| `payrollRoutes.js:116` | `GET` | `/compliance/overview` | Operational REST API endpoint |
| `payrollRoutes.js:121` | `GET` | `/integrity` | Operational REST API endpoint |
| `payrollRoutes.js:126` | `GET` | `/runs` | Operational REST API endpoint |
| `payrollRoutes.js:131` | `POST` | `/runs` | Operational REST API endpoint |
| `payrollRoutes.js:136` | `GET` | `/runs/:payrollRunId/payslips` | Statutory payroll calculation & salary slip |
| `payrollRoutes.js:141` | `GET` | `/runs/:payrollRunId/reconciliation` | Statutory payroll calculation & salary slip |
| `payrollRoutes.js:146` | `GET` | `/runs/:payrollRunId/exceptions` | Statutory payroll calculation & salary slip |
| `payrollRoutes.js:151` | `GET` | `/runs/:payrollRunId/payments` | Statutory payroll calculation & salary slip |
| `payrollRoutes.js:156` | `POST` | `/runs/:payrollRunId/payments/batch` | Statutory payroll calculation & salary slip |
| `payrollRoutes.js:161` | `POST` | `/runs/:payrollRunId/payslips` | Statutory payroll calculation & salary slip |
| `payrollRoutes.js:166` | `PATCH` | `/runs/:payrollRunId/payslips/:payslipId` | Statutory payroll calculation & salary slip |
| `payrollRoutes.js:171` | `POST` | `/runs/:payrollRunId/calculate` | Statutory payroll calculation & salary slip |
| `payrollRoutes.js:176` | `POST` | `/runs/:payrollRunId/submit` | Statutory payroll calculation & salary slip |
| `payrollRoutes.js:181` | `POST` | `/runs/:payrollRunId/approve` | Authoritative approval transition |
| `payrollRoutes.js:186` | `POST` | `/runs/:payrollRunId/issue-payslips` | Statutory payroll calculation & salary slip |
| `payrollRoutes.js:191` | `POST` | `/runs/:payrollRunId/pay` | Statutory payroll calculation & salary slip |
| `payrollRoutes.js:196` | `POST` | `/runs/:payrollRunId/void` | Statutory payroll calculation & salary slip |
| `payrollRoutes.js:201` | `GET` | `/runs/:payrollRunId` | Statutory payroll calculation & salary slip |
| `payrollRoutes.js:206` | `PATCH` | `/runs/:payrollRunId` | Statutory payroll calculation & salary slip |
| `loanAdvanceRoutes.js:37` | `GET` | `/me` | Operational REST API endpoint |
| `loanAdvanceRoutes.js:46` | `GET` | `/me/:loanAdvanceId` | Operational REST API endpoint |
| `loanAdvanceRoutes.js:55` | `POST` | `/me/requests/loan` | Operational REST API endpoint |
| `loanAdvanceRoutes.js:64` | `POST` | `/me/requests/advance` | Operational REST API endpoint |
| `loanAdvanceRoutes.js:73` | `POST` | `/me/requests/:loanAdvanceId/withdraw` | Operational REST API endpoint |
| `loanAdvanceRoutes.js:82` | `POST` | `/me/loans/:loanAdvanceId/repayments/manual` | Operational REST API endpoint |
| `loanAdvanceRoutes.js:91` | `POST` | `/me/loans/:loanAdvanceId/pause` | Operational REST API endpoint |
| `loanAdvanceRoutes.js:100` | `GET` | `/me/loans/:loanAdvanceId/settlement-quote` | Operational REST API endpoint |
| `loanAdvanceRoutes.js:109` | `POST` | `/me/loans/:loanAdvanceId/settlement-request` | Operational REST API endpoint |
| `loanAdvanceRoutes.js:120` | `GET` | `/admin/loans` | Operational REST API endpoint |
| `loanAdvanceRoutes.js:126` | `POST` | `/admin/loans/:loanAdvanceId/approve` | Authoritative approval transition |
| `loanAdvanceRoutes.js:132` | `POST` | `/admin/loans/:loanAdvanceId/disburse` | Operational REST API endpoint |
| `loanAdvanceRoutes.js:138` | `POST` | `/admin/loans/:loanAdvanceId/pause-decision` | Operational REST API endpoint |
| `loanAdvanceRoutes.js:144` | `POST` | `/admin/transactions/:transactionId/verify` | Operational REST API endpoint |
| `loanAdvanceRoutes.js:150` | `POST` | `/admin/loans/:loanAdvanceId/settlement` | Operational REST API endpoint |
| `loanAdvanceRoutes.js:156` | `GET` | `/admin/integrity` | Operational REST API endpoint |

### 10.8 Personal Ledger & Treasury Passbook

| Source File | HTTP Method | Endpoint Route Path | Architectural Description |
| :--- | :--- | :--- | :--- |
| `personalLedgerRoutes.js:46` | `GET` | `/export` | Standardized OOXML XLSX / PDF export |
| `personalLedgerRoutes.js:56` | `GET` | `/overview` | Operational REST API endpoint |
| `personalLedgerRoutes.js:66` | `GET` | `/balance` | Operational REST API endpoint |
| `personalLedgerRoutes.js:76` | `GET` | `/reconciliation` | Operational REST API endpoint |
| `personalLedgerRoutes.js:86` | `GET` | `/entries` | Operational REST API endpoint |
| `personalLedgerRoutes.js:95` | `GET` | `/` | Operational REST API endpoint |
| `personalLedgerRoutes.js:105` | `GET` | `/entries/:ledgerEntryId` | Operational REST API endpoint |
| `personalLedgerRoutes.js:114` | `GET` | `/:ledgerEntryId` | Operational REST API endpoint |
| `personalLedgerRoutes.js:124` | `POST` | `/entries` | Operational REST API endpoint |
| `personalLedgerRoutes.js:133` | `POST` | `/` | Operational REST API endpoint |
| `personalLedgerRoutes.js:143` | `POST` | `/entries/:ledgerEntryId/classify` | Operational REST API endpoint |
| `personalLedgerRoutes.js:153` | `POST` | `/entries/:ledgerEntryId/reverse-classification` | Operational REST API endpoint |
| `personalLedgerRoutes.js:165` | `POST` | `/entries/:ledgerEntryId/reverse` | Operational REST API endpoint |
| `personalLedgerRoutes.js:176` | `POST` | `/:ledgerEntryId/reverse` | Operational REST API endpoint |
| `personalLedgerRoutes.js:188` | `POST` | `/settlements` | Operational REST API endpoint |
| `personalLedgerRoutes.js:198` | `POST` | `/confirmations` | Operational REST API endpoint |
| `passbookRoutes.js:59` | `GET` | `/overview` | Operational REST API endpoint |
| `passbookRoutes.js:62` | `GET` | `/accounts` | Operational REST API endpoint |
| `passbookRoutes.js:63` | `POST` | `/accounts` | Operational REST API endpoint |
| `passbookRoutes.js:64` | `GET` | `/accounts/:accountId` | Operational REST API endpoint |
| `passbookRoutes.js:65` | `PATCH` | `/accounts/:accountId` | Operational REST API endpoint |
| `passbookRoutes.js:66` | `POST` | `/accounts/:accountId/rebuild-balance` | Operational REST API endpoint |
| `passbookRoutes.js:67` | `POST` | `/accounts/:accountId/adjust-balance` | Operational REST API endpoint |
| `passbookRoutes.js:70` | `GET` | `/transactions` | Operational REST API endpoint |
| `passbookRoutes.js:71` | `POST` | `/transactions` | Operational REST API endpoint |
| `passbookRoutes.js:72` | `POST` | `/transactions/:transactionId/reverse` | Operational REST API endpoint |
| `passbookRoutes.js:75` | `POST` | `/transfers` | Operational REST API endpoint |
| `passbookRoutes.js:78` | `POST` | `/statements/imports` | Operational REST API endpoint |
| `passbookRoutes.js:79` | `POST` | `/reconciliations/confirm` | Operational REST API endpoint |
| `passbookRoutes.js:80` | `POST` | `/reconciliations/:reconciliationId/confirm` | Operational REST API endpoint |
| `passbookRoutes.js:83` | `POST` | `/reservations` | Operational REST API endpoint |
| `passbookRoutes.js:86` | `GET` | `/integrity` | Operational REST API endpoint |
| `passbookRoutes.js:87` | `GET` | `/analytics` | Operational REST API endpoint |
| `passbookRoutes.js:88` | `GET` | `/export/pdf` | Standardized OOXML XLSX / PDF export |

### 10.9 Financial Governance, Expense & Revenue Share

| Source File | HTTP Method | Endpoint Route Path | Architectural Description |
| :--- | :--- | :--- | :--- |
| `financeRoutes.js:47` | `GET` | `/overview` | Operational REST API endpoint |
| `financeRoutes.js:54` | `GET` | `/sales-audit` | Operational REST API endpoint |
| `financeRoutes.js:60` | `POST` | `/sales-audit/store-days/:storeDayId/clear` | Operational REST API endpoint |
| `financeRoutes.js:67` | `GET` | `/coa` | Operational REST API endpoint |
| `financeRoutes.js:73` | `POST` | `/coa` | Operational REST API endpoint |
| `financeRoutes.js:80` | `GET` | `/journals` | Operational REST API endpoint |
| `financeRoutes.js:86` | `GET` | `/journals/:journalId` | Operational REST API endpoint |
| `financeRoutes.js:92` | `POST` | `/journals` | Operational REST API endpoint |
| `financeRoutes.js:98` | `POST` | `/journals/:journalId/post` | Operational REST API endpoint |
| `financeRoutes.js:104` | `POST` | `/journals/:journalId/reverse` | Operational REST API endpoint |
| `financeRoutes.js:111` | `GET` | `/ap/invoices` | Operational REST API endpoint |
| `financeRoutes.js:117` | `POST` | `/ap/invoices` | Operational REST API endpoint |
| `financeRoutes.js:124` | `GET` | `/payments/runs` | Operational REST API endpoint |
| `financeRoutes.js:130` | `POST` | `/payments/proposals` | Operational REST API endpoint |
| `financeRoutes.js:136` | `POST` | `/payments/runs/:paymentRunId/decision` | Operational REST API endpoint |
| `financeRoutes.js:143` | `GET` | `/receivables` | Operational REST API endpoint |
| `financeRoutes.js:149` | `GET` | `/ar/receivables` | Operational REST API endpoint |
| `financeRoutes.js:155` | `POST` | `/receivables/receipts` | Operational REST API endpoint |
| `financeRoutes.js:161` | `POST` | `/ar/receivables/receipts` | Operational REST API endpoint |
| `financeRoutes.js:168` | `GET` | `/marketplaces/settlements` | Operational REST API endpoint |
| `financeRoutes.js:174` | `GET` | `/marketplace/reconciliations` | Operational REST API endpoint |
| `financeRoutes.js:180` | `POST` | `/marketplaces/settlements/:settlementId/reconcile` | Operational REST API endpoint |
| `financeRoutes.js:186` | `POST` | `/marketplace/reconciliations/:settlementId/reconcile` | Operational REST API endpoint |
| `financeRoutes.js:193` | `GET` | `/bank-accounts` | Operational REST API endpoint |
| `financeRoutes.js:199` | `GET` | `/treasury/bank-accounts` | Operational REST API endpoint |
| `financeRoutes.js:206` | `GET` | `/budgets` | Operational REST API endpoint |
| `financeRoutes.js:213` | `GET` | `/tax/review` | Operational REST API endpoint |
| `financeRoutes.js:219` | `GET` | `/tax/summary` | Operational REST API endpoint |
| `financeRoutes.js:226` | `GET` | `/close/status` | Operational REST API endpoint |
| `financeRoutes.js:232` | `GET` | `/period-close/checklist` | Operational REST API endpoint |
| `financeRoutes.js:238` | `POST` | `/close/periods/:periodId/close` | Operational REST API endpoint |
| `financeRoutes.js:244` | `POST` | `/period-close/periods/:periodId/close` | Operational REST API endpoint |
| `financeRoutes.js:250` | `POST` | `/close/periods/:periodId/reopen` | Operational REST API endpoint |
| `financeRoutes.js:257` | `GET` | `/statements` | Operational REST API endpoint |
| `financeRoutes.js:263` | `GET` | `/statements/overview` | Operational REST API endpoint |
| `financeRoutes.js:269` | `GET` | `/statements/pnl` | Operational REST API endpoint |
| `financeRoutes.js:276` | `GET` | `/integrity` | Operational REST API endpoint |
| `financeRoutes.js:283` | `POST` | `/invoices/gst` | Operational REST API endpoint |
| `financeRoutes.js:289` | `GET` | `/invoices/:id/pdf` | Operational REST API endpoint |
| `financeRoutes.js:295` | `GET` | `/reports/gstr1/:cafeId` | Operational REST API endpoint |
| `financeRoutes.js:302` | `POST` | `/reconciliation/z-report` | Operational REST API endpoint |
| `expenseRoutes.js:39` | `GET` | `/overview` | Operational REST API endpoint |
| `expenseRoutes.js:45` | `GET` | `/summary` | Operational REST API endpoint |
| `expenseRoutes.js:51` | `GET` | `/integrity` | Operational REST API endpoint |
| `expenseRoutes.js:58` | `GET` | `/requests` | Operational REST API endpoint |
| `expenseRoutes.js:64` | `POST` | `/requests` | Operational REST API endpoint |
| `expenseRoutes.js:71` | `GET` | `/policies` | Operational REST API endpoint |
| `expenseRoutes.js:77` | `POST` | `/policies` | Operational REST API endpoint |
| `expenseRoutes.js:84` | `GET` | `/cards` | Operational REST API endpoint |
| `expenseRoutes.js:90` | `POST` | `/cards/match` | Operational REST API endpoint |
| `expenseRoutes.js:96` | `GET` | `/advances` | Operational REST API endpoint |
| `expenseRoutes.js:102` | `POST` | `/advances` | Operational REST API endpoint |
| `expenseRoutes.js:108` | `POST` | `/advances/liquidate` | Operational REST API endpoint |
| `expenseRoutes.js:126` | `GET` | `/:expenseId` | Operational REST API endpoint |
| `expenseRoutes.js:132` | `PATCH` | `/:expenseId` | Operational REST API endpoint |
| `expenseRoutes.js:138` | `POST` | `/:expenseId/submit` | Operational REST API endpoint |
| `expenseRoutes.js:144` | `POST` | `/:expenseId/decision` | Operational REST API endpoint |
| `expenseRoutes.js:150` | `POST` | `/:expenseId/missing-receipt` | Operational REST API endpoint |
| `expenseRoutes.js:156` | `POST` | `/:expenseId/pay` | Operational REST API endpoint |
| `expenseRoutes.js:162` | `POST` | `/:expenseId/reverse` | Operational REST API endpoint |
| `revenueShareRoutes.js:52` | `GET` | `/overview` | Operational REST API endpoint |
| `revenueShareRoutes.js:55` | `GET` | `/outlets` | Operational REST API endpoint |
| `revenueShareRoutes.js:56` | `POST` | `/outlets` | Operational REST API endpoint |
| `revenueShareRoutes.js:57` | `GET` | `/outlets/:id` | Operational REST API endpoint |
| `revenueShareRoutes.js:60` | `GET` | `/operators` | Operational REST API endpoint |
| `revenueShareRoutes.js:61` | `POST` | `/operators` | Operational REST API endpoint |
| `revenueShareRoutes.js:62` | `GET` | `/operators/:id` | Operational REST API endpoint |
| `revenueShareRoutes.js:65` | `GET` | `/agreements` | Operational REST API endpoint |
| `revenueShareRoutes.js:66` | `POST` | `/agreements` | Operational REST API endpoint |
| `revenueShareRoutes.js:67` | `GET` | `/agreements/:id` | Operational REST API endpoint |
| `revenueShareRoutes.js:70` | `GET` | `/rate-rules` | Operational REST API endpoint |
| `revenueShareRoutes.js:71` | `POST` | `/rate-rules` | Operational REST API endpoint |
| `revenueShareRoutes.js:74` | `GET` | `/sales` | Operational REST API endpoint |
| `revenueShareRoutes.js:75` | `POST` | `/sales` | Operational REST API endpoint |
| `revenueShareRoutes.js:76` | `POST` | `/sales/:id/approve` | Authoritative approval transition |
| `revenueShareRoutes.js:79` | `POST` | `/settlements/simulate` | Operational REST API endpoint |
| `revenueShareRoutes.js:82` | `GET` | `/settlements` | Operational REST API endpoint |
| `revenueShareRoutes.js:83` | `POST` | `/settlements` | Operational REST API endpoint |
| `revenueShareRoutes.js:84` | `POST` | `/settlements/:id/approve` | Authoritative approval transition |
| `revenueShareRoutes.js:87` | `GET` | `/payments` | Operational REST API endpoint |
| `revenueShareRoutes.js:88` | `POST` | `/payments` | Operational REST API endpoint |
| `revenueShareRoutes.js:91` | `GET` | `/outstanding` | Operational REST API endpoint |
| `revenueShareRoutes.js:94` | `GET` | `/recoveries` | Operational REST API endpoint |
| `revenueShareRoutes.js:95` | `POST` | `/recoveries/meter-readings` | Operational REST API endpoint |
| `revenueShareRoutes.js:98` | `GET` | `/deposits` | Operational REST API endpoint |
| `revenueShareRoutes.js:99` | `POST` | `/deposits/transactions` | Operational REST API endpoint |
| `revenueShareRoutes.js:102` | `GET` | `/disputes` | Operational REST API endpoint |
| `revenueShareRoutes.js:103` | `POST` | `/disputes` | Operational REST API endpoint |
| `revenueShareRoutes.js:104` | `POST` | `/disputes/:id/resolve` | Operational REST API endpoint |
| `revenueShareRoutes.js:107` | `GET` | `/reports/zurf-pdf` | Operational REST API endpoint |

### 10.10 Reporting, BI Analytics & Audit Trail

| Source File | HTTP Method | Endpoint Route Path | Architectural Description |
| :--- | :--- | :--- | :--- |
| `reportRoutes.js:59` | `GET` | `/overview` | Operational REST API endpoint |
| `reportRoutes.js:65` | `GET` | `/library` | Operational REST API endpoint |
| `reportRoutes.js:72` | `GET` | `/sales` | Operational REST API endpoint |
| `reportRoutes.js:78` | `GET` | `/finance` | Operational REST API endpoint |
| `reportRoutes.js:84` | `GET` | `/workforce` | Operational REST API endpoint |
| `reportRoutes.js:90` | `GET` | `/customers` | Operational REST API endpoint |
| `reportRoutes.js:96` | `GET` | `/inventory` | Operational REST API endpoint |
| `reportRoutes.js:102` | `GET` | `/procurement` | Operational REST API endpoint |
| `reportRoutes.js:108` | `GET` | `/menu` | Operational REST API endpoint |
| `reportRoutes.js:114` | `GET` | `/quality` | Operational REST API endpoint |
| `reportRoutes.js:120` | `GET` | `/assets` | Operational REST API endpoint |
| `reportRoutes.js:126` | `GET` | `/portfolio` | Operational REST API endpoint |
| `reportRoutes.js:132` | `GET` | `/goals` | Operational REST API endpoint |
| `reportRoutes.js:138` | `GET` | `/scheduled-alerts` | Operational REST API endpoint |
| `reportRoutes.js:144` | `GET` | `/reconciliations` | Operational REST API endpoint |
| `reportRoutes.js:150` | `GET` | `/reconciliations/audit` | Operational REST API endpoint |
| `reportRoutes.js:156` | `GET` | `/reconciliations/explain` | Operational REST API endpoint |
| `reportRoutes.js:162` | `POST` | `/reconciliations/acknowledge` | Operational REST API endpoint |
| `reportRoutes.js:168` | `GET` | `/data-quality` | Operational REST API endpoint |
| `reportRoutes.js:174` | `GET` | `/metrics` | Operational REST API endpoint |
| `reportRoutes.js:181` | `GET` | `/diagnostics/decomposition` | Operational REST API endpoint |
| `reportRoutes.js:187` | `GET` | `/diagnostics/waterfall` | Operational REST API endpoint |
| `reportRoutes.js:193` | `GET` | `/diagnostics/pareto` | Operational REST API endpoint |
| `reportRoutes.js:199` | `GET` | `/diagnostics/distribution` | Operational REST API endpoint |
| `reportRoutes.js:205` | `GET` | `/diagnostics/correlation` | Operational REST API endpoint |
| `reportRoutes.js:211` | `GET` | `/diagnostics/exceptions` | Operational REST API endpoint |
| `reportRoutes.js:218` | `GET` | `/forecast/models` | Operational REST API endpoint |
| `reportRoutes.js:224` | `GET` | `/forecast/run` | Operational REST API endpoint |
| `reportRoutes.js:230` | `POST` | `/forecast/scenario` | Operational REST API endpoint |
| `reportRoutes.js:236` | `GET` | `/forecast/sensitivity` | Operational REST API endpoint |
| `reportRoutes.js:242` | `POST` | `/forecast/sensitivity` | Operational REST API endpoint |
| `reportRoutes.js:249` | `POST` | `/export` | Standardized OOXML XLSX / PDF export |
| `reportRoutes.js:255` | `GET` | `/export/jobs` | Standardized OOXML XLSX / PDF export |
| `reportRoutes.js:261` | `GET` | `/export/:runId/download` | Standardized OOXML XLSX / PDF export |
| `reportRoutes.js:267` | `GET` | `/integrity` | Operational REST API endpoint |
| `reportRoutes.js:274` | `GET` | `/dashboard` | Operational REST API endpoint |
| `reportRoutes.js:280` | `GET` | `/daily-summary` | Operational REST API endpoint |
| `reportRoutes.js:286` | `GET` | `/cash-flow` | Operational REST API endpoint |
| `reportRoutes.js:292` | `GET` | `/expenses` | Operational REST API endpoint |
| `reportRoutes.js:298` | `GET` | `/attendance` | Workforce time & attendance tracking |
| `reportRoutes.js:306` | `GET` | `/trust-centre/overview` | Operational REST API endpoint |
| `reportingProductivityRoutes.js:43` | `POST` | `/custom-reports` | Operational REST API endpoint |
| `reportingProductivityRoutes.js:44` | `GET` | `/custom-reports` | Operational REST API endpoint |
| `reportingProductivityRoutes.js:45` | `GET` | `/custom-reports/:customReportId` | Operational REST API endpoint |
| `reportingProductivityRoutes.js:46` | `PATCH` | `/custom-reports/:customReportId` | Operational REST API endpoint |
| `reportingProductivityRoutes.js:47` | `DELETE` | `/custom-reports/:customReportId` | Operational REST API endpoint |
| `reportingProductivityRoutes.js:48` | `POST` | `/custom-reports/:customReportId/clone` | Operational REST API endpoint |
| `reportingProductivityRoutes.js:49` | `POST` | `/custom-reports/:customReportId/sign-off` | Operational REST API endpoint |
| `reportingProductivityRoutes.js:50` | `GET` | `/custom-reports/:customReportId/export-manifest` | Standardized OOXML XLSX / PDF export |
| `reportingProductivityRoutes.js:53` | `POST` | `/report-packs` | Operational REST API endpoint |
| `reportingProductivityRoutes.js:54` | `GET` | `/report-packs` | Operational REST API endpoint |
| `reportingProductivityRoutes.js:55` | `GET` | `/report-packs/:reportPackId` | Operational REST API endpoint |
| `reportingProductivityRoutes.js:56` | `PATCH` | `/report-packs/:reportPackId` | Operational REST API endpoint |
| `reportingProductivityRoutes.js:57` | `DELETE` | `/report-packs/:reportPackId` | Operational REST API endpoint |
| `reportingProductivityRoutes.js:58` | `GET` | `/report-packs/:reportPackId/preview` | Operational REST API endpoint |
| `reportingProductivityRoutes.js:59` | `POST` | `/report-packs/:reportPackId/export` | Standardized OOXML XLSX / PDF export |
| `reportingProductivityRoutes.js:62` | `POST` | `/favourites` | Operational REST API endpoint |
| `reportingProductivityRoutes.js:63` | `GET` | `/favourites` | Operational REST API endpoint |
| `reportingProductivityRoutes.js:64` | `DELETE` | `/favourites/:favouriteId` | Operational REST API endpoint |
| `reportingProductivityRoutes.js:67` | `POST` | `/validate-export-format` | Standardized OOXML XLSX / PDF export |
| `reportingProductivityRoutes.js:70` | `GET` | `/subscriptions/capability` | Operational REST API endpoint |
| `reportingProductivityRoutes.js:71` | `POST` | `/subscriptions` | Operational REST API endpoint |
| `analyticsRoutes.js:17` | `GET` | `/consolidated/benchmarks` | Operational REST API endpoint |
| `analyticsRoutes.js:20` | `GET` | `/summary` | Operational REST API endpoint |
| `analyticsRoutes.js:21` | `GET` | `/summary/:cafeId` | Operational REST API endpoint |
| `analyticsRoutes.js:24` | `GET` | `/menu-engineering` | Operational REST API endpoint |
| `analyticsRoutes.js:25` | `GET` | `/menu-engineering/:cafeId` | Operational REST API endpoint |
| `analyticsRoutes.js:28` | `GET` | `/hourly-heatmap` | Operational REST API endpoint |
| `analyticsRoutes.js:29` | `GET` | `/hourly-heatmap/:cafeId` | Operational REST API endpoint |
| `analyticsRoutes.js:32` | `GET` | `/food-cost` | Operational REST API endpoint |
| `analyticsRoutes.js:33` | `GET` | `/food-cost/:cafeId` | Operational REST API endpoint |
| `auditRoutes.js:18` | `GET` | `/` | Operational REST API endpoint |
| `auditRoutes.js:23` | `GET` | `/:auditEventId` | Operational REST API endpoint |

### 10.11 Executive Strategic Portfolio (15 Owner Modules)

| Source File | HTTP Method | Endpoint Route Path | Architectural Description |
| :--- | :--- | :--- | :--- |
| `foodSafetyGovernanceRoutes.js:48` | `GET` | `/overview` | Operational REST API endpoint |
| `foodSafetyGovernanceRoutes.js:55` | `GET` | `/licences` | Operational REST API endpoint |
| `foodSafetyGovernanceRoutes.js:61` | `POST` | `/licences` | Operational REST API endpoint |
| `foodSafetyGovernanceRoutes.js:67` | `PATCH` | `/licences/:registrationId/status` | Operational REST API endpoint |
| `foodSafetyGovernanceRoutes.js:74` | `GET` | `/hygiene/templates` | Operational REST API endpoint |
| `foodSafetyGovernanceRoutes.js:80` | `POST` | `/hygiene/templates` | Operational REST API endpoint |
| `foodSafetyGovernanceRoutes.js:86` | `GET` | `/hygiene/inspections` | Operational REST API endpoint |
| `foodSafetyGovernanceRoutes.js:92` | `POST` | `/hygiene/inspections` | Operational REST API endpoint |
| `foodSafetyGovernanceRoutes.js:98` | `PATCH` | `/hygiene/inspections/:inspectionId/actions/:actionId` | Operational REST API endpoint |
| `foodSafetyGovernanceRoutes.js:105` | `GET` | `/temperature/rules` | Operational REST API endpoint |
| `foodSafetyGovernanceRoutes.js:111` | `GET` | `/temperature/logs` | Operational REST API endpoint |
| `foodSafetyGovernanceRoutes.js:118` | `GET` | `/fostac/supervisors` | Operational REST API endpoint |
| `foodSafetyGovernanceRoutes.js:125` | `GET` | `/traceability/forward` | Operational REST API endpoint |
| `foodSafetyGovernanceRoutes.js:131` | `GET` | `/traceability/backward` | Operational REST API endpoint |
| `foodSafetyGovernanceRoutes.js:137` | `GET` | `/traceability/gaps` | Operational REST API endpoint |
| `foodSafetyGovernanceRoutes.js:143` | `POST` | `/traceability/gaps` | Operational REST API endpoint |
| `foodSafetyGovernanceRoutes.js:150` | `GET` | `/recalls` | Operational REST API endpoint |
| `foodSafetyGovernanceRoutes.js:156` | `POST` | `/recalls` | Operational REST API endpoint |
| `foodSafetyGovernanceRoutes.js:162` | `POST` | `/recalls/:recallId/transition` | Operational REST API endpoint |
| `foodSafetyGovernanceRoutes.js:168` | `PUT` | `/recalls/:recallId/foscos-filing` | Operational REST API endpoint |
| `foodSafetyGovernanceRoutes.js:174` | `POST` | `/recalls/:recallId/communications` | Operational REST API endpoint |
| `foodSafetyGovernanceRoutes.js:180` | `POST` | `/recalls/:recallId/affected-sales` | Operational REST API endpoint |
| `foodSafetyGovernanceRoutes.js:186` | `PUT` | `/recalls/:recallId/dispositions` | Operational REST API endpoint |
| `foodSafetyGovernanceRoutes.js:193` | `GET` | `/capas` | Operational REST API endpoint |
| `foodSafetyGovernanceRoutes.js:199` | `POST` | `/capas` | Operational REST API endpoint |
| `foodSafetyGovernanceRoutes.js:205` | `POST` | `/capas/:capaId/verify` | Operational REST API endpoint |
| `ownerRiskAuditRoutes.js:19` | `GET` | `/dashboard` | Operational REST API endpoint |
| `ownerRiskAuditRoutes.js:26` | `GET` | `/methodology` | Operational REST API endpoint |
| `ownerRiskAuditRoutes.js:31` | `PUT` | `/methodology` | Operational REST API endpoint |
| `ownerRiskAuditRoutes.js:38` | `GET` | `/risks` | Operational REST API endpoint |
| `ownerRiskAuditRoutes.js:43` | `POST` | `/risks` | Operational REST API endpoint |
| `ownerRiskAuditRoutes.js:48` | `POST` | `/risks/candidates` | Operational REST API endpoint |
| `ownerRiskAuditRoutes.js:53` | `POST` | `/risks/:riskId/confirm` | Operational REST API endpoint |
| `ownerRiskAuditRoutes.js:58` | `PATCH` | `/risks/:riskId` | Operational REST API endpoint |
| `ownerRiskAuditRoutes.js:65` | `GET` | `/controls` | Operational REST API endpoint |
| `ownerRiskAuditRoutes.js:70` | `POST` | `/controls` | Operational REST API endpoint |
| `ownerRiskAuditRoutes.js:75` | `POST` | `/controls/:controlId/assess` | Operational REST API endpoint |
| `ownerRiskAuditRoutes.js:80` | `PATCH` | `/controls/:controlId/assess` | Operational REST API endpoint |
| `ownerRiskAuditRoutes.js:85` | `PATCH` | `/controls/:controlId/assessment` | Operational REST API endpoint |
| `ownerRiskAuditRoutes.js:92` | `POST` | `/audits/plan` | Operational REST API endpoint |
| `ownerRiskAuditRoutes.js:97` | `POST` | `/audits/:auditId/procedures/:procedureId/execute` | Operational REST API endpoint |
| `ownerRiskAuditRoutes.js:104` | `GET` | `/observations` | Operational REST API endpoint |
| `ownerRiskAuditRoutes.js:109` | `POST` | `/observations` | Operational REST API endpoint |
| `ownerRiskAuditRoutes.js:114` | `POST` | `/observations/:findingId/transition` | Operational REST API endpoint |
| `ownerRiskAuditRoutes.js:121` | `GET` | `/anomalies/rules` | Operational REST API endpoint |
| `ownerRiskAuditRoutes.js:126` | `GET` | `/anomalies` | Operational REST API endpoint |
| `ownerRiskAuditRoutes.js:131` | `POST` | `/anomalies` | Operational REST API endpoint |
| `ownerRiskAuditRoutes.js:136` | `POST` | `/anomalies/:caseId/review` | Operational REST API endpoint |
| `ownerPlanningRoutes.js:19` | `GET` | `/overview` | Operational REST API endpoint |
| `ownerPlanningRoutes.js:24` | `GET` | `/dashboard` | Operational REST API endpoint |
| `ownerPlanningRoutes.js:31` | `GET` | `/export` | Standardized OOXML XLSX / PDF export |
| `ownerPlanningRoutes.js:38` | `GET` | `/budgets` | Operational REST API endpoint |
| `ownerPlanningRoutes.js:43` | `POST` | `/budgets` | Operational REST API endpoint |
| `ownerPlanningRoutes.js:48` | `PUT` | `/budgets/:budgetId` | Operational REST API endpoint |
| `ownerPlanningRoutes.js:53` | `POST` | `/budgets/:budgetId/approve` | Authoritative approval transition |
| `ownerPlanningRoutes.js:58` | `PATCH` | `/budgets/:budgetId/approve` | Authoritative approval transition |
| `ownerPlanningRoutes.js:63` | `GET` | `/budgets/compare-actual` | Operational REST API endpoint |
| `ownerPlanningRoutes.js:68` | `GET` | `/variance` | Operational REST API endpoint |
| `ownerPlanningRoutes.js:75` | `GET` | `/forecasts` | Operational REST API endpoint |
| `ownerPlanningRoutes.js:80` | `POST` | `/forecasts/generate` | Operational REST API endpoint |
| `ownerPlanningRoutes.js:85` | `GET` | `/forecasts/:forecastId` | Operational REST API endpoint |
| `ownerPlanningRoutes.js:92` | `GET` | `/scenarios` | Operational REST API endpoint |
| `ownerPlanningRoutes.js:97` | `POST` | `/scenarios` | Operational REST API endpoint |
| `ownerPlanningRoutes.js:102` | `POST` | `/scenarios/run` | Operational REST API endpoint |
| `ownerPlanningRoutes.js:109` | `GET` | `/capex` | Operational REST API endpoint |
| `ownerPlanningRoutes.js:114` | `POST` | `/capex` | Operational REST API endpoint |
| `ownerPlanningRoutes.js:119` | `POST` | `/capex/:requestId/business-case` | Operational REST API endpoint |
| `ownerPlanningRoutes.js:124` | `POST` | `/capex/:requestId/review` | Operational REST API endpoint |
| `ownerPlanningRoutes.js:129` | `POST` | `/capex/:requestId/approve` | Authoritative approval transition |
| `ownerPlanningRoutes.js:134` | `PATCH` | `/capex/:requestId/approve` | Authoritative approval transition |
| `ownerPlanningRoutes.js:139` | `POST` | `/capex/:requestId/status` | Operational REST API endpoint |
| `ownerPlanningRoutes.js:144` | `PATCH` | `/capex/:requestId/status` | Operational REST API endpoint |
| `ownerPlanningRoutes.js:151` | `GET` | `/feasibility` | Operational REST API endpoint |
| `ownerPlanningRoutes.js:156` | `POST` | `/feasibility` | Operational REST API endpoint |
| `ownerPlanningRoutes.js:161` | `POST` | `/feasibility/:feasibilityId/actuals` | Operational REST API endpoint |
| `ownerPlanningRoutes.js:166` | `PATCH` | `/feasibility/:feasibilityId/actuals` | Operational REST API endpoint |
| `ownerComplianceRoutes.js:12` | `GET` | `/dashboard` | Operational REST API endpoint |
| `ownerComplianceRoutes.js:17` | `GET` | `/overview` | Operational REST API endpoint |
| `ownerComplianceRoutes.js:24` | `GET` | `/obligations` | Operational REST API endpoint |
| `ownerComplianceRoutes.js:29` | `POST` | `/obligations` | Operational REST API endpoint |
| `ownerComplianceRoutes.js:34` | `PATCH` | `/obligations/:obligationId/status` | Operational REST API endpoint |
| `ownerComplianceRoutes.js:41` | `GET` | `/licences` | Operational REST API endpoint |
| `ownerComplianceRoutes.js:46` | `POST` | `/licences` | Operational REST API endpoint |
| `ownerComplianceRoutes.js:51` | `PATCH` | `/licences/:licenceId/review` | Operational REST API endpoint |
| `ownerComplianceRoutes.js:58` | `POST` | `/contracts` | Operational REST API endpoint |
| `ownerComplianceRoutes.js:63` | `PATCH` | `/contracts/:contractId/status` | Operational REST API endpoint |
| `ownerComplianceRoutes.js:68` | `POST` | `/contracts/:contractId/amend` | Operational REST API endpoint |
| `ownerComplianceRoutes.js:73` | `POST` | `/contracts/:contractId/obligations` | Operational REST API endpoint |
| `ownerComplianceRoutes.js:78` | `PATCH` | `/contracts/:contractId/obligations/:obligationId` | Operational REST API endpoint |
| `ownerComplianceRoutes.js:85` | `GET` | `/insurance/policies` | Operational REST API endpoint |
| `ownerComplianceRoutes.js:90` | `POST` | `/insurance/policies` | Operational REST API endpoint |
| `ownerComplianceRoutes.js:95` | `POST` | `/insurance/claims` | Operational REST API endpoint |
| `ownerComplianceRoutes.js:100` | `PATCH` | `/insurance/claims/:claimId/status` | Operational REST API endpoint |
| `ownerSupplierIntelligenceRoutes.js:12` | `GET` | `/analytics` | Operational REST API endpoint |
| `ownerSupplierIntelligenceRoutes.js:18` | `GET` | `/dependency-risk` | Operational REST API endpoint |
| `ownerSupplierIntelligenceRoutes.js:25` | `GET` | `/suppliers/:vendorId/360` | Operational REST API endpoint |
| `ownerSupplierIntelligenceRoutes.js:32` | `PUT` | `/scorecard-config` | Operational REST API endpoint |
| `ownerSupplierIntelligenceRoutes.js:39` | `POST` | `/action-plans` | Operational REST API endpoint |
| `ownerSupplierIntelligenceRoutes.js:45` | `PATCH` | `/action-plans/:actionId/status` | Operational REST API endpoint |
| `ownerAcademyRoutes.js:12` | `GET` | `/overview` | Operational REST API endpoint |
| `ownerAcademyRoutes.js:19` | `GET` | `/sops` | Operational REST API endpoint |
| `ownerAcademyRoutes.js:25` | `POST` | `/sops` | Operational REST API endpoint |
| `ownerAcademyRoutes.js:31` | `PATCH` | `/sops/:sopId/status` | Operational REST API endpoint |
| `ownerAcademyRoutes.js:37` | `POST` | `/sops/:sopId/amend` | Operational REST API endpoint |
| `ownerAcademyRoutes.js:44` | `POST` | `/sops/:sopId/assign-acknowledgements` | Operational REST API endpoint |
| `ownerAcademyRoutes.js:50` | `POST` | `/sops/:sopId/acknowledge` | Operational REST API endpoint |
| `ownerAcademyRoutes.js:57` | `GET` | `/courses` | Operational REST API endpoint |
| `ownerAcademyRoutes.js:63` | `POST` | `/courses` | Operational REST API endpoint |
| `ownerAcademyRoutes.js:69` | `POST` | `/competency/:userId/:competencyId/attendance` | Workforce time & attendance tracking |
| `ownerAcademyRoutes.js:75` | `POST` | `/competency/:userId/:competencyId/assessment` | Operational REST API endpoint |
| `ownerAssetReliabilityRoutes.js:19` | `GET` | `/dashboard` | Operational REST API endpoint |
| `ownerAssetReliabilityRoutes.js:26` | `POST` | `/breakdowns` | Operational REST API endpoint |
| `ownerAssetReliabilityRoutes.js:31` | `PATCH` | `/breakdowns/:breakdownId/status` | Operational REST API endpoint |
| `ownerAssetReliabilityRoutes.js:38` | `POST` | `/work-orders` | Operational REST API endpoint |
| `ownerAssetReliabilityRoutes.js:43` | `PATCH` | `/work-orders/:workOrderId/status` | Operational REST API endpoint |
| `ownerAssetReliabilityRoutes.js:50` | `POST` | `/calibrations` | Operational REST API endpoint |
| `ownerAssetReliabilityRoutes.js:57` | `GET` | `/assets/:assetId/metrics` | Operational REST API endpoint |
| `ownerAssetReliabilityRoutes.js:62` | `GET` | `/assets/:assetId/replacement-indicators` | Operational REST API endpoint |
| `ownerAssetReliabilityRoutes.js:69` | `POST` | `/assets/:assetId/replacement-capex` | Operational REST API endpoint |
| `ownerPrivacyCyberRoutes.js:19` | `GET` | `/dashboard` | Operational REST API endpoint |
| `ownerPrivacyCyberRoutes.js:24` | `GET` | `/dpdp-schedule` | Operational REST API endpoint |
| `ownerPrivacyCyberRoutes.js:31` | `POST` | `/processing-registers` | Operational REST API endpoint |
| `ownerPrivacyCyberRoutes.js:36` | `GET` | `/processing-registers` | Operational REST API endpoint |
| `ownerPrivacyCyberRoutes.js:43` | `POST` | `/requests` | Operational REST API endpoint |
| `ownerPrivacyCyberRoutes.js:48` | `GET` | `/requests/my` | Operational REST API endpoint |
| `ownerPrivacyCyberRoutes.js:53` | `GET` | `/requests/:requestId/discover-data` | Operational REST API endpoint |
| `ownerPrivacyCyberRoutes.js:58` | `POST` | `/requests/evaluate-erasure` | Operational REST API endpoint |
| `ownerPrivacyCyberRoutes.js:63` | `PATCH` | `/requests/:requestId/action` | Operational REST API endpoint |
| `ownerPrivacyCyberRoutes.js:70` | `POST` | `/processors` | Operational REST API endpoint |
| `ownerPrivacyCyberRoutes.js:75` | `GET` | `/processors` | Operational REST API endpoint |
| `ownerPrivacyCyberRoutes.js:82` | `POST` | `/incidents` | Operational REST API endpoint |
| `ownerPrivacyCyberRoutes.js:87` | `PATCH` | `/incidents/:incidentId/status` | Operational REST API endpoint |
| `ownerPrivacyCyberRoutes.js:94` | `POST` | `/security-controls` | Operational REST API endpoint |
| `ownerPrivacyCyberRoutes.js:99` | `GET` | `/security-controls` | Operational REST API endpoint |
| `ownerBcdrRoutes.js:19` | `GET` | `/dashboard` | Operational REST API endpoint |
| `ownerBcdrRoutes.js:24` | `GET` | `/backup-status` | Operational REST API endpoint |
| `ownerBcdrRoutes.js:31` | `POST` | `/processes` | Operational REST API endpoint |
| `ownerBcdrRoutes.js:36` | `GET` | `/processes` | Operational REST API endpoint |
| `ownerBcdrRoutes.js:43` | `POST` | `/drills` | Operational REST API endpoint |
| `ownerBcdrRoutes.js:48` | `PATCH` | `/drills/:drillId/status` | Operational REST API endpoint |
| `ownerBcdrRoutes.js:55` | `POST` | `/validate-sale-sync` | Operational REST API endpoint |
| `ownerBcdrRoutes.js:62` | `GET` | `/cafes/:cafeId/continuity-plan` | Operational REST API endpoint |
| `ownerMasterDataRoutes.js:19` | `GET` | `/dashboard` | Operational REST API endpoint |
| `ownerMasterDataRoutes.js:24` | `GET` | `/domains` | Operational REST API endpoint |
| `ownerMasterDataRoutes.js:31` | `POST` | `/duplicates` | Operational REST API endpoint |
| `ownerMasterDataRoutes.js:36` | `PATCH` | `/duplicates/:candidateId/status` | Operational REST API endpoint |
| `ownerMasterDataRoutes.js:43` | `POST` | `/change-requests` | Operational REST API endpoint |
| `ownerMasterDataRoutes.js:48` | `PATCH` | `/change-requests/:requestId/review` | Operational REST API endpoint |
| `ownerMasterDataRoutes.js:55` | `POST` | `/domains/:domainCode/records/:recordId/deactivate` | Operational REST API endpoint |
| `ownerComplaintsRoutes.js:18` | `GET` | `/dashboard` | Operational REST API endpoint |
| `ownerComplaintsRoutes.js:24` | `GET` | `/` | Operational REST API endpoint |
| `ownerComplaintsRoutes.js:30` | `GET` | `/:complaintId` | Operational REST API endpoint |
| `ownerComplaintsRoutes.js:37` | `POST` | `/` | Operational REST API endpoint |
| `ownerComplaintsRoutes.js:44` | `PATCH` | `/:complaintId/status` | Operational REST API endpoint |
| `ownerComplaintsRoutes.js:51` | `POST` | `/:complaintId/refund` | Operational REST API endpoint |
| `ownerComplaintsRoutes.js:58` | `POST` | `/:complaintId/communications` | Operational REST API endpoint |
| `ownerComplaintsRoutes.js:65` | `POST` | `/:complaintId/evidence` | Operational REST API endpoint |
| `ownerMenuPricingRoutes.js:18` | `GET` | `/matrix` | Operational REST API endpoint |
| `ownerMenuPricingRoutes.js:24` | `GET` | `/economics/:menuItemId` | Operational REST API endpoint |
| `ownerMenuPricingRoutes.js:31` | `POST` | `/simulate` | Operational REST API endpoint |
| `ownerMenuPricingRoutes.js:38` | `POST` | `/proposals` | Operational REST API endpoint |
| `ownerMenuPricingRoutes.js:44` | `PATCH` | `/proposals/:proposalId/status` | Operational REST API endpoint |
| `ownerMenuPricingRoutes.js:51` | `GET` | `/labelling/applicability` | Operational REST API endpoint |
| `ownerMenuPricingRoutes.js:57` | `GET` | `/labelling/items/:menuItemId` | Operational REST API endpoint |
| `ownerMenuPricingRoutes.js:64` | `GET` | `/promotions/analysis` | Operational REST API endpoint |
| `ownerCustomerLoyaltyRoutes.js:18` | `GET` | `/analytics` | Operational REST API endpoint |
| `ownerCustomerLoyaltyRoutes.js:24` | `GET` | `/cohorts` | Operational REST API endpoint |
| `ownerCustomerLoyaltyRoutes.js:31` | `POST` | `/loyalty/accrue` | Operational REST API endpoint |
| `ownerCustomerLoyaltyRoutes.js:37` | `POST` | `/loyalty/redeem` | Operational REST API endpoint |
| `ownerCustomerLoyaltyRoutes.js:43` | `GET` | `/loyalty/exposure` | Operational REST API endpoint |
| `ownerCustomerLoyaltyRoutes.js:49` | `GET` | `/loyalty/liability` | Operational REST API endpoint |
| `ownerCustomerLoyaltyRoutes.js:56` | `GET` | `/purpose-separation/:customerId` | Operational REST API endpoint |
| `ownerCustomerLoyaltyRoutes.js:63` | `POST` | `/export` | Standardized OOXML XLSX / PDF export |
| `ownerUtilitiesWasteRoutes.js:18` | `GET` | `/dashboard` | Operational REST API endpoint |
| `ownerUtilitiesWasteRoutes.js:25` | `POST` | `/meters` | Operational REST API endpoint |
| `ownerUtilitiesWasteRoutes.js:31` | `POST` | `/readings` | Operational REST API endpoint |
| `ownerUtilitiesWasteRoutes.js:38` | `POST` | `/waste` | Operational REST API endpoint |
| `ownerUtilitiesWasteRoutes.js:45` | `POST` | `/used-cooking-oil` | Operational REST API endpoint |
| `ownerUtilitiesWasteRoutes.js:52` | `GET` | `/swm-2026/:cafeId` | Operational REST API endpoint |
| `ownerGovernanceDelegationRoutes.js:18` | `GET` | `/dashboard` | Operational REST API endpoint |
| `ownerGovernanceDelegationRoutes.js:24` | `GET` | `/legal-structure` | Operational REST API endpoint |
| `ownerGovernanceDelegationRoutes.js:31` | `POST` | `/meetings` | Operational REST API endpoint |
| `ownerGovernanceDelegationRoutes.js:37` | `POST` | `/meetings/:meetingId/minutes/finalise` | Operational REST API endpoint |
| `ownerGovernanceDelegationRoutes.js:44` | `POST` | `/resolutions` | Operational REST API endpoint |
| `ownerGovernanceDelegationRoutes.js:50` | `PATCH` | `/resolutions/:resolutionId/status` | Operational REST API endpoint |
| `ownerGovernanceDelegationRoutes.js:57` | `POST` | `/decisions` | Operational REST API endpoint |
| `ownerGovernanceDelegationRoutes.js:64` | `POST` | `/delegations` | Operational REST API endpoint |
| `ownerGovernanceDelegationRoutes.js:70` | `POST` | `/delegations/:delegationId/revoke` | Operational REST API endpoint |
| `ownerGovernanceDelegationRoutes.js:76` | `POST` | `/delegations/check-authority` | Operational REST API endpoint |
| `ownerGovernanceDelegationRoutes.js:83` | `POST` | `/signatories` | Operational REST API endpoint |
| `ownerGovernanceDelegationRoutes.js:90` | `POST` | `/conflicts` | Operational REST API endpoint |
| `ownerGovernanceDelegationRoutes.js:96` | `GET` | `/conflicts/check` | Operational REST API endpoint |

### 10.12 Document Management & System Administration

| Source File | HTTP Method | Endpoint Route Path | Architectural Description |
| :--- | :--- | :--- | :--- |
| `fileRoutes.js:18` | `GET` | `/:fileId` | Operational REST API endpoint |
| `fileRoutes.js:19` | `POST` | `/register` | Operational REST API endpoint |
| `documentRoutes.js:47` | `GET` | `/` | Operational REST API endpoint |
| `documentRoutes.js:118` | `GET` | `/hub` | Operational REST API endpoint |
| `documentRoutes.js:190` | `POST` | `/upload-intent` | Operational REST API endpoint |
| `documentRoutes.js:209` | `POST` | `/finalize` | Operational REST API endpoint |
| `documentRoutes.js:231` | `POST` | `/attach` | Operational REST API endpoint |
| `documentRoutes.js:266` | `GET` | `/:documentId/download-grant` | Operational REST API endpoint |
| `documentRoutes.js:285` | `POST` | `/upload-stream` | Operational REST API endpoint |
| `documentRoutes.js:328` | `GET` | `/:documentId/download` | Operational REST API endpoint |
| `documentRoutes.js:390` | `GET` | `/:documentId/preview` | Operational REST API endpoint |
| `documentRoutes.js:450` | `GET` | `/:documentId` | Operational REST API endpoint |
| `documentRoutes.js:477` | `POST` | `/:documentId/replace-version` | Operational REST API endpoint |
| `documentRoutes.js:513` | `POST` | `/:documentId/verify` | Operational REST API endpoint |
| `documentRoutes.js:535` | `DELETE` | `/:documentId` | Operational REST API endpoint |
| `documentRoutes.js:555` | `DELETE` | `/:documentId/permanent` | Operational REST API endpoint |
| `documentRoutes.js:576` | `POST` | `/:documentId/retention-policy` | Operational REST API endpoint |
| `documentRoutes.js:600` | `GET` | `/:documentId/versions/:versionNumber/download` | Operational REST API endpoint |
| `documentRoutes.js:646` | `POST` | `/:documentId/restore` | Operational REST API endpoint |
| `documentRoutes.js:683` | `POST` | `/:documentId/restore-version/:versionNumber` | Operational REST API endpoint |
| `documentRoutes.js:705` | `POST` | `/reconcile` | Operational REST API endpoint |
| `documentRoutes.js:721` | `GET` | `/runtime-status` | Operational REST API endpoint |
| `documentRoutes.js:734` | `POST` | `/:documentId/rescan` | Operational REST API endpoint |
| `trashRoutes.js:36` | `GET` | `/` | Operational REST API endpoint |
| `trashRoutes.js:37` | `GET` | `/stats` | Operational REST API endpoint |
| `trashRoutes.js:38` | `GET` | `/policies` | Operational REST API endpoint |
| `trashRoutes.js:39` | `GET` | `/certificates` | Operational REST API endpoint |
| `trashRoutes.js:40` | `GET` | `/certificates/:certificateId/pdf` | Operational REST API endpoint |
| `trashRoutes.js:41` | `POST` | `/emergency-pause` | Operational REST API endpoint |
| `trashRoutes.js:44` | `GET` | `/:trashId` | Operational REST API endpoint |
| `trashRoutes.js:45` | `GET` | `/:trashId/preview-restore` | Operational REST API endpoint |
| `trashRoutes.js:46` | `POST` | `/restore` | Operational REST API endpoint |
| `trashRoutes.js:47` | `POST` | `/bulk-restore` | Operational REST API endpoint |
| `trashRoutes.js:50` | `POST` | `/:trashId/holds` | Operational REST API endpoint |
| `trashRoutes.js:51` | `DELETE` | `/:trashId/holds/:holdId` | Operational REST API endpoint |
| `trashRoutes.js:54` | `POST` | `/:trashId/disposition-request` | Operational REST API endpoint |
| `trashRoutes.js:55` | `POST` | `/:trashId/approve-disposition` | Authoritative approval transition |
| `trashRoutes.js:56` | `POST` | `/:trashId/purge` | Operational REST API endpoint |
| `searchRoutes.js:16` | `GET` | `/` | Operational REST API endpoint |
| `customFieldRoutes.js:24` | `GET` | `/` | Operational REST API endpoint |
| `customFieldRoutes.js:30` | `GET` | `/:key` | Operational REST API endpoint |
| `customFieldRoutes.js:37` | `POST` | `/` | Operational REST API endpoint |
| `customFieldRoutes.js:43` | `PATCH` | `/:key` | Operational REST API endpoint |
| `customFieldRoutes.js:49` | `DELETE` | `/:key` | Operational REST API endpoint |
| `settingsRoutes.js:60` | `GET` | `/overview` | Operational REST API endpoint |
| `settingsRoutes.js:63` | `GET` | `/profile` | Operational REST API endpoint |
| `settingsRoutes.js:64` | `PATCH` | `/profile` | Operational REST API endpoint |
| `settingsRoutes.js:65` | `POST` | `/profile/change-request` | Operational REST API endpoint |
| `settingsRoutes.js:66` | `GET` | `/profile/change-requests` | Operational REST API endpoint |
| `settingsRoutes.js:69` | `GET` | `/access` | Operational REST API endpoint |
| `settingsRoutes.js:70` | `POST` | `/access/request` | Operational REST API endpoint |
| `settingsRoutes.js:71` | `GET` | `/access/requests` | Operational REST API endpoint |
| `settingsRoutes.js:74` | `GET` | `/preferences` | Operational REST API endpoint |
| `settingsRoutes.js:75` | `PATCH` | `/preferences/appearance` | Operational REST API endpoint |
| `settingsRoutes.js:76` | `PATCH` | `/preferences/language` | Operational REST API endpoint |
| `settingsRoutes.js:77` | `PATCH` | `/preferences/accessibility` | Operational REST API endpoint |
| `settingsRoutes.js:78` | `PATCH` | `/preferences/workspace` | Operational REST API endpoint |
| `settingsRoutes.js:79` | `PATCH` | `/preferences/notifications` | Operational REST API endpoint |
| `settingsRoutes.js:80` | `POST` | `/preferences/reset` | Operational REST API endpoint |
| `settingsRoutes.js:83` | `GET` | `/languages` | Operational REST API endpoint |
| `settingsRoutes.js:86` | `GET` | `/security` | Operational REST API endpoint |
| `settingsRoutes.js:87` | `PATCH` | `/security` | Operational REST API endpoint |
| `settingsRoutes.js:88` | `PUT` | `/security` | Operational REST API endpoint |
| `settingsRoutes.js:91` | `GET` | `/sessions` | Operational REST API endpoint |
| `settingsRoutes.js:92` | `DELETE` | `/sessions/:sessionId` | Operational REST API endpoint |
| `settingsRoutes.js:93` | `POST` | `/sessions/revoke-others` | Operational REST API endpoint |
| `settingsRoutes.js:94` | `POST` | `/sessions/revoke-all` | Operational REST API endpoint |
| `settingsRoutes.js:97` | `GET` | `/delegations` | Operational REST API endpoint |
| `settingsRoutes.js:98` | `POST` | `/delegations` | Operational REST API endpoint |
| `settingsRoutes.js:99` | `DELETE` | `/delegations/:delegationId` | Operational REST API endpoint |
| `settingsRoutes.js:102` | `POST` | `/privacy/requests` | Operational REST API endpoint |
| `settingsRoutes.js:103` | `GET` | `/privacy/requests` | Operational REST API endpoint |
| `settingsRoutes.js:104` | `GET` | `/privacy/notice` | Operational REST API endpoint |
| `settingsRoutes.js:107` | `GET` | `/diagnostics` | Operational REST API endpoint |
| `settingsRoutes.js:108` | `POST` | `/support/tickets` | Operational REST API endpoint |
| `settingsRoutes.js:109` | `GET` | `/support/tickets` | Operational REST API endpoint |
| `settingsRoutes.js:110` | `POST` | `/support/tickets/:caseId/reply` | Operational REST API endpoint |
| `settingsRoutes.js:113` | `GET` | `/support/manage/tickets` | Operational REST API endpoint |
| `settingsRoutes.js:114` | `GET` | `/support/manage/tickets/:caseId` | Operational REST API endpoint |
| `settingsRoutes.js:115` | `PATCH` | `/support/manage/tickets/:caseId` | Operational REST API endpoint |
| `settingsRoutes.js:116` | `POST` | `/support/manage/tickets/:caseId/reply` | Operational REST API endpoint |
| `settingsRoutes.js:126` | `GET` | `/company-identity` | Operational REST API endpoint |
| `settingsRoutes.js:127` | `POST` | `/company-identity/unlock` | Operational REST API endpoint |
| `settingsRoutes.js:128` | `PUT` | `/company-identity` | Operational REST API endpoint |
| `settingsRoutes.js:129` | `GET` | `/company-identity/history` | Operational REST API endpoint |
| `settingsRoutes.js:137` | `GET` | `/my-profile` | Operational REST API endpoint |
| `systemRoutes.js:33` | `GET` | `/overview` | Operational REST API endpoint |
| `systemRoutes.js:83` | `GET` | `/alerts` | Operational REST API endpoint |
| `systemRoutes.js:98` | `POST` | `/alerts/:alertId/ack` | Operational REST API endpoint |
| `systemRoutes.js:114` | `POST` | `/alerts/:alertId/resolve` | Operational REST API endpoint |
| `systemRoutes.js:131` | `GET` | `/storage` | Operational REST API endpoint |
| `systemRoutes.js:143` | `POST` | `/reconcile-documents` | Operational REST API endpoint |
| `systemRoutes.js:158` | `GET` | `/feature-flags` | Operational REST API endpoint |
| `systemRoutes.js:165` | `POST` | `/feature-flags` | Operational REST API endpoint |
| `systemRoutes.js:178` | `GET` | `/maintenance` | Operational REST API endpoint |
| `systemRoutes.js:185` | `POST` | `/maintenance` | Operational REST API endpoint |
| `systemRoutes.js:199` | `GET` | `/backup` | Operational REST API endpoint |
| `systemRoutes.js:211` | `POST` | `/backup/drill` | Operational REST API endpoint |
| `exportRoutes.js:18` | `GET` | `/history` | Operational REST API endpoint |
| `exportRoutes.js:64` | `POST` | `/generate` | Operational REST API endpoint |
| `exportRoutes.js:176` | `POST` | `/preview` | Operational REST API endpoint |
| `exportRoutes.js:245` | `POST` | `/record` | Operational REST API endpoint |
| `adminRoutes.js:26` | `GET` | `/overview` | Operational REST API endpoint |
| `adminRoutes.js:27` | `GET` | `/work-queue` | Operational REST API endpoint |
| `adminRoutes.js:30` | `GET` | `/requests` | Operational REST API endpoint |
| `adminRoutes.js:31` | `POST` | `/requests` | Operational REST API endpoint |
| `adminRoutes.js:32` | `PATCH` | `/requests/:requestId/decision` | Operational REST API endpoint |
| `adminRoutes.js:35` | `GET` | `/access-reviews` | Operational REST API endpoint |
| `adminRoutes.js:36` | `POST` | `/access-reviews` | Operational REST API endpoint |
| `adminRoutes.js:37` | `PATCH` | `/access-reviews/:reviewId/findings/:targetUserId` | Operational REST API endpoint |
| `adminRoutes.js:40` | `GET` | `/service-identities` | Operational REST API endpoint |
| `sharedInfrastructureRoutes.js:32` | `POST` | `/duplicate-detection/check` | Operational REST API endpoint |
| `sharedInfrastructureRoutes.js:56` | `GET` | `/expiry/scan` | Operational REST API endpoint |
| `sharedInfrastructureRoutes.js:73` | `GET` | `/expiry/items` | Operational REST API endpoint |
| `sharedInfrastructureRoutes.js:94` | `POST` | `/expiry/:itemId/renew` | Operational REST API endpoint |
| `sharedInfrastructureRoutes.js:121` | `GET` | `/approvals/inbox` | Operational REST API endpoint |
| `sharedInfrastructureRoutes.js:187` | `POST` | `/mandatory-reason/assert` | Operational REST API endpoint |
| `sharedInfrastructureRoutes.js:201` | `POST` | `/approvals/:approvalId/decide` | Operational REST API endpoint |
| `sharedInfrastructureRoutes.js:260` | `GET` | `/timeline/:recordType/:recordId` | Operational REST API endpoint |
| `sharedInfrastructureRoutes.js:278` | `GET` | `/procurement/po/:poId/chain` | Operational REST API endpoint |
| `expansionModulesRoutes.js:25` | `GET` | `/supplier-portal/orders` | Operational REST API endpoint |
| `expansionModulesRoutes.js:34` | `GET` | `/workflows` | Operational REST API endpoint |
| `expansionModulesRoutes.js:40` | `POST` | `/workflows` | Operational REST API endpoint |
| `expansionModulesRoutes.js:47` | `GET` | `/sustainability` | Operational REST API endpoint |
| `expansionModulesRoutes.js:53` | `POST` | `/sustainability` | Operational REST API endpoint |
| `mailOpsRoutes.js:55` | `GET` | `/status` | Operational REST API endpoint |
| `mailOpsRoutes.js:62` | `GET` | `/inbound` | Operational REST API endpoint |
| `mailOpsRoutes.js:68` | `GET` | `/inbound/:inboundId` | Operational REST API endpoint |
| `mailOpsRoutes.js:74` | `PATCH` | `/inbound/:inboundId/status` | Operational REST API endpoint |
| `mailOpsRoutes.js:80` | `POST` | `/inbound/:inboundId/assign` | Operational REST API endpoint |
| `mailOpsRoutes.js:86` | `POST` | `/inbound/:inboundId/notes` | Operational REST API endpoint |
| `mailOpsRoutes.js:93` | `GET` | `/inbound/:inboundId/360` | Operational REST API endpoint |
| `mailOpsRoutes.js:99` | `GET` | `/threads` | Operational REST API endpoint |
| `mailOpsRoutes.js:105` | `POST` | `/threads/:threadId/reply` | Operational REST API endpoint |
| `mailOpsRoutes.js:112` | `GET` | `/outbox` | Operational REST API endpoint |
| `mailOpsRoutes.js:118` | `POST` | `/outbox/:outboxId/retry` | Operational REST API endpoint |
| `mailOpsRoutes.js:124` | `POST` | `/outbox/:outboxId/cancel` | Operational REST API endpoint |
| `mailOpsRoutes.js:130` | `POST` | `/outbox/pause` | Operational REST API endpoint |
| `mailOpsRoutes.js:136` | `POST` | `/outbox/resume` | Operational REST API endpoint |
| `mailOpsRoutes.js:143` | `POST` | `/compose` | Operational REST API endpoint |
| `mailOpsRoutes.js:149` | `GET` | `/drafts` | Operational REST API endpoint |
| `mailOpsRoutes.js:155` | `POST` | `/drafts` | Operational REST API endpoint |
| `mailOpsRoutes.js:161` | `DELETE` | `/drafts/:draftId` | Operational REST API endpoint |
| `mailOpsRoutes.js:168` | `GET` | `/cases` | Operational REST API endpoint |
| `mailOpsRoutes.js:174` | `POST` | `/cases` | Operational REST API endpoint |
| `mailOpsRoutes.js:181` | `GET` | `/security-review` | Operational REST API endpoint |
| `mailOpsRoutes.js:187` | `POST` | `/inbound/:inboundId/quarantine` | Operational REST API endpoint |
| `mailOpsRoutes.js:193` | `POST` | `/inbound/:inboundId/release-quarantine` | Operational REST API endpoint |
| `mailOpsRoutes.js:200` | `GET` | `/templates` | Operational REST API endpoint |
| `mailOpsRoutes.js:206` | `POST` | `/templates` | Operational REST API endpoint |
| `mailOpsRoutes.js:213` | `GET` | `/automation-rules` | Operational REST API endpoint |
| `mailOpsRoutes.js:219` | `POST` | `/automation-rules` | Operational REST API endpoint |
| `mailOpsRoutes.js:225` | `POST` | `/automation-rules/:ruleId/dry-run` | Operational REST API endpoint |
| `mailOpsRoutes.js:232` | `GET` | `/sender-identities` | Operational REST API endpoint |
| `mailOpsRoutes.js:238` | `POST` | `/sender-identities` | Operational REST API endpoint |
| `mailOpsRoutes.js:245` | `GET` | `/integrity` | Operational REST API endpoint |
| `mailOpsRoutes.js:252` | `GET` | `/reports` | Operational REST API endpoint |
| `notificationRoutes.js:22` | `GET` | `/` | Operational REST API endpoint |
| `notificationRoutes.js:27` | `PATCH` | `/read-all` | Operational REST API endpoint |
| `notificationRoutes.js:32` | `GET` | `/:notificationId` | Operational REST API endpoint |
| `notificationRoutes.js:37` | `PATCH` | `/:notificationId/read` | Operational REST API endpoint |
| `notificationRoutes.js:42` | `PATCH` | `/:notificationId/acknowledge` | Operational REST API endpoint |
| `notificationRoutes.js:47` | `POST` | `/:notificationId/archive` | Operational REST API endpoint |
| `assetRoutes.js:41` | `GET` | `/overview` | Operational REST API endpoint |
| `assetRoutes.js:44` | `GET` | `/work-orders` | Operational REST API endpoint |
| `assetRoutes.js:45` | `POST` | `/work-orders` | Operational REST API endpoint |
| `assetRoutes.js:46` | `PATCH` | `/work-orders/:workOrderId` | Operational REST API endpoint |
| `assetRoutes.js:47` | `POST` | `/work-orders/:workOrderId/resolve` | Operational REST API endpoint |
| `assetRoutes.js:50` | `POST` | `/inspections` | Operational REST API endpoint |
| `assetRoutes.js:53` | `GET` | `/maintenance/backlog` | Operational REST API endpoint |
| `assetRoutes.js:54` | `GET` | `/maintenance/history` | Operational REST API endpoint |
| `assetRoutes.js:55` | `POST` | `/maintenance/evaluate-alerts` | Operational REST API endpoint |
| `assetRoutes.js:56` | `POST` | `/maintenance/complete` | Operational REST API endpoint |
| `assetRoutes.js:57` | `POST` | `/maintenance/reschedule` | Operational REST API endpoint |
| `assetRoutes.js:58` | `POST` | `/maintenance/jobs/:jobId/complete` | Operational REST API endpoint |
| `assetRoutes.js:59` | `POST` | `/maintenance/jobs/:jobId/reschedule` | Operational REST API endpoint |
| `assetRoutes.js:62` | `GET` | `/plans` | Operational REST API endpoint |
| `assetRoutes.js:63` | `POST` | `/plans` | Operational REST API endpoint |
| `assetRoutes.js:64` | `POST` | `/plans/:planId/cancel` | Operational REST API endpoint |
| `assetRoutes.js:67` | `GET` | `/` | Operational REST API endpoint |
| `assetRoutes.js:68` | `GET` | `/items` | Operational REST API endpoint |
| `assetRoutes.js:69` | `POST` | `/` | Operational REST API endpoint |
| `assetRoutes.js:70` | `GET` | `/:assetId` | Operational REST API endpoint |
| `assetRoutes.js:71` | `POST` | `/:assetId/commission` | Operational REST API endpoint |
| `assetRoutes.js:72` | `POST` | `/:assetId/transfer` | Operational REST API endpoint |
| `assetRoutes.js:73` | `POST` | `/:assetId/safety-hold` | Operational REST API endpoint |
| `assetRoutes.js:74` | `POST` | `/:assetId/retire` | Operational REST API endpoint |
| `assetRoutes.js:75` | `GET` | `/:assetId/maintenance` | Operational REST API endpoint |
| `assetRoutes.js:76` | `POST` | `/:assetId/maintenance` | Operational REST API endpoint |
| `departmentOrderRoutes.js:31` | `GET` | `/overview` | Operational REST API endpoint |
| `departmentOrderRoutes.js:38` | `GET` | `/schedule` | Operational REST API endpoint |
| `departmentOrderRoutes.js:45` | `GET` | `/quotes` | Operational REST API endpoint |
| `departmentOrderRoutes.js:51` | `POST` | `/quotes` | Operational REST API endpoint |
| `departmentOrderRoutes.js:58` | `GET` | `/accounts` | Operational REST API endpoint |
| `departmentOrderRoutes.js:65` | `GET` | `/integrity` | Operational REST API endpoint |
| `departmentOrderRoutes.js:72` | `GET` | `/` | Operational REST API endpoint |
| `departmentOrderRoutes.js:78` | `POST` | `/` | Operational REST API endpoint |
| `departmentOrderRoutes.js:85` | `GET` | `/:orderId` | Operational REST API endpoint |
| `departmentOrderRoutes.js:91` | `POST` | `/:orderId/revisions` | Operational REST API endpoint |
| `departmentOrderRoutes.js:97` | `POST` | `/:orderId/fulfil` | Operational REST API endpoint |
| `departmentOrderRoutes.js:103` | `POST` | `/:orderId/settle` | Operational REST API endpoint |
| `dashboardRoutes.js:42` | `GET` | `/cafe-ops` | Operational REST API endpoint |
| `dashboardRoutes.js:45` | `GET` | `/operational-exceptions` | Operational REST API endpoint |
| `dashboardRoutes.js:48` | `GET` | `/` | Operational REST API endpoint |
| `dashboardRoutes.js:49` | `GET` | `/metrics` | Operational REST API endpoint |
| `dashboardRoutes.js:52` | `GET` | `/saved-views` | Operational REST API endpoint |
| `dashboardRoutes.js:53` | `POST` | `/saved-views` | Operational REST API endpoint |
| `dashboardRoutes.js:54` | `PUT` | `/saved-views/:savedViewId` | Operational REST API endpoint |
| `dashboardRoutes.js:55` | `DELETE` | `/saved-views/:savedViewId` | Operational REST API endpoint |
| `dashboardRoutes.js:58` | `GET` | `/targets` | Operational REST API endpoint |
| `dashboardRoutes.js:59` | `POST` | `/targets` | Operational REST API endpoint |
| `customerRoutes.js:34` | `GET` | `/overview` | Operational REST API endpoint |
| `customerRoutes.js:35` | `GET` | `/rewards/catalogue` | Operational REST API endpoint |
| `customerRoutes.js:36` | `POST` | `/rewards` | Operational REST API endpoint |
| `customerRoutes.js:37` | `GET` | `/programme/current` | Operational REST API endpoint |
| `customerRoutes.js:38` | `POST` | `/programme/publish` | Operational REST API endpoint |
| `customerRoutes.js:39` | `GET` | `/integrity/status` | Operational REST API endpoint |
| `customerRoutes.js:40` | `GET` | `/audit/integrity` | Operational REST API endpoint |
| `customerRoutes.js:41` | `GET` | `/feedback` | Operational REST API endpoint |
| `customerRoutes.js:42` | `POST` | `/feedback` | Operational REST API endpoint |
| `customerRoutes.js:45` | `GET` | `/` | Operational REST API endpoint |
| `customerRoutes.js:46` | `POST` | `/` | Operational REST API endpoint |
| `customerRoutes.js:47` | `POST` | `/merge` | Operational REST API endpoint |
| `customerRoutes.js:48` | `GET` | `/:customerId` | Operational REST API endpoint |
| `customerRoutes.js:49` | `POST` | `/:customerId/loyalty/adjust` | Operational REST API endpoint |
| `customerRoutes.js:50` | `POST` | `/:customerId/points/adjust` | Operational REST API endpoint |
| `taskRoutes.js:29` | `GET` | `/` | Operational REST API endpoint |
| `taskRoutes.js:35` | `GET` | `/:taskId` | Operational REST API endpoint |
| `taskRoutes.js:41` | `POST` | `/` | Operational REST API endpoint |
| `taskRoutes.js:47` | `PATCH` | `/:taskId/status` | Operational REST API endpoint |
| `taskRoutes.js:53` | `POST` | `/:taskId/complete` | Operational REST API endpoint |
| `taskRoutes.js:59` | `POST` | `/:taskId/verify` | Operational REST API endpoint |
| `taskRoutes.js:65` | `POST` | `/:taskId/approve` | Authoritative approval transition |
| `taskRoutes.js:71` | `POST` | `/:taskId/return` | Operational REST API endpoint |
| `taskRoutes.js:77` | `POST` | `/:taskId/reject` | Operational REST API endpoint |
| `taskRoutes.js:83` | `POST` | `/:taskId/reopen` | Operational REST API endpoint |
| `taskRoutes.js:89` | `POST` | `/:taskId/cancel` | Operational REST API endpoint |
| `taskRoutes.js:95` | `POST` | `/:taskId/block` | Operational REST API endpoint |
| `taskRoutes.js:101` | `POST` | `/:taskId/assign` | Operational REST API endpoint |
| `taskRoutes.js:107` | `PATCH` | `/:taskId/assign` | Operational REST API endpoint |
| `approvalRoutes.js:20` | `GET` | `/` | Operational REST API endpoint |
| `approvalRoutes.js:26` | `POST` | `/:approvalId/decide` | Operational REST API endpoint |
| `qualityRoutes.js:48` | `GET` | `/overview` | Operational REST API endpoint |
| `qualityRoutes.js:54` | `GET` | `/integrity` | Operational REST API endpoint |
| `qualityRoutes.js:61` | `GET` | `/checklists` | Operational REST API endpoint |
| `qualityRoutes.js:67` | `POST` | `/checklists` | Operational REST API endpoint |
| `qualityRoutes.js:73` | `GET` | `/templates` | Operational REST API endpoint |
| `qualityRoutes.js:80` | `GET` | `/temperatures` | Operational REST API endpoint |
| `qualityRoutes.js:86` | `POST` | `/temperatures` | Operational REST API endpoint |
| `qualityRoutes.js:92` | `POST` | `/temperatures/:id/corrective-action` | Operational REST API endpoint |
| `qualityRoutes.js:99` | `GET` | `/cleaning-tasks` | Operational REST API endpoint |
| `qualityRoutes.js:105` | `POST` | `/cleaning-tasks` | Operational REST API endpoint |
| `qualityRoutes.js:111` | `POST` | `/cleaning-tasks/:id/complete` | Operational REST API endpoint |
| `qualityRoutes.js:118` | `GET` | `/pest-control` | Operational REST API endpoint |
| `qualityRoutes.js:124` | `POST` | `/pest-control` | Operational REST API endpoint |
| `qualityRoutes.js:131` | `GET` | `/calibrations` | Operational REST API endpoint |
| `qualityRoutes.js:137` | `POST` | `/calibrations` | Operational REST API endpoint |
| `qualityRoutes.js:144` | `GET` | `/holds` | Operational REST API endpoint |
| `qualityRoutes.js:150` | `POST` | `/holds` | Operational REST API endpoint |
| `qualityRoutes.js:156` | `POST` | `/holds/:id/release` | Operational REST API endpoint |
| `qualityRoutes.js:163` | `GET` | `/ncrs` | Operational REST API endpoint |
| `qualityRoutes.js:169` | `POST` | `/ncrs` | Operational REST API endpoint |
| `qualityRoutes.js:175` | `GET` | `/capas` | Operational REST API endpoint |
| `qualityRoutes.js:181` | `POST` | `/capas` | Operational REST API endpoint |
| `qualityRoutes.js:187` | `POST` | `/capas/:id/verify` | Operational REST API endpoint |
| `qualityRoutes.js:194` | `GET` | `/audits` | Operational REST API endpoint |
| `qualityRoutes.js:201` | `GET` | `/compliance` | Operational REST API endpoint |
| `qualityRoutes.js:207` | `GET` | `/traceability` | Operational REST API endpoint |
| `qualityRoutes.js:214` | `GET` | `/incidents` | Operational REST API endpoint |
| `qualityRoutes.js:220` | `POST` | `/incidents` | Operational REST API endpoint |
| `qualityRoutes.js:226` | `POST` | `/incidents/:incidentId/resolve` | Operational REST API endpoint |
| `kdsRoutes.js:32` | `GET` | `/metrics` | Operational REST API endpoint |
| `kdsRoutes.js:35` | `GET` | `/stations` | Operational REST API endpoint |
| `kdsRoutes.js:36` | `POST` | `/stations` | Operational REST API endpoint |
| `kdsRoutes.js:37` | `POST` | `/stations/routing` | Operational REST API endpoint |
| `kdsRoutes.js:40` | `GET` | `/tickets` | Operational REST API endpoint |
| `kdsRoutes.js:41` | `POST` | `/tickets` | Operational REST API endpoint |
| `kdsRoutes.js:44` | `GET` | `/tickets/:ticketId` | Operational REST API endpoint |
| `kdsRoutes.js:45` | `POST` | `/tickets/:ticketId/bump` | Operational REST API endpoint |
| `kdsRoutes.js:46` | `POST` | `/tickets/:ticketId/items/:itemIndex/bump` | Operational REST API endpoint |
| `kdsRoutes.js:49` | `POST` | `/void` | Operational REST API endpoint |

### 10.13 Router Root & Top-Level Server Endpoints

| Source File | HTTP Method | Endpoint Route Path | Architectural Description |
| :--- | :--- | :--- | :--- |
| `index.js:583` | `GET` | `/` | Operational REST API endpoint |
| `server.js:242` | `GET` | `/health/live` | Infrastructure liveness/readiness health probe |
| `server.js:243` | `GET` | `/api/health/live` | Infrastructure liveness/readiness health probe |
| `server.js:244` | `GET` | `/api/v1/health/live` | Infrastructure liveness/readiness health probe |
| `server.js:259` | `GET` | `/api/v1/health` | Infrastructure liveness/readiness health probe |
| `server.js:260` | `GET` | `/api/health` | Infrastructure liveness/readiness health probe |
| `server.js:261` | `GET` | `/health` | Infrastructure liveness/readiness health probe |
| `server.js:308` | `GET` | `/health/ready` | Infrastructure liveness/readiness health probe |
| `server.js:309` | `GET` | `/api/health/ready` | Infrastructure liveness/readiness health probe |
| `server.js:310` | `GET` | `/api/v1/health/ready` | Infrastructure liveness/readiness health probe |
| `server.js:311` | `GET` | `/api/v1/readiness` | Operational REST API endpoint |
| `server.js:312` | `GET` | `/api/readiness` | Operational REST API endpoint |
| `server.js:313` | `GET` | `/readiness` | Operational REST API endpoint |
| `server.js:362` | `GET` | `/health/staging` | Infrastructure liveness/readiness health probe |
| `server.js:363` | `GET` | `/api/health/staging` | Infrastructure liveness/readiness health probe |
| `server.js:364` | `GET` | `/api/v1/health/staging` | Infrastructure liveness/readiness health probe |
| `server.js:365` | `GET` | `/api/v1/staging/diagnostic` | Operational REST API endpoint |
| `server.js:366` | `GET` | `/api/staging/diagnostic` | Operational REST API endpoint |
| `server.js:367` | `GET` | `/staging/diagnostic` | Operational REST API endpoint |
| `server.js:377` | `GET` | `/cafe-access/qr/:token` | Operational REST API endpoint |
| `server.js:378` | `GET` | `/c/:token` | Operational REST API endpoint |

---

## 11. AUTOMATED TEST SUITE VERIFICATION SUMMARY

The entire automated test suite of **282 files** containing **5,071 test cases** executes to **100% PASS** with **0 failures** and **0 flakes**:

```json
{
  "TOTAL_TEST_FILES": 282,
  "FILES_PASSED": 282,
  "FILES_FAILED": 0,
  "TOTAL_TEST_CASES": 5071,
  "PASSED": 5071,
  "FAILED": 0,
  "SKIPPED": 0,
  "TODO": 0,
  "CANCELLED": 0,
  "NOT_EXECUTED": 0,
  "PRIMARY_REGRESSION_GATE": "529/529 PASS",
  "FLAKY_TESTS": 0
}
```

### Remediated Test Files Audit (ACP-04A / ACP-04B Baseline)

All 15 test files updated during failure remediation and test debt stabilization:
1. `backend/test/approvalScopePolicy.test.js` (1/1 PASS): Replaced brittle whitespace regex with deterministic AST policy verification.
2. `backend/test/attachmentConcurrencyLoad.test.js` (4/4 PASS): Assigned café scope to fixture `JOB-4` to satisfy tenant isolation.
3. `backend/test/authenticationPasskeyDisabled.test.js` (7/7 PASS): Explicitly isolated passkey environment variable in lifecycle hooks.
4. `backend/test/cafeOpsR02CorrectiveIntegrity.test.js` (8/8 PASS): Aligned test semantics with non-lossy `LATE_OFFLINE_SYNC` and HTTP 401 error envelope.
5. `backend/test/ext09GitHubReleaseGovernance.test.js` (38/38 PASS): Updated expected remote repository to canonical `zamorinestate/estate-erp`.
6. `backend/test/globalSearchPersonalLedger.test.js` (15/15 PASS): Added Mongoose model stubs for expanded search entities, resolving query buffer timeouts.
7. `backend/test/incidentManagement.test.js` (3/3 PASS): Aligned test fixture status enum with authoritative schema (`RESOLVED`).
8. `backend/test/login2PerformanceAndAuth.test.js` (6/6 PASS): Updated CSS asset verification to canonical `navy-gradient-standard` token.
9. `backend/test/passwordResetRequestApi.test.js` (3/3 PASS): Verified anti-enumeration security using stable `PASSWORD_RECOVERY_UNAVAILABLE` code.
10. `backend/test/pm01Integrations.test.js` (20/20 PASS): Provided complete in-memory model query stubs for global search and personal ledger.
11. `backend/test/procurementAccessPolicy.test.js` (2/2 PASS): Aligned PO approval role expectation strictly to `['MASTER']` only.
12. `backend/test/procurementMasterControl.test.js` (11/11 PASS): Added `InventoryLot.create` and `save` mocks to eliminate buffer timeouts.
13. `backend/test/recoveryNewCafeEndToEndAcceptance.test.js` (9/9 PASS): Aligned legacy `/c/` login URL expectation to canonical `/cafe/`.
14. `backend/test/routeSeedConsistency.test.js` (1/1 PASS): Redesigned test to audit dynamic routes against authoritative runtime RBAC matrix.
15. `backend/test/pm03ProcurementVendorOperations.test.js` (121/121 PASS): Added prototype fallbacks (`recalculateFulfillment`, `save`, `toObject`) to mock PO objects.

---

## 12. RELEASE GOVERNANCE, SAFETY BOUNDARIES & FINAL SIGN-OFF

### Current Regulatory & Deployment State

```
================================================================================
PRODUCTION DEPLOYMENT FREEZE:       ACTIVE
COMMERCIAL PRODUCTION RELEASE:      NO-GO
MAIN BRANCH MERGE:                  STRICTLY BLOCKED
RELEASE CANDIDATE TAGGING:          NOT AUTHORIZED
DATABASE MUTATIONS:                 STRICTLY PROHIBITED
EXTERNAL MASTER-MD SCOPE REVIEW:    PENDING
PHYSICAL PRINTER HARDWARE UAT:      PENDING
TECHNICAL SUITE INTEGRITY:          100% GREEN (5,071 / 5,071 PASS)
================================================================================
```

### Certification Notice
This Master Application Specification establishes the definitive technical truth of the Zamorin Cafe ERP application as of Git commit `59ebb1005c8ccfd2915751b2457705aee08266f7`.
Technical readiness has been completely demonstrated with zero failing tests and zero unclassified failures.
Final production release authorization remains gated upon completion of:
1. Formal Master-MD Scope Review by executive leadership.
2. Physical hardware thermal printer acceptance testing (UAT-PRN-01 to UAT-PRN-04).
3. Workload-based cluster sizing decision and execution for the production database.

---
*End of Zamorin Cafe ERP Master Application Specification.*
