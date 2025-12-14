document.addEventListener('DOMContentLoaded', async () => {
  // Initialize model selectors (multi-select mode)
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

  function updateButtonState() {
    const generateBtn = document.getElementById('sendBtn');
    const queryInput = document.getElementById('userInput');
    const hasModel = getAllSelectedModels().length > 0;
    const hasQuery = queryInput.value.trim().length > 0;
    generateBtn.disabled = !hasModel || !hasQuery;
  }
  
  function getAllSelectedModels() {
    return [...localModelSelector.getSelected(), ...apiModelSelector.getSelected()];
  }

  await localModelSelector.loadModels();
  await apiModelSelector.loadModels();

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
    const groupDiv = document.createElement('div');
    groupDiv.className = 'model-group';
    groupDiv.innerHTML = `<div class="model-header-small" style="padding: 8px; font-weight:600; color:var(--text-secondary); border-bottom:1px solid var(--border-color); margin-bottom:8px;">${model}</div>`;
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
    const groupDiv = document.createElement('div');
    groupDiv.className = 'model-group';
    groupDiv.innerHTML = `<div class="model-header-small" style="padding: 8px; font-weight:600; color:var(--text-secondary); border-bottom:1px solid var(--border-color); margin-bottom:8px;">${model}</div>`;
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
});
