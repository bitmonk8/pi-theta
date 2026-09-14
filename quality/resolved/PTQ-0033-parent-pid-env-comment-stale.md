---
id: PTQ-0033
title: subagent-launcher.ts documents PI_THETA_SUBAGENT_PARENT_PID as read by nothing in src/ although it is the control-plane authentication key
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/runtime/subagent-launcher.ts:63-70
  - src/runtime/subagent-launcher.ts:475-485
  - src/runtime/subagent-launcher.ts:491-494
  - src/extension/production-subagent-host.ts:201-212
sites: 4
fix_scope: localized
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# subagent-launcher.ts documents PI_THETA_SUBAGENT_PARENT_PID as read by nothing in src/ although it is the control-plane authentication key

## Observation
Three comments in subagent-launcher.ts describe the parent-PID env carriage as
reserved solely for an unimplemented watchdog, one of them stating flatly that
"nothing in `src/` reads it today". Since the control-plane authentication work
landed (production-subagent-host.ts), `PI_THETA_SUBAGENT_PARENT_PID` is read in
production as the gate that authenticates the entire subagent control plane:
`authenticateControlPlane` compares it against the process's real `ppid` and
drops every control-plane variable on mismatch. The launcher-side narration
was written at bug-0002 time and never updated.

## Evidence
src/runtime/subagent-launcher.ts:63-70 — the false claim:

```ts
/**
 * The env var carrying the parent PID to the child, reserved for the RECORDED
 * BUT UNIMPLEMENTED child-side parent-PID watchdog (PIC-65 orphan-prevention
 * class-2 fallback — nothing in `src/` reads it today; the carriage exists so
 * the watchdog can be added without a wire change). This is NOT the
 * invoke-depth counter — that rides `SUBAGENT_INVOKE_DEPTH_ENV` below.
 */
export const SUBAGENT_PARENT_PID_ENV = "PI_THETA_SUBAGENT_PARENT_PID";
```

src/runtime/subagent-launcher.ts:479-480 (`buildSubagentChildEnv` doc) repeats
it: "the parent-PID carriage (reserved for the PIC-65 orphan-prevention
watchdog, unimplemented)"; the body comment at :491-494 says "The parent PID is
the (unimplemented) PIC-65 orphan-prevention watchdog input".

src/extension/production-subagent-host.ts:201-212 — the production read that
contradicts all three:

```ts
export function authenticateControlPlane(
  env: Readonly<Record<string, string | undefined>>,
  parentPid: number,
): Readonly<Record<string, string | undefined>> {
  if (env[SUBAGENT_PARENT_PID_ENV] === String(parentPid)) {
    return env;
  }
  const authenticated: Record<string, string | undefined> = { ...env };
  for (const key of CONTROL_PLANE_ENV_KEYS) {
    delete authenticated[key];
  }
  return authenticated;
}
```

That module's own doc (production-subagent-host.ts:176-183) names the variable
as the authentication carriage: "`PI_THETA_SUBAGENT_PARENT_PID` must equal this
process's real `ppid` … On a mismatch … the whole control plane is dropped."

## Why this is a problem
Historical narration comment whose central factual claim is now false. The
carriage's live role changed from "reserved, unread" to "the key that gates
whether the child honors the root marker, the winner path, the callable hashes,
and the marshalled params" (see CONTROL_PLANE_ENV_KEYS,
production-subagent-host.ts:149-157). A reader of the launcher — the module
that writes the variable — is told the value is inert and may conclude it can
be dropped or renamed freely, when doing so would sever the authentication gate
for every control-plane carriage. Git history confirms the drift: the comment
text dates to commit 21937ef5 (bug-0002, v0.12.0); the authentication read
landed later (commits 3752003f and 7f360d20 touching
production-subagent-host.ts).

## Suggested direction (non-binding, optional)
Reword the three launcher comments to name the live consumer (control-plane
authentication in production-subagent-host.ts) alongside the still-unbuilt
watchdog reservation, so the write site no longer denies its own reader.

## False-positive check
- Reader search: `grep -rn "SUBAGENT_PARENT_PID_ENV|PI_THETA_SUBAGENT_PARENT_PID" --include="*.ts" src/ tests/` — production reads at production-subagent-host.ts:156 (key list) and :205 (comparison); many tests set it to satisfy the gate (tests/control-plane-authentication.test.ts, tests/b0331-root-winner-preempt.test.ts, tests/live/harness.ts:74, etc.).
- Verified the read is the value (not just the key name): `env[SUBAGENT_PARENT_PID_ENV] === String(parentPid)` is a value comparison gating the return.
- Git intent check: `git log -S "nothing in \`src/\` reads it today"` → introduced in 21937ef5 (bug-0002); production-subagent-host.ts history shows the authentication landed afterwards (3752003f, 7f360d20, ac91c21f), with no corresponding launcher-comment update.
- Confirmed the watchdog itself remains unimplemented (no consumer kills on parent death), so only the "nothing reads it" / "reserved solely for the watchdog" claims are stale, not the watchdog's absence.

## Triage
verdict: confirmed — verified all three launcher comments verbatim (subagent-launcher.ts:65-67, :479-480, :493-494) and the refuting production read at production-subagent-host.ts:205, live via readParentEnv() in factory.ts:1261 and production-composition.ts (6 sites), so "nothing in `src/` reads it today" is false; git confirms the drift (comment 21937ef5 2026-07-25, authenticateControlPlane 7f360d20 2026-08-13) and the watchdog is still absent, and the D2 brief names historical narration comments in scope (triage: claude-opus-5)
