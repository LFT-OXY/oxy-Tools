// 宿主适配：宿主在不在、skill 装到哪个目录、通用的 skill 安装程序怎么称呼它、怎么拼出添加和移除 MCP 的命令、去哪看某个 MCP 是否已配置；
// 后两问全局和项目范围各答一遍——宿主也可以没有 MCP 配置，那就是它的 MCP 安装器不装。
import { accessSync, constants, readFileSync, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { parse as parseToml } from 'smol-toml';
import { isRecord, type Mcp } from './catalog.ts';

/** 环境变量：入口收到的那一份，不直接读 process.env */
export type Environment = Readonly<Record<string, string | undefined>>;

/** 安装范围：全局，或项目（运行安装器时所在的目录）。工具没有安装范围 */
export type Scope = 'global' | 'project';

/** 命令里带着 key 的一个参数：执行时是「变量名=值」，给用户看时值的位置是占位符 */
export interface KeyArgument {
  variable: string;
}

/** 一条外部命令：不经过 shell，args 的每一项原样是一个参数 */
export interface Command {
  command: string;
  args: (string | KeyArgument)[];
}

/** 一个宿主在某个安装范围下的 MCP 配置：去哪看已经配了哪些、用哪条命令添加和移除 */
export interface McpConfig {
  /** 这份配置里已有的 MCP 的名字，只读地看一眼配置文件；读不了或格式不认识时是 undefined */
  configuredMcps(): ReadonlySet<string> | undefined;
  /** 把一个 MCP 写进这份配置的命令：宿主自己的添加命令。variables 是要带上的环境变量的名字 */
  addMcp(mcp: Mcp, variables: readonly string[]): Command;
  /** 从这份配置里移除一个 MCP 的命令 */
  removeMcp(name: string): Command;
  /** 添加和移除命令要在哪个目录下运行；没有就是在哪都一样 */
  cwd?: string;
}

/** 项目范围的 MCP 配置：写在项目目录里，只对这个项目生效 */
export interface ProjectMcpConfig extends McpConfig {
  /** 配置文件，相对项目目录的写法：带 key 的 MCP 的值会以明文写进它 */
  file: string;
  /** 宿主把配置写进它的运行目录，所以命令要在项目目录下运行 */
  cwd: string;
  /** 有它表示：写进去的 MCP 要用户在宿主里批准之后才启用。值是启动宿主的命令，启动时它会问 */
  approval?: string;
}

export interface Host {
  /** 目录里指代这个宿主的名字（MCP 条目的 hosts） */
  id: string;
  /** 界面上显示的名字 */
  name: string;
  detected: boolean;
  /** 用户级的 skill 目录，装在这里对所有项目生效 */
  skillsDir: string;
  /** 项目范围的 skill 目录：项目目录下的那一个，装在这里只对这个项目生效 */
  projectSkillsDir: string;
  /**
   * 第三方 Skill 经通用的 skill 安装程序（skills CLI）装进这个宿主时：agent 是它那边指代这个宿主的名字，
   * env 是要另外带上的环境变量——带上了它才把全局的 skill 装到 skillsDir
   */
  skillsCli: { agent: string; env: Readonly<Record<string, string>> };
  /** 用户级的 MCP 配置，装在那里对所有项目生效；没有它表示这个宿主的 MCP 安装器不装 */
  mcp?: McpConfig;
  /** 项目范围的 MCP 配置；有 mcp 而没有它表示这个宿主的 MCP 只能装到全局 */
  projectMcp?: ProjectMcpConfig;
  /**
   * 有它表示：这个宿主的添加命令遇到远程地址的 MCP，可能当场打开浏览器登录并等登录完成才结束。
   * 值是事后补登录的命令，后面跟 MCP 的名字
   */
  remoteMcpLogin?: Command;
}

/** 一个宿主的适配：每个宿主回答同样的问题。 */
type HostAdapter = (env: Environment, homeDir: string, projectDir: string) => Host;

/**
 * Claude Code：以 claude 命令是否可用判断在不在。用户级的 MCP 记在配置目录的 .claude.json 顶层的 mcpServers 里，
 * 配置目录缺省是主目录，可由 CLAUDE_CONFIG_DIR 改到别处；添加和移除都指定用户级范围。
 * 项目范围的记在项目目录的 .mcp.json 里：添加和移除指定项目范围，它就把配置写进运行目录的这个文件；
 * 写进去的要用户在这个目录下启动它并批准之后才启用。
 * 本地进程的启动命令在各系统上原样交给它：原生 Windows 上也不包 cmd /c（2.1.119 起它自己起得来 npx 这类 .cmd）。
 */
const claudeCode: HostAdapter = (env, homeDir, projectDir) => ({
  id: 'claude-code',
  name: 'Claude Code',
  detected: isOnPath('claude', env),
  skillsDir: join(homeDir, '.claude', 'skills'),
  projectSkillsDir: join(projectDir, '.claude', 'skills'),
  // skills CLI 认 CLAUDE_CONFIG_DIR（装到它下面的 skills），本安装器的 skill 目录不认：清空它，两边才是同一个目录
  skillsCli: { agent: 'claude-code', env: { CLAUDE_CONFIG_DIR: '' } },
  mcp: {
    configuredMcps: () => namesIn(join(env['CLAUDE_CONFIG_DIR'] || homeDir, '.claude.json'), JSON.parse, 'mcpServers'),
    ...claudeMcpCommands('user'),
  },
  projectMcp: {
    file: CLAUDE_PROJECT_MCP_FILE,
    cwd: projectDir,
    approval: 'claude',
    configuredMcps: () => namesIn(join(projectDir, CLAUDE_PROJECT_MCP_FILE), JSON.parse, 'mcpServers'),
    ...claudeMcpCommands('project'),
  },
});

// Claude Code 项目范围的 MCP 配置文件：在项目目录的最上层
const CLAUDE_PROJECT_MCP_FILE = '.mcp.json';

// Claude Code 在它自己的 claudeScope 这个范围下添加和移除 MCP 的命令：两个范围只差这一个词
function claudeMcpCommands(claudeScope: 'user' | 'project'): Pick<McpConfig, 'addMcp' | 'removeMcp'> {
  return {
    // 环境变量要跟在名字后面：-e 能连收几个值，放在名字前面会把名字也收进去
    addMcp: ({ name, server }, variables) => ({
      command: 'claude',
      args: [
        'mcp',
        'add',
        '--scope',
        claudeScope,
        ...('url' in server
          ? ['--transport', 'http', name, server.url]
          : [name, ...variables.flatMap((variable) => ['-e', { variable }]), '--', server.command, ...server.args]),
      ],
    }),
    removeMcp: (name) => ({ command: 'claude', args: ['mcp', 'remove', '--scope', claudeScope, name] }),
  };
}

/**
 * Codex：以 codex 命令是否可用判断在不在。它自己的 .codex/skills 已被标为废弃，skill 装到 .agents/skills。
 * 用户级的 MCP 记在 config.toml 的 mcp_servers 表里，这个文件缺省在主目录的 .codex 下，可由 CODEX_HOME 改到别处；
 * 它的添加和移除命令只管用户级配置，没有范围可选：项目目录里那份 .codex/config.toml 它读（只对受信任的项目），
 * 却没有往里写的命令，所以它的 MCP 只能装到全局。远程地址的服务器支持 OAuth 时，添加命令写完配置会接着走浏览器登录。
 */
const codex: HostAdapter = (env, homeDir, projectDir) => ({
  id: 'codex',
  name: 'Codex',
  detected: isOnPath('codex', env),
  skillsDir: join(homeDir, '.agents', 'skills'),
  projectSkillsDir: join(projectDir, '.agents', 'skills'),
  skillsCli: { agent: 'codex', env: {} },
  mcp: {
    configuredMcps: () => namesIn(join(env['CODEX_HOME'] || join(homeDir, '.codex'), 'config.toml'), parseToml, 'mcp_servers'),
    addMcp: ({ name, server }, variables) => ({
      command: 'codex',
      args: [
        'mcp',
        'add',
        name,
        ...('url' in server
          ? ['--url', server.url]
          : [...variables.flatMap((variable) => ['--env', { variable }]), '--', server.command, ...server.args]),
      ],
    }),
    removeMcp: (name) => ({ command: 'codex', args: ['mcp', 'remove', name] }),
  },
  remoteMcpLogin: { command: 'codex', args: ['mcp', 'login'] },
});

/**
 * Pi：以 pi 命令是否可用判断在不在。skill 装进共用 skill 目录（.agents/skills，Codex 已经在用的那一个），不用它自己的
 * ~/.pi/agent/skills：skills CLI 给它只装到这里，本仓库的 skill 和第三方 Skill 才在同一处（ADR-0005）。
 * 它的 MCP 安装器还不装：没有 mcp。
 */
const pi: HostAdapter = (env, homeDir, projectDir) => ({
  id: 'pi',
  name: 'Pi',
  detected: isOnPath('pi', env),
  skillsDir: join(homeDir, '.agents', 'skills'),
  projectSkillsDir: join(projectDir, '.agents', 'skills'),
  skillsCli: { agent: 'pi', env: {} },
});

/**
 * host 在 scope 这个安装范围下的 MCP 配置：全局是它的用户级配置，项目是它项目范围的那一份——没有就是装不到这个范围；
 * 没有 MCP 配置的宿主两个范围都没有
 */
export function mcpConfigOf(host: Host, scope: Scope): McpConfig | undefined {
  return scope === 'project' ? host.projectMcp : host.mcp;
}

// 顺序就是界面上的顺序；加一个宿主就在这里追加一份适配
const ADAPTERS: readonly HostAdapter[] = [claudeCode, codex, pi];

/** 安装器认识的全部宿主，各自在不在。 */
export function detectHosts(env: Environment, homeDir: string, projectDir: string): Host[] {
  return ADAPTERS.map((adapter) => adapter(env, homeDir, projectDir));
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

/** 命令在不在可执行路径上。Windows 上可执行文件带扩展名，由 PATHEXT 列出；其他系统没有这个变量，只找原名 */
export function isOnPath(command: string, env: Environment): boolean {
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
