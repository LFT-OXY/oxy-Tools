// 测试用的样例目录数据；界面预览页另有一份更像真的 skill，但空的 catalog.json 也取自这里。

export const LONG_ABOUT = {
  zh: '第一个样例 skill，它的说明故意写得很长，长到在列表的一行里放不下，只能截断，全文要到列表下方去看',
  en: 'The first sample skill, described at such length that one list row cannot hold it and the full text has to be read below the list',
};

export const SAMPLE_SKILLS = [
  { name: 'alpha', version: '1.0.0', path: 'skills/alpha', description: LONG_ABOUT },
  {
    name: 'beta-pack',
    version: '2.3',
    path: 'skills/beta-pack',
    description: { zh: '第二个样例 skill', en: 'The second sample skill' },
  },
];

/** 样例 skill 的内容：目录根下的相对路径 → 文件内容 */
export const SAMPLE_FILES: Record<string, string> = {
  'skills/alpha/SKILL.md': '# alpha\n',
  'skills/alpha/references/guide.md': 'alpha 的参考文档\n',
  'skills/beta-pack/SKILL.md': '# beta-pack\n',
};

export const EMPTY_CATALOG = { version: 1, mcps: [], tools: [], apps: [] };

export const LONG_APP_ABOUT = {
  zh: '第一个样例应用项目，它的说明同样故意写得很长，长到在列表的一行里放不下，只能截断，全文要到列表下方和详情里去看',
  en: 'The first sample app, described at such length that one list row cannot hold it, so the full text has to be read below the list and in the detail',
};

export const SAMPLE_APPS = [
  { name: 'atlas', description: LONG_APP_ABOUT, url: 'https://example.com/atlas?tab=readme&lang=zh#install' },
  { name: 'borealis', description: { zh: '第二个样例应用项目', en: 'The second sample app' }, url: 'https://example.org/borealis' },
];

export const LONG_MCP_ABOUT = {
  zh: '本地进程方式的样例 MCP，它的说明故意写得很长，长到在列表的一行里放不下，只能截断，全文要到列表下方去看',
  en: 'A sample MCP run as a local process, described at such length that one list row cannot hold it and the full text has to be read below the list',
};

/** 两种连接方式各一条：本地进程、远程地址 */
export const SAMPLE_MCPS = [
  {
    name: 'docs-local',
    description: LONG_MCP_ABOUT,
    url: 'https://example.com/docs-local',
    server: { command: 'npx', args: ['-y', '@example/docs-mcp@latest'] },
  },
  {
    name: 'tracker-remote',
    description: { zh: '远程地址方式的样例 MCP', en: 'A sample MCP reached at a remote address' },
    url: 'https://example.org/tracker',
    server: { url: 'https://mcp.example.org/mcp' },
  },
];
