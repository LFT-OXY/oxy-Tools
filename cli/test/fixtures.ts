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
