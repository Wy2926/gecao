/**
 * 内容注册表（09 第十五节、10 卡引擎）。内置内容与 MOD 走同一通路。
 * M0 预埋形状：命名空间 + 注册/查询；zod schema 校验与 MOD 加载在 MVP 后接入。
 */

export interface ContentEntry {
  /** 全局唯一 id，建议 'namespace:localId'。 */
  id: string;
  /** 来源命名空间（'core' 或 MOD 名）。 */
  namespace: string;
}

export class ContentRegistry<T extends ContentEntry> {
  private entries = new Map<string, T>();

  register(entry: T): void {
    if (this.entries.has(entry.id)) {
      throw new Error(`ContentRegistry: duplicate id "${entry.id}"`);
    }
    this.entries.set(entry.id, entry);
  }

  get(id: string): T | undefined {
    return this.entries.get(id);
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  all(): readonly T[] {
    return [...this.entries.values()];
  }

  byNamespace(namespace: string): readonly T[] {
    return this.all().filter((e) => e.namespace === namespace);
  }

  get size(): number {
    return this.entries.size;
  }
}
