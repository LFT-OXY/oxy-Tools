// 假的 GitHub：照真实接口的样子答复提交号、文件树和原始文件，并记下每个请求。
// 答复的形状取自 2026-10-09 对真实接口的实测。
import { vi } from 'vitest';
import { EMPTY_CATALOG, SAMPLE_FILES, SAMPLE_SKILLS } from './fixtures.ts';

const RAW = 'https://raw.githubusercontent.com/LFT-OXY/oxy-Tools/';
const API = 'https://api.github.com/repos/LFT-OXY/oxy-Tools/';
export const COMMIT = 'c2230a119e3cf013df0f699d1f1ecedb86f4126d';

export interface FakeGitHubOptions {
  /** 各个 skill 在 COMMIT 这个提交上的内容：路径 → 内容，缺省是 SAMPLE_FILES；两个目录文件总是样例的那一份 */
  content?: Record<string, string>;
  /** 可执行的文件（文件树里模式是 100755） */
  executable?: string[];
  /** 抢在正常答复之前处理某些请求；返回 undefined 表示照常答复 */
  intercept?: (url: string) => Response | Promise<Response> | undefined;
}

export interface FakeGitHub {
  /** 每个请求的网址和带的访问令牌，按先后 */
  requests: { url: string; authorization: string | null; redirect: RequestInit['redirect'] }[];
  /** 发给接口（api.github.com）的请求，去掉了前缀 */
  queries(): string[];
  /** 下载过的原始文件的网址，去掉了前缀 */
  downloads(): string[];
}

export function fakeGitHub(options: FakeGitHubOptions = {}): FakeGitHub {
  const files: Record<string, string> = {
    'index.json': JSON.stringify({ version: 1, skills: SAMPLE_SKILLS }),
    'catalog.json': JSON.stringify(EMPTY_CATALOG),
    ...(options.content ?? SAMPLE_FILES),
  };
  const tree = (): unknown[] => {
    const dirs = new Set<string>();
    for (const path of Object.keys(files)) {
      const segments = path.split('/');
      for (let depth = 1; depth < segments.length; depth++) dirs.add(segments.slice(0, depth).join('/'));
    }
    return [
      ...[...dirs].map((path) => ({ path, mode: '040000', type: 'tree', sha: 'd'.repeat(40) })),
      ...Object.entries(files).map(([path, content]) => ({
        path,
        mode: options.executable?.includes(path) ? '100755' : '100644',
        type: 'blob',
        sha: 'b'.repeat(40),
        size: Buffer.byteLength(content),
      })),
    ];
  };
  const file = (path: string): Response =>
    path in files ? new Response(files[path]) : new Response('404: Not Found', { status: 404 });

  const requests: FakeGitHub['requests'] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      requests.push({ url, authorization: new Headers(init?.headers).get('authorization'), redirect: init?.redirect });
      const intercepted = await options.intercept?.(url);
      if (intercepted) return intercepted;
      if (url === `${API}commits/main`) return new Response(COMMIT);
      if (url === `${API}git/trees/${COMMIT}?recursive=1`) {
        return Response.json({ sha: COMMIT, url, tree: tree(), truncated: false });
      }
      if (url.startsWith(`${RAW}main/`)) return file(url.slice(`${RAW}main/`.length));
      if (url.startsWith(`${RAW}${COMMIT}/`)) return file(decodeURIComponent(url.slice(`${RAW}${COMMIT}/`.length)));
      return new Response('Not Found', { status: 404 });
    }),
  );
  const under = (prefix: string): string[] =>
    requests.filter(({ url }) => url.startsWith(prefix)).map(({ url }) => url.slice(prefix.length));
  return {
    requests,
    queries: () => under(API),
    downloads: () => under(RAW).filter((path) => !path.startsWith('main/')),
  };
}
