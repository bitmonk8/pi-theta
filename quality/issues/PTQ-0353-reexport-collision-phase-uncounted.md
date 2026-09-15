---
id: PTQ-0353
title: import-static-checks.ts's re-export-resolution comments still say "three ordered phases" / "phases 1-3" after bug 0334 added a fourth, collision-diagnosing phase
lens: D2                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/import-static-checks.ts:23-34
  - src/extension/import-static-checks.ts:597-611
  - src/extension/import-static-checks.ts:835-880
  - src/extension/import-static-checks.ts:886-892
  - src/extension/import-static-checks.ts:1572-1585
sites: 3                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260915044704
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-15
---

# import-static-checks.ts's re-export-resolution comments still say "three ordered phases" / "phases 1-3" after bug 0334 added a fourth, collision-diagnosing phase

## Observation
Three separate comments in `import-static-checks.ts` describe the re-export
chain resolution mechanism (`resolveReExportClosure` and its call site) as
having exactly three ordered phases: collect the re-export closure, settle
the least fixpoint, then diagnose unresolved names. All three name only one
diagnostic code for the "diagnose" step (`theta/parse/import-unknown-symbol`).
The function actually runs a fourth, sequential step after the one the
comments describe — `diagnoseReExportCollisions`, which pushes a second,
different diagnostic code (`theta/parse/import-name-collision`) for a
re-exported name that resolves to two different declaring sites. This fourth
step was added by bug 0334 (commit `595f0b70`, 2026-08-28); none of the three
"three phases" comments were updated for it, including the newest of the
three, written on 2026-09-14 when the mechanism was extracted into its own
top-level function.

## Evidence

**Module header, src/extension/import-static-checks.ts:23-34** — introduced by
commit `2565269d` (2026-08-20), predating bug 0334 by 8 days; states "three
ordered phases" and names exactly one diagnostic code for the diagnose step:
```ts
//   - Re-export chain resolution (imports.md §Re-exports, the resolution
//     paragraph) — three ordered phases over the `export … from` edges reachable
//     from every `.thetalib` the import walk reaches. `closeOverReExports` collects those libs and
//     their edges, resolving each `export` STATEMENT's path once so
//     `theta/load/unresolvable-thetalib-path` fires once over the statement's
//     range, as on the import side. `fixReExportedNames` then computes every
//     collected lib's resolved export set as the LEAST FIXPOINT of the collected
//     file set: seeded with each lib's own declaration names, a re-export's
//     `exported` name is added whenever its source lib's current set carries its
//     `source` name, iterated to stability. Only then is each edge diagnosed: an
//     edge whose `source` is absent from that settled set draws one
//     `theta/parse/import-unknown-symbol` over the SPECIFIER (that code names one
```
This bullet never mentions `diagnoseReExportCollisions` or
`theta/parse/import-name-collision` anywhere in its remaining lines (35-44,
read in full before filing).

**`resolveReExportClosure`'s own doc comment, src/extension/import-static-checks.ts:597-611** —
written by commit `a01c35f1` (2026-09-14, the D9 extraction that gave this
mechanism its own top-level function), 25 days after bug 0334 landed; it
explicitly ties its own "three ordered phases" wording back to the module
header, then goes on, in the same sentence family, to describe FOUR
sequential actions:
```ts
 * The re-export chain fixpoint (imports.md §Re-exports), split out of
 * `checkThetaImports` into its own top-level function so the module header's
 * three ordered phases share one home instead of the caller's:
 * `closeOverReExports` collects the `export … from` closure of every
 * `.thetalib` `walked` reaches, `fixReExportedNames` settles the least
 * fixpoint of the collected file set, and `diagnoseReExports` /
 * `diagnoseReExportCollisions` diagnose an unresolvable re-exported name and a
 * same-name collision resolving to two different declaring sites over that
 * settled result. Takes as explicit parameters exactly what those phases read
 * from `checkThetaImports`'s scope before this split; this phase's own
 * fixpoint state (`libDeclaredNames` / `reExportEdges`) stays internal to it,
 * since nothing outside this phase reads it. Returns the diagnostics the
 * phases push, in the SAME order they pushed before this split (walk every
 * `walked` path first, settle the fixpoint, THEN diagnose unresolved
 * re-exports, THEN diagnose collisions) — the caller appends them to its own
```
Line 599 says "three ordered phases"; lines 609-611 describe "walk ...,
settle the fixpoint, THEN diagnose unresolved re-exports, THEN diagnose
collisions" — four steps, the last two joined by "THEN" rather than folded
into one.

**The fourth step's own diagnostic, src/extension/import-static-checks.ts:835-880** —
`diagnoseReExportCollisions` (defined at line 835) pushes a diagnostic whose
`code` differs from the one bullet/comment above names:
```ts
          if (firstSite === undefined) {
            firstSite = site;
            continue;
          }
          if (site !== firstSite) {
            diagnostics.push({
              severity: "error",
              code: IMPORT_NAME_COLLISION_CODE,
              file: edge.fromLib,
              range: edge.range,
              message: importNameCollisionMessage(edge.exported),
              hint: IMPORT_NAME_COLLISION_HINT,
```

**The real call sequence, src/extension/import-static-checks.ts:886-892** — four
steps run in order, not three:
```ts
  for (const resolvedPath of walked) {
    await closeOverReExports(resolvedPath);
  }
  diagnoseReExports(fixReExportedNames());
  diagnoseReExportCollisions();

  return diagnostics;
}
```

**Call-site comment, src/extension/import-static-checks.ts:1572-1585** —
introduced by the same original commit (`2565269d`, 2026-08-20) as the module
header, labels the call "phases 1–3" and again narrates only collect →
fixpoint → "only then diagnose" (singular):
```ts
  // Re-export chain resolution, phases 1–3 (imports.md §Re-exports): collect the
  // `export … from` closure of every `.thetalib` the import walk reached (`walked`,
  // not only the entry libs — bug 0333's fix — so a re-export fault inside a lib
  // reached only through plain-`import` hops is covered too), settle the fixpoint
  // over the whole collected file set, and only then diagnose. Running it over the
  // union of the whole reached set rather than per lib is what the spec sentence
  // requires — the resolved export set and the errors reported for it are a
  // function of the `.thetalib` file set alone — and a re-export that fails it
  // un-registers the importing theta through the registration-error arm rather
  // than by a second diagnostic sited on the importer's own specifier, whose
  // admission stays on the SYNTACTIC set (`computeThetaLibExports`) above.
  diagnostics.push(
    ...(await resolveReExportClosure(walked, parseThetaLib, probe, resolver, unreadablePaths)),
  );
```

`git blame -L 23,25` / `-L 1572,1573` / `-L 598,599` (all run before filing)
confirm the authorship/dates above: `2565269da` (2026-08-20) for the module
header and call-site comment, `a01c35f15` (2026-09-14) for the extracted
function's own doc comment. `git show 595f0b70b7 -- src/extension/import-static-checks.ts`
confirms bug 0334 (2026-08-28) is the commit that added
`diagnoseReExportCollisions`/`resolveDeclaringSite` and the
`diagnoseReExportCollisions();` call, touching neither the module header nor
the call-site comment.

## Why this is a problem
Three comments describing the same mechanism each state a phase count (three)
and, where they enumerate diagnostics at all, name only one diagnostic code
(`theta/parse/import-unknown-symbol`). The mechanism they describe has run a
fourth phase since bug 0334 (2026-08-28), producing a second, differently-coded
diagnostic (`theta/parse/import-name-collision`) from the same closure state
(`libDeclaredNames` / `reExportEdges`) the three-phase description builds. The
most recent of the three comments (2026-09-14) was written specifically to
give this mechanism its own top-level function — the exact moment a reader
would expect the phase count to be checked and corrected — and instead
re-asserts "three ordered phases" in the same breath as a "THEN...THEN"
description of four steps. A reader who trusts any of the three phase-count
statements to enumerate the mechanism's diagnostic surface will not learn
that a re-export collision draws a second code from this same code path.

## Suggested direction (non-binding, optional)
Update the phase count in all three comments (or fold `diagnoseReExports` and
`diagnoseReExportCollisions` explicitly into one named "diagnose" phase with
two diagnostic codes) so the description matches the four sequential actions
`resolveReExportClosure` already performs and returns in order.

## False-positive check
- Read the module header's whole "Re-export chain resolution" bullet
  (lines 23-44) in full before excerpting: no mention of
  `diagnoseReExportCollisions` or `theta/parse/import-name-collision` anywhere
  in it.
- Read `resolveReExportClosure`'s whole doc comment (lines 596-613) in full:
  confirmed the "THEN diagnose unresolved re-exports, THEN diagnose
  collisions" wording sits two sentences after "three ordered phases" in the
  same comment block.
- `grep -n "diagnoseReExportCollisions\|resolveDeclaringSite\|IMPORT_NAME_COLLISION_CODE"`
  across the file: confirmed both helper functions and the collision code are
  real, live declarations/uses (definition at 793/835, call at 890, code
  import at line 60, diagnostic push at 871-878) — this is a live fourth
  phase, not dead code being wrongly counted.
- `git blame -L 23,25 -- src/extension/import-static-checks.ts`,
  `git blame -L 1572,1573`, and `git blame -L 598,599`: dated the three
  "three phases" statements to `2565269d` (2026-08-20, ×2) and `a01c35f1`
  (2026-09-14, ×1) respectively.
- `git show 595f0b70b7 -- src/extension/import-static-checks.ts`: confirmed
  bug 0334 (2026-08-28, between the two dates above) is the commit that
  introduced `diagnoseReExportCollisions`/`resolveDeclaringSite` and the
  `diagnoseReExportCollisions();` call, and that its diff touches neither the
  module header nor the call-site comment.
- Checked `quality/issues/PTQ-0334-*` and `quality/resolved/PTQ-0334-*`
  (the D9 finding that led to `resolveReExportClosure`'s extraction): it cites
  the module header's "three ordered phases" text only as supporting evidence
  for a function-size/breakdown argument ("saying nothing about why the
  resolution plumbing ... must share this function's body"), not as a claim
  that the phase count itself is wrong or incomplete — a different root cause
  from this filing.
- Searched the intake/issues/resolved topic list for "three ordered phases",
  "phases 1-3", "diagnoseReExportCollisions", and "resolveReExportClosure" in
  a title or body: no prior filing makes this specific claim.
- Not a deadness claim: `resolveReExportClosure`, `diagnoseReExportCollisions`,
  and `IMPORT_NAME_COLLISION_CODE`'s use here are all live, called on every
  `checkThetaImports` pass; this finding is about the comments' phase count
  and diagnostic-code roster, not about any code being unreachable.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — all three "three ordered phases"/"phases 1–3" comments (23-34, 597-611, 1572-1585) and the fourth-step evidence (835-892) verified verbatim at the cited lines; git blame/git show confirm bug 0334 (595f0b70, 2026-08-28) added diagnoseReExportCollisions/IMPORT_NAME_COLLISION_CODE and the fourth sequential call without touching any of the three comments, including the 2026-09-14 extraction doc that still asserts "three ordered phases" two sentences before its own "THEN...THEN" four-step description (triage: claude-opus-5)
