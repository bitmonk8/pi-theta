// V15a / V15a-T — the invocation-core seam.
//
// This module owns two invocation-core seams the paired `V15a` implementation
// leaf fills in:
//
//   - INV-1 — the symlink-resolution-hardening seam. A single named
//     `realpath`-then-discovery-root-containment check shared by the load-time
//     registration check and the invocation-time runtime re-check, so both
//     apply the identical segment-boundary within-root predicate. An escape
//     (a resolved callee path outside every active discovery root) surfaces on
//     both channels at runtime: a `loom/load/invoke-path-escape` diagnostic and
//     `Err(InvokeInfraError { cause: "load_failure", callee_path, ... })`.
//
//   - The static-resolution per-pass parse cache. A single per-load-pass walk
//     from the entry loom, transitively across literal `invoke("./x.loom")`
//     paths and `.loom` `tools:` entries, parsing and lowering each visited
//     file exactly once into the cache (implementation-notes.md
//     "Static-resolution load pass", invocation.md §Static resolution).
//
// V15a-T (tests-task) declares the seam shapes and stubs the behaviour-bearing
// functions inertly so the failing tests compile and red on their own primary
// assertions:
//   - `checkInvokePathContainment` returns an inert `""` canonical path and
//     `within: false`, so both the within-root and the byte-exact-`realpath`
//     assertions red.
//   - `checkInvokePathAtLoad` / `recheckInvokePathAtRuntime` return an inert
//     `"within"` verdict with a `""` canonical path and emit neither the
//     escape diagnostic nor the `InvokeInfraError`, so both channels red.
//   - `runStaticResolutionPass` returns an empty cache and never calls
//     `parseAndLower`, so the "each visited file parsed exactly once" and the
//     transitive-reachability assertions red.
// No test reds on a compile error, a missing fixture, or a harness throw.
//
// Spec: invocation.md (INV-1, §Static resolution), discovery/discovery-sources.md
// (§Discovery roots), return.md, implementation-notes.md.

import type { FileSystem } from "../seams/file-system";
import type { Diagnostic } from "../diagnostics/diagnostic";
import type { InvokeInfraError } from "./query-error";

// --------------------------------------------------------------------------
// INV-1 — invoke-path discovery-root containment (load-time + runtime re-check)
// --------------------------------------------------------------------------

/**
 * The `loom/load/invoke-path-escape` diagnostic code (code-registry-load.md).
 * Fires at both the load-time containment check and the runtime open re-check
 * when a resolved callee path lies outside every active discovery root.
 */
export const INVOKE_PATH_ESCAPE_CODE = "loom/load/invoke-path-escape";

/**
 * The rendered author-facing message for `loom/load/invoke-path-escape`, sourced
 * from the *Message* column of code-registry-load.md. `<path>` is the literal
 * path text as written (no realpath normalisation) per placeholder-rendering-b.md.
 */
export function invokePathEscapeMessage(literalPath: string): string {
  return `invoke path '${literalPath}' resolves outside every active discovery root`;
}

/** The normative author-facing hint for `loom/load/invoke-path-escape`. */
export const INVOKE_PATH_ESCAPE_HINT =
  "Move the callee under one of the active discovery roots (see Directory Convention — Discovery roots), or add the callee's directory as a settings loomPaths entry.";

/** Host dependencies the shared containment check needs. */
export interface InvokePathCheckDeps {
  /** The injected `FileSystem` seam; only `realpath` is consulted. */
  readonly fs: Pick<FileSystem, "realpath">;
}

/**
 * The outcome of the INV-1 shared `realpath`-then-segment-boundary-containment
 * check on one resolved callee path against the active discovery-root union.
 */
export interface InvokePathContainment {
  /**
   * The byte-exact `FileSystem.realpath` output for the resolved callee path —
   * the value the containment comparison is decided on (invocation.md
   * §Resolution). Forward-slash-normalised per the Lexical "Path literals" rule.
   */
  readonly canonicalPath: string;
  /**
   * True iff `canonicalPath` lies within at least one active root under the
   * segment-boundary within-root predicate: after normalisation strips any
   * trailing separator from a root, the callee is within it when it equals the
   * root byte-for-byte or begins with the root followed by a single separator.
   */
  readonly within: boolean;
}

/**
 * INV-1 shared check. `realpath`-normalise `resolvedPath` and each active root,
 * then decide segment-boundary containment against the *currently* active root
 * union. This is the single named function both the load-time registration
 * check and the invocation-time runtime re-check call, so both apply identical
 * semantics (the maintainability factoring INV-1's implementation note names).
 */
export async function checkInvokePathContainment(
  deps: InvokePathCheckDeps,
  resolvedPath: string,
  activeRoots: readonly string[],
): Promise<InvokePathContainment> {
  // The containment comparison is decided on the byte-exact `realpath` output of
  // *both* the resolved callee path and each active root (invocation.md
  // §Resolution). Forward-slash-normalise per the Lexical "Path literals" rule;
  // no independent case-folding — the canonical form is whatever `realpath`
  // returns on the host.
  const canonicalPath = normalizePath(await deps.fs.realpath(resolvedPath));

  for (const root of activeRoots) {
    const canonicalRoot = stripTrailingSeparator(
      normalizePath(await deps.fs.realpath(root)),
    );
    // Segment-boundary containment: within iff the callee equals the root
    // byte-for-byte or begins with the root followed by a single separator. A
    // bare prefix test is insufficient — it admits sibling-prefix escape.
    if (
      canonicalPath === canonicalRoot ||
      canonicalPath.startsWith(`${canonicalRoot}/`)
    ) {
      return { canonicalPath, within: true };
    }
  }

  return { canonicalPath, within: false };
}

/** Forward-slash-normalise a host path (per the Lexical "Path literals" rule). */
function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

/** Strip a single trailing forward-slash separator from a normalised root. */
function stripTrailingSeparator(root: string): string {
  return root.endsWith("/") ? root.slice(0, -1) : root;
}

/** Common inputs to the load-time and runtime containment surfaces. */
export interface InvokePathSurfaceInput {
  readonly deps: InvokePathCheckDeps;
  /**
   * The parse-time resolved callee path (resolved relative to the calling
   * loom's directory), fed into the shared containment check.
   */
  readonly resolvedPath: string;
  /**
   * The `invoke(...)` path literal exactly as written, used verbatim for the
   * diagnostic's `<path>` placeholder (no realpath normalisation).
   */
  readonly literalPath: string;
  /** The currently-active discovery-root union. */
  readonly activeRoots: readonly string[];
}

/** Load-time containment verdict: within, or an escape carrying its diagnostic. */
export type LoadTimeInvokePathResult =
  | { readonly kind: "within"; readonly canonicalPath: string }
  | {
      readonly kind: "escape";
      readonly canonicalPath: string;
      readonly diagnostic: Diagnostic;
    };

/**
 * The load-time containment check (parent-loom registration / `tools:` `.loom`
 * entry registration). On escape it yields a `loom/load/invoke-path-escape`
 * diagnostic; the parent does not register the call site.
 */
export async function checkInvokePathAtLoad(
  input: InvokePathSurfaceInput,
): Promise<LoadTimeInvokePathResult> {
  const { canonicalPath, within } = await checkInvokePathContainment(
    input.deps,
    input.resolvedPath,
    input.activeRoots,
  );
  if (within) {
    return { kind: "within", canonicalPath };
  }
  return {
    kind: "escape",
    canonicalPath,
    diagnostic: invokePathEscapeDiagnostic(input.literalPath),
  };
}

/**
 * Build the `loom/load/invoke-path-escape` diagnostic. The `<path>` placeholder
 * carries the literal path as written (no realpath normalisation) per the
 * registry *Message* column; the hint is the registry *Hint* column verbatim.
 */
function invokePathEscapeDiagnostic(literalPath: string): Diagnostic {
  return {
    severity: "error",
    code: INVOKE_PATH_ESCAPE_CODE,
    message: invokePathEscapeMessage(literalPath),
    hint: INVOKE_PATH_ESCAPE_HINT,
  };
}

/**
 * Runtime containment verdict for the invocation-time open re-check. On escape
 * it surfaces on *both* channels: the `loom/load/invoke-path-escape` diagnostic
 * on the drain and `Err(InvokeInfraError { cause: "load_failure", ... })` to
 * the parent.
 */
export type RuntimeInvokePathResult =
  | { readonly kind: "within"; readonly canonicalPath: string }
  | {
      readonly kind: "escape";
      readonly canonicalPath: string;
      readonly diagnostic: Diagnostic;
      readonly error: InvokeInfraError;
    };

/**
 * The invocation-time re-check the runtime runs at the moment it opens the
 * callee for invocation, using the *currently* active discovery-root set (a
 * hot-reload that removed the relied-upon root causes fail-closed). Applies the
 * identical containment semantics as the load-time check via the shared
 * `checkInvokePathContainment`.
 */
export async function recheckInvokePathAtRuntime(
  input: InvokePathSurfaceInput,
): Promise<RuntimeInvokePathResult> {
  const { canonicalPath, within } = await checkInvokePathContainment(
    input.deps,
    input.resolvedPath,
    input.activeRoots,
  );
  if (within) {
    return { kind: "within", canonicalPath };
  }
  // An escape surfaces on both channels (invocation.md §Resolution / INV-1): the
  // `loom/load/invoke-path-escape` diagnostic on the drain AND
  // `Err(InvokeInfraError { cause: "load_failure", callee_path, ... })` to the
  // parent.
  return {
    kind: "escape",
    canonicalPath,
    diagnostic: invokePathEscapeDiagnostic(input.literalPath),
    error: {
      kind: "invoke_infra",
      message: invokePathEscapeMessage(input.literalPath),
      callee_path: input.resolvedPath,
      cause: "load_failure",
    },
  };
}

// --------------------------------------------------------------------------
// Static-resolution per-pass parse cache (transitive parse/lower walk)
// --------------------------------------------------------------------------

/**
 * A single visited file's parsed+lowered shape, as returned by the
 * `parseAndLower` callback and stored in the per-pass parse cache. Its outbound
 * edges are the canonical paths reached from this file's literal `invoke`
 * paths and `.loom` `tools:` entries; the transitive walk follows them.
 */
export interface ParsedCallee {
  /** The canonical (`realpath`) path of this file — the parse-cache key. */
  readonly path: string;
  /** Canonical paths referenced by this file's literal `invoke("./x.loom")`. */
  readonly invokePaths: readonly string[];
  /** Canonical paths of this file's `.loom` `tools:` entries. */
  readonly toolLoomPaths: readonly string[];
}

/** Host dependencies and the parse/lower callback the walk drives. */
export interface StaticResolutionDeps {
  /** The injected `FileSystem` seam; `realpath` canonicalises each edge, `readText` sources each visited file. */
  readonly fs: Pick<FileSystem, "realpath" | "readText">;
  /**
   * Parse and lower one visited file. The pass MUST invoke this **exactly once
   * per canonical path** across the whole transitive walk (the per-pass parse
   * cache). `canonicalPath` is the `realpath` output; `source` is the file's
   * text. The returned `ParsedCallee` supplies the outbound edges to follow.
   */
  readonly parseAndLower: (canonicalPath: string, source: string) => ParsedCallee;
}

/** The outcome of one static-resolution pass. */
export interface StaticResolutionResult {
  /** The per-pass parse cache: canonical path → its parsed+lowered `ParsedCallee`. */
  readonly cache: ReadonlyMap<string, ParsedCallee>;
}

/**
 * Run the static-resolution load pass from `entryPath`, walking transitively
 * across literal `invoke` paths and `.loom` `tools:` entries, parsing and
 * lowering each visited file exactly once into the per-pass parse cache.
 */
export async function runStaticResolutionPass(
  deps: StaticResolutionDeps,
  entryPath: string,
): Promise<StaticResolutionResult> {
  const cache = new Map<string, ParsedCallee>();
  // Frontier of canonical paths still to visit; the entry is canonicalised so
  // the cache is keyed uniformly on `realpath` output.
  const frontier: string[] = [normalizePath(await deps.fs.realpath(entryPath))];

  while (frontier.length > 0) {
    const canonicalPath = frontier.shift() as string;
    // The dedup guard: a diamond node reached via two edges is parsed exactly
    // once — the second arrival short-circuits before `readText`/`parseAndLower`.
    if (cache.has(canonicalPath)) {
      continue;
    }
    const source = await deps.fs.readText(canonicalPath);
    const parsed = deps.parseAndLower(canonicalPath, source);
    cache.set(canonicalPath, parsed);

    // Walk transitively across literal `invoke` paths and `.loom` `tools:`
    // entries, canonicalising each edge before enqueueing it.
    for (const edge of [...parsed.invokePaths, ...parsed.toolLoomPaths]) {
      const canonicalEdge = normalizePath(await deps.fs.realpath(edge));
      if (!cache.has(canonicalEdge)) {
        frontier.push(canonicalEdge);
      }
    }
  }

  return { cache };
}
