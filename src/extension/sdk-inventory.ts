// V18a / V18a-T — the SDK capability + surface inventory seam.
//
// This module owns the two build-time pinned constants the inventory audit
// (`V18b`) and the version-bump gates (`V18c`) resolve against, per
// pi-integration-contract/inventory-audit-intro.md §"SDK capability inventory"
// and capability-inventory-items.md:
//
//   • `CAPABILITY_OBLIGATIONS` — the seven named SDK capabilities (items 1–7),
//     each carrying a `verification` partition flag classifying it as
//     factory-probed (Step 0) vs verified-otherwise. Items 1/2/4/6 are the
//     factory-probable subset `V9a` pins as `FACTORY_PROBABLE_CAPABILITIES`
//     (RFC-0005 dropped capability 3 — its in-process `createAgentSession`
//     `typeof` pin retired; it is verified by the Step 0 (f) executable probe);
//     items 3/5/7 are verified otherwise. The build-time assertions reconcile
//     the factory-probed-flagged subset against that imported constant (not
//     against a literal list re-stated here) and pin the cardinality at seven.
//
//   • `SDK_SURFACE_INVENTORY` — the full Pi-side surface set, strictly broader
//     than the seven capabilities (inventory-audit-intro.md §SDK capability
//     inventory). Beyond the capability members it carries the non-capability
//     `pi.<member>` surfaces (`pi.registerFlag` / `pi.getFlag`, per §"Non-
//     capability `pi.<member>` surfaces") and the `pi-engines-node`,
//     `peer-dep-range`, `strict-capability-probe`, and `api-coverage` rows the
//     version-bump gates read as operands. Each row is tagged with its kind
//     under the leaf-owned entry-kind taxonomy (`SurfaceEntryKind`).
//
// V18a-T (this tests-task) declares the seam types and stubs both constants as
// empty frozen arrays so the paired failing tests compile and red on their own
// primary assertions (cardinality / partition / row-resolution). The paired
// `V18a` implementation leaf fills the two constants in.
//
// `Object.freeze` keeps these module-level constants off the *No globals,
// statics, singletons* mutable-binding scan (runtime-immutable lists).

import { FACTORY_PROBABLE_CAPABILITIES } from "./capability-probe";
import type { CapabilityId } from "./capability-probe";

/**
 * How an SDK capability's presence is verified: at factory time by the Step 0
 * capability probe (`V9a`), or by some other build-time / load-time mechanism.
 */
export type CapabilityVerification = "factory-probed" | "verified-otherwise";

/**
 * One row of the seven-capability inventory (capability-inventory-items.md
 * items 1–7). `item` is the 1-based inventory index; `verification` is the
 * partition flag the build-time assertion reconciles against
 * `FACTORY_PROBABLE_CAPABILITIES`.
 */
export interface CapabilityObligation {
  readonly item: CapabilityId;
  readonly name: string;
  readonly verification: CapabilityVerification;
}

/**
 * The leaf-owned entry-kind taxonomy for `SDK_SURFACE_INVENTORY` rows. The spec
 * names only the `namespace-function` kind (the `pi.<member>` function members);
 * the remaining non-`namespace-function` kinds are implementation-owned and
 * classify the non-capability operand rows the version-bump gates read.
 */
export type SurfaceEntryKind =
  | "namespace-function"
  // The `SessionShutdownEvent['reason']` closed-set snapshot the unknown-reason
  // rule (`V9h`) reads its `literals` field from (pi-integration-contract/
  // unknown-reason-rule.md PIC-46). It is the single source of truth shared by
  // the build-time surface-inventory test and the runtime handler.
  | "type-union-snapshot"
  | "engines-pin"
  | "peer-dep-range"
  | "strict-capability-probe"
  | "api-coverage"
  // The three inventory-closure-audit (`V18b`) category entry kinds coined per
  // audit-target-categories.md §"Target surface categories": a category-(1)
  // `pi.<member>` member-access surface, a category-(2) named import from one
  // of the four `@earendil-works/*` peer packages, and a category-(3)
  // canonical-`ctx` member-access surface. Each participates in inventory
  // resolution via its `id` field (the audit's `path`): category-(1)/(3) by
  // rightmost dot-separated segment, category-(2) by leftmost segment.
  | "pi-member"
  | "peer-named-import"
  | "ctx-member";

/**
 * One row of the broader Pi-side surface inventory. `id` is the surface's
 * stable inventory key (e.g. `pi.registerFlag`, `pi-engines-node`); `kind`
 * tags it under the entry-kind taxonomy above.
 *
 * `payload` carries the per-kind operand data the version-bump gates (`V18c`)
 * read against the pinned SDK — the spec's "per-kind payload field shape"
 * (version-bump-step2.md §2(a); audit-target-categories.md §Target surface
 * categories). The non-`namespace-function` operand rows populate it: the
 * `engines-pin` row's `literal` (operand (ii) of the `engines.node` three-way
 * equality per version-bump-steps-3-4.md step 3), the `peer-dep-range` row's
 * `range`, the `strict-capability-probe` row's `probedName` (the theta-side probe
 * constant name the two-arm strict-capability gate consumes per
 * inventory-audit-intro.md #strict-capability-absence-under-probed-name and
 * version-bump-triggers.md step 7), and the `api-coverage` row's pinned `Api`
 * literal-union snapshot the provider seed-field `Api`-coverage gate enumerates
 * (provider-error-mapping.md #provider-seed-field-mapping). The presence-checkable
 * kinds carry no payload.
 */
export interface SurfaceInventoryEntry {
  readonly id: string;
  readonly kind: SurfaceEntryKind;
  readonly payload?: Readonly<Record<string, unknown>>;
  /**
   * The SDK-union path a `type-union-snapshot` row snapshots (PIC-46). The
   * unknown-reason rule locates its row by the composite predicate
   * `(kind === "type-union-snapshot") && (path === "SessionShutdownEvent.reason")`.
   */
  readonly path?: string;
  /**
   * The pinned closed-set literals a `type-union-snapshot` row carries; the
   * unknown-reason rule's set-membership check consumes this field directly
   * with no separate copy in the handler (PIC-45/PIC-46).
   */
  readonly literals?: readonly string[];
}

/**
 * The seven named SDK capabilities (capability-inventory-items.md items 1–7).
 *
 * The `verification` partition flag is DERIVED from the imported
 * `FACTORY_PROBABLE_CAPABILITIES` set `V9a` exports — not re-listed literally —
 * so the factory-probed/verified-otherwise classification cannot drift from the
 * Step-0 probe's own factory-probable set: any change to that set re-partitions
 * these rows in lockstep. Items 1/2/4/6 are factory-probed; 3/5/7 verified
 * otherwise (RFC-0005: capability 3's in-process members retired, verified by
 * the Step 0 (f) executable probe; capability-inventory-items.md items 3, 5, 7).
 *
 * `Object.freeze` keeps this module-level constant off the *No globals,
 * statics, singletons* mutable-binding scan (a frozen runtime-immutable list).
 */
export const CAPABILITY_OBLIGATIONS: readonly CapabilityObligation[] =
  Object.freeze(
    (
      [
        [1, "Slash-command registration"],
        [2, "Prompt-mode conversation drive"],
        [3, "Subagent-mode isolated session"],
        [4, "Tool registration and gating"],
        [5, "Cancellation propagation"],
        [6, "Custom-message channel and renderer"],
        [7, "Binder LLM model"],
      ] as const
    ).map(([item, name]): CapabilityObligation => ({
      item,
      name,
      verification: FACTORY_PROBABLE_CAPABILITIES.includes(item)
        ? "factory-probed"
        : "verified-otherwise",
    })),
  );

/**
 * The full Pi-side surface inventory — strictly broader than the seven
 * capabilities (inventory-audit-intro.md §SDK capability inventory). It holds:
 *
 *   • the seven `namespace-function` members of the factory-probable capability
 *     subset (capabilities 1/2/4/6, per Step 0 (c) of the capability probe;
 *     RFC-0005 retired capability 3's `createAgentSession` /
 *     `AgentSession.prototype.abort` members);
 *   • the two non-capability category-(1) `pi.<member>` `namespace-function`
 *     surfaces `pi.registerFlag` / `pi.getFlag` (inventory-audit-intro.md
 *     §"Non-capability `pi.<member>` surfaces"); and
 *   • the four non-`namespace-function` operand rows the version-bump gates
 *     (`V18c`) read — the in-repo Node floor (`pi-engines-node`), the
 *     `peerDependencies` literal (`peer-dep-range`), the strict-capability
 *     probe (`strict-capability-probe`), and the provider seed-field gate
 *     (`api-coverage`).
 *
 * `Object.freeze` keeps this module-level constant off the *No globals,
 * statics, singletons* mutable-binding scan (a frozen runtime-immutable list).
 */
export const SDK_SURFACE_INVENTORY: readonly SurfaceInventoryEntry[] =
  Object.freeze([
    // The `SessionShutdownEvent['reason']` closed-set snapshot the
    // unknown-reason rule (`V9h`) reads (PIC-45/PIC-46/PIC-48(c)). Single source
    // of truth across the build-time surface-inventory test and the runtime
    // `session_shutdown` handler; located by the composite
    // `(kind, path)` predicate, never by array position.
    {
      id: "SessionShutdownEvent.reason",
      kind: "type-union-snapshot",
      path: "SessionShutdownEvent.reason",
      literals: ["quit", "reload", "new", "resume", "fork"],
    },
    // The seven factory-probable capability function members (Step 0 (c)).
    // RFC-0005 retired capability 3's `AgentSession.prototype.abort` member from
    // the probe loop (verified by Step 0 (f) instead). `createAgentSession`
    // stays catalogued below as a still-imported surface until the producer's
    // RFC-0005 child-process retirement lands (production-theta-producer.ts).
    { id: "pi.registerCommand", kind: "namespace-function" },
    { id: "pi.sendUserMessage", kind: "namespace-function" },
    { id: "pi.registerTool", kind: "namespace-function" },
    { id: "pi.setActiveTools", kind: "namespace-function" },
    { id: "pi.getActiveTools", kind: "namespace-function" },
    { id: "pi.registerMessageRenderer", kind: "namespace-function" },
    { id: "pi.sendMessage", kind: "namespace-function" },
    // RFC-0005: `createAgentSession` and the former in-process subagent
    // satellites (`SessionManager` / `DefaultResourceLoader` / `getAgentDir` /
    // `defineTool` / `AgentToolResult` / `ToolDefinition`) have LEFT the
    // inventory entirely (capability-inventory-items.md item 3) — the subagent
    // drive spawns a child `pi` process and no `src/**` file imports them.
    // The two non-capability category-(1) `pi.<member>` surfaces.
    { id: "pi.registerFlag", kind: "namespace-function" },
    { id: "pi.getFlag", kind: "namespace-function" },
    // Additional category-(1) `pi.<member>` surfaces the runtime touches that
    // are not capability function members (`V18b`, audit-target-categories.md
    // category (1)): the factory-time / session-lifecycle `pi.on` subscription
    // surface and the `pi.getCommands()` collision-pass read.
    { id: "pi.on", kind: "pi-member" },
    { id: "pi.getCommands", kind: "pi-member" },
    // RFC-0005 (#subagent-isolation-and-trust): the subagent launch reads
    // `pi.getAllTools()` (name + `sourceInfo.scope`) for the project-local trust
    // inference (`--approve` / `--no-approve`).
    { id: "pi.getAllTools", kind: "pi-member" },
    // The category-(3) canonical-`ctx` member-access surfaces the runtime
    // touches (`V18b`, audit-target-categories.md category (3)), derived from
    // the `ExtensionContext` / `ExtensionCommandContext` `.d.ts` declarations.
    { id: "ctx.waitForIdle", kind: "ctx-member" },
    // The H8a production composition root reads these canonical-`ctx` members at
    // `session_start`: the host working directory the five-source discovery walk
    // is keyed to (`ctx.cwd`), the model registry the binder-model resolver /
    // model-reference matcher run over (`ctx.modelRegistry`), and the transient
    // toast surface discovery / parse diagnostics route through (`ctx.ui`), and
    // the UI-availability flag (`ctx.hasUI`) that gates the headless-mode stderr
    // mirror of error diagnostics (in print / RPC mode `ctx.ui.notify` is the
    // runner no-op, so a dropped-theta diagnostic is additionally written to
    // stderr — FMC-1 / DISCLI-2 / IMPORTS-3).
    { id: "ctx.cwd", kind: "ctx-member" },
    { id: "ctx.modelRegistry", kind: "ctx-member" },
    { id: "ctx.ui", kind: "ctx-member" },
    { id: "ctx.hasUI", kind: "ctx-member" },
    // The H8a per-theta run-drive resolves a chained (non-first) query off-session
    // through pi-ai's `complete()` against the dispatch context's current model.
    { id: "ctx.model", kind: "ctx-member" },
    // The H8a per-theta prompt-mode run-drive reads the dispatch context's
    // cancellation signal (the `thetaAbort`-equivalent every checkpoint gates on)
    // and the read-only session manager (the PIC-53 trailing-turn message list,
    // via `buildSessionContext(getEntries(), getLeafId())`).
    { id: "ctx.signal", kind: "ctx-member" },
    { id: "ctx.sessionManager", kind: "ctx-member" },
    // The category-(2) named-import surfaces from the four `@earendil-works/*`
    // peer packages the runtime imports (`V18b`, audit-target-categories.md
    // category (2); resolved by leftmost-segment against the imported name).
    { id: "ExtensionAPI", kind: "peer-named-import" },
    { id: "ExtensionContext", kind: "peer-named-import" },
    { id: "ExtensionCommandContext", kind: "peer-named-import" },
    // STAGE B (ceiling #2): the prompt-mode tool-loop governor bounds pi's
    // native agentic loop through the `tool_call` interception hook, whose
    // event and `{ block, reason }` result are these two peer surfaces.
    { id: "ToolCallEvent", kind: "peer-named-import" },
    { id: "ToolCallEventResult", kind: "peer-named-import" },
    // The H8a production composition root imports the host `ModelRegistry` type
    // (binder-model resolution + structured-output turns).
    { id: "ModelRegistry", kind: "peer-named-import" },
    // The H8a per-theta prompt-mode run-drive resolves the driven user session's
    // chronological message list through the `buildSessionContext` free function.
    { id: "buildSessionContext", kind: "peer-named-import" },
    // The H8a per-theta run-drive resolves a chained (non-first) query off-session
    // through pi-ai's `complete()` free function.
    { id: "complete", kind: "peer-named-import" },
    { id: "MessageRenderer", kind: "peer-named-import" },
    { id: "SlashCommandInfo", kind: "peer-named-import" },
    { id: "estimateTokens", kind: "peer-named-import" },
    { id: "AgentMessage", kind: "peer-named-import" },
    { id: "Api", kind: "peer-named-import" },
    { id: "Context", kind: "peer-named-import" },
    { id: "Model", kind: "peer-named-import" },
    { id: "Message", kind: "peer-named-import" },
    { id: "AssistantMessage", kind: "peer-named-import" },
    { id: "UserMessage", kind: "peer-named-import" },
    { id: "ToolResultMessage", kind: "peer-named-import" },
    { id: "TextContent", kind: "peer-named-import" },
    { id: "ToolCall", kind: "peer-named-import" },
    { id: "Tool", kind: "peer-named-import" },
    { id: "ProviderResponse", kind: "peer-named-import" },
    { id: "ProviderStreamOptions", kind: "peer-named-import" },
    { id: "Component", kind: "peer-named-import" },
    { id: "wrapTextWithAnsi", kind: "peer-named-import" },
    // The H8b live tool-call resolver constructs the host built-in tool
    // definitions by name so a code-side `<name>(args)` call can drive the
    // host tool's `execute(...)` directly (host-interfaces-core.md §"Tool
    // execution from theta code").
    { id: "createGrepToolDefinition", kind: "peer-named-import" },
    { id: "createReadToolDefinition", kind: "peer-named-import" },
    { id: "createFindToolDefinition", kind: "peer-named-import" },
    { id: "createLsToolDefinition", kind: "peer-named-import" },
    { id: "createBashToolDefinition", kind: "peer-named-import" },
    { id: "createEditToolDefinition", kind: "peer-named-import" },
    { id: "createWriteToolDefinition", kind: "peer-named-import" },
    // The non-`namespace-function` operand rows the version-bump gates (`V18c`)
    // read. Each carries the pinned operand its gate reconciles against the
    // pinned SDK: the in-repo Node floor (operand (ii) of the `engines.node`
    // three-way equality), the `peerDependencies` open floor, the theta-side
    // strict-capability probe field name, and the pinned pi-ai `Api`
    // literal-union snapshot the seed-field `Api`-coverage gate enumerates.
    {
      id: "pi-engines-node",
      kind: "engines-pin",
      payload: { literal: ">=22.19.0" },
    },
    {
      id: "peer-dep-range",
      kind: "peer-dep-range",
      // The open `peerDependencies` floor (host-prerequisites.md #pi-sdk-pin):
      // the operand the step-4 peer-dep gate reconciles the four peers against.
      payload: { range: ">=0.80.8" },
    },
    {
      id: "strict-capability-probe",
      kind: "strict-capability-probe",
      payload: { probedName: "strictCapable" },
    },
    {
      id: "api-coverage",
      kind: "api-coverage",
      payload: {
        // The pinned pi-ai `Api` literal-union snapshot (the `KnownApi` members
        // at the theta 1.0 Pi-SDK pin). `Api = KnownApi | (string & {})` is not
        // runtime-enumerable, so the seed-field `Api`-coverage gate enumerates
        // this pinned snapshot; a new pi-ai `Api` value lands here on a bump.
        apiUnionSnapshot: [
          "openai-completions",
          "mistral",
          "anthropic-messages",
          "amazon-bedrock",
        ],
      },
    },
  ]);
