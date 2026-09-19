---
id: PTQ-1078
title: echo-value-rule1-sanitisation.test.ts redeclares TWO_PARAM_THETA byte-identical to the canonical export it could import
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/echo-value-rule1-sanitisation.test.ts:421-441
  - tests/helpers/scripted-live-session-harness.ts:175-185
  - tests/e2e-s5-binder-echo-emission.test.ts:35-40
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918220713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# echo-value-rule1-sanitisation.test.ts redeclares TWO_PARAM_THETA byte-identical to the canonical export it could import

## Observation
`tests/helpers/scripted-live-session-harness.ts` exports `TWO_PARAM_THETA`, a two-required-string-param theta source string built for exactly the "genuine binder pass, no defaulted fields" shape. `tests/echo-value-rule1-sanitisation.test.ts` already imports `parse` and `scriptEnvelope` from that same helper module (both used a few lines below its own local declaration), but instead of importing `TWO_PARAM_THETA` it declares a local `const TWO_PARAM_THETA` whose nine array elements are byte-identical to the exported one, then builds its own `twoParamTheta()` from that local copy. The sibling file in this same review's scope, `tests/e2e-s5-binder-echo-emission.test.ts`, imports the canonical `TWO_PARAM_THETA` directly and builds its own `twoParamTheta(overrides)` from the imported constant, demonstrating the import is available and sufficient.

## Evidence

`tests/echo-value-rule1-sanitisation.test.ts:421-441` (re-read immediately before filing):
```ts
const TWO_PARAM_THETA = [
  "---",
  "mode: prompt",
  "bind_model: binder-model",
  "params:",
  "  topic: string",
  "  audience: string",
  "---",
  "@`review ${topic} for ${audience}`",
  "",
].join("\n");

function twoParamTheta(): ThetaCompositionInput {
  const doc = parse(TWO_PARAM_THETA, "code-review.theta", "binder");
  return {
    slashName: "code-review",
    sourcePath: "/theta/code-review.theta",
    frontmatter: doc.frontmatter!,
    body: doc.body,
    binderModel: "binder-model",
  };
}
```

`tests/helpers/scripted-live-session-harness.ts:175-185` — the exported canonical constant, byte-identical join array:
```ts
export const TWO_PARAM_THETA = [
  "---",
  "mode: prompt",
  "bind_model: binder-model",
  "params:",
  "  topic: string",
  "  audience: string",
  "---",
  "@`review ${topic} for ${audience}`",
  "",
].join("\n");
```

`tests/e2e-s5-binder-echo-emission.test.ts:35-40` — the in-scope sibling that imports the same constant instead of redeclaring it:
```ts
import {
  binderProducerWithCapture as producerWithCapture,
  noteChannelEntries,
  parse,
  scriptEnvelope,
  TWO_PARAM_THETA,
} from "./helpers/scripted-live-session-harness";
```

Exact search: `grep -n "^const TWO_PARAM_THETA" tests/*.test.ts` returns 3 hits (`tests/b0397-binder-failure-note-runtime-event.test.ts:128`, `tests/b0401-informational-notes-omit-details.test.ts:156`, `tests/b0417-responses-binder-toolchoice-gate.test.ts:155`, all outside this review's scope) plus this file's `tests/echo-value-rule1-sanitisation.test.ts:421`; `grep -n "  TWO_PARAM_THETA" tests/*.test.ts` (the import-line form) returns `tests/binder-forced-tool-dispatch.test.ts:154` and `tests/e2e-s5-binder-echo-emission.test.ts:40`, confirming both import-style and redeclare-style usages coexist, with only the in-scope file under review choosing the redeclare style despite already importing two other symbols from the exact module the constant lives in.

## Why this is a problem
`tests/echo-value-rule1-sanitisation.test.ts` already has a live import statement reaching into `tests/helpers/scripted-live-session-harness.ts` for `parse` and `scriptEnvelope`; the module's own `TWO_PARAM_THETA` export sits a few lines below those two names in the same file and needs no additional wiring to reach. Instead the nine-line literal is retyped from scratch. A change to the canonical fixture's shape (e.g. an added third param, needed to keep exercising the "no defaulted fields" property this comment block itself explains) updates the exported constant and the three other redeclaring files but leaves this file's copy silently stale.

## Suggested direction (non-binding, optional)
The sibling in-scope file already shows the substitution is mechanical: importing `TWO_PARAM_THETA` alongside the already-imported `parse`/`scriptEnvelope` and dropping the local `const` declaration.

## False-positive check
- Gate-pin check: `tests/echo-value-rule1-sanitisation.test.ts` does not match `*gate*.test.ts` or a named gate kin; not applicable.
- Recording-double check: `TWO_PARAM_THETA` is a literal fixture string, not a fake/double backing a MUST-NOT witness; the recording-double carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "TWO_PARAM_THETA" docs/bugs/` → 0 hits; no documented correct-reason red names this constant or sanctions a local copy.
- coverage-matrix/bug-doc citation search: `grep -n "echo-value-rule1-sanitisation" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()`; it targets only the fixture-constant declaration that group G's cells consume, whose behaviour is unchanged by importing rather than retyping the literal.
- Coverage check: the claim is about a repeated fixture-constant DEFINITION, not a missing test path; every cell in the file that reads `TWO_PARAM_THETA` already exercises the local copy today.
- Prior-filing search: `grep -rl "TWO_PARAM_THETA" quality/issues quality/resolved quality/intake` returns hits in PTQ-0795, PTQ-0926, PTQ-1022, PTQ-1070, and resolved PTQ-0628, none of which cites `tests/echo-value-rule1-sanitisation.test.ts` by name (checked each file directly) — those track different files' copies of adjacent harness pieces (`CapturedCall.optionsOf`, `ThetaInput`/`driveBinder`, `binder-forced-tool-dispatch`'s root double, a second greet theta fixture), none of them the `TWO_PARAM_THETA` constant in this file.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: the local `const TWO_PARAM_THETA` at echo-value-rule1-sanitisation:421-431 and the helper's `export const` at scripted-live-session-harness:175-185 diff byte-identical modulo the `export` keyword (mktemp sed-range diff exit 0), the file's import block at :106-111 already pulls `binderProducerWithCapture`/`bindAndReadNote`/`parse`/`scriptEnvelope` from that exact module without the constant, the local copy is live (consumed by `twoParamTheta()` at :434), both stated greps reproduce exactly (4 `^const` redeclarations + 1 export; import-line form in binder-forced-tool-dispatch:154 and e2e-s5:40), docs/bugs and coverage-matrix → 0 hits, not a gate file, no recording double, no merge/rename/delete proposed; the export landed in fix commit cec9ee56 (PTQ-0628, whose locations were binder-forced-tool-dispatch + e2e-s5 only) and this site was never migrated, while resolved PTQ-0463 (:446-533 rig) and PTQ-0935 (:460-483 `bindAndReadNote`) covered adjacent ranges of this file and neither names the constant, and no same-wave sibling cites it — an in-scope D7 copy-paste fixture whose fix is a one-line import; fixer note: b0397:128, b0401:156 and b0417:155 carry the same copy and can be swept in the same pass (triage: claude-fable-5-1)
