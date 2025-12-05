"Alice: Hello there!\nBob: Hi, how are you?"

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
                    # Handle unknown speakers by defaulting to first speaker or logging
                    # Fallback: assume it's continuation of previous or just ignore speaker
                    # For robustness, we'll map unknown speakers to Speaker 1 if we can't find them
                    logger.warning(f"Unknown speaker '{speaker_name}' mapped to Speaker 1")
                    formatted_lines.append(f"Speaker 1: {text.strip()}")
            else:
                # Line without speaker label - arguably continuation
                formatted_lines.append(line)

        formatted_text = '\n'.join(formatted_lines)
        logger.info(f"Formatted script:\n{formatted_text[:200]}...")

        # Validate that we have speaker-labeled lines
        speaker_lines = [line for line in formatted_lines if line.strip() and line.strip().startswith('Speaker ') and ':' in line]
        if not speaker_lines:
            error_msg = f"No valid speaker lines found in script. Original text: {request.text[:100]}... Speakers: {request.speakers}"
            logger.error(error_msg)
            raise HTTPException(status_code=400, detail="No valid speaker lines found in script")

        # Prepare voice samples for each speaker in order
        voice_samples = []
        missing_speakers = []

        for speaker in request.speakers:
            if speaker in default_voices:
                voice_samples.append(default_voices[speaker])
                logger.info(f"Loaded voice sample for: {speaker}")
            else:
                # Fallback to a random available voice if named voice not found
                if default_voices:
                    fallback = list(default_voices.values())[0]
                    voice_samples.append(fallback)
                    logger.warning(f"Voice '{speaker}' not found, using fallback")
                else:
                    missing_speakers.append(speaker)

        if missing_speakers and not voice_samples:
             logger.warning(f"Speakers not found and no fallbacks: {missing_speakers}")
             # Proceed without voice cloning (zero-shot)

        # Prepare inputs
        logger.info(f"Processing with {len(voice_samples)} voice samples")

        # Only pass voice_samples if we have them
        processor_kwargs = {
            "text": [formatted_text],
            "padding": True,
            "return_tensors": "pt",
            "return_attention_mask": True,
        }

        if voice_samples:
            processor_kwargs["voice_samples"] = [voice_samples]

        try:
            inputs = processor(**processor_kwargs)
        except Exception as e:
            logger.error(f"Processor failed: {e}")
            raise HTTPException(status_code=500, detail=f"Text processing failed: {str(e)}")

        # Move tensors to device
        for k, v in inputs.items():
            if v is not None and torch.is_tensor(v):
                inputs[k] = v.to(device)
            elif v is None:
                logger.warning(f"Input '{k}' is None, skipping device transfer")

        # Generate audio
        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=None,
                cfg_scale=1.5,
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
