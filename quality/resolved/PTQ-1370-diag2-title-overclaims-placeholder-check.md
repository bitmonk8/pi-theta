---
id: PTQ-1370
title: the DIAG-2 test names claim every listed code's Message carries a placeholder, but only one code's Message is ever rendered
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/b0277-unapplied-generic-head-at-five-filtered-captures.test.ts:626-653
  - tests/b0282-unknown-applied-generic-head-gate-at-nine-positions.test.ts:583-621
sites: 2
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# the DIAG-2 test names claim every listed code's Message carries a placeholder, but only one code's Message is ever rendered

## Observation
`tests/b0277-...test.ts:626` names its test
`"b0277-DIAG-2: all four codes carry an E row of their own phase and a
placeholder-bearing Message"`, and `tests/b0282-...test.ts:583` names its
test `"b0282-DIAG-2: all seven codes carry an E row of their own phase and a
placeholder-bearing Message"`. In each file the body checks `severity` and
`phase` for every listed code (four in b0277, seven in b0282), but only ONE
of those codes is ever passed through the file's `msg()` renderer and checked
for placeholder substitution: b0277 calls `msg(RESERVED, [["<keyword>",
"Result"]])` alone; b0282 calls `msg(UNRESOLVED, [["<name>", "Ghost"]])`
alone. The other three codes in b0277 (`LET_MISMATCH`, `EMPTY_SCHEMA`,
`RESULT_SCHEMA`) and the other six in b0282 (`RESERVED`, `ARITY`,
`RESULT_SCHEMA`, `EMPTY_SCHEMA`, `UNSUPPORTED`, `LET_MISMATCH`) have no
`msg()` call anywhere in the `it` block, so their Message templates are never
rendered and never checked for a placeholder at all.

## Evidence

tests/b0277-unapplied-generic-head-at-five-filtered-captures.test.ts:625-654
```
describe("b0277 (DIAG-2) — every asserted code has a registry row", () => {
  it("b0277-DIAG-2: all four codes carry an E row of their own phase and a placeholder-bearing Message", () => {
    ...
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
Only `RESERVED` is passed to `msg(...)`; `LET_MISMATCH`, `EMPTY_SCHEMA` and
`RESULT_SCHEMA` appear only inside the `rows` tuple check (`code`,
`severity`, `phase`) and never inside a `msg(...)` call anywhere in this
`it` block or the enclosing `describe`.

tests/b0282-unknown-applied-generic-head-gate-at-nine-positions.test.ts:582-622
```
describe("b0282 (DIAG-2) — every asserted code has a registry row", () => {
  it("b0282-DIAG-2: all seven codes carry an E row of their own phase and a placeholder-bearing Message", () => {
    ...
    const rows = [UNRESOLVED, RESERVED, ARITY, RESULT_SCHEMA, EMPTY_SCHEMA, UNSUPPORTED, LET_MISMATCH].map(
      (code) => {
        const r = REGISTRY.find((x) => x.code === code);
        return [code, r?.severity, r?.phase] as const;
      },
    );
    expect(rows, `DIAG-2: ${REGISTRY_PATH} must carry a closed-set row for each asserted code`).toEqual([
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
Only `UNRESOLVED` is passed to `msg(...)`; the other six codes
(`RESERVED`, `ARITY`, `RESULT_SCHEMA`, `EMPTY_SCHEMA`, `UNSUPPORTED`,
`LET_MISMATCH`) never reach a `msg(...)` call in this `it` block.
Exact search: `grep -n "msg(" <file>` inside each `it` body returns exactly
one call site in each file (the one quoted above).

## Why this is a problem
A reader following the test name "all four/seven codes carry ... a
placeholder-bearing Message" would expect every listed code's Message
template to have been rendered and inspected for its placeholder — the same
guarantee DIAG-4 elsewhere in these files provides per-code (e.g.
`unresolvedLine`, `reservedLine`, `arityLine` calls throughout the earlier
groups of each file, each rendering its own code's Message with its own
fills). Here the title generalises a check performed on exactly one code to
a claim about all of the codes in the list; the other three (b0277) or six
(b0282) codes' Message columns are asserted only for existence, `severity`
and `phase`, never for carrying a placeholder or for successful
substitution. The misread: a maintainer who changes `EMPTY_SCHEMA`'s
*Message* template to drop its `<X>` placeholder, or breaks its
substitution, gets no signal from this test despite its name.

## Suggested direction (non-binding, optional)
None beyond noting that the `msg(...)` call already exists per code
elsewhere in each file (in the group-level assertions above the DIAG-2
block) — this is an observation about the title's scope not matching the
DIAG-2 `it` body's own coverage of the four/seven codes, not a design for a
fix.

## False-positive check
Gate-pin carve-out: as in the companion duplication finding, the "gate" in
the b0282 filename names the bug's own admission gate, not a corpus census
gate (`closing-gate`, `cross-cutting-gates`, `rfc-*-spec-surface-gate`,
`committed-fixture-parse-gate`, `registry-closed-set-corpus-gate`); the pin
carve-out does not cover an ordinary per-file registry row check.
Recording-double carve-out: not applicable.
docs/bugs/ signature search: `grep -rn "b0277-DIAG-2\|b0282-DIAG-2"
docs/bugs/` returned no hits — not a documented correct-reason red.
coverage-matrix/bug-doc citation search: `grep -rn "b0277-DIAG-2\|b0282-DIAG-2"
docs/reference/coverage-matrix.md docs/bugs/` returned no hits — neither test
is pinned by citation.
Coverage claim check: this finding is about the test's own body not matching
its own name for the codes it already lists and iterates — it does not argue
that more codes or a new test should exist, so it stays inside the
misleading-name class rather than drifting into coverage.

## Triage
verdict: confirmed — reproduces: excerpts match at b0277:626-653 and b0282:583-621, `grep -n "msg("` gives exactly one call in each DIAG-2 body (b0277:650 `msg(RESERVED, …)`, b0282:618 `msg(UNRESOLVED, …)`) while the `rows` tuple checks only `[code, severity, phase]`, so the "placeholder-bearing Message" clause of the title is asserted for one of four / one of seven codes; moreover the registry refutes the title outright for a code both files list — `theta/parse/result-in-schema-position`'s Message (code-registry-parse.md:70) is `'Result' has no lowered-schema form and is not permitted in a schema-feeding position`, with no placeholder — so the name states a claim the body does not check and that is false as stated; D7 misleading-name, both locations under tests/, not a gate/pin test, no docs/bugs or coverage-matrix citation of either test name (grep rc=1), and the companion d7-01 filing tracks the block's duplication not its title (triage: claude-fable-5-1)
