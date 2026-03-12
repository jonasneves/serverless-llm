import React, { useEffect, useMemo, useRef } from 'react';
import * as echarts from 'echarts';
import { SPATIAL_BENCHMARK_SUITE_MAP } from '../data/spatialBenchmarkSuites';
import { BenchmarkResult, CognitiveLevel, COGNITIVE_LEVEL_NAMES, SpatialBenchmarkSuiteId } from '../types';

const FALLBACK_COLORS = ['#5eead4', '#f59e0b', '#60a5fa', '#f472b6', '#34d399', '#f97316', '#a78bfa'];

interface BenchmarkResultsProps {
  results: BenchmarkResult[];
}

interface ModelAggregate {
  modelId: string;
  overallAccuracy: number;
  avgLatencyMs: number;
  deepRate: number;
  consistency: number;
  suiteAccuracies: Record<SpatialBenchmarkSuiteId, number>;
}

function useChart(containerRef: React.RefObject<HTMLDivElement | null>, option: echarts.EChartsOption) {
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = echarts.init(containerRef.current, undefined, { renderer: 'canvas' });
    chart.setOption(option);

    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      chart.dispose();
    };
  }, [containerRef, option]);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function getUniqueModels(results: BenchmarkResult[]): string[] {
  const ids = new Set<string>();
  results.forEach((result) => result.model_results.forEach((modelResult) => ids.add(modelResult.model_id)));
  return Array.from(ids);
}

function getSuiteIds(results: BenchmarkResult[]): SpatialBenchmarkSuiteId[] {
  const ids = new Set<SpatialBenchmarkSuiteId>();
  results.forEach((result) => ids.add(result.suite_id));
  return Array.from(ids);
}

function getModelColorMap(modelIds: string[]): Record<string, string> {
  return Object.fromEntries(
    modelIds.map((modelId, index) => [modelId, FALLBACK_COLORS[index % FALLBACK_COLORS.length]])
  );
}

function getModelAggregate(results: BenchmarkResult[], modelId: string, suiteIds: SpatialBenchmarkSuiteId[]): ModelAggregate {
  const entries = results.flatMap((task) =>
    task.model_results
      .filter((modelResult) => modelResult.model_id === modelId)
      .map((modelResult) => ({ task, modelResult }))
  );

  const accuracies = entries.map((entry) => entry.modelResult.accuracy);
  const latencies = entries.map((entry) => entry.modelResult.response_time_ms).filter((value) => value > 0);
  const deepCount = entries.filter((entry) => entry.modelResult.reasoning_depth === 'deep').length;
  const meanAccuracy = average(accuracies);
  const variance = average(accuracies.map((value) => (value - meanAccuracy) ** 2));

  const suiteAccuracies = Object.fromEntries(
    suiteIds.map((suiteId) => {
      const suiteValues = entries
        .filter((entry) => entry.task.suite_id === suiteId)
        .map((entry) => entry.modelResult.accuracy);
      return [suiteId, average(suiteValues)];
    })
  ) as Record<SpatialBenchmarkSuiteId, number>;

  return {
    modelId,
    overallAccuracy: meanAccuracy,
    avgLatencyMs: average(latencies),
    deepRate: entries.length ? deepCount / entries.length : 0,
    consistency: clamp01(1 - Math.sqrt(variance)),
    suiteAccuracies,
  };
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function formatLatency(value: number): string {
  return value > 0 ? `${Math.round(value)} ms` : 'n/a';
}

function buildHeatmapOption(
  results: BenchmarkResult[],
  modelIds: string[],
  modelColors: Record<string, string>
): echarts.EChartsOption {
  const rowOrder = results.reduce<string[]>((rows, result) => {
    const rowLabel = `${result.suite_name} · L${result.cognitive_level}`;
    if (!rows.includes(rowLabel)) rows.push(rowLabel);
    return rows;
  }, []);

  const rowMetrics = rowOrder.map((rowLabel) => {
    const [suiteName, levelLabel] = rowLabel.split(' · ');
    return { suiteName, levelLabel };
  });

  const source = results.flatMap((result) =>
    result.model_results.map((modelResult) => ({
      model: modelResult.model_id,
      row: `${result.suite_name} · L${result.cognitive_level}`,
      accuracy: Number((modelResult.accuracy * 100).toFixed(2)),
      suite: result.suite_name,
      level: `L${result.cognitive_level} ${COGNITIVE_LEVEL_NAMES[result.cognitive_level as CognitiveLevel]}`,
    }))
  );

  return {
    animationDuration: 500,
    backgroundColor: 'transparent',
    dataset: [{ source }],
    tooltip: {
      backgroundColor: 'rgba(15,23,42,0.95)',
      borderColor: 'rgba(148,163,184,0.2)',
      textStyle: { color: '#e2e8f0' },
      formatter: (params: any) => {
        const value = params.data as { suite: string; level: string; model: string; accuracy: number };
        return [
          `<strong>${value.model}</strong>`,
          `${value.suite} · ${value.level}`,
          `Accuracy: ${value.accuracy.toFixed(1)}%`,
        ].join('<br/>');
      },
    },
    grid: { left: 112, right: 20, top: 20, bottom: 56 },
    xAxis: {
      type: 'category',
      data: modelIds,
      axisLabel: { color: '#cbd5e1', fontSize: 11 },
      axisLine: { lineStyle: { color: '#334155' } },
      splitArea: { show: true, areaStyle: { color: ['rgba(15,23,42,0.05)', 'rgba(30,41,59,0.12)'] } },
    },
    yAxis: {
      type: 'category',
      data: rowOrder,
      axisLabel: {
        color: '#cbd5e1',
        fontSize: 11,
        formatter: (_value: string, index: number) => {
          const row = rowMetrics[index];
          return `${row.suiteName}\n${row.levelLabel}`;
        },
      },
      axisLine: { lineStyle: { color: '#334155' } },
    },
    visualMap: {
      min: 0,
      max: 100,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 6,
      textStyle: { color: '#94a3b8' },
      inRange: {
        color: ['#1f2937', '#0f766e', '#22c55e', '#fde047'],
      },
    },
    series: [{
      type: 'heatmap',
      datasetIndex: 0,
      encode: { x: 'model', y: 'row', value: 'accuracy' },
      progressive: 0,
      itemStyle: {
        borderColor: 'rgba(15,23,42,0.75)',
        borderWidth: 2,
      },
      label: {
        show: true,
        color: '#f8fafc',
        fontSize: 10,
        formatter: (params: any) => `${params.data.accuracy.toFixed(0)}%`,
      },
      emphasis: {
        itemStyle: {
          shadowBlur: 24,
          shadowColor: 'rgba(15,23,42,0.45)',
        },
      },
    }],
    graphic: modelIds.map((modelId, index) => ({
      type: 'circle',
      right: 20 + index * 18,
      top: 8,
      shape: { r: 4 },
      style: { fill: modelColors[modelId] },
      silent: true,
    })),
  };
}

function buildParallelOption(modelAggregates: ModelAggregate[], modelColors: Record<string, string>): echarts.EChartsOption {
  const suiteIds = Array.from(new Set(modelAggregates.flatMap((aggregate) => Object.keys(aggregate.suiteAccuracies)))) as SpatialBenchmarkSuiteId[];

  return {
    animationDuration: 500,
    backgroundColor: 'transparent',
    parallelAxis: [
      { dim: 0, name: 'Overall', min: 0, max: 100, nameTextStyle: { color: '#cbd5e1' }, axisLabel: { color: '#94a3b8' } },
      ...suiteIds.map((suiteId, index) => ({
        dim: index + 1,
        name: SPATIAL_BENCHMARK_SUITE_MAP[suiteId].short_name,
        min: 0,
        max: 100,
        nameTextStyle: { color: '#cbd5e1' },
        axisLabel: { color: '#94a3b8' },
      })),
      {
        dim: suiteIds.length + 1,
        name: 'Deep',
        min: 0,
        max: 100,
        nameTextStyle: { color: '#cbd5e1' },
        axisLabel: { color: '#94a3b8' },
      },
      {
        dim: suiteIds.length + 2,
        name: 'Stable',
        min: 0,
        max: 100,
        nameTextStyle: { color: '#cbd5e1' },
        axisLabel: { color: '#94a3b8' },
      },
    ],
    parallel: {
      left: 36,
      right: 36,
      top: 28,
      bottom: 24,
      parallelAxisDefault: {
        type: 'value',
        axisLine: { lineStyle: { color: '#475569' } },
        axisTick: { lineStyle: { color: '#475569' } },
        splitLine: { lineStyle: { color: '#1e293b' } },
      },
    },
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(15,23,42,0.95)',
      borderColor: 'rgba(148,163,184,0.2)',
      textStyle: { color: '#e2e8f0' },
      formatter: (params: any) => {
        const data = params.data as number[];
        const modelId = params.seriesName;
        return [
          `<strong>${modelId}</strong>`,
          `Overall: ${data[0].toFixed(1)}%`,
          ...suiteIds.map((suiteId, index) => `${SPATIAL_BENCHMARK_SUITE_MAP[suiteId].short_name}: ${data[index + 1].toFixed(1)}%`),
          `Deep reasoning: ${data[suiteIds.length + 1].toFixed(1)}%`,
          `Consistency: ${data[suiteIds.length + 2].toFixed(1)}%`,
        ].join('<br/>');
      },
    },
    series: modelAggregates.map((aggregate) => ({
      name: aggregate.modelId,
      type: 'parallel',
      lineStyle: {
        width: 3,
        color: modelColors[aggregate.modelId],
        opacity: 0.9,
      },
      data: [[
        aggregate.overallAccuracy * 100,
        ...suiteIds.map((suiteId) => aggregate.suiteAccuracies[suiteId] * 100),
        aggregate.deepRate * 100,
        aggregate.consistency * 100,
      ]],
    })),
  };
}

function buildScatterOption(modelAggregates: ModelAggregate[], modelColors: Record<string, string>): echarts.EChartsOption {
  const source = modelAggregates.map((aggregate) => ({
    model: aggregate.modelId,
    latency: aggregate.avgLatencyMs,
    accuracy: Number((aggregate.overallAccuracy * 100).toFixed(2)),
    deepRate: Number((aggregate.deepRate * 100).toFixed(2)),
    stability: Number((aggregate.consistency * 100).toFixed(2)),
  }));

  return {
    animationDuration: 500,
    backgroundColor: 'transparent',
    dataset: [{ source }],
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(15,23,42,0.95)',
      borderColor: 'rgba(148,163,184,0.2)',
      textStyle: { color: '#e2e8f0' },
      formatter: (params: any) => {
        const value = params.data as { model: string; latency: number; accuracy: number; deepRate: number; stability: number };
        return [
          `<strong>${value.model}</strong>`,
          `Accuracy: ${value.accuracy.toFixed(1)}%`,
          `Latency: ${value.latency ? `${Math.round(value.latency)} ms` : 'n/a'}`,
          `Deep reasoning: ${value.deepRate.toFixed(1)}%`,
          `Consistency: ${value.stability.toFixed(1)}%`,
        ].join('<br/>');
      },
    },
    toolbox: {
      right: 8,
      top: 4,
      iconStyle: { borderColor: '#94a3b8' },
      feature: {
        dataZoom: {},
        restore: {},
        saveAsImage: {},
      },
    },
    grid: { left: 48, right: 24, top: 28, bottom: 44 },
    xAxis: {
      type: 'value',
      name: 'Latency (ms)',
      nameTextStyle: { color: '#94a3b8' },
      axisLabel: { color: '#94a3b8' },
      splitLine: { lineStyle: { color: '#1e293b' } },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      name: 'Accuracy',
      nameTextStyle: { color: '#94a3b8' },
      axisLabel: { color: '#94a3b8', formatter: (value: number) => `${value.toFixed(0)}%` },
      splitLine: { lineStyle: { color: '#1e293b' } },
    },
    visualMap: {
      type: 'continuous',
      min: 0,
      max: 100,
      dimension: 3,
      right: 6,
      bottom: 8,
      text: ['Deep', 'Shallow'],
      textStyle: { color: '#94a3b8' },
      inRange: { color: ['#38bdf8', '#22c55e', '#f97316'] },
    },
    dataZoom: [
      { type: 'inside', xAxisIndex: 0 },
      { type: 'slider', xAxisIndex: 0, height: 14, bottom: 8 },
    ],
    series: [{
      type: 'scatter',
      datasetIndex: 0,
      encode: { x: 'latency', y: 'accuracy', tooltip: ['model', 'accuracy', 'latency', 'deepRate', 'stability'] },
      symbolSize: (value: number[]) => 14 + value[4] * 0.14,
      itemStyle: {
        borderColor: 'rgba(255,255,255,0.85)',
        borderWidth: 1.5,
      },
      label: {
        show: true,
        position: 'top',
        color: '#e2e8f0',
        fontSize: 11,
        formatter: (params: any) => params.data.model,
      },
      emphasis: {
        itemStyle: {
          shadowBlur: 24,
          shadowColor: 'rgba(15,23,42,0.45)',
        },
      },
    }],
    graphic: source.map((entry, index) => ({
      type: 'circle',
      left: 10 + index * 14,
      top: 10,
      shape: { r: 3 },
      style: { fill: modelColors[entry.model] },
      silent: true,
    })),
  };
}

function buildSunburstOption(results: BenchmarkResult[]): echarts.EChartsOption {
  const suiteIds = getSuiteIds(results);
  const data = suiteIds.map((suiteId) => {
    const suite = SPATIAL_BENCHMARK_SUITE_MAP[suiteId];
    const suiteResults = results.filter((result) => result.suite_id === suiteId);
    const categories = Array.from(new Set(suiteResults.map((result) => result.category)));

    return {
      name: suite.short_name,
      itemStyle: { color: suite.accent },
      children: categories.map((category) => {
        const categoryResults = suiteResults.filter((result) => result.category === category);
        const levelNodes = Array.from(new Set(categoryResults.map((result) => result.cognitive_level))).map((level) => {
          const taskValues = categoryResults
            .filter((result) => result.cognitive_level === level)
            .map((result) => {
              const avgError = average(result.model_results.map((modelResult) => 1 - modelResult.accuracy));
              return {
                name: result.task_id,
                value: Number((avgError * 100).toFixed(2)),
              };
            });

          return {
            name: `L${level}`,
            value: Number(taskValues.reduce((sum, value) => sum + value.value, 0).toFixed(2)),
            children: taskValues,
          };
        });

        return {
          name: category,
          value: Number(levelNodes.reduce((sum, value) => sum + value.value, 0).toFixed(2)),
          children: levelNodes,
        };
      }),
    };
  });

  return {
    animationDuration: 500,
    backgroundColor: 'transparent',
    tooltip: {
      backgroundColor: 'rgba(15,23,42,0.95)',
      borderColor: 'rgba(148,163,184,0.2)',
      textStyle: { color: '#e2e8f0' },
      formatter: (params: any) => {
        const value = typeof params.value === 'number' ? params.value.toFixed(1) : params.value;
        return `<strong>${params.name}</strong><br/>Error mass: ${value}%`;
      },
    },
    series: [{
      type: 'sunburst',
      radius: [28, '92%'],
      sort: undefined,
      emphasis: { focus: 'ancestor' },
      nodeClick: 'rootToNode',
      levels: [
        {},
        { r0: '12%', r: '34%', label: { rotate: 0, color: '#e2e8f0' } },
        { r0: '36%', r: '60%', label: { color: '#cbd5e1' } },
        { r0: '62%', r: '92%', label: { color: '#94a3b8', fontSize: 10 } },
      ],
      data,
      itemStyle: {
        borderWidth: 2,
        borderColor: 'rgba(15,23,42,0.9)',
      },
      label: { overflow: 'truncate' },
    }],
  };
}

export default function BenchmarkResults({ results }: BenchmarkResultsProps) {
  const heatmapRef = useRef<HTMLDivElement>(null);
  const parallelRef = useRef<HTMLDivElement>(null);
  const scatterRef = useRef<HTMLDivElement>(null);
  const sunburstRef = useRef<HTMLDivElement>(null);

  const modelIds = useMemo(() => getUniqueModels(results), [results]);
  const suiteIds = useMemo(() => getSuiteIds(results), [results]);
  const modelColors = useMemo(() => getModelColorMap(modelIds), [modelIds]);

  const modelAggregates = useMemo(
    () => modelIds.map((modelId) => getModelAggregate(results, modelId, suiteIds)),
    [modelIds, results, suiteIds]
  );

  const sortedModels = [...modelAggregates].sort((left, right) => right.overallAccuracy - left.overallAccuracy);
  const topModel = sortedModels[0];

  const suiteSummary = suiteIds.map((suiteId) => {
    const suiteResults = results.filter((result) => result.suite_id === suiteId);
    const taskCount = suiteResults.length;
    const meanAccuracy = average(
      suiteResults.flatMap((result) => result.model_results.map((modelResult) => modelResult.accuracy))
    );
    const meanLatency = average(
      suiteResults.flatMap((result) => result.model_results.map((modelResult) => modelResult.response_time_ms).filter((value) => value > 0))
    );

    return {
      suite: SPATIAL_BENCHMARK_SUITE_MAP[suiteId],
      taskCount,
      meanAccuracy,
      meanLatency,
    };
  });

  const heatmapOption = useMemo(() => buildHeatmapOption(results, modelIds, modelColors), [results, modelIds, modelColors]);
  const parallelOption = useMemo(() => buildParallelOption(modelAggregates, modelColors), [modelAggregates, modelColors]);
  const scatterOption = useMemo(() => buildScatterOption(modelAggregates, modelColors), [modelAggregates, modelColors]);
  const sunburstOption = useMemo(() => buildSunburstOption(results), [results]);

  useChart(heatmapRef, heatmapOption);
  useChart(parallelRef, parallelOption);
  useChart(scatterRef, scatterOption);
  useChart(sunburstRef, sunburstOption);

  if (results.length === 0) {
    return <div className="text-sm italic text-slate-400">No benchmark results yet.</div>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-700/40 bg-[radial-gradient(circle_at_top_left,_rgba(94,234,212,0.16),_transparent_34%),linear-gradient(160deg,rgba(15,23,42,0.94),rgba(2,6,23,0.86))] p-5 shadow-[0_24px_80px_rgba(2,6,23,0.45)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-teal-300">Spatial Benchmark Observatory</div>
            <h3 className="text-2xl font-semibold tracking-tight text-slate-50">StepGame, SPARTQA, and SPaRC as separate signals, not one blended score.</h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              This dashboard treats the benchmark as three complementary official suites: symbolic composition, richer text grounding, and hard pathfinding stress tests.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Tasks</div>
              <div className="mt-1 text-2xl font-semibold text-slate-50">{results.length}</div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Models</div>
              <div className="mt-1 text-2xl font-semibold text-slate-50">{modelIds.length}</div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Top Accuracy</div>
              <div className="mt-1 text-2xl font-semibold text-emerald-300">{topModel ? formatPercent(topModel.overallAccuracy) : 'n/a'}</div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Leader</div>
              <div className="mt-1 text-base font-semibold text-slate-50">{topModel?.modelId ?? 'n/a'}</div>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {suiteSummary.map(({ suite, taskCount, meanAccuracy, meanLatency }) => (
            <article
              key={suite.id}
              className="rounded-3xl border border-white/10 bg-slate-950/45 p-4"
              style={{ boxShadow: `inset 0 1px 0 rgba(255,255,255,0.03), 0 0 0 1px ${suite.accent}18` }}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">{suite.short_name}</div>
                  <div className="mt-1 text-lg font-semibold text-slate-50">{suite.focus}</div>
                </div>
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: suite.accent }} />
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-300">{suite.description}</p>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-slate-400">{taskCount} tasks</span>
                <a className="text-slate-200 underline decoration-slate-500/60 underline-offset-4" href={suite.source_url} target="_blank" rel="noreferrer">
                  Source
                </a>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white/5 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Mean Accuracy</div>
                  <div className="mt-1 text-lg font-semibold text-slate-50">{formatPercent(meanAccuracy)}</div>
                </div>
                <div className="rounded-2xl bg-white/5 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Mean Latency</div>
                  <div className="mt-1 text-lg font-semibold text-slate-50">{formatLatency(meanLatency)}</div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-[24px] border border-slate-700/40 bg-slate-900/55 p-4">
          <div className="mb-3">
            <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-200">Suite x Level Heatmap</h3>
            <p className="mt-1 text-sm text-slate-400">Read across rows to see which models hold up as the benchmark gets harder and shifts task style.</p>
          </div>
          <div ref={heatmapRef} style={{ width: '100%', height: 420 }} />
        </section>

        <section className="rounded-[24px] border border-slate-700/40 bg-slate-900/55 p-4">
          <div className="mb-3">
            <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-200">Model Profile Lanes</h3>
            <p className="mt-1 text-sm text-slate-400">Parallel coordinates highlight tradeoffs between benchmark families, deep reasoning rate, and score stability.</p>
          </div>
          <div ref={parallelRef} style={{ width: '100%', height: 420 }} />
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-[24px] border border-slate-700/40 bg-slate-900/55 p-4">
          <div className="mb-3">
            <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-200">Error Topology</h3>
            <p className="mt-1 text-sm text-slate-400">The sunburst breaks total miss rate into suite, category, level, and task slices.</p>
          </div>
          <div ref={sunburstRef} style={{ width: '100%', height: 420 }} />
        </section>

        <section className="rounded-[24px] border border-slate-700/40 bg-slate-900/55 p-4">
          <div className="mb-3">
            <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-200">Latency vs Accuracy</h3>
            <p className="mt-1 text-sm text-slate-400">Color shows deep-reasoning rate. Larger bubbles are more consistent across tasks.</p>
          </div>
          <div ref={scatterRef} style={{ width: '100%', height: 420 }} />
        </section>
      </div>

      <section className="overflow-x-auto rounded-[24px] border border-slate-700/40 bg-slate-900/55 p-4">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-200">Task Matrix</h3>
            <p className="mt-1 text-sm text-slate-400">Each row is a benchmark task. The table stays explicit so the charts never become a black box.</p>
          </div>
        </div>
        <table className="w-full min-w-[880px] text-left text-sm text-slate-300">
          <thead>
            <tr className="border-b border-slate-700/50 text-[11px] uppercase tracking-[0.18em] text-slate-400">
              <th className="px-3 py-3 font-medium">Suite</th>
              <th className="px-3 py-3 font-medium">Task</th>
              <th className="px-3 py-3 font-medium">Category</th>
              <th className="px-3 py-3 font-medium">Level</th>
              {modelIds.map((modelId) => (
                <th key={modelId} className="px-3 py-3 font-medium">{modelId}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.map((task) => (
              <tr key={task.task_id} className="border-b border-slate-800/70 align-top hover:bg-white/[0.03]">
                <td className="px-3 py-3">
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-200">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SPATIAL_BENCHMARK_SUITE_MAP[task.suite_id].accent }} />
                    {task.suite_name}
                  </div>
                </td>
                <td className="max-w-[280px] px-3 py-3 font-mono text-xs text-slate-300">{task.task_id}</td>
                <td className="px-3 py-3 capitalize text-slate-400">{task.category}</td>
                <td className="px-3 py-3 text-slate-400">L{task.cognitive_level} {COGNITIVE_LEVEL_NAMES[task.cognitive_level]}</td>
                {modelIds.map((modelId) => {
                  const modelResult = task.model_results.find((candidate) => candidate.model_id === modelId);
                  if (!modelResult) {
                    return <td key={modelId} className="px-3 py-3 text-slate-600">-</td>;
                  }

                  const accuracyColor =
                    modelResult.accuracy >= 0.8 ? 'text-emerald-300' :
                      modelResult.accuracy >= 0.5 ? 'text-amber-300' :
                        'text-rose-300';

                  return (
                    <td key={modelId} className="px-3 py-3">
                      <div className={`font-semibold ${accuracyColor}`}>{formatPercent(modelResult.accuracy)}</div>
                      <div className="mt-1 text-[11px] text-slate-500">{modelResult.reasoning_depth}</div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
