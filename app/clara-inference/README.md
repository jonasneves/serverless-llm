# CLaRa-7B-Instruct Inference Server

Inference server for Apple's CLaRa-7B-Instruct model with semantic document compression.

## Features

- **Document Compression**: 16x or 128x semantic compression
- **RAG Generation**: Native document-based Q&A
- **Standard Chat API**: Compatible with orchestrator
- **Dual Endpoints**: `/v1/chat/completions` and `/v1/rag/generate`

## Setup

```bash
pip install -r requirements.txt
python inference_server.py
```

## Environment Variables

- `PORT` - Server port (default: 8000)
- `COMPRESSION_LEVEL` - Compression factor: "16" or "128" (default: "16")

## API Endpoints

### 1. RAG Generation (Recommended)

Use CLaRa's native document compression capabilities:

```bash
curl -X POST http://localhost:8000/v1/rag/generate \
  -H "Content-Type: application/json" \
  -d '{
    "questions": ["Which genus grows in Mexico, Phylica or Weldenia?"],
    "documents": [[
      "Weldenia is a monotypic genus of flowering plant in the family Commelinaceae...",
      "Hagsatera is a genus of flowering plants from the orchid family...",
      "Alsobia is a genus of flowering plants in the family Gesneriaceae..."
    ]],
    "max_tokens": 64
  }'
```

Response:
```json
{
  "answers": ["Weldenia grows in Mexico and Guatemala."],
  "model": "clara-7b-instruct",
  "compression": "16x"
}
```

### 2. Standard Chat Completions

Compatible with orchestrator and existing infrastructure:

```bash
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "What is semantic compression?"}
    ],
    "max_tokens": 128,
    "temperature": 0.7
  }'
```

### 3. Health Check

```bash
curl http://localhost:8000/health
```

Response:
```json
{
  "status": "healthy",
  "model": "CLaRa-7B-Instruct",
  "compression": "16x",
  "capabilities": ["chat", "rag", "document_compression"]
}
```

## Model Profile

CLaRa has been added to `model_profiles.py` with expertise in:

- **Retrieval**: 0.95 (Exceptional)
- **Document Compression**: 0.98 (Exceptional)
- **Summarization**: 0.88 (Strong)
- **Question Answering**: 0.85 (Strong)
- **Multi-document Reasoning**: 0.85 (Strong)

Best for:
- Document Q&A
- Long context summarization
- Multi-document synthesis
- Information retrieval
- Research paper analysis
- Legal document review

## Compression Levels

### 16x Compression
- Balanced compression and quality
- Recommended for most use cases
- Model: `apple/CLaRa-7B-Instruct/compression-16`

### 128x Compression
- Extreme compression for very long documents
- Trade-off: slightly lower quality
- Model: `apple/CLaRa-7B-Instruct/compression-128`
- Set `COMPRESSION_LEVEL=128` environment variable

## Integration with Orchestrator

CLaRa will automatically participate in multi-model discussions when:
- Query involves document analysis or retrieval
- Weighted expertise in `retrieval`, `document_compression`, or `summarization` domains
- Use `should_model_participate()` to determine participation

## Paper

CLaRa: Bridging Retrieval and Generation with Continuous Latent Reasoning
arXiv: 2511.18659
GitHub: https://github.com/apple/ml-clara
