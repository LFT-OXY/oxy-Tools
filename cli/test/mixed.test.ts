import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { githubCatalogSource } from '../src/catalog.ts';
import { fakeGitHub } from './github.ts';
import { displayWidth } from '../src/text.ts';
import { EMPTY_CATALOG, KEYED_MCP, SAMPLE_APPS, SAMPLE_MCPS, SAMPLE_TOOLS, STACK_FRAME, accept, blank, catalogDir, choose, no, pick, run, secret, tempDir } from './harness.ts';

// 「联网搜索与文档检索」下三种类型各有一条：alpha（本仓库的 skill）、docs-local（MCP）、borealis（外部项目）
const WEB_SEARCH = '联网搜索与文档检索';
const MIXED = { ...EMPTY_CATALOG, mcps: SAMPLE_MCPS, apps: SAMPLE_APPS, skillPurposes: { alpha: 'web-search' } };
const mixed = (catalog: Record<string, unknown> = {}): string => catalogDir({ catalog: { ...MIXED, ...catalog } });
const BOTH_HOSTS = ['claude', 'codex'];
const QUESTION = '? 选择要安装的条目';
// 2026-10-09 对照官方文档和本机的 claude 2.1.295、codex 0.162.0 核对过的写法，见 mcp.test.ts
const CLAUDE_ADD_LOCAL = { command: 'claude', args: ['mcp', 'add', '--scope', 'user', 'docs-local', '--', 'npx', '-y', '@example/docs-mcp@latest'] };
const CODEX_ADD_LOCAL = { command: 'codex', args: ['mcp', 'add', 'docs-local', '--', 'npx', '-y', '@example/docs-mcp@latest'] };
const all = [choose(WEB_SEARCH), pick('alpha', 'docs-local', 'borealis'), choose('开始安装'), choose('退出')];
// 各段文字在画面上的先后
const inOrder = (screen: string, texts: string[]): void => {
  const order = texts.map((text) => screen.indexOf(text));
  expect(order).not.toContain(-1);
  expect(order).toEqual([...order].sort((a, b) => a - b));
};
// 汇总那个分区：从标题到确认的提问
const summaryOf = (output: string): string => output.slice(output.indexOf('── 将安装'), output.indexOf('? 开始安装吗'));

describe('混合列表里三种类型同表', () => {
  // 画面上第一栏是 name 的那一行里，第 nth 次出现的 text 从第几列开始
  const startOf = (output: string, name: string, text: string, nth = 1): number => {
    const line = output.split('\n').find((candidate) => new RegExp(`^ ?[□■–]? *${name}\\s`).test(candidate)) ?? '';
    return displayWidth(line.split(text).slice(0, nth).join(text));
  };

  it('先是 skill 一段，再是 MCP 一段，外部项目在最下面', async () => {
    const result = await run({ catalog: mixed(), answers: [choose(WEB_SEARCH), pick(), choose('退出')] });

    expect(result.output).toMatch(
      /^\s+名称\s+Claude Code\s+说明\n\s+── Skill\n □ alpha\s+未装\s+推荐 · .*\n\s+── MCP\n □ docs-local\s+未配置\s+本地进程方式的样例 MCP.*…\n\n\s+── 外部项目 · 只给链接，不安装\n □ borealis\s+第二个样例外部项目$/m,
    );
  });

  it('两个宿主：skill 和 MCP 的状态都落在各自宿主的那一栏里', async () => {
    const result = await run({
      catalog: mixed(),
      onPath: BOTH_HOSTS,
      home: { '.codex/config.toml': '[mcp_servers.docs-local]\ncommand = "old"\n', '.agents/skills/alpha/SKILL.md': '别处装的\n' },
      answers: [choose(WEB_SEARCH), accept(), pick(), pick(), choose('退出')],
    });
    const list = result.output.split(QUESTION)[1] ?? '';

    expect(list).toMatch(/^ □ alpha\s+未装\s+非本工具安装\s/m);
    expect(list).toMatch(/^ □ docs-local\s+未配置\s+已配置\s/m);
    expect(startOf(list, 'alpha', '未装')).toBe(startOf(list, '名称', 'Claude Code'));
    expect(startOf(list, 'docs-local', '未配置')).toBe(startOf(list, '名称', 'Claude Code'));
    expect(startOf(list, 'alpha', '非本工具安装')).toBe(startOf(list, '名称', 'Codex'));
    expect(startOf(list, 'docs-local', '已配置')).toBe(startOf(list, '名称', 'Codex'));
  });

  it('不可选的 MCP 的原因比一栏状态宽：状态栏撑到放得下它，各行的说明仍从同一列起', async () => {
    const claudeOnly = { ...SAMPLE_MCPS[0], name: 'claude-only', hosts: ['claude-code'] };
    const result = await run({
      catalog: mixed({ mcps: [claudeOnly, SAMPLE_MCPS[0]] }),
      onPath: ['codex'],
      answers: [choose(WEB_SEARCH), pick(), choose('退出')],
    });
    const list = result.output.split(QUESTION)[1] ?? '';
    const about = startOf(list, '名称', '说明');

    // 原因是这一栏里最长的一格：它后面恰好是栏间隔，再是说明
    expect(list).toMatch(/^ – claude-only\s+需要别的 AI Agent {3}本地进程方式的样例 MCP/m);
    expect(startOf(list, 'docs-local', '本地进程方式')).toBe(about);
    expect(startOf(list, 'alpha', '推荐 · ')).toBe(about);
    expect(Math.max(...list.split('\n').filter((line) => /^ [□–] /.test(line)).map(displayWidth))).toBeLessThanOrEqual(79);
  });

  it('读不到宿主的配置：列表上方说明，MCP 在那一栏是未知，skill 的状态照常', async () => {
    const result = await run({ catalog: mixed(), home: { '.claude.json': '{ 写坏了' }, answers: [choose(WEB_SEARCH), pick(), choose('退出')] });

    expect(result.output).toMatch(/^\s+注意\s+读不到 Claude Code 的配置，无法判断哪些 MCP 已配置\n\n\? 选择要安装的条目$/m);
    expect(result.output).toMatch(/^ □ alpha\s+未装\s/m);
    expect(result.output).toMatch(/^ □ docs-local\s+未知\s/m);
    expect(result.stderr).toBe('');
  });

  it('列表里没有 MCP 时，宿主的配置读不了也不提', async () => {
    const result = await run({ catalog: mixed({ mcps: [] }), home: { '.claude.json': '{ 写坏了' }, answers: [choose(WEB_SEARCH), pick(), choose('退出')] });

    expect(result.output).not.toContain('读不到');
  });

  it('一个宿主都没检测到：skill 和 MCP 都不可选，外部项目照常', async () => {
    const result = await run({ catalog: mixed(), onPath: [], answers: [choose(WEB_SEARCH), pick('borealis'), choose('退出')] });

    expect(result.output).toMatch(/^\s+名称\s+状态\s+说明\n\s+── Skill\n – alpha\s+需要 AI Agent\s.*\n\s+── MCP\n – docs-local\s+需要 AI Agent\s/m);
    expect(result.output).toContain('外部项目：1 个，只给链接');
    expect(result.commands).toEqual([]);
  });
});

describe('一次勾选 skill、MCP 和外部项目', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('汇总里组件都有，skill 先装、MCP 后装，结果各一行，最后是外部项目的链接', async () => {
    const result = await run({ catalog: mixed(), answers: all });

    inOrder(result.screen, [
      '将安装 2 项',
      '将执行 1 条命令',
      '? 开始安装吗',
      '已安装 1.0.0',
      '已配置',
      '2 成功 · 0 失败 · 0 跳过',
      '外部项目：1 个，只给链接',
      'https://example.org/borealis',
    ]);
    expect(result.output).toMatch(/^\s+✓\s+alpha\s+Claude Code\s+已安装 1\.0\.0$/m);
    expect(result.output).toMatch(/^\s+✓\s+docs-local\s+Claude Code\s+已配置$/m);
    expect(existsSync(join(result.home, '.claude/skills/alpha/SKILL.md'))).toBe(true);
    expect(result.commands).toEqual([CLAUDE_ADD_LOCAL]);
    expect(result.opened).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  it('汇总按类型分成小表，表头第一栏是类型；外部项目不在里面', async () => {
    const result = await run({ catalog: mixed(), answers: all });
    const summary = summaryOf(result.output);

    expect(summary).toMatch(/^── 将安装 2 项 ─+$/m);
    expect(summary).toMatch(/^\s+Skill\s+AI Agent\s+操作\s+位置\n\s+alpha\s+Claude Code\s+新装\s+~\S+alpha\n\n\s+MCP\s+AI Agent\s+操作\n\s+docs-local\s+Claude Code\s+新装$/m);
    expect(summary).not.toContain('borealis');
  });

  it('将执行的命令只有 MCP 的，完整展示；展示的和之后执行的是同一条', async () => {
    const result = await run({ catalog: mixed(), answers: all });

    expect(summaryOf(result.output)).toMatch(/^── 将执行 1 条命令 ─+\n\n\s+1\s+claude mcp add --scope user docs-local -- npx -y @example\/docs-mcp@latest$/m);
    expect(result.commands).toEqual([CLAUDE_ADD_LOCAL]);
  });

  it('两个宿主：每个条目在每个宿主下各一行，skill 的各行都排在 MCP 之前', async () => {
    const result = await run({ catalog: mixed(), onPath: BOTH_HOSTS, answers: [choose(WEB_SEARCH), accept(), pick('alpha', 'docs-local'), choose('开始安装'), choose('退出')] });

    expect(result.screen).toMatch(
      /✓\s+alpha\s+Claude Code\s+已安装 1\.0\.0\n\s+✓\s+alpha\s+Codex\s+已安装 1\.0\.0\n\s+✓\s+docs-local\s+Claude Code\s+已配置\n\s+✓\s+docs-local\s+Codex\s+已配置\n/,
    );
    expect(result.screen).toMatch(/^\s+合计\s+4 成功 · 0 失败 · 0 跳过$/m);
    expect(result.commands).toEqual([CLAUDE_ADD_LOCAL, CODEX_ADD_LOCAL]);
  });

  it('确认之前什么都不做：取消则不装 skill、不执行命令，外部项目也不列', async () => {
    const result = await run({ catalog: mixed(), answers: [choose(WEB_SEARCH), pick('alpha', 'docs-local', 'borealis'), choose('取消'), choose('退出')] });

    expect(result.output).toContain('claude mcp add --scope user docs-local');
    expect(result.commands).toEqual([]);
    expect(readdirSync(result.home)).toEqual([]);
    expect(result.output).not.toContain('外部项目：');
    expect(result.output).not.toContain('正在安装');
  });

  it('返回修改：三种类型的勾选都还在', async () => {
    const result = await run({
      catalog: mixed(),
      answers: [choose(WEB_SEARCH), pick('alpha', 'docs-local', 'borealis'), choose('返回修改'), accept(), choose('取消'), choose('退出')],
    });
    const again = result.output.split(QUESTION)[2] ?? '';

    expect(again).toMatch(/^ ■ alpha\s/m);
    expect(again).toMatch(/^ ■ docs-local\s/m);
    expect(again).toMatch(/^ ■ borealis\s/m);
  });

  it('MCP 的命令失败不影响 skill 和外部项目，失败的写法不变', async () => {
    const result = await run({ catalog: mixed(), commandResult: () => ({ exitCode: 1 }), answers: all });

    expect(result.output).toMatch(/^\s+✓\s+alpha\s+Claude Code\s+已安装 1\.0\.0$/m);
    expect(result.output).toMatch(/^\s+✗\s+docs-local\s+Claude Code\s+失败 添加命令退出状态 1$/m);
    expect(result.output).toMatch(/^\s+合计\s+1 成功 · 1 失败 · 0 跳过$/m);
    expect(result.output).toContain('外部项目：1 个，只给链接');
    expect(result.output).not.toMatch(STACK_FRAME);
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });

  it('skill 下载失败不影响 MCP', async () => {
    const result = await run({ catalog: catalogDir({ catalog: MIXED, content: {} }), answers: all });

    expect(result.output).toMatch(/^\s+✗\s+alpha\s+Claude Code\s+失败 /m);
    expect(result.output).toMatch(/^\s+✓\s+docs-local\s+Claude Code\s+已配置$/m);
    expect(result.commands).toEqual([CLAUDE_ADD_LOCAL]);
  });

  it('没同意覆盖的 skill 跳过，MCP 照常', async () => {
    const result = await run({
      catalog: mixed(),
      home: { '.claude/skills/alpha/SKILL.md': '别处装的\n' },
      answers: [choose(WEB_SEARCH), pick('alpha', 'docs-local'), choose('开始安装'), no(), choose('退出')],
    });

    expect(result.output).toMatch(/alpha\s+Claude Code\s+跳过 未同意覆盖，保持原样/);
    expect(result.output).toMatch(/^\s+✓\s+docs-local\s+Claude Code\s+已配置$/m);
    expect(result.commands).toEqual([CLAUDE_ADD_LOCAL]);
  });

  it('向 GitHub 查询失败：skill 一个都不装，MCP 照常装，外部项目照常列出', async () => {
    fakeGitHub({
      intercept: (url) =>
        url.includes('api.github.com')
          ? Response.json({ message: 'API rate limit exceeded' }, { status: 403, headers: { 'x-ratelimit-remaining': '0' } })
          : url.endsWith('/main/catalog.json')
            ? Response.json(MIXED)
            : undefined,
    });

    const result = await run({ catalog: githubCatalogSource(), answers: all });

    expect(result.stderr).toContain('出错：GitHub 限流');
    expect(existsSync(join(result.home, '.claude'))).toBe(false);
    expect(result.output).not.toMatch(/alpha\s+Claude Code\s+(已安装|失败|跳过)/);
    expect(result.output).toMatch(/^\s+✓\s+docs-local\s+Claude Code\s+已配置$/m);
    expect(result.output).toMatch(/^\s+合计\s+1 成功 · 0 失败 · 0 跳过$/m);
    expect(result.output.indexOf('外部项目：1 个，只给链接')).toBeGreaterThan(result.output.indexOf('合计'));
    expect(result.exitCode).toBe(0);
  });
});

describe('汇总里的提醒', () => {
  const keyed = (): string => mixed({ mcps: [KEYED_MCP, SAMPLE_MCPS[0]] });

  it('覆盖的提醒排在将执行的命令之后；几行「注意」挨着', async () => {
    const result = await run({
      catalog: keyed(),
      home: { '.claude/skills/alpha/SKILL.md': '别处装的\n' },
      answers: [choose(WEB_SEARCH), pick('alpha', 'search-keyed'), secret('sk-test'), choose('取消'), choose('退出')],
    });

    expect(summaryOf(result.screen)).toMatch(
      /SEARCH_API_KEY=<SEARCH_API_KEY> -- npx -y @example\/search-mcp\n\n\s+注意\s+覆盖即整目录替换，目录内的本地改动会丢失\n\s+注意\s+key 以占位符显示，执行时才代入真实的值\n\n$/,
    );
  });

  it('备注放不放得下只看有备注的行：skill 的位置再长，MCP 的备注放得下就仍在行尾', async () => {
    // skill 那张小表的位置一栏已经超出一行，但它没有备注
    const name = 'a-skill-with-a-very-long-name-xx';
    const result = await run({
      catalog: catalogDir({
        index: { version: 1, skills: [{ name, version: '1.0.0', path: `skills/${name}`, description: { zh: '名字很长的样例 skill', en: 'A sample skill with a long name' } }] },
        catalog: { ...MIXED, skillPurposes: { [name]: 'web-search' } },
        content: { [`skills/${name}/SKILL.md`]: '# long\n' },
      }),
      home: { '.claude.json': JSON.stringify({ mcpServers: { 'docs-local': {} } }) },
      answers: [choose(WEB_SEARCH), pick(name, 'docs-local'), choose('取消'), choose('退出')],
    });
    const summary = summaryOf(result.output);

    expect(summary).toMatch(new RegExp(`^\\s+${name}\\s+Claude Code\\s+新装\\s+~\\S+${name}$`, 'm'));
    expect(summary).toMatch(/^\s+MCP\s+AI Agent\s+操作\s+备注$/m);
    expect(summary).toMatch(/^\s+docs-local\s+Claude Code\s+覆盖\s+已配置，先移除再添加$/m);
  });

  it('必填的 key 没填的 MCP 不在汇总里，也不算进「将安装 N 项」；结果里它是跳过', async () => {
    const result = await run({
      catalog: keyed(),
      answers: [choose(WEB_SEARCH), pick('alpha', 'search-keyed', 'docs-local'), blank(), choose('开始安装'), choose('退出')],
    });
    const summary = summaryOf(result.output);

    expect(summary).toMatch(/^── 将安装 2 项 ─+$/m);
    expect(summary).not.toMatch(/^\s+search-keyed\s+Claude Code/m);
    expect(summary).toMatch(/^\s+注意\s+search-keyed 缺少必填的 SEARCH_API_KEY，这次不安装$/m);
    expect(result.output).toMatch(/^\s+–\s+search-keyed\s+Claude Code\s+跳过 未填写必填的 SEARCH_API_KEY$/m);
    expect(result.output).toMatch(/^\s+合计\s+2 成功 · 0 失败 · 1 跳过$/m);
  });

  it('只剩 skill 要装时没有「将执行的命令」，没填 key 的那个照样提醒', async () => {
    const result = await run({ catalog: keyed(), answers: [choose(WEB_SEARCH), pick('alpha', 'search-keyed'), blank(), choose('取消'), choose('退出')] });
    const summary = summaryOf(result.output);

    expect(summary).toMatch(/^── 将安装 1 项 ─+$/m);
    expect(summary).not.toContain('将执行');
    expect(summary).not.toMatch(/^\s+MCP\s+AI Agent/m);
    expect(summary).toMatch(/^\s+注意\s+search-keyed 缺少必填的 SEARCH_API_KEY，这次不安装$/m);
  });

  it('勾上的组件全是没填 key 的 MCP：不问开始不开始，结果之后照常列出外部项目', async () => {
    const result = await run({ catalog: keyed(), answers: [choose(WEB_SEARCH), pick('search-keyed', 'borealis'), blank(), choose('退出')] });

    expect(result.output).not.toContain('将安装');
    expect(result.output).not.toContain('开始安装吗');
    inOrder(result.screen, ['跳过 未填写必填的 SEARCH_API_KEY', '0 成功 · 0 失败 · 1 跳过', '外部项目：1 个，只给链接']);
    expect(result.commands).toEqual([]);
  });
});

describe('四种类型同表：工具和别的类型一起勾选、一起装', () => {
  afterEach(() => vi.unstubAllGlobals());

  // 「联网搜索与文档检索」下四种类型各有一条：alpha（skill）、docs-local（MCP）、fetcher（工具）、borealis（外部项目）
  const withTool = (catalog: Record<string, unknown> = {}): string => mixed({ tools: SAMPLE_TOOLS, ...catalog });
  // 整行交给 shell，一字不差
  const FETCHER_COMMAND = { command: 'curl -LsSf https://example.com/fetcher/install.sh | sh', args: [], shell: true };
  const everything = [choose(WEB_SEARCH), pick('alpha', 'docs-local', 'fetcher', 'borealis'), choose('开始安装'), choose('退出')];
  // 假装装好了：往可执行路径里放一个 fetcher。那个目录里先有 claude（检测到一个宿主）
  const installsFetcher = (): { env: { PATH: string }; commandResult: (command: string) => undefined } => {
    const dir = tempDir('path');
    writeFileSync(join(dir, 'claude'), '', { mode: 0o755 });
    return {
      env: { PATH: dir },
      commandResult: (command) => void (command.startsWith('curl') && writeFileSync(join(dir, 'fetcher'), '', { mode: 0o755 })),
    };
  };

  it('列表里依次是 Skill、MCP、工具三段，外部项目在最下面', async () => {
    const result = await run({ catalog: withTool(), answers: [choose(WEB_SEARCH), pick(), choose('退出')] });

    expect(result.output).toMatch(/^\s+联网搜索与文档检索\s+4$/m);
    expect(result.output).toMatch(
      /^\s+名称\s+Claude Code\s+说明\n\s+── Skill\n □ alpha\s.*\n\s+── MCP\n □ docs-local\s.*\n\s+── 工具\n □ fetcher\s+未安装\s+第一个样例工具.*…\n\n\s+── 外部项目 · 只给链接，不安装\n □ borealis\s+第二个样例外部项目$/m,
    );
  });

  it('两个宿主：工具只有一个状态，写在第一栏状态的位置；它的说明和别的行从同一列起', async () => {
    const startOf = (list: string, name: string, text: string): number => {
      const line = list.split('\n').find((candidate) => new RegExp(`^ ?[□■–]? *${name}\\s`).test(candidate)) ?? '';
      return displayWidth(line.slice(0, line.indexOf(text)));
    };
    const result = await run({ catalog: withTool(), onPath: BOTH_HOSTS, answers: [choose(WEB_SEARCH), accept(), pick(), pick(), choose('退出')] });
    const list = result.output.split(QUESTION)[1] ?? '';

    expect(list).toMatch(/^ □ fetcher\s+未安装\s+第一个样例工具/m);
    expect(startOf(list, 'fetcher', '未安装')).toBe(startOf(list, '名称', 'Claude Code'));
    expect(startOf(list, 'fetcher', '第一个样例工具')).toBe(startOf(list, '名称', '说明'));
    expect(startOf(list, 'docs-local', '本地进程方式')).toBe(startOf(list, '名称', '说明'));
  });

  it('工具的状态和可不可选与选了哪些宿主无关：只选 Codex，要 Claude Code 的工具照样可选', async () => {
    const claudeOnly = { ...SAMPLE_TOOLS[0], hosts: ['claude-code'] };
    const result = await run({
      catalog: withTool({ tools: [claudeOnly] }),
      onPath: BOTH_HOSTS,
      // 宿主那一问只勾 Codex
      answers: [choose(WEB_SEARCH), pick('Codex'), pick(), pick(), choose('退出')],
    });

    expect(result.output.split(QUESTION)[1]).toMatch(/^ □ fetcher\s+未安装\s/m);
  });

  it('汇总里三张小表依次是 Skill、MCP、工具；将执行的命令先是 MCP 的再是工具的；外部项目不在里面', async () => {
    const result = await run({ catalog: withTool(), answers: everything });
    const summary = summaryOf(result.output);

    expect(summary).toMatch(/^── 将安装 3 项 ─+$/m);
    expect(summary).toMatch(
      /^\s+Skill\s+AI Agent\s+操作\s+位置\n\s+alpha\s+Claude Code\s+新装\s+~\S+alpha\n\n\s+MCP\s+AI Agent\s+操作\n\s+docs-local\s+Claude Code\s+新装\n\n\s+工具\s+操作\n\s+fetcher\s+执行安装命令$/m,
    );
    expect(summary).toMatch(
      /^── 将执行 2 条命令 ─+\n\n\s+1\s+claude mcp add --scope user docs-local -- npx -y @example\/docs-mcp@latest\n\s+2\s+curl -LsSf https:\/\/example\.com\/fetcher\/install\.sh \| sh$/m,
    );
    expect(summary).not.toContain('borealis');
  });

  it('skill 先装、MCP 其次、工具最后；结果各一行，最后是外部项目的链接，没有调用链接打开器', async () => {
    const result = await run({ catalog: withTool(), ...installsFetcher(), answers: everything });

    inOrder(result.screen, [
      '? 开始安装吗',
      '── 正在安装 ─',
      '已安装 1.0.0',
      '已配置',
      '── fetcher ─',
      '$ curl -LsSf https://example.com/fetcher/install.sh | sh',
      '已可用，在 PATH 中找到 fetcher',
      '── 结果 ─',
      '3 成功 · 0 失败 · 0 跳过',
      '外部项目：1 个，只给链接',
      'https://example.org/borealis',
    ]);
    expect(existsSync(join(result.home, '.claude/skills/alpha/SKILL.md'))).toBe(true);
    expect(result.commands).toEqual([CLAUDE_ADD_LOCAL, FETCHER_COMMAND]);
    expect(result.opened).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  it('有工具时最后的「结果」分区把每一行再列一遍：skill、MCP、工具各一行，工具的那一行没有宿主', async () => {
    const result = await run({ catalog: withTool(), ...installsFetcher(), answers: everything });
    const recap = result.screen.slice(result.screen.lastIndexOf('── 结果 ─'));

    expect(recap).toMatch(
      /^── 结果 ─+\n\n\s+✓\s+alpha\s+Claude Code\s+已安装 1\.0\.0\n\s+✓\s+docs-local\s+Claude Code\s+已配置\n\s+✓\s+fetcher\s+已可用，在 PATH 中找到 fetcher\n\n─+\n\s+合计\s+3 成功 · 0 失败 · 0 跳过$/m,
    );
    // 工具自己分区里的那一行还在：结论出现两次
    expect(result.screen.split('已可用，在 PATH 中找到 fetcher')).toHaveLength(3);
  });

  it('工具没装上不影响 skill、MCP 和外部项目；MCP 的命令失败也不影响工具', async () => {
    const result = await run({ catalog: withTool(), commandResult: () => ({ exitCode: 1 }), answers: everything });

    expect(result.output).toMatch(/^\s+✓\s+alpha\s+Claude Code\s+已安装 1\.0\.0$/m);
    expect(result.output).toMatch(/^\s+✗\s+docs-local\s+Claude Code\s+失败 添加命令退出状态 1$/m);
    expect(result.output).toMatch(/^\s+✗\s+fetcher\s+失败 命令退出状态 1；在 PATH 中找不到 fetcher$/m);
    expect(result.output).toMatch(/^\s+合计\s+1 成功 · 2 失败 · 0 跳过$/m);
    expect(result.commands).toEqual([CLAUDE_ADD_LOCAL, FETCHER_COMMAND]);
    expect(result.output).toContain('外部项目：1 个，只给链接');
    expect(result.output).not.toMatch(STACK_FRAME);
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });

  it('确认之前什么都不做：取消则工具的命令也不执行', async () => {
    const result = await run({ catalog: withTool(), answers: [choose(WEB_SEARCH), pick('alpha', 'docs-local', 'fetcher'), choose('取消'), choose('退出')] });

    expect(result.output).toContain(FETCHER_COMMAND.command);
    expect(result.commands).toEqual([]);
    expect(readdirSync(result.home)).toEqual([]);
  });

  it('返回修改：工具的勾选也还在', async () => {
    const result = await run({
      catalog: withTool(),
      answers: [choose(WEB_SEARCH), pick('alpha', 'fetcher', 'borealis'), choose('返回修改'), accept(), choose('取消'), choose('退出')],
    });
    const again = result.output.split(QUESTION)[2] ?? '';

    expect(again).toMatch(/^ ■ alpha\s/m);
    expect(again).toMatch(/^ □ docs-local\s/m);
    expect(again).toMatch(/^ ■ fetcher\s/m);
    expect(again).toMatch(/^ ■ borealis\s/m);
  });

  it('向 GitHub 查询失败：skill 一个都不装，MCP 和工具照常', async () => {
    fakeGitHub({
      intercept: (url) =>
        url.includes('api.github.com')
          ? Response.json({ message: 'API rate limit exceeded' }, { status: 403, headers: { 'x-ratelimit-remaining': '0' } })
          : url.endsWith('/main/catalog.json')
            ? Response.json({ ...MIXED, tools: SAMPLE_TOOLS })
            : undefined,
    });

    const result = await run({ catalog: githubCatalogSource(), answers: everything });

    expect(result.stderr).toContain('出错：GitHub 限流');
    expect(result.output).not.toMatch(/alpha\s+Claude Code\s+(已安装|失败|跳过)/);
    expect(result.commands).toEqual([CLAUDE_ADD_LOCAL, FETCHER_COMMAND]);
    expect(result.output).toMatch(/^\s+合计\s+1 成功 · 1 失败 · 0 跳过$/m);
  });

  it('只勾了一个工具和一个外部项目：没有「正在安装」分区，结论不重复，之后是外部项目的链接', async () => {
    const result = await run({ catalog: withTool(), answers: [choose(WEB_SEARCH), pick('fetcher', 'borealis'), choose('开始安装'), choose('退出')] });

    expect(result.output).toMatch(/^── 将安装 1 项 ─+$/m);
    expect(result.output).not.toContain('正在安装');
    expect(result.output).not.toMatch(/^── 结果 ─/m);
    inOrder(result.screen, ['── fetcher ─', '0 成功 · 1 失败 · 0 跳过', '外部项目：1 个，只给链接']);
  });

  it('没同意覆盖的 skill 跳过，工具照常；「结果」里跳过的那一行也在', async () => {
    const result = await run({
      catalog: withTool(),
      home: { '.claude/skills/alpha/SKILL.md': '别处装的\n' },
      answers: [choose(WEB_SEARCH), pick('alpha', 'fetcher'), choose('开始安装'), no(), choose('退出')],
    });
    const recap = result.screen.slice(result.screen.lastIndexOf('── 结果 ─'));

    expect(recap).toMatch(/alpha\s+Claude Code\s+跳过 未同意覆盖，保持原样\n\s+✗\s+fetcher\s+失败 /);
    expect(result.commands).toEqual([FETCHER_COMMAND]);
    expect(recap).toMatch(/^\s+合计\s+0 成功 · 1 失败 · 1 跳过$/m);
  });
});
