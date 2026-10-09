// 假键盘加真实的交互库：测试架子和界面预览页都用它来驱动真实的提问。
import { PassThrough, Writable } from 'node:stream';
import xterm from '@xterm/headless';
import { inquirerPrompter } from '../src/inquirer-prompter.ts';
import type { Prompter } from '../src/prompter.ts';

export const KEY = { up: '\x1b[A', down: '\x1b[B', enter: '\r', space: ' ', ctrlC: '\x03' };
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

/** 把终端收到的原始输出放进无头终端，读出最后留在屏幕上的每一行（连同滚上去的）。 */
export async function screenLines(raw: string): Promise<string[]> {
  const terminal = new xterm.Terminal({ cols: COLUMNS, rows: 60, scrollback: 1000, allowProposedApi: true, convertEol: true });
  await new Promise<void>((resolve) => terminal.write(raw, resolve));
  const buffer = terminal.buffer.active;
  return Array.from({ length: buffer.length }, (_, row) => buffer.getLine(row)?.translateToString(true) ?? '');
}
