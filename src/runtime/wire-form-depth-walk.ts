// Bug 0202 — the wire-form depth walk for ceiling #4's three theta-value
// enforcement points: `enforceInvokeReturnDepth` / `enforceInvokeParamsDepth`
// (`./invoke-ceiling-depth.ts`, both through the shared `enforceInvokeDepth`)
// and `enforceCodeToolArgDepth` (`./tool-call.ts`).
//
// `depth-walk.ts`'s `depthWalk` answers ceiling #4's question over an
// ALREADY-PARSED JSON value, where `Object.keys` and the wire form agree on
// every shape. The three sites above are handed the interpreter's OWN value
// instead — the theta-side `params` / return / tool-arg payload before it is
// ever `JSON.stringify`d — and one interpreter shape diverges from its wire
// form there: the enum carrier `makeEnumValue` builds (`./value.ts:135`) is a
// boxed `String`, whose own enumerable keys are its character indices
// (`Object.keys(new String("red"))` is `["0","1","2"]`), so a walk keyed on
// `Object.keys` counts one level for a value that serialises to a scalar.
// `docs/bugs/0202-parent-depth-walk-counts-carrier-not-wire-depth.md` §Fix (a)
// fixes the cap as a property of the payload's WIRE FORM
// (`docs/spec_topics/schema-subset.md:13`, `:22`, the counting algorithm at
// `:24–30`), so this walk classifies every node through `classifyWireNode`
// (`./subagent-envelope.ts:555`) — the one function bug 0201 already exported
// to answer this exact question for the child-side envelope writer — rather
// than re-deriving a second carrier arm: the carrier decision stays
// single-sourced in that one function.
//
// This module redefines none of ceiling #4's canonical values:
// `MAX_JSON_DEPTH`, `DEPTH_VIOLATION_MESSAGE`, `DEPTH_VIOLATION_SCHEMA_KEYWORD`
// and the `DepthWalkResult` shape are `./depth-walk.ts`'s own, imported rather
// than restated. The level check runs BEFORE a node's classification at every
// step (CIO-3: no unbounded recursion at a ceiling-#4 gate), so the walk
// cannot be driven past the cap by what a node contains.
//
// Spec: schema-subset.md §"Depth Enforcement" (the counting algorithm, the
// `depth ≤ 5` cap, the canonical error shape); hard-ceilings/ceilings-3-and-4.md
// §"Per-boundary destination/surface table (ceiling #4)" and CIO-3 (the
// depth-walk-before-AJV ordering at every AJV boundary).

import {
  DEPTH_VIOLATION_MESSAGE,
  DEPTH_VIOLATION_SCHEMA_KEYWORD,
  MAX_JSON_DEPTH,
  type DepthWalkResult,
} from "./depth-walk";
import { classifyWireNode } from "./subagent-envelope";

/** RFC-6901 JSON Pointer reference-token escaping: `~` → `~0`, `/` → `~1` (mirrors `depth-walk.ts`'s own escaping). */
function escapePointerToken(token: string): string {
  return token.replace(/~/g, "~0").replace(/\//g, "~1");
}

/**
 * Recursive descent over `value`'s WIRE FORM that fast-fails the first node
 * whose nesting level would exceed `MAX_JSON_DEPTH`, returning its RFC-6901
 * JSON Pointer. Mirrors `depth-walk.ts`'s `firstTooDeep` exactly — the root
 * sits at level 1, descending into a member/element increments the level, and
 * `undefined` means the whole value is within the cap — except that a node's
 * shape is decided by `classifyWireNode` rather than by `Object.keys`, so a
 * boxed `String` enum carrier is a `scalar` (nothing to descend into) rather
 * than a non-empty object keyed by its own character indices.
 *
 * The level check runs first, ahead of classification, at every node: a node
 * at level `MAX_JSON_DEPTH + 1` breaches on the level test alone, whatever it
 * contains, so the classifier is never consulted past the cap.
 */
function firstTooDeep(value: unknown, level: number, path: string): string | undefined {
  if (level > MAX_JSON_DEPTH) {
    return path;
  }
  const node = classifyWireNode(value);
  if (node.kind === "scalar") {
    return undefined;
  }
  if (node.kind === "array") {
    for (let index = 0; index < node.elements.length; index++) {
      const breach = firstTooDeep(node.elements[index], level + 1, `${path}/${index}`);
      if (breach !== undefined) {
        return breach;
      }
    }
    return undefined;
  }
  for (const [key, member] of node.entries) {
    const breach = firstTooDeep(member, level + 1, `${path}/${escapePointerToken(key)}`);
    if (breach !== undefined) {
      return breach;
    }
  }
  return undefined;
}

/**
 * The ceiling-#4 depth walk over a theta-value payload's WIRE FORM: fast-fails
 * the first node whose depth would exceed `MAX_JSON_DEPTH`, producing the
 * canonical depth-violation issue (`schema_keyword: "maxDepth"`, message
 * `"JSON document depth exceeds 5"`) with the RFC-6901 JSON Pointer to that
 * node — the same `DepthWalkResult` shape `depth-walk.ts`'s `depthWalk`
 * produces, so a call site can route either walk's result identically.
 *
 * Consult this instead of `depthWalk` at any ceiling-#4 site handed an
 * interpreter value rather than already-parsed JSON — the three sites named
 * at this module's own header — because `depthWalk`'s `Object.keys` test
 * reads a boxed-`String` enum carrier as a non-empty object
 * (`docs/bugs/0202-parent-depth-walk-counts-carrier-not-wire-depth.md`).
 */
export function wireFormDepthWalk(value: unknown): DepthWalkResult {
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
