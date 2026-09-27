import type { MoodRecord, SynopticChartData } from './models';
import type { MoodSummary } from './mood-summary';
import { canonicalizeRecords } from './record-ordering';

/**
 * 导出与页面、摘要共用同一份规范化数据快照（每日一条 + 稳定排序），
 * 不使用随机数或当前时间，保证“所见即所导”、重复导出字节级一致。
 */

export interface MoodExportPayload {
  format: 'mood-meteorology';
  version: 1;
  generatedFrom: string;
  recordCount: number;
  summary: MoodSummary;
  averagePressure: number;
  records: MoodRecord[];
}

export function buildExportPayload(
  recordsInput: readonly MoodRecord[],
  summary: MoodSummary,
  chart: SynopticChartData
): MoodExportPayload {
  // 再次走唯一规范化入口，防止调用方传入未归一的数据
  const records = canonicalizeRecords(recordsInput);
  return {
    format: 'mood-meteorology',
    version: 1,
    generatedFrom: chart.chartId,
    recordCount: records.length,
    summary,
    averagePressure: chart.averagePressure,
    records
  };
}

export function exportRecordsAsJson(
  recordsInput: readonly MoodRecord[],
  summary: MoodSummary,
  chart: SynopticChartData
): string {
  return JSON.stringify(buildExportPayload(recordsInput, summary, chart), null, 2);
}

/** CSV 字段转义：含逗号、引号、换行时用双引号包裹并把内部引号双写（RFC 4180）。 */
function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

const CSV_COLUMNS: { header: string; value: (r: MoodRecord) => string | number }[] = [
  { header: 'date', value: r => r.date },
  { header: 'tag', value: r => r.tag },
  { header: 'intensity', value: r => r.intensity },
  { header: 'pressureHpa', value: r => r.pressureHpa },
  { header: 'temperatureC', value: r => r.temperatureC },
  { header: 'humidityPercent', value: r => r.humidityPercent },
  { header: 'windDirectionName', value: r => r.windDirectionName },
  { header: 'windSpeedKmH', value: r => r.windSpeedKmH },
  { header: 'note', value: r => r.note }
];

export function exportRecordsAsCsv(recordsInput: readonly MoodRecord[]): string {
  const records = canonicalizeRecords(recordsInput);
  const header = CSV_COLUMNS.map(c => c.header).join(',');
  const rows = records.map(r => CSV_COLUMNS.map(c => csvCell(c.value(r))).join(','));
  // ﻿ BOM 保证 Excel 打开中文不乱码；行尾统一 CRLF
  return '﻿' + [header, ...rows].join('\r\n');
}
