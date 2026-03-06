/* ==========================================================================
   BUILDER MODAL — Confirm & Prompt customisés (remplace alert/confirm/prompt)
   ========================================================================== */
(function () {
  'use strict';

  var overlay = document.getElementById('bldModalGeneric');
  var titleEl = document.getElementById('bldModalTitle');
  var messageEl = document.getElementById('bldModalMessage');
  var fieldWrap = document.getElementById('bldModalFieldWrap');
  var fieldLabel = document.getElementById('bldModalFieldLabel');
  var fieldInput = document.getElementById('bldModalFieldInput');
  var actionsEl = document.getElementById('bldModalActions');

  var currentResolve = null;
  var previousFocus = null;

  function close(value) {
    overlay.classList.remove('bld-modal-overlay--visible');
    // Restaurer le focus précédent
    if (previousFocus && previousFocus.focus) {
      previousFocus.focus();
      previousFocus = null;
    }
    if (currentResolve) {
      currentResolve(value);
      currentResolve = null;
    }
  }

  // Focus trap : garder le focus dans la modale
  function trapFocus(e) {
    if (e.key !== 'Tab') return;
    if (!overlay.classList.contains('bld-modal-overlay--visible')) return;
    var modal = overlay.querySelector('.bld-modal');
    var focusable = modal.querySelectorAll('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])');
    if (focusable.length === 0) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  // Fermer avec Escape + focus trap
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay.classList.contains('bld-modal-overlay--visible')) {
      close(null);
      return;
    }
    trapFocus(e);
  });

  // Fermer en cliquant l'overlay
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) close(null);
  });

  /**
   * Modal Confirm
   * @param {Object} opts
   * @param {string} opts.title - Titre du modal
   * @param {string} [opts.message] - Message descriptif
   * @param {string} [opts.confirmText='Confirmer'] - Texte du bouton confirmer
   * @param {string} [opts.cancelText='Annuler'] - Texte du bouton annuler
   * @param {string} [opts.variant='primary'] - Variante du bouton (primary, danger-fill, success, warning)
   * @returns {Promise<boolean>}
   */
  function confirm(opts) {
    titleEl.textContent = opts.title || 'Confirmation';
    messageEl.textContent = opts.message || '';
    fieldWrap.style.display = 'none';

    var variant = opts.variant || 'primary';
    var confirmText = opts.confirmText || 'Confirmer';
    var cancelText = opts.cancelText || 'Annuler';

    actionsEl.innerHTML = '<button class="bld-btn bld-btn--ghost" data-modal-action="cancel">' + cancelText + '</button>'
      + '<button class="bld-btn bld-btn--' + variant + '" data-modal-action="confirm">' + confirmText + '</button>';

    actionsEl.querySelector('[data-modal-action="cancel"]').addEventListener('click', function () { close(false); });
    actionsEl.querySelector('[data-modal-action="confirm"]').addEventListener('click', function () { close(true); });

    previousFocus = document.activeElement;
    overlay.classList.add('bld-modal-overlay--visible');

    // Focus le bouton confirmer
    actionsEl.querySelector('[data-modal-action="confirm"]').focus();

    return new Promise(function (resolve) { currentResolve = resolve; });
  }

  /**
   * Modal Prompt
   * @param {Object} opts
   * @param {string} opts.title - Titre du modal
   * @param {string} [opts.message] - Message descriptif
   * @param {string} [opts.label] - Label du champ
   * @param {string} [opts.value=''] - Valeur initiale
   * @param {string} [opts.placeholder=''] - Placeholder
   * @param {string} [opts.confirmText='OK'] - Texte du bouton confirmer
   * @param {string} [opts.cancelText='Annuler'] - Texte du bouton annuler
   * @param {string} [opts.variant='primary'] - Variante du bouton
   * @returns {Promise<string|null>}
   */
  function prompt(opts) {
    titleEl.textContent = opts.title || '';
    messageEl.textContent = opts.message || '';

    fieldWrap.style.display = '';
    fieldLabel.textContent = opts.label || '';
    fieldInput.value = opts.value || '';
    fieldInput.placeholder = opts.placeholder || '';

    var variant = opts.variant || 'primary';
    var confirmText = opts.confirmText || 'OK';
    var cancelText = opts.cancelText || 'Annuler';

    actionsEl.innerHTML = '<button class="bld-btn bld-btn--ghost" data-modal-action="cancel">' + cancelText + '</button>'
      + '<button class="bld-btn bld-btn--' + variant + '" data-modal-action="confirm">' + confirmText + '</button>';

    actionsEl.querySelector('[data-modal-action="cancel"]').addEventListener('click', function () { close(null); });
    actionsEl.querySelector('[data-modal-action="confirm"]').addEventListener('click', function () { close(fieldInput.value); });

    // Enter pour valider
    fieldInput.addEventListener('keydown', function handler(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        fieldInput.removeEventListener('keydown', handler);
        close(fieldInput.value);
      }
    });

    previousFocus = document.activeElement;
    overlay.classList.add('bld-modal-overlay--visible');

    // Focus et sélection du champ
    setTimeout(function () {
      fieldInput.focus();
      fieldInput.select();
    }, 50);

    return new Promise(function (resolve) { currentResolve = resolve; });
  }

  /* ══════════════════════════════════════
     PUBLIC API
     ══════════════════════════════════════ */

  window.BuilderModal = {
    confirm: confirm,
    prompt: prompt
  };

})();
