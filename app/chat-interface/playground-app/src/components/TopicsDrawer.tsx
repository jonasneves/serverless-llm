import { useEffect, useMemo, useRef, useState } from 'react';
import { CURATED_TOPICS, TRENDING_FALLBACK, TRENDING_FEED_URL } from '../constants';
import { TopicPrompt, TrendingTopic } from '../types';
import { Search, X, Sparkles } from 'lucide-react';

interface TopicsDrawerProps {
  open: boolean;
  onClose: () => void;
  onSelectPrompt: (prompt: string) => void;
}

const QUICK_TOPIC_COUNT = 5;

function seededShuffle<T>(items: T[], seed: number): T[] {
  let state = seed || 1;
  const next = () => {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return Math.abs(state);
  };
  return [...items]
    .map(value => ({ value, sort: next() }))
    .sort((a, b) => a.sort - b.sort)
    .map(item => item.value);
}

function pickDailyTopics(topics: TopicPrompt[], count: number): TopicPrompt[] {
  const today = new Date();
  const seed = Number(
    `${today.getUTCFullYear()}${String(today.getUTCMonth() + 1).padStart(2, '0')}${String(today.getUTCDate()).padStart(2, '0')}`,
  );
  return seededShuffle(topics, seed).slice(0, count);
}

function buildTrendingPrompt(item: TrendingTopic) {
  const link = item.url ? `\nLink: ${item.url}` : '';
  const source = item.source ? `Source: ${item.source}. ` : '';
  return `${source}Give a concise, balanced take on: "${item.title}". Summarize in 5 bullets, list 3 implications, and one action item.${link}`;
}

export default function TopicsDrawer({ open, onClose, onSelectPrompt }: TopicsDrawerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [trending, setTrending] = useState<TrendingTopic[]>(TRENDING_FALLBACK);
  const [loadingTrending, setLoadingTrending] = useState(false);
  const fetchedTrendingRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Quick topics - daily rotation from curated list
  const quickTopics = useMemo(() => pickDailyTopics(CURATED_TOPICS, QUICK_TOPIC_COUNT), []);

  // All searchable topics (curated + trending converted to TopicPrompt format)
  const allTopics = useMemo(() => {
    const trendingAsTopics: TopicPrompt[] = trending.map(item => ({
      id: `trend-${item.id}`,
      label: item.title,
      prompt: buildTrendingPrompt(item),
      category: item.tags?.[0] || 'Trending',
      tags: item.tags || ['trending'],
    }));
    return [...CURATED_TOPICS, ...trendingAsTopics];
  }, [trending]);

  // Filtered results based on search
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return allTopics
      .filter(topic =>
        topic.label.toLowerCase().includes(q) ||
        topic.category?.toLowerCase().includes(q) ||
        topic.tags?.some(tag => tag.toLowerCase().includes(q)) ||
        topic.prompt.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [searchQuery, allTopics]);

  const showSearchResults = searchQuery.trim().length > 0 && searchResults.length > 0;

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (searchQuery) {
          setSearchQuery('');
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose, searchQuery]);

  // Fetch trending topics
  useEffect(() => {
    if (!open || fetchedTrendingRef.current) return;
    let cancelled = false;
    const fetchFeed = async () => {
      setLoadingTrending(true);
      try {
        const res = await fetch(TRENDING_FEED_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data)) throw new Error('Unexpected feed shape');
        if (!cancelled) {
          setTrending(data as TrendingTopic[]);
          fetchedTrendingRef.current = true;
        }
      } catch {
        if (!cancelled) {
          setTrending(TRENDING_FALLBACK);
        }
      } finally {
        !cancelled && setLoadingTrending(false);
      }
    };
    fetchFeed();
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSearchQuery('');
    }
  }, [open]);

  const handleSelectTopic = (prompt: string) => {
    onSelectPrompt(prompt);
    onClose();
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] bg-black/20"
        onClick={onClose}
      />

      {/* Bottom Sheet */}
      <div
        data-no-arena-scroll
        className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[101] w-[min(640px,calc(100vw-2rem))] animate-in slide-in-from-bottom-4 fade-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-2xl border border-slate-700/60 bg-slate-900/95 backdrop-blur-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/50">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-amber-400" />
              <span className="text-sm font-medium text-slate-200">Quick Topics</span>
            </div>
            <button
              onClick={onClose}
              className="w-6 h-6 rounded-md flex items-center justify-center text-slate-500 hover:text-white hover:bg-slate-800/60 transition-colors"
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>

          {/* Quick Topic Pills */}
          <div className="px-4 py-3 flex flex-wrap gap-2">
            {quickTopics.map(topic => (
              <button
                key={topic.id}
                onClick={() => handleSelectTopic(topic.prompt)}
                className="group px-3 py-1.5 rounded-full text-xs font-medium bg-slate-800/70 hover:bg-blue-600/80 text-slate-300 hover:text-white border border-slate-700/50 hover:border-blue-500/50 transition-all duration-150 max-w-[180px] truncate"
                title={topic.label}
              >
                {topic.label}
              </button>
            ))}
          </div>

          {/* Search Section */}
          <div className="px-4 pb-3">
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                <Search size={14} />
              </div>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search all topics..."
                className="w-full pl-9 pr-8 py-2 text-sm bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-slate-600 focus:bg-slate-800/70 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Search Results */}
            {showSearchResults && (
              <div className="mt-2 max-h-[200px] overflow-y-auto rounded-lg border border-slate-700/50 bg-slate-800/50 divide-y divide-slate-700/30">
                {searchResults.map(topic => (
                  <button
                    key={topic.id}
                    onClick={() => handleSelectTopic(topic.prompt)}
                    className="w-full px-3 py-2.5 text-left hover:bg-slate-700/50 transition-colors group"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-slate-200 group-hover:text-white truncate">
                        {topic.label}
                      </span>
                      {topic.category && (
                        <span className="text-[10px] text-slate-500 px-1.5 py-0.5 rounded bg-slate-800/80 shrink-0">
                          {topic.category}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Empty state for search */}
            {searchQuery.trim() && searchResults.length === 0 && !loadingTrending && (
              <div className="mt-2 px-3 py-3 text-center text-xs text-slate-500 bg-slate-800/30 rounded-lg border border-slate-700/30">
                No topics found for "{searchQuery}"
              </div>
            )}
          </div>

          {/* Footer hint */}
          <div className="px-4 py-2 border-t border-slate-800/50 bg-slate-950/50">
            <span className="text-[10px] text-slate-500">
              Click a topic to use it as your prompt · <kbd className="px-1 py-0.5 rounded bg-slate-800/80 text-slate-400">esc</kbd> to close
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
