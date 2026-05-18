// ============================================================
// SoussRover — Serveur Backend Principal
// ============================================================
// Point d'entrée de l'application. Charge la configuration,
// initialise la BDD, monte les routes API et démarre le serveur.

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const http    = require('http');
const { Server } = require('socket.io');
const jwt     = require('jsonwebtoken');
const config  = require('./config');

const JWT_SECRET = process.env.JWT_SECRET || 'SoussRover_JWT_Ultra_Secret_2026_XkP9mNqL';

const db              = require('./modules/database');
const { logSysteme }  = require('./modules/logger');

const routesDonnees    = require('./routes/donnees');
const routesAlertes    = require('./routes/alertes');
const routesStats      = require('./routes/stats');
const routesMeteo      = require('./routes/meteo');
const routesZones      = require('./routes/zones');
const routesPrediction = require('./routes/prediction');
const routesLogs       = require('./routes/logs');
const routesDashboard  = require('./routes/dashboard');
const routesCommand    = require('./routes/command');
const routesMode       = require('./routes/mode');
const routesConfig     = require('./routes/config');
const routesAuth       = require('./routes/auth');

const app  = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Injecter io dans req pour l'utiliser dans les routes
app.use((req, res, next) => {
  req.io = io;
  next();
});
const PORT = config.port;

// ── Middlewares ──────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Servir les fichiers statiques du frontend
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Logger de chaque requête entrante
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ── Routes API ───────────────────────────────────────────────
app.use('/api/donnees',    routesDonnees);
app.use('/api/alertes',    routesAlertes);
app.use('/api/stats',      routesStats);
app.use('/api/meteo',      routesMeteo);
app.use('/api/zones',      routesZones);
app.use('/api/prediction', routesPrediction);
app.use('/api/logs',       routesLogs);
app.use('/api/dashboard',  routesDashboard);
app.use('/api/command',    routesCommand);
app.use('/api/mode',       routesMode);
app.use('/api/config',     routesConfig);
app.use('/api/auth',       routesAuth);

// ── Santé du serveur ─────────────────────────────────────────
app.get('/api/status', (req, res) => {
  res.json({
    status    : 'ok',
    timestamp : new Date().toISOString(),
    projet    : 'SoussRover v1.0',
    endpoints : [
      'POST   /api/donnees',
      'GET    /api/donnees/recentes',
      'GET    /api/donnees/zone/:code',
      'GET    /api/alertes/actives',
      'GET    /api/alertes/historique',
      'PUT    /api/alertes/:id/resoudre',
      'GET    /api/stats/journalier',
      'GET    /api/stats/hebdomadaire',
      'GET    /api/meteo/courante',
      'GET    /api/zones',
      'PUT    /api/zones/:id',
      'GET    /api/prediction/:zone',
      'GET    /api/logs',
      'GET    /api/dashboard'
    ]
  });
});

// ── Gestion des erreurs 404 ──────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ erreur: 'Endpoint introuvable' });
});

// ── WebSockets ───────────────────────────────────────────────
// Middleware de sécurité Socket.io (Auth via JWT)
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error('Authentification requise.'));
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.user = decoded; // Attacher les infos user
    next();
  } catch (err) {
    return next(new Error('Token invalide ou expiré.'));
  }
});

io.on('connection', (socket) => {
  console.log(`🔌 Admin connecté via WebSocket : ${socket.user.username} (ID: ${socket.id})`);
  socket.on('disconnect', () => {
    console.log(`🔌 Admin déconnecté : ${socket.user.username} (ID: ${socket.id})`);
  });
});

// ── Démarrage ────────────────────────────────────────────────
db.initialiserBDD(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅  SoussRover Backend démarré sur http://0.0.0.0:${PORT}`);
    console.log(`📋  API Status : http://0.0.0.0:${PORT}/api/status`);
    logSysteme('INFO', 'serveur', `Serveur démarré sur le port ${PORT}`);
  });
});
