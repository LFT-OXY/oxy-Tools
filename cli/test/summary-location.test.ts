// 汇总里「位置」放不下时另起一行（任务 10-12-installer-add-pi-omp-hosts 工单 08）：一行连位置超出第 79 列时，这一行到
// 「操作」为止，位置在下一行整条写出；放得下的行照旧。汇总别的规矩在 skill-status.test.ts、third-party.test.ts、mixed.test.ts。
import { describe, expect, it } from 'vitest';
import { displayWidth } from '../src/text.ts';
import { EMPTY_CATALOG, SAMPLE_FILES, SAMPLE_MCPS, SAMPLE_SKILLS, SAMPLE_THIRD_PARTY, accept, catalogDir, choose, pick, run, underWebSearch } from './harness.ts';

const WEB_SEARCH = '联网搜索与文档检索';
const WEB_SEARCH_EN = 'Web search & docs retrieval';
const ALL_HOSTS = ['claude', 'codex', 'pi', 'omp'];
// 名字取自真实目录里最长的几个（2026-10-12 量的）：本仓库的 skill 最长 18 列，第三方 Skill 里要装的 skill 最长 28、27 列；
// guizang-ppt-skill 是工单 01 记下的、英文界面里被终端折断的那一个
const LONG_SKILL = 'writing-for-agents';
const LONG_THIRD_PARTY = ['find-animation-opportunities', 'guizang-ppt-skill', 'nuyoah-image-reverse-prompt'];
const about = (zh: string, en: string): { zh: string; en: string } => ({ zh, en });
const catalog = (): string =>
  catalogDir({
    index: { version: 1, skills: [...SAMPLE_SKILLS, { name: LONG_SKILL, version: '1.0.0', path: `skills/${LONG_SKILL}`, description: about('名字很长的样例', 'A long name') }] },
    catalog: {
      ...EMPTY_CATALOG,
      skillPurposes: { alpha: 'web-search', [LONG_SKILL]: 'web-search' },
      thirdPartySkills: [
        {
          name: 'long-pack',
          description: about('名字都很长的样例第三方 Skill', 'A sample third-party skill whose skills have long names'),
          url: 'https://github.com/example-labs/long-pack',
          purpose: 'web-search',
          source: 'example-labs/long-pack',
          skills: LONG_THIRD_PARTY.map((name) => ({ name, description: about('名字很长的样例', 'A long name') })),
        },
      ],
      mcps: underWebSearch(SAMPLE_MCPS[0]),
    },
    content: { ...SAMPLE_FILES, [`skills/${LONG_SKILL}/SKILL.md`]: '# 名字很长\n' },
  });
const everything = ['alpha', LONG_SKILL, 'long-pack', 'docs-local'];
// 只检测到 Claude Code：不问装进哪些宿主。停在汇总上，不去装
const claudeOnly = (purpose: string, cancel: string, exit: string) => [choose(purpose), pick(...everything), pick(...LONG_THIRD_PARTY), choose(cancel), choose(exit)];
const fourHosts = (purpose: string, cancel: string, exit: string) => [choose(purpose), accept(), pick(...everything), pick(...LONG_THIRD_PARTY), choose(cancel), choose(exit)];

// 汇总那几张小表里有字的行：从「将安装 N 项」的标题之后，到下一个分区的标题（没有就到确认的提问）为止
function tableLines(output: string): string[] {
  const lines = output.split('\n');
  const from = lines.findIndex((line) => /^── (将安装|Install) /.test(line));
  const to = lines.findIndex((line, index) => index > from && /^(── |\? )/.test(line));
  return from === -1 || to === -1 ? [] : lines.slice(from + 1, to).filter((line) => line.trim() !== '');
}

describe('汇总里位置放不下时另起一行', () => {
  it('一行连位置超出第 79 列：这一行到操作为止，位置在下一行整条写出；同一张小表里放得下的行照旧', async () => {
    const result = await run({ catalog: catalog(), answers: claudeOnly(WEB_SEARCH, '取消', '退出') });
    const tables = tableLines(result.output).join('\n');

    expect(tables).toMatch(/^ +alpha +Claude Code +新装 +~\S+alpha$/m);
    expect(tables).toMatch(new RegExp(`^ +${LONG_SKILL} +Claude Code +新装\\n +~\\S+${LONG_SKILL}$`, 'm'));
    for (const name of LONG_THIRD_PARTY) expect(tables).toMatch(new RegExp(`^ +${name} +Claude Code +新装\\n +~\\S+${name}$`, 'm'));
    expect(tables).toMatch(/^ +docs-local +Claude Code +新装$/m);
  });

  it('有备注的行：位置在前，备注在后，各占一行；放得下的行备注照旧跟在它那一行下面', async () => {
    const result = await run({
      catalog: catalog(),
      home: {
        '.claude/skills/alpha/SKILL.md': '# alpha\n',
        '.claude/skills/alpha/.oxy-tools.json': JSON.stringify({ name: 'alpha', version: '1.0.0' }),
        [`.claude/skills/${LONG_SKILL}/SKILL.md`]: '用户自己放的\n',
        '.claude/skills/guizang-ppt-skill/SKILL.md': '别处装的\n',
      },
      answers: claudeOnly(WEB_SEARCH, '取消', '退出'),
    });
    const tables = tableLines(result.output).join('\n');

    expect(tables).toMatch(/^ +alpha +Claude Code +覆盖 +~\S+alpha\n +重装 1\.0\.0$/m);
    expect(tables).toMatch(new RegExp(`^ +${LONG_SKILL} +Claude Code +覆盖\\n +~\\S+${LONG_SKILL}\\n +非本工具安装，另行确认$`, 'm'));
    expect(tables).toMatch(/^ +guizang-ppt-skill +Claude Code +覆盖\n +~\S+guizang-ppt-skill\n +已有同名目录，另行确认$/m);
  });

  it('英文界面也是：工单 01 记下的那一行不再被终端折断', async () => {
    const result = await run({ argv: ['--lang', 'en'], catalog: catalog(), answers: claudeOnly(WEB_SEARCH_EN, 'Cancel', 'Exit') });
    const tables = tableLines(result.output);

    expect(tables.join('\n')).toMatch(/^ +guizang-ppt-skill +Claude Code +new\n +~\S+guizang-ppt-skill$/m);
    expect(Math.max(...tables.map((line) => displayWidth(line)))).toBeLessThanOrEqual(79);
  });

  it.each([
    ['中文', [], fourHosts(WEB_SEARCH, '取消', '退出'), 'Codex、Pi、omp', '新装'],
    ['英文', ['--lang', 'en'], fourHosts(WEB_SEARCH_EN, 'Cancel', 'Exit'), 'Codex, Pi, omp', 'new'],
  ])('四个宿主都选了、名字取真实目录里最长的几个，%s：小表里没有一行超出第 79 列', async (_label, argv, answers, shared, fresh) => {
    const result = await run({ argv, catalog: catalog(), onPath: ALL_HOSTS, answers });
    const tables = tableLines(result.output);

    for (const name of [LONG_SKILL, ...LONG_THIRD_PARTY]) expect(tables.join('\n')).toMatch(new RegExp(`^ +${shared} +${fresh}\\n +~\\S+${name}$`, 'm'));
    expect(Math.max(...tables.map((line) => displayWidth(line)))).toBeLessThanOrEqual(79);
  });

  // 样例里的名字都短（最长 12 列），全是新装：英文、三个和四个宿主下每一行连位置都放得下
  it.each([
    ['三个宿主', ['claude', 'codex', 'pi'], 'Codex, Pi'],
    ['四个宿主', ALL_HOSTS, 'Codex, Pi, omp'],
  ])('英文界面、%s、名字短：放得下的行位置仍在同一行', async (_label, onPath, shared) => {
    const result = await run({
      argv: ['--lang', 'en'],
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, thirdPartySkills: SAMPLE_THIRD_PARTY, skillPurposes: { 'beta-pack': 'web-search' } } }),
      onPath,
      answers: [choose(WEB_SEARCH_EN), accept(), pick('beta-pack', 'paper-kit', 'solo-notes'), pick('paper-reader', 'paper-comic'), choose('Cancel'), choose('Exit')],
    });
    // 一行一个元素：这里的正则跨不了行
    const tables = tableLines(result.output);

    for (const name of ['beta-pack', 'paper-reader', 'paper-comic', 'note-taker']) {
      expect(tables.filter((line) => new RegExp(`^ +${name} +Claude Code +new +~\\S+${name}$`).test(line))).toHaveLength(1);
      expect(tables.filter((line) => new RegExp(`^ +${shared} +new +~\\S+${name}$`).test(line))).toHaveLength(1);
    }
  });

  it('恰好写到第 79 列的行留在行内，再长一列的另起：中文、四个宿主', async () => {
    // 工单点名的那两行：宿主那一格是「Codex、Pi、omp」时，17 列的名字连位置是 80 列。旁边放一个只短一列的名字（造的），它那两行正好 79 列
    const [edge, over] = ['drawio-skill-pro', 'guizang-ppt-skill'];
    const result = await run({
      catalog: catalogDir({
        catalog: {
          ...EMPTY_CATALOG,
          thirdPartySkills: [{ ...SAMPLE_THIRD_PARTY[0], skills: [edge, over].map((name) => ({ name, description: about('样例', 'A sample') })) }],
        },
      }),
      onPath: ALL_HOSTS,
      answers: [choose(WEB_SEARCH), accept(), pick('paper-kit'), pick(edge, over), choose('取消'), choose('退出')],
    });
    const tables = tableLines(result.output);
    const inline = tables.filter((line) => new RegExp(` +(Claude Code|Codex、Pi、omp) +新装 +~\\S+${edge}$`).test(line));

    expect(inline.map((line) => displayWidth(line))).toEqual([79, 79]);
    expect(tables.join('\n')).toMatch(new RegExp(`^ +${over} +Claude Code +新装\\n +~\\S+${over}\\n +Codex、Pi、omp +新装\\n +~\\S+${over}$`, 'm'));
  });

  it('路径本身就比一行长：仍然整条写在一行上，不截断、不拆开', async () => {
    // 名字 80 列：路径连缩进怎么排都超出一行
    const name = `a-skill-${'with-a-very-long-name-'.repeat(3)}indeed`;
    const result = await run({
      catalog: catalogDir({
        index: { version: 1, skills: [{ name, version: '1.0.0', path: `skills/${name}`, description: about('名字比一行还长的样例', 'A name longer than one line') }] },
        content: { [`skills/${name}/SKILL.md`]: '# long\n' },
      }),
      answers: [choose('推荐'), pick(name), choose('取消'), choose('退出')],
    });
    const tables = tableLines(result.output).join('\n');

    expect(tables).toMatch(new RegExp(`^ +${name} +Claude Code +新装\\n +~\\S+${name}$`, 'm'));
  });
});
