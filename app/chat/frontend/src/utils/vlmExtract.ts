// In-browser vision extraction using @huggingface/transformers@4 (CDN, WebGPU).
// Runs an LFM2.5-VL ONNX model entirely client-side: capture a video frame, prompt
// the model with a field list, get back parsed JSON. No inference server needed —
// works on the static Pages deploy. The Extract fine-tune ships only as GGUF (server
// path); the browser path runs the base VL ONNX prompted for the same fields.
//
// Call shape mirrors the proven catwatcher loop (AutoModelForImageTextToText +
// AutoProcessor + RawImage). The module + weights load lazily on first use.

// @4 — the lfm2_vl architecture landed in transformers.js v4; v3 throws
// "Unsupported model type: lfm2_vl". Matches catwatcher's proven loader.
const HF_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4';

export type VlModelId = '450m' | '1.6b';

export const VL_MODELS: Record<VlModelId, { repo: string; label: string; size: string }> = {
  '450m': { repo: 'LiquidAI/LFM2.5-VL-450M-ONNX', label: '450M', size: '~770 MB' },
  '1.6b': { repo: 'LiquidAI/LFM2.5-VL-1.6B-ONNX', label: '1.6B', size: '~1.5 GB' },
};

/* eslint-disable @typescript-eslint/no-explicit-any */
let _mod: any = null;
let _loadModulePromise: Promise<void> | null = null;
const _models: Partial<Record<VlModelId, { model: any; processor: any }>> = {};
const _loadPromises: Partial<Record<VlModelId, Promise<{ model: any; processor: any }>>> = {};

async function ensureModule(): Promise<void> {
  if (_mod) return;
  if (!_loadModulePromise) {
    _loadModulePromise = (import(/* @vite-ignore */ HF_CDN) as Promise<any>).then(m => { _mod = m; });
  }
  return _loadModulePromise;
}

export function isWebGpuAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as any).gpu;
}

export type LoadProgress = { status: string; progress?: number; file?: string };

export function isVlmReady(id: VlModelId): boolean {
  return !!_models[id];
}

export async function loadVlm(id: VlModelId, onProgress?: (p: LoadProgress) => void): Promise<void> {
  if (_models[id]) return;
  if (!_loadPromises[id]) {
    _loadPromises[id] = (async () => {
      await ensureModule();
      const { repo } = VL_MODELS[id];
      const progress_callback = onProgress
        ? (p: any) => onProgress({ status: p.status, progress: p.progress, file: p.file })
        : undefined;
      const model = await _mod.AutoModelForImageTextToText.from_pretrained(repo, {
        device: 'webgpu',
        dtype: { vision_encoder: 'fp16', embed_tokens: 'fp16', decoder_model_merged: 'q4' },
        progress_callback,
      });
      const processor = await _mod.AutoProcessor.from_pretrained(repo, { progress_callback });
      const entry = { model, processor };
      _models[id] = entry;
      return entry;
    })();
  }
  await _loadPromises[id];
}

function buildPrompt(fields: string[]): string {
  const list = fields.map(f => f.trim()).filter(Boolean).map(f => `"${f}"`).join(', ');
  return (
    `Extract these fields from the image: ${list}. ` +
    `Respond with ONLY a single JSON object whose keys are exactly those field names. ` +
    `Use null for any field that is not visible. No explanation, no markdown fences.`
  );
}

export interface ExtractResult {
  json: Record<string, unknown> | null;
  raw: string;
}

function parseJson(raw: string): ExtractResult {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return { json: JSON.parse(trimmed), raw };
  } catch {
    const m = trimmed.match(/\{[\s\S]*\}/);
    if (m) {
      try { return { json: JSON.parse(m[0]), raw }; } catch { /* fall through */ }
    }
    return { json: null, raw };
  }
}

export async function extractFromCanvas(
  id: VlModelId,
  canvas: HTMLCanvasElement,
  fields: string[],
): Promise<ExtractResult> {
  const entry = _models[id];
  if (!entry) throw new Error(`VL model '${id}' not loaded`);

  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const image = new _mod.RawImage(imageData.data, canvas.width, canvas.height, 4);

  const messages = [
    { role: 'user', content: [{ type: 'image' }, { type: 'text', text: buildPrompt(fields) }] },
  ];
  const chatPrompt = entry.processor.apply_chat_template(messages, { add_generation_prompt: true });
  const inputs = await entry.processor(image, chatPrompt, { add_special_tokens: false });
  const outputs = await entry.model.generate({ ...inputs, do_sample: false, max_new_tokens: 256 });
  const decoded = entry.processor.batch_decode(
    outputs.slice(null, [inputs.input_ids.dims.at(-1), null]),
    { skip_special_tokens: true },
  );
  return parseJson(decoded[0] ?? '');
}
