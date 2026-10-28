---
id: pending
title: "Bug 0061's field-discard control pins were re-pinned by d5fba72f without a coordination note."
lens: D10
status: intake
verdict: pending
locations:
  - docs/bugs/0061-nonparams-type-positions-keep-junk-arm-text-silent.md:776-782
  - docs/bugs/0061-nonparams-type-positions-keep-junk-arm-text-silent.md:1058-1059
  - docs/bugs/0061-nonparams-type-positions-keep-junk-arm-text-silent.md:1245-1248
  - tests/schema-body-nontype-text-refusal.test.ts:1037-1058
  - tests/schema-body-nontype-text-refusal.test.ts:1061-1084
  - tests/schema-alias-rhs-malformed.test.ts:1297-1313
  - tests/schema-alias-union-decl.test.ts:2344-2357
  - docs/bugs/0133-field-list-discard-recovery-unsettled.md:1216-1230
  - docs/bugs/0133-field-list-discard-recovery-unsettled.md:1279-1281
  - vitest.config.ts:4-12
sites: 1
fix_scope: localized
d10_class: decayed-pointer
wave: qw20261028153325
reported_by: lens-d10-verification (openai/gpt-6.1-sol)
date: 2026-10-28
triaged_at: e071eada0d46fdc4e5ebc1a9f3bb2a97f028d3a5
---

# Bug 0061's field-discard control pins were re-pinned by d5fba72f without a coordination note.

## Observation
Bug 0061 names the negative-field control as retaining `empty-schema-body` alone, including explicit e6 and n29 witness citations, and preserves the adjacent repeated-type control's old diagnostic pair. Commit d5fba72f changed those control expectations under bug 0133's field-retention disposition. The current assertions and the successor record confirm the re-pins. Bug 0061 carries no coordination note naming that successor.

## Evidence
Control contract, `docs/bugs/0061-nonparams-type-positions-keep-junk-arm-text-silent.md:776-782`:
```text
5. **Controls do not move.** `schema S { a: string }`, `{ a: "x" }`,
   `{ a: string | integer }`, `{ a: Cat }`, `schema X = Cat`,
   `schema X = string | integer`; `schema S { a: -1 }` keeps
   `empty-schema-body` alone unless the change states otherwise;
   `schema S { f: Cat Cat }` keeps its `empty-schema-body` plus
   `unsupported-feature`; and bug 0042's own fixtures keep exactly one
   `theta/parse/malformed-alias-rhs` each.
```

Explicit §Fix witness pins, :1058-1059:
```text
  | `tests/schema-alias-rhs-malformed.test.ts` | `e6` (fixture 3b) | **MEASURED UNMOVED** — `schema S { a: -1 }` keeps `empty-schema-body` alone; comment re-derived | §Fix constraint 7 |
  | `tests/schema-alias-union-decl.test.ts` | `n29` CONTROL | **MEASURED UNMOVED** — same `-1` control; comment re-derived | §Fix constraint 7 |
```

The fixed section repeats the disposition, :1245-1248:
```text
  group (g)); `{}` keeps bug 0045's `empty-schema-body` alone and is declined,
  never refused; `schema S { a: -1 }` and `schema X = |` keep
  `empty-schema-body` alone (both measured — the field list, resp. the arm list,
  is dropped whole before any fragment reaches the judgement); keyword-shaped
```

Current negative-field assertion, `tests/schema-body-nontype-text-refusal.test.ts:1044-1053` (f7):
```ts
    const label = "f7 (field, -1)";
    const read = readAt(label, "field", "-1");
    expect(
      read.lines,
      `${label}: the field list is retained (bug 0133 §Fix (a)), so this row's own field-type ` +
        `walk now runs beside the new malformed-schema-field line`,
    ).toEqual([
      line("theta/parse/schema-type-not-expression", "<X>", "S"),
      plainLine("theta/parse/malformed-schema-field"),
    ]);
```

Current repeated-type assertion, :1066-1075 (f8):
```ts
    const label = "f8 (field, Cat Cat)";
    const read = readDecl(label, "S", "schema S { f: Cat Cat }");
    expect(
      read.lines,
      `${label}: the comma rule's own line is unmoved, and the field list is retained rather ` +
        `than discarded, so the new row replaces the old declaration-subject line`,
    ).toEqual([
      line("theta/parse/unsupported-feature", "<construct>", "schema fields must be comma-separated"),
      plainLine("theta/parse/malformed-schema-field"),
    ]);
```

The explicitly cited e6 now asserts the same negative-field replacement, `tests/schema-alias-rhs-malformed.test.ts:1306-1313`:
```ts
    const doc = parse(F3B);
    expect(
      renderDiags(doc.diagnostics, FM_LINES),
      "e6 — the object position's own field-type walk now runs, beside bug 0133's new row",
    ).toEqual([
      `error ${SCHEMA_TYPE_NOT_EXPR}: ${msg(SCHEMA_TYPE_NOT_EXPR, [["<X>", "S"]])} @1:1-1:19`,
      `error ${MALFORMED_FIELD}: ${msg(MALFORMED_FIELD, [])} @1:16-1:17`,
    ]);
```

The explicitly cited n29 field control also changed, `tests/schema-alias-union-decl.test.ts:2344-2357`:
```ts
    expect(
      diagLines(parse(F_FIELD_NEG_LITERAL)),
      "n29 CONTROL — `schema S { a: -1 }`, the identical `-1` in the object form's field-type " +
        "position. No `Type` position in the implementation carries a negative numeric literal, " +
        "and the malformed-right-hand-side rule is a declaration-shape question this field " +
        "position never reaches, so that non-reach is unmoved. MEASURED MOVED by a DIFFERENT " +
        "authority — bug 0133 §Fix (a)2/(a)3 + §Fix constraint 5's diagnostic-registry carve-out: " +
        "the field list is now RETAINED past the offending token, so the retained field's junk " +
        "type reaches `theta/parse/schema-type-not-expression`'s judgement (the row bug 0061 " +
        "fixes below at n24) beside the new `malformed-schema-field` line",
    ).toEqual([
      line(SCHEMA_TYPE_NOT_EXPRESSION, msg(SCHEMA_TYPE_NOT_EXPRESSION, [["<X>", "S"]])),
      line(MALFORMED_FIELD, msg(MALFORMED_FIELD, [])),
    ]);
```

Successor's re-pin inventory, `docs/bugs/0133-field-list-discard-recovery-unsettled.md:1223-1228`:
```text
  | file — cell | before → after | authority |
  |---|---|---|
  | `inline-object-quoted-field-name-refusal.test.ts` — B1's b4 row | `empty-schema-body` → `malformed-schema-field` | bug 0176 §Fix **A5**: "`checkObjectSchema` … and `emptySchemaBodyDiagnostic` … are not edited; **0133 owns that path**" |
  | `schema-body-nontype-text-refusal.test.ts` — f7, f8 | f7 gains `schema-type-not-expression` + `malformed-schema-field`, loses `empty-schema-body`; f8 keeps `unsupported-feature`, loses `empty-schema-body`, gains `malformed-schema-field` | §Fix (a)2 / (a)3 + constraint 5 |
  | `schema-alias-rhs-malformed.test.ts` — e2, e6 | as f8 / as f7 | §Fix (a)2 / (a)3 + constraint 5 |
  | `schema-alias-union-decl.test.ts` — n29 | as f7 | §Fix (a)2 / (a)3 + constraint 5 |
```

Its note inventory, :1279-1281:
```text
- **Discharge notes appended:** none. Bug 0176 §Fix A5 already cedes this path
  to 0133 by name and needs no amendment; bugs 0095, 0045, 0033, 0096, 0129 and
  0153 keep every cell and every row this report names as theirs.
```

Searches run this session:
- `git log --format='%h %s' -S'GREEN (f7, field): \`schema S { a: -1 }\` retains' -- tests/schema-body-nontype-text-refusal.test.ts` was run with literal backticks, without the display escapes; the exact executable command is:
```sh
git log --format='%h %s' -S'GREEN (f7, field): `schema S { a: -1 }` retains' -- tests/schema-body-nontype-text-refusal.test.ts
```
  It returns 1 commit, d5fba72f (bug 0133, v0.203.0). Its diff replaces f7's sole empty-body expectation and f8's empty-body-plus-comma expectation with the assertions quoted above.
- `grep -cE '0133|d5fba72f' docs/bugs/0061-nonparams-type-positions-keep-junk-arm-text-silent.md` — 0 matching lines. The appended notes were read and do not coordinate these re-pins.

These files are default-suite witnesses under `vitest.config.ts:4-12`; the brief's green-preflight premise supplies current proof. No tests were executed.

## Why this is a problem
Under D10's flipped-pin rule, a surviving citation is decayed when its assertion has been deliberately re-pinned and the citing record has not coordinated the new disposition. A reader following 0061's named e6/n29 evidence now reaches assertions excluding the claimed sole `empty-schema-body` result. This is an evidence-chain update owed by the changed pins, not a challenge to bug 0133's adjudicated recovery behaviour.

## Suggested direction (non-binding, optional)
A dated coordination note can name d5fba72f / bug 0133 and the current f7/f8, e6 and n29-field-control expectations while leaving the historical fix text unchanged.

## False-positive check
The claim excerpts were re-read immediately before filing. f7, f8, e6 and the field-control branch of n29 were each opened; no conclusion about n29's separate alias assertions or the quoted `schema X = |` control is drawn. The successor record and git diff confirm the deliberate replacement of the empty-body expectation. Bug 0061's later notes concern 0124 and the corpus gate, not field retention. Existing PTQ-1590 concerns a different pointer in bug 0133's own live-witness record, not these 0061 pins. The shard's affected record is grouped under the shared flipping commit; no other record is re-listed. This is neither positional citation drift nor a request to change tests or add coverage.

## Triage
verdict: questionable — Both stated searches and all cited excerpts reproduce; d5fba72f (0.203.0) flipped f7/f8, e6 and n29's field control as claimed, and bug 0061 has no coordination note. However, successor docs/bugs/0133-field-list-discard-recovery-unsettled.md:1279-1281 explicitly records “Discharge notes appended: none” with its no-amendment rationale, already present in the flipping commit; D10's deliberate-no-note exception leaves appending a back-note for human ruling. PTQ-1590 tracks a different, never-existing live-witness path, not this flip. (triage: claude-opus-5-5)
