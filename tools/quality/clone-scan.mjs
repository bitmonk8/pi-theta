#!/usr/bin/env node
// Mechanical clone-group pre-scan for the D4 lens (quality-loop-d4-d8-
// design.md §1.5). WHY: D4's clone/drift recall must not depend on a model
// re-reading 93k LOC of src/ hunting copy-paste by eye — a token-normalised
// scanner finds every exact and renamed-only copy mechanically, and drift
// (two copies that were once identical and have since diverged) shows up as
// two adjacent groups the map cross-references, never as a guess. ESM, DI
// over ROOT exactly like store.mjs / size-scan.mjs (QUALITY_STORE_ROOT); no
// deps beyond `typescript` (already a repo dependency) and node:fs/path/url.
// Reuses size-scan.mjs's src/**/*.ts walker (listTsFiles) instead of a
// second copy of the same directory-walking logic.
//
// Module API (imported by tests; store.mjs does not need this module):
//   cloneGroups(root, { minTokens }) -> { groups, driftHints }
//     groups: [{ id, tokenCount, verdict, occurrences: [{path, line, endLine}] }]
//       sorted by (token count desc, first occurrence path, first occurrence
//       line); occurrences within a group sorted by (path, line); ids
//       "G001…" assigned in that (sorted) order. verdict is "identical" or
//       "renamed-only (N)" (N = token positions where some occurrence's raw
//       text differs from the first occurrence's — only $id/$lit positions
//       can differ, since every other norm equals its own raw text).
//     driftHints: string[] — one line per pair of two-occurrence groups that
//       share the same ordered file pair with a ≤5-line gap on BOTH sides
//       (design's "one copy with a divergence" case); each line quotes the
//       gap lines raw (JSON-stringified, so the quoting is unambiguous).
//
// CLI (line-oriented markdown; repo-relative forward-slash paths):
//   map --files <manifest> [--min-tokens N]
//       One section per file listed in <manifest>: every clone group with an
//       occurrence in that file (ALL of its occurrences, including partners
//       outside the shard), token count, spans, verdict; "(no clone groups)"
//       when none. Drift hints affecting the file's groups are listed after
//       its sections. Deterministic: byte-identical across runs.
//   groups [--min-tokens N]
//       The whole-repo group list plus a "drift hints:" section.
//
// Token stream (design §1.5): every src/**/*.ts file (not .d.ts; type-only
// code IS tokenised and scanned — nothing here is "generated") via
// ts.createScanner with skipTrivia=true (comments and whitespace are trivia,
// never tokens). Each token is { norm, raw, line }: norm is "$id" for an
// identifier, "$lit" for a string/numeric/bigint/template/regex literal, and
// the token's own text for every keyword and punctuation mark (so keyword/
// punctuation positions can never differ between occurrences of one group —
// only $id/$lit positions can, which is what makes the renamed-only count
// well-defined). Streams are per file: a group can never span a file
// boundary, by construction (window generation stays inside one file's array).
//
// Groups (design §1.5): MIN_TOKENS = 60 tokens; every window of MIN_TOKENS
// consecutive norm tokens in a file is hashed (a rolling polynomial hash);
// tokens hashing alike are grouped and re-verified by exact norm-sequence
// equality (defeats the rare hash collision — the emitted grouping is never
// hash-only). Each verified seed set is then extended BOTH backward and
// forward, one token at a time, for as long as every member's next/previous
// token still agrees — this canonicalises every seed that starts partway
// through a longer copy to the same maximal (positions, length) tuple, so
// seeds at different offsets inside one true clone collapse to ONE emitted
// group (the "maximal run per occurrence set" / "not emitted inside a longer
// run's spans" rules) while a shorter run shared by a LARGER occurrence set
// (three files agreeing on 60 of a 100-token two-file run) is a distinct
// group with its own (smaller-length, larger-occurrence-set) canonical form.
// Two occurrences of one canonical group inside the SAME file whose spans
// overlap (periodic code) collapse to the earlier occurrence; if that leaves
// fewer than 2 occurrences the group is not emitted at all.

import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { listTsFiles } from "./size-scan.mjs";

const ROOT = process.env.QUALITY_STORE_ROOT
  ? path.resolve(process.env.QUALITY_STORE_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const MIN_TOKENS = 60;

function posixRel(root, abs) {
  return path.relative(root, abs).split(path.sep).join("/");
}

// ---------------------------------------------------------------- tokenizing

const LITERAL_KINDS = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NumericLiteral,
  ts.SyntaxKind.BigIntLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.RegularExpressionLiteral,
]);

function normOf(kind, raw) {
  if (kind === ts.SyntaxKind.Identifier) return "$id";
  if (LITERAL_KINDS.has(kind)) return "$lit";
  return raw;
}

/** { norm, raw, line }[] for one file's real tokens (trivia/comments skipped). */
function tokenizeFile(relPath, text) {
  // A throwaway source file purely for line lookups (public API,
  // getLineAndCharacterOfPosition), independent of the scanner below.
  const sf = ts.createSourceFile(relPath, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, /* skipTrivia */ true, ts.LanguageVariant.Standard, text);
  const tokens = [];
  let kind = scanner.scan();
  while (kind !== ts.SyntaxKind.EndOfFileToken) {
    const pos = scanner.getTokenPos();
    const raw = scanner.getTokenText();
    tokens.push({ norm: normOf(kind, raw), raw, line: sf.getLineAndCharacterOfPosition(pos).line + 1 });
    kind = scanner.scan();
  }
  return tokens;
}

// ---------------------------------------------------------------- rolling hash

const HASH_BASE = 1000003n;
const HASH_MOD = (1n << 61n) - 1n; // a Mersenne prime: cheap mod, low collision rate

/** hashes[i] = polynomial hash of ids[i .. i+windowSize-1]; [] if too short. */
function rollingHashes(ids, windowSize) {
  const n = ids.length;
  if (n < windowSize) return [];
  let basePow = 1n;
  for (let i = 0; i < windowSize - 1; i++) basePow = (basePow * HASH_BASE) % HASH_MOD;
  let h = 0n;
  for (let i = 0; i < windowSize; i++) h = (h * HASH_BASE + BigInt(ids[i])) % HASH_MOD;
  const hashes = [h];
  for (let i = windowSize; i < n; i++) {
    h = (((h - BigInt(ids[i - windowSize]) * basePow % HASH_MOD + HASH_MOD) % HASH_MOD) * HASH_BASE + BigInt(ids[i])) % HASH_MOD;
    hashes.push(h);
  }
  return hashes;
}

// ---------------------------------------------------------------- grouping

/**
 * Every window of `minTokens` consecutive tokens sharing a hash is grouped,
 * re-verified by exact norm equality, canonicalised (extended both ways to
 * its true maximal span), deduped, and same-file-overlap-collapsed. Returns
 * `{ groups, driftHints }` — see the header comment for the shapes.
 */
export function cloneGroups(root, opts = {}) {
  const minTokens = opts.minTokens && opts.minTokens > 0 ? opts.minTokens : MIN_TOKENS;

  const files = listTsFiles(root, "src", [".ts"]);
  const fileTokens = new Map(); // relPath -> tokens[]
  const fileText = new Map(); // relPath -> raw source text (for drift-hint gap quoting)
  for (const abs of files) {
    const relPath = posixRel(root, abs);
    const text = fs.readFileSync(abs, "utf8");
    fileText.set(relPath, text);
    fileTokens.set(relPath, tokenizeFile(relPath, text));
  }

  // Global norm -> integer id, so the rolling hash and equality checks work
  // over small integers instead of re-comparing strings every time.
  const normIds = new Map();
  let nextNormId = 1;
  function idFor(norm) {
    let id = normIds.get(norm);
    if (id === undefined) {
      id = nextNormId++;
      normIds.set(norm, id);
    }
    return id;
  }
  const fileIds = new Map(); // relPath -> Int32-ish number[] paralleling fileTokens
  for (const [relPath, toks] of fileTokens) fileIds.set(relPath, toks.map((t) => idFor(t.norm)));

  function windowEqual(a, b) {
    const idsA = fileIds.get(a.file);
    const idsB = fileIds.get(b.file);
    for (let i = 0; i < minTokens; i++) if (idsA[a.start + i] !== idsB[b.start + i]) return false;
    return true;
  }

  // Bucket every window by hash (insertion order = deterministic file order,
  // then ascending start), then split each bucket into exact-equal cliques —
  // the hash-only bucket is never trusted as the final grouping.
  const buckets = new Map(); // hash string -> {file, start}[]
  for (const relPath of [...fileIds.keys()].sort()) {
    const ids = fileIds.get(relPath);
    const hashes = rollingHashes(ids, minTokens);
    for (let start = 0; start < hashes.length; start++) {
      const key = hashes[start].toString(36);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push({ file: relPath, start });
    }
  }
  const anchorSets = [];
  for (const entries of buckets.values()) {
    const used = new Array(entries.length).fill(false);
    for (let i = 0; i < entries.length; i++) {
      if (used[i]) continue;
      const clique = [entries[i]];
      used[i] = true;
      for (let j = i + 1; j < entries.length; j++) {
        if (!used[j] && windowEqual(entries[i], entries[j])) {
          clique.push(entries[j]);
          used[j] = true;
        }
      }
      if (clique.length >= 2) anchorSets.push(clique);
    }
  }

  // Canonicalise: extend backward and forward while EVERY member agrees.
  function canonicalize(anchor) {
    const starts = anchor.map((a) => ({ file: a.file, start: a.start }));
    let length = minTokens;
    while (starts.every((s) => s.start - 1 >= 0)) {
      const prev = starts.map((s) => fileIds.get(s.file)[s.start - 1]);
      if (!prev.every((v) => v === prev[0])) break;
      for (const s of starts) s.start -= 1;
      length += 1;
    }
    while (starts.every((s) => s.start + length < fileIds.get(s.file).length)) {
      const next = starts.map((s) => fileIds.get(s.file)[s.start + length]);
      if (!next.every((v) => v === next[0])) break;
      length += 1;
    }
    return { starts, length };
  }
  const canonicalByKey = new Map(); // dedup key -> {starts, length}
  for (const anchor of anchorSets) {
    const canon = canonicalize(anchor);
    const key = canon.starts.map((s) => `${s.file}:${s.start}`).sort().join("|") + `#${canon.length}`;
    if (!canonicalByKey.has(key)) canonicalByKey.set(key, canon);
  }

  // Same-file overlap collapse: within one file, overlapping occurrences of
  // ONE canonical group collapse to the earliest; a group left with <2
  // occurrences afterward is not emitted.
  function collapseOverlaps(canon) {
    const byFile = new Map();
    for (const s of canon.starts) {
      if (!byFile.has(s.file)) byFile.set(s.file, []);
      byFile.get(s.file).push(s.start);
    }
    const kept = [];
    for (const [file, starts] of byFile) {
      const sorted = [...starts].sort((a, b) => a - b);
      let lastEnd = -Infinity;
      for (const st of sorted) {
        if (st < lastEnd) continue; // overlapped by an earlier kept occurrence
        kept.push({ file, start: st });
        lastEnd = st + canon.length;
      }
    }
    return kept;
  }

  const groups = [];
  for (const canon of canonicalByKey.values()) {
    const kept = collapseOverlaps(canon);
    if (kept.length < 2) continue;
    const occurrences = kept
      .map((k) => {
        const toks = fileTokens.get(k.file);
        return {
          path: k.file,
          startTok: k.start,
          line: toks[k.start].line,
          endLine: toks[k.start + canon.length - 1].line,
          tokens: toks.slice(k.start, k.start + canon.length),
        };
      })
      .sort((a, b) => (a.path === b.path ? a.line - b.line : a.path < b.path ? -1 : 1));
    const first = occurrences[0];
    let diffCount = 0;
    for (let i = 0; i < canon.length; i++) {
      const r0 = first.tokens[i].raw;
      if (occurrences.slice(1).some((o) => o.tokens[i].raw !== r0)) diffCount++;
    }
    const verdict = diffCount === 0 ? "identical" : `renamed-only (${diffCount})`;
    groups.push({ tokenCount: canon.length, verdict, occurrences });
  }

  groups.sort((a, b) => {
    if (b.tokenCount !== a.tokenCount) return b.tokenCount - a.tokenCount;
    const fa = a.occurrences[0];
    const fb = b.occurrences[0];
    if (fa.path !== fb.path) return fa.path < fb.path ? -1 : 1;
    return fa.line - fb.line;
  });
  groups.forEach((g, i) => {
    g.id = `G${String(i + 1).padStart(3, "0")}`;
  });

  const driftHints = computeDriftHints(groups, fileText);

  // Public shape: drop the raw token arrays (internal-only, used for the
  // verdict/drift computation above).
  const publicGroups = groups.map((g) => ({
    id: g.id,
    tokenCount: g.tokenCount,
    verdict: g.verdict,
    occurrences: g.occurrences.map((o) => ({ path: o.path, line: o.line, endLine: o.endLine })),
  }));
  return { groups: publicGroups, driftHints };
}

// ---------------------------------------------------------------- drift hints

/**
 * Two groups are a drift pair when both have exactly 2 occurrences, on the
 * exact same ordered pair of files, with a ≤5-line gap on BOTH sides (design
 * §1.5: "a divergence breaks normalised equality, so drift shows up as two
 * groups"). The hint quotes the gap lines raw (JSON-stringified) so a triager
 * can see exactly what changed without re-opening both files.
 */
function computeDriftHints(groups, fileText) {
  function singleOccurrencePerFile(g) {
    if (g.occurrences.length !== 2) return null;
    const [a, b] = g.occurrences;
    if (a.path === b.path) return null;
    return new Map([[a.path, a], [b.path, b]]);
  }
  function gapOf(file, earlier, later) {
    const start = earlier.endLine + 1;
    const end = later.line - 1;
    if (end < start - 1) return null; // spans overlap: not a clean gap
    const lines = fileText.get(file).split(/\r?\n/).slice(start - 1, end);
    return { start, end, count: end - start + 1, lines };
  }

  const hints = [];
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const g1 = groups[i];
      const g2 = groups[j];
      const f1 = singleOccurrencePerFile(g1);
      const f2 = singleOccurrencePerFile(g2);
      if (!f1 || !f2) continue;
      const files1 = [...f1.keys()].sort();
      const files2 = [...f2.keys()].sort();
      if (files1[0] !== files2[0] || files1[1] !== files2[1]) continue;
      const [fileA, fileB] = files1;
      const oa1 = f1.get(fileA);
      const ob1 = f1.get(fileB);
      const oa2 = f2.get(fileA);
      const ob2 = f2.get(fileB);
      const g1FirstInA = oa1.line < oa2.line;
      const g1FirstInB = ob1.line < ob2.line;
      if (g1FirstInA !== g1FirstInB) continue; // inconsistent order: not one divergent copy
      const [earlyA, lateA] = g1FirstInA ? [oa1, oa2] : [oa2, oa1];
      const [earlyB, lateB] = g1FirstInB ? [ob1, ob2] : [ob2, ob1];
      const gapA = gapOf(fileA, earlyA, lateA);
      const gapB = gapOf(fileB, earlyB, lateB);
      if (!gapA || !gapB || gapA.count > 5 || gapB.count > 5) continue;
      const earlyId = g1FirstInA ? g1.id : g2.id;
      const lateId = g1FirstInA ? g2.id : g1.id;
      hints.push(
        `drift hint: ${earlyId} + ${lateId} are one copy with a divergence at ` +
          `${fileA}:${gapA.start}-${gapA.end} / ${fileB}:${gapB.start}-${gapB.end} — ` +
          `gap: ${JSON.stringify(gapA.lines)} / ${JSON.stringify(gapB.lines)}`,
      );
    }
  }
  return hints;
}

// ---------------------------------------------------------------- CLI

function die(msg) {
  process.stderr.write(`clone-scan.mjs: ${msg}\n`);
  process.exit(1);
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

function groupLine(g) {
  const spans = g.occurrences.map((o) => `${o.path}:${o.line}-${o.endLine}`).join(", ");
  return `- ${g.id} — ${g.tokenCount} tokens — ${g.verdict} — ${spans}`;
}

function renderGroups(result) {
  const lines = ["clone groups:", ""];
  if (result.groups.length === 0) lines.push("(no clone groups)");
  else for (const g of result.groups) lines.push(groupLine(g));
  lines.push("", "drift hints:");
  if (result.driftHints.length === 0) lines.push("(none)");
  else for (const h of result.driftHints) lines.push(`- ${h}`);
  return lines.join("\n") + "\n";
}

function renderMap(result, relFiles) {
  const sections = relFiles.map((relPath) => {
    const relevant = result.groups.filter((g) => g.occurrences.some((o) => o.path === relPath));
    const lines = [`## ${relPath}`, ""];
    if (relevant.length === 0) {
      lines.push("(no clone groups)");
    } else {
      for (const g of relevant) lines.push(groupLine(g));
      const relevantIds = new Set(relevant.map((g) => g.id));
      const hints = result.driftHints.filter((h) => [...relevantIds].some((id) => h.startsWith(`drift hint: ${id} `) || h.includes(`+ ${id} `)));
      for (const h of hints) lines.push(`- ${h}`);
    }
    return lines.join("\n");
  });
  return sections.join("\n\n") + "\n";
}

function main() {
  const [, , cmd, ...rest] = process.argv;
  const flags = parseFlags(rest);
  try {
    const minTokens = flags["min-tokens"] !== undefined ? Number(flags["min-tokens"]) : MIN_TOKENS;
    if (!Number.isFinite(minTokens) || minTokens < 1) die("--min-tokens must be a positive number");
    switch (cmd) {
      case "map": {
        const manifest = flags.files ?? die("--files required");
        const relFiles = fs
          .readFileSync(path.resolve(ROOT, manifest), "utf8")
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        const result = cloneGroups(ROOT, { minTokens });
        process.stdout.write(renderMap(result, relFiles));
        break;
      }
      case "groups": {
        const result = cloneGroups(ROOT, { minTokens });
        process.stdout.write(renderGroups(result));
        break;
      }
      default:
        die(`unknown subcommand '${cmd ?? "(none)"}' — see header comment for usage (map | groups)`);
    }
  } catch (err) {
    die(err instanceof Error ? err.message : String(err));
  }
}

// Only run the CLI when this file is the process entrypoint (tests import
// cloneGroups/MIN_TOKENS directly via a file:// URL).
const isMain = (() => {
  try {
    return import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
  } catch {
    return false;
  }
})();
if (isMain) main();
