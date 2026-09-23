---
id: PTQ-1506
title: let-arm-withhold-binding-scoped.test.ts redeclares registry-oracle.ts's registeredParseMessage/fillParseMessage instead of importing them
lens: D7
status: open
verdict: confirmed
locations:
  - tests/let-arm-withhold-binding-scoped.test.ts:152-192
  - tests/helpers/registry-oracle.ts:242-308
  - tests/loop-element-withhold-binding-scoped.test.ts:1-6
sites: 1
fix_scope: localized
wave: qw20260923203928
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# let-arm-withhold-binding-scoped.test.ts redeclares registry-oracle.ts's registeredParseMessage/fillParseMessage instead of importing them

## Observation
`tests/helpers/registry-oracle.ts` exports `readRegistry`, `registeredParseMessage(code)` and `fillParseMessage(code, subs)` — a message-oracle pair that reads a code's normative registered *Message* template (throwing a named-row failure if absent) and interpolates its `<…>` placeholders in one pass (throwing on an unsupplied or unused placeholder). `tests/let-arm-withhold-binding-scoped.test.ts` imports `typeMismatchMessages` from that same module but declares its own module-scope `REGISTRY_PAGE`, `REGISTRY` (a direct `parseRegistry` call over the parse-registry page), `registered(code)` and `fill(code, subs)`, reproducing the exported pair's bodies near-verbatim. Its own sibling file in this review's scope, `tests/loop-element-withhold-binding-scoped.test.ts`, imports the canonical pair directly (`fillParseMessage as fill, registeredParseMessage as registered` from `./helpers/registry-oracle`) and declares neither locally.

## Evidence
tests/helpers/registry-oracle.ts:242 (the shard read the exported pair uses):
```ts
const PARSE_REGISTRY = readRegistry(["parse"]);
```

tests/helpers/registry-oracle.ts:274-287 (canonical `registeredParseMessage`, re-read immediately before filing):
```ts
/**
 * A registered code's normative *Message* template. Throws naming the registry
 * page when the row is absent, so a registry drift can never degrade an
 * assertion below into a comparison against `undefined`.
 */
export function registeredParseMessage(code: string): string {
  const template = registryMessage(PARSE_REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: ${REGISTRY_PAGE} carries no Message row for ${code} — the DIAG-4 column is this file's oracle, so a missing row is a harness failure, never a skip`,
    );
  }
  return template;
}
```

tests/helpers/registry-oracle.ts:298-308 (canonical `fillParseMessage`, re-read immediately before filing):
```ts
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

tests/let-arm-withhold-binding-scoped.test.ts:152-171 (local redeclaration of the page constant and `registered`, re-read immediately before filing):
```ts
/** The live `theta/parse/*` registry page — this file's message oracle. */
const REGISTRY_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

const REGISTRY = parseRegistry(
  readFileSync(fileURLToPath(new URL(`../${REGISTRY_PAGE}`, import.meta.url)), "utf8"),
) as RegistryRow[];

/**
 * A registered code's normative *Message* template. Throws naming the row and
 * the page when it is absent, so a registry drift can never degrade an
 * assertion below into a comparison against `undefined`.
 */
function registered(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: ${REGISTRY_PAGE} carries no Message row for ${code} — the DIAG-4 column (diagnostic-shape.md:74) is this file's oracle, so a missing row is a harness failure, never a skip`,
    );
  }
  return template;
}
```

tests/let-arm-withhold-binding-scoped.test.ts:182-192 (local redeclaration of `fill`, re-read immediately before filing):
```ts
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

tests/loop-element-withhold-binding-scoped.test.ts:1-6 (the sibling file in this review's own scope, importing the canonical pair rather than redeclaring it):
```ts
import { CLEAN, expectSiteRow, one, two, type SiteRow } from "./helpers/load-row-harness";
import {
  fillParseMessage as fill,
  registeredParseMessage as registered,
  typeMismatchMessages,
} from "./helpers/registry-oracle";
```

Import check: `grep -n "^import" tests/let-arm-withhold-binding-scoped.test.ts` shows `parseRegistry, registryMessage` drawn directly from `../tools/code-registry/index.js` and `interpolateStrict, typeMismatchMessages` from `./helpers/registry-oracle` — `registeredParseMessage` and `fillParseMessage` are not among the names imported from that module.

## Why this is a problem
The exported `registeredParseMessage`/`fillParseMessage` pair already performs the read-registry, throw-on-missing-row, and interpolate-with-both-direction-throw sequence this file needs, and its own sibling in this review's scope demonstrates the import is a drop-in replacement (`fillParseMessage as fill, registeredParseMessage as registered`, consumed identically by `typeMismatchMessages(fill)` in both files). The local copy instead re-derives the registry page path, re-parses it with a second `parseRegistry` call, and re-declares both functions under the same names, so a wording or behavioural change to the canonical pair (for example the DIAG-4 citation this local copy appends to its own error message) has no mechanism keeping the two copies in agreement.

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts` is already the home this file's own sibling draws the pair from (observation, not design).

## False-positive check
- Gate-pin carve-out: `tests/let-arm-withhold-binding-scoped.test.ts` does not match `*gate*.test.ts` or its named kin; not applicable.
- Recording-double carve-out: `registered`/`fill` are message-oracle plumbing, not a recording double witnessing a MUST-NOT call; not applicable.
- docs/bugs/ signature search: `grep -rln "registeredParseMessage\|fillParseMessage" docs/bugs/*.md` → 0 hits; not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "let-arm-withhold-binding-scoped" docs/reference/coverage-matrix.md` → 0 hits; the file is not cited by name, so no merge/rename/delete-of-a-cited-test concern applies.
- Confirmed this stays inside D7 duplication territory: the claim is about the repeated oracle-function bodies between one in-scope file and a helper module (with an in-scope sibling as the drop-in-replacement proof), not about missing coverage or suite composition.

## Triage
verdict: confirmed — re-verified: let-arm-withhold-binding-scoped.test.ts:152-192 declares its own REGISTRY_PAGE/`parseRegistry` read of code-registry-parse.md plus `registered`/`fill`, and these match the exported `registeredParseMessage`/`fillParseMessage` (registry-oracle.ts:242, 279-308, which read the same page via PARSE_REGISTRY_PATH). The only difference is the `(diagnostic-shape.md:74)` parenthetical in the missing-row throw. Both local functions are live: `fill` is passed to `typeMismatchMessages(fill)` and `registered` is read at :207. The file already imports `interpolateStrict`/`typeMismatchMessages` from that module at :2, and its sibling loop-element-withhold-binding-scoped.test.ts:1-6 imports the canonical pair as `fill`/`registered`. Everything is under tests/ and falls in D7's boilerplate-duplication class, with no gate or recording-double carve-out. The stated searches reproduce: docs/bugs → 0 hits, coverage-matrix → 0 hits. Not a duplicate: the resolved PTQ-1339/PTQ-1340 cover the same residual in other files, and no open issue or other intake item names this file (triage: claude-opus-5-5)
