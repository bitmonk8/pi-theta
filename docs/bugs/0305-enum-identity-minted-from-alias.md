# Bug 0305 — Enum value identity is minted from the resolution-site LOCAL name, not the declaring declaration: one `.thetalib` enum imported under two aliases (`import { Sev as A, Sev as B }`), or reached once directly and once through an `export … from` rename, yields variants that compare `==` false against each other — where imports.md says the re-export binds "that declaration … exactly as a direct import of the same declaration would" and the runtime value model keys equality on "the declaring enum"

- **Status:** open.
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
