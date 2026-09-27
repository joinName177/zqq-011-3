import type { DailyMood, MoodRecord } from './models';

/**
 * 稳定排序与同日合并规则（领域层唯一权威实现）。
 *
 * 全序排序键（逐级决胜，任何输入顺序下结果一致）：
 *   1. date        —— 自然日，YYYY-MM-DD 字符串升序（等宽日期格式可直接字典序比较）；
 *   2. createdAt   —— 当日内按创建时刻升序（早记录在前，晚记录在后）；
 *   3. id          —— 最终兜底，保证比较结果确定且可复现。
 *
 * 同日合并规则见 DailyMood：数值日均、主导标签频次优先（平局取最早一条）、
 * 当日最后一条（最新签到）为代表记录。
 *
 * 页面时间线、图表统计、摘要、导出都必须经由本模块取数，禁止各自重排。
 */

const ID_TIMESTAMP_PREFIX = /^rec-(\d+)-/;

/** 解析记录的创建时间戳；历史数据无 createdAt 时从 id 前缀解析，仍无则退化为 0 */
export function recordCreatedAt(record: MoodRecord): number {
  if (typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)) {
    return record.createdAt;
  }
  const match = ID_TIMESTAMP_PREFIX.exec(record.id);
  return match ? Number(match[1]) : 0;
}

/** 稳定全序比较器 */
export function compareRecords(a: MoodRecord, b: MoodRecord): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const timeDiff = recordCreatedAt(a) - recordCreatedAt(b);
  if (timeDiff !== 0) return timeDiff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** 返回稳定全序排序后的新数组，绝不修改入参 */
export function sortRecords(records: readonly MoodRecord[]): MoodRecord[] {
  return [...records].sort(compareRecords);
}

/** 按 id 去重（保留首次出现），避免同一记录被重复计入合并与统计 */
export function dedupeRecords(records: readonly MoodRecord[]): MoodRecord[] {
  const seen = new Set<string>();
  const result: MoodRecord[] = [];
  for (const record of records) {
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    result.push(record);
  }
  return result;
}

/** 规范化 = 去重 + 稳定全序排序，是所有下游消费的唯一入口 */
export function canonicalizeRecords(records: readonly MoodRecord[]): MoodRecord[] {
  return sortRecords(dedupeRecords(records));
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * 在一组（已全序排列的）记录中选出主导标签：
 * 频次最高者胜；平局时取全序中最早出现的标签（createOrder 决胜，与存储顺序解耦）。
 */
export function pickDominantTag(orderedRecords: readonly MoodRecord[]): string | undefined {
  const counts = new Map<string, number>();
  const firstOrder = new Map<string, number>();
  orderedRecords.forEach((record, index) => {
    counts.set(record.tag, (counts.get(record.tag) ?? 0) + 1);
    if (!firstOrder.has(record.tag)) firstOrder.set(record.tag, index);
  });

  let winner: string | undefined;
  for (const [tag, count] of counts) {
    if (winner === undefined) {
      winner = tag;
      continue;
    }
    const winnerCount = counts.get(winner)!;
    if (count > winnerCount ||
      (count === winnerCount && (firstOrder.get(tag)! < firstOrder.get(winner)!))) {
      winner = tag;
    }
  }
  return winner;
}

/** 将同一自然日的多条记录按合并规则聚合成一个 DailyMood；入参须为同一 date 的记录 */
export function mergeDay(dayDate: string, dayRecords: readonly MoodRecord[]): DailyMood {
  const ordered = sortRecords(dayRecords);
  const representative = ordered[ordered.length - 1];
  const count = ordered.length;

  const average = (selector: (record: MoodRecord) => number) =>
    ordered.reduce((sum, record) => sum + selector(record), 0) / count;

  const tagCounts: Record<string, number> = {};
  for (const record of ordered) {
    tagCounts[record.tag] = (tagCounts[record.tag] ?? 0) + 1;
  }

  return {
    date: dayDate,
    tag: pickDominantTag(ordered) ?? representative.tag,
    tagCounts,
    intensity: round1(average(r => r.intensity)),
    pressureHpa: Math.round(average(r => r.pressureHpa)),
    temperatureC: Math.round(average(r => r.temperatureC)),
    humidityPercent: Math.round(average(r => r.humidityPercent)),
    windSpeedKmH: Math.round(average(r => r.windSpeedKmH)),
    // 风向取代表记录（最新签到），不做角度平均，避免跨 0°/360° 的错误合成
    windDirectionDeg: representative.windDirectionDeg,
    windDirectionName: representative.windDirectionName,
    notes: ordered.map(r => r.note),
    note: representative.note,
    recordCount: count,
    recordIds: ordered.map(r => r.id),
    representativeId: representative.id
  };
}

/**
 * 同日合并：规范化后按 date 分组逐日聚合。
 * 返回的数组按日期升序，是页面 / 摘要 / 统计 / 导出共享的唯一日序列。
 */
export function mergeByDay(records: readonly MoodRecord[]): DailyMood[] {
  const canonical = canonicalizeRecords(records);
  const days = new Map<string, MoodRecord[]>();
  for (const record of canonical) {
    const group = days.get(record.date);
    if (group) group.push(record);
    else days.set(record.date, [record]);
  }
  return [...days.keys()].sort().map(dayDate => mergeDay(dayDate, days.get(dayDate)!));
}
