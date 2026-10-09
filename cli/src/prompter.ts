// 提问器：安装器向用户提问的唯一出口。正式运行时由交互库实现，测试时换成按预设应答的替身。

export interface SelectChoice<Value> {
  value: Value;
  /** 列表里的一行，已按栏排好 */
  name: string;
  /** 回答之后显示的简称 */
  short: string;
  /** 光标停在这一行时，显示在列表下方的全文 */
  description?: string;
}

export interface SelectSeparator {
  /** 不可选的一行，用作表头或空行 */
  separator: string;
}

export type SelectRow<Value> = SelectChoice<Value> | SelectSeparator;

/** 提问各部分的样式，由呈现层给出。 */
export interface PromptTheme {
  prefix: { idle: string; done: string };
  icon: { cursor: string };
  style: {
    message: (text: string) => string;
    answer: (text: string) => string;
    highlight: (text: string) => string;
    description: (text: string) => string;
    keysHelpTip: (keys: [key: string, action: string][]) => string;
  };
}

export interface SelectQuestion<Value> {
  message: string;
  rows: readonly SelectRow<Value>[];
  /** 光标起始所在的那一项，缺省是第一项 */
  default?: Value;
  pageSize: number;
  theme: PromptTheme;
}

export interface Prompter {
  /** 单选。用户按 Ctrl+C 时以 PromptAborted 拒绝。 */
  select<Value>(question: SelectQuestion<Value>): Promise<Value>;
}

export class PromptAborted extends Error {
  constructor() {
    super('prompt aborted');
    this.name = 'PromptAborted';
  }
}
