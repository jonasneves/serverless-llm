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

  // Elements
  const chatHistory = document.getElementById('chatHistory');
  const userInput = document.getElementById('userInput');
  const sendBtn = document.getElementById('sendBtn');
  const clearBtn = document.getElementById('clearBtn');
  const tempSlider = document.getElementById('tempSlider');
  const tempValue = document.getElementById('tempValue');
  const maxTokens = document.getElementById('maxTokens');
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

  // Temperature slider
  tempSlider.addEventListener('input', () => {
    tempValue.textContent = tempSlider.value;
  });

  // Auto-resize textarea and enable/disable send button
  userInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 200) + 'px';

    // Enable/disable send button based on content and model selection
    const hasContent = this.value.trim().length > 0;
    const hasModels = modelSelector.getSelected().length > 0;
    sendBtn.disabled = !hasContent || !hasModels;
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

  // Add user message
  function addUserMessage(content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message user';
    messageDiv.textContent = content;
    chatHistory.appendChild(messageDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
  }

  // Add model responses
  function addModelResponses(responses) {
    if (responses.length === 1) {
      // Single model response
      const resp = responses[0];
      const messageDiv = document.createElement('div');
      messageDiv.className = 'message assistant';
      messageDiv.innerHTML = `
          <div class="model-header">
            <span class="model-name">${resp.model}</span>
            ${getContextInfo(resp.model)}
            ${resp.error ? '<span class="model-badge" style="background: #fecaca; color: #dc2626;">Error</span>' : ''}
          </div>
          <div class="message-content">${formatContent(resp.content)}</div>
          ${!resp.error ? `
          <div class="message-footer">
            <div class="stat-item">
              <span class="stat-label">Tokens</span>
              <span class="stat-value">${resp.usage?.total_tokens || '-'}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Time</span>
              <span class="stat-value">${resp.time ? resp.time.toFixed(2) + 's' : '-'}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Tokens/s</span>
              <span class="stat-value">${resp.time && resp.usage ? (resp.usage.completion_tokens / resp.time).toFixed(1) : '-'}</span>
            </div>
          </div>
          ` : ''}
        `;
      chatHistory.appendChild(messageDiv);
    } else {
      // Multiple model responses
      const container = document.createElement('div');
      container.className = 'model-responses';

      for (const resp of responses) {
        const responseDiv = document.createElement('div');
        responseDiv.className = 'model-response';
        responseDiv.innerHTML = `
            <div class="model-header">
              <span class="model-name">${resp.model}</span>
              ${getContextInfo(resp.model)}
              ${resp.error ? '<span class="model-badge" style="background: #fecaca; color: #dc2626;">Error</span>' : ''}
            </div>
            <div class="message-content">${formatContent(resp.content)}</div>
            ${!resp.error ? `
            <div class="message-footer">
              <div class="stat-item">
                <span class="stat-label">Tokens</span>
                <span class="stat-value">${resp.usage?.total_tokens || '-'}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Time</span>
                <span class="stat-value">${resp.time ? resp.time.toFixed(2) + 's' : '-'}</span>
              </div>
            </div>
            ` : ''}
          `;
        container.appendChild(responseDiv);
      }

      chatHistory.appendChild(container);
    }

    chatHistory.scrollTop = chatHistory.scrollHeight;
  }

  // Configure marked.js
  marked.setOptions({
    breaks: true,
    gfm: true,
    headerIds: false,
    mangle: false
  });

  // Custom renderer for better styling
  const renderer = new marked.Renderer();

  // Make links open in new tab
  renderer.link = function (href, title, text) {
    const titleAttr = title ? ` title="${title}"` : '';
    return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
  };

  marked.use({ renderer });

  // Helper function to render LaTeX expressions
  function renderLatex(content) {
    if (!content || typeof katex === 'undefined') return content;

    // Store code blocks to protect them from LaTeX processing
    const codeBlocks = [];
    let protectedContent = content.replace(/```[\s\S]*?```/g, (match) => {
      codeBlocks.push(match);
      return `__CODEBLOCK_${codeBlocks.length - 1}__`;
    });

    // Also protect inline code
    const inlineCodes = [];
    protectedContent = protectedContent.replace(/`[^`]+`/g, (match) => {
      inlineCodes.push(match);
      return `__INLINECODE_${inlineCodes.length - 1}__`;
    });

    // Render block math: $$...$$ or \[...\]
    protectedContent = protectedContent.replace(/\$\$([\s\S]+?)\$\$/g, (match, latex) => {
      try {
        return katex.renderToString(latex.trim(), { displayMode: true, throwOnError: false });
      } catch (e) {
        return match;
      }
    });

    protectedContent = protectedContent.replace(/\\\[([\s\S]+?)\\\]/g, (match, latex) => {
      try {
        return katex.renderToString(latex.trim(), { displayMode: true, throwOnError: false });
      } catch (e) {
        return match;
      }
    });

    // Render inline math: $...$ or \(...\)
    // More careful with $...$ to avoid matching regular dollar amounts
    protectedContent = protectedContent.replace(/\$([^\s$][^$]*?[^\s$])\$/g, (match, latex) => {
      try {
        return katex.renderToString(latex.trim(), { displayMode: false, throwOnError: false });
      } catch (e) {
        return match;
      }
    });

    protectedContent = protectedContent.replace(/\\\(([\s\S]+?)\\\)/g, (match, latex) => {
      try {
        return katex.renderToString(latex.trim(), { displayMode: false, throwOnError: false });
      } catch (e) {
        return match;
      }
    });

    // Restore inline code
    protectedContent = protectedContent.replace(/__INLINECODE_(\d+)__/g, (match, index) => {
      return inlineCodes[parseInt(index)];
    });

    // Restore code blocks
    protectedContent = protectedContent.replace(/__CODEBLOCK_(\d+)__/g, (match, index) => {
      return codeBlocks[parseInt(index)];
    });

    return protectedContent;
  }

  function stripThinkingTags(content) {
    if (!content) return content;
    // Remove <think>...</think> blocks (used by Qwen3, DeepSeek-R1, etc.)
    return content.replace(/<think>[\s\S]*?<\/think>\s*/gi, '').trim();
  }

  function formatContent(content) {
    if (!content) return '';

    try {
      // Strip thinking tags from reasoning models
      const cleaned = stripThinkingTags(content);
      // First render LaTeX
      const withLatex = renderLatex(cleaned);
      // Then use marked.js for markdown parsing
      return marked.parse(withLatex);
    } catch (e) {
      // Fallback: escape HTML and preserve line breaks
      return content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\\n/g, '<br>');
    }
  }

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
        tokensEl: element.querySelector(`[data-tokens-id="${modelId}"]`),
        timeEl: element.querySelector(`[data-time-id="${modelId}"]`)
      };
      modelData[modelId] = entry;
      modelData[modelName] = entry;
    };

    if (models.length === 1) {
      const modelId = models[0];
      const modelName = modelSelector.models[modelId]?.name || modelId;
      const messageDiv = document.createElement('div');
      messageDiv.className = 'message assistant';
      messageDiv.innerHTML = `
          <div class="model-header">
            <span class="model-name">${modelName}</span>
            ${getContextInfo(modelId)}
            <span class="model-badge streaming-badge">Streaming...</span>
          </div>
          <div class="message-content" data-model-id="${modelId}"><span class="cursor">▋</span></div>
          <div class="message-footer" style="display: none;" data-footer-id="${modelId}">
            <div class="stat-item">
              <span class="stat-label">Tokens</span>
              <span class="stat-value" data-tokens-id="${modelId}">-</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Time</span>
              <span class="stat-value" data-time-id="${modelId}">-</span>
            </div>
          </div>
        `;
      chatHistory.appendChild(messageDiv);
      registerEntry(modelId, modelName, messageDiv);
    } else {
      const container = document.createElement('div');
      container.className = 'model-responses';

      for (const modelId of models) {
        const modelName = modelSelector.models[modelId]?.name || modelId;
        const responseDiv = document.createElement('div');
        responseDiv.className = 'model-response';
        responseDiv.innerHTML = `
            <div class="model-header">
              <span class="model-name">${modelName}</span>
              ${getContextInfo(modelId)}
              <span class="model-badge streaming-badge">Waiting...</span>
            </div>
            <div class="message-content" data-model-id="${modelId}"><span class="cursor">▋</span></div>
            <div class="message-footer" style="display: none;" data-footer-id="${modelId}">
              <div class="stat-item">
                <span class="stat-label">Tokens</span>
                <span class="stat-value" data-tokens-id="${modelId}">-</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Time</span>
                <span class="stat-value" data-time-id="${modelId}">-</span>
              </div>
            </div>
          `;
        container.appendChild(responseDiv);
        registerEntry(modelId, modelName, responseDiv);
      }
      chatHistory.appendChild(container);
    }

    chatHistory.scrollTop = chatHistory.scrollHeight;
    return modelData;
  }

  // Update streaming content for a model
  function updateStreamingContent(modelData, modelId, content, isToken = true) {
    const entry = modelData[modelId];
    if (!entry || !entry.contentEl) return;

    if (isToken) {
      entry.content += content;
    }

    entry.contentEl.innerHTML = formatContent(entry.content) + '<span class="cursor">▋</span>';
    chatHistory.scrollTop = chatHistory.scrollHeight;
  }

  // Finalize streaming for a model
  function finalizeStreaming(modelData, modelId, time, tokenEstimate, error = false) {
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
      entry.contentEl.innerHTML = formatContent(entry.content);
    }

    // Show footer with stats
    if (!error && time && entry.footerEl) {
      entry.footerEl.style.display = 'flex';
      if (entry.timeEl) {
        entry.timeEl.textContent = time.toFixed(2) + 's';
      }
      if (entry.tokensEl) {
        entry.tokensEl.textContent = tokenEstimate || '-';
      }

      // Add tokens to usage tracker (only if one model is selected)
      const currentSelection = modelSelector.getSelected();
      if (currentSelection.length === 1 && tokenEstimate) {
        addTokens(parseInt(tokenEstimate) || 0);
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
          max_tokens: parseInt(maxTokens.value),
          temperature: parseFloat(tempSlider.value),
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
                finalizeStreaming(modelData, entryKey, data.time, data.token_estimate);
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
    chatHistory.innerHTML = `
        <div class="welcome-card">
          <div class="welcome-title">Compare AI Model Responses</div>
          <div class="welcome-subtitle">
            Select one or multiple models to compare their responses side-by-side.
            Each response includes metrics like tokens and response time.
          </div>
          <div class="example-prompts" style="margin-top: 20px;">
            <div class="example-prompts-label">Try an example:</div>
            <div class="example-chips">
              <button class="example-chip" data-prompt="How many times does the letter 'r' appear in the word 'irregularity'?">Count 'r' in irregularity</button>
              <button class="example-chip" data-prompt="Count how many 's' letters are in the word 'assassination'.">Count 's' in assassination</button>
              <button class="example-chip" data-prompt="Which number is larger: 7.09 or 7.9?">7.09 vs 7.9</button>
              <button class="example-chip" data-prompt="Which number is bigger: 10.12 or 10.9?">10.12 vs 10.9</button>
              <button class="example-chip" data-prompt="Alice has 4 brothers and 5 sisters. How many sisters does Alice's brother have?">Alice sibling puzzle</button>
              <button class="example-chip" data-prompt="If architect I. M. Pei designed the Louvre Pyramid, who designed the Louvre Pyramid?">Louvre designer reversal</button>
              <button class="example-chip" data-prompt="The Apollo 11 landing was in July 1969 and Apollo 12 in November 1969. Which mission happened second?">Apollo chronology</button>
              <button class="example-chip" data-prompt="A shipping company has 48 boxes and each pallet holds 6 boxes. How many pallets are needed? Do we need an extra pallet?">48 boxes / pallet sanity</button>
            </div>
          </div>
        </div>
      `;

    // Re-attach event listeners to example chips
    document.querySelectorAll('.example-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        const prompt = chip.getAttribute('data-prompt');
        if (prompt) {
          userInput.value = prompt;
          userInput.focus();
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

  // Handle example prompt clicks
  document.querySelectorAll('.example-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      const prompt = chip.getAttribute('data-prompt');
      if (prompt) {
        userInput.value = prompt;
        userInput.focus();
      }
    });
  });

  // Handle example-prompt class buttons (static HTML examples)
  document.querySelectorAll('.example-prompt').forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      const prompt = button.getAttribute('data-prompt');
      if (prompt) {
        userInput.value = prompt;
        userInput.focus();
      }
    });
  });
});
