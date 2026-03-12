import { BenchmarkProfile } from '../types';
import { BENCHMARK_PROFILE_META, getBenchmarkProfileTaskCount } from '../utils/spatialBenchmarkSelection';

interface BenchmarkControlsProps {
  profile: BenchmarkProfile;
  onChange: (profile: BenchmarkProfile) => void;
}

const PROFILE_ORDER: BenchmarkProfile[] = ['quick', 'balanced', 'full'];

export default function BenchmarkControls({ profile, onChange }: BenchmarkControlsProps) {
  return (
    <div className="border-b border-white/5 bg-slate-950/45 px-4 pb-4 pt-24">
      <div className="rounded-[22px] border border-slate-800/80 bg-[linear-gradient(160deg,rgba(15,23,42,0.96),rgba(2,6,23,0.88))] p-4 shadow-[0_16px_48px_rgba(2,6,23,0.35)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-300">Run Profile</div>
            <p className="mt-1 text-sm leading-6 text-slate-300">
              Choose how much of the official benchmark stack to run before you start.
            </p>
          </div>
          <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-cyan-200">
            {getBenchmarkProfileTaskCount(profile)} tasks
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          {PROFILE_ORDER.map((option) => {
            const meta = BENCHMARK_PROFILE_META[option];
            const active = option === profile;
            return (
              <button
                key={option}
                type="button"
                onClick={() => onChange(option)}
                className={`rounded-2xl border px-4 py-3 text-left transition-all ${
                  active
                    ? 'border-cyan-400/50 bg-cyan-400/12 shadow-[0_0_0_1px_rgba(34,211,238,0.18)]'
                    : 'border-slate-800 bg-white/[0.03] hover:border-slate-700 hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className={`text-sm font-semibold ${active ? 'text-cyan-100' : 'text-slate-200'}`}>{meta.label}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-400">{meta.description}</div>
                  </div>
                  <div className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                    active ? 'bg-cyan-300/15 text-cyan-100' : 'bg-slate-800 text-slate-300'
                  }`}>
                    {getBenchmarkProfileTaskCount(option)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
