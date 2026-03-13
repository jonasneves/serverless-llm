import { useState, useRef, useCallback, useEffect } from 'react';
import { BenchmarkProfile, BenchmarkResult, Model } from './types';
import { useModelsManager } from './hooks/useModelsManager';
import { usePersistedSetting } from './hooks/usePersistedSetting';
import { BENCHMARK_PROFILE_META, getBenchmarkProfileTaskCount, getTasksForBenchmarkProfile } from './utils/spatialBenchmarkSelection';
import { SPATIAL_BENCHMARK_SUITE_MAP } from './data/spatialBenchmarkSuites';
import { runSpatialReasoning } from './engines/spatialReasoningEngine';
import { GENERATION_DEFAULTS } from './constants';
import BenchmarkResults from './components/BenchmarkResults';
import ErrorBoundary from './components/ErrorBoundary';

const PROFILE_ORDER: BenchmarkProfile[] = ['quick', 'balanced', 'full'];

// ── Model selector ─────────────────────────────────────────────────────────

function ModelSelector({
  models,
  selected,
  onToggle,
  onlineModelIds,
}: {
  models: Model[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onlineModelIds: Set<string>;
}) {
  const selfHosted = models.filter(m => m.type === 'self-hosted');
  const github = models.filter(m => m.type === 'github');

  const renderGroup = (label: string, group: Model[], accentClass: string) => {
    if (group.length === 0) return null;
    const allSelected = group.every(m => selected.has(m.id));
    return (
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${accentClass}`}>{label}</span>
          <button
            onClick={() => group.forEach(m => {
              const inSet = selected.has(m.id);
              if (allSelected ? inSet : !inSet) onToggle(m.id);
            })}
            className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
          >
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
        </div>
        <div className="flex flex-col gap-1">
          {group.map(m => {
            const isOnline = onlineModelIds.has(m.id);
            const isSelected = selected.has(m.id);
            return (
              <button
                key={m.id}
                onClick={() => onToggle(m.id)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all ${
                  isSelected
                    ? 'bg-cyan-500/15 border border-cyan-500/40 text-slate-100'
                    : 'bg-white/[0.03] border border-white/[0.06] text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]'
                }`}
              >
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: isOnline ? m.color : '#475569' }}
                />
                <span className="text-xs font-medium truncate flex-1">{m.name}</span>
                {isSelected && (
                  <svg className="w-3.5 h-3.5 text-cyan-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div>
      {renderGroup('Self-hosted', selfHosted, 'text-emerald-400')}
      {renderGroup('API Models', github, 'text-blue-400')}
      {models.length === 0 && (
        <p className="text-xs text-slate-500 italic">Loading models…</p>
      )}
    </div>
  );
}

// ── Profile selector ───────────────────────────────────────────────────────

function ProfileSelector({
  profile,
  onChange,
}: {
  profile: BenchmarkProfile;
  onChange: (p: BenchmarkProfile) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {PROFILE_ORDER.map(option => {
        const meta = BENCHMARK_PROFILE_META[option];
        const active = option === profile;
        return (
          <button
            key={option}
            onClick={() => onChange(option)}
            className={`rounded-xl border px-3 py-2.5 text-left transition-all ${
              active
                ? 'border-cyan-400/50 bg-cyan-400/10'
                : 'border-slate-800 bg-white/[0.03] hover:border-slate-700 hover:bg-white/[0.05]'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`text-xs font-semibold ${active ? 'text-cyan-100' : 'text-slate-300'}`}>
                {meta.label}
              </span>
              <span className={`text-[10px] rounded-full px-2 py-0.5 ${active ? 'bg-cyan-300/15 text-cyan-200' : 'bg-slate-800 text-slate-400'}`}>
                {getBenchmarkProfileTaskCount(option)} tasks
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500 leading-snug">{meta.description}</p>
          </button>
        );
      })}
    </div>
  );
}

// ── Running state display ──────────────────────────────────────────────────

function RunningView({
  phaseLabel,
  completedTasks,
  totalTasks,
  activeModels,
  models,
  onStop,
}: {
  phaseLabel: string | null;
  completedTasks: number;
  totalTasks: number;
  activeModels: Set<string>;
  models: Model[];
  onStop: () => void;
}) {
  const progress = totalTasks > 0 ? completedTasks / totalTasks : 0;

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 px-8">
      {/* Progress ring */}
      <div className="relative w-32 h-32">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
          <circle
            cx="60" cy="60" r="52"
            fill="none"
            stroke="url(#benchGrad)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 52}`}
            strokeDashoffset={`${2 * Math.PI * 52 * (1 - progress)}`}
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
          <defs>
            <linearGradient id="benchGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="100%" stopColor="#34d399" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-slate-100">{completedTasks}</span>
          <span className="text-xs text-slate-500">/ {totalTasks}</span>
        </div>
      </div>

      {/* Phase label */}
      <div className="text-center space-y-1">
        <div className="flex items-center justify-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-sm font-medium text-slate-300">{phaseLabel ?? 'Running…'}</span>
        </div>
        <p className="text-xs text-slate-500">Tasks completed: {completedTasks} of {totalTasks}</p>
      </div>

      {/* Active models */}
      {activeModels.size > 0 && (
        <div className="flex flex-wrap gap-2 justify-center max-w-sm">
          {Array.from(activeModels).map(id => {
            const m = models.find(m => m.id === id);
            return (
              <div key={id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-[11px] text-amber-200">{m?.name ?? id}</span>
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={onStop}
        className="flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/10 border border-red-500/30 text-red-300 hover:bg-red-500/20 text-sm transition-all"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="6" y="6" width="12" height="12" rx="1" strokeWidth={2} />
        </svg>
        Stop
      </button>
    </div>
  );
}

// ── Idle / empty state ─────────────────────────────────────────────────────

function IdleView({
  selectedCount,
  profile,
  onRun,
}: {
  selectedCount: number;
  profile: BenchmarkProfile;
  onRun: () => void;
}) {
  const taskCount = getBenchmarkProfileTaskCount(profile);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
        <svg className="w-8 h-8 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-slate-100 mb-1">Spatial Benchmark Observatory</h2>
        <p className="text-sm text-slate-400 max-w-xs">
          Run StepGame, SPARTQA, and SPaRC across your selected models and compare results with interactive charts.
        </p>
      </div>

      <div className="flex gap-3 text-sm text-slate-400">
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-xl font-bold text-slate-100">{taskCount}</span>
          <span className="text-[11px] uppercase tracking-wider">Tasks</span>
        </div>
        <div className="w-px bg-slate-700" />
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-xl font-bold text-slate-100">3</span>
          <span className="text-[11px] uppercase tracking-wider">Suites</span>
        </div>
        <div className="w-px bg-slate-700" />
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-xl font-bold text-slate-100">{selectedCount}</span>
          <span className="text-[11px] uppercase tracking-wider">Models</span>
        </div>
      </div>

      <button
        onClick={onRun}
        disabled={selectedCount === 0}
        className="flex items-center gap-2 px-6 py-3 rounded-full bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 font-semibold text-sm transition-all active:scale-95 shadow-lg shadow-cyan-500/20"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 3l14 9-14 9V3z" />
        </svg>
        {selectedCount === 0 ? 'Select models to start' : `Run ${BENCHMARK_PROFILE_META[profile].label}`}
      </button>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function BenchmarkPage() {
  const {
    modelsData,
    setModelsData,
    availableModels,
    onlineModelIds,
    getModelEndpoints,
    modelKeyMap,
    modelIdToName,
    isLoading: isLoadingModels,
  } = useModelsManager();

  const [profile, setProfile] = usePersistedSetting<BenchmarkProfile>(
    'playground_benchmark_profile',
    'balanced',
    {
      serialize: v => v,
      deserialize: (s, fb) => ['quick', 'balanced', 'full'].includes(s as string) ? s as BenchmarkProfile : fb,
    },
  );

  const [persistedSelected, setPersistedSelected] = usePersistedSetting<string[]>(
    'playground_benchmark_selected_models',
    [],
  );

  const selectedModels = new Set(persistedSelected.filter(id => modelsData.some(m => m.id === id)));

  const toggleModel = useCallback((id: string) => {
    setPersistedSelected(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return Array.from(s);
    });
  }, [setPersistedSelected]);

  // Run state
  const [isRunning, setIsRunning] = useState(false);
  const [phaseLabel, setPhaseLabel] = useState<string | null>(null);
  const [completedTasks, setCompletedTasks] = useState(0);
  const [totalTasks, setTotalTasks] = useState(0);
  const [activeModels, setActiveModels] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<BenchmarkResult[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleRun = useCallback(async () => {
    if (selectedModels.size === 0) return;

    const participants = Array.from(selectedModels);
    const tasks = getTasksForBenchmarkProfile(profile);
    const modelEndpoints = getModelEndpoints(modelsData);

    setResults(null);
    setIsRunning(true);
    setCompletedTasks(0);
    setTotalTasks(tasks.length);
    setActiveModels(new Set());
    setPhaseLabel('Starting…');

    const controller = new AbortController();
    abortRef.current = controller;

    const accumulated: BenchmarkResult[] = [];

    try {
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        setPhaseLabel(`Task ${i + 1}/${tasks.length}: ${task.id}`);
        setActiveModels(new Set());

        for await (const event of runSpatialReasoning({
          participants,
          taskCategory: task.category,
          task,
          signal: controller.signal,
          maxTokens: GENERATION_DEFAULTS.maxTokens,
          systemPrompt: null,
          githubToken: null,
          modelEndpoints,
          modelKeys: modelKeyMap,
          modelIdToName,
        })) {
          if (event.type === 'model_start' && event.model_id) {
            setActiveModels(prev => new Set([...prev, event.model_id!]));
          }
          if (event.type === 'spatial_complete' && event.results) {
            accumulated.push({
              suite_id: task.suite_id,
              suite_name: SPATIAL_BENCHMARK_SUITE_MAP[task.suite_id].name,
              task_id: task.id,
              task_text: task.prompt,
              category: task.category,
              cognitive_level: task.cognitive_level,
              expected_answer: task.expected_answer,
              model_results: event.results,
            });
            setCompletedTasks(accumulated.length);
            setActiveModels(new Set());
          }
          if (event.type === 'error') {
            setPhaseLabel(`Error: ${event.error ?? 'unknown'}`);
          }
        }
      }

      setPhaseLabel('Complete');
      setResults(accumulated.length > 0 ? accumulated : null);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setPhaseLabel(`Error: ${(err as Error).message}`);
      }
    } finally {
      setIsRunning(false);
      setActiveModels(new Set());
    }
  }, [selectedModels, profile, modelsData, getModelEndpoints, modelKeyMap, modelIdToName]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setIsRunning(false);
    setActiveModels(new Set());
    setPhaseLabel('Stopped');
  }, []);

  const handleReset = useCallback(() => {
    setResults(null);
    setPhaseLabel(null);
    setCompletedTasks(0);
  }, []);

  // Sync modelsData reset on new run
  useEffect(() => {
    if (isRunning) {
      setModelsData(prev => prev.map(m => ({ ...m, response: '', thinking: undefined, error: undefined })));
    }
  }, [isRunning, setModelsData]);

  return (
    <div className="fixed inset-0 bg-[#0f172a] text-white flex flex-col overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-slate-900/40 backdrop-blur-sm shrink-0 z-10">
        <div className="flex items-center gap-3">
          <a
            href="#/"
            className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors text-sm"
            title="Back to Arena"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Arena
          </a>
          <span className="text-slate-700">/</span>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="font-semibold text-slate-100">Spatial Benchmark</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {results && !isRunning && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              New Run
            </button>
          )}
          {isRunning && (
            <div className="flex items-center gap-2 text-xs text-cyan-300">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              Running {completedTasks}/{totalTasks}
            </div>
          )}
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left sidebar ── */}
        <aside className="w-72 xl:w-80 shrink-0 flex flex-col border-r border-white/5 bg-slate-900/20 overflow-y-auto">
          <div className="p-5 space-y-6">

            {/* Run Profile */}
            <section>
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-300 mb-3">Run Profile</h3>
              <ProfileSelector profile={profile} onChange={setProfile} />
            </section>

            <div className="h-px bg-white/5" />

            {/* Model Selection */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">Models</h3>
                {selectedModels.size > 0 && (
                  <span className="text-[10px] text-cyan-300 font-medium">{selectedModels.size} selected</span>
                )}
              </div>
              {isLoadingModels ? (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <div className="w-3 h-3 border border-slate-600 border-t-slate-400 rounded-full animate-spin" />
                  Loading…
                </div>
              ) : (
                <ModelSelector
                  models={availableModels}
                  selected={selectedModels}
                  onToggle={toggleModel}
                  onlineModelIds={onlineModelIds}
                />
              )}
            </section>

          </div>

          {/* Sticky run button at bottom of sidebar */}
          <div className="mt-auto p-5 border-t border-white/5">
            {isRunning ? (
              <button
                onClick={handleStop}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 hover:bg-red-500/20 font-medium text-sm transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="1" strokeWidth={2} />
                </svg>
                Stop
              </button>
            ) : (
              <button
                onClick={handleRun}
                disabled={selectedModels.size === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed text-slate-900 font-semibold text-sm transition-all active:scale-[0.98] shadow-lg shadow-cyan-500/20"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 3l14 9-14 9V3z" />
                </svg>
                {selectedModels.size === 0
                  ? 'Select models'
                  : results
                    ? `Re-run ${BENCHMARK_PROFILE_META[profile].label}`
                    : `Run ${BENCHMARK_PROFILE_META[profile].label}`}
              </button>
            )}
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
          {isRunning ? (
            <RunningView
              phaseLabel={phaseLabel}
              completedTasks={completedTasks}
              totalTasks={totalTasks}
              activeModels={activeModels}
              models={modelsData}
              onStop={handleStop}
            />
          ) : results ? (
            <div className="px-6 xl:px-10 py-6 pb-16">
              <ErrorBoundary>
                <BenchmarkResults results={results} models={modelsData} />
              </ErrorBoundary>
            </div>
          ) : (
            <IdleView
              selectedCount={selectedModels.size}
              profile={profile}
              onRun={handleRun}
            />
          )}
        </main>

      </div>
    </div>
  );
}
