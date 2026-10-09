# 上游整包

> 带上游许可证、整包引入的第三方 skill 怎么对待。

---

## 哪些是上游整包

判据是目录里有自己的 `LICENSE`：

| skill | 许可证 | 版权方 | 引入提交 |
|-------|--------|--------|----------|
| `skills/archify/` | MIT | tt-a1i；基于 Cocoon AI 的 architecture-diagram-generator | `c2230a1` |
| `skills/onetake/` | PolyForm Noncommercial 1.0.0 | Patrick (github.com/feitangyuan) | `c2230a1` |
| `skills/unlazy/` | MIT | Leonxlnx | `66591ee` |

仓库根 `README.md` 的「许可证」一节有一张同样的表，引入或移除整包时两处一起改。

其余 skill 没有 `LICENSE`。其中只有 `skills/pr/` 记了部分内容的出处（`CREDITS.md`、`metadata.credits`）；别的 skill 的来源仓库里没有记录，不要凭写法推断它是自写还是引入的。

---

## 现状：引入后没有本地改动

三个整包各自只有引入时的那一个提交（`git log --oneline -- skills/<name>`）。引入时的做法：

- **整包照搬**，上游带什么就留什么。`skills/unlazy/` 里除了 skill 本身，还有上游的 `README.md`、`CHANGELOG.md`、`CONTRIBUTING.md`、`SECURITY.md`、`package.json`。
- **放进来就不生效的文件也留着不动**（提交 `66591ee` 的说明逐个解释了）：`skills/unlazy/.github/workflows/test.yml`（GitHub Actions 只认仓库根的 `.github/`，这里不会触发）、`skills/unlazy/.gitignore`（嵌套 gitignore 仍然生效，挡的是 `.unlazy/` 等运行时产物）。
- **二进制直接进 git**：`skills/onetake/` 里的 mp4、gif、字体没有走 LFS，`.gitattributes` 里只有 ATW journal 的合并规则。
- **许可证限制写进了清单说明**：onetake 仅限非商业使用且体积大，这两点都在它的 `index.json` 说明里。

本仓库的写法约定（[Skill 编写](./skill-authoring.md)、[`scripts/` 层](../scripts/index.md)）不套用到整包上，也没有为风格、措辞或格式改过整包里的文件。

**本地补丁和上游升级都还没有发生过，怎么做没有约定。** 没改过，所以现在升级可以用上游新版本整体覆盖目录；一旦打了本地补丁，升级就变成合并。遇到确实要改整包的任务，这个取舍交给维护者决定。

---

## 整包自己的规矩

在整包内部动手时，遵守的是它自己的规则：

| skill | 在哪 | 要点 |
|-------|------|------|
| unlazy | `skills/unlazy/CONTRIBUTING.md` | Node 16 兼容、零运行时依赖、frontmatter 只留 `name` 和 `description`、不用 em dash / en dash、脚本改动要带先失败的回归测试 |
| archify | `skills/archify/test/*.test.mjs` | `SKILL.md` 的契约由测试守着，例如 `test/skill-metadata.test.mjs` 要求 description 不超过 1024 字符且保留各触发词 |
| onetake | `skills/onetake/README.md`、各脚本文件头 | 脚本文件头带版权与 lineage 声明（如 `skills/onetake/scripts/render.py` 第 2 行） |

---

## 在本仓库里能跑的检查

| 命令 | 工作目录 | 情况 |
|------|----------|------|
| `npm test` | `skills/unlazy/` | 能跑，通过。零依赖，不需要 `npm install`，跑完工作区无残留 |
| `node bin/archify.mjs doctor` | `skills/archify/` | 能跑，输出 `Archify is ready.` |
| `node --test test/skill-metadata.test.mjs` | `skills/archify/` | 能跑，通过 |
| `node scripts/test_motion.js` | `skills/onetake/` | 能跑，输出 `ALL PASS` |
| `npm test` | `skills/archify/` | **跑不了**：脚本引用 `../scripts/check-release-identity.mjs`、`../scripts/run-tests.mjs`，这些文件在上游仓库的 skill 目录之外，没有随整包进来；`devDependencies` 也没有安装 |

archify 其余的测试文件、onetake 的 Python 脚本（依赖 numpy、Pillow 和浏览器）没有在本仓库跑过，能否运行未知。

---

## 引入时的提交信息

以 `66591ee`（引入 unlazy）为样本，正文包含：

1. 来源、许可证和版权方（“第三方项目整体引入（MIT，Copyright 2026 Leonxlnx），37 个文件”）；
2. 它做什么，一小段；
3. 跑了哪些自带测试、结果如何（“npm test exit=0”），以及运行时要求（“零第三方依赖，Node >=16”）；
4. 放进来不生效但保留的文件，逐个说明为什么不生效。

`c2230a1`（引入 archify、onetake）的正文没有写到这个细度。
