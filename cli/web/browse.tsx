// 逛目录的画面：三栏——左边「推荐」和各个用途，中间当前这张列表里的条目，右边已选。
// 画什么都来自画面状态；这里只定怎么排。还不能勾选：勾选框和「去汇总」先是点不了的。
import { useEffect, useRef, useState } from 'preact/hooks';
import type { AppView, ComponentView, Intent, ListingView, StatusView, ViewState } from '../src/web-protocol.ts';
import { Logo } from './logo.tsx';
import { TEXT } from './text.tsx';

type Text = (typeof TEXT)[ViewState['lang']];
// 开场之后卡片依次浮上来，最多错开这么多张
const STAGGERED = 9;

/** rising：开场动画正在播，底下的卡片等它退场时依次浮上来 */
export function Browse({ state, send, rising }: { state: ViewState; send: (intent: Intent) => void; rising: boolean }) {
  const t = TEXT[state.lang];
  const { listing } = state;
  const current = state.menu.find((row) => row.id === listing?.id);
  const list = useRef<HTMLElement>(null);
  // 换了一张列表就从头看起
  useEffect(() => {
    list.current?.scrollTo(0, 0);
  }, [listing?.id]);

  return (
    <div class="shell">
      <nav class="side" aria-label={t.purposes}>
        <div class="brand">
          <Logo />
          <span class="product">oxy-tools</span>
          <span class="faint">{state.version}</span>
        </div>
        <ul class="menu">
          {state.menu.map((row) => (
            <li key={row.id} class={row.recommended ? 'recommended' : undefined}>
              <button type="button" aria-current={row.id === listing?.id ? 'true' : undefined} onClick={() => send({ type: 'open', list: row.id })}>
                <span>{row.name}</span>
                <span class="count">{row.count}</span>
              </button>
            </li>
          ))}
        </ul>
        <Machine machine={state.machine} t={t} />
        <Language state={state} send={send} />
      </nav>

      {/* 这一栏自己滚动：能用键盘聚焦，方向键才滚得动 */}
      <main class={rising ? 'list rising' : 'list'} ref={list} tabIndex={0}>
        {current && listing ? (
          <>
            <header class="bar">
              <div class="title">
                <h1>{current.name}</h1>
                <span class="faint">{t.items(current.count)}</span>
              </div>
              <Target state={state} t={t} />
            </header>
            <Components listing={listing} showsHosts={state.target.hosts.length > 1} />
            {listing.apps && <Apps {...listing.apps} />}
          </>
        ) : (
          <p class="empty">{state.machine.catalog.join(' · ')}</p>
        )}
      </main>

      <Tray t={t} send={send} />
    </div>
  );
}

/** 左栏最下面的本机信息：检测到的宿主、目录里各类条目的数量，和提醒（一个宿主都没检测到、有条目被跳过） */
function Machine({ machine, t }: { machine: ViewState['machine']; t: Text }) {
  return (
    <section class="machine">
      <h2>{t.machine}</h2>
      <p class="hosts">
        {machine.hosts.map((host) => (
          <span class="host" key={host.name}>
            {host.name}
            {host.detected ? (
              <span class="ready" aria-hidden="true">
                ✓
              </span>
            ) : (
              <span class="faint">{host.status}</span>
            )}
          </span>
        ))}
      </p>
      <p class="counts">
        <span>{t.catalog}</span>
        {machine.catalog.map((count) => (
          <span key={count}>{count}</span>
        ))}
      </p>
      {[machine.noHosts, machine.skipped].map(
        (notice) =>
          notice !== undefined && (
            <p class="notice" key={notice}>
              <strong class="attention">{t.notice}</strong> {notice}
            </p>
          ),
      )}
    </section>
  );
}

/**
 * 左栏最下面的切换语言：两格的分段控件，名字和两项随画面状态来。
 * 换了只告诉安装器，由它按新的语言重发画面状态；哪一格是当前的也照画面状态画
 */
function Language({ state, send }: { state: ViewState; send: (intent: Intent) => void }) {
  const { label, options } = state.language;
  return (
    <div class="language segments" role="radiogroup" aria-label={label}>
      {options.map(({ id, name }) => (
        <label key={id} lang={id === 'zh' ? 'zh-CN' : 'en'}>
          <input type="radio" name="lang" checked={state.lang === id} onChange={() => send({ type: 'lang', lang: id })} />
          <span>{name}</span>
        </label>
      ))}
    </div>
  );
}

/** 中间一栏顶上的「装进哪些 AI Agent」和「装到哪里」。现在只显示，不能改；一个宿主都没检测到时没有这一块 */
function Target({ state, t }: { state: ViewState; t: Text }) {
  const { hosts, hostsLabel, scope, scopes, scopeLabel } = state.target;
  if (hosts.length === 0) return null;
  const [only] = hosts;
  return (
    <div class="target">
      {hosts.length === 1 && only !== undefined ? (
        <p class="field">
          <span class="label">{t.installIntoOnly(only)}</span>
          {state.machine.hosts
            .filter((host) => !host.detected)
            .map((host) => (
              <span class="faint" key={host.name}>
                {host.name} {host.status}
              </span>
            ))}
        </p>
      ) : (
        <div class="field" role="group" aria-labelledby="target-hosts">
          <span class="label" id="target-hosts">
            {hostsLabel}
          </span>
          {hosts.map((host) => (
            <label class="option" key={host}>
              <input type="checkbox" checked disabled />
              {host}
            </label>
          ))}
        </div>
      )}
      <div class="field" role="radiogroup" aria-labelledby="target-scope">
        <span class="label" id="target-scope">
          {scopeLabel}
        </span>
        <div class="segments">
          {scopes.map(({ id, name }) => (
            <label key={id}>
              <input type="radio" name="scope" checked={scope === id} disabled />
              <span>{name}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function Components({ listing, showsHosts }: { listing: ListingView; showsHosts: boolean }) {
  // 卡片浮上来的先后跨着分区数
  let order = 0;
  return (
    <>
      {listing.sections.map((section) => (
        <section key={section.kind}>
          <SectionTitle title={section.title} note={section.note} />
          <ul class="cards">
            {section.entries.map((entry) => (
              <Card key={entry.name} entry={entry} showsHosts={showsHosts} order={Math.min(order++, STAGGERED - 1)} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function SectionTitle({ title, note }: { title: string; note?: string | undefined }) {
  return (
    <h2 class="section">
      {title}
      {note !== undefined && <small>{note}</small>}
    </h2>
  );
}

function Card({ entry, showsHosts, order }: { entry: ComponentView; showsHosts: boolean; order: number }) {
  const unavailable = entry.unavailable !== undefined;
  return (
    <li class={unavailable ? 'card unavailable' : 'card'} style={{ '--i': order }}>
      <div class="head">
        <h3>{entry.name}</h3>
        <input type="checkbox" aria-label={entry.name} disabled />
      </div>
      {entry.mark !== undefined && (
        <p class="tags">
          <span class="tag solid">{entry.mark}</span>
        </p>
      )}
      <p class="about">{entry.about}</p>
      {/* 不可选的原因写在状态的位置，直接看得到 */}
      <p class="statuses">{unavailable ? <strong class="reason">{entry.unavailable}</strong> : entry.statuses.map((status) => <Status key={status.host ?? ''} status={status} showsHost={showsHosts} />)}</p>
    </li>
  );
}

/** 一个宿主下的状态：宿主的名字（只装进一个宿主时不写）、状态的词、词后面不上色的那一段 */
function Status({ status, showsHost }: { status: StatusView; showsHost: boolean }) {
  return (
    <span class="status">
      {showsHost && status.host !== undefined && <span class="faint">{status.host}</span>}
      <span class={status.tone}>{status.text}</span>
      {status.rest !== undefined && <span>{status.rest}</span>}
    </span>
  );
}

/** 外部项目：只有说明和链接，没有勾选框。链接在新标签页打开，不带来源信息 */
function Apps({ title, note, entries }: { title: string; note: string; entries: AppView[] }) {
  return (
    <section class="apps">
      <SectionTitle title={title} note={note} />
      <ul>
        {entries.map((app) => (
          <li key={app.name}>
            <p class="name">
              <a href={app.url} target="_blank" rel="noopener noreferrer">
                {app.name}
              </a>
              {app.mark !== undefined && <span class="tag solid">{app.mark}</span>}
            </p>
            <p class="about">{app.about}</p>
            <p class="url">{app.url}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 右栏：已选。现在还不能勾选，先是空状态；「完成」让安装器退出 */
function Tray({ t, send }: { t: Text; send: (intent: Intent) => void }) {
  const [finishing, setFinishing] = useState(false);
  return (
    <aside class="tray" aria-label={t.selected}>
      <div class="picked">
        <h2>
          {t.selected}
          <span class="number">0</span>
        </h2>
        <p class="empty">{t.nothingSelected}</p>
      </div>
      <footer>
        <button type="button" class="primary" disabled>
          {t.toSummary} →
        </button>
        <button
          type="button"
          disabled={finishing}
          onClick={() => {
            setFinishing(true);
            send({ type: 'finish' });
          }}
        >
          {t.finish}
        </button>
      </footer>
    </aside>
  );
}
