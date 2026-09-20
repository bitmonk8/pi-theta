// Built-in and registry tool resolution shared by callable-set load checks.

import {
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ResolvedPiTool } from "../parser/callable-set";
import {
  normalizeToolSnapshot,
  type HostToolSnapshotEntry,
} from "../seams/host-tool-snapshot";

/** The theta-load-bearing shape of a host tool definition's `execute` member. */
type HostToolExecute = (
  toolCallId: string,
  params: never,
  signal: AbortSignal | undefined,
  onUpdate: undefined,
  ctx: ExtensionContext,
) => Promise<{ readonly content: readonly { readonly type: string }[] }>;

/**
 * H8b: construct the host built-in tool definition for `name` over `cwd`, or
 * `undefined` when the name is not a known host built-in. Each returns a
 * `ToolDefinition` whose `execute(...)` theta drives directly for a code-side
 * `<name>(args)` call (host-interfaces-core.md §"Tool execution from theta code").
 * A switch (not a module-level lookup object) keeps the composition root free of
 * module-level mutable state.
 */
function builtinToolDefinition(
  name: string,
  cwd: string,
): { execute: HostToolExecute; parameters?: unknown } | undefined {
  switch (name) {
    case "grep":
      return createGrepToolDefinition(cwd);
    case "read":
      return createReadToolDefinition(cwd);
    case "find":
      return createFindToolDefinition(cwd);
    case "ls":
      return createLsToolDefinition(cwd);
    case "bash":
      return createBashToolDefinition(cwd);
    case "edit":
      return createEditToolDefinition(cwd);
    case "write":
      return createWriteToolDefinition(cwd);
    default:
      return undefined;
  }
}

/**
 * Accessor for the RAW `pi.getAllTools()` snapshot the registry admission
 * reads. The entry shape is host-dependent (`ToolInfo[]` on Pi, `string[]` on
 * Oh-My-Pi), so the resolver normalises through `seams/host-tool-snapshot.ts`
 * rather than reading members off the raw entries.
 */
export type GetAllToolsSnapshot = () => readonly HostToolSnapshotEntry[];

/**
 * The load-time resolved shape an EXTENSION `pi-tool` callable-set entry
 * carries. Execute-less by construction (the public extension API strips
 * `execute`); such an entry dispatches through the PIC-64 ladder instead. The
 * built-in arm carries its own `execute` on `resolvePiTool`'s return type.
 */
interface PiToolLoadEntry {
  readonly toolName: string;
  /** The tool's registered input schema (RFC-0002 disjointness check reads it). */
  readonly parameters?: unknown;
}

/**
 * frontmatter-fields-a.md §`tools` / §Resolution snapshot (bug 0001): resolve a
 * `tools:` name against the extension-registered tool set (`pi.getAllTools()`)
 * — MODE-INDEPENDENTLY (prompt and subagent alike). A name present there is
 * admitted to the frozen callable set as a `pi-tool` entry carrying exactly
 * the §Resolution-snapshot shape ("holds only the tool's name and `parameters`
 * schema"): (a) the underlying `toolName` — the PIC-17 install-vector / PIC-64
 * dispatch name, and the name the subagent launch contract emits in the
 * child's `--tools` allowlist — and (b) the tool's registered `parameters`
 * schema, so the RFC-0002 computed-argument disjointness check and the model
 * tool spec can see it. The entry holds NO `execute` — the public extension
 * API strips it — so code-side dispatch routes through the PIC-64 ladder
 * (host-loop dispatch today) rather than a direct execute handle; and the
 * launch-path trust inference (`inferChildTrust`,
 * #subagent-isolation-and-trust) reads a fresh `pi.getAllTools()` snapshot at
 * spawn, never this pinned entry.
 */
function resolveRegistryExtensionTool(
  name: string,
  getAllTools: GetAllToolsSnapshot | undefined,
): PiToolLoadEntry | undefined {
  const info = normalizeToolSnapshot(getAllTools?.() ?? []).find(
    (tool) => tool.name === name,
  );
  if (info === undefined) {
    return undefined;
  }
  // A host that publishes bare names supplies no schema; the field stays absent
  // (never `undefined`-as-a-value) so the RFC-0002 disjointness check reads
  // "schema unknown" rather than "schema is undefined".
  return {
    toolName: name,
    ...(info.parameters === undefined ? {} : { parameters: info.parameters }),
  };
}

/**
 * H8b: resolve a code-side Pi-tool name to its `execute` dispatch. Returns
 * `undefined` for a name that is not a known host built-in, so the code-side
 * path surfaces the unknown-tool execution `Err` rather than fabricating a
 * value. The synthesised `execute` invokes the host tool with a `theta-direct:`
 * tool-call id and maps its `AgentToolResult` to theta's `content`-only envelope.
 */
export function resolvePiTool(
  name: string,
  ctx: ExtensionContext,
): {
  readonly toolName: string;
  readonly parameters?: unknown;
  execute: (id: string, params: unknown, signal: AbortSignal) => Promise<{ readonly content: readonly { readonly type: string }[] }>;
} | undefined {
  const definition = builtinToolDefinition(name, ctx.cwd);
  if (definition === undefined) {
    return undefined;
  }
  return {
    toolName: name,
    // Bug 0072: the snapshot entry carries the tool's registered input schema
    // for a host BUILT-IN, as `resolveRegistryExtensionTool` below carries it
    // for an extension tool — frontmatter-fields-a.md §`tools` binds every
    // resolved entry to it, and the pre-dispatch AJV check
    // (`#resolvePiToolForTheta` → `PiToolDispatch.parameters`) reads it from
    // there.
    parameters: definition.parameters,
    execute: async (id, params, signal) => {
      const result = await definition.execute(id, params as never, signal, undefined, ctx);
      return { content: result.content };
    },
  };
}

/** Resolve a callable-set Pi tool, preferring built-ins to the registry snapshot. */
export function resolveCallablePiTool(
  name: string,
  ctx: ExtensionContext,
  getAllTools: GetAllToolsSnapshot | undefined,
): ResolvedPiTool | undefined {
  const builtin = resolvePiTool(name, ctx);
  if (builtin !== undefined) {
    // Built-in Pi tools resolve in both modes (unchanged in prompt mode).
    return { kind: "pi-tool", toolDefinition: builtin };
  }
  // frontmatter-fields-a.md §`tools` (bug 0001): registry-snapshot
  // admission is MODE-INDEPENDENT — an extension-supplied tool present in
  // `pi.getAllTools()` is admitted to the allowlist in prompt and subagent
  // mode alike (schema carried for the RFC-0002 disjointness check; the
  // launch-path trust inference reads its own fresh `pi.getAllTools()`
  // snapshot at spawn, never this entry). A name that is neither a
  // built-in, a `getAllTools()` name, nor a discovered `.theta` callable
  // still fails load with `theta/load/unknown-tool`.
  const extension = resolveRegistryExtensionTool(name, getAllTools);
  if (extension !== undefined) {
    return { kind: "pi-tool", toolDefinition: extension };
  }
  return undefined;
}
