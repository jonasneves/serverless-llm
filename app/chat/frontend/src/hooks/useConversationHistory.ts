import { useCallback, useRef, useState } from 'react';
import { ChatHistoryEntry, Mode } from '../types';

export function useConversationHistory() {
  const [history, setHistory] = useState<ChatHistoryEntry[]>([]);
  const historyRef = useRef<ChatHistoryEntry[]>([]);

  const pushHistoryEntries = useCallback((entries: ChatHistoryEntry[]) => {
    if (!entries.length) return;
    const next = [...historyRef.current, ...entries];
    historyRef.current = next;
    setHistory(next);
  }, []);

  const clearHistory = useCallback(() => {
    historyRef.current = [];
    setHistory([]);
  }, []);

  const historyToText = useCallback((entries: ChatHistoryEntry[]) => {
    return entries
      .map(entry => `${entry.role === 'user' ? 'User' : 'Assistant'}: ${entry.content}`)
      .join('\n\n');
  }, []);

  const buildCarryoverHistory = useCallback((entries: ChatHistoryEntry[], targetMode: Mode) => {
    if (targetMode === 'compare') return entries;

    const users = entries.filter(entry => entry.role === 'user');
    const lastSynthesis = [...entries]
      .reverse()
      .find(entry =>
        entry.role === 'assistant'
        && entry.kind === 'analyze_synthesis'
        && entry.content.trim().length > 0
      );

    return lastSynthesis ? [...users, lastSynthesis] : users;
  }, []);

  return {
    history,
    historyRef,
    pushHistoryEntries,
    clearHistory,
    historyToText,
    buildCarryoverHistory,
  };
}
