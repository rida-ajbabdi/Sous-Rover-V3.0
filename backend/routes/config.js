// ============================================================
// SoussRover — Route : /api/config (Phase 2 ET0)
// ============================================================
// GET  /referentiels    → Retourne les listes villes/sols/plantes
// GET  /active          → Retourne la configuration système active
// POST /appliquer       → Sauvegarde la config choisie par l'utilisateur

const express          = require('express');
const router           = express.Router();
const multer           = require('multer');
const path             = require('path');
const { db }           = require('../modules/database');
const { logSysteme }   = require('../modules/logger');
const { requireReadKey, requireWriteKey } = require('../modules/auth');

// ── Configuration Multer ─────────────────────────────────────
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../../frontend/assets/images/uploads'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'upload-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// ── Helper promesse ──────────────────────────────────────────
function dbAll(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows))
  );
}
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row))
  );
}
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.run(sql, params, function(err) { err ? reject(err) : resolve(this); })
  );
}

// ── GET /api/config/referentiels ─────────────────────────────
// Retourne les 3 listes de référence pour peupler les dropdowns
router.get('/referentiels', requireReadKey, async (req, res) => {
  try {
    const [villes, sols, plantes] = await Promise.all([
      dbAll('SELECT id, nom, latitude, longitude, image_url FROM villes ORDER BY nom ASC'),
      dbAll('SELECT id, nom, facteur_conversion_mm, description, image_url FROM types_sol ORDER BY nom ASC'),
      dbAll('SELECT id, nom, kc, description, image_url FROM types_plante ORDER BY nom ASC'),
    ]);

    res.json({ villes, sols, plantes });
  } catch (err) {
    logSysteme('ERROR', 'config', `Erreur referentiels : ${err.message}`);
    res.status(500).json({ erreur: err.message });
  }
});

// ── GET /api/config/active ───────────────────────────────────
// Retourne la configuration système actuellement active (avec JOIN)
router.get('/active', requireReadKey, async (req, res) => {
  try {
    const config = await dbGet(`
      SELECT
        sc.updated_at,
        v.id    AS ville_id,    v.nom AS ville_nom,
        v.latitude,             v.longitude,
        v.image_url             AS ville_image,
        s.id    AS sol_id,      s.nom AS sol_nom,
        s.facteur_conversion_mm,
        s.image_url             AS sol_image,
        p.id    AS plante_id,   p.nom AS plante_nom,
        p.kc,
        p.image_url             AS plante_image
      FROM system_config sc
      LEFT JOIN villes       v ON sc.ville_id  = v.id
      LEFT JOIN types_sol    s ON sc.sol_id    = s.id
      LEFT JOIN types_plante p ON sc.plante_id = p.id
      WHERE sc.id = 1
    `);

    if (!config) {
      return res.status(404).json({ erreur: 'Aucune configuration système trouvée.' });
    }

    res.json(config);
  } catch (err) {
    logSysteme('ERROR', 'config', `Erreur config active : ${err.message}`);
    res.status(500).json({ erreur: err.message });
  }
});

// ── POST /api/config/appliquer ───────────────────────────────
// Reçoit { ville_id, sol_id, plante_id } et sauvegarde la config
router.post('/appliquer', requireWriteKey, async (req, res) => {
  const { ville_id, sol_id, plante_id } = req.body;

  if (!ville_id || !sol_id || !plante_id) {
    return res.status(400).json({
      erreur: 'Paramètres manquants : ville_id, sol_id, plante_id sont requis.'
    });
  }

  try {
    // Vérifier que les IDs existent en base
    const [ville, sol, plante] = await Promise.all([
      dbGet('SELECT id, nom FROM villes       WHERE id = ?', [ville_id]),
      dbGet('SELECT id, nom FROM types_sol    WHERE id = ?', [sol_id]),
      dbGet('SELECT id, nom FROM types_plante WHERE id = ?', [plante_id]),
    ]);

    if (!ville)  return res.status(404).json({ erreur: `Ville ID ${ville_id} introuvable.` });
    if (!sol)    return res.status(404).json({ erreur: `Sol ID ${sol_id} introuvable.` });
    if (!plante) return res.status(404).json({ erreur: `Plante ID ${plante_id} introuvable.` });

    // Upsert dans system_config (INSERT or REPLACE sur la ligne unique id=1)
    await dbRun(`
      INSERT INTO system_config (id, ville_id, sol_id, plante_id, updated_at)
      VALUES (1, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        ville_id   = excluded.ville_id,
        sol_id     = excluded.sol_id,
        plante_id  = excluded.plante_id,
        updated_at = excluded.updated_at
    `, [ville_id, sol_id, plante_id]);

    const message = `Config mise à jour → Ville: ${ville.nom} | Sol: ${sol.nom} | Plante: ${plante.nom}`;
    logSysteme('INFO', 'config', message);

    // Notifier le Dashboard via WebSocket
    if (req.io) {
      req.io.emit('config_updated', { ville, sol, plante });
    }

    res.json({
      success : true,
      message,
      config  : { ville, sol, plante }
    });

  } catch (err) {
    logSysteme('ERROR', 'config', `Erreur appliquer config : ${err.message}`);
    res.status(500).json({ erreur: err.message });
  }
});

// ── POST /api/config/villes ──────────────────────────────────
router.post('/villes', requireWriteKey, upload.single('image'), async (req, res) => {
  const { nom, latitude, longitude } = req.body;
  const image_url = req.file ? `/assets/images/uploads/${req.file.filename}` : '/assets/images/villes/default.jpg';
  
  if (!nom || latitude == null || longitude == null) {
    return res.status(400).json({ erreur: "Nom, latitude et longitude requis." });
  }
  try {
    const r = await dbRun(
      'INSERT INTO villes (nom, latitude, longitude, image_url) VALUES (?, ?, ?, ?)',
      [nom, latitude, longitude, image_url]
    );
    logSysteme('INFO', 'config', `Nouvelle ville ajoutée : ${nom}`);
    res.json({ success: true, id: r.lastID, nom, latitude, longitude, image_url });
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

// ── POST /api/config/plantes ─────────────────────────────────
router.post('/plantes', requireWriteKey, upload.single('image'), async (req, res) => {
  const { nom, kc, description } = req.body;
  const image_url = req.file ? `/assets/images/uploads/${req.file.filename}` : '/assets/images/plantes/default.jpg';

  if (!nom || kc == null) {
    return res.status(400).json({ erreur: "Nom et Kc requis." });
  }
  try {
    const r = await dbRun(
      'INSERT INTO types_plante (nom, kc, description, image_url) VALUES (?, ?, ?, ?)',
      [nom, kc, description || '', image_url]
    );
    logSysteme('INFO', 'config', `Nouvelle culture ajoutée : ${nom}`);
    res.json({ success: true, id: r.lastID, nom, kc, description, image_url });
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

// ── POST /api/config/sols ────────────────────────────────────
router.post('/sols', requireWriteKey, upload.single('image'), async (req, res) => {
  const { nom, facteur_conversion_mm, description } = req.body;
  const image_url = req.file ? `/assets/images/uploads/${req.file.filename}` : '/assets/images/sols/default.jpg';

  if (!nom || facteur_conversion_mm == null) {
    return res.status(400).json({ erreur: "Nom et facteur de rétention requis." });
  }
  try {
    const r = await dbRun(
      'INSERT INTO types_sol (nom, facteur_conversion_mm, description, image_url) VALUES (?, ?, ?, ?)',
      [nom, facteur_conversion_mm, description || '', image_url]
    );
    logSysteme('INFO', 'config', `Nouveau type de sol ajouté : ${nom}`);
    res.json({ success: true, id: r.lastID, nom, facteur_conversion_mm, description, image_url });
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

// ── DELETE /api/config/villes/:id ───────────────────────────
router.delete('/villes/:id', requireWriteKey, async (req, res) => {
  try {
    const cfg = await dbGet('SELECT ville_id FROM system_config WHERE id = 1');
    if (cfg && parseInt(cfg.ville_id) === parseInt(req.params.id)) {
      return res.status(400).json({ erreur: 'Impossible de supprimer la ville actuellement active.' });
    }
    const r = await dbRun('DELETE FROM villes WHERE id = ?', [req.params.id]);
    if (r.changes === 0) return res.status(404).json({ erreur: 'Ville introuvable.' });
    logSysteme('INFO', 'config', `Ville supprimée : ID ${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

// ── DELETE /api/config/plantes/:id ──────────────────────────
router.delete('/plantes/:id', requireWriteKey, async (req, res) => {
  try {
    const cfg = await dbGet('SELECT plante_id FROM system_config WHERE id = 1');
    if (cfg && parseInt(cfg.plante_id) === parseInt(req.params.id)) {
      return res.status(400).json({ erreur: 'Impossible de supprimer la culture actuellement active.' });
    }
    const r = await dbRun('DELETE FROM types_plante WHERE id = ?', [req.params.id]);
    if (r.changes === 0) return res.status(404).json({ erreur: 'Culture introuvable.' });
    logSysteme('INFO', 'config', `Culture supprimée : ID ${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

// ── DELETE /api/config/sols/:id ─────────────────────────────
router.delete('/sols/:id', requireWriteKey, async (req, res) => {
  try {
    const cfg = await dbGet('SELECT sol_id FROM system_config WHERE id = 1');
    if (cfg && parseInt(cfg.sol_id) === parseInt(req.params.id)) {
      return res.status(400).json({ erreur: 'Impossible de supprimer le type de sol actuellement actif.' });
    }
    const r = await dbRun('DELETE FROM types_sol WHERE id = ?', [req.params.id]);
    if (r.changes === 0) return res.status(404).json({ erreur: 'Type de sol introuvable.' });
    logSysteme('INFO', 'config', `Sol supprimé : ID ${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

module.exports = router;
