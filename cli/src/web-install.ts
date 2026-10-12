// 网页界面怎么装：把两套界面共用的「算计划」「执行」接到画面状态上——计划写成汇总，执行的进度记成一行行的结局。
// 说法是和终端界面同一份文案；将执行的命令不进画面状态。
import { createHash } from 'node:crypto';
import type { McpInstallProblem } from './install-mcp.ts';
import type { ThirdPartyResult } from './install-third-party.ts';
import type { Failure, Messages } from './messages.ts';
import { noticeTexts } from './notice-text.ts';
import type { InstallTarget, McpTarget, Plan, SkillJob, ThirdPartyJob, ThirdPartyTarget } from './plan.ts';
import type { InstallOutcome, Progress } from './run-plan.ts';
import { versionChange } from './status-text.ts';
import type { Ui } from './ui.ts';
import type { FailureView, RunRowView, RunView, SummaryEntryView, SummaryRowView, SummaryView } from './web-protocol.ts';
import { ARROW } from './web-view.ts';

// 汇总里要逐项决定覆盖不覆盖的那一项的标识：页面原样带回。第三方 Skill 的带着条目和 skill 的名字
const overwriteId = (job: SkillJob): string => `skill:${job.skill.name}:${job.host.id}`;
const replaceId = (job: ThirdPartyJob): string => `thirdParty:${job.target.entry}:${job.skill}:${job.host.id}`;

/** 要逐项决定的覆盖里，用户没同意的那些标成不装：agreed 是同意了的那几项的标识 */
export function decided(plan: Plan, agreed: ReadonlySet<string>): Plan {
  return {
    ...plan,
    jobs: plan.jobs.map((job) => ({ ...job, declined: job.asksOverwrite && !agreed.has(overwriteId(job)) })),
    thirdPartyJobs: plan.thirdPartyJobs.map((job) => ({ ...job, declined: job.asksOverwrite && !agreed.has(replaceId(job)) })),
  };
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
  // 第三方 Skill 一个条目一段，没有版本（装的是作者当时的最新版）；段里每个要装的 skill 在每个宿主下一行，行带着 skill 的名字
  for (const job of plan.thirdPartyJobs) {
    const { target } = job;
    const row: SummaryRowView = {
      skill: target.name,
      host: target.host,
      action: target.exists ? t.actions.overwrite : t.actions.fresh,
      ...(target.exists ? { overwrites: true as const, note: t.existingDir, overwrite: { id: replaceId(job), agreed: !job.declined } } : {}),
      location: target.location,
    };
    const last = entries.at(-1);
    if (last?.type === t.kinds.thirdParty && last.name === target.entry) last.rows.push(row);
    else entries.push({ name: target.entry, type: t.kinds.thirdParty, rows: [row] });
  }
  // MCP 一个条目一段，没有版本；段里每个装得了它的所选宿主一行，行没有位置。必填的 key 没填的不在里面
  const mcpAction = { none: t.actions.fresh, configured: t.actions.overwrite, unknown: t.actions.unknown };
  const mcpNote = { none: undefined, configured: t.mcpConfiguredNote, unknown: t.mcpUnknownNote };
  for (const { target, missingVariable } of plan.mcpJobs) {
    if (missingVariable !== undefined) continue;
    const text = mcpNote[target.status];
    const row: SummaryRowView = {
      host: target.host,
      action: mcpAction[target.status],
      ...(target.status === 'configured' ? { overwrites: true as const } : {}),
      ...(text === undefined ? {} : { note: text }),
    };
    const last = entries.at(-1);
    if (last?.type === t.kinds.mcp && last.name === target.name) last.rows.push(row);
    else entries.push({ name: target.name, type: t.kinds.mcp, rows: [row] });
  }
  return {
    id: summaryId(plan),
    title: t.installSummary(entries.length),
    entries,
    // 和终端界面汇总后面的提醒是同一份话、同一个先后；网页界面不展示命令，没有「key 以占位符显示」那一条
    notices: noticeTexts(t, plan.notices),
    revise: t.revise,
    install: t.startInstall,
  };
}

/** 汇总里有没有这个标识的逐项决定 */
export const asksOverwrite = (plan: Plan, item: string): boolean =>
  plan.jobs.some((job) => job.asksOverwrite && overwriteId(job) === item) || plan.thirdPartyJobs.some((job) => job.asksOverwrite && replaceId(job) === item);

/**
 * 一行的结局：本仓库的 skill 带版本或问题，第三方 Skill 带复核与命令的结局，MCP 没成时带问题；
 * 跳过的缺省是没同意覆盖，MCP 是必填的 key 没填（missing 是那个变量的名字）
 */
type RowState =
  | { state: 'waiting' }
  | { state: 'running' }
  | { state: 'succeeded'; version: string }
  | { state: 'succeeded'; result: ThirdPartyResult }
  | { state: 'succeeded' }
  | { state: 'failed'; outcome: Extract<InstallOutcome, { ok: false }> }
  | { state: 'failed'; result: ThirdPartyResult }
  | { state: 'failed'; problem: McpInstallProblem }
  | { state: 'skipped'; missing?: string };

/** 一批里的一项：本仓库的 skill、第三方 Skill 里的一个 skill，或一个 MCP，各在一个宿主下 */
type Row = { now: RowState } & ({ kind: 'skill'; target: InstallTarget } | { kind: 'thirdParty'; target: ThirdPartyTarget } | { kind: 'mcp'; target: McpTarget });

/** 一批的进度：每一项走到哪了。画面状态从它现算 */
export interface Batch {
  rows: Row[];
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
  const waiting = (skills: readonly InstallTarget[], thirdParty: readonly ThirdPartyTarget[], mcps: readonly McpTarget[]): Row[] => [
    ...skills.map((target) => ({ kind: 'skill' as const, target, now: { state: 'waiting' as const } })),
    ...thirdParty.map((target) => ({ kind: 'thirdParty' as const, target, now: { state: 'waiting' as const } })),
    ...mcps.map((target) => ({ kind: 'mcp' as const, target, now: { state: 'waiting' as const } })),
  ];
  const targets = <Job extends { target: unknown }>(jobs: readonly Job[]): Job['target'][] => jobs.map((job) => job.target);
  const batch: Batch = { rows: waiting(targets(plan.jobs), targets(plan.thirdPartyJobs), targets(plan.mcpJobs)), loading: false, done: false };
  const set = (target: Row['target'], now: RowState): void => {
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
    installation: (skills, thirdParty, mcps) => {
      batch.rows = waiting(skills, thirdParty, mcps);
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
        thirdParty: {
          begin: (target) => {
            set(target, { state: 'running' });
            // 成功与否看复核，不看命令的退出状态
            return (result) => set(target, result.installed ? { state: 'succeeded', result } : { state: 'failed', result });
          },
          skip: (target) => set(target, { state: 'skipped' }),
        },
        mcp: {
          begin: (target) => {
            set(target, { state: 'running' });
            // 不给结局是这一项被打断了
            return (outcome) => {
              if (outcome) set(target, outcome.ok ? { state: 'succeeded' } : { state: 'failed', problem: outcome.problem });
            };
          },
          skip: (target, missing) => set(target, { state: 'skipped', missing }),
        },
        // 工具还进不了网页界面的计划
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

/**
 * 把装完的一批的结局照先后重报给呈现层：安装中页面关了，结果打在终端上，和终端界面装完之后的「结果」分区是同一份。
 * 这一批里出过的错（向 GitHub 查询失败）照旧先说
 */
export function reportBatch(batch: Batch, ui: Pick<Ui, 'failure' | 'installation'>): void {
  if (batch.failure) ui.failure(batch.failure);
  if (batch.rows.length === 0) return;
  const report = ui.installation(
    batch.rows.flatMap((row) => (row.kind === 'skill' ? [row.target] : [])),
    batch.rows.flatMap((row) => (row.kind === 'thirdParty' ? [row.target] : [])),
    batch.rows.flatMap((row) => (row.kind === 'mcp' ? [row.target] : [])),
    [],
    true,
  );
  for (const { kind, target, now } of batch.rows) {
    if (kind === 'skill') {
      if ('version' in now) report.skill.begin(target)({ ok: true, version: now.version });
      else if ('outcome' in now) report.skill.begin(target)(now.outcome);
      else report.skill.skip(target);
    } else if (kind === 'thirdParty') {
      if ('result' in now) report.thirdParty.begin(target)(now.result);
      else report.thirdParty.skip(target);
    } else if ('problem' in now) report.mcp.begin(target)({ ok: false, problem: now.problem });
    else if (now.state === 'skipped') report.mcp.skip(target, now.missing ?? '');
    else report.mcp.begin(target)({ ok: true });
  }
  report.finish();
}

/** 把一批的进度写成画面状态里的那一块。每一行的词和终端界面的结果行是同一份 */
export function runView(t: Messages, platform: NodeJS.Platform, batch: Batch): RunView {
  // 第三方 Skill 结果词后面接着说的命令的结局：终端界面是接在「已安装」后面的，开头带着分号；网页界面另成一段，去掉它
  const ending = (result: ThirdPartyResult): { rest?: string } => {
    const text = t.thirdPartyResult(result).replace(/^[;；]\s*/, '');
    return text === '' ? {} : { rest: text };
  };
  // 进行中的词照终端界面：本仓库的 skill 是在下载，第三方 Skill 是在装，MCP 是在配置
  const running = { skill: t.downloading, thirdParty: t.installingOne, mcp: t.configuring };
  const row = ({ kind, target, now }: Row): RunRowView => {
    const lead = { name: target.name, host: target.host, state: now.state };
    switch (now.state) {
      case 'waiting':
        return { ...lead, text: t.waiting };
      case 'running':
        return { ...lead, text: running[kind] };
      case 'succeeded':
        if ('result' in now) return { ...lead, text: t.installed, ...ending(now.result) };
        // MCP 成了就是「已配置」，后面没有话
        if (!('version' in now)) return { ...lead, text: t.mcpStatus.configured };
        return {
          ...lead,
          text: t.installed,
          rest: kind === 'skill' && target.status.kind === 'other-version' ? versionChange(target.status.version, now.version, ARROW) : now.version,
        };
      case 'failed':
        return { ...lead, text: t.failed, rest: 'problem' in now ? t.mcpInstallProblem(now.problem) : 'result' in now ? t.thirdPartyResult(now.result) : t.installProblem(now.outcome.problem) };
      case 'skipped':
        return { ...lead, text: t.skippedResult, rest: now.missing === undefined ? t.overwriteDeclined : t.keyMissing(now.missing) };
    }
  };
  const count = (state: RowState['state']): number => batch.rows.filter(({ now }) => now.state === state).length;
  // 有没装上的才有「下一步」：skill 没装上是原有的东西没动；MCP 另说一句，它先移除再添加，不能这样保证
  const failed = batch.rows.filter(({ now }) => now.state === 'failed');
  const next = [...(failed.some(({ kind }) => kind !== 'mcp') ? [t.afterFailures] : []), ...(failed.some(({ kind }) => kind === 'mcp') ? [t.afterMcpFailures] : [])];
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
          ...(next.length > 0 ? { next: { label: t.nextKey, lines: next } } : {}),
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
