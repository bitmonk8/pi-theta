// V5e / V5e-T — the theta-owned JSON-document depth walk (hard ceiling #4).
//
// Spec: schema-subset.md §"Depth Enforcement" (the counting algorithm, the
// `depth ≤ 5` cap, the canonical `schema_keyword: "maxDepth"` /
// `"JSON document depth exceeds 5"` / `cause: "schema_validation"` error shape,
// and the five enforcement points); hard-ceilings/ceilings-3-and-4.md
// §"Per-boundary destination/surface table (ceiling #4)" (#ceiling-4-table) and
// CIO-3 (#cio-3, the depth-walk-before-AJV ordering at every AJV boundary).
// Code-keyed obligation area `cka-10` (schema-subset.md, no numbered REQ-ID).
//
// This module owns two pure, stateless Class-2 seams — categorically like
// `V16a`'s cross-ceiling arbitration seam: the decision is exercised directly
// in isolation and the *live* AJV-boundary sites are built downstream by the
// leaves that import from here. `depthWalk` is run by the typed-query response
// sites (`V13c` `query-tool-loop.ts`, `V13e` `typed-query-validation.ts`), the
// model-driven tool-args row (`enforceModelToolArgDepth`, `tool-call.ts`), and
// the slash-load `params` post-default-merge validation (`V11g`,
// `binder/defaulting.ts`); `V15j` (`invoke-ceiling-depth.ts`) and `V11f`
// (`binder/retry-taxonomy.ts`) import only the issue / result types — the
// `invoke<T>` and code-driven tool-args rows run `wireFormDepthWalk` over the
// interpreter's own value instead (bug 0202). The seam runs no AJV, receives no
// events, and owns none of the per-boundary carriers:
//
//   1. `depthWalk(value)` — the recursive descent over a *materialised* JSON
//      value that fast-fails the first node whose depth would exceed 5,
//      producing the canonical depth-violation `ValidationIssue`
//      (`schema_keyword: "maxDepth"`, message `"JSON document depth exceeds 5"`,
//      `cause: "schema_validation"`). `jsonDepth(value)` exposes the depth
//      computation itself (scalar / empty → 1; non-empty → 1 + max child;
//      `anyOf` arms add no level because depth is measured against the one
//      materialised arm).
//   2. `routeDepthBoundary(site)` — the per-boundary routing *decision*: which
//      of ceiling #4's five enforcement points maps to which destination
//      surface class. The actual wrapping of a depth-6 breach into each carrier
//      is owned by the site-owner leaves; this seam decides only the routing.
//
// V5e-T (tests-task) declared the seam shapes; V5e (this leaf) supplies the
// counting algorithm, the fast-fail short-circuit, the canonical issue shape,
// and the routing table.

/** The JSON-document depth cap theta fixes for itself (schema-subset.md §Depth). */
export const MAX_JSON_DEPTH = 5;

/**
 * The canonical depth-violation `schema_keyword` value — the only
 * `schema_keyword` theta emits that is not a literal AJV keyword
 * (schema-subset.md §Depth Enforcement, §Error shape).
 */
export const DEPTH_VIOLATION_SCHEMA_KEYWORD = "maxDepth";

/** The canonical depth-violation message (schema-subset.md §Error shape). */
export const DEPTH_VIOLATION_MESSAGE = "JSON document depth exceeds 5";

/**
 * The single `ValidationIssue`-shaped record a depth breach produces (the
 * `ValidationIssue` element schema in errors-and-results/queryerror-variants.md:
 * `path`, `message`, `schema_keyword`). `path` is the RFC-6901 JSON Pointer to
 * the first too-deep node.
 */
export interface DepthViolationIssue {
  readonly path: string;
  readonly message: string;
  readonly schema_keyword: string;
}

/**
 * The depth-walk outcome. A breach carries `cause: "schema_validation"` even
 * though the walk short-circuits before AJV runs (schema-subset.md §Error
 * shape) plus the canonical single issue.
 */
export type DepthWalkResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly cause: "schema_validation";
      readonly issue: DepthViolationIssue;
    };

/**
 * The five ceiling-#4 enforcement points, with the `params` site split into its
 * two call-site arms (the per-boundary table's "depends on call site" row):
 *
 * - `"typed-query-response"`   — the model's final assistant JSON (row #1)
 * - `"tool-args-model-driven"` — a model-emitted `tool_use` args payload (row #2)
 * - `"tool-args-code-driven"`  — a code-driven `<name>(args)` args value (row #3)
 * - `"params-invoke"`          — `params` validation reached via `invoke(...)` (row #4, invoke arm)
 * - `"params-slash-load"`      — `params` validation reached at slash-load (row #4, slash-load arm)
 * - `"invoke-return"`          — an `invoke<T>` return value (row #5)
 */
export type DepthBoundarySite =
  | "typed-query-response"
  | "tool-args-model-driven"
  | "tool-args-code-driven"
  | "params-invoke"
  | "params-slash-load"
  | "invoke-return";

/**
 * The destination surface class each enforcement point routes a depth breach
 * to (ceiling-4-table). `"model-feedback"` and `"ceiling-3-cross-route"`
 * produce no theta-code `Err` at this seam (decision-only): the model-driven row
 * feeds a tool-result back to the model, and the slash-load `params` row
 * cross-routes into ceiling #3's load-time system-note classification.
 */
export type DepthDestination =
  | "ValidationError"
  | "model-feedback"
  | "CodeToolError"
  | "InvokeInfraError"
  | "ceiling-3-cross-route";

// --------------------------------------------------------------------------
// V5e — implementation. The counting algorithm, the fast-fail short-circuit,
// the canonical issue shape, and the routing table.
// --------------------------------------------------------------------------

/**
 * True for a non-empty object or array — the only shapes that add a nesting
 * level under the §Counting algorithm (`1 + max(depth(child))`). A scalar,
 * `null`, `{}`, and `[]` all count as depth 1 and never recurse.
 */
function hasChildren(value: unknown): value is object {
  if (value === null || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return Object.keys(value as Record<string, unknown>).length > 0;
}

/** RFC-6901 JSON Pointer reference-token escaping: `~`→`~0`, `/`→`~1`. */
function escapePointerToken(token: string): string {
  return token.replace(/~/g, "~0").replace(/\//g, "~1");
}

/**
 * The depth computation over a materialised JSON value (schema-subset.md
 * §Counting algorithm): a scalar or empty container is depth 1; a non-empty
 * object or array is `1 + max(depth(child))`. `anyOf` arms add no level because
 * depth is measured against the single materialised runtime value.
 */
export function jsonDepth(value: unknown): number {
  if (!hasChildren(value)) {
    return 1;
  }
  const children = Array.isArray(value)
    ? value
    : Object.values(value as Record<string, unknown>);
  let maxChild = 0;
  for (const child of children) {
    const childDepth = jsonDepth(child);
    if (childDepth > maxChild) {
      maxChild = childDepth;
    }
  }
  return 1 + maxChild;
}

/**
 * Recursive descent that short-circuits on the first node whose nesting level
 * exceeds `MAX_JSON_DEPTH`, returning its RFC-6901 JSON Pointer. The root sits
 * at level 1; descending into a member/element increments the level. Returns
 * `undefined` when the whole value is within the cap.
 */
function firstTooDeep(value: unknown, level: number, path: string): string | undefined {
  if (level > MAX_JSON_DEPTH) {
    return path;
  }
  if (!hasChildren(value)) {
    return undefined;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const breach = firstTooDeep(value[i], level + 1, `${path}/${i}`);
      if (breach !== undefined) {
        return breach;
      }
    }
    return undefined;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const breach = firstTooDeep(child, level + 1, `${path}/${escapePointerToken(key)}`);
    if (breach !== undefined) {
      return breach;
    }
  }
  return undefined;
}

/**
 * The depth walk: fast-fails the first node whose depth would exceed
 * `MAX_JSON_DEPTH`, producing the canonical depth-violation issue
 * (`schema_keyword: "maxDepth"`, message `"JSON document depth exceeds 5"`,
 * `cause: "schema_validation"`) with the RFC-6901 JSON Pointer to that node.
 */
export function depthWalk(value: unknown): DepthWalkResult {
  const breachPath = firstTooDeep(value, 1, "");
  if (breachPath === undefined) {
    return { ok: true };
  }
  return {
    ok: false,
    cause: "schema_validation",
    issue: {
      path: breachPath,
      message: DEPTH_VIOLATION_MESSAGE,
      schema_keyword: DEPTH_VIOLATION_SCHEMA_KEYWORD,
    },
  };
}

/**
 * The per-boundary routing decision (ceiling-4-table): which destination
 * surface class each of ceiling #4's five enforcement points maps a depth
 * breach to. Three rows produce a theta-code `Err` carrier at their site owner
 * (`ValidationError`/`CodeToolError`/`InvokeInfraError`); the model-driven and
 * slash-load `params` rows produce no theta-code `Err` at this seam.
 */
export function routeDepthBoundary(site: DepthBoundarySite): DepthDestination {
  const routing: Record<DepthBoundarySite, DepthDestination> = {
    "typed-query-response": "ValidationError",
    "tool-args-model-driven": "model-feedback",
    "tool-args-code-driven": "CodeToolError",
    "params-invoke": "InvokeInfraError",
    "params-slash-load": "ceiling-3-cross-route",
    "invoke-return": "InvokeInfraError",
  };
  return routing[site];
}
