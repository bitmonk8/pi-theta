# Triaged Spec Review - spec.md

_Generated: 2026-05-31T15:30:00Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T25) is addressed first; the first finding (T17) is addressed last._

_Triage tally: 1 high retained._

---

# T17 - Slash-handler registration leaves the `getArgumentCompletions` value undefined

**Kind:** implementability
**Importance:** high
**Shape:** single
**State:** reduced

## Problem

The Pi Integration Contract pins the slash-registration call shape at the `#slash-handler-registration` anchor (Extension entry point step 3) and at the `#sdk-cap-slash-command-registration` SDK capability inventory item 1 as the literal three-key object `pi.registerCommand(name, { description, getArgumentCompletions, handler })`, presenting all three keys as required surface area. The spec never states what value loom 1.0 passes for `getArgumentCompletions`. Pi's `RegisteredCommand` type makes the property optional, so omitting the key, threading `undefined`, and supplying a no-op completer are all type-legal — yet every other loom 1.0 statement says no autocomplete surface exists (`slash-invocation.md`, `frontmatter.md`, `future-considerations.md`). Two literal-reading implementers can each be conformant while producing different `pi.registerCommand` calls, and any contract test pinning the call has nothing to assert against.

## Solution approach

Rewrite the `pi.registerCommand` literal at the `#slash-handler-registration` anchor and at `#sdk-cap-slash-command-registration` to the two-key form `pi.registerCommand(name, { description, handler })`, and sweep every other restatement of the three-key literal on `pi-integration-contract.md` (including the *Drain-state-gated dispatch* clause) to match. Add a sentence at one of those sites stating that loom 1.0 omits `getArgumentCompletions` because Pi's `RegisteredCommand` types it as optional and no loom 1.0 autocomplete surface exists, with a forward-link to [Future Considerations](./future-considerations.md) for the deferred `argumentHint`-style upstream.

## Solution constraints

- None.

## Relationships

None
