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
    if (formFieldsEl) formFieldsEl.innerHTML = '';

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
    if (formFieldsEl) formFieldsEl.innerHTML = '';

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
     FORM — Multi-champs avec validation temps réel
     ══════════════════════════════════════ */

  var formFieldsEl = document.getElementById('bldModalFormFields');

  /**
   * Modal Form — multi-champs avec validation temps réel
   * @param {Object} opts
   * @param {string} opts.title
   * @param {string} [opts.message]
   * @param {Array} opts.fields - [{ key, label, value, placeholder, helpText, readonly }]
   * @param {Object} [opts.linkedSlug] - { source: 'name', target: 'slug', slugify: fn }
   * @param {Function} [opts.validate] - function(values) → string|null
   * @param {string} [opts.confirmText='OK']
   * @param {string} [opts.cancelText='Annuler']
   * @param {string} [opts.variant='primary']
   * @returns {Promise<Object|null>}
   */
  function form(opts) {
    titleEl.textContent = opts.title || '';
    messageEl.textContent = opts.message || '';
    fieldWrap.style.display = 'none';
    formFieldsEl.innerHTML = '';

    var inputs = {};
    var errorEls = {};
    var slugManuallyEdited = false;
    var linked = opts.linkedSlug || null;

    // Construire les champs
    opts.fields.forEach(function (field) {
      var wrap = document.createElement('div');
      wrap.className = 'bld-field';
      wrap.style.marginBottom = 'var(--space-4)';

      var label = document.createElement('label');
      label.className = 'bld-field__label';
      label.textContent = field.label || '';
      wrap.appendChild(label);

      var input = document.createElement('input');
      input.className = 'bld-field__input';
      input.type = 'text';
      input.value = field.value || '';
      input.placeholder = field.placeholder || '';
      if (field.readonly) input.readOnly = true;
      wrap.appendChild(input);

      if (field.helpText) {
        var help = document.createElement('div');
        help.className = 'bld-field__help';
        help.textContent = field.helpText;
        wrap.appendChild(help);
      }

      var errorEl = document.createElement('div');
      errorEl.className = 'bld-field__error';
      wrap.appendChild(errorEl);

      inputs[field.key] = input;
      errorEls[field.key] = errorEl;
      formFieldsEl.appendChild(wrap);
    });

    // Boutons
    var variant = opts.variant || 'primary';
    var confirmText = opts.confirmText || 'OK';
    var cancelText = opts.cancelText || 'Annuler';

    actionsEl.innerHTML = '<button class="bld-btn bld-btn--ghost" data-modal-action="cancel">' + cancelText + '</button>'
      + '<button class="bld-btn bld-btn--' + variant + '" data-modal-action="confirm">' + confirmText + '</button>';

    var confirmBtn = actionsEl.querySelector('[data-modal-action="confirm"]');
    actionsEl.querySelector('[data-modal-action="cancel"]').addEventListener('click', function () { close(null); });

    // Collecter les valeurs
    function getValues() {
      var vals = {};
      opts.fields.forEach(function (f) { vals[f.key] = inputs[f.key].value; });
      return vals;
    }

    // Valider et mettre à jour l'UI
    function runValidation() {
      // Reset erreurs
      opts.fields.forEach(function (f) {
        errorEls[f.key].textContent = '';
        inputs[f.key].classList.remove('bld-field__input--error');
      });

      if (!opts.validate) { confirmBtn.disabled = false; return; }

      var err = opts.validate(getValues());
      if (err) {
        // Afficher l'erreur sur le champ slug (ou le dernier champ)
        var targetKey = (linked && linked.target) || opts.fields[opts.fields.length - 1].key;
        errorEls[targetKey].textContent = err;
        inputs[targetKey].classList.add('bld-field__input--error');
        confirmBtn.disabled = true;
      } else {
        confirmBtn.disabled = false;
      }
    }

    // Lier slug au nom
    if (linked && inputs[linked.source] && inputs[linked.target]) {
      inputs[linked.source].addEventListener('input', function () {
        if (!slugManuallyEdited) {
          inputs[linked.target].value = linked.slugify(inputs[linked.source].value);
        }
        runValidation();
      });

      // Détecter édition manuelle du slug
      inputs[linked.target].addEventListener('input', function () {
        var autoSlug = linked.slugify(inputs[linked.source].value);
        slugManuallyEdited = (inputs[linked.target].value !== autoSlug);
        runValidation();
      });

      // Slug : sanitize au blur
      inputs[linked.target].addEventListener('blur', function () {
        inputs[linked.target].value = linked.slugify(inputs[linked.target].value);
        runValidation();
      });
    } else {
      // Sans lien, écouter tous les champs
      opts.fields.forEach(function (f) {
        inputs[f.key].addEventListener('input', function () { runValidation(); });
        if (f.key === 'slug' || (linked && f.key === linked.target)) {
          inputs[f.key].addEventListener('blur', function () {
            if (opts.linkedSlug && opts.linkedSlug.slugify) {
              inputs[f.key].value = opts.linkedSlug.slugify(inputs[f.key].value);
            }
            runValidation();
          });
        }
      });
    }

    // Confirmer
    function doConfirm() {
      if (confirmBtn.disabled) return;
      close(getValues());
    }

    confirmBtn.addEventListener('click', doConfirm);

    // Enter pour valider (sur le dernier champ)
    var lastField = opts.fields[opts.fields.length - 1];
    inputs[lastField.key].addEventListener('keydown', function handler(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        inputs[lastField.key].removeEventListener('keydown', handler);
        doConfirm();
      }
    });

    // Validation initiale
    runValidation();

    previousFocus = document.activeElement;
    overlay.classList.add('bld-modal-overlay--visible');

    // Focus le premier champ
    var firstField = opts.fields[0];
    setTimeout(function () {
      inputs[firstField.key].focus();
      if (inputs[firstField.key].value) inputs[firstField.key].select();
    }, 50);

    return new Promise(function (resolve) { currentResolve = resolve; });
  }

  /* ══════════════════════════════════════
     PUBLIC API
     ══════════════════════════════════════ */

  window.BuilderModal = {
    confirm: confirm,
    prompt: prompt,
    form: form
  };

})();
