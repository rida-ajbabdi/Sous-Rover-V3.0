// ============================================================
// SoussRover — Algorithmes de Traitement des Données
// ============================================================
// Contient l'algorithme de seuil simple (Niveau 1),
// l'algorithme prédictif amélioré (Niveau 2),
// l'analyse de tendance historique et la validation des données.

const config = require('../config');

const SEUIL_CRITIQUE  = config.seuils.critique;   // 20.0 %
const SEUIL_ATTENTION = config.seuils.attention;   // 35.0 %

// ── 4.1 Algorithme de Seuil Simple ──────────────────────────
/**
 * Évalue le statut d'humidité d'une mesure.
 * @param {number} humiditeSol - Valeur en %
 * @param {string} zone        - Code de la zone
 * @param {object} seuilsZone  - Seuils personnalisés { seuil_critique, seuil_attention }
 * @returns {{ statut, niveau, type_alerte, message, recommandation }}
 */
// Seuils température et humidité de l'air (contexte Souss-Massa)
const SEUIL_TEMP_CRITIQUE  = 42;   // °C — stress thermique extrême, risque brûlure
const SEUIL_TEMP_ATTENTION = 35;   // °C — stress thermique, évaporation accélérée
const SEUIL_AIR_CRITIQUE   = 15;   // %  — air très sec, évaporation extrême
const SEUIL_AIR_ATTENTION  = 25;   // %  — air sec, surveiller

/**
 * Évalue le statut complet d'une mesure en tenant compte de :
 *   - l'humidité du sol   (seuils configurables par zone)
 *   - la température de l'air (seuils globaux Souss-Massa)
 *   - l'humidité de l'air     (seuils globaux)
 * Retourne le cas le plus grave détecté parmi les trois capteurs.
 */
function evaluerHumidite(humiditeSol, zone, seuilsZone = {}, temperatureAir = null, humiditeAir = null) {
  const sc = seuilsZone.seuil_critique  || SEUIL_CRITIQUE;
  const sa = seuilsZone.seuil_attention || SEUIL_ATTENTION;

  // ── 1. Humidité sol ───────────────────────────────────────
  let scoreSol = 0, msgSol = `Zone ${zone} — Humidité normale (${Number(humiditeSol).toFixed(1)}%).`;
  if (humiditeSol < sc) {
    scoreSol = 2;
    msgSol = `Zone ${zone} — Humidité sol critique (${Number(humiditeSol).toFixed(1)}%). Arrosage IMMÉDIAT.`;
  } else if (humiditeSol < sa) {
    scoreSol = 1;
    msgSol = `Zone ${zone} — Humidité sol faible (${Number(humiditeSol).toFixed(1)}%). Arrosage préventif.`;
  }

  // ── 2. Température air ────────────────────────────────────
  let scoreTemp = 0, msgTemp = null;
  if (temperatureAir !== null && !isNaN(temperatureAir)) {
    if (temperatureAir > SEUIL_TEMP_CRITIQUE) {
      scoreTemp = 2;
      msgTemp = `Stress thermique EXTRÊME (${Number(temperatureAir).toFixed(1)}°C) — risque de brûlure des cultures.`;
    } else if (temperatureAir > SEUIL_TEMP_ATTENTION) {
      scoreTemp = 1;
      msgTemp = `Stress thermique (${Number(temperatureAir).toFixed(1)}°C) — évaporation accélérée.`;
    }
  }

  // ── 3. Humidité air ───────────────────────────────────────
  let scoreAir = 0, msgAir = null;
  if (humiditeAir !== null && !isNaN(humiditeAir)) {
    if (humiditeAir < SEUIL_AIR_CRITIQUE) {
      scoreAir = 2;
      msgAir = `Air très sec (${Number(humiditeAir).toFixed(1)}%) — évaporation extrême, pertes hydriques critiques.`;
    } else if (humiditeAir < SEUIL_AIR_ATTENTION) {
      scoreAir = 1;
      msgAir = `Air sec (${Number(humiditeAir).toFixed(1)}%) — surveiller l'évaporation.`;
    }
  }

  // ── 4. Sélection du cas le plus grave ─────────────────────
  const scoreMax = Math.max(scoreSol, scoreTemp, scoreAir);
  let message;
  if      (scoreMax === scoreTemp && msgTemp) message = msgTemp;
  else if (scoreMax === scoreAir  && msgAir)  message = msgAir;
  else                                         message = msgSol;

  if (scoreMax >= 2) {
    return {
      statut         : 'critique',
      niveau         : 'rouge',
      type_alerte    : 'seuil_critique',
      message,
      recommandation : 'Intervention immédiate — arrosage + protection thermique si nécessaire'
    };
  }
  if (scoreMax === 1) {
    return {
      statut         : 'attention',
      niveau         : 'orange',
      type_alerte    : 'seuil_attention',
      message,
      recommandation : 'Planifier un arrosage dans les prochaines heures'
    };
  }
  return {
    statut         : 'normal',
    niveau         : null,
    type_alerte    : null,
    message        : msgSol,
    recommandation : 'Aucune action requise'
  };
}

// ── 4.2 Algorithme Prédictif Amélioré ────────────────────────
/**
 * Calcule le taux de perte d'humidité (%/heure).
 * Version améliorée : prend en compte la température ET l'humidité de l'air.
 * Une humidité de l'air basse accélère l'évaporation.
 * @param {number} temperature - °C
 * @param {number} humiditeAir - % (optionnel, défaut 50)
 * @returns {number} taux en %/heure
 */
function calculerTauxPerte(temperature, humiditeAir = 50) {
  // Calcul de la Pression de Vapeur Saturante (SVP) en kPa
  // Formule de Tetens
  const svp = 0.61078 * Math.exp((17.27 * temperature) / (temperature + 237.3));
  
  // Calcul du Déficit de Pression de Vapeur (VPD) en kPa
  const vpd = svp * (1 - humiditeAir / 100);

  // Le taux de perte (% d'humidité du sol par heure) est proportionnel au VPD
  // Étalonnage empirique : Un VPD de 1.5 kPa (évaporation forte) donne ~5%/h
  let tauxBase = vpd * 3.33; 
  
  // Borner le taux pour éviter des prédictions extrêmes
  tauxBase = Math.max(0.5, Math.min(8.0, tauxBase));

  return parseFloat(tauxBase.toFixed(2));
}

/**
 * Prédit l'heure d'arrosage nécessaire et le temps restant.
 * @param {number} humiditeSol     - % actuel
 * @param {number} temperatureAir  - °C actuel
 * @param {object} seuilsZone      - Seuils personnalisés
 * @param {number} humiditeAir     - % humidité de l'air (optionnel)
 * @returns {{ heuresRestantes, heureArrosage, tauxPerte, urgence, message }}
 */
function predireArrosage(humiditeSol, temperatureAir, seuilsZone = {}, humiditeAir = 50) {
  const sc            = seuilsZone.seuil_critique || SEUIL_CRITIQUE;
  const sa            = seuilsZone.seuil_attention || SEUIL_ATTENTION;
  const tauxPerte     = calculerTauxPerte(temperatureAir, humiditeAir);
  const humiditeManq  = humiditeSol - sc;

  if (humiditeManq <= 0) {
    return {
      heuresRestantes : 0,
      heureArrosage   : new Date().toISOString(),
      tauxPerte,
      urgence         : 'immédiat',
      message         : 'Arrosage immédiat requis — seuil critique déjà atteint'
    };
  }

  const heuresRestantes   = humiditeManq / tauxPerte;
  const heureArrosage     = new Date(Date.now() + heuresRestantes * 3600 * 1000);
  const heuresAvantAttent = (humiditeSol - sa) / tauxPerte;

  // Déterminer le niveau d'urgence
  let urgence;
  if (heuresRestantes < 1)       urgence = 'très urgent';
  else if (heuresRestantes < 3)  urgence = 'urgent';
  else if (heuresRestantes < 6)  urgence = 'modéré';
  else                           urgence = 'faible';

  return {
    heuresRestantes      : parseFloat(heuresRestantes.toFixed(2)),
    heuresAvantAttention : parseFloat(Math.max(0, heuresAvantAttent).toFixed(2)),
    heureArrosage        : heureArrosage.toISOString(),
    tauxPerte,
    urgence,
    message              : `Arrosage prévu dans ${heuresRestantes.toFixed(1)}h (à ${heureArrosage.toLocaleTimeString('fr-FR')})`
  };
}

// ── 4.3 Analyse de Tendance Historique ───────────────────────
/**
 * Analyse la tendance d'humidité à partir des mesures récentes.
 * @param {Array} mesures - Tableau de mesures ordonnées par date (récentes en premier)
 * @returns {{ tendance, variationParHeure, description }}
 */
function analyserTendance(mesures) {
  if (!mesures || mesures.length < 2) {
    return {
      tendance          : 'indéterminée',
      variationParHeure : 0,
      description       : 'Pas assez de données pour analyser la tendance'
    };
  }

  // Prendre les 10 dernières mesures maximum
  const recentes = mesures.slice(0, 10);
  const premiere = recentes[recentes.length - 1];  // la plus ancienne
  const derniere = recentes[0];                      // la plus récente

  const diffHumidite = derniere.humidite_sol - premiere.humidite_sol;
  const diffTempsMs  = new Date(derniere.timestamp_serveur) - new Date(premiere.timestamp_serveur);
  const diffTempsH   = diffTempsMs / (1000 * 3600);

  if (diffTempsH === 0) {
    return {
      tendance          : 'stable',
      variationParHeure : 0,
      description       : 'Données trop rapprochées pour déterminer une tendance'
    };
  }

  const variationParHeure = parseFloat((diffHumidite / diffTempsH).toFixed(2));

  let tendance, description;
  if (variationParHeure < -2) {
    tendance    = 'baisse rapide';
    description = `L'humidité baisse rapidement (${variationParHeure}%/h). Arrosage bientôt nécessaire.`;
  } else if (variationParHeure < -0.5) {
    tendance    = 'baisse';
    description = `L'humidité diminue progressivement (${variationParHeure}%/h).`;
  } else if (variationParHeure < 0.5) {
    tendance    = 'stable';
    description = `L'humidité est stable (${variationParHeure}%/h).`;
  } else if (variationParHeure < 2) {
    tendance    = 'hausse';
    description = `L'humidité augmente (${variationParHeure}%/h) — arrosage récent détecté.`;
  } else {
    tendance    = 'hausse rapide';
    description = `L'humidité augmente rapidement (${variationParHeure}%/h).`;
  }

  return { tendance, variationParHeure, description };
}

// ── Validation des données entrantes ────────────────────────
/**
 * Valide le paquet JSON reçu du robot ESP32.
 * Rejette les valeurs aberrantes conformément au cahier des charges.
 * @param {object} data
 * @returns {{ valide: boolean, erreurs: string[] }}
 */
function validerDonnees(data) {
  const erreurs = [];

  if (!data.device_id)                                    erreurs.push('device_id manquant');
  if (!data.zone)                                         erreurs.push('zone manquante');
  if (!data.timestamp)                                    erreurs.push('timestamp manquant');

  const h  = parseFloat(data.humidite_sol);
  const t  = parseFloat(data.temperature_air);
  const ha = parseFloat(data.humidite_air);

  if (isNaN(h)  || h  < 0  || h  > 100) erreurs.push(`humidite_sol invalide: ${data.humidite_sol}`);
  if (isNaN(t)  || t  < -10 || t > 70)  erreurs.push(`temperature_air invalide: ${data.temperature_air}`);
  if (isNaN(ha) || ha < 0  || ha > 100)  erreurs.push(`humidite_air invalide: ${data.humidite_air}`);

  // Nouvelles validations pour l'IoT
  if (data.mode && !['AUTO', 'WIFI', 'BT'].includes(data.mode)) erreurs.push(`mode invalide: ${data.mode}`);
  if (data.robot_status && !['moving', 'stopped', 'obstacle'].includes(data.robot_status)) erreurs.push(`robot_status invalide: ${data.robot_status}`);
  if (data.distance_obstacle !== undefined && isNaN(parseFloat(data.distance_obstacle))) erreurs.push(`distance_obstacle invalide: ${data.distance_obstacle}`);
  if (data.battery_level !== undefined && isNaN(parseFloat(data.battery_level))) erreurs.push(`battery_level invalide: ${data.battery_level}`);

  return { valide: erreurs.length === 0, erreurs };
}

// ── 4.4 Algorithme ET0 via Open-Meteo API (Phase 2) ─────────
/**
 * Récupère les données horaires d'Évapotranspiration (ET0 FAO-56)
 * depuis l'API gratuite Open-Meteo.
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Promise<number[]|null>} Tableau de valeurs ET0 horaires en mm/h
 */
async function fetchEvapotranspiration(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=et0_fao_evapotranspiration&timezone=auto&forecast_days=3`;
  try {
    // Node.js 18+ supporte fetch nativement
    // Pour versions antérieures, node-fetch est utilisé si disponible
    const fetchFn = typeof fetch !== 'undefined' ? fetch : require('node-fetch');
    const response = await fetchFn(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data.hourly || !data.hourly.et0_fao_evapotranspiration) {
      throw new Error('Champ ET0 absent de la réponse API');
    }
    return data.hourly.et0_fao_evapotranspiration;
  } catch (error) {
    console.error('[ET0] Erreur API Open-Meteo:', error.message);
    return null;
  }
}

/**
 * Prédit le nombre d'heures restantes avant que la terre n'atteigne
 * le seuil critique, en utilisant l'ET0 réelle heure par heure.
 *
 * Méthode : ETc = ET0 × Kc (consommation réelle de la culture)
 * La boucle simule l'épuisement de l'eau disponible heure par heure.
 *
 * @param {number} humiditeSolActuelle  - % humidité sol actuel
 * @param {number} seuilCritique        - % seuil en dessous duquel arroser
 * @param {number} facteurConversionMm  - mm d'eau par % d'humidité (selon type de sol)
 * @param {number} kc                   - Coefficient cultural de la plante
 * @param {number} lat                  - Latitude de la zone
 * @param {number} lon                  - Longitude de la zone
 * @returns {Promise<object>} Résultat de la prédiction ET0
 */
async function predireArrosageET0(humiditeSolActuelle, seuilCritique, facteurConversionMm, kc, lat, lon) {
  const pourcentageManquant = humiditeSolActuelle - seuilCritique;

  // Déjà au-delà du seuil critique → arrosage immédiat
  if (pourcentageManquant <= 0) {
    return {
      methode         : 'ET0',
      heuresRestantes : 0,
      urgence         : 'immédiat',
      message         : 'Arrosage immédiat requis — seuil critique déjà atteint',
      et0_disponible  : false
    };
  }

  // Convertir le % d'humidité disponible en mm d'eau
  // Ex : 15% × 1.5 mm/% (sol limoneux) = 22.5 mm d'eau encore disponibles
  let eauDisponibleMm = pourcentageManquant * facteurConversionMm;

  // Récupérer les données ET0 horaires depuis Open-Meteo
  const et0Horaire = await fetchEvapotranspiration(lat, lon);

  // Fallback vers l'algorithme VPD si l'API est indisponible
  if (!et0Horaire || et0Horaire.length === 0) {
    console.warn('[ET0] API indisponible — utilisation du fallback VPD');
    return null; // Le caller utilisera predireArrosage() comme fallback
  }

  // Simuler l'épuisement de l'eau heure par heure
  // ETc = ET0 × Kc → consommation réelle de la culture
  let heuresRestantes = 0;
  for (let i = 0; i < et0Horaire.length; i++) {
    let perteHoraire = et0Horaire[i] * kc;
    // Garantir une perte minimale même la nuit (rosée, transpiration basale)
    if (perteHoraire === 0) perteHoraire = 0.05;
    eauDisponibleMm -= perteHoraire;
    heuresRestantes++;
    if (eauDisponibleMm <= 0) break;
  }

  // Déterminer le niveau d'urgence
  let urgence;
  if (heuresRestantes < 2)       urgence = 'immédiat';
  else if (heuresRestantes < 6)  urgence = 'très urgent';
  else if (heuresRestantes < 12) urgence = 'urgent';
  else if (heuresRestantes < 24) urgence = 'modéré';
  else                           urgence = 'faible';

  const heureArrosage = new Date(Date.now() + heuresRestantes * 3600 * 1000);

  return {
    methode         : 'ET0',
    heuresRestantes : parseFloat(heuresRestantes.toFixed(1)),
    heureArrosage   : heureArrosage.toISOString(),
    urgence,
    kc_utilise      : kc,
    facteur_sol     : facteurConversionMm,
    eau_disponible_mm : parseFloat((pourcentageManquant * facteurConversionMm).toFixed(2)),
    et0_disponible  : true,
    message         : `[ET0] Arrosage prévu dans ${heuresRestantes}h (à ${heureArrosage.toLocaleTimeString('fr-FR')})`
  };
}

module.exports = {
  evaluerHumidite,
  predireArrosage,
  predireArrosageET0,
  fetchEvapotranspiration,
  validerDonnees,
  calculerTauxPerte,
  analyserTendance
};
