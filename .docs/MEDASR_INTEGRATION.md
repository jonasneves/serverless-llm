# MedASR Integration Plan

> **Status**: Planned  
> **Created**: 2025-12-20  
> **Model**: [google/medasr](https://huggingface.co/google/medasr)

## Overview

MedASR is Google's Medical Automated Speech Recognition model based on the Conformer architecture. It's designed for medical dictation tasks including radiology dictation and physician-patient conversation transcription.

## Model Specifications

| Spec | Value |
|------|-------|
| **Parameters** | 105M |
| **Architecture** | Conformer (LAST: Lattice-Based Speech Modelling) |
| **Input** | Mono-channel audio, 16kHz, int16 waveform |
| **Output** | Text transcription |
| **License** | Health AI Developer Foundations terms of use |
| **Access** | Gated model (requires HuggingFace approval) |

## Performance Benchmarks

| Dataset | MedASR (greedy) | MedASR + 6-gram LM | Whisper v3 Large |
|---------|-----------------|---------------------|------------------|
| RAD-DICT (radiology) | 6.6% WER | 4.6% WER | 25.3% WER |
| GENERAL-DICT (internal medicine) | 9.3% WER | 6.9% WER | 33.1% WER |
| FM-DICT (family medicine) | 8.1% WER | 5.8% WER | 32.5% WER |
| Eye Gaze (MIMIC) | 6.6% WER | 5.2% WER | 12.5% WER |

## Compatibility Assessment

### ✅ Compatible

| Factor | Details |
|--------|---------|
| **Memory** | ~3-4GB total (model ~1GB + PyTorch ~2GB + audio buffer) fits in 16GB |
| **Model Size** | 105M parameters - small enough for CPU inference |

### ⚠️ Requires Changes

| Challenge | Details |
|-----------|---------|
| **Not GGUF** | Current platform uses llama-cpp-python with GGUF models. MedASR uses HuggingFace Transformers with Safetensors. |
| **Different Runtime** | Requires `transformers >= 5.0.0` (install from GitHub: `git+https://github.com/huggingface/transformers.git@65dc261512cbdb1ee72b88ae5b222f2605aad8e5`) |
| **Different Modality** | Audio-to-text ASR vs text-to-text LLM |
| **New Dependencies** | `librosa`, `torch`, `soundfile` for audio processing |
| **New API Pattern** | Needs `/v1/audio/transcriptions` endpoint instead of `/v1/chat/completions` |

## Implementation Plan

### 1. Create New Inference Service

```
app/
├── medasr-inference/
│   ├── inference_server.py    # FastAPI server using HF Transformers
│   └── requirements.txt       # transformers, librosa, torch, etc.
```

### 2. Requirements

```txt
# app/medasr-inference/requirements.txt
fastapi>=0.100.0
uvicorn[standard]>=0.22.0
python-multipart  # For file uploads
librosa>=0.10.0
soundfile>=0.12.0
torch>=2.0.0
# Install transformers from GitHub for MedASR support
git+https://github.com/huggingface/transformers.git@65dc261512cbdb1ee72b88ae5b222f2605aad8e5
huggingface_hub
```

### 3. Inference Server (Prototype)

```python
# app/medasr-inference/inference_server.py
from fastapi import FastAPI, UploadFile, File, HTTPException
from transformers import pipeline, AutoModelForCTC, AutoProcessor
import tempfile
import os
import librosa

app = FastAPI(title="MedASR Inference Server")

# Load model on startup
MODEL_ID = "google/medasr"
pipe = None

@app.on_event("startup")
async def load_model():
    global pipe
    pipe = pipeline("automatic-speech-recognition", model=MODEL_ID)
    print(f"MedASR model loaded successfully")

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "model": MODEL_ID,
        "type": "automatic-speech-recognition"
    }

@app.post("/v1/audio/transcriptions")
async def transcribe(
    file: UploadFile = File(...),
    chunk_length_s: int = 20,
    stride_length_s: int = 2
):
    """
    Transcribe audio file using MedASR.
    
    - Accepts: WAV, MP3, FLAC, etc.
    - Returns: Transcribed text
    """
    if pipe is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    # Save uploaded file temporarily
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name
    
    try:
        # Transcribe
        result = pipe(
            tmp_path,
            chunk_length_s=chunk_length_s,
            stride_length_s=stride_length_s
        )
        return {"text": result["text"]}
    finally:
        os.unlink(tmp_path)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8400)
```

### 4. GitHub Actions Workflow

Create `.github/workflows/medasr.yaml`:

```yaml
name: MedASR

on:
  workflow_dispatch:
  repository_dispatch:
    types: [restart-medasr]

jobs:
  inference:
    runs-on: ubuntu-latest  # Or ARM64 runner
    timeout-minutes: 330
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      
      - name: Install dependencies
        run: |
          pip install -r app/medasr-inference/requirements.txt
      
      - name: Login to HuggingFace
        run: |
          huggingface-cli login --token ${{ secrets.HF_TOKEN }}
      
      - name: Start inference server
        run: |
          cd app/medasr-inference
          python inference_server.py &
          sleep 30  # Wait for model to load
      
      # Add Cloudflare tunnel setup here
```

### 5. Port Assignment

Add to `config/models.py`:

```python
# ASR Models (84XX range - new category)
"medasr": 8400,
```

### 6. Config Update

Add to `config/inference.yaml`:

```yaml
medasr:
  # ASR model - different from LLM models
  # Uses HuggingFace Transformers, not llama.cpp
  chunk_length_s: 20
  stride_length_s: 2
```

## Resource Estimates

| Resource | Estimate |
|----------|----------|
| **Memory (runtime)** | ~3-4GB |
| **Model download** | ~500MB-1GB |
| **Disk cache** | ~1GB |
| **CPU inference speed** | Moderate (Conformer is efficient) |

## Limitations

1. **English only** - Trained on English medical audio
2. **Speaker diversity** - Best performance on US English speakers
3. **Audio quality** - Trained on high-quality microphone input
4. **Specialized terms** - May miss recent medications/procedures (last 10 years)
5. **Dates** - Trained on de-identified data, date format handling may vary

## References

- [Model Card](https://huggingface.co/google/medasr)
- [Quick Start Notebook](https://github.com/Google-Health/medasr)
- [Fine-tuning Notebook](https://github.com/Google-Health/medasr)
- [LAST Paper (arXiv:2005.08100)](https://arxiv.org/abs/2005.08100)

## Next Steps

1. [ ] Request access to gated model on HuggingFace
2. [ ] Create `app/medasr-inference/` directory
3. [ ] Add requirements.txt with dependencies
4. [ ] Implement inference_server.py
5. [ ] Create GitHub Actions workflow
6. [ ] Set up Cloudflare tunnel for `medasr.neevs.io`
7. [ ] Test audio transcription endpoint
8. [ ] Add to chat interface (optional - new ASR panel?)
