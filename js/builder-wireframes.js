/* ==========================================================================
   BUILDER WIREFRAMES — Catalogue avec categories et recherche
   ========================================================================== */
(function () {
  'use strict';

  var catalog = null;  // cache du catalogue
  var catalogEl = document.getElementById('editorCatalog');
  var onInsert = null; // callback quand un wireframe est selectionne

  /* ---------- Charger le catalogue ---------- */
  async function loadCatalog() {
    if (catalog) return catalog;
    try {
      var resp = await BuilderAPI.wireframesCatalog();
      if (resp.ok) catalog = resp.categories;
    } catch (e) {
      catalog = [];
    }
    return catalog;
  }

  /* ---------- Render ---------- */
  async function render(insertCallback) {
    onInsert = insertCallback;
    var cats = await loadCatalog();
    if (!cats || cats.length === 0) {
      catalogEl.innerHTML = '<div style="padding: var(--space-6); text-align: center; color: var(--color-text-light); font-size: var(--text-sm);">Aucun wireframe trouve.</div>';
      return;
    }

    var html = ''
      + '<div class="bld-catalog__header">'
      + '<span class="bld-catalog__title">Wireframes</span>'
      + '</div>'
      + '<div class="bld-catalog__search">'
      + '<input type="text" id="wfSearch" placeholder="Rechercher...">'
      + '</div>';

    cats.forEach(function (cat) {
      html += '<div class="bld-catalog__category" data-cat="' + cat.slug + '">'
        + '<div class="bld-catalog__cat-header">'
        + '<span>' + escapeHtml(cat.name) + '</span>'
        + '<span class="bld-catalog__cat-count">' + cat.count + '</span>'
        + '</div>'
        + '<div class="bld-catalog__items">';

      cat.files.forEach(function (file) {
        var label = file.replace('.html', '').replace(/-/g, ' ');
        html += '<div class="bld-catalog__item" data-cat-slug="' + cat.slug + '" data-file="' + file + '">'
          + label
          + '</div>';
      });

      html += '</div></div>';
    });

    catalogEl.innerHTML = html;

    // Toggle categories
    catalogEl.querySelectorAll('.bld-catalog__cat-header').forEach(function (header) {
      header.addEventListener('click', function () {
        header.parentElement.classList.toggle('bld-catalog__category--open');
      });
    });

    // Click on wireframe item
    catalogEl.querySelectorAll('.bld-catalog__item').forEach(function (item) {
      item.addEventListener('click', function () {
        var catSlug = item.getAttribute('data-cat-slug');
        var file = item.getAttribute('data-file');
        insertWireframe(catSlug, file);
      });
    });

    // Search
    var searchInput = document.getElementById('wfSearch');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        filterCatalog(searchInput.value.toLowerCase());
      });
    }
  }

  function filterCatalog(query) {
    catalogEl.querySelectorAll('.bld-catalog__category').forEach(function (catEl) {
      var hasVisible = false;
      catEl.querySelectorAll('.bld-catalog__item').forEach(function (item) {
        var text = item.textContent.toLowerCase();
        var catName = catEl.querySelector('.bld-catalog__cat-header span').textContent.toLowerCase();
        var match = !query || text.indexOf(query) !== -1 || catName.indexOf(query) !== -1;
        item.style.display = match ? '' : 'none';
        if (match) hasVisible = true;
      });
      catEl.style.display = hasVisible ? '' : 'none';
      if (hasVisible && query) catEl.classList.add('bld-catalog__category--open');
    });
  }

  async function insertWireframe(catSlug, file) {
    try {
      var resp = await BuilderAPI.wireframeRead(catSlug, file);
      if (resp.ok && resp.content && onInsert) {
        var id = file.replace('.html', '');
        onInsert(id, resp.content);
        BuilderApp.showToast(id + ' insere', 'success');
      }
    } catch (e) {
      BuilderApp.showToast('Erreur : ' + e.message, 'error');
    }
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  /* ---------- Public API ---------- */
  window.BuilderWireframes = {
    render: render,
    loadCatalog: loadCatalog
  };

})();
