// ============================================================
// SoussRover — Route : /api/auth
// ============================================================
// POST /login  → Vérifie les credentials, retourne un JWT

const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const { db }  = require('../modules/database');
const { logSysteme } = require('../modules/logger');

const JWT_SECRET  = process.env.JWT_SECRET || 'SoussRover_JWT_Ultra_Secret_2026_XkP9mNqL';
const JWT_EXPIRES = '24h'; // Token valide 24 heures

// ── Helper promesse ──────────────────────────────────────────
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row))
  );
}

// ── POST /api/auth/login ─────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  // Validation basique des entrées
  if (!username || !password) {
    return res.status(400).json({ erreur: 'Nom d\'utilisateur et mot de passe requis.' });
  }

  try {
    // 1. Chercher l'utilisateur en base (insensible à la casse)
    const user = await dbGet(
      'SELECT * FROM utilisateurs WHERE LOWER(username) = LOWER(?)',
      [username.trim()]
    );

    if (!user) {
      logSysteme('WARNING', 'auth', `Tentative de connexion échouée pour : ${username}`);
      return res.status(401).json({ erreur: 'Identifiants incorrects.' });
    }

    // 2. Vérifier le mot de passe avec bcrypt
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      logSysteme('WARNING', 'auth', `Mauvais mot de passe pour : ${username}`);
      return res.status(401).json({ erreur: 'Identifiants incorrects.' });
    }

    // 3. Générer le JWT
    const payload = {
      id       : user.id,
      username : user.username,
      role     : user.role
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });

    logSysteme('INFO', 'auth', `Connexion réussie : ${user.username} (${user.role})`);

    res.json({
      success  : true,
      token,
      user     : { id: user.id, username: user.username, role: user.role },
      expiresIn: JWT_EXPIRES
    });

  } catch (err) {
    logSysteme('ERROR', 'auth', `Erreur login : ${err.message}`);
    res.status(500).json({ erreur: 'Erreur serveur interne.' });
  }
});

// ── GET /api/auth/verify ─────────────────────────────────────
// Permet au frontend de vérifier si un token est encore valide
router.get('/verify', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

  if (!token) {
    return res.status(401).json({ valid: false, erreur: 'Token manquant.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ valid: true, user: { id: decoded.id, username: decoded.username, role: decoded.role } });
  } catch (err) {
    res.status(401).json({ valid: false, erreur: 'Token invalide ou expiré.' });
  }
});

module.exports = router;
module.exports.JWT_SECRET = JWT_SECRET;
