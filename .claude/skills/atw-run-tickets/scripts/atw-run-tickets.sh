#!/usr/bin/env bash
# atw-run-tickets.sh — 按工单前沿逐张启动全新的无头 Claude Code 会话跑 /atw-implement。
#
# 用法：
#   atw-run-tickets.sh [--task <task-dir>] [--max <n>] [--dry-run] [--permission <mode>]
#
#   --task        任务目录（默认：.atw/tasks 下唯一一个 status=implement 的任务）
#   --max         最多跑几张工单（默认：不限，直到前沿为空）
#   --dry-run     只打印每轮要执行的命令，不真的启动 claude
#   --permission  传给 claude 的权限方式（默认 skip = --dangerously-skip-permissions）
#
# 环境变量：
#   ATW_RUN_TEST_CMD   每张工单完成后额外跑一次的测试命令（如 "npm test"），不设则跳过
#   ATW_RUN_MAX_TURNS  单次会话最大轮次（默认 300）
#   ATW_RUN_COMMIT_STATE  每张工单后是否把 .atw/tasks/<task> 的状态改动单独提交（默认 1；设 0 关闭）
#
# 每轮做的事：
#   1. tickets.py frontier 取第一张可开工的工单
#   2. 为这一轮生成唯一的 ATW_CONTEXT_ID，用它 task.py start 把活动任务指针指到本任务
#   3. tickets.py claim NN
#   4. claude -p "/atw-implement NN"，全新会话，固定 --session-id 以便事后 claude --resume
#   5. 结束后检查：工单必须是 done、工作区必须干净、（可选）测试通过；任一不满足立即停下
set -uo pipefail
export LC_ALL=C.UTF-8 LANG=C.UTF-8

TASK_DIR=""; MAX=0; DRY=0; PERM="skip"
while [ $# -gt 0 ]; do
  case "$1" in
    --task) TASK_DIR="$2"; shift 2;;
    --max) MAX="$2"; shift 2;;
    --dry-run) DRY=1; shift;;
    --permission) PERM="$2"; shift 2;;
    *) echo "未知参数: $1" >&2; exit 2;;
  esac
done

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "不在 git 仓库里" >&2; exit 2; }
cd "$ROOT"
[ -f .atw/scripts/tickets.py ] || { echo "这里没有 ATW（缺 .atw/scripts/tickets.py）" >&2; exit 2; }

# 默认任务：唯一一个处于 implement 的任务
if [ -z "$TASK_DIR" ]; then
  TASK_DIR=$(python3 - <<'PY'
import json, pathlib
hits=[p.parent for p in pathlib.Path('.atw/tasks').glob('*/task.json')
      if json.load(open(p)).get('status')=='implement']
print(hits[0] if len(hits)==1 else '')
PY
)
  [ -n "$TASK_DIR" ] || { echo "找不到唯一的 implement 任务，请用 --task 指定" >&2; exit 2; }
fi
TASK_NAME=$(basename "$TASK_DIR")
LOG_DIR="$ROOT/.atw/.runtime/runs/$TASK_NAME"
mkdir -p "$LOG_DIR"

case "$PERM" in
  skip) PERM_ARGS=(--dangerously-skip-permissions);;
  *) PERM_ARGS=(--permission-mode "$PERM");;
esac
MAX_TURNS="${ATW_RUN_MAX_TURNS:-300}"

# 开跑前工作区必须干净：否则会话可能把无关改动一起提交，且门禁 2 必然失败
if [ -n "$(git status --porcelain)" ]; then
  echo "工作区不干净，先提交或清理再开跑：" >&2; git status --short >&2; exit 2
fi
echo "任务: $TASK_DIR"
echo "日志: $LOG_DIR"
echo

count=0
while :; do
  if [ "$MAX" -gt 0 ] && [ "$count" -ge "$MAX" ]; then
    echo "已达 --max ${MAX}，停止。"; break
  fi

  # 前沿第一张
  NN=$(python3 .atw/scripts/tickets.py frontier --task-dir "$TASK_DIR" 2>/dev/null | awk '$1 ~ /^[0-9]+$/ {print $1; exit}')
  if [ -z "$NN" ]; then
    echo "前沿为空。当前状态："
    python3 .atw/scripts/tickets.py summary --task-dir "$TASK_DIR"
    break
  fi

  STAMP=$(date +%Y%m%d-%H%M%S)
  export ATW_CONTEXT_ID="atw-run-${TASK_NAME}-${NN}-${STAMP}"
  SESSION_ID=$(python3 -c 'import uuid;print(uuid.uuid4())')
  RAW="$LOG_DIR/${STAMP}-ticket-${NN}.jsonl"
  TXT="$LOG_DIR/${STAMP}-ticket-${NN}.md"

  echo "════════ 工单 $NN  ($(date '+%H:%M:%S')) ════════"
  echo "context: $ATW_CONTEXT_ID"
  echo "session: $SESSION_ID   （事后可 claude --resume ${SESSION_ID}）"

  CMD=(claude -p "/atw-implement $NN" --session-id "$SESSION_ID" --max-turns "$MAX_TURNS"
       --output-format stream-json --verbose "${PERM_ARGS[@]}")
  if [ "$DRY" -eq 1 ]; then
    echo "[dry-run] task.py start $TASK_NAME && tickets.py claim $NN"
    echo "[dry-run] ${CMD[*]}"
    count=$((count+1)); [ "$MAX" -gt 0 ] && continue || break
  fi

  # 把活动任务指针指到本任务，再领工单
  python3 .atw/scripts/task.py start "$TASK_NAME" >/dev/null 2>&1 || { echo "task.py start 失败" >&2; exit 1; }
  python3 .atw/scripts/tickets.py claim "$NN" --task-dir "$TASK_DIR" >/dev/null || { echo "claim $NN 失败" >&2; exit 1; }

  START=$(date +%s)
  "${CMD[@]}" < /dev/null > "$RAW" 2>"$LOG_DIR/${STAMP}-ticket-${NN}.stderr"
  RC=$?
  ELAPSED=$(( $(date +%s) - START ))

  # 从 stream-json 里抽出助手正文，生成可读日志
  python3 - "$RAW" "$TXT" <<'PY'
import json, sys
raw, out = sys.argv[1], sys.argv[2]
lines = []
for line in open(raw, encoding='utf-8', errors='replace'):
    try: ev = json.loads(line)
    except Exception: continue
    if ev.get('type') == 'assistant':
        for blk in ev.get('message', {}).get('content', []):
            if blk.get('type') == 'text' and blk.get('text', '').strip():
                lines.append(blk['text'].strip())
            elif blk.get('type') == 'tool_use':
                name = blk.get('name'); inp = blk.get('input', {})
                brief = inp.get('command') or inp.get('skill') or inp.get('description') or inp.get('file_path') or ''
                lines.append(f"> [{name}] {str(brief)[:160]}")
    elif ev.get('type') == 'result':
        lines.append(f"\n--- result: {ev.get('subtype')} · turns={ev.get('num_turns')} · cost=${ev.get('total_cost_usd', 0):.2f} · {ev.get('duration_ms',0)//1000}s ---")
open(out, 'w', encoding='utf-8').write('\n\n'.join(lines) + '\n')
PY

  echo "claude 退出码 ${RC}，用时 ${ELAPSED}s，可读日志: $TXT"
  python3 -c "import json,sys
for l in open(sys.argv[1]):
    try: e=json.loads(l)
    except: continue
    if e.get('type')=='result': print('  result:',e.get('subtype'),'turns=',e.get('num_turns'),'cost=$%.2f'%e.get('total_cost_usd',0))" "$RAW"

  # 门禁 1：工单必须 done
  STATE=$(grep -m1 '^\*\*Impl:\*\*' "$TASK_DIR"/issues/"$NN"-*.md | awk '{print $NF}')
  if [ "$STATE" != "done" ]; then
    echo "✗ 工单 $NN 结束时状态是 '$STATE'，不是 done。停止。看日志或 claude --resume $SESSION_ID" >&2
    exit 1
  fi
  # tickets.py done 会改工单文件和 check.jsonl，闭链不负责提交它们；这里补一个状态提交
  if [ "${ATW_RUN_COMMIT_STATE:-1}" != "0" ] && [ -n "$(git status --porcelain -- "$TASK_DIR")" ]; then
    git add -- "$TASK_DIR" && git commit -q -m "chore(atw): 工单 ${NN} 完成，更新任务状态" && echo "✓ 已提交任务状态改动"
  fi
  # 门禁 2：工作区必须干净（闭链应已提交）
  if [ -n "$(git status --porcelain)" ]; then
    echo "✗ 工作区不干净，闭链没有提交完。停止。" >&2; git status --short >&2; exit 1
  fi
  # 门禁 3（可选）：独立再跑一次测试
  if [ -n "${ATW_RUN_TEST_CMD:-}" ]; then
    if ! bash -c "$ATW_RUN_TEST_CMD" > "$LOG_DIR/${STAMP}-ticket-${NN}.test.log" 2>&1; then
      echo "✗ 工单 $NN 提交后测试未通过，停止。日志 $LOG_DIR/${STAMP}-ticket-${NN}.test.log" >&2; exit 1
    fi
    echo "✓ 测试通过"
  fi
  echo "✓ 工单 $NN 完成：$(git log -1 --oneline)"
  echo
  count=$((count+1))
done

echo "本次共完成 $count 张工单。"
