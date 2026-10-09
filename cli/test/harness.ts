// 主接缝的测试架子：本地样例目录、临时主目录、只记录不执行的命令执行器、按预设应答的提问器。
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { afterEach } from 'vitest';
import { localCatalogSource, type CatalogSource } from '../src/catalog.ts';
import { runInstaller } from '../src/installer.ts';
import { PromptAborted, type Prompter, type SelectQuestion } from '../src/prompter.ts';
import { EMPTY_CATALOG, SAMPLE_SKILLS } from './fixtures.ts';
import { keyboardPrompter } from './terminal.ts';

export { EMPTY_CATALOG, LONG_ABOUT, SAMPLE_SKILLS } from './fixtures.ts';
export { KEY } from './terminal.ts';

/** 任何样式码（颜色、粗体、暗淡、下划线） */
export const STYLE_CODE = /\x1b\[[0-9;]*m/;
/** 堆栈里的一帧 */
export const STACK_FRAME = /^\s+at .+:\d+:\d+\)?$/m;

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

export function tempDir(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `oxy-tools-${label}-`));
  tempDirs.push(dir);
  return dir;
}

/** 写出一份本地样例目录。传对象按 JSON 写，传字符串原样写（用来造写坏的文件），传 null 则不写这个文件。 */
export function catalogDir(files: { index?: unknown; catalog?: unknown } = {}): string {
  const dir = tempDir('catalog');
  const write = (name: string, content: unknown): void => {
    if (content === null) return;
    writeFileSync(join(dir, name), typeof content === 'string' ? content : JSON.stringify(content));
  };
  write('index.json', files.index === undefined ? { version: 1, skills: SAMPLE_SKILLS } : files.index);
  write('catalog.json', files.catalog === undefined ? EMPTY_CATALOG : files.catalog);
  return dir;
}

type Answer = (question: SelectQuestion<unknown>) => unknown;

/** 选中第一栏文字等于 label 的那一行，和用户按画面上的字来选是一回事。 */
export function choose(label: string): Answer {
  return (question) => {
    for (const row of question.rows) {
      if ('separator' in row) continue;
      if (firstCell(row.name) === label) return row.value;
    }
    throw new Error(`「${question.message}」里没有「${label}」这一项`);
  };
}

/** 用户在这个提问上按了 Ctrl+C。 */
export function interrupt(): Answer {
  return () => {
    throw new PromptAborted();
  };
}

const plain = stripVTControlCharacters;
const firstCell = (text: string): string => plain(text).trim().split(/\s{2,}/)[0] ?? '';
const ERASE_LINE = '\r\x1b[2K';
const ROWS = 40;

interface Streams {
  stdin?: boolean;
  stdout?: boolean;
  stderr?: boolean;
}

export interface RunOptions {
  argv?: string[];
  env?: Record<string, string>;
  /** 按预设应答的提问器：每个提问依次用掉一个 */
  answers?: Answer[];
  /**
   * 改用真实的交互库渲染提问，并按脚本发按键：等画面上新出现 waitFor 这段文字，再按下 key。
   * 用来核对提问部分实际打到终端上的东西。
   */
  keys?: [waitFor: string, key: string][];
  /** 本地样例目录的路径，或一个现成的目录来源；缺省是 catalogDir() */
  catalog?: string | CatalogSource;
  /** 标准输入、标准输出、标准错误是不是终端，缺省都是；传 false 表示都不是 */
  tty?: boolean | Streams;
  platform?: NodeJS.Platform;
  systemLocale?: string;
}

export interface RunResult {
  exitCode: number;
  /** 终端上出现过的全部文字（标准输出与标准错误按先后合在一起），去掉了样式码 */
  output: string;
  /** 同上，但保留样式码 */
  raw: string;
  /** 只有标准输出的部分，去掉了样式码 */
  stdout: string;
  /** 只有标准错误的部分，去掉了样式码 */
  stderr: string;
  /** 最后留在画面上的文字：被擦掉重写的行（加载提示）只算最后一次。只适用于预设应答的提问器 */
  screen: string;
  commands: { command: string; args: readonly string[] }[];
  opened: string[];
  home: string;
}

export async function run(options: RunOptions = {}): Promise<RunResult> {
  const written: { stream: 'stdout' | 'stderr'; text: string }[] = [];
  const record = (stream: 'stdout' | 'stderr') => (text: string) => void written.push({ stream, text });
  const textOf = (stream?: 'stdout' | 'stderr'): string =>
    written.filter((chunk) => !stream || chunk.stream === stream).map((chunk) => chunk.text).join('');
  const commands: RunResult['commands'] = [];
  const opened: string[] = [];
  const answers = [...(options.answers ?? [])];
  const home = tempDir('home');
  const tty = typeof options.tty === 'object' ? options.tty : { stdin: options.tty, stdout: options.tty, stderr: options.tty };
  const catalog = options.catalog ?? catalogDir();
  let unanswered: string | undefined;

  // 把提问照画面的样子记进输出：提问、每一行、光标所在行的说明全文
  const scripted: Prompter = {
    async select<Value>(question: SelectQuestion<Value>): Promise<Value> {
      const choices = question.rows.filter((row) => !('separator' in row));
      const active = choices.find((row) => 'value' in row && row.value === question.default) ?? choices[0];
      const lines = [`? ${question.message}`];
      for (const row of question.rows) lines.push('separator' in row ? ` ${row.separator}` : `  ${row.name}`);
      if (active && 'description' in active && active.description) lines.push(active.description);
      record('stdout')(`${lines.join('\n')}\n`);
      const answer = answers.shift();
      if (!answer) {
        unanswered = question.message;
        throw new PromptAborted();
      }
      return answer(question as SelectQuestion<unknown>) as Value;
    },
  };

  const { keyboard, prompter: interactive } = keyboardPrompter(record('stdout'), ROWS);
  const typing = async (): Promise<void> => {
    let seen = 0;
    for (const [waitFor, key] of options.keys ?? []) {
      const deadline = Date.now() + 2000;
      while (!plain(textOf()).slice(seen).includes(waitFor)) {
        if (Date.now() > deadline) throw new Error(`画面上一直没有出现「${waitFor}」：\n${plain(textOf()).slice(seen)}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      seen = plain(textOf()).length;
      keyboard.write(key);
    }
  };

  const [exitCode] = await Promise.all([
    runInstaller({
      argv: options.argv ?? [],
      env: { LANG: 'zh_CN.UTF-8', TERM: 'xterm-256color', ...options.env },
      platform: options.platform ?? 'linux',
      systemLocale: options.systemLocale ?? 'en-US',
      stdout: { isTTY: tty.stdout ?? true, rows: ROWS, write: record('stdout') },
      stderr: { isTTY: tty.stderr ?? true, write: record('stderr') },
      stdinIsTTY: tty.stdin ?? true,
      catalogSource: typeof catalog === 'string' ? localCatalogSource(catalog) : catalog,
      homeDir: home,
      runCommand: async (command, args) => {
        commands.push({ command, args });
        return { exitCode: 0 };
      },
      prompter: options.keys ? interactive : scripted,
      openLink: async (url) => void opened.push(url),
    }),
    typing(),
  ]);

  if (unanswered !== undefined) throw new Error(`没有为提问「${unanswered}」预设应答`);
  if (answers.length > 0) throw new Error(`还有 ${answers.length} 个预设应答没有用上`);
  const raw = textOf();
  const screen = raw
    .split('\n')
    .map((line) => (line.includes(ERASE_LINE) ? line.slice(line.lastIndexOf(ERASE_LINE) + ERASE_LINE.length) : line))
    .join('\n');
  return {
    exitCode,
    output: plain(raw),
    raw,
    stdout: plain(textOf('stdout')),
    stderr: plain(textOf('stderr')),
    screen: plain(screen),
    commands,
    opened,
    home,
  };
}
