// ============================================================
// SoussRover — Route : /api/meteo
// ============================================================
// GET  /courante → Données météo actuelles (cache ou API OWM)

const express            = require('express');
const router             = express.Router();
const { obtenirMeteo }   = require('../modules/meteo');
const config             = require('../config');

// ── GET /api/meteo/courante ──────────────────────────────────
router.get('/courante', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat) || config.geo.lat;
    const lon = parseFloat(req.query.lon) || config.geo.lon;

    const meteo = await obtenirMeteo(lat, lon);
    res.json({
      latitude  : lat,
      longitude : lon,
      ...meteo
    });
  } catch (err) {
    res.status(500).json({ erreur: 'Impossible de récupérer la météo', details: err.message });
  }
});

module.exports = router;
