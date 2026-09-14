// Shared code-side Pi-tool-call dispatch harness (PTQ-0238).
//
// WHY THIS FILE EXISTS. tests/b0322-unknown-tool-dispatch-safety-net.test.ts
// and tests/tool-arg-runtime-schema-validation.test.ts each independently
// redeclared an identical AST-node-builder-plus-production-harness for driving
// a hand-built code-side Pi-tool call through the real
// `createProductionProducerDeps` → `bindPromptConversation` → `executeBody`
// path over a frozen `CallableSetSnapshot`. This module centralises the pieces
// that carry no cell-specific variation between the two files: the expression
// builders, the statement-executor's no-op checkpoint, the callable-set
// snapshot builder, the prompt-mode theta builder, the context double, the
// AJV-backed `RuntimeRoot` double, the production-producer factory, the
// body-driving runner, the `Err` carrier reader, and the recording
// built-in-shaped snapshot entry.
//
// TIER: unit, offline, deterministic, provider-free — the same tier as every
// file that imports this module.

import { expect } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { Diagnostic, SourceRange } from "../../src/diagnostics/diagnostic";
import { createProductionProducerDeps } from "../../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../../src/extension/theta-composition-producer";
import type { ParsedFrontmatter } from "../../src/parser/frontmatter";
import type { CallableSetSnapshot, ResolvedCallable } from "../../src/parser/callable-set";
import type { CallExpr, Expr, ObjectExpr, ThetaBody } from "../../src/parser/theta-document";
import type {
  DispatchLadderProbe,
  EncodedToolRequest,
  HostToolResult,
} from "../../src/runtime/host-loop-dispatch";
import { executeBody } from "../../src/runtime/statement-executor";
import type { AgentToolResultEnvelope } from "../../src/runtime/tool-call-execute";
import type { ResultValue, ThetaValue } from "../../src/runtime/value";
import type { RuntimeRoot } from "../../src/runtime-root";
import type { RootRegime } from "../../src/runtime/subagent-root-regime";
import type { Checkpoint } from "../../src/seams/checkpoint";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../../src/seams/schema-validator";

export function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

export function numExpr(n: number): Expr {
  return { kind: "number", text: String(n), numericType: "integer", range: span() };
}

export function strExpr(value: string): Expr {
  return { kind: "string", value, range: span() };
}

/** The single bare object-literal argument a code-driven Pi-tool call takes. */
export function objArg(fields: Readonly<Record<string, Expr>>): ObjectExpr {
  return {
    kind: "object",
    typeName: null,
    fields: Object.entries(fields).map(([name, value]) => ({ name, value })),
    range: span(),
  };
}

export function callExpr(callee: string, args: readonly Expr[] = []): CallExpr {
  return { kind: "call", callee, args, range: span() };
}

export function body(tail: Expr | null): ThetaBody {
  return { statements: [], tail };
}

export const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

/**
 * A `RuntimeRoot` double exposing the members the code-side tool-call path
 * reads. `schemaValidator` is the REAL AJV-backed seam so a snapshot entry
 * that carries a schema validates through the production validator rather
 * than a fake's.
 */
export function rootDouble(): RuntimeRoot {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return {
    checkpoint: NOOP_CHECKPOINT,
    schemaValidator: new AjvSchemaValidator({ emit: (): void => {}, slugOf }),
    idSource: {
      newInvocationId: () => "inv-1",
      newToolCallId: () => "tc-1",
    },
  } as unknown as RuntimeRoot;
}

export function ctxDouble(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}

export interface ProducerOpts {
  readonly hostLoopDispatch?: (
    request: EncodedToolRequest,
    signal: AbortSignal,
  ) => Promise<HostToolResult>;
  readonly dispatchLadderProbe?: DispatchLadderProbe;
  readonly emitDiagnostic?: (diagnostic: Diagnostic) => void;
  readonly subagentRootRegime?: RootRegime;
}

export function producer(opts: ProducerOpts) {
  return createProductionProducerDeps({
    pi: {} as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
    ...(opts.hostLoopDispatch !== undefined ? { hostLoopDispatch: opts.hostLoopDispatch } : {}),
    ...(opts.dispatchLadderProbe !== undefined
      ? { dispatchLadderProbe: opts.dispatchLadderProbe }
      : {}),
    ...(opts.emitDiagnostic !== undefined ? { emitDiagnostic: opts.emitDiagnostic } : {}),
    ...(opts.subagentRootRegime !== undefined
      ? { subagentRootRegime: opts.subagentRootRegime }
      : {}),
  });
}

/** A frozen callable-set snapshot from `{ callableName -> entry }` pairs. */
export function snapshot(
  entries: readonly (readonly [string, ResolvedCallable])[],
): CallableSetSnapshot {
  return Object.freeze({ entries: new Map(entries) });
}

/** A prompt-mode theta whose tail is the code-side tool call under test. */
export function thetaWithSet(tail: Expr, callableSet: CallableSetSnapshot): ThetaCompositionInput {
  const frontmatter: ParsedFrontmatter = { mode: "prompt" };
  return {
    slashName: "demo",
    sourcePath: "/theta/demo.theta",
    frontmatter,
    body: body(tail),
    callableSet,
  };
}

/**
 * Drive the theta body through the real prompt-mode binding and return the tail
 * expression's value. A failed tool call produces an `Err` VALUE, so the outer
 * execution result is `Ok(<tail value>)` on every path here.
 */
export async function runBody(
  deps: ReturnType<typeof producer>,
  input: ThetaCompositionInput,
): Promise<ThetaValue> {
  const bindInput: ConversationBindInput = { theta: input, args: "", ctx: ctxDouble() };
  const binding = deps.bindPromptConversation(bindInput);
  const execution = await executeBody(input.body, binding.executeDeps);
  const outer = execution.result;
  if (!outer.present || outer.value === undefined) {
    throw new Error("body produced no final value");
  }
  return outer.value;
}

/** Read the `Err` carrier off a tail `ResultValue`, failing loudly when it is `Ok`. */
export function errOf(
  value: ThetaValue,
  why: string,
): {
  readonly kind?: string;
  readonly cause?: string;
  readonly message?: string;
  readonly tool_name?: string;
} {
  const result = value as ResultValue;
  expect(result.ok, why).toBe(false);
  return (
    value as unknown as {
      readonly error: {
        readonly kind?: string;
        readonly cause?: string;
        readonly message?: string;
        readonly tool_name?: string;
      };
    }
  ).error;
}

/** A recording built-in-shaped entry: `{ toolName, parameters, execute }`. */
export function builtinEntry(
  toolName: string,
  parameters: unknown,
  record: { dispatched: boolean },
): ResolvedCallable {
  return {
    kind: "pi-tool",
    toolDefinition: {
      toolName,
      parameters,
      execute: (): Promise<AgentToolResultEnvelope> => {
        record.dispatched = true;
        return Promise.resolve({ content: [{ type: "text", text: "TOOL-RAN" }] });
      },
    },
  };
}
