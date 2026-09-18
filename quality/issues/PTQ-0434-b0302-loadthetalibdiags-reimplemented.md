---
id: PTQ-0434
title: b0302 reimplements tests/helpers/thetalib-load-harness.ts's loadThetaLibDiags parse+check+render sequence instead of importing it
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0302-stem-keyed-cycle-graph.test.ts:73-145
  - tests/helpers/thetalib-load-harness.ts:79-107
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# b0302 reimplements tests/helpers/thetalib-load-harness.ts's loadThetaLibDiags parse+check+render sequence instead of importing it

## Observation
tests/b0302-stem-keyed-cycle-graph.test.ts declares its own module-scope
`APP_FRONTMATTER`, `parseApp`, `fakeThetaLibFs`, and `diagLines` helpers that
together reproduce, statement for statement, the exported
`loadThetaLibDiags` function in tests/helpers/thetalib-load-harness.ts: parse
`/proj/app.theta` with a shared prompt-mode frontmatter, assert the
frontmatter parsed (with the same precondition-failure message text), build
the same `ThetaCompositionInput` shape, drive the real `checkThetaImports`
over an in-memory `.thetalib` `FileSystem` built from a flat path→content
map, and render the diagnostics as `${severity} ${code}: ${message}` lines.
The harness file's own header states this exact sequence (`loadThetaLibDiags`
plus its `fakeThetaLibFs` double) was centralised because it recurred
byte-for-byte across three other bug-witness files (PTQ-0232); b0302 was not
one of the files migrated onto it and instead carries a fifth independent
copy.

## Evidence

tests/b0302-stem-keyed-cycle-graph.test.ts:73-97 (frontmatter, parse, and the
`fakeThetaLibFs` double):
```ts
const APP_FRONTMATTER = ["---", 'model: "sonnet"', "mode: prompt", "---"].join("\n");

function parse(source: string, path: string): ThetaDocument {
  return parseThetaDocument({ path, bytes: new TextEncoder().encode(source) }, parseDeps());
}

function parseApp(body: string): ThetaDocument {
  return parse(`${APP_FRONTMATTER}\n${body}`, "/proj/app.theta");
}

// The in-memory `.thetalib` filesystem double from
// tests/reexport-chain-resolution.test.ts: only `readdir` / `readBytes` are
// exercised, every other member rejects so an unexpected call reds loudly.
function fakeThetaLibFs(files: Record<string, string>): FileSystem {
  const dirs = new Map<string, string[]>();
  for (const path of Object.keys(files)) {
    const slash = path.lastIndexOf("/");
    const parent = path.slice(0, slash);
    const entries = dirs.get(parent) ?? [];
    entries.push(path.slice(slash + 1));
    dirs.set(parent, entries);
  }
```

tests/b0302-stem-keyed-cycle-graph.test.ts:128-145 (the `diagLines` driver):
```ts
async function diagLines(appBody: string, libs: Record<string, string>): Promise<string[]> {
  const app = parseApp(appBody);
  expect(
    app.frontmatter,
    `the importing theta's frontmatter must parse or the load pass reads nothing; diagnostics: ${JSON.stringify(
      app.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    )}`,
  ).not.toBeNull();
  const input: ThetaCompositionInput = {
    slashName: "app",
    sourcePath: "/proj/app.theta",
    frontmatter: app.frontmatter as ParsedFrontmatter,
    body: app.body,
  };
  const check = await checkThetaImports(input, {
    fs: fakeThetaLibFs(libs),
    parseDeps: parseDeps(),
  });
  return check.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

tests/helpers/thetalib-load-harness.ts:79-107 (the exported canonical
equivalent — `LoadResult.diagLines` is the same `${severity} ${code}:
${message}` projection `diagLines` builds locally):
```ts
export async function loadThetaLibDiags(
  appBody: string,
  libs: Record<string, string>,
): Promise<LoadResult> {
  const app = parseThetaDocument(
    { path: "/proj/app.theta", bytes: new TextEncoder().encode(`${APP_FRONTMATTER}\n${appBody}`) },
    parseDeps(),
  );
  expect(
    app.frontmatter,
    `the importing theta's frontmatter must parse or the load pass reads nothing; diagnostics: ${JSON.stringify(
      app.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    )}`,
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
  return {
    appParseCodes: app.diagnostics.map((d) => d.code),
    diagnostics: check.diagnostics,
    diagLines: check.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
  };
}
```
The harness also exports `fakeThetaLibFs` itself (thetalib-load-harness.ts:60-90),
identical in body to b0302's local copy quoted above apart from the leading
`export` keyword.

## Why this is a problem
The precondition-assertion string, the `ThetaCompositionInput` shape, the
`fakeThetaLibFs` double, and the final `${severity} ${code}: ${message}`
projection are reproduced verbatim in b0302 rather than reached through the
single exported entry point (`loadThetaLibDiags`) tests/helpers/thetalib-load-harness.ts
already provides for exactly this "parse app, run checkThetaImports over an
in-memory `.thetalib` tree, render diagnostics as lines" sequence. The only
difference between b0302's copy and the canonical helper is the `model:`
literal in `APP_FRONTMATTER` (`"sonnet"` vs the harness's
`"anthropic/claude-sonnet-5"`), which is immaterial here: b0302 never
dispatches a turn or reads `ctx.model`, it only drives the load-time
`checkThetaImports` pass, so the harness's frontmatter would produce the same
observable diagnostics.

## Suggested direction (non-binding, optional)
tests/helpers/thetalib-load-harness.ts's existing `loadThetaLibDiags` export
is observably able to answer every `diagLines(...)` call site in b0302
(its `LoadResult.diagLines` field is the same list this file rebuilds); noting
that as the natural landing spot for this sequence is an observation about
where the duplicate already lives, not a design proposal.

## False-positive check
Gate-pin check: b0302 is a bug-witness file (`bug 0302 — …`), not named
`*gate*.test.ts` or a kin listed in the carve-out, so the pinned-count
carve-out does not apply. Recording-double check: `fakeThetaLibFs` here
records nothing and is not used to assert a MUST-NOT-be-called witness — it is
a pure in-memory read/list double, so the negative-witness carve-out does not
apply. docs/bugs/ signature search: this finding does not allege a red test or
a skip, so no docs/bugs/ correct-reason-red signature applies.
coverage-matrix/bug-doc citation search: `grep -r "b0302-stem-keyed-cycle-graph"
docs/reference/coverage-matrix.md docs/bugs/` returned no hits, so this test is
not pinned by name in either; this finding does not propose to merge, rename,
or delete the test, only to note the existing duplicate of an already-exported
helper. Confirmed the claim stays inside test code that exists (the local
`diagLines`/`fakeThetaLibFs`/`parseApp` functions and the harness's
`loadThetaLibDiags`/`fakeThetaLibFs` exports), not a coverage gap.

## Triage
verdict: confirmed — independently re-verified: b0302's `fakeThetaLibFs` (tests/b0302-stem-keyed-cycle-graph.test.ts:87-121) and `diagLines` (:128-147) are body-identical to the harness's exported `fakeThetaLibFs` (tests/helpers/thetalib-load-harness.ts:85-119) and `loadThetaLibDiags` (:137-166; candidate's harness line cites are drifted ~30-60 lines but the excerpts match verbatim), b0302 imports nothing from the harness, and the sole difference (`model: "sonnet"`) is unread by `checkThetaImports`, whose deps are only `{fs, parseDeps, …}` with no `.model` access in import-static-checks.ts; D7 copy-paste-double class inside tests/, not a gate file, not a recording double, and the bug-doc witness listing (docs/bugs/0302-stem-keyed-cycle-graph.md:222 — the candidate's "no hits" claim is wrong) is irrelevant because no merge/rename/delete is proposed; no existing row cites b0302 (PTQ-0232/0310/0393 and sibling d7-70 cite other files) (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
