/* ==========================================================================
   BUILDER LIBRARY — Wireframes, Icônes, Composants, Éléments, Animations
   ========================================================================== */
(function () {
  'use strict';

  /* ══════════════════════════════════════
     ÉTAT & CACHE
     ══════════════════════════════════════ */

  var wfCatalog = null;
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
        svgCache[key] = svg;
        return svg;
      })
      .catch(function () { return '<svg viewBox="0 0 24 24" width="24" height="24"></svg>'; });
  }

  /* ══════════════════════════════════════
     WIREFRAMES
     ══════════════════════════════════════ */

  async function renderWireframes() {
    var contentEl = document.getElementById('libWfContent');
    if (!contentEl) return;

    if (!wfCatalog) {
      contentEl.innerHTML = '<div class="bld-lib__loading">Chargement du catalogue...</div>';
      try {
        var resp = await BuilderAPI.wireframesCatalog();
        if (resp.ok) wfCatalog = resp.categories;
      } catch (e) { wfCatalog = []; }
    }

    if (!wfCatalog || wfCatalog.length === 0) {
      contentEl.innerHTML = '<div class="bld-lib__empty">Aucun wireframe trouvé.</div>';
      return;
    }

    var totalCount = wfCatalog.reduce(function (sum, c) { return sum + c.count; }, 0);

    var html = '<p class="bld-lib__count">' + totalCount + ' wireframes dans ' + wfCatalog.length + ' catégories</p>';
    wfCatalog.forEach(function (cat) {
      html += '<div class="bld-lib__category" data-cat="' + cat.slug + '">'
        + '<div class="bld-lib__cat-header">'
        + '<span>' + escapeHtml(cat.name) + '</span>'
        + '<span class="bld-lib__cat-count">' + cat.count + '</span>'
        + '</div>'
        + '<div class="bld-lib__cat-items">';

      cat.files.forEach(function (file) {
        var label = file.replace('.html', '').replace(/-/g, ' ');
        html += '<div class="bld-lib__wf-item" data-cat="' + cat.slug + '" data-file="' + file + '">'
          + '<div class="bld-lib__wf-preview">'
          + '<iframe src="/wireframes/' + cat.slug + '/' + file + '" loading="lazy" sandbox="allow-same-origin" tabindex="-1" title="Aperçu : ' + escapeHtml(label) + '"></iframe>'
          + '</div>'
          + '<div class="bld-lib__wf-footer">'
          + '<span class="bld-lib__wf-name">' + escapeHtml(label) + '</span>'
          + '<button class="bld-btn bld-btn--sm bld-lib__copy-btn" data-copy-wf="' + cat.slug + '/' + file + '">Copier</button>'
          + '</div>'
          + '</div>';
      });

      html += '</div></div>';
    });

    contentEl.innerHTML = html;

    // Toggle catégories
    contentEl.querySelectorAll('.bld-lib__cat-header').forEach(function (header) {
      header.addEventListener('click', function () {
        header.parentElement.classList.toggle('bld-lib__category--open');
      });
    });

    // Copier wireframe
    contentEl.querySelectorAll('[data-copy-wf]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var parts = btn.getAttribute('data-copy-wf').split('/');
        btn.textContent = '...';
        BuilderAPI.wireframeRead(parts[0], parts[1]).then(function (resp) {
          if (resp.ok && resp.content) {
            copyToClipboard(resp.content);
          }
          btn.textContent = 'Copier';
        }).catch(function () { btn.textContent = 'Copier'; });
      });
    });

    // Recherche
    if (!initialized['wf-search']) {
      initialized['wf-search'] = true;
      var searchInput = document.getElementById('libWfSearch');
      if (searchInput) {
        searchInput.addEventListener('input', function () {
          filterWireframes(searchInput.value.toLowerCase());
        });
      }
    }
  }

  function filterWireframes(query) {
    var contentEl = document.getElementById('libWfContent');
    if (!contentEl) return;
    contentEl.querySelectorAll('.bld-lib__category').forEach(function (catEl) {
      var hasVisible = false;
      catEl.querySelectorAll('.bld-lib__wf-item').forEach(function (item) {
        var name = item.querySelector('.bld-lib__wf-name').textContent.toLowerCase();
        var catName = catEl.querySelector('.bld-lib__cat-header span').textContent.toLowerCase();
        var match = !query || name.indexOf(query) !== -1 || catName.indexOf(query) !== -1;
        item.style.display = match ? '' : 'none';
        if (match) hasVisible = true;
      });
      catEl.style.display = hasVisible ? '' : 'none';
      if (hasVisible && query) catEl.classList.add('bld-lib__category--open');
    });
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

    // Fallback: si l'API ne retourne rien, essayer de scanner manuellement
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
                var name = card.getAttribute('data-icon-name');
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
     COMPOSANTS
     ══════════════════════════════════════ */

  var COMPONENTS = [
    {
      name: 'Header',
      description: 'Barre de navigation avec logo, liens, CTA, recherche et mode sombre.',
      variants: [
        { name: 'Standard', snippet: '<div data-component="header"\n     data-site-name="Mon Site"\n     data-logo-link="/index.html"\n     data-cta-text="Contact"\n     data-cta-link="/contact.html"\n     data-search="true"\n     data-darkmode="true">\n  <template data-slot="nav">\n    <a href="/index.html">Accueil</a>\n    <a href="/services.html">Services</a>\n    <a href="/blog.html">Blog</a>\n    <a href="/contact.html">Contact</a>\n  </template>\n</div>' },
        { name: 'Sans CTA', snippet: '<div data-component="header"\n     data-site-name="Mon Site"\n     data-logo-link="/index.html"\n     data-darkmode="true">\n  <template data-slot="nav">\n    <a href="/index.html">Accueil</a>\n    <a href="/services.html">Services</a>\n    <a href="/contact.html">Contact</a>\n  </template>\n</div>' },
        { name: 'Minimal', snippet: '<div data-component="header"\n     data-site-name="Mon Site"\n     data-logo-link="/index.html">\n  <template data-slot="nav">\n    <a href="/index.html">Accueil</a>\n    <a href="/contact.html">Contact</a>\n  </template>\n</div>' }
      ]
    },
    {
      name: 'Footer',
      description: 'Pied de page avec colonnes de liens et copyright auto-mis à jour.',
      variants: [
        { name: 'Multi-colonnes', snippet: '<div data-component="footer"\n     data-site-name="Mon Site"\n     data-copyright="Mon Entreprise">\n  <template data-slot="links">\n    <div>\n      <h4>Navigation</h4>\n      <a href="/index.html">Accueil</a>\n      <a href="/services.html">Services</a>\n      <a href="/contact.html">Contact</a>\n    </div>\n    <div>\n      <h4>Légal</h4>\n      <a href="/mentions-legales.html">Mentions légales</a>\n      <a href="/confidentialite.html">Confidentialité</a>\n    </div>\n  </template>\n</div>' },
        { name: 'Simple', snippet: '<div data-component="footer"\n     data-site-name="Mon Site"\n     data-copyright="Mon Entreprise">\n  <template data-slot="links">\n    <div>\n      <a href="/mentions-legales.html">Mentions légales</a>\n      <a href="/confidentialite.html">Confidentialité</a>\n    </div>\n  </template>\n</div>' }
      ]
    },
    {
      name: 'Card',
      description: 'Carte réutilisable avec image, titre, texte et actions.',
      variants: [
        { name: 'Complète', snippet: '<div data-component="card">\n  <template data-slot="image">\n    <img src="/assets/images/placeholder.jpg" alt="Image">\n  </template>\n  <template data-slot="content">\n    <h3>Titre de la carte</h3>\n    <p>Description courte de la carte.</p>\n  </template>\n  <template data-slot="actions">\n    <a href="#" class="btn btn--primary">En savoir plus</a>\n  </template>\n</div>' },
        { name: 'Sans image', snippet: '<div data-component="card">\n  <template data-slot="content">\n    <h3>Titre de la carte</h3>\n    <p>Description courte.</p>\n  </template>\n  <template data-slot="actions">\n    <a href="#" class="btn btn--primary">Voir</a>\n  </template>\n</div>' },
        { name: 'Texte seul', snippet: '<div data-component="card">\n  <template data-slot="content">\n    <h3>Titre</h3>\n    <p>Contenu de la carte sans image ni actions.</p>\n  </template>\n</div>' }
      ]
    },
    {
      name: 'Docs Sidebar',
      description: 'Sidebar de navigation pour pages de documentation.',
      variants: [
        { name: 'Standard', snippet: '<div data-component="docs-sidebar"\n     data-title="Documentation">\n  <template data-slot="links">\n    <a href="/docs/getting-started.html">Démarrage</a>\n    <a href="/docs/tokens.html">Design Tokens</a>\n    <a href="/docs/components.html">Composants</a>\n    <a href="/docs/elements.html">Éléments</a>\n  </template>\n</div>' }
      ]
    }
  ];

  function renderComponents() {
    var contentEl = document.getElementById('libComponentContent');
    if (!contentEl) return;

    var html = '';
    COMPONENTS.forEach(function (comp) {
      html += '<div class="bld-lib__comp-card">'
        + '<div class="bld-lib__comp-header">'
        + '<h3 class="bld-lib__comp-name">' + escapeHtml(comp.name) + '</h3>'
        + '<p class="bld-lib__comp-desc">' + escapeHtml(comp.description) + '</p>'
        + '</div>'
        + '<div class="bld-lib__comp-variants">';

      comp.variants.forEach(function (variant, vi) {
        html += '<div class="bld-lib__variant">'
          + '<div class="bld-lib__variant-header">'
          + '<span class="bld-lib__variant-name">' + escapeHtml(variant.name) + '</span>'
          + '<button class="bld-btn bld-btn--sm bld-lib__copy-btn" data-copy-comp="' + COMPONENTS.indexOf(comp) + '-' + vi + '">Copier</button>'
          + '</div>'
          + '<pre class="bld-lib__snippet-code"><code>' + escapeHtml(variant.snippet) + '</code></pre>'
          + '</div>';
      });

      html += '</div></div>';
    });

    contentEl.innerHTML = html;

    contentEl.querySelectorAll('[data-copy-comp]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var parts = btn.getAttribute('data-copy-comp').split('-');
        var comp = COMPONENTS[parseInt(parts[0])];
        if (comp && comp.variants[parseInt(parts[1])]) {
          copyToClipboard(comp.variants[parseInt(parts[1])].snippet);
        }
      });
    });
  }

  /* ══════════════════════════════════════
     ÉLÉMENTS
     ══════════════════════════════════════ */

  var ELEMENTS = [
    {
      name: 'Popup / Modal',
      description: 'Fenêtre modale avec overlay.',
      options: 'Positions : center, left, right, top, bottom',
      snippet: '<button data-popup-target="demo">Ouvrir la modal</button>\n\n<div class="popup" data-popup="demo" data-popup-position="center">\n  <div class="popup__overlay"></div>\n  <div class="popup__content">\n    <button class="popup__close" data-popup-close>&times;</button>\n    <h2>Titre de la modal</h2>\n    <p>Contenu de la modal...</p>\n  </div>\n</div>'
    },
    {
      name: 'Accordion',
      description: 'Sections dépliables/repliables.',
      options: 'Ajoutez data-accordion-multiple pour ouvrir plusieurs sections',
      snippet: '<div class="accordion" data-accordion data-accordion-multiple>\n  <div class="accordion__item">\n    <button class="accordion__trigger">Section 1</button>\n    <div class="accordion__content">\n      <div class="accordion__inner">\n        <p>Contenu de la section 1.</p>\n      </div>\n    </div>\n  </div>\n  <div class="accordion__item">\n    <button class="accordion__trigger">Section 2</button>\n    <div class="accordion__content">\n      <div class="accordion__inner">\n        <p>Contenu de la section 2.</p>\n      </div>\n    </div>\n  </div>\n</div>'
    },
    {
      name: 'Tabs',
      description: 'Navigation par onglets avec contenu dynamique.',
      options: 'Ajoutez autant d\'onglets que nécessaire',
      snippet: '<div class="tabs" data-tabs>\n  <div class="tabs__nav">\n    <button class="tabs__btn tabs__btn--active" data-tab="tab1">Onglet 1</button>\n    <button class="tabs__btn" data-tab="tab2">Onglet 2</button>\n    <button class="tabs__btn" data-tab="tab3">Onglet 3</button>\n  </div>\n  <div class="tabs__panel tabs__panel--active" data-tab-panel="tab1">\n    <p>Contenu onglet 1.</p>\n  </div>\n  <div class="tabs__panel" data-tab-panel="tab2">\n    <p>Contenu onglet 2.</p>\n  </div>\n  <div class="tabs__panel" data-tab-panel="tab3">\n    <p>Contenu onglet 3.</p>\n  </div>\n</div>'
    },
    {
      name: 'Slider / Carousel',
      description: 'Carrousel responsive avec navigation.',
      options: 'data-slider-items, data-slider-gap, data-slider-autoplay',
      snippet: '<div class="slider" data-slider data-slider-items="3" data-slider-gap="24" data-slider-autoplay="5000">\n  <div class="slider__track">\n    <div class="slider__slide">\n      <p>Slide 1</p>\n    </div>\n    <div class="slider__slide">\n      <p>Slide 2</p>\n    </div>\n    <div class="slider__slide">\n      <p>Slide 3</p>\n    </div>\n  </div>\n  <button class="slider__prev">&larr;</button>\n  <button class="slider__next">&rarr;</button>\n</div>'
    },
    {
      name: 'Tooltip',
      description: 'Info-bulle au survol.',
      options: 'Positions : top, bottom, left, right',
      snippet: '<span data-tooltip="Texte du tooltip" data-tooltip-position="top">\n  Survolez-moi\n</span>'
    }
  ];

  function renderElements() {
    var contentEl = document.getElementById('libElementContent');
    if (!contentEl) return;

    var html = '';
    ELEMENTS.forEach(function (el, i) {
      html += '<div class="bld-lib__comp-card">'
        + '<div class="bld-lib__comp-header">'
        + '<div style="display:flex; align-items:center; justify-content:space-between;">'
        + '<h3 class="bld-lib__comp-name">' + escapeHtml(el.name) + '</h3>'
        + '<button class="bld-btn bld-btn--sm bld-lib__copy-btn" data-copy-el="' + i + '">Copier</button>'
        + '</div>'
        + '<p class="bld-lib__comp-desc">' + escapeHtml(el.description) + '</p>'
        + (el.options ? '<p class="bld-lib__comp-options">' + escapeHtml(el.options) + '</p>' : '')
        + '</div>'
        + '<pre class="bld-lib__snippet-code"><code>' + escapeHtml(el.snippet) + '</code></pre>'
        + '</div>';
    });

    contentEl.innerHTML = html;

    contentEl.querySelectorAll('[data-copy-el]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.getAttribute('data-copy-el'));
        if (ELEMENTS[idx]) copyToClipboard(ELEMENTS[idx].snippet);
      });
    });
  }

  /* ══════════════════════════════════════
     ANIMATIONS
     ══════════════════════════════════════ */

  var ANIMATIONS = [
    { value: 'anim-fade-in', label: 'Fade In' },
    { value: 'anim-fade-in-up', label: 'Fade In Up' },
    { value: 'anim-fade-in-down', label: 'Fade In Down' },
    { value: 'anim-fade-in-left', label: 'Fade In Left' },
    { value: 'anim-fade-in-right', label: 'Fade In Right' },
    { value: 'anim-scale-in', label: 'Scale In' },
    { value: 'anim-scale-in-up', label: 'Scale In Up' },
    { value: 'anim-slide-in-up', label: 'Slide In Up' },
    { value: 'anim-slide-in-down', label: 'Slide In Down' },
    { value: 'anim-slide-in-left', label: 'Slide In Left' },
    { value: 'anim-slide-in-right', label: 'Slide In Right' },
    { value: 'anim-rotate-in', label: 'Rotate In' }
  ];

  var DURATIONS = [
    { value: '', label: 'Par défaut (600ms)' },
    { value: 'anim--duration-fast', label: 'Rapide (300ms)' },
    { value: 'anim--duration-slow', label: 'Lent (1000ms)' },
    { value: 'anim--duration-slower', label: 'Très lent (1500ms)' }
  ];

  var EASINGS = [
    { value: '', label: 'Par défaut' },
    { value: 'anim--ease-bounce', label: 'Bounce' },
    { value: 'anim--ease-elastic', label: 'Elastic' },
    { value: 'anim--ease-smooth', label: 'Smooth' }
  ];

  var CLICK_ANIMS = [
    { value: 'anim-click-pulse', label: 'Pulse' },
    { value: 'anim-click-shake', label: 'Shake' },
    { value: 'anim-click-bounce', label: 'Bounce' },
    { value: 'anim-click-ripple', label: 'Ripple' }
  ];

  var animState = {
    type: 'anim-fade-in-up',
    duration: '',
    easing: '',
    delay: 0,
    exit: false
  };

  function renderAnimations() {
    var contentEl = document.getElementById('libAnimContent');
    if (!contentEl) return;

    var html = '';

    // ── Scroll animations ──
    html += '<div class="bld-anim">';
    html += '<h2 class="bld-anim__section-title">Animations au scroll</h2>';

    // Animation type grid
    html += '<div class="bld-anim__group"><label class="bld-field__label">Type d\'animation</label>';
    html += '<div class="bld-anim__type-grid">';
    ANIMATIONS.forEach(function (anim) {
      var active = animState.type === anim.value ? ' bld-anim__type--active' : '';
      html += '<button class="bld-anim__type' + active + '" data-anim-type="' + anim.value + '">' + anim.label + '</button>';
    });
    html += '</div></div>';

    // Duration
    html += '<div class="bld-anim__group"><label class="bld-field__label">Durée</label>';
    html += '<div class="bld-anim__options">';
    DURATIONS.forEach(function (d) {
      var active = animState.duration === d.value ? ' bld-anim__opt--active' : '';
      html += '<button class="bld-anim__opt' + active + '" data-anim-duration="' + d.value + '">' + d.label + '</button>';
    });
    html += '</div></div>';

    // Easing
    html += '<div class="bld-anim__group"><label class="bld-field__label">Easing</label>';
    html += '<div class="bld-anim__options">';
    EASINGS.forEach(function (e) {
      var active = animState.easing === e.value ? ' bld-anim__opt--active' : '';
      html += '<button class="bld-anim__opt' + active + '" data-anim-easing="' + e.value + '">' + e.label + '</button>';
    });
    html += '</div></div>';

    // Delay slider
    html += '<div class="bld-anim__group"><label class="bld-field__label">Délai</label>';
    html += '<div class="bld-anim__slider-wrap">';
    html += '<input type="range" class="bld-anim__slider" id="animDelaySlider" min="0" max="10" step="1" value="' + animState.delay + '">';
    html += '<span class="bld-anim__slider-value" id="animDelayValue">' + (animState.delay * 100) + 'ms</span>';
    html += '</div></div>';

    // Exit toggle
    html += '<div class="bld-anim__group">';
    html += '<label class="bld-field__checkbox"><input type="checkbox" id="animExitToggle"' + (animState.exit ? ' checked' : '') + '> Animation de sortie (rejoue au re-scroll)</label>';
    html += '</div>';

    // Preview
    html += '<div class="bld-anim__group"><label class="bld-field__label">Aperçu</label>';
    html += '<div class="bld-anim__preview-box">';
    html += '<div class="bld-anim__preview-item" id="animPreviewBox">Aperçu de l\'animation</div>';
    html += '<div class="bld-anim__preview-actions">';
    html += '<button class="bld-btn bld-btn--sm" id="animReplayBtn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg> Rejouer</button>';
    html += '</div>';
    html += '</div></div>';

    // Output
    html += '<div class="bld-anim__group"><label class="bld-field__label">Code à copier</label>';
    html += '<div class="bld-anim__output">';
    html += '<code id="animOutput"></code>';
    html += '<button class="bld-btn bld-btn--primary bld-btn--sm" id="animCopyBtn">Copier</button>';
    html += '</div></div>';

    // ── Click animations ──
    html += '<div class="bld-field__sep"></div>';
    html += '<h2 class="bld-anim__section-title">Animations au clic</h2>';
    html += '<div class="bld-anim__click-grid">';
    CLICK_ANIMS.forEach(function (ca) {
      html += '<div class="bld-anim__click-card" data-click-anim="' + ca.value + '">'
        + '<span>' + ca.label + '</span>'
        + '<button class="bld-btn bld-btn--sm bld-lib__copy-btn" data-copy-click="' + ca.value + '">Copier</button>'
        + '</div>';
    });
    html += '</div>';

    html += '</div>';

    contentEl.innerHTML = html;

    // Update output
    updateAnimOutput();

    // Bind events
    contentEl.querySelectorAll('[data-anim-type]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        animState.type = btn.getAttribute('data-anim-type');
        contentEl.querySelectorAll('[data-anim-type]').forEach(function (b) {
          b.classList.toggle('bld-anim__type--active', b === btn);
        });
        updateAnimOutput();
        replayPreview();
      });
    });

    contentEl.querySelectorAll('[data-anim-duration]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        animState.duration = btn.getAttribute('data-anim-duration');
        contentEl.querySelectorAll('[data-anim-duration]').forEach(function (b) {
          b.classList.toggle('bld-anim__opt--active', b === btn);
        });
        updateAnimOutput();
        replayPreview();
      });
    });

    contentEl.querySelectorAll('[data-anim-easing]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        animState.easing = btn.getAttribute('data-anim-easing');
        contentEl.querySelectorAll('[data-anim-easing]').forEach(function (b) {
          b.classList.toggle('bld-anim__opt--active', b === btn);
        });
        updateAnimOutput();
        replayPreview();
      });
    });

    var delaySlider = document.getElementById('animDelaySlider');
    if (delaySlider) {
      delaySlider.addEventListener('input', function () {
        animState.delay = parseInt(delaySlider.value);
        var label = document.getElementById('animDelayValue');
        if (label) label.textContent = (animState.delay * 100) + 'ms';
        updateAnimOutput();
      });
    }

    var exitToggle = document.getElementById('animExitToggle');
    if (exitToggle) {
      exitToggle.addEventListener('change', function () {
        animState.exit = exitToggle.checked;
        updateAnimOutput();
      });
    }

    var replayBtn = document.getElementById('animReplayBtn');
    if (replayBtn) {
      replayBtn.addEventListener('click', replayPreview);
    }

    var copyBtn = document.getElementById('animCopyBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var output = document.getElementById('animOutput');
        if (output) copyToClipboard(output.textContent);
      });
    }

    // Click animations
    contentEl.querySelectorAll('[data-copy-click]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var cls = btn.getAttribute('data-copy-click');
        copyToClipboard('class="' + cls + '"');
      });
    });

    // Initial preview
    replayPreview();
  }

  function getAnimClasses() {
    var classes = [animState.type];
    if (animState.duration) classes.push(animState.duration);
    if (animState.easing) classes.push(animState.easing);
    if (animState.delay > 0) classes.push('anim--delay-' + animState.delay);
    return classes;
  }

  function updateAnimOutput() {
    var output = document.getElementById('animOutput');
    if (!output) return;
    var classes = getAnimClasses();
    var code = 'class="' + classes.join(' ') + '"';
    if (animState.exit) code += ' data-anim-exit="true"';
    output.textContent = code;
  }

  function replayPreview() {
    var box = document.getElementById('animPreviewBox');
    if (!box) return;
    // Reset
    box.className = 'bld-anim__preview-item';
    box.classList.remove('anim--visible');
    // Force reflow
    void box.offsetHeight;
    // Apply classes
    var classes = getAnimClasses();
    classes.forEach(function (cls) { box.classList.add(cls); });
    // Trigger animation after short delay
    setTimeout(function () {
      box.classList.add('anim--visible');
    }, 50);
  }

  /* ══════════════════════════════════════
     MÉDIATHÈQUE
     ══════════════════════════════════════ */

  var mediaFiles = null;

  async function renderMedia() {
    var contentEl = document.getElementById('libMediaContent');
    if (!contentEl) return;

    // Charger les fichiers
    contentEl.innerHTML = '<div class="bld-lib__loading">Chargement...</div>';
    try {
      var resp = await BuilderAPI.mediaList();
      if (resp.ok) mediaFiles = resp.files || [];
    } catch (e) { mediaFiles = []; }

    renderMediaGrid(contentEl, mediaFiles);

    // Upload button
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
              renderMedia();
            });
          }
        });
      }

      // Drag & drop zone
      var dropzone = document.getElementById('mediaDropzone');
      if (dropzone) {
        contentEl.addEventListener('dragover', function (e) {
          e.preventDefault();
          if (dropzone) dropzone.classList.add('bld-media__dropzone--active');
        });
        contentEl.addEventListener('dragleave', function (e) {
          if (!contentEl.contains(e.relatedTarget)) {
            if (dropzone) dropzone.classList.remove('bld-media__dropzone--active');
          }
        });
        contentEl.addEventListener('drop', function (e) {
          e.preventDefault();
          if (dropzone) dropzone.classList.remove('bld-media__dropzone--active');
          if (e.dataTransfer.files.length > 0) {
            uploadMediaFiles(e.dataTransfer.files).then(function () {
              renderMedia();
            });
          }
        });
      }

      // Search
      var searchInput = document.getElementById('libMediaSearch');
      if (searchInput) {
        searchInput.addEventListener('input', function () {
          filterMedia(searchInput.value.toLowerCase());
        });
      }
    }
  }

  function renderMediaGrid(container, files) {
    if (!files || files.length === 0) {
      container.innerHTML = '<div class="bld-media__dropzone" id="mediaDropzone">'
        + '<p>Aucune image. Glissez des fichiers ici ou cliquez sur "Uploader".</p>'
        + '</div>';
      return;
    }

    var html = '<div class="bld-media-grid">';
    files.forEach(function (file) {
      var sizeStr = file.size > 1048576
        ? (file.size / 1048576).toFixed(1) + ' Mo'
        : Math.round(file.size / 1024) + ' Ko';
      html += '<div class="bld-media-grid__item" data-media-name="' + escapeHtml(file.name) + '">'
        + '<img src="/' + escapeHtml(file.path) + '" alt="' + escapeHtml(file.name) + '" loading="lazy">'
        + '<span class="bld-media-grid__name">' + escapeHtml(file.name) + '</span>'
        + '<div class="bld-media-grid__actions">'
        + '<span style="font-size:10px;color:var(--color-text-light);">' + sizeStr + '</span>'
        + '<div style="display:flex;gap:4px;">'
        + '<button class="bld-btn bld-btn--sm" data-copy-media-path="/' + escapeHtml(file.path) + '" title="Copier le chemin">Copier</button>'
        + '<button class="bld-btn bld-btn--sm bld-btn--danger" data-delete-media="' + escapeHtml(file.path) + '" title="Supprimer">&times;</button>'
        + '</div></div></div>';
    });
    html += '</div>';
    container.innerHTML = html;

    // Copier le chemin
    container.querySelectorAll('[data-copy-media-path]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        copyToClipboard(btn.getAttribute('data-copy-media-path'));
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
            renderMedia();
          } catch (err) {
            BuilderApp.showToast('Erreur : ' + err.message, 'error');
          }
        }
      });
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
        await BuilderAPI.mediaUpload(file.name, base64);
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
        // Retirer le préfixe data:image/...;base64,
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
    contentEl.querySelectorAll('.bld-media-grid__item').forEach(function (item) {
      var name = item.getAttribute('data-media-name') || '';
      item.style.display = (!query || name.toLowerCase().indexOf(query) !== -1) ? '' : 'none';
    });
  }

  /* ══════════════════════════════════════
     MEDIA PICKER CLOSE BUTTON
     ══════════════════════════════════════ */

  var pickerCloseBtn = document.getElementById('btnMediaPickerClose');
  if (pickerCloseBtn) {
    pickerCloseBtn.addEventListener('click', function () {
      var overlay = document.getElementById('bldMediaPickerOverlay');
      if (overlay) overlay.classList.remove('bld-modal-overlay--visible');
    });
  }

  // Fermer en cliquant l'overlay
  var pickerOverlay = document.getElementById('bldMediaPickerOverlay');
  if (pickerOverlay) {
    pickerOverlay.addEventListener('click', function (e) {
      if (e.target === pickerOverlay) {
        pickerOverlay.classList.remove('bld-modal-overlay--visible');
      }
    });
  }

  /* ══════════════════════════════════════
     GRILLE / BENTO BUILDER
     ══════════════════════════════════════ */

  var GRID_GAPS = [
    { value: 'none', label: 'Aucun' },
    { value: 'xs', label: 'XS' },
    { value: 'sm', label: 'SM' },
    { value: 'md', label: 'MD' },
    { value: 'lg', label: 'LG' },
    { value: 'xl', label: 'XL' }
  ];

  var GRID_ALIGNS = [
    { value: 'stretch', label: 'Stretch' },
    { value: 'start', label: 'Start' },
    { value: 'center', label: 'Center' },
    { value: 'end', label: 'End' }
  ];

  var BENTO_SIZES = [
    { value: '', label: 'Normal' },
    { value: 'wide', label: 'Wide (2×1)' },
    { value: 'tall', label: 'Tall (1×2)' },
    { value: 'large', label: 'Large (2×2)' },
    { value: 'full', label: 'Full width' }
  ];

  var BENTO_LAYOUTS = [
    { value: '', label: 'Aucun' },
    { value: 'sidebar', label: 'Sidebar (2/3 + 1/3)' },
    { value: 'sidebar-left', label: 'Sidebar gauche (1/3 + 2/3)' },
    { value: 'feature', label: 'Feature (1 grand + 2 empilés)' }
  ];

  var BENTO_ROW_HEIGHTS = [
    { value: 'sm', label: 'SM (120px)' },
    { value: 'md', label: 'MD (180px)' },
    { value: 'lg', label: 'LG (240px)' },
    { value: 'xl', label: 'XL (320px)' }
  ];

  var gridState = {
    type: 'grid',
    cols: 3,
    gap: 'md',
    align: 'stretch',
    itemCount: 3,
    selectedItem: -1,
    spans: {},
    layout: '',
    rowHeight: 'md',
    bentoSizes: ['', '', '', '', '', '', '', '', '', '', '', '']
  };

  function getGridOutput() {
    if (gridState.type === 'grid') {
      var attrs = ' data-cols="' + gridState.cols + '"';
      if (gridState.gap !== 'md') attrs += ' data-gap="' + gridState.gap + '"';
      if (gridState.align !== 'stretch') attrs += ' data-align="' + gridState.align + '"';
      var lines = ['<div class="grid"' + attrs + '>'];
      for (var i = 0; i < gridState.itemCount; i++) {
        var itemAttrs = '';
        var sp = gridState.spans[i];
        if (sp) {
          if (sp.col) itemAttrs += ' data-col-span="' + sp.col + '"';
          if (sp.row) itemAttrs += ' data-row-span="' + sp.row + '"';
        }
        lines.push('  <div' + itemAttrs + '>Contenu ' + (i + 1) + '</div>');
      }
      lines.push('</div>');
      return lines.join('\n');
    } else {
      var attrs = '';
      if (gridState.gap !== 'md') attrs += ' data-gap="' + gridState.gap + '"';
      if (gridState.rowHeight !== 'md') attrs += ' data-row-height="' + gridState.rowHeight + '"';
      if (gridState.layout) attrs += ' data-layout="' + gridState.layout + '"';
      var lines = ['<div class="bento"' + attrs + '>'];
      for (var i = 0; i < gridState.itemCount; i++) {
        var sizeAttr = gridState.bentoSizes[i] ? ' data-size="' + gridState.bentoSizes[i] + '"' : '';
        lines.push('  <div class="bento__item"' + sizeAttr + '>Contenu ' + (i + 1) + '</div>');
      }
      lines.push('</div>');
      return lines.join('\n');
    }
  }

  function renderGrid() {
    var contentEl = document.getElementById('libGridContent');
    if (!contentEl) return;

    var html = '';
    html += '<div class="bld-grid">';

    // ── Type toggle ──
    html += '<div class="bld-grid__group">';
    html += '<div class="bld-grid__type-toggle">';
    html += '<button class="bld-grid__type' + (gridState.type === 'grid' ? ' bld-grid__type--active' : '') + '" data-grid-type="grid">Grille flexible</button>';
    html += '<button class="bld-grid__type' + (gridState.type === 'bento' ? ' bld-grid__type--active' : '') + '" data-grid-type="bento">Bento</button>';
    html += '</div></div>';

    if (gridState.type === 'grid') {
      // ── Colonnes ──
      html += '<div class="bld-grid__group"><label class="bld-field__label">Colonnes</label>';
      html += '<div class="bld-grid__cols-grid">';
      for (var c = 1; c <= 6; c++) {
        var active = gridState.cols === c ? ' bld-grid__col--active' : '';
        html += '<button class="bld-grid__col' + active + '" data-grid-cols="' + c + '">' + c + '</button>';
      }
      html += '</div></div>';

      // ── Gap ──
      html += '<div class="bld-grid__group"><label class="bld-field__label">Espacement</label>';
      html += '<div class="bld-anim__options">';
      GRID_GAPS.forEach(function (g) {
        var active = gridState.gap === g.value ? ' bld-anim__opt--active' : '';
        html += '<button class="bld-anim__opt' + active + '" data-grid-gap="' + g.value + '">' + g.label + '</button>';
      });
      html += '</div></div>';

      // ── Alignement ──
      html += '<div class="bld-grid__group"><label class="bld-field__label">Alignement vertical</label>';
      html += '<div class="bld-anim__options">';
      GRID_ALIGNS.forEach(function (a) {
        var active = gridState.align === a.value ? ' bld-anim__opt--active' : '';
        html += '<button class="bld-anim__opt' + active + '" data-grid-align="' + a.value + '">' + a.label + '</button>';
      });
      html += '</div></div>';

      // ── Nombre d'items ──
      html += '<div class="bld-grid__group"><label class="bld-field__label">Nombre d\'items</label>';
      html += '<div class="bld-anim__slider-wrap">';
      html += '<input type="range" class="bld-anim__slider" id="gridItemSlider" min="1" max="12" step="1" value="' + gridState.itemCount + '">';
      html += '<span class="bld-anim__slider-value" id="gridItemValue">' + gridState.itemCount + '</span>';
      html += '</div></div>';

    } else {
      // ── Bento : Gap ──
      html += '<div class="bld-grid__group"><label class="bld-field__label">Espacement</label>';
      html += '<div class="bld-anim__options">';
      GRID_GAPS.forEach(function (g) {
        var active = gridState.gap === g.value ? ' bld-anim__opt--active' : '';
        html += '<button class="bld-anim__opt' + active + '" data-grid-gap="' + g.value + '">' + g.label + '</button>';
      });
      html += '</div></div>';

      // ── Bento : Hauteur de rangée ──
      html += '<div class="bld-grid__group"><label class="bld-field__label">Hauteur de rangée</label>';
      html += '<div class="bld-anim__options">';
      BENTO_ROW_HEIGHTS.forEach(function (h) {
        var active = gridState.rowHeight === h.value ? ' bld-anim__opt--active' : '';
        html += '<button class="bld-anim__opt' + active + '" data-grid-rowheight="' + h.value + '">' + h.label + '</button>';
      });
      html += '</div></div>';

      // ── Bento : Layout prédéfini ──
      html += '<div class="bld-grid__group"><label class="bld-field__label">Layout prédéfini</label>';
      html += '<div class="bld-anim__options">';
      BENTO_LAYOUTS.forEach(function (l) {
        var active = gridState.layout === l.value ? ' bld-anim__opt--active' : '';
        html += '<button class="bld-anim__opt' + active + '" data-grid-layout="' + l.value + '">' + l.label + '</button>';
      });
      html += '</div></div>';

      // ── Nombre d'items ──
      html += '<div class="bld-grid__group"><label class="bld-field__label">Nombre d\'items</label>';
      html += '<div class="bld-anim__slider-wrap">';
      html += '<input type="range" class="bld-anim__slider" id="gridItemSlider" min="1" max="12" step="1" value="' + gridState.itemCount + '">';
      html += '<span class="bld-anim__slider-value" id="gridItemValue">' + gridState.itemCount + '</span>';
      html += '</div></div>';
    }

    // ── Preview ──
    html += '<div class="bld-grid__group"><label class="bld-field__label">Aperçu <span style="font-weight:normal;color:var(--color-text-light)">(cliquez sur un item pour le configurer)</span></label>';
    html += '<div class="bld-grid__preview-wrap">';
    html += '<div id="gridPreview" class="bld-grid__preview"></div>';
    html += '</div></div>';

    // ── Item config (affiché quand un item est sélectionné) ──
    html += '<div class="bld-grid__item-config" id="gridItemConfig" style="display:none;">';
    html += '<div class="bld-grid__item-config-header">';
    html += '<label class="bld-field__label">Configuration de l\'item <span id="gridItemConfigIndex"></span></label>';
    html += '<button class="bld-btn bld-btn--sm" id="gridItemDeselect">Désélectionner</button>';
    html += '</div>';

    if (gridState.type === 'grid') {
      html += '<div class="bld-grid__item-config-row">';
      html += '<label class="bld-field__label">Col span</label>';
      html += '<div class="bld-anim__options">';
      ['', '2', '3', '4', '5', '6', 'full'].forEach(function (v) {
        var label = v === '' ? 'Auto' : v === 'full' ? 'Full' : v;
        html += '<button class="bld-anim__opt" data-grid-colspan="' + v + '">' + label + '</button>';
      });
      html += '</div></div>';
      html += '<div class="bld-grid__item-config-row">';
      html += '<label class="bld-field__label">Row span</label>';
      html += '<div class="bld-anim__options">';
      ['', '2', '3', '4'].forEach(function (v) {
        var label = v === '' ? 'Auto' : v;
        html += '<button class="bld-anim__opt" data-grid-rowspan="' + v + '">' + label + '</button>';
      });
      html += '</div></div>';
    } else {
      html += '<div class="bld-grid__item-config-row">';
      html += '<label class="bld-field__label">Taille</label>';
      html += '<div class="bld-anim__options">';
      BENTO_SIZES.forEach(function (s) {
        html += '<button class="bld-anim__opt" data-grid-bentosize="' + s.value + '">' + s.label + '</button>';
      });
      html += '</div></div>';
    }
    html += '</div>';

    // ── Output ──
    html += '<div class="bld-grid__group"><label class="bld-field__label">Code à copier</label>';
    html += '<div class="bld-anim__output">';
    html += '<code id="gridOutput" style="white-space:pre;"></code>';
    html += '<button class="bld-btn bld-btn--primary bld-btn--sm" id="gridCopyBtn">Copier</button>';
    html += '</div></div>';

    html += '</div>';
    contentEl.innerHTML = html;

    // ── Update preview + output ──
    updateGridPreview();
    updateGridOutputDisplay();

    // ── Events ──

    // Type toggle
    contentEl.querySelectorAll('[data-grid-type]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        gridState.type = btn.getAttribute('data-grid-type');
        gridState.selectedItem = -1;
        gridState.spans = {};
        renderGrid();
      });
    });

    // Colonnes
    contentEl.querySelectorAll('[data-grid-cols]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        gridState.cols = parseInt(btn.getAttribute('data-grid-cols'));
        contentEl.querySelectorAll('[data-grid-cols]').forEach(function (b) {
          b.classList.toggle('bld-grid__col--active', b === btn);
        });
        updateGridPreview();
        updateGridOutputDisplay();
      });
    });

    // Gap
    contentEl.querySelectorAll('[data-grid-gap]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        gridState.gap = btn.getAttribute('data-grid-gap');
        contentEl.querySelectorAll('[data-grid-gap]').forEach(function (b) {
          b.classList.toggle('bld-anim__opt--active', b === btn);
        });
        updateGridPreview();
        updateGridOutputDisplay();
      });
    });

    // Align
    contentEl.querySelectorAll('[data-grid-align]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        gridState.align = btn.getAttribute('data-grid-align');
        contentEl.querySelectorAll('[data-grid-align]').forEach(function (b) {
          b.classList.toggle('bld-anim__opt--active', b === btn);
        });
        updateGridPreview();
        updateGridOutputDisplay();
      });
    });

    // Row height (bento)
    contentEl.querySelectorAll('[data-grid-rowheight]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        gridState.rowHeight = btn.getAttribute('data-grid-rowheight');
        contentEl.querySelectorAll('[data-grid-rowheight]').forEach(function (b) {
          b.classList.toggle('bld-anim__opt--active', b === btn);
        });
        updateGridPreview();
        updateGridOutputDisplay();
      });
    });

    // Layout (bento)
    contentEl.querySelectorAll('[data-grid-layout]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        gridState.layout = btn.getAttribute('data-grid-layout');
        contentEl.querySelectorAll('[data-grid-layout]').forEach(function (b) {
          b.classList.toggle('bld-anim__opt--active', b === btn);
        });
        updateGridPreview();
        updateGridOutputDisplay();
      });
    });

    // Item count slider
    var itemSlider = document.getElementById('gridItemSlider');
    if (itemSlider) {
      itemSlider.addEventListener('input', function () {
        gridState.itemCount = parseInt(itemSlider.value);
        var label = document.getElementById('gridItemValue');
        if (label) label.textContent = gridState.itemCount;
        gridState.selectedItem = -1;
        updateGridPreview();
        updateGridOutputDisplay();
        hideItemConfig();
      });
    }

    // Copy
    var copyBtn = document.getElementById('gridCopyBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var output = document.getElementById('gridOutput');
        if (output) copyToClipboard(output.textContent);
      });
    }

    // Deselect item
    var deselectBtn = document.getElementById('gridItemDeselect');
    if (deselectBtn) {
      deselectBtn.addEventListener('click', function () {
        gridState.selectedItem = -1;
        hideItemConfig();
        updateGridPreview();
      });
    }

    // Col span buttons
    contentEl.querySelectorAll('[data-grid-colspan]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (gridState.selectedItem < 0) return;
        var val = btn.getAttribute('data-grid-colspan');
        if (!gridState.spans[gridState.selectedItem]) gridState.spans[gridState.selectedItem] = {};
        gridState.spans[gridState.selectedItem].col = val || undefined;
        if (!gridState.spans[gridState.selectedItem].col && !gridState.spans[gridState.selectedItem].row) {
          delete gridState.spans[gridState.selectedItem];
        }
        contentEl.querySelectorAll('[data-grid-colspan]').forEach(function (b) {
          b.classList.toggle('bld-anim__opt--active', b === btn);
        });
        updateGridPreview();
        updateGridOutputDisplay();
      });
    });

    // Row span buttons
    contentEl.querySelectorAll('[data-grid-rowspan]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (gridState.selectedItem < 0) return;
        var val = btn.getAttribute('data-grid-rowspan');
        if (!gridState.spans[gridState.selectedItem]) gridState.spans[gridState.selectedItem] = {};
        gridState.spans[gridState.selectedItem].row = val || undefined;
        if (!gridState.spans[gridState.selectedItem].col && !gridState.spans[gridState.selectedItem].row) {
          delete gridState.spans[gridState.selectedItem];
        }
        contentEl.querySelectorAll('[data-grid-rowspan]').forEach(function (b) {
          b.classList.toggle('bld-anim__opt--active', b === btn);
        });
        updateGridPreview();
        updateGridOutputDisplay();
      });
    });

    // Bento size buttons
    contentEl.querySelectorAll('[data-grid-bentosize]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (gridState.selectedItem < 0) return;
        gridState.bentoSizes[gridState.selectedItem] = btn.getAttribute('data-grid-bentosize');
        contentEl.querySelectorAll('[data-grid-bentosize]').forEach(function (b) {
          b.classList.toggle('bld-anim__opt--active', b === btn);
        });
        updateGridPreview();
        updateGridOutputDisplay();
      });
    });
  }

  function updateGridPreview() {
    var previewEl = document.getElementById('gridPreview');
    if (!previewEl) return;

    var html = '';
    if (gridState.type === 'grid') {
      var attrs = ' data-cols="' + gridState.cols + '"';
      if (gridState.gap !== 'md') attrs += ' data-gap="' + gridState.gap + '"';
      if (gridState.align !== 'stretch') attrs += ' data-align="' + gridState.align + '"';
      html += '<div class="grid"' + attrs + '>';
      for (var i = 0; i < gridState.itemCount; i++) {
        var itemAttrs = '';
        var sp = gridState.spans[i];
        if (sp) {
          if (sp.col) itemAttrs += ' data-col-span="' + sp.col + '"';
          if (sp.row) itemAttrs += ' data-row-span="' + sp.row + '"';
        }
        var selected = gridState.selectedItem === i ? ' bld-grid__preview-item--selected' : '';
        html += '<div class="bld-grid__preview-item' + selected + '"' + itemAttrs + ' data-grid-item="' + i + '">' + (i + 1) + '</div>';
      }
      html += '</div>';
    } else {
      var attrs = '';
      if (gridState.gap !== 'md') attrs += ' data-gap="' + gridState.gap + '"';
      if (gridState.rowHeight !== 'md') attrs += ' data-row-height="' + gridState.rowHeight + '"';
      if (gridState.layout) attrs += ' data-layout="' + gridState.layout + '"';
      html += '<div class="bento"' + attrs + '>';
      for (var i = 0; i < gridState.itemCount; i++) {
        var sizeAttr = gridState.bentoSizes[i] ? ' data-size="' + gridState.bentoSizes[i] + '"' : '';
        var selected = gridState.selectedItem === i ? ' bld-grid__preview-item--selected' : '';
        html += '<div class="bento__item bld-grid__preview-item' + selected + '"' + sizeAttr + ' data-grid-item="' + i + '">' + (i + 1) + '</div>';
      }
      html += '</div>';
    }

    previewEl.innerHTML = html;

    // Bind click on preview items
    previewEl.querySelectorAll('[data-grid-item]').forEach(function (item) {
      item.addEventListener('click', function () {
        var idx = parseInt(item.getAttribute('data-grid-item'));
        gridState.selectedItem = idx;
        showItemConfig(idx);
        updateGridPreview();
      });
    });
  }

  function updateGridOutputDisplay() {
    var output = document.getElementById('gridOutput');
    if (output) output.textContent = getGridOutput();
  }

  function showItemConfig(idx) {
    var configEl = document.getElementById('gridItemConfig');
    var indexEl = document.getElementById('gridItemConfigIndex');
    if (!configEl) return;
    configEl.style.display = '';
    if (indexEl) indexEl.textContent = '#' + (idx + 1);

    // Highlight current span/size
    if (gridState.type === 'grid') {
      var sp = gridState.spans[idx] || {};
      document.querySelectorAll('[data-grid-colspan]').forEach(function (b) {
        b.classList.toggle('bld-anim__opt--active', b.getAttribute('data-grid-colspan') === (sp.col || ''));
      });
      document.querySelectorAll('[data-grid-rowspan]').forEach(function (b) {
        b.classList.toggle('bld-anim__opt--active', b.getAttribute('data-grid-rowspan') === (sp.row || ''));
      });
    } else {
      var size = gridState.bentoSizes[idx] || '';
      document.querySelectorAll('[data-grid-bentosize]').forEach(function (b) {
        b.classList.toggle('bld-anim__opt--active', b.getAttribute('data-grid-bentosize') === size);
      });
    }
  }

  function hideItemConfig() {
    var configEl = document.getElementById('gridItemConfig');
    if (configEl) configEl.style.display = 'none';
  }

  /* ══════════════════════════════════════
     PUBLIC API
     ══════════════════════════════════════ */

  window.BuilderLibrary = {
    refresh: function (panelId) {
      switch (panelId) {
        case 'lib-wireframes': renderWireframes(); break;
        case 'lib-icons': renderIcons(); break;
        case 'lib-components': renderComponents(); break;
        case 'lib-elements': renderElements(); break;
        case 'lib-animations': renderAnimations(); break;
        case 'lib-grid': renderGrid(); break;
        case 'lib-media': renderMedia(); break;
      }
    }
  };

})();
