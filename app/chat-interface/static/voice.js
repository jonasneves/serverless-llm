document.addEventListener('DOMContentLoaded', async () => {
    const modelSelect = document.getElementById('modelSelect');
    const audioModelSelect = document.getElementById('audioModelSelect');
    const topicInput = document.getElementById('topicInput');
    const styleSelect = document.getElementById('styleSelect');
    const speaker1Input = document.getElementById('speaker1Input');
    const speaker2Input = document.getElementById('speaker2Input');
    const generateScriptBtn = document.getElementById('generateScriptBtn');
    const loadExampleBtn = document.getElementById('loadExampleBtn');
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

    async function readSSEStream(reader, onEvent) {
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                // Flush any trailing event in buffer
                if (buffer.trim()) {
                    processBufferChunk(buffer, onEvent);
                }
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            buffer = processBufferChunk(buffer, onEvent);
        }
    }

    function processBufferChunk(buffer, onEvent) {
        const events = buffer.split('\n\n');
        buffer = events.pop(); // Remainder (possibly incomplete event)

        for (const eventBlock of events) {
            const lines = eventBlock.split('\n');
            let dataPayload = '';

            for (const line of lines) {
                if (!line.startsWith('data: ')) {
                    continue;
                }

                // Remove the "data: " prefix but keep multi-line payloads intact.
                // Trim only the CRLF remnants; the payload itself may include leading spaces.
                const linePayload = line.slice(6).replace(/\r?$/, '');
                dataPayload += linePayload;
            }

            if (!dataPayload.trim()) {
                continue;
            }

            try {
                const parsed = JSON.parse(dataPayload);
                onEvent(parsed);
            } catch (err) {
                console.error('Failed to parse SSE payload', dataPayload, err);
            }
        }

        return buffer;
    }

    // Load Example Template
    loadExampleBtn.addEventListener('click', () => {
        // Set inputs to match the example
        speaker1Input.value = "Alice";
        speaker2Input.value = "Bob";
        topicInput.value = "Quick greeting";
        
        const exampleScript = `Alice: Hey Bob, have you seen the new voice studio update?
Bob: Yes Alice, it's pretty incredible. The latency is almost zero!
Alice: I know right? And the quality is surprisingly good for a serverless setup.
Bob: Absolutely. I can't wait to see what people build with it.`;
        
        scriptDisplay.innerText = exampleScript;
        generateAudioBtn.disabled = false;
        setLoading(false, "Example Loaded");
    });

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

        setLoading(true, `Writing Script...`);
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

            await readSSEStream(reader, (data) => {
                if (data.event === 'script_chunk') {
                    currentScript += data.content;
                    scriptDisplay.innerText = currentScript;
                    scriptDisplay.scrollTop = scriptDisplay.scrollHeight;
                } else if (data.event === 'script_complete') {
                    setLoading(false, "Script Ready");
                    generateAudioBtn.disabled = false;
                } else if (data.event === 'error') {
                    console.error(data.error);
                    setLoading(false, "Error");
                    scriptDisplay.innerText += `\n\n[Error: ${data.error}]`;
                }
            });
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
                    speakers: [speaker1Input.value, speaker2Input.value],
                    model: audioModelSelect.value
                })
            });

            const reader = response.body.getReader();

            await readSSEStream(reader, (data) => {
                if (data.event === 'audio_complete') {
                    if (data.url) {
                        audioPlayer.src = data.url;
                        downloadLink.href = data.url;
                        downloadLink.download = "podcast.wav";
                    } else if (data.data) {
                        const audioBlob = base64ToBlob(data.data, 'audio/wav');
                        const audioUrl = URL.createObjectURL(audioBlob);
                        audioPlayer.src = audioUrl;
                        downloadLink.href = audioUrl;
                        downloadLink.download = "podcast.wav";
                    }

                    audioPlayerContainer.classList.add('visible');
                    // Auto-play when ready
                    audioPlayer.play().catch(e => console.log("Auto-play prevented:", e));
                    setLoading(false, "Audio Ready");
                } else if (data.event === 'error') {
                    setLoading(false, "Error");
                    alert("Audio generation failed: " + data.error);
                }
            });

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
            generateAudioBtn.disabled = true;
        } else {
            statusBadge.textContent = text;
            generateScriptBtn.disabled = false;
            // Only enable audio gen if script is not empty
            if (scriptDisplay.innerText.trim().length > 0) {
                generateAudioBtn.disabled = false;
            }
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