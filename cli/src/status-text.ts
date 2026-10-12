// 状态和不可选的原因写成哪个词、是什么含义；本机信息里宿主那一行分成哪几段。两套界面共用：终端界面照含义上样式码，网页界面随画面状态发给页面。
import type { Unavailable } from './availability.ts';
import type { McpStatus } from './mcp-status.ts';
import type { Messages } from './messages.ts';
import type { SkillStatus } from './skill-status.ts';
import type { ThirdPartyStatus } from './third-party-status.ts';
import type { ToolStatus } from './tool-status.ts';

/** 状态的含义：就绪、留意、退后（未装这一类）、不上色 */
export type Tone = 'ready' | 'attention' | 'faint' | 'plain';

export interface StatusText {
  text: string;
  tone: Tone;
  /** 词后面不上色的那一段：版本、装了几个 */
  rest?: string;
}

/** 版本不同时的写法：已装的版本、箭头、清单里的版本 */
export const versionChange = (installed: string, listed: string, arrow: string): string => `${installed} ${arrow} ${listed}`;

/** listed 是清单里的版本；版本不同时不用词，直接写两个版本号，中间是 arrow */
export function skillStatusText(t: Messages, status: SkillStatus, listed: string, arrow: string): StatusText {
  switch (status.kind) {
    case 'none':
      return { text: t.skillStatus.none, tone: 'faint' };
    case 'installed':
      return { text: t.skillStatus.installed, tone: 'ready', rest: status.version };
    case 'other-version':
      return { text: versionChange(status.version, listed, arrow), tone: 'attention' };
    case 'unmanaged':
      return { text: t.skillStatus.unmanaged, tone: 'attention' };
  }
}

/** 只含一个 skill 的写未装、已装，含多个的装了几个就写「已装 几个/共几个」 */
export function thirdPartyStatusText(t: Messages, status: ThirdPartyStatus): StatusText {
  if (status === 'unsupported') return { text: t.mcpStatus.unsupported, tone: 'faint' };
  const installed = status.filter(Boolean).length;
  if (installed === 0) return { text: t.skillStatus.none, tone: 'faint' };
  return { text: t.skillStatus.installed, tone: 'ready', ...(status.length > 1 ? { rest: `${installed}/${status.length}` } : {}) };
}

export function mcpStatusText(t: Messages, status: McpStatus): StatusText {
  switch (status) {
    case 'none':
      return { text: t.mcpStatus.none, tone: 'faint' };
    case 'configured':
      return { text: t.mcpStatus.configured, tone: 'ready' };
    case 'unknown':
      return { text: t.mcpStatus.unknown, tone: 'plain' };
    // 条目不支持这个宿主，或它的 MCP 装不到所选的安装范围：是同一个词。MCP 安装器不装的宿主在列表里不出栏，
    // 界面上写不到它的这个状态，词仍照同一个给
    case 'unsupported':
    case 'no-config':
    case 'global-only':
      return { text: t.mcpStatus.unsupported, tone: 'faint' };
  }
}

export function toolStatusText(t: Messages, status: ToolStatus): StatusText {
  return status === 'installed' ? { text: t.toolStatus.installed, tone: 'ready' } : { text: t.toolStatus.none, tone: 'faint' };
}

/** 不可选的原因写成的那句话 */
export function unavailableReason(t: Messages, unavailable: Unavailable): string {
  switch (unavailable.kind) {
    case 'no-host':
      return t.needsHost;
    case 'hosts':
      return t.unsupportedByHosts;
    case 'global-only':
      return t.mcpGlobalOnly;
    case 'os':
      return t.unsupportedOs(unavailable.os);
  }
}

/** 本机信息里宿主在不在的一段：检测到的一个宿主，或合成一句的那几个没检测到的 */
export interface HostPresence {
  /** 一个宿主的名字；没检测到的那一段是几个名字照界面上的先后、用这种语言并列的写法连起来的（「Codex、Pi、omp」） */
  name: string;
  detected: boolean;
  /** 没检测到的那一段后面只写一次的那个词；检测到的没有 */
  status?: string;
}

/**
 * 本机信息里宿主那一行分成哪几段，照显示的先后：检测到的各一段、排在前面；没检测到的合成一段、排在后面。
 * 全都检测到时没有那一段。两套界面画的是这同一份：终端界面在段与段之间留空、给没检测到的加上短横，网页界面原样放进画面状态
 */
export function hostPresenceTexts(t: Messages, hosts: readonly { name: string; detected: boolean }[]): HostPresence[] {
  const missing = hosts.filter((host) => !host.detected).map((host) => host.name);
  return [
    ...hosts.filter((host) => host.detected).map((host) => ({ name: host.name, detected: true })),
    ...(missing.length > 0 ? [{ name: missing.join(t.listSeparator), detected: false, status: t.notDetected }] : []),
  ];
}
