// 安装第三方 Skill：调用通用的 skill 安装程序（Vercel 的 skills CLI），结束后看目标位置下有没有装出来。
import type { Command, Host } from './hosts.ts';
import { errorCode } from './install-mcp.ts';
import type { CommandRunner } from './installer.ts';

// 钉在实测过的主版本上，不随它的最新版漂移
const SKILLS_CLI = 'skills@1';
// 关掉 skills CLI 的遥测：两个变量它都认
const NO_TELEMETRY = { DISABLE_TELEMETRY: '1', DO_NOT_TRACK: '1' };

/** skills CLI 的一条命令：参数里没有要代入的值，展示的和执行的是同一份 */
export type SkillsCliCommand = Command & { args: string[] };

/** 装完一个第三方 Skill 的结论 */
export interface ThirdPartyResult {
  /** 复核通过没有：成功与否只看它，不看命令的退出状态 */
  installed: boolean;
  /** 命令是怎么结束的；没能起来时 detail 是错误码，错误没带错误码就没有 */
  run: { kind: 'exit'; code: number } | { kind: 'not-started'; detail: string | undefined };
}

/**
 * 把 source（GitHub 上的「所有者/仓库」）里的 skill 这一个装进 host 的全局 skill 目录的命令。
 * 一条命令一个 skill、一个宿主：一次只给一个宿主时落下的是真实目录，各项的结果也互不相干。
 * source 要紧跟 add：--skill 和 --agent 会把后面不以 - 开头的词都收走
 */
export function skillsCliCommand(source: string, skill: string, host: Host): SkillsCliCommand {
  return { command: 'npx', args: ['-y', SKILLS_CLI, 'add', source, '--skill', skill, '--agent', host.skillsCli.agent, '--yes', '--global'] };
}

/**
 * 执行 command（就是事先展示给用户确认的那一条）：不经 shell，它的输出不上屏，也读不到用户的输入；结束后用 check 复核。
 * 不抛错：命令非零退出、没能起来，都只是结论里的一句话。
 */
export async function installThirdPartySkill(
  command: SkillsCliCommand,
  host: Host,
  runCommand: CommandRunner,
  check: () => boolean,
): Promise<ThirdPartyResult> {
  let run: ThirdPartyResult['run'];
  try {
    run = { kind: 'exit', code: (await runCommand(command.command, command.args, { env: { ...NO_TELEMETRY, ...host.skillsCli.env } })).exitCode };
  } catch (error) {
    run = { kind: 'not-started', detail: errorCode(error) };
  }
  return { installed: check(), run };
}
