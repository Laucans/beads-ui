const express = require('express');
const router = express.Router();

const dbPath = require('path').resolve(__dirname, '..', '..', process.env.DB_PATH || './data/app.db');
const Database = require('better-sqlite3');
const db = new Database(dbPath);

const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header required' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Invalid authorization format' });
  }

  const token = parts[1];
  const jwtUtils = require('../utils/jwt');
  const decoded = jwtUtils.verifyAccessToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = decoded;
  next();
};

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    next();
  };
}

function calculateQuoteTotal(quoteId) {
  const stmt = db.prepare(`
    SELECT COALESCE(SUM(unit_price * quantity), 0) as total 
    FROM quote_items 
    WHERE quote_id = ?
  `);
  const result = stmt.get(quoteId);
  return result ? result.total : 0;
}

function updateQuoteTotal(quoteId) {
  const total = calculateQuoteTotal(quoteId);
  const stmt = db.prepare('UPDATE quotes SET total = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  stmt.run(total, quoteId);
  return total;
}

function canTransition(status, targetStatus, userRole) {
  const transitions = {
    draft: ['sent', 'deleted'],
    sent: ['approved', 'rejected']
  };

  if (!transitions[status]) return false;
  return transitions[status].includes(targetStatus);
}

router.get('/api/quotes', requireAuth, (req, res) => {
  try {
    const user = req.user;
    const { role } = user;

    let quotes;
    if (role === 'client') {
      const client = db.prepare('SELECT id FROM clients WHERE email = ?').get(user.email);
      if (!client) {
        return res.status(404).json({ error: 'Client not found' });
      }
      quotes = db.prepare('SELECT * FROM quotes WHERE client_id = ? ORDER BY created_at DESC').all(client.id);
    } else if (role === 'employee') {
      quotes = db.prepare('SELECT * FROM quotes WHERE user_id = ? ORDER BY created_at DESC').all(user.id);
    } else if (role === 'admin') {
      quotes = db.prepare('SELECT * FROM quotes ORDER BY created_at DESC').all();
    } else {
      return res.status(403).json({ error: 'Forbidden' });
    }

    res.json(quotes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/api/quotes', requireAuth, requireRole('employee'), (req, res) => {
  try {
    const user = req.user;
    const { client_id, status, notes } = req.body;

    if (!client_id) {
      return res.status(400).json({ error: 'client_id is required' });
    }

    const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(client_id);
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const stmt = db.prepare(`
      INSERT INTO quotes (client_id, user_id, status, notes, created_at, updated_at)
      VALUES (?, ?, 'draft', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    const result = stmt.run(client_id, user.id, notes || '');

    const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json(quote);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/api/quotes/:id', requireAuth, (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;
    const { role } = user;

    const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(id);
    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    if (role === 'client') {
      const client = db.prepare('SELECT id FROM clients WHERE email = ?').get(user.email);
      if (!client || quote.client_id !== client.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    } else if (role === 'employee') {
      if (quote.user_id !== user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    res.json(quote);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/api/quotes/:id', requireAuth, (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;
    const { role } = user;
    const { status, client_id, notes } = req.body;

    const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(id);
    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    if (role === 'admin') {
      if (!status || !['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status. Must be approved or rejected' });
      }
      if (quote.status !== 'sent') {
        return res.status(400).json({ error: `Cannot transition from ${quote.status} to ${status}` });
      }

      const stmt = db.prepare('UPDATE quotes SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
      stmt.run(status, id);

      const updatedQuote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(id);
      res.json(updatedQuote);
      return;
    }

    if (role === 'employee') {
      if (quote.user_id !== user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      if (status && status !== 'sent') {
        return res.status(400).json({ error: 'Employees can only transition draft to sent' });
      }

      if (quote.status !== 'draft') {
        return res.status(400).json({ error: `Cannot transition from ${quote.status}. Only draft quotes can be edited.` });
      }

      const updates = [];
      const values = [];

      if (client_id) {
        const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(client_id);
        if (!client) {
          return res.status(404).json({ error: 'Client not found' });
        }
        updates.push('client_id = ?');
        values.push(client_id);
      }

      if (notes !== undefined) {
        updates.push('notes = ?');
        values.push(notes);
      }

      if (status === 'sent') {
        updates.push('status = ?, updated_at = CURRENT_TIMESTAMP');
        values.push('sent');
      }

      if (updates.length > 0) {
        values.push(id);
        const stmt = db.prepare(`UPDATE quotes SET ${updates.join(', ')} WHERE id = ?`);
        stmt.run(...values);
      }

      const updatedQuote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(id);
      res.json(updatedQuote);
      return;
    }

    res.status(403).json({ error: 'Forbidden' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/api/quotes/:id/items', requireAuth, requireRole('employee'), (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;
    const { description, quantity, unit_price } = req.body;

    const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(id);
    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    if (quote.user_id !== user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (quote.status !== 'draft') {
      return res.status(400).json({ error: 'Can only add items to draft quotes' });
    }

    if (!description || quantity === undefined || unit_price === undefined) {
      return res.status(400).json({ error: 'description, quantity, and unit_price are required' });
    }

    const total = quantity * unit_price;
    const stmt = db.prepare(`
      INSERT INTO quote_items (quote_id, description, quantity, unit_price, total, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    const result = stmt.run(id, description, quantity, unit_price, total);

    updateQuoteTotal(id);

    const item = db.prepare('SELECT * FROM quote_items WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/api/quotes/:id/items/:itemId', requireAuth, requireRole('employee'), (req, res) => {
  try {
    const user = req.user;
    const { id, itemId } = req.params;

    const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(id);
    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    if (quote.user_id !== user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (quote.status !== 'draft') {
      return res.status(400).json({ error: 'Can only remove items from draft quotes' });
    }

    const item = db.prepare('SELECT * FROM quote_items WHERE id = ?').get(itemId);
    if (!item) {
      return res.status(404).json({ error: 'Quote item not found' });
    }

    if (item.quote_id !== quote.id) {
      return res.status(404).json({ error: 'Quote item not found in this quote' });
    }

    db.prepare('DELETE FROM quote_items WHERE id = ?').run(itemId);
    updateQuoteTotal(id);

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
