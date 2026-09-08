---
id: PTQ-0117
title: calleeFailsOwnStructuralChecks is documented as the entry point two call sites call, but parseCalleeTheta's dispatch gate now calls the taint wrapper directly and one call site remains
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/extension/production-composition.ts:3156-3159
  - src/extension/production-composition.ts:2780-2784
  - src/extension/production-composition.ts:2733-2735
  - src/extension/production-composition.ts:2515-2526
  - src/extension/production-composition.ts:3485-3491
  - src/extension/production-composition.ts:3175-3187
sites: 6
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# calleeFailsOwnStructuralChecks is documented as the entry point two call sites call, but parseCalleeTheta's dispatch gate now calls the taint wrapper directly and one call site remains

## Observation
`production-composition.ts` splits the callee-structural-check predicate into
three layers: `calleeFailsOwnStructuralChecksBody`, the memo wrapper
`calleeFailsOwnStructuralChecksWithTaint`, and the boolean-returning
`calleeFailsOwnStructuralChecks`. Three doc-comment passages state that the
boolean entry point is called by two sites — `parseCalleeForTools` and
`parseCalleeTheta`'s dispatch gate. The dispatch gate was rewired (bug 0423 F1,
2026-09-04) to call `calleeFailsOwnStructuralChecksWithTaint` directly so it can
read `patchedSystemTemplate` / `importedTypeDecls` off the returned object. One
call site of the boolean entry point now remains, inside `parseCalleeForTools`.
The function is not exported and no test calls it.

## Evidence
src/extension/production-composition.ts:3156-3159 — the boolean entry point's
own doc-comment names two call sites:

```ts
/**
 * Bug 0276 §Fix constraint 6: the boolean-returning entry point
 * `parseCalleeForTools` and `parseCalleeTheta`'s dispatch gate call, taking
 * the callee's already-read `bytes` so
```

src/extension/production-composition.ts:2780-2784 — the body's layer-split
doc-comment repeats it and adds "both call sites already hold them":

```ts
 *   - `calleeFailsOwnStructuralChecks` (below) is the boolean-returning entry
 *     point `parseCalleeForTools` and `parseCalleeTheta`'s dispatch gate
 *     call, taking the callee's `bytes` too (both call sites already hold
 *     them) so the memo can byte-guard at the top of the recursion exactly as
 *     it does at every depth beneath it. It keeps returning the SHALLOW
```

src/extension/production-composition.ts:2733-2735 — a third statement of the
same roster:

```ts
 * `deps.emitDiagnostic?.(…)` call belongs here). The bare boolean the two call
 * sites see is `calleeFailsOwnStructuralChecks`'s, three functions down, which
 * returns this triple's shallow `fails` alone. The callee's
```

src/extension/production-composition.ts:2515-2526 — the one remaining call site
(inside `parseCalleeForTools`):

```ts
  const failsPostParseChecks = await calleeFailsOwnStructuralChecks(
    fs,
    ctx,
    deps,
    absolute,
    document.frontmatter,
    document.body,
    getAllTools,
    activeRoots,
    new Set([absolute]),
    bytes,
  );
```

src/extension/production-composition.ts:3485-3491 — the dispatch gate, which
now calls the wrapper and says so in its own comment:

```ts
  // Bug 0423 F1: read the structural verdict through the taint wrapper (the
  // memo delegate the boolean entry point uses) rather than the boolean entry,
  // so this dispatch also receives the callee's load-phase-patched `system:`
  // template computed by the SAME `checkThetaImports` the structural check
  // already runs — no second resolution pass. `.fails` is consumed exactly as
  // before; `ownEscapes` stays discarded here (the boolean entry's contract).
  const structural = await calleeFailsOwnStructuralChecksWithTaint(
```

src/extension/production-composition.ts:3175-3187 — the entry point's
signature and its single statement: it forwards ten arguments unchanged and
destructures one field.

```ts
async function calleeFailsOwnStructuralChecks(
  fs: FileSystem,
  ctx: ExtensionContext,
  deps: PassVerdictDeps,
  calleeAbsolutePath: string,
  frontmatter: ThetaCompositionInput["frontmatter"],
  body: ThetaBody,
  getAllTools: GetAllToolsSnapshot | undefined,
  activeRoots: readonly string[] | undefined,
  visited: ReadonlySet<string>,
  bytes: Uint8Array,
): Promise<boolean> {
  const { fails } = await calleeFailsOwnStructuralChecksWithTaint(
```

## Why this is a problem
Three doc passages state a caller roster the code contradicts: they name two
call sites for a function that has one. The passages are the navigation aid a
reader uses to reason about which layer each surface consumes and why
`ownEscapes` is discarded "at the entry point" — a reader who takes them at
face value will look for a second consumer of the shallow-`fails` contract at
`parseCalleeTheta` and find the wrapper instead. Mechanically: `git blame`
dates the doc passages to 2026-08-25 (`2c9133966`) and the dispatch gate's
switch to the wrapper to 2026-09-04 (`401a425bb`); the narration was not
updated with the rewire. The residual layer is a ten-argument forward plus one
destructure with a single caller.

## Suggested direction (non-binding, optional)
Bring the three doc passages into agreement with the single remaining call
site, or fold the destructure into that call site.

## False-positive check
- `grep -rn "calleeFailsOwnStructuralChecks" --include=*.ts src extensions
  tools tests`: the only production call of the bare name is
  `production-composition.ts:2515`; every other production hit is either a
  doc-comment mention or one of the two sibling names
  (`…Body` / `…WithTaint`). Checked that the two sibling names are distinct
  identifiers, not substring hits of the bare name, by reading each hit.
- Export check: `calleeFailsOwnStructuralChecks` carries no `export` keyword
  (line 3175 begins `async function`), so no re-export or cross-module import
  can reach it; confirmed no `export {` block in the file re-exports it.
- Test-caller check: the test hits listed by the same grep are all comment
  prose in `tests/*.test.ts` headers (no `import` of the name exists — the
  symbol is module-private), so this is not a test-only-reachable function
  being mistaken for dead. The function is alive; only the documented roster
  is wrong.
- Dynamic/string-keyed access: searched for `"calleeFailsOwnStructuralChecks"`
  as a string and for bracket access — no hits outside comments.
- History intent: `git blame -L 3157,3159` → `2c9133966` (2026-08-25);
  `git blame -L 3491,3491` → `401a425bb` (2026-09-04). The doc predates the
  rewire, so the mismatch is drift rather than a deliberate statement.

## Triage
verdict: confirmed — verified all six excerpts verbatim; repo-wide grep of all *.ts shows the bare entry point is called exactly once (2515, in parseCalleeForTools), while the dispatch gate (3491, in parseCalleeTheta) and the recursion (3000) call ...WithTaint; symbol is unexported with no re-export, import, or dynamic access, and blame confirms the three doc passages (2c9133966, 2026-08-25) predate the rewire (401a425bb, 2026-09-04), so the documented two-call-site roster is mechanically false. (triage: claude-opus-5)
