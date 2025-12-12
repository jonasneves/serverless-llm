export interface Model {
  id: string;
  name: string;
  color: string;
  response: string;
  thinking?: string;
  type?: 'local' | 'api';
  error?: string;
}

export type Mode = 'compare' | 'council' | 'roundtable';

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
