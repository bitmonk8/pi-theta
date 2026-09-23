---
id: pending
title: system-note-channel fallback construction cloned across producer and query driver
lens: D4
status: intake
verdict: pending
locations:
  - src/extension/production-theta-producer.ts:496-513
  - src/extension/production-theta-producer.ts:585-599
  - src/extension/subagent-spawn-regime.ts:608-619
  - src/extension/live-prompt-query-driver.ts:173-185
sites: 4
fix_scope: module
d4_class: clone
wave: qw20260923035927
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-23
---

# system-note-channel fallback construction cloned across producer and query driver

## Observation
Four production sites build the same `SystemNoteChannelDeps` fallback object. Two sites extract the construction into private methods (`ProductionThetaProducer.#systemNoteChannel` and `LivePromptQueryDriver.#resolveSystemNoteChannel`); the other two inline it inside `ProductionThetaProducer.#emitCleanCancelNote` and `SubagentSpawnRegime.#renderChildSystemPrompt`. All four prefer `input.systemNoteChannel` when present and otherwise build a pi-only fallback with a `sendMessage` adapter, an `emitDiagnostic` fallback, and a no-op `ui.notify`. The inline sites are within classes that already have or could reach the extracted helper, yet they repeat the object literal.

## Evidence

`src/extension/production-theta-producer.ts:496-513` (the extracted helper, right side):

```typescript
  #systemNoteChannel(): SystemNoteChannelDeps {
    return (
      this.#input.systemNoteChannel ?? {
        pi: {
          sendMessage: (message, options): void => {
            this.#input.pi.sendMessage(message, options);
          },
        },
        emitDiagnostic: this.#input.emitDiagnostic ?? ((): void => {}),
        // No real `ctx.ui` seam is threaded onto `#input`. A production
        // instance always wires a real `systemNoteChannel` (this branch is a
        // harness-only degrade, never the live path); `sendSystemNote`'s
        // `ui.notify` arm is itself best-effort, so a no-op here only costs the
        // toast half of the fallback on that harness-only path, never the
        // delivery-failed diagnostic or terminal log.
        ui: {
          notify: (): void => {},
        },
      }
    );
```

`src/extension/production-theta-producer.ts:585-599` (inline in `#emitCleanCancelNote`):

```typescript
    const channel: SystemNoteChannelDeps = this.#input.systemNoteChannel ?? {
      pi: {
        sendMessage: (message, options): void => {
          this.#input.pi.sendMessage(message, options);
        },
      },
      emitDiagnostic: this.#input.emitDiagnostic ?? ((): void => {}),
      // Unreachable by construction: this note is always `display: false`, and
      // `sendSystemNote` skips the `ui.notify` arm on both its send-success and
      // send-throw paths for such a note.
      ui: {
        notify: (): void => {},
      },
    };
    const sink = this.#input.cleanCancelSink ?? createProductionEmissionSink();
    emitCancelledBySessionShutdownNote(entry, { channel, sink });
```

`src/extension/subagent-spawn-regime.ts:608-619` (inline in `#renderChildSystemPrompt`):

```typescript
        const renderFailChannel: SystemNoteChannelDeps = this.#input.systemNoteChannel ?? {
          pi: {
            sendMessage: (message, options): void => {
              this.#input.pi.sendMessage(message, options);
            },
          },
          emitDiagnostic: this.#input.emitDiagnostic ?? ((): void => {}),
          ui: {
            notify: (): void => {},
          },
        };
        sendSystemNote(
          {
            content: `'system:' interpolation for '${theta.slashName}' failed to render (${rendered.diagnostic.code}); refusing to spawn rather than silently drop the system prompt`,
```

`src/extension/live-prompt-query-driver.ts:173-185` (extracted helper in the query driver):

```typescript
  #resolveSystemNoteChannel(): SystemNoteChannelDeps {
    return (
      this.#systemNoteChannel ?? {
        pi: {
          sendMessage: (message, options): void => {
            this.#pi.sendMessage(message, options);
          },
        },
        emitDiagnostic: this.#emitDiagnostic,
        ui: {
          notify: (): void => {},
        },
      }
    );
  }
```

Diff verdict: **identical / renamed-only**. The two inline copies are byte-identical to the extracted `#systemNoteChannel()` body except for the local variable name. `LivePromptQueryDriver.#resolveSystemNoteChannel` is a type-2 rename: the receiver field is `#pi` instead of `#input.pi` and `emitDiagnostic` is `#emitDiagnostic` rather than `this.#input.emitDiagnostic ?? (() => {})`; the shape is otherwise the same and its doc-comment explicitly states it mirrors `ProductionThetaProducer#systemNoteChannel`. No clone-map group exists for this shard (the duplicated block is below the scanner's token-window floor once the surrounding method bodies are included).

## Why this is a problem
The fallback channel is load-bearing: `sendSystemNote` walks the same `pi → ui.notify → emitDiagnostic → console.error` chain for every system note, and bug 0437 deliberately centralised that shape so that no raw `pi.sendMessage` throw escapes. If the fallback semantics change (e.g. adding a `RendererGate`/`SystemNoteChannelHealth` pair, widening the `SystemNoteSender` adapter, or changing the `ui.notify` degrade), the inline copies will not pick up the change. `ProductionThetaProducer.#systemNoteChannel()` is the authoritative right copy: it was introduced by the bug-0437 fix and is reused by `emitTopLevelErrNote`, `#buildGroupAEventOrFallback`, and the collaborators passed to `BinderRunner` and `InvokeMachinery`. The inline copy in `#emitCleanCancelNote` predates the helper (it was added by the bug-0073 fix) and was never refactored onto it; the inline copy in `#renderChildSystemPrompt` was carried into `subagent-spawn-regime.ts` when that module was extracted from `production-theta-producer.ts`.

## Suggested direction (non-binding, optional)
The natural shared home is `src/extension/system-note-channel.ts`, which already exports `sendSystemNote` and `SystemNoteChannelDeps`. A factory such as `buildPiFallbackSystemNoteChannel(pi, emitDiagnostic)` would let `ProductionThetaProducer`, `SubagentSpawnRegime`, and `LivePromptQueryDriver` all delegate the fallback construction to one place.

## False-positive check
- Re-verified all four cited spans in current code; the object shape and fallback arms match.
- All four sites are live: `#systemNoteChannel()` is called at production-theta-producer.ts:275, :281, :394, and :454; `#emitCleanCancelNote` is called from `#openInvocationTicket` at :941; `#renderChildSystemPrompt` is called from `spawnSubagentConversation` at :249; `#resolveSystemNoteChannel` is called from `emitSystemNote` closures at live-prompt-query-driver.ts:730 and :756.
- `grep -n "systemNoteChannel ?? {"` across `src/extension` found exactly these four sites.
- Not a spec-normative vector table; runtime-event-channel.md describes the fallback chain behaviour, not the inline object literal.
- Not tests/.
- No prior filing matches this four-site clone.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
triage worker failed (verdict not applied; re-triaged next wave) (loop, 2026-09-23)
