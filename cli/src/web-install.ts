// 网页界面怎么装：把两套界面共用的「算计划」「执行」接到画面状态上——计划写成汇总，执行的进度记成一行行的结局。
// 说法是和终端界面同一份文案；将执行的命令不进画面状态。
import { createHash } from 'node:crypto';
import type { Failure, Messages } from './messages.ts';
import type { InstallTarget, Plan, SkillJob } from './plan.ts';
import type { InstallOutcome, Progress } from './run-plan.ts';
import { versionChange } from './status-text.ts';
import type { FailureView, RunRowView, RunView, SummaryEntryView, SummaryRowView, SummaryView } from './web-protocol.ts';
import { ARROW } from './web-view.ts';

// 汇总里要逐项决定覆盖不覆盖的那一项的标识：页面原样带回
const overwriteId = (job: SkillJob): string => `skill:${job.skill.name}:${job.host.id}`;

/** 要逐项决定的覆盖里，用户没同意的那些标成不装：agreed 是同意了的那几项的标识 */
export function decided(plan: Plan, agreed: ReadonlySet<string>): Plan {
  return { ...plan, jobs: plan.jobs.map((job) => ({ ...job, declined: job.asksOverwrite && !agreed.has(overwriteId(job)) })) };
}

/**
 * 一份（标过覆盖决定的）计划的标识：每一项装什么、装到哪、那里现在的状态、覆盖不覆盖，连同提醒，取摘要。
 * 与语言无关；计划里哪一样变了它就变
 */
export function summaryId(plan: Plan): string {
  const content = {
    skills: plan.jobs.map((job) => ({ ...job.target, declined: job.declined })),
    thirdParty: plan.thirdPartyJobs.map((job) => ({ ...job.target, declined: job.declined })),
    mcps: plan.mcpJobs.map((job) => ({ ...job.target, missing: job.missingVariable })),
    tools: plan.toolJobs.map((job) => job.target),
    notices: plan.notices,
  };
  return createHash('sha256').update(JSON.stringify(content)).digest('base64url').slice(0, 22);
}

/** 把（标过覆盖决定的）计划写成汇总：每个条目一段，段里每个宿主一行。词和终端界面的汇总是同一份 */
export function summaryView(t: Messages, plan: Plan): SummaryView {
  const note = ({ status, version }: InstallTarget): string | undefined => {
    switch (status.kind) {
      case 'none':
        return undefined;
      case 'installed':
        return t.reinstallNote(status.version);
      case 'other-version':
        return versionChange(status.version, version, ARROW);
      // 终端界面在这里写「另行确认」；网页界面的决定就在这一行下面
      case 'unmanaged':
        return t.skillStatus.unmanaged;
    }
  };
  const entries: SummaryEntryView[] = [];
  for (const job of plan.jobs) {
    const { target } = job;
    const fresh = target.status.kind === 'none';
    const text = note(target);
    const row: SummaryRowView = {
      host: target.host,
      action: fresh ? t.actions.fresh : t.actions.overwrite,
      ...(fresh ? {} : { overwrites: true as const }),
      location: target.location,
      ...(text === undefined ? {} : { note: text }),
      ...(job.asksOverwrite ? { overwrite: { id: overwriteId(job), agreed: !job.declined } } : {}),
    };
    // 同一个 skill 在各个宿主下的几项挨着
    const last = entries.at(-1);
    if (last?.name === target.name) last.rows.push(row);
    else entries.push({ name: target.name, type: t.kinds.skill, version: target.version, rows: [row] });
  }
  return {
    id: summaryId(plan),
    title: t.installSummary(entries.length),
    entries,
    // 和终端界面汇总后面的提醒是同一份话；别的几条等它们说的那几类组件进了网页界面再加
    notices: plan.notices.overwrites ? [t.replaceNotice] : [],
    revise: t.revise,
    install: t.startInstall,
  };
}

/** 汇总里有没有这个标识的逐项决定 */
export const asksOverwrite = (plan: Plan, item: string): boolean => plan.jobs.some((job) => job.asksOverwrite && overwriteId(job) === item);

type RowState =
  | { state: 'waiting' }
  | { state: 'running' }
  | { state: 'succeeded'; version: string }
  | { state: 'failed'; outcome: Extract<InstallOutcome, { ok: false }> }
  | { state: 'skipped' };

/** 一批的进度：每一项走到哪了。画面状态从它现算 */
export interface Batch {
  rows: { target: InstallTarget; now: RowState }[];
  /** 正在向 GitHub 查询 */
  loading: boolean;
  /** 这一批里出的错 */
  failure?: Failure;
  done: boolean;
}

/**
 * 一批的进度，和把它记下来的那个接收方：交给共用的「执行」。每变一次调一次 changed。
 * 起初每一项都在等待
 */
export function trackBatch(plan: Plan, changed: () => void): { batch: Batch; progress: Progress } {
  const batch: Batch = { rows: plan.jobs.map((job) => ({ target: job.target, now: { state: 'waiting' } })), loading: false, done: false };
  const set = (target: InstallTarget, now: RowState): void => {
    const row = batch.rows.find((candidate) => candidate.target === target);
    if (row) row.now = now;
    changed();
  };
  const progress: Progress = {
    loading: () => {
      batch.loading = true;
      changed();
      return {
        done: () => {
          batch.loading = false;
          changed();
        },
      };
    },
    // 向 GitHub 查询失败：本仓库的 skill 一个都不装，也不在行里
    failure: (failure) => {
      batch.failure = failure;
      batch.rows = [];
      changed();
    },
    installation: (skills) => {
      batch.rows = skills.map((target) => ({ target, now: { state: 'waiting' } }));
      changed();
      return {
        skill: {
          begin: (target) => {
            set(target, { state: 'running' });
            // 不给结局是这一项被打断了：这一批到此为止，由调用方收场
            return (outcome) => {
              if (outcome) set(target, outcome.ok ? { state: 'succeeded', version: outcome.version } : { state: 'failed', outcome });
            };
          },
          skip: (target) => set(target, { state: 'skipped' }),
        },
        // 第三方 Skill、MCP、工具还进不了网页界面的计划
        thirdParty: { begin: () => () => {}, skip: () => {} },
        mcp: { begin: () => () => {}, skip: () => {} },
        tool: { begin: () => () => {} },
        finish: () => {},
      };
    },
  };
  return { batch, progress };
}

/** 这一批结束了：还没有结局的行拿掉；failure 是执行中出的意料之外的错 */
export function settleBatch(batch: Batch, failure?: Failure): void {
  batch.rows = batch.rows.filter(({ now }) => now.state !== 'waiting' && now.state !== 'running');
  batch.loading = false;
  if (failure) batch.failure = failure;
  batch.done = true;
}

/** 把一批的进度写成画面状态里的那一块。每一行的词和终端界面的结果行是同一份 */
export function runView(t: Messages, platform: NodeJS.Platform, batch: Batch): RunView {
  const row = ({ target, now }: Batch['rows'][number]): RunRowView => {
    const lead = { name: target.name, host: target.host, state: now.state };
    switch (now.state) {
      case 'waiting':
        return { ...lead, text: t.waiting };
      case 'running':
        return { ...lead, text: t.downloading };
      case 'succeeded':
        return { ...lead, text: t.installed, rest: target.status.kind === 'other-version' ? versionChange(target.status.version, now.version, ARROW) : now.version };
      case 'failed':
        return { ...lead, text: t.failed, rest: t.installProblem(now.outcome.problem) };
      case 'skipped':
        return { ...lead, text: t.skippedResult, rest: t.overwriteDeclined };
    }
  };
  const count = (state: RowState['state']): number => batch.rows.filter(({ now }) => now.state === state).length;
  return {
    title: batch.done ? t.results : t.installing,
    done: batch.done,
    ...(batch.loading ? { loading: t.loading.skillFiles } : {}),
    ...(batch.failure ? { failure: failureView(t, platform, batch.failure) } : {}),
    rows: batch.rows.map(row),
    ...(batch.done
      ? {
          totals: {
            label: t.totalKey,
            succeeded: { count: count('succeeded'), word: t.totalWords.succeeded },
            failed: { count: count('failed'), word: t.totalWords.failed },
            skipped: { count: count('skipped'), word: t.totalWords.skipped },
          },
          ...(count('failed') > 0 ? { next: { label: t.nextKey, lines: [t.afterFailures] } } : {}),
        }
      : {}),
  };
}

function failureView(t: Messages, platform: NodeJS.Platform, failure: Failure): FailureView {
  const { title, cause, location, next } = t.failure(failure, platform);
  return {
    title: `${t.errorPrefix}${title}`,
    cause: { label: t.causeKey, text: cause },
    ...(location === undefined ? {} : { location }),
    next: { label: t.nextKey, lines: next },
  };
}
