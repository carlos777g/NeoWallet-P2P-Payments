const request = require('supertest');

// Mock the service layer to test controller error paths in isolation
jest.mock('../src/services/accountService');

const app = require('../src/app');
const accountService = require('../src/services/accountService');

afterEach(() => {
  jest.clearAllMocks();
});

describe('GET /health', () => {
  test('returns 200 with service status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('404 handler', () => {
  test('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/unknown/route');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  test('returns 404 for unknown POST routes', async () => {
    const res = await request(app).post('/unknown/route').send({});
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });
});

describe('GET /accounts/:id - service failure', () => {
  test('returns 500 when service throws unexpected error', async () => {
    accountService.getUserById.mockRejectedValueOnce(new Error('DB connection lost'));

    const res = await request(app).get('/accounts/1');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_error');
  });
});

describe('POST /api/recharge - service failure', () => {
  test('returns 500 when rechargeBalance throws after user validation passes', async () => {
    accountService.getUserById.mockResolvedValueOnce({
      id: 1,
      name: 'User A',
      email: 'user.a@neowallet.com',
      balance: 1000,
    });
    accountService.rechargeBalance.mockRejectedValueOnce(new Error('Write failed'));

    const res = await request(app)
      .post('/api/recharge')
      .send({ user_id: 1, amount: 100 });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_error');
  });
});

describe('POST /accounts/update-balance - service failure', () => {
  test('returns 500 when updateBalance throws unexpected error without error code', async () => {
    accountService.updateBalance.mockRejectedValueOnce(new Error('Unexpected DB error'));

    const res = await request(app)
      .post('/accounts/update-balance')
      .send({ user_id: 1, amount: 100, operation: 'debit' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_error');
  });

  test('returns 400 for insufficient_funds error code from service', async () => {
    const err = new Error('Insufficient funds');
    err.code = 'INSUFFICIENT_FUNDS';
    accountService.updateBalance.mockRejectedValueOnce(err);

    const res = await request(app)
      .post('/accounts/update-balance')
      .send({ user_id: 2, amount: 9999, operation: 'debit' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('insufficient_funds');
  });

  test('returns 404 for user_not_found error code from service', async () => {
    const err = new Error('User not found');
    err.code = 'USER_NOT_FOUND';
    accountService.updateBalance.mockRejectedValueOnce(err);

    const res = await request(app)
      .post('/accounts/update-balance')
      .send({ user_id: 9999, amount: 100, operation: 'debit' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('user_not_found');
  });
});
