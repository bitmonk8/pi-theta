import { describe, expect, it } from "vitest";
import {
  readMarshalledCallableHashes,
  verifyChildCallableHashes,
  type ChildClosureDiscovery,
} from "../src/runtime/subagent-child-hash-verify";
import {
  hashCallableClosure,
  SUBAGENT_CALLABLE_HASHES_ENV,
  SUBAGENT_CALLABLE_HASH_MISMATCH_CODE,
  type ClosureSource,
} from "../src/runtime/subagent-callable-hash";
import { SUBAGENT_ROOT_ENV_MARKER } from "../src/runtime/subagent-root-regime";

// RFC-0006 — child-side `.theta` callable content-hash verification (offline).
// The child is now identified by the PIC-58 subagent-root regime marker
// (`PI_THETA_SUBAGENT_ROOT=<slug>`), which subsumes RFC-0005's boolean child
// marker; the verification mechanism (transitive-closure hash, fail-closed
// refusal) is unchanged.
//
// Authority: subagent.md #subagent-theta-callable-hash ("The child verifies each
// hash after its own parse and refuses the invocation on mismatch");
// diagnostics/code-registry-runtime.md
// (`theta/runtime/subagent-callable-hash-mismatch`, Message
// `subagent callable '<name>' content hash mismatch; refusing invocation`).
//
// These tests inject the env map + a discovery view directly, so mismatch
// refusal and match acceptance are exercised without spawning a real child.

const CODE_REVIEW_SOURCES: readonly ClosureSource[] = [
  { path: "/w/code-review.theta", content: "---\nmode: subagent\n---\n@`root`\n" },
  { path: "/w/lib.thetalib", content: "export fn helper() { @`x` }\n" },
];
const CODE_REVIEW_HASH = hashCallableClosure(CODE_REVIEW_SOURCES);

/** The parent-marshalled env carrier for a child with one `.theta` callable. */
function childEnv(hashes: Record<string, string>): Record<string, string | undefined> {
  return {
    [SUBAGENT_ROOT_ENV_MARKER]: "code-review",
    [SUBAGENT_CALLABLE_HASHES_ENV]: JSON.stringify(hashes),
  };
}

const MATCHING_DISCOVERY: ChildClosureDiscovery = (name) =>
  name === "code_review" ? CODE_REVIEW_SOURCES : undefined;

describe("readMarshalledCallableHashes", () => {
  it("returns undefined when this process is not a subagent child", () => {
    expect(
      readMarshalledCallableHashes({
        [SUBAGENT_CALLABLE_HASHES_ENV]: JSON.stringify({ code_review: "sha256:x" }),
      }),
    ).toBeUndefined();
  });

  it("returns undefined for a child with no marshalled hashes", () => {
    expect(readMarshalledCallableHashes({ [SUBAGENT_ROOT_ENV_MARKER]: "code-review" })).toBeUndefined();
  });

  it("parses the { callable: hash } carrier into a map", () => {
    const map = readMarshalledCallableHashes(childEnv({ code_review: CODE_REVIEW_HASH }));
    expect(map?.get("code_review")).toBe(CODE_REVIEW_HASH);
  });

  it("throws (fail-closed at the boundary) on a malformed carrier", () => {
    expect(() =>
      readMarshalledCallableHashes({
        [SUBAGENT_ROOT_ENV_MARKER]: "code-review",
        [SUBAGENT_CALLABLE_HASHES_ENV]: "{not json",
      }),
    ).toThrow();
    expect(() =>
      readMarshalledCallableHashes({
        [SUBAGENT_ROOT_ENV_MARKER]: "code-review",
        [SUBAGENT_CALLABLE_HASHES_ENV]: JSON.stringify({ code_review: 123 }),
      }),
    ).toThrow();
  });
});

describe("verifyChildCallableHashes", () => {
  it("is inactive (no refusals) when not a subagent child", () => {
    const result = verifyChildCallableHashes({ env: {}, discovery: MATCHING_DISCOVERY });
    expect(result.active).toBe(false);
    expect(result.refusals).toHaveLength(0);
  });

  it("accepts a callable whose child-recomputed closure hash matches the parent's", () => {
    const result = verifyChildCallableHashes({
      env: childEnv({ code_review: CODE_REVIEW_HASH }),
      discovery: MATCHING_DISCOVERY,
    });
    expect(result.active).toBe(true);
    expect(result.refusals).toHaveLength(0);
    expect(result.outcomes[0]?.verification.ok).toBe(true);
  });

  it("refuses fail-closed on a content-hash mismatch (edited callee)", () => {
    // The child discovers an EDITED root file → its recomputed hash differs from
    // the parent-recorded hash.
    const editedDiscovery: ChildClosureDiscovery = (name) =>
      name === "code_review"
        ? [
            { path: "/w/code-review.theta", content: "---\nmode: subagent\n---\n@`EDITED`\n" },
            CODE_REVIEW_SOURCES[1]!,
          ]
        : undefined;
    const result = verifyChildCallableHashes({
      env: childEnv({ code_review: CODE_REVIEW_HASH }),
      discovery: editedDiscovery,
    });
    expect(result.refusals).toHaveLength(1);
    const diag = result.refusals[0]!;
    expect(diag.code).toBe(SUBAGENT_CALLABLE_HASH_MISMATCH_CODE);
    expect(diag.message).toBe(
      "subagent callable 'code_review' content hash mismatch; refusing invocation",
    );
    expect(diag.severity).toBe("error");
  });

  it("refuses fail-closed when the child cannot re-resolve the callee source", () => {
    const result = verifyChildCallableHashes({
      env: childEnv({ code_review: CODE_REVIEW_HASH }),
      // Discovery supplies nothing (callee moved / deleted / `as`-renamed).
      discovery: () => undefined,
    });
    expect(result.refusals).toHaveLength(1);
    expect(result.refusals[0]?.code).toBe(SUBAGENT_CALLABLE_HASH_MISMATCH_CODE);
    expect(result.refusals[0]?.hint).toContain("child source unavailable");
  });
});
