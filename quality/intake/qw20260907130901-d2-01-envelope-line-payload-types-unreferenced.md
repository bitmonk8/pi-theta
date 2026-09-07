---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: "`EnvelopeLine` and `ThetaResultPayload` in subagent-envelope.ts are exported types nothing in the repository references"
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/subagent-envelope.ts:111-117
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# `EnvelopeLine` and `ThetaResultPayload` in subagent-envelope.ts are exported types nothing in the repository references

## Observation

`subagent-envelope.ts` exports the union `ThetaResultPayload` and the interface
`EnvelopeLine`, declared as the parsed shape of one full `theta_result`
envelope line. No module in src/, extensions/, tools/, or tests/ imports or
names either type. The module's own parser, `parseEnvelopeLine`, works over
raw `unknown` / `Record<string, unknown>` values and never annotates or casts
to these shapes; the two serialisers annotate with `EnvelopeOk` /
`EnvelopeErr` directly. `ThetaResultPayload`'s only reference is the field
type inside the unreferenced `EnvelopeLine`.

## Evidence

src/runtime/subagent-envelope.ts:111-117 — the declarations:

```ts
/** The pinned `theta_result` payload — exactly one of the `ok` / `err` arms, plus the version field. */
export type ThetaResultPayload = EnvelopeOk | EnvelopeErr;

/** One full envelope line's parsed object shape (`{ theta_result: … }`). */
export interface EnvelopeLine {
  readonly theta_result: ThetaResultPayload;
}
```

Search `grep -rn "EnvelopeLine\b" src/ extensions/ tools/ tests/`: 2 hits — the
declaration at src/runtime/subagent-envelope.ts:115, and
tests/subagent-wire-parse-failed-emitter.test.ts:175, which is the distinct
local identifier `malformedEnvelopeLine` (a test helper function name that
merely ends with the substring; it does not reference the interface).

Search `grep -rn "ThetaResultPayload" src/ extensions/ tools/ tests/`: 2 hits,
both inside the declaring module — the declaration at line 112 and the field
type at line 116 (inside the unreferenced `EnvelopeLine`).

The parser that would be these types' natural consumer reads raw records
instead — src/runtime/subagent-envelope.ts:386-397:

```ts
export function parseEnvelopeLine(line: string): EnvelopeParse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (parseError: unknown) { // allow-broad-catch: envelope parse failure — pi-integration-contract/subagent.md PIC-59
    void parseError;
    return { kind: "parse-failed", line };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { kind: "parse-failed", line };
  }
  const payload = (parsed as Record<string, unknown>)[THETA_RESULT_KEY];
```

## Why this is a problem

Dead code, proven dead: an exported type alias and an exported interface with
zero references anywhere in the repository — not even test-only reachability
applies, because no test names them either. As types they admit no dynamic or
string-keyed access, and no re-export barrel exists that could carry them
(`grep -rn "export \*" src/` returns nothing). They survive as scaffolding
from the RFC-0006 envelope module's creation (commit `4866d4d2`), where the
wire shape was declared top-down but the parse path was written over untrusted
raw records; a reader today is misled into thinking some consumer binds parsed
lines to these shapes.

## Suggested direction (non-binding, optional)

Delete `EnvelopeLine`; either delete `ThetaResultPayload` with it or keep it
only if a consumer materialises. `EnvelopeOk` / `EnvelopeErr` stay — the two
serialisers annotate their payloads with them.

## False-positive check

- Identifier search across src/, extensions/, tools/, tests/ for
  `EnvelopeLine\b`: only the declaration plus the unrelated
  `malformedEnvelopeLine` test helper (verified by reading
  tests/subagent-wire-parse-failed-emitter.test.ts:175 — a local function
  returning a string; no import from subagent-envelope of this name).
- Identifier search for `ThetaResultPayload`: both hits are in the declaring
  module (declaration + the field inside `EnvelopeLine`).
- Dynamic/string-keyed access: not applicable to erased TypeScript types.
- Re-exports: no `export *` anywhere in src/; the module's importers
  (production-theta-producer.ts, production-composition.ts,
  theta-composition-producer.ts, enum-tag-carriage.ts, subagent-json-driver.ts,
  wire-form-depth-walk.ts) were each checked for these names — none imports
  them.
- Test-only-caller rule: no test references either type, so the
  witness-test exemption does not apply.
- Git intent: `git log -S "ThetaResultPayload" -- src/runtime/subagent-envelope.ts`
  shows a single commit, `4866d4d2` ("feat: child-process theta execution
  (RFC 0006) — v0.9.0") — introduced with the module and never wired to a
  consumer since.
- Compiler check: `tsc --noEmit --noUnusedLocals --noUnusedParameters` does not
  flag them (exported declarations are exempt from those flags), which is why
  they survive silently.

## Triage

