---
id: pending
title: cancelledBySessionShutdownReason is exported from session-shutdown.ts but called only by two functions in the same module
lens: D2
status: intake
verdict: pending
locations:
  - src/extension/session-shutdown.ts:228-239
  - src/extension/session-shutdown.ts:255
  - src/extension/session-shutdown.ts:473
sites: 1
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# cancelledBySessionShutdownReason is exported from session-shutdown.ts but called only by two functions in the same module

## Observation
`cancelledBySessionShutdownReason` is an `export function` whose doc describes it
as a hoist shared by two in-module readers. Both readers are indeed in the same
file: `cancelledBySessionShutdownDiagnostic` and
`emitCancelledBySessionShutdownNote`. No module in `src/`, `extensions/`, or
`tools/` imports the name, and no test imports it; the two production modules
that import from `session-shutdown.ts` take other names.

## Evidence
src/extension/session-shutdown.ts:228-239 — the exported hoist:

```ts
/**
 * The per-invocation `finally`'s `entry.shutdownReason` substitution (PIC-25
 * *Hoist obligation* single source of truth): an unset field falls back to the
 * `"<unreadable>"` sentinel per the residual-gap paragraph. Hoisted so
 * `cancelledBySessionShutdownDiagnostic` and the emission wrap below share the
 * one byte-identical read instead of each re-deriving it.
 */
export function cancelledBySessionShutdownReason(
  entry: ActiveInvocationEntry,
): string {
  return entry.shutdownReason ?? "<unreadable>";
}
```

src/extension/session-shutdown.ts:255 — first in-module call, inside
`cancelledBySessionShutdownDiagnostic`:

```ts
  const reason = cancelledBySessionShutdownReason(entry);
```

src/extension/session-shutdown.ts:473 — second in-module call, inside
`emitCancelledBySessionShutdownNote`'s construction wrap:

```ts
    detailsEventReason = cancelledBySessionShutdownReason(entry);
```

Reference search: `grep -rnw "cancelledBySessionShutdownReason"` across `src/`,
`tests/`, `tools/`, `extensions/`, `docs/`, `skills/`, `config/` (`*.ts`, `*.md`,
`*.json`) → 5 hits: the declaration, the two calls above, and two prose mentions
in `docs/bugs/0073-*.md` / `docs/bugs/0208-*.md`. No import statement anywhere
names it.

## Why this is a problem
Dead export surface, proven dead: the function is alive (two in-module callers)
but the `export` modifier reaches nothing — no import in `src/`, `extensions/`,
`tools/`, or `tests/`, no namespace import, no barrel re-export, no string-keyed
access. The doc itself scopes the hoist to two named in-file readers ("Hoisted so
`cancelledBySessionShutdownDiagnostic` and the emission wrap below share the one
byte-identical read"), so the published surface exceeds the contract the comment
states.

## Suggested direction (non-binding, optional)
Drop the `export` modifier so the hoist stays module-private, matching the two
readers its doc names.

## False-positive check
- Reference searches run: `grep -rnw "cancelledBySessionShutdownReason"` over
  `src`, `tests`, `tools`, `extensions`, `docs`, `skills`, `config` — hits listed
  above; the only non-declaration code hits are the two in-module calls, the
  remaining two are bug-note prose (docs, not importers).
- Importer inspection: `grep -rn 'session-shutdown"' src tests --include=*.ts` →
  src/extension/factory.ts:51, production-composition.ts:184,
  production-theta-producer.ts:104/108, session-swap-tripwire.ts:26 and twelve
  test files; each import list was read and none names
  `cancelledBySessionShutdownReason` (they take `runSessionShutdown`,
  `EmissionSink`, `ForwardingSignalSource`, `createProductionEmissionSink`,
  `SHUTDOWN_AWAIT_CAP_MS`, the code constants, `emitCancelledBySessionShutdownNote`,
  `emitTeardownDiagnostic`, `TEARDOWN_STEP_CALL_LABELS`).
- Tests-only-caller rule considered: not applicable — no test references the
  identifier, so this is not test-only-reachable production code (the sibling
  builders `cancelledBySessionShutdownDiagnostic` and
  `emitNestedShapeDiagnostic` ARE imported by tests and are deliberately not
  claimed here).
- Dynamic / re-export access: grep for the quoted identifier and for
  `export *` / `import * as` involving `session-shutdown` → 0 hits.
- Duplicate check: `grep -rn "cancelledBySessionShutdown" quality/intake` → no
  match; the file's other pending findings
  (qw20260907130901-d2-01-whenidle-awaitcapms-vestigial-param.md,
  qw20260907130901-d2-06-schema-sink-stop-label-unread.md,
  qw20260907183353-d2-07-extension-modules-stub-narration-stale.md) cite
  different sites.

## Triage
