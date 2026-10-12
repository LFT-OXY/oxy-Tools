# 安装 skill

> 宿主探测（`cli/src/hosts.ts`）、状态探测（`cli/src/skill-status.ts`）、钉住来源与下载（`cli/src/catalog.ts`）、落盘（`cli/src/install-skill.ts`）四段的契约，以及终端界面的流程（`cli/src/flow.ts`）怎么决定装进哪些宿主、两套界面共用的那几块（`availability.ts`、`plan.ts`、`run-plan.ts`）怎么定状态、哪些要先问过才覆盖、怎么逐项去装。目前有 Claude Code、Codex 和 Pi 三个宿主（Pi 是任务 `10-12-installer-add-pi-omp-hosts` 工单 01 加的）；Codex 和 Pi 用的是同一个共用 skill 目录，同时选了它们时同一个 skill 只装一次（工单 03，见「按 skill 目录归组」）。

---

## Scenario: 把一个 skill 装进宿主的 skill 目录

### 1. Scope / Trigger

安装 skill 会向 GitHub 的接口发请求、往用户主目录里写东西、替换已有的目录。凡是改下载方式、落盘步骤、安装标记的字段、宿主的判断方式、状态怎么判、覆盖前问不问，加一个宿主，改问不问宿主的规则、几个宿主共用一个 skill 目录时怎么归组、那句共用 skill 目录的说明什么时候显示，或加一种装不上的原因，都落在这份契约上。A Team Workflow 将来要直接调用安装动作，所以它的签名不能认识宿主。

### 2. Signatures

```ts
// cli/src/hosts.ts
export interface Host {
  id: string;         // 目录里指代它的名字：claude-code、codex、pi
  name: string;       // 界面上显示的名字
  detected: boolean;
  skillsDir: string;         // 全局的 skill 目录（用户级），装在这里对所有项目生效
  projectSkillsDir: string;  // 项目范围的 skill 目录：项目目录下的那一个，装在这里只对这个项目生效
  sharedSkills: boolean;     // 上面两个是不是共用 skill 目录（.agents/skills）：别的宿主也读它
  // …关于 MCP 的几样（mcp、projectMcp、remoteMcpLogin）见「安装 MCP」；宿主可以没有 MCP 配置
}
// 安装器认识的全部宿主，检测到的和没检测到的都在；顺序就是界面上的顺序
export function detectHosts(env: Environment, homeDir: string, projectDir: string): Host[];
// 安装范围：全局，或项目（运行安装器时所在的目录）。工具没有安装范围
export type Scope = 'global' | 'project';

// cli/src/skill-status.ts
export type SkillStatus =
  | { kind: 'none' }                              // 目标位置什么都没有
  | { kind: 'installed'; version: string }        // 本工具装的，版本与清单一致
  | { kind: 'other-version'; version: string }    // 本工具装的，version 是已装的版本，与清单的不同（更旧或更新都算）
  | { kind: 'unmanaged' };                        // 已存在但不是本工具装的
export function skillStatus(skill: Skill, skillsDir: string): SkillStatus;

// cli/src/availability.ts —— 列表里要不要那句共用 skill 目录的说明，两套界面共用
export function sharedSkillsNoted(hosts: readonly Host[], listing: Pick<Listing, 'skills' | 'thirdParty'>): boolean;

// cli/src/plan.ts —— 一项安装的目标：hosts 是这一项装进的各个宿主的名字，照界面上的先后；不止一个时它们共用这个 skill 目录
export interface InstallTarget { name: string; hosts: readonly string[]; location: string; version: string; status: SkillStatus }
export interface ThirdPartyTarget { entry: string; name: string; hosts: readonly string[]; location: string; exists: boolean }

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

| 宿主 | 标识（`id`） | 判断 | 全局的 skill 目录 | 项目范围的 skill 目录 | 交给 skills CLI 的 agent 名与环境变量 |
|------|--------------|------|-------------------|-----------------------|--------------------------------------|
| Claude Code | `claude-code` | 可执行路径上有 `claude` 命令 | `<主目录>/.claude/skills` | `<项目目录>/.claude/skills` | `claude-code`，`{ CLAUDE_CONFIG_DIR: '' }` |
| Codex | `codex` | 可执行路径上有 `codex` 命令 | `<主目录>/.agents/skills`（它自己的 `.codex/skills` 已被标为废弃） | `<项目目录>/.agents/skills` | `codex`，不另带 |
| Pi | `pi` | 可执行路径上有 `pi` 命令 | `<主目录>/.agents/skills` | `<项目目录>/.agents/skills` | `pi`，不另带 |

- 这几行的先后就是界面上的先后：Claude Code、Codex、Pi。
- **`.agents/skills` 是共用 skill 目录**（术语见仓库根的 `GLOSSARY.md`）：Pi 的 skill 装进 Codex 已经在用的那一个，不用它自己的 `~/.pi/agent/skills`。理由见 [ADR-0005](../../../docs/adr/0005-pi-and-omp-skills-go-to-shared-skill-directory.md)：skills CLI 给 Pi 只装到这里，本仓库的 skill 和第三方 Skill 才在同一处。Pi 自己的目录安装器不读也不写——那里有同名的 skill 不算已装，也不会被问要不要覆盖。
- **Pi 的 MCP 装到全局和项目都行**（工单 02）：用它自己的 `pi mcp add`、`pi mcp remove`，命令、两份配置在哪、项目范围的提醒见 [安装 MCP](./mcp-install.md)。它的 MCP 配置认 `PI_CODING_AGENT_DIR`，skill 目录不认（共用 skill 目录不在 Pi 的配置目录里）。

每个宿主是 `hosts.ts` 里的一份适配（`HostAdapter`：给环境变量、主目录和项目目录，交出一个 `Host`），都回答同样的问题（关于 MCP 的那几问见 [安装 MCP](./mcp-install.md)）；`detectHosts` 按 `ADAPTERS` 的顺序逐个问。**加一个宿主就是往 `ADAPTERS` 里追加一份适配**，流程和呈现层都按列表走，不认具体是哪个宿主——文案里也不写死宿主的名字，名字从列表里取。

“可执行路径上有某个命令”的判断不执行任何东西：把 `env.PATH` 按本机的分隔符（`path.delimiter`）拆开，在每个目录里找这个名字，以及这个名字接上 `env.PATHEXT` 里每个扩展名（Windows 上有这个变量，别的系统没有）；找到的必须是可执行的普通文件，同名的目录不算。不看传入的 `platform`——文件系统的事按真实的系统来，测试里才能在任何系统上用一个临时目录当可执行路径。

**装进哪些宿主（`flow.ts`）**

| 检测到的宿主 | 主菜单上方 | 进「推荐」或一个用途之后 |
|--------------|-----------|-------------------|
| 全部 | 「AI Agent」一行每个宿主后面一个 `✓`，没有「注意」 | 同下一行 |
| 不止一个、但不是全部 | 检测到的后面一个 `✓`，没检测到的写「– 未检测到」；另有一行「注意」说明哪些被跳过、组件只装进哪些 | 列表里有 skill、第三方 Skill 或 MCP 时先问「装进哪些 AI Agent」：多选，只列检测到的，默认全选，名字后面不写目录；再进混合列表。列表里只有工具和外部项目时不问 |
| 只有一个 | 同上一行：没检测到的写「– 未检测到」，一行「注意」 | 不问，直接用它 |
| 一个都没有 | 每个都写「– 未检测到」，一行「注意」说明暂时装不了组件 | 照常进得去，不问宿主；skill 的行不可选，状态的位置写「需要 AI Agent」，外部项目照常可选 |

「注意」的两句话都从宿主的列表里取名字，不写死（`messages.ts` 的 `hostsSkipped`、`noHosts`）：

- 只检测到一部分：「没有检测到 Codex、Pi，已跳过；组件只装进 Claude Code」——没检测到的、检测到的各照界面上的先后，用并列的写法连起来（中文顿号，英文逗号：`Codex, Pi not detected, skipped; components go into Claude Code only`）。
- 一个都没有：「没有检测到 Claude Code、Codex 或 Pi，暂时装不了组件」，英文 `Claude Code, Codex and Pi not detected; components cannot be installed`——前面的用并列的标点隔开，最后一个前面是「或」/ `and`。
- 英文的这两句比 80 列长时照「注意」的规矩折行（续行与话的左缘对齐）。

- **装到哪个目录由安装范围定**（任务 `10-10-catalog-purpose-categories` 工单 10 起）：全局是 `host.skillsDir`，项目是 `host.projectSkillsDir`。Claude Code 和 Codex 项目范围的目录与 skills CLI 不带全局选项时落的位置一致（2026-10-11 实测，记录在任务 `10-10-catalog-purpose-categories` 的 `research/project-scope-trial-record.md`）——Claude Code 是 `<项目目录>/.claude/skills`，Codex 是 `<项目目录>/.agents/skills`。Pi 的也是 `<项目目录>/.agents/skills`：读 skills CLI 1.7.2 的源码确认的（`pi` 这个 agent 的 `skillsDir` 是 `.agents/skills`），**没有用真实的 Pi 实测**，留在发布前虚拟机里的走查清单上（任务 `10-12-installer-add-pi-omp-hosts` 的 `prd.md`「Further Notes」第 7 条）。`installSkill`、`skillStatus` 只认交给它的那个目录，所以**装到项目时的状态判断、版本对比、不是本工具装的目录另问且缺省不覆盖，做法与全局时一字不差**，只是换了目录；选了项目就不读也不写全局的那个目录。汇总和另问里的位置：全局的以 `~` 开头，项目的写成相对项目目录的路径（`.claude/skills/alpha`）。在主目录里运行安装器又选了项目时两个目录重合，不特别处理。
- **每个 skill 在每个 skill 目录下各是一项**（所选的宿主先按 skill 目录归组，见下面「按 skill 目录归组」；各用各的目录时就是每个宿主一项）：各调一次 `installSkill(skill, <按安装范围定的那个目录>, …)`，各下载一次、各写自己的安装标记、各有一行结果，互不影响。汇总里同一个 skill 的后续行不重复名字，标题数的是 skill 的个数；结果每行都写名字，合计数的是项数。
- 钉住的来源整次运行共用，不因宿主多而多查询。
- 问不问宿主、勾完之后怎么返回，都在 `flow.ts` 的 `withHosts` 里；这一问同时管 skill 和 MCP。
- **一个都不勾就确认是回到上一步**：宿主选择上是回主菜单；混合列表上，问过宿主就回宿主选择（之前勾的还在），没问过就是主菜单。汇总里的「返回修改」回混合列表，不重问宿主。
- skill 不再有自己的入口：它在主菜单的「推荐」里（本仓库的全部 skill），写了用途的另在那个用途下；和外部项目在同一张混合列表里勾选，主菜单与流程见 [入口与测试](./installer-entry.md)。

**按 skill 目录归组（`plan.ts`；任务 `10-12-installer-add-pi-omp-hosts` 工单 03）**

所选的宿主里有几个在所选安装范围下用的是同一个 skill 目录时（现在是 Codex 和 Pi：全局都是 `<主目录>/.agents/skills`，项目都是 `<项目目录>/.agents/skills`），同一个 skill 只装一次。决定见 [ADR-0005](../../../docs/adr/0005-pi-and-omp-skills-go-to-shared-skill-directory.md)。

| 项 | 约定 |
|----|------|
| 怎么归组 | 算计划时把所选的宿主按 `skillsDirOf(host, scope)` 归组：目录（路径逐字）相同的是一组，组照各自排在最前的那个宿主在界面上的先后，组里的宿主也照界面上的先后。不看宿主的 `sharedSkills`——那个只管说明显不显示 |
| 一组一项 | 本仓库的 skill：一个 skill 在一组下是一项（`SkillJob`），只调一次 `installSkill`、只下载一次、只写一份安装标记。第三方 Skill 见第二个 Scenario 的「命令」 |
| 宿主那一格 | 一项的 `target.hosts` 是这一组里各宿主的名字，照界面上的先后。界面把它们用并列的写法连起来（文案的 `listSeparator`：中文「Codex、Pi」，英文 `Codex, Pi`）：终端界面的汇总、进行中的那一行、结果行，网页界面汇总和进度的行里的 `host`。位置、状态、版本各只有一份 |
| `SkillJob.host`、`ThirdPartyJob.host` | 这一组里排在最前的那个宿主。网页界面逐项决定覆盖的标识里用的是它的 `id`；第三方 Skill 的命令照它拼 |
| 覆盖前另问 | 按项问，所以一组只问一次；没同意时这一项是跳过 |
| 合计 | 按项算：同时选了 Codex 和 Pi、装一个 skill，合计是「1 成功」，不是 2 |
| 列表里的状态 | **不合并**：仍是每个所选的宿主一栏。Codex 和 Pi 两栏看的是同一个目录，所以写的一样 |
| 两种安装范围 | 一样归组，只是换了目录 |
| Claude Code 的目录与共用 skill 目录之间 | 不特别处理：它们是两个目录、两项 |

**共用 skill 目录的说明**

所选的宿主里只要有一个的 skill 目录是共用 skill 目录（`host.sharedSkills`），且这张列表里有本仓库的 skill 或第三方 Skill，列表的说明里就多一句固定的话（`availability.ts` 的 `sharedSkillsNoted` 定显不显示，文案是 `messages.ts` 的 `sharedSkillsNotice`）：

- 中文：「Codex、Pi、omp 共用同一个 skill 文件夹：装给其中一个，另外两个也看得到」；英文：`Codex, Pi and omp share one skill folder: install for one and the other two see it too`。
- **三个名字是写死在文案里的**，不看检测到了、选了其中哪几个——只选了 Codex 的用户也会看到没装的 Pi 和 omp。这是「文案里不写死宿主的名字」的唯一例外：这句话说的是这个目录有哪些宿主会读，不是这次装进哪些。omp 这个宿主是工单 04 才加的，这句话现在就这样写。
- 只选了 Claude Code 时不显示；列表里只有 MCP、工具、外部项目时不显示。
- **终端界面**：和 MCP 那几栏的说明打在同一处（混合列表上方的「注意」，`ui.listNotices`），这一句排在最前，几行挨着；比 80 列长时照「注意」的规矩折行。
- **网页界面**：随正在看的那张列表发给页面——放在 `Skill` 和「第三方 Skill」这两区里排在前面的那一区的 `notices` 里，只出现一次。见 [网页界面的契约](./web-ui-contract.md)。

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

**覆盖与单独确认（要不要另问由 `plan.ts` 定：每一项的 `asksOverwrite`；终端界面怎么问在 `flow.ts`）**

| 状态 | 汇总里的操作 | 备注 | 选了「开始安装」之后 |
|------|--------------|------|----------------------|
| `none` | 新装 | 空 | 直接装 |
| `installed` | 覆盖 | `重装 <版本>` | 直接装（整目录替换，标记更新） |
| `other-version` | 覆盖 | `<已装的> → <清单的>` | 直接装；结果写 `已安装 <已装的> → <清单的>` |
| `unmanaged` | 覆盖 | `非本工具安装，另行确认` | **逐项另问**「`<路径>` 不是本工具装的，要覆盖它吗？」，缺省否 |

- 另问发生在汇总确认之后、查询和下载之前，一项一问（同一个 skill 在 Claude Code 和 Codex 下都是 `unmanaged` 就问两次，问的是各自的路径；Codex 和 Pi 共用一个目录，是一项，只问一次）。
- 没同意的那一项不装，目标位置原样不动，结果里是 `– <名字> <宿主> 跳过 未同意覆盖，保持原样`（宿主那一格可以是几个名字：`Codex、Pi`），计入合计的「跳过」；其余项照常。
- **全都没同意时不向 GitHub 查询**：没有要下载的。
- 汇总里只要有一项是覆盖，表后就有一行「注意  覆盖即整目录替换，目录内的本地改动会丢失」；全是新装时没有这一行。
- 同意覆盖符号链接时，换掉的只是链接本身（见落盘第 5 步），那里变成一个装好的真目录，链接原先指向的目录一个字节都不动。
- **上表的最后一栏和「另问」说的是终端界面。** 网页界面不在确认之后再问：`asksOverwrite` 的那些项在汇总里各自那一行下面有一个「覆盖它」，缺省不勾、每次进汇总都从不勾起；备注只写「非本工具安装」，不带「另行确认」。没勾的同样不装、结果里同样是跳过。见 [网页界面的契约](./web-ui-contract.md) 的「汇总」。

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

查询失败（`pin` 抛 `CatalogError`）：共用的执行把它交给进度的接收方（`report.failure`）——终端界面是 `ui.failure()`，写到标准错误，然后回到主菜单；网页界面是这一批结果里的出错说明，页面上可以接着挑。两边都**不退出、不改变退出状态**，这一批本仓库的 skill 一个都不装（同一批里的第三方 Skill、MCP、工具照常）。

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

不算失败的一种结果：用户没同意覆盖。它不经 `installSkill`，共用的执行（`runPlan`）直接调 `progress.skill.skip(target)`，这一行写「跳过 未同意覆盖，保持原样」，退出状态不变。

令牌的值不出现在任何输出里：出错说明只提变量名。

### 5. Good/Base/Bad Cases

- Good：只检测到 Claude Code，勾了 `pr` 和 `wizard`，查询一轮（两个请求），5 个文件都从同一个提交下，两个目录各有内容和标记，结果两行「已安装」，回到主菜单。
- Good：Claude Code 和 Codex 都检测到且都选了，勾了 `pr` → `~/.claude/skills/pr` 和 `~/.agents/skills/pr` 各有内容和各自的标记，汇总两行、结果两行、合计「2 成功」。
- Good：同时选了 Codex 和 Pi，勾了 `alpha` → `~/.agents/skills/alpha` 只写一次，汇总一行、进行中一行、结果一行，宿主那一格是「Codex、Pi」，合计「1 成功」；主目录下只多出 `.agents`。
- Good：三个宿主都选了，勾了 `alpha` → 两行：Claude Code 一行，「Codex、Pi」一行；两个目录各有内容和各自的标记，合计「2 成功」。
- Base：同时选了 Codex 和 Pi，`~/.agents/skills/alpha` 是用户自己放的 → 汇总一行「覆盖 … 非本工具安装，另行确认」，只问一次，直接回车（否）→ 一行「跳过」，合计「0 成功 · 0 失败 · 1 跳过」。
- Base：只选了 Pi（或只选了 Codex），列表里有 skill → 列表上方一行「注意  Codex、Pi、omp 共用同一个 skill 文件夹：装给其中一个，另外两个也看得到」；只选 Claude Code 时没有，列表里只有 MCP、工具、外部项目时没有。
- Base：`wizard` 的一个文件答复 503 → `wizard` 那一行是「失败 下载中断（HTTP 503），目标目录未改动」，原先的 `~/.claude/skills/wizard` 一个字节都没变，临时目录是空的；`pr` 照常装上；退出状态 0。
- Base：选了 Claude Code 和 Codex，主目录里的 `.agents` 是个文件 → Codex 那一行「失败 写入失败（…）」，Claude Code 那一行照常「已安装」；退出状态 0。
- Good：`~/.claude/skills/beta-pack` 是本工具装的 2.0，清单里是 2.3 → 列表里写 `2.0 → 2.3`，汇总里是「覆盖」加同样的备注和一行「注意」，不另问；装完后旧文件不在了，标记是 2.3，结果写「已安装 2.0 → 2.3」。
- Base：`~/.claude/skills/alpha` 是用户自己放的，同时勾了 `beta-pack` → 选了「开始安装」之后问一次，直接回车（否）→ `alpha` 原样不动、结果是「跳过」，`beta-pack` 照常装上，合计「1 成功 · 0 失败 · 1 跳过」。
- Base：`~/.claude/skills/alpha` 是指向 `~/my-skills/alpha` 的符号链接，同意覆盖 → 那里变成装好的真目录，`~/my-skills/alpha` 的文件清单和内容都没变。
- Bad：查询被限流 → 打出「出错：GitHub 限流」和两条出路，什么都没装，回到主菜单；同一次运行里再装一次会重新查询。
- Bad：一个宿主都没检测到 → 「推荐」进得去，skill 的行都不可选，主目录里什么都不多。
- Good：只检测到 Pi，勾了 `alpha` → 不问装进哪个，`~/.agents/skills/alpha` 里有内容和安装标记，汇总和结果里宿主写的是「Pi」；主目录下只多出 `.agents`，`.pi` 不出现。
- Base：只检测到 Pi，`~/.pi/agent/skills/alpha` 是用户自己放的、`~/.agents/skills` 里没有 → 列表里写「未装」，不另问；装完后 Pi 自己目录里的那一份原样留着。
- Good：安装范围选了项目，勾了 `alpha` → `<项目目录>/.claude/skills/alpha` 里有内容和安装标记，汇总里位置写 `.claude/skills/alpha`；主目录下一个文件都没多、原有的一个字节都没变。
- Base：全局装过 `alpha` 1.0.0，项目里没有，选了项目 → 列表里写「未装」，汇总是「新装」，不另问；全局那一份原样留着。
- Base：项目里的 `.claude/skills/alpha` 是用户自己放的，选了项目 → 另问的是 `.claude/skills/alpha 不是本工具装的，要覆盖它吗？`，直接回车就不动它；全局有没有同名目录都不影响这一问。

### 6. Tests Required

都经 `runInstaller`，在 `cli/test/install-skill.test.ts`（只有 Claude Code 时的安装）、`cli/test/hosts.test.ts`（宿主探测与宿主选择）和 `cli/test/skill-status.test.ts`（状态、覆盖、单独确认、符号链接）、`cli/test/scope.test.ts`（安装范围：装到项目时落在哪、状态与另问按项目目录、主目录不变）、`cli/test/shared-skills.test.ts`（共用 skill 目录：归组与那句说明；网页界面那一边在 `cli/test/web-shared-skills.test.ts`）；真实的多选画面、不可选的行和是否题在 `prompts.test.ts`：

- 装一个、装多个：断言主目录里的文件内容、标记的四个字段、主目录里没有多出别的东西、`result.tmp` 是空的。
- 整体替换：主目录里事先放一个同名目录，断言旧文件不在了。
- 汇总：每个 skill 将装到的目录；取消什么都不装；返回修改后之前勾的还在；一个都不勾回主菜单。
- 默认来源：`fakeGitHub()` 的 `queries()` 正好是那两个请求（装两轮也只有一轮）、`downloads()` 只有勾选的 skill 的文件且都以提交号开头；带和不带 `GITHUB_TOKEN` 时接口请求的 `authorization`；下载请求从不带。
- **下载中途失败后目标位置保持原样**：事先放好同名目录，让其中一个文件 503，断言那个目录的文件清单和内容都没变、其余项装上了、`result.tmp` 是空的。
- 中断：在某个文件的请求里触发 `interrupt`，**当场**读临时目录断言已经空了（事后再读分不出是同步清的还是 `finally` 清的），再断言目标没变、退出状态 130。
- 上面两张表里的每一种情况各一条：断言标题或原因的文字、没有堆栈、什么都没装（或其余项照常）、退出状态。
- 状态：主目录里事先放好带标记的目录（`home`）和符号链接（`links`），断言列表里那一行的状态词——四种各一条，外加符号链接指向带标记的目录、标记写坏、标记的版本里夹着控制码（还要断言控制码没有出现在 `result.raw` 里）；装完再进列表，断言第二次的列表里已经是「已装」。
- 覆盖已装的：断言汇总那一行的操作与备注、「注意」；装完后旧文件不在、标记的版本更新了；**预设的应答里没有多出一个是否题**（多问了测试就会因为没有预设应答而失败）。
- 不是本工具装的：`accept()` 证明缺省是不覆盖；`no()` 断言目录的文件清单和内容都没变、其余项装上了、结果里的「跳过」和合计；`yes()` 断言整目录替换并有了标记；Claude Code 和 Codex 两个宿主各问各的（两个不同的目录）；全都没同意时 `fakeGitHub().queries()` 是空的；在这个提问上 `interrupt()` 以 130 退出、什么都没动。
- 符号链接：同意后 `lstatSync(目标).isSymbolicLink()` 为假、里面是新内容和标记，**链接原先指向的目录的文件清单和内容都没变**；不同意时链接还在。
- 下载失败与中断那两条用的是「用户自己放的目录 + `yes()`」：同意覆盖之后才失败，用户的东西也必须原样留着。
- Pi：检测、「AI Agent」一行、那两句「注意」、三个宿主时的宿主选择在 `hosts.test.ts`（`onPath` 给 `['pi']`、`['claude', 'codex', 'pi']`）；装到全局和项目的位置、四种状态、另问与缺省不覆盖、Pi 自己的目录不读不写、第三方 Skill 的那一条命令（**字面值**，`--agent pi`）与复核、三个宿主都选了时每一行不超出 79 列，在 `cli/test/pi.test.ts`；网页界面那一边在 `cli/test/web-pi.test.ts`。Pi 的 MCP 另在 `cli/test/pi-mcp.test.ts`、`cli/test/web-pi-mcp.test.ts`（见 [安装 MCP](./mcp-install.md)）。同时选了 Codex 和 Pi 的各样在下一条的 `shared-skills.test.ts`；这里要两个不同的目录就选 Claude Code 和 Pi。
- 共用 skill 目录（`cli/test/shared-skills.test.ts`、`cli/test/web-shared-skills.test.ts`；`onPath` 给 `['codex', 'pi']`、`['claude', 'codex', 'pi']`）：
  - 归组：同时选了 Codex 和 Pi 时汇总一行、进行中一行（从没擦过的 `result.output` 里找）、结果一行，宿主那一格「Codex、Pi」（英文 `Codex, Pi`），合计「1 成功」，`.agents/skills/<名字>` 下只有一份内容和安装标记、主目录下只多出 `.agents`；三个宿主时每个 skill 两行、两个目录各有标记；Claude Code 加 Pi 仍是各一行；装到项目时同样归组、主目录里什么都不多。
  - 覆盖：共用 skill 目录里有不是本工具装的同名 skill → 只问一次（**预设的应答里只排一个**，多问就会失败），`accept()` 证明缺省不覆盖、一行「跳过」；`yes()` 整目录替换；三个宿主、两个目录里都有时问两次，各问各的路径。网页界面是汇总里只有一处 `overwrite`。
  - 第三方 Skill：记录到的命令是**字面值**——一条，`--agent codex`，不另带环境变量；三个宿主时两条（Claude Code 的带 `CLAUDE_CONFIG_DIR: ''`）；条目的 `hosts` 是 `['pi']` 时一条 `--agent pi`、宿主那一格只写「Pi」；`hosts` 是 `['claude-code']`、三个宿主都选了时没有共用 skill 目录的那一行；已有同名目录只问一次、没同意的不执行命令；装到项目时不带 `--global`、`cwd` 是项目目录。网页界面记录到的命令与终端界面逐条相同。
  - 列表里的状态不合并：三个宿主三栏，Codex 和 Pi 两栏写的一样。
  - 那句说明：只选 Pi、只选 Codex（Pi 没检测到）时有；三个都选了只说一次；只选 Claude Code（只检测到它，或在宿主选择上只留它）时没有；列表里只有第三方 Skill 时有；只有 MCP、工具、外部项目时没有；和「读不到配置」那一行同时出现时它在前、两行之间没有空行；英文的那一句。中文的这一句比 80 列长、会折行，**断言前把空白去掉再比**。网页界面断言的是各区的 `notices`：在 `Skill` 那一区，只有第三方 Skill 时在它那一区，MCP 那一区的提醒照旧在它自己那里。
  - **不要写会被工单 04 推翻的断言**：omp 这个宿主那时才加，「Codex、Pi、omp」这一格、四个宿主时的行数都留给它；这句说明里的 omp 是文案里写死的，现在就可以断言。
- 宿主：`onPath` 给 `['codex']`、`['claude', 'codex']`、`[]` 各一组。断言「AI Agent」一行、缺一个时的「注意」、问没问「装进哪些 AI Agent」；装进两个宿主时两处的文件和各自的标记、主目录里只多出这两个目录；只选一个时另一个目录不存在；一个宿主那边失败时另一个照常；默认全选用 `accept()` 走一遍落盘；一个都不勾的两条返回路径；一个都没有时「推荐」照常进得去、不问宿主，skill 的行不可选并写着「需要 AI Agent」，以及真实交互库下在那一行上按空格勾不上（`recommended.test.ts`、`prompts.test.ts`）。

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

上面这一段是加安装范围之前的写法，目录写死成了全局的。现在状态、位置、安装、复核、同名目录的另问**都从同一个按安装范围定的目录来**（`availability.ts` 的 `skillsDirOf`，列表的状态和 `plan.ts` 算计划都用它）：

```ts
// 错：选了项目，状态却看的是全局——列表写「已装」，汇总说「覆盖」，装的却是项目里一个空位置
skillStatus(skill, host.skillsDir);

// 对：一处定目录，后面每一步都用它；一项安装把它带在自己身上（SkillJob.skillsDir），执行时不再回头找宿主要
export const skillsDirOf = (host: Host, scope: Scope): string => (scope === 'project' ? host.projectSkillsDir : host.skillsDir);
skillStatus(skill, skillsDirOf(host, scope));
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

## Scenario: 把一个第三方 Skill 装进宿主

### 1. Scope / Trigger

第三方 Skill 的内容不在本仓库，目录只按仓库登记；安装器在后台调用通用的 skill 安装程序（Vercel 的 skills CLI）把它装进宿主的 skill 目录，决定见 [ADR-0003](../../../docs/adr/0003-third-party-skills-installed-by-skills-cli.md)。凡是改那条命令的写法、带哪些环境变量、怎么判装没装上、覆盖前问不问、条目的字段与校验，都落在这份契约上。装到全局和装到项目（工单 10 起）只差两处：命令带不带 `--global`、在哪个目录下运行。

### 2. Signatures

```ts
// cli/src/catalog.ts
export interface SourcedSkill { name: string; description: { zh: string; en: string } } // 条目里的一个 skill
export interface ThirdPartySkill extends Placement {
  name: string;
  description: { zh: string; en: string };
  url: string;
  hosts?: string[];        // 支持的宿主；省略表示全部支持（写法同 MCP）
  source: string;          // GitHub 上的「所有者/仓库」
  skills: SourcedSkill[];  // 至少一个
}

// cli/src/hosts.ts —— Host 多一样
skillsCli: { agent: string; env: Readonly<Record<string, string>> }; // skills CLI 里指代这个宿主的名字，和让它装到 skillsDir 要带的环境变量

// cli/src/third-party-status.ts
export type ThirdPartyStatus = 'unsupported' | boolean[]; // 这个宿主它不支持；或各个 skill 装没装，与 entry.skills 一一对应
export function thirdPartyStatus(entry: ThirdPartySkill, host: Host, skillsDir: string): ThirdPartyStatus; // skillsDir 是按安装范围定的那个目录
export function isPresent(skillsDir: string, name: string): boolean;    // <skillsDir>/<name> 那里有没有东西：目录、文件、符号链接都算
export function hasSkillFile(skillsDir: string, name: string): boolean; // 复核：<skillsDir>/<name>/SKILL.md 在不在

// cli/src/install-third-party.ts
export type SkillsCliCommand = Command & { args: string[] };
export function skillsCliCommand(source: string, skill: string, host: Host, scope: Scope): SkillsCliCommand; // 全局才带 --global
export interface ThirdPartyResult {
  installed: boolean;       // 复核通过没有：成功与否只看它
  run: { kind: 'exit'; code: number } | { kind: 'not-started'; detail: string | undefined };
}
// cwd 是在哪个目录下运行：装到项目时给项目目录，装到全局时不给
export async function installThirdPartySkill(command: SkillsCliCommand, host: Host, runCommand: CommandRunner, check: () => boolean, cwd?: string): Promise<ThirdPartyResult>;
```

### 3. Contracts

**条目（`catalog.json` 的 `thirdPartySkills`）**

```json
{
  "name": "paper-craft-skills",
  "description": { "zh": "…", "en": "…" },
  "url": "https://github.com/zsyggg/paper-craft-skills",
  "purpose": "documents",
  "source": "zsyggg/paper-craft-skills",
  "skills": [
    { "name": "paper-analyzer", "description": { "zh": "…", "en": "…" } },
    { "name": "paper-comic", "description": { "zh": "…", "en": "…" } }
  ]
}
```

| 字段 | 规则 | `FieldRule` |
|------|------|-------------|
| `name`、`description`、`url`、`purpose`、`recommended` | 同别的条目。名字只在这个数组里唯一 | — |
| `hosts` | 可省略；写了就是非空数组，每项是宿主的标识。不认识的宿主留着不管 | `host-list` |
| `source` | `^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$`：两段、一个斜杠，每段以字母或数字开头 | `skill-source` |
| `skills` | 非空数组，每项是对象，名字不重复 | `skill-list`（不是数组、是空的、有重名）、`object`（`skills[i]`） |
| `skills[i].name` | `^[a-z0-9](?:(?:[a-z0-9._]\|-(?!-))*[a-z0-9_])?$`：只含小写字母、数字和 `. _ -`，以小写字母或数字开头，不以 `.` 或 `-` 结尾，连字符不连着写 | `sourced-skill-name` |
| `skills[i].description.zh`、`.en` | 非空文字，不含控制字符 | `text` |

- 一条只报头一处问题，顺序：`name`、`description`、`url`、`hosts`、`source`、`skills`（逐项 `name`、`description`，再查重名），最后是共有的 `purpose`、`recommended`。写坏的只跳过那一条。
- **`source` 和 skill 的名字会成为一条外部命令的参数**，所以只收安全的字符，理由同 MCP 的启动命令。每段都要以字母或数字开头，比规格里的字面说法多一条：以 `-` 开头的会被 skills CLI 当成选项，以 `.` 开头的（`./x`、`../x`）会被它当成本地路径。
- **skill 的名字要写成小写**。skills CLI 按名字选 skill 时不分大小写，但装出来的目录名是它把名字转成小写、把小写字母、数字、`.`、`_` 之外的字符连成的一段换成一个连字符、再去掉首尾的 `.` 和 `-` 之后的样子（读它 1.7.2 的源码 `sanitizeName` 确认的）。安装器的状态和复核看的是 `<skillsDir>/<目录里登记的名字>`，所以只收经它那样处理之后一字不变的名字：上游声明成 `Humanizer-ZH` 的，登记成 `humanizer-zh`。规格的字面只说了「字母或数字开头，后面只有字母、数字、点、下划线、连字符」，这里多出来的三条（小写、不以 `.` 或 `-` 结尾、连字符不连着写）都出自这个理由；维护者 2026-10-11 确认了「只收小写」和来源「每段以字母或数字开头」这两处收紧。
- `Catalog.thirdPartySkills` 是读出来的条目；数组可以缺省，缺省当作空。

**状态**

只看目标位置 `<skillsDir>/<skill 的名字>` 下有没有东西（`lstat` 成功就算有：目录、文件、符号链接都算）。不比较版本，不写也不认安装标记，没有「非本工具安装」这一种。

| 条目 | 列表里那一栏 |
|------|--------------|
| 只含一个 skill | `未装` / `已装` |
| 含多个 skill | 一个都没装 `未装`；否则 `已装 <已装几个>/<共几个>` |
| `hosts` 里没有这个宿主 | `不支持` |

一个宿主都没检测到时不可选（「需要 AI Agent」）；所选的宿主一个都不支持时不可选（「需要别的 AI Agent」）；只支持其中一部分时可选，只装进支持的那些（共用 skill 目录上：它不支持的那个宿主那一栏写「不支持」，汇总里宿主那一格没有它的名字——尽管装进去之后那个宿主也读得到）。清单里各个 skill 各写各的：`未装`、`已装`、`不支持`。

**命令**

所选的宿主先按 skill 目录归组（见第一个 Scenario 的「按 skill 目录归组」）；每个要装的 skill 在每一组下各是一项，各有一条命令、一行结果：

```
npx -y skills@1 add <source> --skill <名字> --agent <宿主在 skills CLI 里的名字> --yes --global
```

**一组只展示、只执行一条命令**（工单 03）：同时选了 Codex 和 Pi 时，它们共用一个 skill 目录，是一组——agent 名和额外的环境变量取这一组里排在最前的那个宿主的（`--agent codex`），宿主那一格写「Codex、Pi」，复核、同名目录的另问也只有一次。条目用 `hosts` 限定了宿主时，一组里只算它支持的那些：`hosts` 是 `["pi"]` 时这一组只剩 Pi，命令是 `--agent pi`，宿主那一格写「Pi」；一组里一个都不支持就不出这一项。

装到项目时没有最后的 `--global`，别的一个字不变；并且**在项目目录下运行**（外部命令执行器的 `cwd`）——skills CLI 不带全局选项时装进它的当前目录。

| 项 | 约定 |
|----|------|
| 版本 | 钉在实测过的主版本 `skills@1`，写在 `install-third-party.ts` 里，不随它的最新版漂移 |
| 参数的先后 | `source` 紧跟 `add`，在 `--skill` 之前：skills CLI 的 `--skill`、`--agent` 会把后面不以 `-` 开头的词都收走 |
| 一条命令一个 skill、一个 agent 名 | 展示的和执行的才能是同一份（没同意覆盖的那一项整条不执行，别的命令一个字不用改）；一条命令对一行结果，退出状态说得清是谁的；一次只给一个宿主时落下的是真实目录而不是符号链接。代价见下面的 Design Decision |
| 怎么执行 | 外部命令执行器不经 shell 的那种方式：命令和参数分开传，输出不上屏，也读不到用户的输入。它自己的字符画、框线、进度到不了终端，也没有机会提问 |
| 额外的环境变量 | `DISABLE_TELEMETRY=1`、`DO_NOT_TRACK=1`（关掉它的遥测，两个它都认）；外加这个宿主的 `skillsCli.env`。两种安装范围带的是同一份 |
| 在哪个目录下运行 | 装到全局：不指定（进程自己的当前目录，它不影响全局的落点）。装到项目：项目目录。展示的命令里不写目录——项目目录就是用户运行安装器时所在的目录，照着敲落在同一处 |
| 列在哪 | 终端界面：「将执行的命令」里，排在 MCP 和工具的前面，完整展示，环境变量不写在里面。网页界面的汇总不列命令 |

`skillsCli.env`：Claude Code 是 `{ CLAUDE_CONFIG_DIR: '' }`，Codex 和 Pi 是空的。Pi 的 agent 名是 `pi`：skills CLI 1.7.2 认识它，全局装到 `~/.agents/skills`、不带全局选项时装到运行目录下的 `.agents/skills`（读它的源码确认的，记在任务 `10-12-installer-add-pi-omp-hosts` 的 `research/pi-omp-host-facts.md`），正是 Pi 的适配里那两个 skill 目录，所以不用另带环境变量。skills CLI 给 Claude Code 装全局 skill 时认 `CLAUDE_CONFIG_DIR`（装到 `<那个目录>/skills`；2026-10-10 实测），而本安装器的 skill 目录不认它（见 [安装 MCP](./mcp-install.md) 记的那处不一致）。不把它清空的话，设了这个变量的机器上命令会装到别处：复核判失败，而那边的同名目录没经询问就被覆盖了。**代价**：终端界面的汇总里展示的命令不带这个变量，设了它的用户照着自己跑一遍，会装到 `<CLAUDE_CONFIG_DIR>/skills`，和安装器装的不是一处。实现时定的，维护者 2026-10-11 确认。

> **Warning**：skills CLI 另外会往用户的状态目录里写一个 `skills/.skill-lock.json`（`XDG_STATE_HOME` 下，记着装了哪些 skill、来源和时间）。安装器不读它，也不清它；手动核对时要把 `XDG_*` 也指到临时目录。**装到项目时它不写那一个，改在项目目录的最上层写一个 `skills-lock.json`**（和 `.claude`、`.agents` 并排；2026-10-11 实测）。安装器同样不读、不清，汇总里也不提它——用户的项目里会多出这个文件，要不要在画面上交代一句，维护者还没有定。

**成败看复核**

命令结束后 `<skillsDir>/<名字>/SKILL.md` 在才算装上，不看退出状态；`installThirdPartySkill` 不抛错。各种结局的结果行见下面的出错矩阵。

**流程里的位置（先后在 `listing.ts` 和 `plan.ts`；下面的提问和画面说的是终端界面，在 `flow.ts`，网页界面的见最后一条）**

- 混合列表里第三方 Skill 自成一段，排在本仓库的 skill 之后、MCP 之前；段内带推荐的在前，其余按名字。
- 列表确认之后、问 key 之前，**每个勾选的、含多个 skill 的条目各问一次**要其中哪几个（多选，起始一个都不勾）；只含一个的不问。清单里一个都不勾就确认：这一条不装，其余勾选的照常。汇总里选「返回修改」再走到这一问时，上次勾的还在。
- 汇总里它们自成一张小表「第三方 Skill」，一行是一个 skill 在一个 skill 目录下（宿主那一格是用这个目录的那几个所选宿主），带位置；目标位置已有东西的操作是「覆盖」，备注「已有同名目录，另行确认」。「将安装 N 项」数的是条目（清单里一个都没勾的不算）。
- 这一轮有第三方 Skill 要装时，命令下面多一行「注意」：装的是作者当时的最新版，维护者没有逐版检查。排在覆盖的提醒之后。
- **目标位置已有东西的，选了「开始安装」之后、执行之前逐项另问**，缺省不覆盖——skills CLI 自己遇到同名目录是直接覆盖的。排在本仓库 skill 的那几问之后。没同意的那一项不执行命令，结果里是「跳过 未同意覆盖，保持原样」。想更新一个已经装过的第三方 Skill 也要答一次「是」。
- 执行的先后：本仓库的 skill、第三方 Skill、MCP、工具。前三样共用「正在安装」分区，进行中的那一行写「正在安装…」。
- **网页界面里是同样的规矩、换了地方**：含多个 skill 的条目勾上之后在卡片上当场挑（意图 `choose`），不另问；汇总里一个条目一段、每个 skill 一小组，不列命令；目标位置已有东西的在汇总里逐项勾「覆盖它」，缺省不勾；执行的先后和成败怎么判不变。见 [网页界面的契约](./web-ui-contract.md) 的「第三方 Skill」。

### 4. Validation & Error Matrix

目录里写坏的第三方 Skill 条目只跳过那一条，带着原因进 `Catalog.skipped`（规则见上表）；`thirdPartySkills` 存在但不是数组时整份目录读不了（目录格式有误，指出字段）。

单项安装的结局，只这一项受影响，退出状态不变：

| 复核 | 命令 | 结果行 |
|------|------|--------|
| 有 | 以 0 退出 | `✓ … 已安装`（没有版本号） |
| 有 | 非零退出，或没能运行 | `✓ … 已安装；安装命令退出状态 1`——覆盖已有目录而命令失败时，那里留着的是原来的那一份，所以要说 |
| 没有 | 以 0 退出 | `✗ … 失败 安装命令已结束，但目标位置没有 SKILL.md` |
| 没有（装到项目，而命令把它装到了别处，比如全局） | 以 0 退出 | 同上一行：复核只看按安装范围定的那个目录，别处有没有不算 |
| 没有 | 非零退出 | `✗ … 失败 安装命令退出状态 1` |
| 没有 | 没能运行 | `✗ … 失败 安装命令没能运行（ENOENT）`；错误没带错误码时不写括号 |

- 原因里不转述 skills CLI 的话（理由见 [安装 MCP](./mcp-install.md) 的 Design Decision）；终端界面里完整的命令在汇总里，用户可以照着自己跑一遍看原因；网页界面的汇总不列命令，没有这条出路。
- 执行器当场抛出（没返回承诺）的也算「没能运行」，不取错误的消息。
- 没同意覆盖的那一项不执行命令，结果是「跳过 未同意覆盖，保持原样」，计入合计的跳过。

### 5. Good/Base/Bad Cases

- Good：只检测到 Claude Code，勾了只含一个 skill 的条目 → 不多问，汇总一行「新装」、一条命令、一行提醒；确认后记录到的正好是那一条（带着三个环境变量，不是 shell 方式），结果「已安装」。
- Good：Claude Code 和 Codex 都选了，勾了含三个 skill 的条目，清单里勾两个 → 四条命令（每个 skill、每个 skill 目录一条），汇总和结果各四行，「将安装 1 项」。
- Good：同时选了 Codex 和 Pi，勾了只含一个 skill 的条目 → 展示的和执行的都只有一条（`--agent codex`），汇总和结果各一行「Codex、Pi」，合计「1 成功」。三个宿主都选了时两条：Claude Code 的一条，共用 skill 目录的一条。
- Base：同时选了 Codex 和 Pi，条目的 `hosts` 是 `["pi"]` → 一条命令 `--agent pi`，宿主那一格只写「Pi」；`hosts` 是 `["claude-code"]`、三个宿主都选了 → 只有 Claude Code 的那一行和那一条命令。
- Base：清单里一个都不勾 → 这一条不装；同一轮勾的别的条目照常进汇总；只勾了它时没有汇总，直接回主菜单。
- Base：`~/.claude/skills/note-taker` 已经在（哪怕里面没有 `SKILL.md`，哪怕是个文件或符号链接）→ 列表里「已装」，汇总里「覆盖」加备注和一行覆盖的提醒；选了开始安装之后另问，直接回车（否）→ 那条命令不执行，原样留着，结果「跳过」。
- Base：条目的 `hosts` 是 `["codex"]`，Claude Code 和 Codex 都选了 → Claude Code 那一栏「不支持」，只有装进 Codex 的那一条命令；只检测到 Claude Code 时这一行不可选。
- Bad：命令以 0 退出但目标位置没有 `SKILL.md`（上游改了 skill 的名字，目录里登记的对不上）→ `失败 安装命令已结束，但目标位置没有 SKILL.md`，别的项照常。
- Bad：机器上没有 `npx` → `失败 安装命令没能运行（ENOENT）`，安装器不退出。
- Bad：`source` 写成 `../repo`，或 skill 的名字写成 `--all` → 这一条被跳过，目录校验命令指出字段。

### 6. Tests Required

都经 `runInstaller`，在 `cli/test/third-party.test.ts`（装到全局）和 `cli/test/scope.test.ts` 的「把第三方 Skill 装到项目」一组（命令不带 `--global`、在项目目录下运行、复核和同名目录的另问按项目目录）；网页界面那一边在 `cli/test/web-third-party.test.ts`（记录到的命令与终端界面逐条相同，见 [网页界面的契约](./web-ui-contract.md)）；条目校验的说法在 `validate-catalog.test.ts`，真实的清单画面在 `prompts.test.ts`。

- 假的执行器不会真的装东西：让 `commandResult` 在「执行」那条命令时往第三个参数给的 `home` 里写出 `<skill 目录>/<名字>/SKILL.md`（模拟装上了），或什么都不写（模拟没装上）。
- 记录到的命令在 `result.commands` 里多两样：不经 shell 的带着 `env`（额外的环境变量，没有就没有这个键），整行交给 shell 的仍是 `shell: true`。**期望值写成字面的命令**。
- 向 GitHub 查询失败要用 `fakeGitHub()` 单独证一条：本仓库的 skill 一个都不装，第三方 Skill 照常（它不经那次查询）。
- 真实的清单画面在 `prompts.test.ts` 的「真实的画面：第三方 Skill」：按键提示整行、收成一行（勾了的名字、「不装」）、`NO_COLOR`、没有 Unicode、英文加没有 Unicode 时按键提示仍在 79 列以内。空行的规则在 `spacing.test.ts`，栏间隔在 `columns.test.ts`。
- 至少覆盖：只含一个 skill 的直接装；含多个的出清单、勾几个装几个、一个不勾则不装而其余照常；每个 skill 目录一条命令（Claude Code 加 Codex 是两条；共用一个目录的 Codex 加 Pi 是一条，在 `shared-skills.test.ts`）；带着关遥测的环境变量、不是 shell 方式；退出 0 而没有 `SKILL.md` 判失败；非零退出与没能运行时结果行的写法；已有同名目录时另问、`accept()` 证明缺省不覆盖、没同意的不执行命令；宿主限制（一栏「不支持」、只装进支持的；一个都不支持时不可选）；写坏的条目被跳过；取消则一条命令都不执行；一项失败不影响其余项。

### 7. Wrong vs Correct

#### Wrong

```ts
// 把同一个仓库里勾选的几个 skill 合进一条命令：用户随后没同意覆盖其中一个，执行的就不是展示的那一条了
['add', source, '--skill', ...names, '--agent', agent, '--yes', '--global']
```

```ts
// 看退出状态判成败：名字对不上时它照样可能以 0 退出，什么都没装
outcome = result.exitCode === 0 ? 'installed' : 'failed';
```

```ts
// 来源放在 --skill 后面：它会被当成又一个 skill 的名字收走
['add', '--skill', name, source]
```

#### Correct

```ts
// 一条命令一个 skill、一个 agent 名；计划里的这个 Command 对象就是之后执行的那一个（终端界面的汇总展示的也是它）。
// host 是这一组里排在最前的、条目支持的那个宿主
const command = skillsCliCommand(entry.source, name, host, scope);
// 成败只看复核：看的是这个安装范围下的 skill 目录；装到项目时在项目目录下运行
const result = await installThirdPartySkill(command, host, runCommand, () => hasSkillFile(skillsDir, name), cwd);
```

### 已知的限制

- **两个条目里有同名的 skill，或第三方 Skill 和本仓库的 skill 同名**：它们的目标位置是同一个目录。同一轮里一起勾选时，后装的盖掉先装的，而且不会另问——状态是在执行之前探测的，那时目录还不在。安装器和目录校验命令现在都不查这个，靠录入时避开（见 [清单与版本](../skills/manifest-versioning.md)）。
- **装到的是作者当时的最新版**，不钉版本、不比较版本、没有更新提示和卸载；想更新一个已经装过的就再装一次并同意覆盖。
- **只在 macOS 上用真实的 skills CLI（1.7.2）核对过**，记录在任务 `10-10-catalog-purpose-categories` 的 `research/third-party-trial-record.md`；Windows 上经 `npx.cmd` 起它时参数的转义、Linux 上的表现都没有实测，自动化测试用的是假的执行器，测不到。
- skills CLI 升了主版本（`skills@2`）之后要重新核对三件事再改钉的版本：参数的读法（`--skill`、`--agent` 收走后面的词）、目录名怎么取（`sanitizeName`）、遥测和 `CLAUDE_CONFIG_DIR` 两处环境变量。

---

## Design Decision: 第三方 Skill 一条命令只装一个 skill

**Context**：skills CLI 的 `--skill` 可以一次跟几个名字，一条命令能把同一个仓库里勾选的几个 skill 一起装进一个宿主。对比页上画的也是这种（每个条目、每个宿主一条）。

**Decision**：每个 skill、每个宿主各一条命令（工单 03 起：共用一个 skill 目录的几个宿主算一组，一组一条）。理由有二：覆盖前的询问排在确认之后，合在一条命令里的话，用户没同意其中一个时执行的就不是展示的那一条了；结果行本来就是每个 skill 每个宿主（每一组）一行，一条命令对一行，退出状态才说得清是谁的——合在一起时名字对不上的那个 skill（上游改了名）它并不报错，只装对得上的、照样以 0 退出（2026-10-10 实测），非零退出时又分不出是哪一个没装上。

**代价**：同一个仓库勾了几个 skill 就要拉几次（每次约 4 秒，仓库大的更久）；将执行的命令也多出几条。实现工单 09 时定的，维护者 2026-10-11 确认（两种做法的代价都说明过之后选的这一种）。

---

## Design Decision: 宿主在不在，看可执行路径而不是去执行它

**Context**：规格说“以 `claude` 命令是否可用判断”。可以经外部命令执行器跑一次 `claude --version`，也可以自己在可执行路径上找。

**Decision**：自己找。跑一次要几百毫秒，每次启动都付；Windows 上 `claude` 是个 `.cmd`，要经 shell 才跑得起来；测试里记录到的命令列表会混进探测用的那一条，之后断言 MCP 的命令时碍事。工具的检查方式里本来就有“某个命令在不在可执行路径上”这一种，到时候用的是同一个判断。

**代价**：靠 shell 别名才能用的 `claude`（不在可执行路径上）检测不到——但那种情况下跑一次也一样找不到。

---

## Design Decision: 装进两个宿主就下载两次

**Context**：同一个 skill 装进两个宿主，内容是一样的。可以下载一次再复制到两处，也可以每个宿主各走一遍安装动作。

**Decision**：各走一遍。这说的是两个**不同的** skill 目录（Claude Code 的和共用 skill 目录）；共用一个目录的几个宿主（Codex 和 Pi）在算计划时就合成了一项，只下载一次、只写一次，见「按 skill 目录归组」。安装动作的签名是「条目 + 目标目录」，A Team Workflow 将来要直接调用它，不能让它认识“几个目标”；各走一遍还让两个宿主的结果天然独立——一处下载中断或写不进去，另一处照常，结果里各有一行。

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

**没有经维护者确认**；要它固定出现，改 `plan.ts` 里 `notices.overwrites` 那一个条件即可。

---

## Common Mistakes

### 版本号和提交号不是同一时刻取的

**Symptom**：安装标记里的 `version` 是旧的，`commit` 却是新的。

**Cause**：`index.json` 在启动时从 `main` 读，提交号要到确认安装之后才查；这中间 `main` 上有新提交就会对不上。窗口是用户停在菜单里的那段时间。

**现状**：没有处理。后果是下次运行时这个 skill 显示为版本不同（`<旧> → <新>`），重装一次就对上了。要根治得在钉住提交之后按那个提交重读 `index.json`；要不要做还没有定。
