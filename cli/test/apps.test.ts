import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EMPTY_CATALOG, LONG_APP_ABOUT, SAMPLE_APPS, SAMPLE_MCPS, SAMPLE_TOOLS, STACK_FRAME, accept, catalogDir, choose, pick, run } from './harness.ts';

// 样例的两个用途，照用途清单的顺序；borealis 在前一个下面，atlas 在后一个下面
const WEB_SEARCH = '联网搜索与文档检索';
const DEV_WORKFLOW = '开发工作流与规范';
const [ATLAS, BOREALIS] = SAMPLE_APPS as [(typeof SAMPLE_APPS)[0], (typeof SAMPLE_APPS)[1]];
const CIRRUS = {
  name: 'cirrus',
  description: { zh: '第三个样例外部项目', en: 'The third sample external project' },
  url: 'https://example.net/cirrus',
  purpose: 'web-search',
};

const withApps = (apps: unknown[] = SAMPLE_APPS): string => catalogDir({ catalog: { ...EMPTY_CATALOG, apps } });
const viewBorealis = [choose(WEB_SEARCH), pick('borealis'), choose('退出')];
// 列表里可以勾选的行
const listed = (output: string): string[] => output.split('\n').filter((line) => /^ □ /.test(line));

describe('主菜单按用途进入', () => {
  it('各个用途按用途清单的顺序排列，每行写着它下面的条目数', async () => {
    // 排在后面的那个用途条目更多：顺序照的是用途清单，不是数量
    const result = await run({ catalog: withApps([...SAMPLE_APPS, { ...CIRRUS, purpose: 'dev-workflow' }]), answers: [choose('退出')] });

    expect(result.output).toContain('选择用途');
    expect(result.output).toMatch(/^\s+用途\s+数量\n\s+推荐\s+2\n\s+联网搜索与文档检索\s+1\n\s+开发工作流与规范\s+2$/m);
    expect(result.exitCode).toBe(0);
  });

  it('条目数与进入后列表里的行数一致', async () => {
    const result = await run({ catalog: withApps([...SAMPLE_APPS, CIRRUS]), answers: [choose(WEB_SEARCH), pick(), choose('退出')] });

    expect(listed(result.output)).toHaveLength(2);
  });

  it('「目录」一行把外部项目数上；主菜单上没有「应用项目」这个分组', async () => {
    const result = await run({ catalog: withApps(), answers: [choose('退出')] });

    expect(result.output).toMatch(/^\s+目录\s+2 skill · 2 外部项目$/m);
    expect(result.output).not.toContain('应用项目');
  });

  it('进去之后一行都没有的用途不出现', async () => {
    const result = await run({ catalog: withApps([BOREALIS]), answers: [choose('退出')] });

    expect(result.output).toMatch(/^\s+联网搜索与文档检索\s+1$/m);
    expect(result.output).not.toContain(DEV_WORKFLOW);
  });

  it('工具这个旧分组留在各用途之后，照旧带着数量和说明；MCP 数在各自的用途里，没有「Skill」「MCP」这两个分组', async () => {
    const result = await run({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: SAMPLE_MCPS, tools: SAMPLE_TOOLS, apps: SAMPLE_APPS } }),
      answers: [choose('退出')],
    });

    expect(result.output).toMatch(
      /^\s+用途\s+数量\s+说明\n\s+推荐\s+2\n\s+联网搜索与文档检索\s+2\n\s+开发工作流与规范\s+2\n\s+工具\s+2\s+执行其官方安装命令装上的工具\n\s*\n\s+退出$/m,
    );
    expect(result.output).not.toMatch(/^\s+(Skill|MCP)\s+\d/m);
  });
});

describe('用途下的列表', () => {
  it('多选列表：外部项目单独成一段，段首写明只给链接；每行是名字和一句话说明', async () => {
    const result = await run({ catalog: withApps(), answers: [choose(WEB_SEARCH), pick(), choose('退出')] });

    expect(result.output).toContain('选择要安装的条目');
    expect(result.output).toMatch(/^\s+名称\s+说明\n\s+── 外部项目 · 只给链接，不安装\n □ borealis\s+第二个样例外部项目$/m);
  });

  it('一个都不勾就确认：回到主菜单，什么都不列', async () => {
    const result = await run({ catalog: withApps(), answers: [choose(WEB_SEARCH), pick(), choose('退出')] });

    expect(result.output.split('选择用途')).toHaveLength(3);
    expect(result.output).not.toContain('外部项目：');
    expect(result.output).not.toContain('https://');
    expect(result.opened).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  it('一行放不下的说明在列表里截断；光标所在行的类型和说明全文显示在列表下方', async () => {
    const result = await run({ catalog: withApps(), answers: [choose(DEV_WORKFLOW), pick(), choose('退出')] });

    expect(result.output).toMatch(/ atlas\s+第一个样例外部项目.*…$/m);
    expect(result.output).toContain(`\n外部项目\n${LONG_APP_ABOUT.zh}\n`);
  });

  it('外部项目按名字排，不照目录里的先后', async () => {
    const result = await run({ catalog: withApps([CIRRUS, BOREALIS]), answers: [choose(WEB_SEARCH), pick(), choose('退出')] });

    expect(listed(result.output).map((line) => line.trim().split(/\s+/)[1])).toEqual(['borealis', 'cirrus']);
  });
});

describe('外部项目的说明与链接', () => {
  it('只勾了外部项目：不问是否执行，直接列出名字、说明和完整的链接，然后回主菜单', async () => {
    // 多问一句「开始安装吗」的话，这里会因为没有预设应答而失败
    const result = await run({ catalog: withApps(), answers: viewBorealis });

    expect(result.output).toMatch(/^── 外部项目：1 个，只给链接 ─+$/m);
    expect(result.output).toMatch(/^\s+borealis\n\s+说明\s+第二个样例外部项目\n\s+链接\s+https:\/\/example\.org\/borealis$/m);
    expect(result.output).not.toContain('开始安装吗');
    expect(result.output.split('选择用途')).toHaveLength(3);
    expect(result.commands).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  it('勾了多个：每个一段，段与段之间空一行', async () => {
    const result = await run({
      catalog: withApps([CIRRUS, BOREALIS]),
      answers: [choose(WEB_SEARCH), pick('borealis', 'cirrus'), choose('退出')],
    });

    expect(result.output).toMatch(/^── 外部项目：2 个，只给链接 ─+$/m);
    expect(result.output).toMatch(
      /^\s+borealis\n\s+说明\s+第二个样例外部项目\n\s+链接\s+https:\/\/example\.org\/borealis\n\n\s+cirrus\n\s+说明\s+第三个样例外部项目\n\s+链接\s+https:\/\/example\.net\/cirrus$/m,
    );
  });

  it('整个运行里一次都没有调用链接打开器，画面上也没有打开浏览器的话', async () => {
    const result = await run({
      catalog: withApps([...SAMPLE_APPS, CIRRUS]),
      answers: [choose(WEB_SEARCH), pick('borealis', 'cirrus'), choose(DEV_WORKFLOW), pick('atlas'), choose('退出')],
    });

    expect(result.opened).toEqual([]);
    expect(result.output).not.toContain('浏览器');
    expect(result.output).not.toContain('出错');
    expect(result.stderr).toBe('');
  });

  it('说明比一行长时折成几行，全文都在', async () => {
    const result = await run({ catalog: withApps(), answers: [choose(DEV_WORKFLOW), pick('atlas'), choose('退出')] });

    const detail = result.output.slice(result.output.indexOf('── 外部项目：'));
    const [first = '', second = ''] = detail.split('\n').filter((line) => /样例外部项目|说明里去看/.test(line));
    expect(first).toMatch(/^\s+说明\s+第一个样例外部项目/);
    expect(second).not.toBe('');
    expect(`${first.trim()}${second.trim()}`).toContain(LONG_APP_ABOUT.zh);
  });

  it('链接比一行长时也整条写出，不截断也不折开', async () => {
    const url = `https://example.com/${'deploy-guide/'.repeat(9)}README.md?plain=1#quick-start`;
    const result = await run({ catalog: withApps([{ ...BOREALIS, url }]), answers: viewBorealis });

    expect(url.length).toBeGreaterThan(120);
    expect(result.output.split('\n')).toContainEqual(expect.stringMatching(/^\s+链接\s+https:\S+#quick-start$/));
    expect(result.output).toContain(url);
  });

  it('之后回到主菜单，可以接着进别的用途', async () => {
    const result = await run({
      catalog: withApps(),
      answers: [choose(WEB_SEARCH), pick('borealis'), choose(DEV_WORKFLOW), pick('atlas'), choose('退出')],
    });

    expect(result.output).toContain('https://example.org/borealis');
    expect(result.output).toContain(ATLAS.url);
    expect(result.output.split('? 选择用途')).toHaveLength(4);
  });
});

describe('一个宿主都没检测到时的外部项目', () => {
  it('用途照常可以进入，外部项目照常可选', async () => {
    const result = await run({ catalog: withApps(), onPath: [], answers: viewBorealis });

    expect(result.output).toMatch(/^\s+链接\s+https:\/\/example\.org\/borealis$/m);
    expect(result.opened).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  it('上方的说明补一句外部项目仍可浏览；旧分组不可进入，光标直接落在第一行上', async () => {
    // 直接回车进的就是第一行「推荐」
    const result = await run({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, tools: SAMPLE_TOOLS, apps: SAMPLE_APPS } }),
      onPath: [],
      answers: [accept(), pick(), choose(WEB_SEARCH), pick(), choose('退出')],
    });

    expect(result.output).toMatch(/^\s+注意\s+没有检测到 Claude Code 或 Codex，暂时装不了组件；外部项目仍可浏览$/m);
    expect(result.output).toMatch(/^- 工具\s+2\s+执行其官方安装命令装上的工具 · 需要 AI Agent$/m);
    // 第一个应答进的是「推荐」：它下面是本仓库的 skill
    expect(result.output.split('? 选择要安装的条目')[1]).toMatch(/^ – alpha\s+需要 AI Agent\s/m);
    expect(result.output).toMatch(/ borealis\s+第二个样例外部项目$/m);
  });

  it('目录里只有外部项目时，主菜单只有用途和退出', async () => {
    const result = await run({
      catalog: catalogDir({ index: { version: 1, skills: [] }, catalog: { ...EMPTY_CATALOG, apps: SAMPLE_APPS } }),
      onPath: [],
      answers: [choose('退出')],
    });

    expect(result.output).toMatch(/^\s+目录\s+2 外部项目$/m);
    expect(result.output).toMatch(/^\s+用途\s+数量$/m);
    expect(result.output).not.toMatch(/^\W+Skill\s/m);
  });
});

describe('写坏的外部项目条目', () => {
  const good = BOREALIS;
  const app = (overrides: Record<string, unknown>): Record<string, unknown> => ({
    name: 'broken',
    description: { zh: '写坏的外部项目', en: 'A broken external project' },
    url: 'https://example.com/broken',
    // 带上用途：每条用例里写坏的只有它自己改掉的那个字段。它和好的那一条在同一个用途下
    purpose: 'web-search',
    ...overrides,
  });
  const browse = [choose(WEB_SEARCH), pick(), choose('退出')];

  it.each([
    ['name 里有路径分隔符', app({ name: 'nested/broken' })],
    ['name 里有大写字母', app({ name: 'Broken' })],
    ['缺 name', app({ name: undefined })],
    ['缺中文说明', app({ description: { en: 'A broken external project' } })],
    ['说明不是对象', app({ description: '写坏的外部项目' })],
    ['说明里夹着终端控制码', app({ description: { zh: '写坏的外部项目\x1b[2J', en: 'A broken external project' } })],
    ['缺 url', app({ url: undefined })],
    ['url 不是文字', app({ url: 42 })],
    ['url 不是 https', app({ url: 'http://example.com/broken' })],
    ['url 是别的协议', app({ url: 'file:///etc/passwd' })],
    ['url 是脚本', app({ url: 'javascript:alert(1)' })],
    ['url 只有协议', app({ url: 'https://' })],
    ['url 解析不了', app({ url: 'https://[example' })],
    ['url 里有空格', app({ url: 'https://example.com/a broken' })],
    ['url 里夹着终端控制码', app({ url: 'https://example.com/\x1b[2Jbroken' })],
    ['url 里有不可见的字符', app({ url: 'https://example.com/\u202ebroken' })],
    ['url 里有引号', app({ url: 'https://example.com/"broken"' })],
    ['url 里有反斜杠', app({ url: 'https://example.com\\broken' })],
    ['url 里有没编码的汉字', app({ url: 'https://example.com/写坏的' })],
    ['url 前面有空白', app({ url: ' https://example.com/broken' })],
    ['条目不是对象', 'broken'],
  ])('%s：跳过这一条并提示数量，其余条目照常', async (_label, entry) => {
    const result = await run({ catalog: withApps([entry, good]), answers: browse });

    expect(result.output).toMatch(/^\s+注意\s+目录中有 1 个条目格式有误，已跳过$/m);
    expect(result.output).toMatch(/^\s+目录\s+2 skill · 1 外部项目$/m);
    expect(result.output).toMatch(/^\s+联网搜索与文档检索\s+1$/m);
    expect(result.output).toMatch(/ borealis\s+第二个样例外部项目$/m);
    expect(result.output).not.toContain('broken');
    expect(result.exitCode).toBe(0);
  });

  it('重名的外部项目只留第一条', async () => {
    const again = { ...good, description: { zh: '重名的那一条', en: 'The duplicate' } };
    const result = await run({ catalog: withApps([good, again]), answers: browse });

    expect(result.output).toMatch(/^\s+注意\s+目录中有 1 个条目格式有误，已跳过$/m);
    expect(result.output).not.toContain('重名的那一条');
  });

  it('名字只在组内唯一：外部项目可以和 skill 同名', async () => {
    const result = await run({
      catalog: withApps([{ ...good, name: 'alpha' }]),
      answers: [choose(WEB_SEARCH), pick('alpha'), choose('退出')],
    });

    expect(result.output).not.toContain('格式有误');
    expect(result.output).toMatch(/^\s+链接\s+https:\/\/example\.org\/borealis$/m);
  });

  it('一个用途下的外部项目全部被跳过时，主菜单不出现这个用途', async () => {
    const result = await run({ catalog: withApps([app({ url: 'http://example.com' })]), answers: [choose('退出')] });

    expect(result.output).not.toContain(WEB_SEARCH);
    expect(result.output).not.toContain('外部项目');
    expect(result.exitCode).toBe(0);
  });

  it('不认识的字段被忽略，条目照常可用', async () => {
    const result = await run({ catalog: withApps([{ ...good, tags: ['docker'], stars: 9000 }]), answers: viewBorealis });

    expect(result.output).not.toContain('格式有误');
    expect(result.output).toMatch(/^\s+链接\s+https:\/\/example\.org\/borealis$/m);
  });

  it('名字长到一行放不下的外部项目也能列出、能勾选，不会让安装器出错', async () => {
    const name = `app-${'x'.repeat(90)}`;
    const result = await run({
      catalog: withApps([{ ...good, name }]),
      answers: [choose(WEB_SEARCH), pick(name), choose('退出')],
    });

    expect(result.output).not.toContain('出错');
    expect(result.output).toMatch(new RegExp(`^\\s+${name}$`, 'm'));
    expect(result.exitCode).toBe(0);
  });
});

describe('catalog.json 的 apps 不是数组', () => {
  it('整份目录读不了：说明是哪个文件的哪个字段，以非零状态退出，不显示堆栈', async () => {
    const dir = catalogDir({ catalog: { ...EMPTY_CATALOG, apps: { atlas: ATLAS } } });
    const result = await run({ catalog: dir });

    expect(result.stderr).toContain('出错：目录格式有误');
    expect(result.stderr).toMatch(/^\s+原因\s+catalog\.json 的 apps 不是数组$/m);
    expect(result.stderr).toContain(join(dir, 'catalog.json'));
    expect(result.output).not.toMatch(STACK_FRAME);
    expect(result.output).not.toContain('选择用途');
    expect(result.exitCode).toBe(1);
  });

  it('缺了 apps 这个数组时当作没有外部项目', async () => {
    const result = await run({ catalog: catalogDir({ catalog: { version: 1 } }), answers: [choose('退出')] });

    expect(result.output).not.toContain('外部项目');
    expect(result.output).not.toContain('出错');
    expect(result.exitCode).toBe(0);
  });
});

describe('英文界面下的外部项目', () => {
  const english = { argv: ['--lang', 'en'] };
  const WEB_SEARCH_EN = 'Web search & docs retrieval';

  it('主菜单、列表和说明与链接都是英文，说明取英文的那一份', async () => {
    const result = await run({
      ...english,
      catalog: withApps(),
      answers: [choose(WEB_SEARCH_EN), pick('borealis'), choose('Exit')],
    });

    expect(result.output).toMatch(/^\s+Catalog\s+2 skills · 2 external$/m);
    expect(result.output).toContain('Pick a purpose');
    expect(result.output).toMatch(/^\s+Purpose\s+Count\n\s+Recommended\s+2$/m);
    expect(result.output).toMatch(/^\s+Web search & docs retrieval\s+1\n\s+Development workflow & conventions\s+1$/m);
    expect(result.output).toContain('Pick entries to install');
    expect(result.output).toMatch(/^\s+Name\s+About\n\s+── External projects · links only, nothing is installed$/m);
    expect(result.output).toContain('\nExternal project\nThe second sample external project\n');
    expect(result.output).toMatch(/^── External projects: 1, links only ─+$/m);
    expect(result.output).toMatch(/^\s+borealis\n\s+About\s+The second sample external project\n\s+Link\s+https:\/\/example\.org\/borealis$/m);
    expect(result.output).not.toMatch(/\bApps?\b/);
    expect(result.output).not.toContain('browser');
    expect(result.opened).toEqual([]);
  });

  it('一个宿主都没检测到时，同样说明组件装不了、外部项目仍可浏览', async () => {
    const result = await run({ ...english, catalog: withApps(), onPath: [], answers: [choose('Exit')] });

    // 这一句比一行长，会折成两行
    expect(result.output.replace(/\n\s+/g, ' ')).toContain(
      'Notice    Claude Code and Codex not detected; components cannot be installed; external projects can still be browsed',
    );
  });

  it('只有一个外部项目时写法不变', async () => {
    const result = await run({ ...english, catalog: withApps([BOREALIS]), answers: [choose('Exit')] });

    expect(result.output).toMatch(/^\s+Catalog\s+2 skills · 1 external$/m);
  });
});
