# LFM2.5 1.2B Thinking

Hybrid architecture from LiquidAI discovered via hardware-in-the-loop search. Per 16-block unit: 10 double-gated short convolution blocks (kernel size 3) + 6 Grouped Query Attention (GQA) blocks, with SwiGLU MLPs. Not SSM-based — LiquidAI evaluated and rejected SSM and linear attention variants in favor of short convolutions, which give better quality–latency–memory tradeoff on CPU. [Source: LFM2 technical report, arXiv:2511.23404](https://arxiv.org/abs/2511.23404)

## Inference notes

- Flash attention disabled (`flash_attn=False`): LiquidAI's design explicitly excludes Flash Attention — the architecture was optimized for CPU inference where short convolutions outperform it. Enabling `--flash-attn` in llama.cpp causes `llama_decode returned -1`.
- KV cache quantization disabled (`kv_cache_quant=False`): empirically causes `llama_decode returned -1` on this architecture.
- Runs via the native llama-server binary (llama-cpp-python bindings are incompatible with this architecture — the reason `flash_attn`/`kv_cache_quant` had to be flagged off here in the first place).

## Sources

- [LFM2 technical report — arXiv:2511.23404](https://arxiv.org/abs/2511.23404)
- [LFM2.5 1.2B Thinking release post — liquid.ai](https://www.liquid.ai/blog/lfm2-5-1-2b-thinking-on-device-reasoning-under-1gb)
- [HuggingFace model card — LiquidAI/LFM2.5-1.2B-Thinking](https://huggingface.co/LiquidAI/LFM2.5-1.2B-Thinking)
