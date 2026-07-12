import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  createLoomExtension,
  type LoomExtensionDeps,
} from "../src/extension/factory";
import type { ExtensionInstanceWiring } from "../src/extension/production-composition";
import { LoomRegistry, type ParsedLoom } from "../src/extension/reload-wiring";
import { FakeClock } from "./helpers/fake-clock";
import { ActiveInvocationRegistry } from "../src/runtime/active-invocation-registry";

// PIC-29..32 — factory-level drain-gated dispatch integration.
//
// Proves the just-landed wiring in `factory.ts`: on the composeInstance
// production path `registerFixtures(fixtures, registry)` registers a
// drain-state-gated dispatch WRAPPER (`drainGatedHandler(name, registry)`) as
// the pi command handler — NOT a raw pass-through. At dispatch time the wrapper
// reads `registry.readDrainState()` under the PIC-31 slash-site fail-safe and
// either dispatches the registry's CURRENT raw entry (arm (a) dispatch, and its
// superseded-entry sub-case) or emits the shutting-down / superseded note on the
// `loom-system-note` channel with `triggerTurn:false`.
//
// The harness is copied verbatim from
// `tests/watcher-hot-reload-integration.test.ts` (the fake pi capturing
// `registerCommand` handlers + `sendMessage` notes, the subscription table, and
// `fireSessionStart`). The only divergence is that `composeInstance` is a
// deterministic stub returning a `LoomRegistry` this test fully controls (a
// no-op `installHotReload`), so there is NO filesystem, NO watcher, and NO live
// model — the REAL registration path is still exercised end-to-end.

/** A recorded `pi.sendMessage` call. */
interface RecordedNote {
  readonly customType: string;
  readonly content: string;
  readonly display: boolean;
  readonly details: unknown;
  readonly triggerTurn: unknown;
}

/** The registered pi command options shape this test invokes against. */
interface RegisteredCommand {
  readonly handler: (args: string, ctx: ExtensionCommandContext) => unknown;
}

interface Harness {
  readonly pi: ExtensionAPI;
  readonly ctx: ExtensionContext;
  readonly commands: Map<string, unknown>;
  readonly notes: RecordedNote[];
  readonly subscriptions: Map<
    string,
    ((event: unknown, ctx: ExtensionContext) => unknown)[]
  >;
  fireSessionStart(): Promise<void>;
}

/**
 * The minimal fake-pi harness, replicated the same way the watcher-hot-reload
 * integration test does (its helpers are not exported): capture
 * `registerCommand` options (so the registered handler can be invoked),
 * `sendMessage` notes, and the `pi.on` subscription table.
 */
function makeHarness(): Harness {
  const commands = new Map<string, unknown>();
  const notes: RecordedNote[] = [];
  const subscriptions = new Map<
    string,
    ((event: unknown, ctx: ExtensionContext) => unknown)[]
  >();

  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerCommand: (name: string, options: unknown): void => {
      commands.set(name, options);
    },
    on: (event: string, handler: (e: unknown, c: ExtensionContext) => unknown): void => {
      const list = subscriptions.get(event) ?? [];
      list.push(handler);
      subscriptions.set(event, list);
    },
    getFlag: (): undefined => undefined,
    getCommands: (): { name: string; source: string }[] =>
      [...commands.keys()].map((name) => ({ name, source: "extension" })),
    sendMessage: (
      message: { customType: string; content: string; display: boolean; details: unknown },
      options: { triggerTurn: unknown },
    ): void => {
      notes.push({
        customType: message.customType,
        content: message.content,
        display: message.display,
        details: message.details,
        triggerTurn: options.triggerTurn,
      });
    },
    sendUserMessage: (): void => {},
  } as unknown as ExtensionAPI;

  const ctx = {
    cwd: "/does/not/matter",
    hasUI: false,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionContext;

  const fire = async (event: string): Promise<void> => {
    for (const handler of subscriptions.get(event) ?? []) {
      await handler({ type: event }, ctx);
    }
  };

  return {
    pi,
    ctx,
    commands,
    notes,
    subscriptions,
    fireSessionStart: () => fire("session_start"),
  };
}

/**
 * A minimal `ParsedLoom`. The registration path and the drain-gated wrapper read
 * only `slashName` + `run`; `frontmatter` / `body` are never touched at dispatch
 * time, so they carry inert placeholders.
 */
function makeLoom(
  slashName: string,
  run: (args: string, ctx: ExtensionCommandContext) => Promise<void>,
): ParsedLoom {
  return {
    slashName,
    frontmatter: { mode: "prompt" } as unknown as ParsedLoom["frontmatter"],
    body: { statements: [] } as unknown as ParsedLoom["body"],
    run,
  };
}

/**
 * Boot the extension through the REAL factory with a deterministic
 * `composeInstance` returning the given registry + looms and a no-op
 * `installHotReload`, then fire `session_start` so `drainGatedHandler` is the
 * registered handler for each loom.
 */
async function boot(
  registry: LoomRegistry,
  looms: readonly ParsedLoom[],
): Promise<Harness> {
  const harness = makeHarness();
  const deps: LoomExtensionDeps = {
    fixtures: [],
    composeInstance: async (): Promise<ExtensionInstanceWiring> => ({
      looms,
      registry,
      activeInvocations: new ActiveInvocationRegistry(),
      clock: new FakeClock(),
      installHotReload: () => ({ detach: (): void => {} }),
    }),
  };
  createLoomExtension(deps)(harness.pi);
  await harness.fireSessionStart();
  return harness;
}

/** Invoke the captured pi handler for `name` (the drain-gated wrapper). */
async function invoke(harness: Harness, name: string, args = ""): Promise<void> {
  const options = harness.commands.get(name) as RegisteredCommand | undefined;
  if (options === undefined) {
    throw new Error(`no command registered for /${name}`);
  }
  await options.handler(args, {} as unknown as ExtensionCommandContext);
}

/** The `loom-system-note` entries recorded so far. */
function loomNotes(harness: Harness): readonly RecordedNote[] {
  return harness.notes.filter((n) => n.customType === "loom-system-note");
}

describe("PIC-29..32 — drain-gated dispatch through the real registration path", () => {
  it("(1) normal dispatch: arm (a) runs the loom's raw run and emits NO note", async () => {
    // PIC-29 arm (a) dispatch: steady-state registry (drained:false, tag:undefined)
    // with `/foo` present → the wrapper dispatches the registry's current raw entry.
    let ran = false;
    const foo = makeLoom("foo", async () => {
      ran = true;
    });
    const registry = new LoomRegistry([["foo", foo]]);
    const harness = await boot(registry, [foo]);

    expect(harness.commands.has("foo")).toBe(true);
    await invoke(harness, "foo", "some args");

    expect(ran).toBe(true);
    expect(loomNotes(harness)).toEqual([]);
  });

  it("(2) superseded note: a dropped entry yields the superseded note, dispatches no loom", async () => {
    // PIC-29 arm (a) superseded-entry-dispatch sub-case
    // (registration-steps.md#superseded-entry-dispatch): steady-state drain
    // tuple but the slash name is absent from the registry → the fixed
    // superseded note, NOT a fourth arm and NOT a dispatch.
    let ran = false;
    const foo = makeLoom("foo", async () => {
      ran = true;
    });
    const registry = new LoomRegistry([["foo", foo]]);
    const harness = await boot(registry, [foo]);

    // Drop `/foo` from the registry (publish a map WITHOUT it). The command
    // handler was already registered once; the wrapper looks up the CURRENT
    // entry at dispatch time.
    registry.publish(new Map());
    await invoke(harness, "foo");

    const notes = loomNotes(harness);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.content).toBe("loom /foo: superseded; /reload to refresh");
    expect(notes[0]?.customType).toBe("loom-system-note");
    expect(notes[0]?.triggerTurn).toBe(false);
    expect(ran).toBe(false);
  });

  it("(3) shutting-down note: after registry.drain() the loom does not run", async () => {
    // PIC-32 drain: `LoomRegistry.drain()` sets drained:true → arm (b), the
    // shutting-down note; the loom is NOT dispatched.
    let ran = false;
    const foo = makeLoom("foo", async () => {
      ran = true;
    });
    const registry = new LoomRegistry([["foo", foo]]);
    const harness = await boot(registry, [foo]);

    registry.drain();
    await invoke(harness, "foo");

    const notes = loomNotes(harness);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.content).toBe("loom /foo: extension shutting down");
    expect(notes[0]?.customType).toBe("loom-system-note");
    expect(notes[0]?.triggerTurn).toBe(false);
    expect(ran).toBe(false);
  });

  it("(4) post-swap dispatch is current: the SAME captured handler runs the swapped-in v2 loom", async () => {
    // PIC-29 arm (a) dispatch — the wrapper dispatches `registry.get(name)`, not
    // the captured closure: a publish that swaps `/foo` to a v2 loom is picked
    // up on the next dispatch of the handler registered ONCE at session_start.
    let ranV1 = false;
    let ranV2 = false;
    const fooV1 = makeLoom("foo", async () => {
      ranV1 = true;
    });
    const registry = new LoomRegistry([["foo", fooV1]]);
    const harness = await boot(registry, [fooV1]);

    // Swap the entry to a v2 loom whose run sets a DIFFERENT flag.
    const fooV2 = makeLoom("foo", async () => {
      ranV2 = true;
    });
    registry.publish(new Map([["foo", fooV2]]));

    // Invoke the SAME captured `/foo` handler (registered once at session_start).
    await invoke(harness, "foo");

    expect(ranV2).toBe(true);
    expect(ranV1).toBe(false);
    expect(loomNotes(harness)).toEqual([]);
  });
});
