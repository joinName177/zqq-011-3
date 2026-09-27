import type { MoodRecord } from './models';

/**
 * 规范化排序与同日合并规则（页面 / 摘要 / 导出共用同一口径）
 *
 * 规则 1 —— 稳定排序（全序，无并列）：
 *   1. date 升序（YYYY-MM-DD 可直接按字符串比较，避免 toISOString 时区漂移）
 *   2. 同日按 createdAt 升序（创建时间，旧数据缺失时从 id 解析，再退回 0）
 *   3. 仍并列时按 id 升序，保证结果可确定复现
 *
 * 规则 2 —— 同日合并：
 *   领域语义为「每日一条心情记录」。同一 date 只保留最后提交的一条
 *   （createdAt 最大；并列时 id 更大者视为更晚），即“新记录覆盖旧记录”。
 */

/** 解析记录的创建时间戳；兼容旧版本没有 createdAt 字段的数据。 */
export function recordCreatedAt(record: MoodRecord): number {
  if (typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)) {
    return record.createdAt;
  }
  // 旧数据 id 形如 `rec-<毫秒时间戳>-<随机数>`
  const match = /^rec-(\d+)(?:-|$)/.exec(record.id ?? '');
  return match ? Number(match[1]) || 0 : 0;
}

/** 全序比较器：先日期、再创建时间、最后 id，任何输入都有确定顺序。 */
export function compareRecords(a: MoodRecord, b: MoodRecord): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const timeDiff = recordCreatedAt(a) - recordCreatedAt(b);
  if (timeDiff !== 0) return timeDiff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** 同日合并：同一 date 仅保留最后提交的一条（最新 createdAt / 最大 id）。 */
export function mergeRecordsByDate(records: readonly MoodRecord[]): MoodRecord[] {
  const latestByDate = new Map<string, MoodRecord>();
  for (const record of records) {
    const existing = latestByDate.get(record.date);
    if (!existing || compareRecords(existing, record) < 0) {
      latestByDate.set(record.date, record);
    }
  }
  return [...latestByDate.values()];
}

/**
 * 记录集合的唯一入口：过滤脏数据 → 同日合并 → 稳定排序。
 * 所有读取方（引擎、摘要、页面、存储、导出）都必须先经过此函数，
 * 保证刷新后顺序与统计结果完全一致。
 */
export function canonicalizeRecords(records: readonly MoodRecord[] | null | undefined): MoodRecord[] {
  if (!Array.isArray(records)) return [];
  const valid = records.filter(
    (r): r is MoodRecord =>
      !!r && typeof r === 'object' && typeof r.id === 'string' && typeof r.date === 'string'
  );
  return mergeRecordsByDate(valid).sort(compareRecords);
}
