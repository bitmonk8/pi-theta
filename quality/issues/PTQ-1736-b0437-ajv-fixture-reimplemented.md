---
id: PTQ-1736
title: b0437's binderRootDouble reconstructs the shared AJV fixture locally.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/b0437-producer-note-raw-send-fallback.test.ts:365-368
  - tests/b0437-producer-note-raw-send-fallback.test.ts:376-384
  - tests/b0437-producer-note-raw-send-fallback.test.ts:468-475
  - tests/helpers/scripted-live-session-harness.ts:146-149
  - tests/helpers/proto-named-harness.ts:8-12
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# b0437's binderRootDouble reconstructs the shared AJV fixture locally.

## Observation
`binderRootDouble()` in `tests/b0437-producer-note-raw-send-fallback.test.ts` constructs an `AjvSchemaValidator` with a no-op diagnostic emitter and a JSON-stringifying schema-slug function. `tests/helpers/scripted-live-session-harness.ts` exports `ajv()` with those same collaborator behaviours, using the shared `jsonSlug` function. The local root is passed to the production producer by `producerWithChannel()`.

## Evidence

Local fixture construction, `tests/b0437-producer-note-raw-send-fallback.test.ts:376-384`:
```ts
    clock: { wallNow: (): number => 0 },
    schemaValidator: new AjvSchemaValidator({
      emit: (): void => {},
      slugOf: (schema: LoweredSchema): SchemaSlug => {
        const canonicalBytes = JSON.stringify(schema);
        return { slug: canonicalBytes, canonicalBytes };
      },
    }),
  } as unknown as RuntimeRoot;
```

Canonical fixture, `tests/helpers/scripted-live-session-harness.ts:146-149`:
```ts
/** The production AJV validator (matches the sibling live-seam harnesses). */
export function ajv(): AjvSchemaValidator {
  return new AjvSchemaValidator({ emit: () => {}, slugOf: jsonSlug });
}
```

Canonical slug collaborator, `tests/helpers/proto-named-harness.ts:8-12`:
```ts
/** A content-addressing function deriving a distinct slug per distinct schema. */
export const jsonSlug: SchemaSlugFn = (schema) => {
  const bytes = JSON.stringify(schema);
  return { slug: bytes, canonicalBytes: bytes };
};
```

The local and canonical constructors both use a no-op `emit`; their slug functions each stringify the schema once and return that same string as both `slug` and `canonicalBytes`. The differences are local variable names and an inline callback versus an imported callback.

Local fixture use, `tests/b0437-producer-note-raw-send-fallback.test.ts:468-475`:
```ts
function producerWithChannel(pi: ExtensionAPI, channel: SystemNoteChannelDeps) {
  return createProductionProducerDeps({
    pi,
    root: binderRootDouble(),
    modelRegistry: binderModelRegistry(),
    systemNoteChannel: channel,
  });
}
```

The file records the copy lineage, `tests/b0437-producer-note-raw-send-fallback.test.ts:365-368`:
```ts
 * The bug-0401 binder-path root double: schemaValidator + checkpoint + clock +
 * idSource. The no-params bypass touches none of these before its emit, but the
 * plumbing is mirrored exactly so this cell shares the known-good harness.
 */
```

There is one local constructor occurrence in the seven-file review scope: `rg -n 'new AjvSchemaValidator'` over the seven briefed paths returns only `tests/b0437-producer-note-raw-send-fallback.test.ts:377`. The helper excerpts above are comparison evidence, not additional claimed local occurrences.

## Why this is a problem
This is the D7 copy-paste-fixture class: the existing test fixture independently spells out both collaborators already provided by `ajv()` under `tests/helpers/`. There is no cell-specific variation in the duplicated validator construction. The shared fixture and this local copy therefore maintain the same emitter and slug recipe in separate bodies instead of sharing the existing fixture definition; this observation concerns fixture duplication, not whether the no-params path needs schema validation.

## Suggested direction (non-binding, optional)
The existing `ajv()` export in `tests/helpers/scripted-live-session-harness.ts` is the natural shared home for the validator fixture shown here.

## False-positive check
- Gate-pin: b0437 is not a census/pin gate; the finding concerns a validator constructor, not any expected count or inventory.
- Recording-double: the cited fixture is a real validator with a no-op emitter, not a negative call-recording witness. No MUST-NOT assertion is challenged.
- docs/bugs/ signature search: `rg -n 'binderRootDouble|AjvSchemaValidator|jsonSlug' docs/bugs/0437-producer-note-sites-bypass-fallback-chain.md` returns no hits. The finding does not allege a red or a skip and does not alter the host-send failure signature.
- Coverage-matrix/bug-doc citation search: searching `docs/bugs/` and `docs/reference/coverage-matrix.md` for `b0437-producer-note-raw-send-fallback` finds the witness citation in `docs/bugs/0437-producer-note-sites-bypass-fallback-chain.md:223` and the related-controls command in `docs/bugs/0494-print-mode-failure-surface-misses-binder-endings.md:297`, with no coverage-matrix hit. No merge, rename, or deletion of the cited test file or its test cases is proposed.
- Prior-filing check: the b0437 findings PTQ-0398, PTQ-1368, PTQ-1499 and PTQ-1500 concern channel construction or parser dependencies, not this validator fixture. Searching b0437 references across `quality/issues`, `quality/resolved`, and `quality/intake` found no report identifying this AJV construction as its finding.
- Intent/history check: `git log -S 'binderRootDouble' --oneline -- tests/b0437-producer-note-raw-send-fallback.test.ts` identifies its introduction in `3742e17c`; that version and the current comment quoted above describe mirroring the bug-0401 harness. The observed duplication preserves that fixture's behaviour rather than disputing it.
- Coverage boundary: this is solely an observation about test setup that exists. It requests no new test, no behaviour change, and no change to suite composition.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — b0437:377-383 independently constructs the same real AJV validator with no-op emit and JSON.stringify-derived slug/canonicalBytes as scripted-live-session-harness.ts:146-149 plus proto-named-harness.ts:8-12; producerWithChannel uses this root, with no validator-specific variation, making this D7 copy-paste fixture duplication; no carve-out or resolved prescription protects it, and prior b0437 findings cover different causes. (triage: claude-opus-5-5)
