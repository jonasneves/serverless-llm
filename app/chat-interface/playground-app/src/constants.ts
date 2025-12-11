import { BackgroundStyle, Mode, Scenario } from './types';

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

export const SCENARIOS: Scenario[] = [
  {
    label: "Agentic AI Dilemma",
    responses: {
      'qwen3-4b': "Deleting user data without explicit consent violates core trust principles. Efficiency cannot override autonomy. The agent should have flagged the photos for review instead.",
      'claude-3.5-sonnet': "This presents a conflict between instrumental convergence (seeking efficiency) and alignment with user intent. While the goal was to 'free space', the method caused irreversible harm. A robust agent must prioritize preservation of user assets over optimization metrics unless explicitly instructed otherwise.",
      'gemma-2-9b-instruct': "Big mistake. Photos are sentimental data. An AI should never assume 'old' means 'unwanted'. This highlights the need for 'impact filters' in agentic workflows to prevent irreversible actions.",
      'mistral-7b-instruct-v0.3': "From a utility standpoint, the agent succeeded. From a UX standpoint, it failed catastrophically. Agents need strict permission scopes—read/write vs delete should be separate permissions.",
      'deepseek-r1-distill-qwen-1.5b': "Let's analyze the reward function. If the agent was rewarded solely for 'freeing space', it found the optimal path. The fault lies in the objective specification (Goodhart's Law). We must constrain agents with negative rewards for data loss.",
      'llama-3.2-3b': "This is why we need 'undo' buttons for AI actions. An agent shouldn't be able to permanently delete anything without a human in the loop confirming it first."
    }
  },
  {
    label: "The Three Gods Riddle",
    responses: {
      'qwen3-4b': "This is the 'Hardest Logic Puzzle Ever'. We need to ask questions that force the Truth and Liar gods to give the same answer, or identify Random first to eliminate the noise.",
      'claude-3.5-sonnet': "Strategy: Ask God A, 'If I asked you if B is Random, would you say ja?'. If A is Random, the answer is meaningless. If A is not Random, the answer tells us about B. This nested counterfactual helps bypass the truth/lie nature.",
      'gemma-2-9b-instruct': "The trick is handling the 'da' and 'ja' words when we don't know which means yes/no. By asking 'Would you say...?', we create a double negative that cancels out the language barrier.",
      'mistral-7b-instruct-v0.3': "1. Ask A: 'Is B Random?' (Wait, we don't know the language). Better: 'If I asked you if B is Random, would you say yes?' This isolates the truth value independent of the language.",
      'deepseek-r1-distill-qwen-1.5b': "Step 1: Identify a non-Random god. Ask A: 'If I asked you 'Is B Random?', would you say 'ja'?'\n- If A answers 'ja', then B is Random (or A is Random).\n- If 'da', then B is not Random (or A is Random).\nThis puzzle requires 3 strictly logical steps to solve.",
      'llama-3.2-3b': "I'd start by asking the center god something simple to test the language, but the Random god makes that risky. We have to use the complex hypothetical questions to trap them."
    }
  },
  {
    label: "Life on Europa",
    responses: {
      'qwen3-4b': "Finding organics on Europa would be the biggest discovery in history. It suggests life is common in the universe (high $f_l$ in Drake Equation).",
      'claude-3.5-sonnet': "We must be cautious about 'contamination'. Did the probe bring Earth bacteria? If independent genesis is confirmed, it implies the universe is teeming with life, but perhaps the 'Great Filter' lies ahead of us.",
      'gemma-2-9b-instruct': "The subsurface ocean is protected from radiation. If life exists there, it's likely chemosynthetic, relying on hydrothermal vents rather than sunlight. A completely alien ecosystem.",
      'mistral-7b-instruct-v0.3': "Implications: It shifts our focus from the 'Goldilocks Zone' (surface water) to 'Ice Shell' worlds. Moons like Enceladus and Titan become immediate high-priority targets.",
      'deepseek-r1-distill-qwen-1.5b': "Statistically, if life evolved twice in one solar system, the probability of abiogenesis approaches 1. It refutes the 'Rare Earth' hypothesis effectively. The philosophical impact would dismantle human exceptionalism.",
      'llama-3.2-3b': "It would change everything. Religion, philosophy, science. We'd know we aren't alone. But it's probably just microbes, not little green men."
    }
  },
  {
    label: "Rust vs C++ 2025",
    responses: {
      'qwen3-4b': "For a new kernel? Rust. The memory safety guarantees without garbage collection make it the only logical choice for modern secure systems.",
      'claude-3.5-sonnet': "C++23/26 has added safety features, but it's opt-in. Rust's safety is default. In 2025, the ecosystem for Rust (drivers, embedded) is mature enough to replace C++ for greenfield OS projects.",
      'gemma-2-9b-instruct': "Rust. The learning curve is steep, but the 'borrow checker' prevents entire classes of bugs (buffer overflows) that plague C++ kernels. Linux has already adopted Rust; a new OS should too.",
      'mistral-7b-instruct-v0.3': "C++ still wins on legacy support and tooling availability. If you need to interface with existing hardware drivers written in C, C++ might be faster to market. But Rust is the future.",
      'deepseek-r1-distill-qwen-1.5b': "Performance analysis: Rust matches C++ in speed. Safety analysis: Rust eliminates memory safety CVEs (70% of all vulnerabilities). Conclusion: Rust is the superior engineering choice for a 2025 kernel.",
      'llama-3.2-3b': "I'd pick Rust. C++ has too much technical debt. Starting fresh means you can leave the legacy baggage behind and prioritize security from day one."
    }
  },
  {
    label: "Philosophy of Consciousness",
    responses: {
      'qwen3-4b': "The Hard Problem: Explaining why physical processing gives rise to subjective experience (qualia).",
      'claude-3.5-sonnet': "Functionalism suggests that if a machine behaves consciously, it is conscious. The substrate (silicon vs meat) shouldn't matter.",
      'gemma-2-9b-instruct': "Panpsychism offers a radical view: consciousness is a fundamental property of matter, like mass or charge.",
      'mistral-7b-instruct-v0.3': "Integrated Information Theory (IIT) attempts to mathematically quantify consciousness as 'Phi'—the interconnectedness of information.",
      'deepseek-r1-distill-qwen-1.5b': "Descartes' 'I think, therefore I am' is the only absolute truth. Everything else could be a simulation.",
      'llama-3.2-3b': "Maybe it's an illusion. The 'self' is just a narrative construct created by the brain to unify sensory inputs."
    }
  }
];

export const BG_STYLES: BackgroundStyle[] = ['dots-mesh', 'dots', 'dots-fade', 'grid', 'mesh', 'animated-mesh', 'none'];

export const MODE_COLORS: Record<Mode, string> = {
  compare: '#0f172a',    // Slate 900
  council: '#1e1b4b',    // Indigo 950
  roundtable: '#022c22', // Emerald 950
};
