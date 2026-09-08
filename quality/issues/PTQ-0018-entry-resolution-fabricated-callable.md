---
id: PTQ-0018
title: EntryResolution's non-optional `callable` and `defaultName` force every diagnostic-bearing return in resolveEntry to fabricate values the sole caller never reads
lens: D2                     # the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/parser/callable-set.ts:331-339
  - src/parser/callable-set.ts:232-238
  - src/parser/callable-set.ts:402-411
  - src/parser/callable-set.ts:429-435
  - src/parser/callable-set.ts:438-448
  - src/parser/callable-set.ts:472-481
  - src/parser/callable-set.ts:488-499
sites: 7                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# EntryResolution's non-optional `callable` and `defaultName` force every diagnostic-bearing return in resolveEntry to fabricate values the sole caller never reads

## Observation

`EntryResolution` documents its `callable` field as "present iff `diagnostic`
is absent", but the field (and `defaultName`) is declared non-optional. The
module-private `resolveEntry` therefore fabricates a callable and a default
name on each of its five diagnostic-bearing returns — four of them throwaway
`{ kind: "theta", mode: "subagent", callee: undefined, ... }` /
`{ kind: "pi-tool", toolDefinition: undefined }` objects. The function's sole
caller, `resolveCallableSet`, `continue`s out as soon as `diagnostic` is
present, so on every failure return both fabricated values are constructed and
then discarded unread.

## Evidence

src/parser/callable-set.ts:331-339 — the record whose doc contradicts its
types:

```ts
/** The outcome of resolving one entry's underlying callable. */
interface EntryResolution {
  /** The resolved callable, present iff `diagnostic` is absent. */
  readonly callable: ResolvedCallable;
  /** The default (pre-rename) name for the entry. */
  readonly defaultName: string;
  /** The rejection diagnostic, present iff resolution failed. */
  readonly diagnostic?: Diagnostic;
}
```

src/parser/callable-set.ts:232-238 — the sole caller never reaches `callable`
/ `defaultName` when a diagnostic is present:

```ts
    const resolution = resolveEntry(parsed.spec, deps, file);
    if (resolution.diagnostic !== undefined) {
      diagnostics.push(resolution.diagnostic);
      continue;
    }

    const name = parsed.rename ?? resolution.defaultName;
```

The five diagnostic-bearing returns, each fabricating unread values:

src/parser/callable-set.ts:402-411 (unknown Pi tool):

```ts
      return {
        callable: { kind: "pi-tool", toolDefinition: undefined },
        defaultName: spec,
        diagnostic: {
          severity: "error",
          code: "theta/load/unknown-tool",
```

src/parser/callable-set.ts:429-435 (wrong extension):

```ts
  if (extensionDiagnostic !== undefined) {
    return {
      callable: { kind: "theta", mode: "subagent", callee: undefined, calleePath: spec },
      defaultName: thetaDefaultName(spec),
      diagnostic: extensionDiagnostic,
    };
  }
```

src/parser/callable-set.ts:438-448 (unresolvable path) and :472-481 (bug-0379
basename byte-mismatch) both return the identical fabricated shape:

```ts
      callable: { kind: "theta", mode: "subagent", callee: undefined, calleePath: spec },
      defaultName,
      diagnostic: {
        severity: "error",
        code: "theta/load/unresolvable-theta-path",
```

src/parser/callable-set.ts:488-499 (prompt-mode callee) pairs the real
`withPath` callable with a diagnostic, so it too is discarded:

```ts
  if (resolved.mode === "prompt") {
    return {
      callable: withPath,
      defaultName,
      diagnostic: {
        severity: "error",
        code: "theta/load/prompt-mode-callable",
```

## Why this is a problem

Vestigial fields with fabricated values: on every one of the five failure
returns, `callable` and `defaultName` are provably never read — the only call
site (:232-238) discards the record after pushing the diagnostic, and
`resolveEntry` is module-private (declaration at :394; only reference the :232
call), so no other reader can exist. The `mode: "subagent"` /
`toolDefinition: undefined` stand-ins are pure filler invented to satisfy the
non-optional type, and the field's own doc comment ("present iff `diagnostic`
is absent") describes the optional shape the type does not have — the comment
and the type contradict each other, and the filler objects are dead data kept
alive only by that mismatch.

## Suggested direction (non-binding, optional)

Make `EntryResolution` a two-arm discriminated result (resolved
callable+defaultName, or diagnostic), or mark the two fields optional as the
doc already claims, so the failure arms return only the diagnostic and the
filler objects disappear.

## False-positive check

- Reference search for `resolveEntry` across src/, extensions/, tools/,
  tests/: definition at src/parser/callable-set.ts:394, single call at :232;
  the function is not exported, so no test or external caller can read the
  fabricated values (the `resolveEntry` hits in discovery-walk.ts are a
  different, unrelated function; all other hits are comments).
- Read-path check: in `resolveCallableSet`, `resolution.callable` (:302) and
  `resolution.defaultName` (:238) are read only after the
  `resolution.diagnostic !== undefined` guard `continue`s (:233-236), so no
  diagnostic-bearing return's values are ever read.
- Tests-only-caller rule: not applicable — the dead values are unreadable even
  through the exported `resolveCallableSet`, which tests call.
- Git history intent: the byte-mismatch arm (bug 0379, commit 1c413100) and
  the extension arm (bug 0320) each copied the existing fabrication pattern
  when added, consistent with the filler being type-driven, not meaningful.

## Triage

verdict: confirmed — re-verified independently: every excerpt matches at the cited lines, resolveEntry is unexported with a single call site (:232) that pushes the diagnostic and continues, so the four filler literals (:403/:431/:440/:473) and the prompt-mode arm's record are provably never read while the field's own doc ("present iff diagnostic is absent") contradicts the non-optional type; in-scope localized src/ cruft (triage: claude-opus-5)

