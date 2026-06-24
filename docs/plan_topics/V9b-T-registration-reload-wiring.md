# `V9b-T` — Registration steps and reload-wiring seams (tests)

**Spec.** [`../spec_topics/pi-integration-contract/registration-steps.md`](../spec_topics/pi-integration-contract/registration-steps.md), [`../spec_topics/implementation-notes.md`](../spec_topics/implementation-notes.md), [`../spec_topics/pi-integration-contract/host-interfaces-core.md`](../spec_topics/pi-integration-contract/host-interfaces-core.md) (model-registry surface).

**Adds.** Failing tests for the paired `V9b` implementation leaf.

**Tests.**
- [registration-steps.md — registry swap](../spec_topics/pi-integration-contract/registration-steps.md) (PIC area; facet `cka-23.swap`): looms discovered are registered; the swap is atomic (build-aside, then publish); a failed swap fires `loom/runtime/registry-swap-failed`.
- [registration-steps.md — getCommands() snapshot read-only](../spec_topics/pi-integration-contract/registration-steps.md) (PIC area; un-anchored GOV-22 residue; facet `cka-23.getcommands`): the step-2 / first-`session_start` collision pass treats the `pi.getCommands()` snapshot as read-only by convention — a single forward pass that returns the same `SlashCommandInfo[]` instance unchanged in length and element order after the check runs (asserted against a snapshot whose array mutators throw, so any in-place write fails the test rather than passing silently).
- [registration-steps.md — structural-change watcher note, empty-window suppression](../spec_topics/pi-integration-contract/registration-steps.md#structural-changes-no-unregister) (PIC area; un-anchored GOV-22 residue; facet `cka-23.note-empty`): a debounce window that closes with `added.length + removed.length === 0` emits no `loom-system-note` (empty-window suppression — including a settings edit whose post-merge `loomPaths` is byte-identical and a burst that nets no added/removed `.loom`/`.warp` file).
- [registration-steps.md — structural-change watcher note, same-window rename emission](../spec_topics/pi-integration-contract/registration-steps.md#structural-changes-no-unregister) (PIC area; un-anchored GOV-22 residue; facet `cka-23.note-rename`): a same-window rename of path P (observed as `removed` of P then `added` of P, summing to 2) emits the note with `content` `loom watcher: 2 file(s) added or removed; run /reload to refresh the slash command list` and `display: true`.
- model-reference-matcher production wiring ([`host-interfaces-core.md` model-registry surface](../spec_topics/pi-integration-contract/host-interfaces-core.md#model-registry-pin)): the load pass constructs loom's own exact-match resolver over `ctx.modelRegistry.getAvailable()` and injects it into the model-reference-matcher injection seam [`V6a`](./V6a-frontmatter-contract.md) defines; `V6a`'s load-time `loom/load/model-unresolved` resolution binds that injected instance — observed by single-source-of-construction (instance identity), not equivalence-of-outcome against a shared fake.

**Deps.** `V9a`, `V10a`, `V8e`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
