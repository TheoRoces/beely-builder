/* ==========================================================================
   BUILDER CANVAS — iframe, parsing sections, insertion, edition texte
   ========================================================================== */
(function () {
  'use strict';

  var iframe = document.getElementById('editorIframe');
  var sectionsList = document.getElementById('sectionsList');
  var editorLayout = document.getElementById('editorLayout');
  var catalogOpen = false;

  // Page en cours d'edition
  var currentPath = null;
  var rawHtml = '';
  var sections = [];     // [{ id, label, html }]
  var headHtml = '';      // Tout le <head>
  var headerHtml = '';    // Le composant header
  var footerHtml = '';    // Le composant footer
  var beforeContent = ''; // HTML entre </head><body> et le premier contenu
  var afterContent = '';  // HTML apres le dernier contenu et avant </body>

  /* ══════════════════════════════════════
     LOAD PAGE
     ══════════════════════════════════════ */

  async function loadPage(path) {
    currentPath = path;

    // Update UI
    document.getElementById('editorPageName').textContent = path;
    document.getElementById('btnPreviewPage').href = '/' + path;
    document.getElementById('sidebarEditorLink').style.display = '';

    try {
      var resp = await BuilderAPI.pageRead(path);
      if (!resp.ok) throw new Error('Impossible de lire ' + path);
      rawHtml = resp.content;
      parsePageHtml(rawHtml);
      renderIframe();
      renderSectionsList();
    } catch (e) {
      BuilderApp.showToast('Erreur : ' + e.message, 'error');
    }

    // Init wireframes catalog
    BuilderWireframes.render(function (id, html) {
      insertSection(id, html);
    });
  }

  /* ══════════════════════════════════════
     PARSE HTML
     ══════════════════════════════════════ */

  function parsePageHtml(html) {
    sections = [];
    headHtml = '';
    headerHtml = '';
    footerHtml = '';
    beforeContent = '';
    afterContent = '';

    // Extraire le <head>
    var headMatch = html.match(/([\s\S]*?<\/head>)/i);
    if (headMatch) headHtml = headMatch[1];

    // Extraire le body content
    var bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (!bodyMatch) return;
    var bodyContent = bodyMatch[1];

    // Identifier header et footer (composants data-component)
    var headerMatch = bodyContent.match(/(<div\s+data-component="header"[\s\S]*?<\/div>\s*(?:<\/div>)?)/i);
    // Plus robuste : trouver le bloc header complet
    var headerRegex = /(<\s*div[^>]*data-component="header"[^>]*>[\s\S]*?<\/div>\s*)/i;
    // Utiliser une approche par marqueurs
    var parts = splitByComponents(bodyContent);

    headerHtml = parts.header;
    footerHtml = parts.footer;
    beforeContent = parts.beforeContent;
    afterContent = parts.afterContent;

    // Parser les sections du contenu
    var content = parts.content;

    // Methode 1 : marqueurs <!-- #section:ID -->
    var sectionRegex = /<!-- #section:(\S+) -->([\s\S]*?)<!-- \/section:\1 -->/g;
    var match;
    var lastIdx = 0;
    var foundMarkers = false;

    while ((match = sectionRegex.exec(content)) !== null) {
      foundMarkers = true;
      // Contenu avant le marqueur (peut etre vide ou contenir du HTML non-section)
      if (match.index > lastIdx) {
        var between = content.substring(lastIdx, match.index).trim();
        if (between) {
          sections.push({
            id: 'custom-' + sections.length,
            label: extractLabel(between),
            html: between
          });
        }
      }
      sections.push({
        id: match[1],
        label: match[1].replace(/-/g, ' '),
        html: match[2].trim()
      });
      lastIdx = match.index + match[0].length;
    }

    // Reste apres le dernier marqueur
    if (foundMarkers && lastIdx < content.length) {
      var rest = content.substring(lastIdx).trim();
      if (rest) {
        sections.push({
          id: 'custom-' + sections.length,
          label: extractLabel(rest),
          html: rest
        });
      }
    }

    // Methode 2 : pas de marqueurs, decouper par <section> ou <div class="section">
    if (!foundMarkers && content.trim()) {
      // Mettre tout le contenu comme une seule section
      sections.push({
        id: 'content',
        label: extractLabel(content),
        html: content.trim()
      });
    }
  }

  function splitByComponents(bodyContent) {
    var result = {
      header: '',
      footer: '',
      content: '',
      beforeContent: '',
      afterContent: ''
    };

    // Trouver le header (data-component="header" ou data-rendered="header")
    var headerStart = bodyContent.indexOf('data-component="header"');
    if (headerStart === -1) headerStart = bodyContent.indexOf('data-rendered="header"');

    var footerStart = bodyContent.indexOf('data-component="footer"');
    if (footerStart === -1) footerStart = bodyContent.indexOf('data-rendered="footer"');

    if (headerStart !== -1) {
      // Remonter au debut du tag
      var tagStart = bodyContent.lastIndexOf('<', headerStart);
      // Trouver la fin du bloc header (fermeture du div parent)
      var headerEnd = findClosingTag(bodyContent, tagStart);
      result.header = bodyContent.substring(tagStart, headerEnd).trim();
      result.beforeContent = bodyContent.substring(0, tagStart).trim();

      if (footerStart !== -1) {
        var footerTagStart = bodyContent.lastIndexOf('<', footerStart);
        var footerEnd = findClosingTag(bodyContent, footerTagStart);
        result.footer = bodyContent.substring(footerTagStart, footerEnd).trim();
        result.content = bodyContent.substring(headerEnd, footerTagStart).trim();
        result.afterContent = bodyContent.substring(footerEnd).trim();
      } else {
        result.content = bodyContent.substring(headerEnd).trim();
      }
    } else {
      result.content = bodyContent.trim();
    }

    return result;
  }

  function findClosingTag(html, startIdx) {
    // Simple compteur de profondeur pour trouver le </div> fermant
    var depth = 0;
    var i = startIdx;
    var inTag = false;
    var tagName = '';

    while (i < html.length) {
      if (html[i] === '<') {
        var remaining = html.substring(i);
        // Tag fermant
        if (remaining.startsWith('</div')) {
          depth--;
          if (depth === 0) {
            var endTag = html.indexOf('>', i) + 1;
            return endTag;
          }
        }
        // Tag ouvrant div
        else if (remaining.match(/^<div[\s>]/)) {
          depth++;
        }
      }
      i++;
    }
    return html.length;
  }

  function extractLabel(html) {
    // Essayer d'extraire le premier titre
    var match = html.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/i);
    if (match) return match[1].replace(/<[^>]+>/g, '').trim().substring(0, 40);

    // Ou la premiere classe significative
    var classMatch = html.match(/class="([^"]*wf-[^"]*?)"/);
    if (classMatch) {
      var name = classMatch[1].split(' ').find(function (c) { return c.startsWith('wf-'); });
      if (name) return name.replace('wf-', '').replace(/-/g, ' ');
    }

    return 'Section';
  }

  /* ══════════════════════════════════════
     RENDER
     ══════════════════════════════════════ */

  function renderIframe() {
    var html = reconstructHtml();

    // Utiliser srcdoc : les chemins sont déjà convertis en absolus par resolveRelativePaths,
    // et sandbox="allow-same-origin allow-scripts" permet le chargement depuis le serveur.
    iframe.onload = function () {
      setupInlineEditing();
    };
    iframe.srcdoc = html;
  }

  /**
   * Résout les chemins relatifs en absolus en fonction du dossier de la page.
   * Ex: pour docs/blog.html, "../core/css/base.css" → "/core/css/base.css"
   *     et "docs.css" → "/docs/docs.css"
   */
  function resolveRelativePaths(html) {
    if (!currentPath) return html;

    // Calculer le dossier de la page (ex: "docs/" pour "docs/blog.html", "" pour "index.html")
    var pageDir = currentPath.indexOf('/') !== -1
      ? currentPath.substring(0, currentPath.lastIndexOf('/') + 1)
      : '';

    // Résoudre les chemins dans src="..." et href="..."
    return html.replace(/((?:src|href)\s*=\s*["'])([^"':#\s][^"']*)(["'])/gi, function (match, pre, path, post) {
      // Ignorer les chemins déjà absolus, les protocoles, data:, javascript:, mailto:, ancres, templates
      if (path.charAt(0) === '/' || path.indexOf('://') !== -1 || path.indexOf(':') !== -1 || path.charAt(0) === '#' || path.indexOf('{{') !== -1) {
        return match;
      }
      // Résoudre le chemin relatif
      var resolved = resolvePath(pageDir, path);
      return pre + '/' + resolved + post;
    });
  }

  /** Résout un chemin relatif depuis un dossier de base. Ex: resolvePath("docs/", "../core/a.css") → "core/a.css" */
  function resolvePath(base, relative) {
    var parts = base.split('/').filter(Boolean);
    var relParts = relative.split('/');
    for (var i = 0; i < relParts.length; i++) {
      if (relParts[i] === '..') {
        parts.pop();
      } else if (relParts[i] !== '.' && relParts[i] !== '') {
        parts.push(relParts[i]);
      }
    }
    return parts.join('/');
  }

  function reconstructHtml(forSave) {
    var finalHead = headHtml;

    var parts = [finalHead, '\n<body>\n'];

    if (beforeContent) parts.push(beforeContent + '\n');
    if (headerHtml) parts.push('\n  ' + headerHtml + '\n');

    sections.forEach(function (section) {
      if (section.id.startsWith('custom-') || section.id === 'content') {
        parts.push('\n  ' + section.html + '\n');
      } else {
        parts.push('\n  <!-- #section:' + section.id + ' -->\n  ' + section.html + '\n  <!-- /section:' + section.id + ' -->\n');
      }
    });

    if (footerHtml) parts.push('\n  ' + footerHtml + '\n');
    if (afterContent) parts.push(afterContent + '\n');

    parts.push('\n</body>\n</html>');

    var result = parts.join('');

    // Pour le rendu iframe : convertir tous les chemins relatifs en absolus
    // Pour la sauvegarde : garder le HTML original avec les chemins relatifs
    if (!forSave) {
      result = resolveRelativePaths(result);
    }

    return result;
  }

  /** Legacy: kept for section operations; delegates to DOM tree */
  function renderSectionsList() {
    // Le DOM tree sera reconstruit par setupInlineEditing() via iframe.onload
    // Pas besoin de rendre la liste plate des sections ici.
  }

  /* ══════════════════════════════════════
     INSERT SECTION
     ══════════════════════════════════════ */

  function insertSection(id, html) {
    pushUndo();

    // Generer un ID unique si doublon
    var uniqueId = id;
    var counter = 1;
    while (sections.some(function (s) { return s.id === uniqueId; })) {
      uniqueId = id + '-' + (++counter);
    }

    sections.push({
      id: uniqueId,
      label: id.replace(/-/g, ' '),
      html: html.trim()
    });

    renderIframe();
    renderSectionsList();
    markDirty();
  }

  /* ══════════════════════════════════════
     INLINE EDITING
     ══════════════════════════════════════ */

  /* ── Élément actuellement sélectionné dans le canvas ── */
  var selectedPath = null; // CSS path string (survit aux rebuilds iframe)
  var pendingSelectionPath = null; // Restauration de sélection après rebuild iframe

  /* ── Undo / Redo ── */
  var undoStack = [];
  var redoStack = [];
  var MAX_UNDO = 50;

  /** Génère un sélecteur CSS unique pour retrouver un élément après rebuild iframe */
  function getCssPath(el) {
    var path = [];
    try {
      var doc = iframe.contentDocument;
      while (el && el !== doc.body && el !== doc.documentElement) {
        var tag = el.tagName.toLowerCase();
        var parent = el.parentElement;
        if (!parent) break;
        var siblings = Array.prototype.filter.call(parent.children, function (c) {
          return c.tagName === el.tagName;
        });
        if (siblings.length > 1) {
          var idx = Array.prototype.indexOf.call(siblings, el) + 1;
          tag += ':nth-of-type(' + idx + ')';
        }
        path.unshift(tag);
        el = parent;
      }
    } catch (e) { /* cross-origin */ }
    return path.join(' > ');
  }

  /** Retrouve un élément dans l'iframe à partir de son CSS path */
  function resolveElement(cssPath) {
    if (!cssPath) return null;
    try {
      var doc = iframe.contentDocument;
      return doc.body.querySelector(cssPath);
    } catch (e) { return null; }
  }

  /** Sauvegarde un snapshot avant mutation (pour undo) */
  function pushUndo() {
    undoStack.push({
      sections: JSON.parse(JSON.stringify(sections)),
      selectedPath: selectedPath
    });
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack = [];
  }

  /** Undo : restaure le dernier snapshot */
  function undo() {
    if (undoStack.length === 0) return;
    // Sauver l'état actuel dans redoStack
    redoStack.push({
      sections: JSON.parse(JSON.stringify(sections)),
      selectedPath: selectedPath
    });
    var snapshot = undoStack.pop();
    sections = snapshot.sections;
    pendingSelectionPath = snapshot.selectedPath;
    renderIframe();
    markDirty();
  }

  /** Redo : inverse de undo */
  function redo() {
    if (redoStack.length === 0) return;
    undoStack.push({
      sections: JSON.parse(JSON.stringify(sections)),
      selectedPath: selectedPath
    });
    var snapshot = redoStack.pop();
    sections = snapshot.sections;
    pendingSelectionPath = snapshot.selectedPath;
    renderIframe();
    markDirty();
  }

  /** Marque l'éditeur comme ayant des modifications non sauvegardées */
  function markDirty() {
    if (window.BuilderApp && BuilderApp.setEditorDirty) {
      BuilderApp.setEditorDirty(true);
    }
  }

  function setupInlineEditing() {
    try {
      var doc = iframe.contentDocument || iframe.contentWindow.document;
      if (!doc) return;

      // ── Bloquer TOUTE navigation (liens, ancres, formulaires) ──
      doc.addEventListener('click', function (e) {
        if (e.target.isContentEditable) return;
        e.preventDefault();
        e.stopPropagation();

        // Sélection d'élément au clic simple
        var el = e.target;
        selectElement(el);
      }, true);

      doc.querySelectorAll('form').forEach(function (form) {
        form.addEventListener('submit', function (e) { e.preventDefault(); }, true);
      });

      // Undo/Redo dans l'iframe aussi
      doc.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          undo();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
          e.preventDefault();
          redo();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
          e.preventDefault();
          savePage();
        }
      });

      // Rendre les textes editables au double-clic
      var editables = doc.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, a, li, td, th, button, label');
      editables.forEach(function (el) {
        el.style.cursor = 'text';
        el.addEventListener('dblclick', function (e) {
          e.preventDefault();
          e.stopPropagation();
          el.contentEditable = 'true';
          el.focus();
          el.style.outline = '2px solid #3b82f6';
          el.style.outlineOffset = '2px';
        });
        el.addEventListener('blur', function () {
          el.contentEditable = 'false';
          el.style.outline = '';
          el.style.outlineOffset = '';
          pushUndo();
          syncFromIframe();
          markDirty();
        });
        el.addEventListener('keydown', function (e) {
          if (e.key === 'Escape') {
            el.contentEditable = 'false';
            el.style.outline = '';
            el.style.outlineOffset = '';
            el.blur();
          }
        });
      });

      // Construire et afficher le DOM tree
      buildAndRenderDomTree();

      // Restaurer la sélection si demandée (après undo/redo)
      if (pendingSelectionPath) {
        var restoreEl = resolveElement(pendingSelectionPath);
        pendingSelectionPath = null;
        if (restoreEl) selectElement(restoreEl);
      }
    } catch (e) {
      // Cross-origin ou erreur, silencer
    }
  }

  function syncFromIframe() {
    try {
      var doc = iframe.contentDocument || iframe.contentWindow.document;
      if (!doc) return;

      // Re-extraire le contenu du body pour mettre a jour les sections
      var body = doc.body;
      if (!body) return;

      // Trouver les sections par marqueurs dans le DOM reconstruit
      var bodyHtml = body.innerHTML;
      var newParts = splitByComponents(bodyHtml);

      // Reparser les sections du contenu mis a jour
      var content = newParts.content;
      var newSections = [];

      var sectionRegex = /<!-- #section:(\S+) -->([\s\S]*?)<!-- \/section:\1 -->/g;
      var match;
      var lastIdx = 0;

      while ((match = sectionRegex.exec(content)) !== null) {
        if (match.index > lastIdx) {
          var between = content.substring(lastIdx, match.index).trim();
          if (between) {
            newSections.push({
              id: 'custom-' + newSections.length,
              label: extractLabel(between),
              html: between
            });
          }
        }
        newSections.push({
          id: match[1],
          label: match[1].replace(/-/g, ' '),
          html: match[2].trim()
        });
        lastIdx = match.index + match[0].length;
      }

      if (newSections.length > 0) {
        if (lastIdx < content.length) {
          var rest = content.substring(lastIdx).trim();
          if (rest) {
            newSections.push({
              id: 'custom-' + newSections.length,
              label: extractLabel(rest),
              html: rest
            });
          }
        }
        sections = newSections;
      } else if (content.trim()) {
        // Pas de marqueurs, garder comme section unique
        sections = [{
          id: 'content',
          label: extractLabel(content),
          html: content.trim()
        }];
      }

      renderSectionsList();
    } catch (e) {
      // Silencer les erreurs cross-origin
    }
  }

  /* ══════════════════════════════════════
     DOM TREE VIEW
     ══════════════════════════════════════ */

  var TREE_INCLUDE = /^(section|div|header|nav|main|footer|article|aside|ul|ol|li|h[1-6]|p|img|a|span|button|figure|figcaption|form|input|textarea|table|thead|tbody|tr|td|th|blockquote|video|audio|iframe|picture|source|svg|details|summary)$/i;
  var TREE_EXCLUDE = /^(script|style|link|meta|noscript|template|br|hr|wbr|col|colgroup|base|head)$/i;
  var treeData = []; // flat array of { el, tag, depth, path, hasChildren, expanded, label }
  var treePropsEl = document.getElementById('domTreeProps');

  /**
   * Construit un arbre DOM plat à partir du contenu de l'iframe.
   * Chaque nœud = { el, tag, depth, path (ex: "0.2.1"), hasChildren, expanded, label }
   */
  function buildDomTree() {
    treeData = [];
    try {
      var doc = iframe.contentDocument || iframe.contentWindow.document;
      if (!doc || !doc.body) return;

      // Trouver la zone de contenu (entre header et footer, ou body entier)
      var body = doc.body;
      walkTree(body, 0, '');
    } catch (e) { /* cross-origin */ }
  }

  function walkTree(parentEl, depth, parentPath) {
    var childIdx = 0;
    for (var i = 0; i < parentEl.children.length; i++) {
      var el = parentEl.children[i];
      var tag = el.tagName.toLowerCase();

      if (TREE_EXCLUDE.test(tag)) continue;
      if (!TREE_INCLUDE.test(tag) && !el.children.length) continue;

      var path = parentPath ? parentPath + '.' + childIdx : '' + childIdx;
      var significantChildren = countSignificantChildren(el);
      var hasChildren = significantChildren > 0;

      // Auto-expand: depth 0-1 expanded, rest collapsed
      var expanded = depth < 2;

      var labelParts = buildNodeLabel(el, tag);
      treeData.push({
        el: el,
        tag: tag,
        depth: depth,
        path: path,
        cssPath: getCssPath(el),
        hasChildren: hasChildren,
        expanded: expanded,
        label: labelParts,
        customName: ''  // Nom personnalisé par l'utilisateur
      });

      if (hasChildren && expanded) {
        walkTree(el, depth + 1, path);
      }

      childIdx++;
    }
  }

  function countSignificantChildren(el) {
    var count = 0;
    for (var i = 0; i < el.children.length; i++) {
      var child = el.children[i];
      var tag = child.tagName.toLowerCase();
      if (TREE_EXCLUDE.test(tag)) continue;
      // Même logique que walkTree : inclure si dans TREE_INCLUDE OU si a des enfants
      if (TREE_INCLUDE.test(tag) || child.children.length > 0) count++;
    }
    return count;
  }

  /** Éléments pour lesquels on affiche le contenu texte comme nom */
  var TEXT_TAGS = /^(a|h[1-6]|p|span|button|label|li|td|th|figcaption|blockquote|summary)$/i;

  function buildNodeLabel(el, tag) {
    var parts = { tag: tag, qualifier: '', text: '' };

    // Qualifier : id ou première classe
    if (el.id) {
      parts.qualifier = '#' + el.id;
    } else {
      var cls = el.getAttribute('class');
      if (cls) {
        var first = cls.trim().split(/\s+/)[0];
        if (first) parts.qualifier = '.' + first;
      }
    }

    // Texte contextuel pour les éléments textuels
    if (TEXT_TAGS.test(tag)) {
      var txt = '';
      // Prendre le texte direct (pas des enfants profonds)
      for (var i = 0; i < el.childNodes.length; i++) {
        if (el.childNodes[i].nodeType === 3) txt += el.childNodes[i].textContent;
      }
      txt = txt.trim();
      if (!txt) txt = (el.textContent || '').trim();
      if (txt) {
        parts.text = txt.length > 24 ? txt.substring(0, 24) + '…' : txt;
      }
    }
    // Pour img : alt ou filename
    if (tag === 'img') {
      var alt = el.getAttribute('alt');
      var src = el.getAttribute('src');
      if (alt) {
        parts.text = alt.length > 24 ? alt.substring(0, 24) + '…' : alt;
      } else if (src) {
        var fname = src.split('/').pop().split('?')[0];
        parts.text = fname.length > 24 ? fname.substring(0, 24) + '…' : fname;
      }
    }

    return parts;
  }

  /** Re-construit et re-rend l'arbre. */
  function buildAndRenderDomTree() {
    buildDomTree();
    renderDomTree();
  }

  /** Icônes SVG par type d'élément (style Webflow Navigator) */
  var NODE_ICONS = {
    section:  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="1.5"/><line x1="2" y1="6" x2="14" y2="6"/></svg>',
    div:      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="1.5"/></svg>',
    header:   '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="1.5"/><line x1="2" y1="6" x2="14" y2="6"/></svg>',
    nav:      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="10" rx="1.5"/><circle cx="5" cy="8" r="1" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="1" fill="currentColor" stroke="none"/><circle cx="11" cy="8" r="1" fill="currentColor" stroke="none"/></svg>',
    footer:   '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="1.5"/><line x1="2" y1="10" x2="14" y2="10"/></svg>',
    main:     '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="1.5"/><rect x="5" y="5" width="6" height="6" rx="0.5"/></svg>',
    article:  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="2" width="10" height="12" rx="1.5"/><line x1="5.5" y1="5" x2="10.5" y2="5"/><line x1="5.5" y1="7.5" x2="10.5" y2="7.5"/><line x1="5.5" y1="10" x2="8.5" y2="10"/></svg>',
    aside:    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="1.5"/><line x1="6" y1="2" x2="6" y2="14"/></svg>',
    img:      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="10" rx="1.5"/><circle cx="5.5" cy="6.5" r="1.5"/><polyline points="14 11 10.5 7 7 10.5 5.5 9.5 2 13"/></svg>',
    a:        '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6.5 9.5l3-3"/><path d="M9 4.5l.9-.9a2.1 2.1 0 013 3l-.9.9"/><path d="M7 11.5l-.9.9a2.1 2.1 0 01-3-3l.9-.9"/></svg>',
    p:        '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="3" y1="4" x2="13" y2="4"/><line x1="3" y1="7" x2="13" y2="7"/><line x1="3" y1="10" x2="9" y2="10"/></svg>',
    span:     '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 12l2-8M10 12l2-8"/></svg>',
    ul:       '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="4" cy="4.5" r="1" fill="currentColor" stroke="none"/><line x1="7" y1="4.5" x2="13" y2="4.5"/><circle cx="4" cy="8" r="1" fill="currentColor" stroke="none"/><line x1="7" y1="8" x2="13" y2="8"/><circle cx="4" cy="11.5" r="1" fill="currentColor" stroke="none"/><line x1="7" y1="11.5" x2="13" y2="11.5"/></svg>',
    ol:       '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="7" y1="4.5" x2="13" y2="4.5"/><line x1="7" y1="8" x2="13" y2="8"/><line x1="7" y1="11.5" x2="13" y2="11.5"/></svg>',
    li:       '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="4" cy="8" r="1" fill="currentColor" stroke="none"/><line x1="7" y1="8" x2="13" y2="8"/></svg>',
    button:   '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4.5" width="12" height="7" rx="2"/></svg>',
    form:     '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="1.5"/><line x1="5" y1="5.5" x2="11" y2="5.5"/><line x1="5" y1="8" x2="11" y2="8"/><rect x="5" y="10" width="3" height="2" rx="0.5"/></svg>',
    input:    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="5" width="12" height="6" rx="1.5"/><line x1="4.5" y1="7" x2="4.5" y2="9"/></svg>',
    textarea: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="1.5"/><line x1="4.5" y1="5" x2="11.5" y2="5"/><line x1="4.5" y1="7.5" x2="11.5" y2="7.5"/><line x1="4.5" y1="10" x2="8" y2="10"/></svg>',
    video:    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="10" rx="1.5"/><polygon points="7,6 11,8 7,10" fill="currentColor" stroke="none"/></svg>',
    audio:    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 3v10M5 5.5v5M11 5.5v5M3 7v2M13 7v2"/></svg>',
    iframe:   '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="1.5"/><path d="M6 6L4 8l2 2M10 6l2 2-2 2"/></svg>',
    table:    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="1.5"/><line x1="2" y1="6" x2="14" y2="6"/><line x1="2" y1="10" x2="14" y2="10"/><line x1="6" y1="2" x2="6" y2="14"/></svg>',
    figure:   '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="10" rx="1.5"/><line x1="4" y1="14" x2="12" y2="14"/></svg>',
    svg:      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="5.5"/><path d="M5.5 8a2.5 2.5 0 015 0"/></svg>',
    blockquote: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 8h2.5L5 11M9 8h2.5L10 11"/><line x1="3" y1="5" x2="13" y2="5"/></svg>',
    details:  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="1.5"/><polyline points="6 7 8 9 10 7"/></svg>',
    picture:  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="10" rx="1.5"/><circle cx="5.5" cy="6.5" r="1.5"/><polyline points="14 11 10.5 7 7 10.5 5.5 9.5 2 13"/></svg>'
  };
  // Heading icons : "H1"…"H6" as text
  var HEADING_TAGS = /^h([1-6])$/i;
  // Chevron SVG
  var CHEVRON_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 4 10 8 6 12"/></svg>';
  // Default icon
  var DEFAULT_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="1.5"/></svg>';

  function getNodeIcon(tag) {
    var hm = tag.match(HEADING_TAGS);
    if (hm) return '<span style="font-size:9px;font-weight:700;line-height:1">' + tag.toUpperCase() + '</span>';
    return NODE_ICONS[tag] || DEFAULT_ICON;
  }

  /** Primary label : customName > class/id > textContent > tag */
  function getNodeDisplayName(node) {
    if (node.customName) return node.customName;
    // Class as label (sans le point)
    if (node.label.qualifier) {
      var q = node.label.qualifier;
      return q.charAt(0) === '.' ? q.substring(1) : q;
    }
    if (node.label.text) return node.label.text;
    return node.tag;
  }

  function renderDomTree() {
    if (treeData.length === 0) {
      sectionsList.innerHTML = '<div class="bld-sections__empty">Aucun élément.</div>';
      return;
    }

    var html = '';
    var INDENT_STEP = 20;
    var BASE_INDENT = 8;

    for (var i = 0; i < treeData.length; i++) {
      var node = treeData[i];
      var indent = BASE_INDENT + node.depth * INDENT_STEP;
      var isSelected = (selectedPath && node.cssPath === selectedPath);

      html += '<div class="bld-dom-node' + (isSelected ? ' bld-dom-node--selected' : '') + '" '
        + 'data-tree-idx="' + i + '" '
        + 'style="padding-left: ' + indent + 'px; --drop-indent: ' + indent + 'px;" '
        + 'draggable="true">';

      // Indentation lines
      if (node.depth > 0) {
        html += '<div class="bld-dom-node__guides">';
        for (var g = 1; g <= node.depth; g++) {
          html += '<div class="bld-dom-node__guide" style="left: ' + (BASE_INDENT + (g - 1) * INDENT_STEP + 8) + 'px"></div>';
        }
        html += '</div>';
      }

      // Toggle chevron
      if (node.hasChildren) {
        html += '<button class="bld-dom-node__toggle" data-toggle-idx="' + i + '" '
          + 'style="transform: rotate(' + (node.expanded ? '90' : '0') + 'deg)">'
          + CHEVRON_SVG + '</button>';
      } else {
        html += '<span class="bld-dom-node__spacer"></span>';
      }

      // Type icon
      html += '<span class="bld-dom-node__icon">' + getNodeIcon(node.tag) + '</span>';

      // Primary label (class name, custom name, or text)
      var displayName = getNodeDisplayName(node);
      html += '<span class="bld-dom-node__label" title="Double-clic pour renommer">' + escapeHtml(displayName) + '</span>';

      // Tag badge (visible on hover/selected)
      if (displayName !== node.tag) {
        html += '<span class="bld-dom-node__tag">' + node.tag + '</span>';
      }

      html += '</div>';
    }

    sectionsList.innerHTML = html;
    bindDomTreeEvents();
  }

  function bindDomTreeEvents() {
    // Click to select
    sectionsList.querySelectorAll('.bld-dom-node').forEach(function (nodeEl) {
      nodeEl.addEventListener('click', function (e) {
        if (e.target.closest('.bld-dom-node__toggle')) return;
        if (e.target.closest('.bld-dom-node__name-input')) return;
        var idx = parseInt(nodeEl.getAttribute('data-tree-idx'));
        var node = treeData[idx];
        if (node) selectElement(node.el);
      });
    });

    // Toggle expand/collapse
    sectionsList.querySelectorAll('[data-toggle-idx]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var idx = parseInt(btn.getAttribute('data-toggle-idx'));
        toggleTreeNode(idx);
      });
    });

    // Double-click to rename
    sectionsList.querySelectorAll('.bld-dom-node__label').forEach(function (labelEl) {
      labelEl.addEventListener('dblclick', function (e) {
        e.stopPropagation();
        var nodeEl = labelEl.closest('.bld-dom-node');
        var idx = parseInt(nodeEl.getAttribute('data-tree-idx'));
        var node = treeData[idx];
        if (!node) return;
        startInlineRename(nodeEl, node);
      });
    });

    // Drag & drop (nestable)
    var dragFromIdx = null;
    sectionsList.querySelectorAll('.bld-dom-node').forEach(function (nodeEl) {
      nodeEl.addEventListener('dragstart', function (e) {
        dragFromIdx = parseInt(nodeEl.getAttribute('data-tree-idx'));
        nodeEl.classList.add('bld-dom-node--dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      nodeEl.addEventListener('dragend', function () {
        nodeEl.classList.remove('bld-dom-node--dragging');
        sectionsList.querySelectorAll('.bld-dom-node--drop-before, .bld-dom-node--drop-after, .bld-dom-node--drop-inside').forEach(function (el) {
          el.classList.remove('bld-dom-node--drop-before', 'bld-dom-node--drop-after', 'bld-dom-node--drop-inside');
        });
      });
      nodeEl.addEventListener('dragover', function (e) {
        e.preventDefault();
        var rect = nodeEl.getBoundingClientRect();
        var y = e.clientY - rect.top;
        var h = rect.height;
        nodeEl.classList.remove('bld-dom-node--drop-before', 'bld-dom-node--drop-after', 'bld-dom-node--drop-inside');
        var toIdx = parseInt(nodeEl.getAttribute('data-tree-idx'));
        var toNode = treeData[toIdx];

        // 3 zones : top 25% = before, middle 50% = inside (si container), bottom 25% = after
        if (y < h * 0.25) {
          nodeEl.classList.add('bld-dom-node--drop-before');
        } else if (y > h * 0.75) {
          nodeEl.classList.add('bld-dom-node--drop-after');
        } else if (toNode && toNode.hasChildren) {
          nodeEl.classList.add('bld-dom-node--drop-inside');
        } else if (y < h / 2) {
          nodeEl.classList.add('bld-dom-node--drop-before');
        } else {
          nodeEl.classList.add('bld-dom-node--drop-after');
        }
      });
      nodeEl.addEventListener('dragleave', function () {
        nodeEl.classList.remove('bld-dom-node--drop-before', 'bld-dom-node--drop-after', 'bld-dom-node--drop-inside');
      });
      nodeEl.addEventListener('drop', function (e) {
        e.preventDefault();
        var dropBefore = nodeEl.classList.contains('bld-dom-node--drop-before');
        var dropAfter = nodeEl.classList.contains('bld-dom-node--drop-after');
        var dropInside = nodeEl.classList.contains('bld-dom-node--drop-inside');
        nodeEl.classList.remove('bld-dom-node--drop-before', 'bld-dom-node--drop-after', 'bld-dom-node--drop-inside');

        var toIdx = parseInt(nodeEl.getAttribute('data-tree-idx'));
        if (dragFromIdx === null || dragFromIdx === toIdx) return;

        var fromNode = treeData[dragFromIdx];
        var toNode = treeData[toIdx];
        if (!fromNode || !toNode) return;

        // Empêcher de dropper un élément dans un de ses propres descendants
        if (toNode.el.contains && fromNode.el.contains(toNode.el)) return;

        pushUndo();

        if (dropInside) {
          // Imbriquer dans l'élément cible (en premier enfant)
          toNode.el.insertBefore(fromNode.el, toNode.el.firstChild);
        } else if (dropBefore) {
          toNode.el.parentElement.insertBefore(fromNode.el, toNode.el);
        } else if (dropAfter) {
          toNode.el.parentElement.insertBefore(fromNode.el, toNode.el.nextSibling);
        }

        syncFromIframe();
        buildAndRenderDomTree();
        selectElement(fromNode.el);
        dragFromIdx = null;
        markDirty();
      });
    });
  }

  /** Inline rename dans le tree */
  function startInlineRename(nodeEl, node) {
    var currentName = getNodeDisplayName(node);
    var labelSpan = nodeEl.querySelector('.bld-dom-node__label');
    if (!labelSpan) return;

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'bld-dom-node__name-input';
    input.value = node.customName || '';
    input.placeholder = currentName;
    labelSpan.replaceWith(input);
    input.focus();
    input.select();

    function finishRename() {
      var val = input.value.trim();
      node.customName = val;
      var newSpan = document.createElement('span');
      newSpan.className = 'bld-dom-node__label';
      newSpan.textContent = getNodeDisplayName(node);
      newSpan.title = 'Double-clic pour renommer';
      newSpan.addEventListener('dblclick', function (e) {
        e.stopPropagation();
        startInlineRename(nodeEl, node);
      });
      input.replaceWith(newSpan);
    }

    input.addEventListener('blur', finishRename);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { input.value = node.customName || ''; input.blur(); }
    });
  }

  function toggleTreeNode(idx) {
    var node = treeData[idx];
    if (!node || !node.hasChildren) return;
    node.expanded = !node.expanded;
    // Rebuild from scratch to properly include/exclude children
    rebuildTreePreservingState();
    renderDomTree();
  }

  /** Rebuild le tree en gardant l'état expanded + customName de chaque nœud */
  function rebuildTreePreservingState() {
    var expandedMap = new Map();
    var customNameMap = new Map();
    treeData.forEach(function (n) {
      expandedMap.set(n.el, n.expanded);
      if (n.customName) customNameMap.set(n.el, n.customName);
    });

    treeData = [];
    try {
      var doc = iframe.contentDocument || iframe.contentWindow.document;
      if (!doc || !doc.body) return;
      walkTreeWithState(doc.body, 0, '', expandedMap, customNameMap);
    } catch (e) { /* cross-origin */ }
  }

  function walkTreeWithState(parentEl, depth, parentPath, expandedMap, customNameMap) {
    var childIdx = 0;
    for (var i = 0; i < parentEl.children.length; i++) {
      var el = parentEl.children[i];
      var tag = el.tagName.toLowerCase();

      if (TREE_EXCLUDE.test(tag)) continue;
      if (!TREE_INCLUDE.test(tag) && !el.children.length) continue;

      var path = parentPath ? parentPath + '.' + childIdx : '' + childIdx;
      var significantChildren = countSignificantChildren(el);
      var hasChildren = significantChildren > 0;

      // Restore expanded state or default
      var expanded = expandedMap.has(el) ? expandedMap.get(el) : depth < 2;
      // Restore custom name
      var customName = customNameMap && customNameMap.has(el) ? customNameMap.get(el) : '';
      var labelParts = buildNodeLabel(el, tag);

      treeData.push({
        el: el,
        tag: tag,
        depth: depth,
        path: path,
        cssPath: getCssPath(el),
        hasChildren: hasChildren,
        expanded: expanded,
        label: labelParts,
        customName: customName
      });

      if (hasChildren && expanded) {
        walkTreeWithState(el, depth + 1, path, expandedMap, customNameMap);
      }

      childIdx++;
    }
  }

  /* ══════════════════════════════════════
     ELEMENT SELECTION + HIGHLIGHT
     ══════════════════════════════════════ */

  function selectElement(el) {
    // Déselectionner l'ancien
    clearSelection();

    if (!el || el === iframe.contentDocument.body) return;

    selectedPath = getCssPath(el);

    // Highlight dans le canvas
    el.style.outline = '2px solid #3b82f6';
    el.style.outlineOffset = '2px';

    // Scroll vers l'élément dans l'iframe
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Vérifier si l'élément est dans le tree ; sinon, expand ses ancêtres
    var found = false;
    for (var i = 0; i < treeData.length; i++) {
      if (treeData[i].cssPath === selectedPath) { found = true; break; }
    }
    if (!found) {
      // Collecter les ancêtres et forcer leur expansion
      var ancestors = [];
      var parent = el.parentElement;
      var body = iframe.contentDocument.body;
      while (parent && parent !== body) {
        ancestors.push(parent);
        parent = parent.parentElement;
      }
      // Marquer chaque ancêtre comme expanded dans le tree
      ancestors.forEach(function (anc) {
        var ancPath = getCssPath(anc);
        for (var j = 0; j < treeData.length; j++) {
          if (treeData[j].cssPath === ancPath) {
            treeData[j].expanded = true;
          }
        }
      });
      // Rebuild le tree avec les ancêtres ouverts
      rebuildTreePreservingState();
      renderDomTree();
    }

    // Highlight dans le tree
    var activeNode = sectionsList.querySelector('.bld-dom-node--selected');
    if (activeNode) activeNode.classList.remove('bld-dom-node--selected');

    for (var i = 0; i < treeData.length; i++) {
      if (treeData[i].cssPath === selectedPath) {
        var domNode = sectionsList.querySelector('[data-tree-idx="' + i + '"]');
        if (domNode) {
          domNode.classList.add('bld-dom-node--selected');
          // Scroll dans le tree sidebar
          domNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        break;
      }
    }

    // Afficher le panneau propriétés
    renderPropsPanel();
  }

  function clearSelection() {
    if (selectedPath) {
      try {
        var el = resolveElement(selectedPath);
        if (el && !el.isContentEditable) {
          el.style.outline = '';
          el.style.outlineOffset = '';
        }
      } catch (e) { /* élément peut avoir été supprimé */ }
    }
    selectedPath = null;

    var activeNode = sectionsList.querySelector('.bld-dom-node--selected');
    if (activeNode) activeNode.classList.remove('bld-dom-node--selected');

    // Masquer le panneau propriétés
    if (treePropsEl) treePropsEl.innerHTML = '';
  }

  /* ══════════════════════════════════════
     PROPERTIES PANEL
     ══════════════════════════════════════ */

  function renderPropsPanel() {
    if (!treePropsEl) return;
    var el = resolveElement(selectedPath);
    if (!el) { treePropsEl.innerHTML = ''; return; }

    var tag = el.tagName.toLowerCase();
    var classes = el.getAttribute('class') || '';
    var id = el.getAttribute('id') || '';

    var EXPAND_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="12" height="12"><polyline points="4 10 4 12 6 12"/><polyline points="12 6 12 4 10 4"/><line x1="4" y1="12" x2="7" y2="9"/><line x1="12" y1="4" x2="9" y2="7"/></svg>';
    var TEXT_EDIT_TAGS = /^(p|h[1-6]|span|a|li|td|th|button|label|blockquote|figcaption|summary)$/i;

    var html = '<div class="bld-props">';
    html += '<div class="bld-props__header">';
    html += '<span class="bld-props__tag">' + escapeHtml(tag) + '</span>';
    html += '<button class="bld-props__close" id="propsClose" title="Fermer">&times;</button>';
    html += '</div>';

    // Contenu textuel (pour les éléments textuels)
    if (TEXT_EDIT_TAGS.test(tag)) {
      html += '<div class="bld-props__field">';
      html += '<label class="bld-props__label">Contenu</label>';
      html += '<textarea class="bld-props__textarea" data-prop="textContent" rows="3">' + escapeHtml(el.textContent || '') + '</textarea>';
      html += '</div>';
    }

    // Classes (expandable)
    html += '<div class="bld-props__field">';
    html += '<div class="bld-props__field-header">';
    html += '<label class="bld-props__label">Classes</label>';
    html += '<button class="bld-props__expand-btn" data-expand-prop="class" title="Agrandir">' + EXPAND_ICON + '</button>';
    html += '</div>';
    html += '<input class="bld-props__input" type="text" data-prop="class" value="' + escapeAttr(classes) + '">';
    html += '</div>';

    // ID (expandable)
    html += '<div class="bld-props__field">';
    html += '<div class="bld-props__field-header">';
    html += '<label class="bld-props__label">ID</label>';
    html += '<button class="bld-props__expand-btn" data-expand-prop="id" title="Agrandir">' + EXPAND_ICON + '</button>';
    html += '</div>';
    html += '<input class="bld-props__input" type="text" data-prop="id" value="' + escapeAttr(id) + '">';
    html += '</div>';

    // Lien (si <a>)
    if (tag === 'a') {
      html += '<div class="bld-props__field">';
      html += '<div class="bld-props__field-header">';
      html += '<label class="bld-props__label">Lien (href)</label>';
      html += '<button class="bld-props__expand-btn" data-expand-prop="href" title="Agrandir">' + EXPAND_ICON + '</button>';
      html += '</div>';
      html += '<input class="bld-props__input" type="text" data-prop="href" value="' + escapeAttr(el.getAttribute('href') || '') + '">';
      html += '</div>';
      html += '<div class="bld-props__field bld-props__field--inline">';
      html += '<label><input type="checkbox" data-prop="target" ' + (el.getAttribute('target') === '_blank' ? 'checked' : '') + '> Ouvrir dans un nouvel onglet</label>';
      html += '</div>';
    }

    // Image (si <img>)
    if (tag === 'img') {
      html += '<div class="bld-props__field">';
      html += '<div class="bld-props__field-header">';
      html += '<label class="bld-props__label">Source (src)</label>';
      html += '<button class="bld-props__expand-btn" data-expand-prop="src" title="Agrandir">' + EXPAND_ICON + '</button>';
      html += '</div>';
      html += '<div class="bld-props__input-group">';
      html += '<input class="bld-props__input" type="text" data-prop="src" value="' + escapeAttr(el.getAttribute('src') || '') + '">';
      html += '<button class="bld-btn bld-btn--sm" id="propsBrowseImg" title="Parcourir">Parcourir</button>';
      html += '</div></div>';
      html += '<div class="bld-props__field">';
      html += '<div class="bld-props__field-header">';
      html += '<label class="bld-props__label">Alt</label>';
      html += '<button class="bld-props__expand-btn" data-expand-prop="alt" title="Agrandir">' + EXPAND_ICON + '</button>';
      html += '</div>';
      html += '<input class="bld-props__input" type="text" data-prop="alt" value="' + escapeAttr(el.getAttribute('alt') || '') + '">';
      html += '</div>';
    }

    // Actions
    html += '<div class="bld-props__actions">';
    html += '<button class="bld-btn bld-btn--sm" id="propsMoveUp" title="Monter"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="18 15 12 9 6 15"/></svg> Monter</button>';
    html += '<button class="bld-btn bld-btn--sm" id="propsMoveDown" title="Descendre"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg> Descendre</button>';
    html += '<button class="bld-btn bld-btn--sm bld-btn--danger" id="propsDelete" title="Supprimer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Supprimer</button>';
    html += '</div>';

    html += '</div>';
    treePropsEl.innerHTML = html;

    // Bind events
    bindPropsEvents();
  }

  function bindPropsEvents() {
    // Close button
    var closeBtn = document.getElementById('propsClose');
    if (closeBtn) closeBtn.addEventListener('click', clearSelection);

    // Input changes
    treePropsEl.querySelectorAll('[data-prop]').forEach(function (input) {
      var prop = input.getAttribute('data-prop');

      if (prop === 'target') {
        input.addEventListener('change', function () {
          var el = resolveElement(selectedPath);
          if (!el) return;
          pushUndo();
          if (input.checked) {
            el.setAttribute('target', '_blank');
          } else {
            el.removeAttribute('target');
          }
          syncFromIframe();
          markDirty();
        });
        return;
      }

      if (prop === 'textContent') {
        input.addEventListener('input', function () {
          var el = resolveElement(selectedPath);
          if (!el) return;
          pushUndo();
          el.textContent = input.value;
          syncFromIframe();
          buildAndRenderDomTree();
          markDirty();
        });
        return;
      }

      input.addEventListener('change', function () {
        var el = resolveElement(selectedPath);
        if (!el) return;
        pushUndo();
        var val = input.value;
        if (prop === 'class') {
          el.className = val;
        } else if (prop === 'id') {
          el.id = val;
        } else if (prop === 'href') {
          el.setAttribute('href', val);
        } else if (prop === 'src') {
          el.setAttribute('src', val);
        } else if (prop === 'alt') {
          el.setAttribute('alt', val);
        }
        syncFromIframe();
        // Refresh tree labels
        buildAndRenderDomTree();
        // Re-select (cssPath may have changed if class/id changed)
        selectedPath = getCssPath(el);
        renderPropsPanel();
        markDirty();
      });
    });

    // Move up
    var moveUpBtn = document.getElementById('propsMoveUp');
    if (moveUpBtn) moveUpBtn.addEventListener('click', function () {
      var el = resolveElement(selectedPath);
      if (!el) return;
      var prev = el.previousElementSibling;
      if (prev) {
        pushUndo();
        el.parentElement.insertBefore(el, prev);
        syncFromIframe();
        buildAndRenderDomTree();
        selectElement(el);
        markDirty();
      }
    });

    // Move down
    var moveDownBtn = document.getElementById('propsMoveDown');
    if (moveDownBtn) moveDownBtn.addEventListener('click', function () {
      var el = resolveElement(selectedPath);
      if (!el) return;
      var next = el.nextElementSibling;
      if (next) {
        pushUndo();
        el.parentElement.insertBefore(el, next.nextSibling);
        syncFromIframe();
        buildAndRenderDomTree();
        selectElement(el);
        markDirty();
      }
    });

    // Delete
    var deleteBtn = document.getElementById('propsDelete');
    if (deleteBtn) deleteBtn.addEventListener('click', async function () {
      var el = resolveElement(selectedPath);
      if (!el) return;
      var ok = await BuilderModal.confirm({
        title: 'Supprimer l\'élément',
        message: 'Supprimer cet élément « ' + el.tagName.toLowerCase() + ' » ?',
        confirmText: 'Supprimer',
        variant: 'danger-fill'
      });
      if (ok) {
        pushUndo();
        el.parentElement.removeChild(el);
        clearSelection();
        syncFromIframe();
        buildAndRenderDomTree();
        markDirty();
      }
    });

    // Browse image (media picker)
    var browseBtn = document.getElementById('propsBrowseImg');
    if (browseBtn) browseBtn.addEventListener('click', function () {
      openMediaPicker(function (imagePath) {
        var el = resolveElement(selectedPath);
        if (!el) return;
        pushUndo();
        el.setAttribute('src', imagePath);
        var srcInput = treePropsEl.querySelector('[data-prop="src"]');
        if (srcInput) srcInput.value = imagePath;
        syncFromIframe();
        markDirty();
      });
    });

  }

  // Expand buttons — event delegation (avoids re-binding issues)
  treePropsEl.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-expand-prop]');
    if (!btn) return;

    var prop = btn.getAttribute('data-expand-prop');
    var field = btn.closest('.bld-props__field');
    var input = field.querySelector('[data-prop="' + prop + '"]');
    if (!input) return;

    var isInput = input.tagName.toLowerCase() === 'input';
    var val = input.value;

    if (isInput) {
      // Replace input with textarea
      var ta = document.createElement('textarea');
      ta.className = 'bld-props__textarea';
      ta.setAttribute('data-prop', prop);
      ta.value = val;
      ta.rows = 4;
      input.replaceWith(ta);
      btn.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="12" height="12"><polyline points="6 12 6 10 4 10"/><polyline points="10 4 10 6 12 6"/><line x1="6" y1="10" x2="9" y2="7"/><line x1="10" y1="6" x2="7" y2="9"/></svg>';
      btn.title = 'Réduire';
      // Bind change event on the new textarea
      ta.addEventListener('change', function () {
        var el = resolveElement(selectedPath);
        if (!el) return;
        pushUndo();
        if (prop === 'class') el.className = ta.value;
        else if (prop === 'id') el.id = ta.value;
        else if (prop === 'href') el.setAttribute('href', ta.value);
        else if (prop === 'src') el.setAttribute('src', ta.value);
        else if (prop === 'alt') el.setAttribute('alt', ta.value);
        syncFromIframe();
        buildAndRenderDomTree();
        selectedPath = getCssPath(el);
        renderPropsPanel();
        markDirty();
      });
    } else {
      // Replace textarea with input
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'bld-props__input';
      inp.setAttribute('data-prop', prop);
      inp.value = val;
      input.replaceWith(inp);
      btn.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="12" height="12"><polyline points="4 10 4 12 6 12"/><polyline points="12 6 12 4 10 4"/><line x1="4" y1="12" x2="7" y2="9"/><line x1="12" y1="4" x2="9" y2="7"/></svg>';
      btn.title = 'Agrandir';
      // Bind change event on the new input
      inp.addEventListener('change', function () {
        var el = resolveElement(selectedPath);
        if (!el) return;
        pushUndo();
        if (prop === 'class') el.className = inp.value;
        else if (prop === 'id') el.id = inp.value;
        else if (prop === 'href') el.setAttribute('href', inp.value);
        else if (prop === 'src') el.setAttribute('src', inp.value);
        else if (prop === 'alt') el.setAttribute('alt', inp.value);
        syncFromIframe();
        buildAndRenderDomTree();
        selectedPath = getCssPath(el);
        renderPropsPanel();
        markDirty();
      });
    }
  });

  function escapeAttr(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  /* ══════════════════════════════════════
     MEDIA PICKER (modal)
     ══════════════════════════════════════ */

  var mediaPickerCallback = null;

  function openMediaPicker(callback) {
    mediaPickerCallback = callback;
    var overlay = document.getElementById('bldMediaPickerOverlay');
    if (!overlay) return;
    overlay.classList.add('bld-modal-overlay--visible');
    loadMediaGrid();
  }

  function closeMediaPicker() {
    var overlay = document.getElementById('bldMediaPickerOverlay');
    if (overlay) overlay.classList.remove('bld-modal-overlay--visible');
    mediaPickerCallback = null;
  }

  function loadMediaGrid() {
    var grid = document.getElementById('mediaPickerGrid');
    if (!grid) return;
    grid.innerHTML = '<div class="bld-lib__loading">Chargement...</div>';

    BuilderAPI.mediaList().then(function (resp) {
      if (!resp.ok || !resp.files || resp.files.length === 0) {
        grid.innerHTML = '<div class="bld-media__empty">Aucune image. Uploadez des fichiers via la médiathèque.</div>';
        return;
      }
      var html = '<div class="bld-media-grid">';
      resp.files.forEach(function (file) {
        html += '<div class="bld-media-grid__item" data-media-path="' + escapeAttr(file.path) + '">';
        html += '<img src="/' + escapeAttr(file.path) + '" alt="' + escapeAttr(file.name) + '" loading="lazy">';
        html += '<span class="bld-media-grid__name">' + escapeHtml(file.name) + '</span>';
        html += '</div>';
      });
      html += '</div>';
      grid.innerHTML = html;

      // Bind click
      grid.querySelectorAll('[data-media-path]').forEach(function (item) {
        item.addEventListener('click', function () {
          var path = '/' + item.getAttribute('data-media-path');
          if (mediaPickerCallback) mediaPickerCallback(path);
          closeMediaPicker();
        });
      });
    }).catch(function () {
      grid.innerHTML = '<div class="bld-media__empty">Erreur de chargement.</div>';
    });
  }

  /* ══════════════════════════════════════
     SAVE
     ══════════════════════════════════════ */

  async function savePage() {
    if (!currentPath) return;

    // Sync depuis l'iframe si possible
    syncFromIframe();

    var html = reconstructHtml(true);
    try {
      await BuilderAPI.pageWrite(currentPath, html);

      // Mettre a jour le registre
      var reg = BuilderApp.state.registry;
      if (reg && reg.pages && reg.pages[currentPath]) {
        reg.pages[currentPath].updatedAt = new Date().toISOString();
        await BuilderApp.saveRegistry();
      }

      BuilderApp.showToast('Page sauvegardée', 'success');
      if (window.BuilderApp && BuilderApp.setEditorDirty) {
        BuilderApp.setEditorDirty(false);
      }
      // Reset undo stacks on save
      undoStack = [];
      redoStack = [];
    } catch (e) {
      BuilderApp.showToast('Erreur : ' + e.message, 'error');
    }
  }

  /* ══════════════════════════════════════
     TOOLBAR EVENTS
     ══════════════════════════════════════ */

  document.getElementById('btnSavePage').addEventListener('click', savePage);

  document.getElementById('btnBackToPages').addEventListener('click', function () {
    BuilderApp.switchPanel('pages');
  });

  document.getElementById('btnToggleCatalog').addEventListener('click', function () {
    catalogOpen = !catalogOpen;
    editorLayout.classList.toggle('bld-editor--catalog-open', catalogOpen);
  });

  document.getElementById('btnAddSection').addEventListener('click', function () {
    if (!catalogOpen) {
      catalogOpen = true;
      editorLayout.classList.add('bld-editor--catalog-open');
    }
  });

  // Responsive viewport toggle
  var responsiveToggle = document.getElementById('responsiveToggle');
  var canvasWidthInput = document.getElementById('canvasWidthInput');
  var viewportWidths = {};
  var currentViewport = 'desktop';

  // Lire les breakpoints dynamiquement depuis les CSS custom properties
  (function initBreakpoints() {
    var styles = getComputedStyle(document.documentElement);
    var bpTablet = parseInt(styles.getPropertyValue('--bp-tablet')) || 991;
    var bpMobileLandscape = parseInt(styles.getPropertyValue('--bp-mobile-landscape')) || 767;
    var bpMobile = parseInt(styles.getPropertyValue('--bp-mobile')) || 478;

    viewportWidths = {
      desktop: '100%',
      tablet: bpTablet + 'px',
      mobileLandscape: bpMobileLandscape + 'px',
      mobile: bpMobile + 'px'
    };
  })();

  /** Met à jour l'affichage de la taille du canvas */
  function updateCanvasWidthDisplay() {
    if (!canvasWidthInput) return;
    var w = iframe.offsetWidth;
    canvasWidthInput.value = w;
  }

  // Observer le resize de l'iframe pour afficher la taille en temps réel
  var canvasResizeObserver = new ResizeObserver(function () {
    updateCanvasWidthDisplay();
  });
  canvasResizeObserver.observe(iframe);

  if (responsiveToggle) {
    responsiveToggle.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-viewport]');
      if (!btn) return;
      var viewport = btn.getAttribute('data-viewport');
      currentViewport = viewport;
      var canvasEl = document.querySelector('.bld-editor__canvas');

      // Mettre à jour le bouton actif
      responsiveToggle.querySelectorAll('.bld-responsive-toggle__btn').forEach(function (b) {
        b.classList.toggle('bld-responsive-toggle__btn--active', b === btn);
      });

      // Appliquer la largeur à l'iframe
      if (viewport === 'desktop') {
        iframe.style.maxWidth = '';
        iframe.style.width = '';
        iframe.style.margin = '';
        canvasEl.classList.remove('bld-editor__canvas--responsive');
      } else {
        iframe.style.maxWidth = viewportWidths[viewport] || '100%';
        iframe.style.width = '';
        iframe.style.margin = '0 auto';
        canvasEl.classList.add('bld-editor__canvas--responsive');
      }
      setTimeout(updateCanvasWidthDisplay, 50);
    });
  }

  // Saisie manuelle de la largeur du canvas
  if (canvasWidthInput) {
    canvasWidthInput.addEventListener('change', function () {
      var w = parseInt(canvasWidthInput.value);
      if (!w || w < 320) w = 320;
      if (w > 2560) w = 2560;
      var canvasEl = document.querySelector('.bld-editor__canvas');

      iframe.style.maxWidth = w + 'px';
      iframe.style.width = w + 'px';
      iframe.style.margin = '0 auto';
      canvasEl.classList.add('bld-editor__canvas--responsive');

      // Décocher tous les boutons viewport (mode custom)
      if (responsiveToggle) {
        responsiveToggle.querySelectorAll('.bld-responsive-toggle__btn').forEach(function (b) {
          b.classList.remove('bld-responsive-toggle__btn--active');
        });
      }
      currentViewport = 'custom';
      setTimeout(updateCanvasWidthDisplay, 50);
    });

    canvasWidthInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        canvasWidthInput.blur();
      }
    });
  }

  /* ---------- Resizable panels ---------- */
  (function initResizeHandles() {
    var editorEl = document.getElementById('editorLayout');
    var sectionsEl = document.getElementById('editorSections');
    var propsEl = document.getElementById('domTreeProps');
    var resizeSections = document.getElementById('resizeSections');
    var resizeProps = document.getElementById('resizeProps');

    // Horizontal resize : structure sidebar width
    if (resizeSections && editorEl) {
      var draggingH = false;
      resizeSections.addEventListener('mousedown', function (e) {
        e.preventDefault();
        draggingH = true;
        resizeSections.classList.add('bld-resize-handle--active');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      });
      document.addEventListener('mousemove', function (e) {
        if (!draggingH) return;
        var rect = editorEl.getBoundingClientRect();
        var x = e.clientX - rect.left;
        x = Math.max(200, Math.min(400, x));
        editorEl.style.setProperty('--sections-width', x + 'px');
      });
      document.addEventListener('mouseup', function () {
        if (draggingH) {
          draggingH = false;
          resizeSections.classList.remove('bld-resize-handle--active');
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          updateCanvasWidthDisplay();
        }
      });
    }

    // Vertical resize : properties panel height
    if (resizeProps && sectionsEl && propsEl) {
      var draggingV = false;
      resizeProps.addEventListener('mousedown', function (e) {
        e.preventDefault();
        draggingV = true;
        resizeProps.classList.add('bld-resize-handle--active');
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
      });
      document.addEventListener('mousemove', function (e) {
        if (!draggingV) return;
        var rect = sectionsEl.getBoundingClientRect();
        var totalH = rect.height;
        var y = e.clientY - rect.top;
        // propsHeight = espace restant sous le point de drag
        var propsH = totalH - y;
        propsH = Math.max(100, Math.min(400, propsH));
        sectionsEl.style.setProperty('--props-height', propsH + 'px');
      });
      document.addEventListener('mouseup', function () {
        if (draggingV) {
          draggingV = false;
          resizeProps.classList.remove('bld-resize-handle--active');
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
        }
      });
    }
    // Canvas resize : drag le bord droit de l'iframe
    var canvasResizeHandle = document.getElementById('canvasResize');
    var canvasEl = document.querySelector('.bld-editor__canvas');
    if (canvasResizeHandle && canvasEl) {
      var draggingCanvas = false;
      canvasResizeHandle.addEventListener('mousedown', function (e) {
        e.preventDefault();
        draggingCanvas = true;
        canvasResizeHandle.classList.add('bld-canvas-resize--active');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      });
      document.addEventListener('mousemove', function (e) {
        if (!draggingCanvas) return;
        var rect = canvasEl.getBoundingClientRect();
        var w = (e.clientX - rect.left);
        w = Math.max(320, Math.min(w, rect.width));
        iframe.style.maxWidth = w + 'px';
        iframe.style.width = w + 'px';
        iframe.style.margin = '0 auto';
        canvasEl.classList.add('bld-editor__canvas--responsive');
        // Décocher les boutons viewport
        if (responsiveToggle) {
          responsiveToggle.querySelectorAll('.bld-responsive-toggle__btn').forEach(function (b) {
            b.classList.remove('bld-responsive-toggle__btn--active');
          });
        }
        currentViewport = 'custom';
        updateCanvasWidthDisplay();
      });
      document.addEventListener('mouseup', function () {
        if (draggingCanvas) {
          draggingCanvas = false;
          canvasResizeHandle.classList.remove('bld-canvas-resize--active');
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
        }
      });
    }
  })();

  // Raccourcis clavier
  document.addEventListener('keydown', function (e) {
    if (BuilderApp.state.currentPanel !== 'editor' || !currentPath) return;

    // Ctrl/Cmd+S : sauvegarder
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      savePage();
      return;
    }
    // Ctrl/Cmd+Z : undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
      return;
    }
    // Ctrl/Cmd+Shift+Z : redo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
      e.preventDefault();
      redo();
      return;
    }
  });

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  /* ══════════════════════════════════════
     PUBLIC API
     ══════════════════════════════════════ */

  window.BuilderCanvas = {
    refresh: function () {
      var path = BuilderApp.state.editingPage;
      if (path && path !== currentPath) {
        loadPage(path);
      }
    },
    loadPage: loadPage,
    savePage: savePage
  };

})();
