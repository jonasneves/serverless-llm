import { BackgroundStyle, Mode, Model, TopicPack, TopicPrompt, TrendingTopic, SpatialTask } from './types';

export const SELF_HOSTED_DEFAULT_PRIORITY = 50;
export const GITHUB_DEFAULT_PRIORITY = 100;

// Derived at runtime from models.json routing_category field — no manual sync needed
export function isThinkingModel(modelId: string, models: Model[]): boolean {
  return models.find(m => m.id === modelId)?.routing_category === 'reasoning';
}

export function getModelPriority(modelId: string, modelType: 'self-hosted' | 'github', dynamicPriority?: number): number {
  if (dynamicPriority !== undefined) {
    return dynamicPriority;
  }

  return modelType === 'self-hosted' ? SELF_HOSTED_DEFAULT_PRIORITY : GITHUB_DEFAULT_PRIORITY;
}

// Curated static topics grounded in current-ish industry/news contexts
export const CURATED_TOPICS: TopicPrompt[] = [
  {
    id: 'eu-ai-act-enforcement',
    label: 'EU AI Act Enforcement Wave',
    prompt: "The EU AI Act enters enforcement; high-risk systems must prove data provenance, evals, and risk controls. Outline compliance gaps for a frontier model API and tradeoffs between speed and alignment.",
    category: 'Policy',
    modes: ['analyze', 'debate'],
    tags: ['governance', 'compliance'],
  },
  {
    id: 'export-controls-blackwell',
    label: 'Export Controls Tighten',
    prompt: "U.S. export rules tighten again on AI accelerators; Blackwell-class parts face new caps and cloud checks. Map the impact on training roadmaps, costs, and on-device strategies.",
    category: 'Infra',
    modes: ['compare', 'debate'],
    tags: ['chips', 'supply-chain'],
  },
  {
    id: 'weights-leak',
    label: 'Major Weights Leak',
    prompt: "A commercial frontier model checkpoint leaks. Assess risks (misuse, impersonation, jailbreak diffusion), legal exposure, and whether open red-team releases mitigate or worsen safety.",
    category: 'Security',
    modes: ['analyze', 'debate'],
    tags: ['safety', 'open-weights'],
  },
  {
    id: 'on-device-llm-race',
    label: 'On-Device LLM Race',
    prompt: "Phone OEMs ship 3nm NPUs and 20B-parameter on-device assistants. What actually moves the needle for UX, privacy, and cost vs. cloud? Where do hybrid (edge + cloud) designs win?",
    category: 'Infra',
    modes: ['compare', 'debate'],
    tags: ['edge', 'latency'],
  },
  {
    id: 'signed-app-prompt-injection',
    label: 'Signed App Prompt Injection',
    prompt: "A popular signed desktop app shipped with hardcoded system prompts; attackers use supply chain updates to exfiltrate data. How should vendors audit, sandbox, and attest LLM apps?",
    category: 'Security',
    modes: ['compare', 'analyze'],
    tags: ['supply-chain', 'prompt-injection'],
  },
  {
    id: 'eval-standardization',
    label: 'Safety Eval Standard',
    prompt: "NIST-style safety eval suites gain traction (jailbreak, autonomy, bio). How should vendors report scores, and what gaps remain for frontier vs. small models?",
    category: 'Policy',
    modes: ['compare', 'debate'],
    tags: ['evaluation', 'safety'],
  },
  {
    id: 'licensing-standoff',
    label: 'Publisher Licensing Standoff',
    prompt: "Major news publishers pause AI licensing talks and sue over training. What remedies (revenue share, opt-out registries, model removal) are realistic, and how do they ripple to open models?",
    category: 'Data',
    modes: ['analyze', 'debate'],
    tags: ['licensing', 'copyright'],
  },
  {
    id: 'sbom-for-llms',
    label: 'SBOM for LLM Pipelines',
    prompt: "Regulators push SBOMs and signed artifacts for AI stacks. Draft what should appear in an LLM pipeline SBOM (data, weights, evals, guardrails) and how to verify it at runtime.",
    category: 'Security',
    modes: ['compare', 'analyze'],
    tags: ['sbom', 'supply-chain'],
  },
  {
    id: 'data-poisoning-campaign',
    label: 'Data Poisoning Campaign',
    prompt: "Researchers find coordinated data poisoning in popular open corpora. How should model hosts detect and mitigate poisoning post-hoc, and what retraining tradeoffs are acceptable?",
    category: 'Security',
    modes: ['compare', 'debate'],
    tags: ['data', 'poisoning'],
  },
  {
    id: 'copyright-settlement',
    label: 'Copyright Settlement Sets Precedent',
    prompt: "A major copyright suit settles with dataset disclosure and per-output watermarking. Predict how this precedent affects future training sets and open-weight releases.",
    category: 'Policy',
    modes: ['debate'],
    tags: ['copyright', 'watermarking'],
  },
];

// Mode-specific recipe cards for empty state
// Each recipe has emoji, label, description, and prompt template
export interface RecipeCard {
  emoji: string;
  label: string;
  description: string;
  prompt: string;
}

export const MODE_RECIPES: Partial<Record<Mode, RecipeCard[]>> = {
  compare: [
    {
      emoji: '🔍',
      label: 'Hallucination Detector',
      description: 'See which models hallucinate',
      prompt: 'Is this actually true? Give evidence: '
    },
    {
      emoji: '📊',
      label: 'Model Shootout',
      description: 'Find the best model for a task',
      prompt: 'Answer precisely in one paragraph: '
    },
    {
      emoji: '🧬',
      label: 'Personality Test',
      description: 'See how models differ in voice',
      prompt: 'What is your honest opinion on: '
    },
    {
      emoji: '⏱️',
      label: 'Speed vs Quality',
      description: 'Compare latency and output quality',
      prompt: 'Write a concise function that '
    }
  ],
  analyze: [
    {
      emoji: '🧠',
      label: 'Collective Intelligence',
      description: 'Many models, one synthesis',
      prompt: 'Research and synthesize all perspectives on: '
    },
    {
      emoji: '⚖️',
      label: 'Tradeoff Analysis',
      description: 'Weigh every angle',
      prompt: 'What are the real tradeoffs between '
    },
    {
      emoji: '🔬',
      label: 'Small vs Big',
      description: 'Can small models match GPT-4.1?',
      prompt: 'Answer this and I\'ll compare quality: '
    }
  ],
  debate: [
    {
      emoji: '🤔',
      label: 'Devil\'s Advocate',
      description: 'Force models to disagree',
      prompt: 'Argue for and against: '
    },
    {
      emoji: '🔮',
      label: 'Predict the Future',
      description: 'Competing forecasts',
      prompt: 'What will happen in 5 years with: '
    },
    {
      emoji: '⚔️',
      label: 'Tech Holy War',
      description: 'Pick a hot take, watch them fight',
      prompt: ''
    }
  ],
  benchmark: [
    {
      emoji: '🧭',
      label: 'Quick Spatial Test',
      description: '5 tasks across all levels',
      prompt: ''
    },
    {
      emoji: '🧠',
      label: 'Perspective Challenge',
      description: 'L4-L5 egocentric tasks',
      prompt: ''
    },
    {
      emoji: '📐',
      label: 'Full Benchmark',
      description: 'All 25 tasks, all levels',
      prompt: ''
    }
  ]
};

// Legacy string prompts for backwards compatibility
export const MODE_EXAMPLE_PROMPTS: Partial<Record<Mode, string[]>> = {
  compare: MODE_RECIPES.compare?.map(r => r.prompt) || [],
  analyze: MODE_RECIPES.analyze?.map(r => r.prompt) || [],
  debate: MODE_RECIPES.debate?.map(r => r.prompt) || [],
};

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
    publishedAt: '2026-03-05',
  },
  {
    id: 'chips-3nm',
    title: '3nm edge devices clear FCC for on-device LLM acceleration',
    summary: 'Vendors claim 2× energy efficiency for 70B-parameter quantized models on consumer hardware.',
    source: 'SemiDaily',
    tags: ['hardware', 'ai'],
    publishedAt: '2026-03-04',
  },
  {
    id: 'open-weights',
    title: 'Open-weights contest rewards best safety-tuned small models',
    summary: 'Competition encourages transparent training recipes and evals instead of closed checkpoints.',
    source: 'MLHub',
    tags: ['open-source', 'models'],
    publishedAt: '2026-03-03',
  },
  {
    id: 'security-supply-chain',
    title: 'Software supply chain bill moves forward with SBOM enforcement',
    summary: 'Requires signed artifacts, provenance attestations, and runtime monitoring for critical infra.',
    source: 'CyberBrief',
    tags: ['security', 'devsecops'],
    publishedAt: '2026-03-02',
  },
  {
    id: 'creator-tools',
    title: 'Creator tooling boom: multimodal editing in the browser',
    summary: 'WebGPU-first editors ship video, audio, and 3D pipelines without native installs.',
    source: 'CreatorBeat',
    tags: ['media', 'webgpu'],
    publishedAt: '2026-03-01',
  },
];

export const BG_STYLES: BackgroundStyle[] = ['dots-mesh', 'dots', 'dots-fade', 'grid', 'mesh', 'animated-mesh', 'none'];

export const PLAYGROUND_BACKGROUND = '#0f172a';

// Generation defaults - centralized for easy maintenance
export const GENERATION_DEFAULTS = {
  maxTokens: 1024,      // Reasonable default for comparison
  temperature: 0.7,     // Balanced creativity/coherence
};

// UI Builder system prompt - instructs models to output interactive JSON options
export const UI_BUILDER_PROMPT = `You can output interactive UI elements using JSON. When appropriate, include clickable options:

\`\`\`json
{
  "options": [
    {"id": "opt1", "label": "Option 1", "action": "message", "value": "User selected option 1"},
    {"id": "opt2", "label": "Option 2", "action": "message", "value": "User selected option 2"}
  ]
}
\`\`\`

Guidelines:
- Use for choices, confirmations, or navigation
- 2-4 options max
- Keep labels short
- Include JSON after your text response`;

// Layout constants - centralized for consistent sizing
export const LAYOUT = {
  // Card dimensions
  cardWidth: 256,       // Width of model cards in compare mode (px)
  cardHeight: 200,      // Height of model cards in compare mode (px)

  // Grid gaps
  gapX: 24,             // Horizontal gap between cards (px)
  gapY: 24,             // Vertical gap between cards (px)

  // Circle layout (analyze, debate modes)
  baseRadius: 160,      // Minimum radius for circle layouts (px)
  minRadius: 120,       // Starting point for radius calculation (px)
  radiusPerModel: 15,   // Additional radius per model to prevent overlap (px)

  // Arena dimensions
  arenaHeight: 480,     // Height of visualization area for circle modes (px)
  scrollClamp: 200,     // Max scroll offset in either direction (px)
};

// System prompts for orchestration modes
export const ANALYZE_RESPONSE_SYSTEM = `Analyze this question independently.
State your position, then support it with evidence. 50-150 words.`;

export const DEBATE_TURN_SYSTEM = `Respond to this question considering prior responses.
Agree, challenge, or add new evidence. Reference specific points. 50-150 words.`;

// Spatial reasoning benchmark tasks
// Organized by cognitive level (SpatialText 2026, SnorkelSpatial, StepGame)
// L1 Retrieval, L2 Topology, L3 Symbolic, L4 Egocentric, L5 Mental Rotation

export const SPATIAL_REASONING_TASKS: Record<string, SpatialTask[]> = {
  route: [
    // L1 — direct retrieval
    {
      id: 'route-001',
      category: 'route',
      cognitive_level: 1,
      prompt: `You are at the center of a circular plaza. North is the park entrance. East is the fountain. West is the market. South is the town hall.\nWhich direction is the market?`,
      expected_answer: 'west',
      answer_format: 'direction',
      difficulty: 'easy'
    },
    {
      id: 'route-002',
      category: 'route',
      cognitive_level: 1,
      prompt: `You are at the front door of a house. The living room is through the left doorway. The kitchen is south of the living room, through a doorway on the far wall.\nDescribe how to reach the kitchen.`,
      expected_answer: 'turn left, enter living room, walk to the south wall, pass through doorway into kitchen',
      answer_format: 'direction',
      difficulty: 'easy'
    },
    // L2 — topology (betweenness, adjacency)
    {
      id: 'route-003',
      category: 'route',
      cognitive_level: 2,
      prompt: `You enter a museum facing north. To your right (east) is the sculpture gallery. Beyond that is the painting hall. The café is west of the entrance.\nTo visit the painting hall then the café, describe your route.`,
      expected_answer: 'turn right, enter sculpture gallery, continue east to painting hall, then return west past entrance to café',
      answer_format: 'direction',
      difficulty: 'medium'
    },
    {
      id: 'route-004',
      category: 'route',
      cognitive_level: 2,
      prompt: `You are in a library facing a bookshelf. The reference desk is to your right. Behind you is the children's section. To your left is the reading area.\nTo go to the reference desk then the children's section, describe your turns.`,
      expected_answer: 'turn right to reach reference desk, then turn around and walk back past entrance to children\'s section',
      answer_format: 'direction',
      difficulty: 'medium'
    },
    // L3 — symbolic multi-hop
    {
      id: 'route-005',
      category: 'route',
      cognitive_level: 3,
      prompt: `Room A is north of Room B. Room B is west of Room C. Room C is north of Room D. Room D is east of Room E.\nTo walk from Room A to Room E, list the cardinal directions in order.`,
      expected_answer: 'south, east, south, west',
      answer_format: 'direction',
      difficulty: 'medium'
    },
    {
      id: 'route-006',
      category: 'route',
      cognitive_level: 3,
      prompt: `The bakery is north of the park. The library is east of the bakery. The gym is south of the library. The café is west of the gym.\nWhere is the café relative to the park?`,
      expected_answer: 'east',
      answer_format: 'direction',
      difficulty: 'medium'
    },
    // L4 — egocentric route with turn
    {
      id: 'route-007',
      category: 'route',
      cognitive_level: 4,
      prompt: `You are walking north along a corridor. You turn right at the first intersection, then left at the second intersection.\nWhat absolute direction are you now walking?`,
      expected_answer: 'north',
      answer_format: 'direction',
      difficulty: 'hard'
    },
    {
      id: 'route-008',
      category: 'route',
      cognitive_level: 4,
      prompt: `You face east. You turn left, walk 10 steps, turn right, walk 5 steps, then turn right again.\nWhat absolute direction are you now facing?`,
      expected_answer: 'east',
      answer_format: 'direction',
      difficulty: 'hard'
    }
  ],
  relationship: [
    // L1 — direct retrieval
    {
      id: 'rel-001',
      category: 'relationship',
      cognitive_level: 1,
      prompt: `A round table has a red chair on the north side, a blue chair on the west side, and a green chair on the south side.\nWhat color chair is directly opposite the red chair?`,
      expected_answer: 'green',
      answer_format: 'entity',
      difficulty: 'easy'
    },
    {
      id: 'rel-002',
      category: 'relationship',
      cognitive_level: 1,
      prompt: `Three buildings in a line: Library (west), Town Hall (center), School (east).\nWhich building is furthest east?`,
      expected_answer: 'School',
      answer_format: 'entity',
      difficulty: 'easy'
    },
    // L2 — topology (betweenness, containment)
    {
      id: 'rel-003',
      category: 'relationship',
      cognitive_level: 2,
      prompt: `A desk is between the door and the window. A lamp is on the desk. The bookshelf is behind the door.\nIs the lamp between the door and the window?`,
      expected_answer: 'yes',
      answer_format: 'entity',
      difficulty: 'easy'
    },
    {
      id: 'rel-004',
      category: 'relationship',
      cognitive_level: 2,
      prompt: `A red car is parked north of a blue car. The blue car is east of a yellow car.\nIs the red car north or south of the yellow car?`,
      expected_answer: 'north and east',
      answer_format: 'description',
      difficulty: 'medium'
    },
    // L3 — symbolic multi-hop chains
    {
      id: 'rel-005',
      category: 'relationship',
      cognitive_level: 3,
      prompt: `Alice sits north of Bob. Bob sits east of Carol. Carol sits north of David.\nWhere is Alice relative to David?`,
      expected_answer: 'north and east',
      answer_format: 'description',
      difficulty: 'medium'
    },
    {
      id: 'rel-006',
      category: 'relationship',
      cognitive_level: 3,
      prompt: `A is left of B. B is above C. C is right of D. D is below E.\nWhere is A relative to E?`,
      expected_answer: 'right of E, or east of E',
      answer_format: 'description',
      difficulty: 'medium'
    },
    {
      id: 'rel-007',
      category: 'relationship',
      cognitive_level: 3,
      prompt: `The plant is left of the box. The box is left of the lamp. A book is on a shelf above the box.\nWhat is the left-to-right order on the ground level?`,
      expected_answer: 'plant, box, lamp',
      answer_format: 'entity',
      difficulty: 'medium'
    },
    // L5 — mental rotation of relationship layout
    {
      id: 'rel-008',
      category: 'relationship',
      cognitive_level: 5,
      prompt: `In a room: the sofa is on the north wall, the TV is on the south wall, the bookshelf is on the east wall, the door is on the west wall.\nIf you rotate the entire layout 90 degrees clockwise, what is now on the north wall?`,
      expected_answer: 'door',
      answer_format: 'entity',
      difficulty: 'hard'
    },
    {
      id: 'rel-009',
      category: 'relationship',
      cognitive_level: 5,
      prompt: `Four people sit at a square table: Amy (north), Ben (east), Cora (south), Dan (west).\nIf everyone rotates one seat clockwise, who now sits on the north side?`,
      expected_answer: 'Dan',
      answer_format: 'entity',
      difficulty: 'hard'
    }
  ],
  perspective: [
    // L2 — simple perspective mapping
    {
      id: 'persp-001',
      category: 'perspective',
      cognitive_level: 2,
      prompt: `A person faces east with a river on their right.\nIn absolute terms, which direction is the river?`,
      expected_answer: 'south',
      answer_format: 'direction',
      difficulty: 'easy'
    },
    {
      id: 'persp-002',
      category: 'perspective',
      cognitive_level: 2,
      prompt: `A person walking north turns 90 degrees to their right.\nWhat absolute direction are they now walking?`,
      expected_answer: 'east',
      answer_format: 'direction',
      difficulty: 'easy'
    },
    // L4 — egocentric transforms
    {
      id: 'persp-003',
      category: 'perspective',
      cognitive_level: 4,
      prompt: `You face west. A car is to your left.\nIn absolute terms, which direction is the car?`,
      expected_answer: 'south',
      answer_format: 'direction',
      difficulty: 'medium'
    },
    {
      id: 'persp-004',
      category: 'perspective',
      cognitive_level: 4,
      prompt: `You stand in a garden facing north. The oak tree is to your left, the shed is to your right.\nIn absolute coordinates, where are the tree and shed?`,
      expected_answer: 'oak tree is west, shed is east',
      answer_format: 'description',
      difficulty: 'medium'
    },
    {
      id: 'persp-005',
      category: 'perspective',
      cognitive_level: 4,
      prompt: `You face south. A building is ahead and to your left.\nIn absolute terms, what direction is the building?`,
      expected_answer: 'south-east or southeast',
      answer_format: 'direction',
      difficulty: 'medium'
    },
    // L5 — mental rotation
    {
      id: 'persp-006',
      category: 'perspective',
      cognitive_level: 5,
      prompt: `A room layout: table in center, lamp to the north, chair to the east, plant to the south, door to the west.\nRotate the entire layout 180 degrees. What is now north of the table?`,
      expected_answer: 'plant',
      answer_format: 'entity',
      difficulty: 'hard'
    },
    {
      id: 'persp-007',
      category: 'perspective',
      cognitive_level: 5,
      prompt: `You face north. The park is ahead, the school is to your right, the hospital is behind you.\nYou turn to face west. What is now to your right?`,
      expected_answer: 'park',
      answer_format: 'entity',
      difficulty: 'hard'
    },
    {
      id: 'persp-008',
      category: 'perspective',
      cognitive_level: 5,
      prompt: `On a map: City A is north of City B. City C is east of City B.\nIf you flip the map upside down (rotate 180 degrees), where is City A relative to City B?`,
      expected_answer: 'south',
      answer_format: 'direction',
      difficulty: 'hard'
    }
  ]
};
