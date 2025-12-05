"""
Voice Engine - Multi-Speaker Audio Generation

Orchestrates the creation of audio content:
1. Generates a multi-speaker script from a topic using an LLM.
2. Sends the script to the VibeVoice inference server for audio synthesis.
"""

import json
import logging
import os
import re
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
        if not speakers or len(speakers) < 2:
            speakers = ["Alice", "Bob"]
        
        speakers_str = ", ".join(speakers)
        
        system_prompt = f"""You are a professional scriptwriter for audio content.
Your task is to write a lively, engaging {style} script about the TOPIC: "{topic}".

Participants: {speakers_str}.

CRITICAL RULES:
1. Write ONLY the dialogue. Do not write a Title, Character List, or Scene Setting.
2. You MUST use the EXACT participant names provided: {speakers_str}. Do not use abbreviations like "I" or "E".
3. Format: "Name: [Line of text]"
4. Keep turns relatively short and conversational.
5. Do not add sound effects, stage directions, or parentheticals like (laughs) or (nods).
6. Ensure the tone fits the requested style ({style}).
7. Start immediately with the first line of dialogue.
"""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Generate a script for: {topic}"}
        ]

        payload = {
            "messages": messages,
            "max_tokens": 768,  # shorter scripts keep TTS jobs under Cloudflare's timeout
            "temperature": 0.7, # Slightly lower temp for better instruction following
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

    def _clean_and_truncate_script(self, script: str, speakers: List[str], max_lines: int = 40, max_chars: int = 4000) -> str:
        """
        Cleans up the script to ensure it matches VibeVoice's expected format
        and fits within timeout limits.
        """
        cleaned_lines = []
        
        # Regex to identify valid dialogue lines: "Name: Text"
        # We construct a regex that matches the provided speakers, allowing for optional markdown (**Name**: or *Name*:)
        speaker_pattern = "|".join([re.escape(s) for s in speakers])
        # Match start of line, optional markdown chars, speaker name, optional markdown chars, colon, then text
        dialogue_regex = re.compile(f"^[*_]*({speaker_pattern})[*_]*:\s*(.*)", re.IGNORECASE)

        lines = script.strip().splitlines()
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
                
            # Remove stage directions in parentheses e.g. (laughs)
            line = re.sub(r'\([^)]*\)', '', line).strip()
            if not line:
                continue

            # Check if it's a valid dialogue line
            match = dialogue_regex.match(line)
            if match:
                cleaned_lines.append(line)
            else:
                # If it's not a strict match, check if it looks like dialogue but with wrong name
                # or just loose text.
                # For now, we skip non-dialogue lines (Title, Scene, etc) to avoid TTS errors
                # unless it's very clearly dialogue.
                if ":" in line:
                    # Might be a speaker we missed or slight typo, keep it safely
                    cleaned_lines.append(line)
                else:
                    logger.info(f"Skipping non-dialogue line: {line}")

        # Truncate
        truncated = cleaned_lines[:max_lines]
        result = "\n".join(truncated)

        if len(cleaned_lines) > max_lines:
            # Add a closing line if truncated
            last_speaker = speakers[0] if len(cleaned_lines) % 2 == 0 else speakers[1]
            result += f"\n{last_speaker}: We'll have to pause here for now."

        return result

    async def synthesize_audio(self, script: str, speakers: List[str]) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Sends the script to the VibeVoice server.
        """
        yield {"type": "audio_start"}

        # Clean and prepare script
        prepared_script = self._clean_and_truncate_script(script, speakers)
        
        if not prepared_script:
            yield {"type": "error", "error": "Script is empty after cleaning. Please regenerate with proper format."}
            return

        payload = {
            "text": prepared_script,
            "speakers": speakers,
            "format": "wav"
        }

        # Allow deployments to tune synthesis timeout without redeploying.
        max_synthesis_seconds = int(os.getenv("VOICE_TTS_TIMEOUT", "300"))

        try:
            response = await self.client.post(
                f"{self.tts_endpoint}/v1/audio/speech", 
                json=payload, 
                timeout=max_synthesis_seconds
            )

            if response.status_code != 200:
                try:
                    error_data = response.json()
                    detail = error_data.get("detail", response.text)
                except:
                    detail = response.text
                raise Exception(f"TTS Error {response.status_code}: {detail}")

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
            error_msg = "VibeVoice timed out. The script might be too long for the server to process."
            logger.error(error_msg)
            yield {"type": "error", "error": error_msg}
        except Exception as e:
            logger.error(f"Audio synthesis failed: {e}")
            yield {"type": "error", "error": str(e)}