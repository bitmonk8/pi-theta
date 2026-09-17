---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: assembleSubagentArgv's --theta PATH_DELIMITER join and readThetaFlagPaths's split are independently maintained halves of one wire format with no shared implementation
lens: D4                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/subagent-launcher.ts:466-481
  - src/extension/production-discovered-theta.ts:143-180
sites: 2                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: parallel           # D4 only: clone | drift | parallel
wave: qw20260916144930
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-16
---

# assembleSubagentArgv's --theta PATH_DELIMITER join and readThetaFlagPaths's split are independently maintained halves of one wire format with no shared implementation

## Observation
`assembleSubagentArgv` (src/runtime/subagent-launcher.ts) builds a spawned subagent child's argv; when the parent's active discovery roots are non-empty it emits ONE `--theta` flag whose value is every root joined with `path.delimiter`. `readThetaFlagPaths` (src/extension/production-discovered-theta.ts, in this shard) is the child-side reader: it calls `pi.getFlag("theta")` and splits the returned value on the same `path.delimiter`, trims, drops empties, and dedupes, producing the CLI discovery-source roots the child's own `runComposePass` then walks. The two functions live in different directories (`src/runtime/` and `src/extension/`) with no shared encode/decode helper between them; each independently imports `delimiter as PATH_DELIMITER` from `node:path` and applies it in its own direction (`.join` on the encode side, `.split` on the decode side).

## Evidence
The encoder — src/runtime/subagent-launcher.ts:466-481:
```ts
  // ONE `--theta` flag carrying every discovery root joined with
  // `path.delimiter`, so the child re-discovers the callee `.theta` and its
  // `.thetalib` imports (the child owns the interpreter under RFC 0006). Never
  // one flag per root (bug 0008): host pi's argv parser stores extension flags
  // in an unknownFlags Map (dist/cli/args.js) — a repeated string flag resolves
  // to its LAST occurrence, and `pi.getFlag` is `boolean | string | undefined`
  // — so repeated `--theta` silently drops every root but the last in the
  // child. The joined single flag is the documented discovery CLI-source
  // convention (discovery-sources.md) and the form the child-side
  // `readThetaFlagPaths` already splits. An empty root set OMITS the flag —
  // omission is the documented no-CLI-source form, while `--theta ""` is an
  // undocumented argv shape that would merely rely on the reader dropping
  // empty split components.
  if (input.thetaDirs.length > 0) {
    argv.push("--theta", input.thetaDirs.join(PATH_DELIMITER));
  }
```
`thetaDirs` is fed the parent's own discovery-root union at the sole call site, `src/extension/production-theta-producer.ts:2672`: `thetaDirs: this.#input.activeRoots ?? []` — the same `activeRoots` `runComposePass` (production-composition.ts) computes from the parent's discovery walk.

The decoder — src/extension/production-discovered-theta.ts:161-175 (its own doc comment, 143-160, omitted here for length, states the identical contract: "Multi-root carriage is the single `path.delimiter`-joined value... each occurrence is split on the platform PATH_DELIMITER, trimmed, empties dropped, and the de-duplicated union returned"):
```ts
export function readThetaFlagPaths(pi: ExtensionAPI): readonly string[] {
  const raw: unknown = pi.getFlag("theta");
  const occurrences: string[] = Array.isArray(raw)
    ? raw.filter((entry): entry is string => typeof entry === "string")
    : typeof raw === "string"
      ? [raw]
      : [];
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const occurrence of occurrences) {
    for (const entry of occurrence.split(PATH_DELIMITER)) {
      const trimmed = entry.trim();
      if (trimmed.length > 0 && !seen.has(trimmed)) {
        seen.add(trimmed);
        paths.push(trimmed);
```

Diff verdict: not clone-shaped — a `.join` call versus a `.split`+trim+dedupe loop share no similar source text — but each side names the other in comments: the encoder's own comment states "the form the child-side `readThetaFlagPaths` already splits," and the decoder's own comment states the joined form is "the discovery CLI-source convention; the bug-0008 launcher fix emits exactly that form." Both sides describe ONE wire format from opposite ends. No clone-map group id: the map found no groups for either file's occurrence — a textual scanner cannot pair a `.join` with a `.split`+loop by construction.

## Why this is a problem
This is a wire encoder and its decoder across the RFC-0006 parent/child process boundary, not incidental similarity. If the join side and the split side ever disagree — a different delimiter, or escaping/quoting added to only one side to handle a root path that itself contains the platform delimiter character (a `:`-bearing directory name on POSIX, a `;`-bearing one on Windows) — the child recovers the WRONG discovery roots from a correct parent-side flag, silently: no exception, no diagnostic, just a garbled or truncated root set fed into the child's own discovery walk. The child could then fail to discover the very `.theta` (or `.thetalib` import) it was launched to run, or walk directories the parent never intended. Both functions currently agree — each hand-documents the identical contract independently ("joined... `path.delimiter`... never one flag per root" on the encode side; "the platform PATH_DELIMITER, trimmed, empties dropped, and the de-duplicated union" on the decode side) — but nothing beyond the comments enforces that a future edit to one side is mirrored in the other.

## Suggested direction (non-binding, optional)
Shared source of truth (hypothesis): a small paired pair of exported functions (e.g. `encodeThetaDirsFlag` / `decodeThetaDirsFlag`) capturing the join, and the split-trim-dedupe, contract once, imported by `assembleSubagentArgv` and `readThetaFlagPaths` respectively, so the delimiter and the empty/dedupe rules exist in exactly one place. No claim is made about which module (`runtime/` or `extension/`) should own it.

## False-positive check
Re-read both functions verbatim at the cited lines immediately before filing. Confirmed the value crosses a real process boundary: `production-theta-producer.ts:2672` feeds `this.#input.activeRoots` into `assembleSubagentArgv`'s `thetaDirs`, and `readThetaFlagPaths`'s sole production call site is inside `runComposePass` (`production-composition.ts`: `const cliPaths = readThetaFlagPaths(pi);`), which runs in the SPAWNED child process under RFC-0006 (the child "owns the interpreter" per subagent-launcher.ts's own comment). Grepped `PATH_DELIMITER|delimiter as` across `src/`: exactly these two production functions import and apply it (plus the one already-cited encode call site at line 480); no third copy exists. Checked the already-filed/rejected lists for "theta flag", "PATH_DELIMITER", "thetaDirs", "readThetaFlagPaths": no match; the closest-named prior finding, PTQ-0032 ("minimal-theta-mode-discarded"), concerns an unrelated `.theta` field. Not tests/, not generated. Not a spec-repeated normative vector table: discovery-sources.md's CLI-source convention is the spec CLAUSE both sides implement, cited once by each side's comment — the duplication is between the two CODE implementations of that clause, not between the spec and the code.

## Triage
<!-- triage appends: verdict + one-line reason. Nothing above this line is edited. -->
verdict: questionable — accounting verified: excerpts byte-match the cited ranges, grep confirms these are the only two production sites importing `delimiter as PATH_DELIMITER` (subagent-launcher.ts:480, production-discovered-theta.ts:171), clone-scan.mjs shows no clone group for either file, and the chain activeRoots (production-theta-producer.ts:2672) → assembleSubagentArgv's `.join` (subagent-launcher.ts:480) → argv → readThetaFlagPaths's `.split` inside runComposePass (production-composition.ts:818) confirms a genuine parent/child wire pair with no shared codec today and no prior PTQ covering it; per the D4 parallel protocol a wire encoder/decoder's shared-source-of-truth extraction is a human design call, never confirmed at triage (cf. PTQ-0292) (triage: claude-opus-5)
verdict: questionable — independently re-verified: both excerpts byte-match verbatim with zero drift at 466-481 and 143-180; grep re-confirms exactly two src/ sites import `delimiter as PATH_DELIMITER` and no shared codec (`encodeThetaDirsFlag`/`decodeThetaDirsFlag` or similar) exists anywhere; clone-scan.mjs (re-run correctly via a one-line --files manifest) shows no clone group at either cited range; the activeRoots feed is real (production-theta-producer.ts:2689, cited as 2672 — tolerable drift, content matches) into a genuine spawned-child-process argv (prepareSubagentLaunch returns execPath/args/cwd/env) read back at readThetaFlagPaths's sole call site (production-composition.ts:818, exact); bug 0008 adjudicated which wire format to use but never considered or rejected a shared codec, so this isn't pre-decided territory; discovery-sources.md is the one spec clause both sides implement, so the duplication is code-to-code, not spec-vs-code; no duplicate PTQ (PTQ-0292 is an analogous, not identical, precedent). D4 parallel protocol: accurate accounting caps at questionable, the shared-source-of-truth extraction is a human design call (triage: claude-opus-5)
