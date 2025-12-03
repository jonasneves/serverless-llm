(() => {
  const TOKEN_STORAGE_KEY = 'github_models_token';
  let modal;
  let closeBtn;
  let tokenInput;
  let tokenVisibilityBtn;
  let eyeIcon;
  let initialized = false;

  const modalTemplate = `
    <div id="settingsModal" class="settings-modal" aria-hidden="true">
      <div class="settings-modal-content" role="dialog" aria-modal="true" aria-labelledby="settingsTitle">
        <div class="settings-modal-header">
          <h2 id="settingsTitle">Settings</h2>
          <button id="closeSettings" class="close-btn" aria-label="Close settings">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="settings-modal-body">
          <div class="settings-section token-section" id="tokenSection">
            <h3>GitHub Models API Token</h3>
            <p class="settings-description">Use your own GitHub token for API models. Leave empty to use the server default when available.</p>
            <div class="token-input-row">
              <input
                type="password"
                id="githubToken"
                class="token-input"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                autocomplete="off"
              >
              <button type="button" id="tokenVisibilityBtn" class="token-visibility-btn" title="Show/hide token">
                <svg id="eyeIcon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
            </div>
            <div class="token-hint">
              <a href="https://github.com/settings/personal-access-tokens/new?description=GitHub+Models+API+token&name=GitHub+Models+Arena&user_models=read" target="_blank" rel="noopener">Create a token</a> (pre-filled, opens in new tab)
            </div>
            <div class="token-hint" style="margin-top: 8px; opacity: 0.75;">
              🔒 Token is saved in your browser only and injected per request. We never store it on our servers.
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  function ensureModal() {
    if (modal) return;
    const existing = document.getElementById('settingsModal');
    if (existing) {
      modal = existing;
    } else {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = modalTemplate.trim();
      modal = wrapper.firstElementChild;
      document.body.appendChild(modal);
    }
    closeBtn = modal.querySelector('#closeSettings');
    tokenInput = modal.querySelector('#githubToken');
    tokenVisibilityBtn = modal.querySelector('#tokenVisibilityBtn');
    eyeIcon = modal.querySelector('#eyeIcon');
  }

  function openModal() {
    ensureModal();
    modal.classList.add('open');
    document.body.classList.add('modal-open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove('open');
    document.body.classList.remove('modal-open');
    modal.setAttribute('aria-hidden', 'true');
  }

  function dispatchTokenChange(token) {
    window.dispatchEvent(new CustomEvent('github-token-change', {
      detail: { token }
    }));
  }

  function setTokenInputValue(value, { silent = false } = {}) {
    if (!tokenInput) return;
    tokenInput.value = value;
    if (!silent) {
      dispatchTokenChange(tokenInput.value.trim());
    }
  }

  function initTokenInput() {
    if (!tokenInput) return;
    const savedToken = localStorage.getItem(TOKEN_STORAGE_KEY) || '';
    setTokenInputValue(savedToken, { silent: true });

    tokenInput.addEventListener('input', () => {
      const value = tokenInput.value.trim();
      if (value) {
        localStorage.setItem(TOKEN_STORAGE_KEY, value);
      } else {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
      dispatchTokenChange(value);
    });

    tokenVisibilityBtn?.addEventListener('click', () => {
      if (!tokenInput) return;
      const isPassword = tokenInput.type === 'password';
      tokenInput.type = isPassword ? 'text' : 'password';
      if (eyeIcon) {
        eyeIcon.innerHTML = isPassword
          ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>'
          : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
      }
    });
  }

  function initModalBehavior() {
    closeBtn?.addEventListener('click', closeModal);
    modal?.addEventListener('click', (event) => {
      if (event.target === modal) {
        closeModal();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && modal?.classList.contains('open')) {
        closeModal();
      }
    });
  }

  function attachSettingsTriggers() {
    const triggers = document.querySelectorAll('[data-settings-trigger]');
    triggers.forEach((trigger) => {
      trigger.addEventListener('click', (event) => {
        event.preventDefault();
        openModal();
      });
    });
  }

  function initThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    const html = document.documentElement;
    const savedTheme = localStorage.getItem('theme') || 'light';
    html.setAttribute('data-theme', savedTheme);

    themeToggle?.addEventListener('click', () => {
      const currentTheme = html.getAttribute('data-theme');
      const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
      html.setAttribute('data-theme', nextTheme);
      localStorage.setItem('theme', nextTheme);
    });
  }

  function init() {
    if (initialized) return;
    initialized = true;
    ensureModal();
    initThemeToggle();
    attachSettingsTriggers();
    initTokenInput();
    initModalBehavior();
    dispatchTokenChange(tokenInput?.value.trim() || '');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.SettingsPanel = {
    open: openModal,
    close: closeModal,
    getToken: () => (tokenInput ? tokenInput.value.trim() : ''),
    setToken: (value) => {
      ensureModal();
      setTokenInputValue(value, { silent: false });
      if (value) {
        localStorage.setItem(TOKEN_STORAGE_KEY, value);
      } else {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    }
  };
})();
