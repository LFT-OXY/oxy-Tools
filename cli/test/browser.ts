// 扮演浏览器：拿着网页界面的网址，经真实的本机 HTTP 连上长连接、收画面状态、发意图。
// 用 node:http，不用全局的 fetch：有的用例把它换成了假的 GitHub。
import { request, type ClientRequest, type IncomingHttpHeaders } from 'node:http';
import type { Intent, ViewState } from '../src/web-protocol.ts';

export interface PageResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

export interface PageRequest {
  method?: string;
  /** 原样发出去，口令和 Origin 都不代填；不给 Host 时它是网址里的那个 */
  headers?: Record<string, string>;
  body?: string;
}

export interface Page {
  /** 交给链接打开器的网址 */
  url: string;
  /** 网址里的口令 */
  token: string;
  /** 最近收到的那份画面状态 */
  state(): ViewState;
  /** 等到一份让 predicate 为真的画面状态；已经是了就当场给 */
  until(predicate: (state: ViewState) => boolean): Promise<ViewState>;
  /** 像页面那样发一个意图；答复不是成功就失败 */
  send(intent: Intent): Promise<void>;
  /** 再开一条长连接（刷新，或再开一个标签页），给出它收到的第一份画面状态 */
  reload(): Promise<ViewState>;
  /** 页面的长连接断开时兑现 */
  closed: Promise<void>;
  /** 不经页面直接发一个请求：用来扮演别的网站、别的机器 */
  request(path: string, options?: PageRequest): Promise<PageResponse>;
}

const PATIENCE_MS = 2000;

/** 连上网页界面，收到第一份画面状态之后兑现；dispose 收掉还开着的连接。 */
export async function openPage(url: string): Promise<Page & { dispose(): void }> {
  const { hostname, port, searchParams } = new URL(url);
  const token = searchParams.get('token') ?? '';
  const connection = { host: hostname, port, agent: false as const };
  const streams: ClientRequest[] = [];
  let latest: ViewState | undefined;
  const waiters: { predicate: (state: ViewState) => boolean; resolve: (state: ViewState) => void }[] = [];
  const receive = (state: ViewState): void => {
    latest = state;
    for (const waiter of waiters.splice(0)) {
      if (waiter.predicate(state)) waiter.resolve(state);
      else waiters.push(waiter);
    }
  };

  const send: Page['request'] = (path, { method = 'GET', headers = {}, body } = {}) =>
    new Promise((resolve, reject) => {
      const outgoing = request({ ...connection, path, method, headers }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks).toString() }));
        response.on('error', reject);
      });
      outgoing.on('error', reject);
      outgoing.end(body);
    });

  // 一条长连接：first 是它收到的第一份画面状态，closed 在它断开时兑现
  const listen = (): { first: Promise<ViewState>; closed: Promise<void> } => {
    let opened: (state: ViewState) => void = () => {};
    let refused: (error: Error) => void = () => {};
    const first = new Promise<ViewState>((resolve, reject) => {
      opened = resolve;
      refused = reject;
    });
    const closed = new Promise<void>((resolve) => {
      const outgoing = request({ ...connection, path: '/api/events', headers: { 'X-OXY-Token': token } }, (response) => {
        if (response.statusCode !== 200) refused(new Error(`长连接被拒绝：${response.statusCode}`));
        let buffer = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          buffer += chunk;
          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';
          for (const event of events) {
            if (!event.startsWith('data: ')) continue;
            const state = JSON.parse(event.slice('data: '.length)) as ViewState;
            opened(state);
            receive(state);
          }
        });
        response.on('close', resolve);
      });
      outgoing.on('error', (error) => {
        refused(error);
        resolve();
      });
      outgoing.end();
      streams.push(outgoing);
    });
    return { first, closed };
  };

  const main = listen();
  await main.first;
  return {
    url,
    token,
    state: () => latest as ViewState,
    until: (predicate) =>
      new Promise((resolve, reject) => {
        if (latest && predicate(latest)) return resolve(latest);
        const timer = setTimeout(() => reject(new Error(`画面状态一直没有变成要等的样子：\n${JSON.stringify(latest, null, 2)}`)), PATIENCE_MS);
        waiters.push({ predicate, resolve: (state) => (clearTimeout(timer), resolve(state)) });
      }),
    send: async (intent) => {
      const response = await send('/api/intent', {
        method: 'POST',
        // 浏览器给同一个来源的 POST 也带 Origin
        headers: { 'X-OXY-Token': token, 'Content-Type': 'application/json', Origin: `http://${hostname}:${port}` },
        body: JSON.stringify(intent),
      });
      if (response.status !== 204) throw new Error(`意图 ${intent.type} 被拒绝：${response.status}`);
    },
    reload: () => listen().first,
    closed: main.closed,
    request: send,
    dispose: () => {
      for (const stream of streams) stream.destroy();
    },
  };
}
