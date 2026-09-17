---
id: PTQ-0447
title: b0413 and b0415 each redeclare the parseDeps/parse/ajv harness trio already centralised in tests/helpers/scripted-live-session-harness.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0413-pic51b-non-error-terminators-witness.test.ts:239-269
  - tests/b0415-governor-max-rounds-final-boundary.test.ts:222-249
  - tests/helpers/scripted-live-session-harness.ts:92-121
sites: 2                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0413 and b0415 each redeclare the parseDeps/parse/ajv harness trio already centralised in tests/helpers/scripted-live-session-harness.ts

## Observation
tests/b0413-pic51b-non-error-terminators-witness.test.ts and
tests/b0415-governor-max-rounds-final-boundary.test.ts each declare their own
module-scope `parseDeps()`, `parse(src)` and `ajv()` functions, byte-for-byte
identical to the exported `parseDeps`, `parse` and `ajv` functions already
living in tests/helpers/scripted-live-session-harness.ts. That helper's own
header states it was created to hold exactly this scaffold ("the fixture
model, the `SessionManager` entry shape, the in-flight-turn state shape, the
entry-append pair, and the document-parsing / AJV factories") for "the
bug-0288/0319/0414 prompt-mode witnesses" (PTQ-0328) after the same trio was
found duplicated verbatim across those three files. Neither b0413 nor b0415
imports from this helper; each keeps its own full copy of the three functions
instead. Both files are the same "drive the REAL producer via
`createProductionProducerDeps` → `bindPromptConversation` → `executeBody`"
prompt-mode witness lineage the helper was built for — b0413's own header
even names "the house pattern of tests/b0288-prompt-turn-completion-witness.test.ts"
as its harness lineage, and b0415's own comment above the trio reads
"Harness (b0288 scaffolding)".

## Evidence

### `parseDeps()` / `parse()` / `ajv()` in the canonical helper
tests/helpers/scripted-live-session-harness.ts:92-121:
```
export function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}

/** Parse `.theta` source through the production whole-file parser (must be clean). */
export function parse(src: string): ThetaDocument {
  const source: ThetaSource = { path: "probe.theta", bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
  expect(errors, "the fixture theta must parse cleanly before it is driven").toEqual([]);
  expect(doc.frontmatter, "the fixture theta must carry parseable frontmatter").not.toBeNull();
  return doc;
}

/** The production AJV validator (matches the sibling live-seam harnesses). */
export function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}
```

### b0413's redeclared copy (identical bodies, `export` dropped)
tests/b0413-pic51b-non-error-terminators-witness.test.ts:239-269:
```
function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}

/** Parse `.theta` source through the production whole-file parser (must be clean). */
function parse(src: string): ThetaDocument {
  const source: ThetaSource = {
    path: "probe.theta",
    bytes: new TextEncoder().encode(src),
  };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
  expect(errors, "the fixture theta must parse cleanly before it is driven").toEqual([]);
  expect(doc.frontmatter, "the fixture theta must carry parseable frontmatter").not.toBeNull();
  return doc;
}

/** The production AJV validator (matches the sibling live-seam harnesses). */
function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}
```

### b0415's redeclared copy (identical bodies, `export` dropped)
tests/b0415-governor-max-rounds-final-boundary.test.ts:222-249:
```
function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}

/** Parse `.theta` source through the production whole-file parser (must be clean). */
function parse(src: string): ThetaDocument {
  const source: ThetaSource = { path: "probe.theta", bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
  expect(errors, "the fixture theta must parse cleanly before it is driven").toEqual([]);
  expect(doc.frontmatter, "the fixture theta must carry parseable frontmatter").not.toBeNull();
  return doc;
}

/** The production AJV validator (matches the sibling live-seam harnesses). */
function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}
```

Both copies are exact matches (modulo the missing `export` keyword and a
one-line reflow in b0413's `parse` signature) of the helper's three exported
functions. `grep -rn "^function parseDeps\|^export function parseDeps"
tests/*.test.ts tests/helpers/*.ts` finds this trio in exactly these two test
files plus its one canonical home; b0288, b0319 and b0414 (the three files
PTQ-0328 fixed) already import `parseDeps`/`parse`/`ajv` from the helper and
carry no local redeclaration.

## Why this is a problem
This is the D7 "Boilerplate duplication" class: the same three-function setup
sequence (parse-deps factory, whole-document parse-and-assert-clean helper,
and the production AJV-validator factory) is repeated verbatim across two
more files in the same prompt-mode-witness lineage that already got a
`tests/helpers/` home for this exact scaffold. PTQ-0328 (resolved,
2026-09-14) already established that this trio "carries no cell-specific
variation" between the family's sibling files and centralised it in
tests/helpers/scripted-live-session-harness.ts for that reason; b0413 and
b0415 are two more files of the identical lineage (both cite
tests/b0288-prompt-turn-completion-witness.test.ts as their harness ancestor
in their own header comments) that were not part of that fix and still carry
their own full copy.

## Suggested direction (non-binding, optional)
Importing `parseDeps`, `parse` and `ajv` from tests/helpers/scripted-live-session-harness.ts
in both files, in place of the local redeclarations, would give these two
files the same treatment PTQ-0328 already gave b0288/b0319/b0414 — each
file's own `rootDouble`/`piDouble`/`ctxDouble`/session-double behaviour (which
differs meaningfully between b0413's tick-driven session and b0415's
instant-settle governor session) would stay local, since that is where this
lineage's files actually diverge.

## False-positive check
- Gate-pin: neither file matches `*gate*.test.ts` or the named
  cross-cutting-gate family; both are `bNNNN-*-witness.test.ts` bug-numbered
  files, not census/pin gates.
- Recording-double / MUST-NOT witness: this finding is about setup code
  (a parse/AJV factory trio) being redeclared, not about what any double is
  used to prove a NEVER-called fact; the recording-double carve-out does not
  apply.
- docs/bugs/ signature search: `grep -rln
  "b0413-pic51b-non-error-terminators-witness\|b0415-governor-max-rounds-final-boundary"
  docs/bugs/*.md` → docs/bugs/0413-pic51b-non-error-terminators-extract-as-ok.md
  and docs/bugs/0415-governor-max-rounds-final-boundary-ok-text.md each cite
  their own file by name as their witness, as expected for a documented
  correct-reason-red bug test; neither citation concerns the harness
  duplication observed here, and this finding proposes no merge, rename or
  deletion of either file or any of its cells — only that the shared
  parseDeps/parse/ajv trio import from the existing helper.
- coverage-matrix.md citation search: `grep -n
  "b0413-pic51b-non-error-terminators-witness\|b0415-governor-max-rounds-final-boundary"
  docs/reference/coverage-matrix.md` → no hits.
- Already-filed/resolved check: searched quality/resolved, quality/issues and
  quality/intake for "b0413", "b0415" and "scripted-live-session-harness" —
  PTQ-0328 (resolved) covers only b0288/b0319/b0414; no existing finding
  covers b0413 or b0415's copies of this trio.
- Coverage drift check: this finding does not assert any behaviour is
  untested — every cited line is setup/fixture code being redeclared, not a
  missing test or an untested path.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all three excerpts reproduce at the cited lines (helper :92-121 exported; b0413 :239-269 and b0415 :222-249 identical modulo `export` and one signature reflow), neither file imports tests/helpers/scripted-live-session-harness.ts (its only importers are b0288/b0319/b0414), both files' headers name b0288 as harness lineage and both also redeclare the helper's ANTHROPIC_MODEL / SessionEntryDouble (b0413 :115/:145, b0415 :93/:114), so this is D7 boilerplate duplication of the exact scaffold PTQ-0328 centralised — not gate tests, not cited by coverage-matrix.md, bug docs 0413/0415 cite the files only as witnesses and no merge/rename/delete is proposed; PTQ-0328 covers b0288/b0319/b0414 only and no wave sibling cites these ranges (d7-14 cites b0413 :525-556 message builders); one correction on record: the filing's grep claim "exactly these two test files plus its one canonical home" is wrong — `^function parseDeps` hits ~70 tests/*.test.ts and the full parseDeps/parse/ajv trio in this exact form also sits in b0372, b0433, b0479, b0481, prompt-provider-field-derivation, typed-query-provider-gate, typed-repair-two-phase and typed-two-phase-live, which understates the pattern but does not refute the two cited copies (triage: claude-fable-5-1)
