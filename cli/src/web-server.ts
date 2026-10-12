// 本机的网页：只管 HTTP——静态文件、口令和另外几道检查、长连接、收意图。画面状态是什么、意图怎么办，由调用方定。
// 它能替用户执行安装命令，所以别的网站和别的机器发来的请求一律拒绝。
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import type { ViewState } from './web-protocol.ts';

export interface WebServer {
  port: number;
  /** 把新的画面状态发给所有连着的页面 */
  push(state: ViewState): void;
  /** 收掉长连接，关掉本机的网页 */
  close(): Promise<void>;
  /** 当场关掉，不等：被 Ctrl+C 打断时用，那时的收尾只能是同步的 */
  closeNow(): void;
}

export interface WebServerOptions {
  /** 页面的静态文件所在的目录 */
  webDir: string;
  /** 这次运行的口令 */
  token: string;
  /** 当前的画面状态：新连上的页面拿到的就是它 */
  state: () => ViewState;
  /** 页面发来的意图，还没有验过形状；认不出来就返回 false */
  intent: (raw: unknown) => boolean;
  /** 连着的长连接的条数变了：每连上、断开一条调一次。「页面还开着」看的就是它 */
  pages: (count: number) => void;
}

const LOOPBACK = '127.0.0.1';
// 页面请求里带口令的头
const TOKEN_HEADER = 'x-oxy-token';
const STATIC_FILES: Record<string, { file: string; type: string }> = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/app.js': { file: 'app.js', type: 'text/javascript; charset=utf-8' },
  '/app.css': { file: 'app.css', type: 'text/css; charset=utf-8' },
  '/favicon.svg': { file: 'favicon.svg', type: 'image/svg+xml' },
};
// 每个答复都带：不许缓存，只许加载和连接页面自己的来源，不留空闲的连接
const COMMON_HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  Connection: 'close',
};
const MAX_INTENT_BYTES = 64 * 1024;
// 关的时候等还在路上的答复发完，最多这么久
const CLOSE_GRACE_MS = 250;

const digest = (text: string): Buffer => createHash('sha256').update(text).digest();

/** 起本机的网页：只监听回环地址，端口由系统挑。静态文件读不到、监听不了时拒绝。 */
export async function startWebServer({ webDir, token, state, intent, pages }: WebServerOptions): Promise<WebServer> {
  // 启动时读进内存：缺了哪个当场就知道，之后也不再碰磁盘
  const files = new Map(Object.entries(STATIC_FILES).map(([path, { file, type }]) => [path, { type, content: readFileSync(join(webDir, file)) }]));
  const expected = digest(token);
  const streams = new Set<ServerResponse>();
  let port = 0;

  const answer = (response: ServerResponse, status: number, headers: Record<string, string> = {}, body?: Buffer): void => {
    response.writeHead(status, { ...COMMON_HEADERS, ...headers });
    response.end(body);
  };
  // 这台机器的回环地址加这个端口：挡把别的域名解析到本机的做法
  const ownHosts = (): string[] => [`${LOOPBACK}:${port}`, `localhost:${port}`];
  const permitted = (request: IncomingMessage): boolean => {
    const { origin } = request.headers;
    if (origin !== undefined && !ownHosts().some((host) => origin === `http://${host}`)) return false;
    const given = request.headers[TOKEN_HEADER];
    // 各取摘要再比：长度一样，比较不泄露时间差
    return typeof given === 'string' && timingSafeEqual(digest(given), expected);
  };

  const receiveIntent = (request: IncomingMessage, response: ServerResponse): void => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      if (size > MAX_INTENT_BYTES) return;
      size += chunk.length;
      // 太大的正文不读完：答复发出去就断开
      if (size > MAX_INTENT_BYTES) {
        response.once('finish', () => request.destroy());
        return answer(response, 413);
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      let raw: unknown;
      try {
        raw = JSON.parse(Buffer.concat(chunks).toString());
      } catch {
        return answer(response, 400);
      }
      answer(response, intent(raw) ? 204 : 400);
    });
  };

  // 一条认得的路径只收一种方法：方法不对是 405，路径不认得是 404
  const routed = (request: IncomingMessage, response: ServerResponse, method: string, handle: () => void): void =>
    request.method === method ? handle() : answer(response, 405);

  const server = createServer((request, response) => {
    if (!ownHosts().includes(request.headers.host ?? '')) return answer(response, 403);
    // 只取问号前面的那一段去对认得的路径，不拿它去解析：请求行是别人写的，解析会抛错
    const [pathname = ''] = (request.url ?? '').split('?');
    if (pathname.startsWith('/api/')) {
      if (!permitted(request)) return answer(response, 403);
      if (pathname === '/api/events') {
        return routed(request, response, 'GET', () => {
          response.writeHead(200, { ...COMMON_HEADERS, 'Content-Type': 'text/event-stream; charset=utf-8' });
          response.write(`data: ${JSON.stringify(state())}\n\n`);
          streams.add(response);
          pages(streams.size);
          response.on('close', () => {
            streams.delete(response);
            pages(streams.size);
          });
        });
      }
      if (pathname === '/api/intent') return routed(request, response, 'POST', () => receiveIntent(request, response));
      return answer(response, 404);
    }
    const file = files.get(pathname);
    if (!file) return answer(response, 404);
    routed(request, response, 'GET', () => answer(response, 200, { 'Content-Type': file.type }, file.content));
  });
  // 连请求都解析不了时是 Node 自己答复的，不经上面：照样带上那几个头
  server.on('clientError', (_error, socket) => {
    if (!socket.writable) return void socket.destroy();
    const head = Object.entries(COMMON_HEADERS).map(([name, value]) => `${name}: ${value}`);
    socket.end(['HTTP/1.1 400 Bad Request', ...head, '', ''].join('\r\n'));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, LOOPBACK, resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  port = address.port;

  return {
    port,
    push(next) {
      for (const stream of streams) stream.write(`data: ${JSON.stringify(next)}\n\n`);
    },
    close() {
      return new Promise((resolve) => {
        const grace = setTimeout(() => server.closeAllConnections(), CLOSE_GRACE_MS);
        for (const stream of streams) stream.end();
        server.close(() => {
          clearTimeout(grace);
          resolve();
        });
      });
    },
    closeNow() {
      server.close();
      server.closeAllConnections();
    },
  };
}
