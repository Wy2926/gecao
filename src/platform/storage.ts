/**
 * 存档抽象（09 第十五节）：web=localStorage，桌面/Steam=文件/云存档。
 * 逻辑只依赖 StoragePort，平台实现可替换。M0 提供 web 实现。
 */
export interface StoragePort {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export class LocalStoragePort implements StoragePort {
  constructor(private readonly prefix = 'gecao:') {}

  async get(key: string): Promise<string | null> {
    return localStorage.getItem(this.prefix + key);
  }

  async set(key: string, value: string): Promise<void> {
    localStorage.setItem(this.prefix + key, value);
  }

  async remove(key: string): Promise<void> {
    localStorage.removeItem(this.prefix + key);
  }
}

/** 内存实现：用于测试与 headless。 */
export class MemoryStoragePort implements StoragePort {
  private map = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.map.delete(key);
  }
}
