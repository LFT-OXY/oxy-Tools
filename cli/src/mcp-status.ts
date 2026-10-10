// 状态探测：一个 MCP 在某个宿主下的现状。只读地看宿主在所选安装范围下的那份配置里有没有同名条目，不执行任何命令。
import type { Mcp } from './catalog.ts';
import { mcpConfigOf, type Host, type Scope } from './hosts.ts';

export type McpStatus =
  | 'none'
  | 'configured'
  /** 宿主的配置读不了或格式不认识，判断不了 */
  | 'unknown'
  /** 这个条目不支持这个宿主 */
  | 'unsupported'
  /** 这个宿主的 MCP 只能装到全局，而这一轮选的是项目 */
  | 'global-only';

/** 装得了的那几种状态 */
export type InstallableMcpStatus = Exclude<McpStatus, 'unsupported' | 'global-only'>;

/**
 * 每个 MCP 在每个宿主下的状态，与 mcps、hosts 一一对应。看的是 scope 这个安装范围下的那份配置：全局是宿主的用户级
 * 配置，项目是它项目范围的那一份。每个宿主的配置只读一次。
 */
export function mcpStatuses(mcps: readonly Mcp[], hosts: readonly Host[], scope: Scope): McpStatus[][] {
  const configs = hosts.map((host) => mcpConfigOf(host, scope));
  const configured = configs.map((config) => config?.configuredMcps());
  return mcps.map((mcp) =>
    hosts.map((host, column) => {
      if (mcp.hosts && !mcp.hosts.includes(host.id)) return 'unsupported';
      if (!configs[column]) return 'global-only';
      const names = configured[column];
      if (!names) return 'unknown';
      return names.has(mcp.name) ? 'configured' : 'none';
    }),
  );
}
