---
id: PTQ-1657
title: Bug 0449's recorded WHY says tests/live/b0342live-forwarded-enum-declaring-file-identity-live-cell.test.ts drives re-export-chain-forwarded enum accesses, but the cell contains no import or re-export
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0449-reexport-chain-enum-unknown-variant-null-panic.md:265-272
  - tests/live/b0342live-forwarded-enum-declaring-file-identity-live-cell.test.ts:69-107
  - src/runtime/statement-executor.ts:598-613
sites: 1
fix_scope: localized
d10_class: overstated-strength
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0449's recorded WHY says tests/live/b0342live-forwarded-enum-declaring-file-identity-live-cell.test.ts drives re-export-chain-forwarded enum accesses, but the cell contains no import or re-export

## Observation
Bug 0449's defect sits on enums that are reached through a re-export chain (`export … from` across `.thetalib` files). Its live obligation is discharged by an "adjacent witness" whose recorded WHY says the b0342 live cell "drives VALID re-export-chain-forwarded enum member accesses (`Sev.Low`)". That cell's three fixtures each declare `enum Sev` locally and pass values between files with `invoke<…>` across subagent envelopes. None of the fixtures contains an `import`, an `export`, or a `.thetalib`. So every `Sev.Low` the cell reads resolves against a same-file declaration, never against a chain-reached one.

## Evidence
Claim, `docs/bugs/0449-reexport-chain-enum-unknown-variant-null-panic.md:265-272` (verbatim, re-read before filing):
```
  - Live: `tests/live/b0342live-forwarded-enum-declaring-file-identity-live-cell.test.ts`
    → 1/1 green through the real host (H8a). Adjacent witness (recorded WHY):
    it drives VALID re-export-chain-forwarded enum member accesses (`Sev.Low`)
    through the exact async executor enum member arm this belt modifies, so a
    green run witnesses the belt insertion did not regress live valid-variant
    resolution; the belt fires only on the unknown-variant defect path no live
    cell exercises, and the offline b0449 witness pins that path
    deterministically through the same production `executeBody` seam.
```

Evidence, `tests/live/b0342live-forwarded-enum-declaring-file-identity-live-cell.test.ts:69-107` (excerpt):
```
const SEV_DECL = 'enum Sev { Low = "low", High = "high" }';
const SUB_C = ["---", "mode: subagent", "---", SEV_DECL, "Sev.Low", ""].join("\n");
const SUB_B = [ "---", "mode: subagent", "---", SEV_DECL,
  "schema Pair { own: Sev, fwd: Sev }",
  'let c = invoke<Sev>("./b0342livesubc.theta")?',
  "Pair { own: Sev.Low, fwd: c }", "", ].join("\n");
const TOP = [ "---", "mode: prompt", "---", SEV_DECL, ...
  'let p = invoke<Pair>("./b0342livesubb.theta")?',
  'let direct = invoke<Sev>("./b0342livesubc.theta")?', ...
```
(Condensed from :69-107. Each fixture begins with `SEV_DECL`, and values cross files only through `invoke`.)

Searches (run this session, over the cell file):
- `grep -cE "\"(import|export) |'(import|export) " tests/live/b0342live-forwarded-enum-declaring-file-identity-live-cell.test.ts`: 0. No fixture line imports or exports.
- `grep -ciE "re-export|reexport" tests/live/b0342live-forwarded-enum-declaring-file-identity-live-cell.test.ts`: 0.
- `grep -nE "export|import" <same file>`: 5 lines, all TypeScript harness imports or header comments (:49, :50, :59, :60, :67). None is theta fixture text.
- `grep -c "SEV_DECL" <same file>`: 4. That is the declaration plus one use in each of the three fixtures, so every fixture declares `Sev` locally.

The belt's arm, `src/runtime/statement-executor.ts:598-613`, is shared by same-file and chain-reached enums. The belt branch runs only after `resolveEnumVariant` misses:
```
  if (expr.target.kind === "ident" && env.resolve(expr.target.name).arm !== "local") {
    const variant = env.resolveEnumVariant(expr.target.name, expr.field);
    if (variant !== undefined) {
      return { flow: "value", value: variant };
    }
    // Bug 0449: ... A re-export chain's static walk withholds a variant verdict on
    // a chain-reached specifier, ...
    if (env.isRegisteredEnum(expr.target.name)) {
      throw new UnknownVariantDefectError(expr.target.name, expr.field);
```

## Why this is a problem
The WHY is the justification for letting an adjacent cell stand in for a live witness of this fix. It rests on the cell covering the fix's own surface, the re-export chain. The cell exercises the shared member arm only for same-file enums. Its "forwarded" means values forwarded through subagent envelopes (bug 0342's subject), not specifiers forwarded through `export … from`. So the recorded evidence is weaker than the wording. It supports "the arm still resolves a valid same-file variant live". It does not support "re-export-chain-forwarded enum member accesses" live. No live cell in the record exercises chain-reached enum registration.

## Suggested direction (non-binding, optional)
Reword the WHY to what the cell drives: same-file-declared enum variants read through the shared async member arm, with values forwarded across subagent envelopes. Alternatively, cite a live cell whose fixture actually reaches an enum through `export … from`, if one exists. Among files that mention re-exports, tests/live/live-production-acceptance.test.ts is the only tests/live file that combines `export … from` with `enum`, and it is unverified for this path.

## False-positive check
- Opened the full fixture block (:69-107) and the cell's header. The header (:1-32) describes a depth-2 subagent chain (C→B→TOP), not a re-export chain.
- Representations covered: the bug-doc Live/Witness lines in 0449 (the offline witness tests/b0449-reexport-chain-enum-unknown-variant.test.ts exists with 4 `it(` cells, matching the record's "4 passed", and is not challenged); the cell file's name and body (the four greps above); the tests/live corpus (`grep -rliE "re-export|reexport" tests/live` lists 8 files, and b0342live is not among them); coverage-matrix rows and AGENTS.md gate names (no live gate is at issue); CHANGELOG (not used as proof).
- Checked the other b0342live citations (bugs 0293, 0329, 0331, 0342, 0347). They cite it for subagent-chain or composition-root paths, which is consistent with its content. Only 0449 describes it as re-export-chain.
- The adjacency cell is a tests/live/** witness and is not gate-proven. Its truth is not adjudicated here, only whether its content matches the wording.

## Triage
verdict: questionable — accounting verified. The 0449 claim at :265-272 reproduces word for word ("VALID re-export-chain-forwarded enum member accesses (`Sev.Low`)"). All three b0342live fixtures (SUB_C/SUB_B/TOP, :69-107) declare `enum Sev` locally via SEV_DECL (4 hits) and pass values only through `invoke<…>` across subagent envelopes. The stated greps reproduce: 0 theta import/export lines, 0 re-export mentions, and the 5 import/export hits (:49,:50,:59,:60,:67) are all harness or comment lines. b0342live is not among the 8 tests/live files that mention re-exports. The statement-executor.ts:598-613 arm is the shared path. So the cell is live evidence for same-file enums read through that arm, not for chain-reached ones. Rewording the record is a human ruling. Not a duplicate: PTQ-1551 is the pure-host belt posture, a different root cause (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: D10 RULED REWORD (overstated-strength). APPEND EXACTLY the following block at the very end of docs/bugs/0449-reexport-chain-enum-unknown-variant-null-panic.md, nothing else; every existing line stays byte-identical:

### Correction note — 2026-09-28 (D10 wave qw20260928081617)

The recorded WHY above says tests/live/b0342live-forwarded-enum-declaring-file-identity-live-cell.test.ts drives VALID re-export-chain-forwarded enum member accesses. All three fixtures in that cell declare enum Sev locally (a shared SEV_DECL) and pass values across subagent envelopes; no theta import/export line and no re-export chain exists in the file. The cell is live evidence for same-file enum reads through the shared statement-executor arm; chain-reached accesses are witnessed by the offline b0449 cells only.
