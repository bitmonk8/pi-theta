---
id: PTQ-0523
title: assertSingleLine diagnostic-shape guard reimplemented byte-for-byte in b0348 (and b0300, b0384)
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0348-unknown-frontmatter-field-key-single-line.test.ts:119-128
  - tests/b0300-out-of-range-observed-string-single-line.test.ts:74-82
  - tests/b0384-field-name-diagnostic-single-line.test.ts:158-167
sites: 3                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# assertSingleLine diagnostic-shape guard reimplemented byte-for-byte in b0348 (and b0300, b0384)

## Observation
`tests/b0348-unknown-frontmatter-field-key-single-line.test.ts` declares a
module-level `function assertSingleLine(message: string, label: string): void`
at lines 119-128 that asserts a diagnostic `message` contains no raw U+000A and
no raw U+000D, each with a fixed failure-message string citing
diagnostic-shape.md:34 / placeholder-rendering-b.md:75. The identical function
— same signature, same two `expect(...).toBe(false)` calls, same two literal
failure-message strings — is separately declared in
`tests/b0300-out-of-range-observed-string-single-line.test.ts:74-82` and
`tests/b0384-field-name-diagnostic-single-line.test.ts:158-167`. b0348's own
header states the harness is "modelled on
tests/b0300-out-of-range-observed-string-single-line.test.ts", and b0384's
header states its harness is "modelled on
tests/b0348-unknown-frontmatter-field-key-single-line.test.ts" — each copy
names its predecessor in prose rather than importing it.

## Evidence

`tests/b0348-unknown-frontmatter-field-key-single-line.test.ts:119-128`:
```ts
function assertSingleLine(message: string, label: string): void {
  expect(
    message.includes("\n"),
    `${label}: message must contain NO raw U+000A — a raw LF splits the single-line summary and forges the serialised content format's blank-line / hint-continuation shapes (diagnostic-shape.md:34, placeholder-rendering-b.md:75)`,
  ).toBe(false);
  expect(
    message.includes("\r"),
    `${label}: message must contain NO raw U+000D — the single-line summary admits no carriage return (diagnostic-shape.md:34)`,
  ).toBe(false);
}
```

`tests/b0300-out-of-range-observed-string-single-line.test.ts:74-82` — `diff`
against the excerpt above shows zero differing tokens:
```ts
function assertSingleLine(message: string, label: string): void {
  expect(
    message.includes("\n"),
    `${label}: message must contain NO raw U+000A — a raw LF splits the single-line summary and forges the serialised content format's blank-line / hint-continuation shapes (diagnostic-shape.md:34, placeholder-rendering-b.md:75)`,
  ).toBe(false);
  expect(
    message.includes("\r"),
    `${label}: message must contain NO raw U+000D — the single-line summary admits no carriage return (diagnostic-shape.md:34)`,
  ).toBe(false);
}
```

`tests/b0384-field-name-diagnostic-single-line.test.ts:158-167` — `diff`
against the b0348 excerpt above shows zero differing tokens:
```ts
function assertSingleLine(message: string, label: string): void {
  expect(
    message.includes("\n"),
    `${label}: message must contain NO raw U+000A — a raw LF splits the single-line summary and forges the serialised content format's blank-line / hint-continuation shapes (diagnostic-shape.md:34, placeholder-rendering-b.md:75)`,
  ).toBe(false);
  expect(
    message.includes("\r"),
    `${label}: message must contain NO raw U+000D — the single-line summary admits no carriage return (diagnostic-shape.md:34)`,
  ).toBe(false);
}
```

Exact search: `grep -rl "function assertSingleLine" tests/*.test.ts` returns
exactly these three files and no others; `tests/helpers/` has no file
containing `assertSingleLine` (`grep -rl "assertSingleLine" tests/helpers/`
returns zero hits).

## Why this is a problem
The same eleven-line guard function — two hard-coded `expect(...).toBe(false)`
assertions with two verbatim failure-message strings citing the same two spec
anchors — is retyped byte-for-byte in three separate files rather than drawn
from one shared location. Each later file's own header comment names the
earlier file as the model it copied ("modelled on tests/b0300…", "modelled on
tests/b0348…"), so the repetition is an acknowledged, deliberate copy at
authoring time, not three independent inventions of the same wording.

## Suggested direction (non-binding, optional)
A shared tests/helpers/ export for the diagnostic-shape single-line guard
(covering the `theta/load`/`theta/parse` single-line-summary invariant these
three bug families all witness) is the natural home the three files' repeated
"modelled on" prose already points toward.

## False-positive check
Gate-pin: none of the three files match `*gate*.test.ts` or a listed gate kin;
not a census/pin gate. Recording-double: `assertSingleLine` is a plain
assertion helper over a string value, not a recording double witnessing a
MUST-NOT call — carve-out does not apply. docs/bugs/ signature search:
`docs/bugs/0300-*.md`, `docs/bugs/0348-unknown-frontmatter-field-key-embeds-raw-newline.md`
and `docs/bugs/0384-*.md` all exist and are the behavioural bug docs each
file's cells target; none discusses the `assertSingleLine` duplication itself
as a documented, sanctioned copy. coverage-matrix/bug-doc citation search:
`grep -rn "assertSingleLine" docs/reference/coverage-matrix.md` returns zero
hits — no citation pins this function's shape. This finding proposes no
merge, rename or deletion of any of the three test files (only a shared-helper
direction for one internal function each declares), and it is not a coverage
judgment — it is about a function that already exists three times.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: `function assertSingleLine` is declared byte-identically (mktemp diff of the three extracted bodies: zero differing lines) at b0348:119-128, b0300:74-83 (one-line drift from the cited 74-82) and b0384:158-167, each live with 9-12 in-file callers; `grep -rl "function assertSingleLine" tests/` returns exactly those three files and tests/helpers/ has no hit; the "modelled on tests/b0300…" / "modelled on tests/b0348…" header prose is present as quoted; none of the three is a gate/kin file, the helper is a plain string assertion not a recording double, coverage-matrix.md cites neither the identifier nor the files, and docs/bugs/0300/0348/0384 exist without sanctioning the copy; no open/resolved PTQ references this guard — a D7 boilerplate-duplication class with a mechanical shared-helper dedupe (triage: claude-fable-5-1)
