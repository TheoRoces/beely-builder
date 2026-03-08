/* ==========================================================================
   BUILDER LIBRARY — Icônes, Médiathèque
   ========================================================================== */
(function () {
  'use strict';

  /* ══════════════════════════════════════
     ÉTAT & CACHE
     ══════════════════════════════════════ */

  var iconsList = null;
  var iconsType = 'outline';
  var svgCache = {};
  var initialized = {};

  /* ══════════════════════════════════════
     UTILITAIRES
     ══════════════════════════════════════ */

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function copyFallback(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    BuilderApp.showToast('Copié !', 'success');
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        BuilderApp.showToast('Copié !', 'success');
      }).catch(function () {
        copyFallback(text);
      });
    } else {
      copyFallback(text);
    }
  }

  function fetchSvg(name, type) {
    var key = type + '/' + name;
    if (svgCache[key]) return Promise.resolve(svgCache[key]);
    return fetch('/assets/icons/' + type + '/' + name + '.svg')
      .then(function (r) {
        if (!r.ok) throw new Error('Not found');
        return r.text();
      })
      .then(function (svg) {
        // Remplacer les fills hardcodés par currentColor pour respecter le thème
        svg = svg.replace(/fill="#[0-9a-fA-F]{3,8}"/g, 'fill="currentColor"');
        svgCache[key] = svg;
        return svg;
      })
      .catch(function () { return '<svg viewBox="0 0 24 24" width="24" height="24"></svg>'; });
  }

  /* ══════════════════════════════════════
     ICÔNES
     ══════════════════════════════════════ */

  async function renderIcons() {
    var contentEl = document.getElementById('libIconContent');
    if (!contentEl) return;

    if (!iconsList) {
      contentEl.innerHTML = '<div class="bld-lib__loading">Chargement des icônes...</div>';
      try {
        var resp = await BuilderAPI.iconsList();
        if (resp.ok && resp.icons) {
          iconsList = resp.icons;
        }
      } catch (e) {
        console.error('Erreur chargement icônes:', e);
        iconsList = [];
      }
    }

    if (!iconsList || iconsList.length === 0) {
      contentEl.innerHTML = '<div class="bld-lib__empty">Aucune icône trouvée. Vérifiez que le serveur est démarré (port 5555).</div>';
      return;
    }

    contentEl.innerHTML = '<p class="bld-lib__count">' + iconsList.length + ' icônes (' + iconsType + ')</p>'
      + '<div class="bld-lib__icon-grid" id="iconGrid"></div>';

    var gridEl = document.getElementById('iconGrid');
    var html = '';
    iconsList.forEach(function (name) {
      html += '<div class="bld-lib__icon-card" data-icon-name="' + name + '" title="' + name + '">'
        + '<div class="bld-lib__icon-preview" id="icon-' + iconsType + '-' + name + '"></div>'
        + '<span class="bld-lib__icon-name">' + name + '</span>'
        + '</div>';
    });
    gridEl.innerHTML = html;

    // Charger les SVG (lazy, par lots)
    var cards = gridEl.querySelectorAll('.bld-lib__icon-card');
    loadIconBatch(cards, 0, 50);

    // Clic → copier le data-icon
    cards.forEach(function (card) {
      card.addEventListener('click', function () {
        var iconName = card.getAttribute('data-icon-name');
        var snippet = '<span data-icon="' + iconName + '" data-icon-type="' + iconsType + '"></span>';
        copyToClipboard(snippet);
        card.classList.add('bld-lib__icon-card--copied');
        setTimeout(function () { card.classList.remove('bld-lib__icon-card--copied'); }, 800);
      });
    });

    // Toggle outline/solid + search
    if (!initialized['icon-controls']) {
      initialized['icon-controls'] = true;
      var toggleEl = document.getElementById('libIconToggle');
      if (toggleEl) {
        toggleEl.querySelectorAll('.bld-lib__toggle-btn').forEach(function (btn) {
          btn.addEventListener('click', function () {
            toggleEl.querySelectorAll('.bld-lib__toggle-btn').forEach(function (b) {
              b.classList.remove('bld-lib__toggle-btn--active');
            });
            btn.classList.add('bld-lib__toggle-btn--active');
            iconsType = btn.getAttribute('data-icon-type');
            // Force re-render with new type
            var gridEl = document.getElementById('iconGrid');
            if (gridEl) {
              var cards = gridEl.querySelectorAll('.bld-lib__icon-card');
              cards.forEach(function (card) {
                var previewEl = card.querySelector('.bld-lib__icon-preview');
                if (previewEl) previewEl.innerHTML = '';
              });
              loadIconBatch(cards, 0, 50);
            }
            // Update count
            var countEl = contentEl.querySelector('.bld-lib__count');
            if (countEl) countEl.textContent = iconsList.length + ' icônes (' + iconsType + ')';
          });
        });
      }

      var searchInput = document.getElementById('libIconSearch');
      if (searchInput) {
        searchInput.addEventListener('input', function () {
          filterIcons(searchInput.value.toLowerCase());
        });
      }
    }
  }

  function loadIconBatch(cards, start, batchSize) {
    var end = Math.min(start + batchSize, cards.length);
    var promises = [];
    for (var i = start; i < end; i++) {
      (function (card) {
        var name = card.getAttribute('data-icon-name');
        promises.push(fetchSvg(name, iconsType).then(function (svg) {
          var previewEl = card.querySelector('.bld-lib__icon-preview');
          if (previewEl) previewEl.innerHTML = svg;
        }));
      })(cards[i]);
    }
    if (end < cards.length) {
      Promise.all(promises).then(function () {
        requestAnimationFrame(function () {
          loadIconBatch(cards, end, batchSize);
        });
      });
    }
  }

  function filterIcons(query) {
    var gridEl = document.getElementById('iconGrid');
    if (!gridEl) return;
    gridEl.querySelectorAll('.bld-lib__icon-card').forEach(function (card) {
      var name = card.getAttribute('data-icon-name');
      card.style.display = (!query || name.indexOf(query) !== -1) ? '' : 'none';
    });
  }

  /* ══════════════════════════════════════
     MÉDIATHÈQUE
     ══════════════════════════════════════ */

  var mediaFiles = null;
  var mediaFolders = [];
  var mediaCurrentFolder = ''; // dossier courant ('' = racine)

  async function loadMediaData() {
    try {
      var resp = await BuilderAPI.mediaList();
      if (resp.ok) {
        mediaFiles = resp.files || [];
        mediaFolders = resp.folders || [];
      }
    } catch (e) {
      mediaFiles = [];
      mediaFolders = [];
    }
  }

  async function renderMedia() {
    var contentEl = document.getElementById('libMediaContent');
    if (!contentEl) return;

    // Charger les fichiers
    contentEl.innerHTML = '<div class="bld-lib__loading">Chargement...</div>';
    await loadMediaData();

    renderMediaGrid(contentEl);

    // Upload button + drag & drop + search
    if (!initialized['media-controls']) {
      initialized['media-controls'] = true;

      var uploadBtn = document.getElementById('btnMediaUpload');
      var fileInput = document.getElementById('mediaFileInput');
      if (uploadBtn && fileInput) {
        uploadBtn.addEventListener('click', function () { fileInput.click(); });
        fileInput.addEventListener('change', function () {
          if (fileInput.files.length > 0) {
            uploadMediaFiles(fileInput.files).then(function () {
              fileInput.value = '';
              refreshMediaGrid();
            });
          }
        });
      }

      // Drag & drop
      contentEl.addEventListener('dragover', function (e) {
        e.preventDefault();
        var dz = contentEl.querySelector('.bld-media__dropzone');
        if (dz) dz.classList.add('bld-media__dropzone--active');
      });
      contentEl.addEventListener('dragleave', function (e) {
        if (!contentEl.contains(e.relatedTarget)) {
          var dz = contentEl.querySelector('.bld-media__dropzone');
          if (dz) dz.classList.remove('bld-media__dropzone--active');
        }
      });
      contentEl.addEventListener('drop', function (e) {
        e.preventDefault();
        var dz = contentEl.querySelector('.bld-media__dropzone');
        if (dz) dz.classList.remove('bld-media__dropzone--active');
        if (e.dataTransfer.files.length > 0) {
          uploadMediaFiles(e.dataTransfer.files).then(function () {
            refreshMediaGrid();
          });
        }
      });

      // Search
      var searchInput = document.getElementById('libMediaSearch');
      if (searchInput) {
        searchInput.addEventListener('input', function () {
          filterMedia(searchInput.value.toLowerCase());
        });
      }

      // Bouton créer dossier
      var mkdirBtn = document.getElementById('btnMediaMkdir');
      if (mkdirBtn) {
        mkdirBtn.addEventListener('click', async function () {
          var name = await BuilderModal.prompt({
            title: 'Nouveau dossier',
            label: 'Nom du dossier',
            placeholder: 'photos',
            confirmText: 'Créer'
          });
          if (name && name.trim()) {
            try {
              await BuilderAPI.mediaMkdir(name.trim(), mediaCurrentFolder);
              BuilderApp.showToast('Dossier créé', 'success');
              refreshMediaGrid();
            } catch (err) {
              BuilderApp.showToast('Erreur : ' + err.message, 'error');
            }
          }
        });
      }

      // Modal média : fermer / enregistrer
      initMediaEditModal();
    }
  }

  async function refreshMediaGrid() {
    await loadMediaData();
    var contentEl = document.getElementById('libMediaContent');
    if (contentEl) renderMediaGrid(contentEl);
  }

  function getFilesInFolder(folder) {
    if (!mediaFiles) return [];
    return mediaFiles.filter(function (f) {
      return (f.folder || '') === folder;
    });
  }

  function getSubfolders(folder) {
    return mediaFolders.filter(function (f) {
      if (!folder) {
        return f.indexOf('/') === -1;
      }
      return f.indexOf(folder + '/') === 0 && f.substring(folder.length + 1).indexOf('/') === -1;
    });
  }

  function formatFileSize(bytes) {
    if (bytes > 1048576) return (bytes / 1048576).toFixed(1) + ' Mo';
    return Math.round(bytes / 1024) + ' Ko';
  }

  function getFileType(name) {
    var ext = name.split('.').pop().toLowerCase();
    var types = { jpg: 'JPEG', jpeg: 'JPEG', png: 'PNG', gif: 'GIF', svg: 'SVG', webp: 'WebP', avif: 'AVIF', ico: 'ICO' };
    return types[ext] || ext.toUpperCase();
  }

  function renderMediaGrid(container) {
    var files = getFilesInFolder(mediaCurrentFolder);
    var subfolders = getSubfolders(mediaCurrentFolder);

    var html = '';

    // Breadcrumb
    if (mediaCurrentFolder) {
      html += '<div class="bld-media__breadcrumb">';
      html += '<button class="bld-media__breadcrumb-item" data-media-nav="">Images</button>';
      var parts = mediaCurrentFolder.split('/');
      var accumulated = '';
      for (var i = 0; i < parts.length; i++) {
        accumulated += (i > 0 ? '/' : '') + parts[i];
        html += '<span class="bld-media__breadcrumb-sep">/</span>';
        if (i < parts.length - 1) {
          html += '<button class="bld-media__breadcrumb-item" data-media-nav="' + escapeHtml(accumulated) + '">' + escapeHtml(parts[i]) + '</button>';
        } else {
          html += '<span class="bld-media__breadcrumb-current">' + escapeHtml(parts[i]) + '</span>';
        }
      }
      html += '</div>';
    }

    if (files.length === 0 && subfolders.length === 0) {
      html += '<div class="bld-media__dropzone" id="mediaDropzone">'
        + '<p>Aucune image' + (mediaCurrentFolder ? ' dans ce dossier' : '') + '. Glissez des fichiers ici ou cliquez sur "Uploader".</p>'
        + '</div>';
      container.innerHTML = html;
      bindMediaNav(container);
      return;
    }

    html += '<div class="bld-media-grid">';

    // Sous-dossiers
    subfolders.forEach(function (folder) {
      var folderName = folder.split('/').pop();
      html += '<div class="bld-media-grid__folder" data-media-nav="' + escapeHtml(folder) + '" title="' + escapeHtml(folderName) + '">'
        + '<svg class="bld-media-grid__folder-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"/></svg>'
        + '<span class="bld-media-grid__folder-name">' + escapeHtml(folderName) + '</span>'
        + '</div>';
    });

    // Fichiers
    files.forEach(function (file) {
      var sizeStr = formatFileSize(file.size);
      var typeStr = getFileType(file.name);
      html += '<div class="bld-media-grid__item" data-media-name="' + escapeHtml(file.name) + '" data-media-path="' + escapeHtml(file.path) + '" data-media-size="' + file.size + '">'
        + '<img src="/' + escapeHtml(file.path) + '" alt="' + escapeHtml(file.name) + '" loading="lazy">'
        + '<span class="bld-media-grid__name">' + escapeHtml(file.name) + '</span>'
        + '<div class="bld-media-grid__actions">'
        + '<span style="font-size:10px;color:var(--color-text-light);">' + sizeStr + ' · ' + typeStr + '</span>'
        + '<div style="display:flex;gap:4px;">'
        + '<button class="bld-btn bld-btn--sm" data-copy-media-path="/' + escapeHtml(file.path) + '" title="Copier le chemin">Copier</button>'
        + '<button class="bld-btn bld-btn--sm bld-btn--danger" data-delete-media="' + escapeHtml(file.path) + '" title="Supprimer">&times;</button>'
        + '</div></div></div>';
    });

    html += '</div>';

    // Dropzone en bas si y a déjà des fichiers
    html += '<div class="bld-media__dropzone" id="mediaDropzone" style="margin-top:var(--space-4);">'
      + '<p>Glissez des images ici pour les ajouter' + (mediaCurrentFolder ? ' dans ce dossier' : '') + '</p>'
      + '</div>';

    container.innerHTML = html;

    // Bind navigation dossiers
    bindMediaNav(container);

    // Copier le chemin
    container.querySelectorAll('[data-copy-media-path]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        copyToClipboard(btn.getAttribute('data-copy-media-path'));
      });
    });

    // Clic sur un item → ouvrir le popup d'édition
    container.querySelectorAll('.bld-media-grid__item').forEach(function (item) {
      item.addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        openMediaEdit(item);
      });
    });

    // Supprimer
    container.querySelectorAll('[data-delete-media]').forEach(function (btn) {
      btn.addEventListener('click', async function (e) {
        e.stopPropagation();
        var path = btn.getAttribute('data-delete-media');
        var ok = await BuilderModal.confirm({
          title: 'Supprimer l\'image',
          message: 'Supprimer « ' + path.split('/').pop() + ' » ?',
          confirmText: 'Supprimer',
          variant: 'danger-fill'
        });
        if (ok) {
          try {
            await BuilderAPI.mediaDelete(path);
            BuilderApp.showToast('Image supprimée', 'success');
            refreshMediaGrid();
          } catch (err) {
            BuilderApp.showToast('Erreur : ' + err.message, 'error');
          }
        }
      });
    });
  }

  function bindMediaNav(container) {
    container.querySelectorAll('[data-media-nav]').forEach(function (el) {
      el.addEventListener('click', function () {
        mediaCurrentFolder = el.getAttribute('data-media-nav');
        renderMediaGrid(document.getElementById('libMediaContent'));
      });
    });
  }

  /* ---------- Popup édition média ---------- */

  var mediaEditFile = null;

  function openMediaEdit(itemEl) {
    var path = itemEl.getAttribute('data-media-path');
    var name = itemEl.getAttribute('data-media-name');
    var size = parseInt(itemEl.getAttribute('data-media-size') || '0', 10);

    mediaEditFile = { path: path, name: name, size: size };

    document.getElementById('mediaEditPreview').src = '/' + path;
    document.getElementById('mediaEditName').value = name;
    document.getElementById('mediaEditAlt').value = '';

    // Charger le alt text depuis le serveur
    BuilderAPI.mediaMeta(path).then(function (data) {
      document.getElementById('mediaEditAlt').value = data.alt || '';
    });

    // Charger l'usage (pages qui utilisent cette image)
    var usageEl = document.getElementById('mediaEditUsage');
    usageEl.innerHTML = '<span class="bld-text--muted">Chargement…</span>';
    BuilderAPI.mediaUsage(path).then(function (data) {
      if (data.count === 0) {
        usageEl.innerHTML = '<span class="bld-text--muted">Non utilisée</span>';
      } else {
        usageEl.innerHTML = '<strong>Utilisée dans ' + data.count + ' page' + (data.count > 1 ? 's' : '') + '</strong>'
          + '<ul class="bld-media-edit__usage-list">'
          + data.usage.map(function (p) { return '<li>' + escapeHtml(p) + '</li>'; }).join('')
          + '</ul>';
      }
    });

    var infoEl = document.getElementById('mediaEditInfo');
    infoEl.innerHTML = '<span>' + getFileType(name) + '</span>'
      + '<span>' + formatFileSize(size) + '</span>'
      + '<span>/' + escapeHtml(path) + '</span>';

    var folderSelect = document.getElementById('mediaEditFolder');
    var currentFolder = '';
    for (var i = 0; i < mediaFiles.length; i++) {
      if (mediaFiles[i].path === path) {
        currentFolder = mediaFiles[i].folder || '';
        break;
      }
    }
    folderSelect.innerHTML = '<option value="">/ (racine)</option>';
    mediaFolders.forEach(function (f) {
      folderSelect.innerHTML += '<option value="' + escapeHtml(f) + '"' + (f === currentFolder ? ' selected' : '') + '>/' + escapeHtml(f) + '</option>';
    });

    document.getElementById('bldMediaEditOverlay').classList.add('bld-modal-overlay--visible');
  }

  function initMediaEditModal() {
    var overlay = document.getElementById('bldMediaEditOverlay');
    if (!overlay) return;

    document.getElementById('mediaEditCancel').addEventListener('click', function () {
      overlay.classList.remove('bld-modal-overlay--visible');
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.classList.remove('bld-modal-overlay--visible');
    });

    document.getElementById('mediaEditSave').addEventListener('click', async function () {
      if (!mediaEditFile) return;

      var newName = document.getElementById('mediaEditName').value.trim();
      var newFolder = document.getElementById('mediaEditFolder').value;
      var newAlt = document.getElementById('mediaEditAlt').value.trim();

      if (!newName) {
        BuilderApp.showToast('Le nom ne peut pas être vide', 'error');
        return;
      }

      var changed = false;
      var totalUpdatedPages = 0;

      if (newName !== mediaEditFile.name) {
        try {
          var resp = await BuilderAPI.mediaRename(mediaEditFile.path, newName);
          mediaEditFile.path = resp.path;
          mediaEditFile.name = resp.name;
          totalUpdatedPages += (resp.updatedPages || 0);
          changed = true;
        } catch (err) {
          BuilderApp.showToast('Erreur renommage : ' + err.message, 'error');
          return;
        }
      }

      var currentFolder = '';
      for (var i = 0; i < mediaFiles.length; i++) {
        if (mediaFiles[i].path === mediaEditFile.path) {
          currentFolder = mediaFiles[i].folder || '';
          break;
        }
      }
      if (newFolder !== currentFolder) {
        try {
          var resp = await BuilderAPI.mediaMove(mediaEditFile.path, newFolder);
          if (resp.path) mediaEditFile.path = resp.path;
          totalUpdatedPages += (resp.updatedPages || 0);
          changed = true;
        } catch (err) {
          BuilderApp.showToast('Erreur déplacement : ' + err.message, 'error');
          return;
        }
      }

      // Sauvegarder le alt text
      try {
        await BuilderAPI.mediaMetaSave(mediaEditFile.path, newAlt);
      } catch (err) {
        BuilderApp.showToast('Erreur sauvegarde alt : ' + err.message, 'error');
      }

      overlay.classList.remove('bld-modal-overlay--visible');
      if (changed) {
        var msg = 'Fichier mis à jour';
        if (totalUpdatedPages > 0) {
          msg += ' — ' + totalUpdatedPages + ' page' + (totalUpdatedPages > 1 ? 's' : '') + ' mise' + (totalUpdatedPages > 1 ? 's' : '') + ' à jour';
        }
        BuilderApp.showToast(msg, 'success');
        refreshMediaGrid();
      } else {
        BuilderApp.showToast('Alt text enregistré', 'success');
      }
    });
  }

  async function uploadMediaFiles(fileList) {
    for (var i = 0; i < fileList.length; i++) {
      var file = fileList[i];
      if (!file.type.startsWith('image/')) {
        BuilderApp.showToast('Fichier ignoré (pas une image) : ' + file.name, 'error');
        continue;
      }
      try {
        var base64 = await readFileAsBase64(file);
        await BuilderAPI.mediaUpload(file.name, base64, mediaCurrentFolder);
        BuilderApp.showToast('Uploadé : ' + file.name, 'success');
      } catch (e) {
        BuilderApp.showToast('Erreur upload ' + file.name + ' : ' + e.message, 'error');
      }
    }
  }

  function readFileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var result = reader.result;
        var idx = result.indexOf(',');
        resolve(idx !== -1 ? result.substring(idx + 1) : result);
      };
      reader.onerror = function () { reject(new Error('Erreur lecture fichier')); };
      reader.readAsDataURL(file);
    });
  }

  function filterMedia(query) {
    var contentEl = document.getElementById('libMediaContent');
    if (!contentEl) return;
    contentEl.querySelectorAll('.bld-media-grid__item, .bld-media-grid__folder').forEach(function (item) {
      var name = (item.getAttribute('data-media-name') || item.querySelector('.bld-media-grid__folder-name')?.textContent || '');
      item.style.display = (!query || name.toLowerCase().indexOf(query) !== -1) ? '' : 'none';
    });
  }

  /* ══════════════════════════════════════
     PUBLIC API
     ══════════════════════════════════════ */

  window.BuilderLibrary = {
    refresh: function (panelId) {
      switch (panelId) {
        case 'lib-icons': renderIcons(); break;
        case 'lib-media': renderMedia(); break;
      }
    }
  };

})();
