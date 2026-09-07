---
id: pending
title: MarshalledParams.tempFilePath is populated on the file channel but nothing anywhere reads the field
lens: D2
status: intake
verdict: pending
locations:
  - src/runtime/subagent-params.ts:138-139
  - src/runtime/subagent-params.ts:193-202
  - src/extension/production-theta-producer.ts:2532-2557
sites: 3
fix_scope: localized
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# MarshalledParams.tempFilePath is populated on the file channel but nothing anywhere reads the field

## Observation
`marshalParams` returns a `MarshalledParams` record with three members: `env`,
an optional `tempFilePath`, and `cleanup`. On the file channel the temp-file
path is already carried twice for the two real consumers — inside `env` under
`SUBAGENT_PARAMS_FILE_ENV` (the child's wire carriage) and captured by the
`cleanup` closure (the parent-`finally` delete). The third copy, the
`tempFilePath` field itself, is written at the return site and read by no code
in src/, tests/, extensions/, or tools/.

## Evidence
src/runtime/subagent-params.ts:138-139 — the declaration:

```ts
  /** The temp-file path on the file channel (absent on the env channel). */
  readonly tempFilePath?: string;
```

src/runtime/subagent-params.ts:193-202 — the only write; the same value already
rides `env` and the `cleanup` closure:

```ts
  return {
    env: {
      [SUBAGENT_PARAMS_ENV]: undefined,
      [SUBAGENT_PARAMS_FILE_ENV]: tempFilePath,
    },
    tempFilePath,
    cleanup: (): void => {
      deps.unlink(tempFilePath);
    },
  };
```

src/extension/production-theta-producer.ts:2532-2557 — the sole production
consumer of `marshalParams` reads only `cleanup` (:2533) and `env` (:2557):

```ts
    const marshalled = marshalParams(paramValues, this.#paramsMarshalDeps());
    const paramsCleanup = marshalled.cleanup;
```

Reference search: `grep -rn "tempFilePath" --include="*.ts" .` (excluding
node_modules) → 5 hits, all inside src/runtime/subagent-params.ts (declaration,
local variable, env value, return property, cleanup body) plus the generated
dist/src/runtime/subagent-params.d.ts artifact. Zero hits in tests/,
extensions/, tools/, or any other src/ file.

## Why this is a problem
Dead schema field: a member of a returned record that is populated but has no
reader anywhere — not even a test asserts it. The two behaviors the path serves
(child read-and-delete, parent backstop delete) are both discharged through the
other two members, so the field is a third, unconsumed copy of the same string.
It widens the module's public type for nothing and invites the false impression
that some caller branches on it.

## Suggested direction (non-binding, optional)
Remove the `tempFilePath` member from `MarshalledParams` (keeping the local
variable that feeds `env` and `cleanup`), or keep it only if a consumer is
about to exist.

## False-positive check
- Identifier search across src/, tests/, extensions/, tools/: `grep -rn "tempFilePath" --include="*.ts"` → only src/runtime/subagent-params.ts (+ dist build artifact). No destructuring (`{ tempFilePath`), no dot access (`.tempFilePath`), no string-keyed access (`["tempFilePath"]`) anywhere else.
- Tests-only-caller rule: does not apply — no test reads the field either (tests/subagent-params-marshalling.test.ts and tests/subagent-params-carrier.test.ts exercise `env` and `cleanup` only).
- Re-export check: `MarshalledParams` is imported nowhere outside the module (`grep -rn "MarshalledParams"` → subagent-params.ts only), so no external contract pins the field.
- Dynamic access: searched the string literal `"tempFilePath"` repo-wide — no hits outside the module.

## Triage
