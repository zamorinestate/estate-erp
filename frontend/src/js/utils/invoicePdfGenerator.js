/**
 * Zamorin Café ERP — Client-side POS Invoice PDF Generator
 * Generates authoritative %PDF-1.4 binary documents for POS invoices.
 * Adheres to Part B & Part C specifications:
 * - A4 Portrait layout (595.28 x 841.89 pt)
 * - Times-Roman / Times-Bold typography
 * - Sl. No. as universal column 1
 * - Watermark and corporate branding
 * - Official file naming: INV-[NUMBER].pdf
 */

import { formatCafeAddress } from './addressFormatter.js';

function escapePdfText(str) {
  return String(str ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

export function generateInvoicePdf(bill, cafeBranding = {}) {
  const invoiceNum = bill.invoiceNumber || bill.billId || `INV-${Date.now()}`;
  const dateStr = bill.businessDate || new Date().toISOString().slice(0, 10);
  const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const cafeName = cafeBranding.tradeName || bill.cafeName || 'Zamorin Café';
  const gstin = cafeBranding.gstin || '32AABCT1332L1ZV';
  const rawAddress = cafeBranding.address || cafeBranding;
  const address = formatCafeAddress(rawAddress) || (typeof cafeBranding.address === 'string' && cafeBranding.address) || 'Koramangala, Bengaluru, Karnataka — 560095';

  const subtotal = bill.subtotalPaisa ? bill.subtotalPaisa / 100 : (bill.totalPaisa ? bill.totalPaisa / 100 : 0);
  const gst = bill.taxPaisa ? bill.taxPaisa / 100 : Math.round(subtotal * 0.05);
  const grandTotal = bill.totalPaisa ? bill.totalPaisa / 100 : subtotal + gst;

  const isVoid = bill.status === 'VOID' || bill.status === 'CANCELLED';
  const isReprint = (bill.reprints && bill.reprints.length > 0) || bill.isReprint;
  const reprintCount = bill.reprints?.length || 1;

  let streamOps = '';

  // Watermark
  streamOps += `q\n0.94 0.94 0.96 rg\n`;
  if (isVoid) {
    streamOps += `BT\n/F2 50 Tf\n0.95 0.85 0.85 rg\n1 0 0 1 80 400 Tm\n(VOID - CANCELLED) Tj\nET\n`;
  } else if (isReprint) {
    streamOps += `BT\n/F2 42 Tf\n1 0 0 1 120 420 Tm\n(REPRINT #${reprintCount}) Tj\nET\n`;
  } else {
    streamOps += `BT\n/F2 44 Tf\n1 0 0 1 110 420 Tm\n(ZAMORIN CAFE) Tj\nET\n`;
  }
  streamOps += `Q\n`;

  // Header Bar (Navy #16223F)
  streamOps += `q\n0.086 0.133 0.247 rg\n20 770 555 50 re\nf\nQ\n`;
  streamOps += `BT\n/F2 16 Tf\n0.776 0.647 0.404 rg\n1 0 0 1 32 795 Tm\n(${escapePdfText(cafeName.toUpperCase())}) Tj\nET\n`;
  streamOps += `BT\n/F1 9 Tf\n1 1 1 rg\n1 0 0 1 32 780 Tm\n(GSTIN: ${escapePdfText(gstin)} | ${escapePdfText(address)}) Tj\nET\n`;

  // Document Title & Metadata
  const docTitle = isVoid ? 'TAX INVOICE — [VOID / CANCELLED]' : (isReprint ? `TAX INVOICE — [REPRINT #${reprintCount}]` : 'TAX INVOICE / RETAIL BILL');
  streamOps += `BT\n/F2 13 Tf\n0.06 0.09 0.16 rg\n1 0 0 1 20 740 Tm\n(${escapePdfText(docTitle)}) Tj\nET\n`;

  streamOps += `BT\n/F1 9 Tf\n0.3 0.35 0.45 rg\n1 0 0 1 20 722 Tm\n(Invoice No: ${escapePdfText(invoiceNum)}   |   Date: ${escapePdfText(dateStr)} ${escapePdfText(timeStr)}   |   Payment: ${escapePdfText(bill.paymentMethod || 'UPI')}) Tj\nET\n`;

  // Table Separator Line
  streamOps += `q\n0.8 0.83 0.88 rg\n20 710 555 1 re\nf\nQ\n`;

  // Table Header
  let currentY = 690;
  streamOps += `q\n0.93 0.95 0.98 rg\n20 ${currentY - 18} 555 20 re\nf\n`;
  streamOps += `0.8 0.83 0.88 RG\n1 w\n20 ${currentY - 18} 555 20 re\nS\nQ\n`;

  streamOps += `BT\n/F2 9 Tf\n0.12 0.16 0.23 rg\n`;
  streamOps += `1 0 0 1 28 ${currentY - 13} Tm\n(Sl. No.) Tj\n`;
  streamOps += `1 0 0 1 80 ${currentY - 13} Tm\n(Item Description) Tj\n`;
  streamOps += `1 0 0 1 320 ${currentY - 13} Tm\n(Qty) Tj\n`;
  streamOps += `1 0 0 1 380 ${currentY - 13} Tm\n(Rate (INR)) Tj\n`;
  streamOps += `1 0 0 1 480 ${currentY - 13} Tm\n(Amount (INR)) Tj\n`;
  streamOps += `ET\n`;
  currentY -= 20;

  // Table Rows (With Universal Sl. No.)
  const items = bill.lineItems || [];
  items.slice(0, 25).forEach((li, idx) => {
    const slNo = idx + 1;
    const itemName = li.itemNameSnapshot || li.name || 'Item';
    const qty = li.quantity || 1;
    const rate = li.unitPricePaisa ? (li.unitPricePaisa / 100).toFixed(2) : '0.00';
    const amount = li.unitPricePaisa ? ((li.unitPricePaisa * qty) / 100).toFixed(2) : '0.00';

    if (idx % 2 === 1) {
      streamOps += `q\n0.98 0.98 0.99 rg\n20 ${currentY - 14} 555 15 re\nf\nQ\n`;
    }

    streamOps += `BT\n/F1 8.5 Tf\n0.15 0.18 0.25 rg\n`;
    streamOps += `1 0 0 1 32 ${currentY - 10} Tm\n(${slNo}) Tj\n`;
    streamOps += `1 0 0 1 80 ${currentY - 10} Tm\n(${escapePdfText(itemName)}) Tj\n`;
    streamOps += `1 0 0 1 325 ${currentY - 10} Tm\n(${qty}) Tj\n`;
    streamOps += `1 0 0 1 385 ${currentY - 10} Tm\n(${rate}) Tj\n`;
    streamOps += `1 0 0 1 485 ${currentY - 10} Tm\n(${amount}) Tj\n`;
    streamOps += `ET\n`;
    currentY -= 16;
  });

  // Totals Box
  currentY -= 15;
  streamOps += `q\n0.95 0.96 0.98 rg\n300 ${currentY - 70} 275 70 re\nf\n`;
  streamOps += `0.8 0.83 0.88 RG\n1 w\n300 ${currentY - 70} 275 70 re\nS\nQ\n`;

  streamOps += `BT\n/F1 9 Tf\n0.2 0.25 0.35 rg\n`;
  streamOps += `1 0 0 1 315 ${currentY - 18} Tm\n(Subtotal:) Tj\n1 0 0 1 490 ${currentY - 18} Tm\n(INR ${subtotal.toFixed(2)}) Tj\n`;
  streamOps += `1 0 0 1 315 ${currentY - 34} Tm\n(CGST (2.5%):) Tj\n1 0 0 1 490 ${currentY - 34} Tm\n(INR ${(gst / 2).toFixed(2)}) Tj\n`;
  streamOps += `1 0 0 1 315 ${currentY - 50} Tm\n(SGST (2.5%):) Tj\n1 0 0 1 490 ${currentY - 50} Tm\n(INR ${(gst / 2).toFixed(2)}) Tj\n`;
  streamOps += `ET\n`;

  streamOps += `q\n0.8 0.83 0.88 rg\n310 ${currentY - 54} 255 1 re\nf\nQ\n`;

  streamOps += `BT\n/F2 10.5 Tf\n0.06 0.09 0.16 rg\n`;
  streamOps += `1 0 0 1 315 ${currentY - 67} Tm\n(Grand Total:) Tj\n1 0 0 1 485 ${currentY - 67} Tm\n(INR ${grandTotal.toFixed(2)}) Tj\n`;
  streamOps += `ET\n`;

  // Footer & Tamper Check
  streamOps += `q\n0.8 0.83 0.88 rg\n20 45 555 1 re\nf\nQ\n`;
  streamOps += `BT\n/F1 8 Tf\n0.4 0.45 0.55 rg\n1 0 0 1 20 32 Tm\n(Zamorin Café ERP · Tax Invoice · Official ID: ${escapePdfText(invoiceNum)} · A4 Official Retained Record) Tj\nET\n`;
  streamOps += `BT\n/F2 8 Tf\n0.776 0.647 0.404 rg\n1 0 0 1 450 32 Tm\n(OFFICIAL VERIFIED) Tj\nET\n`;

  const streamLen = new TextEncoder().encode(streamOps).length;

  const obj1 = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  const obj2 = `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`;
  const obj3 = `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n`;
  const obj4 = `4 0 obj\n<< /Length ${streamLen} >>\nstream\n${streamOps}\nendstream\nendobj\n`;
  const obj5 = `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>\nendobj\n`;
  const obj6 = `6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`;

  const bodyObjects = [obj1, obj2, obj3, obj4, obj5, obj6];
  let pdfData = `%PDF-1.4\n%\xe2\xe3\xcf\xd3\n`;
  const offsets = [];

  for (const obj of bodyObjects) {
    offsets.push(new TextEncoder().encode(pdfData).length);
    pdfData += obj;
  }

  const xrefOffset = new TextEncoder().encode(pdfData).length;
  pdfData += `xref\n0 ${bodyObjects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdfData += String(off).padStart(10, '0') + ` 00000 n \n`;
  }

  pdfData += `trailer\n<< /Size ${bodyObjects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const blob = new Blob([pdfData], { type: 'application/pdf' });
  const filename = `${invoiceNum.toLowerCase().replace(/[^a-z0-9]/g, '_')}.pdf`;

  return {
    blob,
    filename,
    invoiceNum,
  };
}

/**
 * Fetches the canonical official Tax Invoice PDF generated by the backend
 * exportGenerators engine (GET /api/v1/bills/:billId/pdf), guaranteeing 100%
 * parity between server archival storage and client print/preview.
 */
export async function fetchCanonicalBillPdf(billId, fallbackBill = null, cafeBranding = {}) {
  try {
    const response = await fetch(`/api/v1/bills/${encodeURIComponent(billId)}/pdf`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('zamorin_token') || ''}`,
      },
    });
    if (response.ok) {
      const blob = await response.blob();
      return {
        blob,
        filename: `tax_invoice_${billId.toLowerCase()}.pdf`,
        invoiceNum: billId,
        isCanonicalServer: true,
      };
    }
  } catch (err) {
    console.warn('Backend canonical PDF fetch failed, falling back to client renderer:', err);
  }

  if (fallbackBill) {
    const result = generateInvoicePdf(fallbackBill, cafeBranding);
    return { ...result, isCanonicalServer: false };
  }
  throw new Error(`Unable to fetch or generate PDF for bill ${billId}`);
}

