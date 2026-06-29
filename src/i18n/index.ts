import { zhCN, type MessageKey } from './locales/zh-CN';

/**
 * 最小 i18n（B1）。M0 仅 zh-CN；接口形状预埋，未来加 locale 只需注册新表。
 * 所有面向玩家文案一律走 t(key)，不在逻辑/配置里写死硬文案。
 */
export type Locale = 'zh-CN';

const tables: Record<Locale, Record<string, string>> = {
  'zh-CN': zhCN,
};

let current: Locale = 'zh-CN';

export function setLocale(locale: Locale): void {
  current = locale;
}

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const table = tables[current];
  let str = table[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(`{${k}}`, String(v));
    }
  }
  return str;
}
