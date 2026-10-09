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

/** 一个宿主的适配：每个宿主回答同样的问题。 */
type HostAdapter = (env: Environment, homeDir: string) => Host;

/** Claude Code：以 claude 命令是否可用判断在不在。 */
const claudeCode: HostAdapter = (env, homeDir) => ({
  name: 'Claude Code',
  detected: isOnPath('claude', env),
  skillsDir: join(homeDir, '.claude', 'skills'),
});

/** Codex：以 codex 命令是否可用判断在不在。它自己的 .codex/skills 已被标为废弃，装到 .agents/skills。 */
const codex: HostAdapter = (env, homeDir) => ({
  name: 'Codex',
  detected: isOnPath('codex', env),
  skillsDir: join(homeDir, '.agents', 'skills'),
});

// 顺序就是界面上的顺序；加一个宿主就在这里追加一份适配
const ADAPTERS: readonly HostAdapter[] = [claudeCode, codex];

/** 安装器认识的全部宿主，各自在不在。 */
export function detectHosts(env: Environment, homeDir: string): Host[] {
  return ADAPTERS.map((adapter) => adapter(env, homeDir));
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
