// Shared rendering mirror for `buildBinderSystemPrompt`
// (src/binder/binder-system-prompt.ts) fixtures, used by the params-lowering
// test files that assert on the binder's rendered system prompt byte-for-byte.

import type { BypassParamsField } from "../../src/binder/binder-envelope";
import type { SystemPromptParamField } from "../../src/binder/binder-system-prompt";

/**
 * Map parsed `params:` fields to the system-prompt descriptors exactly as the
 * producer's module-private `binderPromptParamField`
 * (`src/extension/production-theta-producer.ts`) does: the requirement token
 * from the retained default RHS, and no `description` (the `params:` syntax
 * carries none). Passes the declared `type` verbatim — production also
 * projects it through `projectRenderedParamType` (`src/parser/params.ts`;
 * bug 0251 §Fix) before rendering, so a caller asserting on a `type` where
 * that projection is non-identity must apply the same projection first.
 */
export function binderParams(fields: readonly BypassParamsField[]): SystemPromptParamField[] {
  return fields.map((f) => ({
    wireName: f.wireName,
    type: f.type,
    requirement:
      f.hasDefault && f.defaultSource !== undefined
        ? { kind: "default" as const, literal: f.defaultSource }
        : { kind: "required" as const },
  }));
}

/**
 * The physical lines of the `Parameters:` block (between the header and its
 * terminating blank line) in an already-built system prompt. Loud when the
 * block is absent — a caller reaching this helper has already built a prompt
 * for at least one declared field, so item 4
 * (docs/spec_topics/binder/binder-bypass-and-envelope.md) requires the block.
 */
export function parametersBlockLines(label: string, prompt: string): string[] {
  const lines = prompt.split("\n");
  const header = lines.indexOf("Parameters:");
  if (header < 0) {
    throw new Error(
      `${label}: no \`Parameters:\` header in the built system prompt — item 4 requires the block for ≥1 declared field. Prompt: ${JSON.stringify(prompt)}`,
    );
  }
  const end = lines.indexOf("", header);
  if (end < 0) {
    throw new Error(
      `${label}: the \`Parameters:\` block never terminates with a blank line. Prompt: ${JSON.stringify(prompt)}`,
    );
  }
  return lines.slice(header + 1, end);
}
