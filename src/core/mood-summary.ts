import type { DailyMood, MoodRecord, SynopticChartData } from './models';
import { canonicalizeRecords, mergeByDay, round1 } from './mood-ordering';

export interface MoodSummary {
  /** 观测自然日数（同日多条只计 1 天） */
  count: number;
  /** 原始观测记录条数（同日多条均计入） */
  recordCount: number;
  /** 全周期日主导情绪标签（去重，按全序首次出现排列） */
  tags: string[];
  /** 主导情绪：日频次最高，平局取全序中最早出现的标签 */
  dominant: string;
  /** 日均强度（先按日合并取当日均值，再按日平均） */
  averageIntensity: number;
  /** 按日合并后的日序列，页面 / 摘要 / 导出共享 */
  dailyMoods: DailyMood[];
}

/**
 * 摘要与图表共用同一规范化口径：稳定全序排序 → 同日合并 → 统计。
 * 无论入参记录顺序如何（刷新、重取、导出），结果完全一致。
 */
export function summarizeMood(records: readonly MoodRecord[]): MoodSummary {
  const sorted = canonicalizeRecords(records);
  const dailyMoods = mergeByDay(sorted);

  const count = dailyMoods.length;
  const recordCount = sorted.length;
  const averageIntensity = count
    ? round1(dailyMoods.reduce((sum, day) => sum + day.intensity, 0) / count)
    : 0;

  const tags: string[] = [];
  const dayCounts = new Map<string, number>();
  const firstDayOrder = new Map<string, number>();
  dailyMoods.forEach((day, index) => {
    if (!tags.includes(day.tag)) tags.push(day.tag);
    dayCounts.set(day.tag, (dayCounts.get(day.tag) ?? 0) + 1);
    if (!firstDayOrder.has(day.tag)) firstDayOrder.set(day.tag, index);
  });

  // 主导情绪按自然日计频次；平局取日序列中最早出现的标签（确定性决胜）
  let dominant = '暂无';
  for (const [tag, dayCount] of dayCounts) {
    if (dominant === '暂无') {
      dominant = tag;
      continue;
    }
    const currentCount = dayCounts.get(dominant)!;
    if (dayCount > currentCount ||
      (dayCount === currentCount && firstDayOrder.get(tag)! < firstDayOrder.get(dominant)!)) {
      dominant = tag;
    }
  }

  return { count, recordCount, averageIntensity, tags, dominant, dailyMoods };
}

export function chartSummary(chart: SynopticChartData): string {
  return chart.currentRecord.tag + ' · ' + chart.dailyMoods.length + ' 个观测日 / ' + chart.recordCount + ' 条记录';
}
