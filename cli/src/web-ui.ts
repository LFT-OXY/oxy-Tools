// 网页界面这一边的流程：起本机的网页、交给浏览器打开、等到用户点「完成」。
// 画面状态在这里，页面发来的意图在这里变成状态；页面只是它的一个显示。
import { randomBytes } from 'node:crypto';
import type { Machine } from './availability.ts';
import type { Catalog } from './catalog.ts';
import type { LinkOpener } from './installer.ts';
import { MESSAGES, type Lang, type WebUnavailable } from './messages.ts';
import { Interrupted } from './run-plan.ts';
import type { Ui } from './ui.ts';
import type { Intent, ViewState } from './web-protocol.ts';
import { startWebServer, type WebServer } from './web-server.ts';
import { listingView, menuOf } from './web-view.ts';

export interface WebUiOptions {
  /** 页面起始的语言：系统语言，或 --lang 给的 */
  lang: Lang;
  version: string;
  catalog: Catalog;
  machine: Machine;
  /** 目录里各类条目的数量，和本机信息里数的是同一份 */
  counts: { skills: number; mcps: number; tools: number; apps: number };
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
  // 网页界面的状态都在这里；画面状态每次从它现算，条目的状态因此总是现探测的
  const session: Session = { stage: 'open', introSeen: false, list: menuOf(options.catalog, options.lang)[0]?.id };
  let finish = (): void => {};
  const finished = new Promise<void>((resolve) => (finish = resolve));

  let server: WebServer;
  try {
    server = await startWebServer({
      webDir: options.webDir,
      token,
      state: () => viewOf(options, session),
      intent: (raw) => {
        const intent = parseIntent(raw);
        if (!intent) return false;
        switch (intent.type) {
          case 'finish':
            session.stage = 'finished';
            break;
          case 'open':
            // 只认左栏里有的那几行
            if (!menuOf(options.catalog, options.lang).some((row) => row.id === intent.list)) return false;
            session.list = intent.list;
            break;
          case 'intro-seen':
            session.introSeen = true;
            break;
        }
        server.push(viewOf(options, session));
        if (session.stage === 'finished') finish();
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

/** 页面上会变的那几样：走到哪一步、开场动画播过没有、正在看哪张列表（menu 里的 id，目录是空的时没有） */
interface Session {
  stage: ViewState['stage'];
  introSeen: boolean;
  list: string | undefined;
}

function viewOf({ lang, version, catalog, machine, counts }: WebUiOptions, session: Session): ViewState {
  const t = MESSAGES[lang];
  const perKind = t.counts(counts);
  const skipped = catalog.skipped.length;
  // 还不能改：装进检测到的全部宿主，装到全局
  const hosts = machine.hosts.filter((host) => host.detected);
  const scope = 'global';
  const listing = session.list === undefined ? undefined : listingView(machine, catalog, session.list, hosts, scope, lang);
  return {
    lang,
    stage: session.stage,
    version,
    introSeen: session.introSeen,
    machine: {
      hosts: machine.hosts.map((host) => ({ name: host.name, detected: host.detected, ...(host.detected ? {} : { status: t.notDetected }) })),
      catalog: perKind.length > 0 ? perKind : [t.noEntries],
      // 和终端界面的本机信息是同一句
      ...(hosts.length === 0 ? { noHosts: t.noHosts(machine.hosts.map((host) => host.name), counts.apps > 0) } : {}),
      ...(skipped > 0 ? { skipped: t.skipped(skipped) } : {}),
    },
    target: {
      hostsLabel: t.pickHosts,
      hosts: hosts.map((host) => host.name),
      scopeLabel: t.pickScope,
      scopes: [
        { id: 'global', name: t.scopes.global.name },
        { id: 'project', name: t.scopes.project.name },
      ],
      scope,
    },
    menu: menuOf(catalog, lang),
    ...(listing ? { listing } : {}),
  };
}

// 页面发来的东西不可信：只认得出形状对的意图
function parseIntent(raw: unknown): Intent | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { type, list } = raw as { type?: unknown; list?: unknown };
  if (type === 'finish' || type === 'intro-seen') return { type };
  if (type === 'open' && typeof list === 'string') return { type, list };
  return undefined;
}
