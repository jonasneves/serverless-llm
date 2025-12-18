/**
 * Discussion Engine - Multi-Model Collaborative Discussion
 * Ported from Python engines/discussion.py
 *
 * Orchestrates turn-based discussions between models with real-time streaming
 */

import type { APIClient, ChatMessage } from '../services/apiClient';
import type { GitHubModelsOrchestrator, QueryAnalysis, TurnEvaluation, SynthesisResult } from './orchestrator';

export interface DiscussionTurn {
  turn_number: number;
  model_id: string;
  model_name: string;
  prompt: string;
  response: string;
  response_time_ms: number;
  evaluation?: TurnEvaluation;
  timestamp: string;
}

export interface DiscussionEvent {
  type: 'analysis_start' | 'analysis_complete' | 'turn_start' | 'turn_chunk' | 'turn_complete' |
        'synthesis_start' | 'synthesis_complete' | 'discussion_complete' | 'error';
  data?: any;
  turn?: DiscussionTurn;
  analysis?: QueryAnalysis;
  evaluation?: TurnEvaluation;
  synthesis?: SynthesisResult;
  error?: string;
  chunk?: string;
  model_id?: string;
}

interface ModelProfile {
  name: string;
  strengths: string[];
  [key: string]: any;
}

export class DiscussionEngine {
  private apiClient: APIClient;
  private orchestrator: GitHubModelsOrchestrator;
  private modelProfiles: Record<string, ModelProfile>;

  constructor(
    apiClient: APIClient,
    orchestrator: GitHubModelsOrchestrator,
    modelProfiles: Record<string, ModelProfile>
  ) {
    this.apiClient = apiClient;
    this.orchestrator = orchestrator;
    this.modelProfiles = modelProfiles;
  }

  private buildTurnPrompt(
    query: string,
    modelId: string,
    isLead: boolean,
    previousTurns: DiscussionTurn[]
  ): ChatMessage[] {
    const profile = this.modelProfiles[modelId];
    const strengths = profile?.strengths?.slice(0, 3).join(', ') || 'general purpose';

    let systemPrompt: string;
    if (isLead) {
      systemPrompt = `You are the discussion lead for this collaborative question.
Your strengths: ${strengths}

As the lead, your role is to:
1. Provide a thorough initial response
2. Frame the key aspects for other models to build upon
3. Use your domain expertise to ground the discussion

Be concise but comprehensive. Other models will add their perspectives after you.`;
    } else {
      systemPrompt = `You are a participant in a collaborative discussion.
Your strengths: ${strengths}

The discussion lead has already responded. Your role is to:
1. Build on the lead's response
2. Add insights from your area of expertise
3. Highlight aspects others may have missed
4. Keep your response focused and additive

Be concise. Add value without redundancy.`;
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt }
    ];

    if (previousTurns.length > 0) {
      const context = previousTurns
        .map(t => `${t.model_name}: ${t.response}`)
        .join('\n\n');
      messages.push({
        role: 'user',
        content: `Question: ${query}\n\nPrevious responses:\n${context}\n\nYour response (building on the above):`
      });
    } else {
      messages.push({
        role: 'user',
        content: `Question: ${query}\n\nYour response:`
      });
    }

    return messages;
  }

  async *runDiscussion(
    query: string,
    params: {
      max_tokens?: number;
      temperature?: number;
      turns?: number;
      participants?: string[];
    } = {}
  ): AsyncGenerator<DiscussionEvent> {
    const {
      max_tokens = 512,
      temperature = 0.7,
      turns = 2,
      participants
    } = params;

    try {
      // Phase 1: Analyze query
      yield { type: 'analysis_start' };

      const { analysis } = await this.orchestrator.analyzeQuery(
        query,
        this.modelProfiles
      );

      yield {
        type: 'analysis_complete',
        analysis
      };

      // Phase 2: Discussion turns
      const completedTurns: DiscussionTurn[] = [];
      let participatingModels: string[];

      if (participants && participants.length > 0) {
        // Use specified participants, lead first
        participatingModels = [analysis.discussion_lead];
        for (const p of participants) {
          if (p !== analysis.discussion_lead) {
            participatingModels.push(p);
          }
        }
      } else {
        // Default: use top models by expertise, lead first
        const sorted = Object.entries(analysis.model_expertise_scores)
          .sort(([, a], [, b]) => (b as number) - (a as number))
          .map(([id]) => id);

        participatingModels = [analysis.discussion_lead];
        for (const modelId of sorted) {
          if (modelId !== analysis.discussion_lead && participatingModels.length < 4) {
            participatingModels.push(modelId);
          }
        }
      }

      // Run discussion turns
      for (let turnNum = 0; turnNum < turns; turnNum++) {
        for (let modelIdx = 0; modelIdx < participatingModels.length; modelIdx++) {
          const modelId = participatingModels[modelIdx];
          const isLead = modelIdx === 0 && turnNum === 0;

          yield {
            type: 'turn_start',
            model_id: modelId,
            data: { turn_number: turnNum + 1, is_lead: isLead }
          };

          const startTime = Date.now();
          const messages = this.buildTurnPrompt(query, modelId, isLead, completedTurns);

          let fullResponse = '';

          try {
            // Stream the response
            for await (const chunk of this.apiClient.streamChat(modelId, messages, {
              max_tokens,
              temperature,
            })) {
              const content = chunk.choices?.[0]?.delta?.content;
              if (content) {
                fullResponse += content;
                yield {
                  type: 'turn_chunk',
                  chunk: content,
                  model_id: modelId
                };
              }
            }

            const responseTime = Date.now() - startTime;

            const turn: DiscussionTurn = {
              turn_number: completedTurns.length + 1,
              model_id: modelId,
              model_name: this.modelProfiles[modelId]?.name || modelId,
              prompt: messages[messages.length - 1].content,
              response: fullResponse,
              response_time_ms: responseTime,
              timestamp: new Date().toISOString()
            };

            // Evaluate turn
            try {
              const { evaluation } = await this.orchestrator.evaluateTurn(
                query,
                modelId,
                fullResponse,
                completedTurns.map(t => t.response)
              );
              turn.evaluation = evaluation;
            } catch (evalError) {
              console.warn('Turn evaluation failed:', evalError);
            }

            completedTurns.push(turn);

            yield {
              type: 'turn_complete',
              turn,
              evaluation: turn.evaluation
            };

          } catch (error: any) {
            yield {
              type: 'error',
              error: `Turn failed for ${modelId}: ${error.message}`,
              model_id: modelId
            };
          }
        }
      }

      // Phase 3: Synthesis
      yield { type: 'synthesis_start' };

      const { synthesis } = await this.orchestrator.planSynthesis(
        query,
        completedTurns.map(t => ({
          modelId: t.model_id,
          response: t.response,
          evaluation: t.evaluation!
        }))
      );

      yield {
        type: 'synthesis_complete',
        synthesis
      };

      yield {
        type: 'discussion_complete',
        data: {
          total_turns: completedTurns.length,
          models: [...new Set(completedTurns.map(t => t.model_id))]
        }
      };

    } catch (error: any) {
      yield {
        type: 'error',
        error: error.message || 'Discussion failed'
      };
    }
  }
}
