// 状态探测：一个 skill 在某个 skill 目录下的现状。只看目标目录此刻的样子，不依赖任何集中的状态文件。
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isText, type Skill } from './catalog.ts';
import { MARKER_FILE } from './install-skill.ts';

export type SkillStatus =
  | { kind: 'none' }
  /** 本工具装的，版本与清单一致 */
  | { kind: 'installed'; version: string }
  /** 本工具装的，version 是已装的版本，与清单的不同（更旧或更新都算） */
  | { kind: 'other-version'; version: string }
  /** 已存在但不是本工具装的：没有安装标记，或是一个符号链接 */
  | { kind: 'unmanaged' };

export function skillStatus(skill: Skill, skillsDir: string): SkillStatus {
  const target = join(skillsDir, skill.name);
  try {
    // 不跟随链接：链接指向的目录里即使有安装标记，链接本身也不是本工具放的
    if (lstatSync(target).isSymbolicLink()) return { kind: 'unmanaged' };
  } catch {
    return { kind: 'none' };
  }
  const version = markedVersion(target);
  if (version === undefined) return { kind: 'unmanaged' };
  return { kind: version === skill.version ? 'installed' : 'other-version', version };
}

// 标记读不出版本时当作没有标记：宁可多问一次要不要覆盖。版本会打到终端上，和目录里的文字守同一条规矩
function markedVersion(target: string): string | undefined {
  try {
    const marker: unknown = JSON.parse(readFileSync(join(target, MARKER_FILE), 'utf8'));
    const version = typeof marker === 'object' && marker !== null ? (marker as { version?: unknown }).version : undefined;
    return isText(version) ? version : undefined;
  } catch {
    return undefined;
  }
}
