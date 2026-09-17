---
id: PTQ-0549
title: division-result-type-number.test.ts's parse/message/anchor/runtime harness (fill, message builders, parse/render/allHits/hit, anchorsOf, argRange family, typeOfTail/reading, producer/runFixture, fixtures) is redeclared near-verbatim in modulo-zero-result-type-number.test.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/division-result-type-number.test.ts:227-266
  - tests/division-result-type-number.test.ts:271-330
  - tests/division-result-type-number.test.ts:342-368
  - tests/division-result-type-number.test.ts:401-441
  - tests/division-result-type-number.test.ts:551-617
  - tests/division-result-type-number.test.ts:633-691
  - tests/division-result-type-number.test.ts:692-741
  - tests/division-result-type-number.test.ts:742-750
  - tests/modulo-zero-result-type-number.test.ts:248-271
  - tests/modulo-zero-result-type-number.test.ts:292-372
  - tests/modulo-zero-result-type-number.test.ts:381-407
  - tests/modulo-zero-result-type-number.test.ts:442-482
  - tests/modulo-zero-result-type-number.test.ts:596-662
  - tests/modulo-zero-result-type-number.test.ts:680-739
  - tests/modulo-zero-result-type-number.test.ts:756-792
  - tests/modulo-zero-result-type-number.test.ts:793-801
sites: 2
fix_scope: module             # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 1
---

# division-result-type-number.test.ts's parse/message/anchor/runtime harness is redeclared near-verbatim in modulo-zero-result-type-number.test.ts

## Observation
`tests/division-result-type-number.test.ts` (bug 0142) builds a ~600-line, multi-part harness: a template-placeholder filler (`fill`), a family of Message-builder functions (`narrowingMessage`, `arrayElementMessage`, `letRhsMessage`, `objectFieldMismatchMessage`, `arithmeticMessage`), a parse/render layer (`parse`, `at`, `render`, `allHits`, `hit`), an AST-anchor walker (`anchorsOf` plus its `Anchors` interface and the `argRange`/`letRange`/`letInitRange`/`objectFieldRange`/`parForMaxRange` readers built on it), a raw-type-read layer (`typeOfTail`/`reading`/`RawRead`), and a runtime layer (`NOOP_CHECKPOINT`/`producer`/`RunOutcome`/`runFixture`), plus the shared fixture constants `G_INT`/`G_NUM`/`G_STR`/`S_INT`/`S_STR`. `tests/modulo-zero-result-type-number.test.ts` (bug 0152, the sibling bug this file's own comments repeatedly cross-reference) redeclares every one of these pieces at its own module scope, several of them byte-for-byte identical and the rest differing only in the bug number embedded in a string, the operator each per-file walker step tracks (`/` vs `%`), or one added parameter (`moduloCount`). No `tests/helpers/` module holds any part of this shared block; each file's own comment header states only that the two are "sibling" reports, never that one imports the other's harness.

## Evidence

`tests/division-result-type-number.test.ts:227-266` (`fill`, plus the message-builder functions built on it) vs `tests/modulo-zero-result-type-number.test.ts:248-271` — byte-identical `fill` body (confirmed via `diff`, 0 output):
```ts
function fill(code: string, subs: ReadonlyMap<string, string>): string {
  const template = registered(code);
  const used = new Set<string>();
  const message = template.replace(/<[a-z]+>/g, (token) => {
    const value = subs.get(token);
    if (value === undefined) {
      throw new Error(
        `harness: the ${code} Message template carries placeholder ${token}, which this file supplies no substitution for — the registry row changed shape (${REGISTRY_PAGE})`,
      );
    }
    used.add(token);
    return value;
  });
  for (const token of subs.keys()) {
    if (!used.has(token)) {
      throw new Error(
        `harness: this file substitutes ${token} into the ${code} Message, which no longer carries it — the registry row changed shape (${REGISTRY_PAGE})`,
      );
    }
  }
  return message;
}
```

`tests/division-result-type-number.test.ts:271-330` (`narrowingMessage`/`arrayElementMessage`/`letRhsMessage`/`arithmeticMessage`/`objectFieldMismatchMessage`) vs `tests/modulo-zero-result-type-number.test.ts:292-372` — `diff` over each function body (accounting for `modulo-zero-result-type-number.test.ts`'s one extra function, `invokeArgMessage`, inserted between them) shows every shared function's body byte-identical; representative excerpt, `letRhsMessage`, identical in both files:
```ts
function letRhsMessage(name: string, expected: string, actual: string): string {
  return fill(
    LET_RHS_CODE,
    new Map([
      ["<name>", name],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}
```

`tests/division-result-type-number.test.ts:342-368` (`parse`/`at`/`render`/`allHits`/`hit`) vs `tests/modulo-zero-result-type-number.test.ts:381-407` — `diff` over both ranges produces 0 output; `parse` and `render` are byte-identical:
```ts
function parse(src: string): ThetaDocument {
  return parseDoc(FM + src, FILE);
}
```
```ts
function render(doc: ThetaDocument): string {
  return JSON.stringify(
    doc.diagnostics.map(
      (d: Diagnostic) => `${d.severity} ${d.code} @${at(d.range)}: ${d.message}`,
    ),
  );
}
```

`tests/division-result-type-number.test.ts:401-441` (`anchorsOf`'s `calls`/`lets`/`objectFields`/`parForMaxes` tracking and the `walkExpr`/`walkBlock`/`walkStmt` traversal shape) vs `tests/modulo-zero-result-type-number.test.ts:442-482` — `diff` shows the entire traversal structure (the four collector arrays, the `switch` over `Expr`/`Stmt` kinds, the recursive calls) identical; the only divergence is the per-bug tracked operator (`divisions`/`e.op === "/"` vs `modulos`/`moduloDivisors`/`e.op === "%"`), confirmed by `diff` producing exactly two differing hunks over this 41-line span.

`tests/division-result-type-number.test.ts:551-617` (`argRange`/`letRange`/`letInitRange`/`objectFieldRange`/`parForMaxRange`) vs `tests/modulo-zero-result-type-number.test.ts:596-662` — `diff` over both ranges produces exactly one hunk, a citation added to `letRange`'s doc comment (`type-compat.ts` vs `type-compat.ts:429`); every function body is byte-identical, e.g. `argRange`:
```ts
function argRange(doc: ThetaDocument, callee: string, index: number): SourceRange {
  const calls = anchorsOf(doc).calls.filter((c) => c.callee === callee);
  expect(
    calls,
    `PRECONDITION: the fixture must hold exactly one call of '${callee}'; the parse found ${calls.length}. Diagnostics: ${render(doc)}`,
  ).toHaveLength(1);
  const args = calls[0]!.args;
  expect(
    args.length,
    `PRECONDITION: the call of '${callee}' must carry an argument at index ${index}; it carries ${args.length}. Diagnostics: ${render(doc)}`,
  ).toBeGreaterThan(index);
  return args[index]!;
}
```

`tests/division-result-type-number.test.ts:633-691` (`typeOfTail`/`reading`/`NOOP_CHECKPOINT`) vs `tests/modulo-zero-result-type-number.test.ts:680-739` — `diff` shows only doc-comment wording differs (e.g. "The reading a `/` node is owed" vs "The reading a zero-divisor `%` node is owed"); `NOOP_CHECKPOINT` is byte-identical:
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};
```

`tests/division-result-type-number.test.ts:692-741` (`RunOutcome`/`runFixture`) vs `tests/modulo-zero-result-type-number.test.ts:756-792` — the bodies are structurally identical (`parse` → `expectDivisions`/`expectModulos` precondition → build `ThetaCompositionInput`/`ConversationBindInput` → `producer().bindPromptConversation` → `executeBody` → the identical "must run to completion" `expect` message → return `{codes, value, isInteger}`), diverging only in the slash name (`bug0142` vs `bug0152`), the precondition-helper name, and one added `moduloCount` parameter:
```ts
async function runFixture(src: string, cell: string): Promise<RunOutcome> {
  const doc = parse(src);
  expectDivisions(doc, 1, cell);
  const theta: ThetaCompositionInput = {
    slashName: "bug0142",
    sourcePath: "/theta/bug0142.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const bindInput: ConversationBindInput = {
    theta,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  };
  const binding = producer().bindPromptConversation(bindInput);
  const execution = await executeBody(theta.body, binding.executeDeps);
  expect(
    execution.outcome,
    `PRECONDITION (${cell}): the body must run to completion, or the value assertion below measures an abort rather than the value that reached the annotated position`,
  ).toBe("success");
  const value = execution.result.value;
  return {
    codes: doc.diagnostics.map((d: Diagnostic) => d.code),
    value: String(value),
    isInteger: Number.isInteger(value),
  };
}
```

`tests/division-result-type-number.test.ts:742-750` (`G_INT`/`G_NUM`/`G_STR`/`S_INT`/`S_STR`) vs `tests/modulo-zero-result-type-number.test.ts:793-801` — byte-identical, confirmed via `diff` (0 output):
```ts
const G_INT = "fn g(n: integer): number { 1 }\n";
const G_NUM = "fn g(n: number): number { 1 }\n";
const G_STR = "fn g(s: string): number { 1 }\n";
const S_INT = "schema S { n: integer }\n";
const S_STR = "schema S { s: string }\n";
```

## Why this is a problem
The same ~600-line, seven-part harness — template filling, message builders, parse/render, AST-anchor extraction, raw-type reads, the runtime driver, and the shared fixture constants — is authored twice, with most functions byte-identical and the rest diverging only by a bug number, an operator literal, or one added parameter, rather than being shared once. Neither file's header comment (each of which extensively cross-references the other bug's disposition, e.g. division's t9/b8 cells being "RETAKEN by bug 0152") states that the harness itself was copied; only the domain rows below it differ. `tests/helpers/` holds no module exporting any part of this block (`readRegistry`/`e2e-s1`/`theta-corpus` cover the registry read and the parse driver, not this file family's own message-builder/anchor/runtime layer), so a change to any shared piece — a new field the `Anchors` walk must track, a change to how `runFixture` binds a conversation, a new placeholder-validation rule in `fill` — landing in one copy and not the other would silently leave the two bug-witness suites checking a different diagnostic-harness contract with nothing in either file surfacing the drift.

## Suggested direction (non-binding, optional)
`tests/helpers/` is this suite's existing home for cross-file harness pieces (`e2e-s1.ts` for the parse driver, `theta-corpus.ts` for the committed-corpus sweep, `registry-oracle.ts` for the registry read); a module exporting the shared `fill`/message-builder-factory/`anchorsOf`-style-walker/`runFixture`-style-driver shape, parameterised by the operator and bug slug each file already varies, is the home this pair of files' own near-identical bodies already point at.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate, registry-closed-set-corpus-gate); nothing cited here is a pinned count or inventory assertion.
- Recording-double check: `anchorsOf`/`runFixture` walk a real, freshly-parsed AST and drive a real executor; no fake records calls to back a "never called" witness, so the recording-double carve-out does not apply.
- docs/bugs/ signature search: `grep -n "harness\|copied\|duplicat" docs/bugs/0142-division-result-type-not-number.md docs/bugs/0152-modulo-zero-result-type-not-number.md` shows both documents discuss cell-by-cell dispositions and cross-references (RETAKEN cells, §Non-goals) but neither states a rationale for keeping the shared harness local to each file; neither file is a documented correct-reason red — `npx vitest run tests/division-result-type-number.test.ts tests/modulo-zero-result-type-number.test.ts` both pass in full at HEAD.
- coverage-matrix/bug-doc citation search: `grep -n "division-result-type-number.test.ts\|modulo-zero-result-type-number.test.ts" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of either file or any of its `it()`/`describe()` cells — only that the shared harness plumbing beneath the domain-specific rows could live in one place.
- Coverage check: the claim is about a repeated harness DEFINITION, not a missing test path; every cited function is exercised by the passing tests in its own file.
- Prior-finding overlap check: grepped this wave's already-filed d7-01..d7-09 titles and the supplied already-filed/resolved list for "division-result-type-number" and "modulo-zero-result-type-number" together — the only hits (PTQ-0210/0226/0240/0259/0266/0280/0312, and this wave's `d7-03-planted-stem-suffix-guard-quintupled`) each target a disjoint root cause: PTQ-0210/0240/0259/0312 target the `runProductionLoad`-family fake-host construction and plant/dispose lifecycle in a *different* pair of files (`*-invoke.test.ts` variants, `arg-mismatch-diagnostic-count-by-surface.test.ts`, `conformance/production-conformance.test.ts`) that this finding's cited harness never touches; PTQ-0226 targets the `git ls-files` committed-corpus discovery step (now migrated to `tests/helpers/theta-corpus.ts`'s `committedThetaSources`, confirmed imported at the top of `tests/division-result-type-number.test.ts`); PTQ-0242 (fixed) targeted 8 now-repaired `.toBeDefined()` wraps around `argRange`/`letRange` (re-verified at the cited lines above: the current file uses `.not.toThrow()` on a wrapped closure, not `.toBeDefined()`); PTQ-0266/PTQ-0280 target a misleading name and a stale comment in a different, unrelated file (`tests/division-result-type-number-invoke.test.ts`); this wave's `d7-03-planted-stem-suffix-guard-quintupled` targets a suffix-collision guard at the bottom of five other production-load files that neither `division-result-type-number.test.ts` nor `modulo-zero-result-type-number.test.ts` is among. None of these prior findings' Evidence sections cite the `fill`/message-builder/`parse`/`render`/`anchorsOf`/`argRange`-family/`typeOfTail`/`runFixture`/fixture-constant lines cited here.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified by extracting and diffing each layer (registered/fill/message builders :208-330 vs :231-372; parse/at/render/allHits/hit :334-372 vs :373-411; Anchors/anchorsOf/arithmeticOpRange :373-542 vs :412-587; argRange…parForMaxRange :551-617 vs :596-662; RawRead/typeOfTail/reading/NOOP_CHECKPOINT/producer :618-691 vs :663-738; RunOutcome/runFixture/G_*/S_* :692-750 vs :739-801): every body is byte-identical except the FILE/slashName bug slug, the tracked operator (`divisions`/`/` vs `modulos`+`moduloDivisors`/`%`), one added `moduloCount` parameter, one extra builder (`invokeArgMessage`) and doc-comment wording — with drift already visible (letRange's `type-compat.ts` vs `type-compat.ts:429` citation); both files were authored in separate commits (4d072c83 bug-0142, 35b718cc bug-0152), import only parseDoc/committedThetaSources from tests/helpers (grep `helpers/` → 2 imports each), no helper exports anchorsOf/runFixture/typeOfTail/fill (grep tests/helpers → 0), `npx vitest run` both files 86/86 green (not a documented red), neither is a gate, no recording double, no it()-cell merge/rename/delete, coverage-matrix 0 hits, and bug 0152's "harness shape tests/division-result-type-number.test.ts establishes" (docs/bugs/0152:309) documents the copy, not a rationale for keeping it file-local (same class as confirmed PTQ-0210/0240/0259/0312); not a duplicate of any PTQ (0242 = cannot-fail class on argRange/letRange, 0226 = corpus discovery, 0266/0280 = the -invoke sibling) — fixer should coordinate with same-wave intake d7-01-argrange-letrange-precondition-pair-triplicated (confirmed; its argRange/letRange sites are a subset of this harness) and d7-01-division-modulo-registry-read-not-migrated (:188-223, disjoint from the ranges cited here) (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
