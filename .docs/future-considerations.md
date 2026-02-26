# Future Considerations

Models, integrations, and infrastructure ideas worth revisiting when resources allow.

---

## Model Additions

### LFM2-24B-A2B — LiquidAI
**HuggingFace:** https://huggingface.co/LiquidAI/LFM2-24B-A2B-GGUF

| Property | Value |
|----------|-------|
| Architecture | Hybrid MoE (LFM2) |
| Total params | 24B |
| Active params | 2B per token |
| llama.cpp support | Day-one |
| Category | Medium (8200–8299 port range) |

**Quant options:**

| Quant | Size | Notes |
|-------|------|-------|
| Q4_K_M | 14.4 GB | Recommended |
| Q5_K_M | 16.9 GB | |
| Q6_K | 19.6 GB | |
| Q8_0 | 25.4 GB | |

**Why it fits:**
- Completes the LFM2 family (already running LFM2.5-1.2B as default)
- MoE efficiency: 24B model behaves like a 2B at inference time
- Comparable to GLM-4.7 Flash (30B/3B active) already in the stack
- 112 tok/s on AMD CPU, 293 tok/s on H100

**Blocker:** Requires ~32 GB RAM headroom on the inference server. Verify available RAM before adding. Suggested config:
```python
"lfm2-24b": ModelConfig(
    name="lfm2-24b",
    port=8204,
    subdomain="lfm2-24b",
    category=ModelCategory.MEDIUM,
    model_id="lfm2-24b-a2b",
    display_name="LFM2 24B",
    hf_repo="LiquidAI/LFM2-24B-A2B-GGUF",
    hf_file="LFM2-24B-A2B-Q4_K_M.gguf",
    owned_by="liquidai",
    n_ctx=4096,
    max_concurrent=1,
)
```

---

## Cloud-backed Model Integrations

An alternative to self-hosting large models — add cloud API providers as virtual models in the routing layer.

### Cloudflare Workers AI
- Free tier: 10k neurons/day
- Already using Cloudflare for tunnels — zero infra changes needed
- OpenAI-compatible API
- Models: Llama 3, Mistral, Gemma, Qwen
- **Priority: High** — natural extension of existing Cloudflare setup

### OpenRouter
- 50 req/day free (free models), many paid models
- OpenAI-compatible — slots into `model_client.py` with minimal changes
- Exposes 30+ free models (Llama, Mistral, Qwen, etc.)
- Useful for offering models too large to self-host

### Google AI Studio (Gemini)
- ~1,500 req/day free, no credit card
- Gemini 2.0 Flash / 2.5 Flash
- Not OpenAI-compatible — needs a thin adapter

### Groq
- 14,400 req/day free
- Extremely fast inference (300+ tok/s)
- OpenAI-compatible
- Models: Llama 3.3 70B, Gemma 2, Qwen

---

## Free GPU Compute (for running large self-hosted models)

If server RAM becomes a constraint for larger models:

| Option | Notes |
|--------|-------|
| **Azure for Students** | $100/yr credit, no credit card, renewable |
| **GitHub Education Pack** | Includes cloud credits, requires student ID or `.edu` |
| **Google Cloud** | $300 free trial (not student-exclusive) |
| **Vast.ai** | Not free, but cheap (~$0.10–0.30/h) for ad-hoc testing |
| **Kaggle / Colab** | Session-based, good for experiments, not persistent hosting |
