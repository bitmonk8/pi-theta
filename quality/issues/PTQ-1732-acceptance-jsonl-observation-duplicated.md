---
id: PTQ-1732
title: Eight acceptance files repeat the JSONL message-observation harness.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/live/acceptance/b0505live-invoked-prompt-imports.test.ts:51-56
  - tests/live/acceptance/b0506live-lib-invoke-schema-declaring-scope.test.ts:122-127
  - tests/live/acceptance/b0508live-thetalib-invoke-static-registration.test.ts:63-65
  - tests/live/acceptance/b0513live-call-return-static-registration.test.ts:75-77
  - tests/live/acceptance/b0514live-fn-query-call-boundary.test.ts:53-55
  - tests/live/acceptance/b0518live-imported-member-runtime.test.ts:41-43
  - tests/live/acceptance/b0518live-imported-schema-member-registration.test.ts:61-63
  - tests/live/acceptance/b0520-rendered-bash-output.test.ts:52-54
sites: 8
fix_scope: cross-module
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# Eight acceptance files repeat the JSONL message-observation harness.

## Observation
Eight scoped acceptance files independently trim and split the captured host stdout, parse each JSONL row into a local event shape, reject a top-level `theta_result` property across the complete stream, and project the defined `message_end` messages. The sequence is the same before the files' different import, registration, invocation, runtime, and rendering assertions. Differences are local callback names, readonly annotations, diagnostic wording, and a truthiness check instead of an undefined check in the runtime file. A real-pi JSONL observation helper under `tests/helpers/` is the natural shared home for this repeated harness sequence.

## Evidence
Count: eight source-level harness sequences in the briefed files, all reproduced below; this is not a count of generated test cases or of every JSONL reader in the repository. The copies are near-identical, not byte-identical.

`tests/live/acceptance/b0505live-invoked-prompt-imports.test.ts:51-56`:
```ts
          const events = result.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line) as {
            readonly type?: string;
            readonly message?: Message;
          });
          expect(events.filter((event) => "theta_result" in event), "outer prompt host cannot inherit worker root state").toEqual([]);
          const messages = events.flatMap((event) => event.type === "message_end" && event.message !== undefined ? [event.message] : []);
```

`tests/live/acceptance/b0506live-lib-invoke-schema-declaring-scope.test.ts:122-127`:
```ts
        const events = result.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line) as {
          readonly type?: string;
          readonly message?: Message;
        });
        expect(events.filter((event) => "theta_result" in event), "B0506 outer host must not inherit another invocation's subagent-root regime").toEqual([]);
        const messages = events.flatMap((event) => event.type === "message_end" && event.message !== undefined ? [event.message] : []);
```

`tests/live/acceptance/b0508live-thetalib-invoke-static-registration.test.ts:63-65`:
```ts
        const events = result.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line) as { readonly type?: string; readonly message?: Message });
        expect(events.filter(event => "theta_result" in event), "new outer host must not inherit worker subagent-root state").toEqual([]);
        const messages = events.flatMap(event => event.type === "message_end" && event.message !== undefined ? [event.message] : []);
```

`tests/live/acceptance/b0513live-call-return-static-registration.test.ts:75-77`:
```ts
        const events = result.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line) as { type?: string; message?: Message });
        expect(events.filter(e => "theta_result" in e), "no inherited outer worker envelope").toEqual([]);
        const messages = events.flatMap(e => e.type === "message_end" && e.message !== undefined ? [e.message] : []);
```

`tests/live/acceptance/b0514live-fn-query-call-boundary.test.ts:53-55`:
```ts
        const events = result.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line) as { readonly type?: string; readonly message?: Message });
        expect(events.filter(event => "theta_result" in event), "prompt-mode outer host must not inherit a worker root").toEqual([]);
        const messages = events.flatMap(event => event.type === "message_end" && event.message !== undefined ? [event.message] : []);
```

`tests/live/acceptance/b0518live-imported-member-runtime.test.ts:41-43`:
```ts
  const events = result.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line) as { type?: string; message?: Message });
  expect(events.filter(e => "theta_result" in e), "complete JSONL has no foreign worker envelope").toEqual([]);
  const messages = events.flatMap(e => e.type === "message_end" && e.message ? [e.message] : []);
```

`tests/live/acceptance/b0518live-imported-schema-member-registration.test.ts:61-63`:
```ts
    const events = result.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line) as { type?: string; message?: Message });
    expect(events.filter(e => "theta_result" in e), "complete stream has no inherited worker envelope").toEqual([]);
    const messages = events.flatMap(e => e.type === "message_end" && e.message !== undefined ? [e.message] : []);
```

`tests/live/acceptance/b0520-rendered-bash-output.test.ts:52-54`:
```ts
    const events = result.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line) as { readonly type?: string; readonly message?: Message });
    expect(events.filter(event => "theta_result" in event), "prompt-mode host must not inherit a worker return envelope").toEqual([]);
    const messages = events.flatMap(event => event.type === "message_end" && event.message !== undefined ? [event.message] : []);
```

## Why this is a problem
This is D7 **boilerplate duplication** in an existing observation harness. Eight independent copies encode the same JSONL admission, complete-stream envelope exclusion, and completed-message projection before any scenario-specific oracle. The separate scenarios do not explain repeating that transport-observation sequence. The envelope assertion is a legitimate negative witness and is not described as vacuous; the finding is the repeated harness implementation, not its runtime behavior or the existence of separate tests.

## False-positive check
- **Gate-pin:** inspected all eight surrounding suites; they exercise real-host behavior rather than corpus inventories or sanctioned count re-derivations. No count pin is challenged.
- **Recording-double:** the cited code decodes real subprocess output. Complete-stream envelope absence is a legitimate MUST-NOT observation; no recording-double assertion or negative witness is challenged.
- **docs/bugs/ signature search:** inspected the status and verification sections of bugs 0505, 0506, 0508, 0513, 0514, 0518, and 0520. Their records distinguish historical import/validation/registration/MatchError/documentation reds from passing controls. This report treats none of those reds as a skip or a failure of the test and preserves their distinct oracles.
- **Coverage-matrix/bug-doc citation search:** the exact-filename search for all eight sites in `docs/reference/coverage-matrix.md` and `docs/bugs/` returned citations in bugs 0505, 0506, 0508, 0513, 0514, 0517, 0518, and 0520, and none in the matrix. These filenames are pinned witnesses. In particular, bug 0520 records that accepted source bytes and assertions were unchanged after its fix. No merge, rename, deletion, weakening, or reinterpretation of any test is proposed here.
- **Helper check:** read `tests/helpers/pi-print-fixture-harness.ts`; it houses real-pi fixture/spawn orchestration, not this JSONL projection. `rg -n 'JSONL|message_end|theta_result' tests/helpers/pi-print-fixture-harness.ts` returned no matches. This report does not claim that an existing helper already implements the complete sequence.
- **Existing-topic check:** `rg -l 'JSONL.*(duplic|repeat)|message_end.*(duplic|repeat)|registry.observer|registration observer|observer extension' quality/issues quality/resolved quality/intake` returned no matches before filing. The supplied already-filed list's workspace-lifecycle, fail-closed-marker, model-double, and offline runtime-fixture topics do not identify this stream-decoding sequence.
- **Intent/history:** the inspected latest file-history entries identify bug-specific landings (`3383e9b0` for B0505, `a04348da` for B0508, `6822ba91` for B0513, and `2760be51` for B0518). Those distinct scenario purposes remain intact; the repeated unit is only transport observation.
- **Coverage boundary:** the claim is confined to eight existing test harness sequences. It requests no additional test, path coverage, suite-composition change, E2E-versus-unit change, or production-code change. All excerpts were re-read with line numbers immediately before filing.

## Triage
verdict: confirmed — All eight excerpts match exactly at the cited lines and repeat the same real-host JSONL parsing, complete-stream envelope exclusion and completed-message projection; this is D7 boilerplate duplication without changing the distinct documented witness oracles, and no existing issue or resolved prescribed shape covers it. (triage: claude-opus-5-5)
