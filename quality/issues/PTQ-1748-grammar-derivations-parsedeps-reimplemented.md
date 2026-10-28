---
id: PTQ-1748
title: tools-entry-grammar-derivations-lockstep.test.ts reimplements the canonical offline parse dependency fixture.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/tools-entry-grammar-derivations-lockstep.test.ts:715-725
  - tests/tools-entry-grammar-derivations-lockstep.test.ts:727-733
  - tests/helpers/e2e-s1.ts:61-70
  - tests/helpers/e2e-s1.ts:91-94
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# tools-entry-grammar-derivations-lockstep.test.ts reimplements the canonical offline parse dependency fixture.

## Observation
`tools-entry-grammar-derivations-lockstep.test.ts` defines `makeParseDeps`, supplying three system-note no-ops and a model matcher that always returns `"resolved"`. Its `diagsOf` wrapper passes that fixture to `parseThetaDocument`. `tests/helpers/e2e-s1.ts` already exports `parseDeps`, assembling those same dependency fields through `inertSystemNote` and `resolvingMatcher`. The inventory is one local reimplementation of that existing helper, not a claim about every parse fixture in the repository.

## Evidence
Local fixture, `tests/tools-entry-grammar-derivations-lockstep.test.ts:715-725`:
```ts
function makeParseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = {
    resolve: (): "resolved" => "resolved",
  };
  return { systemNote, modelMatcher };
}
```

Its consumer, `tests/tools-entry-grammar-derivations-lockstep.test.ts:727-733`:
```ts
function diagsOf(src: string): readonly Diagnostic[] {
  const source: ThetaSource = {
    path: PARSE_FILE,
    bytes: new TextEncoder().encode(src),
  };
  return parseThetaDocument(source, makeParseDeps()).diagnostics;
}
```

Canonical dependency components, `tests/helpers/e2e-s1.ts:61-70`:
```ts
/** An in-band, no-op system-note channel that discards emitted batches. */
function inertSystemNote(): SystemNoteChannelDeps {
  const pi: SystemNoteSender = { sendMessage: (): void => {} };
  return { pi, ui: { notify: (): void => {} }, emitDiagnostic: (): void => {} };
}

/** A trivially-resolving `model:` matcher (the model hook is not under test). */
const resolvingMatcher: ModelReferenceMatcher = {
  resolve: (): "resolved" => "resolved",
};
```

Canonical factory, `tests/helpers/e2e-s1.ts:91-94`:
```ts
/** Parse-theta-document deps whose seams are inert offline no-ops. */
export function parseDeps(): ParseThetaDocumentDeps {
  return { systemNote: inertSystemNote(), modelMatcher: resolvingMatcher };
}
```

All excerpts were re-read immediately before filing. The implementations are field-for-field equivalent fixtures, not textual clones: the local factory constructs its matcher per call, while the helper uses its module-level stateless matcher. Exact local search `rg -n 'makeParseDeps|helpers/e2e-s1' tests/tools-entry-grammar-derivations-lockstep.test.ts` returns two lines, the declaration at 715 and invocation at 732, with no import of the canonical module.

## Why this is a problem
This is the D7 copy-paste-fixtures/doubles class. The local factory repeats the dependency shape, all three inert callbacks, and the resolving matcher response already embodied by the shared test fixture. The duplication is in existing test harness code, independent of the malformed-entry behaviours the tests assert. `tests/helpers/e2e-s1.ts` is the natural shared home as an observation: it already exports this exact offline parsing dependency fixture.

## False-positive check
- Gate-pin: the cited code is a dependency factory and its parser call, not a pinned inventory or expected count. No census, registration-set pin, or sanctioned re-derivation is challenged.
- Recording-double: neither implementation records calls; all three callbacks are inert. No negative witness or MUST-NOT assertion is classified as vacuous.
- docs/bugs/ signature search: `rg -n 'makeParseDeps|inertSystemNote|expectDerivedNameStillSeeded|parses byte-identically' docs/bugs docs/reference/coverage-matrix.md` returned no matches. Read bug 0106's fix/witness record at `docs/bugs/0106-tools-entry-grammar-derivations-outside-lockstep.md:993-1014` and bug 0248's group-(D) witness record at `docs/bugs/0248-malformed-escaping-tools-entry-containment-unwitnessed.md:408-417`. Those records preserve behavioural dispositions; this finding does not report a red, skip, or failure signature.
- Coverage-matrix/bug-doc citation search: `rg -n 'tools-entry-grammar-derivations-lockstep|makeParseDeps|expectDerivedNameStillSeeded|parses byte-identically' docs/bugs docs/reference/coverage-matrix.md` found file references in bugs 0106, 0107, 0248, 0253, 0267, 0268, 0271, 0275, and 0395, and no coverage-matrix match. The bug records cite behavioural witnesses, including group (D); no merge, rename, or deletion of any test is proposed.
- Prior-finding check: inspected quality-store matches for `tools-entry-grammar-derivations-lockstep`. PTQ-0722 concerns its production-load harness; PTQ-0829 its Hint reader; PTQ-1392 its registry reader; PTQ-1462 its outcome accessors; PTQ-1507 its expected-message renderer. PTQ-1358 mentions its line joiner as a remaining site. None concerns this dependency factory. The current-wave lockstep resolver-fixture candidate names the different `tools-entry-closed-grammar-lockstep.test.ts` file.
- History intent check: `git log -1 --format='%h %s' -S 'function makeParseDeps' -- tests/tools-entry-grammar-derivations-lockstep.test.ts` identifies `77592027`, bug 0106's witness addition. Reading that revision shows the same local factory. The helper's `parseDeps` addition is `d23c22be`, from `git log -1 --format='%h %s' -S 'export function parseDeps' -- tests/helpers/e2e-s1.ts`. No rationale for a distinct dependency fixture appears in the cited local block.
- Coverage boundary: the claim concerns a fixture that exists and duplicates an existing helper. It requests no additional test or assertion and makes no runtime-risk or production-behaviour claim.

## Triage
verdict: confirmed — All excerpts and stated searches reproduce: makeParseDeps at tests/tools-entry-grammar-derivations-lockstep.test.ts:715-725 duplicates e2e-s1.ts's exported parseDeps fixture (three inert callbacks and an always-resolving matcher), with its sole consumer at :732; this is mechanical D7 copy-paste-fixture duplication, no carve-out applies, and existing/resolved findings neither track this factory nor prescribe retaining it. (triage: claude-opus-5-5)
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
