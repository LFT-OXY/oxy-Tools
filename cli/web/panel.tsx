// 盖在浏览上面的面板：汇总，和确认之后的进度与结果。画什么都来自画面状态；这里只定怎么排。
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { FailureView, Intent, RunRowView, RunView, SummaryRowView, SummaryView, ViewState } from '../src/web-protocol.ts';
import { TEXT } from './text.tsx';

type Text = (typeof TEXT)[ViewState['lang']];
type Send = (intent: Intent) => void;

/**
 * 从右边出来的面板，底下压暗。打开时焦点落到它上面；内容各自滚动，底部的按钮不动。
 * escaped 是按了 Esc 时做什么：不给就不理
 */
function Panel({ label, head, foot, escaped, children }: { label: string; head: ComponentChildren; foot: ComponentChildren; escaped?: () => void; children: ComponentChildren }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => panel.current?.focus(), []);
  return (
    <div class="scrim">
      <div class="panel" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} ref={panel} onKeyDown={(event) => event.key === 'Escape' && escaped?.()}>
        <header>{head}</header>
        <div class="body">{children}</div>
        <footer>{foot}</footer>
      </div>
    </div>
  );
}

/** 把一段里的行按 skill 归组：第三方 Skill 的行带着 skill 的名字，相邻的同名几行成一小组；本仓库的 skill 的行没有名字，整段一组 */
function grouped(rows: SummaryRowView[]): { skill?: string; rows: SummaryRowView[] }[] {
  const groups: { skill?: string; rows: SummaryRowView[] }[] = [];
  for (const row of rows) {
    const last = groups.at(-1);
    if (last && last.skill === row.skill) last.rows.push(row);
    else groups.push({ ...(row.skill === undefined ? {} : { skill: row.skill }), rows: [row] });
  }
  return groups;
}

/** 汇总：将安装的每一项——装进哪个宿主、装到哪、是新装还是覆盖；要逐项决定的覆盖就在那一行下面。不列将执行的命令 */
export function Summary({ summary, t, send }: { summary: SummaryView; t: Text; send: Send }) {
  const revise = (): void => send({ type: 'revise' });
  return (
    <Panel
      label={summary.title}
      escaped={revise}
      head={
        <>
          <h2>{summary.title}</h2>
          <p class="lead">{t.summaryLead}</p>
        </>
      }
      foot={
        <>
          <button type="button" onClick={revise}>
            {summary.revise}
          </button>
          <button type="button" class="primary" onClick={() => send({ type: 'install', summary: summary.id })}>
            {summary.install}
          </button>
        </>
      }
    >
      {summary.renewed && (
        <p class="renewed" role="status">
          <strong class="attention">{t.notice}</strong> {t.renewed}
        </p>
      )}
      {summary.entries.map((entry) => (
        <section class="entry" key={entry.name}>
          <h3>
            <span class="mono">{entry.name}</span>
            <small>{entry.version === undefined ? entry.type : `${entry.type} · ${entry.version}`}</small>
          </h3>
          {grouped(entry.rows).map((group, _, groups) => (
            <div class="group" key={group.skill ?? ''}>
              {/* 第三方 Skill 里每个要装的 skill 一小组，写出它的名字；只有一组、名字又和条目相同时不重复写 */}
              {group.skill !== undefined && !(groups.length === 1 && group.skill === entry.name) && <h4 class="mono">{group.skill}</h4>}
              <ul>
                {group.rows.map((row) => (
                  <li key={row.host}>
                    <span class="quiet">{row.host}</span>
                    <span class={row.overwrites ? 'attention' : undefined}>{row.action}</span>
                    <span class="where">
                      <span class="mono">{row.location}</span>
                      {row.note !== undefined && <small>{row.note}</small>}
                    </span>
                    {row.overwrite && <Decide overwrite={row.overwrite} t={t} send={send} />}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
      {summary.notices.length > 0 && (
        <section class="notices">
          <h3>{t.notice}</h3>
          {summary.notices.map((notice) => (
            <p key={notice}>{notice}</p>
          ))}
        </section>
      )}
    </Panel>
  );
}

/** 要逐项决定的覆盖：一个勾选框和「覆盖它」，没勾时写明会怎样。点了只告诉安装器，勾没勾上等画面状态来了才算 */
function Decide({ overwrite, t, send }: { overwrite: { id: string; agreed: boolean }; t: Text; send: Send }) {
  return (
    <label class="decide">
      <input
        type="checkbox"
        checked={overwrite.agreed}
        onChange={(event) => {
          event.currentTarget.checked = overwrite.agreed;
          send({ type: 'overwrite', item: overwrite.id, on: !overwrite.agreed });
        }}
      />
      <span>{t.overwriteIt}</span>
      {!overwrite.agreed && <small>{t.overwriteOff}</small>}
    </label>
  );
}

const SETTLED: readonly RunRowView['state'][] = ['succeeded', 'failed', 'skipped'];

/** 进度与结果：每一项一行，装着的时候上面是进度条，装完是合计 */
export function Run({ run, t, send }: { run: RunView; t: Text; send: Send }) {
  const [finishing, setFinishing] = useState(false);
  const settled = run.rows.filter((row) => SETTLED.includes(row.state)).length;
  const finish = (
    <button
      type="button"
      class={run.done ? 'primary' : undefined}
      disabled={!run.done || finishing}
      onClick={() => {
        setFinishing(true);
        send({ type: 'finish' });
      }}
    >
      {t.finish}
    </button>
  );
  return (
    <Panel
      label={run.title}
      head={
        <>
          <h2>
            {run.title}
            {!run.done && run.rows.length > 0 && <span class="count">{t.progress(settled, run.rows.length)}</span>}
          </h2>
          {!run.done && <progress max={Math.max(run.rows.length, 1)} value={settled} aria-label={run.title} />}
        </>
      }
      foot={
        run.done ? (
          <>
            <button type="button" onClick={() => send({ type: 'continue' })}>
              {t.continuePicking}
            </button>
            {finish}
          </>
        ) : (
          <>
            <p class="lead">{t.keepTerminal}</p>
            {finish}
          </>
        )
      }
    >
      {run.totals && (
        <dl class="totals">
          {(['succeeded', 'failed', 'skipped'] as const).map((outcome) => {
            const total = run.totals?.[outcome];
            return (
              total && (
                <div key={outcome}>
                  <dd class={outcome === 'failed' && total.count > 0 ? 'failed' : undefined}>{total.count}</dd>
                  <dt>{total.word}</dt>
                </div>
              )
            );
          })}
        </dl>
      )}
      {run.failure && <Failure failure={run.failure} />}
      {/* 进度每变一次读屏软件念一次新的那一行 */}
      <ul class="rows" aria-live="polite">
        {run.loading !== undefined && (
          <li>
            <span class="spinner" aria-hidden="true" />
            <span class="what">{run.loading}…</span>
          </li>
        )}
        {run.rows.map((row) => (
          <li key={`${row.name} ${row.host}`}>
            <Mark state={row.state} />
            <span class={row.state === 'waiting' ? 'mono' : 'mono name'}>{row.name}</span>
            <span class="quiet">{row.host}</span>
            <span class="what">
              <Verdict row={row} />
            </span>
          </li>
        ))}
      </ul>
      {run.next && (
        <section class="notices">
          <h3>{run.next.label}</h3>
          {run.next.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </section>
      )}
    </Panel>
  );
}

/** 行首的符号：成功、失败、跳过和终端界面是同一套；等待的点和正在装的小圆环是网页界面自己的 */
function Mark({ state }: { state: RunRowView['state'] }) {
  if (state === 'running') return <span class="spinner" aria-hidden="true" />;
  const [symbol, tone] = { succeeded: ['✓', 'ready'], failed: ['✗', 'failed'], skipped: ['–', 'faint'], waiting: ['·', 'faint'] }[state];
  return (
    <span class={`sym ${tone}`} aria-hidden="true">
      {symbol}
    </span>
  );
}

/** 这一行的词和它后面的话：词照结局上色，后面的话用前景色 */
function Verdict({ row }: { row: RunRowView }) {
  if (row.state === 'waiting') return <span class="faint">{row.text}</span>;
  if (row.state === 'running') return <>{row.text}…</>;
  return (
    <>
      {row.state === 'failed' ? <strong class="failed">{row.text}</strong> : <span class={row.state === 'succeeded' ? 'ready' : undefined}>{row.text}</span>}
      {row.rest !== undefined && <> {row.rest}</>}
    </>
  );
}

/** 出错说明：标题，下面「原因」「下一步」各一段，和终端界面是同一份话、同一个结构 */
function Failure({ failure }: { failure: FailureView }) {
  return (
    <section class="failure" role="alert">
      <h3 class="failed">{failure.title}</h3>
      <dl>
        <dt>{failure.cause.label}</dt>
        <dd>
          {failure.cause.text}
          {failure.location !== undefined && <span class="mono">{failure.location}</span>}
        </dd>
        <dt>{failure.next.label}</dt>
        <dd>
          {failure.next.lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </dd>
      </dl>
    </section>
  );
}
