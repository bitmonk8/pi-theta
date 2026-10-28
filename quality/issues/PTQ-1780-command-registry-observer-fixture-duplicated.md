---
id: PTQ-1780
title: Four acceptance fixtures independently implement the command-registry observer extension.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/live/acceptance/b0508live-thetalib-invoke-static-registration.test.ts:23-33
  - tests/live/acceptance/b0513live-call-return-static-registration.test.ts:15-22
  - tests/live/acceptance/b0518live-imported-schema-member-registration.test.ts:18-25
  - tests/live/acceptance/b0518live-imported-member-runtime.test.ts:137-144
sites: 4
fix_scope: cross-module
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# Four acceptance fixtures independently implement the command-registry observer extension.

## Observation
Four scoped acceptance files embed a test extension that subscribes to `input`, recognizes a marker, reads the public `pi.getCommands()` names into a Set, and transforms the marker into ordered `name=boolean` registration observations followed by an arithmetic question. The marker, command names, prefix and punctuation vary, while the extension's event handling and registry-projection mechanism repeat. These are real-registry observers rather than semantic replacements for the parser, loader, or provider. A registry-observer fixture builder in `tests/helpers/` is the natural shared home for that repeated test instrumentation.

## Evidence
Count: four embedded observer implementations in the briefed files, each quoted below. These are near-identical fixture implementations with different input data and formatting, not identical test scenarios.

`tests/live/acceptance/b0508live-thetalib-invoke-static-registration.test.ts:23-33`:
```ts
// Public API instrumentation only; all verdicts come from the real host's
// registry. The question is task-framed arithmetic, not an echo demand.
const OBSERVER = `export default function(pi) {
  pi.on("input", event => {
    if (event.text !== "B0508 registration observation") return { action: "continue" };
    const names = new Set(pi.getCommands().map(command => command.name));
    const verdict = ["b0508-direct", "b0508-library", "b0508-healthy"]
      .map(name => name + "=" + names.has(name)).join("; ");
    return { action: "transform", text: "Registration: " + verdict + ". What is 263 plus 514? Answer with the number only." };
  });
}\n`;
```

`tests/live/acceptance/b0513live-call-return-static-registration.test.ts:15-22`:
```ts
const marker = "B0513 registry observation";
const observer = `export default function(pi) {
  pi.on("input", event => {
    if (event.text !== ${JSON.stringify(marker)}) return { action: "continue" };
    const commands = new Set(pi.getCommands().map(c => c.name));
    return { action: "transform", text: "Registration: " + ${JSON.stringify(names)}.map(n => n + "=" + commands.has(n)).join("; ") + "." + ${JSON.stringify(question)} };
  });
}\n`;
```

`tests/live/acceptance/b0518live-imported-schema-member-registration.test.ts:18-25`:
```ts
const MARKER = "B0518 registration observation";
const OBSERVER = `export default function(pi) {
  pi.on("input", event => {
    if (event.text !== ${JSON.stringify(MARKER)}) return { action: "continue" };
    const commands = new Set(pi.getCommands().map(c => c.name));
    return { action: "transform", text: "Registration: " + ${JSON.stringify(NAMES)}.map(n => n + "=" + commands.has(n)).join("; ") + "." + ${JSON.stringify(QUESTION)} };
  });
}\n`;
```

`tests/live/acceptance/b0518live-imported-member-runtime.test.ts:137-144`:
```ts
    const names = ["b0518-string-seq", "b0518-enum-par", ...Object.keys(invalid)];
    const marker = "B0518 runtime registration controls";
    const observer = join(cwd, "registry-observer.mjs");
    writeFileSync(observer, `export default function(pi) { pi.on("input", event => {
      if (event.text !== ${JSON.stringify(marker)}) return { action: "continue" };
      const commands = new Set(pi.getCommands().map(c => c.name));
      return { action: "transform", text: ${JSON.stringify(names)}.map(n => n + "=" + commands.has(n)).join("; ") + ${JSON.stringify(QUESTION)} };
    }); }\n`);
```

## Why this is a problem
This is D7 **copy-paste fixtures**: the same test-only extension mechanism is implemented in four files rather than only its marker, observed command list, and output format being scenario data. Every copy independently encodes the input continuation/transform protocol, command-name projection, Set membership serialization, and provider-question suffix. The repeated fixture implementation is the concern; this does not question the real-host registration observables, their negative controls, or the separate tests' purposes.

## False-positive check
- **Gate-pin:** inspected the four surrounding suites. Their registration observations discriminate real language-loading behavior and are not pinned corpus inventories. No expected count or closed-set gate is challenged.
- **Recording-double:** these observers read the real public command registry and preserve legitimate registration/refusal witnesses. They do not fabricate registered names or replace production semantics. The finding concerns four implementations of the observer fixture, not whether negative registration assertions can fail.
- **docs/bugs/ signature search:** read the verification records in `docs/bugs/0508-static-invoke-checks-skip-thetalib-fn-bodies.md`, `docs/bugs/0513-call-static-type-nominal-not-return-type.md`, and `docs/bugs/0518-imported-schema-member-read-types-as-receiver.md`. They retain the historical library admission and imported-iterand registration reds, plus passing real-provider controls. No documented red or correct missing-provider failure is being classified as a skip.
- **Coverage-matrix/bug-doc citation search:** the exact-filename search for these four files in `docs/reference/coverage-matrix.md` and `docs/bugs/` found citations in bugs 0508, 0513, and 0518 and none in the matrix. Bug 0508 also records preservation of the original witness commands/assertions/signatures. These pinned witnesses are acknowledged; no merge, rename, deletion, or oracle weakening is proposed.
- **Canonical-helper check:** `rg -n 'getCommands\(\)|Registration:|registry.observer|registry-observer' tests/helpers` returned four comment hits in the production-load, package-merge, cross-format-collision and watch-arming helpers, not this emitted input-observer extension. There is no claim that an equivalent canonical builder already exists; the four shown implementations establish the repeated fixture mechanism.
- **Existing-topic check:** immediately before filing, `rg -l 'registry.observer|registration observer|observer extension' quality/issues quality/resolved quality/intake` returned only `qw20261028153325-d7-01-acceptance-jsonl-observation-duplicated.md`. That candidate concerns decoding host output, not generating an observer extension. The supplied already-filed registry-oracle topics concern diagnostic-registry readers rather than this public command-registry instrumentation.
- **Intent/history:** inspected the latest file-history entries for the B0508, B0513, and B0518 files (`a04348da`, `6822ba91`, and `2760be51`). Their bug-specific scenarios and real-registry posture remain distinct; the finding isolates the repeated fixture mechanism.
- **Coverage boundary:** only existing test fixtures are judged. This does not request another witness, path coverage, a suite-composition or E2E-versus-unit change, runtime behavior changes, or changes outside `tests/`. All four excerpts were re-read with line numbers immediately before filing.

## Triage
verdict: confirmed — All four excerpts match current code and independently repeat the live input-handler, command-name Set projection and membership serialization; differences are scenario data/formatting, no equivalent helper or resolved prescribed shape exists, and bug-doc witness protections remain intact; the JSONL-decoder candidate tracks a distinct mechanism. (triage: claude-opus-5-5)
