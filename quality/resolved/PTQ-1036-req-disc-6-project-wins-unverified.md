---
id: PTQ-1036
title: The REQ-DISC-6 "project wins" test only proves the name registered once, never which source won
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/e2e-s5-package-discovery-composition-root.test.ts:57-69
  - tests/e2e-s5-package-discovery-composition-root.test.ts:95-102
  - src/extension/factory.ts:307-318
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# The REQ-DISC-6 "project wins" test only proves the name registered once, never which source won

## Observation
The test titled "REQ-DISC-6: a project theta shadows a same-name package
theta (walk cross-source-shadow: project wins)" plants a project-side and a
package-side `.theta` file under the identical slash name
(`shadowme-e2e-s5`) with byte-identical content (`CLEAN_THETA` in both
places), runs the production compose helper, and asserts only that the
resulting `registered` array contains that name exactly once. Because both
candidates share the same name and the same content, and the composition
root's public `ThetaFixture` return shape carries no source attribution
(`slashName`, `description`, `run` only), nothing this test reads can
distinguish "the project copy won" from "the package copy won" — both
outcomes produce an identical `registered` array.

## Evidence
`tests/e2e-s5-package-discovery-composition-root.test.ts:57-62` (re-read
immediately before filing) — the two candidates are planted with identical
content and the identical slash name:
```ts
  // Package C + a same-name PROJECT theta — the project copy claims the slash
  // name in the walk, so the composition-root merge does NOT add the package
  // copy (project > packages priority; registered exactly once).
  plant(join(nm, "dupe-e2e-s5", "package.json"), JSON.stringify({ name: "dupe-e2e-s5", version: "1.0.0" }));
  plant(join(nm, "dupe-e2e-s5", "theta", "shadowme-e2e-s5.theta"), CLEAN_THETA);
  plant(join(workspaceDir, ".pi", "theta", "shadowme-e2e-s5.theta"), CLEAN_THETA);
```

`tests/e2e-s5-package-discovery-composition-root.test.ts:95-102` — the only
assertion the test makes, which reads cardinality alone:
```ts
  it("REQ-DISC-6: a project theta shadows a same-name package theta (walk cross-source-shadow: project wins)", () => {
    const hits = registered.filter((n) => n === "shadowme-e2e-s5");
    expect(
      hits,
      "the same-name theta must register exactly once — the walk's cross-source-shadow resolution keeps the higher-priority project copy and drops the package copy. Registered: " +
        JSON.stringify(registered),
    ).toHaveLength(1);
  });
```

`src/extension/factory.ts:307-318` — the public `ThetaFixture` shape
`discoverAndComposeFixtures` (and hence `runProductionLoad`'s `registered`
list, built as `fixtures.map((f) => f.slashName)` in
`tests/helpers/production-load-harness.ts:88`) returns, showing no field that
could name which source a given fixture came from:
```ts
export interface ThetaFixture {
  /** The slash-command name this theta registers under. */
  readonly slashName: string;
  /**
   * The theta's `description:` frontmatter, passed to `pi.registerCommand` so it
   * populates the slash-command autocomplete entry (frontmatter-fields-a.md).
   * Absent when the theta declares no (non-empty) `description:`.
   */
  readonly description?: string;
  /** The command body, run by the registered slash handler on dispatch. */
  readonly run: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
}
```

Because the two planted files are byte-identical (`CLEAN_THETA` at both
`:61` and `:62`) and register under the same name, even the fixture's `run`
behaviour cannot discriminate which file supplied it. If a regression in the
walk's cross-source-shadow resolution swapped the winner — the package copy
registering instead of the project copy — `hits` would still equal exactly
one entry named `shadowme-e2e-s5`, and this test would stay green.

## Why this is a problem
The test's name and its own inline comment assert a specific, directional
claim — "the project copy... project wins" / "keeps the higher-priority
project copy and drops the package copy" — but the only observable the body
reads (`registered`, a flat list of slash names) cannot certify that
direction; it can only certify that the walk did not register the shadowed
name twice. A reader relying on the test's name to mean "if the priority
rule ever inverted, this test would catch it" would be misled: the priority
inversion and the correct behaviour render an identical `registered` array
under this fixture, so the assertion is blind to exactly the regression its
own name describes.

## Suggested direction (non-binding, optional)
Distinguishing content between the project and package copies (or reading a
source-attributing field the production composition root already computes
internally, e.g. `sourcePath`, before it is narrowed to `ThetaFixture`) is
the kind of change that would let the assertion see the direction its name
claims; that is a design decision for the fix stage, not specified here.

## False-positive check
- Gate-pin check: `tests/e2e-s5-package-discovery-composition-root.test.ts`
  does not match `*gate*.test.ts` or the named gate kin
  (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate).
- Recording-double check: `registered` is a plain array built from
  `fixtures.map((f) => f.slashName)`, not a recording double backing a
  MUST-NOT-called witness; this finding is about what the array can and
  cannot prove, not about a negative-witness assertion.
- docs/bugs/ signature search: `grep -rn "shadowme-e2e-s5\|REQ-DISC-6"
  docs/bugs/*.md` returns 0 hits — no open bug report names this test or
  its subject as a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "e2e-s5-package-discovery-composition-root" docs/reference/coverage-matrix.md`
  returns 0 hits; this finding proposes no merge, rename, or deletion of the
  test — only that its existing assertion does not verify the directional
  claim its own name and comment make.
- Coverage check: this is not a claim that a test should exist for the
  missing direction; it is a claim about what the EXISTING assertion in this
  EXISTING test body can and cannot observe, which is squarely the
  misleading-name class, not a coverage gap.
- Prior-filing overlap check: `grep -rn "REQ-DISC-6\|shadowme-e2e-s5\|project theta shadows"
  quality/issues quality/resolved quality/intake` (before filing) returned no
  hits — no existing candidate or resolved finding covers this test's
  cardinality-only assertion.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim (test :57-62 plants `CLEAN_THETA` byte-identically under `node_modules/dupe-e2e-s5/theta/` and `.pi/theta/` as the same `shadowme-e2e-s5` stem; :95-102's sole expect is `toHaveLength(1)` on a name filter; factory.ts:307-318 `ThetaFixture` = `slashName`/`description?`/`run`), `discoverAndComposeFixtures` returns `Promise<readonly ThetaFixture[]>` (production-composition.ts:540) and `runProductionLoad` reshapes that to `registered: fixtures.map((f) => f.slashName)` (production-load-harness.ts:88), so `sourcePath` never reaches the test and a swapped winner yields the identical `registered` array — the `it` title's directional "project wins" clause (echoed by the :57-59 comment and the :16-18 header) is not checkable by this body, only the cardinality clause is; D7 misleading-name class per precedents PTQ-0784/0791/0968/1013 (title asserts what the body cannot observe), and the src/ cite is supporting evidence not the smell site (as in confirmed D7 PTQ-0689/0943/1004); stated searches reproduce (docs/bugs `shadowme-e2e-s5|REQ-DISC-6` → 0, coverage-matrix → 0, prior filings → only itself), the only cross-reference to this file's :97 (arg-mismatch-diagnostic-count-by-surface.test.ts:666) concerns the 60 s hook budget not the assertion shape, suite green 3/3, not a *gate* file, no rename/merge/delete of a pinned test proposed; not a duplicate — PTQ-0593 (resolved) covered this file's `runProductionLoad` reimplementation, a distinct root cause (triage: claude-fable-5-1)
