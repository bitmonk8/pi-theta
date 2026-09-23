---
id: PTQ-1339
title: Both in-scope files locally redeclare registered()/fill(), byte-identical to each other and reimplementing the canonical fillParseMessage
lens: D7
status: open
verdict: confirmed
locations:
  - tests/loop-element-withhold-binding-scoped.test.ts:173-207
  - tests/match-arm-scope-inference-pass.test.ts:153-189
  - tests/helpers/registry-oracle.ts:269-296
sites: 3
fix_scope: module
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# Both in-scope files locally redeclare registered()/fill(), byte-identical to each other and reimplementing the canonical fillParseMessage

## Observation
Both files under review define a local `registered(code)` function and a local `fill(code, subs)` function with the same doc comments, same error-message wording, and the same control flow: `registered` looks up a template via `registryMessage(REGISTRY, code)` and throws a "harness: … carries no Message row for …" error naming the row and page when absent; `fill` calls `registered` then pipes the result through the imported `interpolateStrict` with the same two throw-wording closures. `tests/helpers/registry-oracle.ts` already exports `fillParseMessage` (line 292), which wraps a private `registeredParseMessage` (line 273) doing exactly this: same lookup, same absent-row throw wording ("harness: … carries no Message row for … — the DIAG-4 column … is this file's oracle, so a missing row is a harness failure, never a skip"), same `interpolateStrict` call with equivalent throw closures.

## Evidence
tests/loop-element-withhold-binding-scoped.test.ts:173-207
```ts
function registered(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: ${REGISTRY_PAGE} carries no Message row for ${code} — the DIAG-4 column (diagnostic-shape.md:74) is this file's oracle, so a missing row is a harness failure, never a skip`,
    );
  }
  return template;
}
...
function fill(code: string, subs: ReadonlyMap<string, string>): string {
  const template = registered(code);
  return interpolateStrict(
    template,
    subs,
    (token) =>
      `harness: the ${code} Message template carries placeholder ${token}, which this file supplies no substitution for — the registry row changed shape (${REGISTRY_PAGE})`,
    (token) =>
      `harness: this file substitutes ${token} into the ${code} Message, which no longer carries it — the registry row changed shape (${REGISTRY_PAGE})`,
  );
}
```

tests/match-arm-scope-inference-pass.test.ts:158-189 (identical shape, `REGISTRY` built via `readRegistry(["parse"])` instead of a manual `parseRegistry(readFileSync(...))` call, otherwise byte-identical bodies and identical throw wording):
```ts
function registered(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: ${REGISTRY_PAGE} carries no Message row for ${code} — the DIAG-4 column (diagnostic-shape.md:74) is this file's oracle, so a missing row is a harness failure, never a skip`,
    );
  }
  return template;
}
...
function fill(code: string, subs: ReadonlyMap<string, string>): string {
  const template = registered(code);
  return interpolateStrict(
    template,
    subs,
    (token) =>
      `harness: the ${code} Message template carries placeholder ${token}, which this file supplies no substitution for — the registry row changed shape (${REGISTRY_PAGE})`,
    (token) =>
      `harness: this file substitutes ${token} into the ${code} Message, which no longer carries it — the registry row changed shape (${REGISTRY_PAGE})`,
  );
}
```

tests/helpers/registry-oracle.ts:269-306 — the canonical facility both files reimplement:
```ts
function registeredParseMessage(code: string): string {
  const template = registryMessage(PARSE_REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: ${REGISTRY_PAGE} carries no Message row for ${code} — the DIAG-4 column is this file's oracle, so a missing row is a harness failure, never a skip`,
    );
  }
  return template;
}
...
export function fillParseMessage(code: string, subs: ReadonlyMap<string, string>): string {
  const template = registeredParseMessage(code);
  return interpolateStrict(
    template,
    subs,
    (token) =>
      `harness: the ${code} Message template carries placeholder ${token}, which this file supplies no substitution for — the registry row changed shape (${REGISTRY_PAGE})`,
    (token) =>
      `harness: this file substitutes ${token} into the ${code} Message, which no longer carries it — the registry row changed shape (${REGISTRY_PAGE})`,
  );
}
```
Both in-scope files already import from `./helpers/registry-oracle` (`interpolateStrict`, `typeMismatchMessages`, and in the second file `readRegistry`), so the sibling `fillParseMessage`/`registeredParseMessage` pair in the same module is a one-line-away import, not an unreachable facility.

## Why this is a problem
The two in-scope test files carry the identical `registered`/`fill` pair verbatim (same control flow, same throw wording, same two-function split), and that pair independently duplicates the logic already centralised in `tests/helpers/registry-oracle.ts`'s `fillParseMessage`/`registeredParseMessage`, which both files already import from for other symbols. This is the boilerplate-duplication and copy-paste-fixture shape named in the brief: the same harness sequence (throwing template lookup + strict interpolation) is repeated three times (two test files plus its own canonical home), each copy able to drift in wording independently of the other two.

## Suggested direction (non-binding, optional)
The natural home for a single `registered`/`fill` pair keyed to the parse registry is the existing `tests/helpers/registry-oracle.ts` module, which already exports the equivalent `fillParseMessage`; the local placeholder-free `registered(code)` reader that both files also need (for `INTERP_MESSAGE`, `ARM_MISMATCH_MESSAGE`, etc.) is a one-function gap in that module rather than a reason to keep two private, independently-maintained copies of the throwing lookup.

## False-positive check
- Gate-pin carve-out: neither file matches `*gate*.test.ts` or its named kin; not applicable.
- Recording-double carve-out: `registered`/`fill` are template-lookup/interpolation helpers, not recording doubles asserting a MUST-NOT witness; not applicable.
- docs/bugs/ signature search: ran `grep -rn "registered\|fill(" docs/bugs/*.md` for a documented correct-reason red tied to this pair — none found; both files' own headers state their tier is unit/offline/deterministic with no skip posture, and neither `registered` nor `fill` is described as a documented red.
- coverage-matrix/bug-doc citation search: ran `grep -rln "registered(\|function fill(" docs/reference/coverage-matrix.md docs/bugs/*.md` — no hits; neither local function is cited by name in the coverage matrix or a bug doc's witness list, so no merge/rename/delete-of-a-cited-test concern applies.
- Confirmed this claim stays inside D7 (test-code duplication of a harness helper across two test files and its own canonical home), not a coverage judgment: no claim is made that either file's fixtures are missing, only that the fixture-support code duplicates itself and an existing helper.

## Triage
verdict: confirmed — all three excerpts reproduce at the cited lines (loop-element-withhold-binding-scoped:173-207, match-arm-scope-inference-pass:158-189, registry-oracle.ts:273-302), the two local `fill` bodies are byte-identical to each other and to the exported `fillParseMessage` (same `interpolateStrict` call, same two throw closures verbatim; `registered` differs from the private `registeredParseMessage` only by the parenthetical `(diagnostic-shape.md:74)` and both read the same single parse shard), both copies are live (`fill` passed to `typeMismatchMessages(fill: typeof fillParseMessage)` in both files — the helper's own parameter type names the canonical facility — plus 6 direct calls in the second file; bare `registered` read at :221/:224 and :268-270), both files already import `interpolateStrict`/`typeMismatchMessages` from the same module, all locations under tests/, D7 boilerplate-duplication class, no gate/recording-double/red-test carve-out, stated searches reproduce (docs/bugs `registered(` hits name other files' oracles; coverage-matrix 0); not a duplicate — resolved PTQ-0805 hoisted the interpolation body into `interpolateStrict` but its fix left the `registered`/`fill` wrapper pair in 13 tests/*.test.ts files with `fillParseMessage` having only one importer (tests/live/b0146live), and no PTQ tracks this residual against either cited file (PTQ-0468/0816 cover other concerns in match-arm-scope-inference-pass); note the same-wave sibling intake qw20260922211400-d7-01-registered-fill-reimplements-fillparsemessage.md files the identical residual against fn-arg-member-read-proof.test.ts on a disjoint site set — fold at acceptance if the human prefers one ticket for the 13-file residual; the candidate omitted the `## Triage` heading, added here to carry this note (triage: claude-fable-5-1)
