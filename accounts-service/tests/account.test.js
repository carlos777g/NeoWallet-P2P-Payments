const request = require('supertest');
const { Pool } = require('pg');

// We need the app without auto-starting the server
// So we refactor index.js slightly — explained below
const app = require('../src/app');

const testPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5434,
  database: process.env.DB_NAME || 'accounts_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

beforeEach(async () => {
  // Reset balances to known state before each test
  await testPool.query(`
    UPDATE users SET balance = 1000.00 WHERE id = 1;
    UPDATE users SET balance = 50.00 WHERE id = 2;
    UPDATE users SET balance = 0.00 WHERE id = 3;
  `);
});

afterAll(async () => {
  await testPool.end();
  // Close the pool the app itself opened, otherwise Jest reports a leaked handle
  await require('../src/db/connection').end();
});

// --- GET /accounts/:id ---
describe('GET /accounts/:id', () => {
  test('returns 200 with user data for existing user', async () => {
    const res = await request(app).get('/accounts/1');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('id', 1);
    expect(res.body.data).toHaveProperty('balance');
  });

  test('returns 404 for non-existent user', async () => {
    const res = await request(app).get('/accounts/9999');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('user_not_found');
  });

  test('returns 400 for invalid user id', async () => {
    const res = await request(app).get('/accounts/abc');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_user_id');
  });
});

// --- POST /api/recharge ---
describe('POST /api/recharge', () => {
  test('successfully recharges balance and returns new balance', async () => {
    const res = await request(app)
      .post('/api/recharge')
      .send({ user_id: 3, amount: 200 });

    expect(res.status).toBe(200);
    expect(res.body.data.new_balance).toBe(200);
  });

  test('rejects negative amount with 400', async () => {
    const res = await request(app)
      .post('/api/recharge')
      .send({ user_id: 1, amount: -50 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_amount');
  });

  test('rejects zero amount with 400', async () => {
    const res = await request(app)
      .post('/api/recharge')
      .send({ user_id: 1, amount: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_amount');
  });

  test('rejects non-numeric amount with 400', async () => {
    const res = await request(app)
      .post('/api/recharge')
      .send({ user_id: 1, amount: 'abc' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_amount');
  });

  test('returns 404 for non-existent user', async () => {
    const res = await request(app)
      .post('/api/recharge')
      .send({ user_id: 9999, amount: 100 });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('user_not_found');
  });
});

// --- POST /accounts/update-balance ---
describe('POST /accounts/update-balance', () => {
  test('successfully debits balance', async () => {
    const res = await request(app)
      .post('/accounts/update-balance')
      .send({ user_id: 1, amount: 100, operation: 'debit' });

    expect(res.status).toBe(200);
    expect(res.body.data.previous_balance).toBe(1000);
    expect(res.body.data.new_balance).toBe(900);
  });

  test('successfully credits balance', async () => {
    const res = await request(app)
      .post('/accounts/update-balance')
      .send({ user_id: 2, amount: 50, operation: 'credit' });

    expect(res.status).toBe(200);
    expect(res.body.data.previous_balance).toBe(50);
    expect(res.body.data.new_balance).toBe(100);
  });

  test('rejects debit when insufficient funds', async () => {
    const res = await request(app)
      .post('/accounts/update-balance')
      .send({ user_id: 2, amount: 9999, operation: 'debit' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('insufficient_funds');
  });

  test('rejects invalid operation', async () => {
    const res = await request(app)
      .post('/accounts/update-balance')
      .send({ user_id: 1, amount: 100, operation: 'transfer' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_operation');
  });

  test('returns 404 for non-existent user', async () => {
    const res = await request(app)
      .post('/accounts/update-balance')
      .send({ user_id: 9999, amount: 100, operation: 'debit' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('user_not_found');
  });
});
