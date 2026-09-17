// Shared parse -> production binding -> execution harness for query-free,
// prompt-mode value witnesses. Fixture slugs stay with the calling tests.

import { expect } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { ParsedFrontmatter } from "../../src/parser/frontmatter";
import { executeBody } from "../../src/runtime/statement-executor";
import type { ThetaValue } from "../../src/runtime/value";
import { createProductionProducerDeps } from "../../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../../src/runtime-root";
import { parseTheta } from "./e2e-s1";
import { SEAM_NOOP_CHECKPOINT as NOOP_CHECKPOINT } from "./invoke-seam-scaffold";

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
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
  const bindInput: ConversationBindInput = {
    theta,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  };
  const binding = producer().bindPromptConversation(bindInput);
  const execution = await executeBody(theta.body, binding.executeDeps);
  expect(execution.outcome, "the body must succeed").toBe("success");
  return execution.result.value;
}
