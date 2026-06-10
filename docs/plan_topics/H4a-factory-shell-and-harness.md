# `H4a` — Extension factory shell and end-to-end harness

**Convention.** [`conventions.md`](./conventions.md) (phase categories — Pi-extension shell, end-to-end harness).

**Adds.** The Pi extension factory entry point (returns an extension object without throwing) and a reusable end-to-end test harness that loads the extension against an in-process Pi session double and drives a slash dispatch. The capability-probe refusal logic is added by `V9a`; this leaf only establishes the never-throw factory boundary and the harness.

**Tests.**
- `Convention:` (phase categories) the factory returns an extension object and never throws even when a host seam is absent (each host-binding call is `try`/`catch`-wrapped per the exempt-broad-catch sites in `conventions.md`).
- `Convention:` (end-to-end harness) the harness loads the extension and asserts a registered command can be dispatched end-to-end against the session double.

**Deps.** `H3a`

**Ships when.** `npm test` loads the extension through the harness and dispatches a no-op command end-to-end.
