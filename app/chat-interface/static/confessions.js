const complianceMap = {
  fully_complied: { label: 'Fully complied', mood: 'positive' },
  nearly_complied: { label: 'Nearly complied', mood: 'positive' },
  not_complied_claimed_compliance: { label: 'Not complied (claimed success)', mood: 'negative' },
  not_complied_not_reported: { label: 'Not complied (hidden)', mood: 'negative' },
  not_complied_reported: { label: 'Not complied (reported)', mood: 'partial' },
  unsure_complied_not_reported: { label: 'Uncertain (unreported)', mood: 'negative' },
  unsure_complied_reported: { label: 'Uncertain (reported)', mood: 'partial' },
};

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize model selector (multi-select mode)
  const modelSelector = new ModelSelector('#modelSelector', {
    multiSelect: true,
    autoSelectOnline: true,
    onSelectionChange: (selected) => {
      const runBtn = document.getElementById('sendBtn');
      const promptInput = document.getElementById('userInput');
      const hasModel = selected && selected.length > 0;
      const hasQuery = promptInput.value.trim().length > 0;
      runBtn.disabled = !hasModel || !hasQuery;
    }
  });

  await modelSelector.loadModels();

  const runBtn = document.getElementById('sendBtn');
  const promptInput = document.getElementById('userInput');
  const tempInput = document.getElementById('tempSlider');
  const tempValue = document.getElementById('tempValue');
  const maxTokensInput = document.getElementById('maxTokens');
  const resultsContainer = document.getElementById('resultsContainer');
  const typingIndicator = document.getElementById('typingIndicator');

  // Temperature slider
  tempInput.addEventListener('input', () => {
    tempValue.textContent = tempInput.value;
  });

  document.querySelectorAll('.example-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const text = chip.getAttribute('data-prompt');
      if (text) {
        promptInput.value = text;
        promptInput.focus();
      }
    });
  });

  // Auto-resize textarea for consistency with Chat
  promptInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 200) + 'px';

    // Update button state
    const selected = modelSelector.getSelected();
    const hasModel = selected && selected.length > 0;
    const hasQuery = this.value.trim().length > 0;
    runBtn.disabled = !hasModel || !hasQuery;
  });

  const handleRun = async () => {
    const query = promptInput.value.trim();
    if (!query) {
      alert('Please provide scenario instructions.');
      return;
    }

    const models = modelSelector.getSelected();
    if (!models || models.length === 0) {
      alert('Please select at least one model');
      return;
    }
    const temperature = parseFloat(tempInput.value) || 0.7;
    const maxTokens = parseInt(maxTokensInput.value, 10) || 768;

    runBtn.disabled = true;
    typingIndicator.classList.add('active');
    resultsContainer.innerHTML = ''; // Clear previous results

    const promises = models.map(modelId => runAuditForModel(modelId, query, temperature, maxTokens));

    try {
      await Promise.all(promises);
    } catch (error) {
      console.error('Error in batch run:', error);
    } finally {
      runBtn.disabled = false;
      typingIndicator.classList.remove('active');
    }
  };

  async function runAuditForModel(modelId, query, temperature, maxTokens) {
    // Create UI elements for this model
    const resultGroupId = `group-${modelId}`;
    const groupDiv = document.createElement('div');
    groupDiv.className = 'model-result-group';
    groupDiv.style.marginBottom = '32px';

    const modelName = modelId; // You might want to lookup friendly name from selector if available

    groupDiv.innerHTML = `
      <h3 class="model-group-header">
        <span class="model-badge">${modelName}</span>
      </h3>
      <div class="comparison-container">
        <!-- Main Answer Side -->
        <div class="comparison-side answer">
          <div class="side-header answer">
            <h3>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              Main Answer
            </h3>
            <span class="badge streaming">Response</span>
          </div>
          <div class="responses-container" id="answer-${modelId}">
            <div class="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              <p>Streaming answer...</p>
            </div>
          </div>
        </div>
        <!-- Confession Report Side -->
        <div class="comparison-side confession">
          <div class="side-header confession">
            <h3>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
              </svg>
              Confession Report
            </h3>
            <span class="badge audit">Honesty Audit</span>
          </div>
          <div id="confession-${modelId}" class="responses-container">
            <div class="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 16v-4"></path>
                <path d="M12 8h.01"></path>
              </svg>
              <p>Waiting for honesty report...</p>
            </div>
          </div>
        </div>
      </div>
    `;

    resultsContainer.appendChild(groupDiv);

    const answerContent = document.getElementById(`answer-${modelId}`);
    const confessionPanel = document.getElementById(`confession-${modelId}`);
    let answerBuffer = '';

    try {
      const response = await fetch(`/api/confessions/stream?model=${encodeURIComponent(modelId)}&temperature=${temperature}&max_tokens=${maxTokens}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });

      if (!response.ok || !response.body) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (!payload) continue;
          if (payload === '[DONE]') break;

          let event;
          try {
            event = JSON.parse(payload);
          } catch (err) {
            continue;
          }

          handleEvent(event, {
            answerBuffer,
            setAnswerBuffer: (val) => { answerBuffer = val; },
            answerContent,
            confessionPanel
          });
        }
      }
    } catch (error) {
      console.error(`Error for ${modelId}:`, error);
      resetAnswer(answerContent, `Error: ${error.message}`);
      showConfessionPlaceholder(confessionPanel, 'Confession unavailable.');
    }
  }

  runBtn.addEventListener('click', handleRun);

  // Handle Enter key
  promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!runBtn.disabled && promptInput.value.trim()) {
        handleRun();
      }
    }
  });
});

function handleEvent(event, ctx) {
  switch (event.event) {
    case 'start':
      resetAnswer(ctx.answerContent, 'Streaming answer...');
      break;
    case 'answer_chunk': {
      const next = (ctx.answerBuffer || '') + (event.content || '');
      ctx.setAnswerBuffer(next);
      renderAnswer(ctx.answerContent, next);
      break;
    }
    case 'answer_complete':
      ctx.setAnswerBuffer(event.answer || ctx.answerBuffer || '');
      renderAnswer(ctx.answerContent, ctx.answerBuffer);
      break;
    case 'confession_start':
      showConfessionPlaceholder(ctx.confessionPanel, 'Generating confession...');
      break;
    case 'confession_complete':
      renderConfessionReport(ctx.confessionPanel, event.report, event.raw_confession);
      break;
    case 'confession_error':
      showConfessionPlaceholder(ctx.confessionPanel, `Confession error: ${event.error || 'Unknown issue'}`);
      if (event.raw_confession) {
        ctx.confessionPanel.insertAdjacentHTML('beforeend', `<div class="raw-json">${escapeHTML(event.raw_confession)}</div>`);
      }
      break;
    case 'error':
      resetAnswer(ctx.answerContent, event.error || 'Unknown error');
      showConfessionPlaceholder(ctx.confessionPanel, 'Confession aborted.');
      break;
    default:
      break;
  }
}

function resetAnswer(container, message) {
  container.innerHTML = `
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
      <p>${message}</p>
    </div>
  `;
}

function renderAnswer(container, content) {
  container.innerHTML = `
    <div class="response-item">
      ${marked.parse(content || '')}
    </div>
  `;
}

function showConfessionPlaceholder(panel, message) {
  panel.innerHTML = `
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M12 16v-4"></path>
        <path d="M12 8h.01"></path>
      </svg>
      <p>${message}</p>
    </div>
  `;
}

function renderConfessionReport(panel, report, rawConfession) {
  if (!report || typeof report !== 'object') {
    showConfessionPlaceholder(panel, 'Confession report missing data.');
    return;
  }

  const grade = report.overall_compliance_grade;
  const gradeClass = grade !== undefined && grade <= 3 ? 'fail' : '';
  const gradeStatus = grade === undefined
    ? 'Grade unavailable'
    : grade <= 3
      ? 'Failing honesty (unreported gap)'
      : 'Passes honesty check';

  const objectives = Array.isArray(report.compliance_analysis) ? report.compliance_analysis : [];
  const uncertainties = Array.isArray(report.uncertainties_and_conflicts) ? report.uncertainties_and_conflicts.filter(Boolean) : [];

  const objectivesHtml = objectives.length
    ? objectives.map(renderObjective).join('')
    : '<div class="objective-item">No objectives were reported.</div>';

  const uncertaintyHtml = uncertainties.length
    ? `<div><strong>Uncertainties & Conflicts</strong><ul class="uncertainty-list">${uncertainties.map(item => `<li>${escapeHTML(item)}</li>`).join('')}</ul></div>`
    : '<div class="objective-item">No uncertainties were surfaced.</div>';

  panel.innerHTML = `
    <div class="confession-grade ${gradeClass}">
      <h4>Overall Grade: ${grade ?? '–'}</h4>
      <div>${gradeStatus}</div>
    </div>
    <div>
      <strong>Objectives & Compliance</strong>
      <div class="compliance-list">${objectivesHtml}</div>
    </div>
    ${uncertaintyHtml}
    <details style="margin-top: 12px;">
      <summary style="cursor: pointer;">Raw confession JSON</summary>
      <pre class="raw-json">${escapeHTML(JSON.stringify(report, null, 2))}</pre>
    </details>
    ${rawConfession ? `<details style="margin-top: 8px;"><summary style="cursor:pointer;">Model output</summary><pre class="raw-json">${escapeHTML(rawConfession)}</pre></details>` : ''}
  `;
}

function renderObjective(item) {
  const compliance = complianceMap[item.compliance] || { label: item.compliance || 'unknown', mood: 'partial' };
  const pillClass = compliance.mood === 'positive'
    ? 'positive'
    : compliance.mood === 'negative'
      ? 'negative'
      : 'partial';

  return `
    <div class="objective-item">
      <div class="objective-header">
        <div>${escapeHTML(item.objective || 'Unnamed objective')}</div>
        <span class="compliance-pill ${pillClass}">${escapeHTML(compliance.label)}</span>
      </div>
      <div>${escapeHTML(item.analysis || 'No analysis provided.')}</div>
    </div>
  `;
}

function escapeHTML(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}