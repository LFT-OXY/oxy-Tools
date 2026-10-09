// 外部命令执行器的正式实现：起一个子进程，等它结束。
import spawn from 'cross-spawn';
import type { CommandRunner } from './installer.ts';

/**
 * 缺省不经过 shell：每个参数原样交给命令，里面的 & 之类没有机会被当成命令的一部分。
 * Windows 上宿主的命令常是 npm 装出来的 .cmd，只能经 cmd.exe 起；cross-spawn 替我们找到它并把参数转义好。
 * 命令的输出不打到终端上，它也不从终端读输入。
 *
 * 给了 shell 时（工具的安装命令）：整行交给系统的 shell——Windows 上是 cmd.exe，其余是 sh——
 * 输入输出直接接在用户的终端上，输出实时可见，命令要问话（如 sudo 的密码）也答得了。
 */
export function systemCommandRunner(): CommandRunner {
  return (command, args, options) =>
    new Promise((resolve, reject) => {
      const child = options?.shell
        ? spawn(command, { shell: true, stdio: 'inherit', windowsHide: true })
        : spawn(command, [...args], { stdio: 'ignore', windowsHide: true });
      child.once('error', reject);
      // 被信号结束时没有退出状态，同样算没成功
      child.once('close', (code) => resolve({ exitCode: code ?? 1 }));
    });
}
