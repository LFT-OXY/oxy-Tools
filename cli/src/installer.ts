// 安装器入口，也是测试的主接缝：外部依赖全部由调用方传入，正式运行时用真实实现，测试时全部替换。
import { CatalogError, loadCatalog, localCatalogSource, type CatalogSource } from './catalog.ts';
import { mainMenu } from './flow.ts';
import { claudeCode } from './hosts.ts';
import type { Failure, Lang } from './messages.ts';
import { PromptAborted, type Prompter } from './prompter.ts';
import { createUi, type Environment, type TerminalOutput } from './ui.ts';
import { VERSION } from './version.ts';

/** 外部命令执行器 */
export type CommandRunner = (command: string, args: readonly string[]) => Promise<{ exitCode: number }>;
/** 链接打开器：在默认浏览器里打开一个网址 */
export type LinkOpener = (url: string) => Promise<void>;

export interface InstallerOptions {
  /** 启动参数，不含 node 和脚本路径 */
  argv: readonly string[];
  env: Environment;
  platform: NodeJS.Platform;
  /** 系统语言环境（如 zh-CN），环境变量里没有语言设置时用它 */
  systemLocale: string;
  stdout: TerminalOutput;
  /** 出错说明写到标准错误，这样标准输出被重定向时用户仍然看得到 */
  stderr: TerminalOutput;
  stdinIsTTY: boolean;
  catalogSource: CatalogSource;
  homeDir: string;
  /** 放临时文件的目录 */
  tempDir: string;
  /** 用户在提问之外按 Ctrl+C 时触发。触发后进程随即退出，所以监听它的收尾只能是同步的 */
  interrupt: AbortSignal;
  runCommand: CommandRunner;
  prompter: Prompter;
  openLink: LinkOpener;
}

const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;
// 被 Ctrl+C 中断时 shell 惯用的退出状态
const EXIT_INTERRUPTED = 130;

/** 运行安装器，返回进程的退出状态。 */
export async function runInstaller(options: InstallerOptions): Promise<number> {
  const { env, stdout } = options;
  const args = parseArguments(options.argv);
  const ui = createUi({
    out: stdout,
    err: options.stderr,
    lang: args.lang ?? detectLang(env, options.systemLocale),
    env,
    platform: options.platform,
  });

  try {
    if (args.invalid) {
      ui.failure(args.invalid);
      return EXIT_USAGE;
    }
    if (args.help) {
      ui.help(VERSION);
      return 0;
    }
    if (args.version) {
      ui.line(VERSION);
      return 0;
    }
    if (!stdout.isTTY || !options.stdinIsTTY) {
      ui.failure({ kind: 'no-terminal' });
      return EXIT_FAILURE;
    }

    ui.logo(VERSION);
    const loading = ui.loading('catalog');
    // 维护者预览用：环境变量把目录来源改为本地目录
    const localCatalog = env['OXY_TOOLS_CATALOG'];
    const source = localCatalog ? localCatalogSource(localCatalog) : options.catalogSource;
    const catalog = await loadCatalog(source).finally(() => loading.done());
    const host = claudeCode(env, options.homeDir);
    ui.catalogSummary({ host, skills: catalog.skills.length, skipped: catalog.skipped.length });
    await mainMenu({
      catalog,
      source,
      host,
      homeDir: options.homeDir,
      tempDir: options.tempDir,
      githubToken: env['GITHUB_TOKEN'] || undefined,
      interrupt: options.interrupt,
      ui,
      prompter: options.prompter,
    });
    return 0;
  } catch (error) {
    if (error instanceof PromptAborted) return EXIT_INTERRUPTED;
    if (error instanceof CatalogError) {
      ui.failure(error.failure);
      return EXIT_FAILURE;
    }
    // 只取消息的第一行：后面可能跟着堆栈；消息为空时退而用错误的类型名
    const message = error instanceof Error ? error.message.split('\n')[0] || error.name : String(error);
    ui.failure({ kind: 'unexpected', detail: message });
    return EXIT_FAILURE;
  }
}

interface Arguments {
  lang?: Lang;
  help: boolean;
  version: boolean;
  invalid?: Failure;
}

function parseArguments(argv: readonly string[]): Arguments {
  const args: Arguments = { help: false, version: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index] ?? '';
    if (arg === '-h' || arg === '--help') {
      args.help = true;
    } else if (arg === '-v' || arg === '--version') {
      args.version = true;
    } else if (arg === '--lang' || arg.startsWith('--lang=')) {
      const value = arg === '--lang' ? argv[++index] : arg.slice('--lang='.length);
      if (value !== 'zh' && value !== 'en') return { ...args, invalid: { kind: 'bad-language', value } };
      args.lang = value;
    } else {
      return { ...args, invalid: { kind: 'unknown-argument', argument: arg } };
    }
  }
  return args;
}

function detectLang(env: Environment, systemLocale: string): Lang {
  const locale = env['LC_ALL'] || env['LC_MESSAGES'] || env['LANG'] || systemLocale;
  return /^zh/i.test(locale) ? 'zh' : 'en';
}
