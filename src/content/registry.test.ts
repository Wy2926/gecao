import { describe, it, expect } from 'vitest';
import { ContentRegistry, type ContentEntry } from './registry';

interface CardLike extends ContentEntry {
  label: string;
}

describe('ContentRegistry', () => {
  it('registers and retrieves by id', () => {
    const reg = new ContentRegistry<CardLike>();
    reg.register({ id: 'core:slash', namespace: 'core', label: '横扫' });
    expect(reg.has('core:slash')).toBe(true);
    expect(reg.get('core:slash')?.label).toBe('横扫');
    expect(reg.size).toBe(1);
  });

  it('rejects duplicate ids', () => {
    const reg = new ContentRegistry<CardLike>();
    reg.register({ id: 'core:a', namespace: 'core', label: 'A' });
    expect(() => reg.register({ id: 'core:a', namespace: 'core', label: 'A2' })).toThrow();
  });

  it('filters by namespace (core vs mod)', () => {
    const reg = new ContentRegistry<CardLike>();
    reg.register({ id: 'core:a', namespace: 'core', label: 'A' });
    reg.register({ id: 'mod1:b', namespace: 'mod1', label: 'B' });
    expect(reg.byNamespace('core').length).toBe(1);
    expect(reg.byNamespace('mod1').length).toBe(1);
  });
});

describe('GameEventBus', () => {
  it('respects chain depth limit', async () => {
    const { GameEventBus } = await import('@/core/event-bus');
    const bus = new GameEventBus({ maxChainDepth: 2 });
    const seen: number[] = [];
    bus.on('tick', (e, b) => {
      seen.push(e.chainDepth);
      b.emit('tick', undefined, e.chainDepth + 1);
    });
    bus.emit('tick', undefined, 0);
    // 反复 flush 直到队列稳定
    for (let i = 0; i < 10; i++) bus.flush();
    // chainDepth 0,1,2 被处理，3 超限丢弃
    expect(seen).toEqual([0, 1, 2]);
  });
});
