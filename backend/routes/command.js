const express = require('express');
const router = express.Router();
const { db } = require('../modules/database');
const { logSysteme } = require('../modules/logger');

// GET /api/command/latest
// Fetch the oldest unread command (FIFO) and mark it as read.
router.get('/latest', (req, res) => {
  db.get('SELECT * FROM commands WHERE is_read = 0 ORDER BY created_at ASC LIMIT 1', (err, row) => {
    if (err) return res.status(500).json({ erreur: err.message });
    if (!row) return res.json({ command: null });
    
    // Mark as read
    db.run('UPDATE commands SET is_read = 1 WHERE id = ?', [row.id], (updateErr) => {
      if (updateErr) logSysteme('ERROR', 'robot', 'Erreur update command');
      res.json({ command: row.command });
    });
  });
});

// POST /api/command
// Send a command to the robot
router.post('/', (req, res) => {
  const { command } = req.body;
  if (!command || !['F', 'B', 'L', 'R', 'S', 'STOP_ALL'].includes(command)) {
    return res.status(400).json({ erreur: 'Commande invalide' });
  }

  db.run('INSERT INTO commands (command) VALUES (?)', [command], function (err) {
    if (err) return res.status(500).json({ erreur: err.message });
    logSysteme('INFO', 'user', `Commande WiFi envoyée : ${command}`);
    res.json({ succes: true, command_id: this.lastID });
  });
});

module.exports = router;
