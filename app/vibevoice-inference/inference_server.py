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
import soundfile as sf
import librosa
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict
import logging
from vibevoice.modular.modeling_vibevoice_streaming_inference import VibeVoiceStreamingForConditionalGenerationInference
from vibevoice.processor.vibevoice_processor import VibeVoiceProcessor

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
default_voices: Dict[str, np.ndarray] = {}

class SpeechRequest(BaseModel):
    text: str
    speakers: List[str] = ["Alice"]  # List of speakers in order of appearance
    format: str = "wav"  # 'wav' only for now

def read_audio(audio_path: str, target_sr: int = 24000) -> np.ndarray:
    """Read and preprocess audio file for VibeVoice."""
    wav, sr = sf.read(audio_path)
    # Convert to mono if stereo
    if len(wav.shape) > 1:
        wav = np.mean(wav, axis=1)
    # Resample if needed
    if sr != target_sr:
        wav = librosa.resample(wav, orig_sr=sr, target_sr=target_sr)
    return wav

def load_default_voices():
    """Load default voice samples from the VibeVoice package."""
    global default_voices

    # Try to find voices directory in the vibevoice package
    import vibevoice
    vibevoice_path = Path(vibevoice.__file__).parent
    voices_dir = vibevoice_path / "demo" / "voices"

    if not voices_dir.exists():
        logger.warning(f"Default voices directory not found at {voices_dir}")
        logger.warning("Voice cloning will not be available. Using zero-shot mode.")
        return

    # Load all available voice files
    voice_files = list(voices_dir.glob("*.wav"))
    for voice_file in voice_files:
        # Extract speaker name (e.g., "en-Alice_woman" from "en-Alice_woman.wav")
        speaker_name = voice_file.stem.replace("en-", "").replace("in-", "").replace("zh-", "")
        # Also create a simplified name (e.g., "Alice" from "Alice_woman")
        simple_name = speaker_name.split("_")[0]

        try:
            audio_data = read_audio(str(voice_file))
            default_voices[speaker_name] = audio_data
            default_voices[simple_name] = audio_data
            logger.info(f"Loaded voice: {speaker_name} (alias: {simple_name})")
        except Exception as e:
            logger.error(f"Failed to load voice {voice_file}: {e}")

    logger.info(f"Loaded {len(set(default_voices.values()))} unique default voices")

@app.on_event("startup")
async def load_model():
    global processor, model
    logger.info(f"Loading model: {MODEL_ID}...")
    try:
        # Load processor
        processor = VibeVoiceProcessor.from_pretrained(MODEL_ID)

        # Device-specific configuration
        if device == "cuda":
            dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float32
        else:
            dtype = torch.float32

        # Use SDPA (PyTorch native) for better compatibility
        attn_impl = "sdpa"

        # Load model
        model = VibeVoiceStreamingForConditionalGenerationInference.from_pretrained(
            MODEL_ID,
            torch_dtype=dtype,
            device_map=device,
            attn_implementation=attn_impl
        )
        logger.info(f"Model loaded successfully on {device} with dtype {dtype}")

        # Load default voices
        load_default_voices()

    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        raise RuntimeError(f"Could not load model {MODEL_ID}: {e}")

@app.get("/health")
async def health():
    """Health check endpoint."""
    if model is None or processor is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    return {
        "status": "healthy",
        "service": "VibeVoice Inference",
        "device": device,
        "available_voices": list(set(default_voices.keys()))
    }

@app.post("/v1/audio/speech")
async def generate_speech(request: SpeechRequest):
    """
    Generates speech from text using VibeVoice.

    Text format: Multi-speaker format with speaker labels:
    "Alice: Hello there!\\nBob: Hi, how are you?"

    Speakers should match the order they appear in the text.
    """
    if model is None or processor is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    logger.info(f"Generating speech for: '{request.text[:50]}...' with speakers: {request.speakers}")

    try:
        # VibeVoice expects "Speaker N:" format, so transform named speakers
        # Create speaker mapping (e.g., Alice -> 1, Bob -> 2)
        speaker_mapping = {name: idx + 1 for idx, name in enumerate(request.speakers)}

        # Transform script from "Alice: text" to "Speaker 1: text"
        formatted_lines = []
        for line in request.text.split('\n'):
            line = line.strip()
            if not line:
                formatted_lines.append('')
                continue

            # Check if line has speaker label
            if ':' in line:
                speaker_name, text = line.split(':', 1)
                speaker_name = speaker_name.strip()

                # Map speaker name to number
                if speaker_name in speaker_mapping:
                    speaker_num = speaker_mapping[speaker_name]
                    formatted_lines.append(f"Speaker {speaker_num}: {text.strip()}")
                else:
                    # Unknown speaker, keep as-is
                    formatted_lines.append(line)
            else:
                formatted_lines.append(line)

        formatted_text = '\n'.join(formatted_lines)
        logger.info(f"Formatted script:\n{formatted_text[:200]}...")

        # Prepare voice samples for each speaker in order
        voice_samples = []
        missing_speakers = []

        for speaker in request.speakers:
            if speaker in default_voices:
                voice_samples.append(default_voices[speaker])
                logger.info(f"Loaded voice sample for: {speaker}")
            else:
                missing_speakers.append(speaker)

        if missing_speakers:
            logger.warning(f"Speakers not found: {missing_speakers}. Available: {list(set(default_voices.keys()))}")
            logger.warning("Generating without voice cloning for missing speakers (lower quality)")

        # Prepare inputs
        inputs = processor(
            text=[formatted_text],
            voice_samples=[voice_samples] if voice_samples else None,
            padding=True,
            return_tensors="pt",
            return_attention_mask=True,
        )

        # Move tensors to device
        for k, v in inputs.items():
            if torch.is_tensor(v):
                inputs[k] = v.to(device)

        # Generate audio
        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=None,
                cfg_scale=1.3,
                tokenizer=processor.tokenizer,
                generation_config={'do_sample': False},
                verbose=False,
                is_prefill=bool(voice_samples),
            )

        # Extract audio waveform
        audio_data = outputs.speech_outputs[0].cpu().numpy()

        # Ensure audio_data is 1D
        if audio_data.ndim > 1:
            audio_data = audio_data.squeeze()

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
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
