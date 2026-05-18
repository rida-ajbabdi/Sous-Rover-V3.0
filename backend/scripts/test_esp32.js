// ============================================================
// SoussRover — Simulateur ESP32
// ============================================================
// Ce script simule le comportement du robot physique (ESP32).
// Il envoie des requêtes POST au serveur backend toutes les X secondes.
//
// Usage : node scripts/test_esp32.js
// ============================================================

const http = require('http');

// Configuration
const HOST = 'localhost';
const PORT = 3000;
const ENDPOINT = '/api/donnees';
const DEVICE_ID = 'SOUSSROVER_ESP32_01';
const ZONE = 'A';

// Fonction pour générer des données aléatoires réalistes
function genererDonneesCapteurs() {
  return {
    device_id: DEVICE_ID,
    zone: ZONE,
    humidite_sol: (20 + Math.random() * 40).toFixed(1),      // 20% à 60%
    temperature_air: (25 + Math.random() * 10).toFixed(1),   // 25°C à 35°C
    humidite_air: (40 + Math.random() * 20).toFixed(1),      // 40% à 60%
    timestamp: new Date().toISOString()
  };
}

// Fonction pour envoyer une requête POST
function envoyerDonnees() {
  const payload = JSON.stringify(genererDonneesCapteurs());

  const options = {
    hostname: HOST,
    port: PORT,
    path: ENDPOINT,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  const req = http.request(options, (res) => {
    let reponse = '';
    
    res.on('data', (chunk) => {
      reponse += chunk;
    });

    res.on('end', () => {
      if (res.statusCode === 201) {
        console.log(`✅ [SUCCÈS] Données envoyées : ${payload}`);
        console.log(`   Réponse serveur : ${reponse}\n`);
      } else {
        console.error(`❌ [ERREUR] Code statut : ${res.statusCode}`);
        console.error(`   Message : ${reponse}\n`);
      }
    });
  });

  req.on('error', (e) => {
    console.error(`🔌 [ERREUR RÉSEAU] Impossible de joindre le serveur. Assurez-vous que server.js est lancé.`);
    console.error(`   Détail : ${e.message}\n`);
  });

  // Envoyer le JSON
  req.write(payload);
  req.end();
}

console.log('🤖 Démarrage du simulateur ESP32 SoussRover...');
console.log(`📡 Envoi de données vers http://${HOST}:${PORT}${ENDPOINT} toutes les 5 secondes.`);
console.log('Appuyez sur Ctrl+C pour arrêter.\n');

// Envoi immédiat du premier paquet, puis toutes les 5 secondes
envoyerDonnees();
setInterval(envoyerDonnees, 5000);
