import { MoodRecord } from '../core/models';
import { MoodRepositoryPort } from '../ports/mood-repository.port';
import { createRecordFromTag } from '../core/meteorology-engine';
import { canonicalizeRecords, recordCreatedAt } from '../core/mood-ordering';

const STORAGE_KEY = 'mood_meteorology_records_v1';

export class LocalStorageMoodAdapter implements MoodRepositoryPort {
  getAll(): MoodRecord[] {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return this.normalize(parsed);
        }
      } catch {
        // 损坏数据降级为示例序列
      }
    }
    return this.resetToSample();
  }

  /**
   * 规范化持久化数据：补齐历史记录缺失的 createdAt，并按稳定全序落盘。
   * 同一日允许多条签到记录，刷新后顺序不会变化。
   */
  private normalize(parsed: unknown[]): MoodRecord[] {
    const valid = parsed.filter((item): item is MoodRecord =>
      !!item && typeof item === 'object'
      && typeof (item as MoodRecord).id === 'string'
      && typeof (item as MoodRecord).date === 'string'
      && typeof (item as MoodRecord).tag === 'string'
    );
    if (valid.length === 0) return [];

    const withTimestamps = valid.map(record =>
      typeof record.createdAt === 'number' ? record : { ...record, createdAt: recordCreatedAt(record) }
    );
    return canonicalizeRecords(withTimestamps);
  }

  add(record: MoodRecord): void {
    const records = this.getAll();
    // 同日多条并存：新记录追加后按稳定全序统一落盘（不再按日期覆盖）
    records.push(record);
    const canonical = canonicalizeRecords(records);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(canonical));
  }

  delete(id: string): void {
    const records = this.getAll().filter(r => r.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(canonicalizeRecords(records)));
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
    // 示例记录按生成顺序赋予严格递增的创建时刻，保证全序确定
    const baseTimestamp = now.getTime();
    const records: MoodRecord[] = sampleSequence.map((item, index) => {
      const d = new Date(now.getTime() - item.daysAgo * 86400000);
      const dateStr = d.toISOString().split('T')[0];
      const record = createRecordFromTag(item.tag, item.intensity, item.note, dateStr);
      return { ...record, createdAt: baseTimestamp + index };
    });

    const canonical = canonicalizeRecords(records);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(canonical));
    return canonical;
  }
}
