---
id: PTQ-1738
title: B0520's auxiliary-envelope test contains two assertions on fixed string expressions.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/b0520-rendered-bash-output.test.ts:89-102
sites: 2
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# B0520's auxiliary-envelope test contains two assertions on fixed string expressions.

## Observation
The auxiliary-envelope test invokes `lowerResolvedToolEnvelope` and checks its returned value. Its next two assertions instead compare the literal `"(no output)"` with an empty string, directly and after trimming. Neither expression reads the returned value, the envelope, or a runtime string operation implemented by theta. The two counted sites are these individual assertions, not the entire test.

## Evidence
`tests/b0520-rendered-bash-output.test.ts:89-102` (re-read immediately before filing):
```ts
  it("lowering reads content, not opaque details or a raw-looking auxiliary field", () => {
    const sink = { diagnostic: vi.fn(), systemNote: vi.fn() };
    const envelope = {
      content: [{ type: "text", text: "(no output)" }],
      // Synthetic envelope: these must not become a new output-capture API.
      details: { output: "" },
      structuredContent: { output: "", exit_code: 0 },
    };
    const result = lowerResolvedToolEnvelope(envelope, sink);
    expect(result).toEqual(makeOk("(no output)"));
    expect("(no output)" === String("")).toBe(false);
    expect("(no output)".trim() === "").toBe(false);
    expect(sink.diagnostic).not.toHaveBeenCalled();
    expect(sink.systemNote).not.toHaveBeenCalled();
```

The two occurrences are lines 99 and 100; the surrounding lines distinguish them from the returned-value assertion and recording-double assertions.

## Why this is a problem
This is D7's assertions-that-cannot-fail class, under AGENTS.md's “Assert on real observables” principle. With the standard JavaScript built-ins used here, `String("")` is `""`, while `"(no output)".trim()` is still `"(no output)"`; both strict-equality expressions therefore always evaluate to `false`. No change in lowering, theta equality, or theta trimming can make either assertion fail. The neighboring returned-value assertion is not vacuous and is not challenged by this finding.

## False-positive check
- Gate-pin: inspected the test and its surrounding documentation/runtime controls; the two expressions are not inventory or corpus pins. No pinned count is challenged.
- Recording-double: the sink's `not.toHaveBeenCalled()` assertions are legitimate MUST-NOT witnesses and are excluded from the finding. The two cited string expressions do not read a recording double.
- docs/bugs/ signature search: searched `docs/bugs/` for `b0520-rendered-bash-output` and read `docs/bugs/0520-code-side-bash-empty-output-binds-host-placeholder.md`. It records the approved pass-through contract, the preserved accepted test bytes, and the documentation-red signature. This finding does not dispute that red, the approved runtime contract, or the runtime-value assertion.
- Coverage-matrix/bug-doc citation search: an exact-string search for the full test name in `docs/reference/coverage-matrix.md` and `docs/bugs/` returned no matches. The filename is nevertheless pinned in bug 0520's fix record and witness commands, including the statement that accepted assertions remain unchanged. This report proposes no test merge, rename, or deletion and records that constraint explicitly.
- Existing-topic check: `rg -n -F -e 'b0520-rendered-bash-output' -e "scalar's missing tail" quality/issues quality/resolved quality/intake` returned no matches before filing.
- Intent/history: `git log` and `git show 2dbc064c:tests/b0520-rendered-bash-output.test.ts` show these expressions landed with the bug-0520 fix. Their illustrative relationship to the placeholder incident does not make them dependent on the implementation under test.
- Scope: the finding concerns two existing test assertions only, not missing tests, suite composition, a production behavior change, or coverage.

## Triage
verdict: confirmed — tests/b0520-rendered-bash-output.test.ts:99-100 assert two fixed JavaScript expressions that both evaluate to false independently of lowering or theta string operations; neither is a census pin or recording-double witness, and bug 0520's preserved-witness record does not prescribe these assertions as a resolved PTQ fix. (triage: claude-opus-5-5)
