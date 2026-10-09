// 安装工具：执行条目给的官方安装命令，结束后用条目声明的检查方式复核。
import type { Tool, ToolOs } from './catalog.ts';
import { errorCode } from './install-mcp.ts';
import type { CommandRunner } from './installer.ts';

/** 装完一个工具的结论 */
export interface ToolResult {
  /** 复核通过没有：成功与否只看它，不看命令的退出状态 */
  available: boolean;
  /** 命令是怎么结束的；没能起来时 detail 是错误码，错误没带错误码就没有 */
  run: { kind: 'exit'; code: number } | { kind: 'not-started'; detail: string | undefined };
}

// 目录里的系统名各对应哪个平台；别的平台没有自己的名字，只用缺省的命令
const OS_OF_PLATFORM: Partial<Record<NodeJS.Platform, ToolOs>> = { darwin: 'macos', linux: 'linux', win32: 'windows' };

/** 在这个系统上装 tool 要执行的那一行命令：系统另有一条就用它，否则用缺省的；被标为不支持时说是哪个系统。 */
export function installCommand({ install }: Tool, platform: NodeJS.Platform): { command: string } | { unsupported: ToolOs } {
  const os = OS_OF_PLATFORM[platform];
  const command = os === undefined ? undefined : install[os];
  if (os !== undefined && command === null) return { unsupported: os };
  return { command: command ?? install.default };
}

/**
 * 执行 command（就是事先展示给用户确认的那一行），它的输出直接透传到终端上；结束后用 check 复核。
 * 不抛错：命令非零退出、没能起来，都只是结论里的一句话。
 */
export async function installTool(command: string, runCommand: CommandRunner, check: () => boolean): Promise<ToolResult> {
  let run: ToolResult['run'];
  try {
    run = { kind: 'exit', code: (await runCommand(command, [], { shell: true })).exitCode };
  } catch (error) {
    run = { kind: 'not-started', detail: errorCode(error) };
  }
  return { available: check(), run };
}
