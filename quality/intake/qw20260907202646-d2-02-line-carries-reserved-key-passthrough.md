---
id: pending
title: lineCarriesReservedKey is a one-expression pass-through over classifyChildStdoutLine whose "kept for its existing call sites" rationale was written by the same commit that deleted both of its src/ call sites
lens: D2
status: intake
verdict: pending
locations:
  - src/runtime/subagent-envelope.ts:321-332
  - src/runtime/subagent-envelope.ts:297-299
  - src/runtime/subagent-envelope.ts:11-15
sites: 3
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# lineCarriesReservedKey is a one-expression pass-through over classifyChildStdoutLine whose "kept for its existing call sites" rationale was written by the same commit that deleted both of its src/ call sites

## Observation
`lineCarriesReservedKey(line)` has a single-expression body,
`classifyChildStdoutLine(line).kind === "envelope"`. Its doc-comment states it
is "kept `boolean` for its existing call sites rather than widened", and
`classifyChildStdoutLine`'s doc repeats that it is "a thin `boolean` wrapper
over it kept for every existing `boolean` call site". No file under src/,
extensions/ or tools/ calls it. The commit that introduced both of those
sentences (470071d8, bug 0086) is the commit that rewrote the two production
call sites to call `classifyChildStdoutLine` directly.

## Evidence
The wrapper — src/runtime/subagent-envelope.ts:321-332:
```ts
/**
 * Whether one stdout line carries the reserved `theta_result` top-level key.
 * A line that is not JSON, or is JSON but does not carry the reserved key
 * (a valid `--mode json` event, garbage, or partial JSON), returns `false` —
 * the parent ignores it (stray-line tolerance, PIC-59). A thin wrapper over
 * {@link classifyChildStdoutLine}'s three-way verdict, kept `boolean` for its
 * existing call sites rather than widened, since only the reserved-key
 * question — not the class of a non-envelope line — is decided here.
 */
export function lineCarriesReservedKey(line: string): boolean {
  return classifyChildStdoutLine(line).kind === "envelope";
}
```

The same claim restated on the classifier — src/runtime/subagent-envelope.ts:297-299:
```ts
 * This is the sole `JSON.parse` + reserved-key test for a child stdout line;
 * {@link lineCarriesReservedKey} is a thin `boolean` wrapper over it kept for
 * every existing `boolean` call site.
```

The module header still presents the wrapper as part of the parent-side
surface — src/runtime/subagent-envelope.ts:11-15:
```ts
//   - parent-side three-way stdout-line classification
//     (`classifyChildStdoutLine`: envelope / other-json / unparseable) and its
//     `boolean` wrapper (`lineCarriesReservedKey`), line parsing
//     (`parseEnvelopeLine`), and stray-line-tolerant stream scanning
//     (`scanStreamForEnvelope`);
```

Where the production call sites went. `git show 470071d8 -- src/ | grep -n
"lineCarriesReservedKey"` returns, among the header rewrites, three
deletion lines and no addition of a call:
```
-    if (lineCarriesReservedKey(line)) {
-  lineCarriesReservedKey,
-      if (!lineCarriesReservedKey(line)) {
```
The two call sites deleted were this module's own `scanStreamForEnvelope` and
`src/runtime/subagent-json-driver.ts`; the latter now reads
src/runtime/subagent-json-driver.ts:173 `const classified =
classifyChildStdoutLine(line);`, and this module's scanner reads
src/runtime/subagent-envelope.ts:448 `const classified =
classifyChildStdoutLine(line);`.

## Why this is a problem
Redundant pass-through layer: the wrapper adds no behaviour over the function
it delegates to — it re-projects one field of a three-way verdict onto a
boolean — and the only stated justification for keeping it, "its existing
`boolean` call sites", names a set that is empty under src/, extensions/ and
tools/. The justification is not merely out of date by drift: the commit that
wrote it is the same commit that removed the call sites it appeals to, so the
sentence was false on the day it landed and has stayed the module header's
description of the parent-side surface ever since.

## Suggested direction (non-binding, optional)
Whether the `boolean` projection is still worth publishing — and, if so, with
a rationale that describes its actual reachability the way the neighbouring
`scanStreamForEnvelope` doc already does ("has no `src/` caller at HEAD") — is
the fix stage's call.

## False-positive check
- Identifier search across production: `grep -rn "\blineCarriesReservedKey\b"
  --include=*.ts --include=*.js src extensions tools` → three hits, all inside
  src/runtime/subagent-envelope.ts (header line 13, doc line 298, declaration
  line 330). No call site.
- Test search: `grep -rn "\blineCarriesReservedKey\b" --include=*.ts tests` →
  8 hits (tests/subagent-envelope.test.ts imports and exercises it;
  tests/subagent-wire-parse-failed-classifier.test.ts and
  tests/subagent-wire-parse-failed-emitter.test.ts name it in comments and
  assertions). This finding is therefore NOT a deadness claim — the function is
  test-reachable and, per this repository's convention, alive. The claim is
  that it is a behaviour-free pass-through whose stated reason for existing
  cites production call sites that do not exist.
- Dynamic / string-keyed access: searched for the quoted name
  `"lineCarriesReservedKey"` across src/, extensions/, tools/, tests/ — the only
  bracket-access style lookup in the corpus is
  tests/subagent-wire-parse-failed-classifier.test.ts's
  `["classifyChildStdoutLine"]` probe, which names the classifier, not the
  wrapper.
- Re-export check: `grep -rn "export \*" --include=*.ts src extensions tools
  tests` → no hits anywhere, so no barrel re-exports it under another name.
- Git history intent check: `git log -S "lineCarriesReservedKey" --oneline --
  src/` → two commits: 4866d4d2 (introduced with callers) and 470071d8 (bug 0086),
  whose diff deletes the import and both call sites while adding the "kept for … existing call site" sentences quoted above.

## Triage
