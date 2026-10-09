// 链接打开器的正式实现：把网址交给系统，由它用默认浏览器打开。
import { spawn } from 'node:child_process';
import type { LinkOpener } from './installer.ts';

interface Opener {
  command: string;
  /** 排在网址前面的参数 */
  args: readonly string[];
}

// 各系统上“用默认程序打开”的命令，没列出的系统用 xdg-open。
// 都不经过 shell：网址是远程数据，里面的 & 之类不能有机会被当成命令的一部分
const OPENERS: Partial<Record<NodeJS.Platform, Opener>> = {
  darwin: { command: 'open', args: [] },
  win32: { command: 'rundll32', args: ['url.dll,FileProtocolHandler'] },
};
const XDG_OPEN: Opener = { command: 'xdg-open', args: [] };
// 打开命令在这么久之内没有结束，就当作已经交给浏览器了：有的系统上它要等浏览器关掉才结束
const HANDOFF_MS = 1500;

/** 打不开时以拒绝告终：系统上没有这个命令，或它很快就以非零状态结束（没有能打开网址的程序）。 */
export function systemLinkOpener(platform: NodeJS.Platform): LinkOpener {
  const { command, args } = OPENERS[platform] ?? XDG_OPEN;
  return (url) =>
    new Promise<void>((resolve, reject) => {
      // 自成一个进程组：用户随后按 Ctrl+C 退出安装器时，不把刚打开的浏览器一起带走
      const child = spawn(command, [...args, url], { stdio: 'ignore', detached: true, windowsHide: true });
      const handoff = setTimeout(() => {
        child.unref();
        resolve();
      }, HANDOFF_MS);
      child.once('error', (error) => {
        clearTimeout(handoff);
        reject(error);
      });
      child.once('exit', (code) => {
        clearTimeout(handoff);
        if (code === 0) resolve();
        else reject(new Error(`${command} exited with ${code}`));
      });
    });
}
