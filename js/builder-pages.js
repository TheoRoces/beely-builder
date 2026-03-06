/* ==========================================================================
   BUILDER PAGES — Tree view hiérarchique, CRUD, drag & drop, métadonnées
   ========================================================================== */
(function () {
  'use strict';

  var treeEl = document.getElementById('pageTree');
  var metaPanel = document.getElementById('pageMetaPanel');
  var selectedPage = null;

  /* ══════════════════════════════════════
     HELPERS
     ══════════════════════════════════════ */

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** Vérifie si `path` est un descendant de `ancestorPath` dans le registre */
  function isDescendant(path, ancestorPath, reg) {
    var current = path;
    var visited = {};
    while (current) {
      if (visited[current]) return false; // protection boucle
      visited[current] = true;
      var pageData = reg.pages[current];
      if (!pageData || !pageData.parent) return false;
      if (pageData.parent === ancestorPath) return true;
      current = pageData.parent;
    }
    return false;
  }

  /** Construit la structure arborescente : { roots: [...], children: { parentPath: [...] } } */
  function buildTreeStructure(pages, reg) {
    var children = {};
    var roots = [];

    pages.forEach(function (page) {
      var parentPath = page.parent || null;
      if (parentPath && reg.pages[parentPath]) {
        if (!children[parentPath]) children[parentPath] = [];
        children[parentPath].push(page);
      } else {
        roots.push(page);
      }
    });

    // Trier les enfants par order
    Object.keys(children).forEach(function (key) {
      children[key].sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    });

    return { roots: roots, children: children };
  }

  /* ══════════════════════════════════════
     TREE VIEW
     ══════════════════════════════════════ */

  function renderTree() {
    var reg = BuilderApp.state.registry;
    if (!reg || !reg.pages) {
      treeEl.innerHTML = '<div class="bld-recent__empty">Chargement...</div>';
      return;
    }

    var allPages = Object.keys(reg.pages).map(function (path) {
      return Object.assign({ path: path }, reg.pages[path]);
    });

    // Trier : homepage en tête, puis par order
    var homepage = reg.homepage || 'index.html';
    allPages.sort(function (a, b) {
      if (a.path === homepage) return -1;
      if (b.path === homepage) return 1;
      return (a.order || 0) - (b.order || 0);
    });

    // Construire l'arbre hiérarchique
    var tree = buildTreeStructure(allPages, reg);

    var html = '';

    // Rendu avec hiérarchie
    tree.roots.forEach(function (page) {
      html += renderTreeItem(page, reg, tree.children, 0);
    });

    treeEl.innerHTML = html || '<div class="bld-recent__empty">Aucune page.</div>';

    // Bind events
    bindTreeEvents();
  }

  var INDENT_STEP = 20;
  var BASE_INDENT = 12;
  var CHEVRON_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 4 10 8 6 12"/></svg>';

  /** Raccourcit un titre de page en enlevant les suffixes répétitifs */
  function shortenTitle(title) {
    if (!title) return '';
    // Enlever les patterns " — Nom — Site" ou " | Nom | Site"
    return title.split(/\s*[—|–]\s*/)[0].trim();
  }

  /** Rendu récursif d'un item + ses enfants */
  function renderTreeItem(page, reg, childrenMap, level) {
    var isHome = reg.homepage === page.path;
    var isDraft = page.status === 'draft';
    var isActive = selectedPage === page.path;
    var isTemplate = page.isTemplate || false;
    var isLocked = isTemplate;
    var hasChildren = childrenMap[page.path] && childrenMap[page.path].length > 0;
    var isCollapsed = page.collapsed || false;

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

    // Chevron expand/collapse (ou spacer)
    var expandHtml = '';
    if (hasChildren) {
      var rotation = isCollapsed ? '0' : '90';
      expandHtml = '<button class="bld-tree__expand" data-action="toggle-expand" style="transform: rotate(' + rotation + 'deg)">' + CHEVRON_SVG + '</button>';
    } else {
      expandHtml = '<span style="width: 16px; flex-shrink: 0;"></span>';
    }

    // Icône de page
    var icon;
    if (isHome) {
      icon = '<svg class="bld-tree__icon bld-tree__icon--home" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';
    } else if (isTemplate) {
      icon = '<svg class="bld-tree__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';
    } else if (hasChildren) {
      icon = '<svg class="bld-tree__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
    } else {
      icon = '<svg class="bld-tree__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
    }

    var badge = '';
    if (isDraft) badge = '<span class="bld-tree__badge bld-tree__badge--draft">Brouillon</span>';
    else if (isTemplate) badge = '<span class="bld-tree__badge bld-tree__badge--template">Template</span>';

    // Actions
    var actionsHtml = '';
    if (!isLocked) {
      actionsHtml = '<div class="bld-tree__actions">'
        + '<button class="bld-tree__btn" data-action="edit" title="Éditer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>'
        + '</div>';
    }

    // Shortened title
    var displayTitle = shortenTitle(page.title) || page.path.replace(/\.html$/, '');

    var html = '<div class="' + cls + '" data-path="' + escapeAttr(page.path) + '" data-level="' + level + '"'
      + (isLocked ? '' : ' draggable="true"')
      + ' style="padding-left: ' + indent + 'px; --drop-indent: ' + indent + 'px;">'
      + guidesHtml
      + expandHtml
      + icon
      + '<span class="bld-tree__name">' + escapeHtml(displayTitle) + '</span>'
      + badge
      + actionsHtml
      + '</div>';

    // Rendu récursif des enfants (si non collapsed)
    if (hasChildren && !isCollapsed) {
      childrenMap[page.path].forEach(function (child) {
        html += renderTreeItem(child, reg, childrenMap, level + 1);
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
      var path = item.getAttribute('data-path');
      var isReadOnly = item.classList.contains('bld-tree__item--readonly');

      // Click → sélectionner
      item.addEventListener('click', function (e) {
        if (e.target.closest('[data-action]')) return;
        selectPage(path);
      });

      // Bouton éditer
      var editBtn = item.querySelector('[data-action="edit"]');
      if (editBtn) {
        editBtn.addEventListener('click', function () {
          BuilderApp.editPage(path);
        });
      }

      // Bouton expand/collapse
      var expandBtn = item.querySelector('[data-action="toggle-expand"]');
      if (expandBtn) {
        expandBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          var reg = BuilderApp.state.registry;
          if (reg && reg.pages[path]) {
            reg.pages[path].collapsed = !reg.pages[path].collapsed;
            BuilderApp.saveRegistry();
            renderTree();
          }
        });
      }

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
      if (!isReadOnly) {
        item.addEventListener('dragover', function (e) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';

          var rect = item.getBoundingClientRect();
          var y = e.clientY - rect.top;
          var h = rect.height;

          clearDropIndicators();

          // Zone haute (25%) = insérer avant
          // Zone centre (50%) = imbriquer (devenir enfant)
          // Zone basse (25%) = insérer après
          if (y < h * 0.25) {
            item.classList.add('bld-tree__item--drop-before');
          } else if (y > h * 0.75) {
            item.classList.add('bld-tree__item--drop-after');
          } else {
            item.classList.add('bld-tree__item--drop-inside');
          }
        });

        item.addEventListener('dragleave', function (e) {
          // Vérifier qu'on quitte bien l'élément (pas un enfant)
          if (!item.contains(e.relatedTarget)) {
            item.classList.remove('bld-tree__item--drop-before', 'bld-tree__item--drop-after', 'bld-tree__item--drop-inside');
          }
        });

        item.addEventListener('drop', function (e) {
          e.preventDefault();
          clearDropIndicators();

          var draggedPath = e.dataTransfer.getData('text/plain');
          if (!draggedPath || draggedPath === path) return;

          var rect = item.getBoundingClientRect();
          var y = e.clientY - rect.top;
          var h = rect.height;

          if (y < h * 0.25) {
            // Insérer avant
            movePage(draggedPath, path, 'before');
          } else if (y > h * 0.75) {
            // Insérer après
            movePage(draggedPath, path, 'after');
          } else {
            // Imbriquer comme enfant
            nestPage(draggedPath, path);
          }
        });
      }
    });
  }

  function clearDropIndicators() {
    treeEl.querySelectorAll('.bld-tree__item--drop-before, .bld-tree__item--drop-after, .bld-tree__item--drop-inside').forEach(function (el) {
      el.classList.remove('bld-tree__item--drop-before', 'bld-tree__item--drop-after', 'bld-tree__item--drop-inside');
    });
  }

  /* ══════════════════════════════════════
     DRAG & DROP — Réordonnement + hiérarchie
     ══════════════════════════════════════ */

  /** Déplace une page avant ou après une cible (même niveau que la cible) */
  function movePage(draggedPath, targetPath, position) {
    var reg = BuilderApp.state.registry;
    if (!reg || !reg.pages) return;

    var targetPage = reg.pages[targetPath];
    if (!targetPage) return;

    // La page déplacée prend le même parent que la cible
    var targetParent = targetPage.parent || null;
    reg.pages[draggedPath].parent = targetParent;

    // Récupérer toutes les pages du même parent
    var siblings = Object.keys(reg.pages).filter(function (p) {
      return (reg.pages[p].parent || null) === targetParent;
    }).map(function (p) {
      return { path: p, order: reg.pages[p].order || 0 };
    });
    siblings.sort(function (a, b) { return a.order - b.order; });

    // Retirer la page dragged
    var newOrder = siblings.filter(function (p) { return p.path !== draggedPath; });

    // Trouver l'index de la cible
    var targetIdx = newOrder.findIndex(function (p) { return p.path === targetPath; });
    if (targetIdx === -1) return;

    // Insérer avant ou après la cible
    var insertIdx = position === 'before' ? targetIdx : targetIdx + 1;
    newOrder.splice(insertIdx, 0, { path: draggedPath });

    // Mettre à jour les ordres
    newOrder.forEach(function (p, i) {
      if (reg.pages[p.path]) reg.pages[p.path].order = i;
    });

    renderTree();
    BuilderApp.saveRegistry();
  }

  /** Imbrique une page comme enfant d'une autre */
  function nestPage(childPath, parentPath) {
    var reg = BuilderApp.state.registry;
    if (!reg || !reg.pages) return;

    // Protection : ne pas imbriquer dans soi-même
    if (childPath === parentPath) return;

    // Protection : ne pas imbriquer un parent dans son propre descendant (boucle)
    if (isDescendant(parentPath, childPath, reg)) {
      BuilderApp.showToast('Impossible : créerait une boucle', 'error');
      return;
    }

    // Protéger la homepage
    if (childPath === (reg.homepage || 'index.html')) {
      BuilderApp.showToast('La page d\'accueil ne peut pas être imbriquée', 'error');
      return;
    }

    reg.pages[childPath].parent = parentPath;

    // Mettre l'enfant à la fin des enfants existants du parent
    var existingChildren = Object.keys(reg.pages).filter(function (p) {
      return reg.pages[p].parent === parentPath && p !== childPath;
    });
    reg.pages[childPath].order = existingChildren.length;

    // Déplier le parent pour montrer le nouvel enfant
    reg.pages[parentPath].collapsed = false;

    renderTree();
    BuilderApp.saveRegistry();
  }

  /* ══════════════════════════════════════
     SELECT & META PANEL
     ══════════════════════════════════════ */

  function selectPage(path) {
    selectedPage = path;
    renderTree();
    renderMetaPanel(path);
  }

  function renderMetaPanel(path) {
    var reg = BuilderApp.state.registry;
    if (!reg || !reg.pages || !reg.pages[path]) {
      metaPanel.innerHTML = '<div class="bld-meta__empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><p>Sélectionnez une page.</p></div>';
      return;
    }

    var page = reg.pages[path];
    var isHome = reg.homepage === path;
    var isProtected = path === 'index.html' || path === '404.html';
    var isTemplate = page.isTemplate || false;

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
        + '<div class="bld-field__sep"></div>'
        + '<div class="bld-field">'
        + '<button class="bld-btn bld-btn--sm" data-action="view-page">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
        + ' Voir dans l\'éditeur'
        + '</button>'
        + '</div>'
        + '</div>';

      var viewBtn = metaPanel.querySelector('[data-action="view-page"]');
      if (viewBtn) {
        viewBtn.addEventListener('click', function () {
          BuilderApp.editPage(path);
        });
      }
      return;
    }

    // Construire la liste des pages parentes possibles (pour le select)
    var parentOptions = '<option value="">Aucune (racine)</option>';
    Object.keys(reg.pages).forEach(function (p) {
      if (p === path) return; // pas soi-même
      if (isDescendant(p, path, reg)) return; // pas un descendant
      var selected = (page.parent === p) ? ' selected' : '';
      parentOptions += '<option value="' + escapeAttr(p) + '"' + selected + '>' + escapeHtml(reg.pages[p].title || p) + '</option>';
    });

    // Toolbar icons
    var svgEdit = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    var svgDraft = page.status === 'draft'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    var svgHome = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';
    var svgDuplicate = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    var svgDelete = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

    var isDraft = page.status === 'draft';
    var draftTitle = isDraft ? 'Publier' : 'Brouillon';

    metaPanel.innerHTML = ''
      + '<div class="bld-meta">'

      // ── Toolbar icon-only ──
      + '<div class="bld-meta__toolbar">'
      + '<button class="bld-meta__tool" data-action="edit-page" title="Éditer">' + svgEdit + '</button>'
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

      + '<div class="bld-field">'
      + '<label class="bld-field__label">Page parente</label>'
      + '<select class="bld-field__input" data-meta-select="parent">'
      + parentOptions
      + '</select>'
      + '</div>'

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
            return; // Ne pas sauvegarder
          } else {
            input.style.borderColor = '';
            input.title = '';
          }
        }

        page[key] = val;
        page.updatedAt = new Date().toISOString();
        saveAndRefresh();
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
        // Toggle icon
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

    // Select parent
    var parentSelect = metaPanel.querySelector('[data-meta-select="parent"]');
    if (parentSelect) {
      parentSelect.addEventListener('change', function () {
        var newParent = parentSelect.value || null;

        // Vérification anti-boucle
        if (newParent && isDescendant(newParent, path, reg)) {
          BuilderApp.showToast('Impossible : créerait une boucle', 'error');
          parentSelect.value = page.parent || '';
          return;
        }

        // Protéger la homepage
        if (newParent && path === (reg.homepage || 'index.html')) {
          BuilderApp.showToast('La page d\'accueil ne peut pas être imbriquée', 'error');
          parentSelect.value = '';
          return;
        }

        page.parent = newParent;
        page.updatedAt = new Date().toISOString();
        saveAndRefresh();
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
        saveAndRefresh();
        renderMetaPanel(path);
      });
    }

    var editBtn = metaPanel.querySelector('[data-action="edit-page"]');
    if (editBtn) {
      editBtn.addEventListener('click', function () {
        BuilderApp.editPage(path);
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

        // Vérifier que le slug n'existe pas
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
            parent: page.parent || null,
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
          // Dé-nester les enfants de la page supprimée
          Object.keys(reg.pages).forEach(function (p) {
            if (reg.pages[p].parent === path) {
              reg.pages[p].parent = null;
            }
          });
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
        parent: null,
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

  // Bind buttons
  document.getElementById('btnNewPage').addEventListener('click', openNewPageModal);
  document.getElementById('actionNewPage').addEventListener('click', openNewPageModal);
  document.getElementById('btnCancelNewPage').addEventListener('click', closeNewPageModal);
  document.getElementById('btnConfirmNewPage').addEventListener('click', createPage);
  filenameInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') createPage();
    if (e.key === 'Escape') closeNewPageModal();
  });

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

      // Ajouter les pages présentes sur le disque mais pas dans le registre
      // + mettre à jour readOnly/isTemplate sur les pages existantes
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
            parent: null,
            readOnly: page.readOnly || false,
            isTemplate: page.isTemplate || false,
            createdAt: now,
            updatedAt: now
          };
        } else {
          // Mettre à jour les flags serveur sur les pages existantes
          reg.pages[page.path].readOnly = page.readOnly || false;
          reg.pages[page.path].isTemplate = page.isTemplate || false;
        }
      });

      // Auto-détection parent depuis la structure de dossiers
      Object.keys(reg.pages).forEach(function (pagePath) {
        if (pagePath.indexOf('/') !== -1 && !reg.pages[pagePath].parent) {
          var folder = pagePath.split('/')[0];
          var potentialParent = folder + '.html';
          if (reg.pages[potentialParent]) {
            reg.pages[pagePath].parent = potentialParent;
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
