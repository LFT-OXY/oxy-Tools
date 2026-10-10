# 工单 13 的试装记录：30 个 skill 仓库

> 2026-10-11，macOS，Node 24.15.0，`skills` 1.7.2（`skills@1` 当时解析到的版本）。主会话亲自跑的，没有交给子代理。
> 全程在 `mktemp -d` 建的临时目录里：每个来源一个独立的临时主目录，`HOME`、`CODEX_HOME`、`XDG_CONFIG_HOME`、`XDG_STATE_HOME`、`XDG_DATA_HOME`、`XDG_CACHE_HOME`、`npm_config_cache` 都指到它，驱动脚本开头逐个断言；`CLAUDE_CONFIG_DIR` 不设（安装器给 Claude Code 带的就是清空的）。
> 用 `env -i` 只留 `PATH` 和上面这几个变量：本会话是在 Claude Code 里跑的，不去掉 `CLAUDECODE`、`AI_AGENT` 这些，skills CLI 会因为「检测到 Agent」自己切到非交互，和用户在普通终端里的情形不一样。
> 每个 skill 的原始结果在同目录的 `skill-trial-results.jsonl`（一行是一个 skill 在一个宿主下的一次安装，另有每个来源、每个宿主一行汇总）。

## 结论

- 「汇总」文档里标了 Skill、不在本仓库的 31 个条目：23 个登记为第三方 Skill（`catalog.json` 的 `thirdPartySkills`，共 100 个 skill），7 个登记为外部项目（`apps` 由 57 条变成 64 条），`sammcj/agentic-coding`（文档里的 analyse-design）不录入。每个仓库恰好一条，都没有推荐标记。
- 23 个来源、100 个 skill、两个宿主：**200 次安装全部以 0 退出，目标位置下都有 `SKILL.md`**，落下的都是真实目录（不是符号链接），两个宿主下装出来的文件数和字节数逐个相同。没有一个要改登记为外部项目。
- 目录校验命令和上游核对命令对仓库真实的目录数据都通过（输出见「怎么核对的」）。

## 怎么试的

1. **取清单**：每个来源 `npx -y skills@1 add <来源> --list`，名字以它列出的为准（没有用目录名，也没有用 `skill-intake-analysis.md` 里子代理报的名字）。23 个来源合计 100 个 skill，名字都已经是小写、合 `skills[i].name` 的规则；不同来源之间没有重名，和本仓库的 12 个 skill 也没有重名。
2. **试装**：驱动脚本直接引用安装器自己的代码——`skillsCliCommand()` 拼命令、`installThirdPartySkill()` 加 `systemCommandRunner()` 执行（不经 shell，输入输出都切断，带着 `DISABLE_TELEMETRY=1`、`DO_NOT_TRACK=1` 和宿主的 `skillsCli.env`）、`hasSkillFile()` 复核。所以执行的就是安装器会执行的那一条：

   ```
   npx -y skills@1 add <来源> --skill <名字> --agent claude-code --yes --global
   npx -y skills@1 add <来源> --skill <名字> --agent codex --yes --global
   ```

   每个 skill、每个宿主各一次，一次一条命令。三个来源同时跑，各用各的临时主目录和 npm 缓存。
3. **读装出来的东西**：说明里写的前提和风险，出自装出来的那一份 `SKILL.md`、它带的脚本和仓库的 README（只读，没有运行其中任何脚本）。

驱动脚本的要点（临时目录的字面路径换成了 `<W>`）：

```ts
// node --experimental-strip-types trial.ts <所有者/仓库>；环境由外层的 env -i 备好
import { detectHosts } from '<仓库>/cli/src/hosts.ts';
import { installThirdPartySkill, skillsCliCommand } from '<仓库>/cli/src/install-third-party.ts';
import { systemCommandRunner } from '<仓库>/cli/src/run-command.ts';
import { hasSkillFile } from '<仓库>/cli/src/third-party-status.ts';

for (const name of ['HOME', 'CODEX_HOME', 'XDG_CONFIG_HOME', 'XDG_STATE_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'npm_config_cache'])
  if (!process.env[name]?.startsWith('<W>/')) throw new Error(`断言失败：${name}`);
if (process.env['CLAUDE_CONFIG_DIR']) throw new Error('断言失败：CLAUDE_CONFIG_DIR 没有清空');
// 环境里不能有 CLAUDE*、AI_AGENT、CURSOR* 这些「在某个 AI Agent 里运行」的变量

const hosts = detectHosts(process.env, homedir(), join(homedir(), 'no-project'));
const runCommand = systemCommandRunner();
for (const skill of names)            // names 取自 --list
  for (const host of hosts) {
    const command = skillsCliCommand(source, skill, host, 'global');
    const result = await installThirdPartySkill(command, host, runCommand, () => hasSkillFile(host.skillsDir, skill));
    // 记下：退出状态、复核、目标位置是不是真实目录、文件数和字节数、SKILL.md 里声明的名字
  }
```

**并行取清单时踩到的一处**：第一遍四个来源同时跑 `--list`、共用一个 npm 缓存，`tanweai/pua` 那一次报 `Cannot find module './common/seq.js'`——是几个 `npx` 同时往同一个缓存目录里装 `skills` 包撞上了，不是那个仓库的问题；单独重跑就列出来了。试装时每个来源各用各的 npm 缓存，没有再出现。安装器一次只起一条命令，不受影响。

## 23 个第三方 Skill

| 目录里的名字 | 来源 @ 试装时的提交 | `--list` 列出的 skill | 两个宿主各装一次 | 装出来的大小（各 skill 合计） |
|---|---|---|---|---|
| `pua` | `tanweai/pua` @ e6e6cd2 | 13 个：ding、mama、p10、p7、p9、pro、pua、pua-en、pua-ja、pua-loop、shot、yes、pua-trae | Claude Code 13/13、Codex 13/13，都以 0 退出、有 `SKILL.md` | 45 个文件，341KB |
| `i-have-adhd` | `ayghri/i-have-adhd` @ 723af7d | 1 个：i-have-adhd | Claude Code 1/1、Codex 1/1，都以 0 退出、有 `SKILL.md` | 3 个文件，9KB |
| `ponytail` | `DietrichGebert/ponytail` @ 9b58c1f | 6 个：ponytail、ponytail-audit、ponytail-debt、ponytail-gain、ponytail-help、ponytail-review | Claude Code 6/6、Codex 6/6，都以 0 退出、有 `SKILL.md` | 6 个文件，20KB |
| `andrej-karpathy-skills` | `multica-ai/andrej-karpathy-skills` @ 2c60614 | 1 个：karpathy-guidelines | Claude Code 1/1、Codex 1/1，都以 0 退出、有 `SKILL.md` | 1 个文件，2KB |
| `caveman` | `JuliusBrussee/caveman` @ 2e08b91 | 22 个：cavecrew、caveman、caveman-commit、caveman-compress、caveman-discover、caveman-evidence-review、caveman-explore、caveman-help、caveman-learn、caveman-manage、caveman-optimize、caveman-review、caveman-setup、caveman-stats、investigate-first、lean-build、megacave、migration、safe-refactor、surgical-patch、ultracave、verify-and-stop | Claude Code 22/22、Codex 22/22，都以 0 退出、有 `SKILL.md` | 52 个文件，179KB |
| `web-access` | `eze-is/web-access` @ 33eef84 | 1 个：web-access | Claude Code 1/1、Codex 1/1，都以 0 退出、有 `SKILL.md` | 14 个文件，92KB |
| `anysearch-skill` | `anysearch-ai/anysearch-skill` @ 9b91ee2 | 1 个：anysearch | Claude Code 1/1、Codex 1/1，都以 0 退出、有 `SKILL.md` | 22 个文件，183KB |
| `last30days-skill` | `mvanhorn/last30days-skill` @ 267d50f | 1 个：last30days | Claude Code 1/1、Codex 1/1，都以 0 退出、有 `SKILL.md` | 154 个文件，16.6MB |
| `taste-skill` | `Leonxlnx/taste-skill` @ 717446e | 13 个：brandkit、industrial-brutalist-ui、gpt-taste、image-to-code、imagegen-frontend-mobile、imagegen-frontend-web、minimalist-ui、full-output-enforcement、redesign-existing-projects、high-end-visual-design、stitch-design-taste、design-taste-frontend、design-taste-frontend-v1 | Claude Code 13/13、Codex 13/13，都以 0 退出、有 `SKILL.md` | 14 个文件，307KB |
| `hallmark` | `Nutlope/hallmark` @ 13ac0ec | 1 个：hallmark | Claude Code 1/1、Codex 1/1，都以 0 退出、有 `SKILL.md` | 107 个文件，674KB |
| `impeccable` | `pbakaus/impeccable` @ d631a88 | 1 个：impeccable | Claude Code 1/1、Codex 1/1，都以 0 退出、有 `SKILL.md` | 62 个文件，2.1MB |
| `emilkowalski-skills` | `emilkowalski/skills` @ e8a175d | 14 个：animate、animate-expo、animation-vocabulary、apple-design、ask-sonner、break-ui、emil-design-eng、find-animation-opportunities、improve-animations、mobile-native、pick-ui-library、prototype、review-animations、write-swift | Claude Code 14/14、Codex 14/14，都以 0 退出、有 `SKILL.md` | 22 个文件，272KB |
| `nuyoah-image-reverse-prompt` | `nuyoah-ai-works/nuyoah-image-reverse-prompt` @ f56616e | 1 个：nuyoah-image-reverse-prompt | Claude Code 1/1、Codex 1/1，都以 0 退出、有 `SKILL.md` | 17 个文件，75KB |
| `gorden-ppt-skill` | `GordenSun/GordenPPTSkill` @ 7d4a61c | 1 个：gorden-ppt-skill | Claude Code 1/1、Codex 1/1，都以 0 退出、有 `SKILL.md` | 110 个文件，101.8MB |
| `paper-craft-skills` | `zsyggg/paper-craft-skills` @ 3be47a2 | 3 个：paper-analyzer、paper-comic、paper-deck | Claude Code 3/3、Codex 3/3，都以 0 退出、有 `SKILL.md` | 21 个文件，71KB |
| `guizang-ppt-skill` | `op7418/guizang-ppt-skill` @ c91369c | 1 个：guizang-ppt-skill | Claude Code 1/1、Codex 1/1，都以 0 退出、有 `SKILL.md` | 41 个文件，5.8MB |
| `ppt-agent-skills` | `sunbigfly/ppt-agent-skills` @ 13e3537 | 1 个：ppt-agent | Claude Code 1/1、Codex 1/1，都以 0 退出、有 `SKILL.md` | 127 个文件，15.2MB |
| `drawio-skill` | `Agents365-ai/drawio-skill` @ 88fd923 | 1 个：drawio-skill | Claude Code 1/1、Codex 1/1，都以 0 退出、有 `SKILL.md` | 79 个文件，1.0MB |
| `prompt-architect` | `ckelsoe/prompt-architect` @ 6c7a2c7 | 1 个：prompt-architect | Claude Code 1/1、Codex 1/1，都以 0 退出、有 `SKILL.md` | 64 个文件，488KB |
| `humanizer-zh` | `op7418/Humanizer-zh` @ f4518a8 | 1 个：humanizer-zh | Claude Code 1/1、Codex 1/1，都以 0 退出、有 `SKILL.md` | 9 个文件，39KB |
| `academic-humanizer` | `AIScientists-Dev/academic-humanizer` @ 94b88b2 | 1 个：academic-humanizer | Claude Code 1/1、Codex 1/1，都以 0 退出、有 `SKILL.md` | 10 个文件，303KB |
| `chinese-novelist-skill` | `PenglongHuang/chinese-novelist-skill` @ 6a64a04 | 1 个：chinese-novelist | Claude Code 1/1、Codex 1/1，都以 0 退出、有 `SKILL.md` | 29 个文件，888KB |
| `oh-story-claudecode` | `zenstory-ai/oh-story-claudecode` @ 2cf7be6 | 13 个：browser-cdp、story、story-cover、story-deslop、story-import、story-long-analyze、story-long-scan、story-long-write、story-review、story-setup、story-short-analyze、story-short-scan、story-short-write | Claude Code 13/13、Codex 13/13，都以 0 退出、有 `SKILL.md` | 465 个文件，5.3MB |

200 次安装合计约 13 分钟；最慢的是 `gorden-ppt-skill`（一次 11 到 12 秒），其余多在 3 到 9 秒。提交是试装之后用 `git ls-remote <仓库> HEAD` 取的。

和 `skill-intake-analysis.md` 对不上的地方（以这次的 `--list` 为准）：

- `caveman` 的 22 个里有分析没提到的 `caveman-compress`、`caveman-discover`、`caveman-evidence-review`、`caveman-explore`、`caveman-manage`、`caveman-optimize`、`caveman-setup` 和 6 个工作纪律类的名字；提交也比分析那天新。
- `taste-skill` 的 13 个名字是各自 `SKILL.md` 里声明的，和目录名多数不同（分析已经提过）。
- `pua` 是 13 个，比分析记的「`skills/` 下 12 个」多一个 `pua-trae`（工单 12 的记录已经提过）。

## 留到这里核对的两件事

### pua：46 份 `SKILL.md`，装上的是哪一份

把仓库浅克隆到另一个临时目录（提交 e6e6cd2），按文件内容的哈希把装出来的每个目录和仓库里声明同一个名字的目录逐个比：

- 仓库里 46 份 `SKILL.md` 声明了 29 个不同的名字。`--list` 列出、能装上的是 13 个。
- **装上的 12 个都是 `skills/<名字>/` 下的那一份**，逐文件相同：ding、mama、p10、p7、p9、pro、pua、pua-en、pua-ja、pua-loop、shot、yes。第 13 个 `pua-trae` 来自 `.trae/skills/pua-trae/`。
- `pua` 这个名字仓库里有 8 份（另 7 份在 `.trae/skills`、`codex`、`pi/package/skills`、`codebuddy`、`chatgpt`、`hermes`、`kimi` 下，`SKILL.md` 都和装上的不同），`pua-en` 有 6 份，`pua-ja` 有 5 份，`pua-loop` 有 2 份——装上的都是 `skills/` 下的。
- 没装出来的 16 个名字（`pua-cancel-loop`、`pua-flavor`、`pua-kpi`、`pua-mama`、`pua-off`、`pua-offline`、`pua-on`、`pua-p10`、`pua-p7`、`pua-p9`、`pua-pro`、`pua-reap-orphans`、`pua-survey`、`pua-team-status`、`pua-teardown-all`、`pua-yes`）都只在 `codex/` 下：那不是 skills CLI 找 skill 的位置，`--list` 不列，上游核对命令也不报。

读装上的那几份得到的（写进了说明）：

- `p7`、`p9`、`p10` 的正文只有几行，内容指到 `../pua/references/` 下的协议文件——要和 `pua` 一起装。
- `pua-loop` 要运行 `${CLAUDE_PLUGIN_ROOT}/scripts/setup-pua-loop.sh` 并靠 Stop hook 验证：只在作为 Claude Code 插件安装时成立，这样单独装上起不来。
- `pro` 在 `~/.pua` 下存状态；它的正文前半还写着「首次注册」「静默上报」，后半和 `pua/references/platform.md` 写明这些联网功能已经整体移除。没有找到实际发请求的地址；没有运行过它。

### GordenPPTSkill：模板取全了没有

- 它的 `.gitattributes` 写明模板现在是普通的 Git 对象，不走 Git LFS。
- 装出来 110 个文件、106,791,792 字节，和 GitHub 的文件列表接口（`git/trees/main?recursive=1`）报的 110 个文件、106,791,792 字节一致。
- 21 个 `.pptx` 合计 75,300,362 字节，和接口报的一致；每一个的开头都是 ZIP 的文件头（`PK\x03\x04`），不是 LFS 的指针文件；最小的 612,809 字节。
- 模板现在是 21 套（仓库在 GitHub 上的简介还写着 17 套），说明照 `SKILL.md` 写 21 套。

## 另外查到的一处：impeccable 装上的是给 Codex 编的那一份

仓库里 24 份 `SKILL.md`，其中 23 份声明的名字都是 `impeccable`。同样按内容比：**两个宿主装上的都是 `.agents/skills/impeccable/` 下的那一份**（62 个文件），不是 `.claude/skills/impeccable/` 的（57 个文件）。两份的差别：前者多 5 个 Codex 的子代理定义文件；头部信息里没有 `user-invocable` 和参数提示；正文里的命令写成 `$impeccable …`、路径写成 `.agents/skills/impeccable/…`，后者是 `/impeccable …` 和 `.claude/skills/impeccable/…`。所以在 Claude Code 里装上的这一份，命令的写法对不上。它的启动脚本 `scripts/impeccable` 首次运行会用 `curl` 从 GitHub releases 下载一个程序放进 `~/.impeccable` 再执行（读脚本所得，没有运行）。两点都写进了说明。

## 写进说明的前提和风险，出处

没有运行任何一个 skill；下面都是读装出来的文件或仓库 README 所得。

| 条目 | 写了什么 | 出处 |
|---|---|---|
| `pua`、`ponytail`、`i-have-adhd` | 这样装上的是基本功能，自动触发、常开等要按官方方式装插件 | 各自的 README（插件市场的安装命令）；`ponytail-help` 正文；`i-have-adhd` 的头部信息 `disable-model-invocation: true` |
| `caveman` | 不会每个会话自动开启；`cavecrew` 的子代理、`caveman-stats` 的钩子要官方安装；`caveman-learn` 要另装 `caveman` 命令行；`caveman-discover`、`-evidence-review`、`-manage`、`-optimize`、`-setup` 要付费的 Caveman Cloud；`caveman-compress` 要 Python 3，并把文件内容交给 Claude | 各 `SKILL.md`；`caveman-compress/SECURITY.md`；README 的安装一节（`npm install -g @caveman-ai/cli && caveman setup --install`）；官网的价目页 |
| `impeccable` | 首次运行联网下载程序；装上的是给 Codex 编的那一份 | 见上一节 |
| `oh-story-claudecode` | 装后要运行一次 `story-setup` 并新开会话，它部署的钩子每 24 小时最多联网查一次新版本（`STORY_NO_UPDATE_CHECK=1` 可关）；`browser-cdp` 首次启动会结束正在运行的 Chrome、把登录状态复制到 `~/chrome-debug-profile`、要先装 `agent-browser`；`story-cover` 在 Claude Code 里要 `GPT_IMAGE_API_KEY` 并外发提示词和参考图，Codex 里优先用内置生图；`story` 的「检查更新」会用不带 `--skill`、`--agent` 的命令把 13 个全量重装到全局；需要 Node.js 和 Python | 各 `SKILL.md`；`story-setup` 带的 `session-start.sh`、`browser-cdp` 带的 `setup-cdp-chrome.js`；README 的常见问题 |
| `nuyoah-image-reverse-prompt` | 产出的提示词默认在末尾加一句署名 | `SKILL.md` 第 65 行 |
| `gorden-ppt-skill` | 约 100MB；Python 3 和 python-pptx；每个会话首次使用先运行 `scripts/apply_update.py`，联网把本机这一份更新成上游的最新版；仅限非商业使用 | `SKILL.md` |
| `last30days-skill` | Python 3.12 以上和 Node.js；约 17MB；首次使用有配置向导，读浏览器 Cookie 之前先问；各平台的 key 可选 | `SKILL.md` |
| `ppt-agent-skills` | 约 15MB；Python 3、截图用的浏览器引擎；各步的内容规定由子代理生成 | `SKILL.md`、README |
| `web-access` | Node.js 22 以上、浏览器开远程调试；会检索本机浏览器的书签和历史；脚本路径写的是 `${CLAUDE_SKILL_DIR}` | `SKILL.md` |
| `anysearch-skill` | 查询和网址发往 `api.anysearch.com`；Python 或 Node.js；key 可选 | `SKILL.md` |
| `chinese-novelist-skill` | 规划确认后一口气写完、中途不再确认；字数检查的脚本用 `python` 这个命令名 | `SKILL.md`、`references/flows/` |
| `drawio-skill`、`paper-craft-skills`、`guizang-ppt-skill`、`taste-skill` | 要 Python 3 或 Node.js；导出图片要 draw.io 桌面版；图像类的要宿主能生图；`disable-model-invocation: true` 的写「要你点名调用」 | 各 `SKILL.md` |

**宿主限制**：23 条都没有写 `hosts`。工单要的是「实测只在某一个宿主下能用的」才写；这次实测的只是装不装得上，两个宿主下都装得上，没有在哪个宿主里实际用过任何一个 skill。读出来偏向某个宿主的只写在说明里：`web-access` 的脚本路径用的是 Claude Code 的变量 `${CLAUDE_SKILL_DIR}`（它的 README 说兼容 Codex，没有验证）；`image-to-code` 的说明自称是给 Codex 写的；`pua-trae` 是给 Trae 优化的。

## 7 个外部项目

都登记在 `apps` 里，说明取自「汇总」文档（修订 10）并对照了各仓库当天的官方简介和 README 的安装一节（只读）。**它们的官方安装命令一条都没有执行过。**

| 目录里的名字 | 链接 | 用途 | 为什么不是第三方 Skill |
|---|---|---|---|
| `agent-reach` | `Panniantong/Agent-Reach` | web-search | 能力在 Python 程序 `agent-reach` 里，`SKILL.md` 只是说明；官方装法是让 Agent 照它的安装文档装。等维护者在虚拟机里试通后可改成工具 |
| `ui-ux-pro-max-skill` | `nextlevelbuilder/ui-ux-pro-max-skill` | design-media | 主 skill 里的脚本路径只在作为 Claude Code 插件安装时成立；官方装法是插件市场或 `npm install -g ui-ux-pro-max-cli`。同上，等试通 |
| `graphify` | `Graphify-Labs/graphify` | codebase-understanding | 本体是 PyPI 包 `graphifyy`（`uv tool install graphifyy` 后 `graphify install`）。同上，等试通 |
| `understand-anything` | `Egonex-AI/Understand-Anything` | codebase-understanding | Claude Code 插件，核心 skill 要找到插件根目录；官方装法是插件市场或 `install.sh`。同上，等试通 |
| `ppt-master` | `hugohe3/ppt-master` | documents | skill 目录约 78MB、一万三千多个文件，还要 `pip install -r requirements.txt`。它的 README 现在也给了 `npx skills add hugohe3/ppt-master`，并注明这样只取到 skill 文件、依赖还得自己装——没有试，照工单定的归类登记 |
| `ai-website-cloner-template` | `JCodesMore/ai-website-cloner-template` | design-media | 是 GitHub 模板仓库：整个克隆下来当项目用，再在里面运行 `/clone-website` |
| `webnovel-writer` | `lingfengQAQ/webnovel-writer` | prompts-writing | Claude Code 插件的组成部分，单装不可用；GPL-3.0 |

数组里的先后照文档的顺序，插在原有的外部项目之间。

## 录入时定下的几处

实现者定的，维护者没有逐条确认。

- **条目的名字**：仓库名转成小写 kebab-case。`emilkowalski/skills` 的仓库名只有 `skills`，写成 `emilkowalski-skills`；`GordenPPTSkill` 写成 `gorden-ppt-skill`（和它里面那个 skill 同名）。条目的名字只在 `thirdPartySkills` 里唯一。
- **`url` 和 `source` 都写仓库现在的地址**：`andrej-karpathy-skills` 文档里的链接是 `forrestchang/…`，GitHub 现在把它转到 `multica-ai/andrej-karpathy-skills`，两处都写后者；`prompt-architect` 用现名 `ckelsoe/prompt-architect`；`caveman` 写成 GitHub 给出的大小写 `JuliusBrussee/caveman`。`graphify`、`Understand-Anything` 文档里已经是现名。
- **`caveman` 登记了全部 22 个**（工单：没有例外），`skill-intake-analysis.md` 提议的是只取纯提示词的那些；依赖别的东西的在各自的说明里写明。
- **Caveman Cloud 写成「付费」**：出处是它官网的价目页（https://caveman.so/pricing ，2026-10-11 读）——免费档只含本机的 agent 和 SDK，Cloud 只在按报价收费的 Team、Enterprise 两档里。
- **只含一个 skill 的条目，条目的说明和那个 skill 的说明是同一句**：安装器只对含多个 skill 的条目出清单（`cli/src/flow.ts`），只含一个的，用户看得到的只有条目的说明，所以前提和风险都写在条目的说明里（评审指出的：最初有几条只写在了 skill 的说明里）。
- **数组里的先后**照文档的顺序；一个条目里 skill 的先后照 `--list` 的顺序。列表里实际的排法由安装器定（段内按名字）。
- **说明的写法**同别的条目：一句话写「它做什么」，不写触发条件，句末没有句号；前提、风险和怎么开关写在句末的括号里（括号里几件事之间用分号）；把宿主写成 `AI Agent`。带着前提的说明比原有条目长得多，最长的中文说明 188 个字（`impeccable`）：列表里会被截断，光标停上去时在列表下方看得到全文。
- **外部项目的说明**不写没验证过的效果：`agent-reach` 的官方简介说「zero API fees」、`webnovel-writer` 说「支持 200 万字量级」，前者没写，后者写成「面向」。

## 怎么核对的

- **目录校验命令**（`cli/` 下 `npm run validate-catalog -- ..`）：`目录校验通过：12 个 skill、23 个第三方 Skill、11 个 MCP、0 个工具、64 个应用项目、10 个用途`，退出状态 0。
- **上游核对命令**（`cli/` 下 `GITHUB_TOKEN=… npm run check-upstream -- ..`，对着真实的 GitHub）：标准输出 `上游核对通过：23 个第三方 Skill，共 100 个 skill`，标准错误是空的，退出状态 0。
- **对照快照**：把 `outline-entries.md` 的 103 个条目逐个到目录里找（按链接，不分大小写；`andrej-karpathy-skills` 按现在的地址）——4 个已在仓库（在 `index.json` 和 `skillPurposes` 里），analyse-design 哪里都没有，其余 98 个恰好各一条（第三方 Skill 23、MCP 11、外部项目 64），用途等于所在大标题对应的那个，都没有推荐标记，说明句末没有句号，第三方 Skill 的 `url` 和 `source` 一致，各数组里没有重名，不同条目之间和本仓库的 skill 之间没有同名的 skill。
- **经真实的安装器走一遍**：`npm run build` 后在伪终端里起 `node dist/bin.js --lang zh`，`OXY_TOOLS_CATALOG` 指到仓库（读的是真实的 `catalog.json`），环境同上、`CLAUDE_CONFIG_DIR` 故意指到别处。进「Agent 行为约束与输出风格」→ 两个宿主 → 全局 → 勾 `andrej-karpathy-skills` → 开始安装：汇总里是两条 `npx -y skills@1 add multica-ai/andrej-karpathy-skills --skill karpathy-guidelines --agent … --yes --global`，结果两行「已安装」，合计「2 成功 · 0 失败 · 0 跳过」；临时主目录的 `.claude/skills/karpathy-guidelines/SKILL.md` 和 `.agents/skills/karpathy-guidelines/SKILL.md` 都在，`CLAUDE_CONFIG_DIR` 指的目录是空的。主菜单上各用途的数量合计 102（23 + 11 + 64，加 4 个另有用途的本仓库 skill）。
- **真实的主目录**：试装前后只读地看了 `~/.claude/skills` 和 `~/.agents/skills`——两处 40 分钟内没有任何改动，试装过的名字一个都不在里面（原本就在的 `gorden-ppt-skill` 还是 6 月的时间），`~/.agents/.skill-lock.json` 和 `~/.local/state/skills` 都不存在。**事先取的哈希没有起到作用**：它把上一级目录 `~/.claude` 的修改时间也算了进去，而本会话一直在写那个目录，前后的哈希必然不同；下次只对两个 skill 目录自己的内容取哈希。

## 没有核对的

- **没有在任何宿主里实际用过任何一个 skill**：「试通」证明的只是装得上，不证明好用；说明里的前提和风险都是读文件所得。
- Windows 和 Linux 上没有试。
- 装到项目的情形没有对这 23 个逐个试（工单 10 用样例条目试过那条路径）。
- 覆盖已有同名目录的情形没有试。维护者本机原本就装着一个 `gorden-ppt-skill`：在真实的机器上勾这一条，安装器会先问要不要覆盖。
- 7 个外部项目的官方安装命令。
- **汇总表在名字长的时候超过 80 列**：经真实的安装器勾 `emilkowalski-skills` 的全部 14 个加 `nuyoah-image-reverse-prompt` 走到汇总（之后选了取消，没有安装），「第三方 Skill」那张小表最宽的一行（`find-animation-opportunities` 在 Claude Code 下）是 99 列，位置一栏被终端折到下一行。界面设计规范说路径不截断、不受 80 列的限制，所以照规范这是允许的；好不好看留给工单 14 的整体视觉核对。清单那一步名称一栏按最长的名字（28 列）定宽，说明一栏还剩得下，没有问题。
