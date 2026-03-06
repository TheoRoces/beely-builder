# Beely Builder

Builder visuel et configurateur pour le framework **Site System**.

## Contenu

| Outil | Description |
|---|---|
| **Builder** | Éditeur visuel de pages HTML (drag & drop de wireframes, édition en place) |
| **Configurateur** | Interface pour générer `config-site.js`, `.env`, `.deploy.env` et `.htpasswd` |
| **Serveur Python** | Micro-serveur local (port 5555) pour l'écriture directe des fichiers sur disque |

## Utilisation

Ce repo est utilisé comme **submodule Git** dans chaque projet client (dossier `builder/`).

```bash
# Depuis la racine d'un projet client
python3 builder/configurator-server.py

# Puis ouvrir dans le navigateur :
# Configurateur → http://localhost:5555/builder/configurator.html
# Builder       → http://localhost:5555/builder/
```

## Fichiers principaux

- `configurator.html` — Interface du configurateur (HTML + CSS + JS inline)
- `configurator-server.py` — Serveur Python zero-dependency (stdlib uniquement)
- `builder.html` — Interface du builder visuel
- `builder.css` — Styles partagés (configurateur + builder)
- `js/` — Modules JS du builder (canvas, éditeur, bibliothèque, déploiement)

## Repos liés

- [beely-framework](https://github.com/TheoRoces/beely-framework) — Framework CSS/JS/composants
- [beely-template](https://github.com/TheoRoces/beely-template) — Template de démarrage pour projets clients
