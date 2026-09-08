import { describe, expect, it } from "vitest";
import {
  hashCallableClosure,
  renderCallableHashMismatchMessage,
  SUBAGENT_CALLABLE_HASHES_ENV,
  SUBAGENT_CALLABLE_HASH_MISMATCH_CODE,
  type ClosureSource,
} from "../src/runtime/subagent-callable-hash";
import {
  verifyChildCallableHashes,
  type ChildClosureDiscovery,
} from "../src/runtime/subagent-child-hash-verify";
import { SUBAGENT_ROOT_ENV_MARKER } from "../src/runtime/subagent-root-regime";

// Bug 0467 — RED pre-fix / GREEN post-fix. Pre-fix, `hashCallableClosure`
// sorted closure members by their RAW `source.path` string and concatenated
// member contents in that order. The path is exempt from the hashed bytes, so
// the digest is meant to be a set hash over content alone (subagent.md
// #subagent-theta-callable-hash). Because the raw path still decided ORDER,
// the pre-fix digest was a function of (contents, path spelling): a
// forward-slash root always sorts before a backslash import ('/' 0x2F < '\'
// 0x5C), while a two-backslash spelling orders by basename. Production spells
// the SAME closure two ways — the parent dispatch-parse capture uses node
// `resolve` (backslash) for both members; the child discovery recompute spells
// the root with forward-slash discovery joins and the import with backslash —
// so a `.thetalib` whose basename sorts before the callee root's basename flips
// the concatenation order between the two routes and the digests diverge over
// byte-identical files. The fix normalises the sort-key spelling `\` -> `/`
// (the repo-wide bug 0268 convention), making the digest invariant under
// path-separator spelling while staying content-only and order-independent.
//
// These witnesses supply BOTH spellings as hardcoded string data so the red is
// reproduced on any host: they never call node `resolve`/`join` and never read
// the host separator, so a POSIX CI leg reds identically to Windows.

// The transitive-closure content, byte-identical across every route below.
const ROOT_CONTENT = '---\nmode: subagent\n---\nimport { q } from "./quality.thetalib"\nq()\n';
const LIB_CONTENT = 'export fn q(): string { return "ok" }\n';
// One byte differs (o -> O) — a genuine import edit for the non-vacuity guards.
const LIB_CONTENT_EDITED = 'export fn q(): string { return "Ok" }\n';

// Order-flip closure: the import basename ('q'uality) sorts BEFORE the callee
// root basename ('t'riage-finding) in the same directory.
//   parent spelling  — node `resolve` on both members (backslash).
//   child spelling   — discovery forward-slash root, node-`resolve` backslash
//                      import (production's two capture sites).
// The fixture directory is deliberately not spelled `.../theta/...`: a
// forward-slash `theta/<name>` span in test text is read as an unregistered
// diagnostic code by the DIAG-2 corpus scan (tests/registry-closed-set-corpus
// -gate.test.ts). Only the basenames' sort order and the separator divergence
// carry this witness, so a neutral directory reproduces the defect identically.
const FLIP_ROOT_PARENT = "C:\\ws\\.pi\\workers\\triage-finding.theta";
const FLIP_LIB_PARENT = "C:\\ws\\.pi\\workers\\quality.thetalib";
const FLIP_ROOT_CHILD = "C:/ws/.pi/workers/triage-finding.theta";
const FLIP_LIB_CHILD = "C:\\ws\\.pi\\workers\\quality.thetalib";

const FLIP_PARENT: readonly ClosureSource[] = [
  { path: FLIP_ROOT_PARENT, content: ROOT_CONTENT },
  { path: FLIP_LIB_PARENT, content: LIB_CONTENT },
];
const FLIP_CHILD: readonly ClosureSource[] = [
  { path: FLIP_ROOT_CHILD, content: ROOT_CONTENT },
  { path: FLIP_LIB_CHILD, content: LIB_CONTENT },
];

// Control closure: the callee root basename ('l'ens-d2-cruft) sorts BEFORE the
// import ('q'uality), so a forward-slash root and a backslash import already
// agree on order under both spellings — the route that aligns today and must
// stay aligned after the fix.
const CTRL_ROOT_PARENT = "C:\\ws\\.pi\\workers\\lens-d2-cruft.theta";
const CTRL_LIB_PARENT = "C:\\ws\\.pi\\workers\\quality.thetalib";
const CTRL_ROOT_CHILD = "C:/ws/.pi/workers/lens-d2-cruft.theta";
const CTRL_LIB_CHILD = "C:\\ws\\.pi\\workers\\quality.thetalib";

const CTRL_PARENT: readonly ClosureSource[] = [
  { path: CTRL_ROOT_PARENT, content: ROOT_CONTENT },
  { path: CTRL_LIB_PARENT, content: LIB_CONTENT },
];
const CTRL_CHILD: readonly ClosureSource[] = [
  { path: CTRL_ROOT_CHILD, content: ROOT_CONTENT },
  { path: CTRL_LIB_CHILD, content: LIB_CONTENT },
];

describe("hashCallableClosure — digest invariant under member path-separator spelling (bug 0467)", () => {
  it("gives one digest for one closure content when the import sorts before the root (order-flip)", () => {
    // The two spellings describe the identical two-file closure. subagent.md
    // #subagent-theta-callable-hash requires identical on-disk content to
    // produce identical digests on both parent and child routes. RED pre-fix
    // (the backslash route orders import-first, the mixed route orders
    // root-first); GREEN post-fix, once the sort key normalises `\` -> `/`.
    expect(hashCallableClosure(FLIP_PARENT)).toBe(hashCallableClosure(FLIP_CHILD));
  });

  it("keeps the already-aligned route matching when the root sorts before the import (control)", () => {
    // Guards against a regression on the route that agrees today: root-first
    // under both spellings must remain one digest after the fix.
    expect(hashCallableClosure(CTRL_PARENT)).toBe(hashCallableClosure(CTRL_CHILD));
  });

  it("still separates two digests when an import's content differs by one byte (non-vacuity)", () => {
    // Same paths, same spelling on both sides, one byte of import content
    // changed — the mechanism's purpose is to detect a real edit, so the fix
    // must not weaken the digest into always-matching. Holds before and after.
    const original: readonly ClosureSource[] = [
      { path: FLIP_ROOT_CHILD, content: ROOT_CONTENT },
      { path: FLIP_LIB_CHILD, content: LIB_CONTENT },
    ];
    const edited: readonly ClosureSource[] = [
      { path: FLIP_ROOT_CHILD, content: ROOT_CONTENT },
      { path: FLIP_LIB_CHILD, content: LIB_CONTENT_EDITED },
    ];
    expect(hashCallableClosure(original)).not.toBe(hashCallableClosure(edited));
  });
});

/** Env carrier the parent marshals: authenticated marker + `{ callable: hash }`. */
function childEnv(hashes: Record<string, string>): Record<string, string | undefined> {
  return {
    [SUBAGENT_ROOT_ENV_MARKER]: "triage-finding",
    [SUBAGENT_CALLABLE_HASHES_ENV]: JSON.stringify(hashes),
  };
}

describe("verifyChildCallableHashes — admits a byte-identical order-flip closure (bug 0467)", () => {
  it("does not refuse when the parent-spelling digest meets the child-spelling recompute (order-flip)", () => {
    // The parent marshals the digest over its backslash spelling; the child
    // discovery view returns the mixed (discovery-root) spelling of the same
    // two files. `verifyOne` recomputes through `hashCallableClosure`
    // (`subagent-child-hash-verify.ts:154-173`) and compares. RED pre-fix: one
    // refusal carrying `theta/runtime/subagent-callable-hash-mismatch` fires on
    // an unedited workspace. GREEN post-fix, once both routes normalise the
    // sort key — the recompute equals the marshalled digest and the callable is
    // admitted.
    const marshalled = hashCallableClosure(FLIP_PARENT);
    const discovery: ChildClosureDiscovery = (name) =>
      name === "triage_finding" ? FLIP_CHILD : undefined;

    const result = verifyChildCallableHashes({
      env: childEnv({ triage_finding: marshalled }),
      discovery,
    });

    expect(result.active).toBe(true);
    expect(result.refusals).toHaveLength(0);
  });

  it("still refuses when the marshalled digest covers genuinely edited import content (non-vacuity)", () => {
    // Same spelling on both sides (child), import content edited by one byte on
    // the marshalled side only — the child recompute over the original bytes
    // must still fail-closed, proving the fix detects a real edit rather than
    // admitting unconditionally. Refuses before and after the fix.
    const editedClosure: readonly ClosureSource[] = [
      { path: FLIP_ROOT_CHILD, content: ROOT_CONTENT },
      { path: FLIP_LIB_CHILD, content: LIB_CONTENT_EDITED },
    ];
    const marshalled = hashCallableClosure(editedClosure);
    const discovery: ChildClosureDiscovery = (name) =>
      name === "triage_finding" ? FLIP_CHILD : undefined;

    const result = verifyChildCallableHashes({
      env: childEnv({ triage_finding: marshalled }),
      discovery,
    });

    expect(result.refusals).toHaveLength(1);
    expect(result.refusals[0]?.code).toBe(SUBAGENT_CALLABLE_HASH_MISMATCH_CODE);
    expect(result.refusals[0]?.message).toBe(renderCallableHashMismatchMessage("triage_finding"));
  });
});
