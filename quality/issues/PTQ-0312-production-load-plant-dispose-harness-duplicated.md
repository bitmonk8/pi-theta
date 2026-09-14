---
id: PTQ-0312
title: b0297-bind-model-nonscalar-production-load's plant-workspace/runProductionLoad/dispose sequence is redeclared, near-identically, in two sibling production-load-harness callers
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0297-bind-model-nonscalar-production-load.test.ts:111-131
  - tests/conformance/production-conformance.test.ts:235-249
  - tests/arg-mismatch-diagnostic-count-by-surface.test.ts:663-707
sites: 3                     # count of occurrences cited in Evidence
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260914060226
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-14
---

# b0297-bind-model-nonscalar-production-load's plant-workspace/runProductionLoad/dispose sequence is redeclared, near-identically, in two sibling production-load-harness callers

## Observation
tests/b0297-bind-model-nonscalar-production-load.test.ts's `beforeAll`/
`afterAll` pair plants a temp discovery workspace by hand — `mkdtempSync` a
`theta-<slug>-` directory, `mkdirSync` its `.pi/theta` subdirectory,
`writeFileSync` one `.theta` file per planted fixture, optionally
`writeFileSync` a `.pi/settings.json`, call the shared `runProductionLoad`
from `tests/helpers/production-load-harness.ts` and capture its outcome, then
`rmSync` the directory in `afterAll` — and this exact sequence, in the same
order, over the same three Node `fs` primitives, recurs near-identically in
two other files that import the same `runProductionLoad` helper:
tests/conformance/production-conformance.test.ts and
tests/arg-mismatch-diagnostic-count-by-surface.test.ts. All three share the
identical `workspaceDir`/`projectThetaDir` variable shape and the identical
five-step body (mkdtemp → mkdir → per-fixture write loop → `runProductionLoad`
call → `afterAll` rmSync); no `tests/helpers/` module centralises this
plant-then-load-then-dispose sequence itself, even though all three files
already import the load call it wraps from the same helper module.

## Evidence

tests/b0297-bind-model-nonscalar-production-load.test.ts:111-131:
```ts
beforeAll(async () => {
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-b0297-"));
  const projectThetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(projectThetaDir, { recursive: true });
  for (const l of THETAS) {
    writeFileSync(join(projectThetaDir, `${l.stem}.theta`), l.text, "utf8");
  }
  // `theta.binderModel` is the chain-step-2 settings fallback the fix must NOT
  // reach for a non-scalar `bind_model:`; it resolves against the available
  // model above, so pre-fix the offender rides it into registration.
  writeFileSync(
    join(workspaceDir, ".pi", "settings.json"),
    JSON.stringify({ theta: { binderModel: "test/binder" } }),
    "utf8",
  );
  outcome = await runProductionLoad(workspaceDir, { availableModels: AVAILABLE_MODELS });
});

afterAll(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
});
```

tests/conformance/production-conformance.test.ts:235-249 — the identical
five-step shape (mkdtemp → mkdir → per-fixture write loop → load call →
dispose), differing only in the temp-dir slug, the fixture-array name, and an
`if (workspaceDir !== undefined)` guard around the `rmSync`:
```ts
beforeAll(async () => {
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-v20g-"));
  const projectThetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(projectThetaDir, { recursive: true });
  for (const l of LOAD_THETAS) {
    writeFileSync(join(projectThetaDir, `${l.stem}.theta`), l.text, "utf8");
  }
  loadOutcome = await runProductionLoad(workspaceDir);
});

afterAll(() => {
  if (workspaceDir !== undefined) {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
});
```

tests/arg-mismatch-diagnostic-count-by-surface.test.ts:683-707 — the same
mkdtemp/mkdir/write-loop/load/dispose core (preceded here by an unrelated
duplicate-stem guard at lines 663-681, omitted below), including the same
"minimal valid settings file … hermeticity, not noise suppression" settings
write b0297's own copy carries in expanded form:
```ts
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-bug0147-"));
  const projectThetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(projectThetaDir, { recursive: true });
  for (const planted of PLANTED) {
    writeFileSync(
      join(projectThetaDir, `${planted.stem}.${planted.ext}`),
      planted.text,
      "utf8",
    );
  }
  // A minimal valid settings file pins the fixture's settings read to a known
  // value; an ABSENT settings file is silent, so this is hermeticity rather
  // than noise suppression.
  writeFileSync(join(workspaceDir, ".pi", "settings.json"), "{}", "utf8");
  outcome = await runProductionLoad(workspaceDir);
  ...
}, 60000);

afterAll(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
});
```

All three files import `runProductionLoad`/`LoadOutcome` from the same
module: `grep -rl "production-load-harness" tests --include="*.test.ts"` →
exactly these 3 files. Each independently redeclares the plant/dispose
sequence around that one shared call; `tests/helpers/production-load-harness.ts`
(the module all three already import from) exports only `runProductionLoad`,
`LoadOutcome`, and `ProductionLoadOptions` — no plant-workspace or dispose
helper.

## Why this is a problem
This is the "Boilerplate duplication" class: three files that already share
one canonical load-driving call (`runProductionLoad`) each independently
retype the identical five-step temp-workspace lifecycle around that call —
`mkdtempSync` a project root, `mkdirSync` its `.pi/theta`, a per-fixture
`writeFileSync` loop, an optional `.pi/settings.json` write, the shared load
call, and an `afterAll` `rmSync` — rather than sharing it. The three bodies
are not byte-identical (the temp-dir slug, the fixture-array variable name,
and one `undefined`-guard on the teardown differ), but the sequence, its
five steps, and their order are the same in all three, and none of the three
files' surrounding prose acknowledges the other two as the source of this
shape. `tests/helpers/production-load-harness.ts`'s own header already
identifies the class of redundancy this file family is prone to
("Several test files independently redeclared the same `LoadOutcome` shape
and the same `runProductionLoad` function … This module centralises" that
half of the read) but stops at the load call itself; the plant-then-dispose
half wrapped around every call site is the piece three prior, confirmed
fixes to two of these same three files (PTQ-0210, PTQ-0240, PTQ-0259) did not
touch, since each of those findings' own Evidence was confined to the fake
`pi`/`ctx` construction inside `runProductionLoad`, not the workspace
lifecycle around it.

## Suggested direction (non-binding, optional)
`tests/helpers/production-load-harness.ts`, the module all three files
already import `runProductionLoad` from, is the proximate existing home
alongside which a shared plant-and-dispose helper for this workspace
lifecycle would sit.

## False-positive check
- Gate-pin check: none of the three files matches `*gate*.test.ts` or the
  named kin; nothing cited here is a pinned count or inventory assertion.
- Recording-double check: the planted fixtures and the temp directory are
  real on-disk state driven through the real `discoverAndComposeFixtures`
  (via `runProductionLoad`), not a recording double backing a "never called"
  witness; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0297-bind-context-nonscalar-silently-registers.md
  — Status "fixed (0.330.0)", pinning tests/b0297-bind-model-nonscalar-production-load.test.ts
  as a "composition-level offline witness (3 cells)"; docs/bugs/0147-arg-mismatch-diagnostic-count-diverges-by-surface.md
  — Status "fixed (0.246.0)". `grep -rl "production-conformance"
  docs/bugs/*.md` hits eight bug documents, all pinning that file's own
  `runSource` harness or specific stale-comment lines elsewhere in the file,
  never the `beforeAll`/`afterAll` block cited here (re-verified during this
  review). `npx vitest run` on all three files reproduces 3/3, 27/27, and
  98/98 passing at HEAD, so none is a documented correct-reason red, and no
  bug document states a rationale for keeping the plant/dispose sequence
  local to each file.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0297-bind-model-nonscalar-production-load\|production-conformance\|arg-mismatch-diagnostic-count-by-surface"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any test, `it()`, or fixture — only that the
  repeated temp-workspace lifecycle around an already-shared load call could
  be shared too — so no witness-list citation is disturbed.
- Overlap check against already-filed/resolved topics: PTQ-0210 ("readcorpus/
  production-load harness duplication", fixed) migrated five files —
  arg-mismatch-diagnostic-count-by-surface, invoke-arg-type-mismatch-wired,
  division-result-type-number-invoke, invoke-arg-array-literal-provable,
  modulo-zero-result-type-number — to import the shared `runProductionLoad`
  fake-host construction; PTQ-0240 (fixed) migrated
  tests/b0297-bind-model-nonscalar-production-load.test.ts to the same
  import; PTQ-0259 (fixed) migrated tests/conformance/production-conformance.test.ts
  likewise. Re-reading each of those three findings' own Evidence sections
  (verified during this review) shows every cited excerpt is the fake `pi`/
  `ctx`/`LoadOutcome` construction *inside* the old local `runProductionLoad`
  function body — none cites the surrounding `mkdtempSync`/`mkdirSync`/
  per-fixture-write/`afterAll rmSync` lines this finding cites, and all three
  files' current `beforeAll`/`afterAll` blocks (re-read above) still carry
  that lifecycle locally even after those three fixes landed. This is a
  residual the prior fixes' own stated scope did not reach, the same
  "fix landed elsewhere, this piece was left out of scope" shape already
  accepted at PTQ-0228/PTQ-0301.
- Coverage check: the claim is about a repeated setup/teardown DEFINITION,
  not a missing test path; the workspace lifecycle is exercised by the
  passing tests in all three files (confirmed above).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — all three beforeAll/afterAll blocks reproduce byte-exact at the cited lines with the identical mkdtemp→mkdir→write-loop→runProductionLoad→rmSync shape, grep confirms these are the only 3 importers of the shared helper (which exports no plant/dispose piece), PTQ-0210/0240/0259's own Evidence (re-read) is confined to the runProductionLoad function body and never this surrounding lifecycle which still stands untouched post-fix, and all three files stay green (3/3, 27/27, 98/98, reproduced) with no docs/bugs or coverage-matrix pin on this block (triage: claude-opus-5)
