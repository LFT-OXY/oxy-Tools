// 把网页界面的页面打成静态文件（仅供开发）：web/ 下的源码 → dist/web/ 下的 index.html、app.js、app.css、favicon.svg。
// npm run build、测试的 globalSetup 和两份预览（终端界面的、网页界面的）都调它。界面库打进了 app.js，运行时依赖不因它多一个。
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const SOURCE = new URL('../web/', import.meta.url);
const TARGET = new URL('../dist/web/', import.meta.url);

export async function buildWeb(): Promise<string> {
  const outdir = fileURLToPath(TARGET);
  mkdirSync(outdir, { recursive: true });
  await build({
    absWorkingDir: fileURLToPath(SOURCE),
    entryPoints: [
      { in: 'main.tsx', out: 'app' },
      { in: 'style.css', out: 'app' },
    ],
    outdir,
    bundle: true,
    minify: true,
    format: 'esm',
    target: 'es2022',
    jsx: 'automatic',
    jsxImportSource: 'preact',
    // 不带来源映射和许可证注释：静态文件里不许有指向外面的地址
    sourcemap: false,
    legalComments: 'none',
    logLevel: 'warning',
  });
  for (const file of ['index.html', 'favicon.svg']) copyFileSync(new URL(file, SOURCE), new URL(file, TARGET));
  return outdir;
}

// 直接运行这个文件（npm run build:web）时才打；被引用时由引用方调
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) console.log(`网页界面的页面 → ${await buildWeb()}`);
