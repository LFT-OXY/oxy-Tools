// 网页界面的页面：把安装器发来的画面状态画出来，把操作变成意图。状态都在安装器那边，这里什么都不存。
import { render, type ComponentChildren } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import type { Intent, ViewState } from '../src/web-protocol.ts';
import { Browse, type Rising } from './browse.tsx';
import { Intro, reducedMotion } from './intro.tsx';
import { Keys } from './keys.tsx';
import { Run, Summary } from './panel.tsx';
import { TEXT, type Lang } from './text.tsx';

/** connecting 是还没收到画面状态；denied 是口令不对；exited 是连接断了、重连不上 */
type Screen = { kind: 'connecting' } | { kind: 'live'; state: ViewState } | { kind: 'denied' } | { kind: 'exited' };

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

// 意图一个接一个地发，上一个答复回来才发下一个：到安装器那边的先后和点的先后一样（填完 key 紧接着点「好了」）
let sending: Promise<unknown> = Promise.resolve();
function send(intent: Intent): void {
  sending = sending
    .then(() =>
      fetch('/api/intent', {
        method: 'POST',
        headers: { ...withToken, 'Content-Type': 'application/json' },
        body: JSON.stringify(intent),
      }),
    )
    // 发不出去不用管：安装器不在了的话，长连接那边会发现
    .catch(() => undefined);
}

function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'connecting' });
  // 还没有画面状态时（口令不对、一直连不上）先照浏览器的语言说
  const [lang, setLang] = useState<Lang>(navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en');
  // 开场那一层：open 时它盖在页面上，animated 是它带着开场动画；rising 是底下的卡片还带着依次浮上来的动作
  const [intro, setIntro] = useState<{ open: boolean; animated: boolean; rising: Rising }>({ open: false, animated: false, rising: false });
  const listed = screen.kind === 'live' ? screen.state.listing?.id : undefined;

  useEffect(() => {
    void (async () => {
      let last: ViewState | undefined;
      let failures = 0;
      for (;;) {
        const end = await listen((state) => {
          if (!last) {
            // 这次运行里第一次打开：播开场，并告诉安装器播过了——刷新、重连、再开一个标签页都不重播。
            // 系统开了「减少动态效果」时不播
            const animated = !state.introSeen && !reducedMotion();
            if (!state.introSeen) send({ type: 'intro-seen' });
            // 开场引导没答过，那一层就得在：动画播过了（或不播）就直接是引导静止的样子
            setIntro({ open: animated || !state.guideAnswered, animated, rising: animated && state.guideAnswered ? 'intro' : false });
          }
          last = state;
          failures = 0;
          setLang(state.lang);
          setScreen({ kind: 'live', state });
        }).catch(() => 'closed' as const);
        if (end === 'denied') return setScreen({ kind: 'denied' });
        // 用户点了「完成」，或在终端上改用了终端界面：连接是安装器自己收掉的，画面不再改口
        if (last && last.stage !== 'open') return;
        if (++failures > RETRIES) return setScreen({ kind: 'exited' });
        await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
      }
    })();
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  }, [lang]);
  // 淡出完了只收掉盖着的那一层，卡片接着浮完；用户跳过的话两样一起收，所有东西直接到位
  const introEnded = useCallback(() => setIntro((now) => ({ ...now, open: false })), []);
  const introSkipped = useCallback(() => setIntro((now) => ({ ...now, open: false, rising: false })), []);
  // 开场引导答完了，那一层开始淡出：底下的卡片这时才依次浮上来
  const introLeaving = useCallback(() => setIntro((now) => ({ ...now, rising: 'guide' })), []);
  // 换了一张列表：新出现的卡片不再做浮上来的动作
  useEffect(() => {
    if (listed === undefined) return;
    return () => setIntro((now) => ({ ...now, rising: false }));
  }, [listed]);

  const t = TEXT[lang];
  if (screen.kind === 'connecting') return <Solo><p class="quiet connecting">{t.connecting}</p></Solo>;
  if (screen.kind === 'denied') return <Ended mark="✗" tone="failed" {...t.denied} />;
  if (screen.kind === 'exited') return <Ended mark="–" tone="quiet" {...t.exited} />;
  if (screen.state.stage === 'finished') return <Ended mark="✓" tone="ready" {...t.finished} />;
  if (screen.state.stage === 'terminal') return <Ended mark="–" tone="quiet" {...t.switched} />;
  const { keys, summary, run, guideAnswered } = screen.state;
  return (
    <>
      {/* 开场引导开着时底下的页面不可操作，也不读给读屏软件 */}
      <Browse state={screen.state} send={send} rising={intro.rising} covered={Boolean(keys ?? summary ?? run) || !guideAnswered} />
      {keys && <Keys keys={keys} t={t} send={send} />}
      {summary && <Summary summary={summary} t={t} send={send} />}
      {run && <Run run={run} t={t} send={send} />}
      {intro.open && <Intro state={screen.state} animated={intro.animated} send={send} leaving={introLeaving} ended={introEnded} skipped={introSkipped} />}
    </>
  );
}

/** 一栏、居中的版式：还没连上时的那一句和几种结束画面 */
function Solo({ children }: { children: ComponentChildren }) {
  return <div class="solo">{children}</div>;
}

/** 结束的几种画面：一句说明，上面没有还能点的操作。 */
function Ended({ mark, tone, title, body }: { mark: string; tone: 'ready' | 'failed' | 'quiet'; title: string; body: ComponentChildren }) {
  return (
    <Solo>
      <section class="ended">
        <h1>
          <span class={`mark ${tone}`} aria-hidden="true">
            {mark}
          </span>
          {title}
        </h1>
        <p>{body}</p>
      </section>
    </Solo>
  );
}

render(<App />, document.getElementById('app') as HTMLElement);
