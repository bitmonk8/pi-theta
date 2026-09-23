---
id: pending
title: .theta read/parse/load gate duplicated in four callee and discovered sites
lens: D4
status: intake
verdict: pending
locations:
  - src/extension/production-discovered-theta.ts:72-82
  - src/extension/callee-load-parse.ts:15-26
  - src/extension/production-composition.ts:3708-3712
  - src/extension/production-composition.ts:4130-4136
sites: 4
fix_scope: module
d4_class: clone
wave: qw20260922211400
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-22
---

# .theta read/parse/load gate duplicated in four callee and discovered sites

## Observation
Four production sites read a `.theta` file through the pass-scoped parse cache and then apply the same frontmatter/load-parse-error gate before deciding whether the file is usable. `callee-load-parse.ts` exists explicitly as a "Shared callee read/parse gate" helper, but `parseDiscoveredTheta` in `production-discovered-theta.ts` and two inline callee gates in `production-composition.ts` do not call it. Each site duplicates the same `fs.readBytes(...).then(value => value, () => undefined)` fallback, the `bytes === undefined` short-circuit, the `parseViaPassCache({ path, bytes }, deps)` call, and the `document.frontmatter === null || hasLoadParseError(document.diagnostics)` predicate. The only differences are the path identifier, the failure payload, and the surrounding diagnostic framing.

## Evidence

`src/extension/production-discovered-theta.ts:72-82` (identical read/parse/gate skeleton):

```typescript
  const bytes = await fs.readBytes(theta.path).then(
    (value) => value,
    () => undefined,
  );
  if (bytes === undefined) {
    return { dropped: [] };
  }
  // Bug 0264: this is the discovery parse; when a `tools:` callee walk (or an
  // importer) reaches the SAME file first this pass, the cache returns that
  // parse instead of re-triggering `lexTheta`'s emit.
  const document = parseViaPassCache({ path: theta.path, bytes }, deps);
  if (document.frontmatter === null || hasLoadParseError(document.diagnostics)) {
```

`src/extension/callee-load-parse.ts:15-26` (the shared helper that is not reused by the other three sites):

```typescript
  const bytes = await fs.readBytes(absolutePath).then(
    (value) => value,
    () => undefined,
  );
  if (bytes === undefined) {
    return undefined;
  }
  // Bug 0264: route through the pass-scoped cache — this callee may already
  // have been parsed this pass (a discovered theta, or another `.theta`-callable
  // arity check reaching the same file).
  const document = parseViaPassCache({ path: absolutePath, bytes }, deps);
  if (document.frontmatter === null || hasLoadParseError(document.diagnostics)) {
    return undefined;
  }
```

`src/extension/production-composition.ts:3708-3712` (grandchild callee gate):

```typescript
    if (document.frontmatter !== null) {
      declaredMode.set(spec, document.frontmatter.mode);
    }
    if (document.frontmatter === null || hasLoadParseError(document.diagnostics)) {
      grandchildFails.set(spec, true);
      continue;
    }
```

`src/extension/production-composition.ts:4130-4136` (dispatch callee gate):

```typescript
  const document = parseViaPassCache({ path: absolute, bytes }, deps);
  if (document.frontmatter === null || hasLoadParseError(document.diagnostics)) {
    return { kind: "unparseable" };
  }
```

Diff verdict: **renamed-only / identical** on the read/parse/gate block; diverged only in the path variable name and the post-gate payload. No clone-map group exists for this shard (the duplicated block is below the scanner's token-window floor once the surrounding payloads are included).

## Why this is a problem
The gate is load-bearing: it decides whether a `.theta` file is registered, resolved as a callee, or reported as unparseable/unreadable. `hasLoadParseError` centralises only the severity/code-prefix test; the null-frontmatter check and the read/cache wiring are repeated at every caller. If the pass-cache wiring or the "missing bytes" handling changes, all four sites must change together. The existence of `callee-load-parse.ts` as a shared helper proves the authors already recognised this as a duplicated concern, but the helper was not adopted by `parseDiscoveredTheta` or the two inline callee gates in `production-composition.ts`.

## Suggested direction (non-binding, optional)
The natural shared home is the existing `src/extension/callee-load-parse.ts` helper (or a sibling in `src/extension/` that returns a structured `ParseGateResult` so each caller can supply its own success/failure payload). The duplicated block should be collapsed into one helper used by all four sites.

## False-positive check
- Re-verified all four cited spans in current code; the read/parse/gate skeleton matches verbatim.
- All four call sites are live: `parseDiscoveredTheta` is imported by `production-composition.ts`; `readCalleeDocument` is imported by `import-static-checks.ts` and `production-composition.ts`; the two inline gates are inside active `parseCalleeForTools`/`resolveNestedCallee` flows.
- `grep "parseViaPassCache("` across `src/extension` found these four gate-pattern sites plus two non-gate parse calls (`import-static-checks.ts:1379`, `production-composition.ts:4350`) that do not check `frontmatter === null || hasLoadParseError`; those are intentionally different (one is for diagnostic rendering, one walks the body unconditionally) and are not cited.
- Not a spec-normative vector table; the spec clauses (`registration-steps.md`, `extension-bootstrap-and-per-theta.md`) describe behaviour, not the inline gate expression.
- Not tests/.
- Related prior filing PTQ-0813 covers the separate `hasLoadParseError` reimplementation in `import-static-checks.ts`; this finding covers the broader read/parse/gate block and does not overlap with that issue.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — all four excerpts match on HEAD and all sites are live; not a duplicate of resolved PTQ-1125 (that fixed only the two resolveCallee* copies by minting readCalleeDocument; these four are the residual sites); but the "renamed-only / identical" verdict holds only for site 4 (parseCalleeTheta :4125-4137, byte-identical to readCalleeDocument bar the payload) — site 3's read is at :3645 with readable.set/onDiskCalleeName/visited-bound/containment probe (~55 lines, order pinned by the "Read, then containment, then parse" comment) between it and the :3704 parse, and it records frontmatter.mode between parse and gate, so that copy is diverged not cloned; site 1 returns document.diagnostics on gate failure so the existing undefined-returning helper cannot serve it; the FP-check's claim that import-static-checks.ts imports readCalleeDocument is false (sole importer production-composition.ts:159); the dedupe therefore needs a new helper shape (structured result exposing the parsed document/diagnostics on failure, read decoupled from parse) — a design ruling, not a mechanical collapse (triage: claude-fable-5-1)
verdict: questionable — re-verified on HEAD: excerpts at production-discovered-theta.ts:72-82, callee-load-parse.ts:15-26, production-composition.ts:3704-3712 and :4125-4137 all match and every site is live (parseDiscoveredTheta called at :1241; readCalleeDocument at :2561/:2603; the two inline gates sit in calleeFailsOwnStructuralChecks and parseCalleeTheta), and PTQ-1125 (resolved) covered only the two resolveCallee* copies so this is not a duplicate; but only site 4 is a renamed-only clone of readCalleeDocument — site 3's read is at :3645 with readable.set/onDiskCalleeName/visited-bound/containment probe (~55 lines, order pinned by the "Read, then containment, then parse" comment) before the :3704 parse and it records frontmatter.mode between parse and gate, and site 1 returns `{ dropped: [...document.diagnostics...] }` on gate failure (:122) so the undefined-returning helper cannot serve it; the FP-check also misstates the facts (import-static-checks.ts does not import readCalleeDocument — sole importer is production-composition.ts:159; the parseViaPassCache grep actually yields 8 hits incl. :3188 parseCalleeForTools with a frontmatter-null-only gate and import-resolution-kit.ts:313); clone-scan map on callee-load-parse.ts lists no group; the dedupe needs a new structured-result helper shape (document/diagnostics exposed on failure, read decoupled from parse) — a design ruling, not a mechanical collapse (triage: claude-fable-5-1)
verdict: questionable — re-verified on HEAD with line drift (production-discovered-theta.ts:71-82, callee-load-parse.ts:15-26, production-composition.ts:3419-3489 and :4249-4261): all four sites are live (parseDiscoveredTheta called :1242; readCalleeDocument :2605/:2647, sole importer production-composition.ts:160 — the FP-check's import-static-checks.ts claim is false; the inline gates sit in the visited-bound grandchild walk and parseCalleeTheta) and PTQ-1125 (resolved, G011) covered only the two resolveCallee* copies so not a duplicate; clone-scan map on callee-load-parse.ts lists no group; but the "renamed-only / identical" verdict does not hold across the set — site 3 has ~55 lines (readable.set / onDiskCalleeName / visited bound / containment probe, order pinned by the "Read, then containment, then parse" comment) between read and parse plus a frontmatter.mode record between parse and gate, site 1 returns the undelivered document.diagnostics + subagent-fn framing on gate failure, and even site 4 distinguishes `unreadable` from `unparseable` where readCalleeDocument collapses both to undefined — so no existing helper serves any of the three, and the fix is a new structured-result helper shape (read decoupled from parse, document/diagnostics exposed on failure), a design ruling for a human rather than a mechanical dedupe (triage: claude-fable-5-1)
triage worker failed (verdict not applied; re-triaged next wave) (loop, 2026-09-23)
