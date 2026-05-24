const express = require('express');
const router = express.Router();

let db;

module.exports = (database) => {
  db = database;

  router.get('/api/analytics/summary', async (req, res) => {
    try {
      const clientsCount = await db.query('SELECT COUNT(*) as count FROM clients');
      const quotesCount = await db.query('SELECT COUNT(*) as count FROM quotes');
      const quotesApproved = await db.query('SELECT COUNT(*) as count FROM quotes WHERE status = ?', ['approved']);
      
      const ticketsOpen = await db.query('SELECT COUNT(*) as count FROM tickets WHERE status = ?', ['open']);
      const ticketsInProgress = await db.query('SELECT COUNT(*) as count FROM tickets WHERE status = ?', ['in_progress']);
      const ticketsResolved = await db.query('SELECT COUNT(*) as count FROM tickets WHERE status = ?', ['resolved']);

      res.json({
        clients: clientsCount[0].count,
        quotes: quotesCount[0].count,
        quotesApproved: quotesApproved[0].count,
        tickets: {
          open: ticketsOpen[0].count,
          in_progress: ticketsInProgress[0].count,
          resolved: ticketsResolved[0].count
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/analytics/quotes-monthly', async (req, res) => {
    try {
      const quotesMonthly = await db.query(`
        SELECT 
          DATE_FORMAT(created_at, '%Y-%m') as month,
          COUNT(*) as count
        FROM quotes 
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
        GROUP BY DATE_FORMAT(created_at, '%Y-%m')
        ORDER BY month DESC
        LIMIT 12
      `);
      res.json(quotesMonthly);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/analytics/clients-by-sector', async (req, res) => {
    try {
      const clientsBySector = await db.query(`
        SELECT sector, COUNT(*) as count
        FROM clients
        GROUP BY sector
        ORDER BY count DESC
        LIMIT 10
      `);
      res.json(clientsBySector);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/analytics/tickets-resolution-time', async (req, res) => {
    try {
      const resolutionTime = await db.query(`
        SELECT 
          AVG(TIMESTAMPDIFF(DAY, created_at, updated_at)) as avgresolutiondays,
          MIN(TIMESTAMPDIFF(DAY, created_at, updated_at)) as minresolutiondays,
          MAX(TIMESTAMPDIFF(DAY, created_at, updated_at)) as maxresolutiondays
        FROM tickets
        WHERE status = 'resolved' AND updated_at > created_at
      `);
      res.json(resolutionTime[0]);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
