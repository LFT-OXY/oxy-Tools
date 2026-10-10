// 状态探测：一个第三方 Skill 在某个宿主的某个 skill 目录下的现状。只看目标位置下有没有东西，不比较版本，不认安装标记。
import { existsSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import type { ThirdPartySkill } from './catalog.ts';
import type { Host } from './hosts.ts';

/** 这个条目不支持这个宿主；或它的每个 skill 在这个宿主下各自装没装，与 entry.skills 一一对应 */
export type ThirdPartyStatus = 'unsupported' | boolean[];

/** skillsDir 是这个宿主按所选安装范围定的那个 skill 目录 */
export function thirdPartyStatus(entry: ThirdPartySkill, host: Host, skillsDir: string): ThirdPartyStatus {
  if (entry.hosts && !entry.hosts.includes(host.id)) return 'unsupported';
  return entry.skills.map((skill) => isPresent(skillsDir, skill.name));
}

/** 目标位置下有没有叫这个名字的东西：目录、文件、符号链接（指向哪都算）都是「已有」，skills CLI 会把它整个换掉 */
export function isPresent(skillsDir: string, name: string): boolean {
  try {
    lstatSync(join(skillsDir, name));
    return true;
  } catch {
    return false;
  }
}

/** 复核：装上了的 skill，目标位置下它的目录里有 SKILL.md */
export function hasSkillFile(skillsDir: string, name: string): boolean {
  return existsSync(join(skillsDir, name, 'SKILL.md'));
}
