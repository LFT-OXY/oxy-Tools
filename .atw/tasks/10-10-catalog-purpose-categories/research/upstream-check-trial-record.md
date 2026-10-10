# 工单 12 的手动核对：上游核对命令对着真实的 GitHub

> 2026-10-11，macOS，Node 24.15.0。主会话亲自跑的，没有交给子代理。
> 样例目录写在 `mktemp -d` 建的临时目录里，没有动仓库里的目录文件。对照用的 skills CLI 是 `skills@1` 当时解析到的版本，跑它时 `HOME`、`XDG_*`、`npm_config_cache`、`CODEX_HOME` 都指到临时目录，`CLAUDE_CONFIG_DIR` 清空，只用了 `--list`（只列不装）。

## 1. 故意写错的样例目录（不带 `GITHUB_TOKEN`）

`catalog.json` 里登记四条：

| 条目 | 来源 | 登记的 skill | 故意的地方 |
|------|------|--------------|------------|
| emil-skills | `emilkowalski/skills` | `animate` | 上游有 14 个，只登记了 1 个 |
| prompt-architect | `ckelsoe/claude-skill-prompt-architect` | `prompt-architect` | 用的是改名之前的旧名字 |
| nuyoah | `nuyoah-ai-works/nuyoah-image-reverse-prompt` | `nuyoah-image-reverse-prompts` | 名字末尾多写了一个 s |
| gone | `emilkowalski/no-such-repo-oxy-check` | `nothing` | 仓库不存在 |

`npm run check-upstream -- <样例目录>`，约 6 秒，退出状态 1，标准错误：

```
上游核对未通过：有 17 处对不上
  emil-skills（emilkowalski/skills）：上游的 animate-expo 没有登记在目录里
  emil-skills（emilkowalski/skills）：上游的 animation-vocabulary 没有登记在目录里
  emil-skills（emilkowalski/skills）：上游的 apple-design 没有登记在目录里
  emil-skills（emilkowalski/skills）：上游的 ask-sonner 没有登记在目录里
  emil-skills（emilkowalski/skills）：上游的 break-ui 没有登记在目录里
  emil-skills（emilkowalski/skills）：上游的 emil-design-eng 没有登记在目录里
  emil-skills（emilkowalski/skills）：上游的 find-animation-opportunities 没有登记在目录里
  emil-skills（emilkowalski/skills）：上游的 improve-animations 没有登记在目录里
  emil-skills（emilkowalski/skills）：上游的 mobile-native 没有登记在目录里
  emil-skills（emilkowalski/skills）：上游的 pick-ui-library 没有登记在目录里
  emil-skills（emilkowalski/skills）：上游的 prototype 没有登记在目录里
  emil-skills（emilkowalski/skills）：上游的 review-animations 没有登记在目录里
  emil-skills（emilkowalski/skills）：上游的 write-swift 没有登记在目录里
  prompt-architect（ckelsoe/claude-skill-prompt-architect）：来源仓库已改名为 ckelsoe/prompt-architect
  nuyoah（nuyoah-ai-works/nuyoah-image-reverse-prompt）：目录里登记的 nuyoah-image-reverse-prompts 在上游没有
  nuyoah（nuyoah-ai-works/nuyoah-image-reverse-prompt）：上游的 nuyoah-image-reverse-prompt 没有登记在目录里
  gone（emilkowalski/no-such-repo-oxy-check）：来源仓库不存在
```

与预期一致。对照：`npx -y skills@1 add emilkowalski/skills --list` 报 `Found 14 skills`，列的正是 `animate` 加上面那 13 个。

## 2. 把样例目录改对之后

emil-skills 登记全 14 个、prompt-architect 的来源换成现名、nuyoah 的名字改对、去掉不存在的那一条：

```
上游核对通过：3 个第三方 Skill，共 16 个 skill
```

退出状态 0。

## 3. 认 skill 的规则和 skills CLI 对不对得上（带 `GITHUB_TOKEN`）

拿五个结构复杂的真实仓库各登记一个占位的 skill 名，数命令报出多少个「上游的 … 没有登记」，和 skills CLI 认出的比：

| 仓库 | 命令认出 | skills CLI | 怎么比的 |
|------|----------|------------|----------|
| `JuliusBrussee/caveman` | 22 | 22 | 数量；后者取自 `skill-intake-analysis.md`（2026-10-10 的 `--list`） |
| `pbakaus/impeccable`（24 份 `SKILL.md`，20 份是同名副本） | 1 | 1 | 同上 |
| `zenstory-ai/oh-story-claudecode` | 13 | 13 | 同上 |
| `tanweai/pua`（46 份 `SKILL.md`） | 13 | 13 | 这一次现跑的 `--list`，名字逐个相同 |
| `sammcj/agentic-coding` | 55 | 55 | 这一次现跑的 `--list`，名字逐个相同 |

pua 认出的 13 个：ding、mama、p10、p7、p9、pro、pua、pua-en、pua-ja、pua-loop、pua-trae、shot、yes（分析里记的是 `skills/` 下 12 个，多出来的 `pua-trae` 来自别的约定位置）。

**sammcj/agentic-coding 第一次没对上（84 对 55），改了实现才对上。** 它的 skill 放在 `Skills/`（首字母大写），旁边还有一个 `Skills_disabled/`（29 个）。skills CLI 是拿 `skills` 这个路径去问文件系统的，macOS 上不分大小写，所以认到了 `Skills/` 里的 55 个，`Skills_disabled/` 不在约定的位置里就不看；命令起初按大小写敏感比，「约定的位置里一个都没有」，于是把整个仓库的 84 个都算上了。改成路径一律不分大小写之后是 55 个，名字逐个相同。**大小写敏感的 Linux 上 skills CLI 自己认出的应当是 84 个**（推断，没有在 Linux 上跑过）——命令照的是 macOS、Windows 上的结果。

## 4. 已归档、令牌不对

- 已归档：`sindresorhus/refined-twitter`（`gh api` 看到 `archived: true`，里面没有 skill），登记了一个占位的 skill 名：

  ```
    refined-twitter（sindresorhus/refined-twitter）：来源仓库已归档
    refined-twitter（sindresorhus/refined-twitter）：目录里登记的 oxy-placeholder 在上游没有
  ```
- `GITHUB_TOKEN` 设成一个无效的值 → 每个条目一行 `没能核对：HTTP 401（GITHUB_TOKEN 不对或过期了）`，第一行 `上游核对未通过：有 3 个条目没能核对`，退出状态 1。没有把任何一条报成「仓库不存在」或「上游没有」。

## 5. 仓库真实的目录

`npm run check-upstream -- ..`（在 `cli/` 下）→ `上游核对通过：0 个第三方 Skill，共 0 个 skill`，退出状态 0。目录里现在还没有第三方 Skill，要等工单 13 录入；PRD 的验收标准「对仓库里登记的全部第三方 Skill 跑过一遍」到那时才有东西可跑。

## 6. 评审之后改了比名字的方式，重跑过

评审指出：最初比的是名字化成目录名之后的样子，而 skills CLI 按名字选 skill 时只转小写——上游声明 `Paper Reader` 的 skill，登记成 `paper-reader` 会被说成对得上，其实装不上。改成比声明的名字的小写写法之后，上面第 1、2、3、4 节的样例目录都重跑了一遍，输出和数量与改之前逐行相同（这几个真实仓库里没有名字带空格的 skill）。

## 没有核对的

- 被 GitHub 限流、网络不通、文件列表被截断、读某份 `SKILL.md` 失败这几种「没能核对」：没有造出真实的情形，只读过代码。
- 转给别人（不只是改名）的仓库：`ckelsoe/prompt-architect` 是同一个所有者下的改名；转移的走的是同一种 301，没有单独试。
- Windows 和 Linux 上没有跑过（自动化测试在 CI 的三个系统上跑，用的是本地假仓库）。
- 标了 `internal` 的 skill、`skills-lock.json`、插件清单这三条规则：只有自动化测试里的假仓库，没有找真实的仓库对过。
