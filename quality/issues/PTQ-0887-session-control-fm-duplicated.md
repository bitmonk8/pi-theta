---
id: PTQ-0887
title: A `fm(tools)` frontmatter-fence builder for `mode subagent` is redeclared near-identically in two session-control-*.test.ts files
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/session-control-parse.test.ts:54-61
  - tests/session-control-static-checks.test.ts:199-201
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# A `fm(tools)` frontmatter-fence builder for `mode subagent` is redeclared near-identically in two session-control-*.test.ts files

## Observation
Both `tests/session-control-parse.test.ts` and
`tests/session-control-static-checks.test.ts` declare a module-scope
function named `fm` that builds a `---\nmode: subagent\n...---\n` frontmatter
fence string with an optional/required `tools:` line inserted from the
argument. For the case both files actually exercise (`tools` supplied), the
two functions produce byte-identical output; `session-control-parse.test.ts`'s
version additionally makes the parameter optional to also cover the
no-`tools:`-field cells (I10, X-control) that file's rows need.

## Evidence

`tests/session-control-parse.test.ts:54-61` (re-read immediately before
filing):
```ts
/** Frontmatter fence declaring `mode: subagent` and the given `tools:` entries (short form). */
function fm(tools?: string): string {
  const lines = ["---", "mode: subagent"];
  if (tools !== undefined) {
    lines.push(`tools: ${tools}`);
  }
  lines.push("---", "");
  return lines.join("\n");
}
```

`tests/session-control-static-checks.test.ts:199-201`:
```ts
function fm(tools: string): string {
  return ["---", "mode: subagent", `tools: ${tools}`, "---", ""].join("\n");
}
```

Exact search: `grep -n "^function fm(" tests/session-control-*.test.ts` returns exactly these two hits (`tests/session-control-parse.test.ts:55`, `tests/session-control-static-checks.test.ts:199`); the other two in-scope files (`session-control-dispatch.test.ts`, `session-control-callable-set.test.ts`) build their frontmatter fences inline as array-joined literals at each call site instead of through a named `fm` helper, and are not part of this duplication.

## Why this is a problem
Both functions exist to produce the same `mode: subagent` frontmatter fence
with a `tools:` line for the same RFC 0011 test batch (both files carry the
`RFC 0011 (V24a-T)` header and cross-reference each other's scope in their
own comments), and for every call site where `tools` is supplied the two
bodies emit the identical string. A change to the fence shape these RFC 0011
cells assume (e.g. adding a required frontmatter field) would need to be
hand-applied at both declarations.

## Suggested direction (non-binding, optional)
No `tests/helpers/` module currently exports a `mode: subagent` frontmatter-
fence builder; `session-control-parse.test.ts`'s optional-parameter form
already covers the shape both files need.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate kin; no pinned count or inventory is touched.
- Recording-double check: `fm` builds a plain source string with no call tracking and backs no "never called" witness; not applicable.
- docs/bugs/ signature search: `grep -rln "function fm(tools" docs/bugs/*.md` returns no hits; neither file's own RED/GREEN narration (both are RFC 0011 seam-sheet witness files) states a rationale tied to this specific helper's duplication.
- coverage-matrix/bug-doc citation search: `grep -n "session-control-parse\.test\|session-control-static-checks\.test" docs/reference/coverage-matrix.md` returns no hits. This finding proposes no merge, rename, or deletion of any file, `it()`, or `describe()` — only that the duplicated fence builder could be shared.
- Coverage check: this finding is about a repeated helper-function DEFINITION that exists in both files today; every call site of each local `fm` is already exercised by that file's own RFC 0011 cells.
- Prior-filing overlap check: `grep -rl "function fm(tools" quality/intake quality/issues quality/resolved` before filing finds no existing finding citing this pairing.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: both excerpts reproduce (tests/session-control-parse.test.ts:54-61, one-line drift from the cited 55; tests/session-control-static-checks.test.ts:199-201 exact); `grep -n "^function fm(" tests/session-control-*.test.ts` → exactly these two hits, and a node re-execution of both bodies confirms byte-identical output for every tools-supplied form (`compact`, `compact, context_usage`, `context_usage as cu`), the parse copy differing only by the optional no-`tools:` arm its I10/X-control cells use (fm() at :167/:218); both copies are live (11 and 6 `fm(` call sites), both under tests/, D7 copy-paste-fixture/boilerplate class; both headers carry `RFC 0011 (V24a-T)` and static-checks:9 cross-references the parse file as claimed; the dispatch/callable-set siblings build fences inline (callable-set:425/484) so are correctly excluded; no tests/helpers module exports a `tools:`-parametrised subagent fence (e2e-s1's `frontmatterOnlyDoc` takes a raw frontmatter string; package-merge/thetalib-load helpers build `mode: prompt` fences); stated docs/bugs, coverage-matrix and prior-filing searches all reproduce at zero hits; no gate/recording-double/red-test carve-out; not a duplicate of PTQ-0555 (that tracks the fixed no-`tools:` FM/theta()/paramsSrc() triad, whose fix would not serve these `fm("compact")` sites) — a mechanical dedupe of one helper (triage: claude-fable-5-1)
