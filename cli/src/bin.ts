#!/usr/bin/env node
import { homedir, tmpdir } from 'node:os';
import { githubCatalogSource } from './catalog.ts';
import { inquirerPrompter } from './inquirer-prompter.ts';
import { runInstaller } from './installer.ts';

// 还没有流程会执行外部命令或打开链接，真实实现随第一个用到它们的功能一起落地
const notWiredYet = (): never => {
  throw new Error('not wired yet');
};

// 提问之外（如读取目录、下载时）按 Ctrl+C：先让监听这个信号的同步收尾跑完，再换一行退出，
// 不把 shell 的提示符留在半行上
const interrupt = new AbortController();
process.once('SIGINT', () => {
  interrupt.abort();
  process.stdout.write('\n');
  process.exit(130);
});

process.exitCode = await runInstaller({
  argv: process.argv.slice(2),
  env: process.env,
  platform: process.platform,
  systemLocale: Intl.DateTimeFormat().resolvedOptions().locale,
  stdout: {
    write: (text) => void process.stdout.write(text),
    isTTY: process.stdout.isTTY === true,
    get rows() {
      return process.stdout.rows;
    },
    get columns() {
      return process.stdout.columns;
    },
  },
  stderr: { write: (text) => void process.stderr.write(text), isTTY: process.stderr.isTTY === true },
  stdinIsTTY: process.stdin.isTTY === true,
  catalogSource: githubCatalogSource(),
  homeDir: homedir(),
  tempDir: tmpdir(),
  interrupt: interrupt.signal,
  runCommand: notWiredYet,
  prompter: inquirerPrompter(),
  openLink: notWiredYet,
});
