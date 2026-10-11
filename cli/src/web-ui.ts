// 网页界面这一边的流程：起本机的网页、交给浏览器打开、等到用户点「完成」。
// 画面状态在这里，页面发来的意图在这里变成状态；页面只是它的一个显示。
import { randomBytes } from 'node:crypto';
import type { Host } from './hosts.ts';
import type { LinkOpener } from './installer.ts';
import { MESSAGES, type Lang, type WebUnavailable } from './messages.ts';
import { Interrupted } from './run-plan.ts';
import type { Ui } from './ui.ts';
import type { Intent, ViewState } from './web-protocol.ts';
import { startWebServer, type WebServer } from './web-server.ts';

export interface WebUiOptions {
  /** 页面起始的语言：系统语言，或 --lang 给的 */
  lang: Lang;
  version: string;
  /** 安装器认识的全部宿主，检测到没有都在里面 */
  hosts: readonly Host[];
  /** 目录里各类条目的数量，和本机信息里数的是同一份 */
  counts: { skills: number; mcps: number; tools: number; apps: number };
  /** 目录里因为格式有误被跳过的条目数 */
  skipped: number;
  webDir: string;
  ui: Ui;
  openLink: LinkOpener;
  interrupt: AbortSignal;
}

/** finished 是用户在页面上点了「完成」；unavailable 是进来之后才知道网页界面用不了，调用方接着走终端界面 */
export type WebUiOutcome = 'finished' | { unavailable: WebUnavailable };

/** 被 Ctrl+C 打断时抛 Interrupted，抛之前已经把本机的网页关掉。 */
export async function runWebUi(options: WebUiOptions): Promise<WebUiOutcome> {
  const { interrupt } = options;
  // 口令 24 个随机字节，写出来 32 个字符：整条网址在终端上写得下一行
  const token = randomBytes(24).toString('base64url');
  let state = openingState(options);
  let finish = (): void => {};
  const finished = new Promise<void>((resolve) => (finish = resolve));

  let server: WebServer;
  try {
    server = await startWebServer({
      webDir: options.webDir,
      token,
      state: () => state,
      intent: (raw) => {
        // 现在只有「完成」这一种意图
        if (!parseIntent(raw)) return false;
        state = { ...state, stage: 'finished' };
        server.push(state);
        finish();
        return true;
      },
    });
  } catch {
    return { unavailable: 'server' };
  }

  if (interrupt.aborted) {
    server.closeNow();
    throw new Interrupted();
  }
  let interrupted = (): void => {};
  const interruption = new Promise<never>((_, reject) => {
    // 这里的收尾只能是同步的：信号触发之后进程随即退出
    interrupted = (): void => {
      server.closeNow();
      reject(new Interrupted());
    };
  });
  interrupt.addEventListener('abort', interrupted, { once: true });

  try {
    const url = `http://127.0.0.1:${server.port}/?token=${token}`;
    const opened = await Promise.race([(async () => options.openLink(url))().then(() => true, () => false), interruption]);
    if (!opened) {
      await server.close();
      return { unavailable: 'browser' };
    }
    options.ui.webOpened(url);
    await Promise.race([finished, interruption]);
    await server.close();
    return 'finished';
  } finally {
    interrupt.removeEventListener('abort', interrupted);
  }
}

function openingState({ lang, version, hosts, counts, skipped }: WebUiOptions): ViewState {
  const t = MESSAGES[lang];
  const catalog = t.counts(counts);
  return {
    lang,
    stage: 'open',
    version,
    machine: {
      hosts: hosts.map((host) => ({ name: host.name, detected: host.detected, ...(host.detected ? {} : { status: t.notDetected }) })),
      catalog: catalog.length > 0 ? catalog : [t.noEntries],
      ...(skipped > 0 ? { skipped: t.skipped(skipped) } : {}),
    },
  };
}

// 页面发来的东西不可信：只认得出形状对的意图
function parseIntent(raw: unknown): Intent | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { type } = raw as { type?: unknown };
  return type === 'finish' ? { type } : undefined;
}
