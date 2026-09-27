export type AlertLevel = '蓝色' | '黄色' | '橙色' | '红色';

export interface MoodTagMeta {
  tag: string;
  category: 'sunny' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'fog';
  defaultPressure: number; // 960 - 1040 hPa
  defaultTemp: number;     // Celsius
  defaultHumidity: number; // 0 - 100%
  icon: string;
  windDesc: string;
  themeColor: string;
}

export interface MoodRecord {
  id: string;
  date: string; // YYYY-MM-DD
  /** 记录创建的毫秒时间戳，用于同日记录的稳定排序；历史数据缺失时从 id 解析 */
  createdAt?: number;
  tag: string;
  intensity: number; // 1 - 10
  note: string;
  pressureHpa: number;
  temperatureC: number;
  humidityPercent: number;
  windSpeedKmH: number;
  windDirectionDeg: number;
  windDirectionName: string;
}

/**
 * 同一自然日多条 MoodRecord 合并后的“日观测量”。
 * 合并规则（唯一口径，页面 / 摘要 / 导出共用）：
 * - 数值字段（强度、气压、温度、湿度、风速）取当日全部记录的算术平均；
 * - tag 取当日出现次数最多的标签，平局时取全序排序中最早一条的标签；
 * - 风向、备注取“代表记录”——当日全序排序中的最后一条（最新签到）；
 * - recordCount / recordIds 保留当日参与合并的原始记录。
 */
export interface DailyMood {
  date: string; // YYYY-MM-DD
  tag: string; // 当日主导标签
  tagCounts: Record<string, number>;
  intensity: number; // 当日均值，保留 1 位小数
  pressureHpa: number; // 当日均值，四舍五入为整数 hPa
  temperatureC: number;
  humidityPercent: number;
  windSpeedKmH: number;
  windDirectionDeg: number;
  windDirectionName: string;
  notes: string[]; // 当日全部备注，按全序排列
  note: string; // 代表记录备注
  recordCount: number;
  recordIds: string[];
  representativeId: string;
}

export interface BarometricZone {
  code: string;
  name: string;
  psychologicalState: string;
  pressureRange: string;
  activeRatio: number; // 0 - 100%
  status: 'dominant' | 'active' | 'receding';
  description: string;
}

export type TrendDirection = '回升' | '下行' | '平稳';

export interface MonsoonTrend {
  vectorName: string;
  originSource: string;
  frequencyDays: number;
  flowSpeed: string;
  windAngle: number;
  weatherImpact: string;
  upcomingForecast: string;
  /** 以合并后日气压为口径的近 7 日气压趋势方向（确定性计算，与记录存储顺序无关） */
  trendDirection: TrendDirection;
  trendDeltaHpa: number; // 近 7 日首末日气压差，正=回升，负=下行
}

export interface ExtremeWeatherAlert {
  id: string;
  level: AlertLevel;
  type: string;
  title: string;
  issuedTime: string;
  triggerCause: string;
  defenseProtocol: string[]; // 防灾自愈指南
}

export interface SynopticChartData {
  chartId: string;
  generatedDate: string;
  currentRecord: MoodRecord;
  records: MoodRecord[];
  /** 稳定全序排序后的原始观测记录（页面时间线口径） */
  sortedRecords: MoodRecord[];
  /** 同日合并后的日观测量序列（所有统计 / 摘要 / 导出的唯一口径） */
  dailyMoods: DailyMood[];
  /** 原始观测记录总数（同日多条均计入） */
  recordCount: number;
  averagePressure: number;
  zones: BarometricZone[];
  monsoon: MonsoonTrend;
  alerts: ExtremeWeatherAlert[];
  pressureSystemType: '强烈冷涡旋' | '副热带高压晴空' | '锋面气旋多变' | '温带反气旋平稳' | '深槽低气压阴霾';
  metSummary: string;
}
