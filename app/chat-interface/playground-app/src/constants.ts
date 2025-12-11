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

export const BG_STYLES: BackgroundStyle[] = ['dots-mesh', 'dots', 'dots-fade', 'grid', 'mesh', 'animated-mesh', 'none'];

export const MODE_COLORS: Record<Mode, string> = {
  compare: '#0f172a',    // Slate 900
  council: '#1e1b4b',    // Indigo 950
  roundtable: '#022c22', // Emerald 950
};
