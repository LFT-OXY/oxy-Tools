// 状态探测：一个 MCP 在某个宿主下的现状。只读地看宿主的用户级配置里有没有同名条目，不执行任何命令。
import type { Mcp } from './catalog.ts';
import type { Host } from './hosts.ts';

export type McpStatus =
  | 'none'
  | 'configured'
  /** 宿主的配置读不了或格式不认识，判断不了 */
  | 'unknown'
  /** 这个条目不支持这个宿主 */
  | 'unsupported';

/** 每个 MCP 在每个宿主下的状态，与 mcps、hosts 一一对应。每个宿主的配置只读一次。 */
export function mcpStatuses(mcps: readonly Mcp[], hosts: readonly Host[]): McpStatus[][] {
  const configured = hosts.map((host) => host.configuredMcps());
  return mcps.map((mcp) =>
    hosts.map((host, column) => {
      if (mcp.hosts && !mcp.hosts.includes(host.id)) return 'unsupported';
      const names = configured[column];
      if (!names) return 'unknown';
      return names.has(mcp.name) ? 'configured' : 'none';
    }),
  );
}
