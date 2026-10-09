// 目录：读取 skill 清单 index.json 与 catalog.json，校验后合并成统一的条目集合；
// 目录来源也在这里，它还负责把某个 skill 的文件取下来。
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

export interface CatalogSource {
  readonly kind: 'remote' | 'local';
  /** 给用户看的位置：目录根下某个文件的网址或本地路径 */
  locate(file: string): string;
  /** 读取目录根下的一个文本文件；读不到时抛出 */
  readText(file: string): Promise<string>;
  /** 钉住来源此刻的内容，之后下载的每个 skill 都出自这同一份 */
  pin(options: PinOptions): Promise<PinnedSource>;
}

export interface PinOptions {
  /** GitHub 的访问令牌，有就带上 */
  token: string | undefined;
  /** 用户按 Ctrl+C 的信号 */
  signal: AbortSignal;
}

export interface PinnedSource {
  /** 来源提交；本地目录没有 */
  readonly commit: string | null;
  /** 把目录根下 path 这个目录里的全部文件取到 dest（一个已存在的空目录）下 */
  download(path: string, dest: string): Promise<void>;
}

export interface Skill {
  name: string;
  version: string;
  path: string;
  description: { zh: string; en: string };
}

/** 应用项目：安装器装不了，只给说明和官方链接 */
export interface App {
  name: string;
  description: { zh: string; en: string };
  /** 官方链接 */
  url: string;
}

/** MCP 的连接方式，二选一：本地进程（启动命令和参数），或远程地址（一个网址） */
export type McpServer = { command: string; args: string[] } | { url: string };

/** MCP 启动时要带上的一个环境变量，通常是 API key；值由用户在安装时给 */
export interface McpVariable {
  name: string;
  /** 必填的没填就不装这个 MCP；可选的没填就不传 */
  required: boolean;
  description: { zh: string; en: string };
  /** 去哪申请 */
  url: string;
}

export interface Mcp {
  name: string;
  description: { zh: string; en: string };
  /** 官方链接 */
  url: string;
  /** 支持的宿主（Host.id）；省略表示全部支持 */
  hosts?: string[];
  server: McpServer;
  /** 要向用户要的环境变量，没有就是空的；只有本地进程方式才有 */
  env: McpVariable[];
}

/** 安装命令可以按它覆盖的操作系统 */
export type ToolOs = 'macos' | 'linux' | 'windows';

/** 怎么算装好了，二选一：某个命令在不在可执行路径上，或用户主目录下某个相对路径存不存在 */
export type ToolCheck = { command: string } | { path: string };

/** 工具：安装器替用户执行它的官方安装命令，结束后用 check 复核 */
export interface Tool {
  name: string;
  description: { zh: string; en: string };
  /** 官方链接 */
  url: string;
  /** 支持的宿主（Host.id）；省略表示不挑宿主 */
  hosts?: string[];
  /**
   * 安装命令：一整行，交给系统的 shell 去解释（里面可以有管道）。default 是缺省的那一条，
   * 各系统可以另给一条盖过它；给 null 表示这个系统不支持
   */
  install: { default: string } & Partial<Record<ToolOs, string | null>>;
  check: ToolCheck;
}

/** 字段该是什么样的 */
export type FieldRule =
  | 'name'
  | 'text'
  | 'relative-path'
  | 'object'
  | 'https-url'
  | 'host-list'
  | 'mcp-server'
  | 'command-word'
  | 'command-word-list'
  | 'env-list'
  | 'env-name'
  | 'boolean'
  | 'local-only'
  | 'shell-command'
  | 'os-command'
  | 'tool-check'
  | 'command-name';

export type EntryProblem =
  | { kind: 'not-object' }
  | { kind: 'bad-field'; field: string; rule: FieldRule }
  // 与前面的某一条重名
  | { kind: 'duplicate' };

/** 被跳过的一条 */
export interface SkippedEntry {
  /** 所在的目录文件 */
  file: string;
  /** 所在的数组，如 skills */
  list: string;
  /** 是数组里的第几条，从 1 数起 */
  position: number;
  /** 条目的名字；名字本身不合规则时没有 */
  name: string | undefined;
  problem: EntryProblem;
}

export interface Catalog {
  skills: Skill[];
  mcps: Mcp[];
  tools: Tool[];
  apps: App[];
  /** 被跳过的条目：校验不通过的，以及与前面重名的 */
  skipped: SkippedEntry[];
}

/** 出问题的那个目录文件在哪 */
interface FileOrigin {
  /** 文件名 */
  file: string;
  /** 完整的网址或本地路径 */
  where: string;
  local: boolean;
}

export type CatalogFailure =
  | ({ kind: 'catalog-unreadable'; detail: string } & FileOrigin)
  | ({ kind: 'catalog-malformed'; problem: 'not-json' | 'not-object' | 'no-version' } & FileOrigin)
  // field 是本该为数组的那个字段
  | ({ kind: 'catalog-malformed'; problem: 'not-array'; field: string } & FileOrigin)
  | ({ kind: 'catalog-too-new'; found: number; supported: number } & FileOrigin)
  // minutes 是大约多久之后恢复，答复里没说就没有
  | { kind: 'rate-limited'; authenticated: boolean; minutes: number | undefined }
  // where 是查询的网址；badToken 表示带去的访问令牌被拒绝了
  | { kind: 'skill-files-unlisted'; problem: 'unreachable'; detail: string; where: string; badToken: boolean }
  // malformed 是答复读不懂，truncated 是文件列表不全
  | { kind: 'skill-files-unlisted'; problem: 'malformed' | 'truncated'; where: string };

export class CatalogError extends Error {
  readonly failure: CatalogFailure;

  constructor(failure: CatalogFailure) {
    super(failure.kind);
    this.name = 'CatalogError';
    this.failure = failure;
  }
}

/** 来源给出的文件列表里，有路径指向要下载的那个目录之外。 */
export class UnsafePathError extends Error {
  constructor() {
    super('unsafe path');
    this.name = 'UnsafePathError';
  }
}

/** 这一版安装器认识的目录格式版本，index.json 与 catalog.json 共用 */
const SUPPORTED_FORMAT = 1;

const GITHUB_REPO = 'LFT-OXY/oxy-Tools';
const GITHUB_RAW = `https://raw.githubusercontent.com/${GITHUB_REPO}/`;
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/`;
// 两个目录文件读 main 分支上最新的
const CATALOG_ROOT = `${GITHUB_RAW}main/`;
const FETCH_TIMEOUT_MS = 20_000;
// 单个文件可以有十几 MB
const DOWNLOAD_TIMEOUT_MS = 120_000;
const DOWNLOADS_AT_ONCE = 6;

/** 读取并校验目录。整份读不了时抛出 CatalogError；单条条目写坏只跳过那一条。 */
export async function loadCatalog(source: CatalogSource): Promise<Catalog> {
  const [skillList, otherEntries] = await Promise.all([
    readDocument(source, 'index.json'),
    readDocument(source, 'catalog.json'),
  ]);
  const skipped: SkippedEntry[] = [];
  // 逐条读一个数组：写坏的和重名的带着原因进 skipped，其余收下。名字只在各自的数组里唯一
  const collect = <Entry extends { name: string }>(
    document: Document,
    list: string,
    parse: (entry: unknown) => Entry | EntryProblem,
  ): Entry[] => {
    const entries = new Map<string, Entry>();
    for (const [index, entry] of requireArray(document, list).entries()) {
      const skip = (name: string | undefined, problem: EntryProblem): void =>
        void skipped.push({ file: document.file, list, position: index + 1, name, problem });
      const parsed = parse(entry);
      if (isProblem(parsed)) skip(nameOf(entry), parsed);
      // 重名的只留第一条
      else if (entries.has(parsed.name)) skip(parsed.name, { kind: 'duplicate' });
      else entries.set(parsed.name, parsed);
    }
    return [...entries.values()];
  };
  const skills = collect(skillList, 'skills', parseSkill);
  // catalog.json 里的数组可以缺省，缺省当作空
  const optional = <Entry extends { name: string }>(list: string, parse: (entry: unknown) => Entry | EntryProblem): Entry[] =>
    otherEntries.data[list] === undefined ? [] : collect(otherEntries, list, parse);
  const mcps = optional('mcps', parseMcp);
  const tools = optional('tools', parseTool);
  const apps = optional('apps', parseApp);
  return { skills, mcps, tools, apps, skipped };
}

/** 默认的目录来源：GitHub 上本仓库 main 分支的原始文件。 */
export function githubCatalogSource(): CatalogSource {
  return {
    kind: 'remote',
    locate: (file) => CATALOG_ROOT + file,
    async readText(file) {
      // 只走 HTTPS：拒绝一切跳转，免得被带到别的协议或站点
      const response = await fetch(CATALOG_ROOT + file, {
        redirect: 'error',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    },
    pin: pinGitHub,
  };
}

interface TreeFile {
  path: string;
  /** git 的文件模式，100755 是可执行文件 */
  mode: unknown;
}

// 不下载整个仓库：查一次当前提交和它的文件列表，之后每个 skill 只取自己目录下的文件，全部钉在这个提交上
async function pinGitHub({ token, signal }: PinOptions): Promise<PinnedSource> {
  // 查询一次，把答复交给 read 读出想要的东西；read 返回 undefined 或抛出表示答复读不懂
  const query = async <Result>(
    path: string,
    accept: string,
    read: (response: Response) => Promise<Result | undefined>,
  ): Promise<{ result: Result; where: string }> => {
    const where = GITHUB_API + path;
    const unreachable = (detail: string, badToken = false): CatalogError =>
      new CatalogError({ kind: 'skill-files-unlisted', problem: 'unreachable', detail, where, badToken });
    const response = await fetch(where, {
      redirect: 'error',
      headers: { accept, ...(token === undefined ? {} : { authorization: `Bearer ${token}` }) },
      signal: AbortSignal.any([signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]),
    }).catch((error: unknown) => {
      throw unreachable(technicalReason(error));
    });
    const limit = rateLimit(response);
    if (limit) throw new CatalogError({ kind: 'rate-limited', authenticated: token !== undefined, ...limit });
    if (!response.ok) throw unreachable(`HTTP ${response.status}`, response.status === 401 && token !== undefined);
    const result = await read(response).catch(() => undefined);
    if (result === undefined) throw new CatalogError({ kind: 'skill-files-unlisted', problem: 'malformed', where });
    return { result, where };
  };

  // 这个媒体类型只答复提交号，不带整份提交详情
  const { result: commit } = await query('commits/main', 'application/vnd.github.sha', async (response) => {
    const sha = (await response.text()).trim();
    // 提交号接下来要拼进网址里
    return /^[0-9a-f]{40,64}$/.test(sha) ? sha : undefined;
  });
  const { result: listing, where } = await query(`git/trees/${commit}?recursive=1`, 'application/vnd.github+json', async (response) => {
    const body: unknown = await response.json();
    return isRecord(body) && Array.isArray(body['tree']) ? { tree: body['tree'] as unknown[], truncated: body['truncated'] === true } : undefined;
  });
  // 列表不全就不能保证装上的 skill 是完整的
  if (listing.truncated) throw new CatalogError({ kind: 'skill-files-unlisted', problem: 'truncated', where });
  const files = listing.tree.filter(
    (entry): entry is TreeFile => isRecord(entry) && entry['type'] === 'blob' && typeof entry['path'] === 'string',
  );

  return {
    commit,
    async download(path, dest) {
      const root = resolve(dest) + sep;
      const pending = files
        .filter((file) => file.path.startsWith(`${path}/`))
        .map((file) => ({ ...file, target: resolve(dest, ...file.path.slice(path.length + 1).split('/')) }));
      // 文件列表是远程数据：每个文件落地的位置都必须还在 dest 里面
      if (pending.some((file) => !file.target.startsWith(root))) throw new UnsafePathError();
      const stop = new AbortController();
      const failures: unknown[] = [];
      const fetchFile = async (file: (typeof pending)[number]): Promise<void> => {
        const response = await fetch(`${GITHUB_RAW}${commit}/${file.path.split('/').map(encodeURIComponent).join('/')}`, {
          redirect: 'error',
          signal: AbortSignal.any([signal, stop.signal, AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)]),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await mkdir(dirname(file.target), { recursive: true });
        await writeFile(file.target, new Uint8Array(await response.arrayBuffer()), { mode: file.mode === '100755' ? 0o755 : 0o644 });
      };
      // 几个文件同时下；有一个失败就都停下，等全部停稳了再报，免得还有人往 dest 里写
      const worker = async (): Promise<void> => {
        for (let file = pending.shift(); file && failures.length === 0; file = pending.shift()) {
          await fetchFile(file).catch((error: unknown) => {
            failures.push(error);
            stop.abort();
          });
        }
      };
      await Promise.all(Array.from({ length: DOWNLOADS_AT_ONCE }, worker));
      if (failures.length > 0) throw failures[0];
    },
  };
}

/** 本地目录作目录来源，供维护者预览和测试。 */
export function localCatalogSource(dir: string): CatalogSource {
  return {
    kind: 'local',
    locate: (file) => join(dir, file),
    readText: (file) => readFile(join(dir, file), 'utf8'),
    pin: async () => ({ commit: null, download: (path, dest) => cp(join(dir, path), dest, { recursive: true }) }),
  };
}

// 被限流时的答复是 403 或 429：限额用完的带 x-ratelimit-remaining: 0 和恢复的时刻，请求太密的带 retry-after（秒）
function rateLimit(response: Response): { minutes: number | undefined } | undefined {
  if (response.status !== 403 && response.status !== 429) return undefined;
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter === null && response.headers.get('x-ratelimit-remaining') !== '0') return undefined;
  const reset = response.headers.get('x-ratelimit-reset');
  const seconds = retryAfter !== null ? Number(retryAfter) : reset !== null ? Number(reset) - Date.now() / 1000 : NaN;
  return { minutes: Number.isFinite(seconds) ? Math.max(1, Math.ceil(seconds / 60)) : undefined };
}

interface Document extends FileOrigin {
  data: Record<string, unknown>;
}

async function readDocument(source: CatalogSource, file: string): Promise<Document> {
  const origin: FileOrigin = { file, where: source.locate(file), local: source.kind === 'local' };
  let text: string;
  try {
    text = await source.readText(file);
  } catch (error) {
    throw new CatalogError({ kind: 'catalog-unreadable', detail: technicalReason(error), ...origin });
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new CatalogError({ kind: 'catalog-malformed', problem: 'not-json', ...origin });
  }
  if (!isRecord(data)) throw new CatalogError({ kind: 'catalog-malformed', problem: 'not-object', ...origin });
  const { version } = data;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new CatalogError({ kind: 'catalog-malformed', problem: 'no-version', ...origin });
  }
  // 版本更高的格式可能整个换了形状，不尝试解析
  if (version > SUPPORTED_FORMAT) {
    throw new CatalogError({ kind: 'catalog-too-new', found: version, supported: SUPPORTED_FORMAT, ...origin });
  }
  return { data, ...origin };
}

function requireArray({ data, ...origin }: Document, field: string): unknown[] {
  const value = data[field];
  if (!Array.isArray(value)) throw new CatalogError({ kind: 'catalog-malformed', problem: 'not-array', field, ...origin });
  return value;
}

/** 失败的简短技术原因：优先取错误码（ENOTFOUND、ENOENT），网络错误的真正原因在 cause 里 */
export function technicalReason(error: unknown): string {
  const root = error instanceof Error && error.cause instanceof Error ? error.cause : error;
  if (!(root instanceof Error)) return String(root);
  const { code } = root as NodeJS.ErrnoException;
  return typeof code === 'string' ? code : root.message;
}

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PATH_SEGMENT = /^[A-Za-z0-9._-]+$/;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/;

// 链接会被原样打到终端上、再交给系统打开：只接受 https 网址，且只含网址里允许的字符（RFC 3986），
// 别的字符要先做百分号编码。这样里面没有空白、引号、反斜杠和不可见的字符
const HTTPS_URL = /^https:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+$/;

// 启动命令和它的每个参数会原样显示给用户确认、再交给宿主的命令：只收这些字符，
// 所以里面没有空白、引号和任何 shell 会另作解释的字符，看到的就是执行的
const COMMAND_WORD = /^[A-Za-z0-9@:/._=+,~-]+$/;

// 环境变量的名字：它会拼进宿主的命令（名字=值），也会原样打到终端上
const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

// 工具的安装命令是一整行 shell，会原样显示给用户确认、再原样交给 shell：只收看得见的 ASCII 字符，
// 首尾不留空格。这样里面没有换行、控制码和不可见的字符，看到的就是执行的
const SHELL_COMMAND = /^[\x21-\x7e](?:[\x20-\x7e]*[\x21-\x7e])?$/;
const TOOL_OSES: readonly ToolOs[] = ['macos', 'linux', 'windows'];

const bad = (field: string, rule: FieldRule): EntryProblem => ({ kind: 'bad-field', field, rule });
const isProblem = (parsed: object): parsed is EntryProblem => 'kind' in parsed;

// 不认识的字段一律忽略；这一条写坏了就返回头一处问题
function parseSkill(entry: unknown): Skill | EntryProblem {
  if (!isRecord(entry)) return { kind: 'not-object' };
  const { name, version, path } = entry;
  if (!isName(name)) return bad('name', 'name');
  if (!isText(version)) return bad('version', 'text');
  if (!isSafeRelativePath(path)) return bad('path', 'relative-path');
  const description = parseDescription(entry['description']);
  if (isProblem(description)) return description;
  return { name, version, path, description };
}

function parseApp(entry: unknown): App | EntryProblem {
  if (!isRecord(entry)) return { kind: 'not-object' };
  const { name, url } = entry;
  if (!isName(name)) return bad('name', 'name');
  const description = parseDescription(entry['description']);
  if (isProblem(description)) return description;
  if (!isHttpsUrl(url)) return bad('url', 'https-url');
  return { name, description, url };
}

function parseMcp(entry: unknown): Mcp | EntryProblem {
  if (!isRecord(entry)) return { kind: 'not-object' };
  const { name, url, hosts, server } = entry;
  if (!isName(name)) return bad('name', 'name');
  const description = parseDescription(entry['description']);
  if (isProblem(description)) return description;
  if (!isHttpsUrl(url)) return bad('url', 'https-url');
  // 不认识的宿主留着不管：以后加了宿主，旧版安装器照样读得了这一条
  if (hosts !== undefined && !(isList(hosts, isName) && hosts.length > 0)) return bad('hosts', 'host-list');
  const connection = parseMcpServer(server);
  if (isProblem(connection)) return connection;
  const env = parseMcpEnv(entry['env']);
  if (isProblem(env)) return env;
  // 远程地址的服务器不是我们起的进程，没有地方放环境变量；两个宿主的添加命令也都不收
  if ('url' in connection && env.length > 0) return bad('env', 'local-only');
  return { name, description, url, ...(hosts === undefined ? {} : { hosts }), server: connection, env };
}

function parseTool(entry: unknown): Tool | EntryProblem {
  if (!isRecord(entry)) return { kind: 'not-object' };
  const { name, url, hosts } = entry;
  if (!isName(name)) return bad('name', 'name');
  const description = parseDescription(entry['description']);
  if (isProblem(description)) return description;
  if (!isHttpsUrl(url)) return bad('url', 'https-url');
  // 不认识的宿主留着不管，同 MCP
  if (hosts !== undefined && !(isList(hosts, isName) && hosts.length > 0)) return bad('hosts', 'host-list');
  const install = parseToolInstall(entry['install']);
  if (isProblem(install)) return install;
  const check = parseToolCheck(entry['check']);
  if (isProblem(check)) return check;
  return { name, description, url, ...(hosts === undefined ? {} : { hosts }), install, check };
}

function parseToolInstall(install: unknown): Tool['install'] | EntryProblem {
  if (!isRecord(install)) return bad('install', 'object');
  if (!isShellCommand(install['default'])) return bad('install.default', 'shell-command');
  const commands: Tool['install'] = { default: install['default'] };
  for (const os of TOOL_OSES) {
    const command = install[os];
    if (command === undefined) continue;
    if (command !== null && !isShellCommand(command)) return bad(`install.${os}`, 'os-command');
    commands[os] = command;
  }
  return commands;
}

function parseToolCheck(check: unknown): ToolCheck | EntryProblem {
  if (!isRecord(check)) return bad('check', 'object');
  const { command, path } = check;
  // 两种检查方式恰好取一种
  if ((command === undefined) === (path === undefined)) return bad('check', 'tool-check');
  if (command === undefined) return isSafeRelativePath(path) ? { path } : bad('check.path', 'relative-path');
  // 要拿它去可执行路径的各个目录里找，所以只能是一个文件名
  return isSafeRelativePath(command) && !command.includes('/') ? { command } : bad('check.command', 'command-name');
}

// 可以省略，省略当作没有。字段里的下标从 0 数起，和 JSON 里的位置一致
function parseMcpEnv(env: unknown = []): McpVariable[] | EntryProblem {
  if (!Array.isArray(env)) return bad('env', 'env-list');
  const variables: McpVariable[] = [];
  for (const [index, variable] of env.entries()) {
    const field = `env[${index}]`;
    if (!isRecord(variable)) return bad(field, 'object');
    const { name, required, url } = variable;
    if (typeof name !== 'string' || !VARIABLE_NAME.test(name)) return bad(`${field}.name`, 'env-name');
    if (typeof required !== 'boolean') return bad(`${field}.required`, 'boolean');
    const description = parseDescription(variable['description'], `${field}.`);
    if (isProblem(description)) return description;
    if (!isHttpsUrl(url)) return bad(`${field}.url`, 'https-url');
    // 同一个变量只能要一次
    if (variables.some((earlier) => earlier.name === name)) return bad('env', 'env-list');
    variables.push({ name, required, description, url });
  }
  return variables;
}

function parseMcpServer(server: unknown): McpServer | EntryProblem {
  if (!isRecord(server)) return bad('server', 'object');
  const { command, url, args = [] } = server;
  // 两种连接方式恰好取一种
  if ((command === undefined) === (url === undefined)) return bad('server', 'mcp-server');
  if (command === undefined) return isHttpsUrl(url) ? { url } : bad('server.url', 'https-url');
  if (!isCommandWord(command)) return bad('server.command', 'command-word');
  if (!isList(args, isCommandWord)) return bad('server.args', 'command-word-list');
  return { command, args };
}

// 中英文一句话说明，各类条目都有；within 是它所在的字段（MCP 的环境变量也各有一份说明）
function parseDescription(description: unknown, within = ''): { zh: string; en: string } | EntryProblem {
  if (!isRecord(description)) return bad(`${within}description`, 'object');
  const { zh, en } = description;
  if (!isText(zh)) return bad(`${within}description.zh`, 'text');
  if (!isText(en)) return bad(`${within}description.en`, 'text');
  return { zh, en };
}

// 写坏的条目叫什么：名字合规则才认，它接下来要被打到终端上
function nameOf(entry: unknown): string | undefined {
  return isRecord(entry) && isName(entry['name']) ? entry['name'] : undefined;
}

function isName(value: unknown): value is string {
  return typeof value === 'string' && SKILL_NAME.test(value);
}

// 会成为文件系统路径的字段：只接受相对路径，拒绝绝对路径、盘符、`.`、`..` 和空段
function isSafeRelativePath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.split('/').every((segment) => PATH_SEGMENT.test(segment) && segment !== '.' && segment !== '..')
  );
}

function isCommandWord(value: unknown): value is string {
  return typeof value === 'string' && COMMAND_WORD.test(value);
}

function isShellCommand(value: unknown): value is string {
  return typeof value === 'string' && SHELL_COMMAND.test(value);
}

function isList<Item>(value: unknown, isItem: (item: unknown) => item is Item): value is Item[] {
  return Array.isArray(value) && value.every(isItem);
}

function isHttpsUrl(value: unknown): value is string {
  return typeof value === 'string' && HTTPS_URL.test(value) && URL.canParse(value);
}

// 目录是远程数据，会被原样打到终端上，所以文字里不许有控制字符
export function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && !CONTROL_CHARACTER.test(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
