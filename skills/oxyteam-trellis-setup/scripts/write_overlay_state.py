#!/usr/bin/env python3
"""生成并校验 .trellis/.oxyteam-overlay.json（A3 记账）。

格式定义在 references/update-policy.md，五值判定模型要的 U_old / A_old 就出自这里。

**为什么不去读官方模板算 upstream_hash**：平台层的落盘内容是模板渲染后的结果
（`common/commands/continue.md` → `.omp/commands/trellis-continue.md`，中间过了一层
变量替换），只有实跑 `collectPlatformTemplates()` 才拿得到，要 spawn node。
而 apply **之前**磁盘上的内容本来就是官方原样 —— SKILL.md 预检第 11 条已经把
「未改 / 已是目标形态 / 存在本地漂移」分好类了。所以扫两次磁盘就够，零 node 依赖。

    snapshot   apply 之前跑：记 upstream_hash，产出半成品
    finalize   apply 之后跑：补 applied_hash 和元数据
    verify     任何时候跑：重算 hash 跟记账比对，报漂移
    selfcheck  内置断言，不碰真实仓库

清单从 stdin 读，每行三列（空白分隔）：

    action   create | modify | delete
    layer    shared | omp | claude-code | codex
    path     仓库相对路径

    modify  shared  .trellis/workflow.md
    delete  codex   .agents/skills/trellis-brainstorm/

顺序无所谓，`#` 开头和空行忽略。delete 条目只记 upstream_hash，是 tombstone ——
上游以后重命名旧 Skill、或往已删目录里新增文件时，靠它才认得出来。
"""
from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

STATE_PATH = Path(".trellis/.oxyteam-overlay.json")
ACTIONS = ("create", "modify", "delete")
LAYERS = ("shared", "omp", "claude-code", "codex")


def digest(path: Path) -> str | None:
    """目录取「路径 + 内容」的合并摘要，删除条目要靠它认出目录整体。"""
    if path.is_dir():
        h = hashlib.sha256()
        for p in sorted(path.rglob("*")):
            if p.is_file():
                h.update(str(p.relative_to(path)).encode())
                h.update(p.read_bytes())
        return h.hexdigest()
    if path.is_file():
        return hashlib.sha256(path.read_bytes()).hexdigest()
    return None


def parse_manifest(text: str) -> list[tuple[str, str, str]]:
    rows = []
    for lineno, line in enumerate(text.splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) != 3:
            raise SystemExit(f"清单第 {lineno} 行不是三列：{line!r}")
        action, layer, path = parts
        if action not in ACTIONS:
            raise SystemExit(f"清单第 {lineno} 行 action 是 {action!r}，只允许 {'/'.join(ACTIONS)}")
        if layer not in LAYERS:
            raise SystemExit(f"清单第 {lineno} 行 layer 是 {layer!r}，只允许 {'/'.join(LAYERS)}")
        rows.append((action, layer, path))
    if not rows:
        raise SystemExit("清单是空的 —— 是不是忘了把 changeset 的条目管道进来？")
    return rows


def cmd_snapshot(root: Path, manifest: str, **_) -> int:
    files = {}
    for action, layer, rel in parse_manifest(manifest):
        h = digest(root / rel)
        if action in ("modify", "delete") and h is None:
            raise SystemExit(f"{rel} 不存在，但 action 是 {action} —— 清单和现场对不上，停下来查")
        if action == "create" and h is not None:
            raise SystemExit(f"{rel} 已经存在，但 action 是 create —— 可能是重复安装，停下来查")
        files[rel] = {"action": action, "layer": layer,
                      "upstream_hash": h, "applied_hash": None}
    state = {"overlay_version": None, "trellis_version": None, "skill_pack_ref": None,
             "applied_at": None, "platforms": [], "files": files, "_stage": "snapshot"}
    (root / STATE_PATH).write_text(
        json.dumps(state, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"snapshot 记下 {len(files)} 个路径的 upstream_hash → {STATE_PATH}")
    return 0


def cmd_finalize(root: Path, overlay_version: str, trellis_version: str,
                 skill_pack_ref: str, platforms: str, **_) -> int:
    state_file = root / STATE_PATH
    if not state_file.is_file():
        raise SystemExit(f"没有 {STATE_PATH} —— apply 之前要先跑一次 snapshot")
    state = json.loads(state_file.read_text(encoding="utf-8"))
    if state.get("_stage") != "snapshot":
        raise SystemExit("这份记账已经 finalize 过了，重复 apply 要先重新 snapshot")

    plats = [p.strip() for p in platforms.split(",") if p.strip()]
    for p in plats:
        if p not in LAYERS[1:]:
            raise SystemExit(f"未知平台 {p!r}，只允许 {'/'.join(LAYERS[1:])}")

    for rel, entry in state["files"].items():
        h = digest(root / rel)
        if entry["action"] == "delete":
            if h is not None:
                raise SystemExit(f"{rel} 记的是 delete，但它还在磁盘上 —— apply 没做完")
            continue        # tombstone 只留 upstream_hash
        if h is None:
            raise SystemExit(f"{rel} 记的是 {entry['action']}，但磁盘上没有 —— apply 没做完")
        entry["applied_hash"] = h

    state.update(overlay_version=overlay_version, trellis_version=trellis_version,
                 skill_pack_ref=skill_pack_ref, platforms=plats,
                 applied_at=datetime.now(timezone.utc).isoformat(timespec="seconds"))
    state.pop("_stage")
    state_file.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n",
                          encoding="utf-8")
    changed = sum(1 for e in state["files"].values() if e["action"] != "delete")
    print(f"finalize：{changed} 改/建 + {len(state['files']) - changed} 删，"
          f"平台 {'、'.join(plats)}")
    return 0


def cmd_verify(root: Path, **_) -> int:
    state_file = root / STATE_PATH
    if not state_file.is_file():
        raise SystemExit(f"没有 {STATE_PATH} —— 这个项目还没装过 Overlay")
    state = json.loads(state_file.read_text(encoding="utf-8"))
    if state.get("_stage") == "snapshot":
        raise SystemExit("记账停在 snapshot 阶段 —— 上次 apply 没跑完 finalize，现场状态未知")

    drift = []
    for rel, entry in state["files"].items():
        h = digest(root / rel)
        if entry["action"] == "delete":
            if h is not None:
                drift.append(f"{rel} 应该是删掉的，但又出现了（`trellis update` 装回来了？）")
        elif h is None:
            drift.append(f"{rel} 不见了")
        elif h != entry["applied_hash"]:
            who = "恢复成官方原样了" if h == entry["upstream_hash"] else "被本地改动漂移了"
            drift.append(f"{rel} {who}")
    if drift:
        print(f"记账与现场不一致（{len(drift)} 处）：", file=sys.stderr)
        for d in drift:
            print(f"  - {d}", file=sys.stderr)
        return 1
    print(f"✓ {len(state['files'])} 个路径与记账一致 | "
          f"Overlay {state['overlay_version']} | 平台 {'、'.join(state['platforms'])}")
    return 0


# ---------------------------------------------------------------------------
# 自检：跑一遍 snapshot → apply → finalize → verify 全流程，再手动制造漂移
# ---------------------------------------------------------------------------

def selfcheck() -> int:
    import tempfile

    def fails(fn, frag: str) -> None:
        try:
            fn()
        except SystemExit as e:
            assert frag in str(e), f"报错信息里没有 {frag!r}：{e}"
            return
        raise AssertionError(f"本该失败却通过了（期望 {frag!r}）")

    with tempfile.TemporaryDirectory() as d:
        root = Path(d).resolve()      # macOS 的 /var 是 /private/var 的软链
        (root / ".trellis").mkdir()
        (root / ".trellis/workflow.md").write_text("官方原文", encoding="utf-8")
        (root / ".claude/skills/trellis-brainstorm").mkdir(parents=True)
        (root / ".claude/skills/trellis-brainstorm/SKILL.md").write_text("x", encoding="utf-8")

        manifest = (
            "# 注释和空行要被忽略\n\n"
            "modify shared .trellis/workflow.md\n"
            "create shared .trellis/scripts/oxyteam_tickets.py\n"
            "delete claude-code .claude/skills/trellis-brainstorm\n"
        )
        assert cmd_snapshot(root, manifest) == 0
        state = json.loads((root / STATE_PATH).read_text(encoding="utf-8"))
        assert state["_stage"] == "snapshot" and len(state["files"]) == 3
        upstream = state["files"][".trellis/workflow.md"]["upstream_hash"]
        assert state["files"][".trellis/scripts/oxyteam_tickets.py"]["upstream_hash"] is None, \
            "新建文件不该有 upstream_hash"

        # finalize 之前 apply 没做完 → 必须拦住
        fails(lambda: cmd_finalize(root, "v0.4.0", "0.6.15", "v0.3.0", "claude-code"),
              "apply 没做完")

        # 真正 apply
        (root / ".trellis/workflow.md").write_text("Overlay 版", encoding="utf-8")
        (root / ".trellis/scripts").mkdir()
        (root / ".trellis/scripts/oxyteam_tickets.py").write_text("# 票解析", encoding="utf-8")
        import shutil
        shutil.rmtree(root / ".claude/skills/trellis-brainstorm")

        fails(lambda: cmd_finalize(root, "v0.4.0", "0.6.15", "v0.3.0", "cursor"), "未知平台")
        assert cmd_finalize(root, "v0.4.0", "0.6.15", "v0.3.0", "claude-code") == 0
        assert cmd_verify(root) == 0

        state = json.loads((root / STATE_PATH).read_text(encoding="utf-8"))
        assert "_stage" not in state and state["platforms"] == ["claude-code"]
        wf = state["files"][".trellis/workflow.md"]
        assert wf["upstream_hash"] == upstream and wf["applied_hash"] != upstream
        assert state["files"][".claude/skills/trellis-brainstorm"]["applied_hash"] is None, \
            "tombstone 不该有 applied_hash"
        fails(lambda: cmd_finalize(root, "v0.4.0", "0.6.15", "v0.3.0", "claude-code"),
              "已经 finalize 过")

        # 三种漂移各验一次
        (root / ".trellis/workflow.md").write_text("有人手改了", encoding="utf-8")
        assert cmd_verify(root) == 1, "本地漂移没被抓到"
        (root / ".trellis/workflow.md").write_text("官方原文", encoding="utf-8")
        assert cmd_verify(root) == 1, "恢复成官方原样也算漂移，没被抓到"
        (root / ".trellis/workflow.md").write_text("Overlay 版", encoding="utf-8")
        assert cmd_verify(root) == 0
        (root / ".claude/skills/trellis-brainstorm").mkdir(parents=True)
        assert cmd_verify(root) == 1, "被 update 装回来的已删目录没被抓到"

    fails(lambda: parse_manifest("modify shared"), "不是三列")
    fails(lambda: parse_manifest("rename shared a.md"), "只允许")
    fails(lambda: parse_manifest("modify pi a.md"), "只允许")
    fails(lambda: parse_manifest("# 全是注释\n"), "空的")

    print("selfcheck 通过")
    return 0


def main(argv: list[str]) -> int:
    import argparse
    p = argparse.ArgumentParser(description="Oxyteam Overlay 记账")
    p.add_argument("command", choices=["snapshot", "finalize", "verify", "selfcheck"])
    p.add_argument("--root", default=".", help="仓库根，缺省当前目录")
    p.add_argument("--overlay-version", default="v0.4.0")
    p.add_argument("--trellis-version", default="0.6.15")
    p.add_argument("--skill-pack-ref", default="v0.3.0")
    p.add_argument("--platforms", default="", help="逗号分隔，finalize 必填")
    a = p.parse_args(argv[1:])

    if a.command == "selfcheck":
        return selfcheck()
    root = Path(a.root).resolve()
    if a.command == "snapshot":
        return cmd_snapshot(root, sys.stdin.read())
    if a.command == "verify":
        return cmd_verify(root)
    if not a.platforms:
        raise SystemExit("finalize 要 --platforms，例如 --platforms omp,claude-code")
    return cmd_finalize(root, a.overlay_version, a.trellis_version,
                        a.skill_pack_ref, a.platforms)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
