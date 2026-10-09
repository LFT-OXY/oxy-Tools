import { describe, expect, it } from 'vitest';
import { LONG_ABOUT, catalogDir, choose, pick, run } from './harness.ts';

describe('主菜单', () => {
  it('catalog.json 三个数组为空时，只有 skill 一个分组和退出', async () => {
    const result = await run({ answers: [choose('退出')] });

    expect(result.output).toContain('选择分组');
    expect(result.output).toMatch(/^\s+Skill\s+2\s+/m);
    expect(result.output).toMatch(/^\s+退出$/m);
    expect(result.output).not.toContain('MCP');
    expect(result.output).not.toContain('工具 ');
    expect(result.output).not.toContain('应用项目');
    expect(result.exitCode).toBe(0);
  });
});

describe('skill 列表', () => {
  const browse = [choose('Skill'), pick(), choose('退出')];

  it('列出每个 skill 的名字和一句话说明，并能返回主菜单', async () => {
    const result = await run({ answers: browse });

    expect(result.output).toMatch(/ alpha\s+未装\s+第一个样例 skill/m);
    expect(result.output).toMatch(/ beta-pack\s+未装\s+第二个样例 skill$/m);
    expect(result.output.split('选择分组')).toHaveLength(3);
    expect(result.exitCode).toBe(0);
  });

  it('一行放不下的说明在列表里截断，全文显示在列表下方', async () => {
    const result = await run({ answers: browse });

    expect(result.output).toMatch(/ alpha\s+未装\s+第一个样例 skill.*…$/m);
    expect(result.output).toContain(LONG_ABOUT.zh);
  });

  it('名字长到一行放不下的 skill 也能列出，不会让安装器出错', async () => {
    const name = `skill-${'x'.repeat(90)}`;
    const long = { name, version: '1.0.0', path: `skills/${name}`, description: { zh: '名字很长', en: 'A long name' } };
    const result = await run({ catalog: catalogDir({ index: { version: 1, skills: [long] } }), answers: browse });

    expect(result.output).not.toContain('出错');
    expect(result.output).toContain(name);
    expect(result.exitCode).toBe(0);
  });
});
