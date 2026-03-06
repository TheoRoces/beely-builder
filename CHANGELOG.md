# Changelog

Toutes les modifications notables de **beely-builder** sont documentées ici.

Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versionné selon [Semantic Versioning](https://semver.org/lang/fr/).

## [1.0.0] - 2026-03-06

### Première version stable

**Builder visuel** :
- Éditeur de pages drag & drop avec preview live
- Bibliothèque de 375 wireframes (25 catégories)
- Ajout, suppression, réorganisation de sections
- Édition inline du contenu (textes, images)
- Preview responsive (desktop, tablette, mobile)
- Publication de pages statiques HTML

**Configurateur intégré** :
- 6 onglets : Site, Cookies/Analytics, Blog, Mentions légales, Serveur, Déploiement
- Génère `config-site.js`, `.env`, `.deploy.env`
- Auto-save via serveur Python (500ms debounce)
- Mode fallback sans serveur (téléchargement/copie)

**Serveur de développement** :
- `configurator-server.py` : micro-serveur Python zero-dependency
- Sert la racine du projet (répertoire parent)
- CORS whitelist (localhost uniquement)
- API : lecture/écriture de fichiers config, scan de pages, git commit
- Limite payload 10 Mo, sanitisation des messages git

**Accessibilité** :
- ARIA attributes sur toast, modals, iframe
- Focus trap dans les modals
- Focus rings (box-shadow) sur les éléments avec outline:none
- Titres sur les iframes de preview
