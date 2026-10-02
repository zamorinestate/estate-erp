'use strict';

/**
 * VENDOR WORKSPACE ROUTES
 * Mounted at: /api/v1/vendor (registered in routes/index.js)
 *
 * Security Boundary:
 * - Requires valid session authentication
 * - Requires VENDOR role
 * - Enforces server-side read-only policy (blocks POST/PUT/PATCH/DELETE with 403 FORBIDDEN_VENDOR_WRITE)
 * - Binds identity strictly to req.auth.vendorId (rejection of IDOR/BOLA tampering)
 * - Limits café queries to Vendor.approvedCafeIds
 */

const express = require('express');
const { authenticate } = require('../middleware/authenticate');
const {
  enforceVendorRole,
  enforceVendorReadOnly,
  enforceVendorIdentity,
  enforceVendorCafeScope,
} = require('../middleware/vendorAuthorization');
const {
  getVendorMe,
  getVendorDashboard,
  getVendorPurchaseOrders,
  getVendorOrderDetails,
  downloadVendorOrderPdf,
  getVendorDeliveries,
  getVendorDeliveryDetails,
  downloadVendorGrnPdf,
  downloadVendorGrnAttachment,
  getVendorInvoices,
  getVendorInvoiceDetails,
  downloadVendorInvoicePdf,
  getVendorPayments,
  getVendorPaymentDetails,
  downloadVendorPaymentReceiptPdf,
  getVendorAccountStatement,
  downloadVendorStatementPdf,
  downloadVendorStatementCsv,
  downloadVendorStatementXlsx,
  getVendorReceivables,
  downloadVendorReceivablesPdf,
  downloadVendorReceivablesCsv,
  downloadVendorReceivablesXlsx,
  getVendorAdjustments,
  getVendorAdjustmentDetails,
  downloadVendorAdjustmentsCsv,
  downloadVendorAdjustmentsXlsx,
  downloadVendorAdjustmentPdf,
  getVendorProducts,
  getVendorProductDetails,
  downloadVendorProductsCsv,
  downloadVendorProductsXlsx,
  downloadVendorProductPdf,
  getVendorDocuments,
  downloadVendorDocumentsCsv,
  downloadVendorDocumentsXlsx,
  downloadVendorDocumentUniversal,
  downloadVendorDocumentFile,
  getVendorReports,
  downloadVendorReportsCsv,
  downloadVendorReportsXlsx,
  downloadVendorReportsPdf,
  getVendorNotifications,
  downloadVendorNotificationsCsv,
  downloadVendorNotificationsXlsx,
  getVendorProfile,
  downloadVendorProfilePdf,
} = require('../controllers/vendorWorkspaceController');

const router = express.Router();

// All vendor workspace endpoints require authentication and security boundary enforcement
router.use(authenticate);
router.use(enforceVendorRole);
router.use(enforceVendorReadOnly);
router.use(enforceVendorIdentity);
router.use(enforceVendorCafeScope);

// ── Identity & Authorized Scope ─────────────────────────────────────────────
router.get('/me', getVendorMe);

// ── VEN-SCR-001: Vendor Dashboard Overview ──────────────────────────────────
router.get('/dashboard', getVendorDashboard);

// ── VEN-SCR-002: Vendor Purchase Orders Register & KPI Summaries ─────────────
router.get('/orders', getVendorPurchaseOrders);

// ── VEN-SCR-002: Read-Only Order Details & Downloadable PDF ─────────────────
router.get('/orders/:purchaseOrderId', getVendorOrderDetails);
router.get('/orders/:purchaseOrderId/pdf', downloadVendorOrderPdf);

// ── VEN-SCR-003: Deliveries & Goods Receipt (GRN) Register & Summaries ──────
router.get('/deliveries', getVendorDeliveries);
router.get('/grns', getVendorDeliveries);

// ── VEN-SCR-003: Read-Only Delivery / GRN Details & PDF Download ───────────
router.get('/deliveries/:deliveryId/pdf', downloadVendorGrnPdf);
router.get('/grns/:grnId/pdf', downloadVendorGrnPdf);
router.get('/deliveries/:deliveryId/attachments/:attachmentId', downloadVendorGrnAttachment);
router.get('/grns/:grnId/attachments/:attachmentId', downloadVendorGrnAttachment);
router.get('/deliveries/:deliveryId', getVendorDeliveryDetails);
router.get('/grns/:grnId', getVendorDeliveryDetails);
router.get('/orders/:purchaseOrderId/grns/:grnId', getVendorDeliveryDetails);

// ── VEN-SCR-004: Invoices Register & Read-Only Details ──────────────────────
router.get('/invoices', getVendorInvoices);
router.get('/invoices/:invoiceId/pdf', downloadVendorInvoicePdf);
router.get('/invoices/:invoiceId', getVendorInvoiceDetails);

// ── VEN-SCR-005: Payments & Balance Register & Read-Only Details ────────────
router.get('/payments', getVendorPayments);
router.get('/payments/:paymentId/receipt', downloadVendorPaymentReceiptPdf);
router.get('/payments/:paymentId/pdf', downloadVendorPaymentReceiptPdf);
router.get('/payments/:paymentId', getVendorPaymentDetails);

// ── VEN-SCR-006: Account Statement & Subledger Progression ─────────────────
router.get('/statement', getVendorAccountStatement);
router.get('/statement/pdf', downloadVendorStatementPdf);
router.get('/statement/csv', downloadVendorStatementCsv);
router.get('/statement/xlsx', downloadVendorStatementXlsx);

// ── VEN-SCR-007: Outstanding Receivables & Ageing Register ─────────────────
router.get('/receivables', getVendorReceivables);
router.get('/receivables/pdf', downloadVendorReceivablesPdf);
router.get('/receivables/csv', downloadVendorReceivablesCsv);
router.get('/receivables/xlsx', downloadVendorReceivablesXlsx);

// ── VEN-SCR-008: Returns, Debit Notes, Credit Notes & Adjustments ──────────
router.get('/adjustments', getVendorAdjustments);
router.get('/adjustments/csv', downloadVendorAdjustmentsCsv);
router.get('/adjustments/xlsx', downloadVendorAdjustmentsXlsx);
router.get('/adjustments/:adjustmentId/pdf', downloadVendorAdjustmentPdf);
router.get('/adjustments/:adjustmentId', getVendorAdjustmentDetails);

// ── VEN-SCR-009: Products & Approved Pricing Register ──────────────────────
router.get('/products', getVendorProducts);
router.get('/pricing', getVendorProducts);
router.get('/products/csv', downloadVendorProductsCsv);
router.get('/products/xlsx', downloadVendorProductsXlsx);
router.get('/products/:itemId/pdf', downloadVendorProductPdf);
router.get('/products/:itemId', getVendorProductDetails);

// ── VEN-SCR-010: Documents Centre Register & Downloads ─────────────────────
router.get('/documents', getVendorDocuments);
router.get('/documents/csv', downloadVendorDocumentsCsv);
router.get('/documents/xlsx', downloadVendorDocumentsXlsx);
router.get('/documents/:docId/download', downloadVendorDocumentUniversal);
router.get('/documents/:documentId/file', downloadVendorDocumentFile);

// ── VEN-SCR-011: Reports Centre & Multi-Report Export ──────────────────────
router.get('/reports', getVendorReports);
router.get('/reports/csv', downloadVendorReportsCsv);
router.get('/reports/xlsx', downloadVendorReportsXlsx);
router.get('/reports/:reportType/csv', downloadVendorReportsCsv);
router.get('/reports/:reportType/xlsx', downloadVendorReportsXlsx);
router.get('/reports/:reportType/pdf', downloadVendorReportsPdf);
router.get('/reports/:reportType', getVendorReports);

// ── VEN-SCR-012: Read-Only Notifications & Event Feed ────────────────────────
router.get('/notifications/csv', downloadVendorNotificationsCsv);
router.get('/notifications/xlsx', downloadVendorNotificationsXlsx);
router.get('/notifications', getVendorNotifications);

// ── VEN-SCR-013: Read-Only Vendor Profile & Compliance Card ─────────────────
router.get('/profile/pdf', downloadVendorProfilePdf);
router.get('/profile', getVendorProfile);

module.exports = router;

