// RFC 0011 (V24a-T) — failing tests for the dispatch surface (the paired
// `V24a` implementation leaf), seam sheet §6.1 / §6.3 / §6.4 / §6.5 cells
// D11-D15.
//
// Spec: docs/rfcs/0011-session-control-tools.md §2 (Detailed design);
// `.localpi/tmp/rfc-0011-seam-sheet.md` §6.1 (classification), §6.3 (producer
// resolver + executor arm), §6.4 (runtime `par for` backstop), §6.5.
//
// HARNESS. This file drives the REAL production dispatch path —
// `createProductionProducerDeps` → `bindPromptConversation` → `executeBody`
// — over a hand-injected `CallableSetSnapshot` entry of kind `"runtime-tool"`
// (the seam sheet §3.1 union member; `src/parser/callable-set.ts` has not yet
// been widened to construct one, so the entry is injected via a type cast —
// the same posture `tests/helpers/tool-call-dispatch-harness.ts` already uses
// for hand-built `ResolvedCallable` entries). This is deliberate: it isolates
// the DISPATCH surface (§6.1/§6.3/§6.4, this file's subject) from the
// CALLABLE-SET RESOLUTION surface (§3, `tests/session-control-callable-set.
// test.ts`), so this file reds on dispatch behaviour even before `resolveEntry`
// itself is widened.
//
// TODAY'S REAL (pre-V24a) behaviour once a `kind: "runtime-tool"` entry is
// injected: `#classifyCall` only recognises `"theta"` (→ `"theta-callable"`)
// and answers `"pi-tool"` for everything else — including `"runtime-tool"`,
// since the third verdict does not exist yet. The call then falls to
// `#resolveToolCall`, whose `#resolvePiToolForTheta` returns `undefined` for
// a non-`"pi-tool"` entry, so the call resolves as an un-snapshotted name and
// (with no subagent-root regime active) mints the dispatch-time
// `Err(CodeToolError { cause: "unknown_tool" })` carrier WITHOUT ever calling
// `dispatch()` — never the adapter table, never the pinned `"execution"` /
// backstop message. Each test below asserts the POST-V24a pinned value, which
// is why it reds today on a real VALUE MISMATCH (never a throw, never a
// missing fixture, never a harness precondition) — except D15, which pins
// today's actual fallback behaviour and is GREEN AT BIRTH (stated per cell).
import { RecordingCheckpoint } from "./helpers/invoke-seam-scaffold";
import { parseDeps } from "./helpers/e2e-s1";
import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { ThetaSource } from "../src/lexer/lexer";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import { parseThetaDocument, type ThetaDocument } from "../src/parser/theta-document";
import { executeBody } from "../src/runtime/statement-executor";
import {
  createProductionProducerDeps,
} from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { CallableSetSnapshot, ResolvedCallable } from "../src/parser/callable-set";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import type { ResultValue, ThetaValue } from "../src/runtime/value";

// ---------------------------------------------------------------------------
// Shared parse + production harness (the b0369 / tool-call-dispatch-harness
// shape).
// ---------------------------------------------------------------------------

function parseTheta(src: string): ThetaDocument {
  const source: ThetaSource = { path: "session-control-dispatch.theta", bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `fixture failed to parse clean: ${errors.map((d) => `${d.code}: ${d.message}`).join("; ")}`,
    );
  }
  return doc;
}

/** A `CallableSetSnapshot` entry of the (not-yet-real) `"runtime-tool"` kind (seam sheet §3.1). */
function runtimeToolEntry(name: string): ResolvedCallable {
  return { kind: "runtime-tool", name } as unknown as ResolvedCallable;
}

function snapshotOf(entries: readonly (readonly [string, ResolvedCallable])[]): CallableSetSnapshot {
  return Object.freeze({ entries: new Map(entries) });
}

function rootDouble(checkpoint: Checkpoint): RuntimeRoot {
  return {
    checkpoint,
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
  } as unknown as RuntimeRoot;
}

type FakeSessionControlHosts = NonNullable<
  Parameters<typeof createProductionProducerDeps>[0]["sessionControlHosts"]
>;

// Sheet §6.5 D14 drives dispatch "with fake hosts": a compact host whose
// fire-and-forget call completes synchronously through `onComplete`, and a
// pi handle with the two session-name members. D15 deliberately omits them
// to pin the absent-dep fallback. `calls`, when supplied, counts `compact`
// invocations (D11: the net's refusal must leave that count at zero) without
// altering D14's own no-arg call shape.
function fakeSessionControlHosts(calls?: { compact: number }): FakeSessionControlHosts {
  return {
    ctx: {
      compact: (options) => {
        if (calls !== undefined) {
          calls.compact += 1;
        }
        options?.onComplete?.({
          summary: "fake summary",
          firstKeptEntryId: "entry-1",
          tokensBefore: 10,
          estimatedTokensAfter: 5,
        });
      },
      getContextUsage: () => undefined,
    },
    piHandle: {
      setSessionName: () => {},
      getSessionName: () => undefined,
    },
  };
}

function producer(checkpoint: Checkpoint, hosts?: FakeSessionControlHosts) {
  return createProductionProducerDeps({
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root: rootDouble(checkpoint),
    modelRegistry: {} as unknown as ModelRegistry,
    ...(hosts !== undefined ? { sessionControlHosts: hosts } : {}),
  });
}

async function runSource(
  src: string,
  callableSet: CallableSetSnapshot,
  checkpoint: Checkpoint = new RecordingCheckpoint(),
  hosts?: FakeSessionControlHosts,
): Promise<ThetaValue> {
  const doc = parseTheta(src);
  const theta: ThetaCompositionInput = {
    slashName: "session-control-dispatch",
    sourcePath: "/proj/session-control-dispatch.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
    callableSet,
  };
  const bindInput: ConversationBindInput = {
    theta,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  };
  const binding = producer(checkpoint, hosts).bindPromptConversation(bindInput);
  const execution = await executeBody(theta.body, binding.executeDeps);
  if (!execution.result.present || execution.result.value === undefined) {
    throw new Error("body produced no final value");
  }
  return execution.result.value;
}

function asResult(value: ThetaValue): ResultValue {
  return value as ResultValue;
}

// ===========================================================================
// D11 — the resolver's runtime argument net (§5.4, `#resolveRuntimeToolCall`
// in `src/extension/production-theta-producer.ts`): a runtime-tool argument
// the static pass CANNOT prove must still be judged at dispatch, and a
// non-string bound value draws the pinned validation `Err` — the host adapter
// is never reached.
//
// The laundering construct is the seam sheet's own §5.5 row P6:
// `compact({ instructions: "x" })`. The single argument is a bare object
// literal, so `#resolveRuntimeToolCall`'s positional `expr.args.map(a =>
// evaluatePureExpression(a, env))` binds the WHOLE object as the sole
// argument value, never decomposing it into named fields — the presence of a
// same-spelled string field inside does not make the bound value a string.
// Statically, `collectProvableArgTypes`'s `"object"` arm
// (`src/extension/invoke-static-checks.ts`) answers `undefined` (an object
// literal is withheld from `checkRuntimeToolCallSurface`'s type-mismatch
// check exactly as an `ident` or bare `call` is), so no
// `theta/parse/tool-arg-type-mismatch` fires — the mismatch surfaces only at
// the runtime net, which is this cell's subject.
// ===========================================================================

describe("session-control-dispatch (V24a-T) — runtime argument net (D11)", () => {
  it("D11: compact({ instructions: \"x\" }) launders a non-string bound value past statics; the net refuses it before the host is reached", async () => {
    const src = [
      "---",
      "mode: prompt",
      "tools: compact",
      "---",
      'compact({ instructions: "x" })',
    ].join("\n");

    const checkpoint = new RecordingCheckpoint();
    const calls = { compact: 0 };
    const callableSet = snapshotOf([["compact", runtimeToolEntry("compact")]]);
    const value = await runSource(src, callableSet, checkpoint, fakeSessionControlHosts(calls));
    const result = asResult(value);

    expect(
      checkpoint.kinds.length > 0 && checkpoint.kinds.every((k) => k === "tool-call"),
      "D11: a tool-call checkpoint still fires ahead of the net's refusal",
    ).toBe(true);

    expect(
      result.ok,
      "D11 primary: the runtime argument net refuses a non-string bound value",
    ).toBe(false);
    if (!result.ok) {
      const error = result.error as { cause: string; tool_name: string; message: string };
      expect(error.cause).toBe("validation");
      expect(error.tool_name).toBe("compact");
      expect(error.message).toBe("argument 'instructions' must be a string");
    }

    expect(
      calls.compact,
      "D11: the fake host's compact() was never invoked — the net stands ahead of dispatch",
    ).toBe(0);
  });
});

// ===========================================================================
// D12 / D13 — the runtime `par for` backstop (§6.4): a plain `fn` calling a
// declared runtime tool, invoked from a `par for` body, must yield
// `Err(cause "execution", "session-control tool '<name>' is not available
// inside a par for body")` for that element WITHOUT the fake host ever being
// reached — never fall through to the ordinary (mis-targeted) dispatch ladder.
// ===========================================================================


describe("session-control-dispatch (V24a-T) — runtime par-for backstop (D12/D13)", () => {
  it("D12: fn h() { compact() } called from `par for` yields the pinned backstop Err for that element", async () => {
    const src = [
      "---",
      "mode: prompt",
      "tools: compact",
      "---",
      "fn h() {",
      "  compact()",
      "}",
      "",
      "par for i in [1] {",
      "  h()",
      "}",
    ].join("\n");

    const callableSet = snapshotOf([["compact", runtimeToolEntry("compact")]]);
    const value = await runSource(src, callableSet);

    // par for's value is array<Result>; element 0 is h()'s call outcome.
    const elements = value as readonly ThetaValue[];
    const element0 = asResult(elements[0] as ThetaValue);

    expect(element0.ok, "D12 primary: the par-for element must be an Err").toBe(false);
    if (!element0.ok) {
      const error = element0.error as { cause: string; message: string };
      expect(error.cause).toBe("execution");
      expect(error.message).toBe(
        "session-control tool 'compact' is not available inside a par for body",
      );
    }
  });

  it("D13: `compact as c` declared; fn h() { c() } from `par for` renders the presented name 'c'", async () => {
    const src = [
      "---",
      "mode: prompt",
      "tools: compact as c",
      "---",
      "fn h() {",
      "  c()",
      "}",
      "",
      "par for i in [1] {",
      "  h()",
      "}",
    ].join("\n");

    const callableSet = snapshotOf([["c", runtimeToolEntry("compact")]]);
    const value = await runSource(src, callableSet);
    const elements = value as readonly ThetaValue[];
    const element0 = asResult(elements[0] as ThetaValue);

    expect(element0.ok, "D13 primary").toBe(false);
    if (!element0.ok) {
      const error = element0.error as { cause: string; message: string };
      expect(error.cause).toBe("execution");
      expect(error.message).toBe(
        "session-control tool 'c' is not available inside a par for body",
      );
    }
  });
});

// ===========================================================================
// D14 — full top-level dispatch (no `par for`): the checkpoint fires before
// dispatch AND the value binds the adapter's Ok(record) — never the
// mis-targeted "unknown_tool" carrier.
// ===========================================================================

describe("session-control-dispatch (V24a-T) — full top-level dispatch (D14)", () => {
  // The sheet's own D14 cell writes `compact("k")` with a positional string
  // argument. `checkLexicalCallSites` (§5.1) treats EVERY bare `tools:` entry
  // as pi-tool-SHAPED for the bare-object-literal carve-out purposes today
  // (`resolvesToPiTool` keys off frontmatter presence alone, not the eventual
  // `"runtime-tool"` kind) — so a direct positional argument on a declared
  // runtime tool currently draws `theta/parse/tool-arg-not-object-literal`, a
  // SEPARATE (§5.1-scoped) admission V24a must also land. Exercising that
  // gap is not this file's subject (S4 dispatch), so this cell uses the
  // zero-arg call `compact()` (the default-instructions arm) to isolate the
  // DISPATCH observable from the unrelated pending parse-layer admission.
  it("D14: compact() at top level fires the tool-call checkpoint and binds Ok(record) (not unknown_tool)", async () => {
    const src = ["---", "mode: prompt", "tools: compact", "---", "compact()"].join("\n");

    const checkpoint = new RecordingCheckpoint();
    const callableSet = snapshotOf([["compact", runtimeToolEntry("compact")]]);
    const value = await runSource(src, callableSet, checkpoint, fakeSessionControlHosts());
    const result = asResult(value);

    // The checkpoint-first discipline already holds today (real production
    // code fires it before every dispatch disposition, including
    // unknown_tool) — the mismatch this cell reds on is the VALUE, not the
    // checkpoint.
    expect(
      checkpoint.kinds.length > 0 && checkpoint.kinds.every((k) => k === "tool-call"),
      "D14: a tool-call checkpoint fires before dispatch",
    ).toBe(true);

    expect(result.ok, "D14 primary: dispatch must reach the adapter table, not the unknown_tool ladder").toBe(
      true,
    );
  });
});

// ===========================================================================
// D15 — harness deps WITHOUT `resolveRuntimeToolCall`: the arm is skipped and
// the call falls through to the existing `unknown_tool` carrier. This IS
// today's real (and, post-V24a, still-correct) fallback: no
// `resolveRuntimeToolCall` field exists anywhere yet, so every dispatch today
// already takes this path. GREEN AT BIRTH (stated per the RFC 0011 Phase 3
// builder contract: a witness cell may be green when it pins current,
// intentionally-preserved behaviour).
// ===========================================================================

describe("session-control-dispatch (V24a-T) — absent resolveRuntimeToolCall falls through (D15, green at birth)", () => {
  it("D15: with no resolveRuntimeToolCall wired, dispatch falls through to the unknown_tool carrier, fail-closed", async () => {
    const src = ["---", "mode: prompt", "tools: compact", "---", "compact()"].join("\n");
    const callableSet = snapshotOf([["compact", runtimeToolEntry("compact")]]);
    const value = await runSource(src, callableSet);
    const result = asResult(value);

    expect(result.ok, "D15: fail-closed, never a fabricated value").toBe(false);
    if (!result.ok) {
      const error = result.error as { cause: string };
      expect(error.cause).toBe("unknown_tool");
    }
  });
});
