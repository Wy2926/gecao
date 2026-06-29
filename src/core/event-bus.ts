/**
 * 战斗事件总线（09 第三节、10 卡引擎执行载体）。
 * 队列 + chainDepth 上限 + 每帧预算，防止联动连锁递归爆栈/刷爆性能。
 *
 * M0 仅预埋形状：事件类型与派发骨架；具体战斗事件在 M4/M5 接入。
 */

export interface GameEvent {
  readonly type: string;
  readonly chainDepth: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 事件载荷在各系统处强类型化；总线层保持开放。
  readonly payload?: Record<string, any>;
}

export type EventHandler = (event: GameEvent, bus: GameEventBus) => void;

export interface EventBusOptions {
  maxChainDepth?: number;
  maxEventsPerFrame?: number;
}

export class GameEventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private queue: GameEvent[] = [];
  private readonly maxChainDepth: number;
  private readonly maxEventsPerFrame: number;

  constructor(opts: EventBusOptions = {}) {
    this.maxChainDepth = opts.maxChainDepth ?? 8;
    this.maxEventsPerFrame = opts.maxEventsPerFrame ?? 4096;
  }

  on(type: string, handler: EventHandler): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler);
    return () => set.delete(handler);
  }

  /** 入队一个事件（不立即派发）。chainDepth 超限则丢弃，防递归爆栈。 */
  emit(type: string, payload?: GameEvent['payload'], chainDepth = 0): void {
    if (chainDepth > this.maxChainDepth) return;
    this.queue.push({ type, payload, chainDepth });
  }

  /** 消化队列（每帧调用一次）。受 maxEventsPerFrame 预算保护。 */
  flush(): void {
    let processed = 0;
    while (this.queue.length > 0 && processed < this.maxEventsPerFrame) {
      const event = this.queue.shift()!;
      const set = this.handlers.get(event.type);
      if (set) {
        for (const handler of set) handler(event, this);
      }
      processed++;
    }
  }

  clear(): void {
    this.queue.length = 0;
    this.handlers.clear();
  }
}
