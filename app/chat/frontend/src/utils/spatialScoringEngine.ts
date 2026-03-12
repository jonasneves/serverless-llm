/**
 * Heuristic scoring engine for spatial reasoning task answers
 */

import { extractDirectionSequence, extractKeywords } from './spatialAnswerExtraction';

export interface ScoringResult {
  accuracy: number;
  reasoning: string;
}

export function scoreSpatialAnswer(
  predicted: string,
  expected: string,
  taskFormat: 'free_text' | 'direction' | 'entity' | 'description'
): ScoringResult {
  const pred = predicted.toLowerCase().trim();
  const exp = expected.toLowerCase().trim();

  if (pred === exp) {
    return { accuracy: 1.0, reasoning: 'Exact match' };
  }

  if (taskFormat === 'entity') {
    // Check for entity name or color presence
    if (pred.includes(exp) || exp.includes(pred)) {
      return { accuracy: 1.0, reasoning: 'Direct match' };
    }

    // Check for partial word overlap (e.g., 'green chair' vs 'green')
    const predWords = new Set(pred.split(/\s+/));
    const expWords = new Set(exp.split(/\s+/));
    const overlap = [...predWords].filter(w => expWords.has(w)).length;

    if (overlap > 0) {
      return { accuracy: 0.7, reasoning: `Partial match (${overlap} word overlap)` };
    }

    return { accuracy: 0.0, reasoning: 'No match' };
  }

  if (taskFormat === 'direction') {
    const expectedSequence = extractDirectionSequence(exp);
    const predictedSequence = extractDirectionSequence(pred);

    if (expectedSequence.length === 0 && predictedSequence.length === 0) {
      return { accuracy: 0.5, reasoning: 'No cardinal directions found' };
    }

    if (expectedSequence.length === 0) {
      return { accuracy: 0.3, reasoning: 'Predicted directions but none expected' };
    }

    const positionalMatches = expectedSequence.filter((direction, index) => predictedSequence[index] === direction).length;
    const lengthPenalty = predictedSequence.length === expectedSequence.length
      ? 0
      : Math.min(0.25, Math.abs(predictedSequence.length - expectedSequence.length) * 0.05);
    const accuracy = Math.max(0, (positionalMatches / expectedSequence.length) - lengthPenalty);

    return {
      accuracy,
      reasoning: `Matched ${positionalMatches}/${expectedSequence.length} directions in order`
    };
  }

  if (taskFormat === 'description') {
    // Word overlap scoring
    const expectedKeywords = extractKeywords(exp);
    const predictedKeywords = extractKeywords(pred);

    if (expectedKeywords.length === 0) {
      return { accuracy: 0.5, reasoning: 'Cannot parse expected answer' };
    }

    const overlap = expectedKeywords.filter(k => predictedKeywords.includes(k)).length;
    const accuracy = overlap / expectedKeywords.length;

    return {
      accuracy: Math.min(1.0, accuracy),
      reasoning: `Found ${overlap}/${expectedKeywords.length} key terms`
    };
  }

  // free_text: fallback to word overlap
  const predWords = pred.split(/\s+/).filter(w => w.length > 3);
  const expWords = exp.split(/\s+/).filter(w => w.length > 3);

  if (expWords.length === 0) {
    return { accuracy: 0.5, reasoning: 'Cannot parse expected answer' };
  }

  const overlap = predWords.filter(w => expWords.includes(w)).length;
  const accuracy = overlap / expWords.length;

  return {
    accuracy: Math.min(1.0, accuracy),
    reasoning: `Word overlap: ${overlap}/${expWords.length} key words`
  };
}

export function assessReasoningDepth(response: string): 'shallow' | 'adequate' | 'deep' {
  const lower = response.toLowerCase();

  // Check for explanation markers
  const hasExplanation = /because|reason|since|thus|therefore|as a result/i.test(lower);

  // Check for step-by-step reasoning (multiple sentences)
  const sentenceCount = (response.match(/[.!?]\s/g) || []).length;
  const hasSteps = sentenceCount >= 2;

  // Check for spatial/landmark references
  const hasLandmarks = /landmark|reference|object|position|direction|location|relative|coordinate/i.test(lower);

  // Check for comparison or contrast
  const hasComparison = /compared|contrast|versus|while|however|instead|different/i.test(lower);

  if (!hasExplanation && sentenceCount <= 1) return 'shallow';
  if (hasLandmarks && (hasSteps || hasComparison)) return 'deep';
  if (hasExplanation || hasSteps) return 'adequate';

  return 'shallow';
}
