// 上游核对命令（仅供开发）：把目录里登记的每个第三方 Skill 和作者仓库的现状对一遍。只报告，不改任何文件。
// 要联网，结果随上游变，所以不进 CI：npm run check-upstream -- <目录>
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { parseArgs, stripVTControlCharacters } from 'node:util';
import { parse as parseYaml } from 'yaml';
import {
  CatalogError,
  isRecord,
  loadCatalog,
  localCatalogSource,
  rateLimit,
  SKILL_SOURCE,
  technicalReason,
  type ThirdPartySkill,
} from '../src/catalog.ts';
import { MESSAGES } from '../src/messages.ts';

/** 上游的一个仓库：里面每个文件的路径（用 / 分段），和按路径读一个文件 */
interface Repository {
  files: string[];
  read(path: string): Promise<string>;
}

/** 去上游看一个来源的结果；renamedTo 是它现在的「所有者/仓库」 */
type Lookup = { kind: 'missing' } | { kind: 'found'; repository: Repository; archived: boolean; renamedTo: string | undefined };

/** 上游从哪看：GitHub，或本地的一个仓库目录。一时看不了时抛出 Unchecked */
type Upstream = (source: string) => Promise<Lookup>;

/** 没能核对：上游一时看不了。和「对不上」不是一回事，不能报成「上游没有」 */
class Unchecked extends Error {}

const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;

const GITHUB_API = 'https://api.github.com/';
const GITHUB_RAW = 'https://raw.githubusercontent.com/';
const FETCH_TIMEOUT_MS = 20_000;

// 认出一个仓库里有哪些 skill，照抄 skills CLI 1.7.2 的 discoverSkills（发布包的 dist/cli.mjs）：安装器装的时候调的是它，
// 它看不到的装不上，它忽略的 SKILL.md 也不该报成「没登记」。skills CLI 换主版本时下面这些要重新对一遍
// 路径都按小写比，见 discoverSkills
const SKILL_FILE = 'skill.md';
const SKIP_DIRS = ['node_modules', '.git', 'dist', 'build', '__pycache__'];
// 各个 agent 的项目级 skill 目录
const AGENT_SKILL_DIRS = [
  '.agents/skills',
  '.claude/skills',
  '.cline/skills',
  '.codebuddy/skills',
  '.codex/skills',
  '.commandcode/skills',
  '.continue/skills',
  '.factory/skills',
  '.github/skills',
  '.goose/skills',
  '.grok/skills',
  '.iflow/skills',
  '.junie/skills',
  '.kilo/skills',
  '.kilocode/skills',
  '.kimchi/skills',
  '.kiro/skills',
  '.minimax/skills',
  '.mux/skills',
  '.neovate/skills',
  '.opencode/skills',
  '.openhands/skills',
  '.pi/skills',
  '.posit/assistant/skills',
  '.qoder/skills',
  '.roo/skills',
  '.trae/skills',
  '.windsurf/skills',
  '.zcode/skills',
  '.zencoder/skills',
];
// 这些目录往下找三层，别的只看一层
const DEEP_CONTAINERS = ['skills', 'skills/.curated', 'skills/.experimental', 'skills/.system', ...AGENT_SKILL_DIRS];
const FALLBACK_DEPTH = 5;
const LOCK_FILE = 'skills-lock.json';
const LOCK_MIN_VERSION = 1;
const PLUGIN_MARKETPLACE = '.claude-plugin/marketplace.json';
const PLUGIN_MANIFEST = '.claude-plugin/plugin.json';

process.exitCode = await check(process.argv.slice(2));

async function check(args: string[]): Promise<number> {
  const options = readArgs(args);
  if (options === undefined) {
    console.error('用法：npm run check-upstream -- <目录> [--repos <仓库目录>]');
    console.error('  <目录> 里要有 index.json 和 catalog.json；核对本仓库时在 cli/ 下给 ..');
    console.error('  不给 --repos 时去 GitHub 上看（要联网；设了 GITHUB_TOKEN 就带上，免得被限流）');
    console.error('  给了 --repos 时不联网：把 <仓库目录>/<所有者>/<仓库> 当作上游的那个仓库');
    return EXIT_USAGE;
  }
  // 不是目录的话每个来源都会被当成「仓库不存在」
  if (options.repos !== undefined && !(await isDirectory(options.repos))) {
    console.error(`--repos 给的不是一个目录：${options.repos}`);
    return EXIT_USAGE;
  }
  const catalog = await loadCatalog(localCatalogSource(options.dir)).catch((error: unknown) => {
    if (error instanceof CatalogError) return error;
    throw error;
  });
  // 整份读不了：原因沿用安装器对用户说的那一句，同目录校验命令
  if (catalog instanceof CatalogError) {
    const { title, cause } = MESSAGES.zh.failure(catalog.failure, process.platform);
    console.error(`上游核对未通过：${title}`);
    console.error(`  ${cause}`);
    if ('where' in catalog.failure) console.error(`  ${catalog.failure.where}`);
    return EXIT_FAILURE;
  }

  const upstream = options.repos === undefined ? githubUpstream(process.env['GITHUB_TOKEN'] || undefined) : localUpstream(options.repos);
  const lines: string[] = [];
  let mismatched = 0;
  let unchecked = 0;
  // 一个一个来：不带令牌时 GitHub 给的查询次数很少，不抢着用
  for (const entry of catalog.thirdPartySkills) {
    const where = `${entry.name}（${entry.source}）`;
    try {
      const mismatches = await compare(entry, upstream);
      mismatched += mismatches.length;
      lines.push(...mismatches.map((mismatch) => `${where}：${mismatch}`));
    } catch (error) {
      if (!(error instanceof Unchecked)) throw error;
      unchecked++;
      lines.push(`${where}：没能核对：${error.message}`);
    }
  }
  // 被跳过的条目安装器读不出来，这里也就没法核对；哪里写坏了由目录校验命令说
  const broken = catalog.skipped.filter((entry) => entry.list === 'thirdPartySkills').length;
  const failures = [
    ...(mismatched > 0 ? [`有 ${mismatched} 处对不上`] : []),
    ...(unchecked > 0 ? [`有 ${unchecked} 个条目没能核对`] : []),
    ...(broken > 0 ? [`有 ${broken} 个第三方 Skill 条目在目录里写坏了、没有核对（先跑 npm run validate-catalog）`] : []),
  ];
  if (failures.length > 0) {
    console.error(`上游核对未通过：${failures.map((part, index) => (index === 0 ? part : `另${part}`)).join('，')}`);
    for (const line of lines) console.error(`  ${line}`);
    return EXIT_FAILURE;
  }
  const skills = catalog.thirdPartySkills.reduce((count, entry) => count + entry.skills.length, 0);
  console.log(`上游核对通过：${catalog.thirdPartySkills.length} 个第三方 Skill，共 ${skills} 个 skill`);
  return 0;
}

function readArgs(args: string[]): { dir: string; repos: string | undefined } | undefined {
  try {
    const { values, positionals } = parseArgs({ args, options: { repos: { type: 'string' } }, allowPositionals: true });
    const [dir] = positionals;
    return dir === undefined || positionals.length > 1 ? undefined : { dir, repos: values.repos };
  } catch {
    return undefined;
  }
}

// 一个条目和上游对不上的地方，一处一句
async function compare(entry: ThirdPartySkill, upstream: Upstream): Promise<string[]> {
  const lookup = await upstream(entry.source);
  if (lookup.kind === 'missing') return ['来源仓库不存在'];
  const { installable, listed } = await discoverSkills(lookup.repository);
  const registered = new Set(entry.skills.map((skill) => skill.name));
  return [
    ...(lookup.archived ? ['来源仓库已归档'] : []),
    ...(lookup.renamedTo === undefined ? [] : [`来源仓库已改名为 ${lookup.renamedTo}`]),
    ...[...registered].filter((name) => !installable.has(name)).map((name) => `目录里登记的 ${name} 在上游没有`),
    ...[...listed].filter((name) => !registered.has(name)).map((name) => `上游的 ${printable(name)} 没有登记在目录里`),
  ];
}

/** GitHub 作上游：每个来源查一次仓库信息、一次文件列表，文件的内容按需读原始文件。 */
function githubUpstream(token: string | undefined): Upstream {
  const request = async (url: string): Promise<Response> => {
    // 令牌只发给接口，不发给放原始文件的那个站点
    const headers = url.startsWith(GITHUB_API)
      ? { accept: 'application/vnd.github+json', ...(token === undefined ? {} : { authorization: `Bearer ${token}` }) }
      : undefined;
    // 不自动跟着跳转：往哪跳由下面自己看过再说
    const response = await fetch(url, { redirect: 'manual', ...(headers && { headers }), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }).catch(
      (error: unknown) => {
        throw new Unchecked(technicalReason(error));
      },
    );
    if (rateLimit(response)) throw new Unchecked(`被 GitHub 限流，${token === undefined ? '设上 GITHUB_TOKEN 再跑' : '过一会儿再跑'}`);
    return response;
  };
  const answer = async (response: Response): Promise<Record<string, unknown>> => {
    if (!response.ok) throw new Unchecked(`HTTP ${response.status}${response.status === 401 && token !== undefined ? '（GITHUB_TOKEN 不对或过期了）' : ''}`);
    const body: unknown = await response.json().catch(() => undefined);
    if (!isRecord(body)) throw new Unchecked('GitHub 的答复读不懂');
    return body;
  };

  return async (source) => {
    let info = await request(`${GITHUB_API}repos/${source}`);
    // 改了名或转给了别人的仓库答 301，指到按编号查的地址：只跟一次，且只跟到同一个接口下
    const moved = info.status === 301 ? info.headers.get('location') : null;
    if (moved !== null) {
      if (!moved.startsWith(GITHUB_API)) throw new Unchecked('GitHub 的答复读不懂');
      info = await request(moved);
    }
    // 转成私有的也是这个答复
    if (info.status === 404) return { kind: 'missing' };
    const { full_name: fullName, archived } = await answer(info);
    // 仓库现在的名字接下来要拼进网址、打到终端上，维护者还会把它抄回目录：和目录里的 source 是同一条规则
    if (typeof fullName !== 'string' || !SKILL_SOURCE.test(fullName)) throw new Unchecked('GitHub 的答复读不懂');

    const listing = await answer(await request(`${GITHUB_API}repos/${fullName}/git/trees/HEAD?recursive=1`));
    if (!Array.isArray(listing['tree'])) throw new Unchecked('GitHub 的答复读不懂');
    // 列表不全就说不准上游有哪些 skill
    if (listing['truncated'] === true) throw new Unchecked('仓库太大，GitHub 给的文件列表不全');
    const files = (listing['tree'] as unknown[]).flatMap((entry) =>
      isRecord(entry) && entry['type'] === 'blob' && typeof entry['path'] === 'string' ? [entry['path']] : [],
    );
    const read = async (path: string): Promise<string> => {
      const response = await request(`${GITHUB_RAW}${fullName}/HEAD/${path.split('/').map(encodeURIComponent).join('/')}`);
      if (!response.ok) throw new Unchecked(`读不到 ${printable(path)}（HTTP ${response.status}）`);
      return response.text().catch((error: unknown) => {
        throw new Unchecked(`读不到 ${printable(path)}（${technicalReason(error)}）`);
      });
    };
    // 所有者和仓库的名字在 GitHub 上不分大小写
    const renamedTo = fullName.toLowerCase() === source.toLowerCase() ? undefined : fullName;
    return { kind: 'found', repository: { files, read }, archived: archived === true, renamedTo };
  };
}

/** 本地目录作上游：<仓库目录>/<所有者>/<仓库> 是目录就算这个仓库存在，里面的文件就是它的内容。归档和改名在本地无从表示。 */
function localUpstream(repos: string): Upstream {
  return async (source) => {
    const root = join(repos, ...source.split('/'));
    if (!(await isDirectory(root))) return { kind: 'missing' };
    const files: string[] = [];
    const list = async (dir: string, prefix: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        // .git 不是仓库的内容，GitHub 的文件列表里也没有它
        if (entry.isDirectory() && !(prefix === '' && entry.name === '.git')) await list(join(dir, entry.name), `${prefix}${entry.name}/`);
        else if (entry.isFile()) files.push(prefix + entry.name);
      }
    };
    await list(root, '').catch((error: unknown) => {
      throw new Unchecked(technicalReason(error));
    });
    const read = (path: string): Promise<string> =>
      readFile(join(root, ...path.split('/')), 'utf8').catch((error: unknown) => {
        throw new Unchecked(`读不到 ${printable(path)}（${technicalReason(error)}）`);
      });
    return { kind: 'found', repository: { files, read }, archived: false, renamedTo: undefined };
  };
}

async function isDirectory(path: string): Promise<boolean> {
  return (await stat(path).catch(() => undefined))?.isDirectory() ?? false;
}

interface DeclaredSkill {
  /** 它在 frontmatter 里声明的名字 */
  name: string;
  /** 标了 metadata.internal 的：按名字装得上，但 skills CLI 不把它列出来 */
  internal: boolean;
}

/**
 * 上游这个仓库里的 skill，名字是它们各自声明的名字的小写写法：skills CLI 按名字选 skill 时只转小写再比，
 * 目录里登记的名字和它一字不差才选得中。
 * installable 是按名字装得上的，listed 是 skills CLI 会列出来的（少了标 internal 的）。
 */
async function discoverSkills(repository: Repository): Promise<{ installable: Set<string>; listed: Set<string> }> {
  // skills CLI 是拿路径去问文件系统的，macOS 和 Windows 上不分大小写（Skills/、skill.md 都认）：这里的路径一律按小写比，
  // 读的时候再换回原来的写法。大小写敏感的 Linux 上它认出来的可能不一样
  const files = new Map(repository.files.map((file) => [file.toLowerCase(), file]));
  const readText = (path: string): Promise<string> => repository.read(files.get(path) ?? path);
  // 每个目录下一层有哪些目录
  const children = new Map<string, Set<string>>();
  for (const file of files.keys()) {
    const segments = file.split('/');
    for (let depth = 0; depth < segments.length - 1; depth++) {
      const parent = segments.slice(0, depth).join('/');
      children.set(parent, (children.get(parent) ?? new Set()).add(segments.slice(0, depth + 1).join('/')));
    }
  }
  const skillFile = (dir: string): string => (dir === '' ? SKILL_FILE : `${dir}/${SKILL_FILE}`);
  const hasSkill = (dir: string): boolean => files.has(skillFile(dir));

  // 每份 SKILL.md 只读一次：下面要找两遍
  const declared = new Map<string, Promise<DeclaredSkill | undefined>>();
  const read = (dir: string): Promise<DeclaredSkill | undefined> => {
    const reading = declared.get(dir) ?? readText(skillFile(dir)).then(parseSkill);
    declared.set(dir, reading);
    return reading;
  };
  const locked = files.has(LOCK_FILE) ? lockedNames(await readText(LOCK_FILE)) : new Set<string>();
  // 作者自己装进仓库的别人的 skill：在 agent 的项目级 skill 目录下，名字或目录名记在锁文件里
  const isBorrowed = (dir: string, name: string): boolean =>
    AGENT_SKILL_DIRS.some((agentDir) => dir === agentDir || dir.startsWith(`${agentDir}/`)) &&
    (locked.has(lockName(name)) || locked.has(lockName(posix.basename(dir))));
  const pluginDirs = (await pluginSkillDirs(files, readText)).map((dir) => dir.toLowerCase());

  const discover = async (includeInternal: boolean): Promise<Set<string>> => {
    const names = new Set<string>();
    const add = async (dir: string): Promise<void> => {
      const skill = await read(dir);
      if (skill === undefined || (skill.internal && !includeInternal) || isBorrowed(dir, skill.name)) return;
      names.add(skill.name.toLowerCase());
    };
    // 仓库根就是一个 skill 时只有这一个
    if (hasSkill('')) await add('');
    if (names.size > 0) return names;
    // 约定的位置：下一层的目录里有 SKILL.md 的就是一个 skill，不再往它里面找
    const walk = async (dir: string, maxDepth: number, depth = 1): Promise<void> => {
      await Promise.all(
        [...(children.get(dir) ?? [])].map(async (child) => {
          if (hasSkill(child)) return add(child);
          if (depth >= maxDepth || SKIP_DIRS.includes(posix.basename(child))) return;
          return walk(child, maxDepth, depth + 1);
        }),
      );
    };
    for (const dir of ['', ...DEEP_CONTAINERS, ...pluginDirs]) await walk(dir, DEEP_CONTAINERS.includes(dir) ? 3 : 1);
    if (names.size > 0) return names;
    // 约定的位置里一个都没有：仓库里别处的才算
    const anywhere = [...files.keys()]
      .filter((file) => file === SKILL_FILE || file.endsWith(`/${SKILL_FILE}`))
      .map((file) => file.split('/').slice(0, -1))
      .filter((segments) => segments.length <= FALLBACK_DEPTH && !segments.some((segment) => SKIP_DIRS.includes(segment)));
    await Promise.all(anywhere.map((segments) => add(segments.join('/'))));
    return names;
  };
  return { installable: await discover(true), listed: await discover(false) };
}

// 一份 SKILL.md 算数的条件：frontmatter 解析得了，name 和 description 都是非空的文字
function parseSkill(text: string): DeclaredSkill | undefined {
  const frontmatter = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!frontmatter) return undefined;
  let data: unknown;
  try {
    data = parseYaml(frontmatter[1] ?? '');
  } catch {
    return undefined;
  }
  if (!isRecord(data)) return undefined;
  const { name, description, metadata } = data;
  if (typeof name !== 'string' || name === '' || typeof description !== 'string' || description === '') return undefined;
  return { name: declaredName(name), internal: isRecord(metadata) && metadata['internal'] === true };
}

// skills CLI 读名字时的清理（sanitizeMetadata）：去掉终端控制码和大部分控制字符，换行并成一个空格，去掉首尾空白。
// 它留着制表符和落单的 ESC，所以打出来之前还要过 printable
function declaredName(name: string): string {
  return name
    .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b[P^_][\s\S]*?\x1b\\/g, '')
    .replace(/\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/g, '')
    .replace(/\x1b[\x20-\x7e]/g, '')
    .replace(/[\x80-\x9f]/g, '')
    .replace(/[\x00-\x08\x0b-\x1a\x1c-\x1f\x7f]/g, '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

// 锁文件里的名字和 skill 的名字比之前都这样化一下
function lockName(name: string): string {
  return name.toLowerCase().replace(/[\s_]+/g, '-');
}

function lockedNames(text: string): Set<string> {
  let lock: unknown;
  try {
    lock = JSON.parse(text);
  } catch {
    return new Set();
  }
  if (!isRecord(lock) || typeof lock['version'] !== 'number' || lock['version'] < LOCK_MIN_VERSION || !isRecord(lock['skills'])) return new Set();
  return new Set(Object.keys(lock['skills']).map(lockName));
}

// 插件清单指到的目录：每个插件目录下的 skills，和清单的 skills 字段逐个列出的路径所在的目录
async function pluginSkillDirs(files: ReadonlyMap<string, string>, readText: (path: string) => Promise<string>): Promise<string[]> {
  const dirs: string[] = [];
  const manifest = async (path: string): Promise<Record<string, unknown> | undefined> => {
    if (!files.has(path)) return undefined;
    const text = await readText(path);
    try {
      const data: unknown = JSON.parse(text);
      return isRecord(data) ? data : undefined;
    } catch {
      return undefined;
    }
  };
  // 清单里的路径要以 ./ 开头
  const isRelative = (path: unknown): path is string => typeof path === 'string' && path.startsWith('./');
  const add = (pluginBase: string | undefined, skills: unknown): void => {
    if (pluginBase === undefined) return;
    for (const skillPath of Array.isArray(skills) ? skills : []) {
      const dir = isRelative(skillPath) ? inside(posix.dirname(posix.join(pluginBase, skillPath))) : undefined;
      if (dir !== undefined) dirs.push(dir);
    }
    dirs.push(posix.join(pluginBase, 'skills'));
  };

  const marketplace = await manifest(PLUGIN_MARKETPLACE);
  if (marketplace) {
    const pluginRoot = isRecord(marketplace['metadata']) ? marketplace['metadata']['pluginRoot'] : undefined;
    const plugins = Array.isArray(marketplace['plugins']) ? marketplace['plugins'] : [];
    if (pluginRoot === undefined || isRelative(pluginRoot)) {
      for (const plugin of plugins) {
        if (!isRecord(plugin)) continue;
        const { source } = plugin;
        if (source !== undefined && !isRelative(source)) continue;
        add(inside(posix.join(pluginRoot ?? '', source ?? '')), plugin['skills']);
      }
    }
  }
  const plugin = await manifest(PLUGIN_MANIFEST);
  if (plugin) add('', plugin['skills']);
  return dirs;
}

// 清单里的路径是远程数据：化简之后还在仓库里面的才要，跑到外面去的不要
function inside(path: string): string | undefined {
  const normalized = posix.normalize(path).replace(/\/$/, '');
  if (normalized === '..' || normalized.startsWith('../') || normalized.startsWith('/')) return undefined;
  return normalized === '.' ? '' : normalized;
}

// 上游的名字和路径是远程数据，打到终端之前去掉控制码和控制字符
function printable(text: string): string {
  return stripVTControlCharacters(text).replace(/[\u0000-\u001f\u007f-\u009f]/g, '');
}
