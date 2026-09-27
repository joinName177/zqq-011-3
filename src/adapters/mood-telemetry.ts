export function moodTelemetry(seed: string): { id: string; labels: string[] } {
  // id 只由 seed 决定，避免同一数据快照因 Date.now() 在刷新后产生不同标识
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return { id: seed.length + '-' + (hash >>> 0).toString(36), labels: ['record-add','record-edit','record-filter','chart-focus','sample-reset','extreme-alert','self-care','date-boundary','intensity-scale','tag-normalize','note-length','storage','export','keyboard','responsive'] };
}
