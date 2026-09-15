// RFC 0011 (V24a-T / V24a) — the closed session-control runtime-tool name
// set and its fixed signatures, as one table (seam sheet §2).
//
// This module is the single source of truth for the three session-control
// tool names theta 1.x admits as bare `tools:` identifiers that resolve to a
// HOST session member rather than a Pi tool or a `.theta` callee: `compact`,
// `context_usage`, `session_name` (RFC 0011 §1, D1 bare names). It is
// consumed by the callable-set resolver (`src/parser/callable-set.ts`, §3),
// the parse layer's isolated-body check (§5.3), the compose-pass
// fixed-signature checks (§5.2), the load-time host probe (§3.3), and the
// dispatch table (§6) — one table, one derivation, so no consumer can drift
// from another on the closed name set or a signature's arity/type facts.
//
// Spec: docs/reference/tool-calls.md #session-control-runtime-tools;
// docs/rfcs/0011-session-control-tools.md §1 (Summary), §2 (Detailed design).
//
// No Pi value import (type-only imports admitted); no ambient primitives —
// this module is pure text/table derivation, host-independent.

import { isBareIdentifier, parseToolsEntry } from "./callable-set";

/** The closed runtime-tool name set (RFC 0011; D1 bare names). */
export const RUNTIME_TOOL_NAMES = ["compact", "context_usage", "session_name"] as const;

export type RuntimeToolName = (typeof RUNTIME_TOOL_NAMES)[number];

/** One parameter of a runtime tool's fixed signature (seam sheet §2). */
export interface RuntimeToolParam {
  readonly name: string;
  /** Annotation source for the parameter type (theta 1.x: always "string"). */
  readonly typeSource: string;
  /** True ⇒ the parameter carries a default and is arity-optional. */
  readonly hasDefault: boolean;
}

/** A runtime tool's fixed signature (seam sheet §2). */
export interface RuntimeToolSignature {
  readonly name: RuntimeToolName;
  readonly params: readonly RuntimeToolParam[];
  readonly requiredCount: number; // params minus defaults
  readonly totalCount: number; // params length
  /** SUCCESS-payload annotation source (letAnnotationToCompatType input). */
  readonly successTypeSource: string;
  /** Host members the load probe tests, in probe order (rendered as <member>). */
  readonly hostMembers: readonly string[];
}

const COMPACT_SIGNATURE: RuntimeToolSignature = Object.freeze({
  name: "compact",
  params: Object.freeze([Object.freeze({ name: "instructions", typeSource: "string", hasDefault: true })]),
  requiredCount: 0,
  totalCount: 1,
  successTypeSource: "{ summary: string, tokens_before: integer, tokens_after: integer }",
  hostMembers: Object.freeze(["ctx.compact"]),
});

const CONTEXT_USAGE_SIGNATURE: RuntimeToolSignature = Object.freeze({
  name: "context_usage",
  params: Object.freeze([]),
  requiredCount: 0,
  totalCount: 0,
  successTypeSource: "{ tokens: integer, context_window: integer, percent: number }",
  hostMembers: Object.freeze(["ctx.getContextUsage"]),
});

const SESSION_NAME_SIGNATURE: RuntimeToolSignature = Object.freeze({
  name: "session_name",
  params: Object.freeze([Object.freeze({ name: "name", typeSource: "string", hasDefault: false })]),
  requiredCount: 1,
  totalCount: 1,
  successTypeSource: "string",
  hostMembers: Object.freeze(["pi.setSessionName", "pi.getSessionName"]),
});

/** The fixed signature table, keyed by canonical (pre-rename) runtime-tool name (seam sheet §2). */
export const RUNTIME_TOOL_SIGNATURES: ReadonlyMap<RuntimeToolName, RuntimeToolSignature> = new Map([
  [COMPACT_SIGNATURE.name, COMPACT_SIGNATURE],
  [CONTEXT_USAGE_SIGNATURE.name, CONTEXT_USAGE_SIGNATURE],
  [SESSION_NAME_SIGNATURE.name, SESSION_NAME_SIGNATURE],
]);

const RUNTIME_TOOL_NAME_SET: ReadonlySet<string> = new Set(RUNTIME_TOOL_NAMES);

/**
 * Presented-name map for a raw frontmatter `tools:` list: every entry whose
 * `parseToolsEntry` spec is a bare identifier in `RUNTIME_TOOL_NAMES` maps
 * (rename ?? spec) → canonical name. Pure text derivation — host-independent,
 * identical to the frozen callable set's runtime-tool classification for any
 * registered theta. Malformed entries and non-members contribute nothing.
 */
export function runtimeToolPresentedNames(
  tools: readonly string[] | undefined,
): ReadonlyMap<string, RuntimeToolName> {
  const out = new Map<string, RuntimeToolName>();
  for (const raw of tools ?? []) {
    const parsed = parseToolsEntry(raw);
    if (parsed.kind !== "ok") {
      continue;
    }
    if (!isBareIdentifier(parsed.spec) || !RUNTIME_TOOL_NAME_SET.has(parsed.spec)) {
      continue;
    }
    const canonical = parsed.spec as RuntimeToolName;
    const presented = parsed.rename ?? parsed.spec;
    out.set(presented, canonical);
  }
  return out;
}
