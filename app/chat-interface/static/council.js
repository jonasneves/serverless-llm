document.addEventListener('DOMContentLoaded', async () => {
  // Cache DOM elements FIRST (before model selector initialization)
  const queryInput = document.getElementById('userInput');
  const startBtn = document.getElementById('sendBtn');
  const maxTokensInput = document.getElementById('maxTokens');
  const statusIndicator = document.getElementById('statusIndicator');
  const discussionContent = document.getElementById('discussionContent');
  const chairmanModelSelect = document.getElementById('chairmanModel');
  const apiWarning = document.getElementById('apiWarning');
  const tokenSection = document.getElementById('tokenSection');
  const githubToken = document.getElementById('githubToken');
  const chairmanStatusBar = document.getElementById('chairmanStatusBar');
  const chairmanModelDisplay = document.getElementById('chairmanModelDisplay');
  const chairmanActionText = document.getElementById('chairmanActionText');
  const participantCount = document.getElementById('participantCount');
  const settingsBtn = document.getElementById('settingsBtn');
  const participantStatusStrip = document.getElementById('participantStatusStrip');

  let currentDiscussion = null;
  let modelSelector = null; // Will be initialized after functions are defined
  let stage1Responses = [];
  let stage2Rankings = [];
  let aggregateRankings = [];
  let userHasScrolled = false; // Track if user manually scrolled
  let autoScrollEnabled = true; // Auto-scroll only for first card
  let modelStatusMap = {}; // Track status of each model (waiting, generating, complete)

  // Chairman status bar controls
  function showChairmanBar(modelId) {
    if (!chairmanStatusBar) return;
    const displayName = modelLoader.getDisplayName(modelId) || modelId;
    if (chairmanModelDisplay) chairmanModelDisplay.textContent = displayName;
    chairmanStatusBar.classList.add('active');
  }

  function hideChairmanBar() {
    if (chairmanStatusBar) chairmanStatusBar.classList.remove('active');
  }

  function updateChairmanStatus(statusText) {
    if (chairmanActionText) chairmanActionText.textContent = statusText;
  }

  // Show a witty chairman quip as a speech bubble under the status bar
  let quipTimeout = null;
  function showChairmanQuip(quip) {
    const quipContainer = document.getElementById('chairmanQuipContainer');
    if (!quipContainer) return;

    // Clear any existing timeout
    if (quipTimeout) clearTimeout(quipTimeout);

    // Update quip content
    quipContainer.innerHTML = `
      <div class="chairman-quip">
        <span class="quip-icon">💬</span>
        <span class="quip-text">${quip}</span>
      </div>
    `;

    // Show with animation
    requestAnimationFrame(() => {
      quipContainer.classList.add('visible');
    });

    // Auto-hide after a few seconds
    quipTimeout = setTimeout(() => {
      quipContainer.classList.remove('visible');
    }, 5000);
  }

  // Initialize participant status strip with selected models
  function initParticipantStatusStrip(participants) {
    if (!participantStatusStrip) return;

    modelStatusMap = {};
    participantStatusStrip.innerHTML = '';

    participants.forEach(modelId => {
      const modelName = modelLoader.getDisplayName(modelId) || modelId;
      modelStatusMap[modelId] = 'waiting';

      const badge = document.createElement('div');
      badge.className = 'participant-status-badge waiting';
      badge.id = `status-badge-${modelId}`;
      badge.innerHTML = `
        <span class="status-indicator-dot"></span>
        <span class="model-name">${modelName}</span>
      `;
      participantStatusStrip.appendChild(badge);
    });

    participantStatusStrip.classList.add('active');
  }

  // Update a specific model's status in the strip
  function updateModelStatus(modelId, status) {
    const badge = document.getElementById(`status-badge-${modelId}`);
    if (!badge) return;

    modelStatusMap[modelId] = status;
    badge.className = `participant-status-badge ${status}`;
  }

  // Hide the participant status strip
  function hideParticipantStatusStrip() {
    if (participantStatusStrip) {
      participantStatusStrip.classList.remove('active');
    }
  }

  // Get count of models in each status
  function getModelStatusCounts() {
    const counts = { waiting: 0, generating: 0, complete: 0 };
    Object.values(modelStatusMap).forEach(status => {
      if (counts[status] !== undefined) counts[status]++;
    });
    return counts;
  }

  // Update stage status in header
  function updateStageStatus(stageId, statusText, showSpinner = true) {
    const section = document.getElementById(stageId);
    if (!section) return;

    let statusEl = section.querySelector('.stage-status');
    if (!statusEl) {
      const title = section.querySelector('.stage-title');
      if (!title) return;

      statusEl = document.createElement('span');
      statusEl.className = 'stage-status';
      title.appendChild(statusEl);
    }

    statusEl.innerHTML = showSpinner
      ? `<span class="stage-status-spinner"></span>${statusText}`
      : statusText;
  }

  function clearStageStatus(stageId) {
    const statusEl = document.getElementById(stageId)?.querySelector('.stage-status');
    if (statusEl) statusEl.remove();
  }

  // Update participant count and API warning
  function updateParticipantUI() {
    if (!modelSelector || !participantCount) return; // Guard against early calls

    const selectedModels = modelSelector.getSelected();
    const count = selectedModels.length;

    // Count API participants
    let apiParticipantCount = 0;
    selectedModels.forEach(id => {
      if (modelSelector.models[id] && modelSelector.models[id].type === 'api') {
        apiParticipantCount++;
      }
    });

    // Update count display
    participantCount.innerHTML = `<strong>${count}</strong> participant${count !== 1 ? 's' : ''} selected`;

    // Check if chairman is API model
    const chairmanId = chairmanModelSelect?.value;
    const isApiChairman = chairmanId && modelLoader.models?.find(m => m.id === chairmanId && m.type === 'api');

    const hasApiParticipants = apiParticipantCount > 0;
    const needsToken = isApiChairman || hasApiParticipants;

    // Show API warning if any API models are used
    if (apiWarning) apiWarning.classList.toggle('visible', needsToken);
    const tokenValue = (githubToken?.value || '').trim();
    const hasToken = tokenValue.length > 0;
    tokenSection?.classList.toggle('highlight', needsToken);
    settingsBtn?.classList.toggle('needs-attention', needsToken && !hasToken);

    // Update start button state
    if (startBtn) {
      startBtn.disabled = count < 2;
      if (count < 2) {
        participantCount.innerHTML += ' <span style="color: var(--warning-color);">(min 2)</span>';
      }
    }
  }

  // Backwards compatibility alias
  function updateChairmanUI() {
    updateParticipantUI();
  }

  // Initialize model selector for participants (multi-select mode)
  modelSelector = new ModelSelector('#modelSelector', {
    multiSelect: true,
    autoSelectOnline: true,
    onSelectionChange: (selected) => {
      updateParticipantUI();
    }
  });

  await modelSelector.loadModels();

  // Load chairman dropdown
  await modelLoader.load();
  modelLoader.buildChairmanDropdown('#chairmanModel');

  // Configure marked.js via shared module
  configureMarked();

  window.addEventListener('github-token-change', updateParticipantUI);

  // Listen for chairman changes
  if (chairmanModelSelect) {
    chairmanModelSelect.addEventListener('change', updateParticipantUI);
  }

  // Initial update after models and chairman are loaded
  updateParticipantUI();

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

  // Store label to model mapping for de-anonymization
  let currentLabelToModel = {};

  // De-anonymize ranking text by replacing "Response A/B/C" with actual model names
  function deAnonymizeText(text, labelToModel) {
    if (!labelToModel) return text;

    let result = text;
    // Replace each "Response X" with the actual model name (bolded)
    Object.entries(labelToModel).forEach(([label, modelId]) => {
      const modelName = modelLoader.getDisplayName(modelId) || modelId;
      // Use ** for markdown bold which will be converted by formatContent
      result = result.replace(new RegExp(label, 'g'), `**${modelName}**`);
    });
    return result;
  }

  // Create or get stage section with horizontal scroll
  function getOrCreateStageSection(stageId, stageTitle) {
    let section = document.getElementById(stageId);
    if (!section) {
      section = document.createElement('div');
      section.id = stageId;
      section.className = 'stage-section';
      section.innerHTML = `
        <div class="stage-header">
          <div class="stage-title">${stageTitle}</div>
          <div class="stage-controls">
            <button class="stage-nav-btn" onclick="scrollStage('${stageId}', 'left')">
              ← Prev
            </button>
            <span class="stage-counter" id="${stageId}-counter">0 models</span>
            <button class="stage-nav-btn" onclick="scrollStage('${stageId}', 'right')">
              Next →
            </button>
          </div>
        </div>
        <div class="stage-content" id="${stageId}-content"></div>
      `;
      discussionContent.appendChild(section);
    }
    return section;
  }

  // Scroll stage content left/right
  window.scrollStage = function (stageId, direction) {
    const content = document.getElementById(`${stageId}-content`);
    if (!content) return;

    const scrollAmount = content.offsetWidth * 0.8; // Scroll 80% of visible width
    const targetScroll = content.scrollLeft + (direction === 'right' ? scrollAmount : -scrollAmount);

    content.scrollTo({
      left: targetScroll,
      behavior: 'smooth'
    });
  };

  // Toggle card expand/collapse
  window.toggleCardExpand = function (modelId) {
    const card = document.getElementById(`model-card-${modelId}`);
    if (!card) return;

    card.classList.toggle('compact');
    card.classList.toggle('expanded');
  };

  // Update stage counter
  function updateStageCounter(stageId, count) {
    const counter = document.getElementById(`${stageId}-counter`);
    if (counter) {
      counter.textContent = `${count} model${count !== 1 ? 's' : ''}`;
    }
  }

  // Stage 1: Create model card (when streaming starts)
  function createModelCard(modelId, modelName) {
    const modelClass = getModelClass(modelId);
    const section = getOrCreateStageSection('stage1', 'Stage 1: Independent Responses');
    const content = document.getElementById('stage1-content');

    const card = document.createElement('div');
    card.className = 'turn-card response-card streaming compact';
    card.dataset.model = modelId;
    card.id = `model-card-${modelId}`;
    card.innerHTML = `
      <div class="response-card-header">
        <div class="model-info">
          <div class="model-badge ${modelClass}">${modelName}</div>
          <div class="stage-badge generating">
            <span class="generating-spinner"></span>
            Generating...
          </div>
        </div>
        <button class="card-expand-btn" onclick="toggleCardExpand('${modelId}')" title="Expand/Collapse">
          <svg class="expand-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
      </div>
      <div class="response-card-body">
        <div class="turn-content"><span class="streaming-cursor">█</span></div>
      </div>
    `;
    content.appendChild(card);

    // Update counter
    const cardCount = content.querySelectorAll('.response-card').length;
    updateStageCounter('stage1', cardCount);

    // Only auto-scroll to stage on first card
    if (autoScrollEnabled && cardCount === 1) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      autoScrollEnabled = false; // Disable after first scroll
    }
  }

  // Stage 1: Append chunk to model card
  function appendModelChunk(modelId, chunk) {
    const card = document.getElementById(`model-card-${modelId}`);
    if (!card) return;

    const contentDiv = card.querySelector('.turn-content');
    if (!contentDiv) return;

    // Remove cursor if present
    const cursor = contentDiv.querySelector('.streaming-cursor');
    if (cursor) cursor.remove();

    // Append new chunk (escape HTML in chunk)
    const textNode = document.createTextNode(chunk);
    contentDiv.appendChild(textNode);

    // Re-add cursor
    const newCursor = document.createElement('span');
    newCursor.className = 'streaming-cursor';
    newCursor.textContent = '█';
    contentDiv.appendChild(newCursor);

    // Auto-scroll the card's internal content (not the page)
    const cardBody = card.querySelector('.response-card-body');
    if (cardBody) {
      cardBody.scrollTop = cardBody.scrollHeight;
    }
  }

  // Stage 1: Mark model as complete
  function completeModelResponse(modelId, modelName, fullResponse) {
    // Store response data for comparison mode
    stage1Responses.push({ model_id: modelId, model_name: modelName, response: fullResponse });

    const card = document.getElementById(`model-card-${modelId}`);
    if (!card) return;

    const modelClass = getModelClass(modelId);

    // Remove streaming state
    card.classList.remove('streaming');

    // Update badge to "Complete"
    const badge = card.querySelector('.stage-badge');
    if (badge) {
      badge.className = 'stage-badge complete';
      badge.innerHTML = 'Complete';
    }

    // Remove cursor and format content
    const contentDiv = card.querySelector('.turn-content');
    if (contentDiv) {
      const cursor = contentDiv.querySelector('.streaming-cursor');
      if (cursor) cursor.remove();

      // Format the full response with markdown
      contentDiv.innerHTML = formatContent(fullResponse);
    }
  }

  // Stage 2: Show model ranking (with de-anonymization)
  function showRanking(modelId, modelName, ranking, labelToModel) {
    // Store ranking data
    stage2Rankings.push({ model_id: modelId, model_name: modelName, ranking });

    const modelClass = getModelClass(modelId);
    const deAnonymizedRanking = deAnonymizeText(ranking, labelToModel || currentLabelToModel);
    const section = getOrCreateStageSection('stage2', 'Stage 2: Peer Reviews');
    const content = document.getElementById('stage2-content');

    const card = document.createElement('div');
    card.className = 'turn-card ranking-card';
    card.dataset.model = modelId;
    card.innerHTML = `
      <div class="ranking-card-header">
        <div class="model-info">
          <div class="model-badge ${modelClass}">${modelName}</div>
          <div class="stage-badge">Peer Review</div>
        </div>
      </div>
      <div class="ranking-card-body">
        <div class="turn-content">${formatContent(deAnonymizedRanking)}</div>
      </div>
    `;
    content.appendChild(card);

    // Update counter
    const cardCount = content.querySelectorAll('.ranking-card').length;
    updateStageCounter('stage2', cardCount);

    section.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  // Stage 2: Show aggregate rankings
  function showAggregateRankings(rankings, labelToModel) {
    // Store aggregate rankings for comparison mode
    aggregateRankings = rankings;

    const section = getOrCreateStageSection('stage3', 'Stage 3: Final Results');
    const content = document.getElementById('stage3-content');

    const rankingsList = rankings.map((rank, index) => `
      <div class="ranking-item">
        <div class="rank-badge">#${index + 1}</div>
        <div class="rank-model">${rank.model_name || rank.model_id}</div>
        <div class="rank-score">Avg Rank: ${rank.average_rank}</div>
        <div class="rank-votes">${rank.votes_count} votes</div>
      </div>
    `).join('');

    const card = document.createElement('div');
    card.className = 'analysis-card aggregate-rankings';
    card.innerHTML = `
      <h3>Democratic Vote Results</h3>
      <p style="margin-bottom: 12px; color: var(--text-secondary); font-size: 13px;">
        Models ranked each other anonymously. Lower average rank = better.
      </p>
      <div class="rankings-list">${rankingsList}</div>
    `;
    content.appendChild(card);
    section.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  // Stage 3: Show final synthesis
  function showFinalSynthesis(chairmanName, response) {
    const section = getOrCreateStageSection('stage3', 'Stage 3: Final Results');
    const content = document.getElementById('stage3-content');

    const card = document.createElement('div');
    card.className = 'synthesis-card';
    card.innerHTML = `
      <h3>Final Synthesis</h3>
      <div class="synthesis-meta">
        <strong>Chairman:</strong> ${chairmanName}
      </div>
      <div class="final-response">${formatContent(response)}</div>
    `;
    content.appendChild(card);
    section.scrollIntoView({ behavior: 'smooth', block: 'end' });
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

    const chairman = tokenUsage.chairman || {};
    const localModels = tokenUsage.local_models || {};

    discussionContent.innerHTML += `
        <div class="token-summary">
          <div class="token-summary-item">
            <span class="token-summary-label">Chairman:</span>
            <span class="token-summary-value chairman">${(chairman.prompt || 0).toLocaleString()} in</span>
            <span class="token-summary-label">/</span>
            <span class="token-summary-value chairman">${(chairman.completion || 0).toLocaleString()} out</span>
            <span class="token-summary-label">(${chairman.calls || 0} calls)</span>
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

  async function startCouncil() {
    const query = queryInput.value.trim();
    if (!query) {
      alert('Please enter a question');
      return;
    }

    // Get selected participants
    const selectedParticipants = modelSelector.getSelected();

    if (selectedParticipants.length < 2) {
      alert('Please select at least 2 participants for a discussion');
      return;
    }

    const maxTokens = parseInt(maxTokensInput.value);
    const chairman = chairmanModelSelect.value;
    const userToken = (githubToken?.value || '').trim();

    // Reset UI and state
    discussionContent.innerHTML = '';
    startBtn.disabled = true;
    queryInput.disabled = true;
    currentLabelToModel = {}; // Reset de-anonymization mapping
    stage1Responses = [];
    stage2Rankings = [];
    aggregateRankings = [];
    autoScrollEnabled = true; // Re-enable auto-scroll for new session

    // Hide intro cards when discussion starts
    const scrollableContent = document.querySelector('.scrollable-content');
    if (scrollableContent) {
      scrollableContent.classList.add('has-content');
    }

    try {
      // Clear input immediately for better UX
      queryInput.value = '';
      queryInput.style.height = 'auto';

      // Show chairman bar
      showChairmanBar(chairman);
      updateChairmanStatus('Initializing...');

      const requestBody = {
        query,
        max_tokens: maxTokens,
        chairman_model: chairman,
        participants: selectedParticipants
      };

      // Include user token if provided
      if (userToken) {
        requestBody.github_token = userToken;
      }

      const response = await fetch('/api/chat/council/stream', {
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
              case 'council_start':
                updateChairmanStatus('Starting council...');
                break;

              case 'stage1_start':
                updateChairmanStatus(`Stage 1: ${event.participants.length} models responding...`);
                updateStageStatus('stage1', `${event.participants.length} models responding...`);
                initParticipantStatusStrip(event.participants);
                break;

              case 'model_start':
                createModelCard(event.model_id, event.model_name);
                updateModelStatus(event.model_id, 'generating');
                break;

              case 'model_chunk':
                appendModelChunk(event.model_id, event.chunk);
                break;

              case 'model_response':
                completeModelResponse(event.model_id, event.model_name, event.response);
                updateModelStatus(event.model_id, 'complete');
                break;

              case 'model_error':
                console.error(`Model ${event.model_name} error:`, event.error);
                break;

              case 'stage1_complete':
                clearStageStatus('stage1');
                hideParticipantStatusStrip();
                // Build label_to_model mapping for de-anonymization
                currentLabelToModel = {};
                event.results.forEach((result, index) => {
                  const label = `Response ${String.fromCharCode(65 + index)}`; // A, B, C, ...
                  currentLabelToModel[label] = result.model_id;
                });
                break;

              case 'stage2_start':
                updateChairmanStatus('Stage 2: Anonymous peer review...');
                updateStageStatus('stage2', 'Models ranking responses...');
                break;

              case 'ranking_response':
                showRanking(event.model_id, event.model_name, event.ranking);
                break;

              case 'stage2_complete':
                showAggregateRankings(event.aggregate_rankings, event.label_to_model);
                clearStageStatus('stage2');
                break;

              case 'stage3_start':
                updateChairmanStatus('Stage 3: Synthesizing final answer...');
                updateStageStatus('stage3', `Chairman synthesizing...`);
                break;

              case 'stage3_complete':
                showFinalSynthesis(event.chairman_name, event.response);
                clearStageStatus('stage3');
                updateChairmanStatus('Council complete');
                setTimeout(() => hideChairmanBar(), 3000);
                break;

              case 'council_complete':
                break;

              case 'info':
                console.info('[Council]', event.message);
                if (event.message && event.message.includes('quota')) {
                  const infoDiv = document.createElement('div');
                  infoDiv.style.cssText = 'padding: 12px; margin: 10px 0; background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; color: #856404;';
                  infoDiv.innerHTML = `<strong>ℹ️</strong> ${event.message}`;
                  document.getElementById('discussion-container').prepend(infoDiv);
                  setTimeout(() => infoDiv.remove(), 10000);
                }
                break;

              case 'chairman_quip':
                showChairmanQuip(event.quip);
                break;

              case 'error':
                showError(event.error);
                hideChairmanBar();
                break;
            }
          } catch (e) {
            console.error('Failed to parse event:', e, data);
          }
        }
      }

    } catch (error) {
      showError(error.message);
      hideChairmanBar();
    } finally {
      queryInput.disabled = false;
      updateParticipantUI(); // Re-enable based on participant count
    }
  }

  startBtn.addEventListener('click', startCouncil);
  queryInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!startBtn.disabled && queryInput.value.trim()) {
        startCouncil();
      }
    }
  });

  // Example prompt chips
  document.querySelectorAll('.example-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      queryInput.value = chip.dataset.prompt;
      queryInput.focus();
    });
  });

  // Auto-resize textarea
  queryInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 200) + 'px';
  });
});
