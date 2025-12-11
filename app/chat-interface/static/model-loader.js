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
   * Get all local models
   */
  getLocalModels() {
    return this.models.filter(model => model.type === 'local');
  }

  /**
   * Get all API models
   */
  getAPIModels() {
    return this.models.filter(model => model.type === 'api');
  }

  /**
   * Build participant checkboxes for Discussion mode
   */
  buildParticipantCheckboxes(containerSelector) {
    // Legacy support - not used if using ModelSelector
    // But kept for backward compatibility if needed
    const container = document.querySelector(containerSelector);
    if (!container) return;

    container.innerHTML = '';

    // Group models
    const localModels = this.getLocalModels();
    const apiModels = this.getAPIModels();

    // Helper to add checkbox
    const addCheckbox = (model, type) => {
      const label = this.createParticipantCheckbox(
        model.id,
        model.name,
        type,
        type === 'local' // Default check local only
      );
      container.appendChild(label);
    };

    localModels.forEach(m => addCheckbox(m, 'local'));
    apiModels.forEach(m => addCheckbox(m, 'api'));
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

    // Group API models
    const apiModels = this.getAPIModels();
    const localModels = this.getLocalModels();

    // Track if we found the default model
    let defaultFound = false;

    // Local Models group (show first, but don't default to local)
    if (localModels.length > 0) {
      const localGroup = document.createElement('optgroup');
      localGroup.label = 'Local Models';

      localModels.forEach((model) => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.name;
        localGroup.appendChild(option);
      });
      select.appendChild(localGroup);
    }

    // API Models group (default to gpt-5-nano)
    if (apiModels.length > 0) {
      const apiGroup = document.createElement('optgroup');
      apiGroup.label = 'API Models';

      apiModels.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.name;
        // Default to gpt-5-nano if available
        if (model.id === 'openai/gpt-5-nano') {
          option.selected = true;
          defaultFound = true;
        }
        apiGroup.appendChild(option);
      });
      select.appendChild(apiGroup);
    }

    // Fallback: if gpt-5-nano not found, select first API model, then first local model
    if (!defaultFound) {
      if (apiModels.length > 0) {
        select.options[localModels.length].selected = true; // First API model
      } else if (localModels.length > 0) {
        select.options[0].selected = true; // First local model
      }
    }

    console.log('[ModelLoader] Built orchestrator dropdown:',
      `${localModels.length} local, ${apiModels.length} API, default: ${select.value}`);
  }

  /**
   * Build model selector for Verbalized Sampling mode
   */
  buildModelSelector(selectSelector) {
    const select = document.querySelector(selectSelector);
    if (!select) return;

    select.innerHTML = '';

    // Show all allowed models (local used to be only option, now maybe support API too?)
    // For now, verbalized sampling might only support local models if it relies on local features
    // But let's expose all consistent with other UIs

    // Use optgroups if mixed
    const localModels = this.getLocalModels();
    const apiModels = this.getAPIModels();

    if (localModels.length && apiModels.length) {
      const localGroup = document.createElement('optgroup');
      localGroup.label = 'Local Models';
      localModels.forEach((model, i) => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.name;
        if (i === 0) option.selected = true;
        localGroup.appendChild(option);
      });
      select.appendChild(localGroup);

      const apiGroup = document.createElement('optgroup');
      apiGroup.label = 'API Models';
      apiModels.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.name;
        apiGroup.appendChild(option);
      });
      select.appendChild(apiGroup);
    } else {
      // Just flat list
      [...localModels, ...apiModels].forEach((model, i) => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.name;
        if (i === 0) option.selected = true;
        select.appendChild(option);
      });
    }

    console.log('[ModelLoader] Built model selector');
  }

  /**
   * Get display name for a model ID
   */
  getDisplayName(modelId) {
    const model = this.models.find(m => m.id === modelId);
    return model ? model.name : modelId;
  }
}
// Remove duplicate class definition/module export hack if present, keep simple
class ModelLoader_Export { }


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
