/* ==========================================================================
   BUILDER PUBLISH — Dropdown de déploiement prod/preprod/git
   ========================================================================== */
(function () {
  'use strict';

  var dropdownEl = document.getElementById('publishDropdown');
  var contentEl = document.getElementById('publishDropdownContent');
  var toggleBtn = document.getElementById('btnPublishToggle');
  var logEl = document.getElementById('deployLog');
  var logContentEl = document.getElementById('deployLogContent');

  /* ---------- Toggle dropdown ---------- */
  if (toggleBtn) {
    toggleBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var isOpen = dropdownEl.classList.toggle('bld-publish-dropdown--open');
      if (isOpen) render();
    });
  }

  document.addEventListener('click', function (e) {
    if (!e.target.closest('#publishDropdownWrapper')) {
      dropdownEl.classList.remove('bld-publish-dropdown--open');
    }
  });

  /* ---------- Render ---------- */
  async function render() {
    var config = { hasProd: false, hasPreprod: false, prodUrl: '', preprodUrl: '' };
    try {
      var resp = await BuilderAPI.deployConfig();
      if (resp.ok) config = resp;
    } catch (e) { /* silencer */ }

    var reg = BuilderApp.state.registry || {};
    var deploys = reg.deploys || {};

    var html = '';

    // Production
    html += renderTarget('prod', 'Production', config.hasProd, config.prodUrl, deploys.prod);

    // Pré-production
    html += renderTarget('preprod', 'Pré-production', config.hasPreprod, config.preprodUrl, deploys.preprod);

    // Git
    html += '<div class="bld-deploy-card">'
      + '<div class="bld-deploy-card__header">'
      + '<span class="bld-deploy-card__name">GitHub</span>'
      + '</div>';

    if (deploys.git && deploys.git.lastPush) {
      html += '<div class="bld-deploy-card__last">Dernier push : ' + formatDate(deploys.git.lastPush) + '</div>';
    }

    html += '<div class="bld-field" style="margin-bottom: var(--space-2);">'
      + '<input class="bld-field__input" type="text" id="gitMessage" placeholder="Message de commit (auto-généré si vide)">'
      + '</div>'
      + '<button class="bld-btn bld-btn--sm" id="btnGitPush">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>'
      + ' Commit &amp; Push'
      + '</button>'
      + '</div>';

    contentEl.innerHTML = html;

    // Bind events
    var prodBtn = document.getElementById('btnDeployProd');
    if (prodBtn) {
      prodBtn.addEventListener('click', function () { deploy('prod'); });
    }
    var preprodBtn = document.getElementById('btnDeployPreprod');
    if (preprodBtn) {
      preprodBtn.addEventListener('click', function () { deploy('preprod'); });
    }
    var gitBtn = document.getElementById('btnGitPush');
    if (gitBtn) {
      gitBtn.addEventListener('click', gitPush);
    }
  }

  function renderTarget(id, name, configured, url, deployInfo) {
    var html = '<div class="bld-deploy-card">'
      + '<div class="bld-deploy-card__header">'
      + '<span class="bld-deploy-card__name">' + name + '</span>'
      + '<div class="bld-deploy-card__status">'
      + '<span class="bld-deploy-card__dot' + (configured ? ' bld-deploy-card__dot--ok' : '') + '"></span>'
      + (configured ? 'Configuré' : 'Non configuré')
      + '</div>'
      + '</div>';

    if (url) {
      html += '<div class="bld-deploy-card__url">' + escapeHtml(url) + '</div>';
    }

    if (deployInfo && deployInfo.lastDeploy) {
      html += '<div class="bld-deploy-card__last">Dernier déploiement : ' + formatDate(deployInfo.lastDeploy)
        + (deployInfo.status === 'success' ? ' (succès)' : deployInfo.status === 'error' ? ' (erreur)' : '')
        + '</div>';
    }

    if (configured) {
      html += '<button class="bld-btn bld-btn--primary bld-btn--sm" id="btnDeploy' + capitalize(id) + '">'
        + 'Déployer en ' + name.toLowerCase()
        + '</button>';
    } else {
      html += '<p style="font-size: var(--text-xs); color: var(--color-text-light);">Configurez .deploy.env via le Configurateur.</p>';
    }

    html += '</div>';
    return html;
  }

  /* ---------- Deploy ---------- */
  async function deploy(target) {
    var btn = document.getElementById('btnDeploy' + capitalize(target));
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Déploiement en cours...';
    }

    showLog('Déploiement ' + target + ' en cours...\n');

    try {
      var resp = await BuilderAPI.deploy(target);

      appendLog(resp.output || '');

      if (resp.ok) {
        appendLog('\n--- Déploiement réussi ---');
        BuilderApp.showToast('Déploiement ' + target + ' réussi', 'success');
      } else {
        appendLog('\n--- Déploiement échoué (code ' + resp.exitCode + ') ---');
        BuilderApp.showToast('Déploiement échoué', 'error');
      }

      updateDeployStatus(target, resp.ok ? 'success' : 'error');

    } catch (e) {
      appendLog('\nErreur : ' + e.message);
      BuilderApp.showToast('Erreur : ' + e.message, 'error');
    }

    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Déployer en ' + (target === 'prod' ? 'production' : 'pré-production');
    }
  }

  async function gitPush() {
    var msgInput = document.getElementById('gitMessage');
    var message = msgInput ? msgInput.value.trim() : '';
    if (!message) message = 'Update from Builder';

    var btn = document.getElementById('btnGitPush');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Push en cours...';
    }

    showLog('Git push en cours...\n');

    try {
      var resp = await BuilderAPI.gitPush(message);

      appendLog(resp.output || '');

      if (resp.ok) {
        appendLog('\n--- Push réussi ---');
        BuilderApp.showToast('Push réussi', 'success');
        if (msgInput) msgInput.value = '';
      } else {
        appendLog('\n--- Push échoué (code ' + resp.exitCode + ') ---');
        BuilderApp.showToast('Push échoué', 'error');
      }

      updateDeployStatus('git', resp.ok ? 'success' : 'error', true);

    } catch (e) {
      appendLog('\nErreur : ' + e.message);
      BuilderApp.showToast('Erreur : ' + e.message, 'error');
    }

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg> Commit &amp; Push';
    }
  }

  function updateDeployStatus(target, status, isGit) {
    var reg = BuilderApp.state.registry;
    if (!reg) return;
    if (!reg.deploys) reg.deploys = {};
    var key = isGit ? 'git' : target;
    reg.deploys[key] = {
      lastDeploy: new Date().toISOString(),
      lastPush: isGit ? new Date().toISOString() : undefined,
      status: status
    };
    BuilderApp.saveRegistry();
  }

  /* ---------- Log ---------- */
  function showLog(text) {
    logEl.style.display = '';
    logContentEl.textContent = text;
  }

  function appendLog(text) {
    logContentEl.textContent += text;
    logContentEl.scrollTop = logContentEl.scrollHeight;
  }

  /* ---------- Helpers ---------- */
  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function formatDate(isoStr) {
    if (!isoStr) return '';
    try {
      return new Date(isoStr).toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch (e) { return isoStr; }
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  /* ---------- Public API ---------- */
  window.BuilderPublish = {
    refresh: render
  };

})();
