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
#include <DHT.h>     // <--- NOUVEAU : Bibliothèque du capteur d'air

// ======== CONFIGURATION WIFI & SERVEUR ========
const char* ssid     = "Wokwi-GUEST";
const char* password = "";

const char* serverUrl = "https://sous-rover--ridaajbabdi77.replit.app/api/donnees";
const String device_id = "SOUSSROVER_01";

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

// <--- NOUVEAU : Configuration du DHT22 sur la broche 19
#define DHTPIN 19     
#define DHTTYPE DHT22 
DHT dht(DHTPIN, DHTTYPE);

#define ANGLE_REPOS    10
#define ANGLE_MESURE   100
#define ANGLE_SECURITE 140

Servo servoMotor;

#ifdef SIMULATION_WOKWI
  bool modeAutomatique = true; 
#else
  bool modeAutomatique = false;
#endif

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
//  SETUP
// ======================================================
void setup() {
  Serial.begin(115200);
  #ifndef SIMULATION_WOKWI
    SerialBT.begin("ROBOT_CHENILLE");
  #endif

  dht.begin(); // <--- NOUVEAU : Démarrage du capteur d'air

  pinMode(AIN1, OUTPUT); pinMode(AIN2, OUTPUT);
  pinMode(BIN1, OUTPUT); pinMode(BIN2, OUTPUT);
  pinMode(STBY, OUTPUT); digitalWrite(STBY, HIGH);

  ledcAttach(PWMA, PWM_FREQ, PWM_RES);
  ledcAttach(PWMB, PWM_FREQ, PWM_RES);

  pinMode(capt_G, INPUT); pinMode(capt_D, INPUT); pinMode(capt_C, INPUT);
  pinMode(trigPin, OUTPUT); pinMode(echoPin, INPUT);

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
  Serial.println("   SOUSSROVER — Prêt (Avec Capteur Air DHT22)");
  Serial.println("========================================");
}

// ======================================================
//  MOTEURS
// ======================================================
void avancer()     { digitalWrite(AIN1,HIGH);digitalWrite(AIN2,LOW);digitalWrite(BIN1,HIGH);digitalWrite(BIN2,LOW);ledcWrite(PWMA,vitesse);ledcWrite(PWMB,vitesse); }
void reculer()     { digitalWrite(AIN1,LOW);digitalWrite(AIN2,HIGH);digitalWrite(BIN1,LOW);digitalWrite(BIN2,HIGH);ledcWrite(PWMA,vitesse);ledcWrite(PWMB,vitesse); }
void gauche()      { digitalWrite(AIN1,LOW);digitalWrite(AIN2,HIGH);digitalWrite(BIN1,HIGH);digitalWrite(BIN2,LOW);ledcWrite(PWMA,vitesse);ledcWrite(PWMB,vitesse); }
void droite() { digitalWrite(AIN1,HIGH);digitalWrite(AIN2,LOW);digitalWrite(BIN1,LOW);digitalWrite(BIN2,HIGH);ledcWrite(PWMA,vitesse);ledcWrite(PWMB,vitesse); }
void stopMoteurs() { ledcWrite(PWMA,0);ledcWrite(PWMB,0); }

// ====================================================== //
//  ENVOI AU BACKEND SOUSSROVER
// ======================================================
void envoyerAuServeur(float humidite_sol_pct, float temp_air, float hum_air) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠️ [RÉSEAU] WiFi déconnecté — tentative de reconnexion...");
    WiFi.reconnect();
    delay(3000);
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("❌ [RÉSEAU] Reconnexion échouée — mesure ignorée");
      return;
    }
  }

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  if (!http.begin(client, serverUrl)) {
    Serial.println("❌ [RÉSEAU] Impossible d'ouvrir la connexion HTTP");
    return;
  }
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(8000); 

  StaticJsonDocument<384> doc;
  doc["device_id"]       = device_id;
  doc["zone"]            = ZONES[zoneIndex];
  doc["timestamp"]       = obtenirTimestamp();  
  doc["humidite_sol"]    = humidite_sol_pct;
  doc["temperature_air"] = temp_air;
  doc["humidite_air"]    = hum_air;

  String payload;
  serializeJson(doc, payload);
  Serial.println("[RÉSEAU] Envoi → " + payload);

  int code = http.POST(payload);

  if (code == 200) {
    StaticJsonDocument<256> rep;
    DeserializationError err = deserializeJson(rep, http.getString());
    if (!err) {
      const char* statut = rep["statut"]         | "—";
      const char* msg    = rep["message"]         | "—";
      const char* reco   = rep["recommandation"]  | "—";
      Serial.printf("✅ [SERVEUR] Statut: %s | %s\n", statut, msg);
      Serial.printf("   Recommandation: %s\n", reco);
      
      #ifndef SIMULATION_WOKWI
        SerialBT.printf("Zone %s | Sol: %.1f%% | %s\n", ZONES[zoneIndex], humidite_sol_pct, statut);
      #endif
    }
  } else if (code == 400) {
    Serial.printf("❌ [SERVEUR] Données rejetées (400) : %s\n", http.getString().c_str());
  } else {
    Serial.printf("❌ [RÉSEAU] Erreur HTTP %d : %s\n", code, http.errorToString(code).c_str());
  }

  http.end();
}

// ======================================================
//  LOOP
// ======================================================
void loop() {
  float distance = mesurerDistance();

  // ── 1. BLUETOOTH (priorité absolue) ──────────────────────
  #ifndef SIMULATION_WOKWI
  if (SerialBT.available()) {
    char cmd = SerialBT.read();
    if (cmd == '\n' || cmd == '\r') return;

    if      (cmd == 'X') { modeAutomatique = true;  stopMoteurs(); Serial.println("MODE AUTO ACTIVÉ"); }
    else if (cmd == 'Y') { modeAutomatique = false; stopMoteurs(); Serial.println("MODE MANUEL ACTIVÉ"); }

    if (!modeAutomatique) {
      switch (cmd) {
        case 'F':
          if      (distance < DISTANCE_STOP) stopMoteurs();
          else if (distance < DISTANCE_SLOW) { avancer(); ledcWrite(PWMA, vitesse/2); ledcWrite(PWMB, vitesse/2); SerialBT.println("⚠️ Obstacle proche"); }
          else avancer();
          break;
        case 'B': reculer();     break;
        case 'L': gauche();      break;
        case 'R': droite();      break;
        case 'S': stopMoteurs(); break;
      }
    }
  }
  #endif

  // ── 2. MODE AUTOMATIQUE ───────────────────────────────────
  if (!modeAutomatique) return;

  if (distance > 0 && distance < DISTANCE_STOP) {
    stopMoteurs();
    delay(100);
    return;
  }

  int etatG = digitalRead(capt_G);
  int etatD = digitalRead(capt_D);
  int etatC = digitalRead(capt_C);
  int vit   = (distance < DISTANCE_SLOW) ? vitesse / 2 : vitesse;

  // ── CROIX NOIRE : les deux capteurs latéraux voient la ligne ──
  if (etatG == 0 && etatD == 0) {
    stopMoteurs();
    Serial.printf(">>> ZONE %s — PRÉLÈVEMENT <<<\n", ZONES[zoneIndex]);
    
    #ifndef SIMULATION_WOKWI
      SerialBT.printf("Zone %s atteinte — mesure en cours...\n", ZONES[zoneIndex]);
    #endif

    // 1. Descente
    allerDoucement(ANGLE_REPOS, ANGLE_MESURE);
    delay(1500);

    // 2. Lecture capteur humidité du sol
    int   brut            = analogRead(PIN_CAPTEUR_HUMIDITE);
    float humidite_sol    = constrain(map(brut, 4095, 0, 0, 100), 0, 100);

    // 3. NOUVEAU : Vraies valeurs du capteur d'air (DHT22) !!
    float temperature_air = dht.readTemperature();  
    float humidite_air    = dht.readHumidity();  

    // Si le capteur DHT a un problème, on met des valeurs par défaut
    if (isnan(temperature_air)) temperature_air = 25.0;
    if (isnan(humidite_air)) humidite_air = 50.0;

    Serial.printf("Sol : %.1f%% | Air Temp: %.1f°C | Air Hum: %.1f%%\n", humidite_sol, temperature_air, humidite_air);

    // 4. Envoi au serveur backend
    envoyerAuServeur(humidite_sol, temperature_air, humidite_air);

    // 5. Remontée et mise en sécurité
    allerDoucement(ANGLE_MESURE, ANGLE_SECURITE);
    delay(500);
    allerDoucement(ANGLE_SECURITE, ANGLE_REPOS);

    // 6. Avancement sur la ligne suivante (saut de croix)
    avancer();
    delay(400);

    // 7. Passage à la zone suivante (A → B → C → A)
    zoneIndex = (zoneIndex + 1) % NB_ZONES;
    Serial.printf(">>> Prochaine zone : %s <<<\n", ZONES[zoneIndex]);
  }

  // Centré
  else if (etatC == 0 && etatG == 1 && etatD == 1) {
    digitalWrite(AIN1,HIGH);digitalWrite(AIN2,LOW);
    digitalWrite(BIN1,HIGH);digitalWrite(BIN2,LOW);
    ledcWrite(PWMA, vit); ledcWrite(PWMB, vit);
  }
  // Déviation gauche
  else if (etatG == 0 && etatC == 1) {
    digitalWrite(AIN1,HIGH);digitalWrite(AIN2,LOW);
    digitalWrite(BIN1,HIGH);digitalWrite(BIN2,LOW);
    ledcWrite(PWMA, vit/2); ledcWrite(PWMB, vit);
  }
  // Déviation droite
  else if (etatD == 0 && etatC == 1) {
    digitalWrite(AIN1,HIGH);digitalWrite(AIN2,LOW);
    digitalWrite(BIN1,LOW); digitalWrite(BIN2,HIGH);
    ledcWrite(PWMA, vit); ledcWrite(PWMB, vit/2);
  }
  // Ligne perdue
  else if (etatG == 1 && etatC == 1 && etatD == 1) {
    stopMoteurs();
  }

  delayMicroseconds(10);
}
