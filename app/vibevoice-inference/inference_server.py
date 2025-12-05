import os
import time
import copy
import torch
import uvicorn
import logging
import shutil
import tempfile
import contextlib
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
from urllib.request import urlretrieve
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import VibeVoice modules
try:
    from vibevoice.modular.modeling_vibevoice_streaming_inference import (
        VibeVoiceStreamingForConditionalGenerationInference,
    )
    from vibevoice.processor.vibevoice_streaming_processor import (
        VibeVoiceStreamingProcessor,
    )
except ImportError as e:
    logger.error(f"Failed to import VibeVoice modules: {e}")
    raise

app = FastAPI(title="VibeVoice Inference Server")

# Global variables
MODEL = None
PROCESSOR = None
VOICE_MAPPER = None
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
MODEL_PATH = "microsoft/VibeVoice-Realtime-0.5B"

class VoiceMapper:
    """Maps speaker names to voice file paths"""

    def __init__(self, voices_dir: str = "voices"):
        self.voices_dir = voices_dir
        os.makedirs(self.voices_dir, exist_ok=True)
        self.voice_presets = {}
        self.available_voices = {}
        self.setup_voice_presets()

    def setup_voice_presets(self):
        """Setup voice presets by scanning the voices directory and downloading default if empty."""
        self._scan_voices()
        
        if not self.available_voices:
            logger.info("No voices found. Downloading default voice 'en-Mike_man'...")
            self._download_default_voice()
            self._scan_voices()

        logger.info(f"Found {len(self.available_voices)} voice files in {self.voices_dir}")
        logger.info(f"Available voices: {', '.join(self.available_voices.keys())}")

    def _scan_voices(self):
        self.voice_presets = {}
        # Get all .pt files in the voices directory
        pt_files = [
            f
            for f in os.listdir(self.voices_dir)
            if f.lower().endswith(".pt") and os.path.isfile(os.path.join(self.voices_dir, f))
        ]

        # Create dictionary with filename (without extension) as key
        for pt_file in pt_files:
            name = os.path.splitext(pt_file)[0]
            full_path = os.path.join(self.voices_dir, pt_file)
            self.voice_presets[name] = full_path

        # Normalization logic from reference
        new_dict = {}
        for name, path in self.voice_presets.items():
            if "_" in name:
                clean_name = name.split("_")[0]
            elif "-" in name:
                clean_name = name.split("-")[-1]
            else:
                clean_name = name
            new_dict[clean_name] = path
        self.voice_presets.update(new_dict)
        
        self.available_voices = {
            name: path for name, path in self.voice_presets.items() if os.path.exists(path)
        }

    def _download_default_voice(self):
        # URL for en-Mike_man.pt from Microsoft's repo
        url = "https://github.com/microsoft/VibeVoice/raw/main/demo/voices/streaming_model/en-Mike_man.pt"
        target_path = os.path.join(self.voices_dir, "en-Mike_man.pt")
        try:
            logger.info(f"Downloading {url} to {target_path}")
            urlretrieve(url, target_path)
            logger.info("Download complete.")
        except Exception as e:
            logger.error(f"Failed to download default voice: {e}")

    def get_voice_path(self, speaker_name: Optional[str]) -> str:
        """Get voice file path for a given speaker name"""
        if not self.available_voices:
            raise HTTPException(status_code=500, detail="No voices available on server.")

        if not speaker_name:
             return list(self.available_voices.values())[0]

        # First try exact match
        if speaker_name in self.voice_presets:
            return self.voice_presets[speaker_name]

        # Try partial matching (case insensitive)
        speaker_lower = speaker_name.lower()
        for preset_name, path in self.voice_presets.items():
            if preset_name.lower() in speaker_lower or speaker_lower in preset_name.lower():
                return path

        # Default to first voice
        default_voice = list(self.available_voices.values())[0]
        logger.warning(f"Voice '{speaker_name}' not found, using default: {default_voice}")
        return default_voice

@app.on_event("startup")
async def startup_event():
    global MODEL, PROCESSOR, VOICE_MAPPER
    
    logger.info(f"Loading VibeVoice-Realtime model on {DEVICE}...")
    
    # Use float32 for CPU to avoid potential half-precision issues
    torch_dtype = torch.float16 if DEVICE == "cuda" else torch.float32
    
    try:
        PROCESSOR = VibeVoiceStreamingProcessor.from_pretrained(MODEL_PATH)
        
        MODEL = VibeVoiceStreamingForConditionalGenerationInference.from_pretrained(
            MODEL_PATH,
            torch_dtype=torch_dtype,
            device_map=DEVICE,
            attn_implementation="sdpa",
        )
        MODEL.eval()
        MODEL.set_ddpm_inference_steps(num_steps=5)
        
        VOICE_MAPPER = VoiceMapper()
        logger.info("Model and VoiceMapper initialized successfully!")
        
    except Exception as e:
        logger.critical(f"Failed to initialize model: {e}")
        raise

@app.get("/health")
async def health_check():
    if MODEL is None or PROCESSOR is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    return {"status": "healthy", "device": DEVICE, "voices": list(VOICE_MAPPER.available_voices.keys())}

class GenerateRequest(BaseModel):
    text: str
    speaker_name: Optional[str] = None
    cfg_scale: float = 1.5

def cleanup_file(path: str):
    try:
        os.remove(path)
        logger.info(f"Deleted temporary file: {path}")
    except Exception as e:
        logger.error(f"Error deleting file {path}: {e}")

@app.post("/generate")
async def generate(request: GenerateRequest, background_tasks: BackgroundTasks):
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    try:
        logger.info(f"Generating speech for: '{request.text[:20]}...' with speaker '{request.speaker_name}'")
        
        # Clean text
        full_script = request.text.strip().replace("'", "'").replace('"', '"').replace('"', '"')
        
        # Get voice sample
        voice_path = VOICE_MAPPER.get_voice_path(request.speaker_name)
        
        # Load voice sample
        # Note: weights_only=False is required for this model's cached prompts
        all_prefilled_outputs = torch.load(
            voice_path, map_location=DEVICE, weights_only=False
        )

        # Prepare inputs
        inputs = PROCESSOR.process_input_with_cached_prompt(
            text=full_script,
            cached_prompt=all_prefilled_outputs,
            padding=True,
            return_tensors="pt",
            return_attention_mask=True,
        )

        # Move inputs to device
        for k, v in inputs.items():
            if torch.is_tensor(v):
                inputs[k] = v.to(DEVICE)

        # Generate audio
        start_time = time.time()
        
        # Use autocast only for CUDA
        cm = torch.autocast(device_type="cuda", dtype=torch.float16) if DEVICE == "cuda" else contextlib.nullcontext()
        
        with cm:
            outputs = MODEL.generate(
                **inputs,
                max_new_tokens=None,
                cfg_scale=request.cfg_scale,
                tokenizer=PROCESSOR.tokenizer,
                generation_config={"do_sample": False},
                verbose=False,
                all_prefilled_outputs=copy.deepcopy(all_prefilled_outputs)
                if all_prefilled_outputs is not None
                else None,
            )
        generation_time = time.time() - start_time
        logger.info(f"Generation took {generation_time:.2f}s")

        if outputs.speech_outputs and outputs.speech_outputs[0] is not None:
            # Create temp file for output
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
            temp_path = temp_file.name
            temp_file.close()
            
            PROCESSOR.save_audio(
                outputs.speech_outputs[0].cpu(),
                output_path=temp_path,
            )
            
            # Schedule cleanup
            background_tasks.add_task(cleanup_file, temp_path)
            
            return FileResponse(
                temp_path, 
                media_type="audio/wav", 
                filename="generated.wav",
                headers={"X-Generation-Time": str(generation_time)}
            )
        else:
            raise HTTPException(status_code=500, detail="No audio output generated")

    except Exception as e:
        logger.error(f"Generation error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)