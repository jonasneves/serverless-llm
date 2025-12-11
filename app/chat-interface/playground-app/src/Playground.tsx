import { useState } from 'react';

interface Model {
  id: number;
  name: string;
  color: string;
  response: string;
}

const models: Model[] = [
  { id: 1, name: 'QWEN3 4B', color: '#3b82f6', response: "The key consideration here is computational efficiency. When we look at the trade-offs between model size and performance, smaller models can achieve remarkable results with proper fine-tuning..." },
  { id: 2, name: 'CLAUDE 3.5', color: '#f97316', response: "I'd approach this from a slightly different angle. The question of model scaling involves not just computational costs but also the quality of training data and architectural innovations..." },
  { id: 3, name: 'GEMMA 2 9B', color: '#22c55e', response: "Building on what's been said, there's an important empirical finding that smaller models with high-quality data can match larger models. The Chinchilla scaling laws demonstrated..." },
  { id: 4, name: 'MISTRAL 7B', color: '#a855f7', response: "The efficiency argument is compelling. Our approach with mixture of experts shows that you can achieve frontier performance while only activating a fraction of parameters..." },
  { id: 5, name: 'DEEPSEEK R1', color: '#06b6d4', response: "From a reasoning perspective, the chain-of-thought capabilities emerge at certain scales, but can be distilled into smaller models through careful training procedures..." },
  { id: 6, name: 'LLAMA 3.2', color: '#ec4899', response: "Open-source considerations matter here too. Making powerful models accessible means optimizing for deployment on consumer hardware, which pushes us toward efficiency..." },
];

type Mode = 'compare' | 'council' | 'roundtable';

interface Position {
  x: number;
  y: number;
  angle: number;
}

type BackgroundStyle = 'dots' | 'dots-fade' | 'grid' | 'mesh' | 'dots-mesh' | 'animated-mesh' | 'none';

export default function Playground() {
  const [mode, setMode] = useState<Mode>('compare');
  const [selected] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [chairman, setChairman] = useState<number>(2);
  const [expanded, setExpanded] = useState<number | string | null>(null);
  const [speaking, setSpeaking] = useState<number | null>(null);
  const [bgStyle, setBgStyle] = useState<BackgroundStyle>('dots-mesh');
  const [showBgMenu, setShowBgMenu] = useState(false);

  const selectedModels = models.filter(m => selected.includes(m.id) && m.id !== chairman);
  const chairmanModel = models.find(m => m.id === chairman);

  const getCirclePosition = (index: number, total: number): Position => {
    const angle = (index * 360 / total) - 90;
    const radius = 155;
    const x = Math.cos(angle * Math.PI / 180) * radius;
    const y = Math.sin(angle * Math.PI / 180) * radius;
    return { x, y, angle };
  };

  const getGridPosition = (index: number): Position => {
    const cols = 3;
    const cardWidth = 192; // w-48 = 12rem = 192px
    const cardHeight = 200;
    const gapX = 24; // Better spacing between cards
    const gapY = 32;
    const row = Math.floor(index / cols);
    const col = index % cols;
    const totalWidth = (cardWidth + gapX) * cols - gapX;
    const totalHeight = (cardHeight + gapY) * 2;
    return {
      x: col * (cardWidth + gapX) - totalWidth / 2 + cardWidth / 2,
      y: row * (cardHeight + gapY) - totalHeight / 2 + cardHeight / 2,
      angle: 0
    };
  };

  const chairmanSynthesis = "After considering all perspectives, the consensus emerges: model efficiency isn't just about size—it's about the intersection of architecture, data quality, and deployment constraints. Each approach offers valid trade-offs depending on use case requirements.";

  const bgClass = bgStyle === 'none' ? '' : `bg-${bgStyle}`;

  return (
    <div className={`min-h-screen text-white p-6 relative ${bgClass}`} style={bgStyle === 'none' ? { background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' } : {}}>
      {/* Header */}
      <div className="relative flex items-center justify-between mb-6">
        {/* Left: Logo */}
        <div className="flex items-center gap-3 flex-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center border border-slate-600/50">
            <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-100">Serverless LLM</h1>
            <p className="text-xs text-slate-500">Side-by-side response comparison</p>
          </div>
        </div>

        {/* Center: Mode Toggle */}
        <div className="absolute left-1/2 -translate-x-1/2">
          <div className="relative flex p-1 rounded-xl" style={{ background: 'rgba(30, 41, 59, 0.8)', backdropFilter: 'blur(12px)', border: '1px solid rgba(71, 85, 105, 0.4)' }}>
            {/* Sliding indicator */}
            <div
              className="absolute top-1 bottom-1 rounded-lg transition-all duration-300 ease-out"
              style={{
                left: mode === 'compare'
                  ? '4px'
                  : mode === 'council'
                  ? '33.33%'
                  : '66.66%',
                width: '33.33%',
                transform: 'translateX(0)',
                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(139, 92, 246, 0.3))',
                boxShadow: '0 4px 20px rgba(59, 130, 246, 0.2)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                zIndex: 0
              }}
            />
            {(['Compare', 'Council', 'Roundtable'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m.toLowerCase() as Mode); setExpanded(null); setSpeaking(null); }}
                className={`relative z-10 px-5 py-2 text-sm font-medium transition-colors duration-200 ${
                  mode === m.toLowerCase()
                    ? 'text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                style={{ flex: 1 }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Settings */}
        <div className="flex items-center gap-3 flex-1 justify-end">
          <div className="text-xs text-slate-500">
            <span className="text-slate-400">Temp:</span> 0.7
          </div>

          {/* Background Style Selector */}
          <div className="relative">
            <button
              onClick={() => setShowBgMenu(!showBgMenu)}
              className="w-8 h-8 rounded-lg bg-slate-800/50 flex items-center justify-center border border-slate-700/50 hover:border-slate-600 transition-colors"
              title="Change background style"
            >
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>
            </button>

            {showBgMenu && (
              <div
                className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-slate-700/50 overflow-hidden z-50"
                style={{
                  background: 'rgba(15, 23, 42, 0.95)',
                  backdropFilter: 'blur(12px)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
                }}
              >
                {(['dots-mesh', 'dots', 'dots-fade', 'grid', 'mesh', 'animated-mesh', 'none'] as BackgroundStyle[]).map(style => (
                  <button
                    key={style}
                    onClick={() => { setBgStyle(style); setShowBgMenu(false); }}
                    className={`w-full px-3 py-2 text-left text-xs transition-colors ${
                      bgStyle === style
                        ? 'bg-slate-700/50 text-white'
                        : 'text-slate-400 hover:bg-slate-800/30 hover:text-slate-200'
                    }`}
                  >
                    {style === 'dots-mesh' && '✨ Dots + Mesh'}
                    {style === 'dots' && '• Dot Grid'}
                    {style === 'dots-fade' && '•• Radial Dots'}
                    {style === 'grid' && '# Grid Lines'}
                    {style === 'mesh' && '🌈 Mesh Gradient'}
                    {style === 'animated-mesh' && '🌊 Animated Mesh'}
                    {style === 'none' && '— Simple Gradient'}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main visualization area */}
      <div className="relative flex items-center justify-center" style={{ height: '480px' }}>

        {/* Chairman in center */}
        {mode !== 'compare' && chairmanModel && (
          <div
            className="absolute z-20 transition-all duration-700 ease-out cursor-pointer"
            style={{
              opacity: 1,
              transform: 'scale(1)',
            }}
            onClick={() => setExpanded(expanded === 'chairman' ? null : 'chairman')}
          >
            {/* Outer glow rings */}
            <div className="absolute inset-0 rounded-full animate-pulse" style={{
              background: `radial-gradient(circle, ${chairmanModel.color}20 0%, transparent 70%)`,
              transform: 'scale(2)',
              filter: 'blur(20px)'
            }} />

            {/* Main chairman card */}
            <div
              className="relative w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300"
              style={{
                background: 'rgba(15, 23, 42, 0.9)',
                backdropFilter: 'blur(16px)',
                border: `2px solid ${chairmanModel.color}60`,
                boxShadow: `0 0 40px ${chairmanModel.color}30, inset 0 1px 1px rgba(255,255,255,0.1)`
              }}
            >
              {/* Rotating ring */}
              <div
                className="absolute inset-[-4px] rounded-full"
                style={{
                  background: `conic-gradient(from 0deg, transparent, ${chairmanModel.color}60, transparent)`,
                  animation: 'spin 4s linear infinite'
                }}
              />
              <div className="absolute inset-[2px] rounded-full" style={{ background: 'rgba(15, 23, 42, 0.95)' }} />

              <div className="relative text-center z-10">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Chairman</div>
                <div className="text-sm font-semibold">{chairmanModel.name}</div>
                <div className="flex items-center justify-center gap-1 mt-1">
                  <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: chairmanModel.color }} />
                  <span className="text-[10px] text-slate-500">Synthesizing</span>
                </div>
              </div>
            </div>

            {/* Expanded synthesis */}
            {expanded === 'chairman' && (
              <div
                className="absolute top-full mt-4 left-1/2 -translate-x-1/2 w-80 p-4 rounded-xl z-30 transition-all duration-300"
                style={{
                  background: 'rgba(15, 23, 42, 0.95)',
                  backdropFilter: 'blur(16px)',
                  border: `1px solid ${chairmanModel.color}40`,
                  boxShadow: `0 20px 40px rgba(0,0,0,0.5), 0 0 30px ${chairmanModel.color}20`
                }}
              >
                <div className="text-xs text-slate-400 mb-2 uppercase tracking-wider">Synthesis</div>
                <p className="text-sm text-slate-300 leading-relaxed">{chairmanSynthesis}</p>
              </div>
            )}
          </div>
        )}

        {/* Model cards */}
        {selectedModels.map((model, index) => {
          const circlePos = getCirclePosition(index, selectedModels.length);
          const gridPos = getGridPosition(index);
          const isCircle = mode !== 'compare';
          const pos = isCircle ? circlePos : gridPos;
          const isSpeaking = speaking === model.id;
          const isExpanded = expanded === model.id;

          return (
            <div
              key={model.id}
              className="absolute transition-all duration-700 ease-out"
              style={{
                transform: `translate(${pos.x}px, ${pos.y}px)`,
                zIndex: isExpanded ? 30 : isSpeaking ? 10 : 1,
              }}
            >
              {/* Speaking glow effect */}
              {isSpeaking && isCircle && (
                <div
                  className="absolute inset-0 rounded-full animate-pulse"
                  style={{
                    background: `radial-gradient(circle, ${model.color}40 0%, transparent 70%)`,
                    transform: 'scale(2)',
                    filter: 'blur(15px)'
                  }}
                />
              )}

              {/* Card */}
              <div
                onClick={() => {
                  if (isCircle) {
                    setSpeaking(speaking === model.id ? null : model.id);
                    setExpanded(isExpanded ? null : model.id);
                  }
                }}
                className={`relative cursor-pointer transition-all duration-300 ease-out ${
                  isCircle ? 'w-24 h-24 rounded-full' : 'w-48 rounded-xl'
                }`}
                style={{
                  background: 'rgba(30, 41, 59, 0.6)',
                  backdropFilter: 'blur(12px)',
                  border: `1px solid ${isSpeaking ? model.color : 'rgba(71, 85, 105, 0.5)'}`,
                  boxShadow: isSpeaking
                    ? `0 0 30px ${model.color}40, inset 0 1px 1px rgba(255,255,255,0.1)`
                    : '0 4px 20px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.05)',
                  transform: isSpeaking ? 'scale(1.1)' : 'scale(1)',
                  willChange: 'transform',
                }}
                onMouseEnter={(e) => {
                  if (!isSpeaking && !isCircle) {
                    e.currentTarget.style.transform = 'scale(1.02)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSpeaking) {
                    e.currentTarget.style.transform = 'scale(1)';
                  }
                }}
              >
                {/* Grid mode content */}
                {!isCircle && (
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-slate-200">{model.name}</span>
                      <div className="w-2 h-2 rounded-full" style={{ background: model.color }} />
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">{model.response.slice(0, 100)}...</p>
                    <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-700/50">
                      <div className="text-[10px] text-slate-500"><span className="text-slate-400">IN</span> 4</div>
                      <div className="text-[10px] text-slate-500"><span className="text-slate-400">OUT</span> 128</div>
                      <div className="text-[10px] text-slate-500"><span className="text-slate-400">TIME</span> 1.2s</div>
                    </div>
                  </div>
                )}

                {/* Circle mode content */}
                {isCircle && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center px-2">
                      <div className="text-[10px] font-semibold text-slate-200 leading-tight">{model.name}</div>
                      {isSpeaking && (
                        <div className="flex items-center justify-center gap-1 mt-1">
                          <div className="w-1 h-1 rounded-full animate-bounce" style={{ background: model.color, animationDelay: '0ms' }} />
                          <div className="w-1 h-1 rounded-full animate-bounce" style={{ background: model.color, animationDelay: '150ms' }} />
                          <div className="w-1 h-1 rounded-full animate-bounce" style={{ background: model.color, animationDelay: '300ms' }} />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Expanded response panel */}
              {isExpanded && isCircle && (
                <div
                  className="absolute w-64 p-4 rounded-xl z-40 transition-all duration-300"
                  style={{
                    top: pos.y > 0 ? 'auto' : '100%',
                    bottom: pos.y > 0 ? '100%' : 'auto',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    marginTop: pos.y > 0 ? 0 : '12px',
                    marginBottom: pos.y > 0 ? '12px' : 0,
                    background: 'rgba(15, 23, 42, 0.95)',
                    backdropFilter: 'blur(16px)',
                    border: `1px solid ${model.color}40`,
                    boxShadow: `0 20px 40px rgba(0,0,0,0.5), 0 0 20px ${model.color}15`
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: model.color }} />
                    <span className="text-xs font-semibold text-slate-300">{model.name}</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{model.response}</p>
                  <div className="flex items-center gap-4 mt-3 pt-2 border-t border-slate-700/50">
                    <div className="text-[10px] text-slate-500"><span className="text-slate-400">OUT</span> 128</div>
                    <div className="text-[10px] text-slate-500"><span className="text-slate-400">TIME</span> 1.2s</div>
                  </div>
                </div>
              )}

              {/* Connection line to chairman */}
              {isSpeaking && isCircle && (
                <svg
                  className="absolute pointer-events-none"
                  style={{
                    width: '400px',
                    height: '400px',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: -1
                  }}
                >
                  <defs>
                    <linearGradient id={`grad-${model.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor={model.color} stopOpacity="0.8" />
                      <stop offset="100%" stopColor={model.color} stopOpacity="0.1" />
                    </linearGradient>
                  </defs>
                  <line
                    x1="200"
                    y1="200"
                    x2={200 - pos.x}
                    y2={200 - pos.y}
                    stroke={`url(#grad-${model.id})`}
                    strokeWidth="2"
                    strokeDasharray="6,4"
                    className="animate-pulse"
                  />
                </svg>
              )}
            </div>
          );
        })}

        {/* Connecting circle */}
        {mode !== 'compare' && (
          <svg
            className="absolute pointer-events-none transition-opacity duration-700"
            style={{
              width: '350px',
              height: '350px',
              opacity: 0.2
            }}
          >
            <circle
              cx="175"
              cy="175"
              r="155"
              fill="none"
              stroke="url(#circleGrad)"
              strokeWidth="1"
              strokeDasharray="8,4"
            />
            <defs>
              <linearGradient id="circleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="50%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#3b82f6" />
              </linearGradient>
            </defs>
          </svg>
        )}
      </div>

      {/* Chairman selector */}
      {mode !== 'compare' && (
        <div className="flex items-center justify-center gap-3 mt-2">
          <span className="text-xs text-slate-500">Chairman:</span>
          <select
            value={chairman}
            onChange={(e) => { setChairman(Number(e.target.value)); setExpanded(null); setSpeaking(null); }}
            className="text-xs px-3 py-1.5 rounded-lg transition-all"
            style={{
              background: 'rgba(30, 41, 59, 0.8)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(71, 85, 105, 0.5)',
              color: '#e2e8f0'
            }}
          >
            {models.filter(m => selected.includes(m.id)).map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Prompt input */}
      <div className="mt-6 max-w-2xl mx-auto">
        <div
          className="rounded-xl p-4 transition-all"
          style={{
            background: 'rgba(30, 41, 59, 0.6)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(71, 85, 105, 0.4)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
          }}
        >
          <input
            type="text"
            placeholder="Ask a question to compare model responses..."
            className="w-full bg-transparent text-slate-200 placeholder-slate-500 outline-none text-sm"
          />
        </div>
      </div>

      {/* Footer hint */}
      <div className="text-center mt-4 text-[10px] text-slate-600">
        {mode !== 'compare' ? "Click on models to expand their responses" : "Showing all model responses"}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .line-clamp-3 {
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}
