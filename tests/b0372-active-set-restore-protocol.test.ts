// Bug 0372 — the PIC-8/PIC-19-compliant active-set gate (`withActiveSetGate`,
// src/runtime/tool-registration.ts:119) has no production caller: every shipped
// prompt-mode snapshot/restore window restores through a BARE `finally`, so a
// restore throw masks the query's outcome, gets no single re-attempt, and emits
// neither `theta/runtime/active-set-restore-failed` nor the mandated display
// note — leaving the theta's install vector active on the user session with
// zero diagnostics.
//
// docs/bugs/0372-pic8-restore-protocol-orphaned.md (the spec). §Fix Option 1
// (parent-adjudicated): replace the bare `withActiveSetGating`
// (src/runtime/conversation-drive.ts:84, bare step-4 restore at :102) with the
// compliant `withActiveSetGate` at ALL THREE shipped windows, threading
// `emitDiagnostic` / `emitSystemNote` / `routeInternalError` / thetaName deps:
//   1. the producer prompt-mode query window —
//      src/extension/production-theta-producer.ts:5218
//      (`await withActiveSetGating(this.#pi, install, …)`), inside
//      `#driveUserVisibleTurn`;
//   2. `runPromptSuspendInvoke` — src/runtime/invoke-prompt-suspend.ts:99
//      (EXPORTED), snapshot :112, install :114, bare restore in `finally` :123;
//      caller production-theta-producer.ts:3938;
//   3. the `driveStreamedUserTurn` inline window —
//      production-theta-producer.ts:6667, snapshot/install :6712/:6713, bare
//      restore in `finally` :6772.
//
// The compliant target contract these cells re-assert (but at the PRODUCTION
// composition, end-to-end / at the EXPORTED cross-mode seam) is pinned in
// isolation by tests/tool-registration-lifetime.test.ts (the `withActiveSetGate`
// PIC-8/PIC-17/PIC-19 cells). Spec:
// pi-integration-contract/tool-registration-lifetime.md PIC-8(a)–(d)
// (single re-attempt → `active-set-restore-failed` (E) + `display:true` note →
// propagate the inner completion/error unmasked) and PIC-19 (step-1/step-2
// setup throw → `internal-error`, body not run, no restore owed).
//
// RED reason at the fork (a7890d1e): a restore throw is a plain `Error`, so the
// bare windows let it propagate uncaught out of `executeBody`
// (surfaceUnexpectedThrow reframes it one layer UP, above the seam these cells
// drive — src/runtime/statement-executor.ts §"belt" error classes) — masking a
// completed query's `"604"`, with no retry, no `active-set-restore-failed`
// diagnostic and no display note. The two inline windows restore bare
// identically. The happy-path controls encode the UNCHANGED behaviour and are
// GREEN at the fork.
//
// Window coverage of the cells below (stated loudly per the parent brief — no
// window is silently skipped):
//   - Producer query window (window 1): cells A1 (transient retry), A2 (double
//     throw), A4 (happy control) — end-to-end through the real producer.
//   - `runPromptSuspendInvoke` (window 3): cells B1 (transient retry), B2
//     (double throw), B3 (install→internal-error), B4 (happy control) — direct
//     unit over the exported seam, where the compliant deps are captured
//     deterministically.
//   - `driveStreamedUserTurn` (window 2): NOT witnessed by a running cell. It
//     is a module-INTERNAL (non-exported) function, and its only offline reach
//     — the producer typed-query repair follow-up LIVE-DEGRADED arm
//     (production-theta-producer.ts:3034, `liveModel !== undefined &&
//     respond === undefined`) — requires an UNLOWERABLE (`@<>`/whitespace)
//     annotation that the parser REJECTS with theta/parse/empty-query-annotation
//     since bug 0014, so it is unreachable from parsed source. Its bare restore
//     (production-theta-producer.ts:6772) is byte-identical in shape to the
//     other two windows; the fix converts it in the same commit. Called out
//     here rather than skipped silently.

import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import type { RuntimeRoot } from "../src/runtime-root";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type ThetaDocument,
} from "../src/parser/theta-document";
import type { ThetaSource } from "../src/lexer/lexer";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import {
  SYSTEM_NOTE_CHANNEL,
  type SystemNoteChannelDeps,
} from "../src/extension/system-note-channel";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { runPromptSuspendInvoke } from "../src/runtime/invoke-prompt-suspend";
import type { CrossModeCell } from "../src/runtime/invoke-cross-mode";

// The runtime diagnostics-registry code the PIC-8 restore-failure protocol emits
// (diagnostics/code-registry-runtime.md); mirrors tool-registration-lifetime.test.ts.
const ACTIVE_SET_RESTORE_FAILED = "theta/runtime/active-set-restore-failed";

// The PIC-8(c) display-note template, only `/<name>` substituted. A regex is
// used at the producer window (the name the fix threads there is the theta's,
// not fixed by this harness); the byte-exact string is asserted at the suspend
// window, where this harness supplies the name.
const RESTORE_NOTE_VERBATIM =
  /^theta: failed to restore tool active-set after \/\S+; the user session may have unexpected tools active\. Run \/reload to reset\.$/;

// --- The injectable active-set gate ----------------------------------------
// Mirrors tests/tool-registration-lifetime.test.ts's `FakeActiveSetPi`: the
// first `setActiveTools` is the step-2 install, every later call is a step-4
// restore. Its throw schedule reproduces the bug doc's §Reproduction probe
// shape (a restore throw from a healthy host at restore time).

type GateMode =
  | "healthy"
  | "throw-restore-once" // transient: first restore throws, the retry succeeds
  | "throw-restore-always" // persistent: both restore attempts throw
  | "throw-install"; // step-2 install throws (PIC-19 setup failure)

class RecordingActiveSet {
  readonly setCalls: string[][] = [];
  getCalls = 0;
  #installed = false;
  #restoreAttempts = 0;

  constructor(
    readonly snapshot: readonly string[],
    readonly mode: GateMode,
  ) {}

  getActiveTools(): string[] {
    this.getCalls += 1;
    return [...this.snapshot];
  }

  setActiveTools(names: string[]): void {
    this.setCalls.push([...names]);
    if (!this.#installed) {
      this.#installed = true;
      if (this.mode === "throw-install") {
        throw new Error("active-set install drift");
      }
      return;
    }
    this.#restoreAttempts += 1;
    if (this.mode === "throw-restore-always") {
      throw new Error("active-set restore failure");
    }
    if (this.mode === "throw-restore-once" && this.#restoreAttempts === 1) {
      throw new Error("active-set transient restore failure");
    }
  }

  /** Every `setActiveTools` call after the step-2 install. */
  get restoreAttempts(): string[][] {
    return this.setCalls.slice(1);
  }
}

// --- Compliant-deps recorders (what the Option-1 fix threads) --------------

interface RecordedNote {
  readonly content: string;
  readonly display: boolean;
}

interface Recorders {
  readonly diagnostics: Diagnostic[];
  readonly notes: RecordedNote[];
  readonly internalErrors: Error[];
}

function makeRecorders(): Recorders {
  return { diagnostics: [], notes: [], internalErrors: [] };
}

// ===========================================================================
// Window 3 — `runPromptSuspendInvoke` (EXPORTED cross-mode prompt→prompt seam).
// Direct unit cells; the Option-1 fix threads the compliant deps into
// `PromptSuspendInput`, so they are captured deterministically here. At the
// fork those fields are not on the input type — vitest transpiles (esbuild, no
// typecheck; `npm test` == `vitest run`) so the fork IGNORES them and reds on
// the masked result / absent diagnostic, NOT on a compile error.
// ===========================================================================

const PROMPT_PROMPT_CELL: CrossModeCell = { callerMode: "prompt", calleeMode: "prompt" };
const SUSPEND_SNAPSHOT = ["ambient-a", "ambient-b"];
const SUSPEND_CHILD_SET = ["child-tool"];
const SUSPEND_THETA_NAME = "callee-name";

/** Build a `runPromptSuspendInvoke` input carrying the Option-1 compliant deps. */
function suspendInput(gate: RecordingActiveSet, rec: Recorders, childBody: () => Promise<string>) {
  return {
    cell: PROMPT_PROMPT_CELL,
    childCallableSet: SUSPEND_CHILD_SET,
    pi: gate,
    childBody,
    // The deps the fix threads (withActiveSetGate's construction deps). Excess
    // at the fork (ignored), consumed post-fix.
    thetaName: SUSPEND_THETA_NAME,
    emitDiagnostic: (d: Diagnostic): void => {
      rec.diagnostics.push(d);
    },
    emitSystemNote: (n: { content: string; display: boolean }): void => {
      rec.notes.push({ content: n.content, display: n.display });
    },
    routeInternalError: (e: Error): void => {
      rec.internalErrors.push(e);
    },
  };
}

describe("bug 0372 (RED) — runPromptSuspendInvoke restores under the PIC-8/PIC-19 protocol", () => {
  it("B1: a transient single restore throw is re-attempted once, the child result is preserved, the ambient set is restored, and no diagnostic fires", async () => {
    // Fork (invoke-prompt-suspend.ts:123 bare `finally` restore): the first
    // restore throw propagates and rejects the hop, masking "CHILD-OK".
    const gate = new RecordingActiveSet(SUSPEND_SNAPSHOT, "throw-restore-once");
    const rec = makeRecorders();

    let outcome: { result: string } | undefined;
    let caught: unknown;
    try {
      outcome = await runPromptSuspendInvoke(suspendInput(gate, rec, async () => "CHILD-OK"));
    } catch (thrown) {
      caught = thrown;
    }

    expect(
      caught,
      "the transient restore throw must be re-attempted once (it succeeds), not " +
        `rejected out of the hop masking the child result; observed throw: ${String(caught)}`,
    ).toBeUndefined();
    // PIC-8(a): exactly two restore attempts (throw, then success) — no third.
    expect(gate.restoreAttempts.length).toBe(2);
    for (const attempt of gate.restoreAttempts) {
      expect(attempt).toEqual(SUSPEND_SNAPSHOT);
    }
    // PIC-8(d): the child completion survives the transient restore hiccup.
    expect(outcome?.result).toBe("CHILD-OK");
    // The retry succeeded, so the ambient set is the last thing installed.
    expect(gate.setCalls.at(-1)).toEqual(SUSPEND_SNAPSHOT);
    // A transient failure a single retry absorbs emits nothing.
    expect(rec.diagnostics.some((d) => d.code === ACTIVE_SET_RESTORE_FAILED)).toBe(false);
    expect(rec.notes).toEqual([]);
  });

  it("B2: a double restore throw fires active-set-restore-failed (E) + the verbatim display note and still propagates the child completion unmasked", async () => {
    const gate = new RecordingActiveSet(SUSPEND_SNAPSHOT, "throw-restore-always");
    const rec = makeRecorders();

    let outcome: { result: string } | undefined;
    let caught: unknown;
    try {
      outcome = await runPromptSuspendInvoke(suspendInput(gate, rec, async () => "CHILD-OK"));
    } catch (thrown) {
      caught = thrown;
    }

    // PIC-8(d): the restore failure is swallowed after diagnosing, so the child
    // completion propagates — no rejection out of the hop.
    expect(
      caught,
      `the double restore throw must be diagnosed and swallowed, not rejected out of the hop; observed throw: ${String(caught)}`,
    ).toBeUndefined();
    // PIC-8(a): re-attempted exactly once (two attempts), then gives up.
    expect(gate.restoreAttempts.length).toBe(2);
    // PIC-8(b): `active-set-restore-failed` (E), snapshot names in `hint`.
    const diag = rec.diagnostics.find((d) => d.code === ACTIVE_SET_RESTORE_FAILED);
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe("error");
    for (const name of SUSPEND_SNAPSHOT) {
      expect(diag?.hint ?? "").toContain(name);
    }
    // PIC-8(c): the `display: true` note carrying the verbatim template, byte-
    // exact with this harness's supplied name substituted for `/<name>`.
    const note = rec.notes.find((n) => n.display === true);
    expect(note?.content).toBe(
      "theta: failed to restore tool active-set after /callee-name; the user session may have unexpected tools active. Run /reload to reset.",
    );
    // PIC-8(d): restore failure does not mask the inner completion.
    expect(outcome?.result).toBe("CHILD-OK");
  });

  it("B3: a step-2 install throw routes to internal-error, the child body never runs, and no restore is attempted (PIC-19)", async () => {
    const gate = new RecordingActiveSet(SUSPEND_SNAPSHOT, "throw-install");
    const rec = makeRecorders();
    let bodyRan = false;

    await expect(
      runPromptSuspendInvoke(
        suspendInput(gate, rec, async () => {
          bodyRan = true;
          return "CHILD-OK";
        }),
      ),
    ).rejects.toThrow();

    // PIC-19: the install throw routes to `theta/runtime/internal-error`.
    expect(rec.internalErrors.length).toBe(1);
    // Setup failed before step 3, so the body never ran and no restore is owed.
    expect(bodyRan).toBe(false);
    expect(gate.restoreAttempts.length).toBe(0);
    // A step-2 failure is not a restore failure — no restore-failed diagnostic.
    expect(rec.diagnostics.some((d) => d.code === ACTIVE_SET_RESTORE_FAILED)).toBe(false);
  });

  it("B4 (CONTROL): a healthy gate installs the child set then restores the snapshot and preserves the result — GREEN at the fork", async () => {
    const gate = new RecordingActiveSet(SUSPEND_SNAPSHOT, "healthy");
    const rec = makeRecorders();

    const outcome = await runPromptSuspendInvoke(
      suspendInput(gate, rec, async () => "CHILD-OK"),
    );

    expect(outcome.engaged).toBe(true);
    expect(outcome.result).toBe("CHILD-OK");
    // Exact call sequence: install the child set (snapshot NOT unioned in),
    // then restore the snapshot. Byte-identical between fork and fix.
    expect(gate.setCalls).toEqual([SUSPEND_CHILD_SET, SUSPEND_SNAPSHOT]);
    expect(gate.getCalls).toBe(1);
    expect(rec.diagnostics).toEqual([]);
    expect(rec.notes).toEqual([]);
    expect(rec.internalErrors).toEqual([]);
  });
});

// ===========================================================================
// Window 1 — the producer prompt-mode query window, end-to-end.
// Harness: the b0288 pattern (tests/b0288-prompt-turn-completion-witness.test.ts)
// — drive the REAL producer (`createProductionProducerDeps` →
// `bindPromptConversation` → `executeBody`) over an in-memory instant-settle
// session double with an injected `Clock`, so the REAL `LivePromptQueryModel`
// (never hand-built; not exported) runs the REAL
// `withActiveSetGating(this.#pi, install, …)` window. The injected gate throws
// on the restore call(s); the query itself settles cleanly and produces "604".
// ===========================================================================

const ANTHROPIC_MODEL = { id: "m1", api: "anthropic-messages", provider: "anthropic", strictCapable: true };
const QUERY_SNAPSHOT = ["ambient-x", "ambient-y"];
const QUERY_REPLY = "604";
const ONE_QUERY_THETA = ["---", "mode: prompt", "---", "let v = @`Ping`?", "v", ""].join("\n");

/** A `SessionManager` message entry (the `buildSessionContext` read shape). */
interface SessionEntryDouble {
  readonly type: "message";
  readonly id: string;
  readonly parentId: string | undefined;
  readonly message: Record<string, unknown>;
}

/**
 * The instant-settle user-session double: `sendUserMessage` commits the user
 * entry AND the reply inside the same tick (the b0288 guard-cell shape), so the
 * turn is settled without `isIdle()` ever being observed false and the drive's
 * fast path binds the reply. `sendMessage` captures `theta-system-note`s so the
 * PIC-8(c) note is observable whether the fix routes it through an explicit
 * channel or the producer's default (`this.#input.pi.sendMessage`) one.
 */
class InstantSettleSession {
  readonly entries: SessionEntryDouble[] = [];
  readonly notes: RecordedNote[] = [];

  constructor(readonly reply: string) {}

  sendUserMessage(text: string): void {
    this.#appendUser(text);
    this.#appendAssistant(this.reply);
  }

  isIdle(): boolean {
    return true;
  }

  sendMessage(message: { customType?: string; content?: string; display?: boolean }): void {
    if (message.customType === SYSTEM_NOTE_CHANNEL) {
      this.notes.push({ content: String(message.content ?? ""), display: message.display === true });
    }
  }

  #appendUser(text: string): void {
    this.#append({ role: "user", content: [{ type: "text", text }], timestamp: 0 });
  }

  #appendAssistant(text: string): void {
    this.#append({
      role: "assistant",
      content: [{ type: "text", text }],
      api: "anthropic-messages",
      provider: "anthropic",
      model: "m1",
      stopReason: "stop",
      timestamp: 0,
    });
  }

  #append(message: Record<string, unknown>): void {
    const id = `e${this.entries.length + 1}`;
    const parentId = this.entries.length === 0 ? undefined : `e${this.entries.length}`;
    this.entries.push({ type: "message", id, parentId, message });
  }
}

function parseDeps(): ParseThetaDocumentDeps {
  return {
    systemNote: {
      pi: { sendMessage: (): void => {} },
      ui: { notify: (): void => {} },
      emitDiagnostic: (): void => {},
    },
    modelMatcher: { resolve: (): "resolved" => "resolved" } as ModelReferenceMatcher,
  };
}

function parse(src: string): ThetaDocument {
  const source: ThetaSource = { path: "probe.theta", bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
  expect(errors, "the fixture theta must parse cleanly before it is driven").toEqual([]);
  expect(doc.frontmatter, "the fixture theta must carry parseable frontmatter").not.toBeNull();
  return doc;
}

function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}

/**
 * `clock.setTimeout` fires the callback synchronously with no lifecycle to
 * advance — the instant-settle turn is already settled at the send, so every
 * `#pollWhile` observes its clearing condition on entry. Deterministic, no real
 * timers.
 */
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: {
      now: (): number => 0,
      wallNow: (): number => 0,
      setTimeout: (fn: () => void): unknown => {
        fn();
        return 0;
      },
      clearTimeout: (): void => {},
    },
    schemaValidator: ajv(),
  } as unknown as RuntimeRoot;
}

function piDouble(session: InstantSettleSession, gate: RecordingActiveSet): ExtensionAPI {
  return {
    sendUserMessage: (content: string): void => session.sendUserMessage(content),
    getActiveTools: (): string[] => gate.getActiveTools(),
    setActiveTools: (names: string[]): void => gate.setActiveTools(names),
    registerTool: (): void => {},
    on: (): void => {},
    sendMessage: (message: { customType?: string; content?: string; display?: boolean }): void =>
      session.sendMessage(message),
  } as unknown as ExtensionAPI;
}

function ctxDouble(session: InstantSettleSession): ExtensionCommandContext {
  return {
    model: ANTHROPIC_MODEL,
    signal: undefined,
    isIdle: (): boolean => session.isIdle(),
    waitForIdle: (): Promise<void> => Promise.resolve(),
    sessionManager: {
      getEntries: (): readonly SessionEntryDouble[] => [...session.entries],
      getLeafId: (): undefined => undefined,
    },
  } as unknown as ExtensionCommandContext;
}

interface QueryDriveResult {
  readonly execution: BodyExecution;
  readonly session: InstantSettleSession;
  readonly gate: RecordingActiveSet;
  readonly diagnostics: Diagnostic[];
  readonly caught: unknown;
}

/**
 * Drive the one-query theta through the production prompt-mode binding with the
 * given gate mode. Captures a THROW out of `executeBody` (the fork's masking
 * shape: a restore throw is a plain `Error` reframed one layer up, above this
 * seam) rather than letting it abort the test as an opaque harness error.
 */
async function driveQuery(mode: GateMode): Promise<QueryDriveResult> {
  const doc = parse(ONE_QUERY_THETA);
  const theta: ThetaCompositionInput = {
    slashName: "probe",
    sourcePath: "/theta/probe.theta",
    frontmatter: doc.frontmatter!,
    body: doc.body,
  };
  const session = new InstantSettleSession(QUERY_REPLY);
  const gate = new RecordingActiveSet(QUERY_SNAPSHOT, mode);
  const diagnostics: Diagnostic[] = [];
  const systemNoteChannel: SystemNoteChannelDeps = {
    pi: {
      sendMessage: (message): void => {
        if (message.customType === SYSTEM_NOTE_CHANNEL) {
          session.notes.push({
            content: String(message.content ?? ""),
            display: message.display === true,
          });
        }
      },
    },
    ui: { notify: (): void => {} },
    emitDiagnostic: (d): void => {
      diagnostics.push(d);
    },
  };
  const deps = createProductionProducerDeps({
    pi: piDouble(session, gate),
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
    emitDiagnostic: (d): void => {
      diagnostics.push(d);
    },
    systemNoteChannel,
  });
  const binding = deps.bindPromptConversation({ theta, args: "", ctx: ctxDouble(session) });
  expect(
    binding.drivenAgainst,
    "the harness must bind the LIVE prompt-mode drive (the user session)",
  ).toBe("prompt-user-session");

  let execution: BodyExecution | undefined;
  let caught: unknown;
  try {
    execution = await executeBody(theta.body, binding.executeDeps);
  } catch (thrown) {
    caught = thrown;
  }
  return {
    execution: execution as BodyExecution,
    session,
    gate,
    diagnostics,
    caught,
  };
}

describe("bug 0372 (RED) — the producer query window restores under the PIC-8 protocol", () => {
  it("A1: a transient single restore throw is re-attempted once, the query result is preserved, the ambient set is restored, and no diagnostic fires", async () => {
    // Fork (conversation-drive.ts:102 bare `finally` restore): the first restore
    // throw exits the gating `finally`, unwinds through #driveUserVisibleTurn's
    // listener-detach `finally`, and — being a plain Error — propagates uncaught
    // out of executeBody, MASKING the query's completed "604".
    const r = await driveQuery("throw-restore-once");

    expect(
      r.caught,
      "the transient restore throw must be re-attempted once (it succeeds), not " +
        `propagated out of executeBody masking the query; observed throw: ${String(r.caught)}`,
    ).toBeUndefined();
    expect(r.execution.outcome, `error: ${JSON.stringify(r.execution?.error)}`).toBe("success");
    expect(r.execution.result.value).toBe(QUERY_REPLY);
    // The retry succeeded: the last active-set install is the ambient snapshot.
    expect(r.gate.setCalls.at(-1)).toEqual(QUERY_SNAPSHOT);
    expect(r.gate.restoreAttempts.length).toBe(2);
    // A transient hiccup a single retry absorbs emits nothing.
    expect(r.diagnostics.some((d) => d.code === ACTIVE_SET_RESTORE_FAILED)).toBe(false);
    expect(r.session.notes.filter((n) => RESTORE_NOTE_VERBATIM.test(n.content))).toEqual([]);
  });

  it("A2: a double restore throw fires active-set-restore-failed (E) + the verbatim display note and still propagates the query completion unmasked", async () => {
    const r = await driveQuery("throw-restore-always");

    // PIC-8(d): the restore failure is swallowed after diagnosing, so the
    // completed query's value propagates — no uncaught throw out of executeBody.
    expect(
      r.caught,
      `the double restore throw must be diagnosed and swallowed, not propagated; observed throw: ${String(r.caught)}`,
    ).toBeUndefined();
    expect(r.execution.outcome, `error: ${JSON.stringify(r.execution?.error)}`).toBe("success");
    expect(r.execution.result.value).toBe(QUERY_REPLY);
    // PIC-8(a): re-attempted exactly once (two attempts).
    expect(r.gate.restoreAttempts.length).toBe(2);
    // PIC-8(b): `active-set-restore-failed` (E) with the snapshot names in hint.
    const diag = r.diagnostics.find((d) => d.code === ACTIVE_SET_RESTORE_FAILED);
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe("error");
    for (const name of QUERY_SNAPSHOT) {
      expect(diag?.hint ?? "").toContain(name);
    }
    // PIC-8(c): the verbatim `display: true` note (name substituted).
    const note = r.session.notes.find(
      (n) => n.display === true && RESTORE_NOTE_VERBATIM.test(n.content),
    );
    expect(
      note,
      `the verbatim PIC-8(c) note must fire; observed notes: ${JSON.stringify(r.session.notes)}`,
    ).toBeDefined();
  });

  it("A4 (CONTROL): a healthy gate installs the callable set then restores the snapshot and binds the reply — GREEN at the fork", async () => {
    const r = await driveQuery("healthy");

    expect(r.caught, `unexpected throw: ${String(r.caught)}`).toBeUndefined();
    expect(r.execution.outcome, `error: ${JSON.stringify(r.execution?.error)}`).toBe("success");
    expect(r.execution.result.value).toBe(QUERY_REPLY);
    // An untyped no-tool query installs exactly `[]` (snapshot NOT unioned in),
    // then restores the ambient snapshot. Byte-identical between fork and fix.
    expect(r.gate.setCalls).toEqual([[], QUERY_SNAPSHOT]);
    expect(r.gate.getCalls).toBe(1);
    expect(r.diagnostics.some((d) => d.code === ACTIVE_SET_RESTORE_FAILED)).toBe(false);
    expect(r.session.notes.filter((n) => RESTORE_NOTE_VERBATIM.test(n.content))).toEqual([]);
  });
});
