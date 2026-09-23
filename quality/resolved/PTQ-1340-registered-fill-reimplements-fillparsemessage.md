---
id: PTQ-1340
title: fn-arg-member-read-proof.test.ts redeclares registered()/fill() byte-identical to registry-oracle's registeredParseMessage/fillParseMessage
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/fn-arg-member-read-proof.test.ts:165-192
  - tests/helpers/registry-oracle.ts:273-302
sites: 2
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# fn-arg-member-read-proof.test.ts redeclares registered()/fill() byte-identical to registry-oracle's registeredParseMessage/fillParseMessage

## Observation
`tests/fn-arg-member-read-proof.test.ts` already imports `interpolateStrict`,
`readRegistry` and `typeMismatchMessages` from `tests/helpers/registry-oracle.ts`
(line 2), but it also declares its own local `registered()` and `fill()`
functions (lines 165-192) that perform the same registry-lookup-then-interpolate
sequence as the exported `registeredParseMessage()` / `fillParseMessage()`
already living in that same helper module (registry-oracle.ts:273-302). The
local functions' bodies, including the thrown error-message wording, are
byte-identical to the canonical ones apart from the local variable names
(`REGISTRY` vs `PARSE_REGISTRY`, both bound to `readRegistry(["parse"])`).

## Evidence

tests/fn-arg-member-read-proof.test.ts:158-192
```ts
const REGISTRY = readRegistry(["parse"]);

/**
 * A registered code's normative *Message* template. Throws naming the registry
 * page when the row is absent, so a registry drift can never degrade an
 * assertion below into a comparison against `undefined`.
 */
function registered(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: ${REGISTRY_PAGE} carries no Message row for ${code} — the DIAG-4 column is this file's oracle, so a missing row is a harness failure, never a skip`,
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

tests/helpers/registry-oracle.ts:273-302
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

The two pairs are the identical algorithm and identical thrown-message text
(`registryMessage(<registry>, code)` → throw-if-`undefined` → `interpolateStrict`
with the same two failure-wording closures), differing only in the name of the
module-scope registry constant each closes over. `fillParseMessage` is already
`export`ed and is already the function the module's own downstream builders
(`fnArgMessage`, `objectFieldMismatchMessage`, `letRhsMessage`) call as their
default `fill` parameter — the same role the test file's local `fill` plays for
its own local `objectField()`, `bindingCase()` and `matchArm()` wrappers
(tests/fn-arg-member-read-proof.test.ts:194-222).

## Why this is a problem
`tests/helpers/registry-oracle.ts`'s own file header states the module exists
because this exact read-then-interpolate sequence "were redeclared byte-for-byte
(confirmed via `diff`) in several test files" and centralises it. This test
file imports three other exports from that same module on line 2
(`interpolateStrict`, `readRegistry`, `typeMismatchMessages`) — proving it
already depends on the module — yet re-declares the two functions
(`registeredParseMessage`/`fillParseMessage`) that module already exports under
local names (`registered`/`fill`), with the same throw wording, instead of
importing `fillParseMessage` directly.

## Suggested direction (non-binding, optional)
Importing `fillParseMessage` from `tests/helpers/registry-oracle.ts` in place
of the local `registered`/`fill` pair is the module's own stated purpose for
this file's read pattern.

## False-positive check
- Gate-pin check: this file is not named `*gate*.test.ts` and files no pinned
  census/inventory count; not applicable.
- Recording-double check: `registered`/`fill` are not recording doubles or
  MUST-NOT witnesses; not applicable.
- docs/bugs/ signature search: `grep -rn "registered\b\|fill(" docs/bugs/0190*`
  found no reference to this local pair as a documented correct-reason
  duplication; the file's own extensive header discusses bug 0190's fix route,
  not a rationale for re-declaring the registry-read helper.
- coverage-matrix/bug-doc citation search: `grep -rn "fn-arg-member-read-proof"
  docs/reference/coverage-matrix.md docs/bugs/*.md` returned only the file's
  self-reference inside its own header comment (the u6p/u6b/u6c cross-reference
  to tests/fn-arg-type-mismatch-wired.test.ts); no external document cites
  `registered` or `fill` by name, so renaming/removing the local pair is not
  constrained by a pinning citation.
- This finding is confined to the two named functions in the two named files
  (one root cause: local reimplementation of an already-imported-from module's
  own exported helper); it does not propose a coverage change and does not
  touch production code.

## Triage
verdict: confirmed — independently re-verified: both excerpts reproduce at fn-arg-member-read-proof.test.ts:158-194 and registry-oracle.ts:273-302; mktemp sed-extract + diff after renaming only REGISTRY→PARSE_REGISTRY and the two function names → zero diff (same throw wording, same two interpolateStrict failure closures, both over readRegistry(["parse"])); the local pair is live (fill called at :211/:224/:229 and passed to typeMismatchMessages at :204, registered only via fill), the file imports three other exports from the same helper on :2, and the suite is 23/23 green so the swap is mechanical; both locations under tests/, D7 boilerplate-duplication class, not a gate file, not a recording double, no it()/describe() change proposed, docs/bugs (0150/0190/0192/0199) cite the file as a behaviour witness only and coverage-matrix → 0; not a duplicate — PTQ-0805 (fixed) tracked the two-guard interpolation body and its fix extracted interpolateStrict leaving this wrapper, PTQ-0468 (fixed) covered the registry read, PTQ-0967's fix (27eb9e20) touched this very file yet kept the local fill by threading it through typeMismatchMessages(fill) "to a file's … failure wording" — a parameter that buys nothing here since the wording is byte-identical to fillParseMessage (exported since e54a42b3, before that fix), and no open issue names this file; accounting note for acceptance: `^function fill(code` still recurs in 13 tests/*.test.ts files, so the fixer may fold the byte-identical siblings into the same import swap (triage: claude-fable-5-1)
