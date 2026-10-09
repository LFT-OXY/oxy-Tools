// 目录：读取 skill 清单 index.json 与 catalog.json，校验后合并成统一的条目集合。
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface CatalogSource {
  readonly kind: 'remote' | 'local';
  /** 给用户看的位置：目录根下某个文件的网址或本地路径 */
  locate(file: string): string;
  /** 读取目录根下的一个文本文件；读不到时抛出 */
  readText(file: string): Promise<string>;
}

export interface Skill {
  name: string;
  version: string;
  path: string;
  description: { zh: string; en: string };
}

export interface Catalog {
  skills: Skill[];
  /** 被跳过的条目数：校验不通过的，以及与前面重名的 */
  skipped: number;
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
  | ({ kind: 'catalog-too-new'; found: number; supported: number } & FileOrigin);

export class CatalogError extends Error {
  readonly failure: CatalogFailure;

  constructor(failure: CatalogFailure) {
    super(failure.kind);
    this.name = 'CatalogError';
    this.failure = failure;
  }
}

/** 这一版安装器认识的目录格式版本，index.json 与 catalog.json 共用 */
const SUPPORTED_FORMAT = 1;
// catalog.json 里的三个数组；条目的字段由各自的功能在用到时定义和校验
const CATALOG_ARRAYS = ['mcps', 'tools', 'apps'];

const GITHUB_RAW = 'https://raw.githubusercontent.com/LFT-OXY/oxy-Tools/main/';
const FETCH_TIMEOUT_MS = 20_000;

/** 读取并校验目录。整份读不了时抛出 CatalogError；单条条目写坏只跳过那一条。 */
export async function loadCatalog(source: CatalogSource): Promise<Catalog> {
  const [skillList, otherEntries] = await Promise.all([
    readDocument(source, 'index.json'),
    readDocument(source, 'catalog.json'),
  ]);
  for (const field of CATALOG_ARRAYS) {
    if (otherEntries.data[field] !== undefined) requireArray(otherEntries, field);
  }

  const skills = new Map<string, Skill>();
  let skipped = 0;
  for (const entry of requireArray(skillList, 'skills')) {
    const skill = parseSkill(entry);
    // 重名的只留第一条
    if (skill && !skills.has(skill.name)) skills.set(skill.name, skill);
    else skipped++;
  }
  return { skills: [...skills.values()], skipped };
}

/** 默认的目录来源：GitHub 上本仓库 main 分支的原始文件。 */
export function githubCatalogSource(): CatalogSource {
  return {
    kind: 'remote',
    locate: (file) => GITHUB_RAW + file,
    async readText(file) {
      // 只走 HTTPS：拒绝一切跳转，免得被带到别的协议或站点
      const response = await fetch(GITHUB_RAW + file, {
        redirect: 'error',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    },
  };
}

/** 本地目录作目录来源，供维护者预览和测试。 */
export function localCatalogSource(dir: string): CatalogSource {
  return {
    kind: 'local',
    locate: (file) => join(dir, file),
    readText: (file) => readFile(join(dir, file), 'utf8'),
  };
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

// 读取失败的简短技术原因：优先取错误码（ENOTFOUND、ENOENT），网络错误的真正原因在 cause 里
function technicalReason(error: unknown): string {
  const root = error instanceof Error && error.cause instanceof Error ? error.cause : error;
  if (!(root instanceof Error)) return String(root);
  const { code } = root as NodeJS.ErrnoException;
  return typeof code === 'string' ? code : root.message;
}

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PATH_SEGMENT = /^[A-Za-z0-9._-]+$/;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/;

// 不认识的字段一律忽略；返回 undefined 表示这一条写坏了
function parseSkill(entry: unknown): Skill | undefined {
  if (!isRecord(entry)) return undefined;
  const { name, version, path, description } = entry;
  if (typeof name !== 'string' || !SKILL_NAME.test(name)) return undefined;
  if (!isText(version) || !isSafeRelativePath(path)) return undefined;
  if (!isRecord(description) || !isText(description['zh']) || !isText(description['en'])) return undefined;
  return { name, version, path, description: { zh: description['zh'], en: description['en'] } };
}

// 会成为文件系统路径的字段：只接受相对路径，拒绝绝对路径、盘符、`.`、`..` 和空段
function isSafeRelativePath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.split('/').every((segment) => PATH_SEGMENT.test(segment) && segment !== '.' && segment !== '..')
  );
}

// 目录是远程数据，会被原样打到终端上，所以文字里不许有控制字符
function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && !CONTROL_CHARACTER.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
