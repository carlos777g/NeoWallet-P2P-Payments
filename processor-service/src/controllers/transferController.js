const transactionService = require('../services/transactionService');

const transfer = async (req, res) => {
  const { sender_id, receiver_id, amount } = req.body;

  const parsedSender = parseInt(sender_id, 10);
  const parsedReceiver = parseInt(receiver_id, 10);
  const parsedAmount = parseFloat(amount);

  if (isNaN(parsedSender) || isNaN(parsedReceiver)) {
    return res.status(400).json({
      error: 'invalid_user_id',
      message: 'sender_id and receiver_id must be numbers',
    });
  }

  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({
      error: 'invalid_amount',
      message: 'amount must be a positive number',
    });
  }

  try {
    const result = await transactionService.executeTransfer(
      parsedSender,
      parsedReceiver,
      parsedAmount
    );
    return res.status(200).json({ message: 'Transfer completed successfully', data: result });
  } catch (err) {
    const errorMap = {
      SELF_TRANSFER_NOT_ALLOWED: 400,
      INVALID_AMOUNT: 400,
      INSUFFICIENT_FUNDS: 400,
      USER_NOT_FOUND: 404,
      DEBIT_FAILED: 500,
      CREDIT_FAILED_COMPENSATED: 500,
    };

    const statusCode = errorMap[err.code] || 500;
    return res.status(statusCode).json({ error: err.code?.toLowerCase(), message: err.message });
  }
};

const getTransactions = async (req, res) => {
  const userId = parseInt(req.params.userId, 10);

  if (isNaN(userId)) {
    return res.status(400).json({ error: 'invalid_user_id', message: 'User ID must be a number' });
  }

  try {
    const transactions = await transactionService.getTransactionsByUser(userId);
    return res.status(200).json({ data: transactions });
  } catch (err) {
    console.error('[getTransactions] Error:', err.message);
    return res.status(500).json({ error: 'internal_error', message: 'Internal server error' });
  }
};

module.exports = { transfer, getTransactions };
