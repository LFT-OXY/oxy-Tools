// 提问器：安装器向用户提问的唯一出口。正式运行时由交互库实现，测试时换成按预设应答的替身。

export interface SelectChoice<Value> {
  value: Value;
  /** 列表里的一行，已按栏排好 */
  name: string;
  /** 回答之后显示的简称 */
  short: string;
  /** 光标停在这一行时，显示在列表下方的全文 */
  description?: string;
  /** 这一行不可选的原因，接在这一行的末尾；有它就选不了 */
  disabled?: string;
}

export interface SelectSeparator {
  /** 不可选的一行，用作表头或空行 */
  separator: string;
}

export type SelectRow<Value> = SelectChoice<Value> | SelectSeparator;

export interface CheckboxChoice<Value> extends SelectChoice<Value> {
  /** 提问出现时是否已勾选 */
  checked: boolean;
}

export type CheckboxRow<Value> = CheckboxChoice<Value> | SelectSeparator;

/** 提问各部分的样式，由呈现层给出。 */
export interface PromptTheme {
  /** idle 可以以换行开头：提问上方的那一行空行，只在还在问的时候占着，回答之后随提问一起收掉 */
  prefix: { idle: string; done: string };
  /** disabledChecked、disabledUnchecked 是多选里不可选的行的勾选框 */
  icon: { cursor: string; checked: string; unchecked: string; disabledChecked: string; disabledUnchecked: string };
  style: {
    /** status 是提问的状态：回答之后是 done */
    message: (text: string, status: string) => string;
    answer: (text: string) => string;
    highlight: (text: string) => string;
    description: (text: string) => string;
    /** 不可选的一整行，原因夹在里面 */
    disabled: (text: string) => string;
    /** 在不可选的行上按了确认时，列表下方的那句话 */
    error: (text: string) => string;
    /** 多选回答之后显示什么 */
    renderSelectedChoices: (selected: readonly { short: string }[]) => string;
    keysHelpTip: (keys: [key: string, action: string][]) => string;
    /** 是否题后面的按键提示（y/n） */
    defaultAnswer: (text: string) => string;
    /** 按键提示里代表缺省回答的那个字母 */
    confirmDefault: (text: string) => string;
    /** 隐藏输入的提问后面那句固定的提示，和它的样式 */
    maskedText: string;
    help: (text: string) => string;
  };
  i18n: { disabledError: string };
  /** 是否题认的两个按键，以及输入了别的东西时的那句话 */
  keywords: { yes: string; no: string; error: () => string };
}

export interface SelectQuestion<Value> {
  message: string;
  rows: readonly SelectRow<Value>[];
  /** 光标起始所在的那一项，缺省是第一项 */
  default?: Value;
  pageSize: number;
  theme: PromptTheme;
}

export interface CheckboxQuestion<Value> {
  message: string;
  rows: readonly CheckboxRow<Value>[];
  pageSize: number;
  theme: PromptTheme;
}

export interface ConfirmQuestion {
  message: string;
  /** 什么都不输直接回车时的回答 */
  default: boolean;
  /** 回答之后显示的字 */
  answers: { yes: string; no: string };
  theme: PromptTheme;
}

export interface PasswordQuestion {
  message: string;
  theme: PromptTheme;
}

export interface Prompter {
  /** 单选。用户按 Ctrl+C 时以 PromptAborted 拒绝。 */
  select<Value>(question: SelectQuestion<Value>): Promise<Value>;
  /** 多选，返回勾选的那些值；一个都不勾也能确认。用户按 Ctrl+C 时以 PromptAborted 拒绝。 */
  checkbox<Value>(question: CheckboxQuestion<Value>): Promise<Value[]>;
  /** 是否题。用户按 Ctrl+C 时以 PromptAborted 拒绝。 */
  confirm(question: ConfirmQuestion): Promise<boolean>;
  /**
   * 隐藏输入：输入的东西不回显，也不暴露长度。回答之后这个提问从屏幕上擦掉，
   * 结局由呈现层另写一行。用户按 Ctrl+C 时以 PromptAborted 拒绝。
   */
  password(question: PasswordQuestion): Promise<string>;
}

export class PromptAborted extends Error {
  constructor() {
    super('prompt aborted');
    this.name = 'PromptAborted';
  }
}
