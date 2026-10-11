// 填 key 的对话框：盖在浏览上面，每个要 key 的 MCP 一段。画什么都来自画面状态——那里只有「填了没有」，没有值；
// 值只在输入框里待到发出去的那一刻，发完就清掉。
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Intent, KeyVariableView, KeysView, ViewState } from '../src/web-protocol.ts';
import { Panel } from './panel.tsx';
import { TEXT } from './text.tsx';

type Text = (typeof TEXT)[ViewState['lang']];
type Send = (intent: Intent) => void;
// 网址末尾这么多个字和后面的箭头不拆开：箭头不单独掉到下一行
const TAIL = 6;

/** 「好了」是去汇总：必填的没填只是那个 MCP 不装。关掉、按 Esc 是回去接着挑 */
export function Keys({ keys, t, send }: { keys: KeysView; t: Text; send: Send }) {
  const body = useRef<HTMLDivElement>(null);
  // 打开时焦点落在第一个输入框上：直接就能粘贴
  useEffect(() => body.current?.querySelector('input')?.focus(), []);
  const back = (): void => send({ type: 'revise' });
  return (
    <Panel
      dialog
      label={t.keysTitle}
      escaped={back}
      head={
        <>
          <h2>
            {t.keysTitle}
            <button type="button" class="remove" aria-label={t.close} onClick={back}>
              ×
            </button>
          </h2>
          <p class="lead">{t.keysLead}</p>
        </>
      }
      foot={
        <button type="button" class="primary" onClick={() => send({ type: 'review' })}>
          {t.keysDone}
        </button>
      }
    >
      <div ref={body}>
        {keys.entries.map((entry) => (
          <section class="keyed" key={entry.mcp}>
            <h3>
              <span class="mono">{entry.mcp}</span>
              <small>{entry.purpose}</small>
            </h3>
            {entry.variables.map((variable) => (
              <Variable key={variable.name} mcp={entry.mcp} variable={variable} t={t} send={send} />
            ))}
          </section>
        ))}
      </div>
    </Panel>
  );
}

// 这个浏览器会不会照样式把字画成圆点。会就用普通的输入框：浏览器不把它当密码，也就不会问要不要保存；
// 不会就退回真正的密码框——宁可被问一句，也不把 key 显示出来
const FIELD = typeof CSS !== 'undefined' && CSS.supports('-webkit-text-security', 'disc') ? ({ type: 'text' } as const) : ({ type: 'password' } as const);

/**
 * 一个变量：名字、必填还是可选、说明，下面一行是申请的链接，再下面是输入框——填过的是一行「已填」和「换一个」。
 * 输入框的内容变了（失去焦点、按回车）就发给安装器并清空；填没填上等画面状态来了才算
 */
function Variable({ mcp, variable, t, send }: { mcp: string; variable: KeyVariableView; t: Text; send: Send }) {
  // 点了「换一个」：填过的也给输入框
  const [replacing, setReplacing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const change = useRef<HTMLButtonElement>(null);
  // 刚从这个输入框发出去过一个值
  const sent = useRef(false);
  const filled = variable.filled !== undefined;
  useEffect(() => {
    if (replacing) input.current?.focus();
  }, [replacing]);
  // 按回车发出去之后这一行换成「已填」，原来有焦点的输入框没有了：把焦点接到「换一个」上，Esc 和 Tab 才接得上。
  // 焦点已经去了别处（用户是点开、Tab 开的）就不动它
  useEffect(() => {
    if (filled && !replacing && sent.current && document.activeElement === document.body) change.current?.focus();
    if (filled) sent.current = false;
  }, [filled, replacing]);
  const { url } = variable;
  return (
    <div class="variable">
      <p class="name">
        <span class="mono">{variable.name}</span>
        <span class="tag">{variable.need}</span>
      </p>
      <p class="about">{variable.about}</p>
      <p class="apply">
        {t.getOne}{' '}
        <a class="mono" href={url} target="_blank" rel="noopener noreferrer">
          {url.slice(0, -TAIL)}
          <span class="tail">
            {url.slice(-TAIL)}
            <span class="arrow">↗</span>
          </span>
        </a>
      </p>
      {filled && !replacing ? (
        <p class="filled">
          <span class="ready">✓ {variable.filled}</span>
          <button type="button" class="text" ref={change} onClick={() => setReplacing(true)}>
            {t.change}
          </button>
        </p>
      ) : (
        <>
          {/* 不显示输入的内容；不放在表单里、没有名字，不让浏览器记住、自动填、查拼写 */}
          <input
            ref={input}
            class="secret"
            {...FIELD}
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            spellcheck={false}
            data-1p-ignore
            data-lpignore="true"
            data-bwignore
            aria-label={variable.name}
            placeholder={t.pasteKey}
            onChange={(event) => {
              const value = event.currentTarget.value.trim();
              event.currentTarget.value = '';
              if (value !== '') {
                sent.current = true;
                send({ type: 'key', mcp, variable: variable.name, value });
              }
              setReplacing(false);
            }}
            // 点了「换一个」又什么都没填就走开：原来填的还在
            onBlur={() => setReplacing(false)}
          />
          {!filled && <p class={variable.required ? 'consequence required' : 'consequence'}>{variable.blank}</p>}
        </>
      )}
    </div>
  );
}
