// 网页界面上选装进哪些宿主、装到全局还是项目：都经主接缝，架子扮演浏览器
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RunView, Scope, SummaryView, ViewState } from '../src/web-protocol.ts';
import { run, type Page } from './harness.ts';

const BOTH_HOSTS = ['claude', 'codex'];
// 正常收场：点「完成」，等安装器把连接收掉
const done = async (page: Page): Promise<void> => {
  await page.send({ type: 'finish' });
  await page.closed;
};
// 勾上一个本仓库的 skill
const tick = async (page: Page, name: string): Promise<ViewState> => {
  await page.send({ type: 'pick', kind: 'skill', name, on: true });
  return page.until((state) => state.selected.some((entry) => entry.name === name));
};
// 装进（或不装进）一个宿主，给出之后的画面状态
const host = async (page: Page, id: string, on: boolean): Promise<ViewState> => {
  await page.send({ type: 'host', host: id, on });
  return page.until((state) => state.target.choices.some((choice) => choice.id === id && choice.on === on));
};
// 选安装范围，给出之后的画面状态
const scope = async (page: Page, wanted: Scope): Promise<ViewState> => {
  await page.send({ type: 'scope', scope: wanted });
  return page.until((state) => state.target.scope === wanted);
};
// 主目录里一个本工具装的 skill：有安装标记
const installed = (skillsDir: string, name: string, version: string): Record<string, string> => ({
  [`${skillsDir}/${name}/SKILL.md`]: `# 旧的 ${name}\n`,
  [`${skillsDir}/${name}/.oxy-tools.json`]: JSON.stringify({ name, version, commit: null, installedAt: '2026-10-01T08:00:00.000Z' }),
});
// 一个目录下的全部文件：相对路径 → 内容
const tree = (dir: string, prefix = ''): Record<string, string> =>
  Object.fromEntries(
    readdirSync(join(dir, prefix), { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? -1 : 1))
      .flatMap((entry): [string, string][] => {
        const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
        return entry.isDirectory() ? Object.entries(tree(dir, path)) : [[path, readFileSync(join(dir, path), 'utf8')]];
      }),
  );
// 不经 page.send 直接发一个意图，给出答复的状态码：用来发那些该被拒绝的
const post = async (page: Page, intent: unknown): Promise<number> => {
  const headers = { 'X-OXY-Token': page.token, 'Content-Type': 'application/json' };
  return (await page.request('/api/intent', { method: 'POST', headers, body: JSON.stringify(intent) })).status;
};
// 要汇总，给出汇总
const review = async (page: Page): Promise<SummaryView> => {
  await page.send({ type: 'review' });
  return (await page.until((state) => state.summary !== undefined)).summary as SummaryView;
};
// 确认安装，等到这一批装完
const install = async (page: Page, summary: SummaryView): Promise<RunView> => {
  await page.send({ type: 'install', summary: summary.id });
  return (await page.until((state) => state.run?.done === true)).run as RunView;
};
// 正在看的那张列表里每张卡片的状态：名字 → 每个宿主一段「宿主 词」
const statuses = (state: ViewState): Record<string, string[]> =>
  Object.fromEntries(
    (state.listing?.sections ?? []).flatMap((section) => section.entries.map((entry) => [entry.name, entry.statuses.map((one) => `${one.host} ${one.text}`)])),
  );

describe('网页界面：装进哪些宿主', () => {
  it('两个宿主只选一个：状态只剩它的，装的东西只进它的目录', async () => {
    let before: ViewState | undefined;
    let after: ViewState | undefined;
    let results: RunView | undefined;
    const result = await run({
      onPath: BOTH_HOSTS,
      page: async (page) => {
        before = page.state();
        after = await host(page, 'codex', false);
        await tick(page, 'alpha');
        results = await install(page, await review(page));
        await done(page);
      },
    });

    expect(before?.target).toMatchObject({
      choices: [
        { id: 'claude-code', name: 'Claude Code', on: true },
        { id: 'codex', name: 'Codex', on: true },
      ],
      hosts: ['Claude Code', 'Codex'],
    });
    expect(before && statuses(before)['alpha']).toEqual(['Claude Code 未装', 'Codex 未装']);
    expect(after?.target.hosts).toEqual(['Claude Code']);
    expect(after && statuses(after)['alpha']).toEqual(['Claude Code 未装']);
    expect(results?.rows.map((row) => `${row.name} ${row.host} ${row.text}`)).toEqual(['alpha Claude Code 已安装']);
    expect(existsSync(join(result.home, '.claude', 'skills', 'alpha', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(result.home, '.agents'))).toBe(false);
  });

  it('至少留一个：去掉最后一个不照办；不是检测到的宿主也不照办', async () => {
    const statuses: Record<string, number> = {};
    let after: ViewState | undefined;
    await run({
      onPath: BOTH_HOSTS,
      page: async (page) => {
        await host(page, 'codex', false);
        statuses['去掉最后一个'] = await post(page, { type: 'host', host: 'claude-code', on: false });
        statuses['没检测到的'] = await post(page, { type: 'host', host: 'cursor', on: true });
        statuses['没有 on'] = await post(page, { type: 'host', host: 'codex' });
        statuses['多带了东西'] = await post(page, { type: 'host', host: 'codex', on: true, path: '/tmp/pwned' });
        after = await page.reload();
        await done(page);
      },
    });

    expect(statuses).toEqual({ 去掉最后一个: 400, 没检测到的: 400, '没有 on': 400, 多带了东西: 400 });
    expect(after?.target.hosts).toEqual(['Claude Code']);
  });

  it('只检测到一个宿主：没有可改的——它是唯一的一项，去不掉；一个都没检测到：没有宿主也没有安装范围可选', async () => {
    let one: ViewState | undefined;
    let none: ViewState | undefined;
    const statuses: Record<string, number> = {};
    await run({
      page: async (page) => {
        one = page.state();
        statuses['只有一个时去掉它'] = await post(page, { type: 'host', host: 'claude-code', on: false });
        await done(page);
      },
    });
    await run({
      onPath: [],
      page: async (page) => {
        none = page.state();
        statuses['没有宿主时选宿主'] = await post(page, { type: 'host', host: 'claude-code', on: true });
        statuses['没有宿主时选范围'] = await post(page, { type: 'scope', scope: 'project' });
        await done(page);
      },
    });

    expect(one?.target.choices).toEqual([{ id: 'claude-code', name: 'Claude Code', on: true }]);
    expect(none?.target).toMatchObject({ choices: [], hosts: [], scope: 'global' });
    expect(statuses).toEqual({ 只有一个时去掉它: 400, 没有宿主时选宿主: 400, 没有宿主时选范围: 400 });
  });
});

describe('网页界面：装到哪里', () => {
  it('装到项目：写明是哪个目录，状态和汇总里的位置按项目目录，装完落在项目里、主目录一个字节都没变；改回全局状态是全局的', async () => {
    let before: ViewState | undefined;
    let inProject: ViewState | undefined;
    let summary: SummaryView | undefined;
    let results: RunView | undefined;
    let back: ViewState | undefined;
    let homeBefore: Record<string, string> = {};
    const result = await run({
      home: installed('.claude/skills', 'alpha', '1.0.0'),
      page: async (page, { home }) => {
        homeBefore = tree(home);
        before = page.state();
        inProject = await scope(page, 'project');
        await tick(page, 'alpha');
        summary = await review(page);
        results = await install(page, summary);
        await page.send({ type: 'continue' });
        await page.until((state) => state.run === undefined);
        back = await scope(page, 'global');
        await done(page);
      },
    });

    expect(before?.target).toMatchObject({ scope: 'global', project: { note: '只对当前目录生效：', dir: result.project } });
    expect(before && statuses(before)['alpha']).toEqual(['Claude Code 已装']);
    expect(inProject?.target.scope).toBe('project');
    expect(inProject && statuses(inProject)['alpha']).toEqual(['Claude Code 未装']);
    expect(summary?.entries.map((entry) => entry.rows.map((row) => `${row.action} ${row.location}`))).toEqual([[`新装 ${join('.claude', 'skills', 'alpha')}`]]);
    expect(results?.rows.map((row) => `${row.name} ${row.text}`)).toEqual(['alpha 已安装']);
    expect(existsSync(join(result.project, '.claude', 'skills', 'alpha', 'SKILL.md'))).toBe(true);
    expect(tree(result.home)).toEqual(homeBefore);
    expect(back && statuses(back)['alpha']).toEqual(['Claude Code 已装']);
  });

  it('不是 global、project 的写法不照办', async () => {
    const statuses: number[] = [];
    let after: ViewState | undefined;
    await run({
      page: async (page) => {
        for (const value of ['local', '', 1, null]) statuses.push(await post(page, { type: 'scope', scope: value }));
        statuses.push(await post(page, { type: 'scope', scope: 'project', command: 'rm -rf ~' }));
        after = await page.reload();
        await done(page);
      },
    });

    expect(statuses).toEqual([400, 400, 400, 400, 400]);
    expect(after?.target.scope).toBe('global');
  });
});

describe('网页界面：这两个选择一直在安装器这边', () => {
  it('换语言后不变，刷新后还是改过的；两样的名字换成了新的语言', async () => {
    let english: ViewState | undefined;
    let reloaded: ViewState | undefined;
    await run({
      onPath: BOTH_HOSTS,
      page: async (page) => {
        await host(page, 'claude-code', false);
        await scope(page, 'project');
        await page.send({ type: 'lang', lang: 'en' });
        english = await page.until((state) => state.lang === 'en');
        reloaded = await page.reload();
        await done(page);
      },
    });

    expect(english?.target).toEqual({
      hostsLabel: 'Install into which AI Agents',
      choices: [
        { id: 'claude-code', name: 'Claude Code', on: false },
        { id: 'codex', name: 'Codex', on: true },
      ],
      hosts: ['Codex'],
      scopeLabel: 'Install where',
      scopes: [
        { id: 'global', name: 'Global' },
        { id: 'project', name: 'Project' },
      ],
      scope: 'project',
      project: { note: 'applies to the current directory only: ', dir: expect.any(String) },
    });
    expect(reloaded?.target).toEqual(english?.target);
  });

  it('汇总开着的时候改不了宿主和安装范围：一批里只有一组宿主、一个安装范围', async () => {
    const statuses: number[] = [];
    let after: ViewState | undefined;
    await run({
      onPath: BOTH_HOSTS,
      page: async (page) => {
        await tick(page, 'alpha');
        await review(page);
        statuses.push(await post(page, { type: 'host', host: 'codex', on: false }));
        statuses.push(await post(page, { type: 'scope', scope: 'project' }));
        after = await page.reload();
        await done(page);
      },
    });

    expect(statuses).toEqual([400, 400]);
    expect(after?.target).toMatchObject({ hosts: ['Claude Code', 'Codex'], scope: 'global' });
    expect(after?.summary?.entries[0]?.rows.map((row) => row.location)).toEqual([join('~', '.claude', 'skills', 'alpha'), join('~', '.agents', 'skills', 'alpha')]);
  });
});
