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

function canTransition(status, targetStatus) {
  const transitions = {
    open: ['in_progress', 'resolved'],
    in_progress: ['resolved']
  };

  if (!transitions[status]) return false;
  return transitions[status].includes(targetStatus);
}

router.get('/api/tickets', requireAuth, (req, res) => {
  try {
    const user = req.user;
    const { role } = user;

    let tickets;
    if (role === 'client') {
      const client = db.prepare('SELECT id FROM clients WHERE email = ?').get(user.email);
      if (!client) {
        return res.status(404).json({ error: 'Client not found' });
      }
      tickets = db.prepare(`
        SELECT t.*, u.username as assigned_to
        FROM tickets t
        LEFT JOIN users u ON t.user_id = u.id
        WHERE t.client_id = ?
        ORDER BY t.created_at DESC
      `).all(client.id);
    } else if (role === 'employee') {
      tickets = db.prepare(`
        SELECT t.*, u.username as assigned_to
        FROM tickets t
        LEFT JOIN users u ON t.user_id = u.id
        WHERE t.user_id IS NULL OR t.user_id = ?
        ORDER BY t.created_at DESC
      `).all(user.id);
    } else if (role === 'admin') {
      tickets = db.prepare(`
        SELECT t.*, u.username as assigned_to
        FROM tickets t
        LEFT JOIN users u ON t.user_id = u.id
        ORDER BY t.created_at DESC
      `).all();
    } else {
      return res.status(403).json({ error: 'Forbidden' });
    }

    res.json(tickets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/api/tickets', requireAuth, requireRole('client'), (req, res) => {
  try {
    const user = req.user;
    const { client_id, subject, description, priority, user_id } = req.body;

    if (!subject) {
      return res.status(400).json({ error: 'subject is required' });
    }

    let effectiveClientId = client_id;
    if (user.role === 'client') {
      const client = db.prepare('SELECT id FROM clients WHERE email = ?').get(user.email);
      if (!client) {
        return res.status(404).json({ error: 'Client not found' });
      }
      effectiveClientId = client.id;
    }

    const stmt = db.prepare(`
      INSERT INTO tickets (client_id, user_id, subject, description, priority, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    const result = stmt.run(effectiveClientId, user_id || null, subject, description || '', priority || 'medium');

    const ticket = db.prepare(`
      SELECT t.*, u.username as assigned_to
      FROM tickets t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json(ticket);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/api/tickets/:id', requireAuth, (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;
    const { role } = user;

    const ticket = db.prepare(`
      SELECT t.*, u.username as assigned_to
      FROM tickets t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.id = ?
    `).get(id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    if (role === 'client') {
      const client = db.prepare('SELECT id FROM clients WHERE email = ?').get(user.email);
      if (!client || ticket.client_id !== client.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    } else if (role === 'employee') {
      if (ticket.user_id && ticket.user_id !== user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    res.json(ticket);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/api/tickets/:id', requireAuth, (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;
    const { role } = user;
    const { status, subject, description, priority, user_id } = req.body;

    const ticket = db.prepare(`
      SELECT t.*, u.username as assigned_to
      FROM tickets t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.id = ?
    `).get(id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    if (role === 'client') {
      if (ticket.client_id !== db.prepare('SELECT id FROM clients WHERE email = ?').get(user.email).id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const updates = [];
      const values = [];

      if (subject !== undefined) {
        updates.push('subject = ?');
        values.push(subject);
      }
      if (description !== undefined) {
        updates.push('description = ?');
        values.push(description);
      }
      if (priority !== undefined) {
        updates.push('priority = ?');
        values.push(priority);
      }

      if (status) {
        if (!canTransition(ticket.status, status)) {
          return res.status(400).json({ error: `Cannot transition from ${ticket.status} to ${status}` });
        }
        updates.push('status = ?, updated_at = CURRENT_TIMESTAMP');
        values.push(status);
      }

      if (updates.length > 0) {
        values.push(id);
        const stmt = db.prepare(`UPDATE tickets SET ${updates.join(', ')} WHERE id = ?`);
        stmt.run(...values);
      }

      const updatedTicket = db.prepare(`
        SELECT t.*, u.username as assigned_to
        FROM tickets t
        LEFT JOIN users u ON t.user_id = u.id
        WHERE t.id = ?
      `).get(id);
      res.json(updatedTicket);
      return;
    }

    if (role === 'employee') {
      if (ticket.user_id !== user.id && ticket.user_id !== null) {
        return res.status(403).json({ error: 'Forbidden - ticket assigned to another employee' });
      }

      const updates = [];
      const values = [];

      if (subject !== undefined) {
        updates.push('subject = ?');
        values.push(subject);
      }
      if (description !== undefined) {
        updates.push('description = ?');
        values.push(description);
      }
      if (priority !== undefined) {
        updates.push('priority = ?');
        values.push(priority);
      }
      if (status) {
        if (!canTransition(ticket.status, status)) {
          return res.status(400).json({ error: `Cannot transition from ${ticket.status} to ${status}` });
        }
        updates.push('status = ?, updated_at = CURRENT_TIMESTAMP');
        values.push(status);
      }

      if (updates.length > 0) {
        values.push(id);
        const stmt = db.prepare(`UPDATE tickets SET ${updates.join(', ')} WHERE id = ?`);
        stmt.run(...values);
      }

      const updatedTicket = db.prepare(`
        SELECT t.*, u.username as assigned_to
        FROM tickets t
        LEFT JOIN users u ON t.user_id = u.id
        WHERE t.id = ?
      `).get(id);
      res.json(updatedTicket);
      return;
    }

    if (role === 'admin') {
      const updates = [];
      const values = [];

      if (subject !== undefined) {
        updates.push('subject = ?');
        values.push(subject);
      }
      if (description !== undefined) {
        updates.push('description = ?');
        values.push(description);
      }
      if (priority !== undefined) {
        updates.push('priority = ?');
        values.push(priority);
      }
      if (status) {
        if (!canTransition(ticket.status, status)) {
          return res.status(400).json({ error: `Cannot transition from ${ticket.status} to ${status}` });
        }
        updates.push('status = ?, updated_at = CURRENT_TIMESTAMP');
        values.push(status);
      }
      if (user_id !== undefined) {
        updates.push('user_id = ?');
        values.push(user_id);
      }

      if (updates.length > 0) {
        values.push(id);
        const stmt = db.prepare(`UPDATE tickets SET ${updates.join(', ')} WHERE id = ?`);
        stmt.run(...values);
      }

      const updatedTicket = db.prepare(`
        SELECT t.*, u.username as assigned_to
        FROM tickets t
        LEFT JOIN users u ON t.user_id = u.id
        WHERE t.id = ?
      `).get(id);
      res.json(updatedTicket);
      return;
    }

    res.status(403).json({ error: 'Forbidden' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/api/tickets/:id/messages', requireAuth, (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;
    const { message, is_internal } = req.body;

    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    const stmt = db.prepare(`
      INSERT INTO ticket_messages (ticket_id, user_id, client_id, message, is_internal, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    const result = stmt.run(id, user.id, user.role === 'client' ? db.prepare('SELECT id FROM clients WHERE email = ?').get(user.email).id : null, message, is_internal || 0);

    const ticketMessage = db.prepare('SELECT * FROM ticket_messages WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(ticketMessage);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/api/tickets/:id/messages', requireAuth, (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;

    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    let messages;
    if (user.role === 'client') {
      const client = db.prepare('SELECT id FROM clients WHERE email = ?').get(user.email);
      if (!client || client.id !== ticket.client_id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      messages = db.prepare(`
        SELECT tm.*, u.username
        FROM ticket_messages tm
        LEFT JOIN users u ON tm.user_id = u.id
        WHERE tm.ticket_id = ?
        ORDER BY tm.created_at ASC
      `).all(id);
    } else {
      messages = db.prepare(`
        SELECT tm.*, u.username
        FROM ticket_messages tm
        LEFT JOIN users u ON tm.user_id = u.id
        WHERE tm.ticket_id = ?
        ORDER BY tm.created_at ASC
      `).all(id);
    }

    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
