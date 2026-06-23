require('dotenv').config();
const express = require('express');
const transferRoutes = require('./routes/transferRoutes');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'processor-service' });
});

app.use('/', transferRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'not_found', message: `Route ${req.method} ${req.path} not found` });
});

app.use((err, req, res, next) => {
  console.error('[Server] Unhandled error:', err);
  res.status(500).json({ error: 'internal_error', message: 'Internal server error' });
});

// app.listen(PORT, () => {
//   console.log(`[Processor Service] Running on port ${PORT}`);
// });

module.exports = app;
