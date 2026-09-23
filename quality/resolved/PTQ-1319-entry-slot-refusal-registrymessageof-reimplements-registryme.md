---
id: PTQ-1319
title: Local registryMessageOf in entry-slot-refusal.test.ts reimplements the shared registryMessageOrThrow the sibling file's own helper module exports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/inline-object-empty-entry-slot-refusal.test.ts:1-4,203-217
  - tests/helpers/load-row-harness.ts:111-126
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# Local registryMessageOf in entry-slot-refusal.test.ts reimplements the shared registryMessageOrThrow the sibling file's own helper module exports

## Observation
`tests/helpers/load-row-harness.ts` exports `registryMessageOrThrow(registry,
code, missingRowContext)`, a throw-on-missing-row registry-message reader with
a fixed failure-message prefix and a caller-supplied tail sentence. This
file's in-scope sibling, `tests/inline-object-empty-field-type-truncation.test.ts`,
already imports a different helper (`registryMessageOf`) from that same
`./helpers/load-row-harness` module. `tests/inline-object-empty-entry-slot-refusal.test.ts`
does not import `./helpers/load-row-harness` at all; instead it imports the raw
`registryMessage` from `../tools/code-registry/index.js` directly and declares
a local `registryMessageOf(code)` whose body is `registryMessageOrThrow`'s
body with the `missingRowContext` parameter inlined as a fixed string.

## Evidence
`tests/inline-object-empty-entry-slot-refusal.test.ts:1-4` (the imports; no
`./helpers/load-row-harness` import at all):
```ts
import { REGISTRY } from "./helpers/registry-oracle";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { registryMessage } from "../tools/code-registry/index.js";
```

`tests/inline-object-empty-entry-slot-refusal.test.ts:203-217` (re-read
immediately before filing — the local reimplementation):
```ts
function registryMessageOf(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: the diagnostics code registry carries no Message row for ${code} — DIAG-4 ` +
        `(docs/spec_topics/diagnostics/diagnostic-shape.md) makes that column this file's only ` +
        `oracle, so a missing row is a loud harness failure, never a skip and never a ` +
        `hard-coded fallback. Bug 0257's §Fix mints NO code: it REUSES ` +
        `theta/parse/malformed-schema-field and theta/parse/empty-schema-body ` +
        `(docs/spec_topics/diagnostics/code-registry-parse.md:99 and ` +
        `docs/spec_topics/diagnostics/code-registry-parse.md:98), amending their ` +
        `Trigger prose in the same commit and changing neither Message`,
    );
  }
  return template;
}
```

`tests/helpers/load-row-harness.ts:111-126` (re-read immediately before
filing — the canonical, already-exported helper):
```ts
export function registryMessageOrThrow(
  registry: readonly RegistryRow[],
  code: string,
  missingRowContext: string,
): string {
  const template = registryMessage(registry, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: the diagnostics code registry carries no Message row for ${code} — DIAG-4 ` +
        `(docs/spec_topics/diagnostics/diagnostic-shape.md) makes that column this file's only ` +
        `oracle, so a missing row is a loud harness failure, never a skip and never a ` +
        `hard-coded fallback. ${missingRowContext}`,
    );
  }
  return template;
}
```

Exact search: `grep -n "^function registryMessageOf(code: string): string {" tests/inline-object-empty-entry-slot-refusal.test.ts` → 1 hit (line 203), the sole in-scope site for this root cause.

## Why this is a problem
The two function bodies are identical apart from the exported helper's third
parameter being inlined as a fixed string literal in the local copy: the
`const template = registryMessage(...)`, the `if (template === undefined)`
guard, the four-line fixed failure-message prefix (`harness: the diagnostics
code registry carries no Message row for ${code} — DIAG-4 …`) and the
`return template;` are byte-identical between the two. The exported helper
was already built to take the caller-specific tail as an explicit third
argument for exactly this purpose (each `b02xx`-style file's own missing-row
context differs), which this file's own tail sentence ("Bug 0257's §Fix mints
NO code…") would drop straight into unchanged. The helper is reachable: this
file already imports `REGISTRY` from a sibling helpers module in the same
`tests/helpers/` directory, and the in-scope sibling test file imports a
different function from `load-row-harness.ts` itself, so the module is one
import line away in both files.

## Suggested direction (non-binding, optional)
The local `registryMessageOf` could call
`registryMessageOrThrow(REGISTRY, code, "Bug 0257's §Fix mints NO code: it REUSES …")`
against the already-exported helper, mirroring the shape the sibling
in-scope file already uses for its own `load-row-harness` import.

## False-positive check
- Gate-pin check: the file does not match `*gate*.test.ts` or the named gate
  kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); the cited
  lines are a message reader, not a pinned count or inventory assertion.
- Recording-double check: not applicable — `registryMessageOf` reads an
  already-produced registry row for a positive assertion; it records no calls
  and backs no "never called" witness.
- docs/bugs/ signature search: `grep -n "registryMessageOf\|registryMessageOrThrow" docs/bugs/0257-empty-inline-object-entry-slot-silently-tolerated.md` → 0 hits; no documented correct-reason red cites this local declaration.
- coverage-matrix/bug-doc citation search: `grep -n "inline-object-empty-entry-slot-refusal" docs/reference/coverage-matrix.md` → 0 hits. The file IS named by path in its own bug document's witness list (`docs/bugs/0257-...md:704,727`); this finding proposes no merge, rename or deletion of the file or any `it()`/`describe()` block — only that the local `registryMessageOf` declaration could call the already-exported `registryMessageOrThrow` — so that citation is unaffected.
- Coverage check: the claim is about a repeated function body, not a missing test path; every cell in the file is exercised by the file's own currently-passing/documented-red assertions untouched by this finding.
- Prior-triage awareness: `quality/TRIAGE_LOG.md` (PTQ-0951 rows) records that a same-shaped throw-bodied local copy was fixed in two OTHER files (`inline-object-stranded-entry-refusal.test.ts`, `inline-object-keyless-entry-refusal.test.ts`) by adding this exact `registryMessageOrThrow` export, and that a residual ~16-17 other files carrying the same inline-guard shape were explicitly left unchased under that specific ticket ("do not chase the other seventeen under this issue") rather than ruled not-a-smell; this file's local declaration is one of that residual set and has not itself been filed under any prior PTQ (`grep -rl "inline-object-empty-entry-slot-refusal" quality/resolved quality/issues quality/intake` shows no prior filing naming this function).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — both excerpts reproduce verbatim (tests/inline-object-empty-entry-slot-refusal.test.ts:1-4 imports raw `registryMessage`, no load-row-harness import; :203-217 local `registryMessageOf` whose `const template`/`if (template === undefined)`/four-line prefix/`return template` body is byte-identical to tests/helpers/load-row-harness.ts:111-126 `registryMessageOrThrow` with `missingRowContext` inlined as the Bug-0257 tail); exact grep → 1 hit at 203, the local is live (4 call sites), the sibling in-scope file already imports from `./helpers/load-row-harness` (truncation.test.ts:3), bug-doc signature grep → 0 and coverage-matrix grep → 0 reproduce, no gate/recording-double carve-out applies; the target shape already exists in the repo — PTQ-0951's fix (9e170f7b) rewrote tests/inline-object-stranded-entry-refusal.test.ts:1,154-158 into a 3-line wrapper over `registryMessageOrThrow(REGISTRY, code, <per-bug tail>)`, and that ticket's human ratification explicitly left the residual throw-shaped copies to be chased per file rather than ruling them not-a-smell (TRIAGE_LOG.md:227); not a duplicate (PTQ-0473 = four-page REGISTRY read, PTQ-0801 = diagLines in this file; no prior ticket names this function here); D7 boilerplate-duplication in tests/ with a mechanical one-import fix (triage: claude-fable-5-1)
