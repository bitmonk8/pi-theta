import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  resolveCallableSet,
  type CallableSetDeps,
  type CallableSetResult,
  type ToolsField,
} from "../src/parser/callable-set";

// Bug 0069, §Fix constraint 5 — the `tools:` entry grammar has a second
// implementation. `presentedCallableNames`
// (src/extension/production-theta-producer.ts:3595) reads the presented
// callable names off the frozen resolution snapshot when a theta has one, and
// falls back to deriving them from `frontmatter.tools` when it does not (an
// in-memory harness fixture). That fallback re-derives the entry grammar
// itself — a whitespace split plus the `parts[1] === "as"` test, :3600–3607 —
// so closing the grammar in the resolver alone leaves two answers in the tree
// to "which entries exist", and the fallback's is the one that still admits
// residue (docs/bugs/0069-tools-entry-residue-silently-dropped.md §Fix
// constraint 5).
//
// THE PINNED POST-FIX CONTRACT: the grammar is exported from
// src/parser/callable-set.ts as the single source of truth and the fallback
// consumes it, carrying no token grammar of its own. A malformed entry then has
// no presented name on either side, so the two cannot disagree.
//
// TIER: unit, offline, provider-free, deterministic. `presentedCallableNames`
// is module-private — it appears in no `export` of
// src/extension/production-theta-producer.ts — and its only reach is a full
// bind-and-execute drive through the producer, whose observable is the
// environment's callable registry rather than the name list. Group (D1)
// therefore holds the lock-step over the shipped source text, on the footing
// tests/di-seam-skeleton.test.ts uses for its ambient-primitive scan of the
// real `src/**` tree; group (D2) pins the derivation both sides must produce,
// which is the agreement's other half and is what makes a delegating fallback
// checkable at all.
//
// WHAT IS RED HERE AND WHY: (D1) the fallback still carries its own
// whitespace-split token grammar, so `- read bash` yields the presented name
// `read` there while the closed resolver yields no entry at all. GREEN BY
// DESIGN: (D2), the presented-name derivation for the three well-formed entry
// shapes — a bare Pi-tool name, a hyphenated `.theta` basename, and an `as`
// rename — which the shared grammar must keep producing unchanged.
//
// NO SILENT SKIPPING: (D1) throws by name if the function it scans cannot be
// located in the shipped source, so a rename can never read as a pass.

// --- The shipped source under scan -----------------------------------------

const PRODUCER_SOURCE = readFileSync(
  fileURLToPath(
    new URL("../src/extension/production-theta-producer.ts", import.meta.url),
  ),
  "utf8",
);

/**
 * The body text of the named top-level function in `source`, from its
 * declaration line to the closing brace in column 0. Throws when the
 * declaration is absent: the scan's subject must exist for its verdict to mean
 * anything.
 */
function topLevelFunctionBody(source: string, name: string): string {
  const start = source.indexOf(`\nfunction ${name}(`);
  if (start < 0) {
    throw new Error(
      `no top-level \`function ${name}(\` in src/extension/production-theta-producer.ts: ` +
        "the lock-step scan has no subject",
    );
  }
  const end = source.indexOf("\n}\n", start);
  if (end < 0) {
    throw new Error(
      `no column-0 closing brace for \`function ${name}\`: the lock-step scan ` +
        "cannot delimit its subject",
    );
  }
  return source.slice(start, end + 3);
}

// ===========================================================================
// Group (D1) — one grammar, one implementation.
// ===========================================================================

describe("Bug 0069 (D1) — the snapshot-absent fallback carries no entry grammar of its own", () => {
  const body = topLevelFunctionBody(PRODUCER_SOURCE, "presentedCallableNames");

  it("does not split an entry into tokens itself", () => {
    expect(
      body,
      "`presentedCallableNames` still tokenises a `tools:` entry, so the tree " +
        "holds a second answer to which entries exist — and this one admits " +
        "the residue the resolver rejects:\n" + body,
    ).not.toMatch(/\bsplit\(/);
  });

  it("does not re-test the `as` keyword itself", () => {
    expect(
      body,
      "`presentedCallableNames` still decides the `as` clause locally instead " +
        "of asking the shared grammar:\n" + body,
    ).not.toMatch(/["']as["']/);
  });
});

// ===========================================================================
// Group (D2) — the derivation both sides must agree on.
// ===========================================================================

/** A `CallableSetDeps` over an explicit Pi-tool registry and `.theta` table. */
function deps(
  piTools: readonly string[],
  thetaPaths: readonly string[],
): CallableSetDeps {
  const available = new Set(piTools);
  const callees = new Set(thetaPaths);
  return {
    resolvePiTool: (name) =>
      available.has(name)
        ? { kind: "pi-tool", toolDefinition: { name } as never }
        : undefined,
    resolveThetaCallee: (thetaPath) =>
      callees.has(thetaPath)
        ? { kind: "theta", mode: "subagent", callee: undefined, calleePath: thetaPath }
        : undefined,
    reservedNames: new Set<string>(),
  };
}

function resolveList(
  items: readonly string[],
  piTools: readonly string[],
  thetaPaths: readonly string[] = [],
): CallableSetResult {
  const tools: ToolsField = { kind: "list", items };
  return resolveCallableSet({
    file: "test.theta",
    tools,
    deps: deps(piTools, thetaPaths),
  });
}

describe("Bug 0069 (D2) — the presented names of the well-formed entry shapes", () => {
  it("a bare Pi-tool name, a hyphenated `.theta` basename, and an `as` rename", () => {
    // The three derivations a delegating fallback has to reproduce verbatim:
    // the Pi-tool name unchanged, the basename with hyphens mapped to
    // underscores, and the `as` target in place of either default.
    const r = resolveList(
      ["read", "./code-review.theta", "grep as searcher"],
      ["read", "grep"],
      ["./code-review.theta"],
    );
    expect(r.registered, `resolution diagnostics: ${JSON.stringify(r.diagnostics)}`).toBe(
      true,
    );
    expect([...(r.callableSet?.entries.keys() ?? [])].sort()).toEqual([
      "code_review",
      "read",
      "searcher",
    ]);
  });
});
