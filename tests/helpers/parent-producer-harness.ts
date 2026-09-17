// A shared "parent producer" harness driving the real
// `spawnSubagentConversation` producer over a fake JSON child launcher
// (PTQ-0384).
//
// WHY THIS FILE EXISTS. tests/b0328-root-closure-hash-marshalled.test.ts and
// tests/b0343-proto-hash-carrier-row.test.ts each independently declared the
// same seven module-scope functions for driving the real
// `spawnSubagentConversation` producer over `makeFakeJsonChildLauncher`: a
// `RuntimeRoot` double wiring an inline no-op checkpoint, a fixed `idSource`,
// and a `clock` whose `setTimeout`/`clearTimeout` forward to the ambient
// timers; a no-op `pi`; a minimal query body (`queryBody`); a
// `createProductionProducerDeps` wrapper around the double plus a stub
// `parseCallee` and the fake launcher (`makeParentDeps`); a
// `ConversationBindInput` builder (`parentBindInput`); and the marshalled
// carrier's two reading helpers (`carrierRaw`, `marshalledHashes`). This
// module centralises that shape so both files import it rather than
// redeclare it. tests/subagent-model-theta-tool.test.ts carries a diverged
// cousin of this same lineage (its own `makeParentDeps` takes a
// `parseCalleeSpy` and an `opts` bag this one does not) and stays independent.
//
// TIER: unit, offline, deterministic, provider-free — the same tier as every
// file that imports this module.

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import { createProductionProducerDeps } from "../../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../../src/extension/theta-composition-producer";
import type { ThetaBody } from "../../src/parser/theta-document";
import { SUBAGENT_CALLABLE_HASHES_ENV } from "../../src/runtime/subagent-callable-hash";
import type { RuntimeRoot } from "../../src/runtime-root";
import { fakeExecutableHost, makeFakeJsonChildLauncher } from "./fake-json-child";

/**
 * A `RuntimeRoot` double wiring an inline no-op checkpoint, a fixed
 * `idSource`, and a clock whose `setTimeout`/`clearTimeout` forward to the
 * ambient timers. The model pre-flight + child teardown measure on the
 * injected Clock; wire the ambient timers so the seams resolve.
 */
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: () => Promise.resolve() },
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    clock: {
      wallNow: () => 0,
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    },
  } as unknown as RuntimeRoot;
}

/** A no-op `ExtensionAPI` for `createProductionProducerDeps`'s `pi`. */
function noopPi(): ExtensionAPI {
  return { sendMessage: (): void => {} } as unknown as ExtensionAPI;
}

/** A minimal `ThetaBody` whose tail is a bare query. */
export function queryBody(): ThetaBody {
  return {
    statements: [],
    tail: {
      kind: "query",
      schema: null,
      template: "do the thing",
      range: { start: { line: 1, column: 1 }, end: { line: 1, column: 12 } },
    },
  } as unknown as ThetaBody;
}

/**
 * A `createProductionProducerDeps` wrapper around `rootDouble()` plus a fake
 * JSON child launcher, ready for `deps.spawnSubagentConversation(...)`.
 */
export function makeParentDeps(): {
  readonly deps: ReturnType<typeof createProductionProducerDeps>;
  readonly launcher: ReturnType<typeof makeFakeJsonChildLauncher>;
} {
  const launcher = makeFakeJsonChildLauncher();
  const deps = createProductionProducerDeps({
    pi: noopPi(),
    root: rootDouble(),
    modelRegistry: {
      getApiKeyAndHeaders: () => Promise.resolve({ ok: false }),
    } as unknown as ModelRegistry,
    // A `.theta` callable entry resolves its callee via parseCallee; the tests
    // below use only the frozen entry's `closureHash`, so a stub callee suffices.
    // Bug 0293: the seam returns the `CalleeParseOutcome` verdict, not a bare
    // `ThetaCompositionInput`.
    parseCallee: (_caller: string | undefined, _calleePath: string) =>
      Promise.resolve({ kind: "ok" as const, input: {} as unknown as ThetaCompositionInput }),
    subagentSpawn: launcher.spawn,
    subagentExecutableHost: fakeExecutableHost(),
    subagentParentEnv: {},
    subagentParentPid: 4242,
  });
  return { deps, launcher };
}

/** A `ConversationBindInput` for `deps.spawnSubagentConversation(...)` over `theta`. */
export function parentBindInput(theta: ThetaCompositionInput): ConversationBindInput {
  const ctx = {
    model: { id: "claude-test", provider: "anthropic" },
    cwd: "/tmp",
    signal: undefined,
  } as unknown as ExtensionCommandContext;
  return { theta, args: "", ctx, thetaAbort: new AbortController() };
}

/** The raw `PI_THETA_SUBAGENT_CALLABLE_HASHES` carrier value off one spawn's env. */
export function carrierRaw(env: Record<string, string | undefined>): string | undefined {
  return env[SUBAGENT_CALLABLE_HASHES_ENV];
}

/** The parsed callable-hash carrier map off one spawn's env (`{}` when absent). */
export function marshalledHashes(env: Record<string, string | undefined>): Record<string, string> {
  const raw = carrierRaw(env);
  return raw === undefined ? {} : (JSON.parse(raw) as Record<string, string>);
}
