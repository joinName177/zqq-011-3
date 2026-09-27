import type { MoodRecord, SynopticChartData } from './models';
import { summarizeMood } from './mood-summary';

/**
 * 导出与页面、摘要共用同一份规范化快照（稳定全序 + 同日合并），
 * 保证“所见即所导”，刷新或重排记录不会改变导出内容。
 */

export interface MoodExportPayload {
  exportedAt: string;
  summary: ReturnType<typeof summarizeMood>;
  averagePressure: number;
  trendDirection: SynopticChartData['monsoon']['trendDirection'];
  trendDeltaHpa: number;
  dailyMoods: SynopticChartData['dailyMoods'];
  records: MoodRecord[];
}

/** 从图表数据（已是规范化快照）构造导出载荷 */
export function buildExportPayload(chart: SynopticChartData): MoodExportPayload {
  // 摘要直接由同一份记录重算（纯函数），口径与页面完全一致
  const summary = summarizeMood(chart.sortedRecords);
  return {
    exportedAt: new Date().toISOString(),
    summary,
    averagePressure: chart.averagePressure,
    trendDirection: chart.monsoon.trendDirection,
    trendDeltaHpa: chart.monsoon.trendDeltaHpa,
    dailyMoods: chart.dailyMoods,
    records: chart.sortedRecords
  };
}

export function exportMoodJson(chart: SynopticChartData): string {
  return JSON.stringify(buildExportPayload(chart), null, 2);
}

function csvEscape(value: string | number): string {
  const text = String(value);
  // 逗号、引号、换行须用双引号包裹，内部双引号转义为两个双引号
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

/**
 * 按“日观测量”导出行（同日合并口径），UTF-8 BOM 供 Excel 正确识别中文。
 * 列顺序固定，不依赖对象键遍历顺序。
 */
export function exportMoodCsv(chart: SynopticChartData): string {
  const header = [
    '日期', '主导情绪', '当日记录数', '平均强度', '平均气压(hPa)',
    '平均温度(°C)', '平均湿度(%)', '平均风速(km/h)', '风向',
    '气压趋势(近7日)', '参与合并记录ID', '当日全部备注'
  ];
  const { trendDirection, trendDeltaHpa } = chart.monsoon;
  const trendText = `${trendDirection}(${trendDeltaHpa >= 0 ? '+' : ''}${trendDeltaHpa}hPa)`;

  const rows = chart.dailyMoods.map(day => [
    day.date,
    day.tag,
    day.recordCount,
    day.intensity,
    day.pressureHpa,
    day.temperatureC,
    day.humidityPercent,
    day.windSpeedKmH,
    day.windDirectionName,
    trendText,
    day.recordIds.join(' '),
    day.notes.join(' / ')
  ].map(csvEscape).join(','));

  return '﻿' + [header.join(','), ...rows].join('\r\n');
}
