document.addEventListener('DOMContentLoaded', async () => {
    // Load models dynamically
    await modelLoader.load();
    modelLoader.buildModelSelector('#model');

    const generateBtn = document.getElementById('generateBtn');
    const queryInput = document.getElementById('query');
    const modelSelect = document.getElementById('model');
    const numResponsesInput = document.getElementById('numResponses');
    const temperatureInput = document.getElementById('temperature');
    const directResponsesContainer = document.getElementById('directResponses');
    const verbalizedResponsesContainer = document.getElementById('verbalizedResponses');
    const diversityScoreContainer = document.getElementById('diversityScore');

    generateBtn.addEventListener('click', async () => {
      const query = queryInput.value.trim();
      if (!query) {
        alert('Please enter a query');
        return;
      }

      const model = modelSelect.value;
      const numResponses = parseInt(numResponsesInput.value);
      const temperature = parseFloat(temperatureInput.value);

      generateBtn.disabled = true;
      generateBtn.innerHTML = '<span class="loading-spinner"></span> Generating...';

      // Clear previous results
      directResponsesContainer.innerHTML = '<div class="empty-state"><div class="loading-spinner" style="width: 40px; height: 40px; border-width: 4px;"></div><p>Generating direct responses...</p></div>';
      verbalizedResponsesContainer.innerHTML = '<div class="empty-state"><div class="loading-spinner" style="width: 40px; height: 40px; border-width: 4px;"></div><p>Generating verbalized sampling responses...</p></div>';
      diversityScoreContainer.style.display = 'none';

      try {
        // Run both methods in parallel
        await Promise.all([
          generateDirect(query, model, numResponses, temperature),
          generateVerbalized(query, model, numResponses, temperature)
        ]);
      } catch (error) {
        console.error('Error:', error);
        alert('Error generating responses. Check console for details.');
      } finally {
        generateBtn.disabled = false;
        generateBtn.innerHTML = 'Compare Methods';
      }
    });

    async function generateDirect(query, model, numResponses, temperature) {
      directResponsesContainer.innerHTML = '';
      
      // Make multiple direct calls
      const responses = [];
      for (let i = 0; i < numResponses; i++) {
        const responseDiv = document.createElement('div');
        responseDiv.className = 'response-item';
        responseDiv.innerHTML = `
          <div class="response-header">
            <span class="response-number">Response ${i + 1}</span>
          </div>
          <div class="response-content"><div class="loading-spinner"></div> Generating...</div>
        `;
        directResponsesContainer.appendChild(responseDiv);

        try {
          const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: [{ role: 'user', content: query }],
              model: model,
              temperature: temperature,
              max_tokens: 512,
              stream: false
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

    async function generateVerbalized(query, model, numResponses, temperature) {
      verbalizedResponsesContainer.innerHTML = '<div class="empty-state"><div class="loading-spinner" style="width: 40px; height: 40px; border-width: 4px;"></div><p>Streaming verbalized sampling...</p></div>';

      try {
        const response = await fetch(`/api/verbalized-sampling/stream?model=${model}&num_responses=${numResponses}&temperature=${temperature}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: query })
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
                    verbalizedResponsesContainer.innerHTML = '';
                    isFirstChunk = false;
                  }
                } else if (event.event === 'chunk') {
                  fullResponse += event.content;
                  // Update display with streaming content
                  verbalizedResponsesContainer.innerHTML = `<div class="response-item"><div class="response-content">${fullResponse}</div></div>`;
                } else if (event.event === 'complete') {
                  // Parse and display structured responses
                  verbalizedResponsesContainer.innerHTML = '';
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
                    verbalizedResponsesContainer.appendChild(responseDiv);
                  });

                  // Show diversity score
                  diversityScoreContainer.style.display = 'block';
                  diversityScoreContainer.querySelector('.diversity-score-value').textContent = event.diversity_score.toFixed(2);
                } else if (event.event === 'error') {
                  verbalizedResponsesContainer.innerHTML = `<div class="empty-state"><p style="color: var(--direct-color);">Error: ${event.error}</p></div>`;
                }
              } catch (e) {
                console.error('Error parsing event:', e);
              }
            }
          }
        }
      } catch (error) {
        verbalizedResponsesContainer.innerHTML = `<div class="empty-state"><p style="color: var(--direct-color);">Error: ${error.message}</p></div>`;
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
