import { useState, useEffect, useCallback } from 'react';
import { Bug, Mouse, X, Settings, Activity, List, Ruler, Play, Pause } from 'lucide-react';

// Gesture configuration that can be adjusted in real-time
export interface GestureConfig {
  twoFingerTapWindow: number;
  twoFingerTapCooldown: number;
  twoFingerMinFrames: number;
  minPointingTime: number;
  dwellTime: number;
  cursorSmoothing: number;
}

// Optimized defaults based on testing - prioritizes reliability over speed
export const DEFAULT_GESTURE_CONFIG: GestureConfig = {
  twoFingerTapWindow: 500,    // ms - time window to bring second finger (shorter = more responsive)
  twoFingerTapCooldown: 400,  // ms - prevents accidental double-clicks
  twoFingerMinFrames: 4,      // frames - ~130ms at 30fps, prevents accidental triggers
  minPointingTime: 100,       // ms - minimum pointing before tap allowed (ensures intent)
  dwellTime: 1200,            // ms - hold-to-click fallback (faster than before)
  cursorSmoothing: 0.5,       // 0-1 - higher = smoother but slightly more lag
};

// Landmark names for the 21 hand landmarks
const LANDMARK_NAMES = [
  'Wrist', 'Thumb_CMC', 'Thumb_MCP', 'Thumb_IP', 'Thumb_Tip',
  'Index_MCP', 'Index_PIP', 'Index_DIP', 'Index_Tip',
  'Middle_MCP', 'Middle_PIP', 'Middle_DIP', 'Middle_Tip',
  'Ring_MCP', 'Ring_PIP', 'Ring_DIP', 'Ring_Tip',
  'Pinky_MCP', 'Pinky_PIP', 'Pinky_DIP', 'Pinky_Tip'
];

// Key landmark pairs for common measurements
const KEY_DISTANCES = [
  { from: 4, to: 8, name: 'Thumb-Index (pinch)' },
  { from: 8, to: 12, name: 'Index-Middle' },
  { from: 4, to: 12, name: 'Thumb-Middle' },
  { from: 0, to: 12, name: 'Wrist-Middle (hand size)' },
];

type DebugTab = 'state' | 'raw' | 'log' | 'config';

// Raw landmark data for advanced debugging
export interface LandmarkData {
  landmarks: Array<{ x: number; y: number; z: number }> | null;
  handedness: 'Left' | 'Right' | null;
}

// Performance metrics
export interface PerformanceMetrics {
  fps: number;
  detectionTime: number;
}

interface GestureDebugPanelProps {
  enabled: boolean;
  onToggle: () => void;
  gestureState: {
    gesture: string | null;
    progress: number;
    triggered: boolean;
  } | null;
  config: GestureConfig;
  onConfigChange: (config: GestureConfig) => void;
  mouseSimulation: boolean;
  onMouseSimulationToggle: () => void;
  // Debug info from hand detection
  debugInfo?: {
    indexExtended: boolean;
    middleExtended: boolean;
    ringExtended: boolean;
    pinkyExtended: boolean;
    wasPointingOnly: boolean;
    twoFingerFrames: number;
    clickLocked: boolean;
  };
  // Raw landmark data for advanced debugging
  landmarkData?: LandmarkData;
  // Performance metrics
  performance?: PerformanceMetrics;
  // Pause control
  paused?: boolean;
  onPauseToggle?: () => void;
}

export default function GestureDebugPanel({
  enabled,
  onToggle,
  gestureState,
  config,
  onConfigChange,
  mouseSimulation,
  onMouseSimulationToggle,
  debugInfo,
  landmarkData,
  performance,
  paused = false,
  onPauseToggle,
}: GestureDebugPanelProps) {
  const [activeTab, setActiveTab] = useState<DebugTab>('state');
  const [gestureHistory, setGestureHistory] = useState<Array<{ gesture: string; time: number; details?: string }>>([]);
  const [selectedLandmarks, setSelectedLandmarks] = useState<[number, number] | null>(null);

  // Position classes - now positioned at the top right, below the gesture controls
  const rightOffset = 'right-3 sm:right-5';

  // Track gesture triggers in history with more details
  useEffect(() => {
    if (gestureState?.triggered && gestureState.gesture) {
      const details = debugInfo
        ? `2F:${debugInfo.twoFingerFrames} P:${debugInfo.wasPointingOnly ? 'Y' : 'N'}`
        : undefined;
      setGestureHistory(prev => [
        { gesture: gestureState.gesture!, time: Date.now(), details },
        ...prev.slice(0, 49) // Keep last 50 for better log
      ]);
    }
  }, [gestureState?.triggered, gestureState?.gesture, debugInfo]);

  const updateConfig = useCallback((key: keyof GestureConfig, value: number) => {
    onConfigChange({ ...config, [key]: value });
  }, [config, onConfigChange]);

  // Calculate distance between two landmarks
  const calcDistance = useCallback((idx1: number, idx2: number) => {
    if (!landmarkData?.landmarks) return null;
    const l1 = landmarkData.landmarks[idx1];
    const l2 = landmarkData.landmarks[idx2];
    if (!l1 || !l2) return null;
    return Math.sqrt(
      Math.pow(l1.x - l2.x, 2) +
      Math.pow(l1.y - l2.y, 2) +
      Math.pow(l1.z - l2.z, 2)
    );
  }, [landmarkData]);

  // When not enabled, render nothing
  if (!enabled) {
    return null;
  }

  return (
    <div
      data-debug-panel
      className={`fixed top-28 sm:top-24 ${rightOffset} z-50 w-80 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-xl shadow-xl overflow-hidden max-h-[70vh] flex flex-col`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-slate-700/50 shrink-0">
        <div className="flex items-center gap-2">
          <Bug size={16} className="text-amber-400" />
          <span className="text-sm font-medium text-slate-200">Gesture Debug</span>
          {performance && (
            <span className="text-[10px] text-slate-500 font-mono">
              {performance.fps}fps • {performance.detectionTime}ms
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {onPauseToggle && (
            <button
              onClick={onPauseToggle}
              className={`p-1.5 rounded-md transition-colors ${paused ? 'bg-amber-500/20 text-amber-400' : 'text-slate-400 hover:text-slate-200'}`}
              title={paused ? "Resume" : "Pause"}
            >
              {paused ? <Play size={14} /> : <Pause size={14} />}
            </button>
          )}
          <button
            onClick={onToggle}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-700/50 shrink-0">
        <TabButton active={activeTab === 'state'} onClick={() => setActiveTab('state')} icon={<Activity size={12} />} label="State" />
        <TabButton active={activeTab === 'raw'} onClick={() => setActiveTab('raw')} icon={<Ruler size={12} />} label="Raw" />
        <TabButton active={activeTab === 'log'} onClick={() => setActiveTab('log')} icon={<List size={12} />} label="Log" />
        <TabButton active={activeTab === 'config'} onClick={() => setActiveTab('config')} icon={<Settings size={12} />} label="Config" />
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {/* STATE TAB */}
        {activeTab === 'state' && (
          <div className="p-3 space-y-3">
            {/* Mouse Simulation */}
            <button
              onClick={onMouseSimulationToggle}
              className={`w-full flex items-center justify-between p-2 rounded-lg transition-all ${
                mouseSimulation
                  ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400'
                  : 'bg-slate-800/50 border border-slate-700/50 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <Mouse size={14} />
                <span className="text-xs font-medium">Mouse Simulation</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/50">
                {mouseSimulation ? 'ON' : 'OFF'}
              </span>
            </button>

            {/* Current Gesture */}
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Current Gesture</div>
              <div className="flex items-center gap-2">
                <div className={`px-2 py-1 rounded text-xs font-mono ${
                  gestureState?.gesture ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-800/50 text-slate-500'
                }`}>
                  {gestureState?.gesture || 'NEUTRAL'}
                </div>
                {gestureState?.progress !== undefined && gestureState.progress > 0 && (
                  <div className="flex-1 h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400 transition-all duration-100" style={{ width: `${gestureState.progress * 100}%` }} />
                  </div>
                )}
              </div>
            </div>

            {/* Finger States */}
            {debugInfo && (
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Fingers</div>
                <div className="grid grid-cols-4 gap-1 text-[10px]">
                  <FingerIndicator label="Idx" extended={debugInfo.indexExtended} />
                  <FingerIndicator label="Mid" extended={debugInfo.middleExtended} />
                  <FingerIndicator label="Rng" extended={debugInfo.ringExtended} />
                  <FingerIndicator label="Pnk" extended={debugInfo.pinkyExtended} />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
                  <div className={`px-1.5 py-1 rounded text-center ${debugInfo.wasPointingOnly ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800/50 text-slate-500'}`}>
                    Point
                  </div>
                  <div className={`px-1.5 py-1 rounded text-center ${debugInfo.twoFingerFrames > 0 ? 'bg-purple-500/20 text-purple-400' : 'bg-slate-800/50 text-slate-500'}`}>
                    2F:{debugInfo.twoFingerFrames}
                  </div>
                  <div className={`px-1.5 py-1 rounded text-center ${debugInfo.clickLocked ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                    {debugInfo.clickLocked ? 'Lock' : 'Ready'}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* RAW DATA TAB */}
        {activeTab === 'raw' && (
          <div className="p-3 space-y-3">
            {/* Key Distances */}
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Key Distances</div>
              <div className="space-y-1">
                {KEY_DISTANCES.map(({ from, to, name }) => {
                  const dist = calcDistance(from, to);
                  return (
                    <div key={`${from}-${to}`} className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-400">{name}</span>
                      <span className={`font-mono ${dist && dist < 0.05 ? 'text-emerald-400' : 'text-slate-300'}`}>
                        {dist ? dist.toFixed(4) : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Custom Distance Calculator */}
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Distance Calculator</div>
              <div className="flex gap-2 items-center">
                <select
                  className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-300"
                  value={selectedLandmarks?.[0] ?? ''}
                  onChange={(e) => setSelectedLandmarks([parseInt(e.target.value), selectedLandmarks?.[1] ?? 8])}
                >
                  <option value="">From...</option>
                  {LANDMARK_NAMES.map((name, i) => (
                    <option key={i} value={i}>{i}: {name}</option>
                  ))}
                </select>
                <span className="text-slate-500">→</span>
                <select
                  className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-300"
                  value={selectedLandmarks?.[1] ?? ''}
                  onChange={(e) => setSelectedLandmarks([selectedLandmarks?.[0] ?? 4, parseInt(e.target.value)])}
                >
                  <option value="">To...</option>
                  {LANDMARK_NAMES.map((name, i) => (
                    <option key={i} value={i}>{i}: {name}</option>
                  ))}
                </select>
              </div>
              {selectedLandmarks && (
                <div className="mt-2 p-2 bg-slate-800/50 rounded text-center">
                  <span className="text-[10px] text-slate-400">Distance: </span>
                  <span className="text-sm font-mono text-cyan-400">
                    {calcDistance(selectedLandmarks[0], selectedLandmarks[1])?.toFixed(4) ?? '—'}
                  </span>
                </div>
              )}
            </div>

            {/* Landmark Positions */}
            {landmarkData?.landmarks && (
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">
                  Fingertip Positions {landmarkData.handedness && `(${landmarkData.handedness})`}
                </div>
                <div className="space-y-1 text-[10px] font-mono">
                  {[4, 8, 12, 16, 20].map((idx) => {
                    const l = landmarkData.landmarks![idx];
                    return (
                      <div key={idx} className="flex items-center justify-between">
                        <span className="text-slate-400">{LANDMARK_NAMES[idx]}</span>
                        <span className="text-slate-300">
                          ({l.x.toFixed(2)}, {l.y.toFixed(2)}, {l.z.toFixed(2)})
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* LOG TAB */}
        {activeTab === 'log' && (
          <div className="p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] text-slate-500 uppercase tracking-wide">Event Log</div>
              <button
                onClick={() => setGestureHistory([])}
                className="text-[10px] text-slate-500 hover:text-slate-300"
              >
                Clear
              </button>
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {gestureHistory.length === 0 ? (
                <div className="text-[10px] text-slate-600 italic py-4 text-center">No events yet</div>
              ) : (
                gestureHistory.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px] py-0.5">
                    <span className="text-slate-600 font-mono w-12">{formatTime(item.time)}</span>
                    <span className={`font-mono flex-1 ${i === 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                      {item.gesture}
                    </span>
                    {item.details && (
                      <span className="text-slate-600 font-mono">{item.details}</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* CONFIG TAB */}
        {activeTab === 'config' && (
          <div className="p-3 space-y-3">
            <ConfigSlider label="Tap Window" value={config.twoFingerTapWindow} min={200} max={1200} step={50} unit="ms" onChange={(v) => updateConfig('twoFingerTapWindow', v)} />
            <ConfigSlider label="Tap Cooldown" value={config.twoFingerTapCooldown} min={100} max={1000} step={50} unit="ms" onChange={(v) => updateConfig('twoFingerTapCooldown', v)} />
            <ConfigSlider label="Min Frames" value={config.twoFingerMinFrames} min={1} max={10} step={1} unit="f" onChange={(v) => updateConfig('twoFingerMinFrames', v)} />
            <ConfigSlider label="Min Point Time" value={config.minPointingTime} min={0} max={500} step={25} unit="ms" onChange={(v) => updateConfig('minPointingTime', v)} />
            <ConfigSlider label="Dwell Time" value={config.dwellTime} min={500} max={3000} step={100} unit="ms" onChange={(v) => updateConfig('dwellTime', v)} />
            <ConfigSlider label="Cursor Smooth" value={config.cursorSmoothing} min={0.1} max={1} step={0.05} unit="" onChange={(v) => updateConfig('cursorSmoothing', v)} />

            <button
              onClick={() => onConfigChange(DEFAULT_GESTURE_CONFIG)}
              className="w-full text-[10px] text-slate-500 hover:text-slate-300 transition-colors py-1 border-t border-slate-700/50 mt-2"
            >
              Reset to defaults
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors ${
        active ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-500 hover:text-slate-300'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function FingerIndicator({ label, extended }: { label: string; extended: boolean }) {
  return (
    <div className={`px-1.5 py-1 rounded text-center ${
      extended ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800/50 text-slate-500'
    }`}>
      {label}
    </div>
  );
}

function ConfigSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-slate-400">{label}</span>
        <span className="text-slate-300 font-mono">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 bg-slate-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-slate-400 [&::-webkit-slider-thumb]:hover:bg-slate-300"
      />
    </div>
  );
}

function formatTime(time: number): string {
  const date = new Date(time);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
}

