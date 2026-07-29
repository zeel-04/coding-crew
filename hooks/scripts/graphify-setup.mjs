#!/usr/bin/env node
// SessionStart hook: ensure the graphify CLI is installed, then build/refresh the
// project knowledge graph. Both steps run detached — session start never waits.
// Runs on macOS, Linux, and native Windows (no bash/PowerShell dependency).

import { existsSync, mkdirSync, statSync, readFileSync, appendFileSync, openSync, readdirSync, closeSync, rmSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';

const PIN = 'graphifyy==0.9.29';
const WIN = process.platform === 'win32';
const RETRY_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const SELF = fileURLToPath(import.meta.url);

const cacheDir =
  process.env.CLAUDE_PLUGIN_DATA ||
  (WIN
    ? join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'coding-crew')
    : join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'coding-crew'));

const MARKER = join(cacheDir, 'graphify-install-failed');
const WARNED = join(cacheDir, 'graphify-install-warned');
const LOG = join(cacheDir, 'graphify.log');

// User-level installs (uv tool, pipx, pip --user) land in these directories, but a
// non-interactive hook process often doesn't inherit them on PATH.
function userBinDirs() {
  // uv and pipx both default to ~/.local/bin (%USERPROFILE%\.local\bin on Windows).
  const dirs = [
    process.env.UV_TOOL_BIN_DIR,
    process.env.PIPX_BIN_DIR,
    process.env.XDG_BIN_HOME,
    join(homedir(), '.local', 'bin'),
  ].filter(Boolean);
  if (WIN) {
    // pip --user puts scripts under a version-specific folder, so scan one level.
    const roaming = process.env.APPDATA && join(process.env.APPDATA, 'Python');
    if (roaming) {
      dirs.push(join(roaming, 'Scripts'));
      try {
        for (const e of readdirSync(roaming)) dirs.push(join(roaming, e, 'Scripts'));
      } catch {}
    }
  } else {
    dirs.push(join(homedir(), 'Library', 'Python', 'bin'), join(homedir(), 'bin'));
  }
  return dirs;
}
process.env.PATH = [...userBinDirs(), process.env.PATH || ''].filter(Boolean).join(delimiter);

// Node's spawn resolves PATH but not PATHEXT, so `git`/`graphify` need explicit
// extension resolution on Windows.
function which(cmd) {
  const exts = WIN ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';') : [''];
  for (const dir of (process.env.PATH || '').split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const p = join(dir, cmd + ext);
      try {
        if (statSync(p).isFile()) return p;
      } catch {}
    }
  }
  return null;
}

const log = (msg) => {
  try {
    mkdirSync(cacheDir, { recursive: true });
    appendFileSync(LOG, `${new Date().toISOString()} ${msg}\n`);
  } catch {}
};

const mtime = (p) => {
  try {
    return statSync(p).mtimeMs;
  } catch {
    return 0;
  }
};

const touch = (p) => {
  try {
    mkdirSync(cacheDir, { recursive: true });
    closeSync(openSync(p, 'w'));
  } catch {}
};

// --- install worker: re-exec of this script, runs detached --------------------
if (process.argv[2] === '--install') {
  const attempts = [
    ['uv', ['tool', 'install', PIN]],
    ['pipx', ['install', PIN]],
    ['pip3', ['install', '--user', PIN]],
    ['pip', ['install', '--user', PIN]],
    ['python3', ['-m', 'pip', 'install', '--user', PIN]],
    ['python', ['-m', 'pip', 'install', '--user', PIN]],
  ];
  for (const [cmd, args] of attempts) {
    const bin = which(cmd);
    if (!bin) continue;
    log(`install: ${cmd} ${args.join(' ')}`);
    const r = spawnSync(bin, args, { encoding: 'utf8' });
    if (r.stdout) log(r.stdout.trim());
    if (r.stderr) log(r.stderr.trim());
    if (which('graphify')) {
      log('install: graphify available');
      process.exit(0);
    }
  }
  log('install: all methods failed');
  touch(MARKER);
  process.exit(0);
}

// --- 1. Ensure the graphify CLI exists ---------------------------------------
if (!which('graphify')) {
  if (existsSync(MARKER)) {
    if (Date.now() - mtime(MARKER) < RETRY_AFTER_MS) {
      // Surface the previous background failure once, then stay quiet.
      if (!existsSync(WARNED)) {
        touch(WARNED);
        process.stderr.write(
          `coding-crew: graphify auto-install failed — install manually with: pip install ${PIN}\n` +
            `  log: ${LOG}\n`,
        );
      }
      process.exit(0);
    }
    for (const p of [MARKER, WARNED]) {
      try {
        rmSync(p, { force: true });
      } catch {}
    }
  }

  const nodeBin = process.execPath;
  const child = spawn(nodeBin, [SELF, '--install'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  // The graph build needs the CLI; it runs on the next session start.
  process.exit(0);
}

// --- 2. Only operate inside a git repository ---------------------------------
const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const gitBin = which('git');
if (!gitBin) process.exit(0);

const git = (...args) => spawnSync(gitBin, args, { cwd: projectDir, encoding: 'utf8' });
if (git('rev-parse', '--is-inside-work-tree').status !== 0) process.exit(0);

const gitPath = (p) => {
  const r = git('rev-parse', '--git-path', p);
  if (r.status !== 0) return null;
  const out = r.stdout.trim();
  return out ? (out.match(/^([A-Za-z]:[\\/]|\/)/) ? out : join(projectDir, out)) : null;
};

// Keep graphify output out of the repo without touching the user's .gitignore.
const excludeFile = gitPath('info/exclude');
if (excludeFile) {
  try {
    const body = existsSync(excludeFile) ? readFileSync(excludeFile, 'utf8') : '';
    if (!body.split(/\r?\n/).includes('graphify-out/')) {
      appendFileSync(excludeFile, `${body && !body.endsWith('\n') ? '\n' : ''}graphify-out/\n`);
    }
  } catch {}
}

// --- 3. Skip if the graph is newer than the repo's last local change ---------
// HEAD/index mtimes track when code actually arrived on this machine; a commit's
// own timestamp can predate the graph even when the code is brand new here.
const graph = join(projectDir, 'graphify-out', 'graph.json');
const buildArgs = ['.', '--code-only'];
if (existsSync(graph)) {
  const repoTs = Math.max(...['HEAD', 'index'].map((r) => mtime(gitPath(r) || '')));
  if (mtime(graph) >= repoTs) process.exit(0);
  buildArgs.push('--update');
}

// --- 4. Build detached so the session never waits ----------------------------
// --code-only keeps extraction on the local tree-sitter AST: no LLM API key
// required (graphify errors out without one as soon as the repo contains docs or
// images), and no source is sent to a third-party model without consent.
log(`build: ${projectDir} : graphify ${buildArgs.join(' ')}`);
let out = 'ignore';
try {
  mkdirSync(cacheDir, { recursive: true });
  out = openSync(LOG, 'a');
} catch {}
const build = spawn(which('graphify'), buildArgs, {
  cwd: projectDir,
  detached: true,
  stdio: ['ignore', out, out],
  windowsHide: true,
});
build.unref();
