---
id: PTQ-1739
title: The H9a binder test name promises a success echo note that its body explicitly does not observe.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/live/acceptance/noninteractive-acceptance.test.ts:255-257
  - tests/live/acceptance/noninteractive-acceptance.test.ts:284-301
  - tests/live/acceptance/noninteractive-acceptance.test.ts:303-313
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# The H9a binder test name promises a success echo note that its body explicitly does not observe.

## Observation
The area-(d) test is named “runs the binder off-session: no envelope leak to stdout, and a success echo note surfaces”. Its body checks exit status, permitted diagnostic codes, clean stderr, and absence of a binder-envelope leak. Its closing comment explicitly states that this capture cannot observe the success note and that the channel assertion belongs to a separate offline test. The mismatch is in the existing test's name, not in the choice of capture channel or in the number of assertions.

## Evidence
`tests/live/acceptance/noninteractive-acceptance.test.ts:255-257` — the named promise:

```ts
describe("H9a-T (d) params theta forcing an OFF-session binder pass (no envelope leak; Convention: Phase 1)", () => {
  it("runs the binder off-session: no envelope leak to stdout, and a success echo note surfaces", async () => {
    const spec = featureTheta("params-binder");
```

`tests/live/acceptance/noninteractive-acceptance.test.ts:284-286` — general result checks:

```ts
    assertNoErrorExit(result, spec);
    assertCodesSubsetOfPermitted(result, spec);
    assertStderrClean(result, spec);
```

`tests/live/acceptance/noninteractive-acceptance.test.ts:288-301` — the remaining executable assertions reject leaks rather than require a success note:

```ts
    // BND-3: the runtime-internal envelope must NEVER reach stdout. A parseable
    // top-level object that validates against the per-theta envelope schema on
    // stdout is a leak regression.
    const leaked = parseEmittedJson(result.stdout);
    const asEnvelope = validatesAgainstBinderEnvelope(leaked, envelope);
    expect(
      asEnvelope.ok,
      `${spec.label}: the off-session binder envelope leaked to stdout: ` +
        `${result.stdout}`,
    ).toBe(false);
    expect(
      /"kind"\s*:\s*"(ok|needs_info|ambiguous)"/.test(result.stdout),
      `${spec.label}: a raw binder envelope discriminator leaked to stdout: ${result.stdout}`,
    ).toBe(false);
```

`tests/live/acceptance/noninteractive-acceptance.test.ts:303-313` — the test itself states the observation boundary, then ends:

```ts
    // BND-1: the `bind_echo` success note is the observable proof of a
    // successful bind, but it is emitted on the `theta-system-note` channel — NOT
    // on `pi -p` print-mode text stdout (custom system-note renderer output is
    // not streamed to print-mode stdout; DOC-73 / FIND-S7-4 / D2). The
    // black-box acceptance harness captures only stdout/stderr, so it cannot and
    // must not assert the note on stdout — that channel observation is pinned
    // offline by `tests/e2e-s5-binder-echo-emission.test.ts`, which asserts the
    // `Running /<stem>: …` note on the theta-system-note channel. Here the spec-promised stdout
    // observables are the ones asserted above: no-error exit, permitted codes,
    // and no envelope leak.
  });
```

## Why this is a problem
This is the D7 misleading-test-name class. A reader selecting this test by its name or reading its passing result would infer that the run demonstrated emission of a success echo note. None of its assertions requires such a note, and its own closing explanation expressly disclaims that observation. The claim concerns that naming mismatch only; it does not ask this black-box test to acquire another channel or add a behaviour check.

## Suggested direction (non-binding, optional)
Align the name with the existing stdout/stderr checks. This is a proposed name-only adjustment to a cited test: `docs/bugs/0359-binder-param-description-segment-unauthorable.md:243` pins the selector `-t "runs the binder off-session"`, so a rename must account for that citation rather than silently removing its target.

## False-positive check
- **Gate-pin:** the cited area-(d) test is not a corpus-count or inventory pin; the manifest self-check elsewhere in the file is not challenged.
- **Recording-double:** the cited assertions inspect a real process result, not a recording double's MUST-NOT calls. The envelope-leak negative assertions remain legitimate; their names are not the disputed success-note claim.
- **docs/bugs/ signature search:** `rg -n -F 'success echo note surfaces' docs/reference/coverage-matrix.md docs/bugs` returns one hit, at `docs/bugs/0064-binder-temperature-400-newest-anthropic-models.md:615`. Its surrounding lines 614-617 explicitly record the same naming mismatch as an untouched residual, not an intentionally red or disabled witness:
  ```text
  3. `tests/live/acceptance/noninteractive-acceptance.test.ts`'s area-(d)
     `it()` title promises "a success echo note surfaces", which that black-box
     cell documents it cannot assert (the note never reaches `pi -p` stdout).
     Pre-existing, on unchanged lines, untouched.
  ```
- **Coverage-matrix/bug-doc citation search:** `rg -n -F 'runs the binder off-session' docs/reference/coverage-matrix.md docs/bugs` returns one hit, `docs/bugs/0359-binder-param-description-segment-unauthorable.md:243`, containing the test-selection command named above. `rg -n -e 'success echo note surfaces' -e 'runs the binder off-session' docs/reference/coverage-matrix.md` returns no hits. The proposed name-only adjustment and its citing document are explicitly identified above; no merge or deletion is proposed.
- **Existing-report check:** `rg -n -e 'success echo note surfaces' -e 'runs the binder off-session' quality/issues quality/resolved quality/intake` returned no hits before filing. PTQ-0764 and PTQ-1047 concern the previously repaired precondition calls and fixture-path assertions in this file, not this title.
- **Intent/history:** `git log --oneline -S 'a success echo note surfaces' -- tests/live/acceptance/noninteractive-acceptance.test.ts` identifies `a6a5953e`; reading that revision shows the same title at line 248. The current body and bug 0064's residual distinguish the intended stdout-only checks from the surviving title; this finding does not dispute the intended channel boundary.
- **Coverage boundary:** no missing test, additional assertion, suite restructuring, or production behaviour change is requested. The sole occurrence being filed is an existing name that overstates its existing body's observable.

## Triage
verdict: confirmed — The title at tests/live/acceptance/noninteractive-acceptance.test.ts:256 promises a success echo note, but the body only checks exit status, permitted codes, clean stderr and envelope non-leakage; :303-312 explicitly delegates echo observation to the offline channel test. Searches and a6a5953e reproduce; bug 0064 records this untouched residual, bug 0359's selector citation is acknowledged, and resolved PTQ-0764/PTQ-1047 address different assertions, not this D7 misleading name. (triage: claude-opus-5-5)
