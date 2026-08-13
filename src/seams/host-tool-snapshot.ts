// Host tool-registry snapshot seam — the cross-host normalisation of
// `pi.getAllTools()`.
//
// Capability 4 (capability-inventory-items.md item 4) is a single host member
// read by two independent consumers:
//
//   - the MODE-INDEPENDENT `tools:` admission, which needs each entry's NAME
//     (to admit the callable) and, when the host offers it, its registered
//     `parameters` schema (the RFC-0002 computed-argument disjointness check and
//     the model tool spec read it);
//   - the subagent launch-path trust inference
//     (`inferChildTrust`, #subagent-isolation-and-trust), which needs each
//     entry's NAME and its source SCOPE.
//
// The two hosts that run a theta disagree on the member's return shape, and the
// disagreement is not cosmetic:
//
//   - Pi returns a `ToolInfo[]`: objects carrying `name`, `parameters`, and
//     `sourceInfo.scope`.
//   - Oh-My-Pi returns a `string[]` — bare tool names, no schema and no source
//     scope at all.
//
// Reading `tool.name` / `tool.sourceInfo.scope` off a bare string is not a
// graceful degradation: `"read".name` is `undefined`, so every admission lookup
// misses and no extension tool can ever enter a `tools:` list, while
// `"read".sourceInfo.scope` THROWS `TypeError`, which the invoke boundary
// re-wraps as `Err(InvokeInfraError{cause:"internal_error"})` — every subagent
// invocation fails with a defect that names neither the host nor the member.
//
// This seam is therefore the single place either shape is decoded. Every
// consumer reads `NormalizedToolInfo`, never the raw snapshot. Information the
// host does not supply stays ABSENT rather than being defaulted to a value the
// host never asserted: a missing `parameters` degrades the disjointness check
// to "schema unknown" (already an optional field downstream), and a missing
// `scope` contributes no project-local trust, which is the same conservative
// answer the trust rule already gives a callable name absent from the snapshot
// entirely (least privilege).
//
// Spec: pi-integration-contract/capability-inventory-items.md item 4,
// subagent.md #subagent-isolation-and-trust, frontmatter-fields-a.md §`tools`.

/**
 * One entry of a host's `pi.getAllTools()` snapshot, in either host shape: a
 * bare tool name, or a `ToolInfo`-like record. Every member of the record form
 * is optional because the union is what the seam ACCEPTS, not what any host
 * guarantees — `normalizeToolSnapshot` is what turns it into a shape consumers
 * may read.
 */
export type HostToolSnapshotEntry =
  | string
  | {
      readonly name?: unknown;
      readonly parameters?: unknown;
      readonly sourceInfo?: { readonly scope?: unknown } | null;
    };

/** A host tool-registry entry decoded to the members theta consumers read. */
export interface NormalizedToolInfo {
  /** The tool's registered name — the admission key and the `--tools` spelling. */
  readonly name: string;
  /** The registered input schema, when the host publishes one. */
  readonly parameters?: unknown;
  /** The tool's source scope, when the host publishes one (`"project"` grants trust). */
  readonly scope?: string;
}

/**
 * Decode a host `pi.getAllTools()` snapshot to `NormalizedToolInfo[]`.
 *
 * An entry that yields no usable name is DROPPED rather than admitted with a
 * placeholder: a nameless entry can match no `tools:` name and can carry no
 * trust, so keeping it could only make a later lookup ambiguous. `parameters`
 * and `scope` are carried only when the host actually supplied them (see the
 * module header on why absence is not defaulted).
 */
export function normalizeToolSnapshot(
  snapshot: readonly HostToolSnapshotEntry[],
): readonly NormalizedToolInfo[] {
  const normalized: NormalizedToolInfo[] = [];
  for (const entry of snapshot) {
    if (typeof entry === "string") {
      normalized.push({ name: entry });
      continue;
    }
    if (entry === null || typeof entry !== "object") {
      continue;
    }
    if (typeof entry.name !== "string") {
      continue;
    }
    const scope = entry.sourceInfo?.scope;
    normalized.push({
      name: entry.name,
      ...(entry.parameters === undefined ? {} : { parameters: entry.parameters }),
      ...(typeof scope === "string" ? { scope } : {}),
    });
  }
  return normalized;
}
