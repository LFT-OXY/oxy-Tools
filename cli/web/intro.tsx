// 开场：盖在页面上面的一层。前半段是开场动画，约两秒；后半段是开场引导——问「装进哪些 AI Agent」「装到哪里」，
// 用户点了「开始挑选」那一层才淡出。底下的页面照常连着安装器，画面已经在了。
// 时刻都写在样式里（style.css 的「开场」）；这里只管走到哪一段、什么时候收掉它。
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Intent, ViewState } from '../src/web-protocol.ts';
import { Directory, Target } from './browse.tsx';
import { Logo } from './logo.tsx';
import { TEXT } from './text.tsx';

/** 系统开了「减少动态效果」 */
export const reducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

// 会按动控件的键
const activates = (event: KeyboardEvent): boolean => event.key === 'Enter' || event.key === ' ';
// 吞掉接下来的那一次 click；再按下去就是新的一下了，不再吞
function swallowNextClick(): void {
  const swallow = (event: Event): void => {
    event.stopPropagation();
    event.preventDefault();
  };
  addEventListener('click', swallow, { capture: true, once: true });
  addEventListener('pointerdown', () => removeEventListener('click', swallow, true), { capture: true, once: true });
}

/**
 * animated：这次运行第一次打开，要播动画；不播就直接是开场引导静止的样子。
 * 开场引导答过没有照画面状态：没答过就有引导，推来的画面状态里它成了答过，这一层才淡出。
 * leaving 在引导答完、这一层开始淡出时调用；ended 在它淡出完（或不该再留着）时调用；
 * skipped 在没有引导、用户点了一下或按了任意键时调用
 */
export function Intro({
  state,
  animated,
  send,
  leaving,
  ended,
  skipped,
}: {
  state: ViewState;
  animated: boolean;
  send: (intent: Intent) => void;
  leaving: () => void;
  ended: () => void;
  skipped: () => void;
}) {
  const t = TEXT[state.lang];
  // 这一层出现时引导答过没有：答过了（一个宿主都没检测到）就只有动画，照原先的样子播完淡出
  const guided = useRef(!state.guideAnswered).current;
  const [playing, setPlaying] = useState(animated);
  const answered = guided && state.guideAnswered;
  const asking = guided && !answered && !playing;
  const start = useRef<HTMLButtonElement>(null);

  // 跳过只跳动画：有引导就停在引导静止的样子上，没有就直接进去
  useEffect(() => {
    if (!playing) return;
    const skip = (event: Event): void => {
      if (!guided) return skipped();
      // 那一下只用来跳过，不落到刚变得可以操作的控件上：回车、空格不往下传；
      // 点的那一下抬手时补发的 click 也不算数（触屏上它是抬手之后才定落在哪的）
      if (!(event instanceof KeyboardEvent)) swallowNextClick();
      else if (activates(event)) event.preventDefault();
      setPlaying(false);
    };
    addEventListener('keydown', skip);
    addEventListener('pointerdown', skip);
    return () => {
      removeEventListener('keydown', skip);
      removeEventListener('pointerdown', skip);
    };
  }, [playing, guided, skipped]);
  // 按着不放时系统自动重复的回车、空格不算数：跳过动画的那一下按久了，不会接着按动「开始挑选」
  useEffect(() => {
    if (!guided) return;
    const held = (event: KeyboardEvent): void => {
      if (event.repeat && activates(event)) event.preventDefault();
    };
    addEventListener('keydown', held, true);
    return () => removeEventListener('keydown', held, true);
  }, [guided]);
  // 引导可以操作了：焦点进到里面，落在「开始挑选」上——不改什么的话按回车就进去
  useEffect(() => {
    if (asking) start.current?.focus();
  }, [asking]);
  // 答完了：这一层淡出，底下的卡片依次浮上来；系统开了「减少动态效果」就直接收掉
  useEffect(() => {
    if (!answered) return;
    if (reducedMotion()) ended();
    else leaving();
  }, [answered, leaving, ended]);

  // 走到哪一段：动画播着、引导静止着等用户答、答完了正在淡出
  const phase = answered ? 'leaving' : playing ? 'playing' : 'still';
  return (
    // 里面的东西各有各的动画，只认这一层自己淡出完的那一下
    <div class={`intro ${phase}${guided ? '' : ' unguided'}`} onAnimationEnd={(event) => event.target === event.currentTarget && ended()}>
      <div class="intro-stage">
        {/* 动画那一段是纯装饰，不读给读屏软件 */}
        <div class="intro-banner" aria-hidden="true">
          <span class="intro-command">
            <span class="intro-prompt">$</span> npx oxy-tools
          </span>
          <Logo staggered />
          <p class="intro-version">oxy-tools {state.version}</p>
        </div>
        {guided && (
          // 动画那一段里引导的控件点不到、也拿不到焦点；最后一样到位了才可以操作
          <div
            class="intro-guide"
            role="dialog"
            aria-modal="true"
            aria-label={t.guideName}
            inert={!asking}
            onAnimationEnd={(event) => event.target === event.currentTarget.lastElementChild && setPlaying(false)}
          >
            <Target id="guide" state={state} t={t} send={send} />
            {/* 选了项目时写明是哪个目录。这一行一直占着位置：点「项目」的时候上面的控件不跟着挪 */}
            <p class="intro-directory">{state.target.scope === 'project' && <Directory project={state.target.project} />}</p>
            <p class="intro-actions">
              <button type="button" class="primary" ref={start} onClick={() => send({ type: 'guide-answered' })}>
                {t.startPicking} →
              </button>
              <span>{t.guideHint}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
