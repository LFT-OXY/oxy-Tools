// 逛目录的画面：三栏——左边「推荐」和各个用途，中间当前这张列表里的条目，右边已选。
// 画什么都来自画面状态；这里只定怎么排。勾选只告诉安装器，勾没勾上照画面状态画。
import { useEffect, useRef, useState } from 'preact/hooks';
import type { AppView, ComponentView, Intent, ListingView, SectionView, SkillChoicesView, StatusView, ViewState } from '../src/web-protocol.ts';
import { Logo } from './logo.tsx';
import { TEXT } from './text.tsx';

type Text = (typeof TEXT)[ViewState['lang']];
// 开场之后卡片依次浮上来，最多错开这么多张
const STAGGERED = 9;
/** 底下的卡片要不要依次浮上来：intro 是跟着开场动画的时刻，guide 是开场引导答完的那一刻起 */
export type Rising = false | 'intro' | 'guide';

/** rising：底下的卡片等开场那一层退场时依次浮上来；covered：上面盖着面板或开场引导，这里的东西点不到、也聚焦不到 */
export function Browse({ state, send, rising, covered }: { state: ViewState; send: (intent: Intent) => void; rising: Rising; covered: boolean }) {
  const t = TEXT[state.lang];
  const { listing } = state;
  const current = state.menu.find((row) => row.id === listing?.id);
  const list = useRef<HTMLElement>(null);
  // 换了一张列表就从头看起
  useEffect(() => {
    list.current?.scrollTo(0, 0);
  }, [listing?.id]);

  return (
    <div class="shell" inert={covered}>
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
      <main class={rising ? `list rising after-${rising}` : 'list'} ref={list} tabIndex={0}>
        {current && listing ? (
          <>
            <header class="bar">
              <div class="title">
                <h1>{current.name}</h1>
                <span class="faint">{t.items(current.count)}</span>
                {/* 选了项目时写明是哪个目录 */}
                {state.target.scope === 'project' && state.target.choices.length > 0 && (
                  <span class="directory">
                    <Directory project={state.target.project} />
                  </span>
                )}
              </div>
              <Target id="target" state={state} t={t} send={send} />
            </header>
            <Components listing={listing} showsHosts={state.target.hosts.length > 1} t={t} send={send} />
            {listing.apps && <Apps {...listing.apps} />}
          </>
        ) : (
          <p class="empty">{state.machine.catalog.join(' · ')}</p>
        )}
      </main>

      <Tray selected={state.selected} t={t} send={send} />
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
      {[machine.noHosts, machine.skipped].map((notice) => notice !== undefined && <Notice key={notice} t={t} notice={notice} />)}
    </section>
  );
}

/** 一条提醒：行首是留意色粗体的「注意」，话用前景色 */
function Notice({ t, notice }: { t: Text; notice: string }) {
  return (
    <p class="notice">
      <strong class="attention">{t.notice}</strong> {notice}
    </p>
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

/** 装到项目是装到哪个目录：那句话和目录的写法都随画面状态来。顶上那一条和开场引导里各有一行 */
export function Directory({ project }: { project: ViewState['target']['project'] }) {
  return (
    <>
      {project.note}
      <code>{project.dir}</code>
    </>
  );
}

/**
 * 「装进哪些 AI Agent」和「装到哪里」：中间一栏顶上那一条里的，和开场引导里的，是这同一个。
 * 改了只告诉安装器，勾没勾上、选了哪个照画面状态画；只检测到一个宿主时没有可改的；一个宿主都没检测到时没有这一块。
 * id 是这一处的名字：两处同时在页面上，控件的 id 和单选的组名靠它分开
 */
export function Target({ id, state, t, send }: { id: string; state: ViewState; t: Text; send: (intent: Intent) => void }) {
  const { choices, hosts, hostsLabel, scope, scopes, scopeLabel } = state.target;
  // 想把最后一个宿主也去掉：安装器不照办，这里说一句；宿主变了这句就收掉
  const [lastOne, setLastOne] = useState(false);
  const chosen = hosts.join('\n');
  useEffect(() => setLastOne(false), [chosen]);
  if (choices.length === 0) return null;
  const [only] = choices;
  return (
    <div class="target">
      {choices.length === 1 && only !== undefined ? (
        <p class="field">
          <span class="label">{t.installIntoOnly(only.name)}</span>
          {state.machine.hosts
            .filter((host) => !host.detected)
            .map((host) => (
              <span class="faint" key={host.name}>
                {host.name} {host.status}
              </span>
            ))}
        </p>
      ) : (
        <div class="field" role="group" aria-labelledby={`${id}-hosts`}>
          <span class="label" id={`${id}-hosts`}>
            {hostsLabel}
          </span>
          {choices.map((choice) => (
            <label class="option" key={choice.id}>
              <input
                type="checkbox"
                checked={choice.on}
                onChange={(event) => {
                  event.currentTarget.checked = choice.on;
                  if (choice.on && hosts.length === 1) setLastOne(true);
                  send({ type: 'host', host: choice.id, on: !choice.on });
                }}
              />
              {choice.name}
            </label>
          ))}
          {lastOne && (
            <span class="attention" role="status">
              {t.atLeastOne}
            </span>
          )}
        </div>
      )}
      <div class="field" role="radiogroup" aria-labelledby={`${id}-scope`}>
        <span class="label" id={`${id}-scope`}>
          {scopeLabel}
        </span>
        <div class="segments">
          {scopes.map((option) => (
            <label key={option.id}>
              <input type="radio" name={`${id}-scope`} checked={scope === option.id} onChange={() => send({ type: 'scope', scope: option.id })} />
              <span>{option.name}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function Components({ listing, showsHosts, t, send }: { listing: ListingView; showsHosts: boolean; t: Text; send: (intent: Intent) => void }) {
  // 卡片浮上来的先后跨着分区数
  let order = 0;
  return (
    <>
      {listing.sections.map((section) => (
        <section key={section.kind}>
          <SectionTitle title={section.title} note={section.note} />
          {/* MCP 那一区上方的提醒：哪个宿主的 MCP 只能装到全局、哪个宿主的 MCP 安装器不装、哪个宿主的配置读不了 */}
          {section.notices?.map((notice) => (
            <Notice key={notice} t={t} notice={notice} />
          ))}
          <ul class="cards">
            {section.entries.map((entry) => (
              <Card key={entry.name} kind={section.kind} entry={entry} showsHosts={showsHosts} order={Math.min(order++, STAGGERED - 1)} send={send} />
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

function Card({
  kind,
  entry,
  showsHosts,
  order,
  send,
}: {
  kind: SectionView['kind'];
  entry: ComponentView;
  showsHosts: boolean;
  order: number;
  send: (intent: Intent) => void;
}) {
  const unavailable = entry.unavailable !== undefined;
  const picked = entry.picked === true;
  // 四种组件都勾得上，不可选的除外。点了只告诉安装器，勾选框自己先不变：勾没勾上等画面状态来了才算
  const toggle = unavailable
    ? undefined
    : (event: { currentTarget: HTMLInputElement }): void => {
        event.currentTarget.checked = picked;
        send({ type: 'pick', kind, name: entry.name, on: !picked });
      };
  // 含多个 skill 的第三方 Skill 勾上之后占一整行，底下是挑 skill 的清单
  const choosing = picked && entry.skills !== undefined;
  return (
    <li class={`card${unavailable ? ' unavailable' : ''}${picked ? ' selected' : ''}${choosing ? ' wide' : ''}`} style={{ '--i': order }}>
      {/* 名字和勾选框是同一个标签：点名字也勾得上 */}
      <label class="head">
        <h3>{entry.name}</h3>
        <input type="checkbox" checked={picked} disabled={!toggle} onChange={toggle} />
      </label>
      {(entry.mark ?? entry.key) !== undefined && (
        <p class="tags">
          {entry.mark !== undefined && <span class="tag solid">{entry.mark}</span>}
          {entry.key !== undefined && <span class="tag">{entry.key}</span>}
        </p>
      )}
      <p class="about">{entry.about}</p>
      {choosing && entry.skills && <SkillChoices entry={entry.name} skills={entry.skills} showsHosts={showsHosts} send={send} />}
      {/* 不可选的原因写在状态的位置，直接看得到 */}
      <p class="statuses">{unavailable ? <strong class="reason">{entry.unavailable}</strong> : entry.statuses.map((status) => <Status key={status.host ?? ''} status={status} showsHost={showsHosts} />)}</p>
    </li>
  );
}

/**
 * 含多个 skill 的第三方 Skill 里挑要装的：那一句，然后每个 skill 一项——勾选框、名字、说明、它自己的状态。
 * 挑了只告诉安装器，勾没勾上等画面状态来了才算
 */
function SkillChoices({ entry, skills, showsHosts, send }: { entry: string; skills: SkillChoicesView; showsHosts: boolean; send: (intent: Intent) => void }) {
  return (
    <div class="choices" role="group" aria-label={skills.lead}>
      <p class="lead">{skills.lead}</p>
      <ul>
        {skills.entries.map((skill) => {
          const chosen = skill.chosen === true;
          return (
            <li key={skill.name} class={chosen ? 'chosen' : undefined}>
              <label>
                <input
                  type="checkbox"
                  checked={chosen}
                  onChange={(event) => {
                    event.currentTarget.checked = chosen;
                    send({ type: 'choose', entry, skill: skill.name, on: !chosen });
                  }}
                />
                <span class="name mono">{skill.name}</span>
              </label>
              <p class="about">{skill.about}</p>
              <p class="statuses">
                {skill.statuses.map((status) => (
                  <Status key={status.host ?? ''} status={status} showsHost={showsHosts} />
                ))}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
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

/**
 * 右栏：已选了哪些、一共几个，能在这里直接去掉某一个；「去汇总」和「完成」固定在底部。「完成」让安装器退出。
 * 这一轮不会装的（改了宿主或安装范围之后装不了的、一个 skill 都没挑的）留在这里：名字划掉，下面写原因；
 * 一个会装的都没有时去不了汇总
 */
function Tray({ selected, t, send }: { selected: ViewState['selected']; t: Text; send: (intent: Intent) => void }) {
  const [finishing, setFinishing] = useState(false);
  const stuck = selected.filter((entry) => entry.unavailable !== undefined).length;
  return (
    <aside class="tray" aria-label={t.selected}>
      <div class="picked">
        <h2>
          {t.selected}
          <span class="number">{selected.length}</span>
          {stuck > 0 && <span class="attention">{t.nowUnavailable(stuck)}</span>}
        </h2>
        {selected.length === 0 ? (
          <p class="empty">{t.nothingSelected}</p>
        ) : (
          <ul>
            {selected.map((entry) => (
              <li key={`${entry.kind} ${entry.name}`} class={entry.unavailable === undefined ? undefined : 'stuck'}>
                <p>
                  <span class="name">{entry.unavailable === undefined ? entry.name : <s>{entry.name}</s>}</span>
                  {entry.unavailable === undefined ? (
                    <small>
                      {entry.type}
                      {entry.detail !== undefined && <> · {entry.detail}</>}
                      {entry.key && (
                        <>
                          {' · '}
                          <span class={entry.key.tone}>{entry.key.text}</span>
                        </>
                      )}
                    </small>
                  ) : (
                    <small class="attention">{entry.unavailable}</small>
                  )}
                </p>
                <button type="button" class="remove" aria-label={t.remove(entry.name)} onClick={() => send({ type: 'pick', kind: entry.kind, name: entry.name, on: false })}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <footer>
        <button type="button" class="primary" disabled={selected.length === stuck} onClick={() => send({ type: 'review' })}>
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
