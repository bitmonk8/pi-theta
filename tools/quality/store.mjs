#!/usr/bin/env node
// Deterministic mechanics for the quality store (quality/). No judgment lives
// here — the quality-loop thetas own judgment (what is a finding, whether it is
// real, whether a fix is correct); this script owns file/state mechanics, so
// store invariants hold regardless of what any model does.
//
// Store layout (all version-controlled except quality/tmp/):
//   quality/surfaces.json   lens -> { include[], exclude[], ext[], shard_loc } over git-tracked files
//   quality/state.json      lens -> { "<repo path>": "<commit sha last reviewed at>" }
//   quality/intake/         candidate findings awaiting triage (one .md each)
//   quality/issues/         confirmed open issues (PTQ-NNNN-*.md)
//   quality/resolved/       terminally-statused issues (moved here by `resolve`)
//   quality/TRIAGE_LOG.md   append-only rejection ledger (re-file prevention)
//   quality/tmp/            transient shard/cluster manifests (gitignored)
//
// Subcommands (line-oriented stdout; repo-relative forward-slash paths):
//   lenses
//       Print every configured lens id, sorted, one per line - the loop's
//       start-up roster check.
//   needs-review --lens D2
//       Print every surface file needing review: absent from state, or changed
//       since its recorded sha (per-sha batched `git diff --name-only`).
//   shard --lens D2 --wave <id> [--target-loc 6000] [--max-files 15] [--max-shards N]
//       Partition the needs-review set path-contiguously, loc-balanced; write
//       quality/tmp/<wave>/<lens>/shard-NN.txt manifests; print manifest paths.
//       --target-loc absent or 0 resolves to the lens's own surfaces.json
//       shard_loc (falling back to 6000). --max-shards > 0 emits only that
//       many shards (the path-contiguous prefix); the rest stay unwritten and
//       due. --max-shards absent or 0 = unlimited.
//   mark-reviewed --lens D2 --sha <sha> --manifest <file>
//       Record every manifest path as reviewed at <sha>.
//   accept --finding <intake .md> [--note <text>]
//       Mint the next PTQ-NNNN, stamp frontmatter (id, verdict: confirmed,
//       status: open), move to quality/issues/; print the new path. --note
//       appends "verdict: confirmed — <text>" under ## Triage so a human
//       ruling (and its agreed fix direction) reaches the fix worker after
//       the stacked questionable notes.
//   reject --finding <intake .md> --verdict <v> [--reason <text>]
//       Append a TRIAGE_LOG row (reason defaults to the finding's ## Triage
//       note), delete the file.
//   clusters [--wave <id>] [--max <n>]
//       Group quality/issues/ by fix surface (first two DIRECTORY segments of
//       the first cited location's dirname); write
//       quality/tmp/clusters[-<wave>]/<key>.txt;
//       print "key<TAB>manifest<TAB>count" per cluster. With --max present
//       (bare flag = 12), a cluster larger than n is split into ordered parts
//       <key>__p1, <key>__p2, … so one oversized surface cannot swallow a whole
//       parallel fix wave. Parts are FILE-DISJOINT: issues citing a common file
//       always share a part (they run as parallel lanes and are cherry-picked
//       in order, so two parts editing one file would conflict at integration);
//       a file-connected component larger than n stays one oversized part.
//       Without --max the grouping is unsplit.
//   open-count
//       Print the number of status: open issues in quality/issues/ — the
//       quality loop's convergence signal (0 = backlog empty).
//   resolve --manifest <cluster manifest> --fixed <basename,basename,...>
//       Mark the named issues status: fixed and move them to quality/resolved/.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// QUALITY_STORE_ROOT is a store-mechanics test seam only (tests/quality-store.test.ts),
// deliberately NOT named PI_THETA_* - that prefix is the authenticated subagent
// control plane (subagent.md #subagent-control-plane-authentication) and a
// store-mechanics knob must not read as one. Production behaviour (var absent)
// is byte-identical to before.
const ROOT = process.env.QUALITY_STORE_ROOT
  ? path.resolve(process.env.QUALITY_STORE_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
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

/**
 * Group issue paths into connected components where two issues are connected
 * when they cite at least one common file. Components keep the input's issue
 * order (ordered by their first member), so the same backlog always splits the
 * same way across waves.
 */
function fileDisjointComponents(paths, citedFiles) {
  const parent = new Map(paths.map((p) => [p, p]));
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };
  const owner = new Map(); // file -> first issue citing it
  for (const p of paths) {
    for (const file of citedFiles.get(p) ?? []) {
      if (owner.has(file)) union(owner.get(file), p);
      else owner.set(file, p);
    }
  }
  const groups = new Map();
  for (const p of paths) {
    const root = find(p);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(p);
  }
  return [...groups.values()];
}

function appendTriageLine(text, line) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const body = text.endsWith(eol) ? text : text + eol;
  if (!/^## Triage\s*$/m.test(body)) return body + eol + "## Triage" + eol + line + eol;
  return body + line + eol;
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
  case "lenses": {
    // Configured lens ids, one per line - the loop's start-up roster check.
    for (const k of Object.keys(readJson(SURFACES)).sort()) process.stdout.write(k + "\n");
    break;
  }

  case "needs-review": {
    const lens = flags.lens ?? die("--lens required");
    for (const f of needsReview(lens)) process.stdout.write(f + "\n");
    break;
  }

  case "shard": {
    const lens = flags.lens ?? die("--lens required");
    const wave = flags.wave ?? die("--wave required");
    const s = surfaceFor(lens);
    const flagLoc = Number(flags["target-loc"] ?? 0);
    const targetLoc = flagLoc > 0 ? flagLoc : Number(s.shard_loc ?? 6000);
    const maxFiles = Number(flags["max-files"] ?? 15);
    const maxShards = Number(flags["max-shards"] ?? 0);
    if (!Number.isFinite(targetLoc) || targetLoc < 500) die("--target-loc must be a number >= 500, or 0 = the lens's surfaces.json shard_loc");
    if (!Number.isFinite(maxShards) || maxShards < 0) die("--max-shards must be a non-negative number (0 = unlimited)");
    const files = needsReview(lens).filter((f) => {
      if (fs.existsSync(path.join(ROOT, f))) return true;
      process.stderr.write(`store.mjs: skipping missing file ${f}\n`);
      return false;
    });
    if (files.length === 0) break;
    // Per-lens subdirectory: two lenses sharding into the same wave must not
    // overwrite each other's manifests before the par-for reads them.
    const outDir = path.join(TMP, wave, lens);
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
    // Files are pre-sorted (needsReview sorts) and packing is sequential, so an
    // un-emitted remainder is the path-contiguous TAIL: it lands in no
    // manifest, is never mark-reviewed, and stays due.
    const emit = maxShards > 0 ? shards.slice(0, maxShards) : shards;
    emit.forEach((shard, i) => {
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
    if (flags.note) text = appendTriageLine(text, `verdict: confirmed — ${flags.note}`);
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
    const citedFiles = new Map(); // issue path -> every file its locations cite
    for (const f of issues) {
      const { fields, locations } = readFrontmatter(path.join(ISSUES, f));
      if ((fields.status ?? "open") !== "open") continue;
      const first = locations[0] ?? "";
      const filePart = first.split(":")[0];
      const dir = posix(path.dirname(filePart));
      const segs = dir.split("/").filter((x) => x && x !== ".");
      const key = segs.length >= 2 ? `${segs[0]}/${segs[1]}` : segs[0] || "unclustered";
      if (!clusters.has(key)) clusters.set(key, []);
      const issuePath = posix(path.join("quality", "issues", f));
      clusters.get(key).push(issuePath);
      citedFiles.set(issuePath, new Set(locations.map((l) => posix(l.split(":")[0])).filter(Boolean)));
    }
    if (clusters.size === 0) break;
    // Absent --max keeps the historical unsplit grouping; a bare --max means 12.
    const maxPer = flags.max === undefined ? Infinity : flags.max === "true" ? 12 : Number(flags.max);
    if (!(maxPer > 0)) die("--max must be a positive number");
    const outDir = path.join(TMP, flags.wave ? `clusters-${flags.wave}` : "clusters");
    fs.mkdirSync(outDir, { recursive: true });
    for (const [key, paths] of [...clusters.entries()].sort()) {
      // Parts inherit the parent cluster's already-sorted issue order, so the
      // same backlog always splits the same way (stable across waves).
      const parts = [];
      if (paths.length <= maxPer) {
        parts.push([key, paths]);
      } else {
        // Parts run as PARALLEL worktree lanes and are cherry-picked in order,
        // so two parts must never edit the same file: issues that cite a
        // common file travel together (connected components over cited
        // paths), and components are packed first-fit into parts of at most
        // --max issues. A component larger than --max stays one oversized part
        // rather than being split into lanes that would conflict at
        // integration (wave qw20260912091742 lost a lane exactly that way).
        const components = fileDisjointComponents(paths, citedFiles);
        const packed = [];
        for (const comp of components) {
          const slot = packed.find((part) => part.length + comp.length <= maxPer);
          if (slot) slot.push(...comp);
          else packed.push([...comp]);
        }
        // One oversized component packs into a single part: it keeps the bare key.
        if (packed.length === 1) parts.push([key, packed[0]]);
        else packed.forEach((partPaths, i) => parts.push([`${key}__p${i + 1}`, partPaths]));
      }
      for (const [partKey, partPaths] of parts) {
        const p = path.join(outDir, `${partKey.replaceAll("/", "__")}.txt`);
        fs.writeFileSync(p, partPaths.join("\n") + "\n");
        process.stdout.write(`${partKey}\t${rel(p)}\t${partPaths.length}\n`);
      }
    }
    break;
  }

  case "open-count": {
    // Cheap convergence probe: no manifests written, no git calls — the loop
    // runs it every wave between triage and the fix phase.
    let open = 0;
    if (fs.existsSync(ISSUES)) {
      for (const f of fs.readdirSync(ISSUES).filter((x) => x.endsWith(".md"))) {
        const { fields } = readFrontmatter(path.join(ISSUES, f));
        if ((fields.status ?? "open") === "open") open++;
      }
    }
    process.stdout.write(`${open}\n`);
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
