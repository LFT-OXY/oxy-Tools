// 交互流程：主菜单、「推荐」、各个用途与工具的旧入口的画面怎么走。只决定“显示什么、问什么”，样式交给呈现层。
import { join, relative } from 'node:path';
import { CatalogError, type App, type Catalog, type CatalogSource, type Mcp, type PinnedSource, type Purpose, type Skill, type Tool } from './catalog.ts';
import type { Host } from './hosts.ts';
import { McpInstallError, installMcp, mcpSteps, type McpStep } from './install-mcp.ts';
import { SkillInstallError, installSkill } from './install-skill.ts';
import { installCommand, installTool } from './install-tool.ts';
import type { CommandRunner } from './installer.ts';
import { mcpStatuses } from './mcp-status.ts';
import { PromptAborted, type Prompter } from './prompter.ts';
import { skillStatus } from './skill-status.ts';
import { toolStatus } from './tool-status.ts';
import type { Environment, InstallOutcome, InstallTarget, McpOutcome, McpTarget, ToolTarget, ToolUnavailable, Ui } from './ui.ts';

/** 一次运行里各个画面共用的东西。 */
export interface Session {
  catalog: Catalog;
  source: CatalogSource;
  /** 安装器认识的全部宿主，检测到的和没检测到的都在 */
  hosts: readonly Host[];
  env: Environment;
  platform: NodeJS.Platform;
  homeDir: string;
  tempDir: string;
  githubToken: string | undefined;
  /** 用户在提问之外按 Ctrl+C 的信号 */
  interrupt: AbortSignal;
  ui: Ui;
  prompter: Prompter;
  runCommand: CommandRunner;
  /** 钉住的来源：一次运行里只查询一次，之后安装的每个 skill 共用 */
  pinned?: PinnedSource;
  /**
   * 用户这次运行里填过的 key：MCP 的名字 → 变量名 → 值。同一个变量只问一次。
   * 只留在内存里，只交给安装动作；不进呈现层，不写任何文件
   */
  keys: Map<string, Map<string, string>>;
}

export async function mainMenu(session: Session): Promise<void> {
  const { catalog, ui, prompter } = session;
  const detected = session.hosts.filter((host) => host.detected);
  const recommended = recommendedListing(catalog);
  // 进去之后一行都没有的用途不出现
  const purposes = catalog.purposes
    .map((purpose) => ({ purpose, count: sizeOf(purposeListing(catalog, purpose)) }))
    .filter(({ count }) => count > 0);
  // 还没搬进混合列表的类型暂时留着旧入口，有条目才列出；组件要装进宿主，一个宿主都没检测到时进不去
  const groups = [{ id: 'tool' as const, count: catalog.tools.length, lacksHost: detected.length === 0 }].filter((group) => group.count > 0);
  for (;;) {
    const choice = await prompter.select(ui.mainMenu(sizeOf(recommended), purposes, groups));
    if (choice === 'exit') return;
    if (choice === 'tool') await installTools(session, detected);
    else await browse(session, detected, choice === 'recommended' ? recommended : purposeListing(catalog, choice));
    ui.nextRound();
  }
}

/** 一张混合列表里的条目：组件在上（先 skill 后 MCP），外部项目在下 */
interface Listing {
  skills: Skill[];
  mcps: Mcp[];
  apps: App[];
  /** 把带推荐的行标出来；「推荐」那张列表里每一行都是，不标 */
  marksRecommended: boolean;
}

const byName = <Entry extends { name: string }>(entries: readonly Entry[]): Entry[] =>
  [...entries].sort((a, b) => (a.name < b.name ? -1 : 1));
// 组件的一段里带推荐的在前，其余按名字
const recommendedFirst = <Entry extends { name: string; recommended: boolean }>(entries: readonly Entry[]): Entry[] => [
  ...byName(entries.filter((entry) => entry.recommended)),
  ...byName(entries.filter((entry) => !entry.recommended)),
];
const sizeOf = (listing: Listing): number => listing.skills.length + listing.mcps.length + listing.apps.length;

// 「推荐」：本仓库的全部 skill（不看任何标注），加上带推荐标记的其它条目
function recommendedListing(catalog: Catalog): Listing {
  const marked = ({ recommended }: { recommended: boolean }): boolean => recommended;
  return { skills: byName(catalog.skills), mcps: byName(catalog.mcps.filter(marked)), apps: byName(catalog.apps.filter(marked)), marksRecommended: false };
}

function purposeListing(catalog: Catalog, purpose: Purpose): Listing {
  const here = ({ purpose: id }: { purpose?: string }): boolean => id === purpose.id;
  return {
    skills: byName(catalog.skills.filter(here)),
    mcps: recommendedFirst(catalog.mcps.filter(here)),
    apps: byName(catalog.apps.filter(here)),
    marksRecommended: true,
  };
}

// 进入「推荐」或一个用途：勾选、确认、装上勾选的组件，最后列出勾选的外部项目的说明与链接
async function browse(session: Session, detected: readonly Host[], listing: Listing): Promise<void> {
  // 列表里没有组件就没有要装进宿主的东西，不问装进哪些
  await withHosts(session, listing.skills.length + listing.mcps.length > 0 ? detected : [], async (hosts) => {
    const plan = await planEntries(session, hosts, listing);
    if (plan === 'back') return 'back';
    if (plan === 'cancel') return 'done';
    await runJobs(session, plan.jobs, plan.mcpJobs);
    if (plan.apps.length > 0) session.ui.externalProjects(plan.apps);
    return 'done';
  });
}

interface Job {
  skill: Skill;
  host: Host;
  target: InstallTarget;
  /** 目标不是本工具装的，而用户没同意覆盖：这一项不装 */
  declined?: boolean;
}

interface McpJob {
  mcp: Mcp;
  host: Host;
  target: McpTarget;
  steps: McpStep[];
  /** 没填的那个必填变量的名字：有它这一项就不装 */
  missingVariable?: string;
}

interface Plan {
  jobs: Job[];
  mcpJobs: McpJob[];
  apps: App[];
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

// 勾选条目、填 key、看汇总和将要执行的命令、确认；返回要装的每一项和勾选的外部项目。
// hosts 是空的表示一个宿主都没检测到：组件都勾不上
async function planEntries(session: Session, hosts: readonly Host[], listing: Listing): Promise<Plan | 'back' | 'cancel'> {
  const { ui, prompter } = session;
  let picked: (Skill | Mcp | App)[] = [];
  for (;;) {
    // 状态每次进列表都现探测
    const skills = listing.skills.map((skill) => ({ skill, statuses: hosts.map((host) => skillStatus(skill, host.skillsDir)) }));
    const statuses = mcpStatuses(listing.mcps, hosts);
    const unreadable = hosts.filter((_, column) => statuses.some((row) => row[column] === 'unknown'));
    if (unreadable.length > 0) ui.mcpConfigUnreadable(unreadable);
    const mcps = listing.mcps.map((mcp, row) => ({ mcp, statuses: statuses[row] ?? [] }));
    picked = await prompter.checkbox(
      ui.mixedPicker({ hosts, skills, mcps, apps: listing.apps, checked: picked, marksRecommended: listing.marksRecommended }),
    );
    if (picked.length === 0) return 'back';
    const apps = listing.apps.filter((app) => picked.includes(app));
    // 每个 skill 在每个宿主下各是一项，各有自己的结果
    const jobs = listing.skills
      .filter((skill) => picked.includes(skill))
      .flatMap((skill) =>
        hosts.map((host) => ({
          skill,
          host,
          target: {
            name: skill.name,
            host: host.name,
            location: homeRelative(session, join(host.skillsDir, skill.name)),
            version: skill.version,
            status: skillStatus(skill, host.skillsDir),
          },
        })),
      );
    // 每个 MCP 在每个支持它的所选宿主下各是一项；汇总里展示的命令就是之后执行的那几条
    const mcpJobs: McpJob[] = [];
    for (const { mcp, statuses } of mcps.filter((entry) => picked.includes(entry.mcp))) {
      // key 按 MCP 问，一次用于它要装进的每个宿主
      const keys = await askKeys(session, mcp);
      for (const [column, host] of hosts.entries()) {
        const status = statuses[column];
        if (status === undefined || status === 'unsupported') continue;
        const target = { name: mcp.name, host: host.name, status };
        if ('missing' in keys) mcpJobs.push({ mcp, host, target, steps: [], missingVariable: keys.missing });
        else mcpJobs.push({ mcp, host, target, steps: mcpSteps(mcp, host, status, keys.variables) });
      }
    }
    const ready = mcpJobs.filter((job) => job.missingVariable === undefined);
    // 没有要确认的东西：只勾了外部项目，或勾上的组件全是必填的 key 没填的 MCP（直接去结果里说明）
    if (jobs.length + ready.length === 0) return { jobs, mcpJobs, apps };
    const commands = ready.flatMap((job) => job.steps.map((step) => step.command));
    ui.installSummary({ skills: jobs.map((job) => job.target), mcps: ready.map((job) => job.target) });
    if (commands.length > 0) ui.commandList(commands);
    ui.summaryNotices({
      overwrites: jobs.some((job) => job.target.status.kind !== 'none'),
      placeholders: commands.some(({ args }) => args.some((arg) => typeof arg !== 'string')),
      // 勾了却不在汇总里的，按 MCP 各说一次
      missingKeys: [...new Set(mcpJobs.map((job) => job.mcp))].flatMap((mcp) => {
        const variable = mcpJobs.find((job) => job.mcp === mcp)?.missingVariable;
        return variable === undefined ? [] : [{ mcp: mcp.name, variable }];
      }),
      // 宿主命令的输出不上屏：它会当场打开浏览器登录的话，事先说一声
      logins: hosts.flatMap((host) =>
        host.remoteMcpLogin && ready.some((job) => job.host === host && 'url' in job.mcp.server) ? [{ host: host.name, login: host.remoteMcpLogin }] : [],
      ),
    });
    const decision = await prompter.select(ui.confirmInstall());
    if (decision === 'cancel') return 'cancel';
    if (decision === 'install') return { jobs: await confirmOverwrites(session, jobs), mcpJobs, apps };
    ui.nextRound();
  }
}

// 不是本工具装的目录逐个另问，缺省不覆盖；没同意的那些不装，其余照常
async function confirmOverwrites(session: Session, jobs: readonly Job[]): Promise<Job[]> {
  const { ui, prompter } = session;
  const confirmed: Job[] = [];
  for (const job of jobs) {
    const declined = job.target.status.kind === 'unmanaged' && !(await prompter.confirm(ui.confirmOverwrite(job.target)));
    confirmed.push({ ...job, declined });
  }
  return confirmed;
}

// 本仓库的 skill 在前，MCP 在后，共用一个「正在安装」分区；一项失败不影响其余项
async function runJobs(session: Session, jobs: readonly Job[], mcpJobs: readonly McpJob[]): Promise<void> {
  const { ui, interrupt } = session;
  // 全都没同意覆盖时没有要下载的，不必查询
  const source = jobs.every((job) => job.declined) ? undefined : await pinSource(session);
  // 查询失败时出错说明已经给了：skill 一个都不装，结果里也没有它们
  const skillJobs = !source && jobs.some((job) => !job.declined) ? [] : jobs;
  if (skillJobs.length + mcpJobs.length === 0) return;
  const progress = ui.installation(
    skillJobs.map((job) => job.target),
    mcpJobs.map((job) => job.target),
  );
  for (const { skill, host, target, declined } of skillJobs) {
    if (declined || !source) {
      progress.skill.skip(target);
      continue;
    }
    const settle = progress.skill.begin(target);
    let outcome: InstallOutcome;
    try {
      await installSkill(skill, host.skillsDir, { source, tempDir: session.tempDir, interrupt });
      outcome = { ok: true, version: skill.version };
    } catch (error) {
      if (interrupt.aborted || !(error instanceof SkillInstallError)) {
        settle();
        throw interrupt.aborted ? new PromptAborted() : error;
      }
      outcome = { ok: false, problem: error.problem };
    }
    settle(outcome);
  }
  for (const { mcp, target, steps, missingVariable } of mcpJobs) {
    if (missingVariable !== undefined) {
      progress.mcp.skip(target, missingVariable);
      continue;
    }
    const settle = progress.mcp.begin(target);
    let outcome: McpOutcome;
    try {
      await installMcp(steps, session.keys.get(mcp.name) ?? new Map(), session.runCommand);
      outcome = { ok: true };
    } catch (error) {
      if (!(error instanceof McpInstallError)) {
        settle();
        throw error;
      }
      outcome = { ok: false, problem: error.problem };
    }
    settle(outcome);
  }
  progress.finish();
}

// 逐个问这个 MCP 要的环境变量：先显示说明和申请链接，输入不回显。返回要带上的那些变量的名字；
// 必填的留空就不装这个 MCP（它后面的变量也不再问），可选的留空就不带
async function askKeys(session: Session, mcp: Mcp): Promise<{ variables: string[] } | { missing: string }> {
  const { ui, prompter } = session;
  const known = session.keys.get(mcp.name) ?? new Map<string, string>();
  session.keys.set(mcp.name, known);
  const variables: string[] = [];
  for (const variable of mcp.env) {
    if (known.has(variable.name)) {
      ui.keyOutcome(mcp, variable, 'reused');
    } else {
      ui.keyRequest(mcp, variable);
      // 粘贴进来的常带着首尾的空白
      const value = (await prompter.password(ui.keyQuestion(variable))).trim();
      ui.keyOutcome(mcp, variable, value === '' ? 'blank' : 'entered');
      if (value === '' && variable.required) return { missing: variable.name };
      if (value === '') continue;
      known.set(variable.name, value);
    }
    variables.push(variable.name);
  }
  return { variables };
}

// 工具不装进宿主，所以不问装进哪个：勾选、看将要执行的完整命令、确认，然后逐个执行并复核
async function installTools(session: Session, detected: readonly Host[]): Promise<void> {
  const { catalog, ui, prompter } = session;
  let picked: Tool[] = [];
  for (;;) {
    // 状态每次进列表都现探测
    const entries = catalog.tools.map((tool) => {
      const plan = installCommand(tool, session.platform);
      const unavailable: ToolUnavailable | undefined =
        'unsupported' in plan
          ? { kind: 'os', os: plan.unsupported }
          : tool.hosts && !detected.some((host) => tool.hosts?.includes(host.id))
            ? { kind: 'hosts' }
            : undefined;
      return { tool, plan, status: toolStatus(tool, session), ...(unavailable ? { unavailable } : {}) };
    });
    picked = await prompter.checkbox(ui.toolPicker(entries, picked));
    // 一个都不勾就确认：返回主菜单
    if (picked.length === 0) return;
    // 汇总里展示的命令就是之后执行的那一行
    const jobs = entries.flatMap(({ tool, plan }) =>
      picked.includes(tool) && 'command' in plan ? [{ tool, target: { name: tool.name, command: plan.command, evidence: evidenceOf(session, tool) } }] : [],
    );
    ui.toolCommandList(jobs.map((job) => job.target));
    const decision = await prompter.select(ui.confirmCommands());
    if (decision === 'cancel') return;
    if (decision === 'install') return runTools(session, jobs);
    ui.nextRound();
  }
}

// 复核时查的东西，写成给用户看的样子
function evidenceOf(session: Session, { check }: Tool): ToolTarget['evidence'] {
  return 'command' in check ? check : { path: homeRelative(session, join(session.homeDir, ...check.path.split('/'))) };
}

async function runTools(session: Session, jobs: readonly { tool: Tool; target: ToolTarget }[]): Promise<void> {
  const progress = session.ui.toolInstallation(jobs.map((job) => job.target));
  for (const { tool, target } of jobs) {
    const settle = progress.begin(target);
    // 成功与否看复核，不看命令的退出状态；一项没装上不影响其余项
    settle(await installTool(target.command, session.runCommand, () => toolStatus(tool, session) === 'installed'));
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
