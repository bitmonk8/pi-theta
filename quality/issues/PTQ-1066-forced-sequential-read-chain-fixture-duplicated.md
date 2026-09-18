---
id: PTQ-1066
title: The forced-sequential three-file read chain fixture and its instruction text are redeclared with only the numeric payload changed across two hardening files
lens: D7
status: open
verdict: confirmed
locations:
  - tests/live/hardening/session-promptloop.test.ts:43-56
  - tests/live/hardening/session-subagent-toolloop.test.ts:69-83
sites: 2
fix_scope: module
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# The forced-sequential three-file read chain fixture and its instruction text are redeclared with only the numeric payload changed across two hardening files

## Observation
`tests/live/hardening/session-promptloop.test.ts` and
`tests/live/hardening/session-subagent-toolloop.test.ts` each declare a
module-scope array of three `PlantedFile`-shaped fixtures (`ch1.txt`,
`ch2.txt`, `ch3.txt`) whose text forces a model to perform sequential `read`
rounds by naming the next file to read, plus a companion instruction string
that tells the model to walk the chain and report the final number plus a
fixed addend. `ch1.txt`'s and `ch2.txt`'s text is byte-identical between the
two files; `ch3.txt`'s text and the instruction string differ only in the
planted number (3193 vs 4271) and the addend (2000 vs 3000) and cosmetic
line-wrapping — the sentence structure, the "STEP1/STEP2/STEP3 done" phrasing,
and the "Read exactly ONE file at a time, following the chain, until a file
gives you a final number. Report that number plus N. Answer with the number
only." phrasing are identical.

## Evidence

`tests/live/hardening/session-promptloop.test.ts:43-56`:
```ts
const CHAIN: readonly PlantedFile[] = [
  { source: "rel", path: "ch1.txt", text: "STEP1 done. Next, read the file ch2.txt to continue." },
  { source: "rel", path: "ch2.txt", text: "STEP2 done. Next, read the file ch3.txt to continue." },
  {
    source: "rel",
    path: "ch3.txt",
    text: "STEP3 done. The final number is 3193. Stop; do not read any more files.",
  },
];

const CHAIN_QUERY =
  "@`Read the file ch1.txt. Each file names the next file to read. Read exactly ONE " +
  "file at a time, following the chain, until a file gives you a final number. " +
  "Report that number plus 2000. Answer with the number only.`";
```

`tests/live/hardening/session-subagent-toolloop.test.ts:69-83` — re-read
immediately before filing:
```ts
const CHAIN_FILES = [
  { source: "rel" as const, path: "ch1.txt", text: "STEP1 done. Next, read the file ch2.txt to continue." },
  { source: "rel" as const, path: "ch2.txt", text: "STEP2 done. Next, read the file ch3.txt to continue." },
  {
    source: "rel" as const,
    path: "ch3.txt",
    text: "STEP3 done. The final number is 4271. Stop; do not read any more files.",
  },
];

const CHAIN_INSTRUCTION =
  "Read the file ch1.txt. Each file names the next file to read. Read exactly ONE file at a time, " +
  "following the chain, until a file gives you a final number. Report that number plus 3000. " +
  "Answer with the number only.";
```

Exact search: `grep -n "ch1.txt\|ch2.txt\|ch3.txt" tests/live/hardening/*.test.ts`
over the eight files in this review's scope that live in
`tests/live/hardening/` returns hits only in these two files (`session-
promptloop.test.ts` and `session-subagent-toolloop.test.ts`); no third
in-scope file declares this fixture.

## Why this is a problem
Both files independently encode the same "force >= 3 sequential tool rounds
via a chain of files that each name the next" fixture design, including the
exact wording of the STEP1/STEP2/STEP3 sentences and the exact wording of the
"read exactly ONE file at a time … Report that number plus N" instruction,
with only the two numeric literals differing. Each file's own header comment
independently derives and states why its own planted-number choice is
non-vacuous (session-promptloop's "3193", session-subagent-toolloop's
"4271"), duplicating that reasoning as well as the fixture bytes. A change to
the chain's shape (e.g. a fourth hop, or a different phrasing found to be
less refusal-prone) has to be made in both files' independently-typed copies
to stay consistent.

## Suggested direction (non-binding, optional)
A parameterised builder (e.g. `chainFixture(finalNumber: number, addend:
number)`) returning both the three `PlantedFile`s and the instruction string
is the shape both call sites' identical-but-for-two-numbers bodies point at;
`tests/helpers/live-probe-helpers.ts` (which both files already import `F`/
`transportish`/`driveOnce` from) is the module both already draw shared
live-drive plumbing from.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kinds (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate).
- Recording-double check: the three files are static fixture text handed to
  a real model, not a recording double backing a "never called" witness;
  the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "STEP1 done\|STEP2 done\|STEP3 done" docs/bugs/*.md`
  → 0 hits; neither file's own governing finding doc states a rationale for
  keeping two independently-typed copies of this chain fixture.
- coverage-matrix/bug-doc citation search: `grep -n
  "session-promptloop\|session-subagent-toolloop" docs/reference/coverage-matrix.md`
  → 0 hits. This finding proposes no change to any `it()`/`describe()` name,
  count, or assertion — only that the duplicated fixture/instruction bytes
  could be built once — so the citation carve-out does not bind.
- Coverage check: the claim is entirely about a repeated fixture-literal
  DEFINITION, not a missing test path; each copy is exercised by its own
  file's tests, both of which already run.

## Triage
<!-- triage appends: verdict + one-line reason. Nothing above this line is edited. -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at exactly :43-56 and :69-83; ch1/ch2 lines are byte-identical (modulo `as const`) and a mktemp-normalised diff of the two ranges with the planted number/addend substituted is empty, so the copies differ only in 3193/2000 vs 4271/3000 plus wrapping; both copies are live (spread at promptloop :70/:123, toolloop :95/:141; instruction consumed at :82/:133 and :108/:162, sums asserted at :105/:149 and :123/:176); repo-wide grep of `ch1.txt|ch2.txt|ch3.txt` and `STEP1 done` outside these two files yields only b0327's unrelated `qz-ch2.txt` scripted-model fixture; both copies originate in the same commit (a6a5953e, 2026-07-28 — same-commit sibling repetition, and promptloop's header says "like STL-2"); docs/bugs and coverage-matrix searches reproduce at 0 hits; the bug-0254 sweep report (.pi/tmp/fixes/0254-report.md) deliberately chose DISTINCT per-file plants/addends/sums but states no rationale for two independently-typed fixture texts — a parameterised builder preserves that decision; tests/helpers/live-probe-helpers.ts exports `F`/`transportish`/`driveOnce` but no chain builder; D7 copy-paste-fixture class in tests/ with no gate/recording-double/documented-red/failLoudly carve-out touched; not tracked (PTQ-0772/0775 cover `transportish`/`driveOnce` in these files, PTQ-0940 is the invoke_callee chain, intake d7-02 is the b0271/b0275/b0280 tools-chain summand harness); minor: the suggestion paragraph's claim that both files import `F`/`transportish`/`driveOnce` is inaccurate (promptloop imports only `driveOnce`, toolloop only `transportish`) but it is non-binding and does not bear on the finding (triage: claude-fable-5-1)
