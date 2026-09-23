---
id: PTQ-1507
title: tools-entry-grammar-derivations-lockstep.test.ts's local `rendered()` reimplements registry-oracle.ts's exported `expectedMessage`, despite importing sibling exports from the same module
lens: D7
status: open
verdict: confirmed
locations:
  - tests/tools-entry-grammar-derivations-lockstep.test.ts:1-2
  - tests/tools-entry-grammar-derivations-lockstep.test.ts:112-133
  - tests/helpers/registry-oracle.ts:170-185
sites: 1
fix_scope: localized
wave: qw20260923203928
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# tools-entry-grammar-derivations-lockstep.test.ts's local `rendered()` reimplements registry-oracle.ts's exported `expectedMessage`, despite importing sibling exports from the same module

## Observation
`tests/tools-entry-grammar-derivations-lockstep.test.ts` imports `readRegistry`
and `registryHintOf` from `./helpers/registry-oracle` (line 2), then declares
its own module-level function `rendered(registry, code, subs = {})` (lines
112-133) that looks up a code's Message template via `registryMessage`,
asserts it is defined, and fills `<…>` placeholders with a `replaceAll` loop.
`tests/helpers/registry-oracle.ts` already exports `expectedMessage(registry,
code, subs)` (lines 170-185 approx.) doing the identical
lookup-assert-fill sequence, but the in-scope file never imports it.

## Evidence
`tests/tools-entry-grammar-derivations-lockstep.test.ts:1-2`:
```ts
import { readCorpus } from "./helpers/corpus-reader";
import { readRegistry, registryHintOf } from "./helpers/registry-oracle";
```

`tests/tools-entry-grammar-derivations-lockstep.test.ts:112-133`:
```ts
const LOAD_REGISTRY = readRegistry(["load"]);
const PARSE_REGISTRY = readRegistry(["parse"]);

/** Source a code's registered *Message* template and fill its `<…>` placeholders. */
function rendered(
  registry: readonly { code: string; message: string }[],
  code: string,
  subs: Readonly<Record<string, string>> = {},
): string {
  let message = registryMessage(registry, code) as string | undefined;
  expect(
    message,
    `${code} has no row in the sharded registry, so DIAG-4 has no normative ` +
      "string for this cell to source",
  ).toBeDefined();
  let out = message as string;
  for (const [placeholder, value] of Object.entries(subs)) {
    // `replaceAll` — the shadowed-callable template repeats `<name>`.
    out = out.replaceAll(placeholder, value);
  }
  return out;
}
```

`tests/helpers/registry-oracle.ts:170-185` — the canonical, already-exported
equivalent, reachable through the import line the same in-scope file already
opens for `readRegistry`/`registryHintOf`:
```ts
/** Source a code's registered *Message* template and fill its `<…>` placeholders. */
export function expectedMessage(
  registry: readonly Pick<RegistryRow, "code" | "message">[],
  code: string,
  subs: Readonly<Record<string, string>>,
): string {
  let message = registryMessage(registry, code) as string;
  expect(
    message,
    `${code} has no registry row, so DIAG-4 has no normative string for this witness to source`,
  ).toBeDefined();
  for (const [placeholder, value] of Object.entries(subs)) {
    // `replaceAll` — the rename template repeats `<name>`.
    message = message.replaceAll(placeholder, value);
  }
  return message;
}
```

The two functions differ only in: the `subs` parameter's default (`= {}`
locally vs required in `expectedMessage`, which every call site in the
in-scope file supplies anyway — `malformedMessage`, `rendered(LOAD_REGISTRY,
CALLEE_HAS_ERRORS, {...})`, etc. all pass a `subs` argument), the assertion
message's wording, and the local variable names (`message`/`out` vs
`message`/`message`).

## Why this is a problem
The in-scope file already has the import line for `./helpers/registry-oracle`
open (line 2) and uses two of its exports (`readRegistry`, `registryHintOf`),
so `expectedMessage` is one identifier away. The local `rendered` reproduces
`expectedMessage`'s full body — the same `registryMessage` read, the same
"has no row" `toBeDefined()` guard, the same placeholder-fill loop — under a
different name, which is the copy-paste-fixture shape D7 targets: a helper
re-implemented in test code where the canonical helper already exists under
`tests/helpers/` and is already imported from in the same file.

## Suggested direction (non-binding, optional)
Sourcing `rendered`'s body from the already-imported `expectedMessage` (adding
it to the existing `registry-oracle` import line) is the natural next step;
that is an observation about where the duplicated logic already lives, not a
design for the fix stage.

## False-positive check
Gate-pin: the file is not named `*gate*.test.ts` and its census/pin content
(group A6's `toEqual(["ctlgood", "zgood"])`) is unrelated to this citation —
not a gate carve-out. Recording-double: `rendered`/`expectedMessage` are pure
message-rendering functions, not recording doubles — carve-out does not apply.
docs/bugs/ signature search: `grep -n "tools-entry-grammar-derivations-lockstep.test.ts:" docs/bugs/*.md`
finds citations to specific cells by line (e.g. `:1347`, `:1434` in bug 0271/
0275, group (D3)/(D5)), none overlapping lines 112-133; `docs/bugs/0106-...md`
and `docs/bugs/0107-...md` cite the file as a whole witness (24 cells) but
never cite `rendered` or the specific message-builder lines. coverage-matrix
search: `grep -n "tools-entry-grammar-derivations-lockstep" docs/reference/coverage-matrix.md`
returns no hits, so no matrix citation is at risk. This finding is about
existing test code re-implementing an existing test helper, not about missing
coverage.

## Triage
verdict: confirmed — checked against the current code: `rendered` at lockstep.test.ts:115-133 and the exported `expectedMessage` at registry-oracle.ts:170-185 do the same things: the same `registryMessage` lookup, the same `toBeDefined()` row-presence guard and the same `replaceAll` fill loop. They differ only in guard wording, local variable names, and the `subs = {}` default, which no caller relies on because all 8 calls (:145/:643/:702/:840/:921/:947/:1126 and the one inside the `malformedMessage` wrapper) pass `subs`. Line 2 already imports `readRegistry`/`registryHintOf` from that module, and `readRegistry`'s RegistryRow[] fits `expectedMessage`'s `Pick<RegistryRow,"code"\|"message">[]` parameter. So this is a mechanical D7 boilerplate-duplication fix, the same shape as the confirmed PTQ-1375/PTQ-1396. None of the listed exceptions applies: the file is not a gate, this is not a recording double, docs/bugs has no citation of these lines, and coverage-matrix has 0 hits. Not a duplicate: PTQ-1392 (fixed) replaced this file's `loadRegistry` but left `rendered`, and sibling d7-02 covers the `malformedMessage` wrapper, a different root cause (triage: claude-opus-5-5)
