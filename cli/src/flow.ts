// 交互流程：主菜单、「推荐」与各个用途的画面怎么走。只决定“显示什么、问什么”，样式交给呈现层。
import { isAbsolute, join, relative } from 'node:path';
import {
  CatalogError,
  type App,
  type Catalog,
  type CatalogSource,
  type Mcp,
  type PinnedSource,
  type Purpose,
  type Skill,
  type SourcedSkill,
  type ThirdPartySkill,
  type Tool,
} from './catalog.ts';
import type { Host, Scope } from './hosts.ts';
import { McpInstallError, installMcp, mcpSteps, type McpStep } from './install-mcp.ts';
import { SkillInstallError, installSkill } from './install-skill.ts';
import { installThirdPartySkill, skillsCliCommand, type SkillsCliCommand } from './install-third-party.ts';
import { installCommand, installTool } from './install-tool.ts';
import type { CommandRunner } from './installer.ts';
import { mcpStatuses } from './mcp-status.ts';
import { PromptAborted, type Prompter } from './prompter.ts';
import { skillStatus } from './skill-status.ts';
import { hasSkillFile, isPresent, thirdPartyStatus } from './third-party-status.ts';
import { toolStatus } from './tool-status.ts';
import type { Environment, InstallOutcome, InstallTarget, McpOutcome, McpTarget, ThirdPartyTarget, ToolTarget, ToolUnavailable, Ui } from './ui.ts';

/** 一次运行里各个画面共用的东西。 */
export interface Session {
  catalog: Catalog;
  source: CatalogSource;
  /** 安装器认识的全部宿主，检测到的和没检测到的都在 */
  hosts: readonly Host[];
  env: Environment;
  platform: NodeJS.Platform;
  homeDir: string;
  /** 项目目录：运行安装器时所在的目录 */
  projectDir: string;
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
  for (;;) {
    const choice = await prompter.select(ui.mainMenu(sizeOf(recommended), purposes));
    if (choice === 'exit') return;
    await browse(session, detected, choice === 'recommended' ? recommended : purposeListing(catalog, choice));
    ui.nextRound();
  }
}

/** 一张混合列表里的条目：组件在上（skill、第三方 Skill、MCP、工具），外部项目在下 */
interface Listing {
  skills: Skill[];
  thirdParty: ThirdPartySkill[];
  mcps: Mcp[];
  tools: Tool[];
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
const sizeOf = (listing: Listing): number =>
  listing.skills.length + listing.thirdParty.length + listing.mcps.length + listing.tools.length + listing.apps.length;

// 「推荐」：本仓库的全部 skill（不看任何标注），加上带推荐标记的其它条目
function recommendedListing(catalog: Catalog): Listing {
  const marked = ({ recommended }: { recommended: boolean }): boolean => recommended;
  return {
    skills: byName(catalog.skills),
    thirdParty: byName(catalog.thirdPartySkills.filter(marked)),
    mcps: byName(catalog.mcps.filter(marked)),
    tools: byName(catalog.tools.filter(marked)),
    apps: byName(catalog.apps.filter(marked)),
    marksRecommended: false,
  };
}

function purposeListing(catalog: Catalog, purpose: Purpose): Listing {
  const here = ({ purpose: id }: { purpose?: string }): boolean => id === purpose.id;
  return {
    skills: byName(catalog.skills.filter(here)),
    thirdParty: recommendedFirst(catalog.thirdPartySkills.filter(here)),
    mcps: recommendedFirst(catalog.mcps.filter(here)),
    tools: recommendedFirst(catalog.tools.filter(here)),
    apps: byName(catalog.apps.filter(here)),
    marksRecommended: true,
  };
}

// 进入「推荐」或一个用途：勾选、确认、装上勾选的组件，最后列出勾选的外部项目的说明与链接
async function browse(session: Session, detected: readonly Host[], listing: Listing): Promise<void> {
  // 列表里没有 skill、第三方 Skill 和 MCP 就没有要装进宿主的东西，不问装进哪些：工具不装进宿主
  await withHosts(session, listing.skills.length + listing.thirdParty.length + listing.mcps.length > 0 ? detected : [], async (hosts) => {
    // 每次进入列表都问，不记上一次的选择；没有要装进的宿主就没有范围可言（工具没有安装范围）
    const scope = hosts.length > 0 ? await session.prompter.select(session.ui.scopePicker(homeRelative(session, session.projectDir))) : 'global';
    const plan = await planEntries(session, detected, hosts, scope, listing);
    if (plan === 'back') return 'back';
    if (plan === 'cancel') return 'done';
    await runJobs(session, plan);
    if (plan.apps.length > 0) session.ui.externalProjects(plan.apps);
    return 'done';
  });
}

interface Job {
  skill: Skill;
  host: Host;
  /** 装进哪个 skill 目录：按所选的安装范围定 */
  skillsDir: string;
  target: InstallTarget;
  /** 目标不是本工具装的，而用户没同意覆盖：这一项不装 */
  declined?: boolean;
}

interface ThirdPartyJob {
  /** 要装的那一个 skill 的名字：条目里勾选的每个 skill 在每个支持它的所选宿主下各是一项 */
  skill: string;
  host: Host;
  /** 装完之后去哪个 skill 目录下复核：按所选的安装范围定 */
  skillsDir: string;
  target: ThirdPartyTarget;
  /** 汇总里展示的就是它，之后执行的也是它 */
  command: SkillsCliCommand;
  /** 在哪个目录下执行：装到项目时是项目目录，装到全局时没有 */
  cwd?: string;
  /** 目标位置已有同名目录，而用户没同意覆盖：这一项不装 */
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

interface ToolJob {
  tool: Tool;
  target: ToolTarget;
}

interface Plan {
  jobs: Job[];
  thirdPartyJobs: ThirdPartyJob[];
  mcpJobs: McpJob[];
  toolJobs: ToolJob[];
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

// 勾选条目、从含多个 skill 的第三方 Skill 里挑、填 key、看汇总和将要执行的命令、确认；返回要装的每一项和勾选的外部项目。
// hosts 是这一轮要装进的宿主，是空的时 skill、第三方 Skill 和 MCP 都勾不上；工具看的是 detected（检测到的宿主），不看选了哪些。
// scope 是这一轮的安装范围：skill 和第三方 Skill 的目录、状态、位置都按它来；工具不受它影响
async function planEntries(
  session: Session,
  detected: readonly Host[],
  hosts: readonly Host[],
  scope: Scope,
  listing: Listing,
): Promise<Plan | 'back' | 'cancel'> {
  const { ui, prompter } = session;
  const skillsDirOf = (host: Host): string => (scope === 'project' ? host.projectSkillsDir : host.skillsDir);
  // 给用户看的位置：全局的以 ~ 开头，项目的写成相对项目目录的路径
  const located = (path: string): string => (scope === 'project' ? relative(session.projectDir, path) : homeRelative(session, path));
  let picked: (Skill | ThirdPartySkill | Mcp | Tool | App)[] = [];
  // 含多个 skill 的第三方 Skill 上次勾了其中哪几个：返回修改后再问时还在
  const chosen = new Map<ThirdPartySkill, SourcedSkill[]>();
  for (;;) {
    // 状态每次进列表都现探测
    const skills = listing.skills.map((skill) => ({ skill, statuses: hosts.map((host) => skillStatus(skill, skillsDirOf(host))) }));
    const thirdParty = listing.thirdParty.map((entry) => ({ entry, statuses: hosts.map((host) => thirdPartyStatus(entry, host, skillsDirOf(host))) }));
    // 项目范围下 MCP 还装不了，它们的行不可选：不去读用户级配置
    const statuses = scope === 'project' ? [] : mcpStatuses(listing.mcps, hosts);
    const unreadable = hosts.filter((_, column) => statuses.some((row) => row[column] === 'unknown'));
    if (unreadable.length > 0) ui.mcpConfigUnreadable(unreadable);
    const mcps = listing.mcps.map((mcp, row) => ({ mcp, statuses: statuses[row] ?? [] }));
    const tools = listing.tools.map((tool) => {
      const command = installCommand(tool, session.platform);
      // 先看有没有宿主，再看系统，再看它要的宿主
      const unavailable: ToolUnavailable | undefined =
        detected.length === 0
          ? { kind: 'no-host' }
          : 'unsupported' in command
            ? { kind: 'os', os: command.unsupported }
            : tool.hosts && !detected.some((host) => tool.hosts?.includes(host.id))
              ? { kind: 'hosts' }
              : undefined;
      return { tool, command, status: toolStatus(tool, session), ...(unavailable ? { unavailable } : {}) };
    });
    picked = await prompter.checkbox(
      ui.mixedPicker({ hosts, scope, skills, thirdParty, mcps, tools, apps: listing.apps, checked: picked, marksRecommended: listing.marksRecommended }),
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
          skillsDir: skillsDirOf(host),
          target: {
            name: skill.name,
            host: host.name,
            location: located(join(skillsDirOf(host), skill.name)),
            version: skill.version,
            status: skillStatus(skill, skillsDirOf(host)),
          },
        })),
      );
    // 第三方 Skill 里要装的每个 skill，在每个支持这个条目的所选宿主下各是一项，各有一条命令
    const thirdPartyJobs: ThirdPartyJob[] = [];
    for (const { entry, statuses } of thirdParty.filter(({ entry }) => picked.includes(entry))) {
      // 含多个 skill 的问要其中哪几个，一个都不勾就是这一条不装；只含一个的不问
      if (entry.skills.length > 1) {
        chosen.set(entry, await prompter.checkbox(ui.thirdPartyPicker({ entry, hosts, statuses, checked: chosen.get(entry) ?? [] })));
      }
      const wanted = chosen.get(entry) ?? entry.skills;
      // 照条目里的先后装，不照勾选的先后
      for (const { name } of entry.skills.filter((skill) => wanted.includes(skill))) {
        for (const [column, host] of hosts.entries()) {
          if (statuses[column] === 'unsupported') continue;
          thirdPartyJobs.push({
            skill: name,
            host,
            skillsDir: skillsDirOf(host),
            target: {
              entry: entry.name,
              name,
              host: host.name,
              location: located(join(skillsDirOf(host), name)),
              exists: isPresent(skillsDirOf(host), name),
            },
            command: skillsCliCommand(entry.source, name, host, scope),
            ...(scope === 'project' ? { cwd: session.projectDir } : {}),
          });
        }
      }
    }
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
    // 汇总里展示的命令就是之后执行的那一行
    const toolJobs = tools.flatMap(({ tool, command }) =>
      picked.includes(tool) && 'command' in command ? [{ tool, target: { name: tool.name, command: command.command, evidence: evidenceOf(session, tool) } }] : [],
    );
    // 没有要确认的东西：只勾了外部项目，勾上的第三方 Skill 在清单里一个都没勾，或勾上的组件全是必填的 key 没填的
    // MCP（直接去结果里说明）
    if (jobs.length + thirdPartyJobs.length + ready.length + toolJobs.length === 0) return { jobs, thirdPartyJobs, mcpJobs, toolJobs, apps };
    // 照执行的先后：第三方 Skill 的在前，MCP 的其次，工具的在后
    const commands = [...thirdPartyJobs.map((job) => job.command), ...ready.flatMap((job) => job.steps.map((step) => step.command))];
    ui.installSummary({
      skills: jobs.map((job) => job.target),
      thirdParty: thirdPartyJobs.map((job) => job.target),
      mcps: ready.map((job) => job.target),
      tools: toolJobs.map((job) => job.target),
    });
    if (commands.length + toolJobs.length > 0) ui.commandList([...commands, ...toolJobs.map((job) => job.target.command)]);
    ui.summaryNotices({
      overwrites: jobs.some((job) => job.target.status.kind !== 'none') || thirdPartyJobs.some((job) => job.target.exists),
      thirdParty: thirdPartyJobs.length > 0,
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
    if (decision === 'install') {
      // 先问完本仓库的 skill 的，再问第三方 Skill 的：照执行的先后
      const confirmed = await confirmOverwrites(session, jobs);
      return { jobs: confirmed, thirdPartyJobs: await confirmReplacements(session, thirdPartyJobs), mcpJobs, toolJobs, apps };
    }
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

// 第三方 Skill 的目标位置已有同名目录的逐项另问，缺省不覆盖——skills CLI 自己遇到同名目录是直接覆盖的。
// 没同意的那些不装，其余照常
async function confirmReplacements(session: Session, jobs: readonly ThirdPartyJob[]): Promise<ThirdPartyJob[]> {
  const { ui, prompter } = session;
  const confirmed: ThirdPartyJob[] = [];
  for (const job of jobs) {
    const declined = job.target.exists && !(await prompter.confirm(ui.confirmReplaceExisting(job.target)));
    confirmed.push({ ...job, declined });
  }
  return confirmed;
}

// 本仓库的 skill 在前，第三方 Skill 其次，MCP 在后，共用一个「正在安装」分区；工具排在最后，它的命令会直接接管
// 终端的输入输出。一项失败不影响其余项
async function runJobs(session: Session, { jobs, thirdPartyJobs, mcpJobs, toolJobs }: Plan): Promise<void> {
  const { ui, interrupt } = session;
  // 全都没同意覆盖时没有要下载的，不必查询
  const source = jobs.every((job) => job.declined) ? undefined : await pinSource(session);
  // 查询失败时出错说明已经给了：skill 一个都不装，结果里也没有它们
  const skillJobs = !source && jobs.some((job) => !job.declined) ? [] : jobs;
  if (skillJobs.length + thirdPartyJobs.length + mcpJobs.length + toolJobs.length === 0) return;
  const progress = ui.installation(
    skillJobs.map((job) => job.target),
    thirdPartyJobs.map((job) => job.target),
    mcpJobs.map((job) => job.target),
    toolJobs.map((job) => job.target),
  );
  for (const { skill, skillsDir, target, declined } of skillJobs) {
    if (declined || !source) {
      progress.skill.skip(target);
      continue;
    }
    const settle = progress.skill.begin(target);
    let outcome: InstallOutcome;
    try {
      await installSkill(skill, skillsDir, { source, tempDir: session.tempDir, interrupt });
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
  for (const { skill, host, skillsDir, target, command, cwd, declined } of thirdPartyJobs) {
    if (declined) {
      progress.thirdParty.skip(target);
      continue;
    }
    const settle = progress.thirdParty.begin(target);
    // 成功与否看复核，不看命令的退出状态
    settle(await installThirdPartySkill(command, host, session.runCommand, () => hasSkillFile(skillsDir, skill), cwd));
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
  for (const { tool, target } of toolJobs) {
    const settle = progress.tool.begin(target);
    // 成功与否看复核，不看命令的退出状态
    settle(await installTool(target.command, session.runCommand, () => toolStatus(tool, session) === 'installed'));
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

// 复核时查的东西，写成给用户看的样子
function evidenceOf(session: Session, { check }: Tool): ToolTarget['evidence'] {
  return 'command' in check ? check : { path: homeRelative(session, join(session.homeDir, ...check.path.split('/'))) };
}

// 给用户看的路径：主目录里的把主目录写成 ~，别处的照原样
function homeRelative(session: Session, path: string): string {
  const inside = relative(session.homeDir, path);
  return inside.startsWith('..') || isAbsolute(inside) ? path : join('~', inside);
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
