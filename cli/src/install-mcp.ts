// 安装 MCP：把条目写进一个宿主的用户级配置。一律调用宿主自己的命令，不直接改它的配置文件。
import { technicalReason, type Mcp } from './catalog.ts';
import type { Command, Host } from './hosts.ts';
import type { CommandRunner } from './installer.ts';
import type { McpStatus } from './mcp-status.ts';

/** 装一个 MCP 要执行的一条命令 */
export interface McpStep {
  action: 'remove' | 'add';
  command: Command;
  /** 这一步失败了也接着做下一步：状态未知时的移除只是试探，那里可能本来就没有 */
  tolerated: boolean;
}

export interface McpInstallProblem {
  /** 失败的是哪一步 */
  action: 'remove' | 'add';
  /** 命令的退出状态；没能起来时是错误码 */
  cause: { kind: 'exit'; code: number } | { kind: 'not-started'; detail: string };
  /** 添加失败时，移除同名配置的命令是否已经执行成功 */
  removed: boolean;
}

export class McpInstallError extends Error {
  readonly problem: McpInstallProblem;

  constructor(problem: McpInstallProblem) {
    super(`mcp ${problem.action} failed`);
    this.name = 'McpInstallError';
    this.problem = problem;
  }
}

/**
 * 把 mcp 装进 host 要依次执行的命令；status 是它在这个宿主下此刻的状态。
 * 已有同名的先移除再添加。状态未知时也先试着移除：这样不管原先有没有，结局都是目录里的这一份。
 */
export function mcpSteps(mcp: Mcp, host: Host, status: Exclude<McpStatus, 'unsupported'>): McpStep[] {
  return [
    ...(status === 'none' ? [] : [{ action: 'remove' as const, command: host.removeMcp(mcp.name), tolerated: status === 'unknown' }]),
    { action: 'add', command: host.addMcp(mcp), tolerated: false },
  ];
}

/** 依次执行 steps，有一步失败就停下。失败时只抛 McpInstallError。 */
export async function installMcp(steps: readonly McpStep[], runCommand: CommandRunner): Promise<void> {
  let removed = false;
  for (const { action, command, tolerated } of steps) {
    const result = await runCommand(command.command, command.args).catch((error: unknown) => {
      if (tolerated) return undefined;
      throw new McpInstallError({ action, cause: { kind: 'not-started', detail: technicalReason(error) }, removed });
    });
    if (result?.exitCode === 0) removed ||= action === 'remove';
    else if (result && !tolerated) throw new McpInstallError({ action, cause: { kind: 'exit', code: result.exitCode }, removed });
  }
}
