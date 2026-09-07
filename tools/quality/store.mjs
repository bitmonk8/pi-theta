#!/usr/bin/env node
// Deterministic mechanics for the quality store (quality/). No judgment lives
// here — the quality-loop thetas own judgment (what is a finding, whether it is
// real, whether a fix is correct); this script owns file/state mechanics, so
// store invariants hold regardless of what any model does.
//
// Store layout (all version-controlled except quality/tmp/):
//   quality/surfaces.json   lens -> { include[], exclude[], ext[] } over git-tracked files
//   quality/state.json      lens -> { "<repo path>": "<commit sha last reviewed at>" }
//   quality/intake/         candidate findings awaiting triage (one .md each)
//   quality/issues/         confirmed open issues (PTQ-NNNN-*.md)
//   quality/resolved/       terminally-statused issues (moved here by `resolve`)
//   quality/TRIAGE_LOG.md   append-only rejection ledger (re-file prevention)
//   quality/tmp/            transient shard/cluster manifests (gitignored)
//
// Subcommands (line-oriented stdout; repo-relative forward-slash paths):
//   needs-review --lens D2
//       Print every surface file needing review: absent from state, or changed
//       since its recorded sha (per-sha batched `git diff --name-only`).
//   shard --lens D2 --wave <id> [--target-loc 6000] [--max-files 15]
//       Partition the needs-review set path-contiguously, loc-balanced; write
//       quality/tmp/<wave>/shard-NN.txt manifests; print manifest paths.
//   mark-reviewed --lens D2 --sha <sha> --manifest <file>
//       Record every manifest path as reviewed at <sha>.
//   accept --finding <intake .md>
//       Mint the next PTQ-NNNN, stamp frontmatter (id, verdict: confirmed,
//       status: open), move to quality/issues/; print the new path.
//   reject --finding <intake .md> --verdict <v> [--reason <text>]
//       Append a TRIAGE_LOG row (reason defaults to the finding's ## Triage
//       note), delete the file.
//   clusters [--wave <id>]
//       Group quality/issues/ by fix surface (first two path segments of the
//       first cited location); write quality/tmp/clusters[-<wave>]/<key>.txt;
//       print "key<TAB>manifest<TAB>count" per cluster.
//   resolve --manifest <cluster manifest> --fixed <basename,basename,...>
//       Mark the named issues status: fixed and move them to quality/resolved/.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const Q = path.join(ROOT, "quality");
const STATE = path.join(Q, "state.json");
const SURFACES = path.join(Q, "surfaces.json");
const TRIAGE_LOG = path.join(Q, "TRIAGE_LOG.md");
const INTAKE = path.join(Q, "intake");
const ISSUES = path.join(Q, "issues");
const RESOLVED = path.join(Q, "resolved");
const TMP = path.join(Q, "tmp");

function die(msg) {
  process.stderr.write(`store.mjs: ${msg}\n`);
  process.exit(1);
}

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, sortedReplacer, 2) + "\n");
}

// Stable key order keeps state.json diffs reviewable.
function sortedReplacer(_key, value) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  }
  return value;
}

function posix(p) {
  return p.replaceAll("\\", "/");
}

function rel(p) {
  return posix(path.relative(ROOT, p));
}

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "true";
      }
    }
  }
  return flags;
}

function surfaceFor(lens) {
  const surfaces = readJson(SURFACES);
  const s = surfaces[lens];
  if (!s) die(`unknown lens '${lens}' — not in quality/surfaces.json`);
  return s;
}

/** Git-tracked files matching the lens surface (include prefixes, exclude prefixes, extensions). */
function surfaceFiles(lens) {
  const s = surfaceFor(lens);
  const tracked = git(["ls-files", "-z"]).split("\0").filter((p) => p.length > 0);
  return tracked
    .filter((p) => s.include.some((pre) => p.startsWith(pre)))
    .filter((p) => !(s.exclude ?? []).some((pre) => p.startsWith(pre)))
    .filter((p) => (s.ext ?? []).length === 0 || s.ext.some((e) => p.endsWith(e)))
    .sort();
}

function loadState() {
  return fs.existsSync(STATE) ? readJson(STATE) : {};
}

/** Files needing review: never reviewed, or changed since their recorded sha. */
function needsReview(lens) {
  const files = surfaceFiles(lens);
  const lensState = loadState()[lens] ?? {};
  const bySha = new Map(); // sha -> paths reviewed at that sha
  const need = new Set();
  for (const f of files) {
    const sha = lensState[f];
    if (!sha) {
      need.add(f);
    } else {
      if (!bySha.has(sha)) bySha.set(sha, []);
      bySha.get(sha).push(f);
    }
  }
  for (const [sha, paths] of bySha) {
    for (let i = 0; i < paths.length; i += 100) {
      const batch = paths.slice(i, i + 100);
      try {
        const changed = git(["diff", "--name-only", sha, "HEAD", "--", ...batch]);
        for (const c of changed.split("\n").map((l) => l.trim()).filter(Boolean)) need.add(c);
      } catch {
        // Unknown/unreachable sha (rewritten history): everything recorded at it is due.
        for (const p of batch) need.add(p);
      }
    }
  }
  return [...need].sort();
}

function countLines(file) {
  const text = fs.readFileSync(file, "utf8");
  if (text.length === 0) return 0;
  let n = 0;
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") n++;
  return text.endsWith("\n") ? n : n + 1;
}

// ---------------------------------------------------------------- frontmatter

/** Naive single-level frontmatter reader for the fields this store owns. */
function readFrontmatter(file) {
  const text = fs.readFileSync(file, "utf8");
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return { text, fields: {}, locations: [] };
  const fields = {};
  const locations = [];
  let inLocations = false;
  for (const line of m[1].split("\n")) {
    const loc = line.match(/^\s+-\s+(.+?)\s*$/);
    if (inLocations && loc) {
      locations.push(loc[1]);
      continue;
    }
    inLocations = false;
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*?)\s*$/);
    if (kv) {
      fields[kv[1]] = kv[2];
      if (kv[1] === "locations") inLocations = true;
    }
  }
  return { text, fields, locations };
}

function setFrontmatterField(text, key, value) {
  const re = new RegExp(`^(${key}:).*$`, "m");
  if (re.test(text)) return text.replace(re, `$1 ${value}`);
  // Field missing: insert before the closing delimiter.
  return text.replace(/\r?\n---/, `\n${key}: ${value}\n---`);
}

function nextIssueId() {
  let max = 0;
  const scan = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir)) {
      const m = f.match(/^PTQ-(\d+)/);
      if (m) max = Math.max(max, Number(m[1]));
    }
  };
  scan(ISSUES);
  scan(RESOLVED);
  if (fs.existsSync(TRIAGE_LOG)) {
    for (const m of fs.readFileSync(TRIAGE_LOG, "utf8").matchAll(/PTQ-(\d+)/g)) {
      max = Math.max(max, Number(m[1]));
    }
  }
  return `PTQ-${String(max + 1).padStart(4, "0")}`;
}

/** The one-line triage note appended by the triage worker into ## Triage. */
function triageNote(file) {
  const text = fs.readFileSync(file, "utf8");
  const m = text.match(/^## Triage\s*$([\s\S]*)/m);
  if (!m) return "";
  const lines = m[1].split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("<"));
  return lines.length > 0 ? lines[lines.length - 1] : "";
}

function logRow(cols) {
  const esc = (s) => String(s).replaceAll("|", "\\|").replaceAll(/\r?\n/g, " ").trim();
  fs.appendFileSync(TRIAGE_LOG, `| ${cols.map(esc).join(" | ")} |\n`);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- subcommands

const [, , cmd, ...rest] = process.argv;
const flags = parseFlags(rest);

switch (cmd) {
  case "needs-review": {
    const lens = flags.lens ?? die("--lens required");
    for (const f of needsReview(lens)) process.stdout.write(f + "\n");
    break;
  }

  case "shard": {
    const lens = flags.lens ?? die("--lens required");
    const wave = flags.wave ?? die("--wave required");
    const targetLoc = Number(flags["target-loc"] ?? 6000);
    const maxFiles = Number(flags["max-files"] ?? 15);
    if (!Number.isFinite(targetLoc) || targetLoc < 500) die("--target-loc must be a number >= 500");
    const files = needsReview(lens).filter((f) => {
      if (fs.existsSync(path.join(ROOT, f))) return true;
      process.stderr.write(`store.mjs: skipping missing file ${f}\n`);
      return false;
    });
    if (files.length === 0) break;
    const outDir = path.join(TMP, wave);
    fs.mkdirSync(outDir, { recursive: true });
    const shards = [];
    let current = [];
    let loc = 0;
    for (const f of files) {
      const n = countLines(path.join(ROOT, f));
      if (current.length > 0 && (loc + n > targetLoc || current.length >= maxFiles)) {
        shards.push(current);
        current = [];
        loc = 0;
      }
      current.push(f);
      loc += n;
    }
    if (current.length > 0) shards.push(current);
    shards.forEach((shard, i) => {
      const p = path.join(outDir, `shard-${String(i + 1).padStart(2, "0")}.txt`);
      fs.writeFileSync(p, shard.join("\n") + "\n");
      process.stdout.write(rel(p) + "\n");
    });
    break;
  }

  case "mark-reviewed": {
    const lens = flags.lens ?? die("--lens required");
    const sha = flags.sha ?? die("--sha required");
    const manifest = flags.manifest ?? die("--manifest required");
    const state = loadState();
    state[lens] = state[lens] ?? {};
    const listed = fs.readFileSync(path.join(ROOT, manifest), "utf8")
      .split("\n").map((l) => l.trim()).filter(Boolean);
    for (const f of listed) state[lens][f] = sha;
    writeJson(STATE, state);
    process.stdout.write(`marked ${listed.length} file(s) reviewed by ${lens} at ${sha.slice(0, 12)}\n`);
    break;
  }

  case "accept": {
    const finding = flags.finding ?? die("--finding required");
    const src = path.join(ROOT, finding);
    if (!fs.existsSync(src)) die(`no such finding: ${finding}`);
    const id = nextIssueId();
    let text = fs.readFileSync(src, "utf8");
    text = setFrontmatterField(text, "id", id);
    text = setFrontmatterField(text, "verdict", "confirmed");
    text = setFrontmatterField(text, "status", "open");
    // Slug: strip the wave-lens-NN- prefix the reviewer used, keep the tail.
    const base = path.basename(finding, ".md");
    const slug = (base.replace(/^[a-z0-9]+-[a-z0-9]+-\d+-/, "") || base).slice(0, 60);
    fs.mkdirSync(ISSUES, { recursive: true });
    const dest = path.join(ISSUES, `${id}-${slug}.md`);
    fs.writeFileSync(dest, text);
    fs.unlinkSync(src);
    process.stdout.write(rel(dest) + "\n");
    break;
  }

  case "reject": {
    const finding = flags.finding ?? die("--finding required");
    const verdict = flags.verdict ?? die("--verdict required");
    const src = path.join(ROOT, finding);
    if (!fs.existsSync(src)) die(`no such finding: ${finding}`);
    const reason = flags.reason ?? triageNote(src) ?? "";
    logRow([today(), path.basename(finding), verdict, reason || "(no triage note recorded)"]);
    fs.unlinkSync(src);
    process.stdout.write(`rejected ${path.basename(finding)} (${verdict})\n`);
    break;
  }

  case "clusters": {
    if (!fs.existsSync(ISSUES)) break;
    const issues = fs.readdirSync(ISSUES).filter((f) => f.endsWith(".md")).sort();
    const clusters = new Map(); // key -> issue paths
    for (const f of issues) {
      const { fields, locations } = readFrontmatter(path.join(ISSUES, f));
      if ((fields.status ?? "open") !== "open") continue;
      const first = locations[0] ?? "";
      const filePart = first.split(":")[0];
      const segs = filePart.split("/").filter(Boolean);
      const key = segs.length >= 2 ? `${segs[0]}/${segs[1]}` : segs[0] || "unclustered";
      if (!clusters.has(key)) clusters.set(key, []);
      clusters.get(key).push(posix(path.join("quality", "issues", f)));
    }
    if (clusters.size === 0) break;
    const outDir = path.join(TMP, flags.wave ? `clusters-${flags.wave}` : "clusters");
    fs.mkdirSync(outDir, { recursive: true });
    for (const [key, paths] of [...clusters.entries()].sort()) {
      const p = path.join(outDir, `${key.replaceAll("/", "__")}.txt`);
      fs.writeFileSync(p, paths.join("\n") + "\n");
      process.stdout.write(`${key}\t${rel(p)}\t${paths.length}\n`);
    }
    break;
  }

  case "resolve": {
    const manifest = flags.manifest ?? die("--manifest required");
    const fixed = (flags.fixed ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (fixed.length === 0) die("--fixed requires at least one issue basename");
    const listed = fs.readFileSync(path.join(ROOT, manifest), "utf8")
      .split("\n").map((l) => l.trim()).filter(Boolean);
    fs.mkdirSync(RESOLVED, { recursive: true });
    for (const name of fixed) {
      const entry = listed.find((p) => path.basename(p) === name || path.basename(p, ".md") === name);
      if (!entry) {
        process.stderr.write(`store.mjs: '${name}' is not in ${manifest}; skipped\n`);
        continue;
      }
      const src = path.join(ROOT, entry);
      if (!fs.existsSync(src)) {
        process.stderr.write(`store.mjs: ${entry} missing on disk; skipped\n`);
        continue;
      }
      let text = fs.readFileSync(src, "utf8");
      text = setFrontmatterField(text, "status", "fixed");
      const dest = path.join(RESOLVED, path.basename(entry));
      fs.writeFileSync(dest, text);
      fs.unlinkSync(src);
      process.stdout.write(rel(dest) + "\n");
    }
    break;
  }

  default:
    die(`unknown subcommand '${cmd ?? "(none)"}' — see header comment for usage`);
}
