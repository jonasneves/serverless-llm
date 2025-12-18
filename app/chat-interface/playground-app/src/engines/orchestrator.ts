/**
 * Discussion Orchestrator using GitHub Models API
 * Ported from Python engines/orchestrator.py
 *
 * Provides intelligent orchestration for multi-model discussions
 */

import { APIClient, ChatMessage } from '../services/apiClient';

export enum DomainType {
  MATHEMATICS = 'mathematics',
  CODING = 'coding',
  REASONING = 'reasoning',
  CREATIVE_WRITING = 'creative_writing',
  CONVERSATION = 'conversation',
  SUMMARIZATION = 'summarization',
  SCIENTIFIC = 'scientific_knowledge',
  COMMON_SENSE = 'common_sense',
}

export interface QueryAnalysis {
  query_domains: DomainType[];
  domain_weights: Record<string, number>;
  model_expertise_scores: Record<string, number>;
  discussion_lead: string;
  expected_turns: number;
  reasoning: string;
}

export enum ConfidenceLevel {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

export interface TurnEvaluation {
  quality_score: number;
  relevance_score: number;
  expertise_alignment: number;
  confidence_assessment: ConfidenceLevel;
  key_contributions: string[];
  conflicts_with_previous: boolean;
  should_continue_discussion: boolean;
}

export enum MergeStrategy {
  PRIORITIZE_LEAD = 'prioritize_lead',
  COMBINE_BEST = 'combine_best',
  CONSENSUS = 'consensus',
}

export interface SynthesisSection {
  source_model: string;
  content_type: string;
  priority: number;
}

export interface SynthesisResult {
  primary_source_model: string;
  source_weights: Record<string, number>;
  merge_strategy: MergeStrategy;
  sections_to_include: SynthesisSection[];
  final_confidence: number;
  synthesis_instructions: string;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

const DOMAIN_ALIASES: Record<string, string> = {
  'logical_reasoning': 'reasoning',
  'logic': 'reasoning',
  'science': 'scientific_knowledge',
  'general_knowledge': 'common_sense',
};

export class GitHubModelsOrchestrator {
  private apiClient: APIClient;
  private modelId: string;
  private maxTokens: number;

  constructor(
    apiClient: APIClient,
    modelId: string = 'gpt-4o',
    maxTokens: number = 16384
  ) {
    this.apiClient = apiClient;
    this.modelId = modelId;
    this.maxTokens = maxTokens;
  }

  private async callStructured<T>(
    prompt: string,
    responseSchema: string
  ): Promise<{ data: T; usage: TokenUsage }> {
    const structuredPrompt = `${prompt}

IMPORTANT: Respond with a JSON object matching this schema:
${responseSchema}

Respond with ONLY the JSON object. Do not include explanations or any text outside the JSON.`;

    const messages: ChatMessage[] = [
      { role: 'user', content: `IMPORTANT: Respond with valid JSON only, no other text.\n\n${structuredPrompt}` }
    ];

    const result = await this.apiClient.chat(this.modelId, messages, {
      max_tokens: this.maxTokens,
      temperature: 0.3,
    });

    let content = result.content.trim();

    // Strip markdown code blocks if present
    if (content.includes('```json')) {
      content = content.split('```json')[1].split('```')[0].trim();
    } else if (content.includes('```')) {
      content = content.split('```')[1].split('```')[0].trim();
    }

    let data: any;
    try {
      data = JSON.parse(content);
    } catch (e) {
      console.error('Failed to parse JSON:', content);
      throw new Error(`Invalid JSON response from orchestrator: ${e}`);
    }

    // Normalize domain aliases
    if (data.query_domains && Array.isArray(data.query_domains)) {
      data.query_domains = data.query_domains.map((d: string) => DOMAIN_ALIASES[d] || d);
    }
    if (data.domain_weights && typeof data.domain_weights === 'object') {
      const normalized: Record<string, number> = {};
      for (const [k, v] of Object.entries(data.domain_weights)) {
        normalized[DOMAIN_ALIASES[k] || k] = v as number;
      }
      data.domain_weights = normalized;
    }

    const usage: TokenUsage = result.usage || {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };

    return { data: data as T, usage };
  }

  async analyzeQuery(
    query: string,
    modelProfiles: Record<string, any>
  ): Promise<{ analysis: QueryAnalysis; usage: TokenUsage }> {
    const profileSummary = Object.entries(modelProfiles)
      .map(([id, profile]) => {
        const strengths = profile.strengths?.slice(0, 3).join(', ') || 'general';
        return `- ${id}: ${strengths}`;
      })
      .join('\n');

    const prompt = `Analyze this query for multi-model discussion planning.

Query: "${query}"

Available models:
${profileSummary}

Determine:
1. Which domain(s) this query belongs to
2. Weight each domain's importance (must sum to 1.0)
3. Score each model's expertise for this query (0-1)
4. Which model should lead the discussion
5. How many discussion turns needed (2-4)
6. Brief reasoning for your choices`;

    const schema = `{
  "query_domains": ["domain1", "domain2"],
  "domain_weights": {"domain1": 0.6, "domain2": 0.4},
  "model_expertise_scores": {"model1": 0.9, "model2": 0.7},
  "discussion_lead": "model_id",
  "expected_turns": 3,
  "reasoning": "explanation"
}`;

    const result = await this.callStructured<QueryAnalysis>(prompt, schema);
    return { analysis: result.data, usage: result.usage };
  }

  async evaluateTurn(
    query: string,
    modelId: string,
    response: string,
    previousTurns: string[]
  ): Promise<{ evaluation: TurnEvaluation; usage: TokenUsage }> {
    const context = previousTurns.length > 0
      ? `\n\nPrevious responses:\n${previousTurns.join('\n\n')}`
      : '';

    const prompt = `Evaluate this model's contribution to the discussion.

Query: "${query}"${context}

Current model: ${modelId}
Response: "${response}"

Evaluate:
1. Overall quality (0-1)
2. Relevance to query (0-1)
3. How well it used its strengths (0-1)
4. Confidence level (high/medium/low)
5. Key contributions made
6. Any conflicts with previous responses
7. Whether more discussion is needed`;

    const schema = `{
  "quality_score": 0.8,
  "relevance_score": 0.9,
  "expertise_alignment": 0.85,
  "confidence_assessment": "high",
  "key_contributions": ["point1", "point2"],
  "conflicts_with_previous": false,
  "should_continue_discussion": true
}`;

    const result = await this.callStructured<TurnEvaluation>(prompt, schema);
    return { evaluation: result.data, usage: result.usage };
  }

  async planSynthesis(
    query: string,
    turns: Array<{ modelId: string; response: string; evaluation: TurnEvaluation }>
  ): Promise<{ synthesis: SynthesisResult; usage: TokenUsage }> {
    const turnsContext = turns
      .map((t, i) => `Turn ${i + 1} (${t.modelId}, quality: ${t.evaluation.quality_score}): ${t.response.slice(0, 200)}...`)
      .join('\n\n');

    const prompt = `Plan how to synthesize the final response from multiple model contributions.

Query: "${query}"

Discussion turns:
${turnsContext}

Determine:
1. Which model's response should be primary
2. Weight for each model's contribution (must sum to 1.0)
3. Merge strategy (prioritize_lead/combine_best/consensus)
4. Sections to include from each model (ordered by priority)
5. Overall confidence in final response (0-1)
6. Instructions for generating the final synthesis`;

    const schema = `{
  "primary_source_model": "model_id",
  "source_weights": {"model1": 0.5, "model2": 0.3, "model3": 0.2},
  "merge_strategy": "combine_best",
  "sections_to_include": [
    {"source_model": "model1", "content_type": "main_answer", "priority": 1},
    {"source_model": "model2", "content_type": "additional_context", "priority": 2}
  ],
  "final_confidence": 0.85,
  "synthesis_instructions": "detailed instructions"
}`;

    const result = await this.callStructured<SynthesisResult>(prompt, schema);
    return { synthesis: result.data, usage: result.usage };
  }
}
