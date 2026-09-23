---
id: PTQ-1375
title: theta-callable-call-arity.test.ts and tool-arg-parse-checks.test.ts each redeclare expectedMessage rather than importing the exported helper of the same name from registry-oracle.ts
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/theta-callable-call-arity.test.ts:62-73
  - tests/tool-arg-parse-checks.test.ts:96-110
  - tests/helpers/registry-oracle.ts:168-180
sites: 2
fix_scope: module
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# theta-callable-call-arity.test.ts and tool-arg-parse-checks.test.ts each redeclare expectedMessage rather than importing the exported helper of the same name from registry-oracle.ts

## Observation
`tests/theta-callable-call-arity.test.ts` and
`tests/tool-arg-parse-checks.test.ts` each declare a local
`expectedMessage(code, subs)` that reads a registered Message template off a
locally-held `REGISTRY` array via the raw `registryMessage` import, fills its
`<…>` placeholders with `replaceAll`, and asserts no `<…>` token remains.
Both files already import `readRegistry` from `./helpers/registry-oracle`,
which exports a function of the exact same name performing the identical
substitution loop — parameterised over the caller's own registry array —
but neither file imports it.

## Evidence
`tests/theta-callable-call-arity.test.ts:1-2` (the existing import from the
module that also exports `expectedMessage`):
```ts
import { disposeWorkspace, plantThetaWorkspace, runProductionLoad, type LoadOutcome } from "./helpers/production-load-harness";
import { readRegistry } from "./helpers/registry-oracle";
```

`tests/theta-callable-call-arity.test.ts:62-73` (the local redeclaration):
```ts
function expectedMessage(
  code: string,
  subs: Readonly<Record<string, string>>,
): string {
  let message = registryMessage(REGISTRY, code) as string;
  for (const [placeholder, value] of Object.entries(subs)) {
    message = message.replaceAll(placeholder, value);
  }
  expect(
    message,
    `${code}: an unsubstituted <…> placeholder remains — the registry row's ` +
      "Message template changed shape and this file's substitutions are stale",
  ).not.toMatch(/<[a-z]+>/);
  return message;
}
```

`tests/tool-arg-parse-checks.test.ts:1` (the existing import):
```ts
import { parseDeps, range, withCode } from "./helpers/e2e-s1";
import { readRegistry } from "./helpers/registry-oracle";
```

`tests/tool-arg-parse-checks.test.ts:96-110` (the local redeclaration, same
substitution loop and same unsubstituted-placeholder assertion, plus one
extra registry-row-presence assertion the sibling file above omits):
```ts
function expectedMessage(code: string, subs: Readonly<Record<string, string>>): string {
  let message = registryMessage(REGISTRY, code) as string;
  expect(
    message,
    `${code}: the diagnostics registry carries no Message for this code — the ` +
      "row was renamed or removed and this file's DIAG-4 sourcing is stale",
  ).toBeTypeOf("string");
  for (const [placeholder, value] of Object.entries(subs)) {
    message = message.replaceAll(placeholder, value);
  }
  expect(
    message,
    `${code}: an unsubstituted <…> placeholder remains — the registry row's ` +
      "Message template changed shape and this file's substitutions are stale",
  ).not.toMatch(/<[a-z]+>/);
  return message;
}
```

`tests/helpers/registry-oracle.ts:168-180` — the canonical, already-exported
equivalent (same substitution loop, parameterised over `registry` so any
caller's own `REGISTRY` works):
```ts
/** Source a code's registered *Message* template and fill its `<…>` placeholders. */
export function expectedMessage(
  registry: readonly Pick<RegistryRow, "code" | "message">[],
  code: string,
  subs: Readonly<Record<string, string>>,
): string {
  let message = registryMessage(registry, code) as string;
  for (const [placeholder, value] of Object.entries(subs)) {
    // `replaceAll` — the rename template repeats `<name>`.
    message = message.replaceAll(placeholder, value);
  }
  return message;
}
```

Search: `grep -n "^function expectedMessage" tests/theta-callable-call-arity.test.ts tests/tool-arg-parse-checks.test.ts` finds exactly these two local declarations (line 62 and line 96 respectively); both files' `registry-oracle` import names only `readRegistry`, never `expectedMessage`, and both separately import `registryMessage` directly from `../tools/code-registry/index.js` to rebuild the substitution loop the helper already exports under the identical name.

## Why this is a problem
Both files already have an open `import { readRegistry } from
"./helpers/registry-oracle"`, yet neither extends it to also import
`expectedMessage` — each instead re-derives the identical placeholder-
substitution loop and the identical unsubstituted-placeholder assertion
locally. This is the "Boilerplate duplication" class: the same registry-
message-substitution sequence is declared three times (twice in scope, once
in the helper) under the identical exported name, so a change to the
substitution semantics (e.g. how a repeated placeholder is handled) must be
mirrored by hand across every local copy and the shared export.

## Suggested direction (non-binding, optional)
`expectedMessage` from `tests/helpers/registry-oracle.ts` already performs
the identical substitution against a caller-supplied registry array; each
file's own unsubstituted-placeholder `expect` (and, in
`tool-arg-parse-checks.test.ts`, the registry-row-presence `expect`) is the
one part that would stay local as a thin wrapper around the import, since the
exported version omits both.

## False-positive check
- Gate-pin check: neither `theta-callable-call-arity.test.ts` nor
  `tool-arg-parse-checks.test.ts` matches `*gate*.test.ts` or a named gate
  kin; the cited lines are a message-substitution helper declaration, not a
  pinned count or inventory.
- Recording-double check: `expectedMessage` reads a static registry array and
  returns a filled string; it records no call and backs no "never called"
  witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "expectedMessage" docs/bugs/*.md` →
  0 hits; no documented correct-reason red covers either local declaration.
- coverage-matrix/bug-doc citation search: `grep -n
  "theta-callable-call-arity\|tool-arg-parse-checks"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any `it()`/`describe()` — only that each
  file's local `expectedMessage` re-derivation could call the existing export
  of the same name it already has an open import path to.
- Prior-finding overlap check: `grep -rl "expectedMessage"
  quality/intake quality/resolved` before filing found `PTQ-0558`, `PTQ-0578`,
  and a same-wave candidate against `nested-tools-entry-containment.test.ts` /
  `tools-entry-containment.test.ts` — none names either file cited here.
- Coverage-drift check: the claim is about a repeated function DEFINITION,
  not a missing test path; every cell in both files exercises the
  substitution logic through its own call sites.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — reproduces: `grep -n "^function expectedMessage"` hits exactly tests/theta-callable-call-arity.test.ts:62 and tests/tool-arg-parse-checks.test.ts:96; both files' registry-oracle import names only `readRegistry` while tests/helpers/registry-oracle.ts:168-180 exports `expectedMessage(registry, code, subs)` with the same `registryMessage` + `replaceAll` loop (landed 43cf854a, 2026-09-19, after these files' earlier migrations); D7 boilerplate-duplication in tests/ only; 0 hits in docs/bugs and coverage-matrix, neither file is a gate; not a duplicate — PTQ-0718/0669/0719 against these files cover the REGISTRY read, production-load harness and makeDeps/range/withCode, none names the substitution helper, and the same-wave sibling candidate cites different files (nested-tools/tools-entry); the local unsubstituted-placeholder / row-presence `expect`s stay as a thin wrapper (triage: claude-fable-5-1)
