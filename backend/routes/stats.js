// ============================================================
// SoussRover — Route : /api/stats
// ============================================================
// GET  /journalier    → Statistiques par zone pour une date
// GET  /hebdomadaire  → Statistiques des 7 derniers jours

const express = require('express');
const router  = express.Router();
const { db }  = require('../modules/database');

// ── GET /api/stats/journalier?date=2025-05-10 ────────────────
router.get('/journalier', (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];

  db.all(
    `SELECT zone,
            COUNT(*)                       AS nb_mesures,
            ROUND(MIN(humidite_sol), 2)    AS humidite_min,
            ROUND(MAX(humidite_sol), 2)    AS humidite_max,
            ROUND(AVG(humidite_sol), 2)    AS humidite_moy,
            ROUND(MIN(temperature_air), 2) AS temp_min,
            ROUND(MAX(temperature_air), 2) AS temp_max,
            ROUND(AVG(temperature_air), 2) AS temp_moy
     FROM mesures
     WHERE DATE(timestamp_serveur) = ?
     GROUP BY zone`,
    [date],
    (err, rows) => {
      if (err) return res.status(500).json({ erreur: err.message });
      res.json({ date, statistiques: rows });
    }
  );
});

// ── GET /api/stats/hebdomadaire ──────────────────────────────
router.get('/hebdomadaire', (req, res) => {
  db.all(
    `SELECT zone,
            DATE(timestamp_serveur) AS jour,
            COUNT(*)                        AS nb_mesures,
            ROUND(AVG(humidite_sol), 2)     AS humidite_moy,
            ROUND(AVG(temperature_air), 2)  AS temp_moy
     FROM mesures
     WHERE timestamp_serveur >= datetime('now', '-7 days')
     GROUP BY zone, DATE(timestamp_serveur)
     ORDER BY zone, jour`,
    (err, rows) => {
      if (err) return res.status(500).json({ erreur: err.message });

      // Regrouper par zone pour faciliter les graphiques
      const parZone = {};
      rows.forEach(r => {
        if (!parZone[r.zone]) parZone[r.zone] = [];
        parZone[r.zone].push({
          jour         : r.jour,
          humidite_moy : r.humidite_moy,
          temp_moy     : r.temp_moy,
          nb_mesures   : r.nb_mesures
        });
      });

      res.json({ periode: '7 derniers jours', zones: parZone });
    }
  );
});

module.exports = router;
