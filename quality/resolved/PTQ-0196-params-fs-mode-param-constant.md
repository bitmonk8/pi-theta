---
id: PTQ-0196
title: createProductionParamsFs's writeTempFile threads a mode parameter that has received exactly one value, at exactly one call site, since its introduction
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/production-subagent-host.ts:193-206
  - src/extension/production-theta-producer.ts:2706-2716
  - src/runtime/subagent-params.ts:114-119
  - src/runtime/subagent-params.ts:54-55
  - src/runtime/subagent-params.ts:187-190
sites: 5                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260911055804
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-11
---

# createProductionParamsFs's writeTempFile threads a mode parameter that has received exactly one value, at exactly one call site, since its introduction

## Observation
`createProductionParamsFs()`'s returned `writeTempFile(contents, mode)` takes
a POSIX file-mode parameter and passes it straight to `writeFileSync(path,
contents, { mode })`. That parameter is forwarded, unmodified, through one
more pass-through closure in `production-theta-producer.ts`
(`#paramsMarshalDeps()`'s own `writeTempFile`). The only place in the
codebase that supplies a value for it is `subagent-params.ts`'s
`marshalParams`, which always calls `deps.writeTempFile(plan.contents,
SUBAGENT_PARAMS_TEMP_FILE_MODE)` — a module-level constant, never a
caller-supplied argument. No test imports `createProductionParamsFs`, so no
test call ever reaches this function's `mode` parameter with any value
either.

## Evidence
src/extension/production-subagent-host.ts:193-206 — the parameter's
declaration and its one read:

```ts
export function createProductionParamsFs(): {
  writeTempFile: (contents: string, mode: number) => string;
  unlink: (path: string) => void;
  readFile: (path: string) => string;
} {
  return {
    writeTempFile: (contents: string, mode: number): string => {
      // A per-invocation private directory avoids name collisions under `par for`
      // fan-out; the 0600 file mode keeps the brief on-disk param exposure owner-only.
      const dir = mkdtempSync(join(tmpdir(), "pi-theta-params-")); // allow-sync: RFC-0006 one-shot params temp-file write, not event-loop I/O
      const path = join(dir, "params.json");
      writeFileSync(path, contents, { mode }); // allow-sync: RFC-0006 one-shot params temp-file write
      return path;
    },
```

src/extension/production-theta-producer.ts:2706-2716 — the interposed
pass-through, forwarding whatever `mode` it is given:

```ts
  #paramsMarshalDeps(): ParamsMarshalDeps {
    const fs = this.#input.subagentParamsFs;
    return {
      writeTempFile: (contents: string, mode: number): string => {
        if (fs === undefined) {
          throw new SubagentSpawnFailedError(
            "subagent params temp-file channel unavailable: no params-fs seam wired",
          );
        }
        return fs.writeTempFile(contents, mode);
      },
```

src/runtime/subagent-params.ts:114-119 — the interface both of the above
implement the shape of:

```ts
export interface ParamsMarshalDeps {
  /** Write `contents` to a fresh temp file at `mode` and return its path (0600 channel). */
  readonly writeTempFile: (contents: string, mode: number) => string;
  /** Delete the temp file (the parent-`finally` backstop). */
  readonly unlink: (path: string) => void;
}
```

src/runtime/subagent-params.ts:54-55 — the one value ever supplied:

```ts
/** The temp-file mode for the at/above-threshold channel (0600 — owner-only). */
export const SUBAGENT_PARAMS_TEMP_FILE_MODE = 0o600;
```

src/runtime/subagent-params.ts:187-190 — the sole call site in the codebase
that chooses a `mode` value, always this constant:

```ts
  // At/above-threshold: write the 0600 temp file and carry its path on the file
  // env var; the large payload does NOT also ride the env var (that would defeat
  // the cutover). The parent-`finally` backstop deletes the temp file.
  const tempFilePath = deps.writeTempFile(plan.contents, SUBAGENT_PARAMS_TEMP_FILE_MODE);
```

## Why this is a problem
Vestigial parameter: every call site passes the same value, and here there is
exactly one call site, at any layer, across the whole codebase. The two
pass-through closures (this file's `writeTempFile`, and
`#paramsMarshalDeps()`'s own `writeTempFile`) each forward whatever they are
given without branching on it; the value itself originates as a hardcoded
constant inside `marshalParams`, not as something any of its own callers
choose. `git log -S "SUBAGENT_PARAMS_TEMP_FILE_MODE"` and `git log -S "0o600"
-- src/runtime/subagent-params.ts` each return a single hit
(`4866d4d2`, 2026-07-24, the same commit that introduced this file's
`createProductionParamsFs`), so the constant and its one call site were
introduced together and neither has changed since — there is no history of a
second value this parameterization once served.

## Suggested direction (non-binding, optional)
Fix the mode at the point each closure performs its write instead of
threading it as a parameter through two forwarding layers, or state at the
`ParamsMarshalDeps` boundary that the mode is fixed by contract rather than
caller-selected; tests that already fake `ParamsMarshalDeps` directly (never
touching this production function) are unaffected either way.

## False-positive check
- `grep -rn "writeTempFile(" src` → exactly two call sites: the
  pass-through forward (production-theta-producer.ts:2715) and the
  value-selecting call (subagent-params.ts:190). No third call site anywhere
  in `src/`.
- `grep -rn "createProductionParamsFs" tests` → zero hits; no test calls the
  reviewed factory directly (its only instantiation is
  production-composition.ts:924), so no test supplies this function's `mode`
  parameter any value either — this is not a test-only-reachable case, since
  production reaches the function on every above-threshold params marshal.
- `grep -n "#paramsMarshalDeps(" src/extension/production-theta-producer.ts`
  → one call site (:2501), passed straight into `marshalParams(paramValues,
  this.#paramsMarshalDeps())`.
- `grep -rn "marshalParams(" src` → one call site (theta-producer.ts:2501);
  `marshalParams`'s own body (subagent-params.ts:151-204) contains exactly
  one `deps.writeTempFile` call, with the mode hardcoded in the call
  expression itself — no caller of `marshalParams` can vary it.
- `git log -S "SUBAGENT_PARAMS_TEMP_FILE_MODE" -- src/runtime/subagent-params.ts`
  and `git log -S "0o600" -- src/runtime/subagent-params.ts` → one commit
  each (`4866d4d2`), matching the commit that introduced
  `createProductionParamsFs` in the reviewed file; no later commit touched
  either the constant or its call site.
- Confirmed the value is read, not write-only: `writeFileSync(path, contents,
  { mode })` at production-subagent-host.ts:204 consumes it — the claim is
  about the value's invariance across call sites, not about it being unread.
- Not a deadness claim: `writeTempFile` is reached in production on every
  above-threshold params marshal.
- Checked this is not the already-listed
  `qw20260907202646-d2-03-subagent-host-header-two-collaborators-stale.md`
  (the module header) or the confirmed `PTQ-0192`
  (`createProductionEnvelopeWriter`'s wrapper is a pure identity forward with
  no I/O of its own) — this finding concerns a different function
  (`createProductionParamsFs`'s `writeTempFile`, which performs real
  `mkdtempSync`/`writeFileSync` I/O) and a different claim (one of its two
  parameters never varying, not the whole closure being redundant).

## Triage
verdict: confirmed — every excerpt/line range reproduces verbatim at HEAD (production-subagent-host.ts:193-206, production-theta-producer.ts:2706-2716, subagent-params.ts:114-119/54-55/187-190); independently reran the searches: `writeTempFile(` has exactly 2 call sites in src (the :2715 forward and the :190 value-supplying call), `createProductionParamsFs` has one instantiation (production-composition.ts:924) and zero test importers, and `git log -S` on both `SUBAGENT_PARAMS_TEMP_FILE_MODE` and `0o600` in this file returns only the single introducing commit 4866d4d2 with no later touch; this is the same mechanically-evidenced vestigial-parameter shape as the confirmed/fixed PTQ-0053 (single value at every call site, read not dead) and is a distinct claim from PTQ-0192 (whole-closure identity forward) — in-scope D2 cruft in src/, not a dedupe. (triage: claude-opus-5)
