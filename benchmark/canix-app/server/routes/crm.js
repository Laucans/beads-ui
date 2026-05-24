const express = require('express');
const router = express.Router();

const dbPath = require('path').resolve(__dirname, '..', '..', process.env.DB_PATH || './data/app.db');
const Database = require('better-sqlite3');
const db = new Database(dbPath);

const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

router.get('/crm/clients', requireAuth, (req, res) => {
  try {
    const clients = db.prepare('SELECT * FROM clients').all();
    res.json(clients);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/crm/clients', requireAuth, (req, res) => {
  try {
    const { name, email, phone, company } = req.body;
    const result = db.prepare(
      'INSERT INTO clients (name, email, phone, company) VALUES (?, ?, ?, ?)'
    ).run(name, email, phone, company);
    res.status(201).json({ id: result.lastInsertRowid, name, email, phone, company });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/crm/clients/:id', requireAuth, (req, res) => {
  try {
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.json(client);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/crm/clients/:id', requireAuth, (req, res) => {
  try {
    const { name, email, phone, company } = req.body;
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    db.prepare(
      'UPDATE clients SET name = ?, email = ?, phone = ?, company = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(name, email, phone, company, req.params.id);
    res.json({ id: req.params.id, name, email, phone, company });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
