import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EMPTY_CATALOG, LONG_APP_ABOUT, SAMPLE_APPS, STACK_FRAME, accept, catalogDir, choose, run } from './harness.ts';

const withApps = (): string => catalogDir({ catalog: { ...EMPTY_CATALOG, apps: SAMPLE_APPS } });
const openBorealis = [choose('应用项目'), choose('borealis'), choose('返回'), choose('退出')];

describe('应用项目分组', () => {
  it('目录里有应用项目时，主菜单出现这个分组和它的数量', async () => {
    const result = await run({ catalog: withApps(), answers: [choose('退出')] });

    expect(result.output).toMatch(/^\s+应用项目\s+2\s+需要自行部署，这里只给链接$/m);
    expect(result.output).toMatch(/^\s+目录\s+2 skill · 2 应用项目$/m);
    expect(result.exitCode).toBe(0);
  });
});

describe('应用项目列表', () => {
  it('单选列表：每行是名字和一句话说明，末尾是返回；不打开任何链接', async () => {
    const result = await run({ catalog: withApps(), answers: [choose('应用项目'), choose('返回'), choose('退出')] });

    expect(result.output).toContain('选择应用项目');
    expect(result.output).toMatch(/ borealis\s+第二个样例应用项目$/m);
    expect(result.output).toMatch(/^\s+返回$/m);
    expect(result.output.split('选择分组')).toHaveLength(3);
    expect(result.opened).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  it('一行放不下的说明在列表里截断，全文显示在列表下方', async () => {
    const result = await run({ catalog: withApps(), answers: [choose('应用项目'), choose('返回'), choose('退出')] });

    expect(result.output).toMatch(/ atlas\s+第一个样例应用项目.*…$/m);
    expect(result.output).toContain(LONG_APP_ABOUT.zh);
  });
});

describe('应用项目详情', () => {
  it('选中一项：在默认浏览器打开它的官方链接', async () => {
    const result = await run({ catalog: withApps(), answers: openBorealis });

    expect(result.opened).toEqual(['https://example.org/borealis']);
    expect(result.commands).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  it('显示说明和完整的链接文本，并提醒打不开时复制链接', async () => {
    const result = await run({ catalog: withApps(), answers: openBorealis });

    expect(result.output).toMatch(/^── borealis ─+$/m);
    expect(result.output).toMatch(/^\s+说明\s+第二个样例应用项目$/m);
    expect(result.output).toMatch(/^\s+链接\s+https:\/\/example\.org\/borealis$/m);
    expect(result.output).toMatch(/^\s+✓\s+已在默认浏览器打开；打不开时请复制上面的链接$/m);
  });

  it('链接比一行长时也整条写出，不截断也不折开', async () => {
    const url = `https://example.com/${'deploy-guide/'.repeat(9)}README.md?plain=1#quick-start`;
    const result = await run({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, apps: [{ ...SAMPLE_APPS[1], url }] } }),
      answers: openBorealis,
    });

    expect(url.length).toBeGreaterThan(120);
    expect(result.output.split('\n')).toContainEqual(expect.stringMatching(/^\s+链接\s+https:\S+#quick-start$/));
    expect(result.output).toContain(url);
    expect(result.opened).toEqual([url]);
  });

  it('之后回到应用项目列表，可以接着看别的', async () => {
    const result = await run({
      catalog: withApps(),
      answers: [choose('应用项目'), choose('borealis'), choose('atlas'), choose('返回'), choose('退出')],
    });

    expect(result.opened).toEqual(['https://example.org/borealis', SAMPLE_APPS[0]?.url]);
    expect(result.output.split('? 选择应用项目')).toHaveLength(4);
  });
});

describe('浏览器打不开', () => {
  it('不报错也不退出：链接文本仍然完整可见，并提醒自己复制', async () => {
    const result = await run({ catalog: withApps(), browser: false, answers: openBorealis });

    expect(result.opened).toEqual(['https://example.org/borealis']);
    expect(result.output).toMatch(/^\s+链接\s+https:\/\/example\.org\/borealis$/m);
    expect(result.output).toMatch(/^\s+注意\s+没能打开浏览器，请复制上面的链接自行打开$/m);
    expect(result.output).not.toContain('已在默认浏览器打开');
    expect(result.output).not.toContain('出错');
    expect(result.output).not.toMatch(STACK_FRAME);
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });

  it('之后照常回到应用项目列表', async () => {
    const result = await run({ catalog: withApps(), browser: false, answers: openBorealis });

    expect(result.output.split('? 选择应用项目')).toHaveLength(3);
  });
});

describe('一个宿主都没检测到时的应用项目', () => {
  it('应用项目分组仍可进入，能打开链接', async () => {
    const result = await run({
      catalog: withApps(),
      onPath: [],
      answers: [choose('应用项目'), choose('borealis'), choose('返回'), choose('退出')],
    });

    expect(result.opened).toEqual(['https://example.org/borealis']);
    expect(result.exitCode).toBe(0);
  });

  it('上方的说明补一句应用项目仍可浏览；组件分组不可进入，光标直接落在应用项目上', async () => {
    // 直接回车进的就是应用项目
    const result = await run({ catalog: withApps(), onPath: [], answers: [accept(), choose('返回'), choose('退出')] });

    expect(result.output).toMatch(/^\s+注意\s+没有检测到 Claude Code 或 Codex，暂时装不了组件；应用项目仍可浏览$/m);
    expect(result.output).toMatch(/^- Skill\s+2\s+装进 AI Agent 的能力包 · 需要 AI Agent$/m);
    expect(result.output).toMatch(/^\s+应用项目\s+2\s+需要自行部署，这里只给链接$/m);
    expect(result.output).toContain('选择应用项目');
  });

  it('目录里只有应用项目时，主菜单只有这一个分组', async () => {
    const result = await run({
      catalog: catalogDir({ index: { version: 1, skills: [] }, catalog: { ...EMPTY_CATALOG, apps: SAMPLE_APPS } }),
      onPath: [],
      answers: [choose('退出')],
    });

    expect(result.output).toMatch(/^\s+目录\s+2 应用项目$/m);
    expect(result.output).not.toMatch(/^\W+Skill\s/m);
  });
});

describe('写坏的应用项目条目', () => {
  const good = SAMPLE_APPS[1];
  const app = (overrides: Record<string, unknown>): Record<string, unknown> => ({
    name: 'broken',
    description: { zh: '写坏的应用项目', en: 'A broken app' },
    url: 'https://example.com/broken',
    ...overrides,
  });

  it.each([
    ['name 里有路径分隔符', app({ name: 'nested/broken' })],
    ['name 里有大写字母', app({ name: 'Broken' })],
    ['缺 name', app({ name: undefined })],
    ['缺中文说明', app({ description: { en: 'A broken app' } })],
    ['说明不是对象', app({ description: '写坏的应用项目' })],
    ['说明里夹着终端控制码', app({ description: { zh: '写坏的应用项目\x1b[2J', en: 'A broken app' } })],
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
    const result = await run({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, apps: [entry, good] } }),
      answers: [choose('应用项目'), choose('返回'), choose('退出')],
    });

    expect(result.output).toMatch(/^\s+注意\s+目录中有 1 个条目格式有误，已跳过$/m);
    expect(result.output).toMatch(/^\s+目录\s+2 skill · 1 应用项目$/m);
    expect(result.output).toMatch(/ borealis\s+第二个样例应用项目$/m);
    expect(result.output).not.toContain('broken');
    expect(result.exitCode).toBe(0);
  });

  it('重名的应用项目只留第一条', async () => {
    const again = { ...good, description: { zh: '重名的那一条', en: 'The duplicate' } };
    const result = await run({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, apps: [good, again] } }),
      answers: [choose('应用项目'), choose('返回'), choose('退出')],
    });

    expect(result.output).toMatch(/^\s+注意\s+目录中有 1 个条目格式有误，已跳过$/m);
    expect(result.output).not.toContain('重名的那一条');
  });

  it('名字只在组内唯一：应用项目可以和 skill 同名', async () => {
    const result = await run({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, apps: [{ ...good, name: 'alpha' }] } }),
      answers: [choose('应用项目'), choose('alpha'), choose('返回'), choose('退出')],
    });

    expect(result.output).not.toContain('格式有误');
    expect(result.opened).toEqual(['https://example.org/borealis']);
  });

  it('全部应用项目都被跳过时，主菜单不出现这个分组', async () => {
    const result = await run({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, apps: [app({ url: 'http://example.com' })] } }),
      answers: [choose('退出')],
    });

    expect(result.output).not.toContain('应用项目');
    expect(result.exitCode).toBe(0);
  });

  it('不认识的字段被忽略，条目照常可用', async () => {
    const result = await run({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, apps: [{ ...good, tags: ['docker'], stars: 9000 }] } }),
      answers: [choose('应用项目'), choose('borealis'), choose('返回'), choose('退出')],
    });

    expect(result.output).not.toContain('格式有误');
    expect(result.opened).toEqual(['https://example.org/borealis']);
  });

  it('名字长到一行放不下的应用项目也能列出，不会让安装器出错', async () => {
    const name = `app-${'x'.repeat(90)}`;
    const result = await run({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, apps: [{ ...good, name }] } }),
      answers: [choose('应用项目'), choose(name), choose('返回'), choose('退出')],
    });

    expect(result.output).not.toContain('出错');
    expect(result.output).toContain(name);
    expect(result.exitCode).toBe(0);
  });
});

describe('catalog.json 的 apps 不是数组', () => {
  it('整份目录读不了：说明是哪个文件的哪个字段，以非零状态退出，不显示堆栈', async () => {
    const dir = catalogDir({ catalog: { ...EMPTY_CATALOG, apps: { atlas: SAMPLE_APPS[0] } } });
    const result = await run({ catalog: dir });

    expect(result.stderr).toContain('出错：目录格式有误');
    expect(result.stderr).toMatch(/^\s+原因\s+catalog\.json 的 apps 不是数组$/m);
    expect(result.stderr).toContain(join(dir, 'catalog.json'));
    expect(result.output).not.toMatch(STACK_FRAME);
    expect(result.output).not.toContain('选择分组');
    expect(result.exitCode).toBe(1);
  });

  it('缺了 apps 这个数组时当作没有应用项目', async () => {
    const result = await run({ catalog: catalogDir({ catalog: { version: 1 } }), answers: [choose('退出')] });

    expect(result.output).not.toContain('应用项目');
    expect(result.output).not.toContain('出错');
    expect(result.exitCode).toBe(0);
  });
});

describe('英文界面下的应用项目', () => {
  const english = { argv: ['--lang', 'en'] };

  it('分组、列表和详情都是英文，说明取英文的那一份', async () => {
    const result = await run({
      ...english,
      catalog: withApps(),
      answers: [choose('Apps'), choose('borealis'), choose('Back'), choose('Exit')],
    });

    expect(result.output).toMatch(/^\s+Catalog\s+2 skills · 2 apps$/m);
    expect(result.output).toMatch(/^\s+Apps\s+2\s+Deploy them yourself; only links here$/m);
    expect(result.output).toContain('Pick an app');
    expect(result.output).toMatch(/^\s+About\s+The second sample app$/m);
    expect(result.output).toMatch(/^\s+Link\s+https:\/\/example\.org\/borealis$/m);
    expect(result.output).toMatch(/^\s+✓\s+Opened in your default browser; if nothing opened, copy the link above$/m);
    expect(result.opened).toEqual(['https://example.org/borealis']);
  });

  it('浏览器打不开时的提醒也是英文', async () => {
    const result = await run({
      ...english,
      catalog: withApps(),
      browser: false,
      answers: [choose('Apps'), choose('borealis'), choose('Back'), choose('Exit')],
    });

    expect(result.output).toMatch(/^\s+Notice\s+Could not open a browser; copy the link above and open it yourself$/m);
  });

  it('一个宿主都没检测到时，同样说明组件装不了、应用项目仍可浏览', async () => {
    const result = await run({ ...english, catalog: withApps(), onPath: [], answers: [choose('Exit')] });

    // 这一句比一行长，会折成两行
    expect(result.output.replace(/\n\s+/g, ' ')).toContain(
      'Notice    Claude Code and Codex not detected; components cannot be installed; apps can still be browsed',
    );
  });

  it('只有一个应用项目时用单数', async () => {
    const result = await run({
      ...english,
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, apps: [SAMPLE_APPS[1]] } }),
      answers: [choose('Exit')],
    });

    expect(result.output).toMatch(/^\s+Catalog\s+2 skills · 1 app$/m);
  });
});
