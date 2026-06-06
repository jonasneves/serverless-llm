import { useEffect, useRef, useState } from 'react';
import { Camera, X, Loader2, Play, Square, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { useCamera } from '../hooks/useCamera';
import {
  VL_MODELS,
  type VlModelId,
  type ExtractResult,
  type LoadProgress,
  loadVlm,
  extractFromCanvas,
  isVlmReady,
  isWebGpuAvailable,
} from '../utils/vlmExtract';

interface ExtractViewProps {
  onClose: () => void;
}

const DEFAULT_FIELDS = ['main subject', 'dominant color', 'text visible'];
const LOOP_DELAY_MS = 250;

export default function ExtractView({ onClose }: ExtractViewProps) {
  const { videoRef, active: cameraActive, error: cameraError, start, stop, captureFrame } = useCamera();
  const webgpu = isWebGpuAvailable();

  const [modelId, setModelId] = useState<VlModelId>('450m');
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [loadMsg, setLoadMsg] = useState('');
  const [fields, setFields] = useState<string[]>(DEFAULT_FIELDS);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [latency, setLatency] = useState<number | null>(null);

  // Refs the inference loop reads from, kept in sync each render to avoid stale closures.
  const runningRef = useRef(false);
  const busyRef = useRef(false);
  const fieldsRef = useRef(fields);
  const modelIdRef = useRef(modelId);
  const readyRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  fieldsRef.current = fields;
  modelIdRef.current = modelId;
  readyRef.current = loadState === 'ready';

  // Start the camera as soon as the view opens; tear it down on close.
  useEffect(() => {
    if (webgpu) start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLoad() {
    if (loadState === 'loading') return;
    setLoadState(isVlmReady(modelId) ? 'ready' : 'loading');
    setLoadMsg('Downloading model…');
    try {
      await loadVlm(modelId, (p: LoadProgress) => {
        if (p.status === 'progress' && typeof p.progress === 'number') {
          setLoadMsg(`Downloading ${p.file ?? 'model'}… ${Math.round(p.progress)}%`);
        } else if (p.status) {
          setLoadMsg(p.status);
        }
      });
      setLoadState('ready');
      setLoadMsg('');
    } catch (e) {
      setLoadState('error');
      setLoadMsg(e instanceof Error ? e.message : 'Model failed to load');
    }
  }

  function selectModel(id: VlModelId) {
    if (id === modelId) return;
    setRunning(false);
    setModelId(id);
    setResult(null);
    setLoadState(isVlmReady(id) ? 'ready' : 'idle');
    setLoadMsg('');
  }

  // The live inference loop. Driven by `running`; reads everything from refs.
  useEffect(() => {
    runningRef.current = running;
    if (!running) {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      return;
    }

    const schedule = () => {
      if (runningRef.current) timerRef.current = window.setTimeout(tick, LOOP_DELAY_MS);
    };

    const tick = async () => {
      if (!runningRef.current) return;
      if (busyRef.current || !readyRef.current) { schedule(); return; }
      const canvas = captureFrame();
      if (!canvas) { schedule(); return; }
      busyRef.current = true;
      const t0 = performance.now();
      try {
        const res = await extractFromCanvas(modelIdRef.current, canvas, fieldsRef.current);
        if (runningRef.current) {
          setResult(res);
          setLatency(performance.now() - t0);
        }
      } catch (e) {
        if (runningRef.current) setResult({ json: null, raw: e instanceof Error ? e.message : String(e) });
      } finally {
        busyRef.current = false;
        schedule();
      }
    };

    tick();
    return () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  async function handlePrimary() {
    if (loadState !== 'ready') { await handleLoad(); return; }
    setRunning(r => !r);
  }

  const updateField = (i: number, v: string) => setFields(f => f.map((x, j) => (j === i ? v : x)));
  const removeField = (i: number) => setFields(f => f.filter((_, j) => j !== i));
  const addField = () => setFields(f => [...f, '']);

  const fps = latency ? (1000 / Math.max(latency, 1)).toFixed(1) : '—';
  const primaryLabel =
    loadState === 'loading' ? 'Loading…'
      : loadState !== 'ready' ? `Load ${VL_MODELS[modelId].label} (${VL_MODELS[modelId].size})`
        : running ? 'Stop' : 'Start';

  return (
    <div
      className="fixed inset-0 z-[300] bg-slate-950/95 backdrop-blur-md flex flex-col text-slate-200 overflow-hidden"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 sm:px-6 py-3 border-b border-white/5">
        <div className="flex items-center gap-2 min-w-0">
          <Camera className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="font-semibold tracking-tight">Extract</span>
          <span className="text-[11px] text-slate-500 hidden md:inline">live vision → JSON</span>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-lg bg-black/30 border border-white/5 shrink-0">
          {(Object.keys(VL_MODELS) as VlModelId[]).map(id => (
            <button
              key={id}
              onClick={() => selectModel(id)}
              className={`px-2.5 py-1.5 text-xs rounded-md transition-colors ${modelId === id ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400 hover:text-slate-200'}`}
              title={VL_MODELS[id].size}
            >
              {VL_MODELS[id].label}
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          className="min-w-[40px] min-h-[40px] w-10 h-10 shrink-0 rounded-full bg-slate-800/60 flex items-center justify-center border border-slate-700/50 hover:border-slate-600 transition-colors active:scale-95"
          title="Close"
        >
          <X className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* WebGPU gate */}
      {!webgpu ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-md text-center space-y-3">
            <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
            <p className="text-slate-300 font-medium">WebGPU not available</p>
            <p className="text-sm text-slate-500">
              The live camera path runs the vision model in your browser via WebGPU — use a
              recent desktop Chrome or Edge. For single-shot extraction without WebGPU, launch
              the Extract GGUF inference server and call it directly.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col lg:flex-row min-h-0">
          {/* Camera — fixed slice on mobile, fills the column on desktop */}
          <div className="relative bg-black flex items-center justify-center min-h-0 max-lg:h-[40vh] max-lg:shrink-0 lg:flex-1">
            <video ref={videoRef} playsInline muted className="max-h-full max-w-full object-contain" />
            {!cameraActive && (
              <div className="absolute inset-0 flex items-center justify-center text-slate-600 text-sm gap-2">
                {cameraError
                  ? <span className="text-amber-400 px-6 text-center">{cameraError}</span>
                  : <><Loader2 className="w-4 h-4 animate-spin" /> Requesting camera…</>}
              </div>
            )}
            {running && (
              <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/50 text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> live
              </div>
            )}
          </div>

          {/* Controls + output — fills remaining height on mobile, fixed rail on desktop */}
          <div className="flex flex-col min-h-0 flex-1 lg:flex-none lg:w-[420px] xl:w-[480px] border-t lg:border-t-0 lg:border-l border-white/5 bg-slate-900/40">
            {/* Fields */}
            <div className="p-4 border-b border-white/5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase tracking-wider text-slate-500">Fields</span>
                <button onClick={addField} className="flex items-center gap-1 px-1 py-1 -mr-1 text-xs text-emerald-400 hover:text-emerald-300 active:scale-95">
                  <Plus className="w-3.5 h-3.5" /> add
                </button>
              </div>
              <div className="space-y-1.5 max-h-32 sm:max-h-44 overflow-y-auto">
                {fields.map((f, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input
                      value={f}
                      onChange={e => updateField(i, e.target.value)}
                      placeholder="field name (e.g. invoice total)"
                      className="flex-1 min-w-0 px-2.5 py-2 sm:py-1.5 text-base sm:text-sm rounded-md bg-black/30 border border-white/10 focus:border-emerald-500/50 focus:outline-none placeholder:text-slate-600"
                    />
                    <button
                      onClick={() => removeField(i)}
                      className="shrink-0 w-9 h-9 flex items-center justify-center rounded-md text-slate-500 hover:text-rose-400 active:scale-95"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* JSON output */}
            <div className="flex-1 min-h-0 flex flex-col p-4">
              <span className="text-xs uppercase tracking-wider text-slate-500 mb-2">Output</span>
              <div className="flex-1 min-h-0 overflow-auto rounded-lg bg-black/40 border border-white/5 p-3 font-mono text-[13px] leading-relaxed">
                {result?.json
                  ? <pre className="text-emerald-300 whitespace-pre-wrap break-words">{JSON.stringify(result.json, null, 2)}</pre>
                  : result
                    ? <pre className="text-amber-300/80 whitespace-pre-wrap break-words">{result.raw || '(empty)'}</pre>
                    : <span className="text-slate-600">{running ? 'reading frame…' : 'press Start'}</span>}
              </div>
            </div>

            {/* Footer: primary + status */}
            <div
              className="p-4 border-t border-white/5 space-y-2"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            >
              {loadMsg && <p className="text-[11px] text-slate-500 truncate">{loadMsg}</p>}
              <div className="flex items-center gap-3">
                <button
                  onClick={handlePrimary}
                  disabled={loadState === 'loading' || !cameraActive}
                  className={`flex-1 min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${running ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30' : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'}`}
                >
                  {loadState === 'loading'
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : running ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  {primaryLabel}
                </button>
                <div className="text-right text-[11px] text-slate-500 leading-tight tabular-nums">
                  <div>{VL_MODELS[modelId].label}</div>
                  <div>{running ? `${fps} fps` : 'idle'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
