# Bug 0305 — Enum value identity is minted from the resolution-site LOCAL name, not the declaring declaration: one `.thetalib` enum imported under two aliases (`import { Sev as A, Sev as B }`), or reached once directly and once through an `export … from` rename, yields variants that compare `==` false against each other — where imports.md says the re-export binds "that declaration … exactly as a direct import of the same declaration would" and the runtime value model keys equality on "the declaring enum"

- **Status:** fixed (0.290.0).
- **Sev/Diff estimate:** S1/D3 — S1: a comparison between two values of the
  SAME declaring enum silently evaluates `false` with zero diagnostics at any
  phase, and the divergence is invisible on the wire (`JSON.stringify` of both
  sides prints the same bare string), so it resurfaces only as wrong branch
  decisions. D3: the fix must choose an identity model (tag = declaring
  declaration identity, e.g. resolved-path + declared name, threaded through
  `MaterializedImport`), touch every `makeEnumValue` caller including the
  inbound-retag sidecar so locally-constructed and inbound values keep
  comparing equal, and add the spec sentence that pins alias identity — the
  current corpus supports both readings (see §Actual, last paragraph).
- **Kind:** defect — with a stated ambiguity. runtime-value-model.md `:13`
  defines the enum value as "the variant's wire string plus an
  interpreter-private tag identifying the **declaring enum**", and `:29` keys
  equality on "the declaring-enum tag and the wire value". Both values in
  every reproduction row below are variants of ONE declaration
  (`enum Sev` in one `.thetalib`), so under those sentences they compare
  `true`. The implementation mints the tag from the local binding name at the
  access site, so they compare `false`. imports.md `:37–43` sharpens the
  re-export row: an importing specifier naming the downstream alias "binds
  that declaration under its local name, **exactly as a direct import of the
  same declaration would**" — measured, the two bindings' variants are not
  interchangeable, which is an observable in which the two routes are not
  "exactly" alike.
- **Related:**
  - [0067](./0067-subagent-envelope-drops-enum-tag.md) —
    fixed (0.90.0); the sibling identity fault across the invoke envelope
    (tag LOST, `v == Sev.High` false in the parent). Same observable class
    (same-declaration variants comparing false), different seam (this one
    mints two different tags in one session; 0067 dropped one).
  - [0101](./0101-from-bearing-reexport-materialises-nothing.md) —
    fixed (0.141.0); built the re-export materialisation this report's D2 row
    drives (the chain resolves and binds — the binding is real; its identity
    is what diverges).
  - Candidate 05 of this hunt (imported enum drops explicit wire values) —
    independent defect in the same materialisation seam; in the rows below
    both sides lose values identically, so the false verdicts here are purely
    the tag.
- **Affected** (citations verified at `bc52da38`, v0.287.0):
  - `src/runtime/lexical-environment.ts:526–534` — `resolveEnumVariant`:
    returns `makeEnumValue(enumName, …)` where `enumName` is the identifier
    WRITTEN at the access site (the local alias the env registered).
  - `src/runtime/lexical-environment.ts:307–315` — imported enums are
    registered per LOCAL name (`this.enums.set(imp.name, …)`); two aliases of
    one declaration are two registry entries with no shared identity.
  - `src/extension/import-static-checks.ts:182–215` — `materializeSymbol`:
    the materialised enum carries `{ name: local, kind: "enum", variants }` —
    no declaring-file or declared-name identity survives materialisation.
  - `src/runtime/value.ts:135–144` — `makeEnumValue(declaringEnum, wire)`:
    the tag parameter is named `declaringEnum` but receives the local alias.
  - `src/runtime/value.ts:497–503` — equality: `tagA === tagB && String(a)
    === String(b)`.
  - `src/runtime/statement-executor.ts:759–764` and
    `src/extension/production-theta-producer.ts:6802` — the two variant-read
    arms, both passing the access-site name.
  - `docs/spec_topics/runtime-value-model.md:13, :22, :29`.
  - `docs/spec_topics/imports.md:37–43` (the re-export resolution paragraph).
- **Observed at:** `0.287.0` (`bc52da38`). Offline, deterministic; no live
  model. Scratch vitest: real `parseThetaDocument` + `checkThetaImports` +
  `executeBody` via `createProductionProducerDeps` (the
  `tests/reexport-chain-resolution.test.ts` harness shape); written, run,
  deleted.

## Reproduction

Offline at `bc52da38`. `/proj/app.theta` (frontmatter `model: "sonnet"`,
`mode: prompt`). All loads are clean (`app parse :: []`, `diags :: []`) in
every row.

### D1 — two aliases of one declaration

```
@@ /proj/lib.thetalib   enum Sev { Low, High }
   app   import { Sev as A, Sev as B } from "./lib.thetalib"
         let x = A.Low == B.Low
         x
   imports :: ["enum A","enum B"]
   runtime :: value=false                       ← one declaration, one variant

@@ control: import { Sev } … + Sev.Low == Sev.Low
   runtime :: value=true
```

### D2 — direct import vs re-export rename of the same declaration

```
@@ /proj/base.thetalib  enum Sev { Low, High }
   /proj/mid.thetalib   export { Sev as Level } from "./base.thetalib"
   app   import { Sev } from "./base.thetalib"
         import { Level } from "./mid.thetalib"
         let x = Sev.Low == Level.Low
         x
   imports :: ["enum Sev","enum Level"]
   runtime :: value=false
```

### D3 — two DIFFERENT declarations (control: false is correct here)

```
@@ liba: enum Sev { Low, High }    libb: enum Sev { Low, High }
   app   import { Sev as SA } from "./liba.thetalib"
         import { Sev as SB } from "./libb.thetalib"
         let x = SA.Low == SB.Low
         x
   runtime :: value=false                       ← correct per :13/:29
```

D1/D2 and D3 are indistinguishable to the implementation: it cannot tell one
declaration under two names from two declarations, because the tag is the
name.

## Expected behaviour

- `docs/spec_topics/runtime-value-model.md:13`: the tag identifies "the
  declaring enum". `:29`: "Enum variants compare the declaring-enum tag and
  the wire value". In D1 and D2 the declaring enum of both operands is the
  single `enum Sev` declaration; same tag, same wire (`"Low"` both — measured
  via `JSON.stringify`), so `==` is `true`.
- `docs/spec_topics/imports.md:37–43`: an importing specifier naming a
  re-export's alias "binds that declaration under its local name, exactly as
  a direct import of the same declaration would". D2 measures the two routes
  producing values that are not mutually equal — an observable in which the
  binding is not "exactly" the direct import's.
- D3's `false` stays `false` under the expected model (two declarations, two
  tags), so the fix direction cannot be "compare wire strings only".

## Actual behaviour / root cause

The tag is the access-site name. `buildEnvironment` registers each
materialised enum under its LOCAL name only (`lexical-environment.ts:307–315`)
— `materializeSymbol` gives it nothing else to key on (`{ name: local, kind,
variants }`, no declaring file, no declared name). `resolveEnumVariant`
(`:526–534`) then mints `makeEnumValue(enumName, …)` from the name the
expression spelled, and equality (`value.ts:497–503`) compares those strings.
Two aliases → two tags → `false`; the parameter name `declaringEnum`
(`value.ts:135`) records the intent the seam does not deliver.

**The counter-reading, stated honestly.** runtime-value-model.md `:22` routes
`==` through static-type compatibility, and if each import alias is read as a
distinct NAMED type, `A ⊑ B` fails and the cross-type rule yields `false` —
making D1 "as specified" under that reading. Two facts weigh against it: no
spec sentence says an import alias mints a fresh nominal type (imports.md
frames aliasing as binding — "binds that declaration under its local name" —
and offers `as` for collision repair and "self-clarity", not as a newtype
operator); and the same paragraph derives the cross-enum `false` from the
values' "declaring-enum static type", which for D1/D2 is one declaration
however spelled. If the project adjudicates the other way — aliases ARE
distinct types — the spec owes that sentence explicitly, and D2 still leaves
imports.md `:41–43`'s "exactly as a direct import" observably false; either
way one corpus page must move, which is why this files as a defect rather
than a note.

## Why it matters

- Silent wrong branch decisions: any `==` / `!=` between a value produced
  under one alias and a variant spelled under the other is constantly false,
  with identical JSON on both sides — undiagnosable from output. Re-export
  renames (D2) are the spec's own recommended evolution device
  (`export { Author as Reviewer }` is imports.md's worked example), so one
  lib renaming for downstream compatibility makes old-name and new-name
  values non-interchangeable in any theta that sees both.
- The identity model leaks into the inbound boundary: the retag sidecar
  attaches "that enum's tag" per lowered position
  (runtime-value-model.md:34); with name-minted tags, which tag an inbound
  value gets depends on which alias the annotation spelled, propagating the
  same false verdicts to query results and binder args.
- Nothing in the committed corpus imports one enum under two names, so no
  shipped test can witness the class.

## Non-goals

- The wire-value drop for imported enums (candidate 05) — independent
  mechanism (`buildVariantWireMap(…, undefined)`), independently fixable.
- Schema brand identity under aliases: object `==` is structural, so the
  analogous brand question has no equality observable; the QRY-18 rename-map
  consequences of alias-named brands are unprobed here.
- 0067's envelope-crossing tag loss — already fixed; unaffected by this
  report.

## Fix

Not yet decided. The load-bearing choice is the tag's domain:

- **Route A (declaration identity):** thread the declaring identity through
  materialisation — e.g. `MaterializedImport` carries
  `declaringKey = <resolvedPath>#<declaredName>` and same-file enums use
  `<selfPath>#<name>` — and mint `makeEnumValue` tags from that key at every
  caller (both executor arms, the pure evaluator, the inbound retag sidecar,
  params-default recovery). D1/D2 become `true`; D3 stays `false`;
  same-file behaviour is unchanged (one file, one key per name). Requires the
  spec sentence pinning alias identity and a check that the sidecar's
  position→enum mapping carries the key rather than the spelled name.
- **Route B (nominal aliases):** keep the implementation and amend the spec —
  state that each import binding is a distinct enum type for equality, and
  re-derive imports.md `:41–43`'s "exactly as a direct import" to scope out
  value identity. Cheaper, but it hard-codes today's accident into the value
  model and makes D2's rename-migration story permanently false-comparing.

Either route owes witnesses D1, D1b, D2, D3 as offline cells.

## Fix (0.290.0)

- **Adjudicated route:** Route A — declaration identity. D1 (two aliases) →
  true; D1b control → true; D2 (direct vs re-export rename) → true; D3 (two
  different same-named declarations) → stays false.
- **What shipped:**
  - `src/runtime/lexical-environment.ts` — new exported `enumDeclaringKey(resolvedPath, declaredName)` mints the declaration-identity tag
    `<resolvedPath>#<declaredName>`; `MaterializedImport` carries an optional
    `declaringKey`; the enum registry value became `EnumEntry { variants, tag }`;
    same-file enums register `tag: reg.name` (bare name), imported enums
    `tag: imp.declaringKey ?? imp.name`; `resolveEnumVariant` mints
    `makeEnumValue(entry.tag, …)` — the single choke point both executor arms,
    the pure host member arm, and params-default recovery route through.
  - `src/extension/import-static-checks.ts` — `materializeSymbol` takes
    `resolvedPath` and sets `declaringKey: enumDeclaringKey(resolvedPath, source)`
    on the enum arm; the re-export leaf recursion threads the SOURCE lib's
    `resolvedPath`, so a direct import and a re-export rename of one declaration
    key identically (D2).
  - `docs/spec_topics/runtime-value-model.md` §Equality + `docs/spec_topics/imports.md`
    :37–43 — the owed alias-identity sentence (the declaring-enum tag identifies
    the declaring DECLARATION — declaring file + declared name; import aliases
    and re-export renames mint no fresh identity; a same-file enum tags on its
    bare declared name). Mirror updated in `docs/reference/type-system.md`
    §Equality. Grep confirmed no other `docs/reference/` page mirrors enum value
    identity (schema-subset.md's hits describe the lowering sidecar, an unrelated
    mechanism).
  - `tests/b0305-enum-alias-identity.test.ts` — offline witness (D1/D1b/D2/D3).
  - `tests/live/b0305live-imported-enum-alias-identity-live-cell.test.ts` — new
    single-cell H8a live witness; theta-side alias-equality discriminator
    (`answer = A.Low == B.Low ? 777 : 111`), task-framed arithmetic (never a
    verbatim-echo demand, bug 0243).
  - `tests/b0306-imported-enum-wire-values.test.ts` — row 4's hand-built operand
    re-keyed to the declaring key under ratification 1 (see below).
  - `docs/bugs/0306-imported-enum-drops-explicit-wire-values.md` — dated
    coordination note appended.
  - Citation-only comment refresh where this fix shifted lines cited elsewhere:
    `src/parser/theta-document.ts`, `tests/ctor-unresolved-schema-name.test.ts`,
    `tests/params-default-enum-access-merge.test.ts`,
    `tests/params-default-unresolvable-enum-variant.test.ts`.
- **Deliberately unchanged (recorded):** the inbound retag sidecar
  (`src/runtime/wire-translation.ts` / `src/runtime/inbound-boundary.ts`) is
  byte-unchanged. `declaredNames(body,"enum")` reads only same-file
  `statement.kind === "enum"`, so imported enums never reach the sidecar; and a
  same-file enum's tag is its bare declared name (ratification 2), which is
  exactly what the sidecar already mints. The sidecar's position→enum mapping
  therefore already carries the declaring key for every enum it sees; widening
  it to newly recognise imported enums would be trigger-widening (forbidden).
- **Gates:** witness run — D1/D2 red-before (`expected false to be true`),
  all-green after; full default suite `npm test` — 466 files / 9451 tests green;
  `npm run typecheck` exit 0; `npm run lint` exit 0.
- **Review:** 2 rounds. Round 1 (`bug-fix-reviewer`) — 3 minor findings, all
  prose/comment (F1 spec overclaim on the converse clause; F2 over-asserted
  0303-reuse comment; F3 historical `post bug-0305` narration in the b0306
  header); no correctness/fidelity/spec blocker. Round 2 (`bug-fix-fixer-light`,
  prose-only) — F1 scoped to imported/re-exported declarations + same-file
  clause; F2 softened to a design note; F3 parenthetical deleted. Post-polish
  confirmation: every hunk comment/prose-only ⇒ polish verified by gate-diff;
  confirmation round skipped (charter).
- **Verification (`bug-fix-verifier`, SOLID):** offline witness reds under a
  transient tag-mint neutralisation (D1/D2 fail, D1b/D3 pass) and greens after
  byte-exact restore (blob hash `cd9d7a2e…` before = after); full suite green;
  lint + typecheck exit 0; live cell read-verified. Live cell run for real by
  the orchestrator under the shared live-lock: GREEN (1 passed, 2908 ms);
  neutralised-RED proof (reply `"111"`, `expected '111' to contain '777'`),
  neutralisation restored byte-exact.
- **Parent ratifications (verbatim):**
  1. *0306 row-4 vehicle update RATIFIED (vehicle-collateral precedent): in
     tests/b0306-imported-enum-wire-values.test.ts row 4, update ONLY the
     hand-built operand so its tag is minted with the same declaring key the
     imported variant carries — the row's subject (the WIRE half: imported
     variant vs inbound-shaped "low") is preserved; the hand-built value
     simulates what the inbound retag sidecar produces, and under Route A the
     sidecar mints the declaring key, so the re-keyed operand keeps the
     simulation faithful. Bound: this ONE assertion operand, nothing else in
     that file.*
  2. *Same-file bare-name tags RATIFIED as the correct reading of "same-file
     behaviour unchanged": .theta-file-local enum declarations keep today's
     bare-name tag (no aliasing device exists within a file — .theta files
     cannot be imported — so bare names are collision-free per declaration);
     ONLY imported/re-exported .thetalib enums carry the declaring key
     <resolvedPath>#<declaredName>, minted at materialisation and at every
     consumer (both executor arms, pure evaluator, inbound retag sidecar,
     params-default recovery). Cross-boundary comparisons stay correct: a
     same-file Sev vs an imported different-declaration Sev differ in tag →
     false.*
- **Route-A adjudication (verbatim, from the settled brief):** *thread the
  declaring identity through materialisation — MaterializedImport carries a
  declaring key (resolvedPath + declared name, e.g. `<resolvedPath>#<declaredName>`)
  and same-file enums use the equivalent self-key — and mint makeEnumValue tags
  from that key at every caller (both executor arms, the pure evaluator, the
  inbound retag sidecar, params-default recovery). D1/D2 become true; D3 stays
  false; same-file behaviour unchanged (one file, one key per name). Requires
  the spec sentence pinning alias identity in the SAME COMMIT, with docs/reference/
  mirrors checked, and a check that the retag sidecar's position→enum mapping
  carries the key rather than the spelled name.* (Same-file resolution: per
  ratification 2 the same-file "equivalent self-key" is the bare declared name,
  not `<selfPath>#<name>`; the sidecar check is discharged by the
  deliberately-unchanged finding above.)
- **Discharge notes appended:** `docs/bugs/0306-imported-enum-drops-explicit-wire-values.md`
  (dated coordination note under §Fix (0.289.0)).
- **Forward note for bug 0303 (imported fn body scope, lands next):** its
  lib-side module environments must register enum tags via the exported
  `enumDeclaringKey` (`src/runtime/lexical-environment.ts`) so lib-body enum
  reads and importer-side reads of one declaration mint identical
  `<libPath>#<name>` keys and compare equal.
- **Residuals:**
  1. Same-file cross-file enum identity across an in-process `invoke` is a
     pre-existing corner the fix does not close and the spec no longer
     overclaims: two different `.theta` files each declaring `enum Sev` both
     carry the bare tag `"Sev"`, so a callee's `Sev.Low` (kept as its boxed
     carrier through `wire-translation.ts:298–303`, which retags only string
     values) can compare `==` true against a caller's unrelated same-file
     `Sev.Low`. This was equally true before this fix (both bare-name); the
     amended spec sentence was scoped to imported/re-exported declarations so it
     no longer asserts the converse for same-file declarations. Not a
     regression; flagged for a possible standalone report.
  2. `tests/live/live-production-acceptance.test.ts` carries a now-stale
     citation (`resolveEnumVariant … lexical-environment.ts:526`; the real line
     is `:582`). The implementer had refreshed it, but that file is rider-
     forbidden to this lane (line-pinned at 14864; the one-line insertion
     shifted the pin), so the parent reverted it byte-exact. Comment-only, no
     gate impact; refresh belongs to a run permitted to touch that file.

## Provenance

- Hunt seed: imports-graph area brief, hypothesis 5 (cross-module value
  identity / brand identity by name or by file).
- Spec: `docs/spec_topics/runtime-value-model.md:13, :22, :29, :34`;
  `docs/spec_topics/imports.md:37–43`.
- Implementation evidence at `bc52da38`:
  `src/runtime/lexical-environment.ts:307–315, :526–534`;
  `src/runtime/value.ts:135–144, :497–503`;
  `src/extension/import-static-checks.ts:182–215`;
  `src/runtime/statement-executor.ts:759–764`;
  `src/extension/production-theta-producer.ts:6802`.
- Probes: scratch vitest cells D1, D1b, D2, D3 at `bc52da38`, outputs quoted
  verbatim; file deleted per scratch policy. No non-scratch file modified.
