// 假键盘加真实的交互库：测试架子和界面预览页都用它来驱动真实的提问。
import { PassThrough, Writable } from 'node:stream';
import xterm from '@xterm/headless';
import { inquirerPrompter } from '../src/inquirer-prompter.ts';
import type { Prompter } from '../src/prompter.ts';

export const KEY = { up: '\x1b[A', down: '\x1b[B', enter: '\r', space: ' ', ctrlC: '\x03' };
export const COLUMNS = 80;
/** 语言提问的文案：它不随界面语言变，架子靠它认出这一问 */
export const LANGUAGE_QUESTION = 'Language / 语言';
// 语言提问的最后一个选项
const LAST_LANGUAGE = 'English';

/**
 * 提问由真实的交互库画到 write 上；往返回的 keyboard 里写按键。
 * 语言提问缺省由它替用户按回车，接受光标起始所在的那一项；answersLanguage 为真时不替，留给调用方自己按。
 */
export function keyboardPrompter(
  write: (text: string) => void,
  rows: number,
  answersLanguage = false,
): { keyboard: PassThrough; prompter: Prompter } {
  const keyboard = Object.assign(new PassThrough(), { isTTY: true, setRawMode: () => keyboard });
  // 语言提问已经问出去、还没替用户按回车
  let languagePending = false;
  // 交互库在每个提示结束时会关掉输出流，所以每个提示给一个新的
  const real = inquirerPrompter(() => ({
    input: keyboard,
    output: Object.assign(
      new Writable({
        write(chunk: Buffer, _encoding, callback) {
          const text = chunk.toString();
          write(text);
          // 交互库画完第一帧才开始听按键，早按的会丢：等最后一个选项画出来，再让出这一轮才按
          if (languagePending && text.includes(LAST_LANGUAGE)) {
            languagePending = false;
            setImmediate(() => keyboard.write(KEY.enter));
          }
          callback();
        },
      }),
      { isTTY: true, columns: COLUMNS, rows },
    ),
  }));
  const prompter: Prompter = {
    ...real,
    select: (question) => {
      if (question.message === LANGUAGE_QUESTION && !answersLanguage) languagePending = true;
      return real.select(question);
    },
  };
  return { keyboard, prompter };
}

/**
 * 把终端收到的原始输出放进无头终端，读出最后留在屏幕上的每一行（连同滚上去的）。
 * rows 是终端的行数：最后的 rows 行是还在屏幕上的，前面的都滚上去了
 */
export async function screenLines(raw: string, rows = 60): Promise<string[]> {
  const terminal = new xterm.Terminal({ cols: COLUMNS, rows, scrollback: 1000, allowProposedApi: true, convertEol: true });
  await new Promise<void>((resolve) => terminal.write(raw, resolve));
  const buffer = terminal.buffer.active;
  return Array.from({ length: buffer.length }, (_, row) => buffer.getLine(row)?.translateToString(true) ?? '');
}
