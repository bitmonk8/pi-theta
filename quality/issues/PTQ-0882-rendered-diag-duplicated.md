---
id: PTQ-0882
title: rendered() and diag() in inline-object-field-name-case.test.ts duplicate schema-field-name-case.test.ts's functions of the same name
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/inline-object-field-name-case.test.ts:248-273
  - tests/schema-field-name-case.test.ts:207-232
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# rendered() and diag() in inline-object-field-name-case.test.ts duplicate schema-field-name-case.test.ts's functions of the same name

## Observation
Both files declare a `rendered(doc: ThetaDocument): string[]` that renders
every diagnostic as `` `${severity} ${code}: ${message} @${range}` `` (with
the identical `r === undefined ? "-" : ...` range fallback), and a `diag(...)`
builder taking the same six positional parameters and producing that exact
string template. Both function bodies, including their doc comments, are
byte-identical between the two files.

## Evidence

`tests/inline-object-field-name-case.test.ts:248-273`:
```ts
function rendered(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => {
    const r = d.range;
    const at =
      r === undefined
        ? "-"
        : `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
    return `${d.severity} ${d.code}: ${d.message} @${at}`;
  });
}

/**
 * One expected diagnostic in `rendered`'s form. Every span this file asserts is
 * single-line, so the row reads `line, startColumn, endColumn` with the end
 * column exclusive.
 */
function diag(
  severity: "error" | "warning",
  code: string,
  message: string,
  line: number,
  startColumn: number,
  endColumn: number,
): string {
  return `${severity} ${code}: ${message} @${line}:${startColumn}-${line}:${endColumn}`;
}
```

`tests/schema-field-name-case.test.ts:207-232` (byte-identical, own `diff` of
the two extracted 26-line blocks shows zero output):
```ts
function rendered(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => {
    const r = d.range;
    const at =
      r === undefined
        ? "-"
        : `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
    return `${d.severity} ${d.code}: ${d.message} @${at}`;
  });
}

/**
 * One expected diagnostic in `rendered`'s form. Every span this file asserts is
 * single-line, so the row reads `line, startColumn, endColumn` with the end
 * column exclusive.
 */
function diag(
  severity: "error" | "warning",
  code: string,
  message: string,
  line: number,
  startColumn: number,
  endColumn: number,
): string {
  return `${severity} ${code}: ${message} @${line}:${startColumn}-${line}:${endColumn}`;
}
```

Exact search: `grep -n "^function rendered(doc: ThetaDocument): string\[\]" tests/*.test.ts` returns exactly these two files; `grep -n "^function diag(" tests/*.test.ts` returns these two files plus `tests/system-note-channel.test.ts:92`, whose `diag(file, line, column)` builds a `Diagnostic` object with an unrelated signature and is not part of this duplication.

## Why this is a problem
`rendered()` and `diag()` are pure diagnostic-list/diagnostic-line rendering
helpers with no domain-specific content — the whole-list-rendering shape
(`severity code: message @range`) and the single-diagnostic-line shape it is
compared against are declared, with identical doc comments, independently in
each file. A change to the rendered format (e.g. adding a diagnostic's
`namespace`, or changing the range's undefined fallback) would need the
identical six-parameter builder and eight-line map edited by hand at both
sites.

## Suggested direction (non-binding, optional)
A `tests/helpers/` export of `rendered(doc)` and `diag(severity, code,
message, line, startColumn, endColumn)` is the natural home the two
byte-identical copies point at.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named
  gate-kin patterns.
- Recording-double check: `rendered`/`diag` format an already-produced
  diagnostics array into comparable strings; they record no call and back no
  "never called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "function rendered\|function diag"
  docs/bugs/*.md` returns no hits — no documented correct-reason red names
  either function or states a rationale for two independent copies.
- coverage-matrix/bug-doc citation search: `grep -n
  "inline-object-field-name-case\.test\.ts\|schema-field-name-case\.test\.ts"
  docs/reference/coverage-matrix.md` returns no hits. Both files are cited by
  name in docs/bugs/ witness lists (0154, 0149, 0227, 0233, 0245, 0249, 0257,
  0274 among others), always for the diagnostic-emission behaviour under
  test, never for where the `rendered`/`diag` rendering code lives. This
  finding proposes no merge, rename, or deletion of either file or any
  `it()`/`describe()` — only that the duplicated rendering helpers could be
  shared.
- Coverage check: the claim is about repeated helper-function code; both
  copies are exercised by every `it()` in their own file that calls
  `rendered()` or a `bcm()`-style wrapper over `diag()` today.
- Prior-filing overlap check: `grep -rl "function rendered\|inline-object-field-name-case\|schema-field-name-case"
  quality/intake quality/issues quality/resolved` (before this filing) shows
  PTQ-0502 (fixed) covering these two files' `RegistryRow`/`REGISTRY`/`msg`
  block — a disjoint declaration set from `rendered`/`diag` — and PTQ-0753
  naming both files only for a different function (`registers`); neither
  filing's evidence block cites `rendered` or `diag`.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: sed-extracted tests/inline-object-field-name-case.test.ts:248-273 and tests/schema-field-name-case.test.ts:207-232 diff to zero (26-line `rendered()`+`diag()` block byte-identical; only the doc-comment line above `rendered`, outside the cited range, differs "emission"/"report order"); stated greps reproduce (2 `rendered(doc: ThetaDocument)` hits, `^function diag(` = these two + system-note-channel.test.ts:92's unrelated Diagnostic-object builder; docs/bugs `function rendered|function diag` → 0; coverage-matrix → 0); both copies live (`expect(rendered(` throughout each file, `diag()` wrapped by `bcm()` at :281/:236 and :915); both under tests/, D7 boilerplate-duplication class, neither a gate file, no recording double, no merge/rename/delete proposed; not a duplicate — resolved PTQ-0502/0508 cover these files' RegistryRow/REGISTRY/msg block with 0 mentions of rendered/diag, and open PTQ-0522/0592 are different file pairs with a different JSON-payload `render` shape and no `diag()` expected-row builder; tests/helpers/e2e-s1.ts#diagLines carries no range so no existing export serves these sites (triage: claude-fable-5-1)
