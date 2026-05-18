// ============================================================
// SoussRover — Route : /api/prediction (Phase 2 — ET0)
// ============================================================
// GET /:zone → Prédiction ET0 (Open-Meteo) avec fallback VPD
// Lit la configuration active (ville, sol, plante) depuis system_config

const express                                              = require('express');
const router                                               = express.Router();
const { db }                                               = require('../modules/database');
const { predireArrosage, predireArrosageET0, analyserTendance } = require('../modules/algorithmes');
const { obtenirMeteo, arrosageBloque }                     = require('../modules/meteo');
const { logSysteme }                                       = require('../modules/logger');
const { requireReadKey }                                   = require('../modules/auth');

// ── Helpers promesse ─────────────────────────────────────────
function dbGet(sql, params) {
  return new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row))
  );
}
function dbAll(sql, params) {
  return new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows))
  );
}

// ── GET /api/prediction/:zone ────────────────────────────────
router.get('/:zone', requireReadKey, async (req, res) => {
  try {
    const codeZone = req.params.zone.toUpperCase();

    // 1. Dernière mesure de la zone
    const mesure = await dbGet(
      `SELECT m.*, z.seuil_critique, z.seuil_attention, z.latitude, z.longitude, z.type_culture
       FROM mesures m
       LEFT JOIN zones z ON m.zone = z.code_zone
       WHERE m.zone = ?
       ORDER BY m.timestamp_serveur DESC
       LIMIT 1`,
      [codeZone]
    );

    if (!mesure) {
      return res.status(404).json({ erreur: `Aucune mesure trouvée pour la zone ${codeZone}` });
    }

    // Vérification données obsolètes (> 24h)
    const hoursSinceLastMeasure = (Date.now() - new Date(mesure.timestamp_serveur)) / (1000 * 60 * 60);
    if (hoursSinceLastMeasure > 24) {
      return res.json({
        zone            : codeZone,
        erreur          : 'Robot hors ligne (données obsolètes > 24h)',
        action_requise  : 'vérifier_robot',
        arrosage_bloque : true
      });
    }

    // 2. Config système active (ville, sol, plante)
    const sysConfig = await dbGet(`
      SELECT
        v.latitude, v.longitude,
        v.nom AS ville_nom,
        s.facteur_conversion_mm, s.nom AS sol_nom,
        p.kc,                    p.nom AS plante_nom
      FROM system_config sc
      LEFT JOIN villes       v ON sc.ville_id  = v.id
      LEFT JOIN types_sol    s ON sc.sol_id    = s.id
      LEFT JOIN types_plante p ON sc.plante_id = p.id
      WHERE sc.id = 1
    `, []);

    // Coordonnées : priorité à la config système, sinon coordonnées de la zone
    const lat = sysConfig?.latitude  || mesure.latitude  || 30.4278;
    const lon = sysConfig?.longitude || mesure.longitude || -9.5981;
    const kc  = sysConfig?.kc        || 1.05;   // Valeur par défaut : Maraîchage
    const facteurConversionMm = sysConfig?.facteur_conversion_mm || 1.5; // Sol limoneux

    const seuilsZone = {
      seuil_critique  : mesure.seuil_critique  || 20,
      seuil_attention : mesure.seuil_attention || 35
    };

    // 3. Prédiction ET0 (Open-Meteo) — avec fallback VPD automatique
    let prediction = await predireArrosageET0(
      mesure.humidite_sol,
      seuilsZone.seuil_critique,
      facteurConversionMm,
      kc,
      lat,
      lon
    );

    // Fallback : si ET0 API indisponible, utiliser l'ancien algorithme VPD
    if (!prediction) {
      console.warn(`[Prédiction] Fallback VPD pour zone ${codeZone}`);
      prediction = predireArrosage(
        mesure.humidite_sol,
        mesure.temperature_air,
        seuilsZone,
        mesure.humidite_air
      );
      prediction.methode = 'VPD_fallback';
    }

    // 4. Tendance historique (10 dernières mesures)
    const mesuresRecentes = await dbAll(
      `SELECT humidite_sol, temperature_air, humidite_air, timestamp_serveur
       FROM mesures WHERE zone = ?
       ORDER BY timestamp_serveur DESC LIMIT 10`,
      [codeZone]
    );
    const tendance = analyserTendance(mesuresRecentes);

    // 5. Météo (pluie prévue ?)
    let meteo = null;
    let arrosageBloquePluie = false;
    try {
      meteo = await obtenirMeteo(lat, lon);
      arrosageBloquePluie = arrosageBloque(meteo.probabilite_pluie);
    } catch (e) {
      logSysteme('WARNING', 'api_meteo', `Météo indisponible pour zone ${codeZone}`);
    }

    // 6. Alertes actives
    const alertesActives = await dbGet(
      `SELECT COUNT(*) as cnt FROM alertes WHERE zone = ? AND resolue = 0`,
      [codeZone]
    );

    // 7. Recommandation finale
    let recommandation, actionRequise;
    if (arrosageBloquePluie) {
      recommandation = 'Pluie prévue (>70%) — arrosage suspendu pour économiser l\'eau';
      actionRequise  = 'attendre';
    } else if (prediction.urgence === 'immédiat' || prediction.urgence === 'très urgent') {
      recommandation = prediction.message;
      actionRequise  = 'arroser';
    } else if (tendance.tendance === 'baisse rapide') {
      recommandation = `Tendance : ${tendance.description}. ${prediction.message}`;
      actionRequise  = 'surveiller';
    } else {
      recommandation = prediction.message;
      actionRequise  = prediction.heuresRestantes < 6 ? 'planifier' : 'aucune';
    }

    // 8. Réponse complète
    const reponse = {
      zone            : codeZone,
      type_culture    : mesure.type_culture || 'Non spécifié',
      configuration   : sysConfig ? {
        ville  : sysConfig.ville_nom,
        sol    : sysConfig.sol_nom,
        plante : sysConfig.plante_nom,
        kc,
        facteur_conversion_mm : facteurConversionMm
      } : null,
      derniere_mesure : {
        humidite_sol    : mesure.humidite_sol,
        temperature_air : mesure.temperature_air,
        humidite_air    : mesure.humidite_air,
        timestamp       : mesure.timestamp_robot,
        statut          : mesure.statut
      },
      prediction,
      tendance,
      meteo,
      alertes_actives  : alertesActives ? alertesActives.cnt : 0,
      arrosage_bloque  : arrosageBloquePluie,
      action_requise   : actionRequise,
      recommandation
    };

    logSysteme('INFO', 'algorithme', `[ET0] Prédiction zone ${codeZone} : ${recommandation}`);
    res.json(reponse);

  } catch (err) {
    logSysteme('ERROR', 'algorithme', `Erreur prédiction : ${err.message}`);
    res.status(500).json({ erreur: err.message });
  }
});

module.exports = router;
