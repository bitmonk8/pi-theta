import { describe, expect, it } from "vitest";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  parseThetaDocument,
  type EnumDecl,
  type ParseThetaDocumentDeps,
  type SchemaDecl,
  type ThetaDocument,
} from "../src/parser/theta-document";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import type { ThetaSource } from "../src/lexer/lexer";
import {
  composeThetaFixture,
  type BinderRunInput,
  type BinderRunResult,
  type ConversationBinding,
  type ConversationBindInput,
  type ThetaCompositionInput,
  type ThetaProducerDeps,
} from "../src/extension/theta-composition-producer";
import { fillDefaultsAndRevalidate } from "../src/binder/defaulting";
import {
  createEffectfulStatementHost,
  type EffectfulStatementHostDeps,
  type QueryHostDispatch,
} from "../src/runtime/effectful-statement-host";
import { buildEnvironment } from "../src/runtime/lexical-environment";
import type { BodyExecution, ExecuteBodyDeps } from "../src/runtime/statement-executor";
import type {
  CommittedConversationMutator,
  CommittedSurface,
} from "../src/runtime/terminal-outcomes";
import type { CodeSideToolCall, ToolLoweringSink } from "../src/runtime/tool-call-execute";
import type { InvokeChild } from "../src/runtime/invoke-cancellation";
import type { Checkpoint } from "../src/seams/checkpoint";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { QueryError } from "../src/runtime/query-error";
import { evaluateObjectMember } from "../src/runtime/stdlib-object";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import {
  makeEnumValue,
  makeOk,
  schemaTagOf,
  valuesEqual,
  type ResultValue,
  type ThetaValue,
} from "../src/runtime/value";

// Bug 0172, boundary 3 — binder `args` reach body scope through a cast, not a
// walk. `paramBindingsFrom` (`src/extension/theta-composition-producer.ts:90`)
// projects each merged-args entry with `bindings.set(name, value as ThetaValue)`
// (`:98`), so the AJV-validated payload IS the bound value: a `params:` field
// declared as a named `enum` reaches the body as a plain string, and one
// declared as a named `schema` reaches it unbranded and in the model's field
// order. `docs/spec_topics/runtime-value-model.md:34` closes the inbound
// boundary set at four with "binder `args`" among them, and states the rule
// once for all of them.
//
// WHICH PROJECTION THIS DRIVES. The PARENT side: `composeThetaFixture`'s `run`
// calls the binder, projects `binderResult.args` through `paramBindingsFrom`,
// and threads the result into the mode binding as `bindInput.paramBindings`.
// The captured `paramBindings` map is therefore exactly what the executor
// installs as the theta's top-level param slots. Everything below the capture
// is the shipped code: the theta's own `params.loweredSchema`
// (`src/parser/params.ts:431-441`, surfaced through
// `src/parser/frontmatter.ts:809`), the real `AjvSchemaValidator`, and the real
// `fillDefaultsAndRevalidate` (`src/binder/defaulting.ts:117`) whose merged
// `args` the production `runBinder` returns verbatim
// (`src/extension/production-theta-producer.ts:886`).
//
// THE CHILD SIDE IS NOW WITNESSED, ELSEWHERE (bug 0178).
// `tests/subagent-root-binder-model-exempt.test.ts`'s `penum` row drives a
// callee with `params: sev: Sev` whose body is `sev == Sev.High` across a real
// spawned child boundary and asserts `true` — which is
// `#intakeSubagentRootParams` (`src/extension/production-theta-producer.ts`)
// routing the marshalled JSON through `bindParamsInbound`
// (`src/runtime/inbound-boundary.ts`), reattaching the declaring-enum tag the
// same way the parent-side projection above does. THIS FILE still does not
// witness that leg: it is the offline unit tier over the PARENT-side
// projection (`composeThetaFixture`'s `run` binder step); the child-side leg
// is private to `ProductionThetaProducer#driveSubagentRootRegime` and needs a
// spawned process to observe, which only the other file's integration tier
// supplies.
//
// WHAT IS RED HERE AND WHY. Cells (a), (b) and (c) red on the cast: an untagged
// binding that compares `false` against the caller's own variant, an unbranded
// schema-typed binding, and that binding's model-ordered `keys()`. Every red is
// an assertion over a captured binding, never a compile or harness error. Cells
// (d) and (e) are controls, green on both sides.
//
// TIER: unit, offline, provider-free, deterministic. The observable is a map
// the producer builds before any conversation is driven; no higher tier makes
// it more visible, and no lower one reaches the projection.
//
// Spec: runtime-value-model.md:34 (§Wire-name translation, the inbound bullet
// and its four-boundary closing sentence), :13 (the enum row), :22 (the
// cross-type equality rule an untagged variant falls into); expressions.md:118
// (the declaration-order `keys()` clause bug 0120 owns).

// --- Substrate -------------------------------------------------------------

function makeParseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}

/**
 * The theta under test: one named-`enum` param and one named-`schema` param,
 * whose declaration order (`sev` before `who`) the binder payload below does
 * not use. The body carries the two declarations the `params:` types resolve
 * against and no tail, so driving it commits no effect and the captured
 * bindings are the whole observable.
 */
const SOURCE = [
  "---",
  "description: bind a typed param",
  "mode: prompt",
  "model: m",
  "params:",
  "  sev: Sev",
  "  box: Box",
  "---",
  'enum Sev { High = "high", Low = "low" }',
  "schema Box { sev: Sev, who: string }",
  "",
].join("\n");

function loadFixture(): ThetaDocument {
  const source: ThetaSource = { path: "binder-args.theta", bytes: new TextEncoder().encode(SOURCE) };
  const doc = parseThetaDocument(source, makeParseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `harness: the fixture theta did not load cleanly, so its \`params:\` block did not lower and ` +
        `no cell below drives the real binder document: ${JSON.stringify(errors)}`,
    );
  }
  if (doc.frontmatter === null) {
    throw new Error("harness: the fixture theta carries no parsed frontmatter");
  }
  return doc;
}

const DOC = loadFixture();
const SCHEMAS: readonly SchemaDecl[] = DOC.body.statements.filter(
  (s): s is SchemaDecl => s.kind === "schema",
);
const ENUMS: readonly EnumDecl[] = DOC.body.statements.filter(
  (s): s is EnumDecl => s.kind === "enum",
);

/** The theta's own lowered `params:` document — the one the binder already compiles. */
function loweredParams(): LoweredSchema {
  const lowered = DOC.frontmatter?.params?.loweredSchema;
  if (lowered === undefined) {
    throw new Error(
      "harness: the fixture's `params:` block produced no lowered schema, so there is no document " +
        "for AJV or for a translation plan",
    );
  }
  return lowered;
}

/** The production content-addressing of `src/extension/production-composition.ts:318`. */
function realAjv(): AjvSchemaValidator {
  return new AjvSchemaValidator({
    emit: (): void => {},
    slugOf: (schema: LoweredSchema): SchemaSlug => {
      const canonicalBytes = JSON.stringify(schema);
      return { slug: canonicalBytes, canonicalBytes };
    },
  });
}

/**
 * The binder-returned `args`, model-ordered inside the schema-typed field. This
 * is the shape a bind produces: the model answers the binder's tool call, its
 * object is merged with the declared defaults and re-validated, and the merged
 * object is what `runBinder` returns.
 */
function binderArgs(): Record<string, unknown> {
  return JSON.parse('{"sev":"high","box":{"who":"w","sev":"high"}}') as Record<string, unknown>;
}

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

const NOOP_SINK: ToolLoweringSink = {
  runtimeEvent(): void {},
  diagnostic(): void {},
  systemNote(): void {},
};

class InertMutator implements CommittedConversationMutator {
  truncate(): void {}
  rewrite(): void {}
  replace(): void {}
  remove(): void {}
  injectCompensatingTurn(_surface: CommittedSurface): void {}
}

/** Executor deps over the fixture's own body — declarations only, so no effect dispatches. */
function inertExecuteDeps(): ExecuteBodyDeps {
  const hostDeps: EffectfulStatementHostDeps = {
    checkpoint: NOOP_CHECKPOINT,
    signal: new AbortController().signal,
    sink: NOOP_SINK,
    file: "binder-args.theta",
    evaluatePure(): ThetaValue {
      throw new Error("harness: the fixture body is declarations only, with no pure tail");
    },
    resolveQuery(): QueryHostDispatch {
      throw new Error("harness: the fixture body issues no query");
    },
    resolveToolCall(): CodeSideToolCall {
      throw new Error("harness: the fixture body issues no tool call");
    },
    resolveInvoke(): InvokeChild {
      throw new Error("harness: the fixture body issues no invoke");
    },
  };
  return {
    env: buildEnvironment({ body: DOC.body }),
    host: createEffectfulStatementHost(hostDeps),
    checkpoint: NOOP_CHECKPOINT,
    signal: new AbortController().signal,
    mutator: new InertMutator(),
    mode: "prompt",
    file: "binder-args.theta",
  };
}

interface Capture {
  paramBindings: ReadonlyMap<string, ThetaValue> | undefined;
  mergedArgs: Readonly<Record<string, unknown>> | undefined;
  postMergeOk: boolean | undefined;
  errNotes: string[];
  panicNotes: string[];
}

/**
 * Drive `composeThetaFixture(...).run(...)` over producer deps whose binder step
 * is the REAL post-default-merge path (`fillDefaultsAndRevalidate` over the
 * theta's own lowered `params:` document and the real AJV) and whose prompt-mode
 * bind CAPTURES the `paramBindings` the producer projected.
 */
async function driveAndCapture(args: Record<string, unknown>): Promise<Capture> {
  const capture: Capture = {
    paramBindings: undefined,
    mergedArgs: undefined,
    postMergeOk: undefined,
    errNotes: [],
    panicNotes: [],
  };
  const theta: ThetaCompositionInput = {
    slashName: "bindargs",
    frontmatter: DOC.frontmatter!,
    body: DOC.body,
    sourcePath: "binder-args.theta",
  };
  const deps: ThetaProducerDeps = {
    runBinder(_input: BinderRunInput): Promise<BinderRunResult> {
      const merged = fillDefaultsAndRevalidate({
        binderArgs: args,
        // The fixture declares no `= <literal>` defaults: these cells isolate a
        // binder-supplied value at this boundary; the defaulted-field case is
        // owned by the ten-cell witness params-default-enum-access-merge.test.ts.
        defaults: [],
        validator: realAjv().compile(loweredParams()),
      });
      capture.mergedArgs = merged.args;
      capture.postMergeOk = merged.validation.ok;
      return Promise.resolve({ bound: true, args: merged.args });
    },
    bindPromptConversation(input: ConversationBindInput): ConversationBinding {
      capture.paramBindings = input.paramBindings;
      return {
        drivenAgainst: "prompt-user-session",
        executeDeps: inertExecuteDeps(),
        surface(_execution: BodyExecution): ResultValue {
          return makeOk(null);
        },
      };
    },
    spawnSubagentConversation(): Promise<ConversationBinding> {
      throw new Error("harness: the fixture is prompt-mode, so no subagent session is spawned");
    },
    emitTopLevelErrNote(_name: string, error: QueryError): void {
      capture.errNotes.push(JSON.stringify(error));
    },
    emitPanicNote(framing: string, _diagnostic: Diagnostic): void {
      capture.panicNotes.push(framing);
    },
  };
  const ctx = {} as unknown as ExtensionCommandContext;
  await composeThetaFixture(theta, deps).run("", ctx);
  return capture;
}

/** The captured bindings, failing loudly when the producer projected none. */
function bindingsOf(capture: Capture): ReadonlyMap<string, ThetaValue> {
  // A note on either channel means the dispatch ended somewhere other than the
  // bind, so a binding read below would describe a run that did not happen.
  if (capture.panicNotes.length > 0 || capture.errNotes.length > 0) {
    throw new Error(
      `harness: the dispatch surfaced notes instead of binding cleanly — panic ${JSON.stringify(
        capture.panicNotes,
      )} err ${JSON.stringify(capture.errNotes)}`,
    );
  }
  if (capture.postMergeOk !== true) {
    throw new Error(
      "harness: the post-default-merge AJV verdict was not ok, so the value the cells read never " +
        "passed the boundary the pass is specified to follow",
    );
  }
  if (capture.paramBindings === undefined) {
    throw new Error(
      "harness: the producer projected no `paramBindings`, so the parent-side binder-args " +
        "boundary was not reached",
    );
  }
  return capture.paramBindings;
}

/** One binding by name, failing loudly when the projection dropped it. */
function bindingOf(bindings: ReadonlyMap<string, ThetaValue>, name: string): ThetaValue {
  if (!bindings.has(name)) {
    throw new Error(
      `harness: no '${name}' binding reached body scope; the projection carried ${JSON.stringify([
        ...bindings.keys(),
      ])}`,
    );
  }
  return bindings.get(name) as ThetaValue;
}

describe("bug 0172 — binder args perform the inbound translation pass, parent side (runtime-value-model.md:34)", () => {
  it("(a) a params: field declared as a named enum reaches body scope as a TAGGED variant", async () => {
    const bindings = bindingsOf(await driveAndCapture(binderArgs()));
    const sev = bindingOf(bindings, "sev");

    expect(
      valuesEqual(sev, makeEnumValue("Sev", "high")),
      "runtime-value-model.md:34 — binder `args` is one of the four inbound boundaries, and the pass reattaches the declaring-enum tag 'so the resulting value compares equal to a locally constructed variant of the same enum'; the model's wire string is what the binder exists to turn into a variant",
    ).toBe(true);
    expect(
      valuesEqual(makeEnumValue("Sev", "high"), sev),
      "equality is symmetric, and only one of the two operands changes shape under the fix",
    ).toBe(true);
  });

  it("(b) a params: field declared as a named schema reaches body scope BRANDED", async () => {
    const bindings = bindingsOf(await driveAndCapture(binderArgs()));
    const box = bindingOf(bindings, "box");

    expect(
      schemaTagOf(box),
      "runtime-value-model.md:34 — a rebuilt object whose `$defs` entry names a declared schema is branded, so a bound param is indistinguishable from a constructor-built value on every surface `schemaTagOf` serves",
    ).toBe("Box");
    // The nested named-enum position is the same rule one level down: the pass
    // "recurses through arrays, nested object fields".
    expect(
      valuesEqual(
        (box as { readonly sev: ThetaValue }).sev,
        makeEnumValue("Sev", "high"),
      ),
      "runtime-value-model.md:34 — the walk recurses through nested object fields, so a named-enum FIELD of a schema-typed param is tagged at its own depth",
    ).toBe(true);
  });

  it("(c) a schema-typed binding's keys() are the schema's declaration order, not the binder payload's", async () => {
    const args = binderArgs();
    expect(
      Object.keys(args["box"] as object),
      "premise: the binder payload really orders `who` before `sev`, so a declaration-ordered binding cannot be a coincidence",
    ).toEqual(["who", "sev"]);
    const declared = SCHEMAS.find((decl) => decl.name === "Box")?.fields?.map((f) => f.name);
    expect(declared, "premise: `Box` declares `sev` before `who`").toEqual(["sev", "who"]);

    const bindings = bindingsOf(await driveAndCapture(args));
    const box = bindingOf(bindings, "box");

    expect(
      evaluateObjectMember(box as { readonly [k: string]: ThetaValue }, "keys", []),
      "expressions.md:118 — `keys()` on a named-schema value is declaration order; a bound param's provenance is the model, so the order it arrives in is the model's choice",
    ).toEqual(["sev", "who"]);
  });

  it("(d) CONTROL — the merged args validate ok against the theta's own lowered params document", async () => {
    // The premise every cell above rests on, and the ordering
    // runtime-value-model.md:34 fixes: the pass runs AFTER a verdict that was
    // already `ok`, over the document the boundary already compiles. Green on
    // both sides; this cell is not a red witness.
    expect(loweredParams()).toEqual({
      type: "object",
      properties: { sev: { $ref: "#/$defs/Sev" }, box: { $ref: "#/$defs/Box" } },
      required: ["sev", "box"],
      additionalProperties: false,
      $defs: {
        Sev: { type: "string", enum: ["high", "low"] },
        Box: {
          type: "object",
          properties: { sev: { $ref: "#/$defs/Sev" }, who: { type: "string" } },
          required: ["sev", "who"],
          additionalProperties: false,
        },
      },
    });
    expect(ENUMS.map((decl) => decl.name), "premise: `Sev` is a declared enum, not a schema alias").toEqual([
      "Sev",
    ]);

    const capture = await driveAndCapture(binderArgs());
    expect(capture.postMergeOk, "the post-default-merge AJV verdict admits the binder payload").toBe(
      true,
    );
    expect(capture.mergedArgs, "the merge preserves the binder's own values unchanged").toEqual({
      sev: "high",
      box: { who: "w", sev: "high" },
    });
  });

  it("(e) CONTROL — the dispatch binds and drives without a note on either channel", async () => {
    // A red above must be attributable to the projection, not to a
    // short-circuited binder or a defect surfaced as a note. Green on both
    // sides; this cell is not a red witness.
    const capture = await driveAndCapture(binderArgs());

    expect(capture.panicNotes, "no runtime defect was surfaced at the slash-dispatch boundary").toEqual(
      [],
    );
    expect(capture.errNotes, "no top-level Err note was emitted (SLSH-3)").toEqual([]);
    expect(
      [...bindingsOf(capture).keys()],
      "both declared params reach body scope; the projection drops none and invents none",
    ).toEqual(["sev", "box"]);
  });
});
