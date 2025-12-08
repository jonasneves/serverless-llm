/**
 * Reusable Model Selector Component
 * Provides a standardized model selection UI with status indicators
 * Works in both single-select and multi-select modes
 */

class ModelSelector {
  constructor(containerSelector, options = {}) {
    this.container = document.querySelector(containerSelector);
    if (!this.container) {
      console.error('[ModelSelector] Container not found:', containerSelector);
      return;
    }

    this.options = {
      multiSelect: options.multiSelect !== false, // Default to multi-select
      autoSelectOnline: options.autoSelectOnline !== false, // Default to true
      onSelectionChange: options.onSelectionChange || null,
      showStatus: options.showStatus !== false, // Default to true
      ...options
    };

    this.models = {};
    this.selectedModels = new Set();
    this.statusIntervalId = null;
    this.initialCheckDone = false;
  }

  /**
   * Load models from API
   */
  async loadModels() {
    try {
      const response = await fetch('/api/models');
      const data = await response.json();

      this.models = {};
      this.selectedModels.clear();

      data.models.forEach((model) => {
        this.models[model.id] = {
          name: model.name,
          type: model.type || 'local',  // 'local' or 'api'
          status: model.type === 'api' ? 'available' : 'checking',  // API models always available
          context_length: model.context_length || 0
        };
      });

      this.render();

      // Only check status for local models
      const localModels = Object.entries(this.models).filter(([id, m]) => m.type === 'local');
      if (localModels.length) {
        await this.checkAllModels();
        if (!this.statusIntervalId) {
          this.statusIntervalId = setInterval(() => this.checkAllModels(), 30000);
        }
      } else {
        // If no local models, mark as done
        this.initialCheckDone = true;
      }
    } catch (error) {
      console.error('[ModelSelector] Failed to load models:', error);
      this.render();
    }
  }

  /**
   * Check status of a single model (local models only)
   */
  async checkModelStatus(modelId) {
    if (!this.models[modelId]) return;

    // Skip API models - they don't have local health endpoints
    if (this.models[modelId].type === 'api') return;

    try {
      const response = await fetch(`/api/models/${modelId}/status`);
      const data = await response.json();
      this.models[modelId].status = data.status === 'online' ? 'online' : 'offline';
    } catch {
      this.models[modelId].status = 'offline';
    }

    if (this.initialCheckDone) {
      this.render();
    }
  }

  /**
   * Check status of all local models
   */
  async checkAllModels() {
    if (!Object.keys(this.models).length) return;

    // Only check local models
    const localModelIds = Object.entries(this.models)
      .filter(([id, m]) => m.type === 'local')
      .map(([id]) => id);

    const checks = localModelIds.map(id => this.checkModelStatus(id));
    await Promise.all(checks);

    // On initial load, auto-select online/available models if enabled
    if (!this.initialCheckDone && this.options.autoSelectOnline) {
      this.selectedModels.clear();
      for (const [id, model] of Object.entries(this.models)) {
        // Select online local models AND available API models
        if (model.status === 'online' || model.status === 'available') {
          // Only auto-select local models by default (API models require token)
          if (model.type === 'local') {
            this.selectedModels.add(id);
          }
        }
      }
      this.initialCheckDone = true;
      this.render();
      this.notifySelectionChange();
    } else if (!this.initialCheckDone) {
      this.initialCheckDone = true;
      this.render();
    }
  }

  /**
   * Toggle model selection
   */
  toggleModel(id) {
    if (!this.options.multiSelect) {
      // Single select mode - replace selection
      this.selectedModels.clear();
      this.selectedModels.add(id);
    } else {
      // Multi-select mode - toggle
      if (this.selectedModels.has(id)) {
        this.selectedModels.delete(id);
      } else {
        this.selectedModels.add(id);
      }
    }

    this.render();
    this.notifySelectionChange();
  }

  /**
   * Get selected models
   */
  getSelected() {
    if (this.options.multiSelect) {
      return Array.from(this.selectedModels);
    } else {
      return this.selectedModels.size > 0 ? Array.from(this.selectedModels)[0] : null;
    }
  }

  /**
   * Set selected models
   */
  setSelected(modelIds) {
    this.selectedModels.clear();
    if (Array.isArray(modelIds)) {
      modelIds.forEach(id => {
        if (this.models[id]) {
          this.selectedModels.add(id);
        }
      });
    } else if (modelIds) {
      this.selectedModels.add(modelIds);
    }
    this.render();
    this.notifySelectionChange();
  }

  /**
   * Clear selection
   */
  clearSelection() {
    this.selectedModels.clear();
    this.render();
    this.notifySelectionChange();
  }

  /**
   * Render the model selector
   */
  render() {
    if (!this.container) return;

    this.container.innerHTML = '';

    // Group models by type
    const localModels = Object.entries(this.models).filter(([id, m]) => m.type === 'local');
    const apiModels = Object.entries(this.models).filter(([id, m]) => m.type === 'api');

    // Render local models first
    for (const [id, model] of localModels) {
      this.container.appendChild(this.createChip(id, model));
    }

    // Add separator if we have both types
    if (localModels.length && apiModels.length) {
      const separator = document.createElement('div');
      separator.className = 'model-selector-separator';
      separator.innerHTML = '<span class="separator-label">API Models</span>';
      this.container.appendChild(separator);
    }

    // Render API models
    for (const [id, model] of apiModels) {
      this.container.appendChild(this.createChip(id, model));
    }
  }

  /**
   * Create a model chip element
   */
  createChip(id, model) {
    const chip = document.createElement('div');
    chip.className = `model-chip ${this.selectedModels.has(id) ? 'selected' : ''} model-type-${model.type}`;

    const statusDot = this.options.showStatus
      ? `<span class="status-dot status-${model.status}"></span>`
      : '';

    const typeBadge = model.type === 'api'
      ? '<span class="model-type-badge api">API</span>'
      : '';

    chip.innerHTML = `
      ${statusDot}
      <span class="model-name-text">${model.name}</span>
      ${typeBadge}
    `;

    chip.onclick = () => this.toggleModel(id);
    return chip;
  }

  /**
   * Notify selection change callback
   */
  notifySelectionChange() {
    if (this.options.onSelectionChange) {
      this.options.onSelectionChange(this.getSelected());
    }
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.statusIntervalId) {
      clearInterval(this.statusIntervalId);
      this.statusIntervalId = null;
    }
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ModelSelector;
}