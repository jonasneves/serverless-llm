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
      filterTypes: options.filterTypes || null, // Filter by model type, e.g. ['local'] or ['local', 'api']
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
    this.boundRepositionOnScroll = null;
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

      // Check if API models are enabled in settings
      const apiModelsEnabled = window.SettingsPanel?.isApiModelsEnabled?.() ?? false;

      data.models.forEach((model) => {
        // Apply type filter if configured
        const modelType = model.type || 'local';
        if (this.options.filterTypes && !this.options.filterTypes.includes(modelType)) {
          return; // Skip this model
        }

        // Skip API models if not enabled in settings
        if (modelType === 'api' && !apiModelsEnabled) {
          return;
        }

        this.models[model.id] = {
          name: model.name,
          type: modelType,
          status: model.type === 'api' ? 'online' : 'checking',  // API models always available/online
          context_length: model.context_length || 0
        };
      });

      // Listen for API models toggle changes
      if (!this._apiToggleListener) {
        this._apiToggleListener = () => this.loadModels();
        window.addEventListener('api-models-toggle', this._apiToggleListener);
      }

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
            // If single-select mode, stop after first selection
            if (!this.options.multiSelect) {
              break;
            }
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
   * Select all models of a specific type
   */
  selectGroup(type) {
    Object.entries(this.models)
      .filter(([id, model]) => model.type === type)
      .forEach(([id]) => this.selectedModels.add(id));
    this.updateTrigger();
    this.renderDropdownContent();
    this.notifySelectionChange();
  }

  /**
   * Deselect all models of a specific type
   */
  deselectGroup(type) {
    Object.entries(this.models)
      .filter(([id, model]) => model.type === type)
      .forEach(([id]) => this.selectedModels.delete(id));
    this.updateTrigger();
    this.renderDropdownContent();
    this.notifySelectionChange();
  }

  /**
   * Toggle selection for all models of a specific type
   */
  toggleGroup(type) {
    const modelsOfType = Object.entries(this.models).filter(([id, m]) => m.type === type);
    const allSelected = modelsOfType.every(([id]) => this.selectedModels.has(id));

    if (allSelected) {
      this.deselectGroup(type);
    } else {
      this.selectGroup(type);
    }
  }

  /**
   * Render the model selector
   */
  render() {
    if (!this.container) return;

    // Check if we're using compact mode (trigger/dropdown already exist in DOM)
    // In compact mode, #modelSelector is inside .model-selector-dropdown inside .model-selector-compact
    const isCompactMode = this.container.closest('.model-selector-compact') !== null;
    const compactContainer = this.container.closest('.model-selector-compact');

    if (isCompactMode) {
      // Use existing trigger and dropdown from HTML
      this.trigger = compactContainer.querySelector('.model-selector-trigger');
      this.dropdown = compactContainer.querySelector('.model-selector-dropdown');

      if (this.trigger) {
        this.trigger.onclick = (e) => {
          e.stopPropagation();
          this.toggleDropdown();
        };
      }

      // Don't clear the container in compact mode
      // The model chips will be populated inside it
    } else {
      // Legacy mode: create elements dynamically
      this.container.innerHTML = '';

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
    }

    // Click outside listener
    if (!this.boundClickOutside) {
      this.boundClickOutside = (e) => {
        if (this.dropdown && this.dropdown.classList.contains('show')) {
          // Re-check compact mode dynamically
          const compact = this.container?.closest('.model-selector-compact');
          const targetContainer = compact || this.container;
          if (!targetContainer.contains(e.target)) {
            this.closeDropdown();
          }
        }
      };
      document.addEventListener('click', this.boundClickOutside);
    }

    // Reposition on scroll/resize
    if (!this.boundRepositionOnScroll) {
      this.boundRepositionOnScroll = () => {
        if (this.isOpen && this.dropdown) {
          this.positionDropdown();
        }
      };
      window.addEventListener('scroll', this.boundRepositionOnScroll, { passive: true });
      window.addEventListener('resize', this.boundRepositionOnScroll);
    }

    // Initial fill
    this.updateTrigger();
    this.renderDropdownContent();
  }

  toggleDropdown() {
    if (!this.dropdown) return;
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.dropdown.classList.add('show');
      this.positionDropdown();
    } else {
      this.dropdown.classList.remove('show');
      this.dropdown.classList.remove('open-above');
    }
  }

  /**
   * Position dropdown intelligently based on available space
   */
  positionDropdown() {
    if (!this.dropdown || !this.trigger) return;

    // Reset positioning class
    this.dropdown.classList.remove('open-above');

    // Wait for next frame to ensure dropdown is rendered with correct dimensions
    requestAnimationFrame(() => {
      const triggerRect = this.trigger.getBoundingClientRect();
      const dropdownRect = this.dropdown.getBoundingClientRect();
      const viewportHeight = window.innerHeight;

      // Calculate space above and below the trigger
      const spaceBelow = viewportHeight - triggerRect.bottom;
      const spaceAbove = triggerRect.top;

      // If not enough space below but more space above, open above
      if (spaceBelow < dropdownRect.height && spaceAbove > spaceBelow) {
        this.dropdown.classList.add('open-above');
      }
    });
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

    // Check if we're in compact mode (badge is separate element)
    const isCompactMode = this.container?.closest('.model-selector-compact') !== null;

    if (isCompactMode) {
      // Update the badge count separately - find it within the same compact container
      const compactContainer = this.container.closest('.model-selector-compact');
      const badge = compactContainer?.querySelector('.trigger-badge');
      if (badge) {
        badge.textContent = count.toString();
      }
      // Trigger already has the right structure from HTML
      return;
    }

    // Legacy mode: update trigger HTML
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

    // Check if we're in compact mode
    const isCompactMode = this.container?.closest('.model-selector-compact') !== null;

    // Clear the appropriate container
    if (isCompactMode) {
      // In compact mode, render chips inside the #modelSelector container
      this.container.innerHTML = '';
    } else {
      this.dropdown.innerHTML = '';
    }

    const targetContainer = isCompactMode ? this.container : this.dropdown;

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
      targetContainer.appendChild(toggleBtn);
    }

    // Group models by type
    const localModels = Object.entries(this.models).filter(([id, m]) => m.type === 'local');
    const apiModels = Object.entries(this.models).filter(([id, m]) => m.type === 'api');

    // Helper - render as chip or option based on mode
    const renderModel = (id, model) => {
      const isSelected = this.selectedModels.has(id);
      const el = document.createElement('div');

      let statusClass = 'offline';
      if (model.type === 'api') statusClass = 'api';
      else if (model.status === 'online') statusClass = 'online';
      else if (model.status === 'checking') statusClass = 'checking';

      if (isCompactMode) {
        // Render as chip
        el.className = `model-chip ${isSelected ? 'selected' : ''} model-type-${model.type}`;
        el.innerHTML = `
          <span class="status-dot status-${statusClass}"></span>
          <span class="model-name-text">${model.name}</span>
        `;
      } else {
        // Render as dropdown option
        el.className = `model-option ${isSelected ? 'selected' : ''}`;
        const statusDot = `<span class="status-dot status-${statusClass}"></span>`;
        const checkIcon = `<span class="model-check"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>`;
        el.innerHTML = `
          ${statusDot}
          <span class="model-name-text">${model.name}</span>
          ${checkIcon}
        `;
      }

      el.onclick = (e) => {
        e.stopPropagation();
        this.toggleModel(id);
      };
      return el;
    };

    // Only show group headers if both types are present
    const showGroupHeaders = localModels.length > 0 && apiModels.length > 0;

    if (localModels.length > 0) {
      if (showGroupHeaders) {
        const allLocalSelected = localModels.every(([id]) => this.selectedModels.has(id));
        this.createGroupHeader('Local Models', 'local', allLocalSelected, targetContainer);
      }
      localModels.forEach(([id, model]) => {
        targetContainer.appendChild(renderModel(id, model));
      });
    }

    if (apiModels.length > 0) {
      if (showGroupHeaders) {
        const allApiSelected = apiModels.every(([id]) => this.selectedModels.has(id));
        this.createGroupHeader('API Models', 'api', allApiSelected, targetContainer);
      }
      apiModels.forEach(([id, model]) => {
        targetContainer.appendChild(renderModel(id, model));
      });
    }

    if (localModels.length === 0 && apiModels.length === 0) {
      const empty = document.createElement('div');
      empty.style.padding = '12px';
      empty.style.color = 'var(--text-secondary)';
      empty.style.fontSize = '12px';
      empty.style.textAlign = 'center';
      empty.textContent = 'No models found';
      targetContainer.appendChild(empty);
    }
  }

  createGroupHeader(text, type, allSelected, container = null) {
    const target = container || this.dropdown;
    if (!target) return;

    const header = document.createElement('div');
    header.className = 'model-group-header';

    const label = document.createElement('div');
    label.className = 'model-group-label';
    label.textContent = text;

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'model-group-toggle-btn';
    toggleBtn.innerHTML = allSelected
      ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg> Remove All`
      : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> Add All`;
    toggleBtn.onclick = (e) => {
      e.stopPropagation();
      this.toggleGroup(type);
    };

    header.appendChild(label);
    header.appendChild(toggleBtn);
    target.appendChild(header);
  }

  createSeparator(text, container = null) {
    const target = container || this.container;
    if (!target) return;
    const el = document.createElement('div');
    el.className = 'model-selector-separator';
    el.innerHTML = `<span class="separator-label">${text}</span>`;
    target.appendChild(el);
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
    if (this.boundRepositionOnScroll) {
      window.removeEventListener('scroll', this.boundRepositionOnScroll);
      window.removeEventListener('resize', this.boundRepositionOnScroll);
      this.boundRepositionOnScroll = null;
    }
    if (this._apiToggleListener) {
      window.removeEventListener('api-models-toggle', this._apiToggleListener);
      this._apiToggleListener = null;
    }
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ModelSelector;
}