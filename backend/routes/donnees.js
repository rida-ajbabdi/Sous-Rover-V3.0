// ============================================================
// SoussRover — Route : /api/donnees
// ============================================================
// POST /  → Réception des données du robot ESP32
// GET  /recentes     → 50 dernières mesures
// GET  /zone/:code   → Mesures d'une zone spécifique

const express                              = require('express');
const router                               = express.Router();
const { db }                               = require('../modules/database');
const { evaluerHumidite, validerDonnees }   = require('../modules/algorithmes');
const { logSysteme }                       = require('../modules/logger');
const { requireWriteKey, requireReadKey }   = require('../modules/auth');

// ── POST /api/donnees — Réception données robot ──────────────
router.post('/', requireWriteKey, (req, res) => {
  const data = req.body;

  // Validation des données reçues
  const { valide, erreurs } = validerDonnees(data);
  if (!valide) {
    logSysteme('WARNING', 'robot', `Données invalides reçues : ${erreurs.join(', ')}`);
    return res.status(400).json({ erreur: 'Données invalides', details: erreurs });
  }

  const { device_id, zone, timestamp, humidite_sol, temperature_air, humidite_air, distance_obstacle, battery_level, mode, robot_status } = data;

  // Récupérer les seuils personnalisés de la zone
  db.get('SELECT seuil_critique, seuil_attention FROM zones WHERE code_zone = ?', [zone], (err, seuilsZone) => {
    const evaluation = evaluerHumidite(
      parseFloat(humidite_sol), zone, seuilsZone || {},
      parseFloat(temperature_air), parseFloat(humidite_air)
    );

    // Insérer la mesure en BDD
    db.run(
      `INSERT INTO mesures
       (device_id, zone, humidite_sol, temperature_air, humidite_air, distance_obstacle, battery_level, mode, robot_status, timestamp_robot, statut)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [device_id, zone, humidite_sol, temperature_air, humidite_air, distance_obstacle, battery_level, mode, robot_status, timestamp, evaluation.statut],
      function (err) {
        if (err) {
          logSysteme('ERROR', 'robot', `Erreur insertion mesure : ${err.message}`);
          return res.status(500).json({ erreur: 'Erreur base de données' });
        }

        const mesureId = this.lastID;
        logSysteme('INFO', 'robot', `Mesure ${mesureId} reçue — Zone ${zone} — Humidité ${humidite_sol}%`);

        // Mettre à jour l'état global du robot si fourni
        if (mode) {
          db.run("UPDATE robot_state SET mode = ?, updated_at = datetime('now') WHERE id = 1", [mode]);
        }

        // Créer une alerte si le seuil est dépassé
        if (evaluation.niveau) {
          db.run(
            `INSERT INTO alertes (mesure_id, zone, type_alerte, message, niveau)
             VALUES (?,?,?,?,?)`,
            [mesureId, zone, evaluation.type_alerte, evaluation.message, evaluation.niveau]
          );
          logSysteme('WARNING', 'algorithme', evaluation.message);
        }

        if (req.io) {
          req.io.emit('nouvelle_mesure', {
            zone,
            humidite_sol,
            temperature_air,
            humidite_air,
            distance_obstacle,
            mode,
            robot_status,
            timestamp_robot: timestamp
          });
        }

        res.status(200).json({
          succes         : true,
          mesure_id      : mesureId,
          statut         : evaluation.statut,
          message        : evaluation.message,
          recommandation : evaluation.recommandation
        });
      }
    );
  });
});

// ── GET /api/donnees/recentes — 50 dernières mesures ─────────
router.get('/recentes', requireReadKey, (req, res) => {
  db.all(
    `SELECT * FROM mesures ORDER BY timestamp_serveur DESC LIMIT 50`,
    (err, rows) => {
      if (err) return res.status(500).json({ erreur: err.message });
      res.json({ total: rows.length, donnees: rows });
    }
  );
});

// ── GET /api/donnees/zone/:code ───────────────────────────────
router.get('/zone/:code', requireReadKey, (req, res) => {
  const limite = parseInt(req.query.limite) || 100;
  db.all(
    `SELECT * FROM mesures WHERE zone = ? ORDER BY timestamp_serveur DESC LIMIT ?`,
    [req.params.code.toUpperCase(), limite],
    (err, rows) => {
      if (err) return res.status(500).json({ erreur: err.message });
      res.json({ zone: req.params.code, total: rows.length, donnees: rows });
    }
  );
});

module.exports = router;
