// 全部测试之前把网页界面的页面打一遍：测试里本机的网页发的是构建出来的静态文件。
import { buildWeb } from '../scripts/build-web.ts';

export default async function setup(): Promise<void> {
  await buildWeb();
}
