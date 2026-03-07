/* ==========================================================================
   BUILDER PAGES — Tree view par dossiers (V2), CRUD, drag & drop, métadonnées
   ========================================================================== */
(function () {
  'use strict';

  var treeEl = document.getElementById('pageTree');
  var metaPanel = document.getElementById('pageMetaPanel');
  var selectedPage = null;
  var selectedFolder = null;

  /* ══════════════════════════════════════
     HELPERS
     ══════════════════════════════════════ */

  // Debounce utilitaire
  var _metaSaveTimer = null;
  function debouncedSave(delay) {
    if (_metaSaveTimer) clearTimeout(_metaSaveTimer);
    _metaSaveTimer = setTimeout(function () { saveAndRefresh(); }, delay || 400);
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** Convertit un nom d'affichage en slug (sans accents, espaces, majuscules, caractères spéciaux) */
  function slugify(str) {
    return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().trim()
      .replace(/[^a-z0-9\-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /** Extrait le dossier d'un chemin de page. Ex: 'blog/article.html' → 'blog', 'index.html' → '' */
  function getFolderFromPath(pagePath) {
    var slash = pagePath.lastIndexOf('/');
    return slash === -1 ? '' : pagePath.substring(0, slash);
  }

  /** Groupe les pages par dossier et collecte tous les dossiers */
  function buildFolderTree(reg) {
    var groups = {}; // { '': [pages racine], 'blog': [pages blog/], ... }
    var allPages = Object.keys(reg.pages).map(function (path) {
      return Object.assign({ path: path }, reg.pages[path]);
    });

    allPages.forEach(function (p) {
      var folder = getFolderFromPath(p.path);
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push(p);
    });

    // Trier chaque groupe par order
    Object.keys(groups).forEach(function (f) {
      groups[f].sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    });

    // Collecter les dossiers (reg.folders + découverte depuis pages)
    var folderSet = {};
    Object.keys(reg.folders || {}).forEach(function (f) { folderSet[f] = true; });
    Object.keys(groups).forEach(function (f) { if (f) folderSet[f] = true; });

    return { groups: groups, folders: folderSet };
  }

  /* ══════════════════════════════════════
     TREE VIEW
     ══════════════════════════════════════ */

  var INDENT_STEP = 20;
  var BASE_INDENT = 12;
  var CHEVRON_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 4 10 8 6 12"/></svg>';

  /** Raccourcit un titre de page en enlevant les suffixes répétitifs */
  function shortenTitle(title) {
    if (!title) return '';
    return title.split(/\s*[—|–]\s*/)[0].trim();
  }

  function renderTree() {
    var reg = BuilderApp.state.registry;
    if (!reg || !reg.pages) {
      treeEl.innerHTML = '<div class="bld-recent__empty">Chargement...</div>';
      return;
    }

    var tree = buildFolderTree(reg);
    var homepage = reg.homepage || 'index.html';
    var html = '';

    // Tri de la racine : homepage d'abord, puis par order
    var rootPages = (tree.groups[''] || []).slice();
    rootPages.sort(function (a, b) {
      if (a.path === homepage) return -1;
      if (b.path === homepage) return 1;
      return (a.order || 0) - (b.order || 0);
    });

    // Rendu des pages racine
    rootPages.forEach(function (page) {
      html += renderPageItem(page, reg, 0);
    });

    // Dossiers de niveau 0 triés par order
    var rootFolders = Object.keys(tree.folders).filter(function (f) {
      return f.indexOf('/') === -1; // Seulement les dossiers de premier niveau
    });
    rootFolders.sort(function (a, b) {
      var oa = (reg.folders[a] && reg.folders[a].order) || 0;
      var ob = (reg.folders[b] && reg.folders[b].order) || 0;
      return oa - ob;
    });

    rootFolders.forEach(function (folder) {
      html += renderFolderItem(folder, reg, tree, 0);
    });

    treeEl.innerHTML = html || '<div class="bld-recent__empty">Aucune page.</div>';
    bindTreeEvents();
  }

  /** Rendu d'un noeud de page */
  function renderPageItem(page, reg, level) {
    var isHome = reg.homepage === page.path;
    var isDraft = page.status === 'draft';
    var isActive = selectedPage === page.path;
    var isTemplate = page.isTemplate || false;
    var isLocked = isTemplate || isHome;

    var cls = 'bld-tree__item';
    if (isActive) cls += ' bld-tree__item--active';
    if (isDraft) cls += ' bld-tree__item--draft';
    if (isLocked) cls += ' bld-tree__item--readonly';

    var indent = BASE_INDENT + level * INDENT_STEP;

    // Indentation lines
    var guidesHtml = '';
    if (level > 0) {
      guidesHtml = '<div class="bld-tree__guides">';
      for (var g = 1; g <= level; g++) {
        guidesHtml += '<div class="bld-tree__guide" style="left: ' + (BASE_INDENT + (g - 1) * INDENT_STEP + 8) + 'px"></div>';
      }
      guidesHtml += '</div>';
    }

    // Pas de chevron sur les pages (les dossiers ont le chevron)
    var expandHtml = '<span style="width: 16px; flex-shrink: 0;"></span>';

    // Icône de page
    var icon;
    if (isHome) {
      icon = '<svg class="bld-tree__icon bld-tree__icon--home" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';
    } else if (isTemplate) {
      icon = '<svg class="bld-tree__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';
    } else {
      icon = '<svg class="bld-tree__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
    }

    var badge = '';
    if (isDraft) badge = '<span class="bld-tree__badge bld-tree__badge--draft">Brouillon</span>';
    else if (isTemplate) badge = '<span class="bld-tree__badge bld-tree__badge--template">Template</span>';

    var displayTitle = shortenTitle(page.title) || page.path.replace(/\.html$/, '');

    return '<div class="' + cls + '" data-path="' + escapeAttr(page.path) + '" data-level="' + level + '"'
      + ' data-type="page"'
      + (isLocked ? '' : ' draggable="true"')
      + ' style="padding-left: ' + indent + 'px; --drop-indent: ' + indent + 'px;">'
      + guidesHtml
      + expandHtml
      + icon
      + '<span class="bld-tree__name">' + escapeHtml(displayTitle) + '</span>'
      + badge
      + '</div>';
  }

  /** Rendu d'un noeud de dossier + ses enfants */
  function renderFolderItem(folderPath, reg, tree, level) {
    var folderData = (reg.folders && reg.folders[folderPath]) || {};
    var isCollapsed = folderData.collapsed || false;
    var indent = BASE_INDENT + level * INDENT_STEP;
    var folderName = folderPath.split('/').pop();

    // Indentation lines
    var guidesHtml = '';
    if (level > 0) {
      guidesHtml = '<div class="bld-tree__guides">';
      for (var g = 1; g <= level; g++) {
        guidesHtml += '<div class="bld-tree__guide" style="left: ' + (BASE_INDENT + (g - 1) * INDENT_STEP + 8) + 'px"></div>';
      }
      guidesHtml += '</div>';
    }

    // Chevron expand/collapse
    var rotation = isCollapsed ? '0' : '90';
    var expandHtml = '<button class="bld-tree__expand" data-action="toggle-folder" style="transform: rotate(' + rotation + 'deg)">' + CHEVRON_SVG + '</button>';

    // Icône dossier
    var icon = '<svg class="bld-tree__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';

    // Nom d'affichage : utiliser name du registre ou le basename du chemin
    var displayName = (folderData && folderData.name) || folderName;

    var folderCls = 'bld-tree__item bld-tree__item--folder';
    if (selectedFolder === folderPath) folderCls += ' bld-tree__item--active';

    var html = '<div class="' + folderCls + '" data-folder="' + escapeAttr(folderPath) + '" data-level="' + level + '"'
      + ' data-type="folder"'
      + ' draggable="true"'
      + ' style="padding-left: ' + indent + 'px; --drop-indent: ' + indent + 'px;">'
      + guidesHtml
      + expandHtml
      + icon
      + '<span class="bld-tree__name">' + escapeHtml(displayName) + '</span>'
      + '</div>';

    // Contenu du dossier (si non collapsed)
    if (!isCollapsed) {
      // Pages dans ce dossier
      var folderPages = (tree.groups[folderPath] || []).slice();
      folderPages.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      folderPages.forEach(function (page) {
        html += renderPageItem(page, reg, level + 1);
      });

      // Sous-dossiers
      var subFolders = Object.keys(tree.folders).filter(function (f) {
        if (f === folderPath) return false;
        // Doit commencer par folderPath/ et ne pas avoir de / supplémentaire
        if (f.indexOf(folderPath + '/') !== 0) return false;
        var remainder = f.substring(folderPath.length + 1);
        return remainder.indexOf('/') === -1;
      });
      subFolders.sort(function (a, b) {
        var oa = (reg.folders[a] && reg.folders[a].order) || 0;
        var ob = (reg.folders[b] && reg.folders[b].order) || 0;
        return oa - ob;
      });
      subFolders.forEach(function (sub) {
        html += renderFolderItem(sub, reg, tree, level + 1);
      });
    }

    return html;
  }

  /* ══════════════════════════════════════
     TREE EVENTS (click, drag & drop)
     ══════════════════════════════════════ */

  function bindTreeEvents() {
    var items = treeEl.querySelectorAll('.bld-tree__item');

    items.forEach(function (item) {
      var isFolder = item.getAttribute('data-type') === 'folder';
      var path = isFolder ? item.getAttribute('data-folder') : item.getAttribute('data-path');
      var isReadOnly = item.classList.contains('bld-tree__item--readonly');

      if (isFolder) {
        // Click sur dossier → sélectionner et afficher panneau
        item.addEventListener('click', function (e) {
          if (e.target.closest('[data-action]')) return;
          selectFolder(path);
        });

        // Bouton expand/collapse (chevron)
        var expandBtn = item.querySelector('[data-action="toggle-folder"]');
        if (expandBtn) {
          expandBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            toggleFolder(path);
          });
        }

        // Dossier = draggable
        item.addEventListener('dragstart', function (e) {
          e.dataTransfer.setData('text/plain', 'folder:' + path);
          e.dataTransfer.effectAllowed = 'move';
          item.classList.add('bld-tree__item--dragging');
          // Empêcher le toggle au dragstart
          e.stopPropagation();
        });

        item.addEventListener('dragend', function () {
          item.classList.remove('bld-tree__item--dragging');
          clearDropIndicators();
        });

        // Dossier = droppable (zone 100% = déposer dedans)
        item.addEventListener('dragover', function (e) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          clearDropIndicators();
          item.classList.add('bld-tree__item--drop-inside');
        });

        item.addEventListener('dragleave', function (e) {
          if (!item.contains(e.relatedTarget)) {
            item.classList.remove('bld-tree__item--drop-inside');
          }
        });

        item.addEventListener('drop', function (e) {
          e.preventDefault();
          clearDropIndicators();
          var data = e.dataTransfer.getData('text/plain');
          if (!data) return;

          // Distinguer page vs dossier
          if (data.indexOf('folder:') === 0) {
            var draggedFolder = data.substring(7);
            moveFolderToFolder(draggedFolder, path);
          } else {
            movePageToFolder(data, path);
          }
        });

      } else {
        // Click → sélectionner
        item.addEventListener('click', function (e) {
          if (e.target.closest('[data-action]')) return;
          selectPage(path);
        });

        // Drag & drop (seulement pour pages non readOnly)
        if (!isReadOnly) {
          item.addEventListener('dragstart', function (e) {
            e.dataTransfer.setData('text/plain', path);
            e.dataTransfer.effectAllowed = 'move';
            item.classList.add('bld-tree__item--dragging');
          });

          item.addEventListener('dragend', function () {
            item.classList.remove('bld-tree__item--dragging');
            clearDropIndicators();
          });
        }

        // Drop targets (toutes les pages non readOnly)
        item.addEventListener('dragover', function (e) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';

          var rect = item.getBoundingClientRect();
          var y = e.clientY - rect.top;
          var h = rect.height;

          clearDropIndicators();

          // Zone haute (50%) = insérer avant
          // Zone basse (50%) = insérer après
          if (y < h * 0.5) {
            item.classList.add('bld-tree__item--drop-before');
          } else {
            item.classList.add('bld-tree__item--drop-after');
          }
        });

        item.addEventListener('dragleave', function (e) {
          if (!item.contains(e.relatedTarget)) {
            item.classList.remove('bld-tree__item--drop-before', 'bld-tree__item--drop-after');
          }
        });

        item.addEventListener('drop', function (e) {
          e.preventDefault();
          clearDropIndicators();

          var data = e.dataTransfer.getData('text/plain');
          if (!data) return;

          var rect = item.getBoundingClientRect();
          var y = e.clientY - rect.top;
          var h = rect.height;
          var position = y < h * 0.5 ? 'before' : 'after';

          // Distinguer page vs dossier
          if (data.indexOf('folder:') === 0) {
            var draggedFolder = data.substring(7);
            // Déplacer le dossier dans le même parent que la page cible + réordonner
            var targetParent = getFolderFromPath(path);
            var draggedParent = getFolderFromPath(draggedFolder);
            if (draggedParent !== targetParent) {
              // Déplacer le dossier dans le parent de la page
              var basename = draggedFolder.split('/').pop();
              var newFolderPath = targetParent ? targetParent + '/' + basename : basename;
              if (newFolderPath !== draggedFolder) {
                moveFolderToFolder(draggedFolder, targetParent || '');
              }
            }
          } else {
            if (data === path) return;
            movePage(data, path, position);
          }
        });
      }
    });
  }

  function toggleFolder(folderPath) {
    var reg = BuilderApp.state.registry;
    if (!reg.folders) reg.folders = {};
    if (!reg.folders[folderPath]) reg.folders[folderPath] = { order: 0, collapsed: false };
    reg.folders[folderPath].collapsed = !reg.folders[folderPath].collapsed;
    BuilderApp.saveRegistry();
    renderTree();
  }

  function clearDropIndicators() {
    treeEl.querySelectorAll('.bld-tree__item--drop-before, .bld-tree__item--drop-after, .bld-tree__item--drop-inside').forEach(function (el) {
      el.classList.remove('bld-tree__item--drop-before', 'bld-tree__item--drop-after', 'bld-tree__item--drop-inside');
    });
  }

  /* ══════════════════════════════════════
     FOLDER META PANEL
     ══════════════════════════════════════ */

  function renderFolderMetaPanel(folderPath) {
    var reg = BuilderApp.state.registry;
    if (!reg.folders || !reg.folders[folderPath]) {
      metaPanel.innerHTML = '<div class="bld-meta__empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg><p>Sélectionnez un dossier.</p></div>';
      return;
    }

    var folderData = reg.folders[folderPath];
    var basename = folderPath.split('/').pop();
    var displayName = folderData.name || basename;
    var parentPath = getFolderFromPath(folderPath);

    // Compter les pages et sous-dossiers
    var pageCount = Object.keys(reg.pages).filter(function (p) {
      return getFolderFromPath(p) === folderPath;
    }).length;
    var subFolderCount = Object.keys(reg.folders).filter(function (f) {
      if (f === folderPath) return false;
      if (f.indexOf(folderPath + '/') !== 0) return false;
      var remainder = f.substring(folderPath.length + 1);
      return remainder.indexOf('/') === -1;
    }).length;

    var svgSubfolder = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>';
    var svgDelete = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

    var isEmpty = pageCount === 0 && subFolderCount === 0;
    var contenuText = [];
    if (pageCount > 0) contenuText.push(pageCount + ' page' + (pageCount > 1 ? 's' : ''));
    if (subFolderCount > 0) contenuText.push(subFolderCount + ' sous-dossier' + (subFolderCount > 1 ? 's' : ''));

    metaPanel.innerHTML = ''
      + '<div class="bld-meta">'

      // ── Toolbar ──
      + '<div class="bld-meta__toolbar">'
      + '<button class="bld-meta__tool" data-action="create-subfolder" title="Nouveau sous-dossier">' + svgSubfolder + '</button>'
      + '<button class="bld-meta__tool bld-meta__tool--danger" data-action="delete-folder" title="Supprimer le dossier"' + (isEmpty ? '' : ' disabled') + '>' + svgDelete + '</button>'
      + '</div>'

      + '<h2 class="bld-meta__title">' + escapeHtml(displayName) + '</h2>'

      + '<div class="bld-field">'
      + '<label class="bld-field__label">Nom d\'affichage</label>'
      + '<input class="bld-field__input" type="text" data-folder-meta="name" value="' + escapeAttr(displayName) + '">'
      + '</div>'

      + '<div class="bld-field">'
      + '<label class="bld-field__label">Slug (chemin technique)</label>'
      + '<input class="bld-field__input" type="text" data-folder-meta="slug" value="' + escapeAttr(basename) + '">'
      + '<div class="bld-field__error" id="folderSlugError"></div>'
      + '<div class="bld-field__help">Chemin complet : ' + escapeHtml(folderPath) + '/</div>'
      + '</div>'

      + (parentPath ? '<div class="bld-field">'
      + '<label class="bld-field__label">Dossier parent</label>'
      + '<input class="bld-field__input" type="text" value="' + escapeAttr(parentPath) + '" readonly style="opacity: 0.6;">'
      + '</div>' : '')

      + '<div class="bld-field__sep"></div>'

      + '<div class="bld-field">'
      + '<label class="bld-field__label">Contenu</label>'
      + '<p style="font-size: var(--text-sm); color: var(--color-text-light);">'
      + (contenuText.length > 0 ? contenuText.join(', ') : 'Dossier vide')
      + '</p>'
      + '</div>'

      + '</div>';

    // ── Bind events ──

    // Nom d'affichage : sauvegarde au blur ou Enter
    var nameInput = metaPanel.querySelector('[data-folder-meta="name"]');
    nameInput.addEventListener('blur', function () {
      var newName = nameInput.value.trim();
      if (!newName || newName === displayName) return;
      reg.folders[folderPath].name = newName;
      saveAndRefresh();
      renderFolderMetaPanel(folderPath);
      BuilderApp.showToast('Dossier renommé en « ' + newName + ' »', 'success');
    });
    nameInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); nameInput.blur(); }
    });

    // Slug : validation temps réel + sauvegarde au blur/Enter
    var slugInput = metaPanel.querySelector('[data-folder-meta="slug"]');
    var slugError = document.getElementById('folderSlugError');

    slugInput.addEventListener('input', function () {
      var val = slugify(slugInput.value);
      if (!val) {
        slugError.textContent = 'Le slug ne peut pas être vide';
        slugInput.classList.add('bld-field__input--error');
        return;
      }
      var testPath = parentPath ? parentPath + '/' + val : val;
      if (testPath !== folderPath && reg.folders[testPath]) {
        slugError.textContent = 'Le slug « ' + val + ' » est déjà utilisé';
        slugInput.classList.add('bld-field__input--error');
        return;
      }
      slugError.textContent = '';
      slugInput.classList.remove('bld-field__input--error');
    });

    slugInput.addEventListener('blur', function () {
      var newSlug = slugify(slugInput.value);
      if (!newSlug || newSlug === basename) {
        slugInput.value = basename;
        slugError.textContent = '';
        slugInput.classList.remove('bld-field__input--error');
        return;
      }
      var newPath = parentPath ? parentPath + '/' + newSlug : newSlug;
      if (reg.folders[newPath]) {
        slugError.textContent = 'Le slug « ' + newSlug + ' » est déjà utilisé';
        slugInput.classList.add('bld-field__input--error');
        return;
      }
      // Appliquer le changement de slug
      var savedName = reg.folders[folderPath].name || displayName;
      BuilderAPI.pageMoveFolder(folderPath, newPath).then(function () {
        updateRegistryAfterFolderMove(reg, folderPath, newPath);
        if (reg.folders[newPath]) reg.folders[newPath].name = savedName;
        selectedFolder = newPath;
        saveAndRefresh();
        renderFolderMetaPanel(newPath);
        BuilderApp.showToast('Slug modifié : ' + newSlug, 'success');
      }).catch(function (e) {
        BuilderApp.showToast('Erreur : ' + e.message, 'error');
        slugInput.value = basename;
      });
    });

    slugInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); slugInput.blur(); }
    });

    // Nouveau sous-dossier
    var subfolderBtn = metaPanel.querySelector('[data-action="create-subfolder"]');
    if (subfolderBtn) {
      subfolderBtn.addEventListener('click', function () {
        createSubFolder(folderPath);
      });
    }

    // Supprimer
    var deleteBtn = metaPanel.querySelector('[data-action="delete-folder"]');
    if (deleteBtn && !deleteBtn.disabled) {
      deleteBtn.addEventListener('click', function () {
        deleteFolder(folderPath);
      });
    }
  }

  async function deleteFolder(folderPath) {
    var reg = BuilderApp.state.registry;
    // Vérifier qu'aucune page n'est dans ce dossier
    var hasPages = Object.keys(reg.pages).some(function (p) {
      return getFolderFromPath(p) === folderPath;
    });
    if (hasPages) {
      BuilderApp.showToast('Le dossier contient des pages, videz-le d\'abord', 'error');
      return;
    }

    // Vérifier qu'il n'y a pas de sous-dossiers
    var hasSubFolders = Object.keys(reg.folders || {}).some(function (f) {
      return f !== folderPath && f.indexOf(folderPath + '/') === 0;
    });
    if (hasSubFolders) {
      BuilderApp.showToast('Le dossier contient des sous-dossiers', 'error');
      return;
    }

    var ok = await BuilderModal.confirm({
      title: 'Supprimer le dossier',
      message: 'Supprimer le dossier « ' + folderPath + ' » ? (doit être vide)',
      confirmText: 'Supprimer',
      variant: 'danger-fill'
    });
    if (!ok) return;

    try {
      await BuilderAPI.pageRmdir(folderPath);
      delete reg.folders[folderPath];
      selectedFolder = null;
      saveAndRefresh();
      metaPanel.innerHTML = '<div class="bld-meta__empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><p>Sélectionnez une page ou un dossier.</p></div>';
      BuilderApp.showToast('Dossier supprimé', 'success');
    } catch (e) {
      BuilderApp.showToast('Erreur : ' + e.message, 'error');
    }
  }

  /* ══════════════════════════════════════
     DOSSIERS — Déplacement, renommage, sous-dossier
     ══════════════════════════════════════ */

  /** Met à jour toutes les clés du registre après un déplacement/renommage de dossier */
  function updateRegistryAfterFolderMove(reg, oldPath, newPath) {
    var prefix = oldPath + '/';
    var newPrefix = newPath + '/';

    // 1. Renommer les pages : blog/article.html → services/blog/article.html
    Object.keys(reg.pages).forEach(function (key) {
      if (key.indexOf(prefix) === 0) {
        var newKey = newPrefix + key.substring(prefix.length);
        reg.pages[newKey] = reg.pages[key];
        reg.pages[newKey].slug = newKey.replace(/\.html$/, '');
        reg.pages[newKey].updatedAt = new Date().toISOString();
        delete reg.pages[key];
      }
    });

    // 2. Renommer le dossier lui-même + ses sous-dossiers
    Object.keys(reg.folders).forEach(function (key) {
      if (key === oldPath || key.indexOf(prefix) === 0) {
        var newKey = key === oldPath ? newPath : newPrefix + key.substring(prefix.length);
        reg.folders[newKey] = reg.folders[key];
        delete reg.folders[key];
      }
    });

    // 3. S'assurer que le dossier parent existe dans le registre
    var parentSlash = newPath.lastIndexOf('/');
    if (parentSlash !== -1) {
      var parentFolder = newPath.substring(0, parentSlash);
      if (!reg.folders[parentFolder]) {
        reg.folders[parentFolder] = { order: Object.keys(reg.folders).length, collapsed: false };
      }
    }

    // 4. Mettre à jour selectedPage si elle était dans le dossier déplacé
    if (selectedPage && selectedPage.indexOf(prefix) === 0) {
      selectedPage = newPrefix + selectedPage.substring(prefix.length);
    }
  }

  /** Déplace un dossier dans un autre dossier (ou à la racine si targetFolder est vide) */
  async function moveFolderToFolder(draggedFolder, targetFolder) {
    var reg = BuilderApp.state.registry;
    if (!reg || !reg.folders) return;

    // Calculer le nouveau chemin
    var basename = draggedFolder.split('/').pop();
    var newPath;
    if (!targetFolder) {
      newPath = basename;
    } else {
      newPath = targetFolder + '/' + basename;
    }

    if (newPath === draggedFolder) return;

    // Empêcher de déplacer dans soi-même ou dans un enfant
    if (newPath.indexOf(draggedFolder + '/') === 0) {
      BuilderApp.showToast('Impossible de déplacer un dossier dans lui-même', 'error');
      return;
    }

    // Vérifier que le dossier cible n'existe pas déjà
    if (reg.folders[newPath]) {
      BuilderApp.showToast('Le dossier « ' + newPath + ' » existe déjà', 'error');
      return;
    }

    try {
      await BuilderAPI.pageMoveFolder(draggedFolder, newPath);
      updateRegistryAfterFolderMove(reg, draggedFolder, newPath);
      saveAndRefresh();
      if (selectedPage) renderMetaPanel(selectedPage);
      BuilderApp.showToast('Dossier déplacé', 'success');
    } catch (e) {
      BuilderApp.showToast('Erreur : ' + e.message, 'error');
    }
  }

  /** Crée un sous-dossier dans un dossier parent */
  async function createSubFolder(parentFolder) {
    var reg = BuilderApp.state.registry;
    if (!reg.folders) reg.folders = {};
    var parentName = (reg.folders[parentFolder] && reg.folders[parentFolder].name) || parentFolder.split('/').pop();

    var result = await BuilderModal.form({
      title: 'Nouveau sous-dossier',
      message: 'Créer un sous-dossier dans « ' + parentName + ' ».',
      fields: [
        { key: 'name', label: 'Nom du sous-dossier', value: '', placeholder: 'Ex : Consulting' },
        { key: 'slug', label: 'Slug (chemin technique)', value: '', placeholder: 'consulting', helpText: 'Généré automatiquement à partir du nom' }
      ],
      linkedSlug: { source: 'name', target: 'slug', slugify: slugify },
      validate: function (values) {
        if (!values.name || !values.name.trim()) return 'Le nom ne peut pas être vide';
        if (!values.slug) return 'Le slug ne peut pas être vide';
        var fullPath = parentFolder + '/' + values.slug;
        if (reg.folders[fullPath]) return 'Le slug « ' + values.slug + ' » est déjà utilisé dans ce dossier';
        return null;
      },
      confirmText: 'Créer',
      variant: 'primary'
    });

    if (!result) return;

    var displayName = result.name.trim();
    var fullPath = parentFolder + '/' + result.slug;

    try {
      await BuilderAPI.pageMkdir(fullPath);
      reg.folders[fullPath] = { name: displayName, order: Object.keys(reg.folders).length, collapsed: false };
      if (reg.folders[parentFolder]) {
        reg.folders[parentFolder].collapsed = false;
      }
      saveAndRefresh();
      if (selectedFolder === parentFolder) renderFolderMetaPanel(parentFolder);
      BuilderApp.showToast('Sous-dossier « ' + displayName + ' » créé', 'success');
    } catch (e) {
      BuilderApp.showToast('Erreur : ' + e.message, 'error');
    }
  }

  /* ══════════════════════════════════════
     DRAG & DROP — Réordonnement + déplacement entre dossiers
     ══════════════════════════════════════ */

  /** Déplace une page dans un dossier cible */
  function movePageToFolder(oldPath, targetFolder) {
    var reg = BuilderApp.state.registry;
    if (!reg || !reg.pages || !reg.pages[oldPath]) return;

    var homepage = reg.homepage || 'index.html';
    if (oldPath === homepage) {
      BuilderApp.showToast('La page d\'accueil ne peut pas être déplacée', 'error');
      return;
    }

    var basename = oldPath.split('/').pop();
    var newPath = targetFolder ? targetFolder + '/' + basename : basename;

    if (newPath === oldPath) return;

    if (reg.pages[newPath]) {
      BuilderApp.showToast('Un fichier existe déjà : ' + newPath, 'error');
      return;
    }

    BuilderAPI.pageRename(oldPath, newPath).then(function () {
      var pageData = reg.pages[oldPath];
      delete reg.pages[oldPath];
      pageData.slug = newPath.replace(/\.html$/, '');
      pageData.updatedAt = new Date().toISOString();
      reg.pages[newPath] = pageData;

      // S'assurer que le dossier cible est enregistré
      if (targetFolder && reg.folders && !reg.folders[targetFolder]) {
        reg.folders[targetFolder] = { order: Object.keys(reg.folders).length, collapsed: false };
      }

      // Mettre à jour selectedPage si c'était cette page
      if (selectedPage === oldPath) selectedPage = newPath;

      saveAndRefresh();
      if (selectedPage === newPath) renderMetaPanel(newPath);
      BuilderApp.showToast('Page déplacée', 'success');
    }).catch(function (e) {
      BuilderApp.showToast('Erreur : ' + e.message, 'error');
    });
  }

  /** Déplace une page avant ou après une cible (même dossier que la cible) */
  function movePage(draggedPath, targetPath, position) {
    var reg = BuilderApp.state.registry;
    if (!reg || !reg.pages) return;

    var homepage = reg.homepage || 'index.html';
    if (draggedPath === homepage) {
      BuilderApp.showToast('La page d\'accueil ne peut pas être déplacée', 'error');
      return;
    }

    var targetFolder = getFolderFromPath(targetPath);
    var draggedFolder = getFolderFromPath(draggedPath);

    function reorder(actualDraggedPath) {
      var folder = getFolderFromPath(actualDraggedPath);
      // Récupérer toutes les pages du même dossier
      var siblings = Object.keys(reg.pages).filter(function (p) {
        return getFolderFromPath(p) === folder;
      }).map(function (p) {
        return { path: p, order: reg.pages[p].order || 0 };
      });
      siblings.sort(function (a, b) { return a.order - b.order; });

      // Retirer la page dragged
      var newOrder = siblings.filter(function (p) { return p.path !== actualDraggedPath; });

      // Trouver l'index de la cible
      var targetIdx = newOrder.findIndex(function (p) { return p.path === targetPath; });
      if (targetIdx === -1) return;

      var insertIdx = position === 'before' ? targetIdx : targetIdx + 1;
      newOrder.splice(insertIdx, 0, { path: actualDraggedPath });

      newOrder.forEach(function (p, i) {
        if (reg.pages[p.path]) reg.pages[p.path].order = i;
      });

      renderTree();
      BuilderApp.saveRegistry();
    }

    // Si le dossier change, déplacer physiquement d'abord
    if (draggedFolder !== targetFolder) {
      var basename = draggedPath.split('/').pop();
      var newPath = targetFolder ? targetFolder + '/' + basename : basename;

      if (reg.pages[newPath]) {
        BuilderApp.showToast('Un fichier existe déjà : ' + newPath, 'error');
        return;
      }

      BuilderAPI.pageRename(draggedPath, newPath).then(function () {
        var pageData = reg.pages[draggedPath];
        delete reg.pages[draggedPath];
        pageData.slug = newPath.replace(/\.html$/, '');
        pageData.updatedAt = new Date().toISOString();
        reg.pages[newPath] = pageData;

        if (selectedPage === draggedPath) selectedPage = newPath;

        reorder(newPath);
        BuilderApp.showToast('Page déplacée', 'success');
      }).catch(function (e) {
        BuilderApp.showToast('Erreur : ' + e.message, 'error');
      });
    } else {
      reorder(draggedPath);
    }
  }

  /* ══════════════════════════════════════
     SELECT & META PANEL
     ══════════════════════════════════════ */

  function selectPage(path) {
    selectedPage = path;
    selectedFolder = null;
    renderTree();
    renderMetaPanel(path);
  }

  function selectFolder(folderPath) {
    selectedFolder = folderPath;
    selectedPage = null;
    renderTree();
    renderFolderMetaPanel(folderPath);
  }

  function renderMetaPanel(path) {
    var reg = BuilderApp.state.registry;
    if (!reg || !reg.pages || !reg.pages[path]) {
      metaPanel.innerHTML = '<div class="bld-meta__empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><p>Sélectionnez une page ou un dossier.</p></div>';
      return;
    }

    var page = reg.pages[path];
    var isHome = reg.homepage === path;
    var isProtected = path === 'index.html' || path === '404.html';
    var isTemplate = page.isTemplate || false;
    var currentFolder = getFolderFromPath(path);

    // Panel lecture seule pour les templates uniquement
    if (isTemplate) {
      metaPanel.innerHTML = ''
        + '<div class="bld-meta">'
        + '<h2 class="bld-meta__title">' + escapeHtml(page.title || path) + '</h2>'
        + '<p style="font-size: var(--text-sm); color: var(--color-text-light); margin-bottom: var(--space-4);">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" style="vertical-align: -2px;"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>'
        + ' Page template (non modifiable)'
        + '</p>'
        + '<div class="bld-field">'
        + '<label class="bld-field__label">Chemin</label>'
        + '<input class="bld-field__input" type="text" value="' + escapeAttr(path) + '" readonly style="opacity: 0.6;">'
        + '</div>'
        + (currentFolder ? '<div class="bld-field">'
        + '<label class="bld-field__label">Dossier</label>'
        + '<input class="bld-field__input" type="text" value="' + escapeAttr(currentFolder) + '" readonly style="opacity: 0.6;">'
        + '</div>' : '')
        + '</div>';
      return;
    }

    // Toolbar icons
    var svgDraft = page.status === 'draft'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    var svgHome = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';
    var svgDuplicate = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    var svgDelete = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

    var isDraft = page.status === 'draft';
    var draftTitle = isDraft ? 'Publier' : 'Brouillon';

    // Champ dossier (lecture seule + bouton déplacer)
    var folderFieldHtml = '';
    if (!isHome) {
      folderFieldHtml = '<div class="bld-field">'
        + '<label class="bld-field__label">Dossier</label>'
        + '<div style="display: flex; gap: 8px; align-items: center;">'
        + '<input class="bld-field__input" type="text" value="' + escapeAttr(currentFolder || '(racine)') + '" readonly style="opacity: 0.6; flex: 1;">'
        + '<button class="bld-btn bld-btn--sm" data-action="move-to-folder" title="Déplacer dans un dossier">Déplacer</button>'
        + '</div>'
        + '</div>';
    }

    metaPanel.innerHTML = ''
      + '<div class="bld-meta">'

      // ── Toolbar icon-only ──
      + '<div class="bld-meta__toolbar">'
      + '<button class="bld-meta__tool' + (isDraft ? ' bld-meta__tool--warning' : '') + '" data-action="toggle-status" title="' + draftTitle + '">' + svgDraft + '</button>'
      + '<button class="bld-meta__tool' + (isHome ? ' bld-meta__tool--active' : '') + '" data-action="set-homepage" title="Page d\'accueil"' + (isHome ? ' disabled' : '') + '>' + svgHome + '</button>'
      + '<button class="bld-meta__tool" data-action="duplicate-page" title="Dupliquer">' + svgDuplicate + '</button>'
      + (isProtected ? '' : '<button class="bld-meta__tool bld-meta__tool--danger" data-action="delete-page" title="Supprimer">' + svgDelete + '</button>')
      + '</div>'

      + '<h2 class="bld-meta__title">' + escapeHtml(page.title || path) + '</h2>'

      + '<div class="bld-field">'
      + '<label class="bld-field__label">Titre de la page</label>'
      + '<input class="bld-field__input" type="text" data-meta="title" value="' + escapeAttr(page.title || '') + '">'
      + '</div>'

      + '<div class="bld-field">'
      + '<label class="bld-field__label">Slug (URL)</label>'
      + '<input class="bld-field__input" type="text" data-meta="slug" value="' + escapeAttr(page.slug || '') + '">'
      + '</div>'

      + folderFieldHtml

      + '<div class="bld-field__sep"></div>'

      + '<div class="bld-field">'
      + '<label class="bld-field__label">Meta title (SEO)</label>'
      + '<input class="bld-field__input" type="text" data-meta="metaTitle" value="' + escapeAttr(page.metaTitle || '') + '" placeholder="Titre pour les moteurs de recherche">'
      + '</div>'

      + '<div class="bld-field">'
      + '<label class="bld-field__label">Meta description (SEO)</label>'
      + '<textarea class="bld-field__textarea" data-meta="metaDescription" placeholder="Description pour les moteurs de recherche" style="font-family: inherit; min-height: 60px;">' + escapeHtml(page.metaDescription || '') + '</textarea>'
      + '</div>'

      + '<div class="bld-field">'
      + '<label class="bld-field__label">Image mise en avant</label>'
      + '<input class="bld-field__input" type="text" data-meta="featuredImage" value="' + escapeAttr(page.featuredImage || '') + '" placeholder="/assets/images/hero.jpg">'
      + '</div>'

      + '<div class="bld-field__sep"></div>'

      + '<div class="bld-field">'
      + '<label class="bld-field__checkbox"><input type="checkbox" data-meta-bool="noindex"' + (page.noindex ? ' checked' : '') + '> Désindexer (noindex)</label>'
      + '</div>'

      + '<div class="bld-field__sep"></div>'

      + '<div class="bld-field">'
      + '<div class="bld-field__header">'
      + '<label class="bld-field__label">Code personnalisé &lt;head&gt;</label>'
      + '<button class="bld-field__expand" data-expand-field="customHead" title="Agrandir">'
      + '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="12" height="12"><polyline points="4 10 4 12 6 12"/><polyline points="12 6 12 4 10 4"/><line x1="4" y1="12" x2="7" y2="9"/><line x1="12" y1="4" x2="9" y2="7"/></svg>'
      + '</button>'
      + '</div>'
      + '<textarea class="bld-field__textarea bld-field__textarea--collapsed" data-meta="customHead" rows="2" placeholder="<!-- Scripts, styles... -->">' + escapeHtml(page.customHead || '') + '</textarea>'
      + '</div>'

      + '<div class="bld-field">'
      + '<div class="bld-field__header">'
      + '<label class="bld-field__label">Code personnalisé &lt;body&gt;</label>'
      + '<button class="bld-field__expand" data-expand-field="customBody" title="Agrandir">'
      + '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="12" height="12"><polyline points="4 10 4 12 6 12"/><polyline points="12 6 12 4 10 4"/><line x1="4" y1="12" x2="7" y2="9"/><line x1="12" y1="4" x2="9" y2="7"/></svg>'
      + '</button>'
      + '</div>'
      + '<textarea class="bld-field__textarea bld-field__textarea--collapsed" data-meta="customBody" rows="2" placeholder="<!-- Scripts avant &lt;/body&gt;... -->">' + escapeHtml(page.customBody || '') + '</textarea>'
      + '</div>'

      + '</div>';

    // Bind events
    metaPanel.querySelectorAll('[data-meta]').forEach(function (input) {
      input.addEventListener('input', function () {
        var key = input.getAttribute('data-meta');
        var val = input.value;

        // Garde-fou slug unique
        if (key === 'slug') {
          var duplicate = Object.keys(reg.pages).some(function (p) {
            return p !== path && reg.pages[p].slug === val;
          });
          if (duplicate) {
            input.style.borderColor = 'var(--color-error, #ef4444)';
            input.title = 'Ce slug est déjà utilisé par une autre page';
            return;
          } else {
            input.style.borderColor = '';
            input.title = '';
          }
        }

        page[key] = val;
        page.updatedAt = new Date().toISOString();
        debouncedSave();
      });
    });

    // Expand/collapse code fields
    metaPanel.querySelectorAll('[data-expand-field]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var fieldName = btn.getAttribute('data-expand-field');
        var textarea = metaPanel.querySelector('[data-meta="' + fieldName + '"]');
        if (!textarea) return;
        var isCollapsed = textarea.classList.contains('bld-field__textarea--collapsed');
        textarea.classList.toggle('bld-field__textarea--collapsed', !isCollapsed);
        textarea.classList.toggle('bld-field__textarea--expanded', isCollapsed);
        if (isCollapsed) {
          btn.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="12" height="12"><polyline points="6 12 6 10 4 10"/><polyline points="10 4 10 6 12 6"/><line x1="6" y1="10" x2="9" y2="7"/><line x1="10" y1="6" x2="7" y2="9"/></svg>';
          btn.title = 'Réduire';
        } else {
          btn.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="12" height="12"><polyline points="4 10 4 12 6 12"/><polyline points="12 6 12 4 10 4"/><line x1="4" y1="12" x2="7" y2="9"/><line x1="12" y1="4" x2="9" y2="7"/></svg>';
          btn.title = 'Agrandir';
        }
      });
    });

    metaPanel.querySelectorAll('[data-meta-bool]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var key = cb.getAttribute('data-meta-bool');
        page[key] = cb.checked;
        page.updatedAt = new Date().toISOString();
        saveAndRefresh();
      });
    });

    // Bouton déplacer dans un dossier
    var moveBtn = metaPanel.querySelector('[data-action="move-to-folder"]');
    if (moveBtn) {
      moveBtn.addEventListener('click', function () {
        showMoveFolderModal(path);
      });
    }

    var toggleStatusBtn = metaPanel.querySelector('[data-action="toggle-status"]');
    if (toggleStatusBtn) {
      toggleStatusBtn.addEventListener('click', function () {
        page.status = page.status === 'draft' ? 'published' : 'draft';
        page.updatedAt = new Date().toISOString();
        saveAndRefresh();
        renderMetaPanel(path);
      });
    }

    var setHomeBtn = metaPanel.querySelector('[data-action="set-homepage"]');
    if (setHomeBtn) {
      setHomeBtn.addEventListener('click', function () {
        reg.homepage = path;
        page.order = -1;
        page.updatedAt = new Date().toISOString();
        saveAndRefresh();
        renderMetaPanel(path);
      });
    }

    var duplicateBtn = metaPanel.querySelector('[data-action="duplicate-page"]');
    if (duplicateBtn) {
      duplicateBtn.addEventListener('click', async function () {
        var slug = page.slug || path.replace(/\.html$/, '');
        var newFilename = await BuilderModal.prompt({
          title: 'Dupliquer la page',
          message: 'Une copie de « ' + (page.title || path) + ' » sera créée.',
          label: 'Nom du fichier',
          value: slug + '-copie.html',
          confirmText: 'Dupliquer',
          variant: 'primary'
        });
        if (!newFilename) return;
        if (!newFilename.endsWith('.html')) newFilename += '.html';

        var newSlug = newFilename.replace(/\.html$/, '');
        var slugExists = Object.keys(reg.pages).some(function (p) {
          return reg.pages[p].slug === newSlug;
        });
        if (slugExists) {
          BuilderApp.showToast('Ce slug existe déjà, choisissez un autre nom', 'error');
          return;
        }

        BuilderAPI.pageDuplicate(path, newFilename).then(function () {
          var now = new Date().toISOString();
          var pageCount = Object.keys(reg.pages).length;
          reg.pages[newFilename] = {
            title: 'Copie de ' + (page.title || path),
            slug: newSlug,
            metaTitle: page.metaTitle || '',
            metaDescription: page.metaDescription || '',
            featuredImage: page.featuredImage || '',
            status: 'draft',
            noindex: false,
            customHead: page.customHead || '',
            customBody: page.customBody || '',
            order: pageCount,
            readOnly: false,
            isTemplate: false,
            createdAt: now,
            updatedAt: now
          };
          saveAndRefresh();
          selectPage(newFilename);
          BuilderApp.showToast(newFilename + ' créé (copie)', 'success');
        }).catch(function (e) {
          BuilderApp.showToast('Erreur : ' + e.message, 'error');
        });
      });
    }

    var deleteBtn = metaPanel.querySelector('[data-action="delete-page"]');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async function () {
        var ok = await BuilderModal.confirm({
          title: 'Supprimer la page',
          message: 'Supprimer « ' + (page.title || path) + ' » ? Cette action est irréversible.',
          confirmText: 'Supprimer',
          variant: 'danger-fill'
        });
        if (!ok) return;
        BuilderAPI.pageDelete(path).then(function () {
          delete reg.pages[path];
          selectedPage = null;
          saveAndRefresh();
          renderMetaPanel(null);
          BuilderApp.showToast(path + ' supprimé', 'success');
        }).catch(function (e) {
          BuilderApp.showToast('Erreur : ' + e.message, 'error');
        });
      });
    }
  }

  /** Modal de déplacement vers un dossier */
  async function showMoveFolderModal(pagePath) {
    var reg = BuilderApp.state.registry;
    var currentFolder = getFolderFromPath(pagePath);
    var folders = ['(racine)'].concat(Object.keys(reg.folders || {}).sort());

    var options = folders.map(function (f) {
      var val = f === '(racine)' ? '' : f;
      var label = f === '(racine)' ? 'Racine' : f;
      var selected = val === currentFolder ? ' (actuel)' : '';
      return label + selected;
    });

    var choice = await BuilderModal.prompt({
      title: 'Déplacer dans un dossier',
      message: 'Dossier actuel : ' + (currentFolder || 'racine'),
      label: 'Nom du dossier cible (vide = racine)',
      value: currentFolder,
      confirmText: 'Déplacer',
      variant: 'primary'
    });

    if (choice === null) return; // annulé
    var targetFolder = choice.trim();

    if (targetFolder === currentFolder) return;

    movePageToFolder(pagePath, targetFolder);
  }

  function saveAndRefresh() {
    BuilderApp.saveRegistry();
    renderTree();
  }

  /* ══════════════════════════════════════
     NEW PAGE MODAL
     ══════════════════════════════════════ */

  var modal = document.getElementById('modalNewPage');
  var filenameInput = document.getElementById('newPageFilename');

  function openNewPageModal() {
    filenameInput.value = '';
    modal.classList.add('bld-modal-overlay--visible');
    setTimeout(function () { filenameInput.focus(); }, 100);
  }

  function closeNewPageModal() {
    modal.classList.remove('bld-modal-overlay--visible');
  }

  function createPage() {
    var filename = filenameInput.value.trim();
    if (!filename) return;
    if (!filename.endsWith('.html')) filename += '.html';

    BuilderAPI.pageCreate(filename).then(function () {
      var reg = BuilderApp.state.registry;
      var now = new Date().toISOString();
      var pageCount = Object.keys(reg.pages).length;

      reg.pages[filename] = {
        title: filename.replace('.html', '').replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }),
        slug: filename.replace('.html', ''),
        metaTitle: '',
        metaDescription: '',
        featuredImage: '',
        status: 'published',
        noindex: false,
        customHead: '',
        customBody: '',
        order: pageCount,
        readOnly: false,
        createdAt: now,
        updatedAt: now
      };

      saveAndRefresh();
      closeNewPageModal();
      selectPage(filename);
      BuilderApp.showToast(filename + ' créé', 'success');
    }).catch(function (e) {
      BuilderApp.showToast('Erreur : ' + e.message, 'error');
    });
  }

  /* ══════════════════════════════════════
     NEW FOLDER MODAL
     ══════════════════════════════════════ */

  async function openNewFolderModal() {
    var reg = BuilderApp.state.registry;
    if (!reg.folders) reg.folders = {};

    var result = await BuilderModal.form({
      title: 'Nouveau dossier',
      fields: [
        { key: 'name', label: 'Nom du dossier', value: '', placeholder: 'Ex : Études de cas' },
        { key: 'slug', label: 'Slug (chemin technique)', value: '', placeholder: 'etudes-de-cas', helpText: 'Généré automatiquement à partir du nom' }
      ],
      linkedSlug: { source: 'name', target: 'slug', slugify: slugify },
      validate: function (values) {
        if (!values.name || !values.name.trim()) return 'Le nom ne peut pas être vide';
        if (!values.slug) return 'Le slug ne peut pas être vide';
        if (reg.folders[values.slug]) return 'Le slug « ' + values.slug + ' » est déjà utilisé';
        return null;
      },
      confirmText: 'Créer',
      variant: 'primary'
    });

    if (!result) return;

    var displayName = result.name.trim();
    var folderSlug = result.slug;

    try {
      await BuilderAPI.pageMkdir(folderSlug);
      reg.folders[folderSlug] = { name: displayName, order: Object.keys(reg.folders).length, collapsed: false };
      saveAndRefresh();
      BuilderApp.showToast('Dossier « ' + displayName + ' » créé (' + folderSlug + ')', 'success');
    } catch (e) {
      BuilderApp.showToast('Erreur : ' + e.message, 'error');
    }
  }

  // Bind buttons
  document.getElementById('btnNewPage').addEventListener('click', openNewPageModal);
  document.getElementById('actionNewPage').addEventListener('click', openNewPageModal);
  document.getElementById('btnCancelNewPage').addEventListener('click', closeNewPageModal);
  document.getElementById('btnConfirmNewPage').addEventListener('click', createPage);
  filenameInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') createPage();
    if (e.key === 'Escape') closeNewPageModal();
  });

  // Bouton nouveau dossier (s'il existe dans le DOM)
  var btnNewFolder = document.getElementById('btnNewFolder');
  if (btnNewFolder) {
    btnNewFolder.addEventListener('click', openNewFolderModal);
  }

  // Close modal on overlay click
  modal.addEventListener('click', function (e) {
    if (e.target === modal) closeNewPageModal();
  });

  // Refresh button — re-sync from filesystem
  document.getElementById('btnRefreshPages').addEventListener('click', function () {
    BuilderAPI.pagesList().then(function (resp) {
      if (!resp.ok) return;
      var reg = BuilderApp.state.registry;
      var now = new Date().toISOString();

      if (!reg.folders) reg.folders = {};

      // Synchroniser les dossiers depuis le serveur
      (resp.folders || []).forEach(function (f) {
        if (!reg.folders[f]) {
          reg.folders[f] = { order: Object.keys(reg.folders).length, collapsed: false };
        }
      });

      // Ajouter les pages présentes sur le disque mais pas dans le registre
      resp.pages.forEach(function (page) {
        if (!reg.pages[page.path]) {
          var pageCount = Object.keys(reg.pages).length;
          reg.pages[page.path] = {
            title: page.title || page.path.replace('.html', ''),
            slug: page.path.replace(/\.html$/, ''),
            metaTitle: '',
            metaDescription: '',
            featuredImage: '',
            status: 'published',
            noindex: false,
            customHead: '',
            customBody: '',
            order: pageCount,
            readOnly: page.readOnly || false,
            isTemplate: page.isTemplate || false,
            createdAt: now,
            updatedAt: now
          };
        } else {
          reg.pages[page.path].readOnly = page.readOnly || false;
        }

        // S'assurer que le dossier parent est enregistré
        var slash = page.path.lastIndexOf('/');
        if (slash !== -1) {
          var folder = page.path.substring(0, slash);
          if (!reg.folders[folder]) {
            reg.folders[folder] = { order: Object.keys(reg.folders).length, collapsed: false };
          }
        }
      });

      // Supprimer les pages du registre qui n'existent plus sur le disque
      var diskPaths = resp.pages.map(function (p) { return p.path; });
      Object.keys(reg.pages).forEach(function (path) {
        if (diskPaths.indexOf(path) === -1) {
          delete reg.pages[path];
        }
      });

      // Supprimer les dossiers qui n'existent plus
      var serverFolders = resp.folders || [];
      Object.keys(reg.folders).forEach(function (f) {
        if (serverFolders.indexOf(f) === -1) {
          var hasPages = Object.keys(reg.pages).some(function (p) {
            return p.indexOf(f + '/') === 0;
          });
          if (!hasPages) delete reg.folders[f];
        }
      });

      saveAndRefresh();
      BuilderApp.showToast('Pages synchronisées', 'success');
    });
  });

  /* ══════════════════════════════════════
     DASHBOARD — Stats & recent pages
     ══════════════════════════════════════ */

  function refreshDashboard() {
    var reg = BuilderApp.state.registry;
    if (!reg || !reg.pages) return;

    var pages = Object.keys(reg.pages).map(function (p) {
      return Object.assign({ path: p }, reg.pages[p]);
    });

    var total = pages.length;
    var published = pages.filter(function (p) { return p.status !== 'draft'; }).length;
    var drafts = total - published;

    document.getElementById('statTotal').textContent = total;
    document.getElementById('statPublished').textContent = published;
    document.getElementById('statDraft').textContent = drafts;

    // Pages récentes (5 dernières par updatedAt)
    var recent = pages.slice().sort(function (a, b) {
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    }).slice(0, 5);

    var recentEl = document.getElementById('recentPages');
    if (recent.length === 0) {
      recentEl.innerHTML = '<div class="bld-recent__empty">Aucune page pour le moment.</div>';
      return;
    }

    var html = '';
    recent.forEach(function (page) {
      var date = page.updatedAt ? new Date(page.updatedAt).toLocaleDateString('fr-FR') : '';
      html += '<div class="bld-recent__item" data-path="' + escapeAttr(page.path) + '">'
        + '<div><span class="bld-recent__item-name">' + escapeHtml(page.title || page.path) + '</span>'
        + ' <span class="bld-recent__item-path">' + escapeHtml(page.path) + '</span></div>'
        + '<span class="bld-recent__item-date">' + date + '</span>'
        + '</div>';
    });
    recentEl.innerHTML = html;

    // Click on recent page
    recentEl.querySelectorAll('.bld-recent__item').forEach(function (item) {
      item.addEventListener('click', function () {
        var path = item.getAttribute('data-path');
        selectedPage = path;
        BuilderApp.switchPanel('pages');
        setTimeout(function () { selectPage(path); }, 50);
      });
    });
  }

  /* ══════════════════════════════════════
     PUBLIC API
     ══════════════════════════════════════ */

  window.BuilderPages = {
    refresh: function () {
      renderTree();
    },
    getSelectedPage: function () { return selectedPage; }
  };

  window.BuilderDashboard = {
    refresh: refreshDashboard
  };

})();
