import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EMPTY_CATALOG, SAMPLE_FILES, SAMPLE_TOOLS, accept, catalogDir, choose, pick, run } from './harness.ts';

const claudeSkills = (home: string): string => join(home, '.claude', 'skills');
const codexSkills = (home: string): string => join(home, '.agents', 'skills');
// 共用 skill 目录：Pi 的 skill 装进 Codex 已经在用的那一个（ADR-0005）
const sharedSkills = codexSkills;
const read = (...path: string[]): string => readFileSync(join(...path), 'utf8');
// 折行会打断一句话：把空白并成一个空格再比
const flat = (text: string): string => text.replace(/\s+/g, ' ');
const marker = (skillsDir: string, name: string): Record<string, unknown> =>
  JSON.parse(read(skillsDir, name, '.oxy-tools.json')) as Record<string, unknown>;

describe('只检测到 Codex', () => {
  const installAlpha = [choose('推荐'), pick('alpha'), choose('开始安装'), choose('退出')];

  it('可执行路径上有 codex 命令时算检测到，skill 装进用户主目录的 .agents/skills', async () => {
    const result = await run({ onPath: ['codex'], answers: installAlpha });

    expect(result.output).toMatch(/^\s+AI Agent\s+Claude Code – 未检测到\s+Codex ✓\s+Pi – 未检测到$/m);
    expect(read(codexSkills(result.home), 'alpha', 'SKILL.md')).toBe(SAMPLE_FILES['skills/alpha/SKILL.md']);
    expect(marker(codexSkills(result.home), 'alpha')).toMatchObject({ name: 'alpha', version: '1.0.0' });
    expect(readdirSync(result.home)).toEqual(['.agents']);
    expect(result.exitCode).toBe(0);
  });

  it('不问装进哪个宿主；汇总和结果里写的是 Codex 和它的目录', async () => {
    const result = await run({ onPath: ['codex'], answers: installAlpha });

    expect(result.output).not.toContain('装进哪些 AI Agent');
    expect(result.output).toMatch(/^\s+alpha\s+Codex\s+新装\s+~\S+alpha$/m);
    expect(result.output).toContain(join('~', '.agents', 'skills', 'alpha'));
    expect(result.output).toMatch(/^\s+✓\s+alpha\s+Codex\s+已安装 1\.0\.0$/m);
    expect(existsSync(claudeSkills(result.home))).toBe(false);
  });
});

describe('只检测到 Pi', () => {
  const installAlpha = [choose('推荐'), pick('alpha'), choose('开始安装'), choose('退出')];

  it('可执行路径上有 pi 命令时算检测到，排在 Claude Code、Codex 之后；skill 装进用户主目录的 .agents/skills，带安装标记', async () => {
    const result = await run({ onPath: ['pi'], answers: installAlpha });

    expect(result.output).toMatch(/^\s+AI Agent\s+Claude Code – 未检测到\s+Codex – 未检测到\s+Pi ✓$/m);
    expect(read(sharedSkills(result.home), 'alpha', 'SKILL.md')).toBe(SAMPLE_FILES['skills/alpha/SKILL.md']);
    expect(marker(sharedSkills(result.home), 'alpha')).toMatchObject({ name: 'alpha', version: '1.0.0' });
    expect(readdirSync(result.home)).toEqual(['.agents']);
    expect(result.exitCode).toBe(0);
  });

  it('不问装进哪个宿主；汇总和结果里写的是 Pi 和共用 skill 目录', async () => {
    const result = await run({ onPath: ['pi'], answers: installAlpha });

    expect(result.output).not.toContain('装进哪些 AI Agent');
    expect(result.output).toMatch(/^\s+alpha\s+Pi\s+新装\s+~\S+alpha$/m);
    expect(result.output).toContain(join('~', '.agents', 'skills', 'alpha'));
    expect(result.output).toMatch(/^\s+✓\s+alpha\s+Pi\s+已安装 1\.0\.0$/m);
    expect(result.output).toMatch(/^\s+合计\s+1 成功 · 0 失败 · 0 跳过$/m);
    expect(existsSync(claudeSkills(result.home))).toBe(false);
    expect(result.commands).toEqual([]);
  });
});

describe('只检测到一个宿主', () => {
  it('只有 Claude Code：说明另外的宿主没有检测到并被跳过，不问装进哪个，直接装进 Claude Code', async () => {
    const result = await run({
      onPath: ['claude'],
      answers: [choose('推荐'), pick('alpha'), choose('开始安装'), choose('退出')],
    });

    expect(result.output).toMatch(/^\s+AI Agent\s+Claude Code ✓\s+Codex – 未检测到\s+Pi – 未检测到$/m);
    expect(result.output).toMatch(/^\s+注意\s+没有检测到 Codex、Pi，已跳过；组件只装进 Claude Code$/m);
    expect(result.output).not.toContain('装进哪些 AI Agent');
    expect(readdirSync(result.home)).toEqual(['.claude']);
  });

  it('只有 Codex：说明另外的宿主没有检测到并被跳过', async () => {
    const result = await run({ onPath: ['codex'], answers: [choose('退出')] });

    expect(result.output).toMatch(/^\s+注意\s+没有检测到 Claude Code、Pi，已跳过；组件只装进 Codex$/m);
  });

  it('只有 Pi：说明另外的宿主没有检测到并被跳过', async () => {
    const result = await run({ onPath: ['pi'], answers: [choose('退出')] });

    expect(result.output).toMatch(/^\s+注意\s+没有检测到 Claude Code、Codex，已跳过；组件只装进 Pi$/m);
  });

  it('英文界面下同样说明', async () => {
    const result = await run({ argv: ['--lang', 'en'], onPath: ['claude'], answers: [choose('Exit')] });

    expect(result.output).toMatch(/^\s+AI Agent\s+Claude Code ✓\s+Codex – not detected\s+Pi – not detected$/m);
    // 这一句在 80 列里放不下，照「注意」的规矩折成两行
    expect(flat(result.output)).toContain(' Notice Codex, Pi not detected, skipped; components go into Claude Code only ');
  });

  it('英文界面下只有 Pi', async () => {
    const result = await run({ argv: ['--lang', 'en'], onPath: ['pi'], answers: [choose('Exit')] });

    expect(result.output).toMatch(/^\s+AI Agent\s+Claude Code – not detected\s+Codex – not detected\s+Pi ✓$/m);
    expect(flat(result.output)).toContain(' Notice Claude Code, Codex not detected, skipped; components go into Pi only ');
  });

  it('名字只是相近的命令不算数', async () => {
    const result = await run({ onPath: ['claude-helper', 'codex-helper', 'pi-helper', 'pip'], answers: [choose('退出')] });

    expect(result.output).toMatch(/^\s+AI Agent\s+Claude Code – 未检测到\s+Codex – 未检测到\s+Pi – 未检测到$/m);
  });
});

describe('检测到两个宿主', () => {
  const onPath = ['claude', 'codex'];
  const bothHosts = pick('Claude Code', 'Codex');

  it('进入「推荐」后先问装进哪些宿主：两项都默认勾选，名字后面不写目录', async () => {
    const result = await run({ onPath, answers: [choose('推荐'), pick(), choose('退出')] });

    expect(result.output).toMatch(/^\s+AI Agent\s+Claude Code ✓\s+Codex ✓\s+Pi – 未检测到$/m);
    expect(result.output).toMatch(/^\s+注意\s+没有检测到 Pi，已跳过；组件只装进 Claude Code、Codex$/m);
    expect(result.output).toContain('装进哪些 AI Agent');
    expect(result.output).toMatch(/^\? 装进哪些 AI Agent\n\n ■ Claude Code\n ■ Codex$/m);
    expect(result.output).not.toContain(join('~', '.claude', 'skills'));
    expect(result.output).not.toContain(join('~', '.agents', 'skills'));
  });

  it('宿主选择上什么都不动直接确认：默认就是两个都装', async () => {
    const result = await run({
      onPath,
      answers: [choose('推荐'), accept(), pick('alpha'), choose('开始安装'), choose('退出')],
    });

    expect(readdirSync(claudeSkills(result.home))).toEqual(['alpha']);
    expect(readdirSync(codexSkills(result.home))).toEqual(['alpha']);
  });

  it('两个都选：同一个 skill 装进两处，各有自己的安装标记', async () => {
    const result = await run({
      onPath,
      answers: [choose('推荐'), bothHosts, pick('alpha'), choose('开始安装'), choose('退出')],
    });

    for (const skillsDir of [claudeSkills(result.home), codexSkills(result.home)]) {
      expect(read(skillsDir, 'alpha', 'SKILL.md')).toBe(SAMPLE_FILES['skills/alpha/SKILL.md']);
      expect(read(skillsDir, 'alpha', 'references', 'guide.md')).toBe(SAMPLE_FILES['skills/alpha/references/guide.md']);
      expect(marker(skillsDir, 'alpha')).toMatchObject({ name: 'alpha', version: '1.0.0' });
    }
    expect(readdirSync(result.home).sort()).toEqual(['.agents', '.claude']);
    expect(readdirSync(result.tmp)).toEqual([]);
  });

  it('汇总和结果按宿主分别列出，同一个 skill 只数一次', async () => {
    const result = await run({
      onPath,
      answers: [choose('推荐'), bothHosts, pick('alpha', 'beta-pack'), choose('开始安装'), choose('退出')],
    });

    expect(result.output).toMatch(/^── 将安装 2 项 ─+$/m);
    expect(result.output).toMatch(/^\s+alpha\s+Claude Code\s+新装\s+~\S+alpha$/m);
    // 同一条目的后续行不重复名字
    expect(result.output).toMatch(/^\s+Codex\s+新装\s+~\S+alpha$/m);
    expect(result.output).toMatch(/^\s+Codex\s+新装\s+~\S+beta-pack$/m);
    expect(result.output).toContain(join('~', '.agents', 'skills', 'beta-pack'));
    expect(result.output).toMatch(/^\s+✓\s+alpha\s+Claude Code\s+已安装 1\.0\.0$/m);
    expect(result.output).toMatch(/^\s+✓\s+alpha\s+Codex\s+已安装 1\.0\.0$/m);
    expect(result.output).toMatch(/^\s+✓\s+beta-pack\s+Codex\s+已安装 2\.3$/m);
    expect(result.output).toMatch(/^\s+合计\s+4 成功 · 0 失败 · 0 跳过$/m);
  });

  it('只选其中一个：只装进它', async () => {
    const result = await run({
      onPath,
      answers: [choose('推荐'), pick('Codex'), pick('alpha'), choose('开始安装'), choose('退出')],
    });

    expect(readdirSync(result.home)).toEqual(['.agents']);
    expect(result.output).not.toMatch(/^\s+alpha\s+Claude Code\s/m);
    expect(result.output).toMatch(/^\s+合计\s+1 成功 · 0 失败 · 0 跳过$/m);
  });

  it('一个宿主那边失败不影响另一个：两行各有各的结果', async () => {
    // 主目录里的 .agents 是个文件，下面建不了 skills 目录
    const result = await run({
      onPath,
      home: { '.agents': '这里本该是个目录' },
      answers: [choose('推荐'), bothHosts, pick('alpha'), choose('开始安装'), choose('退出')],
    });

    expect(result.output).toMatch(/^\s+✓\s+alpha\s+Claude Code\s+已安装 1\.0\.0$/m);
    expect(result.output).toMatch(/^\s+✗\s+alpha\s+Codex\s+失败 写入失败（[A-Z]+），目标目录未改动$/m);
    expect(result.output).toMatch(/^\s+合计\s+1 成功 · 1 失败 · 0 跳过$/m);
    expect(existsSync(join(claudeSkills(result.home), 'alpha', 'SKILL.md'))).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it('一个宿主都不勾就确认：回到主菜单，什么都不装', async () => {
    const result = await run({ onPath, answers: [choose('推荐'), pick(), choose('退出')] });

    expect(result.output).not.toContain('选择要安装的条目');
    expect(result.output.split('选择用途')).toHaveLength(3);
    expect(readdirSync(result.home)).toEqual([]);
  });

  it('skill 一个都不勾就确认：回到宿主选择，之前勾的还在', async () => {
    const result = await run({
      onPath,
      answers: [choose('推荐'), pick('Codex'), pick(), pick(), choose('退出')],
    });

    const [, , again = ''] = result.output.split('装进哪些 AI Agent');
    expect(again).toMatch(/^\s*□ Claude Code\s/m);
    expect(again).toMatch(/^\s*■ Codex\s/m);
    expect(result.output.split('选择用途')).toHaveLength(3);
  });

  it('在汇总里选「返回修改」回到 skill 列表，不重问宿主', async () => {
    const result = await run({
      onPath,
      answers: [choose('推荐'), bothHosts, pick('alpha'), choose('返回修改'), pick('beta-pack'), choose('开始安装'), choose('退出')],
    });

    expect(result.output.split('装进哪些 AI Agent')).toHaveLength(2);
    expect(readdirSync(claudeSkills(result.home))).toEqual(['beta-pack']);
    expect(readdirSync(codexSkills(result.home))).toEqual(['beta-pack']);
  });

  it('英文界面下的宿主选择', async () => {
    const result = await run({ argv: ['--lang', 'en'], onPath, answers: [choose('Recommended'), pick(), choose('Exit')] });

    expect(result.output).toMatch(/^\? Install into which AI Agents\n\n ■ Claude Code\n ■ Codex$/m);
  });
});

describe('检测到三个宿主', () => {
  const onPath = ['claude', 'codex', 'pi'];

  it('「AI Agent」一行三个都打勾，没有被跳过的说明；宿主选择里依次是 Claude Code、Codex、Pi，都默认勾选', async () => {
    const result = await run({ onPath, answers: [choose('推荐'), pick(), choose('退出')] });

    expect(result.output).toMatch(/^\s+AI Agent\s+Claude Code ✓\s+Codex ✓\s+Pi ✓$/m);
    expect(result.output).not.toContain('未检测到');
    expect(result.output).not.toContain('已跳过');
    expect(result.output).toMatch(/^\? 装进哪些 AI Agent\n\n ■ Claude Code\n ■ Codex\n ■ Pi$/m);
  });

  it('只选 Pi：只装进共用 skill 目录，汇总和结果里只有 Pi 一行', async () => {
    const result = await run({ onPath, answers: [choose('推荐'), pick('Pi'), pick('alpha'), choose('开始安装'), choose('退出')] });

    expect(readdirSync(result.home)).toEqual(['.agents']);
    expect(read(sharedSkills(result.home), 'alpha', 'SKILL.md')).toBe(SAMPLE_FILES['skills/alpha/SKILL.md']);
    expect(result.output).toMatch(/^\s+alpha\s+Pi\s+新装\s+~\S+alpha$/m);
    expect(result.output).not.toMatch(/^\s+(alpha\s+)?(Claude Code|Codex)\s+新装/m);
    expect(result.output).toMatch(/^\s+合计\s+1 成功 · 0 失败 · 0 跳过$/m);
  });

  it('选了 Claude Code 和 Pi：同一个 skill 装进两处，各有自己的安装标记，汇总和结果各两行', async () => {
    const result = await run({
      onPath,
      answers: [choose('推荐'), pick('Claude Code', 'Pi'), pick('alpha'), choose('开始安装'), choose('退出')],
    });

    for (const skillsDir of [claudeSkills(result.home), sharedSkills(result.home)]) {
      expect(read(skillsDir, 'alpha', 'SKILL.md')).toBe(SAMPLE_FILES['skills/alpha/SKILL.md']);
      expect(marker(skillsDir, 'alpha')).toMatchObject({ name: 'alpha', version: '1.0.0' });
    }
    expect(result.output).toMatch(/^\s+alpha\s+Claude Code\s+新装\s+~\S+alpha$/m);
    expect(result.output).toMatch(/^\s+Pi\s+新装\s+~\S+alpha$/m);
    expect(result.output).toMatch(/^\s+✓\s+alpha\s+Claude Code\s+已安装 1\.0\.0$/m);
    expect(result.output).toMatch(/^\s+✓\s+alpha\s+Pi\s+已安装 1\.0\.0$/m);
    expect(result.output).toMatch(/^\s+合计\s+2 成功 · 0 失败 · 0 跳过$/m);
  });

  it('一个宿主都不勾就确认：回到主菜单，什么都不装', async () => {
    const result = await run({ onPath, answers: [choose('推荐'), pick(), choose('退出')] });

    expect(result.output).not.toContain('选择要安装的条目');
    expect(readdirSync(result.home)).toEqual([]);
  });

  it('英文界面下的宿主选择', async () => {
    const result = await run({ argv: ['--lang', 'en'], onPath, answers: [choose('Recommended'), pick(), choose('Exit')] });

    expect(result.output).toMatch(/^\s+AI Agent\s+Claude Code ✓\s+Codex ✓\s+Pi ✓$/m);
    expect(result.output).toMatch(/^\? Install into which AI Agents\n\n ■ Claude Code\n ■ Codex\n ■ Pi$/m);
  });
});

describe('一个宿主都没检测到', () => {
  it('主菜单上方说明原因，每个宿主都写明未检测到', async () => {
    const result = await run({ onPath: [], answers: [choose('退出')] });

    expect(result.output).toMatch(/^\s+AI Agent\s+Claude Code – 未检测到\s+Codex – 未检测到\s+Pi – 未检测到$/m);
    expect(result.output).toMatch(/^\s+注意\s+没有检测到 Claude Code、Codex 或 Pi，暂时装不了组件$/m);
    expect(result.exitCode).toBe(0);
  });

  it('「推荐」照常进得去，不问宿主；skill 的行不可选并注明原因', async () => {
    // 直接回车：光标起始所在的那一项是「推荐」
    const result = await run({ onPath: [], answers: [accept(), pick(), choose('退出')] });

    expect(result.output).not.toContain('装进哪些 AI Agent');
    expect(result.output).toMatch(/^\s+名称\s+状态\s+说明\n\s+── Skill\n – alpha\s+需要 AI Agent\s+第一个样例 skill.*…\n – beta-pack\s+需要 AI Agent\s+第二个样例 skill$/m);
    expect(result.output).not.toMatch(/^ [□■] /m);
    expect(result.exitCode).toBe(0);
    expect(readdirSync(result.home)).toEqual([]);
  });

  // 目录里只有工具：主菜单上只有它们所在的两个用途和退出
  const onlyTools = (): string => catalogDir({ index: { version: 1, skills: [] }, catalog: { ...EMPTY_CATALOG, tools: SAMPLE_TOOLS } });

  it('工具所在的用途照常进得去，里面的工具不可选并注明原因', async () => {
    // 直接回车：光标起始在第一行上，它是第一个用途
    const result = await run({ catalog: onlyTools(), onPath: [], answers: [accept(), pick(), choose('退出')] });

    expect(result.output).toMatch(/^\s+名称\s+状态\s+说明\n\s+── 工具\n – fetcher\s+需要 AI Agent\s+第一个样例工具/m);
    expect(result.commands).toEqual([]);
    expect(result.exitCode).toBe(0);
    expect(readdirSync(result.home)).toEqual([]);
  });

  it('英文界面下工具的原因也是英文', async () => {
    const result = await run({ argv: ['--lang', 'en'], catalog: onlyTools(), onPath: [], answers: [accept(), pick(), choose('Exit')] });

    expect(result.output).toMatch(/^ – fetcher\s+needs an AI Agent\s+The first sample tool/m);
    expect(result.exitCode).toBe(0);
  });

  it('英文界面下同样说明', async () => {
    const result = await run({ argv: ['--lang', 'en'], onPath: [], answers: [choose('Recommended'), pick(), choose('Exit')] });

    expect(flat(result.output)).toContain(' Notice Claude Code, Codex and Pi not detected; components cannot be installed ');
    expect(result.output).toMatch(/^ – beta-pack\s+needs an AI Agent\s+The second sample skill$/m);
  });
});
