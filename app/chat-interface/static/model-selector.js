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
    this.isOpen = false;
    this.trigger = null;
    this.dropdown = null;
    this.boundClickOutside = null;
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
          status: model.type === 'api' ? 'online' : 'checking',  // API models always available/online
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
      this.updateStatus();
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
      this.updateTrigger(); // Update trigger text after auto-select
      this.renderDropdownContent();
      this.notifySelectionChange();
    } else if (!this.initialCheckDone) {
      this.initialCheckDone = true;
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
      this.closeDropdown(); // Close on selection in single mode
    } else {
      // Multi-select mode - toggle
      if (this.selectedModels.has(id)) {
        this.selectedModels.delete(id);
      } else {
        this.selectedModels.add(id);
      }
    }

    this.renderDropdownContent();
    this.updateTrigger();
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
    this.updateTrigger();
    this.renderDropdownContent();
    this.notifySelectionChange();
  }

  /**
   * Clear selection
   */
  clearSelection() {
    this.selectedModels.clear();
    this.updateTrigger();
    this.renderDropdownContent();
    this.notifySelectionChange();
  }

  /**
   * Select all models
   */
  selectAll() {
    for (const id of Object.keys(this.models)) {
      this.selectedModels.add(id);
    }
    this.updateTrigger();
    this.renderDropdownContent();
    this.notifySelectionChange();
  }

  /**
   * Deselect all models
   */
  deselectAll() {
    this.selectedModels.clear();
    this.updateTrigger();
    this.renderDropdownContent();
    this.notifySelectionChange();
  }

  /**
   * Render the model selector
   */
  render() {
    if (!this.container) return;

    this.container.innerHTML = '';

    // Click outside listener
    if (!this.boundClickOutside) {
      this.boundClickOutside = (e) => {
        if (this.dropdown && this.dropdown.classList.contains('show')) {
          if (!this.container.contains(e.target)) {
            this.closeDropdown();
          }
        }
      };
      document.addEventListener('click', this.boundClickOutside);
    }

    // 1. Trigger
    this.trigger = document.createElement('div');
    this.trigger.className = 'model-selector-trigger';
    this.trigger.onclick = (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    };
    this.container.appendChild(this.trigger);

    // 2. Dropdown
    this.dropdown = document.createElement('div');
    this.dropdown.className = 'model-selector-dropdown';
    this.container.appendChild(this.dropdown);

    // Initial fill
    this.updateTrigger();
    this.renderDropdownContent();
  }

  toggleDropdown() {
    if (!this.dropdown) return;
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.dropdown.classList.add('show');
    } else {
      this.dropdown.classList.remove('show');
    }
  }

  closeDropdown() {
    if (this.dropdown) {
      this.isOpen = false;
      this.dropdown.classList.remove('show');
    }
  }

  updateTrigger() {
    if (!this.trigger) return;

    const count = this.selectedModels.size;
    let text = 'Select Model';
    let badge = '';

    if (count === 0) {
      text = 'Select Model';
    } else if (count === 1) {
      const id = Array.from(this.selectedModels)[0];
      text = this.models[id] ? this.models[id].name : id;
    } else {
      text = 'Multiple Models';
      badge = `<span class="trigger-badge">${count}</span>`;
    }

    const chevron = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`;

    this.trigger.innerHTML = `
        <div class="trigger-content">
            <span class="trigger-text">${text}</span>
            ${badge}
        </div>
        ${chevron}
      `;
  }

  renderDropdownContent() {
    if (!this.dropdown) return;
    this.dropdown.innerHTML = '';

    // Add Select All / Deselect All toggle in multi-select mode
    if (this.options.multiSelect && Object.keys(this.models).length > 0) {
      const allSelected = this.selectedModels.size === Object.keys(this.models).length;
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'model-select-all-btn';
      toggleBtn.innerHTML = allSelected
        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg> Deselect All`
        : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> Select All`;
      toggleBtn.onclick = (e) => {
        e.stopPropagation();
        if (allSelected) {
          this.deselectAll();
        } else {
          this.selectAll();
        }
      };
      this.dropdown.appendChild(toggleBtn);
    }

    // Group models by type
    const localModels = Object.entries(this.models).filter(([id, m]) => m.type === 'local');
    const apiModels = Object.entries(this.models).filter(([id, m]) => m.type === 'api');

    // Helper
    const renderOption = (id, model) => {
      const isSelected = this.selectedModels.has(id);
      const el = document.createElement('div');
      el.className = `model-option ${isSelected ? 'selected' : ''}`;

      let statusClass = 'offline';
      if (model.type === 'api') statusClass = 'online';
      else if (model.status === 'online') statusClass = 'online';
      else if (model.status === 'checking') statusClass = 'checking';

      const statusDot = `<span class="status-dot status-${statusClass}"></span>`;
      const checkIcon = `<span class="model-check"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>`;

      el.innerHTML = `
            ${statusDot}
            <span class="model-name-text">${model.name}</span>
            ${checkIcon}
        `;

      el.onclick = (e) => {
        e.stopPropagation();
        this.toggleModel(id);
      };
      return el;
    };

    if (localModels.length > 0) {
      this.createGroupLabel('Local Models');
      localModels.forEach(([id, model]) => {
        this.dropdown.appendChild(renderOption(id, model));
      });
    }

    if (apiModels.length > 0) {
      this.createGroupLabel('API Models');
      apiModels.forEach(([id, model]) => {
        this.dropdown.appendChild(renderOption(id, model));
      });
    }

    if (localModels.length === 0 && apiModels.length === 0) {
      const empty = document.createElement('div');
      empty.style.padding = '12px';
      empty.style.color = 'var(--text-secondary)';
      empty.style.fontSize = '12px';
      empty.style.textAlign = 'center';
      empty.textContent = 'No models found';
      this.dropdown.appendChild(empty);
    }
  }

  createGroupLabel(text) {
    if (!this.dropdown) return;
    const el = document.createElement('div');
    el.className = 'model-group-label';
    el.textContent = text;
    this.dropdown.appendChild(el);
  }

  updateStatus() {
    this.renderDropdownContent();
    // If we wanted to be more precise, we could select by ID and update the status dot
    // but re-rendering the list is acceptable here.
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
    if (this.boundClickOutside) {
      document.removeEventListener('click', this.boundClickOutside);
      this.boundClickOutside = null;
    }
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ModelSelector;
}