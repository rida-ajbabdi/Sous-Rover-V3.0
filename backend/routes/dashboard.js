// ============================================================
// SoussRover — Route : /api/dashboard
// ============================================================
// GET  / → Résumé complet du tableau de bord
// Agrège toutes les données essentielles en un seul appel
// pour le frontend : zones, dernières mesures, alertes, stats.

const express                                    = require('express');
const router                                     = express.Router();
const { db }                                     = require('../modules/database');
const { evaluerHumidite, analyserTendance }      = require('../modules/algorithmes');
const { obtenirMeteo, arrosageBloque }           = require('../modules/meteo');
const { requireReadKey }                         = require('../modules/auth');

// ── Helper promesse ──────────────────────────────────────────
function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
}

// ── GET /api/dashboard ───────────────────────────────────────
router.get('/', requireReadKey, async (req, res) => {
  try {

    // 1. Toutes les zones actives
    const zones = await dbAll('SELECT * FROM zones WHERE active = 1 ORDER BY code_zone');

    // 2. Dernière mesure par zone
    const dernieresMesures = await dbAll(`
      SELECT m.*, z.seuil_critique, z.seuil_attention, z.nom_zone, z.type_culture
      FROM mesures m
      INNER JOIN (
        SELECT zone, MAX(timestamp_serveur) as max_ts
        FROM mesures GROUP BY zone
      ) latest ON m.zone = latest.zone AND m.timestamp_serveur = latest.max_ts
      LEFT JOIN zones z ON m.zone = z.code_zone
      ORDER BY m.zone
    `);

    // 3. Alertes actives
    const alertesActives = await dbAll(`
      SELECT a.*, m.humidite_sol, m.temperature_air
      FROM alertes a
      LEFT JOIN mesures m ON a.mesure_id = m.id
      WHERE a.resolue = 0
      ORDER BY a.created_at DESC
      LIMIT 20
    `);

    // 4. Compteurs alertes
    const compteurAlertes = await dbGet(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN niveau = 'rouge' THEN 1 ELSE 0 END) as critiques,
        SUM(CASE WHEN niveau = 'orange' THEN 1 ELSE 0 END) as attention
      FROM alertes WHERE resolue = 0
    `);

    // 5. Stats du jour
    const statsJour = await dbAll(`
      SELECT zone,
             COUNT(*)                       AS nb_mesures,
             ROUND(AVG(humidite_sol), 1)    AS humidite_moy,
             ROUND(MIN(humidite_sol), 1)    AS humidite_min,
             ROUND(MAX(humidite_sol), 1)    AS humidite_max,
             ROUND(AVG(temperature_air), 1) AS temp_moy
      FROM mesures
      WHERE DATE(timestamp_serveur) = DATE('now')
      GROUP BY zone
    `);

    // 6. Total mesures en BDD
    const totalMesures = await dbGet('SELECT COUNT(*) as cnt FROM mesures');

    // 7. Météo
    let meteo = null;
    let villeActiveNom = 'Agadir';
    try {
      // Récupérer les coordonnées et le nom de la ville sélectionnée dans la configuration active
      const sysConfig = await dbGet(`
        SELECT v.latitude, v.longitude, v.nom
        FROM system_config sc
        LEFT JOIN villes v ON sc.ville_id = v.id
        WHERE sc.id = 1
      `);
      const lat = sysConfig?.latitude || 30.4278;
      const lon = sysConfig?.longitude || -9.5981;
      villeActiveNom = sysConfig?.nom || 'Agadir';
      
      meteo = await obtenirMeteo(lat, lon);
    } catch (e) { /* ignore */ }

    // 7b. Statut du robot (fraîcheur des données)
    const ultimeMesure = await dbGet(
      `SELECT MAX(timestamp_serveur) as ts, device_id FROM mesures`
    );
    const lastSeenTs  = ultimeMesure?.ts ? new Date(ultimeMesure.ts) : null;
    const minutesAgo  = lastSeenTs
      ? Math.round((Date.now() - lastSeenTs.getTime()) / 60000)
      : null;
    const robotStatus = {
      last_seen   : lastSeenTs ? lastSeenTs.toISOString() : null,
      minutes_ago : minutesAgo,
      is_stale    : minutesAgo === null || minutesAgo > 30,
      device_id   : ultimeMesure?.device_id || null
    };

    // 8. Construire le résumé par zone
    const resumeZones = dernieresMesures.map(m => {
      const evaluation = evaluerHumidite(m.humidite_sol, m.zone, {
        seuil_critique  : m.seuil_critique,
        seuil_attention : m.seuil_attention
      }, m.temperature_air, m.humidite_air);

      return {
        zone            : m.zone,
        nom             : m.nom_zone || `Zone ${m.zone}`,
        type_culture    : m.type_culture,
        humidite_sol    : m.humidite_sol,
        temperature_air : m.temperature_air,
        humidite_air    : m.humidite_air,
        distance_obstacle: m.distance_obstacle,
        mode            : m.mode,
        robot_status    : m.robot_status,
        statut          : evaluation.statut,
        niveau          : evaluation.niveau,
        message         : evaluation.message,
        derniere_mesure : m.timestamp_robot
      };
    });

    // 9. Réponse dashboard
    res.json({
      timestamp       : new Date().toISOString(),
      projet          : 'SoussRover v1.0',
      resume          : {
        total_mesures      : totalMesures ? totalMesures.cnt : 0,
        total_zones        : zones.length,
        alertes_critiques  : compteurAlertes ? compteurAlertes.critiques : 0,
        alertes_attention  : compteurAlertes ? compteurAlertes.attention : 0,
        alertes_total      : compteurAlertes ? compteurAlertes.total : 0
      },
      zones           : resumeZones,
      alertes_actives : alertesActives,
      stats_jour      : statsJour,
      meteo,
      ville_active    : villeActiveNom,
      arrosage_bloque : meteo ? arrosageBloque(meteo.probabilite_pluie) : false,
      robot_status    : robotStatus
    });

  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

module.exports = router;
