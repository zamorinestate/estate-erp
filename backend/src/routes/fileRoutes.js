'use strict';

/**
 * FILE & DOCUMENT ROUTES
 * Mounted at: /api/v1/files (registered in routes/index.js)
 * Provides legacy private file metadata and delegates business documents to canonical documentRoutes.
 */

const express = require('express');
const { authenticate } = require('../middleware/authenticate');
const { getFileMetadata, registerFileRecord } = require('../controllers/fileController');
const documentRoutes = require('./documentRoutes');

const router = express.Router();
router.use(authenticate);

// ── Legacy Private File endpoints ───────────────────────────────────────────
router.get('/:fileId', getFileMetadata);
router.post('/register', registerFileRecord);

// ── Canonical Business Document Routes Delegation ───────────────────────────
router.use('/documents', documentRoutes);

module.exports = router;
