---
id: PTQ-0555
title: Both generic-argument-* files redeclare the FM/theta()/paramsSrc() frontmatter-fixture builder found verbatim in six sibling files
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/generic-argument-bracket-group-truncation.test.ts:352-361
  - tests/generic-argument-inline-field-key-rules.test.ts:307-316
  - tests/inline-object-empty-entry-slot-refusal.test.ts:340-357
sites: 3
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# Both generic-argument-* files redeclare the FM/theta()/paramsSrc() frontmatter-fixture builder found verbatim in six sibling files

## Observation
Both files in scope declare an identical three-piece fixture builder: a
`FM` constant holding the fixed three-line `mode: subagent` frontmatter
fence, a `theta(stmt)` function that wraps a body statement in that
frontmatter, and a `paramsSrc(block)` function that builds a whole theta
whose `params:` block is the caller's text. The `FM` constant and `theta()`
function are byte-identical between the two in-scope files and reproduce,
also byte-identical, in `tests/inline-object-empty-entry-slot-refusal.test.ts`
and five further siblings; `paramsSrc()` reproduces with the same body and a
renamed parameter. No `tests/helpers/` module exports this builder; both
files already import `parseDoc` from `tests/helpers/e2e-s1.ts` in the same
import block.

## Evidence
tests/generic-argument-bracket-group-truncation.test.ts:352-361:
```ts
/** Frontmatter for every `.theta` body row — occupies lines 1–3, body starts at 4. */
const FM = "---\nmode: subagent\n---\n";

function theta(stmt: string): string {
  return `${FM}${stmt}\n`;
}

/** A `mode: subagent` theta whose `params:` block is `block` (the key on line 4). */
function paramsSrc(block: string): string {
  return `---\nmode: subagent\nparams:\n${block}\n---\n1\n`;
}
```

tests/generic-argument-inline-field-key-rules.test.ts:307-316 — reverified
byte-identical via `diff <(sed -n '352,361p' generic-argument-bracket-group-truncation.test.ts) <(sed -n '307,316p' generic-argument-inline-field-key-rules.test.ts)` → no output:
```ts
/** Frontmatter for every `.theta` body row — occupies lines 1–3, body starts at 4. */
const FM = "---\nmode: subagent\n---\n";

function theta(stmt: string): string {
  return `${FM}${stmt}\n`;
}

/** A `mode: subagent` theta whose `params:` block is `block` (the key on line 4). */
function paramsSrc(block: string): string {
  return `---\nmode: subagent\nparams:\n${block}\n---\n1\n`;
}
```

tests/inline-object-empty-entry-slot-refusal.test.ts:340-357 — the `FM`
constant and `theta()` function body are byte-identical to the two excerpts
above (only the JSDoc phrasing and `paramsSrc`'s parameter name differ):
```ts
/** Frontmatter for every `.theta` body row — occupies lines 1–3, body starts at 4. */
const FM = "---\nmode: subagent\n---\n";

/** A `mode: subagent` theta whose body is `stmt`. */
function theta(stmt: string): string {
  return `${FM}${stmt}\n`;
}
```

Pattern-wide search: `grep -rl '^function theta(stmt: string): string {$' tests/*.test.ts` → 8 files: the two in scope plus
`inline-object-empty-entry-slot-refusal.test.ts`,
`inline-object-empty-field-type-truncation.test.ts`,
`inline-object-keyless-entry-refusal.test.ts`,
`inline-object-malformed-entry-resync.test.ts`,
`inline-object-stranded-entry-refusal.test.ts`,
`inline-object-stray-close-token-split.test.ts`. Separately,
`grep -rl '^function paramsSrc(' tests/*.test.ts | wc -l` → 24 files.

## Why this is a problem
`tests/helpers/e2e-s1.ts` is the established shared home this repository
already uses for parse-driver plumbing (`parseDoc`, `diagLines`, `diagCodes`,
`frontmatterOnlyDoc`, and other `ThetaDocument`-shaped helpers), and both
files in scope already import from it. `FM`/`theta()`/`paramsSrc()` are the
same size and purpose as those existing exports (small, pure, one-line-body
fixture builders over a fixed `mode: subagent` frontmatter) but have no
counterpart there, so at least 8 files each carry an independent byte-for-byte
copy of `theta()` and 24 carry a `paramsSrc()` variant instead of one shared
definition.

## Suggested direction (non-binding, optional)
`tests/helpers/e2e-s1.ts` already hosts `frontmatterOnlyDoc`, a sibling
fixture builder over the same `mode: subagent` frontmatter shape, naming a
natural home for `theta()`/`paramsSrc()` beside it.

## False-positive check
- Gate-pin: neither in-scope file matches `*gate*.test.ts` or the named kin
  (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate).
- Recording-double: `theta()`/`paramsSrc()`/`FM` build source strings from
  caller-supplied text; they record no calls and back no "never called"
  assertion, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "paramsSrc" docs/bugs/0236*
  docs/bugs/0233*` → 0 files. Neither bug document this pair witnesses states
  a rationale for redeclaring the fixture builder locally.
- coverage-matrix/bug-doc citation search: `grep -n
  "generic-argument-bracket-group-truncation\|generic-argument-inline-field-key-rules"
  docs/reference/coverage-matrix.md` → 0 hits; this finding proposes no
  change to any `it()`/`describe()` name, count, or assertion, only to where
  the fixture-string builder is defined.
- Coverage check: the claim is entirely about a repeated harness DEFINITION,
  not a missing test path; every copy is exercised by the tests in its own
  file.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: `diff` of bracket-group-truncation:352-361 vs inline-field-key-rules:307-316 is empty (FM/theta()/paramsSrc() byte-identical); fixed-string grep finds the FM constant in 8 tests/*.test.ts and `function theta(stmt: string)` in the same 8 (7 with the identical `${FM}${stmt}\n` body, stray-close inlines the same fence), `^function paramsSrc(` in 24 files with the in-scope `mode: subagent … ${block} … 1` body exact in 4; no tests/helpers export theta/paramsSrc/FM (e2e-s1.ts:124 frontmatterOnlyDoc is the nearest sibling) and all three cited files already import parseDoc from e2e-s1; neither in-scope file is a gate, coverage-matrix 0 hits, only one bug-doc line pin below the harness block (0282 → bracket-group:877), both suites 19/19 green; minor over-claim noted (site-3 paramsSrc wraps `p: '${type}'`, not merely a renamed parameter) does not touch the root cause; not tracked by any PTQ (0205/0227/0214/0239/0405 cite other helpers), and same-wave intake siblings d7-02-inline-object-empty (Cell/expectGroup bundle, other files), d7-03 (theta(...lines) planted-fixture builder) and d7-70 (FM/TAIL/body, let-annotation pair) are distinct root causes — same confirmed D7 copy-paste-fixture class as PTQ-0205 (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
