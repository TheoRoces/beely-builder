/* ==========================================================================
   BUILDER APP — Shell principal, navigation, toasts, état global
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- State global ---------- */
  var state = {
    currentPanel: 'dashboard',
    registry: null,
    siteName: ''
  };

  /* ---------- DOM refs ---------- */
  var sidebarLinks = document.querySelectorAll('.bld-sidebar__link[data-panel]');
  var panels = document.querySelectorAll('.bld-panel');
  var siteNameEl = document.getElementById('siteName');

  /* ---------- Navigation ---------- */
  function switchPanel(panelId, pushState) {
    state.currentPanel = panelId;

    sidebarLinks.forEach(function (link) {
      link.classList.toggle('bld-sidebar__link--active', link.getAttribute('data-panel') === panelId);
    });

    panels.forEach(function (panel) {
      panel.classList.toggle('bld-panel--active', panel.getAttribute('data-panel-id') === panelId);
    });

    // Hash URL pour deep linking
    if (pushState !== false) {
      window.location.hash = panelId;
    }

    // Callbacks au changement de panel
    if (panelId === 'dashboard' && window.BuilderDashboard) {
      window.BuilderDashboard.refresh();
    }
    if (panelId === 'pages' && window.BuilderPages) {
      window.BuilderPages.refresh();
    }
    if (panelId === 'configurator' && window.BuilderConfigurator) {
      window.BuilderConfigurator.refresh();
    }
    // Panels bibliothèque
    if (panelId.indexOf('lib-') === 0 && window.BuilderLibrary) {
      window.BuilderLibrary.refresh(panelId);
    }
  }

  sidebarLinks.forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      switchPanel(link.getAttribute('data-panel'));
    });
  });

  // Lire le hash au chargement — activer visuellement le panel (sidebar + affichage)
  // mais NE PAS appeler les callbacks (refresh) avant que init() ait chargé les données
  var initialHash = window.location.hash.replace('#', '') || 'dashboard';
  var validPanels = ['dashboard', 'pages', 'configurator', 'lib-icons', 'lib-media'];
  var initialPanel = validPanels.indexOf(initialHash) !== -1 ? initialHash : 'dashboard';

  // Activation visuelle immédiate (sans callbacks)
  state.currentPanel = initialPanel;
  sidebarLinks.forEach(function (link) {
    link.classList.toggle('bld-sidebar__link--active', link.getAttribute('data-panel') === initialPanel);
  });
  panels.forEach(function (panel) {
    panel.classList.toggle('bld-panel--active', panel.getAttribute('data-panel-id') === initialPanel);
  });

  window.addEventListener('hashchange', function () {
    var hash = window.location.hash.replace('#', '');
    if (hash && hash !== state.currentPanel) {
      switchPanel(hash, false);
    }
  });

  /* ---------- Toast ---------- */
  var toastTimer;
  function showToast(msg, type) {
    var t = document.getElementById('bldToast');
    t.textContent = msg;
    t.className = 'bld-toast bld-toast--visible';
    if (type === 'error') t.classList.add('bld-toast--error');
    if (type === 'success') t.classList.add('bld-toast--success');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('bld-toast--visible'); }, 3000);
  }

  /* ---------- Migration V1 → V2 (dossiers indépendants) ---------- */
  function migrateV1toV2(reg) {
    if (reg.version >= 2) return reg;
    var folders = {};
    Object.keys(reg.pages).forEach(function (path) {
      var slash = path.lastIndexOf('/');
      if (slash !== -1) {
        var folder = path.substring(0, slash);
        if (!folders[folder]) folders[folder] = { order: Object.keys(folders).length, collapsed: false };
      }
      // Reporter collapsed de la page-parent vers le dossier
      var page = reg.pages[path];
      if (page.collapsed !== undefined) {
        var folderName = path.replace(/\.html$/, '');
        if (folders[folderName]) folders[folderName].collapsed = page.collapsed;
        delete page.collapsed;
      }
      delete page.parent;
    });
    reg.version = 2;
    reg.folders = folders;
    return reg;
  }

  /* ---------- Init ---------- */
  async function init() {
    // Charger le nom du site
    try {
      var resp = await BuilderAPI.cfgRead('config-site.js');
      if (resp.ok && resp.content) {
        var match = resp.content.match(/name:\s*'([^']*)'/);
        if (match) {
          state.siteName = match[1];
          if (siteNameEl) siteNameEl.textContent = match[1] || 'Mon Site';
        }
      }
    } catch (e) { /* silencer */ }

    // Charger le registre
    try {
      var regResp = await BuilderAPI.registryRead();
      if (regResp.ok && regResp.registry) {
        state.registry = migrateV1toV2(regResp.registry);
        // Toujours synchroniser les flags serveur (readOnly, isTemplate)
        await syncRegistryFlags();
      } else {
        // Première ouverture : créer le registre depuis le filesystem
        await syncRegistryFromDisk();
      }
    } catch (e) {
      console.error('Erreur chargement registre:', e);
    }

    // Garde-fou : la homepage doit toujours être à la racine et en première position
    var homepage = state.registry && state.registry.homepage || 'index.html';
    if (state.registry && state.registry.pages && state.registry.pages[homepage]) {
      var homePage = state.registry.pages[homepage];
      if (homePage.order !== undefined && homePage.order > 0) {
        homePage.order = -1;
        await BuilderAPI.registryWrite(state.registry);
      }
    }

    // Déclencher les callbacks du panel actif (données maintenant chargées)
    switchPanel(state.currentPanel, false);
  }

  async function syncRegistryFromDisk() {
    var resp = await BuilderAPI.pagesList();
    if (!resp.ok) return;

    var now = new Date().toISOString();
    var folders = {};

    // Détecter les dossiers depuis les chemins des pages + dossiers du serveur
    (resp.folders || []).forEach(function (f) {
      folders[f] = { order: Object.keys(folders).length, collapsed: false };
    });

    var registry = {
      version: 2,
      homepage: 'index.html',
      folders: folders,
      deploys: {
        prod: { lastDeploy: null, status: null },
        preprod: { lastDeploy: null, status: null },
        git: { lastPush: null, status: null }
      },
      pages: {}
    };

    resp.pages.forEach(function (page, i) {
      var slug = page.path.replace(/\.html$/, '');
      registry.pages[page.path] = {
        title: page.title || slug,
        slug: slug,
        metaTitle: '',
        metaDescription: '',
        featuredImage: '',
        status: 'published',
        noindex: false,
        customHead: '',
        customBody: '',
        order: i,
        readOnly: page.readOnly || false,
        isTemplate: page.isTemplate || false,
        createdAt: now,
        updatedAt: now
      };

      // S'assurer que le dossier parent est enregistré
      var slash = page.path.lastIndexOf('/');
      if (slash !== -1) {
        var folder = page.path.substring(0, slash);
        if (!registry.folders[folder]) {
          registry.folders[folder] = { order: Object.keys(registry.folders).length, collapsed: false };
        }
      }
    });

    state.registry = registry;
    await BuilderAPI.registryWrite(registry);
  }

  /** Synchronise readOnly/isTemplate depuis le serveur sur un registre existant */
  async function syncRegistryFlags() {
    try {
      var resp = await BuilderAPI.pagesList();
      if (!resp.ok) return;
      var reg = state.registry;
      var now = new Date().toISOString();
      var diskPaths = resp.pages.map(function (p) { return p.path; });

      // S'assurer que folders existe
      if (!reg.folders) reg.folders = {};

      // Synchroniser les dossiers depuis le serveur
      (resp.folders || []).forEach(function (f) {
        if (!reg.folders[f]) {
          reg.folders[f] = { order: Object.keys(reg.folders).length, collapsed: false };
        }
      });

      // Ajouter les nouvelles pages + mettre à jour les flags
      resp.pages.forEach(function (page) {
        if (!reg.pages[page.path]) {
          var pageCount = Object.keys(reg.pages).length;
          reg.pages[page.path] = {
            title: page.title || page.path.replace('.html', ''),
            slug: page.path.replace(/\.html$/, ''),
            metaTitle: '', metaDescription: '', featuredImage: '',
            status: 'published', noindex: false,
            customHead: '', customBody: '',
            order: pageCount,
            readOnly: page.readOnly || false,
            isTemplate: page.isTemplate || false,
            createdAt: now, updatedAt: now
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

      // Supprimer les pages du registre qui n'existent plus
      Object.keys(reg.pages).forEach(function (path) {
        if (diskPaths.indexOf(path) === -1) {
          delete reg.pages[path];
        }
      });

      // Supprimer les dossiers qui n'existent plus sur le serveur
      var serverFolders = resp.folders || [];
      Object.keys(reg.folders).forEach(function (f) {
        if (serverFolders.indexOf(f) === -1) {
          // Vérifier aussi si des pages sont dans ce dossier
          var hasPages = Object.keys(reg.pages).some(function (p) {
            return p.indexOf(f + '/') === 0;
          });
          if (!hasPages) delete reg.folders[f];
        }
      });

      await BuilderAPI.registryWrite(reg);
    } catch (e) {
      console.error('Erreur sync flags registre:', e);
    }
  }

  /* ---------- API publique ---------- */
  window.BuilderApp = {
    state: state,
    switchPanel: switchPanel,
    showToast: showToast,
    init: init,
    saveRegistry: function () {
      return BuilderAPI.registryWrite(state.registry);
    }
  };

  // Carte "Configurer le site" → panel configurateur
  var cfgAction = document.getElementById('actionConfigurator');
  if (cfgAction) {
    cfgAction.addEventListener('click', function () { switchPanel('configurator'); });
  }

  // Lancer l'init
  init();

})();
