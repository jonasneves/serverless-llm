import { BackgroundStyle, Mode, TopicPack, TopicPrompt, TrendingTopic } from './types';

export const MODEL_META: Record<string, { color: string; name?: string }> = {
  local: { color: '#10b981' }, // Green for local models
  api: { color: '#3b82f6' },   // Blue for API models
};

// Curated static topics grounded in current-ish industry/news contexts
export const CURATED_TOPICS: TopicPrompt[] = [
  {
    id: 'eu-ai-act-enforcement',
    label: 'EU AI Act Enforcement Wave',
    prompt: "The EU AI Act enters enforcement; high-risk systems must prove data provenance, evals, and risk controls. Outline compliance gaps for a frontier model API and tradeoffs between speed and alignment.",
    category: 'Policy',
    modes: ['council', 'roundtable'],
    tags: ['governance', 'compliance'],
  },
  {
    id: 'export-controls-blackwell',
    label: 'Export Controls Tighten',
    prompt: "U.S. export rules tighten again on AI accelerators; Blackwell-class parts face new caps and cloud checks. Map the impact on training roadmaps, costs, and on-device strategies.",
    category: 'Infra',
    modes: ['compare', 'roundtable'],
    tags: ['chips', 'supply-chain'],
  },
  {
    id: 'weights-leak',
    label: 'Major Weights Leak',
    prompt: "A commercial frontier model checkpoint leaks. Assess risks (misuse, impersonation, jailbreak diffusion), legal exposure, and whether open red-team releases mitigate or worsen safety.",
    category: 'Security',
    modes: ['council', 'roundtable'],
    tags: ['safety', 'open-weights'],
  },
  {
    id: 'on-device-llm-race',
    label: 'On-Device LLM Race',
    prompt: "Phone OEMs ship 3nm NPUs and 20B-parameter on-device assistants. What actually moves the needle for UX, privacy, and cost vs. cloud? Where do hybrid (edge + cloud) designs win?",
    category: 'Infra',
    modes: ['compare', 'roundtable'],
    tags: ['edge', 'latency'],
  },
  {
    id: 'signed-app-prompt-injection',
    label: 'Signed App Prompt Injection',
    prompt: "A popular signed desktop app shipped with hardcoded system prompts; attackers use supply chain updates to exfiltrate data. How should vendors audit, sandbox, and attest LLM apps?",
    category: 'Security',
    modes: ['compare', 'council'],
    tags: ['supply-chain', 'prompt-injection'],
  },
  {
    id: 'eval-standardization',
    label: 'Safety Eval Standard',
    prompt: "NIST-style safety eval suites gain traction (jailbreak, autonomy, bio). How should vendors report scores, and what gaps remain for frontier vs. small models?",
    category: 'Policy',
    modes: ['compare', 'roundtable'],
    tags: ['evaluation', 'safety'],
  },
  {
    id: 'licensing-standoff',
    label: 'Publisher Licensing Standoff',
    prompt: "Major news publishers pause AI licensing talks and sue over training. What remedies (revenue share, opt-out registries, model removal) are realistic, and how do they ripple to open models?",
    category: 'Data',
    modes: ['council', 'roundtable'],
    tags: ['licensing', 'copyright'],
  },
  {
    id: 'sbom-for-llms',
    label: 'SBOM for LLM Pipelines',
    prompt: "Regulators push SBOMs and signed artifacts for AI stacks. Draft what should appear in an LLM pipeline SBOM (data, weights, evals, guardrails) and how to verify it at runtime.",
    category: 'Security',
    modes: ['compare', 'council'],
    tags: ['sbom', 'supply-chain'],
  },
  {
    id: 'data-poisoning-campaign',
    label: 'Data Poisoning Campaign',
    prompt: "Researchers find coordinated data poisoning in popular open corpora. How should model hosts detect and mitigate poisoning post-hoc, and what retraining tradeoffs are acceptable?",
    category: 'Security',
    modes: ['compare', 'roundtable'],
    tags: ['data', 'poisoning'],
  },
  {
    id: 'copyright-settlement',
    label: 'Copyright Settlement Sets Precedent',
    prompt: "A major copyright suit settles with dataset disclosure and per-output watermarking. Predict how this precedent affects future training sets and open-weight releases.",
    category: 'Policy',
    modes: ['roundtable'],
    tags: ['copyright', 'watermarking'],
  },
];

export const TOPIC_PACKS: TopicPack[] = [
  {
    id: 'policy-governance',
    title: 'Policy & Governance',
    description: 'Regulation, licensing, eval standards, and precedents.',
    topics: CURATED_TOPICS.filter(t => t.category === 'Policy' || t.category === 'Data'),
  },
  {
    id: 'infra-chips',
    title: 'Infra & Chips',
    description: 'Export controls, edge/cloud balance, and hardware constraints.',
    topics: CURATED_TOPICS.filter(t => t.category === 'Infra'),
  },
  {
    id: 'security-data',
    title: 'Security & Data',
    description: 'Leaks, poisoning, SBOMs, and supply-chain risks.',
    topics: CURATED_TOPICS.filter(t => t.category === 'Security'),
  },
];

// Keep ticker suggestions in sync with curated topics
export const SUGGESTED_TOPICS = CURATED_TOPICS;

export const TRENDING_FEED_URL =
  import.meta.env.VITE_TRENDING_FEED_URL || '/api/trending-topics';

// Lightweight fallback so the UI is never empty if the feed is unavailable
export const TRENDING_FALLBACK: TrendingTopic[] = [
  {
    id: 'ai-safety-governance',
    title: 'New AI safety governance draft targets frontier model transparency',
    summary: 'Draft policy proposes reporting training data provenance, evals for autonomous behavior, and emergency off-switch requirements.',
    source: 'PolicyWire',
    tags: ['AI', 'governance'],
    publishedAt: '2025-01-05',
  },
  {
    id: 'chips-3nm',
    title: '3nm edge devices clear FCC for on-device LLM acceleration',
    summary: 'Vendors claim 2× energy efficiency for 70B-parameter quantized models on consumer hardware.',
    source: 'SemiDaily',
    tags: ['hardware', 'ai'],
    publishedAt: '2025-01-04',
  },
  {
    id: 'open-weights',
    title: 'Open-weights contest rewards best safety-tuned small models',
    summary: 'Competition encourages transparent training recipes and evals instead of closed checkpoints.',
    source: 'MLHub',
    tags: ['open-source', 'models'],
    publishedAt: '2025-01-03',
  },
  {
    id: 'security-supply-chain',
    title: 'Software supply chain bill moves forward with SBOM enforcement',
    summary: 'Requires signed artifacts, provenance attestations, and runtime monitoring for critical infra.',
    source: 'CyberBrief',
    tags: ['security', 'devsecops'],
    publishedAt: '2025-01-02',
  },
  {
    id: 'creator-tools',
    title: 'Creator tooling boom: multimodal editing in the browser',
    summary: 'WebGPU-first editors ship video, audio, and 3D pipelines without native installs.',
    source: 'CreatorBeat',
    tags: ['media', 'webgpu'],
    publishedAt: '2025-01-01',
  },
];

export const BG_STYLES: BackgroundStyle[] = ['dots-mesh', 'dots', 'dots-fade', 'grid', 'mesh', 'animated-mesh', 'none'];

const BASE_BACKGROUND = '#0f172a'; // Unified playground background tone

export const MODE_COLORS: Record<Mode, string> = {
  compare: BASE_BACKGROUND,
  council: BASE_BACKGROUND,
  roundtable: BASE_BACKGROUND,
};

// Generation defaults - centralized for easy maintenance
export const GENERATION_DEFAULTS = {
  maxTokens: 1024,      // Reasonable default for comparison
  temperature: 0.7,     // Balanced creativity/coherence
};

// Layout constants - centralized for consistent sizing
export const LAYOUT = {
  // Card dimensions
  cardWidth: 256,       // Width of model cards in compare mode (px)
  cardHeight: 200,      // Height of model cards in compare mode (px)

  // Grid gaps
  gapX: 24,             // Horizontal gap between cards (px)
  gapY: 24,             // Vertical gap between cards (px)

  // Circle/Council layout
  baseRadius: 160,      // Minimum radius for circle layouts (px)
  minRadius: 120,       // Starting point for radius calculation (px)
  radiusPerModel: 15,   // Additional radius per model to prevent overlap (px)

  // Arena dimensions
  arenaHeight: 480,     // Height of visualization area for circle modes (px)
  scrollClamp: 200,     // Max scroll offset in either direction (px)
};
