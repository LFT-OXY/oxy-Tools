// 呈现层：所有终端输出都从这里出去，配色、符号、间距、横线和标题区由它统一决定（视觉方向「账本」）。
// 其余模块只说“显示什么”。
import { styleText } from 'node:util';
import type { App, Mcp, McpVariable, Skill, Tool, ToolOs } from './catalog.ts';
import type { Command, Host } from './hosts.ts';
import type { McpInstallProblem } from './install-mcp.ts';
import type { SkillInstallProblem } from './install-skill.ts';
import type { ToolResult } from './install-tool.ts';
import type { McpStatus } from './mcp-status.ts';
import { MESSAGES, type Failure, type KeyOutcome, type Lang, type ToolEvidence } from './messages.ts';
import type { CheckboxQuestion, ConfirmQuestion, PasswordQuestion, PromptTheme, SelectQuestion } from './prompter.ts';
import type { SkillStatus } from './skill-status.ts';
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
// 转动符号的节奏照搬交互库的默认值
const SPINNER_INTERVAL = 80;
const ERASE_LINE = '\r\x1b[2K';
// 零宽空格：圈出不可选的行里的原因。整行压暗时跳过圈着的这一段，圈本身不打出去
const REASON_MARK = '\u200b';

export type GroupId = 'skill' | 'mcp' | 'tool' | 'app';
export type MenuChoice = GroupId | 'exit';
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

/** 一项 MCP 安装：哪个条目、装进哪个宿主、它在那里现在的状态 */
export interface McpTarget {
  name: string;
  host: string;
  status: Exclude<McpStatus, 'unsupported'>;
}

export type McpOutcome = { ok: true } | { ok: false; problem: McpInstallProblem };

/** 工具不可选的原因：条目把当前系统标为不支持，或它要的宿主一个都没检测到 */
export type ToolUnavailable = { kind: 'os'; os: ToolOs } | { kind: 'hosts' };

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

export function createUi({ out, err, lang, env, platform }: UiOptions) {
  const t = MESSAGES[lang];
  const unicode = supportsUnicode(env, platform);
  const symbols = unicode ? UNICODE : ASCII;
  const attention: Format = ['yellow', 'bold'];
  // 当前焦点：提问标记、光标、已勾选的框、转动符号。和大标志退成的洋红是同一个颜色
  const focus = 'magenta';

  // 接下来的分区标题上方是否已经有留白：画面还是空的，或刚打出的标题区自己以空行收尾。两个输出流合起来算
  let spaced = true;
  // 分区标题上方空一行，上面已经有留白时除外
  const gapAbove = (): string[] => (spaced ? [] : ['']);

  // 每个输出流各自决定上不上色：是终端、且没有设置 NO_COLOR 才上色。
  // 不理会 FORCE_COLOR，所以它和 NO_COLOR 同时设置时以 NO_COLOR 为准
  const penFor = (stream: TerminalOutput) => {
    const color = stream.isTTY && env['NO_COLOR'] === undefined;
    const paint = (format: Format, text: string): string =>
      color ? styleText(format, text, { validateStream: false }) : text;
    const dim = (text: string): string => paint('dim', text);
    return {
      styled: color,
      paint,
      dim,
      print(...lines: string[]): void {
        stream.write(`${lines.join('\n')}\n`);
        spaced = false;
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
  const { styled, paint, dim, print, rule, section, keyValue } = penFor(out);
  const errors = penFor(err);

  // 两栏的表：第一栏按最长的一格定宽，第二栏折行
  const twoColumns = (rows: readonly (readonly [string, string])[]): string[] => {
    const firstWidth = Math.max(...rows.map(([first]) => displayWidth(first))) + 2;
    return rows.flatMap(([first, second]) => hanging('  ', pad(first, firstWidth), second));
  };

  // 每一栏取这一栏里最长的一格再加两格间隔
  const columnWidths = (rows: readonly (readonly string[])[]): number[] =>
    (rows[0] ?? []).map((_, column) => Math.max(...rows.map((row) => displayWidth(row[column] ?? ''))) + 2);

  // 带表头的表：表头暗淡，哪一栏都不截断。最后一栏是备注，整张表一个放法：每一格都放得下才成一栏；
  // 有一格放不下就都另起一行，与它前一栏的左缘对齐（那里也放不下最长的一格时，一起往左挪到放得下），
  // 表头不写这一栏。一格备注都没有时也不写
  const table = (header: readonly string[], rows: readonly (readonly string[])[]): string[] => {
    const last = header.length - 1;
    const widths = columnWidths([header, ...rows]).slice(0, last);
    const total = (columns: readonly number[]): number => 2 + columns.reduce((sum, width) => sum + width, 0);
    const start = (cells: readonly string[]): string =>
      `  ${cells.slice(0, last).map((cell, column) => pad(cell, widths[column] ?? 0)).join('')}`;
    const notes = rows.map((row) => row[last] ?? '');
    const noteHeader = notes.some((note) => note !== '') ? (header[last] ?? '') : '';
    const inline = [noteHeader, ...notes].every((note) => total(widths) + displayWidth(note) <= USABLE);
    const indent = Math.max(2, Math.min(total(widths.slice(0, -1)), USABLE - Math.max(...notes.map(displayWidth))));
    const ownLine = (note: string): string[] => (note === '' ? [] : [`${' '.repeat(indent)}${note}`]);
    return [
      dim(`${start(header)}${inline ? noteHeader : ''}`.trimEnd()),
      ...rows.flatMap((row, index) => {
        const note = notes[index] ?? '';
        return inline ? [`${start(row)}${note}`.trimEnd()] : [start(row).trimEnd(), ...ownLine(note)];
      }),
    ];
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
      answer: (text) => `${dim(symbols.separator)} ${text}`,
      // 光标所在行整行加粗。行内片段的收尾码会把粗体一并关掉，所以每次收尾后重申一次
      highlight: (text) => paint('bold', text.replaceAll('\x1b[22m', '\x1b[22m\x1b[1m')),
      description: (text) => hanging('   ', dim(pad(t.aboutColumn, displayWidth(t.aboutColumn) + 2)), text).join('\n'),
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
      error: (text) => hanging('   ', paint(attention, pad(t.noticeKey, displayWidth(t.noticeKey) + 2)), text).join('\n'),
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

  const mcpStatusCell = (status: McpStatus): string => {
    switch (status) {
      case 'none':
        return dim(t.mcpStatus.none);
      case 'configured':
        return paint('green', t.mcpStatus.configured);
      case 'unknown':
        return t.mcpStatus.unknown;
      case 'unsupported':
        return dim(t.mcpStatus.unsupported);
    }
  };

  // 条目一次全部列出；一屏放不下时才由交互库滚动
  const pageSize = (): number => Math.max(7, (out.rows ?? 24) - 6);

  // 汇总之后的那一问：动手、返回修改、取消
  const decision = (message: string, go: string): SelectQuestion<InstallDecision> => {
    const choice = (value: InstallDecision, label: string) => ({ value, short: label, name: label });
    return { message, pageSize: pageSize(), theme, rows: [choice('install', go), choice('revise', t.revise), choice('cancel', t.cancel)] };
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
      total: (): string[] => [rule(), ...keyValue(t.totalKey, t.totals(totals).join(` ${symbols.separator} `))],
    };
  };

  // 「正在安装」分区，各类组件共用：doing 是进行中的那一行写的字；每一项的结果由调用方说成文字
  const progress = (targets: readonly { name: string; host: string }[], doing: string) => {
    type Target = (typeof targets)[number];
    const [nameWidth = 0, hostWidth = 0] = columnWidths(targets.map((target) => [target.name, target.host]));
    const lead = (target: Target) => (mark: string): string => `  ${mark}  ${pad(target.name, nameWidth)}${pad(target.host, hostWidth)}`;
    const results = tally();
    // 标题下面已经打出的行数，照终端上实际占的行数算：一个比一行还长的词（目录给的名字）折不开，会被终端折成几行
    let lines = 0;
    const settle = (rows: string[]): void => {
      for (const row of rows) lines += Math.max(1, Math.ceil(displayWidth(row) / (out.columns ?? WIDTH)));
      print(...rows);
    };
    print(...gapAbove(), section(t.installing));
    return {
      begin(target: Target): (result?: { ok: true; text: string } | { ok: false; reason: string }) => void {
        const erase = spin((mark) => `${lead(target)(mark)}${doing}${dim(symbols.ellipsis)}`);
        return (result) => {
          erase();
          if (!result) return;
          settle(result.ok ? results.succeeded(lead(target), result.text) : results.failed(lead(target), result.reason));
        };
      },
      // 原因里可以有目录给的名字，长度不由我们定：和失败的原因一样自己折行，行数才数得对
      skip(target: Target, reason: string): void {
        settle(results.skipped(lead(target), reason));
      },
      finish(): void {
        // 标题还在屏幕上、且没有哪一行被终端折开时，回到标题那一行把它改写掉
        const up = lines + 1;
        if (up < (out.rows ?? 24) && (out.columns ?? WIDTH) >= WIDTH) {
          out.write(`\x1b[${up}A${ERASE_LINE}${section(t.results)}\x1b[${up}B\r`);
        }
        print(...results.total());
      },
    };
  };

  // 多选的条目表：名称、几栏状态、说明。columns 是各栏状态的表头，cells 与它一一对应；unavailable 是这一行
  // 不可选的原因，接在说明后面——reasonAsStatus 的行（只有一栏状态的工具列表）改写在状态栏的位置，这时不看 cells。
  // 一个都不勾就确认表示返回
  const entryPicker = <Value>(
    message: string,
    columns: readonly string[],
    entries: readonly {
      value: Value;
      name: string;
      cells: readonly string[];
      about: string;
      checked: boolean;
      unavailable?: string;
      reasonAsStatus?: boolean;
    }[],
  ): CheckboxQuestion<Value> => {
    // 多选的每一行前面是光标、勾选框和一个空格；分隔行前面只有一格，所以表头要多缩进
    const lead = displayWidth(symbols.checked) + 2;
    const header = [t.nameColumn, ...columns];
    const inStatus = (entry: (typeof entries)[number]): entry is (typeof entries)[number] & { unavailable: string } =>
      entry.unavailable !== undefined && entry.reasonAsStatus === true;
    const rows = entries.map((entry) => [entry.name, ...(inStatus(entry) ? [entry.unavailable] : entry.cells)]);
    const widths = columnWidths([header, ...rows]);
    const aboutWidth = USABLE - lead - widths.reduce((sum, width) => sum + width, 0);
    const cells = (row: readonly string[]): string => row.map((cell, column) => pad(cell, widths[column] ?? 0)).join('');
    return {
      message,
      pageSize: pageSize(),
      theme,
      rows: [
        { separator: dim(`${' '.repeat(lead - 1)}${cells(header)}${t.aboutColumn}`) },
        ...entries.map((entry, index) => {
          // 交互库把不可选的行拼成「名称 + 一个空格 + 原因」：原因要落在状态栏时，名称少补一格，说明跟在原因后面
          if (inStatus(entry)) {
            return {
              value: entry.value,
              short: entry.name,
              name: pad(entry.name, (widths[0] ?? 0) - 1),
              description: entry.about,
              checked: entry.checked,
              disabled: `${pad(`${REASON_MARK}${entry.unavailable}${REASON_MARK}`, widths[1] ?? 0)}${
                aboutWidth > 0 ? truncate(entry.about, aboutWidth, symbols.ellipsis) : ''
              }`,
            };
          }
          const reason = entry.unavailable === undefined ? undefined : `${symbols.separator} ${REASON_MARK}${entry.unavailable}${REASON_MARK}`;
          // 原因接在说明后面，说明相应少占几列
          const room = aboutWidth - (reason === undefined ? 0 : displayWidth(` ${reason}`));
          return {
            value: entry.value,
            short: entry.name,
            name: `${cells(rows[index] ?? [])}${room > 0 ? truncate(entry.about, room, symbols.ellipsis) : ''}`,
            description: entry.about,
            checked: entry.checked,
            ...(reason === undefined ? {} : { disabled: reason }),
          };
        }),
      ],
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
      spaced = true;
    },

    /** 读取目录、查询文件列表时的进行中提示，行首的符号转动；done() 把这一行擦掉。 */
    loading(what: keyof typeof t.loading): { done(): void } {
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
        `${paint('bold', 'oxy-tools')} ${dim(version)}`,
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

    /** 退回去再问一轮（回主菜单、返回修改）：新一轮提问与上一轮已回答的几行之间空一行。 */
    nextRound(): void {
      print('');
    },

    /** lacksHost 的分组因为一个宿主都没检测到而不可进入：行尾注明原因，光标起始落在第一个能选的项上。 */
    mainMenu(groups: readonly { id: GroupId; count: number; lacksHost: boolean }[]): SelectQuestion<MenuChoice> {
      const rows = groups.map((group) => ({ ...group, ...t.groups[group.id], count: String(group.count) }));
      const labelWidth = Math.max(displayWidth(t.groupColumn), ...rows.map((row) => displayWidth(row.label))) + 2;
      const countWidth = Math.max(displayWidth(t.countColumn), ...rows.map((row) => row.count.length));
      const aboutWidth = USABLE - 2 - labelWidth - countWidth - 2;
      const line = (label: string, count: string, about: string, width = aboutWidth): string =>
        `${pad(label, labelWidth)}${pad(count, countWidth, 'right')}  ${truncate(about, width, symbols.ellipsis)}`;
      // 原因接在说明后面，说明相应少占几列
      const reasonWidth = displayWidth(` ${symbols.separator} ${t.needsHost}`);
      const enterable = rows.find((row) => !row.lacksHost);
      return {
        message: t.pickGroup,
        pageSize: pageSize(),
        theme,
        // 交互库的光标缺省停在第一项上，哪怕它不可选
        ...(rows.some((row) => row.lacksHost) ? { default: enterable?.id ?? ('exit' as const) } : {}),
        rows: [
          ...(rows.length > 0
            ? [
                // 表头比条目多缩进一格：交互库在分隔行前只放一个空格，条目前是两格
                { separator: dim(` ${line(t.groupColumn, t.countColumn, t.aboutColumn)}`) },
                ...rows.map((row) => ({
                  value: row.id,
                  short: row.label,
                  ...(row.lacksHost
                    ? {
                        name: line(row.label, row.count, row.about, aboutWidth - reasonWidth),
                        disabled: `${symbols.separator} ${REASON_MARK}${t.needsHost}${REASON_MARK}`,
                      }
                    : { name: line(row.label, row.count, row.about) }),
                })),
                { separator: ' ' },
              ]
            : []),
          { value: 'exit' as const, short: t.exit, name: t.exit },
        ],
      };
    },

    /** 应用项目列表：名称、说明两栏。选中的值是那个应用项目，null 表示返回；cursor 是光标起始所在的那一项。 */
    appList(apps: readonly App[], cursor?: App): SelectQuestion<App | null> {
      const nameWidth = Math.max(displayWidth(t.nameColumn), ...apps.map((app) => displayWidth(app.name))) + 2;
      const aboutWidth = USABLE - 2 - nameWidth;
      return {
        message: t.pickApp,
        pageSize: pageSize(),
        theme,
        ...(cursor ? { default: cursor } : {}),
        rows: [
          // 表头比条目多缩进一格：交互库在分隔行前只放一个空格，条目前是两格
          { separator: dim(` ${pad(t.nameColumn, nameWidth)}${t.aboutColumn}`) },
          ...apps.map((app) => ({
            value: app,
            short: app.name,
            name: `${pad(app.name, nameWidth)}${truncate(app.description[lang], aboutWidth, symbols.ellipsis)}`,
            description: app.description[lang],
          })),
          { separator: ' ' },
          { value: null, short: t.back, name: t.back },
        ],
      };
    },

    /** 应用项目详情：说明全文和官方链接。链接整条写出，浏览器打不开时用户照着复制。 */
    appDetail(app: App): void {
      print(
        ...gapAbove(),
        section(app.name),
        ...keyValue(t.aboutColumn, app.description[lang]),
        // 链接再长也整条写在一行上，不交给折行：折开了就没法照着复制
        `  ${dim(pad(t.linkKey, KEY_WIDTH))}${paint('underline', app.url)}`,
      );
    },

    /** 接在详情后面：链接交给浏览器了没有。没打开不算出错，只提醒自己复制。 */
    linkOutcome(opened: boolean): void {
      print(
        ...(opened ? [`  ${paint('green', symbols.done)}  ${t.linkOpened}`] : keyValue(t.noticeKey, t.linkNotOpened, attention)),
        '',
      );
    },

    /** 勾选装进哪些宿主；checked 是提问出现时已经勾上的那些。location 是只作提示的目录，暗淡地写在名字后面，没有就不写。 */
    hostPicker(choices: readonly { host: Host; location?: string }[], checked: readonly Host[]): CheckboxQuestion<Host> {
      const nameWidth = Math.max(...choices.map(({ host }) => displayWidth(host.name))) + 2;
      return {
        message: t.pickHosts,
        pageSize: pageSize(),
        theme,
        rows: choices.map(({ host, location }) => ({
          value: host,
          short: host.name,
          name: location === undefined ? host.name : `${pad(host.name, nameWidth)}${dim(location)}`,
          checked: checked.includes(host),
        })),
      };
    },

    /**
     * 勾选要安装的 skill：名称、每个宿主一栏状态、说明。statuses 与 hosts 一一对应；
     * checked 是提问出现时已经勾上的那些。一个都不勾就确认表示返回。
     */
    skillPicker(
      hosts: readonly Host[],
      entries: readonly { skill: Skill; statuses: readonly SkillStatus[] }[],
      checked: readonly Skill[],
    ): CheckboxQuestion<Skill> {
      return entryPicker(
        t.pickSkills,
        hosts.map((host) => host.name),
        entries.map(({ skill, statuses }) => ({
          value: skill,
          name: skill.name,
          cells: statuses.map((status) => statusCell(status, skill.version)),
          about: skill.description[lang],
          checked: checked.includes(skill),
        })),
      );
    },

    /** 读不到某些宿主的配置时，在 MCP 列表上方说明：它们那一栏的状态都是未知。 */
    mcpConfigUnreadable(hosts: readonly Host[]): void {
      print(...keyValue(t.noticeKey, t.mcpConfigUnreadable(hosts.map((host) => host.name).join(t.listSeparator)), attention));
    },

    /**
     * 勾选要安装的 MCP：名称、每个宿主一栏状态、说明。statuses 与 hosts 一一对应；checked 是提问出现时已经勾上的那些。
     * 所选的宿主一个都不支持的条目不可选，行尾注明原因；只有一部分不支持的仍可选。
     */
    mcpPicker(
      hosts: readonly Host[],
      entries: readonly { mcp: Mcp; statuses: readonly McpStatus[] }[],
      checked: readonly Mcp[],
    ): CheckboxQuestion<Mcp> {
      return entryPicker(
        t.pickMcps,
        hosts.map((host) => host.name),
        entries.map(({ mcp, statuses }) => {
          const unavailable = statuses.every((status) => status === 'unsupported');
          return {
            value: mcp,
            name: mcp.name,
            // 不可选的行整行压暗，状态词自己不再带样式：行内的收尾码会把后半行的暗淡一并关掉
            cells: statuses.map((status) => (unavailable ? t.mcpStatus[status] : mcpStatusCell(status))),
            about: mcp.description[lang],
            checked: checked.includes(mcp),
            ...(unavailable ? { unavailable: t.unsupportedByHosts } : {}),
          };
        }),
      );
    },

    /**
     * 汇总：每一项将装到哪里、是新装还是覆盖。同一个条目装进几个宿主就有几行，名字只写在第一行。
     * 有覆盖项时提醒本地改动会丢失。
     */
    installSummary(targets: readonly InstallTarget[]): void {
      const overwrites = (target: InstallTarget): boolean => target.status.kind !== 'none';
      const note = ({ status, version }: InstallTarget): string => {
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
      print(
        ...gapAbove(),
        section(t.installSummary(new Set(targets.map((target) => target.name)).size)),
        ...table(
          [t.entryColumn, t.agentColumn, t.actionColumn, t.locationColumn, t.noteColumn],
          targets.map((target, index) => [
            target.name === targets[index - 1]?.name ? '' : target.name,
            target.host,
            overwrites(target) ? paint(attention, t.actions.overwrite) : t.actions.fresh,
            target.location,
            note(target),
          ]),
        ),
        '',
        ...(targets.some(overwrites) ? [...keyValue(t.noticeKey, t.replaceNotice, attention), ''] : []),
      );
    },

    confirmInstall(): SelectQuestion<InstallDecision> {
      return decision(t.confirmInstall, t.startInstall);
    },

    /** 不是本工具装的目录，覆盖前单独问一次，缺省不覆盖。 */
    confirmOverwrite(target: InstallTarget): ConfirmQuestion {
      return { message: t.confirmOverwrite(target.location), default: false, answers: { yes: t.yes, no: t.no }, theme };
    },

    /**
     * 「正在安装」分区：每一项先 begin，进行中的那一行行首的符号转动；用它返回的函数交出结果，这一行就改写成结果
     * （不给结果则只擦掉这一行）；用户没同意覆盖的那些不 begin，改用 skip。全部结束后 finish 把标题换成「结果」并打出合计。
     */
    installation(targets: readonly InstallTarget[]) {
      const rows = progress(targets, t.downloading);
      return {
        begin(target: InstallTarget): (outcome?: InstallOutcome) => void {
          const settle = rows.begin(target);
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
        finish: rows.finish,
      };
    },

    /**
     * MCP 的汇总：每一项装进哪个宿主、是新装还是覆盖。同一个条目装进几个宿主就有几行，名字只写在第一行。
     * 状态未知时说不出是新装还是覆盖，只写安装，备注里说明会先尝试移除。
     */
    mcpSummary(targets: readonly McpTarget[]): void {
      const action = { none: t.actions.fresh, configured: paint(attention, t.actions.overwrite), unknown: t.actions.unknown };
      const note = { none: '', configured: t.mcpConfiguredNote, unknown: t.mcpUnknownNote };
      print(
        ...gapAbove(),
        section(t.mcpSummary(new Set(targets.map((target) => target.name)).size)),
        ...table(
          [t.entryColumn, t.agentColumn, t.actionColumn, t.noteColumn],
          targets.map((target, index) => [
            target.name === targets[index - 1]?.name ? '' : target.name,
            target.host,
            action[target.status],
            note[target.status],
          ]),
        ),
      );
    },

    /** 将要执行的完整命令，逐条编号；过长时折行，续行与命令的左缘对齐。命令本身从不截断。 */
    commandList(commands: readonly Command[]): void {
      const indexWidth = Math.max(2, String(commands.length).length);
      print(
        ...gapAbove(),
        section(t.commandsToRun(commands.length)),
        ...commands.flatMap((command, index) =>
          hanging('  ', `${dim(pad(String(index + 1), indexWidth, 'right'))}  `, commandLine(command, (text) => paint(attention, text))),
        ),
        '',
      );
    },

    /** 接在将执行的命令后面：命令里 key 的位置是占位符。 */
    keyPlaceholderNotice(): void {
      print(...keyValue(t.noticeKey, t.keyPlaceholderNotice, attention), '');
    },

    /** 问一个 key 之前：哪个 MCP 要它、它是什么、去哪申请、留空会怎样。 */
    keyRequest(mcp: Mcp, variable: McpVariable): void {
      print(
        ...gapAbove(),
        section(t.keyRequest(mcp.name, variable.required)),
        ...keyValue(t.variableKey, `${variable.name}${t.keyNeed(variable.required)}`),
        ...keyValue(t.purposeKey, variable.description[lang]),
        // 申请地址和应用项目的链接一样整条写在一行上：折开了就没法照着复制
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

    /** 接在将执行的命令后面：这个 MCP 必填的 key 没填，不在这次要装的里面。 */
    mcpKeyMissingNotice(mcp: Mcp, variable: string): void {
      print(...keyValue(t.noticeKey, t.keyMissingNotice(mcp.name, variable), attention), '');
    },

    /** 接在将执行的命令后面：这个宿主添加远程地址的 MCP 时可能当场打开浏览器登录，而它的输出不会显示在这里。 */
    mcpLoginNotice(host: Host, login: Command): void {
      print(...keyValue(t.noticeKey, t.mcpLoginNotice(host.name, commandLine(login)), attention), '');
    },

    confirmCommands(): SelectQuestion<InstallDecision> {
      return decision(t.confirmCommands, t.runCommands);
    },

    /**
     * 勾选要安装的工具：名称、一栏状态、说明；checked 是提问出现时已经勾上的那些。
     * 装不了的条目不可选，状态栏的位置写原因。
     */
    toolPicker(
      entries: readonly { tool: Tool; status: ToolStatus; unavailable?: ToolUnavailable }[],
      checked: readonly Tool[],
    ): CheckboxQuestion<Tool> {
      return entryPicker(
        t.pickTools,
        [t.statusColumn],
        entries.map(({ tool, status, unavailable }) => ({
          value: tool,
          name: tool.name,
          cells: [status === 'installed' ? paint('green', t.toolStatus.installed) : dim(t.toolStatus.none)],
          about: tool.description[lang],
          checked: checked.includes(tool),
          ...(unavailable
            ? { unavailable: unavailable.kind === 'os' ? t.unsupportedOs(unavailable.os) : t.unsupportedByHosts, reasonAsStatus: true }
            : {}),
        })),
      );
    },

    /** 将要执行的工具安装命令，逐条编号，前面是工具的名字；过长时折行，续行与命令的左缘对齐。命令本身从不截断。 */
    toolCommandList(targets: readonly ToolTarget[]): void {
      const indexWidth = Math.max(2, String(targets.length).length);
      const [nameWidth = 0] = columnWidths(targets.map((target) => [target.name]));
      print(
        ...gapAbove(),
        section(t.commandsToRun(targets.length)),
        ...targets.flatMap((target, index) =>
          hanging('  ', `${dim(pad(String(index + 1), indexWidth, 'right'))}  ${pad(target.name, nameWidth)}`, target.command),
        ),
        '',
      );
    },

    /**
     * 逐个执行工具的安装命令：每个工具 begin 一次，打出以它名字为标题的分区和要执行的那一行；命令自己的输出随后
     * 原样接在下面，不经过这里。用 begin 返回的函数交出结论，结论上方空一行。全部结束后 finish 打出合计；
     * 不止一个工具时，合计之前先用一个「结果」分区把各项的结论再列一遍——前面的早被命令的输出顶出屏幕了。
     */
    toolInstallation(targets: readonly ToolTarget[]) {
      const [nameWidth = 0] = columnWidths(targets.map((target) => [target.name]));
      const results = tally();
      const conclusions: string[] = [];
      return {
        begin(target: ToolTarget): (result: ToolResult) => void {
          print(...gapAbove(), section(target.name), ...hanging('  ', `${dim('$')} `, target.command));
          return (result) => {
            const lead = (mark: string): string => `  ${mark}  ${pad(target.name, nameWidth)}`;
            const text = t.toolResult(result, target.evidence);
            const conclusion = result.available
              ? results.succeeded((mark) => `${lead(mark)}${paint('green', t.toolAvailable)}`, text)
              : results.failed(lead, text);
            conclusions.push(...conclusion);
            print('', ...conclusion);
          };
        },
        finish(): void {
          if (targets.length > 1) print('', section(t.results), ...conclusions);
          print(...results.total());
        },
      };
    },

    /** MCP 的「正在安装」分区，用法同 installation；必填的 key 没填的那些不 begin，改用 skip，给出没填的变量名。 */
    mcpInstallation(targets: readonly McpTarget[]) {
      const rows = progress(targets, t.configuring);
      return {
        begin(target: McpTarget): (outcome?: McpOutcome) => void {
          const settle = rows.begin(target);
          return (outcome) =>
            settle(
              outcome &&
                (outcome.ok
                  ? { ok: true, text: paint('green', t.mcpStatus.configured) }
                  : { ok: false, reason: t.mcpInstallProblem(outcome.problem) }),
            );
        },
        skip: (target: McpTarget, missingVariable: string): void => rows.skip(target, t.keyMissing(missingVariable)),
        finish: rows.finish,
      };
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
