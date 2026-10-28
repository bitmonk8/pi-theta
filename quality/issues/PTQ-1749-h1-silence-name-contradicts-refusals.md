---
id: PTQ-1749
title: H1 names h1–h3 as silent while asserting refusals for h1 and h3.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/inline-object-quoted-field-name-refusal.test.ts:953
  - tests/inline-object-quoted-field-name-refusal.test.ts:968-980
  - tests/inline-object-quoted-field-name-refusal.test.ts:998-1012
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# H1 names h1–h3 as silent while asserting refusals for h1 and h3.

## Observation
The H1 test in `tests/inline-object-quoted-field-name-refusal.test.ts` says that “h1–h3 keep their silence”. Its table instead expects a malformed-field diagnostic for `{ a }` and `{ a, b: integer }`, leaving only `{ a: }` silent among those three rows. The test compares the parsed diagnostic lists to that table, and its assertion message explicitly attributes the two refusals to bug 0244. The name and the asserted diagnostic disposition therefore describe different contracts.

## Evidence
`tests/inline-object-quoted-field-name-refusal.test.ts:953` — the test name:

```ts
  it("H1: h1–h3 keep their silence and their lowered bytes; h4's generic argument is now refused (bug 0233)", () => {
```

`tests/inline-object-quoted-field-name-refusal.test.ts:968-980` — the first three rows require diagnostics on h1 and h3, with an empty list only on h2:

```ts
      [
        "{ a }",
        [malformedFieldLine()],
        { type: "object", properties: {}, required: [], additionalProperties: false },
      ],
      [
        "{ a: }",
        [],
        { type: "object", properties: {}, required: [], additionalProperties: false },
      ],
      [
        "{ a, b: integer }",
        [malformedFieldLine()],
```

`tests/inline-object-quoted-field-name-refusal.test.ts:998-1012` — those expected lists are compared with parsed diagnostics, and the assertion explains the refusals:

```ts
    for (const [type, want, lowered] of cells) {
      actualLines[type] = lines(annotSrc(type));
      expectedLines[type] = [...want];
      actualLowered[type] = lowerQueryResponseSchema(type, [], []);
      expectedLowered[type] = lowered;
    }
    expect(
      actualLines,
      "H1 — `inlineObjectFieldKeys` sees no key at all for `{ a }`'s and `{ a, b: integer }`'s " +
        "keyless `a` entry, and bug 0244 (operator adjudication) now refuses each at the loop " +
        "before the raw-key split ever runs; `{ a: }` is colon-present and stays silent, so a " +
        "red there means the fix was keyed at `parseObject`'s tolerant `else` branch instead " +
        "(§Fix A1 site (i)) and widened into 0045's reserved family. A `[]` on the generic-" +
        "argument cell is bug 0233's withheld gate returning",
    ).toEqual(expectedLines);
```

## Why this is a problem
This is the D7 misleading-test-name class. A reader following the test name would take a passing H1 as evidence that all three boundary spellings remain diagnostically silent. In fact, removing the refusals from h1 and h3 would fail this test: it enforces the opposite disposition for those two rows. The issue is the name of existing test code, not the intended behaviour of the parser or the assertions.

## Suggested direction (non-binding, optional)
Align the H1 name with its current diagnostic dispositions while retaining its H1 identity. This entails renaming a cited witness: `docs/bugs/0244-colon-less-inline-object-entry-silently-discarded.md:592` names this file's H1 cell, and `docs/bugs/0176-quoted-inline-field-key-admitted-and-lowered-verbatim.md:992-993` names the file as its witness. No merge or deletion is proposed.

## False-positive check
- **Gate-pin:** neither scoped filename is a gate test. This finding concerns H1's diagnostic wording, not any pinned count or inventory.
- **Recording-double:** the evidence is a parsed diagnostic-list equality, not a negative witness through a recording double.
- **docs/bugs/ signature search:** searched both scoped filenames and H1-related text in `docs/bugs/`. Bug 0244 documents the intentional addition of these diagnostics, rather than an open correct-reason red. Its fix record at `docs/bugs/0244-colon-less-inline-object-entry-silently-discarded.md:590-592` says:
  ```text
    (0237, r16 / r16c, its own `EMPTY_LIST_CELLS` re-derived 12 to 10),
    `inline-object-field-name-comparison-key` (0159, C1),
    `inline-object-quoted-field-name-refusal` (0176, H1 twice),
  ```
  The filing accepts that change and does not ask for silence to be restored.
- **Coverage-matrix/bug-doc citation:** `rg -n -F 'inline-object-quoted-field-name-refusal' docs/reference/coverage-matrix.md` returned no matches. The bug-doc search found the H1 citation above and the original witness citation at `docs/bugs/0176-quoted-inline-field-key-admitted-and-lowered-verbatim.md:992-993`:
  ```text
  - `tests/inline-object-quoted-field-name-refusal.test.ts` (**1032** lines,
    16 cells) — the witness §Fix *Common obligations* specifies.
  ```
  The direction explicitly acknowledges renaming a cited test and retains its cell identity.
- **History intent:** `git show 82f9ea05 -- tests/inline-object-quoted-field-name-refusal.test.ts` shows bug 0244 changing the two empty expected lists to `[malformedFieldLine()]` and updating the explanatory assertion text without changing this test name. The finding does not challenge that adjudication.
- **Existing-finding search:** searched the scoped filenames and H1/silence wording across `quality/intake`, `quality/issues`, and `quality/resolved`. Existing findings concern helper duplication or other witness/document relationships; no matching H1-name finding was found.
- **Scope:** no missing test, suite composition, runtime risk, or production behaviour claim is made. This is solely a name/body mismatch in an existing test.

## Triage
verdict: confirmed — H1 at tests/inline-object-quoted-field-name-refusal.test.ts:953 promises h1–h3 silence, but :968-980 expects malformedFieldLine() for h1/h3 and only h2 remains silent; :998-1012 compares the unfiltered parsed diagnostics against those expectations. Commit 82f9ea05 and bug 0244 §Fix independently verify the intentional diagnostic flip without a title update. This is D7 misleading-name drift despite the explanatory comment; witness citations are acknowledged, no carve-out applies, and searches found no duplicate or resolved ruling prescribing this title. (triage: claude-opus-5-5)
