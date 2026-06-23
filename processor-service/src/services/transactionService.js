const pool = require('../db/connection');
const axios = require('axios');

const ACCOUNTS_SERVICE_URL = process.env.ACCOUNTS_SERVICE_URL || 'http://localhost:3000';

/**
 * Creates a transaction record with PENDING status.
 */
const createTransaction = async (senderId, receiverId, amount) => {
  const result = await pool.query(
    `INSERT INTO transactions (sender_id, receiver_id, amount, status)
     VALUES ($1, $2, $3, 'PENDING') RETURNING *`,
    [senderId, receiverId, amount]
  );
  return result.rows[0];
};

/**
 * Updates transaction status and optionally sets an error message.
 */
const updateTransactionStatus = async (transactionId, status, errorMessage = null) => {
  await pool.query(
    `UPDATE transactions SET status = $1, error_message = $2 WHERE id = $3`,
    [status, errorMessage, transactionId]
  );
};

/**
 * Calls Accounts Service to perform a debit or credit operation.
 */
const updateAccountBalance = async (userId, amount, operation) => {
  const response = await axios.post(
    `${ACCOUNTS_SERVICE_URL}/accounts/update-balance`,
    { user_id: userId, amount, operation }
  );
  return response.data;
};

/**
 * Validates that a user exists by calling Accounts Service.
 * Returns user data or throws with appropriate error code.
 */
const validateUser = async (userId) => {
  try {
    const response = await axios.get(`${ACCOUNTS_SERVICE_URL}/accounts/${userId}`);
    return response.data.data;
  } catch (err) {
    if (err.response?.status === 404) {
      const error = new Error(`User ${userId} not found`);
      error.code = 'USER_NOT_FOUND';
      throw error;
    }
    throw err;
  }
};

/**
 * Executes a P2P transfer using a synchronous Saga pattern.
 *
 * Saga steps:
 *   1. Validate both users exist
 *   2. Validate sender has sufficient funds
 *   3. Create transaction record (PENDING)
 *   4. Debit sender -> status: DEBITED
 *   5. Credit receiver -> status: COMPLETED
 *
 * Compensation:
 *   If step 5 fails, revert step 4 (credit sender back) -> status: ROLLED_BACK
 *   If step 4 fails, no compensation needed -> status: FAILED
 */
const executeTransfer = async (senderId, receiverId, amount) => {
  // --- Pre-saga validations ---
  if (senderId === receiverId) {
    const error = new Error('Self transfers are not allowed');
    error.code = 'SELF_TRANSFER_NOT_ALLOWED';
    throw error;
  }

  if (amount <= 0) {
    const error = new Error('Amount must be greater than zero');
    error.code = 'INVALID_AMOUNT';
    throw error;
  }

  // Validate both users exist before creating any record
  const sender = await validateUser(senderId);
  await validateUser(receiverId);

  // Validate sufficient funds before any mutation
  if (parseFloat(sender.balance) < amount) {
    const error = new Error('Insufficient funds');
    error.code = 'INSUFFICIENT_FUNDS';
    throw error;
  }

  // --- Saga begins ---
  const transaction = await createTransaction(senderId, receiverId, amount);
  const transactionId = transaction.id;

  // Step 1: Debit sender
  try {
    await updateAccountBalance(senderId, amount, 'debit');
    await updateTransactionStatus(transactionId, 'DEBITED');
  } catch (err) {
    await updateTransactionStatus(transactionId, 'FAILED', err.message);
    const error = new Error('Failed to debit sender');
    error.code = 'DEBIT_FAILED';
    throw error;
  }

  // Step 2: Credit receiver
  try {
    await updateAccountBalance(receiverId, amount, 'credit');
    await updateTransactionStatus(transactionId, 'COMPLETED');
  } catch (err) {
    // Compensation: revert the debit
    console.error(`[Saga] Credit failed for transaction ${transactionId}. Initiating compensation...`);
    try {
      await updateAccountBalance(senderId, amount, 'credit');
      await updateTransactionStatus(transactionId, 'ROLLED_BACK', err.message);
      console.log(`[Saga] Compensation successful for transaction ${transactionId}`);
    } catch (compensationErr) {
      // Critical state: money was debited but neither credited nor returned
      // Requires manual intervention — log with highest severity
      console.error(
        `[Saga][CRITICAL] Compensation FAILED for transaction ${transactionId}.`,
        `Manual intervention required. Error: ${compensationErr.message}`
      );
      await updateTransactionStatus(
        transactionId,
        'ROLLED_BACK',
        `COMPENSATION_FAILED: ${compensationErr.message}`
      );
    }

    const error = new Error('Transfer failed during credit phase, debit has been reversed');
    error.code = 'CREDIT_FAILED_COMPENSATED';
    throw error;
  }

  return { transaction_id: transactionId, status: 'COMPLETED', amount };
};

/**
 * Retrieves all transactions where the user is sender or receiver.
 */
const getTransactionsByUser = async (userId) => {
  const result = await pool.query(
    `SELECT * FROM transactions
     WHERE sender_id = $1 OR receiver_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows;
};

module.exports = { executeTransfer, getTransactionsByUser };
