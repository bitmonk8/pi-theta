---
id: PTQ-0252
title: binder-prompt-all-break-description-hint-empty-line.test.ts redefines the ONE_INTEGER_FIELD/source()/Cell/cell() harness already written as Row/row() in binder-prompt-description-hint-line-forgery.test.ts
lens: D7                     # D2 | D7 — the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/binder-prompt-all-break-description-hint-empty-line.test.ts:73-129
  - tests/binder-prompt-description-hint-line-forgery.test.ts:67-121
sites: 2                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# binder-prompt-all-break-description-hint-empty-line.test.ts redefines the ONE_INTEGER_FIELD/source()/Cell/cell() harness already written as Row/row() in binder-prompt-description-hint-line-forgery.test.ts

## Observation
tests/binder-prompt-all-break-description-hint-empty-line.test.ts declares its own `ONE_INTEGER_FIELD` constant, `RAW_ARGUMENTS`/`THETA_NAME` constants, a `source(frontmatterFragment)` fixture builder, a `Cell` result interface, and a `cell(frontmatterFragment)` parse-then-build function. Each of these is byte-identical (module the `Cell`/`Row` and `cell`/`row` renames and one error-message string) to the `ONE_INTEGER_FIELD`/`RAW_ARGUMENTS`/`THETA_NAME`/`source()`/`Row`/`row()` quintet already written in tests/binder-prompt-description-hint-line-forgery.test.ts. The later file's own doc comment on `cell()` names the earlier-written file as this block's origin: "Mirrors the bug 0103 witness's harness (`tests/binder-prompt-description-hint-line-forgery.test.ts:100`)."

## Evidence

tests/binder-prompt-all-break-description-hint-empty-line.test.ts:73-81:
```ts
const ONE_INTEGER_FIELD: readonly SystemPromptParamField[] = [
  { wireName: "p", type: "integer", requirement: { kind: "required" } },
];

/** The raw slash text item 5's line carries, on every cell. */
const RAW_ARGUMENTS = "real args";

/** The bare command name item 1's line carries, on every cell. */
const THETA_NAME = "t";
```

tests/binder-prompt-description-hint-line-forgery.test.ts:67-75 — the same three declarations, byte-identical apart from "cell" → "row" in the comments:
```ts
const ONE_INTEGER_FIELD: readonly SystemPromptParamField[] = [
  { wireName: "p", type: "integer", requirement: { kind: "required" } },
];

/** The raw slash text item 5's line must carry, on every row. */
const RAW_ARGUMENTS = "real args";

/** The bare command name item 1's line must carry, on every row. */
const THETA_NAME = "t";
```

tests/binder-prompt-all-break-description-hint-empty-line.test.ts:84-93 — `source()` and the result shape:
```ts
function source(frontmatterFragment: string): string {
  return `---\nmode: prompt\n${frontmatterFragment}params:\n  p: integer\n---\n\nlet x = 1\n`;
}

interface Cell {
  readonly prompt: string;
  readonly description: string | undefined;
  readonly argumentHint: string | undefined;
  readonly diagnostics: readonly Diagnostic[];
}
```

tests/binder-prompt-description-hint-line-forgery.test.ts:81-90 — the same `source()` body byte-identical, and the same four fields under a different interface name:
```ts
function source(frontmatterFragment: string): string {
  return `---\nmode: prompt\n${frontmatterFragment}params:\n  p: integer\n---\n\nlet x = 1\n`;
}

interface Row {
  readonly prompt: string;
  readonly description: string | undefined;
  readonly argumentHint: string | undefined;
  readonly diagnostics: readonly Diagnostic[];
}
```

tests/binder-prompt-all-break-description-hint-empty-line.test.ts:98-105 — the doc comment on `cell()`, naming its origin:
```ts
/**
 * Parse one source through the real front end, then build the prompt exactly
 * as the sole production caller does — `fm.description` and `fm.argumentHint`
 * spread verbatim onto the builder input. Nothing between the parser and the
 * builder is mocked, so the rendering this file asserts has to hold inside the
 * builder to satisfy it. Mirrors the bug 0103 witness's harness
 * (`tests/binder-prompt-description-hint-line-forgery.test.ts:100`).
 */
```

tests/binder-prompt-all-break-description-hint-empty-line.test.ts:116-129 — the body of `cell()` past its guard clause:
```ts
  const prompt = buildBinderSystemPrompt({
    name: THETA_NAME,
    ...(fm.description !== undefined ? { description: fm.description } : {}),
    ...(fm.argumentHint !== undefined ? { argumentHint: fm.argumentHint } : {}),
    params: [...ONE_INTEGER_FIELD],
    rawArguments: RAW_ARGUMENTS,
  });
  return {
    prompt,
    description: fm.description,
    argumentHint: fm.argumentHint,
    diagnostics: doc.diagnostics,
  };
}
```

tests/binder-prompt-description-hint-line-forgery.test.ts:108-121 — the same lines in `row()`, byte-identical:
```ts
  const prompt = buildBinderSystemPrompt({
    name: THETA_NAME,
    ...(fm.description !== undefined ? { description: fm.description } : {}),
    ...(fm.argumentHint !== undefined ? { argumentHint: fm.argumentHint } : {}),
    params: [...ONE_INTEGER_FIELD],
    rawArguments: RAW_ARGUMENTS,
  });
  return {
    prompt,
    description: fm.description,
    argumentHint: fm.argumentHint,
    diagnostics: doc.diagnostics,
  };
}
```

Both files also independently declare an identical `codesOf` arrow function
(`tests/binder-prompt-all-break-description-hint-empty-line.test.ts:95-96`,
`tests/binder-prompt-description-hint-line-forgery.test.ts:144-145`):
```ts
const codesOf = (diagnostics: readonly Diagnostic[]): string[] =>
  diagnostics.map((d) => d.code);
```

Search: `grep -rl "ONE_INTEGER_FIELD" tests --include="*.test.ts"` → 3 files:
these two, plus tests/live/live-production-acceptance.test.ts, whose only hit
is a comment referencing "this file's own bug 0102/0125 `ONE_INTEGER_FIELD`
convention" — it defines no matching `source()`/`Cell`-or-`Row`/`cell()`-or-
`row()` block of its own. The declaration/interface/function quintet quoted
above is confined to exactly the two files cited in `locations`.

## Why this is a problem
This is the "Boilerplate duplication" class: one fixture harness — a one-field
`params:` `.theta` source builder, its parsed-and-rendered result shape, and
the parse-then-build function returning it — is written twice rather than
shared, and the later-authored file's own doc comment states outright which
file it mirrors. `tests/helpers/` (`e2e-s1.ts`, `theta-corpus.ts`, and 17 other
modules) holds no module that builds a one-field `.theta` source or drives
`parseDoc` + `buildBinderSystemPrompt` together, which is why each file
re-derives the whole harness locally instead of importing it — the two copies
diverge only in the interface/function name (`Cell`/`cell` vs `Row`/`row`) and
the wording of one thrown error message.

## Suggested direction (non-binding, optional)
tests/helpers/ already holds one module per shared fixture/oracle shape
(`e2e-s1.ts` for `parseDoc`, `theta-corpus.ts` for the committed-corpus
sweep, …); a module exporting this one-field-params source builder and the
parse-then-build function is the kind of home that convention already points
at — this names where the duplicated code already points, not a design for
the extraction.

## False-positive check
- Gate-pin carve-out: neither file matches `*gate*.test.ts` or the named kin
  (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); not
  applicable.
- Recording-double carve-out: `cell()`/`row()` build and return a rendered
  prompt string for the calling test to inspect; neither records calls nor
  backs a "never called" assertion, so the negative-witness carve-out does not
  apply.
- docs/bugs/ signature search: the two files' subjects are
  docs/bugs/0209-binder-description-hint-all-break-value-emits-labelled-empty-line.md
  (Status: fixed, 0.143.0) and
  docs/bugs/0103-binder-description-argument-hint-lines-forgeable-by-newline.md
  (Status: fixed, 0.131.0). `npx vitest run
  tests/binder-prompt-all-break-description-hint-empty-line.test.ts
  tests/binder-prompt-description-hint-line-forgery.test.ts` passes 13/13 and
  15/15 at HEAD, so neither is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "binder-prompt-all-break-description-hint-empty-line\|binder-prompt-description-hint-line-forgery"
  docs/reference/coverage-matrix.md` → 0 hits. This finding does not propose
  merging, renaming or deleting either test file — only that the shared
  harness pieces could be imported rather than redefined — so no citation is
  affected.
- Pervasive-convention check: this suite widely reuses a "mirrors <sibling>"
  convention for per-bug harnesses across many files (this wave's own recent
  triage rejected two broader findings — `rootDouble`/`parseDeps`-shaped
  harnesses recurring in 79–90+ files — on exactly that "pervasive,
  established convention" ground). The `ONE_INTEGER_FIELD`/`source()`/
  `Cell`-or-`Row`/`cell()`-or-`row()` quintet under review here is different in
  kind from those: it is confined to exactly the two files cited (the
  `ONE_INTEGER_FIELD` search above returns 3 hits total, one of them a
  comment-only reference), not a suite-wide idiom repeated across dozens of
  unrelated files, so the pervasive-convention defense that has defeated the
  broader findings does not extend to this narrower, two-file, byte-identical
  block.
- Coverage check: the claim is about a harness DEFINITION repeated across two
  files, not a missing test path; every cited function is exercised by the
  tests in its own file.

## Triage
verdict: confirmed — every excerpt (ONE_INTEGER_FIELD/RAW_ARGUMENTS/THETA_NAME, source(), Cell/Row, codesOf, cell()/row() body) reproduces byte-for-byte at the cited lines in both files, the ONE_INTEGER_FIELD search returns exactly these 2 definition sites (+1 comment-only hit), confirming this is narrow rather than the pervasive dozens-of-files convention that defeated prior rejections; both bug docs are fixed with vitest reproducing 13/13 and 15/15 green, coverage-matrix.md has 0 hits, and no gate/negative-witness carve-out or existing PTQ covers this pair (triage: claude-opus-5)
