'use strict';

const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');
const hardwareBridgeService = require('../services/hardwareBridgeService');
const { HardwareTerminal } = require('../models/HardwareTerminal');
const { Cafe } = require('../models/Cafe');

/**
 * Retrieve all registered hardware terminals for a café.
 */
const getCafeTerminals = asyncHandler(async (req, res) => {
  const { cafeId } = req.params;
  const { organisationId } = req.auth;

  const terminals = await hardwareBridgeService.getTerminalsForCafe(cafeId, organisationId);
  return res.status(200).json({
    success: true,
    data: { terminals },
  });
});

/**
 * Register or update hardware terminal configuration.
 */
const saveTerminalConfig = asyncHandler(async (req, res) => {
  const terminal = await hardwareBridgeService.registerOrUpdateTerminal(req.body, req.auth);
  return res.status(200).json({
    success: true,
    message: `Terminal ${terminal.terminalId} configuration saved.`,
    data: { terminal },
  });
});

/**
 * Issue a diagnostic test print ticket for a target terminal.
 */
const issueDiagnosticTestPrint = asyncHandler(async (req, res) => {
  const { terminalId, format = 'binary' } = req.body;
  const { organisationId } = req.auth;

  if (!terminalId) {
    throw new ApiError(400, 'TERMINAL_ID_REQUIRED', 'terminalId is required.');
  }

  const terminal = await HardwareTerminal.findOne({
    terminalId: terminalId.trim().toUpperCase(),
    organisationId: organisationId.trim().toUpperCase(),
  });

  if (!terminal) {
    throw new ApiError(404, 'TERMINAL_NOT_FOUND', `Terminal ${terminalId} not found.`);
  }

  const cafe = await Cafe.findOne({ cafeId: terminal.cafeId, organisationId }).lean();
  const cafeInfo = {
    brandName: cafe?.identity?.brandName || 'ZAMORIN CAFE',
    legalName: cafe?.identity?.registeredBusinessName || 'Zamorin Hospitality Private Limited',
    gstin: cafe?.taxAndCommercial?.gstin || null,
  };

  const rawBuffer = hardwareBridgeService.compileDiagnosticTestReceipt(terminal, cafeInfo);

  if (format === 'binary') {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="diagnostic_test_${terminal.terminalId}.bin"`);
    res.setHeader('X-ESC-POS-Bytes', rawBuffer.length);
    return res.status(200).send(rawBuffer);
  }

  return res.status(200).json({
    success: true,
    terminalId: terminal.terminalId,
    bytesLength: rawBuffer.length,
    base64Payload: rawBuffer.toString('base64'),
  });
});

/**
 * Trigger an authorized cash drawer kick on a terminal.
 */
const triggerDrawerKick = asyncHandler(async (req, res) => {
  const { terminalId, reason = 'Manual Cash Drawer Test / Audit', transactionId = null } = req.body;
  if (!terminalId) {
    throw new ApiError(400, 'TERMINAL_ID_REQUIRED', 'terminalId is required.');
  }

  const result = await hardwareBridgeService.issueDrawerKick(terminalId, req.auth, {
    reason,
    transactionId,
  });

  return res.status(200).json({
    success: true,
    message: 'Cash drawer kick pulse emitted.',
    data: {
      terminalId: result.terminalId,
      pin: result.pin,
      triggeredAt: result.triggeredAt,
      base64Pulse: result.kickBuffer.toString('base64'),
    },
  });
});

/**
 * Route order items to multi-station kitchen terminals and compile KOT binary buffers.
 */
const routeKotTickets = asyncHandler(async (req, res) => {
  const { cafeId, kotData = {} } = req.body;
  const { organisationId } = req.auth;

  if (!cafeId) {
    throw new ApiError(400, 'CAFE_ID_REQUIRED', 'cafeId is required for KOT routing.');
  }

  const terminals = await HardwareTerminal.find({
    organisationId: organisationId.trim().toUpperCase(),
    cafeId: cafeId.trim().toUpperCase(),
    deviceType: { $in: ['KDS', 'KITCHEN_STATION', 'POS_COUNTER'] },
  });

  const routedStations = hardwareBridgeService.routeKotItems(kotData.items || [], terminals);
  const dispatched = {};

  for (const [termId, stationInfo] of Object.entries(routedStations)) {
    const stationKotData = {
      ...kotData,
      stationName: stationInfo.terminal.stationRouting?.stationType || 'KITCHEN',
      items: stationInfo.items,
    };
    const buffer = hardwareBridgeService.compileKotTicket(stationKotData, stationInfo.terminal);
    dispatched[termId] = {
      stationType: stationInfo.terminal.stationRouting?.stationType || 'ALL',
      terminalName: stationInfo.terminal.terminalName,
      itemsCount: stationInfo.items.length,
      bytesLength: buffer.length,
      base64Payload: buffer.toString('base64'),
    };
  }

  return res.status(200).json({
    success: true,
    cafeId,
    totalStations: Object.keys(dispatched).length,
    stations: dispatched,
  });
});

/**
 * Get hardware terminal health & status.
 */
const getTerminalHealth = asyncHandler(async (req, res) => {
  const { terminalId } = req.params;
  const health = await hardwareBridgeService.checkTerminalHealth(terminalId, req.auth.organisationId);
  return res.status(200).json({
    success: true,
    data: health,
  });
});

/**
 * Render standard HTML receipt preview for browser window.print() fallback.
 */
const renderHtmlReceiptFallback = asyncHandler(async (req, res) => {
  const { orderData = {}, cafeId, paperWidth } = req.body;
  const { organisationId } = req.auth;

  let cafeInfo = {};
  if (cafeId) {
    const cafe = await Cafe.findOne({ cafeId: cafeId.trim().toUpperCase(), organisationId }).lean();
    if (cafe) {
      cafeInfo = {
        brandName: cafe.identity?.brandName,
        legalName: cafe.identity?.registeredBusinessName,
        address: cafe.identity?.storeAddress?.streetAddress,
        phone: cafe.identity?.primaryPhone,
        gstin: cafe.taxAndCommercial?.gstin,
        fssai: cafe.complianceAndLicences?.fssaiLicenceNumber,
      };
    }
  }

  const width = paperWidth || orderData.paperWidth || 80;
  const html = hardwareBridgeService.generateFallbackHtmlReceipt(orderData, cafeInfo, width);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(html);
});

module.exports = {
  getCafeTerminals,
  saveTerminalConfig,
  issueDiagnosticTestPrint,
  triggerDrawerKick,
  routeKotTickets,
  getTerminalHealth,
  renderHtmlReceiptFallback,
};
