# 安装 skill

> 宿主探测（`cli/src/hosts.ts`）、钉住来源与下载（`cli/src/catalog.ts`）、落盘（`cli/src/install-skill.ts`）三段的契约。目前只有 Claude Code 一个宿主；第二个宿主和 skill 的状态探测随后面的功能补进来。

---

## Scenario: 把一个 skill 装进宿主的 skill 目录

### 1. Scope / Trigger

安装 skill 会向 GitHub 的接口发请求、往用户主目录里写东西、替换已有的目录。凡是改下载方式、落盘步骤、安装标记的字段、宿主的判断方式，或加一种装不上的原因，都落在这份契约上。A Team Workflow 将来要直接调用安装动作，所以它的签名不能认识宿主。

### 2. Signatures

```ts
// cli/src/hosts.ts
export interface Host {
  name: string;       // 界面上显示的名字
  detected: boolean;
  skillsDir: string;  // 用户级的 skill 目录
}
export function claudeCode(env: Environment, homeDir: string): Host;

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

“可执行路径上有某个命令”的判断不执行任何东西：把 `env.PATH` 按本机的分隔符（`path.delimiter`）拆开，在每个目录里找这个名字，以及这个名字接上 `env.PATHEXT` 里每个扩展名（Windows 上有这个变量，别的系统没有）；找到的必须是可执行的普通文件，同名的目录不算。不看传入的 `platform`——文件系统的事按真实的系统来，测试里才能在任何系统上用一个临时目录当可执行路径。

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

`version` 取自目录里这一条的版本，`commit` 是来源提交（本地目录来源时是 `null`），`installedAt` 是 ISO 8601 的 UTC 时间。安装器没有任何集中的状态文件；目录里有没有这个文件，就是“是不是本工具装的”的唯一依据。

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

令牌的值不出现在任何输出里：出错说明只提变量名。

### 5. Good/Base/Bad Cases

- Good：勾了 `pr` 和 `wizard`，查询一轮（两个请求），5 个文件都从同一个提交下，两个目录各有内容和标记，结果两行「已安装」，回到主菜单。
- Base：`wizard` 的一个文件答复 503 → `wizard` 那一行是「失败 下载中断（HTTP 503），目标目录未改动」，原先的 `~/.claude/skills/wizard` 一个字节都没变，临时目录是空的；`pr` 照常装上；退出状态 0。
- Bad：查询被限流 → 打出「出错：GitHub 限流」和两条出路，什么都没装，回到主菜单；同一次运行里再装一次会重新查询。

### 6. Tests Required

都经 `runInstaller`，在 `cli/test/install-skill.test.ts`（真实的多选画面在 `prompts.test.ts`）：

- 装一个、装多个：断言主目录里的文件内容、标记的四个字段、主目录里没有多出别的东西、`result.tmp` 是空的。
- 整体替换：主目录里事先放一个同名目录，断言旧文件不在了。
- 汇总：每个 skill 将装到的目录；取消什么都不装；返回修改后之前勾的还在；一个都不勾回主菜单。
- 默认来源：`fakeGitHub()` 的 `queries()` 正好是那两个请求（装两轮也只有一轮）、`downloads()` 只有勾选的 skill 的文件且都以提交号开头；带和不带 `GITHUB_TOKEN` 时接口请求的 `authorization`；下载请求从不带。
- **下载中途失败后目标位置保持原样**：事先放好同名目录，让其中一个文件 503，断言那个目录的文件清单和内容都没变、其余项装上了、`result.tmp` 是空的。
- 中断：在某个文件的请求里触发 `interrupt`，**当场**读临时目录断言已经空了（事后再读分不出是同步清的还是 `finally` 清的），再断言目标没变、退出状态 130。
- 上面两张表里的每一种情况各一条：断言标题或原因的文字、没有堆栈、什么都没装（或其余项照常）、退出状态。

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

#### Correct

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

## Common Mistakes

### 版本号和提交号不是同一时刻取的

**Symptom**：安装标记里的 `version` 是旧的，`commit` 却是新的。

**Cause**：`index.json` 在启动时从 `main` 读，提交号要到确认安装之后才查；这中间 `main` 上有新提交就会对不上。窗口是用户停在菜单里的那段时间。

**现状**：没有处理。后果是下次运行时这个 skill 显示为版本不同，重装一次就对上了。要根治得在钉住提交之后按那个提交重读 `index.json`；要不要做还没有定。
