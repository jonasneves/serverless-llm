document.addEventListener('DOMContentLoaded', () => {
  // Mobile viewport height fix
  function setViewportHeight() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  }
  setViewportHeight();
  window.addEventListener('resize', setViewportHeight);
  window.addEventListener('orientationchange', () => {
    setTimeout(setViewportHeight, 100);
  });

  // Handle virtual keyboard on mobile
  if ('visualViewport' in window) {
    window.visualViewport.addEventListener('resize', () => {
      document.body.style.height = `${window.visualViewport.height}px`;
    });
  }

  // State
  const modelSelector = new ModelSelector('#modelSelector', {
    showStatus: true,
    autoSelectOnline: true,
    onSelectionChange: updateSendButtonState
    // Both local and API models are now supported
  });

  let conversationHistory = [];
  let totalTokensUsed = 0;
  let userHasManuallyScrolled = false;
  const AUTO_SCROLL_THRESHOLD = 120; // px from bottom to keep auto-scrolling

  // Elements
  const chatHistory = document.getElementById('chatHistory');
  const userInput = document.getElementById('userInput');
  const sendBtn = document.getElementById('sendBtn');
  const clearBtn = document.getElementById('clearBtn');
  const typingIndicator = document.getElementById('typingIndicator');
  const tokenUsageContainer = document.getElementById('tokenUsageContainer');
  const tokenUsageFill = document.getElementById('tokenUsageFill');
  const tokenUsageText = document.getElementById('tokenUsageText');

  function formatContextLength(length) {
    if (length >= 1000000) {
      return `${(length / 1000000).toFixed(1)}M`;
    } else if (length >= 1000) {
      return `${(length / 1000).toFixed(0)}K`;
    }
    return length.toString();
  }

  function getContextInfo(modelIdOrName) {
    // Try direct ID access first
    let model = modelSelector.models[modelIdOrName];

    // If not found, try to find by name
    if (!model) {
      model = Object.values(modelSelector.models).find(m => m.name === modelIdOrName);
    }

    if (model && model.context_length > 0) {
      return `<span class="context-info">${formatContextLength(model.context_length)} ctx</span>`;
    }
    return '';
  }

  function getModelContextLength(modelIdOrName) {
    // Try direct ID access first
    let model = modelSelector.models[modelIdOrName];

    // If not found, try to find by name
    if (!model) {
      model = Object.values(modelSelector.models).find(m => m.name === modelIdOrName);
    }

    return model?.context_length || 0;
  }

  function updateTokenUsage() {
    const selected = modelSelector.getSelected();
    // Only show token usage if exactly one model is selected
    if (selected.length !== 1) {
      tokenUsageContainer.style.display = 'none';
      return;
    }

    const modelId = selected[0];
    const model = modelSelector.models[modelId];

    if (!model || !model.context_length) {
      tokenUsageContainer.style.display = 'none';
      return;
    }

    tokenUsageContainer.style.display = 'flex';
    const contextLength = model.context_length;
    const percentage = Math.min((totalTokensUsed / contextLength) * 100, 100);

    tokenUsageFill.style.width = `${percentage}%`;
    tokenUsageFill.className = 'token-usage-fill';

    if (percentage >= 90) {
      tokenUsageFill.classList.add('danger');
    } else if (percentage >= 70) {
      tokenUsageFill.classList.add('warning');
    }

    tokenUsageText.textContent = `${totalTokensUsed.toLocaleString()} / ${formatContextLength(contextLength)}`;
  }

  function addTokens(tokens) {
    totalTokensUsed += tokens;
    updateTokenUsage();
  }

  function resetTokenUsage() {
    totalTokensUsed = 0;
    updateTokenUsage();
  }

  // Update send button state and token usage based on selection
  function updateSendButtonState() {
    const selectedModels = modelSelector.getSelected();
    const hasContent = userInput.value.trim().length > 0;
    const count = selectedModels.length;
    sendBtn.disabled = count === 0 || !hasContent;

    updateTokenUsage();
  }

  // Auto-resize textarea and enable/disable send button
  userInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 200) + 'px';
    updateSendButtonState();
  });

  // Handle paste events (input event doesn't fire reliably for paste)
  userInput.addEventListener('paste', () => {
    setTimeout(updateSendButtonState, 0);
  });

  // Handle Enter key
  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (userInput.value.trim() && modelSelector.getSelected().length > 0) {
        sendMessage();
      }
    }
  });

  // Handle send button click (works on both desktop and mobile)
  sendBtn.addEventListener('click', (e) => {
    e.preventDefault();
    sendMessage();
  });

  // Also handle touch events for better mobile responsiveness
  sendBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    sendMessage();
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      clearChat();
    });
    clearBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      clearChat();
    });
  }

  function isNearBottom() {
    const distanceFromBottom = chatHistory.scrollHeight - chatHistory.clientHeight - chatHistory.scrollTop;
    return distanceFromBottom <= AUTO_SCROLL_THRESHOLD;
  }

  function scrollChatToBottom(force = false) {
    if (force || !userHasManuallyScrolled || isNearBottom()) {
      chatHistory.scrollTop = chatHistory.scrollHeight;
    }
  }

  chatHistory.addEventListener('scroll', () => {
    // If the user scrolls away from the bottom, disable auto-scroll until they come back
    userHasManuallyScrolled = !isNearBottom();
  });

  // Add user message
  function addUserMessage(content) {
    // Hide welcome card when conversation starts
    chatHistory.classList.add('has-content');
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message user';
    messageDiv.textContent = content;
    chatHistory.appendChild(messageDiv);
    scrollChatToBottom(true);
  }

  // Add model responses
  function addModelResponses(responses) {
    if (responses.length === 1) {
      // Single model response
      const resp = responses[0];
      const contextLength = getModelContextLength(resp.model);
      const messageDiv = document.createElement('div');
      messageDiv.className = 'message assistant';
      messageDiv.innerHTML = `
          <div class="model-header">
            <span class="model-name">${resp.model}</span>
            ${resp.error ? '<span class="model-badge" style="background: #fecaca; color: #dc2626;">Error</span>' : ''}
          </div>
          <div class="message-content">${formatContentWithThinking(resp.content)}</div>
          ${!resp.error ? `
          <div class="message-footer">
            <div class="stat-item" title="Input tokens (prompt)">
              <span class="stat-label">In</span>
              <span class="stat-value">${resp.usage?.prompt_tokens ?? '-'}</span>
            </div>
            <div class="stat-item" title="Output tokens (completion)">
              <span class="stat-label">Out</span>
              <span class="stat-value">${resp.usage?.completion_tokens ?? '-'}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Time</span>
              <span class="stat-value">${resp.time ? resp.time.toFixed(2) + 's' : '-'}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Tokens/s</span>
              <span class="stat-value">${resp.time && resp.usage ? (resp.usage.completion_tokens / resp.time).toFixed(1) : '-'}</span>
            </div>
            ${contextLength > 0 ? `
            <div class="stat-item stat-context" title="Model context window">
              <span class="stat-label">Context</span>
              <span class="stat-value">${formatContextLength(contextLength)}</span>
            </div>
            ` : ''}
          </div>
          ` : ''}
        `;
      chatHistory.appendChild(messageDiv);
    } else {
      // Multiple model responses
      const container = document.createElement('div');
      container.className = 'model-responses';

      for (const resp of responses) {
        const contextLength = getModelContextLength(resp.model);
        const responseDiv = document.createElement('div');
        responseDiv.className = 'model-response';
        responseDiv.innerHTML = `
            <div class="model-header">
              <span class="model-name">${resp.model}</span>
              ${resp.error ? '<span class="model-badge" style="background: #fecaca; color: #dc2626;">Error</span>' : ''}
            </div>
            <div class="message-content">${formatContentWithThinking(resp.content)}</div>
            ${!resp.error ? `
            <div class="message-footer">
              <div class="stat-item" title="Input tokens (prompt)">
                <span class="stat-label">In</span>
                <span class="stat-value">${resp.usage?.prompt_tokens ?? '-'}</span>
              </div>
              <div class="stat-item" title="Output tokens (completion)">
                <span class="stat-label">Out</span>
                <span class="stat-value">${resp.usage?.completion_tokens ?? '-'}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Time</span>
                <span class="stat-value">${resp.time ? resp.time.toFixed(2) + 's' : '-'}</span>
              </div>
              ${contextLength > 0 ? `
              <div class="stat-item stat-context" title="Model context window">
                <span class="stat-label">Ctx</span>
                <span class="stat-value">${formatContextLength(contextLength)}</span>
              </div>
              ` : ''}
            </div>
            ` : ''}
          `;
        container.appendChild(responseDiv);
      }

      chatHistory.appendChild(container);
    }

    scrollChatToBottom();
  }

  // Configure marked.js via shared module
  configureMarked();

  // Create streaming response container
  function createStreamingContainer(models) {
    const modelData = {};

    const registerEntry = (modelId, modelName, element) => {
      const entry = {
        id: modelId,
        name: modelName,
        element,
        content: '',
        contentEl: element.querySelector(`[data-model-id="${modelId}"]`),
        footerEl: element.querySelector(`[data-footer-id="${modelId}"]`),
        promptTokensEl: element.querySelector(`[data-prompt-tokens-id="${modelId}"]`),
        tokensEl: element.querySelector(`[data-tokens-id="${modelId}"]`),
        timeEl: element.querySelector(`[data-time-id="${modelId}"]`)
      };
      modelData[modelId] = entry;
      modelData[modelName] = entry;
    };

    if (models.length === 1) {
      const modelId = models[0];
      const modelName = modelSelector.models[modelId]?.name || modelId;
      const contextLength = getModelContextLength(modelId);
      const messageDiv = document.createElement('div');
      messageDiv.className = 'message assistant';
      messageDiv.innerHTML = `
          <div class="model-header">
            <span class="model-name">${modelName}</span>
            <span class="model-badge streaming-badge">Streaming...</span>
          </div>
          <div class="message-content" data-model-id="${modelId}"><span class="cursor">▋</span></div>
          <div class="message-footer" style="display: none;" data-footer-id="${modelId}">
            <div class="stat-item" title="Input tokens (prompt)">
              <span class="stat-label">In</span>
              <span class="stat-value" data-prompt-tokens-id="${modelId}">-</span>
            </div>
            <div class="stat-item" title="Output tokens (completion)">
              <span class="stat-label">Out</span>
              <span class="stat-value" data-tokens-id="${modelId}">-</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Time</span>
              <span class="stat-value" data-time-id="${modelId}">-</span>
            </div>
            ${contextLength > 0 ? `
            <div class="stat-item stat-context" title="Model context window">
              <span class="stat-label">Context</span>
              <span class="stat-value">${formatContextLength(contextLength)}</span>
            </div>
            ` : ''}
          </div>
        `;
      chatHistory.appendChild(messageDiv);
      registerEntry(modelId, modelName, messageDiv);
    } else {
      const container = document.createElement('div');
      container.className = 'model-responses';

      for (const modelId of models) {
        const modelName = modelSelector.models[modelId]?.name || modelId;
        const contextLength = getModelContextLength(modelId);
        const responseDiv = document.createElement('div');
        responseDiv.className = 'model-response';
        responseDiv.innerHTML = `
            <div class="model-header">
              <span class="model-name">${modelName}</span>
              <span class="model-badge streaming-badge">Waiting...</span>
            </div>
            <div class="message-content" data-model-id="${modelId}"><span class="cursor">▋</span></div>
            <div class="message-footer" style="display: none;" data-footer-id="${modelId}">
              <div class="stat-item" title="Input tokens (prompt)">
                <span class="stat-label">In</span>
                <span class="stat-value" data-prompt-tokens-id="${modelId}">-</span>
              </div>
              <div class="stat-item" title="Output tokens (completion)">
                <span class="stat-label">Out</span>
                <span class="stat-value" data-tokens-id="${modelId}">-</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Time</span>
                <span class="stat-value" data-time-id="${modelId}">-</span>
              </div>
              ${contextLength > 0 ? `
              <div class="stat-item stat-context" title="Model context window">
                <span class="stat-label">Ctx</span>
                <span class="stat-value">${formatContextLength(contextLength)}</span>
              </div>
              ` : ''}
            </div>
          `;
        container.appendChild(responseDiv);
        registerEntry(modelId, modelName, responseDiv);
      }
      chatHistory.appendChild(container);
    }

    scrollChatToBottom();
    return modelData;
  }

  // Update streaming content for a model
  function updateStreamingContent(modelData, modelId, content, isToken = true) {
    const entry = modelData[modelId];
    if (!entry || !entry.contentEl) return;

    if (isToken) {
      entry.content += content;
    }

    entry.contentEl.innerHTML = formatContentWithThinking(entry.content) + '<span class="cursor">▋</span>';
    scrollChatToBottom();
  }

  // Finalize streaming for a model
  function finalizeStreaming(modelData, modelId, time, tokenEstimate, error = false, usage = null) {
    const entry = modelData[modelId];
    if (!entry) return;

    const el = entry.element;

    // Remove streaming badge
    const badge = el.querySelector('.streaming-badge');
    if (badge) {
      if (error) {
        badge.textContent = 'Error';
        badge.style.background = '#fecaca';
        badge.style.color = '#dc2626';
      } else {
        badge.remove();
      }
    }

    // Remove cursor
    if (entry.contentEl) {
      entry.contentEl.innerHTML = formatContentWithThinking(entry.content);
    }

    // Show footer with stats
    if (!error && time && entry.footerEl) {
      entry.footerEl.style.display = 'flex';
      if (entry.timeEl) {
        entry.timeEl.textContent = time.toFixed(2) + 's';
      }

      // Display prompt tokens (input)
      if (entry.promptTokensEl) {
        const promptTokens = usage?.prompt_tokens;
        entry.promptTokensEl.textContent = promptTokens != null ? promptTokens : '-';
      }

      // Display completion tokens (output)
      if (entry.tokensEl) {
        const completionTokens = usage?.completion_tokens ?? tokenEstimate;
        entry.tokensEl.textContent = completionTokens != null ? completionTokens : '-';
      }

      // Add total tokens to usage tracker (only if one model is selected)
      const currentSelection = modelSelector.getSelected();
      const totalTokens = usage?.total_tokens ?? tokenEstimate;
      if (currentSelection.length === 1 && totalTokens) {
        addTokens(parseInt(totalTokens) || 0);
      }
    }
  }

  async function sendMessage() {
    const message = userInput.value.trim();
    if (!message || modelSelector.getSelected().length === 0) return;

    addUserMessage(message);
    conversationHistory.push({ role: 'user', content: message });
    userInput.value = '';
    userInput.style.height = 'auto';

    sendBtn.disabled = true;
    userInput.disabled = true;
    typingIndicator.classList.add('active');

    const models = modelSelector.getSelected();
    const modelData = createStreamingContainer(models);
    let firstContent = '';

    try {
      // Get GitHub token for API models (from settings panel)
      const githubToken = window.SettingsPanel?.getToken?.() || '';

      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          models: models,
          messages: conversationHistory,
          max_tokens: window.SettingsPanel?.getMaxTokens?.() || 2048,
          temperature: window.SettingsPanel?.getTemperature?.() || 0.7,
          github_token: githubToken || null  // Pass token for API models
        })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.event === 'all_done') {
                typingIndicator.classList.remove('active');
                continue;
              }

              const mappedEntry =
                (data.model_id && modelData[data.model_id]) ? modelData[data.model_id] :
                  (data.model && modelData[data.model]) ? modelData[data.model] : null;
              if (!mappedEntry) {
                continue;
              }

              const entryKey = mappedEntry.id;

              if (data.event === 'start') {
                // Model started streaming
                const badge = mappedEntry.element.querySelector('.streaming-badge');
                if (badge) badge.textContent = 'Streaming...';
              } else if (data.event === 'token' && data.content) {
                // Received a token
                updateStreamingContent(modelData, entryKey, data.content);
              } else if (data.event === 'done') {
                // Model finished
                if (!firstContent && data.total_content) {
                  firstContent = data.total_content;
                }
                finalizeStreaming(modelData, entryKey, data.time, data.token_estimate, false, data.usage);
              } else if (data.error) {
                // Error occurred
                mappedEntry.content = data.content || 'Error occurred';
                updateStreamingContent(modelData, entryKey, '', false);
                finalizeStreaming(modelData, entryKey, null, null, true);
              }
            } catch (e) {
              console.error('Parse error:', e);
            }
          }
        }
      }

      // Add first successful response to conversation history
      if (firstContent) {
        conversationHistory.push({ role: 'assistant', content: firstContent });
      }

    } catch (error) {
      // Handle connection errors
      const handled = new Set();
      for (const entry of Object.values(modelData)) {
        if (!entry || handled.has(entry.id)) continue;
        handled.add(entry.id);
        entry.content = `Connection error: ${error.message}`;
        updateStreamingContent(modelData, entry.id, '', false);
        finalizeStreaming(modelData, entry.id, null, null, true);
      }
    } finally {
      sendBtn.disabled = modelSelector.getSelected().length === 0;
      userInput.disabled = false;
      typingIndicator.classList.remove('active');
      userInput.focus();
    }
  }

  function clearChat() {
    conversationHistory = [];
    chatHistory.classList.remove('has-content');
    chatHistory.innerHTML = `
        <div class="welcome-card">
          <div class="welcome-title">Compare AI Model Responses</div>
          <div class="welcome-subtitle">
            Select one or multiple models to compare their responses side-by-side.
            Each response includes metrics like tokens and response time.
          </div>
          <div class="tools-demo-section">
            <div class="welcome-subtitle">Try these examples:</div>
            <div class="examples-container">
              <button class="example-prompt"
                data-prompt="How many times does the letter 'r' appear in the word 'irregularity'?">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
                <span>Count how many times 'r' appears in irregularity</span>
              </button>
              <button class="example-prompt" data-prompt="Which number is larger: 7.09 or 7.9?">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 20V10"></path>
                  <path d="M12 20V4"></path>
                  <path d="M6 20v-6"></path>
                </svg>
                <span>Compare decimal numbers and identify the larger one</span>
              </button>
              <button class="example-prompt"
                data-prompt="Alice has 4 brothers and 5 sisters. How many sisters does Alice's brother have?">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round">
                  <path
                    d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z">
                  </path>
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                  <line x1="12" y1="22.08" x2="12" y2="12"></line>
                </svg>
                <span>Solve logical reasoning puzzles about relationships</span>
              </button>
              <button class="example-prompt"
                data-prompt="A shipping company has 48 boxes and each pallet holds 6 boxes. How many pallets are needed? Do we need an extra pallet?">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="16 18 22 12 16 6"></polyline>
                  <polyline points="8 6 2 12 8 18"></polyline>
                </svg>
                <span>Calculate division problems and check edge cases</span>
              </button>
            </div>
          </div>
        </div>
      `;

    // Re-attach event listeners to example prompts
    document.querySelectorAll('.example-prompt').forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        const prompt = button.getAttribute('data-prompt');
        if (prompt) {
          userInput.value = prompt;
          userInput.focus();
          updateSendButtonState();
        }
      });
    });

    resetTokenUsage();
  }

  // Initialize
  modelSelector.loadModels();

  // Auto-focus the input field on page load
  // Use a small delay to ensure the page is fully rendered
  setTimeout(() => {
    userInput.focus();
  }, 100);

  // Re-focus input when clicking anywhere in the chat area (for convenience)
  chatHistory.addEventListener('click', () => {
    if (!window.getSelection().toString()) {
      userInput.focus();
    }
  });


  // Handle example-prompt class buttons (static HTML examples)
  document.querySelectorAll('.example-prompt').forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      const prompt = button.getAttribute('data-prompt');
      if (prompt) {
        userInput.value = prompt;
        userInput.focus();
        updateSendButtonState();  // Update button state after setting value
      }
    });
  });
});
