# 随附脚本

> 随 skill 分发的两个脚本现在是怎么写的：`skills/oxy-learning-hub/scripts/validate_html.py` 和 `skills/wizard/template.sh`。

每种语言只有一个样本。下面“输出与退出码”是被文档依赖的契约；其余是这两个文件的现状。

---

## 运行时与依赖

**两个脚本都装完即用，没有安装步骤。** 它们跑在用户机器上，由 agent 或用户直接调用。

- `validate_html.py` 只 import 标准库：`argparse`、`re`、`sys`、`html.parser`、`pathlib`。
- `template.sh` 用 bash 内建和 `tput`、`grep`、`mktemp`、`cat` 这类基础命令；`gh`、`wslview`、`xdg-open` 等都先用 `command -v` 探测，没有就降级。
- 上游的 unlazy 把同一点写成了硬规则并有测试守着（`skills/unlazy/CONTRIBUTING.md` 第 5 条，`tests/self-check.mjs` 的 “zero non-stdlib imports”）。

shebang 用 `env` 形式：`#!/usr/bin/env python3`、`#!/usr/bin/env bash`。

`validate_html.py` 的注解用了 `list[str]`、`str | None`，没有 `from __future__ import annotations`，所以实际要求 Python 3.10 以上。函数签名都带类型注解。

---

## validate_html.py 的形态

```python
def main() -> int:
    parser = argparse.ArgumentParser(description="验证 Oxy Learning Hub HTML 结构与本地引用")
    parser.add_argument("files", nargs="*", type=Path)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        print("自检通过")
        return 0
    if not args.files:
        parser.error("请提供至少一个 HTML 文件，或使用 --self-test")
    ...
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
```

- `main()` 返回退出码，由 `sys.exit(main())` 交出去。
- 参数用 `argparse`，路径参数 `type=Path`；用法错误交给 `parser.error`。
- 自检内建在脚本里：`--self-test` 用内联的正反样例字符串跑一遍核心逻辑，失败时 `raise RuntimeError`。没有单独的测试文件，也没有测试框架。
- 纯逻辑与文件访问分开：`validate_text(text)` 只看字符串，`validate(path)` 在它之上加文件系统检查。自检只调前者，不读写任何文件。
- `description`、报错信息、单行 docstring 都是中文，与所在 skill 的语言一致。

---

## 输出与退出码（契约）

| 情况 | 输出 | 退出码 |
|------|------|--------|
| 文件通过 | stdout：`通过 <path>` | 全部通过时为 0 |
| 文件有问题 | stdout：`失败 <path>:`，下面每个问题一行 `  - <说明>` | 1 |
| 文件不存在 | stdout：`失败 <path>: 文件不存在` | 1 |
| 没给文件也没给 `--self-test` | argparse 的用法错误，stderr | 2 |
| `--self-test` 通过 | stdout：`自检通过` | 0 |

- **一次报全**：对每个文件收集全部问题再输出，不在第一个问题处停下；一个文件失败不影响后面的文件继续检查。
- **每行以结论词开头**（`通过` / `失败`），后面跟路径。
- 没有日志级别，不写日志文件；输出就是给调用者读的结果。

这是契约，因为 `skills/oxy-learning-hub/SKILL.md` 和 `references/publishing.md` 让 agent 按这个结果行动（“验证失败时先修复，再交付”）。

---

## template.sh 的形态

`template.sh` 是模板，会被复制到用户项目里再填写，它的写法就是生成物的写法。

```bash
#!/usr/bin/env bash
set -euo pipefail

if [[ -t 1 ]] && command -v tput >/dev/null 2>&1 && [[ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]]; then
  BOLD=$(tput bold); DIM=$(tput dim); RESET=$(tput sgr0)
  ...
else
  BOLD=""; DIM=""; RESET=""; BLUE=""; GREEN=""; YELLOW=""; RED=""
fi
```

- `set -euo pipefail` 开头。
- 颜色和清屏先判断是不是终端（`[[ -t 1 ]]`）；不是终端时颜色变量置空、`_clear` 直接返回。
- **库与内容用标记分开**（文件自己写明的约定）：`STAGES` 标记以上是所有向导共用的库函数，以下是每个向导自己的内容。文件头注释和 `skills/wizard/SKILL.md` 都要求生成向导时不动标记以上的部分。所以改库函数是在改 skill 本身，会影响之后生成的每一个向导。
- 多数库函数上方有一行注释写用法（`# ask KEY "Prompt" reads a value into $KEY. ...`）；`note`、`warn` 没有。
- 内部函数带下划线前缀（`_clear`、`_existing`），给向导作者用的不带（`stage`、`ask`、`write_env`）。
- 函数内的变量基本都用 `local` 声明，变量引用加双引号。`finish` 里的循环变量 `s` 是例外，没有声明。

---

## 失败时的行为

| 情形 | 现有做法 | 位置 |
|------|----------|------|
| 校验发现问题 | 全部报出来，非零退出 | `validate_html.py` 的 `main()` |
| 可选的外部工具缺失或没登录 | 警告、记入待办、继续 | `template.sh` 的 `set_secret` / `set_var`：`gh` 不可用时写入 `SKIPPED` 数组并 `warn`，由 `finish` 在结尾列出 “still to do by hand” |
| 尽力而为的便利动作 | 失败只提示，不中断 | `template.sh` 的 `open_url`：打不开浏览器时提示手动访问 |
| 读输入时遇到 EOF 且没读到内容 | 函数返回 1，由 `set -e` 终止脚本 | `template.sh` 的 `ask` / `ask_secret` |

`ask` 遇到 EOF 且输入为空时直接返回 1，即使 `.env` 里已经有旧值；“回车沿用旧值”只在正常读到一个空行时生效。

`template.sh` 里涉及密钥的写法：

- 密钥输入用 `read -rs` 隐藏回显（`ask_secret`）。
- 密钥通过标准输入传给外部命令，不放在命令行参数里：`printf '%s' "$value" | gh secret set "$name"`。
- 新建 `.env` 时权限为 0600：`(umask 077 && : > "$ENV_FILE")`。
- 写入是幂等的 upsert：`write_env` 先滤掉同名旧行再追加，重复运行不会堆叠重复键。
