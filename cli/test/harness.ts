// 主接缝的测试架子：本地样例目录、临时主目录、只记录不执行的命令执行器、按预设应答的提问器。
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { afterEach } from 'vitest';
import { localCatalogSource, type CatalogSource } from '../src/catalog.ts';
import { runInstaller, type CommandResult } from '../src/installer.ts';
import {
  PromptAborted,
  type CheckboxQuestion,
  type ConfirmQuestion,
  type PasswordQuestion,
  type Prompter,
  type SelectQuestion,
} from '../src/prompter.ts';
import { EMPTY_CATALOG, SAMPLE_FILES, SAMPLE_SKILLS } from './fixtures.ts';
import { keyboardPrompter } from './terminal.ts';

export {
  EMPTY_CATALOG,
  KEYED_MCP,
  LONG_ABOUT,
  LONG_APP_ABOUT,
  LONG_MCP_ABOUT,
  LONG_TOOL_ABOUT,
  SAMPLE_APPS,
  SAMPLE_FILES,
  SAMPLE_MCPS,
  SAMPLE_SKILLS,
  SAMPLE_TOOLS,
} from './fixtures.ts';
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

/** 在 dir 下按“相对路径 → 内容”写出一批文件。 */
export function writeTree(dir: string, files: Record<string, string>): void {
  for (const [path, content] of Object.entries(files)) {
    const file = join(dir, ...path.split('/'));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
}

/**
 * 写出一份本地样例目录。index 和 catalog 传对象按 JSON 写，传字符串原样写（用来造写坏的文件），传 null 则不写这个文件；
 * content 是各个 skill 的内容，缺省是 SAMPLE_FILES。
 */
export function catalogDir(files: { index?: unknown; catalog?: unknown; content?: Record<string, string> } = {}): string {
  const dir = tempDir('catalog');
  const write = (name: string, content: unknown): void => {
    if (content === null) return;
    writeFileSync(join(dir, name), typeof content === 'string' ? content : JSON.stringify(content));
  };
  write('index.json', files.index === undefined ? { version: 1, skills: SAMPLE_SKILLS } : files.index);
  write('catalog.json', files.catalog === undefined ? EMPTY_CATALOG : files.catalog);
  writeTree(dir, files.content ?? SAMPLE_FILES);
  return dir;
}

type ListQuestion = SelectQuestion<unknown> | CheckboxQuestion<unknown>;
type Question = ListQuestion | ConfirmQuestion | PasswordQuestion;
type Prompt = 'select' | 'checkbox' | 'confirm' | 'password';
type Answer = (question: Question, prompt: Prompt) => unknown;

const RIGHT_ANSWER: Record<Prompt, string> = {
  select: '单选，要用 choose()',
  checkbox: '多选，要用 pick()',
  confirm: '是否题，要用 yes() 或 no()',
  password: '隐藏输入，要用 secret() 或 blank()',
};
// 应答用错了提问的种类就失败，并说该用哪个
const wrongAnswer = (question: Question, prompt: Prompt): Error =>
  new Error(`「${question.message}」是${RIGHT_ANSWER[prompt]}`);

function rowNamed(question: ListQuestion, label: string): { value: unknown } {
  for (const row of question.rows) {
    if ('separator' in row || firstCell(row.name) !== label) continue;
    if ('disabled' in row && row.disabled) throw new Error(`「${question.message}」里的「${label}」不可选`);
    return row;
  }
  throw new Error(`「${question.message}」里没有「${label}」这一项`);
}

/** 单选：选中第一栏文字等于 label 的那一行，和用户按画面上的字来选是一回事；那一行不可选就失败。 */
export function choose(label: string): Answer {
  return (question, prompt) => {
    if (prompt !== 'select' || !('rows' in question)) throw wrongAnswer(question, prompt);
    return rowNamed(question, label).value;
  };
}

/** 多选：只勾选第一栏文字等于这些 label 的行再确认；一个都不传就是什么都不勾直接确认。 */
export function pick(...labels: string[]): Answer {
  return (question, prompt) => {
    if (prompt !== 'checkbox' || !('rows' in question)) throw wrongAnswer(question, prompt);
    return labels.map((label) => rowNamed(question, label).value);
  };
}

const confirming =
  (answer: boolean): Answer =>
  (question, prompt) => {
    if (prompt !== 'confirm') throw wrongAnswer(question, prompt);
    return answer;
  };

/** 是否题：答「是」。 */
export const yes = (): Answer => confirming(true);

/** 是否题：答「否」。 */
export const no = (): Answer => confirming(false);

/** 隐藏输入：输入（或粘贴）这段文字再回车。 */
export function secret(value: string): Answer {
  return (question, prompt) => {
    if (prompt !== 'password') throw wrongAnswer(question, prompt);
    return value;
  };
}

/** 隐藏输入：什么都不输直接回车。 */
export const blank = (): Answer => secret('');

/**
 * 什么都不动直接回车：单选选中光标起始所在的那一项（它不可选就失败），多选照提问出现时的勾选确认，
 * 是否题取它的缺省回答。
 */
export function accept(): Answer {
  return (question, prompt) => {
    if (prompt === 'password') throw wrongAnswer(question, prompt);
    if (!('rows' in question)) return 'default' in question ? question.default : undefined;
    const choices = question.rows.flatMap((row) => ('separator' in row ? [] : [row]));
    if (prompt === 'checkbox') return choices.filter((row) => 'checked' in row && row.checked).map((row) => row.value);
    const active = ('default' in question && choices.find((row) => row.value === question.default)) || choices[0];
    if (!active) throw new Error(`「${question.message}」里没有可选的项`);
    if ('disabled' in active && active.disabled) throw new Error(`「${question.message}」的光标起始落在不可选的一项上`);
    return active.value;
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
  /** 可执行路径上有哪些命令，缺省只有 claude */
  onPath?: string[];
  /** 传 false 表示浏览器打不开：要打开的链接照样记下来，但链接打开器以失败告终 */
  browser?: boolean;
  /**
   * 预设外部命令的结果：命令照样记下来，不执行。返回的字段盖过缺省的结果（退出状态 0）；
   * 返回一个 Error 表示这条命令没能起来；什么都不返回就是缺省的结果。
   * 它自己抛出则表示执行器当场抛出、连承诺都没返回
   */
  commandResult?: (command: string, args: readonly string[], context: { home: string }) => Partial<CommandResult> | Error | undefined;
  /** 主目录的初始状态：相对路径 → 文件内容 */
  home?: Record<string, string>;
  /** 主目录里事先有的符号链接：链接的相对路径 → 它指向的相对路径，都相对主目录 */
  links?: Record<string, string>;
  /** 用户在提问之外按 Ctrl+C 的信号 */
  interrupt?: AbortSignal;
  /** 交给安装器放临时文件的目录，缺省新建一个 */
  tmp?: string;
  /** 标准输入、标准输出、标准错误是不是终端，缺省都是；传 false 表示都不是 */
  tty?: boolean | Streams;
  platform?: NodeJS.Platform;
  systemLocale?: string;
  /** 终端的列数；缺省不给，安装器按 80 列算 */
  columns?: number;
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
  /** 记录到的外部命令；整行交给 shell 的（工具的安装命令）多一个 shell: true，args 是空的 */
  commands: { command: string; args: readonly string[]; shell?: true }[];
  opened: string[];
  home: string;
  /** 交给安装器放临时文件的目录 */
  tmp: string;
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
  writeTree(home, options.home ?? {});
  for (const [link, target] of Object.entries(options.links ?? {})) {
    mkdirSync(dirname(join(home, link)), { recursive: true });
    // junction 只在 Windows 上起作用：那里建目录的符号链接要特权，建这种不用
    symlinkSync(join(home, target), join(home, link), 'junction');
  }
  const tmp = options.tmp ?? tempDir('tmp');
  const bin = tempDir('bin');
  for (const command of options.onPath ?? ['claude']) writeFileSync(join(bin, command), '', { mode: 0o755 });
  const tty = typeof options.tty === 'object' ? options.tty : { stdin: options.tty, stdout: options.tty, stderr: options.tty };
  const catalog = options.catalog ?? catalogDir();
  let unanswered: string | undefined;

  // 把提问照画面的样子记进输出：提问、每一行（多选的带上勾选框）、光标所在行的说明全文；是否题只有提问和缺省回答；
  // 隐藏输入只有提问和后面那句固定的提示，输入的东西不记
  const ask = (prompt: Prompt, question: Question, cursor?: unknown): unknown => {
    const lines = [`? ${question.message}`];
    if ('rows' in question) {
      const { icon } = question.theme;
      const choices = question.rows.flatMap((row) => ('separator' in row ? [] : [row]));
      const active = choices.find((row) => row.value === cursor) ?? choices[0];
      for (const row of question.rows) {
        if ('separator' in row) lines.push(` ${row.separator}`);
        // 不可选的行照交互库的拼法：单选的行首一个短横，多选的是不可选的勾选框；原因接在后面
        else if (row.disabled) {
          lines.push(question.theme.style.disabled(`${'checked' in row ? ` ${icon.disabledUnchecked}` : '-'} ${row.name} ${row.disabled}`));
        } else if ('checked' in row) lines.push(` ${row.checked ? icon.checked : icon.unchecked} ${row.name}`);
        else lines.push(`  ${row.name}`);
      }
      if (active?.description) lines.push(active.description);
    } else if ('default' in question) {
      lines[0] += question.default ? ' (Y/n)' : ' (y/N)';
    } else {
      lines[0] += ` ${question.theme.style.help(question.theme.style.maskedText)}`;
    }
    record('stdout')(`${lines.join('\n')}\n`);
    const answer = answers.shift();
    if (!answer) {
      unanswered = question.message;
      throw new PromptAborted();
    }
    return answer(question, prompt);
  };
  const scripted: Prompter = {
    select: async <Value>(question: SelectQuestion<Value>) => ask('select', question, question.default) as Value,
    checkbox: async <Value>(question: CheckboxQuestion<Value>) => ask('checkbox', question) as Value[],
    confirm: async (question) => ask('confirm', question) as boolean,
    password: async (question) => ask('password', question) as string,
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
      env: { LANG: 'zh_CN.UTF-8', TERM: 'xterm-256color', PATH: bin, ...options.env },
      platform: options.platform ?? 'linux',
      systemLocale: options.systemLocale ?? 'en-US',
      stdout: { isTTY: tty.stdout ?? true, rows: ROWS, columns: options.columns, write: record('stdout') },
      stderr: { isTTY: tty.stderr ?? true, write: record('stderr') },
      stdinIsTTY: tty.stdin ?? true,
      catalogSource: typeof catalog === 'string' ? localCatalogSource(catalog) : catalog,
      homeDir: home,
      tempDir: tmp,
      interrupt: options.interrupt ?? new AbortController().signal,
      runCommand: (command, args, runOptions) => {
        commands.push({ command, args, ...(runOptions?.shell ? { shell: true as const } : {}) });
        const preset = options.commandResult?.(command, args, { home });
        return preset instanceof Error ? Promise.reject(preset) : Promise.resolve({ exitCode: 0, ...preset });
      },
      prompter: options.keys ? interactive : scripted,
      openLink: async (url) => {
        opened.push(url);
        if (options.browser === false) throw new Error('spawn xdg-open ENOENT');
      },
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
    tmp,
  };
}
