import './ui/styles.css';
import { LocalStorageMoodAdapter } from './adapters/local-storage-mood.adapter';
import { MeteorologyEngineAdapter } from './adapters/meteorology-engine.adapter';
import { createRecordFromTag } from './core/meteorology-engine';
import { MoodRecord, SynopticChartData } from './core/models';
import { renderWeatherApp } from './ui/app';
import { summarizeMood, chartSummary, type MoodSummary } from './core/mood-summary';
import { moodTelemetry } from './adapters/mood-telemetry';
import { buildBugSurface } from './adapters/quality/bugSurface';
import { canonicalizeRecords } from './core/record-ordering';
import { exportRecordsAsCsv, exportRecordsAsJson } from './core/mood-export';

const repo = new LocalStorageMoodAdapter();
const metEngine = new MeteorologyEngineAdapter();

let records = repo.getAll();
let chartData: SynopticChartData = metEngine.generateSynopticChart(records);

let isModalOpen = false;
let selectedTag = '阴转多云';
let selectedIntensity = 5;
let noteText = '';

const rootEl = document.getElementById('app')!;

/**
 * 页面、摘要与导出（含 data-mood-summary 机器可读快照）始终取自
 * chartData.records —— 引擎内部已做“同日合并 + 稳定排序”的规范化，
 * 保证三处看到的主导情绪、平均值、趋势和顺序完全一致。
 */
function syncEmbeddedSnapshot(chart: SynopticChartData): void {
  const visibleRecords = canonicalizeRecords(chart.records);
  const summary: MoodSummary = summarizeMood(visibleRecords);
  const bugSurface = buildBugSurface([visibleRecords.length, chart.zones.length]);
  rootEl.dataset.moodSummary = JSON.stringify({
    summary,
    chart: chartSummary(chart),
    telemetry: moodTelemetry('snapshot'),
    bugSurface,
    preembeddedBugCount: bugSurface.bugs.length,
    hellBugCount: bugSurface.bugs.filter((bug) => bug.level === 'hell').length,
    difficultBugCount: bugSurface.bugs.filter((bug) => bug.level === 'difficult').length
  });
}

function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function dateStamp(): string {
  return new Date().toISOString().split('T')[0];
}

function refreshView() {
  renderWeatherApp(
    rootEl,
    chartData,
    isModalOpen,
    selectedTag,
    selectedIntensity,
    noteText,
    {
      onOpenLogModal: () => {
        isModalOpen = true;
        selectedTag = '阴转多云';
        selectedIntensity = 5;
        noteText = '';
        refreshView();
      },
      onResetData: () => {
        records = repo.resetToSample();
        chartData = metEngine.generateSynopticChart(records);
        refreshView();
      },
      onSubmitLog: (tag: string, intensity: number, note: string) => {
        const newRecord = createRecordFromTag(tag, intensity, note, dateStamp());
        repo.add(newRecord);
        records = repo.getAll();
        chartData = metEngine.generateSynopticChart(records);
        isModalOpen = false;
        refreshView();
      },
      onSelectRecord: (record: MoodRecord) => {
        // Re-generate chart focusing on this record
        const filtered = records.filter(r => r.date <= record.date);
        chartData = metEngine.generateSynopticChart(filtered.length > 0 ? filtered : records);
        chartData.currentRecord = record;
        refreshView();
      },
      onExportJson: () => {
        const visibleRecords = canonicalizeRecords(chartData.records);
        const summary = summarizeMood(visibleRecords);
        const content = exportRecordsAsJson(visibleRecords, summary, chartData);
        downloadFile(`mood-meteorology-${dateStamp()}.json`, content, 'application/json;charset=utf-8');
      },
      onExportCsv: () => {
        const visibleRecords = canonicalizeRecords(chartData.records);
        const content = exportRecordsAsCsv(visibleRecords);
        downloadFile(`mood-meteorology-${dateStamp()}.csv`, content, 'text/csv;charset=utf-8');
      }
    },
    () => {
      isModalOpen = false;
      refreshView();
    },
    (tag: string) => {
      selectedTag = tag;
      refreshView();
    },
    (intensity: number) => {
      selectedIntensity = intensity;
      refreshView();
    },
    (note: string) => {
      noteText = note;
    }
  );

  syncEmbeddedSnapshot(chartData);
}

// Initial mount
refreshView();
