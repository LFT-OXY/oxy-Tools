// 呈现层：所有终端输出都从这里出去，配色、符号、间距、横线和标题区由它统一决定（视觉方向「账本」）。
// 其余模块只说“显示什么”。
import { styleText } from 'node:util';
import type { App, Mcp, McpVariable, Purpose, Skill, SourcedSkill, ThirdPartySkill, Tool, ToolOs } from './catalog.ts';
import type { Command, Host, Scope } from './hosts.ts';
import type { McpInstallProblem } from './install-mcp.ts';
import type { SkillInstallProblem } from './install-skill.ts';
import type { ThirdPartyResult } from './install-third-party.ts';
import type { ToolResult } from './install-tool.ts';
import type { InstallableMcpStatus, McpStatus } from './mcp-status.ts';
import { MESSAGES, type Failure, type KeyOutcome, type Lang, type ToolEvidence } from './messages.ts';
import type { CheckboxQuestion, ConfirmQuestion, PasswordQuestion, PromptTheme, SelectQuestion } from './prompter.ts';
import type { SkillStatus } from './skill-status.ts';
import type { ThirdPartyStatus } from './third-party-status.ts';
import type { ToolStatus } from './tool-status.ts';
import { displayWidth, pad, truncate, wrap } from './text.ts';

export interface TerminalOutput {
  write(text: string): void;
  isTTY: boolean;
  /** 终端的行数，用来决定列表一屏放多少行 */
  rows?: number | undefined;
  columns?: number | undefined;
}

type Format = Parameters<typeof styleText>[0];

// 按 80 列设计；每行右侧留一列不用，免得顶满时终端自己折行
const WIDTH = 80;
const USABLE = WIDTH - 1;
const KEY_WIDTH = 10;
// 表的栏间隔：每一栏最长的一格后面空这么多格，所有的表同一个数
const GUTTER = 3;
// 混合列表里组件的说明一栏至少这么宽，不然整栏不写：推荐标记的 7 列再加 5 列说明
const MIN_ABOUT = 12;
// 多选回答之后收成的那一行最多列出几个名字
const NAMES_SHOWN = 3;

const UNICODE = {
  done: '✓',
  failed: '✗',
  dash: '–',
  cursor: '▸',
  checked: '■',
  unchecked: '□',
  unavailable: '–',
  separator: '·',
  ellipsis: '…',
  arrow: '→',
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
  failed: 'x',
  dash: '-',
  cursor: '>',
  checked: '[x]',
  unchecked: '[ ]',
  unavailable: '[-]',
  separator: '-',
  ellipsis: '...',
  arrow: '->',
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
// 大标志的渐变从左到右依次经过这三个色标：粉、紫、蓝
const LOGO_STOPS = ['#E255C0', '#8B5CF6', '#3D8FE6'].map((hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)));
// 语言提问的三段字是固定的，不随界面语言变：还没选之前，读哪种语言的人都要认得出自己的那一项
const LANGUAGE_QUESTION = 'Language / 语言';
const LANGUAGES: readonly { lang: Lang; label: string }[] = [
  { lang: 'zh', label: '中文' },
  { lang: 'en', label: 'English' },
];
// 转动符号的节奏照搬交互库的默认值
const SPINNER_INTERVAL = 80;
const ERASE_LINE = '\r\x1b[2K';
// 零宽空格：圈出不可选的行里的原因。整行压暗时跳过圈着的这一段，圈本身不打出去
const REASON_MARK = '\u200b';

export type MenuChoice = 'recommended' | Purpose | 'exit';
export type InstallDecision = 'install' | 'revise' | 'cancel';
export type InstallOutcome = { ok: true; version: string } | { ok: false; problem: SkillInstallProblem };

/** 一项安装：哪个条目、装进哪个宿主、装到哪（给用户看的路径）、要装的版本、那里现在的状态 */
export interface InstallTarget {
  name: string;
  host: string;
  location: string;
  version: string;
  status: SkillStatus;
}

/**
 * 一项第三方 Skill 安装：哪个 skill（entry 是它所属条目的名字）、装进哪个宿主、装到哪（给用户看的路径）、
 * 那里现在是不是已经有东西
 */
export interface ThirdPartyTarget {
  entry: string;
  name: string;
  host: string;
  location: string;
  exists: boolean;
}

/** 一项 MCP 安装：哪个条目、装进哪个宿主、它在那里现在的状态 */
export interface McpTarget {
  name: string;
  host: string;
  status: InstallableMcpStatus;
}

export type McpOutcome = { ok: true } | { ok: false; problem: McpInstallProblem };

/** 工具不可选的原因：一个宿主都没检测到，条目把当前系统标为不支持，或它要的宿主一个都没检测到 */
export type ToolUnavailable = { kind: 'no-host' } | { kind: 'os'; os: ToolOs } | { kind: 'hosts' };

/** 一项工具安装：哪个条目、要执行的那一行命令、装完之后查什么 */
export interface ToolTarget {
  name: string;
  command: string;
  evidence: ToolEvidence;
}

export type Environment = Readonly<Record<string, string | undefined>>;

export interface UiOptions {
  out: TerminalOutput;
  /** 出错说明写到这里，这样标准输出被重定向时用户仍然看得到 */
  err: TerminalOutput;
  lang: Lang;
  env: Environment;
  platform: NodeJS.Platform;
  /**
   * 接在别的输出后面：画面上已经有内容，且不是以空行收尾（语言提问回答之后按选定的语言重建时）。
   * 缺省画面还是空的
   */
  continued?: boolean;
}

export type Ui = ReturnType<typeof createUi>;

// 展示时不加引号也不会被 shell 另作解释的参数
const PLAIN_ARGUMENT = /^[A-Za-z0-9@%+=:,./_~-]+$/;

// 给用户看的一条完整命令。参数里有 shell 会另作解释的字符（网址里的 & ? 之类）就加上单引号，照着敲也是同一条命令。
// key 的位置写成占位符 <变量名>，由 placeholder 上样式；真实的值不到这里来
function commandLine({ command, args }: Command, placeholder: (text: string) => string = (text) => text): string {
  return [command, ...args]
    .map((arg) => {
      if (typeof arg !== 'string') return `${arg.variable}=${placeholder(`<${arg.variable}>`)}`;
      return PLAIN_ARGUMENT.test(arg) ? arg : `'${arg.replaceAll("'", "'\\''")}'`;
    })
    .join(' ');
}

// 大标志某一列的 24 位前景色码。t 是这一列在标志里的位置，最左是 0，最右是 1；相邻两个色标之间红、绿、蓝各自线性过渡
function logoColor(t: number): string {
  const scaled = t * (LOGO_STOPS.length - 1);
  const index = Math.min(LOGO_STOPS.length - 2, Math.floor(scaled));
  const from = LOGO_STOPS[index] ?? [];
  const to = LOGO_STOPS[index + 1] ?? [];
  const channels = from.map((channel, at) => Math.round(channel + ((to[at] ?? channel) - channel) * (scaled - index)));
  return `\x1b[38;2;${channels.join(';')}m`;
}

// 悬挂缩进：首行以 lead 开头，正文过长时折行，续行与正文的左缘对齐
function hanging(indent: string, lead: string, text: string): string[] {
  const leadWidth = displayWidth(lead);
  return wrap(text, USABLE - indent.length - leadWidth).map(
    (line, index) => `${indent}${index === 0 ? lead : ' '.repeat(leadWidth)}${line}`,
  );
}

export function createUi({ out, err, lang, env, platform, continued = false }: UiOptions) {
  const t = MESSAGES[lang];
  const unicode = supportsUnicode(env, platform);
  const symbols = unicode ? UNICODE : ASCII;
  const attention: Format = ['yellow', 'bold'];
  // 当前焦点：提问标记、光标、已勾选的框、转动符号。和大标志退成的洋红是同一个颜色
  const focus = 'magenta';

  // 画面的最后一行是不是空行（画面还是空的也算）：是的话，下一块上方不再另空，免得连着两行空行。
  // 两个输出流合起来算
  let spaced = !continued;
  // 一块的上方空一行，上面已经是空行时除外
  const gapAbove = (): string[] => (spaced ? [] : ['']);

  // 每个输出流各自决定上不上色：是终端、且没有设置 NO_COLOR 才上色。
  // 不理会 FORCE_COLOR，所以它和 NO_COLOR 同时设置时以 NO_COLOR 为准
  const penFor = (stream: TerminalOutput) => {
    const color = stream.isTTY && env['NO_COLOR'] === undefined;
    const paint = (format: Format, text: string): string =>
      color ? styleText(format, text, { validateStream: false }) : text;
    const dim = (text: string): string => paint('dim', text);
    // 分区标题：标题嵌在线里，线一直画到第 80 列
    const section = (title: string, format: Format = 'bold'): string =>
      `${dim(symbols.rule.repeat(2))} ${paint(format, title)} ${dim(symbols.rule.repeat(Math.max(0, WIDTH - 4 - displayWidth(title))))}`;
    return {
      styled: color,
      paint,
      dim,
      print(...lines: string[]): void {
        stream.write(`${lines.join('\n')}\n`);
        spaced = lines.at(-1) === '';
      },
      rule: (): string => dim(symbols.rule.repeat(WIDTH)),
      section,
      // 一个分区的开头：标题上下各空一行，上面已经是空行时上方不再另空
      heading: (title: string, format?: Format): string[] => [...gapAbove(), section(title, format), ''],
      // 键值行：缩进两格，键占 10 列；值过长时折行
      keyValue: (key: string, value: string, keyFormat: Format = 'dim'): string[] =>
        hanging('  ', paint(keyFormat, pad(key, KEY_WIDTH)), value),
    };
  };
  const { styled, paint, dim, print, rule, section, heading, keyValue } = penFor(out);
  const errors = penFor(err);
  // 上面还不是空行时空一行
  const gap = (): void => {
    if (!spaced) print('');
  };

  // 两栏的表：第一栏按最长的一格定宽，第二栏折行
  const twoColumns = (rows: readonly (readonly [string, string])[]): string[] => {
    const firstWidth = Math.max(...rows.map(([first]) => displayWidth(first))) + GUTTER;
    return rows.flatMap(([first, second]) => hanging('  ', pad(first, firstWidth), second));
  };

  // 每一栏取这一栏里最长的一格再加栏间隔
  const columnWidths = (rows: readonly (readonly string[])[]): number[] =>
    (rows[0] ?? []).map((_, column) => Math.max(...rows.map((row) => displayWidth(row[column] ?? ''))) + GUTTER);

  // 汇总里按类型分的几张小表，合起来排：条目（表头是类型的名字）、宿主、操作三栏各张表对齐，located 的表多一栏位置。
  // actionOnly 的表（工具）只有条目和操作两栏，操作紧跟在条目后面：条目一栏和别的表同宽，别的栏宽不看它。
  // 表头暗淡，哪一栏都不截断。备注整个分区一个放法：每一格都放得下才成一栏；有一格放不下就都另起一行，与位置的
  // 左缘对齐（那里也放不下最长的一格时，一起往左挪到放得下），表头不写这一栏。一格备注都没有的表也不写
  const summaryTables = (
    tables: readonly {
      title: string;
      located: boolean;
      actionOnly?: boolean;
      rows: readonly { cells: readonly [name: string, host: string, action: string]; location: string; note: string }[];
    }[],
  ): string[] => {
    type Table = (typeof tables)[number];
    const [nameWidth = 0] = columnWidths(tables.flatMap((table) => [[table.title], ...table.rows.map((row) => [row.cells[0]])]));
    const [, hostWidth = 0, actionWidth = 0] = columnWidths(
      tables.filter((table) => !table.actionOnly).flatMap((table) => [[table.title, t.agentColumn, t.actionColumn], ...table.rows.map((row) => row.cells)]),
    );
    const widths = [nameWidth, hostWidth, actionWidth];
    const locationWidth = Math.max(displayWidth(t.locationColumn), ...tables.flatMap((table) => table.rows.map((row) => displayWidth(row.location)))) + GUTTER;
    const noteStart = 2 + widths.reduce((sum, width) => sum + width, 0);
    const start = (table: Table, cells: readonly string[], location: string): string =>
      table.actionOnly
        ? `  ${pad(cells[0] ?? '', nameWidth)}${cells[2] ?? ''}`
        : `  ${cells.map((cell, column) => pad(cell, widths[column] ?? 0)).join('')}${table.located ? pad(location, locationWidth) : ''}`;
    const noteHeader = (table: Table): string => (table.rows.some((row) => row.note !== '') ? t.noteColumn : '');
    // 没有备注的行不参与：它后面什么都不写，位置再长也碍不着别的行
    const inline = tables.every((table) =>
      [noteHeader(table), ...table.rows.map((row) => row.note)].every(
        (note) => note === '' || noteStart + (table.located ? locationWidth : 0) + displayWidth(note) <= USABLE,
      ),
    );
    const longestNote = Math.max(...tables.flatMap((table) => table.rows.map((row) => displayWidth(row.note))));
    const indent = Math.max(2, Math.min(noteStart, USABLE - longestNote));
    return tables.flatMap((table, index) => [
      // 小表之间空一行
      ...(index === 0 ? [] : ['']),
      dim(`${start(table, [table.title, t.agentColumn, t.actionColumn], t.locationColumn)}${inline ? noteHeader(table) : ''}`.trimEnd()),
      ...table.rows.flatMap((row) => {
        const line = start(table, row.cells, row.location);
        if (inline) return [`${line}${row.note}`.trimEnd()];
        return [line.trimEnd(), ...(row.note === '' ? [] : [`${' '.repeat(indent)}${row.note}`])];
      }),
    ]);
  };

  // 行首的符号转动；返回的函数把这一行擦掉
  const spin = (line: (mark: string) => string): (() => void) => {
    let frame = 0;
    const draw = (): void => {
      const mark = symbols.spinner[frame++ % symbols.spinner.length] ?? '';
      out.write(`${ERASE_LINE}${line(paint(focus, mark))}`);
    };
    draw();
    const timer = setInterval(draw, SPINNER_INTERVAL);
    return () => {
      clearInterval(timer);
      out.write(ERASE_LINE);
    };
  };

  // 列表下方的一行：缩进三格，标签后空两格，过长则折行。它与下面的按键提示之间空一行。
  // 连着几行时给 labelWidth，把各行的标签补到一样宽
  const belowList = (label: string, format: Format, text: string, labelWidth = displayWidth(label) + 2): string =>
    `${hanging('   ', paint(format, pad(label, labelWidth)), text).join('\n')}\n`;

  // 多选回答之后收成的那一行里的名字：勾得多时只列前几个。一行放不下时在这里折行，不交给终端去折——
  // 名字不拆开，续行缩进两格、与提问的左缘对齐；连第一个名字都放不下时整个从下一行起
  const pickedNames = (message: string, selected: readonly { short: string }[]): string => {
    const shown = selected.slice(0, NAMES_SHOWN).map((choice) => choice.short);
    const more = selected.length > NAMES_SHOWN ? t.pickedMore(shown.length, selected.length) : '';
    const comma = t.listSeparator.trimEnd();
    const gap = t.listSeparator.slice(comma.length);
    const lines: string[] = [];
    let line = '';
    let room = USABLE - displayWidth(`${symbols.done} ${message} ${symbols.separator} `);
    shown.forEach((name, at) => {
      const piece = `${name}${at === shown.length - 1 ? more : comma}`;
      const joined = line === '' ? piece : `${line}${gap}${piece}`;
      if (displayWidth(joined) <= room) {
        line = joined;
        return;
      }
      lines.push(line);
      line = piece;
      room = USABLE - 2;
    });
    return [...lines, line].join('\n  ');
  };

  const cursor = paint(focus, symbols.cursor);
  const theme: PromptTheme = {
    prefix: { idle: paint([focus, 'bold'], '?'), done: paint('green', symbols.done) },
    icon: {
      cursor,
      checked: paint(focus, symbols.checked),
      unchecked: symbols.unchecked,
      // 不可选的行整行由 style.disabled 压暗，勾选框自己不带样式；这种行勾不上，两个图标是同一个
      disabledChecked: symbols.unavailable,
      disabledUnchecked: symbols.unavailable,
    },
    style: {
      message: (text) => paint('bold', text),
      // 回答整个从下一行起时（见 pickedNames），分隔符后面不留空格
      answer: (text) => `${dim(symbols.separator)}${text.startsWith('\n') ? '' : ' '}${text}`,
      // 光标所在行整行加粗。行内片段的收尾码会把粗体一并关掉，所以每次收尾后重申一次
      highlight: (text) => paint('bold', text.replaceAll('\x1b[22m', '\x1b[22m\x1b[1m')),
      description: (text) => belowList(t.aboutColumn, 'dim', text),
      // 整行压暗，两处除外：原因是用户最需要读的字；光标停在这一行上时，光标要和别的行上一样显眼
      disabled: (text) => {
        const lead = text.startsWith(cursor) ? cursor : '';
        // 别的行上光标随整行加粗，这里单独给它加上
        return `${lead && paint('bold', lead)}${text
          .slice(lead.length)
          .split(REASON_MARK)
          .map((part, index) => (index % 2 === 1 || part === '' ? part : dim(part)))
          .join('')}`;
      },
      error: (text) => belowList(t.noticeKey, attention, text),
      // 一个都没勾就确认，等于返回
      renderSelectedChoices: (selected) => selected.map((choice) => choice.short).join(t.listSeparator) || t.back,
      keysHelpTip: (keys) =>
        `   ${keys
          .map(([key, action]) => `${t.keyWords[key] ?? (unicode ? key : (t.keyNames[key] ?? key))} ${dim(t.keys[action] ?? action)}`)
          .join(dim(` ${symbols.separator} `))}`,
      defaultAnswer: (text) => dim(`(${text})`),
      confirmDefault: (text) => text.toUpperCase(),
      maskedText: t.hiddenInput,
      help: dim,
    },
    i18n: { disabledError: t.unavailable },
    // 按键在任何语言下都是 y 和 n；回答之后显示的字由提问自己给
    keywords: { yes: 'y', no: 'n', error: () => t.answerYesOrNo },
  };

  // 状态一律用词表达，不显示颜色时文字一字不变。listed 是清单里的版本
  const versionChange = (status: { version: string }, listed: string): string =>
    `${status.version} ${symbols.arrow} ${listed}`;
  const statusCell = (status: SkillStatus, listed: string): string => {
    switch (status.kind) {
      case 'none':
        return dim(t.skillStatus.none);
      case 'installed':
        return `${paint('green', t.skillStatus.installed)} ${status.version}`;
      case 'other-version':
        return paint(attention, versionChange(status, listed));
      case 'unmanaged':
        return paint(attention, t.skillStatus.unmanaged);
    }
  };

  // 条目的一栏：只含一个 skill 的写未装、已装，含多个的装了几个就写「已装 几个/共几个」
  const thirdPartyCell = (status: ThirdPartyStatus): string => {
    if (status === 'unsupported') return dim(t.mcpStatus.unsupported);
    const installed = status.filter(Boolean).length;
    if (installed === 0) return dim(t.skillStatus.none);
    return `${paint('green', t.skillStatus.installed)}${status.length > 1 ? ` ${installed}/${status.length}` : ''}`;
  };

  const mcpStatusCell = (status: McpStatus): string => {
    switch (status) {
      case 'none':
        return dim(t.mcpStatus.none);
      case 'configured':
        return paint('green', t.mcpStatus.configured);
      case 'unknown':
        return t.mcpStatus.unknown;
      // 条目不支持这个宿主，或这个宿主的 MCP 装不到所选的安装范围：栏里是同一个词
      case 'unsupported':
      case 'global-only':
        return dim(t.mcpStatus.unsupported);
    }
  };

  // 所选的宿主一个都装不了这个 MCP 时它不可选：有哪个只是装不到所选的范围，原因就写只能装到全局——换成全局就装得了
  const mcpUnavailable = (statuses: readonly McpStatus[]): { unavailable?: string } => {
    if (!statuses.every((status) => status === 'unsupported' || status === 'global-only')) return {};
    return { unavailable: statuses.includes('global-only') ? t.mcpGlobalOnly : t.unsupportedByHosts };
  };

  // 条目一次全部列出；一屏放不下时才由交互库滚动。列表之外还要占的行不能把提问顶出屏幕：提问上下各一行空行、
  // 提问、列表下方的空行、两行说明、说明下方的空行、按键提示。表头算在列表里。below 是列表下方另外多占的行数
  const pageSize = (below: number): number => Math.max(7, (out.rows ?? 24) - 8 - below);

  // 留在屏幕上的提问（单选、多选、是否题）的主题。提问是交互库直接写到终端上的，不经过 print：做成提问就当它
  // 已经问出去、收成了一行。上面不是空行时，提问上方的那一行空行放在提问标记里——它只在还在问的时候占着，
  // 回答之后连同提问一起收掉，连着的几行已回答的提问之间才不空
  const asking = (): PromptTheme => {
    const blankAbove = spaced ? '' : '\n';
    spaced = false;
    return { ...theme, prefix: { ...theme.prefix, idle: `${blankAbove}${theme.prefix.idle}` } };
  };

  // 单选和多选共用的部分。提问与列表之间空一行：接在提问的末尾，不放进列表——列表滚动时它不跟着滚走，也不占
  // 列表的行。回答之后提问收成一行，它随之收掉。below 是列表下方除说明之外另外多占的行数
  const list = <Row>(rows: readonly Row[], below = 0) => {
    const asked = asking();
    const message: PromptTheme['style']['message'] = (text, status) =>
      `${asked.style.message(text, status)}${status === 'done' ? '' : '\n'}`;
    return { pageSize: pageSize(below), theme: { ...asked, style: { ...asked.style, message } }, rows };
  };

  // 逐项的结果行与最后的合计，各类组件共用：每一行由 lead 起头（它给结果符号排好位置），原因过长时自己折行。
  // 说了哪一种结果就记进合计
  const tally = () => {
    const totals = { succeeded: 0, failed: 0, skipped: 0 };
    const row = (total: keyof typeof totals, start: string, text: string): string[] => {
      totals[total]++;
      return hanging('', start, text);
    };
    return {
      succeeded: (lead: (mark: string) => string, text: string): string[] => row('succeeded', lead(paint('green', symbols.done)), text),
      failed: (lead: (mark: string) => string, reason: string): string[] =>
        row('failed', `${lead(paint('red', symbols.failed))}${paint(['red', 'bold'], t.failed)} `, reason),
      skipped: (lead: (mark: string) => string, reason: string): string[] => row('skipped', `${lead(dim(symbols.dash))}${t.skippedResult} `, reason),
      // 最后一行结果与收尾的通栏横线之间空一行
      total: (): string[] => ['', rule(), ...keyValue(t.totalKey, t.totals(totals).join(` ${symbols.separator} `))],
    };
  };

  // 一轮的执行，各类组件共用：targets 进「正在安装」分区，每一项进行中的那一行写的字（doing）和它的结果都由调用方
  // 说成文字；asides 是输出不归呈现层管的那些（工具）的名字，各占一个以名字为标题的分区，排在后面
  const progress = (targets: readonly { name: string; host: string }[], asides: readonly string[]) => {
    type Target = (typeof targets)[number];
    // verdict 是成功的那一行里先写的结果词（工具的「已可用」）：折行时续行与它后面的字对齐
    type Result = { ok: true; text: string; verdict?: string } | { ok: false; reason: string };
    const [nameWidth = 0] = columnWidths([...targets.map((target) => target.name), ...asides].map((name) => [name]));
    // 没有要装进宿主的行时没有宿主一栏
    const [hostWidth = 0] = columnWidths(targets.map((target) => [target.host]));
    const lead = (name: string, host = '') => (mark: string): string => `  ${mark}  ${pad(name, nameWidth)}${pad(host, hostWidth)}`;
    const results = tally();
    // 打出去的每一行结果：有 aside 时最后要原样再列一遍
    const settled: string[][] = [];
    const rowsOf = (row: (mark: string) => string, result: Result): string[] =>
      result.ok ? results.succeeded((mark) => `${row(mark)}${result.verdict ?? ''}`, result.text) : results.failed(row, result.reason);
    // 标题下面已经打出的行数，照终端上实际占的行数算：一个比一行还长的词（目录给的名字）折不开，会被终端折成几行。
    // 标题下方的那一行空行也在里面
    let lines = 1;
    const settle = (rows: string[]): void => {
      for (const row of rows) lines += Math.max(1, Math.ceil(displayWidth(row) / (out.columns ?? WIDTH)));
      settled.push(rows);
      print(...rows);
    };
    if (targets.length > 0) print(...heading(t.installing));
    return {
      begin(target: Target, doing: string): (result?: Result) => void {
        const erase = spin((mark) => `${lead(target.name, target.host)(mark)}${doing}${dim(symbols.ellipsis)}`);
        return (result) => {
          erase();
          if (result) settle(rowsOf(lead(target.name, target.host), result));
        };
      },
      // 原因里可以有目录给的名字，长度不由我们定：和失败的原因一样自己折行，行数才数得对
      skip(target: Target, reason: string): void {
        settle(results.skipped(lead(target.name, target.host), reason));
      },
      // 它自己的输出原样接在 intro 下面，不经过这里；交出结果时上方空一行。没有转动符号：行首重写会和它的输出撞车
      aside(name: string, intro: readonly string[]): (result: Result) => void {
        print(...heading(name), ...intro);
        return (result) => {
          const rows = rowsOf(lead(name), result);
          settled.push(rows);
          print('', ...rows);
        };
      },
      finish(): void {
        if (asides.length > 0) {
          // 前面的结果早被它们的输出顶出屏幕了：不止一行时集中再列一遍。标题不回头改写——不知道那些输出占了几行
          if (settled.length > 1) print(...heading(t.results), ...settled.flat());
        } else {
          // 标题还在屏幕上、且没有哪一行被终端折开时，回到标题那一行把它改写掉
          const up = lines + 1;
          if (up < (out.rows ?? 24) && (out.columns ?? WIDTH) >= WIDTH) {
            out.write(`\x1b[${up}A${ERASE_LINE}${section(t.results)}\x1b[${up}B\r`);
          }
        }
        print(...results.total());
      },
    };
  };

  return {
    line(text: string): void {
      print(text);
    },

    /** 启动时的标题区：OXY 大标志，下方隔一行是产品名和版本号，都按 80 列居中（不看终端的实际宽度），四周留白。 */
    logo(version: string): void {
      // 整块按最宽的一行居中，各行补同样多的空格，字形才不走样
      const centered = (text: string, width = displayWidth(text)): string => `${' '.repeat(Math.floor((WIDTH - width) / 2))}${text}`;
      const artWidth = Math.max(...symbols.logo.map(displayWidth));
      // 渐变是 styleText 给不了的 24 位色，样式码在这里自己拼：每个方块一个前景色，同一列同色
      const gradient = (row: string): string =>
        `${[...row].map((block, column) => (block === ' ' ? block : `${logoColor(column / (artWidth - 1))}${block}`)).join('')}\x1b[39m`;
      const truecolor = env['COLORTERM'] === 'truecolor' || env['COLORTERM'] === '24bit';
      // 终端没有声明支持 24 位色时退成焦点符号的那个洋红
      const colored = (row: string): string => (styled && truecolor ? gradient(row) : paint(focus, row));
      const art = symbols.logo.map((row) => centered(unicode ? colored(row) : paint('bold', row), artWidth));
      const name = centered(`${paint('bold', 'oxy-tools')} ${dim(version)}`);
      print('', ...art, '', name, '');
    },

    /** 启动时的语言提问：光标起始停在这个呈现层自己的语言上——没给 --lang 时它是按系统语言建的。 */
    languageQuestion(): SelectQuestion<Lang> {
      return {
        message: LANGUAGE_QUESTION,
        default: lang,
        ...list(LANGUAGES.map(({ lang: value, label }) => ({ value, short: label, name: label }))),
      };
    },

    /** 读取目录、查询文件列表时的进行中提示，行首的符号转动；done() 把这一行擦掉。 */
    loading(what: keyof typeof t.loading): { done(): void } {
      // 这一行擦掉之后，接着打的那一块就落在它的位置上：上方的空行在这里先给
      gap();
      return { done: spin((mark) => `  ${mark} ${t.loading[what]}${dim(symbols.ellipsis)}`) };
    },

    /** 本机信息：宿主在不在、目录里各类条目的数量，有要提醒的事各多一行。 */
    catalogSummary({
      hosts,
      skills,
      mcps,
      tools,
      apps,
      skipped,
    }: {
      hosts: readonly Host[];
      skills: number;
      mcps: number;
      tools: number;
      apps: number;
      skipped: number;
    }): void {
      const presence = (host: Host): string =>
        `${host.name} ${host.detected ? paint('green', symbols.done) : `${dim(symbols.dash)} ${t.notDetected}`}`;
      const names = (detected: boolean): string[] =>
        hosts.filter((host) => host.detected === detected).map((host) => host.name);
      const missing = names(false);
      const present = names(true);
      print(
        ...gapAbove(),
        ...keyValue(t.agentKey, hosts.map(presence).join('   ')),
        ...keyValue(t.catalogKey, t.counts({ skills, mcps, tools, apps }).join(` ${symbols.separator} `) || t.noEntries),
        ...(present.length === 0 ? keyValue(t.noticeKey, t.noHosts(missing, apps > 0), attention) : []),
        ...(present.length > 0 && missing.length > 0
          ? keyValue(t.noticeKey, t.hostsSkipped(missing.join(t.listSeparator), present.join(t.listSeparator)), attention)
          : []),
        ...(skipped > 0 ? keyValue(t.noticeKey, t.skipped(skipped), attention) : []),
        rule(),
        '',
      );
    },

    failure(failure: Failure): void {
      const { title, cause, location, next } = t.failure(failure, platform);
      errors.print(
        ...errors.heading(`${t.errorPrefix}${title}`, ['red', 'bold']),
        ...errors.keyValue(t.causeKey, cause),
        // 网址和路径不截断也不折行，独占一行
        ...(location === undefined ? [] : [`  ${' '.repeat(KEY_WIDTH)}${location}`]),
        ...next.flatMap((step, index) => errors.keyValue(index === 0 ? t.nextKey : '', step)),
      );
    },

    help(version: string): void {
      print(
        `${paint('bold', 'oxy-tools')} ${dim(version)}`,
        '',
        section(t.help.usage),
        '',
        `  ${t.help.usageLine}`,
        '',
        section(t.help.options),
        '',
        ...twoColumns(t.help.optionRows),
        '',
        section(t.help.environment),
        '',
        ...twoColumns(t.help.environmentRows),
      );
    },

    /** 退回去再问一轮（回主菜单、返回修改）：新一轮提问与上一轮已回答的几行之间空一行。 */
    nextRound(): void {
      gap();
    },

    /**
     * 第一行是「推荐」，里面一个条目都没有时不出现；各个用途跟在后面，顺序照传进来的。两栏：名称、数量（进去之后
     * 列表里的行数，右对齐）。
     */
    mainMenu(recommended: number, purposes: readonly { purpose: Purpose; count: number }[]): SelectQuestion<MenuChoice> {
      const rows: { value: Exclude<MenuChoice, 'exit'>; label: string; count: string }[] = [
        ...(recommended > 0 ? [{ value: 'recommended' as const, label: t.recommended, count: String(recommended) }] : []),
        ...purposes.map(({ purpose, count }) => ({ value: purpose, label: purpose.name[lang], count: String(count) })),
      ];
      const labelWidth = Math.max(displayWidth(t.purposeColumn), ...rows.map((row) => displayWidth(row.label))) + GUTTER;
      const countWidth = Math.max(displayWidth(t.countColumn), ...rows.map((row) => row.count.length));
      const line = (label: string, count: string): string => `${pad(label, labelWidth)}${pad(count, countWidth, 'right')}`;
      return {
        message: t.pickPurpose,
        ...list([
          ...(rows.length > 0
            ? [
                // 表头比条目多缩进一格：交互库在分隔行前只放一个空格，条目前是两格
                { separator: dim(` ${line(t.purposeColumn, t.countColumn)}`) },
                ...rows.map((row) => ({ value: row.value, short: row.label, name: line(row.label, row.count) })),
                { separator: ' ' },
              ]
            : []),
          { value: 'exit' as const, short: t.exit, name: t.exit },
        ]),
      };
    },

    /**
     * 进入「推荐」或一个用途之后的那张列表（混合列表）：条目按类型分段，段首一行标题。组件在上（skill、第三方
     * Skill、MCP、工具），前三样每个所选的宿主一栏状态（statuses 与 hosts 一一对应）；工具只有一个状态，与宿主无关，
     * 写在第一栏的位置；外部项目在下，没有状态。hosts 是空的时状态只有一栏，前三样都不可选：一个宿主都没检测到，或
     * 列表里根本没有它们。所选的宿主一个都不支持的第三方 Skill 和 MCP、装不了的工具同样不可选；原因都写在状态的位置。
     * checked 是提问出现时已经勾上的那些。marksRecommended 表示把带推荐的行标出来——「推荐」那张列表里每一行都是，
     * 不标。列表下方是光标所在行的类型和说明全文。一个都不勾就确认表示返回。
     */
    mixedPicker({
      hosts,
      skills,
      thirdParty,
      mcps,
      tools,
      apps,
      checked,
      marksRecommended,
    }: {
      hosts: readonly Host[];
      skills: readonly { skill: Skill; statuses: readonly SkillStatus[] }[];
      thirdParty: readonly { entry: ThirdPartySkill; statuses: readonly ThirdPartyStatus[] }[];
      mcps: readonly { mcp: Mcp; statuses: readonly McpStatus[] }[];
      tools: readonly { tool: Tool; status: ToolStatus; unavailable?: ToolUnavailable }[];
      apps: readonly App[];
      checked: readonly (Skill | ThirdPartySkill | Mcp | Tool | App)[];
      marksRecommended: boolean;
    }): CheckboxQuestion<Skill | ThirdPartySkill | Mcp | Tool | App> {
      // 多选的每一行前面是光标、勾选框和一个空格；分隔行前面只有一格，所以表头和段标题要多缩进
      const lead = displayWidth(symbols.checked) + 2;
      const indent = ' '.repeat(lead - 1);
      const hostless = hosts.length === 0;
      const toolReason = (unavailable: ToolUnavailable): string =>
        unavailable.kind === 'no-host' ? t.needsHost : unavailable.kind === 'os' ? t.unsupportedOs(unavailable.os) : t.unsupportedByHosts;
      // 组件各段的行：cells 是各栏状态，比状态栏少时后面空着；unavailable 是这一行不可选的原因，写在状态的位置、
      // 占满各个状态栏，这时不看 cells
      const sections: {
        title: string;
        note?: string;
        kind: string;
        rows: { value: Skill | ThirdPartySkill | Mcp | Tool; name: string; about: string; recommended: boolean; cells: string[]; unavailable?: string }[];
      }[] = [
        {
          ...t.sections.skill,
          kind: t.kinds.skill,
          // 本仓库的 skill 都是推荐的
          rows: skills.map(({ skill, statuses }) => ({
            value: skill,
            name: skill.name,
            about: skill.description[lang],
            recommended: true,
            cells: statuses.map((status) => statusCell(status, skill.version)),
            ...(hostless ? { unavailable: t.needsHost } : {}),
          })),
        },
        {
          ...t.sections.thirdParty,
          kind: t.kinds.thirdParty,
          rows: thirdParty.map(({ entry, statuses }) => ({
            value: entry,
            name: entry.name,
            about: entry.description[lang],
            recommended: entry.recommended,
            cells: statuses.map(thirdPartyCell),
            ...(hostless ? { unavailable: t.needsHost } : statuses.every((status) => status === 'unsupported') ? { unavailable: t.unsupportedByHosts } : {}),
          })),
        },
        {
          ...t.sections.mcp,
          kind: t.kinds.mcp,
          rows: mcps.map(({ mcp, statuses }) => ({
            value: mcp,
            name: mcp.name,
            about: mcp.description[lang],
            recommended: mcp.recommended,
            cells: statuses.map(mcpStatusCell),
            ...(hostless ? { unavailable: t.needsHost } : mcpUnavailable(statuses)),
          })),
        },
        {
          ...t.sections.tool,
          kind: t.kinds.tool,
          rows: tools.map(({ tool, status, unavailable }) => ({
            value: tool,
            name: tool.name,
            about: tool.description[lang],
            recommended: tool.recommended,
            cells: [status === 'installed' ? paint('green', t.toolStatus.installed) : dim(t.toolStatus.none)],
            ...(unavailable ? { unavailable: toolReason(unavailable) } : {}),
          })),
        },
      ].filter((section) => section.rows.length > 0);
      const components = sections.flatMap((section) => section.rows);
      // 一个组件都没有时没有状态栏
      const columns = components.length === 0 ? [] : hostless ? [t.statusColumn] : hosts.map((host) => host.name);
      const nameWidth = Math.max(displayWidth(t.nameColumn), ...[...components, ...apps].map((entry) => displayWidth(entry.name))) + GUTTER;
      const cellWidths = columns.map(
        (column, at) =>
          Math.max(displayWidth(column), ...components.map((row) => (row.unavailable === undefined ? displayWidth(row.cells[at] ?? '') : 0))) + GUTTER,
      );
      // 原因比各栏状态合起来还宽时，把最后一栏撑到放得下它
      const reasonWidth = Math.max(0, ...components.map((row) => displayWidth(row.unavailable ?? ''))) + GUTTER;
      const short = Math.max(0, reasonWidth - cellWidths.reduce((sum, width) => sum + width, 0));
      const statusWidths = cellWidths.map((width, at) => (at === cellWidths.length - 1 ? width + short : width));
      const statusWidth = statusWidths.reduce((sum, width) => sum + width, 0);
      // 外部项目没有状态，说明从第一栏状态的位置写起
      const wideAbout = USABLE - lead - nameWidth;
      const aboutWidth = wideAbout - statusWidth;
      const showsAbout = components.length === 0 || aboutWidth >= MIN_ABOUT;
      const labelWidth = Math.max(displayWidth(t.typeLabel), displayWidth(t.aboutColumn)) + 2;
      // 说明的那一格：带推荐的最前面是标记，标记从不截断，截断的只是它后面的说明
      const about = (text: string, width: number, recommended: boolean): string => {
        const mark = marksRecommended && recommended ? `${t.recommendedMark} ${symbols.separator} ` : '';
        const room = width - displayWidth(mark);
        return room > 0 ? `${mark}${truncate(text, room, symbols.ellipsis)}` : '';
      };
      // 交互库只把这一段文字交给主题：第一行是类型（带推荐的后面跟着标记），其余是说明全文，由下面的 description 拆开
      const below = (kind: string, recommended: boolean, text: string): string =>
        `${kind}${marksRecommended && recommended ? `${dim(` ${symbols.separator} `)}${t.recommended}` : ''}\n${text}`;
      // 不可选的行下方的那段文字，按交互库拼出来的「名称 + 一个空格 + 原因」来找
      const belowUnavailable = new Map<string, string>();
      const title = (section: { title: string; note?: string }) => ({
        separator: `${indent}${dim(symbols.rule.repeat(2))} ${section.title}${section.note === undefined ? '' : ` ${symbols.separator} ${section.note}`}`,
      });
      const rows = [
        { separator: dim(`${indent}${pad(t.nameColumn, nameWidth)}${columns.map((column, at) => pad(column, statusWidths[at] ?? 0)).join('')}${showsAbout ? t.aboutColumn : ''}`.trimEnd()) },
        ...sections.flatMap((section) => [
          title(section),
          ...section.rows.map((row) => {
            const text = showsAbout ? about(row.about, aboutWidth, row.recommended) : '';
            const choice = { value: row.value, short: row.name, description: below(section.kind, row.recommended, row.about), checked: checked.includes(row.value) };
            // 交互库把不可选的行拼成「名称 + 一个空格 + 原因」：名称少补一格。整行压暗，原因自己不带样式
            if (row.unavailable !== undefined) {
              const name = pad(row.name, nameWidth - 1);
              const disabled = `${pad(`${REASON_MARK}${row.unavailable}${REASON_MARK}`, statusWidth)}${text}`.trimEnd();
              belowUnavailable.set(`${name} ${disabled}`, choice.description);
              return { ...choice, name, disabled };
            }
            const cells = pad(row.cells.map((cell, at) => pad(cell, statusWidths[at] ?? 0)).join(''), statusWidth);
            return { ...choice, name: `${pad(row.name, nameWidth)}${cells}${text}`.trimEnd() };
          }),
        ]),
        // 外部项目一段与上面的组件之间空一行
        ...(components.length > 0 && apps.length > 0 ? [{ separator: ' ' }] : []),
        ...(apps.length > 0 ? [title(t.sections.app)] : []),
        ...apps.map((app) => ({
          value: app,
          short: app.name,
          name: `${pad(app.name, nameWidth)}${about(app.description[lang], wideAbout, app.recommended)}`.trimEnd(),
          description: below(t.kinds.app, app.recommended, app.description[lang]),
          checked: checked.includes(app),
        })),
      ];
      // 列表下方比别的列表多一行「类型」
      const question = list(rows, 1);
      const description = (text: string): string => {
        const [kind = '', ...about] = text.split('\n');
        return `${belowList(t.typeLabel, 'dim', kind, labelWidth)}${belowList(t.aboutColumn, 'dim', about.join('\n'), labelWidth)}`;
      };
      // 交互库不把不可选的行的说明交给主题。它每画一遍依次调提问、各行、按键提示的样式：光标停在不可选的行上时
      // 在画那一行的时候记下它，把类型和说明接在按键提示的前面，落在别的行的说明所在的位置
      let underCursor: string | undefined;
      return {
        message: t.pickEntries,
        ...question,
        theme: {
          ...question.theme,
          style: {
            ...question.theme.style,
            description,
            message: (text, status) => {
              underCursor = undefined;
              return question.theme.style.message(text, status);
            },
            disabled: (text) => {
              if (text.startsWith(cursor)) underCursor = belowUnavailable.get(text.slice(cursor.length + symbols.unavailable.length + 1));
              return question.theme.style.disabled(text);
            },
            // 「这一项现在选不了」排在类型和说明的前面：后面跟着它们时不再另空一行
            error: (text) => {
              const notice = question.theme.style.error(text);
              return underCursor === undefined ? notice : notice.replace(/\n$/, '');
            },
            keysHelpTip: (keys) => `${underCursor === undefined ? '' : `${description(underCursor)}\n`}${question.theme.style.keysHelpTip(keys)}`,
            renderSelectedChoices: (selected) => (selected.length === 0 ? theme.style.renderSelectedChoices(selected) : pickedNames(t.pickEntries, selected)),
          },
        },
      };
    },

    /**
     * 含多个 skill 的第三方 Skill 的清单：混合列表确认之后，问要其中哪几个。栏和混合列表一样（名称、每个所选的宿主
     * 一栏状态、说明），没有分段；每个 skill 各写各的状态（statuses 是条目在各个宿主下的状态，与 hosts 一一对应）。
     * checked 是提问出现时已经勾上的那些。一个都不勾就确认表示这一条不装。
     */
    thirdPartyPicker({
      entry,
      hosts,
      statuses,
      checked,
    }: {
      entry: ThirdPartySkill;
      hosts: readonly Host[];
      statuses: readonly ThirdPartyStatus[];
      checked: readonly SourcedSkill[];
    }): CheckboxQuestion<SourcedSkill> {
      const lead = displayWidth(symbols.checked) + 2;
      const rows = entry.skills.map((skill, index) => ({
        skill,
        cells: statuses.map((status) => thirdPartyCell(status === 'unsupported' ? status : [status[index] === true])),
      }));
      const nameWidth = Math.max(displayWidth(t.nameColumn), ...rows.map((row) => displayWidth(row.skill.name))) + GUTTER;
      const statusWidths = hosts.map((host, at) => Math.max(displayWidth(host.name), ...rows.map((row) => displayWidth(row.cells[at] ?? ''))) + GUTTER);
      const aboutWidth = USABLE - lead - nameWidth - statusWidths.reduce((sum, width) => sum + width, 0);
      const showsAbout = aboutWidth >= MIN_ABOUT;
      const line = (name: string, cells: readonly string[], about: string): string =>
        `${pad(name, nameWidth)}${cells.map((cell, at) => pad(cell, statusWidths[at] ?? 0)).join('')}${showsAbout ? about : ''}`.trimEnd();
      const question = list([
        // 表头比条目少一格，理由同混合列表
        { separator: dim(`${' '.repeat(lead - 1)}${line(t.nameColumn, hosts.map((host) => host.name), t.aboutColumn)}`) },
        ...rows.map(({ skill, cells }) => ({
          value: skill,
          short: skill.name,
          name: line(skill.name, cells, truncate(skill.description[lang], aboutWidth, symbols.ellipsis)),
          description: skill.description[lang],
          checked: checked.includes(skill),
        })),
      ]);
      const message = t.pickSourcedSkills(entry.name, entry.skills.length);
      return {
        message,
        ...question,
        theme: {
          ...question.theme,
          style: {
            ...question.theme.style,
            // 这里一个都不勾不是返回，是不装这一条：按键提示和收成的那一行都照这个意思写
            keysHelpTip: (keys) => question.theme.style.keysHelpTip(keys.map(([key, action]) => [key, action === 'submit' ? 'submitOrSkip' : action])),
            renderSelectedChoices: (selected) => (selected.length === 0 ? t.notInstalling : pickedNames(message, selected)),
          },
        },
      };
    },

    /** 勾选的外部项目各一段：名字、说明全文、官方链接。只列出来，不替用户打开。 */
    externalProjects(apps: readonly App[]): void {
      print(
        ...heading(t.externalProjects(apps.length)),
        ...apps.flatMap((app, index) => [
          ...(index === 0 ? [] : ['']),
          `  ${paint('bold', app.name)}`,
          ...keyValue(t.aboutColumn, app.description[lang]),
          // 链接再长也整条写在一行上，不交给折行：折开了就没法照着复制
          `  ${dim(pad(t.linkKey, KEY_WIDTH))}${paint('underline', app.url)}`,
        ]),
      );
    },

    /** 勾选装进哪些宿主；checked 是提问出现时已经勾上的那些。 */
    hostPicker(hosts: readonly Host[], checked: readonly Host[]): CheckboxQuestion<Host> {
      return {
        message: t.pickHosts,
        ...list(hosts.map((host) => ({ value: host, short: host.name, name: host.name, checked: checked.includes(host) }))),
      };
    },

    /**
     * 装到全局还是项目：两项各带一句说明，光标起始在全局。directory 是当前目录（给用户看的写法），暗淡地接在「项目」
     * 的说明后面，只是告知；一行放不下时从前面截，留住末尾的几级。
     */
    scopePicker(directory: string): SelectQuestion<Scope> {
      const nameWidth = Math.max(displayWidth(t.scopes.global.name), displayWidth(t.scopes.project.name)) + GUTTER;
      // 单选的每一行前面是光标和一个空格
      const room = USABLE - 2 - nameWidth - displayWidth(t.scopes.project.about);
      let shown = directory;
      for (const rest = [...directory]; displayWidth(shown) > room && rest.length > 0; shown = `${symbols.ellipsis}${rest.join('')}`) rest.shift();
      const row = (value: Scope, about: string) => ({ value, short: t.scopes[value].name, name: `${pad(t.scopes[value].name, nameWidth)}${about}` });
      return {
        message: t.pickScope,
        default: 'global',
        ...list([row('global', t.scopes.global.about), row('project', `${t.scopes.project.about}${dim(shown)}`)]),
      };
    },

    /**
     * 混合列表上方关于 MCP 那几栏的说明，各占一行，两行挨着：globalOnly 是选了项目范围而 MCP 只能装到全局的宿主，
     * 它们那一栏写着不支持，这里说原因；unreadable 是配置读不到的宿主，它们那一栏都是未知。都没有时什么都不打。
     */
    mcpColumnNotices({ globalOnly, unreadable }: { globalOnly: readonly Host[]; unreadable: readonly Host[] }): void {
      const names = (hosts: readonly Host[]): string => hosts.map((host) => host.name).join(t.listSeparator);
      const notices = [
        ...(globalOnly.length > 0 ? [t.mcpGlobalOnlyNotice(names(globalOnly))] : []),
        ...(unreadable.length > 0 ? [t.mcpConfigUnreadable(names(unreadable))] : []),
      ];
      if (notices.length > 0) print(...gapAbove(), ...notices.flatMap((notice) => keyValue(t.noticeKey, notice, attention)), '');
    },

    /**
     * 汇总：一个分区，里面按类型分成小表，顺序与执行的先后一致。每一项将装进哪个宿主、是新装还是覆盖，skill 和
     * 第三方 Skill 另写装到哪里。同一个条目装进几个宿主就有几行，名字只写在第一行。第三方 Skill 的一行是要装的一个
     * skill，不是条目。MCP 的状态未知时说不出是新装还是覆盖，只写添加，备注里说明会先尝试移除。工具不装进宿主，
     * 它的小表只有条目和操作两栏。
     */
    installSummary({
      skills,
      thirdParty,
      mcps,
      tools,
    }: {
      skills: readonly InstallTarget[];
      thirdParty: readonly ThirdPartyTarget[];
      mcps: readonly McpTarget[];
      tools: readonly ToolTarget[];
    }): void {
      const skillNote = ({ status, version }: InstallTarget): string => {
        switch (status.kind) {
          case 'none':
            return '';
          case 'installed':
            return t.reinstallNote(status.version);
          case 'other-version':
            return versionChange(status, version);
          case 'unmanaged':
            return t.unmanagedNote;
        }
      };
      const mcpAction = { none: t.actions.fresh, configured: paint(attention, t.actions.overwrite), unknown: t.actions.unknown };
      const mcpNote = { none: '', configured: t.mcpConfiguredNote, unknown: t.mcpUnknownNote };
      const once = (targets: readonly { name: string }[], index: number): string =>
        targets[index]?.name === targets[index - 1]?.name ? '' : (targets[index]?.name ?? '');
      const tables = [
        {
          title: t.sections.skill.title,
          located: true,
          rows: skills.map((target, index) => ({
            cells: [once(skills, index), target.host, target.status.kind === 'none' ? t.actions.fresh : paint(attention, t.actions.overwrite)] as const,
            location: target.location,
            note: skillNote(target),
          })),
        },
        {
          title: t.sections.thirdParty.title,
          located: true,
          rows: thirdParty.map((target, index) => ({
            cells: [once(thirdParty, index), target.host, target.exists ? paint(attention, t.actions.overwrite) : t.actions.fresh] as const,
            location: target.location,
            note: target.exists ? t.existingNote : '',
          })),
        },
        {
          title: t.sections.mcp.title,
          located: false,
          rows: mcps.map((target, index) => ({
            cells: [once(mcps, index), target.host, mcpAction[target.status]] as const,
            location: '',
            note: mcpNote[target.status],
          })),
        },
        {
          title: t.sections.tool.title,
          located: false,
          actionOnly: true,
          rows: tools.map((target) => ({ cells: [target.name, '', t.toolAction] as const, location: '', note: '' })),
        },
      ].filter((table) => table.rows.length > 0);
      // 名字只在各自的类型里唯一：一个 skill 和一个 MCP 同名时是两项。第三方 Skill 数的是条目，不是其中的 skill
      const count =
        new Set(skills.map((target) => target.name)).size +
        new Set(thirdParty.map((target) => target.entry)).size +
        new Set(mcps.map((target) => target.name)).size +
        tools.length;
      print(...heading(t.installSummary(count)), ...summaryTables(tables), '');
    },

    /** 汇总之后的那一问：开始安装、返回修改、取消。 */
    confirmInstall(): SelectQuestion<InstallDecision> {
      const choice = (value: InstallDecision, label: string) => ({ value, short: label, name: label });
      return { message: t.confirmInstall, ...list([choice('install', t.startInstall), choice('revise', t.revise), choice('cancel', t.cancel)]) };
    },

    /** 不是本工具装的目录，覆盖前单独问一次，缺省不覆盖。 */
    confirmOverwrite(target: InstallTarget): ConfirmQuestion {
      return { message: t.confirmOverwrite(target.location), default: false, answers: { yes: t.yes, no: t.no }, theme: asking() };
    },

    /** 第三方 Skill 的目标位置已有同名目录，覆盖前单独问一次，缺省不覆盖。 */
    confirmReplaceExisting(target: ThirdPartyTarget): ConfirmQuestion {
      return { message: t.confirmReplaceExisting(target.location), default: false, answers: { yes: t.yes, no: t.no }, theme: asking() };
    },

    /**
     * 一轮的执行。本仓库的 skill、第三方 Skill 和 MCP 共用「正在安装」分区，行照传进来的先后排：每一项先 begin，
     * 进行中的那一行行首的符号转动；用它返回的函数交出结果，这一行就改写成结果（不给结果则只擦掉这一行）。不装的
     * 那些不 begin，改用 skip：skill 和第三方 Skill 是用户没同意覆盖，MCP 是必填的 key 没填（给出没填的变量名）。
     * 第三方 Skill 的安装程序自己的输出不上屏，画面上只有这一行。工具排在最后：每个 begin 一次，
     * 打出以它名字为标题的分区和要执行的那一行，命令自己的输出随后原样接在下面，不经过这里；用返回的函数交出结论。
     * 全部结束后 finish 打出合计：没有工具时把「正在安装」的标题换成「结果」；有工具时标题不动，结果不止一行就先用
     * 一个「结果」分区把每一行再列一遍——前面的早被命令的输出顶出屏幕了。
     */
    installation(skills: readonly InstallTarget[], thirdParty: readonly ThirdPartyTarget[], mcps: readonly McpTarget[], tools: readonly ToolTarget[]) {
      const rows = progress([...skills, ...thirdParty, ...mcps], tools.map((target) => target.name));
      return {
        skill: {
          begin(target: InstallTarget): (outcome?: InstallOutcome) => void {
            const settle = rows.begin(target, t.downloading);
            return (outcome) =>
              settle(
                outcome &&
                  (outcome.ok
                    ? {
                        ok: true,
                        text: `${paint('green', t.installed)} ${
                          target.status.kind === 'other-version' ? versionChange(target.status, outcome.version) : outcome.version
                        }`,
                      }
                    : { ok: false, reason: t.installProblem(outcome.problem) }),
              );
          },
          skip: (target: InstallTarget): void => rows.skip(target, t.overwriteDeclined),
        },
        thirdParty: {
          begin(target: ThirdPartyTarget): (result: ThirdPartyResult) => void {
            const settle = rows.begin(target, t.installingOne);
            return (result) => {
              const text = t.thirdPartyResult(result);
              const installed = paint('green', t.installed);
              // 装上了而命令没有正常结束（覆盖已有的目录时）：结果词后面接着说命令的结局
              settle(result.installed ? (text === '' ? { ok: true, text: installed } : { ok: true, verdict: installed, text }) : { ok: false, reason: text });
            };
          },
          skip: (target: ThirdPartyTarget): void => rows.skip(target, t.overwriteDeclined),
        },
        mcp: {
          begin(target: McpTarget): (outcome?: McpOutcome) => void {
            const settle = rows.begin(target, t.configuring);
            return (outcome) =>
              settle(
                outcome &&
                  (outcome.ok
                    ? { ok: true, text: paint('green', t.mcpStatus.configured) }
                    : { ok: false, reason: t.mcpInstallProblem(outcome.problem) }),
              );
          },
          skip: (target: McpTarget, missingVariable: string): void => rows.skip(target, t.keyMissing(missingVariable)),
        },
        tool: {
          begin(target: ToolTarget): (result: ToolResult) => void {
            const settle = rows.aside(target.name, hanging('  ', `${dim('$')} `, target.command));
            return (result) => {
              const text = t.toolResult(result, target.evidence);
              settle(result.available ? { ok: true, verdict: paint('green', t.toolAvailable), text } : { ok: false, reason: text });
            };
          },
        },
        finish: rows.finish,
      };
    },

    /**
     * 将要执行的完整命令，逐条编号；过长时折行，续行与命令的左缘对齐。命令本身从不截断。
     * 字符串是一整行 shell（工具的安装命令）：原样写出，不加引号。
     */
    commandList(commands: readonly (Command | string)[]): void {
      const indexWidth = Math.max(2, String(commands.length).length);
      print(
        ...heading(t.commandsToRun(commands.length)),
        ...commands.flatMap((command, index) =>
          hanging(
            '  ',
            `${dim(pad(String(index + 1), indexWidth, 'right'))}  `,
            typeof command === 'string' ? command : commandLine(command, (text) => paint(attention, text)),
          ),
        ),
        '',
      );
    },

    /**
     * 汇总最后要提醒的事，各占一行，几行挨着：有覆盖项时本地改动会丢失；这一轮有第三方 Skill 时装的是作者当时的
     * 最新版；命令里 key 的位置是占位符；装到项目的 MCP 带着的 key 会以明文写进项目里的哪些文件（plaintextKeys 只有
     * 变量名和文件名，variables 是空的就不写）；装到项目的 MCP 写进了哪个文件、要用户在宿主里批准之后才启用
     * （command 是启动宿主的命令）；必填的 key 没填、
     * 不在这次要装的里面的 MCP；添加远程地址的 MCP 时可能当场打开浏览器登录的宿主（它的输出不会显示在这里，login 是
     * 事后补登录的命令）。一件都没有时什么都不打。
     */
    summaryNotices({
      overwrites,
      thirdParty,
      placeholders,
      plaintextKeys,
      approvals,
      missingKeys,
      logins,
    }: {
      overwrites: boolean;
      thirdParty: boolean;
      placeholders: boolean;
      plaintextKeys: { variables: readonly string[]; files: readonly string[] };
      approvals: readonly { host: string; file: string; command: string }[];
      missingKeys: readonly { mcp: string; variable: string }[];
      logins: readonly { host: string; login: Command }[];
    }): void {
      const notices = [
        ...(overwrites ? [t.replaceNotice] : []),
        ...(thirdParty ? [t.thirdPartyNotice] : []),
        ...(placeholders ? [t.keyPlaceholderNotice] : []),
        ...(plaintextKeys.variables.length > 0
          ? [t.keyPlaintextNotice(plaintextKeys.variables.join(t.listSeparator), plaintextKeys.files.join(t.listSeparator))]
          : []),
        ...approvals.map(({ host, file, command }) => t.mcpApprovalNotice(host, file, command)),
        ...missingKeys.map(({ mcp, variable }) => t.keyMissingNotice(mcp, variable)),
        ...logins.map(({ host, login }) => t.mcpLoginNotice(host, commandLine(login))),
      ];
      if (notices.length > 0) print(...notices.flatMap((notice) => keyValue(t.noticeKey, notice, attention)), '');
    },

    /** 问一个 key 之前：哪个 MCP 要它、它是什么、去哪申请、留空会怎样。 */
    keyRequest(mcp: Mcp, variable: McpVariable): void {
      print(
        ...heading(t.keyRequest(mcp.name, variable.required)),
        ...keyValue(t.variableKey, `${variable.name}${t.keyNeed(variable.required)}`),
        ...keyValue(t.aboutColumn, variable.description[lang]),
        // 申请地址和外部项目的链接一样整条写在一行上：折开了就没法照着复制
        `  ${dim(pad(t.applyKey, KEY_WIDTH))}${paint('underline', variable.url)}`,
        ...keyValue(t.tipKey, t.keyInputHint(mcp.name, variable.required)),
        '',
      );
    },

    /** 隐藏输入：提问是变量名，后面一句固定的提示；输入的东西不显示。 */
    keyQuestion(variable: McpVariable): PasswordQuestion {
      return { message: variable.name, theme };
    },

    /** 提问擦掉之后留下的一行：和已回答的提问同一个画法，填了的不写值也不写长度。 */
    keyOutcome(mcp: Mcp, variable: McpVariable, outcome: KeyOutcome): void {
      const mark = outcome === 'blank' ? dim(symbols.dash) : paint('green', symbols.done);
      print(...hanging('', `${mark} ${paint('bold', variable.name)} ${dim(symbols.separator)} `, t.keyOutcome(outcome, mcp.name, variable.required)));
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
