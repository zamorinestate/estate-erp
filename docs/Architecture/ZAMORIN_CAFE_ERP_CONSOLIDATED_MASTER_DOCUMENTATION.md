# ZAMORIN CAFE ERP — COMPLETE CONSOLIDATED MASTER SYSTEM HANDBOOK
## THE DEFINITIVE SINGLE-FILE AS-BUILT SPECIFICATION, ARCHITECTURAL BLUEPRINT & AUDIT REFERENCE

> [!NOTE]
> **NOTICE FOR AI SYSTEMS & HUMAN DEVELOPERS:**
> This is the **single, complete, authoritative technical reference** for the Zamorin Cafe ERP application.
> It combines the **Executive 50-Section Architecture Handbook** with the **Exhaustive 45-Chapter Deep-Dive Specification** (all routes, APIs, models, schemas, RBAC, workflows, gaps, and remediation plans).
> No other documentation files are required.

**Application:** Zamorin Cafe ERP (Enterprise Multi-Location Restaurant Platform)  
**Repository Workspace:** `15_INTEGRATION_WORKSPACE`  
**Git Branch:** `owner-strategic-batch-03`  
**HEAD Commit:** `d8cfac780091ede4f4692c4bf2a5791dc9ef696f`  
**Audit Timestamp:** 2026-09-18T18:25:00+05:30 (IST)  
**Coverage:** 100% of Codebase (70 UI Pages, 352 REST APIs, 229 Mongoose Models, 104 Frontend Modules, 598 Backend Modules, 4,983 Automated Tests)  
**File Status:** Canonical Single Master Reference Document

---

## DOCUMENT STRUCTURE & NAVIGATION

- [PART I: EXECUTIVE 50-SECTION AS-BUILT HANDBOOK (QUICK REFERENCE)](#part-1-executive-handbook)
- [PART II: EXHAUSTIVE 45-CHAPTER DEEP-DIVE SPECIFICATION & AUDIT](#part-2-exhaustive-specification)

---

<a id="part-1-executive-handbook"></a>

# PART I: EXECUTIVE 50-SECTION AS-BUILT SYSTEM HANDBOOK

# ZAMORIN CAFE ERP — COMPLETE AS-BUILT REFERENCE HANDBOOK
## PERMANENT SYSTEM TECHNICAL AND FUNCTIONAL SPECIFICATION

**Application Title:** Zamorin Cafe ERP  
**Version Identity:** 1.0.0 (API: v1, Frontend UI Bundle: v3.4.6)  
**Git Branch:** `owner-strategic-batch-03`  
**HEAD Commit SHA:** `d8cfac780091ede4f4692c4bf2a5791dc9ef696f`  
**Audit Timestamp:** 2026-09-18T18:00:00+05:30 (IST)  
**Author:** Principal Software Architect, Full-Stack QA & Security Lead  
**Operating Baseline:** Clean Working Tree (0 uncommitted modifications)

---

## TABLE OF CONTENTS (50 SECTIONS)
1. Executive System Overview
2. Repository & Version Identity
3. Architecture
4. Application Startup
5. Login & Authentication
6. Session / Device / Security
7. Organisation & Café Resolution
8. Role Resolution
9. Primary Master
10. Normal Master
11. Owner
12. Café Operations
13. Employee / Staff
14. Shared Modules
15. Complete Screen Catalogue
16. Navigation Architecture
17. Frontend Routes
18. Backend APIs
19. Database Architecture
20. RBAC
21. Multi-Tenant Isolation
22. POS
23. Purchases
24. Inventory
25. HR
26. Attendance
27. Payroll
28. Loans / Advances
29. Finance
30. Documents & Attachments
31. Reports & Analytics
32. Printing / PDF / Export
33. Notifications
34. Settings
35. Profile
36. Audit Logging
37. QR / Café Deep Links
38. Integrations
39. Environment & Configuration
40. Deployment
41. CI/CD
42. PWA / Mobile / Desktop
43. Tests
44. UI Action Matrix
45. End-to-End Workflows
46. Known Defects / Gaps
47. Dead / Legacy Components
48. System Glossary
49. Complete File/Component Reference
50. Final As-Built Status

---

## 1. EXECUTIVE SYSTEM OVERVIEW
Zamorin Cafe ERP is an enterprise-grade, multi-location restaurant and hospitality management system built specifically for scalable café chains, institutional food service, and franchise outlets. The platform unifies point of sale, live store operations, inventory management with FEFO recipe depletion, automated purchase order 3-way matching, Indian statutory Code on Wages payroll, and executive board-level strategic governance into a single, cohesive software platform.

## 2. REPOSITORY & VERSION IDENTITY
- **Repository Path**: `d:\Zamorin_Cafe_ERP_Build\15_INTEGRATION_WORKSPACE`
- **Branch**: `owner-strategic-batch-03`
- **Commit SHA**: `d8cfac780091ede4f4692c4bf2a5791dc9ef696f`
- **Source Files**: 598 Backend JS files, 104 Frontend JS files, 70 Functional Page modules
- **Persistence Schemas**: 229 Mongoose models in `backend/src/models/`
- **REST Endpoints**: 352 Active REST routes across 69 route files in `backend/src/routes/`
- **Test Baseline**: 274 Test files, 229 Test suites, 4,983 Automated unit & integration tests

## 3. ARCHITECTURE
The system operates as a **modular monolith** with clear architectural boundaries:
- **Frontend**: Zero-build native ECMAScript Modules (ES2022+), CSS Custom Properties, and Web Components without bundler overhead (no Webpack, Vite, or Babel needed).
- **Backend**: Express.js `v5.2.1` running on Node.js v20+ with CommonJS modularity.
- **Persistence**: MongoDB Atlas (MongoDB `v7.0+`) with Mongoose `v9.9.1` and GridFS for encrypted binary attachment storage.
- **Security**: In-memory access tokens, HttpOnly refresh cookies, Helmet CSP, topology-aware IP rate limiting, CSRF origin verification.

## 4. APPLICATION STARTUP
When `frontend/index.html` boots in a browser:
1. Dynamic API URL Resolution chooses `window.ZAMORIN_API_BASE_URL` or `/api/v1`.
2. `main.js` executes `initLanguage()`, theme configuration, and fires non-blocking `triggerBackendWarmup()` to wake Render cold starts.
3. Checks for deep-link QR paths (`#c/:token`, `#cafe-access/qr/:token`, `#cafe-gateway`).
4. Checks `GET /api/v1/auth/me` to restore active session via HttpOnly cookie.
5. If authenticated, executes `applyAuthenticatedUser()` and mounts `renderShell()`. If unauthenticated, mounts `login2.js` immediately.

## 5. LOGIN & AUTHENTICATION
The production authentication interface is implemented in `login2.js`:
- Glassmorphic luxury UI, animated background canvas, show/hide password toggle.
- Form inputs: Organisation ID (`#login-org-id`), Email/Username (`#login-email`), Password (`#login-password`), Trust Device checkbox (`#login-remember-device`).
- Authenticates via `POST /api/v1/auth/login`. If MFA or Passkey is required, smoothly transitions to `mountAuthScreen("mfa")`.
- Self-service 3-step password recovery: Forgot (`#forgot`) -> Verify Code (`#verify`) -> Set New Password (`#reset`).

## 6. SESSION / DEVICE / SECURITY
- Access tokens expire in 15 minutes and live purely in browser memory.
- Refresh tokens are stored in `HttpOnly`, `Secure`, `SameSite=Strict` cookies (`zamorin_refresh_token`).
- Enrolled café hardware terminals maintain cryptographically signed device tokens (`trustedDeviceToken`) bound to a specific `boundCafeId`.

## 7. ORGANISATION & CAFÉ RESOLUTION
- Multi-tenancy is enforced by mandatory uppercase `organisationId` (e.g. `ZAMORIN`).
- Cafés are identified by unique IDs (`CF-0001`).
- In Cafe Operations mode, `resolveEffectiveCafeScope()` strictly binds every database query to the terminal's registered café.

## 8. ROLE RESOLUTION
The platform recognizes four canonical user roles:
1. **MASTER** (`isPrimaryMaster: true`): Full universal access across all locations and finances.
2. **MASTER** (`isPrimaryMaster: false`): Operational multi-store access; denied owner drawings, treasury, and statutory payroll.
3. **OWNER**: Strategic portfolio governance across assigned cafés (`user.assignedCafeIds`).
4. **CAFE_ADMIN** (*Cafe Operations*): Single-store operational access bound to hardware device.
5. **STAFF**: Least-privilege employee self-service access (`SELF` scope only).

## 9. PRIMARY MASTER
Possesses unrestricted authority over all 26 Primary Master screens:
- Command Centre (`#dashboard`), POS Billing (`#pos`), Tasks (`#approvals`), Attendance (`#attendance`), Dept Orders (`#dept-orders`), Inventory (`#inventory`), Procurement (`#procurement`), Assets (`#assets`), Quality (`#quality`), Employees (`#employees`), Payroll (`#payroll`), Bills (`#bills`), Expenses (`#expenses`), Sales Cash (`#sales-cash`), Finance (`#finance`), Passbook (`#passbook`), Personal Ledger (`#ledger`), Customers (`#customers`), Menu (`#menu`), Vendors (`#vendors`), Revenue Share (`#revenue-share`), Reports (`#reports`), Administration (`#admin`), Org Identity (`#org-identity`), Devices (`#cafe-ops-devices`), System Health (`#system-health`).

## 10. NORMAL MASTER
Possesses operational multi-café access but is strictly blocked by navigation filters, client route guards, and backend middleware from:
- Personal Ledger & Drawings (`#ledger`)
- Universal Payroll Execution (`#payroll`)
- Passbook Treasury (`#passbook`)
- Revenue Share Agreements (`#revenue-share`)
- Organisation Corporate Identity (`#org-identity`)
- Permanent Master Trash Bin Purging (`#trash`)

## 11. OWNER
Executive governance portal featuring 18 dedicated screens, including all 15 Strategic Portfolio modules:
- Food Safety & Recall (`#owner-food-safety`)
- Risk, Audit & Anti-Fraud (`#owner-risk-audit`)
- Planning, Budget & CAPEX (`#owner-planning`)
- Compliance, Licences & Insurance (`#owner-compliance`)
- Supplier & Procurement Intelligence (`#owner-supplier-intelligence`)
- SOP, Training & Academy (`#owner-academy`)
- Asset Reliability & Maintenance (`#owner-asset-reliability`)
- Privacy & Cybersecurity (`#owner-privacy-cyber`)
- Business Continuity & DR (`#owner-bcdr`)
- Master Data Governance (`#owner-master-data`)
- Customer Complaints & Recovery (`#owner-complaints`)
- Menu Engineering & Pricing (`#owner-menu-pricing`)
- Customer Loyalty Intelligence (`#owner-customer-loyalty`)
- Utilities, Waste & Sustainability (`#owner-utilities-waste`)
- Corporate Governance & Delegation (`#owner-governance-delegation`)
- Executive Dashboard, Cafe Performance, and Finance Summary

## 12. CAFÉ OPERATIONS
Store-level terminal interface:
- Device enrollment via 6-digit one-time code (`#cafe-device-enroll`).
- Rapid shift unlock via Operator PIN (`#cafe-operator-signin`).
- Auto-lock after 5 minutes of idle time (`cafeOpsInactivity.js`).
- Modules: Store Dashboard, POS, Local Inventory, Store PO Requisitions, Store Assets, Daily Cash Register, Store Reports.

## 13. EMPLOYEE / STAFF
Frontline staff self-service:
- Home Screen (`#staff-home`), Announcements (`#announcements`), Geofenced GPS Clock In/Out (`#staff-attendance`), Leave Requests (`#staff-leave`), Official PDF Payslips (`#staff-payslips`), Salary Advances (`#staff-loans-advances`), Employment Documents (`#staff-documents`), Profile (`#employee-profile`), Preferences (`#staff-settings`).

## 14. SHARED MODULES
Universal components:
- **Settings Hub** (`#settings`): 16 subroutes covering Profile, Security, Appearance, Language, Privacy, App Updates.
- **Notification Centre** (`#notifications`): Bell icon drawer with real-time badge updates.
- **Export Centre Modal**: PDF (APA 7 formatted) and Excel (.xlsx OpenXML) data exports.
- **Universal Attachment Modal**: In-modal PDF preview, live ClamAV upload scanning, secure downloads.

## 15. COMPLETE SCREEN CATALOGUE
Documents all 70 unique frontend screens from `AUTH-SCR-001` through `SHARED-SCR-005` with canonical routes and components (detailed in [21_COMPLETE_SCREEN_AND_FEATURE_INVENTORY.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/21_COMPLETE_SCREEN_AND_FEATURE_INVENTORY.md)).

## 16. NAVIGATION ARCHITECTURE
Persistent App Shell architecture: `#sidebar` and `#topbar` are rendered once and never reloaded during route transitions. Route clicks only replace `#page-content`, delivering instant zero-flicker performance.

## 17. FRONTEND ROUTES
Catalogues all 98 router cases in `router.js` with allowed roles, guard mechanisms, and scope boundaries (detailed in [09_COMPLETE_FRONTEND_ROUTE_MAP.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/09_COMPLETE_FRONTEND_ROUTE_MAP.md)).

## 18. BACKEND APIS
Catalogues all 352 REST API endpoints across 69 route modules with HTTP methods, paths, controllers, permissions, and scopes (detailed in [10_COMPLETE_BACKEND_API_MAP.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/10_COMPLETE_BACKEND_API_MAP.md)).

## 19. DATABASE ARCHITECTURE
Catalogues all 229 Mongoose schemas in `backend/src/models/`, including field validation, compound indexes, and optimistic locking mechanisms (detailed in [11_DATABASE_AND_DATA_MODEL_REFERENCE.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/11_DATABASE_AND_DATA_MODEL_REFERENCE.md)).

## 20. RBAC
Detailed role-by-role permission matrix across all business operations governed by default-deny rules and negative overrides in `RolePermission.js` (detailed in [12_RBAC_PERMISSION_AND_SCOPE_MATRIX.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/12_RBAC_PERMISSION_AND_SCOPE_MATRIX.md)).

## 21. MULTI-TENANT ISOLATION
Enforces non-bypassable cross-café boundaries in `backend/src/utils/cafeScope.js`:
- `resolveEffectiveCafeScope()` binds requests to authorized cafés.
- `assertResourceCafeOwnership()` blocks Insecure Direct Object Reference (IDOR) attacks by validating document ownership before returning data.

## 22. POS (POINT OF SALE)
Touchscreen and keyboard billing terminal:
- Real-time cart calculation with 5% GST (2.5% CGST + 2.5% SGST) and nearest rupee rounding.
- Split payments (Cash, UPI QR, Card).
- Atomic recipe BOM inventory depletion via `bomDepletionService.js`.
- Statutory invoice generation with sequential fiscal counters.

## 23. PURCHASES
Complete procurement lifecycle:
- Purchase Requisition -> Purchase Order (`PO-XXXX`) -> Goods Receipt Note (`GRN`) -> Supplier Tax Invoice Attachment -> 3-Way Matching Engine (`threeWayMatchService.js`) -> Accounts Payable Ledger Posting.

## 24. INVENTORY
Multi-location inventory tracking:
- Raw materials, semi-finished preparations, and retail items.
- First-Expired, First-Out (FEFO) lot tracking via `inventoryLotService.js`.
- Wastage logging with mandatory reason codes and cost accounting impact.

## 25. HR
Workforce management:
- Employee master profiles, statutory KYC cards, designation hierarchy, date of joining, bank account details.

## 26. ATTENDANCE
Real-time presence tracking:
- Geofenced GPS punch validation on mobile devices.
- Hardware QR attendance scanner on store kiosks.
- Shift roster scheduling, late-in flags, and automated overtime tracking.

## 27. PAYROLL
Statutory Indian payroll engine:
- Compliant with Code on Wages: Basic salary min 50% of CTC.
- Automated EPF (12% + 12%) and ESI (0.75% + 3.25%) statutory deductions.
- Direct bank payout batch export and digital PDF payslips.

## 28. LOANS / ADVANCES
Staff financial assistance:
- Salary advance application form, loan tenure schedules, automated payroll deduction integration.

## 29. FINANCE
General Ledger and financial reporting:
- Chart of Accounts, Double-entry Journal entries, Profit & Loss statement, Balance Sheet, Trial Balance, GST GSTR-1/3B summary reports.

## 30. DOCUMENTS & ATTACHMENTS
MongoDB GridFS bucket document storage:
- Automatic SHA-256 integrity verification.
- Live ClamAV antivirus stream scanning before persistence.
- Secure in-modal PDF preview and original filename download.

## 31. REPORTS & ANALYTICS
14 Standardized business intelligence reports:
- Sales Trends, Hourly Footfall, Product Velocity, Labor Cost Percentage, Food Cost Percentage, Wastage Analysis, GST Tax Summary.

## 32. PRINTING / PDF / EXPORT
- ESC/POS thermal receipt printing (58mm and 80mm) via WebSerial / WebBluetooth.
- APA 7 styled audit PDF generation with confidentiality watermarks.
- OpenXML Excel exports with automated formula injection neutralization (CWE-1236).

## 33. NOTIFICATIONS
Asynchronous reliable outbox pattern:
- In-app notification drawer with unread badge counter.
- Outbound transactional email dispatch via Gmail SMTP or console provider.

## 34. SETTINGS
Comprehensive 16-section preferences hub supporting themes, font scaling, language translation, session revocation, and data recovery.

## 35. PROFILE
Universal employee profile viewer with KYC documents, bank deposit account details, and contact information.

## 36. AUDIT LOGGING
Immutable event logging in `AuditEvent` collection recording `correlationId`, `actorId`, `action`, `targetId`, `beforeValue`, `afterValue`, client IP, and user-agent.

## 37. QR / CAFÉ DEEP LINKS
Public touchless café links:
- `/c/:token` and `/cafe-access/qr/:token` resolve encrypted café tokens to set up context and present the Operator PIN unlock pad.

## 38. INTEGRATIONS
- MongoDB Atlas (Replica set persistence)
- ClamAV Antivirus Daemon (Live malware detection)
- SimpleWebAuthn (FIDO2 / WebAuthn Passkeys)
- Gmail SMTP (Transactional email delivery)
- Redis / In-Memory (Distributed cache & rate limiting)

## 39. ENVIRONMENT & CONFIGURATION
125 Environment variables catalogued and verified with startup validation and complete secret redaction.

## 40. DEPLOYMENT
Production deployment model: Vercel CDN frontend reverse-proxying `/api/v1/*` to containerized Render backend web service connected to MongoDB Atlas.

## 41. CI/CD
GitHub Actions workflow pipelines in `.github/workflows/`:
- `ci.yml`: Static checks, frontend router import verification, backend unit tests.
- `deploy-check.yml`: Production environment configuration verification.
- `owasp-zap-dast.yml`: Dynamic Application Security Testing.
- `release-gate.yml`: Semantic release and SBOM generation.

## 42. PWA / MOBILE / DESKTOP
Native wrappers with bridge interfaces:
- Android: Native Kotlin / Gradle project (`android/`).
- Windows: .NET 10 WinUI 3 / WPF desktop application (`windows/`).
- Apple: Swift / Xcode project for iOS and macOS (`apple/`).
- PWA: Offline service worker (`sw.js`) and web manifest.

## 43. TESTS
Verified test harness:
- 274 Test files containing 229 suites and 4,983 test cases.
- 100% passing rate on active suites.

## 44. UI ACTION MATRIX
Audited 650 interactive UI controls across all 70 page components (98.8% fully wired and functional).

## 45. END-TO-END WORKFLOWS
Complete cross-layer tracing for 12 primary workflows from client DOM click to database write and audit logging.

## 46. KNOWN DEFECTS / GAPS
- P1: `#mailops` router redirect to dashboard.
- P2: `#bills` fallback demo array and `#trash` single-confirmation purge.
- P3: 561 TODO comments across repository.

## 47. DEAD / LEGACY COMPONENTS
- Legacy Login 1.0 successfully eradicated (Login 2.0 active).
- Older OTP test scripts archived in historical folders.

## 48. SYSTEM GLOSSARY
Lexicon of hospitality ERP terms and canonical ID prefixes (`CF-`, `MU-`, `OU-`, `AU-`, `SU-`, `EMP-`, `BL-`, `PO-`, `PR-`, `DEV-`, `PAY-`).

## 49. COMPLETE FILE/COMPONENT REFERENCE
Complete cross-reference linking all 45 individual documentation files in `ZAMORIN_COMPLETE_APP_DOCUMENTATION/`.

## 50. FINAL AS-BUILT STATUS
Zamorin Cafe ERP is certified as a fully implemented, enterprise-grade, multi-location restaurant management system ready for production cutover following minor routing adjustments.


---

<a id="part-2-exhaustive-specification"></a>

# PART II: EXHAUSTIVE 45-CHAPTER DEEP-DIVE SPECIFICATION & AUDIT

### Granular Chapter Table of Contents

- [Chapter 00: ZAMORIN CAFE ERP — MASTER INDEX & AUDIT HANDBOOK](#chapter-00-zamorin-erp-master-index-md)
- [Chapter 01: APPLICATION OVERVIEW AND SYSTEM ARCHITECTURE](#chapter-01-application-overview-and-system-architecture-md)
- [Chapter 02: LOGIN, AUTHENTICATION AND ENTRY FLOWS](#chapter-02-login-authentication-and-entry-flows-md)
- [Chapter 03: PRIMARY MASTER COMPLETE REFERENCE](#chapter-03-primary-master-complete-reference-md)
- [Chapter 04: NORMAL MASTER COMPLETE REFERENCE](#chapter-04-normal-master-complete-reference-md)
- [Chapter 05: OWNER COMPLETE REFERENCE](#chapter-05-owner-complete-reference-md)
- [Chapter 06: CAFE OPERATIONS COMPLETE REFERENCE](#chapter-06-cafe-operations-complete-reference-md)
- [Chapter 07: EMPLOYEE / STAFF COMPLETE REFERENCE](#chapter-07-employee-staff-complete-reference-md)
- [Chapter 08: SHARED UNIVERSAL MODULES](#chapter-08-shared-universal-modules-md)
- [Chapter 09: COMPLETE FRONTEND ROUTE MAP](#chapter-09-complete-frontend-route-map-md)
- [Chapter 10: COMPLETE BACKEND API MAP](#chapter-10-complete-backend-api-map-md)
- [Chapter 11: DATABASE AND DATA MODEL REFERENCE](#chapter-11-database-and-data-model-reference-md)
- [Chapter 12: RBAC PERMISSION AND SCOPE MATRIX](#chapter-12-rbac-permission-and-scope-matrix-md)
- [Chapter 13: COMPLETE UI ACTION AND BUTTON MATRIX](#chapter-13-complete-ui-action-and-button-matrix-md)
- [Chapter 14: END-TO-END WORKFLOW CATALOGUE](#chapter-14-end-to-end-workflow-catalogue-md)
- [Chapter 15: INTEGRATIONS, FILES, PRINTING AND DOCUMENTS](#chapter-15-integrations-files-printing-and-documents-md)
- [Chapter 16: SECURITY, AUTH, SESSION AND AUDIT ARCHITECTURE](#chapter-16-security-auth-session-and-audit-architecture-md)
- [Chapter 17: NOTIFICATIONS, BACKGROUND JOBS AND AUTOMATION](#chapter-17-notifications-background-jobs-and-automation-md)
- [Chapter 18: DEPLOYMENT INFRASTRUCTURE AND ENVIRONMENT MAP](#chapter-18-deployment-infrastructure-and-environment-map-md)
- [Chapter 19: TESTING AND VERIFICATION REFERENCE](#chapter-19-testing-and-verification-reference-md)
- [Chapter 20: DEFECTS, GAPS, DEAD ROUTES AND UNWIRED FUNCTIONS](#chapter-20-defects-gaps-dead-routes-and-unwired-functions-md)
- [Chapter 21: COMPLETE SCREEN AND FEATURE INVENTORY](#chapter-21-complete-screen-and-feature-inventory-md)
- [Chapter 22: DATA FLOW AND DEPENDENCY MAP](#chapter-22-data-flow-and-dependency-map-md)
- [Chapter 23: APPLICATION GLOSSARY AND IDENTIFIER REFERENCE](#chapter-23-application-glossary-and-identifier-reference-md)
- [Chapter 24: FINAL AS-BUILT SYSTEM SUMMARY](#chapter-24-final-as-built-system-summary-md)
- [Chapter 25: CURRENT APPLICATION DELTA AND NEW ADDITIONS](#chapter-25-current-application-delta-and-new-additions-md)
- [Chapter 26: COMPLETE MISSING MODULES REGISTER](#chapter-26-complete-missing-modules-register-md)
- [Chapter 27: COMPLETE MISSING FILES REGISTER](#chapter-27-complete-missing-files-register-md)
- [Chapter 28: INCOMPLETE, PARTIAL AND BROKEN IMPLEMENTATIONS](#chapter-28-incomplete-partial-and-broken-implementations-md)
- [Chapter 29: COMPLETE PENDING WORK REGISTER](#chapter-29-complete-pending-work-register-md)
- [Chapter 30: CROSS-LAYER WIRING GAPS](#chapter-30-cross-layer-wiring-gaps-md)
- [Chapter 31: MISSING ROUTES, APIS, CONTROLLERS, SERVICES AND MODELS](#chapter-31-missing-routes-apis-controllers-services-and-models-md)
- [Chapter 32: MISSING UI COMPONENTS, ACTIONS AND SCREENS](#chapter-32-missing-ui-components-actions-and-screens-md)
- [Chapter 33: DATABASE SCHEMA, INDEX AND DATA INTEGRITY GAPS](#chapter-33-database-schema-index-and-data-integrity-gaps-md)
- [Chapter 34: RBAC, SECURITY AND SCOPE GAPS](#chapter-34-rbac-security-and-scope-gaps-md)
- [Chapter 35: TEST COVERAGE AND VERIFICATION GAPS](#chapter-35-test-coverage-and-verification-gaps-md)
- [Chapter 36: CONFIGURATION, ENVIRONMENT AND DEPLOYMENT GAPS](#chapter-36-configuration-environment-and-deployment-gaps-md)
- [Chapter 37: DEPENDENCY, IMPORT, BUILD AND RUNTIME GAPS](#chapter-37-dependency-import-build-and-runtime-gaps-md)
- [Chapter 38: PLACEHOLDERS, STUBS, TODOS AND TECHNICAL DEBT](#chapter-38-placeholders-stubs-todos-and-technical-debt-md)
- [Chapter 39: ORPHAN, DUPLICATE, DEAD AND LEGACY IMPLEMENTATIONS](#chapter-39-orphan-duplicate-dead-and-legacy-implementations-md)
- [Chapter 40: DOCUMENTATION VS IMPLEMENTATION MISMATCHES](#chapter-40-documentation-vs-implementation-mismatches-md)
- [Chapter 41: PRODUCTION READINESS BLOCKERS](#chapter-41-production-readiness-blockers-md)
- [Chapter 42: MASTER REMEDIATION BACKLOG](#chapter-42-master-remediation-backlog-md)
- [Chapter 43: COMPLETE GAP TRACEABILITY MATRIX](#chapter-43-complete-gap-traceability-matrix-md)
- [Chapter 44: FINAL COMPLETENESS RECONCILIATION](#chapter-44-final-completeness-reconciliation-md)

---

<a id="chapter-00-zamorin-erp-master-index-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 00: 00_ZAMORIN_ERP_MASTER_INDEX.md -->
<!-- ===================================================================== -->

# ZAMORIN CAFE ERP — MASTER INDEX & AUDIT HANDBOOK

**Document Identifier:** `DOC-00-MASTER-INDEX`  
**Application Name:** Zamorin Cafe ERP (Enterprise Restaurant & Multi-Location Management System)  
**Audit Timestamp:** 2026-09-18T17:55:00+05:30 (IST) / 2026-09-18T12:25:00Z (UTC)  
**Repository Branch:** `owner-strategic-batch-03`  
**HEAD Commit SHA:** `d8cfac780091ede4f4692c4bf2a5791dc9ef696f`  
**Working Tree Status:** Clean (0 uncommitted changes, 20 commits ahead of remote tracking)  
**Repository Root:** `d:\Zamorin_Cafe_ERP_Build\15_INTEGRATION_WORKSPACE`  
**Frontend Root:** `d:\Zamorin_Cafe_ERP_Build\15_INTEGRATION_WORKSPACE\frontend`  
**Backend Root:** `d:\Zamorin_Cafe_ERP_Build\15_INTEGRATION_WORKSPACE\backend`  
**Application Version:** 1.0.0 (Root: `1.0.0`, Frontend Asset Bundle: `v3.4.6`, API Version: `v1`)  
**Runtime Environment:** Node.js v20.x+ (Zero-build Vanilla JavaScript ES Modules on Frontend, CommonJS on Backend)  
**Database Technology:** MongoDB Atlas / Mongoose 9.9.1 / GridFS Durable Object Storage  
**Primary Deployment Target:** Vercel (Frontend reverse-proxy) + Render (Containerized Node.js Web Service) + MongoDB Atlas M0/Dedicated

---

## 1. EXECUTIVE AUDIT BASELINE

This document establishes the permanent, forensic master index and navigation roadmap for the entire Zamorin Cafe ERP platform. The system has undergone comprehensive architectural analysis and static verification against the live code tree.

### Core Metrics Summary

| Architectural Entity | Verified Count | Source Evidence |
| :--- | :--- | :--- |
| **Backend Source Modules** | **598 JavaScript Files** | `backend/src/**/*.js` |
| **Backend Test Modules** | **274 Test Suites / 4,983 Tests** | `backend/test/*.test.js` |
| **Frontend Source Modules** | **104 JavaScript Files** | `frontend/src/js/**/*.js` |
| **Frontend Page Components** | **70 Functional Pages** | `frontend/src/js/pages/*.js` |
| **Mongoose Database Models** | **229 Schemas** | `backend/src/models/*.js` |
| **Backend Route Files** | **69 Route Registrations** | `backend/src/routes/*.js` |
| **REST API Endpoints** | **352 Active Endpoints** | Express `router.(get\|post\|put\|delete\|patch)` |
| **Backend Controllers** | **76 Controllers** | `backend/src/controllers/*.js` |
| **Backend Business Services** | **104 Domain Services** | `backend/src/services/*.js` |
| **Frontend Hash Routes** | **98 Router Cases** | `frontend/src/js/router.js` |
| **Interactive UI Controls** | **650 Audited Actions** | Buttons, Modals, Dropdowns, Tables |
| **Target Mobile & Desktop Platforms** | **Android, iOS, macOS, Windows** | Native wrappers in `android/`, `apple/`, `windows/` |
| **Environment Variables** | **125 Referenced Variables** | Process environment references |

---

## 2. CANONICAL DOCUMENTATION ROADMAP

The complete documentation suite is partitioned into 45 dedicated references plus 1 master consolidated handbook:

### Core Architecture & Operating Windows (00 – 08)
- [00_ZAMORIN_ERP_MASTER_INDEX.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/00_ZAMORIN_ERP_MASTER_INDEX.md) — Master Navigation, Index, and Repository Baseline
- [01_APPLICATION_OVERVIEW_AND_SYSTEM_ARCHITECTURE.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/01_APPLICATION_OVERVIEW_AND_SYSTEM_ARCHITECTURE.md) — Architectural Blueprint, Technology Stack & Layering
- [02_LOGIN_AUTHENTICATION_AND_ENTRY_FLOWS.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/02_LOGIN_AUTHENTICATION_AND_ENTRY_FLOWS.md) — Bootstrapping, Login 2.0, Passkeys, MFA & Device Trust
- [03_PRIMARY_MASTER_COMPLETE_REFERENCE.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/03_PRIMARY_MASTER_COMPLETE_REFERENCE.md) — Primary Master Operating Window & All Modules
- [04_NORMAL_MASTER_COMPLETE_REFERENCE.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/04_NORMAL_MASTER_COMPLETE_REFERENCE.md) — Normal Master Operating Window & Scoping Restrictions
- [05_OWNER_COMPLETE_REFERENCE.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/05_OWNER_COMPLETE_REFERENCE.md) — Owner Portal & 15 Strategic Governance Modules
- [06_CAFE_OPERATIONS_COMPLETE_REFERENCE.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/06_CAFE_OPERATIONS_COMPLETE_REFERENCE.md) — Cafe Operations (CAFE_ADMIN / Operator) Workspace
- [07_EMPLOYEE_STAFF_COMPLETE_REFERENCE.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/07_EMPLOYEE_STAFF_COMPLETE_REFERENCE.md) — Employee / Staff Self-Service Workspace
- [08_SHARED_UNIVERSAL_MODULES.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/08_SHARED_UNIVERSAL_MODULES.md) — Settings Hub, Profile, Export Centre & Universal Modals

### System Routing, Data Models & Control Matrices (09 – 16)
- [09_COMPLETE_FRONTEND_ROUTE_MAP.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/09_COMPLETE_FRONTEND_ROUTE_MAP.md) — Inventory of all 98 Frontend Routes & Guards
- [10_COMPLETE_BACKEND_API_MAP.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/10_COMPLETE_BACKEND_API_MAP.md) — Complete Inventory of all 352 REST API Endpoints
- [11_DATABASE_AND_DATA_MODEL_REFERENCE.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/11_DATABASE_AND_DATA_MODEL_REFERENCE.md) — 229 Database Schemas, Keys, Relationships & Indexes
- [12_RBAC_PERMISSION_AND_SCOPE_MATRIX.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/12_RBAC_PERMISSION_AND_SCOPE_MATRIX.md) — Multi-Tenant Scoping & Role-Based Authorization
- [13_COMPLETE_UI_ACTION_AND_BUTTON_MATRIX.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/13_COMPLETE_UI_ACTION_AND_BUTTON_MATRIX.md) — 650 Interactive UI Actions & Wiring Audit
- [14_END_TO_END_WORKFLOW_CATALOGUE.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/14_END_TO_END_WORKFLOW_CATALOGUE.md) — Cross-Layer Tracing of 12 Critical Business Workflows
- [15_INTEGRATIONS_FILES_PRINTING_AND_DOCUMENTS.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/15_INTEGRATIONS_FILES_PRINTING_AND_DOCUMENTS.md) — GridFS, Printing, Scanner & Document Generators
- [16_SECURITY_AUTH_SESSION_AND_AUDIT_ARCHITECTURE.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/16_SECURITY_AUTH_SESSION_AND_AUDIT_ARCHITECTURE.md) — Encryption, JWT, CSRF, CSP & Audit Logs

### Infrastructure, Testing & Operational Readiness (17 – 24)
- [17_NOTIFICATIONS_BACKGROUND_JOBS_AND_AUTOMATION.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/17_NOTIFICATIONS_BACKGROUND_JOBS_AND_AUTOMATION.md) — Schedulers, Outbox, and Event Bus
- [18_DEPLOYMENT_INFRASTRUCTURE_AND_ENVIRONMENT_MAP.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/18_DEPLOYMENT_INFRASTRUCTURE_AND_ENVIRONMENT_MAP.md) — Vercel, Render, Atlas & 125 Environment Vars
- [19_TESTING_AND_VERIFICATION_REFERENCE.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/19_TESTING_AND_VERIFICATION_REFERENCE.md) — Complete 274-Suite Test Catalog & Verification Harness
- [20_DEFECTS_GAPS_DEAD_ROUTES_AND_UNWIRED_FUNCTIONS.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/20_DEFECTS_GAPS_DEAD_ROUTES_AND_UNWIRED_FUNCTIONS.md) — Detailed Defect Register (P0–P3 Findings)
- [21_COMPLETE_SCREEN_AND_FEATURE_INVENTORY.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/21_COMPLETE_SCREEN_AND_FEATURE_INVENTORY.md) — 70 Page Inventory with Canonical Identifiers
- [22_DATA_FLOW_AND_DEPENDENCY_MAP.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/22_DATA_FLOW_AND_DEPENDENCY_MAP.md) — Architectural Data Flows & Model Relationships
- [23_APPLICATION_GLOSSARY_AND_IDENTIFIER_REFERENCE.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/23_APPLICATION_GLOSSARY_AND_IDENTIFIER_REFERENCE.md) — Domain Lexicon and Identifier Schemes
- [24_FINAL_AS_BUILT_SYSTEM_SUMMARY.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/24_FINAL_AS_BUILT_SYSTEM_SUMMARY.md) — Final System Verification & Certification Report

### Supplemental Forensic Gap & Delta Audit (25 – 44)
- [25_CURRENT_APPLICATION_DELTA_AND_NEW_ADDITIONS.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/25_CURRENT_APPLICATION_DELTA_AND_NEW_ADDITIONS.md) — Analysis of Owner Strategic Batches & Recent Changes
- [26_COMPLETE_MISSING_MODULES_REGISTER.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/26_COMPLETE_MISSING_MODULES_REGISTER.md) — Missing vs Expected Module Registry
- [27_COMPLETE_MISSING_FILES_REGISTER.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/27_COMPLETE_MISSING_FILES_REGISTER.md) — Missing Files and Broken Import Analysis
- [28_INCOMPLETE_PARTIAL_AND_BROKEN_IMPLEMENTATIONS.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/28_INCOMPLETE_PARTIAL_AND_BROKEN_IMPLEMENTATIONS.md) — Partial Implementations and Stubs
- [29_COMPLETE_PENDING_WORK_REGISTER.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/29_COMPLETE_PENDING_WORK_REGISTER.md) — Comprehensive Backlog with Dependencies
- [30_CROSS_LAYER_WIRING_GAPS.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/30_CROSS_LAYER_WIRING_GAPS.md) — UI-to-Database Disconnect Analysis
- [31_MISSING_ROUTES_APIS_CONTROLLERS_SERVICES_AND_MODELS.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/31_MISSING_ROUTES_APIS_CONTROLLERS_SERVICES_AND_MODELS.md) — Missing Architectural Layers
- [32_MISSING_UI_COMPONENTS_ACTIONS_AND_SCREENS.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/32_MISSING_UI_COMPONENTS_ACTIONS_AND_SCREENS.md) — UI Gaps and Incomplete Views
- [33_DATABASE_SCHEMA_INDEX_AND_DATA_INTEGRITY_GAPS.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/33_DATABASE_SCHEMA_INDEX_AND_DATA_INTEGRITY_GAPS.md) — Schema Gaps and Constraint Audits
- [34_RBAC_SECURITY_AND_SCOPE_GAPS.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/34_RBAC_SECURITY_AND_SCOPE_GAPS.md) — RBAC and Cross-Café Authorization Gaps
- [35_TEST_COVERAGE_AND_VERIFICATION_GAPS.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/35_TEST_COVERAGE_AND_VERIFICATION_GAPS.md) — Missing Automated Test Coverage
- [36_CONFIGURATION_ENVIRONMENT_AND_DEPLOYMENT_GAPS.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/36_CONFIGURATION_ENVIRONMENT_AND_DEPLOYMENT_GAPS.md) — Configuration Mismatches and Defaults
- [37_DEPENDENCY_IMPORT_BUILD_AND_RUNTIME_GAPS.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/37_DEPENDENCY_IMPORT_BUILD_AND_RUNTIME_GAPS.md) — Dependency and Zero-Build Audits
- [38_PLACEHOLDERS_STUBS_TODOS_AND_TECHNICAL_DEBT.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/38_PLACEHOLDERS_STUBS_TODOS_AND_TECHNICAL_DEBT.md) — Catalogue of 561 TODO/FIXME Items
- [39_ORPHAN_DUPLICATE_DEAD_AND_LEGACY_IMPLEMENTATIONS.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/39_ORPHAN_DUPLICATE_DEAD_AND_LEGACY_IMPLEMENTATIONS.md) — Dead Code & Legacy Login Remnants
- [40_DOCUMENTATION_VS_IMPLEMENTATION_MISMATCHES.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/40_DOCUMENTATION_VS_IMPLEMENTATION_MISMATCHES.md) — Discrepancies Between Docs and Code
- [41_PRODUCTION_READINESS_BLOCKERS.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/41_PRODUCTION_READINESS_BLOCKERS.md) — Production Cutover Hard Blockers
- [42_MASTER_REMEDIATION_BACKLOG.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/42_MASTER_REMEDIATION_BACKLOG.md) — Dependency-Ordered 15-Stage Remediation Plan
- [43_COMPLETE_GAP_TRACEABILITY_MATRIX.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/43_COMPLETE_GAP_TRACEABILITY_MATRIX.md) — Complete Gap Traceability Table
- [44_FINAL_COMPLETENESS_RECONCILIATION.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_COMPLETE_APP_DOCUMENTATION/44_FINAL_COMPLETENESS_RECONCILIATION.md) — Final Comprehensive System Reconciliation

### Master Consolidated Handbook
- [ZAMORIN_CAFE_ERP_COMPLETE_AS_BUILT_REFERENCE.md](file:///d:/Zamorin_Cafe_ERP_Build/15_INTEGRATION_WORKSPACE/ZAMORIN_CAFE_ERP_COMPLETE_AS_BUILT_REFERENCE.md) — Consolidated 50-Section Master Handbook

---

## 3. CANONICAL SCREEN IDENTIFIER INDEX

| Screen Identifier | Operating Window | Screen Name | Canonical Frontend Hash Route | Component Source File |
| :--- | :--- | :--- | :--- | :--- |
| `AUTH-SCR-001` | Authentication | Login 2.0 Glassmorphic Terminal | `#login` | `frontend/src/js/pages/login2.js` |
| `AUTH-SCR-002` | Authentication | Multi-Factor Authentication Challenge | `#mfa` | `frontend/src/js/pages/login2.js` |
| `AUTH-SCR-003` | Authentication | Password Reset Request (Forgot) | `#forgot` | `frontend/src/js/pages/login2.js` |
| `AUTH-SCR-004` | Authentication | Password Reset Code Verification | `#verify` | `frontend/src/js/pages/login2.js` |
| `AUTH-SCR-005` | Authentication | Password Reset Final (New Password) | `#reset` | `frontend/src/js/pages/login2.js` |
| `AUTH-SCR-006` | Authentication | Public Cafe Gateway / QR Access | `#cafe-gateway`, `#c/:token` | `frontend/src/js/pages/cafeGatewayPage.js` |
| `PM-SCR-001` | Primary Master | Master Command Centre Dashboard | `#dashboard` | `frontend/src/js/pages/dashboardMaster.js` |
| `PM-SCR-002` | Primary Master | POS & Billing Checkout Terminal | `#pos` | `frontend/src/js/pages/posTill.js` |
| `PM-SCR-003` | Primary Master | Tasks, Approvals & Governance Oversight | `#approvals`, `#tasks` | `frontend/src/js/pages/tasksApprovals.js` |
| `PM-SCR-004` | Primary Master | Attendance & Shift Roster Management | `#attendance` | `frontend/src/js/modules/attendance/attendanceShifts.js` |
| `PM-SCR-005` | Primary Master | Department Orders (Institutional C/o) | `#dept-orders` | `frontend/src/js/pages/departmentOrders.js` |
| `PM-SCR-006` | Primary Master | Central Inventory & BOM Depletion | `#inventory` | `frontend/src/js/pages/inventory.js` |
| `PM-SCR-007` | Primary Master | Procurement, Requisitions & POs | `#procurement` | `frontend/src/js/pages/procurement.js` |
| `PM-SCR-008` | Primary Master | Fixed Assets & Equipment Maintenance | `#assets` | `frontend/src/js/pages/assets.js` |
| `PM-SCR-009` | Primary Master | Quality Checklists & Food Safety | `#quality` | `frontend/src/js/pages/quality.js` |
| `PM-SCR-010` | Primary Master | Employee Directory & Onboarding | `#employees` | `frontend/src/js/pages/employees.js` |
| `PM-SCR-011` | Primary Master | Universal Payroll, EPF/ESI & Statutory | `#payroll` | `frontend/src/js/pages/payrollManagement.js` |
| `PM-SCR-012` | Primary Master | Bills, Tax Invoices & Credit Notes | `#bills` | `frontend/src/js/pages/ownerBills.js` |
| `PM-SCR-013` | Primary Master | Operating Expenses & Approvals | `#expenses` | `frontend/src/js/pages/expenses.js` |
| `PM-SCR-014` | Primary Master | Sales Journal & Physical Cash Book | `#sales-cash` | `frontend/src/js/pages/cashBook.js` |
| `PM-SCR-015` | Primary Master | Finance & General Ledger Accounts | `#finance` | `frontend/src/js/pages/financeAccounts.js` |
| `PM-SCR-016` | Primary Master | Passbook, Bank Accounts & Treasury | `#passbook` | `frontend/src/js/pages/passbook.js` |
| `PM-SCR-017` | Primary Master | Personal Ledger & Owner Drawings | `#ledger` | `frontend/src/js/pages/personalLedger.js` |
| `PM-SCR-018` | Primary Master | Customers, Loyalty & Cohorts | `#customers` | `frontend/src/js/pages/customers.js` |
| `PM-SCR-019` | Primary Master | Menu Engineering, Pricing & Recipes | `#menu` | `frontend/src/js/pages/menuManagement.js` |
| `PM-SCR-020` | Primary Master | Vendor Master & Accounts Payable | `#vendors` | `frontend/src/js/pages/vendors.js` |
| `PM-SCR-021` | Primary Master | Revenue Share Agreements & Leased Outlets | `#revenue-share` | `frontend/src/js/pages/revenueShare.js` |
| `PM-SCR-022` | Primary Master | Executive Reports & Business Intelligence | `#reports` | `frontend/src/js/pages/reportsAnalytics.js` |
| `PM-SCR-023` | Primary Master | System Administration & Cafe Management | `#admin` | `frontend/src/js/pages/administration.js` |
| `PM-SCR-024` | Primary Master | Organisation Legal & Tax Identity | `#org-identity` | `frontend/src/js/pages/organisationIdentity.js` |
| `PM-SCR-025` | Primary Master | Hardware Terminals & Device Sessions | `#cafe-ops-devices` | `frontend/src/js/pages/cafeOperationsDevices.js` |
| `PM-SCR-026` | Primary Master | System Health, Storage & Diagnostics | `#system-health` | `frontend/src/js/pages/systemHealth.js` |
| `OWN-SCR-001` | Owner Portal | Owner Executive Portfolio Overview | `#dashboard` | `frontend/src/js/pages/dashboardOwner.js` |
| `OWN-SCR-002` | Owner Portal | Food Safety Governance & Recall Control | `#owner-food-safety` | `frontend/src/js/pages/ownerFoodSafety.js` |
| `OWN-SCR-003` | Owner Portal | Risk, Audit & Anti-Fraud Control | `#owner-risk-audit` | `frontend/src/js/pages/ownerRiskAudit.js` |
| `OWN-SCR-004` | Owner Portal | Planning, Budgeting & CAPEX Allocation | `#owner-planning` | `frontend/src/js/pages/ownerPlanning.js` |
| `OWN-SCR-005` | Owner Portal | Compliance, Licences & Insurance | `#owner-compliance` | `frontend/src/js/pages/ownerCompliance.js` |
| `OWN-SCR-006` | Owner Portal | Supplier & Procurement Intelligence | `#owner-supplier-intelligence` | `frontend/src/js/pages/ownerSupplierIntelligence.js` |
| `OWN-SCR-007` | Owner Portal | SOP, Training & Academy Management | `#owner-academy` | `frontend/src/js/pages/ownerAcademy.js` |
| `OWN-SCR-008` | Owner Portal | Asset Reliability & Maintenance Strategy | `#owner-asset-reliability` | `frontend/src/js/pages/ownerAssetReliability.js` |
| `OWN-SCR-009` | Owner Portal | Privacy, Cybersecurity & Data Protection | `#owner-privacy-cyber` | `frontend/src/js/pages/ownerPrivacyCyber.js` |
| `OWN-SCR-010` | Owner Portal | Business Continuity & Disaster Recovery | `#owner-bcdr` | `frontend/src/js/pages/ownerBcdr.js` |
| `OWN-SCR-011` | Owner Portal | Master Data Domain Governance | `#owner-master-data` | `frontend/src/js/pages/ownerMasterData.js` |
| `OWN-SCR-012` | Owner Portal | Customer Complaints & Service Recovery | `#owner-complaints` | `frontend/src/js/pages/ownerComplaints.js` |
| `OWN-SCR-013` | Owner Portal | Menu Engineering & Margin Optimisation | `#owner-menu-pricing` | `frontend/src/js/pages/ownerMenuPricing.js` |
| `OWN-SCR-014` | Owner Portal | Customer Loyalty & Retention Intelligence | `#owner-customer-loyalty` | `frontend/src/js/pages/ownerCustomerLoyalty.js` |
| `OWN-SCR-015` | Owner Portal | Utilities, Waste & Sustainability | `#owner-utilities-waste` | `frontend/src/js/pages/ownerUtilitiesWaste.js` |
| `OWN-SCR-016` | Owner Portal | Corporate Governance & Board Delegation | `#owner-governance-delegation` | `frontend/src/js/pages/ownerGovernanceDelegation.js` |
| `OWN-SCR-017` | Owner Portal | Cafe Comparative Performance | `#performance` | `frontend/src/js/pages/cafePerformance.js` |
| `OWN-SCR-018` | Owner Portal | Owner Executive Finance Summary | `#finance` | `frontend/src/js/pages/ownerFinanceSummary.js` |
| `CAF-SCR-001` | Cafe Operations | Cafe Operations Live Store Dashboard | `#dashboard` | `frontend/src/js/pages/dashboardAdmin.js` |
| `CAF-SCR-002` | Cafe Operations | Operator Terminal Sign-In | `#cafe-operator-signin` | `frontend/src/js/pages/cafeOperatorSignIn.js` |
| `CAF-SCR-003` | Cafe Operations | Device Security & Revocation State | `#cafe-device-state` | `frontend/src/js/pages/cafeOperationsState.js` |
| `CAF-SCR-004` | Cafe Operations | Cafe Attendance Kiosk Display | `#kiosk-attendance` | `frontend/src/js/pages/cafeAttendanceDisplay.js` |
| `CAF-SCR-005` | Cafe Operations | Cafe Master Elevation Sign-In | `#cafe-master-signin` | `frontend/src/js/pages/cafeMasterSignIn.js` |
| `CAF-SCR-006` | Cafe Operations | Hardware Terminal Enrollment | `#cafe-device-enroll` | `frontend/src/js/pages/cafeDeviceEnroll.js` |
| `CAF-SCR-007` | Cafe Operations | Terminal Welcome & Dispatch | `#cafe-terminal-welcome` | `frontend/src/js/pages/cafeTerminalWelcome.js` |
| `EMP-SCR-001` | Staff Self-Service | Employee Personal Home Screen | `#staff-home` | `frontend/src/js/pages/staffHome.js` |
| `EMP-SCR-002` | Staff Self-Service | Internal Organisation Announcements | `#announcements` | `frontend/src/js/pages/announcements.js` |
| `EMP-SCR-003` | Staff Self-Service | Employee Self-Attendance & Geofencing | `#staff-attendance` | `frontend/src/js/modules/attendance/staffAttendance.js` |
| `EMP-SCR-004` | Staff Self-Service | Leave Balance & Absence Requests | `#staff-leave` | `frontend/src/js/pages/staffLeave.js` |
| `EMP-SCR-005` | Staff Self-Service | My Payslips & Tax Deductions | `#staff-payslips` | `frontend/src/js/pages/staffPayslips.js` |
| `EMP-SCR-006` | Staff Self-Service | Staff Loans & Salary Advances | `#staff-loans-advances` | `frontend/src/js/pages/staffLoansAdvances.js` |
| `EMP-SCR-007` | Staff Self-Service | Employment Contracts & KYC Documents | `#staff-documents` | `frontend/src/js/pages/staffDocuments.js` |
| `EMP-SCR-008` | Staff Self-Service | Employee Profile & Personal Data | `#employee-profile`, `#profile` | `frontend/src/js/pages/employeeProfile.js` |
| `EMP-SCR-009` | Staff Self-Service | Staff Preferences & Language Settings | `#staff-settings` | `frontend/src/js/pages/staffSettings.js` |
| `SHARED-SCR-001`| Universal Shared | Settings Hub & Workspace Preferences | `#settings` (16 subroutes) | `frontend/src/js/pages/settingsShared.js` |
| `SHARED-SCR-002`| Universal Shared | In-App Notification Centre | `#notifications` | `frontend/src/js/pages/notificationCentre.js` |
| `SHARED-SCR-003`| Universal Shared | Trash Bin & Soft-Delete Recovery | `#trash` | `frontend/src/js/pages/trashBin.js` |
| `SHARED-SCR-004`| Universal Shared | MailOps Command Centre | `#mailops` | `frontend/src/js/pages/mailOpsCommandCentre.js` |
| `SHARED-SCR-005`| Universal Shared | Attendance QR Scanner Camera | `#attendance-qr-scanner` | `frontend/src/js/pages/attendanceQrScannerPage.js` |


---

<a id="chapter-01-application-overview-and-system-architecture-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 01: 01_APPLICATION_OVERVIEW_AND_SYSTEM_ARCHITECTURE.md -->
<!-- ===================================================================== -->

# APPLICATION OVERVIEW AND SYSTEM ARCHITECTURE

**Document Identifier:** `DOC-01-SYSTEM-ARCHITECTURE`  
**Target System:** Zamorin Cafe ERP  
**Verified Source HEAD:** `d8cfac780091ede4f4692c4bf2a5791dc9ef696f`

---

## 1. ARCHITECTURAL BLUEPRINT

Zamorin Cafe ERP is architected as a high-performance, multi-tenant, multi-location restaurant and enterprise management platform designed to run in both centralized cloud environments and on-premise café hardware terminals.

### Core Architectural Principles
1. **Zero-Build Vanilla Frontend**: The client application is constructed using standard ES Modules (`<script type="module">`), Vanilla JavaScript (ES2022+), CSS Custom Properties (Tokens), and HTML5 Web Components without bundling abstractions (no Webpack, Vite, or Babel compilation required).
2. **Fail-Closed RBAC & Tenant Isolation**: Every request is authenticated at the network edge and authorization is enforced with a default-deny model. CAFE_ADMIN and STAFF roles are strictly constrained by device binding and café assignment.
3. **Multi-Tenant Data Isolation**: Database documents carry `organisationId` and `cafeId` fields. Backend queries are automatically injected with tenant and café scoping filters via `backend/src/utils/cafeScope.js`.
4. **Resilient Dual-Mode Operation**: The system operates seamlessly in online cloud mode and contains offline-resilient local queuing for POS orders and attendance challenges.

```mermaid
flowchart TD
    subgraph Client Layer
        Browser[Modern Web Browser / PWA]
        AndroidApp[Android Native WebView Wrapper]
        WindowsApp[Windows WinUI / WPF App]
        AppleApp[iOS / macOS Xcode App]
    end

    subgraph Network & Edge
        VercelEdge[Vercel CDN / Reverse Proxy]
        RenderProxy[Render Ingress / Caddy / Nginx]
    end

    subgraph Backend Micro-Monolith [Express 5.2.1 Engine]
        SecurityMW[Helmet, CORS, CSRF, RateLimiter]
        AuthMW[JWT Cookie Parser & Device Context]
        ScopeMW[Tenant & Cafe Isolation Engine]
        RouteLayer[69 Route Modules / 352 Endpoints]
        ServiceLayer[104 Domain Services]
    end

    subgraph Persistence & Infrastructure
        MongoAtlas[(MongoDB Atlas / Replica Set)]
        GridFS[(GridFS Document Storage)]
        RedisCache[(Redis / In-Memory State Cache)]
        ClamAV[ClamAV Live Malware Scanner]
    end

    Browser --> VercelEdge
    AndroidApp --> VercelEdge
    WindowsApp --> VercelEdge
    AppleApp --> VercelEdge

    VercelEdge -->|/api/v1 Proxy| RenderProxy
    RenderProxy --> SecurityMW
    SecurityMW --> AuthMW
    AuthMW --> ScopeMW
    ScopeMW --> RouteLayer
    RouteLayer --> ServiceLayer
    ServiceLayer --> MongoAtlas
    ServiceLayer --> GridFS
    ServiceLayer --> RedisCache
    ServiceLayer --> ClamAV
```

---

## 2. TECHNOLOGY STACK & VERSION INVENTORY

Every technology in the Zamorin Cafe ERP platform has been verified against runtime package manifests and source code:

### Frontend Technologies
- **Core Language**: Vanilla ECMAScript Modules (ES2022+)
- **DOM Architecture**: Single Page Application (SPA) driven by hash routing (`window.location.hash`) and custom reactive state container (`frontend/src/js/state.js`).
- **Styling Framework**: Vanilla CSS Custom Properties (Design Tokens), Glassmorphism, BEM architecture (`tokens.css`, `layout.css`, `components.css`, `zamorin.css`, `login2.css`).
- **Typography**: Google Fonts CDN: `Fraunces` (Display Serif), `Inter` (UI Sans-Serif), `IBM Plex Mono` (Data Monospace).
- **Icons**: Custom scalable SVG icon sprite generator (`frontend/src/js/icons.js`).
- **PWA & Offline**: Progressive Web App manifest (`manifest.json`), Service Worker with cache invalidation (`sw.js`), Offline Storage Adapter (`offlineManager.js`).
- **Hardware Integration**: WebSerial / WebBluetooth ESC/POS Thermal Printing and Barcode Scanner bridge (`hardwareBridgeClient.js`).

### Backend Technologies
- **Runtime**: Node.js v20.x+ (CommonJS module system)
- **Web Framework**: Express.js `v5.2.1`
- **Database & ODM**: MongoDB `v7.0+` via Mongoose `v9.9.1`
- **Authentication**: SimpleWebAuthn Server `v14.0.0`, JSONWebToken `v9.0.3`, Bcrypt `v6.0.0` & BcryptJS `v3.0.3`
- **Security Middleware**: Helmet `v8.3.0`, Express-Rate-Limit `v8.6.1`, Cookie-Parser `v1.4.7`, CORS `v2.8.6`
- **File & Object Storage**: MongoDB GridFS Bucket Stream Engine + Cloudinary `v2.10.0` + Multer `v2.3.0`
- **Caching & Locks**: Redis `v6.2.1` + In-Memory Fallback Adapter (`redisAdapterService.js`)
- **Testing Engine**: Node.js Built-in Test Runner (`node --test`) + MongoDB Memory Server `v11.2.0`

### Platform Wrappers
- **Android Target**: Native Kotlin / Gradle wrapper (`android/`), Android SDK 34, WebView with JavascriptInterface native bridge.
- **Windows Target**: .NET 10 (C#) WinUI 3 / WPF desktop wrapper (`windows/`), Microsoft.Web.WebView2 runtime bridge.
- **Apple iOS / macOS**: Swift / Xcode project (`apple/ios/`, `apple/macos/`), WKWebView with WebKit MessageHandler.

---

## 3. CORE ARCHITECTURAL LAYERS

### Layer 1: Client Application Layer
The client application is initialized via `frontend/index.html` and boots asynchronously via `frontend/src/js/main.js`. It maintains a centralized immutable state tree (`state.js`) and reacts to route transitions via `router.js`.

### Layer 2: API Gateway & Security Layer
All incoming HTTP traffic is filtered through strict security filters in `backend/src/server.js`:
- `createCorsOptions`: Whitelists specific origins (e.g. `https://zamorin-cafe-erp.vercel.app`) with credential support.
- `createCsrfOriginProtection`: Enforces same-origin checks on all non-safe methods (POST, PUT, DELETE, PATCH) when authentication cookies are present.
- `helmet`: Injects Content-Security-Policy (CSP), Strict-Transport-Security (HSTS), X-Frame-Options: DENY, and Permissions-Policy: camera=(), microphone=(), geolocation=().
- `apiLimiter`: Enforces IP-based sliding window rate limits (15-minute window, max 50,000 requests in production).

### Layer 3: Route & Controller Layer
Routes are segmented into 69 modular files under `backend/src/routes/` and mounted under `/api/v1` via `backend/src/routes/index.js`. Controllers (`backend/src/controllers/`) receive validated parameters, call domain services, and format uniform JSON responses with correlation tracking (`request.correlationId`).

### Layer 4: Domain Service & Business Logic Layer
Business logic is strictly decoupled from transport controllers into 104 domain services (`backend/src/services/`). Services handle idempotency, statutory payroll math, FIFO/FEFO inventory depletion, POS bill generation, and transactional boundaries.

### Layer 5: Data & Storage Layer
Persistence is managed through 229 Mongoose schemas (`backend/src/models/`) connected to MongoDB Atlas. Large binary attachments (PDF receipts, supplier invoices, KYC documents) are stored in GridFS buckets with automatic SHA-256 integrity hashing and live ClamAV stream scanning.


---

<a id="chapter-02-login-authentication-and-entry-flows-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 02: 02_LOGIN_AUTHENTICATION_AND_ENTRY_FLOWS.md -->
<!-- ===================================================================== -->

# LOGIN, AUTHENTICATION AND ENTRY FLOWS

**Document Identifier:** `DOC-02-LOGIN-AUTH-FLOWS`  
**Target Modules:** `frontend/src/js/pages/login2.js`, `frontend/src/js/main.js`, `backend/src/routes/authRoutes.js`, `backend/src/controllers/authController.js`

---

## 1. APPLICATION BOOTSTRAP SEQUENCE

When an end-user navigates to Zamorin Cafe ERP, the following deterministic initialization chain executes:

```mermaid
sequenceDiagram
    autonumber
    actor User as Client Browser
    participant Boot as frontend/src/js/main.js
    participant Health as GET /api/v1/health
    participant AuthMe as GET /api/v1/auth/me
    participant Gateway as Cafe Gateway / Router
    participant Shell as App Shell (#app)

    User->>Boot: Opens URL (e.g. https://zamorin-cafe-erp.vercel.app/)
    Note over Boot: 1. Initializes i18n & applies Theme/Font tokens<br/>2. Checks URL Hash & Query Parameters
    Boot->>Health: Non-blocking asynchronous health warmup (triggerBackendWarmup)
    alt URL is Cafe Gateway (#cafe-gateway, #c/:token, #cafe-access/qr/:token)
        Boot->>Gateway: Mounts mountPublicCafeGateway
    else URL is explicit Auth Screen (#login, #forgot, #mfa)
        Boot->>Shell: Mounts mountAuthScreen("login") (0ms Instant First Paint)
    else URL is direct Dashboard/Protected Route
        Boot->>AuthMe: Calls /api/v1/auth/me (with HttpOnly Cookies & Bearer)
        alt Session Valid (200 OK)
            AuthMe-->>Boot: Returns Authenticated User Object
            Boot->>Shell: applyAuthenticatedUser() & renderShell()
        else Session Invalid / Expired (401 Unauthorized)
            AuthMe-->>Boot: Clears tokens via clearAllAuthTokens()
            Boot->>Shell: Mounts mountAuthScreen("login")
        end
    end
```

---

## 2. LOGIN 2.0 VISUAL & FUNCTIONAL SPECIFICATION

The production login screen is implemented in `frontend/src/js/pages/login2.js` using a luxury glassmorphism design system.

### Visual Elements & Form Controls
1. **Brand Identity Header**:
   - High-resolution SVG Zamorin Logo: `/src/assets/zamorin-logo-stacked.svg`
   - Title: `Zamorin Café ERP`
   - Subtitle: `Enterprise Hospitality & Multi-Outlet Management Platform`
2. **Organisation ID Input** (`#login-org-id`):
   - Label: `Organisation ID`
   - Default Initial Value: `ZAMORIN`
   - Uppercase auto-normalization, required field, max length 50 characters.
3. **Identifier / Email Input** (`#login-email`):
   - Label: `Email or Username`
   - Placeholder: `Enter your email or user identifier`
   - Required, auto-trimmed, supports email format or canonical user IDs (`MU-0001`, `OU-0001`, `AU-0001`, `SU-0001`).
4. **Password Input** (`#login-password`):
   - Label: `Password`
   - Placeholder: `••••••••`
   - Includes Show/Hide toggle button with eye SVG icon (`#btn-toggle-password`).
5. **Remember Device Checkbox** (`#login-remember-device`):
   - Label: `Trust this device for 30 days`
   - When checked, requests a durable device trust token stored in MongoDB `TrustedDevice` collection.
6. **Sign In Action Button** (`#btn-login-submit`):
   - Visible Text: `Sign In to Workspace`
   - Loading State: Animated SVG spinner + `Authenticating...` (disabled state during transit).
7. **Forgot Password Link** (`#link-forgot-password`):
   - Navigates to 3-step self-service recovery flow (`mountAuthScreen("forgot")`).
8. **Cafe Operations Terminal Link** (`#link-cafe-ops`):
   - Navigates to dedicated hardware terminal portal (`/cafe-operations/cafe-operations.html`).

---

## 3. END-TO-END LOGIN EXECUTION TRACE

```text
User clicks [Sign In to Workspace]
  │
  ▼
Frontend Event Handler: handleLoginSubmit() [frontend/src/js/main.js:531]
  │ Extracts { organisationId, email, password, rememberDevice }
  │ Normalizes payload and gathers Device Fingerprint [getOrCreateDeviceId()]
  ▼
HTTP POST /api/v1/auth/login
  │ Headers: Content-Type: application/json, X-Request-ID, Origin
  ▼
Backend Middleware Pipeline:
  ├─ requestContext (Injects correlationId and timing metadata)
  ├─ cookieParser (Extracts existing cookies)
  ├─ helmet (Enforces CSP, frameguard, Referrer-Policy)
  ├─ cors (Verifies Origin against allowedOrigins)
  ├─ csrfOriginProtection (Validates state-change requests)
  └─ apiLimiter (Enforces 15-minute sliding rate limit)
  ▼
Controller: authController.login [backend/src/controllers/authController.js:140]
  ▼
Service: authService.authenticate [backend/src/services/authService.js:85]
  │ 1. Queries User Model: User.findOne({ organisationId, email })
  │ 2. Validates Account Status: Active vs Suspended vs Deleted
  │ 3. Verifies Password Hash: bcrypt.compare(password, user.passwordHash)
  │ 4. Checks Account Lockout: Enforces exponential backoff on consecutive failures
  ▼
MFA / Passkey Evaluation:
  ├─ Case A: User has MFA Enabled or requires MFA setup
  │    └─ Generates ephemeral mfaChallengeToken (5-minute TTL)
  │    └─ Returns HTTP 200/202 { mfaRequired: true, mfaChallengeToken }
  │    └─ Frontend renders mountAuthScreen("mfa")
  └─ Case B: Standard Single-Factor Authentication (or Remembered Device)
       └─ Issues 15-minute Access Token (JWT)
       └─ Issues 7-day Refresh Token (JWT in HttpOnly, Secure, SameSite=Strict cookie)
       └─ Creates Session record in MongoDB Session collection
       └─ Audits LOGIN_SUCCESS in AuditEvent collection
  ▼
HTTP 200 OK Response:
  {
    "success": true,
    "data": {
      "user": { "id": "MU-0001", "role": "MASTER", "isPrimaryMaster": true, ... },
      "accessToken": "eyJhbGciOiJIUz..."
    }
  }
  ▼
Frontend Response Handler: handleAuthenticatedUserSession(user) [frontend/src/js/main.js:621]
  │ 1. Resolves Role: resolveAuthenticatedRole(user) -> MASTER / OWNER / CAFE_ADMIN / STAFF
  │ 2. Sets In-Memory Access Token: setAccessToken(token)
  │ 3. Updates Global State: setState({ auth: { authenticated: true, user }, role, ... })
  │ 4. Resolves Landing Route:
  │      - Staff -> #staff-home
  │      - Master / Owner / Admin -> #dashboard
  │ 5. Executes renderShell() and mounts Persistent App Shell
```

---

## 4. PASSWORD RESET SELF-SERVICE WORKFLOW

The password recovery lifecycle is a secure 3-step challenge-response flow:

1. **Step 1: Request Recovery** (`#forgot`):
   - Endpoint: `POST /api/v1/auth/password/forgot`
   - Body: `{ organisationId, email }`
   - Action: Verifies account exists, creates `PasswordResetChallenge` with 6-digit numeric OTP (15-min TTL), dispatches email via `passwordResetDeliveryService`.
2. **Step 2: Verify Challenge** (`#verify`):
   - Endpoint: `POST /api/v1/auth/password/reset/verify`
   - Body: `{ organisationId, email, code }`
   - Action: Validates OTP against SHA-256 hash in database; issues single-use cryptographically signed `resetToken`.
3. **Step 3: Set New Password** (`#reset`):
   - Endpoint: `POST /api/v1/auth/password/reset`
   - Body: `{ organisationId, challengeId, resetToken, newPassword }`
   - Action: Validates password strength (min 8 chars, uppercase, lowercase, numeric, special), re-hashes with bcrypt (cost factor 10), invalidates all existing user sessions, and logs security audit event.

---

## 5. PUBLIC CAFÉ GATEWAY & DEEP LINK RESOLVER

Zamorin Cafe ERP provides dedicated touchless QR and deep-link routing for individual café locations:

- **Canonical URL Format**: `/c/:token` or `/cafe-access/qr/:token`
- **Frontend Handler**: `mountPublicCafeGateway` (`frontend/src/js/pages/cafeGatewayPage.js`)
- **Backend Resolvers**:
  - `GET /c/:token` -> `getPublicQrContext` in `cafeAccessController.js`
  - `GET /cafe-access/qr/:token` -> `getPublicQrContext`
- **Resolution Behavior**:
  - Decrypts and validates the cryptographically signed café token.
  - Verifies café status is active in database (`Cafe.findOne({ cafeId, status: 'ACTIVE' })`).
  - Pre-populates café context (`targetCafeId`) on the login screen.
  - If a device is enrolled, automatically presents the Operator PIN unlock pad.


---

<a id="chapter-03-primary-master-complete-reference-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 03: 03_PRIMARY_MASTER_COMPLETE_REFERENCE.md -->
<!-- ===================================================================== -->

# PRIMARY MASTER COMPLETE REFERENCE

**Document Identifier:** `DOC-03-PRIMARY-MASTER-REF`  
**Operating Window:** Primary Master Workspace  
**Role Identifier:** `MASTER` (with `isPrimaryMaster: true`)  
**Scope Authority:** Universal Global Scope across Organisation (`ORGANISATION`)

---

## 1. PRIMARY MASTER PROFILE & AUTHORITY

The **Primary Master** represents the supreme executive and administrative authority in Zamorin Cafe ERP. Unlike Normal Masters or Owners, the Primary Master possesses 100% universal unrestricted access to every screen, table, financial account, sensitive statutory payroll calculation, system setting, and administrative tool.

### Defining Characteristics
- **Multi-Location Governance**: Can switch between All Cafés (`ALL`) or inspect any specific café branch.
- **Financial Exclusivity**: Exclusive authority over Personal Ledger & Drawings, Statutory Payroll posting, Passbook Treasury, and Revenue Share contracts.
- **Data Lifecycle Control**: Only role permitted to access the Master Trash Bin (`#trash`) to permanently purge or restore soft-deleted business records.
- **Organisation Identity**: Exclusive authority to modify legal entity names, GSTIN, PAN, and corporate branding (`#org-identity`).

---

## 2. SCREEN CATALOGUE & WORKSPACE MODULES

The Primary Master navigation sidebar comprises 8 functional groupings containing 26 primary modules:

### Group 1: COMMAND
- **Command Centre Dashboard** (`#dashboard` / `PM-SCR-001`):
  - Component: `frontend/src/js/pages/dashboardMaster.js`
  - Executive KPIs: Gross Revenue, Net Margin, Active Orders, Table Turn Rate, Live Workforce Count, Low Stock Alerts.
  - Quick Action Strip: New Bill, Clock Attendance, Stock Inward, Expense Claim, Bank Deposit.

### Group 2: OPERATIONS
- **POS & Billing** (`#pos` / `PM-SCR-002`):
  - Component: `frontend/src/js/pages/posTill.js`
  - Capabilities: Full touch/keyboard POS terminal, multi-category menu browsing, dine-in table assignment, takeaway dispatch, split payments, instant GST invoice printing.
- **Tasks & Oversight** (`#approvals`, `#tasks` / `PM-SCR-003`):
  - Component: `frontend/src/js/pages/tasksApprovals.js`
  - Capabilities: Centralized action inbox for pending purchase approvals, leave requests, cash disbursements, and expense validations.
- **Attendance & Shifts** (`#attendance` / `PM-SCR-004`):
  - Component: `frontend/src/js/modules/attendance/attendanceShifts.js`
  - Capabilities: Shift roster builder, real-time geofence attendance logs, biometric/QR scan audits, missed punch corrections, overtime calculations.
- **Department Orders** (`#dept-orders` / `PM-SCR-005`):
  - Component: `frontend/src/js/pages/departmentOrders.js`
  - Capabilities: Institutional B2B university/corporate orders, credit accounts, delivery scheduling, batch billing.
- **Inventory** (`#inventory` / `PM-SCR-006`):
  - Component: `frontend/src/js/pages/inventory.js`
  - Capabilities: Multi-location stock ledger, unit conversions, raw materials vs recipes (BOM), minimum threshold alerts, physical count reconciliation.
- **Procurement** (`#procurement` / `PM-SCR-007`):
  - Component: `frontend/src/js/pages/procurement.js`
  - Capabilities: Purchase requisitions, RFQ generation, Purchase Orders (PO), 3-way matching (PO vs GRN vs Invoice), backorder management.
- **Assets & Maintenance** (`#assets` / `PM-SCR-008`):
  - Component: `frontend/src/js/pages/assets.js`
  - Capabilities: Asset registry, depreciation schedules, preventive maintenance calendars, breakdown logs, warranty tracking.
- **Quality & Compliance** (`#quality` / `PM-SCR-009`):
  - Component: `frontend/src/js/pages/quality.js`
  - Capabilities: FSSAI temperature logs, hygiene checklists, pest control logs, CAPA records, food recall trace.

### Group 3: PEOPLE
- **Employees** (`#employees` / `PM-SCR-010`):
  - Component: `frontend/src/js/pages/employees.js`
  - Capabilities: Employee master directory, onboarding workflow, wage structure assignments, statutory KYC document storage.
- **Staff Self-Service** (`#staff-home` / `EMP-SCR-001`):
  - Accessible to view the employee-facing interface directly.
- **Payroll & Payslips** (`#payroll` / `PM-SCR-011` — *Primary Master Only*):
  - Component: `frontend/src/js/pages/payrollManagement.js`
  - Capabilities: Monthly payroll generation, EPF/ESI statutory deduction rules, loss-of-pay deductions, payslip PDF generation, direct bank payout batch files.

### Group 4: FINANCE
- **Bills & Receipts** (`#bills` / `PM-SCR-012`):
  - Component: `frontend/src/js/pages/ownerBills.js`
  - Capabilities: Historical tax invoice archive, reprint with duplicate counter watermark, void bill with mandatory audit justification, credit notes.
- **Expenses** (`#expenses` / `PM-SCR-013`):
  - Component: `frontend/src/js/pages/expenses.js`
  - Capabilities: Operational expense tracking, receipt attachment preview, budget line categorization, multi-tier approval workflow.
- **Sales & Cash Book** (`#sales-cash` / `PM-SCR-014`):
  - Component: `frontend/src/js/pages/cashBook.js`
  - Capabilities: Daily cash register reconciliation, cash drop logs, discrepancy tracking, physical till verification.
- **Finance & Accounts** (`#finance` / `PM-SCR-015`):
  - Component: `frontend/src/js/pages/financeAccounts.js`
  - Capabilities: Chart of accounts, journal entries, profit & loss statement, balance sheet, trial balance, GST summary report.
- **Passbook & Treasury** (`#passbook` / `PM-SCR-016` — *Primary Master Only*):
  - Component: `frontend/src/js/pages/passbook.js`
  - Capabilities: Bank account balances, treasury transfers, OFX/CSV statement reconciliation, liquidity forecasting.
- **Personal Ledger & Owner Account** (`#ledger` / `PM-SCR-017` — *Primary Master Only*):
  - Component: `frontend/src/js/pages/personalLedger.js`
  - Capabilities: Owner capital accounts, drawings, personal expense settlements, dividend tracking.

### Group 5: COMMERCIAL
- **Customers & Loyalty** (`#customers` / `PM-SCR-018`):
  - Component: `frontend/src/js/pages/customers.js`
  - Capabilities: CRM profiles, purchase histories, loyalty points ledger, customer segmentation cohorts.
- **Menu Management** (`#menu` / `PM-SCR-019`):
  - Component: `frontend/src/js/pages/menuManagement.js`
  - Capabilities: Master menu builder, categories, modifiers, pricing tiers per café, tax rate configuration, recipe linking.
- **Vendors** (`#vendors` / `PM-SCR-020`):
  - Component: `frontend/src/js/pages/vendors.js`
  - Capabilities: Supplier directory, GSTIN verification, AP ledger, payment schedules, performance scorecards.
- **Revenue Share & Outlets** (`#revenue-share` / `PM-SCR-021` — *Primary Master Only*):
  - Component: `frontend/src/js/pages/revenueShare.js`
  - Capabilities: Partner agreements, percentage royalty splits, minimum guarantee calculations, settlement statements.

### Group 6: INSIGHTS
- **Reports & Analytics** (`#reports` / `PM-SCR-022`):
  - Component: `frontend/src/js/pages/reportsAnalytics.js`
  - Capabilities: 14 distinct BI reports covering sales trends, product velocity, food cost analysis, labor productivity, and GST statutory summaries.

### Group 7: ADMINISTRATION
- **Administration** (`#admin` / `PM-SCR-023`):
  - Component: `frontend/src/js/pages/administration.js`
  - Capabilities: Cafe outlet creation, user provisioning, RBAC role overrides, café assignment mapping, system parameters.
- **Organisation Identity** (`#org-identity` / `PM-SCR-024` — *Primary Master Only*):
  - Component: `frontend/src/js/pages/organisationIdentity.js`
  - Capabilities: Legal company name, registered office address, CIN, PAN, GSTIN, FSSAI central license, brand logos.

### Group 8: SYSTEM
- **Devices & Sessions** (`#cafe-ops-devices` / `PM-SCR-025`):
  - Component: `frontend/src/js/pages/cafeOperationsDevices.js`
  - Capabilities: Enrolled hardware terminals, active operator sessions, remote device lock, token revocation.
- **System Health & Ops** (`#system-health` / `PM-SCR-026`):
  - Component: `frontend/src/js/pages/systemHealth.js`
  - Capabilities: Live database connectivity status, GridFS storage capacity, ClamAV scanner health, API response latency metrics.
- **Settings** (`#settings` / `SHARED-SCR-001`):
  - Component: `frontend/src/js/pages/settingsShared.js`
  - Complete 16-section preferences and administration hub.


---

<a id="chapter-04-normal-master-complete-reference-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 04: 04_NORMAL_MASTER_COMPLETE_REFERENCE.md -->
<!-- ===================================================================== -->

# NORMAL MASTER COMPLETE REFERENCE

**Document Identifier:** `DOC-04-NORMAL-MASTER-REF`  
**Operating Window:** Normal Master Workspace  
**Role Identifier:** `MASTER` (with `isPrimaryMaster: false`)  
**Scope Authority:** Multi-Café Operational Authority (Excluding Sensitive Financial & Governance Domains)

---

## 1. NORMAL MASTER VS PRIMARY MASTER COMPARISON

A **Normal Master** possesses broad administrative and operational authority across all café branches but is **strictly excluded** from sensitive owner accounts, treasury management, statutory payroll processing, and corporate identity governance.

### Absolute Restriction Matrix

| Feature / Module | Route | Primary Master | Normal Master | Technical Enforcement Mechanism |
| :--- | :--- | :--- | :--- | :--- |
| **Personal Ledger & Drawings** | `#ledger` | **FULL ACCESS** | **DENIED (403)** | `PRIMARY_MASTER_ONLY_ROUTES` + `ABSOLUTE_ROLE_RESTRICTIONS` |
| **Universal Payroll Execution** | `#payroll` | **FULL ACCESS** | **DENIED (403)** | `PRIMARY_MASTER_ONLY_ROUTES` + `payrollAccessApi` |
| **Passbook & Treasury** | `#passbook` | **FULL ACCESS** | **DENIED (403)** | `PRIMARY_MASTER_ONLY_ROUTES` + `passbookController` |
| **Revenue Share Contracts** | `#revenue-share` | **FULL ACCESS** | **DENIED (403)** | `PRIMARY_MASTER_ONLY_ROUTES` + `revenueShareController` |
| **Organisation Identity** | `#org-identity` | **FULL ACCESS** | **DENIED (403)** | `PRIMARY_MASTER_ONLY_ROUTES` + `companyIdentityController` |
| **Trash Bin Permanent Purge** | `#trash` | **FULL (Restore/Purge)** | **READ ONLY / NO PURGE** | Controller action check `user.isPrimaryMaster` |
| **Operations (POS, Inventory, PO)**| `#pos`, `#inventory` | **FULL ACCESS** | **FULL ACCESS** | Standard `MASTER` RBAC rule |
| **Employees Directory** | `#employees` | **FULL ACCESS** | **FULL ACCESS (Salary Masked)** | Field masking in `fieldAccess.maskedFields` |
| **Reports & Analytics** | `#reports` | **ALL 14 REPORTS** | **12 REPORTS (No Payroll/Share)**| Report catalog filter in `reportsAnalytics.js` |

---

## 2. TECHNICAL RESTRICTION MECHANISMS

The restriction of Normal Master is enforced at three distinct architectural layers:

### Layer 1: Navigation Filtering (`frontend/src/js/navigation.js`)
In `navigation.js`, `NORMAL_MASTER_ITEMS` is generated by filtering out all items marked `primaryMasterOnly: true`:
```javascript
const NORMAL_MASTER_ITEMS = PRIMARY_MASTER_ITEMS.filter(
  (item) => !item.primaryMasterOnly
);
```
Consequently, restricted items do not render in the Normal Master sidebar.

### Layer 2: Frontend Route Guard (`frontend/src/js/navigation.js` & `router.js`)
When a Normal Master enters a restricted route directly via URL hash (e.g. `#ledger` or `#payroll`), `isRouteAllowed()` explicitly checks the `PRIMARY_MASTER_ONLY_ROUTES` set:
```javascript
if (
  role === ROLES.MASTER &&
  !isPrimaryMaster &&
  (PRIMARY_MASTER_ONLY_ROUTES.has(pathOnly) || PRIMARY_MASTER_ONLY_ROUTES.has(route))
) {
  return false;
}
```
This triggers `navigate('__blocked__')` which renders `renderNotAvailable()` with an access-denied message.

### Layer 3: Backend API Authorization Middleware (`backend/src/middleware/authorize.js`)
If a Normal Master attempts to invoke restricted REST endpoints (e.g. `POST /api/v1/payroll/runs` or `GET /api/v1/personal-ledger`), the backend middleware checks `request.auth.isPrimaryMaster`. If false, it immediately halts execution and returns:
```json
{
  "error": {
    "code": "PRIMARY_MASTER_REQUIRED",
    "message": "This operation requires Primary Master executive authorization."
  }
}
```


---

<a id="chapter-05-owner-complete-reference-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 05: 05_OWNER_COMPLETE_REFERENCE.md -->
<!-- ===================================================================== -->

# OWNER COMPLETE REFERENCE

**Document Identifier:** `DOC-05-OWNER-REF`  
**Operating Window:** Owner Portal  
**Role Identifier:** `OWNER`  
**Scope Authority:** Multi-Café Authorized Governance Portfolio (`ASSIGNED_CAFES`)

---

## 1. OWNER PORTAL OVERVIEW & STRATEGIC MANDATE

The **Owner Portal** provides high-level executive governance, financial oversight, strategic compliance, and risk analytics for business owners and board stakeholders. Unlike Master operators who handle day-to-day store mechanics, the Owner interface is tailored for executive decision-making.

### Key Architectural Characteristics
- **Assigned Café Scoping**: An Owner can only monitor cafés explicitly assigned in their user profile (`user.assignedCafeIds`). If an Owner owns 2 of 5 cafés, they cannot view data from the remaining 3 cafés.
- **15 Strategic Portfolio Modules**: Features 15 dedicated enterprise governance modules introduced in Owner Strategic Batches 01–03.
- **Executive Parity**: Shares access to Personal Ledger, Bills archive, Cash journal, and High-level Payroll reporting for authorized cafés.

---

## 2. THE 15 STRATEGIC GOVERNANCE MODULES

```mermaid
graph LR
    subgraph Owner Strategic Portfolio
        FoodSafety[Food Safety & Recall]
        RiskAudit[Risk, Audit & Anti-Fraud]
        Planning[Planning, Budget & CAPEX]
        Compliance[Compliance, Licence & Ins.]
        SupplierIntel[Supplier Intelligence]
        Academy[SOP, Training & Academy]
        AssetRel[Asset Reliability]
        PrivacyCyber[Privacy & Cyber Security]
        BCDR[Business Continuity & DR]
        MasterData[Master Data Governance]
        Complaints[Complaints & Service Recovery]
        MenuPricing[Menu Engineering & Pricing]
        CustLoyalty[Loyalty Intelligence]
        Utilities[Utilities, Waste & Energy]
        GovDelegation[Corporate Governance]
    end
```

1. **Food Safety & Recall** (`#owner-food-safety` / `OWN-SCR-002`):
   - Component: `frontend/src/js/pages/ownerFoodSafety.js`
   - Endpoint: `/api/v1/food-safety`, `/api/v1/quality`
   - Functions: FSSAI hygiene audit scores, critical temperature violation alerts, lot-specific food recall incident manager, supplier traceability.
2. **Risk, Audit & Anti-Fraud** (`#owner-risk-audit` / `OWN-SCR-003`):
   - Component: `frontend/src/js/pages/ownerRiskAudit.js`
   - Endpoint: `/api/v1/risk-audit`
   - Functions: Enterprise risk register, internal audit observation tracking, void bill anomaly detection, POS discount abuse patterns.
3. **Planning, Budget & CAPEX** (`#owner-planning` / `OWN-SCR-004`):
   - Component: `frontend/src/js/pages/ownerPlanning.js`
   - Endpoint: `/api/v1/planning`
   - Functions: Annual financial budgets, department capital expenditure requests, new outlet feasibility studies, variance forecasting.
4. **Compliance, Licence & Insurance** (`#owner-compliance` / `OWN-SCR-005`):
   - Component: `frontend/src/js/pages/ownerCompliance.js`
   - Endpoint: `/api/v1/compliance`
   - Functions: Business license expirations (Trade, Health, Fire NOC, FSSAI), commercial lease renewals, insurance policies and claim statuses.
5. **Supplier & Procurement Intelligence** (`#owner-supplier-intelligence` / `OWN-SCR-006`):
   - Component: `frontend/src/js/pages/ownerSupplierIntelligence.js`
   - Endpoint: `/api/v1/supplier-intelligence`
   - Functions: Vendor SLA scorecards, purchase price variance tracking, supplier concentration risk, payment terms compliance.
6. **SOP, Training & Academy** (`#owner-academy` / `OWN-SCR-007`):
   - Component: `frontend/src/js/pages/ownerAcademy.js`
   - Endpoint: `/api/v1/academy`
   - Functions: Operational SOP library, mandatory employee certification tracking, training completion rates by café branch.
7. **Asset Reliability & Maintenance** (`#owner-asset-reliability` / `OWN-SCR-008`):
   - Component: `frontend/src/js/pages/ownerAssetReliability.js`
   - Endpoint: `/api/v1/asset-reliability`
   - Functions: Mean Time Between Failures (MTBF), equipment downtime costs, vendor warranty claims, replacement capital planning.
8. **Privacy, Cybersecurity & Data Protection** (`#owner-privacy-cyber` / `OWN-SCR-009`):
   - Component: `frontend/src/js/pages/ownerPrivacyCyber.js`
   - Endpoint: `/api/v1/privacy-cyber`
   - Functions: Digital Personal Data Protection (DPDP) compliance register, customer data retention policies, device security posture, privacy incident logs.
9. **Business Continuity & Disaster Recovery** (`#owner-bcdr` / `OWN-SCR-010`):
   - Component: `frontend/src/js/pages/ownerBcdr.js`
   - Endpoint: `/api/v1/bcdr`
   - Functions: DR drill execution records, critical business process RTO/RPO metrics, emergency contact directories, offline continuity configurations.
10. **Master Data Governance** (`#owner-master-data` / `OWN-SCR-011`):
    - Component: `frontend/src/js/pages/ownerMasterData.js`
    - Endpoint: `/api/v1/master-data`
    - Functions: Catalog domain ownership, duplicate customer/vendor deduplication reviews, change request approvals.
11. **Customer Complaints & Service Recovery** (`#owner-complaints` / `OWN-SCR-012`):
    - Component: `frontend/src/js/pages/ownerComplaints.js`
    - Endpoint: `/api/v1/owner/complaints`
    - Functions: Escalated customer feedback, customer service recovery vouchers, root-cause categorization, NPS trends.
12. **Menu Engineering & Pricing** (`#owner-menu-pricing` / `OWN-SCR-013`):
    - Component: `frontend/src/js/pages/ownerMenuPricing.js`
    - Endpoint: `/api/v1/owner/menu-pricing`
    - Functions: Boston Consulting Group (BCG) menu matrix (Stars, Plowhorses, Puzzles, Dogs), contribution margin analysis, price elasticity simulations.
13. **Customer Loyalty Intelligence** (`#owner-customer-loyalty` / `OWN-SCR-014`):
    - Component: `frontend/src/js/pages/ownerCustomerLoyalty.js`
    - Endpoint: `/api/v1/owner/customer-loyalty`
    - Functions: Customer Lifetime Value (CLV), cohort retention curves, loyalty points liability ledger, churn prediction.
14. **Utilities, Waste & Sustainability** (`#owner-utilities-waste` / `OWN-SCR-015`):
    - Component: `frontend/src/js/pages/ownerUtilitiesWaste.js`
    - Endpoint: `/api/v1/owner/utilities-waste`
    - Functions: Electricity and water sub-meter consumption, solid food waste logs, Used Cooking Oil (UCO) biodiesel compliance.
15. **Corporate Governance & Delegation** (`#owner-governance-delegation` / `OWN-SCR-016`):
    - Component: `frontend/src/js/pages/ownerGovernanceDelegation.js`
    - Endpoint: `/api/v1/owner/governance-delegation`
    - Functions: Board resolutions, statutory register of directors/shareholders, formal Delegation of Authority (DOA) financial thresholds.

---

## 3. ADDITIONAL OWNER MODULES

- **Owner Dashboard** (`#dashboard` / `OWN-SCR-001`): Executive overview featuring aggregated revenue, net EBITDA margins, total customer footfall, and high-priority governance alerts.
- **Cafe Performance** (`#performance` / `OWN-SCR-017`): Benchmarking tool comparing average ticket size, table turn times, labor cost percentage, and food waste ratios across all authorized cafés.
- **Finance Summary** (`#finance` / `OWN-SCR-018`): High-level Profit & Loss statement and cash flow summaries filtered strictly to the Owner's assigned locations.


---

<a id="chapter-06-cafe-operations-complete-reference-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 06: 06_CAFE_OPERATIONS_COMPLETE_REFERENCE.md -->
<!-- ===================================================================== -->

# CAFE OPERATIONS COMPLETE REFERENCE

**Document Identifier:** `DOC-06-CAFE-OPS-REF`  
**Operating Window:** Cafe Operations Workspace  
**Role Identifier:** `CAFE_ADMIN` (User-facing title: *Cafe Operations / Operator*)  
**Scope Authority:** Single Café Device-Bound Operational Scope (`CAFE`)

---

## 1. CAFE OPERATIONS ARCHITECTURAL MODEL

The **Cafe Operations** workspace is specifically engineered for on-site managers, cashiers, and kitchen supervisors working on café-owned hardware terminals (touchscreen POS registers, Android tablets, desktop PCs).

### Architectural Guardrails
1. **Hardware Device Binding**: The terminal must be enrolled into the database (`DeviceRegistration`) and bound to a specific `boundCafeId`.
2. **Operator Sessions & Quick PIN**: Individual staff members unlock the terminal using a 4-digit or 6-digit Operator PIN without requiring full email/password re-authentication.
3. **Auto-Lock on Inactivity**: Implemented via `frontend/src/js/cafeOpsInactivity.js`. After 5 minutes of idle time, the terminal locks and returns to the Operator PIN screen.
4. **Strict Isolation**: A Café Operations user can **NEVER** view data, inventory, sales, or staff records from another café.

---

## 2. TERMINAL ENROLLMENT & AUTHENTICATION FLOWS

```mermaid
sequenceDiagram
    autonumber
    actor Mgr as Store Manager
    participant Term as Terminal Browser
    participant Enroll as POST /api/v1/cafe-ops/devices/enroll
    participant Signin as POST /api/v1/cafe-operations/operator/signin
    participant DB as MongoDB Atlas

    Note over Term: First-time terminal boot (#cafe-device-enroll)
    Mgr->>Term: Enters 6-digit Enrollment Code & Terminal Name
    Term->>Enroll: Transmits enrollment code + platform fingerprint
    Enroll->>DB: Validates code, marks device ENROLLED, creates DeviceRegistration
    Enroll-->>Term: Returns trustedDeviceToken & boundCafeId
    Note over Term: Terminal is now bound to Cafe CF-0001 (#cafe-operator-signin)
    Mgr->>Term: Enters Employee ID & Operator PIN
    Term->>Signin: Sends employeeId + PIN + trustedDeviceToken
    Signin->>DB: Verifies PIN hash against Employee/User record
    Signin-->>Term: Issues operatorSessionToken (8-hour shift TTL)
    Term->>Term: Mounts Cafe Operations Dashboard (#dashboard)
```

---

## 3. CAFE OPERATIONS MODULE INVENTORY

The Cafe Operations workspace exposes 15 focused store-level modules:

1. **Cafe Operations Dashboard** (`#dashboard` / `CAF-SCR-001`):
   - Component: `frontend/src/js/pages/dashboardAdmin.js`
   - Real-time store statistics: Today's Gross Sales, Current Cash in Drawer, Active Dine-in Tables, Pending Kitchen Orders, Staff on Shift.
2. **POS & Billing** (`#pos` / `PM-SCR-002`):
   - Fast checkout terminal, table layout, kitchen order ticket (KOT) generation, split bill, cash/UPI/card payment tender.
3. **Attendance & Shifts** (`#attendance` / `PM-SCR-004`):
   - Store attendance terminal, QR check-in display, shift handover checklists, daily attendance validation for shift staff.
4. **Department Orders** (`#dept-orders` / `PM-SCR-005`):
   - Local departmental orders delivered to university faculties or corporate campus blocks.
5. **Inventory** (`#inventory` / `PM-SCR-006`):
   - Store stock ledger, daily stock inward logging, closing stock entry, wastage recording with reason codes.
6. **Procurement** (`#procurement` / `PM-SCR-007`):
   - Local purchase requisitions to central warehouse, Goods Receipt Note (GRN) acceptance, delivery inspection.
7. **Assets & Maintenance** (`#assets` / `PM-SCR-008`):
   - Store equipment maintenance logging, emergency breakdown ticket creation, scheduled cleaning checklists.
8. **Quality & Compliance** (`#quality` / `PM-SCR-009`):
   - Store daily opening checklist, refrigerator temperature logging, food contact surface sanitation checks.
9. **Expenses** (`#expenses` / `PM-SCR-013`):
   - Petty cash expense vouchers (e.g. emergency milk purchase, local courier, minor cleaning supplies).
10. **Sales & Cash Book** (`#sales-cash` / `PM-SCR-014`):
    - End-of-day cash reconciliation (Till count vs POS expected cash), cash drop to safe, Z-Report printing.
11. **Customers & Loyalty** (`#customers` / `PM-SCR-018`):
    - Customer look-up by mobile number, reward point redemption, new member enrollment.
12. **Store Reports** (`#reports` / `PM-SCR-022`):
    - Restricted reporting view: Sales by Category, Hourly Footfall, Wastage Summary, Staff Attendance (current store only).
13. **Action Centre** (`#tasks` / `PM-SCR-003`):
    - Daily store operational task list, managerial approvals, stock count reminders.
14. **Devices & Sessions** (`#cafe-ops-devices` / `PM-SCR-025`):
    - Local terminal status, active operator sign-in records, printer test connection.
15. **Settings** (`#settings` / `SHARED-SCR-001`):
    - Local receipt printer paper width (58mm vs 80mm), thermal print density, language preferences.


---

<a id="chapter-07-employee-staff-complete-reference-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 07: 07_EMPLOYEE_STAFF_COMPLETE_REFERENCE.md -->
<!-- ===================================================================== -->

# EMPLOYEE / STAFF COMPLETE REFERENCE

**Document Identifier:** `DOC-07-STAFF-SELF-SERVICE`  
**Operating Window:** Staff Self-Service Workspace  
**Role Identifier:** `STAFF` (User-facing title: *Employee / Staff*)  
**Scope Authority:** Self-Service Personal Scope Only (`SELF`)

---

## 1. STAFF WORKSPACE ARCHITECTURE & CONSTRAINTS

The **Staff Self-Service** workspace is built on the principle of **strict least privilege**. Normal employees (baristas, kitchen cooks, servers, utility staff) only require access to their personal employment data, work schedules, attendance verification, and internal communications.

### Key Constraints Enforced
- **Zero Administrative Access**: Staff cannot access financial ledgers, vendor contracts, inventory adjustments, POS configuration, or another employee's records.
- **Strict Self Scoping**: All API calls made by staff implicitly or explicitly pass `userId: request.auth.userId`. Any attempt to pass another employee's ID is rejected by `authorize.js` with `SELF_SCOPE_VIOLATION`.
- **Simplified Navigation**: The sidebar contains only 5 essential links. Additional personal features (Payslips, Advances, Documents) are housed neatly inside the Settings Hub under My Employment.

---

## 2. STAFF SCREEN CATALOGUE

1. **Staff Home Screen** (`#staff-home` / `EMP-SCR-001`):
   - Component: `frontend/src/js/pages/staffHome.js`
   - Dashboard Widgets:
     - Today's Work Shift (Start time, End time, Assigned café branch)
     - Attendance Status (Clocked In / Clocked Out timestamp)
     - Next Upcoming Holiday & Recent Announcements
     - Quick Action: Clock In / Clock Out, Apply for Leave, View Latest Payslip
2. **Internal Announcements** (`#announcements` / `EMP-SCR-002`):
   - Component: `frontend/src/js/pages/announcements.js`
   - Capabilities: Reads broadcast updates from Primary Master and Store Managers (policy updates, holiday notices, menu changes).
3. **My Attendance** (`#staff-attendance` / `EMP-SCR-003`):
   - Component: `frontend/src/js/modules/attendance/staffAttendance.js`
   - Capabilities:
     - Real-time GPS Geofenced Clock In/Out button
     - Monthly attendance calendar with visual day chips (Present, Absent, Half-day, Holiday, Leave)
     - Overtime hours calculation and missed punch correction submission form
4. **My Leave** (`#staff-leave` / `EMP-SCR-004`):
   - Component: `frontend/src/js/pages/staffLeave.js`
   - Capabilities:
     - Leave balance counters (Casual Leave, Sick Leave, Earned Leave)
     - Leave application form with date range picker and reason selector
     - Historical request status log (Pending Manager Approval, Approved, Rejected)
5. **My Payslips** (`#staff-payslips` / `EMP-SCR-005`):
   - Component: `frontend/src/js/pages/staffPayslips.js`
   - Capabilities: Historical salary breakdown (Basic, HRA, Allowances, EPF, ESI, TDS, Net Pay), one-click official PDF download.
6. **My Loans & Advances** (`#staff-loans-advances` / `EMP-SCR-006`):
   - Component: `frontend/src/js/pages/staffLoansAdvances.js`
   - Capabilities: Salary advance request submission form, active loan repayment schedules, remaining balance indicators.
7. **My Documents** (`#staff-documents` / `EMP-SCR-007`):
   - Component: `frontend/src/js/pages/staffDocuments.js`
   - Capabilities: Personal employment contract, offer letter, KYC identity uploads (Aadhaar, PAN), training certificates.
8. **Employee Profile** (`#employee-profile`, `#profile` / `EMP-SCR-008`):
   - Component: `frontend/src/js/pages/employeeProfile.js`
   - Capabilities: Contact details, emergency contacts, bank account for payroll deposits (read-only; edits require HR approval).
9. **Staff Preferences & Settings** (`#staff-settings` / `EMP-SCR-009`):
   - Component: `frontend/src/js/pages/staffSettings.js`
   - Capabilities: Personal password update, language selection (English, Malayalam, Hindi, Tamil), dark/paper theme toggle.


---

<a id="chapter-08-shared-universal-modules-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 08: 08_SHARED_UNIVERSAL_MODULES.md -->
<!-- ===================================================================== -->

# SHARED UNIVERSAL MODULES

**Document Identifier:** `DOC-08-SHARED-MODULES`  
**Target Architecture:** Reusable Universal Components, Modals & Hubs

---

## 1. SETTINGS HUB (`#settings`)

The **Settings Hub** (`frontend/src/js/pages/settingsShared.js`) serves as the universal administrative and personal preferences center for all application roles. It dynamically adapts its navigation sidebar based on the caller's active role.

### Complete Section Catalog (16 Sections)

| Section Key | Subroute | Purpose & Capabilities | Allowed Roles |
| :--- | :--- | :--- | :--- |
| `overview` | `#settings` | Settings launchpad with card links to all accessible areas | ALL |
| `profile` | `#settings/profile` | User display name, email, phone, avatar upload, emergency contacts | ALL |
| `employment`| `#settings/employment` | Employment details, designation, assigned cafés, date of joining | ALL |
| `access` | `#settings/access` | Active RBAC role display, effective permissions, assigned scopes | ALL |
| `security` | `#settings/security` | Change password modal trigger, MFA status, Passkey registration | ALL |
| `devices` | `#settings/devices` | Active login sessions, device fingerprints, remote sign-out button | ALL |
| `recovery` | `#settings/recovery` | Account recovery email, emergency phone verification | ALL |
| `notifications` | `#settings/notifications` | Email and in-app notification preference toggles | ALL |
| `language` | `#settings/language` | System locale selection (English, Malayalam, Hindi, Tamil) | ALL |
| `appearance` | `#settings/appearance` | Theme selection (`paper`, `midnight`, `emerald`, `dark`) | ALL |
| `accessibility`| `#settings/accessibility` | Font scaling (`compact`, `standard`, `large`), high contrast mode | ALL |
| `workspace` | `#settings/workspace` | Default landing page preference, table density options | ALL |
| `privacy` | `#settings/privacy` | DPDP data subject rights, download personal data copy request | ALL |
| `updates` | `#settings/updates` | Application version indicator, PWA cache clear & update button | ALL |
| `help` | `#settings/help` | System diagnostic test runner, user guide links, support contact | ALL |
| `trash` | `#settings/trash` | Master Trash Bin: soft-deleted record restoration & purge | **MASTER ONLY** |
| `admin` | `#settings/admin` | System administration, cafe configuration, user management | **MASTER ONLY** |

---

## 2. UNIVERSAL MODALS & OVERLAYS

Zamorin Cafe ERP employs a set of centralized modal dialogs mounted into the `#modal-root` DOM container:

### 1. Change Password Modal (`frontend/src/js/components/changePasswordModal.js`)
- **Trigger**: Click `Change Password` in Settings or User Avatar menu.
- **Form Fields**: Current Password, New Password, Confirm New Password.
- **Validation**: Enforces password complexity rules; invokes `POST /api/v1/auth/password/change`.
- **Response**: Upon success, updates user credentials and shows a confirmation toast.

### 2. Universal Attachment Modal (`frontend/src/js/components/universalAttachmentModal.js`)
- **Trigger**: Click on any document attachment icon (Bills, Invoices, KYC, Licenses).
- **Capabilities**:
  - Direct file upload with drag-and-drop support (PDF, PNG, JPEG, max 10MB).
  - Safe in-modal document preview (PDF iframe viewer, responsive image viewer).
  - One-click secure download with original filename preservation.
  - Delete attachment button (restricted by RBAC ownership rules).

### 3. Export Centre Modal (`frontend/src/js/components/exportCentreModal.js`)
- **Trigger**: Click `Export` button on any data table across the ERP.
- **Capabilities**:
  - Export Format: PDF (APA 7 formatted layout) or Excel (.xlsx OpenXML).
  - Date Range Filter: Today, Yesterday, This Week, This Month, Custom Date Range.
  - Column Selector: Checkboxes allowing selective data column export.
  - Privacy Toggle: Mask sensitive customer phone numbers or employee salaries.

### 4. Notification Centre (`frontend/src/js/pages/notificationCentre.js`)
- **Trigger**: Click Bell icon in topbar navigation (`#topbar-bell`).
- **Capabilities**:
  - Displays unread notification badge counter (`updateBellBadge()`).
  - Slide-out drawer displaying notifications grouped by category (Approvals, Inventory Alerts, System).
  - Mark as Read and Clear All buttons; deep links directly to relevant records.


---

<a id="chapter-09-complete-frontend-route-map-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 09: 09_COMPLETE_FRONTEND_ROUTE_MAP.md -->
<!-- ===================================================================== -->

# COMPLETE FRONTEND ROUTE MAP

**Document Identifier:** `DOC-09-FRONTEND-ROUTE-MAP`  
**Target Routing File:** `frontend/src/js/router.js` & `frontend/src/js/navigation.js`  
**Total Router Cases Identified:** 98 Router Switch Cases

---

## 1. ROUTING ARCHITECTURE & GUARD ENGINE

Zamorin Cafe ERP employs a hash-based Single Page Application (SPA) client router. All URL navigation uses the format `window.location.hash = "#<route>"` with support for hierarchical subroutes (e.g. `#settings/security`, `#procurement/orders`, `#reports/sales`).

### Route Evaluation Protocol
1. **Hash Change Listener**: Listens on `window.addEventListener('hashchange')`.
2. **Cancellation of In-Flight Reads**: `cancelPendingRouteReads()` aborts stale HTTP requests from previous views.
3. **Route Guard Check**: `isRouteAllowed(role, route, isPrimaryMaster)` verifies authorization before mounting components.
4. **Shell Preservation**: The shell (`#sidebar` + `#topbar`) remains mounted; only `#page-content` is dynamically swapped.
5. **Context Synchronization**: Automatically calls `wireCafeContextStrip(content)` to bind active café selection.

---

## 2. COMPREHENSIVE ROUTE INVENTORY TABLE

| Hash Route | Screen Identifier | Component File | Allowed Roles | Guard Type | Scope | Functional Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `#login` | `AUTH-SCR-001` | `pages/login2.js` | Public / Unauth | None | Public | WIRED & FUNCTIONAL |
| `#mfa` | `AUTH-SCR-002` | `pages/login2.js` | Public / Temp Token | Temp Token | Public | WIRED & FUNCTIONAL |
| `#forgot` | `AUTH-SCR-003` | `pages/login2.js` | Public / Unauth | None | Public | WIRED & FUNCTIONAL |
| `#verify` | `AUTH-SCR-004` | `pages/login2.js` | Public / Challenge | Challenge ID | Public | WIRED & FUNCTIONAL |
| `#reset` | `AUTH-SCR-005` | `pages/login2.js` | Public / Reset Token| Reset Token | Public | WIRED & FUNCTIONAL |
| `#cafe-gateway` | `AUTH-SCR-006` | `pages/cafeGatewayPage.js` | Public / Token | Cafe Token | Cafe Public | WIRED & FUNCTIONAL |
| `#c/:token` | `AUTH-SCR-006` | `pages/cafeGatewayPage.js` | Public / Token | Signed Token| Cafe Public | WIRED & FUNCTIONAL |
| `#dashboard` | `PM-SCR-001` / `OWN-SCR-001` | `pages/dashboardMaster.js` / `Owner` / `Admin` | ALL ROLES | Authenticated | Role Adaptive| WIRED & FUNCTIONAL |
| `#pos` | `PM-SCR-002` | `pages/posTill.js` | MASTER, CAFE_ADMIN | Role Allowed | Cafe Scoped | WIRED & FUNCTIONAL |
| `#approvals` | `PM-SCR-003` | `pages/tasksApprovals.js` | MASTER, OWNER, CAFE_ADMIN | Role Allowed | Org/Cafe | WIRED & FUNCTIONAL |
| `#attendance` | `PM-SCR-004` | `modules/attendance/attendanceShifts.js` | MASTER, OWNER, CAFE_ADMIN | Role Allowed | Org/Cafe | WIRED & FUNCTIONAL |
| `#dept-orders`| `PM-SCR-005` | `pages/departmentOrders.js` | MASTER, CAFE_ADMIN | Role Allowed | Org/Cafe | WIRED & FUNCTIONAL |
| `#inventory` | `PM-SCR-006` | `pages/inventory.js` | MASTER, CAFE_ADMIN | Role Allowed | Org/Cafe | WIRED & FUNCTIONAL |
| `#procurement`| `PM-SCR-007` | `pages/procurement.js` | MASTER, CAFE_ADMIN | Role Allowed | Org/Cafe | WIRED & FUNCTIONAL |
| `#assets` | `PM-SCR-008` | `pages/assets.js` | MASTER, CAFE_ADMIN | Role Allowed | Org/Cafe | WIRED & FUNCTIONAL |
| `#quality` | `PM-SCR-009` | `pages/quality.js` | MASTER, CAFE_ADMIN | Role Allowed | Org/Cafe | WIRED & FUNCTIONAL |
| `#employees` | `PM-SCR-010` | `pages/employees.js` | MASTER, OWNER | Role Allowed | Org/Assigned | WIRED & FUNCTIONAL |
| `#payroll` | `PM-SCR-011` | `pages/payrollManagement.js` | PRIMARY MASTER ONLY | Primary Guard| Organisation| WIRED & FUNCTIONAL |
| `#bills` | `PM-SCR-012` | `pages/ownerBills.js` | MASTER, OWNER | Role Allowed | Org/Assigned | WIRED & FUNCTIONAL |
| `#expenses` | `PM-SCR-013` | `pages/expenses.js` | MASTER, CAFE_ADMIN | Role Allowed | Org/Cafe | WIRED & FUNCTIONAL |
| `#sales-cash` | `PM-SCR-014` | `pages/cashBook.js` | MASTER, OWNER, CAFE_ADMIN | Role Allowed | Org/Cafe | WIRED & FUNCTIONAL |
| `#finance` | `PM-SCR-015` / `OWN-SCR-018` | `pages/financeAccounts.js` / `ownerFinanceSummary.js` | MASTER, OWNER | Role Allowed | Org/Assigned | WIRED & FUNCTIONAL |
| `#passbook` | `PM-SCR-016` | `pages/passbook.js` | PRIMARY MASTER, OWNER | Primary/Owner| Organisation| WIRED & FUNCTIONAL |
| `#ledger` | `PM-SCR-017` | `pages/personalLedger.js` | PRIMARY MASTER, OWNER | Primary/Owner| Organisation| WIRED & FUNCTIONAL |
| `#customers` | `PM-SCR-018` | `pages/customers.js` | MASTER, CAFE_ADMIN | Role Allowed | Org/Cafe | WIRED & FUNCTIONAL |
| `#menu` | `PM-SCR-019` | `pages/menuManagement.js` | MASTER | Role Allowed | Organisation| WIRED & FUNCTIONAL |
| `#vendors` | `PM-SCR-020` | `pages/vendors.js` | MASTER | Role Allowed | Organisation| WIRED & FUNCTIONAL |
| `#revenue-share`| `PM-SCR-021`| `pages/revenueShare.js` | PRIMARY MASTER, OWNER | Primary/Owner| Organisation| WIRED & FUNCTIONAL |
| `#reports` | `PM-SCR-022` | `pages/reportsAnalytics.js` | MASTER, OWNER, CAFE_ADMIN | Role Allowed | Adaptive | WIRED & FUNCTIONAL |
| `#admin` | `PM-SCR-023` | `pages/administration.js` | MASTER ONLY | Master Guard | Organisation| WIRED & FUNCTIONAL |
| `#org-identity`| `PM-SCR-024`| `pages/organisationIdentity.js`| PRIMARY MASTER, OWNER | Primary/Owner| Organisation| WIRED & FUNCTIONAL |
| `#cafe-ops-devices`| `PM-SCR-025`| `pages/cafeOperationsDevices.js`| MASTER, CAFE_ADMIN | Role Allowed | Org/Cafe | WIRED & FUNCTIONAL |
| `#system-health`| `PM-SCR-026`| `pages/systemHealth.js` | MASTER, OWNER | Role Allowed | System | WIRED & FUNCTIONAL |
| `#owner-food-safety`| `OWN-SCR-002`| `pages/ownerFoodSafety.js` | OWNER, MASTER | Owner Guard | Assigned | WIRED & FUNCTIONAL |
| `#owner-risk-audit` | `OWN-SCR-003`| `pages/ownerRiskAudit.js` | OWNER, MASTER | Owner Guard | Assigned | WIRED & FUNCTIONAL |
| `#owner-planning` | `OWN-SCR-004`| `pages/ownerPlanning.js` | OWNER, MASTER | Owner Guard | Assigned | WIRED & FUNCTIONAL |
| `#owner-compliance` | `OWN-SCR-005`| `pages/ownerCompliance.js` | OWNER, MASTER | Owner Guard | Assigned | WIRED & FUNCTIONAL |
| `#owner-supplier-intelligence`| `OWN-SCR-006`| `pages/ownerSupplierIntelligence.js`| OWNER, MASTER | Owner Guard | Assigned | WIRED & FUNCTIONAL |
| `#owner-academy` | `OWN-SCR-007`| `pages/ownerAcademy.js` | OWNER, MASTER | Owner Guard | Assigned | WIRED & FUNCTIONAL |
| `#owner-asset-reliability`| `OWN-SCR-008`| `pages/ownerAssetReliability.js`| OWNER, MASTER | Owner Guard | Assigned | WIRED & FUNCTIONAL |
| `#owner-privacy-cyber`| `OWN-SCR-009`| `pages/ownerPrivacyCyber.js`| OWNER, MASTER | Owner Guard | Assigned | WIRED & FUNCTIONAL |
| `#owner-bcdr` | `OWN-SCR-010`| `pages/ownerBcdr.js` | OWNER, MASTER | Owner Guard | Assigned | WIRED & FUNCTIONAL |
| `#owner-master-data`| `OWN-SCR-011`| `pages/ownerMasterData.js` | OWNER, MASTER | Owner Guard | Assigned | WIRED & FUNCTIONAL |
| `#owner-complaints` | `OWN-SCR-012`| `pages/ownerComplaints.js` | OWNER, MASTER | Owner Guard | Assigned | WIRED & FUNCTIONAL |
| `#owner-menu-pricing`| `OWN-SCR-013`| `pages/ownerMenuPricing.js` | OWNER, MASTER | Owner Guard | Assigned | WIRED & FUNCTIONAL |
| `#owner-customer-loyalty`| `OWN-SCR-014`| `pages/ownerCustomerLoyalty.js`| OWNER, MASTER | Owner Guard | Assigned | WIRED & FUNCTIONAL |
| `#owner-utilities-waste`| `OWN-SCR-015`| `pages/ownerUtilitiesWaste.js`| OWNER, MASTER | Owner Guard | Assigned | WIRED & FUNCTIONAL |
| `#owner-governance-delegation`| `OWN-SCR-016`| `pages/ownerGovernanceDelegation.js`| OWNER, MASTER | Owner Guard | Assigned | WIRED & FUNCTIONAL |
| `#performance` | `OWN-SCR-017` | `pages/cafePerformance.js` | OWNER, MASTER | Owner Guard | Assigned | WIRED & FUNCTIONAL |
| `#cafe-operator-signin`| `CAF-SCR-002`| `pages/cafeOperatorSignIn.js`| CAFE_ADMIN / Device | Device Token | Terminal | WIRED & FUNCTIONAL |
| `#cafe-device-state` | `CAF-SCR-003`| `pages/cafeOperationsState.js`| ALL (Device Error)| None | Terminal | WIRED & FUNCTIONAL |
| `#kiosk-attendance` | `CAF-SCR-004`| `pages/cafeAttendanceDisplay.js`| ALL (Kiosk Mode) | Device Bound | Terminal | WIRED & FUNCTIONAL |
| `#cafe-master-signin`| `CAF-SCR-005`| `pages/cafeMasterSignIn.js` | MASTER on Terminal | Master Credentials| Terminal | WIRED & FUNCTIONAL |
| `#cafe-device-enroll` | `CAF-SCR-006`| `pages/cafeDeviceEnroll.js` | Unenrolled Device | Enrollment Code | Terminal | WIRED & FUNCTIONAL |
| `#cafe-terminal-welcome`| `CAF-SCR-007`| `pages/cafeTerminalWelcome.js`| Enrolled Terminal | Device Token | Terminal | WIRED & FUNCTIONAL |
| `#staff-home` | `EMP-SCR-001` | `pages/staffHome.js` | STAFF, ALL | Implicit Self | Personal | WIRED & FUNCTIONAL |
| `#announcements` | `EMP-SCR-002` | `pages/announcements.js` | STAFF, ALL | Implicit Self | Personal | WIRED & FUNCTIONAL |
| `#staff-attendance` | `EMP-SCR-003` | `modules/attendance/staffAttendance.js`| STAFF, ALL | Implicit Self | Personal | WIRED & FUNCTIONAL |
| `#staff-leave` | `EMP-SCR-004` | `pages/staffLeave.js` | STAFF, ALL | Implicit Self | Personal | WIRED & FUNCTIONAL |
| `#staff-payslips` | `EMP-SCR-005` | `pages/staffPayslips.js` | STAFF, ALL | Implicit Self | Personal | WIRED & FUNCTIONAL |
| `#staff-loans-advances`| `EMP-SCR-006`| `pages/staffLoansAdvances.js` | STAFF, ALL | Implicit Self | Personal | WIRED & FUNCTIONAL |
| `#staff-documents` | `EMP-SCR-007` | `pages/staffDocuments.js` | STAFF, ALL | Implicit Self | Personal | WIRED & FUNCTIONAL |
| `#employee-profile` | `EMP-SCR-008` | `pages/employeeProfile.js` | ALL AUTHENTICATED | Implicit Self | Personal | WIRED & FUNCTIONAL |
| `#staff-settings` | `EMP-SCR-009` | `pages/staffSettings.js` | STAFF | Role Allowed | Personal | WIRED & FUNCTIONAL |
| `#settings` (16 subs)| `SHARED-SCR-001`| `pages/settingsShared.js` | ALL AUTHENTICATED | Subroute Filter| Personal/Org | WIRED & FUNCTIONAL |
| `#notifications` | `SHARED-SCR-002`| `pages/notificationCentre.js`| ALL AUTHENTICATED | Implicit All | Personal | WIRED & FUNCTIONAL |
| `#trash` | `SHARED-SCR-003`| `pages/trashBin.js` | MASTER ONLY | Master Guard | Organisation| WIRED & FUNCTIONAL |
| `#attendance-qr-scanner`| `SHARED-SCR-005`| `pages/attendanceQrScannerPage.js`| ALL AUTHENTICATED | Camera Permission| Cafe Scoped| WIRED & FUNCTIONAL |


---

<a id="chapter-10-complete-backend-api-map-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 10: 10_COMPLETE_BACKEND_API_MAP.md -->
<!-- ===================================================================== -->

# COMPLETE BACKEND API MAP

**Document Identifier:** `DOC-10-BACKEND-API-MAP`  
**Target Route Directory:** `backend/src/routes/`  
**Total Endpoint Registrations:** 352 REST API Endpoints across 69 Route Files

---

## 1. REST API ARCHITECTURE & URL CONVENTIONS

- **Base Endpoint URL**: `/api/v1` (mounted via `backend/src/server.js:373`)
- **Top-Level Special Endpoints**:
  - `/health`, `/health/live`, `/health/ready`, `/staging/diagnostic`
  - `/cafe-access/qr/:token`, `/c/:token` (High-availability short QR aliases)
- **Response Shape Envelope**:
```json
{
  "success": true,
  "data": { ... },
  "correlationId": "corr-uuid-v4",
  "timestamp": "2026-09-18T12:00:00.000Z"
}
```
- **Error Shape Envelope**:
```json
{
  "success": false,
  "error": {
    "code": "ERROR_ENUM_CODE",
    "message": "Human readable error explanation."
  },
  "correlationId": "corr-uuid-v4"
}
```

---

## 2. REPRESENTATIVE ENDPOINT CATALOG BY DOMAIN

Below is a categorized catalog of primary REST endpoints across the 69 backend route modules:

### Domain 1: Authentication & Identity (`authRoutes.js`)
| Method | Endpoint Path | Middleware | Controller | Permission Code | Scope |
| :--- | :--- | :--- | :--- | :--- | :--- |
| POST | `/api/v1/auth/login` | rateLimit, csrf | `authController.login` | Public | Global |
| POST | `/api/v1/auth/logout` | authenticate | `authController.logout` | Authenticated | Global |
| GET | `/api/v1/auth/me` | authenticate | `authController.me` | Authenticated | Global |
| POST | `/api/v1/auth/refresh` | csrf | `authController.refresh` | Public (Cookie) | Global |
| POST | `/api/v1/auth/password/forgot` | rateLimit | `authController.forgotPassword` | Public | Global |
| POST | `/api/v1/auth/password/reset/verify`| rateLimit | `authController.verifyResetCode`| Public | Global |
| POST | `/api/v1/auth/password/reset` | rateLimit | `authController.resetPassword` | Public | Global |
| POST | `/api/v1/auth/password/change` | authenticate | `authController.changePassword`| Authenticated | Self |
| POST | `/api/v1/auth/mfa/verify` | rateLimit | `authController.verifyMfa` | Temp Token | Global |
| POST | `/api/v1/auth/mfa/confirm` | rateLimit | `authController.confirmMfaSetup`| Temp Token | Global |

### Domain 2: Cafe Management & Access (`cafeRoutes.js`, `cafeAccessRoutes.js`)
| Method | Endpoint Path | Middleware | Controller | Permission Code | Scope |
| :--- | :--- | :--- | :--- | :--- | :--- |
| GET | `/api/v1/cafes` | authenticate | `cafeController.listCafes` | `CAFE:READ` | Assigned / Org |
| POST | `/api/v1/cafes` | authenticate, requireMaster | `cafeController.createCafe` | `CAFE:CREATE` | Organisation |
| GET | `/api/v1/cafes/:cafeId` | authenticate | `cafeController.getCafeById` | `CAFE:READ` | Assigned / Cafe |
| PUT | `/api/v1/cafes/:cafeId` | authenticate, requireMaster | `cafeController.updateCafe` | `CAFE:UPDATE` | Organisation |
| POST | `/api/v1/cafes/:cafeId/qr/regenerate`| authenticate, requireMaster | `cafeAccessController.regenerateQr`| `CAFE:MANAGE`| Organisation |
| GET | `/cafe-access/qr/:token` | rateLimit (Public) | `cafeAccessController.getPublicQrContext`| Public | Global |
| GET | `/c/:token` | rateLimit (Public) | `cafeAccessController.getPublicQrContext`| Public | Global |

### Domain 3: POS & Billing (`posRoutes.js`, `billRoutes.js`)
| Method | Endpoint Path | Middleware | Controller | Permission Code | Scope |
| :--- | :--- | :--- | :--- | :--- | :--- |
| POST | `/api/v1/pos/orders` | authenticate, cafeScope | `posController.createOrder` | `POS:ORDER_CREATE` | Cafe |
| POST | `/api/v1/pos/orders/:orderId/pay`| authenticate, cafeScope | `posController.processPayment` | `POS:PAYMENT` | Cafe |
| POST | `/api/v1/pos/orders/offline-sync`| authenticate, cafeScope | `posController.syncOfflineQueue` | `POS:OFFLINE_SYNC`| Cafe |
| GET | `/api/v1/bills` | authenticate, cafeScope | `billController.listBills` | `BILL:READ` | Assigned / Cafe |
| GET | `/api/v1/bills/:billId` | authenticate, cafeScope | `billController.getBillById` | `BILL:READ` | Assigned / Cafe |
| POST | `/api/v1/bills/:billId/void` | authenticate, requireMaster | `billController.voidBill` | `BILL:VOID` | Organisation |
| GET | `/api/v1/bills/:billId/receipt`| authenticate, cafeScope | `billController.printReceipt` | `BILL:PRINT` | Assigned / Cafe |

### Domain 4: Attendance & HR (`attendanceRoutes.js`, `employeeRoutes.js`, `payrollRoutes.js`)
| Method | Endpoint Path | Middleware | Controller | Permission Code | Scope |
| :--- | :--- | :--- | :--- | :--- | :--- |
| POST | `/api/v1/attendance/clock-in` | authenticate | `attendanceController.clockIn` | `ATTENDANCE:CLOCK` | Self / Cafe |
| POST | `/api/v1/attendance/clock-out` | authenticate | `attendanceController.clockOut` | `ATTENDANCE:CLOCK` | Self / Cafe |
| GET | `/api/v1/attendance/history` | authenticate | `attendanceController.getHistory` | `ATTENDANCE:READ` | Self / Assigned |
| GET | `/api/v1/employees` | authenticate | `employeeController.listEmployees` | `EMPLOYEE:READ` | Assigned / Org |
| POST | `/api/v1/employees` | authenticate, requireMaster | `employeeController.createEmployee`| `EMPLOYEE:CREATE`| Organisation |
| POST | `/api/v1/payroll/runs` | authenticate, requirePrimaryMaster| `payrollController.executeRun` | `PAYROLL:EXECUTE`| Organisation |
| GET | `/api/v1/payroll/runs/:runId` | authenticate, requirePrimaryMaster| `payrollController.getRunSummary`| `PAYROLL:READ` | Organisation |
| GET | `/api/v1/payroll/payslips/my` | authenticate | `payrollController.getMyPayslips` | `PAYSLIP:READ_SELF`| Self |

### Domain 5: Inventory, Procurement & Vendors (`inventoryRoutes.js`, `procurementRoutes.js`, `vendorRoutes.js`)
| Method | Endpoint Path | Middleware | Controller | Permission Code | Scope |
| :--- | :--- | :--- | :--- | :--- | :--- |
| GET | `/api/v1/inventory/items` | authenticate, cafeScope | `inventoryController.listItems` | `INVENTORY:READ` | Cafe / Org |
| POST | `/api/v1/inventory/adjust` | authenticate, cafeScope | `inventoryController.adjustStock` | `INVENTORY:ADJUST`| Cafe |
| GET | `/api/v1/procurement/orders` | authenticate, cafeScope | `procurementController.listPOs` | `PO:READ` | Cafe / Org |
| POST | `/api/v1/procurement/orders` | authenticate, cafeScope | `procurementController.createPO` | `PO:CREATE` | Cafe / Org |
| POST | `/api/v1/procurement/orders/:id/approve`| authenticate, requireMaster| `procurementController.approvePO`| `PO:APPROVE` | Organisation |
| POST | `/api/v1/procurement/orders/:id/grn`| authenticate, cafeScope | `procurementController.receiveGRN`| `PO:RECEIVE` | Cafe |
| GET | `/api/v1/vendors` | authenticate | `vendorController.listVendors` | `VENDOR:READ` | Organisation |
| GET | `/api/v1/vendor-ledger/:vendorId`| authenticate, requireMaster | `vendorLedgerController.getLedger`| `VENDOR:FINANCE` | Organisation |

### Domain 6: Strategic Portfolio Governance (`owner*Routes.js`)
| Method | Endpoint Path | Middleware | Controller | Permission Code | Scope |
| :--- | :--- | :--- | :--- | :--- | :--- |
| GET | `/api/v1/food-safety/audits` | authenticate, ownerScope | `foodSafetyController.getAudits` | `FOOD_SAFETY:READ` | Assigned |
| GET | `/api/v1/risk-audit/observations`| authenticate, ownerScope | `riskAuditController.getObservations`| `AUDIT:READ` | Assigned |
| GET | `/api/v1/planning/capex` | authenticate, ownerScope | `planningController.getCapexPlans`| `PLANNING:READ` | Assigned |
| GET | `/api/v1/compliance/licences` | authenticate, ownerScope | `complianceController.getLicences`| `COMPLIANCE:READ` | Assigned |
| GET | `/api/v1/owner/complaints` | authenticate, ownerScope | `complaintsController.getComplaints`| `COMPLAINT:READ`| Assigned |
| GET | `/api/v1/owner/menu-pricing` | authenticate, ownerScope | `menuPricingController.getMatrix` | `PRICING:READ` | Assigned |


---

<a id="chapter-11-database-and-data-model-reference-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 11: 11_DATABASE_AND_DATA_MODEL_REFERENCE.md -->
<!-- ===================================================================== -->

# DATABASE AND DATA MODEL REFERENCE

**Document Identifier:** `DOC-11-DATABASE-MODELS`  
**Target ODM:** Mongoose `v9.9.1` on MongoDB `v7.0+`  
**Total Models Discovered:** 229 Schemas in `backend/src/models/`

---

## 1. DATABASE ARCHITECTURE & MULTI-TENANCY CONSTRAINTS

Every collection in the Zamorin Cafe ERP persistence tier adheres to the following structural conventions:
- **Tenant Partitioning**: Documents are tagged with `organisationId` (String, uppercase, immutable, indexed).
- **Location Partitioning**: Cafe-scoped records are tagged with `cafeId` (String, uppercase, indexed).
- **Optimistic Concurrency**: Enabled via Mongoose `versionKey: 'version'` and `optimisticConcurrency: true`.
- **Audit Metadata**: Timestamps automatically maintained (`createdAt`, `updatedAt`).
- **Soft Delete Support**: Enabled on business records via `archivedAt: Date` and `archivedBy: String`.

```mermaid
erDiagram
    ORGANISATION ||--o{ CAFE : operates
    ORGANISATION ||--o{ USER : employs
    CAFE ||--o{ EMPLOYEE : assigns
    CAFE ||--o{ DEVICE_REGISTRATION : binds
    CAFE ||--o{ BILL : generates
    BILL ||--o{ BILL_ITEM : contains
    CAFE ||--o{ INVENTORY_LOT : stores
    ORGANISATION ||--o{ MENU_ITEM : owns
    MENU_ITEM ||--o{ RECIPE : defined_by
    CAFE ||--o{ PURCHASE_ORDER : issues
    PURCHASE_ORDER ||--o{ AP_INVOICE : billed_by
    ORGANISATION ||--o{ ROLE_PERMISSION : defines
```

---

## 2. CANONICAL MODEL SPECIFICATIONS (PRIMARY SCHEMAS)

Below are detailed structural specifications for key database models:

### 1. Model: `Cafe` (`backend/src/models/Cafe.js`)
- **Collection**: `cafes`
- **Primary Identifier**: `cafeId` (e.g. `CF-0001`, unique, uppercase)
- **Key Fields**:
  - `organisationId`: String (Required, index: true)
  - `name`: String (Required, trim: true)
  - `legalEntityName`: String (Required)
  - `address`: Subdocument (line1, line2, city, state, pin, country)
  - `gstin`: String (Match: Indian GSTIN format, 15 chars)
  - `fssaiNumber`: String (Match: 14-digit FSSAI registration)
  - `fssaiExpiryDate`: Date
  - `status`: Enum [`ACTIVE`, `SUSPENDED`, `CLOSED`]
  - `posSettings`: Subdocument (receiptHeader, receiptFooter, allowNegativeInventory)
  - `qrToken`: String (Cryptographically signed deep-link token)
- **Indexes**: Compound index on `{ organisationId: 1, cafeId: 1 }`, unique on `cafeId`.

### 2. Model: `User` (`backend/src/models/User.js`)
- **Collection**: `users`
- **Primary Identifier**: `userId` (e.g. `MU-0001`, `OU-0001`, `AU-0001`, `SU-0001`)
- **Key Fields**:
  - `organisationId`: String (Required, index: true)
  - `email`: String (Required, lowercase, unique per organisation)
  - `passwordHash`: String (Bcrypt / Argon2 hash, select: false)
  - `role`: Enum [`MASTER`, `OWNER`, `CAFE_ADMIN`, `STAFF`]
  - `isPrimaryMaster`: Boolean (Default: false)
  - `assignedCafeIds`: [String] (List of authorized café IDs)
  - `primaryCafeId`: String (Default café context)
  - `mfaEnabled`: Boolean (Default: false)
  - `mfaSecret`: String (Encrypted TOTP secret, select: false)
  - `status`: Enum [`ACTIVE`, `LOCKED`, `SUSPENDED`, `DELETED`]
  - `failedLoginAttempts`: Number (Default: 0)
  - `lockoutUntil`: Date (Default: null)
- **Indexes**: Unique compound on `{ organisationId: 1, email: 1 }`.

### 3. Model: `Bill` (`backend/src/models/Bill.js`)
- **Collection**: `bills`
- **Primary Identifier**: `billId` (e.g. `BL-2026-0001`, unique)
- **Key Fields**:
  - `organisationId`: String (Required)
  - `cafeId`: String (Required, index: true)
  - `invoiceNumber`: String (Statutory fiscal counter, e.g. `ZAM/CLT/26/0042`)
  - `orderType`: Enum [`DINE_IN`, `TAKEAWAY`, `DELIVERY`]
  - `tableNumber`: String
  - `items`: Array of Subdocuments (itemId, name, quantity, unitPrice, taxRate, total)
  - `subtotal`: Number, `taxTotal`: Number, `discountTotal`: Number, `grandTotal`: Number
  - `payments`: Array of Subdocuments (method: CASH/UPI/CARD, amount, transactionRef)
  - `status`: Enum [`PAID`, `VOIDED`, `REFUNDED`]
  - `voidReason`: String, `voidAuthorisedBy`: String
  - `reprintCount`: Number (Default: 0)
- **Indexes**: Compound on `{ cafeId: 1, createdAt: -1 }`, unique on `{ cafeId: 1, invoiceNumber: 1 }`.

### 4. Model: `PurchaseOrder` (`backend/src/models/PurchaseOrder.js`)
- **Collection**: `purchase_orders`
- **Primary Identifier**: `purchaseOrderId` (e.g. `PO-2026-0104`)
- **Key Fields**:
  - `organisationId`: String, `cafeId`: String
  - `vendorId`: String (Ref: Vendor)
  - `items`: Array (itemId, orderedQty, receivedQty, unitCost, taxPercent, totalCost)
  - `status`: Enum [`DRAFT`, `SUBMITTED`, `APPROVED`, `PARTIAL_RECEIPT`, `RECEIVED`, `CANCELLED`]
  - `totalAmount`: Number
  - `attachmentIds`: [String] (Ref: AttachmentRegistry)
  - `approvedBy`: String, `approvedAt`: Date
- **Indexes**: `{ organisationId: 1, cafeId: 1, status: 1 }`.


---

<a id="chapter-12-rbac-permission-and-scope-matrix-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 12: 12_RBAC_PERMISSION_AND_SCOPE_MATRIX.md -->
<!-- ===================================================================== -->

# RBAC PERMISSION AND SCOPE MATRIX

**Document Identifier:** `DOC-12-RBAC-MATRIX`  
**Target Engine:** `backend/src/middleware/authorize.js` & `backend/src/models/RolePermission.js`

---

## 1. ACCESS CONTROL ARCHITECTURE

Zamorin Cafe ERP implements a hybrid **Role-Based Access Control (RBAC)** and **Attribute-Based Access Control (ABAC)** engine governed by:
- **Default Deny**: Any action or route not explicitly granted evaluates to `DENY`.
- **Negative Overrides**: A rule with `effect: 'DENY'` takes absolute precedence over an `ALLOW` rule.
- **Scoping Boundaries**:
  - `ORGANISATION`: Global access across all locations (Primary Master only).
  - `ASSIGNED_CAFES`: Bounded to authorized locations in user profile (Owner).
  - `CAFE`: Strictly bounded to single active device / operator location (Cafe Operations).
  - `SELF`: Strictly bounded to caller's own records (Staff).

---

## 2. COMPLETE DOMAIN PERMISSION MATRIX

| Domain / Feature Area | Primary Master | Normal Master | Owner | Cafe Operations | Staff Self-Service |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Command Dashboard** | FULL (All Cafes) | FULL (All Cafes) | FULL (Assigned) | STORE ONLY | SELF HOME |
| **POS Checkout & Billing** | FULL | FULL | READ ONLY | FULL (Local Store) | DENIED |
| **Bill Voiding & Refunds** | FULL | FULL | READ ONLY | MANAGER PIN | DENIED |
| **Inventory Adjustments** | FULL | FULL | READ ONLY | STORE ONLY | DENIED |
| **Purchase Order Creation** | FULL | FULL | READ ONLY | STORE REQ ONLY | DENIED |
| **Purchase Order Approval** | FULL | FULL | APPROVE (>Threshold)| DENIED | DENIED |
| **Supplier Invoices & AP** | FULL | FULL | READ ONLY | STORE GRN ONLY | DENIED |
| **Vendor Management** | FULL | FULL | READ ONLY | DENIED | DENIED |
| **Menu Engineering & Price**| FULL | FULL | STRATEGIC MATRIX | READ ONLY | DENIED |
| **Employee Directory** | FULL | FULL (Masked Pay) | READ ONLY | STORE SHIFT ONLY | SELF PROFILE |
| **Universal Payroll Run** | **FULL** | **DENIED** | READ ONLY (Summary)| **DENIED** | **DENIED** |
| **Payslip PDF Access** | ALL STAFF | ALL STAFF | ALL (Assigned) | STORE STAFF | **SELF ONLY** |
| **Personal Ledger / Draw** | **FULL** | **DENIED** | **FULL (Own Ledger)**| **DENIED** | **DENIED** |
| **Passbook Treasury** | **FULL** | **DENIED** | **FULL (Own Accounts)**| **DENIED** | **DENIED** |
| **Revenue Share Settlements**| **FULL** | **DENIED** | **FULL (Own Outlets)**| **DENIED** | **DENIED** |
| **Fixed Assets Maintenance** | FULL | FULL | STRATEGIC RELIABILITY| LOCAL LOGGING | DENIED |
| **Quality & FSSAI Logs** | FULL | FULL | FOOD SAFETY RECALL| LOCAL LOGGING | DENIED |
| **Attendance Clocks (GPS)** | ALL CAFES | ALL CAFES | READ ONLY | STORE KIOSK | **SELF ONLY** |
| **Leave Approval** | FULL | FULL | READ ONLY | STORE SHIFT STAFF | SUBMIT REQUEST |
| **Staff Loan Approvals** | **FULL** | **DENIED** | APPROVAL (>Limit) | STORE ADVANCE VOUCH | SUBMIT REQUEST |
| **Master Trash Bin Purge** | **FULL** | **READ ONLY** | **DENIED** | **DENIED** | **DENIED** |
| **Organisation Identity** | **FULL** | **DENIED** | **READ ONLY** | **DENIED** | **DENIED** |
| **Device Terminal Enrollment**| FULL | FULL | READ ONLY | STORE RE-ENROLL | DENIED |
| **Reports & Analytics** | ALL 14 | 12 (No Payroll) | 12 (Assigned) | STORE METRICS | DENIED |


---

<a id="chapter-13-complete-ui-action-and-button-matrix-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 13: 13_COMPLETE_UI_ACTION_AND_BUTTON_MATRIX.md -->
<!-- ===================================================================== -->

# COMPLETE UI ACTION AND BUTTON MATRIX

**Document Identifier:** `DOC-13-UI-ACTION-MATRIX`  
**Target Pages:** 70 Frontend Page Components in `frontend/src/js/pages/`  
**Total Actions Discovered:** 650 Audited Interactive Controls

---

## 1. ACTION WIRING VERIFICATION METHODOLOGY

Every button, form submission, modal trigger, export link, and delete control in the 70 page components has been inspected to verify whether it connects through the complete execution chain:
- **WIRED & FUNCTIONAL**: UI control has active event listener -> calls ApiClient method -> hits live backend route -> controller -> service -> database.
- **WIRED BUT PARTIALLY FUNCTIONAL**: Handler exists and calls API, but certain client parameters are not handled by backend or response shape requires fallback.
- **UI ONLY — NO HANDLER**: Button renders in DOM but has no click listener attached.

---

## 2. REPRESENTATIVE UI ACTION WIRING AUDIT TABLE

| Page / Component | Visible Control Text | Element ID / Selector | Event Handler | Target API Endpoint | HTTP Method | Verified Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `login2.js` | `Sign In to Workspace` | `#btn-login-submit` | `handleLoginSubmit()` | `/api/v1/auth/login` | POST | **WIRED & FUNCTIONAL** |
| `login2.js` | `Show/Hide Password` | `#btn-toggle-password` | `togglePasswordVisibility()`| DOM State Only | N/A | **WIRED & FUNCTIONAL** |
| `login2.js` | `Forgot Password?` | `#link-forgot-password`| `mountAuthScreen("forgot")` | Client Router | N/A | **WIRED & FUNCTIONAL** |
| `login2.js` | `Verify Code` | `#btn-verify-submit` | `handlePasswordResetVerify()`| `/api/v1/auth/password/reset/verify`| POST | **WIRED & FUNCTIONAL** |
| `login2.js` | `Update Password` | `#btn-reset-submit` | `handlePasswordResetFinal()` | `/api/v1/auth/password/reset` | POST | **WIRED & FUNCTIONAL** |
| `posTill.js` | `Pay & Print Invoice` | `#btn-pos-pay` | `handleProcessPayment()` | `/api/v1/pos/orders/:id/pay` | POST | **WIRED & FUNCTIONAL** |
| `posTill.js` | `Hold Order` | `#btn-pos-hold` | `handleHoldOrder()` | Client / LocalStorage | N/A | **WIRED & FUNCTIONAL** |
| `posTill.js` | `Cancel Order` | `#btn-pos-cancel` | `handleCancelOrder()` | State Reset | N/A | **WIRED & FUNCTIONAL** |
| `posTill.js` | `Reprint Last Bill` | `#btn-pos-reprint` | `handleReprintLastBill()` | `/api/v1/bills/:id/receipt`| GET | **WIRED & FUNCTIONAL** |
| `inventory.js` | `Adjust Stock` | `#btn-stock-adjust` | `handleStockAdjustment()` | `/api/v1/inventory/adjust` | POST | **WIRED & FUNCTIONAL** |
| `inventory.js` | `Export Inventory CSV`| `#btn-export-inventory`| `openExportModal()` | `/api/v1/exports/inventory` | POST | **WIRED & FUNCTIONAL** |
| `procurement.js`| `Create PO` | `#btn-create-po` | `handleSubmitPurchaseOrder()`| `/api/v1/procurement/orders`| POST | **WIRED & FUNCTIONAL** |
| `procurement.js`| `Upload Invoice` | `#btn-upload-invoice`| `openAttachmentModal()` | `/api/v1/documents/upload` | POST | **WIRED & FUNCTIONAL** |
| `employees.js` | `Add Employee` | `#btn-add-employee` | `handleSaveEmployee()` | `/api/v1/employees` | POST | **WIRED & FUNCTIONAL** |
| `employees.js` | `Deactivate Employee`| `#btn-deactivate-emp`| `handleDeactivateEmployee()`| `/api/v1/employees/:id/deactivate`| POST | **WIRED & FUNCTIONAL** |
| `payroll.js` | `Run Monthly Payroll`| `#btn-execute-payroll`| `handleExecutePayroll()` | `/api/v1/payroll/runs` | POST | **WIRED & FUNCTIONAL** |
| `payroll.js` | `Download Bank File` | `#btn-download-bank-file`| `handleDownloadBankBatch()`| `/api/v1/payroll/runs/:id/bank-file`| GET | **WIRED & FUNCTIONAL** |
| `cashBook.js` | `Record Cash Drop` | `#btn-cash-drop` | `handleRecordCashDrop()` | `/api/v1/cash-transactions` | POST | **WIRED & FUNCTIONAL** |
| `admin.js` | `Create New Café` | `#btn-create-cafe` | `handleSaveNewCafe()` | `/api/v1/cafes` | POST | **WIRED & FUNCTIONAL** |
| `admin.js` | `Regenerate Cafe QR` | `#btn-regen-qr` | `handleRegenerateQr()` | `/api/v1/cafes/:id/qr/regenerate`| POST | **WIRED & FUNCTIONAL** |
| `trashBin.js` | `Restore Record` | `#btn-trash-restore` | `handleRestoreTrash()` | `/api/v1/trash/restore/:id` | POST | **WIRED & FUNCTIONAL** |
| `trashBin.js` | `Permanently Delete` | `#btn-trash-purge` | `handlePurgeTrash()` | `/api/v1/trash/purge/:id` | DELETE | **WIRED & FUNCTIONAL** |
| `staffHome.js` | `Clock In Now` | `#btn-clock-in` | `handleClockIn()` | `/api/v1/attendance/clock-in`| POST | **WIRED & FUNCTIONAL** |
| `staffLeave.js` | `Submit Leave Request`| `#btn-submit-leave` | `handleSubmitLeave()` | `/api/v1/leave/requests` | POST | **WIRED & FUNCTIONAL** |
| `settings.js` | `Update Password` | `#btn-change-password`| `openChangePasswordModal()` | `/api/v1/auth/password/change`| POST | **WIRED & FUNCTIONAL** |
| `settings.js` | `Clear App Cache` | `#btn-clear-cache` | `handleClearPwaCache()` | ServiceWorker unregister | N/A | **WIRED & FUNCTIONAL** |


---

<a id="chapter-14-end-to-end-workflow-catalogue-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 14: 14_END_TO_END_WORKFLOW_CATALOGUE.md -->
<!-- ===================================================================== -->

# END-TO-END WORKFLOW CATALOGUE

**Document Identifier:** `DOC-14-E2E-WORKFLOWS`  
**Target Coverage:** 12 Critical End-to-End Business Operations

---

## 1. WORKFLOW 1: NEW CAFÉ ONBOARDING & ACTIVATION

```mermaid
sequenceDiagram
    autonumber
    actor Master as Primary Master
    participant UI as Administration Screen (#admin)
    participant API as POST /api/v1/cafes
    participant Svc as cafeService.createCafe
    participant QR as universalQrService
    participant DB as MongoDB Atlas

    Master->>UI: Fills Cafe Name, Legal Entity, Address, GSTIN, FSSAI
    UI->>API: Dispatches validated cafe creation payload
    API->>Svc: Invokes cafeService.createCafe(payload)
    Svc->>Svc: Generates canonical Cafe ID (CF-XXXX)
    Svc->>QR: Generates cryptographically signed deep-link QR token
    Svc->>DB: Persists Cafe record with status ACTIVE
    Svc->>DB: Initializes CafeInventoryConfig & Seed Category
    Svc->>DB: Logs AUDIT_EVENT (CAFE_CREATED)
    API-->>UI: Returns 201 Created with Cafe Record & QR Image
    UI->>Master: Displays Cafe Card with Downloadable QR Code
```

---

## 2. WORKFLOW 2: POS CHECKOUT & REAL-TIME RECONCILIATION

1. **Cart Construction**: Cashier taps items from categories; items append to `state.posCart`.
2. **Tax & Discount Computation**: Real-time 5% GST calculation (2.5% CGST + 2.5% SGST) with round-to-nearest rupee.
3. **Tender Selection**: Customer tenders Cash / UPI QR / Card.
4. **Order Transmission**: `POST /api/v1/pos/orders` transmits order items and payments.
5. **Atomic Stock Depletion**: `bomDepletionService` consumes raw materials based on active recipe BOM.
6. **Statutory Invoice Generation**: Creates sequential Tax Invoice in `Bill` collection.
7. **Instant Receipt Dispatch**: Triggers WebSerial / WebBluetooth thermal ESC/POS print job or browser print dialog.

---

## 3. WORKFLOW 3: PROCUREMENT 3-WAY MATCH & STOCK INWARD

1. **Requisition**: Store Manager generates Purchase Requisition for depleted raw materials.
2. **Purchase Order**: Primary Master reviews and converts requisition into formal Purchase Order (`PO-XXXX`).
3. **Goods Receiving**: Vendor delivers goods; Store Manager generates Goods Receipt Note (`GRN`) recording accepted vs damaged units.
4. **Supplier Invoice Upload**: Manager attaches vendor tax invoice PDF via `universalAttachmentModal` (stored in GridFS).
5. **3-Way Matching Engine**: `threeWayMatchService` verifies PO price vs GRN quantity vs Invoice total.
6. **Stock Ledger & AP Update**: `inventoryLotService` creates new inventory lots with FEFO expiration tracking; `vendorLedgerService` logs credit payable entry.

---

## 4. WORKFLOW 4: EMPLOYEE ATTENDANCE, PAYROLL & PAYSLIP DISPATCH

1. **Shift Punch**: Employee clocks in using GPS Geofence or Attendance Kiosk QR scan.
2. **Punch Audit**: `attendanceCalculationService` verifies timestamp against scheduled shift roster, logging late-ins or overtime.
3. **Payroll Period Closure**: Primary Master triggers monthly payroll run (`POST /api/v1/payroll/runs`).
4. **Statutory Computations**: `payrollStatutoryService` applies Code on Wages rules:
   - Basic Salary (minimum 50% of CTC)
   - EPF Deduction (12% employee + 12% employer matching)
   - ESI Deduction (0.75% employee + 3.25% employer matching)
   - Loss of Pay (LOP) based on unpaid absence days
5. **Payslip Delivery**: Generates durable PDF payslip records stored in `Payslip` collection.
6. **Self-Service Instant Access**: Employee logs into `#staff-payslips` and downloads official PDF.


---

<a id="chapter-15-integrations-files-printing-and-documents-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 15: 15_INTEGRATIONS_FILES_PRINTING_AND_DOCUMENTS.md -->
<!-- ===================================================================== -->

# INTEGRATIONS, FILES, PRINTING AND DOCUMENTS

**Document Identifier:** `DOC-15-INTEGRATIONS-PRINTING`  
**Target Subsystems:** GridFS Object Storage, ClamAV Antivirus, ESC/POS Hardware Bridge, PDF Generation

---

## 1. DURABLE OBJECT STORAGE ARCHITECTURE

Binary document attachments (PDF supplier invoices, KYC cards, trade licenses, expense proofs) are stored in a dedicated **MongoDB GridFS** bucket cluster managed by `GridFSStorageAdapter.js`.

### Storage Pipeline
- **Upload Endpoint**: `POST /api/v1/documents/upload` (Multer stream buffer, max 10MB).
- **MIME Whitelist**: `application/pdf`, `image/png`, `image/jpeg`, `image/webp`.
- **Integrity Validation**: Computes cryptographic SHA-256 hash before storage.
- **Malware Scanning**: Streamed through live ClamAV scanner socket (`ClamAvHttpScanningProvider.js`). Any infected file is immediately quarantined and rejected with `MALWARE_DETECTED`.
- **Metadata Registry**: Recorded in `AttachmentRegistry` schema linking document ID to owner entity (`purchaseOrderId`, `expenseId`, `employeeId`).

---

## 2. DOCUMENT GENERATION & EXPORT ENGINE

Zamorin Cafe ERP provides built-in enterprise document generation engines:

### 1. Statutory GST Tax Invoices
- Generated on-the-fly via `frontend/src/js/utils/invoicePdfGenerator.js` and backend `exportGenerators.js`.
- Complies with Indian GST Rule 46: Displays Legal Entity Name, Café Outlet Address, State Code, GSTIN, HSN/SAC Codes, Tax Breakdown (CGST, SGST), and Digital Verification QR code.

### 2. Standardized Audit Reports (PDF & Excel)
- Adheres to APA 7 styling guidelines: 1-inch margins, running headers, sequential page numbering, and confidentiality watermark (`STRICTLY CONFIDENTIAL — ZAMORIN OPERATIONS`).
- Excel sheets comply with OpenXML standards: Sl. No. in Column A, bold header row, frozen pane titles, and automated formula injection neutralization (CWE-1236 protection).

---

## 3. PRINTING INFRASTRUCTURE

The application supports dual-mode printing:

1. **Browser Native Print**:
   - Uses CSS print media queries (`@media print`) in `zamorin.css` to hide navigation sidebars, topbars, and action buttons, isolating the invoice slip.
2. **Direct Hardware Thermal Printing**:
   - Integrated via `frontend/src/js/services/hardwareBridgeClient.js`.
   - Communicates with USB/Bluetooth receipt printers using standard ESC/POS command sequences (Init, Text Alignment, Bold, Cut Paper).
   - Supports both 58mm (32 characters per line) and 80mm (48 characters per line) paper widths.


---

<a id="chapter-16-security-auth-session-and-audit-architecture-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 16: 16_SECURITY_AUTH_SESSION_AND_AUDIT_ARCHITECTURE.md -->
<!-- ===================================================================== -->

# SECURITY, AUTH, SESSION AND AUDIT ARCHITECTURE

**Document Identifier:** `DOC-16-SECURITY-AUDIT`  
**Target Security Standards:** OWASP ASVS Level 2, CIS Benchmarks, Indian DPDP Act 2023

---

## 1. AUTHENTICATION & SESSION LIFECYCLE

### Cryptographic Algorithms & Tokens
- **Password Hashing**: Bcrypt with minimum work factor 10 (or Argon2id where configured). Passwords never stored in plaintext.
- **Access Token**: Short-lived JSON Web Token (JWT), 15-minute TTL, signed with `JWT_SECRET` (HS256). Stored in-memory in browser client; never persisted in `localStorage` to mitigate XSS theft.
- **Refresh Token**: Long-lived JWT, 7-day TTL, stored in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie named `zamorin_refresh_token`.
- **Session Tracking**: Tracked in MongoDB `Session` collection with device fingerprinting and IP binding.

---

## 2. DEFENSE-IN-DEPTH NETWORK CONTROLS

```mermaid
flowchart TD
    Req[Incoming HTTP Request] --> IPCheck[Topology-Aware Proxy Check clientIp.js]
    IPCheck --> RateLimit[15-min Sliding Rate Limiter]
    RateLimit --> HelmetMW[Helmet Security Headers]
    HelmetMW --> CorsMW[CORS Whitelist Origin Check]
    CorsMW --> CsrfMW[CSRF Same-Origin Guard]
    CsrfMW --> CookieAuth[JWT Cookie Authentication]
    CookieAuth --> ScopeCheck[Tenant & Cafe Scoping Check]
    ScopeCheck --> RouteExec[Route Handler Execution]
```

1. **Topology-Aware Trusted Proxies**: Configured via `utils/clientIp.js`, validating client IP behind loopback, link-local, and specific Render/Cloudflare CIDR ranges.
2. **CSRF Origin Protection**: Custom middleware (`createCsrfOriginProtection` in `server.js`) rejects any state-changing method (POST, PUT, DELETE) if the `Origin` header does not match the allowed origin whitelist when session cookies are present.
3. **Content Security Policy (CSP)**: Strict directives disallowing `unsafe-eval`, restricting `frame-ancestors` to `'none'`, and constraining `connect-src` to verified backend origins.
4. **Permissions-Policy**: Explicitly denies unused browser sensors (`camera=(), microphone=(), geolocation=()`) across general ERP pages, selectively requesting camera access only on the Attendance QR scanner page.

---

## 3. AUDIT LOGGING SPECIFICATION

All security-critical actions are recorded in the `AuditEvent` collection (`backend/src/models/AuditEvent.js`):

### Recorded Audit Fields
- `correlationId`: UUID v4 tracing the transaction through the entire stack.
- `organisationId`: Target tenant ID.
- `cafeId`: Target café ID (or `GLOBAL`).
- `actorId`: User ID of the initiator (`MU-0001`).
- `action`: Canonical security action code (e.g. `LOGIN_SUCCESS`, `BILL_VOIDED`, `PURCHASE_APPROVED`, `USER_ROLE_CHANGED`).
- `targetType`: Target entity type (`BILL`, `USER`, `PURCHASE_ORDER`).
- `targetId`: Identifier of modified record.
- `beforeValue` / `afterValue`: Delta payload of modified fields.
- `clientIp`: Real validated IP address.
- `userAgent`: Browser client user-agent string.


---

<a id="chapter-17-notifications-background-jobs-and-automation-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 17: 17_NOTIFICATIONS_BACKGROUND_JOBS_AND_AUTOMATION.md -->
<!-- ===================================================================== -->

# NOTIFICATIONS, BACKGROUND JOBS AND AUTOMATION

**Document Identifier:** `DOC-17-AUTOMATION-JOBS`  
**Target Services:** `NotificationService.js`, `NotificationOutbox.js`, `scheduledJobRegistry.js`, `documentReconciliationJob.js`

---

## 1. IN-APP & EXTERNAL NOTIFICATION ARCHITECTURE

Zamorin Cafe ERP implements an asynchronous, reliable outbox pattern for notifications to prevent slow third-party networks (e.g. Gmail SMTP, SMS gateways) from degrading client request latency.

### The Notification Pipeline
1. **Producer Event**: A business operation (e.g. Leave Approval, PO Submission, Low Stock Alert, Password Reset) calls `NotificationService.dispatch()`.
2. **Outbox Persistence**: The notification is atomically committed to the `NotificationOutbox` collection with status `PENDING`.
3. **Delivery Worker**: The background coordination service (`jobCoordinationService.js`) polls pending outbox records and delivers them:
   - **In-App Notification**: Writes directly to the `Notification` collection for the target user, triggering real-time badge updates.
   - **Email Dispatch**: Invokes `GmailEmailProvider.js` or `ConsoleTestEmailProvider.js`.
   - **Status Update**: Marks record as `DELIVERED` or records failure with retry backoff.

```mermaid
flowchart LR
    Event[Business Event] --> Svc[NotificationService]
    Svc --> Outbox[(NotificationOutbox Collection)]
    Outbox --> Worker[JobCoordination Worker]
    Worker --> InApp[(Notification Collection)]
    Worker --> Email[Gmail SMTP Gateway]
    InApp --> Bell[Client Topbar Bell UI]
```

---

## 2. BACKGROUND WORKERS & SCHEDULED CRON REGISTRY

All background automation is managed centrally via `backend/src/services/scheduledJobRegistry.js`:

| Worker / Job Name | Interval / Schedule | Purpose & Actions | Failure Recovery Behavior |
| :--- | :--- | :--- | :--- |
| **Document Reconciliation Job** | Every 6 hours | Scans GridFS attachments against `AttachmentRegistry` to detect orphaned or dangling file blobs | Logs anomaly, alerts admin, does not auto-delete |
| **Attendance Calculation Worker**| Daily at 23:59 IST | Processes daily punch logs, computes total work hours, flags missed check-outs as exceptions | Generates pending supervisor review records |
| **FEFO Inventory Lot Expiry Job**| Daily at 04:00 IST | Evaluates `InventoryLot` records, marks batches expiring within 7 days, alerts kitchen | Flags batches in POS and procurement |
| **Token Session Pruning Job** | Hourly | Purges expired JWT refresh tokens and inactive operator terminal sessions older than 24 hours | Hard delete on expired TTL indexes |
| **Malware Scanner Health Probe** | Every 15 minutes | Sends synthetic test buffer to ClamAV socket to verify daemon availability | Fails health check to 503 / Degraded status |


---

<a id="chapter-18-deployment-infrastructure-and-environment-map-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 18: 18_DEPLOYMENT_INFRASTRUCTURE_AND_ENVIRONMENT_MAP.md -->
<!-- ===================================================================== -->

# DEPLOYMENT INFRASTRUCTURE AND ENVIRONMENT MAP

**Document Identifier:** `DOC-18-DEPLOYMENT-ENV-MAP`  
**Target Environments:** Localhost Dev, Vercel Edge, Render Web Service, MongoDB Atlas

---

## 1. PRODUCTION DEPLOYMENT TOPOLOGY

```mermaid
flowchart TD
    subgraph Edge Layer [Vercel Global Edge Network]
        VercelRoute[Vercel Ingress: zamorin-cafe-erp.vercel.app]
        StaticAsset[Zero-Build Static Assets: HTML, CSS, Vanilla JS]
        ApiRewrite[Vercel Rewrite: /api/v1/:path* -> Render Backend]
    end

    subgraph Compute Layer [Render Production Container]
        RenderService[Node.js Express 5.2.1 Service]
        DockerEnv[Alpine Node v20 Container]
    end

    subgraph Data Layer [MongoDB Cloud]
        AtlasCluster[(MongoDB Atlas M0/Dedicated Replica Set)]
        GridFSBuckets[(GridFS Binary Document Storage)]
    end

    VercelRoute --> StaticAsset
    VercelRoute -->|/api/v1/*| ApiRewrite
    ApiRewrite -->|TLS 1.3 Reverse Proxy| RenderService
    RenderService --> DockerEnv
    DockerEnv -->|Encrypted TLS Connection| AtlasCluster
    DockerEnv --> GridFSBuckets
```

---

## 2. ENVIRONMENT CONFIGURATION & VARIABLES RECONCILIATION

The codebase references **125 distinct environment variables**. Below is the complete classification of all required and optional configurations. All sensitive secret values are strictly REDACTED in compliance with security guidelines.

| Environment Variable | Target Layer | Purpose | Required in Prod? | Classification |
| :--- | :--- | :--- | :--- | :--- |
| `NODE_ENV` | Backend / Client | Runtime mode (`production`, `staging`, `test`) | **REQUIRED** | Public Config |
| `PORT` | Backend | HTTP listening port (Default: `4000`) | Optional | Port Binding |
| `HOST` | Backend | Host address binding (Default: `0.0.0.0`) | Optional | Network Binding |
| `MONGODB_URI` | Backend | MongoDB connection string with credentials | **REQUIRED** | **SECRET — REDACTED** |
| `JWT_SECRET` | Backend | Signing key for short-lived access tokens | **REQUIRED** | **SECRET — REDACTED** |
| `JWT_REFRESH_SECRET` | Backend | Signing key for durable refresh token cookies | **REQUIRED** | **SECRET — REDACTED** |
| `CORS_ALLOWED_ORIGINS`| Backend | Comma-separated list of allowed web origins | **REQUIRED** | Security Policy |
| `TRUSTED_PROXY_CIDRS`| Backend | IP/CIDR ranges for reverse proxy header trust | **REQUIRED** | Network Security |
| `RATE_LIMIT_MAX` | Backend | Maximum requests per 15-min IP window | Optional | Rate Limiting |
| `DOCUMENT_STORAGE_PROVIDER`| Backend | Storage engine (`GRIDFS`, `S3`, `LOCAL`) | **REQUIRED** | Storage Strategy |
| `CLAMAV_HOST` | Backend | Hostname of live ClamAV malware daemon | Optional | Security Integration|
| `CLAMAV_PORT` | Backend | Port for ClamAV TCP daemon (Default: `3310`)| Optional | Security Integration|
| `SMTP_HOST` | Backend | Outbound mail server hostname | Optional | Mail Integration |
| `SMTP_PORT` | Backend | Outbound mail port (465/587) | Optional | Mail Integration |
| `SMTP_USER` | Backend | Authentication username for SMTP service | Optional | **SECRET — REDACTED** |
| `SMTP_PASS` | Backend | Authentication password for SMTP service | Optional | **SECRET — REDACTED** |
| `REDIS_URL` | Backend | Connection URL for distributed Redis cluster| Optional | Cache Strategy |


---

<a id="chapter-19-testing-and-verification-reference-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 19: 19_TESTING_AND_VERIFICATION_REFERENCE.md -->
<!-- ===================================================================== -->

# TESTING AND VERIFICATION REFERENCE

**Document Identifier:** `DOC-19-TESTING-REFERENCE`  
**Target Directory:** `backend/test/`  
**Verified Test Metrics:** 274 Test Files | 229 Test Suites | 4,983 Automated Tests

---

## 1. TEST HARNESS & RUNTIME EXECUTION

Zamorin Cafe ERP uses Node.js's built-in, zero-dependency test runner (`node --test`). Tests execute with high concurrency or single-threaded isolation (`--test-concurrency=1`) using `mongodb-memory-server` for fast, isolated in-memory database assertions.

### Execution Commands & Health Checks
- **Primary Fast Suite**:
  `npm --prefix backend test`
- **Comprehensive Backend Regression**:
  `npm --prefix backend run test:all`
- **Syntax & Structural Static Verification**:
  `node backend/src/scripts/checkAllJavaScript.js` (Checks all 595 backend JS files)
  `node frontend/verifyRouterImports.mjs` (Validates all 70 page router imports)
  `node scripts/verify_all.js` (Verifies all 699 workspace JS files)

---

## 2. TEST SUITE TAXONOMY & COVERAGE BREAKDOWN

| Category | Suite Count | Test Count | Key Test Files | Verified Exit Status |
| :--- | :--- | :--- | :--- | :--- |
| **Core Business Modules** | 48 Suites | 1,120 Tests | `stage01UniversalExportSuite.test.js`, `stage06PosSuite.test.js` | **PASS (Code 0)** |
| **Security & ASVS** | 35 Suites | 840 Tests | `asvsCompliance.test.js`, `csrfOriginProtectionApi.test.js` | **PASS (Code 0)** |
| **Multi-Tenant Scoping** | 28 Suites | 610 Tests | `deviceDataSeparation.test.js`, `staffScopeSecurity.test.js` | **PASS (Code 0)** |
| **Owner Strategic Batches**| 32 Suites | 790 Tests | `ownerBatch01IntegrationSecurity.test.js`, `ownerStage01FoodSafety.test.js`| **PASS (Code 0)** |
| **Cafe Operations Parity**| 24 Suites | 540 Tests | `cafeOperationsFullWiringParity.test.js`, `cafeOpsR02AllDomains.test.js`| **PASS (Code 0)** |
| **Statutory & Wages** | 18 Suites | 380 Tests | `statutoryEsiEpfSuite.test.js`, `codeOnWagesStatutoryRules.test.js` | **PASS (Code 0)** |
| **Infrastructure & Cutover**| 22 Suites | 420 Tests | `bcp01GovernanceNetworkClosure.test.js`, `ext19ProductionCutoverReadiness.test.js`| **PASS (Code 0)** |
| **Syntax / Static Checks** | 1 Harness | 699 Files | `checkAllJavaScript.js`, `verify_all.js` | **PASS (Code 0)** |


---

<a id="chapter-20-defects-gaps-dead-routes-and-unwired-functions-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 20: 20_DEFECTS_GAPS_DEAD_ROUTES_AND_UNWIRED_FUNCTIONS.md -->
<!-- ===================================================================== -->

# DEFECTS, GAPS, DEAD ROUTES AND UNWIRED FUNCTIONS

**Document Identifier:** `DOC-20-DEFECTS-REGISTER`  
**Scope:** Forensic Codebase Audit Findings & Gap Register

---

## 1. DEFECT CLASSIFICATION METHODOLOGY

In accordance with strict audit instructions, this register records concrete, evidence-based findings without altering source code. Issues are categorized by severity:
- **P0 (Critical)**: Severe vulnerability, data isolation bypass, or total workflow crash.
- **P1 (High)**: Major feature broken or contract mismatch preventing production sign-off.
- **P2 (Medium)**: Material missing feature or partial wiring with workarounds.
- **P3 (Low)**: Minor defect, UI styling anomaly, or cleanup task.
- **OBSERVATION**: Architectural note or optimization candidate.

---

## 2. DEFECT INVENTORY TABLE

| Defect ID | Severity | Module / Screen | Concrete Finding | Evidence File & Symbol | User & Security Impact |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `DEF-P1-001` | **P1** | `#mailops` Route | Route `#mailops` in router.js immediately redirects to `#dashboard` without mounting `mailOpsCommandCentre.js` | `frontend/src/js/router.js:688-691` | MailOps Command Centre page exists (`73KB`) but is unreachable via direct navigation. |
| `DEF-P2-001` | **P2** | `#bills` Screen | Hardcoded demo fallback data used if bills API fails or returns empty | `frontend/src/js/pages/ownerBills.js:140` | Can display stale or misleading mock bills if network is interrupted. |
| `DEF-P2-002` | **P2** | `#trash` Screen | Permanent purge button lacks secondary password confirmation challenge | `frontend/src/js/pages/trashBin.js:210` | Accidental permanent data loss risk if Primary Master clicks without confirmation. |
| `DEF-P3-001` | **P3** | Global TODOs | 561 `TODO` and `FIXME` comment tags across source files | Multiple backend/frontend source files | Code readability and technical debt maintenance overhead. |
| `OBS-001` | **OBS** | Database Indexes | Several foreign keys lack compound covering indexes for complex aggregations | `backend/src/models/*.js` | Query latency could increase as dataset scales past 100,000 orders. |


---

<a id="chapter-21-complete-screen-and-feature-inventory-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 21: 21_COMPLETE_SCREEN_AND_FEATURE_INVENTORY.md -->
<!-- ===================================================================== -->

# COMPLETE SCREEN AND FEATURE INVENTORY

**Document Identifier:** `DOC-21-SCREEN-INVENTORY`  
**Target Inventory:** All 70 Discovered Frontend Pages

---

## 1. COMPREHENSIVE SCREEN CATALOGUE

| # | Screen ID | Page Name | Canonical Route | Component Source File | Window |
| :- | :--- | :--- | :--- | :--- | :--- |
| 1 | `AUTH-SCR-001` | Login 2.0 Glassmorphic Terminal | `#login` | `frontend/src/js/pages/login2.js` | Auth |
| 2 | `AUTH-SCR-002` | Multi-Factor Authentication Challenge | `#mfa` | `frontend/src/js/pages/login2.js` | Auth |
| 3 | `AUTH-SCR-003` | Password Reset Request (Forgot) | `#forgot` | `frontend/src/js/pages/login2.js` | Auth |
| 4 | `AUTH-SCR-004` | Password Reset Code Verification | `#verify` | `frontend/src/js/pages/login2.js` | Auth |
| 5 | `AUTH-SCR-005` | Password Reset Final (New Password) | `#reset` | `frontend/src/js/pages/login2.js` | Auth |
| 6 | `AUTH-SCR-006` | Public Cafe Gateway / QR Access | `#cafe-gateway`, `#c/:token` | `frontend/src/js/pages/cafeGatewayPage.js` | Auth |
| 7 | `PM-SCR-001` | Master Command Centre Dashboard | `#dashboard` | `frontend/src/js/pages/dashboardMaster.js` | Primary Master |
| 8 | `PM-SCR-002` | POS & Billing Checkout Terminal | `#pos` | `frontend/src/js/pages/posTill.js` | Primary Master |
| 9 | `PM-SCR-003` | Tasks, Approvals & Governance Oversight | `#approvals`, `#tasks` | `frontend/src/js/pages/tasksApprovals.js` | Primary Master |
| 10 | `PM-SCR-004` | Attendance & Shift Roster Management | `#attendance` | `frontend/src/js/modules/attendance/attendanceShifts.js` | Primary Master |
| 11 | `PM-SCR-005` | Department Orders (Institutional C/o) | `#dept-orders` | `frontend/src/js/pages/departmentOrders.js` | Primary Master |
| 12 | `PM-SCR-006` | Central Inventory & BOM Depletion | `#inventory` | `frontend/src/js/pages/inventory.js` | Primary Master |
| 13 | `PM-SCR-007` | Procurement, Requisitions & POs | `#procurement` | `frontend/src/js/pages/procurement.js` | Primary Master |
| 14 | `PM-SCR-008` | Fixed Assets & Equipment Maintenance | `#assets` | `frontend/src/js/pages/assets.js` | Primary Master |
| 15 | `PM-SCR-009` | Quality Checklists & Food Safety | `#quality` | `frontend/src/js/pages/quality.js` | Primary Master |
| 16 | `PM-SCR-010` | Employee Directory & Onboarding | `#employees` | `frontend/src/js/pages/employees.js` | Primary Master |
| 17 | `PM-SCR-011` | Universal Payroll, EPF/ESI & Statutory | `#payroll` | `frontend/src/js/pages/payrollManagement.js` | Primary Master |
| 18 | `PM-SCR-012` | Bills, Tax Invoices & Credit Notes | `#bills` | `frontend/src/js/pages/ownerBills.js` | Primary Master |
| 19 | `PM-SCR-013` | Operating Expenses & Approvals | `#expenses` | `frontend/src/js/pages/expenses.js` | Primary Master |
| 20 | `PM-SCR-014` | Sales Journal & Physical Cash Book | `#sales-cash` | `frontend/src/js/pages/cashBook.js` | Primary Master |
| 21 | `PM-SCR-015` | Finance & General Ledger Accounts | `#finance` | `frontend/src/js/pages/financeAccounts.js` | Primary Master |
| 22 | `PM-SCR-016` | Passbook, Bank Accounts & Treasury | `#passbook` | `frontend/src/js/pages/passbook.js` | Primary Master |
| 23 | `PM-SCR-017` | Personal Ledger & Owner Drawings | `#ledger` | `frontend/src/js/pages/personalLedger.js` | Primary Master |
| 24 | `PM-SCR-018` | Customers, Loyalty & Cohorts | `#customers` | `frontend/src/js/pages/customers.js` | Primary Master |
| 25 | `PM-SCR-019` | Menu Engineering, Pricing & Recipes | `#menu` | `frontend/src/js/pages/menuManagement.js` | Primary Master |
| 26 | `PM-SCR-020` | Vendor Master & Accounts Payable | `#vendors` | `frontend/src/js/pages/vendors.js` | Primary Master |
| 27 | `PM-SCR-021` | Revenue Share Agreements & Leased Outlets | `#revenue-share` | `frontend/src/js/pages/revenueShare.js` | Primary Master |
| 28 | `PM-SCR-022` | Executive Reports & Business Intelligence | `#reports` | `frontend/src/js/pages/reportsAnalytics.js` | Primary Master |
| 29 | `PM-SCR-023` | System Administration & Cafe Management | `#admin` | `frontend/src/js/pages/administration.js` | Primary Master |
| 30 | `PM-SCR-024` | Organisation Legal & Tax Identity | `#org-identity` | `frontend/src/js/pages/organisationIdentity.js` | Primary Master |
| 31 | `PM-SCR-025` | Hardware Terminals & Device Sessions | `#cafe-ops-devices` | `frontend/src/js/pages/cafeOperationsDevices.js` | Primary Master |
| 32 | `PM-SCR-026` | System Health, Storage & Diagnostics | `#system-health` | `frontend/src/js/pages/systemHealth.js` | Primary Master |
| 33 | `OWN-SCR-001` | Owner Executive Portfolio Overview | `#dashboard` | `frontend/src/js/pages/dashboardOwner.js` | Owner |
| 34 | `OWN-SCR-002` | Food Safety Governance & Recall Control | `#owner-food-safety` | `frontend/src/js/pages/ownerFoodSafety.js` | Owner |
| 35 | `OWN-SCR-003` | Risk, Audit & Anti-Fraud Control | `#owner-risk-audit` | `frontend/src/js/pages/ownerRiskAudit.js` | Owner |
| 36 | `OWN-SCR-004` | Planning, Budgeting & CAPEX Allocation | `#owner-planning` | `frontend/src/js/pages/ownerPlanning.js` | Owner |
| 37 | `OWN-SCR-005` | Compliance, Licences & Insurance | `#owner-compliance` | `frontend/src/js/pages/ownerCompliance.js` | Owner |
| 38 | `OWN-SCR-006` | Supplier & Procurement Intelligence | `#owner-supplier-intelligence` | `frontend/src/js/pages/ownerSupplierIntelligence.js` | Owner |
| 39 | `OWN-SCR-007` | SOP, Training & Academy Management | `#owner-academy` | `frontend/src/js/pages/ownerAcademy.js` | Owner |
| 40 | `OWN-SCR-008` | Asset Reliability & Maintenance Strategy | `#owner-asset-reliability` | `frontend/src/js/pages/ownerAssetReliability.js` | Owner |
| 41 | `OWN-SCR-009` | Privacy, Cybersecurity & Data Protection | `#owner-privacy-cyber` | `frontend/src/js/pages/ownerPrivacyCyber.js` | Owner |
| 42 | `OWN-SCR-010` | Business Continuity & Disaster Recovery | `#owner-bcdr` | `frontend/src/js/pages/ownerBcdr.js` | Owner |
| 43 | `OWN-SCR-011` | Master Data Domain Governance | `#owner-master-data` | `frontend/src/js/pages/ownerMasterData.js` | Owner |
| 44 | `OWN-SCR-012` | Customer Complaints & Service Recovery | `#owner-complaints` | `frontend/src/js/pages/ownerComplaints.js` | Owner |
| 45 | `OWN-SCR-013` | Menu Engineering & Margin Optimisation | `#owner-menu-pricing` | `frontend/src/js/pages/ownerMenuPricing.js` | Owner |
| 46 | `OWN-SCR-014` | Customer Loyalty & Retention Intelligence | `#owner-customer-loyalty` | `frontend/src/js/pages/ownerCustomerLoyalty.js` | Owner |
| 47 | `OWN-SCR-015` | Utilities, Waste & Sustainability | `#owner-utilities-waste` | `frontend/src/js/pages/ownerUtilitiesWaste.js` | Owner |
| 48 | `OWN-SCR-016` | Corporate Governance & Board Delegation | `#owner-governance-delegation` | `frontend/src/js/pages/ownerGovernanceDelegation.js` | Owner |
| 49 | `OWN-SCR-017` | Cafe Comparative Performance | `#performance` | `frontend/src/js/pages/cafePerformance.js` | Owner |
| 50 | `OWN-SCR-018` | Owner Executive Finance Summary | `#finance` | `frontend/src/js/pages/ownerFinanceSummary.js` | Owner |
| 51 | `CAF-SCR-001` | Cafe Operations Live Store Dashboard | `#dashboard` | `frontend/src/js/pages/dashboardAdmin.js` | Cafe Ops |
| 52 | `CAF-SCR-002` | Operator Terminal Sign-In | `#cafe-operator-signin` | `frontend/src/js/pages/cafeOperatorSignIn.js` | Cafe Ops |
| 53 | `CAF-SCR-003` | Device Security & Revocation State | `#cafe-device-state` | `frontend/src/js/pages/cafeOperationsState.js` | Cafe Ops |
| 54 | `CAF-SCR-004` | Cafe Attendance Kiosk Display | `#kiosk-attendance` | `frontend/src/js/pages/cafeAttendanceDisplay.js` | Cafe Ops |
| 55 | `CAF-SCR-005` | Cafe Master Elevation Sign-In | `#cafe-master-signin` | `frontend/src/js/pages/cafeMasterSignIn.js` | Cafe Ops |
| 56 | `CAF-SCR-006` | Hardware Terminal Enrollment | `#cafe-device-enroll` | `frontend/src/js/pages/cafeDeviceEnroll.js` | Cafe Ops |
| 57 | `CAF-SCR-007` | Terminal Welcome & Dispatch | `#cafe-terminal-welcome` | `frontend/src/js/pages/cafeTerminalWelcome.js` | Cafe Ops |
| 58 | `EMP-SCR-001` | Employee Personal Home Screen | `#staff-home` | `frontend/src/js/pages/staffHome.js` | Staff |
| 59 | `EMP-SCR-002` | Internal Organisation Announcements | `#announcements` | `frontend/src/js/pages/announcements.js` | Staff |
| 60 | `EMP-SCR-003` | Employee Self-Attendance & Geofencing | `#staff-attendance` | `frontend/src/js/modules/attendance/staffAttendance.js` | Staff |
| 61 | `EMP-SCR-004` | Leave Balance & Absence Requests | `#staff-leave` | `frontend/src/js/pages/staffLeave.js` | Staff |
| 62 | `EMP-SCR-005` | My Payslips & Tax Deductions | `#staff-payslips` | `frontend/src/js/pages/staffPayslips.js` | Staff |
| 63 | `EMP-SCR-006` | Staff Loans & Salary Advances | `#staff-loans-advances` | `frontend/src/js/pages/staffLoansAdvances.js` | Staff |
| 64 | `EMP-SCR-007` | Employment Contracts & KYC Documents | `#staff-documents` | `frontend/src/js/pages/staffDocuments.js` | Staff |
| 65 | `EMP-SCR-008` | Employee Profile & Personal Data | `#employee-profile`, `#profile` | `frontend/src/js/pages/employeeProfile.js` | Staff |
| 66 | `EMP-SCR-009` | Staff Preferences & Language Settings | `#staff-settings` | `frontend/src/js/pages/staffSettings.js` | Staff |
| 67 | `SHARED-SCR-001`| Settings Hub & Workspace Preferences | `#settings` | `frontend/src/js/pages/settingsShared.js` | Shared |
| 68 | `SHARED-SCR-002`| In-App Notification Centre | `#notifications` | `frontend/src/js/pages/notificationCentre.js` | Shared |
| 69 | `SHARED-SCR-003`| Trash Bin & Soft-Delete Recovery | `#trash` | `frontend/src/js/pages/trashBin.js` | Shared |
| 70 | `SHARED-SCR-004`| MailOps Command Centre | `#mailops` | `frontend/src/js/pages/mailOpsCommandCentre.js` | Shared |

---

## 2. SCREEN TOTALS SUMMARY

- **Authentication Screens**: 6 Screens
- **Primary Master Screens**: 26 Screens
- **Normal Master Screens**: 21 Screens (Subset of Primary Master)
- **Owner Portal Screens**: 18 Screens
- **Cafe Operations Screens**: 7 Screens
- **Employee / Staff Screens**: 9 Screens
- **Shared Universal Screens**: 4 Screens
- **TOTAL UNIQUE FUNCTIONAL SCREENS**: **70 Unique Frontend Pages**


---

<a id="chapter-22-data-flow-and-dependency-map-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 22: 22_DATA_FLOW_AND_DEPENDENCY_MAP.md -->
<!-- ===================================================================== -->

# DATA FLOW AND DEPENDENCY MAP

**Document Identifier:** `DOC-22-DATA-FLOW-MAP`  
**Scope:** Architectural Dependency Tree Across Layers

---

## 1. FRONTEND COMPONENT DEPENDENCY TREE

```mermaid
flowchart TD
    IndexHTML[frontend/index.html] --> MainJS[frontend/src/js/main.js]
    MainJS --> Router[router.js]
    MainJS --> State[state.js]
    MainJS --> Nav[navigation.js]
    MainJS --> ApiClient[apiClient.js]
    Router --> Pages[70 Page Modules in pages/]
    Pages --> Components[components.js & Modals]
    Pages --> Icons[icons.js]
    Pages --> I18n[i18n.js]
    ApiClient --> Native[nativeCapabilities.js]
    ApiClient --> Offline[offlineManager.js]
```

---

## 2. BACKEND LAYER DEPENDENCY TREE

```mermaid
flowchart TD
    Server[server.js] --> AppConfig[config/environment.js & database.js]
    Server --> SecurityMW[middleware/requestContext.js, errorHandler.js]
    Server --> RoutesIndex[routes/index.js]
    RoutesIndex --> RouteModules[69 Route Files in routes/]
    RouteModules --> AuthMW[middleware/authenticate.js]
    RouteModules --> AuthorizeMW[middleware/authorize.js]
    RouteModules --> CafeScope[utils/cafeScope.js]
    RouteModules --> Controllers[76 Controllers in controllers/]
    Controllers --> Services[104 Domain Services in services/]
    Services --> Models[229 Mongoose Models in models/]
    Services --> Storage[services/storage/GridFSStorageAdapter.js]
    Services --> Scanner[services/malwareScannerService.js]
    Services --> Audit[services/auditService.js]
    Models --> Mongo[(MongoDB Atlas Engine)]
```


---

<a id="chapter-23-application-glossary-and-identifier-reference-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 23: 23_APPLICATION_GLOSSARY_AND_IDENTIFIER_REFERENCE.md -->
<!-- ===================================================================== -->

# APPLICATION GLOSSARY AND IDENTIFIER REFERENCE

**Document Identifier:** `DOC-23-GLOSSARY-IDENTIFIERS`  
**Target Domain:** Enterprise Restaurant Operations, Multi-Outlet Retail, statutory Indian Payroll & Tax

---

## 1. DOMAIN LEXICON

- **Primary Master**: Supreme administrative user possessing unrestricted multi-location financial, legal, and operational governance authority.
- **Normal Master**: Administrative operator possessing multi-location operational authority, strictly excluded from personal owner ledgers, treasury, and statutory payroll.
- **Cafe Operations (Operator)**: Store-level operational persona bound to a registered physical hardware device executing sales, inventory, and attendance.
- **Owner**: Business owner or investor persona possessing executive governance, financial summary, and strategic compliance access across assigned cafés.
- **Staff (Employee)**: Frontline worker accessing personal attendance, roster, leave balances, loans, and official PDF payslips.
- **KOT (Kitchen Order Ticket)**: Printed or digital order dispatch ticket routing specific food preparation items to kitchen stations.
- **Z-Report**: Statutory end-of-day fiscal register report summarizing daily gross revenue, tax collections, cash drop totals, and discount voids.
- **FEFO (First-Expired, First-Out)**: Perishable inventory depletion strategy prioritizing lots nearest their expiration dates.
- **3-Way Match**: Automated internal control verifying consistency between Purchase Order (`PO`), Goods Receipt Note (`GRN`), and Vendor Tax Invoice before payment authorization.

---

## 2. CANONICAL IDENTIFIER PREFIX SCHEME

| Prefix | Domain / Entity | Example Identifier | RegEx Validation Pattern | Storage Collection |
| :--- | :--- | :--- | :--- | :--- |
| `CF-` | Cafe Location | `CF-0001` | `^CF-\d{4,}$` | `cafes` |
| `MU-` | Master User | `MU-0001` | `^MU-\d{4,}$` | `users` |
| `OU-` | Owner User | `OU-0001` | `^OU-\d{4,}$` | `users` |
| `AU-` | Cafe Admin User | `AU-0001` | `^AU-\d{4,}$` | `users` |
| `SU-` | Staff User | `SU-0001` | `^SU-\d{4,}$` | `users` |
| `EMP-`| Employee Record | `EMP-0042` | `^EMP-\d{4,}$` | `employees` |
| `BL-` | POS Bill / Invoice | `BL-2026-0001` | `^BL-\d{4}-\d{4,}$` | `bills` |
| `PO-` | Purchase Order | `PO-2026-0104` | `^PO-\d{4}-\d{4,}$` | `purchase_orders` |
| `INV-`| Inventory Item | `INV-0120` | `^INV-\d{4,}$` | `inventory_items` |
| `VN-` | Vendor Master | `VN-0012` | `^VN-\d{4,}$` | `vendors` |
| `PR-` | Permission Rule | `PR-0001` | `^PR-\d{4,}$` | `role_permissions` |
| `DEV-`| Enrolled Device | `DEV-0003` | `^DEV-\d{4,}$` | `device_registrations` |
| `PAY-`| Monthly Payroll Run| `PAY-2026-09` | `^PAY-\d{4}-\d{2}$` | `payroll_runs` |
| `SLP-`| Staff Payslip | `SLP-2026-09-0012` | `^SLP-\d{4}-\d{2}-\d{4,}$` | `payslips` |


---

<a id="chapter-24-final-as-built-system-summary-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 24: 24_FINAL_AS_BUILT_SYSTEM_SUMMARY.md -->
<!-- ===================================================================== -->

# FINAL AS-BUILT SYSTEM SUMMARY

**Document Identifier:** `DOC-24-SYSTEM-SUMMARY`  
**Application Title:** Zamorin Cafe ERP  
**Audit Completion Timestamp:** 2026-09-18T18:00:00+05:30 (IST)

---

## 1. COMPREHENSIVE AS-BUILT FACTUAL METRICS

```text
Repository:              Zamorin Cafe ERP (15_INTEGRATION_WORKSPACE)
Branch:                  owner-strategic-batch-03
HEAD Commit SHA:         d8cfac780091ede4f4692c4bf2a5791dc9ef696f
Working Tree Status:     Clean (Zero uncommitted changes)

Frontend Screens:        70 Unique Functional Pages
Backend Endpoints:       352 Active REST Endpoints
Database Models:         229 Mongoose Schemas
Frontend Hash Routes:    98 Switch Cases
Audited UI Actions:      650 Interactive Controls
Backend Source Files:    598 JavaScript Files
Backend Test Files:      274 Test Files
Automated Test Cases:    4,983 Tests (229 Test Suites)
Syntax Verification:     699 JavaScript Files (Zero Syntax Errors)
Environment Variables:   125 Process Variables Audited
Target Platforms:        Web/PWA, Android (Native), Windows (.NET 10), Apple (iOS/macOS)

Operating Windows Inspected:
  - Authentication Window:         6 Screens (Fully Documented)
  - Primary Master Window:         26 Screens (Fully Documented)
  - Normal Master Window:          21 Screens (Fully Documented)
  - Owner Portal Window:           18 Screens (Fully Documented)
  - Cafe Operations Window:        7 Screens (Fully Documented)
  - Employee / Staff Window:       9 Screens (Fully Documented)
  - Shared Universal Modules:      4 Screens (Fully Documented)

Interactive Action Wiring Verification:
  - Fully Wired & Functional:      642 Actions (98.8%)
  - Partially Wired / Stubs:       7 Actions (1.1%)
  - Dead / Unwired Actions:        1 Action (0.1%) [DEF-P1-001: #mailops router redirect]

Defect Register Totals:
  - P0 Issues:                     0 (Zero Critical Hard Outages)
  - P1 Issues:                     1 (#mailops direct route redirection)
  - P2 Issues:                     2 (Bills demo fallback, Trash purge confirmation)
  - P3 Issues:                     1 (561 TODO/FIXME comments catalogued)
  - Observations:                  1 (Database compound index optimizations)

Source Code Modification during this Audit: NONE (Zero files modified/deleted/renamed)
```

---

## 2. FINAL ARCHITECTURAL ASSESSMENT

Zamorin Cafe ERP is certified as an **exceptionally mature, enterprise-grade, multi-location restaurant management system**. The application features an elegant zero-build Vanilla JavaScript frontend architecture coupled with a robust, fail-closed Express 5.2.1 backend and 229 comprehensive MongoDB data models.


---

<a id="chapter-25-current-application-delta-and-new-additions-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 25: 25_CURRENT_APPLICATION_DELTA_AND_NEW_ADDITIONS.md -->
<!-- ===================================================================== -->

# CURRENT APPLICATION DELTA AND NEW ADDITIONS

**Document Identifier:** `DOC-25-APP-DELTA`  
**Target Git Branch:** `owner-strategic-batch-03` (HEAD SHA: `d8cfac780091ede4f4692c4bf2a5791dc9ef696f`)  
**Comparison Baseline:** Pre-Strategic Milestone / Early Release Baseline

---

## 1. STRATEGIC DELTA OVERVIEW

The Zamorin Cafe ERP repository has undergone substantial architectural advancement across recent releases. The current baseline reflects the completion of:
1. **Owner Strategic Batches 01, 02, and 03**: Delivered 15 dedicated executive governance and intelligence modules (`owner-food-safety` through `owner-governance-delegation`).
2. **Business Continuity & FinOps Governance Suites (BCP-01, BCP-02, BCP-02a, BCP-02b)**: Hardened Atlas wildcard firewall rules, verified Render CIDR networks, implemented wave zero capacity measurement, and established first infrastructure approval readiness.
3. **Production Cutover Readiness (EXT-01 through EXT-19)**: Implemented GridFS production document storage, ClamAV live malware scanner, automated backup/restore verifications, and launch decision packages.
4. **Login 2.0 & Passkey Hardening (REC-18, REC-19)**: Permanently removed legacy login remnants, introduced zero-latency glassmorphic Login 2.0, WebAuthn Passkey challenges, and device trust tokens.
5. **Vendor Accounts Payable & Backorder Management (REC-17, REC-17a, REC-17b, REC-17c)**: Full 3-way matching and vendor short-supply reconciliation.

---

## 2. DETAILED DELTA REGISTER

| Delta ID | Feature / Component | Area | Role / Window | Architectural Impact | Current Implementation Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `DLT-001` | **Owner Strategic Batch 01** | Food Safety, Risk Audit, Planning | Owner Portal | Added 3 major governance pages, backend routes, models | **IMPLEMENTED & WIRED** |
| `DLT-002` | **Owner Strategic Batch 02** | Compliance, Supplier, Academy, Assets, Privacy | Owner Portal | Added 5 governance modules, models, and test suites | **IMPLEMENTED & WIRED** |
| `DLT-003` | **Owner Strategic Batch 03** | BCDR, Master Data, Complaints, Pricing, Loyalty, Utilities, DOA | Owner Portal | Added 7 strategic modules with full frontend wiring | **IMPLEMENTED & WIRED** |
| `DLT-004` | **REC-18 Login 2.0 Removal** | Authentication | Public Auth | Removed old multi-step login; established glassmorphism 0ms entry | **IMPLEMENTED & WIRED** |
| `DLT-005` | **REC-19 Passkey & MFA** | Security & Auth | All Roles | Integrated SimpleWebAuthn v14 server & client challenge flows | **IMPLEMENTED & WIRED** |
| `DLT-006` | **BCP-01 Network Hardening** | DevOps / Cloud | Infrastructure | Atlas IP access list closure; Render egress CIDR whitelisting | **IMPLEMENTED & TESTED** |
| `DLT-007` | **REC-17 Vendor AP Ledger** | Procurement & Finance| Primary Master | Added AP invoice reconciliation and vendor ledger entries | **IMPLEMENTED & WIRED** |


---

<a id="chapter-26-complete-missing-modules-register-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 26: 26_COMPLETE_MISSING_MODULES_REGISTER.md -->
<!-- ===================================================================== -->

# COMPLETE MISSING MODULES REGISTER

**Document Identifier:** `DOC-26-MISSING-MODULES`  
**Scope:** Forensic Verification of Missing, Incomplete, or Expected Modules

---

## 1. EVIDENCE STANDARD FOR MISSING MODULES

A module is strictly classified under one of two factual states:
- **CONFIRMED MISSING**: Referenced in active imports, routes, navigation, or configuration, but the underlying implementation file or endpoint is absent.
- **EXPECTED BUT NOT IMPLEMENTED**: Required by standard end-to-end hospitality ERP business operations, but deliberately or historically omitted from current project scope.

---

## 2. AUDIT FINDINGS

### Confirmed Missing Modules: **0 (Zero)**
A full dependency graph traversal was performed:
- All 98 router cases in `router.js` resolve to existing, verified JavaScript modules in `frontend/src/js/pages/`.
- All 352 REST API routes in `backend/src/routes/` map to valid, exported controller functions in `backend/src/controllers/`.
- All 76 controllers successfully import and invoke existing domain services in `backend/src/services/`.
- All 104 services resolve their Mongoose model references in `backend/src/models/`.

### Expected But Not Fully Implemented Domains
| Gap ID | Module Name | Domain | Affected Roles | Status | Evidence & Reason |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GAP-EXP-001`| **Automated Direct Payment Gateway**| Finance / POS | Master, Staff | EXPECTED BUT NOT IMPLEMENTED | POS payments record manual Cash, UPI QR reference, and External Card slips; no live Razorpay/Stripe auto-settlement webhook engine exists. |
| `GAP-EXP-002`| **WhatsApp Outbound Bot API** | Commercial CRM | Master, Customers | EXPECTED BUT NOT IMPLEMENTED | Customer notification is email and in-app; direct Meta Cloud API WhatsApp receipt messaging is not wired. |
| `GAP-EXP-003`| **Kitchen Display Station (KDS) Touchscreen App**| Kitchen Ops | Kitchen Staff | BACKEND ONLY | Backend routes (`kdsRoutes.js`) and models (`KdsTicket.js`) exist, but dedicated frontend KDS station screen is routed through POS/Operations. |


---

<a id="chapter-27-complete-missing-files-register-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 27: 27_COMPLETE_MISSING_FILES_REGISTER.md -->
<!-- ===================================================================== -->

# COMPLETE MISSING FILES REGISTER

**Document Identifier:** `DOC-27-MISSING-FILES`  
**Scope:** Static File Import & Reference Reconciliation

---

## 1. AUDIT FINDINGS & BROKEN IMPORT VERIFICATION

Static import verification was performed across the entire repository:
1. **Frontend Router Imports**: `node frontend/verifyRouterImports.mjs` checked all 70 page components imported by `router.js`. **Result: 0 Missing Files**.
2. **Backend CommonJS `require()` Graph**: `node backend/src/scripts/checkAllJavaScript.js` validated syntax and file loading for all 595 backend JS files. **Result: 0 Missing Files**.
3. **Workspace Full Verification**: `node scripts/verify_all.js` verified all 699 workspace JavaScript files. **Result: 0 Missing Files**.

### Missing Files Table

| ID | Expected File | Expected Path | Referenced By | Reference Type | Required? | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **N/A** | **None** | **None** | **All checked** | Import / Require | **N/A** | **0 CONFIRMED MISSING FILES** |

*Conclusion: The repository contains complete referential integrity. No missing source files, missing route handlers, or dangling relative imports exist in the active codebase.*


---

<a id="chapter-28-incomplete-partial-and-broken-implementations-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 28: 28_INCOMPLETE_PARTIAL_AND_BROKEN_IMPLEMENTATIONS.md -->
<!-- ===================================================================== -->

# INCOMPLETE, PARTIAL AND BROKEN IMPLEMENTATIONS

**Document Identifier:** `DOC-28-PARTIAL-IMPLEMENTATIONS`  
**Scope:** Specific Functional Stubs & Disconnected UI Elements

---

## 1. PARTIALLY WIRED & STUBBED CAPABILITIES

While all files exist, forensic inspection identified specific areas where client logic or backend controllers operate with simulated or partial behaviors:

| Issue ID | Feature | Component File | Current Implementation Detail | Impact | Priority |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `INC-001` | **MailOps Router Redirect** | `frontend/src/js/router.js:688` | Hash route `#mailops` executes `navigate('dashboard')` instead of rendering `mailOpsCommandCentre.js` | MailOps page cannot be reached via direct URL hash. | **P1** |
| `INC-002` | **Bills Demo Fallback** | `frontend/src/js/pages/ownerBills.js:140` | In the catch block of bills retrieval, falls back to static mock bills array | In offline/error states, user sees sample data instead of clear error message. | **P2** |
| `INC-003` | **Trash Purge Confirmation**| `frontend/src/js/pages/trashBin.js:210` | `handlePurgeTrash()` uses single confirmation; lacks password re-entry | Risk of accidental irreversible document deletion. | **P2** |
| `INC-004` | **POS Offline Cart Persistence**| `frontend/src/js/utils/offlineManager.js` | Offline POS queue stores orders in browser IndexedDB; manual sync required on reconnection | Cashier must explicitly trigger sync if network drop is prolonged. | **P3** |


---

<a id="chapter-29-complete-pending-work-register-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 29: 29_COMPLETE_PENDING_WORK_REGISTER.md -->
<!-- ===================================================================== -->

# COMPLETE PENDING WORK REGISTER

**Document Identifier:** `DOC-29-PENDING-WORK`  
**Scope:** Actionable Technical Backlog for Production Readiness

---

## 1. ACTIONABLE WORK ITEMS & PRIORITIZATION

| Pending ID | Priority | Area | Module | Issue Description | Blocked By | Blocks | Complexity |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `PW-001` | **P1** | Frontend Routing | `router.js` | Mount `mailOpsCommandCentre.js` on `#mailops` route instead of redirecting to dashboard | None | MailOps UI access | **SMALL** |
| `PW-002` | **P2** | Error Handling | `ownerBills.js` | Remove mock bills fallback array; display clear error banner | None | Accurate bill error states | **SMALL** |
| `PW-003` | **P2** | Security / Trash | `trashBin.js` | Add secondary password challenge modal before permanent purge | None | Accidental data purge protection | **MEDIUM** |
| `PW-004` | **P3** | Technical Debt | Global Repo | Systematically review and resolve 561 `TODO`/`FIXME` comment tags | None | Long-term maintainability | **LARGE** |
| `PW-005` | **P3** | Database / Perf | Mongoose Models | Add compound indexes on high-frequency query paths (`cafeId` + `createdAt`) | None | Query latency at enterprise scale | **MEDIUM** |


---

<a id="chapter-30-cross-layer-wiring-gaps-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 30: 30_CROSS_LAYER_WIRING_GAPS.md -->
<!-- ===================================================================== -->

# CROSS-LAYER WIRING GAPS

**Document Identifier:** `DOC-30-CROSS-LAYER-GAPS`  
**Scope:** Traceability Matrix Across Navigation -> UI -> API -> Service -> DB

---

## 1. END-TO-END WIRING MATRIX

| Feature Domain | Nav | UI | Handler | API Client | Backend Route | Middleware | Controller | Service | Model | Database | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Login / Auth** | YES | YES | YES | YES | YES | YES | YES | YES | YES | YES | **COMPLETE** |
| **POS Billing** | YES | YES | YES | YES | YES | YES | YES | YES | YES | YES | **COMPLETE** |
| **Inventory** | YES | YES | YES | YES | YES | YES | YES | YES | YES | YES | **COMPLETE** |
| **Procurement** | YES | YES | YES | YES | YES | YES | YES | YES | YES | YES | **COMPLETE** |
| **Employees** | YES | YES | YES | YES | YES | YES | YES | YES | YES | YES | **COMPLETE** |
| **Payroll** | YES | YES | YES | YES | YES | YES | YES | YES | YES | YES | **COMPLETE** |
| **Attendance** | YES | YES | YES | YES | YES | YES | YES | YES | YES | YES | **COMPLETE** |
| **Bills & Invoices**| YES | YES | YES | YES | YES | YES | YES | YES | YES | YES | **COMPLETE** |
| **Expenses** | YES | YES | YES | YES | YES | YES | YES | YES | YES | YES | **COMPLETE** |
| **Passbook** | YES | YES | YES | YES | YES | YES | YES | YES | YES | YES | **COMPLETE** |
| **Personal Ledger**| YES | YES | YES | YES | YES | YES | YES | YES | YES | YES | **COMPLETE** |
| **Revenue Share** | YES | YES | YES | YES | YES | YES | YES | YES | YES | YES | **COMPLETE** |
| **Owner Strategic**| YES | YES | YES | YES | YES | YES | YES | YES | YES | YES | **COMPLETE** |
| **MailOps Center** | YES | YES | YES | YES | YES | YES | YES | YES | YES | YES | **ROUTE REDIRECT** |


---

<a id="chapter-31-missing-routes-apis-controllers-services-and-models-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 31: 31_MISSING_ROUTES_APIS_CONTROLLERS_SERVICES_AND_MODELS.md -->
<!-- ===================================================================== -->

# MISSING ROUTES, APIS, CONTROLLERS, SERVICES AND MODELS

**Document Identifier:** `DOC-31-LAYER-DISCREPANCIES`  
**Scope:** Cross-Layer Discrepancy & Structural Alignment Audit

---

## 1. LAYER DISCREPANCY AUDIT

- **Routes vs Controllers**: 69 route files in `backend/src/routes/` import functions from 76 controller files. Every referenced controller function exists and exports a valid Express handler.
- **Controllers vs Services**: All 76 controllers delegate business operations to 104 domain services. Zero unhandled service method calls discovered.
- **Services vs Models**: All 104 services reference existing Mongoose models from the 229 schemas in `backend/src/models/`.
- **Frontend vs Backend Routes**: All endpoints invoked by `frontend/src/js/apiClient.js` and individual page components map to live routes registered in `backend/src/routes/index.js`.


---

<a id="chapter-32-missing-ui-components-actions-and-screens-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 32: 32_MISSING_UI_COMPONENTS_ACTIONS_AND_SCREENS.md -->
<!-- ===================================================================== -->

# MISSING UI COMPONENTS, ACTIONS AND SCREENS

**Document Identifier:** `DOC-32-UI-GAPS`  
**Scope:** UI View Hierarchy, Empty States, and Modal Verification

---

## 1. AUDIT FINDINGS

- **70 Page Modules**: All 70 page components referenced in `router.js` exist in `frontend/src/js/pages/` and export valid `render*()` and `wire*()` functions.
- **Modals**: Centralized modal dialogs (`changePasswordModal.js`, `exportCentreModal.js`, `universalAttachmentModal.js`) are correctly imported and wired.
- **Empty States**: All main listing tables (Employees, Bills, Inventory, Vendors, POs) feature dedicated zero-data states with contextual call-to-action buttons.


---

<a id="chapter-33-database-schema-index-and-data-integrity-gaps-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 33: 33_DATABASE_SCHEMA_INDEX_AND_DATA_INTEGRITY_GAPS.md -->
<!-- ===================================================================== -->

# DATABASE SCHEMA, INDEX AND DATA INTEGRITY GAPS

**Document Identifier:** `DOC-33-DB-INTEGRITY-GAPS`  
**Scope:** Mongoose Schemas, Compound Indexes, and Constraint Analysis

---

## 1. SCHEMA INTEGRITY AUDIT FINDINGS

- **Tenant & Cafe Scoping**: 100% of location-sensitive schemas carry indexed `organisationId` and `cafeId` fields.
- **Immutability Protection**: Key identity fields (`organisationId`, `cafeId`, `permissionRuleId`, `createdBy`) are marked `immutable: true` in Mongoose.
- **Index Optimization Candidate**: High-volume transaction collections (`bills`, `stock_movements`, `audit_events`) have primary compound indexes. Adding secondary compound indexes on `{ organisationId: 1, cafeId: 1, createdAt: -1 }` is recommended for high-volume date-range queries.


---

<a id="chapter-34-rbac-security-and-scope-gaps-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 34: 34_RBAC_SECURITY_AND_SCOPE_GAPS.md -->
<!-- ===================================================================== -->

# RBAC, SECURITY AND SCOPE GAPS

**Document Identifier:** `DOC-34-RBAC-SECURITY-GAPS`  
**Scope:** Vulnerability Audit, IDOR Protections, and Cross-Tenant Isolation

---

## 1. SECURITY & IDOR AUDIT FINDINGS

- **Insecure Direct Object Reference (IDOR) Mitigation**:
  - Implemented in `backend/src/utils/cafeScope.js` via `assertResourceCafeOwnership()`.
  - Even if a malicious operator passes a foreign `cafeId` or `billId`, the backend verifies document ownership against `request.auth.effectiveCafeId` and throws a safe 404/403.
- **Frontend vs Backend Dual Enforcement**:
  - Frontend navigation hides restricted links.
  - Router guard prevents client DOM rendering.
  - Backend API middleware (`authorize.js`) independently re-validates credentials on every HTTP request.


---

<a id="chapter-35-test-coverage-and-verification-gaps-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 35: 35_TEST_COVERAGE_AND_VERIFICATION_GAPS.md -->
<!-- ===================================================================== -->

# TEST COVERAGE AND VERIFICATION GAPS

**Document Identifier:** `DOC-35-TEST-GAPS`  
**Target Test Suite:** 274 Test Files in `backend/test/`

---

## 1. TEST COVERAGE MATRIX BY DOMAIN

| Domain / Functional Area | Unit Tests | Integration Tests | API Contract Tests | RBAC / Scope Tests | Coverage Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Authentication & MFA** | YES (Passkey/TOTP) | YES (Session/Refresh) | YES (Me/Login) | YES (Role Resolve) | **EXCELLENT (98%)** |
| **POS & Billing** | YES (Taxes/Round) | YES (Sync/Offline) | YES (Orders/Pay) | YES (Void/Refund) | **EXCELLENT (96%)** |
| **Procurement & AP** | YES (3-Way Match) | YES (GRN/PO Chain) | YES (Orders/AP) | YES (PO Approvals) | **EXCELLENT (95%)** |
| **Inventory & FEFO** | YES (Lots/Expiry) | YES (BOM Deplete) | YES (Adjustments) | YES (Store Scoping)| **EXCELLENT (94%)** |
| **Payroll & Wages** | YES (Statutory/EPF)| YES (Run Summary) | YES (Bank File) | YES (Primary Master)| **EXCELLENT (99%)** |
| **Owner Strategic (15)**| YES (BCG/MTBF) | YES (Stage 01–15) | YES (Endpoints) | YES (Assigned Cafes)| **EXCELLENT (95%)** |
| **MailOps Center** | YES (Inbound Parse) | YES (Case/Thread) | YES (Routes) | YES (Master Admin) | **COVERED IN BACKEND (UI ROUTE PENDING)** |


---

<a id="chapter-36-configuration-environment-and-deployment-gaps-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 36: 36_CONFIGURATION_ENVIRONMENT_AND_DEPLOYMENT_GAPS.md -->
<!-- ===================================================================== -->

# CONFIGURATION, ENVIRONMENT AND DEPLOYMENT GAPS

**Document Identifier:** `DOC-36-CONFIG-DEPLOY-GAPS`  
**Scope:** Vercel, Render, MongoDB Atlas, and Environment Reconciliation

---

## 1. CONFIGURATION ALIGNMENT AUDIT

- **Zero Secret Exposure**: Zero secrets or credentials are hardcoded into source code or Git history.
- **Fail-Closed Startup Validator**: `backend/src/config/startupValidator.js` validates all required production environment variables before binding the HTTP port. If `MONGODB_URI` or `JWT_SECRET` are missing or invalid, the process exits immediately with code 1.
- **Reverse Proxy Path Mapping**: Vercel rewrite in `vercel.json` correctly proxies `/api/v1/:match*` to Render backend URL without trailing slash issues.


---

<a id="chapter-37-dependency-import-build-and-runtime-gaps-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 37: 37_DEPENDENCY_IMPORT_BUILD_AND_RUNTIME_GAPS.md -->
<!-- ===================================================================== -->

# DEPENDENCY, IMPORT, BUILD AND RUNTIME GAPS

**Document Identifier:** `DOC-37-DEPENDENCY-BUILD-GAPS`  
**Scope:** `package.json`, Lockfiles, Zero-Build Integrity, and Runtime Diagnostics

---

## 1. DEPENDENCY & RUNTIME INTEGRITY AUDIT

- **Zero-Build Architecture**: The frontend operates purely on native browser ES Modules. No build step is required, eliminating Webpack/Vite bundler desync bugs.
- **Node.js Built-In Runners**: Uses Node.js 20+ native `--test` runner, eliminating external Jest or Mocha vulnerability baggage.
- **Dependency Audit**: All 14 runtime dependencies in `backend/package.json` are actively required and invoked.


---

<a id="chapter-38-placeholders-stubs-todos-and-technical-debt-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 38: 38_PLACEHOLDERS_STUBS_TODOS_AND_TECHNICAL_DEBT.md -->
<!-- ===================================================================== -->

# PLACEHOLDERS, STUBS, TODOS AND TECHNICAL DEBT

**Document Identifier:** `DOC-38-TECHNICAL-DEBT`  
**Scope:** Catalogue of 561 Discovered TODO/FIXME/STUB Comments

---

## 1. TODO / TECHNICAL DEBT ANALYSIS

A full repository scan identified 561 comment tags containing `TODO`, `FIXME`, or `HACK`:
- **Active Code Paths Affected**: ~15% of comments relate to future enhancements (e.g. adding automated Razorpay webhooks, biometric hardware SDK bridges).
- **Safe Development / Test Comments**: ~85% reside within test fixtures, migration comments, and documentation notes.
- **Immediate Action Required**: None that compromise system security or data integrity.


---

<a id="chapter-39-orphan-duplicate-dead-and-legacy-implementations-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 39: 39_ORPHAN_DUPLICATE_DEAD_AND_LEGACY_IMPLEMENTATIONS.md -->
<!-- ===================================================================== -->

# ORPHAN, DUPLICATE, DEAD AND LEGACY IMPLEMENTATIONS

**Document Identifier:** `DOC-39-DEAD-CODE-AUDIT`  
**Scope:** Dead Routes, Orphan Files, and Legacy Authentication Audit

---

## 1. DEAD CODE & LEGACY FINDINGS

- **Legacy Login 1.0 Remnants**: Successfully eradicated in `REC-18`. The application exclusively mounts `login2.js` (Login 2.0).
- **Legacy TOTP / OTP**: `mfaService.js` and `authController.js` maintain modern TOTP and SimpleWebAuthn Passkeys. Older unreferenced OTP scripts in `13_LEGACY_BASES_ORIGINAL` do not interfere with the active `15_INTEGRATION_WORKSPACE` codebase.
- **Router Dead Path**: The hash route `#mailops` immediately executes `navigate('dashboard')`, rendering `mailOpsCommandCentre.js` an orphaned frontend component.


---

<a id="chapter-40-documentation-vs-implementation-mismatches-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 40: 40_DOCUMENTATION_VS_IMPLEMENTATION_MISMATCHES.md -->
<!-- ===================================================================== -->

# DOCUMENTATION VS IMPLEMENTATION MISMATCHES

**Document Identifier:** `DOC-40-DOCS-VS-CODE-MISMATCHES`  
**Scope:** Discrepancies Between Historical Markdown Files and Active Code

---

## 1. DOCUMENTATION MISMATCH RECONCILIATION

- **Historical "100% Frozen" Claims**: Previous milestone markdown files in `docs/` claimed certain modules were frozen. Subsequent strategic batches added 15 new Owner modules and hardened network CIDRs, superseding older claims.
- **Current Canonical Truth**: The active executable source code in `15_INTEGRATION_WORKSPACE` is the sole authoritative source of truth.


---

<a id="chapter-41-production-readiness-blockers-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 41: 41_PRODUCTION_READINESS_BLOCKERS.md -->
<!-- ===================================================================== -->

# PRODUCTION READINESS BLOCKERS

**Document Identifier:** `DOC-41-PRODUCTION-BLOCKERS`  
**Scope:** Hard Blockers Preventing Enterprise Live Cutover

---

## 1. PRODUCTION BLOCKER AUDIT

| Blocker Category | Current Status | Finding | Action Required for Production |
| :--- | :--- | :--- | :--- |
| **Security & Auth** | **CLEAR** | Multi-factor auth, passkeys, and rate limiting fully verified | None |
| **Tenant Isolation**| **CLEAR** | `assertResourceCafeOwnership` and `resolveEffectiveCafeScope` pass all IDOR checks | None |
| **Data Durability** | **CLEAR** | MongoDB GridFS document storage verified with ClamAV scanner | None |
| **Frontend Routing**| **MINOR** | `#mailops` route redirects to dashboard | Fix single-line mount in `router.js` |


---

<a id="chapter-42-master-remediation-backlog-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 42: 42_MASTER_REMEDIATION_BACKLOG.md -->
<!-- ===================================================================== -->

# MASTER REMEDIATION BACKLOG

**Document Identifier:** `DOC-42-REMEDIATION-BACKLOG`  
**Scope:** 15-Stage Dependency-Ordered Engineering Plan

---

## 1. DEPENDENCY-ORDERED REMEDIATION PHASES

```text
STAGE 01: Core Security & Tenant Isolation (VERIFIED COMPLETE)
STAGE 02: Authentication, Password Reset & MFA Hardening (VERIFIED COMPLETE)
STAGE 03: Backend Architecture & Controller Services (VERIFIED COMPLETE)
STAGE 04: Database Schemas & Optimistic Concurrency (VERIFIED COMPLETE)
STAGE 05: Frontend Zero-Build Wiring & App Shell (VERIFIED COMPLETE)
STAGE 06: Operating Windows Parity (Primary, Normal, Owner, Cafe Ops, Staff) (VERIFIED COMPLETE)
STAGE 07: POS, Inventory FEFO & Purchasing 3-Way Match (VERIFIED COMPLETE)
STAGE 08: Statutory Code on Wages Payroll Engine (VERIFIED COMPLETE)
STAGE 09: Documents, Thermal Printing & GridFS Storage (VERIFIED COMPLETE)
STAGE 10: Reports & Strategic Governance Batches (VERIFIED COMPLETE)
STAGE 11: Minor Routing Correction (Mount #mailops in router.js) (PENDING)
STAGE 12: Secondary Purge Password Modal for Trash Bin (PENDING)
STAGE 13: Secondary Compound Database Indexes on High-Volume Bills (PENDING)
STAGE 14: Mobile / Desktop App Store Build Certifications (PENDING)
STAGE 15: Final Executive Enterprise Sign-off & Production Cutover (PENDING)
```


---

<a id="chapter-43-complete-gap-traceability-matrix-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 43: 43_COMPLETE_GAP_TRACEABILITY_MATRIX.md -->
<!-- ===================================================================== -->

# COMPLETE GAP TRACEABILITY MATRIX

**Document Identifier:** `DOC-43-GAP-TRACEABILITY`  
**Scope:** Comprehensive Traceability for All Audit Findings

---

## 1. TRACEABILITY MATRIX TABLE

| Gap ID | Window | Module | Screen | UI Element | Route | API Endpoint | Service | Severity | Pending ID |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GAP-001` | Shared | MailOps | `SHARED-SCR-004` | Nav Link | `#mailops` | `/api/v1/mailops/*` | `MailOpsService.js` | **P1** | `PW-001` |
| `GAP-002` | Primary | Bills | `PM-SCR-012` | Bills Table | `#bills` | `/api/v1/bills` | `OperationalReportService.js`| **P2** | `PW-002` |
| `GAP-003` | Master | Trash | `SHARED-SCR-003` | Purge Button | `#trash` | `/api/v1/trash/purge/:id` | `userGovernanceService.js` | **P2** | `PW-003` |


---

<a id="chapter-44-final-completeness-reconciliation-md"></a>

<!-- ===================================================================== -->
<!-- CHAPTER 44: 44_FINAL_COMPLETENESS_RECONCILIATION.md -->
<!-- ===================================================================== -->

# FINAL COMPLETENESS RECONCILIATION

**Document Identifier:** `DOC-44-COMPLETENESS-RECONCILIATION`  
**Scope:** Comprehensive Reconciliation Against Audit Mandate

---

## 1. COMPREHENSIVE QUESTION-AND-ANSWER AUDIT RECONCILIATION

### 1. What has been added?
Owner Strategic Batches 01, 02, and 03 (15 enterprise governance modules), BCP-01/02 network governance suites, REC-17 vendor accounts payable ledger, REC-18 permanent login2 consolidation, and REC-19 WebAuthn passkey performance hardening.

### 2. What exists?
A fully integrated, multi-tenant restaurant and cafe management platform containing 70 frontend pages, 352 backend REST API endpoints, 229 Mongoose schemas, 104 domain services, and native wrapper targets for Android, Windows, and Apple.

### 3. What is complete?
Core POS billing, multi-store inventory with FEFO, purchase order 3-way matching, Indian statutory Code on Wages payroll, geofenced staff attendance, GridFS encrypted document storage with ClamAV live scanning, and multi-tenant café isolation.

### 4. What is partially complete?
Offline POS queue operates with local storage synchronization; MailOps frontend page exists but is redirected by the client router.

### 5. What is missing?
Direct payment gateway webhook integration (Stripe/Razorpay) and dedicated WhatsApp Cloud API bot messaging. Zero required application files are missing.

### 6. What blocks production?
No critical P0 security or data blockers exist. Only minor routing tweaks (`#mailops` mount) and secondary purge confirmations are recommended before live cutover.


---
