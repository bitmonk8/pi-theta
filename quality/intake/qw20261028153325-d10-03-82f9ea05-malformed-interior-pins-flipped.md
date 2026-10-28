---
id: pending
title: "Bugs 0045 and 0059 still attribute silence to witness shapes re-pinned to refusal by 82f9ea05."
lens: D10
status: intake
verdict: pending
locations:
  - docs/bugs/0045-inline-empty-object-type-missing-empty-schema-body.md:233-243
  - docs/bugs/0059-params-scalar-nontype-text-recorded-and-permissive.md:983-989
  - tests/inline-empty-object-type.test.ts:734-745
  - tests/inline-empty-object-type.test.ts:773-781
  - tests/params-scalar-nontype-text-refusal.test.ts:1048-1080
  - docs/bugs/0244-colon-less-inline-object-entry-silently-discarded.md:584-596
  - docs/bugs/0244-colon-less-inline-object-entry-silently-discarded.md:697-700
sites: 2
fix_scope: localized
d10_class: decayed-pointer
wave: qw20261028153325
reported_by: lens-d10-verification (openai/gpt-6.1-sol)
date: 2026-10-28
triaged_at: e071eada0d46fdc4e5ebc1a9f3bb2a97f028d3a5
---

# Bugs 0045 and 0059 still attribute silence to witness shapes re-pinned to refusal by 82f9ea05.

## Observation
Bug 0045 describes its offline lock as keeping malformed interiors silent; its f1 and f4 cells now require bug 0244's refusal. Bug 0059 describes `p: '{junk}'` as an authorized silent under-refusal; its d10 cell now expressly says bug 0244 supersedes that disposition and requires the refusal. Commit 82f9ea05 made these changes, and bug 0244's fix record inventories the moved cells. Neither affected record contains a coordination note naming the successor or its commit.

## Evidence
Claim in bug 0045, `docs/bugs/0045-inline-empty-object-type-missing-empty-schema-body.md:233-243`:
```text
**Offline lock.** `tests/inline-empty-object-type.test.ts` (44 cells): a
registry-sourced *Message* oracle (DIAG-4 — a *Message* drift reds group (0)
first and by name); one cell per row of §Reproduction's sixteen-row position
matrix, both `params:` spellings included; the `.thetalib` spelling; the
nested, generic-argument and union-arm depths, the union-arm cells written at
the alias position because the schema-field spelling hits the unrelated capture
defect §Non-goals names; a seam table over all three `TypePosition` values, so
position-independence is asserted rather than inspected; the declaration
controls byte-unchanged; the malformed-interior family and the unterminated
family both silent, at the seam and at four document positions, which is what
pins the two-part key; the multiplicity cells; the compound-position record with
```

Current f1, `tests/inline-empty-object-type.test.ts:735-745`:
```ts
  it("RED f1: `schema S { f: { a } }` now draws bug 0244's keyless-entry refusal", () => {
    // Bug 0244 (operator adjudication) flip: `{ a }`'s lone entry `a` spells no
    // top-level `:`, so it is refused ahead of — not instead of — this rule's
    // own empty-schema-body check, which still stays silent (the interior
    // carries a token). The whole-list assertion states both facts at once.
    expectList(
      body("schema S { f: { a } }"),
      [malformedFieldLine()],
      "f1 — the interior carries a token, so this is not the empty case; the field IS discarded " +
        "as a keyless entry and draws bug 0244's refusal, added rather than substituted",
    );
```

Current f4, :773-781:
```ts
  it("RED f4: `let x: { a } = 1` now draws bug 0244's keyless-entry refusal", () => {
    // The same family at a second position: bug 0244's scoping is
    // position-independent, exactly as §(b) of its own witness states.
    expectList(
      body("let x: { a } = 1"),
      [malformedFieldLine()],
      "f4 — the malformed-interior exclusion from THIS rule (empty-schema-body) is " +
        "position-independent; bug 0244's own refusal is position-independent too",
    );
```

Claim in bug 0059, `docs/bugs/0059-params-scalar-nontype-text-recorded-and-permissive.md:983-989`:
```text
  default literal). (2) The authorized under-refusal: a brace-carrying
  fragment that reaches the judgement WHOLE stays silent — `p: '{junk}'`,
  the unterminated `p: '{a: string'`, `string | {a: ???}`,
  `array<{a: ???}>` — pinned by witness cells d11–d13 and stated normatively
  in the row's *Trigger*; the malformed-inline-interior family behind those
  bytes is bugs 0133/0159's territory reached at this position, not a new
  class. (3) The `a: Triage`/`a: Tirage` spelling drift across the three
```

The corresponding `{junk}` witness is d10, `tests/params-scalar-nontype-text-refusal.test.ts:1048-1059`:
```ts
  it("RED (d10, bug 0244 supersedes the authorized under-refusal): `{junk}` now draws bug 0244's refusal", () => {
    // `{junk}`'s brace-rooted text reaches `isUnspellableTextRefusable`'s
    // decline whole and silent — the "authorized under-refusal" this file's own
    // header records (operator grant), and the reason this cell reports `[]` at
    // HEAD `537c274c`. Bug 0244 (operator adjudication) supersedes that grant
    // for exactly this shape, so the flip observed under this change is an
    // ADDED refusal: `junk` is a
    // KEYLESS inline-object entry (no top-level `:`, no stray close token)
    // reached at a `Type` position through the same recursive parse, so
    // `TypeParser.parseObject` refuses it before the catch-all's own silence is
    // reached. The LOWERED bytes are unmoved — the document is refused, but the
    // direct `lowerTypeExpr` bytes this loop's other rows assert are a separate
```

Its assertion, :1061-1070:
```ts
    const label = "d10 (authorized under-refusal, brace-rooted junk)";
    const doc = paramsDoc("{junk}");
    expect(
      diagLines(doc),
      `${label}: bug 0244 refuses the keyless entry \`junk\`; a red reporting \`[]\` is a route ` +
        `that lost that refusal`,
    ).toEqual([
      "error theta/parse/malformed-schema-field: malformed schema field; each field is 'name: " +
        "Type' or 'name as \"WireName\": Type'",
    ]);
```

Successor inventory, `docs/bugs/0244-colon-less-inline-object-entry-silently-discarded.md:584-596`:
```text
    stated at the cell (§Fix "any cell this fix flips is flipped by an ADDED
    diagnostic and stated at the cell"): `annotation-nontype-text-refusal`
    (0124, a20 return), `brace-rooted-union-arm-capture` (0095, 3f),
    `empty-object-discriminator-field-withhold` (0129, the exotic-whitespace
    row), `inline-empty-object-type` (0045, d-value / d-return /
    d-schema-feeding / f1 / f4), `inline-object-empty-field-type-truncation`
    (0237, r16 / r16c, its own `EMPTY_LIST_CELLS` re-derived 12 to 10),
    `inline-object-field-name-comparison-key` (0159, C1),
    `inline-object-quoted-field-name-refusal` (0176, H1 twice),
    `let-annotation-inline-object-compat` (0130, e1),
    `params-scalar-nontype-text-refusal` (0059, d10),
    `reserved-keyword-misfire-faces` (0242, P2). No assertion weakened, no cell
    deleted, every stated count re-derived.
```

Its note inventory, :697-700:
```text
- **Discharge notes appended:** none. Bug 0238's and bug 0252's witnesses are
  byte-unmoved, so neither report needs a note; bug 0237's witness gains two
  added lines at r16 / r16c, stated at those cells, which its own §Fix
  anticipates.
```

Searches run in this session:
- `git log --format='%h %s' -S'RED f1: \`schema S { f: { a } }\`' -- tests/inline-empty-object-type.test.ts` — the search was run with literal backticks inside the single-quoted argument, without backslashes; exact executable command below.
```sh
git log --format='%h %s' -S'RED f1: `schema S { f: { a } }`' -- tests/inline-empty-object-type.test.ts
```
  1 commit hit: 82f9ea05, bug 0244, v0.238.0.
- `git log --format='%h %s' -S'now draws bug 0244' -- tests/params-scalar-nontype-text-refusal.test.ts` — 1 commit hit, the same 82f9ea05.
- `grep -cE '0244|82f9ea05' docs/bugs/0045-inline-empty-object-type-missing-empty-schema-body.md docs/bugs/0059-params-scalar-nontype-text-recorded-and-permissive.md` — 0 matching lines in each record. Both records' appended notes were read; they coordinate other successor fixes, not 0244.

## Why this is a problem
The witness-decay rule applies when a surviving test has been re-pinned and its citing record has not recorded the supersession. Here the cited offline lock's malformed-interior silence and the named `{junk}` silence lead to assertions requiring a diagnostic. The absence of `empty-schema-body` or `params-type-not-expression` is preserved, but whole-list silence is not. This is a claim→evidence coordination gap, not a challenge to bug 0244's adjudicated refusal.

## Suggested direction (non-binding, optional)
Append dated coordination notes to the affected records naming 82f9ea05 / bug 0244 and the current f1, f4 and d10 refusal witnesses, while preserving their historical fix text.

## False-positive check
The surviving exclusion from each original rule was considered: f1/f4 still exclude `empty-schema-body`, and d10 still excludes the catch-all text refusal. The filing targets the stronger whole-list-silence claims, not those surviving exclusions or the honesty of an open residual. Each of f1, f4 and d10 was opened separately; no claim is made about the other cells in 0244's quoted inventory. The affected tests are default-suite witnesses and therefore have current proof under the brief's preflight premise; no tests were executed. The later notes on 0045 cover 0095, 0093, 0176 and 0262, while 0059's notes cover 0061, 0165 and the corpus gate; none names this flip. PTQ-1629 concerns bug 0244's own later group-(K) flip by 0256, not these records' pins. This groups the shard's affected records by the shared flipping commit and does not re-file test-title drift or gate-enforced citation form.

## Triage
verdict: questionable — decay verified independently: all excerpts and stated searches reproduce; 82f9ea05 (bug 0244, v0.238.0) changed f1/f4 in tests/inline-empty-object-type.test.ts and d10 in tests/params-scalar-nontype-text-refusal.test.ts from whole-list silence to theta/parse/malformed-schema-field, and neither owning record coordinates that flip. However, successor bug 0244 explicitly records “Discharge notes appended: none” (:697-700), with its no-note rationale; the D10 deliberate-no-note exception therefore reserves appending coordination notes for a human ruling. No duplicate found; no tests executed. (triage: claude-opus-5-5)
