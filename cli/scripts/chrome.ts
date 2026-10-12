// 驱动本机装着的 Chrome（仅供开发，网页界面的预览用）：起一个没有窗口的 Chrome，经它自带的调试协议开网址、
// 定窗口大小、定系统的样子（深浅色、减少动态效果）和语言、在页面里算一个式子、按键、截图。
// 协议走启动时接上的两条管道，不开端口；不加任何依赖。
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import type { Readable, Writable } from 'node:stream';

/** 一个标签页 */
export interface Tab {
  /** 页面那一块有多大（CSS 像素，一个像素就是截图上的一个点） */
  viewport(width: number, height: number): Promise<void>;
  /** 假装系统是深色还是浅色、开没开「减少动态效果」 */
  system(scheme: 'dark' | 'light', reducedMotion: boolean): Promise<void>;
  /** 假装浏览器的语言是它（zh-CN、en-US）：页面还没有画面状态时照它说话 */
  language(language: string): Promise<void>;
  /** 打开一个网址，等页面的脚本和样式都加载完 */
  open(url: string): Promise<void>;
  /** 在页面里算一个式子，给出它的值；式子的值是承诺就等它兑现。页面里抛了错这里也抛 */
  evaluate<Value>(expression: string): Promise<Value>;
  /** 按一下键盘上的这个键：Tab 或 Escape */
  press(key: keyof typeof KEY_CODES): Promise<void>;
  /** 把页面那一块拍成 PNG */
  screenshot(): Promise<Buffer>;
  close(): Promise<void>;
}

export interface Chrome {
  /** 这个浏览器是什么、哪个版本，如 Chrome/154.0.8037.58 */
  product: string;
  newTab(): Promise<Tab>;
  close(): Promise<void>;
}

// 一条命令等这么久还没有答复就算卡住了
const PATIENCE_MS = 15_000;
// 叫它退出之后等这么久
const EXIT_PATIENCE_MS = 3000;
const KEY_CODES = { Tab: 9, Escape: 27 };

/** 环境变量 OXY_TOOLS_CHROME 给了就只认它；否则照各个系统上常见的安装位置找 Chrome、Chromium 或 Edge。哪里都没有时没有。 */
export function findChrome(): string | undefined {
  const { env, platform } = process;
  const candidates = env['OXY_TOOLS_CHROME']
    ? [env['OXY_TOOLS_CHROME']]
    : platform === 'darwin'
      ? ['Google Chrome', 'Chromium', 'Microsoft Edge'].map((name) => `/Applications/${name}.app/Contents/MacOS/${name}`)
      : platform === 'win32'
        ? [env['PROGRAMFILES'], env['PROGRAMFILES(X86)'], env['LOCALAPPDATA']].flatMap((base) =>
            base ? [join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'), join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe')] : [],
          )
        : (env['PATH'] ?? '').split(delimiter).flatMap((dir) =>
            ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge'].map((name) => join(dir, name)),
          );
  return candidates.find((candidate) => existsSync(candidate));
}

/**
 * 起一个没有窗口的 Chrome。profileDir 是给它当用户数据目录的空目录：它不碰真实的那一份（书签、登录、扩展）。
 * 除了本机回环地址它哪里都连不上。
 */
export async function launchChrome(executable: string, profileDir: string): Promise<Chrome> {
  const child = spawn(
    executable,
    [
      '--headless=new',
      '--remote-debugging-pipe',
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-sync',
      '--disable-component-update',
      '--disable-background-networking',
      // 不走系统的代理；回环地址以外的名字一律解析不到
      '--no-proxy-server',
      '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1',
      // 截图上一个点就是页面上的一个像素，不跟着这台机器的屏幕变
      '--force-device-scale-factor=1',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] },
  );
  const [, , , commands, replies] = child.stdio as [null, null, null, Writable, Readable];
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));

  // 协议：一条消息是一段 JSON，后面跟一个 NUL。命令带着 id，答复带着同一个 id；不带 id 的是事件
  const waiting = new Map<number, { resolve: (result: unknown) => void; reject: (error: Error) => void }>();
  const listeners = new Set<(event: { method: string; sessionId?: string }) => void>();
  let lastId = 0;
  let buffer = '';
  replies.setEncoding('utf8');
  replies.on('data', (chunk: string) => {
    buffer += chunk;
    for (let end = buffer.indexOf('\0'); end >= 0; end = buffer.indexOf('\0')) {
      const message = JSON.parse(buffer.slice(0, end)) as { id?: number; result?: unknown; error?: { message: string }; method: string; sessionId?: string };
      buffer = buffer.slice(end + 1);
      if (message.id === undefined) {
        for (const listener of listeners) listener(message);
        continue;
      }
      const reply = waiting.get(message.id);
      waiting.delete(message.id);
      if (message.error) reply?.reject(new Error(message.error.message));
      else reply?.resolve(message.result);
    }
  });
  const failAll = (error: Error): void => {
    for (const reply of waiting.values()) reply.reject(error);
    waiting.clear();
  };
  child.once('error', failAll);
  // Chrome 中途没了：管道上的错由等着答复的那些命令报出来，不让它成为没人接的异常
  commands.on('error', failAll);
  replies.on('error', failAll);
  void exited.then(() => failAll(new Error('Chrome 退出了')));

  const send = <Result = unknown>(method: string, params: object = {}, sessionId?: string): Promise<Result> =>
    new Promise<Result>((resolve, reject) => {
      const id = ++lastId;
      const timer = setTimeout(() => {
        waiting.delete(id);
        reject(new Error(`Chrome 一直没有答复 ${method}`));
      }, PATIENCE_MS);
      waiting.set(id, {
        resolve: (result) => (clearTimeout(timer), resolve(result as Result)),
        reject: (error) => (clearTimeout(timer), reject(error)),
      });
      commands.write(`${JSON.stringify({ id, method, params, ...(sessionId === undefined ? {} : { sessionId }) })}\0`);
    });
  /** 等这个标签页上发生一次这种事件。stop 收掉这次等待：事件到了是它，调用方不等了也调它 */
  const once = (method: string, sessionId: string): { happened: Promise<void>; stop: () => void } => {
    let stop = (): void => {};
    const happened = new Promise<void>((resolve, reject) => {
      const listener = (event: { method: string; sessionId?: string }): void => {
        if (event.method === method && event.sessionId === sessionId) stop();
      };
      const timer = setTimeout(() => {
        listeners.delete(listener);
        reject(new Error(`Chrome 一直没有等到 ${method}`));
      }, PATIENCE_MS);
      stop = (): void => {
        clearTimeout(timer);
        listeners.delete(listener);
        resolve();
      };
      listeners.add(listener);
    });
    return { happened, stop };
  };

  const { product, userAgent } = await send<{ product: string; userAgent: string }>('Browser.getVersion');

  const newTab = async (): Promise<Tab> => {
    const { targetId } = await send<{ targetId: string }>('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true });
    const tab = <Result = unknown>(method: string, params: object = {}): Promise<Result> => send<Result>(method, params, sessionId);
    await tab('Page.enable');
    return {
      viewport: async (width, height) => void (await tab('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })),
      system: async (scheme, reducedMotion) => {
        const features = [
          { name: 'prefers-color-scheme', value: scheme },
          { name: 'prefers-reduced-motion', value: reducedMotion ? 'reduce' : 'no-preference' },
        ];
        await tab('Emulation.setEmulatedMedia', { features });
      },
      language: async (language) => void (await tab('Emulation.setUserAgentOverride', { userAgent, acceptLanguage: language })),
      open: async (url) => {
        const loaded = once('Page.loadEventFired', sessionId);
        const navigated = tab<{ errorText?: string }>('Page.navigate', { url }).then(({ errorText }) => {
          if (errorText) throw new Error(`打不开 ${url}：${errorText}`);
        });
        try {
          // 两样一起等：哪一样先出错都有人接
          await Promise.all([navigated, loaded.happened]);
        } finally {
          loaded.stop();
        }
      },
      evaluate: async <Value>(expression: string) => {
        const { result, exceptionDetails } = await tab<{ result: { value: Value }; exceptionDetails?: { text: string; exception?: { description?: string } } }>(
          'Runtime.evaluate',
          { expression, awaitPromise: true, returnByValue: true },
        );
        if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
        return result.value;
      },
      press: async (key) => {
        const event = { key, code: key, windowsVirtualKeyCode: KEY_CODES[key] };
        await tab('Input.dispatchKeyEvent', { type: 'keyDown', ...event });
        await tab('Input.dispatchKeyEvent', { type: 'keyUp', ...event });
      },
      screenshot: async () => Buffer.from((await tab<{ data: string }>('Page.captureScreenshot', { format: 'png' })).data, 'base64'),
      close: async () => void (await send('Target.closeTarget', { targetId })),
    };
  };

  return {
    product,
    newTab,
    close: async () => {
      // 先让它自己收场；不答复、到点还没退出就直接结束它
      await send('Browser.close').catch(() => undefined);
      const patience = setTimeout(() => child.kill('SIGKILL'), EXIT_PATIENCE_MS);
      await exited;
      clearTimeout(patience);
    },
  };
}
