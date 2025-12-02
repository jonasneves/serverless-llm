document.addEventListener('DOMContentLoaded', async () => {
    // Load models dynamically
    await modelLoader.load();
    modelLoader.buildParticipantCheckboxes('#participantsContainer');
    modelLoader.buildOrchestratorDropdown('#orchestratorModel');

    // Configure marked.js for proper markdown rendering
    marked.setOptions({
      breaks: true,
      gfm: true,
      headerIds: false,
      mangle: false
    });

    // Custom renderer for better styling
    const renderer = new marked.Renderer();
    renderer.link = function(href, title, text) {
      const titleAttr = title ? ` title="${title}"` : '';
      return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
    };
    marked.use({ renderer });

    const queryInput = document.getElementById('queryInput');
    const startBtn = document.getElementById('startBtn');
    const maxTokensInput = document.getElementById('maxTokens');
    const temperatureInput = document.getElementById('temperature');
    const statusIndicator = document.getElementById('statusIndicator');
    const discussionContent = document.getElementById('discussionContent');
    const orchestratorModel = document.getElementById('orchestratorModel');
    const orchestratorBadge = document.getElementById('orchestratorBadge');
    const apiWarning = document.getElementById('apiWarning');
    const tokenSection = document.getElementById('tokenSection');
    const tokenToggle = document.getElementById('tokenToggle');
    const tokenInputWrapper = document.getElementById('tokenInputWrapper');
    const githubToken = document.getElementById('githubToken');
    const tokenVisibilityBtn = document.getElementById('tokenVisibilityBtn');
    const eyeIcon = document.getElementById('eyeIcon');
    const orchestratorBar = document.getElementById('orchestratorBar');
    const orchestratorModelName = document.getElementById('orchestratorModelName');
    const orchestratorAction = document.getElementById('orchestratorAction');
    const orchestratorActionText = document.getElementById('orchestratorActionText');
    const participantCount = document.getElementById('participantCount');

    let currentDiscussion = null;

    // API models that consume GitHub Models credits
    const API_MODELS = [
      'gpt-4.1', 'gpt-4o', 'gpt-5', 'gpt-5-mini', 'gpt-5-nano',
      'deepseek-v3-0324', 'cohere-command-r-plus-08-2024',
      'llama-3.3-70b-instruct', 'llama-4-scout-17b-16e-instruct', 'meta-llama-3.1-405b-instruct'
    ];

    // Model display names
    const MODEL_NAMES = {
      'gpt-4.1': 'GPT-4.1',
      'gpt-4o': 'GPT-4o',
      'gpt-5': 'GPT-5',
      'gpt-5-mini': 'GPT-5 Mini',
      'gpt-5-nano': 'GPT-5 Nano',
      'deepseek-v3-0324': 'DeepSeek V3',
      'cohere-command-r-plus-08-2024': 'Cohere Command R+',
      'llama-3.3-70b-instruct': 'Llama 3.3 70B',
      'llama-4-scout-17b-16e-instruct': 'Llama 4 Scout 17B',
      'meta-llama-3.1-405b-instruct': 'Llama 3.1 405B',
      'qwen2.5-7b': 'Qwen 2.5-7B',
      'phi-3-mini': 'Phi-3 Mini',
      'llama-3.2-3b': 'Llama 3.2-3B'
    };

    // Update orchestrator status bar
    function updateOrchestratorStatus(action, showSpinner = true) {
      orchestratorActionText.textContent = action;
      orchestratorAction.querySelector('.orchestrator-bar-spinner').style.display = showSpinner ? 'block' : 'none';
    }

    function showOrchestratorBar(modelId) {
      const displayName = MODEL_NAMES[modelId] || modelId;
      orchestratorModelName.textContent = displayName + ' · ';
      orchestratorBar.classList.add('visible');
    }

    function hideOrchestratorBar() {
      orchestratorBar.classList.remove('visible');
    }

    // Update participant count and API warning
    function updateParticipantUI() {
      const selectedParticipants = document.querySelectorAll('input[name="participant"]:checked');
      const count = selectedParticipants.length;
      const apiParticipantCount = Array.from(selectedParticipants).filter(cb => cb.dataset.type === 'api').length;

      // Update count display
      participantCount.innerHTML = `<strong>${count}</strong> participant${count !== 1 ? 's' : ''} selected`;

      // Check if any API models are involved (orchestrator or participants)
      const isApiOrchestrator = API_MODELS.includes(orchestratorModel.value);
      const hasApiParticipants = apiParticipantCount > 0;
      const needsToken = isApiOrchestrator || hasApiParticipants;

      // Update orchestrator badge
      orchestratorBadge.textContent = isApiOrchestrator ? 'API' : 'Local';
      orchestratorBadge.className = `model-type-badge ${isApiOrchestrator ? 'api' : 'local'}`;

      // Show API warning if any API models are used
      apiWarning.classList.toggle('visible', needsToken);
      tokenSection.style.display = needsToken ? 'block' : 'none';

      // Update start button state
      startBtn.disabled = count < 2;
      if (count < 2) {
        participantCount.innerHTML += ' <span style="color: var(--warning-color);">(min 2)</span>';
      }
    }

    // Backwards compatibility alias
    function updateOrchestratorUI() {
      updateParticipantUI();
    }

    // Toggle token input visibility
    tokenToggle.addEventListener('click', () => {
      tokenInputWrapper.classList.toggle('visible');
      const svg = tokenToggle.querySelector('svg');
      svg.style.transform = tokenInputWrapper.classList.contains('visible') ? 'rotate(180deg)' : '';
    });

    // Toggle token show/hide
    tokenVisibilityBtn.addEventListener('click', () => {
      const isPassword = githubToken.type === 'password';
      githubToken.type = isPassword ? 'text' : 'password';
      // Update icon: eye-open for hidden, eye-off for visible
      eyeIcon.innerHTML = isPassword
        ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>'
        : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
    });

    // Load saved token from localStorage
    const savedToken = localStorage.getItem('github_models_token');
    if (savedToken) {
      githubToken.value = savedToken;
    }

    // Save token to localStorage when changed
    githubToken.addEventListener('input', () => {
      const token = githubToken.value.trim();
      if (token) {
        localStorage.setItem('github_models_token', token);
      } else {
        localStorage.removeItem('github_models_token');
      }
    });

    // Listen for orchestrator and participant changes
    orchestratorModel.addEventListener('change', updateParticipantUI);
    document.querySelectorAll('input[name="participant"]').forEach(checkbox => {
      checkbox.addEventListener('change', updateParticipantUI);
    });
    updateParticipantUI(); // Initialize on load

    // Theme toggle functionality
    const themeToggle = document.getElementById('themeToggle');
    const currentTheme = localStorage.getItem('theme') || 'light';
    document.body.setAttribute('data-theme', currentTheme);

    themeToggle.addEventListener('click', () => {
      const theme = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.body.setAttribute('data-theme', theme);
      localStorage.setItem('theme', theme);
    });

    function setStatus(status, text) {
      statusIndicator.innerHTML = `
        <div class="status-indicator ${status}">
          <div class="spinner"></div>
          ${text}
        </div>
      `;
    }

    function clearStatus() {
      statusIndicator.innerHTML = '';
    }

    function getModelClass(modelId) {
      if (modelId.includes('qwen')) return 'qwen';
      if (modelId.includes('phi')) return 'phi';
      if (modelId.includes('llama')) return 'llama';
      return 'qwen';
    }

    function showAnalysis(analysis) {
      const domainBadges = Object.entries(analysis.domain_weights || {})
        .sort((a, b) => b[1] - a[1])
        .map(([domain, weight]) => `
          <div class="domain-badge">${domain}: ${(weight * 100).toFixed(0)}%</div>
        `).join('');

      discussionContent.innerHTML += `
        <div class="analysis-card">
          <h3>Query Analysis</h3>
          <p style="margin-bottom: 8px; color: var(--text-primary);"><strong>Lead Model:</strong> ${analysis.discussion_lead || 'Unknown'}</p>
          <p style="margin-bottom: 8px; color: var(--text-primary);"><strong>Expected Rounds:</strong> ${analysis.expected_turns || 0}</p>
          <p style="margin-bottom: 8px; color: var(--text-secondary); font-size: 13px;"><strong>Reasoning:</strong> ${analysis.reasoning || 'N/A'}</p>
          <div class="domain-weights">${domainBadges}</div>
        </div>
      `;
    }

    function showTurn(turn, streaming = false) {
      const turnId = `turn-${turn.model_id}-${turn.turn_number}`;
      const existing = document.getElementById(turnId);

      const modelClass = getModelClass(turn.model_id);
      const expertisePercent = ((turn.expertise_score || 0) * 100).toFixed(0);

      if (existing) {
        // Update existing turn
        const content = existing.querySelector('.turn-content');
        if (content) {
          content.innerHTML = marked.parse(turn.content || '');
        }
        existing.classList.toggle('streaming', streaming);
      } else {
        // Create new turn
        discussionContent.innerHTML += `
          <div id="${turnId}" class="turn-card ${streaming ? 'streaming' : ''}">
            <div class="turn-header">
              <div class="model-info">
                <div class="model-badge ${modelClass}">${turn.model_name || turn.model_id}</div>
                <div class="expertise-score">Expertise: ${expertisePercent}%</div>
              </div>
              <div class="turn-badge">Round ${turn.turn_number + 1}</div>
            </div>
            <div class="turn-content">${marked.parse(turn.content || '')}</div>
          </div>
        `;
      }

      // Scroll to bottom
      discussionContent.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }

    function showEvaluation(turnId, evaluation) {
      const card = document.getElementById(turnId);
      if (!card) return;

      card.classList.remove('streaming');
      const confidence = evaluation.confidence_assessment || 'medium';

      const evalHtml = `
        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-color); font-size: 13px; color: var(--text-secondary);">
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <span class="evaluation-badge ${confidence}">Confidence: ${confidence}</span>
            <span>Quality: ${((evaluation.quality_score || 0) * 100).toFixed(0)}%</span>
            <span>Relevance: ${((evaluation.relevance_score || 0) * 100).toFixed(0)}%</span>
          </div>
        </div>
      `;

      card.querySelector('.turn-content').insertAdjacentHTML('afterend', evalHtml);
    }

    function showSynthesis(synthesis, finalResponse) {
      discussionContent.innerHTML += `
        <div class="synthesis-card">
          <h3>Final Response</h3>
          <div class="synthesis-meta">
            <strong>Strategy:</strong> ${synthesis.merge_strategy || 'Unknown'} ·
            <strong>Source:</strong> ${synthesis.primary_source_model || 'Unknown'} ·
            <strong>Confidence:</strong> ${((synthesis.final_confidence || 0) * 100).toFixed(0)}%
          </div>
          <div class="final-response">${marked.parse(finalResponse || 'Generating...')}</div>
        </div>
      `;
    }

    function showError(error) {
      discussionContent.innerHTML += `
        <div class="error-card">
          <strong>Error:</strong> ${error}
        </div>
      `;
    }

    function showTokenSummary(tokenUsage) {
      if (!tokenUsage) return;

      const orchestrator = tokenUsage.orchestrator || {};
      const localModels = tokenUsage.local_models || {};

      discussionContent.innerHTML += `
        <div class="token-summary">
          <div class="token-summary-item">
            <span class="token-summary-label">Orchestrator:</span>
            <span class="token-summary-value orchestrator">${(orchestrator.prompt || 0).toLocaleString()} in</span>
            <span class="token-summary-label">/</span>
            <span class="token-summary-value orchestrator">${(orchestrator.completion || 0).toLocaleString()} out</span>
            <span class="token-summary-label">(${orchestrator.calls || 0} calls)</span>
          </div>
          <div class="token-summary-divider"></div>
          <div class="token-summary-item">
            <span class="token-summary-label">Local Models:</span>
            <span class="token-summary-value local">${(localModels.prompt || 0).toLocaleString()} in</span>
            <span class="token-summary-label">/</span>
            <span class="token-summary-value local">${(localModels.completion || 0).toLocaleString()} out</span>
          </div>
        </div>
      `;
    }

    async function startDiscussion() {
      const query = queryInput.value.trim();
      if (!query) {
        alert('Please enter a question');
        return;
      }

      // Get selected participants
      const selectedParticipants = Array.from(
        document.querySelectorAll('input[name="participant"]:checked')
      ).map(cb => cb.value);

      if (selectedParticipants.length < 2) {
        alert('Please select at least 2 participants for a discussion');
        return;
      }

      const maxTokens = parseInt(maxTokensInput.value);
      const temperature = parseFloat(temperatureInput.value);
      const orchestrator = orchestratorModel.value;
      const userToken = githubToken.value.trim();
      const turns = parseInt(document.getElementById('discussionRounds').value);

      // Reset UI
      discussionContent.innerHTML = '';
      startBtn.disabled = true;
      queryInput.disabled = true;

      try {
        showOrchestratorBar(orchestrator);
        updateOrchestratorStatus('Analyzing query...');

        const requestBody = {
          query,
          max_tokens: maxTokens,
          temperature,
          orchestrator_model: orchestrator,
          turns: turns,
          participants: selectedParticipants
        };

        // Include user token if provided
        if (userToken) {
          requestBody.github_token = userToken;
        }

        const response = await fetch('/api/chat/discussion/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let currentTurn = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;

            const data = line.slice(6);
            if (!data || data === '[DONE]') continue;

            try {
              const event = JSON.parse(data);

              switch (event.event) {
                case 'analysis_complete':
                  showAnalysis(event.analysis);
                  updateOrchestratorStatus('Waiting for model responses...');
                  break;

                case 'turn_start':
                  currentTurn = {
                    model_id: event.model_id,
                    model_name: event.model_name,
                    turn_number: event.turn_number,
                    expertise_score: event.expertise_score,
                    content: ''
                  };
                  showTurn(currentTurn, true);
                  updateOrchestratorStatus(`Round ${event.turn_number + 1} · ${event.model_name} responding...`);
                  break;

                case 'turn_chunk':
                  if (currentTurn && currentTurn.model_id === event.model_id) {
                    currentTurn.content += event.chunk;
                    showTurn(currentTurn, true);
                  }
                  break;

                case 'turn_error':
                  if (currentTurn && currentTurn.model_id === event.model_id) {
                    currentTurn.content = `⚠️ **Error:** ${event.error}`;
                    showTurn(currentTurn, false);
                  }
                  currentTurn = null;
                  break;

                case 'turn_complete':
                  if (event.evaluation) {
                    const turnId = `turn-${event.turn.model_id}-${event.turn.turn_number}`;
                    showEvaluation(turnId, event.evaluation);
                  }
                  currentTurn = null;
                  // Status will be updated by next turn_start or synthesis_start
                  break;

                case 'synthesis_start':
                  updateOrchestratorStatus('Synthesizing final response...');
                  break;

                case 'synthesis_complete':
                  break;

                case 'discussion_complete':
                  showSynthesis(event.synthesis || {}, event.final_response);
                  showTokenSummary(event.token_usage);
                  updateOrchestratorStatus('Discussion complete', false);
                  setTimeout(() => hideOrchestratorBar(), 3000);
                  break;

                case 'error':
                  showError(event.error);
                  hideOrchestratorBar();
                  break;
              }
            } catch (e) {
              console.error('Failed to parse event:', e, data);
            }
          }
        }

      } catch (error) {
        showError(error.message);
        hideOrchestratorBar();
      } finally {
        queryInput.disabled = false;
        updateParticipantUI(); // Re-enable based on participant count
      }
    }

    startBtn.addEventListener('click', startDiscussion);
    queryInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        startDiscussion();
      }
    });

    // Example prompt chips
    document.querySelectorAll('.example-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        queryInput.value = chip.dataset.prompt;
        queryInput.focus();
      });
    });

    // Auto-focus
    queryInput.focus();
});
