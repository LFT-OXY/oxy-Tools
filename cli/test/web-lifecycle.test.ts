import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SummaryView, ViewState } from '../src/web-protocol.ts';
import { KEY, STACK_FRAME, catalogDir, choose, heldCatalog, pick, run, type Page } from './harness.ts';
import { LANGUAGE_QUESTION } from './terminal.ts';

const CLAUDE_SKILLS = '.claude/skills';
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
// 终端上待命的那一行按键提示
const HINT = /^\s+t 改用终端界面 · Ctrl\+C 退出$/m;
const CLOSED = /^\s*网页界面\s+页面已关闭，安装器退出$/m;
// 架子缺省的时限（页面全都断开之后等多久）之后再多等一会儿
const PAST_GRACE = 400;
// 正常收场：点「完成」，等安装器把连接收掉
const done = async (page: Page): Promise<void> => {
  await page.send({ type: 'finish' });
  await page.closed;
};
const tick = async (page: Page, name: string): Promise<ViewState> => {
  await page.send({ type: 'pick', kind: 'skill', name, on: true });
  return page.until((state) => state.selected.some((entry) => entry.name === name));
};
const review = async (page: Page): Promise<SummaryView> => {
  await page.send({ type: 'review' });
  return (await page.until((state) => state.summary !== undefined)).summary as SummaryView;
};
// 勾上这几个 skill、确认安装，停在查询卡住的地方
const startInstalling = async (page: Page, ...names: string[]): Promise<void> => {
  for (const name of names) await tick(page, name);
  const summary = await review(page);
  const loading = page.until((state) => state.run?.loading !== undefined);
  await page.send({ type: 'install', summary: summary.id });
  await loading;
};
// 终端上的结果行和合计那一行。终端界面的「结果」标题是回头改写上去的，在记下的输出里排在各行后面，所以不按标题去切
const resultLines = (screen: string): string[] => screen.split('\n').filter((line) => /^\s+[✓✗–]\s+\S/.test(line) || /^\s+合计\s/.test(line));

describe('网页界面：页面关了', () => {
  it('连上过之后所有页面都断开满时限：终端上一行说明，安装器以 0 退出，按键提示没有留在画面上', async () => {
    const result = await run({
      page: async (page) => {
        page.close();
        await page.closed;
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.screen).toMatch(CLOSED);
    expect(result.screen).not.toMatch(/Ctrl\+C/);
    await expect(fetch(result.opened[0] ?? '')).rejects.toThrow();
  });

  it('页面还没有连上过：过了时限也不退出，一直等着', async () => {
    const controller = new AbortController();
    // 链接打开器兑现了，却没有页面来连（浏览器没有弹出来）
    setTimeout(() => controller.abort(), PAST_GRACE);
    const result = await run({ web: true, pageGraceMs: 30, interrupt: controller.signal });

    // 是被这里的 Ctrl+C 结束的，不是自己退出的：自己退出的话是 0，终端上有那一行说明
    expect(result.exitCode).toBe(130);
    expect(result.opened).toHaveLength(1);
    expect(result.output).not.toContain('页面已关闭');
    expect(result.output).toMatch(HINT);
  });

  it('时限之内重新连上（刷新）：当没断过，安装器照常开着', async () => {
    let before: ViewState | undefined;
    let after: ViewState | undefined;
    const result = await run({
      pageGraceMs: 600,
      page: async (page) => {
        before = await tick(page, 'alpha');
        page.close();
        await sleep(50);
        after = await page.reload();
        // 断开的那一下起的时限早就过了；安装器还开着，「完成」才有人接
        await sleep(800);
        await done(page);
      },
    });

    expect(after).toEqual(before);
    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain('页面已关闭');
  });

  it('刷新之后回到刷新前的样子：所在的用途、勾选、宿主和范围、走到汇总这一步都在', async () => {
    let before: ViewState | undefined;
    let after: ViewState | undefined;
    await run({
      onPath: ['claude', 'codex'],
      catalog: catalogDir({ catalog: { version: 1, purposes: [{ id: 'docs', name: { zh: '文档处理', en: 'Documents' } }], skillPurposes: { 'beta-pack': 'docs' } } }),
      page: async (page) => {
        await tick(page, 'alpha');
        await page.send({ type: 'open', list: 'purpose:docs' });
        await tick(page, 'beta-pack');
        await page.send({ type: 'host', host: 'codex', on: false });
        await page.send({ type: 'scope', scope: 'project' });
        await page.send({ type: 'lang', lang: 'en' });
        await review(page);
        before = page.state();
        page.close();
        after = await page.reload();
        await page.send({ type: 'revise' });
        await done(page);
      },
    });

    expect(before).toMatchObject({
      lang: 'en',
      listing: { id: 'purpose:docs' },
      target: { hosts: ['Claude Code'], scope: 'project' },
      selected: [{ name: 'alpha' }, { name: 'beta-pack' }],
      summary: { entries: [{ name: 'alpha' }, { name: 'beta-pack' }] },
    });
    expect(after).toEqual(before);
  });

  it('安装中刷新：新连上的页面看到的是当前的进度', async () => {
    const { catalog, release } = heldCatalog();
    let before: ViewState | undefined;
    let after: ViewState | undefined;
    await run({
      catalog,
      page: async (page) => {
        await startInstalling(page, 'alpha');
        before = page.state();
        page.close();
        after = await page.reload();
        release();
        await page.until((state) => state.run?.done === true);
        await done(page);
      },
    });

    expect(before?.run).toMatchObject({ title: '正在安装', done: false, rows: [{ name: 'alpha', text: '等待' }] });
    expect(after).toEqual(before);
  });

  it('安装中所有页面都断开满时限：这一批照样装完，结果照终端界面「结果」分区的样子打在终端上，以 0 退出', async () => {
    // alpha 的内容里没有 SKILL.md：结果里一行失败、一行成功
    const content = { 'skills/alpha/README.md': '少了入口文件', 'skills/beta-pack/SKILL.md': '# beta-pack\n' };
    const { catalog, release } = heldCatalog(catalogDir({ content }));
    const result = await run({
      catalog,
      page: async (page, { terminal }) => {
        await startInstalling(page, 'alpha', 'beta-pack');
        page.close();
        await sleep(PAST_GRACE);
        // 时限满了，这一批还没装完：安装器等着它
        expect(terminal.screen()).not.toContain('页面已关闭');
        release();
      },
    });
    // 用终端界面装同样的东西，结果行和合计应当一字不差
    const viaTerminal = await run({
      catalog: catalogDir({ content }),
      answers: [choose('推荐'), pick('alpha', 'beta-pack'), choose('开始安装'), choose('退出')],
    });

    expect(result.exitCode).toBe(0);
    expect(readdirSync(join(result.home, CLAUDE_SKILLS))).toEqual(['beta-pack']);
    expect(result.screen).toMatch(/^\s*网页界面\s+页面已关闭；这一批照样装完了，结果如下$/m);
    expect(resultLines(result.screen)).toEqual([
      expect.stringMatching(/^\s+✗\s+alpha\s+Claude Code\s+失败 来源里没有 SKILL\.md，目标目录未改动$/),
      expect.stringMatching(/^\s+✓\s+beta-pack\s+Claude Code\s+已安装 2\.3$/),
      expect.stringMatching(/^\s+合计\s+1 成功 · 1 失败 · 0 跳过$/),
    ]);
    expect(resultLines(result.screen)).toEqual(resultLines(viaTerminal.screen));
    // 没有进行中的那一行，说明排在结果前面
    expect(result.output).not.toContain('正在安装');
    expect(result.screen.indexOf('页面已关闭')).toBeLessThan(result.screen.indexOf('── 结果 ─'));
    expect(result.screen.indexOf('── 结果 ─')).toBeLessThan(result.screen.indexOf('✗  alpha'));
    expect(result.screen).not.toMatch(/Ctrl\+C/);
    expect(result.output).not.toMatch(STACK_FRAME);
  });

  it('安装中页面关了，装完之前又连回来：当没断过，结果在页面上，终端上不打', async () => {
    const { catalog, release } = heldCatalog();
    let results: ViewState | undefined;
    const result = await run({
      catalog,
      page: async (page) => {
        await startInstalling(page, 'alpha');
        page.close();
        await sleep(PAST_GRACE);
        await page.reload();
        release();
        results = await page.until((state) => state.run?.done === true);
        // 连回来之后安装器不因为刚才断过而退出：「完成」还有人接
        await sleep(PAST_GRACE);
        await done(page);
      },
    });

    expect(results?.run?.rows).toEqual([{ name: 'alpha', host: 'Claude Code', state: 'succeeded', text: '已安装', rest: '1.0.0' }]);
    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain('页面已关闭');
    expect(result.output).not.toContain('── 结果 ─');
  });

  it('页面关了不到时限这一批就装完了，页面再没回来：结果同样打在终端上', async () => {
    const { catalog, release } = heldCatalog();
    const result = await run({
      catalog,
      page: async (page) => {
        await startInstalling(page, 'alpha');
        page.close();
        await page.closed;
        release();
      },
    });

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(result.home, CLAUDE_SKILLS, 'alpha', 'SKILL.md'))).toBe(true);
    expect(resultLines(result.screen)).toEqual([
      expect.stringMatching(/^\s+✓\s+alpha\s+Claude Code\s+已安装 1\.0\.0$/),
      expect.stringMatching(/^\s+合计\s+1 成功 · 0 失败 · 0 跳过$/),
    ]);
  });

  it('结果已经在页面上看过了再关页面：终端上只有那一行说明，不重打结果', async () => {
    const result = await run({
      page: async (page) => {
        await tick(page, 'alpha');
        const summary = await review(page);
        await page.send({ type: 'install', summary: summary.id });
        await page.until((state) => state.run?.done === true);
        page.close();
        await page.closed;
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.screen).toMatch(CLOSED);
    expect(result.output).not.toContain('── 结果 ─');
  });
});

describe('网页界面：终端上的待命', () => {
  it('网页界面开着时终端上有按键提示；点了「完成」它不留在画面上，换成一行说明', async () => {
    let open = '';
    const result = await run({
      page: async (page, { terminal }) => {
        open = terminal.screen();
        await done(page);
      },
    });

    const lines = open.split('\n');
    const url = lines.findIndex((line) => line.trim() === result.opened[0]);
    expect(lines.slice(url + 1)).toEqual(['', expect.stringMatching(HINT)]);
    expect(result.exitCode).toBe(0);
    const left = result.screen.split('\n');
    expect(left.slice(left.findIndex((line) => line.trim() === result.opened[0]) + 1)).toEqual(['', expect.stringMatching(/^\s+网页界面\s+页面上点了「完成」，安装器退出$/), '']);
  });

  it('英文：按键提示和收场的那一行', async () => {
    let open = '';
    const result = await run({
      argv: ['--lang', 'en'],
      page: async (page, { terminal }) => {
        open = terminal.screen();
        page.close();
        await page.closed;
      },
    });

    expect(open).toMatch(/^\s+t use the terminal UI · Ctrl\+C quit$/m);
    expect(result.screen).toMatch(/^\s*Web UI\s+The page was closed; quitting$/m);
  });

  it('待命时按 Ctrl+C：以 130 退出，页面的连接断了，没有收场的那一行', async () => {
    let last: ViewState | undefined;
    const result = await run({
      page: async (page, { terminal }) => {
        terminal.press(KEY.ctrlC);
        await page.closed;
        last = page.state();
      },
    });

    expect(result.exitCode).toBe(130);
    expect(last?.stage).toBe('open');
    expect(result.screen).not.toMatch(/安装器退出|已改用终端界面|Ctrl\+C/);
    await expect(fetch(result.opened[0] ?? '')).rejects.toThrow();
  });

  it('安装进行中终端上没有待命的提问，装完它回来', async () => {
    const { catalog, release } = heldCatalog();
    await run({
      catalog,
      page: async (page, { terminal }) => {
        expect(terminal.screen()).toMatch(HINT);
        await startInstalling(page, 'alpha');
        expect(terminal.screen()).not.toMatch(/Ctrl\+C/);
        // 没有人在等按键
        expect(() => terminal.press('t')).toThrow(/没有待命的提问/);
        release();
        await page.until((state) => state.run?.done === true);
        expect(terminal.screen()).toMatch(HINT);
        // 页面开着的时候这一批的进度不打在终端上
        expect(terminal.screen()).not.toMatch(/正在安装|── 结果 ─|已安装/);
        await done(page);
      },
    });
  });
});

describe('网页界面：按 t 改用终端界面', () => {
  it('页面得知已改用终端界面；终端上一行说明，接着是语言提问和主菜单；页面上的勾选丢弃，照常用终端界面装一个 skill', async () => {
    let switched: ViewState | undefined;
    const result = await run({
      page: async (page, { terminal }) => {
        await tick(page, 'beta-pack');
        const told = page.until((state) => state.stage === 'terminal');
        terminal.press('t');
        switched = await told;
        await page.closed;
      },
      answers: [choose('推荐'), pick('alpha'), choose('开始安装'), choose('退出')],
    });

    expect(switched?.stage).toBe('terminal');
    expect(result.exitCode).toBe(0);
    const said = result.output.indexOf('已改用终端界面');
    const language = result.output.indexOf(LANGUAGE_QUESTION);
    expect(said).toBeGreaterThan(result.output.indexOf('已在浏览器打开'));
    expect(language).toBeGreaterThan(said);
    expect(result.output.indexOf('选择用途')).toBeGreaterThan(language);
    expect(result.screen).toMatch(/^\s+网页界面\s+已改用终端界面$/m);
    expect(result.screen).not.toMatch(/Ctrl\+C/);
    // 目录不重读，本机信息不重打
    expect(result.output.match(/^\s*目录\s/gm)).toHaveLength(1);
    // 页面上勾的 beta-pack 没有跟过来：列表里它没勾着，装上的只有在终端界面里勾的 alpha
    expect(result.output).toMatch(/^\s*□ beta-pack/m);
    expect(readdirSync(join(result.home, CLAUDE_SKILLS))).toEqual(['alpha']);
    expect(result.opened).toHaveLength(1);
    await expect(fetch(result.opened[0] ?? '')).rejects.toThrow();
  });

  it('带了 --lang 就不问语言：说明下面空一行直接是主菜单', async () => {
    const result = await run({
      argv: ['--lang', 'en'],
      page: async (page, { terminal }) => {
        terminal.press('t');
        await page.closed;
      },
      answers: [choose('Exit')],
    });

    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain(LANGUAGE_QUESTION);
    const lines = result.screen.split('\n');
    const said = lines.findIndex((line) => /^\s+Web UI\s+Switched to the terminal UI$/.test(line));
    expect(lines.slice(said + 1, said + 3)).toEqual(['', '? Pick a purpose']);
  });

  it('改用终端界面之后页面发来的意图不照办', async () => {
    let refused: number | undefined;
    await run({
      page: async (page, { terminal }) => {
        const told = page.until((state) => state.stage === 'terminal');
        terminal.press('t');
        // 本机的网页正在关：发得出去的话也不照办
        refused = await page
          .request('/api/intent', { method: 'POST', headers: { 'X-OXY-Token': page.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'pick', kind: 'skill', name: 'alpha', on: true }) })
          .then((response) => response.status, () => 0);
        await told;
        await page.closed;
      },
      answers: [choose('退出')],
    });

    expect([0, 400]).toContain(refused);
  });
});
