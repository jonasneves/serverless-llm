export interface ThinkingSplit {
  thinking: string | null;
  answer: string;
}

export const splitThinkingContent = (content: string): ThinkingSplit => {
  if (!content) return { thinking: null, answer: '' };

  // Match both <think> and <thinking> tags
  const match = content.match(/<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>\s*([\s\S]*)/i);
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

  return { thinking: null, answer: content };
};
