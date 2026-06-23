require('dotenv').config();
const express = require('express');
const accountRoutes = require('./routes/accountRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'accounts-service' });
});

app.use('/', accountRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'not_found', message: `Route ${req.method} ${req.path} not found` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Server] Unhandled error:', err);
  res.status(500).json({ error: 'internal_error', message: 'Internal server error' });
});

// app.listen(PORT, () => {
//   console.log(`[Accounts Service] Running on port ${PORT}`);
// });
module.exports = app;
