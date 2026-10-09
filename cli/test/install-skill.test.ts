import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { githubCatalogSource } from '../src/catalog.ts';
import { COMMIT, fakeGitHub } from './github.ts';
import { SAMPLE_FILES, STACK_FRAME, catalogDir, choose, pick, run, tempDir } from './harness.ts';

const skillsDir = (home: string): string => join(home, '.claude', 'skills');
const read = (...path: string[]): string => readFileSync(join(...path), 'utf8');
const installAlpha = [choose('Skill'), pick('alpha'), choose('开始安装'), choose('退出')];
const installBoth = [choose('Skill'), pick('alpha', 'beta-pack'), choose('开始安装'), choose('退出')];

describe('把 skill 装进 Claude Code', () => {
  it('勾选一个 skill 并确认后，它的全部文件出现在用户主目录的 .claude/skills 下', async () => {
    const result = await run({ answers: installAlpha });

    const installed = join(skillsDir(result.home), 'alpha');
    expect(read(installed, 'SKILL.md')).toBe(SAMPLE_FILES['skills/alpha/SKILL.md']);
    expect(read(installed, 'references', 'guide.md')).toBe(SAMPLE_FILES['skills/alpha/references/guide.md']);
    expect(existsSync(join(skillsDir(result.home), 'beta-pack'))).toBe(false);
    expect(result.exitCode).toBe(0);
  });

  it('一次勾选多个，全部装上', async () => {
    const result = await run({ answers: installBoth });

    expect(readdirSync(skillsDir(result.home)).sort()).toEqual(['alpha', 'beta-pack']);
    expect(read(skillsDir(result.home), 'beta-pack', 'SKILL.md')).toBe(SAMPLE_FILES['skills/beta-pack/SKILL.md']);
  });

  it('在 skill 目录内写入安装标记：名字、版本、来源提交和安装时间', async () => {
    const before = Date.now();
    const result = await run({ answers: installAlpha });

    const marker = JSON.parse(read(skillsDir(result.home), 'alpha', '.oxy-tools.json')) as Record<string, unknown>;
    // 目录来源是本地目录时没有来源提交
    expect(marker).toEqual({ name: 'alpha', version: '1.0.0', commit: null, installedAt: expect.any(String) });
    expect(Date.parse(marker['installedAt'] as string)).toBeGreaterThanOrEqual(before - 1000);
    expect(Date.parse(marker['installedAt'] as string)).toBeLessThanOrEqual(Date.now());
  });

  it('不写任何集中的状态文件：主目录里只多出装好的 skill', async () => {
    const result = await run({ answers: installAlpha });

    expect(readdirSync(result.home)).toEqual(['.claude']);
    expect(readdirSync(join(result.home, '.claude'))).toEqual(['skills']);
    expect(readdirSync(skillsDir(result.home))).toEqual(['alpha']);
    expect(readdirSync(result.tmp)).toEqual([]);
  });

  it('目标位置已有同名目录时整体替换，原有的文件不留', async () => {
    const result = await run({
      home: { '.claude/skills/alpha/SKILL.md': '旧的内容', '.claude/skills/alpha/leftover.md': '旧版本才有的文件' },
      answers: installAlpha,
    });

    const installed = join(skillsDir(result.home), 'alpha');
    expect(read(installed, 'SKILL.md')).toBe(SAMPLE_FILES['skills/alpha/SKILL.md']);
    expect(existsSync(join(installed, 'leftover.md'))).toBe(false);
    expect(readdirSync(skillsDir(result.home))).toEqual(['alpha']);
  });
});

describe('汇总确认', () => {
  it('列出每个 skill 将装到的目录，并说明同名目录会被整个替换', async () => {
    const result = await run({ answers: installBoth });

    expect(result.output).toMatch(/^── 将安装 2 个 skill ─+$/m);
    expect(result.output).toMatch(/^\s+条目\s+AI Agent\s+位置$/m);
    expect(result.output).toMatch(/^\s+alpha\s+Claude Code\s+~\S+alpha$/m);
    expect(result.output).toContain(join('~', '.claude', 'skills', 'alpha'));
    expect(result.output).toContain(join('~', '.claude', 'skills', 'beta-pack'));
    expect(result.output).toMatch(/^\s+注意\s+已存在的同名目录会被整个替换，目录内的本地改动会丢失$/m);
  });

  it('汇总出现在动手之前：选「取消」什么都不装，回到主菜单', async () => {
    const result = await run({ answers: [choose('Skill'), pick('alpha'), choose('取消'), choose('退出')] });

    expect(result.output).toContain('将安装 1 个 skill');
    expect(existsSync(skillsDir(result.home))).toBe(false);
    expect(result.output).not.toContain('正在安装');
    expect(result.output.split('选择分组')).toHaveLength(3);
    expect(result.exitCode).toBe(0);
  });

  it('选「返回修改」回到列表，之前勾选的还在，改选后按新的选择安装', async () => {
    const result = await run({
      answers: [choose('Skill'), pick('alpha'), choose('返回修改'), pick('beta-pack'), choose('开始安装'), choose('退出')],
    });

    const [, secondList = ''] = result.output.split('开始安装吗');
    expect(secondList).toMatch(/^\s*■ alpha\s/m);
    expect(secondList).toMatch(/^\s*□ beta-pack\s/m);
    expect(readdirSync(skillsDir(result.home))).toEqual(['beta-pack']);
  });

  it('一个都不勾就确认：直接回到主菜单', async () => {
    const result = await run({ answers: [choose('Skill'), pick(), choose('退出')] });

    expect(result.output).not.toContain('将安装');
    expect(result.output.split('选择分组')).toHaveLength(3);
    expect(existsSync(skillsDir(result.home))).toBe(false);
  });
});

describe('结果', () => {
  it('逐项显示装上了哪个版本，之后回到主菜单', async () => {
    const result = await run({ answers: installBoth });

    expect(result.output).toMatch(/── 结果 ─+/);
    expect(result.output).toMatch(/^\s+✓\s+alpha\s+Claude Code\s+已安装 1\.0\.0$/m);
    expect(result.output).toMatch(/^\s+✓\s+beta-pack\s+Claude Code\s+已安装 2\.3$/m);
    expect(result.output).toMatch(/^\s+合计\s+2 成功 · 0 失败 · 0 跳过$/m);
    expect(result.output.indexOf('选择分组', result.output.indexOf('合计'))).toBeGreaterThan(-1);
  });

  it('一项失败不影响其余项：两项各有一行，失败的带原因，退出状态不变', async () => {
    const result = await run({
      // alpha 的内容里没有 SKILL.md
      catalog: catalogDir({ content: { 'skills/alpha/README.md': '少了入口文件', 'skills/beta-pack/SKILL.md': '# beta-pack\n' } }),
      answers: installBoth,
    });

    expect(result.output).toMatch(/^\s+✗\s+alpha\s+Claude Code\s+失败 来源里没有 SKILL\.md，目标目录未改动$/m);
    expect(result.output).toMatch(/^\s+✓\s+beta-pack\s+Claude Code\s+已安装 2\.3$/m);
    expect(result.output).toMatch(/^\s+合计\s+1 成功 · 1 失败 · 0 跳过$/m);
    expect(readdirSync(skillsDir(result.home))).toEqual(['beta-pack']);
    expect(readdirSync(result.tmp)).toEqual([]);
    expect(result.output).not.toMatch(STACK_FRAME);
    expect(result.output.split('选择分组')).toHaveLength(3);
    expect(result.exitCode).toBe(0);
  });

  it('目标位置写不进去时，这一项失败并说明原因，其余项照常', async () => {
    // 主目录里的 .claude 是个文件，下面建不了 skills 目录
    const result = await run({ home: { '.claude': '这里本该是个目录' }, answers: installAlpha });

    expect(result.output).toMatch(/^\s+✗\s+alpha\s+Claude Code\s+失败 写入失败（[A-Z]+），目标目录未改动$/m);
    expect(result.output).toMatch(/^\s+合计\s+0 成功 · 1 失败 · 0 跳过$/m);
    expect(readdirSync(result.tmp)).toEqual([]);
    expect(result.output).not.toMatch(STACK_FRAME);
    expect(result.exitCode).toBe(0);
  });

  it('来源里没有这个 skill 的目录时，这一项失败并说明原因', async () => {
    const result = await run({ catalog: catalogDir({ content: {} }), answers: installAlpha });

    expect(result.output).toMatch(/^\s+✗\s+alpha\s+Claude Code\s+失败 下载中断（ENOENT），目标目录未改动$/m);
    expect(existsSync(join(skillsDir(result.home), 'alpha'))).toBe(false);
  });

  it('英文界面下结果也是英文', async () => {
    const result = await run({
      argv: ['--lang', 'en'],
      answers: [choose('Skill'), pick('alpha'), choose('Install'), choose('Exit')],
    });

    expect(result.output).toMatch(/^── Install 1 skill ─+$/m);
    expect(result.output).toMatch(/^\s+✓\s+alpha\s+Claude Code\s+installed 1\.0\.0$/m);
    expect(result.output).toMatch(/^\s+Total\s+1 succeeded · 0 failed · 0 skipped$/m);
  });
});

describe('从 GitHub 下载 skill', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('按 skill 单独下载：只取勾选的 skill 目录下的文件，全部钉在查询到的那个提交上', async () => {
    const github = fakeGitHub();

    const result = await run({ catalog: githubCatalogSource(), answers: installAlpha });

    expect(github.downloads().sort()).toEqual([
      `${COMMIT}/skills/alpha/SKILL.md`,
      `${COMMIT}/skills/alpha/references/guide.md`,
    ]);
    const installed = join(skillsDir(result.home), 'alpha');
    expect(read(installed, 'SKILL.md')).toBe(SAMPLE_FILES['skills/alpha/SKILL.md']);
    expect(read(installed, 'references', 'guide.md')).toBe(SAMPLE_FILES['skills/alpha/references/guide.md']);
    expect(result.output).toMatch(/^\s+✓\s+alpha\s+Claude Code\s+已安装 1\.0\.0$/m);
  });

  it('一次运行里装多个 skill 共用同一次查询，再装一轮也不重新查询；安装标记记下来源提交', async () => {
    const github = fakeGitHub();

    const result = await run({
      catalog: githubCatalogSource(),
      answers: [
        choose('Skill'),
        pick('alpha', 'beta-pack'),
        choose('开始安装'),
        choose('Skill'),
        pick('alpha'),
        choose('开始安装'),
        choose('退出'),
      ],
    });

    expect(github.queries()).toEqual(['commits/main', `git/trees/${COMMIT}?recursive=1`]);
    for (const name of ['alpha', 'beta-pack']) {
      expect(JSON.parse(read(skillsDir(result.home), name, '.oxy-tools.json'))).toMatchObject({ name, commit: COMMIT });
    }
    for (const request of github.requests) {
      expect(request.url).toMatch(/^https:/);
      expect(request.redirect).toBe('error');
    }
  });

  it('环境里有 GITHUB_TOKEN 时查询带上它，没有时不带；下载文件从不带', async () => {
    const anonymous = fakeGitHub();
    await run({ catalog: githubCatalogSource(), answers: installAlpha });
    const authorized = fakeGitHub();
    await run({ catalog: githubCatalogSource(), env: { GITHUB_TOKEN: 'ghp_sample' }, answers: installAlpha });

    const sentTo = (github: typeof anonymous, host: string): (string | null)[] =>
      github.requests.filter(({ url }) => new URL(url).host === host).map((request) => request.authorization);
    expect(sentTo(anonymous, 'api.github.com')).toEqual([null, null]);
    expect(sentTo(authorized, 'api.github.com')).toEqual(['Bearer ghp_sample', 'Bearer ghp_sample']);
    expect(new Set(sentTo(authorized, 'raw.githubusercontent.com'))).toEqual(new Set([null]));
  });

  it('保留文件的可执行位', async ({ skip }) => {
    // Windows 的文件系统没有可执行位
    skip(process.platform === 'win32');
    fakeGitHub({
      content: { 'skills/alpha/SKILL.md': '# alpha\n', 'skills/alpha/run.sh': '#!/bin/sh\n' },
      executable: ['skills/alpha/run.sh'],
    });

    const result = await run({ catalog: githubCatalogSource(), answers: installAlpha });

    const installed = join(skillsDir(result.home), 'alpha');
    expect(statSync(join(installed, 'run.sh')).mode & 0o111).not.toBe(0);
    expect(statSync(join(installed, 'SKILL.md')).mode & 0o111).toBe(0);
  });
});

describe('下载失败', () => {
  afterEach(() => vi.unstubAllGlobals());
  const existing = { '.claude/skills/alpha/SKILL.md': '装之前就有的内容', '.claude/skills/alpha/notes.md': '用户自己的笔记' };
  const untouched = (home: string): void => {
    const installed = join(skillsDir(home), 'alpha');
    expect(readdirSync(installed).sort()).toEqual(['SKILL.md', 'notes.md']);
    expect(read(installed, 'SKILL.md')).toBe('装之前就有的内容');
    expect(read(installed, 'notes.md')).toBe('用户自己的笔记');
  };

  it('下载中途失败后目标位置保持原样，临时目录被清理，其余项照常安装', async () => {
    fakeGitHub({
      intercept: (url) => (url.endsWith('/skills/alpha/references/guide.md') ? new Response('unavailable', { status: 503 }) : undefined),
    });

    const result = await run({ catalog: githubCatalogSource(), home: existing, answers: installBoth });

    untouched(result.home);
    expect(result.output).toMatch(/^\s+✗\s+alpha\s+Claude Code\s+失败 下载中断（HTTP 503），目标目录未改动$/m);
    expect(result.output).toMatch(/^\s+✓\s+beta-pack\s+Claude Code\s+已安装 2\.3$/m);
    expect(readdirSync(skillsDir(result.home)).sort()).toEqual(['alpha', 'beta-pack']);
    expect(readdirSync(result.tmp)).toEqual([]);
    expect(result.output).not.toMatch(STACK_FRAME);
    expect(result.exitCode).toBe(0);
  });

  it('文件列表里的路径想跳出 skill 目录时，这一项失败，什么都不写到外面', async () => {
    fakeGitHub({ content: { 'skills/alpha/SKILL.md': '# alpha\n', 'skills/alpha/../escaped.md': '不该落地' } });

    const result = await run({ catalog: githubCatalogSource(), answers: installAlpha });

    expect(result.output).toMatch(/^\s+✗\s+alpha\s+Claude Code\s+失败 文件列表里有越界的路径，目标目录未改动$/m);
    expect(readdirSync(result.tmp)).toEqual([]);
    expect(existsSync(skillsDir(result.home))).toBe(false);
  });

  it('下载中途被 Ctrl+C 中断：临时目录当即清理，目标位置保持原样，以 130 退出', async () => {
    const tmp = tempDir('tmp');
    const user = new AbortController();
    let leftAfterInterrupt: string[] | undefined;
    fakeGitHub({
      intercept(url) {
        if (!url.endsWith('/skills/alpha/references/guide.md')) return undefined;
        user.abort();
        // 进程此刻就会退出，等不到任何异步的收尾
        leftAfterInterrupt = readdirSync(tmp);
        throw new DOMException('This operation was aborted', 'AbortError');
      },
    });

    const result = await run({ catalog: githubCatalogSource(), home: existing, tmp, interrupt: user.signal, answers: [choose('Skill'), pick('alpha', 'beta-pack'), choose('开始安装')] });

    expect(leftAfterInterrupt).toEqual([]);
    untouched(result.home);
    expect(readdirSync(skillsDir(result.home))).toEqual(['alpha']);
    expect(result.output).not.toContain('出错');
    expect(result.exitCode).toBe(130);
  });
});

describe('查询 GitHub 失败', () => {
  afterEach(() => vi.unstubAllGlobals());
  const limited = (headers: Record<string, string>) => (url: string) =>
    url.includes('api.github.com') ? Response.json({ message: 'API rate limit exceeded' }, { status: 403, headers }) : undefined;
  const inMinutes = (minutes: number): string => String(Math.floor(Date.now() / 1000) + minutes * 60);

  it('被限流时说明原因和两个出路（稍后再试，或设置访问令牌），不出现堆栈，之后回到主菜单', async () => {
    fakeGitHub({ intercept: limited({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': inMinutes(37) }) });

    const result = await run({ catalog: githubCatalogSource(), answers: installAlpha });

    expect(result.stderr).toMatch(/^── 出错：GitHub 限流 ─+$/m);
    expect(result.stderr).toMatch(/^\s+原因\s+未登录的查询每小时限 60 次，约 37 分钟后恢复$/m);
    expect(result.stderr).toMatch(/^\s+下一步\s+稍后再试$/m);
    expect(result.stderr).toMatch(/^\s+或设置访问令牌后重新运行：export GITHUB_TOKEN=<你的令牌>$/m);
    expect(result.output).not.toMatch(STACK_FRAME);
    expect(result.output).not.toContain('正在安装');
    expect(existsSync(skillsDir(result.home))).toBe(false);
    expect(result.output.split('选择分组')).toHaveLength(3);
    expect(result.exitCode).toBe(0);
  });

  it('Windows 上设置访问令牌的写法不同', async () => {
    fakeGitHub({ intercept: limited({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': inMinutes(5) }) });

    const result = await run({ catalog: githubCatalogSource(), platform: 'win32', env: { WT_SESSION: '1' }, answers: installAlpha });

    expect(result.stderr).toContain('出错：GitHub 限流');
    expect(result.stderr).toContain('GITHUB_TOKEN');
    expect(result.stderr).not.toContain('export ');
  });

  it('带着访问令牌仍被限流时，只剩稍后再试这一条出路', async () => {
    fakeGitHub({ intercept: limited({ 'retry-after': '120' }) });

    const result = await run({ catalog: githubCatalogSource(), env: { GITHUB_TOKEN: 'ghp_sample' }, answers: installAlpha });

    expect(result.stderr).toContain('出错：GitHub 限流');
    expect(result.stderr).toMatch(/约 2 分钟后恢复/);
    expect(result.stderr).not.toContain('未登录');
    expect(result.stderr).not.toContain('设置访问令牌');
    expect(result.output).not.toContain('ghp_sample');
  });

  it('限流过去之后，同一次运行里再装一次会重新查询', async () => {
    let limitedOnce = false;
    const github = fakeGitHub({
      intercept(url) {
        if (limitedOnce || !url.includes('api.github.com')) return undefined;
        limitedOnce = true;
        return Response.json({ message: 'API rate limit exceeded' }, { status: 429, headers: { 'x-ratelimit-remaining': '0' } });
      },
    });

    const result = await run({
      catalog: githubCatalogSource(),
      answers: [choose('Skill'), pick('alpha'), choose('开始安装'), choose('Skill'), pick('alpha'), choose('开始安装'), choose('退出')],
    });

    expect(result.stderr).toContain('出错：GitHub 限流');
    expect(github.queries()).toEqual(['commits/main', 'commits/main', `git/trees/${COMMIT}?recursive=1`]);
    expect(readdirSync(skillsDir(result.home))).toEqual(['alpha']);
  });

  it('查询不通（断网）时说明查的是哪个网址、技术原因和下一步，什么都不装', async () => {
    fakeGitHub({
      intercept(url) {
        if (!url.includes('api.github.com')) return undefined;
        throw new TypeError('fetch failed', { cause: Object.assign(new Error('getaddrinfo'), { code: 'ENOTFOUND' }) });
      },
    });

    const result = await run({ catalog: githubCatalogSource(), answers: installAlpha });

    expect(result.stderr).toMatch(/^── 出错：无法查询 skill 的文件列表 ─+$/m);
    expect(result.stderr).toContain('ENOTFOUND');
    expect(result.stderr).toContain('https://api.github.com/repos/LFT-OXY/oxy-Tools/commits/main');
    expect(result.stderr).toMatch(/^\s+下一步\s+\S/m);
    expect(result.output).not.toMatch(STACK_FRAME);
    expect(existsSync(skillsDir(result.home))).toBe(false);
    expect(result.exitCode).toBe(0);
  });

  it('访问令牌无效时指出是令牌的问题', async () => {
    fakeGitHub({
      intercept: (url) => (url.includes('api.github.com') ? Response.json({ message: 'Bad credentials' }, { status: 401 }) : undefined),
    });

    const result = await run({ catalog: githubCatalogSource(), env: { GITHUB_TOKEN: 'ghp_expired' }, answers: installAlpha });

    expect(result.stderr).toContain('出错：无法查询 skill 的文件列表');
    expect(result.stderr).toContain('HTTP 401');
    expect(result.stderr).toMatch(/GITHUB_TOKEN.*无效或已过期/);
    expect(result.output).not.toContain('ghp_expired');
  });

  it('答复读不懂（比如被登录页拦下）时说明原因，什么都不装', async () => {
    fakeGitHub({
      intercept: (url) => (url.includes('api.github.com') ? new Response('<html>请先登录网络</html>') : undefined),
    });

    const result = await run({ catalog: githubCatalogSource(), answers: installAlpha });

    expect(result.stderr).toContain('出错：无法查询 skill 的文件列表');
    expect(result.stderr).toMatch(/^\s+原因\s+GitHub 的答复不是预期的格式$/m);
    expect(result.stderr).toMatch(/^\s+下一步\s+\S/m);
    expect(result.output).not.toMatch(STACK_FRAME);
    expect(existsSync(skillsDir(result.home))).toBe(false);
  });

  it('GitHub 给出的文件列表不完整时不安装，免得装上残缺的 skill', async () => {
    fakeGitHub({
      intercept: (url) =>
        url.includes('/git/trees/')
          ? Response.json({ sha: COMMIT, tree: [{ path: 'skills/alpha/SKILL.md', mode: '100644', type: 'blob' }], truncated: true })
          : undefined,
    });

    const result = await run({ catalog: githubCatalogSource(), answers: installAlpha });

    expect(result.stderr).toContain('出错：无法查询 skill 的文件列表');
    expect(result.stderr).toMatch(/^\s+原因\s+GitHub 给出的文件列表不完整/m);
    expect(existsSync(skillsDir(result.home))).toBe(false);
  });
});
