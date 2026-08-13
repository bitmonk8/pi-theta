// Host-portability seams: the `readPeerVersion` peer-version ladder
// (capability-probe.md Step 0 (d) / `#step-0-d-recommended-recipe`) and the
// child-side model pre-flight (PIC-62 obligation 2,
// pi-integration-contract/subagent.md#subagent-model-marshalling).
//
// WHY these two live in one file: both are the seams a SECOND host (Oh-My-Pi)
// exercised differently from Pi, and both were answered by making an ambient
// lookup explicit rather than by branching on host identity.
//
//   - `readPeerVersion` is a pure three-rung FILESYSTEM ladder: the authored
//     `@earendil-works/` `node_modules` ancestor walk, the same walk re-scoped
//     to `@oh-my-pi/`, then the injected in-process host SDK version scoped to
//     the authored spelling. No module resolver may be entered: on an Oh-My-Pi
//     host the pi specifiers are served by an ASYNCHRONOUS `Bun.plugin`
//     resolver, and a synchronous `require.resolve` cannot drain the microtask
//     queue that resolver awaits, so the old rung 1 DEADLOCKED the extension
//     factory with no diagnostic. Every assertion here therefore also stands as
//     a liveness assertion — a test that hangs is itself the regression signal.
//   - The child-side pre-flight matches the FULLY-QUALIFIED `provider/id`
//     reference. A bare `id` is not a unique registry key, and
//     `matchAvailableModel` answers `undefined` for "ambiguous" exactly as it
//     does for "no match", so a bare-id pre-flight read a resolvable child
//     model as TOTAL non-resolution and refused every child.
//
// Spec: pi-integration-contract/capability-probe.md (Step 0 (d) conditions
// (1)–(4)), pi-integration-contract/subagent.md (PIC-62),
// binder-model-and-context.md#binder-model-parse-rule (the match rule),
// diagnostics/code-registry-runtime.md
// (`theta/runtime/subagent-model-preflight-mismatch`).

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { matchAvailableModel } from "../src/binder/binder-model";
import { readPeerVersion } from "../src/extension/production-composition";
import {
  SUBAGENT_MODEL_PREFLIGHT_MISMATCH_CODE,
  confirmChildModel,
  renderModelPreflightMismatchMessage,
} from "../src/runtime/subagent-model-guard";

// ── readPeerVersion — planted-tree fixture ──────────────────────────────────

/**
 * One of the four pinned lock-step peers, in its AUTHORED spelling. The ladder's
 * rung-2 re-spelling and rung-3 scope test both key off the `@earendil-works/`
 * prefix, so the authored name is the only name that witnesses all three rungs.
 */
const AUTHORED_PEER = "@earendil-works/pi-coding-agent";

/** The same peer as an Oh-My-Pi host publishes it (rung 2's re-spelling). */
const ALIASED_PEER = "@oh-my-pi/pi-coding-agent";

/**
 * A package name OUTSIDE the authored scope. Rung 3 must refuse to answer for
 * it, and no ancestor of a fresh temp dir can hold it, so the planted tree alone
 * decides every answer about it.
 */
const FOREIGN_PEER = "@not-a-host/whatever";

interface PeerTree {
  /** The `moduleDir` the `node_modules` ancestor walk starts from. */
  readonly moduleDir: string;
  /**
   * Plant `package.json` contents at the candidate `depth` ancestor directories
   * up from `moduleDir`. Depth 0 is the walk's FIRST candidate, so a plant there
   * is consulted before any ancestor.
   */
  readonly plant: (depth: number, pkg: string, value: unknown) => void;
}

const trees: string[] = [];

afterEach(() => {
  // Every temp root this file creates is removed, pass or fail.
  while (trees.length > 0) {
    rmSync(trees.pop() as string, { recursive: true, force: true });
  }
});

function makePeerTree(): PeerTree {
  const root = mkdtempSync(join(tmpdir(), "theta-peer-version-"));
  trees.push(root);
  // Deep enough that an ancestor plant is unambiguously an ANCESTOR hit and not
  // the first candidate.
  const moduleDir = join(root, "a", "b", "c");
  mkdirSync(moduleDir, { recursive: true });
  return {
    moduleDir,
    plant: (depth, pkg, value): void => {
      let dir = moduleDir;
      for (let i = 0; i < depth; i += 1) {
        dir = dirname(dir);
      }
      const packageDir = join(dir, "node_modules", pkg);
      mkdirSync(packageDir, { recursive: true });
      writeFileSync(
        join(packageDir, "package.json"),
        typeof value === "string" ? value : JSON.stringify(value),
        "utf8",
      );
    },
  };
}

/** This test file's own directory — a real tree with a real ambient `node_modules`. */
const REAL_MODULE_DIR = dirname(fileURLToPath(import.meta.url));

describe("capability-probe.md Step 0 (d) — readPeerVersion rung 1: the authored-scope node_modules walk", () => {
  it("answers with the version of a planted @earendil-works package.json whose name matches", () => {
    // Every planted version below is deliberately UNLIKE the version installed
    // in this repo's own `node_modules`, so no assertion here can pass by
    // coincidence off the ambient tree instead of the planted `moduleDir`.
    const tree = makePeerTree();
    tree.plant(0, AUTHORED_PEER, { name: AUTHORED_PEER, version: "5.4.3-planted" });
    expect(readPeerVersion(AUTHORED_PEER, tree.moduleDir)).toBe("5.4.3-planted");
  });

  it("walks ANCESTOR node_modules directories, not <moduleDir>/node_modules alone", () => {
    // A pnpm/npm install several levels above the extension's own module dir is
    // the normal layout; answering only from the immediate directory would
    // report a lock-step peer as uninstalled on an ordinary source checkout.
    const tree = makePeerTree();
    tree.plant(3, AUTHORED_PEER, { name: AUTHORED_PEER, version: "3.0.0" });
    expect(readPeerVersion(AUTHORED_PEER, tree.moduleDir)).toBe("3.0.0");
  });

  it("keeps walking past a nearer package.json whose name does not match", () => {
    // Answering `undefined` (or the decoy's version) at the first readable
    // candidate would mis-report a shadowing directory as the installed peer.
    const tree = makePeerTree();
    tree.plant(0, AUTHORED_PEER, { name: "@someone-else/impostor", version: "9.9.9" });
    tree.plant(2, AUTHORED_PEER, { name: AUTHORED_PEER, version: "1.2.3" });
    expect(readPeerVersion(AUTHORED_PEER, tree.moduleDir)).toBe("1.2.3");
  });

  it("does not answer from a candidate with no version, nor from a non-string version", () => {
    // Conditions (2)/(3): a located `package.json` with no own STRING `version`
    // is exactly as unreadable as no candidate at all — and must not be coerced.
    const noVersion = makePeerTree();
    noVersion.plant(0, FOREIGN_PEER, { name: FOREIGN_PEER });
    expect(readPeerVersion(FOREIGN_PEER, noVersion.moduleDir)).toBeUndefined();

    const numericVersion = makePeerTree();
    numericVersion.plant(0, FOREIGN_PEER, { name: FOREIGN_PEER, version: 3 });
    expect(readPeerVersion(FOREIGN_PEER, numericVersion.moduleDir)).toBeUndefined();

    // …and a later candidate that IS well-formed still answers, so the
    // malformed-version arm advances the walk rather than terminating it.
    const recovered = makePeerTree();
    recovered.plant(0, FOREIGN_PEER, { name: FOREIGN_PEER, version: { major: 1 } });
    recovered.plant(1, FOREIGN_PEER, { name: FOREIGN_PEER, version: "4.5.6" });
    expect(readPeerVersion(FOREIGN_PEER, recovered.moduleDir)).toBe("4.5.6");
  });
});

describe("capability-probe.md Step 0 (d) — readPeerVersion rung 2: the @oh-my-pi/ scope alias", () => {
  it("resolves the AUTHORED name from an @oh-my-pi package when the authored scope is absent from disk", () => {
    // An Oh-My-Pi host publishes the identical surface under `@oh-my-pi/*` and
    // remaps the authored imports onto it, so no `@earendil-works/` package.json
    // exists there. Probing both scopes is what lets ONE build satisfy Step 0
    // (d) on either host.
    const tree = makePeerTree();
    tree.plant(0, ALIASED_PEER, { name: ALIASED_PEER, version: "0.42.0" });
    expect(readPeerVersion(AUTHORED_PEER, tree.moduleDir)).toBe("0.42.0");
  });

  it("rung 1 takes precedence over rung 2 even when the alias is planted NEARER", () => {
    // Scope order dominates walk distance: the authored install is the one the
    // extension was authored against, so a co-installed alias must not shadow it.
    const tree = makePeerTree();
    tree.plant(0, ALIASED_PEER, { name: ALIASED_PEER, version: "0.42.0-omp" });
    tree.plant(2, AUTHORED_PEER, { name: AUTHORED_PEER, version: "8.1.0-authored" });
    expect(readPeerVersion(AUTHORED_PEER, tree.moduleDir)).toBe("8.1.0-authored");
  });

  it("does not re-spell a name outside the authored scope into the alias scope", () => {
    // The re-spelling is keyed on the authored prefix. A foreign package must
    // not be silently satisfied by an identically-suffixed `@oh-my-pi` package.
    const tree = makePeerTree();
    tree.plant(0, "@oh-my-pi/whatever", { name: "@oh-my-pi/whatever", version: "7.7.7" });
    expect(readPeerVersion(FOREIGN_PEER, tree.moduleDir)).toBeUndefined();
  });
});

describe("capability-probe.md Step 0 (d) — readPeerVersion rung 3: the injected host SDK version", () => {
  it("answers an authored-scope peer with hostSdkVersion when NOTHING is on disk", () => {
    // On a COMPILED host binary the pi packages are bundled into the executable
    // and no `package.json` exists on disk at all, so the in-process `VERSION`
    // the extension was linked against is the only readable answer.
    const tree = makePeerTree();
    expect(readPeerVersion(AUTHORED_PEER, tree.moduleDir, "9.9.9-host-sdk")).toBe(
      "9.9.9-host-sdk",
    );
  });

  it("is SCOPED: a package outside the authored scope stays undefined even with hostSdkVersion", () => {
    // Otherwise the host's own version would be reported as the satisfied
    // version of a package that is not installed at all, and condition (1)
    // ("unresolvable") would become unobservable.
    const tree = makePeerTree();
    expect(readPeerVersion(FOREIGN_PEER, tree.moduleDir, "9.9.9-host-sdk")).toBeUndefined();
  });

  it("is CONFINED to the four pinned peers: an authored-scope name OUTSIDE the list stays undefined (Step 0 (d))", () => {
    // The spec sentence is exact — "the route is confined to the four pinned
    // peers: any other package name remains genuinely unresolvable" — and a
    // scope-prefix gate would satisfy it for foreign packages while still
    // answering a mistyped or future authored-scope name with the host's own
    // version. Membership in `PEER_DEP_PACKAGES` is the gate.
    const tree = makePeerTree();
    expect(
      readPeerVersion("@earendil-works/pi-not-a-real-peer-xyz", tree.moduleDir, "9.9.9"),
    ).toBeUndefined();
  });

  it("yields undefined with nothing on disk and no hostSdkVersion (condition (1) preserved)", () => {
    const tree = makePeerTree();
    expect(readPeerVersion(AUTHORED_PEER, tree.moduleDir)).toBeUndefined();
  });

  it("prefers a planted on-disk version over hostSdkVersion", () => {
    // Rung 3 is a FALLBACK. A readable install must win, or a version skew
    // between the linked host and the installed peer would be invisible.
    const tree = makePeerTree();
    tree.plant(1, AUTHORED_PEER, { name: AUTHORED_PEER, version: "1.0.0-on-disk" });
    expect(readPeerVersion(AUTHORED_PEER, tree.moduleDir, "2.0.0-host-sdk")).toBe(
      "1.0.0-on-disk",
    );
  });
});

describe("capability-probe.md Step 0 (d) — readPeerVersion enters no module resolver", () => {
  it("answers for a package absent from the REAL ambient node_modules without throwing or hanging", () => {
    // The previous rung 1 called `createRequire(import.meta.url).resolve(pkg +
    // "/package.json")`. On an Oh-My-Pi host that specifier is served by an
    // asynchronous `Bun.plugin` resolver a synchronous resolve cannot drain, so
    // the call deadlocked the extension factory. Walking the REAL ancestor tree
    // (which has a genuine `node_modules`) for a name that is genuinely absent
    // from it is the shape that used to hang: reaching an answer at all is the
    // liveness assertion, and it must be a plain verdict, not a throw.
    let foreign: string | undefined = "unset";
    expect(() => {
      foreign = readPeerVersion("@not-installed-anywhere/pkg-xyz", REAL_MODULE_DIR);
    }).not.toThrow();
    expect(foreign).toBeUndefined();

    // Same walk, a PINNED peer name: the ladder falls through the whole real
    // tree to rung 3 rather than raising the `ERR_MODULE_NOT_FOUND` /
    // `ERR_PACKAGE_PATH_NOT_EXPORTED` a resolver would have raised. The
    // ancestor walk from a temp dir keeps the answer off the repo's own
    // installed peer: no ancestor of the temp root carries it.
    const tree = makePeerTree();
    let authored: string | undefined = "unset";
    expect(() => {
      authored = readPeerVersion(AUTHORED_PEER, tree.moduleDir, "0.99.0");
    }).not.toThrow();
    expect(authored).toBe("0.99.0");
  });
});

// ── PIC-62 obligation 2 — the child-side model pre-flight ───────────────────

/** The minimal available-model shape `matchAvailableModel` is generic over. */
interface AvailableModel {
  readonly id: string;
  readonly provider: string;
}

/**
 * A host registry serving ONE model id through TWO providers — a first-party
 * endpoint plus a gateway. This is the shape the bare-id pre-flight could not
 * read.
 */
const TWO_PROVIDERS: readonly AvailableModel[] = Object.freeze([
  { provider: "anthropic", id: "claude-sonnet-4-5" },
  { provider: "openrouter", id: "claude-sonnet-4-5" },
]);

describe("PIC-62 — the child-side model pre-flight matches the fully-qualified provider/id reference", () => {
  it("a bare id served by TWO providers is AMBIGUOUS and matches nothing", () => {
    // The trap: `matchAvailableModel` answers `undefined` for "ambiguous" with
    // the same value it answers for "no match", and the child-side pre-flight
    // read that as TOTAL non-resolution and refused every child.
    expect(matchAvailableModel("claude-sonnet-4-5", TWO_PROVIDERS)).toBeUndefined();
  });

  it("the qualified provider/id reference for the SAME data resolves to exactly one model", () => {
    expect(matchAvailableModel("anthropic/claude-sonnet-4-5", TWO_PROVIDERS)).toEqual({
      provider: "anthropic",
      id: "claude-sonnet-4-5",
    });
    expect(matchAvailableModel("openrouter/claude-sonnet-4-5", TWO_PROVIDERS)).toEqual({
      provider: "openrouter",
      id: "claude-sonnet-4-5",
    });
  });

  it("a qualified reference whose provider does not match yields undefined", () => {
    // The qualified form narrows; it must not degrade to an id-only match.
    expect(matchAvailableModel("bedrock/claude-sonnet-4-5", TWO_PROVIDERS)).toBeUndefined();
    expect(matchAvailableModel("anthropic/no-such-model", TWO_PROVIDERS)).toBeUndefined();
  });

  it("the qualified round-trip a child performs confirms the model it was marshalled", () => {
    // End to end at the reachable level: the child re-qualifies its own
    // `ctx.model`, matches, re-qualifies the match, and confirms.
    const ctxModel: AvailableModel = { provider: "openrouter", id: "claude-sonnet-4-5" };
    const qualified = `${ctxModel.provider}/${ctxModel.id}`;
    const resolved = matchAvailableModel(qualified, TWO_PROVIDERS);
    if (resolved === undefined) {
      expect.fail("the qualified reference the child marshals resolved to no model");
    }
    const resolvedRef = `${resolved.provider}/${resolved.id}`;
    expect(confirmChildModel(qualified, resolvedRef)).toEqual({ ok: true });
  });
});

describe("PIC-62 — theta/runtime/subagent-model-preflight-mismatch", () => {
  it("confirmChildModel passes when expected equals the child-resolved reference", () => {
    expect(confirmChildModel("anthropic/claude-sonnet-4-5", "anthropic/claude-sonnet-4-5"))
      .toEqual({ ok: true });
  });

  it("a mismatch fails with the registry-pinned message and the invoke_infra preflight cause", () => {
    const verdict = confirmChildModel(
      "anthropic/claude-sonnet-4-5",
      "openrouter/claude-sonnet-4-5",
    );
    if (verdict.ok) {
      expect.fail("a differing child-resolved model was admitted — the pre-flight is unreachable");
    }
    const message =
      "subagent model pre-flight mismatch: expected 'anthropic/claude-sonnet-4-5', child resolved 'openrouter/claude-sonnet-4-5'";
    expect(verdict.error.kind).toBe("invoke_infra");
    expect(verdict.error.cause).toBe("subagent_model_preflight_mismatch");
    expect(verdict.error.message).toBe(message);
    expect(verdict.diagnostic.severity).toBe("error");
    expect(verdict.diagnostic.code).toBe(SUBAGENT_MODEL_PREFLIGHT_MISMATCH_CODE);
    expect(verdict.diagnostic.message).toBe(message);
    // The rendered template is the registry's Message column verbatim.
    expect(
      renderModelPreflightMismatchMessage(
        "anthropic/claude-sonnet-4-5",
        "openrouter/claude-sonnet-4-5",
      ),
    ).toBe(message);
  });

  it("total non-resolution surfaces as a real mismatch naming the unresolved marker", () => {
    // The child must NOT fall back to the expected value when its registry
    // holds no match: that would make `confirmChildModel(x, x)` trivially pass
    // and silently admit a child whose model never resolved.
    const qualified = "anthropic/claude-sonnet-4-5";
    expect(matchAvailableModel(qualified, [])).toBeUndefined();
    const verdict = confirmChildModel(qualified, "(unresolved: no matching model)");
    if (verdict.ok) {
      expect.fail("an unresolved child model was admitted by the pre-flight");
    }
    expect(verdict.error.cause).toBe("subagent_model_preflight_mismatch");
    expect(verdict.diagnostic.message).toContain("child resolved '(unresolved: no matching model)'");
  });
});
