// 页面自己的文字：只有版式上固定的那些——栏名、按钮、空状态的话、还没连上时的那一句、
// 几种结束画面的标题和说明（没有画面状态时也得说得出来），和终端界面里没有的那几句（汇总里逐项决定覆盖的、
// 安装中的提醒）。状态的词、原因、标记、数量、提醒、汇总与结果里每一行的话、结果里的下一步都随画面状态从安装器来
import type { ViewState } from '../src/web-protocol.ts';

export type Lang = ViewState['lang'];

// 让用户回终端重新运行的那条命令
const COMMAND = <code>npx oxy-tools</code>;

export const TEXT = {
  zh: {
    connecting: '正在连接安装器…',
    purposes: '用途',
    machine: '本机',
    catalog: '目录',
    notice: '注意',
    items: (count: number) => `${count} 项`,
    installIntoOnly: (host: string) => `装进 ${host}`,
    atLeastOne: '至少留一个',
    selected: '已选',
    nowUnavailable: (count: number) => `其中 ${count} 项这次不会装`,
    nothingSelected: '还没有选任何条目',
    remove: (name: string) => `去掉 ${name}`,
    toSummary: '去汇总',
    finish: '完成',
    continuePicking: '继续挑选',
    summaryLead: '开始之前安装器会再查一遍这台机器上的状态；状态变了就先不装，给你看新的汇总。',
    renewed: '这一份和刚才确认的不一样了，所以没有开始安装。请看过这一份再确认。',
    overwriteIt: '覆盖它',
    overwriteOff: '没勾：这一项跳过，保持原样',
    progress: (settled: number, total: number) => `${settled} / ${total}`,
    keepTerminal: '装完之前请不要关掉终端。',
    finished: { title: '已完成', body: <>安装器已退出，可以关掉这一页了。</> },
    exited: { title: '安装器已退出', body: <>这一页已经失效，可以关掉了。要继续的话，在终端里重新运行 {COMMAND}。</> },
    denied: { title: '口令不对', body: <>这个网址里的口令不对。请回到终端，用那里写着的网址重新打开。</> },
  },
  en: {
    connecting: 'Connecting to the installer…',
    purposes: 'Purposes',
    machine: 'This machine',
    catalog: 'Catalog',
    notice: 'Notice',
    items: (count: number) => `${count} ${count === 1 ? 'item' : 'items'}`,
    installIntoOnly: (host: string) => `Installs into ${host}`,
    atLeastOne: 'Keep at least one',
    selected: 'Selected',
    nowUnavailable: (count: number) => `${count} will not be installed this time`,
    nothingSelected: 'Nothing selected yet',
    remove: (name: string) => `Remove ${name}`,
    toSummary: 'Review',
    finish: 'Done',
    continuePicking: 'Pick more',
    summaryLead: 'Before it starts, the installer checks this machine again; if anything has changed it installs nothing and shows you a new summary.',
    renewed: 'This differs from the summary you confirmed, so nothing was installed. Review this one and confirm again.',
    overwriteIt: 'Overwrite it',
    overwriteOff: 'Unchecked: this item is skipped and left as it is',
    progress: (settled: number, total: number) => `${settled} / ${total}`,
    keepTerminal: 'Keep your terminal open until this finishes.',
    finished: { title: 'All done', body: <>The installer has quit. You can close this page.</> },
    exited: { title: 'The installer has quit', body: <>This page no longer works and can be closed. To continue, run {COMMAND} again in your terminal.</> },
    denied: { title: 'Wrong token', body: <>The token in this address is wrong. Go back to your terminal and open the address shown there.</> },
  },
};
