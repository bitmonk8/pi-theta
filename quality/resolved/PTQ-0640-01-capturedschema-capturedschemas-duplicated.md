---
id: PTQ-0640
title: CapturedSchema interface and capturedSchemas() are byte-identical between non-literal-by-field-refusal.test.ts and discriminator-field-classifier-brace-group.test.ts, with loadRow() a near-identical third copy
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/non-literal-by-field-refusal.test.ts:190-220
  - tests/discriminator-field-classifier-brace-group.test.ts:591-624
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# CapturedSchema interface and capturedSchemas() are byte-identical between non-literal-by-field-refusal.test.ts and discriminator-field-classifier-brace-group.test.ts, with loadRow() a near-identical third copy

## Observation
Both files declare a `CapturedSchema` interface with the identical two
fields (`name`, `fields: readonly { name; typeSource }[]`) and a
`capturedSchemas(doc: ThetaDocument): CapturedSchema[]` function with an
identical four-line body (filter `SchemaDecl` statements, map to
`{ name, fields }`, defaulting `fields` to `[]`). Each file also declares its
own `loadRow(label, source, path)` function that calls the shared
`parseDoc` helper (`tests/helpers/e2e-s1.ts`) and returns a row carrying the
document's diagnostics plus `capturedSchemas(doc)`; the two `loadRow` bodies
differ only in whether the diagnostic list is split into `codes`/`lines` or
kept as one `diagnostics` array, and in the default `path` string literal.
Neither file imports the other, and no `tests/helpers/` module exports
`CapturedSchema` or `capturedSchemas`.

## Evidence
`tests/non-literal-by-field-refusal.test.ts:190-220`:
```ts
interface CapturedSchema {
  readonly name: string;
  readonly fields: readonly { readonly name: string; readonly typeSource: string }[];
}

/** One `parseDoc` row: its codes, its rendered lines, and what it captured. */
interface LoadRow {
  readonly label: string;
  readonly codes: readonly string[];
  readonly lines: readonly string[];
  readonly schemas: readonly CapturedSchema[];
}

/** The schema declarations a document captured, in source order. */
function capturedSchemas(doc: ThetaDocument): CapturedSchema[] {
  return doc.body.statements
    .filter((s): s is SchemaDecl => s.kind === "schema")
    .map((s) => ({
      name: s.name,
      fields: (s.fields ?? []).map((f) => ({ name: f.name, typeSource: f.typeSource })),
    }));
}

function loadRow(label: string, source: string, path = "bug0128.theta"): LoadRow {
  const doc = parseDoc(source, path);
  return {
    label,
    codes: doc.diagnostics.map((d) => d.code),
    lines: doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    schemas: capturedSchemas(doc),
  };
}
```

`tests/discriminator-field-classifier-brace-group.test.ts:591-624` — the
`CapturedSchema` interface and `capturedSchemas` body are byte-identical to
the excerpt above (confirmed by direct side-by-side reading of both cited
ranges immediately before filing); `loadRow` diverges only in the fields
noted:
```ts
interface CapturedSchema {
  readonly name: string;
  readonly fields: readonly { readonly name: string; readonly typeSource: string }[];
}

/** One `parseDoc` row: the rendered diagnostic list and every captured field. */
interface LoadRow {
  readonly label: string;
  readonly diagnostics: readonly string[];
  readonly schemas: readonly CapturedSchema[];
}

/** The declarations a document captured, in source order. */
function capturedSchemas(doc: ThetaDocument): CapturedSchema[] {
  return doc.body.statements
    .filter((s): s is SchemaDecl => s.kind === "schema")
    .map((s) => ({
      name: s.name,
      fields: (s.fields ?? []).map((f) => ({ name: f.name, typeSource: f.typeSource })),
    }));
}

/**
 * Load one fixture through the shipped front end and read back both cells the
 * substitution must not move. The declaration names travel in the row, so a
 * fixture whose declaration vanished reds by naming the absent schema rather
 * than by an empty field list that reads as a legitimate discard.
 */
function loadRow(label: string, source: string, path = "bug0096.theta"): LoadRow {
  const doc = parseDoc(source, path);
  return {
    label,
    diagnostics: doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    schemas: capturedSchemas(doc),
  };
}
```

Exact search: `grep -n "^function capturedSchemas" tests/*.test.ts` returns
exactly these two files, one match each — no third copy exists.

## Why this is a problem
This is the "Boilerplate duplication" class: the identical `CapturedSchema`
shape and the identical `capturedSchemas()` walk (filter `SchemaDecl`
statements out of `doc.body.statements`, project `name`/`fields`) is
hand-written twice for two files that both test the same
`src/parser/schema-declarations.ts` discriminator-detection seam through the
same `parseDoc` front door, and the surrounding `loadRow()` wrapper that
combines a parsed document's diagnostics with its `capturedSchemas()`
capture is written a third time in near-identical but incompatible shape (one
splits `codes`/`lines`, the other keeps one `diagnostics` array), so a caller
comparing the two files' row shapes must first normalise which layout each
uses. A change to how a schema declaration's field list is captured (for
example, to add a field the classifier reads) would need to land in both
files' copies of `capturedSchemas` to keep the two seam-suites' captures in
sync with each other and with the classifier they exercise.

## Suggested direction (non-binding, optional)
A shared `CapturedSchema`/`capturedSchemas()` export beside `parseDoc` in
`tests/helpers/e2e-s1.ts` (which already centralises the `parseThetaDocument`
front door these two files' `loadRow()` calls into) is the home this pair of
byte-identical copies already points at; naming that shape is observation,
not a design for the change.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; not applicable.
- Recording-double check: `capturedSchemas` is an inert projection over a
  parsed document, not a recording double backing a "never called" witness;
  the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "capturedSchemas\|CapturedSchema"
  docs/bugs/*.md` → 0 hits; no documented correct-reason-red names this
  helper or states a reason the two copies must diverge.
- coverage-matrix/bug-doc citation search: `grep -n
  "non-literal-by-field-refusal\|discriminator-field-classifier-brace-group"
  docs/reference/coverage-matrix.md` → 0 hits outside the files' own
  self-reference in each other's doc comments (each names the other as the
  sibling seam witness, neither pins the `capturedSchemas` block
  specifically). This finding proposes no merge, rename, or deletion of
  either file or any `it()`/`describe()` — only that the shared capture
  helper could be imported rather than re-derived.
- Prior-finding overlap check: `grep -rl "capturedSchemas" quality/intake
  quality/resolved` → 0 hits before this filing. The existing
  `qw20260917154546-d7-02-schema-declarations-span-site-withcode-duplicated.md`
  candidate covers the same two files' separately-declared `span()`/`site()`/
  `withCode()` seam-call helpers at different line ranges (34-46 and
  502-510/673-680) under a disjoint root cause; it does not mention
  `CapturedSchema`, `capturedSchemas`, or `loadRow`.
- Coverage-drift check: the claim is about a repeated helper DEFINITION, not
  a missing test path; each copy is exercised by its own file's tests.

## Triage
<!-- triage appends here -->
verdict: confirmed — independently re-verified: both excerpts reproduce at the cited lines and a diff of the two capturedSchemas bodies (non-literal-by-field-refusal.test.ts:204-211 vs discriminator-field-classifier-brace-group.test.ts:604-611) is byte-identical, as is the CapturedSchema interface; grep of function/interface definitions across src/ tests/ tools/ extensions/ returns exactly these two files and tests/helpers/ exports neither name; both locations are tests/ and the class is D7 boilerplate duplication with no gate/recording-double carve-out; no resolved or open PTQ names either file (sibling intake d7-02 covers the disjoint span/site/withCode block), and the same load-harness redeclaration class was confirmed and fixed in PTQ-0206/0207/0409. Two non-load-bearing inaccuracies noted: the docs/bugs search actually returns 1 hit (docs/bugs/0129…:1042 cites the brace-group copy at drifted lines :556–563 as evidence for a FIXED bug — a line citation, not a stated reason the copies must diverge, and no test merge/rename/delete is proposed), and only non-literal…:731 names the sibling, not both ways (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
