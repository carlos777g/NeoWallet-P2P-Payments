const express = require('express');
const router = express.Router();
const { transfer, getTransactions } = require('../controllers/transferController');

router.post('/api/transfer', transfer);
router.get('/api/transactions/:userId', getTransactions);

module.exports = router;
