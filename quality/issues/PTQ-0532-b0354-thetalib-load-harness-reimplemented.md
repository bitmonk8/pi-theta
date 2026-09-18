---
id: PTQ-0532
title: b0354 reimplements the fakeThetaLibFs double, the bindImportedBodyOverFs bind driver, and the expectCleanImportLoad precondition already centralised in tests/helpers/thetalib-load-harness.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0354-crossfile-fn-depth-uncounted.test.ts:104-132
  - tests/b0354-crossfile-fn-depth-uncounted.test.ts:140-144
  - tests/b0354-crossfile-fn-depth-uncounted.test.ts:192-254
  - tests/b0354-crossfile-fn-depth-uncounted.test.ts:330-340
  - tests/helpers/thetalib-load-harness.ts:85-113
  - tests/helpers/thetalib-load-harness.ts:217-262
  - tests/helpers/thetalib-load-harness.ts:306-316
sites: 4                     # count of occurrences cited in Evidence (four local re-implementations, matched against three exported helpers)
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# b0354 reimplements the fakeThetaLibFs double, the bindImportedBodyOverFs bind driver, and the expectCleanImportLoad precondition already centralised in tests/helpers/thetalib-load-harness.ts

## Observation
tests/b0354-crossfile-fn-depth-uncounted.test.ts declares four local pieces
that already exist as exported helpers in tests/helpers/thetalib-load-harness.ts:
a local `fakeThetaLibFs` function that is byte-for-byte identical to the
helper module's exported `fakeThetaLibFs`; a local `NOOP_CHECKPOINT` constant
identical to the one the helper module builds inline inside
`bindImportedBodyOverFs`; a local `measure()` function whose parse →
`checkThetaImports` → `createProductionProducerDeps(...).bindPromptConversation`
sequence reproduces `bindImportedBodyOverFs`'s body near-verbatim (differing
only in accepting an extra `subagentInboundInvokeDepth` passthrough and a
caller-supplied `sourcePath`/`modelRegistry` fixed in place rather than
parameterised); and a local `expectCleanLoad` function whose three assertions
are the same three assertions `expectCleanImportLoad` makes, with the messages
inlined as string literals instead of passed as parameters. The helper
module's own header explicitly documents having centralised this exact
sequence out of tests/b0303-imported-fn-body-declaring-scope.test.ts,
tests/b0305-enum-alias-identity.test.ts, tests/b0306-imported-enum-wire-values.test.ts,
and (via `bindImportedBodyOverFs`'s generalisation) tests/b0361-case-variant-import-dir-identity.test.ts —
all of which the code inspected here does not import from.

## Evidence

tests/b0354-crossfile-fn-depth-uncounted.test.ts:104-121 (local `fakeThetaLibFs`):
```ts
function fakeThetaLibFs(files: Record<string, string>): FileSystem {
  const dirs = new Map<string, string[]>();
  for (const path of Object.keys(files)) {
    const slash = path.lastIndexOf("/");
    const parent = path.slice(0, slash);
    const entries = dirs.get(parent) ?? [];
    entries.push(path.slice(slash + 1));
    dirs.set(parent, entries);
  }
  const reject = (): Promise<never> =>
    Promise.reject(new Error("filesystem member not exercised by this test"));
  return {
    readText: reject,
    writeText: reject,
    exists: reject,
    homedir: (): string => "/home",
    cwd: (): string => "/proj",
```

tests/helpers/thetalib-load-harness.ts:85-102 — the exported helper, same body:
```ts
export function fakeThetaLibFs(files: Record<string, string>): FileSystem {
  const dirs = new Map<string, string[]>();
  for (const path of Object.keys(files)) {
    const slash = path.lastIndexOf("/");
    const parent = path.slice(0, slash);
    const entries = dirs.get(parent) ?? [];
    entries.push(path.slice(slash + 1));
    dirs.set(parent, entries);
  }
  const reject = (): Promise<never> =>
    Promise.reject(new Error("filesystem member not exercised by this test"));
  return {
    readText: reject,
    writeText: reject,
    exists: reject,
    homedir: (): string => "/home",
    cwd: (): string => "/proj",
```

tests/b0354-crossfile-fn-depth-uncounted.test.ts:197-254 (`measure()`'s
parse/check/bind sequence — the same steps `bindImportedBodyOverFs` performs):
```ts
  const app = parseApp(appBody);
  expect(
    app.frontmatter, ...
  ).not.toBeNull();
  const frontmatter = app.frontmatter as ParsedFrontmatter;
  const input: ThetaCompositionInput = {
    slashName: "app",
    sourcePath: "/proj/app.theta",
    frontmatter,
    body: app.body,
  };
  const check = await checkThetaImports(input, {
    fs: fakeThetaLibFs(libs),
    parseDeps: parseDeps(),
  });
  const imports: readonly MaterializedImport[] = check.imports;

  const deps = createProductionProducerDeps({
    pi: {} as unknown as ExtensionAPI,
    root: {
      checkpoint: NOOP_CHECKPOINT,
      idSource: {
        newInvocationId: (): string => "inv-1",
        newToolCallId: (): string => "tc-1",
      },
    } as unknown as RuntimeRoot,
```

tests/helpers/thetalib-load-harness.ts:223-256 (`bindImportedBodyOverFs`, the
same sequence, generalised over `sourcePath`/`fs`/`modelRegistry`):
```ts
  const app = parseThetaDocument(
    { path: sourcePath, bytes: new TextEncoder().encode(`${APP_FRONTMATTER}\n${appBody}`) },
    parseDeps(),
  );
  expect(
    app.frontmatter, ...
  ).not.toBeNull();
  const frontmatter = app.frontmatter as ParsedFrontmatter;
  const input: ThetaCompositionInput = {
    slashName: "app",
    sourcePath,
    frontmatter,
    body: app.body,
  };
  const check = await checkThetaImports(input, {
    fs,
    parseDeps: parseDeps(),
  });
  const imports: readonly MaterializedImport[] = check.imports;

  const deps = createProductionProducerDeps({
    pi: {} as unknown as ExtensionAPI,
    root: {
      checkpoint: NOOP_CHECKPOINT,
```

tests/b0354-crossfile-fn-depth-uncounted.test.ts:330-340 (local
`expectCleanLoad`):
```ts
function expectCleanLoad(row: Measured, label: string, expectedMaterialised: string[]): void {
  expect(row.appParseCodes, `${label}: the importing file parses clean`).toEqual([]);
  expect(
    row.diagLines,
    `${label}: a well-formed \`.thetalib\` import is legal at every static gate; the load pass must report nothing (bug doc §Reproduction: \`load diagnostics: []\`)`,
  ).toEqual([]);
  expect(
    row.materialised,
    `${label}: imports.md §Visibility auto-exports a top-level \`fn\`, so the imported symbol materialises under its local name`,
  ).toEqual(expectedMaterialised);
}
```

tests/helpers/thetalib-load-harness.ts:306-316 (`expectCleanImportLoad`, the
same three-assertion body, messages parameterised instead of inlined):
```ts
export function expectCleanImportLoad(
  row: CleanLoadRow,
  label: string,
  diagMessage: string,
  materialisedMessage: string,
  expectedMaterialised: readonly string[],
): void {
  expect(row.appParseCodes, `${label}: the importing file parses clean`).toEqual([]);
  expect(row.diagLines, `${label}: ${diagMessage}`).toEqual([]);
  expect(row.materialised, `${label}: ${materialisedMessage}`).toEqual(expectedMaterialised);
}
```

## Why this is a problem
This is the "Boilerplate duplication" / "Copy-paste fixtures" class: the
fixture double (`fakeThetaLibFs`), the checkpoint stub (`NOOP_CHECKPOINT`),
the parse→check→bind driver, and the three-assertion clean-load precondition
all already exist as exported members of tests/helpers/thetalib-load-harness.ts —
a module whose own header names the earlier b03xx files it was extracted
from and states it generalises the sequence specifically so new callers (it
names tests/b0361-case-variant-import-dir-identity.test.ts as the fourth
adopter) do not have to re-derive it. tests/b0354-crossfile-fn-depth-uncounted.test.ts
imports none of `fakeThetaLibFs`, `bindImportedBodyOverFs`, or
`expectCleanImportLoad` from that module and instead re-derives all three
locally; the one genuine addition — threading an optional
`subagentInboundInvokeDepth` into the `createProductionProducerDeps` call —
is a single extra spread expression, not a reason the surrounding sequence
needed to be re-typed.

## Suggested direction (non-binding, optional)
tests/helpers/thetalib-load-harness.ts, which already exports
`fakeThetaLibFs`, `bindImportedBodyOverFs`, and `expectCleanImportLoad` and
already documents having generalised `bindImportedBodyOverFs` once for a
sibling caller's one extra need, is the existing home this file's local
`measure()`/`expectCleanLoad`/`fakeThetaLibFs` trio duplicates.

## False-positive check
- Gate-pin check: tests/b0354-crossfile-fn-depth-uncounted.test.ts does not
  match `*gate*.test.ts` or the named gate kin; nothing cited is a pinned
  count/inventory assertion.
- Recording-double check: `fakeThetaLibFs` is a fixture filesystem double
  driving the real `checkThetaImports`, not a recording double backing a
  "never called" witness; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0354-crossfile-fn-depth-uncounted.md
  (named in the file's own header) pins the runtime-depth-counting defect and
  the `measure()` harness's *behavioural* extension (the
  `subagentInboundInvokeDepth` seed), never the `fakeThetaLibFs`/
  parse-check-bind/precondition bodies as an intentionally separate local
  copy.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0354-crossfile-fn-depth-uncounted" docs/reference/coverage-matrix.md` →
  0 hits. This finding proposes no merge, rename, or deletion of any `it()`
  or fixture — only that the local `fakeThetaLibFs`/`measure()`/
  `expectCleanLoad` trio could import the existing exported helpers instead —
  so no witness-list citation is disturbed.
- Overlap check against already-filed/resolved topics: PTQ-0347
  (b0361-bindimportedbody-driver-duplicated, resolved) generalised
  `bindImportedBodyOverFs` specifically so tests/b0361-case-variant-import-dir-identity.test.ts
  could adopt it over a real filesystem; that fix's own scope, re-read, is
  confined to b0361 and does not touch tests/b0354-crossfile-fn-depth-uncounted.test.ts,
  which independently re-derives the pre-generalisation in-memory sequence
  this same helper module already covers. This is a distinct file from every
  already-filed/resolved item in the supplied list (none names b0354).
- Coverage check: the claim is about a repeated helper-function/fixture-double
  DEFINITION, not a missing test path; every cell that calls `measure()`/
  `expectCleanLoad`/`fakeThetaLibFs` continues to run and assert as before.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all seven excerpts match at the cited lines; b0354's local `fakeThetaLibFs` (tests/b0354:104-132) is byte-identical to the export at thetalib-load-harness.ts:85-113, its `NOOP_CHECKPOINT`/`measure()` parse→checkThetaImports→createProductionProducerDeps→bindPromptConversation sequence (192-254) matches `bindImportedBodyOverFs` (217-262) apart from the one `subagentInboundInvokeDepth` spread, and `expectCleanLoad` (330-340) is `expectCleanImportLoad` (306-316) with the two messages inlined; b0354 (committed c5adf2fe, 2026-09-03) predates the harness (first landed 11820751, 2026-09-12) and was simply never migrated — its own header calls itself the b0303 `measure()` "verbatim", yet b0303 now imports `bindImportedBody`, leaving b0354 the stranded copy; no gate/recording-double/coverage-matrix carve-out applies (0 matrix hits; docs/bugs/0354-crossfile-thetalib-fn-frames-uncounted.md pins nothing about the harness bodies); not a duplicate — PTQ-0310/0393/0347/0315 name other files and PTQ-0239 lists b0354 only for its separate `parse()`-vs-`parseDoc` root cause. Fixer notes: adoption needs the same one-need helper extension PTQ-0347 ratified (an optional `subagentInboundInvokeDepth` passthrough on `bindImportedBodyOverFs`), and the helper's `APP_FRONTMATTER` pins `anthropic/claude-sonnet-5` (bug 0479) where b0354 pins `sonnet` — no b0354 cell issues a model turn, so this is not load-bearing (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
