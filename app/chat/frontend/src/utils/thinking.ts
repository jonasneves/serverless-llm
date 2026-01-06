export interface ThinkingSplit {
  thinking: string | null;
  answer: string;
}

export const splitThinkingContent = (content: string): ThinkingSplit => {
  if (!content) return { thinking: null, answer: '' };

  // Match <think>...</think> or <thinking>...</thinking> tags
  // The closing tag must match the opening tag type
  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>\s*([\s\S]*)/i);
  const thinkingMatch = content.match(/<thinking>([\s\S]*?)<\/thinking>\s*([\s\S]*)/i);

  // Use whichever match appears first in the content
  let match = null;
  if (thinkMatch && thinkingMatch) {
    match = content.indexOf('<think>') < content.indexOf('<thinking>') ? thinkMatch : thinkingMatch;
  } else {
    match = thinkMatch || thinkingMatch;
  }

  if (match) {
    const thinkingContent = match[1]?.trim();
    const answerContent = (match[2] || '').trim();

    // Only return thinking if it has actual content
    if (thinkingContent && thinkingContent.length > 0) {
      return {
        thinking: thinkingContent,
        answer: answerContent,
      };
    }

    // If thinking is empty, return just the answer without the empty tags
    return { thinking: null, answer: answerContent };
  }

  // Handle implicit thinking: content ends with </think> or </thinking> but has no opening tag
  // Common with DeepSeek R1: "thinking content... </think>\n\nactual response"
  const implicitThinkMatch = content.match(/^([\s\S]*?)<\/think>\s*([\s\S]*)/i);
  const implicitThinkingMatch = content.match(/^([\s\S]*?)<\/thinking>\s*([\s\S]*)/i);

  const implicitMatch = implicitThinkMatch || implicitThinkingMatch;
  if (implicitMatch) {
    const thinkingContent = implicitMatch[1]?.trim();
    const answerContent = (implicitMatch[2] || '').trim();

    if (thinkingContent && thinkingContent.length > 0 && answerContent.length > 0) {
      return {
        thinking: thinkingContent,
        answer: answerContent,
      };
    }
  }

  return { thinking: null, answer: content };
};

