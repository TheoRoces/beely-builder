# Beely Configurateur

Outil d'administration pour le framework **Site System**.

## Contenu

| Outil | Description |
|---|---|
| **Configurateur** | Interface pour gérer les pages, la configuration du site, la médiathèque et les icônes |
| **Serveur Python** | Micro-serveur local (port 5555) pour l'écriture directe des fichiers sur disque |

## Utilisation

Ce repo est utilisé comme **submodule Git** dans chaque projet client (dossier `configurateur/`).

```bash
# Depuis la racine d'un projet client
python3 configurateur/configurator-server.py

# Puis ouvrir dans le navigateur :
# http://localhost:5555/configurateur/
```

## Fichiers principaux

- `index.html` — Interface principale du configurateur
- `configurator.html` — Interface du configurateur de design tokens (chargé en iframe)
- `configurator-server.py` — Serveur Python zero-dependency (stdlib uniquement)
- `configurateur.css` — Styles de l'interface
- `js/` — Modules JS (API, pages, médiathèque, déploiement, configuration)

## Repos liés

- [beely-framework](https://github.com/TheoRoces/beely-framework) — Framework CSS/JS/composants
- [beely-template](https://github.com/TheoRoces/beely-template) — Template de démarrage pour projets clients
