'use strict';

const express = require('express');
const { authenticate } = require('../middleware/authenticate');
const {
  submitDailyClosePack,
  listDailyClosePacks,
  getDailyClosePack,
  reviewDailyClosePack,
} = require('../controllers/dailyCloseController');

const router = express.Router();

router.use(authenticate);

router.post('/', submitDailyClosePack);
router.get('/', listDailyClosePacks);
router.get('/packs', listDailyClosePacks);
router.get('/:packId', getDailyClosePack);
router.post('/:packId/review', reviewDailyClosePack);

module.exports = router;

