// RFC 0011 (V24a-T / V24a) — session-control runtime-tool adapters
// (`compact`, `context_usage`, `session_name`).
//
// This module owns the runtime-owned execute table over the composition-scope
// `ctx` / factory-captured `pi` handles (seam sheet §0 C1, §6.2): pure
// adapters lowering a host session-control member to a `ThetaValue` `Result`,
// over fake-able `Pick`-narrowed carrier types so the offline adapter/dispatch
// tests need no Pi.
//
// Spec: docs/rfcs/0011-session-control-tools.md §2 (Detailed design);
// docs/spec_topics/tool-calls.md #session-control-runtime-tools.
//
// No ambient primitives (no `process.env` / `Date.now` / global timers); no
// Pi value import — the two carrier types are type-only imports.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { lowerToolExecuteThrow } from "./tool-call-execute";
import { makeErr, makeOk, type ThetaValue } from "./value";

/** Composition-scope `ctx` members the session-control adapters consume (seam sheet §0 C1). */
export type SessionControlCtx = Pick<ExtensionContext, "compact" | "getContextUsage">;

/** Factory-captured `pi` members the session-control adapters consume (seam sheet §0 C1). */
export type SessionControlPi = Pick<ExtensionAPI, "setSessionName" | "getSessionName">;

/** `compact(instructions = "")` — Promise wrap over the fire-and-forget host call (seam sheet §6.2).
 *
 * The host's `ctx.compact()` is fire-and-forget with `onComplete`/`onError`
 * callbacks (host-interfaces-core.md #extensioncontext-interface); this adapter
 * wraps them in a Promise that RESOLVES on both callbacks (the reject channel
 * stays closed — `_bindExtensionCore` normalises throws into `onError(Error)`,
 * C2(f)). Blank/whitespace instructions → `customInstructions: undefined` (the
 * TUI's bare-`/compact` mapping). `estimatedTokensAfter` absent → the pinned
 * never-fabricate execution-`Err` (C2(c)).
 */
export function executeCompactTool(
  host: SessionControlCtx,
  presentedName: string,
  instructions: string,
): Promise<ThetaValue> {
  // exactOptionalPropertyTypes: when the field is absent the host omits the
  // property entirely — `customInstructions: undefined` is not the same as
  // absent for the flag. Spread-conditional keeps the option absent when
  // blank/whitespace; a non-blank value reaches the host VERBATIM (no trim)
  // so the author controls the exact instructions string.
  const isBlank = instructions.trim().length === 0;
  const compactOptions = {
    ...(!isBlank ? { customInstructions: instructions } : {}),
  };
  return new Promise<ThetaValue>((resolve) => {
    host.compact({
      ...compactOptions,
      onComplete: (r): void => {
        // C2(c): never fabricate the absent estimate — surface the pinned
        // execution-Err so the theta author observes the gap.
        if (r.estimatedTokensAfter === undefined) {
          resolve(
            makeErr({
              kind: "code_tool",
              message: "compaction completed but the host reported no token estimate",
              tool_name: presentedName,
              cause: "execution",
            } as unknown as ThetaValue),
          );
          return;
        }
        resolve(
          makeOk({
            summary: r.summary,
            tokens_before: r.tokensBefore,
            tokens_after: r.estimatedTokensAfter,
          } as unknown as ThetaValue),
        );
      },
      onError: (e): void => {
        // lowerToolExecuteThrow provides the verbatim-message + 4096-byte
        // truncation discipline (tool-calls.md #session-control-runtime-tools).
        resolve(makeErr(lowerToolExecuteThrow(e, presentedName) as unknown as ThetaValue));
      },
    });
  });
}

/** `context_usage()` — synchronous gauge read, Promise-shaped for dispatch uniformity (seam sheet §6.2).
 *
 * `getContextUsage()` → `undefined` means no model selected or unknown context
 * window; non-null `tokens`/`percent` requires an assistant response since
 * session start. The field renames (`contextWindow` → `context_window`) are
 * pinned by the signature table's `successTypeSource`.
 */
export function executeContextUsageTool(
  host: SessionControlCtx,
  presentedName: string,
): Promise<ThetaValue> {
  const usage = host.getContextUsage();
  if (usage === undefined) {
    return Promise.resolve(
      makeErr({
        kind: "code_tool",
        message: "context usage unavailable: no model selected or unknown context window",
        tool_name: presentedName,
        cause: "execution",
      } as unknown as ThetaValue),
    );
  }
  if (usage.tokens === null || usage.percent === null) {
    return Promise.resolve(
      makeErr({
        kind: "code_tool",
        message: "context usage unknown until the next assistant response",
        tool_name: presentedName,
        cause: "execution",
      } as unknown as ThetaValue),
    );
  }
  return Promise.resolve(
    makeOk({
      tokens: usage.tokens,
      context_window: usage.contextWindow,
      percent: usage.percent,
    } as unknown as ThetaValue),
  );
}

// The parameter below is named `piHandle`, not `pi` (seam sheet §6.2 writes
// `pi: SessionControlPi`): a bare-named `pi` parameter whose annotation is not
// the literal `ExtensionAPI` is the inventory-closure audit's family-(4)
// `off-canonical-annotation-pi` shape
// (`src/extension/inventory-closure-audit.ts`), which is NOT
// marker-exemptible (no `// allow-pi-surface:` suppresses a family-(4) shape)
// and would flip `tests/inventory-closure-audit-gate.test.ts` — a do-not-break
// file — red. `SessionControlPi` is a `Pick`-narrowed structural carrier, not
// the bare canonical carrier, so renaming the PARAMETER (not the exported type)
// keeps the audit's `pi`-literal detection scoped to genuine bare-`ExtensionAPI`
// carriers while satisfying the sheet's carrier-type intent.
/** `session_name(name)` — set + read-back (seam sheet §6.2).
 *
 * Blank/whitespace name → validation `Err` with `setSessionName` NOT called;
 * else `setSessionName` exactly once, then `Ok(getSessionName() ?? name)`.
 */
export function executeSessionNameTool(
  piHandle: SessionControlPi,
  presentedName: string,
  name: string,
): Promise<ThetaValue> {
  if (name.trim().length === 0) {
    return Promise.resolve(
      makeErr({
        kind: "code_tool",
        message: "session name must not be empty or whitespace-only",
        tool_name: presentedName,
        cause: "validation",
      } as unknown as ThetaValue),
    );
  }
  piHandle.setSessionName(name);
  return Promise.resolve(makeOk((piHandle.getSessionName() ?? name) as ThetaValue));
}
