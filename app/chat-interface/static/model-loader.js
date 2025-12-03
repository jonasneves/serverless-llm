/**
 * Dynamic Model Loader
 * Single source of truth for available models - fetches from /api/models
 * All frontend pages should use this instead of hardcoding model lists
 */

class ModelLoader {
  constructor() {
    this.models = [];
    this.endpoints = {};
    this.defaultModel = null;
    this.loaded = false;
  }

  /**
   * Fetch available models from backend
   */
  async load() {
    if (this.loaded) return this;

    try {
      const response = await fetch('/api/models');
      const data = await response.json();

      this.models = data.models || [];
      this.endpoints = data.endpoints || {};
      this.defaultModel = data.default_model;
      this.loaded = true;

      console.log(`[ModelLoader] Loaded ${this.models.length} models:`,
        this.models.map(m => m.id).join(', '));

      return this;
    } catch (error) {
      console.error('[ModelLoader] Failed to load models:', error);
      throw error;
    }
  }

  /**
   * Get all local models (non-API)
   */
  getLocalModels() {
    // Local models are those with localhost or custom domain endpoints
    // API models would be identified differently (e.g., github.com endpoints)
    return this.models.filter(model => {
      const endpoint = this.endpoints[model.id] || '';
      return !endpoint.includes('models.github.com') &&
             !endpoint.includes('openai.com');
    });
  }

  /**
   * Get all API models
   */
  getAPIModels() {
    // For now, we'll need to maintain a list of known API models
    // In the future, this could be a flag in MODEL_CONFIG
    const knownAPIModels = [
      'gpt-4.1', 'gpt-4o', 'gpt-5', 'gpt-5-mini', 'gpt-5-nano',
      'deepseek-v3-0324', 'llama-3.3-70b-instruct',
      'llama-4-scout-17b-16e-instruct', 'meta-llama-3.1-405b-instruct',
      'cohere-command-r-plus-08-2024'
    ];
    return knownAPIModels;
  }

  /**
   * Build participant checkboxes for Discussion mode
   * Supports both single container (legacy) and separate containers for local/API
   */
  buildParticipantCheckboxes(containerSelector) {
    // Check if separate containers exist
    const localContainer = document.querySelector('#localParticipantsContainer');
    const apiContainer = document.querySelector('#apiParticipantsContainer');
    
    if (localContainer && apiContainer) {
      // New format: separate containers
      localContainer.innerHTML = '';
      apiContainer.innerHTML = '';

      // Add local models
      const localModels = this.getLocalModels();
      localModels.forEach(model => {
        const label = this.createParticipantCheckbox(
          model.id,
          model.name,
          'local',
          true // checked by default
        );
        localContainer.appendChild(label);
      });

      // Add API models
      const apiModels = this.getAPIModels();
      apiModels.forEach(modelId => {
        const displayName = this.getDisplayName(modelId);
        const label = this.createParticipantCheckbox(
          modelId,
          displayName,
          'api',
          false // not checked by default
        );
        apiContainer.appendChild(label);
      });

      console.log('[ModelLoader] Built participant checkboxes (separate):',
        `${localModels.length} local, ${apiModels.length} API`);
    } else {
      // Legacy format: single container
      const container = document.querySelector(containerSelector);
      if (!container) {
        console.error('[ModelLoader] Container not found:', containerSelector);
        return;
      }

      container.innerHTML = '';

      // Add local models
      const localModels = this.getLocalModels();
      localModels.forEach(model => {
        const label = this.createParticipantCheckbox(
          model.id,
          model.name,
          'local',
          true // checked by default
        );
        container.appendChild(label);
      });

      // Add API models
      const apiModels = this.getAPIModels();
      apiModels.forEach(modelId => {
        const displayName = this.getDisplayName(modelId);
        const label = this.createParticipantCheckbox(
          modelId,
          displayName,
          'api',
          false // not checked by default
        );
        container.appendChild(label);
      });

      console.log('[ModelLoader] Built participant checkboxes (single):',
        `${localModels.length} local, ${apiModels.length} API`);
    }
  }

  /**
   * Create a single participant checkbox element
   */
  createParticipantCheckbox(modelId, displayName, type, checked) {
    const label = document.createElement('label');
    label.className = 'participant-checkbox';
    label.title = type === 'local'
      ? 'Local model - no API cost'
      : 'API model - uses GitHub Models credits';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = 'participant';
    input.value = modelId;
    input.dataset.type = type;
    if (checked) input.checked = true;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'participant-name';
    nameSpan.textContent = displayName;

    const badgeSpan = document.createElement('span');
    badgeSpan.className = `participant-badge ${type}`;
    badgeSpan.textContent = type === 'local' ? 'Local' : 'API';

    label.appendChild(input);
    label.appendChild(nameSpan);
    label.appendChild(badgeSpan);

    return label;
  }

  /**
   * Build orchestrator dropdown for Discussion mode
   */
  buildOrchestratorDropdown(selectSelector) {
    const select = document.querySelector(selectSelector);
    if (!select) {
      console.error('[ModelLoader] Select not found:', selectSelector);
      return;
    }

    select.innerHTML = '';

    // API Models group
    const apiGroup = document.createElement('optgroup');
    apiGroup.label = 'API - High Rate Limit';

    const apiHighRate = [
      { id: 'gpt-4.1', name: 'GPT-4.1 (Recommended)' },
      { id: 'gpt-4o', name: 'GPT-4o', selected: true },
      { id: 'deepseek-v3-0324', name: 'DeepSeek V3' },
      { id: 'cohere-command-r-plus-08-2024', name: 'Cohere Command R+' },
      { id: 'llama-3.3-70b-instruct', name: 'Llama 3.3 70B' },
      { id: 'llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout 17B' },
      { id: 'meta-llama-3.1-405b-instruct', name: 'Llama 3.1 405B' }
    ];

    apiHighRate.forEach(model => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.name;
      if (model.selected) option.selected = true;
      apiGroup.appendChild(option);
    });
    select.appendChild(apiGroup);

    // GPT-5 group
    const gpt5Group = document.createElement('optgroup');
    gpt5Group.label = 'API - GPT-5 (Custom Limits)';

    const gpt5Models = [
      { id: 'gpt-5', name: 'GPT-5' },
      { id: 'gpt-5-mini', name: 'GPT-5 Mini' },
      { id: 'gpt-5-nano', name: 'GPT-5 Nano' }
    ];

    gpt5Models.forEach(model => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.name;
      gpt5Group.appendChild(option);
    });
    select.appendChild(gpt5Group);

    // Local Models group (dynamic from loaded models)
    const localGroup = document.createElement('optgroup');
    localGroup.label = 'Local Models';

    const localModels = this.getLocalModels();
    localModels.forEach(model => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.name;
      localGroup.appendChild(option);
    });
    select.appendChild(localGroup);

    console.log('[ModelLoader] Built orchestrator dropdown:',
      `${localModels.length} local models`);
  }

  /**
   * Build model selector for Verbalized Sampling mode
   */
  buildModelSelector(selectSelector) {
    const select = document.querySelector(selectSelector);
    if (!select) {
      console.error('[ModelLoader] Select not found:', selectSelector);
      return;
    }

    select.innerHTML = '';

    const localModels = this.getLocalModels();
    localModels.forEach((model, index) => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.name;
      if (index === 0 || model.default) option.selected = true;
      select.appendChild(option);
    });

    console.log('[ModelLoader] Built model selector:',
      `${localModels.length} models`);
  }

  /**
   * Get display name for a model ID
   */
  getDisplayName(modelId) {
    const model = this.models.find(m => m.id === modelId);
    if (model) return model.name;

    // Fallback display names for API models
    const fallbackNames = {
      'gpt-4.1': 'GPT-4.1',
      'gpt-4o': 'GPT-4o',
      'gpt-5': 'GPT-5',
      'gpt-5-mini': 'GPT-5 Mini',
      'gpt-5-nano': 'GPT-5 Nano',
      'deepseek-v3-0324': 'DeepSeek V3',
      'llama-3.3-70b-instruct': 'Llama 3.3 70B',
      'llama-4-scout-17b-16e-instruct': 'Llama 4 Scout 17B',
      'meta-llama-3.1-405b-instruct': 'Llama 3.1 405B',
      'cohere-command-r-plus-08-2024': 'Cohere Command R+'
    };

    return fallbackNames[modelId] || modelId;
  }
}

// Global instance
const modelLoader = new ModelLoader();

// Auto-load on page ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    modelLoader.load().catch(console.error);
  });
} else {
  modelLoader.load().catch(console.error);
}
