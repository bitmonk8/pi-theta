---
id: PTQ-1314
title: the DIAG-2 closed-set registry-row check block is duplicated near-verbatim between b0277 and b0282
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/b0277-unapplied-generic-head-at-five-filtered-captures.test.ts:625-654
  - tests/b0282-unknown-applied-generic-head-gate-at-nine-positions.test.ts:582-622
sites: 2
fix_scope: module
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# the DIAG-2 closed-set registry-row check block is duplicated near-verbatim between b0277 and b0282

## Observation
Both in-scope files end with a `describe("<bugid> (DIAG-2) — every asserted
code has a registry row", …)` block whose single `it` performs the identical
three-step sequence: (1) map an array of code constants to
`[code, r?.severity, r?.phase]` tuples via `REGISTRY.find((x) => x.code ===
code)`, (2) `expect(rows, ...).toEqual(...)` against a literal array of
`[CODE, "E", phase]` tuples, (3) call the file's local `msg(...)` on exactly
one of the codes and assert `.toContain(...)` on the interpolated placeholder.
Both files already import shared registry helpers
(`registryMessageOf`, `registryLineOf`, `PARSE_REGISTRY`,
`PARSE_REGISTRY_PATH`) from `tests/helpers/load-row-harness.ts`, but this
particular assertion shape — walking a code list against `REGISTRY.find` and
asserting the `[code, severity, phase]` triple — is written out locally in
each file rather than drawn from that shared harness.

## Evidence

tests/b0277-unapplied-generic-head-at-five-filtered-captures.test.ts:625-654
```
describe("b0277 (DIAG-2) — every asserted code has a registry row", () => {
  it("b0277-DIAG-2: all four codes carry an E row of their own phase and a placeholder-bearing Message", () => {
    // DIAG-2: the registry is closed, so a code a test asserts must have a row
    // (`reconcileClosedSet`, tools/code-registry/index.js). No code is minted
    // here. ...
    const rows = [RESERVED, LET_MISMATCH, EMPTY_SCHEMA, RESULT_SCHEMA].map((code) => {
      const r = REGISTRY.find((x) => x.code === code);
      return [code, r?.severity, r?.phase] as const;
    });
    expect(
      rows,
      `DIAG-2: ${REGISTRY_PATH} must carry a closed-set row for each asserted code`,
    ).toEqual([
      [RESERVED, "E", "parse"],
      [LET_MISMATCH, "E", "type"],
      [EMPTY_SCHEMA, "E", "parse"],
      [RESULT_SCHEMA, "E", "parse"],
    ]);
    expect(
      msg(RESERVED, [["<keyword>", "Result"]]),
      "the keyword refusal's rendered Message must carry the spelling it names",
    ).toContain("Result");
  });
});
```

tests/b0282-unknown-applied-generic-head-gate-at-nine-positions.test.ts:582-622
```
describe("b0282 (DIAG-2) — every asserted code has a registry row", () => {
  it("b0282-DIAG-2: all seven codes carry an E row of their own phase and a placeholder-bearing Message", () => {
    // DIAG-2: the registry is closed, so a code a test asserts must have a row
    // (`reconcileClosedSet`, tools/code-registry/index.js). No code is minted
    // by this report's route ...
    const rows = [UNRESOLVED, RESERVED, ARITY, RESULT_SCHEMA, EMPTY_SCHEMA, UNSUPPORTED, LET_MISMATCH].map(
      (code) => {
        const r = REGISTRY.find((x) => x.code === code);
        return [code, r?.severity, r?.phase] as const;
      },
    );
    expect(
      rows,
      `DIAG-2: ${REGISTRY_PATH} must carry a closed-set row for each asserted code`,
    ).toEqual([
      [UNRESOLVED, "E", "parse"],
      [RESERVED, "E", "parse"],
      [ARITY, "E", "parse"],
      [RESULT_SCHEMA, "E", "parse"],
      [EMPTY_SCHEMA, "E", "parse"],
      [UNSUPPORTED, "E", "parse"],
      [LET_MISMATCH, "E", "type"],
    ]);
    expect(
      msg(UNRESOLVED, [["<name>", "Ghost"]]),
      "the name refusal's rendered Message must carry the head it names",
    ).toContain("Ghost");
  });
});
```

The two blocks differ only in the list of code constants and the one code
`msg()` is called with; the mapping expression
(`REGISTRY.find((x) => x.code === code)` → `[code, r?.severity, r?.phase]`),
the `expect(rows, ...).toEqual(...)` shape, and the trailing
`msg(<one code>, [[...]]).toContain(...)` shape are identical.

## Why this is a problem
Both files already draw on `tests/helpers/load-row-harness.ts` for every other
registry read in the file (`registryMessageOf`, `registryLineOf`,
`PARSE_REGISTRY`), so the harness is the file's stated single point of
registry access, yet this one assertion shape (row-tuple-against-closed-set)
is written out separately in each file rather than drawn from it — the two
sites are the entire count of this shape in the in-scope set (2 sites, no
grep hits for this "codes → `[code, severity, phase]` tuple → toEqual" shape
elsewhere in the reviewed five files).

## Suggested direction (non-binding, optional)
A shared `expectRegistryRowsClosed(codes, expectedTuples)`-shaped assertion in
`tests/helpers/load-row-harness.ts`, alongside the other registry-oracle
helpers already exported there, would be the natural home for this repeated
shape — named as an observation about where the file's own existing registry
helpers already live, not a design.

## False-positive check
Gate-pin carve-out: `tests/b0282-unknown-applied-generic-head-gate-at-nine-positions.test.ts`
contains the substring "gate" in its filename, but it is not one of the named
census/pin-gate kin (`closing-gate`, `cross-cutting-gates`,
`rfc-*-spec-surface-gate`, `committed-fixture-parse-gate`,
`registry-closed-set-corpus-gate`); "gate" here names the bug's own
generic-head admission gate under test, not a corpus census, and the DIAG-2
block asserts per-file registry rows for the codes this file itself emits,
not a pinned corpus-wide inventory — so the carve-out does not apply.
Recording-double carve-out: not applicable, no double involved.
docs/bugs/ signature search: `grep -rn "b0277-DIAG-2\|b0282-DIAG-2\|(DIAG-2)"
docs/bugs/` returned no hits — neither block is a documented correct-reason
red.
coverage-matrix/bug-doc citation search: `grep -rn "b0277-DIAG-2\|b0282-DIAG-2"
docs/reference/coverage-matrix.md docs/bugs/` returned no hits — neither test
is cited by name, so no pin applies.
Coverage drift: this finding is about the two existing blocks' shared shape,
not about whether more codes or files should have such a block — no coverage
claim is made.

## Triage
verdict: confirmed — independently re-verified: both excerpts reproduce at the cited lines (b0277:625-654, b0282:582-622); the `codes.map(code => REGISTRY.find(x => x.code === code) → [code, r?.severity, r?.phase])` + `expect(rows, "DIAG-2: ${REGISTRY_PATH} must carry a closed-set row …").toEqual([...])` + one `msg(code, fills).toContain(...)` block is logic-identical in both, differing only in the code list and the one rendered code, and both files already alias `PARSE_REGISTRY`/`PARSE_REGISTRY_PATH`/`registryMessageOf` from tests/helpers/load-row-harness.ts which exports no row-tuple/closed-set assertion (grep severity/phase in the harness: only the RegistryRow fields); the candidate undercounts — `r?.severity, r?.phase]` greps to 4 tests/ files, b0281:662-683 (byte-identical shape, same expect text) and b0284:807-824 (same shape over `registryFor(code).rows`) carry it too, all four landed in separate commits (d0fffd87/766e4c8d/396199ef/8b39e071) so this is repeated drift, not a same-commit accident; D7 boilerplate-duplication class under tests/ only; carve-outs cleared — b0282's "gate" filename is incidental (no pinned count challenged, same ruling as PTQ-0526/0933), no recording double, both cells green (vitest 23/23), coverage-matrix 0 hits, bug docs 0277/0282 cite the files but not the DIAG-2 cells by name and a helper hoist merges/renames/deletes no test; the candidate's stated `grep "(DIAG-2)" docs/bugs/` = 0 hits is inaccurate (118 hits) but immaterial since none names either cell's signature; not a duplicate — no tracked PTQ cites the `[code, severity, phase]` tuple shape (quality/ grep 0 hits; PTQ-0526/0431/0933 cover the POSITIONS table and LoadRow/paramsTheta layers of the same files) and intake sibling d7-02 is a misleading-name filing on the same cells, a different root cause (triage: claude-fable-5-1)
