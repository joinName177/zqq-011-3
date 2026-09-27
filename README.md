# cyc-013 · 情绪气象台 · 心灵天气图系统

纯前端情绪气象转化与可视化系统。用户每日记录心情标签（如"阴转多云"、"局部有焦虑"、"暖湿气流过境"），系统将个人情绪数据转化为一套完整的气象系统，生成专属的"情绪天气图"（等压线、高/低气压中心、锋面、风向场），支持查看情绪气压带、季风趋势和极端天气预警与自愈指南。

## 架构说明（分层架构：核心层 / 端口层 / 适配器层）

- `src/core`：领域模型（`MoodRecord`、`BarometricZone`、`MonsoonTrend`、`ExtremeWeatherAlert`、`SynopticChartData`）与气象测算引擎（气压/湿度/温度/季风/预警计算规则）。
- `src/ports`：端口层定义契约（`MoodRepositoryPort` 心情存储端口、`MeteorologyPort` 气象系统推演端口）。
- `src/adapters`：适配器层（LocalStorage 持久化与内置14天气象序列适配器、气象计算引擎适配器）。
- `src/ui`：原生 CSS 视觉呈现层，包含综观天气图 SVG 动态矢量图、气压带进度表、季风走向雷达与灾害预警防灾指南。

## 稳定排序与同日合并规则（页面 / 摘要 / 导出统一口径）

同一自然日允许记录多条心情。为避免刷新后顺序漂移导致主导情绪、均值与趋势变化，所有下游消费必须经由核心层 `src/core/mood-ordering.ts` 取数，禁止各自重排：

1. **稳定全序**（`canonicalizeRecords`）：先按 `id` 去重，再按 `date` → `createdAt` → `id` 三级决胜升序排列；历史数据缺失 `createdAt` 时从 `rec-<时间戳>-` 前缀解析。
2. **同日合并**（`mergeByDay`）：数值字段（强度/气压/温度/湿度/风速）取当日全部记录算术平均；主导标签取当日频次最高者，平局取全序最早一条；风向与备注以当日最后一条（最新签到）为代表；`DailyMood` 保留 `recordCount / recordIds / notes` 可追溯。
3. **统计口径**：图表（平均气压、气压带占比、近 7 日趋势方向）与摘要（主导情绪、日均强度）一律基于合并后的日序列；趋势方向由近 7 日首末气压差确定（阈值 1 hPa，超过才判定回升/下行）。
4. **导出一致**：页头「导出 JSON / CSV」与页面、`data-mood-summary` 摘要共享同一份规范化图表快照（见 `src/core/mood-export.ts`）；CSV 按日序列输出并带 UTF-8 BOM。

## 本地运行

```bash
npm install
npm run dev
```

## 构建验证

```bash
npm run build
```

## Docker 容器化部署

```bash
docker compose up --build
```
访问：`http://localhost:8013`
