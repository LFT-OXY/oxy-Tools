// 页面自己的文字：只有版式上固定的那些——栏名、按钮、空状态的话、还没连上时的那一句、
// 几种结束画面的标题和说明（没有画面状态时也得说得出来）。状态的词、原因、标记、数量、提醒都随画面状态从安装器来
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
    selected: '已选',
    nothingSelected: '还没有选任何条目',
    toSummary: '去汇总',
    finish: '完成',
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
    selected: 'Selected',
    nothingSelected: 'Nothing selected yet',
    toSummary: 'Review',
    finish: 'Done',
    finished: { title: 'All done', body: <>The installer has quit. You can close this page.</> },
    exited: { title: 'The installer has quit', body: <>This page no longer works and can be closed. To continue, run {COMMAND} again in your terminal.</> },
    denied: { title: 'Wrong token', body: <>The token in this address is wrong. Go back to your terminal and open the address shown there.</> },
  },
};
