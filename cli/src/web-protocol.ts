// 网页界面的页面和安装器共用的类型：页面发来的意图、安装器发去的画面状态。两边对不上在类型检查时就报出来。
// 这个文件不引用别的模块：页面的类型检查不带 Node 的类型。

/** 页面发给安装器的意图。里面只有选项和条目的名字，没有命令、路径或任何会被原样执行的东西 */
export type Intent =
  | { type: 'finish' }
  /** 换一张列表看：list 是画面状态的 menu 里某一行的 id */
  | { type: 'open'; list: string }
  /** 页面开始播开场动画了（或决定不播）：这次运行里不再播 */
  | { type: 'intro-seen' }
  /** 换语言：安装器按新的语言重发画面状态，别的都不变；终端上的语言不跟着变 */
  | { type: 'lang'; lang: Lang }
  /** 勾上或去掉一个条目：kind 和 name 是画面状态里那个条目的 */
  | { type: 'pick'; kind: PickableKind; name: string; on: boolean }
  /** 要汇总 */
  | { type: 'review' }
  /** 汇总里要逐项决定的那一项覆盖不覆盖：item 是那一行的 overwrite.id */
  | { type: 'overwrite'; item: string; on: boolean }
  /** 确认安装：summary 是页面上那份汇总的标识 */
  | { type: 'install'; summary: string }
  /** 从汇总返回修改 */
  | { type: 'revise' }
  /** 装完之后继续挑选 */
  | { type: 'continue' };

/** 现在勾得上的类型 */
export type PickableKind = 'skill';

export type Lang = 'zh' | 'en';

/** 安装范围：装到全局，还是装到项目 */
export type Scope = 'global' | 'project';

/** 安装器发给页面的整份画面状态：页面连上时发一次，之后每次变化再发一整份 */
export interface ViewState {
  /** 页面现在的语言：起初是系统语言或 --lang 的，之后是页面上换过的 */
  lang: Lang;
  /** 切换语言的控件：它的名字和各项是终端界面语言提问的那一份文案，不随语言变 */
  language: { label: string; options: { id: Lang; name: string }[] };
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
  /** 已选的条目，照勾选的先后 */
  selected: SelectedView[];
  /** 汇总：要了汇总、还没确认安装时有 */
  summary?: SummaryView;
  /** 这一批的进度与结果：确认安装之后有，点了「继续挑选」之后没有 */
  run?: RunView;
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
  /** 已经勾上了 */
  picked?: true;
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

export interface SelectedView {
  kind: PickableKind;
  name: string;
  /** 类型写出来的词 */
  type: string;
}

/** 汇总：将安装的每一项。里面没有将执行的命令 */
export interface SummaryView {
  /** 这份汇总的标识：确认安装时带回。页面不去解读它 */
  id: string;
  title: string;
  /** 每个要装的条目一段，照执行的先后 */
  entries: SummaryEntryView[];
  /** 提醒，和终端界面的汇总是同一份话 */
  notices: string[];
  /** 两个按钮上的字 */
  revise: string;
  install: string;
  /** 上一次确认没有照办（状态变了，或带的是旧标识）：这是新的一份，要再确认 */
  renewed?: true;
}

export interface SummaryEntryView {
  name: string;
  /** 类型写出来的词 */
  type: string;
  /** 要装的版本 */
  version: string;
  /** 每个宿主一行 */
  rows: SummaryRowView[];
}

export interface SummaryRowView {
  host: string;
  /** 操作：新装、覆盖 */
  action: string;
  /** 这一行会覆盖已有的东西 */
  overwrites?: true;
  /** 给用户看的位置 */
  location: string;
  note?: string;
  /** 要逐项决定覆盖不覆盖的才有：id 放进 overwrite 意图，缺省没同意 */
  overwrite?: { id: string; agreed: boolean };
}

/** 这一批的进度与结果 */
export interface RunView {
  /** 装着的时候是「正在安装」，装完是「结果」 */
  title: string;
  done: boolean;
  /** 正在向 GitHub 查询时的那一句 */
  loading?: string;
  /** 这一批里出的错：受它影响的条目不在 rows 里 */
  failure?: FailureView;
  /** 每一项一行，照执行的先后 */
  rows: RunRowView[];
  /** 合计，装完才有 */
  totals?: { label: string; succeeded: TotalView; failed: TotalView; skipped: TotalView };
  /** 装完之后有没装上的才有：「下一步」和它下面的话 */
  next?: { label: string; lines: string[] };
}

export interface RunRowView {
  name: string;
  host: string;
  state: 'waiting' | 'running' | 'succeeded' | 'failed' | 'skipped';
  /** 这一行的词：等待、正在下载、已安装、失败、跳过 */
  text: string;
  /** 词后面的话：版本、原因 */
  rest?: string;
}

export interface TotalView {
  count: number;
  word: string;
}

/** 出错说明，和终端界面是同一份话、同一个结构 */
export interface FailureView {
  title: string;
  cause: { label: string; text: string };
  /** 出问题的网址或路径 */
  location?: string;
  next: { label: string; lines: string[] };
}
