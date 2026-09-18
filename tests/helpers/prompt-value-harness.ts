// Shared parse -> production binding -> execution harness for query-free,
// prompt-mode value witnesses. Fixture slugs stay with the calling tests.

import { expect } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { ParsedFrontmatter } from "../../src/parser/frontmatter";
import type { ThetaDocument } from "../../src/parser/theta-document";
import { executeBody, type BodyExecution } from "../../src/runtime/statement-executor";
import { isResultValue, type ResultValue, type ThetaValue } from "../../src/runtime/value";
import {
  createProductionProducerDeps,
  type CalleeParseOutcome,
} from "../../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../../src/extension/theta-composition-producer";
import type { Diagnostic } from "../../src/diagnostics/diagnostic";
import type { RuntimeRoot } from "../../src/runtime-root";
import type { SchemaValidator } from "../../src/seams/schema-validator";
import { parseTheta } from "./e2e-s1";
import { rootWith } from "./fixture-dispatch-harness";
import { noopPi } from "./call-with-clause-harness";
import { SEAM_NOOP_CHECKPOINT as NOOP_CHECKPOINT } from "./invoke-seam-scaffold";
import { ctxDouble } from "./tool-call-dispatch-harness";

export interface ProducerOpts {
  readonly schemaValidator?: SchemaValidator;
  // Bug 0293: the seam returns the three-arm `CalleeParseOutcome` verdict.
  readonly parseCallee?: (
    callerPath: string | undefined,
    calleePath: string,
  ) => Promise<CalleeParseOutcome | undefined>;
}

export function producer(opts: ProducerOpts = {}) {
  return createProductionProducerDeps({
    // `getActiveTools`/`setActiveTools` satisfy the PIC-17 prompt→prompt
    // suspend window; `sendMessage` satisfies the theta-system-note channel.
    pi: noopPi(),
    root: {
      ...rootWith(NOOP_CHECKPOINT),
      ...(opts.schemaValidator !== undefined ? { schemaValidator: opts.schemaValidator } : {}),
    },
    modelRegistry: {} as unknown as ModelRegistry,
    ...(opts.parseCallee !== undefined ? { parseCallee: opts.parseCallee } : {}),
  });
}

/** Bind a prompt-mode fixture and return the complete body execution. */
export function bindAndExecute(
  deps: ReturnType<typeof producer>,
  theta: ThetaCompositionInput,
  ctx: ExtensionCommandContext = ctxDouble(),
): Promise<BodyExecution> {
  const bindInput: ConversationBindInput = { theta, args: "", ctx };
  const binding = deps.bindPromptConversation(bindInput);
  return executeBody(theta.body, binding.executeDeps);
}

/** Run already-parsed pattern witnesses with their fixture identity and inert context. */
export function createParsedPromptHarness(bugTag: string, sourcePath: string) {
  async function execute(doc: ThetaDocument): Promise<BodyExecution> {
    const input: ThetaCompositionInput = {
      slashName: bugTag,
      sourcePath,
      frontmatter: doc.frontmatter as ParsedFrontmatter,
      body: doc.body,
    };
    return bindAndExecute(producer(), input, {} as unknown as ExtensionCommandContext);
  }

  /** Assert the value an already-parsed body evaluates to. */
  async function expectValue(
    doc: ThetaDocument,
    value: ThetaValue,
    why: string,
  ): Promise<void> {
    const execution = await execute(doc);
    expect(execution.outcome, `${why}: the body reaches a value`).toBe("success");
    expect(execution.result.value, why).toEqual(value);
  }

  return { execute, expectValue };
}

export const FM = "---\nmode: prompt\n---\n";

/** Parse + run a self-contained query-free prompt-mode body and return its final value. */
export async function runValue(src: string, bugTag: string): Promise<ThetaValue | undefined> {
  const doc = parseTheta(`${bugTag}.theta`, FM + src);
  const theta: ThetaCompositionInput = {
    slashName: bugTag,
    sourcePath: `/proj/${bugTag}.theta`,
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const execution = await bindAndExecute(producer(), theta);
  expect(execution.outcome, "the body must succeed").toBe("success");
  return execution.result.value;
}

/**
 * Drive a prompt-mode caller against a prompt-mode callee over the real
 * parse → production binding → execution path. Callers retain their parser,
 * root (including recording validators), fixture bodies and context.
 * `bindPromptConversation` threads `callerMode: "prompt"` into the attach guard.
 */
export async function drivePromptAttach(input: {
  readonly callerBody: string;
  readonly calleeBody: string;
  readonly calleeName?: string;
  readonly parse: (path: string, src: string) => ThetaDocument;
  readonly root: () => RuntimeRoot;
  readonly ctx?: ExtensionCommandContext;
  readonly emitDiagnostic?: (diagnostic: Diagnostic) => void;
  readonly boundaryKind?: "invoke" | "tail";
}): Promise<ResultValue> {
  const calleeName = input.calleeName ?? "kidp";
  const calleeDoc = input.parse(`${calleeName}.theta`, FM + input.calleeBody);
  const callee: ThetaCompositionInput = {
    slashName: calleeName,
    sourcePath: `/theta/${calleeName}.theta`,
    frontmatter: calleeDoc.frontmatter as ParsedFrontmatter,
    body: calleeDoc.body,
  };
  const deps = createProductionProducerDeps({
    // `getActiveTools` / `setActiveTools` satisfy the PIC-17 prompt→prompt
    // suspend window; `sendMessage` satisfies the theta-system-note channel.
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root: input.root(),
    modelRegistry: {} as unknown as ModelRegistry,
    // Bug 0293: the seam returns the three-arm `CalleeParseOutcome` verdict.
    parseCallee: () => Promise.resolve({ kind: "ok" as const, input: callee }),
    ...(input.emitDiagnostic === undefined ? {} : { emitDiagnostic: input.emitDiagnostic }),
  });
  const callerDoc = input.parse("caller.theta", FM + input.callerBody);
  const theta: ThetaCompositionInput = {
    slashName: "caller",
    sourcePath: "/theta/caller.theta",
    frontmatter: callerDoc.frontmatter as ParsedFrontmatter,
    body: callerDoc.body,
  };
  const execution = await bindAndExecute(
    deps, theta, input.ctx ?? {} as unknown as ExtensionCommandContext,
  );
  return boundaryResult(execution, input.boundaryKind);
}

/**
 * The `Result` the caller's tail produced. A caller body that did not reach its
 * tail says nothing about the return boundary, so that is a loud harness failure
 * rather than a cell outcome.
 */
export function boundaryResult(execution: BodyExecution, kind: "invoke" | "tail" = "invoke"): ResultValue {
  if (execution.outcome !== "success") {
    throw new Error(
      `precondition unmet: the caller body ended '${execution.outcome}' instead of reaching its ` +
        `tail${kind === "invoke" ? " invoke" : ""} — error ${JSON.stringify(execution.error)}`,
    );
  }
  const tail = execution.result.value;
  if (tail === undefined || !isResultValue(tail)) {
    throw new Error(
      `precondition unmet: the caller's tail value is not the ${kind === "invoke" ? "invoke " : ""}boundary Result — ` +
        `${JSON.stringify(tail)}`,
    );
  }
  return tail;
}

/** Render a prompt outcome with the caller's non-finite / signed-zero payload renderer. */
export function promptOutcome(result: ResultValue, render: (value: unknown) => string): string {
  return result.ok ? `Ok(${render(result.value)})` : `Err(${JSON.stringify(result.error)})`;
}
