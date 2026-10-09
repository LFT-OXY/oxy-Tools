import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 只扫 cli/ 自己的测试；skills/ 下的上游整包自带测试，不能被扫进来
    include: ['test/**/*.test.ts'],
  },
});
