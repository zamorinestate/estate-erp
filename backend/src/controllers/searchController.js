'use strict';

/**
 * SEARCH CONTROLLER
 *
 * Permission-aware search across system entities.
 * Personal Ledger results are restricted to MASTER and OWNER and scoped to the authenticated owner.
 */

const { User } = require('../models/User');
const { MenuItem } = require('../models/MenuItem');
const { GlobalInventoryItem } = require('../models/GlobalInventoryItem');
const { Vendor } = require('../models/Vendor');
const { Bill } = require('../models/Bill');
const { PersonalLedger } = require('../models/PersonalLedger');
const { PurchaseOrder } = require('../models/PurchaseOrder');
const { TaxInvoice } = require('../models/TaxInvoice');
const { BusinessDocument } = require('../models/BusinessDocument');
const { Customer } = require('../models/Customer');
const { Asset } = require('../models/Asset');
const { Cafe } = require('../models/Cafe');

const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');
const { maskPhone, maskEmail } = require('../utils/dataClassifier');

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const performGlobalSearch = asyncHandler(async (request, response) => {
  const query = request.query.q || request.query.query;
  const qText = typeof query === 'string' ? query.trim() : '';

  if (qText.length < 2) {
    return response.status(200).json({
      success: true,
      data: { results: {} },
      correlationId: request.correlationId || null,
    });
  }

  const orgId = request.auth.organisationId;
  const role = request.auth.role;
  const regex = new RegExp(escapeRegExp(qText), 'i');

  const promises = [];

  // 1. Employees (MASTER and OWNER directory search only)
  if (['MASTER', 'OWNER'].includes(role)) {
    const empConditions = [
      { name: regex },
      { preferredName: regex },
      { userId: regex },
      { email: regex },
      { phone: regex },
      { employeeSearchTerms: qText.trim().toLowerCase() },
    ];

    let empFilter = {
      organisationId: orgId,
      $or: empConditions,
    };

    if (role === 'OWNER') {
      const authorizedCafes = (request.auth.assignedCafeIds || [])
        .map((c) => String(c).trim().toUpperCase())
        .filter(Boolean);
      empFilter = {
        $and: [
          empFilter,
          {
            $or: [
              { primaryCafeId: { $in: authorizedCafes } },
              { assignedCafeIds: { $in: authorizedCafes } },
            ],
          },
        ],
      };
    }

    promises.push(
      User.find(empFilter)
        .select('userId name preferredName role primaryCafeId')
        .limit(5)
        .lean()
        .then((res) => ({
          type: 'EMPLOYEES',
          items: res.map((e) => {
            const hasPreferred = e.preferredName && e.preferredName.trim() && e.preferredName.trim() !== e.name;
            const title = hasPreferred ? `${e.name} (${e.preferredName.trim()})` : (e.name || e.userId || 'Unknown');
            return {
              id: e.userId,
              title,
              subtitle: `${e.role || 'STAFF'} · ${e.userId}`,
              route: 'employees',
            };
          }),
        }))
    );
  }

  // 2. Menu Items (MASTER, OWNER and CAFE_ADMIN only)
  if (['MASTER', 'OWNER', 'CAFE_ADMIN'].includes(role)) {
    const menuRoute = role === 'MASTER' ? 'menu' : role === 'OWNER' ? 'reports' : 'pos';
    promises.push(
      MenuItem.find({
        organisationId: orgId,
        $or: [{ name: regex }, { hsnCode: regex }, { category: regex }],
      })
        .select('menuItemId name category currentPricePaisa hsnCode')
        .limit(5)
        .lean()
        .then((res) => ({
          type: 'MENU_ITEMS',
          items: res.map((m) => ({
            id: m.menuItemId,
            title: m.name,
            subtitle: `${m.category} • ₹${m.currentPricePaisa / 100}${m.hsnCode ? ' • HSN:' + m.hsnCode : ''}`,
            route: menuRoute,
          })),
        }))
    );
  }
  // 3. Inventory Items (MASTER, OWNER and CAFE_ADMIN only)
  if (['MASTER', 'OWNER', 'CAFE_ADMIN'].includes(role)) {
    const invRoute = role === 'OWNER' ? 'finance' : 'inventory';
    promises.push(
      GlobalInventoryItem.find({
        organisationId: orgId,
        $or: [{ name: regex }, { hsnSacCode: regex }, { hsnCode: regex }, { category: regex }],
      })
        .select('itemId name category baseUnit hsnCode hsnSacCode')
        .limit(5)
        .lean()
        .then((res) => ({
          type: 'INVENTORY_ITEMS',
          items: res.map((i) => ({
            id: i.itemId,
            title: i.name,
            subtitle: `${i.category} (${i.baseUnit})`,
            route: invRoute,
          })),
        }))
    );
  }
  // 4. Vendors (MASTER and OWNER only)
  if (['MASTER', 'OWNER'].includes(role)) {
    const vendorRoute = role === 'MASTER' ? 'vendors' : 'reports';
    promises.push(
      Vendor.find({ organisationId: orgId, name: regex }).select('vendorId name category status').limit(5).lean()
        .then((res) => ({ type: 'VENDORS', items: res.map((v) => ({ id: v.vendorId, title: v.name, subtitle: `${v.category} (${v.status})`, route: vendorRoute })) }))
    );
  }

  // 5. Bills / Receipts (MASTER, OWNER and CAFE_ADMIN only)
  if (['MASTER', 'OWNER', 'CAFE_ADMIN'].includes(role)) {
    const billFilter = { organisationId: orgId, $or: [{ billId: regex }, { tableNumber: regex }, { customerPhone: regex }] };
    if (role === 'CAFE_ADMIN') {
      billFilter.cafeId = request.auth.primaryCafeId || { $in: request.auth.assignedCafeIds || [] };
    } else if (role === 'OWNER') {
      billFilter.cafeId = { $in: request.auth.assignedCafeIds || [] };
    }

    const billRoute = ['MASTER', 'OWNER'].includes(role) ? 'bills' : 'pos';

    promises.push(
      Bill.find(billFilter).select('billId totalPaisa status businessDate orderType').limit(5).lean()
        .then((res) => ({ type: 'BILLS', items: res.map((b) => ({ id: b.billId, title: b.billId, subtitle: `₹${b.totalPaisa / 100} • ${b.status} • ${b.businessDate}`, route: billRoute })) }))
    );
  }
  // 6. Personal Ledger (MASTER only; always scoped to the authenticated Master owner)
  if (role === 'MASTER') {
    const ledgerFilter = {
      organisationId: orgId,
      ownerUserId: request.auth.userId,
      $or: [
        { ledgerEntryId: regex },
        { description: regex },
        { counterparty: regex },
        { externalReference: regex },
        { category: regex },
        { entryType: regex },
      ],
    };

    promises.push(
      PersonalLedger.find(ledgerFilter)
        .select('ledgerEntryId entryType category amountPaisa businessDate description counterparty externalReference')
        .limit(5)
        .lean()
        .then((res) => ({
          type: 'PERSONAL_LEDGER',
          items: res.map((entry) => ({
            id: entry.ledgerEntryId,
            title: entry.description || entry.ledgerEntryId,
            subtitle: [entry.entryType, entry.category, entry.businessDate].filter(Boolean).join(' | '),
            route: 'ledger',
          })),
        }))
    );
  }

  // 7. Purchase Orders (MASTER, OWNER, CAFE_ADMIN)
  if (['MASTER', 'OWNER', 'CAFE_ADMIN'].includes(role)) {
    const poFilter = {
      organisationId: orgId,
      $or: [
        { poId: regex },
        { poNumber: regex },
        { vendorName: regex },
      ],
    };
    if (role === 'CAFE_ADMIN') {
      poFilter.cafeId = request.auth.primaryCafeId || { $in: request.auth.assignedCafeIds || [] };
    } else if (role === 'OWNER') {
      poFilter.cafeId = { $in: request.auth.assignedCafeIds || [] };
    }

    promises.push(
      PurchaseOrder.find(poFilter)
        .select('poId poNumber vendorName status totalAmount')
        .limit(5)
        .lean()
        .then((res) => ({
          type: 'PURCHASE_ORDERS',
          items: res.map((p) => ({
            id: p.poId,
            title: p.poNumber || p.poId,
            subtitle: `${p.vendorName || 'Vendor'} • ₹${p.totalAmount || 0} • ${p.status}`,
            route: 'purchases',
          })),
        }))
    );
  }

  // 8. Tax Invoices (MASTER, OWNER, CAFE_ADMIN)
  if (['MASTER', 'OWNER', 'CAFE_ADMIN'].includes(role)) {
    const invFilter = {
      organisationId: orgId,
      $or: [
        { invoiceNumber: regex },
        { gstin: regex },
        { customerName: regex },
        { customerPhone: regex },
      ],
    };
    if (role === 'CAFE_ADMIN') {
      invFilter.cafeId = request.auth.primaryCafeId || { $in: request.auth.assignedCafeIds || [] };
    } else if (role === 'OWNER') {
      invFilter.cafeId = { $in: request.auth.assignedCafeIds || [] };
    }

    promises.push(
      TaxInvoice.find(invFilter)
        .select('invoiceNumber totalAmount status issueDate cafeId')
        .limit(5)
        .lean()
        .then((res) => ({
          type: 'TAX_INVOICES',
          items: res.map((inv) => ({
            id: inv.invoiceNumber,
            title: inv.invoiceNumber,
            subtitle: `₹${inv.totalAmount || 0} • ${inv.status || 'ISSUED'} • ${inv.issueDate ? new Date(inv.issueDate).toISOString().split('T')[0] : ''}`,
            route: 'invoices',
          })),
        }))
    );
  }

  // 9. Business Documents (MASTER, OWNER, CAFE_ADMIN)
  if (['MASTER', 'OWNER', 'CAFE_ADMIN'].includes(role)) {
    const docFilter = {
      organisationId: orgId,
      $or: [
        { documentId: regex },
        { documentNumber: regex },
        { title: regex },
        { supplierOrEntity: regex },
        { gstin: regex },
      ],
    };
    if (role === 'CAFE_ADMIN') {
      docFilter.cafeId = request.auth.primaryCafeId || { $in: request.auth.assignedCafeIds || [] };
    } else if (role === 'OWNER') {
      docFilter.cafeId = { $in: request.auth.assignedCafeIds || [] };
    }

    promises.push(
      BusinessDocument.find(docFilter)
        .select('documentId documentNumber title documentType status')
        .limit(5)
        .lean()
        .then((res) => ({
          type: 'DOCUMENTS',
          items: res.map((d) => ({
            id: d.documentId,
            title: d.title || d.documentNumber || d.documentId,
            subtitle: `${d.documentType || 'DOCUMENT'} • ${d.status || 'UPLOADED'}`,
            route: 'documents',
          })),
        }))
    );
  }

  // 10. Assets (MASTER, OWNER, CAFE_ADMIN)
  if (['MASTER', 'OWNER', 'CAFE_ADMIN'].includes(role)) {
    const assetFilter = {
      organisationId: orgId,
      $or: [
        { assetId: regex },
        { name: regex },
        { serialNumber: regex },
        { model: regex },
      ],
    };
    if (role === 'CAFE_ADMIN') {
      assetFilter.cafeId = request.auth.primaryCafeId || { $in: request.auth.assignedCafeIds || [] };
    } else if (role === 'OWNER') {
      assetFilter.cafeId = { $in: request.auth.assignedCafeIds || [] };
    }

    promises.push(
      Asset.find(assetFilter)
        .select('assetId name serialNumber status category')
        .limit(5)
        .lean()
        .then((res) => ({
          type: 'ASSETS',
          items: res.map((a) => ({
            id: a.assetId,
            title: a.name || a.assetId,
            subtitle: `${a.category || 'ASSET'} • SN: ${a.serialNumber || 'N/A'} • ${a.status}`,
            route: 'assets',
          })),
        }))
    );
  }

  // 11. Customers (MASTER, OWNER, CAFE_ADMIN)
  if (['MASTER', 'OWNER', 'CAFE_ADMIN'].includes(role)) {
    promises.push(
      Customer.find({
        organisationId: orgId,
        $or: [
          { name: regex },
          { phone: regex },
          { email: regex },
          { gstin: regex },
        ],
      })
        .select('customerId name phone email')
        .limit(5)
        .lean()
        .then((res) => ({
          type: 'CUSTOMERS',
          items: res.map((c) => {
            const isPrivileged = role === 'MASTER' || role === 'OWNER';
            const displayPhone = isPrivileged ? (c.phone || '') : maskPhone(c.phone);
            const displayEmail = isPrivileged ? (c.email || '') : maskEmail(c.email);
            return {
              id: c.customerId,
              title: c.name || displayPhone,
              subtitle: `${displayPhone} ${displayEmail ? '• ' + displayEmail : ''}`.trim(),
              route: 'customers',
            };
          }),
        }))
    );
  }

  // 12. Cafes / Branches (MASTER, OWNER)
  if (['MASTER', 'OWNER'].includes(role)) {
    const cafeFilter = {
      organisationId: orgId,
      $or: [
        { cafeId: regex },
        { name: regex },
        { code: regex },
        { phone: regex },
      ],
    };
    if (role === 'OWNER') {
      cafeFilter.cafeId = { $in: request.auth.assignedCafeIds || [] };
    }

    promises.push(
      Cafe.find(cafeFilter)
        .select('cafeId name code status')
        .limit(5)
        .lean()
        .then((res) => ({
          type: 'CAFES',
          items: res.map((c) => ({
            id: c.cafeId,
            title: c.name || c.cafeId,
            subtitle: `Code: ${c.code || c.cafeId} • ${c.status || 'ACTIVE'}`,
            route: 'cafes',
          })),
        }))
    );
  }
const rawResults = await Promise.all(promises);

  const results = {};
  for (const group of rawResults) {
    if (group.items.length > 0) {
      results[group.type] = group.items;
    }
  }

  return response.status(200).json({
    success: true,
    data: { query: qText, results },
    correlationId: request.correlationId || null,
  });
});

module.exports = {
  performGlobalSearch,
};
