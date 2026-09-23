---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: Both in-scope files redeclare an identical `.theta`-source-builder/parser/body-constant trio instead of sharing one
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - tests/tools-field-shape-refusal.test.ts:199-200
  - tests/tools-field-shape-refusal.test.ts:210-213
  - tests/tools-field-shape-refusal.test.ts:270-273
  - tests/tools-field-zero-entry-scalar-refusal.test.ts:191-194
  - tests/tools-field-zero-entry-scalar-refusal.test.ts:196-197
  - tests/tools-field-zero-entry-scalar-refusal.test.ts:199-202
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260923185337
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# Both in-scope files redeclare an identical `.theta`-source-builder/parser/body-constant trio instead of sharing one

## Observation
Both in-scope files declare the same three-part local harness: a
`BODY_NO_CALL` constant (`"@\`hi\`"`), a `theta(frontmatterLines, body)`
function that joins `["---", ...frontmatterLines, "---", body]` with `"\n"`
and appends a trailing newline, and a `parse(source)` function that calls the
shared `parseFrontmatterSource` with a fixed per-file filename label. The
three declarations are byte-identical between the two files apart from the
filename-label string literal inside `parse`.

## Evidence
`tests/tools-field-shape-refusal.test.ts:199-213`:
```ts
/** A body that names NO callable, so the `tools:` field is the only subject. */
const BODY_NO_CALL = "@`hi`";
...
/** A `.theta` source: `---`, the frontmatter lines, `---`, then the body. */
function theta(frontmatterLines: readonly string[], body: string): string {
  return ["---", ...frontmatterLines, "---", body].join("\n") + "\n";
}
```

`tests/tools-field-shape-refusal.test.ts:270-273`:
```ts
/** Parse a whole `.theta` source through the shipped frontmatter reader. */
function parse(source: string): FrontmatterParseResult {
  return parseFrontmatterSource(source, undefined, "bug0104.theta");
}
```

`tests/tools-field-zero-entry-scalar-refusal.test.ts:191-202` — the same
trio, in a different declaration order, identical bodies apart from the
filename literal:
```ts
/** Parse a whole `.theta` source through the shipped frontmatter reader. */
function parse(source: string): FrontmatterParseResult {
  return parseFrontmatterSource(source, undefined, "bug0206.theta");
}

/** A body that names NO callable, so the `tools:` field is the only subject. */
const BODY_NO_CALL = "@`hi`";

/** A `.theta` source: `---`, the frontmatter lines, `---`, then the body. */
function theta(frontmatterLines: readonly string[], body: string): string {
  return ["---", ...frontmatterLines, "---", body].join("\n") + "\n";
}
```

Search performed: `grep -n "function theta(frontmatterLines: readonly string\[\], body: string)" tests/*.test.ts` returns exactly these two sites; no other in-repo file declares this signature.

## Why this is a problem
The two files already import shared fixtures from `tests/helpers/e2e-s1` and
`tests/helpers/production-load-harness` for the rest of their harness (both
files' `beforeAll`/registry-read/outcome-map layers were previously
deduplicated onto canonical helpers per PTQ-0723/PTQ-0724/PTQ-1360). This
trio is the one remaining local harness fragment left behind in both files:
each file independently declares and maintains the same
source-shape-and-parse convention, so a change to either (e.g. the trailing
newline behaviour, or the body-naming convention) has to be made twice to
stay in sync, and nothing enforces that the two copies stay identical beyond
manual re-reading.

## Suggested direction (non-binding, optional)
Naming the natural home as observation, not design: neither
`tests/helpers/e2e-s1.ts`'s exported `theta(...frontmatterLines)` (fixed
`"@\`hello\`"` body, no trailing newline) nor
`tests/helpers/production-load-harness.ts`'s exported
`theta(...lines)` (variadic, no body/frontmatter split) matches this file
pair's `theta(frontmatterLines, body)` signature today; a shared
`tests/helpers/` export with that signature is where both copies point.

## False-positive check
Gate-pin check: neither file matches `*gate*.test.ts` or its kin; not
applicable. Recording-double check: `theta`/`parse`/`BODY_NO_CALL` are plain
fixture builders, not recording doubles witnessing a MUST-NOT call; not
applicable. docs/bugs/ signature search: `grep -rn "theta(frontmatterLines"
docs/bugs/` returns no hits — no documented correct-reason red cites this
declaration. coverage-matrix/bug-doc citation search: both test files are
cited by name as witnesses in `docs/bugs/0104-...md:936` and
`docs/bugs/0206-...md:394`, but this finding does not propose merging,
renaming or deleting either test file — only its internal helper
declarations — so the citation does not block filing. Coverage: this finding
does not assert a path is untested; it observes duplicated code that exists
in both files today.

## Triage
verdict: questionable — facts check out: the BODY_NO_CALL/theta/parse excerpts are at the cited lines and a mktemp diff finds only the `bug0104`/`bug0206` label differing; the `function theta(frontmatterLines` grep returns exactly these 2 files. But one of the three pieces is not a real dedupe target. `parse` is a one-line label binder over the canonical e2e-s1 `parseFrontmatterSource`. Resolved PTQ-1390's fix (d3bf3e19) left it in exactly this shape. Removing it would mean passing the per-file label at 12 call sites, so this part re-files a fix's final form. What remains is a 3-line joiner plus a 1-line constant. That joiner is already covered by production-load-harness's variadic `theta("---", ...fm, "---", body)`. The qw20260922211400 reviewer explicitly left it unfiled as too weak (REVIEW_LOG:766), and an earlier filing ruled it duplicate of PTQ-0469, whose fix never took in these sites. PTQ-0782 confirmed a similar 2-file joiner. A human should rule whether this small residual justifies a fix (triage: claude-opus-5-5)
