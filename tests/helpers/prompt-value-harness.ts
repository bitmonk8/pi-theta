// Shared parse -> production binding -> execution harness for query-free,
// prompt-mode value witnesses. Fixture slugs stay with the calling tests.

import { expect } from "vitest";
import type {
  ExtensionAPI,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { ParsedFrontmatter } from "../../src/parser/frontmatter";
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
import type { SchemaValidator } from "../../src/seams/schema-validator";
import { parseTheta } from "./e2e-s1";
import { SEAM_NOOP_CHECKPOINT as NOOP_CHECKPOINT } from "./invoke-seam-scaffold";
import { ctxDouble } from "./tool-call-dispatch-harness";

function rootDouble(schemaValidator?: SchemaValidator): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    ...(schemaValidator !== undefined ? { schemaValidator } : {}),
  } as unknown as RuntimeRoot;
}

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
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root: rootDouble(opts.schemaValidator),
    modelRegistry: {} as unknown as ModelRegistry,
    ...(opts.parseCallee !== undefined ? { parseCallee: opts.parseCallee } : {}),
  });
}

/** Bind a prompt-mode fixture and return the complete body execution. */
export function bindAndExecute(
  deps: ReturnType<typeof producer>,
  theta: ThetaCompositionInput,
): Promise<BodyExecution> {
  const bindInput: ConversationBindInput = { theta, args: "", ctx: ctxDouble() };
  const binding = deps.bindPromptConversation(bindInput);
  return executeBody(theta.body, binding.executeDeps);
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
