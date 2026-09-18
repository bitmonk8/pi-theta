// RFC-0012 §10 — a shared "drive the CHILD regime under a `fn` launch entry"
// harness. A `subagent fn` body runs in a spawned child `pi` process: the
// child re-discovers the CALLING theta, reads `{kind: "fn", name}` off the
// control plane, intakes the marshalled arguments by parameter name (PIC-60)
// and runs the named body as its process-root invocation, stamping the
// envelope with the body's tail constructor (`fn_tail`). This module drives
// exactly that path in-process — `createProductionProducerDeps` composed as
// the child (`subagentRootRegime` active, `subagentControlPlane.entry` the fn
// entry, `PI_THETA_PARAMS` on the parent env, `emitResultEnvelope` captured) —
// so a cell about what a `subagent fn` BODY computes (its declaring-module
// scope, its INV-4 depth accounting, its tail value) has one offline
// observable: the envelope line the child would have written.
//
// The root double carries the REAL AJV-backed `schemaValidator` (the child
// intake AJV-checks each typed parameter against its lowered schema, and the
// parent validates the return against the fn's `): T`), a zero `Clock`, and a
// no-op checkpoint.
//
// The theta-entry root-drive and visible-regime tests share the lightweight
// root, pi, theta, and context builders below; fn-entry drives retain the AJV root.
//
// TIER: unit, offline, deterministic, provider-free.

import { expect } from "vitest";
import type { ExtensionAPI, ExtensionCommandContext, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { createProductionProducerDeps } from "../../src/extension/production-theta-producer";
import type { ConversationBindInput, ThetaCompositionInput } from "../../src/extension/theta-composition-producer";
import { newInvokeChainAtDepth } from "../../src/runtime/invoke-depth-cycle";
import { parseEnvelopeLine, type EnvelopeParse } from "../../src/runtime/subagent-envelope";
import { SUBAGENT_PARAMS_ENV } from "../../src/runtime/subagent-params";
import type { RuntimeRoot } from "../../src/runtime-root";
import type { Checkpoint } from "../../src/seams/checkpoint";
import { SEAM_NOOP_CHECKPOINT } from "./invoke-seam-scaffold";
import type { ParsedFrontmatter } from "../../src/parser/frontmatter";
import { parseExpressionSource } from "../../src/parser/theta-document";
import { ajv } from "./scripted-live-session-harness";

/** Fresh fixed-id and zero-clock doubles, with timers forwarded to the ambient host. */
function fixedIdsAndClock(): Pick<RuntimeRoot, "idSource" | "clock"> {
  return {
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    clock: {
      now: () => 0,
      wallNow: () => 0,
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
    },
  };
}

/** A `RuntimeRoot` double: real AJV validator, zero clock, no-op checkpoint, fixed ids. */
export function childRegimeRootDouble(): RuntimeRoot {
  return {
    checkpoint: SEAM_NOOP_CHECKPOINT,
    ...fixedIdsAndClock(),
    schemaValidator: ajv(),
  } as unknown as RuntimeRoot;
}

export interface DriveFnEntryInput {
  /** The CALLING theta as the child re-composed it (imports already materialised). */
  readonly theta: ThetaCompositionInput;
  /** The slug the child was launched under (`PI_THETA_SUBAGENT_ROOT`). */
  readonly slug: string;
  /** The `fn` entry name the parent put on the control plane. */
  readonly fnName: string;
  /** The PIC-60 params object the parent marshalled (by declared parameter name); absent = no params env. */
  readonly params: Record<string, unknown> | undefined;
  /** The INV-4 depth the parent marshalled (`PI_THETA_SUBAGENT_INVOKE_DEPTH`); default 1. */
  readonly inboundDepth?: number;
  readonly ctx?: ExtensionCommandContext;
  readonly modelRegistry?: ModelRegistry;
  readonly pi?: ExtensionAPI;
  /** RFC 0012 §7 (0.478.0): a fake `pi.events`-shaped bus; present ⇒ the child regime mirrors its terminal envelope arm onto it. */
  readonly outcomeEvents?: { emit(channel: string, data: unknown): void };
}

export interface DriveFnEntryOutcome {
  /** Every envelope line the child emitted (one for a well-formed drive). */
  readonly lines: readonly string[];
  /** The parsed first envelope line. */
  readonly envelope: EnvelopeParse;
  /** RFC 0012 §7 (0.478.0): every `[channel, data]` pair recorded on the injected `outcomeEvents` fake, empty when none was injected. */
  readonly outcomeEmissions: readonly { readonly channel: string; readonly data: unknown }[];
}

const DEFAULT_MODELS = [{ id: "claude-test", provider: "anthropic", api: "anthropic-messages" }];

function defaultCtx(): ExtensionCommandContext {
  return {
    model: DEFAULT_MODELS[0],
    cwd: "/work/project",
    signal: undefined,
    sessionManager: { getEntries: () => [], getLeafId: () => undefined },
  } as unknown as ExtensionCommandContext;
}

/**
 * Compose the producer as the CHILD of a `subagent fn` launch and run
 * `driveSubagentRootRegime` over `theta`, returning the envelope the child
 * wrote. Asserts the fn entry marks the theta a root (`isSubagentRootFor`,
 * FN-8) and that exactly one envelope line was emitted — a drive that wrote
 * none or several is a harness fault, not the value under witness.
 */
export async function driveSubagentFnEntry(input: DriveFnEntryInput): Promise<DriveFnEntryOutcome> {
  const lines: string[] = [];
  const outcomeEmissions: { channel: string; data: unknown }[] = [];
  const depth = input.inboundDepth ?? 1;
  const deps = createProductionProducerDeps({
    pi: input.pi ?? ({ sendMessage: (): void => {}, getAllTools: () => [] } as unknown as ExtensionAPI),
    root: childRegimeRootDouble(),
    modelRegistry: input.modelRegistry ?? ({ getAvailable: () => DEFAULT_MODELS } as unknown as ModelRegistry),
    subagentParentEnv: input.params !== undefined ? { [SUBAGENT_PARAMS_ENV]: JSON.stringify(input.params) } : {},
    subagentRootRegime: { active: true, slug: input.slug },
    subagentControlPlane: { env: {}, entry: { kind: "fn", name: input.fnName } },
    subagentInboundInvokeDepth: depth,
    emitResultEnvelope: (line: string) => lines.push(line),
    ...(input.outcomeEvents !== undefined
      ? {
          subagentOutcomeEvents: {
            emit: (channel: string, data: unknown): void => {
              outcomeEmissions.push({ channel, data });
              input.outcomeEvents!.emit(channel, data);
            },
          },
        }
      : {}),
  });
  expect(deps.isSubagentRootFor?.(input.theta), "a fn entry marks the launched theta a subagent root (FN-8)").toBe(true);
  await deps.driveSubagentRootRegime!({
    theta: input.theta,
    args: "",
    ctx: input.ctx ?? defaultCtx(),
    thetaAbort: new AbortController(),
    chain: newInvokeChainAtDepth(depth),
  });
  expect(lines, "a fn-entry drive writes exactly one envelope line").toHaveLength(1);
  return { lines, envelope: parseEnvelopeLine(lines[0]!.trimEnd()), outcomeEmissions };
}

/** Shared RecordingBus fixture for the child-regime witnesses. */
export class RecordingBus {
  readonly emitted: { channel: string; data: unknown }[] = [];
  emit(channel: string, data: unknown): void {
    this.emitted.push({ channel, data });
  }
}

/** Shared reportOf fixture for the child-regime witnesses. */
export function reportOf(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(
      `the driven root returned ${JSON.stringify(value)} instead of the R report object — ` +
        `the fixture set did not reach its tail expression, so no assertion below is meaningful`,
    );
  }
  return value as Record<string, unknown>;
}

export function rootDouble(checkpoint?: Checkpoint): RuntimeRoot {
  return {
    checkpoint: checkpoint ?? SEAM_NOOP_CHECKPOINT,
    ...fixedIdsAndClock(),
    schemaValidator: { compile: () => ({ validate: () => ({ ok: true as const }) }) },
  } as unknown as RuntimeRoot;
}

export function noopPi(): ExtensionAPI {
  return { sendMessage: (): void => {}, getAllTools: () => [] } as unknown as ExtensionAPI;
}

export function subagentTheta(tail: string): ThetaCompositionInput {
  return {
    slashName: "worker",
    sourcePath: "/theta/worker.theta",
    frontmatter: { mode: "subagent" } as unknown as ParsedFrontmatter,
    body: { statements: [], tail: parseExpressionSource(tail) },
    callableSet: { entries: new Map() },
  } as unknown as ThetaCompositionInput;
}

/** A parent-side subagent bind input with a bare context and a fresh abort controller. */
export function bindInput(): ConversationBindInput {
  const ctx = {
    model: { id: "claude-test", provider: "anthropic" },
    cwd: "/tmp",
    signal: undefined,
  } as unknown as ExtensionCommandContext;
  return { theta: subagentTheta('"unused-parent-side"'), args: "", ctx, thetaAbort: new AbortController() };
}

export function childCtx(shutdown?: () => void): ExtensionCommandContext {
  return {
    model: { id: "claude-test", provider: "anthropic" },
    cwd: "/tmp",
    signal: undefined,
    // The child's own (empty) host session — the regime drives against it.
    sessionManager: { getEntries: () => [], getLeafId: () => undefined },
    ...(shutdown !== undefined ? { shutdown } : {}),
  } as unknown as ExtensionCommandContext;
}
