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
    bless      升级已装项目：重拷模板后重新盖章，带 --overlay-version 时顺带升版本号
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
OVERLAY_VERSION = "v0.4.19"


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
    """首装记全量；已装项目补新平台时**只列新平台的路径**，老记账原样保留。

    增量补装（记账里没有、磁盘上有的平台）没有别的出路：重新列全量会把 Overlay
    之后的内容误记成 `upstream_hash`，而且 A 组那几个已建文件会撞上
    「已经存在，但 action 是 create」，C 组那些已删路径会撞上「不存在，但 action 是 delete」。
    """
    state_file = root / STATE_PATH
    prev = {}
    if state_file.is_file():
        prev = json.loads(state_file.read_text(encoding="utf-8"))
        if prev.get("_stage") == "snapshot":
            raise SystemExit("上一次 snapshot 还没 finalize —— 先把那次 apply 收尾，别叠加")
    files = dict(prev.get("files") or {})
    fresh = []
    for action, layer, rel in parse_manifest(manifest):
        if rel in files:
            raise SystemExit(f"{rel} 已经在记账里 —— 补装清单只列新平台的路径；"
                             "要重装老平台就先把记账删掉从头来")
        h = digest(root / rel)
        if action in ("modify", "delete") and h is None:
            raise SystemExit(f"{rel} 不存在，但 action 是 {action} —— 清单和现场对不上，停下来查")
        if action == "create" and h is not None:
            raise SystemExit(f"{rel} 已经存在，但 action 是 create —— 可能是重复安装，停下来查")
        files[rel] = {"action": action, "layer": layer,
                      "upstream_hash": h, "applied_hash": None}
        fresh.append(rel)
    state = {"overlay_version": None, "trellis_version": None, "skill_pack_ref": None,
             "applied_at": None, "platforms": [], **prev,
             "files": files, "_stage": "snapshot", "_fresh": fresh}
    state_file.write_text(
        json.dumps(state, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    carried = len(files) - len(fresh)
    print(f"snapshot 记下 {len(fresh)} 个路径的 upstream_hash"
          f"{f'（另有 {carried} 个老记账原样带过来）' if carried else ''} → {STATE_PATH}")
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

    # 只盖本次 snapshot 新加的路径。补装时重算老路径 = 把真实漂移静默盖掉，
    # 那正是 bless 要求显式点名的原因。
    fresh = state.pop("_fresh", None) or list(state["files"])
    for rel in fresh:
        entry = state["files"][rel]
        h = digest(root / rel)
        if entry["action"] == "delete":
            if h is not None:
                raise SystemExit(f"{rel} 记的是 delete，但它还在磁盘上 —— apply 没做完")
            continue        # tombstone 只留 upstream_hash
        if h is None:
            raise SystemExit(f"{rel} 记的是 {entry['action']}，但磁盘上没有 —— apply 没做完")
        entry["applied_hash"] = h

    state.update(overlay_version=overlay_version, trellis_version=trellis_version,
                 skill_pack_ref=skill_pack_ref,
                 platforms=sorted(set(state.get("platforms") or []) | set(plats)),
                 applied_at=datetime.now(timezone.utc).isoformat(timespec="seconds"))
    state.pop("_stage")
    state_file.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n",
                          encoding="utf-8")
    changed = sum(1 for r in fresh if state["files"][r]["action"] != "delete")
    print(f"finalize：本次 {changed} 改/建 + {len(fresh) - changed} 删，"
          f"记账共 {len(state['files'])} 个路径，平台 {'、'.join(state['platforms'])}")
    return 0


def cmd_bless(root: Path, rels: list[str], overlay_version: str | None = None, **_) -> int:
    """重新盖章：把指定路径的 applied_hash 换成现场内容，upstream_hash 不动。

    Skill Pack 更新了模板、已装项目重新拷了几个文件之后的唯一合法出路 ——
    finalize 有防重入，重新 snapshot 会把 Overlay 后的内容误记成 upstream。
    **必须显式点名路径**：不点名就等于把真实的本地漂移一起盖掉，那记账就没用了。

    带 `--overlay-version` 时顺带升版本号并刷 applied_at。升级路径除此之外
    没有别的出路：finalize 防重入进不去，bless 本身又只碰 applied_hash，
    结果就是记账里的版本号和时间戳一起停在上一版说谎（v0.4.9 实测）。
    """
    state_file = root / STATE_PATH
    if not state_file.is_file():
        raise SystemExit(f"没有 {STATE_PATH} —— 这个项目还没装过 Overlay")
    state = json.loads(state_file.read_text(encoding="utf-8"))
    if state.get("_stage") == "snapshot":
        raise SystemExit("记账停在 snapshot 阶段 —— 先把 apply 跑完 finalize")
    if not rels:
        raise SystemExit("bless 要显式点名路径，例如 "
                         "bless .claude/commands/trellis/continue.md（不点名 = 盖掉真漂移）")

    for rel in rels:
        entry = state["files"].get(rel)
        if entry is None:
            raise SystemExit(f"{rel} 不在记账里 —— 新增路径要走 snapshot + finalize，不是 bless")
        if entry["action"] == "delete":
            raise SystemExit(f"{rel} 记的是 delete，tombstone 没有 applied_hash 可盖")
        h = digest(root / rel)
        if h is None:
            raise SystemExit(f"{rel} 磁盘上没有 —— 先把文件拷回去再 bless")
        if h == entry["applied_hash"]:
            print(f"{rel} 本来就一致，跳过")
            continue
        entry["applied_hash"] = h
        print(f"{rel} 重新盖章")
    if overlay_version:
        old = state.get("overlay_version")
        state["overlay_version"] = overlay_version
        state["applied_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        print(f"版本号 {old} → {overlay_version}，applied_at 已刷新")
    state_file.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n",
                          encoding="utf-8")
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
        shutil.rmtree(root / ".claude/skills/trellis-brainstorm")

        # bless：Skill Pack 更新模板后，已装项目重新盖章的唯一合法出路
        (root / ".trellis/workflow.md").write_text("Overlay 版 v2", encoding="utf-8")
        assert cmd_verify(root) == 1
        fails(lambda: cmd_bless(root, []), "显式点名路径")
        fails(lambda: cmd_bless(root, ["不在记账里.md"]), "不在记账里")
        fails(lambda: cmd_bless(root, [".claude/skills/trellis-brainstorm"]),
              "tombstone 没有 applied_hash")
        assert cmd_bless(root, [".trellis/workflow.md"]) == 0
        assert cmd_verify(root) == 0, "bless 之后应该重新一致"
        assert json.loads((root / STATE_PATH).read_text(encoding="utf-8")
                          )["files"][".trellis/workflow.md"]["upstream_hash"] == upstream, \
            "bless 不该动 upstream_hash —— 动了就再也算不出「恢复成官方原样」"

        # 升级路径：不传版本号一个字不动，传了才升并刷 applied_at。
        # applied_at 精度是秒，selfcheck 跑得比一秒快 —— 先把它设成个明显的过去值才验得出来。
        st = json.loads((root / STATE_PATH).read_text(encoding="utf-8"))
        assert st["overlay_version"] == "v0.4.0", "bless 不传版本号时不该动它"
        st["applied_at"] = "2000-01-01T00:00:00+00:00"
        (root / STATE_PATH).write_text(json.dumps(st, indent=2, ensure_ascii=False) + "\n",
                                       encoding="utf-8")
        assert cmd_bless(root, [".trellis/workflow.md"], "v0.4.1") == 0
        st = json.loads((root / STATE_PATH).read_text(encoding="utf-8"))
        assert st["overlay_version"] == "v0.4.1", "bless --overlay-version 没升版本号"
        assert st["applied_at"] != "2000-01-01T00:00:00+00:00", "升版本号时没刷 applied_at"
        assert cmd_verify(root) == 0, "只升版本号不该动 hash"

        # 增量补装：项目已装 claude-code，现在磁盘上多出 codex，只列 codex 的路径
        (root / ".codex/hooks").mkdir(parents=True)
        (root / ".codex/hooks/inject-workflow-state.py").write_text("官方注入", encoding="utf-8")
        (root / ".agents/skills/trellis-brainstorm").mkdir(parents=True)
        (root / ".agents/skills/trellis-brainstorm/SKILL.md").write_text("y", encoding="utf-8")

        fails(lambda: cmd_snapshot(root, "modify shared .trellis/workflow.md\n"),
              "已经在记账里")
        assert cmd_snapshot(root, "modify codex .codex/hooks/inject-workflow-state.py\n"
                                  "delete codex .agents/skills/trellis-brainstorm\n") == 0
        state = json.loads((root / STATE_PATH).read_text(encoding="utf-8"))
        assert len(state["files"]) == 5 and len(state["_fresh"]) == 2, "老记账没带过来"
        assert state["files"][".trellis/workflow.md"]["applied_hash"] is not None, \
            "补装的 snapshot 不该把老路径的 applied_hash 抹掉"

        # 老路径此刻是漂的：finalize 只准盖本次新加的，不准顺手把它盖平
        (root / ".trellis/workflow.md").write_text("补装期间有人手改了", encoding="utf-8")
        (root / ".codex/hooks/inject-workflow-state.py").write_text("Overlay 注入", encoding="utf-8")
        shutil.rmtree(root / ".agents/skills/trellis-brainstorm")
        assert cmd_finalize(root, "v0.4.0", "0.6.15", "unverified", "codex") == 0
        state = json.loads((root / STATE_PATH).read_text(encoding="utf-8"))
        assert state["platforms"] == ["claude-code", "codex"], "平台该并集，不是覆盖"
        assert "_fresh" not in state
        assert cmd_verify(root) == 1, "finalize 把老路径的漂移顺手盖掉了"
        (root / ".trellis/workflow.md").write_text("Overlay 版 v2", encoding="utf-8")
        assert cmd_verify(root) == 0

    fails(lambda: parse_manifest("modify shared"), "不是三列")
    fails(lambda: parse_manifest("rename shared a.md"), "只允许")
    fails(lambda: parse_manifest("modify pi a.md"), "只允许")
    fails(lambda: parse_manifest("# 全是注释\n"), "空的")

    print("selfcheck 通过")
    return 0


def main(argv: list[str]) -> int:
    import argparse
    p = argparse.ArgumentParser(description="Oxyteam Overlay 记账")
    p.add_argument("command", choices=["snapshot", "finalize", "bless", "verify", "selfcheck"])
    p.add_argument("paths", nargs="*", help="bless 专用：要重新盖章的路径")
    p.add_argument("--root", default=".", help="仓库根，缺省当前目录")
    # 默认 None 是为了让 bless 分得清「显式要升版本」和「argparse 塞的默认值」
    p.add_argument("--overlay-version", default=None,
                   help=f"缺省 {OVERLAY_VERSION}；bless 传了才升版本号并刷 applied_at")
    p.add_argument("--trellis-version", default="0.6.15")
    # skills-lock.json 没有 ref 字段，装的是默认分支 —— 默认值只能是「没验过」，
    # 记一个没验过的版本号比不记更坏。传 computedHash 或真实 tag 才有意义。
    p.add_argument("--skill-pack-ref", default="unverified")
    p.add_argument("--platforms", default="", help="逗号分隔，finalize 必填")
    a = p.parse_args(argv[1:])

    if a.command == "selfcheck":
        return selfcheck()
    root = Path(a.root).resolve()
    if a.command == "snapshot":
        return cmd_snapshot(root, sys.stdin.read())
    if a.command == "bless":
        return cmd_bless(root, a.paths, a.overlay_version)
    if a.command == "verify":
        return cmd_verify(root)
    if not a.platforms:
        raise SystemExit("finalize 要 --platforms，例如 --platforms omp,claude-code")
    return cmd_finalize(root, a.overlay_version or OVERLAY_VERSION, a.trellis_version,
                        a.skill_pack_ref, a.platforms)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
