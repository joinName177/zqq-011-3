import type { MoodRecord, SynopticChartData } from './models';
import { canonicalizeRecords } from './record-ordering';

export interface MoodSummary {
  count: number;
  averageIntensity: number;
  tags: string[];
  dominant: string;
}

export function summarizeMood(recordsInput: readonly MoodRecord[]): MoodSummary {
  // 与页面、引擎、导出共用同一规范化口径：每日一条、稳定排序
  const records = canonicalizeRecords(recordsInput);
  const count = records.length;

  const averageIntensity = count
    ? Math.round((records.reduce((sum, record) => sum + record.intensity, 0) / count) * 10) / 10
    : 0;

  // 标签顺序按“首次出现”（时间线上最早出现）排列，结果可确定复现
  const tags: string[] = [];
  const counts = new Map<string, number>();
  for (const record of records) {
    if (!counts.has(record.tag)) tags.push(record.tag);
    counts.set(record.tag, (counts.get(record.tag) ?? 0) + 1);
  }

  // 主导情绪：频次最高者胜；频次并列时取时间线上最早出现的标签，
  // 不再依赖 sort 的随机并列结果（同日记录重排不会改变主导情绪）
  const dominant =
    tags.reduce((best, tag) => ((counts.get(tag) ?? 0) > (counts.get(best) ?? 0) ? tag : best), tags[0] ?? '') ||
    '暂无';

  return { count, averageIntensity, tags, dominant };
}

export function chartSummary(chart: SynopticChartData): string {
  return chart.currentRecord.tag + ' · ' + chart.zones.length + ' 个气压带';
}
