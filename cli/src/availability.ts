// 列表里每个条目在所选宿主和安装范围下的状态、状态分成哪几栏、可不可选与原因。两套界面共用：只探测，不提问、不往终端上打东西。
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

/** 所选的宿主按 skill 目录归的一组：用这个目录的那几个宿主，照界面上的先后。同一个 skill 在这里只有一份 */
export interface SkillGroup {
  skillsDir: string;
  hosts: [Host, ...Host[]];
}

/**
 * 一张列表里各个组件的状态。Skill 和第三方 Skill 一组一个（与 skillColumns 一一对应），MCP 每个装得了 MCP 的宿主一个
 * （与 mcpColumns 一一对应），工具只有一个，与宿主无关。不可选的另带原因
 */
export interface ListingStatus {
  /** Skill 和第三方 Skill 的状态栏：所选的宿主按 skill 目录归的组，一组一栏 */
  skillColumns: SkillGroup[];
  /** MCP 的状态栏：所选的宿主里有 MCP 配置的，一个一栏；MCP 安装器不装的宿主不出栏 */
  mcpColumns: Host[];
  skills: { skill: Skill; statuses: SkillStatus[]; unavailable?: Unavailable }[];
  thirdParty: { entry: ThirdPartySkill; statuses: ThirdPartyStatus[]; unavailable?: Unavailable }[];
  mcps: { mcp: Mcp; statuses: McpStatus[]; unavailable?: Unavailable }[];
  tools: { tool: Tool; status: ToolStatus; unavailable?: Unavailable }[];
}

/**
 * 列表里 MCP 那几栏要另作说明的宿主：globalOnly 是选了项目范围而 MCP 只能装到全局的（列表里至少有一个条目本身支持它），
 * unreadable 是配置读不到的——这两样看的是 listingStatus 给出的 MCP 那几栏；noConfig 是所选的宿主（hosts）里没有 MCP 配置、
 * MCP 安装器不装的（列表里有 MCP 就算，不看条目支不支持它：哪个安装范围、哪个条目都装不进它），它们不出栏
 */
export function mcpColumnHosts(
  hosts: readonly Host[],
  { mcpColumns, mcps }: Pick<ListingStatus, 'mcpColumns' | 'mcps'>,
): { globalOnly: Host[]; noConfig: Host[]; unreadable: Host[] } {
  const withStatus = (wanted: McpStatus): Host[] => mcpColumns.filter((_, column) => mcps.some(({ statuses }) => statuses[column] === wanted));
  return { globalOnly: withStatus('global-only'), noConfig: mcps.length > 0 ? hosts.filter((host) => !host.mcp) : [], unreadable: withStatus('unknown') };
}

/**
 * 列表里要不要那句共用 skill 目录的说明：所选的宿主里有用共用 skill 目录的，而且这张列表里有本仓库的 skill 或
 * 第三方 Skill——装给它的 skill，读这个目录的别的宿主也看得到
 */
export function sharedSkillsNoted(hosts: readonly Host[], listing: Pick<Listing, 'skills' | 'thirdParty'>): boolean {
  return hosts.some((host) => host.sharedSkills) && listing.skills.length + listing.thirdParty.length > 0;
}

/** 这个宿主按安装范围定的那个 skill 目录：状态、位置、安装、复核都从它来 */
const skillsDirOf = (host: Host, scope: Scope): string => (scope === 'project' ? host.projectSkillsDir : host.skillsDir);

/**
 * 所选的宿主按所选安装范围下的 skill 目录归组：目录相同的是一组。组和组里的宿主都照界面上的先后。
 * 算计划和列表的状态用的是这同一种归组
 */
export function skillGroups(hosts: readonly Host[], scope: Scope): SkillGroup[] {
  const groups: SkillGroup[] = [];
  for (const host of hosts) {
    const skillsDir = skillsDirOf(host, scope);
    const group = groups.find((candidate) => candidate.skillsDir === skillsDir);
    if (group) group.hosts.push(host);
    else groups.push({ skillsDir, hosts: [host] });
  }
  return groups;
}

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
 * scope 是安装范围：skill 和第三方 Skill 看哪个目录、MCP 看哪份配置都按它来，工具不受它影响。
 * Skill 和第三方 Skill 的状态按 skill 目录归组，一组一个；MCP 的每个装得了 MCP 的所选宿主一个
 */
export function listingStatus(
  machine: Machine,
  listing: Pick<Listing, 'skills' | 'thirdParty' | 'mcps' | 'tools'>,
  hosts: readonly Host[],
  scope: Scope,
): ListingStatus {
  // 一个宿主都没有的原因排在别的原因前面：下面每一行里它都展开在最后，盖住前面的
  const hostless: { unavailable?: Unavailable } = hosts.length === 0 ? { unavailable: { kind: 'no-host' } } : {};
  const skillColumns = skillGroups(hosts, scope);
  const mcpColumns = hosts.filter((host) => host.mcp);
  const statuses = mcpStatuses(listing.mcps, mcpColumns, scope);
  return {
    skillColumns,
    mcpColumns,
    skills: listing.skills.map((skill) => ({ skill, statuses: skillColumns.map(({ skillsDir }) => skillStatus(skill, skillsDir)), ...hostless })),
    thirdParty: listing.thirdParty.map((entry) => {
      // 一组里有条目支持的宿主就照这个目录写状态，一个都不支持才是不支持
      const row = skillColumns.map(
        ({ skillsDir, hosts: group }): ThirdPartyStatus =>
          group.map((host) => thirdPartyStatus(entry, host, skillsDir)).find((status) => status !== 'unsupported') ?? 'unsupported',
      );
      const unsupported: { unavailable?: Unavailable } = row.every((status) => status === 'unsupported') ? { unavailable: { kind: 'hosts' } } : {};
      return { entry, statuses: row, ...unsupported, ...hostless };
    }),
    mcps: listing.mcps.map((mcp, at) => {
      const row = statuses[at] ?? [];
      // 所选的宿主一个都装不了它（连一栏都没有时也是：所选的都是 MCP 安装器不装的）：有哪个只是装不到所选的范围，
      // 原因就是只能装到全局——换成全局就装得了
      const unsupported: { unavailable?: Unavailable } = row.every((status) => status === 'unsupported' || status === 'global-only')
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
