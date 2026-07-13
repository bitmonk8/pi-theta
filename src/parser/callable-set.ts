// V6c / V6c-T — the `tools:` callable set and resolution snapshot seam.
//
// This module owns the loom-load-time resolution of the frontmatter `tools:`
// field into the frozen per-loom **callable set** described by
// frontmatter/frontmatter-fields-a.md §`tools` and its resolution-snapshot
// prose in frontmatter/frontmatter-fields-b-and-templates.md:
//
//   - the two interchangeable YAML spellings (comma-separated short form and
//     YAML list form) parsed by one per-entry grammar;
//   - Pi-tool entries (resolved against the host tool registry) and `.loom`-path
//     entries (resolved against the per-load-pass parse cache);
//   - the default name derivation (Pi-tool name verbatim; `.loom` basename with
//     hyphens replaced by underscores) and the `as <name>` rename override;
//   - the five load-time rejections — `loom/load/unknown-tool`,
//     `loom/load/unresolvable-loom-path`, `loom/load/prompt-mode-callable`,
//     `loom/load/invalid-tool-rename`, `loom/load/tool-name-collision`;
//   - the frozen resolution snapshot (no ambient inheritance): only the
//     explicitly-listed callables appear, and an absent / empty `tools:` yields
//     the empty callable set.
//
// V6c-T (tests-task) declares the seam shapes — `resolveCallableSet`, the
// injected `CallableSetDeps` lookups, the `ToolsField` input, and the
// `CallableSetSnapshot` / result records — and stubs `resolveCallableSet` as an
// inert seam (registers an empty, unfrozen snapshot; raises no diagnostic) so
// the failing V6c-T tests compile and red on their own primary assertions. The
// paired V6c implementation leaf fills it in.
//
// Spec: frontmatter/frontmatter-fields-a.md (§`tools`, FRNT-2, FRNT-3),
// frontmatter/frontmatter-fields-b-and-templates.md (§Resolution snapshot),
// lexical.md (§Extension matching, §Path literals).

import type { Diagnostic } from "../diagnostics/diagnostic";
import type { LoomMode } from "./frontmatter";

/**
 * The raw `tools:` frontmatter value in either accepted YAML spelling
 * (frontmatter-fields-b-and-templates.md §YAML-shape):
 *   - `absent`  — `tools:` omitted or `tools: []`; the empty callable set.
 *   - `scalar`  — the comma-separated short form (`tools: read, grep, bash`);
 *                 the YAML plain scalar split on commas, each entry trimmed.
 *   - `list`    — the YAML list form; one entry per sequence item.
 * Both spellings are parsed by the same per-entry grammar.
 */
export type ToolsField =
  | { readonly kind: "absent" }
  | { readonly kind: "scalar"; readonly text: string }
  | { readonly kind: "list"; readonly items: readonly string[] };

/**
 * A Pi tool resolved against the host tool registry — the resolution snapshot
 * holds a strong reference to the resolved `ToolDefinition` (its `execute`,
 * `parameters`, and metadata at the moment of load).
 */
export interface ResolvedPiTool {
  readonly kind: "pi-tool";
  /** Strong reference to the resolved Pi `ToolDefinition` (opaque to this seam). */
  readonly toolDefinition: unknown;
}

/**
 * A `.loom` callee resolved against the per-load-pass parse cache — the
 * resolution snapshot holds a strong reference to the parsed callee plus its
 * lowered tool spec. `mode` gates the `loom/load/prompt-mode-callable` check.
 */
export interface ResolvedLoomCallee {
  readonly kind: "loom";
  /** The callee loom file's declared `mode:`. */
  readonly mode: LoomMode;
  /**
   * The callee `.loom` path literal AS WRITTEN in `tools:` (relative to the
   * caller's directory), carried onto the frozen snapshot so the runtime
   * resolves the callee by its presented (post-`as` / post-hyphen→underscore)
   * name rather than re-deriving it from the basename — which would drop both
   * the `as` rename and the hyphen→underscore rewrite and silently omit the
   * callable. Set authoritatively from the entry's `spec` by `resolveEntry`.
   */
  readonly calleePath: string;
  /** Strong reference to the parsed callee + lowered tool spec (opaque here). */
  readonly callee: unknown;
}

/** One resolved callable in the snapshot. */
export type ResolvedCallable = ResolvedPiTool | ResolvedLoomCallee;

/**
 * The frozen per-loom resolution snapshot: a `{ post-rename name → resolved
 * callable }` table (frontmatter-fields-b-and-templates.md §Resolution
 * snapshot). Frozen so no ambient inheritance or post-load mutation can widen
 * the callable set; subsequent calls dispatch through the held references.
 */
export interface CallableSetSnapshot {
  readonly entries: ReadonlyMap<string, ResolvedCallable>;
}

/** The injected host lookups the resolver consults at load time. */
export interface CallableSetDeps {
  /**
   * Resolve a Pi tool name against the host tool registry, returning a strong
   * reference to its `ToolDefinition`, or `undefined` when the name is absent
   * from the registry (drives `loom/load/unknown-tool`).
   */
  readonly resolvePiTool: (name: string) => ResolvedPiTool | undefined;
  /**
   * Resolve a `.loom` path (relative to the calling loom's directory) through
   * the per-load-pass parse cache, returning the parsed callee (carrying its
   * declared `mode:`), or `undefined` when the path does not exist or is not
   * readable (drives `loom/load/unresolvable-loom-path`).
   */
  readonly resolveLoomCallee: (loomPath: string) => ResolvedLoomCallee | undefined;
  /**
   * Names already bound at the loom's top level — top-level `fn` declarations
   * and imported symbols — that a callable-set name must not collide with
   * (drives the top-level arm of `loom/load/tool-name-collision`).
   */
  readonly reservedNames: ReadonlySet<string>;
}

/** Inputs to a callable-set resolution. */
export interface ResolveCallableSetInput {
  /** The source file path, for located diagnostics. */
  readonly file: string;
  /** The raw `tools:` frontmatter value (either YAML spelling). */
  readonly tools: ToolsField;
  /** The injected host lookups the resolver consults. */
  readonly deps: CallableSetDeps;
}

/** The outcome of a callable-set resolution: registration decision + diagnostics. */
export interface CallableSetResult {
  /**
   * Whether the loom is registered. `false` when any load-time rejection fired
   * (unknown tool, unresolvable / prompt-mode `.loom`, invalid rename, name
   * collision); `true` when the callable set resolved cleanly.
   */
  readonly registered: boolean;
  /** The frozen resolution snapshot, present iff `registered` is `true`. */
  readonly callableSet?: CallableSetSnapshot;
  /** Every diagnostic raised during resolution, in source order. */
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Resolve a loom's `tools:` field into its frozen callable set
 * (frontmatter-fields-a.md §`tools`, frontmatter-fields-b-and-templates.md
 * §Resolution snapshot):
 *
 *   - parse both YAML spellings by one per-entry grammar;
 *   - resolve each Pi-tool / `.loom` entry, applying the default-name / `as`
 *     rename rules;
 *   - reject an unknown Pi tool (`loom/load/unknown-tool`), an unresolvable
 *     `.loom` path (`loom/load/unresolvable-loom-path`), a prompt-mode `.loom`
 *     callee (`loom/load/prompt-mode-callable`), an invalid `as` rename target
 *     (`loom/load/invalid-tool-rename`), and a name collision
 *     (`loom/load/tool-name-collision`);
 *   - freeze the resulting snapshot (no ambient inheritance).
 *
 * The loom registers iff no error-severity diagnostic was raised.
 */
export function resolveCallableSet(
  input: ResolveCallableSetInput,
): CallableSetResult {
  const { file, tools, deps } = input;
  const diagnostics: Diagnostic[] = [];
  const entries = new Map<string, ResolvedCallable>();

  for (const raw of splitEntries(tools)) {
    const parsed = parseEntry(raw);

    // Validate an `as` rename target before resolving the underlying callable:
    // a rename target that is not loom-identifier-shaped is rejected outright
    // (frontmatter-fields-a.md §`tools` — the `as` rename rule).
    if (parsed.rename !== undefined && !isLowercaseFirstIdentifier(parsed.rename)) {
      diagnostics.push({
        severity: "error",
        code: "loom/load/invalid-tool-rename",
        file,
        message: `'as ${parsed.rename}' rename target must be lowercase-first; got '${parsed.rename}'`,
      });
      continue;
    }

    // Resolve the entry's underlying callable and compute its default name.
    const resolution = resolveEntry(parsed.spec, deps, file);
    if (resolution.diagnostic !== undefined) {
      diagnostics.push(resolution.diagnostic);
      continue;
    }

    const name = parsed.rename ?? resolution.defaultName;

    // Name-collision: against a name already bound by an earlier entry, or a
    // top-level `fn` / imported symbol.
    if (entries.has(name) || deps.reservedNames.has(name)) {
      diagnostics.push({
        severity: "error",
        code: "loom/load/tool-name-collision",
        file,
        message: `tool name '${name}' collides with another 'tools:' entry, top-level fn, or import`,
      });
      continue;
    }

    entries.set(name, resolution.callable);
  }

  // The loom registers iff no error-severity diagnostic was raised. On any
  // rejection there is no resolution snapshot.
  const registered = !diagnostics.some((d) => d.severity === "error");
  if (!registered) {
    return { registered, diagnostics };
  }

  // Freeze the snapshot so no ambient inheritance or post-load mutation can
  // widen the resolved callable set (frontmatter-fields-b-and-templates.md
  // §Resolution snapshot).
  const callableSet: CallableSetSnapshot = Object.freeze({ entries });
  return { registered, callableSet, diagnostics };
}

/** A parsed `tools:` entry: the callable spec plus an optional `as` rename. */
interface ParsedEntry {
  /** The Pi-tool name or `.loom` path literal as written. */
  readonly spec: string;
  /** The `as <name>` rename target, if present. */
  readonly rename?: string;
}

/** The outcome of resolving one entry's underlying callable. */
interface EntryResolution {
  /** The resolved callable, present iff `diagnostic` is absent. */
  readonly callable: ResolvedCallable;
  /** The default (pre-rename) name for the entry. */
  readonly defaultName: string;
  /** The rejection diagnostic, present iff resolution failed. */
  readonly diagnostic?: Diagnostic;
}

/**
 * Split a `tools:` value into per-entry strings. Both YAML spellings reduce to
 * the same per-entry grammar (frontmatter-fields-b-and-templates.md
 * §YAML-shape): the comma short form is the plain scalar split on commas with
 * each entry trimmed; the list form takes one entry per sequence item. Empty
 * entries are dropped.
 */
function splitEntries(tools: ToolsField): readonly string[] {
  switch (tools.kind) {
    case "absent":
      return [];
    case "scalar":
      return tools.text
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    case "list":
      return tools.items.map((s) => s.trim()).filter((s) => s.length > 0);
  }
}

/**
 * Parse one trimmed entry into its callable spec and optional `as` rename. The
 * grammar is `<spec> ('as' <name>)?`; neither a `.loom` path nor an `as` target
 * contains whitespace, so a whitespace split disambiguates.
 */
function parseEntry(raw: string): ParsedEntry {
  const parts = raw.split(/\s+/).filter((p) => p.length > 0);
  const rename = parts.length >= 3 && parts[1] === "as" ? parts[2] : undefined;
  return rename !== undefined ? { spec: parts[0] ?? "", rename } : { spec: parts[0] ?? "" };
}

/**
 * Resolve one entry's spec to a callable, or produce the rejection diagnostic.
 * A bare identifier is a Pi-tool name (resolved against the host registry);
 * anything else is a `.loom` path literal (resolved against the parse cache,
 * then gated on subagent-mode).
 */
function resolveEntry(
  spec: string,
  deps: CallableSetDeps,
  file: string,
): EntryResolution {
  if (isBareIdentifier(spec)) {
    const resolved = deps.resolvePiTool(spec);
    if (resolved === undefined) {
      return {
        callable: { kind: "pi-tool", toolDefinition: undefined },
        defaultName: spec,
        diagnostic: {
          severity: "error",
          code: "loom/load/unknown-tool",
          file,
          message: `unknown Pi tool '${spec}'`,
        },
      };
    }
    // A Pi-tool entry's default name is the Pi tool name verbatim.
    return { callable: resolved, defaultName: spec };
  }

  // `.loom` path entry.
  const resolved = deps.resolveLoomCallee(spec);
  const defaultName = loomDefaultName(spec);
  if (resolved === undefined) {
    return {
      callable: { kind: "loom", mode: "subagent", callee: undefined, calleePath: spec },
      defaultName,
      diagnostic: {
        severity: "error",
        code: "loom/load/unresolvable-loom-path",
        file,
        message: `cannot resolve .loom path '${spec}'`,
      },
    };
  }
  // Carry the authoritative callee path literal (the entry's `spec`, as written)
  // onto the snapshot entry. The deps lookup is keyed by that same literal, so
  // this is the single source of truth for how the runtime later reopens the
  // callee — independent of the presented name's hyphen/rename rewrites.
  const withPath: ResolvedLoomCallee = { ...resolved, calleePath: spec };
  if (resolved.mode === "prompt") {
    return {
      callable: withPath,
      defaultName,
      diagnostic: {
        severity: "error",
        code: "loom/load/prompt-mode-callable",
        file,
        message: `'tools:' entry '${spec}' points at a prompt-mode loom; only subagent-mode looms are permitted`,
      },
    };
  }
  return { callable: withPath, defaultName };
}

/**
 * The default name for a `.loom` path entry: the file's basename without the
 * `.loom` extension, with hyphens replaced by underscores
 * (`./code-review.loom` → `code_review`).
 */
function loomDefaultName(loomPath: string): string {
  const basename = loomPath.slice(loomPath.lastIndexOf("/") + 1);
  const stem = basename.endsWith(".loom") ? basename.slice(0, -".loom".length) : basename;
  return stem.replace(/-/g, "_");
}

/**
 * A bare loom identifier `[A-Za-z_][A-Za-z0-9_]*` with no path separator or
 * extension — the shape that marks a `tools:` entry as a Pi-tool name rather
 * than a `.loom` path literal.
 */
function isBareIdentifier(spec: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(spec);
}

/**
 * The loom lowercase-first identifier rule (lexical.md §Identifiers): a
 * lowercase letter or `_` first, then identifier characters. The `as` rename
 * target must satisfy this.
 */
function isLowercaseFirstIdentifier(name: string): boolean {
  return /^[a-z_][A-Za-z0-9_]*$/.test(name);
}
