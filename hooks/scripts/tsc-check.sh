#!/bin/bash
# PostToolUse hook: report TypeScript type errors for the edited file. Report-only, no fixes applied.
set -u

input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')

[[ -n "$file_path" && "$file_path" =~ \.(ts|tsx)$ && -f "$file_path" ]] || exit 0
command -v pnpm >/dev/null 2>&1 || exit 0

dir=$(dirname "$file_path")
root="$dir"
while [[ "$root" != "/" && ! -f "$root/package.json" ]]; do
  root=$(dirname "$root")
done
[[ -f "$root/package.json" ]] || exit 0

output=$(cd "$root" && pnpm exec tsc --noEmit 2>&1)
status=$?

[[ $status -ne 0 ]] || exit 0

rel_path="${file_path#"$root"/}"
file_errors=$(echo "$output" | grep -F "$rel_path")

if [[ -n "$file_errors" ]]; then
  echo "tsc found type errors in $file_path:" >&2
  echo "$file_errors" >&2
  exit 2
fi

exit 0
