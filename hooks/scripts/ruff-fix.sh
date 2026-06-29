#!/bin/bash
# PostToolUse hook: auto-fix lint issues and reformat the edited Python file with ruff.
set -u

input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')

[[ -n "$file_path" && "$file_path" == *.py && -f "$file_path" ]] || exit 0
command -v uv >/dev/null 2>&1 || exit 0

dir=$(dirname "$file_path")

check_output=$(cd "$dir" && uv run ruff check --extend-select I --fix "$file_path" 2>&1)
check_status=$?

cd "$dir" && uv run ruff format "$file_path" >/dev/null 2>&1

if [[ $check_status -ne 0 ]]; then
  echo "ruff found issues in $file_path that could not be auto-fixed:" >&2
  echo "$check_output" >&2
  exit 2
fi

exit 0
