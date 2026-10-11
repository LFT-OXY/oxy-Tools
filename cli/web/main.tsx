// 网页界面的页面：把安装器发来的画面状态画出来，把操作变成意图。状态都在安装器那边，这里什么都不存。
// 工单 03 的骨架：本机信息和「完成」，样子从简；照设计规范画是工单 04。
import { render, type ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { Intent, ViewState } from '../src/web-protocol.ts';

type Lang = ViewState['lang'];
/** connecting 是还没收到画面状态；denied 是口令不对；exited 是连接断了、重连不上 */
type Screen = { kind: 'connecting' } | { kind: 'live'; state: ViewState } | { kind: 'denied' } | { kind: 'exited' };

// 让用户回终端重新运行的那条命令
const COMMAND = <code>npx oxy-tools</code>;
// 页面自己的文字只有版式上固定的这些：栏名、按钮和它旁边的那一句、还没连上时的那一句、几种结束画面的标题和说明
// （没有画面状态时也得说得出来）。状态的词、数量、提醒都随画面状态从安装器来
const TEXT = {
  zh: {
    connecting: '正在连接安装器…',
    machine: '本机',
    agents: 'AI Agent',
    catalog: '目录',
    notice: '注意',
    finish: '完成',
    finishHint: '点「完成」后安装器退出，终端回到提示符。',
    finished: { title: '已完成', body: <>安装器已退出，可以关掉这一页了。</> },
    exited: { title: '安装器已退出', body: <>这一页已经失效，可以关掉了。要继续的话，在终端里重新运行 {COMMAND}。</> },
    denied: { title: '口令不对', body: <>这个网址里的口令不对。请回到终端，用那里写着的网址重新打开。</> },
  },
  en: {
    connecting: 'Connecting to the installer…',
    machine: 'This machine',
    agents: 'AI Agent',
    catalog: 'Catalog',
    notice: 'Notice',
    finish: 'Done',
    finishHint: 'Done quits the installer and hands your terminal back.',
    finished: { title: 'All done', body: <>The installer has quit. You can close this page.</> },
    exited: { title: 'The installer has quit', body: <>This page no longer works and can be closed. To continue, run {COMMAND} again in your terminal.</> },
    denied: { title: 'Wrong token', body: <>The token in this address is wrong. Go back to your terminal and open the address shown there.</> },
  },
};

// 口令在交给浏览器的网址里；它只放进请求头，不进任何别的网址
const token = new URLSearchParams(location.search).get('token') ?? '';
const withToken = { 'X-OXY-Token': token };
// 长连接断了之后再连这么多次、每次隔这么久，都连不上才当作安装器已退出
const RETRIES = 3;
const RETRY_MS = 400;

/** 连上长连接，每收到一份画面状态交给 receive；口令不对是 denied，连接断了（或根本连不上）是 closed。 */
async function listen(receive: (state: ViewState) => void): Promise<'denied' | 'closed'> {
  const response = await fetch('/api/events', { headers: withToken, cache: 'no-store' });
  if (response.status === 403) return 'denied';
  if (!response.ok || !response.body) return 'closed';
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return 'closed';
    buffer += value;
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const event of events) {
      if (event.startsWith('data: ')) receive(JSON.parse(event.slice('data: '.length)) as ViewState);
    }
  }
}

function send(intent: Intent): Promise<unknown> {
  return fetch('/api/intent', {
    method: 'POST',
    headers: { ...withToken, 'Content-Type': 'application/json' },
    body: JSON.stringify(intent),
    // 发不出去不用管：安装器不在了的话，长连接那边会发现
  }).catch(() => undefined);
}

function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'connecting' });
  // 还没有画面状态时（口令不对、一直连不上）先照浏览器的语言说
  const [lang, setLang] = useState<Lang>(navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en');

  useEffect(() => {
    void (async () => {
      let last: ViewState | undefined;
      let failures = 0;
      for (;;) {
        const end = await listen((state) => {
          last = state;
          failures = 0;
          setLang(state.lang);
          setScreen({ kind: 'live', state });
        }).catch(() => 'closed' as const);
        if (end === 'denied') return setScreen({ kind: 'denied' });
        // 用户点了「完成」：连接是安装器自己收掉的，画面不再改口
        if (last?.stage === 'finished') return;
        if (++failures > RETRIES) return setScreen({ kind: 'exited' });
        await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
      }
    })();
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  }, [lang]);

  const t = TEXT[lang];
  if (screen.kind === 'connecting') return <p class="quiet">{t.connecting}</p>;
  if (screen.kind === 'denied') return <Ended mark="✗" tone="failed" {...t.denied} />;
  if (screen.kind === 'exited') return <Ended mark="–" tone="quiet" {...t.exited} />;
  if (screen.state.stage === 'finished') return <Ended mark="✓" tone="ready" {...t.finished} />;
  return <Machine state={screen.state} lang={lang} />;
}

/** 结束的几种画面：一句说明，上面没有还能点的操作。 */
function Ended({ mark, tone, title, body }: { mark: string; tone: 'ready' | 'failed' | 'quiet'; title: string; body: ComponentChildren }) {
  return (
    <section class="ended">
      <h1>
        <span class={`mark ${tone}`} aria-hidden="true">
          {mark}
        </span>
        {title}
      </h1>
      <p>{body}</p>
    </section>
  );
}

function Machine({ state, lang }: { state: ViewState; lang: Lang }) {
  const t = TEXT[lang];
  const [finishing, setFinishing] = useState(false);
  return (
    <>
      <header>
        <span class="product">oxy-tools</span>
        <span class="version">{state.version}</span>
      </header>
      <section>
        <h2>{t.machine}</h2>
        <dl>
          <dt>{t.agents}</dt>
          <dd class="hosts">
            {state.machine.hosts.map((host) => (
              <span class="host" key={host.name}>
                {host.name}
                {host.detected ? (
                  <span class="mark ready" aria-hidden="true">
                    ✓
                  </span>
                ) : (
                  <span class="faint">{host.status}</span>
                )}
              </span>
            ))}
          </dd>
          <dt>{t.catalog}</dt>
          <dd>{state.machine.catalog.join(' · ')}</dd>
          {state.machine.skipped && (
            <>
              <dt class="attention">{t.notice}</dt>
              <dd>{state.machine.skipped}</dd>
            </>
          )}
        </dl>
      </section>
      <footer>
        <button
          type="button"
          disabled={finishing}
          onClick={() => {
            setFinishing(true);
            void send({ type: 'finish' });
          }}
        >
          {t.finish}
        </button>
        <p class="quiet">{t.finishHint}</p>
      </footer>
    </>
  );
}

render(<App />, document.getElementById('app') as HTMLElement);
