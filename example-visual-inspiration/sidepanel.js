/**
 * GitHub Models Arena - Side Panel
 * Chrome extension for querying AI models via GitHub Models API
 */

// Configuration
const CONFIG = {
  API_URL: 'https://models.github.ai/inference/chat/completions',
  CATALOG_URL: 'https://models.github.ai/catalog/models',
  MAX_TOKENS: 1024,
  MAX_CONTENT_LENGTH: 2000,
  MAX_INPUT_HEIGHT: 150,
  HIGH_TIER_TOKEN_THRESHOLD: 100000,
  REASONING_THINKING_MIN_LENGTH: 50
};

// Model priority configuration
const MODEL_PRIORITIES = {
  'gpt-4o': 1,
  'llama-3.3-70b': 2,
  'mistral-large': 3,
  HIGH_TIER_DEFAULT: 10,
  LOW_TIER_DEFAULT: 50
};

// Reasoning model patterns
const REASONING_PATTERNS = [
  'o1', 'o1-mini', 'o1-preview', 'o3', 'o4',
  'deepseek-r1', 'deepseek-reasoner',
  'phi-4-reasoning', 'phi-4-mini-reasoning',
  'mai-ds-r1'
];

// State
const STATE = {
  models: [],
  selectionMode: 'auto',
  selectedModels: new Set(),
  tabsContext: [],
  selectedTabs: new Set(),
  rateLimits: {},
  theme: 'system'
};

// DOM Elements
const DOM = {
  chatView: document.getElementById('chatView'),
  settingsView: document.getElementById('settingsView'),
  chatHistory: document.getElementById('chatHistory'),
  chatInput: document.getElementById('chatInput'),
  sendBtn: document.getElementById('sendBtn'),
  themeToggle: document.getElementById('themeToggle'),
  settingsToggle: document.getElementById('settingsToggle'),
  backToChat: document.getElementById('backToChat'),
  modelTrigger: document.getElementById('modelTrigger'),
  modelPopup: document.getElementById('modelPopup'),
  closePopup: document.getElementById('closePopup'),
  popupManualSelection: document.getElementById('popupManualSelection'),
  popupModelsList: document.getElementById('popupModelsList'),
  modelSearchInput: document.getElementById('modelSearchInput'),
  modelsList: document.getElementById('modelsList'),
  manualSelectionArea: document.getElementById('manualSelectionArea'),
  pageContextIndicator: document.getElementById('pageContextIndicator'),
  pageContextTitle: document.getElementById('pageContextTitle'),
  tabsList: document.getElementById('tabsList'),
  tabsChevron: document.getElementById('tabsChevron'),
  selectionRadios: document.querySelectorAll('input[name="selectionMode"]'),
  createTokenBtn: document.getElementById('createTokenBtn'),
  apiKeyField: document.getElementById('apiKeyField'),
  toggleTokenVisibility: document.getElementById('toggleTokenVisibility'),
  eyeIcon: document.getElementById('eyeIcon'),
  eyeOffIcon: document.getElementById('eyeOffIcon'),
  saveApiKey: document.getElementById('saveApiKey'),
  authStatus: document.getElementById('authStatus'),
  authStatusText: document.getElementById('authStatusText')
};

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  await initAuth();
  setupEventListeners();
  configureMarked();
  await loadModelCatalog();
  loadCurrentPageInfo();
});

// Authentication Management
async function initAuth() {
  const { apiKey } = await chrome.storage.local.get(['apiKey']);
  CONFIG.GITHUB_TOKEN = apiKey;

  if (CONFIG.GITHUB_TOKEN && DOM.apiKeyField) {
    DOM.apiKeyField.value = CONFIG.GITHUB_TOKEN;
  }

  await checkAuthStatus();
}

async function checkAuthStatus() {
  if (!CONFIG.GITHUB_TOKEN) {
    showAuthStatus('warning', 'No token configured - click "Create Token" above');
    return;
  }

  try {
    const response = await fetch(CONFIG.CATALOG_URL, {
      headers: await getAuthHeaders(),
      method: 'GET'
    });

    if (response.ok) {
      showAuthStatus('success', 'Token is valid');
    } else if (response.status === 401) {
      showAuthStatus('error', 'Invalid token - please create a new one');
    } else {
      showAuthStatus('warning', `Status: ${response.status}`);
    }
  } catch {
    showAuthStatus('warning', 'Could not verify token');
  }
}

function showAuthStatus(type, message) {
  const styles = {
    success: {
      background: 'rgba(5, 150, 105, 0.1)',
      border: '1px solid rgba(5, 150, 105, 0.3)',
      color: 'var(--success-color)'
    },
    warning: {
      background: 'rgba(217, 119, 6, 0.1)',
      border: '1px solid rgba(217, 119, 6, 0.3)',
      color: 'var(--warning-color)'
    },
    error: {
      background: 'rgba(220, 38, 38, 0.1)',
      border: '1px solid rgba(220, 38, 38, 0.3)',
      color: 'var(--danger-color)'
    }
  };

  const style = styles[type] || styles.error;

  DOM.authStatus.style.display = 'block';
  DOM.authStatusText.textContent = message;
  Object.assign(DOM.authStatus.style, style);
}

async function getAuthHeaders() {
  const headers = {
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28'
  };

  if (CONFIG.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${CONFIG.GITHUB_TOKEN}`;
  }

  return headers;
}

// Theme Management
function initTheme() {
  setTheme(localStorage.getItem('theme') || 'system');
}

function setTheme(theme) {
  STATE.theme = theme;
  localStorage.setItem('theme', theme);

  const isDark = theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
}

// Event Listeners
function setupEventListeners() {
  // Theme Toggle
  DOM.themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    setTheme(current === 'dark' ? 'light' : 'dark');
  });

  // View Navigation
  DOM.settingsToggle.addEventListener('click', () => switchView('settings'));
  DOM.backToChat.addEventListener('click', () => switchView('chat'));

  // Model Popup
  DOM.modelTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleModelPopup();
  });

  DOM.closePopup?.addEventListener('click', () => {
    DOM.modelPopup.classList.add('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!DOM.modelPopup?.classList.contains('hidden') &&
        !DOM.modelPopup.contains(e.target) &&
        !DOM.modelTrigger.contains(e.target)) {
      DOM.modelPopup.classList.add('hidden');
    }
  });

  // Chat Input
  DOM.chatInput.addEventListener('input', () => {
    DOM.chatInput.style.height = 'auto';
    DOM.chatInput.style.height = `${Math.min(DOM.chatInput.scrollHeight, CONFIG.MAX_INPUT_HEIGHT)}px`;
    DOM.sendBtn.disabled = !DOM.chatInput.value.trim();
  });

  DOM.chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSend();
    }
  });

  DOM.sendBtn.addEventListener('click', handleChatSend);

  // Selection Mode (Settings)
  DOM.selectionRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      STATE.selectionMode = e.target.value;
      updateSelectionUI();
      syncPopupState();
    });
  });

  // Selection Mode (Popup)
  document.querySelectorAll('input[name="selectionModePopup"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      STATE.selectionMode = e.target.value;
      updateSelectionUI();
      updatePopupUI();

      if (STATE.selectionMode === 'manual' && DOM.modelSearchInput) {
        setTimeout(() => DOM.modelSearchInput.focus(), 100);
      }

      const settingsRadio = document.querySelector(`input[name="selectionMode"][value="${STATE.selectionMode}"]`);
      if (settingsRadio) settingsRadio.checked = true;
    });
  });

  // Model Search
  if (DOM.modelSearchInput) {
    DOM.modelSearchInput.addEventListener('input', (e) => {
      filterPopupModels(e.target.value.toLowerCase());
    });

    DOM.modelPopup.addEventListener('transitionend', () => {
      if (DOM.modelPopup.classList.contains('hidden')) {
        DOM.modelSearchInput.value = '';
      }
    });
  }

  // Token Management
  DOM.createTokenBtn?.addEventListener('click', () => {
    chrome.tabs.create({
      url: 'https://github.com/settings/personal-access-tokens/new?description=GitHub+Models+API+token&name=GitHub+Models+Arena&user_models=read'
    });
  });

  if (DOM.toggleTokenVisibility && DOM.apiKeyField) {
    DOM.toggleTokenVisibility.addEventListener('click', () => {
      const isPassword = DOM.apiKeyField.type === 'password';
      DOM.apiKeyField.type = isPassword ? 'text' : 'password';
      DOM.eyeIcon.style.display = isPassword ? 'none' : 'block';
      DOM.eyeOffIcon.style.display = isPassword ? 'block' : 'none';
    });
  }

  DOM.saveApiKey?.addEventListener('click', async () => {
    const apiKey = DOM.apiKeyField.value.trim();
    if (!apiKey) {
      showAuthStatus('error', 'Please paste your token');
      return;
    }

    CONFIG.GITHUB_TOKEN = apiKey;
    await chrome.storage.local.set({ apiKey });
    await checkAuthStatus();

    // Reload models with new token
    await loadModelCatalog();
  });

  // Tab Events
  chrome.tabs.onActivated.addListener(loadCurrentPageInfo);
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete') loadCurrentPageInfo();
  });

  DOM.pageContextIndicator?.addEventListener('click', () => {
    const isHidden = DOM.tabsList.classList.toggle('hidden');
    DOM.tabsChevron.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(180deg)';
  });

  // Example Prompts
  document.addEventListener('click', (e) => {
    const promptBtn = e.target.closest('.example-prompt');
    if (!promptBtn) return;

    const prompt = promptBtn.dataset.prompt;
    if (prompt && DOM.chatInput) {
      DOM.chatInput.value = prompt;
      DOM.chatInput.style.height = 'auto';
      DOM.chatInput.style.height = `${Math.min(DOM.chatInput.scrollHeight, CONFIG.MAX_INPUT_HEIGHT)}px`;
      DOM.sendBtn.disabled = false;
      DOM.chatInput.focus();

      document.getElementById('welcomeCard')?.style.setProperty('display', 'none');
    }
  });

  // Thinking Section Toggle
  DOM.chatHistory.addEventListener('click', (e) => {
    const thinkingHeader = e.target.closest('.thinking-header');
    if (!thinkingHeader) return;

    const content = thinkingHeader.parentElement.querySelector('.thinking-content');
    const chevron = thinkingHeader.querySelector('.thinking-chevron');

    if (content && chevron) {
      content.classList.toggle('expanded');
      chevron.classList.toggle('expanded');
    }
  });

  // Clear Cache
  document.getElementById('clearCache')?.addEventListener('click', () => {
    STATE.rateLimits = {};
    chrome.storage.local.clear(() => alert('Cache cleared successfully'));
  });
}

function switchView(viewName) {
  const isChat = viewName === 'chat';
  DOM.chatView.classList.toggle('hidden', !isChat);
  DOM.settingsView.classList.toggle('hidden', isChat);
}

function updateSelectionUI() {
  const triggerText = document.getElementById('modelTriggerText');
  triggerText.textContent = STATE.selectionMode === 'manual'
    ? `Manual (${STATE.selectedModels.size})`
    : 'Auto';
  updateRateLimitDisplay();
}

function toggleModelPopup() {
  const isHidden = DOM.modelPopup.classList.contains('hidden');
  if (isHidden) {
    syncPopupState();
    renderPopupModelList();
    DOM.modelPopup.classList.remove('hidden');
  } else {
    DOM.modelPopup.classList.add('hidden');
  }
}

function syncPopupState() {
  const popupRadio = document.querySelector(`input[name="selectionModePopup"][value="${STATE.selectionMode}"]`);
  if (popupRadio) popupRadio.checked = true;
  updatePopupUI();
}

function updatePopupUI() {
  DOM.popupManualSelection.classList.toggle('hidden', STATE.selectionMode !== 'manual');

  if (STATE.selectionMode === 'manual' && DOM.modelSearchInput) {
    setTimeout(() => DOM.modelSearchInput.focus(), 100);
  }
}

function renderPopupModelList(filteredModels = null) {
  if (!DOM.popupModelsList) return;

  const modelsToRender = filteredModels || STATE.models;
  const sortedModels = [...modelsToRender].sort((a, b) => {
    if (a.tier !== b.tier) return a.tier === 'high' ? -1 : 1;
    return (a.priority || 999) - (b.priority || 999);
  });

  if (sortedModels.length === 0) {
    DOM.popupModelsList.innerHTML = `
      <div style="padding: 1rem; text-align: center; color: var(--text-secondary); font-size: 0.85rem;">
        No models found
      </div>`;
    return;
  }

  DOM.popupModelsList.innerHTML = sortedModels.map(model => {
    const isSelected = STATE.selectedModels.has(model.id);
    const tierClass = model.tier === 'high' ? 'tier-high' : 'tier-low';

    return `
      <label class="model-item" data-model-id="${model.id}">
        <div class="checkbox-wrapper">
          <input type="checkbox" value="${model.id}" ${isSelected ? 'checked' : ''}>
          <div class="model-info">
            <div class="model-name">
              ${model.name}
              <span class="tier-badge ${tierClass}">${model.tier}</span>
            </div>
            <div class="model-meta">${model.publisher} • ${(model.max_output_tokens / 1000).toFixed(0)}k out</div>
          </div>
        </div>
      </label>`;
  }).join('');

  // Attach event listeners
  DOM.popupModelsList.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const modelId = e.target.value;
      if (e.target.checked) {
        STATE.selectedModels.add(modelId);
      } else {
        STATE.selectedModels.delete(modelId);
      }
      updateSelectionUI();
    });
  });
}

function filterPopupModels(query) {
  if (!query) {
    renderPopupModelList();
    return;
  }

  const filtered = STATE.models.filter(model => {
    const searchText = `${model.name} ${model.publisher} ${model.id}`.toLowerCase();
    return searchText.includes(query);
  });

  renderPopupModelList(filtered);
}

// Model Management
async function loadModelCatalog() {
  try {
    const response = await fetch(CONFIG.CATALOG_URL, {
      headers: await getAuthHeaders()
    });

    if (!response.ok) {
      console.warn(`Failed to fetch models: ${response.status}`);
      return;
    }

    const data = await response.json();
    const rawModels = data.models || data || [];

    STATE.models = rawModels.map(model => {
      const tier = isHighTierModel(model) ? 'high' : 'low';
      const priority = getModelPriority(model.id, tier);
      return { ...model, priority, tier };
    });

    if (STATE.models.length === 0) {
      console.warn('No models returned from API');
    }
  } catch (e) {
    console.error('Failed to load model catalog:', e);
  }
}

function isHighTierModel(model) {
  return model.max_input_tokens > CONFIG.HIGH_TIER_TOKEN_THRESHOLD ||
    model.id.includes('gpt-4') ||
    model.id.includes('llama-3.1-405b') ||
    model.id.includes('deepseek-v3');
}

function getModelPriority(modelId, tier) {
  for (const [pattern, priority] of Object.entries(MODEL_PRIORITIES)) {
    if (modelId.includes(pattern)) return priority;
  }
  return tier === 'high' ? MODEL_PRIORITIES.HIGH_TIER_DEFAULT : MODEL_PRIORITIES.LOW_TIER_DEFAULT;
}

// Chat Logic
async function handleChatSend() {
  const text = DOM.chatInput.value.trim();
  if (!text) return;

  addMessageToUI('user', text);
  DOM.chatInput.value = '';
  DOM.chatInput.style.height = 'auto';
  DOM.sendBtn.disabled = true;

  if (STATE.tabsContext.length === 0) await loadCurrentPageInfo();
  const prompt = buildPrompt(text);

  let modelsToRun = [];
  if (STATE.selectionMode === 'auto') {
    modelsToRun = [...STATE.models]
      .sort((a, b) => (a.priority || 999) - (b.priority || 999))
      .slice(0, 1);
  } else {
    modelsToRun = STATE.models.filter(m => STATE.selectedModels.has(m.id));
    if (modelsToRun.length === 0) {
      addMessageToUI('assistant', 'Please select at least one model in settings.', 'System');
      DOM.sendBtn.disabled = false;
      return;
    }
  }

  const messageIds = modelsToRun.map(m => addMessageToUI('assistant', null, m.name, true));

  if (STATE.selectionMode === 'auto') {
    await executeAutoMode(prompt, messageIds[0]);
  } else {
    await Promise.all(modelsToRun.map((m, i) => executeModel(m, prompt, messageIds[i])));
  }

  DOM.sendBtn.disabled = false;
}

async function executeAutoMode(prompt, messageId) {
  const sortedModels = [...STATE.models].sort((a, b) => (a.priority || 999) - (b.priority || 999));

  for (const model of sortedModels) {
    try {
      const msgEl = document.getElementById(messageId);
      if (msgEl) {
        msgEl.querySelector('.model-header span').textContent = `${model.name} (Auto)`;
      }

      await executeModel(model, prompt, messageId);
      return;
    } catch (e) {
      console.error(`Model ${model.name} failed:`, e);
    }
  }

  const msgEl = document.getElementById(messageId);
  if (msgEl) {
    msgEl.querySelector('.message-content').innerHTML =
      `<span style="color:var(--danger-color)">All models failed to respond.</span>`;
    msgEl.querySelector('.typing-indicator')?.remove();
  }
}

function isReasoningModel(modelId) {
  return REASONING_PATTERNS.some(pattern => modelId.toLowerCase().includes(pattern));
}

function parseReasoningContent(content) {
  // Format 1: <think> tags
  const thinkTagMatch = content.match(/<think>([\s\S]*?)<\/think>\s*([\s\S]*)/i);
  if (thinkTagMatch && thinkTagMatch[1].trim().length > 20) {
    return {
      thinking: thinkTagMatch[1].trim(),
      answer: thinkTagMatch[2].trim() || '(No additional answer provided)'
    };
  }

  // Format 2: Boxed answer
  const boxedMatch = content.match(/([\s\S]*?)\\boxed\{([\s\S]*?)\}/);
  if (boxedMatch && boxedMatch[1].trim().length > 50) {
    return {
      thinking: boxedMatch[1].trim(),
      answer: `\\boxed{${boxedMatch[2]}}`
    };
  }

  // Format 3: Explicit markers
  const markers = [
    /^([\s\S]*?)(?:\n\n(?:Final Answer|Answer|Solution|Conclusion):\s*)([\s\S]*)$/im,
    /^([\s\S]*?)(?:\n\n---\n\n)([\s\S]*)$/,
    /^(?:Thinking|Reasoning):([\s\S]*?)(?:\n\n(?:Answer|Final Answer|Conclusion):)\s*([\s\S]*)$/im
  ];

  for (const marker of markers) {
    const match = content.match(marker);
    if (match?.[1] && match?.[2] && match[1].trim().length > 100) {
      return { thinking: match[1].trim(), answer: match[2].trim() };
    }
  }

  // Format 4: Reasoning language detection
  const hasReasoningLanguage = /(?:okay,?\s+so|let me|hmm|i should|wait|thinking|steps?:|first|then|therefore|conclusion)/i.test(content);
  if (hasReasoningLanguage && content.length > 300) {
    const answerPatterns = [
      /\n\n([A-Z][^.!?]*(?:[.!?]|\n)[\s\S]*?)$/,
      /\n\n((?:Hello|Hi|Sure|Yes|No|The answer)[^]*?)$/i
    ];

    for (const pattern of answerPatterns) {
      const match = content.match(pattern);
      if (match && match.index > 100) {
        const thinking = content.substring(0, match.index).trim();
        const answer = match[1].trim();
        if (thinking.length > 100 && answer.length > 20) {
          return { thinking, answer };
        }
      }
    }
  }

  return { thinking: null, answer: content };
}

function renderThinkingSection(thinking) {
  return `
    <div class="thinking-section">
      <div class="thinking-header">
        <div class="thinking-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          <span>Thinking process</span>
        </div>
        <svg class="thinking-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
      <div class="thinking-content">
        <div class="thinking-text">${escapeHtml(thinking)}</div>
      </div>
    </div>`;
}

async function executeModel(model, prompt, messageId) {
  const msgEl = document.getElementById(messageId);
  const contentEl = msgEl.querySelector('.message-content');
  const loadingEl = contentEl.querySelector('.typing-indicator');

  let accumulatedText = '';
  const startTime = performance.now();
  let totalTokens = 0;
  const isReasoning = isReasoningModel(model.id);

  try {
    await streamResponse(prompt, model.id, (chunk, usage) => {
      if (loadingEl) loadingEl.remove();
      accumulatedText += chunk;

      if (isReasoning) {
        const { thinking, answer } = parseReasoningContent(accumulatedText);
        let html = '';
        if (thinking && thinking.length > CONFIG.REASONING_THINKING_MIN_LENGTH) {
          html += renderThinkingSection(thinking);
        }
        html += marked.parse(answer);
        contentEl.innerHTML = html;
      } else {
        contentEl.innerHTML = marked.parse(accumulatedText);
      }

      DOM.chatHistory.scrollTop = DOM.chatHistory.scrollHeight;
      if (usage) totalTokens = usage;
    });

    const duration = ((performance.now() - startTime) / 1000).toFixed(1);
    const tps = totalTokens > 0 ? (totalTokens / duration).toFixed(1) : '?';

    addStatsFooter(msgEl, {
      time: `${duration}s`,
      tokens: `${totalTokens} tok`,
      speed: `${tps} t/s`,
      model: model.name
    });
  } catch (e) {
    if (accumulatedText.length === 0) throw e;
  }
}

function addStatsFooter(messageElement, stats) {
  const footer = document.createElement('div');
  footer.className = 'message-footer';
  footer.innerHTML = `
    <div class="stat-item">
      <div class="stat-label">Latency</div>
      <div class="stat-value">${stats.time}</div>
    </div>
    <div class="stat-item">
      <div class="stat-label">Tokens</div>
      <div class="stat-value">${stats.tokens}</div>
    </div>
    <div class="stat-item">
      <div class="stat-label">Speed</div>
      <div class="stat-value">${stats.speed}</div>
    </div>
    <div class="stat-item">
      <div class="stat-label">Model</div>
      <div class="stat-value" style="font-size: 0.7rem;">${stats.model}</div>
    </div>`;
  messageElement.appendChild(footer);
}

// API Interaction
async function streamResponse(prompt, modelId, onChunk) {
  const headers = await getAuthHeaders();
  headers['Accept'] = 'text/event-stream';

  const response = await fetch(CONFIG.API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      max_tokens: CONFIG.MAX_TOKENS,
      stream_options: { include_usage: true }
    })
  });

  if (!response.ok) {
    const err = new Error(`HTTP ${response.status}`);
    err.status = response.status;
    throw err;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let usage = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;

      const data = line.slice(6);
      if (data === '[DONE]') return;

      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content;

        if (parsed.usage) usage = parsed.usage.total_tokens;
        if (content) onChunk(content, usage);
        else if (usage > 0) onChunk('', usage);
      } catch {
        // Ignore parse errors for malformed chunks
      }
    }
  }
}

// UI Helpers
function addMessageToUI(role, content, modelName = 'Assistant', isLoading = false) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.id = `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  if (role === 'user') {
    div.innerHTML = `<div class="message-content">${escapeHtml(content)}</div>`;
  } else {
    const loadingHtml = isLoading
      ? `<div class="typing-indicator"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>`
      : (content ? marked.parse(content) : '');

    div.innerHTML = `
      <div class="model-header"><span>${modelName}</span></div>
      <div class="message-content">${loadingHtml}</div>`;
  }

  DOM.chatHistory.appendChild(div);
  DOM.chatHistory.scrollTop = DOM.chatHistory.scrollHeight;
  return div.id;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function configureMarked() {
  if (typeof marked !== 'undefined') {
    marked.setOptions({ breaks: true, gfm: true });
  }
}

// Page Context
async function loadCurrentPageInfo() {
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    STATE.tabsContext = [];
    STATE.selectedTabs = new Set();

    for (const tab of tabs) {
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) continue;

      try {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => ({
            title: document.title,
            url: window.location.href,
            content: document.body.innerText.slice(0, 2000)
          })
        });

        STATE.tabsContext.push({
          id: tab.id,
          title: result.result.title || tab.title,
          url: result.result.url || tab.url,
          content: result.result.content,
          isActive: tab.active
        });
        STATE.selectedTabs.add(tab.id);
      } catch (e) {
        console.debug(`Skipped tab ${tab.id}:`, e.message);
      }
    }

    if (STATE.tabsContext.length > 0) {
      DOM.pageContextIndicator.classList.remove('hidden');
      renderTabsList();
      updateTabsIndicator();
    } else {
      DOM.pageContextIndicator.classList.add('hidden');
    }
  } catch (e) {
    console.debug('Context load failed:', e);
    STATE.tabsContext = [];
    DOM.pageContextIndicator.classList.add('hidden');
  }
}

function renderTabsList() {
  if (!DOM.tabsList || !STATE.tabsContext.length) return;

  DOM.tabsList.innerHTML = STATE.tabsContext.map(tab => `
    <label class="tab-item ${tab.isActive ? 'active-tab' : ''}" data-tab-id="${tab.id}">
      <input type="checkbox" ${STATE.selectedTabs.has(tab.id) ? 'checked' : ''}>
      <div class="tab-info">
        <div class="tab-title">${escapeHtml(tab.title)}</div>
        <div class="tab-url">${escapeHtml(tab.url)}</div>
      </div>
    </label>`).join('');

  DOM.tabsList.addEventListener('change', (e) => {
    if (e.target.type !== 'checkbox') return;

    const tabId = parseInt(e.target.closest('[data-tab-id]').dataset.tabId);
    if (e.target.checked) {
      STATE.selectedTabs.add(tabId);
    } else {
      STATE.selectedTabs.delete(tabId);
    }
    updateTabsIndicator();
  });
}

function updateTabsIndicator() {
  if (!STATE.tabsContext.length) return;

  const selected = STATE.selectedTabs.size;
  const total = STATE.tabsContext.length;
  DOM.pageContextTitle.textContent = `${selected}/${total} tab${total > 1 ? 's' : ''}`;
}

function buildPrompt(userMessage) {
  if (!STATE.tabsContext.length) return userMessage;

  const context = STATE.tabsContext
    .filter(tab => STATE.selectedTabs.has(tab.id))
    .map(tab => `Tab: ${tab.title}\nURL: ${tab.url}\nContent:\n${tab.content}`)
    .join('\n\n---\n\n');

  return context
    ? `Context from open tabs:\n\n${context}\n\n---\n\nUser Query: ${userMessage}`
    : userMessage;
}

// Rate Limit Display
function updateRateLimitDisplay() {
  const section = document.getElementById('rateLimitSection');
  const container = document.getElementById('rateLimitCards');

  if (!container) return;

  const hasLimits = Object.keys(STATE.rateLimits).length > 0;
  section.classList.toggle('hidden', !hasLimits);

  if (!hasLimits) return;

  container.innerHTML = Object.entries(STATE.rateLimits).map(([modelId, limit]) => {
    const model = STATE.models.find(m => m.id === modelId);
    if (!model) return '';

    const percentage = limit.remaining && limit.limit
      ? Math.round((limit.remaining / limit.limit) * 100)
      : 100;
    const quotaClass = percentage < 20 ? 'critical' : percentage < 50 ? 'low' : '';

    return `
      <div class="info-card">
        <div class="info-card-title">${model.name}</div>
        <div class="info-card-content">
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
            <span>Requests: ${limit.remaining || '?'} / ${limit.limit || '?'}</span>
            <span>${percentage}%</span>
          </div>
          <div class="quota-bar">
            <div class="quota-fill ${quotaClass}" style="width: ${percentage}%"></div>
          </div>
        </div>
      </div>`;
  }).join('');
}
