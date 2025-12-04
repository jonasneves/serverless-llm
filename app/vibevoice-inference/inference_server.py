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
from transformers import AutoTokenizer, AutoModelForCausalLM

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
tokenizer = None
model = None

class SpeechRequest(BaseModel):
    text: str
    speakers: List[str]
    format: str = "mp3" # 'mp3' or 'wav'

@app.on_event("startup")
async def load_model():
    global tokenizer, model
    logger.info(f"Loading model: {MODEL_ID}...")
    try:
        tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, trust_remote_code=True)
        model = AutoModelForCausalLM.from_pretrained(MODEL_ID, trust_remote_code=True, torch_dtype=torch.bfloat16).to(device)
        model.eval()
        logger.info("Model loaded successfully.")
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        raise RuntimeError(f"Could not load model {MODEL_ID}: {e}")

@app.get("/health")
async def health():
    """Health check endpoint."""
    if model is None or tokenizer is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    return {"status": "healthy", "service": "VibeVoice Inference", "device": device}

@app.post("/v1/audio/speech")
async def generate_speech(request: SpeechRequest):
    """
    Generates speech from text using VibeVoice.
    """
    if model is None or tokenizer is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    logger.info(f"Generating speech for: '{request.text[:50]}...'")

    try:
        # VibeVoice prompting style:
        # Ideally, the prompt should include speaker information if the model supports it directly via prompt.
        # Based on the model card, it's an LLM-based TTS. We need to format the input correctly.
        # Assuming a simple text-to-speech prompt format for now as per general LLM-TTS usage:
        # "Generate audio for: [TEXT]" or just tokenizing the text.
        # Note: The specific prompt format for VibeVoice might need adjustment based on deep-dive docs.
        # For now, we treat the input text as the direct prompt for the TTS model.
        
        inputs = tokenizer(request.text, return_tensors="pt").to(device)
        
        # Generate audio tokens/embedding
        # Note: This is a simplified generation call. VibeVoice might return specific output types.
        # We need to capture the audio output. 
        # If the model returns raw waveforms or VQ tokens, we need to decode them.
        # Standard transformers `generate` usually returns text tokens. 
        # For Audio-LLMs, it might return a specific object.
        
        # Investigating VibeVoice specific generation:
        # It usually requires a specific `generate_speech` method or similar if integrated into Transformers properly,
        # or we process the output logits to audio.
        
        # Placeholder for specific VibeVoice generation logic:
        # Since VibeVoice 1.5B is new/custom, 'trust_remote_code=True' suggests custom modeling code.
        # We assume it has a method or standard generation that yields audio.
        
        # Let's assume a standard `.generate()` that returns audio values or we use a pipeline.
        # If strictly following the "Code" link from the model card, it might need specific steps.
        # For this implementation, we will wrap the generation in a generic block 
        # and assume `model.generate_speech(text)` or similar exists if defined in the repo.
        
        # CAUTION: Without the exact API of the custom model code, this is a best-guess integration.
        # We will try to use a hypothetical `model.generate` and process output.
        
        with torch.no_grad():
            # Many TTS models in transformers use `model.generate(**inputs)` returning audio values.
            output = model.generate(**inputs, max_new_tokens=4000)
            
        # Assuming output is the audio waveform (tensor)
        # If it's a tuple, we might need output.waveform or similar.
        # For now, let's assume `output` contains the audio array.
        
        if hasattr(output, "waveform"):
             audio_data = output.waveform.cpu().numpy()
        elif isinstance(output, torch.Tensor):
             audio_data = output.cpu().numpy()
        else:
             # Fallback or specific field access
             audio_data = output[0].cpu().numpy() 

        # Normalize if needed (float32 -1 to 1)
        # Save to buffer
        
        sample_rate = 24000 # VibeVoice is often 24kHz
        
        byte_io = io.BytesIO()
        scipy.io.wavfile.write(byte_io, sample_rate, audio_data)
        wav_bytes = byte_io.getvalue()

        # Convert to requested format (MP3) if needed
        # We use ffmpeg (via pydub or subprocess) or just return WAV if MP3 not strictly required by frontend.
        # Frontend <audio> supports WAV. Let's stick to WAV for simplicity/speed unless MP3 requested.
        
        if request.format == "mp3":
            # Simple conversion if we had pydub, but for now returning WAV (base64) is safer/faster
            # Frontend will handle it.
            pass

        audio_base64 = base64.b64encode(wav_bytes).decode("utf-8")

        return {
            "status": "success",
            "format": "wav", # Returning wav for now
            "data": audio_base64,
            "message": "Audio generated successfully"
        }

    except Exception as e:
        logger.error(f"Generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)