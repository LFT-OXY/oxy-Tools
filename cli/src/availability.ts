// 列表里每个条目在所选宿主和安装范围下的状态、可不可选与原因。两套界面共用：只探测，不提问、不往终端上打东西。
import type { Mcp, Skill, ThirdPartySkill, Tool, ToolOs } from './catalog.ts';
import type { Environment, Host, Scope } from './hosts.ts';
import { installCommand } from './install-tool.ts';
import type { Listing } from './listing.ts';
import { mcpStatuses, type McpStatus } from './mcp-status.ts';
import { skillStatus, type SkillStatus } from './skill-status.ts';
import { thirdPartyStatus, type ThirdPartyStatus } from './third-party-status.ts';
import { toolStatus, type ToolStatus } from './tool-status.ts';

/** 本机的事实：探测和算计划都只看这些 */
export interface Machine {
  /** 安装器认识的全部宿主，检测到的和没检测到的都在 */
  hosts: readonly Host[];
  env: Environment;
  platform: NodeJS.Platform;
  homeDir: string;
  /** 项目目录：运行安装器时所在的目录 */
  projectDir: string;
}

/**
 * 条目不可选的原因：一个宿主都没有（skill、第三方 Skill 和 MCP 看的是所选的宿主，工具看的是检测到的）；
 * 它要的宿主一个都不在其中；这个 MCP 在所选的宿主下只能装到全局，而选的是项目；条目把当前系统标为不支持
 */
export type Unavailable = { kind: 'no-host' } | { kind: 'hosts' } | { kind: 'global-only' } | { kind: 'os'; os: ToolOs };

/** 一张列表里各个组件的状态：前三样每个所选的宿主一个（与 hosts 一一对应），工具只有一个，与宿主无关。不可选的另带原因 */
export interface ListingStatus {
  skills: { skill: Skill; statuses: SkillStatus[]; unavailable?: Unavailable }[];
  thirdParty: { entry: ThirdPartySkill; statuses: ThirdPartyStatus[]; unavailable?: Unavailable }[];
  mcps: { mcp: Mcp; statuses: McpStatus[]; unavailable?: Unavailable }[];
  tools: { tool: Tool; status: ToolStatus; unavailable?: Unavailable }[];
}

/**
 * 列表里 MCP 那几栏要另作说明的宿主：globalOnly 是选了项目范围而 MCP 只能装到全局的（列表里至少有一个条目本身支持它），
 * unreadable 是配置读不到的。mcps 是 listingStatus 给出的那一段，与 hosts 一一对应
 */
export function mcpColumnHosts(hosts: readonly Host[], mcps: ListingStatus['mcps']): { globalOnly: Host[]; unreadable: Host[] } {
  const withStatus = (wanted: McpStatus): Host[] => hosts.filter((_, column) => mcps.some(({ statuses }) => statuses[column] === wanted));
  return { globalOnly: withStatus('global-only'), unreadable: withStatus('unknown') };
}

/** 这个宿主按安装范围定的那个 skill 目录：状态、位置、安装、复核都从它来 */
export const skillsDirOf = (host: Host, scope: Scope): string => (scope === 'project' ? host.projectSkillsDir : host.skillsDir);

/** 工具装不了的原因：先看有没有宿主，再看系统，再看它要的宿主。看的是检测到的宿主，不看选了哪些 */
export function toolUnavailable(machine: Machine, tool: Tool): Unavailable | undefined {
  const detected = machine.hosts.filter((host) => host.detected);
  if (detected.length === 0) return { kind: 'no-host' };
  const command = installCommand(tool, machine.platform);
  if ('unsupported' in command) return { kind: 'os', os: command.unsupported };
  return tool.hosts && !detected.some((host) => tool.hosts?.includes(host.id)) ? { kind: 'hosts' } : undefined;
}

/**
 * 现探测 listing 里的每个组件。hosts 是这一轮要装进的宿主，是空的时 skill、第三方 Skill 和 MCP 都不可选；
 * scope 是安装范围：skill 和第三方 Skill 看哪个目录、MCP 看哪份配置都按它来，工具不受它影响
 */
export function listingStatus(
  machine: Machine,
  listing: Pick<Listing, 'skills' | 'thirdParty' | 'mcps' | 'tools'>,
  hosts: readonly Host[],
  scope: Scope,
): ListingStatus {
  // 一个宿主都没有的原因排在别的原因前面：下面每一行里它都展开在最后，盖住前面的
  const hostless: { unavailable?: Unavailable } = hosts.length === 0 ? { unavailable: { kind: 'no-host' } } : {};
  const statuses = mcpStatuses(listing.mcps, hosts, scope);
  return {
    skills: listing.skills.map((skill) => ({ skill, statuses: hosts.map((host) => skillStatus(skill, skillsDirOf(host, scope))), ...hostless })),
    thirdParty: listing.thirdParty.map((entry) => {
      const row = hosts.map((host) => thirdPartyStatus(entry, host, skillsDirOf(host, scope)));
      const unsupported: { unavailable?: Unavailable } = row.every((status) => status === 'unsupported') ? { unavailable: { kind: 'hosts' } } : {};
      return { entry, statuses: row, ...unsupported, ...hostless };
    }),
    mcps: listing.mcps.map((mcp, at) => {
      const row = statuses[at] ?? [];
      // 所选的宿主一个都装不了它：有哪个只是装不到所选的范围，原因就是只能装到全局——换成全局就装得了
      const unsupported: { unavailable?: Unavailable } = row.every((status) => status === 'unsupported' || status === 'no-config' || status === 'global-only')
        ? { unavailable: { kind: row.includes('global-only') ? 'global-only' : 'hosts' } }
        : {};
      return { mcp, statuses: row, ...unsupported, ...hostless };
    }),
    tools: listing.tools.map((tool) => {
      const unavailable = toolUnavailable(machine, tool);
      return { tool, status: toolStatus(tool, machine), ...(unavailable ? { unavailable } : {}) };
    }),
  };
}
