import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { githubCatalogSource } from '../src/catalog.ts';
import { displayWidth } from '../src/text.ts';
import { fakeGitHub } from './github.ts';
import {
  EMPTY_CATALOG,
  KEYED_MCP,
  SAMPLE_MCPS,
  SAMPLE_THIRD_PARTY,
  SAMPLE_TOOLS,
  STACK_FRAME,
  accept,
  catalogDir,
  choose,
  no,
  pick,
  run,
  secret,
  writeTree,
  yes,
} from './harness.ts';

// 「联网搜索与文档检索」下有两条第三方 Skill：paper-kit（含 paper-reader、paper-comic、paper-deck 三个 skill）
// 和 solo-notes（只含 note-taker 一个）
const WEB_SEARCH = '联网搜索与文档检索';
const [KIT, SOLO] = SAMPLE_THIRD_PARTY as [(typeof SAMPLE_THIRD_PARTY)[0], (typeof SAMPLE_THIRD_PARTY)[1]];
const THIRD_PARTY = { ...EMPTY_CATALOG, thirdPartySkills: SAMPLE_THIRD_PARTY };
const thirdParty = (catalog: Record<string, unknown> = {}): string => catalogDir({ catalog: { ...THIRD_PARTY, ...catalog } });
const BOTH_HOSTS = ['claude', 'codex'];
const LIST = '? 选择要安装的条目';
const CHECKLIST = '? paper-kit 里有 3 个 skill，选择要装的';

// 2026-10-10 对照 skills CLI 1.7.2 的源码和实测核对过的写法：source 紧跟 add，一条命令一个 skill、一个宿主；
// 两个环境变量关掉它的遥测，CLAUDE_CONFIG_DIR 清空是为了让它装到 ~/.claude/skills
const NO_TELEMETRY = { DISABLE_TELEMETRY: '1', DO_NOT_TRACK: '1' };
const add = (source: string, skill: string, agent: 'claude-code' | 'codex') => ({
  command: 'npx',
  args: ['-y', 'skills@1', 'add', source, '--skill', skill, '--agent', agent, '--yes', '--global'],
  env: agent === 'claude-code' ? { ...NO_TELEMETRY, CLAUDE_CONFIG_DIR: '' } : NO_TELEMETRY,
});
const SOLO_INTO_CLAUDE = add('example-labs/solo-notes', 'note-taker', 'claude-code');
const SOLO_INTO_CODEX = add('example-labs/solo-notes', 'note-taker', 'codex');

// skills CLI 把全局的 skill 装到哪：每个宿主一个目录，相对主目录
const SKILLS_DIR: Record<string, string> = { 'claude-code': '.claude/skills', codex: '.agents/skills' };
// 假装 skills CLI 装上了：「执行」那条命令时往它该落的位置写出 SKILL.md。except 里的 skill 装不上（什么都不写）
const installs =
  (except: string[] = []) =>
  (command: string, args: readonly string[], { home }: { home: string }): undefined => {
    if (command !== 'npx') return;
    const skill = args[args.indexOf('--skill') + 1] ?? '';
    const agent = args[args.indexOf('--agent') + 1] ?? '';
    if (!except.includes(skill)) writeTree(home, { [`${SKILLS_DIR[agent]}/${skill}/SKILL.md`]: `# ${skill}（作者的最新版）\n` });
  };

const summaryOf = (output: string): string => output.slice(output.indexOf('── 将安装'), output.indexOf('? 开始安装吗'));
// 折行会打断整条命令：把空白并成一个空格再比
const flat = (text: string): string => text.replace(/\s+/g, ' ');
const inOrder = (screen: string, texts: string[]): void => {
  const order = texts.map((text) => screen.indexOf(text));
  expect(order).not.toContain(-1);
  expect(order).toEqual([...order].sort((a, b) => a - b));
};

describe('混合列表里的第三方 Skill', () => {
  it('自成一段，排在本仓库的 skill 之后、MCP 之前，段首写明内容直接来自作者', async () => {
    const result = await run({
      catalog: thirdParty({ mcps: SAMPLE_MCPS, skillPurposes: { alpha: 'web-search' } }),
      answers: [choose(WEB_SEARCH), pick(), choose('退出')],
    });

    expect(result.output).toMatch(
      /^\s+── Skill\n □ alpha\s.*\n\s+── 第三方 Skill · 内容直接来自作者\n □ paper-kit\s+未装\s+含三个 skill 的样例第三方 Skill.*…\n □ solo-notes\s+未装\s+只含一个 skill 的样例第三方 Skill\n\s+── MCP\n □ docs-local\s/m,
    );
  });

  it('列表下方的「类型」一行写的是第三方 Skill，说明是全文', async () => {
    const result = await run({ catalog: thirdParty(), answers: [choose(WEB_SEARCH), pick(), choose('退出')] });

    expect(result.output).toContain(`第三方 Skill\n${KIT.description.zh}`);
  });

  it('主菜单上用途的数量把它们算进去；「目录」一行和本仓库的 skill 合在一起数', async () => {
    const result = await run({ catalog: thirdParty(), answers: [choose('退出')] });

    expect(result.output).toMatch(/^\s+目录\s+4 Skill$/m);
    expect(result.output).toMatch(/^\s+联网搜索与文档检索\s+2$/m);
  });

  it('状态只看目标位置下有没有那个目录：含多个的写已装几个、共几个，只含一个的写已装', async () => {
    const result = await run({
      catalog: thirdParty(),
      // 目录在就算，里面有没有 SKILL.md 不管
      home: { '.claude/skills/paper-comic/notes.txt': '用户自己放的\n', '.claude/skills/note-taker/SKILL.md': '# note-taker\n' },
      answers: [choose(WEB_SEARCH), pick(), choose('退出')],
    });

    expect(result.output).toMatch(/^ □ paper-kit\s+已装 1\/3\s/m);
    expect(result.output).toMatch(/^ □ solo-notes\s+已装\s{2,}只含一个 skill/m);
  });

  it('两个宿主：每个宿主一栏状态，各看各的 skill 目录', async () => {
    const result = await run({
      catalog: thirdParty(),
      onPath: BOTH_HOSTS,
      home: { '.agents/skills/note-taker/SKILL.md': '# note-taker\n', '.claude/skills/paper-reader/SKILL.md': '# paper-reader\n' },
      answers: [choose(WEB_SEARCH), accept(), pick(), pick(), choose('退出')],
    });
    const list = result.output.split(LIST)[1] ?? '';

    expect(list).toMatch(/^\s+名称\s+Claude Code\s+Codex\s/m);
    expect(list).toMatch(/^ □ paper-kit\s+已装 1\/3\s+未装\s/m);
    expect(list).toMatch(/^ □ solo-notes\s+未装\s+已装\s/m);
  });

  it('带推荐标记的排在段首并写着「推荐」，也出现在「推荐」里', async () => {
    const catalog = thirdParty({ thirdPartySkills: [KIT, { ...SOLO, recommended: true }] });
    const purpose = await run({ catalog, answers: [choose(WEB_SEARCH), pick(), choose('退出')] });
    const recommended = await run({ catalog, answers: [choose('推荐'), pick(), choose('退出')] });

    expect(purpose.output).toMatch(/── 第三方 Skill · 内容直接来自作者\n □ solo-notes\s+未装\s+推荐 · 只含一个 skill.*\n □ paper-kit\s/);
    expect(recommended.output).toMatch(/^\s+推荐\s+3$/m);
    expect(recommended.output).toMatch(/── 第三方 Skill · 内容直接来自作者\n □ solo-notes\s+未装\s+只含一个 skill/);
    expect(recommended.output.split(LIST)[1]).not.toContain('paper-kit');
  });

  it('一个宿主都没检测到：不可选，写明需要 AI Agent', async () => {
    const result = await run({ catalog: thirdParty(), onPath: [], answers: [choose(WEB_SEARCH), pick(), choose('退出')] });

    expect(result.output).toMatch(/^\s+名称\s+状态\s+说明\n\s+── 第三方 Skill · 内容直接来自作者\n – paper-kit\s+需要 AI Agent\s/m);
    expect(result.commands).toEqual([]);
  });

  it('任何一行不超过 79 列，英文界面也是', async () => {
    const zh = await run({ catalog: thirdParty(), onPath: BOTH_HOSTS, answers: [choose(WEB_SEARCH), accept(), pick('paper-kit'), pick(), choose('退出')] });
    const en = await run({
      catalog: thirdParty(),
      onPath: BOTH_HOSTS,
      argv: ['--lang', 'en'],
      answers: [choose('Web search & docs retrieval'), accept(), pick('paper-kit'), pick(), choose('Exit')],
    });

    for (const { output } of [zh, en]) {
      const rows = output.split('\n').filter((line) => /^ [□■–] /.test(line) || /── /.test(line));
      expect(rows.length).toBeGreaterThan(4);
      expect(Math.max(...rows.map(displayWidth))).toBeLessThanOrEqual(79);
    }
    expect(en.output).toContain('── Third-party skills · content comes straight from the author');
    expect(en.output).toContain(`Third-party skill\n${KIT.description.en}`);
    expect(en.output).toContain('? paper-kit has 3 skills; pick the ones to install');
  });
});

describe('第三方 Skill 的宿主限制', () => {
  const codexOnly = (): string => thirdParty({ thirdPartySkills: [KIT, { ...SOLO, hosts: ['codex'] }] });

  it('所选的宿主一个都不支持：不可选，原因写在状态的位置', async () => {
    const result = await run({ catalog: codexOnly(), answers: [choose(WEB_SEARCH), pick(), choose('退出')] });

    expect(result.output).toMatch(/^ – solo-notes\s+需要别的 AI Agent\s/m);
    expect(result.output).toMatch(/^ □ paper-kit\s+未装\s/m);
  });

  it('只支持其中一部分：不支持的那一栏写「不支持」，只装进支持的那些', async () => {
    const result = await run({
      catalog: codexOnly(),
      onPath: BOTH_HOSTS,
      commandResult: installs(),
      answers: [choose(WEB_SEARCH), accept(), pick('solo-notes'), choose('开始安装'), choose('退出')],
    });

    expect(result.output.split(LIST)[1]).toMatch(/^ □ solo-notes\s+不支持\s+未装\s/m);
    expect(summaryOf(result.output)).not.toMatch(/Claude Code/);
    expect(result.commands).toEqual([SOLO_INTO_CODEX]);
    expect(result.output).toMatch(/^\s+✓\s+note-taker\s+Codex\s+已安装$/m);
    expect(existsSync(join(result.home, '.claude'))).toBe(false);
  });

  it('宿主限制里有不认识的宿主时照常可用', async () => {
    const result = await run({
      catalog: thirdParty({ thirdPartySkills: [{ ...SOLO, hosts: ['claude-code', 'some-future-agent'] }] }),
      answers: [choose(WEB_SEARCH), pick('solo-notes'), choose('取消'), choose('退出')],
    });

    expect(result.output).not.toContain('格式有误');
    expect(summaryOf(result.output)).toMatch(/^\s+note-taker\s+Claude Code\s+新装\s/m);
  });
});

describe('写坏的第三方 Skill 条目', () => {
  it.each([
    ['来源不是「所有者/仓库」', { source: 'https://github.com/example-labs/solo-notes' }],
    ['来源会被当成本地路径', { source: '../solo-notes' }],
    ['skill 的名字会被当成选项', { skills: [{ ...SOLO.skills[0], name: '--all' }] }],
    ['skill 的名字带大写字母', { skills: [{ ...SOLO.skills[0], name: 'Note-Taker' }] }],
    ['skill 的名字里连字符连着写', { skills: [{ ...SOLO.skills[0], name: 'note--taker' }] }],
    ['一个 skill 都没有', { skills: [] }],
    ['没有用途', { purpose: undefined }],
    ['用途不在清单里', { purpose: 'nowhere' }],
  ])('%s：只跳过这一条并提示数量，其余照常', async (_label, overrides) => {
    const result = await run({
      catalog: thirdParty({ thirdPartySkills: [{ ...SOLO, ...overrides }, KIT] }),
      answers: [choose(WEB_SEARCH), pick(), choose('退出')],
    });

    expect(result.output).toMatch(/^\s+注意\s+目录中有 1 个条目格式有误，已跳过$/m);
    expect(result.output).toMatch(/^\s+目录\s+3 Skill$/m);
    expect(result.output).toMatch(/^ □ paper-kit\s/m);
    expect(result.output).not.toContain('solo-notes');
    expect(result.exitCode).toBe(0);
  });

  it('没有第三方 Skill 数组的旧格式目录照常读得了', async () => {
    const result = await run({ catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: SAMPLE_MCPS } }), answers: [choose('退出')] });

    expect(result.output).not.toContain('格式有误');
    expect(result.output).toMatch(/^\s+目录\s+2 Skill · 2 MCP$/m);
    expect(result.exitCode).toBe(0);
  });
});

describe('安装只含一个 skill 的第三方 Skill', () => {
  const soloAnswers = [choose(WEB_SEARCH), pick('solo-notes'), choose('开始安装'), choose('退出')];

  it('勾选后不再多问，直接是汇总：一张「第三方 Skill」小表，一行是那个 skill 和它将装到的位置', async () => {
    const result = await run({ catalog: thirdParty(), answers: [choose(WEB_SEARCH), pick('solo-notes'), choose('取消'), choose('退出')] });
    const summary = summaryOf(result.output);

    expect(result.output).not.toContain('选择要装的');
    expect(summary).toMatch(/^── 将安装 1 项 ─+$/m);
    expect(summary).toMatch(/^\s+第三方 Skill\s+AI Agent\s+操作\s+位置\n\s+note-taker\s+Claude Code\s+新装\s+~\S+note-taker$/m);
  });

  it('命令列在「将执行的命令」里，完整展示；下方提醒装的是作者当时的最新版', async () => {
    const result = await run({ catalog: thirdParty(), answers: [choose(WEB_SEARCH), pick('solo-notes'), choose('取消'), choose('退出')] });
    const summary = summaryOf(result.output);

    expect(summary).toMatch(/^── 将执行 1 条命令 ─+$/m);
    expect(flat(summary)).toContain(' 1 npx -y skills@1 add example-labs/solo-notes --skill note-taker --agent claude-code --yes --global ');
    expect(summary).toMatch(/^\s+注意\s+第三方 Skill 装的是作者当时的最新版，维护者没有逐版检查\n\n$/m);
    // 取消了：命令已经展示，但一条都没执行
    expect(result.commands).toEqual([]);
    expect(readdirSync(result.home)).toEqual([]);
  });

  it('确认后执行的就是展示的那一条：命令和参数分开传，带着关遥测的环境变量，不经 shell', async () => {
    const result = await run({ catalog: thirdParty(), commandResult: installs(), answers: soloAnswers });

    expect(result.commands).toEqual([SOLO_INTO_CLAUDE]);
    expect(result.commands[0]).not.toHaveProperty('shell');
    expect(result.commands[0]?.env).toMatchObject({ DISABLE_TELEMETRY: '1', DO_NOT_TRACK: '1' });
  });

  it('命令结束后目标位置有 SKILL.md 才算装上：结果一行「已安装」，没有版本号', async () => {
    const result = await run({ catalog: thirdParty(), commandResult: installs(), answers: soloAnswers });

    inOrder(result.screen, ['? 开始安装吗', '已安装', '1 成功 · 0 失败 · 0 跳过']);
    expect(result.output).toMatch(/^\s+✓\s+note-taker\s+Claude Code\s+已安装$/m);
    expect(result.screen).toMatch(/^── 结果 ─+$/m);
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });

  it('进行中的那一行写「正在安装」', async () => {
    const result = await run({ catalog: thirdParty(), commandResult: installs(), answers: soloAnswers });

    expect(result.output).toMatch(/note-taker\s+Claude Code\s+正在安装…/);
  });

  it('装完再进列表，看到的是新状态', async () => {
    const result = await run({
      catalog: thirdParty(),
      commandResult: installs(),
      answers: [choose(WEB_SEARCH), pick('solo-notes'), choose('开始安装'), choose(WEB_SEARCH), pick(), choose('退出')],
    });

    expect(result.output.split(LIST)[1]).toMatch(/^ □ solo-notes\s+未装\s/m);
    expect(result.output.split(LIST)[2]).toMatch(/^ □ solo-notes\s+已装\s/m);
  });

  it('两个宿主：每个宿主各一条命令、各一行结果', async () => {
    const result = await run({
      catalog: thirdParty(),
      onPath: BOTH_HOSTS,
      commandResult: installs(),
      answers: [choose(WEB_SEARCH), accept(), pick('solo-notes'), choose('开始安装'), choose('退出')],
    });
    const summary = summaryOf(result.output);

    expect(summary).toMatch(/^\s+note-taker\s+Claude Code\s+新装\s+~\S+\.claude\S+note-taker\n\s+Codex\s+新装\s+~\S+\.agents\S+note-taker$/m);
    expect(summary).toMatch(/^── 将执行 2 条命令 ─+$/m);
    expect(result.commands).toEqual([SOLO_INTO_CLAUDE, SOLO_INTO_CODEX]);
    expect(result.screen).toMatch(/✓\s+note-taker\s+Claude Code\s+已安装\n\s+✓\s+note-taker\s+Codex\s+已安装\n/);
    expect(result.screen).toMatch(/^\s+合计\s+2 成功 · 0 失败 · 0 跳过$/m);
    expect(readFileSync(join(result.home, '.claude/skills/note-taker/SKILL.md'), 'utf8')).toContain('note-taker');
    expect(readFileSync(join(result.home, '.agents/skills/note-taker/SKILL.md'), 'utf8')).toContain('note-taker');
  });

  it('英文界面：小表的表头、提醒和结果', async () => {
    const result = await run({
      catalog: thirdParty(),
      argv: ['--lang', 'en'],
      commandResult: installs(),
      answers: [choose('Web search & docs retrieval'), pick('solo-notes'), choose('Install'), choose('Exit')],
    });

    expect(result.output).toMatch(/^── Install 1 item ─+$/m);
    expect(result.output).toMatch(/^\s+Third-party skills\s+AI Agent\s+Action\s+Location\n\s+note-taker\s+Claude Code\s+new\s/m);
    expect(flat(result.output)).toContain('Notice Third-party skills are installed at the author\'s latest version at that moment; the maintainer has not reviewed each version');
    expect(result.output).toMatch(/^\s+✓\s+note-taker\s+Claude Code\s+installed$/m);
  });
});

describe('第三方 Skill 装不上', () => {
  const soloAnswers = [choose(WEB_SEARCH), pick('solo-notes'), choose('开始安装'), choose('退出')];

  it('命令以 0 退出而目标位置没有 SKILL.md：判失败', async () => {
    const result = await run({ catalog: thirdParty(), commandResult: installs(['note-taker']), answers: soloAnswers });

    expect(result.commands).toEqual([SOLO_INTO_CLAUDE]);
    expect(result.output).toMatch(/^\s+✗\s+note-taker\s+Claude Code\s+失败 安装命令已结束，但目标位置没有 SKILL\.md$/m);
    expect(result.output).toMatch(/^\s+合计\s+0 成功 · 1 失败 · 0 跳过$/m);
    expect(result.exitCode).toBe(0);
  });

  it('目标位置只有目录、没有 SKILL.md 也判失败', async () => {
    const result = await run({
      catalog: thirdParty(),
      commandResult: (_command, _args, { home }) => void writeTree(home, { '.claude/skills/note-taker/README.md': '半截\n' }),
      answers: soloAnswers,
    });

    expect(result.output).toMatch(/^\s+✗\s+note-taker\s+Claude Code\s+失败 安装命令已结束，但目标位置没有 SKILL\.md$/m);
  });

  it('命令非零退出：结果行只说哪一步、退出状态几', async () => {
    const result = await run({ catalog: thirdParty(), commandResult: () => ({ exitCode: 1 }), answers: soloAnswers });

    expect(result.output).toMatch(/^\s+✗\s+note-taker\s+Claude Code\s+失败 安装命令退出状态 1$/m);
    expect(result.output).not.toMatch(STACK_FRAME);
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });

  it('命令没能运行：写「没能运行」加错误码，不取错误的消息', async () => {
    const result = await run({
      catalog: thirdParty(),
      commandResult: () => Object.assign(new Error('spawn npx ENOENT: 找不到 npx 这个程序'), { code: 'ENOENT' }),
      answers: soloAnswers,
    });

    expect(result.output).toMatch(/^\s+✗\s+note-taker\s+Claude Code\s+失败 安装命令没能运行（ENOENT）$/m);
    expect(result.output).not.toContain('找不到 npx 这个程序');
    expect(result.output).not.toMatch(STACK_FRAME);
    expect(result.exitCode).toBe(0);
  });

  it('执行器当场抛出：同样只是这一项失败', async () => {
    const result = await run({
      catalog: thirdParty(),
      commandResult: () => {
        throw new Error('执行器自己坏了');
      },
      answers: soloAnswers,
    });

    expect(result.output).toMatch(/^\s+✗\s+note-taker\s+Claude Code\s+失败 安装命令没能运行$/m);
    expect(result.output).not.toContain('执行器自己坏了');
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });

  it('一项失败不影响其余项：同一个仓库里别的 skill、另一个宿主都照常', async () => {
    const result = await run({
      catalog: thirdParty(),
      onPath: BOTH_HOSTS,
      // paper-comic 装不上，别的照常
      commandResult: (command, args, context) => {
        if (args.includes('paper-comic')) return { exitCode: 1 };
        return installs()(command, args, context);
      },
      answers: [choose(WEB_SEARCH), accept(), pick('paper-kit'), pick('paper-reader', 'paper-comic'), choose('开始安装'), choose('退出')],
    });

    expect(result.screen).toMatch(
      /✓\s+paper-reader\s+Claude Code\s+已安装\n\s+✓\s+paper-reader\s+Codex\s+已安装\n\s+✗\s+paper-comic\s+Claude Code\s+失败 安装命令退出状态 1\n\s+✗\s+paper-comic\s+Codex\s+失败 安装命令退出状态 1\n/,
    );
    expect(result.screen).toMatch(/^\s+合计\s+2 成功 · 2 失败 · 0 跳过$/m);
    expect(result.commands).toHaveLength(4);
  });

  it('英文界面的几种说法', async () => {
    const english = { argv: ['--lang', 'en'], answers: [choose('Web search & docs retrieval'), pick('solo-notes'), choose('Install'), choose('Exit')] };
    const missing = await run({ catalog: thirdParty(), ...english });
    const exited = await run({ catalog: thirdParty(), commandResult: () => ({ exitCode: 2 }), ...english });
    const notStarted = await run({ catalog: thirdParty(), commandResult: () => Object.assign(new Error('x'), { code: 'ENOENT' }), ...english });

    expect(flat(missing.output)).toContain('failed the install command finished, but there is no SKILL.md at the target');
    expect(flat(exited.output)).toContain('failed the install command exited with status 2');
    expect(flat(notStarted.output)).toContain('failed the install command could not be run (ENOENT)');
  });
});

describe('含多个 skill 的第三方 Skill：清单', () => {
  it('列表确认之后出一张清单：提问写明条目的名字和个数，每个 skill 一行，有说明和状态', async () => {
    const result = await run({
      catalog: thirdParty(),
      home: { '.claude/skills/paper-reader/SKILL.md': '# paper-reader\n' },
      answers: [choose(WEB_SEARCH), pick('paper-kit'), pick(), choose('退出')],
    });
    const checklist = result.output.split(CHECKLIST)[1] ?? '';

    expect(checklist).toMatch(
      /^\n\s+名称\s+Claude Code\s+说明\n □ paper-reader\s+已装\s+把一篇论文读成深度解读文章\n □ paper-comic\s+未装\s+把论文的要点画成一组漫画\n □ paper-deck\s+未装\s+把论文做成一套幻灯片\n/,
    );
    // 列表下方是光标所在那个 skill 的说明全文
    expect(checklist).toContain('\n把一篇论文读成深度解读文章\n');
  });

  it('两个宿主：清单里每个 skill 在每个宿主下各写各的状态；条目不支持的宿主写「不支持」', async () => {
    const result = await run({
      catalog: thirdParty({ thirdPartySkills: [{ ...KIT, hosts: ['codex'] }] }),
      onPath: BOTH_HOSTS,
      home: { '.agents/skills/paper-deck/SKILL.md': '# paper-deck\n' },
      answers: [choose(WEB_SEARCH), accept(), pick('paper-kit'), pick(), choose('退出')],
    });
    const checklist = result.output.split(CHECKLIST)[1] ?? '';

    expect(checklist).toMatch(/^\s+名称\s+Claude Code\s+Codex\s+说明$/m);
    expect(checklist).toMatch(/^ □ paper-reader\s+不支持\s+未装\s/m);
    expect(checklist).toMatch(/^ □ paper-deck\s+不支持\s+已装\s/m);
  });

  it('勾几个装几个：每个勾选的 skill 各一条命令，汇总和结果里一行是一个 skill', async () => {
    const result = await run({
      catalog: thirdParty(),
      commandResult: installs(),
      answers: [choose(WEB_SEARCH), pick('paper-kit'), pick('paper-reader', 'paper-deck'), choose('开始安装'), choose('退出')],
    });
    const summary = summaryOf(result.output);

    // 数的是条目，不是 skill
    expect(summary).toMatch(/^── 将安装 1 项 ─+$/m);
    expect(summary).toMatch(/^\s+第三方 Skill\s+AI Agent\s+操作\s+位置\n\s+paper-reader\s+Claude Code\s+新装\s+~\S+paper-reader\n\s+paper-deck\s+Claude Code\s+新装\s+~\S+paper-deck$/m);
    expect(summary).not.toContain('paper-comic');
    expect(summary).toMatch(/^── 将执行 2 条命令 ─+$/m);
    expect(result.commands).toEqual([add('example-labs/paper-kit', 'paper-reader', 'claude-code'), add('example-labs/paper-kit', 'paper-deck', 'claude-code')]);
    expect(result.screen).toMatch(/✓\s+paper-reader\s+Claude Code\s+已安装\n\s+✓\s+paper-deck\s+Claude Code\s+已安装\n/);
    expect(existsSync(join(result.home, '.claude/skills/paper-comic'))).toBe(false);
  });

  it('不管勾选的先后，装的先后照清单里的顺序', async () => {
    const result = await run({
      catalog: thirdParty(),
      commandResult: installs(),
      answers: [choose(WEB_SEARCH), pick('paper-kit'), pick('paper-deck', 'paper-reader'), choose('开始安装'), choose('退出')],
    });

    expect(result.commands.map(({ args }) => args[5])).toEqual(['paper-reader', 'paper-deck']);
  });

  it('清单里一个都不勾就确认：这一条不装，其余勾选的照常', async () => {
    const result = await run({
      catalog: thirdParty(),
      commandResult: installs(),
      answers: [choose(WEB_SEARCH), pick('paper-kit', 'solo-notes'), pick(), choose('开始安装'), choose('退出')],
    });
    const summary = summaryOf(result.output);

    expect(summary).toMatch(/^── 将安装 1 项 ─+$/m);
    expect(summary).not.toMatch(/paper-/);
    expect(result.commands).toEqual([SOLO_INTO_CLAUDE]);
    expect(result.output).toMatch(/^\s+合计\s+1 成功 · 0 失败 · 0 跳过$/m);
  });

  it('只勾了它、清单里又一个都不勾：没有要装的，不问开始不开始，回到主菜单', async () => {
    const result = await run({ catalog: thirdParty(), answers: [choose(WEB_SEARCH), pick('paper-kit'), pick(), choose('退出')] });

    expect(result.output).not.toContain('将安装');
    expect(result.output).not.toContain('开始安装吗');
    expect(result.output).not.toContain('正在安装');
    expect(result.commands).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  it('清单起始一个都不勾；返回修改后再问时，上次勾的还在', async () => {
    const result = await run({
      catalog: thirdParty(),
      answers: [choose(WEB_SEARCH), pick('paper-kit'), pick('paper-comic'), choose('返回修改'), accept(), accept(), choose('取消'), choose('退出')],
    });
    const [, first = '', again = ''] = result.output.split(CHECKLIST);

    expect(first.slice(0, first.indexOf('── 将安装'))).not.toContain('■');
    expect(again).toMatch(/^ □ paper-reader\s/m);
    expect(again).toMatch(/^ ■ paper-comic\s/m);
    expect(summaryOf(result.output.slice(result.output.lastIndexOf('── 将安装')))).toMatch(/^\s+paper-comic\s+Claude Code\s+新装/m);
  });

  it('几个含多个 skill 的条目各问一次，照它们在列表里的顺序；清单排在问 key 之前', async () => {
    const other = { ...KIT, name: 'another-kit', source: 'example-labs/another-kit', skills: KIT.skills.slice(0, 2).map((skill) => ({ ...skill, name: `x-${skill.name}` })) };
    const result = await run({
      catalog: thirdParty({ thirdPartySkills: [KIT, other], mcps: [KEYED_MCP] }),
      answers: [choose(WEB_SEARCH), pick('paper-kit', 'another-kit', 'search-keyed'), pick('x-paper-reader'), pick('paper-deck'), secret('sk-test'), choose('取消'), choose('退出')],
    });

    inOrder(result.output, ['? another-kit 里有 2 个 skill，选择要装的', CHECKLIST, 'SEARCH_API_KEY', '── 将安装 3 项']);
  });
});

describe('目标位置已有同名目录的第三方 Skill', () => {
  const existing = { '.claude/skills/note-taker/SKILL.md': '# 用户自己改过的 note-taker\n', '.claude/skills/note-taker/mine.md': '我的笔记\n' };
  const QUESTION = /^\? ~\S+note-taker 已有同名目录，要覆盖它吗？ \(y\/N\)$/m;

  it('汇总里写「覆盖」，备注说另行确认，并提醒覆盖即整目录替换', async () => {
    const result = await run({ catalog: thirdParty(), home: existing, answers: [choose(WEB_SEARCH), pick('solo-notes'), choose('取消'), choose('退出')] });
    const summary = summaryOf(result.output);

    expect(flat(summary)).toMatch(/note-taker Claude Code 覆盖 ~\S+note-taker 已有同名目录，另行确认/);
    expect(summary).toMatch(/^\s+注意\s+覆盖即整目录替换，目录内的本地改动会丢失\n\s+注意\s+第三方 Skill 装的是作者当时的最新版/m);
    expect(summary).not.toMatch(QUESTION);
  });

  it('确认之后、执行之前另问，缺省不覆盖：没同意的不执行命令，原样留着，结果里写明跳过', async () => {
    const result = await run({
      catalog: thirdParty(),
      home: existing,
      commandResult: installs(),
      answers: [choose(WEB_SEARCH), pick('solo-notes'), choose('开始安装'), accept(), choose('退出')],
    });

    inOrder(result.output, ['? 开始安装吗', '已有同名目录，要覆盖它吗？', '── 正在安装']);
    expect(result.output).toMatch(QUESTION);
    expect(result.commands).toEqual([]);
    expect(readdirSync(join(result.home, '.claude/skills/note-taker')).sort()).toEqual(['SKILL.md', 'mine.md']);
    expect(readFileSync(join(result.home, '.claude/skills/note-taker/SKILL.md'), 'utf8')).toBe(existing['.claude/skills/note-taker/SKILL.md']);
    expect(result.output).toMatch(/^\s+–\s+note-taker\s+Claude Code\s+跳过 未同意覆盖，保持原样$/m);
    expect(result.output).toMatch(/^\s+合计\s+0 成功 · 0 失败 · 1 跳过$/m);
  });

  it('同意了才执行那条命令', async () => {
    const result = await run({
      catalog: thirdParty(),
      home: existing,
      commandResult: installs(),
      answers: [choose(WEB_SEARCH), pick('solo-notes'), choose('开始安装'), yes(), choose('退出')],
    });

    expect(result.commands).toEqual([SOLO_INTO_CLAUDE]);
    expect(result.output).toMatch(/^\s+✓\s+note-taker\s+Claude Code\s+已安装$/m);
  });

  it('目标位置是个文件、是个符号链接，也都先问', async () => {
    const file = await run({
      catalog: thirdParty(),
      home: { '.claude/skills/note-taker': '不是目录\n' },
      answers: [choose(WEB_SEARCH), pick('solo-notes'), choose('开始安装'), no(), choose('退出')],
    });
    const link = await run({
      catalog: thirdParty(),
      home: { 'my-skills/note-taker/SKILL.md': '# 我的\n' },
      links: { '.claude/skills/note-taker': 'my-skills/note-taker' },
      answers: [choose(WEB_SEARCH), pick('solo-notes'), choose('开始安装'), no(), choose('退出')],
    });

    for (const result of [file, link]) {
      expect(result.output).toMatch(QUESTION);
      expect(result.commands).toEqual([]);
    }
  });

  it('逐项另问：两个宿主里只有一处已有时只问那一处，另一处照常装；别的 skill 的命令一个字不变', async () => {
    const result = await run({
      catalog: thirdParty(),
      onPath: BOTH_HOSTS,
      home: existing,
      commandResult: installs(),
      answers: [choose(WEB_SEARCH), accept(), pick('solo-notes'), choose('开始安装'), no(), choose('退出')],
    });

    expect(result.commands).toEqual([SOLO_INTO_CODEX]);
    expect(result.screen).toMatch(/–\s+note-taker\s+Claude Code\s+跳过 未同意覆盖，保持原样\n\s+✓\s+note-taker\s+Codex\s+已安装\n/);
    // 展示过的两条里，执行的那一条和展示的一字不差
    expect(flat(summaryOf(result.output))).toContain('npx -y skills@1 add example-labs/solo-notes --skill note-taker --agent codex --yes --global');
  });

  it('同意覆盖而命令失败：那里留着的是原来的那一份，结果里把命令的结局也说出来', async () => {
    const result = await run({
      catalog: thirdParty(),
      home: existing,
      commandResult: () => ({ exitCode: 1 }),
      answers: [choose(WEB_SEARCH), pick('solo-notes'), choose('开始安装'), yes(), choose('退出')],
    });

    expect(result.output).toMatch(/^\s+✓\s+note-taker\s+Claude Code\s+已安装；安装命令退出状态 1$/m);
  });

  it('本仓库的 skill 的那几问排在前面', async () => {
    const result = await run({
      catalog: thirdParty({ skillPurposes: { alpha: 'web-search' } }),
      home: { ...existing, '.claude/skills/alpha/SKILL.md': '别处装的\n' },
      answers: [choose(WEB_SEARCH), pick('alpha', 'solo-notes'), choose('开始安装'), no(), no(), choose('退出')],
    });

    inOrder(result.output, ['alpha 不是本工具装的，要覆盖它吗？', 'note-taker 已有同名目录，要覆盖它吗？']);
    expect(result.output).toMatch(/^\s+合计\s+0 成功 · 0 失败 · 2 跳过$/m);
  });
});

describe('第三方 Skill 和别的类型一起装', () => {
  afterEach(() => vi.unstubAllGlobals());

  const everything = (): string =>
    thirdParty({ mcps: SAMPLE_MCPS, tools: SAMPLE_TOOLS, skillPurposes: { alpha: 'web-search' } });
  const CLAUDE_ADD_LOCAL = { command: 'claude', args: ['mcp', 'add', '--scope', 'user', 'docs-local', '--', 'npx', '-y', '@example/docs-mcp@latest'] };
  const FETCHER_COMMAND = { command: 'curl -LsSf https://example.com/fetcher/install.sh | sh', args: [], shell: true };
  const answers = [choose(WEB_SEARCH), pick('alpha', 'solo-notes', 'docs-local', 'fetcher'), choose('开始安装'), choose('退出')];

  it('汇总里小表依次是 Skill、第三方 Skill、MCP、工具；命令先是第三方 Skill 的，再是 MCP 的，最后是工具的', async () => {
    const result = await run({ catalog: everything(), answers: [...answers.slice(0, 2), choose('取消'), choose('退出')] });
    const summary = summaryOf(result.output);

    expect(summary).toMatch(/^── 将安装 4 项 ─+$/m);
    inOrder(summary, ['  Skill ', '  第三方 Skill ', '  MCP ', '  工具 ']);
    expect(summary).toMatch(/^── 将执行 3 条命令 ─+$/m);
    inOrder(flat(summary), [' 1 npx -y skills@1 add example-labs/solo-notes', ' 2 claude mcp add --scope user docs-local', ' 3 curl -LsSf']);
  });

  it('执行的先后：本仓库的 skill、第三方 Skill、MCP、工具；前三样共用「正在安装」分区', async () => {
    const result = await run({ catalog: everything(), commandResult: installs(), answers });

    expect(result.commands).toEqual([SOLO_INTO_CLAUDE, CLAUDE_ADD_LOCAL, FETCHER_COMMAND]);
    expect(result.screen).toMatch(
      /── 正在安装 ─+\n\n\s+✓\s+alpha\s+Claude Code\s+已安装 1\.0\.0\n\s+✓\s+note-taker\s+Claude Code\s+已安装\n\s+✓\s+docs-local\s+Claude Code\s+已配置\n\n── fetcher ─/,
    );
    const recap = result.screen.slice(result.screen.lastIndexOf('── 结果 ─'));
    expect(recap).toMatch(/✓\s+alpha\s.*\n\s+✓\s+note-taker\s+Claude Code\s+已安装\n\s+✓\s+docs-local\s/);
  });

  it('第三方 Skill 装不上不影响别的类型；别的类型失败也不影响它', async () => {
    const result = await run({
      catalog: everything(),
      // MCP 和工具的命令都失败，skills CLI 的照常
      commandResult: (command, args, context) => (command === 'npx' ? installs()(command, args, context) : { exitCode: 1 }),
      answers,
    });

    expect(result.output).toMatch(/^\s+✓\s+alpha\s+Claude Code\s+已安装 1\.0\.0$/m);
    expect(result.output).toMatch(/^\s+✓\s+note-taker\s+Claude Code\s+已安装$/m);
    expect(result.output).toMatch(/^\s+✗\s+docs-local\s+Claude Code\s+失败 添加命令退出状态 1$/m);
    expect(result.exitCode).toBe(0);
  });

  it('向 GitHub 查询失败与它无关：本仓库的 skill 一个都不装，第三方 Skill 照常', async () => {
    const catalog = { ...THIRD_PARTY, skillPurposes: { alpha: 'web-search' } };
    fakeGitHub({
      intercept: (url) =>
        url.includes('api.github.com')
          ? Response.json({ message: 'API rate limit exceeded' }, { status: 403, headers: { 'x-ratelimit-remaining': '0' } })
          : url.endsWith('/main/catalog.json')
            ? Response.json(catalog)
            : undefined,
    });

    const result = await run({
      catalog: githubCatalogSource(),
      commandResult: installs(),
      answers: [choose(WEB_SEARCH), pick('alpha', 'solo-notes'), choose('开始安装'), choose('退出')],
    });

    expect(result.stderr).toContain('出错：GitHub 限流');
    expect(result.output).not.toMatch(/alpha\s+Claude Code\s+(已安装|失败|跳过)/);
    expect(result.commands).toEqual([SOLO_INTO_CLAUDE]);
    expect(result.output).toMatch(/^\s+✓\s+note-taker\s+Claude Code\s+已安装$/m);
    expect(result.output).toMatch(/^\s+合计\s+1 成功 · 0 失败 · 0 跳过$/m);
  });

  it('本仓库的 skill 下载失败不影响第三方 Skill', async () => {
    // 样例目录里没有 alpha 的文件：本仓库的 skill 装不上
    const result = await run({
      catalog: catalogDir({ catalog: { ...THIRD_PARTY, skillPurposes: { alpha: 'web-search' } }, content: {} }),
      commandResult: installs(),
      answers: [choose(WEB_SEARCH), pick('alpha', 'solo-notes'), choose('开始安装'), choose('退出')],
    });

    expect(result.output).toMatch(/^\s+✗\s+alpha\s+Claude Code\s+失败 /m);
    expect(result.output).toMatch(/^\s+✓\s+note-taker\s+Claude Code\s+已安装$/m);
  });
});
