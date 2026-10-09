// 交互流程：主菜单与各分组的画面怎么走。只决定“显示什么、问什么”，样式交给呈现层。
import { join, relative } from 'node:path';
import { CatalogError, type App, type Catalog, type CatalogSource, type Mcp, type PinnedSource, type Skill, type Tool } from './catalog.ts';
import type { Host } from './hosts.ts';
import { McpInstallError, installMcp, mcpSteps, type McpStep } from './install-mcp.ts';
import { SkillInstallError, installSkill } from './install-skill.ts';
import { installCommand, installTool } from './install-tool.ts';
import type { CommandRunner, LinkOpener } from './installer.ts';
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
  openLink: LinkOpener;
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
  // 只列出有条目的分组；组件要装进宿主，一个宿主都没检测到时进不去。应用项目不靠宿主
  const groups = [
    { id: 'skill' as const, count: catalog.skills.length, lacksHost: detected.length === 0 },
    { id: 'mcp' as const, count: catalog.mcps.length, lacksHost: detected.length === 0 },
    { id: 'tool' as const, count: catalog.tools.length, lacksHost: detected.length === 0 },
    { id: 'app' as const, count: catalog.apps.length, lacksHost: false },
  ].filter((group) => group.count > 0);
  for (;;) {
    const choice = await prompter.select(ui.mainMenu(groups));
    if (choice === 'exit') return;
    if (choice === 'app') await browseApps(session);
    else if (choice === 'mcp') await installMcps(session, detected);
    else if (choice === 'tool') await installTools(session, detected);
    else await installSkills(session, detected);
    ui.nextRound();
  }
}

// 应用项目装不了：显示说明和官方链接，并在浏览器里打开它；看完一个回到列表，光标留在它上面
async function browseApps(session: Session): Promise<void> {
  const { catalog, ui, prompter } = session;
  let cursor: App | undefined;
  for (;;) {
    const app = await prompter.select(ui.appList(catalog.apps, cursor));
    if (app === null) return;
    ui.appDetail(app);
    // 浏览器打不开不算出错：链接已经整条写在上面
    ui.linkOutcome(await session.openLink(app.url).then(() => true, () => false));
    cursor = app;
  }
}

interface Job {
  skill: Skill;
  host: Host;
  target: InstallTarget;
  /** 目标不是本工具装的，而用户没同意覆盖：这一项不装 */
  declined?: boolean;
}

// 先定装进哪些宿主，再由 proceed 走后面的画面；它返回 back 表示要回到上一步。
// location 是宿主选择里写在名字后面的提示（skill 的目录），没有就不写
async function withHosts(
  session: Session,
  detected: readonly Host[],
  location: ((host: Host) => string) | undefined,
  proceed: (hosts: readonly Host[]) => Promise<'back' | 'done'>,
): Promise<void> {
  const { ui, prompter } = session;
  // 只检测到一个宿主时不问，直接用它
  const asksHosts = detected.length > 1;
  let hosts = detected;
  for (;;) {
    if (asksHosts) {
      const choices = detected.map((host) => ({ host, ...(location ? { location: location(host) } : {}) }));
      hosts = await prompter.checkbox(ui.hostPicker(choices, hosts));
      // 一个都不勾就确认：返回主菜单
      if (hosts.length === 0) return;
    }
    if ((await proceed(hosts)) === 'done') return;
    // 列表里一个都没勾是回到上一步：问过宿主就回去重问，没问过就是主菜单
    if (!asksHosts) return;
    ui.nextRound();
  }
}

async function installSkills(session: Session, detected: readonly Host[]): Promise<void> {
  await withHosts(
    session,
    detected,
    (host) => homeRelative(session, host.skillsDir),
    async (hosts) => {
      const jobs = await planSkills(session, hosts);
      if (jobs === 'back') return 'back';
      if (jobs !== 'cancel') await runJobs(session, jobs);
      return 'done';
    },
  );
}

// 勾选 skill、看汇总、确认；返回要装的每一项
async function planSkills(session: Session, hosts: readonly Host[]): Promise<Job[] | 'back' | 'cancel'> {
  const { catalog, ui, prompter } = session;
  let picked: Skill[] = [];
  for (;;) {
    // 状态每次进列表都现探测
    const entries = catalog.skills.map((skill) => ({
      skill,
      statuses: hosts.map((host) => skillStatus(skill, host.skillsDir)),
    }));
    picked = await prompter.checkbox(ui.skillPicker(hosts, entries, picked));
    if (picked.length === 0) return 'back';
    // 每个 skill 在每个宿主下各是一项，各有自己的结果
    const jobs = picked.flatMap((skill) =>
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
    ui.installSummary(jobs.map((job) => job.target));
    const decision = await prompter.select(ui.confirmInstall());
    if (decision === 'cancel') return 'cancel';
    if (decision === 'install') return confirmOverwrites(session, jobs);
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

async function runJobs(session: Session, jobs: readonly Job[]): Promise<void> {
  const { ui, interrupt } = session;
  // 全都没同意覆盖时没有要下载的，不必查询
  const source = jobs.every((job) => job.declined) ? undefined : await pinSource(session);
  if (!source && jobs.some((job) => !job.declined)) return;
  const progress = ui.installation(jobs.map((job) => job.target));
  for (const { skill, host, target, declined } of jobs) {
    if (declined || !source) {
      progress.skip(target);
      continue;
    }
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

interface McpJob {
  mcp: Mcp;
  host: Host;
  target: McpTarget;
  steps: McpStep[];
  /** 没填的那个必填变量的名字：有它这一项就不装 */
  missingVariable?: string;
}

async function installMcps(session: Session, detected: readonly Host[]): Promise<void> {
  await withHosts(session, detected, undefined, async (hosts) => {
    const jobs = await planMcps(session, hosts);
    if (jobs === 'back') return 'back';
    if (jobs !== 'cancel') await runMcpJobs(session, jobs);
    return 'done';
  });
}

// 勾选 MCP、看汇总和将要执行的命令、确认；返回要装的每一项
async function planMcps(session: Session, hosts: readonly Host[]): Promise<McpJob[] | 'back' | 'cancel'> {
  const { catalog, ui, prompter } = session;
  let picked: Mcp[] = [];
  for (;;) {
    // 状态每次进列表都现探测
    const statuses = mcpStatuses(catalog.mcps, hosts);
    const unreadable = hosts.filter((_, column) => statuses.some((row) => row[column] === 'unknown'));
    if (unreadable.length > 0) ui.mcpConfigUnreadable(unreadable);
    const entries = catalog.mcps.map((mcp, row) => ({ mcp, statuses: statuses[row] ?? [] }));
    picked = await prompter.checkbox(ui.mcpPicker(hosts, entries, picked));
    if (picked.length === 0) return 'back';
    // 每个 MCP 在每个支持它的所选宿主下各是一项；汇总里展示的命令就是之后执行的那几条
    const jobs: McpJob[] = [];
    for (const { mcp, statuses } of entries.filter((entry) => picked.includes(entry.mcp))) {
      // key 按 MCP 问，一次用于它要装进的每个宿主
      const keys = await askKeys(session, mcp);
      for (const [column, host] of hosts.entries()) {
        const status = statuses[column];
        if (status === undefined || status === 'unsupported') continue;
        const target = { name: mcp.name, host: host.name, status };
        if ('missing' in keys) jobs.push({ mcp, host, target, steps: [], missingVariable: keys.missing });
        else jobs.push({ mcp, host, target, steps: mcpSteps(mcp, host, status, keys.variables) });
      }
    }
    const ready = jobs.filter((job) => job.missingVariable === undefined);
    // 必填的 key 都没填：没有要执行的命令，不必确认，直接去结果里说明
    if (ready.length === 0) return jobs;
    const commands = ready.flatMap((job) => job.steps.map((step) => step.command));
    ui.mcpSummary(ready.map((job) => job.target));
    ui.commandList(commands);
    // 勾了却不在汇总里的，按 MCP 各说一次
    for (const mcp of new Set(jobs.map((job) => job.mcp))) {
      const skipped = jobs.find((job) => job.mcp === mcp)?.missingVariable;
      if (skipped !== undefined) ui.mcpKeyMissingNotice(mcp, skipped);
    }
    if (commands.some(({ args }) => args.some((arg) => typeof arg !== 'string'))) ui.keyPlaceholderNotice();
    // 宿主命令的输出不上屏：它会当场打开浏览器登录的话，事先说一声
    for (const host of hosts) {
      const logsIn = ready.some((job) => job.host === host && 'url' in job.mcp.server);
      if (host.remoteMcpLogin && logsIn) ui.mcpLoginNotice(host, host.remoteMcpLogin);
    }
    const decision = await prompter.select(ui.confirmCommands());
    if (decision === 'cancel') return 'cancel';
    if (decision === 'install') return jobs;
    ui.nextRound();
  }
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

async function runMcpJobs(session: Session, jobs: readonly McpJob[]): Promise<void> {
  const progress = session.ui.mcpInstallation(jobs.map((job) => job.target));
  for (const { mcp, target, steps, missingVariable } of jobs) {
    if (missingVariable !== undefined) {
      progress.skip(target, missingVariable);
      continue;
    }
    const settle = progress.begin(target);
    let outcome: McpOutcome;
    try {
      await installMcp(steps, session.keys.get(mcp.name) ?? new Map(), session.runCommand);
      outcome = { ok: true };
    } catch (error) {
      if (!(error instanceof McpInstallError)) {
        settle();
        throw error;
      }
      // 这一项失败不影响其余项
      outcome = { ok: false, problem: error.problem };
    }
    settle(outcome);
  }
  progress.finish();
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
