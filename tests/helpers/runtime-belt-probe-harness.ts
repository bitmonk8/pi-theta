// Shared EXECUTOR-probe / PURE-HOST-drive harness for the b0368/b0369
// runtime-belt test files (PTQ-0397).
//
// WHY THIS FILE EXISTS. tests/b0368-plus-ordering-laundered-belt.test.ts and
// tests/b0369-control-flow-kind-belts.test.ts each independently declared the
// same seven pieces — `rootDouble` (a `RuntimeRoot` double whose `Clock`
// fires `setTimeout` synchronously for an instant-settle turn), `producer`
// (wraps it with `createProductionProducerDeps`), `probeSource` (parse + run
// a query-free prompt-mode source through `executeBody`, capturing a throw),
// `assertValue` (assert a probe's success value), the `InstantSettleSession`
// class (a session double recording every `pi.sendUserMessage` call),
// `driveInterp` (the PURE-HOST interpolation drive) and `driveInvoke` (the
// PURE-HOST invoke-argument drive) — byte-identical apart from a
// predecessor-bug-number comment and the `slashName`/`sourcePath` bug tag
// embedded in the composition input; b0369's own section comments concede
// the copy outright ("the b0368 shape, verbatim"). This module centralises
// all seven. Each file's own `parseTheta` (the bug-specific "why this
// fixture parses clean" rationale — which operand class defers, and against
// which sibling bug) stays local to its own file and is threaded through
// `makeBeltProbes` as a parameter, so neither file's own deferral wording is
// blended into the other's.
//
// TIER: unit, offline, deterministic, provider-free — the same tier as every
// file that imports this module. `producer`/`makeBeltProbes` wire the real,
// shipped `createProductionProducerDeps` and drive the real `executeBody`;
// nothing about the executor or pure-host seam itself is stubbed, only the
// `RuntimeRoot`/`ExtensionAPI` host around it.

import { expect } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { ParsedFrontmatter } from "../../src/parser/frontmatter";
import type { ThetaDocument } from "../../src/parser/theta-document";
import { executeBody, type BodyExecution } from "../../src/runtime/statement-executor";
import type { ThetaValue } from "../../src/runtime/value";
import {
  createProductionProducerDeps,
  type CalleeParseOutcome,
} from "../../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../../src/runtime-root";

/** An EXECUTOR probe's outcome: the body's success value, or a caught throw. */
export type Probe =
  | { readonly kind: "value"; readonly execution: BodyExecution }
  | { readonly kind: "threw"; readonly thrown: unknown };

/** A PURE-HOST interpolation drive's outcome: the rendered send log, or a caught throw. */
export type InterpProbe =
  | { readonly kind: "rendered"; readonly sent: readonly string[]; readonly outcome: string; readonly value: ThetaValue | undefined }
  | { readonly kind: "threw"; readonly sent: readonly string[]; readonly thrown: unknown };

/** A PURE-HOST invoke-argument drive's outcome: whether callee load was reached. */
export type InvokeProbe =
  | { readonly kind: "value"; readonly parseCalleeCalls: number; readonly outcome: string }
  | { readonly kind: "threw"; readonly parseCalleeCalls: number; readonly thrown: unknown };

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    // The prompt-mode drive's only wait primitive is `Clock.setTimeout`; fire the
    // callback synchronously so an instant-settle turn completes deterministically
    // with no real timers (the fixed-clock harness contract this module's
    // callers share).
    clock: {
      now: (): number => 0,
      wallNow: (): number => 0,
      setTimeout: (fn: () => void): unknown => {
        fn();
        return 0;
      },
      clearTimeout: (): void => {},
    },
  } as unknown as RuntimeRoot;
}

function producer() {
  return createProductionProducerDeps({
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
  });
}

function render(value: ThetaValue | undefined): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}

/**
 * Assert a value row: the body succeeded and its final value equals `expected`.
 * When the runtime threw instead, the first `expect` reds cleanly naming the
 * throw, rather than letting an uncaught throw escape the test.
 */
export function assertValue(probe: Probe, expected: ThetaValue, what: string): void {
  if (probe.kind === "threw") {
    expect(
      `threw ${String(probe.thrown)}`,
      `${what}: the witness table says success value ${render(expected)}, but the runtime threw`,
    ).toBe(`success value ${render(expected)}`);
    return;
  }
  expect(probe.execution.outcome, `${what}: the body must succeed`).toBe("success");
  expect(
    probe.execution.result.value,
    `${what}: the control value (byte-identical guard)`,
  ).toEqual(expected);
}

/** An instant-settling session double: records every `pi.sendUserMessage` call and settles synchronously. */
class InstantSettleSession {
  readonly entries: Array<Record<string, unknown>> = [];
  readonly sent: string[] = [];

  sendUserMessage(text: string): void {
    this.sent.push(text);
    this.entries.push({
      type: "message",
      id: `u${this.entries.length + 1}`,
      parentId: undefined,
      message: { role: "user", content: [{ type: "text", text }] },
    });
    this.entries.push({
      type: "message",
      id: `a${this.entries.length + 1}`,
      parentId: `u${this.entries.length}`,
      message: {
        role: "assistant",
        content: [{ type: "text", text: "settled-reply" }],
        api: "anthropic-messages",
        provider: "anthropic",
        model: "m1",
        stopReason: "stop",
      },
    });
  }

  isIdle(): boolean {
    return true;
  }
}

/**
 * Build the EXECUTOR probe (`probeSource`) and the two PURE-HOST drives
 * (`driveInterp`, `driveInvoke`) the b0368/b0369 runtime-belt test files
 * share. `parseTheta` is the caller's own "parse and fail loud on any
 * error-severity diagnostic" wrapper — each file's own rationale for why its
 * fixtures parse clean (which operand class defers, and against which
 * sibling bug) stays local to the caller; this factory only calls it.
 * `bugTag` is the composition input's `slashName` (and doubles as the
 * `/proj/<bugTag>.theta` `sourcePath`) the caller's fixtures are tagged with.
 */
export function makeBeltProbes(
  parseTheta: (src: string) => ThetaDocument,
  bugTag: string,
): {
  readonly probeSource: (src: string) => Promise<Probe>;
  readonly driveInterp: (src: string) => Promise<InterpProbe>;
  readonly driveInvoke: (src: string) => Promise<InvokeProbe>;
} {
  const sourcePath = `/proj/${bugTag}.theta`;

  /** Parse + run a self-contained query-free prompt-mode source, capturing a throw. */
  async function probeSource(src: string): Promise<Probe> {
    const doc = parseTheta(src);
    const theta: ThetaCompositionInput = {
      slashName: bugTag,
      sourcePath,
      frontmatter: doc.frontmatter as ParsedFrontmatter,
      body: doc.body,
    };
    const bindInput: ConversationBindInput = {
      theta,
      args: "",
      ctx: {} as unknown as ExtensionCommandContext,
    };
    const binding = producer().bindPromptConversation(bindInput);
    try {
      return { kind: "value", execution: await executeBody(theta.body, binding.executeDeps) };
    } catch (thrown) {
      return { kind: "threw", thrown };
    }
  }

  async function driveInterp(src: string): Promise<InterpProbe> {
    const doc = parseTheta(src);
    const session = new InstantSettleSession();
    const pi = {
      sendUserMessage: (content: string): void => session.sendUserMessage(content),
      getActiveTools: (): string[] => [],
      setActiveTools: (): void => {},
      registerTool: (): void => {},
      on: (): void => {},
      sendMessage: (): void => {},
    } as unknown as ExtensionAPI;
    const deps = createProductionProducerDeps({
      pi,
      root: rootDouble(),
      modelRegistry: {} as unknown as ModelRegistry,
    });
    const ctx = {
      model: { id: "m1", api: "anthropic-messages", provider: "anthropic", strictCapable: true },
      signal: undefined,
      isIdle: (): boolean => session.isIdle(),
      waitForIdle: (): Promise<void> => Promise.resolve(),
      sessionManager: {
        getEntries: (): readonly unknown[] => [...session.entries],
        getLeafId: (): undefined => undefined,
      },
    } as unknown as ExtensionCommandContext;
    const theta: ThetaCompositionInput = {
      slashName: bugTag,
      sourcePath,
      frontmatter: doc.frontmatter as ParsedFrontmatter,
      body: doc.body,
    };
    const binding = deps.bindPromptConversation({ theta, args: "", ctx });
    try {
      const execution = await executeBody(theta.body, binding.executeDeps);
      return {
        kind: "rendered",
        sent: session.sent,
        outcome: execution.outcome,
        value: execution.result.value,
      };
    } catch (thrown) {
      return { kind: "threw", sent: session.sent, thrown };
    }
  }

  async function driveInvoke(src: string): Promise<InvokeProbe> {
    const doc = parseTheta(src);
    let parseCalleeCalls = 0;
    const pi = {
      sendMessage: (): void => {},
      getActiveTools: (): string[] => [],
      setActiveTools: (): void => {},
    } as unknown as ExtensionAPI;
    const deps = createProductionProducerDeps({
      pi,
      root: rootDouble(),
      modelRegistry: {} as unknown as ModelRegistry,
      // Bug 0293: `undefined` still yields Err(load_failure) as a VALUE (the
      // seam-absent default) — enough to record that the invoke reached callee
      // load carrying the bound arg; the child is never spawned.
      parseCallee: (
        _caller: string | undefined,
        _path: string,
      ): Promise<CalleeParseOutcome | undefined> => {
        parseCalleeCalls += 1;
        return Promise.resolve(undefined);
      },
    });
    const ctx = {
      model: { id: "m1", provider: "anthropic" },
      signal: undefined,
    } as unknown as ExtensionCommandContext;
    const theta: ThetaCompositionInput = {
      slashName: bugTag,
      sourcePath,
      frontmatter: doc.frontmatter as ParsedFrontmatter,
      body: doc.body,
    };
    const binding = deps.bindPromptConversation({
      theta,
      args: "",
      ctx,
      thetaAbort: new AbortController(),
    });
    try {
      const execution = await executeBody(theta.body, binding.executeDeps);
      return { kind: "value", parseCalleeCalls, outcome: execution.outcome };
    } catch (thrown) {
      return { kind: "threw", parseCalleeCalls, thrown };
    }
  }

  return { probeSource, driveInterp, driveInvoke };
}
