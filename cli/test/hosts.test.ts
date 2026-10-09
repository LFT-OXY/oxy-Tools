import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SAMPLE_FILES, accept, choose, pick, run } from './harness.ts';

const claudeSkills = (home: string): string => join(home, '.claude', 'skills');
const codexSkills = (home: string): string => join(home, '.agents', 'skills');
const read = (...path: string[]): string => readFileSync(join(...path), 'utf8');
const marker = (skillsDir: string, name: string): Record<string, unknown> =>
  JSON.parse(read(skillsDir, name, '.oxy-tools.json')) as Record<string, unknown>;

describe('只检测到 Codex', () => {
  const installAlpha = [choose('Skill'), pick('alpha'), choose('开始安装'), choose('退出')];

  it('可执行路径上有 codex 命令时算检测到，skill 装进用户主目录的 .agents/skills', async () => {
    const result = await run({ onPath: ['codex'], answers: installAlpha });

    expect(result.output).toMatch(/^\s+AI Agent\s+Claude Code – 未检测到\s+Codex ✓$/m);
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

describe('只检测到一个宿主', () => {
  it('只有 Claude Code：说明 Codex 没有检测到并被跳过，不问装进哪个，直接装进 Claude Code', async () => {
    const result = await run({
      onPath: ['claude'],
      answers: [choose('Skill'), pick('alpha'), choose('开始安装'), choose('退出')],
    });

    expect(result.output).toMatch(/^\s+AI Agent\s+Claude Code ✓\s+Codex – 未检测到$/m);
    expect(result.output).toMatch(/^\s+注意\s+没有检测到 Codex，已跳过；组件只装进 Claude Code$/m);
    expect(result.output).not.toContain('装进哪些 AI Agent');
    expect(readdirSync(result.home)).toEqual(['.claude']);
  });

  it('只有 Codex：说明 Claude Code 没有检测到并被跳过', async () => {
    const result = await run({ onPath: ['codex'], answers: [choose('退出')] });

    expect(result.output).toMatch(/^\s+注意\s+没有检测到 Claude Code，已跳过；组件只装进 Codex$/m);
  });

  it('英文界面下同样说明', async () => {
    const result = await run({ argv: ['--lang', 'en'], onPath: ['claude'], answers: [choose('Exit')] });

    expect(result.output).toMatch(/^\s+AI Agent\s+Claude Code ✓\s+Codex – not detected$/m);
    expect(result.output).toMatch(/^\s+Notice\s+Codex not detected, skipped; components go into Claude Code only$/m);
  });

  it('名字只是相近的命令不算数', async () => {
    const result = await run({ onPath: ['claude-helper', 'codex-helper'], answers: [choose('退出')] });

    expect(result.output).toMatch(/^\s+AI Agent\s+Claude Code – 未检测到\s+Codex – 未检测到$/m);
  });
});

describe('检测到两个宿主', () => {
  const onPath = ['claude', 'codex'];
  const bothHosts = pick('Claude Code', 'Codex');

  it('安装 skill 前先问装进哪些宿主：两项都默认勾选，各带自己的 skill 目录', async () => {
    const result = await run({ onPath, answers: [choose('Skill'), pick(), choose('退出')] });

    expect(result.output).toMatch(/^\s+AI Agent\s+Claude Code ✓\s+Codex ✓$/m);
    expect(result.output).not.toContain('未检测到');
    expect(result.output).toContain('装进哪些 AI Agent');
    expect(result.output).toMatch(/^\s*■ Claude Code\s+~\S+skills$/m);
    expect(result.output).toMatch(/^\s*■ Codex\s+~\S+skills$/m);
    expect(result.output).toContain(join('~', '.claude', 'skills'));
    expect(result.output).toContain(join('~', '.agents', 'skills'));
  });

  it('宿主选择上什么都不动直接确认：默认就是两个都装', async () => {
    const result = await run({
      onPath,
      answers: [choose('Skill'), accept(), pick('alpha'), choose('开始安装'), choose('退出')],
    });

    expect(readdirSync(claudeSkills(result.home))).toEqual(['alpha']);
    expect(readdirSync(codexSkills(result.home))).toEqual(['alpha']);
  });

  it('两个都选：同一个 skill 装进两处，各有自己的安装标记', async () => {
    const result = await run({
      onPath,
      answers: [choose('Skill'), bothHosts, pick('alpha'), choose('开始安装'), choose('退出')],
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
      answers: [choose('Skill'), bothHosts, pick('alpha', 'beta-pack'), choose('开始安装'), choose('退出')],
    });

    expect(result.output).toMatch(/^── 将安装 2 个 skill ─+$/m);
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
      answers: [choose('Skill'), pick('Codex'), pick('alpha'), choose('开始安装'), choose('退出')],
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
      answers: [choose('Skill'), bothHosts, pick('alpha'), choose('开始安装'), choose('退出')],
    });

    expect(result.output).toMatch(/^\s+✓\s+alpha\s+Claude Code\s+已安装 1\.0\.0$/m);
    expect(result.output).toMatch(/^\s+✗\s+alpha\s+Codex\s+失败 写入失败（[A-Z]+），目标目录未改动$/m);
    expect(result.output).toMatch(/^\s+合计\s+1 成功 · 1 失败 · 0 跳过$/m);
    expect(existsSync(join(claudeSkills(result.home), 'alpha', 'SKILL.md'))).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it('一个宿主都不勾就确认：回到主菜单，什么都不装', async () => {
    const result = await run({ onPath, answers: [choose('Skill'), pick(), choose('退出')] });

    expect(result.output).not.toContain('选择要安装的 skill');
    expect(result.output.split('选择分组')).toHaveLength(3);
    expect(readdirSync(result.home)).toEqual([]);
  });

  it('skill 一个都不勾就确认：回到宿主选择，之前勾的还在', async () => {
    const result = await run({
      onPath,
      answers: [choose('Skill'), pick('Codex'), pick(), pick(), choose('退出')],
    });

    const [, , again = ''] = result.output.split('装进哪些 AI Agent');
    expect(again).toMatch(/^\s*□ Claude Code\s/m);
    expect(again).toMatch(/^\s*■ Codex\s/m);
    expect(result.output.split('选择分组')).toHaveLength(3);
  });

  it('在汇总里选「返回修改」回到 skill 列表，不重问宿主', async () => {
    const result = await run({
      onPath,
      answers: [choose('Skill'), bothHosts, pick('alpha'), choose('返回修改'), pick('beta-pack'), choose('开始安装'), choose('退出')],
    });

    expect(result.output.split('装进哪些 AI Agent')).toHaveLength(2);
    expect(readdirSync(claudeSkills(result.home))).toEqual(['beta-pack']);
    expect(readdirSync(codexSkills(result.home))).toEqual(['beta-pack']);
  });

  it('英文界面下的宿主选择', async () => {
    const result = await run({ argv: ['--lang', 'en'], onPath, answers: [choose('Skill'), pick(), choose('Exit')] });

    expect(result.output).toContain('Install into which AI Agents');
    expect(result.output).toMatch(/^\s*■ Codex\s+~\S+skills$/m);
  });
});

describe('一个宿主都没检测到', () => {
  it('主菜单上方说明原因，两个宿主都写明未检测到', async () => {
    const result = await run({ onPath: [], answers: [choose('退出')] });

    expect(result.output).toMatch(/^\s+AI Agent\s+Claude Code – 未检测到\s+Codex – 未检测到$/m);
    expect(result.output).toMatch(/^\s+注意\s+没有检测到 Claude Code 或 Codex，暂时装不了组件$/m);
    expect(result.exitCode).toBe(0);
  });

  it('skill 分组不可进入并注明原因，光标落在能选的那一项上', async () => {
    // 直接回车：光标起始所在的那一项是「退出」，所以这一个应答就结束了
    const result = await run({ onPath: [], answers: [accept()] });

    expect(result.output).toMatch(/^- Skill\s+2\s+装进 AI Agent 的能力包 · 需要 AI Agent$/m);
    expect(result.output).not.toContain('选择要安装的 skill');
    expect(result.output).not.toContain('浏览 skill');
    expect(result.exitCode).toBe(0);
    expect(readdirSync(result.home)).toEqual([]);
  });

  it('英文界面下同样说明', async () => {
    const result = await run({ argv: ['--lang', 'en'], onPath: [], answers: [choose('Exit')] });

    expect(result.output).toMatch(/^\s+Notice\s+Claude Code and Codex not detected; components cannot be installed$/m);
    expect(result.output).toMatch(/^- Skill\s+2\s+Capability packs for your AI Agent · needs an AI Agent$/m);
  });
});
