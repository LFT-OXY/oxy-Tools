import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { githubCatalogSource } from '../src/catalog.ts';
import { fakeGitHub } from './github.ts';
import { SAMPLE_FILES, SAMPLE_SKILLS, accept, catalogDir, choose, interrupt, no, pick, run, yes } from './harness.ts';

const BOTH_HOSTS = ['claude', 'codex'];
/** 本工具装过之后留在 skill 目录里的安装标记 */
const marker = (name: string, version: string): string =>
  JSON.stringify({ name, version, commit: null, installedAt: '2026-10-01T00:00:00.000Z' });
/** 主目录里一个本工具装的 skill */
const installed = (skillsDir: string, name: string, version: string): Record<string, string> => ({
  [`${skillsDir}/${name}/SKILL.md`]: `# ${name}，装的是 ${version}\n`,
  [`${skillsDir}/${name}/.oxy-tools.json`]: marker(name, version),
});
const browse = [choose('Skill'), pick(), choose('退出')];
const installBoth = [choose('Skill'), pick('alpha', 'beta-pack'), choose('开始安装'), choose('退出')];
const read = (...path: string[]): string => readFileSync(join(...path), 'utf8');
const NOTICE = /^\s+注意\s+覆盖即整目录替换，目录内的本地改动会丢失$/m;

describe('skill 列表里的状态', () => {
  it('每个宿主各占一栏，四种状态各有不同的文字', async () => {
    const result = await run({
      onPath: BOTH_HOSTS,
      home: {
        ...installed('.claude/skills', 'alpha', '1.0.0'),
        ...installed('.claude/skills', 'beta-pack', '2.0'),
        '.agents/skills/beta-pack/SKILL.md': '用户自己手动放的',
      },
      answers: [choose('Skill'), accept(), pick(), pick(), choose('退出')],
    });

    expect(result.output).toMatch(/^\s+名称\s+Claude Code\s+Codex\s+说明$/m);
    expect(result.output).toMatch(/^\s*□ alpha\s+已装 1\.0\.0\s+未装\s+第一个样例 skill/m);
    expect(result.output).toMatch(/^\s*□ beta-pack\s+2\.0 → 2\.3\s+非本工具安装\s+第二个样例 skill$/m);
  });

  it('只装进一个宿主时只有一栏状态', async () => {
    const result = await run({ home: installed('.claude/skills', 'alpha', '1.0.0'), answers: browse });

    expect(result.output).toMatch(/^\s+名称\s+Claude Code\s+说明$/m);
    expect(result.output).toMatch(/^\s*□ alpha\s+已装 1\.0\.0\s+第一个样例 skill/m);
    expect(result.output).toMatch(/^\s*□ beta-pack\s+未装\s+第二个样例 skill$/m);
  });

  it('符号链接算不是本工具装的，哪怕它指向的目录里有安装标记', async () => {
    const result = await run({
      home: installed('my-skills', 'alpha', '1.0.0'),
      links: { '.claude/skills/alpha': 'my-skills/alpha' },
      answers: browse,
    });

    expect(result.output).toMatch(/^\s*□ alpha\s+非本工具安装\s/m);
  });

  it('安装标记读不出版本时，当作不是本工具装的', async () => {
    const result = await run({
      home: { '.claude/skills/alpha/SKILL.md': '# alpha\n', '.claude/skills/alpha/.oxy-tools.json': '{ 写坏了' },
      answers: browse,
    });

    expect(result.output).toMatch(/^\s*□ alpha\s+非本工具安装\s/m);
  });

  it('安装标记里的版本夹着终端控制码时同样当作不是本工具装的，控制码不上屏', async () => {
    const result = await run({
      home: {
        '.claude/skills/alpha/SKILL.md': '# alpha\n',
        '.claude/skills/alpha/.oxy-tools.json': JSON.stringify({ name: 'alpha', version: '1.0\u001b[2J' }),
      },
      answers: browse,
    });

    expect(result.output).toMatch(/^\s*□ alpha\s+非本工具安装\s/m);
    expect(result.raw).not.toContain('\u001b[2J');
  });

  it('状态是实时探测的：装完再进列表，刚装的那个已经显示为已装', async () => {
    const result = await run({
      answers: [choose('Skill'), pick('alpha'), choose('开始安装'), choose('Skill'), pick(), choose('退出')],
    });

    const [, first = '', second = ''] = result.output.split('选择要安装的 skill');
    expect(first).toMatch(/^\s*□ alpha\s+未装\s/m);
    expect(second).toMatch(/^\s*□ alpha\s+已装 1\.0\.0\s/m);
    expect(second).toMatch(/^\s*□ beta-pack\s+未装\s/m);
  });

  it('英文界面下的状态词', async () => {
    const result = await run({
      argv: ['--lang', 'en'],
      onPath: BOTH_HOSTS,
      home: {
        ...installed('.claude/skills', 'alpha', '1.0.0'),
        ...installed('.claude/skills', 'beta-pack', '2.0'),
        '.agents/skills/beta-pack/SKILL.md': 'placed by hand',
      },
      answers: [choose('Skills'), accept(), pick(), pick(), choose('Exit')],
    });

    expect(result.output).toMatch(/^\s+Name\s+Claude Code\s+Codex\s+About$/m);
    expect(result.output).toMatch(/^\s*□ alpha\s+installed 1\.0\.0\s+none\s/m);
    expect(result.output).toMatch(/^\s*□ beta-pack\s+2\.0 → 2\.3\s+unmanaged\s/m);
  });
});

describe('覆盖已装的 skill', () => {
  it('全是新装时每行写「新装」，没有覆盖的提醒', async () => {
    const result = await run({ answers: installBoth });

    expect(result.output).toMatch(/^\s+条目\s+AI Agent\s+操作\s+位置$/m);
    expect(result.output).toMatch(/^\s+alpha\s+Claude Code\s+新装\s+~\S+alpha$/m);
    expect(result.output).toMatch(/^\s+beta-pack\s+Claude Code\s+新装\s+~\S+beta-pack$/m);
    expect(result.output).not.toContain('覆盖');
    expect(result.output).not.toContain('备注');
  });

  it('汇总标出哪些会被覆盖：版本不同的写出两个版本，相同的写重装，并提醒本地改动会丢失', async () => {
    const result = await run({
      home: { ...installed('.claude/skills', 'alpha', '1.0.0'), ...installed('.claude/skills', 'beta-pack', '2.0') },
      answers: installBoth,
    });

    expect(result.output).toMatch(/^\s+条目\s+AI Agent\s+操作\s+位置\s+备注$/m);
    expect(result.output).toMatch(/^\s+alpha\s+Claude Code\s+覆盖\s+~\S+alpha\s+重装 1\.0\.0$/m);
    expect(result.output).toMatch(/^\s+beta-pack\s+Claude Code\s+覆盖\s+~\S+beta-pack\s+2\.0 → 2\.3$/m);
    expect(result.output).toMatch(NOTICE);
  });

  it('再装一次即整目录替换并更新安装标记，不另外询问', async () => {
    const result = await run({
      home: { ...installed('.claude/skills', 'beta-pack', '2.0'), '.claude/skills/beta-pack/notes.md': '装好之后自己加的笔记' },
      answers: installBoth,
    });

    const target = join(result.home, '.claude', 'skills', 'beta-pack');
    expect(read(target, 'SKILL.md')).toBe(SAMPLE_FILES['skills/beta-pack/SKILL.md']);
    expect(existsSync(join(target, 'notes.md'))).toBe(false);
    expect(JSON.parse(read(target, '.oxy-tools.json'))).toMatchObject({ name: 'beta-pack', version: '2.3' });
    expect(result.output).toMatch(/^\s+✓\s+beta-pack\s+Claude Code\s+已安装 2\.0 → 2\.3$/m);
    expect(result.output).toMatch(/^\s+✓\s+alpha\s+Claude Code\s+已安装 1\.0\.0$/m);
  });

  it('两个宿主里只有一处已装：只有那一行是覆盖', async () => {
    const result = await run({
      onPath: BOTH_HOSTS,
      home: installed('.agents/skills', 'alpha', '0.9'),
      answers: [choose('Skill'), accept(), pick('alpha'), choose('开始安装'), choose('退出')],
    });

    expect(result.output).toMatch(/^\s+alpha\s+Claude Code\s+新装\s+~\S+alpha$/m);
    expect(result.output).toMatch(/^\s+Codex\s+覆盖\s+~\S+alpha\s+0\.9 → 1\.0\.0$/m);
    expect(result.output).toMatch(/^\s+✓\s+alpha\s+Claude Code\s+已安装 1\.0\.0$/m);
    expect(result.output).toMatch(/^\s+✓\s+alpha\s+Codex\s+已安装 0\.9 → 1\.0\.0$/m);
  });

  describe('名字长到一行放不下备注时', () => {
    const longName = 'writing-for-agents';
    const catalog = (): string =>
      catalogDir({
        index: {
          version: 1,
          skills: [...SAMPLE_SKILLS, { name: longName, version: '1.0.0', path: `skills/${longName}`, description: { zh: '名字很长的样例', en: 'A long name' } }],
        },
        content: { ...SAMPLE_FILES, [`skills/${longName}/SKILL.md`]: '# 名字很长\n' },
      });

    it('全是新装：表头仍然只有一行，不为没有内容的备注另起一行', async () => {
      const result = await run({
        catalog: catalog(),
        answers: [choose('Skill'), pick(longName), choose('开始安装'), choose('退出')],
      });

      expect(result.output).toMatch(/^\s+条目\s+AI Agent\s+操作\s+位置$/m);
      expect(result.output).not.toContain('备注');
    });

    it('有一条备注放不下，就都另起一行，表头不再有备注一栏', async () => {
      const result = await run({
        catalog: catalog(),
        home: { ...installed('.claude/skills', 'beta-pack', '2.0'), [`.claude/skills/${longName}/SKILL.md`]: '用户自己放的' },
        answers: [choose('Skill'), pick('beta-pack', longName), choose('开始安装'), no(), choose('退出')],
      });

      expect(result.output).toMatch(/^\s+条目\s+AI Agent\s+操作\s+位置$/m);
      expect(result.output).not.toMatch(/^\s+备注$/m);
      expect(result.output).toMatch(/^\s+beta-pack\s+Claude Code\s+覆盖\s+~\S+beta-pack$/m);
      expect(result.output).toMatch(/^\s+2\.0 → 2\.3$/m);
      expect(result.output).toMatch(/^\s+非本工具安装，另行确认$/m);
    });
  });

  it('英文界面下的汇总', async () => {
    const result = await run({
      argv: ['--lang', 'en'],
      home: { ...installed('.claude/skills', 'alpha', '1.0.0'), ...installed('.claude/skills', 'beta-pack', '2.0') },
      answers: [choose('Skills'), pick('alpha', 'beta-pack'), choose('Install'), choose('Exit')],
    });

    expect(result.output).toMatch(/^\s+Entry\s+AI Agent\s+Action\s+Location(\s+Note)?$/m);
    expect(result.output).toMatch(/^\s+alpha\s+Claude Code\s+overwrite\s+~\S+alpha\s+reinstall 1\.0\.0$/m);
    expect(result.output).toMatch(/^\s+beta-pack\s+Claude Code\s+overwrite\s+~\S+beta-pack\s+2\.0 → 2\.3$/m);
    expect(result.output).toMatch(/^\s+Notice\s+Overwriting replaces the whole directory; local changes are lost$/m);
    expect(result.output).toMatch(/^\s+✓\s+beta-pack\s+Claude Code\s+installed 2\.0 → 2\.3$/m);
  });
});

describe('不是本工具装的同名目录', () => {
  afterEach(() => vi.unstubAllGlobals());
  const byHand = (skillsDir: string): Record<string, string> => ({
    [`${skillsDir}/alpha/SKILL.md`]: '用户自己写的 skill',
    [`${skillsDir}/alpha/mine.md`]: '用户自己的文件',
  });
  const untouched = (home: string, skillsDir = '.claude/skills'): void => {
    const target = join(home, ...skillsDir.split('/'), 'alpha');
    expect(readdirSync(target).sort()).toEqual(['SKILL.md', 'mine.md']);
    expect(read(target, 'SKILL.md')).toBe('用户自己写的 skill');
    expect(read(target, 'mine.md')).toBe('用户自己的文件');
  };
  const replaced = (home: string, skillsDir = '.claude/skills'): void => {
    const target = join(home, ...skillsDir.split('/'), 'alpha');
    expect(read(target, 'SKILL.md')).toBe(SAMPLE_FILES['skills/alpha/SKILL.md']);
    expect(existsSync(join(target, 'mine.md'))).toBe(false);
    expect(JSON.parse(read(target, '.oxy-tools.json'))).toMatchObject({ name: 'alpha', version: '1.0.0' });
  };
  const QUESTION = `${join('~', '.claude', 'skills', 'alpha')} 不是本工具装的，要覆盖它吗？`;

  it('汇总里标为覆盖并注明另行确认；选了「开始安装」之后单独再问，默认不覆盖', async () => {
    const result = await run({
      home: byHand('.claude/skills'),
      answers: [choose('Skill'), pick('alpha'), choose('开始安装'), accept(), choose('退出')],
    });

    expect(result.output).toMatch(/^\s+alpha\s+Claude Code\s+覆盖\s+~\S+alpha\s+非本工具安装，另行确认$/m);
    expect(result.output).toMatch(NOTICE);
    expect(result.output.indexOf(QUESTION)).toBeGreaterThan(result.output.indexOf('开始安装吗'));
    expect(result.output).toContain(`? ${QUESTION} (y/N)`);
    untouched(result.home);
  });

  it('拒绝后该目录保持原样，其余选中项照常安装，结果里这一项是跳过', async () => {
    const result = await run({
      home: byHand('.claude/skills'),
      answers: [choose('Skill'), pick('alpha', 'beta-pack'), choose('开始安装'), no(), choose('退出')],
    });

    untouched(result.home);
    expect(read(result.home, '.claude', 'skills', 'beta-pack', 'SKILL.md')).toBe(SAMPLE_FILES['skills/beta-pack/SKILL.md']);
    expect(result.output).toMatch(/^\s+–\s+alpha\s+Claude Code\s+跳过 未同意覆盖，保持原样$/m);
    expect(result.output).toMatch(/^\s+✓\s+beta-pack\s+Claude Code\s+已安装 2\.3$/m);
    expect(result.output).toMatch(/^\s+合计\s+1 成功 · 0 失败 · 1 跳过$/m);
    expect(readdirSync(result.tmp)).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  it('同意后整目录替换，并写入安装标记', async () => {
    const result = await run({
      home: byHand('.claude/skills'),
      answers: [choose('Skill'), pick('alpha'), choose('开始安装'), yes(), choose('退出')],
    });

    replaced(result.home);
    expect(result.output).toMatch(/^\s+✓\s+alpha\s+Claude Code\s+已安装 1\.0\.0$/m);
    expect(result.output).toMatch(/^\s+合计\s+1 成功 · 0 失败 · 0 跳过$/m);
  });

  it('两个宿主下都有时各问各的，各按各的回答办', async () => {
    const result = await run({
      onPath: BOTH_HOSTS,
      home: { ...byHand('.claude/skills'), ...byHand('.agents/skills') },
      answers: [choose('Skill'), accept(), pick('alpha'), choose('开始安装'), yes(), no(), choose('退出')],
    });

    expect(result.output).toContain(`${join('~', '.agents', 'skills', 'alpha')} 不是本工具装的，要覆盖它吗？`);
    replaced(result.home, '.claude/skills');
    untouched(result.home, '.agents/skills');
    expect(result.output).toMatch(/^\s+✓\s+alpha\s+Claude Code\s+已安装 1\.0\.0$/m);
    expect(result.output).toMatch(/^\s+–\s+alpha\s+Codex\s+跳过 未同意覆盖，保持原样$/m);
  });

  it('全都没同意时没有要下载的，不向 GitHub 查询', async () => {
    const github = fakeGitHub();

    const result = await run({
      catalog: githubCatalogSource(),
      home: byHand('.claude/skills'),
      answers: [choose('Skill'), pick('alpha'), choose('开始安装'), no(), choose('退出')],
    });

    expect(github.queries()).toEqual([]);
    expect(result.output).toMatch(/^\s+合计\s+0 成功 · 0 失败 · 1 跳过$/m);
    untouched(result.home);
  });

  it('在这个确认上按 Ctrl+C：什么都不动，以 130 退出', async () => {
    const result = await run({
      home: byHand('.claude/skills'),
      answers: [choose('Skill'), pick('alpha', 'beta-pack'), choose('开始安装'), interrupt()],
    });

    untouched(result.home);
    expect(readdirSync(join(result.home, '.claude', 'skills'))).toEqual(['alpha']);
    expect(result.exitCode).toBe(130);
  });

  it('英文界面下的确认与跳过', async () => {
    const result = await run({
      argv: ['--lang', 'en'],
      home: byHand('.claude/skills'),
      answers: [choose('Skills'), pick('alpha'), choose('Install'), no(), choose('Exit')],
    });

    expect(result.output).toMatch(/\s+overwrite\s+~\S+alpha\s+unmanaged; asked separately$/m);
    expect(result.output).toContain(`? ${join('~', '.claude', 'skills', 'alpha')} is unmanaged. Overwrite it? (y/N)`);
    expect(result.output).toMatch(/^\s+–\s+alpha\s+Claude Code\s+skipped overwrite declined; left as it was$/m);
    expect(result.output).toMatch(/^\s+Total\s+0 succeeded · 0 failed · 1 skipped$/m);
  });
});

describe('目标是符号链接', () => {
  const linked = { home: installed('my-skills', 'alpha', '0.9'), links: { '.claude/skills/alpha': 'my-skills/alpha' } };
  const original = (home: string): void => {
    const dir = join(home, 'my-skills', 'alpha');
    expect(readdirSync(dir).sort()).toEqual(['.oxy-tools.json', 'SKILL.md']);
    expect(read(dir, 'SKILL.md')).toBe('# alpha，装的是 0.9\n');
    expect(JSON.parse(read(dir, '.oxy-tools.json'))).toMatchObject({ version: '0.9' });
  };

  it('同意覆盖只替换链接本身：那里换成装好的目录，链接指向的原目录不被改动', async () => {
    const result = await run({ ...linked, answers: [choose('Skill'), pick('alpha'), choose('开始安装'), yes(), choose('退出')] });

    const target = join(result.home, '.claude', 'skills', 'alpha');
    expect(lstatSync(target).isSymbolicLink()).toBe(false);
    expect(read(target, 'SKILL.md')).toBe(SAMPLE_FILES['skills/alpha/SKILL.md']);
    expect(JSON.parse(read(target, '.oxy-tools.json'))).toMatchObject({ version: '1.0.0' });
    original(result.home);
    expect(result.output).toMatch(/^\s+✓\s+alpha\s+Claude Code\s+已安装 1\.0\.0$/m);
  });

  it('不同意时链接还在，原目录不被改动', async () => {
    const result = await run({ ...linked, answers: [choose('Skill'), pick('alpha'), choose('开始安装'), no(), choose('退出')] });

    expect(lstatSync(join(result.home, '.claude', 'skills', 'alpha')).isSymbolicLink()).toBe(true);
    original(result.home);
  });
});
