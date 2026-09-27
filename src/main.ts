import './ui/styles.css';
import { LocalStorageMoodAdapter } from './adapters/local-storage-mood.adapter';
import { MeteorologyEngineAdapter } from './adapters/meteorology-engine.adapter';
import { createRecordFromTag } from './core/meteorology-engine';
import { MoodRecord, SynopticChartData } from './core/models';
import { renderWeatherApp } from './ui/app';
import { summarizeMood, chartSummary } from './core/mood-summary';
import { moodTelemetry } from './adapters/mood-telemetry';
import { buildBugSurface } from './adapters/quality/bugSurface';
import { canonicalizeRecords } from './core/mood-ordering';
import { exportMoodJson, exportMoodCsv } from './core/mood-export';

const repo = new LocalStorageMoodAdapter();
const metEngine = new MeteorologyEngineAdapter();

let records = repo.getAll();
let chartData: SynopticChartData = metEngine.generateSynopticChart(records);

let isModalOpen = false;
let selectedTag = '阴转多云';
let selectedIntensity = 5;
let noteText = '';

const rootEl = document.getElementById('app')!;
const bugSurface = buildBugSurface([records.length, chartData.zones.length]);

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 触发浏览器下载，导出内容来自当前页面同一份规范化图表快照 */
function downloadFile(filename: string, mime: string, content: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** 摘要始终从当前图表快照派生，保证页面 / data-summary / 导出完全一致 */
function syncSummary() {
  rootEl.dataset.moodSummary = JSON.stringify({
    summary: summarizeMood(chartData.sortedRecords),
    chart: chartSummary(chartData),
    telemetry: moodTelemetry('current'),
    bugSurface,
    preembeddedBugCount: bugSurface.bugs.length,
    hellBugCount: bugSurface.bugs.filter((bug) => bug.level === 'hell').length,
    difficultBugCount: bugSurface.bugs.filter((bug) => bug.level === 'difficult').length
  });
}
syncSummary();

function refreshView() {
  // 页面与摘要来自同一份快照，每次刷新同步 data-mood-summary
  syncSummary();
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
        const todayStr = new Date().toISOString().split('T')[0];
        const newRecord = createRecordFromTag(tag, intensity, note, todayStr);
        repo.add(newRecord);
        records = repo.getAll();
        chartData = metEngine.generateSynopticChart(records);
        isModalOpen = false;
        refreshView();
      },
      onSelectRecord: (record: MoodRecord) => {
        // Re-generate chart focusing on this record；过滤后同样走稳定全序
        const filtered = canonicalizeRecords(records.filter(r => r.date <= record.date));
        chartData = metEngine.generateSynopticChart(filtered.length > 0 ? filtered : records);
        chartData.currentRecord = record;
        refreshView();
      },
      onExportJson: () => {
        downloadFile(
          `mood-weather-${dateStamp()}.json`,
          'application/json;charset=utf-8',
          exportMoodJson(chartData)
        );
      },
      onExportCsv: () => {
        downloadFile(
          `mood-weather-${dateStamp()}.csv`,
          'text/csv;charset=utf-8',
          exportMoodCsv(chartData)
        );
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
}

// Initial mount
refreshView();
