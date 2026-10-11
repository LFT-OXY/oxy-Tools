// 网页界面这一边的流程：起本机的网页、交给浏览器打开、等到用户点「完成」。
// 画面状态在这里，页面发来的意图在这里变成状态；页面只是它的一个显示。
import { randomBytes } from 'node:crypto';
import { listingStatus, type Machine, type Unavailable } from './availability.ts';
import type { Catalog, Skill } from './catalog.ts';
import type { Host, Scope } from './hosts.ts';
import type { LinkOpener } from './installer.ts';
import { LANGUAGE_QUESTION, LANGUAGES, MESSAGES, type Lang, type WebUnavailable } from './messages.ts';
import { byName } from './listing.ts';
import { homeRelative, planInstall, type Plan } from './plan.ts';
import { Interrupted, runPlan, unexpected, type Runtime } from './run-plan.ts';
import { unavailableReason } from './status-text.ts';
import type { Ui } from './ui.ts';
import { asksOverwrite, decided, runView, settleBatch, summaryId, summaryView, trackBatch, type Batch } from './web-install.ts';
import type { Intent, ViewState } from './web-protocol.ts';
import { startWebServer, type WebServer } from './web-server.ts';
import { listingView, menuOf } from './web-view.ts';

export interface WebUiOptions {
  /** 页面起始的语言：系统语言，或 --lang 给的 */
  lang: Lang;
  version: string;
  catalog: Catalog;
  /** 本机的事实和执行要的东西：交给共用的「算计划」「执行」的就是它 */
  runtime: Runtime;
  /** 目录里各类条目的数量，和本机信息里数的是同一份 */
  counts: { skills: number; mcps: number; tools: number; apps: number };
  webDir: string;
  ui: Ui;
  openLink: LinkOpener;
}

/** finished 是用户在页面上点了「完成」；unavailable 是进来之后才知道网页界面用不了，调用方接着走终端界面 */
export type WebUiOutcome = 'finished' | { unavailable: WebUnavailable };

/** 被 Ctrl+C 打断时抛 Interrupted，抛之前已经把本机的网页关掉。 */
export async function runWebUi(options: WebUiOptions): Promise<WebUiOutcome> {
  const { catalog, runtime } = options;
  const { interrupt } = runtime;
  // 口令 24 个随机字节，写出来 32 个字符：整条网址在终端上写得下一行
  const token = randomBytes(24).toString('base64url');
  // 网页界面的状态都在这里；画面状态每次从它现算，条目的状态因此总是现探测的
  const session: Session = {
    lang: options.lang,
    stage: 'open',
    introSeen: false,
    list: menuOf(catalog, options.lang)[0]?.id,
    // 起初和终端界面两个提问光标起始的答案一样：检测到的全部、全局
    hosts: new Set(runtime.hosts.filter((host) => host.detected).map((host) => host.id)),
    scope: 'global',
    picked: [],
    step: 'browse',
    agreed: new Set(),
    renewed: false,
  };
  let finish = (): void => {};
  const finished = new Promise<void>((resolve) => (finish = resolve));

  let server: WebServer;
  const push = (): void => server.push(viewOf(options, session));
  // 照计划去装，进度每变一次推一次画面状态。它不往外抛：意料之外的错变成这一批的出错说明
  const install = async (plan: Plan): Promise<void> => {
    const { batch, progress } = trackBatch(plan, push);
    session.batch = batch;
    let failure: unknown;
    try {
      await runPlan(runtime, plan, progress);
    } catch (error) {
      // 被 Ctrl+C 打断：本机的网页已经当场关掉了，进程随即退出
      if (interrupt.aborted) return;
      failure = error;
    }
    settleBatch(batch, failure === undefined ? undefined : unexpected(failure));
    session.step = 'results';
    push();
  };
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
            // 正在装的这一批要装完
            if (session.step === 'installing') return false;
            session.stage = 'finished';
            break;
          case 'open':
            // 只认左栏里有的那几行
            if (!menuOf(catalog, session.lang).some((row) => row.id === intent.list)) return false;
            session.list = intent.list;
            break;
          case 'intro-seen':
            session.introSeen = true;
            break;
          case 'lang':
            // 只换说法：正在看的列表照旧（id 不随语言变）；终端上的呈现层不动
            session.lang = intent.lang;
            break;
          case 'host': {
            if (session.step !== 'browse' || !runtime.hosts.some((host) => host.detected && host.id === intent.host)) return false;
            // 至少留一个：去掉最后一个不照办
            if (!intent.on && session.hosts.size === 1 && session.hosts.has(intent.host)) return false;
            if (intent.on) session.hosts.add(intent.host);
            else session.hosts.delete(intent.host);
            break;
          }
          case 'scope':
            // 一个宿主都没检测到就没有要装进的地方，也就没有范围可言
            if (session.step !== 'browse' || !runtime.hosts.some((host) => host.detected)) return false;
            session.scope = intent.scope;
            break;
          case 'pick': {
            if (session.step !== 'browse') return false;
            const skill = catalog.skills.find((candidate) => candidate.name === intent.name);
            if (!skill) return false;
            // 不可选的勾不上；去掉总是可以的
            if (intent.on && !pickable(runtime, session, skill)) return false;
            const rest = session.picked.filter((candidate) => candidate !== skill);
            session.picked = intent.on ? [...rest, skill] : rest;
            break;
          }
          case 'review':
            // 已选里一个会装的都没有，和已选为空一样去不了
            if (session.step !== 'browse' || installable(runtime, session).length === 0) return false;
            session.step = 'summary';
            // 每次进汇总，逐项的覆盖都从「不覆盖」起
            session.agreed.clear();
            break;
          case 'overwrite':
            if (session.step !== 'summary' || !asksOverwrite(planOf(runtime, session), intent.item)) return false;
            if (intent.on) session.agreed.add(intent.item);
            else session.agreed.delete(intent.item);
            break;
          case 'install': {
            if (session.step !== 'summary') return false;
            // 展示的和执行的是同一份：现在重算出来的和页面上那一份不是同一个标识就不装，给看新的
            const plan = planOf(runtime, session);
            session.renewed = summaryId(plan) !== intent.summary;
            if (session.renewed) break;
            session.step = 'installing';
            void install(plan);
            break;
          }
          case 'revise':
            if (session.step !== 'summary') return false;
            session.step = 'browse';
            session.renewed = false;
            break;
          case 'continue':
            if (session.step !== 'results') return false;
            session.step = 'browse';
            session.picked = [];
            delete session.batch;
            break;
        }
        push();
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

/**
 * 页面上会变的那几样：页面的语言、开着还是完成了、开场动画播过没有、正在看哪张列表（menu 里的 id，目录是空的时没有）、
 * 要装进哪些宿主（id）、装到全局还是项目、勾上了的条目（目录里的那几个对象，照勾选的先后）、挑选走到哪一步、
 * 汇总里同意覆盖的那几项、上一次确认是不是因为对不上而没装、这一批的进度
 */
interface Session {
  lang: Lang;
  stage: ViewState['stage'];
  introSeen: boolean;
  list: string | undefined;
  hosts: Set<string>;
  scope: Scope;
  picked: Skill[];
  step: 'browse' | 'summary' | 'installing' | 'results';
  agreed: Set<string>;
  renewed: boolean;
  batch?: Batch;
}

// 这一轮要装进的宿主（照本机信息里的先后）和安装范围
function targetOf(machine: Machine, session: Session): { hosts: Host[]; scope: Scope } {
  return { hosts: machine.hosts.filter((host) => host.detected && session.hosts.has(host.id)), scope: session.scope };
}

// 这个 skill 在现在所选的宿主和范围下装不了的原因；可不可选由两套界面共用的那一块定
function unavailableOf(machine: Machine, session: Session, skill: Skill): Unavailable | undefined {
  const { hosts, scope } = targetOf(machine, session);
  return listingStatus(machine, { skills: [skill], thirdParty: [], mcps: [], tools: [] }, hosts, scope).skills[0]?.unavailable;
}

// 这个 skill 现在勾不勾得上
const pickable = (machine: Machine, session: Session, skill: Skill): boolean => unavailableOf(machine, session, skill) === undefined;

// 已选里现在会装的那些：装不了的留在已选里，但不进汇总
const installable = (machine: Machine, session: Session): Skill[] => session.picked.filter((skill) => pickable(machine, session, skill));

// 把勾选算成要装的每一项，状态现探测；要逐项决定的覆盖里没同意的已经标成不装。本仓库的 skill 按名字，和终端界面的先后一样
function planOf(machine: Machine, session: Session): Plan {
  const selection = { ...targetOf(machine, session), skills: byName(installable(machine, session)), thirdParty: [], mcps: [], tools: [], filledKeys: new Map() };
  return decided(planInstall(machine, selection), session.agreed);
}

function viewOf({ version, catalog, runtime: machine, counts }: WebUiOptions, session: Session): ViewState {
  const { lang } = session;
  const t = MESSAGES[lang];
  const perKind = t.counts(counts);
  const skipped = catalog.skipped.length;
  const { hosts, scope } = targetOf(machine, session);
  const listing = session.list === undefined ? undefined : listingView(machine, catalog, session.list, hosts, scope, lang, new Set(session.picked));
  return {
    lang,
    // 和终端界面的语言提问是同一份字
    language: { label: LANGUAGE_QUESTION, options: LANGUAGES.map(({ lang: id, label }) => ({ id, name: label })) },
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
      choices: machine.hosts.filter((host) => host.detected).map((host) => ({ id: host.id, name: host.name, on: session.hosts.has(host.id) })),
      hosts: hosts.map((host) => host.name),
      scopeLabel: t.pickScope,
      scopes: [
        { id: 'global', name: t.scopes.global.name },
        { id: 'project', name: t.scopes.project.name },
      ],
      scope,
      // 目录的写法和终端界面「项目」那一行一样
      project: { note: t.scopes.project.about, dir: homeRelative(machine, machine.projectDir) },
    },
    menu: menuOf(catalog, lang),
    ...(listing ? { listing } : {}),
    selected: session.picked.map((skill) => {
      const unavailable = unavailableOf(machine, session, skill);
      return { kind: 'skill' as const, name: skill.name, type: t.kinds.skill, ...(unavailable ? { unavailable: unavailableReason(t, unavailable) } : {}) };
    }),
    ...(session.step === 'summary' ? { summary: { ...summaryView(t, planOf(machine, session)), ...(session.renewed ? { renewed: true as const } : {}) } } : {}),
    ...(session.batch ? { run: runView(t, machine.platform, session.batch) } : {}),
  };
}

// 页面发来的东西不可信：只认得出形状对的意图。每种意图认得的字段是定死的，多带了别的（命令、路径之类）整个不认
function parseIntent(raw: unknown): Intent | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { type, list, lang, kind, name, on, item, summary, host, scope } = raw as Record<string, unknown>;
  const only = (...fields: string[]): boolean => Object.keys(raw).every((field) => field === 'type' || fields.includes(field));
  if ((type === 'finish' || type === 'intro-seen' || type === 'review' || type === 'revise' || type === 'continue') && only()) return { type };
  if (type === 'open' && typeof list === 'string' && only('list')) return { type, list };
  if (type === 'lang' && (lang === 'zh' || lang === 'en') && only('lang')) return { type, lang };
  if (type === 'host' && typeof host === 'string' && typeof on === 'boolean' && only('host', 'on')) return { type, host, on };
  if (type === 'scope' && (scope === 'global' || scope === 'project') && only('scope')) return { type, scope };
  if (type === 'pick' && kind === 'skill' && typeof name === 'string' && typeof on === 'boolean' && only('kind', 'name', 'on')) return { type, kind, name, on };
  if (type === 'overwrite' && typeof item === 'string' && typeof on === 'boolean' && only('item', 'on')) return { type, item, on };
  if (type === 'install' && typeof summary === 'string' && only('summary')) return { type, summary };
  return undefined;
}
