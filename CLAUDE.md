# LM Arena — build context

Self-hosted LLM inference on **GitHub Actions compute**, exposed via **Cloudflare quick tunnels** discovered through a **tunnel-registry Worker**; static React frontend on **GitHub Pages**. Full data flow, workflows, and layout: [`docs/architecture.md`](docs/architecture.md).

## The invariant: `config/models.py` drives everything

`config/models.py` is the **single source of truth** — one `ModelConfig` per model (port, `hf_repo`/`hf_file`, `n_ctx`/`n_batch`, `max_concurrent`, `flash_attn`, `kv_cache_quant`, `routing_category`, `dockerfile`). Every other artifact is **generated** — never hand-edit a derivative:

| Derivative | Regenerate with |
|:--|:--|
| `services.json` + `public/models.json` | `make build` (`fetch-models.mjs`) |
| Worker `ROUTE_MAP` (`tunnel-registry/worker.js`) | `make sync-worker-config` |
| `inference.yml` model choices | `make sync-workflow-choices` |
| README model table | `make sync-readme` |

**Add a model** = add one `ModelConfig`, then regenerate. The CI build matrix reads `config/models.py --inference-dirs`, so new models are picked up automatically — no workflow edit needed.

## Inference images: two Dockerfiles

`ModelConfig.dockerfile` selects the image (`app/shared/`):

- `"inference"` → `Dockerfile.inference` — llama-cpp-python; standard architectures.
- `"llama-server"` → `Dockerfile.llama-server` — builds llama.cpp from source; **newer architectures** llama-cpp-python doesn't support yet.

`LLAMA_COMMIT` in `.github/workflows/build-push-images.yml` pins the llama.cpp release. Bump it **only** when a new arch needs it — bumping invalidates the clone layer, so **all** `llama-server` images rebuild from source once. `MODEL_NAME` is always a runtime env var, never baked into an image.

## Commands

- `make inference MODEL=<name>` — launch one model (Actions → tunnel); `make down` — cancel all in-flight.
- `make build` — frontend (regenerates `services.json`). `make build-images [MODELS=all]` — Docker images.
- `make lint` / `make format` — Python (ruff). `make lint-web` / `make knip` — frontend.
- `make deploy` — Pages. Browser fleet control: `app/chat/frontend/public/admin.html`.

## Gotchas (cost real debugging)

- **`app/<name>-inference/` dirs don't exist.** All models share one entry point (`app/shared/llama_inference_server.py` or `inference_server.py`) that reads `MODEL_NAME`. `inference_dir` in the config is just a logical build-matrix key + image name.
- **Some archs need `flash_attn=False` *and* `kv_cache_quant=False`** or `llama_decode returned -1` (e.g. `lfm2thinking`). Rationale per model in [`docs/models/`](docs/models/).
- **Large dense models** (12B Q4_K_M ≈ 7 GB) → set `max_concurrent=1` and watch runner RAM.

## Deep docs

- [`docs/architecture.md`](docs/architecture.md) — workflows, data flow, project layout.
- [`docs/models/*.md`](docs/models/) — per-model architecture + inference-flag rationale, with sources.
