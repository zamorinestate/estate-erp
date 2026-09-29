'use strict';

const express = require('express');
const { authenticate } = require('../middleware/authenticate');
const { attachDeviceContext } = require('../middleware/deviceContext');
const { authorize } = require('../middleware/authorize');
const {
  getCafeTerminals,
  saveTerminalConfig,
  issueDiagnosticTestPrint,
  triggerDrawerKick,
  routeKotTickets,
  getTerminalHealth,
  renderHtmlReceiptFallback,
} = require('../controllers/hardwareController');

const router = express.Router();

router.use(authenticate);
router.use(attachDeviceContext);

// 1. Terminals listing per café
router.get(
  '/terminals/:cafeId',
  authorize('CAFE:READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF'] }),
  getCafeTerminals
);

// 2. Terminal registration & configuration
router.post(
  '/terminals',
  authorize('CAFE:WRITE', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  saveTerminalConfig
);

// 3. Diagnostic test print ticket
router.post(
  '/test-print',
  authorize('CAFE:WRITE', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  issueDiagnosticTestPrint
);

// 4. Cash drawer kick pulse (Authorized sale or test)
router.post(
  '/drawer/kick',
  authorize('POS:OPERATE', { allowedRoles: ['MASTER', 'CAFE_ADMIN', 'STAFF'] }),
  triggerDrawerKick
);

// 5. KOT multi-station routing
router.post(
  '/kot/route',
  authorize('POS:OPERATE', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF'] }),
  routeKotTickets
);

// 6. Terminal status and health check
router.get(
  '/terminals/:terminalId/health',
  authorize('CAFE:READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF'] }),
  getTerminalHealth
);

// 7. Browser fallback HTML receipt preview
router.post(
  '/receipt/preview-html',
  authorize('POS:OPERATE', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF'] }),
  renderHtmlReceiptFallback
);

module.exports = router;
