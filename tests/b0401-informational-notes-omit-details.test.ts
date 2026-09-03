// Bug 0401 — RED witnesses that the four matrix-less production informational
// notes (plus the test-only slash-dispatch note) omit `details` on the wire.
//
// WHY these witnesses exist. `theta-system-note`'s `details` field is a CLOSED
// four-arm partition keyed on WHICH KEY IS PRESENT
// (runtime-event-channel.md #system-note-details-shapes): `{ diagnostics }`,
// `{ event }`, `{ structural }`, `{ recovery }`, "disjoint by key; renderers
// MUST NOT assume more than one is present". A note that ships
// `details: { event: {} }` therefore FALSELY selects the runtime-event arm and
// then validates as an empty `RuntimeEvent` (no required fields) — the one
// disposition the existing spec text actively contradicts. The spec assigns
// these five informational notes NO `details` shape at all.
//
// Parent adjudication is settled as Option (b) (bug 0401 §Fix, constraint 1(b)
// + constraint 3): informational notes carry NO `details` — the fix OMITS the
// field on the wire at all five sites. So each witness asserts, per note:
// (a) `details` is ABSENT (`"details" in note` is false / `note.details` is
// undefined), AND (b) the substring `event` appears nowhere in the note. RED at
// HEAD because every site ships `details: { event: {} }` today.
//
// Each site pairs a CONTROL (`content` + `display` — GREEN today and after,
// proving the fix touches ONLY `details`) with a WITNESS (the `details` /
// `event` assertions — RED today). The control's capture assertion also proves
// the note is genuinely observed, so a witness red is never a vacuous "no note
// captured" pass.
//
// Sites (owned here): `#emitBinderEchoNote` and `#emitNoParamsOverflowNote`
// (`src/extension/production-theta-producer.ts`); the drain-gated dispatch
// refusal note and the repeat-start supersession note
// (`src/extension/factory.ts`); and `driveSlashPromptTurn`
// (`src/runtime/slash-dispatch.ts`, test-only surface — its `sendMessage`
// `details` becomes optional under the fix). The sibling `#emitBinderFailureNote`
// (bug 0397, group A) and `#emitCustomTypeUnsafeNote` (bug 0398, group B) keep
// their matrix-pinned `details: { event: {} }` and are deliberately untouched.
//
// Harnesses mirror the existing house patterns:
// `tests/e2e-s5-binder-echo-emission.test.ts` (production `runBinder` capture),
// `tests/drain-gated-dispatch-integration.test.ts` +
// `tests/double-session-start-supersession.test.ts` (real-factory fake-pi
// recorder), and `tests/slash-dispatch.test.ts` (the SLSH-2 prompt driver). The
// one divergence is that each recorder captures the RAW `pi.sendMessage`
// message object, so `"details" in note` reflects the wire (present today,
// absent after the fix) rather than being forced true by reconstruction.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The scripted off-session binder reply, mirrored from the e2e-s5 harness so
// the production `runBinder` `ok` arm (which reaches `#emitBinderEchoNote`) can
// be driven with no live model. `vi.hoisted` so the hoisted `vi.mock` factory
// can close over the mutable holder.
const scripted = vi.hoisted(() => ({
  replyFor: undefined as undefined | ((context: unknown) => unknown),
}));

vi.mock("@earendil-works/pi-ai/compat", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    complete: vi.fn(async (_model: unknown, context: unknown) =>
      scripted.replyFor?.(context),
    ),
  };
});

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import {
  createThetaExtension,
  type ThetaExtensionDeps,
} from "../src/extension/factory";
import type { ExtensionInstanceWiring } from "../src/extension/production-composition";
import { ThetaRegistry, type ParsedTheta } from "../src/extension/reload-wiring";
import { ActiveInvocationRegistry } from "../src/runtime/active-invocation-registry";
import {
  driveSlashPromptTurn,
  type SlashPromptDriveDeps,
} from "../src/runtime/slash-dispatch";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
} from "../src/parser/theta-document";
import type { ThetaSource } from "../src/lexer/lexer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import { FakeClock } from "./helpers/fake-clock";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";

const SYSTEM_NOTE_CHANNEL = "theta-system-note";

/**
 * A captured `pi.sendMessage` message — the RAW object the emission site built.
 * `details` is optional so `"details" in note` reflects whether the site put
 * the key on the wire (the whole point of the bug): present today
 * (`{ event: {} }`), absent after the Option-(b) fix.
 */
interface CapturedNote {
  readonly customType: string;
  readonly content: string;
  readonly display?: boolean;
  readonly details?: unknown;
}

/** The `theta-system-note` entries among the captured messages. */
function channelNotes(notes: readonly CapturedNote[]): CapturedNote[] {
  return notes.filter((n) => n.customType === SYSTEM_NOTE_CHANNEL);
}

/**
 * The shared bug-0401 witness assertions: a matrix-less informational note
 * carries NO `details` and never mentions the partition-selecting `event` key.
 * RED at HEAD (`details: { event: {} }`); GREEN once the fix omits `details`.
 */
function assertOmitsEventDetails(note: CapturedNote, label: string): void {
  // Option (b): `details` is omitted on the wire entirely.
  expect(
    "details" in note,
    `${label}: the note still ships a \`details\` field on the wire`,
  ).toBe(false);
  expect(
    note.details,
    `${label}: the note's \`details\` is not undefined`,
  ).toBeUndefined();
  // The `event` key is load-bearing for the closed partition; an informational
  // note must not fabricate it (nor mention it anywhere in the serialised note).
  expect(
    JSON.stringify(note),
    `${label}: the substring "event" appears in the serialised note`,
  ).not.toContain("event");
}

// ===========================================================================
// Producer harness (mirrors tests/e2e-s5-binder-echo-emission.test.ts), with
// the recorder capturing the RAW message so `details` presence is observable.
// ===========================================================================

function scriptEnvelope(envelope: unknown): void {
  scripted.replyFor = (context: unknown): unknown => {
    const tools = (context as { tools?: ReadonlyArray<{ name?: unknown }> }).tools;
    const name =
      typeof tools?.[0]?.name === "string" ? tools[0].name : "__theta_bind_none";
    return {
      role: "assistant",
      content: [{ type: "toolCall", id: "tc-1", name, arguments: { envelope } }],
      stopReason: "toolUse",
      timestamp: 0,
    };
  };
}

function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}

function parse(path: string, src: string) {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics
    .filter((d) => d.severity === "error")
    .map((d) => d.code);
  expect(errors, "the theta must parse cleanly before it is driven").toEqual([]);
  expect(doc.frontmatter, "the theta must carry parseable frontmatter").not.toBeNull();
  return doc;
}

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: {
      newInvocationId: (): string => "inv-1",
      newToolCallId: (): string => "tc-1",
    },
    clock: { wallNow: (): number => 0 },
    schemaValidator: new AjvSchemaValidator({
      emit: (): void => {},
      slugOf: (schema: LoweredSchema): SchemaSlug => {
        const canonicalBytes = JSON.stringify(schema);
        return { slug: canonicalBytes, canonicalBytes };
      },
    }),
  } as unknown as RuntimeRoot;
}

const BINDER_MODEL = {
  id: "binder-model",
  provider: "anthropic-messages",
  api: "anthropic-messages",
  strictCapable: true,
};

function producerWithCapture(): {
  readonly deps: ReturnType<typeof createProductionProducerDeps>;
  readonly notes: CapturedNote[];
} {
  const notes: CapturedNote[] = [];
  const pi = {
    sendMessage: (message: CapturedNote): void => {
      notes.push(message);
    },
  } as unknown as ExtensionAPI;
  const modelRegistry = {
    getAvailable: (): readonly unknown[] => [BINDER_MODEL],
    getApiKeyAndHeaders: async (): Promise<{ ok: boolean }> => ({ ok: true }),
  } as unknown as ModelRegistry;
  const deps = createProductionProducerDeps({ pi, root: rootDouble(), modelRegistry });
  return { deps, notes };
}

function ctxDouble(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}

// A two-required-string-param theta drives a genuine binder pass with no
// defaulted fields, so a scripted `ok` reaches `#emitBinderEchoNote`.
const TWO_PARAM_THETA = [
  "---",
  "mode: prompt",
  "bind_model: binder-model",
  "params:",
  "  topic: string",
  "  audience: string",
  "---",
  "@`review ${topic} for ${audience}`",
  "",
].join("\n");

function twoParamTheta(): ThetaCompositionInput {
  const doc = parse("code-review.theta", TWO_PARAM_THETA);
  return {
    slashName: "code-review",
    sourcePath: "/theta/code-review.theta",
    frontmatter: doc.frontmatter!,
    body: doc.body,
    binderModel: "binder-model",
  };
}

// A no-params theta bypasses the binder; a non-empty slash-argument remainder
// drives `#emitNoParamsOverflowNote` (SLSH-1).
const NO_PARAMS_THETA = ["---", "mode: prompt", "---", "@`hello`", ""].join("\n");

function noParamsTheta(): ThetaCompositionInput {
  const doc = parse("plain.theta", NO_PARAMS_THETA);
  return {
    slashName: "plain",
    // The prefix is composed rather than written as one span so the DIAG-2
    // corpus gate's extractor does not read this fixture path as an asserted
    // diagnostic code in the `theta/` namespace (the composed-prefix idiom the
    // registry-closed-set corpus gate documents for path-shaped literals).
    sourcePath: "/theta/" + "plain.theta",
    frontmatter: doc.frontmatter!,
    body: doc.body,
  };
}

// ===========================================================================
// Factory harness (mirrors tests/drain-gated-dispatch-integration.test.ts and
// tests/double-session-start-supersession.test.ts), capturing raw messages.
// ===========================================================================

interface RegisteredCommand {
  readonly handler: (args: string, ctx: ExtensionCommandContext) => unknown;
}

interface FactoryHarness {
  readonly pi: ExtensionAPI;
  readonly notes: CapturedNote[];
  readonly commands: Map<string, unknown>;
  fireSessionStart(): Promise<void>;
}

function makeFactoryHarness(): FactoryHarness {
  const commands = new Map<string, unknown>();
  const notes: CapturedNote[] = [];
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
    // Capture the RAW message object so `details` presence reflects the wire.
    sendMessage: (message: CapturedNote): void => {
      notes.push(message);
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

  return { pi, notes, commands, fireSessionStart: () => fire("session_start") };
}

function makeTheta(
  slashName: string,
  run: (args: string, ctx: ExtensionCommandContext) => Promise<void>,
): ParsedTheta {
  return {
    slashName,
    frontmatter: { mode: "prompt" } as unknown as ParsedTheta["frontmatter"],
    body: { statements: [] } as unknown as ParsedTheta["body"],
    run,
  };
}

function makeWiring(
  thetas: readonly ParsedTheta[],
  registry: ThetaRegistry,
): ExtensionInstanceWiring {
  return {
    thetas,
    registry,
    activeInvocations: new ActiveInvocationRegistry(),
    forwardingSignals: [],
    clock: new FakeClock(),
    installHotReload: () => ({ detach: (): void => {} }),
  };
}

async function invoke(
  harness: FactoryHarness,
  name: string,
  args = "",
): Promise<void> {
  const options = harness.commands.get(name) as RegisteredCommand | undefined;
  if (options === undefined) {
    // No silent skipping (AGENTS.md): a missing registration is a setup fault.
    throw new Error(`no command registered for /${name}`);
  }
  await options.handler(args, {} as unknown as ExtensionCommandContext);
}

// ===========================================================================
// Site 1 — binder success echo (#emitBinderEchoNote).
// ===========================================================================

describe("bug 0401 — site 1: binder success echo omits `details`", () => {
  beforeEach(() => {
    scripted.replyFor = undefined;
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  async function driveEcho(): Promise<CapturedNote> {
    scriptEnvelope({ kind: "ok", args: { topic: "async", audience: "team" } });
    const { deps, notes } = producerWithCapture();
    const result = await deps.runBinder({
      theta: twoParamTheta(),
      args: "the async module for the team",
      ctx: ctxDouble(),
    });
    expect(result.bound, "an `ok` envelope binds and the theta runs").toBe(true);
    const emitted = channelNotes(notes);
    // Fail loudly if the echo was never observed — a witness red must be real.
    expect(
      emitted,
      "the binder success echo note was not captured on the theta-system-note channel",
    ).toHaveLength(1);
    return emitted[0]!;
  }

  it("control (GREEN): the echo note's content/display are unchanged by the fix", async () => {
    const echo = await driveEcho();
    expect(echo.content).toBe("Running /code-review: topic=async, audience=team");
    expect(echo.display).toBe(true);
  });

  it("witness (RED at HEAD): the echo note carries no `details` / no `event` key", async () => {
    assertOmitsEventDetails(await driveEcho(), "binder success echo");
  });
});

// ===========================================================================
// Site 2 — SLSH-1 no-params overflow (#emitNoParamsOverflowNote).
// ===========================================================================

describe("bug 0401 — site 2: SLSH-1 no-params overflow note omits `details`", () => {
  beforeEach(() => {
    scripted.replyFor = undefined;
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  async function driveOverflow(): Promise<CapturedNote> {
    const { deps, notes } = producerWithCapture();
    const result = await deps.runBinder({
      theta: noParamsTheta(),
      args: "extra text here",
      ctx: ctxDouble(),
    });
    expect(result.bound, "a no-params theta binds and its body runs").toBe(true);
    const emitted = channelNotes(notes);
    expect(
      emitted,
      "the SLSH-1 overflow note was not captured on the theta-system-note channel",
    ).toHaveLength(1);
    return emitted[0]!;
  }

  it("control (GREEN): the overflow note's content/display are unchanged by the fix", async () => {
    const note = await driveOverflow();
    // slash-invocation.md SLSH-1 — em-dash (U+2014) separator.
    expect(note.content).toBe(
      "theta /plain: ignoring extra arguments \u2014 this theta takes no parameters",
    );
    expect(note.display).toBe(true);
  });

  it("witness (RED at HEAD): the overflow note carries no `details` / no `event` key", async () => {
    assertOmitsEventDetails(await driveOverflow(), "SLSH-1 overflow note");
  });
});

// ===========================================================================
// Site 3 — drain-gated dispatch refusal note (factory.ts drainGatedHandler).
// ===========================================================================

describe("bug 0401 — site 3: drain-state dispatch-refusal note omits `details`", () => {
  async function driveDrainRefusal(): Promise<CapturedNote> {
    const foo = makeTheta("foo", async () => {});
    const registry = new ThetaRegistry([["foo", foo]]);
    const harness = makeFactoryHarness();
    const deps: ThetaExtensionDeps = {
      fixtures: [],
      composeInstance: async (): Promise<ExtensionInstanceWiring> =>
        makeWiring([foo], registry),
    };
    createThetaExtension(deps)(harness.pi);
    await harness.fireSessionStart();

    // PIC-32 drain → the slash handler resolves to a "note" outcome and emits
    // the shutting-down refusal note (dispatches no theta).
    registry.drain();
    await invoke(harness, "foo");

    const emitted = channelNotes(harness.notes);
    expect(
      emitted,
      "the drain-state dispatch-refusal note was not captured on the theta-system-note channel",
    ).toHaveLength(1);
    return emitted[0]!;
  }

  it("control (GREEN): the refusal note's content/display are unchanged by the fix", async () => {
    const note = await driveDrainRefusal();
    expect(note.content).toBe("theta /foo: extension shutting down");
    expect(note.display).toBe(true);
  });

  it("witness (RED at HEAD): the refusal note carries no `details` / no `event` key", async () => {
    assertOmitsEventDetails(await driveDrainRefusal(), "drain-state refusal note");
  });
});

// ===========================================================================
// Site 4 — repeat-start supersession note (factory.ts runComposeInstanceRegistration).
// ===========================================================================

describe("bug 0401 — site 4: repeat-start supersession note omits `details`", () => {
  const REPEAT_START =
    "theta: repeat session_start without session_shutdown; superseding prior hot-reload generation";

  async function driveRepeatStart(): Promise<CapturedNote> {
    const harness = makeFactoryHarness();
    const deps: ThetaExtensionDeps = {
      fixtures: [],
      // A fresh wiring per compose — the second shutdown-less session_start is
      // a repeat delivery and emits exactly one supersession note.
      composeInstance: async (): Promise<ExtensionInstanceWiring> => {
        const foo = makeTheta("foo", async () => {});
        return makeWiring([foo], new ThetaRegistry([["foo", foo]]));
      },
    };
    createThetaExtension(deps)(harness.pi);
    await harness.fireSessionStart();
    await harness.fireSessionStart();

    const emitted = channelNotes(harness.notes).filter(
      (n) => n.content === REPEAT_START,
    );
    expect(
      emitted,
      "the repeat-start supersession note was not captured on the theta-system-note channel",
    ).toHaveLength(1);
    return emitted[0]!;
  }

  it("control (GREEN): the supersession note's content/display are unchanged by the fix", async () => {
    const note = await driveRepeatStart();
    expect(note.content).toBe(REPEAT_START);
    expect(note.display).toBe(true);
  });

  it("witness (RED at HEAD): the supersession note carries no `details` / no `event` key", async () => {
    assertOmitsEventDetails(await driveRepeatStart(), "repeat-start supersession note");
  });
});

// ===========================================================================
// Site 5 — test-only slash-dispatch err note (driveSlashPromptTurn).
// ===========================================================================

describe("bug 0401 — site 5: driveSlashPromptTurn note omits `details`", () => {
  const ERR_NOTE = "theta /greet returned Err: transport \u2014 connection reset";

  async function driveSlashNote(): Promise<CapturedNote> {
    const notes: CapturedNote[] = [];
    const deps: SlashPromptDriveDeps = {
      pi: {
        sendUserMessage: (): void => {},
        // Capture the RAW message; the fix makes `details` optional and omits it.
        sendMessage: (message): void => {
          notes.push(message as CapturedNote);
        },
      },
      ctx: { waitForIdle: (): Promise<void> => Promise.resolve() },
      outcome: { kind: "err", note: ERR_NOTE },
    };
    await driveSlashPromptTurn("Greet the user.", deps);

    const emitted = channelNotes(notes);
    expect(
      emitted,
      "the slash-dispatch err note was not captured on the theta-system-note channel",
    ).toHaveLength(1);
    return emitted[0]!;
  }

  it("control (GREEN): the err note's content/display are unchanged by the fix", async () => {
    const note = await driveSlashNote();
    expect(note.content).toBe(ERR_NOTE);
    expect(note.display).toBe(true);
  });

  it("witness (RED at HEAD): the err note carries no `details` / no `event` key", async () => {
    assertOmitsEventDetails(await driveSlashNote(), "slash-dispatch err note");
  });
});
