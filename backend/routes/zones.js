// ============================================================
// SoussRover — Route : /api/zones
// ============================================================
// GET  /      → Liste des zones actives
// PUT  /:id   → Modifier les paramètres d'une zone

const express = require('express');
const router  = express.Router();
const { db }  = require('../modules/database');

// ── GET /api/zones ───────────────────────────────────────────
router.get('/', (req, res) => {
  db.all('SELECT * FROM zones WHERE active = 1 ORDER BY code_zone', (err, rows) => {
    if (err) return res.status(500).json({ erreur: err.message });
    res.json({ total: rows.length, zones: rows });
  });
});

// ── PUT /api/zones/:id — Modifier les seuils d'une zone ─────
router.put('/:id', (req, res) => {
  const { seuil_critique, seuil_attention, nom_zone, type_culture, active } = req.body;

  if (seuil_critique !== undefined && seuil_attention !== undefined) {
    if (parseFloat(seuil_critique) >= parseFloat(seuil_attention)) {
      return res.status(400).json({ erreur: 'Le seuil critique doit être strictement inférieur au seuil d\'attention.' });
    }
  }

  db.run(
    `UPDATE zones SET
       seuil_critique  = COALESCE(?, seuil_critique),
       seuil_attention = COALESCE(?, seuil_attention),
       nom_zone        = COALESCE(?, nom_zone),
       type_culture    = COALESCE(?, type_culture),
       active          = COALESCE(?, active)
     WHERE id = ?`,
    [seuil_critique, seuil_attention, nom_zone, type_culture, active, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ erreur: err.message });
      if (this.changes === 0) return res.status(404).json({ erreur: 'Zone non trouvée' });
      res.json({ succes: true, zone_id: req.params.id });
    }
  );
});

module.exports = router;
