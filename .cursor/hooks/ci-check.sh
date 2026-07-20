#!/usr/bin/env bash
# After each completed agent turn, run the same checks as CI (`bun run check`).
# On failure, return followup_message so the agent can fix before the next push.
set -euo pipefail

input=$(cat)
status=$(echo "$input" | jq -r '.status // empty')
loop_count=$(echo "$input" | jq -r '.loop_count // 0')

noop() {
  printf '%s\n' '{}'
  exit 0
}

# Only verify clean completions; skip aborts/errors and cap follow-up loops.
if [[ "$status" != "completed" ]]; then
  noop
fi

if [[ "${loop_count}" -ge 3 ]]; then
  printf '%s\n' '{}' >&2
  echo "ci-check: loop_count=${loop_count} >= 3; not re-triggering" >&2
  noop
fi

# Prefer project-local bun; keep stderr for Hooks channel, stdout for JSON only.
root=$(pwd)
cd "$root"

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

set +e
bun run check >"$tmp" 2>&1
code=$?
set -e

if [[ "$code" -eq 0 ]]; then
  echo "ci-check: bun run check passed" >&2
  noop
fi

echo "ci-check: bun run check failed (exit ${code})" >&2

# Truncate and JSON-encode safely (output may contain quotes/control chars).
head -c 12000 "$tmp" | python3 -c '
import json, sys

out = sys.stdin.read()
msg = (
    "The project stop hook ran `bun run check` after your last turn "
    "(lint, typecheck, test, build — same as CI).\n\n"
    f"It failed with exit code {sys.argv[1]}.\n\n"
    "Fix the issues below, then finish. Do not ask me to re-run checks; "
    "the hook will verify again when you stop.\n\n"
    "```text\n"
    f"{out}\n"
    "```"
)
print(json.dumps({"followup_message": msg}, ensure_ascii=False))
' "$code"

exit 0
