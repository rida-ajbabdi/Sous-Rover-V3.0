/* ============================================================
 * SoussRover — Code Client ESP32 (Méthode Réseau Local)
 * ============================================================
 * Ce code se connecte à votre réseau WiFi et envoie des requêtes 
 * HTTP POST au serveur Node.js hébergé sur votre ordinateur.
 * 
 * Instructions :
 * 1. Changez "NOM_DE_VOTRE_WIFI" et "MOT_DE_PASSE_WIFI".
 * 2. Changez "192.168.1.X" par l'adresse IPv4 de votre ordinateur.
 * 3. Installez la bibliothèque ArduinoJson via le gestionnaire 
 *    de bibliothèques de l'Arduino IDE.
 * ============================================================ */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h> // N'oubliez pas d'installer ArduinoJson !

// ── Configuration WiFi ──────────────────────────────────────
const char* ssid     = "NOM_DE_VOTRE_WIFI";
const char* password = "MOT_DE_PASSE_WIFI";

// ── Configuration du Serveur (Méthode Réseau Local) ─────────
// Remplacez par l'adresse IPv4 de votre PC (tapez 'ipconfig' dans le terminal Windows)
const char* serverUrl = "http://192.168.1.15:3000/api/donnees"; 

// ── Configuration du Robot ──────────────────────────────────
const String device_id = "SOUSSROVER_01";
const String zone      = "A";

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n--- Démarrage de SoussRover ESP32 ---");

  // Connexion au réseau WiFi
  Serial.print("Connexion au WiFi : ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\n✅ Connecté au WiFi !");
  Serial.print("Adresse IP de l'ESP32 : ");
  Serial.println(WiFi.localIP());
}

void loop() {
  // On ne lance l'envoi que si on est toujours connecté au WiFi
  if (WiFi.status() == WL_CONNECTED) {
    envoyerDonneesCapteurs();
  } else {
    Serial.println("❌ Perte de connexion WiFi ! Tentative de reconnexion...");
    WiFi.reconnect();
  }

  // Attendre 10 secondes avant la prochaine lecture
  delay(10000); 
}

// ── Fonction pour lire les capteurs et envoyer au Serveur ──
void envoyerDonneesCapteurs() {
  // 1. Lire vos vrais capteurs ici (DHT22, Capteur Humidité Sol, etc.)
  // Pour l'exemple, nous générons des données factices :
  float humidite_sol = random(200, 600) / 10.0;   // Exemple : 32.5%
  float temperature_air = random(250, 350) / 10.0; // Exemple : 28.1°C
  float humidite_air = random(400, 600) / 10.0;    // Exemple : 45.2%

  Serial.println("\n--- Nouvelle Mesure ---");
  Serial.printf("Sol: %.1f%% | Temp: %.1fC | Air: %.1f%%\n", humidite_sol, temperature_air, humidite_air);

  // 2. Préparer le JSON
  StaticJsonDocument<200> doc;
  doc["device_id"] = device_id;
  doc["zone"] = zone;
  doc["humidite_sol"] = humidite_sol;
  doc["temperature_air"] = temperature_air;
  doc["humidite_air"] = humidite_air;
  // Note: On n'envoie pas le "timestamp", le serveur Node.js le générera automatiquement !

  String payload;
  serializeJson(doc, payload);

  // 3. Envoyer la requête HTTP POST
  HTTPClient http;
  http.begin(serverUrl);
  http.addHeader("Content-Type", "application/json");

  Serial.println("📡 Envoi au serveur : " + payload);
  int httpResponseCode = http.POST(payload);

  // 4. Analyser la réponse
  if (httpResponseCode > 0) {
    Serial.printf("✅ Code HTTP : %d\n", httpResponseCode);
    String reponseServeur = http.getString();
    Serial.println("Réponse : " + reponseServeur);
  } else {
    Serial.printf("❌ Erreur de requête HTTP : %s\n", http.errorToString(httpResponseCode).c_str());
  }

  http.end(); // Libérer les ressources
}
