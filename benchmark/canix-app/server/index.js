const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const crmRoutes = require('./routes/crm');
app.use(crmRoutes);

const quotesRoutes = require('./routes/quotes');
app.use(quotesRoutes);

const ticketsRoutes = require('./routes/tickets');
app.use(ticketsRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
