// 宿主适配：宿主在不在、skill 装到哪个目录、怎么拼出添加和移除 MCP 的命令、去哪看某个 MCP 是否已配置。
import { accessSync, constants, readFileSync, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { parse as parseToml } from 'smol-toml';
import { isRecord, type Mcp } from './catalog.ts';
import type { Environment } from './ui.ts';

/** 一条外部命令：不经过 shell，args 的每一项原样是一个参数 */
export interface Command {
  command: string;
  args: string[];
}

export interface Host {
  /** 目录里指代这个宿主的名字（MCP 条目的 hosts） */
  id: string;
  /** 界面上显示的名字 */
  name: string;
  detected: boolean;
  /** 用户级的 skill 目录，装在这里对所有项目生效 */
  skillsDir: string;
  /** 用户级配置里已有的 MCP 的名字，只读地看一眼配置文件；读不了或格式不认识时是 undefined */
  configuredMcps(): ReadonlySet<string> | undefined;
  /** 把一个 MCP 写进用户级配置的命令：宿主自己的添加命令 */
  addMcp(mcp: Mcp): Command;
  /** 从用户级配置里移除一个 MCP 的命令 */
  removeMcp(name: string): Command;
  /**
   * 有它表示：这个宿主的添加命令遇到远程地址的 MCP，可能当场打开浏览器登录并等登录完成才结束。
   * 值是事后补登录的命令，后面跟 MCP 的名字
   */
  remoteMcpLogin?: Command;
}

/** 一个宿主的适配：每个宿主回答同样的问题。 */
type HostAdapter = (env: Environment, homeDir: string) => Host;

/**
 * Claude Code：以 claude 命令是否可用判断在不在。用户级的 MCP 记在配置目录的 .claude.json 顶层的 mcpServers 里，
 * 配置目录缺省是主目录，可由 CLAUDE_CONFIG_DIR 改到别处；添加和移除都指定用户级范围。
 * 本地进程的启动命令在各系统上原样交给它：原生 Windows 上也不包 cmd /c（2.1.119 起它自己起得来 npx 这类 .cmd）。
 */
const claudeCode: HostAdapter = (env, homeDir) => ({
  id: 'claude-code',
  name: 'Claude Code',
  detected: isOnPath('claude', env),
  skillsDir: join(homeDir, '.claude', 'skills'),
  configuredMcps: () => namesIn(join(env['CLAUDE_CONFIG_DIR'] || homeDir, '.claude.json'), JSON.parse, 'mcpServers'),
  addMcp: ({ name, server }) => ({
    command: 'claude',
    args: [
      'mcp',
      'add',
      '--scope',
      'user',
      ...('url' in server ? ['--transport', 'http', name, server.url] : [name, '--', server.command, ...server.args]),
    ],
  }),
  removeMcp: (name) => ({ command: 'claude', args: ['mcp', 'remove', '--scope', 'user', name] }),
});

/**
 * Codex：以 codex 命令是否可用判断在不在。它自己的 .codex/skills 已被标为废弃，skill 装到 .agents/skills。
 * 用户级的 MCP 记在 config.toml 的 mcp_servers 表里，这个文件缺省在主目录的 .codex 下，可由 CODEX_HOME 改到别处；
 * 它的添加和移除命令只管用户级配置，没有范围可选。远程地址的服务器支持 OAuth 时，添加命令写完配置会接着走浏览器登录。
 */
const codex: HostAdapter = (env, homeDir) => ({
  id: 'codex',
  name: 'Codex',
  detected: isOnPath('codex', env),
  skillsDir: join(homeDir, '.agents', 'skills'),
  configuredMcps: () => namesIn(join(env['CODEX_HOME'] || join(homeDir, '.codex'), 'config.toml'), parseToml, 'mcp_servers'),
  addMcp: ({ name, server }) => ({
    command: 'codex',
    args: ['mcp', 'add', name, ...('url' in server ? ['--url', server.url] : ['--', server.command, ...server.args])],
  }),
  removeMcp: (name) => ({ command: 'codex', args: ['mcp', 'remove', name] }),
  remoteMcpLogin: { command: 'codex', args: ['mcp', 'login'] },
});

// 顺序就是界面上的顺序；加一个宿主就在这里追加一份适配
const ADAPTERS: readonly HostAdapter[] = [claudeCode, codex];

/** 安装器认识的全部宿主，各自在不在。 */
export function detectHosts(env: Environment, homeDir: string): Host[] {
  return ADAPTERS.map((adapter) => adapter(env, homeDir));
}

// 配置文件里 table 这张表下有哪些名字。文件不存在就是一个都没有（宿主还没写过配置）；
// 读不了、解析不了、或那里不是一张表，都返回 undefined
function namesIn(file: string, parse: (text: string) => unknown, table: string): ReadonlySet<string> | undefined {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT' ? new Set() : undefined;
  }
  try {
    const config = parse(text);
    if (!isRecord(config)) return undefined;
    const entries = config[table] ?? {};
    return isRecord(entries) ? new Set(Object.keys(entries)) : undefined;
  } catch {
    return undefined;
  }
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
