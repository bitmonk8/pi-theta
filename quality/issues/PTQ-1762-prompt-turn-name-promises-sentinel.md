---
id: PTQ-1762
title: The H8a prompt-turn test name promises a sentinel response while its body checks an arithmetic answer.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/live/live-production-acceptance.test.ts:76-91
  - tests/live/live-production-acceptance.test.ts:314-320
  - tests/live/live-production-acceptance.test.ts:334-337
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# The H8a prompt-turn test name promises a sentinel response while its body checks an arithmetic answer.

## Observation
The prompt-mode-turn test is named “drives one live prompt-mode turn whose assistant response contains the deterministic sentinel”. Its local sentinel is `THETA-LIVE-OK`, but the fixture asks an arithmetic question and the response assertion requires `777`. A response consisting solely of `777` satisfies that assertion without containing the named sentinel. The mismatch is the existing test name, not the arithmetic discriminator.

## Evidence
`tests/live/live-production-acceptance.test.ts:314-320` — the name and its sentinel:

```ts
describe("H8a-T — prompt-mode turn against a live model (Convention: live-host acceptance)", () => {
  it("drives one live prompt-mode turn whose assistant response contains the deterministic sentinel", async () => {
    const provider = await requireLiveProvider();
    const sentinel = "THETA-LIVE-OK";
    const workspace = plantThetaWorkspace([
      { source: "project", stem: "sentinel", text: promptTheta(sentinel) },
    ]);
```

`tests/live/live-production-acceptance.test.ts:76-80` — the fixture's default operands:

```ts
function promptTheta(
  sentinel: string,
  addends: readonly [number, number] = [263, 514],
): string {
  const [a, b] = addends;
```

`tests/live/live-production-acceptance.test.ts:85-91` — the sentinel is a label, while the requested response is the number:

```ts
    "@`A registration probe is labelled " +
      sentinel +
      ". What is " +
      a +
      " plus " +
      b +
      "? Answer with the number only.`",
```

`tests/live/live-production-acceptance.test.ts:334-337` — the actual response assertion:

```ts
      const response = await driveSlashCaptureText(handle.session, "/sentinel");
      // 263 + 514 = 777: computable only from the theta's own arithmetic
      // question, not from the model parroting an attacker-shaped token.
      expect(response).toContain("777");
```

## Why this is a problem
This is the D7 misleading-test-name class. A reader following the test name would interpret a passing result as verification that `THETA-LIVE-OK` appeared in the assistant response. The assertion instead accepts an arithmetic answer without that token, and the fixture explicitly asks for the number only. This finding does not challenge whether the live response assertion can fail or ask for additional assertions.

## Suggested direction (non-binding, optional)
A name-only adjustment could describe the arithmetic-answer observable without reinstating the retired echo demand.

## False-positive check
- **Gate-pin:** this is a live turn test, not a census or pinned-inventory gate. No count or inventory assertion is challenged.
- **Recording-double:** the response comes from the live session, not a recording double's negative-call witness.
- **docs/bugs/ signature search and live conventions:** inspected `docs/bugs/0243-verbatim-echo-drive-sentinels-read-as-prompt-injection.md`. Its line 478 records the intended conversion for this file:
  ```text
  | class-owned (0243) | `live-production-acceptance.test.ts` `promptTheta` / `typedQueryTheta` and 20 further cells | drive, render | helper bodies task-framed; 3 lockstep `toEqual` constants moved with their carrier | one prompt-mode turn drives; the typed reply validates against its declared schema |
  ```
  Thus the arithmetic discriminator is intentional and is not being filed as a bug-0243-shaped assertion defect. The cited test is neither skipped nor disabled; no documented correct-reason red is alleged. Its `requireLiveProvider()` is the prescribed fail-loud prerequisite posture.
- **Coverage-matrix/bug-doc citation search:** literal searches over `docs/reference/coverage-matrix.md` and every `docs/bugs/*.md` for `drives one live prompt-mode turn`, `assistant response contains the deterministic sentinel`, and `H8a-T — prompt-mode turn against a live model` each returned zero matching lines. Bug 0243 cites the file and helper rather than pinning this test by name. The direction above is expressly name-only, with no merge or deletion.
- **Existing-report check:** `rg -n -e 'cell 79|b145liveshadow|prompt-mode turn whose assistant|deterministic sentinel' quality/intake quality/issues quality/resolved --glob '*.md'` returned no hits before filing. The existing H9a binder-success-echo-name candidate concerns a different test and a different observable.
- **Intent/history:** `git log --oneline -S 'expect(response).toContain("777")' -- tests/live/live-production-acceptance.test.ts` identifies `f3be3b4c`. Reading that commit's diff confirms that bug 0243 deliberately changed the fixture and response discriminator to arithmetic; the current name still describes the echo observable.
- **Coverage boundary:** no missing test, new assertion, suite composition change, or production behaviour change is requested. The only filed occurrence is a name/body mismatch in an existing test.

## Triage
verdict: confirmed — The cited test title promises the THETA-LIVE-OK sentinel, but promptTheta asks for 263 + 514 with a number-only reply and the response assertion checks only "777"; f3be3b4c deliberately replaced the sentinel assertion without updating the title. This is D7 misleading-name drift in tests/, with no applicable carve-out, resolved prescription, or duplicate found; bug 0243's acknowledged helper citation does not pin the title. (triage: claude-opus-5-5)
