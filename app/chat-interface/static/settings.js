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
          <div class="settings-section theme-section">
            <h3>Theme</h3>
            <label class="toggle-row theme-toggle">
              <span class="toggle-label">Dark Mode</span>
              <div class="toggle-with-icons">
                <svg class="theme-icon sun-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="5"></circle>
                  <line x1="12" y1="1" x2="12" y2="3"></line>
                  <line x1="12" y1="21" x2="12" y2="23"></line>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                  <line x1="1" y1="12" x2="3" y2="12"></line>
                  <line x1="21" y1="12" x2="23" y2="12"></line>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                </svg>
                <input type="checkbox" id="darkModeToggle">
                <span class="toggle-slider"></span>
                <svg class="theme-icon moon-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                </svg>
              </div>
            </label>
          </div>

          <div class="settings-card">
            <h3>API Models (Large Language Models)</h3>
            <p class="settings-description">
              Large cloud-based models (GPT-4, DeepSeek R1, Llama 3.1 405B) enabled by default with free quota via GitHub Models.<br>
              <br>
              <strong>Local:</strong> Unlimited, private (3-4B params) <br>
              <strong>API:</strong> Free quota (default), powerful (70B+ params)
            </p>
            <label class="toggle-row">
              <span class="toggle-label">Enable API Models</span>
              <input type="checkbox" id="enableApiModels">
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div class="settings-card token-card" id="tokenSection">
            <h3>GitHub Models API Token (Optional)</h3>
            <p class="settings-description">Default token (free quota) is provided. Optionally configure your own token for dedicated quota.</p>
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
            <a href="https://github.com/settings/personal-access-tokens/new?description=GitHub+Models+API+token&name=GitHub+Models+Chat&user_models=read" target="_blank" rel="noopener" class="create-token-btn">
              Create a token
            </a>
            <div class="token-security-note">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              <span>Token is saved in your browser only and injected per request. We never store it on our servers.</span>
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
    const html = document.documentElement;
    const savedTheme = localStorage.getItem('theme') || 'light';
    html.setAttribute('data-theme', savedTheme);

    // Dark mode toggle in settings modal
    const darkModeToggle = modal?.querySelector('#darkModeToggle');
    if (darkModeToggle) {
      darkModeToggle.checked = savedTheme === 'dark';

      darkModeToggle.addEventListener('change', () => {
        const nextTheme = darkModeToggle.checked ? 'dark' : 'light';
        html.setAttribute('data-theme', nextTheme);
        localStorage.setItem('theme', nextTheme);
      });
    }
  }

  const API_MODELS_STORAGE_KEY = 'api_models_enabled';
  let apiModelsCheckbox;

  function initApiModelsToggle() {
    apiModelsCheckbox = modal?.querySelector('#enableApiModels');
    if (!apiModelsCheckbox) return;

    // Load saved state (default: true/enabled with free quota)
    const savedValue = localStorage.getItem(API_MODELS_STORAGE_KEY);
    const savedState = savedValue === null ? true : savedValue === 'true';
    apiModelsCheckbox.checked = savedState;
    updateTokenSectionVisibility(savedState);

    apiModelsCheckbox.addEventListener('change', () => {
      const enabled = apiModelsCheckbox.checked;
      localStorage.setItem(API_MODELS_STORAGE_KEY, enabled ? 'true' : 'false');
      updateTokenSectionVisibility(enabled);
      // Dispatch event so model selector can update
      window.dispatchEvent(new CustomEvent('api-models-toggle', { detail: { enabled } }));
    });
  }

  function updateTokenSectionVisibility(enabled) {
    const tokenSection = modal?.querySelector('#tokenSection');
    if (tokenSection) {
      if (enabled) {
        tokenSection.classList.add('show');
      } else {
        tokenSection.classList.remove('show');
      }
    }
  }

  function init() {
    if (initialized) return;
    initialized = true;
    ensureModal();
    initThemeToggle();
    attachSettingsTriggers();
    initTokenInput();
    initApiModelsToggle();
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
    },
    isApiModelsEnabled: () => {
      const saved = localStorage.getItem(API_MODELS_STORAGE_KEY);
      return saved === null ? true : saved === 'true';
    },
    setApiModelsEnabled: (enabled) => {
      localStorage.setItem(API_MODELS_STORAGE_KEY, enabled ? 'true' : 'false');
      if (apiModelsCheckbox) apiModelsCheckbox.checked = enabled;
      updateTokenSectionVisibility(enabled);
      window.dispatchEvent(new CustomEvent('api-models-toggle', { detail: { enabled } }));
    }
  };
})();
