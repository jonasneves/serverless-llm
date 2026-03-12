import React, { useRef, useEffect } from 'react';
import * as echarts from 'echarts';
import { BenchmarkResult, CognitiveLevel, COGNITIVE_LEVEL_NAMES } from '../types';

const MODEL_COLORS = [
  '#60a5fa', // blue-400
  '#f472b6', // pink-400
  '#34d399', // emerald-400
  '#fbbf24', // amber-400
  '#a78bfa', // violet-400
  '#fb923c', // orange-400
];

interface BenchmarkResultsProps {
  results: BenchmarkResult[];
}

function useChart(
  containerRef: React.RefObject<HTMLDivElement | null>,
  option: echarts.EChartsOption,
) {
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
  }, [option, containerRef]);
}

function getUniqueModels(results: BenchmarkResult[]): string[] {
  const ids = new Set<string>();
  results.forEach(r => r.model_results.forEach(m => ids.add(m.model_id)));
  return Array.from(ids);
}

function avgAccuracyByLevel(
  results: BenchmarkResult[],
  modelId: string,
  level: CognitiveLevel,
): number {
  const matching = results
    .filter(r => r.cognitive_level === level)
    .flatMap(r => r.model_results.filter(m => m.model_id === modelId));
  if (matching.length === 0) return 0;
  return matching.reduce((sum, m) => sum + m.accuracy, 0) / matching.length;
}

function avgAccuracyByCategory(
  results: BenchmarkResult[],
  modelId: string,
  category: string,
): number {
  const matching = results
    .filter(r => r.category === category)
    .flatMap(r => r.model_results.filter(m => m.model_id === modelId));
  if (matching.length === 0) return 0;
  return matching.reduce((sum, m) => sum + m.accuracy, 0) / matching.length;
}

export default function BenchmarkResults({ results }: BenchmarkResultsProps) {
  const radarRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const scatterRef = useRef<HTMLDivElement>(null);

  const uniqueModels = getUniqueModels(results);
  const levels: CognitiveLevel[] = [1, 2, 3, 4, 5];
  const categories = ['route', 'relationship', 'perspective'];

  // Radar chart: accuracy across 5 cognitive levels
  const radarOption: echarts.EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: {},
    legend: {
      bottom: 0,
      textStyle: { color: '#94a3b8', fontSize: 11 },
      data: uniqueModels,
    },
    radar: {
      indicator: levels.map(l => ({
        name: `L${l} ${COGNITIVE_LEVEL_NAMES[l]}`,
        max: 1,
      })),
      shape: 'polygon',
      splitNumber: 4,
      axisName: { color: '#cbd5e1', fontSize: 11 },
      splitLine: { lineStyle: { color: '#334155' } },
      splitArea: { areaStyle: { color: ['transparent', 'rgba(51,65,85,0.15)'] } },
      axisLine: { lineStyle: { color: '#475569' } },
    },
    series: [{
      type: 'radar',
      data: uniqueModels.map((model, i) => ({
        name: model,
        value: levels.map(l => avgAccuracyByLevel(results, model, l)),
        areaStyle: { opacity: 0.15 },
        lineStyle: { width: 2 },
        itemStyle: { color: MODEL_COLORS[i % MODEL_COLORS.length] },
        symbol: 'circle',
        symbolSize: 5,
      })),
    }],
  };

  // Bar chart: accuracy by category
  const barOption: echarts.EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: {
      bottom: 0,
      textStyle: { color: '#94a3b8', fontSize: 11 },
    },
    grid: { left: 48, right: 16, top: 16, bottom: 40 },
    xAxis: {
      type: 'category',
      data: categories.map(c => c.charAt(0).toUpperCase() + c.slice(1)),
      axisLabel: { color: '#94a3b8' },
      axisLine: { lineStyle: { color: '#475569' } },
    },
    yAxis: {
      type: 'value',
      max: 1,
      axisLabel: { color: '#94a3b8', formatter: (v: number) => `${(v * 100).toFixed(0)}%` },
      splitLine: { lineStyle: { color: '#334155' } },
    },
    series: uniqueModels.map((model, i) => ({
      name: model,
      type: 'bar' as const,
      data: categories.map(c => avgAccuracyByCategory(results, model, c)),
      itemStyle: { color: MODEL_COLORS[i % MODEL_COLORS.length] },
      barMaxWidth: 32,
    })),
  };

  // Scatter plot: speed vs accuracy
  const scatterData = uniqueModels.map((model, i) => {
    const points = results.flatMap(r =>
      r.model_results
        .filter(m => m.model_id === model && m.response_time_ms > 0)
        .map(m => [m.response_time_ms, m.accuracy]),
    );
    return {
      name: model,
      type: 'scatter' as const,
      data: points,
      itemStyle: { color: MODEL_COLORS[i % MODEL_COLORS.length] },
      symbolSize: 8,
    };
  });

  const hasTimingData = scatterData.some(s => s.data.length > 0);

  const scatterOption: echarts.EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: {
      formatter: (p: any) => `${p.seriesName}<br/>Time: ${p.data[0].toFixed(0)}ms<br/>Accuracy: ${(p.data[1] * 100).toFixed(0)}%`,
    },
    legend: {
      bottom: 0,
      textStyle: { color: '#94a3b8', fontSize: 11 },
    },
    grid: { left: 48, right: 16, top: 16, bottom: 40 },
    xAxis: {
      type: 'value',
      name: 'Response Time (ms)',
      nameTextStyle: { color: '#94a3b8' },
      axisLabel: { color: '#94a3b8' },
      splitLine: { lineStyle: { color: '#334155' } },
    },
    yAxis: {
      type: 'value',
      name: 'Accuracy',
      max: 1,
      nameTextStyle: { color: '#94a3b8' },
      axisLabel: { color: '#94a3b8', formatter: (v: number) => `${(v * 100).toFixed(0)}%` },
      splitLine: { lineStyle: { color: '#334155' } },
    },
    series: scatterData,
  };

  useChart(radarRef, radarOption);
  useChart(barRef, barOption);
  useChart(scatterRef, hasTimingData ? scatterOption : {});

  if (results.length === 0) {
    return (
      <div className="text-slate-400 text-sm italic">
        No results yet
      </div>
    );
  }

  // Overall accuracy per model
  const avgAccuracyByModel: Record<string, number> = {};
  uniqueModels.forEach(model => {
    const accuracies = results
      .flatMap(r => r.model_results.filter(m => m.model_id === model))
      .map(m => m.accuracy);
    avgAccuracyByModel[model] = accuracies.length > 0
      ? accuracies.reduce((a, b) => a + b, 0) / accuracies.length
      : 0;
  });

  return (
    <div className="space-y-6">
      {/* Summary metrics */}
      <div className="bg-slate-800/40 border border-slate-700/40 rounded-lg p-4">
        <h3 className="text-xs font-bold text-slate-100 mb-3 uppercase tracking-wider">Model Accuracy</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {uniqueModels.map(model => (
            <div key={model} className="bg-slate-900/40 rounded p-2">
              <div className="text-xs text-slate-400 font-mono truncate">{model}</div>
              <div className="text-lg font-bold text-green-400">
                {(avgAccuracyByModel[model] * 100).toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Radar chart: cognitive levels */}
      <div className="bg-slate-800/40 border border-slate-700/40 rounded-lg p-4">
        <h3 className="text-xs font-bold text-slate-100 mb-3 uppercase tracking-wider">Cognitive Level Profile</h3>
        <div ref={radarRef} style={{ width: '100%', height: 320 }} />
      </div>

      {/* Bar chart: category accuracy */}
      <div className="bg-slate-800/40 border border-slate-700/40 rounded-lg p-4">
        <h3 className="text-xs font-bold text-slate-100 mb-3 uppercase tracking-wider">Accuracy by Category</h3>
        <div ref={barRef} style={{ width: '100%', height: 240 }} />
      </div>

      {/* Scatter: speed vs accuracy */}
      {hasTimingData && (
        <div className="bg-slate-800/40 border border-slate-700/40 rounded-lg p-4">
          <h3 className="text-xs font-bold text-slate-100 mb-3 uppercase tracking-wider">Speed vs Accuracy</h3>
          <div ref={scatterRef} style={{ width: '100%', height: 240 }} />
        </div>
      )}

      {/* Task-by-task detail table */}
      <div className="bg-slate-800/40 border border-slate-700/40 rounded-lg p-4 overflow-x-auto">
        <h3 className="text-xs font-bold text-slate-100 mb-3 uppercase tracking-wider">Task Results</h3>
        <table className="w-full text-xs text-slate-300">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th className="text-left py-2 px-2 font-mono">Task</th>
              <th className="text-left py-2 px-2 font-mono">Level</th>
              <th className="text-left py-2 px-2 font-mono">Category</th>
              {uniqueModels.map(model => (
                <th key={model} className="text-left py-2 px-2 font-mono whitespace-nowrap">{model}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.map((task, idx) => (
              <tr key={idx} className="border-b border-slate-700/30 hover:bg-slate-800/20">
                <td className="py-2 px-2 font-mono text-slate-400">{task.task_id}</td>
                <td className="py-2 px-2 text-slate-400">L{task.cognitive_level}</td>
                <td className="py-2 px-2 text-slate-400 capitalize">{task.category}</td>
                {uniqueModels.map(model => {
                  const modelResult = task.model_results.find(r => r.model_id === model);
                  if (!modelResult) {
                    return <td key={model} className="py-2 px-2 text-slate-500">-</td>;
                  }

                  const accuracy = modelResult.accuracy;
                  let color = 'text-red-400';
                  if (accuracy > 0.7) color = 'text-green-400';
                  else if (accuracy > 0.4) color = 'text-yellow-400';

                  return (
                    <td key={model} className={`py-2 px-2 font-mono ${color}`}>
                      {(accuracy * 100).toFixed(0)}%
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
