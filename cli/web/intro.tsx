// 开场动画：盖在页面上面的一层，约两秒半。底下的页面照常连着安装器，画面已经在了。
// 时刻都写在样式里（style.css 的「开场动画」）；这里只管什么时候收掉它。
import { useEffect } from 'preact/hooks';
import { Logo } from './logo.tsx';

/** ended 在开场自己淡出完时调用；skipped 在用户点了一下、按了任意键时调用 */
export function Intro({ version, ended, skipped }: { version: string; ended: () => void; skipped: () => void }) {
  useEffect(() => {
    addEventListener('keydown', skipped);
    addEventListener('pointerdown', skipped);
    return () => {
      removeEventListener('keydown', skipped);
      removeEventListener('pointerdown', skipped);
    };
  }, [skipped]);

  return (
    // 纯装饰：读屏软件直接读底下的页面。里面的东西各有各的动画，只认这一层自己淡出完的那一下
    <div class="intro" aria-hidden="true" onAnimationEnd={(event) => event.target === event.currentTarget && ended()}>
      <div class="intro-stage">
        <span class="intro-command">
          <span class="intro-prompt">$</span> npx oxy-tools
        </span>
        <Logo staggered />
        <p class="intro-version">oxy-tools {version}</p>
      </div>
    </div>
  );
}
