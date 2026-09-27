// 纯 Node 验证：稳定排序与同日合并的确定性。通过 vite 自带 esbuild 即时转译 TS。
import { build } from 'esbuild';
import { writeFileSync, mkdirSync } from 'fs';
import { evaluateSynopticSystem } from './src/core/meteorology-engine.ts';
import { summarizeMood } from './src/core/mood-summary.ts';
import { exportMoodJson, exportMoodCsv } from './src/core/mood-export.ts';
import { canonicalizeRecords, mergeByDay } from './src/core/mood-ordering.ts';
import type { MoodRecord } from './src/core/models.ts';

function make(id: string, date: string, createdAt: number, tag: string, intensity: number, pressureHpa: number): MoodRecord {
  return {
    id, date, createdAt, tag, intensity, note: `${id}-note`,
    pressureHpa, temperatureC: 20, humidityPercent: 60,
    windSpeedKmH: 20, windDirectionDeg: 90, windDirectionName: '东'
  };
}

// 构造同日多条 + 跨日数据；注意 D 日两条标签不同，主导标签平局由全序决胜
const base: MoodRecord[] = [
  make('rec-a', '2026-09-20', 1000, '晴空万里', 8, 1030),
  make('rec-b1', '2026-09-21', 2000, '阴转多云', 5, 1008),
  make('rec-b2', '2026-09-21', 2100, '局部有焦虑', 7, 992),
  make('rec-c1', '2026-09-22', 3000, '突发雷暴', 9, 975),
  make('rec-c2', '2026-09-22', 3100, '暖湿气流过境', 6, 1002),
  make('rec-c3', '2026-09-22', 3200, '晴空万里', 8, 1030),
  make('rec-d1', '2026-09-23', 4000, '低气压大雾', 4, 998),
  make('rec-d2', '2026-09-23', 4100, '微风煦暖', 7, 1018),
  make('rec-e', '2026-09-24', 5000, '晴空万里', 8, 1024)
];

function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const results: string[] = [];
const assert = (cond: boolean, msg: string) => {
  results.push((cond ? 'PASS' : 'FAIL') + ' :: ' + msg);
  if (!cond) process.exitCode = 1;
};

// 1) 稳定排序：6 种不同乱序输入产出完全相同的 id 序列
const orderSignatures = new Set(
  [1, 7, 42, 99, 12345, 20260926].map(seed =>
    canonicalizeRecords(shuffle(base, seed)).map(r => r.id).join(','))
);
assert(orderSignatures.size === 1, '稳定全序排序与输入顺序无关');
assert([...orderSignatures][0] === 'rec-a,rec-b1,rec-b2,rec-c1,rec-c2,rec-c3,rec-d1,rec-d2,rec-e',
  '同日按 createdAt 升序、跨日按 date 升序: ' + [...orderSignatures][0]);

// 2) 去重：重复 id 只计一次
const deduped = canonicalizeRecords([...base, base[1], base[1]]);
assert(deduped.length === base.length, '按 id 去重防止重复计入');

// 3) 同日合并：各乱序输入的日序列完全一致
const daySignatures = new Set(
  [1, 7, 42, 99, 12345, 20260926].map(seed =>
    JSON.stringify(mergeByDay(shuffle(base, seed))))
);
assert(daySignatures.size === 1, '同日合并结果与输入顺序无关');

const days = mergeByDay(base);
assert(days.length === 5, '合并后为 5 个自然日');
const sep21 = days.find(d => d.date === '2026-09-21')!;
assert(sep21.recordCount === 2 && sep21.pressureHpa === 1000 && sep21.intensity === 6,
  `09-21 气压日均=1000((1008+992)/2), 强度日均=6: 实际 ${sep21.pressureHpa}/${sep21.intensity}`);
assert(sep21.tag === '阴转多云', '平局标签取当日最早一条（阴转多云 早于 局部有焦虑）');
assert(sep21.representativeId === 'rec-b2' && sep21.note === 'rec-b2-note',
  '代表记录为当日最后一条（最新签到）');
const sep22 = days.find(d => d.date === '2026-09-22')!;
assert(sep22.pressureHpa === Math.round((975 + 1002 + 1030) / 3), '09-22 三条气压日均正确: ' + sep22.pressureHpa);

// 4) 图表：currentRecord / 均值 / 趋势在乱序下稳定
const charts = [1, 7, 42, 99, 12345, 20260926].map(seed => {
  const chart = evaluateSynopticSystem(shuffle(base, seed));
  return {
    currentId: chart.currentRecord.id,
    avg: chart.averagePressure,
    trend: chart.monsoon.trendDirection,
    delta: chart.monsoon.trendDeltaHpa,
    records: chart.sortedRecords.map(r => r.id).join(',')
  };
});
const chartSig = new Set(charts.map(c => JSON.stringify(c)));
assert(chartSig.size === 1, 'currentRecord/均值/趋势/时间线在乱序下完全一致');
assert(charts[0].currentId === 'rec-e', '当前观测=最后一日最新记录 rec-e');
const expectedAvg = Math.round([1030, 1000, Math.round((975 + 1002 + 1030) / 3), Math.round((998 + 1018) / 2), 1024].reduce((a, b) => a + b, 0) / 5);
assert(charts[0].avg === expectedAvg, `全周期日均气压=${expectedAvg}, 实际 ${charts[0].avg}`);
assert(charts[0].trend === '下行' && charts[0].delta === 1024 - 1030,
  `近7日趋势=下行(-6hPa), 实际 ${charts[0].trend}(${charts[0].delta})`);

// 5) 摘要：主导情绪在乱序下稳定
const summaries = [1, 7, 42, 99, 12345, 20260926].map(seed => {
  const s = summarizeMood(shuffle(base, seed));
  return { dominant: s.dominant, avg: s.averageIntensity, count: s.count, recordCount: s.recordCount, tags: s.tags.join(',') };
});
assert(new Set(summaries.map(s => JSON.stringify(s))).size === 1, '摘要在乱序下完全一致');
assert(summaries[0].dominant === '晴空万里', `主导情绪按日频次=晴空万里(2天), 实际 ${summaries[0].dominant}`);
assert(summaries[0].count === 5 && summaries[0].recordCount === 9,
  `观测日=5、原始记录=9, 实际 ${summaries[0].count}/${summaries[0].recordCount}`);

// 6) 导出：与页面快照同口径，乱序下字节级一致
const chartA = evaluateSynopticSystem(shuffle(base, 1));
const chartB = evaluateSynopticSystem(shuffle(base, 999));
// 去掉动态字段（exportedAt/chartId 等时间戳）后比较
const normalizeJson = (s: string) => {
  const parsed = JSON.parse(s) as Record<string, unknown>;
  delete parsed.exportedAt; // 导出时刻本身允许变化，比较业务数据
  return JSON.stringify(parsed);
};
const jsonA = normalizeJson(exportMoodJson(chartA));
const jsonB = normalizeJson(exportMoodJson(chartB));
if (jsonA !== jsonB) {
  const deepDiff = (a: unknown, b: unknown, path: string): string[] => {
    const out: string[] = [];
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) out.push(`${path} length ${a.length} vs ${b.length}`);
      a.forEach((v, i) => out.push(...deepDiff(v, b[i], `${path}[${i}]`)));
    } else if (a && b && typeof a === 'object' && typeof b === 'object') {
      for (const key of new Set([...Object.keys(a as object), ...Object.keys(b as object)])) {
        out.push(...deepDiff((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], `${path}.${key}`));
      }
    } else if (a !== b) {
      out.push(`${path}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
    }
    return out;
  };
  results.push(...deepDiff(JSON.parse(jsonA), JSON.parse(jsonB), '$').map(d => '  diff: ' + d));
}
assert(jsonA === jsonB, 'JSON 导出与输入顺序无关');
assert(exportMoodCsv(chartA) === exportMoodCsv(chartB), 'CSV 导出与输入顺序无关');
assert(exportMoodCsv(chartA).startsWith('﻿日期,主导情绪'), 'CSV 含 UTF-8 BOM 且表头固定');
const csvLines = exportMoodCsv(chartA).split('\r\n');
assert(csvLines.length === 6, 'CSV 行数=表头+5个观测日');

// 7) 历史数据无 createdAt 时从 id 解析，结果仍确定
const legacy = base.map(({ createdAt, ...rest }) => rest);
const legacySorted = canonicalizeRecords(legacy);
assert(legacySorted.map(r => r.id).join(',') === 'rec-a,rec-b1,rec-b2,rec-c1,rec-c2,rec-c3,rec-d1,rec-d2,rec-e',
  '缺失 createdAt 时从 rec-<ts>- 前缀解析排序');

// 8) 空数据安全状态
const emptyChart = evaluateSynopticSystem([]);
assert(emptyChart.dailyMoods.length === 0 && emptyChart.sortedRecords.length === 0 && emptyChart.recordCount === 0,
  '空数据产生安全空序列');
assert(summarizeMood([]).dominant === '暂无' && summarizeMood([]).averageIntensity === 0,
  '空数据摘要有安全默认值');

mkdirSync('dist-test', { recursive: true });
writeFileSync('dist-test/result.txt', results.join('\n') + '\n');
console.log(results.join('\n'));
