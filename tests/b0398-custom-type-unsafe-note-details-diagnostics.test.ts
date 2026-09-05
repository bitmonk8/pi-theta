// Bug 0398 — the BNDR-9 transcript-unsafe-customType rejection ships
// `details: { event: {} }` on the theta-system-note channel; the registered
// `theta/runtime/custom-type-unsafe` (severity E) diagnostic lands on NO wire.
//
// WHY this test exists: `code-registry-runtime.md:43` routes the
// `theta/runtime/custom-type-unsafe` code "through the standard
// `theta-system-note` channel", whose normative diagnostic call shape is
// `details: { diagnostics: <Diagnostic[]> } // single-element array for
// runtime/single-error cases` (`diagnostic-shape.md:7-14`) — the group-B shape
// (`runtime-event-channel.md:55` "Group B — details: { diagnostics }"). BNDR-9
// (`binder-model-and-context.md:137`) prescribes the rejection "emitting
// `theta/runtime/custom-type-unsafe`" AND the user-facing note — two halves of
// one emission, exactly as `emitPanicNote` pairs a framed `content` with
// `details: { diagnostics: [d] }`. The conformant builder
// `customTypeUnsafeDiagnostic(value)` (compact-transcript.ts) exists, is unit-
// pinned, and has ZERO production callers.
//
// RED-AT-FORK anchor: `#emitCustomTypeUnsafeNote` (re-derived by symbol at
// src/extension/production-theta-producer.ts) hardcodes `details: { event: {} }`
// — the empty-payload literal. A `diagnostic-shape.md:20` key-switching
// renderer classifies the note as a runtime event and reads an empty payload;
// the registered code is unobservable. So `presentDetailsKey(note.details)` is
// `"event"` today, `"diagnostics"` after the fix — every GREEN-direction
// assertion below reds against the shipped `{ event: {} }`.
//
// ADJUDICATED end state (bug §Fix constraint 1): the note carries
// `details: { diagnostics: [customTypeUnsafeDiagnostic(value)] }` — the group-B
// single-element runtime batch mirroring `emitPanicNote` — with the `content`
// bytes untouched (the CONTROL cell locks that; green both directions).
//
// Reach path (verified against the tree): `runBinder` reaches
// `#emitCustomTypeUnsafeNote` when (a) `params:` has ≥2 fields so
// `classifyBinderBypass` returns "binder"; (b) the `bind_model:` resolves
// (modelRegistry.getAvailable() carries BINDER_MODEL); (c) frontmatter is
// `mode: prompt` AND `bind_context: session`; (d) `ctx.sessionManager` yields a
// walked/rendered transcript whose included `custom` message has a
// NON-transcript-safe `customType`. `#buildBinderSessionContext` runs BEFORE any
// binder LLM call — when it returns `kind:"unsafe"` the note emits and
// `runBinder` returns `{bound:false}`, so NO scripted `complete()` is needed
// (binding never reaches the model).
//
// Tier: UNIT. The production producer is built with a capturing
// `pi.sendMessage`, exactly as `tests/e2e-s5-binder-echo-emission.test.ts`; the
// note is reached through the real `runBinder` seam with in-memory doubles — no
// provider, no live model, no integration host. An integration/live tier would
// add cost and nondeterminism for no additional reach: the emission body is a
// self-contained literal on the in-process producer.
//
// Rig mirrors tests/e2e-s5-binder-echo-emission.test.ts (rootDouble /
// producerWithCapture / modelRegistry double resolving BINDER_MODEL / a two-
// string-param theta) and tests/b0383-slsh4-note-details-event.test.ts (the
// `presentDetailsKey` disjoint-by-key classifier, CapturedNote/noteChannelEntries).

import { describe, expect, it } from "vitest";

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
} from "../src/parser/theta-document";
import type { ThetaSource } from "../src/lexer/lexer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import {
  customTypeUnsafeDiagnostic,
  renderCustomTypeUnsafeNote,
} from "../src/binder/compact-transcript";

const SYSTEM_NOTE_CHANNEL = "theta-system-note";

// The transcript-unsafe `customType`: `]` (U+005D) breaks the `[custom:<type>]`
// role tag, so BNDR-9's `isTranscriptSafeCustomType` rejects it and the
// renderer's pre-scan returns `{kind:"custom-type-unsafe", value:"weird]type"}`.
const UNSAFE_CUSTOM_TYPE = "weird]type";
const SLASH_NAME = "code-review";

/** A captured `pi.sendMessage` custom message — INCLUDING `details`, the
 *  machine-readable half this bug is about. */
interface CapturedNote {
  readonly customType: string;
  readonly content: string;
  readonly display?: boolean;
  readonly details?: unknown;
}

/**
 * The disjoint-by-key `details` classifier `diagnostic-shape.md:20` requires
 * renderers to implement ("switch on which key is present"). Returns which of
 * the five normative arms a `details` payload selects — the partition rule the
 * empty `{ event: {} }` breaks (it selects `event`, not the group-B
 * `diagnostics` arm the code registry mandates).
 */
function presentDetailsKey(
  details: unknown,
): "diagnostics" | "event" | "structural" | "recovery" | "none" {
  if (typeof details !== "object" || details === null) return "none";
  if ("diagnostics" in details) return "diagnostics";
  if ("event" in details) return "event";
  if ("structural" in details) return "structural";
  if ("recovery" in details) return "recovery";
  return "none";
}

/** The `diagnostics` arm of a captured note's `details`, typed for assertion. */
function diagnosticsArm(details: unknown): readonly Record<string, unknown>[] {
  return (details as { diagnostics: readonly Record<string, unknown>[] }).diagnostics;
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

/** Parse `.theta` source through the production whole-file parser. */
function parse(src: string) {
  const source: ThetaSource = {
    path: "code-review.theta",
    bytes: new TextEncoder().encode(src),
  };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
  expect(errors, "the binder theta must parse cleanly before it is driven").toEqual([]);
  expect(doc.frontmatter, "the binder theta must carry parseable frontmatter").not.toBeNull();
  return doc;
}

/**
 * A runtime-root double sufficient to reach `#emitCustomTypeUnsafeNote`. The
 * session-context walk consumes `root.tokenEstimator` (session-context-walk.ts:
 * `input.estimator.estimate(message)`), so a flat 1-token-per-message estimator
 * is required or the walk throws before the unsafe pre-scan. The other members
 * mirror e2e-s5's rootDouble; only `schemaValidator` is exercised on this path
 * (the envelope schema is built before the session-context block), so it carries
 * the real AJV validator.
 */
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: { wallNow: (): number => 0 },
    tokenEstimator: { estimate: (_message: unknown): number => 1 },
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

/**
 * A production producer wired with a capturing `pi.sendMessage`, a model
 * registry resolving `binder-model`, and the root double. Returns the producer
 * deps + the captured-notes sink.
 */
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

// A two-required-string-param, `bind_context: session`, prompt-mode binder
// theta: two fields force a genuine binder pass (classifyBinderBypass →
// "binder"); `bind_context: session` + `mode: prompt` gate the session-context
// block that reaches the BNDR-9 unsafe pre-scan.
const SESSION_BINDER_THETA = [
  "---",
  "mode: prompt",
  "bind_model: binder-model",
  "bind_context: session",
  "params:",
  "  topic: string",
  "  audience: string",
  "---",
  "@`review ${topic} for ${audience}`",
  "",
].join("\n");

function sessionBinderTheta(): ThetaCompositionInput {
  const doc = parse(SESSION_BINDER_THETA);
  return {
    slashName: SLASH_NAME,
    sourcePath: "/theta/code-review.theta",
    frontmatter: doc.frontmatter!,
    body: doc.body,
    binderModel: "binder-model",
  };
}

/**
 * A `ctx` whose `sessionManager` yields a two-entry path — a leading `user`
 * message and a `custom_message` whose `customType` is transcript-unsafe.
 * `buildSessionContext` walks from `getLeafId()` ("e2") up the parentId chain
 * to the root, so the path is [e1(user), e2(custom)]; the custom entry projects
 * to a `role:"custom"` AgentMessage (dist createCustomMessage), which the
 * renderer's pre-scan rejects.
 */
function ctxWithUnsafeCustomEntry(): ExtensionCommandContext {
  const entries = [
    {
      type: "message",
      id: "e1",
      parentId: null,
      timestamp: "2024-01-01T00:00:00.000Z",
      message: { role: "user", content: "go", timestamp: 0 },
    },
    {
      type: "custom_message",
      id: "e2",
      parentId: "e1",
      timestamp: "2024-01-01T00:00:01.000Z",
      customType: UNSAFE_CUSTOM_TYPE,
      content: "body",
      display: true,
    },
  ];
  return {
    sessionManager: {
      getEntries: (): unknown[] => entries,
      getLeafId: (): string => "e2",
    },
  } as unknown as ExtensionCommandContext;
}

function noteChannelEntries(notes: readonly CapturedNote[]): CapturedNote[] {
  return notes.filter((n) => n.customType === SYSTEM_NOTE_CHANNEL);
}

describe("bug 0398 — custom-type-unsafe note carries details: { diagnostics: [Diagnostic] }", () => {
  it("emits exactly one theta-system-note and does not bind (BNDR-9 rejection reached)", async () => {
    const { deps, notes } = producerWithCapture();

    const result = await deps.runBinder({
      theta: sessionBinderTheta(),
      args: "the async module for the team",
      ctx: ctxWithUnsafeCustomEntry(),
    });

    // Guards the reach path: the unsafe pre-scan aborted binding (the theta does
    // not run) and produced exactly one note. If either fails the rig did not
    // reach `#emitCustomTypeUnsafeNote` and the details cells below are moot.
    expect(result.bound, "a BNDR-9 transcript-unsafe customType aborts binding").toBe(false);
    expect(
      noteChannelEntries(notes),
      "exactly one custom-type-unsafe note is emitted",
    ).toHaveLength(1);
  });

  it("details takes the group-B `diagnostics` arm carrying the registered diagnostic (RED today: { event: {} })", async () => {
    const { deps, notes } = producerWithCapture();

    await deps.runBinder({
      theta: sessionBinderTheta(),
      args: "the async module for the team",
      ctx: ctxWithUnsafeCustomEntry(),
    });

    const note = noteChannelEntries(notes)[0]!;

    // GREEN-direction (REDS today). `diagnostic-shape.md:20` partition — the
    // code registry routes `theta/runtime/custom-type-unsafe` through the
    // standard channel whose diagnostic shape is group-B `details: { diagnostics }`.
    // Today `#emitCustomTypeUnsafeNote` ships `{ event: {} }`, so this is
    // "event" → RED.
    expect(
      presentDetailsKey(note.details),
      "code-registry-runtime.md:43 routes this code through details: { diagnostics } (group-B)",
    ).toBe("diagnostics");

    // GREEN-direction: a single-element runtime batch (diagnostic-shape.md:7-14)
    // carrying the registered code, severity, and Message. Today details is
    // `{ event: {} }`, so `diagnostics` is undefined → these RED.
    const diagnostics = diagnosticsArm(note.details);
    expect(diagnostics, "single-element runtime batch (diagnostic-shape.md:14)").toHaveLength(1);
    const diag = diagnostics[0]!;
    expect(diag.code, "DIAG-1: the note carries its registered code").toBe(
      "theta/runtime/custom-type-unsafe",
    );
    expect(diag.severity, "code-registry-runtime.md:43 severity is E (error)").toBe("error");
    expect(diag.message, "the registry Message column, value rendered verbatim").toBe(
      `custom-message type is not transcript-safe: '${UNSAFE_CUSTOM_TYPE}'`,
    );

    // GREEN-direction: the note carries EXACTLY the conformant builder's output
    // — the wiring the bug says is missing (customTypeUnsafeDiagnostic has zero
    // production callers today).
    expect(
      diag,
      "the wired diagnostic deep-equals customTypeUnsafeDiagnostic(value)",
    ).toEqual(customTypeUnsafeDiagnostic(UNSAFE_CUSTOM_TYPE));

    // Closes a both-keys/disjointness hole: presentDetailsKey returns the
    // FIRST present key, so a payload carrying both `diagnostics` and `event`
    // would pass every assertion above while still violating the group-B
    // disjoint-by-key contract. Pin the whole details object, not just the
    // diagnostics arm.
    expect(
      note.details,
      "details is EXACTLY the group-B diagnostics arm — no stray `event` key (disjoint-by-key, runtime-event-channel.md:38)",
    ).toEqual({ diagnostics: [customTypeUnsafeDiagnostic(UNSAFE_CUSTOM_TYPE)] });
  });

  it("CONTROL: content bytes are the conformant template, untouched by the fix (green both directions)", async () => {
    // Bug §Fix constraint: content bytes stay untouched. Green today AND after
    // the fix — this locks the failure-mode-templates content so a details-only
    // fix cannot silently perturb the user-facing note.
    const { deps, notes } = producerWithCapture();

    await deps.runBinder({
      theta: sessionBinderTheta(),
      args: "the async module for the team",
      ctx: ctxWithUnsafeCustomEntry(),
    });

    const note = noteChannelEntries(notes)[0]!;
    expect(note.display, "the custom-type-unsafe note is display:true").toBe(true);
    // Byte-absoluteness of the rendered template is pinned by the companion
    // hard-coded literal in tests/bind-context-transcript.test.ts (`theta
    // /<name>: custom-message type is not transcript-safe: '<value>'`); this
    // cell proves the emitter still routes through that same renderer.
    expect(note.content).toBe(renderCustomTypeUnsafeNote(SLASH_NAME, UNSAFE_CUSTOM_TYPE));
  });
});
