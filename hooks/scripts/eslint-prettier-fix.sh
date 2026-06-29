#!/bin/bash
# PostToolUse hook: auto-fix lint issues and reformat the edited file with ESLint + Prettier.
set -u

input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')

[[ -n "$file_path" && "$file_path" =~ \.(ts|tsx|js|jsx)$ && -f "$file_path" ]] || exit 0
command -v pnpm >/dev/null 2>&1 || exit 0

dir=$(dirname "$file_path")

lint_output=$(cd "$dir" && pnpm exec eslint --fix "$file_path" 2>&1)
lint_status=$?

cd "$dir" && pnpm exec prettier --write "$file_path" >/dev/null 2>&1

if [[ $lint_status -ne 0 ]]; then
  echo "eslint found issues in $file_path that could not be auto-fixed:" >&2
  echo "$lint_output" >&2
  exit 2
fi

exit 0
