import { describe, expect, it } from "vitest";

// Bug 0409 — an `invoke(...)` / `.theta`-callable call that legally OMITS a
// trailing defaulted param binds `null` in the param's place: the callee's
// `system:` template renders the four bytes `null` where the declared default
// was promised, and the marshalled `{p: null}` then either fails the child's
// non-nullable schema intake (a spec-legal call refused fail-closed) or
// silently discards the default (a nullable param). Two `?? null` seams
// conflate "argument omitted" with "argument is null":
//
//   - src/extension/production-theta-producer.ts:4035 — the `invoke(...)`
//     binding walk inside `#driveCallee` (production-theta-producer.ts:3962):
//       `paramBindings.set(name, argValues[index] ?? null)`
//     stuffs `null` into each omitted (defaulted) trailing slot; no default
//     recovery runs on this path (`#recoverDeclaredDefaults`, production-theta-producer.ts:1542, is
//     binder-dispatch-only). The null-stuffed map is what the spawn renders
//     into `--system-prompt` (production-theta-producer.ts:2197) and marshals onto `PI_THETA_PARAMS`
//     (production-theta-producer.ts:2381), so the fabrication is observable end-to-end on the launch.
//   - src/extension/production-theta-producer.ts:6442 — the model-driven
//     `.theta`-callable trampoline `lowerModelDrivenThetaCall`:
//       `spec.paramOrder.map((name) => (args[name] ?? null) as ThetaValue)`
//     fabricates the same `null` when a model omits a defaulted arg, so the
//     positional `argValues` the callee is driven with cannot distinguish
//     absence from an explicit `null`.
//
// EXPECTED behaviour (this file's assertions, per §Expected behaviour / §Fix):
// an OMITTED param (a presence check, NEVER `??`) recovers the DECLARED default
// via `#recoverDeclaredDefaults`; an in-range value — INCLUDING an explicit
// `null` — is bound as-is. So `system: 'Lang: ${p}'` with `p: 'string = "x"'`
// omitted must render `Lang: x` and marshal `{"p":"x"}`, while the model
// trampoline must hand the callee `undefined` (honest absence) for an omitted
// slot so `#driveCallee` can recover the default.
//
// RED-FOR-RIGHT-REASON (Observed at the fork = the bug symptom; Fixed = pinned):
//   (a) OMIT→DEFAULT  invoke omit `p:string="x"`  render "Lang: null" / {"p":null}
//                                                  -> "Lang: x"       / {"p":"x"}
//   (c) MODEL OMIT    lowerModelDriven({a},[a,b])  argValues ["A", null]
//                                                  -> ["A", undefined]
//   Controls GREEN at the fork AND after: a supplied non-null arg binds as-is;
//   an explicit `null` for a nullable param stays `null` on the invoke path and
//   the model path; the face-2 AJV repro shows the refusal is parent-made.
//
// TIER — unit, offline, deterministic, provider-free. The whole contract
// settles inside one `bindPromptConversation` + `executeBody` invoke drive over
// a FAKE child launcher (`makeFakeJsonChildLauncher`), the exported pure
// `lowerModelDrivenThetaCall`, and the production `AjvSchemaValidator` — no
// provider, no real `pi` process. The parent-side `?? null` fabrication is
// fully determined by producer code, so an integration test would re-drive
// discovery to reach the same seam and witness nothing further, and a live test
// would add a real model/child for a value the parent forges before either is
// consulted. (The b0316 in-process executor pattern; the binder-post-merge
// real-AJV `rootDouble` pattern.)
//
// NO SILENT SKIPPING: the fixture `readBytes` REJECTS any unregistered path
// (so `#recoverDeclaredDefaults` re-reading the callee source can never read an
// empty buffer silently), `parse` fails LOUDLY on any error-severity diagnostic
// (a refused parse is a harness breach, not a pass), and `waitFor` throws
// naming the unmet precondition when a spawn or a stdout subscription never
// arrives (never an early return).

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { ThetaSource } from "../src/lexer/lexer";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher, ParsedFrontmatter } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type ThetaDocument,
} from "../src/parser/theta-document";
import { executeBody } from "../src/runtime/statement-executor";
import {
  createProductionProducerDeps,
  lowerModelDrivenThetaCall,
  type ModelDrivenThetaCall,
} from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import { fakeExecutableHost, makeFakeJsonChildLauncher } from "./helpers/fake-json-child";
import { SUBAGENT_PARAMS_ENV } from "../src/runtime/subagent-params";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import { productionSchemaSlugOf } from "../src/extension/production-composition";
import { makeOk, type ResultValue, type ThetaValue } from "../src/runtime/value";

// ===========================================================================
// Shared parse + production-executor harness.
// ===========================================================================

function parseDeps(): ParseThetaDocumentDeps {
  return {
    systemNote: {
      pi: { sendMessage: (): void => {} },
      ui: { notify: (): void => {} },
      emitDiagnostic: (): void => {},
    } as unknown as SystemNoteChannelDeps,
    modelMatcher: { resolve: (): "resolved" => "resolved" } as ModelReferenceMatcher,
  };
}

/** Parse `.theta` source, failing LOUDLY on any error-severity diagnostic. */
function parse(path: string, src: string): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `fixture ${path} failed to parse: ${errors.map((d) => `${d.code}: ${d.message}`).join("; ")}`,
    );
  }
  return doc;
}

/** The production AJV validator, content-addressed exactly as production. */
function realAjvValidator(): AjvSchemaValidator {
  return new AjvSchemaValidator({
    emit: (): void => {},
    slugOf: (schema: LoweredSchema): SchemaSlug => productionSchemaSlugOf(schema),
  });
}

/**
 * A runtime root sufficient for a subagent spawn + an invoke-path default
 * recovery: noop checkpoint, deterministic ids, wall-clock zero, the REAL AJV
 * validator, and an in-memory fs serving the callee `.theta` SOURCE by
 * `sourcePath`. An unregistered path REJECTS loudly — `#recoverDeclaredDefaults`
 * (production-theta-producer.ts:1542) re-reads the callee source to re-parse
 * each declared default, so a silent empty read would let a recovery failure
 * masquerade as a clean bind.
 */
function rootDouble(fixtures: ReadonlyMap<string, string>): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: {
      wallNow: (): number => 0,
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    },
    schemaValidator: realAjvValidator(),
    fileSystem: {
      readBytes: (path: string): Promise<Uint8Array> => {
        const src = fixtures.get(path);
        return src !== undefined
          ? Promise.resolve(new TextEncoder().encode(src))
          : Promise.reject(new Error(`fixture fs: no source registered for ${path}`));
      },
    },
  } as unknown as RuntimeRoot;
}

/** A resolved-model + cwd command ctx (PIC-62 pre-spawn model guard needs a model). */
function ctxDouble(): ExtensionCommandContext {
  return {
    model: { id: "claude-test", provider: "anthropic" },
    cwd: "/tmp",
    signal: undefined,
  } as unknown as ExtensionCommandContext;
}

/** Poll until `fn` yields a defined value; throw LOUDLY on budget exhaustion. */
async function waitFor<T>(fn: () => T | undefined, label: string, budgetMs = 5000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = fn();
    if (value !== undefined) {
      return value;
    }
    if (Date.now() - start > budgetMs) {
      throw new Error(`precondition never met within ${budgetMs}ms: ${label}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** The `--system-prompt` argv value (subagent-launcher.ts:452-453). */
function systemPromptArg(args: readonly string[]): string {
  const idx = args.indexOf("--system-prompt");
  if (idx < 0 || idx + 1 >= args.length) {
    throw new Error("the spawn argv carried no `--system-prompt` — harness precondition breach");
  }
  return args[idx + 1] as string;
}

/**
 * The SUBAG-1 rendered system text: the launcher prefixes a semantically-inert
 * leading newline (subagent-launcher.ts:453) to defeat both hosts' file-read
 * coercion; strip it so the assertion is over the rendered `system:` template
 * itself (`Lang: <p>`), not the launch framing.
 */
function renderedSystem(args: readonly string[]): string {
  return systemPromptArg(args).replace(/^\n/, "");
}

/** The marshalled `PI_THETA_PARAMS` record (subagent-params.ts:40, marshalParams). */
function marshalledParams(env: Record<string, string | undefined>): Record<string, unknown> {
  const raw = env[SUBAGENT_PARAMS_ENV];
  if (raw === undefined) {
    throw new Error("the spawn env carried no `PI_THETA_PARAMS` — harness precondition breach");
  }
  return JSON.parse(raw) as Record<string, unknown>;
}

/** A parsed callee `ThetaCompositionInput` from in-memory `.theta` source. */
function calleeInput(sourcePath: string, slashName: string, src: string): ThetaCompositionInput {
  const doc = parse(sourcePath, src);
  return { slashName, sourcePath, frontmatter: doc.frontmatter as ParsedFrontmatter, body: doc.body };
}

interface CapturedSpawn {
  readonly system: string;
  readonly params: Record<string, unknown>;
}

/**
 * Drive a prompt-mode caller whose sole body is one `invoke(...)` of a
 * subagent-mode callee (the prompt→subagent "spawn fresh" branch of
 * `#driveCallee`, production-theta-producer.ts:3962), over a fake child launcher, and capture the child's
 * launch inputs. The launch is EAGER (initiated inside `spawnSubagentConversation`
 * before its `drive()` awaits the envelope), so the spawn record exists before
 * the invoke settles; feed the child a terminal `Ok` envelope once its `drive()`
 * has subscribed so the parent invoke — and `executeBody` — settle.
 */
async function driveInvokeCaptureSpawn(
  callerBody: string,
  callee: ThetaCompositionInput,
  calleeSource: string,
): Promise<CapturedSpawn> {
  const launcher = makeFakeJsonChildLauncher();
  const deps = createProductionProducerDeps({
    pi: { sendMessage: (): void => {} } as unknown as ExtensionAPI,
    root: rootDouble(new Map([[callee.sourcePath as string, calleeSource]])),
    modelRegistry: {} as unknown as ModelRegistry,
    parseCallee: () => Promise.resolve({ kind: "ok" as const, input: callee }),
    subagentSpawn: launcher.spawn,
    subagentExecutableHost: fakeExecutableHost(),
    subagentParentEnv: {},
    subagentParentPid: 4242,
  });

  const callerDoc = parse("/callees/caller.theta", ["---", "mode: prompt", "---", callerBody, ""].join("\n"));
  const theta: ThetaCompositionInput = {
    slashName: "caller",
    sourcePath: "/callees/caller.theta",
    frontmatter: callerDoc.frontmatter as ParsedFrontmatter,
    body: callerDoc.body,
  };
  const bindInput: ConversationBindInput = { theta, args: "", ctx: ctxDouble() };
  const binding = deps.bindPromptConversation(bindInput);

  const execution = executeBody(theta.body, binding.executeDeps);
  const spawn = await waitFor(() => launcher.spawns[0], "the caller's `invoke` spawned a child");
  // Wait for the production `drive()` to subscribe to the child's stdout before
  // emitting: the fake child does NOT replay a prior stdout line to a late
  // subscriber, so emitting before subscription would be lost and hang the drive.
  await waitFor(
    () => (spawn.child.stdoutListenerCount > 0 ? true : undefined),
    "the child's `drive()` subscribed to stdout",
  );
  const captured: CapturedSpawn = {
    system: renderedSystem(spawn.args),
    params: marshalledParams(spawn.env),
  };
  spawn.child.emitOkEnvelope("CHILD-DONE");
  const result = await execution;
  expect(result.outcome, "the invoke drive must settle to success once the child envelope lands").toBe(
    "success",
  );
  return captured;
}

// The non-nullable defaulted callee: an omitted `p` must recover `"x"`.
const CHILD_NONNULLABLE_PATH = "/callees/child.theta";
const CHILD_NONNULLABLE_SRC = [
  "---",
  "mode: subagent",
  "system: 'Lang: ${p}'",
  "params:",
  `  p: 'string = "x"'`,
  "---",
  '"CHILD-DONE"',
  "",
].join("\n");

// The nullable defaulted callee: an EXPLICIT `null` must stay `null` (control).
const CHILD_NULLABLE_PATH = "/callees/nchild.theta";
const CHILD_NULLABLE_SRC = [
  "---",
  "mode: subagent",
  "system: 'Lang: ${p}'",
  "params:",
  `  p: 'string | null = "x"'`,
  "---",
  '"CHILD-DONE"',
  "",
].join("\n");

// ===========================================================================
// Arm (a) — OMIT→DEFAULT on the `invoke(...)` path (production-theta-producer.ts:4035).
// ===========================================================================

describe("bug 0409 (a) — an omitted defaulted `invoke` arg recovers the declared default", () => {
  it("RED (a): `invoke(\"./child.theta\")` renders `Lang: x` and marshals `{p:\"x\"}`, not `null`", async () => {
    const captured = await driveInvokeCaptureSpawn(
      'invoke("./child.theta")',
      calleeInput(CHILD_NONNULLABLE_PATH, "child", CHILD_NONNULLABLE_SRC),
      CHILD_NONNULLABLE_SRC,
    );

    // §Expected: the `system:` render resolves against the validated params
    // object, which for an omitted defaulted slot carries the declared default.
    // RED at the fork: `argValues[index] ?? null` (production-theta-producer.ts:4035) stuffs `null`, so the
    // spawn renders `Lang: null` (the union/string-row coercion of `null`).
    expect(
      captured.system,
      "the child `--system-prompt` must render the declared default `x`, not the fabricated `null`",
    ).toBe("Lang: x");

    // Face 2: the marshalled record the child validates against its lowered
    // non-nullable `{p:{type:string}}` schema. RED at the fork: `{"p":null}`,
    // which the child intake refuses ("must be string") — a spec-legal call
    // turned into a fail-closed refusal. Omitting the KEY would validate.
    expect(
      captured.params,
      "the marshalled `PI_THETA_PARAMS` must carry the recovered default, not a `null` the non-nullable schema refuses",
    ).toEqual({ p: "x" });
  });

  it("GREEN (a-control): a supplied non-null arg binds as-is (`Lang: hi` / `{p:\"hi\"}`)", async () => {
    // The byte-identical neighbour of the RED cell — same callee, one supplied
    // positional — proving the divergence is the OMISSION, not the harness.
    const captured = await driveInvokeCaptureSpawn(
      'invoke("./child.theta", "hi")',
      calleeInput(CHILD_NONNULLABLE_PATH, "child", CHILD_NONNULLABLE_SRC),
      CHILD_NONNULLABLE_SRC,
    );
    expect(captured.system, "a supplied arg binds as-is now and after").toBe("Lang: hi");
    expect(captured.params).toEqual({ p: "hi" });
  });
});

// ===========================================================================
// Arm (b) — EXPLICIT NULL STAYS NULL (controls, GREEN at the fork AND after).
// ===========================================================================

describe("bug 0409 (b) — an explicit `null` is bound as-is, untouched by the fix", () => {
  it("GREEN (b-invoke): `invoke(\"./nchild.theta\", null)` stays `Lang: null` / `{p:null}`", async () => {
    // The nullable param's lowered schema is `{p:{type:["string","null"]}}`, so
    // the explicit `null` validates and the default is legitimately NOT applied.
    // The fix binds an in-range value (including `null`) as-is, so this stays
    // GREEN — it proves the fix touches only the OMISSION, never a passed `null`.
    const captured = await driveInvokeCaptureSpawn(
      'invoke("./nchild.theta", null)',
      calleeInput(CHILD_NULLABLE_PATH, "nchild", CHILD_NULLABLE_SRC),
      CHILD_NULLABLE_SRC,
    );
    expect(captured.system, "an explicit null stays null on the invoke path").toBe("Lang: null");
    expect(captured.params).toEqual({ p: null });
  });

  it("GREEN (b-model): `lowerModelDrivenThetaCall({p: null}, [p])` preserves the explicit `null`", async () => {
    // The model path's control: a model that PASSES `null` for `p` must drive
    // the callee with `[null]`. `null ?? null` is `null` at the fork, and the
    // presence-check fix keeps it `null`, so this is GREEN both sides — the fix
    // distinguishes absence from `null`, it does not rewrite `null`.
    const driven: { argValues: readonly (ThetaValue | undefined)[] }[] = [];
    const spec: ModelDrivenThetaCall = {
      paramOrder: ["p"],
      driveCallee: (argValues): Promise<ResultValue> => {
        driven.push({ argValues });
        return Promise.resolve(makeOk("X"));
      },
      onSetupThrow: (thrown) => ({ text: String(thrown), isError: true }),
    };
    await lowerModelDrivenThetaCall({ p: null }, spec, new AbortController().signal);
    expect(driven[0]!.argValues, "an explicit null is preserved on the model path").toEqual([null]);
  });
});

// ===========================================================================
// Arm (c) — MODEL-TRAMPOLINE OMISSION (production-theta-producer.ts:6442).
// ===========================================================================

describe("bug 0409 (c) — an omitted model argument is recorded as absent, not null", () => {
  it("RED (c): `lowerModelDrivenThetaCall({a:\"A\"}, [a,b])` drives `[\"A\", undefined]`, not `[\"A\", null]`", async () => {
    // §Fix (c): the trampoline (production-theta-producer.ts:6442 `args[name] ?? null`) must hand the callee
    // honest ABSENCE (`undefined`) for an omitted slot so `#driveCallee` can
    // recover the callee's declared default — `??` conflated omitted with null,
    // so the callee could never tell the two apart and the default was dead.
    const driven: { argValues: readonly (ThetaValue | undefined)[] }[] = [];
    const spec: ModelDrivenThetaCall = {
      paramOrder: ["a", "b"],
      driveCallee: (argValues): Promise<ResultValue> => {
        driven.push({ argValues });
        return Promise.resolve(makeOk("X"));
      },
      onSetupThrow: (thrown) => ({ text: String(thrown), isError: true }),
    };
    await lowerModelDrivenThetaCall({ a: "A" }, spec, new AbortController().signal);

    // RED at the fork: `["A", null]` (the `?? null` fabrication for the omitted `b`).
    expect(
      driven[0]!.argValues[1],
      "the omitted trailing slot must be honest absence (`undefined`), not a fabricated `null`",
    ).toBeUndefined();
    expect(
      driven[0]!.argValues,
      "declaration order is preserved and the omitted slot is `undefined`",
    ).toEqual(["A", undefined]);
  });

  it("GREEN (c-control): both model arguments supplied drive `[\"A\", \"B\"]`", async () => {
    const driven: { argValues: readonly (ThetaValue | undefined)[] }[] = [];
    const spec: ModelDrivenThetaCall = {
      paramOrder: ["a", "b"],
      driveCallee: (argValues): Promise<ResultValue> => {
        driven.push({ argValues });
        return Promise.resolve(makeOk("X"));
      },
      onSetupThrow: (thrown) => ({ text: String(thrown), isError: true }),
    };
    await lowerModelDrivenThetaCall({ a: "A", b: "B" }, spec, new AbortController().signal);
    expect(driven[0]!.argValues, "supplied model args map positionally now and after").toEqual([
      "A",
      "B",
    ]);
  });
});

// ===========================================================================
// Face-2 direct repro — the child-intake refusal is PARENT-manufactured.
// GREEN diagnostic at the fork: it pins that the lowered non-nullable schema
// refuses the fabricated `{p:null}` while ADMITTING both the omitted key and
// the recovered default, so the fail-closed refusal is caused by the parent's
// key-stuffing (production-theta-producer.ts:4035), never by the omission itself.
// ===========================================================================

describe("bug 0409 face-2 — the lowered non-nullable schema refuses only the fabricated null", () => {
  it("GREEN: production lowered schema + real AJV refuses `{p:null}` but admits `{}` and `{p:\"x\"}`", () => {
    const doc = parse(CHILD_NONNULLABLE_PATH, CHILD_NONNULLABLE_SRC);
    const lowered = (doc.frontmatter as ParsedFrontmatter).params!.loweredSchema as LoweredSchema;
    // The lowered document AJV compiles, exactly as the child intake compiles it.
    expect(lowered, "the defaulted field is omitted from `required`").toEqual({
      type: "object",
      properties: { p: { type: "string" } },
      required: [],
      additionalProperties: false,
    });

    const validator = realAjvValidator().compile(lowered);
    // The fabricated `{p:null}` — what the fork marshals for the omitted slot —
    // is refused: this refusal is what fails a spec-legal call fail-closed.
    const nullVerdict = validator.validate({ p: null });
    expect(nullVerdict.ok, "`{p:null}` is refused by the non-nullable lowered schema").toBe(false);
    if (!nullVerdict.ok) {
      expect(nullVerdict.errors[0]?.instancePath).toBe("/p");
      expect(nullVerdict.errors[0]?.message).toBe("must be string");
    }
    // Omitting the KEY validates — proving the refusal is manufactured by the
    // parent's key-stuffing, not by the omission.
    expect(validator.validate({}).ok, "`{}` (the omitted key) validates").toBe(true);
    // The recovered default validates — the value the fix marshals instead.
    expect(validator.validate({ p: "x" }).ok, "the recovered default `{p:\"x\"}` validates").toBe(
      true,
    );
  });
});
