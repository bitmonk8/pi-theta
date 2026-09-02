import { mkdtempSync, mkdirSync, rmSync, writeFileSync, promises as fsp } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildInvokeGraph,
  checkInvokeStaticResolution,
  type CalleeArity,
} from "../src/extension/invoke-static-checks";
import { INVOCATION_CYCLE_CODE } from "../src/runtime/invoke-depth-cycle";
import { CALLEE_HAS_ERRORS_CODE } from "../src/parser/invoke-diagnostics";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import { parseThetaDocument } from "../src/parser/theta-document";
import { PiFileSystem } from "../src/seams/pi-file-system";
import { parseDeps } from "./helpers/e2e-s1";

// Bug 0362 — `buildInvokeGraph` matched an `invoke` edge to a discovered theta
// by a byte-exact, un-canonicalised path string, so a case-variant DIRECTORY
// spelling inside the literal (`../X2/a.theta` for on-disk `<R>/x2/a.theta`)
// dropped the edge on a case-insensitive host. A physical `a ⇄ b` invocation
// cycle then loaded with ZERO diagnostics — INV-1 containment and INV-3 arity
// both pass on the same spelling (they canonicalise via `realpath`) — and the
// only load-time guard against mutual `invoke` recursion, INV-4's
// `theta/load/invocation-cycle`, was silently withheld. The fix mints both the
// graph's node keys and each resolved edge callee through `canonicalizePath`
// (`realpath`), the same identity every sibling consumer of the pass compares
// under (invocation.md §Static resolution; `src/runtime/invocation.ts`).
//
// Expected (the behaviour this test encodes):
//   - invocation.md:83 — `a.theta` invokes `b.theta` invokes `a.theta`; the
//     second discovery MUST be `theta/load/invocation-cycle`. The walked graph
//     is "the per-load-pass static-resolution graph", whose identity is
//     realpath-keyed (invocation.md:20), so the case-variant back-edge closes.
//   - The same-case CONTROL pair (`c ⇄ d`, back-edge `../x2/c.theta`) cycles
//     TODAY and after — proving the variant red is the casing, not a general
//     cycle-detection break — and its graph edges are byte-identical.
//
// WHY A REAL FILESYSTEM IS MANDATORY: the defect only reproduces where
// `realpath` of a case-variant DIRECTORY parent SUCCEEDS — a case-insensitive
// host. An in-memory `FileSystem` double keyed by exact directory string is
// case-SENSITIVE and cannot mint the on-disk canonical spelling that folds the
// variant, so it cannot witness the drop. This file therefore drives the
// PRODUCTION `PiFileSystem` (real `realpath.native`) over a REAL NTFS scratch
// directory. Because the outcome is host-dependent, host case-sensitivity is
// RUNTIME-DETECTED and BOTH branches assert a loud observable — never an early
// return, never a skip (AGENTS.md / CLAUDE.md: a missing precondition fails
// loudly naming it).
//
// TIER: integration, offline, deterministic, real-FS, provider-free. The two
// seams under test — `buildInvokeGraph` (edge minting) and
// `checkInvokeStaticResolution` (the cycle walk) — are both in-process; no
// model participates in the identity decision, so a live tier would add a
// provider to a decision it does not touch.

/** A `mode: subagent` theta whose body is the given lines plus a prompt tail. */
function subagentTheta(...body: readonly string[]): string {
  return ["---", "mode: subagent", "---", ...body].join("\n") + "\n";
}

/** The four on-disk thetas. The case variance lives ONLY in `b`'s back-edge. */
const LAYOUT: Record<string, string> = {
  // Variant pair: `a → b`, and `b → a` spelled `../X2/` for on-disk `x2/`.
  "a.theta": subagentTheta('let _ = invoke("./b.theta")?', "@`a`"),
  "b.theta": subagentTheta('let _ = invoke("../X2/a.theta")?', "@`b`"),
  // Control pair: `c → d`, and `d → c` spelled `../x2/` (on-disk casing).
  "c.theta": subagentTheta('let _ = invoke("./d.theta")?', "@`c`"),
  "d.theta": subagentTheta('let _ = invoke("../x2/c.theta")?', "@`d`"),
};

/** Write `<root>/x2/{a,b,c,d}.theta`. */
function writeLayout(root: string): void {
  const x2 = join(root, "x2");
  mkdirSync(x2, { recursive: true });
  for (const [name, source] of Object.entries(LAYOUT)) {
    writeFileSync(join(x2, name), source, "utf8");
  }
}

/**
 * Runtime host-case-sensitivity probe: after `<root>/x2/` exists, `readdir` the
 * UPPERCASED directory (`<root>/X2`). A resolution means case-INSENSITIVE; an
 * ENOENT rejection means case-SENSITIVE. Any other error rejects (fails
 * loudly), never silently degrading branch selection — the `.then(ok, err)`
 * rejection arm is the sanctioned pattern (mirrors `PiFileSystem.exists`), not
 * a broad `catch`.
 */
async function detectCaseInsensitiveHost(root: string): Promise<boolean> {
  return fsp.readdir(join(root, "X2")).then(
    (entries) => entries.includes("a.theta"),
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return false;
      }
      throw error;
    },
  );
}

/** Parse one on-disk theta into a `ThetaCompositionInput` (slash name = stem). */
function inputFor(root: string, name: string): ThetaCompositionInput {
  const sourcePath = join(root, "x2", name);
  const doc = parseThetaDocument(
    { path: sourcePath, bytes: new TextEncoder().encode(LAYOUT[name]) },
    parseDeps(),
  );
  expect(
    doc.frontmatter,
    `precondition: ${name} carries \`mode: subagent\` frontmatter; a null ` +
      `frontmatter means the parse harness changed shape (diagnostics: ` +
      `${JSON.stringify(doc.diagnostics.map((d) => `${d.severity} ${d.code}`))})`,
  ).not.toBeNull();
  const frontmatter = doc.frontmatter as ParsedFrontmatter;
  return { slashName: name.replace(/\.theta$/, ""), sourcePath, frontmatter, body: doc.body };
}

/** One measured row: the built graph's edges and each theta's diagnostic codes. */
interface Ran {
  readonly edges: [string, readonly string[]][];
  readonly codes: Record<string, string[]>;
}

/**
 * Build the invoke graph across all four thetas over the REAL `PiFileSystem`,
 * then run `checkInvokeStaticResolution` per input with `activeRoots` = the x2
 * root and the shared graph — the exact composition-root wiring shape
 * (`production-composition.ts` §"INV-4 … build the … invoke graph once").
 */
async function run(root: string): Promise<Ran> {
  const fs = new PiFileSystem(root);
  const activeRoots = [join(root, "x2")];
  const inputs = ["a.theta", "b.theta", "c.theta", "d.theta"].map((name) => inputFor(root, name));
  const graph = await buildInvokeGraph(inputs, fs);

  // Faithful arity resolution: read + parse the callee and report its `params:`
  // arity. These thetas declare no params, so arity never fires; the resolver is
  // wired so a future param addition is checked rather than silently skipped.
  const resolveCalleeArity = (absPath: string): Promise<CalleeArity | undefined> =>
    fs.readBytes(absPath).then(
      (bytes) => {
        const doc = parseThetaDocument({ path: absPath, bytes }, parseDeps());
        if (doc.frontmatter === null) return undefined;
        const fields = doc.frontmatter.params?.fields ?? [];
        return {
          requiredCount: fields.filter((f) => !f.hasDefault && f.optional !== true).length,
          totalCount: fields.length,
          fields: fields.map((f) => ({ typeSource: f.type, name: f.wireName })),
        };
      },
      () => undefined,
    );

  const codes: Record<string, string[]> = {};
  for (const input of inputs) {
    const diags = await checkInvokeStaticResolution(input, {
      fs,
      activeRoots,
      graph,
      resolveCalleeArity,
    });
    codes[input.slashName] = diags.map((d) => d.code);
  }
  return { edges: [...graph.edges].map(([k, v]) => [k, v]), codes };
}

/** Whether row `stem` carries a diagnostic with `code`. */
function has(row: Ran, stem: string, code: string): boolean {
  return (row.codes[stem] ?? []).includes(code);
}

describe("bug 0362 — a case-variant invoke directory spelling must not drop the cycle edge", () => {
  let root: string;
  let caseInsensitive: boolean;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), "b0362-"));
    writeLayout(root);
    caseInsensitive = await detectCaseInsensitiveHost(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("variant `a ⇄ b`: the case-variant back-edge closes the cycle (both entries refuse)", async () => {
    const row = await run(root);

    if (caseInsensitive) {
      // PRIMARY red at fork: TODAY `../X2/a.theta` string-mismatches the
      // discovered `x2/a.theta` node, the `b → a` edge drops (`["b",[]]`), and
      // both thetas load clean. After the fix the realpath-keyed graph closes
      // the edge and INV-4 fires from BOTH entries (invocation.md:83).
      expect(
        has(row, "a", INVOCATION_CYCLE_CODE),
        "invocation.md:83 — `a → b → a` is a mutual cycle; the second discovery is theta/load/invocation-cycle",
      ).toBe(true);
      expect(
        has(row, "b", INVOCATION_CYCLE_CODE),
        "invocation.md:83 — `b → a → b` is the same cycle walked from b",
      ).toBe(true);
      // The realpath-keyed graph closes the variant back-edge to the canonical
      // `a` node.
      expect(
        row.edges,
        "invocation.md:20 — the walked graph is realpath-keyed; the variant back-edge resolves to node `a`",
      ).toContainEqual(["b", ["a"]]);
    } else {
      // On a case-sensitive host `<R>/X2/a.theta` is byte-unresolvable, so the
      // realpath probe rejects: the containment check maps it to a
      // WARNING-severity `callee-has-errors` and the edge never forms.
      // No cycle — assert a loud observable of this branch so it is not vacuous.
      expect(
        has(row, "b", CALLEE_HAS_ERRORS_CODE),
        "invocation.md §Resolution — on a case-sensitive host `../X2/a.theta` is byte-unresolvable (callee-has-errors)",
      ).toBe(true);
      expect(
        has(row, "b", INVOCATION_CYCLE_CODE),
        "no cycle can close through an unresolvable callee on a case-sensitive host",
      ).toBe(false);
      expect(row.edges, "the unresolvable variant edge never forms").toContainEqual(["b", []]);
    }
  });

  it("control `c ⇄ d`: the on-disk-cased back-edge cycles on every host (green at fork and after)", async () => {
    const row = await run(root);

    // `../x2/c.theta` is byte-identical to the on-disk `x2/c.theta`, so this
    // pair closes under ANY minting scheme — the invariant that isolates the
    // variant pair's red to the casing, not to cycle detection generally.
    expect(
      has(row, "c", INVOCATION_CYCLE_CODE),
      "invocation.md:83 — `c → d → c` is a mutual cycle on every host",
    ).toBe(true);
    expect(
      has(row, "d", INVOCATION_CYCLE_CODE),
      "invocation.md:83 — `d → c → d` is the same cycle walked from d",
    ).toBe(true);
    expect(
      row.edges,
      "the on-disk-cased control edges are byte-identical under every minting scheme",
    ).toEqual(
      expect.arrayContaining([
        ["c", ["d"]],
        ["d", ["c"]],
      ]),
    );
  });
});
