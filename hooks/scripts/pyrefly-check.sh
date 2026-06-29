#!/bin/bash
# PostToolUse hook: report pyrefly type errors for the edited Python file. Report-only, no fixes applied.
set -u

input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')

[[ -n "$file_path" && "$file_path" == *.py && -f "$file_path" ]] || exit 0
command -v uv >/dev/null 2>&1 || exit 0

dir=$(dirname "$file_path")

output=$(cd "$dir" && uv run pyrefly check --preset strict "$file_path" 2>&1)
status=$?

if [[ $status -ne 0 ]]; then
  echo "pyrefly found type errors in $file_path:" >&2
  echo "$output" >&2
  exit 2
fi

exit 0
