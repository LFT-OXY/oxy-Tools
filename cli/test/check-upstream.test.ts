// 辅助接缝：上游核对命令。测试把它当成一条命令来跑，只看输出和退出状态；上游是本地的假仓库目录，不联网。
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EMPTY_CATALOG, SAMPLE_THIRD_PARTY, STACK_FRAME, catalogDir, tempDir, writeTree } from './harness.ts';

const CLI_DIR = fileURLToPath(new URL('..', import.meta.url));
const packageInfo = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  scripts: Record<string, string>;
};
// 跑的就是维护者用的那条命令，只把 node 换成正在跑测试的这一个
const [, ...COMMAND] = (packageInfo.scripts['check-upstream'] ?? '').split(' ');

function check(...args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(process.execPath, [...COMMAND, ...args], { cwd: CLI_DIR }, (error, stdout, stderr) => {
      resolve({ exitCode: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stdout, stderr });
    });
  });
}

/** 一份 SKILL.md：frontmatter 里是它自己声明的名字；extra 是另加的几行 frontmatter */
const skillFile = (name: string, extra = ''): string => `---\nname: ${name}\ndescription: A sample skill\n${extra}---\n\n# ${name}\n`;

/** 假的上游：<仓库目录>/<所有者>/<仓库>/ 下是那个仓库的文件 */
function repos(files: Record<string, string>): string {
  const dir = tempDir('repos');
  writeTree(dir, files);
  return dir;
}

const [KIT, SOLO] = SAMPLE_THIRD_PARTY as [(typeof SAMPLE_THIRD_PARTY)[0], (typeof SAMPLE_THIRD_PARTY)[1]];
const catalog = (...thirdPartySkills: unknown[]): string => catalogDir({ catalog: { ...EMPTY_CATALOG, thirdPartySkills } });

// 和 SAMPLE_THIRD_PARTY 登记的一字不差的上游
const KIT_FILES = {
  'example-labs/paper-kit/skills/paper-reader/SKILL.md': skillFile('paper-reader'),
  'example-labs/paper-kit/skills/paper-comic/SKILL.md': skillFile('paper-comic'),
  'example-labs/paper-kit/skills/paper-deck/SKILL.md': skillFile('paper-deck'),
};
const SOLO_FILES = { 'example-labs/solo-notes/SKILL.md': skillFile('note-taker') };

// 每条用例各起一个 Node 进程，Windows 的 CI 机器上起得慢，放宽超时
describe('上游核对命令', { timeout: 30_000 }, () => {
  it('登记的第三方 Skill 和上游的仓库都对得上时，输出一行通过，以零状态退出', async () => {
    const result = await check(catalog(KIT, SOLO), '--repos', repos({ ...KIT_FILES, ...SOLO_FILES }));

    expect(result.stdout).toBe('上游核对通过：2 个第三方 Skill，共 4 个 skill\n');
    expect(result.stderr).not.toMatch(STACK_FRAME);
    expect(result.exitCode).toBe(0);
  });

  it('目录里登记的 skill 上游没有了：指明是哪个条目、哪个来源、哪个 skill，以非零状态退出', async () => {
    const { 'example-labs/paper-kit/skills/paper-deck/SKILL.md': _removed, ...upstream } = KIT_FILES;
    const result = await check(catalog(KIT), '--repos', repos(upstream));

    expect(result.stderr).toContain('上游核对未通过：有 1 处对不上\n  paper-kit（example-labs/paper-kit）：目录里登记的 paper-deck 在上游没有\n');
    expect(result.stdout).toBe('');
    expect(result.exitCode).toBe(1);
  });

  it('上游多了一个目录里没登记的 skill：指明是哪个，以非零状态退出', async () => {
    const upstream = { ...KIT_FILES, 'example-labs/paper-kit/skills/paper-poster/SKILL.md': skillFile('paper-poster') };
    const result = await check(catalog(KIT), '--repos', repos(upstream));

    expect(result.stderr).toContain('上游核对未通过：有 1 处对不上\n  paper-kit（example-labs/paper-kit）：上游的 paper-poster 没有登记在目录里\n');
    expect(result.stdout).toBe('');
    expect(result.exitCode).toBe(1);
  });

  it('来源仓库不存在：说明仓库不存在，不再逐个报它里面的 skill', async () => {
    const result = await check(catalog(KIT, SOLO), '--repos', repos(SOLO_FILES));

    expect(result.stderr).toContain('上游核对未通过：有 1 处对不上\n  paper-kit（example-labs/paper-kit）：来源仓库不存在\n');
    expect(result.stdout).toBe('');
    expect(result.exitCode).toBe(1);
  });

  it('几个条目各有对不上的：都列出来，照目录里的先后，第一行数出一共几处', async () => {
    const upstream = {
      'example-labs/paper-kit/skills/paper-reader/SKILL.md': skillFile('paper-reader'),
      'example-labs/paper-kit/skills/paper-deck/SKILL.md': skillFile('paper-deck'),
      'example-labs/paper-kit/skills/paper-poster/SKILL.md': skillFile('paper-poster'),
      'example-labs/solo-notes/README.md': '# 这个仓库里已经没有 skill 了\n',
    };
    const result = await check(catalog(KIT, SOLO), '--repos', repos(upstream));

    expect(result.stderr).toContain(
      [
        '上游核对未通过：有 3 处对不上',
        '  paper-kit（example-labs/paper-kit）：目录里登记的 paper-comic 在上游没有',
        '  paper-kit（example-labs/paper-kit）：上游的 paper-poster 没有登记在目录里',
        '  solo-notes（example-labs/solo-notes）：目录里登记的 note-taker 在上游没有',
        '',
      ].join('\n'),
    );
    expect(result.exitCode).toBe(1);
  });

  // 认 skill 的规则照抄 skills CLI：下面每条用例里都有一份「不照它做就会误报」的 SKILL.md
  describe('认上游有哪些 skill，和 skills CLI 一样', () => {
    const passes = async (entry: unknown, upstream: Record<string, string>): Promise<void> => {
      const result = await check(catalog(entry), '--repos', repos(upstream));

      expect(result.stderr).not.toContain('上游核对未通过');
      expect(result.stdout).toContain('上游核对通过');
      expect(result.exitCode).toBe(0);
    };

    it('仓库根就是一个 skill 时只有这一个，里面带的样例不算', async () => {
      await passes(SOLO, { ...SOLO_FILES, 'example-labs/solo-notes/examples/demo/SKILL.md': skillFile('demo') });
    });

    it('约定的位置（skills 目录）里找到了，别处的 SKILL.md 就不算', async () => {
      await passes(KIT, { ...KIT_FILES, 'example-labs/paper-kit/docs/templates/starter/SKILL.md': skillFile('starter') });
    });

    it('仓库根下一层的目录也是约定的位置', async () => {
      await passes(SOLO, {
        'example-labs/solo-notes/note-taker/SKILL.md': skillFile('note-taker'),
        'example-labs/solo-notes/docs/templates/starter/SKILL.md': skillFile('starter'),
      });
    });

    it('skills 目录下可以再分一两层；skill 自己目录里面的 SKILL.md 不算', async () => {
      await passes(KIT, {
        'example-labs/paper-kit/skills/research/paper-reader/SKILL.md': skillFile('paper-reader'),
        'example-labs/paper-kit/skills/research/visual/paper-comic/SKILL.md': skillFile('paper-comic'),
        'example-labs/paper-kit/skills/paper-deck/SKILL.md': skillFile('paper-deck'),
        'example-labs/paper-kit/skills/paper-deck/examples/inner/SKILL.md': skillFile('inner'),
        'example-labs/paper-kit/skills/node_modules/vendored/dep/SKILL.md': skillFile('dep'),
        'example-labs/paper-kit/skills/a/b/c/too-deep/SKILL.md': skillFile('too-deep'),
      });
    });

    // skills CLI 是拿路径去问文件系统的，macOS 和 Windows 上不分大小写；sammcj/agentic-coding 就是这个样子
    it('约定的位置和 SKILL.md 的名字不分大小写', async () => {
      await passes(KIT, {
        'example-labs/paper-kit/Skills/paper-reader/SKILL.md': skillFile('paper-reader'),
        'example-labs/paper-kit/Skills/paper-comic/skill.md': skillFile('paper-comic'),
        'example-labs/paper-kit/Skills/paper-deck/Skill.MD': skillFile('paper-deck'),
        'example-labs/paper-kit/Skills_disabled/retired/SKILL.md': skillFile('retired'),
      });
    });

    it('agent 的项目级 skill 目录也是约定的位置，同名的几份只算一个', async () => {
      await passes(KIT, {
        'example-labs/paper-kit/.claude/skills/paper-reader/SKILL.md': skillFile('paper-reader'),
        'example-labs/paper-kit/.agents/skills/paper-reader/SKILL.md': skillFile('paper-reader'),
        'example-labs/paper-kit/.agents/skills/paper-comic/SKILL.md': skillFile('paper-comic'),
        'example-labs/paper-kit/.codex/skills/paper-deck/SKILL.md': skillFile('paper-deck'),
      });
    });

    it('约定的位置里一个都没有时，仓库里别处的才算，但不进 node_modules，也不找到五层以下', async () => {
      await passes(SOLO, {
        'example-labs/solo-notes/packages/notes/note-taker/SKILL.md': skillFile('note-taker'),
        'example-labs/solo-notes/packages/node_modules/dep/SKILL.md': skillFile('dep'),
        'example-labs/solo-notes/a/b/c/d/e/too-deep/SKILL.md': skillFile('too-deep'),
      });
    });

    it('插件清单指到的目录也找：插件目录下的 skills，和清单里逐个列出的路径', async () => {
      await passes(KIT, {
        'example-labs/paper-kit/skills/paper-deck/SKILL.md': skillFile('paper-deck'),
        'example-labs/paper-kit/.claude-plugin/marketplace.json': JSON.stringify({
          plugins: [
            { name: 'reader', source: './plugins/reader' },
            { name: 'comic', source: './plugins/comic', skills: ['./custom/paper-comic'] },
            { name: 'escaping', source: './../elsewhere' },
          ],
        }),
        'example-labs/paper-kit/plugins/reader/skills/paper-reader/SKILL.md': skillFile('paper-reader'),
        'example-labs/paper-kit/plugins/comic/custom/paper-comic/SKILL.md': skillFile('paper-comic'),
        'example-labs/paper-kit/plugins/unlisted/skills/stray/SKILL.md': skillFile('stray'),
      });
    });

    it('比的是 skill 自己声明的名字，不分大小写；不是它所在目录的名字', async () => {
      await passes(KIT, {
        'example-labs/paper-kit/skills/reader/SKILL.md': skillFile('Paper-Reader'),
        'example-labs/paper-kit/skills/comic/SKILL.md': skillFile('PAPER-COMIC'),
        'example-labs/paper-kit/skills/deck/SKILL.md': skillFile('"paper-deck\\n"'),
      });
    });

    // skills CLI 按名字选 skill 时只转小写，不把空格换成连字符：登记成装出来的目录名也选不中
    it('声明的名字带空格的 skill 按名字装不上：登记的算上游没有，上游的那个照它声明的样子报', async () => {
      const upstream = { ...KIT_FILES, 'example-labs/paper-kit/skills/paper-reader/SKILL.md': skillFile('Paper Reader') };
      const result = await check(catalog(KIT), '--repos', repos(upstream));

      expect(result.stderr).toContain(
        '上游核对未通过：有 2 处对不上\n' +
          '  paper-kit（example-labs/paper-kit）：目录里登记的 paper-reader 在上游没有\n' +
          '  paper-kit（example-labs/paper-kit）：上游的 paper reader 没有登记在目录里\n',
      );
      expect(result.exitCode).toBe(1);
    });

    it('skills 下的 .curated、.experimental、.system 也是约定的位置', async () => {
      await passes(KIT, {
        'example-labs/paper-kit/skills/.curated/paper-reader/SKILL.md': skillFile('paper-reader'),
        'example-labs/paper-kit/skills/.experimental/paper-comic/SKILL.md': skillFile('paper-comic'),
        'example-labs/paper-kit/skills/.system/paper-deck/SKILL.md': skillFile('paper-deck'),
        'example-labs/paper-kit/docs/templates/starter/SKILL.md': skillFile('starter'),
      });
    });

    it('仓库根自己是一个插件（plugin.json）时，它列出的路径所在的目录也找', async () => {
      await passes(KIT, {
        'example-labs/paper-kit/skills/paper-deck/SKILL.md': skillFile('paper-deck'),
        'example-labs/paper-kit/.claude-plugin/plugin.json': JSON.stringify({
          name: 'paper-kit',
          skills: ['./bundled/paper-reader', './bundled/paper-comic', '../outside/escaping', 'no-dot/ignored'],
        }),
        'example-labs/paper-kit/bundled/paper-reader/SKILL.md': skillFile('paper-reader'),
        'example-labs/paper-kit/bundled/paper-comic/SKILL.md': skillFile('paper-comic'),
        'example-labs/paper-kit/no-dot/sibling/SKILL.md': skillFile('sibling'),
      });
    });

    it('读不出名字和说明的 SKILL.md 不算一个 skill', async () => {
      const upstream = {
        ...KIT_FILES,
        'example-labs/paper-kit/skills/paper-deck/SKILL.md': '# paper-deck\n\n没有 frontmatter\n',
        'example-labs/paper-kit/skills/no-description/SKILL.md': '---\nname: no-description\n---\n',
        'example-labs/paper-kit/skills/numeric/SKILL.md': '---\nname: 42\ndescription: 名字不是文字\n---\n',
        'example-labs/paper-kit/skills/broken/SKILL.md': '---\nname: [broken\ndescription: 头部不是合法的 YAML\n---\n',
      };
      const result = await check(catalog(KIT), '--repos', repos(upstream));

      expect(result.stderr).toContain('上游核对未通过：有 1 处对不上\n  paper-kit（example-labs/paper-kit）：目录里登记的 paper-deck 在上游没有\n');
      expect(result.stderr).not.toMatch(STACK_FRAME);
      expect(result.exitCode).toBe(1);
    });

    it('作者自己装进仓库的别人的 skill（记在 skills-lock.json 里的）不算', async () => {
      await passes(KIT, {
        ...KIT_FILES,
        'example-labs/paper-kit/skills-lock.json': JSON.stringify({ version: 1, skills: { borrowed: { source: 'someone/else' } } }),
        'example-labs/paper-kit/.claude/skills/borrowed/SKILL.md': skillFile('borrowed'),
      });
    });

    it.each([
      ['版本太旧', JSON.stringify({ version: 0, skills: { borrowed: {} } })],
      ['不是合法的 JSON', '{ "version": 1, "skills": {'],
    ])('skills-lock.json %s时不作数：agent 目录下的 skill 照常算上游的', async (_label, lock) => {
      const upstream = { ...KIT_FILES, 'example-labs/paper-kit/skills-lock.json': lock, 'example-labs/paper-kit/.claude/skills/borrowed/SKILL.md': skillFile('borrowed') };
      const result = await check(catalog(KIT), '--repos', repos(upstream));

      expect(result.stderr).toContain('上游核对未通过：有 1 处对不上\n  paper-kit（example-labs/paper-kit）：上游的 borrowed 没有登记在目录里\n');
      expect(result.exitCode).toBe(1);
    });

    it('标了 internal 的 skill：登记了的算对得上，没登记的不报', async () => {
      const internal = 'metadata:\n  internal: true\n';
      await passes(KIT, {
        ...KIT_FILES,
        'example-labs/paper-kit/skills/paper-deck/SKILL.md': skillFile('paper-deck', internal),
        'example-labs/paper-kit/skills/maintainers-only/SKILL.md': skillFile('maintainers-only', internal),
      });
    });
  });

  it('上游的名字里夹着终端控制码时，打出来的名字里没有它', async () => {
    const upstream = { ...KIT_FILES, 'example-labs/paper-kit/skills/poster/SKILL.md': skillFile('"pa\\aper\\e[2Jposter"') };
    const result = await check(catalog(KIT), '--repos', repos(upstream));

    expect(result.stderr).toContain('上游的 paperposter 没有登记在目录里');
    expect(result.stderr).not.toMatch(/[\x00-\x09\x0b-\x1f\x7f-\x9f]/);
    expect(result.exitCode).toBe(1);
  });

  it('只报告：跑完之后两个目录文件一字没变', async () => {
    const dir = catalog(KIT, SOLO);
    const before = ['index.json', 'catalog.json'].map((file) => readFileSync(join(dir, file), 'utf8'));
    const result = await check(dir, '--repos', repos(SOLO_FILES));

    expect(result.exitCode).toBe(1);
    expect(['index.json', 'catalog.json'].map((file) => readFileSync(join(dir, file), 'utf8'))).toEqual(before);
  });

  it('目录里一个第三方 Skill 都没有时也算通过', async () => {
    const result = await check(catalogDir(), '--repos', repos({}));

    expect(result.stdout).toBe('上游核对通过：0 个第三方 Skill，共 0 个 skill\n');
    expect(result.exitCode).toBe(0);
  });

  it('目录里有写坏的第三方 Skill 条目时不算通过：说明有几条没有核对、先跑目录校验；其余的照常核对', async () => {
    const { 'example-labs/paper-kit/skills/paper-deck/SKILL.md': _removed, ...upstream } = KIT_FILES;
    const result = await check(catalog(KIT, { ...SOLO, source: 'https://github.com/example-labs/solo-notes' }), '--repos', repos(upstream));

    expect(result.stderr).toContain(
      '上游核对未通过：有 1 处对不上，另有 1 个第三方 Skill 条目在目录里写坏了、没有核对（先跑 npm run validate-catalog）\n' +
        '  paper-kit（example-labs/paper-kit）：目录里登记的 paper-deck 在上游没有\n',
    );
    expect(result.stdout).toBe('');
    expect(result.exitCode).toBe(1);
  });

  it('只有写坏的条目、其余都对得上时，同样不算通过', async () => {
    const result = await check(catalog(KIT, 'solo-notes'), '--repos', repos(KIT_FILES));

    expect(result.stderr).toContain('上游核对未通过：有 1 个第三方 Skill 条目在目录里写坏了、没有核对（先跑 npm run validate-catalog）\n');
    expect(result.stdout).toBe('');
    expect(result.exitCode).toBe(1);
  });

  it('整份目录读不了：说明原因和文件的位置，以非零状态退出，不显示堆栈', async () => {
    const dir = catalogDir({ catalog: null });
    const result = await check(dir, '--repos', repos({}));

    expect(result.stderr).toContain('上游核对未通过');
    expect(result.stderr).toMatch(/读不到 catalog\.json/);
    expect(result.stderr).toContain(dir);
    expect(result.stderr).not.toMatch(STACK_FRAME);
    expect(result.stdout).toBe('');
    expect(result.exitCode).toBe(1);
  });

  it.each([
    ['没给目录', []],
    ['多给了参数', ['one', 'two']],
    ['--repos 后面没有目录', ['one', '--repos']],
    ['不认识的选项', ['one', '--offline']],
  ])('%s：给出用法，以状态 2 退出', async (_label, args) => {
    const result = await check(...args);

    expect(result.stderr).toContain('用法：npm run check-upstream -- <目录> [--repos <仓库目录>]');
    expect(result.stdout).toBe('');
    expect(result.exitCode).toBe(2);
  });

  it('--repos 给的不是目录：照实说，以状态 2 退出，不把每个来源都报成仓库不存在', async () => {
    const missing = join(tempDir('repos'), 'no-such-dir');
    const result = await check(catalog(KIT, SOLO), '--repos', missing);

    expect(result.stderr).toContain(`--repos 给的不是一个目录：${missing}`);
    expect(result.stderr).not.toContain('来源仓库不存在');
    expect(result.stdout).toBe('');
    expect(result.exitCode).toBe(2);
  });

  it('--repos 可以写在目录前面', async () => {
    const result = await check('--repos', repos(SOLO_FILES), catalog(SOLO));

    expect(result.stdout).toBe('上游核对通过：1 个第三方 Skill，共 1 个 skill\n');
    expect(result.exitCode).toBe(0);
  });
});
