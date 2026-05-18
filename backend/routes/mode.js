const express = require('express');
const router = express.Router();
const { db } = require('../modules/database');
const { logSysteme } = require('../modules/logger');

// GET /api/mode
router.get('/', (req, res) => {
  db.get('SELECT mode FROM robot_state WHERE id = 1', (err, row) => {
    if (err) return res.status(500).json({ erreur: err.message });
    res.json({ mode: row ? row.mode : 'AUTO' });
  });
});

// POST /api/mode
router.post('/', (req, res) => {
  const { mode } = req.body;
  if (!mode || !['AUTO', 'WIFI', 'BT'].includes(mode)) {
    return res.status(400).json({ erreur: 'Mode invalide' });
  }

  db.run("UPDATE robot_state SET mode = ?, updated_at = datetime('now') WHERE id = 1", [mode], (err) => {
    if (err) return res.status(500).json({ erreur: err.message });
    logSysteme('INFO', 'user', `Changement de mode forcé : ${mode}`);
    res.json({ succes: true, mode });
  });
});

module.exports = router;
