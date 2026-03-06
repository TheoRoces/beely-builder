/* ==========================================================================
   BUILDER CONFIGURATOR — Charge configurator.html et l'injecte dans le panel
   Pas d'iframe : le HTML/CSS/JS est intégré directement dans le DOM du builder.
   ========================================================================== */
(function () {
  'use strict';

  var loaded = false;
  var embedEl = document.getElementById('cfgEmbed');

  async function loadConfigurator() {
    if (loaded || !embedEl) return;
    loaded = true;

    try {
      var resp = await fetch('/configurateur/configurator.html');
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      var html = resp.text ? await resp.text() : '';

      // Parser le HTML
      var parser = new DOMParser();
      var doc = parser.parseFromString(html, 'text/html');

      // 1. Extraire le <style> et l'injecter dans le <head> du builder
      var styleEls = doc.querySelectorAll('head style');
      styleEls.forEach(function (styleEl) {
        var s = document.createElement('style');
        s.setAttribute('data-cfg-style', '');
        // Adapter les styles pour l'intégration dans le builder
        var css = styleEl.textContent;
        // Retirer les règles qui affectent html/body globalement
        css = css.replace(/html\s*\{[^}]*\}/g, '');
        // Supprimer les styles de .cfg-layout, .cfg-sidebar, .cfg-content
        // car ils sont redéfinis dans configurateur.css via .bld-configurator-embed
        css = css.replace(/\.cfg-layout\s*\{[^}]*\}/g, '');
        css = css.replace(/\.cfg-sidebar\s*\{[^}]*\}/g, '');
        css = css.replace(/\.cfg-content\s*\{[^}]*\}/g, '');
        // Supprimer le bloc @media responsive qui redéfinit cfg-layout/sidebar/content
        css = css.replace(/@media\s*\([^)]*767px[^)]*\)\s*\{[\s\S]*?\n\}/g, '');
        s.textContent = css;
        document.head.appendChild(s);
      });

      // 2. Extraire le contenu du body (sans header, sans scripts embed)
      var body = doc.body;

      // Supprimer le header
      var header = body.querySelector('header, #cfgHeader');
      if (header) header.remove();

      // Supprimer les scripts embed mode
      body.querySelectorAll('script').forEach(function (sc) {
        if (sc.textContent.indexOf('embed=1') !== -1) sc.remove();
      });

      // Extraire le script principal du configurateur
      var mainScript = null;
      body.querySelectorAll('script').forEach(function (sc) {
        if (sc.textContent.indexOf('STORAGE_KEY') !== -1) {
          mainScript = sc.textContent;
          sc.remove();
        }
      });

      // 3. Injecter le HTML dans le container
      // Wrapper dans un div scrollable
      var wrapper = document.createElement('div');
      wrapper.className = 'bld-configurator-embed__inner';
      wrapper.innerHTML = body.innerHTML;
      embedEl.innerHTML = '';
      embedEl.appendChild(wrapper);

      // 4. Exécuter le JS du configurateur
      if (mainScript) {
        try {
          var scriptEl = document.createElement('script');
          scriptEl.textContent = mainScript;
          document.body.appendChild(scriptEl);
        } catch (e) {
          console.error('Erreur exécution JS configurateur:', e);
        }
      }

    } catch (e) {
      console.error('Erreur chargement configurateur:', e);
      embedEl.innerHTML = '<div class="bld-lib__empty">Impossible de charger le configurateur. Vérifiez que le serveur est démarré (port 5555).</div>';
    }
  }

  /* ══════════════════════════════════════
     PUBLIC API
     ══════════════════════════════════════ */

  window.BuilderConfigurator = {
    refresh: function () {
      if (!loaded) loadConfigurator();
    }
  };

})();
