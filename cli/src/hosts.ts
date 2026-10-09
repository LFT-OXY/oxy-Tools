// 宿主适配：宿主在不在、skill 装到哪个目录。
import { accessSync, constants, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import type { Environment } from './ui.ts';

export interface Host {
  /** 界面上显示的名字 */
  name: string;
  detected: boolean;
  /** 用户级的 skill 目录，装在这里对所有项目生效 */
  skillsDir: string;
}

/** Claude Code：以 claude 命令是否可用判断在不在。 */
export function claudeCode(env: Environment, homeDir: string): Host {
  return { name: 'Claude Code', detected: isOnPath('claude', env), skillsDir: join(homeDir, '.claude', 'skills') };
}

// Windows 上可执行文件带扩展名，由 PATHEXT 列出；其他系统没有这个变量，只找原名
function isOnPath(command: string, env: Environment): boolean {
  const extensions = ['', ...(env['PATHEXT'] ?? '').split(';').filter(Boolean)];
  const dirs = (env['PATH'] ?? '').split(delimiter).filter(Boolean);
  return dirs.some((dir) => extensions.some((extension) => isExecutable(join(dir, command + extension))));
}

function isExecutable(file: string): boolean {
  try {
    accessSync(file, constants.X_OK);
    return statSync(file).isFile();
  } catch {
    return false;
  }
}
