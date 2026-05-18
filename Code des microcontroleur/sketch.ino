// ===========================================================
// LIGNE MAGIQUE : Laissez tel quel pour Wokwi. 
// Pour téléverser sur la vraie carte ESP32, mettez "//" au début !
#define SIMULATION_WOKWI 
// ===========================================================

#include <Arduino.h>
#ifndef SIMULATION_WOKWI
  #include "BluetoothSerial.h"
#endif
#include <ESP32Servo.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <time.h>   
#include <DHT.h>

// ======== CONFIGURATION WIFI & SERVEUR ========
const char* ssid     = "Wokwi-GUEST";
const char* password = "";

const char* serverUrl     = "https://gecko-shading-landfall.ngrok-free.dev/api/donnees";
const char* commandUrl    = "https://gecko-shading-landfall.ngrok-free.dev/api/command/latest";
const char* API_KEY       = "SoussRoverSecretKey2026";
const String device_id    = "SOUSSROVER_01";

const char* ZONES[]     = { "A", "B", "C" };
const int   NB_ZONES    = 3;
int         zoneIndex   = 0;   

// ======== NTP ========
#define NTP_SERVER  "pool.ntp.org"
#define GMT_OFFSET  0   
#define DST_OFFSET  0

// ======================================================
#ifndef SIMULATION_WOKWI
  BluetoothSerial SerialBT;
#endif

// === PINS MOTEURS ===
#define AIN1 27
#define AIN2 26
#define PWMA 25
#define BIN1 21
#define BIN2 22
#define PWMB 14
#define STBY 13

#define PWM_FREQ 5000
#define PWM_RES  8
int vitesse = 180;
bool isMoving = false; // Télémétrie

// === PINS CAPTEURS ===
#define capt_G 32
#define capt_D 33
#define capt_C 23
#define trigPin 16
#define echoPin 17
#define DISTANCE_STOP 20
#define DISTANCE_SLOW 40

// === CAPTEURS AGRICOLES ===
#define SERVO_PIN             18
#define PIN_CAPTEUR_HUMIDITE  34
#define BATTERY_PIN           35

#define DHTPIN 19     
#define DHTTYPE DHT22 
DHT dht(DHTPIN, DHTTYPE);

#define ANGLE_REPOS    10
#define ANGLE_MESURE   100
#define ANGLE_SECURITE 140

Servo servoMotor;

// === MACHINE A ÉTATS ===
String currentMode = "AUTO"; // "AUTO", "BT", "WIFI"
float distanceObstacleGlobal = 999.0;
unsigned long lastCommandFetch = 0;
unsigned long lastWifiAttempt = 0;
bool isMeasuring = false;

// ======================================================
//  NTP
// ======================================================
String obtenirTimestamp() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 2000)) {
    unsigned long ms  = millis();
    unsigned long sec = ms / 1000;
    unsigned long min = sec / 60;
    unsigned long hr  = min / 60;
    char buf[30];
    snprintf(buf, sizeof(buf), "2026-01-01T%02lu:%02lu:%02luZ", hr % 24, min % 60, sec % 60);
    return String(buf);
  }
  char buf[30];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%S.000Z", &timeinfo);
  return String(buf);
}

// ======================================================
//  HC-SR04
// ======================================================
float mesurerDistance() {
  digitalWrite(trigPin, LOW); delayMicroseconds(2);
  digitalWrite(trigPin, HIGH); delayMicroseconds(10);
  digitalWrite(trigPin, LOW);
  long dur = pulseIn(echoPin, HIGH, 30000);
  if (dur == 0) return 999.0;
  return dur * 0.034 / 2.0;
}

// ======================================================
//  Servo doux
// ======================================================
void allerDoucement(int depart, int arrivee) {
  int step = (depart < arrivee) ? 1 : -1;
  for (int a = depart; a != arrivee; a += step) {
    servoMotor.write(a);
    delay(20);
  }
  servoMotor.write(arrivee);
}

// ======================================================
//  MOTEURS
// ======================================================
void avancer()     { digitalWrite(AIN1,HIGH);digitalWrite(AIN2,LOW);digitalWrite(BIN1,HIGH);digitalWrite(BIN2,LOW);ledcWrite(PWMA,vitesse);ledcWrite(PWMB,vitesse); isMoving = true; }
void reculer()     { digitalWrite(AIN1,LOW);digitalWrite(AIN2,HIGH);digitalWrite(BIN1,LOW);digitalWrite(BIN2,HIGH);ledcWrite(PWMA,vitesse);ledcWrite(PWMB,vitesse); isMoving = true; }
void gauche()      { digitalWrite(AIN1,LOW);digitalWrite(AIN2,HIGH);digitalWrite(BIN1,HIGH);digitalWrite(BIN2,LOW);ledcWrite(PWMA,vitesse);ledcWrite(PWMB,vitesse); isMoving = true; }
void droite()      { digitalWrite(AIN1,HIGH);digitalWrite(AIN2,LOW);digitalWrite(BIN1,LOW);digitalWrite(BIN2,HIGH);ledcWrite(PWMA,vitesse);ledcWrite(PWMB,vitesse); isMoving = true; }
void stopMoteurs() { ledcWrite(PWMA,0);ledcWrite(PWMB,0); isMoving = false; }

void executerCommande(char cmd) {
  if (distanceObstacleGlobal < DISTANCE_STOP && cmd == 'F') {
    stopMoteurs();
    return;
  }
  if (cmd == 'F') avancer();
  else if (cmd == 'B') reculer();
  else if (cmd == 'L') gauche();
  else if (cmd == 'R') droite();
  else if (cmd == 'S' || cmd == 'W' || cmd == 'H') stopMoteurs(); // STOP_ALL devient 'S'
}

String getRobotStatus() {
  if (distanceObstacleGlobal < DISTANCE_STOP) return "obstacle";
  if (!isMoving) return "stopped";
  return "moving";
}

// ======================================================
//  SETUP
// ======================================================
void setup() {
  Serial.begin(115200);
  #ifndef SIMULATION_WOKWI
    SerialBT.begin("ROBOT_CHENILLE");
  #endif

  dht.begin();

  pinMode(AIN1, OUTPUT); pinMode(AIN2, OUTPUT);
  pinMode(BIN1, OUTPUT); pinMode(BIN2, OUTPUT);
  pinMode(STBY, OUTPUT); digitalWrite(STBY, HIGH);

  ledcAttach(PWMA, PWM_FREQ, PWM_RES);
  ledcAttach(PWMB, PWM_FREQ, PWM_RES);

  pinMode(capt_G, INPUT); pinMode(capt_D, INPUT); pinMode(capt_C, INPUT);
  pinMode(trigPin, OUTPUT); pinMode(echoPin, INPUT);
  pinMode(BATTERY_PIN, INPUT);

  servoMotor.attach(SERVO_PIN);
  servoMotor.write(ANGLE_REPOS);
  delay(500);

  Serial.print("Connexion WiFi");
  WiFi.begin(ssid, password);
  unsigned long tDebut = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - tDebut < 10000) {
    delay(500); Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ WiFi connecté !");
    configTime(GMT_OFFSET, DST_OFFSET, NTP_SERVER, "time.nist.gov");
  } else {
    Serial.println("\n⚠️ WiFi non connecté !");
  }

  Serial.println("========================================");
  Serial.println("   SOUSSROVER — IoT V2.0");
  Serial.println("========================================");
}

// ====================================================== //
//  ENVOI AU BACKEND SOUSSROVER
// ======================================================
void envoyerAuServeur(float humidite_sol_pct, float temp_air, float hum_air) {
  if (WiFi.status() != WL_CONNECTED) return; // Non-bloquant, on abandonne si pas de WiFi

  WiFiClientSecure client;
  client.setInsecure(); // Gardé pour le prototype (sans validateur de certificat lourd)

  HTTPClient http;
  if (!http.begin(client, serverUrl)) return;
  
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-key", API_KEY);
  http.addHeader("ngrok-skip-browser-warning", "true"); // Contourne l'avertissement ngrok
  http.setTimeout(8000); 

  StaticJsonDocument<512> doc;
  doc["device_id"]         = device_id;
  doc["zone"]              = ZONES[zoneIndex];
  doc["timestamp"]         = obtenirTimestamp();  
  doc["humidite_sol"]      = humidite_sol_pct;
  doc["temperature_air"]   = temp_air;
  doc["humidite_air"]      = hum_air;
  
  // Télémétrie complète
  doc["distance_obstacle"] = distanceObstacleGlobal;
  doc["mode"]              = currentMode;
  doc["robot_status"]      = getRobotStatus();
  
  // Batterie
  int valBat = analogRead(BATTERY_PIN);
  float batteryPct = constrain(map(valBat, 0, 4095, 0, 100), 0, 100);
  doc["battery_level"]     = batteryPct;

  String payload;
  serializeJson(doc, payload);
  Serial.println("[RÉSEAU] Envoi POST → " + payload);

  int code = http.POST(payload);
  if (code == 200) {
    Serial.println("✅ [SERVEUR] Données enregistrées !");
  } else {
    Serial.printf("❌ [RÉSEAU] Erreur HTTP %d\n", code);
  }
  http.end();
}

// ======================================================
//  FETCH COMMANDS WIFI
// ======================================================
void fetchWiFiCommand() {
  if (millis() - lastCommandFetch < 1000) return; // Polling toutes les 1s
  lastCommandFetch = millis();
  if (WiFi.status() != WL_CONNECTED) return;
  
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  if (!http.begin(client, commandUrl)) return;
  http.addHeader("ngrok-skip-browser-warning", "true"); // Contourne l'avertissement ngrok
  
  int code = http.GET();
  if (code == 200) {
    StaticJsonDocument<256> rep;
    deserializeJson(rep, http.getString());
    const char* cmdStr = rep["command"];
    if (cmdStr) {
      char cmd = cmdStr[0];
      if (String(cmdStr) == "STOP_ALL") cmd = 'S';
      Serial.printf("[WIFI] Commande reçue : %c\n", cmd);
      executerCommande(cmd);
    }
  }
  http.end();
}

// ======================================================
//  GÉRER WIFI (Non bloquant)
// ======================================================
void gererWiFi() {
  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - lastWifiAttempt > 5000) {
      WiFi.disconnect();
      WiFi.reconnect();
      lastWifiAttempt = millis();
    }
  }
}

// ======================================================
//  LOOP
// ======================================================
void loop() {
  gererWiFi();
  distanceObstacleGlobal = mesurerDistance();

  // Détection Obstacle critique (pour TOUS les modes)
  if (distanceObstacleGlobal > 0 && distanceObstacleGlobal < DISTANCE_STOP) {
    if (isMoving) {
      stopMoteurs();
      Serial.println("Obstacle detected"); // Journalisation des obstacles
    }
  }

  // ── 1. ÉCOUTE BLUETOOTH (Changement de Mode ou Commandes)
  #ifndef SIMULATION_WOKWI
  if (SerialBT.available()) {
    char cmd = SerialBT.read();
    if (cmd == '\n' || cmd == '\r') return;

    if      (cmd == 'X') { currentMode = "AUTO"; stopMoteurs(); Serial.println("MODE AUTO ACTIVÉ"); }
    else if (cmd == 'Y') { currentMode = "BT";   stopMoteurs(); Serial.println("MODE BT ACTIVÉ"); }
    else if (cmd == 'Z') { currentMode = "WIFI"; stopMoteurs(); Serial.println("MODE WIFI ACTIVÉ"); }

    if (currentMode == "BT") {
      executerCommande(cmd);
    }
  }
  #endif

  // ── 2. MODE WIFI
  if (currentMode == "WIFI") {
    fetchWiFiCommand();
  }

  // ── 3. MODE AUTOMATIQUE
  if (currentMode == "AUTO" && !isMeasuring) {
    if (distanceObstacleGlobal < DISTANCE_STOP) {
      stopMoteurs();
      return; // Bloque l'avancée automatique
    }

    int etatG = digitalRead(capt_G);
    int etatD = digitalRead(capt_D);
    int etatC = digitalRead(capt_C);
    int vit   = (distanceObstacleGlobal < DISTANCE_SLOW) ? vitesse / 2 : vitesse;

    // ── CROIX NOIRE : Prélèvement ──
    if (etatG == 0 && etatD == 0) {
      isMeasuring = true;
      stopMoteurs();
      Serial.printf(">>> ZONE %s — PRÉLÈVEMENT <<<\n", ZONES[zoneIndex]);
      
      allerDoucement(ANGLE_REPOS, ANGLE_MESURE);
      delay(1500); // Le delay ici est justifié car le robot EST à l'arrêt pour une tâche précise

      int   brut            = analogRead(PIN_CAPTEUR_HUMIDITE);
      float humidite_sol    = constrain(map(brut, 4095, 0, 0, 100), 0, 100);
      float temperature_air = dht.readTemperature();  
      float humidite_air    = dht.readHumidity();  

      if (isnan(temperature_air)) temperature_air = 25.0;
      if (isnan(humidite_air)) humidite_air = 50.0;

      Serial.printf("Sol : %.1f%% | Air Temp: %.1f°C | Air Hum: %.1f%%\n", humidite_sol, temperature_air, humidite_air);
      envoyerAuServeur(humidite_sol, temperature_air, humidite_air);

      allerDoucement(ANGLE_MESURE, ANGLE_SECURITE);
      delay(500);
      allerDoucement(ANGLE_SECURITE, ANGLE_REPOS);

      avancer();
      delay(400); // Pour dépasser la croix noire

      zoneIndex = (zoneIndex + 1) % NB_ZONES;
      Serial.printf(">>> Prochaine zone : %s <<<\n", ZONES[zoneIndex]);
      isMeasuring = false;
    }
    // Centré
    else if (etatC == 0 && etatG == 1 && etatD == 1) {
      digitalWrite(AIN1,HIGH);digitalWrite(AIN2,LOW);
      digitalWrite(BIN1,HIGH);digitalWrite(BIN2,LOW);
      ledcWrite(PWMA, vit); ledcWrite(PWMB, vit);
      isMoving = true;
    }
    // Déviation gauche
    else if (etatG == 0 && etatC == 1) {
      digitalWrite(AIN1,HIGH);digitalWrite(AIN2,LOW);
      digitalWrite(BIN1,HIGH);digitalWrite(BIN2,LOW);
      ledcWrite(PWMA, vit/2); ledcWrite(PWMB, vit);
      isMoving = true;
    }
    // Déviation droite
    else if (etatD == 0 && etatC == 1) {
      digitalWrite(AIN1,HIGH);digitalWrite(AIN2,LOW);
      digitalWrite(BIN1,LOW); digitalWrite(BIN2,HIGH);
      ledcWrite(PWMA, vit); ledcWrite(PWMB, vit/2);
      isMoving = true;
    }
    // Ligne perdue
    else if (etatG == 1 && etatC == 1 && etatD == 1) {
      stopMoteurs();
    }
  }

  // Petit repos du CPU
  delayMicroseconds(100);
}
