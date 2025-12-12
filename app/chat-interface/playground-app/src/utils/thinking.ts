export interface ThinkingSplit {
  thinking: string | null;
  answer: string;
}

export const splitThinkingContent = (content: string): ThinkingSplit => {
  if (!content) return { thinking: null, answer: '' };

  const match = content.match(/<think>([\s\S]*?)<\/think>\s*([\s\S]*)/i);
  if (match && match[1] && match[1].trim().length > 0) {
    return {
      thinking: match[1].trim(),
      answer: (match[2] || '').trim(),
    };
  }

  return { thinking: null, answer: content };
};

