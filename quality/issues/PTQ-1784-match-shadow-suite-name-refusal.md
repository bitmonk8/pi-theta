---
id: PTQ-1784
title: Cell 79's suite name says shadowing refuses registration while its test requires registration.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/live/live-production-acceptance.test.ts:13083-13085
  - tests/live/live-production-acceptance.test.ts:13127-13140
  - tests/live/live-production-acceptance.test.ts:13152-13162
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# Cell 79's suite name says shadowing refuses registration while its test requires registration.

## Observation
Cell 79's `describe` title says that a match-arm binder shadowing an enclosing binding “refuses registration”. Its child test title says that the same caller registers, and the body requires the shadowing command to exist and appear in the registered-name list. The body also requires absence of the former refusal diagnostic. The resulting fully qualified test name contains opposite outcomes for the same subject.

## Evidence
`tests/live/live-production-acceptance.test.ts:13083-13085` — the suite name and child name disagree:

```ts
describe("H8a-T — bug 0145 cell 79: a `match` arm binder shadowing an enclosing binding refuses registration (Convention: live-host acceptance)", () => {
  it("cell 79: registers a caller whose `match` arm binder shadows an enclosing `let`, alongside its unshadowed sibling, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
```

`tests/live/live-production-acceptance.test.ts:13127-13140` — the shadowing subject must register:

```ts
      expect(
        handle.command("b145liveshadow"),
        "cell 79: the theta whose `match` arm binder shadows an enclosing " +
          "`let x = 1` did NOT register through the live " +
          "discovery/session_start path — `theta/parse/let-rhs-type-mismatch` " +
          'fired on a legal program (its value is the string "hi", measured ' +
          "in tests/match-arm-scope-inference-pass.test.ts cell f1) and " +
          "`hasLoadParseError` un-registered it. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.registeredNames(),
        "cell 79: Registered: " + JSON.stringify(handle.registeredNames()),
      ).toContain("b145liveshadow");
```

`tests/live/live-production-acceptance.test.ts:13152-13162` — the former refusal must be absent:

```ts
      const notes = collectSystemNotes(handle.sessionManager.getEntries());
      const refusal = letRhsMismatchFragmentCellD("m", "string", "integer");
      expect(
        notes.filter((note) => note.includes(refusal)),
        "cell 79: the theta-system-note channel still carries the " +
          "`let-rhs-type-mismatch` refusal for the shadowing theta. The " +
          "refused `integer` is `let x = 1`'s type, read through the arm " +
          "binder that shadows it, and the fragment is derived from the " +
          "registry *Message* row (DIAG-4), not transcribed. Notes: " +
          JSON.stringify(notes),
      ).toEqual([]);
```

## Why this is a problem
This is the D7 misleading-test-name class. A reader following the suite name would infer that a passing cell demonstrates registration refusal for the shadowing program, but refusing that program makes the quoted assertions fail. Although the bug number identifies a historical defect, the suite title states its outcome without distinguishing it from the current expected outcome, and the nested test name states the opposite. The finding concerns that contradictory naming, not the registration behaviour or the legitimate negative diagnostic assertion.

## Suggested direction (non-binding, optional)
A suite-name-only adjustment could distinguish the historical defect from the existing registration-success expectation, retaining the bug and cell identifiers.

## False-positive check
- **Gate-pin:** this registration test is not a census or inventory-count gate; no pin or expected count is challenged.
- **Recording-double:** the absence assertion reads settled session notes and is a legitimate negative witness. It is not alleged to be vacuous; the issue is the suite title's opposite registration outcome.
- **docs/bugs/ signature search:** inspected `docs/bugs/0145-inference-pass-no-match-arm-scope.md`, including its fix verification at lines 955-959:
  ```text
    - *Live, run for real, red-proven both directions.* Green with the fix;
      neutralising the pass edit reds it with the registration-denial observable
      (`Registered: ["b145livectl","b145livenoshadow"]` — both preconditions pass,
      only the shadowing subject is absent); restored, green. No stochastic-red
      class encountered.
  ```
  The report confirms that registration denial is the regression signal, not an intentionally red or disabled test that should be preserved. This finding neither reopens that behaviour nor changes an assertion.
- **Coverage-matrix/bug-doc citation search:** literal searches over `docs/reference/coverage-matrix.md` and every `docs/bugs/*.md` for `a \`match\` arm binder shadowing an enclosing binding refuses registration`, `cell 79: registers a caller whose \`match\` arm binder shadows`, `cell 79`, and `b145liveshadow` each returned zero matching lines. The bug document discusses the H8a registration cell without quoting these names. The suggested direction is expressly a suite-name-only adjustment, not a merge or deletion.
- **Existing-report check:** `rg -n -e 'cell 79|b145liveshadow|prompt-mode turn whose assistant|deterministic sentinel' quality/intake quality/issues quality/resolved --glob '*.md'` returned no hits before this shard's filings. Previously filed note-reader and registry-helper duplication topics in this file are not part of this observation.
- **Intent/history:** `git log --oneline -S 'cell 79: registers a caller' -- tests/live/live-production-acceptance.test.ts` identifies `eceeaf11`. Reading its test diff shows that the registration-success assertions and the conflicting suite title landed together. The child's name and the bug's verification support the existing assertions; the finding does not reinterpret the historical bug as intended current behaviour.
- **Live-suite conventions:** the quoted `requireLiveProvider()` is the prescribed fail-loud prerequisite posture, not a skip. This registration-only subject makes no assistant-text assertion and therefore does not present bug 0243's stochastic sentinel shape.
- **Coverage boundary:** no additional test, assertion, live run, suite restructuring, or production change is requested. Only the existing suite-name/body contradiction is filed.

## Triage
verdict: confirmed — All excerpts reproduce: the suite asserts registration refusal, while its child requires b145liveshadow to register and the refusal diagnostic to be absent. Bug 0145's verification and commit eceeaf11 confirm registration success is intentional; historical bug framing does not cure the contradictory title under the D7 misleading-name precedents. Documentation searches reproduce, prior-report searches find no same-root issue or prescribed resolved naming, and no gate, recording-double, documented-red, or live fail-loud carve-out applies. (triage: claude-opus-5-5)
