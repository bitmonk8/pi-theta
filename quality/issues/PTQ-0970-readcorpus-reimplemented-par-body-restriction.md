---
id: PTQ-0970
title: par-body-restriction-registry-rows.test.ts re-derives readFileSync+fileURLToPath as a local readCorpus instead of importing tests/helpers/corpus-reader.ts's fail-loud reader
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/par-body-restriction-registry-rows.test.ts:121-130
  - tests/par-body-restriction-registry-rows.test.ts:216
  - tests/helpers/corpus-reader.ts:18-42
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized           # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918131151
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# par-body-restriction-registry-rows.test.ts re-derives readFileSync+fileURLToPath as a local readCorpus instead of importing tests/helpers/corpus-reader.ts's fail-loud reader

## Observation
`tests/par-body-restriction-registry-rows.test.ts` declares its own
module-scope `function readCorpus(relative: string): string`, built directly
from `readFileSync` + `fileURLToPath(new URL("../" + relative,
import.meta.url))`, and uses it to read all five markdown pages this file's
harness needs (the four sharded registry pages, joined into `REGISTRY_TEXT`,
and the mirror page `docs/reference/diagnostics.md` into `MIRROR_TEXT`).
`tests/helpers/corpus-reader.ts` already exports a `readCorpus(rel, owner)`
covering exactly this "resolve a repo-relative path off `import.meta.url` and
read it as UTF-8" job, wrapped in a fail-loud guard that names the unmet
precondition on an unreadable or empty read rather than letting
`readFileSync`'s own generic `ENOENT` surface. At least thirteen sibling
test files in `tests/` already import that helper (aliased to
`readSharedCorpus`) and wrap it in a one-line local `readCorpus(rel)` that
forwards to it with an `owner` string; this file imports neither the helper
nor that wrapper pattern.

## Evidence

`tests/par-body-restriction-registry-rows.test.ts:121-130` — the local,
from-scratch reimplementation:
```ts
const REGISTRY_TEXT = REGISTRY_PAGES.map((page) =>
  readCorpus(`docs/spec_topics/diagnostics/${page}`),
).join("\n");

function readCorpus(relative: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../${relative}`, import.meta.url)),
    "utf8",
  );
}
```
`tests/par-body-restriction-registry-rows.test.ts:216` — the same local
function's second call site, on the mirror page:
```ts
const MIRROR_TEXT = readCorpus(MIRROR_PAGE);
```

`tests/helpers/corpus-reader.ts:18-42` — the canonical, already-exported
equivalent, re-read immediately before filing:
```ts
/** A repo-relative path (e.g. `docs/spec_topics/foo.md`), resolved to an absolute path. */
export const repoFile = (rel: string): string =>
  fileURLToPath(new URL(`../../${rel}`, import.meta.url));

/**
 * Read a corpus file. A missing or empty file is a HARNESS failure that names
 * the unmet precondition and throws — never a skip, never an early return —
 * because the file is the calling oracle's only source and a degraded read
 * would report success while verifying nothing. `owner` names, in the calling
 * file's own words, why this corpus file is that oracle's sole source.
 */
export function readCorpus(rel: string, owner: string): string {
  let text: string;
  try {
    text = readFileSync(repoFile(rel), "utf8");
  } catch (cause) {
    throw new Error(
      `harness precondition unmet: ${rel} is unreadable, and it is ${owner} — a missing corpus file is a loud failure, never a skip (${String(cause)})`,
    );
  }
  if (text.trim() === "") {
    throw new Error(`harness precondition unmet: ${rel} is empty; nothing to score`);
  }
  return text;
}
```

The already-migrated sibling pattern, e.g.
`tests/b0403-unary-minus-message-registry-divergence.test.ts:1,103-105`:
```ts
import { linesOf, readCorpus as readSharedCorpus } from "./helpers/corpus-reader";
...
function readCorpus(rel: string): string {
  return readSharedCorpus(rel, "this oracle's only source for the bug 0403 surface it owns");
}
```

Exact search: `grep -n "^import" tests/par-body-restriction-registry-rows.test.ts`
returns eight import lines, none of them `./helpers/corpus-reader`.
`grep -rl "readCorpus as readSharedCorpus" tests/*.test.ts` returns 13 files
(`b0403-unary-minus-message-registry-divergence`, `b0404-custom-type-unsafe-note-matrix-row`, `b0405-grammar-cite-sweep-gate`, `b0452-render-fail-refusal-note-matrix-row-coverage`, `b0455-details-partition-count-consistency-gate`, `b0456-imports-cite-content-anchor-gate`, `fn-param-annotation-optional`, `match-fn-return-lub-dominating-discipline`, `nonstring-literal-union-emission-subs3`, `rfc-0009-spec-surface-gate`, `rfc-0010-spec-surface-gate`, `ternary-common-type-trigger-adjudication`, `unresolvable-operand-structural-target-adjudication`)
that follow the wrap-and-forward pattern above; the reviewed file is not
among them.

## Why this is a problem
`tests/helpers/corpus-reader.ts`'s own header states its reason for existing:
`repoFile`/`readCorpus`/`linesOf` "were redefined, byte-for-byte apart from
the bug number named inside the thrown message, in several
`b02xx`/`b04xx` spec-gate test files (PTQ-0208)", and the module was created
to centralise them. Thirteen sibling files subsequently migrated onto it,
each keeping a one-line local wrapper that supplies its own `owner` string.
`tests/par-body-restriction-registry-rows.test.ts`'s local `readCorpus`
reproduces the same "resolve a repo-relative path, read it as UTF-8" job the
helper already centralises, but without the helper's fail-loud empty-file
guard and without the helper's named-precondition wrapping on an unreadable
file — a missing page here surfaces as `readFileSync`'s own generic Node
`ENOENT`, and an empty page passes through as an empty string with no
harness-level complaint, rather than either failing with the message this
file's own harness posture (its own "NO SILENT SKIPPING" comment block)
otherwise commits to for every other precondition in the file.

## Suggested direction (non-binding, optional)
`tests/helpers/corpus-reader.ts` already exports the `readCorpus(rel, owner)`
this file's own local function re-derives; importing it (aliased, as the
thirteen sibling files do) and forwarding through a one-line local wrapper
with this file's own `owner` string is the migration path those siblings
already establish.

## False-positive check
- Gate-pin check: `tests/par-body-restriction-registry-rows.test.ts` does
  not match `*gate*.test.ts` or the named gate kin; nothing cited is a
  pinned count or inventory assertion — the claim is about where a file-read
  helper is defined.
- Recording-double check: `readCorpus` reads static markdown text off disk
  and returns/throws; it records no calls and backs no MUST-NOT-called
  witness.
- docs/bugs/ signature search: `grep -n "readCorpus" docs/bugs/0200-*.md`
  (this file's own bug document, matched by filename stem) → 0 hits; no open
  bug document defends a local, unguarded corpus reader for this file.
  `npx vitest run tests/par-body-restriction-registry-rows.test.ts` passes
  in full at HEAD — not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "par-body-restriction-registry-rows" docs/reference/coverage-matrix.md` →
  0 hits. This finding proposes no merge, rename, or deletion of any test or
  `it()`/`describe()` cell, only that the local `readCorpus` definition could
  import the existing helper — no cited witness is disturbed.
- Coverage check: the claim is about a repeated harness DEFINITION already
  centralised in `tests/helpers/corpus-reader.ts` (resolved `PTQ-0208`), not
  about a missing test path; every call site cited is exercised by this
  file's own passing tests.
- Prior-finding overlap check: resolved `PTQ-0208`'s own Evidence and Scope
  sections cite only `tests/b0117-panic-namespace-scoping-gate.test.ts` and
  `tests/b0265-panic-scoping-remnant-surfaces-gate.test.ts` as reviewed, and
  name `tests/par-body-restriction-registry-rows.test.ts` only inside its
  own "17 files" pattern-wide `grep` count, not as a cited Evidence location
  — so this file's own un-migrated copy was never itself the subject of a
  filed-and-resolved finding. `grep -rli "readcorpus" quality/issues
  quality/intake quality/resolved` was run and the only hits naming this
  file's path are `PTQ-0208` (as above) and `PTQ-0648`/`PTQ-0649`/`PTQ-0805`,
  none of which cite this file's `readCorpus` definition in their own
  Evidence sections.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: the local `readCorpus` reproduces byte-for-byte at tests/par-body-restriction-registry-rows.test.ts:125-130 with its two call sites at :121-123 and :216, and `readFileSync`/`fileURLToPath` (:3-4) have no other use in the file; tests/helpers/corpus-reader.ts:18-42 exports the equivalent `readCorpus(rel, owner)` whose header names PTQ-0208 centralisation as its purpose, path resolution is equivalent (`../../` off tests/helpers/ vs `../` off tests/ both reach the repo root), and 13 sibling tests import it aliased with a one-line owner-string wrapper (count reproduces); this file's copy was in PTQ-0208's 17-file grep only, outside that filing's b0117/b0265 scope, and resolved PTQ-0649 explicitly carved it out as "a distinct declaration"; no open issue names this file (only open readcorpus hits PTQ-0845/0924/0936 cite other locations); not a gate file, no recording double, docs/bugs/0200 → 0 readCorpus hits, coverage-matrix → 0, `npx vitest run` 6/6 green at HEAD — D7 boilerplate duplication with a mechanical import-and-wrap fix; note the "silent skip" framing is weaker than stated (ENOENT throws at module load; an empty page reds at `shardedCells`/`mirrorRow`), but the duplication anchor stands on its own (triage: claude-fable-5-1)
