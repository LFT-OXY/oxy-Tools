# 收尾核对记录（工单 05）

核对日期 2026-10-12，在本机（macOS，Node 24.15.0）做的。对照的是 `prd.md` 的「Acceptance Criteria」，「四个宿主时的版式」各条末尾维护者实现时又定的几处以它们为准。

三类分开列：核对过且达到的、没有核对的、没有达到的。每条写明是怎么核对的。「跑了测试」指下面「测试与命令」那一节的三次全量运行里那条用例通过，不是另外单跑。

## 这次是拿什么核对的

**测试与命令**（都在 `cli/` 下）

| 跑了什么 | 结果 |
|----------|------|
| `npm test`（Node 24.15.0） | 42 个文件、1503 条，全过 |
| `npx -y node@22.13.0 node_modules/vitest/vitest.mjs run` | 42 个文件、1503 条，全过 |
| `TMPDIR=/tmp npm test` | 42 个文件、1503 条，全过 |
| `npm run typecheck` | 通过 |
| `npm run build`，再 `node dist/bin.js --version` | 通过，打出 `0.5.0` |
| `npm run validate-catalog -- ..` | 通过：13 个 skill、23 个第三方 Skill、11 个 MCP、0 个工具、64 个外部项目、10 个用途 |
| `npm pack --dry-run` | 版本 0.5.0，`dist/web/` 下四个文件、`README.md`、`LICENSE` 都在 |

**两份预览**（版本号升到 0.5.0 之后各生成一遍）

- `npm run preview`：340 个画面。`npm run preview:web`：171 格，它自带的两道检查（假装填的 key 哪里都没有；每一格在 1280×800 和 1024×768 下没有放不下的地方，含宿主勾选不在同一行、「未检测到」和最后一个名字拆开、汇总里宿主那一格比它那一栏宽）都过了，否则不出预览。
- **终端界面的 340 个画面全部抽成文字量过宽度**：除通栏横线和分区标题线，占满 80 列的只有一行——「外部项目的说明与链接 · 链接比一行长」里那条网址，是「网址和路径整条写在一行上」那条规矩管的。预览是按 80 列的终端画的，一行超出第 79 列被折断就会表现为占满 80 列的一行，所以这等于说 340 个画面里没有别的行被终端折断。
- **拿任务开始前的代码（`c7f68aa`，`git archive` 解到临时目录）各生成了一份对照**，按格名逐格比文字：
  - 终端界面：改动前 261 个画面，现在都还在。3 格一字不差，13 格只差版本号；其余 245 格差的只有这几样——版本号；「AI Agent」那一行；写哪些宿主没检测到的那一句「注意」（名字多了，英文和「；外部项目仍可浏览」那半句因此多折一行）；选了 Codex 的格里多出共用 skill 目录的那一句；另有两格英文的汇总（「装到项目的汇总」「含第三方 Skill 的汇总与结果」）里原先被终端折断的长位置改成了另起一行。
  - 网页界面：改动前 98 格，现在都还在。比的是每格页面上的文字：8 格文字一样（图也逐字节相同），其余 90 格差的只有版本号、写宿主没检测到的那几处、选了 Codex 的格里共用 skill 目录的那一句。
  - 另查了一遍：现在的 340 个画面里出现共用 skill 目录那一句的有 146 格，所选的宿主里都有 Codex、Pi、omp 之一；只检测到 Claude Code 的 116 格里一格都没有。网页界面只检测到 Claude Code 的 6 格里也没有。
- **看过的截图**存在任务目录 `screenshots/`，文件名以 `05-` 开头，72 张：终端界面 20 张（四个宿主的主菜单、宿主勾选、列表、汇总、结果、装到项目、位置另起一行，中英文；只检测到 Claude Code、只检测到 omp、一个都没检测到），网页界面 26 格深浅各一张（四个宿主的开场引导、浏览、MCP 那一区、第三方 Skill 那一区、汇总、结果，1280 与 1024，中英文；只检测到 Claude Code 的开场引导与浏览；只检测到 omp；选了 Claude Code 和 omp）。**我逐张用眼看过的是其中 9 张**（下面各条里点了名的），其余靠上面的文字对照和预览自带的检查。

**规范**（`.atw/spec/cli/`）

- `ui-design.md` 里 69 个终端画面的示例、`terminal-output.md` 里 1 个，逐行逐字对过新生成的预览：每一行都在预览里找得到，68 个整块连着出现在某一个画面里，剩下一个是从四个画面各取一行拼的（四种填 key 的结局，文中写明了）。没有要重取的示例。
- 机械核对了四样：规范里提到的测试文件都存在；任务期间新增的行里 142 个反引号标识符都能在 `cli/` 里找到（唯一找不到的 `normalizePath` 是 Pi 自己源码里的函数名）；点名的本任务截图都在任务目录里；带「 · 」的预览格名都对得上（对不上的几个是省掉了前缀「浏览 ·」的简写，或根本不是格名）。
- 搜了被后面的工单换掉的旧说法（omp 那一栏写「不支持」、每个所选的宿主一栏、每个没检测到的各写一遍、96px、「装给其中一个」），**找到两处并改了**：`index.md` 的 Guidelines Index 里「omp：栏里写不支持」，`terminal-output.md`「选择安装范围」那一节里「状态里的 `no-config`（栏里也是不支持）」——都改成工单 06 之后的样子（列表里不为它出栏）。
- 通读的有：`index.md` 全文；`mcp-install.md`、`installer-entry.md`、`terminal-output.md` 在任务期间新增的全部行；`skill-install.md` 新增行的前一半（宿主对照表、宿主行、按 skill 目录归组、共用 skill 目录的说明）。没有通读的见「没有核对的」。

## 核对过且达到的

按「Acceptance Criteria」的先后。

1. **检测与先后**——达到。`hosts.test.ts`「只检测到 Pi」「只检测到 omp」「检测到四个宿主」三组（可执行路径上有 `pi` / `omp` 就算检测到；宿主选择里依次是 Claude Code、Codex、Pi、omp）；`cli/src/hosts.ts` 的 `ADAPTERS = [claudeCode, codex, pi, omp]`；截图 `05-web-guide-four-hosts-1280-dark.png`（看过：四个勾选依次是这四个名字）；终端界面的那一格存了 `05-terminal-host-picker-four-hosts-80col.png`，靠的是测试，图没有另外用眼看。
2. **只检测到 Pi 或 omp 时 skill 装到全局和项目**——达到。全局：`hosts.test.ts` 那两组的第一条（落在主目录的 `.agents/skills`，带安装标记）；项目：`pi.test.ts`「装到项目：…落在项目目录的 .agents/skills 下，主目录里什么都不多」、`omp.test.ts`「把本仓库的 skill 装给 omp」的头两条。
3. **第三方 Skill 装给 Pi 和 omp，agent 名是 `pi`**——达到。`pi.test.ts`「把第三方 Skill 装给 Pi」、`omp.test.ts`「把第三方 Skill 装给 omp」（命令是字面值，`--agent pi`；装到项目不带全局选项、在项目目录下运行）；预览「汇总与结果 · 第三方 Skill · 只检测到 omp」里三条命令都是 `--agent pi`。真实的 skills CLI 在没装 Pi 的机器上认不认这个名字没有核对，见下一节。
4. **共用 skill 目录上只装一次、各一行、合计按行、覆盖只问一次**——达到。`shared-skills.test.ts`（Codex 和 Pi）、`omp.test.ts`「同时选了共用 skill 目录的几个宿主」两组（Codex、Pi、omp：汇总、进行中、结果各一行，合计 1 成功，只写一份；第三方 Skill 只有一条命令；三个宿主只问一次覆盖）；网页界面 `web-shared-skills.test.ts`、`web-omp.test.ts`。截图 `05-web-summary-four-hosts-1024-dark.png`（看过：每个 skill 两行，「Claude Code」「Codex、Pi、omp」）。
5. **共用 skill 目录的那句说明**——达到。`shared-skills.test.ts`「共用 skill 目录的那句说明」一组（只选 Pi、只选 Codex 有；只选 Claude Code、列表里只有 MCP、工具、外部项目时没有；英文）、`omp.test.ts`「只选了 omp 时列表上方也有」、`web-shared-skills.test.ts`；上面预览里数的那一遍（146 格与 116 格）。
6. **Pi 的 MCP 装到全局和项目**——达到（对的是假的 `pi` 命令）。`pi-mcp.test.ts`：「装到全局」「装到项目」两组的命令是字面值（项目带 `-l`、在项目目录下运行），两组「Pi 的 MCP 状态」（用户级的 `mcp.json`、项目的 `.pi/mcp.json`、`PI_CODING_AGENT_DIR` 含 `~/` 和单独一个 `~`）；网页界面 `web-pi-mcp.test.ts`。真实的 Pi 认不认这几条命令没有核对，见下一节。
7. **装到项目的两句提醒**——达到。`pi-mcp.test.ts`「把 MCP 装到项目的 Pi：提醒」一组（明文写进 `.pi/mcp.json`、写的是变量名；要在这个目录下启动 `pi` 批准之后才启用；选全局时没有；没有登录的提醒）。
8. **omp 的 MCP**——达到。`omp.test.ts`「omp 的 MCP 安装器不装」四组（四个宿主时没有 omp 的那一栏；那句说明什么时候有、排在哪；只检测到 omp 时 MCP 都不可选、原因「需要别的 AI Agent」；omp 自己的配置文件写坏了不提、装完原样留着；每条走到安装的用例都断言没有命令名是 `omp` 的、主目录和项目目录下没有出现 `.omp`）；网页界面 `web-omp.test.ts`、`web-status-columns.test.ts`。`cli/src/hosts.ts` 里 omp 的适配没有 `mcp`、没有读写它任何文件的代码。截图 `05-terminal-list-five-kinds-four-hosts-80col.png`（看过）。
9. **列表里的状态按 skill 目录归组**——达到。`status-columns.test.ts`、`web-status-columns.test.ts`；截图 `05-terminal-list-five-kinds-four-hosts-80col.png`（看过：表头「Claude Code」「Codex、Pi、omp」两栏，MCP 的三个栏名写在 `── MCP` 那一行上并和状态对齐，这一段不写说明——和 `prd.md` 里维护者看着选的示意一样）、`05-web-browse-four-hosts-1280-light.png`（看过）。
   - **维护者 2026-10-12 定的（工单 06 ①）**：网页卡片底部的状态放得下就一行，放不下时一段占一行。看到的正是这样：`archify`「Claude Code 已装 2.16　Codex、Pi、omp 已装 2.16」一行；`explanation`（`0.9.0 → 1.0.0`）、`writing-for-agents`（「非本工具安装」）两段各占一行，段名和状态没有截断、没有从一段中间折开。「四个宿主都选了时 Skill 卡片的状态一行放得下」按这个意思算达到。
   - **维护者 2026-10-12 定的（工单 06 ②）**：选了 Claude Code 和 omp 时 MCP 那一段照表头排、标题行上不另写栏名、说明一栏保留。`status-columns.test.ts` 里「选了 Claude Code 和 omp」那一条守着；这一格的截图存了（`05-web-browse-claude-and-omp-mcp-1280-*.png` 是网页那一边的），终端那一格我没有另外用眼看。
10. **没检测到的宿主合成一句；开场引导的勾选整组换行；汇总里位置另起一行；网页汇总里宿主那一格**——达到。
    - 合成一句：`hosts.test.ts`「AI Agent」那一组（按格比，中英文）、`web-omp.test.ts`「检测到 Claude Code 和 Codex：两个各一项在前，Pi 和 omp 合成一项在后」；截图 `05-web-browse-claude-only-1280-dark.png`（看过：顶上「装进 Claude Code　Codex、Pi、omp 未检测到」，左栏同一句）。**维护者 2026-10-12 定的（工单 07 ①）**：网页界面的那一句不带短横，终端界面带——看到的就是这样。
    - 整组换行：预览自带的检查过了；截图 `05-web-guide-four-hosts-1280-dark.png`、`05-web-guide-four-hosts-en-1024-dark.png`（都看过：四个勾选一起在提问的下一行）。
    - 位置另起一行：`summary-location.test.ts`（含 79 / 80 列的边界）；截图 `05-terminal-summary-location-own-line-four-hosts-en-80col.png`（看过）。**维护者 2026-10-12 定的（工单 08）**：另起的那一行缩进到哪留到验收时看——现在是对着「AI Agent」一栏的左缘（放得下时对着「操作」一栏），备注排在位置下面；这一条我只确认了画面和规范写的一致，缩进合不合意要维护者看那张截图定。
    - 宿主那一格：截图 `05-web-summary-four-hosts-1024-dark.png`、`05-web-summary-four-hosts-en-1024-light.png`（都看过：「Codex、Pi、omp」「Codex, Pi, omp」一行，没有折行、没有截断）；`cli/web/style.css` 里那一栏是 112px。
11. **80 列下没有一行超出第 79 列被折断**——达到。`omp.test.ts`「四个宿主都选了时的 80 列」（中英文）、`pi.test.ts`「三个宿主都选了时的 80 列」、`status-columns.test.ts` 的 80 列那一组；加上面那一遍对 340 个画面的宽度的量法，其中四个宿主都选了、只检测到其中一个（Claude Code、Codex、Pi、omp 各有）、一个都没检测到的中英文画面都在内。
12. **只选 Claude Code、或只检测到 Claude Code 时与改动前一样**——达到，带一处维护者定的例外。
    - 画面：上面和 `c7f68aa` 的逐格对照。差的只有写别的宿主没检测到的那几处（标准里写明除外的）、版本号（这张工单升的），和两格英文汇总里位置另起一行——那是 `prd.md`「四个宿主时的版式」第 4 条定的，原先是被终端从路径中间折断。
    - 落下的文件：装 skill、MCP、工具的原有测试文件（`install-skill.test.ts`、`scope.test.ts`、`mcp.test.ts`、`mcp-keys.test.ts`、`third-party.test.ts`、`tools.test.ts` 等）自 `c7f68aa` 以来一行没改，三种环境下都过；改过的原有测试文件只有 8 个，合计删了 32 行，都是列出全部宿主名字的那几句和工单 08 改掉的长位置。
    - 网页界面顶上那一条：1280 宽、中文是一行（截图 `05-web-browse-claude-only-1280-dark.png`，看过）。**维护者 2026-10-12 定的（工单 07 ②）**：只检测到一个宿主、1024 宽、英文界面时比 `c7f68aa` 多一行，接受、画面不动——看到的是三行（截图 `05-web-browse-claude-only-en-1024-light.png`，看过）。其余几种窗口和语言的行数是工单 07 量的（`.atw/spec/cli/web-ui-design.md` 和 `screenshots/07-baseline-c7f68aa-web-topbar-rows.txt`），这次没有重量。
13. **中英文案齐全**——达到。中文和英文两份文案是同一个类型（`cli/src/messages.ts` 的 `Messages`），缺一句类型检查就不过；上面各组测试都有英文的一条。
14. **文档与规范已更新；`GLOSSARY.md`、ADR-0005 与实现一致**——达到。
    - `README.md`、`cli/README.md`（中英两段）这张工单改了：支持的四个宿主、要事先装好其中至少一个、各宿主的 skill 装到哪、Codex、Pi、omp 共用同一个 skill 文件夹、MCP 能装到哪些范围（Codex 只能全局，Pi 全局和项目，omp 不装、在 omp 里用 `/mcp add`）、带 key 装到项目时 Pi 的那个文件。里面的路径、命令名、那两句话对着 `cli/src/hosts.ts` 和 `cli/src/messages.ts` 核过。`cli/package.json` 的包描述、`.atw/spec/skills/index.md` 里列宿主的那半句跟着改了。
    - `GLOSSARY.md`：「宿主」举的例子是四个；「共用 skill 目录」的定义和 `hosts.ts` 的 `sharedSkillsDirs`（Codex、Pi、omp 三份适配用的是同一对目录）对得上。**没有发现出入，两份文件都没有动。**
    - ADR-0005：装进 `.agents/skills`、全局在主目录下项目在项目目录下（`hosts.ts`）；同时选了几个时只装一次、结果里合成一行（第 4 条）；界面把这件事告诉用户（第 5 条）；不处理 omp 从两个目录读到同名 skill（代码里没有为此做的事，`omp.test.ts`「选了 Claude Code 和 omp：它们的目录不同，仍是各一行」）。
15. **三种环境的测试、类型检查、构建**——达到，见最上面那张表。
16. **版本号是 0.5.0**——达到。`cli/package.json`、`cli/package-lock.json`（最前面两处）一致；`node dist/bin.js --version` 打出 `0.5.0`；规范里带版本号的五幅示例、一句说明和开场动画表里的一行跟着改了，`git grep -F 0.4.0` 在 `cli/`、`.atw/spec/`、两份说明文档里没有残留。npm 上现有的版本是 0.1.0 到 0.4.0，0.5.0 没有被占用。
17. **虚拟机走查清单**——写了，在同目录的 `vm-walkthrough-checklist.md`：「Further Notes」第 7 条的五项各一步，每步有敲什么、应当看到什么、看到别的说明什么。清单里引的汇总、命令、结果、提醒的原文对过预览里对应的画面。**清单本身没有照着跑过。**

## 没有核对的

1. **真实的 Pi 和 omp**（`prd.md`「Further Notes」第 7 条的五项，全部没有核对；自动测试用的是假的 `pi`、`omp` 命令）：
   - 没装 Pi、只装了 omp 的机器上 `npx skills add … --agent pi` 是否仍把 skill 装进 `.agents/skills`；
   - omp 是否读得到共用 skill 目录里的 skill，Claude Code 那边有同名的时是否只用一份、不报错；
   - Pi 是否读得到共用 skill 目录里的 skill；
   - `pi mcp add`、`pi mcp remove`（全局的、带 `-l` 的、带 `--env` 的）真实的 Pi 认不认，装到项目后启动 `pi` 是否问要不要信任；
   - Windows 上 `pi` 命令能否不经 shell 起来。
   这些在走查清单里，由维护者在虚拟机里做。第 3、6 条「达到」说的是安装器执行了规格写的那条命令，不是那条命令在真实的宿主上管用。
2. **CI 上的 Linux 和 Windows**：没有推送，CI 没有跑。本机只有 macOS；`TMPDIR=/tmp` 那一遍只重现了 Linux 上临时目录短这一样。
3. **网页界面的逐像素对照**：这次和 `c7f68aa` 比的是每格页面上的文字，不是图——版本号一变每一格的图都不同。版式上动过的地方（汇总里宿主一栏由 96px 加宽到 112px，操作和位置因此右移 16px）靠的是工单 08 当时的逐格比图记录，这次没有重做。
4. **两份预览没有每一格都用眼看**：511 格里逐张看过的是 9 张截图，其余靠文字对照、量宽度和预览自带的检查。只有眼睛看得出的毛病（颜色、对齐差一两个像素、深浅色下的观感）这次不会被发现。
5. **规范没有逐行读完**：`ui-design.md`、`web-ui-design.md`、`web-ui-contract.md` 在任务期间新增的行，和 `skill-install.md` 新增行的后一半，这次只做了上面说的机械核对和搜旧说法，没有通读。这几份里若还有与实现不一致的叙述（不是示例、不是点名的文件和标识符），这次查不出来。
6. **规范里量到的数没有重量**：各处写的列数、像素数（如「连键 78 列」「那一句连安装范围 561px」）是各张工单当时量的，这次没有重新量。
7. **用户故事没有逐条核对**：对照的是「Acceptance Criteria」17 条，51 条用户故事没有一条一条过。

## 没有达到的

没有。

维护者已经表过态的四处例外（工单 06 的两处、工单 07 的两处）和留到验收时看的一处（工单 08 另起一行的缩进）记在上一节各条下面，照实标了「维护者 2026-10-12 定的」。

## 发布要执行的命令

由维护者执行；这张工单没有推送，也没有发布。先后是：推送并等 CI → 虚拟机走查 → 发布。

```bash
# 1. 推送，等 CI 全绿（macOS、Linux、Windows 各用 Node 22.13 和 24 跑测试，另有类型检查与目录校验）
git push origin main
gh run watch

# 2. 照 vm-walkthrough-checklist.md 在虚拟机里走一遍

# 3. 发布（在 cli/ 下；publish 不会自动构建，先 build）
cd cli
npm login
npm run build
npm publish

# 4. 发布之后核对
npm view oxy-tools version          # 应当是 0.5.0
npx oxy-tools@0.5.0 --version       # 应当打出 0.5.0
```

两件要留意的事：`npm publish` 得到的是 `PUT 202`（先进待上线区），0.4.0 那次从发布到查得到用了将近三分钟——这期间查是 404、`latest` 还是旧版，**不要再发一次**（会报 `E409`，那表示上一次已经被收下）；Windows 加 Node 22.13 的作业偶尔有一条等画面超时，同一提交重跑就过。
