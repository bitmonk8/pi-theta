// Host tool-registry snapshot seam (`seams/host-tool-snapshot.ts`) —
// cross-host decoding of `pi.getAllTools()` and the ONE security decision that
// reads it (`inferChildTrust`, #subagent-isolation-and-trust).
//
// Capability 4 (pi-integration-contract/capability-inventory-items.md
// #sdk-cap-tool-registration-gating) is a single host member with two host
// shapes: Pi returns `ToolInfo`-like objects (`name`, `parameters`,
// `sourceInfo.scope`), Oh-My-Pi returns bare `string` tool names. Reading
// `tool.sourceInfo.scope` off a bare string THREW `TypeError` (re-wrapped by the
// invoke boundary as `Err(InvokeInfraError{cause:"internal_error"})`, failing
// every subagent invocation), and `tool.name` was `undefined`, so no extension
// tool could enter a `tools:` list.
//
// The pinned contract is decode-once + NEVER default: information the host did
// not publish stays ABSENT rather than being materialised as `undefined`, so a
// downstream `scope === undefined` read cannot confuse "the host published no
// scope" with "the host published a scope that is not project-local". The trust
// consequence of an absent scope is least privilege, which is why the negative
// direction is tested harder than the positive one here.

import { describe, expect, it } from "vitest";
import {
  normalizeToolSnapshot,
  type HostToolSnapshotEntry,
  type NormalizedToolInfo,
} from "../src/seams/host-tool-snapshot";
import { inferChildTrust } from "../src/runtime/subagent-launcher";

/**
 * A snapshot entry outside the declared union — the seam's whole reason to exist
 * is that the shape is the HOST's choice, not theta's, so the malformed cases
 * are only reachable through a cast.
 */
function hostEntry(value: unknown): HostToolSnapshotEntry {
  return value as HostToolSnapshotEntry;
}

// ---------------------------------------------------------------------------
// normalizeToolSnapshot — the two host shapes.
// ---------------------------------------------------------------------------

describe("capability 4 — normalizeToolSnapshot decodes both host snapshot shapes", () => {
  const READ_SCHEMA = { type: "object", properties: { path: { type: "string" } } };
  const STORE_SCHEMA = { type: "object", properties: { finding: { type: "string" } } };

  it("Pi shape: name + parameters + sourceInfo.scope all survive, in input order", () => {
    // Pi's `ToolInfo[]` publishes every member theta's two consumers read: the
    // name (`tools:` admission key + `--tools` spelling), the registered
    // `parameters` schema (RFC-0002 computed-argument disjointness + the model
    // tool spec), and the source scope (trust inference).
    const snapshot: readonly HostToolSnapshotEntry[] = [
      { name: "read", parameters: READ_SCHEMA, sourceInfo: { scope: "user" } },
      { name: "finding_store", parameters: STORE_SCHEMA, sourceInfo: { scope: "project" } },
      { name: "lint", parameters: undefined, sourceInfo: { scope: "temporary" } },
    ];

    // The annotation is part of the assertion: under `exactOptionalPropertyTypes`
    // the published interface would reject a `scope: undefined` expectation, so
    // the shape below is the one consumers are allowed to read.
    const expected: readonly NormalizedToolInfo[] = [
      { name: "read", parameters: READ_SCHEMA, scope: "user" },
      { name: "finding_store", parameters: STORE_SCHEMA, scope: "project" },
      // `parameters: undefined` is the host publishing NO schema — it must not
      // materialise the key (see the absence assertions below).
      { name: "lint", scope: "temporary" },
    ];
    expect(normalizeToolSnapshot(snapshot)).toStrictEqual(expected);
  });

  it("omp shape: a bare string yields ONLY a name — the parameters/scope keys are ABSENT, not undefined", () => {
    const decoded = normalizeToolSnapshot(["read", "write", "bash"]);

    expect(decoded.map((tool) => tool.name)).toEqual(["read", "write", "bash"]);
    // Absence is the contract, not `undefined`-valued keys: a defaulted key
    // would assert on the theta's behalf something the host never published.
    expect(Object.keys(decoded[0]!)).toEqual(["name"]);
    expect("scope" in decoded[0]!).toBe(false);
    expect("parameters" in decoded[0]!).toBe(false);
    expect(decoded[0]).toStrictEqual({ name: "read" });
    // The consumer-side read of that absence: no published scope is not project
    // scope, so an omp snapshot contributes NOTHING to the trusted set.
    expect(decoded.filter((tool) => tool.scope === "project")).toEqual([]);
  });

  it("a MIXED snapshot decodes every entry in its own shape", () => {
    const decoded = normalizeToolSnapshot([
      "read",
      { name: "finding_store", parameters: STORE_SCHEMA, sourceInfo: { scope: "project" } },
      "bash",
      { name: "lint", sourceInfo: { scope: "user" } },
    ]);

    expect(decoded).toStrictEqual([
      { name: "read" },
      { name: "finding_store", parameters: STORE_SCHEMA, scope: "project" },
      { name: "bash" },
      { name: "lint", scope: "user" },
    ]);
  });

  it("an entry with no usable string name is DROPPED, never admitted with a placeholder", () => {
    // A nameless entry can match no `tools:` name and can carry no trust, so
    // keeping it could only make a later lookup ambiguous.
    const decoded = normalizeToolSnapshot([
      "read",
      hostEntry({}),
      hostEntry({ name: 123 }),
      hostEntry({ name: null }),
      hostEntry(null),
      hostEntry(undefined),
      hostEntry(42),
      { name: "finding_store", sourceInfo: { scope: "project" } },
    ]);

    // Exactly the two valid entries survive — no placeholder name, no hole.
    expect(decoded).toStrictEqual([
      { name: "read" },
      { name: "finding_store", scope: "project" },
    ]);
  });

  it("parameters without sourceInfo keeps the schema and omits scope (the Pi built-in shape)", () => {
    const decoded = normalizeToolSnapshot([{ name: "read", parameters: READ_SCHEMA }]);

    expect(decoded[0]).toStrictEqual({ name: "read", parameters: READ_SCHEMA });
    expect("scope" in decoded[0]!).toBe(false);
    // A built-in therefore contributes no project-local trust.
    expect(decoded.filter((tool) => tool.scope === "project")).toEqual([]);
  });

  it("sourceInfo null / {} / a non-string scope all yield NO scope without throwing", () => {
    const snapshot: readonly HostToolSnapshotEntry[] = [
      { name: "a", sourceInfo: null },
      { name: "b", sourceInfo: {} },
      // A non-string scope is not a scope — it cannot equal `"project"`, and
      // carrying it would let a truthy non-string leak into the trusted set.
      { name: "c", sourceInfo: { scope: 7 } },
      { name: "d", sourceInfo: { scope: null } },
    ];

    expect(() => normalizeToolSnapshot(snapshot)).not.toThrow();
    const decoded = normalizeToolSnapshot(snapshot);
    expect(decoded).toStrictEqual([
      { name: "a" },
      { name: "b" },
      { name: "c" },
      { name: "d" },
    ]);
    expect(decoded.every((tool) => !("scope" in tool))).toBe(true);
  });

  it("an empty snapshot decodes to an empty array", () => {
    expect(normalizeToolSnapshot([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// inferChildTrust — the security decision that reads the snapshot.
// ---------------------------------------------------------------------------

describe("#subagent-isolation-and-trust — inferChildTrust over a normalised snapshot", () => {
  it("a callable naming a PROJECT-scoped tool grants trust", () => {
    // The operator already trusted that project-local extension in the parent
    // session (the only way its tool was admitted), so the child inherits a
    // decision already made.
    const snapshot: readonly HostToolSnapshotEntry[] = [
      { name: "read", sourceInfo: { scope: "user" } },
      { name: "finding_store", sourceInfo: { scope: "project" } },
    ];
    expect(inferChildTrust(["read", "finding_store"], snapshot)).toBe(true);
  });

  it("user / temporary / absent scope grants NO trust (least privilege)", () => {
    expect(inferChildTrust(["lint"], [{ name: "lint", sourceInfo: { scope: "user" } }])).toBe(
      false,
    );
    expect(
      inferChildTrust(["lint"], [{ name: "lint", sourceInfo: { scope: "temporary" } }]),
    ).toBe(false);
    // No `sourceInfo` at all — a Pi built-in.
    expect(inferChildTrust(["read"], [{ name: "read" }])).toBe(false);
  });

  it("a callable name absent from the snapshot grants no trust", () => {
    const snapshot: readonly HostToolSnapshotEntry[] = [
      { name: "finding_store", sourceInfo: { scope: "project" } },
    ];
    expect(inferChildTrust(["unregistered_tool"], snapshot)).toBe(false);
  });

  it("an empty callable set grants no trust even beside a project-scoped tool", () => {
    expect(inferChildTrust([], [{ name: "finding_store", sourceInfo: { scope: "project" } }])).toBe(
      false,
    );
  });

  it("a bare-STRING snapshot never grants trust and never throws (the omp host)", () => {
    // The regression: `"finding_store".sourceInfo.scope` threw `TypeError`,
    // which the invoke boundary re-wrapped as
    // `Err(InvokeInfraError{cause:"internal_error"})` — every subagent
    // invocation failed. A host that publishes no source scope must answer
    // least privilege for EVERY tool, including one whose name is project-local
    // on the other host.
    const ompSnapshot: readonly HostToolSnapshotEntry[] = ["read", "write", "finding_store"];
    expect(() => inferChildTrust(["finding_store"], ompSnapshot)).not.toThrow();
    expect(inferChildTrust(["finding_store"], ompSnapshot)).toBe(false);
    expect(inferChildTrust(["read", "write", "finding_store"], ompSnapshot)).toBe(false);
  });

  it("a project-scoped tool merely PRESENT in the snapshot grants no trust", () => {
    // Trust follows the callable SET, not the registry: the parent admitting a
    // project-local tool for itself says nothing about this child's callables.
    const snapshot: readonly HostToolSnapshotEntry[] = [
      { name: "finding_store", sourceInfo: { scope: "project" } },
      { name: "read", sourceInfo: { scope: "user" } },
    ];
    expect(inferChildTrust(["read"], snapshot)).toBe(false);
  });
});
