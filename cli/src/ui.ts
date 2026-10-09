// 呈现层：所有终端输出都从这里出去，配色、符号、间距、横线和标题区由它统一决定（视觉方向「账本」）。
// 其余模块只说“显示什么”。
import { styleText } from 'node:util';
import type { Skill } from './catalog.ts';
import { MESSAGES, type Failure, type Lang } from './messages.ts';
import type { PromptTheme, SelectQuestion } from './prompter.ts';
import { displayWidth, pad, truncate, wrap } from './text.ts';

export interface TerminalOutput {
  write(text: string): void;
  isTTY: boolean;
  /** 终端的行数，用来决定列表一屏放多少行 */
  rows?: number | undefined;
}

type Format = Parameters<typeof styleText>[0];

// 按 80 列设计；每行右侧留一列不用，免得顶满时终端自己折行
const WIDTH = 80;
const USABLE = WIDTH - 1;
const KEY_WIDTH = 10;

const UNICODE = {
  done: '✓',
  cursor: '▸',
  separator: '·',
  ellipsis: '…',
  rule: '─',
  spinner: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  logo: [
    ' ██████  ██   ██ ██    ██',
    '██    ██  ██ ██   ██  ██',
    '██    ██   ███     ████',
    '██    ██  ██ ██     ██',
    ' ██████  ██   ██    ██',
  ],
};
// 没有 Unicode 的终端里的退路。那些符号的宽度在旧式控制台里说不准，会把对齐和通栏横线打乱
const ASCII: typeof UNICODE = {
  done: '+',
  cursor: '>',
  separator: '-',
  ellipsis: '...',
  rule: '-',
  spinner: ['-', '\\', '|', '/'],
  logo: [
    '  ___  __  ____   __',
    ' / _ \\ \\ \\/ /\\ \\ / /',
    '| | | | \\  /  \\ V /',
    '| |_| | /  \\   | |',
    ' \\___/ /_/\\_\\  |_|',
  ],
};
// 转动符号的节奏照搬交互库的默认值
const SPINNER_INTERVAL = 80;
const ERASE_LINE = '\r\x1b[2K';

export type GroupId = 'skill';
export type MenuChoice = GroupId | 'exit';

export type Environment = Readonly<Record<string, string | undefined>>;

export interface UiOptions {
  out: TerminalOutput;
  /** 出错说明写到这里，这样标准输出被重定向时用户仍然看得到 */
  err: TerminalOutput;
  lang: Lang;
  env: Environment;
  platform: NodeJS.Platform;
}

export type Ui = ReturnType<typeof createUi>;

// 悬挂缩进：首行以 lead 开头，正文过长时折行，续行与正文的左缘对齐
function hanging(indent: string, lead: string, text: string): string[] {
  const leadWidth = displayWidth(lead);
  return wrap(text, USABLE - indent.length - leadWidth).map(
    (line, index) => `${indent}${index === 0 ? lead : ' '.repeat(leadWidth)}${line}`,
  );
}

export function createUi({ out, err, lang, env, platform }: UiOptions) {
  const t = MESSAGES[lang];
  const unicode = supportsUnicode(env, platform);
  const symbols = unicode ? UNICODE : ASCII;
  const attention: Format = ['yellow', 'bold'];

  // 画面上是否已经有内容，两个输出流合起来算
  let blank = true;
  // 分区标题上方空一行，画面的第一行除外
  const gapAbove = (): string[] => (blank ? [] : ['']);

  // 每个输出流各自决定上不上色：是终端、且没有设置 NO_COLOR 才上色。
  // 不理会 FORCE_COLOR，所以它和 NO_COLOR 同时设置时以 NO_COLOR 为准
  const penFor = (stream: TerminalOutput) => {
    const color = stream.isTTY && env['NO_COLOR'] === undefined;
    const paint = (format: Format, text: string): string =>
      color ? styleText(format, text, { validateStream: false }) : text;
    const dim = (text: string): string => paint('dim', text);
    return {
      paint,
      dim,
      print(...lines: string[]): void {
        stream.write(`${lines.join('\n')}\n`);
        blank = false;
      },
      rule: (): string => dim(symbols.rule.repeat(WIDTH)),
      // 分区标题：标题嵌在线里，线一直画到第 80 列
      section: (title: string, format: Format = 'bold'): string =>
        `${dim(symbols.rule.repeat(2))} ${paint(format, title)} ${dim(symbols.rule.repeat(Math.max(0, WIDTH - 4 - displayWidth(title))))}`,
      // 键值行：缩进两格，键占 10 列；值过长时折行
      keyValue: (key: string, value: string, keyFormat: Format = 'dim'): string[] =>
        hanging('  ', paint(keyFormat, pad(key, KEY_WIDTH)), value),
    };
  };
  const { paint, dim, print, rule, section, keyValue } = penFor(out);
  const errors = penFor(err);

  // 两栏的表：第一栏按最长的一格定宽，第二栏折行
  const twoColumns = (rows: readonly (readonly [string, string])[]): string[] => {
    const firstWidth = Math.max(...rows.map(([first]) => displayWidth(first))) + 2;
    return rows.flatMap(([first, second]) => hanging('  ', pad(first, firstWidth), second));
  };

  const theme: PromptTheme = {
    prefix: { idle: paint(['cyan', 'bold'], '?'), done: paint('green', symbols.done) },
    icon: { cursor: paint('cyan', symbols.cursor) },
    style: {
      message: (text) => paint('bold', text),
      answer: (text) => `${dim(symbols.separator)} ${text}`,
      // 光标所在行整行加粗。行内片段的收尾码会把粗体一并关掉，所以每次收尾后重申一次
      highlight: (text) => paint('bold', text.replaceAll('\x1b[22m', '\x1b[22m\x1b[1m')),
      description: (text) => hanging('   ', dim(pad(t.aboutColumn, displayWidth(t.aboutColumn) + 2)), text).join('\n'),
      keysHelpTip: (keys) =>
        `   ${keys
          .map(([key, action]) => `${unicode ? key : (t.keyNames[key] ?? key)} ${dim(t.keys[action] ?? action)}`)
          .join(dim(` ${symbols.separator} `))}`,
    },
  };

  // 条目一次全部列出；一屏放不下时才由交互库滚动
  const pageSize = (): number => Math.max(7, (out.rows ?? 24) - 6);

  return {
    line(text: string): void {
      print(text);
    },

    /** 启动时的 OXY 大标志：产品名、版本号和一句话说明压在右下角，下面一条通栏横线。 */
    logo(version: string): void {
      const corner = [`${paint('bold', 'oxy-tools')} ${dim(version)}`, dim(t.tagline)];
      const art = symbols.logo.map((row, index) => {
        const right = corner[index - (symbols.logo.length - corner.length)];
        const left = unicode ? row : paint('bold', row);
        return right ? `${left}${' '.repeat(WIDTH - displayWidth(row) - displayWidth(right))}${right}` : left;
      });
      print('', ...art, rule());
    },

    /** 读取目录时的进行中提示，行首的符号转动；done() 把这一行擦掉。 */
    loading(): { done(): void } {
      let frame = 0;
      const draw = (): void => {
        const mark = symbols.spinner[frame++ % symbols.spinner.length] ?? '';
        out.write(`${ERASE_LINE}  ${paint('cyan', mark)} ${t.loading}${dim(symbols.ellipsis)}`);
      };
      draw();
      const timer = setInterval(draw, SPINNER_INTERVAL);
      return {
        done() {
          clearInterval(timer);
          out.write(ERASE_LINE);
        },
      };
    },

    /** 本机信息：目录里各类条目的数量，有被跳过的坏条目时多一行提醒。 */
    catalogSummary({ skills, skipped }: { skills: number; skipped: number }): void {
      print(
        ...keyValue(t.catalogKey, t.counts({ skills })),
        ...(skipped > 0 ? keyValue(t.noticeKey, t.skipped(skipped), attention) : []),
        rule(),
        '',
      );
    },

    failure(failure: Failure): void {
      const { title, cause, location, next } = t.failure(failure);
      errors.print(
        ...gapAbove(),
        errors.section(`${t.errorPrefix}${title}`, ['red', 'bold']),
        ...errors.keyValue(t.causeKey, cause),
        // 网址和路径不截断也不折行，独占一行
        ...(location === undefined ? [] : [`  ${' '.repeat(KEY_WIDTH)}${location}`]),
        ...next.flatMap((step, index) => errors.keyValue(index === 0 ? t.nextKey : '', step)),
      );
    },

    help(version: string): void {
      print(
        `${paint('bold', 'oxy-tools')} ${dim(version)}  ${dim(t.tagline)}`,
        '',
        section(t.help.usage),
        `  ${t.help.usageLine}`,
        '',
        section(t.help.options),
        ...twoColumns(t.help.optionRows),
        '',
        section(t.help.environment),
        ...twoColumns(t.help.environmentRows),
      );
    },

    /** 从某个分组回到主菜单：新一轮提问与上一轮已回答的几行之间空一行。 */
    backToMenu(): void {
      print('');
    },

    mainMenu(groups: readonly { id: GroupId; count: number }[]): SelectQuestion<MenuChoice> {
      const rows = groups.map((group) => ({ ...group, ...t.groups[group.id], count: String(group.count) }));
      const labelWidth = Math.max(displayWidth(t.groupColumn), ...rows.map((row) => displayWidth(row.label))) + 2;
      const countWidth = Math.max(displayWidth(t.countColumn), ...rows.map((row) => row.count.length));
      const aboutWidth = USABLE - 2 - labelWidth - countWidth - 2;
      const line = (label: string, count: string, about: string): string =>
        `${pad(label, labelWidth)}${pad(count, countWidth, 'right')}  ${truncate(about, aboutWidth, symbols.ellipsis)}`;
      return {
        message: t.pickGroup,
        pageSize: pageSize(),
        theme,
        rows: [
          ...(rows.length > 0
            ? [
                // 表头比条目多缩进一格：交互库在分隔行前只放一个空格，条目前是两格
                { separator: dim(` ${line(t.groupColumn, t.countColumn, t.aboutColumn)}`) },
                ...rows.map((row) => ({ value: row.id, short: row.label, name: line(row.label, row.count, row.about) })),
                { separator: ' ' },
              ]
            : []),
          { value: 'exit' as const, short: t.exit, name: t.exit },
        ],
      };
    },

    /** skill 列表；选中的值是那个 skill，null 表示返回。cursor 是光标起始所在的 skill。 */
    skillList(skills: readonly Skill[], cursor?: Skill): SelectQuestion<Skill | null> {
      const nameWidth = Math.max(displayWidth(t.nameColumn), ...skills.map((skill) => displayWidth(skill.name))) + 2;
      const aboutWidth = USABLE - 2 - nameWidth;
      return {
        message: t.browseSkills,
        pageSize: pageSize(),
        theme,
        ...(cursor ? { default: cursor } : {}),
        rows: [
          { separator: dim(` ${pad(t.nameColumn, nameWidth)}${t.aboutColumn}`) },
          ...skills.map((skill) => ({
            value: skill,
            short: skill.name,
            name: `${pad(skill.name, nameWidth)}${truncate(skill.description[lang], aboutWidth, symbols.ellipsis)}`,
            description: skill.description[lang],
          })),
          { separator: ' ' },
          { value: null, short: t.back, name: t.back },
        ],
      };
    },

    skillDetail(skill: Skill): void {
      print(
        ...gapAbove(),
        section(skill.name),
        ...keyValue(t.versionKey, skill.version),
        ...keyValue(t.aboutColumn, skill.description[lang]),
        '',
      );
    },
  };
}

// 与交互库自己的判断保持一致（@inquirer/figures，它没有导出这个判断）：
// Windows 上只有这些终端算支持 Unicode，其他系统上只有 Linux 的内核控制台不算
function supportsUnicode(env: Environment, platform: NodeJS.Platform): boolean {
  if (platform !== 'win32') return env['TERM'] !== 'linux';
  return (
    Boolean(env['CI']) ||
    Boolean(env['WT_SESSION']) ||
    Boolean(env['TERMINUS_SUBLIME']) ||
    env['ConEmuTask'] === '{cmd::Cmder}' ||
    env['TERM_PROGRAM'] === 'Terminus-Sublime' ||
    env['TERM_PROGRAM'] === 'vscode' ||
    env['TERM'] === 'xterm-256color' ||
    env['TERM'] === 'alacritty' ||
    env['TERMINAL_EMULATOR'] === 'JetBrains-JediTerm'
  );
}
