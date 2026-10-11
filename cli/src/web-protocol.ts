// 网页界面的页面和安装器共用的类型：页面发来的意图、安装器发去的画面状态。两边对不上在类型检查时就报出来。
// 这个文件不引用别的模块：页面的类型检查不带 Node 的类型。

/** 页面发给安装器的意图。里面只有选项和条目的名字，没有命令、路径或任何会被原样执行的东西 */
export type Intent = { type: 'finish' };

/** 安装器发给页面的整份画面状态：页面连上时发一次，之后每次变化再发一整份 */
export interface ViewState {
  lang: 'zh' | 'en';
  /** open 是开着；finished 是用户点了「完成」，安装器随后退出 */
  stage: 'open' | 'finished';
  version: string;
  /** 本机信息，说法和终端界面是同一份文案 */
  machine: {
    /** status 是没检测到时写在名字后面的词；检测到的没有 */
    hosts: { name: string; detected: boolean; status?: string }[];
    /** 目录里各类条目的数量，每类一段；一个条目都没有时是那一句话 */
    catalog: string[];
    /** 目录里有条目因为格式有误被跳过时的那一句 */
    skipped?: string;
  };
}
