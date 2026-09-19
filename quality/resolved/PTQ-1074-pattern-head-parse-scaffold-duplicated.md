---
id: PTQ-1074
title: The pattern-position parse/refusal scaffold (FM/theta/patternRange/existing/expectDiagnostics/expectRefused) is redeclared byte-identical across both object-pattern-head test files
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/object-pattern-head-field-set-refusal.test.ts:310-317
  - tests/object-pattern-head-field-set-refusal.test.ts:330-332
  - tests/object-pattern-head-field-set-refusal.test.ts:363-365
  - tests/object-pattern-head-field-set-refusal.test.ts:383-391
  - tests/object-pattern-head-field-set-refusal.test.ts:413-423
  - tests/object-pattern-head-unresolved-refusal.test.ts:170-176
  - tests/object-pattern-head-unresolved-refusal.test.ts:180-186
  - tests/object-pattern-head-unresolved-refusal.test.ts:211-213
  - tests/object-pattern-head-unresolved-refusal.test.ts:222-230
  - tests/object-pattern-head-unresolved-refusal.test.ts:372-382
sites: 2
fix_scope: module
wave: qw20260918220713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# The pattern-position parse/refusal scaffold (FM/theta/patternRange/existing/expectDiagnostics/expectRefused) is redeclared byte-identical across both object-pattern-head test files

## Observation
Both `tests/object-pattern-head-field-set-refusal.test.ts` and `tests/object-pattern-head-unresolved-refusal.test.ts` each declare, module-scope, five identical pieces on top of their (already-shared) `DiagShape`/`shapes`/`render`/`range`/`deniesRegistration` import from `./helpers/load-row-harness`: the `FM` frontmatter constant, a `theta(body)` wrapper around `parseDoc`, a `patternRange(line, column, pattern)` span builder, an `existing(code, message, at)` `DiagShape` builder, an `expectDiagnostics(body, expected, why)` whole-list assertion, and an async wrong-arm assertion helper whose body is byte-identical between the two files and differs only in its name (`expectRefused` in one file, `expectRefusedWrongArm` in the other).

## Evidence
`tests/object-pattern-head-field-set-refusal.test.ts:310-317`:
```ts
const FM = "---\nmode: prompt\n---\n";

const FILE = "bug0226.theta";

function theta(body: string): ThetaDocument {
  return parseDoc(FM + body, FILE);
}
```

`tests/object-pattern-head-unresolved-refusal.test.ts:180-186` (same three declarations, only the `FILE` literal differs):
```ts
const FM = "---\nmode: prompt\n---\n";

const FILE = "bug0221.theta";

function theta(body: string): ThetaDocument {
  return parseDoc(FM + body, FILE);
}
```

`tests/object-pattern-head-field-set-refusal.test.ts:330-332` and `tests/object-pattern-head-unresolved-refusal.test.ts:170-172` — `patternRange`, byte-identical body in both:
```ts
function patternRange(line: number, column: number, pattern: string): SourceRange {
  return range(line, column, line, column + pattern.length);
}
```

`tests/object-pattern-head-field-set-refusal.test.ts:363-365` and `tests/object-pattern-head-unresolved-refusal.test.ts:211-213` — `existing`, byte-identical:
```ts
function existing(code: string, message: string, at: SourceRange): DiagShape {
  return { severity: "error", code, file: FILE, range: at, message };
}
```

`tests/object-pattern-head-field-set-refusal.test.ts:383-391` and `tests/object-pattern-head-unresolved-refusal.test.ts:222-230` — `expectDiagnostics`, byte-identical:
```ts
function expectDiagnostics(
  body: string,
  expected: readonly DiagShape[],
  why: string,
): ThetaDocument {
  const doc = theta(body);
  expect(shapes(doc), `${why}\n  actual diagnostics: ${render(doc)}`).toEqual([...expected]);
  return doc;
}
```

`tests/object-pattern-head-field-set-refusal.test.ts:413-423` (`expectRefused`) vs. `tests/object-pattern-head-unresolved-refusal.test.ts:372-382` (`expectRefusedWrongArm`) — identical parameter list and body, only the declared name differs:
```ts
async function expectRefused(
  body: string,
  expected: readonly DiagShape[],
  why: string,
): Promise<void> {
  const doc = theta(body);
  const execution = await execute(doc);
  expect(
    deniesRegistration(doc.diagnostics),
    `${why}\n  the body answers ${JSON.stringify(execution.result.value)} (outcome=${execution.outcome})\n  actual diagnostics: ${render(doc)}`,
  ).toBe(true);
  expect(shapes(doc), `${why}\n  actual diagnostics: ${render(doc)}`).toEqual([...expected]);
}
```

Exact search: `grep -n "^const FM\|^function theta\|^function patternRange\|^function existing\|^function expectDiagnostics" tests/object-pattern-head-field-set-refusal.test.ts tests/object-pattern-head-unresolved-refusal.test.ts` returns exactly one match of each of the five names in each of the two files (10 matches total); a further `grep -n "^async function expectRefused"` (with and without the `WrongArm` suffix) returns exactly one match in each file.

## Why this is a problem
Six pieces of parse/assertion plumbing — a fixed frontmatter constant, a `parseDoc` wrapper, a pattern-span builder, a `DiagShape` builder for codes this fix does not move, a whole-diagnostic-list assertion, and an async registration-denial assertion whose body is byte-for-byte identical apart from its name — are each authored independently in two sibling files reviewing the same `match` object-pattern-head family, rather than declared once. The two in-scope files already share `DiagShape`/`shapes`/`render`/`range`/`deniesRegistration` from `tests/helpers/load-row-harness.ts` (the prior duplication of exactly that scaffold was resolved as PTQ-0646) and the `execute`/`expectValue` runtime pair from `tests/helpers/prompt-value-harness.ts` (resolved as PTQ-0645), so this remaining six-piece layer sits directly beside two already-extracted siblings with no shared source of one of its own.

## Suggested direction (non-binding, optional)
The already-existing `tests/helpers/load-row-harness.ts` (source of `DiagShape`/`shapes`/`render`/`range`/`deniesRegistration` for both files) or `tests/helpers/prompt-value-harness.ts` (source of `execute`/`expectValue`) is the natural home the prior two extractions already established for this exact file pair's shared plumbing; a parameterised `patternRange`/`expectDiagnostics`/wrong-arm-assertion trio would sit beside them the same way.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or a named gate kin; this is a harness-declaration duplication, not a pinned count or corpus inventory.
- Recording-double check: none of the six pieces is a fake, double, or MUST-NOT witness; `theta`/`patternRange`/`existing`/`expectDiagnostics`/`expectRefused` are parse wrappers and assertion helpers over real diagnostics.
- docs/bugs/ signature search: `grep -rl "patternRange\|expectRefusedWrongArm" docs/bugs/*.md` returns 0 hits — neither bug document (0221, 0226, 0234, 0317) names either function as a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "object-pattern-head-field-set-refusal\|object-pattern-head-unresolved-refusal" docs/reference/coverage-matrix.md` returns 0 hits. Both bug docs cite these two files repeatedly by cell id (`a1`, `x1`, etc.), never for the `FM`/`theta`/`patternRange`/`existing`/`expectDiagnostics`/`expectRefused` declaration lines cited here; no merge, rename, or deletion of either file or any cell is proposed.
- Prior-filing overlap check: `grep -rl "patternRange\|expectRefusedWrongArm" quality/store quality/resolved quality/intake` finds only PTQ-0645 (resolved), which names `expectRefusedWrongArm` solely as an aside inside its own evidence paragraph about the (now-fixed) `rootDouble`/`producer`/`execute`/`expectValue` quintet, not as a cited location of its own finding; PTQ-0646 (resolved) cites a disjoint five-piece scaffold (`DiagShape`/`shapes`/`render`/`readRepoFile`/`REGISTRY_PARSE_PAGE`) that both files have since migrated onto `tests/helpers/load-row-harness.ts`/`tests/helpers/registry-oracle.ts`. Neither prior finding's location list cites `FM`, `theta`, `patternRange`, `existing`, `expectDiagnostics`, or the wrong-arm assertion body at the line ranges cited here.
- Coverage-drift check: the claim is entirely about repeated harness/assertion DEFINITIONS; each file's own cells exercise its own copy, so this is not a coverage-gap claim.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all six excerpts reproduce at the cited lines and my mktemp sed-range diffs show patternRange (:330-332 vs :170-172), existing (:363-365 vs :211-213) and expectDiagnostics (:383-391 vs :222-230) byte-identical, FM/theta (:310-317 vs :180-186) differing only in the bug0226/bug0221 FILE literal, and expectRefused (:413-423) vs expectRefusedWrongArm (:372-382) differing only in the declared name; the stated grep returns exactly the 12 declarations (6 per file), every piece is live (field-set: 14 expectRefused/14 patternRange/5 expectDiagnostics calls; unresolved: 7 expectRefusedWrongArm/30 expectDiagnostics/13 existing calls), no tests/helpers module exports a body-parsing theta/patternRange/existing/expectDiagnostics/wrong-arm helper, docs/bugs grep → 0, coverage-matrix → 0, neither file is a gate or recording double, and resolved PTQ-0645 (runtime quintet, fix 93ed4e00) / PTQ-0646 (DiagShape quintet) cite disjoint scaffolds — genuine D7 boilerplate-duplication in tests/ only; accounting corrections, non-refuting: (1) a canonical `FM` is ALREADY exported at tests/helpers/prompt-value-harness.ts:88, which both files import createParsedPromptHarness from yet redeclare, so the FM piece is a not-migrated redeclaration rather than a missing extraction; (2) the layer is undercounted — patternRange and existing recur byte-identical in tests/pattern-field-literal-integer-narrowing-refusal.test.ts:303-305/:351-353, its expectRefused (:450-462) is the same body routed through expectDiagnosticsOf, and FM/theta/existing/expectDiagnostics recur in capitalised-bare-match-pattern-refusal and reserved-keyword-object-pattern-head-refusal too; (3) same-wave untriaged sibling quality/intake/qw20260918220713-d7-02-theta-expectdiagnostics-trio-duplicated.md cites the theta/existing/expectDiagnostics trio across those five files INCLUDING this pair at the identical ranges (:383-391, :222-230) — one shared pattern-refusal harness resolves both, so acceptance must consolidate the two rows under a single carrier (fold d7-02's five-file trio inventory and this row's FM/patternRange/wrong-arm pieces together) rather than mint two PTQs for one extraction (triage: claude-fable-5-1)
