// 主接缝的测试架子：本地样例目录、临时主目录、只记录不执行的命令执行器、按预设应答的提问器；
// 测网页界面时另给一段页面的脚本，架子拿着链接打开器记下的网址扮演浏览器。
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { openPage, type Page } from './browser.ts';
import { EMPTY_CATALOG, SAMPLE_FILES, SAMPLE_SKILLS } from './fixtures.ts';
import { KEY, LANGUAGE_QUESTION, SCOPE_QUESTIONS, keyboardPrompter } from './terminal.ts';

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
  SAMPLE_PURPOSES,
  SAMPLE_SKILLS,
  SAMPLE_THIRD_PARTY,
  SAMPLE_TOOLS,
  underWebSearch,
} from './fixtures.ts';
export { KEY } from './terminal.ts';
export type { Page } from './browser.ts';

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

/**
 * 一个会卡在向 GitHub 查询上的本地目录来源，release() 之后照常装：用来停在一批装到一半的地方。
 * dir 缺省是 catalogDir()
 */
export function heldCatalog(dir = catalogDir()): { catalog: CatalogSource; release: () => void } {
  const local = localCatalogSource(dir);
  let release = (): void => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  return { catalog: { ...local, pin: async (options) => (await held, local.pin(options)) }, release };
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
// 最后留在画面上的字：被擦掉重写的行只算最后一次
const screenOf = (raw: string): string =>
  raw
    .split('\n')
    .map((line) => (line.includes(ERASE_LINE) ? line.slice(line.lastIndexOf(ERASE_LINE) + ERASE_LINE.length) : line))
    .join('\n');
const ROWS = 40;
// 页面的静态文件是构建产物：全部测试之前由 globalSetup（build-web.ts）打一遍
const BUILT_WEB = fileURLToPath(new URL('../dist/web/', import.meta.url));
// 页面的脚本跑完之后，等安装器退出最多这么久
const EXIT_PATIENCE_MS = 2000;
// 页面全都断开之后等多久才当作页面关了：正式运行是 5 秒，测试里不等那么久
const PAGE_GRACE_MS = 150;

/** 用户面前的终端：页面的脚本里用它做终端上的事 */
export interface Terminal {
  /**
   * 在待命的提问上按一个键（KEY.ctrlC 是按 Ctrl+C）。预设应答的提问器下，这时没有待命的提问在等就失败；
   * 用真实的交互库时（给了 keys）键直接写进假键盘，按早了会丢：先等按键提示画出来
   */
  press(key: string): void;
  /** 这一刻留在画面上的文字，和 RunResult.screen 同一种算法 */
  screen(): string;
  /** 到这一刻为止终端收到的原始输出：交给 screenLines 还原真实的画面 */
  raw(): string;
}

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
   * 语言提问由谁应答。缺省由架子替用户按回车，接受光标起始所在的那一项，answers 和 keys 里都不用写它；
   * 传 true 则它和别的提问一样，用掉 answers 的第一个应答，或由 keys 的脚本来按
   */
  answersLanguage?: boolean;
  /** 安装范围的提问由谁应答：缺省同样由架子替用户按回车（全局）；传 true 则由 answers 或 keys 应答 */
  answersScope?: boolean;
  /**
   * 改用真实的交互库渲染提问，并按脚本发按键：等画面上新出现 waitFor 这段文字，再按下 key。
   * 用来核对提问部分实际打到终端上的东西。
   */
  keys?: [waitFor: string, key: string][];
  /** 本地样例目录的路径，或一个现成的目录来源；缺省是 catalogDir() */
  catalog?: string | CatalogSource;
  /** 可执行路径上有哪些命令，缺省只有 claude */
  onPath?: string[];
  /**
   * 预设外部命令的结果：命令照样记下来，不执行。返回的字段盖过缺省的结果（退出状态 0）；
   * 返回一个 Error 表示这条命令没能起来；什么都不返回就是缺省的结果。
   * 它自己抛出则表示执行器当场抛出、连承诺都没返回
   */
  commandResult?: (
    command: string,
    args: readonly string[],
    /** cwd 是这条命令被指定在哪个目录下运行，没指定时没有 */
    context: { home: string; cwd?: string },
  ) => Partial<CommandResult> | Error | undefined;
  /** 主目录的初始状态：相对路径 → 文件内容 */
  home?: Record<string, string>;
  /** 项目目录（运行安装器时所在的目录）的初始状态：相对路径 → 文件内容 */
  project?: Record<string, string>;
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
  /** 终端的行数，缺省 40 */
  rows?: number;
  /**
   * 在页面上做什么。给了它就走网页界面（架子打开临时开关）：架子拿着链接打开器记下的网址，经真实的本机 HTTP
   * 扮演浏览器，收到第一份画面状态之后跑这段脚本。脚本跑完时安装器应当已经在退出了。不给就走终端界面。
   * world 是这次运行的主目录和项目目录（页面开着的时候要改机器上的东西就往那里写），和用户面前的终端
   */
  page?: (page: Page, world: { home: string; project: string; terminal: Terminal }) => Promise<void>;
  /** 网页界面的页面全都断开之后等多久才当作页面关了，缺省 150 毫秒；要在时限内重连的用例给一个长些的 */
  pageGraceMs?: number;
  /** 浏览器打不打得开，缺省打得开；false 时链接打开器记下网址之后拒绝 */
  browserOpens?: boolean;
  /** 网页界面的静态文件所在的目录，缺省是构建出来的那一份；给一个不存在的目录就是本机的网页起不来 */
  webDir?: string;
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
  /**
   * 记录到的外部命令；整行交给 shell 的（工具的安装命令）多一个 shell: true，args 是空的；
   * 不经 shell 而另带了环境变量的（第三方 Skill 的安装命令）多一个 env，指定了在哪个目录下运行的
   * （装到项目的第三方 Skill 和 MCP）再多一个 cwd
   */
  commands: { command: string; args: readonly string[]; shell?: true; env?: Readonly<Record<string, string>>; cwd?: string }[];
  /** 交给链接打开器的网址：走终端界面时一直是空的，走网页界面时只有一个，就是网页界面的网址 */
  opened: string[];
  home: string;
  /** 交给安装器当项目目录的那个临时目录 */
  project: string;
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
  // 项目目录的路径要比一行长，「项目」那一行才截得到：Linux 的临时目录只是 /tmp，垫一层长名字
  const project = join(tempDir('project'), 'a-directory-name-long-enough-to-overflow-one-line', 'workspace');
  mkdirSync(project, { recursive: true });
  writeTree(project, options.project ?? {});
  const tmp = options.tmp ?? tempDir('tmp');
  const bin = tempDir('bin');
  for (const command of options.onPath ?? ['claude']) writeFileSync(join(bin, command), '', { mode: 0o755 });
  const tty = typeof options.tty === 'object' ? options.tty : { stdin: options.tty, stdout: options.tty, stderr: options.tty };
  const catalog = options.catalog ?? catalogDir();
  let unanswered: string | undefined;

  // 把提问照画面的样子记进输出：提问（它上下的空行在主题的提问标记和提问样式里，有就照打）、每一行（多选的带上
  // 勾选框）、光标所在行的说明全文；是否题只有提问和缺省回答；隐藏输入只有提问和后面那句固定的提示，输入的东西不记
  const ask = (prompt: Prompt, question: Question, cursor?: unknown): unknown => {
    const { prefix, style } = question.theme;
    const lines = [plain(`${prefix.idle} ${style.message(question.message, 'idle')}`)];
    if ('rows' in question) {
      const { icon } = question.theme;
      const choices = question.rows.flatMap((row) => ('separator' in row ? [] : [row]));
      const active = choices.find((row) => row.value === cursor) ?? choices[0];
      for (const row of question.rows) {
        if ('separator' in row) lines.push(` ${row.separator}`.trimEnd());
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
    if (question.message === LANGUAGE_QUESTION && !options.answersLanguage) return accept()(question, prompt);
    if (SCOPE_QUESTIONS.includes(question.message) && !options.answersScope) return accept()(question, prompt);
    const answer = answers.shift();
    if (!answer) {
      unanswered = question.message;
      throw new PromptAborted();
    }
    return answer(question, prompt);
  };
  // 待命的提问在等按键时，把一个键交给它
  let standingBy: ((key: string) => void) | undefined;
  const scripted: Prompter = {
    select: async <Value>(question: SelectQuestion<Value>) => ask('select', question, question.default) as Value,
    checkbox: async <Value>(question: CheckboxQuestion<Value>) => ask('checkbox', question) as Value[],
    confirm: async (question) => ask('confirm', question) as boolean,
    password: async (question) => ask('password', question) as string,
    // 待命：那一行按键提示记进输出，行尾不换行；结束时照真实的样子擦掉。它不吃预设的应答：按键由页面的脚本来按
    standby: (question, withdraw) =>
      new Promise((resolve, reject) => {
        record('stdout')(question.theme.style.keysHelpTip(question.hint));
        const settle = (finish: () => void): void => {
          record('stdout')(ERASE_LINE);
          standingBy = undefined;
          withdraw.removeEventListener('abort', withdrawn);
          finish();
        };
        const withdrawn = (): void => settle(() => resolve(undefined));
        if (withdraw.aborted) return withdrawn();
        withdraw.addEventListener('abort', withdrawn);
        standingBy = (key) => {
          if (key === KEY.ctrlC) settle(() => reject(new PromptAborted()));
          else if (key in question.answers) settle(() => resolve(question.answers[key]));
        };
      }),
  };

  const rows = options.rows ?? ROWS;
  const { keyboard, prompter: real, accepts } = keyboardPrompter(record('stdout'), rows, options.answersLanguage, options.answersScope);
  // 画面上到这里为止的字，脚本已经认过了
  let seen = 0;
  // 假键盘正替用户应答语言提问或安装范围的提问。它们的按键提示和主菜单的是同一句：等它收成一行，脚本才开始认画面上的字
  let answeringForUser = false;
  const interactive: Prompter = {
    ...real,
    select: async (question) => {
      if (!accepts(question.message)) return real.select(question);
      answeringForUser = true;
      try {
        return await real.select(question);
      } finally {
        seen = plain(textOf()).length;
        answeringForUser = false;
      }
    },
  };
  const typing = async (): Promise<void> => {
    for (const [waitFor, key] of options.keys ?? []) {
      const deadline = Date.now() + 2000;
      while (answeringForUser || !plain(textOf()).slice(seen).includes(waitFor)) {
        if (Date.now() > deadline) throw new Error(`画面上一直没有出现「${waitFor}」：\n${plain(textOf()).slice(seen)}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      seen = plain(textOf()).length;
      keyboard.write(key);
    }
  };

  const terminal: Terminal = {
    press(key) {
      if (options.keys) return void keyboard.write(key);
      if (!standingBy) throw new Error(`终端上没有待命的提问，按下的 ${JSON.stringify(key)} 没有人接`);
      standingBy(key);
    },
    screen: () => plain(screenOf(textOf())),
    raw: () => textOf(),
  };

  // 架子自己也要能中断安装器：页面的脚本出了错，或跑完了安装器却没有退出
  const stopping = new AbortController();
  const stop = (): void => stopping.abort();
  if (options.interrupt?.aborted) stop();
  options.interrupt?.addEventListener('abort', stop);
  let visit: Promise<void> | undefined;
  let pageFailure: unknown;
  const visiting = async (script: NonNullable<RunOptions['page']>, url: string): Promise<void> => {
    let page: Awaited<ReturnType<typeof openPage>> | undefined;
    try {
      page = await openPage(url);
      await script(page, { home, project, terminal });
      let patience: NodeJS.Timeout | undefined;
      const exited = await Promise.race([
        installer.then(() => true),
        new Promise<boolean>((resolve) => (patience = setTimeout(() => resolve(false), EXIT_PATIENCE_MS))),
      ]);
      clearTimeout(patience);
      if (!exited) throw new Error('页面的脚本跑完了，安装器还没有退出');
    } catch (error) {
      pageFailure = error;
      stop();
    } finally {
      page?.dispose();
    }
  };

  const installer: Promise<number> = runInstaller({
    argv: options.argv ?? [],
    env: { LANG: 'zh_CN.UTF-8', TERM: 'xterm-256color', PATH: bin, ...(options.page ? { OXY_TOOLS_WEB: '1' } : {}), ...options.env },
    platform: options.platform ?? 'linux',
    systemLocale: options.systemLocale ?? 'en-US',
    stdout: { isTTY: tty.stdout ?? true, rows, columns: options.columns, write: record('stdout') },
    stderr: { isTTY: tty.stderr ?? true, write: record('stderr') },
    stdinIsTTY: tty.stdin ?? true,
    catalogSource: typeof catalog === 'string' ? localCatalogSource(catalog) : catalog,
    homeDir: home,
    projectDir: project,
    tempDir: tmp,
    webDir: options.webDir ?? BUILT_WEB,
    pageGraceMs: options.pageGraceMs ?? PAGE_GRACE_MS,
    interrupt: stopping.signal,
    runCommand: (command, args, runOptions) => {
      const cwd = runOptions?.shell ? undefined : runOptions?.cwd;
      commands.push({
        command,
        args,
        ...(runOptions?.shell ? { shell: true as const } : runOptions?.env ? { env: runOptions.env } : {}),
        ...(cwd === undefined ? {} : { cwd }),
      });
      const preset = options.commandResult?.(command, args, { home, ...(cwd === undefined ? {} : { cwd }) });
      return preset instanceof Error ? Promise.reject(preset) : Promise.resolve({ exitCode: 0, ...preset });
    },
    prompter: options.keys ? interactive : scripted,
    openLink: async (url) => {
      opened.push(url);
      if (options.browserOpens === false) throw new Error('no browser');
      if (options.page) visit = visiting(options.page, url);
    },
  });
  const [exitCode] = await Promise.all([installer, typing()]);
  await visit;
  options.interrupt?.removeEventListener('abort', stop);

  if (pageFailure !== undefined) throw pageFailure;
  if (options.page && !visit) throw new Error('给了页面的脚本，安装器却没有打开网页界面');
  if (unanswered !== undefined) throw new Error(`没有为提问「${unanswered}」预设应答`);
  if (answers.length > 0) throw new Error(`还有 ${answers.length} 个预设应答没有用上`);
  const raw = textOf();
  return {
    exitCode,
    output: plain(raw),
    raw,
    stdout: plain(textOf('stdout')),
    stderr: plain(textOf('stderr')),
    screen: plain(screenOf(raw)),
    commands,
    opened,
    home,
    project,
    tmp,
  };
}
