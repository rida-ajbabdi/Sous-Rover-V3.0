// ============================================================
// SoussRover — Route : /api/alertes
// ============================================================
// GET  /actives       → Alertes non résolues en cours
// GET  /historique    → Historique complet (filtrable par date)
// PUT  /:id/resoudre  → Marquer une alerte comme résolue

const express = require('express');
const router  = express.Router();
const { db }  = require('../modules/database');

// ── GET /api/alertes/actives ─────────────────────────────────
router.get('/actives', (req, res) => {
  db.all(
    `SELECT a.*, m.humidite_sol, m.temperature_air
     FROM alertes a
     LEFT JOIN mesures m ON a.mesure_id = m.id
     WHERE a.resolue = 0
     ORDER BY a.created_at DESC`,
    (err, rows) => {
      if (err) return res.status(500).json({ erreur: err.message });
      res.json({ total: rows.length, alertes: rows });
    }
  );
});

// ── GET /api/alertes/historique?depuis=2025-05-01 ────────────
router.get('/historique', (req, res) => {
  const depuis = req.query.depuis || '1970-01-01';
  db.all(
    `SELECT * FROM alertes WHERE created_at >= ? ORDER BY created_at DESC`,
    [depuis],
    (err, rows) => {
      if (err) return res.status(500).json({ erreur: err.message });
      res.json({ total: rows.length, alertes: rows });
    }
  );
});

// ── PUT /api/alertes/:id/resoudre ────────────────────────────
router.put('/:id/resoudre', (req, res) => {
  db.run(
    'UPDATE alertes SET resolue = 1 WHERE id = ?',
    [req.params.id],
    function (err) {
      if (err) return res.status(500).json({ erreur: err.message });
      if (this.changes === 0) return res.status(404).json({ erreur: 'Alerte non trouvée' });
      res.json({ succes: true, alerte_id: req.params.id });
    }
  );
});

module.exports = router;
