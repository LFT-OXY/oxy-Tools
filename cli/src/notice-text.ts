// 汇总后面的提醒写成哪几句、什么先后，和给用户看的一条完整命令怎么写。两套界面共用：终端界面照样式打出来，网页界面随画面状态发给页面。
import type { Command } from './hosts.ts';
import type { Messages } from './messages.ts';
import type { PlanNotices } from './plan.ts';

type Named = { name: string };

// 展示时不加引号也不会被 shell 另作解释的参数
const PLAIN_ARGUMENT = /^[A-Za-z0-9@%+=:,./_~-]+$/;

/**
 * 给用户看的一条完整命令。参数里有 shell 会另作解释的字符（网址里的 & ? 之类）就加上单引号，照着敲也是同一条命令。
 * key 的位置写成占位符 <变量名>，由 placeholder 上样式；真实的值不到这里来
 */
export function commandLine({ command, args }: Command, placeholder: (text: string) => string = (text) => text): string {
  return [command, ...args]
    .map((arg) => {
      if (typeof arg !== 'string') return `${arg.variable}=${placeholder(`<${arg.variable}>`)}`;
      return PLAIN_ARGUMENT.test(arg) ? arg : `'${arg.replaceAll("'", "'\\''")}'`;
    })
    .join(' ');
}

/**
 * 列表里 MCP 那几栏的说明，各一句，照这个先后：globalOnly 是选了项目范围而 MCP 只能装到全局的宿主，
 * 它们那一栏写着不支持，这里说原因；unreadable 是配置读不到的宿主，它们那一栏都是未知。都没有时是空的
 */
export function mcpColumnNoticeTexts(t: Messages, { globalOnly, unreadable }: { globalOnly: readonly Named[]; unreadable: readonly Named[] }): string[] {
  const names = (hosts: readonly Named[]): string => hosts.map((host) => host.name).join(t.listSeparator);
  return [
    ...(globalOnly.length > 0 ? [t.mcpGlobalOnlyNotice(names(globalOnly))] : []),
    ...(unreadable.length > 0 ? [t.mcpConfigUnreadable(names(unreadable))] : []),
  ];
}

/**
 * 汇总最后要提醒的事，各一句，照这个先后：有覆盖项时本地改动会丢失；这一轮有第三方 Skill 时装的是作者当时的最新版；
 * 命令里 key 的位置是占位符（placeholders 只有终端界面给：它才展示命令）；装到项目的 MCP 带着的 key 会以明文写进项目里的
 * 哪些文件；装到项目的 MCP 写进了哪个文件、要用户在宿主里批准之后才启用；必填的 key 没填、不在这次要装的里面的 MCP；
 * 添加远程地址的 MCP 时可能当场打开浏览器登录的宿主。一件都没有时是空的
 */
export function noticeTexts(t: Messages, { overwrites, thirdParty, plaintextKeys, approvals, missingKeys, logins }: PlanNotices, placeholders = false): string[] {
  return [
    ...(overwrites ? [t.replaceNotice] : []),
    ...(thirdParty ? [t.thirdPartyNotice] : []),
    ...(placeholders ? [t.keyPlaceholderNotice] : []),
    ...(plaintextKeys.variables.length > 0
      ? [t.keyPlaintextNotice(plaintextKeys.variables.join(t.listSeparator), plaintextKeys.files.join(t.listSeparator))]
      : []),
    ...approvals.map(({ host, file, command }) => t.mcpApprovalNotice(host, file, command)),
    ...missingKeys.map(({ mcp, variable }) => t.keyMissingNotice(mcp, variable)),
    ...logins.map(({ host, login }) => t.mcpLoginNotice(host, commandLine(login))),
  ];
}
