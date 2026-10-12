import { request } from 'node:http';
import { connect, createServer, type AddressInfo } from 'node:net';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ViewState } from '../src/web-protocol.ts';
import { STACK_FRAME, catalogDir, choose, run, tempDir, type Page } from './harness.ts';
import { LANGUAGE_QUESTION } from './terminal.ts';

// 画面状态里才有的字（宿主的名字、数量的写法、字段名）：被拒绝的答复里一个都不该有
const STATE_WORDS = /Claude|Codex|Skill|machine|stage/;
// 不经 HTTP 客户端，直接往连接上写：正常的客户端发不出写坏的请求行
const raw = (port: number, head: string): Promise<string> =>
  new Promise((resolve) => {
    let answer = '';
    const socket = connect({ host: '127.0.0.1', port }, () => socket.write(`${head}\r\n\r\n`));
    socket.on('data', (chunk) => (answer += chunk.toString()));
    socket.on('close', () => resolve(answer));
    socket.on('error', () => resolve(answer));
  });
const portOf = (page: Page): number => Number(new URL(page.url).port);
// 页面自己的请求会带的头
const asPage = (page: Page): Record<string, string> => ({ 'X-OXY-Token': page.token });
const finish = JSON.stringify({ type: 'finish' });
const post = (headers: Record<string, string>): { method: string; headers: Record<string, string>; body: string } => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: finish,
});
// 正常收场：点「完成」，等安装器把连接收掉
const done = async (page: Page): Promise<void> => {
  await page.send({ type: 'finish' });
  await page.closed;
};

describe('网页界面：骨架', () => {
  it('打开浏览器，页面收到本机信息；点「完成」后页面得知已完成，安装器以 0 退出', async () => {
    let opening: ViewState | undefined;
    let closing: ViewState | undefined;
    const result = await run({
      page: async (page) => {
        opening = page.state();
        await page.send({ type: 'finish' });
        closing = await page.until((state) => state.stage === 'finished');
        await page.closed;
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.opened).toHaveLength(1);
    expect(opening).toMatchObject({
      lang: 'zh',
      stage: 'open',
      machine: {
        hosts: [
          { name: 'Claude Code', detected: true },
          { name: 'Codex', detected: false, status: '未检测到' },
        ],
        catalog: ['2 Skill'],
      },
    });
    expect(opening?.machine).not.toHaveProperty('skipped');
    expect(closing?.stage).toBe('finished');
  });

  it('终端上不问语言；本机信息之后是一个块：网页界面已在浏览器打开、整条网址、空一行、按键提示', async () => {
    let screen = '';
    const result = await run({
      page: async (page, { terminal }) => {
        screen = terminal.screen();
        await done(page);
      },
    });

    expect(result.output).not.toContain(LANGUAGE_QUESTION);
    const lines = screen.split('\n');
    const block = lines.findIndex((line) => /^\s*网页界面\s+已在浏览器打开$/.test(line));
    expect(block).toBeGreaterThan(lines.findIndex((line) => /^\s*目录\s+2 Skill$/.test(line)));
    // 网址单独占一行，整条都在，没有被截断或折开
    expect(lines[block + 1]?.trim()).toBe(result.opened[0]);
    expect(lines.slice(block + 2)).toEqual(['', expect.stringMatching(/^\s+t 改用终端界面 · Ctrl\+C 退出$/)]);
  });

  it('网址指向这台机器的回环地址，带着这次运行的口令；它在终端上的那一行在 79 列以内', async () => {
    const first = await run({ page: done });
    const second = await run({ page: done });

    const url = new URL(first.opened[0] ?? '');
    expect(url.protocol).toBe('http:');
    expect(url.hostname).toBe('127.0.0.1');
    expect(url.searchParams.get('token')).toMatch(/^[\w-]{32}$/);
    // 每次运行各有各的口令
    expect(new URL(second.opened[0] ?? '').searchParams.get('token')).not.toBe(url.searchParams.get('token'));
    const line = first.screen.split('\n').find((text) => text.includes(first.opened[0] ?? '')) ?? '';
    expect(line.trim()).toBe(first.opened[0]);
    expect(line.length).toBeLessThanOrEqual(79);
  });

  it('--lang en：终端上的块和页面收到的本机信息都是英文', async () => {
    let state: ViewState | undefined;
    const result = await run({
      argv: ['--lang', 'en'],
      page: async (page) => {
        state = page.state();
        await done(page);
      },
    });

    expect(result.screen).toMatch(/^\s*Web UI\s+opened in your browser$/m);
    // 按键提示只在等按键的时候在画面上，收场时擦掉了：在记下的全部输出里找
    expect(result.output).toMatch(/^\s+t use the terminal UI · Ctrl\+C quit/m);
    expect(state).toMatchObject({ lang: 'en', machine: { hosts: [{ name: 'Claude Code' }, { name: 'Codex', status: 'not detected' }], catalog: ['2 skills'] } });
  });

  it('目录里有条目被跳过：页面收到的本机信息里有那一句，和终端上的是同一句', async () => {
    let state: ViewState | undefined;
    const result = await run({
      catalog: catalogDir({ index: { version: 1, skills: [{ name: 'alpha', version: '1', path: 'skills/alpha', description: { zh: '甲', en: 'A' } }, { name: 'Bad Name' }] } }),
      page: async (page) => {
        state = page.state();
        await done(page);
      },
    });

    expect(state?.machine.skipped).toBe('目录中有 1 个条目格式有误，已跳过');
    expect(result.screen).toContain(state?.machine.skipped);
  });

  it('再开一个标签页（或刷新）：看到的是同一份画面状态', async () => {
    let first: ViewState | undefined;
    let second: ViewState | undefined;
    await run({
      page: async (page) => {
        first = page.state();
        second = await page.reload();
        await done(page);
      },
    });

    expect(second).toEqual(first);
  });
});

describe('网页界面：别的网站和别的机器发来的请求', () => {
  // 在页面连着的时候发一个请求，然后正常收场
  const probe = async (send: (page: Page) => ReturnType<Page['request']>): Promise<Awaited<ReturnType<Page['request']>>> => {
    let response: Awaited<ReturnType<Page['request']>> | undefined;
    const result = await run({
      page: async (page) => {
        response = await send(page);
        // 被拒绝的请求没有让安装器退出：页面还开着
        expect(page.state().stage).toBe('open');
        await done(page);
      },
    });
    expect(result.exitCode).toBe(0);
    if (!response) throw new Error('没有发出请求');
    return response;
  };
  const refusedWithoutState = (response: Awaited<ReturnType<Page['request']>>): void => {
    expect(response.status).toBe(403);
    expect(response.body).toBe('');
    expect(JSON.stringify(response.headers)).not.toMatch(STATE_WORDS);
  };

  it('不带口令读状态：拒绝，答复里没有任何状态', async () => {
    refusedWithoutState(await probe((page) => page.request('/api/events')));
  });

  it('口令不对：读状态和发意图都拒绝', async () => {
    refusedWithoutState(await probe((page) => page.request('/api/events', { headers: { 'X-OXY-Token': `${page.token.slice(0, -1)}_` } })));
    refusedWithoutState(await probe((page) => page.request('/api/intent', post({ 'X-OXY-Token': 'x'.repeat(32) }))));
  });

  it('口令放在网址里不算数：它只认请求头', async () => {
    refusedWithoutState(await probe((page) => page.request(`/api/events?token=${page.token}`)));
  });

  it('Host 不是回环地址加这个端口：拒绝，连静态文件也不给', async () => {
    refusedWithoutState(await probe((page) => page.request('/api/events', { headers: { ...asPage(page), Host: `evil.example:${portOf(page)}` } })));
    refusedWithoutState(await probe((page) => page.request('/api/events', { headers: { ...asPage(page), Host: '127.0.0.1:1' } })));
    refusedWithoutState(await probe((page) => page.request('/', { headers: { Host: 'evil.example' } })));
  });

  it('带着别的来源的 Origin 发意图：拒绝，安装器没有退出', async () => {
    refusedWithoutState(await probe((page) => page.request('/api/intent', post({ ...asPage(page), Origin: 'https://evil.example' }))));
    // 同一台机器上另一个端口的网页也是别的来源
    refusedWithoutState(await probe((page) => page.request('/api/intent', post({ ...asPage(page), Origin: 'http://127.0.0.1:1' }))));
  });

  it('认不出来的意图不照办', async () => {
    const send = (body: string) => (page: Page) => page.request('/api/intent', { ...post(asPage(page)), body });
    expect((await probe(send('{"type":"run","command":"rm -rf ~"}'))).status).toBe(400);
    expect((await probe(send('不是 JSON'))).status).toBe(400);
    expect((await probe(send('null'))).status).toBe(400);
  });

  it('请求行里的网址写坏了：安装器照常开着，不被它弄垮', async () => {
    const answers: string[] = [];
    const result = await run({
      page: async (page) => {
        const host = `Host: 127.0.0.1:${portOf(page)}`;
        answers.push(await raw(portOf(page), `GET http://[ HTTP/1.1\r\n${host}`));
        answers.push(await raw(portOf(page), `GET //[/api/events HTTP/1.1\r\n${host}`));
        // 连 HTTP 都算不上的东西
        answers.push(await raw(portOf(page), 'not http at all'));
        expect(page.state().stage).toBe('open');
        await done(page);
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.output).not.toMatch(STACK_FRAME);
    for (const answer of answers) {
      expect(answer).toMatch(/^HTTP\/1\.1 4\d\d /);
      // 这些答复同样不许缓存
      expect(answer).toMatch(/^cache-control: no-store$/im);
    }
  });

  it('方法不对：认得的路径答 405；不带口令的先被口令挡住', async () => {
    const asked = (method: string, withToken: boolean) => (page: Page) =>
      page.request('/api/intent', { method, headers: withToken ? asPage(page) : {}, body: finish });
    expect((await probe(asked('PUT', true))).status).toBe(405);
    refusedWithoutState(await probe(asked('PUT', false)));
    expect((await probe((page) => page.request('/api/events', { method: 'POST', headers: asPage(page), body: finish }))).status).toBe(405);
    expect((await probe((page) => page.request('/app.js', { method: 'DELETE' }))).status).toBe(405);
  });

  it('意图的正文太大：不读完就拒绝，安装器没有退出', async () => {
    const response = await probe((page) => page.request('/api/intent', { ...post(asPage(page)), body: `{"type":"finish","padding":"${'x'.repeat(70 * 1024)}"}` }));
    expect(response.status).toBe(413);
    expect(response.body).toBe('');
  });

  it('Host 写成 localhost 加这个端口也认：它同样只能是这台机器', async () => {
    const response = await probe((page) => page.request('/', { headers: { Host: `localhost:${portOf(page)}` } }));
    expect(response.status).toBe(200);
    refusedWithoutState(await probe((page) => page.request('/', { headers: { Host: `localhost.evil.example:${portOf(page)}` } })));
  });

  it('只监听回环地址：从这台机器别的网络地址连同一个端口连不上', async () => {
    const reachable = (host: string, port: number): Promise<boolean> =>
      new Promise((resolve) => {
        const socket = connect({ host, port, timeout: 500 });
        const settle = (open: boolean) => (): void => {
          socket.destroy();
          resolve(open);
        };
        socket.once('connect', settle(true));
        socket.once('error', settle(false));
        socket.once('timeout', settle(false));
      });
    // 一个刚关掉、肯定没人监听的端口
    const closedPort = await new Promise<number>((resolve) => {
      const server = createServer().listen(0, '127.0.0.1', () => {
        const { port } = server.address() as AddressInfo;
        server.close(() => resolve(port));
      });
    });
    const addresses = Object.values(networkInterfaces()).flatMap((entries) => (entries ?? []).filter((entry) => !entry.internal && entry.family === 'IPv4').map((entry) => entry.address));
    // 代理软件的虚拟网卡连什么端口都说连上了，说明不了问题：连没人监听的端口都「连得上」的地址不算
    const others = (await Promise.all(addresses.map(async (host) => ((await reachable(host, closedPort)) ? [] : [host])))).flat();
    let viaLoopback: boolean | undefined;
    let viaOthers: boolean[] = [];
    await run({
      page: async (page) => {
        viaLoopback = await reachable('127.0.0.1', portOf(page));
        viaOthers = await Promise.all(others.map((host) => reachable(host, portOf(page))));
        await done(page);
      },
    });

    expect(viaLoopback).toBe(true);
    expect(viaOthers).toEqual(others.map(() => false));
  });

  it('页面的静态文件不要口令就拿得到，里面没有口令、没有状态、没有指向外面的地址', async () => {
    const files: Record<string, Awaited<ReturnType<Page['request']>>> = {};
    let token = '';
    await run({
      page: async (page) => {
        token = page.token;
        for (const path of ['/', '/app.js', '/app.css']) files[path] = await page.request(path);
        // 浏览器打开的是带着口令的那个网址
        files['/?token'] = await page.request(new URL(page.url).pathname + new URL(page.url).search);
        await done(page);
      },
    });

    expect(Object.keys(files)).toHaveLength(4);
    for (const [path, file] of Object.entries(files)) {
      expect(file.status, path).toBe(200);
      expect(file.body, path).not.toContain(token);
      expect(file.body, path).not.toMatch(/Claude Code|Codex/);
      // 界面库带的 XML 命名空间是标识，不是要去取的地址；除此之外一个网址都没有
      const addresses = (file.body.match(/(?:https?:)?\/\/[\w.-]+\.[a-z]{2,}[^\s"'`)]*/gi) ?? []).filter((address) => !address.startsWith('http://www.w3.org/'));
      expect(addresses, path).toEqual([]);
    }
    expect(files['/']?.headers['content-type']).toContain('text/html');
    expect(files['/app.js']?.headers['content-type']).toContain('javascript');
    expect(files['/app.css']?.headers['content-type']).toContain('text/css');
    expect(files['/?token']?.body).toBe(files['/']?.body);
  });

  it('每个答复都不许缓存、带着内容安全策略，不发任何允许跨来源访问的头', async () => {
    // 长连接不会自己结束：拿到答复的头就断开
    const streamHead = (page: Page): Promise<Pick<Awaited<ReturnType<Page['request']>>, 'status' | 'headers'>> =>
      new Promise((resolve, reject) => {
        const outgoing = request({ host: '127.0.0.1', port: portOf(page), path: '/api/events', headers: asPage(page), agent: false }, (response) => {
          resolve({ status: response.statusCode ?? 0, headers: response.headers });
          outgoing.destroy();
        });
        outgoing.on('error', reject);
        outgoing.end();
      });
    const responses: Pick<Awaited<ReturnType<Page['request']>>, 'status' | 'headers'>[] = [];
    await run({
      page: async (page) => {
        responses.push(await page.request('/'));
        responses.push(await page.request('/app.js'));
        responses.push(await streamHead(page));
        responses.push(await page.request('/api/events'));
        responses.push(await page.request('/nowhere'));
        responses.push(await page.request('/api/intent', { ...post(asPage(page)), body: '不是 JSON' }));
        responses.push(await page.request('/api/intent', { ...post(asPage(page)), method: 'PUT' }));
        responses.push(await page.request('/api/intent', { ...post(asPage(page)), body: 'x'.repeat(70 * 1024) }));
        responses.push(await page.request('/api/intent', post(asPage(page))));
        await page.closed;
      },
    });

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 403, 404, 400, 405, 413, 204]);
    for (const { headers } of responses) {
      expect(headers['cache-control']).toBe('no-store');
      const policy = String(headers['content-security-policy']);
      expect(policy).toContain("default-src 'none'");
      expect(policy).toContain("script-src 'self'");
      expect(policy).toContain("connect-src 'self'");
      expect(policy).not.toMatch(/https?:|\*|unsafe/);
      expect(Object.keys(headers).filter((name) => name.startsWith('access-control-'))).toEqual([]);
    }
  });
});

describe('网页界面：用不了时退回终端界面', () => {
  it('浏览器打不开：终端上说明一句原因，然后从语言提问接着走终端界面；那个网址已经连不上', async () => {
    const result = await run({ env: { OXY_TOOLS_WEB: '1' }, browserOpens: false, answers: [choose('退出')] });

    expect(result.exitCode).toBe(0);
    expect(result.opened).toHaveLength(1);
    expect(result.stdout).toMatch(/^\s*注意\s+浏览器打不开，改用终端界面$/m);
    expect(result.output).not.toContain('已在浏览器打开');
    const reason = result.output.indexOf('浏览器打不开');
    const language = result.output.indexOf(LANGUAGE_QUESTION);
    expect(language).toBeGreaterThan(reason);
    expect(result.output.indexOf('选择用途')).toBeGreaterThan(language);
    // 目录不重读，本机信息不重打
    expect(result.output.match(/^\s*目录\s/gm)).toHaveLength(1);
    await expect(fetch(result.opened[0] ?? '')).rejects.toThrow();
  });

  it('本机的网页起不来：终端上说明一句原因，没有去打开浏览器，接着是终端界面', async () => {
    const result = await run({
      env: { OXY_TOOLS_WEB: '1' },
      webDir: join(tempDir('web'), 'missing'),
      answers: [choose('退出')],
    });

    expect(result.exitCode).toBe(0);
    expect(result.opened).toEqual([]);
    expect(result.stdout).toMatch(/^\s*注意\s+本机的网页起不来，改用终端界面$/m);
    expect(result.output.indexOf(LANGUAGE_QUESTION)).toBeGreaterThan(result.output.indexOf('本机的网页起不来'));
    expect(result.output).not.toMatch(STACK_FRAME);
  });

  it('退回之后带了 --lang 就不问语言，原因用那种语言说', async () => {
    const result = await run({ argv: ['--lang', 'en'], env: { OXY_TOOLS_WEB: '1' }, browserOpens: false, answers: [choose('Exit')] });

    expect(result.stdout).toMatch(/^\s*Notice\s+Could not open a browser; using the terminal UI instead$/m);
    expect(result.output).not.toContain(LANGUAGE_QUESTION);
  });

  it('目录读不了：照旧在终端上出错并以 1 退出，没有打开浏览器', async () => {
    const result = await run({ env: { OXY_TOOLS_WEB: '1' }, catalog: catalogDir({ index: '{ 坏的 JSON' }) });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('出错：目录格式有误');
    expect(result.opened).toEqual([]);
    expect(result.output).not.toContain(LANGUAGE_QUESTION);
  });

  it('不带临时开关：和以前一样是终端界面，没有打开浏览器', async () => {
    const result = await run({ answers: [choose('退出')] });

    expect(result.output).toContain(LANGUAGE_QUESTION);
    expect(result.output).not.toContain('网页界面');
    expect(result.opened).toEqual([]);
  });
});

describe('网页界面：退出', () => {
  it('终端上按 Ctrl+C：以 130 退出，页面的连接断了，没有收到「已完成」', async () => {
    const controller = new AbortController();
    let last: ViewState | undefined;
    const result = await run({
      interrupt: controller.signal,
      page: async (page) => {
        controller.abort();
        await page.closed;
        last = page.state();
      },
    });

    expect(result.exitCode).toBe(130);
    expect(last?.stage).toBe('open');
    await expect(fetch(result.opened[0] ?? '')).rejects.toThrow();
  });

  it('点了「完成」之后本机的网页关了：拿着旧网址连不上', async () => {
    const result = await run({ page: done });

    expect(result.exitCode).toBe(0);
    await expect(fetch(result.opened[0] ?? '')).rejects.toThrow();
  });
});
