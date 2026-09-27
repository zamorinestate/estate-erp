// =============================================================================
// ZAMORIN CAFÉ ERP — VEN-SCR-013: VENDOR PROFILE & COMPLIANCE SUMMARY
//
// Authoritative, strictly read-only visibility into the vendor's own
// corporate identity, statutory registrations, masked banking records,
// compliance scorecard, performance metrics, and authorized café relationships.
//
// Key Guarantees:
// 1. Strictly READ-ONLY: Zero mutation controls (no edit, save, update, delete).
// 2. Strict Bank Masking: Raw account numbers are NEVER rendered; only
//    backend-sanitized masked form (accountNumberMasked) is displayed.
// 3. Redaction Integrity: Zero internal admin notes, risk scores, or private
//    user IDs are exposed or rendered.
// 4. Authorised Zamorin Café Scope: Strictly displays approved cafés belonging
//    to the vendor's authorised portfolio.
// 5. Official Vector A4 PDF Profile Card Download: Directly calls the
//    authorised backend endpoint GET /api/v1/vendor/profile/pdf.
// 6. Responsive design supporting mobile, tablet, and desktop viewports.
// =============================================================================

import { api, downloadBlob } from "../apiClient.js";
import { state } from "../state.js";

let currentProfileData = null;

function formatDate(dateStr) {
  if (!dateStr || dateStr === "—" || dateStr === "N/A") return dateStr || "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatCurrency(inrAmount) {
  if (inrAmount === null || inrAmount === undefined) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(inrAmount) || 0);
}

function getStatusBadge(status) {
  const s = String(status || "").toUpperCase();
  switch (s) {
    case "ACTIVE":
    case "QUALIFIED":
    case "VALID":
      return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 shadow-sm"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5"></span>Active / Valid</span>';
    case "HOLD":
    case "ON_HOLD":
    case "RENEWAL_ALERT":
    case "QUALIFIED_WITH_CONDITIONS":
      return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-950/80 text-amber-300 border border-amber-700/60 shadow-sm"><span class="w-1.5 h-1.5 rounded-full bg-amber-400 mr-1.5 animate-pulse"></span>Action Required</span>';
    case "EXPIRED":
    case "SUSPENDED":
    case "INACTIVE":
      return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-950/80 text-rose-300 border border-rose-700/60 shadow-sm"><span class="w-1.5 h-1.5 rounded-full bg-rose-400 mr-1.5"></span>Inactive / Expired</span>';
    case "REVIEW_REQUIRED":
      return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-950/80 text-blue-300 border border-blue-700/60 shadow-sm"><span class="w-1.5 h-1.5 rounded-full bg-blue-400 mr-1.5"></span>Under Review</span>';
    default:
      return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-800 text-neutral-300 border border-neutral-700 shadow-sm">${escapeHtml(s || "Unassessed")}</span>`;
  }
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderVendorProfile() {
  return `
    <div id="vendor-profile-container" class="vendor-workspace-root min-h-screen p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      
      <!-- PERSISTENT READ-ONLY ACCESS BANNER -->
      <div class="read-only-strip flex items-center justify-between p-3.5 sm:p-4 rounded-xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/40 via-purple-950/20 to-neutral-900/60 shadow-lg backdrop-blur-md">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-lg border border-indigo-500/40 shadow-inner">
            🔒
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="text-xs sm:text-sm font-bold uppercase tracking-wider text-indigo-300">READ-ONLY VENDOR ACCESS</span>
              <span class="inline-block px-2 py-0.5 text-[10px] font-extrabold uppercase rounded bg-indigo-500/20 text-indigo-200 border border-indigo-500/40">VEN-SCR-013</span>
            </div>
            <p class="text-xs text-neutral-300 hidden sm:block">Authoritative commercial profile, regulatory registrations, and compliance records. Changes are managed via Zamorin Café Administration.</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button id="btn-download-profile-pdf" class="px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all rounded-lg border border-indigo-500/50 flex items-center gap-1.5 shadow-md hover:shadow-indigo-500/20 cursor-pointer">
            <span>📥</span> Download Profile PDF
          </button>
          <button id="btn-refresh-profile" class="px-3 py-1.5 text-xs font-semibold text-neutral-200 bg-neutral-800 hover:bg-neutral-700 active:scale-95 transition-all rounded-lg border border-neutral-700 flex items-center gap-1.5 shadow cursor-pointer">
            <span class="refresh-icon">🔄</span> Refresh
          </button>
        </div>
      </div>

      <!-- MAIN DYNAMIC CONTENT CONTAINER (Replaced by loadVendorProfile) -->
      <div id="vendor-profile-content" class="space-y-6">
        <!-- Initial Skeleton Loading State -->
        <div class="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-6 sm:p-8 animate-pulse space-y-6">
          <div class="flex flex-col sm:flex-row justify-between gap-4">
            <div class="space-y-3">
              <div class="h-4 bg-neutral-800 rounded w-36"></div>
              <div class="h-8 bg-neutral-800 rounded w-64 sm:w-96"></div>
              <div class="h-4 bg-neutral-800 rounded w-48"></div>
            </div>
            <div class="h-10 bg-neutral-800 rounded w-32"></div>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-neutral-800">
            <div class="h-24 bg-neutral-800/60 rounded-xl"></div>
            <div class="h-24 bg-neutral-800/60 rounded-xl"></div>
            <div class="h-24 bg-neutral-800/60 rounded-xl"></div>
          </div>
        </div>
      </div>

    </div>
  `;
}

export async function initVendorProfile(container = document) {
  const root = container.querySelector("#vendor-profile-container") || container;
  const contentContainer = root.querySelector("#vendor-profile-content");
  const refreshBtn = root.querySelector("#btn-refresh-profile");
  const downloadPdfBtn = root.querySelector("#btn-download-profile-pdf");

  if (!contentContainer) return;

  async function loadProfile() {
    contentContainer.innerHTML = `
      <div class="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-8 text-center space-y-4 animate-pulse">
        <div class="w-12 h-12 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin mx-auto"></div>
        <p class="text-sm font-medium text-neutral-300">Retrieving authoritative vendor profile and compliance status...</p>
      </div>
    `;

    try {
      const response = await api.get("/api/v1/vendor/profile");
      if (!response || !response.success || !response.data) {
        throw new Error(response?.error?.message || "Failed to load vendor profile.");
      }

      currentProfileData = response.data;
      renderProfileData(currentProfileData, contentContainer);
    } catch (err) {
      console.error("[VendorProfile] Error fetching profile:", err);
      contentContainer.innerHTML = `
        <div class="bg-rose-950/20 border border-rose-800/50 rounded-2xl p-6 sm:p-8 text-center space-y-4 max-w-2xl mx-auto shadow-xl">
          <div class="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold text-2xl mx-auto border border-rose-500/40">
            ⚠️
          </div>
          <div>
            <h3 class="text-lg font-bold text-white">Profile Data Unavailable</h3>
            <p class="text-sm text-rose-200/80 mt-1">${escapeHtml(err.message || "An unexpected error occurred while loading your profile.")}</p>
          </div>
          <button id="btn-profile-retry" class="px-4 py-2 text-xs font-semibold text-white bg-neutral-800 hover:bg-neutral-700 active:scale-95 transition-all rounded-lg border border-neutral-700 inline-flex items-center gap-1.5 shadow cursor-pointer">
            🔄 Retry
          </button>
        </div>
      `;

      const retryBtn = contentContainer.querySelector("#btn-profile-retry");
      if (retryBtn) {
        retryBtn.addEventListener("click", loadProfile);
      }
    }
  }

  // Refresh handler
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      loadProfile();
    });
  }

  // PDF download handler
  if (downloadPdfBtn) {
    downloadPdfBtn.addEventListener("click", async () => {
      try {
        downloadPdfBtn.disabled = true;
        const originalText = downloadPdfBtn.innerHTML;
        downloadPdfBtn.innerHTML = `<span>⏳</span> Generating PDF...`;

        const filename = currentProfileData?.vendorId
          ? `Vendor_Profile_${currentProfileData.vendorId}.pdf`
          : "Zamorin_Vendor_Profile.pdf";

        await downloadBlob("/api/v1/vendor/profile/pdf", filename);

        downloadPdfBtn.innerHTML = originalText;
        downloadPdfBtn.disabled = false;
      } catch (pdfErr) {
        console.error("[VendorProfile] Error downloading profile PDF:", pdfErr);
        alert("Failed to download profile PDF. Please try again or contact administration.");
        downloadPdfBtn.disabled = false;
        downloadPdfBtn.innerHTML = `<span>📥</span> Download Profile PDF`;
      }
    });
  }

  await loadProfile();
}

function renderProfileData(p, container) {
  const addr = p.address || {};
  const formattedAddress = [
    addr.line1,
    addr.line2,
    addr.city,
    addr.state,
    addr.pincode,
    addr.country || "India",
  ]
    .filter(Boolean)
    .join(", ") || "Address not provided";

  const bank = p.bankDetails || {};
  // STRICT DEFENSE-IN-DEPTH: Use ONLY masked representation
  const maskedAccNumber = bank.accountNumberMasked || "••••••••••";

  const fssai = p.fssai || {};
  const perf = p.performance || {};
  const contract = p.contract || {};
  const insurance = p.insurance || {};
  const comp = p.complianceSummary || { areas: [] };
  const holds = p.activeHolds || [];
  const approvedCafes = p.approvedCafes || [];
  const contacts = p.contactPersons || [];
  const sites = p.sites || [];

  container.innerHTML = `
    <!-- HEADER HERO CARD -->
    <header class="vendor-header bg-neutral-900/80 border border-neutral-800 rounded-2xl p-5 sm:p-6 backdrop-blur-md shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-6">
      <div class="space-y-2">
        <div class="flex items-center gap-2.5 text-xs font-semibold text-indigo-400 uppercase tracking-widest">
          <span>ZAMORIN CAFÉ ERP</span>
          <span class="text-neutral-600">•</span>
          <span>VENDOR COMMERCIAL PROFILE</span>
        </div>
        <h1 class="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          ${escapeHtml(p.name || "Vendor Profile")}
        </h1>
        ${
          p.tradeName
            ? `<div class="text-sm font-medium text-neutral-300">Trading as: <span class="text-indigo-300 font-semibold">${escapeHtml(p.tradeName)}</span></div>`
            : ""
        }
        <div class="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <span class="px-2.5 py-1 rounded-md bg-neutral-800 text-neutral-200 font-mono font-semibold border border-neutral-700">
            ID: ${escapeHtml(p.vendorId || "—")}
          </span>
          <span class="px-2.5 py-1 rounded-md bg-indigo-950/60 text-indigo-300 border border-indigo-800/50 uppercase font-semibold text-[11px]">
            ${escapeHtml(p.category || "General")}
          </span>
          <span class="px-2.5 py-1 rounded-md bg-neutral-800/70 text-neutral-300 border border-neutral-700/60 uppercase font-semibold text-[11px]">
            Type: ${escapeHtml(p.supplierType || "Goods")}
          </span>
          <div class="ml-1">
            ${getStatusBadge(p.status || "ACTIVE")}
          </div>
        </div>
      </div>

      <!-- Quick Identity Badges (GST & PAN) -->
      <div class="grid grid-cols-2 gap-3 lg:w-72 bg-neutral-950/60 p-3.5 rounded-xl border border-neutral-800/80">
        <div>
          <span class="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">GSTIN</span>
          <span class="font-mono text-xs font-bold text-neutral-100 block truncate" title="${escapeHtml(p.gstNumber || 'Not Registered')}">
            ${escapeHtml(p.gstNumber || "Not Registered")}
          </span>
        </div>
        <div>
          <span class="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">PAN</span>
          <span class="font-mono text-xs font-bold text-neutral-100 block truncate" title="${escapeHtml(p.panNumber || 'Not Registered')}">
            ${escapeHtml(p.panNumber || "Not Registered")}
          </span>
        </div>
        <div class="col-span-2 pt-2 border-t border-neutral-800/60 text-[11px] text-neutral-400 flex items-center justify-between">
          <span>Registered: <strong class="text-neutral-200 font-normal">${formatDate(p.registeredOn)}</strong></span>
          ${p.lastUpdated ? `<span>Updated: <strong class="text-neutral-200 font-normal">${formatDate(p.lastUpdated)}</strong></span>` : ""}
        </div>
      </div>
    </header>

    <!-- ACTIVE HOLDS WARNING BANNER (If Applicable) -->
    ${
      p.hasActiveHold && holds.length > 0
        ? `
      <div class="p-4 rounded-xl border border-amber-600/40 bg-gradient-to-r from-amber-950/40 to-neutral-900/60 shadow-lg space-y-2" role="alert">
        <div class="flex items-center gap-2 text-amber-300 font-bold text-sm">
          <span class="text-lg">⚠️</span>
          <span>Active Operational / Commercial Hold Notice</span>
        </div>
        <div class="space-y-1.5 pl-6 text-xs text-neutral-300">
          ${holds
            .map(
              (h) => `
            <div class="flex flex-col sm:flex-row sm:items-center justify-between py-1 border-b border-amber-900/40 last:border-0 gap-1">
              <div>
                <strong class="text-amber-200 uppercase">${escapeHtml(h.holdType || "Operational Hold")}:</strong>
                <span class="text-neutral-200 ml-1">${escapeHtml(h.reason || "Operational review pending. Contact café administration for details.")}</span>
              </div>
              <div class="text-[11px] text-neutral-400 font-mono">
                Placed: ${formatDate(h.placedAt)} ${h.reviewDate ? `• Review: ${formatDate(h.reviewDate)}` : ""}
              </div>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `
        : ""
    }

    <!-- TWO-COLUMN GRID: STATUTORY & COMMERCIAL INFORMATION -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

      <!-- 1. BUSINESS IDENTITY & STATUTORY INFORMATION -->
      <section class="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-5 sm:p-6 backdrop-blur-md shadow-lg space-y-4">
        <div class="flex items-center justify-between pb-3 border-b border-neutral-800">
          <h2 class="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <span>🏛️</span> Business Identity & Statutory Registrations
          </h2>
          <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">Verified</span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <span class="text-neutral-400 block text-[11px]">Official Corporate Name</span>
            <span class="text-white font-semibold mt-0.5 block">${escapeHtml(p.name || "—")}</span>
          </div>
          <div>
            <span class="text-neutral-400 block text-[11px]">Trade / Brand Name</span>
            <span class="text-neutral-200 font-medium mt-0.5 block">${escapeHtml(p.tradeName || "Same as legal name")}</span>
          </div>
          <div>
            <span class="text-neutral-400 block text-[11px]">Supplier Classification</span>
            <span class="text-neutral-200 mt-0.5 block">${escapeHtml(p.supplierType || "Goods")} (${escapeHtml(p.category || "General")})</span>
          </div>
          <div>
            <span class="text-neutral-400 block text-[11px]">System Vendor Code</span>
            <span class="text-indigo-300 font-mono font-bold mt-0.5 block">${escapeHtml(p.vendorId || "—")}</span>
          </div>
          <div class="sm:col-span-2 pt-2 border-t border-neutral-800/60">
            <span class="text-neutral-400 block text-[11px]">Registered Primary Address</span>
            <p class="text-neutral-200 mt-0.5 leading-relaxed">${escapeHtml(formattedAddress)}</p>
          </div>
        </div>

        <!-- FSSAI DETAILS (Food Safety Certification) -->
        <div class="p-3.5 rounded-xl bg-neutral-950/60 border border-neutral-800/80 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-neutral-200 flex items-center gap-1.5">
              <span>🥗</span> FSSAI Food Safety Registration
            </span>
            <span class="text-[10px] font-bold">
              ${fssai.applicable !== false ? getStatusBadge(fssai.valid ? "VALID" : "EXPIRED") : '<span class="text-neutral-400">Not Applicable</span>'}
            </span>
          </div>
          ${
            fssai.applicable !== false && fssai.licenseNumber
              ? `
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
              <div>
                <span class="text-neutral-400 text-[10px] block">License / Reg Number</span>
                <span class="font-mono text-neutral-200 font-semibold">${escapeHtml(fssai.licenseNumber)}</span>
              </div>
              <div>
                <span class="text-neutral-400 text-[10px] block">Validity / Expiry Date</span>
                <span class="text-neutral-200">${formatDate(fssai.expiryDate)}</span>
              </div>
              <div class="sm:col-span-2 text-[10px] text-neutral-400">
                Registry Source: <span class="text-neutral-300">${escapeHtml(fssai.verificationSource || "FoSCoS")}</span>
              </div>
            </div>
          `
              : `
            <p class="text-xs text-neutral-400 pt-1">Food safety registration is not required or not applicable for this supplier category.</p>
          `
          }
        </div>

        <!-- CONTACT DETAILS -->
        <div class="pt-2 border-t border-neutral-800/60 space-y-2">
          <span class="text-[11px] font-bold uppercase tracking-wider text-neutral-400 block">Official Contact Channels</span>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div>
              <span class="text-neutral-400 text-[10px] block">Primary Phone</span>
              <span class="text-neutral-200 font-mono">${escapeHtml(p.phone || "—")}</span>
            </div>
            <div>
              <span class="text-neutral-400 text-[10px] block">Primary Email</span>
              <span class="text-neutral-200">${escapeHtml(p.email || p.primaryContactEmail || "—")}</span>
            </div>
            ${
              p.accountsEmail
                ? `
              <div>
                <span class="text-neutral-400 text-[10px] block">Accounts / Billing Email</span>
                <span class="text-neutral-200">${escapeHtml(p.accountsEmail)}</span>
              </div>
            `
                : ""
            }
            ${
              p.salesEmail
                ? `
              <div>
                <span class="text-neutral-400 text-[10px] block">Sales Orders Email</span>
                <span class="text-neutral-200">${escapeHtml(p.salesEmail)}</span>
              </div>
            `
                : ""
            }
          </div>
        </div>
      </section>

      <!-- 2. BANKING DETAILS & COMMERCIAL TERMS (STRICTLY MASKED) -->
      <section class="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-5 sm:p-6 backdrop-blur-md shadow-lg space-y-4 flex flex-col justify-between">
        <div>
          <div class="flex items-center justify-between pb-3 border-b border-neutral-800">
            <h2 class="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <span>💳</span> Bank Details & Settlement Terms
            </h2>
            <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 flex items-center gap-1">
              <span>🔒</span> Masked Storage
            </span>
          </div>

          <div class="mt-4 space-y-4">
            <!-- MASKED BANK CARD -->
            <div class="p-4 rounded-xl bg-gradient-to-br from-neutral-950 via-neutral-900 to-indigo-950/30 border border-neutral-800 space-y-3 shadow-inner">
              <div class="flex items-center justify-between text-xs">
                <span class="text-neutral-400 uppercase tracking-wider font-semibold text-[10px]">Settlement Beneficiary Bank</span>
                <span class="text-indigo-400 font-bold font-mono text-xs">${escapeHtml(bank.bankName || "Nationalized Bank")}</span>
              </div>

              <div>
                <span class="text-neutral-400 block text-[10px] uppercase">Account Holder</span>
                <span class="text-white font-bold text-sm block">${escapeHtml(bank.accountHolderName || p.name || "—")}</span>
              </div>

              <div class="pt-2 border-t border-neutral-800/80 flex items-center justify-between text-xs">
                <div>
                  <span class="text-neutral-400 text-[10px] uppercase block">Masked Account Number</span>
                  <div class="flex items-center gap-1.5 font-mono text-sm font-bold text-emerald-400 mt-0.5">
                    <span>${escapeHtml(maskedAccNumber)}</span>
                    <span class="text-xs text-neutral-400" title="Full account number is encrypted on server and never transmitted to the browser">🔒</span>
                  </div>
                </div>
                <div class="text-right">
                  <span class="text-neutral-400 text-[10px] uppercase block">Status</span>
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800/60 mt-0.5">
                    ✓ ${escapeHtml(bank.paymentAccountStatus || "Payment Account Verified")}
                  </span>
                </div>
              </div>
            </div>

            <!-- COMMERCIAL TERMS -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-2">
              <div class="p-3 bg-neutral-950/50 rounded-xl border border-neutral-800/60">
                <span class="text-neutral-400 text-[10px] uppercase block">Settlement Terms</span>
                <span class="text-neutral-100 font-bold text-sm mt-0.5 block">${escapeHtml(p.paymentTerms || "Net 30 Days")}</span>
                <span class="text-[10px] text-neutral-400 mt-1 block">Invoicing milestone cycle</span>
              </div>
              <div class="p-3 bg-neutral-950/50 rounded-xl border border-neutral-800/60">
                <span class="text-neutral-400 text-[10px] uppercase block">Disbursement Channel</span>
                <span class="text-emerald-400 font-bold text-sm mt-0.5 block flex items-center gap-1.5">
                  <span class="inline-block w-2 h-2 rounded-full bg-emerald-400"></span>
                  ${escapeHtml(bank.paymentAccountStatus || "Payment Account On File")}
                </span>
                <span class="text-[10px] text-neutral-400 mt-1 block">Direct bank transfer authorized</span>
              </div>
            </div>
          </div>
        </div>

        <div class="p-3 rounded-xl bg-neutral-950/40 border border-neutral-800/60 text-[11px] text-neutral-400 flex items-center gap-2 mt-4">
          <span class="text-neutral-400 text-sm">ℹ️</span>
          <span>To request changes to banking coordinates or statutory payment terms, submit official attested documentation to Zamorin Finance Accounts.</span>
        </div>
      </section>

    </div>

    <!-- COMPLIANCE SCORECARD & OPERATIONAL PERFORMANCE -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

      <!-- 3. COMPLIANCE SCORECARD -->
      <section class="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-5 sm:p-6 backdrop-blur-md shadow-lg space-y-4">
        <div class="flex items-center justify-between pb-3 border-b border-neutral-800">
          <h2 class="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <span>📊</span> Regulatory Compliance Scorecard
          </h2>
          <span class="text-xs font-bold font-mono px-2.5 py-0.5 rounded-full ${comp.percent >= 80 ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-amber-950 text-amber-300 border border-amber-800'}">
            ${comp.percent ?? 100}% Qualified
          </span>
        </div>

        <div class="space-y-3">
          <div class="flex items-center justify-between text-xs text-neutral-400">
            <span>Overall Score: <strong class="text-white">${comp.score ?? 5} / 5 Areas Qualified</strong></span>
            <span>Audited quarterly by Governance</span>
          </div>

          <!-- Progress Bar -->
          <div class="w-full bg-neutral-800 h-2.5 rounded-full overflow-hidden">
            <div class="bg-gradient-to-r from-indigo-500 to-emerald-500 h-full rounded-full transition-all duration-500" style="width: ${Math.max(5, comp.percent || 100)}%"></div>
          </div>

          <!-- 5 Regulatory Compliance Areas -->
          <div class="grid grid-cols-1 gap-2 pt-2">
            ${(comp.areas || [])
              .map((area) => {
                const areaNames = {
                  LEGAL: "Corporate & Legal Incorporation",
                  TAX: "GST & Direct Tax Compliance",
                  FOOD_SAFETY_FSSAI: "FSSAI & Food Hygiene Standards",
                  QUALITY: "Product Quality & Lab Certification",
                  COMMERCIAL: "Commercial Contract & Payment Terms",
                };
                return `
                <div class="flex items-center justify-between p-2.5 rounded-xl bg-neutral-950/60 border border-neutral-800/80 text-xs">
                  <span class="font-medium text-neutral-200">${escapeHtml(areaNames[area.area] || area.area)}</span>
                  ${getStatusBadge(area.status)}
                </div>
              `;
              })
              .join("")}
          </div>
        </div>
      </section>

      <!-- 4. OPERATIONAL PERFORMANCE METRICS -->
      <section class="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-5 sm:p-6 backdrop-blur-md shadow-lg space-y-4">
        <div class="flex items-center justify-between pb-3 border-b border-neutral-800">
          <h2 class="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <span>⚡</span> Operational Supply Performance
          </h2>
          <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">Authoritative KPI</span>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div class="p-3 bg-neutral-950/60 rounded-xl border border-neutral-800/80 text-center">
            <span class="text-[10px] uppercase text-neutral-400 font-bold block">OTIF Rate</span>
            <span class="text-lg sm:text-xl font-black text-indigo-400 mt-1 block">
              ${perf.otifPercent !== null && perf.otifPercent !== undefined ? `${perf.otifPercent}%` : "—"}
            </span>
            <span class="text-[9px] text-neutral-400 mt-0.5 block">On-Time In-Full</span>
          </div>

          <div class="p-3 bg-neutral-950/60 rounded-xl border border-neutral-800/80 text-center">
            <span class="text-[10px] uppercase text-neutral-400 font-bold block">Fill Rate</span>
            <span class="text-lg sm:text-xl font-black text-emerald-400 mt-1 block">
              ${perf.fillRatePercent !== null && perf.fillRatePercent !== undefined ? `${perf.fillRatePercent}%` : "—"}
            </span>
            <span class="text-[9px] text-neutral-400 mt-0.5 block">Quantity accuracy</span>
          </div>

          <div class="p-3 bg-neutral-950/60 rounded-xl border border-neutral-800/80 text-center">
            <span class="text-[10px] uppercase text-neutral-400 font-bold block">Avg Lead Time</span>
            <span class="text-lg sm:text-xl font-black text-white mt-1 block">
              ${perf.averageLeadTimeDays !== null && perf.averageLeadTimeDays !== undefined ? `${perf.averageLeadTimeDays}d` : "—"}
            </span>
            <span class="text-[9px] text-neutral-400 mt-0.5 block">PO to delivery</span>
          </div>

          <div class="p-3 bg-neutral-950/60 rounded-xl border border-neutral-800/80 text-center">
            <span class="text-[10px] uppercase text-neutral-400 font-bold block">On-Time</span>
            <span class="text-lg sm:text-xl font-black text-neutral-200 mt-1 block">
              ${perf.onTimeDeliveryPercent !== null && perf.onTimeDeliveryPercent !== undefined ? `${perf.onTimeDeliveryPercent}%` : "—"}
            </span>
            <span class="text-[9px] text-neutral-400 mt-0.5 block">Dispatch timeliness</span>
          </div>

          <div class="p-3 bg-neutral-950/60 rounded-xl border border-neutral-800/80 text-center">
            <span class="text-[10px] uppercase text-neutral-400 font-bold block">Rejection Rate</span>
            <span class="text-lg sm:text-xl font-black ${perf.rejectionRatePercent > 2 ? 'text-amber-400' : 'text-neutral-200'} mt-1 block">
              ${perf.rejectionRatePercent !== null && perf.rejectionRatePercent !== undefined ? `${perf.rejectionRatePercent}%` : "—"}
            </span>
            <span class="text-[9px] text-neutral-400 mt-0.5 block">Physical GRN defects</span>
          </div>

          <div class="p-3 bg-neutral-950/60 rounded-xl border border-neutral-800/80 text-center">
            <span class="text-[10px] uppercase text-neutral-400 font-bold block">Total Orders</span>
            <span class="text-lg sm:text-xl font-black text-white mt-1 block">
              ${perf.totalOrdersCount || 0}
            </span>
            <span class="text-[9px] text-neutral-400 mt-0.5 block">Completed fulfillments</span>
          </div>
        </div>

        <div class="text-[11px] text-neutral-400 pt-2 flex items-center justify-between">
          <span>Reliability Rating: <strong class="text-amber-300">${"⭐".repeat(Math.min(5, p.reliabilityRating || 4))}</strong></span>
          ${perf.lastEvaluatedAt ? `<span>Evaluated: <strong class="text-neutral-200 font-normal">${formatDate(perf.lastEvaluatedAt)}</strong></span>` : ""}
        </div>
      </section>

    </div>

    <!-- CONTRACT & INSURANCE VALIDITY STATUS -->
    <section class="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-5 sm:p-6 backdrop-blur-md shadow-lg space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-neutral-800">
        <h2 class="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <span>📜</span> Master Supply Agreement & Commercial Insurance
        </h2>
        <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">Audit Status</span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <!-- CONTRACT -->
        <div class="p-4 rounded-xl bg-neutral-950/60 border border-neutral-800 space-y-2">
          <div class="flex items-center justify-between">
            <span class="font-bold text-neutral-200">Supply Agreement Validity</span>
            ${getStatusBadge(contract.status)}
          </div>
          <div class="grid grid-cols-2 gap-2 pt-1 text-neutral-300">
            <div>
              <span class="text-[10px] text-neutral-400 block">Expiry Date</span>
              <span class="font-semibold text-white">${formatDate(contract.expiryDate)}</span>
            </div>
            <div>
              <span class="text-[10px] text-neutral-400 block">Days Remaining</span>
              <span class="font-semibold ${contract.daysRemaining !== null && contract.daysRemaining <= 30 ? 'text-amber-400 font-bold' : 'text-neutral-200'}">
                ${contract.daysRemaining !== null ? `${contract.daysRemaining} days` : "Indefinite"}
              </span>
            </div>
          </div>
        </div>

        <!-- INSURANCE -->
        <div class="p-4 rounded-xl bg-neutral-950/60 border border-neutral-800 space-y-2">
          <div class="flex items-center justify-between">
            <span class="font-bold text-neutral-200">Transit & Liability Insurance</span>
            ${getStatusBadge(insurance.status)}
          </div>
          <div class="grid grid-cols-2 gap-2 pt-1 text-neutral-300">
            <div>
              <span class="text-[10px] text-neutral-400 block">Policy / Provider</span>
              <span class="font-semibold text-white truncate block" title="${escapeHtml(insurance.provider || '')}">
                ${escapeHtml(insurance.provider || "Standard Commercial Policy")}
              </span>
            </div>
            <div>
              <span class="text-[10px] text-neutral-400 block">Policy Expiry</span>
              <span class="font-semibold text-white">${formatDate(insurance.expiryDate)}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- AUTHORIZED CAFÉS & DISPATCH SITES -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

      <!-- 5. APPROVED CAFÉS -->
      <section class="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-5 sm:p-6 backdrop-blur-md shadow-lg space-y-4">
        <div class="flex items-center justify-between pb-3 border-b border-neutral-800">
          <h2 class="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <span>☕</span> Approved Zamorin Café Locations (${approvedCafes.length})
          </h2>
          <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">Authorized Scope</span>
        </div>

        <p class="text-xs text-neutral-400">Your vendor account is authorized to fulfill purchase orders and deliver supplies strictly to the following certified café locations:</p>

        <div class="space-y-2.5 max-h-72 overflow-y-auto pr-1">
          ${
            approvedCafes.length > 0
              ? approvedCafes
                  .map(
                    (c) => `
                <div class="p-3 rounded-xl bg-neutral-950/60 border border-neutral-800/80 flex items-start justify-between gap-3 text-xs">
                  <div>
                    <span class="font-bold text-white block">${escapeHtml(c.name || c.cafeId)}</span>
                    <span class="text-neutral-400 text-[11px] block mt-0.5">${escapeHtml(c.address || "Main Café Facility")}</span>
                  </div>
                  <span class="px-2 py-0.5 rounded bg-neutral-800 text-indigo-300 font-mono font-bold text-[10px] border border-neutral-700 shrink-0">
                    ${escapeHtml(c.cafeId)}
                  </span>
                </div>
              `
                  )
                  .join("")
              : `
                <div class="p-4 rounded-xl bg-neutral-950/40 border border-neutral-800/60 text-center text-xs text-neutral-400">
                  No specific café locations assigned. Contact procurement governance.
                </div>
              `
          }
        </div>
      </section>

      <!-- 6. DISPATCH LOCATIONS & SITES -->
      <section class="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-5 sm:p-6 backdrop-blur-md shadow-lg space-y-4">
        <div class="flex items-center justify-between pb-3 border-b border-neutral-800">
          <h2 class="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <span>🏭</span> Registered Dispatch Locations & Hubs (${sites.length})
          </h2>
          <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">Hubs</span>
        </div>

        <div class="space-y-2.5 max-h-72 overflow-y-auto pr-1">
          ${
            sites.length > 0
              ? sites
                  .map((s) => {
                    const sAddr = s.address || {};
                    const sAddrStr = [sAddr.line1, sAddr.city, sAddr.state].filter(Boolean).join(", ") || "Address on file";
                    return `
                <div class="p-3 rounded-xl bg-neutral-950/60 border border-neutral-800/80 text-xs space-y-1">
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-white">${escapeHtml(s.siteName || "Dispatch Facility")}</span>
                    <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700">
                      ${escapeHtml(s.siteType || "Dispatch")}
                    </span>
                  </div>
                  <div class="text-neutral-400 text-[11px]">${escapeHtml(sAddrStr)}</div>
                  <div class="flex flex-wrap items-center gap-3 pt-1 text-[10px] text-neutral-400">
                    ${s.leadTimeDays ? `<span>Lead Time: <strong class="text-neutral-200">${s.leadTimeDays} day(s)</strong></span>` : ""}
                    ${s.deliveryCutoffTime ? `<span>Cutoff: <strong class="text-neutral-200">${s.deliveryCutoffTime}</strong></span>` : ""}
                    ${s.deliveryDays && s.deliveryDays.length ? `<span>Days: <strong class="text-neutral-200">${s.deliveryDays.join(", ")}</strong></span>` : ""}
                  </div>
                </div>
              `;
                  })
                  .join("")
              : `
                <div class="p-4 rounded-xl bg-neutral-950/40 border border-neutral-800/60 text-center text-xs text-neutral-400">
                  Primary corporate location operates as the default dispatch site.
                </div>
              `
          }
        </div>
      </section>

    </div>

    <!-- 7. CONTACT PERSONS DIRECTORY -->
    <section class="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-5 sm:p-6 backdrop-blur-md shadow-lg space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-neutral-800">
        <h2 class="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <span>👥</span> Authorized Company Contacts & Representatives (${contacts.length})
        </h2>
        <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">Directory</span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        ${
          contacts.length > 0
            ? contacts
                .map(
                  (cp) => `
              <div class="p-3.5 rounded-xl bg-neutral-950/60 border border-neutral-800/80 text-xs space-y-1.5">
                <div class="flex items-center justify-between">
                  <span class="font-bold text-white">${escapeHtml(cp.name || "Representative")}</span>
                  ${cp.isPrimary ? '<span class="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">Primary</span>' : ""}
                </div>
                <div class="text-[11px] text-neutral-400">${escapeHtml(cp.role || "Contact")} • ${escapeHtml(cp.department || "General")}</div>
                <div class="pt-1 border-t border-neutral-800/60 space-y-0.5 font-mono text-[11px] text-neutral-300">
                  ${cp.phone ? `<div>📞 ${escapeHtml(cp.phone)}</div>` : ""}
                  ${cp.email ? `<div>✉️ ${escapeHtml(cp.email)}</div>` : ""}
                </div>
              </div>
            `
                )
                .join("")
            : `
              <div class="col-span-full p-4 rounded-xl bg-neutral-950/40 border border-neutral-800/60 text-center text-xs text-neutral-400">
                Primary corporate communications channel serves as the authorized contact.
              </div>
            `
        }
      </div>
    </section>
  `;
}
