import { MoodRecord } from '../core/models';
import { MoodRepositoryPort } from '../ports/mood-repository.port';
import { createRecordFromTag } from '../core/meteorology-engine';
import { canonicalizeRecords, recordCreatedAt } from '../core/record-ordering';

const STORAGE_KEY = 'mood_meteorology_records_v1';

export class LocalStorageMoodAdapter implements MoodRepositoryPort {
  getAll(): MoodRecord[] {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // 唯一读取入口：补齐旧字段 → 同日合并 → 稳定排序，并把规范化结果回写，
          // 让旧版本/重复数据在第一次刷新后即收敛到同一确定状态
          const canonical = canonicalizeRecords(parsed.map(this.migrateRecord));
          this.persist(canonical);
          return canonical;
        }
      } catch {
        // 数据损坏时降级为示例序列
      }
    }
    return this.resetToSample();
  }

  add(record: MoodRecord): void {
    // 每日一条：新提交覆盖该日旧记录；其余日期保持规范顺序
    const others = this.getAll().filter(r => r.date !== record.date);
    const canonical = canonicalizeRecords([...others, record]);
    this.persist(canonical);
  }

  delete(id: string): void {
    this.persist(this.getAll().filter(r => r.id !== id));
  }

  /** 旧版本记录缺少 createdAt 时，从 id 中的时间戳回填。 */
  private migrateRecord(raw: unknown): MoodRecord {
    const r = raw as Partial<MoodRecord>;
    const base = (r ?? {}) as Partial<MoodRecord>;
    return {
      id: typeof base.id === 'string' ? base.id : `rec-migrated-${Math.random().toString(36).slice(2)}`,
      date: typeof base.date === 'string' ? base.date : new Date().toISOString().split('T')[0],
      createdAt:
        typeof base.createdAt === 'number' && Number.isFinite(base.createdAt)
          ? base.createdAt
          : recordCreatedAt(base as MoodRecord),
      tag: typeof base.tag === 'string' ? base.tag : '阴转多云',
      intensity: typeof base.intensity === 'number' ? base.intensity : 5,
      note: typeof base.note === 'string' ? base.note : '平静观测记录',
      pressureHpa: typeof base.pressureHpa === 'number' ? base.pressureHpa : 1008,
      temperatureC: typeof base.temperatureC === 'number' ? base.temperatureC : 18,
      humidityPercent: typeof base.humidityPercent === 'number' ? base.humidityPercent : 65,
      windSpeedKmH: typeof base.windSpeedKmH === 'number' ? base.windSpeedKmH : 20,
      windDirectionDeg: typeof base.windDirectionDeg === 'number' ? base.windDirectionDeg : 0,
      windDirectionName: typeof base.windDirectionName === 'string' ? base.windDirectionName : '东北'
    };
  }

  private persist(records: MoodRecord[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }

  resetToSample(): MoodRecord[] {
    const sampleSequence: { tag: string; intensity: number; note: string; daysAgo: number }[] = [
      { tag: '晴空万里', intensity: 8, note: '项目顺利交付，周末在公园草坪晒太阳看书', daysAgo: 13 },
      { tag: '微风煦暖', intensity: 7, note: '和久违的老朋友喝咖啡，聊得很尽兴', daysAgo: 12 },
      { tag: '阴转多云', intensity: 5, note: '周一早会任务排得很满，平平淡淡地推进中', daysAgo: 11 },
      { tag: '暖湿气流过境', intensity: 6, note: '收到远方朋友的明信片与礼物，心里暖融融的', daysAgo: 10 },
      { tag: '低气压大雾', intensity: 4, note: '下雨天有点没精神，工作效率稍显迟缓', daysAgo: 9 },
      { tag: '局部有焦虑', intensity: 7, note: '季度目标对齐会议，几个指标有点卡住', daysAgo: 8 },
      { tag: '局部有焦虑', intensity: 8, note: '晚上失眠胡思乱想，担心后续进展', daysAgo: 7 },
      { tag: '突发雷暴', intensity: 9, note: '需求突然变更被要求大改，情绪瞬间崩溃爆发', daysAgo: 6 },
      { tag: '暖湿气流过境', intensity: 6, note: '同组成员主动分担了工作，并送了奶茶安慰', daysAgo: 5 },
      { tag: '阴转多云', intensity: 5, note: '调整心态，逐步把阻塞的问题拆解解决', daysAgo: 4 },
      { tag: '微风煦暖', intensity: 7, note: '晚风很舒服，去河边慢跑了5公里出了一身汗', daysAgo: 3 },
      { tag: '晴空万里', intensity: 8, note: '所有模块测试通过，终于可以松一口气', daysAgo: 2 },
      { tag: '微风煦暖', intensity: 7, note: '睡到自然醒，给阳台的多肉植物浇水修叶', daysAgo: 1 },
      { tag: '局部有焦虑', intensity: 7, note: '新的一周即将到来，局部依然盘旋着对未知的轻度担忧', daysAgo: 0 }
    ];

    const now = new Date();
    // 用确定的序号与日期生成示例 id/createdAt，重复重置得到一致结果；
    // createdAt 以当天 00:00 + 序号分钟构造，保证日期升序与创建时间升序一致
    const records: MoodRecord[] = sampleSequence.map((item, index) => {
      const d = new Date(now.getTime() - item.daysAgo * 86400000);
      const dateStr = d.toISOString().split('T')[0];
      const record = createRecordFromTag(item.tag, item.intensity, item.note, dateStr);
      const dayStart = new Date(dateStr + 'T00:00:00').getTime();
      record.createdAt = dayStart + index * 60000;
      record.id = `rec-${record.createdAt}`;
      return record;
    });

    const canonical = canonicalizeRecords(records);
    this.persist(canonical);
    return canonical;
  }
}
