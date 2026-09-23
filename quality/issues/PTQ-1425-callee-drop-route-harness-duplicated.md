---
id: PTQ-1425
title: Load-pass witness harness (plantWorkspace / requireCalleeDropRoute / expectCallerRefused) duplicated verbatim between the bug-0267 and bug-0270 witness files
lens: D7
status: open
verdict: confirmed
locations:
  - tests/callee-post-parse-errors-un-register-tools-caller.test.ts:238-250
  - tests/callee-post-parse-errors-un-register-tools-caller.test.ts:254-271
  - tests/callee-post-parse-errors-un-register-tools-caller.test.ts:273-288
  - tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts:224-270
  - tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts:272-292
  - tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts:294-309
sites: 2
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# Load-pass witness harness (plantWorkspace / requireCalleeDropRoute / expectCallerRefused) duplicated verbatim between the bug-0267 and bug-0270 witness files

## Observation
Both in-scope files define three local helpers with the same names, the same
roles, and (for `expectCallerRefused`) byte-identical bodies: `plantWorkspace`
(fixture planting into `.pi/theta/`, then `finishWorkspace`), `requireCalleeDropRoute`
(a precondition guard that throws naming itself when the callee's own
error-severity drop row is absent from the pass), and `expectCallerRefused` (a
thin wrapper around the already-shared `expectCallerRefusedWithCalleeHasErrors`
helper, binding the same `CALLEE_HAS_ERRORS_CODE` constant and the same
doc-comment). Both files already import the canonical shared harness
`tests/helpers/compose-workspace-harness.ts` (`finishWorkspace`,
`expectCallerRefusedWithCalleeHasErrors`, `allDiagnostics`, `describeNotes`,
`normativeMessagePattern`, `requireDriven`, `runLoadPass`) for the parts that
are already factored, but re-declare this thin adapter layer locally in each
file instead of adding it to that same module.

## Evidence
`tests/callee-post-parse-errors-un-register-tools-caller.test.ts:279-288`:
```ts
function expectCallerRefused(pass: LoadPass, callerPath: string, callerName: string): void {
  expectCallerRefusedWithCalleeHasErrors(
    pass,
    callerPath,
    callerName,
    CALLEE_HAS_ERRORS_CODE,
    normativeMessagePattern(REGISTRY, CALLEE_HAS_ERRORS_CODE),
    "callee with structural errors",
  );
}
```

`tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts:300-309`
— the identical body, verbatim, down to the string literal and the doc comment
above it:
```ts
function expectCallerRefused(pass: LoadPass, callerPath: string, callerName: string): void {
  expectCallerRefusedWithCalleeHasErrors(
    pass,
    callerPath,
    callerName,
    CALLEE_HAS_ERRORS_CODE,
    normativeMessagePattern(REGISTRY, CALLEE_HAS_ERRORS_CODE),
    "callee with structural errors",
  );
}
```

`tests/callee-post-parse-errors-un-register-tools-caller.test.ts:243-250`
(`plantWorkspace`) and `tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts:233-270`
(`plantWorkspace`, same `mkdtempSync` → `mkdirSync(".pi/theta")` →
`writeFileSync` loop → `finishWorkspace` sequence, extended with an `outside`
and `dirs` parameter the first file has no need of):
```ts
function plantWorkspace(files: Readonly<Record<string, string>>): ComposeWorkspace {
  const cwd = mkdtempSync(join(tmpdir(), "theta-b0267-"));
  mkdirSync(join(cwd, ".pi", "theta"), { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(cwd, ".pi", "theta", name), body, "utf8");
  }
  return finishWorkspace(cwd);
}
```

`tests/callee-post-parse-errors-un-register-tools-caller.test.ts:260-271`
(`requireCalleeDropRoute`) and
`tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts:278-292`
(same name, same throw-naming-the-precondition shape, extended with a
`calleeFile` file-location filter):
```ts
function requireCalleeDropRoute(pass: LoadPass, code: string): void {
  const rows = allDiagnostics(pass.notes).filter(
    (d) => d.code === code && d.severity === "error",
  );
  if (rows.length === 0) {
    throw new Error(
      `harness: no error-severity ${code} row reached the channel — the callee's own drop ` +
        "route is the precondition for bug 0267's caller-side claim, so its absence is a " +
        `harness failure, never a skip. Notes:\n${describeNotes(pass.notes)}`,
    );
  }
}
```

Counted sites: exactly 2 declarations of each of the three helper names, one
per file (search: `function (plantWorkspace|requireCalleeDropRoute|expectCallerRefused)` over the two files, 6 matches total, 3 per file).

## Why this is a problem
`expectCallerRefused` is duplicated with a byte-identical body and doc comment
across the two files: the same six-line call to the already-shared
`expectCallerRefusedWithCalleeHasErrors`, binding the same
`CALLEE_HAS_ERRORS_CODE` constant. `plantWorkspace` and `requireCalleeDropRoute`
repeat the same structure and control-flow (mkdtemp+mkdir+write loop;
filter-then-throw-naming-itself) with only the second file's added parameters
as the difference — the second file's version is a strict superset of the
first's behaviour. Both files already import the shared harness module these
three helpers sit beside conceptually (`finishWorkspace`,
`expectCallerRefusedWithCalleeHasErrors`, `allDiagnostics`, `describeNotes`),
so the natural home these two sibling bug-witness files point at is that same
module, observationally, not a new design.

## Suggested direction (non-binding, optional)
The three helpers read as candidates for `tests/helpers/compose-workspace-harness.ts`,
parameterised the way the second file's versions already are (an optional
`calleeFile` filter on the drop-route guard, optional `outside`/`dirs` on the
planter) — this is an observation about where the identical code already
points, not a design.

## False-positive check
Gate-pin carve-out: neither file matches `*gate*.test.ts` or the named gate
kin; not a pinned-count census. Recording-double carve-out: none of the three
helpers is a negative-witness recording double. docs/bugs/ search: bug 0267
and bug 0270 reports were read in full via the files' own header comments; the
duplication observed here is unrelated to either bug's documented
correct-reason-red shape and is not itself asserted as red. Coverage-matrix /
bug-doc citation search: `grep -r "callee-post-parse-errors-un-register-tools-caller\|callee-tools-missing-theta-path-un-registers-tools-caller" docs/reference/coverage-matrix.md docs/bugs/` returned no hits, so neither file is pinned by name in either document; no merge/rename/delete is proposed here regardless. This finding is scoped to code that exists (three named local functions, cited by path:line, with excerpts re-read immediately before filing) and makes no claim about missing coverage.

## Triage
verdict: questionable — excerpts reproduce at the cited lines (±drift) and this is not covered by fixed PTQ-0428 (its scope was the 11 core harness names, never these three) or PTQ-0300 (which centralised expectCallerRefusedWithCalleeHasErrors itself), but the title's "duplicated verbatim" holds for only one of the three helpers: expectCallerRefused is byte-identical (and a third uncounted copy sits at tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts:368), whereas b0270's plantWorkspace is a diverged variant (outside/dirs branches, post-finishWorkspace directory planting) in the local-planter-calls-finishWorkspace shape PTQ-0299's ruling accepted across 15 files, and requireCalleeDropRoute differs in both filter (calleeFile location) and message text; the sole verbatim copy is a 6-line wrapper whose only job is binding a per-file REGISTRY constant (b0267 parses parse+load pages, b0270 load only), so hoisting it means threading REGISTRY through — essentially the already-shared helper's signature — and whether that plus parameterising the planter/guard is worth it is a human ruling, not a mechanical dedupe (triage: claude-fable-5-1)
verdict: questionable — re-verified independently: all six excerpts reproduce at the cited lines and the 6-hit search reproduces, no prior PTQ covers it (PTQ-0428 fixed the 11 core harness names, PTQ-0300 centralised expectCallerRefusedWithCalleeHasErrors, PTQ-0299 ruled on b0280's planter, PTQ-0525 is live-tier), but "duplicated verbatim" holds only for expectCallerRefused (byte-identical, plus an uncounted third copy at tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts:368) — b0270's plantWorkspace is a diverged variant (outside/dirs, post-finishWorkspace mkdir) in the local-planter shape both file headers declare ("fixture planting stays local") and PTQ-0299 accepted across 15 files, and b0270's requireCalleeDropRoute differs in filter (normalisePath(d.file) === calleeFile) and message; the sole verbatim copy is a 6-line wrapper binding a per-file REGISTRY that genuinely differs (b0267 parse+load pages, b0270 load only), so hoisting means threading REGISTRY through, which is the shared helper's existing signature — whether that is worth doing needs a human ruling, not a mechanical dedupe (triage: claude-fable-5-1)
verdict: questionable — re-verified against current code: all six excerpts reproduce at the cited lines and the 6-hit `^function (plantWorkspace|requireCalleeDropRoute|expectCallerRefused)` search reproduces; not a duplicate (PTQ-0428 migrated the 11 core harness names, PTQ-0300 centralised expectCallerRefusedWithCalleeHasErrors, PTQ-0299 ruled on b0280's planter, PTQ-0525/0695/0716 cite other files); but the title's "duplicated verbatim" holds for exactly one of the three helpers — `diff` of the two expectCallerRefused blocks differs only in the doc-comment bug id (and a third uncounted copy at tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts:368 uses a different normativeMessagePattern arity), whereas b0270's plantWorkspace adds outside/dirs branches and post-finishWorkspace mkdir in the local-planter shape compose-workspace-harness.ts:9-12 documents as deliberate ("stays local and calls finishWorkspace") and both file headers restate (b0267:139, b0270:98), and b0270's requireCalleeDropRoute differs in filter (normalisePath(d.file) === calleeFile) and message; the sole verbatim 6-line wrapper binds a REGISTRY that genuinely differs per file (b0267 flatMaps code-registry-parse+load pages at 231-238, b0270 reads code-registry-load.md alone at 213-220), so hoisting it requires threading REGISTRY — the already-shared helper's own signature — and parameterising the planter/guard is a design call, not a mechanical dedupe; a human should rule on whether the residual is worth a shared adapter (triage: claude-fable-5-1)
triage worker failed (verdict not applied; re-triaged next wave) (loop, 2026-09-23)
verdict: confirmed — RATIFIED (human, 2026-09-23): confirmed - batch ruling; triage verification trusted.
