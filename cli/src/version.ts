import { readFileSync } from 'node:fs';

// 包描述文件在 src/ 和构建产物 dist/ 的上一级，两种运行方式都读得到
const packageInfo = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };

export const VERSION = packageInfo.version;
