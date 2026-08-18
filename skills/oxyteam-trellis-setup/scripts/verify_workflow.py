#!/usr/bin/env python3
"""校验 .trellis/workflow.md 是否符合 Overlay 契约。

存在的理由：workflow.md 的失败模式**全是静默的**——

    状态块缺闭合标签      → 整块读不到，每轮提示降级成一句
                            "Refer to workflow.md for current step."，路由失效但不报错
    块名和 flow_stage 对不上 → 同上
    改掉 `## Phase 1: Plan` → get_phase_index() 找不到终点，
                            把整篇文件当 Phase Index 注进 SessionStart
    残留已删 Skill 名      → 模型被指向一个不存在的 Skill

装完 Overlay 跑一次，`trellis update` 之后再跑一次：

    python3 .trellis/scripts/verify_workflow.py

不带参数默认查 .trellis/workflow.md，也可以直接传路径查模板本身。
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

STAGES = ["no_task", "discover", "specify", "slice", "implement", "finish"]

# 官方 Python 硬编码的两个字符串（workflow_phase.py:38 / :80），逐字比较
PHASE_INDEX_HEADING = "## Phase Index"
PHASE_INDEX_TERMINATOR = "## Phase 1: Plan"

# 与 inject-workflow-state.py / index.ts 等价的配对正则
RE_BLOCK = re.compile(
    r"\[workflow-state:([A-Za-z0-9_-]+)\]\s*\n(.*?)\n\s*\[/workflow-state:\1\]",
    re.DOTALL,
)
RE_OPEN_TAG = re.compile(r"\[workflow-state:[A-Za-z0-9_-]+\]")

DELETED_SKILLS = (
    "trellis-brainstorm", "trellis-before-dev", "trellis-check",
    "trellis-break-loop", "workflow-guide",
)
# 「当成路径去读写」才算残留；正文里声明「不再使用」是允许的
DEAD_ARTIFACT_PATHS = (
    "$TASK/design.md", "<task>/design.md", "taskDir/design.md",
    "$TASK/implement.md", "<task>/implement.md",
)


def check(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    bad: list[str] = []

    blocks = {m.group(1): m.group(2) for m in RE_BLOCK.finditer(text)}
    for stage in STAGES:
        if stage not in blocks:
            bad.append(f"缺 [workflow-state:{stage}] 块（或它没有配对的闭合标签）")
    for extra in set(blocks) - set(STAGES):
        bad.append(f"多出一个块 [workflow-state:{extra}]，官方旧块和 -inline 变体都应删掉")

    # 开标签数 > 配对数 → 有块没闭合，或正文里写出了字面标签
    opens = len(RE_OPEN_TAG.findall(text))
    if opens != len(blocks):
        bad.append(f"开标签 {opens} 个但只配上 {len(blocks)} 对，有未闭合或字面写出的标签")

    for stage, body in blocks.items():
        if not body.strip():
            bad.append(f"[workflow-state:{stage}] 块正文是空的")

    if PHASE_INDEX_HEADING not in text:
        bad.append(f"缺 `{PHASE_INDEX_HEADING}`，get_phase_index() 会返回空字符串")
    if PHASE_INDEX_TERMINATOR not in text:
        bad.append(
            f"缺 `{PHASE_INDEX_TERMINATOR}`（官方逐字比较的终止标记），"
            "整篇文件会被当成 Phase Index 注进 SessionStart"
        )

    for name in DELETED_SKILLS:
        if name in text:
            bad.append(f"残留已删除的入口名 `{name}`")
    for p in DEAD_ARTIFACT_PATHS:
        if p in text:
            bad.append(f"残留旧 artifact 路径 `{p}`")

    return bad


def main(argv: list[str]) -> int:
    path = Path(argv[1]) if len(argv) > 1 else Path(".trellis/workflow.md")
    if not path.is_file():
        print(f"错误：找不到 {path}", file=sys.stderr)
        return 1
    problems = check(path)
    if problems:
        print(f"{path} 不符合 Overlay 契约：", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1
    print(f"{path} ✓ 六个状态块全部配对，两个硬编码标记就位，无残留引用")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
