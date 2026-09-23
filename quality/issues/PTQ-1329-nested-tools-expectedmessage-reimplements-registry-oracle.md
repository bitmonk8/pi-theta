---
id: PTQ-1329
title: nested-tools-entry-containment.test.ts re-declares expectedMessage rather than importing the exported helper of the same name in tests/helpers/registry-oracle.ts
lens: D7
status: open
verdict: confirmed
locations:
  - tests/nested-tools-entry-containment.test.ts:83-96
  - tests/helpers/registry-oracle.ts:169-181
  - tests/tools-entry-containment.test.ts:70-83
sites: 2
fix_scope: module
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# nested-tools-entry-containment.test.ts re-declares expectedMessage rather than importing the exported helper of the same name in tests/helpers/registry-oracle.ts

## Observation
`tests/nested-tools-entry-containment.test.ts` declares a local
`expectedMessage(code, subs)` function that reads a message template off a
local `REGISTRY` via the raw `registryMessage` import, fills its `<…>`
placeholders with `replaceAll`, and asserts no `<…>` token remains.
`tests/helpers/registry-oracle.ts` already exports a function of the exact
same name and the exact same substitution logic
(`expectedMessage(registry, code, subs)`), taking the registry as its first
parameter. The in-scope file imports `readRegistry` from that same module but
not `expectedMessage`, and instead re-declares the function locally, byte-for-
byte identical (module the unsubstituted-placeholder assertion) to the same
local declaration in `tests/tools-entry-containment.test.ts`.

## Evidence
`tests/nested-tools-entry-containment.test.ts:83-96`:
```ts
/** Source a code's registered *Message* template and fill its `<…>` placeholders. */
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

`tests/tools-entry-containment.test.ts:70-83` — byte-identical (`diff
<(sed -n '84,96p' tests/nested-tools-entry-containment.test.ts) <(sed -n
'71,83p' tests/tools-entry-containment.test.ts)` produces no output over the
function body):
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

`tests/helpers/registry-oracle.ts:169-181` — the canonical, already-exported
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

Search: `grep -n "^function expectedMessage" tests/*.test.ts` finds exactly
these two declarations (`nested-tools-entry-containment.test.ts:84`,
`tools-entry-containment.test.ts:71`); both import `readRegistry` from
`./helpers/registry-oracle` (`grep -n "helpers/registry-oracle"
tests/nested-tools-entry-containment.test.ts
tests/tools-entry-containment.test.ts` shows one hit each, the `readRegistry`
import, in neither case naming `expectedMessage`) and both separately import
`registryMessage` directly from `../tools/code-registry/index.js` to build the
function the module already exports under the identical name.

## Why this is a problem
`tests/helpers/registry-oracle.ts` is the file both tests already import
`readRegistry` from, and it exports an `expectedMessage` function performing
the identical placeholder-substitution work these two files' local
declarations perform, under the identical exported name — differing only in
that the local copies additionally assert (via `expect(...).not.toMatch(...)`)
that no placeholder survived, an assertion the exported version omits. Both
in-scope-adjacent files re-derive the substitution loop locally rather than
calling the one export already reachable through the import they both already
have open, so a change to the substitution semantics (e.g. how repeated
placeholders are handled) must be mirrored by hand across both local copies
and the shared export.

## Suggested direction (non-binding, optional)
`expectedMessage` from `tests/helpers/registry-oracle.ts` already performs the
identical substitution; a thin local wrapper adding the unsubstituted-
placeholder assertion, or an inline `expect` call at each call site, is the
natural place this points to rather than a fully re-derived function.

## False-positive check
- Gate-pin check: neither cited file matches `*gate*.test.ts` or its named
  kin; the cited lines are a helper function definition, not a pinned count
  or inventory.
- Recording-double check: `expectedMessage` reads a static registry array and
  returns a filled string; it records no call and backs no "never called"
  witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "expectedMessage" docs/bugs/*.md` →
  0 hits; no documented correct-reason red names this function or states a
  reason it must stay file-local.
- coverage-matrix/bug-doc citation search: `grep -n
  "nested-tools-entry-containment\|tools-entry-containment.test"
  docs/reference/coverage-matrix.md` → 0 hits (both files are named by
  docs/bugs/0111 and docs/bugs/0070/0071-adjacent reports as witnesses, but
  this finding proposes no merge, rename or deletion of either file or any
  `it()`/`describe()` — only that the local `expectedMessage` re-derivation
  could call the existing export of the same name).
- Prior-finding overlap check: `grep -rl "expectedMessage" quality/` before
  filing found only `PTQ-0558` and `PTQ-0578`, neither of which names either
  cited file or this specific function; no pending or resolved ticket covers
  this pair.
- Coverage-drift check: the claim is about a repeated function DEFINITION,
  not a missing test path; every cell in both files exercises the
  substitution logic through its own call sites.

## Triage
verdict: confirmed — independently re-verified: the local `expectedMessage` bodies reproduce at nested-tools-entry-containment.test.ts:84-96 and tools-entry-containment.test.ts:70-82 and diff byte-identical; tests/helpers/registry-oracle.ts:169-180 exports `expectedMessage(registry, code, subs)` with the identical `registryMessage` + `replaceAll` loop (live: imported by b0397-binder-failure-note-runtime-event, tools-derived-name-shape, tools-entry-closed-grammar, uppercase-pi-tool-name-refusal), and that export landed 2026-09-19 (43cf854a) AFTER resolved PTQ-0641 migrated these two files' REGISTRY read (which is why both import only `readRegistry` and still hold the pre-export local copy); both locals are live (3 and 5 call sites); both files in tests/, neither a gate test, 0 coverage-matrix hits, no merge/rename/delete proposed; the only inaccuracy is the search claim "exactly these two declarations" — `^function expectedMessage` hits 8 test files, the other six being covered by same-wave siblings d7-02 (call-arity, tool-arg-parse-checks) and d7-03 (uppercase-pi, message-line-break) plus invoke-depth-cycle/runtime-panics/duplicate-enum-value unfiled — which does not touch this pair's root cause; copy-paste helper class, the local-only unsubstituted-placeholder assertion is a thin wrapper concern the direction already names (triage: claude-fable-5-1)
