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
  host: Host;
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
  const { catalog, host, ui, prompter } = session;
  // 只列出有条目的分组
  const groups = [{ id: 'skill' as const, count: catalog.skills.length }].filter((group) => group.count > 0);
  for (;;) {
    const choice = await prompter.select(ui.mainMenu(groups));
    if (choice === 'exit') return;
    if (host.detected) await installSkills(session);
    else await browseSkills(catalog.skills, ui, prompter);
    ui.nextRound();
  }
}

// 没有检测到宿主时装不了，只能看
async function browseSkills(skills: readonly Skill[], ui: Ui, prompter: Prompter): Promise<void> {
  let cursor: Skill | undefined;
  for (;;) {
    const skill = await prompter.select(ui.skillList(skills, cursor));
    if (skill === null) return;
    ui.skillDetail(skill);
    cursor = skill;
  }
}

async function installSkills(session: Session): Promise<void> {
  const { catalog, host, ui, prompter, interrupt } = session;
  let picked: Skill[] = [];
  let jobs: { skill: Skill; target: InstallTarget }[];
  for (;;) {
    picked = await prompter.checkbox(ui.skillPicker(catalog.skills, picked));
    // 一个都不勾就确认：返回主菜单
    if (picked.length === 0) return;
    jobs = picked.map((skill) => ({
      skill,
      target: {
        name: skill.name,
        host: host.name,
        location: join('~', relative(session.homeDir, join(host.skillsDir, skill.name))),
      },
    }));
    ui.installSummary(jobs.map((job) => job.target));
    const decision = await prompter.select(ui.confirmInstall());
    if (decision === 'cancel') return;
    if (decision === 'install') break;
    ui.nextRound();
  }

  const source = await pinSource(session);
  if (!source) return;
  const progress = ui.installation(jobs.map((job) => job.target));
  for (const { skill, target } of jobs) {
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
