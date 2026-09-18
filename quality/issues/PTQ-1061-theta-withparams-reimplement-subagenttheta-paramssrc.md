---
id: PTQ-1061
title: inline-object-field-name-case.test.ts's local theta()/withParams() retype e2e-s1's exported subagentTheta/subagentParamsSrc string templates
lens: D7
status: open
verdict: confirmed
locations:
  - tests/inline-object-field-name-case.test.ts:230-245
  - tests/helpers/e2e-s1.ts:385-395
  - tests/inline-object-empty-field-type-truncation.test.ts:8
sites: 2
fix_scope: localized
d4_class: clone
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# inline-object-field-name-case.test.ts's local theta()/withParams() retype e2e-s1's exported subagentTheta/subagentParamsSrc string templates

## Observation
`tests/helpers/e2e-s1.ts` exports two `mode: subagent` fixture-string
builders: `subagentTheta(stmt)` returns `` `${SUBAGENT_FM}${stmt}\n` `` where
`SUBAGENT_FM = "---\nmode: subagent\n---\n"`, and `subagentParamsSrc(block)`
returns `` `---\nmode: subagent\nparams:\n${block}\n---\n1\n` ``. This
review's OTHER in-scope file,
`tests/inline-object-empty-field-type-truncation.test.ts`, already imports
both under aliases (`subagentTheta as theta, subagentParamsSrc as paramsSrc`)
and uses them as its own fixture builders. `tests/inline-object-field-name-case.test.ts`
instead declares its own local `const FM` plus a local `theta(body)` and a
local `withParams(block)`, each building the byte-identical string template
inline and passing it straight to `parseDoc`, rather than importing either
canonical export.

## Evidence

`tests/helpers/e2e-s1.ts:385-395` (the canonical exports, re-read
immediately before filing):
```ts
const SUBAGENT_FM = "---\nmode: subagent\n---\n";

/** A `mode: subagent` theta whose body is `stmt`. */
export function subagentTheta(stmt: string): string {
  return `${SUBAGENT_FM}${stmt}\n`;
}

/** A `mode: subagent` theta whose `params:` block is `block` (the key on line 4). */
export function subagentParamsSrc(block: string): string {
  return `---\nmode: subagent\nparams:\n${block}\n---\n1\n`;
}
```

`tests/inline-object-empty-field-type-truncation.test.ts:8` (the sibling
in-scope file importing both under aliases):
```ts
import { expectGroup as expectGroupShared, type DiagnosticCell, parseDoc, subagentTheta as theta, subagentParamsSrc as paramsSrc } from "./helpers/e2e-s1";
```

`tests/inline-object-field-name-case.test.ts:230-245` (the local
re-derivation, re-read immediately before filing):
```ts
const FM = "---\nmode: subagent\n---\n";

/** Parse `body` as a `.theta` under the standard frontmatter. */
function theta(body: string): ThetaDocument {
  return parseDoc(`${FM}${body}\n`);
}

/**
 * Parse a `.theta` whose frontmatter carries a `params:` block. `block` is the
 * indented key line, so the key sits on source line 4 — `---` (1),
 * `mode: subagent` (2), `params:` (3), the key (4) — and its VALUE node starts
 * at column 6 under a two-space indent and a one-character name.
 */
function withParams(block: string): ThetaDocument {
  return parseDoc(`---\nmode: subagent\nparams:\n${block}\n---\n1\n`);
}
```
`FM` is character-for-character `SUBAGENT_FM`; `theta`'s
`` `${FM}${body}\n` `` is character-for-character `subagentTheta`'s
`` `${SUBAGENT_FM}${stmt}\n` ``; `withParams`'s
`` `---\nmode: subagent\nparams:\n${block}\n---\n1\n` `` is
character-for-character `subagentParamsSrc`'s return expression. The only
difference at either call site is that the local versions pipe the string
straight into `parseDoc` before returning, where the exports hand back the
raw string for the caller to parse (exactly as
`tests/inline-object-empty-field-type-truncation.test.ts`'s own `lines(src,
path)` wrapper does at its call sites).

## Why this is a problem
The two frontmatter templates this file needs — a bare `mode: subagent`
fence and a `mode: subagent` fence carrying a `params:` block — are
byte-identical to the two the module already exports, and the review's own
sibling in-scope file demonstrates the working import shape for exactly
these two names. A change to the shared subagent fixture (for example,
adding a required field to the frontmatter) would need to be hand-applied to
this file's two local copies independently of the canonical helper and of
every other file that already imports `subagentTheta`/`subagentParamsSrc`,
with nothing keeping the retyped copies in step.

## Suggested direction (non-binding, optional)
`tests/helpers/e2e-s1.ts`'s exported `subagentTheta`/`subagentParamsSrc`,
already imported by this review's sibling in-scope file under the same
`theta`/`paramsSrc` aliases this file's local functions occupy, are the
natural source for `theta`/`withParams`'s bodies (`parseDoc(subagentTheta(body))`
and `parseDoc(subagentParamsSrc(block))`) rather than two locally retyped
string templates.

## False-positive check
- Gate-pin check: `tests/inline-object-field-name-case.test.ts` does not
  match `*gate*.test.ts` or the named gate-kin patterns; the cited lines are
  fixture-string builders, not a pinned count or inventory.
- Recording-double check: not applicable — `theta`/`withParams` build a
  source string and parse it; neither records calls nor witnesses a
  "never called" claim.
- docs/bugs/ signature search: `grep -n "subagentTheta\|subagentParamsSrc"
  docs/bugs/0154-inline-object-type-field-name-rules-unenforced.md` → 0
  hits; the bug doc states no rationale for locally retyped fixture
  builders.
- coverage-matrix/bug-doc citation search: `grep -n
  "inline-object-field-name-case" docs/reference/coverage-matrix.md` → 0
  hits. This finding proposes no change to any `it()`/`describe()` name,
  count, or assertion — only to where the two string templates are sourced
  from.
- Overlap check: `grep -rl "subagentTheta\|subagentParamsSrc"
  quality/issues/*.md quality/resolved/*.md quality/intake/*.md` finds
  PTQ-0765, PTQ-0767, PTQ-0981, PTQ-0986, PTQ-0996, PTQ-1014, PTQ-1017 and
  resolved PTQ-0482, PTQ-0932 — each targeting a different file or a
  different reimplemented helper (a minimal fixture builder in three
  `tests/live/discovery-*` cells, a `noopPi`/child-env-scrub bypass, or
  `diagLines`); none of their `locations:` frontmatter lists
  `tests/inline-object-field-name-case.test.ts`, so this is a distinct,
  previously unfiled pair of sites for the same reimplementation class, not
  a duplicate.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim at the cited lines (e2e-s1.ts:385-395 exports, field-name-case :230-245 local `FM`/`theta`/`withParams`, truncation :8 aliased import); `FM` equals `SUBAGENT_FM` and both local template literals are character-identical to the exports' return expressions (a `grep -F` for the params template `mode: subagent\nparams:\n${block}\n---\n1\n` across tests/ hits exactly these two files); both local copies are live (37 `theta(` / 6 `withParams(` call sites) and the file imports `parseDoc`/`diag`/`rendered` from e2e-s1 but neither subagent builder; git lineage settles it as not-migrated rather than design: the local pair was born 28c730ad (2026-08-21, bug-0154 fix) and the exports were hoisted in e54a42b3 (2026-09-18, qw20260918131151 fix wave) which migrated five inline-object siblings (empty-entry-slot, keyless-entry, malformed-entry-resync, stranded-entry, stray-close-token-split) and skipped this one; stated FP-check searches re-run — bug doc 0154 → 0, coverage-matrix → 0, file is not a gate, no recording double or red-test carve-out, no `it()` rename proposed; not a duplicate: none of the 7 open/2 resolved rows naming `subagentTheta`/`subagentParamsSrc` (PTQ-0765/0767/0981/0986/0996/1014/1017, PTQ-0482/0932) nor the 7 rows citing this file (PTQ-0753/0755/0759/0776-03, PTQ-0502/0727-02/0882) touch `FM`/`theta`/`withParams`; note for the fixer only: the bare `FM` literal also recurs uncited in 9 other tests/*.test.ts (b0337, b0342, construct-token-table-tails, invoke-prompt-cell-enum-return, five subagent-* files), which does not refute this file's pair but means the class is wider than `sites: 2` (triage: claude-fable-5-1)
