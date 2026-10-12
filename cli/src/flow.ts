// 终端界面的交互流程：主菜单、「推荐」与各个用途的画面怎么走。只决定“显示什么、问什么”，样式交给呈现层；
// 列表里有什么、条目的状态、要装的各项和怎么装，都经两套界面共用的那几块。
import { listingStatus, mcpColumnHosts, sharedSkillsNoted } from './availability.ts';
import type { App, Catalog, Mcp, Skill, SourcedSkill, ThirdPartySkill, Tool } from './catalog.ts';
import type { Host, Scope } from './hosts.ts';
import { purposeCounts, purposeListing, recommendedListing, sizeOf, type Listing } from './listing.ts';
import { homeRelative, planInstall, type Plan, type SkillJob, type ThirdPartyJob } from './plan.ts';
import type { Prompter } from './prompter.ts';
import { runPlan, type Runtime } from './run-plan.ts';
import type { Ui } from './ui.ts';

/** 一次运行里各个画面共用的东西。 */
export interface Session extends Runtime {
  catalog: Catalog;
  ui: Ui;
  prompter: Prompter;
}

export async function mainMenu(session: Session): Promise<void> {
  const { catalog, ui, prompter } = session;
  const detected = session.hosts.filter((host) => host.detected);
  const recommended = recommendedListing(catalog);
  const purposes = purposeCounts(catalog);
  for (;;) {
    const choice = await prompter.select(ui.mainMenu(sizeOf(recommended), purposes));
    if (choice === 'exit') return;
    await browse(session, detected, choice === 'recommended' ? recommended : purposeListing(catalog, choice));
    ui.nextRound();
  }
}

// 进入「推荐」或一个用途：勾选、确认、装上勾选的组件，最后列出勾选的外部项目的说明与链接
async function browse(session: Session, detected: readonly Host[], listing: Listing): Promise<void> {
  // 列表里没有 skill、第三方 Skill 和 MCP 就没有要装进宿主的东西，不问装进哪些：工具不装进宿主
  await withHosts(session, listing.skills.length + listing.thirdParty.length + listing.mcps.length > 0 ? detected : [], async (hosts) => {
    // 每次进入列表都问，不记上一次的选择；没有要装进的宿主就没有范围可言（工具没有安装范围）
    const scope = hosts.length > 0 ? await session.prompter.select(session.ui.scopePicker(homeRelative(session, session.projectDir))) : 'global';
    const picked = await planEntries(session, hosts, scope, listing);
    if (picked === 'back') return 'back';
    if (picked === 'cancel') return 'done';
    // 终端界面的进度接收方就是呈现层
    await runPlan(session, picked.plan, session.ui);
    if (picked.apps.length > 0) session.ui.externalProjects(picked.apps);
    return 'done';
  });
}

// 先定装进哪些宿主，再由 proceed 走后面的画面；它返回 back 表示要回到上一步
async function withHosts(
  session: Session,
  detected: readonly Host[],
  proceed: (hosts: readonly Host[]) => Promise<'back' | 'done'>,
): Promise<void> {
  const { ui, prompter } = session;
  // 只检测到一个宿主时不问，直接用它
  const asksHosts = detected.length > 1;
  let hosts = detected;
  for (;;) {
    if (asksHosts) {
      hosts = await prompter.checkbox(ui.hostPicker(detected, hosts));
      // 一个都不勾就确认：返回主菜单
      if (hosts.length === 0) return;
    }
    if ((await proceed(hosts)) === 'done') return;
    // 列表里一个都没勾是回到上一步：问过宿主就回去重问，没问过就是主菜单
    if (!asksHosts) return;
    ui.nextRound();
  }
}

// 勾选条目、从含多个 skill 的第三方 Skill 里挑、填 key、看汇总和将要执行的命令、确认；返回要装的每一项和勾选的外部项目。
// hosts 是这一轮要装进的宿主，scope 是这一轮的安装范围
async function planEntries(
  session: Session,
  hosts: readonly Host[],
  scope: Scope,
  listing: Listing,
): Promise<{ plan: Plan; apps: App[] } | 'back' | 'cancel'> {
  const { ui, prompter } = session;
  let picked: (Skill | ThirdPartySkill | Mcp | Tool | App)[] = [];
  // 含多个 skill 的第三方 Skill 上次勾了其中哪几个：返回修改后再问时还在
  const chosen = new Map<ThirdPartySkill, SourcedSkill[]>();
  for (;;) {
    // 状态每次进列表都现探测
    const status = listingStatus(session, listing, hosts, scope);
    ui.listNotices({ sharedSkills: sharedSkillsNoted(hosts, listing), ...mcpColumnHosts(hosts, status) });
    picked = await prompter.checkbox(ui.mixedPicker({ ...status, apps: listing.apps, checked: picked, marksRecommended: listing.marksRecommended }));
    if (picked.length === 0) return 'back';
    const apps = listing.apps.filter((app) => picked.includes(app));
    const thirdParty: { entry: ThirdPartySkill; wanted: readonly SourcedSkill[] }[] = [];
    for (const { entry, statuses } of status.thirdParty.filter(({ entry }) => picked.includes(entry))) {
      // 含多个 skill 的问要其中哪几个，一个都不勾就是这一条不装；只含一个的不问
      if (entry.skills.length > 1) {
        chosen.set(entry, await prompter.checkbox(ui.thirdPartyPicker({ entry, skillColumns: status.skillColumns, statuses, checked: chosen.get(entry) ?? [] })));
      }
      thirdParty.push({ entry, wanted: chosen.get(entry) ?? entry.skills });
    }
    const mcps = listing.mcps.filter((mcp) => picked.includes(mcp));
    // key 按 MCP 问，一次用于它要装进的每个宿主
    for (const mcp of mcps) await askKeys(session, mcp);
    // 各类都照列表里的先后，不照勾选的先后；交给算计划的只有 key 的变量名
    const plan = planInstall(session, {
      hosts,
      scope,
      skills: listing.skills.filter((skill) => picked.includes(skill)),
      thirdParty,
      mcps,
      tools: listing.tools.filter((tool) => picked.includes(tool)),
      filledKeys: new Map([...session.keys].map(([mcp, known]) => [mcp, new Set(known.keys())])),
    });
    const { jobs, thirdPartyJobs, toolJobs } = plan;
    const ready = plan.mcpJobs.filter((job) => job.missingVariable === undefined);
    // 没有要确认的东西：只勾了外部项目，勾上的第三方 Skill 在清单里一个都没勾，或勾上的组件全是必填的 key 没填的
    // MCP（直接去结果里说明）
    if (jobs.length + thirdPartyJobs.length + ready.length + toolJobs.length === 0) return { plan, apps };
    // 照执行的先后：第三方 Skill 的在前，MCP 的其次，工具的在后
    const commands = [...thirdPartyJobs.map((job) => job.command), ...ready.flatMap((job) => job.steps.map((step) => step.command))];
    ui.installSummary({
      skills: jobs.map((job) => job.target),
      thirdParty: thirdPartyJobs.map((job) => job.target),
      mcps: ready.map((job) => job.target),
      tools: toolJobs.map((job) => job.target),
    });
    // 展示的命令就是之后执行的那几条
    if (commands.length + toolJobs.length > 0) ui.commandList([...commands, ...toolJobs.map((job) => job.target.command)]);
    ui.summaryNotices({ ...plan.notices, placeholders: commands.some(({ args }) => args.some((arg) => typeof arg !== 'string')) });
    const decision = await prompter.select(ui.confirmInstall());
    if (decision === 'cancel') return 'cancel';
    if (decision === 'install') {
      // 先问完本仓库的 skill 的，再问第三方 Skill 的：照执行的先后
      const confirmed = await confirmOverwrites(session, jobs);
      return { plan: { ...plan, jobs: confirmed, thirdPartyJobs: await confirmReplacements(session, thirdPartyJobs) }, apps };
    }
    ui.nextRound();
  }
}

// 不是本工具装的目录逐个另问，缺省不覆盖；没同意的那些不装，其余照常
async function confirmOverwrites(session: Session, jobs: readonly SkillJob[]): Promise<SkillJob[]> {
  const { ui, prompter } = session;
  const confirmed: SkillJob[] = [];
  for (const job of jobs) {
    const declined = job.asksOverwrite && !(await prompter.confirm(ui.confirmOverwrite(job.target)));
    confirmed.push({ ...job, declined });
  }
  return confirmed;
}

// 第三方 Skill 的目标位置已有同名目录的逐项另问，缺省不覆盖——skills CLI 自己遇到同名目录是直接覆盖的。
// 没同意的那些不装，其余照常
async function confirmReplacements(session: Session, jobs: readonly ThirdPartyJob[]): Promise<ThirdPartyJob[]> {
  const { ui, prompter } = session;
  const confirmed: ThirdPartyJob[] = [];
  for (const job of jobs) {
    const declined = job.asksOverwrite && !(await prompter.confirm(ui.confirmReplaceExisting(job.target)));
    confirmed.push({ ...job, declined });
  }
  return confirmed;
}

// 逐个问这个 MCP 要的环境变量：先显示说明和申请链接，输入不回显。填了的记进 session.keys，带哪些、缺哪个由算计划的
// 照记下的定；必填的留空就不装这个 MCP（它后面的变量也不再问），可选的留空就不带
async function askKeys(session: Session, mcp: Mcp): Promise<void> {
  const { ui, prompter } = session;
  const known = session.keys.get(mcp.name) ?? new Map<string, string>();
  session.keys.set(mcp.name, known);
  for (const variable of mcp.env) {
    if (known.has(variable.name)) {
      ui.keyOutcome(mcp, variable, 'reused');
      continue;
    }
    ui.keyRequest(mcp, variable);
    // 粘贴进来的常带着首尾的空白
    const value = (await prompter.password(ui.keyQuestion(variable))).trim();
    ui.keyOutcome(mcp, variable, value === '' ? 'blank' : 'entered');
    if (value === '' && variable.required) return;
    if (value !== '') known.set(variable.name, value);
  }
}
