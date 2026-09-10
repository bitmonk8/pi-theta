// V16a / V16a-T — the cross-ceiling arbitration seam.
//
// Spec: hard-ceilings.md, hard-ceilings/ceilings-3-and-4.md (CIO-1 … CIO-6 fixed
// evaluation order, the at-most-one-ceiling-per-event rule, the `masked` field's
// closed identifier set and omit-when-empty rule), hard-ceilings/
// ceiling-invariants-and-audit.md.
//
// This is a pure, stateless Class-2 named cross-leaf seam per conventions.md —
// categorically distinct from the construction-time host DI seams (PIC-10…16).
// It computes ONLY the cross-ceiling surfacing precedence and the `masked`
// co-fire decision for a single ceiling-candidate; it runs no breach check,
// receives no events, and owns no per-ceiling surface. Each ceiling's own
// bound/breach detection stays distributed across its feature leaf
// (`V5e`, `V11f`, `V13c`, `V15b`). No production leaf calls `arbitrate`: the
// CIO order and the `masked` co-fire are witnessed at this seam by its tests,
// while production populates the surface's `masked` field through the `V9d`
// `computeMasked` predicate (`runtime-event-channel.ts`). The `V4e` slash-load
// `params` cross-route that once consulted it was deleted as unreachable
// (bug 0066).
//
// Each hard ceiling is checked at a distinct point in single-threaded
// interpreter execution (ceilings-3-and-4.md §"Interaction between ceilings"):
// ceiling #1 at `invoke` entry, ceiling #2 at the tool-call-round boundary,
// ceiling #3 at slash-load (binder), ceiling #4 at every AJV validation
// boundary. The candidate is tagged with the check site the interpreter
// reached, so `surfaced` is the ceiling whose first-enforcement point IS that
// site — the CIO-1 #3-over-runtime precedence decision is realised because a
// co-fire whose surfacing site is the slash-load site surfaces #3 and masks the
// co-present runtime-class ceiling. `masked` enumerates the co-fired siblings
// (CIO-6), drawn from the closed identifier set and omitted (never `[]`) when no
// co-fire occurred.
//
// V16a fills in the arbitration: `surfaced` is the ceiling whose
// first-enforcement point IS the candidate's check site (the site→ceiling map),
// and `masked` enumerates the remaining co-present siblings in the closed set's
// canonical order (`MASKED_CEILING_IDS`), omitted when empty (never `[]`).

import {
  MASKED_CEILING_IDS,
  type MaskedCeilingId,
} from "./runtime-event-channel";

/**
 * The four distinct check sites at which a hard ceiling is evaluated during
 * single-threaded interpreter execution (ceilings-3-and-4.md §"Interaction
 * between ceilings"). Each site maps to exactly one ceiling class, per the CIO
 * enforcement-point placement:
 *
 * - `"invoke-entry"`       → ceiling #1 (`invoke`-chain depth), before the callee body (CIO-2)
 * - `"round-boundary"`     → ceiling #2 (`tool_loop.max_rounds`), post-slot-increment, pre-next-turn (CIO-4)
 * - `"slash-load-binder"`  → ceiling #3 (binder per-class retry budget), at slash-load time (CIO-1)
 * - `"ajv-boundary"`       → ceiling #4 (JSON-document depth), first sub-check before AJV (CIO-3)
 */
export type CheckSite =
  | "invoke-entry"
  | "round-boundary"
  | "slash-load-binder"
  | "ajv-boundary";

/**
 * A ceiling-candidate: the ceiling class(es) whose precondition is satisfied at
 * a single check site, tagged with the check site the candidate carries. The
 * surfacing site's own ceiling MUST be present in `satisfied`.
 */
export interface CeilingCandidate {
  /** The single check site the interpreter reached for this event. */
  readonly site: CheckSite;
  /**
   * Every ceiling class whose precondition was found satisfied for this event
   * (the co-fire set); includes the surfacing site's own ceiling. Members are
   * drawn from the closed `MaskedCeilingId` set.
   */
  readonly satisfied: readonly MaskedCeilingId[];
}

/**
 * The arbitration output: the single ceiling that fires per the CIO order, and
 * the closed-set enumeration of any co-fired sibling(s) — omitted when empty
 * (never `masked: []`), exactly as pinned in ceilings-3-and-4.md §`masked`
 * field.
 */
export interface ArbitrationResult {
  /** The single ceiling that surfaces for this event (CIO order). */
  readonly surfaced: MaskedCeilingId;
  /**
   * Co-fired siblings whose precondition was also satisfied at the same event
   * but did not surface (CIO-6). Omitted when no co-fire occurred — never `[]`.
   */
  readonly masked?: readonly MaskedCeilingId[];
}

/**
 * The fixed site→ceiling map: each check site is the first-enforcement point of
 * exactly one ceiling class, so a candidate tagged with that site surfaces that
 * ceiling (CIO-2 `invoke`-entry→#1, CIO-4 round-boundary→#2, CIO-1
 * slash-load-binder→#3, CIO-3 AJV-boundary→#4). The slash-load-binder→#3 entry
 * realises CIO-1's #3-over-runtime-class precedence decision: a co-fire whose
 * surfacing site is the slash-load site surfaces #3 and masks any co-present
 * runtime-class ceiling.
 */
const SITE_CEILING = {
  "invoke-entry": "ceiling#1",
  "round-boundary": "ceiling#2",
  "slash-load-binder": "ceiling#3",
  "ajv-boundary": "ceiling#4",
} as const satisfies Record<CheckSite, MaskedCeilingId>;

/**
 * Arbitrate a single ceiling-candidate to the ceiling that surfaces and the
 * co-fired siblings it masks (CIO-1 … CIO-6, the at-most-one-ceiling-per-event
 * rule, and the `masked` enumeration).
 *
 * The surfacing site's own ceiling surfaces (at most one per event); every
 * other satisfied ceiling is masked, enumerated in the closed set's canonical
 * order and omitted when empty (never `masked: []`).
 */
export function arbitrate(candidate: CeilingCandidate): ArbitrationResult {
  const surfaced = SITE_CEILING[candidate.site];
  const masked = MASKED_CEILING_IDS.filter(
    (id) => id !== surfaced && candidate.satisfied.includes(id),
  );
  if (masked.length === 0) {
    return { surfaced };
  }
  return { surfaced, masked };
}
