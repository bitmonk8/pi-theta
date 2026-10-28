---
id: PTQ-1787
title: B0517's scalar fallback test name describes a missing tail while its fixture has a promoted tail.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/b0517-depth0-final-form-unit.test.ts:192-197
  - tests/b0517-depth0-final-form-unit.test.ts:31-39
  - tests/b0517-depth0-final-form-unit.test.ts:58
  - tests/b0517-depth0-final-form-unit.test.ts:94-100
  - tests/helpers/runtime-belt-probe-harness.ts:229-236
  - tests/helpers/runtime-belt-probe-harness.ts:242-244
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# B0517's scalar fallback test name describes a missing tail while its fixture has a promoted tail.

## Observation
The case named “the generic expr-statement fallback masks the scalar's missing tail” runs the source `42 43` through the production document parser and executes its resulting body. The same file's parser table explicitly identifies that source as `tail=number statements=[expr]`. The runtime case checks successful execution and the value 43 without relocating that parsed tail into a statement. The counted occurrence is the runtime case's name; the other locations establish its actual fixture path.

## Evidence
Named case, `tests/b0517-depth0-final-form-unit.test.ts:192-197`:
```ts
  it("the generic expr-statement fallback masks the scalar's missing tail", async () => {
    const probe = await strict.probeSource("42 43");
    if (probe.kind === "threw") throw probe.thrown;
    expect(probe.execution.outcome).toBe("success");
    expect(probe.execution.result.value).toBe(43);
  });
```

Production-parser wrapper, `tests/b0517-depth0-final-form-unit.test.ts:31-39`:
```ts
function document(src: string): ThetaDocument {
  return parseThetaDocument({ path: PATH, bytes: new TextEncoder().encode(FM + src) }, parseDeps());
}

function cleanDocument(src: string): ThetaDocument {
  const doc = document(src);
  expect(doc.diagnostics, "runtime fixture must pass the whole-document checks").toEqual([]);
  return doc;
}
```

Probe wiring, `tests/b0517-depth0-final-form-unit.test.ts:58`:
```ts
const strict = makeBeltProbes(cleanDocument, "b0517unit");
```

The same source's structural oracle, `tests/b0517-depth0-final-form-unit.test.ts:94-100`:
```ts
    { name: "packed scalar", src: "42 43", expected: "tail=number statements=[expr]" },
    { name: "alias-joined scalar", src: "schema X = array<integer>\n7", expected: "tail=number statements=[schema]" },
    { name: "alias-joined array", src: "schema X = array<integer>\n[1, 2]", expected: "tail=array statements=[schema]" },
    { name: "alias-joined unary", src: "schema X = array<integer>\n!true", expected: "tail=binary statements=[schema]" },
  ])("$name promotes the final expression, not its statement wrapper", ({ name, src, expected }) => {
    const body = rawBody(src);
    expect(shape(body), "bug 0517: raw final expression must occupy ThetaBody.tail").toBe(expected);
```

Shared helper comparison evidence, `tests/helpers/runtime-belt-probe-harness.ts:229-236`:
```ts
  async function probeSource(src: string): Promise<Probe> {
    const doc = parseTheta(src);
    const theta: ThetaCompositionInput = {
      slashName: bugTag,
      sourcePath,
      frontmatter: doc.frontmatter as ParsedFrontmatter,
      body: doc.body,
    };
```

The helper executes that body, `tests/helpers/runtime-belt-probe-harness.ts:242-244`:
```ts
    const binding = producer(root()).bindPromptConversation(bindInput);
    try {
      return { kind: "value", execution: await executeBody(theta.body, binding.executeDeps) };
```

All excerpts were re-read immediately before filing.

## Why this is a problem
This is D7's misleading-test-name class. A reader following the case name would understand its successful value as evidence that the executor recovers 43 from a body missing its scalar tail through the generic expression-statement fallback. The actual fixture has 43 promoted into the structural tail and executes that parsed representation. The result assertion is meaningful for that representation, but its name attributes it to a different representation and execution mechanism.

## Suggested direction (non-binding, optional)
The discrepancy concerns the case label, not the approved final-form semantics. Any eventual rename would affect a case inside the witness file cited by `docs/bugs/0517-depth0-same-line-final-form-not-promoted.md` and the control command in `docs/bugs/0516-statement-position-par-for-trailing-value-kept.md`; those citations and the preserved baseline record must be accounted for rather than silently treating this as an uncited test.

## False-positive check
- Gate-pin: this is a runtime/parser case, not a census or inventory gate. No pinned count is challenged.
- Recording-double: the finding does not dispute a negative witness or any double's recorded calls; it concerns the case name's description of the parsed body.
- docs/bugs/ signature search: searched for the filename and read bug 0517's fix record. That record states the parser now selects final-form promotion, while preserving baseline red evidence and reporting 27 passing unit cases after the fix. This finding does not challenge a documented correct-reason red or propose changing the production behavior.
- Coverage-matrix/bug-doc citation search: the exact case-name search in `docs/reference/coverage-matrix.md` and `docs/bugs/` returned no matches. The filename search returned bug 0517's witness command/baseline command and bug 0516's control command, with no coverage-matrix hit. These citations are explicitly acknowledged in the direction paragraph for any eventual label change.
- Existing-topic check: before either filing, `rg -n -F -e 'b0520-rendered-bash-output' -e "scalar's missing tail" quality/issues quality/resolved quality/intake` returned no matches.
- Intent/history: `git log` and `git show fe1b835c:tests/b0517-depth0-final-form-unit.test.ts` show this name in the bug-0517 fix commit. The documented promotion change explains why the missing-tail description no longer describes the current fixture.
- Scope: this reports a mismatch in an existing test's name and body, not a request for a fallback test, a coverage gap, suite composition, or a runtime bug. The shared helper is supporting evidence only, not another reported smell.

## Triage
verdict: confirmed — The named case executes the production-parsed `42 43` body unchanged; parseBody promotes 43 into the structural tail and executeBlock evaluates that tail rather than returning the expr-statement fallback. This is a misleading test name; the filing acknowledges the 0517 witness and 0516 control citations, and no existing issue or resolved prescription tracks this wording. (triage: claude-opus-5-5)
