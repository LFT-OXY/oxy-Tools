// 交互流程：主菜单与各分组的画面怎么走。只决定“显示什么、问什么”，样式交给呈现层。
import { join, relative } from 'node:path';
import { CatalogError, type Catalog, type CatalogSource, type PinnedSource, type Skill } from './catalog.ts';
import type { Host } from './hosts.ts';
import { SkillInstallError, installSkill } from './install-skill.ts';
import { PromptAborted, type Prompter } from './prompter.ts';
import type { InstallOutcome, InstallTarget, Ui } from './ui.ts';

/** 一次运行里各个画面共用的东西。 */
export interface Session {
  catalog: Catalog;
  source: CatalogSource;
  /** 安装器认识的全部宿主，检测到的和没检测到的都在 */
  hosts: readonly Host[];
  homeDir: string;
  tempDir: string;
  githubToken: string | undefined;
  /** 用户在提问之外按 Ctrl+C 的信号 */
  interrupt: AbortSignal;
  ui: Ui;
  prompter: Prompter;
  /** 钉住的来源：一次运行里只查询一次，之后安装的每个 skill 共用 */
  pinned?: PinnedSource;
}

export async function mainMenu(session: Session): Promise<void> {
  const { catalog, ui, prompter } = session;
  const detected = session.hosts.filter((host) => host.detected);
  // 只列出有条目的分组；组件要装进宿主，一个宿主都没检测到时进不去
  const groups = [{ id: 'skill' as const, count: catalog.skills.length, lacksHost: detected.length === 0 }].filter(
    (group) => group.count > 0,
  );
  for (;;) {
    const choice = await prompter.select(ui.mainMenu(groups));
    if (choice === 'exit') return;
    await installSkills(session, detected);
    ui.nextRound();
  }
}

interface Job {
  skill: Skill;
  host: Host;
  target: InstallTarget;
}

async function installSkills(session: Session, detected: readonly Host[]): Promise<void> {
  const { ui, prompter } = session;
  // 只检测到一个宿主时不问，直接用它
  const asksHosts = detected.length > 1;
  let hosts = detected;
  for (;;) {
    if (asksHosts) {
      const choices = detected.map((host) => ({ host, location: homeRelative(session, host.skillsDir) }));
      hosts = await prompter.checkbox(ui.hostPicker(choices, hosts));
      // 一个都不勾就确认：返回主菜单
      if (hosts.length === 0) return;
    }
    const jobs = await planSkills(session, hosts);
    if (jobs === 'cancel') return;
    if (jobs !== 'back') return runJobs(session, jobs);
    // 列表里一个都没勾是回到上一步：问过宿主就回去重问，没问过就是主菜单
    if (!asksHosts) return;
    ui.nextRound();
  }
}

// 勾选 skill、看汇总、确认；返回要装的每一项
async function planSkills(session: Session, hosts: readonly Host[]): Promise<Job[] | 'back' | 'cancel'> {
  const { catalog, ui, prompter } = session;
  let picked: Skill[] = [];
  for (;;) {
    picked = await prompter.checkbox(ui.skillPicker(catalog.skills, picked));
    if (picked.length === 0) return 'back';
    // 每个 skill 在每个宿主下各是一项，各有自己的结果
    const jobs = picked.flatMap((skill) =>
      hosts.map((host) => ({
        skill,
        host,
        target: { name: skill.name, host: host.name, location: homeRelative(session, join(host.skillsDir, skill.name)) },
      })),
    );
    ui.installSummary(jobs.map((job) => job.target));
    const decision = await prompter.select(ui.confirmInstall());
    if (decision === 'cancel') return 'cancel';
    if (decision === 'install') return jobs;
    ui.nextRound();
  }
}

async function runJobs(session: Session, jobs: readonly Job[]): Promise<void> {
  const { ui, interrupt } = session;
  const source = await pinSource(session);
  if (!source) return;
  const progress = ui.installation(jobs.map((job) => job.target));
  for (const { skill, host, target } of jobs) {
    const settle = progress.begin(target);
    let outcome: InstallOutcome;
    try {
      await installSkill(skill, host.skillsDir, { source, tempDir: session.tempDir, interrupt });
      outcome = { ok: true, version: skill.version };
    } catch (error) {
      if (interrupt.aborted || !(error instanceof SkillInstallError)) {
        settle();
        throw interrupt.aborted ? new PromptAborted() : error;
      }
      // 这一项失败不影响其余项
      outcome = { ok: false, problem: error.problem };
    }
    settle(outcome);
  }
  progress.finish();
}

// 给用户看的路径：主目录写成 ~
function homeRelative(session: Session, path: string): string {
  return join('~', relative(session.homeDir, path));
}

// 查询失败时说明原因，返回 undefined；安装器不因此退出
async function pinSource(session: Session): Promise<PinnedSource | undefined> {
  if (session.pinned) return session.pinned;
  const { ui, interrupt } = session;
  const loading = ui.loading('skillFiles');
  try {
    session.pinned = await session.source
      .pin({ token: session.githubToken, signal: interrupt })
      .finally(() => loading.done());
    return session.pinned;
  } catch (error) {
    if (interrupt.aborted) throw new PromptAborted();
    if (!(error instanceof CatalogError)) throw error;
    ui.failure(error.failure);
    return undefined;
  }
}
