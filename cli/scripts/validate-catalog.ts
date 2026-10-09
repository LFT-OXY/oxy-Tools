// 目录校验命令（仅供开发）：用安装器自己的校验逻辑检查一个本地目录里的 index.json 和 catalog.json。
// 维护者提交前和 CI 跑的是同一条：npm run validate-catalog -- <目录>
import { CatalogError, loadCatalog, localCatalogSource, type FieldRule, type SkippedEntry } from '../src/catalog.ts';
import { MESSAGES } from '../src/messages.ts';

const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;

const COMMAND_WORD = '只含字母、数字和 @ : / . _ = + , ~ -，不含空白和引号';
const RULES: Record<FieldRule, string> = {
  name: '要由小写字母和数字组成，分成几段时用连字符连接',
  text: '要是非空文字，且不含控制字符',
  'relative-path': '要是相对路径：用 / 分段，每段只含字母、数字和 . _ -，且不是 . 或 ..',
  object: '要是对象',
  'https-url': "要是 https:// 开头的网址，且只含字母、数字和 -._~:/?#[]@!$&'()*+,;=%（别的字符先做百分号编码）",
  'host-list': '要是非空的数组，每一项是一个 AI Agent 的标识（如 claude-code、codex）；全部支持时不写这个字段',
  'mcp-server': '里 command（本地进程的启动命令）和 url（远程地址）要恰好有一样',
  'command-word': `要是一个词：${COMMAND_WORD}`,
  'command-word-list': `要是数组，每一项是一个词：${COMMAND_WORD}`,
};

process.exitCode = await validate(process.argv.slice(2));

async function validate(args: string[]): Promise<number> {
  const [dir] = args;
  if (dir === undefined || args.length > 1) {
    console.error('用法：npm run validate-catalog -- <目录>');
    console.error('  <目录> 里要有 index.json 和 catalog.json；校验本仓库时在 cli/ 下给 ..');
    return EXIT_USAGE;
  }
  const catalog = await loadCatalog(localCatalogSource(dir)).catch((error: unknown) => {
    if (error instanceof CatalogError) return error;
    throw error;
  });
  // 整份读不了：安装器遇到它会直接退出。原因沿用安装器对用户说的那一句
  if (catalog instanceof CatalogError) {
    const { title, cause } = MESSAGES.zh.failure(catalog.failure, process.platform);
    console.error(`目录校验未通过：${title}`);
    console.error(`  ${cause}`);
    if ('where' in catalog.failure) console.error(`  ${catalog.failure.where}`);
    return EXIT_FAILURE;
  }
  if (catalog.skipped.length > 0) {
    console.error(`目录校验未通过：有 ${catalog.skipped.length} 个条目会被安装器跳过`);
    for (const entry of catalog.skipped) console.error(`  ${describe(entry)}`);
    return EXIT_FAILURE;
  }
  console.log(`目录校验通过：${catalog.skills.length} 个 skill、${catalog.mcps.length} 个 MCP、${catalog.apps.length} 个应用项目`);
  for (const { file, list, count } of catalog.unread) {
    console.log(`  未校验：${file} 的 ${list} 有 ${count} 条，这一版安装器还不读这类条目的内容`);
  }
  return 0;
}

function describe({ file, list, position, name, problem }: SkippedEntry): string {
  const where = `${file} 的 ${list} 第 ${position} 条${name === undefined ? '' : `（${name}）`}`;
  switch (problem.kind) {
    case 'not-object':
      return `${where}：条目不是对象`;
    case 'duplicate':
      return `${where}：与前面的条目重名`;
    case 'bad-field':
      return `${where}：${problem.field} ${RULES[problem.rule]}`;
  }
}
