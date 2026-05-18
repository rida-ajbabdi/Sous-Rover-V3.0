// ============================================================
// SoussRover — Module Météo (OpenWeatherMap + Cache)
// ============================================================
// Interroge l'API OWM, gère le cache en BDD (1h de validité),
// et fournit la décision de blocage d'arrosage si pluie prévue.

const https          = require('https');
const { db }         = require('./database');
const { logSysteme } = require('./logger');
const config         = require('../config');

const OWM_BASE       = config.owm.baseUrl;
const CACHE_DUREE_MS = config.owm.cacheDureeMin * 60 * 1000;

// ── Récupérer depuis le cache ou l'API ───────────────────────
/**
 * Obtient les données météo pour une position GPS.
 * Vérifie d'abord le cache BDD, sinon appelle l'API OWM.
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Promise<object>} Données météo
 */
function obtenirMeteo(lat, lon) {
  return new Promise((resolve, reject) => {

    // Chercher un cache encore valide
    db.get(
      `SELECT * FROM meteo_cache
       WHERE latitude = ? AND longitude = ?
         AND valide_jusqu > datetime('now')
       ORDER BY fetched_at DESC LIMIT 1`,
      [lat, lon],
      (err, row) => {
        if (err) return reject(err);

        if (row) {
          console.log('☁️  Météo depuis le cache');
          return resolve({
            probabilite_pluie : row.probabilite_pluie,
            temperature_prevue: row.temperature_prevue,
            description_meteo : row.description_meteo,
            source            : 'cache'
          });
        }

        // Aucun cache valide → appeler l'API
        const apiKey = config.owm.apiKey;
        if (!apiKey) {
          logSysteme('WARNING', 'api_meteo', 'Clé OWM_API_KEY absente — météo simulée');
          const meteoSimulee = {
            probabilite_pluie : 0.1,
            temperature_prevue: 30,
            description_meteo : 'simulation (clé API manquante)',
            source            : 'simulation'
          };
          sauvegarderCache(lat, lon, meteoSimulee);
          return resolve(meteoSimulee);
        }

        const url = `${OWM_BASE}?lat=${lat}&lon=${lon}&appid=${apiKey}&cnt=4&units=metric&lang=fr`;
        appelAPI(url)
          .then(data => {
            if (!data || !data.list || data.list.length === 0) {
              logSysteme('ERROR', 'api_meteo', `Erreur API OWM : ${data.message || 'Réponse invalide'}`);
              return reject(new Error(data.message || 'Format de réponse OWM invalide'));
            }
            const premier = data.list[0];
            const meteo = {
              probabilite_pluie : premier.pop || 0,
              temperature_prevue: premier.main?.temp || null,
              description_meteo : premier.weather?.[0]?.description || null,
              source            : 'api'
            };
            sauvegarderCache(lat, lon, meteo);
            logSysteme('INFO', 'api_meteo', `Météo récupérée pour lat=${lat} lon=${lon}`);
            resolve(meteo);
          })
          .catch(err => {
            logSysteme('ERROR', 'api_meteo', `Erreur OWM : ${err.message}`);
            reject(err);
          });
      }
    );
  });
}

/**
 * Sauvegarde les données météo dans le cache BDD.
 */
function sauvegarderCache(lat, lon, meteo) {
  const valide = new Date(Date.now() + CACHE_DUREE_MS).toISOString();
  db.run(
    `INSERT INTO meteo_cache
     (latitude, longitude, probabilite_pluie, temperature_prevue, description_meteo, valide_jusqu)
     VALUES (?,?,?,?,?,?)`,
    [lat, lon, meteo.probabilite_pluie, meteo.temperature_prevue, meteo.description_meteo, valide]
  );
}

/**
 * Appel HTTP GET vers l'API OWM.
 */
function appelAPI(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try   { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Réponse OWM non-JSON : ' + data.slice(0, 100))); }
      });
    }).on('error', reject);
  });
}

// ── Décision d'arrosage basée sur la météo ───────────────────
/**
 * Si probabilité de pluie > 70%, l'arrosage est bloqué.
 * @param {number} probabilitePluie - entre 0.0 et 1.0
 * @returns {boolean}
 */
function arrosageBloque(probabilitePluie) {
  return probabilitePluie > 0.7;
}

module.exports = { obtenirMeteo, arrosageBloque };
