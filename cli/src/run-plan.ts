// 执行：照计划逐项去装，每一项的开始、结局、跳过都报给进度的接收方。两套界面共用：不提问，自己不往终端上打东西。
import type { Machine } from './availability.ts';
import { CatalogError, type CatalogSource, type PinnedSource } from './catalog.ts';
import { McpInstallError, installMcp, type McpInstallProblem } from './install-mcp.ts';
import { SkillInstallError, installSkill, type SkillInstallProblem } from './install-skill.ts';
import { installThirdPartySkill, type ThirdPartyResult } from './install-third-party.ts';
import { installTool, type ToolResult } from './install-tool.ts';
import type { CommandRunner } from './installer.ts';
import type { Failure } from './messages.ts';
import type { InstallTarget, McpTarget, Plan, ThirdPartyTarget, ToolTarget } from './plan.ts';
import { hasSkillFile } from './third-party-status.ts';
import { toolStatus } from './tool-status.ts';

export type InstallOutcome = { ok: true; version: string } | { ok: false; problem: SkillInstallProblem };
export type McpOutcome = { ok: true } | { ok: false; problem: McpInstallProblem };

/** 执行要的东西：本机的事实之外，是入口交进来的外部依赖和这次运行里记着的东西 */
export interface Runtime extends Machine {
  source: CatalogSource;
  tempDir: string;
  githubToken: string | undefined;
  /** 用户在提问之外按 Ctrl+C 的信号 */
  interrupt: AbortSignal;
  runCommand: CommandRunner;
  /** 钉住的来源：一次运行里只查询一次，之后安装的每个 skill 共用 */
  pinned?: PinnedSource;
  /**
   * 用户这次运行里填过的 key：MCP 的名字 → 变量名 → 值。
   * 只留在内存里，只交给安装动作；不进计划、不进进度的报告，不写任何文件
   */
  keys: Map<string, Map<string, string>>;
}

/**
 * 进度的接收方。要下载本仓库的 skill 时先向 GitHub 查询钉住的来源：查询期间是 loading，查不到就 failure 说明原因，
 * 这一批的 skill 都不装、也不在 installation 里。installation 收下这一批要装的各项（照执行的先后），之后每一项
 * 先 begin，用它返回的函数交出结局（不给结局表示这一项被打断了）；不装的那些不 begin，改用 skip；全部结束后 finish
 */
export interface Progress {
  loading(what: 'skillFiles'): { done(): void };
  failure(failure: Failure): void;
  installation(
    skills: readonly InstallTarget[],
    thirdParty: readonly ThirdPartyTarget[],
    mcps: readonly McpTarget[],
    tools: readonly ToolTarget[],
  ): {
    skill: { begin(target: InstallTarget): (outcome?: InstallOutcome) => void; skip(target: InstallTarget): void };
    thirdParty: { begin(target: ThirdPartyTarget): (result: ThirdPartyResult) => void; skip(target: ThirdPartyTarget): void };
    mcp: { begin(target: McpTarget): (outcome?: McpOutcome) => void; skip(target: McpTarget, missingVariable: string): void };
    tool: { begin(target: ToolTarget): (result: ToolResult) => void };
    finish(): void;
  };
}

/** 执行被用户在提问之外按的 Ctrl+C 打断 */
export class Interrupted extends Error {
  constructor() {
    super('interrupted');
    this.name = 'Interrupted';
  }
}

/** 意料之外的错写成出错说明：只取消息的第一行（后面可能跟着堆栈），消息为空时退而用错误的类型名 */
export function unexpected(error: unknown): Failure {
  return { kind: 'unexpected', detail: error instanceof Error ? error.message.split('\n')[0] || error.name : String(error) };
}

/**
 * 本仓库的 skill 在前，第三方 Skill 其次，MCP 在后，工具排在最后——它的命令会直接接管终端的输入输出。
 * 一项失败不影响其余项
 */
export async function runPlan(runtime: Runtime, { jobs, thirdPartyJobs, mcpJobs, toolJobs }: Plan, report: Progress): Promise<void> {
  const { interrupt } = runtime;
  // 全都没同意覆盖时没有要下载的，不必查询
  const source = jobs.every((job) => job.declined) ? undefined : await pinSource(runtime, report);
  // 查询失败时出错说明已经给了：skill 一个都不装，结果里也没有它们
  const skillJobs = !source && jobs.some((job) => !job.declined) ? [] : jobs;
  if (skillJobs.length + thirdPartyJobs.length + mcpJobs.length + toolJobs.length === 0) return;
  const progress = report.installation(
    skillJobs.map((job) => job.target),
    thirdPartyJobs.map((job) => job.target),
    mcpJobs.map((job) => job.target),
    toolJobs.map((job) => job.target),
  );
  for (const { skill, skillsDir, target, declined } of skillJobs) {
    if (declined || !source) {
      progress.skill.skip(target);
      continue;
    }
    const settle = progress.skill.begin(target);
    let outcome: InstallOutcome;
    try {
      await installSkill(skill, skillsDir, { source, tempDir: runtime.tempDir, interrupt });
      outcome = { ok: true, version: skill.version };
    } catch (error) {
      if (interrupt.aborted || !(error instanceof SkillInstallError)) {
        settle();
        throw interrupt.aborted ? new Interrupted() : error;
      }
      outcome = { ok: false, problem: error.problem };
    }
    settle(outcome);
  }
  for (const { skill, host, skillsDir, target, command, cwd, declined } of thirdPartyJobs) {
    if (declined) {
      progress.thirdParty.skip(target);
      continue;
    }
    const settle = progress.thirdParty.begin(target);
    // 成功与否看复核，不看命令的退出状态
    settle(await installThirdPartySkill(command, host, runtime.runCommand, () => hasSkillFile(skillsDir, skill), cwd));
  }
  for (const { mcp, config, target, steps, missingVariable } of mcpJobs) {
    if (missingVariable !== undefined) {
      progress.mcp.skip(target, missingVariable);
      continue;
    }
    const settle = progress.mcp.begin(target);
    let outcome: McpOutcome;
    try {
      await installMcp(steps, runtime.keys.get(mcp.name) ?? new Map(), runtime.runCommand, config.cwd);
      outcome = { ok: true };
    } catch (error) {
      if (!(error instanceof McpInstallError)) {
        settle();
        throw error;
      }
      outcome = { ok: false, problem: error.problem };
    }
    settle(outcome);
  }
  for (const { tool, target } of toolJobs) {
    const settle = progress.tool.begin(target);
    // 成功与否看复核，不看命令的退出状态
    settle(await installTool(target.command, runtime.runCommand, () => toolStatus(tool, runtime) === 'installed'));
  }
  progress.finish();
}

// 查询失败时说明原因，返回 undefined；安装器不因此退出
async function pinSource(runtime: Runtime, report: Progress): Promise<PinnedSource | undefined> {
  if (runtime.pinned) return runtime.pinned;
  const { interrupt } = runtime;
  const loading = report.loading('skillFiles');
  try {
    runtime.pinned = await runtime.source
      .pin({ token: runtime.githubToken, signal: interrupt })
      .finally(() => loading.done());
    return runtime.pinned;
  } catch (error) {
    if (interrupt.aborted) throw new Interrupted();
    if (!(error instanceof CatalogError)) throw error;
    report.failure(error.failure);
    return undefined;
  }
}
