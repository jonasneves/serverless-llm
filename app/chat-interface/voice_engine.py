"""
Voice Engine - Multi-Speaker Audio Generation

Orchestrates the creation of audio content:
1. Generates a multi-speaker script from a topic using an LLM.
2. Sends the script to the VibeVoice inference server for audio synthesis.
"""

import json
import logging
import os
from typing import List, Dict, Any, Optional, AsyncGenerator
from dataclasses import dataclass
from datetime import datetime
import httpx

from http_client import HTTPClient

logger = logging.getLogger(__name__)

@dataclass
class ScriptLine:
    speaker: str
    text: str

@dataclass
class VoiceGenerationRequest:
    topic: str
    style: str = "podcast"  # podcast, interview, storytelling, debate
    duration_minutes: int = 2
    speakers: List[str] = None  # ["Host (Alice)", "Guest (Bob)"]

class VoiceEngine:
    """
    Manages the lifecycle of voice generation:
    Scripting (LLM) -> Audio (VibeVoice)
    """

    def __init__(self, llm_endpoint: str, tts_endpoint: str):
        self.llm_endpoint = llm_endpoint
        self.tts_endpoint = tts_endpoint
        self.client = HTTPClient.get_client()

    async def generate_script(
        self,
        topic: str,
        style: str = "podcast",
        speakers: List[str] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Generates a script using the configured LLM.
        Yields chunks of the generated script for real-time UI feedback.
        """
        if not speakers:
            speakers = ["Host", "Guest"]
        
        speakers_str = ", ".join(speakers)
        
        system_prompt = f"""You are a professional scriptwriter for audio content.
Your task is to write a lively, engaging {style} script about the TOPIC: "{topic}".

Participants: {speakers_str}.

Rules:
1. Write ONLY the dialogue.
2. Use the format: "Speaker Name: [Line of text]"
3. Keep turns relatively short and conversational.
4. Include natural fillers (hmm, well, exactly) where appropriate for realism.
5. Do not add sound effects or stage directions in brackets.
6. Ensure the tone fits the requested style ({style}).
"""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Generate a script for: {topic}"}
        ]

        payload = {
            "messages": messages,
            "max_tokens": 768,  # shorter scripts keep TTS jobs under Cloudflare's timeout
            "temperature": 0.8,
            "stream": True
        }

        full_script = ""
        
        try:
            async with self.client.stream("POST", f"{self.llm_endpoint}/v1/chat/completions", json=payload, timeout=60) as response:
                if response.status_code != 200:
                    error_text = await response.aread()
                    raise Exception(f"LLM Error: {error_text.decode()}")

                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    
                    data_str = line[6:]
                    if data_str.strip() == "[DONE]":
                        break
                        
                    try:
                        data = json.loads(data_str)
                        content = data["choices"][0]["delta"].get("content", "")
                        if content:
                            full_script += content
                            yield {"type": "script_chunk", "content": content}
                    except json.JSONDecodeError:
                        continue
                        
        except Exception as e:
            logger.error(f"Script generation failed: {e}")
            yield {"type": "error", "error": str(e)}
            return

        # Final yield with complete script
        yield {"type": "script_complete", "script": full_script}

    def _truncate_script(self, script: str, max_lines: int = 40, max_chars: int = 4000) -> str:
        """Limit script length so TTS jobs finish before tunnel timeouts."""
        lines = [line for line in script.strip().splitlines() if line.strip()]
        truncated = lines[:max_lines]
        result = "\n".join(truncated)

        if len(lines) > max_lines:
            result += "\n[...truncated for faster synthesis...]"

        if len(result) > max_chars:
            result = result[:max_chars] + "\n[...truncated for faster synthesis...]"

        return result or script

    async def synthesize_audio(self, script: str, speakers: List[str]) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Sends the script to the VibeVoice server.
        Since audio generation is slow, this might just yield progress or a final URL.
        """
        yield {"type": "audio_start"}

        # Parse script into structured format if needed by VibeVoice, 
        # or send raw text if VibeVoice handles parsing.
        # For now, we'll assume the VibeVoice endpoint expects raw text and handles speaker tagging.
        prepared_script = self._truncate_script(script)
        if prepared_script != script:
            logger.info(
                "Truncated script for TTS (lines: %d -> %d, chars: %d -> %d)",
                len([line for line in script.splitlines() if line.strip()]),
                len([line for line in prepared_script.splitlines() if line.strip()]),
                len(script),
                len(prepared_script),
            )

        payload = {
            "text": prepared_script,
            "speakers": speakers,
            "format": "wav"
        }

        # Allow deployments to tune synthesis timeout without redeploying.
        # Default to 240s so Cloudflare (or other proxies) have enough headroom.
        max_synthesis_seconds = int(os.getenv("VOICE_TTS_TIMEOUT", "240"))

        try:
            # Note: This is a placeholder URL structure until we build the vibe-inference server
            # We might want to stream the audio bytes back, or wait and return a URL.
            # For a "Serverless" feel, returning a URL to a stored file is often better for playback.
            
            # Option A: Stream bytes (better for immediate playback)
            # Option B: Generate and host (better for seeking/saving)
            
            # Let's assume we stream bytes for now to fit the "stream" paradigm, 
            # or we return a URL if the server saves it. 
            # Given VibeVoice is heavy, it might take a while.
            
            response = await self.client.post(
                f"{self.tts_endpoint}/v1/audio/speech", 
                json=payload, 
                timeout=max_synthesis_seconds
            )

            if response.status_code != 200:
                raise Exception(f"TTS Error {response.status_code}: {response.text}")

            # Assuming the response contains a URL or base64 audio
            data = response.json()
            audio_url = data.get("url")
            audio_base64 = data.get("data")
            
            if audio_url:
                 yield {"type": "audio_complete", "url": audio_url}
            elif audio_base64:
                 yield {"type": "audio_complete", "data": audio_base64}
            else:
                 raise Exception("No audio data received")

        except httpx.ReadTimeout:
            error_msg = "VibeVoice timed out (took longer than expected). Try a shorter script or retry."
            logger.error(error_msg)
            yield {"type": "error", "error": error_msg}
        except Exception as e:
            logger.error(f"Audio synthesis failed: {e}")
            yield {"type": "error", "error": str(e)}
