document.addEventListener('DOMContentLoaded', async () => {
    const modelSelect = document.getElementById('modelSelect');
    const topicInput = document.getElementById('topicInput');
    const styleSelect = document.getElementById('styleSelect');
    const speaker1Input = document.getElementById('speaker1Input');
    const speaker2Input = document.getElementById('speaker2Input');
    const generateScriptBtn = document.getElementById('generateScriptBtn');
    const scriptDisplay = document.getElementById('scriptDisplay');
    const generateAudioBtn = document.getElementById('generateAudioBtn');
    const statusBadge = document.getElementById('statusBadge');
    const audioPlayerContainer = document.getElementById('audioPlayerContainer');
    const audioPlayer = document.getElementById('audioPlayer');
    const downloadLink = document.getElementById('downloadLink');

    let currentScript = "";

    // Load available models
    try {
        const response = await fetch('/api/models');
        const data = await response.json();
        
        modelSelect.innerHTML = ''; // Clear loading message
        
        data.models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.name;
            if (model.default) {
                option.selected = true;
            }
            modelSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Failed to load models:', error);
        modelSelect.innerHTML = '<option disabled>Error loading models</option>';
    }

    generateScriptBtn.addEventListener('click', async () => {
        const topic = topicInput.value.trim();
        if (!topic) {
            alert("Please enter a topic");
            return;
        }
        
        const selectedModel = modelSelect.value;
        if (!selectedModel) {
            alert("Please select a Script Writer model");
            return;
        }

        setLoading(true, `Writing Script (${modelSelect.options[modelSelect.selectedIndex].text})...`);
        scriptDisplay.textContent = ""; // Clear previous
        currentScript = "";
        generateAudioBtn.disabled = true;

        try {
            const response = await fetch('/api/voice/script', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    topic: topic,
                    style: styleSelect.value,
                    speakers: [speaker1Input.value, speaker2Input.value],
                    model: selectedModel
                })
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n\n');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = JSON.parse(line.slice(6));
                        
                        if (data.event === 'script_chunk') {
                            currentScript += data.content;
                            scriptDisplay.innerText = currentScript;
                            // Auto scroll to bottom
                            scriptDisplay.scrollTop = scriptDisplay.scrollHeight;
                        } else if (data.event === 'script_complete') {
                            setLoading(false, "Script Ready");
                            generateAudioBtn.disabled = false;
                        } else if (data.event === 'error') {
                            console.error(data.error);
                            setLoading(false, "Error");
                            scriptDisplay.innerText += `\n[Error: ${data.error}]`;
                        }
                    }
                }
            }
        } catch (err) {
            console.error(err);
            setLoading(false, "Error");
        }
    });

    generateAudioBtn.addEventListener('click', async () => {
        const scriptContent = scriptDisplay.innerText; // Allow user edits
        if (!scriptContent) return;

        setLoading(true, "Synthesizing Audio...");
        audioPlayerContainer.classList.remove('visible');
        
        try {
            const response = await fetch('/api/voice/audio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    script: scriptContent,
                    speakers: [speaker1Input.value, speaker2Input.value]
                })
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n\n');

                for (const line of lines) {
                     if (line.startsWith('data: ')) {
                        const data = JSON.parse(line.slice(6));
                        
                        if (data.event === 'audio_complete') {
                            if (data.url) {
                                audioPlayer.src = data.url;
                                downloadLink.href = data.url;
                            } else if (data.data) {
                                const audioBlob = base64ToBlob(data.data, 'audio/mp3');
                                const audioUrl = URL.createObjectURL(audioBlob);
                                audioPlayer.src = audioUrl;
                                downloadLink.href = audioUrl;
                            }
                            
                            audioPlayerContainer.classList.add('visible');
                            setLoading(false, "Audio Ready");
                            
                        } else if (data.event === 'error') {
                             setLoading(false, "Error");
                             alert("Audio generation failed: " + data.error);
                        }
                     }
                }
            }

        } catch (err) {
            console.error(err);
            setLoading(false, "Error");
        }
    });

    function setLoading(isLoading, text) {
        statusBadge.style.display = 'inline-flex';
        if (isLoading) {
            statusBadge.innerHTML = `<span class="loading-wave"><span class="wave-bar"></span><span class="wave-bar"></span><span class="wave-bar"></span></span> ${text}`;
            generateScriptBtn.disabled = true;
        } else {
            statusBadge.textContent = text;
            generateScriptBtn.disabled = false;
        }
    }
    
    function base64ToBlob(base64, type) {
        const binStr = atob(base64);
        const len = binStr.length;
        const arr = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            arr[i] = binStr.charCodeAt(i);
        }
        return new Blob([arr], { type: type });
    }
});
