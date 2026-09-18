---
id: PTQ-0875
title: b0388's measure() re-derives b0354's module-private measure() harness almost verbatim instead of sharing it
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0388-crossfile-fnbody-effect-undercount.test.ts:193-292
  - tests/b0354-crossfile-fn-depth-uncounted.test.ts:192-281
sites: 2                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# b0388's measure() re-derives b0354's module-private measure() harness almost verbatim instead of sharing it

## Observation
tests/b0388-crossfile-fnbody-effect-undercount.test.ts declares a module-scope
async function `measure(appBody, libs, subagentInboundInvokeDepth?, launch?)`
that parses the importing theta, runs the real `checkThetaImports`, builds
`createProductionProducerDeps` deps, binds the prompt conversation, and drives
`executeBody`, capturing either the settled value or the thrown error as one
`RuntimeOutcome`. tests/b0354-crossfile-fn-depth-uncounted.test.ts already
declares a `measure(appBody, libs, subagentInboundInvokeDepth?)` doing the
identical sequence of calls in the identical order, module-private (no
`export`) and not re-exported from any tests/helpers/ module. b0388's own
file header states the relationship directly: "the committed
tests/b0354-crossfile-fn-depth-uncounted.test.ts `measure()` harness VERBATIM,
seeding the top-level chain via `subagentInboundInvokeDepth`." A line-range
diff of the two functions (excluding the `launch`-conditional branches b0388
adds for its R2 cells) shows the two are the same statements in the same
order over the same field names.

## Evidence

tests/b0388-crossfile-fnbody-effect-undercount.test.ts:193-225 (re-read
immediately before filing; `measure`'s opening, identical to b0354's below
apart from the added `launch` parameter and the `childRegimeRootDouble()`
branch):
```ts
async function measure(
  appBody: string,
  libs: Record<string, string>,
  subagentInboundInvokeDepth?: number,
  launch?: LaunchSubstrate,
): Promise<Measured> {
  const app = parseApp(appBody);
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
  const imports: readonly MaterializedImport[] = check.imports;
```

tests/b0354-crossfile-fn-depth-uncounted.test.ts:192-213 (the same opening,
byte-identical apart from the missing `launch` parameter):
```ts
async function measure(
  appBody: string,
  libs: Record<string, string>,
  subagentInboundInvokeDepth?: number,
): Promise<Measured> {
  const app = parseApp(appBody);
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
  const imports: readonly MaterializedImport[] = check.imports;
```

Direct diff, re-run immediately before filing:
`diff <(sed -n '192,281p' tests/b0354-crossfile-fn-depth-uncounted.test.ts) <(sed -n '193,292p' tests/b0388-crossfile-fnbody-effect-undercount.test.ts)`
produces only the `launch`-conditional hunks (the added `launch?` parameter,
the `childRegimeRootDouble()` ternary in the `root:` field, the
`subagentSpawn`/`subagentExecutableHost`/`subagentParentEnv`/`subagentParentPid`
spread, and the `ctx:` ternary) — every other statement (the frontmatter
assertion, the `checkThetaImports` call, the `createProductionProducerDeps`
call's `pi`/`modelRegistry`/`resolvePiTool` fields, the `theta`/`bindInput`
construction, the `.then(ok, err)` rejection-framing block, and the returned
`Measured` object) is unchanged between the two files. The two files also
each separately declare the same `RuntimeOutcome`/`Measured` interfaces and a
`NOOP_CHECKPOINT` constant that feed this function (b0388:100-114/126-130,
b0354: the block preceding line 192) with only the frontmatter model string
differing ("anthropic/claude-sonnet-5" vs "sonnet").

## Why this is a problem
b0354's `measure()` is module-private (`grep -n "^export" tests/b0354-crossfile-fn-depth-uncounted.test.ts`
→ 0 hits) and no tests/helpers/ module re-exports it, so b0388 — whose own
comment names it as the harness being reused "VERBATIM" — has no way to call
it and instead retypes the same ~85-line sequence a second time, only
threading its two new parameters (`launch`, and the `childRegimeRootDouble`
substrate) into the copy rather than into the original.

## Suggested direction (non-binding, optional)
Lifting b0354's `measure()` (generalised to accept the optional `launch`
substrate b0388 already needs) into a shared tests/helpers/ module would let
b0388 import and extend it instead of retyping the shared ~85-line sequence;
this is an observation about where the duplicate already sits, not a design
for the extraction.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or a named kin; not
  applicable.
- Recording-double check: `measure()` is a drive-and-capture harness function,
  not a "never called" negative-witness double; the carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0388-crossfile-fnbody-effect-undercount.md
  and docs/bugs/0354-*.md both exist; b0388's own header states its R1/R1-control/R2
  cells are the specified post-fix behaviour, RED at fork by design — that
  disposition is unrelated to the harness-duplication claim here, and no cell
  in either file is a documented correct-reason red for a skipped test.
- coverage-matrix/bug-doc citation search: `grep -n "b0388-crossfile-fnbody-effect-undercount\|b0354-crossfile-fn-depth-uncounted" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of either file or any `it()`/`describe()` — only that the harness function could be shared instead of retyped a second time.
- Coverage check: the claim is about a repeated harness DEFINITION, not a
  missing test path; every cell exercising each copy is unaffected.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts match at the cited lines and my own `diff <(sed -n 192,281p b0354) <(sed -n 193,292p b0388)` produces only the filing's listed `launch`-conditional hunks (the `launch?` param, the `childRegimeRootDouble()` root ternary, the four-field `subagentSpawn` spread, the `ctx:` ternary, one comment rewording, and the extra `spawns` return field) with the frontmatter assertion, `checkThetaImports`, `createProductionProducerDeps` fields, theta/bindInput construction and `.then(ok, err)` framing byte-identical; b0354 has 0 `^export` lines and no tests/helpers module exports `measure`; b0388's copy is live (6 call sites), not a gate file, not a recording double, 0 coverage-matrix hits, docs/bugs/0388 cites the file as witness but no merge/rename/delete is proposed; not a duplicate — PTQ-0532 (open) tracks only the b0354 site, PTQ-0625 (open) only b0449, and resolved PTQ-0444 covered b0388's `fakeThetaLibFs` alone (its fix is the line-1 import; `measure()` was left in place), and the PTQ-0625 precedent rules the same harness class at a distinct site a separate row. Correction for the fixer: the shared home the direction proposes already exists — `bindImportedBodyOverFs`/`bindImportedBody` in tests/helpers/thetalib-load-harness.ts (landed 11820751, 2026-09-12, after b0388's 770cbb82, 2026-09-03, so this is an unmigrated copy, not one retyped despite the helper), the same module b0388 already imports `fakeThetaLibFs` from; adoption needs the helper extended with the optional `subagentInboundInvokeDepth` passthrough PTQ-0532 already calls for plus a root/ctx/spawn-substrate override for b0388's R2 cells (triage: claude-fable-5-1)
