export interface Model {
  id: string;
  name: string;
  color: string;
  response: string;
  type?: 'local' | 'api';
}

export interface Scenario {
  label: string;
  responses: Record<string, string>;
}

export type Mode = 'compare' | 'council' | 'roundtable';

export interface Position {
  x: number;
  y: number;
  angle: number;
}

export type BackgroundStyle = 'dots' | 'dots-fade' | 'grid' | 'mesh' | 'dots-mesh' | 'animated-mesh' | 'none';
