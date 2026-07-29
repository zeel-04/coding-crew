#!/bin/bash
# SessionStart hook: ensure the graphify CLI is installed, then build/refresh the
# project knowledge graph. Both steps run in the background — session start never waits.
set -u

GRAPHIFY_PIN="graphifyy==0.9.29"
CACHE_DIR="$HOME/.cache/coding-crew"
MARKER="$CACHE_DIR/graphify-install-failed"
WARNED="$CACHE_DIR/graphify-install-warned"
LOG="$CACHE_DIR/graphify.log"
RETRY_AFTER=$((7 * 24 * 60 * 60))

# User-level installs (uv tool, pipx, pip --user) land here but a non-interactive
# hook shell often doesn't inherit these on PATH.
export PATH="$HOME/.local/bin:$HOME/Library/Python/bin:$HOME/bin:$PATH"

# GNU first: BSD stat rejects -c cleanly (usage goes to stderr, no stdout), while
# GNU stat treats "-f %m" as --file-system and prints a filesystem block to stdout.
mtime() { stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null || echo 0; }

# --- 1. Ensure the graphify CLI exists (in the background) ------------------
if ! command -v graphify >/dev/null 2>&1; then
  if [[ -f "$MARKER" ]]; then
    now=$(date +%s)
    if (( now - $(mtime "$MARKER") < RETRY_AFTER )); then
      # Surface the previous background failure once, then stay quiet.
      if [[ ! -f "$WARNED" ]]; then
        touch "$WARNED"
        echo "coding-crew: graphify auto-install failed — install manually with: pip install $GRAPHIFY_PIN" >&2
      fi
      exit 0
    fi
    rm -f "$MARKER" "$WARNED"
  fi

  mkdir -p "$CACHE_DIR"
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') installing $GRAPHIFY_PIN" >> "$LOG" 2>/dev/null
  nohup bash -c '
    export PATH="$HOME/.local/bin:$HOME/Library/Python/bin:$HOME/bin:$PATH"
    if command -v uv >/dev/null 2>&1; then uv tool install "'"$GRAPHIFY_PIN"'"; fi
    if ! command -v graphify >/dev/null 2>&1 && command -v pipx >/dev/null 2>&1; then
      pipx install "'"$GRAPHIFY_PIN"'"
    fi
    if ! command -v graphify >/dev/null 2>&1 && command -v pip3 >/dev/null 2>&1; then
      pip3 install --user "'"$GRAPHIFY_PIN"'"
    fi
    command -v graphify >/dev/null 2>&1 || touch "'"$MARKER"'"
  ' >>"$LOG" 2>&1 &

  # The graph build needs the CLI; it runs on the next session start.
  exit 0
fi

# --- 2. Only operate inside a git repository --------------------------------
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

# Keep graphify output out of the repo without touching the user's .gitignore.
# --git-path resolves info/exclude to the common dir, which is what git reads
# (--git-dir would point into .git/worktrees/<name> in a linked worktree).
exclude_file=$(git rev-parse --git-path info/exclude 2>/dev/null)
if [[ -n "$exclude_file" ]] && ! grep -qxF 'graphify-out/' "$exclude_file" 2>/dev/null; then
  echo 'graphify-out/' >> "$exclude_file" 2>/dev/null
fi

# --- 3. Skip if the graph is newer than the repo's last local change --------
# HEAD/index mtimes track when code actually arrived on this machine; a commit's
# own timestamp can predate the graph even when the code is brand new here.
graph="graphify-out/graph.json"
if [[ -f "$graph" ]]; then
  graph_ts=$(mtime "$graph")
  repo_ts=0
  for ref in "$(git rev-parse --git-path HEAD)" "$(git rev-parse --git-path index)"; do
    ref_ts=$(mtime "$ref")
    (( ref_ts > repo_ts )) && repo_ts=$ref_ts
  done
  (( graph_ts >= repo_ts )) && exit 0
  build_cmd=(graphify . --code-only --update)
else
  build_cmd=(graphify . --code-only)
fi

# --- 4. Build in the background so the session never waits ------------------
# --code-only keeps extraction on the local tree-sitter AST: no LLM API key
# required (graphify errors out without one as soon as the repo contains docs
# or images), and no source is sent to a third-party model without consent.
# Output is logged so a silent background failure is diagnosable.
mkdir -p "$CACHE_DIR"
{
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') $(pwd) : ${build_cmd[*]}"
} >> "$LOG" 2>/dev/null
nohup "${build_cmd[@]}" >>"$LOG" 2>&1 &
exit 0
