// 网页界面的页面和安装器共用的类型：页面发来的意图、安装器发去的画面状态。两边对不上在类型检查时就报出来。
// 这个文件不引用别的模块：页面的类型检查不带 Node 的类型。

/** 页面发给安装器的意图。里面只有选项和条目的名字，没有命令、路径或任何会被原样执行的东西 */
export type Intent =
  | { type: 'finish' }
  /** 换一张列表看：list 是画面状态的 menu 里某一行的 id */
  | { type: 'open'; list: string }
  /** 页面开始播开场动画了（或决定不播）：这次运行里不再播 */
  | { type: 'intro-seen' };

/** 安装范围：装到全局，还是装到项目 */
export type Scope = 'global' | 'project';

/** 安装器发给页面的整份画面状态：页面连上时发一次，之后每次变化再发一整份 */
export interface ViewState {
  lang: 'zh' | 'en';
  /** open 是开着；finished 是用户点了「完成」，安装器随后退出 */
  stage: 'open' | 'finished';
  version: string;
  /** 开场动画这次运行里播过没有：刷新、重连、再开一个标签页都不重播 */
  introSeen: boolean;
  /** 本机信息，说法和终端界面是同一份文案 */
  machine: {
    /** status 是没检测到时写在名字后面的词；检测到的没有 */
    hosts: { name: string; detected: boolean; status?: string }[];
    /** 目录里各类条目的数量，每类一段；一个条目都没有时是那一句话 */
    catalog: string[];
    /** 一个宿主都没检测到时的那一句提醒 */
    noHosts?: string;
    /** 目录里有条目因为格式有误被跳过时的那一句 */
    skipped?: string;
  };
  /** 装进哪些宿主、装到哪里，连同这两样在页面上的名字：和终端界面的提问是同一份文案 */
  target: {
    hostsLabel: string;
    /** 要装进的宿主的名字 */
    hosts: string[];
    scopeLabel: string;
    /** 安装范围有哪几种，照显示的先后 */
    scopes: { id: Scope; name: string }[];
    scope: Scope;
  };
  /** 左栏的行：「推荐」（里面有条目时）在最前，然后是有条目的各个用途，照目录里的先后 */
  menu: MenuRow[];
  /** 正在看的那张列表；目录里一个条目都没有时没有 */
  listing?: ListingView;
}

export interface MenuRow {
  /** 交回给安装器的标识，页面不去解读它 */
  id: string;
  name: string;
  count: number;
  /** 这一行是「推荐」 */
  recommended?: true;
}

export interface ListingView {
  /** menu 里的哪一行 */
  id: string;
  /** 组件按类型分开：Skill、第三方 Skill、MCP、工具；没有条目的类型不在里面 */
  sections: SectionView[];
  /** 外部项目另成一处：只有说明和链接，不能勾选 */
  apps?: { title: string; note: string; entries: AppView[] };
}

export interface SectionView {
  kind: 'skill' | 'thirdParty' | 'mcp' | 'tool';
  title: string;
  /** 标题后面的一句说明 */
  note?: string;
  entries: ComponentView[];
}

export interface ComponentView {
  name: string;
  /** 完整的说明，不截断 */
  about: string;
  /** 「推荐」的标记，要标时是那个词；「推荐」那张列表里每一条都是，不标 */
  mark?: string;
  /** 每个要装进的宿主一段，与 target.hosts 一一对应；工具只有一段，没有 host */
  statuses: StatusView[];
  /** 不可选的原因；有它就勾不上 */
  unavailable?: string;
}

/** 状态的含义：就绪、留意、退后（未装这一类）、不上色 */
export type Tone = 'ready' | 'attention' | 'faint' | 'plain';

export interface StatusView {
  host?: string;
  text: string;
  tone: Tone;
  /** 词后面不上色的那一段：版本、装了几个 */
  rest?: string;
}

export interface AppView {
  name: string;
  about: string;
  url: string;
  /** 「推荐」的标记，和组件的一样 */
  mark?: string;
}
