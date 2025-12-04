"""
VibeVoice Inference Server
FastAPI-based REST API for VibeVoice Text-to-Speech model
"""

import os
import uvicorn
import base64
import io
import torch
import scipy.io.wavfile
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import logging
from transformers import VibeVoiceForConditionalGenerationInference, VibeVoiceProcessor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="VibeVoice Inference Server",
    description="Inference server for VibeVoice Text-to-Speech model",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Model Configuration
MODEL_ID = "microsoft/VibeVoice-1.5B"
device = "cuda" if torch.cuda.is_available() else "cpu"
logger.info(f"Running on device: {device}")

# Global model variables
processor = None
model = None

class SpeechRequest(BaseModel):
    text: str
    speakers: List[str]
    format: str = "mp3" # 'mp3' or 'wav'

@app.on_event("startup")
async def load_model():
    global processor, model
    logger.info(f"Loading model: {MODEL_ID}...")
    try:
        dtype = torch.bfloat16 if torch.cuda.is_available() and torch.cuda.is_bf16_supported() else torch.float32
        model = VibeVoiceForConditionalGenerationInference.from_pretrained(
            MODEL_ID,
            torch_dtype=dtype,
            device_map=device
        )
        processor = VibeVoiceProcessor.from_pretrained(MODEL_ID)
        logger.info("Model loaded successfully.")
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        raise RuntimeError(f"Could not load model {MODEL_ID}: {e}")

@app.get("/health")
async def health():
    """Health check endpoint."""
    if model is None or processor is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    return {"status": "healthy", "service": "VibeVoice Inference", "device": device}

@app.post("/v1/audio/speech")
async def generate_speech(request: SpeechRequest):
    """
    Generates speech from text using VibeVoice.
    """
    if model is None or processor is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    logger.info(f"Generating speech for: '{request.text[:50]}...' with speakers: {request.speakers}")

    try:
        # Prepare inputs using the processor
        # VibeVoice expects text and speaker information
        inputs = processor(
            text=request.text,
            speaker_names=request.speakers,
            return_tensors="pt"
        ).to(device)

        # Generate audio using the model
        with torch.no_grad():
            audio_output = model.generate(**inputs)

        # Extract audio waveform
        # The output should contain the audio array
        if hasattr(audio_output, "waveform"):
            audio_data = audio_output.waveform.cpu().numpy()
        elif hasattr(audio_output, "audio_values"):
            audio_data = audio_output.audio_values.cpu().numpy()
        elif isinstance(audio_output, torch.Tensor):
            audio_data = audio_output.cpu().numpy()
        else:
            # Fallback to first element
            audio_data = audio_output[0].cpu().numpy()

        # Ensure audio_data is in the right format
        if audio_data.ndim > 1:
            # If stereo or batch, take first channel/batch
            audio_data = audio_data[0] if audio_data.shape[0] == 1 else audio_data.squeeze()

        # VibeVoice uses 24kHz sample rate
        sample_rate = 24000

        # Convert to int16 for WAV format
        audio_data = np.clip(audio_data, -1.0, 1.0)
        audio_data = (audio_data * 32767).astype(np.int16)

        # Write to buffer
        byte_io = io.BytesIO()
        scipy.io.wavfile.write(byte_io, sample_rate, audio_data)
        wav_bytes = byte_io.getvalue()

        # Encode to base64
        audio_base64 = base64.b64encode(wav_bytes).decode("utf-8")

        return {
            "status": "success",
            "format": "wav",
            "data": audio_base64,
            "sample_rate": sample_rate,
            "message": "Audio generated successfully"
        }

    except Exception as e:
        logger.error(f"Generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)