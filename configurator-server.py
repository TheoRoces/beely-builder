#!/usr/bin/env python3
"""
Micro-serveur pour le Configurateur Site System.
Sert les fichiers statiques du projet parent + gère les écritures via POST.

Usage (depuis la racine du projet) :
  python3 configurateur/configurator-server.py
  → http://localhost:5555/configurateur/

Zéro-dépendance (stdlib Python 3 uniquement).
"""

import base64
import html as html_mod
import json
import os
import re
import shutil
import subprocess
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = 5555
# ROOT = répertoire parent du builder (la racine du projet)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Origines autorisées pour CORS (localhost uniquement)
ALLOWED_ORIGINS = {
    'http://localhost:5555',
    'http://127.0.0.1:5555',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:5501',
    'http://127.0.0.1:5501',
    'http://localhost:5502',
    'http://127.0.0.1:5502',
}

# Fichiers autorisés en écriture directe (configurateur)
ALLOWED_CFG_FILES = {'config-site.js', '.env', '.deploy.env', '.htpasswd'}

# Dossiers protégés (pas d'écriture/suppression de pages)
PROTECTED_DIRS = {'core', 'wireframes', 'api', 'components', 'snippets',
                  'assets', 'configurateur', 'data', 'docs',
                  '.git', '.claude', '.vscode', '.framework'}

# Fichiers protégés contre la suppression
PROTECTED_FILES = {'index.html', '404.html', 'configurator.html', 'config-site.js'}

# Fichiers à ignorer dans le scan de pages
IGNORED_HTML = {'404.html', 'configurator.html', 'base-index.html'}


def safe_path(path_str):
    """Résout un chemin et vérifie qu'il est dans ROOT. Retourne None si invalide."""
    if not path_str or '..' in path_str:
        return None
    resolved = os.path.realpath(os.path.join(ROOT, path_str))
    if not resolved.startswith(os.path.realpath(ROOT)):
        return None
    return resolved


def is_protected_path(path_str):
    """Vérifie si le chemin est dans un dossier protégé."""
    parts = path_str.replace('\\', '/').split('/')
    return parts[0] in PROTECTED_DIRS if parts else False


def extract_title(html_content):
    """Extrait le contenu de <title> depuis du HTML."""
    match = re.search(r'<title[^>]*>(.*?)</title>', html_content, re.IGNORECASE | re.DOTALL)
    return html_mod.unescape(match.group(1).strip()) if match else ''


def scan_html_pages():
    """Scanne les fichiers .html à la racine et sous-dossiers (hors protégés)."""
    pages = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        # Filtrer les dossiers protégés
        rel_dir = os.path.relpath(dirpath, ROOT)
        if rel_dir != '.':
            top = rel_dir.replace('\\', '/').split('/')[0]
            if top in PROTECTED_DIRS or top.startswith('.'):
                dirnames.clear()
                continue

        for fname in sorted(filenames):
            if not fname.endswith('.html'):
                continue
            rel_path = os.path.relpath(os.path.join(dirpath, fname), ROOT)
            rel_path = rel_path.replace('\\', '/')

            if rel_path in IGNORED_HTML:
                continue

            # Lire le titre
            full_path = os.path.join(dirpath, fname)
            try:
                with open(full_path, 'r', encoding='utf-8') as f:
                    content = f.read(4096)  # Lire seulement le début
                title = extract_title(content)
            except Exception:
                title = ''

            pages.append({
                'filename': fname,
                'path': rel_path,
                'title': title,
                'readOnly': False,
                'isTemplate': False
            })

    # Détecter les templates : pages dans un sous-dossier dont le dossier
    # correspond à un fichier .html existant à la racine (ex: blog/article.html → blog.html)
    root_pages = {p['filename'] for p in pages if '/' not in p['path']}
    for page in pages:
        if '/' in page['path']:
            folder = page['path'].split('/')[0]
            page['isTemplate'] = (folder + '.html') in root_pages

    return pages


class BuilderHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_POST(self):
        try:
            body = self._read_body()
        except Exception:
            body = {}

        path = self.path.split('?')[0]  # Ignorer query string

        # ── Configurateur (existant) ──
        if path == '/api/cfg-save':
            self._handle_cfg_save(body)
        elif path == '/api/cfg-read':
            self._handle_cfg_read(body)
        elif path == '/api/cfg-htpasswd':
            self._handle_cfg_htpasswd(body)

        # ── Pages ──
        elif path == '/api/pages-list':
            self._handle_pages_list()
        elif path == '/api/page-create':
            self._handle_page_create(body)
        elif path == '/api/page-delete':
            self._handle_page_delete(body)
        elif path == '/api/page-rename':
            self._handle_page_rename(body)
        elif path == '/api/page-duplicate':
            self._handle_page_duplicate(body)

        # ── Icônes ──
        elif path == '/api/icons-list':
            self._handle_icons_list()

        # ── Médiathèque ──
        elif path == '/api/media-list':
            self._handle_media_list()
        elif path == '/api/media-upload':
            self._handle_media_upload(body)
        elif path == '/api/media-delete':
            self._handle_media_delete(body)
        elif path == '/api/media-rename':
            self._handle_media_rename(body)
        elif path == '/api/media-mkdir':
            self._handle_media_mkdir(body)
        elif path == '/api/media-move':
            self._handle_media_move(body)

        # ── Registre pages.json ──
        elif path == '/api/registry-read':
            self._handle_registry_read()
        elif path == '/api/registry-write':
            self._handle_registry_write(body)

        # ── Déploiement ──
        elif path == '/api/deploy':
            self._handle_deploy(body)
        elif path == '/api/git-push':
            self._handle_git_push(body)
        elif path == '/api/deploy-config':
            self._handle_deploy_config()

        else:
            self.send_error(404)

    # ═══════════════════════════════════════════════════════
    #  CONFIGURATEUR (endpoints existants)
    # ═══════════════════════════════════════════════════════

    def _handle_cfg_save(self, body):
        filename = body.get('file', '')
        content = body.get('content', '')
        if filename not in ALLOWED_CFG_FILES:
            return self._json(403, {'error': 'Fichier non autorisé: ' + filename})
        filepath = os.path.join(ROOT, filename)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        self._json(200, {'ok': True, 'file': filename})

    def _handle_cfg_read(self, body):
        filename = body.get('file', '')
        if filename not in ALLOWED_CFG_FILES:
            return self._json(403, {'error': 'Fichier non autorisé'})
        filepath = os.path.join(ROOT, filename)
        if not os.path.exists(filepath):
            return self._json(404, {'error': 'Fichier introuvable', 'file': filename})
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        self._json(200, {'ok': True, 'file': filename, 'content': content})

    def _handle_cfg_htpasswd(self, body):
        """Gère la protection HTTP : crée/supprime .htpasswd + injecte/retire le bloc auth dans .htaccess."""
        enabled = body.get('enabled', False)
        username = body.get('username', '').strip()
        password = body.get('password', '').strip()
        realm = body.get('realm', 'Accès restreint').strip()

        htpasswd_path = os.path.join(ROOT, '.htpasswd')
        htaccess_path = os.path.join(ROOT, '.htaccess')

        # Marqueurs pour retrouver le bloc dans .htaccess
        BEGIN_MARKER = '# --- BEGIN Protection HTTP (htpasswd) ---'
        END_MARKER = '# --- END Protection HTTP (htpasswd) ---'

        if not enabled:
            # Supprimer .htpasswd
            if os.path.exists(htpasswd_path):
                os.remove(htpasswd_path)
            # Retirer le bloc auth du .htaccess
            if os.path.exists(htaccess_path):
                with open(htaccess_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                if BEGIN_MARKER in content:
                    lines = content.split('\n')
                    new_lines = []
                    skip = False
                    for line in lines:
                        if line.strip() == BEGIN_MARKER:
                            skip = True
                            continue
                        if line.strip() == END_MARKER:
                            skip = False
                            continue
                        if not skip:
                            new_lines.append(line)
                    # Nettoyer les lignes vides consécutives en début
                    result = '\n'.join(new_lines)
                    while result.startswith('\n'):
                        result = result[1:]
                    with open(htaccess_path, 'w', encoding='utf-8') as f:
                        f.write(result)
            return self._json(200, {'ok': True, 'action': 'disabled'})

        # Validation
        if not username or not password:
            return self._json(400, {'error': 'Identifiant et mot de passe requis'})

        # Générer le hash avec htpasswd (disponible sur macOS via Apache)
        try:
            result = subprocess.run(
                ['htpasswd', '-nbB', username, password],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode != 0:
                return self._json(500, {'error': 'Erreur htpasswd: ' + result.stderr.strip()})
            htpasswd_line = result.stdout.strip()
        except FileNotFoundError:
            # Fallback : hash apr1 via openssl
            try:
                result = subprocess.run(
                    ['openssl', 'passwd', '-apr1', password],
                    capture_output=True, text=True, timeout=5
                )
                if result.returncode != 0:
                    return self._json(500, {'error': 'Erreur openssl: ' + result.stderr.strip()})
                htpasswd_line = username + ':' + result.stdout.strip()
            except FileNotFoundError:
                return self._json(500, {'error': 'Ni htpasswd ni openssl disponibles sur ce système'})

        # Écrire .htpasswd
        with open(htpasswd_path, 'w', encoding='utf-8') as f:
            f.write(htpasswd_line + '\n')

        # Injecter le bloc auth dans .htaccess
        abs_htpasswd = os.path.abspath(htpasswd_path)
        auth_block = '\n'.join([
            BEGIN_MARKER,
            'AuthType Basic',
            'AuthName "' + realm.replace('"', '\\"') + '"',
            'AuthUserFile ' + abs_htpasswd,
            'Require valid-user',
            END_MARKER
        ])

        if os.path.exists(htaccess_path):
            with open(htaccess_path, 'r', encoding='utf-8') as f:
                content = f.read()

            if BEGIN_MARKER in content:
                # Remplacer le bloc existant
                lines = content.split('\n')
                new_lines = []
                skip = False
                replaced = False
                for line in lines:
                    if line.strip() == BEGIN_MARKER:
                        skip = True
                        if not replaced:
                            new_lines.append(auth_block)
                            replaced = True
                        continue
                    if line.strip() == END_MARKER:
                        skip = False
                        continue
                    if not skip:
                        new_lines.append(line)
                content = '\n'.join(new_lines)
            else:
                # Injecter après la première ligne (ErrorDocument 404)
                lines = content.split('\n')
                insert_idx = 1  # Après la première ligne
                for i, line in enumerate(lines):
                    if line.startswith('ErrorDocument'):
                        insert_idx = i + 1
                        break
                lines.insert(insert_idx, '')
                lines.insert(insert_idx + 1, auth_block)
                content = '\n'.join(lines)

            with open(htaccess_path, 'w', encoding='utf-8') as f:
                f.write(content)

        self._json(200, {'ok': True, 'action': 'enabled', 'line': htpasswd_line})

    # ═══════════════════════════════════════════════════════
    #  PAGES
    # ═══════════════════════════════════════════════════════

    def _handle_pages_list(self):
        pages = scan_html_pages()
        self._json(200, {'ok': True, 'pages': pages})

    def _handle_page_create(self, body):
        filename = body.get('filename', '')
        if not filename or not filename.endswith('.html'):
            return self._json(400, {'error': 'Nom de fichier invalide (doit finir par .html)'})
        if is_protected_path(filename):
            return self._json(403, {'error': 'Dossier protégé'})
        filepath = safe_path(filename)
        if not filepath:
            return self._json(400, {'error': 'Chemin invalide'})
        if os.path.exists(filepath):
            return self._json(409, {'error': 'Le fichier existe déjà'})

        # Lire le template
        template_path = os.path.join(ROOT, 'snippets', 'page.html')
        if os.path.exists(template_path):
            with open(template_path, 'r', encoding='utf-8') as f:
                content = f.read()
        else:
            content = '<!DOCTYPE html>\n<html lang="fr">\n<head>\n  <meta charset="UTF-8">\n  <title>Nouvelle page</title>\n</head>\n<body>\n\n</body>\n</html>'

        # Créer le dossier parent si nécessaire
        parent_dir = os.path.dirname(filepath)
        if parent_dir and not os.path.exists(parent_dir):
            os.makedirs(parent_dir, exist_ok=True)

        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

        self._json(200, {'ok': True, 'path': filename})

    def _handle_page_delete(self, body):
        path_str = body.get('path', '')
        if path_str in PROTECTED_FILES:
            return self._json(403, {'error': 'Fichier protégé: ' + path_str})
        if is_protected_path(path_str):
            return self._json(403, {'error': 'Dossier protégé'})
        filepath = safe_path(path_str)
        if not filepath:
            return self._json(400, {'error': 'Chemin invalide'})
        if not os.path.exists(filepath):
            return self._json(404, {'error': 'Fichier introuvable'})
        os.remove(filepath)
        self._json(200, {'ok': True})

    def _handle_page_rename(self, body):
        old_path = body.get('oldPath', '')
        new_path = body.get('newPath', '')
        if is_protected_path(old_path) or is_protected_path(new_path):
            return self._json(403, {'error': 'Dossier protégé'})
        old_filepath = safe_path(old_path)
        new_filepath = safe_path(new_path)
        if not old_filepath or not new_filepath:
            return self._json(400, {'error': 'Chemin invalide'})
        if not old_filepath.endswith('.html') or not new_filepath.endswith('.html'):
            return self._json(400, {'error': 'Seuls les fichiers .html sont autorisés'})
        if not os.path.exists(old_filepath):
            return self._json(404, {'error': 'Fichier source introuvable'})
        if os.path.exists(new_filepath):
            return self._json(409, {'error': 'Le fichier cible existe deja'})

        # Créer le dossier parent si nécessaire
        parent_dir = os.path.dirname(new_filepath)
        if parent_dir and not os.path.exists(parent_dir):
            os.makedirs(parent_dir, exist_ok=True)

        shutil.move(old_filepath, new_filepath)

        # Nettoyer le dossier source s'il est vide
        old_parent_dir = os.path.dirname(old_filepath)
        if old_parent_dir != os.path.realpath(ROOT):
            try:
                if os.path.isdir(old_parent_dir) and not os.listdir(old_parent_dir):
                    os.rmdir(old_parent_dir)
            except OSError:
                pass

        self._json(200, {'ok': True, 'oldPath': old_path, 'newPath': new_path})

    def _handle_page_duplicate(self, body):
        source_path = body.get('sourcePath', '')
        new_filename = body.get('newFilename', '')
        if not source_path or not new_filename:
            return self._json(400, {'error': 'Paramètres manquants'})
        if not new_filename.endswith('.html'):
            return self._json(400, {'error': 'Le nom doit finir par .html'})
        if is_protected_path(new_filename):
            return self._json(403, {'error': 'Dossier protégé'})
        source_filepath = safe_path(source_path)
        new_filepath = safe_path(new_filename)
        if not source_filepath or not new_filepath:
            return self._json(400, {'error': 'Chemin invalide'})
        if not os.path.exists(source_filepath):
            return self._json(404, {'error': 'Fichier source introuvable'})
        if os.path.exists(new_filepath):
            return self._json(409, {'error': 'Le fichier cible existe déjà'})
        # Créer le dossier parent si nécessaire
        parent_dir = os.path.dirname(new_filepath)
        if parent_dir and not os.path.exists(parent_dir):
            os.makedirs(parent_dir, exist_ok=True)
        shutil.copy2(source_filepath, new_filepath)
        self._json(200, {'ok': True, 'path': new_filename})

    # ═══════════════════════════════════════════════════════
    #  ICÔNES
    # ═══════════════════════════════════════════════════════

    def _handle_icons_list(self):
        icons_dir = os.path.join(ROOT, 'assets', 'icons', 'outline')
        if not os.path.exists(icons_dir):
            return self._json(200, {'ok': True, 'icons': []})
        icons = sorted([f.replace('.svg', '') for f in os.listdir(icons_dir) if f.endswith('.svg')])
        self._json(200, {'ok': True, 'icons': icons})

    # ═══════════════════════════════════════════════════════
    #  MÉDIATHÈQUE (assets/images/)
    # ═══════════════════════════════════════════════════════

    ALLOWED_MEDIA_EXT = {'.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'}
    MAX_UPLOAD_SIZE = 5 * 1024 * 1024  # 5 Mo

    def _handle_media_list(self):
        media_dir = os.path.join(ROOT, 'assets', 'images')
        if not os.path.exists(media_dir):
            return self._json(200, {'ok': True, 'files': [], 'folders': []})
        files = []
        folders = []
        for dirpath, dirnames, filenames in os.walk(media_dir):
            # Collecter les sous-dossiers (relatifs à assets/images/)
            rel_dir = os.path.relpath(dirpath, media_dir).replace('\\', '/')
            if rel_dir == '.':
                rel_dir = ''
            for dname in sorted(dirnames):
                if dname.startswith('.'):
                    continue
                folder_rel = (rel_dir + '/' + dname) if rel_dir else dname
                folders.append(folder_rel)
            for fname in sorted(filenames):
                if fname.startswith('.'):
                    continue
                ext = os.path.splitext(fname)[1].lower()
                if ext not in self.ALLOWED_MEDIA_EXT:
                    continue
                full_path = os.path.join(dirpath, fname)
                rel_path = os.path.relpath(full_path, ROOT).replace('\\', '/')
                folder = os.path.relpath(dirpath, media_dir).replace('\\', '/')
                if folder == '.':
                    folder = ''
                stat = os.stat(full_path)
                files.append({
                    'name': fname,
                    'path': rel_path,
                    'folder': folder,
                    'size': stat.st_size,
                    'modified': stat.st_mtime
                })
        # Trier par date de modification décroissante
        files.sort(key=lambda f: f['modified'], reverse=True)
        self._json(200, {'ok': True, 'files': files, 'folders': sorted(set(folders))})

    def _handle_media_upload(self, body):
        filename = body.get('filename', '')
        data_b64 = body.get('data', '')
        folder = body.get('folder', '')
        if not filename or not data_b64:
            return self._json(400, {'error': 'Paramètres manquants (filename, data)'})
        # Valider l'extension
        ext = os.path.splitext(filename)[1].lower()
        if ext not in self.ALLOWED_MEDIA_EXT:
            return self._json(400, {'error': 'Extension non autorisée: ' + ext})
        # Sécurité : pas de traversal
        if '/' in filename or '\\' in filename or '..' in filename:
            return self._json(400, {'error': 'Nom de fichier invalide'})
        if '..' in folder:
            return self._json(400, {'error': 'Dossier invalide'})
        # Décoder le base64
        try:
            file_data = base64.b64decode(data_b64)
        except Exception:
            return self._json(400, {'error': 'Données base64 invalides'})
        if len(file_data) > self.MAX_UPLOAD_SIZE:
            return self._json(400, {'error': 'Fichier trop volumineux (max 5 Mo)'})
        # Écrire le fichier
        media_dir = os.path.join(ROOT, 'assets', 'images')
        if folder:
            media_dir = os.path.join(media_dir, folder)
        os.makedirs(media_dir, exist_ok=True)
        filepath = os.path.join(media_dir, filename)
        # Éviter l'écrasement : ajouter un suffixe si le fichier existe
        if os.path.exists(filepath):
            base, ext_part = os.path.splitext(filename)
            counter = 1
            while os.path.exists(filepath):
                filepath = os.path.join(media_dir, f'{base}-{counter}{ext_part}')
                counter += 1
            filename = os.path.basename(filepath)
        with open(filepath, 'wb') as f:
            f.write(file_data)
        rel_path = os.path.relpath(filepath, ROOT).replace('\\', '/')
        self._json(200, {'ok': True, 'path': rel_path, 'filename': filename})

    def _handle_media_delete(self, body):
        path_str = body.get('path', '')
        if not path_str or not path_str.startswith('assets/images/'):
            return self._json(400, {'error': 'Chemin invalide'})
        filepath = safe_path(path_str)
        if not filepath:
            return self._json(400, {'error': 'Chemin invalide'})
        if not os.path.exists(filepath):
            return self._json(404, {'error': 'Fichier introuvable'})
        os.remove(filepath)
        self._json(200, {'ok': True})

    def _handle_media_rename(self, body):
        """Renommer un fichier média."""
        old_path = body.get('path', '')
        new_name = body.get('newName', '')
        if not old_path or not old_path.startswith('assets/images/') or not new_name:
            return self._json(400, {'error': 'Paramètres invalides'})
        if '/' in new_name or '\\' in new_name or '..' in new_name:
            return self._json(400, {'error': 'Nom de fichier invalide'})
        # Vérifier l'extension
        ext = os.path.splitext(new_name)[1].lower()
        if ext not in self.ALLOWED_MEDIA_EXT:
            return self._json(400, {'error': 'Extension non autorisée: ' + ext})
        old_filepath = safe_path(old_path)
        if not old_filepath or not os.path.exists(old_filepath):
            return self._json(404, {'error': 'Fichier introuvable'})
        new_filepath = os.path.join(os.path.dirname(old_filepath), new_name)
        if os.path.exists(new_filepath):
            return self._json(400, {'error': 'Un fichier avec ce nom existe déjà'})
        os.rename(old_filepath, new_filepath)
        new_rel = os.path.relpath(new_filepath, ROOT).replace('\\', '/')
        self._json(200, {'ok': True, 'path': new_rel, 'name': new_name})

    def _handle_media_mkdir(self, body):
        """Créer un dossier dans assets/images/."""
        folder_name = body.get('name', '')
        parent = body.get('parent', '')
        if not folder_name:
            return self._json(400, {'error': 'Nom de dossier requis'})
        if '/' in folder_name or '\\' in folder_name or '..' in folder_name:
            return self._json(400, {'error': 'Nom de dossier invalide'})
        if '..' in parent:
            return self._json(400, {'error': 'Chemin parent invalide'})
        media_dir = os.path.join(ROOT, 'assets', 'images')
        if parent:
            media_dir = os.path.join(media_dir, parent)
        target = os.path.join(media_dir, folder_name)
        # Vérifier que le chemin reste dans ROOT
        resolved = os.path.realpath(target)
        if not resolved.startswith(os.path.realpath(ROOT)):
            return self._json(400, {'error': 'Chemin invalide'})
        if os.path.exists(target):
            return self._json(400, {'error': 'Ce dossier existe déjà'})
        os.makedirs(target, exist_ok=True)
        self._json(200, {'ok': True, 'folder': folder_name})

    def _handle_media_move(self, body):
        """Déplacer un fichier vers un autre dossier."""
        file_path = body.get('path', '')
        target_folder = body.get('folder', '')
        if not file_path or not file_path.startswith('assets/images/'):
            return self._json(400, {'error': 'Chemin invalide'})
        if '..' in target_folder:
            return self._json(400, {'error': 'Dossier cible invalide'})
        old_filepath = safe_path(file_path)
        if not old_filepath or not os.path.exists(old_filepath):
            return self._json(404, {'error': 'Fichier introuvable'})
        filename = os.path.basename(old_filepath)
        media_dir = os.path.join(ROOT, 'assets', 'images')
        if target_folder:
            dest_dir = os.path.join(media_dir, target_folder)
        else:
            dest_dir = media_dir
        if not os.path.exists(dest_dir):
            return self._json(400, {'error': 'Dossier cible introuvable'})
        new_filepath = os.path.join(dest_dir, filename)
        if os.path.exists(new_filepath):
            return self._json(400, {'error': 'Un fichier avec ce nom existe déjà dans ce dossier'})
        shutil.move(old_filepath, new_filepath)
        new_rel = os.path.relpath(new_filepath, ROOT).replace('\\', '/')
        self._json(200, {'ok': True, 'path': new_rel})

    # ═══════════════════════════════════════════════════════
    #  REGISTRE (data/pages.json)
    # ═══════════════════════════════════════════════════════

    def _handle_registry_read(self):
        filepath = os.path.join(ROOT, 'data', 'pages.json')
        if not os.path.exists(filepath):
            return self._json(200, {'ok': True, 'registry': None})
        with open(filepath, 'r', encoding='utf-8') as f:
            registry = json.load(f)
        self._json(200, {'ok': True, 'registry': registry})

    def _handle_registry_write(self, body):
        registry = body.get('registry')
        if registry is None:
            return self._json(400, {'error': 'Registry manquant'})
        data_dir = os.path.join(ROOT, 'data')
        if not os.path.exists(data_dir):
            os.makedirs(data_dir, exist_ok=True)
        filepath = os.path.join(data_dir, 'pages.json')
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(registry, f, indent=2, ensure_ascii=False)
        self._json(200, {'ok': True})

    # ═══════════════════════════════════════════════════════
    #  DÉPLOIEMENT
    # ═══════════════════════════════════════════════════════

    def _handle_deploy(self, body):
        target = body.get('target', '')
        if target not in ('prod', 'preprod'):
            return self._json(400, {'error': 'Cible invalide (prod ou preprod)'})
        script = os.path.join(ROOT, 'deploy.sh')
        if not os.path.exists(script):
            return self._json(404, {'error': 'deploy.sh introuvable'})
        try:
            result = subprocess.run(
                [script, target],
                capture_output=True, text=True, timeout=120, cwd=ROOT
            )
            self._json(200, {
                'ok': result.returncode == 0,
                'output': result.stdout + result.stderr,
                'exitCode': result.returncode
            })
        except subprocess.TimeoutExpired:
            self._json(504, {'error': 'Déploiement timeout (120s)'})
        except Exception as e:
            self._json(500, {'error': str(e)})

    def _handle_git_push(self, body):
        message = body.get('message', 'Update from Builder')
        if not isinstance(message, str):
            message = 'Update from Builder'
        # Sanitiser : garder uniquement alphanum, espaces, ponctuation basique, accents
        message = re.sub(r'[^\w\s.,!?\-éèêëàâäùûüôöîïçÉÈÊËÀÂÄÙÛÜÔÖÎÏÇ():/\'"]', '', message).strip()
        # Limiter la longueur
        if len(message) > 200:
            message = message[:200]
        if not message:
            message = 'Update from Builder'
        try:
            # git add -A
            r1 = subprocess.run(['git', 'add', '-A'], capture_output=True, text=True, cwd=ROOT)
            # git commit
            r2 = subprocess.run(
                ['git', 'commit', '-m', message],
                capture_output=True, text=True, cwd=ROOT
            )
            # git push
            r3 = subprocess.run(['git', 'push'], capture_output=True, text=True, timeout=60, cwd=ROOT)

            output = (r1.stdout + r1.stderr + '\n'
                      + r2.stdout + r2.stderr + '\n'
                      + r3.stdout + r3.stderr)
            exit_code = r3.returncode

            self._json(200, {
                'ok': exit_code == 0,
                'output': output.strip(),
                'exitCode': exit_code
            })
        except subprocess.TimeoutExpired:
            self._json(504, {'error': 'Git push timeout (60s)'})
        except Exception as e:
            self._json(500, {'error': str(e)})

    def _handle_deploy_config(self):
        filepath = os.path.join(ROOT, '.deploy.env')
        config = {'hasProd': False, 'hasPreprod': False, 'prodUrl': '', 'preprodUrl': ''}
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line.startswith('#') or '=' not in line:
                        continue
                    key, val = line.split('=', 1)
                    key = key.strip()
                    val = val.strip()
                    if key == 'PROD_HOST' and val:
                        config['hasProd'] = True
                    elif key == 'PROD_URL' and val:
                        config['prodUrl'] = val
                    elif key == 'PREPROD_HOST' and val:
                        config['hasPreprod'] = True
                    elif key == 'PREPROD_URL' and val:
                        config['preprodUrl'] = val
        self._json(200, {'ok': True, **config})

    # ═══════════════════════════════════════════════════════
    #  UTILITAIRES
    # ═══════════════════════════════════════════════════════

    MAX_BODY_SIZE = 10 * 1024 * 1024  # 10 Mo (uploads base64)

    def _read_body(self):
        length = int(self.headers.get('Content-Length', 0))
        if length == 0:
            return {}
        if length > self.MAX_BODY_SIZE:
            raise ValueError('Body trop volumineux')
        return json.loads(self.rfile.read(length))

    def _get_cors_origin(self):
        """Retourne l'origine autorisée ou None."""
        origin = self.headers.get('Origin', '')
        if origin in ALLOWED_ORIGINS:
            return origin
        return None

    def _json(self, code, data):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        origin = self._get_cors_origin()
        if origin:
            self.send_header('Access-Control-Allow-Origin', origin)
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(204)
        origin = self._get_cors_origin()
        if origin:
            self.send_header('Access-Control-Allow-Origin', origin)
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def log_message(self, format, *args):
        req = args[0] if args else ''
        if 'POST' in req:
            # Extraire le path pour un log lisible
            path = req.split(' ')[1] if ' ' in req else req
            if '/api/cfg-' in path:
                print(f'\033[32m[CFG]\033[0m {req}')
            elif '/api/page' in path or '/api/registry' in path:
                print(f'\033[34m[PAGE]\033[0m {req}')
            elif '/api/media' in path:
                print(f'\033[36m[MEDIA]\033[0m {req}')
            elif '/api/deploy' in path or '/api/git' in path:
                print(f'\033[33m[DEPLOY]\033[0m {req}')
            else:
                print(f'\033[32m[POST]\033[0m {req}')
        # Silencer les GET pour éviter le bruit


if __name__ == '__main__':
    server = HTTPServer(('localhost', PORT), BuilderHandler)
    print(f'\033[1m\033[34mSite System — Serveur local\033[0m')
    print(f'  Configurateur : http://localhost:{PORT}/configurateur/')
    print(f'  Ctrl+C pour arrêter\n')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nServeur arrêté.')
        server.server_close()
