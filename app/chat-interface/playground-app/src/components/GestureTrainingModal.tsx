import { useState, useEffect, useCallback } from 'react';
import { X, ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react';

interface GestureTrainingModalProps {
  open: boolean;
  onClose: () => void;
}

// Sample gesture data structure
interface Gesture {
  id: string;
  name: string;
  description: string;
  tips: string[];
  sequence?: string[]; // For dynamic gestures
}

const gestures: Gesture[] = [
  {
    id: 'pointing_up',
    name: 'Pointing Up',
    description: 'Point at UI elements to hover and interact with mode switcher',
    tips: [
      'Keep other fingers curled in a fist position',
      'Keep your thumb tucked in',
      'Point at mode buttons to switch modes',
      'Use for navigation - not for sending messages'
    ]
  },
  {
    id: 'thumbs_up',
    name: 'Thumbs Up',
    description: 'Send 👍 emoji message (yes/approve/like)',
    tips: [
      'Make a fist with all fingers except your thumb',
      'Keep your index, middle, ring, and pinky fingers curled',
      'Point your thumb straight up',
      'Sends 👍 emoji to chat'
    ]
  },
  {
    id: 'thumbs_down',
    name: 'Thumbs Down',
    description: 'Send 👎 emoji message (no/disapprove/dislike)',
    tips: [
      'Make a fist with all fingers except your thumb',
      'Keep your index, middle, ring, and pinky fingers curled',
      'Point your thumb straight down',
      'Sends 👎 emoji to chat'
    ]
  },
  {
    id: 'open_palm',
    name: 'Open Palm',
    description: 'Send 👋 message (hi/hello/greeting)',
    tips: [
      'Keep all fingers extended straight',
      'Keep your palm facing forward',
      'Keep fingers together but not touching',
      'Sends 👋 to chat'
    ]
  },
  {
    id: 'victory',
    name: 'Victory/Peace Sign',
    description: 'Send "ok" message (okay/continue/proceed)',
    tips: [
      'Extend your index and middle fingers in a V shape',
      'Keep ring and pinky fingers curled down',
      'Keep your palm facing forward',
      'Sends "ok" to chat'
    ]
  },
  {
    id: 'iloveyou',
    name: 'I Love You',
    description: 'Send "thanks" message (thank you/appreciate)',
    tips: [
      'Extend your thumb, index, and pinky fingers',
      'Keep middle and ring fingers curled down',
      'This is the ASL sign for "I Love You"',
      'Sends "thanks" to chat'
    ]
  },
  {
    id: 'fist',
    name: 'Closed Fist',
    description: 'Send "stop" message (stop/wait/hold)',
    tips: [
      'Bend all fingers at the knuckles',
      'Press fingertips against the palm',
      'Keep thumb across the front of your fist',
      'Sends "stop" to chat'
    ]
  }
];

const ASL_GESTURES: Gesture[] = [
  {
    id: 'asl_a',
    name: 'ASL Letter A',
    description: 'Make a fist with thumb tucked beside index finger',
    tips: [
      'Make a fist with all fingers curled',
      'Place your thumb over your fingers (not sticking out)',
      'Keep palm facing forward'
    ]
  },
  {
    id: 'asl_b',
    name: 'ASL Letter B',
    description: 'Extend all fingers with thumb beside index finger',
    tips: [
      'Extend all four fingers (index, middle, ring, pinky)',
      'Place your thumb beside your index finger',
      'Keep all fingers straight and together'
    ]
  },
  {
    id: 'asl_o',
    name: 'ASL Letter O',
    description: 'Make a circle with thumb and index finger',
    tips: [
      'Touch the tip of your thumb and index finger together',
      'Keep middle, ring, and pinky fingers curled',
      'Form a circle shape with thumb and index finger'
    ]
  }
];

export default function GestureTrainingModal({ open, onClose }: GestureTrainingModalProps) {
  const [currentGestureIndex, setCurrentGestureIndex] = useState(0);
  const [mode, setMode] = useState<'navigation' | 'asl'>('navigation');
  const [showTips, setShowTips] = useState(false);

  const currentGestures = mode === 'navigation' ? gestures : ASL_GESTURES;
  const currentGesture = currentGestures[currentGestureIndex];

  const nextGesture = useCallback(() => {
    if (currentGestureIndex < currentGestures.length - 1) {
      setCurrentGestureIndex(prev => prev + 1);
    }
  }, [currentGestureIndex, currentGestures.length]);

  const prevGesture = useCallback(() => {
    if (currentGestureIndex > 0) {
      setCurrentGestureIndex(prev => prev - 1);
    }
  }, [currentGestureIndex]);

  const resetTraining = useCallback(() => {
    setCurrentGestureIndex(0);
  }, []);

  useEffect(() => {
    if (!open) {
      // Reset when modal closes
      setCurrentGestureIndex(0);
      setMode('navigation');
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      <div className="relative bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Gesture Training Mode</h2>
            <p className="text-sm text-slate-400">
              Learn and practice gestures for navigation and ASL
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Mode Tabs - Fixed positioning */}
        <div className="px-5 py-3 border-b border-slate-800 bg-slate-900/90 z-10">
          <div className="flex gap-2">
            <button
              onClick={() => setMode('navigation')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === 'navigation'
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'text-slate-400 hover:bg-slate-800/50'
              }`}
            >
              Navigation Gestures
            </button>
            <button
              onClick={() => setMode('asl')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === 'asl'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-400 hover:bg-slate-800/50'
              }`}
            >
              ASL Letters
            </button>
          </div>
        </div>

        {/* Gesture Content - Scrollable area */}
        <div className="flex-1 overflow-y-auto max-h-[60vh] p-5">
          {/* Progress */}
          <div className="mb-6">
            <div className="flex justify-between text-sm text-slate-400 mb-1">
              <span>Gesture {currentGestureIndex + 1} of {currentGestures.length}</span>
              <span>{currentGesture.name}</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${((currentGestureIndex + 1) / currentGestures.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Gesture Diagram/Illustration Placeholder */}
          <div className="flex flex-col items-center mb-6">
            <div className="w-48 h-48 rounded-xl bg-slate-800/50 border border-slate-700 flex items-center justify-center mb-4">
              <div className="text-center">
                <div className="text-4xl mb-2">👋</div>
                <p className="text-slate-400 text-sm">Gesture Visualization</p>
              </div>
            </div>
            <h3 className="text-xl font-medium text-slate-200 mb-2">{currentGesture.name}</h3>
            <p className="text-slate-400 text-center max-w-md">{currentGesture.description}</p>
          </div>

          {/* Tips */}
          <div className="mb-6">
            <button
              onClick={() => setShowTips(!showTips)}
              className="flex items-center gap-2 text-slate-300 hover:text-slate-100 transition-colors mb-3"
            >
              <span className="font-medium">Tips for success</span>
              <svg
                className={`w-4 h-4 transition-transform ${showTips ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showTips && (
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 mb-4">
                <ul className="space-y-2">
                  {currentGesture.tips.map((tip, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-slate-300">
                      <span className="text-blue-400 mt-1">•</span>
                      <span className="text-sm">{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Practice Area */}
          <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700">
            <h4 className="font-medium text-slate-200 mb-3">Practice Area</h4>
            <div className="text-center py-8 border-2 border-dashed border-slate-700 rounded-lg bg-slate-900/50">
              <p className="text-slate-500 mb-2">Show your gesture here</p>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 rounded-lg">
                <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm text-slate-300">Camera active</span>
              </div>
            </div>
            <div className="mt-3 text-center text-sm text-slate-500">
              Align your hand within the practice area
            </div>
          </div>
        </div>

        {/* Footer Controls - Fixed at bottom */}
        <div className="p-5 border-t border-slate-800 bg-slate-900/90 flex justify-between">
          <div className="flex gap-2">
            <button
              onClick={resetTraining}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors"
            >
              <RotateCcw size={16} />
              <span className="text-sm">Reset</span>
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={prevGesture}
              disabled={currentGestureIndex === 0}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                currentGestureIndex === 0
                  ? 'text-slate-600 cursor-not-allowed'
                  : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/50'
              }`}
            >
              <ArrowLeft size={16} />
              <span className="text-sm">Previous</span>
            </button>

            <button
              onClick={nextGesture}
              disabled={currentGestureIndex === currentGestures.length - 1}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                currentGestureIndex === currentGestures.length - 1
                  ? 'text-slate-600 cursor-not-allowed'
                  : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/50'
              }`}
            >
              <span className="text-sm">Next</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}