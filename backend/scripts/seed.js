// ============================================================
// SoussRover — Script de Seed (Données Simulées)
// ============================================================
// Injecte des données réalistes dans la BDD pour tester
// tous les endpoints sans avoir besoin du robot physique.
//
// Usage : node scripts/seed.js
// ============================================================

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { db, initialiserBDD } = require('../modules/database');
const { evaluerHumidite }    = require('../modules/algorithmes');

// ── Configuration du seed ────────────────────────────────────
const DEVICE_ID = 'SOUSSROVER_01';
const ZONES     = ['A', 'B', 'C'];
const NB_JOURS  = 7;
const MESURES_PAR_JOUR = 48;  // toutes les 30 min

// ── Génération de valeurs réalistes ──────────────────────────
function randomEntre(min, max) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(1));
}

function temperatureParHeure(heure) {
  const base = 28;
  const amplitude = 8;
  const variation = amplitude * Math.sin((heure - 2) * Math.PI / 12);
  return parseFloat((base + variation + randomEntre(-2, 2)).toFixed(1));
}

function humiditeSolSimulee(heure, jourIndex) {
  const base = 55 - (jourIndex * 3);
  const variation = -heure * 1.2;
  const arrosage = (heure < 6) ? 15 : 0;
  const bruit = randomEntre(-5, 5);
  return parseFloat(Math.max(10, Math.min(85, base + variation + arrosage + bruit)).toFixed(1));
}

// ── Wrapper promesse pour db.run ─────────────────────────────
function dbRun(sql, params) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });
  });
}

// ── Insertion des données ────────────────────────────────────
async function insererDonnees() {
  console.log('🌱 Début de l\'insertion des données simulées...\n');

  let totalMesures = 0;
  let totalAlertes = 0;
  let totalLogs    = 0;

  const maintenant = new Date();

  for (let jour = NB_JOURS - 1; jour >= 0; jour--) {
    const dateJour = new Date(maintenant);
    dateJour.setDate(dateJour.getDate() - jour);

    for (let i = 0; i < MESURES_PAR_JOUR; i++) {
      const heure = (i * 0.5);
      const heureEntiere = Math.floor(heure);
      const minutes = (heure % 1) * 60;

      const timestampRobot = new Date(dateJour);
      timestampRobot.setHours(heureEntiere, minutes, 0, 0);

      if (timestampRobot > maintenant) continue;

      const timestampServeur = new Date(timestampRobot.getTime() + 500);

      for (const zone of ZONES) {
        const temperature = temperatureParHeure(heureEntiere);
        const humiditeSol = humiditeSolSimulee(heureEntiere, jour);
        const humiditeAir = parseFloat(Math.max(10, Math.min(95, 60 - temperature * 0.5 + randomEntre(-5, 5))).toFixed(1));

        const evaluation = evaluerHumidite(humiditeSol, zone);

        try {
          // Insérer la mesure
          const mesureId = await dbRun(
            `INSERT INTO mesures
             (device_id, zone, humidite_sol, temperature_air, humidite_air, timestamp_robot, timestamp_serveur, statut)
             VALUES (?,?,?,?,?,?,?,?)`,
            [DEVICE_ID, zone, humiditeSol, temperature, humiditeAir,
             timestampRobot.toISOString(), timestampServeur.toISOString(), evaluation.statut]
          );
          totalMesures++;

          // Créer alerte si nécessaire
          if (evaluation.niveau) {
            await dbRun(
              `INSERT INTO alertes (mesure_id, zone, type_alerte, message, niveau)
               VALUES (?,?,?,?,?)`,
              [mesureId, zone, evaluation.type_alerte, evaluation.message, evaluation.niveau]
            );
            totalAlertes++;
          }

          // Log système
          await dbRun(
            `INSERT INTO logs_systeme (niveau, source, message, created_at)
             VALUES (?,?,?,?)`,
            ['INFO', 'robot', `Mesure ${mesureId} — Zone ${zone} — Humidité ${humiditeSol}%`, timestampRobot.toISOString()]
          );
          totalLogs++;

        } catch (err) {
          console.error(`Erreur insertion : ${err.message}`);
        }
      }
    }

    // Afficher la progression
    const pct = Math.round(((NB_JOURS - jour) / NB_JOURS) * 100);
    process.stdout.write(`\r   📅 Progression : ${pct}% (Jour ${NB_JOURS - jour}/${NB_JOURS})`);
  }

  // Logs système variés
  await dbRun('INSERT INTO logs_systeme (niveau, source, message) VALUES (?,?,?)',
    ['INFO', 'serveur', 'Serveur démarré avec succès']);
  await dbRun('INSERT INTO logs_systeme (niveau, source, message) VALUES (?,?,?)',
    ['WARNING', 'api_meteo', 'Clé OWM_API_KEY absente — météo simulée']);
  await dbRun('INSERT INTO logs_systeme (niveau, source, message) VALUES (?,?,?)',
    ['ERROR', 'robot', 'Timeout de connexion — robot hors ligne pendant 2 min']);
  totalLogs += 3;

  console.log('\n');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║     🌱 SEED TERMINÉ AVEC SUCCÈS             ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  📊 Mesures insérées    : ${String(totalMesures).padStart(6)}            ║`);
  console.log(`║  🚨 Alertes créées      : ${String(totalAlertes).padStart(6)}            ║`);
  console.log(`║  📝 Logs système        : ${String(totalLogs).padStart(6)}            ║`);
  console.log(`║  📅 Période             : ${NB_JOURS} jours             ║`);
  console.log(`║  🗺️  Zones              : ${ZONES.join(', ')}               ║`);
  console.log('╚══════════════════════════════════════════════╝');
  console.log('\n✅ Vous pouvez maintenant tester les endpoints API !');
  console.log('   → http://localhost:3000/api/donnees/recentes');
  console.log('   → http://localhost:3000/api/alertes/actives');
  console.log('   → http://localhost:3000/api/stats/journalier');
  console.log('   → http://localhost:3000/api/zones\n');
}

// ── Exécution ────────────────────────────────────────────────
initialiserBDD(async () => {
  console.log('📦 Base de données initialisée.\n');

  try {
    await insererDonnees();
  } catch (err) {
    console.error('❌ Erreur pendant le seed :', err.message);
  }

  db.close(() => {
    console.log('🔒 Base de données fermée.');
    process.exit(0);
  });
});
