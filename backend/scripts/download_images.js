// ============================================================
// SoussRover — Script de téléchargement automatique des images
// ============================================================
// Utilise picsum.photos (100% gratuit, sans API key, toujours disponible)
// Usage : node scripts/download_images.js  (depuis le dossier backend/)
// ============================================================

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ── Chemin correct : backend/scripts/ -> ../../frontend/assets/images
const BASE_DIR = path.join(__dirname, '..', '..', 'frontend', 'assets', 'images');

// ── Picsum Photos : chaque ID donne une image HD différente et fixe
// IDs choisis pour correspondre visuellement à chaque catégorie
const IMAGES = [
  // ── VILLES ─────────────────────────────────────────────────
  { dir: 'villes', file: 'agadir.jpg',       id: 1029 }, // Plage
  { dir: 'villes', file: 'tiznit.jpg',       id: 1053 }, // Vieille ville
  { dir: 'villes', file: 'marrakech.jpg',    id: 1076 }, // Architecture
  { dir: 'villes', file: 'casablanca.jpg',   id: 1015 }, // Ville moderne
  { dir: 'villes', file: 'rabat.jpg',        id: 1011 }, // Côte
  { dir: 'villes', file: 'fes.jpg',          id: 1074 }, // Médina
  { dir: 'villes', file: 'meknes.jpg',       id: 1037 }, // Monuments
  { dir: 'villes', file: 'oujda.jpg',        id: 1043 }, // Paysage
  { dir: 'villes', file: 'tanger.jpg',       id: 1018 }, // Port/mer
  { dir: 'villes', file: 'laayoune.jpg',     id: 1080 }, // Désert
  { dir: 'villes', file: 'taroudant.jpg',    id: 1033 }, // Remparts
  { dir: 'villes', file: 'ouarzazate.jpg',   id: 1049 }, // Désert/kasbah
  { dir: 'villes', file: 'default.jpg',      id: 1025 }, // Maroc général

  // ── TYPES DE SOL ───────────────────────────────────────────
  { dir: 'sols', file: 'sableux.jpg',         id: 399 }, // Sable/dunes
  { dir: 'sols', file: 'limoneux.jpg',        id: 593 }, // Terre brune
  { dir: 'sols', file: 'argileux.jpg',        id: 145 }, // Argile sèche
  { dir: 'sols', file: 'sablo-limoneux.jpg',  id: 159 }, // Sol mixte
  { dir: 'sols', file: 'default.jpg',         id: 211 }, // Terre générique

  // ── TYPES DE PLANTE ────────────────────────────────────────
  { dir: 'plantes', file: 'tomate.jpg',          id: 292 }, // Rouge/légumes
  { dir: 'plantes', file: 'pomme-de-terre.jpg',  id: 306 }, // Champ récolte
  { dir: 'plantes', file: 'agrume.jpg',          id: 326 }, // Oranges
  { dir: 'plantes', file: 'oignon.jpg',          id: 316 }, // Légumes
  { dir: 'plantes', file: 'poivron.jpg',         id: 339 }, // Coloré
  { dir: 'plantes', file: 'ble.jpg',             id: 372 }, // Champ de blé
  { dir: 'plantes', file: 'maraichage.jpg',      id: 429 }, // Potager
  { dir: 'plantes', file: 'default.jpg',         id: 491 }, // Plante verte
];

// ── Créer les dossiers ────────────────────────────────────────
['villes', 'sols', 'plantes'].forEach(d => {
  const dir = path.join(BASE_DIR, d);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Créé : ${dir}`);
  }
});

// ── Téléchargement avec suivi de redirections ─────────────────
function downloadImage(url, destPath, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 10) return reject(new Error('Trop de redirections'));

    https.get(url, { headers: { 'User-Agent': 'SoussRoverBot/2.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
        return downloadImage(res.headers.location, destPath, redirectCount + 1)
          .then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} — ${url}`));
      }
      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', err => { fs.unlink(destPath, () => {}); reject(err); });
    }).on('error', reject);
  });
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log('\n🌍 Téléchargement des images SoussRover (picsum.photos)...\n');
  console.log(`📂 Destination : ${BASE_DIR}\n`);

  let success = 0, skipped = 0, errors = 0;

  for (const img of IMAGES) {
    const destPath = path.join(BASE_DIR, img.dir, img.file);

    if (fs.existsSync(destPath)) {
      console.log(`  ⏭️  Déjà présente  : ${img.dir}/${img.file}`);
      skipped++; success++;
      continue;
    }

    // Picsum: image fixe 800x600 par seed ID
    const url = `https://picsum.photos/seed/${img.id}/800/600`;

    try {
      process.stdout.write(`  ⬇️  ${img.dir}/${img.file} ... `);
      await downloadImage(url, destPath);
      const sizeKb = Math.round(fs.statSync(destPath).size / 1024);
      console.log(`✅  (${sizeKb} KB)`);
      success++;
      await new Promise(r => setTimeout(r, 300)); // pause légère
    } catch (err) {
      console.log(`❌  (${err.message})`);
      errors++;
    }
  }

  console.log(`\n────────────────────────────────────────────`);
  console.log(`📊 Total : ${success} OK  |  ${skipped} ignorées  |  ${errors} erreurs`);
  if (errors === 0) {
    console.log('🎉 Succès ! Toutes les images sont prêtes.\n');
  } else {
    console.log('⚠️  Certaines images ont échoué. Relancez le script pour réessayer.\n');
  }
}

main().catch(console.error);
