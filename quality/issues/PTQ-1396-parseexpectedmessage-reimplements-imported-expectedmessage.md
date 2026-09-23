---
id: PTQ-1396
title: uppercase-pi-tool-name-refusal.test.ts's parseExpectedMessage reimplements the expectedMessage it already imports
lens: D7
status: open
verdict: confirmed
locations:
  - tests/uppercase-pi-tool-name-refusal.test.ts:211-219
  - tests/uppercase-pi-tool-name-refusal.test.ts:1
  - tests/helpers/registry-oracle.ts:169-180
sites: 1
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# uppercase-pi-tool-name-refusal.test.ts's parseExpectedMessage reimplements the expectedMessage it already imports

## Observation
`tests/uppercase-pi-tool-name-refusal.test.ts` imports `expectedMessage` from
`tests/helpers/registry-oracle.ts` (line 1) and calls it four times against
`REGISTRY` (lines 254, 589, 638, 660, 688). The same file also declares a
second, module-private function `parseExpectedMessage(code, subs)` whose body
is the same registry-lookup-then-substitute logic as `expectedMessage`, called
once against a second registry array, `PARSE_REGISTRY`. `expectedMessage`
already accepts the registry as its first parameter, so it is directly usable
against `PARSE_REGISTRY` without any local reimplementation.

## Evidence
`tests/uppercase-pi-tool-name-refusal.test.ts:1` (the existing import):
```ts
import { expectedMessage } from "./helpers/registry-oracle";
```

`tests/uppercase-pi-tool-name-refusal.test.ts:211-219` (the local
reimplementation, re-read immediately before filing):
```ts
function parseExpectedMessage(
  code: string,
  subs: Readonly<Record<string, string>>,
): string {
  let message = registryMessage(PARSE_REGISTRY, code) as string;
  for (const [placeholder, value] of Object.entries(subs)) {
    message = message.replaceAll(placeholder, value);
  }
  return message;
}
```

`tests/helpers/registry-oracle.ts:169-180` (the already-imported canonical
export, re-read immediately before filing):
```ts
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
The two bodies are line-for-line identical past the registry-parameter
binding: `expectedMessage(PARSE_REGISTRY, code, subs)` produces the exact
string `parseExpectedMessage(code, subs)` returns today, because
`expectedMessage`'s first parameter is `readonly Pick<RegistryRow, "code" |
"message">[]` — a shape `PARSE_REGISTRY`'s rows already satisfy (both
`REGISTRY` and `PARSE_REGISTRY` are `parseRegistry(...)` results carrying
`code`/`message`).

Exact search: `grep -n "expectedMessage(\|parseExpectedMessage(" tests/uppercase-pi-tool-name-refusal.test.ts` shows the import at line 1, four `expectedMessage(REGISTRY, ...)` call sites (254, 589, 638, 660, 688), the `parseExpectedMessage` declaration (211), and its single call site (565).

## Why this is a problem
The file already imports and uses the generalised, registry-parameterised
`expectedMessage` for its `REGISTRY` (load-registry) lookups. The second
registry page (`PARSE_REGISTRY`, needed once for
`theta/parse/invoke-non-theta-extension`'s message) reaches for a
byte-for-byte reimplementation of the same function under a new name instead
of calling the export already in scope with `PARSE_REGISTRY` as the first
argument — the two copies can diverge from each other with no shared
enforcement point.

## Suggested direction (non-binding, optional)
Replacing the single call `parseExpectedMessage(INVOKE_NON_THETA_EXTENSION_CODE, { "<path>": spec })`
with `expectedMessage(PARSE_REGISTRY, INVOKE_NON_THETA_EXTENSION_CODE, { "<path>": spec })`
and deleting the local `parseExpectedMessage` declaration would remove the
duplicate definition.

## False-positive check
- Gate-pin check: the file does not match `*gate*.test.ts` or the named gate
  kin; the cited lines are a registry-message reader, not a pinned count or
  inventory.
- Recording-double check: `parseExpectedMessage`/`expectedMessage` perform a
  synchronous registry lookup and string substitution; neither records calls
  nor backs a "never called" witness, so the negative-witness carve-out does
  not apply.
- docs/bugs/ signature search: `grep -n "parseExpectedMessage\|expectedMessage" docs/bugs/0108-uppercase-pi-tool-name-mints-unspellable-callable.md` returns 0 hits stating a rationale for a second, page-bound copy.
- coverage-matrix/bug-doc citation search: `grep -n "uppercase-pi-tool-name-refusal" docs/reference/coverage-matrix.md` returns 0 hits. The bug doc cites this file by name and by group id (A-C8), never by `parseExpectedMessage`'s internal implementation; this finding proposes no change to any `it()`/`describe()` name, count, or assertion — only to where the message-rendering call is made.
- Coverage check: the claim is about a repeated function DEFINITION with an already-imported canonical counterpart in the SAME file, not a missing test path; the local copy is exercised by its one call site (group C5).
- Prior-filing overlap check: `grep -rl "uppercase-pi-tool-name-refusal.test.ts" quality/resolved quality/intake quality/issues` returns PTQ-0739 (production-load harness duplication) and PTQ-0740 (resolveCallableSet harness duplication) — both name different helpers; neither cites `parseExpectedMessage` or `expectedMessage`.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: `parseExpectedMessage` at tests/uppercase-pi-tool-name-refusal.test.ts:211-219 is byte-identical to the imported `expectedMessage` (tests/helpers/registry-oracle.ts:169-180) apart from binding `PARSE_REGISTRY` as the registry argument; the import at line 1 and the four `expectedMessage(REGISTRY, …)` calls (254, 589, 638, 660, 688) plus the single `parseExpectedMessage` call (565) reproduce exactly; `PARSE_REGISTRY` is cast `{ code: string; message: string }[]` so it satisfies `expectedMessage`'s `Pick<RegistryRow,"code"|"message">[]` parameter with no adapter; grep across tests/src/extensions/tools finds no other user; docs/bugs/0108 and coverage-matrix greps return 0 hits; prior filings on this file (PTQ-0698, PTQ-0739, PTQ-0740) name resolveScalar/deps, production-load and resolveCallableSet harnesses, not this helper; D7 boilerplate-duplication in tests/, no gate/recording-double/red carve-out applies; fix is a mechanical one-call substitution plus deletion (triage: claude-fable-5-1)
