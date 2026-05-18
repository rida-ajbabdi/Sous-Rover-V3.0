// ============================================================
// SoussRover — Configuration Centralisée
// ============================================================
// Charge les variables d'environnement et expose un objet config unique.
// Tous les modules importent ce fichier au lieu de lire process.env directement.

require('dotenv').config();
const path = require('path');

const config = {

  // ── Serveur ──────────────────────────────────────────────────
  port: parseInt(process.env.PORT, 10) || 3000,

  // ── Base de données ──────────────────────────────────────────
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'soussrover.db'),

  // ── API Météo OpenWeatherMap ─────────────────────────────────
  owm: {
    apiKey       : process.env.OWM_API_KEY || '',
    baseUrl      : 'https://api.openweathermap.org/data/2.5/forecast',
    cacheDureeMin: parseInt(process.env.CACHE_METEO_MINUTES, 10) || 15
  },

  // ── Coordonnées GPS par défaut (Souss-Massa) ────────────────
  geo: {
    lat: parseFloat(process.env.DEFAULT_LAT) || 30.4278,
    lon: parseFloat(process.env.DEFAULT_LON) || -9.5981
  },

  // ── Seuils d'humidité par défaut ─────────────────────────────
  seuils: {
    critique : parseFloat(process.env.SEUIL_CRITIQUE)  || 20.0,
    attention: parseFloat(process.env.SEUIL_ATTENTION)  || 35.0
  }
};

module.exports = config;
