---
id: PTQ-1308
title: b0345 locally reimplements InstantSettleSession, rootDouble, driveInterp and assertFramesToInternalError instead of importing the canonical runtime-belt-probe-harness
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0345-interpolation-operand-checks-at-parse.test.ts:459-489
  - tests/b0345-interpolation-operand-checks-at-parse.test.ts:491-507
  - tests/b0345-interpolation-operand-checks-at-parse.test.ts:528-573
  - tests/b0345-interpolation-operand-checks-at-parse.test.ts:576-586
  - tests/helpers/runtime-belt-probe-harness.ts:98-149
  - tests/helpers/runtime-belt-probe-harness.ts:161-172
sites: 4
fix_scope: module             # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# b0345 locally reimplements InstantSettleSession, rootDouble, driveInterp and assertFramesToInternalError instead of importing the canonical runtime-belt-probe-harness

## Observation
tests/b0345-interpolation-operand-checks-at-parse.test.ts declares its own `InstantSettleSession` class, `rootDouble` function, `driveInterp` function and `assertFramesToInternalError` function at module scope. tests/helpers/runtime-belt-probe-harness.ts already exports the same session double (a private `InstantSettleSession` class of identical shape, used inside its exported `makeBeltProbes`), the same fixed-clock `rootDouble`, the same `driveInterp` behaviour (through `makeBeltProbes`'s returned `driveInterp`), and the same throw-framing assertion under the name `assertInternalError`. b0345's own imports (`./helpers/e2e-s1`, `./helpers/scripted-live-session-harness`) do not include `./helpers/runtime-belt-probe-harness`, so none of the four pieces is reused from the module that already holds them; each is retyped locally instead.

## Evidence

tests/b0345-interpolation-operand-checks-at-parse.test.ts:459-489 (`InstantSettleSession`, re-read immediately before filing):
```ts
class InstantSettleSession {
  readonly entries: Array<Record<string, unknown>> = [];
  readonly sent: string[] = [];

  sendUserMessage(text: string): void {
    this.sent.push(text);
    this.entries.push({
      type: "message",
      id: `u${this.entries.length + 1}`,
      parentId: undefined,
      message: { role: "user", content: [{ type: "text", text }] },
    });
    this.entries.push({
      type: "message",
      id: `a${this.entries.length + 1}`,
      parentId: `u${this.entries.length}`,
      message: {
        role: "assistant",
        content: [{ type: "text", text: "settled-reply" }],
        api: "anthropic-messages",
        provider: "anthropic",
        model: "m1",
        stopReason: "stop",
      },
    });
  }

  isIdle(): boolean {
    return true;
  }
}
```

tests/b0345-interpolation-operand-checks-at-parse.test.ts:491-507 (`rootDouble`):
```ts
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: {
      now: (): number => 0,
      wallNow: (): number => 0,
      setTimeout: (fn: () => void): unknown => {
        fn();
        return 0;
      },
      clearTimeout: (): void => {},
    },
  } as unknown as RuntimeRoot;
}
```

tests/b0345-interpolation-operand-checks-at-parse.test.ts:576-586 (`assertFramesToInternalError`, the local, weaker copy — it omits the `toBeDefined()` and `diag.message` checks the canonical `assertInternalError` performs):
```ts
function assertFramesToInternalError(thrown: unknown, what: string): void {
  expect(
    isThetaPanic(thrown),
    `${what}: the belt is a plain Error, NOT a ThetaPanic; thrown: ${String(thrown)}`,
  ).toBe(false);
  const diagnostic = surfaceUnexpectedThrow(thrown, SITE);
  const diag = diagnostic as Diagnostic;
  expect(
    diag.code,
    `${what}: the belt throw routes to the internal-error surface (theta/runtime/internal-error)`,
  ).toBe(INTERNAL_ERROR_CODE);
}
```

tests/helpers/runtime-belt-probe-harness.ts:98-149 — the canonical, already-exported equivalents (`rootDouble`, an internal `InstantSettleSession` of the same field/method shape, and the exported `assertInternalError`, whose body performs the same `isThetaPanic`/`surfaceUnexpectedThrow`/`.code` checks plus a `toBeDefined()` and a `diag.message` match that b0345's local copy drops):
```ts
export function rootDouble(): RuntimeRoot {
  return rootWith(SEAM_NOOP_CHECKPOINT, "inv-1", {
    now: (): number => 0,
    wallNow: (): number => 0,
    setTimeout: (fn: () => void): unknown => {
      fn();
      return 0;
    },
    clearTimeout: (): void => {},
  });
}
...
export function assertInternalError(
  thrown: unknown,
  site: { readonly file: string; readonly range: SourceRange },
  what: string,
  nonPanicMessage = `${what}: the loud throw is a plain Error, NOT a ThetaPanic (the six-source panic list is closed). Thrown: ${String(thrown)}`,
): void {
  expect(isThetaPanic(thrown), nonPanicMessage).toBe(false);
  const diagnostic = surfaceUnexpectedThrow(thrown, site);
  expect(diagnostic, `${what}: surfaceUnexpectedThrow returns a Diagnostic for a non-panic throw`).toBeDefined();
  const diag = diagnostic as Diagnostic;
  expect(diag.code, `${what}: the loud throw routes to the existing permitted internal-error surface`).toBe(INTERNAL_ERROR_CODE);
  expect(diag.message, `${what}: the internal-error template prefix (tail wording is the implementer's)`).toMatch(/^internal error: /);
}
```

`makeBeltProbes`'s internal `driveInterp` (runtime-belt-probe-harness.ts:161-172 area, same file) performs the same parse→session→`createProductionProducerDeps`→`bindPromptConversation`→`executeBody` sequence, wrapped in the same try/catch shape, that b0345's own local `driveInterp` (528-573) re-derives field-for-field (same `pi` stub shape, same `ctx` stub shape, same `theta` composition-input shape).

## Why this is a problem
tests/helpers/runtime-belt-probe-harness.ts exists specifically to hold this session double, fixed-clock root, drive function and throw-framing assertion once for every file that drives a query-mode interpolation through the production pure-host seam (b0338, b0366, b0367, b0368, b0369, b0392 all import from it). b0345 drives the identical seam (a prompt-mode `@`-query interpolation through `createProductionProducerDeps`/`bindPromptConversation`/`executeBody`, captured via an instant-settling session double) but does not import the module; instead it retypes the double, the root, the drive, and a strictly weaker version of the throw-framing assertion as its own module-scope declarations.

## Suggested direction (non-binding, optional)
`tests/helpers/runtime-belt-probe-harness.ts` already exports `rootDouble`, `assertInternalError`, and (via `makeBeltProbes`) an interpolation drive of the same shape; b0345's four local declarations are candidates to be replaced by imports from that module the way its siblings already do.

## False-positive check
- Gate-pin check: tests/b0345-interpolation-operand-checks-at-parse.test.ts does not match `*gate*.test.ts` or the named kin; the cited declarations are harness/fixture plumbing, not a pinned count or inventory.
- Recording-double check: `InstantSettleSession` records `sendUserMessage` calls so the test can assert what was sent, and the assertions in this file are positive ("sent must equal [...]"), not a "never called" negative witness — the recording-double carve-out for negative witnesses does not apply here; the finding is about the double's re-implementation, not about a MUST-NOT assertion.
- docs/bugs/ signature search: docs/bugs/0345-interpolation-expressions-skip-all-operand-checks-at-parse.md is cited by the file's own header comment; `npx vitest run tests/b0345-interpolation-operand-checks-at-parse.test.ts` was not re-run as part of this filing beyond the file's own stated RED/GREEN witness table, which the file documents as expected (some cells RED at HEAD, by design) — this finding does not depend on the file's red/green status, only on the duplicated declarations existing in current code.
- coverage-matrix/bug-doc citation search: `grep -n "b0345-interpolation-operand-checks-at-parse" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()` — only that four locally-declared pieces could import the already-existing canonical module — so no citation is affected.
- Prior-finding overlap check: `grep -rl "b0345" quality/intake quality/resolved` finds no filing whose subject is this file's own harness declarations (the hits found are about `coverage-matrix.md`/`show`/`soleQueryRange` naming drift and ascription staleness in unrelated files); `tests/helpers/runtime-belt-probe-harness.ts`'s own header comment names only b0368/b0369 as the files it was extracted from (PTQ-0397) and does not cite b0345, confirming this is a new, unfixed instance of the same root cause the prior extraction addressed for other files.
- Coverage-drift check: this finding is about duplicated already-passing/already-red harness declarations, not a missing test path; it does not propose any coverage change.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all excerpts reproduce at tests/b0345-interpolation-operand-checks-at-parse.test.ts:459-489 (`InstantSettleSession`), 491-507 (`rootDouble`), 528-573 (`driveInterp`), 576-586 (`assertFramesToInternalError`) and tests/helpers/runtime-belt-probe-harness.ts:98-110/125-149/166-196/256-300; mktemp `diff` of the two `InstantSettleSession` bodies is empty, `driveInterp` differs only in `parseTheta`/`bugTag`/`sourcePath`/the `value` spread that `makeBeltProbes(parseTheta, bugTag, options)` already parameterises, `rootDouble` builds the same fixed-clock root the export builds via `rootWith`, and the local framing check is a strict subset (drops `toBeDefined` + `/^internal error: /`) of the exported `assertInternalError` whose 4th param preserves local wording; b0345's imports (lines 93-94: e2e-s1, scripted-live-session-harness) omit runtime-belt-probe-harness while 24 tests/ files including b0338 already import it, so the header's "reproduce rather than import (b0338 is a lock)" rationale predates the PTQ-0397 extraction and is stale; all four declarations are live (594/630/638/655/663/668/676), bug 0345 `Status: fixed (0.317.0)`, 13/13 pass, coverage-matrix → 0 hits, no gate/recording-double/red-test carve-out, no merge/rename/delete proposed; not a duplicate — PTQ-0437/0445/0611 name b0345 only as pattern size with claims scoped to b0332/b0338, b0394/b0395, b0402, PTQ-0919 is b0366/b0367 only, sibling intake d7-01-assertframestointernalerror covers b0369/b0370, and quality/issues PTQ-1282 is an unrelated src finding — real, in-scope D7 copy-paste fixture/double confined to tests/ (triage: claude-fable-5-1)
