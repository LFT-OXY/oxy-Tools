// 界面文案，中英各一份。
import type { CatalogFailure } from './catalog.ts';
import type { SkillInstallProblem } from './install-skill.ts';

export type Lang = 'zh' | 'en';

/** 让安装器无法继续、需要向用户说明原因和下一步的情况。 */
export type Failure =
  | { kind: 'no-terminal' }
  | { kind: 'unknown-argument'; argument: string }
  | { kind: 'bad-language'; value: string | undefined }
  | CatalogFailure
  | { kind: 'unexpected'; detail: string };

export interface FailureText {
  title: string;
  cause: string;
  /** 出问题的网址或路径；单独占一行，不截断也不折行 */
  location?: string;
  /** 出路，不止一条时各占一行 */
  next: string[];
}

export interface Messages {
  tagline: string;
  loading: { catalog: string; skillFiles: string };
  agentKey: string;
  notDetected: string;
  /** 一个宿主都没检测到；hosts 是安装器认识的全部宿主的名字，appsBrowsable 表示目录里有应用项目可看 */
  noHosts: (hosts: readonly string[], appsBrowsable: boolean) => string;
  /** 只检测到一部分宿主：missing 是没检测到的，present 是检测到的，都已按并列的写法连好 */
  hostsSkipped: (missing: string, present: string) => string;
  catalogKey: string;
  noticeKey: string;
  /** 目录里各类条目的数量，每类一段；没有条目的那一类不写 */
  counts: (counts: { skills: number; apps: number }) => string[];
  noEntries: string;
  skipped: (count: number) => string;
  pickGroup: string;
  groupColumn: string;
  countColumn: string;
  aboutColumn: string;
  exit: string;
  back: string;
  /** 分组不可进入的原因，接在那一行的末尾 */
  needsHost: string;
  /** 在不可选的行上按了确认 */
  unavailable: string;
  nameColumn: string;
  /** skill 在某个宿主下的状态；版本不同时不用词，直接写两个版本号 */
  skillStatus: { none: string; installed: string; unmanaged: string };
  pickHosts: string;
  pickSkills: string;
  pickApp: string;
  linkKey: string;
  /** 应用项目的链接已经交给浏览器；浏览器有没有真的打开，安装器不一定看得出来 */
  linkOpened: string;
  linkNotOpened: string;
  /** 并列几个名字时用的分隔 */
  listSeparator: string;
  entryColumn: string;
  agentColumn: string;
  actionColumn: string;
  locationColumn: string;
  noteColumn: string;
  /** 汇总里的操作：目标位置原先没有东西是新装，有就是覆盖 */
  actions: { fresh: string; overwrite: string };
  /** 汇总里覆盖项的备注 */
  reinstallNote: (version: string) => string;
  unmanagedNote: string;
  installSummary: (count: number) => string;
  replaceNotice: string;
  confirmInstall: string;
  startInstall: string;
  revise: string;
  cancel: string;
  /** 选了开始安装之后，对不是本工具装的目录逐个另问；location 是给用户看的路径 */
  confirmOverwrite: (location: string) => string;
  yes: string;
  no: string;
  /** 是否题上输入了 y、n 之外的东西 */
  answerYesOrNo: string;
  installing: string;
  results: string;
  downloading: string;
  installed: string;
  failed: string;
  skippedResult: string;
  overwriteDeclined: string;
  installProblem: (problem: SkillInstallProblem) => string;
  totalKey: string;
  totals: (totals: { succeeded: number; failed: number; skipped: number }) => string[];
  groups: Record<'skill' | 'app', { label: string; about: string }>;
  keys: Record<string, string>;
  /** 交互库传进来的是英文单词的按键，任何终端里都换成这里的文字 */
  keyWords: Record<string, string>;
  /** 没有 Unicode 的终端里，按键提示里的按键改用文字 */
  keyNames: Record<string, string>;
  errorPrefix: string;
  causeKey: string;
  nextKey: string;
  failure: (failure: Failure, platform: NodeJS.Platform) => FailureText;
  help: {
    usage: string;
    usageLine: string;
    options: string;
    optionRows: [string, string][];
    environment: string;
    environmentRows: [string, string][];
  };
}

const zh: Messages = {
  tagline: '策展式 AI 工具链安装器',
  loading: { catalog: '正在读取目录', skillFiles: '正在查询 skill 的文件列表' },
  agentKey: 'AI Agent',
  notDetected: '未检测到',
  noHosts: (hosts, appsBrowsable) =>
    `没有检测到 ${hosts.join(' 或 ')}，暂时装不了组件${appsBrowsable ? '；应用项目仍可浏览' : ''}`,
  hostsSkipped: (missing, present) => `没有检测到 ${missing}，已跳过；组件只装进 ${present}`,
  catalogKey: '目录',
  noticeKey: '注意',
  counts: ({ skills, apps }) => [...(skills > 0 ? [`${skills} skill`] : []), ...(apps > 0 ? [`${apps} 应用项目`] : [])],
  noEntries: '没有可用的条目',
  skipped: (count) => `目录中有 ${count} 个条目格式有误，已跳过`,
  pickGroup: '选择分组',
  groupColumn: '分组',
  countColumn: '数量',
  aboutColumn: '说明',
  exit: '退出',
  back: '返回',
  needsHost: '需要 AI Agent',
  unavailable: '这一项现在选不了',
  nameColumn: '名称',
  skillStatus: { none: '未装', installed: '已装', unmanaged: '非本工具安装' },
  pickHosts: '装进哪些 AI Agent',
  pickSkills: '选择要安装的 skill',
  pickApp: '选择应用项目',
  linkKey: '链接',
  linkOpened: '已在默认浏览器打开；打不开时请复制上面的链接',
  linkNotOpened: '没能打开浏览器，请复制上面的链接自行打开',
  listSeparator: '、',
  entryColumn: '条目',
  agentColumn: 'AI Agent',
  actionColumn: '操作',
  locationColumn: '位置',
  noteColumn: '备注',
  actions: { fresh: '新装', overwrite: '覆盖' },
  reinstallNote: (version) => `重装 ${version}`,
  unmanagedNote: '非本工具安装，另行确认',
  installSummary: (count) => `将安装 ${count} 个 skill`,
  replaceNotice: '覆盖即整目录替换，目录内的本地改动会丢失',
  confirmInstall: '开始安装吗',
  startInstall: '开始安装',
  revise: '返回修改',
  cancel: '取消',
  confirmOverwrite: (location) => `${location} 不是本工具装的，要覆盖它吗？`,
  yes: '是',
  no: '否',
  answerYesOrNo: '请输入 y 或 n',
  installing: '正在安装',
  results: '结果',
  downloading: '正在下载',
  installed: '已安装',
  failed: '失败',
  skippedResult: '跳过',
  overwriteDeclined: '未同意覆盖，保持原样',
  installProblem(problem) {
    switch (problem.kind) {
      case 'no-skill-md':
        return '来源里没有 SKILL.md，目标目录未改动';
      case 'unsafe-path':
        return '文件列表里有越界的路径，目标目录未改动';
      case 'download':
        return `下载中断（${problem.detail}），目标目录未改动`;
      case 'write':
        return `写入失败（${problem.detail}），目标目录未改动`;
    }
  },
  totalKey: '合计',
  totals: ({ succeeded, failed, skipped }) => [`${succeeded} 成功`, `${failed} 失败`, `${skipped} 跳过`],
  groups: {
    skill: { label: 'Skill', about: '装进 AI Agent 的能力包' },
    app: { label: '应用项目', about: '需要自行部署，这里只给链接' },
  },
  keys: { navigate: '移动', select: '选择', all: '全选', invert: '反选', submit: '确认（不选则返回）' },
  keyWords: { space: '空格' },
  keyNames: { '↑↓': '上下键', '⏎': '回车' },
  errorPrefix: '出错：',
  causeKey: '原因',
  nextKey: '下一步',
  failure(failure, platform) {
    switch (failure.kind) {
      case 'no-terminal':
        return {
          title: '没有交互式终端',
          cause: 'oxy-tools 靠菜单操作，而当前的输入或输出不是终端（可能在脚本、管道或 CI 里）',
          next: ['在终端里直接运行：npx oxy-tools'],
        };
      case 'unknown-argument':
        return {
          title: '无法识别的参数',
          cause: `不认识参数 ${failure.argument}`,
          next: ['查看可用的参数：npx oxy-tools --help'],
        };
      case 'bad-language':
        return {
          title: '无法识别的参数',
          cause:
            failure.value === undefined
              ? '--lang 后面要跟 zh 或 en'
              : `--lang 只接受 zh 或 en，收到的是 ${failure.value}`,
          next: ['查看可用的参数：npx oxy-tools --help'],
        };
      case 'catalog-unreadable':
        return {
          title: '无法读取目录',
          cause: `读不到 ${failure.file}（${failure.detail}）`,
          location: failure.where,
          next: failure.local
            ? ['确认环境变量 OXY_TOOLS_CATALOG 指向的目录里有 index.json 和 catalog.json']
            : ['检查网络连接后重新运行', '网络正常的话，可能是目录数据暂时取不到，稍后再试'],
        };
      case 'catalog-malformed':
        return {
          title: '目录格式有误',
          location: failure.where,
          cause: `${failure.file} ${
            failure.problem === 'not-array'
              ? `的 ${failure.field} 不是数组`
              : {
                  'not-json': '不是合法的 JSON',
                  'not-object': '的顶层不是对象',
                  'no-version': '缺少整数的格式版本号 version',
                }[failure.problem]
          }`,
          next: [failure.local ? '修正这个文件后重新运行' : '这是目录数据的问题，稍后重新运行'],
        };
      case 'catalog-too-new':
        return {
          title: '目录格式版本不受支持',
          cause: `${failure.file} 的格式版本是 ${failure.found}，这一版安装器只认识到 ${failure.supported}`,
          next: ['升级安装器后重新运行：npx oxy-tools@latest'],
        };
      case 'rate-limited':
        return {
          title: 'GitHub 限流',
          cause: `${failure.authenticated ? 'GitHub 的查询限额已用完' : '未登录的查询每小时限 60 次'}${
            failure.minutes === undefined ? '' : `，约 ${failure.minutes} 分钟后恢复`
          }`,
          next: [
            '稍后再试',
            ...(failure.authenticated
              ? []
              : [
                  platform === 'win32'
                    ? '或把环境变量 GITHUB_TOKEN 设为你的访问令牌后重新运行'
                    : '或设置访问令牌后重新运行：export GITHUB_TOKEN=<你的令牌>',
                ]),
          ],
        };
      case 'skill-files-unlisted':
        return {
          title: '无法查询 skill 的文件列表',
          location: failure.where,
          ...(failure.problem === 'unreachable'
            ? {
                cause: `向 GitHub 查询失败（${failure.detail}）`,
                next: failure.badToken
                  ? ['环境变量 GITHUB_TOKEN 里的访问令牌无效或已过期，更正或取消设置后重新运行']
                  : ['检查网络连接后重新运行', '网络正常的话，可能是 GitHub 暂时不可用，稍后再试'],
              }
            : failure.problem === 'truncated'
              ? { cause: 'GitHub 给出的文件列表不完整，装上的 skill 可能残缺', next: ['升级安装器后重新运行：npx oxy-tools@latest'] }
              : { cause: 'GitHub 的答复不是预期的格式', next: ['稍后再试', '仍然出错的话，升级安装器后重新运行：npx oxy-tools@latest'] }),
        };
      case 'unexpected':
        return {
          title: '意外错误',
          cause: failure.detail,
          next: ['重新运行一次', '仍然出错的话，升级到最新版再试：npx oxy-tools@latest'],
        };
    }
  },
  help: {
    usage: '用法',
    usageLine: 'npx oxy-tools [选项]',
    options: '选项',
    optionRows: [
      ['--lang <zh|en>', '界面语言，缺省按系统语言环境判断'],
      ['-h, --help', '显示这份帮助'],
      ['-v, --version', '显示版本号'],
    ],
    environment: '环境变量',
    environmentRows: [
      ['OXY_TOOLS_CATALOG', '改从这个本地目录读取目录数据（其中要有 index.json 和 catalog.json）'],
      ['GITHUB_TOKEN', '查询 skill 文件时带上的 GitHub 访问令牌，被限流时设置'],
      ['NO_COLOR', '不输出颜色'],
    ],
  },
};

const en: Messages = {
  tagline: 'Curated AI toolchain installer',
  loading: { catalog: 'Loading catalog', skillFiles: 'Looking up skill files' },
  agentKey: 'AI Agent',
  notDetected: 'not detected',
  noHosts: (hosts, appsBrowsable) =>
    `${hosts.join(' and ')} not detected; components cannot be installed${appsBrowsable ? '; apps can still be browsed' : ''}`,
  hostsSkipped: (missing, present) => `${missing} not detected, skipped; components go into ${present} only`,
  catalogKey: 'Catalog',
  noticeKey: 'Notice',
  counts: ({ skills, apps }) => [
    ...(skills > 0 ? [`${skills} ${skills === 1 ? 'skill' : 'skills'}`] : []),
    ...(apps > 0 ? [`${apps} ${apps === 1 ? 'app' : 'apps'}`] : []),
  ],
  noEntries: 'no usable entries',
  skipped: (count) => `${count} malformed catalog ${count === 1 ? 'entry was' : 'entries were'} skipped`,
  pickGroup: 'Pick a group',
  groupColumn: 'Group',
  countColumn: 'Items',
  aboutColumn: 'About',
  exit: 'Exit',
  back: 'Back',
  needsHost: 'needs an AI Agent',
  unavailable: 'This item cannot be selected right now',
  nameColumn: 'Name',
  skillStatus: { none: 'none', installed: 'installed', unmanaged: 'unmanaged' },
  pickHosts: 'Install into which AI Agents',
  pickSkills: 'Pick skills to install',
  pickApp: 'Pick an app',
  linkKey: 'Link',
  linkOpened: 'Opened in your default browser; if nothing opened, copy the link above',
  linkNotOpened: 'Could not open a browser; copy the link above and open it yourself',
  listSeparator: ', ',
  entryColumn: 'Entry',
  agentColumn: 'AI Agent',
  actionColumn: 'Action',
  locationColumn: 'Location',
  noteColumn: 'Note',
  actions: { fresh: 'new', overwrite: 'overwrite' },
  reinstallNote: (version) => `reinstall ${version}`,
  unmanagedNote: 'unmanaged; asked separately',
  installSummary: (count) => `Install ${count} ${count === 1 ? 'skill' : 'skills'}`,
  replaceNotice: 'Overwriting replaces the whole directory; local changes are lost',
  confirmInstall: 'Start installing?',
  startInstall: 'Install',
  revise: 'Go back and change',
  cancel: 'Cancel',
  confirmOverwrite: (location) => `${location} is unmanaged. Overwrite it?`,
  yes: 'yes',
  no: 'no',
  answerYesOrNo: 'Please answer y or n',
  installing: 'Installing',
  results: 'Results',
  downloading: 'downloading',
  installed: 'installed',
  failed: 'failed',
  skippedResult: 'skipped',
  overwriteDeclined: 'overwrite declined; left as it was',
  installProblem(problem) {
    switch (problem.kind) {
      case 'no-skill-md':
        return 'the source has no SKILL.md; the target directory is unchanged';
      case 'unsafe-path':
        return 'the file list has a path outside the skill directory; the target directory is unchanged';
      case 'download':
        return `download interrupted (${problem.detail}); the target directory is unchanged`;
      case 'write':
        return `could not write (${problem.detail}); the target directory is unchanged`;
    }
  },
  totalKey: 'Total',
  totals: ({ succeeded, failed, skipped }) => [`${succeeded} succeeded`, `${failed} failed`, `${skipped} skipped`],
  groups: {
    skill: { label: 'Skill', about: 'Capability packs for your AI Agent' },
    app: { label: 'Apps', about: 'Deploy them yourself; only links here' },
  },
  keys: { navigate: 'move', select: 'select', all: 'all', invert: 'invert', submit: 'confirm (none = back)' },
  keyWords: { space: 'space' },
  keyNames: { '↑↓': 'up/down', '⏎': 'enter' },
  errorPrefix: 'Error: ',
  causeKey: 'Cause',
  nextKey: 'Next',
  failure(failure, platform) {
    switch (failure.kind) {
      case 'no-terminal':
        return {
          title: 'No interactive terminal',
          cause: 'oxy-tools is menu-driven, but its input or output is not a terminal (a script, a pipe or CI, perhaps)',
          next: ['Run it directly in a terminal: npx oxy-tools'],
        };
      case 'unknown-argument':
        return {
          title: 'Unrecognized argument',
          cause: `Unknown argument ${failure.argument}`,
          next: ['See the available arguments: npx oxy-tools --help'],
        };
      case 'bad-language':
        return {
          title: 'Unrecognized argument',
          cause:
            failure.value === undefined
              ? '--lang must be followed by zh or en'
              : `--lang accepts zh or en, but got ${failure.value}`,
          next: ['See the available arguments: npx oxy-tools --help'],
        };
      case 'catalog-unreadable':
        return {
          title: 'Cannot read the catalog',
          cause: `Could not read ${failure.file} (${failure.detail})`,
          location: failure.where,
          next: failure.local
            ? ['Make sure the directory OXY_TOOLS_CATALOG points to holds index.json and catalog.json']
            : ['Check your network connection and run it again', 'If the network is fine, the catalog may be temporarily unavailable; try again later'],
        };
      case 'catalog-malformed':
        return {
          title: 'Malformed catalog',
          location: failure.where,
          cause: `${failure.file} ${
            failure.problem === 'not-array'
              ? `has a ${failure.field} that is not an array`
              : {
                  'not-json': 'is not valid JSON',
                  'not-object': 'is not an object at the top level',
                  'no-version': 'lacks an integer format version (version)',
                }[failure.problem]
          }`,
          next: [failure.local ? 'Fix the file and run it again' : 'The catalog data itself is broken; run it again later'],
        };
      case 'catalog-too-new':
        return {
          title: 'Unsupported catalog format',
          cause: `${failure.file} is in format version ${failure.found}; this installer only understands up to ${failure.supported}`,
          next: ['Upgrade the installer and run it again: npx oxy-tools@latest'],
        };
      case 'rate-limited':
        return {
          title: 'Rate limited by GitHub',
          cause: `${
            failure.authenticated ? 'The GitHub query quota is used up' : 'Unauthenticated queries are limited to 60 per hour'
          }${failure.minutes === undefined ? '' : `; it resets in about ${failure.minutes} min`}`,
          next: [
            'Try again later',
            ...(failure.authenticated
              ? []
              : [
                  platform === 'win32'
                    ? 'or set the GITHUB_TOKEN environment variable to your access token and run it again'
                    : 'or set an access token and run it again: export GITHUB_TOKEN=<your token>',
                ]),
          ],
        };
      case 'skill-files-unlisted':
        return {
          title: 'Cannot look up skill files',
          location: failure.where,
          ...(failure.problem === 'unreachable'
            ? {
                cause: `The query to GitHub failed (${failure.detail})`,
                next: failure.badToken
                  ? ['The access token in GITHUB_TOKEN is invalid or expired; fix or unset it and run it again']
                  : ['Check your network connection and run it again', 'If the network is fine, GitHub may be temporarily unavailable; try again later'],
              }
            : failure.problem === 'truncated'
              ? {
                  cause: 'GitHub returned an incomplete file list, so an installed skill could be missing files',
                  next: ['Upgrade the installer and run it again: npx oxy-tools@latest'],
                }
              : {
                  cause: 'GitHub answered in an unexpected format',
                  next: ['Try again later', 'If it keeps failing, upgrade the installer and run it again: npx oxy-tools@latest'],
                }),
        };
      case 'unexpected':
        return {
          title: 'Unexpected error',
          cause: failure.detail,
          next: ['Run it again', 'If it keeps failing, upgrade to the latest version: npx oxy-tools@latest'],
        };
    }
  },
  help: {
    usage: 'Usage',
    usageLine: 'npx oxy-tools [options]',
    options: 'Options',
    optionRows: [
      ['--lang <zh|en>', 'Interface language; defaults to the system locale'],
      ['-h, --help', 'Show this help'],
      ['-v, --version', 'Show the version number'],
    ],
    environment: 'Environment',
    environmentRows: [
      ['OXY_TOOLS_CATALOG', 'Read the catalog from this local directory instead (it must hold index.json and catalog.json)'],
      ['GITHUB_TOKEN', 'GitHub access token sent when looking up skill files; set it when rate limited'],
      ['NO_COLOR', 'Disable colors'],
    ],
  },
};

export const MESSAGES: Record<Lang, Messages> = { zh, en };
