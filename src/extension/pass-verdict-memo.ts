// Bug 0276 — a per-pass, cycle-free verdict memo for
// `calleeFailsOwnStructuralChecks` (`production-composition.ts`).
//
// That predicate's `visited` parameter is threaded by VALUE down one recursion
// branch and discarded on the way back up (bug 0271 §Fix), so it proves
// termination but records nothing across branches: a subtree named by two
// callers is judged once per simple path that reaches it. This module is the
// second store bug 0271's fix record called for — pass-scoped, distinct from
// the visited set, and keyed so a verdict served from it can never be one
// computed under a visited-set hit.
//
// SOUNDNESS. The predicate has exactly one branch-dependent input: withhold
// (c), the visited-set hit at `production-composition.ts:2397`. A verdict for
// file X is UNTAINTED when no frame beneath X's own walk took that branch for
// any entry. An untainted verdict is path-independent: if some later branch
// reaching X also reached an ancestor A of that branch from inside X's
// reachable set, then X reaches A and A reaches X (the later branch's own
// edge), so X reaches X — and X's own untainted walk, seeded with X itself in
// `visited`, would have hit X in its visited set and been tainted.
// Contradiction. So an untainted verdict is a function of the file's bytes and
// its acyclic-from-X subtree alone, never of which branch reached it, and
// memoising it can never introduce or elide a withhold-(c) hit that would not
// have fired anyway. The same argument applies inductively to a memo HIT
// consulted from inside another frame's own untainted computation: the hit
// contributes no visited-set consultation of its own (§Fix constraint 4), so
// a frame built only from untainted sub-verdicts and memo hits is itself
// untainted.
//
// KEY. (registry-snapshot-function IDENTITY, activeRoots-array IDENTITY,
// separator-normalised absolute path), plus a byte-identity guard on read —
// mirroring `pass-parse-cache.ts`'s cache, and for the same reason: never
// serve a verdict for changed bytes mid-pass. Identity, not content, keys the
// two scope dimensions: a distinct registry snapshot or a distinct
// active-root union is a distinct judging context, so a miss (never a
// collision) is the conservative direction when two calls do not share the
// same function/array object. This is also how gate-side and load-side
// verdicts stay apart without a manual partition: `parseCalleeTheta`'s
// dispatch gate always calls with `activeRoots === undefined` and every
// load-side judgement always calls with a concrete array, so the two can
// never share a path-store by construction — a gate-side verdict cannot be
// served to a load-side query, or the reverse.
//
// SCOPE CONTRACT. Because the registry dimension is keyed on the CLOSURE'S
// IDENTITY and the closure forwards to the live registry rather than holding a
// snapshot value, the lifetime of a caller's closure is the lifetime of that
// caller's memo scope, and the two call sites choose deliberately different
// lifetimes:
//   - LOAD SIDE (`production-composition.ts`'s per-file loop) reuses verdicts
//     across the WHOLE pass: one hoisted closure serves every discovered
//     theta's walk. The pass runs to completion against one registry and one
//     active-root union, and a later pass builds a fresh memo and a fresh
//     closure, so a verdict never answers for a registry or a root union the
//     pass did not see.
//   - GATE SIDE (`parseCalleeTheta`'s dispatch gate) reuses verdicts within
//     ONE dispatch walk: the gate builds a fresh closure per `invoke(...)`
//     dispatch, so each dispatch recomputes its verdicts while the recursion
//     inside that one walk still shares a reference and still collapses a
//     shared subtree to one judgement.
// The gate needs the shorter lifetime for two reasons the load pass does not
// face. A drive-time `pi.registerTool` changes what the live registry answers
// with no intervening compose pass, so a longer-lived gate scope would keep
// serving an `unknown-tool` verdict the registry has since made wrong. And the
// byte guard below covers only the QUERIED file's own bytes, while a gate-side
// walk runs with `activeRoots === undefined` and therefore recurses into files
// outside every discovery root, which no watcher watches and no reload
// invalidates — an edit to a subtree member below the callee would go unseen.
// Reuse must therefore not outlive the walk that established the registry and
// the subtree the verdict was computed against.
//
// Pass-scoped, explicitly injected (no global/static/singleton): one instance
// per `composeExtensionInstance` pass, created beside the pass parse cache and
// carried on the same `parseDeps` object (`PassVerdictDeps`, below).
//
// BUG 0275 ADDENDUM — the stored verdict widened from a bare `fails` boolean
// to the pair `{ fails, ownEscapes }` (`calleeFailsOwnStructuralChecksBody`'s
// `ownEscapes`: whether THIS frame's own `tools:` list named an entry judged
// `escape`, admitted into the frame one level up as the DEEP verdict
// `recursive.fails || recursive.ownEscapes` rather than as a depth parameter
// on this predicate). The memo KEY is UNCHANGED — no depth dimension was
// added — because `ownEscapes`, exactly like `fails`, is a pure function of
// the file's bytes, its acyclic-from-X subtree, the registry-snapshot
// identity, and the `activeRoots` identity, all of which the key above
// already carries; `activeRoots` identity in particular is what makes a
// containment-derived component memoisable at all; a distinct discovery-root
// union is a distinct judging context by the same rule that already governs
// `fails`. Carrying the depth-1 carve-out as a second VERDICT COMPONENT
// rather than as a second predicate PARAMETER is precisely what keeps the
// predicate free of a second branch-dependent input beside withhold (c), so
// bug 0276's taint rule (§Fix constraint 4: only a visited-set consultation
// taints a verdict against memoisation) governs `ownEscapes` exactly as it
// already governs `fails`, with no separate case.

import type { PassParseDeps } from "./pass-parse-cache";

/** A registry-snapshot accessor, keyed by IDENTITY only — its return shape is never read here. */
export type RegistrySnapshotFn = () => unknown;

/** Separator-normalise an absolute path so a Win32 and a POSIX spelling key together. */
function normaliseVerdictKey(path: string): string {
  return path.replace(/\\/g, "/");
}

/** Byte-for-byte comparison — a memo HIT never serves a verdict for changed bytes. */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

/**
 * One memoised verdict: the exact bytes it was computed from, plus the PAIR
 * `calleeFailsOwnStructuralChecksBody` returns (bug 0275 §Fix widened this
 * from a bare `fails` boolean to the pair — see the BUG 0275 ADDENDUM in this
 * module's doc-comment above for why the memo KEY needed no widening to carry
 * it).
 */
interface VerdictEntry {
  readonly bytes: Uint8Array;
  readonly fails: boolean;
  readonly ownEscapes: boolean;
}

/** The `{ fails, ownEscapes }` pair a memo `read` or `write` carries. */
export interface VerdictPair {
  readonly fails: boolean;
  readonly ownEscapes: boolean;
}

/**
 * A stable object identity standing in for an absent registry-snapshot
 * function or an absent `activeRoots` array, so both scope dimensions can use
 * one `WeakMap`-keyed lookup regardless of whether either side supplied a
 * real object this call. `undefined` carries no identity of its own, so every
 * call omitting that dimension shares this one frozen marker — which is
 * correct: `parseCalleeTheta`'s dispatch gate omits `activeRoots` on EVERY
 * call, so its verdicts all share one scope, distinct from any load-side call
 * (which always supplies a concrete array).
 */
const ABSENT_SCOPE: object = Object.freeze({});

/**
 * A pass-scoped, cycle-free verdict memoiser. Explicit dependency, injected
 * once per compose pass — see the module doc-comment for the key design and
 * the soundness argument for what it is safe to memoise.
 */
export interface PassVerdictMemo {
  /**
   * Return the memoised `{ fails, ownEscapes }` pair for (`registrySnapshot`,
   * `activeRoots`, `absolutePath`) when one was recorded under
   * byte-identical `bytes`; `undefined` on a miss (no entry, or the entry's
   * bytes have changed since it was written). A HIT is contributed with
   * `consultedVisited: false` by the caller (`production-composition.ts`) —
   * reading it never re-derives whether it consulted the visited set,
   * because {@link write} only ever stores an already-untainted verdict.
   */
  read(
    registrySnapshot: RegistrySnapshotFn | undefined,
    activeRoots: readonly string[] | undefined,
    absolutePath: string,
    bytes: Uint8Array,
  ): VerdictPair | undefined;
  /**
   * Record `verdict` for (`registrySnapshot`, `activeRoots`, `absolutePath`,
   * `bytes`). The caller must call this ONLY for a verdict computed with
   * `consultedVisited === false` (§Fix constraint 4) — this module has no way
   * to check that condition itself, since it is a property of the recursion
   * that produced `verdict`, not of the key.
   */
  write(
    registrySnapshot: RegistrySnapshotFn | undefined,
    activeRoots: readonly string[] | undefined,
    absolutePath: string,
    bytes: Uint8Array,
    verdict: VerdictPair,
  ): void;
}

/** Construct a fresh, empty pass-scoped verdict memo. Create exactly one per compose pass. */
export function createPassVerdictMemo(): PassVerdictMemo {
  // registry-snapshot identity -> activeRoots identity -> normalised path.
  // The two outer levels are `WeakMap`s keyed by object identity (functions
  // and arrays are objects, and `ABSENT_SCOPE` stands in for `undefined`); the
  // innermost level is a `Map`, never a plain object, because its keys are
  // resolved absolute paths — attacker/author-controlled strings that must
  // never be allowed to reach an object prototype.
  const byRegistry = new WeakMap<object, WeakMap<object, Map<string, VerdictEntry>>>();

  function pathStore(
    registrySnapshot: RegistrySnapshotFn | undefined,
    activeRoots: readonly string[] | undefined,
  ): Map<string, VerdictEntry> {
    const registryKey: object = registrySnapshot ?? ABSENT_SCOPE;
    const rootsKey: object = activeRoots ?? ABSENT_SCOPE;
    let byRoots = byRegistry.get(registryKey);
    if (byRoots === undefined) {
      byRoots = new WeakMap<object, Map<string, VerdictEntry>>();
      byRegistry.set(registryKey, byRoots);
    }
    let byPath = byRoots.get(rootsKey);
    if (byPath === undefined) {
      byPath = new Map<string, VerdictEntry>();
      byRoots.set(rootsKey, byPath);
    }
    return byPath;
  }

  return {
    read(registrySnapshot, activeRoots, absolutePath, bytes) {
      const store = pathStore(registrySnapshot, activeRoots);
      const entry = store.get(normaliseVerdictKey(absolutePath));
      if (entry === undefined || !bytesEqual(entry.bytes, bytes)) {
        return undefined;
      }
      return { fails: entry.fails, ownEscapes: entry.ownEscapes };
    },
    write(registrySnapshot, activeRoots, absolutePath, bytes, verdict) {
      const store = pathStore(registrySnapshot, activeRoots);
      store.set(normaliseVerdictKey(absolutePath), {
        bytes,
        fails: verdict.fails,
        ownEscapes: verdict.ownEscapes,
      });
    },
  };
}

/**
 * `PassParseDeps` widened with the optional verdict-memo field, so the memo
 * rides the same `parseDeps` object the pass parse cache already rides
 * (mirroring `PassParseDeps` itself, bug 0264 §Fix constraint 4): absent for
 * every non-production / inert-channel caller, in which case
 * `calleeFailsOwnStructuralChecks` computes every verdict directly, verdict-
 * identical to running the predicate with no memo at all.
 */
export interface PassVerdictDeps extends PassParseDeps {
  readonly passVerdictMemo?: PassVerdictMemo;
}
