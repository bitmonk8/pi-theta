# Bugs

Defect reports: cases where the implementation disagrees with the specification,
or where spec and implementation together fail to deliver documented behaviour.

A bug report captures a defect against *shipped or specified* behaviour: the
symptom, the expected behaviour (with spec citations), the actual behaviour
(with implementation citations), the root cause, and — where a fix has clear
tradeoffs — the options and a recommendation. Bugs differ from
[RFCs](../rfcs/): an RFC proposes a *new* language or runtime capability; a bug
reports that existing documented behaviour is wrong or absent.

The [Reference](../reference/) remains the authority for intended behaviour.

## Conventions

- One file per bug, numbered `NNNN-short-slug.md`, allocated in order.
- Each bug carries a status: `open`, `fixed`, `wontfix`, or `duplicate`.
- Prose follows [`docs/STYLE.md`](../STYLE.md): factual, terse, no hype.

## Index

- [0001 — Extension-registered tools are unreachable from Theta](./0001-extension-tools-unreachable.md) — fixed (0.11.0)
- [0002 — Spawned subagent child never exits under `pi -p`](./0002-subagent-child-hangs-under-acceptance-pi-p.md) — fixed (0.12.0); investigation: [0002-investigation.md](./0002-investigation.md)
- [0003 — Whole-object Pi-tool argument dispatches with dropped args instead of the documented parse rejection](./0003-tool-arg-shape-rule-not-enforced.md) — fixed (0.16.0)
- [0004 — `invoke<array<T>>` return validation drops transitive `$defs` of named schemas](./0004-generic-annotation-drops-transitive-defs.md) — fixed (0.15.0)
- [0005 — `subagent fn` return-type annotations: `with` swallowed, keyword recognition lost, `?` rejected](./0005-subagent-fn-return-annotation-misparse.md) — fixed (0.14.0)
- [0006 — A leading-`[` expression statement glues onto the previous statement as index access](./0006-leading-bracket-glued-as-index-access.md) — fixed (0.13.0)
- [0007 — Off-session queries swallow a `stopReason: "error"` completion as `Ok("")`](./0007-off-session-error-stop-swallowed-as-ok-empty.md) — fixed (0.18.0)
- [0008 — Subagent child receives only the last theta discovery root when the parent has ≥ 2 roots](./0008-subagent-child-drops-all-but-last-theta-root.md) — fixed (0.17.0)
- [0009 — Prompt-mode transport errors carry the short provider id (`.provider`) where the spec pins the api-shaped `.api`](./0009-live-prompt-queryerror-provider-field-derivation.md) — fixed (0.19.0)
- [0010 — Typed-query forced respond turn is a user-visible `sendUserMessage` turn with a JSON-in-text instruction, not the specified off-session `complete()` with forced tool choice](./0010-typed-forced-respond-user-visible-no-toolchoice.md) — fixed (0.20.0)
- [0011 — The production binder `complete()` call passes no tools and no `toolChoice`: the envelope is obtained by prose instruction and text parsing](./0011-binder-complete-no-forced-tool-free-text-envelope.md) — fixed (0.26.0)
- [0012 — Untyped queries surface a mid-flight abort as `Err(TransportError)` off-session (and as `Ok(<partial text>)` live), never the specified `cancelled` outcome](./0012-untyped-off-session-mid-abort-transport-not-cancelled.md) — fixed (0.25.0)
- [0013 — Load-phase warning diagnostics are dropped by both production sinks](./0013-load-warnings-dropped-by-both-production-sinks.md) — fixed (0.24.0)
- [0014 — An empty typed-query annotation (`@<>`) parses with no diagnostic and binds its payload unvalidated through the retired fused mechanism](./0014-empty-typed-query-annotation-silent-unvalidated-bind.md) — fixed (0.23.0)
- [0015 — After a postfix-`?` line, a keyword-free statement carrying a depth-0 ternary is swallowed by the ternary-head scan](./0015-postfix-question-swallows-keyword-free-ternary-stmt.md) — fixed (0.21.0)
- [0016 — A call to a lexically shadowed Pi-tool name dispatches the tool at runtime; the object-literal form executes it silently](./0016-shadowed-tool-name-runtime-dispatch.md) — fixed (0.22.0)
- [0017 — A user object carrying a boolean `ok` field is misclassified as a `Result` runtime value; typed-query payloads and callee final values are silently corrupted](./0017-ok-field-object-misclassified-as-result.md) — fixed (0.27.0)
- [0018 — Watcher hot-reload runs against a stale captured `ctx` after session replacement; the failure note's own delivery then fails on the same stale surface](./0018-hot-reload-stale-ctx-after-session-replacement.md) — fixed (0.28.0)
- [0019 — `?` on a member/index/identifier operand bypasses both the ERR-18 static gate and `asResultValue` normalisation; the blind unwrap forges a fabricated cancellation or silently binds `undefined`](./0019-question-operand-bypasses-result-normalisation.md) — fixed (0.31.0)
- [0020 — The enum and schema brands (`__thetaEnum` / `__thetaSchema`) classify by presence-only `hasOwnProperty`: an enumerable same-named key forges them, corrupting `==` and the QRY-18 interpolation render](./0020-enum-schema-tags-presence-only-forgeable.md) — fixed (0.32.0)
- [0021 — A second `session_start` at one extension instance overwrites the single-slot hot-reload handle: the superseded generation's watcher stays armed (leaked) and keeps publishing, and `session_shutdown` tears down only the latest generation](./0021-double-session-start-leaks-armed-watcher.md) — fixed (0.30.0)
- [0022 — The late-completing `session_start` compose tail performs registration work against the invalidated runtime; the PIC-67 zero-touch suppression covers only the watcher arming](./0022-late-compose-tail-registration-on-invalidated-runtime.md) — fixed (0.29.0)
- [0023 — The production composition omits its V9k / V9p / step-0 seams: every bootstrap diagnostic is constructed and dropped, the renderer-degrade gate never engages, and the step-0 capability probe never runs — and the one live compose-supplier catch mislabels every compose throw `capability: "pi.registerCommand"`](./0023-production-composition-omits-bootstrap-seams.md) — fixed (0.34.0)
- [0024 — After a re-bind, a surviving slash name is collision-dropped against the extension instance's own prior registration: its handler stays bound to the superseded drained registry and dispatch yields the shutting-down note until `/reload`](./0024-rebind-self-collision-drops-surviving-names.md) — fixed (0.36.0)
- [0025 — A constructor naming an undeclared or non-constructible schema (`Mystery { r: Ok(1) }`, `Color { r: 1 }`) loads clean and evaluates as an unbranded plain object](./0025-ctor-unresolved-schema-name-passthrough.md) — fixed (0.37.0)
- [0026 — A schema ctor whose declared field is literally named `__thetaSchema` has that field silently destroyed: `brandSchemaValue` redefines the constructor-assigned enumerable field into the non-enumerable brand, replacing its value with the schema name](./0026-ctor-field-named-thetaschema-destroyed-by-brand.md) — fixed (0.33.0)
- [0027 — Runtime receiver dispatch classifies by JS `typeof`, so enum and `Result` values take the object read surfaces: `s.keys()` yields `["0","1","2","3"]`, `r.ok` reads the discriminator outside `match` / `?`, and any other member aborts the theta with `theta/runtime/internal-error`](./0027-typeof-receiver-dispatch-exposes-enum-result-encoding.md) — open
- [0028 — A typed-query annotation naming no lowerable declaration — a typo'd/undeclared name, a declared `enum`, or a schema-body forward/self reference — lowers permissively to `{}` with no diagnostic: the QRY-22 gate validates nothing and any payload binds as the typed value](./0028-unresolved-annotation-silent-permissive-lowering.md) — open
- [0029 — A throwing supersession detach is swallowed with zero evidence, and `detach()`'s fallible-first step order skips every containment mark: a debounce window pending at supersession still drives one superseded-generation reload pass that publishes and re-registers, and the leaked handle is unreachable](./0029-throwing-supersession-detach-swallowed-watcher-rearmed.md) — open
- [0030 — No assertion in either live suite tests stderr-line presence: the `theta hot-reload quiesced:` line and slug-less `system-note delivery failed:` cascades the 0018/0021/0022 fix records cite as live regression evidence pass all nine H9a areas green, and H8a captures no stderr at all; and three live test files still declare the fixtures-absent "INTENDED-REASON RED" that was resolved the day the fixtures landed](./0030-h9a-stderr-gate-gap-and-stale-intended-red-header.md) — fixed (0.35.0)
- [0031 — Schema-constructor field values are never checked against the declared field types: `Point { x: "hello" }` loads clean and mints a `Point`-branded value](./0031-ctor-field-value-typing-unchecked.md) — open
- [0032 — Member access on an absent name binds raw JS `undefined`, an out-of-model value: `o.absent == null` is `false`, `o["absent"]` panics on the same name, and expressions.md prescribes no absent-member disposition](./0032-absent-member-binds-undefined.md) — open
- [0033 — The `schema X = A | B` type-alias / union declaration does not parse: the head registers as a field-less schema, the shape is re-lexed as statements (`stray '='` / `stray '|'`), and the whole discriminated-union checker seam — plus `skipDeclarationShape` — has no caller](./0033-body-level-schema-alias-unsupported.md) — open
- [0034 — The supersession pass never awaits `handle.whenIdle()`: a superseded-generation rebuild already in flight publishes into the drained registry and re-registers its slash names after the superseding generation has registered, so those names dispatch to a dead generation until `/reload`](./0034-supersession-does-not-await-whenidle.md) — open
