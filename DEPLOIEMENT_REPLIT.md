# 🚀 Guide de Déploiement SoussRover sur Replit

## ✅ Pré-requis : Étapes à faire UNE SEULE FOIS

### Étape 1 — Importer le projet depuis GitHub
1. Allez sur **https://replit.com**
2. Cliquez sur **"+ Create Repl"**
3. Choisissez **"Import from GitHub"**
4. Collez l'URL de votre dépôt GitHub (ex: `https://github.com/VOTRE_NOM/SoussRover`)
5. Replit détectera automatiquement Node.js et le fichier `.replit`

---

### Étape 2 — Configurer les Secrets (VARIABLES D'ENVIRONNEMENT)
> ⚠️ CRITIQUE : Le fichier `.env` n'est PAS envoyé sur GitHub (il est dans `.gitignore`).
> Vous DEVEZ reconfigurer ces variables dans Replit.

1. Dans Replit, cliquez sur l'icône **🔒 Secrets** (cadenas dans le menu gauche)
2. Ajoutez les 3 secrets suivants :

| Clé | Valeur |
|-----|--------|
| `OWM_API_KEY` | `448a8c1e6fb440a8ec823b4707ab5ff0` |
| `JWT_SECRET` | `SoussRover_JWT_Ultra_Secret_2026_XkP9mNqL` |
| `PORT` | `3000` |

---

### Étape 3 — Installer les dépendances
Dans le Shell de Replit, tapez :
```bash
cd backend && npm install
```

---

### Étape 4 — Lancer l'application
Cliquez sur le bouton **▶️ Run** en haut de Replit.

Le serveur démarre sur le port **3000** et Replit l'exposera automatiquement sur une URL publique comme :
`https://soussrover.VOTRE_NOM.repl.co`

---

## ⚙️ Configuration de l'ESP32 en production

Une fois l'application hébergée sur Replit, mettez à jour le code de l'ESP32 (`sketch.ino`) :

```cpp
// Remplacer "localhost" par l'URL Replit
const char* SERVER_URL = "https://soussrover.VOTRE_NOM.repl.co/api/donnees";
```

---

## 🔑 Identifiants de connexion

| Champ | Valeur |
|-------|--------|
| **Username** | `Rida Ajbabdi` |
| **Password** | `Rida Ajbabdi` |

---

## 📌 Architecture Replit

```
SoussRover/
├── .replit            ← Configuration Replit (port 3000)
├── frontend/          ← Servi comme fichiers statiques par Express
│   ├── index.html
│   ├── app.js
│   ├── style.css
│   └── assets/
├── backend/           ← Serveur Node.js/Express
│   ├── server.js      ← Point d'entrée (npm start)
│   ├── package.json
│   └── ...
```

---

## ⚠️ Limitations connues de Replit (Plan Gratuit)

| Limitation | Impact | Solution |
|---|---|---|
| **Mise en veille** après inactivité | L'ESP32 ne peut plus envoyer de données | Utiliser [UptimeRobot](https://uptimerobot.com) pour pinger le serveur toutes les 5 min |
| **Stockage éphémère** | Les images uploadées (`/uploads`) peuvent disparaître | Prévoir un stockage externe (Cloudinary) pour la production finale |
| **SQLite** non persistant si reboot | La BDD se recrée mais les données custom sont perdues | Le seeding automatique recrée l'admin et les données par défaut |
