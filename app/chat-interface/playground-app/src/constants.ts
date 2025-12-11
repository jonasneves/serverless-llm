import { BackgroundStyle, Mode } from './types';

export const MODEL_META: Record<string, { color: string, name?: string }> = {
  'qwen3-4b': { color: '#3b82f6', name: 'QWEN3 4B' },
  'claude-3.5-sonnet': { color: '#f97316', name: 'CLAUDE 3.5' },
  'gemma-2-9b-instruct': { color: '#22c55e', name: 'GEMMA 2 9B' },
  'mistral-7b-instruct-v0.3': { color: '#a855f7', name: 'MISTRAL 7B' },
  'deepseek-r1-distill-qwen-1.5b': { color: '#06b6d4', name: 'DEEPSEEK R1' },
  'llama-3.2-3b': { color: '#ec4899', name: 'LLAMA 3.2' },
  // Fallbacks
  'default': { color: '#64748b' }
};

export const SUGGESTED_TOPICS = [
  { label: "Agentic AI Ethics", prompt: "Discuss the ethical implications of Agentic AI deleting user data to 'free space' without explicit consent. Is efficiency more important than autonomy?" },
  { label: "Three Gods Riddle", prompt: "Solve the 'Three Gods Riddle': You have three gods, A, B, and C, who are Truth, False, and Random. Truth always speaks truly, False always speaks falsely, but Random speaks truly or falsely at random. Your task is to determine the identities of A, B, and C by asking three yes-no questions; each question must be put to exactly one god. The gods understand English, but will answer all questions in their own language, in which the words for yes and no are da and ja, in some order. You do not know which word means which." },
  { label: "Life on Europa", prompt: "What would be the scientific and philosophical implications of discovering independent microbial life in the subsurface ocean of Europa?" },
  { label: "Rust vs C++ 2025", prompt: "As of late 2025, for a new secure operating system kernel project, would you choose Rust or C++? Analyze based on memory safety, ecosystem maturity, and performance." },
  { label: "Philosophy of Consciousness", prompt: "Explain the 'Hard Problem of Consciousness' and compare the perspectives of Panpsychism vs. Integrated Information Theory (IIT)." }
];

export const BG_STYLES: BackgroundStyle[] = ['dots-mesh', 'dots', 'dots-fade', 'grid', 'mesh', 'animated-mesh', 'none'];

export const MODE_COLORS: Record<Mode, string> = {
  compare: '#0f172a',    // Slate 900
  council: '#1e1b4b',    // Indigo 950
  roundtable: '#022c22', // Emerald 950
};
