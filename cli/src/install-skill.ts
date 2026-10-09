// 安装 skill：只认“条目 + 目标目录”，不知道宿主的存在。
import { existsSync, renameSync, rmSync } from 'node:fs';
import { cp, mkdir, mkdtemp, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { UnsafePathError, technicalReason, type PinnedSource, type Skill } from './catalog.ts';

// 安装标记：写在装好的 skill 目录里，说明它是本工具装的。安装器没有任何集中的状态文件
export const MARKER_FILE = '.oxy-tools.json';

export type SkillInstallProblem =
  | { kind: 'no-skill-md' }
  | { kind: 'unsafe-path' }
  | { kind: 'download'; detail: string }
  | { kind: 'write'; detail: string };

export class SkillInstallError extends Error {
  readonly problem: SkillInstallProblem;

  constructor(problem: SkillInstallProblem) {
    super(problem.kind);
    this.name = 'SkillInstallError';
    this.problem = problem;
  }
}

export interface InstallContext {
  source: PinnedSource;
  /** 放下载中的文件的地方 */
  tempDir: string;
  /** 用户按 Ctrl+C 的信号 */
  interrupt: AbortSignal;
}

/**
 * 把 skill 装到 skillsDir 下以它名字命名的目录里，整体替换那里原有的东西。
 * 失败时抛出 SkillInstallError；失败或被中断时目标位置保持原样，不留下临时文件。
 */
export async function installSkill(skill: Skill, skillsDir: string, context: InstallContext): Promise<void> {
  const { source, interrupt } = context;
  const failed = (kind: 'download' | 'write') => (error: unknown): never => {
    throw new SkillInstallError({ kind, detail: technicalReason(error) });
  };
  const target = join(skillsDir, skill.name);
  const work = await mkdtemp(join(context.tempDir, 'oxy-tools-skill-')).catch(failed('write'));
  // 这两个在目标旁边，以点开头，免得被宿主当成 skill
  const staged = join(skillsDir, `.${skill.name}.oxy-tools-new`);
  const displaced = join(skillsDir, `.${skill.name}.oxy-tools-old`);
  const discard = (): void => {
    for (const dir of [work, staged, displaced]) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // 清不掉不算安装失败：目标旁边的那两个，下次安装同一个 skill 时会先清一遍
      }
    }
  };
  // 被中断后进程随即退出，等不到下面的 finally，所以收尾必须是同步的
  interrupt.addEventListener('abort', discard);
  try {
    await source.download(skill.path, work).catch((error: unknown) => {
      if (error instanceof UnsafePathError) throw new SkillInstallError({ kind: 'unsafe-path' });
      return failed('download')(error);
    });
    if (!existsSync(join(work, 'SKILL.md'))) throw new SkillInstallError({ kind: 'no-skill-md' });
    const marker = { name: skill.name, version: skill.version, commit: source.commit, installedAt: new Date().toISOString() };
    await (async () => {
      await writeFile(join(work, MARKER_FILE), `${JSON.stringify(marker, null, 2)}\n`);
      await mkdir(skillsDir, { recursive: true });
      await moveNextTo(work, staged);
      interrupt.throwIfAborted();
      replace(target, staged, displaced);
    })().catch(failed('write'));
  } finally {
    interrupt.removeEventListener('abort', discard);
    discard();
  }
}

// 临时目录可能在另一个文件系统上（Linux 的 /tmp 常是内存盘），那里改名改不过来，只能复制
async function moveNextTo(from: string, to: string): Promise<void> {
  rmSync(to, { recursive: true, force: true });
  try {
    await rename(from, to);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
    await cp(from, to, { recursive: true });
  }
}

// 两次同步的改名之间插不进别的事（包括中断）：先把原有的挪开，再把新的放上去，放不上去就挪回来。
// 改名不跟随符号链接，所以目标是链接时换掉的只是链接本身。
function replace(target: string, staged: string, displaced: string): void {
  rmSync(displaced, { recursive: true, force: true });
  let moved = false;
  try {
    renameSync(target, displaced);
    moved = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  try {
    renameSync(staged, target);
  } catch (error) {
    if (moved) renameSync(displaced, target);
    throw error;
  }
}
