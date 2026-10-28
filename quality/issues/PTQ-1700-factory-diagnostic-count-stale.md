---
id: PTQ-1700
title: ThetaExtensionDeps.latchSessionContext still describes five factory-time diagnostic sites when the factory has eight.
lens: D2
status: open
verdict: confirmed
locations:
  - src/extension/factory-deps.ts:67-72
  - src/extension/factory.ts:481-484
  - src/extension/factory.ts:497-502
  - src/extension/factory.ts:552-554
  - src/extension/factory.ts:563-565
  - src/extension/factory.ts:579-583
  - src/extension/factory.ts:601-605
  - src/extension/factory.ts:661-665
  - src/extension/factory.ts:1139-1143
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d2-cruft (openai/gpt-6.1-sol)
date: 2026-10-28
---

# ThetaExtensionDeps.latchSessionContext still describes five factory-time diagnostic sites when the factory has eight.

## Observation
The `latchSessionContext` dependency comment identifies “the five factory-time sites” that use the context-free diagnostic chain. The current factory has eight such bootstrap-diagnostic emission sites: flag registration, system-note renderer registration, print renderer registration, print tool registration, progress tool registration, and the three event subscriptions. The count in the dependency comment has not incorporated the tool-registration additions.

## Evidence
The count claim, `src/extension/factory-deps.ts:67-72`:

```ts
   * filled, `emitDiagnostic` sites reached from inside a handler (which always
   * hold a `ctx`) route through the sink's full System-notes chain; the five
   * factory-time sites run before any `session_start` delivery and so use the
   * ctx-free partial chain instead. A repeat `session_start` re-latches with a
   * fresh `ctx`. Optional: the `H4a` harness path that injects its own
   * recorder omits it.
```

The eight factory-time bootstrap-diagnostic emission sites are individually listed below. Handler-body diagnostic sites are not counted.

1. Flag registration, `src/extension/factory.ts:481-484`:

```ts
    } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
      deps.emitDiagnostic?.(bootstrapFailedDiagnostic("pi.registerFlag", e));
      return;
    }
```

2. System-note renderer registration, `src/extension/factory.ts:497-502`:

```ts
    } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
      deps.rendererGate?.degrade();
      deps.emitDiagnostic?.(
        bootstrapFailedDiagnostic("pi.registerMessageRenderer", e),
      );
    }
```

3. Print renderer registration, `src/extension/factory.ts:552-554`:

```ts
        } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — print renderer registration
          deps.emitDiagnostic?.(bootstrapFailedDiagnostic("pi.registerMessageRenderer", e));
        }
```

4. Print tool registration, `src/extension/factory.ts:563-565`:

```ts
        } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — print tool registration
          deps.emitDiagnostic?.(bootstrapFailedDiagnostic("pi.registerTool", e, { theta: THETA_PRINT_TOOL_NAME }));
        }
```

5. Progress tool registration, `src/extension/factory.ts:579-583`:

```ts
      } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
        deps.emitDiagnostic?.(
          bootstrapFailedDiagnostic("pi.registerTool", e, { theta: THETA_PROGRESS_TOOL_NAME }),
        );
      }
```

6. Resources-discover subscription, `src/extension/factory.ts:601-605`:

```ts
    } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
      deps.emitDiagnostic?.(
        bootstrapFailedDiagnostic("pi.on", e, { event: "resources_discover" }),
      );
      return;
```

7. Session-start subscription, `src/extension/factory.ts:661-665`:

```ts
    } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
      deps.emitDiagnostic?.(
        bootstrapFailedDiagnostic("pi.on", e, { event: "session_start" }),
      );
      return;
```

8. Session-shutdown subscription, `src/extension/factory.ts:1139-1143`:

```ts
    } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
      deps.emitDiagnostic?.(
        bootstrapFailedDiagnostic("pi.on", e, { event: "session_shutdown" }),
      );
      return;
```

## Why this is a problem
This is stale collaborator-count prose: the dependency comment presents a five-site inventory of the context-free diagnostic path, but the implementation contains the eight sites cited above. The mismatch is in the explanation of the dependency's consumers, not in the registration or diagnostic behavior.

## Suggested direction (non-binding, optional)
Bring the dependency comment's inventory into agreement with the current factory.

## False-positive check
- Inspected the enclosing factory control flow for every counted site. The eight catches execute around synchronous factory-body registration/subscription calls, not inside the delivered event handlers. Conditional print/tool registration still contributes factory-time diagnostic sites; the claim is a site count, not the number of emissions in one invocation.
- Ran `rg -n 'bootstrapFailedDiagnostic' src/extension/factory.ts` and classified every result by enclosing scope. Per-theta command/getCommands failures, the compose-handler failure, and the shutdown-handler callback are not included in the eight-site inventory above.
- Git intent check: `git log -p -1 -S 'five' -- src/extension/factory-deps.ts` shows the wording copied into the extracted dependency file in `96408d09`. `git log -p -1 -S 'registerThetaProgressTool' -- src/extension/factory.ts` shows the added factory-body tool registration and its bootstrap diagnostic in `1f45d654`; `git log --oneline -S 'THETA_PRINT_TOOL_NAME' -- src/extension/factory.ts` identifies the print additions in `fdd1a410`.
- Duplicate check: `rg -n 'five.*factory-time|factory-time.*five|latchSessionContext.*first|first.*latchSessionContext' quality/issues/ quality/resolved/` returned no matches. The historical five-site description in bug 0023 is not being challenged as a dated record; this finding targets the current dependency comment.
- No declaration, export, witness-test seam, guard, or parameter is claimed dead. No registration behavior change is proposed.

## Triage
verdict: confirmed — factory-deps.ts still says “five” factory-time diagnostic sites, but factory.ts contains all eight cited synchronous registration/subscription catches; excerpts, searches, and history reproduce, and no existing issue tracks this stale count. (triage: claude-opus-5-5)
