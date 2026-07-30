#!/usr/bin/env node
// MCP launcher: resolve the current repo's DATABASE_URI from its root .env and
// run postgres-mcp as a stdio MCP server. Repos without a DATABASE_URI exit
// quietly; a missing binary triggers a detached background install so MCP
// startup is never blocked. Runs on macOS, Linux, and native Windows.
//
// Helpers below are intentionally mirrored from graphify-setup.mjs — each
// script stays independently readable rather than sharing a module.

import {
  existsSync,
  mkdirSync,
  statSync,
  readFileSync,
  appendFileSync,
  openSync,
  closeSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join, delimiter } from "node:path";
import { fileURLToPath } from "node:url";

const PIN = "postgres-mcp==0.3.0"; // requires Python >= 3.12; uv can fetch one
const WIN = process.platform === "win32";
const RETRY_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const SELF = fileURLToPath(import.meta.url);

const cacheDir =
  process.env.CLAUDE_PLUGIN_DATA ||
  (WIN
    ? join(
        process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"),
        "coding-crew",
      )
    : join(
        process.env.XDG_CACHE_HOME || join(homedir(), ".cache"),
        "coding-crew",
      ));

const MARKER = join(cacheDir, "postgres-mcp-install-failed");
const WARNED = join(cacheDir, "postgres-mcp-install-warned");
const LOG = join(cacheDir, "postgres-mcp.log");

// User-level installs (uv tool, pipx, pip --user) land in these directories, but a
// non-interactive launcher process often doesn't inherit them on PATH.
function userBinDirs() {
  const dirs = [
    process.env.UV_TOOL_BIN_DIR,
    process.env.PIPX_BIN_DIR,
    process.env.XDG_BIN_HOME,
    join(homedir(), ".local", "bin"),
  ].filter(Boolean);
  if (WIN) {
    const roaming = process.env.APPDATA && join(process.env.APPDATA, "Python");
    if (roaming) {
      dirs.push(join(roaming, "Scripts"));
      try {
        for (const e of readdirSync(roaming))
          dirs.push(join(roaming, e, "Scripts"));
      } catch {}
    }
  } else {
    dirs.push(
      join(homedir(), "Library", "Python", "bin"),
      join(homedir(), "bin"),
    );
  }
  return dirs;
}
process.env.PATH = [...userBinDirs(), process.env.PATH || ""]
  .filter(Boolean)
  .join(delimiter);

// Node's spawn resolves PATH but not PATHEXT, so binaries need explicit
// extension resolution on Windows.
function which(cmd) {
  const exts = WIN
    ? (process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";")
    : [""];
  for (const dir of (process.env.PATH || "").split(delimiter)) {
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
    closeSync(openSync(p, "w"));
  } catch {}
};

// Minimal .env parser: KEY=value lines, optional `export `, matching single or
// double quotes stripped. No $VAR interpolation, no multiline values.
function parseDotEnv(path) {
  const out = {};
  let body;
  try {
    body = readFileSync(path, "utf8");
  } catch {
    return out;
  }
  for (const line of body.split(/\r?\n/)) {
    const m = line.match(
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/,
    );
    if (!m) continue;
    let v = m[2];
    if (
      (v.startsWith('"') && v.endsWith('"') && v.length >= 2) ||
      (v.startsWith("'") && v.endsWith("'") && v.length >= 2)
    ) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

// --- install worker: re-exec of this script, runs detached --------------------
if (process.argv[2] === "--install") {
  // --python 3.13: newer interpreters lack a prebuilt pglast wheel and the
  // source build breaks against recent macOS SDKs. mcp<2: postgres-mcp 0.3.0
  // imports mcp.server.fastmcp, which mcp 2.0 removed.
  const MCP_CAP = "mcp<2";
  const attempts = [
    ["uv", ["tool", "install", "--python", "3.13", "--with", MCP_CAP, PIN]],
    ["pipx", ["install", PIN, "--pip-args", MCP_CAP]],
    ["pip3", ["install", "--user", PIN, MCP_CAP]],
    ["pip", ["install", "--user", PIN, MCP_CAP]],
    ["python3", ["-m", "pip", "install", "--user", PIN, MCP_CAP]],
    ["python", ["-m", "pip", "install", "--user", PIN, MCP_CAP]],
  ];
  for (const [cmd, args] of attempts) {
    const bin = which(cmd);
    if (!bin) continue;
    log(`install: ${cmd} ${args.join(" ")}`);
    const r = spawnSync(bin, args, { encoding: "utf8" });
    if (r.stdout) log(r.stdout.trim());
    if (r.stderr) log(r.stderr.trim());
    if (which("postgres-mcp")) {
      log("install: postgres-mcp available");
      process.exit(0);
    }
  }
  // pip/pipx need a system Python >= 3.12; uv fetches its own interpreter, so
  // it is the path that almost always succeeds.
  log("install: all methods failed");
  touch(MARKER);
  process.exit(0);
}

// --- 1. Resolve per-repo config from the repo root .env -----------------------
// .env wins over ambient env: a stale globally-exported DATABASE_URI must not
// hijack a repo's database.
const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const fileEnv = parseDotEnv(join(projectDir, ".env"));
const DATABASE_URI = fileEnv.DATABASE_URI ?? process.env.DATABASE_URI;
const access =
  (fileEnv.POSTGRES_MCP_ACCESS ?? process.env.POSTGRES_MCP_ACCESS) ===
  "unrestricted"
    ? "unrestricted"
    : "restricted";

// --- 2. Quiet exit for repos without a database (before any install work) -----
if (!DATABASE_URI) {
  process.stderr.write(
    `coding-crew: no DATABASE_URI in ${join(projectDir, ".env")} — postgres MCP idle for this repo\n`,
  );
  process.exit(0);
}

// --- 3. Ensure the postgres-mcp binary exists ---------------------------------
if (!which("postgres-mcp")) {
  if (existsSync(MARKER)) {
    if (Date.now() - mtime(MARKER) < RETRY_AFTER_MS) {
      // Surface the previous background failure once, then stay quiet.
      if (!existsSync(WARNED)) {
        touch(WARNED);
        process.stderr.write(
          `coding-crew: postgres-mcp auto-install failed — install manually with: pip install ${PIN}\n` +
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

  const child = spawn(process.execPath, [SELF, "--install"], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  process.stderr.write(
    "coding-crew: installing postgres-mcp in background — reconnect with /mcp or next session\n",
  );
  process.exit(0);
}

// --- 4. Run postgres-mcp as the MCP server ------------------------------------
// stdio: 'inherit' lets the MCP protocol flow straight through this process.
// The URI goes in the environment, never argv, so it stays out of process lists.
// Nothing below may write to stdout — it belongs to the protocol.
log(`run: ${projectDir} : postgres-mcp --access-mode=${access}`);
const server = spawn(which("postgres-mcp"), [`--access-mode=${access}`], {
  cwd: projectDir,
  stdio: "inherit",
  env: { ...process.env, DATABASE_URI },
});

// When the session ends the client closes stdin and the server exits on EOF;
// signal forwarding is belt-and-braces (no-op-safe on Windows).
for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) {
  try {
    process.on(sig, () => server.kill(sig));
  } catch {}
}
server.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
server.on("error", (err) => {
  log(`run: spawn error ${err.message}`);
  process.exit(1);
});
