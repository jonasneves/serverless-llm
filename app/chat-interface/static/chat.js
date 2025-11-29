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

    const MODELS = {};
    let selectedModels = new Set();
    let conversationHistory = [];
    let statusIntervalId = null;

    const chatHistory = document.getElementById('chatHistory');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');
    const clearBtn = document.getElementById('clearBtn');
    const modelSelector = document.getElementById('modelSelector');
    const tempSlider = document.getElementById('tempSlider');
    const tempValue = document.getElementById('tempValue');
    const maxTokens = document.getElementById('maxTokens');
    const typingIndicator = document.getElementById('typingIndicator');
    const selectedCount = document.getElementById('selectedCount');
    const themeToggle = document.getElementById('themeToggle');

    // Theme toggle
    themeToggle.addEventListener('click', () => {
      const isDark = document.body.getAttribute('data-theme') === 'dark';
      document.body.setAttribute('data-theme', isDark ? 'light' : 'dark');
      localStorage.setItem('theme', isDark ? 'light' : 'dark');
    });

    // Load saved theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);

    // Initialize model selector
    function renderModelSelector() {
      modelSelector.innerHTML = '';
      for (const [id, model] of Object.entries(MODELS)) {
        const chip = document.createElement('div');
        chip.className = `model-chip ${selectedModels.has(id) ? 'selected' : ''}`;
        chip.innerHTML = `<span class="status-dot status-${model.status}"></span>${model.name}`;
        chip.onclick = () => toggleModel(id);
        modelSelector.appendChild(chip);
      }
      updateSelectedCount();
    }

    function toggleModel(id) {
      if (selectedModels.has(id)) {
        selectedModels.delete(id);
      } else {
        selectedModels.add(id);
      }
      renderModelSelector();
    }

    function updateSelectedCount() {
      const count = selectedModels.size;
      selectedCount.textContent = `${count} model${count !== 1 ? 's' : ''} selected`;
      sendBtn.disabled = count === 0;
    }

    // Temperature slider
    tempSlider.addEventListener('input', () => {
      tempValue.textContent = tempSlider.value;
    });

    // Check model status
    async function checkModelStatus(modelId) {
      if (!MODELS[modelId]) return;
      try {
        const response = await fetch(`/api/models/${modelId}/status`);
        const data = await response.json();
        MODELS[modelId].status = data.status === 'online' ? 'online' : 'offline';
      } catch {
        MODELS[modelId].status = 'offline';
      }
      renderModelSelector();
    }

    // Check all models
    function checkAllModels() {
      if (!Object.keys(MODELS).length) return;
      for (const id of Object.keys(MODELS)) {
        checkModelStatus(id);
      }
    }

    async function loadModels() {
      try {
        const response = await fetch('/api/models');
        const data = await response.json();
        Object.keys(MODELS).forEach((id) => delete MODELS[id]);
        selectedModels.clear();

        data.models.forEach((model) => {
          MODELS[model.id] = { name: model.name, status: 'checking' };
        });

        const defaultModelId = (data.default_model && MODELS[data.default_model])
          ? data.default_model
          : Object.keys(MODELS)[0];
        if (defaultModelId) {
          selectedModels.add(defaultModelId);
        }

        renderModelSelector();
        if (Object.keys(MODELS).length) {
          checkAllModels();
          if (!statusIntervalId) {
            statusIntervalId = setInterval(checkAllModels, 30000);
          }
        }
      } catch (error) {
        console.error('Failed to load models', error);
        renderModelSelector();
      }
    }

    // Handle Enter key
    userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
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
    renderer.link = function(href, title, text) {
      const titleAttr = title ? ` title="${title}"` : '';
      return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
    };

    marked.use({ renderer });

    function formatContent(content) {
      if (!content) return '';

      try {
        // Use marked.js for proper markdown parsing
        return marked.parse(content);
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

      if (models.length === 1) {
        const modelName = MODELS[models[0]]?.name || models[0];
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message assistant';
        messageDiv.innerHTML = `
          <div class="model-header">
            <span class="model-name">${modelName}</span>
            <span class="model-badge streaming-badge">Streaming...</span>
          </div>
          <div class="message-content" data-model="${modelName}"><span class="cursor">▋</span></div>
          <div class="message-footer" style="display: none;" data-footer="${modelName}">
            <div class="stat-item">
              <span class="stat-label">Tokens</span>
              <span class="stat-value" data-tokens="${modelName}">-</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Time</span>
              <span class="stat-value" data-time="${modelName}">-</span>
            </div>
          </div>
        `;
        chatHistory.appendChild(messageDiv);
        modelData[modelName] = { content: '', element: messageDiv };
      } else {
        const container = document.createElement('div');
        container.className = 'model-responses';

        for (const modelId of models) {
          const modelName = MODELS[modelId]?.name || modelId;
          const responseDiv = document.createElement('div');
          responseDiv.className = 'model-response';
          responseDiv.innerHTML = `
            <div class="model-header">
              <span class="model-name">${modelName}</span>
              <span class="model-badge streaming-badge">Waiting...</span>
            </div>
            <div class="message-content" data-model="${modelName}"><span class="cursor">▋</span></div>
            <div class="message-footer" style="display: none;" data-footer="${modelName}">
              <div class="stat-item">
                <span class="stat-label">Tokens</span>
                <span class="stat-value" data-tokens="${modelName}">-</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Time</span>
                <span class="stat-value" data-time="${modelName}">-</span>
              </div>
            </div>
          `;
          container.appendChild(responseDiv);
          modelData[modelName] = { content: '', element: responseDiv };
        }
        chatHistory.appendChild(container);
      }

      chatHistory.scrollTop = chatHistory.scrollHeight;
      return modelData;
    }

    // Update streaming content for a model
    function updateStreamingContent(modelData, modelName, content, isToken = true) {
      if (!modelData[modelName]) return;

      if (isToken) {
        modelData[modelName].content += content;
      }

      const contentEl = modelData[modelName].element.querySelector(`[data-model="${modelName}"]`);
      if (contentEl) {
        contentEl.innerHTML = formatContent(modelData[modelName].content) + '<span class="cursor">▋</span>';
        chatHistory.scrollTop = chatHistory.scrollHeight;
      }
    }

    // Finalize streaming for a model
    function finalizeStreaming(modelData, modelName, time, tokenEstimate, error = false) {
      if (!modelData[modelName]) return;

      const el = modelData[modelName].element;

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
      const contentEl = el.querySelector(`[data-model="${modelName}"]`);
      if (contentEl) {
        contentEl.innerHTML = formatContent(modelData[modelName].content);
      }

      // Show footer with stats
      if (!error && time) {
        const footer = el.querySelector(`[data-footer="${modelName}"]`);
        if (footer) {
          footer.style.display = 'flex';
          const timeEl = el.querySelector(`[data-time="${modelName}"]`);
          const tokensEl = el.querySelector(`[data-tokens="${modelName}"]`);
          if (timeEl) timeEl.textContent = time.toFixed(2) + 's';
          if (tokensEl) tokensEl.textContent = tokenEstimate || '-';
        }
      }
    }

    async function sendMessage() {
      const message = userInput.value.trim();
      if (!message || selectedModels.size === 0) return;

      addUserMessage(message);
      conversationHistory.push({ role: 'user', content: message });
      userInput.value = '';

      sendBtn.disabled = true;
      userInput.disabled = true;
      typingIndicator.classList.add('active');

      const models = Array.from(selectedModels);
      const modelData = createStreamingContainer(models);
      let firstContent = '';

      try {
        const response = await fetch('/api/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            models: models,
            messages: conversationHistory,
            max_tokens: parseInt(maxTokens.value),
            temperature: parseFloat(tempSlider.value)
          })
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.event === 'start') {
                  // Model started streaming
                  const badge = modelData[data.model]?.element.querySelector('.streaming-badge');
                  if (badge) badge.textContent = 'Streaming...';
                } else if (data.event === 'token' && data.content) {
                  // Received a token
                  updateStreamingContent(modelData, data.model, data.content);
                } else if (data.event === 'done') {
                  // Model finished
                  if (!firstContent && data.total_content) {
                    firstContent = data.total_content;
                  }
                  finalizeStreaming(modelData, data.model, data.time, data.token_estimate);
                } else if (data.error) {
                  // Error occurred
                  modelData[data.model].content = data.content || 'Error occurred';
                  updateStreamingContent(modelData, data.model, '', false);
                  finalizeStreaming(modelData, data.model, null, null, true);
                } else if (data.event === 'all_done') {
                  // All models finished
                  typingIndicator.classList.remove('active');
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
        for (const modelName of Object.keys(modelData)) {
          modelData[modelName].content = `Connection error: ${error.message}`;
          updateStreamingContent(modelData, modelName, '', false);
          finalizeStreaming(modelData, modelName, null, null, true);
        }
      } finally {
        sendBtn.disabled = selectedModels.size === 0;
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
        </div>
      `;
    }

    // Initialize
    renderModelSelector();
    loadModels();

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
});
