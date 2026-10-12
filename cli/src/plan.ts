// 算计划：把勾选算成要装的每一项。两套界面共用：只探测，不提问、不往终端上打东西，也不执行任何命令。
import { isAbsolute, join, relative } from 'node:path';
import { skillsDirOf, toolUnavailable, type Machine } from './availability.ts';
import type { Mcp, Skill, SourcedSkill, ThirdPartySkill, Tool } from './catalog.ts';
import { mcpConfigOf, type Command, type Host, type McpConfig, type Scope } from './hosts.ts';
import { mcpSteps, type McpStep } from './install-mcp.ts';
import { skillsCliCommand, type SkillsCliCommand } from './install-third-party.ts';
import { installCommand } from './install-tool.ts';
import { mcpStatuses, type InstallableMcpStatus } from './mcp-status.ts';
import type { ToolEvidence } from './messages.ts';
import { skillStatus, type SkillStatus } from './skill-status.ts';
import { isPresent, thirdPartyStatus } from './third-party-status.ts';
import { toolStatus, type ToolStatus } from './tool-status.ts';

/** 一项安装：哪个条目、装进哪个宿主、装到哪（给用户看的路径）、要装的版本、那里现在的状态 */
export interface InstallTarget {
  name: string;
  host: string;
  location: string;
  version: string;
  status: SkillStatus;
}

/**
 * 一项第三方 Skill 安装：哪个 skill（entry 是它所属条目的名字）、装进哪个宿主、装到哪（给用户看的路径）、
 * 那里现在是不是已经有东西
 */
export interface ThirdPartyTarget {
  entry: string;
  name: string;
  host: string;
  location: string;
  exists: boolean;
}

/** 一项 MCP 安装：哪个条目、装进哪个宿主、它在那里现在的状态 */
export interface McpTarget {
  name: string;
  host: string;
  status: InstallableMcpStatus;
}

/** 一项工具安装：哪个条目、要执行的那一行命令、装完之后查什么 */
export interface ToolTarget {
  name: string;
  command: string;
  evidence: ToolEvidence;
}

export interface SkillJob {
  skill: Skill;
  host: Host;
  /** 装进哪个 skill 目录：按所选的安装范围定 */
  skillsDir: string;
  target: InstallTarget;
  /** 目标不是本工具装的：覆盖前要另问，缺省不覆盖 */
  asksOverwrite: boolean;
  /** 另问过而用户没同意覆盖：这一项不装。由界面在执行之前标上 */
  declined?: boolean;
}

export interface ThirdPartyJob {
  /** 要装的那一个 skill 的名字：条目里勾选的每个 skill 在每个支持它的所选宿主下各是一项 */
  skill: string;
  host: Host;
  /** 装完之后去哪个 skill 目录下复核：按所选的安装范围定 */
  skillsDir: string;
  target: ThirdPartyTarget;
  /** 给用户看的是它，之后执行的也是它 */
  command: SkillsCliCommand;
  /** 在哪个目录下执行：装到项目时是项目目录，装到全局时没有 */
  cwd?: string;
  /** 目标位置已有同名目录：覆盖前要另问，缺省不覆盖——skills CLI 自己遇到同名目录是直接覆盖的 */
  asksOverwrite: boolean;
  /** 另问过而用户没同意覆盖：这一项不装。由界面在执行之前标上 */
  declined?: boolean;
}

export interface McpJob {
  mcp: Mcp;
  host: Host;
  target: McpTarget;
  /** 写进这个宿主的哪份配置：按所选的安装范围定，和状态探测看的是同一份 */
  config: McpConfig;
  /** 给用户看的命令就是之后执行的这几条；key 的位置只有变量名 */
  steps: McpStep[];
  /** 没填的那个必填变量的名字：有它这一项就不装 */
  missingVariable?: string;
}

export interface ToolJob {
  tool: Tool;
  target: ToolTarget;
  /** 它现在装没装：工具不装进宿主，状态只有一个 */
  status: ToolStatus;
}

/** 用户选了什么 */
export interface Selection {
  /** 这一批要装进的宿主 */
  hosts: readonly Host[];
  /** 安装范围：skill 和第三方 Skill 的目录、状态、位置，MCP 看哪份配置、用哪条命令，都按它来；工具不受它影响 */
  scope: Scope;
  /** 勾选的组件，各类照给的先后装 */
  skills: readonly Skill[];
  /** wanted 是要其中哪几个 skill：照条目里的先后装，不照给的先后；一个都没有就是这一条不装 */
  thirdParty: readonly { entry: ThirdPartySkill; wanted: readonly SourcedSkill[] }[];
  mcps: readonly Mcp[];
  tools: readonly Tool[];
  /** 填过的 key：MCP 的名字 → 变量名。只有名字，值不到这里来 */
  filledKeys: ReadonlyMap<string, ReadonlySet<string>>;
}

/** 汇总要提醒的事，都是事实，说成哪句话由界面照文案定 */
export interface PlanNotices {
  /** 有会覆盖已有内容的项：本地改动会丢失 */
  overwrites: boolean;
  /** 这一批有第三方 Skill：装的是作者当时的最新版 */
  thirdParty: boolean;
  /** 装到项目的 MCP 带着的 key 会以明文写进项目里的哪些文件：只有变量名和文件名，variables 是空的就没有这回事 */
  plaintextKeys: { variables: string[]; files: string[] };
  /** 装到项目的 MCP 写进了哪个文件、要用户在宿主里批准之后才启用；command 是启动宿主的命令 */
  approvals: { host: string; file: string; command: string }[];
  /** 必填的 key 没填、不在这次要装的里面的 MCP，各说一次 */
  missingKeys: { mcp: string; variable: string }[];
  /** 添加远程地址的 MCP 时可能当场打开浏览器登录的宿主；login 是事后补登录的命令 */
  logins: { host: string; login: Command }[];
}

/** 要装的每一项，各类照执行的先后；勾了却装不了的不在里面 */
export interface Plan {
  jobs: SkillJob[];
  thirdPartyJobs: ThirdPartyJob[];
  /** 必填的 key 没填的也在里面（带着 missingVariable）：不装，结果里要说明 */
  mcpJobs: McpJob[];
  toolJobs: ToolJob[];
  notices: PlanNotices;
}

/** 状态都是现探测的：每调一次重新看一遍目标目录和宿主的配置 */
export function planInstall(machine: Machine, { hosts, scope, skills, thirdParty, mcps, tools, filledKeys }: Selection): Plan {
  // 给用户看的位置：全局的以 ~ 开头，项目的写成相对项目目录的路径
  const located = (path: string): string => (scope === 'project' ? relative(machine.projectDir, path) : homeRelative(machine, path));
  // 每个 skill 在每个宿主下各是一项，各有自己的结果
  const jobs = skills.flatMap((skill) =>
    hosts.map((host) => {
      const skillsDir = skillsDirOf(host, scope);
      const status = skillStatus(skill, skillsDir);
      return {
        skill,
        host,
        skillsDir,
        target: { name: skill.name, host: host.name, location: located(join(skillsDir, skill.name)), version: skill.version, status },
        asksOverwrite: status.kind === 'unmanaged',
      };
    }),
  );
  // 第三方 Skill 里要装的每个 skill，在每个支持这个条目的所选宿主下各是一项，各有一条命令
  const thirdPartyJobs: ThirdPartyJob[] = [];
  for (const { entry, wanted } of thirdParty) {
    const supporting = hosts.filter((host) => thirdPartyStatus(entry, host, skillsDirOf(host, scope)) !== 'unsupported');
    for (const { name } of entry.skills.filter((skill) => wanted.includes(skill))) {
      for (const host of supporting) {
        const skillsDir = skillsDirOf(host, scope);
        const exists = isPresent(skillsDir, name);
        thirdPartyJobs.push({
          skill: name,
          host,
          skillsDir,
          target: { entry: entry.name, name, host: host.name, location: located(join(skillsDir, name)), exists },
          command: skillsCliCommand(entry.source, name, host, scope),
          ...(scope === 'project' ? { cwd: machine.projectDir } : {}),
          asksOverwrite: exists,
        });
      }
    }
  }
  // 每个 MCP 在每个装得了它的所选宿主下各是一项
  const statuses = mcpStatuses(mcps, hosts, scope);
  const mcpJobs: McpJob[] = [];
  for (const [row, mcp] of mcps.entries()) {
    // key 按 MCP 算，一次用于它要装进的每个宿主
    const keys = keysOf(mcp, filledKeys.get(mcp.name));
    for (const [column, host] of hosts.entries()) {
      const status = statuses[row]?.[column];
      const config = mcpConfigOf(host, scope);
      if (!config || status === undefined || status === 'unsupported' || status === 'no-config' || status === 'global-only') continue;
      const target = { name: mcp.name, host: host.name, status };
      if ('missing' in keys) mcpJobs.push({ mcp, host, config, target, steps: [], missingVariable: keys.missing });
      else mcpJobs.push({ mcp, host, config, target, steps: mcpSteps(mcp, config, status, keys.variables) });
    }
  }
  const toolJobs = tools.flatMap((tool) => {
    const command = installCommand(tool, machine.platform);
    return toolUnavailable(machine, tool) || !('command' in command)
      ? []
      : [{ tool, target: { name: tool.name, command: command.command, evidence: evidenceOf(machine, tool) }, status: toolStatus(tool, machine) }];
  });

  const ready = mcpJobs.filter((job) => job.missingVariable === undefined);
  // 写进宿主项目范围那份配置的那些，连同各自命令里带着的 key 的变量名
  const intoProject = ready.flatMap(({ host, config, steps }) => {
    const project = host.projectMcp;
    const variables = steps.flatMap((step) => step.command.args.flatMap((arg) => (typeof arg === 'string' ? [] : [arg.variable])));
    return project && config === project ? [{ host, project, variables }] : [];
  });
  return {
    jobs,
    thirdPartyJobs,
    mcpJobs,
    toolJobs,
    notices: {
      overwrites: jobs.some((job) => job.target.status.kind !== 'none') || thirdPartyJobs.some((job) => job.target.exists),
      thirdParty: thirdPartyJobs.length > 0,
      // 宿主把 key 原样记进项目里的配置文件：说出是哪些变量、哪些文件，不说值
      plaintextKeys: {
        variables: [...new Set(intoProject.flatMap((job) => job.variables))],
        files: [...new Set(intoProject.filter((job) => job.variables.length > 0).map((job) => job.project.file))],
      },
      approvals: hosts.flatMap((host) => {
        const project = intoProject.find((job) => job.host === host)?.project;
        return project?.approval === undefined ? [] : [{ host: host.name, file: project.file, command: project.approval }];
      }),
      // 勾了却不装的，按 MCP 各说一次
      missingKeys: [...new Set(mcpJobs.map((job) => job.mcp))].flatMap((mcp) => {
        const variable = mcpJobs.find((job) => job.mcp === mcp)?.missingVariable;
        return variable === undefined ? [] : [{ mcp: mcp.name, variable }];
      }),
      // 宿主命令的输出不上屏：它会当场打开浏览器登录的话，事先说一声
      logins: hosts.flatMap((host) =>
        host.remoteMcpLogin && ready.some((job) => job.host === host && 'url' in job.mcp.server) ? [{ host: host.name, login: host.remoteMcpLogin }] : [],
      ),
    },
  };
}

/** 给用户看的路径：主目录里的把主目录写成 ~，别处的照原样 */
export function homeRelative(machine: Pick<Machine, 'homeDir'>, path: string): string {
  const inside = relative(machine.homeDir, path);
  return inside.startsWith('..') || isAbsolute(inside) ? path : join('~', inside);
}

// 这个 MCP 要带上哪些变量：照条目里的先后，填过的带上，可选的没填就不带；必填的没填就不装它，说出是哪个
function keysOf(mcp: Mcp, filled: ReadonlySet<string> | undefined): { variables: string[] } | { missing: string } {
  const missing = mcp.env.find((variable) => variable.required && !filled?.has(variable.name));
  return missing ? { missing: missing.name } : { variables: mcp.env.filter((variable) => filled?.has(variable.name)).map((variable) => variable.name) };
}

// 复核时查的东西，写成给用户看的样子
function evidenceOf(machine: Machine, { check }: Tool): ToolTarget['evidence'] {
  return 'command' in check ? check : { path: homeRelative(machine, join(machine.homeDir, ...check.path.split('/'))) };
}
