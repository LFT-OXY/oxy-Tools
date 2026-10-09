// 呈现层：所有终端输出都从这里出去，配色、符号、间距、横线和标题区由它统一决定（视觉方向「账本」）。
// 其余模块只说“显示什么”。
import { styleText } from 'node:util';
import type { Skill } from './catalog.ts';
import type { Host } from './hosts.ts';
import type { SkillInstallProblem } from './install-skill.ts';
import { MESSAGES, type Failure, type Lang } from './messages.ts';
import type { CheckboxQuestion, PromptTheme, SelectQuestion } from './prompter.ts';
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
  failed: 'x',
  dash: '-',
  cursor: '>',
  checked: '[x]',
  unchecked: '[ ]',
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
export type InstallDecision = 'install' | 'revise' | 'cancel';
export type InstallOutcome = { ok: true; version: string } | { ok: false; problem: SkillInstallProblem };

/** 一项安装：哪个条目、装进哪个宿主、装到哪（给用户看的路径） */
export interface InstallTarget {
  name: string;
  host: string;
  location: string;
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

  // 每一栏取这一栏里最长的一格再加两格间隔
  const columnWidths = (rows: readonly (readonly string[])[]): number[] =>
    (rows[0] ?? []).map((_, column) => Math.max(...rows.map((row) => displayWidth(row[column] ?? ''))) + 2);

  // 带表头的表：表头暗淡，哪一栏都不截断
  const table = (header: readonly string[], rows: readonly (readonly string[])[]): string[] => {
    const widths = columnWidths([header, ...rows]);
    const line = (cells: readonly string[]): string =>
      `  ${cells.map((cell, column) => pad(cell, widths[column] ?? 0)).join('').trimEnd()}`;
    return [dim(line(header)), ...rows.map(line)];
  };

  // 行首的符号转动；返回的函数把这一行擦掉
  const spin = (line: (mark: string) => string): (() => void) => {
    let frame = 0;
    const draw = (): void => {
      const mark = symbols.spinner[frame++ % symbols.spinner.length] ?? '';
      out.write(`${ERASE_LINE}${line(paint('cyan', mark))}`);
    };
    draw();
    const timer = setInterval(draw, SPINNER_INTERVAL);
    return () => {
      clearInterval(timer);
      out.write(ERASE_LINE);
    };
  };

  const theme: PromptTheme = {
    prefix: { idle: paint(['cyan', 'bold'], '?'), done: paint('green', symbols.done) },
    icon: { cursor: paint('cyan', symbols.cursor), checked: paint('cyan', symbols.checked), unchecked: symbols.unchecked },
    style: {
      message: (text) => paint('bold', text),
      answer: (text) => `${dim(symbols.separator)} ${text}`,
      // 光标所在行整行加粗。行内片段的收尾码会把粗体一并关掉，所以每次收尾后重申一次
      highlight: (text) => paint('bold', text.replaceAll('\x1b[22m', '\x1b[22m\x1b[1m')),
      description: (text) => hanging('   ', dim(pad(t.aboutColumn, displayWidth(t.aboutColumn) + 2)), text).join('\n'),
      // 一个都没勾就确认，等于返回
      renderSelectedChoices: (selected) => selected.map((choice) => choice.short).join(t.listSeparator) || t.back,
      keysHelpTip: (keys) =>
        `   ${keys
          .map(([key, action]) => `${t.keyWords[key] ?? (unicode ? key : (t.keyNames[key] ?? key))} ${dim(t.keys[action] ?? action)}`)
          .join(dim(` ${symbols.separator} `))}`,
    },
  };

  // 条目一次全部列出；一屏放不下时才由交互库滚动
  const pageSize = (): number => Math.max(7, (out.rows ?? 24) - 6);

  // skill 的两栏表：名称、说明。lead 是交互库在每一行前面放的列数（分隔行前面只有一格，所以表头要多缩进）
  const skillTable = (skills: readonly Skill[], lead: number) => {
    const nameWidth = Math.max(displayWidth(t.nameColumn), ...skills.map((skill) => displayWidth(skill.name))) + 2;
    const aboutWidth = USABLE - lead - nameWidth;
    return {
      header: { separator: dim(`${' '.repeat(lead - 1)}${pad(t.nameColumn, nameWidth)}${t.aboutColumn}`) },
      choices: skills.map((skill) => ({
        value: skill,
        short: skill.name,
        name: `${pad(skill.name, nameWidth)}${truncate(skill.description[lang], aboutWidth, symbols.ellipsis)}`,
        description: skill.description[lang],
      })),
    };
  };

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

    /** 读取目录、查询文件列表时的进行中提示，行首的符号转动；done() 把这一行擦掉。 */
    loading(what: keyof typeof t.loading): { done(): void } {
      return { done: spin((mark) => `  ${mark} ${t.loading[what]}${dim(symbols.ellipsis)}`) };
    },

    /** 本机信息：宿主在不在、目录里各类条目的数量，有要提醒的事各多一行。 */
    catalogSummary({ host, skills, skipped }: { host: Host; skills: number; skipped: number }): void {
      const presence = host.detected ? paint('green', symbols.done) : `${dim(symbols.dash)} ${t.notDetected}`;
      print(
        ...keyValue(t.agentKey, `${host.name} ${presence}`),
        ...keyValue(t.catalogKey, t.counts({ skills })),
        ...(host.detected ? [] : keyValue(t.noticeKey, t.noHost(host.name), attention)),
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

    /** 退回去再问一轮（回主菜单、返回修改）：新一轮提问与上一轮已回答的几行之间空一行。 */
    nextRound(): void {
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
      const { header, choices } = skillTable(skills, 2);
      return {
        message: t.browseSkills,
        pageSize: pageSize(),
        theme,
        ...(cursor ? { default: cursor } : {}),
        rows: [header, ...choices, { separator: ' ' }, { value: null, short: t.back, name: t.back }],
      };
    },

    /** 勾选要安装的 skill；checked 是提问出现时已经勾上的那些。一个都不勾就确认表示返回。 */
    skillPicker(skills: readonly Skill[], checked: readonly Skill[]): CheckboxQuestion<Skill> {
      // 多选的每一行前面是光标、勾选框和一个空格
      const { header, choices } = skillTable(skills, displayWidth(symbols.checked) + 2);
      return {
        message: t.pickSkills,
        pageSize: pageSize(),
        theme,
        rows: [header, ...choices.map((choice) => ({ ...choice, checked: checked.includes(choice.value) }))],
      };
    },

    /** 汇总：每一项将装到哪里。 */
    installSummary(targets: readonly InstallTarget[]): void {
      print(
        ...gapAbove(),
        section(t.installSummary(targets.length)),
        ...table(
          [t.entryColumn, t.agentColumn, t.locationColumn],
          targets.map((target) => [target.name, target.host, target.location]),
        ),
        '',
        ...keyValue(t.noticeKey, t.replaceNotice, attention),
        '',
      );
    },

    confirmInstall(): SelectQuestion<InstallDecision> {
      const choice = (value: InstallDecision, label: string) => ({ value, short: label, name: label });
      return {
        message: t.confirmInstall,
        pageSize: pageSize(),
        theme,
        rows: [choice('install', t.startInstall), choice('revise', t.revise), choice('cancel', t.cancel)],
      };
    },

    /**
     * 「正在安装」分区：每一项先 begin，进行中的那一行行首的符号转动；用它返回的函数交出结果，这一行就改写成结果
     * （不给结果则只擦掉这一行）。全部结束后 finish 把标题换成「结果」并打出合计。
     */
    installation(targets: readonly InstallTarget[]) {
      const [nameWidth = 0, hostWidth = 0] = columnWidths(targets.map((target) => [target.name, target.host]));
      const lead = (mark: string, target: InstallTarget): string =>
        `  ${mark}  ${pad(target.name, nameWidth)}${pad(target.host, hostWidth)}`;
      const totals = { succeeded: 0, failed: 0, skipped: 0 };
      // 标题下面已经打出的行数
      let lines = 0;
      print(...gapAbove(), section(t.installing));
      return {
        begin(target: InstallTarget): (outcome?: InstallOutcome) => void {
          const erase = spin((mark) => `${lead(mark, target)}${t.downloading}${dim(symbols.ellipsis)}`);
          return (outcome) => {
            erase();
            if (!outcome) return;
            const rows = outcome.ok
              ? [`${lead(paint('green', symbols.done), target)}${paint('green', t.installed)} ${outcome.version}`]
              : hanging(
                  '',
                  `${lead(paint('red', symbols.failed), target)}${paint(['red', 'bold'], t.failed)} `,
                  t.installProblem(outcome.problem),
                );
            totals[outcome.ok ? 'succeeded' : 'failed']++;
            lines += rows.length;
            print(...rows);
          };
        },
        finish(): void {
          // 标题还在屏幕上、且没有哪一行被终端折开时，回到标题那一行把它改写掉
          const up = lines + 1;
          if (up < (out.rows ?? 24) && (out.columns ?? WIDTH) >= WIDTH) {
            out.write(`\x1b[${up}A${ERASE_LINE}${section(t.results)}\x1b[${up}B\r`);
          }
          print(rule(), ...keyValue(t.totalKey, t.totals(totals).join(` ${symbols.separator} `)));
        },
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
