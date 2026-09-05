# Bug 0450 — A `system:` `${…}` path stepping into an IMPORTED-enum-typed param (`sev: Sev`, `${sev.Nope}`) is judged at no static phase: the same-file spelling draws `theta/parse/system-interp-bad-field` at parse (any `.Ident` on an enum param refuses — enums terminate the path), while the imported spelling is admitted opaquely at parse AND skipped by the 0422 load re-walk, whose shape map is populated for imported SCHEMAS only — so the theta registers with a path the path grammar's MUST refuses

- **Status:** fixed (0.455.0).
- **Sev/Diff estimate:** S1/D2 — S1: the terminal is 0422's established
  silent-wrong-value class: the admitted part stays `valueDriven`, the render
  walks `.Nope` off the enum's runtime wire string, `resolvePath` yields JS
  `undefined`, and the literal text `undefined` ships into the spawned
  child's `--system-prompt` with zero diagnostics on a registered theta (the
  mechanism 0422 measured for the schema class; this class rides the same
  opaque-object/value-driven rows). D2: the fix is one arm wider in the walk
  0422 landed — the per-specifier decl loop already finds the direct
  `EnumDecl` (`importedEnums`, bug 0430's map); an explicit enum-head arm
  ahead of the 0422 F2 fence in the same re-walk loop, refusing the enum
  head's `.Ident` steps, reuses the existing minted load code — plus the DIAG-2 Trigger amendment
  widening the row from the schema class.
- **Kind:** defect — the path grammar's MUST is unqualified and unenforced
  for this class: `frontmatter-fields-b-and-templates.md:42` ("each
  subsequent `.Ident` must name a reachable field of an *object* schema in
  the theta-side `params:` declaration") prescribes refusal for ANY `.Ident`
  step on an enum-typed param, and the same sentence's two-stage-enforcement
  licence is scoped to "a `params:` entry typed by a **directly-imported**
  `.thetalib` SCHEMA" — no sentence licenses the parse-opaque admit for an
  imported ENUM, and the load stage that discharges the licence never judges
  the enum class (`theta/load/system-interp-bad-field`'s Trigger,
  `code-registry-load.md:69`, is likewise schema-scoped). The imported-enum
  class is left violating the MUST at both stages.
- **Related:**
  - 0422 (fixed 0.435.0) — the imported-SCHEMA filing. Its §Fix (0.435.0)
    residual 3 names this class verbatim: "An imported *enum* param in
    `system:` stays unjudged at load (consistent with the imported-*schema*
    scope) — follow-up family material." This is that filing, with the
    same-file control measured (the schema report's controls were
    field-set-shaped; the enum control refuses on the path-termination rule,
    a different arm of the same code).
  - 0406 (fixed 0.404.0) — parent Rec A classifies every imported `params:`
    name `opaque-object` at parse (the FS-free parser cannot see kind);
    correct and untouched — the gap is the missing load-stage discharge for
    the enum kind.
  - 0430 (fixed 0.423.0) — its fix materialises exactly the data this fix
    needs (`importedEnums`: direct-declaration variant lists in the same
    loop the 0422 re-walk's shape map is built in).
  - 0427 (fixed) — the alias/head-only-schema param class in the same
    dispatch; the 0422 re-walk's non-object-head fence defers to it. The enum
    class is NOT that class: `toSystemParamType` has a real `enum` arm the
    same-file control exercises.
- **Affected** (verified at 401a425b, v0.437.0):
  - `src/parser/frontmatter.ts:1209–1211` — `toSystemParamType`'s same-file
    enum arm: `bodyTypes.enums.has(s)` → `{ kind: "enum" }` — the shape the
    same-file control refuses through.
  - `src/parser/frontmatter.ts:1275–1279` — the imported-name arm: any
    imported binding → `{ kind: "opaque-object" }` (name-only import set; by
    design, 0406 Rec A).
  - `src/parser/system-interpolation.ts:423–427` — the parse walk's
    `opaque-object` arm admits every step; `:428–440` — the non-object arm
    that refuses the same-file enum control
    (`theta/parse/system-interp-bad-field`).
  - `src/extension/import-static-checks.ts:1236–1253` — the 0422 shape-map
    populate: `importedSchemaShapes.set(...)` only when the specifier's
    source names a `stmt.kind === "schema"` in the directly-resolved lib; an
    `EnumDecl` never enters, so the load re-walk's head lookup misses
    (`shape === undefined → continue`, `:1305–1309`) and every `.Ident` step
    on the enum param stays admitted.
  - `src/extension/import-static-checks.ts:1211–1222` — `importedEnums`: the
    direct declaration's variant list, in hand in the SAME loop, unused for
    this question.
  - `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md:42`;
    `docs/spec_topics/diagnostics/code-registry-load.md:69`;
    `docs/spec_topics/diagnostics/code-registry-parse.md:131`
    (`system-interp-bad-field`, the parse row).
- **Observed at:** v0.437.0 (401a425b). Offline, deterministic: scratch
  vitest — real `parseThetaDocument` + real `checkThetaImports` over an
  in-memory FS (`mode: subagent` fixtures; `system:` is subagent-only).
  Scratch deleted.

## Summary

For a `system:` template, an enum-typed param terminates the interpolation
path: any `.Ident` step off it violates the `:42` MUST and the same-file
spelling draws `theta/parse/system-interp-bad-field` at parse. An IMPORTED
enum param cannot be judged at parse (the FS-free parser sees imports as
names only — every imported param classifies `opaque-object` and admits
opaquely, 0406 Rec A), and the load stage 0422 built to discharge exactly
this deferral re-walks only paths whose head resolves to a directly-imported
SCHEMA shape: `importedSchemaShapes` is populated from `stmt.kind ===
"schema"` lookups alone, so an enum-typed head misses the map and the whole
path is skipped. Net: `${sev.Nope}` — and arbitrarily deep chains
(`${sev.a.b.c}`) — load clean against an imported `enum Sev { Low }`, where
the byte-identical frontmatter against the same declaration moved into the
theta refuses at parse.

## Reproduction

Offline at 401a425b. Frontmatter (both cells):

```
---
model: "sonnet"
mode: subagent
params:
  sev: Sev
system: "Level ${sev.Nope}"
---
```

### E1 — same-file control

Body: `enum Sev { Low }` + `1`. Observed parse:
`error theta/parse/system-interp-bad-field: 'system:' interpolation '.Nope'
does not name a reachable object field on sev` — the theta does not
register.

### E2 — imported

Body: `import { Sev } from "./lib.thetalib"` + `1`; lib =
`enum Sev { Low }`. Observed: parse `[]`; load `[]`; `enum Sev`
materialises. Deep-chain variant (`${sev.a.b.c}`): identical silence.

### E3 — the load route DOES run for the schema class (asymmetry inside one pass)

Same fixture shape with `a: Author` / `${a.typo}` against an imported
`schema Author { name: string }` draws
`error theta/load/system-interp-bad-field: 'system:' interpolation '.typo'
does not name a reachable object field on a` — the 0422 route fires one map
lookup away from where the enum class is skipped.

Render terminal (by mechanism identity, not re-measured here — the render
surface is a sibling area's ground): the admitted part is `valueDriven`; at
spawn the param's runtime value is the enum's wire string, `resolvePath`
walks `.Nope` off it to JS `undefined`, and the interpolation renders the
literal text `undefined` into the child's system prompt — the exact chain
0422 pinned for the schema class (`system-interpolation.ts` resolvePath /
`interpolationTypeOfValue`; 0422 §Reproduction row 1).

## Expected behaviour

- `frontmatter-fields-b-and-templates.md:42`: the MUST ("each subsequent
  `.Ident` must name a reachable field of an *object* schema") prescribes
  refusal — an enum is not an object schema, so EVERY `.Ident` step on the
  param is refusable, valid variant names included (E1 confirms the same-file
  reading: the enum kind takes the path-termination arm).
- The same sentence's two-stage licence ("For a `params:` entry typed by a
  **directly-imported** `.thetalib` schema … enforced in two stages") is the
  ONLY text licensing a parse-stage admit for an imported param, and it names
  the schema class alone. The enum class holds an unlicensed parse admit AND
  no load judgement — the MUST is simply unenforced for it.
- `code-registry-load.md:69` scopes the load row to the directly-imported
  schema class; a DIAG-2 Trigger widening (imported enum heads judged at the
  same stage) is the registry-consistent discharge, mirroring how the row was
  minted for the schema class.

## Actual behaviour / root cause

`toSystemParamType` classifies every imported name `opaque-object`
(`frontmatter.ts:1275–1279`) — kind-blind by parser design. The 0422 load
re-walk keys its head resolution on `importedSchemaShapes`, populated only
from `SchemaDecl` lookups (`import-static-checks.ts:1240–1252`); an imported
enum's param head misses the map and the part is `continue`d unjudged
(`:1305–1309`). The direct `EnumDecl` — variants and all — is found by the
same loop three statements earlier (`importedEnums`, `:1217–1222`) and not
consulted. No later phase reads the template against param kinds.

## Why it matters

- The system prompt is the contract-setting text for every turn of the
  spawned child; the admitted path ships `undefined` where the author's
  context value was promised — 0422's S1 rationale, unchanged, for a class
  its fix explicitly left open.
- The refactor hazard is the standard 0304 class with a sharper edge: moving
  `enum Sev` into a shared `.thetalib` converts a parse-time E into a clean
  load whose consequence surfaces — if ever — as garbled child behaviour far
  from the authoring mistake.
- The fix data and the fix seam both exist post-0422/0430; the class is a
  one-arm widening, not a new mechanism.

## Non-goals

- The render/sidecar consequences themselves (the `undefined` bytes, wire
  renames) — render-sidecars-6 ground; cited by mechanism identity to 0422's
  pinned chain only.
- The bare `${sev}` admit — correct for every declared param (`:42`:
  "`${param}` is always allowed"); an enum param's bare render is the
  canonical enum row, untouched.
- Re-export-chain schema heads in `system:` — checked clean this sweep: the
  registry row and the frontmatter sentence both qualify to the
  directly-imported class and state the chain withhold in terms
  (`code-registry-load.md:69`; `frontmatter-fields-b-and-templates.md:42`),
  so docs match code and no unqualified sentence contradicts them.
- Imported alias/head-only schema heads — 0427's adjudicated ground (the
  0422 re-walk's F2 fence defers to it by design).
- The `opaque-object` parse admit itself — required while parse is FS-free
  (0406 Rec A); the claim is the missing load discharge only.

## Fix

Options:

1. **Judge the enum class in the 0422 re-walk** (recommended): add an
   explicit enum-head arm AHEAD of the 0422 F2 fence. Placement is load-
   bearing: the F2 fence (`import-static-checks.ts:1307–1314`) `continue`s
   on ANY non-object shape BEFORE the per-segment loop, so merely entering
   `{ kind: "enum" }` into `importedSchemaShapes` would be SKIPPED exactly
   as today, not refused — the fence exists to protect 0427's alias class
   and has no refusing arm. The enum arm keys on the directly-imported
   `EnumDecl` (the `importedEnums` data, same loop) and refuses the first
   `.Ident` step with the minted `theta/load/system-interp-bad-field`,
   byte-consistent with E1's parse-arm semantics. Direct declarations only (chain
   withhold stated, mirroring the schema class); DIAG-2: widen
   `code-registry-load.md:69`'s Trigger + the `:42` two-stage sentence to
   "schema or enum" in the same commit. GOV-15 addition (E2's class loads
   clean today).
2. **Render-time fail-closed for value-driven walk-offs**: 0422 §Fix route
   (b), already weighed there — converts the authoring mistake into an
   invocation-time failure and lands in the spawn-site `!ok` arm; since
   0.435.0 that arm notes-and-refuses (route (c)), so this is no longer
   silent, but it still reports at the wrong phase and misses the static
   contract. Complementary at best.
3. **Spec-pin the enum class as unjudged**: one sentence extending the
   two-stage licence to "schema (judged) / enum (admitted, renders by
   value)". Rejected: normalises a MUST violation whose same-file twin
   refuses, for a class whose judgement data is already materialised.

## Provenance

import-intake-6 bug-hunt sweep, 401a425b (v0.437.0). Origin: bug 0422 §Fix
(0.435.0) residual 3 ("follow-up family material"). Probe:
`tests/scratch-ii6-intake.test.ts` (deleted) — cells D1c/D2/D2b/D3, outputs
quoted verbatim; the shape-map skip verified by code read
(`import-static-checks.ts:1236–1309`). Spec read:
frontmatter-fields-b-and-templates.md:42; code-registry-load.md:69;
code-registry-parse.md:131. No non-scratch file modified.

## Fix (0.455.0)

- What shipped:
  - `src/extension/import-static-checks.ts` — §Fix Option 1: an explicit
    enum-head arm added to the bug-0422 LOAD-phase `system:` re-walk, keyed on
    `importedEnums` (direct-declaration variant data 0430 already materialises)
    and placed AHEAD of the `importedSchemaShapes` schema-shape lookup / F2
    fence (load-bearing — an enum head never enters that map, so an arm after
    it would skip exactly as before). An enum terminates the path
    (frontmatter-fields-b-and-templates.md:42): any `.Ident` step
    (`segments.length > 1`) refuses at the FIRST step with the ALREADY-MINTED
    `theta/load/system-interp-bad-field` (no new code), byte-consistent with
    the same-file parse arm E1; a bare `${sev}` admits (§Non-goal). The
    re-walk loop-entry guard widened from `importedSchemaShapes.size > 0` to
    `(importedSchemaShapes.size > 0 || importedEnums.size > 0)` so a theta
    importing ONLY an enum enters the walk. Direct-declarations only (chain
    withheld — `importedEnums` is direct-only, E5 green with no extra work).
  - `docs/spec_topics/diagnostics/code-registry-load.md` — DIAG-2: the
    `theta/load/system-interp-bad-field` Trigger widened from the imported-
    schema class to "schema or enum", with the enum path-termination semantics,
    the direct-declaration-only chain withhold, and an explicit GOV-15
    sibling-style attribution to bug 0450.
  - `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md` — the
    :42 two-stage-enforcement sentence widened from "directly-imported schema"
    to "schema or enum".
  - No new diagnostic code; `permitted-codes.json` untouched. No sidecar-
    construction region touched (the enum arm is a pure diagnostics.push +
    continue) — L1/L2's ownership respected.
- Gates:
  - Witness: `npx vitest run tests/b0450-imported-enum-system-param.test.ts`
    → 7 passed (E1 same-file parse control; E2/E2b/E2c imported reds now green
    — `${sev.Nope}`, deep chain `${sev.a.b.c}`, valid-variant-name `${sev.Low}`;
    E3 schema-class asymmetry control; E4 bare `${sev}` guard; E5 chain fence).
  - Full suite: `npm test` → 612 files / 10691 tests, 0 failed (citation-symbol-
    form gate green — the initial bare `:42` comment red was fixed to a file-
    named citation).
  - Typecheck: `npm run typecheck` clean. Lint: `npm run lint` clean.
  - Live: `tests/live/acceptance/b0422live-imported-schema-system-interp-wire-and-refusal.test.ts`
    → 2/2 green through the real `pi -p` (re-run with 0450 in the tree).
    Adjacent witness (recorded WHY): 0450 adds ONE arm + a guard-widening to the
    EXACT 0422 re-walk loop b0422live exercises end-to-end; its DIRECTION 2 is
    the identical registration-flip observable (imported system-interp load
    refusal → theta un-registers → `invoke` resolves Err) that the enum class
    now shares, and DIRECTION 1 (wire render) proves the schema path the arm
    sits beside is undisturbed. My change is a strict no-op for the schema class
    (a schema head has `importedEnums.has(...) === false`), so a green run
    witnesses the guard-widening + arm insertion did not regress the live
    schema re-walk; the enum-class load refusal itself is pinned deterministically
    offline through the same production `checkThetaImports` seam.
    (One 196s provider-overload FLAKE observed under 16-lane live contention,
    green on isolated re-run in 11.5s — recorded parallel-load noise per the
    lane brief, not chased; offline b0422 stayed green with 0450 present.)
- Review: 1 round + 1 comment/prose polish.
  - Round 1 (bug-fix-reviewer, deep): F1 (house-rule) — a new comment's bare
    `:42` citation tripped the citation-symbol-form gate, reddening the full
    suite; R1 (prose) — the load row lacked the sibling-style GOV-15 §Fix
    attribution. Everything else verified clean (arm placement before the
    schema lookup; guard-widening safety; message byte-consistency; scope
    fence — no sidecar region touched; E3/E4/E5 fences; DIAG-2 doc accuracy).
  - Polish (bug-fix-fixer-light): F1 → file-named citation; R1 → GOV-15
    sentence added. Gate-diff comment/prose-only, gates green (full suite
    10691, citation gate green) → confirmation review round skipped.
- Verification: bug-fix-verifier SOLID.
  - Witness genuinely witnesses: neutralising the enum arm reds E2/E2b/E2c
    (empty parse+load vs owed load refusal); byte-exact restore → 7 green.
  - Full default suite green (10691); citation gate green.
  - Lint + typecheck clean.
  - No-flip constraints green (b0422, b0423, b0427, b0406, system-interpolation).
  - Live obligation discharged by the orchestrator (b0422live adjacency above).
- Residuals: none blocking.
  1. An imported `EnumDecl` whose variant SHAPE did not parse
     (`variants === undefined`) misses `importedEnums` and so is not judged by
     this arm — but such a lib carries its own E-severity parse diagnostics
     (surfaced by 0304's transitive-lib threading), so the class cannot register
     silently. Consistent with `importedEnums`' existing `.variants !== undefined`
     guard (0430's concern), not widened here.
- Discharge notes appended: none. Bug 0422 §Fix (0.435.0) residual 3 named this
  class ("follow-up family material"); the closed 0422 doc is not edited
  (era-pinning — no parent ratification for a dated note).
- Pinned dispositions / non-goals: the render/sidecar consequences (the
  `undefined` bytes — render-sidecars ground), the bare `${sev}` admit, re-export-
  chain schema/enum heads (direct-only withhold), imported alias/head-only schema
  heads (0427's ground, the F2 fence), and the `opaque-object` parse admit itself
  (0406 Rec A) all remain untouched, exactly as §Non-goals states.
