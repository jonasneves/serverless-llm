import { SPATIAL_BENCHMARK_SUITES } from '../data/spatialBenchmarkSuites';
import { BenchmarkProfile, SpatialTask } from '../types';

export const BENCHMARK_PROFILE_META: Record<BenchmarkProfile, { label: string; description: string }> = {
  quick: {
    label: 'Quick',
    description: 'Fast confidence check across all three suites.',
  },
  balanced: {
    label: 'Balanced',
    description: 'Broader coverage without the full 45-task sweep.',
  },
  full: {
    label: 'Full Suite',
    description: 'Run every official-derived task in the benchmark.',
  },
};

function evenlySpaced<T>(items: T[], count: number): T[] {
  if (count >= items.length) return items;
  if (count <= 1) return [items[Math.floor(items.length / 2)]];

  const picks: T[] = [];
  const used = new Set<number>();

  for (let i = 0; i < count; i += 1) {
    let index = Math.round((i * (items.length - 1)) / (count - 1));
    while (used.has(index) && index < items.length - 1) index += 1;
    while (used.has(index) && index > 0) index -= 1;
    used.add(index);
    picks.push(items[index]);
  }

  return picks;
}

export function getTasksForBenchmarkProfile(profile: BenchmarkProfile): SpatialTask[] {
  if (profile === 'full') {
    return SPATIAL_BENCHMARK_SUITES.flatMap((suite) => suite.tasks);
  }

  const perSuiteCount = profile === 'quick' ? 3 : 6;
  return SPATIAL_BENCHMARK_SUITES.flatMap((suite) => evenlySpaced(suite.tasks, perSuiteCount));
}

export function getBenchmarkProfileTaskCount(profile: BenchmarkProfile): number {
  return getTasksForBenchmarkProfile(profile).length;
}
