// 安装 MCP：把条目写进一个宿主的配置（用户级的，或项目范围的）。一律调用宿主自己的命令，不直接改它的配置文件。
import type { Mcp } from './catalog.ts';
import type { Command, McpConfig } from './hosts.ts';
import type { CommandResult, CommandRunner } from './installer.ts';
import type { InstallableMcpStatus } from './mcp-status.ts';

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
  /** 命令的退出状态；没能起来时是错误码，错误没带错误码就没有 */
  cause: { kind: 'exit'; code: number } | { kind: 'not-started'; detail: string | undefined };
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
 * 把 mcp 写进 config 要依次执行的命令；config 是一个宿主在所选安装范围下的那份配置，status 是 mcp 在其中此刻的状态，
 * variables 是要带上的环境变量的名字。
 * 已有同名的先移除再添加。状态未知时也先试着移除：这样不管原先有没有，结局都是目录里的这一份。
 */
export function mcpSteps(mcp: Mcp, config: McpConfig, status: InstallableMcpStatus, variables: readonly string[]): McpStep[] {
  return [
    ...(status === 'none' ? [] : [{ action: 'remove' as const, command: config.removeMcp(mcp.name), tolerated: status === 'unknown' }]),
    { action: 'add', command: config.addMcp(mcp, variables), tolerated: false },
  ];
}

/**
 * 依次执行 steps，有一步失败就停下。失败时只抛 McpInstallError。
 * keys 是「变量名 → 值」：到执行的这一刻才代入命令，除此之外值不去任何地方。
 * cwd 是在哪个目录下运行：那份配置要求的（装到项目时是项目目录），没有就不给。
 */
export async function installMcp(
  steps: readonly McpStep[],
  keys: ReadonlyMap<string, string>,
  runCommand: CommandRunner,
  cwd?: string,
): Promise<void> {
  let removed = false;
  for (const { action, command, tolerated } of steps) {
    const args = command.args.map((arg) => (typeof arg === 'string' ? arg : `${arg.variable}=${keys.get(arg.variable) ?? ''}`));
    let result: CommandResult | undefined;
    // 执行器当场抛出的也在这里接住：漏出去就成了「意外错误」，消息会被原样打出来
    try {
      result = await (cwd === undefined ? runCommand(command.command, args) : runCommand(command.command, args, { cwd }));
    } catch (error) {
      if (!tolerated) throw new McpInstallError({ action, cause: { kind: 'not-started', detail: errorCode(error) }, removed });
    }
    if (result?.exitCode === 0) removed ||= action === 'remove';
    else if (result && !tolerated) throw new McpInstallError({ action, cause: { kind: 'exit', code: result.exitCode }, removed });
  }
}

/** 命令没能起来的原因只取错误码（ENOENT），不取消息：消息里可能带着整条命令，而命令里有 key */
export function errorCode(error: unknown): string | undefined {
  const root = error instanceof Error && error.cause instanceof Error ? error.cause : error;
  const code = root instanceof Error ? (root as NodeJS.ErrnoException).code : undefined;
  return typeof code === 'string' ? code : undefined;
}
