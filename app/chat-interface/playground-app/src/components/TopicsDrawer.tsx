import { useEffect, useMemo, useRef, useState } from 'react';
import { CURATED_TOPICS, TOPIC_PACKS, TRENDING_FALLBACK, TRENDING_FEED_URL } from '../constants';
import { TopicPrompt, TrendingTopic } from '../types';

interface TopicsDrawerProps {
  open: boolean;
  onClose: () => void;
  onSelectPrompt: (prompt: string) => void;
}

type TabKey = 'today' | 'packs' | 'trending';

const DAILY_COUNT = 6;

function seededShuffle<T>(items: T[], seed: number): T[] {
  // Simple deterministic shuffle (xorshift32)
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

function formatDate(date?: string) {
  if (!date) return '';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function buildTrendingPrompt(item: TrendingTopic) {
  const link = item.url ? `\nLink: ${item.url}` : '';
  const source = item.source ? `Source: ${item.source}. ` : '';
  return `${source}Give a concise, balanced take on: "${item.title}". Summarize in 5 bullets, list 3 implications, and one action item.${link}`;
}

export default function TopicsDrawer({ open, onClose, onSelectPrompt }: TopicsDrawerProps) {
  const [tab, setTab] = useState<TabKey>('today');
  const [category, setCategory] = useState<string>('all');
  const [trending, setTrending] = useState<TrendingTopic[]>(TRENDING_FALLBACK);
  const [loadingTrending, setLoadingTrending] = useState(false);
  const [trendingError, setTrendingError] = useState<string | null>(null);
  const fetchedTrendingRef = useRef(false);

  const todayTopics: TopicPrompt[] = useMemo(() => {
    if (trending?.length) {
      return trending.slice(0, DAILY_COUNT).map(item => ({
        id: `trend-${item.id}`,
        label: item.title,
        prompt: buildTrendingPrompt(item),
        category: item.tags?.[0] || 'Trending',
        tags: item.tags || ['trending'],
        modes: ['compare', 'council', 'roundtable'],
      }));
    }
    return pickDailyTopics(CURATED_TOPICS, DAILY_COUNT);
  }, [trending]);

  // Close on Escape for consistency with other modals
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Lock background scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open || fetchedTrendingRef.current) return;
    let cancelled = false;
    const fetchFeed = async () => {
      setLoadingTrending(true);
      setTrendingError(null);
      try {
        const res = await fetch(TRENDING_FEED_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data)) throw new Error('Unexpected feed shape');
        if (!cancelled) {
          setTrending(data as TrendingTopic[]);
          fetchedTrendingRef.current = true;
        }
      } catch (err: any) {
        if (!cancelled) {
          setTrendingError(err?.message || 'Failed to load trending feed');
          setTrending(TRENDING_FALLBACK);
        }
      } finally {
        !cancelled && setLoadingTrending(false);
      }
    };
    fetchFeed();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const trendingCategories = useMemo(() => {
    const tags = new Set<string>();
    trending.forEach(item => item.tags?.forEach(tag => tags.add(tag)));
    return ['all', ...Array.from(tags)];
  }, [trending]);

  const filteredTrending = useMemo(() => {
    if (category === 'all') return trending;
    return trending.filter(item => item.tags?.some(tag => tag === category));
  }, [category, trending]);

  if (!open) return null;

  return (
    <div
      data-no-arena-scroll
      className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center bg-black/40 backdrop-blur-[2px]"
      onClick={onClose}
      onWheelCapture={(e) => e.stopPropagation()}
    >
      <div
        data-no-arena-scroll
        className="w-[min(960px,calc(100vw-1.5rem))] max-h-[80vh] rounded-2xl border border-slate-700/70 bg-slate-950/90 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/60 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <span className="text-base font-semibold text-slate-100">Explore Topics</span>
            <span className="text-[11px] text-slate-500">Jump-start prompts with curated or live trends.</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
            aria-label="Close topics"
          >
            ×
          </button>
        </div>

        <div className="flex border-b border-slate-800/60 px-3 sm:px-5 bg-slate-950/70">
          {([
            { key: 'today', label: 'Today' },
            { key: 'packs', label: 'Packs' },
            { key: 'trending', label: 'Trending' },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 sm:px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'text-white border-blue-500'
                  : 'text-slate-400 border-transparent hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'today' && (
          <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 overflow-y-auto topics-scroll">
            {todayTopics.map(topic => (
              <TopicCard key={topic.id} topic={topic} onSelectPrompt={onSelectPrompt} />
            ))}
          </div>
        )}

        {tab === 'packs' && (
          <div className="p-4 sm:p-6 space-y-4 overflow-y-auto topics-scroll">
            {TOPIC_PACKS.map(pack => (
              <div key={pack.id} className="rounded-xl border border-slate-800/60 bg-slate-900/70 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-100">{pack.title}</div>
                    <div className="text-xs text-slate-500">{pack.description}</div>
                  </div>
                  <span className="text-[10px] text-slate-500 px-2 py-1 rounded-full border border-slate-800/70">
                    {pack.topics.length} topics
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {pack.topics.map(topic => (
                    <TopicCard key={topic.id} topic={topic} onSelectPrompt={onSelectPrompt} compact />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'trending' && (
          <div className="p-4 sm:p-6 space-y-3 overflow-y-auto topics-scroll">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="text-xs text-slate-400">Feed:</div>
              <span className="text-xs text-slate-200 bg-slate-800/70 px-2 py-1 rounded border border-slate-700/60">
                {TRENDING_FEED_URL}
              </span>
              {trendingError && (
                <span className="text-xs text-red-300 bg-red-500/10 px-2 py-1 rounded border border-red-500/40">
                  {trendingError}
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                <label className="text-xs text-slate-400">Filter</label>
                <select
                  className="text-xs bg-slate-900 border border-slate-700/60 rounded px-2 py-1 text-slate-200"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {trendingCategories.map(cat => (
                    <option key={cat} value={cat}>{cat === 'all' ? 'All' : cat}</option>
                  ))}
                </select>
              </div>
            </div>
            {loadingTrending && (
              <div className="text-xs text-slate-400">Loading trending topics…</div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredTrending.map(item => (
                <div
                  key={item.id}
                  className="rounded-xl border border-slate-800/60 bg-slate-900/70 p-3 flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-100 leading-snug">{item.title}</div>
                    {item.source && (
                      <span className="text-[10px] text-slate-500 px-2 py-0.5 rounded-full border border-slate-800/70">
                        {item.source}
                      </span>
                    )}
                  </div>
                  {item.summary && (
                    <p className="text-xs text-slate-400 leading-relaxed">{item.summary}</p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap text-[10px] text-slate-500">
                    {item.tags?.map(tag => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded-full bg-slate-800/50 border border-slate-800/80 text-slate-400"
                      >
                        {tag}
                      </span>
                    ))}
                    {item.publishedAt && <span>{formatDate(item.publishedAt)}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-blue-400 hover:text-blue-300 underline"
                      >
                        Open
                      </a>
                    )}
                    <button
                      onClick={() => onSelectPrompt(buildTrendingPrompt(item))}
                      className="ml-auto text-xs px-3 py-1.5 rounded-lg bg-blue-600/80 hover:bg-blue-500 text-white transition-colors"
                    >
                      Use as prompt
                    </button>
                  </div>
                </div>
              ))}
              {filteredTrending.length === 0 && !loadingTrending && (
                <div className="text-xs text-slate-500">No items match this filter.</div>
              )}
            </div>
          </div>
        )}
      </div>
      <style>{`
        .topics-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(71, 85, 105, 0.8) transparent;
        }
        .topics-scroll::-webkit-scrollbar {
          width: 8px;
        }
        .topics-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .topics-scroll::-webkit-scrollbar-thumb {
          background-color: rgba(100, 116, 139, 0.6);
          border-radius: 999px;
        }
        .topics-scroll::-webkit-scrollbar-thumb:hover {
          background-color: rgba(148, 163, 184, 0.8);
        }
      `}</style>
    </div>
  );
}

function TopicCard({ topic, onSelectPrompt, compact = false }: { topic: TopicPrompt; onSelectPrompt: (p: string) => void; compact?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/70 p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <div className="text-sm font-semibold text-slate-100 leading-snug">{topic.label}</div>
          {!compact && topic.category && (
            <span className="text-[11px] text-slate-500 uppercase tracking-wide">{topic.category}</span>
          )}
        </div>
        {topic.modes && (
          <div className="flex items-center gap-1 flex-wrap justify-end">
            {topic.modes.map(m => (
              <span
                key={m}
                className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/60 text-slate-300 border border-slate-700/60"
              >
                {m}
              </span>
            ))}
          </div>
        )}
      </div>
      {!compact && (
        <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">{topic.prompt}</p>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        {topic.tags?.map(tag => (
          <span
            key={tag}
            className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800/50 border border-slate-800/80 text-slate-400"
          >
            {tag}
          </span>
        ))}
        <button
          onClick={() => onSelectPrompt(topic.prompt)}
          className="ml-auto text-xs px-3 py-1.5 rounded-lg bg-blue-600/80 hover:bg-blue-500 text-white transition-colors"
        >
          Use
        </button>
      </div>
    </div>
  );
}
