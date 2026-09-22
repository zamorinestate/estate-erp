# Zamorin Café ERP — Consolidated Implementation Master

**Version:** 1.0  
**Consolidated:** 21 September 2026  
**Purpose:** complete implementation requirements from the conversation, with the latest user decisions applied.  
**Design:** preserve the current UI/UX.  
**Coverage:** five windows; 71 documented screen identifiers; settings overview plus 16 destinations; 15 reused Café Operations modules; 18 chart views; 22 attendance lifecycle requirements; 18 report families; 35 work packages; 72 proposed acceptance scenarios.  
**Status:** requirements and implementation plan; application code and live behaviour remain unverified.

This is the consolidated implementation reference for the discussion. It incorporates the full-app and Owner reviews, later reliability requirements, final launch checks, and previously conditional extensions. The precedence decisions in chapter 1 resolve older alternatives. Repetition of a behaviour across a role, data-integrity rule and acceptance case describes the same implementation from different necessary perspectives; it does not require duplicate modules.

## Contents

1. [Scope, authority and resolved decisions](#1-scope-authority-and-resolved-decisions)
2. [Baseline, evidence and architecture](#2-baseline-evidence-and-architecture)
3. [Critical findings and documented conflicts](#3-critical-findings-and-documented-conflicts)
4. [Role capabilities and authorisation](#4-role-capabilities-and-authorisation)
5. [Primary Master cafe and employee supervision](#5-primary-master-cafe-and-employee-supervision)
6. [Login, recovery, sessions and employee revocation](#6-login-recovery-sessions-and-employee-revocation)
7. [Primary Master module requirements](#7-primary-master-module-requirements)
8. [Normal Master module requirements](#8-normal-master-module-requirements)
9. [Owner module requirements and connected workflows](#9-owner-module-requirements-and-connected-workflows)
10. [Cafe Operations screens and reused modules](#10-cafe-operations-screens-and-reused-modules)
11. [Employee and Staff screens](#11-employee-and-staff-screens)
12. [Shared pages, all settings and every control](#12-shared-pages-all-settings-and-every-control)
13. [Whole-app business capability catalogue](#13-whole-app-business-capability-catalogue)
14. [Charts, metrics and calculation definitions](#14-charts-metrics-and-calculation-definitions)
15. [Attendance, selfie evidence, leave and payroll handoff](#15-attendance-selfie-evidence-leave-and-payroll-handoff)
16. [Report catalogue, PDF, exports and reporting routines](#16-report-catalogue-pdf-exports-and-reporting-routines)
17. [QR types, sizing, expiry and replay prevention](#17-qr-types-sizing-expiry-and-replay-prevention)
18. [Transaction integrity, offline data, audit and attachments](#18-transaction-integrity-offline-data-audit-and-attachments)
19. [Security, performance, accessibility and maintenance](#19-security-performance-accessibility-and-maintenance)
20. [Free deployment, capacity and platform constraints](#20-free-deployment-capacity-and-platform-constraints)
21. [Automatic updates, own-server migration and failover](#21-automatic-updates-own-server-migration-and-failover)
22. [All retained extensions and advanced options](#22-all-retained-extensions-and-advanced-options)
23. [Implementation work packages and delivery sequence](#23-implementation-work-packages-and-delivery-sequence)
24. [Complete acceptance catalogue and evidence](#24-complete-acceptance-catalogue-and-evidence)
25. [Release gates, pilot and operational handover](#25-release-gates-pilot-and-operational-handover)
26. [Traceability and references](#26-traceability-and-references)

## 1. Scope, authority and resolved decisions

**Purpose:** one implementation reference combining the whole conversation, the full-app review, the Owner-focused review, and the later reliability and launch requirements. Implement the behaviours below across the existing application. Retain correct working code and prove it with evidence; do not rebuild a functioning module solely because it appears in this specification.

**Current status:** specification prepared; application implementation and live verification have not been performed. The supplied project files are documentation. A source repository/ZIP and test deployment are still required to execute this specification.

**Authority:** the user's latest explicit instructions govern. “Implement everything in this chat” includes all compatible earlier recommendations and the later-phase extensions, subject to the explicit design, kitchen and subscription constraints. An earlier suggestion to defer an option records sequencing or a prerequisite; it is not permission to lose it from the backlog. Alternative hosting or integration designs are choices, not requirements to run every competing design simultaneously.

| Decision | Binding instruction and implementation treatment |
|---|---|
| D01 — Five windows | Preserve Primary Master, Normal Master, Owner, Café Operations and Employee/Staff. No sixth business workspace is required. Normal Master reuses permitted modules with narrower authority. |
| D02 — Primary Master | Organisation-wide access to all required café and workspace functions, including employee supervision. Preserve the actual actor in logs and never request an employee's credentials to supervise them. |
| D03 — Other roles | Normal Master receives explicit operational grants; Owner receives assigned-portfolio and own-account access; café terminals are bound to their café; Staff receive self-service rights. Full Primary Master access does not cross into another organisation. |
| D04 — Preserve UI/UX | Keep current navigation, layouts, colours, spacing, typography style, cards, icons and visual identity. Fix functionality and make dropdowns/calendars match current tokens. User-selected language, text size and existing themes must work. Implement new required content through existing page/component patterns; no general redesign or menu regrouping. |
| D05 — Kitchen exclusion | Do not add KDS, dedicated kitchen-display frontend, kitchen-ticket printing or kitchen-handling extensions. Customer receipts, inventory/recipes, existing food-safety/quality controls and customer-service workflows remain in scope. |
| D06 — Subscription cost | No new paid hosting/service subscriptions, mandatory paid AI/BI/attendance tools or unapproved paid messaging integrations. Use the app's own logic and existing equipment where suitable. Hardware, electricity, connectivity and existing payment-processing costs are not made free by software. |
| D07 — All earlier options retained | Retain training mode, café templates, business-day cutoff, staff meals/comps, packaging, blind counts, deposit acknowledgment, forecasts, channel analysis, reservations/events, and other listed extensions. Build in phases; dependencies and whether a café uses the workflow govern activation. |
| D08 — No dead required controls | Finish each required visible function. Do not close a defect by hiding a required button, replacing real data with demo records, or showing success without a committed effect. Dependencies may produce an honest temporary unavailable/pending state and a working recovery path. |
| D09 — Language and font | Apply selections to actual interface content, preserve them per user, support the documented English/Malayalam/Hindi/Tamil languages and font scales, and verify report-font coverage. |
| D10 — Attendance | Treat “geo self” as GPS-verified selfie attendance for implementation. Save event-linked photographs privately, surface them in the daily calendar, handle multiple/overnight shifts, and preserve corrections and retention rules. The source code must confirm the actual existing capture flow. |
| D11 — QR expiry | Every rotating access/attendance challenge expires on the server; old screenshots and changed device clocks cannot extend it. Static café/payment/report-verification QR types keep their own defined purposes. |
| D12 — Account hold/delete | Revoke online access and existing sessions; preserve historical business records. Reinstatement by an authorised Master requires fresh authentication and cannot revive revoked sessions. Strict final staff authorisation is online. |
| D13 — Updates | Download and validate updates safely, then activate at a compatible idle/transaction boundary. Respect browser/OS/distribution constraints. Protect drafts, offline queues and schema compatibility; retain recovery/rollback. |
| D14 — Own server | Prepare reproducible deployment, configuration, HTTPS, persistent private data/files, jobs, monitoring, migration and rollback. Preserve the public origin where practicable. |
| D15 — Recovery | Use live standby capacity for failover and isolated historical backups for loss/corruption recovery. Automatic failback requires health, compatibility, catch-up and a stability period. Send incident and recovery notifications. |
| D16 — Speed and security | Use measurable response targets, authorised data paths, MFA where appropriate, secure sessions/uploads, rate limits and traceable operations. Zero latency, zero future defects and zero-time failover are not testable promises. |
| D17 — Final operational checks | Include Primary Master recovery, unsynchronised-record protection, shared-device handover, reconciled opening balances and named incident responsibility. |

**Resolution of earlier alternatives and superseded wording**

| Earlier discussion | Final disposition |
|---|---|
| Put Owner screens into seven new navigation groups or rearrange dashboards. | Preserve the seven business categories as a requirements taxonomy and report grouping only. Do not change the existing navigation or page arrangement. |
| Hide the MailOps route if it is optional. | Under the full implementation request, complete the route, permissions, delivery/retry status and adapter. Keep required recovery/email functions working within the chosen free setup. |
| “Optional/later/not required for first release” features. | Remain in the full roadmap. Data-dependent analytics, additional trading models and native distribution are activated only when prerequisites are satisfied, without creating misleading or nonfunctional controls. |
| Payment webhook / WhatsApp bot / AI service alternatives. | Retain the capability and integration boundary in the roadmap. Implement core manual reconciliation, in-app communication, exports/sharing and deterministic analytics first. Enable external automation only through a supported, authorised, cost-compatible channel; do not bypass platform rules or assume paid services are free. |
| Automatic updates on every device immediately after connection. | Check/download on supported launch/resume/reconnection opportunities; apply safely. Native code requires the actual platform updater. A closed PWA and unmanaged phones cannot guarantee immediate silent installation. |
| Immediate remote revocation while a device is disconnected. | Require online checks for final staff authentication/attendance acceptance. A disconnected device cannot receive a remote state change or erase information already downloaded. |
| One own server with multiple processes described as full failover. | Multiple processes can recover process failure. Whole-host failure requires independent capacity; backup restoration has a measurable delay. |
| Automatic return to the original database regardless of state. | Rejoin/re-elect according to tested consistency and health policy; never direct writes into stale or divergent data. |
| Blanket tax or wage formulas in the as-built description. | Preserve as documented claims only; replace reliance on them with verified effective-dated configuration and independently reconciled samples. This document is not a legal/tax certification. |

**How to interpret the requirements:** every operational table row and functional bullet is an item to implement or verify. A documented feature can be marked complete only with matching code/deployment/test evidence. “Conditional” means the prerequisite must be recorded and resolved, not that the item has disappeared. Working features keep their current design. Source citations illustrate constraints or patterns and do not require buying the cited products.


### Implementation status and limits

This section records the user's latest requirements for the entire app, including login, all five windows, settings, attendance, QR codes, updates and recovery. These are proposed implementation contracts and tests, not a claim that changes have been installed. The available project material consists of documentation, not the source tree or an accessible running application.

### Design boundary retained from the latest instructions

Keep the existing layouts, navigation, colours, themes, typography style, spacing system, cards, icons and login visual identity. Make dropdowns, date pickers, calendars and their states use the current design tokens. Do not introduce a new design system or rearrange the menus to make the application appear modern. Earlier menu-regrouping and dashboard-layout suggestions are deferred under this instruction. User-selected font scaling and language changes must work within the current design.

The five windows remain Primary Master, Normal Master, Owner, Café Operations and Employee/Staff. Primary Master can supervise every café and workspace within its organisation. Every action must retain the actual administrator identity, selected café and, when relevant, the employee whose records are being viewed. An administrator preview must not silently change that employee's preferences or log attendance as that employee.

No required feature passes review by merely hiding its broken button. Complete the function and its data flow. Only explicitly excluded or genuinely out-of-scope features remain absent. Earlier optional recommendations discussed in this conversation stay in the phased roadmap, subject to their recorded prerequisites. Kitchen display systems and kitchen-ticket printing remain excluded.

## 2. Baseline, evidence and architecture

### Material consolidated

| Source | Material and role |
|---|---|
| R1 | `ZAMORIN_CAFE_ERP_COMPLETE_AS_BUILT_REFERENCE.md`: 50-section supplied reference. Describes the existing system; claims are not independent runtime evidence. |
| R2 | `ZAMORIN_CAFE_ERP_CONSOLIDATED_MASTER_DOCUMENTATION.md`: detailed supplied documentation, including the R1 reference and chapters 00–44. |
| S1 | `ZAMORIN_CAFE_ERP_DEEP_REVIEW_AND_IMPROVEMENT_PLAN.md`, saved version 5: full five-window review and later whole-app/reliability requirements. All 38 numbered source sections are mapped in chapter 26. |
| S2 | `ZAMORIN_CAFE_ERP_OWNER_WINDOW_REQUIREMENTS.md`: all 12 Owner sections, integrated into the relevant chapters rather than treated as a separate app. |
| C1 | Conversation decisions from the initial exhaustive review through the final request for one implementation document; includes the five final operational checks. |

### Documented architecture to preserve and verify

| Layer | Baseline described in the supplied files | Implementation direction |
|---|---|---|
| Frontend | Vanilla ES modules, hash routing, custom state, CSS custom properties and Web Components. | Retain the stack and current UI. No React/Vite or framework rewrite is required. |
| Backend | Modular Express 5.2.1 CommonJS application; Node 20+ described. | Inspect installed versions; pin a supported runtime, such as Node 24 LTS, after dependency checks. |
| Persistence | MongoDB 7.0+, Mongoose 9.9.1 and GridFS attachments. | Verify models, transactions, indexes, private file permissions and actual encryption/key handling. GridFS alone does not establish encryption. |
| Hosting | Vercel frontend/proxy, Render backend, MongoDB Atlas. | Correct commercial-use, sleep, SMTP, storage and recovery limitations before business rollout; prepare own-server migration. |
| Integration | Gmail SMTP, ClamAV, Redis/in-memory fallback and durable jobs described. | Verify each dependency; protect authoritative financial/security/job state from disposable-cache loss. |
| Native/PWA | `sw.js` and manifest; Kotlin Android, .NET 10 Windows, Swift iOS/macOS wrappers. | Verify actual packaging and hardware bridges. Separate web-content updates from native-binary updates. |
| Identity | MASTER with primary flag, OWNER, CAFE_ADMIN and STAFF. | Five user windows from four role values; enforce primary distinction and scoped capabilities on the server. |
| Startup | Configured API base or `/api/v1`; language/theme; backend warmup; QR deep-link handling; `/auth/me`; shell or login. | Restore preferences safely, load login promptly, and distinguish unavailable backend from invalid credentials. Warmup is not an uptime guarantee. |

The documented repository baseline is branch `owner-strategic-batch-03`, commit `d8cfac780091ede4f4692c4bf2a5791dc9ef696f`. Counts such as 598 backend files, 104 frontend files, 352 endpoints, 69 route files, 229 models and 4,983 tests are documentation claims until checked against that source and the deployed build. Never generate missing endpoint/model contracts from their counts alone.


### Assessment and intended outcome

Zamorin Café ERP has a broad and useful design. Its documented strengths include separate workspaces, café scoping, staff self-service, device enrollment, inventory lots and recipes, procurement matching, finance, and executive oversight. A modular Express backend and a vanilla JavaScript frontend are reasonable choices for this application. A framework rewrite is not a prerequisite for improving it.

The most valuable next step is to make everyday transactions, permissions, recovery and deployment dependable. Adding more strategic dashboards will not resolve the risks around incorrect bills, cross-café data, failed password recovery, duplicate offline transactions or lost attachments.

**I support your Primary Master requirement:** Primary Master should access every workspace and every café within the organisation, including employee supervision. Normal Master should have a defined, restricted operational permission set. I have followed that explicit requirement where the wording of your message could otherwise be read in two ways.

My assessment is **a strong functional blueprint with unresolved launch conditions**. I cannot confirm the documents' production certification from the supplied material. There is no source repository, running application session, screenshot set, test output or deployment configuration attached. I have not executed the stated 4,983 tests or clicked the stated 650 controls.

### Evidence status and completeness reconciliation

The reviewed sources are:

- **R1:** `ZAMORIN_CAFE_ERP_COMPLETE_AS_BUILT_REFERENCE.md`, all 50 sections.
- **R2:** `ZAMORIN_CAFE_ERP_CONSOLIDATED_MASTER_DOCUMENTATION.md`, executive reference and chapters 00–44.

Both identify commit `d8cfac780091ede4f4692c4bf2a5791dc9ef696f` on branch `owner-strategic-batch-03`. This is the documented baseline, not a commit independently checked against a repository. R1 is repeated verbatim inside R2; the documents are not two independent audits.

Use these evidence labels throughout this review:

| Label | Meaning |
|---|---|
| Documented | A feature is described in the supplied references; its live behaviour has not been independently tested. |
| Reported defect | The references themselves identify a defect or incomplete implementation. |
| Conflict | Two parts of the supplied documentation disagree or leave an important contract ambiguous. |
| Verify | A necessary behaviour is insufficiently specified; this does not establish that the feature is absent. |
| Option | A proposed improvement that can be added if it serves the actual café workflow. |

**Priority:** Before launch = required before relying on the affected live workflow; Soon = useful in the first improvement cycle; Later = conditional enhancement. Required features must be completed and verified. Temporary failure states need a usable recovery path; hiding a required feature is not completion.

The following coverage issues are directly observable in the documentation:

| Finding | Evidence | Consequence |
|---|---|---|
| 71 unique screen identifiers appear, although the main inventory says 70. | R2 chapter 00 includes `SHARED-SCR-005`, the attendance QR scanner; chapter 21 stops at `SHARED-SCR-004`. | This review includes all 71 identifiers. They are documented screen identifiers, not 71 independently verified component files. |
| Settings lists 17 rows including its overview, while calling itself 16 sections. | R2 chapter 08. | Define the count as overview plus 16 destinations; validate all destinations. |
| The seven test categories total 207 suites and 4,700 test cases. | R2 chapter 19; headline totals are 229 suites and 4,983 cases. | Reconcile the unexplained 22 suites and 283 cases with a machine-produced report. This does not itself mean tests failed. |
| Twelve workflows are claimed but four are actually described. | R2 chapter 14. | Require the remaining workflows and evidence before calling the catalogue complete. |
| The API and action tables are expressly representative, and only four models receive detailed field specifications. | R2 chapters 10, 11 and 13. | The attachment does not permit an exhaustive review of all 352 endpoint contracts, 229 schemas or 650 controls. |
| Seven partially wired actions are claimed without a complete seven-item register. | R2 chapters 24 and 28. | List every partial action with its test and owner. |
| The baseline says the branch is 20 commits ahead of its remote. | R2 chapter 00. | Verify the deployed commit and remote backup match the reviewed source. A clean working tree does not establish either. |

The page review below covers every documented screen and the reused Café Operations modules. It is complete against the supplied navigation inventory; undisclosed buttons and unprovided source code remain outside what can be verified here.

## 3. Critical findings and documented conflicts

### Findings to resolve before launch

| ID | Evidence status and affected area | Finding | Recommended correction and acceptance evidence |
|---|---|---|---|
| F01 | Conflict — salary access | Normal Master pay is described as masked, but the RBAC table grants Normal Master all staff payslips and Café Operations store staff payslips. R2 chapters 04 and 12. | Deny other employees' payslips by default for these roles. Grant sensitive-pay viewing separately where needed. Verify JSON responses, PDF URLs, exports, search and notifications all enforce the same rule. |
| F02 | Conflict — Primary Master parity | Universal access is promised, but `#staff-settings` is listed as STAFF-only; owner routes use OWNER/MASTER without consistently separating Primary and Normal Master. R2 chapters 03, 09 and 12. | Create one effective-permission definition for UI and API. Test Primary Master access to every workspace, including staff preview, while Normal Master retains its restrictions. |
| F03 | Conflict — owner and approval scopes | Owner finance routes sometimes say organisation scope, despite assigned-café and own-account restrictions. The permission matrix allows threshold-based owner PO approval, but the example endpoint requires Master. | Specify read, create, approve and export separately. Limit owners to assigned cafés and owned ledger/account records. Test an allowed owner approval and a denied one against the actual endpoint. |
| F04 | Reported defect — bills | API errors or empty results can display demo bills. R2 chapters 20 and 28. | Remove the production fallback. Show a genuine empty state, a retryable error, or a clearly timestamped authorised offline cache. Never substitute fabricated financial records. Reproduce an API failure and verify the displayed state. |
| F05 | Reported defect — recovery | Permanent purge has only a single confirmation. The references also disagree on Normal Master trash visibility. | Settle read/restore/purge permissions. Require recent strong authentication, record-specific confirmation and a retention check for irreversible deletion. Test restricted financial records cannot be purged merely because they entered Trash. |
| F06 | Reported defect — MailOps | `#mailops` redirects to the dashboard. R2 chapters 20, 28 and 39. | Complete and test the MailOps destination, scoped access, production-compatible adapter, delivery/retry states and attachment access. It must not redirect silently to Dashboard; do not hide the required route as a substitute for fixing it. |
| F07 | Reported partial implementation — offline POS | Offline orders need manual synchronisation. R2 chapter 28. | Add a visible pending queue, reliable foreground reconnect/retry, server deduplication and conflict handling. Replay the same sale repeatedly and obtain exactly one bill, one stock effect and one accounting effect. Retain a manual retry control. |
| F08 | External constraint — hosting | The proposed Vercel Hobby deployment conflicts with commercial café use. | Select the free-compatible topology in chapter 20 before the commercial launch. See the official source there. |
| F09 | External constraint — recovery email | Render Free blocks the common SMTP ports used by the documented Gmail SMTP provider. | Use an HTTPS email delivery adapter or an authenticated administrative recovery procedure. Test recovery with a real inbox on the deployed environment. A console email provider is only a development option. |
| F10 | External constraint and verify — overnight work | The application schedules attendance, expiry, scanning and reconciliation jobs inside a backend that can sleep. | Store due jobs and their last successful execution durably; perform idempotent catch-up after startup. Show overdue work. Validate after a restart across the scheduled time. |
| F11 | Verify — backups and storage | GridFS attachments share database capacity; backup verification is asserted without a supplied restore record. | Set attachment budgets, monitor consumption, and restore database records plus attachment bytes to an isolated environment. Verify bills, inventory and payroll links still resolve. |
| F12 | Conditional technical conflict — attendance | The references describe `camera=()` and `geolocation=()` yet promise QR scanning and GPS attendance. R2 chapters 01 and 16. | Inspect the actual top-level HTML response headers. If those denials apply to the SPA document, changing its hash route cannot lift them. Use a suitable same-origin policy and request permissions only in the attendance UI, or serve a separate attendance document. Test camera and GPS on real devices. |
| F13 | External constraint — runtime | The deployment diagram specifies a Node 20 container. | Check the deployed runtime. If it is Node 20, move to a supported LTS version, such as Node 24, with dependency and regression verification. See chapter 20. |
| F14 | Verify — statutory calculations | Blanket descriptions of 5% GST and Basic salary of at least 50% of CTC are inadequate as a complete tax/payroll rule specification. | Use effective-dated rules and confirm applicability, wage bases, thresholds, exemptions and rounding with the responsible accountant/payroll professional. Independently reconcile sample bills and payroll runs before relying on them. This review does not certify current statutory compliance. |
| F15 | Verify — transaction boundaries | The checkout narrative places payment/depletion in more than one stage, while endpoints separate order creation and payment. | Specify precisely when an order reserves stock, consumes stock, produces an invoice, records payment and posts the ledger. Test retries and interrupted commits at each boundary. |

F12 follows from browser policy behaviour documented by Mozilla: a blocked camera request is rejected and blocked geolocation requests fail. It is a conditional deployment finding, not proof that your live attendance screen is broken. [Camera policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/camera), [Geolocation policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/geolocation).

The web verification did not establish the current tax/payroll rules applicable to each café and employee. F14 is a requirement for further statutory validation, not a verified replacement rate schedule. Do not read the report date as certification that the references' GST, EPF, ESI or wage-base statements are current and universally applicable.

### Concrete Owner access gaps to resolve

The following findings come from the consolidated documentation's Owner reference, frontend route table, API inventory and permission matrix.

| Finding ID | Finding | Documented evidence | Required outcome |
|---|---|---|---|
| OF01 | Purchase approval authority is inconsistent. | The permission matrix grants Owner PO approval above a threshold; the representative `POST /api/v1/procurement/orders/:id/approve` endpoint lists `requireMaster`. | An authorised Owner can inspect and approve a qualifying PO for an assigned café. Unauthorised approvals fail. The UI, server capability and delegation rules agree. |
| OF02 | Supplier balance access is inconsistent. | Owners have read-only access to supplier invoices/AP in the matrix; the representative `GET /api/v1/vendor-ledger/:vendorId` endpoint lists `requireMaster`. | The Owner can inspect authorised supplier bills, outstanding balances, due dates and settlement history through a scoped read path. Verify the actual guard and any separate Owner endpoint. |
| OF03 | Several operational detail routes omit Owner. | `#dept-orders`, `#inventory`, `#procurement`, `#expenses` and `#customers` omit Owner in the route table, even though Owner summaries depend on these domains. | Every relevant Owner total links to sufficient supporting records through an authorised read-only view or Owner-specific detail panel. Do not grant unrestricted operational editing just to make a drill-down work. |
| OF04 | Financial scope descriptions conflict. | The Owner reference limits access to assigned cafés; the matrix limits personal ledger and passbook to own records/accounts. Some route scope labels say Organisation. | Scope financial queries by permitted cafés and account/ledger ownership. Organisation membership alone must not reveal another owner's private account or drawings. |
| OF05 | Price analysis does not demonstrate publication. | Menu engineering is documented, while the shared `#menu` route is Master-only. | The Owner can submit or approve a proposed price change within assigned cafés, track its effective date and see whether it was actually applied by an authorised operator. Direct editing is a separate permission choice. |
| OF06 | Owner compensation decisions need a clear execution path. | Complaints include service-recovery vouchers, while refund/void access is read-only for Owner in the matrix. | If the business wants Owner approval for compensation, connect approval to the authorised refund/voucher action and its outcome. Approval and execution can remain separate permissions. |

These are reasons to inspect the implementation, not proof that every Owner API is currently inaccessible. A separate dedicated endpoint could already satisfy a requirement; the representative catalogue is not exhaustive.

## 4. Role capabilities and authorisation

### Recommended five-window access model

Keep the five workspaces. Treat them as different interfaces over shared modules and controlled permissions. Do not create five independent versions of the same bill, stock, employee or finance logic.

The following is a **recommended target policy**, not a claim about the current implementation. “All cafés” always means cafés inside the authenticated organisation. An application administrator is not automatically authorised for unrelated organisations.

| Capability | Primary Master | Normal Master | Owner | Café Operations | Employee / Staff |
|---|---|---|---|---|---|
| Workspace access | All five | Operational Master; own employee services | Owner; own employee services if employed | Store operations; own employee services | Own services |
| Café selection | All cafés, selected café, comparative reporting | Granted cafés; organisation-wide operations only if explicitly assigned | Assigned cafés only | Enrolled café only | Own effective work assignment |
| Sales and POS | Full, after choosing café | Granted café operations | Sales oversight; no till action by default | Named operator's allowed sales actions | None unless separately assigned an operator entitlement |
| Refunds and voids | Authorised reversal workflow | Within delegated limits | Review/approval when explicitly granted | Request; approval by an authorised supervisor | None |
| Inventory and procurement | Full | Granted operations and approval limits | Oversight and designated approvals | Local receipts, requests, counts and approved adjustments | None by default |
| Menu and price changes | Full | Explicit pricing permission | Proposal/approval permission | Read active menu; local availability controls if granted | View relevant announcements |
| Employee directory | Organisation-wide | Granted cafés with sensitive fields removed | Assigned portfolio and permitted fields | Shift staff information needed for operations | Own profile |
| Payroll preparation/posting | Full with review and period locks | None by default | Authorised summaries/approvals; no default execution | None | None |
| Individual payslips and bank details | Authorised supervisory access | Own only unless a separate payroll-view grant exists | Only expressly permitted people/data | Own only by default | Own only |
| Treasury and owner drawings | Full | Denied | Own authorised accounts/ledger; assigned business scope | Denied | Denied |
| Owner strategic modules | Full | Specific delegated modules only | Assigned portfolio | Required operational input only | Assigned training or tasks |
| Role administration | Full, including primary succession | Provision lower roles within explicit limits | No self-expansion of access | None | None |
| Terminal administration | All cafés | Assigned cafés | Read when required | Local diagnostic/lock functions | Own personal sessions |
| Audit | Read/export authorised organisation audit | Operational audit within scope | Portfolio audit within scope | Relevant local events | Own request and account history |
| Restore and permanent purge | Governed restore/purge permissions; protected records retained | Optional scoped recovery request or approved restore; no purge | No default purge | No purge | No purge |
| Security credentials | Manage enrollment, revocation and recovery; no retrieval of secrets | Own credentials; limited user recovery if delegated | Own credentials | Own PIN/credentials | Own credentials |

For every feature, distinguish **view, create, edit, approve, post, reverse, export, restore and purge**. Hiding a menu option does not enforce a backend restriction. Field masking must happen before the response leaves the server; a privacy checkbox cannot allow a forbidden export field.

The requirement to validate permissions on every request, apply least privilege and deny ungranted access is consistent with [OWASP's authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).

Normal Master must not be able to create another Primary Master, change its own restrictions, grant itself payroll access, or obtain restricted data through a report. Primary Master may have emergency override authority, but overrides should retain reasons, the true actor and the original records. Full access should not allow silent financial history rewriting.

An employee can hold both staff self-service and an operator assignment. Record these as separate capabilities. Being able to clock in does not itself allow cashier functions, and having a cashier PIN does not grant access to colleagues' employment documents.

### Owner action capabilities and accountability

Treat each action as a scoped capability. These are proposed policy choices where they go beyond the supplied read-only Owner matrix; they have not been implemented by this review.

| Action | Recommended Owner ability | Accountability requirement |
|---|---|---|
| View business records | Read the assigned portfolio and necessary supporting records, with permitted personal/financial fields. | Recheck scope in APIs, exports and attachments; show the café and account owner. |
| Approve purchase, expense or CAPEX | Approve/reject within the documented authority and threshold policy. | Show original request, evidence, amount, café and conflict/self-approval rule. |
| Approve price changes | Approve or submit an effective-dated café-specific proposal. | Track publication by an authorised executor; do not reprice historical bills. |
| Approve refunds or compensation | Grant only if Owner escalation is part of the business policy. | Keep reason, original bill, approval and actual payout/reward movement linked. |
| Approve credit limits or write-offs | Grant as a separate financial capability where used. | Require evidence and accounting treatment; never make old invoices disappear. |
| Review staff and payroll | Read authorised employment and pay information; approve high-value advances if delegated. | Separate pay visibility from payroll execution and protect unrelated employees' information. |
| Delegate authority | Assign only capabilities and cafés the Owner is entitled to delegate. | Time limit, revocation, substitute approver and audit record. |
| Manage own money records | Access own authorised capital, drawings, accounts and revenue-share records. | Preserve the distinction between personal funds and business profit. |
| Change global security or access another owner's portfolio | Retain this under the appropriate Primary Master authority. | An Owner role must not become an organisation-wide administrator merely to resolve a missing read view. |

Primary Master can enter these Owner views for any authorised café in the organisation while retaining the Primary Master's real identity in the audit trail. Owner uses **All my cafés**, while Primary Master may use **All cafés in this organisation**. Switching presentation must not change who actually performed an approval.

Labour reporting can also separate business summaries from individual pay details: [MarginEdge documents distinct labour access roles and includes salaried staff in its reporting workflow](https://help.marginedge.com/hc/en-us/articles/360056272154-Getting-started-with-Labor-in-MarginEdge). That is a useful design precedent; Zamorin's own permission policy should reflect the actual owner's responsibilities.

## 5. Primary Master cafe and employee supervision

### Primary Master café and employee switching

Use three separate selectors where they are relevant:

| Selector | Example | Behaviour |
|---|---|---|
| Workspace | Primary Master / Normal Master preview / Owner / Café Operations / Staff preview | Changes layout and available tools according to an explicitly authorised view. |
| Café | All cafés / CF-0001 / CF-0002 | Changes the report or operational scope; it never changes the authenticated organisation. |
| Employee | Select a named employee and ID | Loads a supervised employee view through an authorised endpoint; it never logs in as that employee. |

The header should always show **signed-in actor, active workspace, active café and supervised employee when applicable**. Staff preview should carry a visible “Viewing employee record” indication and an exit action.

Implement these rules:

1. **All cafés is a reporting context.** A new sale, GRN, cash adjustment or attendance correction requires one explicit café. Deliberate bulk administration requires its own selected-café list and impact preview.
2. **Bind drafts to their original café.** Switching locations must never reassign a held cart, uploaded receipt or unsaved expense. Let the user save the draft, stay in the current context, or intentionally abandon an unsaved draft. Preserve committed offline records.
3. **Reject stale responses.** Abort old reads and use a context identifier so a late response from café A cannot overwrite the café B screen. Include organisation, café, user and sensitive field permissions in cache keys.
4. **Separate identity from presentation.** Keep the Primary Master's identity in the server session while rendering the Owner or Staff layout. Never change the user's stored role merely to switch the screen.
5. **Use read-only employee preview by default.** Viewing an employee's payslip is different from changing attendance or approving leave. Provide explicit, authorised correction actions with a reason.
6. **Do not submit staff actions as the employee.** A manager-assisted request must say who submitted it and on whose behalf. Attendance corrections must retain original punches; they should not manufacture a GPS punch by an employee.
7. **Separate personal security screens.** An administrator may inspect enrollment status or revoke a session, but cannot view another user's password, PIN, recovery codes or private passkey material. Password entry in preview must never affect the wrong account.
8. **Treat kiosk elevation separately.** On a physical store terminal, time-limit elevated access and visibly return to the operator context. Do not silently rebind the device to another café when the Primary Master inspects that café.
9. **Apply revocation immediately when online.** Café assignment or employment removal must affect open tabs, exports and API calls, not just the next login. Define the bounded offline authorisation period separately.
10. **Keep tabs coherent.** Either context is tab-local or context changes are broadcast with clear handling. Test two tabs on different cafés and a late submission from the first tab.
11. **Maintain a true audit trail.** Record actor, target employee, organisation, café, workspace, action, reason, changed fields, timestamp and correlation ID. A workspace switch may be logged without recording secrets.
12. **Show data freshness.** Remote monitoring should show each café's last synchronisation, offline terminal count and unreconciled sales. “Live sales” must not conceal a disconnected café's pending transactions.

An implementation sketch for discussion is `actorUserId`, `organisationId`, `activeWorkspace`, `effectiveCafeId`, `subjectEmployeeId` and `accessMode`. The server must derive/validate authority; client-supplied context alone cannot confer it.

## 6. Login, recovery, sessions and employee revocation

### Login through account exit — all authentication screens

The existing login fields, show/hide password, device trust, MFA, reset flow and café gateway are documented. Retain them and verify the following details.

| Screen ID and route | Improvements or verification | Priority |
|---|---|---|
| AUTH-SCR-001 — `#login` | Organisation input may default to ZAMORIN but must remain unambiguous. Test both email and canonical user ID: the UI promises both, while the example lookup only mentions email. Support password managers, keyboard submission, paste, clear labels and reduced motion. Show warming/unavailable state distinctly from invalid credentials. Make trust-device opt-in and inappropriate for shared kiosks. | Before launch |
| AUTH-SCR-002 — `#mfa` | Require strong authentication for Primary Master and sensitive administration. Handle cancelled passkeys, unavailable hardware, expired challenges, enrollment and recovery. TOTP/passkeys avoid paid SMS. Rate-limit attempts per account/challenge as well as IP, and reject reused challenges. | Before launch |
| AUTH-SCR-003 — `#forgot` | Return the same public response for existing and unknown accounts. Add resend cooldown, account and IP throttles and real delivery status internally. Support staff without personal email through an authenticated administrative recovery flow. | Before launch |
| AUTH-SCR-004 — `#verify` | Bind code to organisation/account/challenge; cap attempts and expiry. A newer code should invalidate or clearly supersede the previous challenge. Do not log OTP values. Hashing a six-digit code is not a substitute for attempt limits. | Before launch |
| AUTH-SCR-005 — `#reset` | Enforce single-use reset tokens, password confirmation, safe expiry/restart, session revocation and recovery notification. Verify the reset cannot accidentally leave a trusted shared device authenticated. Do not rely on this flow to bypass MFA recovery. | Before launch |
| AUTH-SCR-006 — `#cafe-gateway`, `#c/:token`, public café deep links | Handle expired/revoked QR tokens and suspended cafés. The QR selects context; it must not itself grant cashier access. Test QR regeneration, printed older QRs and direct link opening in browsers/native wrappers. Expose only necessary public café details. | Before launch |

Also verify onboarding invitation acceptance, first password/PIN setup, temporary credentials, account suspension, session-expired messages, access-denied screens, offline entry, lock and logout. These are states in the journey even when they do not have separate screen IDs.

On logout, revoke the relevant session, clear sensitive cached views and prevent browser Back from revealing another employee's data. Preserve any unsynchronised business queue in a protected recoverable state with its original actor and café; a simple “clear everything” logout must not erase completed local sales. Logging out should remain possible if the backend is unreachable.

### Passwords, account holds and café switching

Password-reset codes or links must expire, be single-use, resist guessing and be stored securely. A used or expired reset must fail on the server. Provide a working resend/recovery path, rate limits and a consistent account-existence response. Revoke the appropriate sessions after a successful reset and require ordinary login again. Keep password recovery separate from MFA recovery. These controls follow [OWASP's password-reset guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

For suspension, account hold, departure or logical deletion:

1. Save the access-state change and its reason in the authoritative account record. Preserve attendance, payroll, sales attribution and audit history rather than deleting those records with the login identity.
2. Revoke refresh sessions and device sessions, and invalidate existing access tokens through an account/session version or equivalent central revocation check. Every protected request must enforce current account status, role and café scope. A 15-minute token lifetime alone does not meet immediate online revocation.
3. Disconnect active real-time sessions and clear or lock private views when the connected client receives the change. Recheck authorisation for subsequent messages, background jobs, exports and attachment downloads. Avoid reusable public URLs for attendance photographs.
4. Reject new actions after revocation takes effect. For an action already in progress, enforce the access condition at the write boundary where required; do not claim the change can undo a transaction that was already committed.
5. Only Primary Master or an explicitly authorised Master can reinstate access. Reinstatement is audited and requires fresh authentication; it must not revive old revoked tokens. A permanently erased identity, if allowed at all, is a separate operation from a reversible hold.

Server-side invalidation is required; removing a browser token alone is insufficient. [OWASP session-management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) explains this distinction.

**Offline limitation:** a disconnected personal device cannot receive an immediate remote hold or erase information already displayed or downloaded. For the requested strict access rule, require an online authorisation check for staff login and final attendance acceptance, and lock protected offline staff functions. Previously queued records must be revalidated on reconnection. Pending business records from before revocation need controlled reconciliation, not silent deletion or automatic acceptance. Any future offline staff access would require an explicit, bounded exception to the immediate-revocation requirement.

On a Primary Master café/window change, discard stale results, cancel obsolete requests and reload the permitted scope. Include organisation, café, subject and permissions in cache boundaries. A draft, upload or offline transaction must retain its original café; changing the visible café must never reassign an unfinished transaction. Recheck permissions on direct API calls and exports, not just the menu.

## 7. Primary Master module requirements

### Primary Master — all 26 module screens

All capabilities in the second column are documented. The third column is the proposed verification/improvement work; it should not be read as a claim that every listed control is currently missing.

| Screen | Documented coverage | Recommended completion and acceptance check | Priority |
|---|---|---|---|
| PM-SCR-001 — `#dashboard` | Revenue, margin, orders, workforce, stock alerts and quick actions. | Show sales, collections and receivables separately; put café, date and freshness on every metric. Add pending sync, cash variance and critical exceptions. Drill-down totals must reconcile to source records and respect the active café. All-café quick actions should first choose a café. | Before launch |
| PM-SCR-002 — `#pos` | Touch/keyboard cart, dine-in/takeaway, split tenders, tax, recipes and printing. | Verify modifiers, quantities, held carts, table transfer/merge/split if used, discount limits, item cancellations, failed/partial payments and refunds. Separate order state from payment state. Add idempotency and server calculations; a receipt print failure must not create another payment. | Before launch |
| PM-SCR-003 — `#approvals`, `#tasks` | Purchase, leave, disbursement and expense approval inbox. | Show submitter, café, amount, age, evidence and required authority. Prevent disallowed self-approval. Handle duplicate approval clicks and records changed after review. Provide reject-with-reason, reassignment, escalation and meaningful completion states. | Before launch |
| PM-SCR-004 — `#attendance` | Rosters, geofence/QR records, corrections, overtime. | Test overnight shifts, breaks, part days, two cafés in one day and late device synchronisation. Store UTC instants plus local business date/shift. Corrections need reason and approval. Freeze approved attendance used by payroll; handle later adjustments explicitly. | Before launch |
| PM-SCR-005 — `#dept-orders` | Institutional orders, credit accounts, scheduling and batch billing. | Verify quotations/approval references when used, partial fulfilment, delivery acknowledgment, cancellation, consolidated invoices and partial collections. Include credit limit, due date, customer statement, aging and payment-to-invoice allocation. Avoid counting collection of an old invoice as a new sale. | Before launch for credit sales |
| PM-SCR-006 — `#inventory` | Multi-location stock, conversion, BOM, thresholds and counts. | Verify units, yields, batch expiry, quarantine, stocktake cut-off and negative-stock policy. Add/verify two-step inter-café transfers with in-transit stock and receiving discrepancies. Trace adjustments to an actor and source document. Sales refunds must follow an explicit restock/waste rule. | Before launch |
| PM-SCR-007 — `#procurement` | Requisition, RFQ, PO, GRN, backorders and three-way matching. | Verify partial deliveries, excess/short receipts, damaged goods, supplier returns, duplicate supplier invoices and matching tolerances. Keep received stock separate from approval to pay. Match exceptions need an authorised reason; repeat GRN submission must not duplicate stock. | Before launch |
| PM-SCR-008 — `#assets` | Registry, depreciation, maintenance, breakdowns and warranties. | Record location/custodian, serial number, service history, supporting documents and disposal approval. Reconcile asset additions/disposals to finance. Add reminders and maintenance costs; defer complex predictive maintenance until reliable event history exists. | Soon |
| PM-SCR-009 — `#quality` | Temperature/hygiene logs, pest control, CAPA and recall trace. | Make failed critical checks create assigned corrective actions. Link quarantined lots to inventory and prevent their sale/use. Record measurement time, actual logger and evidence; identify backfilled entries. Verify recall to supplier lot and affected sales where traceability exists. | Before launch for food controls |
| PM-SCR-010 — `#employees` | Profiles, onboarding, wages and KYC. | Verify employee/user links, employment changes with effective dates, transfers, emergency contacts, joining/exit checklist and unique records. Restrict salary, bank and identity fields server-side. Deactivation must remove access without deleting historical payslips or audit records. | Before launch |
| PM-SCR-011 — `#payroll` | Payroll runs, deductions, loss of pay, payslips and bank files. | Use draft, reviewed, posted, paid and adjusted states. Validate rules and independent sample calculations; keep employer costs distinct from employee deductions. Lock periods, prevent repeat posting, record payment reconciliation and handle arrears/final settlement. A downloaded bank file is not proof of payment. | Before launch |
| PM-SCR-012 — `#bills` | Invoice archive, reprint counter, void reasons and credit notes. | Eliminate demo fallback. Filter by café/date/payment/customer and preserve original tax/price snapshots. Use linked reversals/credit notes for settled documents; never silently rewrite issued history. Store payment references and original/reprinted status. | Before launch |
| PM-SCR-013 — `#expenses` | Receipt attachments, categories, budget lines and approvals. | Distinguish claimed, approved, paid and posted amounts. Flag possible duplicate claims; support vendor/employee payee and cash/bank/credit settlement. Verify void/reversal and avoid posting the same invoice through procurement and expenses. | Before launch |
| PM-SCR-014 — `#sales-cash` | Daily reconciliation, drops, discrepancies and till counts. | Link opening float, cash sales, debt collections, refunds, paid-outs and drops to a named drawer/shift. Count denominations, record expected versus actual and sign handover. Keep UPI/card outside physical cash. Lock closed shifts; use adjustments to reopen/correct. | Before launch |
| PM-SCR-015 — `#finance` | Accounts, journals, P&L, balance sheet, trial balance and GST summaries. | Balance every journal, link source records and block direct edits to posted entries. Add opening balances, period locks, bank reconciliation and receivable/payable tie-outs. Separate actual, estimated and unposted figures; summaries are not proof of tax filing. | Before launch |
| PM-SCR-016 — `#passbook` | Accounts, transfers, OFX/CSV reconciliation and liquidity. | Distinguish cash book from bank balance. Prevent duplicate imports using reliable transaction identifiers and matching rules. Represent transfers with both sides; reconcile fees/refunds. Confirm owner access is limited by account ownership as well as café. | Before launch |
| PM-SCR-017 — `#ledger` | Capital, drawings, settlements and dividends. | Maintain owner-specific subledgers, evidence, authorisation and effective dates. Keep drawings separate from operating expenses. Reconcile transfers to bank/GL and prohibit access through Normal Master reports. | Before launch |
| PM-SCR-018 — `#customers` | CRM, histories, loyalty ledger and segments. | Permit anonymous cash purchases. Minimise personal data, govern duplicates and opt-outs, and keep a points movement ledger with expiry/reversal rules. Restrict bulk export; a cashier should receive only customer information needed for the sale. | Before launch for data access; Soon for loyalty refinements |
| PM-SCR-019 — `#menu` | Categories, modifiers, café prices, taxes and recipe links. | Add/verify effective dates, availability windows, sold-out flags, allergens, recipe yields and preview of proposed prices. Preserve historical sale snapshots. Version recipes and tax configuration; test a queued sale across a price change. | Before launch |
| PM-SCR-020 — `#vendors` | Directory, tax identifiers, AP, payment schedules and scorecards. | Add duplicate supplier review, approved bank-detail change, supplier returns/credit notes and aging. Clearly distinguish format validation from live GST verification. Payment bank-detail changes need independent verification before payout. | Before launch |
| PM-SCR-021 — `#revenue-share` | Agreements, royalties, guarantees and settlements. | Define the calculation base precisely: tax, returns, discounts, delivery fees and period cut-off. Effective-date agreements, show a calculation preview and retain signed versions. Reconcile settlement to finance and bank payments. | Before launch if used |
| PM-SCR-022 — `#reports` | Fourteen report types and exports. | Publish a metric dictionary: gross/net sales, collections, cost, margin, food cost and labour cost. Include source scope, period, generation time and freshness. Reconcile totals to posted records, paginate detail and remove sensitive columns before export. | Before launch |
| PM-SCR-023 — `#admin` | Café creation, users, permissions and assignments. | Use a café activation checklist for tax, menu, stock, till, employees and devices. Distinguish draft/suspended/closed cafés and preserve history. Audit permission changes; prevent self-escalation, orphan users and accidental loss of the last recoverable Primary Master. | Before launch |
| PM-SCR-024 — `#org-identity` | Legal names, addresses, tax/licence data and branding. | Separate organisation identity from outlet registrations where required. Validate changes and preserve identity snapshots on issued documents. Protect uploads and do not rewrite historic invoices after branding/address changes. | Before launch |
| PM-SCR-025 — `#cafe-ops-devices` | Enrollment, sessions, remote lock and revocation. | Show bound café, platform, last seen, operator and pending sync. Test lost-device revocation, enrollment-code reuse, operator handover and browser-data reset. A copied fingerprint alone is not a hardware security guarantee. | Before launch |
| PM-SCR-026 — `#system-health` | Database, storage, scanner and latency status. | Add last backup and successful restore drill, job lateness, sync backlog, email failures, quota headroom and deployed version. Separate liveness from optional dependency degradation. Never expose credentials, raw tokens or sensitive diagnostic payloads. | Before launch |

The Primary Master sidebar can group these into Operations, People, Finance, Commercial, Insights and Administration, with a workspace selector for Owner and Staff views. Search and favourites reduce navigation work; they should not weaken the permission model.

## 8. Normal Master module requirements

### Normal Master — complete difference review

Reuse the Primary Master modules above with server-enforced restrictions. The documented 21-screen count is consistent with excluding five of the 26 Primary Master modules; Trash is a separate shared route.

| Module group | Recommended Normal Master behaviour |
|---|---|
| Dashboard, POS, tasks, attendance, department orders | Operational access to granted cafés; action-level limits for refunds, approvals and attendance corrections. Show operational financial totals needed for the job without exposing owner accounts. |
| Inventory, procurement, assets, quality | Operational access with approval limits, supporting evidence and source-linked changes. No self-approval of a restricted request. |
| Employees | Operational employee maintenance within assignment; bank, KYC and pay fields hidden unless specifically granted. A masked list cannot be paired with an unrestricted detail/download endpoint. |
| Bills, expenses, sales/cash | Operational archive, expense workflow and till reconciliation; limits for backdating, reversals and closed periods. |
| Finance | Decide whether Normal Master needs ledger posting or only operational summaries. Filter sensitive accounts and exports consistently; totals themselves can disclose restricted pay/drawings. |
| Customers, menu, vendors | Only the required view/edit actions. Treat bulk customer export, price change and vendor bank change as separate permissions. |
| Reports | Use a report permission catalogue, not only a count such as “12 of 14.” Restrict underlying queries and field projections. |
| Administration, devices and health | Scoped provisioning and diagnostics only. No modification of primary authority or security policies that would bypass restrictions. |
| Payroll, passbook, personal ledger, revenue share, organisation identity | Denied by default, matching the stated distinction. Own employee payslip access remains a separate self-service right. |
| Trash and Owner strategic pages | Resolve the documentation conflict. Recommend no permanent purge and no automatic access to all Owner modules merely because the role value is MASTER. Delegate selected functions explicitly. |

If a person genuinely needs payroll administration, grant a named payroll capability and scope. Do not achieve it by broadly upgrading them to unrestricted Primary Master.

## 9. Owner module requirements and connected workflows

### Owner business questions

On opening the app, I would want to answer six questions quickly:

1. What did each café sell, and how much money was actually collected?
2. Which cafés are profitable, and which costs explain the result?
3. What money is available, what do customers owe us, and what must we pay next?
4. What needs my decision today, and who will carry it out?
5. Are staffing, stock, equipment and customer service ready for the next trading period?
6. Has a problem been resolved, with evidence, or merely marked as read?

The documented Owner portal is broad: 18 dedicated screens, including 15 strategic modules, plus shared financial, people and reporting destinations. I would keep those capabilities and make the daily decisions above the default experience. The main opportunity is connecting summaries, evidence, approvals and outcomes. More menu entries alone would not provide that connection.

**Evidence labels used below**

| Label | Meaning |
|---|---|
| Documented | A capability is described in the supplied files. Its implementation has not been independently verified. |
| Conflict | The supplied route, permission or endpoint descriptions disagree. Verify the actual code before calling this a live defect. |
| Verify/complete | Related functionality exists in the documentation, but the complete Owner workflow is not demonstrated. |
| Optional | A proposed extension justified only by actual business needs. |

### All 18 Owner screens: combined completion criteria

The fifteen strategic modules are documented. Their value depends on trustworthy operational inputs and clear ownership of resulting actions. For a small chain, place high-value exceptions first and allow advanced sections to be collapsed.

| Screen ID and route | Purpose | Baseline completion criteria | Owner workflow completion criteria |
|---|---|---|---|
| OWN-SCR-001 — `#dashboard` | Understand today and decide what to act on. | Show assigned café performance, collections, overdue debts, margin basis, exceptions and last synchronisation. Avoid presenting estimates as audited profit. Link every alert to a scoped record or action. | Assigned-café switch; period filters; sales/collections/profit distinction; due/overdue money; exceptions; source drill-down; freshness; saved display preferences. |
| OWN-SCR-002 — `#owner-food-safety` | Review the existing quality and incident controls. | Verify supplier-lot tracing, quarantine, incident ownership, corrective action and recall closure. A recall register should trigger actual stock restrictions and store tasks. | Critical alerts; affected café/lot; supporting evidence; responsible person; corrective task; stock restriction status where already applicable; escalation; verified closure. This does not add kitchen display or ticket-handling features. |
| OWN-SCR-003 — `#owner-risk-audit` | Investigate unusual activity fairly. | Link anomalies to evidence and reviewer outcomes. Use configurable rules for excessive discounts, voids and cash variance; an alert is not proof of staff misconduct. Record false positives and resolution. | Discount/refund/cash/stock exception list; configurable thresholds; original records; reviewer comments; reason; outcome; false-positive status; follow-up tasks. An alert is not a finding of misconduct. |
| OWN-SCR-004 — `#owner-planning` | Plan spending and expansion. | Version budgets, compare them with posted actuals and show approved versus proposed CAPEX. Reforecast with assumptions; do not change historic budgets silently. | Café/month budgets; approved versus draft versions; actual variance; forecast assumptions; cash-needs view; CAPEX proposal/approval/spend; estimated payback; optional new-outlet scenario. Do not auto-post a forecast as an expense. |
| OWN-SCR-005 — `#owner-compliance` | Know what expires and who is responsible. | Track café/entity, document, responsible person, due date, reminders, evidence and renewal status. Distinguish an uploaded licence from verified current compliance. | Applicable licence/lease/insurance register; café/entity; document; due date; renewal cost where known; reminders; accountable person; evidence; verified status. Determine actual legal applicability separately. |
| OWN-SCR-006 — `#owner-supplier-intelligence` | Buy reliably at understood cost. | Derive scores from receipt accuracy, rejected goods, lead times and matching exceptions. State sample sizes and date windows so one delivery does not produce a misleading ranking. | Unit-normalised price history; supplier bill/dues drill-down; delivery accuracy; shortages/rejections; credit notes; negotiated terms; price-change explanation; alternate suppliers where used; approved PO follow-through. |
| OWN-SCR-007 — `#owner-academy` | See whether employees are prepared for their roles. | Connect SOP publication to assigned employees, acknowledgments, training evidence and expiry. Version the SOP actually acknowledged. Provide a staff-facing destination for the assignment. | Assign SOP/training; version and due date; staff acknowledgment; supervisor verification when needed; completion by café; overdue items; links to onboarding. Do not equate opening a document with demonstrated competence. |
| OWN-SCR-008 — `#owner-asset-reliability` | Keep the café operating. | Reconcile equipment incidents to the operational asset register. Define downtime start/end and cost assumptions; show missing history before calculating reliability metrics. | Equipment location/custodian; breakdown ticket; downtime; repair quote; approved spend; service due date; warranty evidence; repeated failures; repair-versus-replace proposal. Complex prediction is optional. |
| OWN-SCR-009 — `#owner-privacy-cyber` | Review access and data incidents within the portfolio. | Connect the register to actual access reviews, retention rules, security incidents and export logs. Verify access/deletion requests and protected record exceptions. A compliance dashboard alone does not implement those controls. | Permitted-user/access review; leaver access-removal status; relevant device incidents; export/access history; retention requests; incident owner and resolution. Sensitive logs and another owner's records remain restricted. |
| OWN-SCR-010 — `#owner-bcdr` | Know how trading continues during a failure. | Store actual backup/restore evidence, emergency procedures, contacts, measured recovery time and recoverable data point. Test a full outage and an unavailable Primary Master. | Latest successful backup and restore-test status; measured data age; pending-sync totals; emergency contacts; supported outage procedure; update/rollback status; unresolved recovery issues. Show verified evidence, not a decorative green badge. |
| OWN-SCR-011 — `#owner-master-data` | Keep business records consistent. | Assign domain ownership and review duplicate proposals. Preview dependencies before merges; retain aliases and historical identifiers. Avoid deduplicating confidential data across unrelated organisations. | Duplicate-customer/vendor suggestions; assigned café/menu/item change proposals; dependency preview; reviewer and reason; approved merge history. Retain invoice history and do not merge unrelated private data. |
| OWN-SCR-012 — `#owner-complaints` | Resolve customer problems and identify repeats. | Link complaint to café/order where available, severity, owner, deadline and outcome. Require approval for compensation and trace vouchers/refunds to finance. Protect customer and employee information. | Complaint linked to café/order; category/severity; assigned person; due date; communication notes; compensation approval; linked refund/voucher execution; closure evidence; recurrence analysis. Customer satisfaction trends need their response count. |
| OWN-SCR-013 — `#owner-menu-pricing` | Decide what to sell and at what price. | Base margin on recipe/yield and relevant costs. Show assumptions and sample sizes. Send approved price changes into the menu workflow with an effective date; prevent retroactive repricing of issued bills. | Popularity and contribution by item; ingredient/packaging-cost basis; margin changes; discount effect; proposed café-specific price; effective date; approval and applied status. Scenario results must be labelled estimates. |
| OWN-SCR-014 — `#owner-customer-loyalty` | Understand repeat business. | Reconcile points liability to the actual loyalty ledger. Define cohort and repeat-customer rules; label forecasts as estimates. Start with descriptive retention before complex churn predictions. | Returning identified customers; repeat purchase rate with a defined denominator; points earned/redeemed/expired; reward cost; customer opt-outs; campaign history. Retain anonymous purchases. Complex CLV and churn prediction are optional. |
| OWN-SCR-015 — `#owner-utilities-waste` | Explain avoidable operating costs. | Capture meter units, period boundaries and source evidence; normalise comparisons by sales/orders or activity. Ensure food wastage is counted once across inventory and sustainability reporting. | Meter reading/period/bill; utilities per comparable unit of activity; recorded material waste; reason and approval; cost trend; follow-up. Reconcile with inventory and expenses so the same cost is not counted twice. |
| OWN-SCR-016 — `#owner-governance-delegation` | Delegate decisions with clear accountability. | Make delegated limits and expiry dates govern approval APIs, not just a register. Prevent delegation of powers the delegator does not possess. Test revocation and conflict-of-interest handling. | Capability, café and amount limits; start/expiry dates; substitute approver; escalation; revocation; policy history; conflicts/self-approval rule; links to actual approval enforcement. Retain ownership/board records if the business uses them. |
| OWN-SCR-017 — `#performance` | Compare assigned cafés on consistent terms. | Compare the same business periods, trading days and accounting bases. Separate new/closed cafés, stale feeds and missing data. Show the numerator and denominator behind ratio rankings. | Sales, collections, profitability, customer dues, labour/stock ratios, complaints and downtime; comparable periods; budget variance; trading-day adjustment; freshness/missing-data indicators; evidence drill-down and export. |
| OWN-SCR-018 — `#finance` | Understand earnings, obligations and funds. | Restrict every source query to the assigned portfolio and allowed accounts. Distinguish cash flow, accrual profit and drawings. Totals must reconcile to Master finance for the identical scope. | Café P&L; posted/provisional status; cost allocation; customer receivables; supplier payables; permitted bank/cash balances; cash-needs forecast; own capital/drawings/revenue share links; period close; accountant export. |

Also cover the Owner's shared destinations listed outside the eighteen-screen index: bills, cash book, attendance/employee oversight, approved payroll summaries, passbook, own personal ledger, own revenue share, organisation identity read view, reports, tasks, health, profile, notifications and settings. Their access must follow the policy in chapter 4; the existence of a route is not a blanket write permission.

Every screen below is already listed in the source documentation. The options in the third column are recommended completion criteria, not claims that all are absent.



A cross-café P&L comparison is an established product pattern: [MarginEdge documents selecting accessible restaurants and comparing/exporting their P&L side by side](https://help.marginedge.com/hc/en-us/articles/17803136151443-P-L-Multi-Unit-Side-by-Side-Comparison). Zamorin should calculate its own comparable results from its own records; buying that product is not part of this recommendation.

### The most valuable missing or insufficiently specified workflows

| Priority | Workflow | Current evidence | What I would require |
|---|---|---|---|
| 1 | Explain each café's profit | P&L and margins are documented; completeness of cost allocation and the provisional/closed distinction is not established. | A bridge from net sales through goods cost, labour, local operating expenses and separately disclosed shared costs. Open-period estimates must be labelled; show missing invoices/counts. Keep EBITDA, operating profit, net profit and cash balance distinct. |
| 2 | Credit customer collections | Department credit orders exist, but the Owner's end-to-end collection view is not demonstrated. | Customer/institution statements, invoices, due dates, aging, partial receipts, collection owner, promised-payment date, disputes and approved credit limits. Collection of an earlier invoice does not create another sale. |
| 3 | Upcoming cash needs | Historical cash-flow summaries are documented; a forward-looking payment plan is not explicit. | Begin with the next 7/30 days of supplier, rent, payroll and other obligations. Add an optional weekly 13-week forecast, with expected collection dates, confidence and editable assumptions. Separate forecast from actual funds. |
| 4 | Supplier dues and payment follow-through | AP and supplier intelligence exist; the Owner ledger access conflict is unresolved. | Show approved, disputed, overdue, partially paid and settled bills. Link proposed payment, approval, execution reference and bank confirmation. Prevent duplicate payments and duplicate purchase/expense recognition. |
| 5 | Daily café close review | Cash reconciliation, cash drops and Z-reports exist; an Owner acknowledgment workflow is not detailed. | A dated close pack with sales, collections, expected/count cash, payment differences, deposits, credit additions/collections and stock/attendance exceptions. The manager explains differences; the Owner reviews or returns the pack. |
| 6 | One decision inbox | Tasks and delegation exist; the full set of connected Owner approvals is not shown. | Purchase, expense, CAPEX, price-change, credit-limit and relevant compensation/advance requests show supporting records, amount, café, requester, deadline and permitted actions. Show what happened after approval. |
| 7 | Labour coverage and cost | Attendance, employee read access, payroll summaries and labour-cost ratios are documented. | Compare scheduled and actual hours, identify uncovered shifts, show pending exceptions and overtime cost, and include salaried staff in the period cost where applicable. Tie staffing suggestions to demand, skills and approved leave. |
| 8 | Explain inventory variance | Counts, recipes, waste and pricing exist; a complete Owner actual-versus-expected usage explanation is not demonstrated. | Compare observed stock use with expected use from sales, then identify recorded waste, staff meals, complimentary items, transfers and unresolved differences. Check data and count errors before assigning responsibility. |
| 9 | Manager follow-up | Operational tasks and handover checklists exist; a consolidated Owner review log is not explicit. | Per-café daily notes, incidents, unresolved issues, assigned actions, due dates, acknowledgment and closure evidence. Reuse tasks and announcements. Keep confidential HR matters in their restricted workflow. |
| 10 | Compare cafés fairly | Comparative performance is documented. | Use consistent periods, cost definitions, trading days and data freshness; separate incomplete/new/closed locations. Explain shared expenses and shared-bank-account allocation before ranking results. |

These workflows refine existing modules. They do not require ten additional pages. Priorities apply when the corresponding business activity is used: for example, credit collections are necessary for credit trading, while a 13-week forecast can follow a simple reliable due-date view.

### Owner overview content within the existing design

Within the existing shell and page arrangement, make the current owner, **All my cafés / one assigned café** scope, reporting/comparison period, business date, last successful synchronisation and provisional/closed state available through the current component patterns. Do not redesign or rearrange the header. Keep personal settings, help, account security and logout available on mobile as well as desktop.

Provide the following figures and detail through existing cards, reports and detail controls; this is a content contract, not a new dashboard layout:

| Home-page element | Required meaning and drill-down |
|---|---|
| Sales | Net sales, discounts/refunds and tax shown with clear definitions; open the supporting bills. Do not label bill count as customer footfall unless customers/covers are actually captured. |
| Collections | Cash, electronic receipts and collections of earlier credit, with settlement status where relevant. Unverified manual entries and confirmed bank receipts remain distinguishable. |
| Profit estimate / closed-period profit | Named calculation basis, included costs and data completeness. Open the profit bridge and supporting expense/stock/labour records. |
| Customer dues | Total outstanding and overdue balances, with responsible person and next collection action. |
| Payments due | Obligations due soon, approved amounts and unresolved disputes. Open a bill or payroll summary, then the authorised approval flow. |
| Cash and deposits | Counted café cash, cash handed over, outstanding deposits and permitted bank balances with their as-of dates. A shared bank balance must not be copied into every café total. |
| Decisions and exceptions | A short prioritised list: approval requests, unexplained cash differences, overdue collections, uncovered shifts, outages, equipment faults or critical existing quality incidents. Each item opens an action. |
| Café status list | Trading/open/closed state if maintained, last sync, closing-pack status, accountable manager and unresolved high-priority issues. |

Avoid putting every strategic graph on the first screen. A useful action pattern is **View evidence → approve, reject, request correction or assign → track completion**. Acknowledging a notification must not mark a payment as made or an incident as resolved.

For example, a café might make ₹10,000 of new sales, of which ₹2,000 is sold on credit, and also collect ₹3,000 against old invoices. Collections are then ₹11,000 even though new sales are ₹10,000, assuming no refunds or other movements. Neither amount establishes profit. The dashboard should make this distinction easy to understand.

### Shared operational options the Owner still needs

The 18 dedicated pages do not cover every daily Owner action. These supporting views should be reachable from their relevant Owner page without requiring an unrestricted Master login.

| Supporting view | Owner options | Relevant existing area |
|---|---|---|
| Bills and sales | Search/filter bills; authorised detail; tender and settlement status; linked refunds/credit notes; reason/history; safe PDF/export. | `#bills`, reports and finance. |
| Customer credit | Customer/institution balance; statement; age/due date; partial allocation; collection task; approved limit and dispute. | Department orders data, finance and tasks; Owner-specific read path if the operational route stays restricted. |
| Supplier dues | Bills, PO/receipt match, returns/credit notes, due dates, payment requests and settlement evidence. | Supplier intelligence, vendor ledger, procurement and finance. |
| Cash close and deposits | Opening float; expected and counted cash; paid-outs; differences; named handover; deposits awaiting bank match; review/return. | `#sales-cash`, `#passbook` and tasks. |
| Expense review | Category, café, payee, evidence, budget impact, approval and payment status; recurring commitments; duplicate warning. | Expense records and approval inbox through an authorised read/approval view. |
| Stock position | On-hand and unavailable stock; count date; low-stock/expiry alerts; transfer in transit; adjustments; material packaging where useful. | Inventory data, supplier intelligence and performance. |
| People and shifts | Active staff, assigned café/role, scheduled versus actual attendance, leave impact, uncovered shifts, overtime, onboarding/exit tasks. | `#employees`, `#attendance`, academy and tasks. |
| Payroll and advances | Payroll summary; significant changes from prior period; unresolved attendance inputs; approved advance requests; payment status; authorised payslip access. | Owner finance and delegated payroll/advance views. A payroll-run button remains a separate privileged capability. |
| Own capital and drawings | Money introduced, drawings, reimbursements, revenue-share calculations and settlement statements for the Owner's permitted records. | `#ledger`, `#revenue-share`, `#passbook`. Drawings must not silently become café operating expenses. |
| Tasks and manager log | Request evidence; assign responsibility; due date; comments; follow-up; acknowledge daily close; review completion. | `#approvals`, tasks and announcements. |
| Reports and downloads | Café/date filters; saved views; report definitions; PDF/CSV/Excel as supported; source totals; permitted columns; export history. | `#reports` and shared export controls. |
| Personal account and help | Own profile/security; language and display preferences; notification preferences; active sessions; help; secure logout. | Shared profile/settings/notifications; existing authentication flows. |

## 10. Cafe Operations screens and reused modules

### Café Operations — all seven dedicated screens and fifteen modules

Use named operators on enrolled terminals. Keep a store terminal bound to its café. Within the same workspace, define cashier, shift-supervisor and stock-receiver capabilities if the staffing model requires them; these do not need additional top-level windows.

| Dedicated screen | Recommended completion and verification | Priority |
|---|---|---|
| CAF-SCR-001 — `#dashboard` | Show current store, operator, shift, pending operational tasks, till state and offline queue. Prioritise the next operational action over executive charts. | Before launch |
| CAF-SCR-002 — `#cafe-operator-signin` | Rate-limit PIN attempts using persistent account/device controls. Show the selected café, support individual PIN reset and sign-out/handover. Never use one shared operator account for all staff. | Before launch |
| CAF-SCR-003 — `#cafe-device-state` | Distinguish unenrolled, revoked, locked, offline, expired and service-unavailable states. Give an appropriate recovery action without offering a security bypass. Preserve unsent data for authorised recovery. | Before launch |
| CAF-SCR-004 — `#kiosk-attendance` | Display a short-lived challenge, minimum personal data and a clear clock source. Reject replayed challenges; define the fallback when camera or network fails. Do not expose a directory of salaries or private employee records. | Before launch |
| CAF-SCR-005 — `#cafe-master-signin` | Use time-limited elevation with strong authentication, visible privileges and automatic return to the operator. Record elevated actions under the Master identity and retain the terminal's café binding. | Before launch |
| CAF-SCR-006 — `#cafe-device-enroll` | Verify single-use, expiring codes, authorised issuer, correct café, terminal name and revocation. Test stolen/reused codes and interrupted enrollment. | Before launch |
| CAF-SCR-007 — `#cafe-terminal-welcome` | Show café and device identity, operator sign-in, attendance entry, connectivity and safe restart/help. Do not expose an organisation-wide switch to an ordinary store terminal. | Before launch |

| Reused operational module | Required store-specific behaviour |
|---|---|
| 1. Dashboard | Store-only totals, current shift and truthful freshness. |
| 2. POS | Fast sales flow; explicit authority for discounts, refunds, voids and cash drawer actions. |
| 3. Attendance and shifts | Current store scheduling/validation; no access to confidential employment records. |
| 4. Department orders | Local fulfilment and receipts; preserve customer credit/accounting links. |
| 5. Inventory | Store counts, inward, wastage and approved adjustments; no arbitrary central stock edits. |
| 6. Procurement | Requisitions and authorised GRN acceptance; no automatic self-approval of purchases. |
| 7. Assets | Local inspection, breakdown reporting and maintenance completion evidence. |
| 8. Quality | Opening/closing and safety checks with assigned corrective tasks. |
| 9. Expenses | Capped local claims/vouchers with named payee, proof and approval. |
| 10. Sales and cash book | Opening float, cash movements, counted closing balance and signed handover. |
| 11. Customers | Minimum lookup/enrollment/redemption data; no unrestricted customer database export. |
| 12. Reports | Only current store and authorised operational metrics. |
| 13. Action centre | Tasks and approvals that the current operator is actually permitted to complete. |
| 14. Devices and sessions | Local status and printer diagnostics; no revocation of unrelated café devices. |
| 15. Settings | Printer, language, local display and own credentials; no hidden organisation administration. |

Treat customer receipt printing and cash drawer opening as distinct operations. Log controlled reprints and provide a browser/PDF fallback. Test the real printer models, paper widths and browser/device combinations; a wrapper project alone does not establish working hardware support.

## 11. Employee and Staff screens

### Employee / Staff — all nine screens

The staff window should make daily work and employment information easy to find. Payslips, leave and documents deserve direct “My Work” or “My Employment” access even if the sidebar stays short.

| Screen ID and route | Recommended completion and verification | Priority |
|---|---|---|
| EMP-SCR-001 — `#staff-home` | Today's shift, assigned café, attendance state, tasks, announcements and quick links. Show the next shift and last data refresh. A Primary Master staff preview must identify the target employee explicitly. | Before launch |
| EMP-SCR-002 — `#announcements` | Target audience/café, publishing and expiry dates, author and acknowledgment for required notices. Verify archived or unassigned notices do not leak. Normal announcements should not force unnecessary acknowledgment. | Soon |
| EMP-SCR-003 — `#staff-attendance` | Show punch history, missing punch request and correction status. Handle poor GPS, denied permission, no smartphone and network loss through a reviewed alternative. Collect location at the needed attendance action, not continuous off-duty tracking. | Before launch |
| EMP-SCR-004 — `#staff-leave` | Explain balance, dates, half days, status and approving person; handle overlapping requests, cancellation and rejection reasons. Verify roster/payroll updates happen only on the appropriate approval state. | Before launch |
| EMP-SCR-005 — `#staff-payslips` | Clear earnings/deductions, payroll period, revision and payment status. Enforce self-only access on the PDF itself and allow a payroll query/dispute. Do not publish draft or another employee's payslip. | Before launch |
| EMP-SCR-006 — `#staff-loans-advances` | Show requested, approved, disbursed, repaid and outstanding amounts separately. Provide instalment schedule, rejection reason and deduction history. Define cancellation, early repayment and exit settlement. | Before launch if offered |
| EMP-SCR-007 — `#staff-documents` | Label document purpose, visibility, expiry and review status. Limit required identity data, guard uploads/downloads and keep pending scans unavailable. Connect employment/training evidence to the employee's actual assignments. | Before launch |
| EMP-SCR-008 — `#employee-profile`, `#profile` | Self-service contact/emergency-contact edits; reviewed bank-detail changes; clear read-only employment fields. Verify identity display for non-employee administrative accounts instead of inventing an employee record. | Before launch |
| EMP-SCR-009 — `#staff-settings` | Language, accessible display, personal notifications/security and logout. Keep security ownership explicit in supervisory preview. Test all advertised languages on errors, validation and exports where supported. | Before launch |

Retained Staff extensions are a roster calendar, shift-swap request with approval, training/SOP acknowledgments, a payroll/attendance query inbox and a confidential HR concern channel. Choose actual recipients and visibility for confidential concerns; they should not automatically appear in a general store task list. These are proposed extensions, not confirmed missing modules.

## 12. Shared pages, all settings and every control

### Shared pages, settings and every cross-window control

| Screen ID | Recommended completion and verification | Priority |
|---|---|---|
| SHARED-SCR-001 — Settings Hub | Test all destinations in the next table for every role and preview mode. Match visible controls to backend authority. | Before launch |
| SHARED-SCR-002 — `#notifications` | Scope recipients and record links; mark read, clear and badge counts consistently. Recheck access when a notification is opened. Deduplicate retries, display delivery failures and avoid sensitive salary/KYC details in notifications. | Before launch |
| SHARED-SCR-003 — `#trash` | Display original café/entity, deleted-by/time/reason and dependencies. Check permissions again on restore. Protect retained financial history and prevent restoring old access grants accidentally. Purge must be a separate strongly authenticated action. | Before launch |
| SHARED-SCR-004 — `#mailops` | Complete the reported dead route; scope threads/attachments, preserve delivery and retry status, redact secrets and test the production-compatible email adapter. | Before enabling |
| SHARED-SCR-005 — `#attendance-qr-scanner` | Add this destination to the canonical inventory. Verify camera permission, secure context, QR freshness, café binding, duplicate scans and fallback entry. Stop the camera when leaving the screen. | Before launch |

**Settings overview plus all sixteen destinations:**

| Destination | Expected behaviour and improvement |
|---|---|
| Overview — `#settings` | Show only accessible destinations, with clear ownership: personal, café or organisation. |
| Profile — `/profile` | Validate contact/avatar changes, preserve identity links, scan uploads and distinguish personal profile from employee administration. |
| Employment — `/employment` | Show effective job, café assignments, joining date and relevant employment services. Handle administrative users who are not employees. |
| Access — `/access` | Readable explanation of role, grants and scopes; ordinary users cannot modify authority. Primary Master can reach a separate governed administration action. |
| Security — `/security` | Password, MFA, passkeys, recovery code regeneration and recent security activity. Strong authentication for disabling factors or sensitive changes. |
| Devices — `/devices` | Show current and other personal sessions, last activity and revoke actions. Keep personal sessions distinct from store terminal enrollment. |
| Recovery — `/recovery` | Verified recovery channels, delivery test and loss-of-factor procedure. A displayed phone field must not imply working free SMS delivery. |
| Notifications — `/notifications` | Per-channel/category preferences; explain essential security notices and the handling of disabled email delivery. |
| Language — `/language` | Translate navigation, validation, confirmations and empty/error states; use locale-aware numbers and dates. Keep a clear fallback for untranslated text. |
| Appearance — `/appearance` | Verify all offered themes on forms, charts, warning states and printed output. Themes must preserve contrast and status readability. |
| Accessibility — `/accessibility` | Keyboard use, focus visibility, readable scaling, reduced motion, labelled inputs and non-colour status cues. Avoid layouts that fail when text grows. |
| Workspace — `/workspace` | Save permitted landing route, table density and favourites per user/context. Do not let a stored preference reopen a now-restricted café or screen. |
| Privacy — `/privacy` | Explain what is collected, visibility and request handling. Verify identity before releasing data; preserve applicable business retention requirements. No unrestricted “delete all records” action. |
| Updates — `/updates` | Show installed and available versions, safe update instructions and rollback information. Never clear pending sales when refreshing service-worker caches. |
| Help — `/help` | Provide role-specific guidance, printer/connectivity diagnostics, support contact and an issue reference. Diagnostic exports must remove personal data and secrets. |
| Trash — `/trash` | Same permissions and retention safeguards as the shared Trash screen; a settings alias must not bypass them. |
| Administration — `/admin` | Same café/user/role restrictions as administration; no privilege escalation through a settings subroute. |

**Universal attachments:** verify entity ownership on upload, preview, download and deletion; stream or bound memory; enforce actual file signatures and size limits, not only supplied MIME headers. Maintain pending/clean/rejected status, scanner version/time and safe preview. Hashes establish content integrity, not absence of malware. GridFS is a storage mechanism; document the actual encryption and key-management controls separately. Test the claimed iframe PDF preview against the deployed frame/CSP headers.

**Export Centre:** carry café, organisation, filters, timezone, currency, generation time, authorisation scope and record counts into the export. Enforce fields on the backend even when the client requests hidden columns. Sanitize spreadsheet formula-like text and validate amount/date data types. Use short-lived authorised downloads; large exports need bounded work and progress/error handling. An export is not a complete system backup unless it includes restore-ready relationships and attachment data.

**Printing/PDF:** verify 58 mm, 80 mm and A4 layouts; long product names, modifiers, local-language fonts, refunds, tax breakup and page boundaries. Provide business-appropriate invoice and payslip layouts. The references' APA 7 styling for audit reports is optional presentation style, not evidence of financial correctness or a requirement for a thermal receipt.

**Global search:** if present or added, apply permissions before returning suggestions, counts, snippets or records. Search results should show café/context and transfer the user deliberately to the relevant workspace. Do not leak a restricted employee's salary through a result snippet.

**Modals and actions:** review add/edit/view, approve/reject, submit/cancel, delete/restore/purge, import/export, print/reprint, attach/download and refresh for every page that exposes them. Check keyboard focus, Escape behaviour, unsaved changes, validation, loading state, repeated clicks, server rejection and permission loss while the modal is open. Show success only after the relevant operation has actually committed.

### Required behaviour of the interface

| ID | Area | Implementation contract and observable result |
|---|---|---|
| RQ01 | Dropdowns and calendars | Reuse the existing theme colours, fonts, borders, radius and focus styles. Support keyboard selection, scrolling, touch, disabled dates, clear/reset and validation. Popovers must remain visible within dialogs and small screens. Native operating-system pickers cannot always be styled fully; use an accessible app-styled control where exact visual matching is required. |
| RQ02 | Language | English, Malayalam, Hindi and Tamil are documented. Each enabled language must translate navigation, buttons, dialogs, validation, notifications, chart labels and calendar labels. Format dates and numbers consistently. Save the selection for the signed-in user, apply it immediately and restore it after reload/login. Do not translate employee names, product names or source records automatically. Missing translations need a readable fallback and a tracked defect. |
| RQ03 | Font size and accessibility | Compact, standard and large must change the real text scale, not just the selected indicator. Apply the preference across all windows, menus, forms, dialogs and charts without clipping. Preserve the default visual design. Test browser zoom and text enlargement, keyboard focus and supported high-contrast settings. Font coverage must include the enabled Indian-language scripts. |
| RQ04 | Password controls | The signed-in Change Password action opens the documented current/new/confirm password form and calls the protected change-password flow. The login Forgot Password action opens recovery, verifies the account through the approved channel, and then permits a new password. Neither button may only display a toast or return to the dashboard. See the security requirements below. |
| RQ05 | Login backgrounds | Verify every referenced image and animated background on fresh load, cached load, slow connections and supported screen sizes. Use correctly sized assets, stable dimensions and a fallback within the current visual style. Login fields must become usable independently of background loading. Preserve contrast and respect reduced-motion preferences. |
| RQ06 | All settings | Check the overview and all 16 documented destinations. Profile/avatar changes must persist; read-only employment/access information must be accurate; MFA/passkeys, session removal and recovery verification must perform their real security operations. Notification settings, default landing page, density, privacy requests, update controls, diagnostics, help, trash and administration must have an actual permitted outcome. A setting must distinguish personal preference, café configuration and organisation policy. |
| RQ07 | Every other action | Inventory every link, button, toggle, dropdown, date filter, chart interaction, upload, export, print and notification link across the 71 documented screen IDs. Record its role/café scope, handler, API or local effect, durable result and failure behaviour. Reconcile the claimed 650 controls, including the seven partial actions and one dead action; the documentation does not provide a complete control-level inventory. |
| RQ08 | Fast and honest feedback | Respond visibly to an interaction promptly, prevent repeated submissions, and distinguish pending, saved, failed and offline states. Never show completed payment, attendance or approval before the authoritative result is known. Performance targets are defined in chapter 19. |

Language and size preferences should be available locally for early rendering, then reconciled with the authenticated user's stored preferences. Clear the previous person's private view on a shared-device user change. For exports, define the report language explicitly and embed suitable fonts; changing the interface language must not change the accounting currency, recorded values or business timezone.

The date filter, calendar selection, chart and downloaded report must use the same date boundaries. Keep civil-date records such as leave dates separate from timestamps. Associate an overnight shift with its defined shift/business date while retaining the actual check-in and check-out times.

### Controls that should work consistently on every relevant page

| Control or state | Required behaviour |
|---|---|
| Search and filters | Search only permitted records; show active café/date/status filters; preserve useful state on drill-down and provide a clear reset. |
| View details | Open the supporting record and history; display its true café and date even when navigating from an aggregate. |
| Add/edit | Validate required fields and duplicates; show unsaved changes; preserve a recoverable draft where appropriate; reject stale edits with a usable resolution. |
| Submit and approve | Show evidence and consequences; use clear request/approval/execution states; record the actual actor and reason; handle permission changes while a form is open. |
| Bulk actions | Preview the exact selected records and scope; show individual success/failure; avoid silently applying an action to all filtered pages. |
| Financial corrections | Preserve posted history using the approved reversal/adjustment flow; ordinary editing must not rewrite a settled invoice or locked payroll. |
| Attachments | Clear upload/scan/rejected states, authorised preview/download, useful filenames and safe failure handling. A failed upload must not appear attached. |
| Imports | Template, mapping, dry-run validation, duplicate review, opening-balance reconciliation where relevant and a controlled commit result. |
| Exports | Match visible scope and approved fields; carry filter metadata; safe spreadsheet text; bounded processing and meaningful progress/failure. |
| Loading/empty/error/offline | Distinct messages and next actions. Never show invented demo records or a success message after a failed write. |
| Notifications | Link to the relevant authorised action; distinguish delivered/read/acted-on; keep salary and sensitive document content out of inappropriate previews. |
| Mobile and keyboard use | Legible labels, adequate targets, usable tables, focus handling and text alternatives. Do not rely only on colour, hover or gestures. |
| Help and status | Explain what the person can do next; expose an issue reference and relevant sync/availability state without showing secrets or stack traces. |
| Logout/lock/update | Clear private views and revoke the intended session while preserving business records that need authorised sync/recovery. |

## 13. Whole-app business capability catalogue

### Whole-app scope

The user's clarified request is to evaluate the entire app as a café business owner: what should exist across Primary Master, Normal Master, Owner, Café Operations and Employee/Staff. This section expands the precision of the existing review. It does not require every recommendation to become a separate screen. Retain working features, connect existing modules and add only the missing behaviour needed by the business.

### What is already documented, and what remains unproven

Attendance calendars, rosters, missed-punch requests, leave balances, payroll, inventory, procurement, finance, charts/reports and the 18 Owner pages are already described. They should not be described as wholly absent. The gaps to verify are their detailed rules, connections, permissions, calculations, exception handling and real-device behaviour.

The supplied report descriptions claim 14 BI reports but do not provide a complete named report contract with fields, filters, formulas and role access for every report. The report families below are a proposed business coverage checklist. Map the existing reports to it before implementing anything new; the family count is not a claim that the app is missing that many reports.

Additional Owner access inconsistencies identified during the focused review also apply to the full app: the role matrix allows read-only supplier/AP access, while the example vendor-ledger endpoint lists `requireMaster`; several operational routes omit Owner even though supporting detail is needed for Owner summaries. Together with the already recorded PO approval and account-scope conflicts, these require a consistent read/approve/execute policy. An Owner-specific read panel can provide evidence without granting unrestricted operational write access.

Use **documented core / verify completion / conditional extension** for the requirements below. All are recommendations based on documentation; no missing implementation is inferred solely from a missing description.

### Business capability checklist across the whole app

| Area | Documented foundation | Options or completion checks needed | Where they belong |
|---|---|---|---|
| Login and account lifecycle | Password, MFA/passkeys, recovery and trusted devices. | Controlled account invitation/provisioning; correct landing page; suspended account handling; actual recovery delivery; expired invitations/tokens; shared-device logout; lost-factor recovery; safe employee exit. | Shared authentication; Primary Master administers, each person manages own credentials. |
| Café/workspace selection | Five personas and café scoping. | Primary Master switches all five workspaces and cafés within the organisation, including supervised employee views. Preserve the real actor, draft café and permission scope. Owner sees assigned cafés; terminals stay bound to their café. | Shared application shell, backed by the same authority checks. |
| Role and approval configuration | Role overrides, café assignments and delegation. | View/create/edit/approve/export/pay/restore permissions; amount limits where used; effective dates; substitute approver; revocation; explain denied actions; review effective permissions before granting them. | Primary Master administration and authorised delegation. |
| Dashboards | Revenue, margin, workforce, stock and executive cards. | Role-specific landing view; sales versus collections; source drill-down; time/café filters; provisional/closed labels; stale/pending-sync indicators; critical exceptions with an action owner. | All five windows, using different permitted data and tasks. |
| Charts and analytics | Sales, product, labour and food-cost reporting. | Named chart purpose, consistent calculations, comparison period, accessible data table, appropriate chart choices and filters. See chapter 14. | Dashboards and reporting, with scoped detail links. |
| POS and bills | Cart, modifiers, service type, split payments and receipts. | Hold/resume cart; sold-out handling; authorised discounts/complimentary reasons; failed/partial payment states; refunds linked to the sale; price/tax snapshot; receipt reprint; safe retries; visible offline queue. | Café Operations and authorised Master operators; Owner reads evidence and approves only where delegated. |
| Credit and institutional orders | Department orders, credit accounts and batch billing. | Quote/order reference where used; partial delivery; customer statement; due date; credit limit; invoice allocation; partial collections; disputes; collection follow-up; returns/credit notes. | Department orders, finance and tasks; scoped Owner oversight. |
| Cash, bank and daily close | Till reconciliation, drops, statements and passbook. | Named drawer/shift; float, paid-outs and cash count; variance explanation; signed handover; outstanding deposits; manual/CSV bank matching; daily close pack; controlled correction after close. | Café Operations records; authorised finance users reconcile; Owner/Primary Master review. |
| Inventory | Lots, FEFO, recipes, conversions, waste and counts. | Reliable stock ledger; reserved/unavailable stock where relevant; count cutoff; blind counts if useful; variance approval; transfers with dispatch/in-transit/receipt; packaging; recorded staff consumption; expiry/low-stock tasks. | Café Operations and Normal Master; Owner cost/exception oversight; Primary Master all. |
| Procurement and suppliers | Requisition, RFQ, PO, receiving, matching and AP. | Partial deliveries; rejected goods; returns/credit notes; price history in comparable units; due-date schedule; duplicate invoice checks; approved supplier bank-detail changes; approval-to-payment follow-through. | Operational purchasing plus authorised Owner/Primary Master approvals. |
| Expenses and budgets | Evidence, categories, budget lines and approvals. | Proposed/approved/posted/paid distinction; recurring commitments; petty cash; missing-receipt exception; shared-cost allocation; duplicate purchase-versus-expense check; budget versus actual. | Operational capture, delegated approval and finance. |
| Accounts and owner funds | GL, P&L, balance sheet, trial balance, treasury, drawings and revenue share. | Reconciled ledgers; opening balances; period close; customer/vendor aging; provisional versus final profit; dated cash forecast; own-account boundaries; transparent shared costs; linked reversals. | Primary Master and authorised finance users; scoped Owner views. |
| Employee lifecycle | Profiles, onboarding, wage structures and documents. | Joining/transfer/exit checklist; effective-dated role and café assignment; emergency contacts; document review/expiry; asset issue/return; bank-change request; timely access removal without deleting history. | Master people administration; scoped Owner review; Staff personal requests. |
| Attendance and scheduling | GPS/QR, rosters, day calendar, late flags, correction requests and overtime. | Draft/published schedules; overlaps and uncovered shifts; breaks; overnight/multiple shifts; raw versus corrected punches; exception review; approved overtime; payroll cutoff and locked history. See chapter 15. | Master/Café Operations manage assigned staff; Owner sees permitted oversight; Staff see and query own records. |
| Leave and availability | Leave balances, applications and decisions. | As-of opening/accrued/taken/pending balance; partial-day requests if used; holidays/week-offs; overlaps; cancellation; delegation; coverage impact; history; optional shift-swap request. | Staff submit; designated supervisors decide; Owner approval is a policy choice, not assumed. |
| Payroll and advances | Payroll runs, deductions, payslips, bank files and repayment schedules. | Approved attendance inputs; effective rules; arrears/adjustments; review differences; lock/post/payment states; duplicate-file protection; payment evidence; payslip queries; repayment reconciliation. | Primary Master or a specifically authorised payroll capability; restricted summaries and Staff self-service. |
| Customers, complaints and loyalty | Customer histories, points, complaints and recovery vouchers. | Anonymous sale support; duplicate review; contact preferences; consistent point reversals; complaint owner/due date; compensation approval and execution; repeat-customer definition and response counts. | Café Operations service; authorised Master management; Owner oversight; no unnecessary customer data in Staff views. |
| Menu and pricing | Categories, modifiers, café prices, taxes and recipe links. | Effective dates; local availability; approval/publication status; margin basis including relevant packaging/fees; preserve historical prices; optional popularity-versus-margin analysis. | Master configuration; delegated Owner decisions; local availability where granted. |
| Assets and existing quality controls | Equipment, service schedules, hygiene/temperature logs and incidents. | Breakdown ticket to repair/closure; warranty evidence; downtime; preventive maintenance; assigned corrective action and evidence; escalation of critical existing controls. | Café Operations capture; Master coordinate; Owner reviews cost and unresolved issues. |
| Training and manager communication | Announcements, SOPs, academy and tasks. | Versioned assignments; acknowledgment; completion review; shift handover notes; per-café issue log; due dates; escalation; restricted route for confidential HR concerns. | Master/authorised managers publish; Staff participate; Owner follows outcomes. |
| Approvals and notifications | Central inbox, delegation and notification outbox. | Evidence and café shown before deciding; approve/reject/request correction; overdue items; duplicate-action protection; notification deduplication; delivery/read/action states kept distinct. | Role-scoped shared workflow, surfaced in each relevant window. |
| Reports and exports | Fourteen claimed reports, PDF/Excel/CSV capabilities. | Published report catalogue, definitions, saved filters, allowed columns, comparable periods, drill-down, reconciliation, safe exports and report packs. See chapter 16. | Shared reporting with field- and café-level restrictions. |
| Settings and account usability | Sixteen settings sections plus overview. | Consistent personal/business setting boundaries; readable themes; local languages; keyboard use; help; per-user favourites; search; safe imports; clear error and unsaved-change states. | Shared shell and scoped settings. |
| Continuity and system administration | Devices, system health, backups, updates and Trash. | Recoverable queues; last successful sync; quota and failed-job status; real restore evidence; safe updates; protected history; controlled purge; incident ownership and fallback instructions. | Primary Master technical control; practical status for Owner/operations; Staff see only relevant service notices. |

**Recommended dashboard emphasis by window**

| Window | Default information and actions |
|---|---|
| Primary Master | Organisation-wide café comparison, major exceptions, permission/delegation review, recovery/health status and all authorised operational drill-downs. Explicit workspace/café/employee supervision selectors. |
| Normal Master | Assigned/authorised operational sales, stock, procurement, attendance, cash variances and tasks. Hide restricted salaries, treasury, drawings and revenue share according to the settled policy. |
| Owner | Assigned café earnings and cash explanation, receivables/payables, decisions, daily close review and operational exceptions with evidence. |
| Café Operations | Current café/operator/shift, POS and pending orders, local stock alerts, clocked-in staff, requests, cash drawer and sync status. |
| Employee/Staff | Own current/next shift, attendance state, leave balance, request status, announcements, training and latest authorised payslip. |

## 14. Charts, metrics and calculation definitions

### Chart catalogue and behaviour

The chart types below are recommendations for the question being answered. They are not a claim that these charts are absent, nor a requirement to put every chart on the home page. Use a small useful default set per role, with the rest in reports.

| Proposed view | Preferred presentation | Decision supported | Data/interpretation requirement |
|---|---|---|---|
| Sales over time | Line or columns; daily/weekly/monthly grouping. | Identify change and compare equivalent periods. | Define gross/net sales and refund treatment; identify closed days and incomplete periods. |
| Sales versus collections | Two labelled series with a supporting table. | Explain why revenue and money received differ. | Old-credit collections must not become new sales; show currency and business-date basis. |
| Café comparison | Ranked horizontal bars with a table; switch between comparable metrics. | Identify a café needing attention. | Keep amount and percentage comparisons distinct; apply the same cost basis and show missing data. |
| Profit explanation | Waterfall from revenue through named costs. | See what reduced profit. | Reconcile to the selected P&L basis; label unclosed inputs and shared allocations. |
| Demand by day and hour | Day/hour heatmap with accessible table. | Plan opening hours and shift coverage. | Use actual orders/items/covers captured. Do not rename order count as footfall. |
| Product performance | Ranked bars for quantity, revenue or contribution; optional popularity-margin scatter. | Review pricing, availability and promotions. | Define contribution costs and minimum data; avoid calling ingredient margin net profit. |
| Payment-method mix | Stacked bars and amounts by period. | Understand tender mix and reconciliation workload. | Separate tender, verification and bank settlement. A small non-negative categorical snapshot can optionally use a doughnut. |
| Customer and supplier aging | Separate bar views by age bucket with records beneath. | Prioritise collections and upcoming payments. | Age against defined due dates; separate not-yet-due, disputed and partially settled items. |
| Cash outlook | Actual balance line followed by a clearly distinct projected segment. | See a possible payment shortfall. | Date assumptions and expected receipts/payments; no guaranteed future balance. |
| Stock-use differences and waste | Ranked variance/waste-cost bars, with reasons. | Investigate stock loss or data problems. | Separate expected use, counted use and already recorded movements; avoid double-counting waste. |
| Supplier price history | Line by product and comparable purchasing unit. | Understand purchase cost increases. | Normalise pack size, quality/specification and included charges before comparing. |
| Attendance status | Employee calendar for self; labelled team grid for authorised managers. | Identify missing records and coverage issues. | Distinguish leave, week-off, holiday, absence and pending review; use text/icons as well as colour. |
| Scheduled versus worked hours | Grouped bars by day/café; optional shift timeline. | Review staffing demand and variance. | Retain actual hours and approved/payable hours separately; do not hide breaks or overnight work. |
| Overtime trend | Bars/line with approved, pending and corrected hours separated. | Review recurring extra-hours needs. | Approval is not a substitute for legal/payroll policy; incomplete punches are flagged. |
| Labour/payroll cost | Stacked cost components by café/period, with a detailed table. | Understand workforce cost and shared staff allocation. | Include agreed employer-cost components; deductions are not extra employer cost; reconcile allocation once. |
| Budget versus actual | Grouped bars or variance table by category. | Prioritise spending review. | Distinguish commitments, posted expenses and cash payments; preserve approved budget versions. |
| Customer complaint outcomes | Count and resolution-time trends; category bars. | Identify repeat service problems. | Include sample count, unresolved cases and time-period definition; avoid misleading scores from tiny samples. |
| Equipment downtime | Ranked bars by asset/café with incident links. | Prioritise repairs or replacement review. | Use recorded incident start/end and mark incomplete history; estimates are labelled. |

Common chart controls should include café scope, period, comparison period, relevant grouping, units, legend, reset filters, table view and authorised export. Only offer chart-type alternatives that suit the data. Changing a chart to an unsuitable pie or stacking unrelated amounts and percentages does not improve analysis.

Each point/bar should open the supporting authorised records with the same filters. The chart, table, dashboard card and export should reconcile to the same definition and data snapshot. A percentage change from a zero base should show an explicit unavailable/new-activity state. Missing values should not silently become zero. Forecasts and provisional costs must be visibly distinguishable from recorded results.

Do not use 3D effects or misleading bar baselines. Keep labels readable in the supported themes and give keyboard users a path to the same records. Provide a short chart summary and a meaningful text/table alternative, following the principles in [W3C's guidance for complex images](https://www.w3.org/WAI/tutorials/images/complex/). That source supports accessible equivalents, not the particular business chart choices above.

Shared filters and chart-to-record investigation are established analytics patterns: see [Metabase dashboard filters](https://www.metabase.com/docs/latest/dashboards/filters) and [drill-through documentation](https://www.metabase.com/docs/latest/questions/visualizations/drill-through). These are design references; the proposed views can be built in the existing app without adding Metabase or a paid BI service.

### Financial and operating metric definitions

The purpose of this section is to specify trustworthy application displays, not to prescribe tax rules or produce certified financial statements. Use the business's approved accounting policies and independently validate them.

| Figure | Display rule |
|---|---|
| Sales versus collections | A newly issued credit sale and collection of an earlier debt are separate events. Reports must not count the later collection as new revenue. |
| Purchases versus goods cost | Purchases are not automatically the cost consumed in the period. Use a consistent stock valuation and opening/closing inventory basis, including appropriate transfers, returns and classifications. |
| Item contribution | State which variable costs are included. A sales price less ingredient cost is not café net profit. Packaging, relevant channel fees and discounts may materially change an item's contribution. |
| Labour cost | Explain inclusion of wages, allocated salaried staff, overtime and applicable employer costs. Mark current-period estimates and reconcile to payroll. Do not count the same salary through both payroll and a manual expense entry. |
| Prime cost | If shown, define it as goods cost plus labour cost using the agreed components and period. Show the sales denominator and configured target. Do not hard-code an industry percentage as universally correct. |
| Cash forecast | Opening available funds plus expected receipts minus expected payments, with dates and assumptions. Keep unpaid receivables, bank balance and projected funds separate. |
| Shared expenses | State allocation method, effective period and amount by café. Preserve pre-allocation and post-allocation views where useful, and allocate each cost only once. |
| Consolidation | Avoid counting an internal transfer as external group revenue/expense. Do not sum the same shared bank account once for each café. Respect legal-entity and owner boundaries. |
| Performance comparisons | Compare the same accounting basis and period. Label closed days, incomplete feeds, new cafés and missing stock counts. Do not substitute zero for missing data. |
| People and customer counts | Bill counts, covers, identified customers and physical footfall are different measures. Display only what the app actually captures. |

[MarginEdge's cost-report guidance distinguishes purchases from COGS and explains the role of stock counts](https://help.marginedge.com/hc/en-us/articles/360057328094-Understanding-Your-Costs-with-the-Reports-in-MarginEdge). That supports the need for clear cost definitions here; the exact Zamorin valuation and allocation policy remains to be verified.

For usage variance, show the sales-based expectation alongside actual counted usage, then separately explain recorded waste, staff consumption and transfers. Missing recipe mappings or counts should reduce confidence rather than create an accusation. [MarginEdge's theoretical-usage documentation provides an example of comparing expected use with inventory-based observations](https://help.marginedge.com/hc/en-us/articles/360015329433-Getting-Started-with-Theoretical-Usage-Reporting). This is inventory and cost oversight within the existing app, without a KDS requirement.

## 15. Attendance, selfie evidence, leave and payroll handoff

### Attendance, leave and payroll connection — detailed requirements

The app already documents clocking, calendars, rosters, corrections and leave. Verify the following complete lifecycle before treating attendance as a reliable payroll input. Do not infer that every employee should be absent merely because a punch has not synchronised.

| Part of the workflow | Options and rules to verify or complete |
|---|---|
| Employee assignment | Home café, permitted temporary assignments, employment dates, role/skills where used and effective transfer dates. Keep historical attendance attached to the original café/assignment. |
| Shift templates | Start/end, paid/unpaid breaks, planned duration, applicable café and effective date. Support actual split/overnight patterns only where used. |
| Roster planning | Day/week view, reusable templates, named employee or unfilled shift, leave/availability visibility and overlap detection across cafés. |
| Roster publishing | Draft versus published state, preview of changed shifts, permitted publisher, notification and change history. Staff see the published version and relevant subsequent changes. |
| Coverage checks | Unfilled roles/shifts, overlapping assignments and configured rest/availability conflicts. Never resolve a shortage by silently cancelling approved leave. |
| Clock-in/out | Clear accepted/rejected/pending-sync result; correct employee, café, device and event time. Repeated scans/clicks must not create duplicate intervals. |
| GPS/QR failures | Explain denied device permission, unavailable GPS, failed geofence and expired QR separately. Provide a controlled correction/exception request. A GPS failure is not automatic proof of absence or misconduct. |
| Privacy | Collect the location evidence needed for a clock event; continuous employee tracking is not required for this workflow. Restrict raw location and identity data to authorised people. |
| Breaks | Start/end, paid/unpaid classification, missing-break exception and approved correction. Do not silently invent a break or erase recorded time to make totals match. |
| Overnight and multiple shifts | Preserve actual timestamps, assigned shift and applicable timezone. Handle midnight, month-end, two shifts and movement between cafés without double-counting hours. |
| Attendance status | Scheduled, worked, absent after review, leave, holiday, week-off and pending exception are distinguishable. Half-day and partial leave follow a defined policy. Status and hours must agree. |
| Late/early events | Show scheduled and actual times plus the effective grace/rounding policy. Retain raw events even if payable time is rounded. An exception flag does not itself determine a deduction. |
| Missed punch correction | Employee submits proposed time, reason and evidence if appropriate; authorised supervisor approves/rejects; original and revised values, actor and decision remain visible. |
| Offline events | Store captured time and server-received time separately; flag suspicious clock differences for review. Preserve rejected or expired-session records for authorised recovery. |
| Overtime | Distinguish recorded extra hours, requested/approved overtime and the payroll treatment determined by applicable rules. Resolve unapproved-work cases through review, not deletion of actual hours. |
| Leave balances | Opening balance, accrual, adjustments, used leave, pending requests and available balance as of a date. Define whether pending requests reserve balance and avoid deducting the same leave twice. |
| Leave changes | Overlap checks, partial-day support where needed, cancellation/withdrawal, approver delegation, holiday/week-off treatment and visible impact on the published roster. |
| Employee review | Personal daily/monthly timesheet, correction status, approved leave and an understandable explanation of hours/payroll inputs. Provide a query route for discrepancies. |
| Supervisor review | Exception queue; original evidence; scheduled/actual/approved hour comparison; reasoned approval; bulk actions only with clear selected scope and per-record outcomes. |
| Cutoff and locking | Mark the attendance period ready for payroll, preserve an approved snapshot and lock inputs used in a posted run. Later corrections create visible adjustments under the chosen policy. |
| Payroll handoff | Trace paid hours, leave, overtime and loss-of-pay inputs to their approved sources. Compare the current run with the prior period and reconcile advances and actual payouts. |
| Attendance reporting | Daily register, monthly calendar, scheduled-versus-worked hours, corrections, leave balance/movements, overtime and unresolved exceptions. Scope team reports; Staff see only their own records. |

Published schedules and scoped publishing authority are supported by an established workflow in [7shifts' schedule publication guide](https://kb.7shifts.com/hc/en-us/articles/4417514210067-How-to-publish-a-schedule). The detailed Zamorin rules above are proposals, not a claim that this source specifies Indian attendance/payroll law or every listed edge case.

Where employees serve multiple cafés, their labour cost should be allocated once using an approved, effective-dated basis. Keep the historical basis. [7shifts documents percentage salary allocation across assigned locations and an audit history](https://kb.7shifts.com/hc/en-us/articles/52649365106579-Allocating-salaried-employee-wages-across-multiple-restaurant-locations); Zamorin can instead use another approved basis where suitable. Changes in location assignment should trigger review rather than silently rewrite closed payroll costs.

Configure actual employment and payroll rules after independent applicability review. This section does not prescribe universal overtime rates, leave entitlements, statutory contribution rates or automatic late-punch penalties. New biometric hardware, facial recognition, continuous location tracking and paid attendance integrations are not prerequisites.

### GPS/selfie attendance and the daily calendar

I interpret “geo self” as **GPS-verified selfie attendance**, because the request also requires daily stored images. This is an implementation assumption to confirm against the actual attendance code; the documentation establishes geofencing and QR attendance but does not establish the complete requested selfie/calendar flow.

| Stage | Required behaviour |
|---|---|
| Start | Resolve the active employee, enrolled device where required, assigned café, permitted shift and current access state. Issue a fresh attendance challenge where the workflow uses one. |
| Permission | Request camera and location for the attendance action. Explain denied permission, unavailable camera, poor location accuracy and timeout separately. Provide retry and a traceable supervisor-correction request; do not silently convert technical failure into absence. |
| Location | Check position age, reported accuracy and the café's configured boundary. Evaluate uncertain boundary readings explicitly. A latitude/longitude supplied by a client is not proof against spoofing. Collect location for the attendance action, not continuous employee tracking. |
| Capture | Capture a fresh image for the attendance event, compress to a tested useful resolution, validate type/content and bind it to the employee and event. Do not treat a camera capture alone as biometric identity verification. Face recognition is not a prerequisite. |
| Save | Store an immutable event ID, organisation/café/employee, action, shift/business date, capture time, server receipt time, location/accuracy, verification state and private image reference. Prevent duplicate punches with a durable idempotency key. Final acceptance requires the mandatory evidence to be saved and validated. |
| Partial failure | If the image upload or database write fails, keep a clear pending/retry state. An uploaded orphan image must not count as attendance; clean it up safely. A saved event awaiting mandatory evidence must not appear fully verified or feed final payroll as approved time. |
| Daily calendar | Opening a date shows that employee's permitted check-in/out events, image thumbnails, times, café, verification status and correction history. Support more than one shift or event per day. Open the full image through an authorised request. Display missing, retained and expired evidence honestly. |
| Permissions | Staff view their own evidence. Managers and owners view only evidence expressly permitted for their assigned cafés; summary/report access alone does not imply photo access. Primary Master can supervise within its organisation with an audit trail. |
| Retention | Define a business-appropriate retention period and private archive policy. Keep evidence available for the required review period, control exports and record deletion after expiry. Never promise unlimited photo storage on a limited free database. |

**Documented conflict to inspect first:** the references show `Permissions-Policy: camera=(), microphone=(), geolocation=()` while also requiring attendance scanning and location. If the frontend HTML receives those directives, JavaScript cannot override the denial. In a hash-routed single-page application, changing `#attendance` does not deliver a new document header. Configure the actual frontend response and any native WebView permission bridge correctly, allow only required sensors/origins, and keep permission requests tied to the attendance action. Browser geolocation requires a secure context and user permission; the own-server deployment must preserve this. [MDN Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API).

Storage must be sized before enabling permanent daily images. For illustration only, **100 employees × 2 images/day × 200 KB = about 40 MB/day, or 1.2 GB per 30 days**, before replication, backups and other records. This exceeds the documented 0.5 GB Atlas free database capacity when stored in the same GridFS database. Actual employee counts, attendance frequency and image size must determine the plan. Use private persistent storage on the future server, or another verified storage allocation, through the existing attachment abstraction; do not use a temporary application-container filesystem. See [Atlas free-cluster limitations](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/).

## 16. Report catalogue, PDF, exports and reporting routines

### Report catalogue the business should be able to use

These are coverage families that may contain several tabs or saved views. Reuse the existing 14 reports where they already satisfy a family. There is no requirement to build a separate reporting page for every row.

| Report family | Minimum useful views or contents | Main permitted audience |
|---|---|---|
| Daily business and close pack | Sales, collections, cash count, variance, deposits, credit movement, pending sync and manager explanations. | Primary Master, operational Master, assigned Owner and local Café Operations. |
| Sales and bill detail | Café/item/category/service type, quantities, gross/net amounts, discounts, refunds, original bills and relevant tax breakdown. | Authorised Master, Owner and local operations. |
| Tender and bank reconciliation | Cash/electronic tenders, manual verification, settlement status, fees where captured and unmatched deposits/receipts. | Permitted cash/finance users; Owner only authorised accounts. |
| Discounts, refunds and complimentary items | Original sale, reason, requester/approver, amount, executed payout and stock treatment where relevant. | Authorised operational and financial reviewers. |
| Customer credit and collections | Invoice/customer aging, due dates, partial payments, credit notes, allocation, disputes and follow-up. | Permitted finance/credit users and assigned Owner. |
| Supplier payables | Bill/receipt/PO links, due date, disputed amount, credit notes, partial payment and confirmation. | Permitted purchasing/finance users and assigned Owner. |
| Inventory and movement | On-hand/available/expired stock, value basis, receipts, transfers, returns, recorded waste and count differences. | Operational users within scope; Owner oversight. |
| Purchasing and supplier performance | Ordered/received/rejected quantities, price variance, matching exceptions, delivery performance and comparable unit costs. | Operational Master and authorised Owner/Primary Master. |
| Expenses and budgets | Category/café/payee, evidence, approval/payment state, shared allocation and approved budget variance. | Permitted operational/financial users. |
| Attendance and time | Scheduled versus actual/approved hours, monthly register, breaks, late/early flags, corrections and outstanding exceptions. | Permitted managers and Owner oversight; Staff own records only. |
| Leave and overtime | Balance movements, approvals/cancellations, coverage effect, extra hours and approved payroll treatment. | Designated supervisors/payroll users; Staff own records only. |
| Payroll and advances | Gross-to-net detail where authorised, employer costs, changes, arrears, loan deductions, payslip publication and payout status. | Primary Master/designated payroll; permitted Owner summary; Staff own payslip and advance ledger. |
| Accounts and cash planning | P&L, balance sheet, trial balance, source journals, historical cash movement, commitments and clearly labelled forecast. | Authorised finance and assigned Owner; restricted treasury/personal records remain separate. |
| Menu and contribution | Popularity, selling price history, ingredient/packaging basis, discounts, channel costs if captured and contribution. | Authorised pricing/Owner/Master roles. |
| Assets and maintenance | Register, location, service due, breakdowns, downtime, repairs and approved replacement spend. | Operational maintenance users and authorised management. |
| Existing quality and renewal obligations | Open incidents, corrective actions, relevant inspections, licence/lease/insurance dates and closure evidence. | Designated operational and management users. |
| Customer service and loyalty | Complaint status/age, compensation, repeat patterns, points movements and defined customer cohorts. | Authorised customer-service and management roles. |
| Approval, audit and data health | Pending/overdue decisions, actors and outcomes, data-quality exceptions, failed sync/jobs and permission-relevant audit records. | Strictly scoped managers/administrators; personal request history for Staff. |

Every report needs a stable name/ID, a definition, source records, allowed roles/fields, permitted café scope, filters and date basis. Include a generated/as-of time, record count, totals and provisional/closed state. Publish the formulas behind ratios. Keep the dashboard and export on the same basis.

Useful controls include search, sort, column selection, grouping, saved presets, comparison period, reset filters, accessible table view, supported downloads and a print preview. A limited report builder over approved fields is optional; the default named reports should already answer ordinary business questions.

Build daily, weekly and monthly report packs from these views. Start with in-app access and manual PDF/Excel/CSV downloads; add scheduled delivery only when the chosen deployment and delivery channel are dependable. Recheck recipient permissions when generating a scheduled report, not only when the schedule was created.

Do not impose academic APA formatting on all operational reports. Business reports need clear titles, café/date filters, currency, definitions, page numbers and readable tables. Payslips, invoices, management summaries and receipt paper have different layout needs.

Clear cost definitions matter: [MarginEdge distinguishes purchasing reports from inventory-informed cost reporting](https://help.marginedge.com/hc/en-us/articles/360057328094-Understanding-Your-Costs-with-the-Reports-in-MarginEdge). This supports documenting the basis of the P&L and food-cost reports; it is not evidence that Zamorin's calculations have been validated.

### Business categories, report packs and daily routine

Retain the following seven business categories for requirement organisation and report packs only. The earlier suggestion to regroup the actual menus is superseded by the no-UI/UX-change instruction; keep the current navigation:

| Business category — not a navigation change | Contents |
|---|---|
| Overview | Today, café comparison, exceptions and daily close status. |
| Money | Sales/bills, profit, customer dues, supplier dues, cash/bank, expenses, budgets and own capital/revenue share. |
| Operations | Stock oversight, suppliers, equipment, utilities and existing quality incidents. |
| People | Staff/shift oversight, payroll summaries, advances, training and manager follow-up. |
| Customers | Complaints, service recovery and loyalty. |
| Decisions | Approvals, assigned actions and delegation. |
| Reports and governance | Exports, licences/leases/insurance, risk/audit, master data, privacy, continuity and relevant settings. |

These categories preserve the earlier business coverage; they do not authorise seven new menu groups, a new workspace or a new layout.

Recommended report packs:

- **Daily:** sales and collections by café; closing cash/deposit exceptions; newly overdue customer invoices; urgent approvals; staffing/operational incidents; pending-sync status.
- **Weekly:** customer collection progress; supplier payments due; cash outlook; labour hours/cost; stock-use differences; complaints and manager action completion.
- **Monthly:** closed-period café P&L and shared-cost allocation; budget variance; payroll/payment reconciliation; supplier balances; own capital/drawings/revenue-share statement; asset and renewal commitments.

Let the Owner select café, date range, comparison period, reporting basis and authorised export format. Each pack should identify missing/unclosed inputs. In-app reports and manual downloads are sufficient initially; automated email is useful only after delivery is reliable within the selected free setup.

## 17. QR types, sizing, expiry and replay prevention

### QR behaviour, expiry and placement

Classify QR codes by purpose before changing them. Café links, rotating attendance challenges, payment instructions and report verification codes have different security and expiry rules.

| QR purpose | Required behaviour |
|---|---|
| Rotating attendance or access challenge | Server-issued, purpose-bound and scoped to the organisation/café and device/session where applicable. Validate signature or opaque-token lookup, expiry, challenge status, employee access and the permitted action on the server. Reject at `server time >= expiresAt`. A screenshot of an expired QR must fail even if the client clock is changed or an old QR is still visible. |
| Shared rotating attendance display | Permit different authorised employees to use the live display while preventing duplicate use for the same employee/action. Do not consume the whole shared QR on the first employee's scan. A personal login/recovery challenge can instead be globally single-use. |
| Refresh and connectivity failure | Stop offering an expired QR as usable. Show the existing styled expired/reconnecting state if a replacement cannot be fetched. Do not extend expiry locally. For the strict expiry requirement, an expired challenge cannot become valid simply because its request was queued offline. |
| Café entry/deep link | Resolve the intended café securely. The QR establishes context; it must not grant administrative access or bypass login, current account status or terminal enrolment. Revoke/reissue the link when its intended access changes. |
| Payment QR | Encode the correct payee, amount/reference where applicable and supported payment format. Scanning or displaying a successful payment-app screen does not itself establish settlement; reconcile through the chosen verification process. |
| PDF/report verification QR | Use a compact identifier or verification link, not personal/payroll data embedded in the code. Restrict any detailed report access. A report-verification QR need not rotate unless explicitly designed to expire; an expired verification link needs a clear result. |

Use server time and synchronised servers for challenge expiry. Avoid an undocumented grace period that keeps the previous code alive. If several backends serve requests, they must share the same challenge/revocation state. Treat screenshots of a still-valid shared QR as a remaining relay risk; GPS, authenticated identity and fresh evidence reduce risk but do not establish perfect anti-spoofing.

Suggested **starting sizes for testing**, not universal standards: approximately 192–256 CSS pixels for a close-range app QR and 25–30 mm overall for a compact PDF QR. Increase these for longer payloads, poorer cameras or greater scan distance. Keep the QR square, sharply rendered, dark on a plain light background and surrounded by an unobstructed quiet zone. Prefer vector rendering for PDFs, avoid decorative overlays, and test the actual printed export at its final scale. DENSO specifies a quiet zone of four modules on every side; physical size depends on module size and encoded content. [DENSO WAVE QR sizing guidance](https://www.qrcode.com/en/howto/code.html).

## 18. Transaction integrity, offline data, audit and attachments

### Transaction, security and recovery behaviour to make explicit

These are design acceptance requirements. Where the underlying code already implements them, retain it and attach passing evidence rather than rebuilding it.

**Sales and money**

- Recalculate prices, tax, discounts and permissible tenders on the server using the applicable version. Never trust a client-submitted grand total.
- Use integer minor units or an appropriate decimal representation and a written rounding policy. Reconcile line totals, tax components, invoice totals and split tenders. Document when rounding occurs and where the difference posts.
- Record invoice issuance, sale recognition, money collection, credit allocation and payment settlement as distinguishable events. Partial customer payments and later collections need traceable allocation.
- Scope idempotency to organisation, operation and original transaction identity; identical replay returns the prior result, while a reused key with different data is rejected. Client double-click protection alone is insufficient.
- Generate unique invoice identifiers per configured legal/fiscal series and handle concurrent tills. For offline operation, decide between approved preallocated numbering and a clearly labelled provisional receipt process, with appropriate tax review before use.
- Use linked reversals and credit notes for posted records. Never repair a financial discrepancy by quietly editing historical totals.

**Stock and purchasing**

- Distinguish reservation, consumption, preparation, transfer, waste, receipt and return movements. Associate them with source records and ensure retries do not apply them twice.
- A refund of prepared food does not automatically mean its raw ingredients can be returned to saleable stock. Require a documented business rule.
- For two cashiers selling the last available stock, test concurrency and a defined negative-stock/oversell policy. FEFO selection should exclude expired/quarantined lots.
- An inter-café transfer has two accountable sides: dispatch to in-transit, then receipt. A discrepancy must remain visible until resolved.
- Prevent the same vendor invoice being posted both as a purchase payable and an expense. Use supplier identifiers, invoice number/date and appropriate duplicate checks.

**People and authority**

- Separate statutory wage definitions from display labels such as Basic, Gross and CTC. Configure effective dates, applicable rules, wage bases, ceilings and rounding. Confirm current requirements independently; the supplied percentages cannot serve as a complete compliance specification.
- Freeze the reviewed inputs to a payroll run. Corrections after posting produce a linked adjustment or next-period arrears, with a clear payslip revision policy.
- Keep original attendance events and authorised corrections. Store event time, received time and correction time separately; offline clocks can be wrong.
- Enforce the organisation and resource scope in every detail endpoint, aggregation, export, attachment, background job and notification. Include tests against a second organisation, not just a second café.
- Authentication guards must apply to direct API calls. User-controlled query/body values cannot establish organisation, primary status, employee ownership or allowed café lists.
- Review role changes, user status and session revocation on sensitive actions. Protect the last recoverable Primary Master and provide a tested succession/recovery procedure.

**Offline and devices**

- Queued entries need stable IDs, original actor/device/café, payload version, captured timestamp, retry count and server acknowledgment. Keep queued, syncing, synced and needs-review states visible.
- Retry transient failures with backoff; route validation or scope failures to review. Do not silently drop a rejected transaction or move it into the current café.
- On reconnect, reevaluate expired sessions, revoked staff and changed café assignments. Retain records that need supervisor recovery instead of silently discarding them.
- Limit what can be done offline. New privilege grants, bank-detail changes, payroll posting and sensitive approvals should require online verification. Define the bounded offline operating allowance for an already enrolled till.
- Service-worker installation, cache clearing, browser shutdown and logout need explicit queue-preservation tests. Browser storage is not a substitute for a server backup and may be evicted or cleared.
- Where supported, request persistent browser storage, inspect whether it was granted and handle quota/write failures explicitly. Never display a locally completed sale until its durable queue write succeeds. Persistence reduces browser-initiated eviction risk; it cannot prevent a user from clearing browser data or recover a lost device. These limits follow from [MDN's storage persistence and eviction guidance](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).
- Auto-lock should protect the screen without deleting a cart. Operator handover should not let the next operator invisibly inherit ownership of someone else's transaction.

**Attachments, audit and recovery**

- Separate document scanning health from core service liveness where possible. Scanner failure should hold or block attachment operations and alert the administrator without necessarily taking down unrelated POS reads/writes.
- Store audit entries transactionally with material business changes or through a reliable durable mechanism. Protect sensitive field values; do not copy passwords, tokens, recovery codes or full unnecessary KYC data into audit deltas.
- Application-level append-only logging is valuable, but it is not the same as tamper-proof storage against a database administrator. For stronger assurance, consider signed/hash-linked audit exports with separately stored checkpoints.
- Backup all necessary collections, GridFS bytes/metadata, schema version and relevant configuration; separately protect encryption/signing keys needed for recovery. Limit secret access and keep keys outside public exports.
- Establish a consistent backup point. For a free database plan without oplog-assisted backup, use a controlled write pause/maintenance procedure or another verified consistency mechanism. Account for offline queues that have not reached the server.
- Restore to an isolated environment before declaring success. Verify relationships, sample attachments, bill totals, receivables, stock balances and payroll. Measure recoverable data age and elapsed recovery time, then show those values in BCDR.

## 19. Security, performance, accessibility and maintenance

### Usability, performance and maintenance

The references describe visual styling, but do not include actual rendered screens. I cannot fairly judge spacing, contrast, mobile layout or ease of use from prose alone. These are the appropriate visual acceptance targets:

| Area | Target |
|---|---|
| Navigation | Preserve the existing shell/navigation and verify active café, back behaviour, search/favourites and required workspace switching through current components. Do not add or rearrange navigation solely as a redesign. |
| POS | Large readable touch targets, keyboard flow, fast item search, visible cart/tender totals and a persistent pending-sync indicator. Avoid decorative animation that competes with checkout. |
| Owner | Make exceptions, decisions, definitions and freshness accessible within the current Owner design. Preserve the existing arrangement and visibility of modules; no new collapsing/reordering is required. |
| Staff | Few steps to clock, see roster, request leave, read payslip and obtain help. Usable on smaller phones and limited networks. |
| Tables | Useful defaults, server pagination, clear filters, reset filters, amount alignment, scoped totals and empty/error/loading states. |
| Forms | Consistent labels, inline errors, safe date defaults, unsaved-change handling and clear submission outcomes. |
| Accessibility | Full keyboard paths, logical focus, screen-reader labels, sufficient contrast, reduced motion and usable text scaling. Test rather than inferring quality from theme names. |
| Language | Verify advertised Malayalam, Hindi, Tamil and English translations with actual users; long labels and printed fonts need testing. |
| Connectivity | Differentiate offline, expired session, denied access, warming server, failed save and empty data. Do not show misleading success or fabricated fallback records. |
| Support | An issue reference and concise next action; no stack traces or infrastructure configuration exposed to ordinary staff. |

Retain the modular monolith. Lazy-load routes where useful, bound queries and export sizes, reuse database connections and add indexes based on actual query plans. For high-volume records, consider the organisation/café/date index shape described in the references, but measure storage and write costs before adding overlapping indexes everywhere.

Background jobs need durable ownership/leases and idempotent completion. An in-memory cache can be disposable; invoice counters, deduplication records, lockouts, job completion and financial state must not depend on it surviving a restart. Free Redis/in-memory fallback should not be treated as the source of truth for such controls.

Avoid unbounded polling of every dashboard. Fetch what the current view needs, back off hidden tabs and distinguish real-time delivery from periodic refresh. Generate executive summaries from bounded queries or carefully maintained summaries reconciled to source transactions.

Maintain a release record with commit, schema version, frontend asset version and migration steps. Keep schema changes backward-compatible through rollout where possible; an application rollback alone may not reverse a database migration. Use redacted configuration inventories and a dependency lockfile, and review vulnerabilities against the actual installed versions.

Triage the 561 TODO/FIXME tags by executable risk and user impact. Their count alone neither proves incompleteness nor proves harmlessness. Prioritise live-path transaction and access issues; do not spend the release cycle deleting harmless comments.

### Performance and security acceptance targets

Use measured targets instead of “no delay anywhere.” Proposed browser targets are LCP at most 2.5 seconds, INP at most 200 ms and CLS at most 0.1 at the 75th percentile, segmented by mobile/desktop. These are current [Core Web Vitals thresholds](https://web.dev/articles/vitals), not results measured for Zamorin. A separate proposed target is visible acknowledgement within about 100 ms for ordinary button interactions. Define and measure login/API completion targets against representative devices, network conditions, data volumes and concurrent café use; biometric, GPS, network and mail-delivery time cannot be guaranteed to be instantaneous.

Measure fresh and cached login, background-image loading, café switching, sales searches, attendance/photo save and report generation. Use pagination, indexed scoped queries, bounded requests and background report jobs where needed. Load large modules and images when needed without delaying the login controls. Check long-session memory use and low-end Android devices. Keep server-side permissions and truthful save states intact while optimising.

Prioritise security already relevant to this application: privileged-account MFA and recovery, least-privilege authorisation on every API, secure session cookies, CSRF protection where needed, login/reset rate limits, private uploads, input validation, output encoding, HTTPS, appropriately scoped browser headers, restricted database networking, secret redaction and audit trails. Scan and patch dependencies and native bridges. Rate-limit/revocation protection must remain consistent across application instances and restarts. A cache failure must not silently remove security checks. These requirements do not need a paid “security system” subscription; they do require verification of the actual deployment and code.

## 20. Free deployment, capacity and platform constraints

### A realistic plan for no paid subscriptions

Free software, free hosting allowances and a dependable business service are different things. Your application can avoid subscription features, but the documented cloud architecture does not establish an unlimited, continuously available service at zero cost. The following provider facts were checked against official pages on the review date.

| Component | Verified constraint | Practical implication for Zamorin |
|---|---|---|
| Vercel Hobby | Restricted to personal, non-commercial use. [Vercel Hobby documentation](https://vercel.com/docs/plans/hobby). | An ERP used to run a commercial café should not base its production plan on Hobby, even if the ERP is not sold to others. |
| Render Free | Sleeps after 15 idle minutes; restart takes about a minute; 750 monthly instance hours are shared by a workspace. Filesystem changes are ephemeral. SMTP ports 25/465/587 are blocked. Render advises against production use. [Render Free documentation](https://render.com/docs/free). | Treat it as a test/pilot environment. Recovery email, persistent uploads and scheduled work need the changes described in this report. A login warmup request cannot guarantee instant availability. |
| Atlas Free, formerly M0 | 0.5 GB includes uncompressed documents and indexes; 500 collections and 500 connections maximum; no managed backups. Database-tool backups are possible, but `mongodump --oplog` is unsupported. [Atlas Free limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/). | Measure capacity and implement consistent independent backups. GridFS shares the allowance. Do not assume compression increases the plan's logical storage capacity. |
| Cloudflare Pages | Static asset requests are free and unlimited; Functions share the Workers Free allowance of 100,000 requests/day. The Free Pages build allowance is 500/month. [Pages pricing](https://developers.cloudflare.com/pages/functions/pricing/), [Pages limits](https://developers.cloudflare.com/pages/platform/limits/). | A candidate for the static frontend. A same-origin API proxy requires an appropriate Function/Worker and uses its quota. Static hosting alone does not replace Express, MongoDB, scheduled workers or ClamAV. |
| ClamAV | Its Docker guidance recommends at least 3 GiB RAM, preferably 4 GiB. [ClamAV resource guidance](https://docs.clamav.net/manual/Installing/Docker.html). | Identify where the scanner actually runs. Do not assume a small free app instance can also run the normal signature-loaded scanner. An existing adequately sized computer is an option. |
| Gmail API | Google documents sending through its HTTPS API and applies usage quotas. [Sending guide](https://developers.google.com/workspace/gmail/api/guides/sending), [API quotas](https://developers.google.com/workspace/gmail/api/reference/quota). | Evaluate an adapter for an existing authorised account, subject to account sending limits and OAuth setup. It is separate from the currently described SMTP adapter and requires a real delivery test. |
| Node runtime | Node 20 is now EOL; Node 24 is listed as LTS. [Node release status](https://nodejs.org/en/about/previous-releases). | Replace a deployed Node 20 image with supported LTS after dependency checks. “20+” in documentation is not a pinned safe runtime. |
| Apple distribution | The ordinary Apple Developer Program costs USD 99/year, with limited waiver eligibility. [Apple enrollment](https://developer.apple.com/programs/enroll/). | Prefer browser/PWA access for a no-subscription launch. An iOS wrapper project does not establish free App Store distribution. |

**Choose between these deployment options:**

| Option | Setup | Benefits | Limitations and my recommendation |
|---|---|---|---|
| A. Free cloud pilot | One Express service serving the existing static frontend and API on the same HTTPS origin; Atlas Free for a deliberately small dataset. | Few architectural changes and simpler cookie routing. Provider subdomain can avoid a new domain purchase. | Appropriate for functional testing and a supervised pilot with fallback procedures. Do not make a sleeping free host the sole dependable till service. |
| B. Static frontend with a separate API | Cloudflare Pages for static assets; a suitable API host; tested same-origin proxy where needed. | Frontend distribution is separate from backend uptime. | Does not cure backend sleep or database capacity. Revalidate cookies, passkeys, CORS, CSRF, device trust, deep links, uploads and service-worker scope after migration. Use only if the extra topology has a clear benefit. |
| C. Self-host on existing equipment | Existing suitable computer runs the application and persistent database; local terminals use it; controlled HTTPS access connects authorised remote cafés/owners. | Can avoid hosting subscriptions and keep local operations available when external internet fails. | Electricity, connectivity, hardware, offsite copies and administration still have costs. It is a single point of failure unless recovery is designed. Prefer this route for subscription-free daily operations only if suitable equipment and a responsible maintainer exist. |

For option C, choose a single authoritative write database initially. Separate independent café databases plus two-way synchronisation would be a substantial new engineering project. If the application relies on MongoDB multi-document transactions, the self-hosted database needs a supported replica-set deployment; a single-node replica set enables the topology but does not provide high availability. Remote access must use HTTPS and controlled exposure; a local HTTP IP address is not an adequate basis for all the documented browser security features.

**My practical recommendation:** retain the current stack, use a free cloud environment to complete verification, and decide the dependable runtime before live rollout. If both paid hosting and self-managed infrastructure are ruled out, accept a limited pilot rather than promising uninterrupted multi-café operation. There is no evidence here to guarantee every documented feature indefinitely on free hosted services.

Keep these features free of new paid integrations:

| Need | Recommended approach | What the UI must say accurately |
|---|---|---|
| Authentication | Password plus TOTP/passkeys and securely stored recovery codes. | Enrolled factor, trusted device and recovery state; no SMS dependency. |
| Cash/UPI/card recording | Record existing payment methods and references; verify electronic receipts against merchant-side evidence. | Distinguish recorded, pending verification and reconciled payment. Showing a QR code or a customer screenshot is not settlement confirmation. Existing banking/processing costs are separate from ERP software costs. |
| Customer receipts | Thermal print, browser print or PDF download; optional user-initiated device sharing. | Do not describe manual sharing as an automated WhatsApp integration. |
| Staff and owner alerts | In-app inbox first; optional validated HTTPS email adapter. | Sent, queued, failed and acknowledged are different states. |
| Reports | Existing local PDF/Excel generation and deterministic analytics. | Avoid a mandatory paid BI or generative-AI service. |
| Scanning | Private scanner on existing suitable equipment, or hold uploads pending trusted scanning. | If no scanner is available, disable/hold the affected upload workflow. Do not mark unscanned files clean or expose them through previews. |
| Mobile/desktop use | Responsive web and PWA first; retain native wrappers for supported, cost-compatible delivery channels. | Publish an honest device/printing support table. Installation does not guarantee every browser hardware API works. |
| Backups | Existing secure secondary storage with scheduled exports and restore drills. | Last successful backup, actual recovery point and failed backup alerts. Backups need a separate failure boundary from the live database. |

**Capacity example, not a forecast:** three cafés × 200 sales/day × an assumed 10 KB of total new transactional data per sale × 30 days produces approximately 180 MB/month, before other growth. Three hundred 1 MB attachments add another 300 MB. Actual records, indexes, stock movements and audit events must be measured; this illustration shows why “only a few cafés” is not a capacity test.

Recommended controls are an operational storage budget, attachment compression/resizing where appropriate, duplicate-file detection within the right privacy scope, bounded exports and alerts at proposed thresholds such as 60%, 75% and 85%. These percentages are suggested operating thresholds, not provider requirements. Reaching a limit should trigger a planned archive/migration decision, never silent deletion of invoices or payroll history.

Verify actual collection counts. If all 229 models create distinct collections, copying a complete environment several times in one free cluster can approach its limit quickly. Do not default to a new full database per café. Keep development fixtures and load tests out of production.

For a strict zero-charge policy, avoid paid add-ons/trials and automatic upgrades. Confirm each provider's overage and suspension behaviour and use available spending controls. Do not treat alerts as hard cost caps. On the free Render setup, quota exhaustion can suspend service when no payment method exists; traffic overages can otherwise be chargeable under its documented rules. [Render usage rules](https://render.com/docs/free).

## 21. Automatic updates, own-server migration and failover

### Automatic updates, own-server migration and recovery

The documentation names native Kotlin Android, .NET Windows and Swift Apple wrappers in addition to the PWA. Verify the actual projects and distribution methods before implementing an updater; one web service-worker strategy cannot update all native binaries.

| Delivery target | Appropriate update behaviour and limit |
|---|---|
| Browser/PWA | Check when launched, resumed or reconnected while running; download a complete version in the background. Activate at a coordinated idle point or next launch, after protecting drafts and offline queues. Check all open tabs/clients before activation. A closed app is subject to browser/OS scheduling, so connection alone cannot guarantee immediate installation. |
| Android native wrapper | Distinguish hosted web-content changes from changes to the Kotlin binary or bridge. Use an updater supported by the actual distribution channel. Google Play's in-app update flows involve platform-managed behaviour and user acceptance; do not assume an ordinary downloaded APK can silently replace itself. |
| Windows native wrapper | A signed, correctly packaged MSIX/App Installer deployment can support automatic checks and fallback update locations without Microsoft Store distribution. Verify compatibility with the actual .NET packaging and device trust configuration; user/device policy can change update behaviour. |
| Apple native wrapper | Use the appropriate supported distribution/update channel. App Store auto-updates depend on platform and user settings. A web-content refresh cannot replace native Swift code or bypass the native distribution process. The PWA remains an option where native distribution does not meet the no-subscription constraint. |

These limits are documented in the [service-worker lifecycle](https://web.dev/articles/service-worker-lifecycle), [Android in-app updates](https://developer.android.com/guide/playcore/in-app-updates), [Windows App Installer updates](https://learn.microsoft.com/en-us/windows/msix/app-installer/auto-update-and-repair--overview), and [Apple app-update settings](https://support.apple.com/en-us/102629).

For every release, record the version, compatibility requirements, release channel and build identity. Verify signed native packages and release integrity. Keep the previous working release available, test upgrades with unsynchronised records, and reject corrupted downloads. Do not run blanket cache clearing from the update button: separate disposable static assets from private records and queued transactions. A rollback of frontend assets must remain compatible with database/schema changes; a data migration cannot be undone merely by reinstalling an older app. Critical updates may require a controlled stop at a transaction boundary, with an explicit reason and recoverable work.

Prepare the own-server move by packaging the existing application reproducibly and moving provider details into configuration. Preserve a stable HTTPS origin where possible, `/api/v1` routing, private attachment access, environment validation, secrets handling, persistent volumes, background workers and operational logs. Include export/import and restore procedures for both database records and image/files, plus counts and integrity checks. Audit CSP, CORS, cookies, camera/location access, email recovery, native allowlists and embedded QR links against the destination.

Keeping the same origin also preserves the relationship to browser storage and the installed PWA. A hostname change needs an explicit old-to-new migration path for queued records, devices and authentication; the new origin cannot simply read the old origin's local storage. Before cutover, rehearse a restore, reconcile records, control writes during the final transfer, test all five windows and retain a rollback path. Do not run two independent writable copies of the business database without a designed replication/consistency scheme.

**Live failover and historical backups solve different problems.**

| Failure | Required response |
|---|---|
| Application process fails | Restart it automatically and route new requests to a healthy compatible instance through readiness checks. Recover background work using durable jobs and deduplication. A retry must not create a second bill, punch, payment or stock movement. |
| Host or site fails | A standby on a separate failure domain must already exist. Replicate required data and preserve stable routing. A second container on the same failed machine does not protect against that machine's failure. |
| Database primary fails | Use the selected MongoDB replica-set topology and supported election/retry behaviour. A three-data-bearing-voting-member design across independent failure domains is a candidate when resources permit. Preserve quorum, majority-acknowledged durable writes and authoritative permission checks; do not substitute an empty database or in-memory financial store. |
| Attachment storage fails | Use private replicated storage or a tested recovery path appropriate to the required availability. Return a truthful temporarily-unavailable state; never replace an employee's evidence with a placeholder presented as the real image. |
| Data is deleted or corrupted | Recover from isolated, versioned backups. Replication alone can copy the same deletion or corruption to every live member. Keep backup credentials/copies separate from the application and rehearse restoration. |
| The original service recovers | Require successful health checks, version compatibility, data catch-up and a stability period before returning traffic. Automate this policy and notify the responsible Master. Avoid repeated switching during unstable recovery. Database leadership should follow the tested election policy rather than a blind preference for the original machine. |
| Monitoring detects an incident | Record the affected component, detection time, impact, failover result and recovery state. Notify authorised administrators through the existing notification centre and a configured independent channel where available. An alert service running only on the failed server cannot reliably report that server's complete failure. |

MongoDB documents a default ten-second election timeout, and writes cannot proceed until an election succeeds. Consequently, automatic failover can be engineered and measured, but zero-time database switching cannot be promised. [MongoDB replica-set elections](https://www.mongodb.com/docs/manual/core/replica-set-elections/).

The free-software constraint is feasible for application logic, monitoring and self-hosted services. Availability still depends on hardware, storage, electricity and connectivity already available to the business. With only one server, the realistic baseline is automatic process restart plus isolated backups and tested restoration. Automatic survival of a complete server failure needs additional independent capacity. Free services that sleep cannot support the requested consistently immediate login response; do not use artificial keep-alive traffic as an availability guarantee. See the existing budget assessment and [Render's free-service limitations](https://render.com/docs/free).

## 22. All retained extensions and advanced options

All options below are retained under the user's full implementation request. Complete foundations first, then build these capabilities in the existing modules. A row labelled “later,” “optional,” “if used” or “when useful” identifies its original sequencing/business prerequisite. It is not omitted from the consolidated roadmap. Do not activate an unsupported integration or invent data to make a feature appear complete.

**Conditional integration and analytics contract:** for payment callbacks, automated messaging and AI-assisted predictions, first identify the supported channel, credentials, permissions, costs, data requirements and failure handling. Keep core recording/reconciliation, in-app alerts, manual downloads/sharing and descriptive/rule-based analytics working without that dependency. If no supported zero-subscription channel or suitable existing compute is available, record the dependency as unresolved and retain the extension; do not silently substitute a paid service or mark it implemented. Native distribution is subject to the same cost-compatible delivery decision.

### Expanded functionality and implementation prerequisites

| Capability | Evidence status | Appropriate options | Recommendation |
|---|---|---|---|
| Workspace and supervised employee switch | Full access is asserted; the actual cross-workspace selection contract is not specified. | Persistent selectors plus authorised supervisor views; optional exact restricted-role preview. | Before launch for the requested Primary Master experience. |
| Offline Sync Centre | Manual queue sync is reported. | Durable queue with reconnect retry, conflict review and manual retry. | Before relying on offline sales. |
| Credit/receivables workspace | Department credit orders are documented; full collection lifecycle is not demonstrated. | Customer ledger, due dates, partial allocation and aging inside department orders/finance. | Verify and complete before credit sales; no separate paid accounting service is needed. |
| Shift close and handover | Cash reconciliation is documented; complete locking and reopening rules are not. | Opening/closing drawer records with sign-off and controlled adjustments. | Before live cash operations. |
| Inter-café transfer workflow | Multi-location inventory exists; dispatch/receipt states are not detailed. | Paired transfer with in-transit ledger, receiving variance and approval. | Before physical inter-café stock movement. |
| Refund and return control | Voids/refunds are mentioned; full settlement/restock treatment is not shown. | Linked refund request, approval, payout and stock/waste decision. | Before accepting live payments. |
| Backup and recovery console | BCDR page and verification are asserted without executable evidence. | Readable status plus an actual private restore procedure and tested recovery files. | Before live records are entrusted to the app. |
| Staff query/help inbox | Not demonstrated. | Attendance/payroll requests routed to authorised HR/management. | Soon; improves error resolution without expanding data access. |
| HR lifecycle | Onboarding and deactivation are documented; full exit process is not. | Effective-dated transfer, document checklist, asset return, access removal and final settlement. | Verify before onboarding/exit workflows are relied on. |
| Recipe/allergen and recall links | Recipes and food safety exist; all operational links are not established. | Versioned recipe and allergen data with quarantine/recall enforcement. | Before using these safety representations operationally. |
| Data import/setup wizard | Not demonstrated. | Template, dry-run validation, duplicate report, opening balance reconciliation and controlled commit. | Soon; essential if existing café records will be migrated. |
| Shared expense allocation | Allocation across cafés is not detailed. | Split central expenses by an approved fixed amount, percentage or activity basis; retain the method and effective period. | Useful when comparing café profitability. Prevent allocating the same cost twice. |
| Data quality centre | Several individual alerts exist; a unified resolution workflow is not demonstrated. | List duplicate records, unmatched payments, missing recipe links, negative stock and incomplete punches with responsible people and resolution status. | Soon; use deterministic checks without a paid AI service. |
| Effective-permission preview | Access settings exist; action-by-action explanatory preview is not detailed. | Primary Master selects a role/user and sees permitted cafés, actions and fields, plus the reason for a denial. | Useful when configuring Normal Master and Owner access; never change identity to preview permissions. |
| Concurrent-edit conflict handling | Optimistic concurrency is documented; user-facing conflict resolution is not detailed. | Reject stale saves, show the latest authorised values and let the user reapply intended changes. | Before multi-user editing of sensitive records. Avoid silent last-save-wins overwrites. |
| Recurring obligation register | Some compliance reminders exist; a general obligation register is not detailed. | Track rent, recurring supplier payments, subscriptions and renewals with due dates, responsible people and completion evidence. | Soon if useful; a reminder must not automatically create an expense or mark it paid. |
| Reservations/waitlist/table plan | Dine-in tables are documented; reservations are not. | Simple booking and waitlist view within Operations. | Later, only if seating demand justifies it. |
| Delivery-aggregator reconciliation | Not demonstrated. | Manual statement import and settlement matching first. | Add if aggregator orders are part of actual trading. |
| Catering/events | Institutional orders exist. | Extend department orders for quote, deposit, headcount, delivery and final invoice. | Optional; reuse existing order logic. |
| Payment gateway webhook integration | Explicitly not implemented. | Continue manual payment verification/reconciliation; integrate later if automation is needed and costs are acceptable. | Retained as a conditional later-phase integration under the full request. Verify a supported cost-compatible channel; never mislabel manual verification as automatic settlement. |
| Automated WhatsApp bot | Explicitly not implemented. | PDF download/manual share and in-app/email communication. | Retain in the conditional integration backlog; activate only through a supported cost-compatible channel. Manual sharing and in-app communication remain functional. |
| AI forecasts/chatbot | Not established by the original supplied app scope; now retained as a conditional extension because the user requested all discussed options. | Rule-based exception alerts and descriptive analytics. | Later phase after data quality and reconciliation; use existing compute and validated models only where the no-paid-services constraint is satisfied. |

### Seven operational refinements

These seven suggestions extend existing modules within the five workspaces. The supplied documentation does not establish their complete behaviour, so they are options to verify, not seven confirmed missing features. Complete the existing launch conditions before expanding the backlog. Kitchen systems and kitchen-ticket printing remain outside the requested scope.

| Refinement | Where it belongs | Suggested behaviour and acceptance check | When useful |
|---|---|---|---|
| Isolated training mode | Primary Master controls access; Café Operations and Staff practise their permitted workflows. | Use synthetic records and a clearly marked training session. Enforce separation from live sales, stock, payroll, document numbering, messages and payment actions on the server. Reset only training records. Training must be entered deliberately and must never be an automatic fallback when the live API fails. Verify that a practice sale cannot change any live balance or enter a live offline-sync queue. | Before training employees on the app; an existing isolated test environment may satisfy this without building a new production feature. |
| Café configuration templates | Primary Master settings, with authorised local overrides visible to Owners and delegated managers. | Define common menu, receipt, opening-hours and approval defaults. Show which values each café inherits and overrides. Before applying a change, preview the affected cafés and values; preserve exceptions unless explicitly selected, record the actor and effective date, and handle partial failures visibly. Do not copy staff credentials, bank accounts or café identity from a template. Historical transactions retain their original configuration. | Useful for multiple cafés and future café onboarding. |
| Configurable business-day cutoff | Café settings, sales reports and cash closing. | A café closing after midnight can group late sales into its intended trading day. Store the actual transaction timestamp and café timezone separately from the operational business date. Apply the same rule to dashboards, shift close and relevant exports. Keep official document dates intact; changing the cutoff must not silently regroup closed history. Check transactions immediately before and after the cutoff. | Only if actual opening hours or reporting needs require it. |
| Staff meals and complimentary items | POS and inventory, with approval limits and Owner/Primary Master reporting. | Record a distinct reason, quantity, café, operator and approver where required. Separate staff consumption, complimentary customer items, ordinary discounts, voids and waste. Record stock consumption once and show its cost separately from cash collected; do not assume that every complimentary item has no reporting or tax implications. Verify cancellation and reversal without double stock movement. | If the cafés provide staff meals, samples or complimentary items. |
| Packaging and consumables tracking | Existing inventory and item configuration, operated by Café Operations. | Include cups, lids, takeaway containers, bags and other material consumables. Where worthwhile, link consumption to item size and service type so takeaway and dine-in use appropriate quantities. Track exceptional usage and waste separately. Keep deductions idempotent and unit conversions explicit; verify that a retried sale consumes packaging only once. Low-value supplies can use periodic counts if per-sale tracking would be excessive. | If these costs or shortages are material. |
| Blind stock counts with review | Café Operations or assigned Staff count; an authorised Normal Master, Owner or Primary Master reviews. | Hide the expected balance from the counting user through both UI and API permissions. After submission, an authorised reviewer sees the variance, movements during the count and any recount. Adjustments need a reason and must post only once. Use the existing inventory-count workflow and prevent a counter from approving their own restricted adjustment. | Useful before relying on stock-variance reports across cafés. |
| Cash deposit acknowledgment | Existing cash book and passbook; Café Operations submits and authorised finance users reconcile. | Extend the documented Bank Deposit action and cash-drop logs with amount, reference, source café/drawer, depositor, handover acknowledgment and bank-received status. A deposit slip alone does not confirm bank receipt. Show outstanding deposits and differences until matched to bank evidence, including partial matches. Use one linked transfer, not a new sale or a duplicate bank entry. CSV/manual matching can meet this need. | Before relying on app records to track cash taken from cafés to the bank. |

The web comparison supports two of these workflow patterns: [Lightspeed documents training users whose practice transactions are separated from actual customer orders in most reporting](https://k-series-support.lightspeedhq.com/hc/en-us/articles/10630440970779-Training-POS-users), and [Zoho documents permission-controlled visibility of expected stock, discrepancy review and approval](https://www.zoho.com/us/inventory/help/items/stock-counts.html). The isolation and approval details proposed above are recommendations for Zamorin, not claims that those products implement every listed safeguard. These references illustrate workflows; no subscription to those products is needed to implement the ideas in this app.

For this multi-café design, café configuration templates, deposit acknowledgment and controlled stock counts are the strongest operational refinements. Training mode is useful for onboarding; business-day cutoff, complimentary-item tracking and packaging detail depend on actual café practices. All seven can use the existing application architecture without a new paid integration, but they still require development and consume the capacity of the chosen hosting services. A pilot at one café using all five roles should determine what to activate next.

### Owner advanced extensions retained in the roadmap

| Option | Add only when |
|---|---|
| Sales-channel contribution | Dine-in, takeaway, institutional or aggregator channels have materially different packaging, fees or discounts. Start with manually captured/imported fees if necessary. |
| Promotion review | Campaigns are actually run. Track redemptions, discount cost and observed results without claiming causal uplift from a simple before/after comparison. |
| Lost-sales/stockout log | Managers can record unavailable items or abandoned requests reliably. Treat estimated lost value as an estimate, not a booked loss. |
| Detailed break-even scenarios | The owner has reliable fixed/variable cost assumptions and needs a planning decision. Show assumptions and sensitivity rather than a guaranteed target. |
| Lease/outlet expansion comparison | A real renewal, relocation or new café decision is being considered. Reuse planning and compliance data. |
| Reservations, events or catering extensions | These are part of the café's actual trading model. Reuse order, deposit and final-settlement records. |
| Advanced churn, elasticity or predictive maintenance | Enough reliable history exists and the simpler decision process is already useful. These are not prerequisites for an Owner portal. |

## 23. Implementation work packages and delivery sequence

### Work packages and dependency order

Use these work packages as the implementation checklist. “Complete” requires the associated code, data flow and evidence; presence of a screen alone is insufficient. The full roadmap includes later phases without making every external integration a first-pilot gate.

| Package | Deliverable | Main dependency | Acceptance references |
|---|---|---|---|
| WP01 | Source/build inventory, deployment identity and actual 650-control reconciliation. | Current repository/ZIP and staging access. | T01–T32 and V06 inventory linkage. |
| WP02 | Central role/café/field permissions and Primary Master supervision. | WP01. | T05–T10, V07, W01–W05. |
| WP03 | Login, MFA/passkeys, password recovery and secure session handling. | WP01–WP02; working recovery channel. | T01–T04, V04–V05, O01. |
| WP04 | Account hold, logical deletion, reinstatement and session revocation. | WP02–WP03. | T30, V14–V15. |
| WP05 | Current-design dropdowns/calendars, language, font scale, themes and login assets. | Visual baseline and existing tokens. | V01–V06, T31. |
| WP06 | Shared settings, MailOps, notifications, help, search and action inventory. | WP02–WP05; adapters. | T24, V06, O05. |
| WP07 | POS, bills, modifiers, tenders, refunds and historical pricing. | WP02; transaction boundaries. | T11–T12, T15, T17. |
| WP08 | Durable offline queues, retries, conflict handling and device handover. | WP03, WP07. | T13–T14, T32, O02–O03. |
| WP09 | Credit/institutional orders, collections, limits and customer statements. | WP07; opening receivables. | T15, W07, O04. |
| WP10 | Cash drawers, close packs, deposits, bank matching and review. | WP07–WP09. | T16, W08–W10. |
| WP11 | Inventory, FEFO, recipes, packaging, waste, meals and blind counts. | Item/unit/recipe setup; WP07. | T17, W12. |
| WP12 | Procurement, suppliers, GRN matching, AP and inter-café transfers. | WP02, WP11. | T18–T19, W03–W04. |
| WP13 | Expenses, approvals, shared allocation and budgets/CAPEX. | WP02, WP10, WP12. | T14, T23, W10. |
| WP14 | Ledger, finance, drawings, revenue share, period locks and reconciliation. | WP07–WP13; verified opening data. | T15, T21, W02, W10, O04. |
| WP15 | Employee lifecycle, assignment, documents, loans and final settlement. | WP02, WP04. | T09, T22, T30. |
| WP16 | Rosters, leave, attendance, selfie/location evidence and daily calendar. | WP15; HTTPS sensors and private storage. | T20, V08–V10. |
| WP17 | QR generation/scanning, strict rotating expiry and purpose separation. | WP02–WP04; WP16 for attendance. | V11–V13. |
| WP18 | Payroll rules, approved inputs, payslips, payouts and corrections. | WP14–WP16; independently checked rules. | T21, W12. |
| WP19 | All Owner strategic screens and decision-to-execution links. | WP02, operational data and approvals. | T23, W01–W13. |
| WP20 | Customer service, complaints, loyalty, privacy and compensation. | WP07, WP13–WP14. | T23, W11. |
| WP21 | Assets, existing quality/recall controls, utilities and maintenance. | WP11–WP13; named responsibility. | T17, T23. |
| WP22 | Training, SOP versions, announcements, handover and Staff query routes. | WP02, WP15; isolated training data. | T23–T24, O03, O05. |
| WP23 | Chart/metric catalogue, all 18 chart views and scoped drill-downs. | Reconciled source records and definitions. | T24, W02, W10, W12. |
| WP24 | All 18 report families, report packs, safe PDF/Excel/CSV and printing. | WP23; field/role catalogue and fonts. | T24, T31, V13, W13. |
| WP25 | Attachments, scanning, photo retention, audit and safe Trash. | WP02; capacity and private storage. | T22, T27, T29. |
| WP26 | Durable jobs, resource limits, email adapters and free-hosting decision. | Actual provider topology and compute. | T03, T25–T26. |
| WP27 | Security hardening, dependency/runtime updates and measured performance. | WP01; real versions, representative load. | T07–T10, T26, V22. |
| WP28 | PWA/native update mechanisms, release records and compatible rollback. | Actual delivery platforms and signing. | T28, V16–V17. |
| WP29 | Own-server package, data/image migration and cutover rehearsal. | WP25–WP28; available server capacity. | V18, O04. |
| WP30 | Isolated backups, restore drills, live failover/failback and alerts. | Independent storage/standby appropriate to failures. | T27, V19–V21, O05. |
| WP31 | Configuration templates, import/setup and data-quality resolution. | WP02; verified schemas and rules. | T14, T24, O04. |
| WP32 | Conditional trading extensions: reservations/waitlist, catering/events, channel/aggregator reconciliation. | Relevant café trading model and inputs. | Extend T11/T15 with the activated workflow's complete lifecycle. |
| WP33 | Conditional advanced forecasts, break-even/outlet scenarios, promotion review, lost-sales log and predictions. | Reliable data, defined assumptions and suitable existing compute. | Reconcile inputs; show uncertainty; test permission and empty-data behaviour. |
| WP34 | Conditional external payment/messaging/AI automation and native distribution. | Supported, authorised, no-subscription-compatible channel. | Signature/authentication, replay, failure, cost and delivery tests for the chosen integration. |
| WP35 | Pilot, reconciliation, role/device sign-off and support handover. | All applicable first-release gates satisfied. | All relevant T/V/W/O scenarios and chapter 25. |

### Definition of done for every implemented option

- The control is reachable by the correct role and café; direct APIs enforce the same permission.
- It validates inputs, performs the real business operation, persists the result, updates related records once and records the actual actor where required.
- Reload, repeat click, retry, stale edit, revoked session and loss of connection have defined outcomes. Pending work remains identifiable and recoverable.
- Errors, loading, empty data and unavailable dependencies use the existing UI patterns; no fabricated data or success messages.
- Related charts, reports, exports and notifications use the same record, scope, time basis and definitions.
- The existing design is preserved across supported themes, languages, font scales and devices.
- Evidence records the build, scenario, expected/actual result and retest. No unexecuted case is marked passed.

### Control inventory to produce from the actual source

For each control record: stable ID; screen/route; label/localisation key; role/café/field permissions; user action; handler; API or local effect; validation; persistent record changes; approval/audit effects; loading/empty/error/offline behaviour; device requirements; test reference; result; defect/fix/retest. Discover the actual number; do not use the documentation's 650 count as a ceiling that excludes additional controls.

### Functional examples of completion

Language selection must change labels and persist the preference. Password change must open the form and update verified credentials. Attendance must save validated evidence and make it retrievable on the correct calendar date. A purchase approval must reach the permitted downstream action. A report must reconcile to its source records. A notification must link to an authorised destination. A backup is complete only after a successful restore demonstration.


### Original release sequence retained with dependencies

| Order | Work package | Completion condition |
|---|---|---|
| 1 | Establish the real baseline | Source, deployed commit, environment, route inventory and test output match. Documentation conflicts have owners. |
| 2 | Settle role and scope policy | Primary Master parity and supervision work; Normal Master, Owner, store and staff boundaries pass direct API and export tests. |
| 3 | Correct financial and destructive actions | Demo bills removed; payment/stock/accounting retries safe; refunds and closed periods controlled; purge protected. |
| 4 | Choose and validate the free runtime | Commercial-use hosting choice, recovery email, scanner placement, persistent data and job catch-up tested. |
| 5 | Finish daily operations | Cash opening/close, credit collections, stock transfers and attendance exceptions work end to end. |
| 6 | Validate payroll and reporting | Applicable rules independently checked; payroll and ledger reconciled; exports obey the same permissions. |
| 7 | Prove recovery | A complete restore succeeds and produces recorded recovery measurements. |
| 8 | Run a controlled café pilot | Use one café first with a documented fallback; reconcile sales, cash, stock and attendance over full operating cycles. Expand only after concrete failures are resolved. |
| 9 | Verify existing navigation and staff experience | Workspace switching, mobile paths, translations and actual-device printing are usable. |
| 10 | Activate advanced modules as useful | Executive analytics, loyalty, predictive maintenance and optional integrations use reliable source data and have accountable owners. |

I would prioritise completion and evidence over a new broad feature batch. The five-window concept is appropriate. The requested universal Primary Master experience is achievable within it, without sharing employee credentials or duplicating modules. The immediate decision is how the actual business will obtain dependable compute, storage, mail delivery and recovery while keeping subscription spend at zero.

To move from this review to a verified implementation audit, the next evidence is the actual source snapshot or repository for the named commit and a running test environment with representative role accounts. Screenshots or a walkthrough help assess design, while source and live access are required to verify every hidden control, endpoint and deployment claim. Do not provide passwords or production personal records in the report itself.

### Business workflow sequence

| Order | Deliverable | Completion test |
|---|---|---|
| 1 | Correct and consistent records/permissions | Financial totals, café scope, sensitive fields and direct record access agree across pages, APIs and exports; reported critical defects are resolved. |
| 2 | Complete daily sales, cash, credit and stock flow | Sale, payment, cash close, bank deposit, debt collection and inventory movement reconcile without duplicate effects. |
| 3 | Complete attendance-to-payroll flow | Published roster, actual punches, corrections, approved hours, payroll inputs and payout states remain traceable. |
| 4 | Define the metric and report catalogue | Every enabled report and chart has an agreed meaning, source, role scope and matching table/export. |
| 5 | Surface useful charts and decisions | Each window gets a small suitable dashboard; users can reach the underlying record and complete the permitted next action. |
| 6 | Validate real use and recovery | Representatives of all five windows complete a café operating cycle and the critical failure/recovery scenarios. |
| 7 | Activate conditional enhancements | Forecasts, detailed campaign/channel analysis and advanced predictions are added only where the business has reliable inputs and a decision to make. |

From the business owner's perspective, the goal is a connected system: a Staff correction can be reviewed by a permitted supervisor, feed the correct payroll period and appear accurately in the Owner's labour-cost view; a café sale can change the correct stock, cash and credit records and reconcile with Master reports. These connections should be demonstrated before adding more advanced analytics.

The proposed functionality can use the existing application and in-app/manual workflows without requiring a paid attendance, BI, accounting or messaging subscription. This does not remove the hosting, database, mail delivery and recovery constraints described earlier. Kitchen display and kitchen-ticket printing remain outside the requested scope.

### Technical implementation sequence and project inputs

1. Obtain the current source snapshot and verify its identity against the deployed build. Inventory the actual routes, controls, settings, service worker, native wrappers and deployment configuration; reconcile the documentation's coverage counts.
2. Correct high-impact permission, revocation, password, camera/location and data-integrity problems. Preserve the visual baseline while completing dropdowns, calendars, translations, font scaling and the remaining handlers.
3. Complete attendance evidence and QR expiry end to end, including private storage, daily-calendar retrieval and realistic scan tests.
4. Implement versioned updates, compatibility checks and safe activation for the platforms actually delivered. Package and rehearse the own-server migration.
5. Implement monitoring, isolated backups and the failover tier supported by available hardware; run recovery drills and performance checks.

The source ZIP or repository, a staging URL, the actual distribution methods and the existing design/assets are needed to perform these changes and verify them. Obtain staging test identities through the normal approved access method; do not paste production passwords, signing keys or environment secrets into the review. The documentation review and this implementation specification are complete for the supplied information. Application implementation, device testing and production readiness remain unverified.

### Owner workflow completion criteria

First resolve the access conflicts and provide trustworthy drill-downs. Then complete the profit explanation, receivables/payables, daily close review and decision follow-through. Add the staffing and usage-variance views using reliable existing inputs. Run a real Owner walkthrough before activating the more advanced predictions.

I would consider this a useful Owner app when I can see the money, understand why results changed, make a permitted decision, assign responsibility and confirm the outcome without switching to someone else's credentials or rebuilding the answer in a spreadsheet.

Most of the required modules already appear in the design. The practical gaps are connected workflows, clear financial definitions and consistent permissions. This Owner-focused review refines the existing scope; it does not reopen an unlimited feature wishlist. The suggested views can use the current application database, in-app tasks and manual imports without paid third-party subscriptions. Existing hosting capacity and recovery constraints still require validation.

## 24. Complete acceptance catalogue and evidence

### Core scenarios T01–T32

Run these on a non-production dataset containing at least two cafés, two employees with distinct records, all five personas and a second organisation. Use the actual deployment topology and representative devices. This is a proposed acceptance suite, not a claim that these tests have been run.

| Test | Scenario | Passing outcome |
|---|---|---|
| T01 | Login using email and each supported user identifier; suspended/unknown account; repeated failures. | Correct identity and landing route; generic public errors; durable throttling; no account enumeration. |
| T02 | MFA/passkey enrollment, login, cancelled challenge, device loss and recovery. | Secure completion and an audited recovery path without unapproved privilege bypass. |
| T03 | Password reset on the deployed host, including delivery delay, resend and expired code. | Actual message arrives; old/reused tokens fail; sessions are revoked as designed. |
| T04 | Cold start, refresh-token renewal, browser reload and multiple tabs. | Correct session restoration or a clear recoverable state, never another user's stale screen. |
| T05 | Primary Master opens all five workspaces, every owner page and each staff service. | Universal authorised access with stable actor identity and explicit supervised subject. |
| T06 | Café A slow response arrives after switching to café B; a draft was open. | No A data appears under B; the draft and pending submissions remain bound to A. |
| T07 | Normal Master visits restricted URLs and calls their APIs, exports and attachment URLs. | Denial is consistent; payroll, bank and owner data are absent from responses. |
| T08 | Owner requests unassigned café, another owner's ledger and forbidden financial details. | Every access path denies it while permitted assigned-café summaries remain correct. |
| T09 | Staff changes employee identifiers in attendance, leave, payslip and document requests. | Only self-authorised data/actions succeed; no metadata leakage. |
| T10 | Store device enrollment, PIN failure, operator handover, revocation and Master elevation. | Correct café binding, named actors, lock/recovery behaviour and expiry of elevation. |
| T11 | Normal POS sale with modifiers, discounts, split tender, rounding and receipt. | Correct bill, payment, stock and accounting records reconcile with the printed receipt. |
| T12 | Repeat payment click; disconnect after server commit but before response; reconnect/retry. | One financial result with a retrievable acknowledgment; no duplicate billing or stock depletion. |
| T13 | Offline sales, reload/close, price change, revoked operator, reconnect and repeated sync. | Original data preserved; accepted sales deduplicated; exceptions visible for authorised review. |
| T14 | Two authorised users edit the same expense, employee record or purchase order from stale views. | A stale save is rejected or explicitly reconciled; changes are not silently overwritten, and both authorised actions remain traceable. |
| T15 | Partial credit collection, excess payment handling, refund and customer statement. | Outstanding balances, bank/cash movements and invoice allocations reconcile. |
| T16 | Open shift, drops, petty cash, drawer count, handover, close and attempted later edit. | Expected/actual variance explained; closed records protected; adjustments traceable. |
| T17 | Two tills sell last stock; batch expires/quarantine; refund of prepared food. | Defined stock policy holds; unusable lots excluded; restock/waste treatment correct. |
| T18 | Requisition to PO, partial GRN, duplicate invoice, matching exception and supplier return. | Correct quantity/value, no duplicate stock/AP, controlled exception approval. |
| T19 | Inter-café stock dispatch, partial receipt and missing/damaged quantities. | Both café ledgers and in-transit stock reconcile; discrepancies remain assigned. |
| T20 | Overnight attendance, break, missed punch, approved leave and later correction. | Correct local shift/date and hours; original event history preserved. |
| T21 | Payroll draft, review, repeat post, payslip publication, payout file and bank reconciliation. | Independently checked amounts; one posting; correct visibility; paid status reflects evidence. |
| T22 | Upload good/bad/oversized files; scanner unavailable; foreign download ID; PDF preview. | Correct scan and permission states; no unscanned/foreign file disclosure; preview works safely. |
| T23 | Owner budgets, training, complaints, recall and delegated approval. | Tasks, approvals and operational changes are connected; scope and delegation expiry enforced. |
| T24 | Notifications, all settings aliases, exports, imports and report filter changes. | Correct role scope, field restrictions and consistent totals; no alias bypass. |
| T25 | Backend sleeps/restarts across nightly job times; worker retries after partial work. | Catch-up executes safely once and exposes overdue/failed work. |
| T26 | Storage close to budget; large report; representative concurrent café workload. | Bounded response times/resource use and clear errors; no silent truncation or corruption. Record measured limits. |
| T27 | Restore data and files into an isolated environment after simulated loss. | Business totals and sample files verified; measured recovery time and recovery point recorded. |
| T28 | Deploy/update/rollback with held carts and pending offline sales. | Compatible version handling, preserved queue and a documented recovery route. |
| T29 | Trash restore, attempted protected-record purge, and authorised irreversible purge. | Dependency/retention rules hold; strong confirmation and audit trail present. |
| T30 | End-of-employment deactivation, session revocation and final settlement. | Access removed promptly; history retained; pending obligations reconciled. |
| T31 | Printer failures, mobile GPS/camera permissions, themes, keyboard and language variants. | Supported combinations work and unsupported actions have usable fallbacks. |
| T32 | Logout/lock with unsent sales, then login as another user and use browser Back. | No private data leaks; pending business data remains recoverable and correctly attributed. |

For each failed test, retain the user-visible symptom, expected/actual result, commit, role, café, request identifier, relevant redacted logs, fix and retest outcome. Static import checks and green unit tests complement these scenarios; they cannot substitute for them.

### Latest requirement scenarios V01–V22

Use the real source and a staging deployment with representative records. These scenarios extend, rather than replace, T01–T32 and the earlier screen/role review.

| Test | Scenario | Pass condition |
|---|---|---|
| V01 | Compare existing pages before and after the changes on supported viewports/themes. | Existing layout, navigation and visual identity remain intact; only authorised matching controls and user-selected preferences differ. |
| V02 | Open every dropdown/date picker in a page, dialog and small viewport; use keyboard and touch. | Selection, validation, focus, scrolling, localisation and date boundaries work without clipping or inaccessible choices. |
| V03 | Change each supported language and font scale in each window; reload and sign in again. | Labels and visible text scale update, stored preferences return, scripts render correctly and no controls become unreachable. |
| V04 | Use signed-in password change and logged-out recovery; retry wrong, used and expired tokens. | Correct forms and delivery flow work; invalid attempts fail; credentials and session state change only after successful verification. |
| V05 | Delay or break login background/image requests and start with an empty browser cache. | Existing styled fallback appears, login controls remain usable and the page does not shift unexpectedly. |
| V06 | Exercise the complete role-specific control inventory, including all settings, exports and notification links. | Every required enabled control produces its real permitted effect and useful failure behaviour; no demo financial data or false success is substituted. |
| V07 | Switch cafés/workspaces while a fetch, draft, upload and queued transaction are present. | No cross-café display or write; original record scope is retained; administrator actions keep the real actor identity. |
| V08 | Attempt attendance with denied camera/location, old or inaccurate position, out-of-boundary position and unavailable device hardware. | Clear retry/exception paths; no false verified attendance or automatic absence caused solely by a technical error. |
| V09 | Record multiple shifts and an overnight shift; open each calendar date and image. | Correct shift/date association, timezones, employee/café, evidence and correction history; photos are viewable only by authorised users. |
| V10 | Interrupt the photo upload or response and press submit twice. | One event at most, recoverable partial state, no orphan image shown as verified evidence and no duplicate payroll time. |
| V11 | Scan each QR before, exactly at and after expiry; alter the client clock; replay a screenshot against different application instances. | Server expiry and scope are enforced consistently; no expired rotating QR is accepted. |
| V12 | Scan one shared attendance QR as two different employees, then repeat as the same employee/action. | Both legitimate employees can attend; duplicate submissions have no duplicate effect. |
| V13 | Scan every app, payment and printed-PDF QR at the intended final size using representative phones. | Reliable decoding, correct destination/payload and access rules; payment status requires the configured verification process. |
| V14 | Put a logged-in staff account on hold; use an existing access token, refresh token, socket and photo URL. | New protected requests and actions are rejected under the revocation policy; connected views lock; no alternative login path restores access. |
| V15 | Restore a held account, attempt an old token, and reconnect a device with queued records. | Only authorised Master restoration succeeds; fresh login is required; old tokens stay revoked; queued records receive explicit validation/reconciliation. |
| V16 | Download an update during an active sale or attendance capture with several tabs/devices open. | Complete download, coordinated safe activation, retained drafts/queue and compatible data/API version. |
| V17 | Corrupt or interrupt an update and test a supported rollback on each delivered platform. | Invalid release is rejected; last working version remains available; no lost transaction or unsupported schema rollback. |
| V18 | Restore database and image backups to a clean own-server staging installation. | Records, attachments, scope, QR links, recovery email, HTTPS sensors and all five login/workspace flows work; counts and sample checks reconcile. |
| V19 | Kill an application instance during a write and interrupt a database primary. | Only a legitimate healthy target serves traffic, requests recover within the measured objective and no duplicate or falsely acknowledged transaction occurs. |
| V20 | Restore the original server while it is stale or unstable, then make it healthy. | No premature failback; catch-up and stability checks govern traffic; incident and recovery notifications identify actual state. |
| V21 | Simulate deletion/corruption and restore an isolated backup including private images. | A usable recovery point is demonstrated; access controls remain enforced; measured recovery time and any data-loss interval are recorded. |
| V22 | Measure representative peak load and a long operating session; audit security failures and all release evidence. | Agreed response targets, scope checks and durable records hold; remaining defects have explicit status; no unexecuted test is reported as passed. |

### Owner scenarios W01–W13

Use representative non-production records and the same deployment topology intended for the app. These are proposed acceptance scenarios, not completed tests.

| Test | Scenario | Passing outcome |
|---|---|---|
| W01 | Owner assigned cafés A and B attempts café C. | Navigation, direct record requests, exports and attachment links consistently deny C. |
| W02 | Owner opens a sales or expense total. | Supporting records are accessible within scope and sum to the displayed total on the same basis. |
| W03 | Owner requests supplier outstanding balances. | The permitted read path works despite the documented Master-guard ambiguity; forbidden suppliers remain hidden. |
| W04 | Owner approves a qualifying PO and attempts an unqualified one. | Both the allowed and denied decisions match the configured authority; retries cannot repeat the business effect. |
| W05 | Café A response arrives after switching to B. | A's data does not appear under B; an existing proposal remains bound to its original café. |
| W06 | Owner approves a price change effective tomorrow. | Approval and applied status are visible; today's issued bills remain unchanged. |
| W07 | Customer pays an old credit invoice. | Cash/collections and outstanding debt change correctly; current-period new sales do not increase. |
| W08 | Manager submits a cash close with a difference. | Owner sees the difference, explanation and evidence, and can return it for correction without erasing history. |
| W09 | Cash is handed over but not yet confirmed in bank. | It stays identifiable as an outstanding deposit and is not counted twice. |
| W10 | Shared cost or bank account appears in two cafés. | Portfolio totals use the correct allocation/deduplication and explain the calculation. |
| W11 | Owner approves complaint compensation. | The actual authorised refund/voucher execution is linked and cannot happen twice on retry. |
| W12 | Inventory count or payroll input is incomplete. | The margin/usage/labour report is labelled provisional or incomplete rather than displaying fabricated certainty. |
| W13 | Owner exports a report or leaves a shared device. | Field/café restrictions hold in the export and prior private data is not revealed after logout. |

### Final operational scenarios O01–O05

These incorporate the final conversation checks. They add explicit business evidence to related T/V/W scenarios; none is a completed test.

| Test | Scenario | Passing outcome |
|---|---|---|
| O01 | Primary Master loses the enrolled MFA device or is unavailable during a recovery event. | An authorised, documented recovery/succession path works without sharing employee credentials, exposing recovery secrets or bypassing identity checks. Audit the recovery and require fresh sessions. Protect the last recoverable Primary Master. |
| O02 | A terminal crashes, storage fills, a queue write fails, or browser/site data is cleared before sync. | Durably saved pending entries survive supported restarts and retries without duplication; failed local writes are not shown as completed sales. Detect and communicate the limits of cleared/lost local data, and follow a tested reconciliation/fallback process. Never claim browser-only data can always be recovered. |
| O03 | One employee signs out of a shared terminal; another signs in and uses Back, cached views, exports and attachments. | The second employee cannot retrieve the first employee's private records through the app. Pending business work stays correctly attributed and recoverable. Shared devices use an appropriate local-download and session policy. |
| O04 | Prepare the first live day or migrate to the own server with existing stock, money and employee balances. | Reconcile opening stock/value, cash/bank, customer dues, supplier balances, advances and leave balances to approved source records. Validate/import once, retain corrections and sign-off, and avoid duplicate opening entries. |
| O05 | Simulate an outage, failed backup, broken recovery delivery or unattended alert. | A named responsible person receives the available independent alert, sees impact and ownership, follows the café fallback/recovery instructions and records resolution. Staff know the permitted actions while login, attendance or connectivity is unavailable. |

Primary-account recovery should resist turning the recovery route into an MFA bypass; [OWASP describes recovery methods and their trade-offs](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html). Browser persistence reduces eviction risk but cannot prevent users clearing site data; [MDN documents the storage limits](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

### Executable test evidence record

| Field | Required entry |
|---|---|
| Test and control IDs | T/V/W/O case plus all exercised controls and relevant work package. |
| Build and environment | Commit, deployment, schema and asset versions; device/browser/wrapper; network and data-volume conditions. |
| Scope | Real test role, organisation, café, employee subject and granted capabilities. |
| Evidence | Expected result, observed UI/API/database outcome, reconciliation totals and relevant redacted logs/screenshots. |
| Outcome | Not run, passed, failed, blocked by a named dependency, or explicitly not applicable to the selected channel/workflow with a reason. |
| Defect and retest | Issue, responsible implementer, fix commit and fresh passing evidence. A missing test or blocked dependency is not a pass. |

Extend these scenarios for every activated conditional extension and any controls found in source but absent from the representative documentation. The 72 numbered scenarios are a baseline, not proof that 72 tests exhaust every possible application state.

## 25. Release gates, pilot and operational handover

**What remains before operational readiness can be confirmed**

All rows below are unresolved verification work. A documentation claim is not passing evidence, and this table does not establish that every listed behaviour is currently broken.

| Priority | Work to close | Evidence needed |
|---|---|---|
| 1 | Establish the actual build and feature inventory. | Repository/source snapshot, deployed commit, complete route/action list and actual test output. Resolve the conflicting test totals and enumerate the partially wired controls. |
| 2 | Prove all five permission boundaries and Primary Master switching. | Primary Master can enter the required café and employee views while keeping the true actor identity. Normal Master, Owners, terminals and Staff cannot fetch forbidden records through pages, APIs, exports or attachments. Café switching cannot relabel stale data or redirect an old draft into a new café. |
| 3 | Prove transaction accuracy. | Demo bill fallback removed; checkout, refunds, credit collections, purchasing and inter-café stock movements reconcile. Repeated clicks, retries and interrupted requests cannot duplicate payments, stock movement or ledger postings. Closed records have controlled correction paths. |
| 4 | Prove identity, attendance and payroll operations. | Deployed recovery delivery works; privileged access has a recovery procedure; camera/GPS work where used; attendance exceptions retain their history. Sample payroll and applicable tax calculations are independently checked, with correct payslip visibility and payment status. |
| 5 | Validate the zero-subscription deployment. | Selected services permit the intended use; storage and resource limits are measured; email, scanning and scheduled jobs work on the actual host. Restarts and missed schedules recover safely, and exceeding a limit has an understood outcome. |
| 6 | Prove data recovery and safe updates. | Database and attachments restore into an isolated environment with reconciled totals. Pending offline sales survive supported restarts, logout and updates; local write failure is visible. Destructive actions and schema migrations have tested recovery procedures. |
| 7 | Complete the user journeys on real devices. | Every exposed control has a working result or an explicit unavailable state. Staff can complete ordinary tasks; keyboard, text scaling, translations, customer receipts and errors are usable on the supported devices. Complete the MailOps route and required handlers; no required function may be hidden to claim completion. |
| 8 | Complete a controlled café pilot. | Representatives of all five roles complete full operating cycles, with cash, sales, stock, credit and attendance reconciled. No unresolved failure can expose unauthorised records, silently lose or duplicate business transactions, or prevent essential recovery. Record any accepted minor limitations and their operational fallback. |

The hosting recheck on 19 September 2026 confirms that [Vercel Hobby is restricted to personal, non-commercial use](https://vercel.com/docs/plans/hobby), [Render advises against using Free instances for production and documents sleep, storage and SMTP restrictions](https://render.com/docs/free), and [Atlas Free does not provide its managed backup option](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/). These are constraints on the documented deployment, not a recommendation to buy subscriptions. Chapter 20 describes the pilot and existing-equipment options and their limits.

### Initial live release and complete-roadmap closure

Before relying on the app for café trading, demonstrate the required daily business flows, current-role isolation, accurate records, recovery, supported devices and all applicable security gates. A controlled initial pilot can precede data-dependent extensions. The full implementation roadmap is complete only when every retained applicable work package is implemented and verified; an unresolved prerequisite remains a tracked blocker, not completion. Do not label blocked integrations, unavailable native channels or unbuilt advanced features “complete.”

Do not release an affected workflow with unresolved unauthorised access, silently lost/duplicated transactions, wrong payment/payroll results, unusable mandatory recovery, accepted expired access QR codes or broken required controls. Record minor accepted limitations with their practical workaround; this does not waive the user's no-dead-options requirement.

The required next inputs are the current source ZIP/repository, a staging deployment, representative role accounts through the normal secure access method, actual target devices/distribution channels, and the available server/storage topology. This specification does not request production passwords, signing keys or personal employee records in chat.

### Handover records

Keep the deployed commit, environment/configuration inventory with secrets redacted, role catalogue, control inventory, metric/report definitions, data migration record, release notes, test evidence, backup/restore evidence, native update/distribution record, incident contacts and the staff fallback guide together. Keep recovery/signing/encryption secrets in their appropriate protected system rather than in this document.

**Completion status of this deliverable:** consolidated implementation specification complete for the supplied material. No application code has been changed, no app tests have been executed, and no production-readiness certification is implied.

## 26. Traceability and references

### Conversation-to-implementation map

| Conversation requirement | Canonical chapters | Acceptance coverage |
|---|---|---|
| Review the complete app from login to the last page. | 2–19; all 71 documented screen IDs. | T01–T32, V06. |
| Primary Master, Normal Master, Owner, Café Operations and Staff windows. | 4–11. | T05–T10, W01. |
| Primary Master switches cafés and supervises employee windows. | 4–6. | T05–T06, V07. |
| Normal Master restrictions and own Staff rights. | 4, 8, 11. | T07, T09. |
| Owner perspective and all 18 strategic/financial pages. | 3–4, 9, 14, 16. | W01–W13, T23. |
| No KDS or kitchen-ticket printing. | 1 D05. | Scope review; do not implement excluded modules. |
| Entire-app charts, attendance and reports. | 13–16. | T20–T24, V08–V10. |
| Modern, capable app without UI/UX redesign. | 1, 12, 19. | V01–V03. |
| Matching dropdowns and calendars. | 12, 15, 19. | V02. |
| Working language/font/theme/preferences. | 12, 19. | V03, T24, T31. |
| Password reset and change forms work. | 6, 12. | T02–T03, V04. |
| Fast login and functional backgrounds. | 6, 12, 19. | T04, V05, V22. |
| All controls functional; no dead options. | 3, 12, 23. | V06 plus the actual control inventory. |
| GPS/selfie attendance and daily stored photos. | 15, 18, 20. | V08–V10. |
| Appropriately sized app/PDF QR codes. | 16–17. | V13. |
| Expired rotating QR codes unusable. | 17. | V11–V12. |
| Held/deleted staff blocked until authorised restoration. | 6, 11, 15. | T30, V14–V15. |
| Prepare to move to an own server. | 20–21. | V18, O04. |
| Automatic downloads/installations when devices reconnect. | 21, subject to platform limits. | V16–V17, T28. |
| Multiple backups, automatic failover/failback and notifications. | 18, 20–21, 25. | T27, V19–V21, O05. |
| Security system and reliable permissions. | 4–6, 18–19. | T01–T10, T22, V14–V15, O01. |
| Everything free of new paid subscriptions. | 1, 20, 22. | T03, T25–T26; deployment/cost decision evidence. |
| Add the earlier operational refinements. | 22. | WP11, WP22, WP31 and affected transaction tests. |
| Retain advanced analytics and additional trading options. | 9, 14, 22–23. | WP32–WP34 with prerequisite-specific acceptance. |
| Primary Master recovery, offline records, handover and opening data. | 18, 24–25. | O01–O05. |
| Combine everything into one implementable document. | This document; source map below. | Source-section, screen, table-content and test-ID coverage checks. |

### Source-section reconciliation

All sections of both review documents are accounted for below. Owner screen criteria are combined by screen ID; original tests keep their T/V IDs, Owner tests receive W IDs, and final conversation checks receive O IDs. Superseded design/cost/exclusion alternatives are resolved in chapter 1 rather than silently implemented.

| Source section | Subject | Consolidated chapter |
|---|---|---|
| S1 1 | My assessment | 2 |
| S1 2 | Evidence and completeness | 2 |
| S1 3 | Findings to resolve before launch | 3 |
| S1 4 | Recommended five-window access model | 4 |
| S1 5 | Primary Master café and employee switching | 5 |
| S1 6 | Login through account exit — all authentication screens | 6 |
| S1 7 | Primary Master — all 26 module screens | 7 |
| S1 8 | Normal Master — complete difference review | 8 |
| S1 9 | Owner — all 18 screens | 9 |
| S1 10 | Café Operations — all seven dedicated screens and fifteen modules | 10 |
| S1 11 | Employee / Staff — all nine screens | 11 |
| S1 12 | A realistic plan for no paid subscriptions | 20 |
| S1 13 | Shared pages, settings and every cross-window control | 12 |
| S1 14 | Missing or incomplete options — what to build, and what to defer | 22 |
| S1 14A | Additional refinements after the main feature review | 22 |
| S1 15 | Transaction, security and recovery behaviour to make explicit | 18 |
| S1 16 | Usability, performance and maintenance | 19 |
| S1 17 | Full journey release verification | 24 |
| S1 18 | Prioritised implementation sequence | 23 |
| S1 19 | Review closure and the stopping point | 25 |
| S1 20 | Whole-app business requirements — charts, attendance, reports and daily operations | 13 |
| S1 20A | What is already documented, and what remains unproven | 13 |
| S1 20B | Business capability checklist across the whole app | 13 |
| S1 20C | Chart catalogue and behaviour | 14 |
| S1 20D | Attendance, leave and payroll connection — detailed requirements | 15 |
| S1 20E | Report catalogue the business should be able to use | 16 |
| S1 20F | Controls that should work consistently on every relevant page | 12 |
| S1 20G | How I would sequence the improvements | 23 |
| S1 21 | Implementation requirements: preserve the design and complete the behaviour | 1 |
| S1 21A | Design and scope boundaries | 1 |
| S1 21B | Required behaviour of the interface | 12 |
| S1 21C | Passwords, account holds and café switching | 6 |
| S1 21D | GPS/selfie attendance and the daily calendar | 15 |
| S1 21E | QR behaviour, expiry and placement | 17 |
| S1 21F | Automatic updates, own-server migration and recovery | 21 |
| S1 21G | Performance and security acceptance targets | 19 |
| S1 21H | Release tests for the latest requirements — not yet executed | 24 |
| S1 21I | Implementation order and required project material | 23 |
| S2 1 | What I would want as the café owner | 9 |
| S2 2 | Concrete Owner access gaps to resolve | 3 |
| S2 3 | The most valuable missing or insufficiently specified workflows | 9 |
| S2 4 | The Owner home page I would use | 9 |
| S2 5 | Complete coverage of the existing 18 Owner screens | 9 |
| S2 6 | Shared operational options the Owner still needs | 9 |
| S2 7 | Calculations and labels I would insist on | 14 |
| S2 8 | Owner permissions I would recommend | 4 |
| S2 9 | Navigation, reports and daily routine | 16 |
| S2 10 | Optional additions after the essentials work | 22 |
| S2 11 | What to verify with an Owner test account | 24 |
| S2 12 | Implementation priority and final Owner opinion | 23 |

### Source integrity and verification limits

The original R1/R2 documents remain the as-built evidence source. Their architectural claims, representative API list and schema/test counts are retained as baseline context; this consolidated specification is not an invented reconstruction of unprovided source code. R1 repeats inside R2 and is not independent corroboration. No new API path or schema is asserted as implemented merely because it would be useful.

External provider facts are time-sensitive. Commercial-use eligibility, hosting sleep, SMTP restrictions, database capacity and Node runtime status were rechecked against official sources during consolidation on 21 September 2026; earlier review observations dated 19 September are retained as historical context. Recheck the selected services at deployment. Workflow examples from other products do not require purchasing or installing those products.

### External references retained from the discussion

- [Camera policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/camera)
- [Geolocation policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/geolocation)
- [OWASP's authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [Vercel Hobby documentation](https://vercel.com/docs/plans/hobby)
- [Render Free documentation](https://render.com/docs/free)
- [Atlas Free limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/)
- [Pages pricing](https://developers.cloudflare.com/pages/functions/pricing/)
- [Pages limits](https://developers.cloudflare.com/pages/platform/limits/)
- [ClamAV resource guidance](https://docs.clamav.net/manual/Installing/Docker.html)
- [Sending guide](https://developers.google.com/workspace/gmail/api/guides/sending)
- [API quotas](https://developers.google.com/workspace/gmail/api/reference/quota)
- [Node release status](https://nodejs.org/en/about/previous-releases)
- [Apple enrollment](https://developer.apple.com/programs/enroll/)
- [Lightspeed documents training users whose practice transactions are separated from actual customer orders in most reporting](https://k-series-support.lightspeedhq.com/hc/en-us/articles/10630440970779-Training-POS-users)
- [Zoho documents permission-controlled visibility of expected stock, discrepancy review and approval](https://www.zoho.com/us/inventory/help/items/stock-counts.html)
- [MDN's storage persistence and eviction guidance](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [W3C's guidance for complex images](https://www.w3.org/WAI/tutorials/images/complex/)
- [Metabase dashboard filters](https://www.metabase.com/docs/latest/dashboards/filters)
- [drill-through documentation](https://www.metabase.com/docs/latest/questions/visualizations/drill-through)
- [7shifts' schedule publication guide](https://kb.7shifts.com/hc/en-us/articles/4417514210067-How-to-publish-a-schedule)
- [7shifts documents percentage salary allocation across assigned locations and an audit history](https://kb.7shifts.com/hc/en-us/articles/52649365106579-Allocating-salaried-employee-wages-across-multiple-restaurant-locations)
- [MarginEdge distinguishes purchasing reports from inventory-informed cost reporting](https://help.marginedge.com/hc/en-us/articles/360057328094-Understanding-Your-Costs-with-the-Reports-in-MarginEdge)
- [OWASP's password-reset guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
- [OWASP session-management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [MDN Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API)
- [DENSO WAVE QR sizing guidance](https://www.qrcode.com/en/howto/code.html)
- [service-worker lifecycle](https://web.dev/articles/service-worker-lifecycle)
- [Android in-app updates](https://developer.android.com/guide/playcore/in-app-updates)
- [Windows App Installer updates](https://learn.microsoft.com/en-us/windows/msix/app-installer/auto-update-and-repair--overview)
- [Apple app-update settings](https://support.apple.com/en-us/102629)
- [MongoDB replica-set elections](https://www.mongodb.com/docs/manual/core/replica-set-elections/)
- [Core Web Vitals thresholds](https://web.dev/articles/vitals)
- [MarginEdge documents selecting accessible restaurants and comparing/exporting their P&L side by side](https://help.marginedge.com/hc/en-us/articles/17803136151443-P-L-Multi-Unit-Side-by-Side-Comparison)
- [MarginEdge's theoretical-usage documentation provides an example of comparing expected use with inventory-based observations](https://help.marginedge.com/hc/en-us/articles/360015329433-Getting-Started-with-Theoretical-Usage-Reporting)
- [MarginEdge documents distinct labour access roles and includes salaried staff in its reporting workflow](https://help.marginedge.com/hc/en-us/articles/360056272154-Getting-started-with-Labor-in-MarginEdge)
- [OWASP MFA recovery](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)
