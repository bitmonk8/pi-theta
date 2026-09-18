---
id: PTQ-0999
title: queryConfig() is byte-identical across b0307-empty-template-parity.test.ts, composition-producer.test.ts and effectful-statement-host.test.ts
lens: D7
status: open
verdict: confirmed
locations:
  - tests/b0307-empty-template-parity.test.ts:110-118
  - tests/composition-producer.test.ts:118-126
  - tests/effectful-statement-host.test.ts:191-199
sites: 3
fix_scope: module
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# queryConfig() is byte-identical across b0307-empty-template-parity.test.ts, composition-producer.test.ts and effectful-statement-host.test.ts

## Observation
Three test files each declare a local `function queryConfig(): QueryToolLoopConfig`
that builds the identical five-field object literal
(`maxRounds: 3, querySite: SITE, thetaSlashName: "demo", invocationId: "inv-1",
occurredAt: 0`). A `diff` of the three function bodies (extracted to temp files)
produces no output — the three declarations are byte-for-byte identical, not merely
structurally similar. All three files already import shared scaffolding from
`tests/helpers/invoke-seam-scaffold.ts` (which exports the `SITE` constant these three
`queryConfig()` copies each reference, directly or via a locally re-declared
equivalent).

## Evidence
`tests/b0307-empty-template-parity.test.ts:110-118`:
```ts
function queryConfig(): QueryToolLoopConfig {
  return {
    maxRounds: 3,
    querySite: SITE,
    thetaSlashName: "demo",
    invocationId: "inv-1",
    occurredAt: 0,
  };
}
```

`tests/composition-producer.test.ts:118-126`:
```ts
function queryConfig(): QueryToolLoopConfig {
  return {
    maxRounds: 3,
    querySite: SITE,
    thetaSlashName: "demo",
    invocationId: "inv-1",
    occurredAt: 0,
  };
}
```

`tests/effectful-statement-host.test.ts:191-199`:
```ts
function queryConfig(): QueryToolLoopConfig {
  return {
    maxRounds: 3,
    querySite: SITE,
    thetaSlashName: "demo",
    invocationId: "inv-1",
    occurredAt: 0,
  };
}
```

`diff` of the three extracted bodies (`sed -n` ranges above) returns no lines in either
direction — confirmed identical. A fourth same-named function,
`tests/b0316-match-scrutinee-inline-composite-ok-wrapped.test.ts:258-266`, was checked
and differs in two fields (`querySite: EFFECT_SITE`, `thetaSlashName: "b0316"`), so it
is excluded from this count; `sites: 3` covers only the three verified identical
copies.

## Why this is a problem
The exact search `function queryConfig\(\): QueryToolLoopConfig` over `tests/*.test.ts`
returns four hits; three of the four resolve to a byte-identical six-line function
body with the same field values, imported alongside other names already pulled from
`tests/helpers/invoke-seam-scaffold.ts` (which already centralises the sibling `SITE`
constant one of the three copies consumes directly). Because the values themselves
carry no per-file variation, the exact-match count is not an artefact of a
type-enforced shape with differing fixture data (contrast the human-rejected
`config(maxRounds, ...)` filing, where five of six sites varied 2-5 of 5 field values)
— here every field is identical across all three sites.

## Suggested direction (non-binding, optional)
`tests/helpers/invoke-seam-scaffold.ts` already exports `SITE` for this same family of
`executeBody`-driving witness files; naming it as the module that could carry a shared
`queryConfig()` beside `SITE` is an observation about where the identical bodies
already congregate, not a design for the fix.

## False-positive check
- Gate-pin check: none of the three files match `*gate*.test.ts` or kin; not a
  census/pin gate.
- Recording-double check: `queryConfig()` returns a plain data literal, not a double
  that records calls; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "queryConfig" docs/bugs/` → 0 hits; no
  documented correct-reason red cites this helper by name.
- coverage-matrix/bug-doc citation search: `grep -n "queryConfig"
  docs/reference/coverage-matrix.md` → 0 hits. `grep -n
  "tests/b0307-empty-template-parity.test.ts" docs/bugs/0307-*.md` → 2 hits (witness
  list), but this finding proposes no merge, rename or deletion of any of the three
  test files — only a possible shared home for one repeated internal helper — so the
  citation does not bar it.
- Prior-rejection check: the wave's human-reject log rejects a filing about
  `config(maxRounds: number)` (a different, parameterised function name) on the
  grounds that its six sites vary 2-5 of 5 field values; verified here that the
  present three `queryConfig()` sites vary 0 of 5 field values, so that rejection's
  reasoning does not transfer.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — all three excerpts reproduce verbatim at the cited lines and a mktemp `diff` of the three `sed` ranges is empty both ways (rc=0); `grep -rn "function queryConfig" tests/ src/ extensions/ tools/` → exactly 4 hits with the b0316 copy correctly excluded (differs in `querySite: EFFECT_SITE` / `thetaSlashName: "b0316"`); every copy is live with one `config: queryConfig()` caller (:149 / :235 / :232) and 0 of 5 fields vary across the three, so unlike the false-positive `config(maxRounds)` precedent (2–5/5 varied) this is a byte-identical copy-paste fixture with a mechanical dedupe (the two local `SITE` redeclarations are also value-identical to `invoke-seam-scaffold.ts:202`'s export); docs/bugs + coverage-matrix `queryConfig` → 0 reproduce, no gate/recording-double/witness-list carve-out applies, all 3 files green (18/18); distinct from resolved PTQ-0529/0545/0594 (AST harness, no-op checkpoint/sink/mutator in these same files — none names `queryConfig`) and from sibling intake d7-01 (`NOOP_SINK`); minor: the candidate calls the `config()` precedent "human-rejected" but it was a triage false-positive (triage: claude-fable-5-1)
