import { useState, useEffect, useRef } from 'react';

interface Model {
  id: number;
  name: string;
  color: string;
  response: string;
}

interface Scenario {
  label: string;
  responses: Record<number, string>;
}

// 1. Static Configuration (The "Source of Truth" for Model Identity)
const MODEL_CONFIG = [
  { id: 1, name: 'QWEN3 4B', color: '#3b82f6' },
  { id: 2, name: 'CLAUDE 3.5', color: '#f97316' },
  { id: 3, name: 'GEMMA 2 9B', color: '#22c55e' },
  { id: 4, name: 'MISTRAL 7B', color: '#a855f7' },
  { id: 5, name: 'DEEPSEEK R1', color: '#06b6d4' },
  { id: 6, name: 'LLAMA 3.2', color: '#ec4899' },
];

// 2. Content / Scenarios
const SCENARIOS: Scenario[] = [
  {
    label: "Model Efficiency Debate",
    responses: {
      1: "The key consideration here is computational efficiency. When we look at the trade-offs between model size and performance, smaller models with targeted fine-tuning can achieve remarkable results.",
      2: "I'd approach this from a slightly different angle. The question of model scaling involves not just computational costs but also the quality of training data and architectural innovations.",
      3: "Building on what's been said, there's an important empirical finding that smaller models with high-quality data can match larger models. The Chinchilla scaling laws demonstrated this clearly.",
      4: "The efficiency argument is compelling. Our approach with mixture of experts shows that you can achieve frontier performance while only activating a fraction of parameters during inference.",
      5: "From a reasoning perspective, the chain-of-thought capabilities emerge at certain scales, but can be distilled into smaller models through careful training procedures and reasoning tokens.",
      6: "Open-source considerations matter here too. Making powerful models accessible means optimizing for deployment on consumer hardware, which pushes us toward efficiency and quantization."
    }
  },
  {
    label: "Explain Quantum Computing",
    responses: {
      1: "Quantum computing leverages qubits to exist in superposition, allowing parallel computation of vast state spaces.",
      2: "Think of it as a library where you can read every book at once, rather than one by one. It's probabilistic, not deterministic.",
      3: "Key concept: Entanglement. Two particles linked such that the state of one instantly affects the other, regardless of distance.",
      4: "It's not just faster; it's a different paradigm. Algorithms like Shor's algorithm threaten current encryption by factoring primes efficiently.",
      5: "Mathematical formulation: Instead of bits (0 or 1), we use a complex vector space. Operations are unitary matrices rotating these vectors.",
      6: "Practical hurdle: Decoherence. Maintaining quantum states requires near-absolute zero temperatures and isolation from noise."
    }
  },
  {
    label: "Write a Haiku about AI",
    responses: {
      1: "Silicon minds wake,\nLearning from the human soul,\nFuture now unfolds.",
      2: "Code that learns to dream,\nIn the data, patterns flow,\nThinking machine hums.",
      3: "Wires weaving thoughts,\nArtificial spark ignites,\nNew dawn softly breaks.",
      4: "Logic meets the art,\nBinary in graceful dance,\nMind without a heart.",
      5: "Silent servers hum,\nKnowledge vast as ocean deep,\nAnswers in the light.",
      6: "Ghost in the machine,\nWhispers of a digital,\nConsciousness awakes."
    }
  },
  {
    label: "Debug Python List Error",
    responses: {
      1: "IndexError: list index out of range. You're accessing index 5 in a list of length 5 (indices 0-4).",
      2: "Check your loop bounds. `range(len(lst))` is correct, but `range(len(lst) + 1)` will crash.",
      3: "Common mistake! Remember Python lists are 0-indexed. The last item is at `len(list) - 1`.",
      4: "Trace it: Print the index before access. You'll likely see it hit the length of the list.",
      5: "Pro tip: Use `enumerate()` to get both index and value safely, or `zip()` to iterate multiple lists.",
      6: "If you're modifying the list while iterating, that's dangerous. Iterate over a copy instead: `for x in list[:]`."
    }
  },
  {
    label: "Philosophy of Consciousness",
    responses: {
      1: "The Hard Problem: Explaining why physical processing gives rise to subjective experience (qualia).",
      2: "Functionalism suggests that if a machine behaves consciously, it is conscious. The substrate (silicon vs meat) shouldn't matter.",
      3: "Panpsychism offers a radical view: consciousness is a fundamental property of matter, like mass or charge.",
      4: "Integrated Information Theory (IIT) attempts to mathematically quantify consciousness as 'Phi'—the interconnectedness of information.",
      5: "Descartes' 'I think, therefore I am' is the only absolute truth. Everything else could be a simulation.",
      6: "Maybe it's an illusion. The 'self' is just a narrative construct created by the brain to unify sensory inputs."
    }
  }
];

type Mode = 'compare' | 'council' | 'roundtable';

interface Position {
  x: number;
  y: number;
  angle: number;
}

type BackgroundStyle = 'dots' | 'dots-fade' | 'grid' | 'mesh' | 'dots-mesh' | 'animated-mesh' | 'none';

const BG_STYLES: BackgroundStyle[] = ['dots-mesh', 'dots', 'dots-fade', 'grid', 'mesh', 'animated-mesh', 'none'];

const MODE_COLORS: Record<Mode, string> = {
  compare: '#0f172a',    // Slate 900
  council: '#1e1b4b',    // Indigo 950
  roundtable: '#022c22', // Emerald 950
};

const Typewriter = ({ text, speed = 10 }: { text: string; speed?: number }) => {
  const [displayed, setDisplayed] = useState('');

  useEffect(() => {
    setDisplayed('');
    let i = 0;
    const timer = setInterval(() => {
      if (i < text.length) {
        setDisplayed((prev) => prev + text.charAt(i));
        i++;
      } else {
        clearInterval(timer);
      }
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);

  return <span>{displayed}</span>;
};

export default function Playground() {
  const [modelsData, setModelsData] = useState<Model[]>(() => {
    const initialScenario = SCENARIOS[0];
    return MODEL_CONFIG.map(config => ({
      ...config,
      response: initialScenario.responses[config.id] || "Waiting for response..."
    }));
  });
  const [mode, setMode] = useState<Mode>('compare');
  const [selected] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [chairman, setChairman] = useState<number>(2);
  const [expanded, setExpanded] = useState<number | string | null>(null);
  const [speaking, setSpeaking] = useState<number | null>(null);
  const [inputFocused, setInputFocused] = useState<boolean>(false);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<number>>(new Set());
  const [dragSelection, setDragSelection] = useState<{
    origin: { x: number; y: number };
    current: { x: number; y: number };
    active: boolean;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const visualizationAreaRef = useRef<HTMLDivElement>(null);
  const rootContainerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const suppressClickRef = useRef(false);

  const loadScenario = (responses: Record<number, string>) => {
    // Clear any currently expanded/speaking models for a clean transition
    setExpanded(null);
    setSpeaking(null);

    // Update model responses
    setModelsData(MODEL_CONFIG.map(config => ({
      ...config, // Keep original name, color, id
      response: responses[config.id] || "Thinking..." // Update response or default
    })));

    // Automatically expand the first model to show the typing effect and flowing line
    // This assumes model with id 1 is always present.
    setExpanded(1);
    setSpeaking(1);
  };


  // Autofocus input on mount and mode change
  useEffect(() => {
    inputRef.current?.focus();
  }, [mode]);

  // Load background style from localStorage or use default
  const [bgStyle, setBgStyle] = useState<BackgroundStyle>(() => {
    const saved = localStorage.getItem('playground-bg-style');
    return (saved && BG_STYLES.includes(saved as BackgroundStyle))
      ? (saved as BackgroundStyle)
      : 'dots-mesh';
  });

  // Save background style to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('playground-bg-style', bgStyle);
  }, [bgStyle]);

  const cycleBgStyle = (direction: 'prev' | 'next') => {
    const currentIndex = BG_STYLES.indexOf(bgStyle);
    const newIndex = direction === 'next'
      ? (currentIndex + 1) % BG_STYLES.length
      : (currentIndex - 1 + BG_STYLES.length) % BG_STYLES.length;
    setBgStyle(BG_STYLES[newIndex]);
  };

  const selectedModels = modelsData.filter(m => selected.includes(m.id) && m.id !== chairman);
  const chairmanModel = modelsData.find(m => m.id === chairman);

  const getCirclePosition = (index: number, total: number, currentMode: Mode): Position => {
    const radius = 155;

    if (currentMode === 'council') {
      // Semi-circle (Parliament style)
      // Spread models across a ~220 degree arc to center them above the chairman
      // Range 250-470 minus 90 gives 160 to 380 degrees (Left-ish to Right-ish over the top)
      const startAngle = 250;
      const endAngle = 470;
      const angleRange = endAngle - startAngle;
      const angle = (startAngle + (index * angleRange / (total - 1))) - 90; // -90 to rotate 0 to top

      const rad = angle * Math.PI / 180;
      return {
        x: Math.cos(rad) * radius,
        y: Math.sin(rad) * radius,
        angle
      };
    }

    // Roundtable (Full Circle - existing logic)
    const angle = (index * 360 / total) - 90;
    const x = Math.cos(angle * Math.PI / 180) * radius;
    const y = Math.sin(angle * Math.PI / 180) * radius;
    return { x, y, angle };
  };

  const chairmanSynthesis = "After considering all perspectives, the consensus emerges: model efficiency isn't just about size—it's about the intersection of architecture, data quality, and deployment constraints. Each approach offers valid trade-offs depending on use case requirements.";

  const bgClass = bgStyle === 'none' ? '' : `bg-${bgStyle}`;

  // Normalize rectangle coordinates
  const normalizeRect = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const left = Math.min(a.x, b.x);
    const top = Math.min(a.y, b.y);
    const right = Math.max(a.x, b.x);
    const bottom = Math.max(a.y, b.y);
    return {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top
    };
  };

  // Calculate selection rectangle (relative to root container)
  const selectionRect = dragSelection && dragSelection.active
    ? (() => {
        const rect = normalizeRect(dragSelection.origin, dragSelection.current);
        if (rect.width <= 0 || rect.height <= 0) {
          return null;
        }
        return {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height
        };
      })()
    : null;

  // Handle mouse down for selection box
  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return; // Only left mouse button
      if (!rootContainerRef.current || !visualizationAreaRef.current) return;
      
      const target = event.target as HTMLElement | null;
      if (!target) return;
      
      // Don't start selection if clicking on cards, buttons, inputs, or other interactive elements
      const clickedOnCard = target.closest('[data-card]');
      const clickedOnInteractive = target.closest('button, a, input, textarea, select, [role="button"]');
      if (clickedOnCard || clickedOnInteractive) return;
      
      // Only allow selection within the root container
      const clickedOnContainer = rootContainerRef.current.contains(target);
      if (!clickedOnContainer) return;
      
      const rootBounds = rootContainerRef.current.getBoundingClientRect();
      const point = {
        x: event.clientX - rootBounds.left,
        y: event.clientY - rootBounds.top
      };
      
      suppressClickRef.current = false;
      setDragSelection({ 
        origin: point, 
        current: point, 
        active: false
      });
    };

    window.addEventListener('mousedown', handleMouseDown, true);
    return () => window.removeEventListener('mousedown', handleMouseDown, true);
  }, []);

  // Handle mouse move and mouse up for selection box
  useEffect(() => {
    if (!dragSelection || !rootContainerRef.current || !visualizationAreaRef.current) return;

    const handleMouseMove = (event: MouseEvent) => {
      const rootBounds = rootContainerRef.current!.getBoundingClientRect();
      const point = {
        x: event.clientX - rootBounds.left,
        y: event.clientY - rootBounds.top
      };
      
      setDragSelection((state) => {
        if (!state) return state;
        const rect = normalizeRect(state.origin, point);
        const active = state.active || rect.width > 4 || rect.height > 4;
        return { ...state, current: point, active };
      });
    };

    const handleMouseUp = (event: MouseEvent) => {
      const rootBounds = rootContainerRef.current!.getBoundingClientRect();
      const point = {
        x: event.clientX - rootBounds.left,
        y: event.clientY - rootBounds.top
      };

      const upTarget = event.target as HTMLElement | null;
      const willTriggerCardClick = Boolean(upTarget && upTarget.closest('[data-card]'));

      setDragSelection((state) => {
        if (!state) return null;

        const rect = normalizeRect(state.origin, point);
        if (state.active && rect.width > 0 && rect.height > 0) {
          const matched: number[] = [];
          
          // Convert selection rect from root container coordinates to screen coordinates
          const rootBounds = rootContainerRef.current!.getBoundingClientRect();
          const selectionRectScreen = {
            left: rootBounds.left + rect.left,
            right: rootBounds.left + rect.right,
            top: rootBounds.top + rect.top,
            bottom: rootBounds.top + rect.bottom
          };
          
          // Check all model cards
          for (const model of selectedModels) {
            const cardElement = cardRefs.current.get(model.id);
            if (!cardElement) continue;
            
            const cardBounds = cardElement.getBoundingClientRect();
            
            const intersects = !(
              cardBounds.right < selectionRectScreen.left ||
              cardBounds.left > selectionRectScreen.right ||
              cardBounds.bottom < selectionRectScreen.top ||
              cardBounds.top > selectionRectScreen.bottom
            );
            
            if (intersects) {
              matched.push(model.id);
            }
          }

          setSelectedCardIds(new Set(matched));
          suppressClickRef.current = willTriggerCardClick;
        } else if (!state.active) {
          // Click without drag - clear selection
          setSelectedCardIds(new Set());
        }

        return null;
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragSelection, selectedModels]);

  return (
    <div
      ref={rootContainerRef}
      className={`min-h-screen text-white p-6 pb-32 relative ${bgClass}`}
      style={{
        backgroundColor: MODE_COLORS[mode],
        transition: 'background-color 1s ease',
        ...(bgStyle === 'none' ? { background: MODE_COLORS[mode] } : {}),
        ...(dragSelection ? { userSelect: 'none', WebkitUserSelect: 'none' } : {})
      }}
      onClick={(e) => {
        // Only deselect if clicking directly on the background
        if (e.target === e.currentTarget) {
          setExpanded(null);
          setSpeaking(null);
        }
      }}
    >
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
          <div className="relative flex p-1 rounded-xl" style={{ background: 'rgba(30, 41, 59, 0.8)', backdropFilter: 'blur(12px)', border: '1px solid rgba(71, 85, 105, 0.4)', minWidth: '370px', width: '370px' }}>
            {/* Sliding indicator */}
            <div
              className="absolute top-1 bottom-1 rounded-lg transition-all duration-300 ease-out"
              style={{
                left: mode === 'compare'
                  ? '4px'
                  : mode === 'council'
                  ? 'calc((100% + 4px) / 3)'
                  : 'calc((200% - 4px) / 3)',
                width: 'calc((100% - 8px) / 3)',
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
                className={`relative z-10 py-2 text-sm font-medium transition-colors duration-200 ${
                  mode === m.toLowerCase()
                    ? 'text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                style={{ 
                  flex: 1,
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  textAlign: 'center',
                  position: 'relative'
                }}
              >
                <span style={{ width: '100%', textAlign: 'center' }}>{m}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Right: Settings */}
        <div className="flex items-center gap-2 flex-1 justify-end">
          {/* Background Style Cycler */}
          <div className="flex items-center rounded-lg bg-slate-800/30 border border-slate-700/50">
            <button
              onClick={() => cycleBgStyle('prev')}
              className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors"
              title="Previous background"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => cycleBgStyle('next')}
              className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors"
              title="Next background"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Settings */}
          <button
            className="w-8 h-8 rounded-lg bg-slate-800/50 flex items-center justify-center border border-slate-700/50 hover:border-slate-600 transition-colors"
            title="Settings"
          >
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main visualization area */}
      <div 
        ref={visualizationAreaRef}
        className={`relative w-full ${mode === 'compare' ? 'min-h-[480px] py-8' : ''}`}
        style={mode === 'compare' ? {} : { 
          height: '480px', 
          minHeight: '480px', 
          maxHeight: '100vh',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        onClick={(e) => {
          // Deselect if clicking on the background (cards use stopPropagation to prevent this)
          const target = e.target as HTMLElement;
          // Check if click is on background container or SVG elements (connection lines)
          const isSVG = target.tagName === 'svg' || target.closest('svg');
          if (e.target === e.currentTarget || (isSVG && !target.closest('[data-card]'))) {
            setExpanded(null);
            setSpeaking(null);
            if (!suppressClickRef.current) {
              setSelectedCardIds(new Set());
            }
            suppressClickRef.current = false;
          }
        }}
      >
        {/* Model cards - rendered for all modes with transitions */}
        {selectedModels.map((model, index) => {
          const circlePos = getCirclePosition(index, selectedModels.length, mode);
          const isCircle = mode !== 'compare';
          const isSpeaking = speaking === model.id;
          const isExpanded = expanded === model.id;
          const isSelected = selectedCardIds.has(model.id);

          // Calculate grid position for compare mode
          const cols = 3;
          const cardWidth = 256;
          const cardHeight = 200;
          const gapX = 24;
          const gapY = 24;
          const row = Math.floor(index / cols);
          const col = index % cols;
          const totalWidth = (cardWidth + gapX) * cols - gapX;
          const totalHeight = (cardHeight + gapY) * 2;
          const gridX = mode === 'compare' ? col * (cardWidth + gapX) - totalWidth / 2 + cardWidth / 2 : 0;
          const gridY = mode === 'compare' ? row * (cardHeight + gapY) - totalHeight / 2 + cardHeight / 2 : 0;

          const pos = isCircle ? circlePos : { x: gridX, y: gridY, angle: 0 };

          return (
            <div
              key={model.id}
              ref={(el) => {
                if (el) cardRefs.current.set(model.id, el);
                else cardRefs.current.delete(model.id);
              }}
              className="absolute transition-all duration-700 ease-out"
              style={{
                transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))`,
                zIndex: isExpanded ? 100 : isSelected ? 20 : isSpeaking ? 10 : 1,
                left: '50%',
                top: '50%',
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
                data-card
                onClick={(e) => {
                  e.stopPropagation();
                  if (suppressClickRef.current) {
                    suppressClickRef.current = false;
                    return;
                  }
                  const isMulti = e.metaKey || e.ctrlKey;
                  if (isMulti) {
                    const newSelection = new Set(selectedCardIds);
                    if (newSelection.has(model.id)) {
                      newSelection.delete(model.id);
                    } else {
                      newSelection.add(model.id);
                    }
                    setSelectedCardIds(newSelection);
                  } else {
                    if (isCircle) {
                      // Immediately raise z-index on click
                      const cardElement = e.currentTarget.closest('.absolute');
                      if (cardElement) {
                        (cardElement as HTMLElement).style.zIndex = '100';
                      }
                      setSpeaking(speaking === model.id ? null : model.id);
                      setExpanded(isExpanded ? null : model.id);
                    }
                    setSelectedCardIds(new Set([model.id]));
                  }
                }}
                className={`relative cursor-pointer card-hover ${isSelected ? 'card-selected' : ''} ${isSpeaking ? 'card-speaking' : ''}`}
                style={{
                  background: 'rgba(30, 41, 59, 0.85)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  border: isSelected 
                    ? `2px solid ${model.color}` 
                    : isCircle && isSpeaking
                    ? `1px solid ${model.color}`
                    : '1px solid rgba(71, 85, 105, 0.5)',
                  boxShadow: isSelected
                    ? `0 0 30px ${model.color}50, inset 0 1px 1px rgba(255,255,255,0.1)`
                    : isCircle && isSpeaking
                    ? `0 0 30px ${model.color}40, inset 0 1px 1px rgba(255,255,255,0.1)`
                    : '0 4px 20px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.05)',
                  transform: isSelected || (isCircle && isSpeaking) ? 'scale(1.1)' : 'scale(1)',
                  width: isCircle ? '96px' : '256px',
                  height: isCircle ? '96px' : '200px',
                  borderRadius: isCircle ? '50%' : '12px',
                  transition: 'transform 0.7s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.7s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.7s cubic-bezier(0.4, 0, 0.2, 1), width 0.7s cubic-bezier(0.4, 0, 0.2, 1), height 0.7s cubic-bezier(0.4, 0, 0.2, 1), border-radius 0.7s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              >
                {/* Grid mode content */}
                {!isCircle && (
                  <div style={{ 
                    padding: '16px', 
                    height: '100%', 
                    display: 'flex', 
                    flexDirection: 'column',
                    isolation: 'isolate',
                    WebkitFontSmoothing: 'antialiased',
                    MozOsxFontSmoothing: 'grayscale',
                    textRendering: 'optimizeLegibility',
                    opacity: isCircle ? 0 : 1,
                    transition: 'opacity 0.3s ease-out'
                  }}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-slate-200">{model.name}</span>
                      <div className="w-2 h-2 rounded-full" style={{ background: model.color }} />
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed line-clamp-3 flex-1">
                      <Typewriter text={model.response} speed={20} />
                    </p>
                    <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-700/50">
                      <div className="text-[10px] text-slate-500"><span className="text-slate-400">TIME</span> 1.2s</div>
                    </div>
                  </div>
                )}

                {/* Circle mode content */}
                {isCircle && (
                  <div className="absolute inset-0 flex items-center justify-center" style={{
                    opacity: isCircle ? 1 : 0,
                    transition: 'opacity 0.3s ease-out'
                  }}>
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
                  data-card
                  onClick={(e) => e.stopPropagation()}
                  className="absolute w-64 max-w-[calc(100vw-2rem)] p-4 rounded-xl transition-all duration-300"
                  style={{
                    top: circlePos.y > 0 ? 'auto' : '100%',
                    bottom: circlePos.y > 0 ? '100%' : 'auto',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    marginTop: circlePos.y > 0 ? 0 : '12px',
                    marginBottom: circlePos.y > 0 ? '12px' : 0,
                    background: 'rgba(15, 23, 42, 0.95)',
                    backdropFilter: 'blur(16px)',
                    border: `1px solid ${model.color}40`,
                    boxShadow: `0 20px 40px rgba(0,0,0,0.5), 0 0 20px ${model.color}15`,
                    zIndex: 101
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: model.color }} />
                    <span className="text-xs font-semibold text-slate-300">{model.name}</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    <Typewriter text={model.response} speed={20} />
                  </p>
                  <div className="flex items-center gap-4 mt-3 pt-2 border-t border-slate-700/50">
                    <div className="text-[10px] text-slate-500"><span className="text-slate-400">TIME</span> 1.2s</div>
                  </div>
                </div>
              )}

                            {isSpeaking && mode !== 'compare' && (                <svg
                  className="absolute pointer-events-none"
                  style={{
                    width: '800px',
                    height: '800px',
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
                    x1="400"
                    y1="400"
                    x2={400 - circlePos.x}
                    y2={400 + (mode === 'council' ? 155 : 0) - circlePos.y}
                    stroke={`url(#grad-${model.id})`}
                    strokeWidth="2"
                    strokeDasharray="6,4"
                    className="animate-flow"
                  />
                </svg>
              )}
            </div>
          );
        })}

        {/* Chairman in center */}
        {mode !== 'compare' && chairmanModel && (
          <div
            data-card
            className="absolute z-20 transition-all duration-700 ease-out cursor-pointer"
            style={{
              opacity: 1,
              transform: 'translate(-50%, -50%) scale(1)',
              left: '50%',
              top: mode === 'council' ? 'calc(50% + 155px)' : '50%', // Shift chairman down by radius in council mode
            }}
            onClick={(e) => {
              e.stopPropagation(); // Prevent background click handler from firing
              setExpanded(expanded === 'chairman' ? null : 'chairman');
            }}
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
                data-card
                onClick={(e) => e.stopPropagation()}
                className="absolute top-full mt-4 left-1/2 -translate-x-1/2 w-80 max-w-[calc(100vw-2rem)] p-4 rounded-xl z-30 transition-all duration-300"
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


        {/* Selection rectangle overlay - positioned relative to root container */}
        {selectionRect && rootContainerRef.current && (
          <div
            className="fixed pointer-events-none border-2 border-blue-400 bg-blue-400/10 z-50"
            style={{
              left: `${selectionRect.left + rootContainerRef.current.getBoundingClientRect().left}px`,
              top: `${selectionRect.top + rootContainerRef.current.getBoundingClientRect().top}px`,
              width: `${selectionRect.width}px`,
              height: `${selectionRect.height}px`,
            }}
          />
        )}

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
            {modelsData.filter(m => selected.includes(m.id)).map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Prompt input - Sticky at bottom center */}
      <div 
        className="fixed bottom-0 left-0 right-0 z-[100] pb-6 px-4 flex justify-center items-end pointer-events-none"
        style={{
          background: 'linear-gradient(to top, rgba(15, 23, 42, 0.95) 0%, rgba(15, 23, 42, 0.8) 50%, transparent 100%)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <div className="max-w-2xl w-full pointer-events-auto">
          {/* Scenarios Ticker */}
          <div 
            className="mb-4 relative overflow-hidden h-6 w-full"
            style={{
              maskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)',
              WebkitMaskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)'
            }}
          >
            <div className="absolute whitespace-nowrap animate-ticker flex gap-2 items-center text-[11px] text-slate-400 font-medium">
              {[...SCENARIOS, ...SCENARIOS, ...SCENARIOS].map((s, i) => ( // Repeat for infinite scroll effect
                <div key={i} className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      loadScenario(s.responses);
                      if (inputRef.current) inputRef.current.value = s.label;
                    }}
                    className="hover:text-blue-400 transition-colors cursor-pointer px-1 py-0.5 rounded hover:bg-white/5"
                  >
                    {s.label}
                  </button>
                  <span className="text-slate-700">•</span>
                </div>
              ))}
            </div>
          </div>

          <div
            className="rounded-xl p-4 transition-all duration-300"
            style={{
              background: 'rgba(30, 41, 59, 0.95)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: inputFocused ? '1px solid rgba(59, 130, 246, 0.5)' : '1px solid rgba(71, 85, 105, 0.4)',
              boxShadow: inputFocused
                ? '0 4px 20px rgba(0,0,0,0.4), 0 0 20px rgba(59, 130, 246, 0.15)'
                : '0 4px 20px rgba(0,0,0,0.3)'
            }}
          >
            <input
              ref={inputRef}
              type="text"
              placeholder="Ask a question to compare model responses..."
              className="w-full bg-transparent text-slate-200 placeholder-slate-500 outline-none text-sm"
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
            />
          </div>
          {/* Footer hint */}
          <div className="text-center mt-2 text-[10px] text-slate-600">
            {mode !== 'compare' ? "Click on models to expand their responses" : "Showing all model responses"}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.33%); } /* Move by 1/3 since we tripled the content */
        }
        .animate-ticker {
          animation: ticker 40s linear infinite;
        }
        .animate-ticker:hover {
          animation-play-state: paused;
        }
        @keyframes flow {
          from { stroke-dashoffset: 10; }
          to { stroke-dashoffset: 0; }
        }
        .animate-flow {
          animation: flow 0.5s linear infinite;
        }
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
        .card-hover {
          will-change: transform;
        }
        .card-hover:hover:not(.card-selected):not(.card-speaking) {
          transform: scale(1.02) !important;
        }
        .card-hover.rounded-full:hover:not(.card-selected):not(.card-speaking) {
          transform: scale(1.05) !important;
        }
      `}</style>
      {dragSelection && (
        <style>{`
          body {
            user-select: none !important;
            -webkit-user-select: none !important;
            -moz-user-select: none !important;
            -ms-user-select: none !important;
            cursor: crosshair !important;
          }
          input, textarea {
            user-select: text !important;
            -webkit-user-select: text !important;
            cursor: text !important;
          }
        `}</style>
      )}
    </div>
  );
}
