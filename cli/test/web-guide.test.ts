// 网页界面的开场引导答过没有：记在安装器这边，都经主接缝，架子扮演浏览器
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RunView, ViewState } from '../src/web-protocol.ts';
import { run, type Page } from './harness.ts';

const BOTH_HOSTS = ['claude', 'codex'];
// 正常收场：点「完成」，等安装器把连接收掉
const done = async (page: Page): Promise<void> => {
  await page.send({ type: 'finish' });
  await page.closed;
};
// 这台机器的可执行路径上有这几个命令时，页面一打开收到的第一份画面状态
const firstState = async (onPath: string[]): Promise<ViewState | undefined> => {
  let first: ViewState | undefined;
  await run({
    onPath,
    page: async (page) => {
      first = page.state();
      await done(page);
    },
  });
  return first;
};

describe('网页界面：开场引导答过没有', () => {
  it('检测到宿主时起初是没答过，两个、一个都是；一个宿主都没检测到时起初就算答过', async () => {
    expect((await firstState(BOTH_HOSTS))?.guideAnswered).toBe(false);
    expect((await firstState(['claude']))?.guideAnswered).toBe(false);
    expect((await firstState([]))?.guideAnswered).toBe(true);
  });

  it('页面说答完了之后，推来的和刷新拿到的都是答过了，别的都没变；再说一次还是一样', async () => {
    let first: ViewState | undefined;
    let pushed: ViewState | undefined;
    let reloaded: ViewState | undefined;
    let again: ViewState | undefined;
    await run({
      onPath: BOTH_HOSTS,
      page: async (page) => {
        first = page.state();
        await page.send({ type: 'guide-answered' });
        pushed = await page.until((state) => state.guideAnswered);
        reloaded = await page.reload();
        await page.send({ type: 'guide-answered' });
        again = await page.reload();
        await done(page);
      },
    });

    expect(pushed).toEqual({ ...first, guideAnswered: true });
    expect(reloaded).toEqual(pushed);
    expect(again).toEqual(pushed);
  });

  it('没答完时改的宿主和安装范围刷新后还在、仍是没答过；答完之后装的东西照它落', async () => {
    let reloaded: ViewState | undefined;
    let answered: ViewState | undefined;
    let results: RunView | undefined;
    const result = await run({
      onPath: BOTH_HOSTS,
      page: async (page) => {
        await page.send({ type: 'host', host: 'codex', on: false });
        await page.send({ type: 'scope', scope: 'project' });
        await page.until((state) => state.target.scope === 'project');
        reloaded = await page.reload();
        await page.send({ type: 'guide-answered' });
        answered = await page.until((state) => state.guideAnswered);
        await page.send({ type: 'pick', kind: 'skill', name: 'alpha', on: true });
        await page.send({ type: 'review' });
        const { summary } = await page.until((state) => state.summary !== undefined);
        await page.send({ type: 'install', summary: summary?.id ?? '' });
        results = (await page.until((state) => state.run?.done === true)).run;
        await done(page);
      },
    });

    expect(reloaded).toMatchObject({ guideAnswered: false, target: { hosts: ['Claude Code'], scope: 'project' } });
    expect(answered?.target).toEqual(reloaded?.target);
    expect(results?.rows.map((row) => `${row.name} ${row.host} ${row.text}`)).toEqual(['alpha Claude Code 已安装']);
    expect(existsSync(join(result.project, '.claude', 'skills', 'alpha', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(result.project, '.agents'))).toBe(false);
    expect(existsSync(join(result.home, '.claude', 'skills', 'alpha'))).toBe(false);
  });

  it('换语言不动它：没答过的还是没答过，答过了的还是答过了', async () => {
    let before: ViewState | undefined;
    let after: ViewState | undefined;
    await run({
      page: async (page) => {
        await page.send({ type: 'lang', lang: 'en' });
        before = await page.until((state) => state.lang === 'en');
        await page.send({ type: 'guide-answered' });
        await page.send({ type: 'lang', lang: 'zh' });
        after = await page.until((state) => state.lang === 'zh');
        await done(page);
      },
    });

    expect(before?.guideAnswered).toBe(false);
    expect(after?.guideAnswered).toBe(true);
  });

  it('安装器不拿它拦别的意图：没答过时勾选、要汇总照常照办', async () => {
    let reviewed: ViewState | undefined;
    await run({
      page: async (page) => {
        await page.send({ type: 'pick', kind: 'skill', name: 'alpha', on: true });
        await page.send({ type: 'review' });
        reviewed = await page.until((state) => state.summary !== undefined);
        await done(page);
      },
    });

    expect(reviewed?.guideAnswered).toBe(false);
    expect(reviewed?.selected.map((entry) => entry.name)).toEqual(['alpha']);
    expect(reviewed?.summary?.entries.map((entry) => entry.name)).toEqual(['alpha']);
  });

  it('「答完了」里多带了东西的不照办：仍是没答过，带的选项也没有生效', async () => {
    const statuses: number[] = [];
    let after: ViewState | undefined;
    await run({
      onPath: BOTH_HOSTS,
      page: async (page) => {
        const headers = { 'X-OXY-Token': page.token, 'Content-Type': 'application/json' };
        for (const extra of [{ scope: 'project' }, { host: 'codex', on: false }, { command: 'rm -rf ~' }]) {
          statuses.push((await page.request('/api/intent', { method: 'POST', headers, body: JSON.stringify({ type: 'guide-answered', ...extra }) })).status);
        }
        after = await page.reload();
        await done(page);
      },
    });

    expect(statuses).toEqual([400, 400, 400]);
    expect(after).toMatchObject({ guideAnswered: false, target: { hosts: ['Claude Code', 'Codex'], scope: 'global' } });
  });
});
