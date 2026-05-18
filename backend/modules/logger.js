// ============================================================
// SoussRover — Module Logger
// ============================================================
// Journalise les événements système dans la table logs_systeme.
// Charge la BDD en différé pour éviter les dépendances circulaires.

/**
 * Enregistre un log dans la base de données.
 * @param {string} niveau  - INFO, WARNING, ERROR
 * @param {string} source  - robot, serveur, api_meteo, algorithme
 * @param {string} message - Message descriptif
 */
function logSysteme(niveau, source, message) {
  try {
    const { db } = require('./database');
    db.run(
      'INSERT INTO logs_systeme (niveau, source, message) VALUES (?,?,?)',
      [niveau, source, message]
    );
  } catch (e) {
    console.error('[Logger] Impossible d\'écrire dans logs_systeme :', e.message);
  }
}

module.exports = { logSysteme };
