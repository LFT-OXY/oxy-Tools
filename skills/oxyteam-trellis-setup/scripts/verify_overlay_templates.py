#!/usr/bin/env python3
"""校验 templates/ 下所有现成件是否符合 Overlay 契约。

`verify_workflow.py` 只管 workflow.md 一个文件，本脚本管其余全部模板。

存在的理由和 verify_workflow.py 一样：**失败模式全是静默的**——

    残留已删 Skill 名        → 模型被指向一个不存在的入口
    残留 $TASK/design.md     → 模型去读一个本版不产生的文件，读不到就自己编
    子命令写错（--frontier） → argparse 报错，模型当成「这任务没有票」继续走
    未渲染的 {{PYTHON_CMD}}  → 原样落盘，命令行直接不可执行
    三平台正文漂移           → 同一个流程在不同平台上行为不同，只有换平台才暴露

最后一条是引入并行子代理之后才有的新风险：三份 continue 由不同上下文写出来，
彼此看不见，措辞和步骤很容易各说各话。所以规范化之后逐组比对。

    python3 scripts/verify_overlay_templates.py [templates 目录]
    python3 scripts/verify_overlay_templates.py selfcheck
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

# 与 verify_workflow.py 同一份名单，改一处两处都要改
DELETED_SKILLS = (
    "trellis-brainstorm", "trellis-before-dev", "trellis-check",
    "trellis-break-loop", "workflow-guide",
)
# 「已删除 / 换成 X」这类说明句里提到旧名是允许的，正文当入口用才算残留
ALLOW_MARKERS = ("已删除", "不再使用", "已被替换", "换成", "改成", "→", "本版没有")

# 「当成路径去读写」才算残留
DEAD_ARTIFACT_PATHS = (
    "$TASK/design.md", "<task>/design.md", "taskDir/design.md", "$TASK/implement.md",
    "<task>/implement.md", "task/design.md", "tasks/design.md",
)

TICKET_CMDS = {"list", "frontier", "claim", "done", "summary", "selfcheck"}
SYNC_CMDS = {"create", "sync-spec", "sync-tickets", "archive", "selfcheck"}
# 捕获脚本名后的第一个实参（--task-dir 是唯一合法的前置选项，先吃掉）。
# 捕到的东西交给 check_call 分流：中文行文不是调用，`-` 开头的一定是错的。
RE_TICKET_CALL = re.compile(r"oxyteam_tickets\.py\s+(?:--task-dir\s+\S+\s+)?(\S+)")
RE_SYNC_CALL = re.compile(r"github_sync\.py\s+(\S+)")
RE_SUBCOMMAND = re.compile(r"^[a-z][a-z-]*$")


def check_call(tok: str, valid: set[str], what: str, rel: str) -> str | None:
    if tok.startswith("-"):
        return f"{rel} 把 `{tok}` 当成{what}的选项，它只收位置参数（合法选项只有 --task-dir）"
    if RE_SUBCOMMAND.match(tok) and tok not in valid:
        return f"{rel} 用了不存在的{what}子命令 `{tok}`（只有 {'/'.join(sorted(valid))}）"
    return None      # 中文行文之类，不是调用
RE_UNRENDERED = re.compile(r"\{\{[A-Z_]+(?::[\w-]+)?\}\}")
RE_FRONTMATTER = re.compile(r"\A---\n(.*?)\n---\n", re.DOTALL)
RE_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)


def strip_comments(text: str) -> str:
    """注释是写给人看的，不产生行为，但要保留行号 —— 换成等量空行。"""
    return RE_COMMENT.sub(lambda m: "\n" * m.group(0).count("\n"), text)

# 同一角色在三平台的落点。正文规范化后必须一致。
ROLE_GROUPS = {
    "continue": [
        "omp/commands/trellis-continue.md",
        "claude/commands/trellis/continue.md",
        "agents/skills/trellis-continue/SKILL.md",
    ],
    "finish-work": [
        "omp/commands/trellis-finish-work.md",
        "claude/commands/trellis/finish-work.md",
        "agents/skills/trellis-finish-work/SKILL.md",
    ],
    "trellis-implement": [   # toml 结构不同，不进组
        "omp/agents/trellis-implement.md",
        "claude/agents/trellis-implement.md",
    ],
}

# 每个平台的头部规格，实跑 collectPlatformTemplates 导出来的
FRONTMATTER_SPEC = {
    "omp/commands/": ("description",),
    "agents/skills/": ("name", "description"),
}


def check_file(path: Path, rel: str) -> list[str]:
    raw = path.read_text(encoding="utf-8")
    text = strip_comments(raw)      # 顶部说明注释里必然提到旧名和旧路径，不算残留
    bad: list[str] = []

    for lineno, line in enumerate(text.splitlines(), 1):
        for name in DELETED_SKILLS:
            if name in line and not any(m in line for m in ALLOW_MARKERS):
                bad.append(f"{rel}:{lineno} 把已删除的 `{name}` 当入口用了")
        for p in DEAD_ARTIFACT_PATHS:
            if p in line:
                bad.append(f"{rel}:{lineno} 残留旧 artifact 路径 `{p}`")
        # `current --json` 是 task.py:177-201 的八字段白名单，meta 不在里面。
        # 拿它读 flow_stage / implementation_base_sha 不报错、只是永远读不到，
        # 静态审计看不出来。合法形态只有两种：管道进两步读法，或反引号里的说明文字。
        s = line.strip()
        if "current --json" in s and s.startswith("python3") and "|" not in s:
            bad.append(f"{rel}:{lineno} 裸的 `task.py current --json` —— 它是白名单八字段、"
                       "不含 meta，读 flow_stage / implementation_base_sha 必须走两步")

    for regex, valid, what in ((RE_TICKET_CALL, TICKET_CMDS, "票脚本"),
                               (RE_SYNC_CALL, SYNC_CMDS, "同步脚本")):
        for m in regex.finditer(text):
            problem = check_call(m.group(1), valid, what, rel)
            if problem:
                bad.append(problem)

    for m in RE_UNRENDERED.finditer(text):
        bad.append(f"{rel} 残留未渲染的模板变量 `{m.group(0)}`")

    fm = RE_FRONTMATTER.match(raw)
    for prefix, keys in FRONTMATTER_SPEC.items():
        if not rel.startswith(prefix):
            continue
        if fm is None:
            bad.append(f"{rel} 缺 frontmatter（这个平台要求 {', '.join(keys)}）")
        else:
            for k in keys:
                if not re.search(rf"^{k}:", fm.group(1), re.MULTILINE):
                    bad.append(f"{rel} 的 frontmatter 缺 `{k}:`")
    if rel.startswith("claude/commands/"):
        if fm is not None:
            bad.append(f"{rel} 不该有 frontmatter —— Claude 的 command 是裸 Markdown")
        # Claude 拿首个非空行当命令描述，说明注释压在 H1 前面会顶掉标题（用户可见）
        first = next((l for l in raw.splitlines() if l.strip()), "")
        if not first.startswith("# "):
            bad.append(f"{rel} 首行不是 H1（现在是 `{first[:40]}`）—— "
                       "Claude 拿它当命令描述，注释块只能排在 H1 后面")

    return bad


def normalize(text: str) -> str:
    """抹掉三平台的合法差异，剩下的不一致就是真漂移。"""
    text = RE_COMMENT.sub("", text).lstrip()                # 顶部说明注释各写各的，先剔
    text = RE_FRONTMATTER.sub("", text)
    text = re.sub(r"\A\s*#[^\n]*\n", "", text)              # OMP 版渲染时删了 H1
    text = re.sub(r"(?:/trellis:|\$)([\w-]+)", r"<CMD:\1>", text)
    text = re.sub(r"--platform\s+\S+", "--platform <PLAT>", text)
    text = re.sub(r"\b(omp|claude|codex|Codex|Claude Code|Oh My Pi)\b", "<PLAT>", text)
    return "\n".join(l.rstrip() for l in text.splitlines() if l.strip())


def check_groups(root: Path) -> list[str]:
    bad: list[str] = []
    for role, rels in ROLE_GROUPS.items():
        present = [(r, root / r) for r in rels if (root / r).is_file()]
        if len(present) < len(rels):
            missing = set(rels) - {r for r, _ in present}
            bad.append(f"[{role}] 还缺 {len(missing)} 个落点：{'、'.join(sorted(missing))}")
        if len(present) < 2:
            continue
        base_rel, base_path = present[0]
        base = normalize(base_path.read_text(encoding="utf-8"))
        for rel, path in present[1:]:
            other = normalize(path.read_text(encoding="utf-8"))
            if other != base:
                first = next(
                    (i + 1 for i, (a, b) in enumerate(
                        zip(base.splitlines(), other.splitlines())) if a != b),
                    min(len(base.splitlines()), len(other.splitlines())) + 1,
                )
                bad.append(f"[{role}] {rel} 与 {base_rel} 正文不一致（规范化后第 {first} 行起）")
    return bad


def run(root: Path) -> list[str]:
    files = sorted(p for p in root.rglob("*") if p.suffix in (".md", ".toml"))
    bad: list[str] = []
    for p in files:
        rel = str(p.relative_to(root))
        if rel == "trellis/workflow.md":
            continue          # 归 verify_workflow.py 管，规则不同
        bad += check_file(p, rel)
    return bad + check_groups(root)


# ---------------------------------------------------------------------------
# 自检：造几个坏文件，确认每条规则真的会响
# ---------------------------------------------------------------------------

def selfcheck() -> int:
    import tempfile

    def hits(rel: str, body: str) -> list[str]:
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(body, encoding="utf-8")
            return check_file(p, rel)

    assert any("当入口用" in b for b in hits("a.md", "先加载 trellis-brainstorm 写 prd")), \
        "已删 Skill 名没被抓到"
    assert not hits("a.md", "trellis-brainstorm 已删除，换成 /oxyteam-askme"), \
        "说明句里的旧名被误报了"
    assert any("旧 artifact" in b for b in hits("a.md", '--file "$TASK/design.md"')), \
        "死路径没被抓到"
    assert not hits("a.md", "`design.md` 和 `implement.md` 不再使用"), \
        "「不再使用」的说明被误报了"
    assert not hits("a.md", "读 <task>/implement.jsonl 拿当前票"), \
        "implement.jsonl 被误判成 implement.md"
    assert any("只收位置参数" in b
               for b in hits("a.md", "oxyteam_tickets.py --frontier")), "写成 flag 没被抓到"
    assert any("不存在的票脚本子命令" in b
               for b in hits("a.md", "oxyteam_tickets.py next")), "错子命令没被抓到"
    assert not hits("a.md", "oxyteam_tickets.py --task-dir x/y claim 03"), \
        "带 --task-dir 的合法调用被误报了"
    assert any("未渲染" in b for b in hits("a.md", "{{PYTHON_CMD}} x.py")), "残留变量没被抓到"
    assert any("缺 frontmatter" in b
               for b in hits("agents/skills/t/SKILL.md", "# T\n")), "缺 frontmatter 没被抓到"
    assert any("不该有 frontmatter" in b
               for b in hits("claude/commands/c.md", "---\nname: c\n---\n# C\n")), \
        "Claude command 多余的 frontmatter 没被抓到"
    # 实测踩出来的：注释压在 H1 前面，Claude 的 skill 列表显示成 `<!-- Oxyteam…`
    assert any("首行不是 H1" in b
               for b in hits("claude/commands/c.md", "<!-- 说明 -->\n\n# C\n")), \
        "注释压 H1 没被抓到"
    assert not hits("claude/commands/c.md", "# C\n\n<!-- 说明 -->\n\n正文\n"), \
        "H1 在前、注释在后的正确形态被误报了"
    # 三平台模板里曾有 10 处拿 current --json 读 meta，读不到也不报错
    assert any("裸的" in b for b in hits(
        "a.md", "```bash\npython3 .trellis/scripts/task.py current --json\n```\n")), \
        "裸的 current --json 没被抓到"
    assert not hits("a.md", '```bash\nDIR=$(python3 .trellis/scripts/task.py current --json '
                            '| python3 -c \'import json,sys\')\n```\n'), \
        "两步读法的第一步被误报了"
    assert not hits("a.md", "`task.py current --json` 是白名单八字段，不含 meta\n"), \
        "说明文字里的 current --json 被误报了"

    # 下面三条是实跑第一版时踩出来的误报，改动别把它们改回去
    assert not hits("a.md", "<!--\n② 删掉对 trellis-brainstorm / trellis-before-dev\n   的引用\n-->\n正文"), \
        "顶部说明注释里的旧名被当成残留了"
    assert not hits("a.md", "implement 阶段按 oxyteam_tickets.py 的票状态路由"), \
        "中文正文被当成子命令了"

    # 规范化：三平台的合法差异应当被抹平
    omp = '---\ndescription: "x"\n---\n\n跑 `python3 x.py --platform omp`，用 /trellis:continue\n'
    codex = '---\nname: c\ndescription: "x"\n---\n\n# Continue\n\n跑 `python3 x.py --platform codex`，用 $continue\n'
    claude = '# Continue\n\n<!-- 说明 -->\n\n跑 `python3 x.py --platform claude`，用 /trellis:continue\n'
    assert normalize(omp) == normalize(codex), \
        f"合法的平台差异没被抹平：\n{normalize(omp)!r}\n{normalize(codex)!r}"
    assert normalize(omp) == normalize(claude), \
        f"注释 + H1 的组合没被抹平：\n{normalize(omp)!r}\n{normalize(claude)!r}"
    assert normalize(omp) != normalize(omp.replace("跑", "不要跑")), "真漂移被抹平了"

    print("selfcheck 通过")
    return 0


def main(argv: list[str]) -> int:
    if len(argv) > 1 and argv[1] == "selfcheck":
        return selfcheck()
    root = Path(argv[1]) if len(argv) > 1 else Path(__file__).resolve().parent.parent / "templates"
    if not root.is_dir():
        print(f"错误：找不到目录 {root}", file=sys.stderr)
        return 1
    problems = run(root)
    if problems:
        print(f"{root} 下的模板不符合 Overlay 契约：", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1
    print(f"{root} ✓ 无残留引用、子命令合法、三平台正文一致")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
