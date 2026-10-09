// 状态探测：一个工具装没装。只照条目声明的检查方式看一眼，不执行任何命令。
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Tool } from './catalog.ts';
import { isOnPath } from './hosts.ts';
import type { Environment } from './ui.ts';

export type ToolStatus = 'none' | 'installed';

/** 检查方式二选一：命令在不在可执行路径上，或主目录下的那个相对路径存不存在。 */
export function toolStatus({ check }: Tool, where: { env: Environment; homeDir: string }): ToolStatus {
  const present = 'command' in check ? isOnPath(check.command, where.env) : existsSync(join(where.homeDir, ...check.path.split('/')));
  return present ? 'installed' : 'none';
}
