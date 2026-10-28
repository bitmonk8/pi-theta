---
id: PTQ-1753
title: The literal-union group (e) suite name says its generic and mixed-union positions stay unreached while its tests assert their lowering.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/literal-union-string-enum-emission.test.ts:657
  - tests/literal-union-string-enum-emission.test.ts:685-698
  - tests/literal-union-string-enum-emission.test.ts:700-713
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# The literal-union group (e) suite name says its generic and mixed-union positions stay unreached while its tests assert their lowering.

## Observation
The group (e) `describe` name in `tests/literal-union-string-enum-emission.test.ts:657` describes the position bug 0056 reaches followed by “the three that stay unreached.” Its generic-argument cell e2 instead asserts a string enum fragment inside `items`, and its mixed-union cell e3 asserts a literal arm lowered to `const` (lines 685–713). Both bodies explicitly describe the later changes that brought those positions onto the literal sublanguage. The suite label therefore describes retained non-lowering where these existing assertions verify lowering.

## Evidence
Suite name, `tests/literal-union-string-enum-emission.test.ts:657`:
```ts
describe("bug 0055 (e) — the position bug 0056 reaches, and the three that stay unreached", () => {
```

Generic-argument cell, `tests/literal-union-string-enum-emission.test.ts:685-698`:
```ts
  it("CONTROL (e2, GENERIC ARGUMENT): `array<\"x\" | \"y\">` carries the spelled fragment inside `items`", () => {
    const lowered = lowerSource("e2", 'array<"x" | "y">');
    expect(
      lowered,
      `bug 0055 §Non-goals — \`lowerTypeExpr\`'s \`array\` branch recursed into ITSELF, never ` +
        `back into \`lowerTypeSource\`, so the element type never reached the arm. THAT ` +
        `MECHANISM IS WHAT CHANGED: bug 0164 §Fix (v0.123.0) routes the generic-ARGUMENT ` +
        `recursion through the same \`lowerLiteralSublanguage\` this file's arm reaches at the ` +
        `whole source, so \`items\` now carries schema-subset.md:80's emission verbatim — ` +
        `\`type\` first — from ONE helper, which is why the two depths cannot drift. Bug 0164 ` +
        `§Fix is the authority that moved these bytes; the cell keeps its subject, this ` +
        `emission at the generic-argument position; observed ${JSON.stringify(lowered)}`,
    ).toEqual({ type: "array", items: { type: "string", enum: ["x", "y"] } });
  });
```

Mixed-union cell, `tests/literal-union-string-enum-emission.test.ts:700-713`:
```ts
  it("CONTROL (e3, MIXED UNION): `\"x\" | string` keeps `{\"anyOf\":[{\"const\":\"x\"},{\"type\":\"string\"}]}`", () => {
    const lowered = lowerSource("e3", '"x" | string');
    expect(
      lowered,
      `bug 0055 §Non-goals — \`parseLiteralArm\` (type-text-split.ts) fails on ` +
        `\`string\`, so the whole-union literal check never fires and the source goes ` +
        `whole to \`lowerTypeExpr\`. THAT MECHANISM IS UNCHANGED; THE DISPOSITION MOVED: bug ` +
        `0184 §Fix consults the same sublanguage PER ARM of a mixed union, so the whole-source ` +
        `decline still happens and the literal ARM now lowers schema-subset.md:79's ` +
        `\`{ "const": "x" }\` while \`string\` keeps its primitive \`{"type":"string"}\`. Bug ` +
        `0184 §Fix is the authority that moved these bytes; the cell keeps its subject, the ` +
        `mixed union's emission at this position; observed ${JSON.stringify(lowered)}`,
    ).toEqual({ anyOf: [{ const: "x" }, { type: "string" }] });
  });
```

The counted smell is one suite-name occurrence; the two child cells establish the mismatch rather than additional occurrences.

## Why this is a problem
This is the D7 **misleading test names** class. A reader following the suite name would understand e2 and e3 as controls retaining the unreached literal-lowering paths. Their equality assertions enforce the opposite: the generic element must carry the string enum schema and the mixed union must carry a literal `const`. The mismatch is in the executable suite/report label, not in the number, composition, or behaviour of the tests.

## Suggested direction (non-binding, optional)
Align the group label with the current assertions while preserving the e2/e3 cell identities and their checks. This would rename their enclosing suite/report prefix: the file is cited as an offline lock by `docs/bugs/0055-literal-union-lowering-omits-type-string-vs-subs1.md`, and e2/e3 are pinned by cell identifier in `docs/bugs/0164-generic-argument-literal-lowers-permissive.md` and `docs/bugs/0184-union-arm-literal-lowers-empty-schema.md`, respectively.

## False-positive check
- **Gate-pin:** this file is not a gate/inventory test. The claim concerns the suite name at line 657, not a pinned expected count or the schema values asserted by e2/e3.
- **Recording-double:** the cited cells directly inspect lowering results; no negative recording-double witness is challenged.
- **docs/bugs/ signature search:** searched the file name and e2/e3 citations in the 0055, 0164 and 0184 bug records. The latter records contain landed `Fix (0.123.0)` and `Fix (0.115.0)` sections. The cited bodies themselves name those fixes. This is not a report about a red or disabled test, and it does not ask to change their expected behaviour.
- **Coverage-matrix/bug-doc citation search:** `rg -n 'literal-union-string-enum-emission' docs/reference/coverage-matrix.md` returned no matches. The same filename search under `docs/bugs/` found the offline-lock and cell citations named in Suggested direction. The proposed enclosing-suite rename is explicitly acknowledged there; no merge, deletion, or child-cell rename is proposed.
- **History intent:** `git log --oneline -G 'MECHANISM IS WHAT CHANGED|DISPOSITION MOVED|three that stay unreached' -- tests/literal-union-string-enum-emission.test.ts` returned commits `2f56cb0a` (0164), `153eec85` (0184), and `81600080` (0056), consistent with the bodies' stated re-derivations.
- **Existing-report check:** before filing, `rg -l 'three that stay unreached|position bug 0056 reaches' quality/intake quality/issues quality/resolved` returned no matches. Existing reports on this file's slug oracle, AJV helper, declaration accessors and sort check do not concern this suite label.
- **Coverage boundary:** every assertion used as evidence already exists. No missing test, additional path, tier change, or production-code change is alleged.

## Triage
verdict: confirmed — tests/literal-union-string-enum-emission.test.ts:657 still says “the three that stay unreached”, but e2 (:685–698) requires a string enum inside items and e3 (:700–713) requires a literal const arm; the excerpts and fix-history search reproduce, and bugs 0164/0184 confirm the superseding fixes. This is an in-scope D7 misleading suite name despite the explanatory comments; the proposed enclosing-suite rename acknowledges the bug-doc citations, coverage-matrix has no match, and no existing or resolved finding tracks or prescribes this label. (triage: claude-opus-5-5)
