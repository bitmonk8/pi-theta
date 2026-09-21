---
id: PTQ-1097
title: SUBAGENT_CONTROL_PLANE_ENV_KEYS doc comment says the module owns three keys but it owns four
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/runtime/subagent-launcher.ts:589-593
  - src/runtime/subagent-launcher.ts:83-120
sites: 1
fix_scope: localized
wave: qw20260920183643
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-20
---

# SUBAGENT_CONTROL_PLANE_ENV_KEYS doc comment says the module owns three keys but it owns four

## Observation
The doc comment on `SUBAGENT_CONTROL_PLANE_ENV_KEYS` in
`subagent-launcher.ts` says the control-plane key list "lives HERE, beside the
three keys this module owns." The module defines four control-plane env-var
constants that also appear in that array: `SUBAGENT_PARENT_PID_ENV`,
`SUBAGENT_EXTENSION_PIN_ENV`, `SUBAGENT_INVOKE_DEPTH_ENV`, and
`SUBAGENT_LAUNCH_ENTRY_ENV`.

## Evidence

`src/runtime/subagent-launcher.ts:589-593`:
```ts
 * The list lives HERE, beside the three keys this module owns and at the site
 * that WRITES the child control plane, so the writer and the child-side reader
 * (`authenticateControlPlane`, which imports it) cannot drift apart; the
 * extension layer consumes it in the existing extension→runtime direction.
 */
export const SUBAGENT_CONTROL_PLANE_ENV_KEYS: readonly string[] = Object.freeze([
```

`src/runtime/subagent-launcher.ts:83-120` — the four module-local env
constants, each folded into `SUBAGENT_CONTROL_PLANE_ENV_KEYS`:
```
83:export const SUBAGENT_PARENT_PID_ENV = "PI_THETA_SUBAGENT_PARENT_PID";
97:export const SUBAGENT_EXTENSION_PIN_ENV = "PI_THETA_SUBAGENT_EXTENSION_PIN";
109:export const SUBAGENT_INVOKE_DEPTH_ENV = "PI_THETA_SUBAGENT_INVOKE_DEPTH";
120:export const SUBAGENT_LAUNCH_ENTRY_ENV = "PI_THETA_SUBAGENT_ENTRY";
```

Search used: `grep -n "^export const SUBAGENT_.*_ENV = " src/runtime/subagent-launcher.ts`
→ exactly these four hits (`SUBAGENT_LAUNCH_FLAG` is a CLI flag name, not an
env var, and is correctly absent from `SUBAGENT_CONTROL_PLANE_ENV_KEYS`).

History: `git log -S"beside the three keys" -- src/runtime/subagent-launcher.ts`
attributes the sentence to commit `ce3ca3f2` (bug 0474 fix), when the module
owned exactly three control-plane keys (`PARENT_PID`, `EXTENSION_PIN`,
`INVOKE_DEPTH`); `git log -S"SUBAGENT_LAUNCH_ENTRY_ENV"` shows the fourth key
was added later by `c7a47d17` (RFC 0012 step 1, the placement seam) without
updating the "three keys" count.

## Why this is a problem
The comment miscounts the module's own collaborators (a stale count left
behind by a later commit that added a new control-plane key without touching
this sentence), which is explicitly in scope for D2 as a header that
"miscounts its call sites or collaborators."

## Suggested direction (non-binding, optional)
Update the count to four (or drop the number and just name the constants),
recomputing it whenever a control-plane key is added or removed from this
module.

## False-positive check
- Counted every `export const SUBAGENT_*_ENV` declared in this file: four, all four present in `SUBAGENT_CONTROL_PLANE_ENV_KEYS`.
- `git log -S` on the "three keys" phrase and on `SUBAGENT_LAUNCH_ENTRY_ENV` confirms the fourth key was added in a later commit than the one that wrote "three keys," without the count being revisited.
- Not a false positive from a different reading of "this module owns": `SUBAGENT_LAUNCH_FLAG` (the fifth env-adjacent constant in the file) is a CLI flag name, correctly excluded from the control-plane array, so it cannot be what makes the count "three."

## Triage
verdict: confirmed — re-verified: exactly four `export const SUBAGENT_*_ENV` declared in subagent-launcher.ts (lines 83/97/109/120), all four in SUBAGENT_CONTROL_PLANE_ENV_KEYS while the other five members are imported; "three keys" sentence dates to ce3ca3f2 (2026-09-11, three keys then) and SUBAGENT_LAUNCH_ENTRY_ENV landed in c7a47d17 (2026-09-15) without updating it; distinct root cause from PTQ-0191/0195 (triage: claude-fable-5-1)
