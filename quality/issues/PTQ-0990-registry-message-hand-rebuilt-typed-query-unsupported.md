---
id: PTQ-0990
title: binder-inference-provider-mapping.test.ts hand-rebuilds the load registry's Message template instead of calling the canonical registry-oracle helper
lens: D7
status: open
verdict: confirmed
locations:
  - tests/binder-inference-provider-mapping.test.ts:782-796
  - tests/helpers/registry-oracle.ts:54-61
sites: 1
fix_scope: localized
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# binder-inference-provider-mapping.test.ts hand-rebuilds the load registry's Message template instead of calling the canonical registry-oracle helper

## Observation
`tests/binder-inference-provider-mapping.test.ts` declares a local
`registryMessage(provider, model)` function that returns a literal string
byte-matching the *Message* column of the load diagnostics registry row for
`theta/load/typed-query-unsupported-provider`, instead of reading that column
off the parsed registry through the helper `tests/helpers/registry-oracle.ts`
already exposes (`loadRowMessage` + `interpolate`) for exactly this
placeholder-substitution shape. The file imports neither
`tests/helpers/registry-oracle.ts` nor `tests/helpers/load-row-harness.ts`.

## Evidence
tests/binder-inference-provider-mapping.test.ts:782-796 (re-read immediately
before filing):
```ts
  const registryMessage = (provider: string, model: string): string =>
    `provider '${provider}' (model '${model}') is outside the theta 1.0 typed-query supported set; typed queries will fail at runtime`;

  it("theta/load/typed-query-unsupported-provider: surfaced (W) for a typed query on an unsupported provider", () => {
    const diagnostic = checkTypedQueryProviderSupport({
      file: "/theta/triage.theta",
      hasTypedQuery: true,
      api: "google-generative-ai",
      modelReference: "gemini-pro",
    });
    expect(diagnostic).not.toBeNull();
    expect(diagnostic?.severity).toBe("warning");
    expect(diagnostic?.code).toBe(TYPED_QUERY_UNSUPPORTED_PROVIDER_CODE);
    expect(diagnostic?.message).toBe(
      registryMessage("google-generative-ai", "gemini-pro"),
    );
  });
```

The normative registry row this local function reproduces
(`docs/spec_topics/diagnostics/code-registry-load.md:69`, Message column):
```
`provider '<provider>' (model '<model>') is outside the theta 1.0 typed-query supported set; typed queries will fail at runtime`
```

The canonical helper this file does not call
(tests/helpers/registry-oracle.ts:54-61):
```ts
/** The load registry Message column, refusing an absent row. */
export function loadRowMessage(code: string): string {
  return registryMessageOf(LOAD_REGISTRY, "docs/spec_topics/diagnostics/code-registry-load.md", code);
}

/** Fill the named discovery descriptors, leaving unknown placeholders intact. */
export function interpolate(template: string, subs: Record<string, string>): string {
  return template.replace(/<([a-z-]+)>/g, (whole, name: string) => subs[name] ?? whole);
```

Confirmed by grep: `registry-oracle|load-row-harness` has zero hits in
`tests/binder-inference-provider-mapping.test.ts`.

## Why this is a problem
The file's own comment two lines above the local function states "The
expected message is sourced from the *Message* column of the load
diagnostics registry … per the *Diagnostic message anchors* rule" — the
intent is exactly what `loadRowMessage` + `interpolate` already do
mechanically off the parsed registry, but the test instead retypes the
template's literal bytes by hand with its own `${provider}`/`${model}`
interpolation. A registry-row wording edit (a punctuation or clause change to
the Message column) silently desyncs this hand-copy from the row it claims to
source from — the assertion would then compare two independently-maintained
copies of the same sentence rather than the test's copy against the live
registry, which is the same drift-surface the `loadRowMessage`/`interpolate`
pair and its `fillParseMessage` sibling in the same helper file exist to
close off (registry-oracle.ts's own header: "This module centralises that
read and placeholder interpolation").

## Suggested direction (non-binding, optional)
Building the expected string via
`interpolate(loadRowMessage(TYPED_QUERY_UNSUPPORTED_PROVIDER_CODE), { provider: "google-generative-ai", model: "gemini-pro" })`
would source the assertion from the same registry the comment already claims
it does.

## False-positive check
Gate-pin carve-out: this file is not named `*gate*.test.ts` and asserts no
pinned count/inventory — inapplicable. Recording-double carve-out:
`registryMessage` is not a negative-witness double, it independently
reconstructs an expected string — inapplicable. docs/bugs/ signature search:
`grep -rn "typed-query-unsupported-provider" docs/bugs/` → 0 hits, no
open bug documents this shape. coverage-matrix/bug-doc citation search:
`grep -rln "binder-inference-provider-mapping" docs/reference/coverage-matrix.md quality/issues quality/resolved` →
only `quality/resolved/PTQ-0276-deepkeyoccurrences-duplicated.md`,
`quality/resolved/PTQ-0631-live-anthropic-overflow-message-fixture-duplicated.md`,
`quality/resolved/PTQ-0851-envelope-callinput-fixture-triplicated.md`, none of
which mention `registryMessage` or the typed-query-unsupported-provider code;
this finding is not a coverage claim (no test proposed) and does not touch
production code (tests/ only).

## Triage
verdict: confirmed — independently re-verified: the local `registryMessage` arrow at tests/binder-inference-provider-mapping.test.ts:782-783 (sole call site :796) hand-types the Message column of code-registry-load.md:69 while the file imports neither tests/helpers/registry-oracle.ts nor load-row-harness.ts (grep → 0); a mktemp node script parsing the live load shard and running `interpolate(loadRowMessage("theta/load/typed-query-unsupported-provider"), {provider, model})` yields a string `===` the hand literal, so the fold is a mechanical drop-in already ratified at tests/discovery-{cli-entry-override-prefix,glob-universe-enumeration-failure,root-enumeration-failure}.test.ts; `sites: 1` is correct (the only other occurrence of the template is the production emitter src/runtime/typed-query-provider-gate.ts:61, the subject under test, not a copy); file green 58/58; not a gate test, no recording double, no rename/merge/delete, coverage-matrix → 0; the filing's `docs/bugs` claim of 0 hits does NOT reproduce (8 hits in bugs 0010/0013/0480) but is non-material — all three are status fixed and none names `registryMessage` or this message assertion as a witness (0010:131 cites this file only for the overflow alias-key block); resolved PTQ-0276/0631/0851 cover other fixtures in this file and open PTQ-0817/0939/0729 cover other files' registry readers, so the root cause is untracked (triage: claude-fable-5-1)
