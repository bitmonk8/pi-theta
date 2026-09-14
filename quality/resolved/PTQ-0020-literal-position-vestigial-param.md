---
id: PTQ-0020
title: checkLiteralSublanguage keeps an ignored _position parameter typed by the single-valued LiteralPosition left over from RFC 0002's retirement of the tool-arg position
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/parser/literal-sublanguage.ts:34-40
  - src/parser/literal-sublanguage.ts:54-58
  - src/parser/params.ts:464
sites: 3                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# checkLiteralSublanguage keeps an ignored _position parameter typed by the single-valued LiteralPosition left over from RFC 0002's retirement of the tool-arg position

## Observation
`LiteralPosition` is a union type with exactly one member, `"default"`.
`checkLiteralSublanguage` takes a `_position: LiteralPosition` parameter whose
underscore name marks it unused; the function body never references it. The
type had two members until RFC 0002 retired the Pi-tool-argument position; the
parameter has been a fixed, ignored `"default"` at every call site since. The
sole production caller and every test caller pass `"default"` — the only value
the type admits.

## Evidence
src/parser/literal-sublanguage.ts:34-40 — the one-member type and its own
retirement note:

```ts
/**
 * Which literal position an expression occupies. RFC 0002 retired the Pi-tool
 * argument position, so `default` (a `params:` frontmatter default RHS →
 * `theta/parse/default-not-literal`) is the sole remaining literal-sublanguage
 * position.
 */
export type LiteralPosition = "default";
```

src/parser/literal-sublanguage.ts:54-58 — the ignored parameter:

```ts
export function checkLiteralSublanguage(
  source: string,
  _position: LiteralPosition,
  site: LiteralCheckSite,
): Diagnostic[] {
```

src/parser/params.ts:464 — the sole production call site:

```ts
      ...checkLiteralSublanguage(field.defaultSource, "default", {
```

Call-site census: grep `checkLiteralSublanguage` across src/, extensions/,
tools/, tests/ — one production site (src/parser/params.ts:464) and test sites
in tests/binder-param-line-newline-normalisation.test.ts:858,910,
tests/e2e-s1-grammar-literal-sublang.test.ts:27,35,44,
tests/params-default-empty-literal-refusal.test.ts:623,630,
tests/params-default-unary-minus-non-numeric-refusal.test.ts:603,
tests/params-default-trailing-residue-refusal.test.ts:383,
tests/type-grammar.test.ts:179,197 — every one passes `"default"` (the type
admits nothing else). `_position` appears nowhere in the function body.

## Why this is a problem
Vestigial parameter with the historical meaning and current mismatch on record:
the parameter existed to distinguish the `params:`-default position from the
Pi-tool-argument position, and commit `780481a8` ("Implement RFC 0002: computed
field values in Pi-tool arguments (v0.5.0)") removed the `"tool-arg"` member
and the tool-arg emission, leaving a one-valued type, an ignored parameter, and
a constant argument threaded through every caller. Every call site passes the
same value AND the value is never read — both halves of the vestigial-parameter
test hold simultaneously.

## Suggested direction (non-binding, optional)
Drop the `_position` parameter (and the now-informationless `LiteralPosition`
type, or fold its RFC 0002 note into the module header) and update the one
production call site and the test callers; the diagnostic code already encodes
the position.

## False-positive check
- Body read: `_position` is referenced only in the signature
  (src/parser/literal-sublanguage.ts:56); grep `_position` in the file — 1 hit.
- Call-site census: grep `checkLiteralSublanguage` across src/, extensions/,
  tools/, tests/ — 1 production call (params.ts:464) + 12 test calls listed
  above; 0 hits in extensions/ and tools/; every call passes `"default"`.
- Type-member census: grep `LiteralPosition` across the repo — the declaration,
  the signature, and type-annotation uses in five test files; grep
  `"tool-arg"` in the file's history shows the second member existed only
  before `780481a8`.
- String-keyed/dynamic access: not applicable to a positional parameter; no
  call spreads an args array into the function (all calls are literal argument
  lists, verified at each site above).
- Test-only-caller carve-out: not applicable — the function itself is
  production-reachable (params.ts:464); the finding is the parameter, which is
  unread everywhere including tests.
- Git-history intent: `git log -S 'LiteralPosition'` on the file →
  `e3ce7c73` (V2a-T) introduced the two-position type; `780481a8` (RFC 0002)
  narrowed it to one member and left the parameter in place; no later commit
  reads it.
- Spec-mandate check: grammar.md's literal sublanguage (per the module header)
  now has exactly one position; no spec obligation names a position parameter.

## Triage
verdict: confirmed — re-verified: `LiteralPosition = "default"` (literal-sublanguage.ts:40) is single-valued and `_position` occurs exactly once in the file, in the signature (:56), with no `arguments`-object read in the body (:54-92); `git show 780481a8` proves the vestige mechanically — that one RFC 0002 commit removed `| "tool-arg"` from the union, renamed `position` → `_position`, and deleted the `: "theta/parse/tool-arg-not-literal"` code-selection branch that was its only reader (that code now appears in src/ only in retirement comments), so both halves hold: every caller passes the same value AND nobody reads it; my own census confirms 1 production call (params.ts:464), 0 hits in extensions/ and tools/, and test call sites in 6 files all supplying `"default"` via `LiteralPosition`-typed constants, with no barrel re-export, no `apply`/spread/`Parameters<>` consumer, and no published `main`/`types`/`exports` entry exposing the type — the test-only-caller carve-out is inapplicable since the function itself is production-reachable and the unread parameter is the subject; no dedupe (store and rejection log empty; d2-01 is `BooleanPosition` in expression-evaluator.ts, d2-04 is `checkTypeLayer`'s `paramsFields`, d2-07 cites :26-29/:597-598 stub narration — all distinct root causes on non-overlapping lines); two immaterial slips in the false-positive prose only ("12 test calls" vs its own enumerated 11; "five test files" vs six) leave the Evidence line citations exact. (triage: claude-opus-5)
