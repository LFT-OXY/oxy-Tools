// 界面文案，中英各一份。
import type { CatalogFailure } from './catalog.ts';

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
  loading: string;
  catalogKey: string;
  noticeKey: string;
  counts: (counts: { skills: number }) => string;
  skipped: (count: number) => string;
  pickGroup: string;
  groupColumn: string;
  countColumn: string;
  aboutColumn: string;
  exit: string;
  back: string;
  browseSkills: string;
  nameColumn: string;
  versionKey: string;
  groups: { skill: { label: string; about: string } };
  keys: Record<string, string>;
  /** 没有 Unicode 的终端里，按键提示里的按键改用文字 */
  keyNames: Record<string, string>;
  errorPrefix: string;
  causeKey: string;
  nextKey: string;
  failure: (failure: Failure) => FailureText;
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
  loading: '正在读取目录',
  catalogKey: '目录',
  noticeKey: '注意',
  counts: ({ skills }) => (skills > 0 ? `${skills} skill` : '没有可用的条目'),
  skipped: (count) => `目录中有 ${count} 个条目格式有误，已跳过`,
  pickGroup: '选择分组',
  groupColumn: '分组',
  countColumn: '数量',
  aboutColumn: '说明',
  exit: '退出',
  back: '返回',
  browseSkills: '浏览 skill',
  nameColumn: '名称',
  versionKey: '版本',
  groups: { skill: { label: 'Skill', about: '装进 AI Agent 的能力包' } },
  keys: { navigate: '移动', select: '选择' },
  keyNames: { '↑↓': '上下键', '⏎': '回车' },
  errorPrefix: '出错：',
  causeKey: '原因',
  nextKey: '下一步',
  failure(failure) {
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
      ['NO_COLOR', '不输出颜色'],
    ],
  },
};

const en: Messages = {
  tagline: 'Curated AI toolchain installer',
  loading: 'Loading catalog',
  catalogKey: 'Catalog',
  noticeKey: 'Notice',
  counts: ({ skills }) => (skills > 0 ? `${skills} ${skills === 1 ? 'skill' : 'skills'}` : 'no usable entries'),
  skipped: (count) => `${count} malformed catalog ${count === 1 ? 'entry was' : 'entries were'} skipped`,
  pickGroup: 'Pick a group',
  groupColumn: 'Group',
  countColumn: 'Items',
  aboutColumn: 'About',
  exit: 'Exit',
  back: 'Back',
  browseSkills: 'Browse skills',
  nameColumn: 'Name',
  versionKey: 'Version',
  groups: { skill: { label: 'Skill', about: 'Capability packs for your AI Agent' } },
  keys: { navigate: 'move', select: 'select' },
  keyNames: { '↑↓': 'up/down', '⏎': 'enter' },
  errorPrefix: 'Error: ',
  causeKey: 'Cause',
  nextKey: 'Next',
  failure(failure) {
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
      ['NO_COLOR', 'Disable colors'],
    ],
  },
};

export const MESSAGES: Record<Lang, Messages> = { zh, en };
