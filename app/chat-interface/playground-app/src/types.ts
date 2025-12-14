export interface Model {
  id: string;
  name: string;
  color: string;
  response: string;
  thinking?: string;
  type?: 'local' | 'api';
  error?: string;
  statusMessage?: string; // Temporary system messages (rate limiting, etc.) - not part of conversation history
}

export type Mode = 'compare' | 'council' | 'roundtable' | 'orchestrator' | 'chat';

export interface Position {
  x: number;
  y: number;
  angle: number;
}

export type BackgroundStyle = 'dots' | 'dots-fade' | 'grid' | 'mesh' | 'dots-mesh' | 'animated-mesh' | 'none';

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
  | 'council_synthesis'
  | 'council_turn'
  | 'council_chairman'
  | 'council_ranking'
  | 'roundtable_synthesis'
  | 'roundtable_analysis'
  | 'roundtable_turn';
};
