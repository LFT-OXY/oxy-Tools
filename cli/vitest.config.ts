import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 只扫 cli/ 自己的测试；skills/ 下的上游整包自带测试，不能被扫进来
    include: ['test/**/*.test.ts'],
    // 本机的网页发的是构建出来的静态文件：开跑之前把页面打一遍
    globalSetup: ['test/build-web.ts'],
  },
});
