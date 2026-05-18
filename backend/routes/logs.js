// ============================================================
// SoussRover — Route : /api/logs
// ============================================================
// GET  /             → Derniers logs système (avec filtres)
// GET  /erreurs      → Uniquement les erreurs et warnings

const express = require('express');
const router  = express.Router();
const { db }  = require('../modules/database');

// ── GET /api/logs?limite=100&niveau=WARNING&source=robot ─────
router.get('/', (req, res) => {
  const limite = parseInt(req.query.limite) || 100;
  const niveau = req.query.niveau;   // INFO, WARNING, ERROR
  const source = req.query.source;   // robot, serveur, api_meteo, algorithme

  let sql    = 'SELECT * FROM logs_systeme WHERE 1=1';
  const params = [];

  if (niveau) {
    sql += ' AND niveau = ?';
    params.push(niveau.toUpperCase());
  }
  if (source) {
    sql += ' AND source = ?';
    params.push(source);
  }

  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limite);

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ erreur: err.message });
    res.json({ total: rows.length, logs: rows });
  });
});

// ── GET /api/logs/erreurs — Erreurs et warnings récents ──────
router.get('/erreurs', (req, res) => {
  const limite = parseInt(req.query.limite) || 50;
  db.all(
    `SELECT * FROM logs_systeme
     WHERE niveau IN ('WARNING', 'ERROR')
     ORDER BY created_at DESC LIMIT ?`,
    [limite],
    (err, rows) => {
      if (err) return res.status(500).json({ erreur: err.message });
      res.json({ total: rows.length, logs: rows });
    }
  );
});

module.exports = router;
