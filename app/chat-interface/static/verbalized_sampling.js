document.addEventListener('DOMContentLoaded', async () => {
  // Initialize model selectors (multi-select mode)
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
    multiSelect: true,
    autoSelectOnline: true,
    onSelectionChange: updateButtonState,
    filterTypes: ['local']
  });

  const apiModelSelector = new ModelSelector('#apiModelSelector', {
    multiSelect: true,
    autoSelectOnline: false,
    onSelectionChange: updateButtonState,
    filterTypes: ['api']
  });

  // Prevent dropdown rendering
  localModelSelector.render = function() {};
  apiModelSelector.render = function() {};

  function updateButtonState() {
    const generateBtn = document.getElementById('sendBtn');
    const queryInput = document.getElementById('userInput');
    const hasModel = getAllSelectedModels().length > 0;
    const hasQuery = queryInput.value.trim().length > 0;
    generateBtn.disabled = !hasModel || !hasQuery;
  }
  
  function getAllSelectedModels() {
    const selected = [];
    if (localModelSelector.selectedModels) {
      localModelSelector.selectedModels.forEach(id => selected.push(id));
    }
    if (apiModelSelector.selectedModels) {
      apiModelSelector.selectedModels.forEach(id => selected.push(id));
    }
    return selected;
  }

  function getModelInfo(modelId) {
    return localModelSelector.models[modelId] || apiModelSelector.models[modelId];
  }

  // Update selected models display and dock
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
      chip.className = `model-chip selected model-type-${model.type}`;
      
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

  const generateBtn = document.getElementById('sendBtn');
  const queryInput = document.getElementById('userInput');
  const numResponsesInput = document.getElementById('numResponses');
  // Temp control removed - using SettingsPanel
  const directResponsesContainer = document.getElementById('directResponses');
  const verbalizedResponsesContainer = document.getElementById('verbalizedResponses');
  const diversityScoreContainer = document.getElementById('diversityScore');
  const typingIndicator = document.getElementById('typingIndicator');

  const handleGenerate = async () => {
    const query = queryInput.value.trim();
    if (!query) {
      alert('Please enter a query');
      return;
    }

    const models = getAllSelectedModels();
    if (!models || models.length === 0) {
      alert('Please select at least one model');
      return;
    }
    const numResponses = parseInt(numResponsesInput.value);
    const temperature = window.SettingsPanel?.getTemperature?.() || 0.8;

    generateBtn.disabled = true;
    typingIndicator.classList.add('active');

    // Hide intro cards when generation starts
    const scrollableContent = document.querySelector('.scrollable-content');
    if (scrollableContent) {
      scrollableContent.classList.add('has-content');
    }

    // Clear previous results
    directResponsesContainer.innerHTML = '';
    verbalizedResponsesContainer.innerHTML = '';
    diversityScoreContainer.style.display = 'none';

    try {
      // Get GitHub token for API models (from settings panel)
      const githubToken = window.SettingsPanel?.getToken?.() || '';
      
      // Run comparisons for all models in parallel
      const promises = [];
      for (const modelId of models) {
        promises.push(generateDirect(query, modelId, numResponses, temperature, githubToken));
        promises.push(generateVerbalized(query, modelId, numResponses, temperature, githubToken));
      }
      await Promise.all(promises);
    } catch (error) {
      console.error('Error:', error);
      alert('Error generating responses. Check console for details.');
    } finally {
      generateBtn.disabled = false;
      typingIndicator.classList.remove('active');
    }
  };

  generateBtn.addEventListener('click', handleGenerate);

  // Auto-resize textarea for consistency with Chat
  queryInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 200) + 'px';

    // Update button state
    updateButtonState();
  });

  // Handle Enter key
  queryInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!generateBtn.disabled && queryInput.value.trim()) {
        handleGenerate();
      }
    }
  });

  async function generateDirect(query, model, numResponses, temperature, githubToken) {
    // Create a group for this model
    const modelInfo = getModelInfo(model);
    const modelType = modelInfo?.type || 'local';
    
    const groupDiv = document.createElement('div');
    groupDiv.className = 'model-group';
    groupDiv.innerHTML = `
      <div class="model-header-small" style="padding: 8px; font-weight:600; color:var(--text-secondary); border-bottom:1px solid var(--border-color); margin-bottom:8px; display:flex; align-items:center; gap:8px;">
        <span>${model}</span>
        <span class="model-type-badge ${modelType}">${modelType === 'local' ? 'Local' : 'API'}</span>
      </div>`;
    directResponsesContainer.appendChild(groupDiv);

    // Make multiple direct calls
    const responses = [];
    for (let i = 0; i < numResponses; i++) {
      const responseDiv = document.createElement('div');
      responseDiv.className = 'response-item';
      responseDiv.innerHTML = `
          <div class="response-header">
            <span class="response-number">Response ${i + 1}</span>
          </div>
          <div class="response-content">Generating...</div>
        `;
      groupDiv.appendChild(responseDiv);

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: query }],
            model: model,
            temperature: temperature,
            max_tokens: 1024,  // Match centralized GENERATION_DEFAULTS
            stream: false,
            github_token: githubToken || null
          })
        });

        if (!response.ok) {
          throw new Error(`API returned ${response.status}: ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          const text = await response.text();
          throw new Error(`Expected JSON but got: ${text.substring(0, 100)}`);
        }

        const data = await response.json();
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
          throw new Error('Invalid response format from API');
        }

        const content = data.choices[0].message.content;
        responses.push(content);

        responseDiv.querySelector('.response-content').innerHTML = content;
      } catch (error) {
        console.error('Direct prompting error:', error);
        responseDiv.querySelector('.response-content').innerHTML = `<em style="color: var(--direct-color);">Error: ${error.message}</em>`;
      }
    }
  }

  async function generateVerbalized(query, model, numResponses, temperature, githubToken) {
    // Create a group for this model
    const modelInfo = getModelInfo(model);
    const modelType = modelInfo?.type || 'local';

    const groupDiv = document.createElement('div');
    groupDiv.className = 'model-group';
    groupDiv.innerHTML = `
      <div class="model-header-small" style="padding: 8px; font-weight:600; color:var(--text-secondary); border-bottom:1px solid var(--border-color); margin-bottom:8px; display:flex; align-items:center; gap:8px;">
        <span>${model}</span>
        <span class="model-type-badge ${modelType}">${modelType === 'local' ? 'Local' : 'API'}</span>
      </div>`;
    verbalizedResponsesContainer.appendChild(groupDiv);

    const streamingDiv = document.createElement('div');
    streamingDiv.className = 'response-item';
    streamingDiv.innerHTML = '<div class="response-content">Streaming...</div>';
    groupDiv.appendChild(streamingDiv);

    try {
      const response = await fetch(`/api/verbalized-sampling/stream?model=${model}&num_responses=${numResponses}&temperature=${temperature}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: query,
          github_token: githubToken || null 
        })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullResponse = '';
      let isFirstChunk = true;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));

              if (event.event === 'start') {
                if (isFirstChunk) {
                  // streamingDiv.querySelector('.response-content').textContent = '';
                  isFirstChunk = false;
                }
              } else if (event.event === 'chunk') {
                fullResponse += event.content;
                streamingDiv.querySelector('.response-content').innerHTML = fullResponse;
              } else if (event.event === 'complete') {
                // Parse and display structured responses
                streamingDiv.remove();
                event.parsed_responses.forEach((resp, idx) => {
                  const responseDiv = document.createElement('div');
                  responseDiv.className = 'response-item';
                  responseDiv.innerHTML = `
                      <div class="response-header">
                        <span class="response-number">Response ${idx + 1}</span>
                        ${resp.probability ? `<span class="probability">Prob: ${resp.probability}</span>` : ''}
                      </div>
                      <div class="response-content">${resp.response}</div>
                    `;
                  groupDiv.appendChild(responseDiv);
                });

                // Show diversity score in the group
                const scoreDiv = document.createElement('div');
                scoreDiv.className = 'diversity-score';
                scoreDiv.style.marginTop = '16px';
                scoreDiv.innerHTML = `
                    <div class="diversity-score-label">Diversity Score (${model})</div>
                    <div class="diversity-score-value">${event.diversity_score.toFixed(2)}</div>
                  `;
                groupDiv.appendChild(scoreDiv);

              } else if (event.event === 'error') {
                streamingDiv.innerHTML = `<div class="empty-state"><p style="color: var(--direct-color);">Error: ${event.error}</p></div>`;
              }
            } catch (e) {
              console.error('Error parsing event:', e);
            }
          }
        }
      }
    } catch (error) {
      streamingDiv.innerHTML = `<div class="empty-state"><p style="color: var(--direct-color);">Error: ${error.message}</p></div>`;
    }
  }

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
