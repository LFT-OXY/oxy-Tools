// 安装器入口，也是测试的主接缝：外部依赖全部由调用方传入，正式运行时用真实实现，测试时全部替换。
import type { Machine } from './availability.ts';
import { CatalogError, loadCatalog, localCatalogSource, type CatalogSource } from './catalog.ts';
import { mainMenu } from './flow.ts';
import { detectHosts, type Environment } from './hosts.ts';
import type { Failure, Lang } from './messages.ts';
import { PromptAborted, type Prompter } from './prompter.ts';
import { Interrupted, unexpected, type Runtime } from './run-plan.ts';
import { createUi, type TerminalOutput } from './ui.ts';
import { VERSION } from './version.ts';
import { runWebUi } from './web-ui.ts';

/** 外部命令跑完的结果 */
export interface CommandResult {
  exitCode: number;
}
export type CommandOptions =
  | {
      /**
       * command 是一整行，交给系统的 shell 去解释（工具的官方安装命令，里面可以有管道），这时 args 是空的；
       * 命令的输入输出直接接在用户的终端上
       */
      shell: true;
    }
  | {
      shell?: never;
      /** 不经 shell 的方式下另外带上的环境变量，盖在命令继承来的环境之上；不给就原样继承 */
      env?: Readonly<Record<string, string>>;
      /** 在哪个目录下运行；不给就是进程自己的当前目录 */
      cwd?: string;
    };
/**
 * 外部命令执行器：缺省不经过 shell，不把命令的输出打到终端上，它也读不到用户的输入；options 见 CommandOptions。
 * 命令没能起来时拒绝
 */
export type CommandRunner = (command: string, args: readonly string[], options?: CommandOptions) => Promise<CommandResult>;
/** 链接打开器：在默认浏览器里打开一个网址，打不开时拒绝。只用来打开网页界面：外部项目的链接不由安装器打开 */
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
  /** 项目目录：运行安装器时所在的目录。安装范围选「项目」时装到它下面 */
  projectDir: string;
  /** 放临时文件的目录 */
  tempDir: string;
  /** 网页界面的静态文件所在的目录 */
  webDir: string;
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
  const speaking = (lang: Lang, continued = false) =>
    createUi({ out: stdout, err: options.stderr, lang, env, platform: options.platform, continued });
  // 没给 --lang 时先按系统语言说话：不问语言就退出的几种情况、大标志和语言提问都用它；网页界面开着时终端上一直是它
  const startingLang = args.lang ?? detectLang(env, options.systemLocale);
  let ui = speaking(startingLang);

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
    // 没给 --lang 就问语言。提问收成的那一行留在画面上：按选定的语言接着写时，画面上已经有内容
    const askLanguage = async (): Promise<void> => {
      if (args.lang === undefined) ui = speaking(await options.prompter.select(ui.languageQuestion()), true);
    };
    // 开发期间的临时开关：非空时用网页界面。网页界面不在终端上问语言
    const web = Boolean(env['OXY_TOOLS_WEB']);
    if (!web) await askLanguage();
    const loading = ui.loading('catalog');
    // 维护者预览用：环境变量把目录来源改为本地目录
    const localCatalog = env['OXY_TOOLS_CATALOG'];
    const source = localCatalog ? localCatalogSource(localCatalog) : options.catalogSource;
    const catalog = await loadCatalog(source).finally(() => loading.done());
    const hosts = detectHosts(env, options.homeDir, options.projectDir);
    const counts = {
      // 本仓库的和第三方的合在一起数
      skills: catalog.skills.length + catalog.thirdPartySkills.length,
      mcps: catalog.mcps.length,
      tools: catalog.tools.length,
      apps: catalog.apps.length,
    };
    ui.catalogSummary({ hosts, ...counts, skipped: catalog.skipped.length });
    const machine: Machine = { hosts, env, platform: options.platform, homeDir: options.homeDir, projectDir: options.projectDir };
    // 执行要的东西，两套界面交给「执行」的是同一份
    const runtime: Runtime = {
      ...machine,
      source,
      tempDir: options.tempDir,
      githubToken: env['GITHUB_TOKEN'] || undefined,
      interrupt: options.interrupt,
      runCommand: options.runCommand,
      keys: new Map(),
    };
    if (web) {
      const outcome = await runWebUi({ lang: startingLang, version: VERSION, catalog, runtime, counts, webDir: options.webDir, ui, openLink: options.openLink });
      if (outcome === 'finished') return 0;
      // 进来之后才知道网页界面用不了：说明一句原因，从语言提问接着走终端界面。目录不重读
      ui.webUnavailable(outcome.unavailable);
      await askLanguage();
    }
    await mainMenu({ ...runtime, catalog, ui, prompter: options.prompter });
    return 0;
  } catch (error) {
    if (error instanceof PromptAborted || error instanceof Interrupted) return EXIT_INTERRUPTED;
    if (error instanceof CatalogError) {
      ui.failure(error.failure);
      return EXIT_FAILURE;
    }
    ui.failure(unexpected(error));
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
