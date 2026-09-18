---
id: PTQ-0973
title: match-arm-scope-inference-pass.test.ts redeclares e2e-s1's at()/render() helpers locally while already importing parseDoc from the same module
lens: D7
status: open
verdict: confirmed
locations:
  - tests/match-arm-scope-inference-pass.test.ts:31
  - tests/match-arm-scope-inference-pass.test.ts:320-333
  - tests/helpers/e2e-s1.ts:127-138
sites: 1
fix_scope: localized
d4_class: clone
wave: qw20260918131151
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# match-arm-scope-inference-pass.test.ts redeclares e2e-s1's at()/render() helpers locally while already importing parseDoc from the same module

## Observation
`tests/match-arm-scope-inference-pass.test.ts` imports `parseDoc` from
`./helpers/e2e-s1` (line 31), but declares its own module-scope `at(r:
SourceRange)` and `render(doc: ThetaDocument)` functions rather than
importing the same names from that module. `tests/helpers/e2e-s1.ts` already
exports `at` and `render` with logic byte-identical to the file's local
copies (differing only in doc-comment wording).

## Evidence
tests/match-arm-scope-inference-pass.test.ts:31 (re-read immediately before
filing):
```ts
import { parseDoc } from "./helpers/e2e-s1";
```

tests/match-arm-scope-inference-pass.test.ts:320-333 (re-read immediately
before filing):
```ts
function at(r: SourceRange): string {
  return `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
}

/** Every diagnostic rendered `severity code @range: message` — failure payload. */
function render(doc: ThetaDocument): string {
  return JSON.stringify(
    doc.diagnostics.map((d: Diagnostic) => {
      const r = d.range;
      return `${d.severity} ${d.code} @${r === undefined ? "-" : at(r)}: ${d.message}`;
    }),
  );
}
```

tests/helpers/e2e-s1.ts:127-138 (re-read immediately before filing) — the
already-exported, logic-identical versions:
```ts
/** A source range rendered as `l:c-l:c`. */
export function at(r: SourceRange): string {
  return `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
}

/** Every diagnostic rendered `severity code @l:c-l:c: message` — failure payload. */
export function render(doc: ThetaDocument): string {
  return JSON.stringify(
    doc.diagnostics.map((d: Diagnostic) => {
      const r = d.range;
      return `${d.severity} ${d.code} @${r === undefined ? "-" : at(r)}: ${d.message}`;
    }),
  );
}
```

Exact command run: `diff <(sed -n '128,129p' tests/helpers/e2e-s1.ts) <(sed -n '320,322p' tests/match-arm-scope-inference-pass.test.ts)` shows the two function bodies differ only in the `export` keyword and template-literal punctuation position, not in behaviour; both compute
`${line}:${col}-${line}:${col}` from the same fields. `render`'s bodies are
identical statement-for-statement (`JSON.stringify` over
`doc.diagnostics.map`, same ternary on `d.range`, same template).

Search performed for the local-redeclaration pattern this file exhibits:
`grep -rl "^function at(r: SourceRange)" tests/*.test.ts` → 5 files
(tests/fn-arg-member-read-proof.test.ts, tests/fn-arg-type-mismatch-wired.test.ts,
tests/fn-call-arity-unchecked.test.ts, tests/let-arm-withhold-binding-scoped.test.ts,
and the in-scope tests/match-arm-scope-inference-pass.test.ts). This finding
files only the in-scope file, whose case is sharpened by its own line-31
import already reaching into `./helpers/e2e-s1` for `parseDoc`.

## Why this is a problem
The file already has a live import path into `tests/helpers/e2e-s1.ts` (used
for `parseDoc`), and that same module already exports `at` and `render` with
logic identical to the file's local copies at lines 320-333. The local
copies are not a divergent variant the file needs — they compute the exact
same range-to-string and diagnostic-to-string mappings the exported
functions compute — so importing two more names from an import statement the
file already has would require no new dependency.

## Suggested direction (non-binding, optional)
Importing `at` and `render` alongside the existing `parseDoc` import from
`./helpers/e2e-s1` is the natural next step the file's own existing import
statement already points at.

## False-positive check
- Gate-pin check: `match-arm-scope-inference-pass.test.ts` is not a
  `*gate*.test.ts` file and asserts no pinned count/inventory this finding
  touches.
- Recording-double check: `at`/`render` format strings for failure
  messages and precondition renders; neither records a call or backs a
  "never called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "match-arm-scope-inference-pass"
  docs/bugs/*.md` → hits 0145, 0369, 0395, each citing the file only as a
  behavioural witness; none discusses the `at`/`render` helper block or
  gives a documented correct-reason for keeping local copies.
- coverage-matrix/bug-doc citation search: `grep -n
  "match-arm-scope-inference-pass.test.ts" docs/reference/coverage-matrix.md`
  → 0 hits. This finding proposes no merge, rename, or deletion of the file
  or any `it()`/`describe()` name — only that two locally-declared helper
  functions could be imported from a module the file already imports from.
- Coverage check: the claim is about a repeated helper-function
  DEFINITION already exported elsewhere and already imported from (for a
  third name) by this very file; no test path or assertion changes.
- Prior-finding search: `grep -rl "match-arm-scope-inference-pass"
  quality/issues quality/resolved quality/intake` → PTQ-0468 (resolved,
  registry-page read), PTQ-0805 (resolved, `fill()` placeholder
  interpolation), and PTQ-0816 (open, `NOOP_CHECKPOINT`/`rootDouble`/`producer`
  runtime doubles) — none of the three cites the `at`/`render` block at lines
  320-333 or the module's existing `parseDoc` import from `./helpers/e2e-s1`;
  this is a distinct root cause from all three.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim at tests/match-arm-scope-inference-pass.test.ts:31,320-333 and tests/helpers/e2e-s1.ts:128-139, the local `at`/`render` bodies are statement-identical to the exports (only the doc-comment differs), both local copies are live (8 `at(` / 7 `render(` call sites) and shadow exports of a module the file's own :31 import already draws `parseDoc` from, the file is 48/48 green, the 5-file `^function at(r: SourceRange)` grep, docs/bugs (0145/0369/0395 witness-only), coverage-matrix (0) and quality/ filename (PTQ-0468/0805/0816) searches all reproduce, both locations under tests/, D7 boilerplate-duplication class, not a gate file, not a recording double, no merge/rename/delete proposed; not a duplicate — e2e-s1 only gained `at`/`render` on 2026-09-18 (1e96ddd3, wave qw20260918075903 fix), after the local copies landed (eceeaf11, 2026-08-21) and after open PTQ-0522 was filed, and PTQ-0522's locations are fn-call-arity-unchecked + fn-param-annotation-optional (its triage note predates the export and says none existed), so no open or resolved PTQ names this file's `at`/`render` block and the same-wave siblings d7-01/d7-02 cite this file's Expectation/one()/two() and fnArg()/letRhs() blocks, not this one; accounting note for acceptance: `sites: 1` is the wave's in-scope scoping — the identical local `at()` recurs in three untracked files that also import from ./helpers/e2e-s1 (fn-arg-member-read-proof, fn-arg-type-mismatch-wired, let-arm-withhold-binding-scoped) plus PTQ-0522's fn-call-arity-unchecked; fold the three into this issue's location list (or fix all five with PTQ-0522 as one mechanical import swap) (triage: claude-fable-5-1)
