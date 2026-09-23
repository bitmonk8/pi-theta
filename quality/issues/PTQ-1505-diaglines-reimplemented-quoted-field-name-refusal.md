---
id: PTQ-1505
title: inline-object-quoted-field-name-refusal.test.ts hand-rolls diagLines despite the canonical e2e-s1 export
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/inline-object-quoted-field-name-refusal.test.ts:13,246-248
  - tests/helpers/e2e-s1.ts:448-454
sites: 1
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260923203928
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# inline-object-quoted-field-name-refusal.test.ts hand-rolls diagLines despite the canonical e2e-s1 export

## Observation
`tests/helpers/e2e-s1.ts` exports `diagLines(source)`, which renders every
diagnostic of a `ThetaDocument`/`FrontmatterParseResult`/diagnostic array as
`` `${severity} ${code}: ${message}` `` in emission order. `tests/inline-object-quoted-field-name-refusal.test.ts`
imports `atEveryPosition, parseDoc, typePositions` from that same helper module
but not `diagLines`, and instead declares its own module-scope `diagLines(doc)`
function a few lines later whose body is the identical rendering logic. The
local copy is the one every `lines()` call in the file routes through.

## Evidence
`tests/inline-object-quoted-field-name-refusal.test.ts:13` (the import that
omits `diagLines`):
```ts
import { atEveryPosition, parseDoc, typePositions } from "./helpers/e2e-s1";
```

`tests/inline-object-quoted-field-name-refusal.test.ts:246-248` (the local
reimplementation, immediately used by `lines()` at :250-251):
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

function lines(src: string, path = "bug0176.theta"): string[] {
  return diagLines(parseDoc(src, path));
}
```

`tests/helpers/e2e-s1.ts:448-454` (the canonical export, already imported
elsewhere in this same file's sibling `inline-object-nested-lowering.test.ts`
via `import { …, diagLines } from "./helpers/e2e-s1"`):
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
export function diagLines(
  source: ThetaDocument | FrontmatterParseResult | readonly Diagnostic[],
): string[] {
  const diags = "diagnostics" in source ? source.diagnostics : source;
  return diags.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

The two bodies produce identical strings for a `ThetaDocument` argument: both
map each diagnostic to `${d.severity} ${d.code}: ${d.message}`. The local copy
differs only in accepting `ThetaDocument` alone rather than the exported
function's wider `ThetaDocument | FrontmatterParseResult | readonly Diagnostic[]`
union, which this file never needs since every call site passes a
`ThetaDocument` from `parseDoc`.

## Why this is a problem
The file already imports three other functions from `./helpers/e2e-s1` in the
same statement, so the omission of `diagLines` is not a missing-module
problem — the export is one name away. The local copy is a second place this
exact rendering rule (severity, code, message, colon-joined) can drift from
the shared one; the sibling file in the same review scope,
`tests/inline-object-nested-lowering.test.ts`, already imports `diagLines`
from `e2e-s1` directly (its own prior local copy was removed under
PTQ-0802), so the two files in this pair now disagree on where this one
rendering rule lives.

## Suggested direction (non-binding, optional)
The natural home for this rendering rule is the already-exported
`tests/helpers/e2e-s1.ts#diagLines`, which this file could import alongside
its existing `atEveryPosition, parseDoc, typePositions` import.

## False-positive check
Gate-pin check: the file is not `*gate*.test.ts` or a named gate kin, so the
census/pin carve-out does not apply. Recording-double check: `diagLines` is a
pure rendering function over already-produced diagnostics, not a
call-recording double, so the negative-witness carve-out does not apply.
docs/bugs/ signature search: `grep -rn "diagLines" docs/bugs/*.md` returns 0
hits, so no documented correct-reason-red is at stake. coverage-matrix/bug-doc
citation search: `grep -n "inline-object-quoted-field-name-refusal"
docs/reference/coverage-matrix.md` returns 0 hits; this finding proposes no
merge, rename or deletion of any `it()`/`describe()`, only that the module-scope
`diagLines`/`lines()` pair could import the existing helper instead of
redeclaring it, so no citation is affected. Prior-filing overlap check:
`grep -rl "inline-object-quoted-field-name-refusal" quality/intake quality/issues quality/resolved`
finds PTQ-0488 (registry read), PTQ-0827 (msg/registryMessageOf), PTQ-0843
(atEveryPosition/positions), PTQ-1466 (ajv/capturingAjv, resolved/fixed — the
file now imports `capturingAjv as ajv` at :12) and PTQ-0104 (comment-only
mention) — none of these cite the `diagLines` declaration at :246-248 or its
line range. PTQ-0801 and PTQ-0802 are the two existing `diagLines`-reimplemented
filings nearest this file; PTQ-0801 cites `inline-object-empty-entry-slot-refusal.test.ts`
and `inline-object-empty-field-type-truncation.test.ts`, PTQ-0802 cites
`inline-object-malformed-entry-resync.test.ts` and (this scope's own sibling)
`inline-object-nested-lowering.test.ts` — confirmed fixed: `grep -n "function diagLines"
tests/inline-object-nested-lowering.test.ts` today returns 0 hits, and the file
imports `diagLines` from `./helpers/e2e-s1` at line 21. Neither filing names
`inline-object-quoted-field-name-refusal.test.ts`. Pattern-wide search:
`grep -rl "function diagLines" tests --include="*.test.ts"` returns 14 test
files carrying a local declaration today (this file among them); the other 13
are outside this review's scope and are named here only as a routing note, not
as additional sites of this filing.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — the claim reproduces. tests/inline-object-quoted-field-name-refusal.test.ts:13 imports `atEveryPosition, parseDoc, typePositions` from ./helpers/e2e-s1 but not `diagLines`, and :245-248 declares a local `diagLines(doc: ThetaDocument)` whose map body `${d.severity} ${d.code}: ${d.message}` is the same as the exported e2e-s1.ts:448-454 for a ThetaDocument argument. `lines()` (:250-252) is its only caller, so the local copy is live. This is D7 boilerplate duplication inside tests/ only. It is not a gate file, involves no recording double, changes no it()/describe(), and `diagLines` has no docs/bugs citation. The sibling inline-object-nested-lowering.test.ts:21 now imports the shared helper after the PTQ-0802 fix. Dedupe is clean: resolved PTQ-0801/0802 name other files, open PTQ-1487/1398/1315 cite other files, and the only issue that names this file together with diagLines (PTQ-1492) is about `malformedFieldLine` in inline-empty-object-type. The fix is a mechanical import swap, the same one done for PTQ-0802/1487 (triage: claude-opus-5-5)
