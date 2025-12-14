document.addEventListener('DOMContentLoaded', async () => {
  // Configure marked.js via shared module
  configureMarked();

  // State - Separate selectors for local and API models
  // Use hidden containers since we won't render dropdowns
  const hiddenContainer = document.createElement('div');
  hiddenContainer.id = 'hiddenModelSelectors';
  hiddenContainer.style.display = 'none';
  document.body.appendChild(hiddenContainer);

  const localModelSelectorContainer = document.createElement('div');
  localModelSelectorContainer.id = 'localModelSelector';
  hiddenContainer.appendChild(localModelSelectorContainer);

  const apiModelSelectorContainer = document.createElement('div');
  apiModelSelectorContainer.id = 'apiModelSelector';
  hiddenContainer.appendChild(apiModelSelectorContainer);

  const localModelSelector = new ModelSelector('#localModelSelector', {
    multiSelect: false,
    autoSelectOnline: true,
    onSelectionChange: updateButtonState,
    filterTypes: ['local']
  });

  const apiModelSelector = new ModelSelector('#apiModelSelector', {
    multiSelect: false,
    autoSelectOnline: false,
    onSelectionChange: updateButtonState,
    filterTypes: ['api']
  });

  // Prevent dropdown rendering
  localModelSelector.render = function () { };
  apiModelSelector.render = function () { };

  /**
   * Updates the state of the send button based on input validity.
   * Disables button if no model is selected or query is empty.
   */
  function updateButtonState() {
    const startBtn = document.getElementById('sendBtn');
    const queryInput = document.getElementById('userInput');
    if (!startBtn || !queryInput) return;

    const hasModel = getAllSelectedModels().length > 0;
    const hasQuery = queryInput.value.trim().length > 0;
    startBtn.disabled = !hasModel || !hasQuery;
  }

  /**
   * Retrieves all selected model IDs from both local and API selectors.
   * @returns {string[]} Array of selected model IDs
   */
  function getAllSelectedModels() {
    const selected = [];
    if (localModelSelector.selectedModels && localModelSelector.selectedModels.size > 0) {
      localModelSelector.selectedModels.forEach(id => selected.push(id));
    }
    if (apiModelSelector.selectedModels && apiModelSelector.selectedModels.size > 0) {
      apiModelSelector.selectedModels.forEach(id => selected.push(id));
    }
    return selected;
  }

  // Add listeners to enforce mutual exclusivity manually
  // We need to access the internal trigger or wrap the callback logic carefully
  // For now, we'll allow both to have a selection but only use the first one found.

  // Update selected models display and dock
  /**
   * Refreshes the display of selected model chips in the UI.
   * Updates the visual list of models chosen by the user.
   */
  function updateSelectedModelsDisplay() {
    const container = document.getElementById('selectedModelsDisplay');
    if (!container) return;

    container.innerHTML = '';

    const allSelected = new Map();

    if (localModelSelector && localModelSelector.selectedModels) {
      localModelSelector.selectedModels.forEach(id => {
        const model = localModelSelector.models[id];
        if (model) allSelected.set(id, model);
      });
    }

    if (apiModelSelector && apiModelSelector.selectedModels) {
      apiModelSelector.selectedModels.forEach(id => {
        const model = apiModelSelector.models[id];
        if (model) allSelected.set(id, model);
      });
    }

    allSelected.forEach((model, id) => {
      const chip = document.createElement('div');
      chip.className = `model-chip model-type-${model.type}`;

      let statusClass = 'offline';
      if (model.type === 'api') statusClass = 'api';
      else if (model.status === 'online') statusClass = 'online';
      else if (model.status === 'checking') statusClass = 'checking';

      chip.innerHTML = `
        <span class="status-dot status-${statusClass}"></span>
        <span class="model-name-text">${model.name}</span>
      `;

      chip.onclick = (e) => {
        e.stopPropagation();
        toggleDock();
      };

      container.appendChild(chip);
    });

    updateDock();
  }

  // Populate dock with models
  /**
   * Re-renders the model dock list based on current selection state.
   * Updates the side panel with available local and API models.
   */
  function updateDock() {
    const localDockList = document.getElementById('localDockList');
    const apiDockList = document.getElementById('apiDockList');
    const localDockCount = document.getElementById('localDockCount');
    const apiDockCount = document.getElementById('apiDockCount');

    const renderModelItem = (selector, id, model) => {
      const isSelected = selector.selectedModels.has(id);
      const el = document.createElement('div');

      let statusClass = 'offline';
      if (model.type === 'api') statusClass = 'api';
      else if (model.status === 'online') statusClass = 'online';
      else if (model.status === 'checking') statusClass = 'checking';

      el.className = `model-option ${isSelected ? 'selected' : ''}`;
      const statusDot = `<span class="status-dot status-${statusClass}"></span>`;
      const checkIcon = `<span class="model-check"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>`;
      el.innerHTML = `
        ${statusDot}
        <span class="model-name-text">${model.name}</span>
        ${checkIcon}
      `;

      el.onclick = (e) => {
        e.stopPropagation();
        selector.toggleModel(id);
      };
      return el;
    };

    if (localDockList && localModelSelector) {
      localDockList.innerHTML = '';
      const localModels = Object.entries(localModelSelector.models || {}).filter(([id, m]) => m.type === 'local');
      if (localDockCount) {
        localDockCount.textContent = `(${localModels.length})`;
      }
      localModels.forEach(([id, model]) => {
        localDockList.appendChild(renderModelItem(localModelSelector, id, model));
      });
    }

    if (apiDockList && apiModelSelector) {
      apiDockList.innerHTML = '';
      const apiModels = Object.entries(apiModelSelector.models || {}).filter(([id, m]) => m.type === 'api');
      if (apiDockCount) {
        apiDockCount.textContent = `(${apiModels.length})`;
      }
      apiModels.forEach(([id, model]) => {
        apiDockList.appendChild(renderModelItem(apiModelSelector, id, model));
      });
    }
  }

  // Model Dock Panel
  const modelDock = document.getElementById('modelDock');
  const dockOverlay = document.getElementById('dockOverlay');
  let showDock = false;

  /**
   * Toggles the visibility of the model selection dock sidebar.
   */
  function toggleDock() {
    showDock = !showDock;
    if (modelDock) {
      modelDock.classList.toggle('show', showDock);
    }
    if (dockOverlay) {
      dockOverlay.classList.toggle('show', showDock);
    }
  }

  function closeDock() {
    showDock = false;
    if (modelDock) {
      modelDock.classList.remove('show');
    }
    if (dockOverlay) {
      dockOverlay.classList.remove('show');
    }
  }

  const logoWithModelSelector = document.getElementById('logoWithModelSelector');
  if (logoWithModelSelector) {
    logoWithModelSelector.style.cursor = 'pointer';
    logoWithModelSelector.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleDock();
    });
  }

  if (dockOverlay) {
    dockOverlay.addEventListener('click', closeDock);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'm' || e.key === 'M') {
      if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
        return;
      }
      toggleDock();
    }
    if (e.key === 'Escape') {
      closeDock();
    }
  });

  // Toggle all buttons
  document.querySelectorAll('.model-dock-toggle-all').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const type = btn.dataset.type;
      const selector = type === 'local' ? localModelSelector : apiModelSelector;
      const allModels = Object.keys(selector.models || {});
      const allSelected = allModels.length > 0 && allModels.every(id => selector.selectedModels.has(id));

      if (allSelected) {
        allModels.forEach(id => selector.deselectModel(id));
      } else {
        allModels.forEach(id => selector.selectModel(id));
      }
    });
  });

  const originalLocalChange = localModelSelector.options.onSelectionChange;
  localModelSelector.options.onSelectionChange = (...args) => {
    if (originalLocalChange) originalLocalChange(...args);
    updateDock();
    updateSelectedModelsDisplay();
  };

  const originalApiChange = apiModelSelector.options.onSelectionChange;
  apiModelSelector.options.onSelectionChange = (...args) => {
    if (originalApiChange) originalApiChange(...args);
    updateDock();
    updateSelectedModelsDisplay();
  };

  await Promise.all([
    localModelSelector.loadModels(),
    apiModelSelector.loadModels()
  ]);

  updateSelectedModelsDisplay();

  // Enable horizontal scrolling with mouse wheel
  const selectedModelsContainer = document.querySelector('.selected-models-container');
  if (selectedModelsContainer) {
    selectedModelsContainer.addEventListener('wheel', (e) => {
      if (selectedModelsContainer.scrollWidth > selectedModelsContainer.clientWidth) {
        e.preventDefault();
        selectedModelsContainer.scrollLeft += e.deltaY;
      }
    }, { passive: false });
  }

  const queryInput = document.getElementById('userInput');
  const maxRoundsInput = document.getElementById('maxRounds');
  const engineSelect = document.getElementById('engineSelect');
  // Temp/Tokens controls removed - using SettingsPanel

  const startBtn = document.getElementById('sendBtn');
  let originalBtnHTML = null;
  const orchestrationResults = document.getElementById('orchestrationResults');

  let isRunning = false;

  // Initial button state check
  updateButtonState();

  /**
   * Initiates the orchestration process.
   * Validates input, sends request to backend, and handles streaming response.
   */
  async function startOrchestration() {
    const query = queryInput.value.trim();
    if (!query) {
      alert('Please enter a question');
      return;
    }

    const selectedModels = getAllSelectedModels();
    if (selectedModels.length === 0) {
      alert('Please select a model');
      return;
    }

    // Use the most recently selected or just the first one
    // Since we didn't implement strict mutual exclusion in UI, we pick the first one.
    // If user selected one in Local and one in API, we'll use Local.
    const modelId = selectedModels[0];

    if (isRunning) return;
    isRunning = true;
    startBtn.disabled = true;
    // Preserve original content to restore later
    if (originalBtnHTML === null) originalBtnHTML = startBtn.innerHTML;
    startBtn.innerHTML = '<span class="loading"></span>';

    // Clear input box and reset height
    queryInput.value = '';
    queryInput.style.height = 'auto';

    // Hide intro cards when orchestration starts
    const scrollableContent = document.querySelector('.scrollable-content');
    if (scrollableContent) {
      scrollableContent.classList.add('has-content');
    }

    // Clear previous results
    orchestrationResults.innerHTML = '';

    try {
      // Get GitHub token for API models (from settings panel)
      const githubToken = window.SettingsPanel?.getToken?.() || '';

      const engine = engineSelect ? engineSelect.value : 'autogen';
      const response = await fetch(`/api/chat/orchestrator/stream?engine=${encodeURIComponent(engine)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query,
          model: modelId,
          max_rounds: parseInt(maxRoundsInput.value),
          temperature: window.SettingsPanel?.getTemperature?.() || 0.7,
          max_tokens: window.SettingsPanel?.getMaxTokens?.() || 2048,
          github_token: githubToken || null
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let currentRound = null;
      let currentToolCall = null;
      let buffer = '';  // Buffer for incomplete SSE events

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        buffer += chunk;

        // Split by double newline (SSE event separator)
        const events = buffer.split('\n\n');

        // Keep the last incomplete event in the buffer
        buffer = events.pop() || '';

        for (const eventData of events) {
          const lines = eventData.split('\n');
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;

            const jsonStr = line.slice(6);
            if (!jsonStr.trim()) continue;

            try {
              const event = JSON.parse(jsonStr);

              if (event.event === 'start') {
                // Just started
              } else if (event.event === 'agents_ready') {
                // Agents initialized
                const agentsDiv = document.createElement('div');
                agentsDiv.className = 'round';
                agentsDiv.innerHTML = `
                  <div class="round-header">AutoGen Agents Ready</div>
                  <div class="tool-result-content">
                    <strong>Agents:</strong> ${event.agents.join(', ')}<br>
                    <strong>Tools:</strong> ${event.tools.join(', ')}
                  </div>
                `;
                orchestrationResults.appendChild(agentsDiv);
                currentRound = agentsDiv;
              } else if (event.event === 'agent_message') {
                // Agent sent a message
                const messageDiv = document.createElement('div');
                messageDiv.className = 'tool-call';
                messageDiv.innerHTML = `
                  <div class="tool-call-header">
                    <span class="tool-badge tool-${event.agent}">${event.agent}</span>
                  </div>
                  <div class="tool-result-content markdown-content"></div>
                `;
                messageDiv.querySelector('.tool-result-content').innerHTML = formatContent(event.content);
                orchestrationResults.appendChild(messageDiv);
              } else if (event.event === 'message') {
                // Generic message
                const msgDiv = document.createElement('div');
                msgDiv.className = 'tool-result';
                msgDiv.innerHTML = `<div class="tool-result-content markdown-content"></div>`;
                msgDiv.querySelector('.tool-result-content').innerHTML = formatContent(event.content);
                orchestrationResults.appendChild(msgDiv);
              } else if (event.event === 'round_start') {
                // New round
                currentRound = document.createElement('div');
                currentRound.className = 'round';
                currentRound.innerHTML = `<div class="round-header">Round ${event.round}</div>`;
                orchestrationResults.appendChild(currentRound);
              } else if (event.event === 'tool_call') {
                // Tool being called
                currentToolCall = document.createElement('div');
                currentToolCall.className = 'tool-call';
                currentToolCall.innerHTML = `
                  <div class="tool-call-header">
                    <span class="tool-badge tool-${event.tool}">${event.tool}</span>
                  </div>
                  <div class="tool-arguments">${JSON.stringify(event.arguments, null, 2)}</div>
                  <div class="loading" style="margin-top: 12px;"></div>
                `;
                currentRound.appendChild(currentToolCall);
              } else if (event.event === 'tool_result') {
                // Tool result received
                if (currentToolCall) {
                  const loadingEl = currentToolCall.querySelector('.loading');
                  if (loadingEl) loadingEl.remove();

                  const resultDiv = document.createElement('div');
                  resultDiv.className = 'tool-result';
                  resultDiv.innerHTML = `
                    <div class="tool-result-header">Result</div>
                    <div class="tool-result-content markdown-content"></div>
                  `;

                  const contentDiv = resultDiv.querySelector('.tool-result-content');
                  if (event.result.content) {
                    contentDiv.innerHTML = marked.parse(event.result.content);
                  } else {
                    contentDiv.textContent = JSON.stringify(event.result, null, 2);
                  }

                  currentToolCall.appendChild(resultDiv);
                }
              } else if (event.event === 'orchestrator_thinking') {
                // Orchestrator reasoning
                const thinkingDiv = document.createElement('div');
                thinkingDiv.className = 'tool-result';
                thinkingDiv.innerHTML = `
                  <div class="tool-result-header">Orchestrator Thinking</div>
                  <div class="tool-result-content markdown-content"></div>
                `;
                thinkingDiv.querySelector('.tool-result-content').innerHTML = formatContent(event.content);
                currentRound.appendChild(thinkingDiv);
              } else if (event.event === 'final_answer') {
                // Final answer
                const finalDiv = document.createElement('div');
                finalDiv.className = 'final-answer';
                finalDiv.innerHTML = `
                  <div class="final-answer-header">Final Answer</div>
                  <div class="final-answer-content markdown-content"></div>
                `;
                finalDiv.querySelector('.final-answer-content').innerHTML = formatContent(event.content);
                orchestrationResults.appendChild(finalDiv);
              } else if (event.event === 'complete') {
                // Summary
                const summaryDiv = document.createElement('div');
                summaryDiv.className = 'summary';
                const framework = event.summary && event.summary.framework ? event.summary.framework : 'Orchestration';
                summaryDiv.innerHTML = `
                  <strong>${framework} Complete</strong>
                  <div class="summary-item"><span>Framework:</span><span>${framework}</span></div>
                  <div class="summary-item"><span>Status:</span><span>${event.summary.status}</span></div>
                  ${event.summary.total_rounds ? `<div class="summary-item"><span>Rounds:</span><span>${event.summary.total_rounds}</span></div>` : ''}
                  ${event.summary.agents_used ? `<div class="summary-item"><span>Agents:</span><span>${event.summary.agents_used.join(', ')}</span></div>` : ''}
                `;
                orchestrationResults.appendChild(summaryDiv);
              } else if (event.event === 'info') {
                console.info('[Orchestrator]', event.message);
                if (event.message.includes('quota')) {
                  const infoDiv = document.createElement('div');
                  infoDiv.style.cssText = 'padding: 12px; margin: 10px 0; background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; color: #856404;';
                  infoDiv.innerHTML = `<strong>ℹ️</strong> ${event.message}`;
                  orchestrationResults.prepend(infoDiv);
                  setTimeout(() => infoDiv.remove(), 10000);
                }
              } else if (event.event === 'error') {
                console.error('Orchestration error:', event.error);
                const errorDiv = document.createElement('div');
                errorDiv.style.color = 'var(--error-color)';
                errorDiv.style.padding = '20px';
                errorDiv.style.marginTop = '16px';
                errorDiv.style.background = 'var(--error-bg)';
                errorDiv.style.borderRadius = '8px';
                errorDiv.style.border = '1px solid var(--error-color)';

                let errorHtml = `<strong>Error:</strong> ${event.error}`;

                // Show endpoint information if available
                if (event.endpoints) {
                  errorHtml += '<br><br><strong>Model Endpoints:</strong><br>';
                  errorHtml += `• Qwen: ${event.endpoints.qwen}<br>`;
                  errorHtml += `• Phi: ${event.endpoints.phi}<br>`;
                  errorHtml += `• Llama: ${event.endpoints.llama}<br>`;
                  errorHtml += '<br><small>Make sure these model services are running and accessible.</small>';
                }

                errorDiv.innerHTML = errorHtml;
                orchestrationResults.appendChild(errorDiv);
              }

              orchestrationSection.scrollTop = orchestrationSection.scrollHeight;
            } catch (e) {
              console.error('Failed to parse event:', e, jsonStr);
            }
          }
        }
      }
    } catch (error) {
      console.error('Orchestration failed:', error);
      orchestrationResults.innerHTML = `
          <div style="color: var(--warning-color); padding: 20px; text-align: center;">
            <div style="margin-bottom: 12px;">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
            </div>
            <div style="font-size: 16px;">Orchestration failed</div>
            <div style="font-size: 13px; margin-top: 8px;">${error.message}</div>
          </div>
        `;
    } finally {
      isRunning = false;
      startBtn.disabled = false;
      if (originalBtnHTML !== null) {
        startBtn.innerHTML = originalBtnHTML;
      }
      // Re-evaluate button state
      updateButtonState();
    }
  }

  // Allow Enter to submit (with Shift+Enter for newlines)
  // Auto-resize textarea similar to Chat page
  queryInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 200) + 'px';
    updateButtonState();
  });



  startBtn.addEventListener('click', (event) => {
    event.preventDefault();
    startOrchestration();
  });

  // Handle Enter key
  queryInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!startBtn.disabled && queryInput.value.trim()) {
        startOrchestration();
      }
    }
  });

  // Handle example prompt clicks
  document.querySelectorAll('.example-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      const prompt = chip.getAttribute('data-prompt');
      if (prompt) {
        queryInput.value = prompt;
        queryInput.focus();
      }
    });
  });

  // Global key listener for "type anywhere"
  document.addEventListener('keydown', (e) => {
    // Handle Escape key
    if (e.key === 'Escape') {
      localModelSelector.closeDropdown();
      apiModelSelector.closeDropdown();

      if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
        document.activeElement.blur();
      }
      return;
    }

    const active = document.activeElement;
    if (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable) {
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length !== 1) return;

    queryInput.focus();
  });
});
