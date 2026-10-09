// 界面预览页（仅供开发）：经安装器入口按预设场景驱动安装器，提问由真实的交互库渲染，
// 把无头终端里的画面连同样式转成一个离线 HTML 页面，每个画面一格，深色和浅色终端各一份。
// 生成物在 .preview/ 下，不提交，不随 npm 包发布。
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import xterm from '@xterm/headless';
import { githubCatalogSource, type CatalogSource } from '../src/catalog.ts';
import { runInstaller } from '../src/installer.ts';
import { EMPTY_CATALOG } from '../test/fixtures.ts';
import { COLUMNS, KEY, keyboardPrompter } from '../test/terminal.ts';

const ROWS = 60;
const down = (times: number): string[] => Array<string>(times).fill(KEY.down);

interface Scene {
  title: string;
  note?: string;
  argv?: string[];
  env?: Record<string, string>;
  platform?: NodeJS.Platform;
  /** 标准输入和标准输出是不是终端，缺省是；标准错误一直接在终端上 */
  tty?: boolean;
  catalog?: CatalogSource;
  /** 依次按下的键；画面停在按完之后的样子 */
  keys?: string[];
}

// ── 样例目录 ──────────────────────────────────────────────────────────────────

const SHOWCASE_SKILLS = [
  ['archify', '2.16', '生成架构图、流程图、时序图、数据流图，输出可交互的独立 HTML', 'Generate architecture, workflow, sequence and data-flow diagrams as standalone interactive HTML'],
  ['explanation', '1.0.0', '把任何内容改写到聪明的 12 岁孩子也能看懂', 'Rewrite any content so a smart 12-year-old can follow it'],
  ['if5', '1.0.0', '像给 5 岁小孩那样解释一个话题，配极简图解', 'Explain a topic as if to a five-year-old, with very simple diagrams'],
  ['onetake', '1.0.0', '制作 10–60 秒的产品动效短片（体积约 70MB，仅限非商业使用）', 'Make 10–60 s product motion videos (about 70 MB, noncommercial use only)'],
  ['oxy-learning-hub', '1.0.0', '总结或教学链接、文档、代码和长文本，可生成互动式 HTML 课程', 'Summarize or teach links, documents, code and long text, optionally as interactive HTML lessons'],
  ['pr', '1.0.0', '撰写 PR（合并请求）描述', 'Write pull request descriptions'],
  ['wizard', '1.0.0', '生成交互式 bash 向导，带人走完只能由人完成的步骤', 'Generate an interactive bash wizard for steps only a human can perform'],
  ['writing-for-agents', '1.0.0', '编写 skill、AGENTS.md、CLAUDE.md 等给 AI 读的文档的写作规范', 'Writing guidelines for documents that agents read: skills, AGENTS.md, CLAUDE.md'],
].map(([name, version, zh, en]) => ({ name, version, path: `skills/${name}`, description: { zh, en } }));

// 位置照默认的目录来源来写，内容换成样例
function catalogOf(index: unknown, catalog: unknown = EMPTY_CATALOG): CatalogSource {
  const files: Record<string, unknown> = { 'index.json': index, 'catalog.json': catalog };
  return { ...githubCatalogSource(), readText: async (file) => JSON.stringify(files[file]) };
}

const sample = catalogOf({ version: 1, skills: SHOWCASE_SKILLS });
const withBrokenEntry = catalogOf({ version: 1, skills: [...SHOWCASE_SKILLS, { name: 'broken', path: '../elsewhere' }] });
const newerFormat = catalogOf({ version: 1, skills: SHOWCASE_SKILLS }, { version: 2, components: [] });
const neverLoads: CatalogSource = { ...sample, readText: () => new Promise<string>(() => {}) };
const offline: CatalogSource = {
  ...sample,
  readText: () => Promise.reject(new TypeError('fetch failed', { cause: Object.assign(new Error('getaddrinfo'), { code: 'ENOTFOUND' }) })),
};

// ── 场景 ──────────────────────────────────────────────────────────────────────

const LEGACY_CONSOLE = { platform: 'win32' as const, env: { TERM: '' } };
const toSkills = [KEY.enter];

const scenes: Scene[] = [
  { title: '启动与加载', note: 'npx oxy-tools · 最先打出 OXY 大标志；读取目录时行首的符号转动', catalog: neverLoads },
  { title: '主菜单', note: 'catalog.json 三个数组为空：只有 Skill 一个分组和退出' },
  { title: '主菜单 · 有条目被跳过', note: '目录里有一条写坏的条目', catalog: withBrokenEntry },
  { title: 'skill 列表', note: '说明过长则截断；光标所在行的全文在列表下方', keys: [...toSkills, ...down(4)] },
  { title: 'skill 详情', note: '选中一个 skill 后显示版本和说明全文，再回到列表', keys: [...toSkills, ...down(3), KEY.enter] },
  { title: '返回主菜单', note: '已回答的提问收成一行；大标志不重复', keys: [...toSkills, ...down(8), KEY.enter] },
  { title: '出错 · 目录读取失败', note: '断网', catalog: offline },
  { title: '出错 · 目录格式版本不受支持', note: 'catalog.json 的格式版本高于安装器所支持的', catalog: newerFormat },
  { title: '出错 · 没有交互式终端', note: 'npx oxy-tools | cat · 不打印大标志；出错说明走标准错误，所以仍然看得到', tty: false },
  { title: '出错 · 无法识别的参数', note: 'npx oxy-tools --frobnicate', argv: ['--frobnicate'] },
  { title: '帮助', note: 'npx oxy-tools --help', argv: ['--help'] },
  { title: '英文界面 · 主菜单', note: 'npx oxy-tools --lang en', argv: ['--lang', 'en'] },
  { title: '英文界面 · skill 列表', argv: ['--lang', 'en'], keys: [...toSkills, ...down(4)] },
  { title: '不显示颜色 · 主菜单', note: '设置了 NO_COLOR', env: { NO_COLOR: '1' } },
  { title: '不显示颜色 · skill 列表', note: '设置了 NO_COLOR', env: { NO_COLOR: '1' }, keys: [...toSkills, ...down(4)] },
  { title: '不显示颜色 · 出错', note: '设置了 NO_COLOR', env: { NO_COLOR: '1' }, catalog: offline },
  { title: '没有 Unicode · 启动与加载', note: 'Windows 旧式控制台：符号和大标志退成 ASCII', ...LEGACY_CONSOLE, catalog: neverLoads },
  { title: '没有 Unicode · 主菜单', note: '按键提示里的按键改用文字', ...LEGACY_CONSOLE, catalog: withBrokenEntry },
  { title: '没有 Unicode · skill 列表', ...LEGACY_CONSOLE, keys: [...toSkills, ...down(4)] },
  { title: '没有 Unicode · skill 详情后返回', ...LEGACY_CONSOLE, keys: [...toSkills, KEY.enter, ...down(8), KEY.enter] },
  { title: '没有 Unicode · 出错', ...LEGACY_CONSOLE, catalog: offline },
];

// ── 驱动安装器，读出画面 ──────────────────────────────────────────────────────

interface Cell {
  char: string;
  wide: boolean;
  /** 终端的标准命名色编号，null 是默认色 */
  color: number | null;
  bold: boolean;
  dim: boolean;
  underline: boolean;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function play(scene: Scene): Promise<Cell[][]> {
  const terminal = new xterm.Terminal({ cols: COLUMNS, rows: ROWS, allowProposedApi: true, convertEol: true });
  let lastWrite = Date.now();
  const write = (text: string): void => {
    lastWrite = Date.now();
    terminal.write(text);
  };
  // 输出停下来一小会儿就算画完了；转动符号一直在写，所以另设上限
  const settle = async (): Promise<void> => {
    const deadline = Date.now() + 400;
    await sleep(30);
    while (Date.now() - lastWrite < 60 && Date.now() < deadline) await sleep(10);
  };

  const { keyboard, prompter } = keyboardPrompter(write, ROWS);
  const tty = scene.tty ?? true;
  const finished = runInstaller({
    argv: scene.argv ?? [],
    env: { LANG: 'zh_CN.UTF-8', TERM: 'xterm-256color', ...scene.env },
    platform: scene.platform ?? 'darwin',
    systemLocale: 'zh-CN',
    stdout: { isTTY: tty, rows: ROWS, write },
    stderr: { isTTY: true, write },
    stdinIsTTY: tty,
    catalogSource: scene.catalog ?? sample,
    homeDir: '/nonexistent',
    runCommand: () => Promise.reject(new Error('preview does not run commands')),
    prompter,
    openLink: () => Promise.reject(new Error('preview does not open links')),
  });

  await settle();
  for (const key of scene.keys ?? []) {
    keyboard.write(key);
    await settle();
  }
  await new Promise<void>((resolve) => terminal.write('', resolve));
  const cells = readCells(terminal);
  // 收掉还开着的提问；一直在加载的场景不会结束，由进程退出时一并了结
  keyboard.write(KEY.ctrlC);
  await Promise.race([finished, sleep(200)]);
  return cells;
}

function readCells(terminal: InstanceType<typeof xterm.Terminal>): Cell[][] {
  const buffer = terminal.buffer.active;
  const lines: Cell[][] = [];
  for (let y = 0; y < ROWS; y++) {
    const line = buffer.getLine(y);
    const cells: Cell[] = [];
    for (let x = 0; line && x < COLUMNS; x++) {
      const cell = line.getCell(x);
      if (!cell || cell.getWidth() === 0) continue;
      cells.push({
        char: cell.getChars() || ' ',
        wide: cell.getWidth() === 2,
        color: cell.isFgPalette() ? cell.getFgColor() : null,
        bold: cell.isBold() !== 0,
        dim: cell.isDim() !== 0,
        underline: cell.isUnderline() !== 0,
      });
    }
    while (cells.at(-1)?.char === ' ') cells.pop();
    lines.push(cells);
  }
  while (lines.at(-1)?.length === 0) lines.pop();
  return lines;
}

// ── 转成 HTML ─────────────────────────────────────────────────────────────────

const escapeHtml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function cellClass(cell: Cell): string {
  return [cell.color === null ? '' : `c${cell.color}`, cell.bold ? 'b' : '', cell.dim ? 'd' : '', cell.underline ? 'u' : '']
    .filter(Boolean)
    .join(' ');
}

// 非 ASCII 字符各包一层定宽的盒子，浏览器里才和终端一样按格对齐；实心方块填满整格
function lineHtml(cells: Cell[]): string {
  let html = '';
  let run = { className: '', text: '' };
  const flush = (): void => {
    if (run.text) html += run.className ? `<span class="${run.className}">${run.text}</span>` : run.text;
  };
  for (const cell of cells) {
    const className = cellClass(cell);
    if (className !== run.className) {
      flush();
      run = { className, text: '' };
    }
    const code = cell.char.codePointAt(0) ?? 0;
    if (cell.char.length === 1 && code < 128) {
      run.text += escapeHtml(cell.char);
    } else {
      const shape = code === 0x2588 ? ' fill' : code >= 0x2500 && code <= 0x257f ? ' box' : '';
      run.text += `<i class="${cell.wide ? 'w2' : 'w1'}${shape}">${escapeHtml(cell.char)}</i>`;
    }
  }
  flush();
  return `<div class="l">${html || ' '}</div>`;
}

// 两套代表性配色，近似 VS Code 默认的深色与浅色终端；真实色值由用户自己的终端决定
const PALETTES = {
  dark: { label: '深色终端', background: '#181818', foreground: '#cccccc', colors: ['#000000', '#cd3131', '#0dbc79', '#e5e510', '#2472c8', '#bc3fbc', '#11a8cd', '#e5e5e5'] },
  light: { label: '浅色终端', background: '#ffffff', foreground: '#3b3b3b', colors: ['#000000', '#cd3131', '#107c10', '#949800', '#0451a5', '#bc05bc', '#0598bc', '#555555'] },
};

const CSS = `
*{box-sizing:border-box}
body{margin:0;background:#e4e5e7;color:#1d1d1f;font:14px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}
main{width:1280px;margin:0 auto;padding:22px 22px 60px}
h1{font-size:18px;margin:0 0 4px}
main>p{margin:0 0 22px;color:#6b6b70;font-size:13px}
.scene{margin:0 0 26px}
.scene h2{margin:0 0 8px;font-size:14px;font-weight:600;display:flex;gap:10px;align-items:baseline}
.scene h2 small{font-weight:400;color:#6b6b70;font-size:13px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}
.term{border-radius:8px;overflow:hidden;background:var(--bg);color:var(--fg);box-shadow:0 0 0 1px rgba(0,0,0,.16),0 6px 18px rgba(0,0,0,.10)}
.bar{height:26px;display:flex;align-items:center;gap:6px;padding:0 10px;font-size:11px;background:color-mix(in srgb,var(--fg) 9%,var(--bg))}
.bar i{width:9px;height:9px;border-radius:50%;background:color-mix(in srgb,var(--fg) 30%,var(--bg))}
.bar span{margin-left:8px;opacity:.6}
.screen{padding:10px 12px 14px;font:12px/1.2 ui-monospace,"SF Mono",Menlo,Consolas,"Cascadia Mono","DejaVu Sans Mono",monospace;white-space:pre}
.l{height:1.2em}
.l i{font-style:normal;display:inline-block;text-align:center;vertical-align:top;height:1.2em}
.w1{width:1ch}.w2{width:2ch}
.fill{box-shadow:inset 0 0 0 1em currentColor,0 0 0 .5px currentColor}.box{transform:scaleY(1.22)}
.b{font-weight:700}.d{opacity:.5}.u{text-decoration:underline;text-underline-offset:2px}
${Object.entries(PALETTES)
  .map(([name, palette]) => `.term.${name}{--bg:${palette.background};--fg:${palette.foreground};${palette.colors.map((value, index) => `--c${index}:${value}`).join(';')}}`)
  .join('\n')}
${PALETTES.dark.colors.map((_, index) => `.c${index}{color:var(--c${index})}`).join('')}
`;

function page(frames: { scene: Scene; lines: Cell[][] }[]): string {
  const sections = frames.map(({ scene, lines }) => {
    const screen = lines.map(lineHtml).join('');
    const terminals = Object.entries(PALETTES)
      .map(([name, palette]) => `<div class="term ${name}"><div class="bar"><i></i><i></i><i></i><span>${palette.label}</span></div><div class="screen">${screen}</div></div>`)
      .join('');
    const note = scene.note ? `<small>${escapeHtml(scene.note)}</small>` : '';
    return `<section class="scene"><h2>${escapeHtml(scene.title)}${note}</h2><div class="pair">${terminals}</div></section>`;
  });
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>oxy-tools 界面预览页</title>
<style>${CSS}</style>
</head>
<body>
<main>
<h1>oxy-tools 界面预览页</h1>
<p>安装器真实的终端输出，共 ${frames.length} 个画面；每个画面左为深色终端、右为浅色终端。对照视觉方向「账本」核对。</p>
${sections.join('\n')}
</main>
</body>
</html>
`;
}

const frames = [];
for (const scene of scenes) frames.push({ scene, lines: await play(scene) });

const target = fileURLToPath(new URL('../.preview/index.html', import.meta.url));
mkdirSync(fileURLToPath(new URL('../.preview/', import.meta.url)), { recursive: true });
writeFileSync(target, page(frames));
console.log(`${frames.length} 个画面 → ${target}`);
// 一直在加载的场景还挂着定时器，直接结束进程
process.exit(0);
