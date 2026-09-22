# Zamorin Café ERP — Primary Master Programme
## Updated: 13 September 2026 | Status: PRE-STAGE-01 AUTHORISED

---

## TERMINOLOGY REGISTRY (Authoritative — All Documents and Prompts Must Use These)

| Correct Term | Incorrect Form | Notes |
|---|---|---|
| FSSAI | FASSI | Food Safety and Standards Authority of India |
| FoSCoS | FOSCOS | Food Safety Compliance System |
| GSTIN | GST Number | Official identifier |
| DPDP | PDPB | Digital Personal Data Protection Act 2023 / Rules 2025 |
| Zamorin Corporate Report Standard — APA 7 Inspired | APA 7 / APA compliance | We are not an academic publisher |
| Sl. No. | S.No / Sr. No / # | Universal serial number column label |
| Export Centre | Export Dialog / Download Popup | The modal export manager |
| ZAMORIN ERP | Zamorin ERP folder / downloads | The authorised device export folder |

---

## PROGRAMME STATUS SUMMARY

### Legacy Programme — Completed Stages (Frozen, Do Not Modify)

| Stage | Title | Status |
|---|---|---|
| Stage 01 | Base Application Foundation | FROZEN |
| Stage 02 | Master Workspace | FROZEN |
| Stage 03 | Owner Portal | FROZEN |
| Stage 04 | Café Admin Portal | FROZEN |
| Stage 05 | Expense & Permission System | FROZEN |
| Stage 06 | Department Orders | FROZEN |
| Stage 07 | Revenue Share | FROZEN |
| Stage 08 | Responsive UI | FROZEN |
| Stage 09 | Authentication Hardening | FROZEN |
| Stage 10 | Safe Post-Release Operations | FROZEN — CERTIFIED |

### New Programme — Stages to Build (In Order)

| Stage | Title | Priority |
|---|---|---|
| **Stage 01** | Universal Export + Print Engine | P0 — Build First, Freeze First |
| **Stage 02** | Universal QR Engine | P0 — Reusable Infrastructure |
| **Stage 03** | Café Registration + Onboarding + Readiness | P0 — Unfinished Work Formally Attached |
| **Stage 04** | Employee Registration + Onboarding + Readiness | P0 |
| **Stage 05** | Hardware Bridge + Device Integration | P1 |
| **Stage 06** | POS + Order Management | P1 |
| **Stage 07** | Inventory + Procurement | P1 |
| **Stage 08** | Finance + GST + Statutory Invoicing | P1 |
| **Stage 09** | Payroll + Statutory Compliance | P1 |
| **Stage 10** | Reporting + Analytics + Dashboards | P2 |

---

## ANTI GRAVITY IMPLEMENTATION RULE (Applies to Every Stage)

Before writing any code for any stage, Anti Gravity must:

1. Audit what already exists in the codebase for that stage.
2. List what is complete, what is partial, what is missing.
3. Preserve all completed and working functionality.
4. Extend and complete — never rebuild or delete working code.
5. Only then implement what is missing.

This is non-negotiable. Every Anti Gravity prompt must include this audit-first instruction.


---

# STAGE 01 — UNIVERSAL EXPORT + PRINT ENGINE
## Priority: P0 | Must Be Completed and Frozen Before Any Other Stage

### 01.1 — Export Formats: PDF and Excel Only

The user-facing Universal Export Engine supports exactly two formats:

| Format | Extension | Standard |
|---|---|---|
| PDF | .pdf | Zamorin Corporate Report Standard — APA 7 Inspired |
| Excel | .xlsx | Zamorin Corporate Workbook Standard |

All other formats (CSV, JSON, XML, plain text) are permanently removed from user-facing export. They may remain internally for system integrations only, never exposed in any UI.

One shared Universal Export Service sits behind every module. No module implements its own export independently.

---

### 01.2 — Export Centre Modal (Universal)

Every export in the system flows through the Export Centre popup. This replaces direct browser download triggers.

**Flow:**
```
User triggers export
    ↓
Generate preview (PDF page layout / Excel table preview)
    ↓
Export Centre Modal opens (centred)
    ↓
User configures and confirms
    ↓
File written to chosen destination
```

**Export Centre Modal fields:**

| Field | Detail |
|---|---|
| File Type | Radio: ○ PDF  ○ Excel |
| File Name | Official ID pre-filled (e.g. DO-2026-000128) — editable |
| ✏ Rename | Allows user to set display name; official ID preserved in metadata |
| Save To | Current destination shown (e.g. ZAMORIN ERP / Documents/ZAMORIN ERP) |
| Change Location | Opens folder picker |
| Open after export | Checkbox |
| Export button | Confirms and saves |
| Cancel button | Dismisses without saving |
| Preview panel | Shows PDF layout or Excel table preview before confirming |

Print must also be available from the Export Centre without requiring a separate download:

| Action | Behaviour |
|---|---|
| Preview | Shows full document preview |
| Print | Sends to system print dialog — no download generated |
| Save PDF | Saves .pdf to chosen destination |
| Save Excel | Saves .xlsx to chosen destination |

---

### 01.3 — Official Unique ID Filenames (Universal Naming Rule)

Every exported file must carry the official document ID as its filename. The system must never default to generic names.

**Prohibited filenames:**
- download.pdf
- report(1).pdf
- export.xlsx
- file-final-2.xlsx
- Untitled.pdf

**Required naming patterns:**

| Document Type | Pattern | Example |
|---|---|---|
| Department Order | DO-{YYYY}-{000000} | DO-2026-000128.pdf |
| Invoice | INV-{YYYY}-{000000} | INV-2026-000058.pdf |
| Purchase Order | PO-{YYYY}-{000000} | PO-2026-000041.pdf |
| Employee Record | EMP-ZC-{000000} | EMP-ZC-000521.pdf |
| Payslip | PAYSLIP-EMP-{000000}-{YYYY}-{MM} | PAYSLIP-EMP-000521-2026-08.pdf |

**Multi-record / range reports (no single transaction ID):**

Format: EXP-{CafeID}-{ModuleCode}-{YYYYMM}-{000000}

Example: EXP-ZC01-ATT-202608-000041.xlsx

This Export ID is stored in the Export Audit database and appears on the document itself.

---

### 01.4 — Duplicate File Prevention

Before every save, the system checks whether the destination file already exists.

**If file does not exist:** Save immediately.

**If file already exists:** Show popup:

```
A document with Official ID DO-2026-000128 already exists.

○ Replace Existing
○ Save New Revision
○ Choose Different Name
  Cancel
```

The system must never auto-append (1), (2), (3) silently.

---

### 01.5 — User-Editable Filename with Preserved Official ID

The user may rename the visible file in the Export Centre. However:
- The official document ID is always preserved in file metadata.
- The official ID always appears on the PDF/Excel document itself.
- The Export Audit log always records the official ID regardless of what the user renamed the file to.

Example: User renames to "Kitchen Order September" — the PDF footer and metadata still show Official Export ID: DO-2026-000128.


---

### 01.6 — Export Destination Manager

**Problem being solved:** Current behaviour triggers an immediate browser download, causing duplicate files and a cluttered Downloads folder.

**New behaviour:** Every export shows the Export Centre first. The destination is always chosen deliberately.

#### Platform behaviour:

| Platform | Destination Mechanism |
|---|---|
| Native Android | Storage Access Framework (ACTION_OPEN_DOCUMENT_TREE). First use: prompt user to select/create ZAMORIN ERP folder. App remembers authorised path. |
| Desktop browser (supporting showDirectoryPicker) | System folder picker. Recommended default: Documents/ZAMORIN ERP |
| Restricted browser / device | Native Save As / Share / Files flow. Label shows: "Browser default download location will be used." Never falsely claim the file was saved to ZAMORIN ERP. |
| PWA | Same as desktop browser, using File System Access API where supported |

The system must never make false claims about where a file was saved when the browser did not grant folder access.

#### ZAMORIN ERP Folder Structure (created automatically after permission granted):

```
ZAMORIN ERP/
├── Exports/
│   └── {Organisation}/
│       └── {Cafe}/
│           ├── HR/
│           ├── Payroll/
│           ├── Attendance/
│           ├── Orders/
│           ├── Inventory/
│           ├── Finance/
│           ├── Reports/
│           └── Compliance/
├── Invoices/
├── Payslips/
├── Statements/
└── Other Documents/
```

The app creates this hierarchy automatically after the user grants folder permission. Every export is routed to the correct subfolder based on module.

**Default destination shown in Export Centre:** ZAMORIN ERP (or the authorised path)
**User can always change:** Change Location button in every Export Centre instance.

---

### 01.7 — Export History

A dedicated Export History record is created for every export action.

**Export History table columns:**

| Sl. No. | Export ID | Document | Format | Generated By | Café | Generated At | Destination | Status | Actions |
|---|---|---|---|---|---|---|---|---|---|

**Actions per record:**
- View (open preview)
- Download Again
- Print
- Verify (opens verification endpoint if document has QR)

Export History reduces unnecessary regeneration of identical reports. If a report was already exported today, the system shows it in history before generating a duplicate.

---

### 01.8 — Export Permissions

Not every user can export everything. Export permissions are distinct from view permissions.

**Permission levels required:**

| Permission | Scope |
|---|---|
| View | See data on screen |
| Export PDF | Download as PDF |
| Export Excel | Download as Excel |
| Print | Send to printer |
| View Sensitive Fields | See unmasked PAN, bank account, Aadhaar |
| Export Sensitive Fields | Include sensitive fields in export |

Payroll, employee bank details and statutory records require elevated export permission. This must be enforced at the API level, not merely by hiding buttons.

---

### 01.9 — Data Masking in Exports

Sensitive fields are masked by default in all exports unless the user holds Export Sensitive Fields permission.

| Field | Masked Display |
|---|---|
| Bank Account Number | XXXXXX7821 |
| PAN | ABCPX9999X → XXXXX9999X |
| Aadhaar | XXXX-XXXX-1234 |
| UAN | Masked except last 4 |
| Mobile (in some contexts) | XXXXXX1234 |

Masking applies equally to PDF, Excel and on-screen display for users without the appropriate permission.

---

### 01.10 — Export Audit Trail

Every export event is recorded immutably:

| Field | Recorded |
|---|---|
| Who | User ID, name, role |
| What | Document type, document ID, module |
| Café | Café ID, café name |
| Organisation | Organisation ID |
| Filters applied | Date range, status, department, etc. |
| Record count | Number of records in export |
| Format | PDF / Excel |
| Filename | As saved |
| Destination type | ZAMORIN ERP / Browser / Share |
| Generated timestamp | ISO 8601 with IST offset |
| Status | Success / Failed |
| Re-export | Whether this is a repeat export of the same document |
| Print event | Whether print was triggered |
| Template version | Which report template version generated this export |


---

### 01.11 — Zamorin Corporate Report Standard — APA 7 Inspired (PDF)

This is the official PDF standard for all Zamorin Cafe ERP exports. It is NOT claimed as strict APA 7 compliance. It is a corporate document standard inspired by APA 7 formatting principles.

#### Paper
- A4 only
- Portrait by default
- Landscape automatically for genuinely wide tables — still A4

#### Branding Header (every PDF page 1)
| Element | Required |
|---|---|
| Company logo | Yes |
| Legal Company Name | Yes |
| Café / Branch Name | Yes |
| Report Title | Yes |
| Official Document / Report ID | Yes |

#### Metadata Block (below header)
| Element | Included Where Relevant |
|---|---|
| Report date range | Yes |
| Generated date/time (IST) | Yes |
| Generated by (name + role) | Yes |
| Organisation ID | Yes |
| Café ID | Yes |
| Department | Where relevant |
| Applied filters | Yes |
| Status | Yes |

#### Narrative / Report Sections
- Font: Times New Roman, 12 pt
- Spacing: Double-spaced
- Alignment: Justified
- Clear heading hierarchy (H1 / H2 / H3)
- Professional paragraphs

#### Tabular Sections
- Font: Times New Roman, 9–11 pt depending on table density
- Spacing: Single or controlled line spacing
- Proper row padding — no clipped content
- Table headings repeat across pages
- Numeric alignment (right-aligned)
- Decimal alignment
- Predictable column widths
- First column is always Sl. No. (sequential, 1 2 3 4 5...)

#### Serial Number Rule (Universal)
Every line-item table must begin with:

| Sl. No. | Item | Qty | Unit | Rate | Amount |
|---|---|---|---|---|---|
| 1 | Tea | 5 | Cup | ₹xx | ₹xx |
| 2 | Coffee | 4 | Cup | ₹xx | ₹xx |

Sl. No. is visual sequential order only. It is never a database ID, MongoDB ID or UUID.

#### Logo Watermark
Every official PDF carries the company/café logo as a background watermark:
- Centred on page
- Proportional scaling
- Low opacity (does not interfere with reading)
- Repeated appropriately across multi-page documents
- Automatically sourced from organisation branding configuration
- Fallback watermark if café-specific logo is absent
- Must look like a corporate document — not an image pasted beneath text

#### Modern PDF Contents (included intelligently per report type)
- Report title and subtitle
- Executive summary
- Metadata section
- Applied filters
- Reporting period
- Primary data table
- Totals, subtotals, grand total
- Percentages, variance where relevant
- Notes
- Approval status
- Generated-by information
- Authorised-by where required
- Generation timestamp
- Organisation ID, Café ID, Document ID
- Version / revision number
- Confidentiality classification
- Page number (e.g. Page 2 of 6)
- Verification QR (on high-value documents — see 01.13)

#### PDF Footer (every page)
Format: `Zamorin Café ERP • Café ID • Generated {date} {time} IST • Page {n} of {total} • {Confidentiality Level}`

Example: `Zamorin Café ERP • ZC-CAF-000001 • Generated 13 Sep 2026 00:32 IST • Page 2 of 6 • Confidential`

---

### 01.12 — Zamorin Corporate Workbook Standard (Excel / .xlsx)

Excel must not look like a raw database dump. Every .xlsx export is a professional corporate workbook.

#### Report Header Sheet or Header Block
| Element | Required |
|---|---|
| Logo | Yes |
| Company name | Yes |
| Café name | Yes |
| Report name | Yes |
| Report ID | Yes |
| Reporting period | Yes |
| Generated by | Yes |
| Generated date/time | Yes |

#### Data Sheet Formatting
- Column A is always Sl. No.
- Professional header row (bold, background colour)
- Filters enabled (AutoFilter)
- Freeze panes (header row frozen)
- Consistent borders
- Number formats: integer, decimal, currency (₹), percentage, date
- Text: wrapped for long content
- Alignment: numbers right, text left, headers centred
- Appropriate row height and column width (no truncated headings)
- Calculated totals row
- Subtotal rows where applicable
- Grand total row (bold, highlighted)

#### Print Configuration (inside the .xlsx)
- A4 paper size configured
- Defined print area
- Repeating header row across pages
- Portrait / landscape decision set
- Page scaling configured
- Header: Organisation / Café / Report Name
- Footer: Page {n} of {total} / Generated {date}
- Page numbering

#### Export Metadata Sheet (for larger / official exports)
Workbook has two sheets minimum:
- **Sheet 1 — Report Information**
- **Sheet 2 — Data**

Report Information sheet contains:
| Field | Value |
|---|---|
| Report ID | |
| Report Name | |
| Organisation | |
| Café | |
| Module | |
| Reporting Period | |
| Applied Filters | |
| Generated By | |
| Generated At | |
| Record Count | |
| Export Version | |
| Confidentiality Classification | |
| Template Version | |

For simple single-page documents (e.g. a single department order), one sheet is sufficient.

---

### 01.13 — Verification QR on Official Documents

For high-value official documents, a small QR code appears in the footer area.

**QR content:** Points to a protected server-side verification endpoint only.

**Verification page displays:**
- Document ID
- Issuer (organisation + café)
- Generation date
- Current validity / revision status

**QR must never contain:** confidential document data, personal information, or authentication tokens.

**Tamper Evidence:** Official exports store internally:
- Export ID
- Report version
- Generation timestamp
- Document hash (SHA-256)

This allows determination of whether a downloaded official report has been subsequently modified.

---

### 01.14 — Report Template Versioning

Every PDF and Excel template carries a version identifier:

Example: `Zamorin Universal Report Template v1.0`

When the template is improved: `v1.1`, `v1.2`

The Export Audit Trail records which template version generated each historical report. This is important for future audit and compliance review.

---

### 01.15 — GST Statutory Invoice — Separate Template

GST Tax Invoices are a distinct controlled template. They are not the same as general ERP reports.

GST invoices require statutory particulars per CBIC rules:
- Supplier name, address, GSTIN
- Invoice serial number and date
- Recipient details (where applicable)
- HSN / SAC codes
- Description of goods/services
- Quantity and unit
- Taxable value
- GST rate and tax amount (CGST / SGST / IGST separately)
- Total invoice value
- Place of supply
- Signature / authorisation

The Zamorin Universal Report Standard and the GST Statutory Invoice Template share branding but remain **separate controlled templates**. They must never be merged or confused.


---

# STAGE 02 — UNIVERSAL QR ENGINE
## Priority: P0 | Reusable Infrastructure — Built Once, Used Everywhere

### 02.1 — Purpose

The Universal QR Engine is a single shared service that generates, stores, validates, rotates and revokes QR codes for every module that needs them:
- Café login QR (Stage 03)
- Employee QR (Stage 04)
- Document verification QR (Stage 01)
- Future: table QR, menu QR, delivery QR

Building this as shared infrastructure in Stage 02 prevents every module from building its own QR implementation.

### 02.2 — QR Security Rules (OWASP-Aligned)

These rules are non-negotiable for every QR generated by the system:

| Rule | Requirement |
|---|---|
| QR content | Opaque / non-guessable reference only (e.g. signed token or UUID) |
| No secrets in QR | Password, session token, email, PAN, bank details must NEVER appear in any QR |
| No sequential IDs | QR must not contain guessable sequential database IDs |
| Server-side resolution | Backend resolves the opaque reference to the actual record |
| Object-level authorisation | Backend enforces that the resolved record matches the requesting user's permissions |
| Expiry | QR tokens carry expiry where appropriate |
| Revocation | Revoked QR tokens are rejected server-side regardless of what the QR contains |
| Regeneration | Regenerating a QR invalidates the previous opaque reference |
| Scan logging | Every QR scan is logged: timestamp, device, result |

### 02.3 — QR Record Structure (Universal)

Every QR record in the system contains:

| Field | Description |
|---|---|
| QR ID | Internal system ID |
| QR Type | CAFE_LOGIN / EMPLOYEE / DOCUMENT_VERIFY / TABLE / etc. |
| Entity ID | The café ID, employee ID, document ID it belongs to |
| Opaque Reference | The non-guessable token encoded in the QR |
| QR Status | Active / Suspended / Regenerated / Revoked |
| QR Created On | Timestamp |
| Last Scanned | Timestamp |
| Scan Count | Integer |
| Last Scanner / Device | Device info if available |
| Expiry | Date/time or null if permanent |

### 02.4 — QR Actions (Universal)

| Action | Behaviour |
|---|---|
| Regenerate QR | Creates new opaque reference, invalidates old one, updates QR image |
| Download QR | Downloads printable QR image |
| Print QR | Opens print dialog with QR card layout |
| Copy Login Link | Copies the URL (not the raw token) to clipboard |
| Suspend QR | Temporarily disables — scans rejected |
| Revoke QR | Permanently disabled — cannot be re-activated |

### 02.5 — Printable QR Card

Every QR that is user-facing (café login, employee) must be printable as a formatted card:
- Organisation logo
- Café name / Employee name
- QR code (large, clear)
- Short descriptive label (e.g. "Scan to access Zamorin Café ERP — [Café Name]")
- Official ID below QR
- Print date
- "Do not share this QR" notice where appropriate

---

# STAGE 03 — CAFÉ REGISTRATION + ONBOARDING + STORE READINESS
## Priority: P0 | Formally Attached Unfinished Work + New Requirements

### 03.1 — Registration Flow

```
Organisation → Café Registration → Official Café ID → Café Profile →
Unique Café URL → Unique Café QR → Readiness Verification →
Activation → Café-Specific Login
```

### 03.2 — Official Café ID

Format: ZC-CAF-{000001} (sequential, zero-padded, system-assigned)

The Official Café ID is permanent and immutable once assigned.

### 03.3 — Unique Café Login URL

Format: `zamorin.app/cafe/{secure-cafe-reference}/login`

Where `{secure-cafe-reference}` is the opaque non-guessable reference from the QR Engine (Stage 02), not the sequential Café ID.

**The login page at that URL shows:**
```
Zamorin Café ERP
[Café Name]
[Location / Branch]
Organisation ID / Café ID
Email        [________________]
Password     [________________]
             [Login]
```

The QR and URL identify the café. Password authenticates the person. These are two separate responsibilities.

### 03.4 — Café Registration Wizard (12 Sections)

#### Section A — Basic Establishment Identity
| Field | Notes |
|---|---|
| Legal business name | |
| Trade name / café name | |
| Branch name | |
| Café/restaurant type | See establishment categories below |
| Organisation association | Parent org ID |
| Establishment category | Café / Restaurant / Bakery / QSR / Cloud Kitchen / Canteen / Food Court Outlet / Takeaway / Catering Operation / Other |
| Veg / Non-veg / Mixed | |
| Date business started | |
| Opening date | |
| Operational status | |
| Branch code | |
| Internal café ID | |
| Official Café Unique ID | System-assigned ZC-CAF-{n} |
| Store number | |
| Parent organisation ID | |

#### Section B — Ownership / Legal Constitution
| Field | Notes |
|---|---|
| Business constitution | Proprietorship / Partnership / LLP / Pvt Ltd / Public Ltd / Trust / Society / Cooperative / Other |
| Legal owner name | |
| Partners / Directors | Multi-entry |
| Authorised signatory | |
| PAN | |
| CIN / LLPIN | Where applicable |
| Incorporation / Registration number | |
| Incorporation date | |
| Registered office address | |
| Udyam Registration Number | If applicable |
| Udyam registration date | If applicable |
| Enterprise classification | Micro / Small / Medium |

#### Section C — Contact Information
**Primary Business Contact:**
- Contact person, Designation, Mobile, Alternate mobile, WhatsApp, Email, Secondary email

**Emergency Contact:**
- Name, Role, Phone, Alternate number

**Official Communication Preference:**
- Email / SMS / WhatsApp / In-app notification

#### Section D — Premises and Location Profile
| Field | Notes |
|---|---|
| Building / premises name | |
| Door number, Floor, Street, Locality, Landmark | |
| Village / Town, City, District, State, PIN, Country | |
| Latitude, Longitude | |
| Google Maps / map location link | |
| Time zone | |
| Premises ownership | Owned / Rented / Leased / Franchise-operated |
| Lease start date / end date | If applicable |


#### Section E — Tax and Statutory Registration

All fields in this section are conditional. Not every establishment has every registration.

**GST Registration:**
| Field | Condition |
|---|---|
| GST Registered? | Yes / No |
| GSTIN | If Yes |
| Legal name as per GST | If Yes |
| Trade name as per GST | If Yes |
| GST registration date | If Yes |
| State code | If Yes |
| Taxpayer type | Regular / Composition / etc. |
| Principal place of business | If Yes |
| Additional place of business | If Yes |
| GST certificate upload | If Yes |
| GST effective date | If Yes |
| GST status | Active / Cancelled / Suspended |

**FSSAI Registration / Licence:**
| Field | Condition |
|---|---|
| FSSAI applicable? | Yes / No |
| Licence type | Registration / State Licence / Central Licence |
| FSSAI licence number | If applicable |
| Kind of business | |
| Issuing authority | |
| Valid from | |
| Valid until | |
| Certificate upload | |
| Renewal reminder | Auto-configured from Valid Until date |

**FSSAI Expiry Alert Engine (mandatory):**
Alerts at: 90 days → 60 days → 30 days → 15 days → 7 days → Expired

Apply the same expiry alert engine to ALL licences and permits in the system.

**Other Registrations (each configured as: Applicable / Not Applicable / Pending):**
- Local trade licence
- Shops & Establishments registration
- Udyam / MSME
- Fire NOC
- Pollution / environment permission
- Signage licence
- Music licence
- Liquor licence
- Municipal registration
- Professional tax registration
- Labour registrations
- Other state / local licences

These must never be made blindly mandatory. Each is independently configured.

#### Section F — Financial and Banking Configuration

| Field | Notes |
|---|---|
| Account holder name | |
| Bank name | |
| Branch | |
| Account number | Masked in ordinary screens |
| IFSC | |
| Account type | Current / Savings |
| UPI ID | |
| Merchant / payment IDs | |
| Settlement account | |
| Cash opening balance | |
| Accounting year | |
| Financial year | |
| Currency | INR default |
| Tax rounding methodology | |

Sensitive banking fields are permission-controlled. Only users with View Sensitive Fields permission see unmasked values.

#### Section G — Café Operational Setup

| Field | Options |
|---|---|
| Working days | Configurable per day |
| Opening time | |
| Closing time | |
| Split shifts | Yes / No |
| Weekly holidays | |
| Public holiday policy | |
| Service modes | Dine-in / Takeaway / Delivery / Drive-through / Catering / Online ordering |
| Service type | Table service / Counter service |
| Seating capacity | |
| Number of tables | |
| Floor / zone structure | |
| Kitchen sections | |
| Preparation stations | |
| KOT routing | |
| Service charge policy | |
| Cancellation policy | |
| Refund policy | |
| Discount policy | |
| Order numbering scheme | |

#### Section H — Inventory and Procurement Setup (Optional at Onboarding)

| Field | Notes |
|---|---|
| Main store | |
| Sub-store | |
| Kitchen store | |
| Dry storage | |
| Refrigerator / freezer locations | |
| Default suppliers | |
| Stock valuation settings | |
| Units of measurement | |
| Reorder policy | |
| Opening stock import | |
| Batch / expiry tracking | |
| Waste / spoilage policy | |

#### Section I — Hardware Readiness

Record what the café actually has (used later in Stage 05 — Hardware Bridges):

| Hardware | Present? |
|---|---|
| POS terminals | |
| Android tablets | |
| Desktop / laptop | |
| Thermal printer (58mm / 80mm) | |
| Kitchen printer | |
| A4 printer | |
| Barcode scanner | |
| QR scanner | |
| Biometric device | |
| Cash drawer | |
| Customer display | |
| Weighing scale | |
| Label printer | |
| CCTV integration | |
| Internet connection | |
| Backup internet | |
| Router / network | |
| Power backup | |

#### Section J — Branding

Captured once during registration and reused everywhere in the system:

| Field | Reused In |
|---|---|
| Company logo | PDF / Excel / Invoice / Reports / QR login page / Payslips / Orders / Certificates |
| Café logo | Same as above |
| Legal entity name | All official documents |
| Trade name | All customer-facing documents |
| Primary brand colour | UI theming |
| Address | All documents |
| Telephone | All documents |
| Email | All documents |
| Website | All documents |
| Invoice footer text | Invoices |
| Authorised signatory name | Official documents |
| Authorised signatory designation | Official documents |

Branding configuration must feed every module. No module should have a different format or pull branding from a different source.

#### Section K — Unique Café QR + URL (from Stage 02 QR Engine)

System generates automatically after registration:

| Item | Value |
|---|---|
| Café Official ID | ZC-CAF-000001 |
| Secure Public Café Reference | Random non-sequential opaque identifier |
| Café Login URL | zamorin.app/cafe/{reference}/login |
| QR Code | Generated image |
| Printable Café Login QR Card | Printable layout |
| QR Status | Active / Suspended / Regenerated / Revoked |
| QR Created On | |
| Last Scanned | |
| Scan Count | |
| Last Scanner / Device | |

Available actions: Regenerate QR / Download QR / Print QR / Copy Login Link

QR regeneration invalidates the previous opaque reference immediately.

#### Section L — Readiness Verification

Checklist verified before café can go Active. See 03.5 below.

---

### 03.5 — Café Readiness Engine (Lifecycle States)

A newly registered café must not simply become "Active." It passes through controlled lifecycle states:

| State | Meaning |
|---|---|
| DRAFT | Registration incomplete |
| CONFIGURING | Data being entered |
| VERIFICATION REQUIRED | Mandatory compliance or setup missing |
| READY FOR TESTING | Configuration complete — testing may begin |
| TEST MODE | Active testing phase (see test checklist below) |
| READY FOR ACTIVATION | All tests passed |
| ACTIVE | Fully operational |

**Test Mode checklist (all must pass before READY FOR ACTIVATION):**
- QR login test
- Employee login test
- POS test
- Printer test
- Order test
- Inventory test
- Report test
- PDF export test
- Excel export test
- Role boundary test

Skipping the readiness engine is not permitted.


---

# STAGE 04 — EMPLOYEE REGISTRATION + ONBOARDING + READINESS
## Priority: P0 | Audit existing implementation first — extend, do not rebuild

### 04.1 — Employee Registration Sections

#### Section 1 — Personal Identity
| Field | Notes |
|---|---|
| Employee ID | System-assigned: EMP-ZC-{000001} |
| Title | Mr / Ms / Mrs / Dr / etc. |
| Full legal name | |
| Preferred name | |
| Date of birth | |
| Gender | Where legitimately required |
| Photograph | Upload |
| Nationality | |
| Marital status | Where relevant |
| Permanent address | |
| Current address | |
| Mobile | |
| Alternate mobile | |
| Personal email | |

#### Section 2 — Emergency Contact
| Field | Notes |
|---|---|
| Emergency contact name | |
| Relationship | |
| Mobile | |
| Alternate mobile | |

#### Section 3 — Employment Details
| Field | Notes |
|---|---|
| Employment type | Full-time / Part-time / Contract / Casual |
| Café | Assigned café |
| Department | |
| Designation | |
| Reporting manager | |
| Date of joining | |
| Effective date | |
| Probation period | |
| Confirmation date | |
| Contract start / end dates | If applicable |
| Working pattern | |
| Shift | |
| Weekly off | |
| Employee status | Active / Probation / Confirmed / Suspended / Notice Period / Separated / Terminated / Retired / Rehire Eligible |

#### Section 4 — Payroll Configuration
| Field | Notes |
|---|---|
| Wage / salary structure | |
| Payment method | Bank / Cash / Cheque |
| Bank name | Masked in ordinary screens |
| Account number | Masked |
| IFSC | Masked |
| Payroll group | |
| Statutory applicability | |

**EPF (where applicable):**
- UAN (Universal Account Number)
- PF status
- Previous employment / UAN linkage status

**ESI (where applicable):**
- ESIC applicability (not hard-coded — determined by establishment threshold and jurisdiction)
- Insurance number
- Registration status

#### Section 5 — Documents
| Document | Notes |
|---|---|
| Appointment letter | Upload |
| Employment agreement | Upload |
| Education certificates | Multi-upload |
| Experience certificates | Multi-upload |
| Licences / certifications | Upload with expiry date |
| Statutory documents | As legitimately required |
| Bank proof | Upload |
| Uploaded document expiry dates | Alert engine applied |

#### Section 6 — Operational Access
| Field | Notes |
|---|---|
| Access role | STAFF / CAFE_ADMIN / OWNER / MASTER |
| Assigned café(s) | |
| POS rights | Yes / No / Limited |
| Cash handling rights | |
| Approval authority | |
| Inventory privileges | |
| Attendance method | Biometric / QR / Manual / App |
| Biometric / device association | |
| Employee QR | Generated from Stage 02 QR Engine |
| Employee login provisioning | System account created |

#### Section 7 — Assets
| Asset | Notes |
|---|---|
| Uniform | Issued / size |
| ID card | Issued |
| Key | Issued / which key |
| Locker | Number |
| Laptop / tablet | Asset tag |
| POS device | |
| Other asset assignments | |

#### Section 8 — Training
| Field | Notes |
|---|---|
| Induction | Date completed |
| Food safety training | Date + certificate + expiry |
| POS training | |
| Hygiene training | |
| Workplace safety | |
| Training completion certificates | Upload |
| Renewal / expiry tracking | Alert engine applied |

#### Section 9 — Employee Lifecycle
| Status | Meaning |
|---|---|
| Active | Currently employed |
| Probation | In probation period |
| Confirmed | Probation complete |
| Suspended | Temporarily suspended |
| Notice Period | Serving notice |
| Separated | Employment ended (resignation / mutual) |
| Terminated | Terminated by employer |
| Retired | Retired |
| Rehire Eligible | Can be re-onboarded |

---

### 04.2 — Employee Onboarding Checklist

Every employee must pass a readiness checklist before activation in payroll / attendance:

| Item | Status |
|---|---|
| Personal details | ✓ / Pending |
| Employment details | ✓ / Pending |
| Bank details | ✓ / Pending |
| Required documents | ✓ / Pending |
| Payroll configuration | ✓ / Pending |
| Department | ✓ / Pending |
| Shift | ✓ / Pending |
| Manager | ✓ / Pending |
| System account | ✓ / Pending |
| Permissions | ✓ / Pending |
| Attendance enrolment | ✓ / Pending |
| Training (induction minimum) | ✓ / Pending |

Final state: **Employee Ready for Activation**

An incomplete employee must not appear in payroll runs or attendance sheets.

---

### 04.3 — Data Privacy in Employee Enrollment (DPDP Act 2023 / Rules 2025)

India's Digital Personal Data Protection Rules 2025 (notified November 2025) require clear notices describing what personal information is collected and why.

The employee enrollment system must support:

| Requirement | Implementation |
|---|---|
| Purpose of each data field | Metadata on each sensitive field explaining why it is collected |
| Sensitive field permissions | Role-based — not every user sees another employee's bank / statutory data |
| Masked display | Default masking for bank account, PAN, Aadhaar, UAN |
| Access logging | Every view of sensitive field is logged |
| Data-retention status | Retention period configured per field category |
| Consent / notice record | Where legally required under DPDP Rules |
| Change audit | Who changed the field, when, previous value (masked) |

Not every employee should be able to view another employee's bank or statutory information. This is enforced at API level.


---

# CROSS-SYSTEM REQUIREMENTS
## These apply across all stages and must be implemented as shared infrastructure

---

## X.01 — Password Change — P0 Defect (Fix at Stage 01)

This is a P0 defect. It must be resolved before Stage 01 is considered complete.

A single universal Password Change component must be used across all role surfaces (MASTER, OWNER, CAFE_ADMIN, STAFF). Four separate implementations must not exist.

**Universal Change Password UI:**
```
Change Password

Current Password     [____________________] 👁
New Password         [____________________] 👁
Confirm New Password [____________________] 👁

Password Strength: [████████░░] Strong

Requirements:
✓ Minimum length (15 characters — single factor)
✓ Uppercase letter
✓ Lowercase letter
✓ Number
✓ Special character

[Change Password]   [Cancel]
```

**Mandatory behaviours:**
| Behaviour | Required |
|---|---|
| Show / hide password toggle (👁) | Yes — each field independently |
| Caps Lock warning | Yes |
| Current password validation (server-side) | Yes |
| New password / confirm match check | Yes |
| Password strength indicator | Yes |
| Requirements indicator (live feedback) | Yes |
| No password in logs | Yes — absolute requirement |
| Proper backend hashing (bcrypt / scrypt) | Yes |
| Rate limiting on change endpoint | Yes |
| Password history enforcement (where configured) | Yes |
| Revoke other sessions option | Yes |
| Audit event on successful change | Yes |
| Success / error feedback | Yes — clear user messaging |
| Keyboard and mobile accessibility | Yes |

**Password length policy (from certified Stage 10):**
- Single-factor / password-only: minimum 15 characters
- Authenticated MFA: minimum 8 characters (strictly for authenticated MFA workflows only)
- Maximum: 128 characters
- No forced composition rules (NIST SP 800-63B)
- Offline blocklist of compromised passwords

---

## X.02 — Universal Branding Configuration Feed

The Branding record captured during Café Registration (Section J) must feed every output in the system:

| Output | Branding Used |
|---|---|
| PDF reports | Yes — logo, legal name, café name |
| Excel workbooks | Yes — logo, legal name, café name |
| GST invoices | Yes — logo + statutory details |
| POS receipts (thermal) | Yes — café name, address |
| QR login page | Yes — café name, logo |
| Payslips | Yes — company name, logo, address |
| Department orders | Yes |
| Certificates | Yes |

No module pulls branding from a different source. One branding record, one source.

---

## X.03 — Universal Expiry Alert Engine

The same alert engine applies to all expiring items across the system:

**Alert schedule:** 90 days → 60 days → 30 days → 15 days → 7 days → Expired

**Applies to:**
- FSSAI licence / registration
- GST registration (if suspended / cancelled)
- Local trade licence
- Shops & Establishments registration
- Fire NOC
- Pollution / environment permission
- Music licence
- Liquor licence
- Any other registration with Valid Until date
- Employee licence / certification expiry
- Employee training renewal
- Employee document expiry
- Any document upload with an expiry date

Alerts go to: configured responsible user(s) + Master + Café Admin.

---

## X.04 — Universal Serial Number Rule

Every table in every module begins with Sl. No. as the first column.

| Rule | Specification |
|---|---|
| Column label | Sl. No. (always — never S.No, Sr.No, #, ID) |
| Value | Sequential integer: 1, 2, 3, 4, 5... |
| Basis | Visual sequential order of the current export |
| Not used for | Database ID, MongoDB _id, UUID, row reference |
| Continues according to | Final sorted export order |

This applies to: PDF exports, Excel exports, on-screen tables in every module.

---

## X.05 — Sensitive Field Masking (Universal)

| Field | Default Masked Display | Permission to Unmask |
|---|---|---|
| Bank account number | XXXXXX7821 | View Sensitive Fields |
| PAN | XXXXX9999X | View Sensitive Fields |
| Aadhaar | XXXX-XXXX-1234 | View Sensitive Fields |
| UAN | XXXXXXX1234 | View Sensitive Fields |
| ESIC number | Masked | View Sensitive Fields |
| Mobile (in some contexts) | XXXXXX1234 | View |

Masking applies on-screen, in PDF, and in Excel unless the user has explicit permission.

---

## X.06 — Audit Trail (Universal)

Every significant action in every module creates an immutable audit record:
- Who (user ID, name, role)
- What (action, entity type, entity ID)
- When (ISO 8601 timestamp with IST offset)
- Before value / After value (for edits)
- IP address / device
- Café / Organisation

Audit records are never deleted. They are retained per the data retention policy.

---

## X.07 — Export Preview Before Save (Universal)

Every export must show a preview before the file is saved:
- PDF: shows actual page layout
- Excel: shows table preview + workbook metadata summary

The preview is shown inside the Export Centre modal before the Export button is pressed.

---

# STAGE 01 IMPLEMENTATION CHECKLIST

Anti Gravity must complete all of the following before Stage 01 is declared frozen:

- [ ] Audit existing export implementation (exportGenerators.js, exportRoutes.js, invoicePdfGenerator.js, exportCentreModal.js, ExportHistory.js)
- [ ] Universal Export Service (one shared service behind all modules)
- [ ] Export Centre Modal (complete UI per spec 01.2)
- [ ] PDF export: Zamorin Corporate Report Standard (01.11)
- [ ] Excel export: Zamorin Corporate Workbook Standard (01.12)
- [ ] Serial number column universal (X.04)
- [ ] Logo watermark on all PDFs (01.11)
- [ ] APA 7 Inspired formatting (narrative + tabular rules) (01.11)
- [ ] Official ID filename rule (01.3)
- [ ] Export ID for multi-record reports (01.3)
- [ ] User-editable filename with preserved official ID (01.5)
- [ ] Duplicate file prevention popup (01.4)
- [ ] Export Destination Manager (01.6)
- [ ] ZAMORIN ERP folder structure (01.6)
- [ ] Android SAF integration (01.6)
- [ ] Export History (01.7)
- [ ] Export permissions (01.8)
- [ ] Data masking in exports (01.9)
- [ ] Export Audit Trail (01.10)
- [ ] PDF Verification QR on official documents (01.13)
- [ ] Tamper evidence hashing (01.13)
- [ ] Report Template Versioning (01.14)
- [ ] GST Statutory Invoice as separate template (01.15)
- [ ] Export Preview before save (X.07)
- [ ] Print without generating download (01.2)
- [ ] Password Change universal component — P0 defect fix (X.01)
- [ ] Export Metadata Sheet in Excel workbook (01.12)
- [ ] PDF footer on every page (01.11)
- [ ] All tests passing (zero regressions against frozen Stages 1–10)

Stage 01 is frozen only when all checklist items are verified by automated tests and manual review.

---

# STAGE 03 IMPLEMENTATION CHECKLIST

- [ ] Audit existing café registration / onboarding code (cafeCreateModal.js and related)
- [ ] Complete Café Registration Wizard (12 Sections A–L)
- [ ] FSSAI registration integration (correct terminology throughout)
- [ ] GST registration fields (conditional)
- [ ] Other registrations (conditional, Applicable / Not Applicable / Pending)
- [ ] Expiry alert engine for all licences (X.03)
- [ ] Unique Café QR from Stage 02 QR Engine
- [ ] Unique Café Login URL (zamorin.app/cafe/{ref}/login)
- [ ] QR card printable layout
- [ ] Café Readiness Engine (7 lifecycle states)
- [ ] TEST MODE checklist (all items must pass)
- [ ] Branding configuration captured and fed to all outputs
- [ ] Hardware readiness data captured (used in Stage 05)
- [ ] Banking fields masked by default
- [ ] All fields validated with appropriate rules

---

# STAGE 04 IMPLEMENTATION CHECKLIST

- [ ] Audit existing employee registration / profile code (employees.js, employeeProfile.js)
- [ ] Employee Registration — all 9 sections
- [ ] Employee ID format: EMP-ZC-{000001}
- [ ] Employee QR from Stage 02 QR Engine
- [ ] EPF / UAN fields (conditional)
- [ ] ESI fields (conditional — not globally mandatory)
- [ ] Document upload with expiry tracking
- [ ] Expiry alert engine for employee documents and training
- [ ] Employee onboarding readiness checklist (12 items)
- [ ] Employee lifecycle states (9 states)
- [ ] DPDP Act 2023 / Rules 2025 compliance (X.03)
- [ ] Sensitive field masking (bank, PAN, Aadhaar, UAN) (X.05)
- [ ] Access logging for sensitive field views
- [ ] Change audit trail for employee data
- [ ] Role-based export permissions for employee records

---

# DOCUMENT CONTROL

| Field | Value |
|---|---|
| Document Title | Zamorin Café ERP — Primary Master Programme |
| Version | 2.0 |
| Date | 13 September 2026 |
| Status | AUTHORISED — PRE-STAGE-01 |
| Author | Programme Owner |
| Certified By | Antigravity IDE |
| Supersedes | All previous programme documents |
| Next Review | After Stage 01 Freeze |

All Anti Gravity implementation prompts for this programme must reference this document and adhere to all specifications herein.

