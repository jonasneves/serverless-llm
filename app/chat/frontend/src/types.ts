export interface Model {
  id: string;
  name: string;
  color: string;
  response: string;
  thinking?: string;
  type?: 'self-hosted' | 'github';
  error?: string;
  statusMessage?: string; // Temporary system messages (rate limiting, etc.) - not part of conversation history
  personaEmoji?: string; // Emoji representing the persona
  personaName?: string; // Name of the persona
  personaTrait?: string; // Key trait/perspective of the persona

  // Metadata from backend
  priority?: number;
  context_length?: number;
  default?: boolean;
  routing_category?: string | null;
}

export type Mode = 'compare' | 'analyze' | 'debate' | 'chat' | 'benchmark';

export interface Position {
  x: number;
  y: number;
  angle: number;
}

export type BackgroundStyle = 'dots' | 'grid' | 'mesh' | 'dots-mesh' | 'dots-fade' | 'animated-mesh' | 'none';

export interface TopicPrompt {
  id: string;
  label: string;
  prompt: string;
  category?: string;
  modes?: Mode[];
  tags?: string[];
}

export interface TopicPack {
  id: string;
  title: string;
  description: string;
  topics: TopicPrompt[];
}

export interface TrendingTopic {
  id: string;
  title: string;
  summary: string;
  url?: string;
  source?: string;
  publishedAt?: string;
  tags?: string[];
}

export type ChatHistoryEntry = {
  role: 'user' | 'assistant';
  content: string;
  kind?: 'compare_summary'
  | 'analyze_synthesis'
  | 'analyze_response'
  | 'debate_turn'
  | 'benchmark_results';
};

// Spatial reasoning benchmark types
export type CognitiveLevel = 1 | 2 | 3 | 4 | 5;

export const COGNITIVE_LEVEL_NAMES: Record<CognitiveLevel, string> = {
  1: 'Retrieval',
  2: 'Topology',
  3: 'Symbolic',
  4: 'Egocentric',
  5: 'Mental Rotation',
};

export type SpatialBenchmarkSuiteId = 'stepgame' | 'spartqa' | 'sparc';
export type BenchmarkProfile = 'quick' | 'balanced' | 'full';

export interface SpatialTask {
  id: string;
  suite_id: SpatialBenchmarkSuiteId;
  category: 'route' | 'relationship' | 'perspective';
  cognitive_level: CognitiveLevel;
  prompt: string;
  expected_answer: string;
  answer_format: 'free_text' | 'direction' | 'entity' | 'description';
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface SpatialBenchmarkSuite {
  id: SpatialBenchmarkSuiteId;
  name: string;
  short_name: string;
  description: string;
  focus: string;
  source_url: string;
  accent: string;
  tasks: SpatialTask[];
}

export interface BenchmarkConfig {
  mode: 'spatial_reasoning';
  benchmark_profile: BenchmarkProfile;
  benchmark_suite: SpatialBenchmarkSuiteId | 'all';
  task_category: 'route' | 'relationship' | 'perspective' | 'all';
  num_tasks: number;
  difficulty_filter?: 'easy' | 'medium' | 'hard' | 'all';
}

export interface SpatialResult {
  model_id: string;
  response: string;
  predicted_answer: string;
  accuracy: number;
  reasoning_depth: 'shallow' | 'adequate' | 'deep';
  response_time_ms: number;
}

export interface BenchmarkResult {
  suite_id: SpatialBenchmarkSuiteId;
  suite_name: string;
  task_id: string;
  task_text: string;
  category: 'route' | 'relationship' | 'perspective';
  cognitive_level: CognitiveLevel;
  expected_answer: string;
  model_results: SpatialResult[];
}
