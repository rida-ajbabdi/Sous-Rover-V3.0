// ============================================================
// SoussRover — Middleware : Authentification API Key & JWT
// ============================================================

const jwt = require('jsonwebtoken');

const WRITE_KEY  = process.env.API_WRITE_KEY || 'SoussRoverSecretKey2026';
const READ_KEY   = process.env.API_READ_KEY  || 'SoussRoverReadKey2026';
const JWT_SECRET = process.env.JWT_SECRET || 'SoussRover_JWT_Ultra_Secret_2026_XkP9mNqL';

/**
 * Middleware pour les routes d'écriture (POST /api/donnees, etc.)
 * Utilisé principalement par l'ESP32 ou le Frontend
 */
function requireWriteKey(req, res, next) {
  // 1. Check API Key (pour l'ESP32)
  const apiKey = req.headers['x-api-key'];
  if (apiKey === WRITE_KEY) return next();

  // 2. Check JWT (pour le Dashboard Web)
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
      return next();
    } catch (err) {
      // Token invalide, on continue pour renvoyer une erreur 401
    }
  }

  return res.status(401).json({ erreur: 'Non autorisé — Clé API ou Jeton invalide' });
}

/**
 * Middleware pour les routes de lecture (GET /api/dashboard, etc.)
 */
function requireReadKey(req, res, next) {
  // 1. Check JWT (Dashboard)
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
      return next();
    } catch (err) {
      // Ignorer l'erreur pour vérifier les clés API en fallback
    }
  }

  // 2. Check API Key (ESP32 ou script tiers)
  const readKey  = req.headers['x-read-key'];
  const writeKey = req.headers['x-api-key'];

  if (readKey === READ_KEY || writeKey === WRITE_KEY) return next();

  return res.status(401).json({ erreur: 'Non autorisé — Authentification requise' });
}

module.exports = { requireWriteKey, requireReadKey };
