const request = require('supertest');
const { Pool } = require('pg');
const app = require('../src/app');

const testPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5435,
  database: process.env.DB_NAME || 'processor_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

// We also need to reset accounts balances via accounts-service DB directly
const accountsPool = new Pool({
  host: 'localhost',
  port: 5434,
  database: 'accounts_db',
  user: 'postgres',
  password: 'postgres',
});

beforeEach(async () => {
  await accountsPool.query(`
    UPDATE users SET balance = 1000.00 WHERE id = 1;
    UPDATE users SET balance = 50.00 WHERE id = 2;
    UPDATE users SET balance = 0.00 WHERE id = 3;
  `);
  await testPool.query('DELETE FROM transactions');
});

afterAll(async () => {
  await testPool.end();
  await accountsPool.end();
});

// --- POST /api/transfer ---
describe('POST /api/transfer', () => {
  test('successfully transfers and updates both balances', async () => {
    const res = await request(app)
      .post('/api/transfer')
      .send({ sender_id: 1, receiver_id: 2, amount: 100 });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('transaction_id');
    expect(res.body.data.status).toBe('COMPLETED');

    // Verify balances changed correctly — money conservation check
    const sender = await accountsPool.query('SELECT balance FROM users WHERE id = 1');
    const receiver = await accountsPool.query('SELECT balance FROM users WHERE id = 2');
    expect(parseFloat(sender.rows[0].balance)).toBe(900);
    expect(parseFloat(receiver.rows[0].balance)).toBe(150);
  });

  test('total money in system remains constant after transfer', async () => {
    const before = await accountsPool.query('SELECT SUM(balance) as total FROM users');
    const totalBefore = parseFloat(before.rows[0].total);

    await request(app)
      .post('/api/transfer')
      .send({ sender_id: 1, receiver_id: 2, amount: 200 });

    const after = await accountsPool.query('SELECT SUM(balance) as total FROM users');
    const totalAfter = parseFloat(after.rows[0].total);

    expect(totalAfter).toBe(totalBefore);
  });

  test('rejects self-transfer with 400', async () => {
    const res = await request(app)
      .post('/api/transfer')
      .send({ sender_id: 1, receiver_id: 1, amount: 100 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('self_transfer_not_allowed');
  });

  test('rejects transfer with insufficient funds', async () => {
    const res = await request(app)
      .post('/api/transfer')
      .send({ sender_id: 2, receiver_id: 1, amount: 9999 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('insufficient_funds');
  });

  test('rejects negative amount', async () => {
    const res = await request(app)
      .post('/api/transfer')
      .send({ sender_id: 1, receiver_id: 2, amount: -50 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_amount');
  });

  test('rejects zero amount', async () => {
    const res = await request(app)
      .post('/api/transfer')
      .send({ sender_id: 1, receiver_id: 2, amount: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_amount');
  });

  test('rejects non-existent sender', async () => {
    const res = await request(app)
      .post('/api/transfer')
      .send({ sender_id: 9999, receiver_id: 2, amount: 100 });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('user_not_found');
  });

  test('rejects non-existent receiver', async () => {
    const res = await request(app)
      .post('/api/transfer')
      .send({ sender_id: 1, receiver_id: 9999, amount: 100 });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('user_not_found');
  });

  test('transaction record is created with COMPLETED status', async () => {
    await request(app)
      .post('/api/transfer')
      .send({ sender_id: 1, receiver_id: 2, amount: 100 });

    const result = await testPool.query(
      'SELECT * FROM transactions WHERE sender_id = 1 AND receiver_id = 2'
    );
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].status).toBe('COMPLETED');
  });
});

// --- GET /api/transactions/:userId ---
describe('GET /api/transactions/:userId', () => {
  test('returns transactions for a user', async () => {
    await request(app)
      .post('/api/transfer')
      .send({ sender_id: 1, receiver_id: 2, amount: 50 });

    const res = await request(app).get('/api/transactions/1');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  test('returns empty array when user has no transactions', async () => {
    const res = await request(app).get('/api/transactions/3');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  test('returns 400 for invalid user id', async () => {
    const res = await request(app).get('/api/transactions/abc');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_user_id');
  });
});
