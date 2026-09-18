---
id: PTQ-0963
title: tools-derived-name-shape.test.ts and tools-entry-closed-grammar.test.ts still redeclare an identical expectedMessage/PlantedTheta/theta/observed/withCode witness harness, byte-for-byte apart from one string literal
lens: D7
status: open
verdict: confirmed
locations:
  - tests/tools-derived-name-shape.test.ts:129-140
  - tests/tools-derived-name-shape.test.ts:211-218
  - tests/tools-derived-name-shape.test.ts:284-305
  - tests/tools-derived-name-shape.test.ts:428-430
  - tests/tools-entry-closed-grammar.test.ts:112-123
  - tests/tools-entry-closed-grammar.test.ts:181-188
  - tests/tools-entry-closed-grammar.test.ts:272-293
  - tests/tools-entry-closed-grammar.test.ts:469-471
sites: 5
fix_scope: module
wave: qw20260918131151
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# tools-derived-name-shape.test.ts and tools-entry-closed-grammar.test.ts still redeclare an identical expectedMessage/PlantedTheta/theta/observed/withCode witness harness, byte-for-byte apart from one string literal

## Observation
Both files already import the shared `readRegistry` (tests/helpers/registry-oracle.ts) and `plantThetaWorkspace`/`runProductionLoad`/`disposeWorkspace` (tests/helpers/production-load-harness.ts) — the two harness layers PTQ-0517/PTQ-0578/PTQ-0641 previously flagged and which have since been fixed. On top of those shared calls, each file independently declares five further module-scope pieces used to drive and read the shared harness's output: `expectedMessage(code, subs)` (fills a registry `<…>` template), the `PlantedTheta` interface plus `theta(...lines)` (a fixture-line joiner), the `let outcome`/`let workspaceDir` pair with its `beforeAll`/`afterAll` wiring, `observed()` (renders `outcome` for assertion messages), and `withCode(diags, code)` (finds the first diagnostic carrying a code). All five are byte-identical between the two files except the `mkdtemp` prefix string literal inside `beforeAll`.

## Evidence
`tests/tools-derived-name-shape.test.ts:129-140` and
`tests/tools-entry-closed-grammar.test.ts:112-123` — `diff` of the two ranges
produces no output:
```ts
/** Source a code's registered *Message* template and fill its `<…>` placeholders. */
function expectedMessage(
  code: string,
  subs: Readonly<Record<string, string>>,
): string {
  let message = registryMessage(REGISTRY, code) as string;
  for (const [placeholder, value] of Object.entries(subs)) {
    // `replaceAll` — the rename template repeats `<name>`.
    message = message.replaceAll(placeholder, value);
  }
  return message;
}
```

`tests/tools-derived-name-shape.test.ts:211-218` and
`tests/tools-entry-closed-grammar.test.ts:181-188` — `diff` produces no output:
```ts
interface PlantedTheta {
  readonly stem: string;
  readonly text: string;
}

function theta(...lines: readonly string[]): string {
  return lines.join("\n") + "\n";
}
```

`tests/tools-derived-name-shape.test.ts:284-305` vs
`tests/tools-entry-closed-grammar.test.ts:272-293` — `diff` produces exactly
one differing line, the `mkdtemp` prefix:
```ts
let outcome: LoadOutcome;
let workspaceDir: string;

beforeAll(async () => {
  // A minimal valid settings file pins the fixture's settings read to a known
  // value. An ABSENT settings file is silent (package-and-settings.md
  // §Failure modes), so the plant is hermeticity, not noise suppression.
  workspaceDir = plantThetaWorkspace("theta-bug0070-", THETAS, "{}");
  outcome = await runProductionLoad(workspaceDir);
});

afterAll(() => {
  disposeWorkspace(workspaceDir);
});

/** The registered / notified sets, rendered for an assertion message. */
function observed(): string {
  return (
    ` Registered: ${JSON.stringify(outcome.registered)}` +
    ` Notified: ${JSON.stringify(outcome.notifications)}`
  );
}
```
(`tools-entry-closed-grammar.test.ts` reads `"theta-bug0069-"` on the
corresponding `plantThetaWorkspace` line; every other character is identical.)

`tests/tools-derived-name-shape.test.ts:428-430` and
`tests/tools-entry-closed-grammar.test.ts:469-471` — `diff` produces no output:
```ts
function withCode(diags: readonly Diagnostic[], code: string): Diagnostic | undefined {
  return diags.find((d) => d.code === code);
}
```

Exact commands run and their results:
- `diff <(sed -n '129,140p' tests/tools-derived-name-shape.test.ts) <(sed -n '112,123p' tests/tools-entry-closed-grammar.test.ts)` → no output.
- `diff <(sed -n '211,220p' tests/tools-derived-name-shape.test.ts) <(sed -n '181,190p' tests/tools-entry-closed-grammar.test.ts)` → no output.
- `diff <(sed -n '284,305p' tests/tools-derived-name-shape.test.ts) <(sed -n '272,293p' tests/tools-entry-closed-grammar.test.ts)` → 1 differing line (the mkdtemp prefix).
- `diff <(sed -n '428,430p' tests/tools-derived-name-shape.test.ts) <(sed -n '469,471p' tests/tools-entry-closed-grammar.test.ts)` → no output.
- `grep -n "^function withCode" tests/tools-derived-name-shape.test.ts tests/tools-entry-closed-grammar.test.ts` → exactly the two lines cited (428, 469).

## Why this is a problem
Both files already migrated their `LoadOutcome`/`runProductionLoad`/plant-
dispose lifecycle and their registry read onto the shared `tests/helpers/`
modules that exist precisely to answer this repeated-harness class (their own
prior tickets PTQ-0517/PTQ-0578/PTQ-0641 record the migration). The remaining
five pieces — `expectedMessage`, `PlantedTheta`/`theta`, the
`outcome`/`workspaceDir`/`beforeAll`/`afterAll`/`observed` block, and
`withCode` — are the same size and shape of redeclaration that motivated
those earlier migrations, still living independently in both files: a future
change to how a registry template's placeholders are filled, how a fixture's
lines are joined, or how the load outcome is rendered for a failure message
must be applied by hand in both files, with nothing tying the two copies
together once they diverge.

## Suggested direction (non-binding, optional)
The five pieces are witness-file-agnostic (none reads a bug-specific
constant), so they read like `readRegistry` and `runProductionLoad` before
them — candidates for the same `tests/helpers/` layer these two files already
import from, rather than a fresh module-scope declaration per bug-doc
witness file.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; the cited lines are harness setup and rendering helpers, not a pinned
  count or inventory assertion.
- Recording-double check: `observed()` renders the shared `outcome` fields
  for a failure message and `withCode` performs a plain `.find`, backing no
  "never called" MUST-NOT witness in either file; the negative-witness
  carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "tools-derived-name-shape\|tools-entry-closed-grammar" docs/bugs/*.md` → each file's own governing bug doc (0070, 0069) names it as that bug's witness by file name; `grep -n "PlantedTheta\|expectedMessage\|observed()\|withCode" docs/bugs/0069-tools-entry-residue-silently-dropped.md docs/bugs/0070-theta-callable-default-name-unvalidated.md` → 0 hits in either — neither bug doc pins this harness itself as a documented correct-reason shape.
- coverage-matrix/bug-doc citation search: `grep -n "tools-derived-name-shape\|tools-entry-closed-grammar" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any file or `it()`/`describe()` cell — only that the five shared pieces could be imported from one place instead of declared twice.
- Prior-finding overlap check: PTQ-0517 (fixed), PTQ-0578 (fixed), and
  PTQ-0641 (fixed, different files) each covered a DIFFERENT harness layer in
  these same two files (`LoadOutcome`/`runProductionLoad`/plant-dispose, and
  the registry read) — both layers are confirmed migrated in the current
  file content read for this finding, so this candidate targets only the
  five pieces those tickets did not name. PTQ-0740 (open) separately tracks
  `withCode` as part of a five-function `resolveCallableSet`-driving quintuple
  shared among `tests/callable-set.test.ts`, `tests/tools-derived-name-shape.test.ts`,
  and `tests/uppercase-pi-tool-name-refusal.test.ts`, but does not name
  `tests/tools-entry-closed-grammar.test.ts`; this finding's `withCode` site
  in that file is cited here as part of the same-file-pair root cause (the
  bug-0069/bug-0070 witness harness), not as a fourth site of PTQ-0740's
  quintuple, since `tools-entry-closed-grammar.test.ts` does not redeclare the
  other four members of that quintuple (`piTool`/`thetaCallee`/`deps` with the
  `opts` shape/`resolveList` with the `deps` shape) that PTQ-0740 tracks.
- Coverage check: the claim is about five repeated helper DEFINITIONS each
  file's own cells already exercise; no coverage/untested-path claim is made.

## Triage
verdict: confirmed — independently re-verified: all four range diffs reproduce (mktemp scratch diff of :129-140/:112-123, :211-218/:181-188, :428-430/:469-471 empty; :284-305/:272-293 differs only on the `plantThetaWorkspace` dirPrefix literal `"theta-bug0070-"`/`"theta-bug0069-"`), `^function withCode` grep → exactly :428/:469, both sites in tests/, neither a gate kin, no recording-double/red-test carve-out, docs/bugs 0069/0070 → 0 hits on the harness names, coverage-matrix → 0, no cell merge/rename/delete proposed; the anchor is stronger than filed — tests/helpers/production-load-harness.ts:113 already exports `PlantedThetaFile` (the local `PlantedTheta` is a strict subset) and tests/helpers/registry-oracle.ts:54-61 already exports `loadRowMessage`/`interpolate` (used by 8 other test files), so `expectedMessage` is a reimplementation rather than a fresh helper; not a duplicate — resolved PTQ-0517/0578/0641 covered the runProductionLoad/plant-dispose and readRegistry layers of these files, PTQ-0739 covers only the uppercase file's plant/dispose, and open PTQ-0740 overlaps only on `withCode` in tools-derived-name-shape (disclosed; fixer should coordinate so all three files import the one helper); `sites` undercounts the family — tests/uppercase-pi-tool-name-refusal.test.ts:210-221/:311-318/:370-426/:492-494 is a byte-identical third full copy of the quintet (git: sequential copying 99b65438 → 846c110a → 185db9db) and tests/tools-entry-message-line-break.test.ts:448 carries the identical `observed()` (its `expectedMessage` is diverged) — fold both at acceptance; one immaterial inaccuracy: `grep -rl` over docs/bugs returns 15 files naming the pair, not just 0069/0070, though none pins the harness pieces (triage: claude-fable-5-1)
