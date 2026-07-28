#!/bin/bash
# SessionStart hook: ensure the graphify CLI is installed, then build/refresh the
# project knowledge graph in the background. Never blocks session start.
set -u

MARKER="$HOME/.cache/coding-crew/graphify-install-failed"

# --- 1. Ensure the graphify CLI exists -------------------------------------
if ! command -v graphify >/dev/null 2>&1; then
  [[ -f "$MARKER" ]] && exit 0

  installed=false
  if command -v uv >/dev/null 2>&1 && uv tool install graphifyy >/dev/null 2>&1; then
    installed=true
  elif command -v pipx >/dev/null 2>&1 && pipx install graphifyy >/dev/null 2>&1; then
    installed=true
  elif command -v pip >/dev/null 2>&1 && pip install --user graphifyy >/dev/null 2>&1; then
    installed=true
  fi

  if [[ "$installed" != true ]] || ! command -v graphify >/dev/null 2>&1; then
    mkdir -p "$(dirname "$MARKER")" && touch "$MARKER"
    echo "coding-crew: could not auto-install graphify — install it manually with: pip install graphifyy" >&2
    exit 0
  fi
fi

# --- 2. Only operate inside a git repository --------------------------------
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

# Keep graphify output out of the repo without touching the user's .gitignore.
exclude_file="$(git rev-parse --git-dir)/info/exclude"
if [[ -w "$(dirname "$exclude_file")" ]] && ! grep -qxF 'graphify-out/' "$exclude_file" 2>/dev/null; then
  echo 'graphify-out/' >> "$exclude_file"
fi

# --- 3. Skip if the graph is newer than the latest commit -------------------
graph="graphify-out/graph.json"
if [[ -f "$graph" ]]; then
  graph_ts=$(stat -f %m "$graph" 2>/dev/null || stat -c %Y "$graph" 2>/dev/null || echo 0)
  commit_ts=$(git log -1 --format=%ct 2>/dev/null || echo 0)
  [[ "$graph_ts" -ge "$commit_ts" ]] && exit 0
  build_cmd=(graphify . --update)
else
  build_cmd=(graphify .)
fi

# --- 4. Build in the background so the session never waits ------------------
nohup "${build_cmd[@]}" >/dev/null 2>&1 &
exit 0
