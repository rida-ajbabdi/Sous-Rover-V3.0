// ============================================================
// SoussRover — Module Base de Données (SQLite)
// ============================================================
// Crée la connexion SQLite et initialise toutes les tables
// conformément au cahier des charges.

const sqlite3 = require('sqlite3').verbose();
const path    = require('path');
const bcrypt  = require('bcrypt');
const config  = require('../config');

const DB_PATH = config.dbPath;

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error('❌ Connexion BDD échouée :', err.message);
  else     console.log('📦 Base de données connectée :', DB_PATH);
});

// Active les foreign keys SQLite
db.run('PRAGMA foreign_keys = ON');

// ── Création des tables ──────────────────────────────────────
function initialiserBDD(callback) {
  db.serialize(() => {

    // Table : zones
    db.run(`
      CREATE TABLE IF NOT EXISTS zones (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        code_zone       VARCHAR(10) UNIQUE NOT NULL,
        nom_zone        VARCHAR(100),
        seuil_critique  FLOAT   DEFAULT 20.0,
        seuil_attention FLOAT   DEFAULT 35.0,
        latitude        FLOAT,
        longitude       FLOAT,
        type_culture    VARCHAR(100),
        active          BOOLEAN DEFAULT 1
      )
    `);

    // Table : mesures
    db.run(`
      CREATE TABLE IF NOT EXISTS mesures (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id         VARCHAR(50) NOT NULL,
        zone              VARCHAR(10) NOT NULL,
        humidite_sol      FLOAT NOT NULL,
        temperature_air   FLOAT NOT NULL,
        humidite_air      FLOAT NOT NULL,
        distance_obstacle FLOAT,
        battery_level     FLOAT,
        mode              VARCHAR(20),
        robot_status      VARCHAR(30),
        timestamp_robot   DATETIME NOT NULL,
        timestamp_serveur DATETIME DEFAULT (datetime('now')),
        statut            VARCHAR(30) DEFAULT 'normal'
      )
    `);

    // Ajout sécurisé des nouvelles colonnes si la BDD existe déjà
    db.run("ALTER TABLE mesures ADD COLUMN distance_obstacle FLOAT", () => {});
    db.run("ALTER TABLE mesures ADD COLUMN battery_level FLOAT", () => {});
    db.run("ALTER TABLE mesures ADD COLUMN mode VARCHAR(20)", () => {});
    db.run("ALTER TABLE mesures ADD COLUMN robot_status VARCHAR(30)", () => {});

    // Table : robot_state (stocke le mode global actuel)
    db.run(`
      CREATE TABLE IF NOT EXISTS robot_state (
        id          INTEGER PRIMARY KEY CHECK (id = 1),
        mode        VARCHAR(20) DEFAULT 'AUTO',
        updated_at  DATETIME DEFAULT (datetime('now'))
      )
    `);

    // Table : commands (stocke les commandes WiFi envoyées)
    db.run(`
      CREATE TABLE IF NOT EXISTS commands (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        command     VARCHAR(20) NOT NULL,
        is_read     BOOLEAN DEFAULT 0,
        created_at  DATETIME DEFAULT (datetime('now'))
      )
    `);

    // Table : alertes
    db.run(`
      CREATE TABLE IF NOT EXISTS alertes (
        id                    INTEGER PRIMARY KEY AUTOINCREMENT,
        mesure_id             INTEGER REFERENCES mesures(id),
        zone                  VARCHAR(10) NOT NULL,
        type_alerte           VARCHAR(50) NOT NULL,
        message               TEXT NOT NULL,
        niveau                VARCHAR(20) NOT NULL,
        heure_arrosage_prevue DATETIME,
        resolue               BOOLEAN DEFAULT 0,
        created_at            DATETIME DEFAULT (datetime('now'))
      )
    `);

    // Table : meteo_cache
    db.run(`
      CREATE TABLE IF NOT EXISTS meteo_cache (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        latitude            FLOAT NOT NULL,
        longitude           FLOAT NOT NULL,
        probabilite_pluie   FLOAT,
        temperature_prevue  FLOAT,
        description_meteo   VARCHAR(100),
        fetched_at          DATETIME DEFAULT (datetime('now')),
        valide_jusqu        DATETIME NOT NULL
      )
    `);

    // Table : logs_systeme
    db.run(`
      CREATE TABLE IF NOT EXISTS logs_systeme (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        niveau     VARCHAR(20) NOT NULL,
        source     VARCHAR(50) NOT NULL,
        message    TEXT NOT NULL,
        created_at DATETIME DEFAULT (datetime('now'))
      )
    `);

    // ── Table : utilisateurs (JWT Auth) ───────────────────────
    db.run(`
      CREATE TABLE IF NOT EXISTS utilisateurs (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        username      VARCHAR(100) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role          VARCHAR(20) DEFAULT 'admin',
        created_at    DATETIME DEFAULT (datetime('now'))
      )
    `);

    // ── PHASE 1 ET0 : Tables de Référence ────────────────────

    // Table : villes (villes marocaines avec coordonnées GPS)
    db.run(`
      CREATE TABLE IF NOT EXISTS villes (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        nom       VARCHAR(100) UNIQUE NOT NULL,
        latitude  FLOAT NOT NULL,
        longitude FLOAT NOT NULL,
        image_url TEXT DEFAULT '/assets/images/villes/default.jpg'
      )
    `);
    // Migration sécurisée si la table existait déjà
    db.run("ALTER TABLE villes ADD COLUMN image_url TEXT DEFAULT '/assets/images/villes/default.jpg'", () => {});

    // Table : types_sol (facteur de conversion eau en mm/%)
    db.run(`
      CREATE TABLE IF NOT EXISTS types_sol (
        id                    INTEGER PRIMARY KEY AUTOINCREMENT,
        nom                   VARCHAR(100) UNIQUE NOT NULL,
        facteur_conversion_mm FLOAT NOT NULL,
        description           VARCHAR(200),
        image_url             TEXT DEFAULT '/assets/images/sols/default.jpg'
      )
    `);
    // Migration sécurisée si la table existait déjà
    db.run("ALTER TABLE types_sol ADD COLUMN image_url TEXT DEFAULT '/assets/images/sols/default.jpg'", () => {});

    // Table : types_plante (coefficient cultural Kc)
    db.run(`
      CREATE TABLE IF NOT EXISTS types_plante (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        nom         VARCHAR(100) UNIQUE NOT NULL,
        kc          FLOAT NOT NULL,
        description VARCHAR(200),
        image_url   TEXT DEFAULT '/assets/images/plantes/default.jpg'
      )
    `);
    // Migration sécurisée si la table existait déjà
    db.run("ALTER TABLE types_plante ADD COLUMN image_url TEXT DEFAULT '/assets/images/plantes/default.jpg'", () => {});

    // Table : system_config (configuration active choisie par l'utilisateur)
    db.run(`
      CREATE TABLE IF NOT EXISTS system_config (
        id          INTEGER PRIMARY KEY CHECK (id = 1),
        ville_id    INTEGER REFERENCES villes(id),
        sol_id      INTEGER REFERENCES types_sol(id),
        plante_id   INTEGER REFERENCES types_plante(id),
        updated_at  DATETIME DEFAULT (datetime('now'))
      )
    `, () => {
      // Seeder les zones par défaut
      db.get('SELECT COUNT(*) as cnt FROM zones', (err, row) => {
        if (!err && row.cnt === 0) {
          const stmt = db.prepare(
            'INSERT INTO zones (code_zone, nom_zone, latitude, longitude, type_culture) VALUES (?,?,?,?,?)'
          );
          stmt.run('A', 'Parcelle Nord',  30.4278, -9.5981, 'Tomate');
          stmt.run('B', 'Parcelle Sud',   30.4200, -9.5900, 'Agrume');
          stmt.run('C', 'Parcelle Est',   30.4150, -9.5850, 'Maraîchage');
          stmt.finalize();
          console.log('🌱 Zones par défaut créées (A, B, C)');
        }
      });

      // Seeder les villes marocaines
      db.get('SELECT COUNT(*) as cnt FROM villes', (err, row) => {
        if (!err && row.cnt === 0) {
          const stmt = db.prepare('INSERT INTO villes (nom, latitude, longitude, image_url) VALUES (?,?,?,?)');
          stmt.run('Agadir',      30.4278,  -9.5981, '/assets/images/villes/agadir.jpg');
          stmt.run('Tiznit',      29.6974,  -9.7316, '/assets/images/villes/tiznit.jpg');
          stmt.run('Marrakech',   31.6295,  -7.9811, '/assets/images/villes/marrakech.jpg');
          stmt.run('Casablanca',  33.5731,  -7.5898, '/assets/images/villes/casablanca.jpg');
          stmt.run('Rabat',       34.0132,  -6.8326, '/assets/images/villes/rabat.jpg');
          stmt.run('Fès',         34.0181,  -5.0078, '/assets/images/villes/fes.jpg');
          stmt.run('Meknès',      33.8935,  -5.5473, '/assets/images/villes/meknes.jpg');
          stmt.run('Oujda',       34.6867,  -1.9114, '/assets/images/villes/oujda.jpg');
          stmt.run('Tanger',      35.7673,  -5.7997, '/assets/images/villes/tanger.jpg');
          stmt.run('Laâyoune',    27.1418, -13.1804, '/assets/images/villes/laayoune.jpg');
          stmt.run('Taroudant',   30.4702,  -8.8776, '/assets/images/villes/taroudant.jpg');
          stmt.run('Ouarzazate',  30.9335,  -6.9370, '/assets/images/villes/ouarzazate.jpg');
          stmt.finalize();
          console.log('🗺️  Villes marocaines seedées (12 villes)');
        }
      });

      // Seeder les types de sol
      db.get('SELECT COUNT(*) as cnt FROM types_sol', (err, row) => {
        if (!err && row.cnt === 0) {
          const stmt = db.prepare('INSERT INTO types_sol (nom, facteur_conversion_mm, description, image_url) VALUES (?,?,?,?)');
          stmt.run('Sableux',        1.0, 'Sol léger, drainage rapide, faible rétention',      '/assets/images/sols/sableux.jpg');
          stmt.run('Limoneux',       1.5, 'Sol équilibré, bonne rétention hydrique',            '/assets/images/sols/limoneux.jpg');
          stmt.run('Argileux',       2.0, 'Sol lourd, rétention maximale, drainage lent',       '/assets/images/sols/argileux.jpg');
          stmt.run('Sablo-Limoneux', 1.2, 'Sol mixte, adapté aux cultures maraîchères',         '/assets/images/sols/sablo-limoneux.jpg');
          stmt.finalize();
          console.log('🪨  Types de sol seedés (4 types)');
        }
      });

      // Seeder les types de plante
      db.get('SELECT COUNT(*) as cnt FROM types_plante', (err, row) => {
        if (!err && row.cnt === 0) {
          const stmt = db.prepare('INSERT INTO types_plante (nom, kc, description, image_url) VALUES (?,?,?,?)');
          stmt.run('Tomate',         1.15, 'Kc élevé, besoin en eau important en été',          '/assets/images/plantes/tomate.jpg');
          stmt.run('Pomme de terre', 1.05, 'Besoin modéré, sensible au stress hydrique',        '/assets/images/plantes/pomme-de-terre.jpg');
          stmt.run('Agrume',         0.75, 'Kc faible, arbre résistant à la sécheresse',        '/assets/images/plantes/agrume.jpg');
          stmt.run('Oignon',         1.00, 'Kc standard, besoin régulier',                      '/assets/images/plantes/oignon.jpg');
          stmt.run('Poivron',        1.10, 'Similaire à la tomate, besoin élevé',               '/assets/images/plantes/poivron.jpg');
          stmt.run('Blé',            0.85, 'Culture céréalière, Kc modéré',                     '/assets/images/plantes/ble.jpg');
          stmt.run('Maraîchage',     1.05, 'Valeur moyenne pour légumes divers',                '/assets/images/plantes/maraichage.jpg');
          stmt.finalize();
          console.log('🌿  Types de plante seedés (7 plantes)');
        }
      });

      // Insérer config système par défaut (Agadir, Sol Limoneux, Tomate)
      db.get('SELECT COUNT(*) as cnt FROM system_config', (err, row) => {
        if (!err && row.cnt === 0) {
          db.run(`INSERT INTO system_config (id, ville_id, sol_id, plante_id) VALUES (1,
            (SELECT id FROM villes WHERE nom='Agadir'),
            (SELECT id FROM types_sol WHERE nom='Limoneux'),
            (SELECT id FROM types_plante WHERE nom='Tomate')
          )`);
          console.log('⚙️  Config système par défaut créée (Agadir/Limoneux/Tomate)');
        }
      });

      // Insérer l'état initial du robot si vide
      db.get('SELECT COUNT(*) as cnt FROM robot_state', (err, row) => {
        if (!err && row.cnt === 0) {
          db.run("INSERT INTO robot_state (id, mode) VALUES (1, 'AUTO')");
        }
      });

      // Seeder l'utilisateur admin
      db.get('SELECT COUNT(*) as cnt FROM utilisateurs', async (err, row) => {
        if (!err && row.cnt === 0) {
          try {
            // Hash du mot de passe avec un salt de 10
            const salt = await bcrypt.genSalt(10);
            const hash = await bcrypt.hash('Rida Ajbabdi', salt);
            db.run(
              "INSERT INTO utilisateurs (username, password_hash, role) VALUES (?, ?, 'admin')",
              ['Rida Ajbabdi', hash]
            );
            console.log('👤  Utilisateur admin (Rida Ajbabdi) créé avec succès.');
          } catch (error) {
            console.error('❌ Erreur lors de la création de l\'admin:', error);
          }
        }
      });

      if (callback) callback();
    });
  });
}

module.exports = { db, initialiserBDD };
