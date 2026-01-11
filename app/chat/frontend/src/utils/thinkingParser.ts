/**
 * State for tracking thinking tag parsing within a streaming response
 */
export interface ThinkingState {
  inThink: boolean;
  carry: string;
  implicitThinking?: boolean;
  harmonyFormat?: boolean;
}

/**
 * Result of parsing a chunk for thinking content
 */
export interface ThinkingParseResult {
  answerAdd: string;
  thinkingAdd: string;
  newState: ThinkingState;
}

/**
 * Parse a streaming chunk to separate thinking and answer content.
 *
 * Handles:
 * - Standard <think>...</think> and <thinking>...</thinking> tags
 * - Harmony format (GPT-OSS): <|channel|>analysis/final<|message|>
 * - Implicit thinking mode (DeepSeek R1 style)
 */
export function parseThinkingChunk(
  rawChunk: string,
  state: ThinkingState
): ThinkingParseResult {
  const newState = { ...state };
  let textChunk = newState.carry + rawChunk;
  newState.carry = '';

  // Check for partial tags at the end
  const lastLt = textChunk.lastIndexOf('<');
  if (lastLt !== -1 && textChunk.length - lastLt < 12) {
    const tail = textChunk.slice(lastLt);
    if (
      '<think>'.startsWith(tail) || '</think>'.startsWith(tail) ||
      '<thinking>'.startsWith(tail) || '</thinking>'.startsWith(tail)
    ) {
      newState.carry = tail;
      textChunk = textChunk.slice(0, lastLt);
    }
  }

  let thinkingAdd = '';
  let answerAdd = '';

  // Handle Harmony format (GPT-OSS)
  if (newState.harmonyFormat) {
    const finalChannelMarker = '<|channel|>final<|message|>';
    const finalIdx = textChunk.indexOf(finalChannelMarker);

    if (finalIdx !== -1) {
      if (newState.inThink) {
        thinkingAdd += textChunk.slice(0, finalIdx);
      }
      newState.inThink = false;
      answerAdd += textChunk.slice(finalIdx + finalChannelMarker.length);
    } else if (newState.inThink) {
      const cleanChunk = textChunk
        .replace(/<\|channel\|>analysis<\|message\|>/gi, '')
        .replace(/<\|end\|>/gi, '')
        .replace(/<\|start\|>/gi, '')
        .replace(/assistant/gi, '');
      thinkingAdd += cleanChunk;
    } else {
      const cleanChunk = textChunk.replace(/<\|end\|>/gi, '');
      answerAdd += cleanChunk;
    }

    return { answerAdd, thinkingAdd, newState };
  }

  // Check for implicit thinking mode
  if (!newState.inThink && !newState.implicitThinking) {
    const closeThink = textChunk.indexOf('</think>');
    const closeThinking = textChunk.indexOf('</thinking>');
    const hasCloseTag = closeThink !== -1 || closeThinking !== -1;
    const hasOpenTag = textChunk.indexOf('<think>') !== -1 || textChunk.indexOf('<thinking>') !== -1;

    if (hasCloseTag && !hasOpenTag) {
      newState.implicitThinking = true;
      newState.inThink = true;
    }
  }

  // Standard think tag parsing
  let idx = 0;
  while (idx < textChunk.length) {
    if (!newState.inThink) {
      const startThink = textChunk.indexOf('<think>', idx);
      const startThinking = textChunk.indexOf('<thinking>', idx);

      let start = -1;
      let tagLen = 0;
      if (startThink !== -1 && (startThinking === -1 || startThink < startThinking)) {
        start = startThink;
        tagLen = 7;
      } else if (startThinking !== -1) {
        start = startThinking;
        tagLen = 10;
      }

      if (start === -1) {
        answerAdd += textChunk.slice(idx);
        break;
      }
      answerAdd += textChunk.slice(idx, start);
      newState.inThink = true;
      idx = start + tagLen;
    } else {
      const endThink = textChunk.indexOf('</think>', idx);
      const endThinking = textChunk.indexOf('</thinking>', idx);

      let end = -1;
      let tagLen = 0;
      if (endThink !== -1 && (endThinking === -1 || endThink < endThinking)) {
        end = endThink;
        tagLen = 8;
      } else if (endThinking !== -1) {
        end = endThinking;
        tagLen = 11;
      }

      if (end === -1) {
        thinkingAdd += textChunk.slice(idx);
        break;
      }
      thinkingAdd += textChunk.slice(idx, end);
      newState.inThink = false;
      newState.implicitThinking = false;
      idx = end + tagLen;
    }
  }

  return { answerAdd, thinkingAdd, newState };
}
