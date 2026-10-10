// 目录校验命令（仅供开发）：用安装器自己的校验逻辑检查一个本地目录里的 index.json 和 catalog.json。
// 维护者提交前和 CI 跑的是同一条：npm run validate-catalog -- <目录>
import {
  CatalogError,
  loadCatalog,
  localCatalogSource,
  type CatalogFlaw,
  type EntryProblem,
  type FieldRule,
  type SkippedEntry,
} from '../src/catalog.ts';
import { MESSAGES } from '../src/messages.ts';

const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;

const COMMAND_WORD = '只含字母、数字和 @ : / . _ = + , ~ -，不含空白和引号';
const SHELL_COMMAND = '只含看得见的 ASCII 字符，首尾不留空格，不换行';
const KEBAB_CASE = '由小写字母和数字组成，分成几段时用连字符连接';
const PURPOSE_ID = `用途清单（purposes）里一个用途的标识（${KEBAB_CASE}）`;
const RULES: Record<FieldRule, string> = {
  name: `要${KEBAB_CASE}`,
  text: '要是非空文字，且不含控制字符',
  'relative-path': '要是相对路径：用 / 分段，每段只含字母、数字和 . _ -，且不是 . 或 ..',
  object: '要是对象',
  'https-url': "要是 https:// 开头的网址，且只含字母、数字和 -._~:/?#[]@!$&'()*+,;=%（别的字符先做百分号编码）",
  'host-list': '要是非空的数组，每一项是一个 AI Agent 的标识（如 claude-code、codex）；全部支持时不写这个字段',
  'mcp-server': '里 command（本地进程的启动命令）和 url（远程地址）要恰好有一样',
  'command-word': `要是一个词：${COMMAND_WORD}`,
  'command-word-list': `要是数组，每一项是一个词：${COMMAND_WORD}`,
  'env-list': '要是数组，每一项是一个环境变量，变量名不重复；不需要环境变量时不写这个字段',
  'env-name': '要是环境变量的名字：只含字母、数字和下划线，且不以数字开头',
  boolean: '要是 true 或 false',
  'local-only': '只能用于本地进程方式（server.command）：远程地址方式的条目不能带环境变量',
  'shell-command': `要是一行命令：${SHELL_COMMAND}`,
  'os-command': `要是一行命令（${SHELL_COMMAND}），或用 null 表示这个系统不支持`,
  'tool-check': '里 command（看这个命令在不在可执行路径上）和 path（看主目录下这个相对路径存不存在）要恰好有一样',
  'command-name': '要是一个命令的名字：只含字母、数字和 . _ -，不带目录',
  purpose: `要是${PURPOSE_ID}；除本仓库的 skill 外，每个条目都要写`,
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
  const { skipped, flaws } = catalog;
  if (skipped.length > 0 || flaws.length > 0) {
    const found = [
      ...(skipped.length > 0 ? [`有 ${skipped.length} 个条目会被安装器跳过`] : []),
      ...(flaws.length > 0 ? [`${skipped.length > 0 ? '另' : ''}有 ${flaws.length} 处写坏了`] : []),
    ];
    console.error(`目录校验未通过：${found.join('，')}`);
    for (const entry of skipped) console.error(`  ${describe(entry)}`);
    for (const flaw of flaws) console.error(`  ${describeFlaw(flaw)}`);
    return EXIT_FAILURE;
  }
  console.log(
    `目录校验通过：${catalog.skills.length} 个 skill、${catalog.mcps.length} 个 MCP、${catalog.tools.length} 个工具、${catalog.apps.length} 个应用项目、${catalog.purposes.length} 个用途`,
  );
  return 0;
}

function describe({ file, list, position, name, problem }: SkippedEntry): string {
  const where = `${file} 的 ${list} 第 ${position} 条${name === undefined ? '' : `（${name}）`}`;
  return `${where}：${explain(problem, { notObject: '条目不是对象', duplicate: '与前面的条目重名' })}`;
}

function explain(problem: EntryProblem, said: { notObject: string; duplicate: string }): string {
  switch (problem.kind) {
    case 'not-object':
      return said.notObject;
    case 'duplicate':
      return said.duplicate;
    case 'bad-field':
      return `${problem.field} ${RULES[problem.rule]}`;
    case 'unlisted-purpose':
      return `用途 ${problem.purpose} 不在用途清单（purposes）里`;
  }
}

// 没有让哪个条目被跳过的写坏之处：安装器不提，这里要说
function describeFlaw(flaw: CatalogFlaw): string {
  switch (flaw.kind) {
    case 'purposes-not-array':
      return `${flaw.file} 的 purposes 不是数组：安装器会把它当作空的，除本仓库的 skill 外的条目都会被跳过`;
    case 'purpose': {
      const where = `${flaw.file} 的 purposes 第 ${flaw.position} 项${flaw.id === undefined ? '' : `（${flaw.id}）`}`;
      return `${where}：${explain(flaw.problem, { notObject: '不是对象', duplicate: '与前面的用途标识重复，只有第一项算数' })}`;
    }
    case 'skill-purposes-not-object':
      return `${flaw.file} 的 skillPurposes 不是对象：要写成「skill 的名字: 用途的标识」`;
    case 'unknown-skill':
      return `${flaw.file} 的 skillPurposes 里${flaw.skill === undefined ? '有一个名字' : ` ${flaw.skill} `}不是 index.json 里的 skill`;
    case 'skill-purpose': {
      const where = `${flaw.file} 的 skillPurposes 里 ${flaw.skill} 的用途`;
      return flaw.purpose === undefined ? `${where}要是${PURPOSE_ID}` : `${where} ${flaw.purpose} 不在用途清单（purposes）里`;
    }
  }
}
