// 假键盘加真实的交互库：测试架子和界面预览页都用它来驱动真实的提问。
import { PassThrough, Writable } from 'node:stream';
import { inquirerPrompter } from '../src/inquirer-prompter.ts';
import type { Prompter } from '../src/prompter.ts';

export const KEY = { down: '\x1b[B', enter: '\r', space: ' ', ctrlC: '\x03' };
export const COLUMNS = 80;

/** 提问由真实的交互库画到 write 上；往返回的 keyboard 里写按键。 */
export function keyboardPrompter(
  write: (text: string) => void,
  rows: number,
): { keyboard: PassThrough; prompter: Prompter } {
  const keyboard = Object.assign(new PassThrough(), { isTTY: true, setRawMode: () => keyboard });
  // 交互库在每个提示结束时会关掉输出流，所以每个提示给一个新的
  const prompter = inquirerPrompter(() => ({
    input: keyboard,
    output: Object.assign(
      new Writable({
        write(chunk: Buffer, _encoding, callback) {
          write(chunk.toString());
          callback();
        },
      }),
      { isTTY: true, columns: COLUMNS, rows },
    ),
  }));
  return { keyboard, prompter };
}
