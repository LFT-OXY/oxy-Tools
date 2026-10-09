# 安装 skill

> 宿主探测（`cli/src/hosts.ts`）、状态探测（`cli/src/skill-status.ts`）、钉住来源与下载（`cli/src/catalog.ts`）、落盘（`cli/src/install-skill.ts`）四段的契约，以及流程（`cli/src/flow.ts`）怎么决定装进哪些宿主、哪些要先问过才覆盖。目前有 Claude Code 和 Codex 两个宿主。

---

## Scenario: 把一个 skill 装进宿主的 skill 目录

### 1. Scope / Trigger

安装 skill 会向 GitHub 的接口发请求、往用户主目录里写东西、替换已有的目录。凡是改下载方式、落盘步骤、安装标记的字段、宿主的判断方式、状态怎么判、覆盖前问不问，加一个宿主，改问不问宿主的规则，或加一种装不上的原因，都落在这份契约上。A Team Workflow 将来要直接调用安装动作，所以它的签名不能认识宿主。

### 2. Signatures

```ts
// cli/src/hosts.ts
export interface Host {
  id: string;         // 目录里指代它的名字：claude-code、codex
  name: string;       // 界面上显示的名字
  detected: boolean;
  skillsDir: string;  // 用户级的 skill 目录
  // …关于 MCP 的几样（configuredMcps、addMcp、removeMcp、remoteMcpLogin）见「安装 MCP」
}
// 安装器认识的全部宿主，检测到的和没检测到的都在；顺序就是界面上的顺序
export function detectHosts(env: Environment, homeDir: string): Host[];

// cli/src/skill-status.ts
export type SkillStatus =
  | { kind: 'none' }                              // 目标位置什么都没有
  | { kind: 'installed'; version: string }        // 本工具装的，版本与清单一致
  | { kind: 'other-version'; version: string }    // 本工具装的，version 是已装的版本，与清单的不同（更旧或更新都算）
  | { kind: 'unmanaged' };                        // 已存在但不是本工具装的
export function skillStatus(skill: Skill, skillsDir: string): SkillStatus;

// cli/src/catalog.ts —— CatalogSource 的一部分
pin(options: PinOptions): Promise<PinnedSource>;

export interface PinOptions {
  token: string | undefined; // GitHub 的访问令牌，有就带上
  signal: AbortSignal;       // 用户按 Ctrl+C 的信号
}
export interface PinnedSource {
  readonly commit: string | null;                      // 来源提交；本地目录没有
  download(path: string, dest: string): Promise<void>; // 把目录根下 path 这个目录里的全部文件取到 dest（已存在的空目录）下
}
export class UnsafePathError extends Error {}          // 文件列表里有路径指向 path 之外

// cli/src/install-skill.ts
export async function installSkill(skill: Skill, skillsDir: string, context: InstallContext): Promise<void>;

export interface InstallContext {
  source: PinnedSource;
  tempDir: string;        // 放下载中的文件的地方
  interrupt: AbortSignal;
}
export type SkillInstallProblem =
  | { kind: 'no-skill-md' }
  | { kind: 'unsafe-path' }
  | { kind: 'download'; detail: string }
  | { kind: 'write'; detail: string };
export class SkillInstallError extends Error { readonly problem: SkillInstallProblem }
```

`installSkill` 的前两个参数就是“条目 + 目标目录”：它装到 `skillsDir/<skill.name>`，不知道这个目录属于哪个宿主。失败时**只**抛 `SkillInstallError`。

### 3. Contracts

**宿主在不在**

| 宿主 | 判断 | skill 目录 |
|------|------|-----------|
| Claude Code | 可执行路径上有 `claude` 命令 | `<主目录>/.claude/skills` |
| Codex | 可执行路径上有 `codex` 命令 | `<主目录>/.agents/skills`（它自己的 `.codex/skills` 已被标为废弃） |

每个宿主是 `hosts.ts` 里的一份适配（`HostAdapter`：给环境变量和主目录，交出一个 `Host`），都回答同样的问题（关于 MCP 的那几问见 [安装 MCP](./mcp-install.md)）；`detectHosts` 按 `ADAPTERS` 的顺序逐个问。**加一个宿主就是往 `ADAPTERS` 里追加一份适配**，流程和呈现层都按列表走，不认具体是哪个宿主——文案里也不写死宿主的名字，名字从列表里取。

“可执行路径上有某个命令”的判断不执行任何东西：把 `env.PATH` 按本机的分隔符（`path.delimiter`）拆开，在每个目录里找这个名字，以及这个名字接上 `env.PATHEXT` 里每个扩展名（Windows 上有这个变量，别的系统没有）；找到的必须是可执行的普通文件，同名的目录不算。不看传入的 `platform`——文件系统的事按真实的系统来，测试里才能在任何系统上用一个临时目录当可执行路径。

**装进哪些宿主（`flow.ts`）**

| 检测到的宿主 | 主菜单上方 | 进 skill 分组之后 |
|--------------|-----------|-------------------|
| 两个及以上 | 「AI Agent」一行每个宿主后面一个 `✓` | 先问「装进哪些 AI Agent」：多选，默认全选，名字后面是各自的 skill 目录；再进 skill 列表 |
| 只有一个 | 没检测到的写「– 未检测到」，另有一行「注意」说明它被跳过、组件只装进检测到的那个 | 不问，直接用它 |
| 一个都没有 | 每个都写「– 未检测到」，一行「注意」说明暂时装不了组件 | 进不去：分组那一行不可选，行尾注明「需要 AI Agent」，光标起始落在第一个能选的项上 |

- **每个 skill 在每个所选宿主下各是一项**：各调一次 `installSkill(skill, host.skillsDir, …)`，各下载一次、各写自己的安装标记、各有一行结果，互不影响。汇总里同一个 skill 的后续行不重复名字，标题数的是 skill 的个数；结果每行都写名字，合计数的是项数。
- 钉住的来源整次运行共用，不因宿主多而多查询。
- 问不问宿主、勾完之后怎么返回，skill 和 MCP 共用一段流程（`flow.ts` 的 `withHosts`）；装 MCP 时宿主选择里名字后面不写目录。
- **一个都不勾就确认是回到上一步**：宿主选择上是回主菜单；skill 列表上，问过宿主就回宿主选择（之前勾的还在），没问过就是主菜单。汇总里的「返回修改」回 skill 列表，不重问宿主。

**skill 的状态（`skillStatus`）**

状态完全来自对 `<skillsDir>/<名字>` 此刻的探测，同步、只读，不抛错；没有任何集中的状态文件。

| 目标位置 | 状态 | 列表里的写法 |
|----------|------|--------------|
| `lstat` 失败（不存在，或上级不是目录、读不了） | `none` | `未装` |
| 是符号链接（**不跟随**：它指向的目录里有安装标记也不算） | `unmanaged` | `非本工具安装` |
| 有 `.oxy-tools.json`，其中的 `version` 与清单里这一条的相同 | `installed` | `已装 <版本>` |
| 同上，但 `version` 不同 | `other-version` | `<已装的> → <清单的>` |
| 存在但没有安装标记；或标记不是 JSON、没有 `version`、`version` 不是非空文字或夹着控制字符；或目标是个文件 | `unmanaged` | `非本工具安装` |

- 标记里的 `version` 会打到终端上，所以和目录里的文字守同一条规矩（`catalog.ts` 的 `isText`）；不合规矩的标记当作没有标记——宁可多问一次要不要覆盖。
- **每次要显示就现探测**：每进一次 skill 列表探测一轮（装完回到列表就是新的状态），勾完之后给汇总再探测一次。不把上一轮的结果记下来复用。

**覆盖与单独确认（`flow.ts`）**

| 状态 | 汇总里的操作 | 备注 | 选了「开始安装」之后 |
|------|--------------|------|----------------------|
| `none` | 新装 | 空 | 直接装 |
| `installed` | 覆盖 | `重装 <版本>` | 直接装（整目录替换，标记更新） |
| `other-version` | 覆盖 | `<已装的> → <清单的>` | 直接装；结果写 `已安装 <已装的> → <清单的>` |
| `unmanaged` | 覆盖 | `非本工具安装，另行确认` | **逐项另问**「`<路径>` 不是本工具装的，要覆盖它吗？」，缺省否 |

- 另问发生在汇总确认之后、查询和下载之前，一项一问（同一个 skill 在两个宿主下都是 `unmanaged` 就问两次，问的是各自的路径）。
- 没同意的那一项不装，目标位置原样不动，结果里是 `– <名字> <宿主> 跳过 未同意覆盖，保持原样`，计入合计的「跳过」；其余项照常。
- **全都没同意时不向 GitHub 查询**：没有要下载的。
- 汇总里只要有一项是覆盖，表后就有一行「注意  覆盖即整目录替换，目录内的本地改动会丢失」；全是新装时没有这一行。
- 同意覆盖符号链接时，换掉的只是链接本身（见落盘第 5 步），那里变成一个装好的真目录，链接原先指向的目录一个字节都不动。

**向 GitHub 查询（`githubCatalogSource().pin`）**

两个请求，一次运行只发一轮（流程把钉住的来源记在本次运行里，装几轮都共用；查询失败不记，下一轮重新查）：

| 请求 | `Accept` | 取什么 |
|------|----------|--------|
| `GET https://api.github.com/repos/LFT-OXY/oxy-Tools/commits/main` | `application/vnd.github.sha` | 答复正文就是提交号（40 或 64 位十六进制），不带整份提交详情 |
| `GET …/git/trees/<提交号>?recursive=1` | `application/vnd.github+json` | `{ tree: [{ path, mode, type }], truncated }`；只要 `type` 是 `blob` 的 |

- 都带 `redirect: 'error'`、20 秒超时；有令牌时带 `Authorization: Bearer <令牌>`。
- 提交号要拼进后面的网址，先用正则验过。
- 这两个请求的形状和限流的答复是 2026-10-09 对真实接口实测并对照官方文档确认的。

**下载（`PinnedSource.download`）**

- 只取 `path + '/'` 开头的文件，每个从 `https://raw.githubusercontent.com/LFT-OXY/oxy-Tools/<提交号>/<路径>` 下，路径逐段 `encodeURIComponent`。**全部钉在查询到的那个提交上**，不用 `main`。
- 下载不带令牌（公开仓库不需要，令牌只发给接口）；`redirect: 'error'`，单个文件 120 秒超时。
- 最多 6 个文件同时下。有一个失败就都停下，**等全部停稳了再抛**——不然还在跑的会在临时目录被清掉之后又往里写。
- 文件树里 `mode` 是 `100755` 的写成 `0o755`，其余 `0o644`。
- 文件列表是远程数据：每个文件落地的位置先 `path.resolve` 再确认还在 `dest` 里面，有一个不在就整个不下，抛 `UnsafePathError`。
- 本地目录作来源时就是把 `<目录>/<path>` 整个复制过去，`commit` 是 `null`。

**落盘（`installSkill`）**

1. 在 `tempDir` 下建临时目录 `oxy-tools-skill-XXXXXX`，下载到里面。
2. 确认里面有 `SKILL.md`。
3. 把安装标记写进临时目录（和内容一起落地，不会出现有内容没标记的中间状态）。
4. 把临时目录挪到目标旁边的 `.<名字>.oxy-tools-new`：先试改名，跨文件系统（`EXDEV`，Linux 的 `/tmp` 常是内存盘）就复制。
5. 两次**同步**的改名完成替换：原有的 → `.<名字>.oxy-tools-old`，新的 → 目标；第二步失败就把原有的挪回来。同步是为了中间插不进中断。改名不跟随符号链接，目标是链接时换掉的只是链接本身。
6. 不管成败，最后清掉临时目录和那两个以点开头的目录；清不掉不算安装失败（下次装同一个 skill 时开头会再清一遍）。

临时目录不放在 skill 目录里：进程被强杀时留下的半截内容不能出现在宿主会扫描的地方。目标旁边那两个目录以点开头，也只在改名的瞬间（或跨文件系统复制的那一会儿）存在。

**安装标记**：`<skillsDir>/<名字>/.oxy-tools.json`

```json
{
  "name": "pr",
  "version": "1.0.0",
  "commit": "c2230a119e3cf013df0f699d1f1ecedb86f4126d",
  "installedAt": "2026-10-09T09:24:42.036Z"
}
```

`version` 取自目录里这一条的版本，`commit` 是来源提交（本地目录来源时是 `null`），`installedAt` 是 ISO 8601 的 UTC 时间。安装器没有任何集中的状态文件；目录里有没有这个文件（并且读得出 `version`），就是“是不是本工具装的”的唯一依据。文件名由 `install-skill.ts` 导出（`MARKER_FILE`），状态探测读的是同一个常量。

**中断**：`interrupt` 一触发，`installSkill` 的监听当场同步删掉临时目录和那两个以点开头的目录（进程随即退出，等不到 `finally`）；在测试里进程不退出，流程看到信号已触发就以 130 结束。

### 4. Validation & Error Matrix

查询失败（`pin` 抛 `CatalogError`）：流程把它交给 `ui.failure()`，写到标准错误，然后回到主菜单，**不退出、不改变退出状态**，本轮什么都不装。

| 情况 | `CatalogFailure` | 说明里有什么 |
|------|------------------|--------------|
| 答复是 403 或 429，且带 `retry-after`，或 `x-ratelimit-remaining` 为 `0` | `rate-limited`（`authenticated`、`minutes`） | 「GitHub 限流」；没带令牌时原因是每小时限 60 次，出路两条：稍后再试、设置 `GITHUB_TOKEN`（Windows 上不给 `export` 的写法）；带了令牌时只有稍后再试。`minutes` 取自 `retry-after`（秒）或 `x-ratelimit-reset`（UTC 纪元秒），答复里没有就不写多久恢复 |
| 请求发不出去（断网、超时） | `skill-files-unlisted`，`problem: 'unreachable'`，`detail` 是错误码 | 「无法查询 skill 的文件列表」，查的网址单独一行 |
| 其他非 2xx | 同上，`detail` 是 `HTTP <状态码>` | 同上；带了令牌且状态码是 401 时（`badToken`），下一步指出是 `GITHUB_TOKEN` 无效或已过期 |
| 答复读不懂（提交号不是十六进制、文件树不是预期的 JSON——比如被登录页拦下） | `problem: 'malformed'` | 「GitHub 的答复不是预期的格式」 |
| 文件树的 `truncated` 为真 | `problem: 'truncated'` | 「文件列表不完整」。**不尝试安装**：列表不全就不能保证装上的是完整的 skill |

单项安装失败（`installSkill` 抛 `SkillInstallError`）：只这一项失败，其余照常，退出状态不变；结果里这一行写「失败」加原因，原因都以「目标目录未改动」收尾。

| 情况 | `SkillInstallProblem` |
|------|-----------------------|
| 下载下来的东西里没有 `SKILL.md`（包括这个目录下一个文件都没有） | `no-skill-md` |
| 文件列表里有越界的路径 | `unsafe-path` |
| 下载这一步的其他失败 | `download`，`detail` 是 `HTTP 503`、`ENOTFOUND`、`ENOENT`（本地来源里没有这个目录）等 |
| 建临时目录、写标记、建 skill 目录、挪动、替换失败 | `write`，`detail` 是错误码 |

不算失败的一种结果：用户没同意覆盖。它不经 `installSkill`，流程直接调 `progress.skip(target)`，这一行写「跳过 未同意覆盖，保持原样」，退出状态不变。

令牌的值不出现在任何输出里：出错说明只提变量名。

### 5. Good/Base/Bad Cases

- Good：只检测到 Claude Code，勾了 `pr` 和 `wizard`，查询一轮（两个请求），5 个文件都从同一个提交下，两个目录各有内容和标记，结果两行「已安装」，回到主菜单。
- Good：两个宿主都检测到且都选了，勾了 `pr` → `~/.claude/skills/pr` 和 `~/.agents/skills/pr` 各有内容和各自的标记，汇总两行、结果两行、合计「2 成功」。
- Base：`wizard` 的一个文件答复 503 → `wizard` 那一行是「失败 下载中断（HTTP 503），目标目录未改动」，原先的 `~/.claude/skills/wizard` 一个字节都没变，临时目录是空的；`pr` 照常装上；退出状态 0。
- Base：选了两个宿主，主目录里的 `.agents` 是个文件 → Codex 那一行「失败 写入失败（…）」，Claude Code 那一行照常「已安装」；退出状态 0。
- Good：`~/.claude/skills/beta-pack` 是本工具装的 2.0，清单里是 2.3 → 列表里写 `2.0 → 2.3`，汇总里是「覆盖」加同样的备注和一行「注意」，不另问；装完后旧文件不在了，标记是 2.3，结果写「已安装 2.0 → 2.3」。
- Base：`~/.claude/skills/alpha` 是用户自己放的，同时勾了 `beta-pack` → 选了「开始安装」之后问一次，直接回车（否）→ `alpha` 原样不动、结果是「跳过」，`beta-pack` 照常装上，合计「1 成功 · 0 失败 · 1 跳过」。
- Base：`~/.claude/skills/alpha` 是指向 `~/my-skills/alpha` 的符号链接，同意覆盖 → 那里变成装好的真目录，`~/my-skills/alpha` 的文件清单和内容都没变。
- Bad：查询被限流 → 打出「出错：GitHub 限流」和两条出路，什么都没装，回到主菜单；同一次运行里再装一次会重新查询。
- Bad：一个宿主都没检测到 → skill 分组进不去，主目录里什么都不多。

### 6. Tests Required

都经 `runInstaller`，在 `cli/test/install-skill.test.ts`（只有 Claude Code 时的安装）、`cli/test/hosts.test.ts`（宿主探测与宿主选择）和 `cli/test/skill-status.test.ts`（状态、覆盖、单独确认、符号链接）；真实的多选画面、不可选的行和是否题在 `prompts.test.ts`：

- 装一个、装多个：断言主目录里的文件内容、标记的四个字段、主目录里没有多出别的东西、`result.tmp` 是空的。
- 整体替换：主目录里事先放一个同名目录，断言旧文件不在了。
- 汇总：每个 skill 将装到的目录；取消什么都不装；返回修改后之前勾的还在；一个都不勾回主菜单。
- 默认来源：`fakeGitHub()` 的 `queries()` 正好是那两个请求（装两轮也只有一轮）、`downloads()` 只有勾选的 skill 的文件且都以提交号开头；带和不带 `GITHUB_TOKEN` 时接口请求的 `authorization`；下载请求从不带。
- **下载中途失败后目标位置保持原样**：事先放好同名目录，让其中一个文件 503，断言那个目录的文件清单和内容都没变、其余项装上了、`result.tmp` 是空的。
- 中断：在某个文件的请求里触发 `interrupt`，**当场**读临时目录断言已经空了（事后再读分不出是同步清的还是 `finally` 清的），再断言目标没变、退出状态 130。
- 上面两张表里的每一种情况各一条：断言标题或原因的文字、没有堆栈、什么都没装（或其余项照常）、退出状态。
- 状态：主目录里事先放好带标记的目录（`home`）和符号链接（`links`），断言列表里那一行的状态词——四种各一条，外加符号链接指向带标记的目录、标记写坏、标记的版本里夹着控制码（还要断言控制码没有出现在 `result.raw` 里）；装完再进列表，断言第二次的列表里已经是「已装」。
- 覆盖已装的：断言汇总那一行的操作与备注、「注意」；装完后旧文件不在、标记的版本更新了；**预设的应答里没有多出一个是否题**（多问了测试就会因为没有预设应答而失败）。
- 不是本工具装的：`accept()` 证明缺省是不覆盖；`no()` 断言目录的文件清单和内容都没变、其余项装上了、结果里的「跳过」和合计；`yes()` 断言整目录替换并有了标记；两个宿主各问各的；全都没同意时 `fakeGitHub().queries()` 是空的；在这个提问上 `interrupt()` 以 130 退出、什么都没动。
- 符号链接：同意后 `lstatSync(目标).isSymbolicLink()` 为假、里面是新内容和标记，**链接原先指向的目录的文件清单和内容都没变**；不同意时链接还在。
- 下载失败与中断那两条用的是「用户自己放的目录 + `yes()`」：同意覆盖之后才失败，用户的东西也必须原样留着。
- 宿主：`onPath` 给 `['codex']`、`['claude', 'codex']`、`[]` 各一组。断言「AI Agent」一行、缺一个时的「注意」、问没问「装进哪些 AI Agent」；装进两个宿主时两处的文件和各自的标记、主目录里只多出这两个目录；只选一个时另一个目录不存在；一个宿主那边失败时另一个照常；默认全选用 `accept()` 走一遍落盘；一个都不勾的两条返回路径；一个都没有时分组那一行的文字，以及真实交互库下光标起始在哪、在那一行上回车进不去。

### 7. Wrong vs Correct

#### Wrong

```ts
// 先删旧的再放新的：改名跨不了文件系统时，旧的已经没了
await rm(target, { recursive: true, force: true });
await rename(work, target);
```

```ts
// 一个文件失败就立刻抛：别的下载还在跑，会在临时目录被清掉之后又把它建出来
await Promise.all(files.map(fetchFile));
```

```ts
// 中断时的收尾是异步的：进程在 abort() 返回后就退出了，这一行没机会执行
interrupt.addEventListener('abort', () => void rm(work, { recursive: true }));
```

```ts
// 用 stat 判断：跟着链接走到了带标记的目录，把用户的链接当成了本工具装的，不问就替换
if (statSync(target).isDirectory() && existsSync(join(target, MARKER_FILE))) return { kind: 'installed', version };
```

```ts
// 进列表时探测一次存起来，装完回到列表还用它：刚装好的那个仍然显示「未装」
session.statuses ??= probeAll(catalog.skills, hosts);
```

#### Correct

```ts
// 先 lstat：是链接就不往下看
if (lstatSync(target).isSymbolicLink()) return { kind: 'unmanaged' };
```

```ts
// 每次要显示就现探测
const entries = catalog.skills.map((skill) => ({ skill, statuses: hosts.map((host) => skillStatus(skill, host.skillsDir)) }));
```

```ts
// 新内容先弄到目标旁边（同一个文件系统），再用两次同步的改名替换，放不上去就挪回来
await moveNextTo(work, staged);
interrupt.throwIfAborted();
replace(target, staged, displaced);
```

```ts
// 记下第一个失败、叫停其余的，等所有人都停稳了再抛
await Promise.all(Array.from({ length: DOWNLOADS_AT_ONCE }, worker)); // worker 自己不抛
if (failures.length > 0) throw failures[0];
```

```ts
const discard = (): void => { /* rmSync，逐个 try/catch */ };
interrupt.addEventListener('abort', discard);
```

---

## Design Decision: 宿主在不在，看可执行路径而不是去执行它

**Context**：规格说“以 `claude` 命令是否可用判断”。可以经外部命令执行器跑一次 `claude --version`，也可以自己在可执行路径上找。

**Decision**：自己找。跑一次要几百毫秒，每次启动都付；Windows 上 `claude` 是个 `.cmd`，要经 shell 才跑得起来；测试里记录到的命令列表会混进探测用的那一条，之后断言 MCP 的命令时碍事。工具的检查方式里本来就有“某个命令在不在可执行路径上”这一种，到时候用的是同一个判断。

**代价**：靠 shell 别名才能用的 `claude`（不在可执行路径上）检测不到——但那种情况下跑一次也一样找不到。

---

## Design Decision: 装进两个宿主就下载两次

**Context**：同一个 skill 装进两个宿主，内容是一样的。可以下载一次再复制到两处，也可以每个宿主各走一遍安装动作。

**Decision**：各走一遍。安装动作的签名是「条目 + 目标目录」，A Team Workflow 将来要直接调用它，不能让它认识“几个目标”；各走一遍还让两个宿主的结果天然独立——一处下载中断或写不进去，另一处照常，结果里各有一行。

**代价**：体积大的 skill（`onetake` 约 70MB）装进两个宿主要下两遍。要省这一遍，得在流程里先下到临时目录再分发，同时保住“一处失败不影响另一处”和中断时的同步清理；还没有做。

---

## Design Decision: 安装标记读不出版本，就当它不是本工具装的

**Context**：规格说“目录存在而没有安装标记”算不是本工具装的，没说标记在、但读不懂（不是 JSON、没有 `version`、版本里夹着控制字符）时怎么算。

**Decision**：当作没有标记，状态是 `unmanaged`，覆盖前单独问。另一条路是“文件在就算本工具装的”，但那样版本显示不出来，而且会不问就替换一个来历说不清的目录。多问一次的代价小于悄悄替换。

**没有经维护者确认**，记在任务的 `prd.md` 修订记录里。

---

## Design Decision: 「注意」只在有覆盖项时出现

**Context**：规格要求汇总确认时说明“整目录替换、本地改动会丢失”。工单 06 之前探测不出哪一项是覆盖，这一行固定出现。

**Decision**：现在只有至少一项的操作是「覆盖」时才打这一行。全是新装时没有东西会丢，这一行只是噪音；有了「操作」一栏，哪些会被覆盖已经逐行标出。

**没有经维护者确认**；要它固定出现，改 `ui.installSummary` 里那一个条件即可。

---

## Common Mistakes

### 版本号和提交号不是同一时刻取的

**Symptom**：安装标记里的 `version` 是旧的，`commit` 却是新的。

**Cause**：`index.json` 在启动时从 `main` 读，提交号要到确认安装之后才查；这中间 `main` 上有新提交就会对不上。窗口是用户停在菜单里的那段时间。

**现状**：没有处理。后果是下次运行时这个 skill 显示为版本不同（`<旧> → <新>`），重装一次就对上了。要根治得在钉住提交之后按那个提交重读 `index.json`；要不要做还没有定。
