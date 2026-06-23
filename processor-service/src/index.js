require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`[Processor Service] Running on port ${PORT}`);
});
