/* ==========================================================================
   BUILDER API — Client HTTP pour le serveur Python
   ========================================================================== */
(function () {
  'use strict';

  var BASE = window.location.origin;

  function post(endpoint, body) {
    return fetch(BASE + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (resp) {
      return resp.json().then(function (data) {
        if (!resp.ok) throw new Error(data.error || 'Erreur ' + resp.status);
        return data;
      });
    });
  }

  window.BuilderAPI = {
    // ── Configurateur ──
    cfgRead: function (file) { return post('/api/cfg-read', { file: file }); },
    cfgSave: function (file, content) { return post('/api/cfg-save', { file: file, content: content }); },

    // ── Pages ──
    pagesList: function () { return post('/api/pages-list'); },
    pageCreate: function (filename) { return post('/api/page-create', { filename: filename }); },
    pageDelete: function (path) { return post('/api/page-delete', { path: path }); },
    pageRename: function (oldPath, newPath) { return post('/api/page-rename', { oldPath: oldPath, newPath: newPath }); },
    pageDuplicate: function (sourcePath, newFilename) { return post('/api/page-duplicate', { sourcePath: sourcePath, newFilename: newFilename }); },
    pageMkdir: function (name) { return post('/api/page-mkdir', { name: name }); },
    pageRmdir: function (path) { return post('/api/page-rmdir', { path: path }); },
    pageMoveFolder: function (oldPath, newPath) { return post('/api/page-move-folder', { oldPath: oldPath, newPath: newPath }); },

    // ── Icônes ──
    iconsList: function () { return post('/api/icons-list'); },

    // ── Médiathèque ──
    mediaList: function () { return post('/api/media-list'); },
    mediaUpload: function (filename, base64data, folder) { return post('/api/media-upload', { filename: filename, data: base64data, folder: folder || '' }); },
    mediaDelete: function (path) { return post('/api/media-delete', { path: path }); },
    mediaRename: function (path, newName) { return post('/api/media-rename', { path: path, newName: newName }); },
    mediaMkdir: function (name, parent) { return post('/api/media-mkdir', { name: name, parent: parent || '' }); },
    mediaMove: function (path, folder) { return post('/api/media-move', { path: path, folder: folder || '' }); },
    mediaUsage: function (path) { return post('/api/media-usage', { path: path }); },
    mediaMeta: function (path) { return post('/api/media-meta', { path: path }); },
    mediaMetaSave: function (path, alt) { return post('/api/media-meta-save', { path: path, alt: alt }); },

    // ── Registre ──
    registryRead: function () { return post('/api/registry-read'); },
    registryWrite: function (registry) { return post('/api/registry-write', { registry: registry }); },

    // ── Déploiement ──
    deploy: function (target) { return post('/api/deploy', { target: target }); },
    gitPush: function (message) { return post('/api/git-push', { message: message }); },
    deployConfig: function () { return post('/api/deploy-config'); }
  };
})();
