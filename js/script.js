/* ==========================================================
   SDN PAKUKERTO II — AUTH MODAL (LOGIN / REGISTER) + SESSION UI
   Front-end only: this simulates the future authentication
   flow. It does not call a server, store real credentials, or
   implement real authentication — Local Storage is used only
   to remember a simulated "logged in" state across pages.

   Responsibilities:
     - Open/close the modal (close button, outside click, Escape).
     - Switch between the Login and Register panels.
     - Register: basic required-field / password-match validation.
     - Login: accepts any input (no validation), shows a brief
       loading state then a success message, then stores a sample
       session in Local Storage and closes the modal.
     - Single nav account button: "Portal Siswa" (opens the modal)
       before login, "<name> ▼" (opens a dropdown with Portal
       Kelulusan + Keluar) after login.
     - Broadcast a "sdn:authchange" event so other page-specific
       scripts (e.g. the Graduation dashboard) can react without
       a page reload.
   ========================================================== */

(function () {
  var AUTH_KEY = 'sdn_auth_session';

  // Sample identity used for every simulated login — there is no
  // backend to look up a real student, so this stands in for one.
  var SAMPLE_SESSION = {
    name: 'David Alvin',
    nisn: '0057382910'
  };

  function getSession() {
    try {
      var raw = localStorage.getItem(AUTH_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function setSession(session) {
    try {
      localStorage.setItem(AUTH_KEY, JSON.stringify(session));
    } catch (e) {
      /* Local Storage unavailable — simulation simply won't persist. */
    }
  }

  function clearSession() {
    try {
      localStorage.removeItem(AUTH_KEY);
    } catch (e) {
      /* no-op */
    }
  }

  function broadcastAuthChange() {
    window.dispatchEvent(new CustomEvent('sdn:authchange', { detail: getSession() }));
  }

  // Small shared namespace so other page-specific scripts (like the
  // Graduation dashboard) can read the session without duplicating
  // the Local Storage logic.
  window.SDNAuth = {
    SAMPLE_SESSION: SAMPLE_SESSION,
    getSession: getSession
  };

  // Shared with initAuthUI so the account trigger can open the modal
  // when the user isn't logged in yet.
  var openAuthModal = function () {};

  document.addEventListener('DOMContentLoaded', function () {
    initAuthModal();
    initAuthUI();
  });

  /* ---------- Modal: open/close, panel switching, forms ---------- */
  function initAuthModal() {
    var overlay = document.getElementById('auth-overlay');
    if (!overlay) return;

    var closeBtn = document.getElementById('auth-modal-close');
    var openTriggers = document.querySelectorAll('[data-open-auth]');
    var switchButtons = overlay.querySelectorAll('[data-switch-to]');
    var loginForm = document.getElementById('login-form');
    var registerForm = document.getElementById('register-form');
    var authSuccess = document.getElementById('auth-success');

    var panels = {
      login: document.getElementById('auth-panel-login'),
      register: document.getElementById('auth-panel-register')
    };

    var lastFocusedElement = null;

    function showPanel(name) {
      Object.keys(panels).forEach(function (key) {
        panels[key].classList.toggle('is-active', key === name);
      });
    }

    function focusFirstField() {
      var field = overlay.querySelector('.auth-panel.is-active input');
      if (field) field.focus();
    }

    function resetLoginView() {
      loginForm.classList.remove('is-hidden');
      authSuccess.classList.remove('is-visible');
      authSuccess.hidden = true;
    }

    function openModal(panelName) {
      lastFocusedElement = document.activeElement;
      clearAllErrors();
      resetLoginView();
      showPanel(panelName || 'login');
      overlay.classList.add('is-open');
      overlay.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      focusFirstField();
    }

    function closeModal() {
      if (!overlay.classList.contains('is-open')) return;
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
        lastFocusedElement.focus();
      }
    }

    function isOpen() {
      return overlay.classList.contains('is-open');
    }

    // Make this available to initAuthUI (the account trigger opens
    // the modal itself when the user isn't logged in yet).
    openAuthModal = openModal;

    /* Open / close triggers */
    openTriggers.forEach(function (trigger) {
      trigger.addEventListener('click', function () {
        openModal(trigger.getAttribute('data-open-auth'));
      });
    });

    closeBtn.addEventListener('click', closeModal);

    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) closeModal();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && isOpen()) closeModal();
    });

    /* Switch between Login / Register */
    switchButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        clearAllErrors();
        showPanel(button.getAttribute('data-switch-to'));
        focusFirstField();
      });
    });

    /* Validation helpers (used by Register only — see Login below) */
    function setFieldError(input, message) {
      var errorEl = overlay.querySelector('[data-error-for="' + input.id + '"]');
      if (errorEl) errorEl.textContent = message;
      input.classList.add('has-error');
    }

    function clearFieldError(input) {
      var errorEl = overlay.querySelector('[data-error-for="' + input.id + '"]');
      if (errorEl) errorEl.textContent = '';
      input.classList.remove('has-error');
    }

    function clearAllErrors() {
      overlay.querySelectorAll('.form-error').forEach(function (el) {
        el.textContent = '';
      });
      overlay.querySelectorAll('.has-error').forEach(function (el) {
        el.classList.remove('has-error');
      });
    }

    function requireValue(input, message) {
      if (!input.value.trim()) {
        setFieldError(input, message);
        return false;
      }
      return true;
    }

    /* Button loading state (spinner replaces the label, button disabled) */
    function setButtonLoading(button, loadingText) {
      button.dataset.originalHtml = button.innerHTML;
      button.disabled = true;
      button.innerHTML =
        '<svg class="btn-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
        '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="38 18"/>' +
        '</svg>' + loadingText;
    }

    function resetButton(button) {
      if (button.dataset.originalHtml) {
        button.innerHTML = button.dataset.originalHtml;
        delete button.dataset.originalHtml;
      }
      button.disabled = false;
    }

    /* ---------- Login: front-end simulation — accepts any input ---------- */
    loginForm.addEventListener('submit', function (event) {
      event.preventDefault();
      // No validation on purpose: this is a UI simulation with no
      // backend, so any NISN/password combination "succeeds".
      var submitBtn = loginForm.querySelector('button[type="submit"]');
      setButtonLoading(submitBtn, 'Memproses...');

      // Brief simulated loading delay, then a success message, then
      // the modal closes itself — the whole sequence never needs the
      // user to click anything else.
      setTimeout(function () {
        resetButton(submitBtn);
        setSession(SAMPLE_SESSION);
        updateAuthUI();
        broadcastAuthChange();

        loginForm.classList.add('is-hidden');
        authSuccess.hidden = false;
        // Restart the CSS animation each time it's shown.
        authSuccess.classList.remove('is-visible');
        void authSuccess.offsetWidth;
        authSuccess.classList.add('is-visible');

        setTimeout(function () {
          loginForm.reset();
          closeModal();
        }, 1000);
      }, 700);
    });

    /* ---------- Register validation ---------- */
    registerForm.addEventListener('submit', function (event) {
      event.preventDefault();
      clearAllErrors();

      var name = document.getElementById('register-name');
      var nisn = document.getElementById('register-nisn');
      var password = document.getElementById('register-password');
      var confirm = document.getElementById('register-confirm');
      var valid = true;

      if (!requireValue(name, 'Nama lengkap wajib diisi.')) valid = false;
      if (!requireValue(nisn, 'NISN wajib diisi.')) valid = false;
      if (!requireValue(password, 'Kata sandi wajib diisi.')) valid = false;
      if (!requireValue(confirm, 'Konfirmasi kata sandi wajib diisi.')) valid = false;

      if (valid && password.value !== confirm.value) {
        setFieldError(confirm, 'Kata sandi dan konfirmasi tidak cocok.');
        valid = false;
      }

      if (valid) {
        // Front-end simulation only — no real registration happens here.
        registerForm.reset();
        showPanel('login');
        focusFirstField();
      }
    });

    /* Clear a field's error as soon as the user edits it */
    [loginForm, registerForm].forEach(function (form) {
      form.querySelectorAll('input').forEach(function (input) {
        input.addEventListener('input', function () {
          clearFieldError(input);
        });
      });
    });
  }

  /* ---------- Nav: single account trigger + dropdown ---------- */
  function initAuthUI() {
    var accounts = document.querySelectorAll('.header-account');
    if (!accounts.length) return;

    document.querySelectorAll('.user-chip__trigger').forEach(function (trigger) {
      trigger.addEventListener('click', function (event) {
        event.stopPropagation();

        if (!getSession()) {
          // Not logged in yet — this button's job is to open the modal.
          openAuthModal('login');
          return;
        }

        var menu = trigger.parentElement.querySelector('.user-chip__menu');
        var wasOpen = trigger.getAttribute('aria-expanded') === 'true';
        closeAllUserMenus();
        if (!wasOpen) {
          trigger.setAttribute('aria-expanded', 'true');
          menu.classList.add('is-open');
        }
      });
    });

    document.querySelectorAll('.user-chip__logout').forEach(function (button) {
      button.addEventListener('click', function () {
        clearSession();
        closeAllUserMenus();
        updateAuthUI();
        broadcastAuthChange();
      });
    });

    document.addEventListener('click', function (event) {
      if (!event.target.closest('.header-account')) closeAllUserMenus();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeAllUserMenus();
    });

    updateAuthUI();
  }

  function closeAllUserMenus() {
    document.querySelectorAll('.user-chip__trigger').forEach(function (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
    });
    document.querySelectorAll('.user-chip__menu').forEach(function (menu) {
      menu.classList.remove('is-open');
    });
  }

  function updateAuthUI() {
    var session = getSession();

    document.querySelectorAll('.user-chip__name').forEach(function (label) {
      var nextText = session ? (session.name || 'Portal Siswa') : 'Portal Siswa';
      if (label.textContent === nextText) return;

      // Small fade so the label change feels intentional, not a jump-cut.
      label.classList.add('is-fading');
      setTimeout(function () {
        label.textContent = nextText;
        label.classList.remove('is-fading');
      }, 200);
    });

    document.querySelectorAll('.user-chip__caret').forEach(function (caret) {
      caret.hidden = !session;
    });

    if (!session) closeAllUserMenus();
  }
})();
