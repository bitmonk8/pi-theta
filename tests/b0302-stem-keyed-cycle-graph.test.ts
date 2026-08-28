// Bug 0302 — the IMP-5 cycle graph keys its nodes by `.thetalib` basename STEM,
// not resolved path, so two distinct files named `util.thetalib` in different
// directories collapse into one graph node. The bug has two directions and this
// file witnesses both, each against the behaviour the spec prescribes rather
// than the behaviour the code currently produces.
//
// SPEC ANCHOR (the contract, not the current code):
//   docs/spec_topics/imports.md:128 §Cycles — "Import cycles between
//   `.thetalib` FILES are detected at parse time by walking the static
//   `.thetalib` graph … reported as `theta/load/import-cycle` with the cycle
//   path printed". The graph's nodes are FILES. `/proj/util.thetalib` and
//   `/proj/sub/util.thetalib` are two files with one edge between them, which is
//   ACYCLIC; and `x.thetalib → a/util.thetalib → x.thetalib` is a cycle no
//   matter what else `x` imports. A graph that fuses same-stem files is not the
//   static file graph the spec names whenever two reachable libs share a
//   basename.
//
// ROOT CAUSE (why each cell below diverges — WHY, not restating the code):
//   `thetalibStem` (src/extension/import-static-checks.ts:101, pre-fix, at fork
//   `96f9a136`) is the node id; `walkThetaLib` walks per resolved path but
//   records edge targets as stems (import-static-checks.ts:470, pre-fix, at
//   fork `96f9a136`) and writes the target list under the stem key
//   (`graphEdges.set(stem, targets)`, :477, pre-fix, at fork `96f9a136`), and
//   the IMP-5 loop enters the walk per entry stem
//   (`entryStems.push(thetalibStem(...))`, :800, pre-fix, at fork `96f9a136`).
//   Two files sharing a stem therefore (a) turn a genuine cross-file edge into a self-loop
//   on that stem — the FALSE POSITIVE — and (b) race for one map key, the later
//   `graphEdges.set` overwriting the earlier file's target list wholesale and
//   deleting a real back-edge — the FALSE NEGATIVE.
//
// TIER: unit, offline, deterministic, provider-free. The whole decision settles
// inside one `parseThetaDocument` over a string and one `checkThetaImports` over
// an in-memory `FileSystem` double — no model, no session, no discovery round
// trip participates in cycle detection, so a higher tier would add a live axis
// to a purely static verdict. A paired H9a live acceptance file
// (tests/live/acceptance/b0302live-stem-twin-cycle.test.ts) proves the same two
// directions end-to-end through the real `pi -p` binary; this file pins the
// exact rendered diagnostic strings the load pass computes.
//
// RED / GREEN DIRECTIONS (each cell asserts the POST-FIX expected value):
//   - FALSE-POS (acyclic stem-twin)      — RED NOW: currently draws a spurious
//     `util.thetalib → util.thetalib` self-loop; must become `[]`.
//   - FALSE-NEG (masked real cycle)      — RED NOW: currently `[]` because the
//     stem-twin overwrite deletes the back-edge; must draw the refusal.
//   - CONTROL-CYCLE / CONTROL-XY / SELF  — GREEN NOW and post-fix: real cycles
//     with no stem collision, or a distinct-stem cycle, or a self-import, are
//     already detected correctly, so they are regression guards that stay green
//     in both directions and prove the fix narrows nothing it must keep.
//
// No assertion here is weakened to make the two witnesses pass: they are RED at
// this fork by construction, which is the point.

import { describe, expect, it } from "vitest";
import { checkThetaImports } from "../src/extension/import-static-checks";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import { parseThetaDocument, type ThetaDocument } from "../src/parser/theta-document";
import type { FileSystem } from "../src/seams/file-system";
import { parseDeps } from "./helpers/e2e-s1";

/** The registered load code the spec §Cycles anchor names. */
const CYCLE_CODE = "theta/load/import-cycle";

/** The importing `.theta` frontmatter every fixture shares (a real prompt-mode theta). */
const APP_FRONTMATTER = ["---", 'model: "sonnet"', "mode: prompt", "---"].join("\n");

function parse(source: string, path: string): ThetaDocument {
  return parseThetaDocument({ path, bytes: new TextEncoder().encode(source) }, parseDeps());
}

function parseApp(body: string): ThetaDocument {
  return parse(`${APP_FRONTMATTER}\n${body}`, "/proj/app.theta");
}

// The in-memory `.thetalib` filesystem double from
// tests/reexport-chain-resolution.test.ts: only `readdir` / `readBytes` are
// exercised, every other member rejects so an unexpected call reds loudly.
function fakeThetaLibFs(files: Record<string, string>): FileSystem {
  const dirs = new Map<string, string[]>();
  for (const path of Object.keys(files)) {
    const slash = path.lastIndexOf("/");
    const parent = path.slice(0, slash);
    const entries = dirs.get(parent) ?? [];
    entries.push(path.slice(slash + 1));
    dirs.set(parent, entries);
  }
  const reject = (): Promise<never> =>
    Promise.reject(new Error("filesystem member not exercised by this test"));
  return {
    readText: reject,
    writeText: reject,
    exists: reject,
    homedir: (): string => "/home",
    cwd: (): string => "/proj",
    configDirName: (): string => ".pi",
    globalAgentDir: (): string => "/home/.pi/agent",
    lstat: reject,
    realpath: reject,
    readdir: (path: string): Promise<readonly string[]> => {
      const entries = dirs.get(path);
      return entries === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(entries);
    },
    readBytes: (path: string): Promise<Uint8Array> => {
      const content = files[path];
      return content === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(new TextEncoder().encode(content));
    },
  } as FileSystem;
}

/**
 * Parse `/proj/app.theta`, run the real `checkThetaImports` over `libs`, and
 * render the load-pass diagnostics as `${severity} ${code}: ${message}` lines —
 * the exact string shape the bug doc §Reproduction quotes.
 */
async function diagLines(appBody: string, libs: Record<string, string>): Promise<string[]> {
  const app = parseApp(appBody);
  expect(
    app.frontmatter,
    `the importing theta's frontmatter must parse or the load pass reads nothing; diagnostics: ${JSON.stringify(
      app.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    )}`,
  ).not.toBeNull();
  const input: ThetaCompositionInput = {
    slashName: "app",
    sourcePath: "/proj/app.theta",
    frontmatter: app.frontmatter as ParsedFrontmatter,
    body: app.body,
  };
  const check = await checkThetaImports(input, {
    fs: fakeThetaLibFs(libs),
    parseDeps: parseDeps(),
  });
  return check.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

describe("bug 0302 — the cycle graph's node identity is the file, not the basename stem", () => {
  it("WITNESS (false positive): a same-stem edge between two DIFFERENT files is acyclic and must not be refused", async () => {
    // `app → util` and `util → sub/util` is a chain of THREE distinct files
    // (app.theta, /proj/util.thetalib, /proj/sub/util.thetalib) with two edges
    // and no back-edge — acyclic. The stem-keyed graph fuses the two
    // `util.thetalib` files into one node, so the `util → sub/util` edge becomes
    // a self-loop `util → util` and the walk reports a cycle the source does not
    // contain. imports.md:128 §Cycles counts cycles between FILES; there is
    // none here, so the load pass must report nothing.
    const lines = await diagLines('import { f } from "./util.thetalib"\n', {
      "/proj/util.thetalib":
        'import { g } from "./sub/util.thetalib"\nfn f(x: integer): integer { x }\n',
      "/proj/sub/util.thetalib": "fn g(x: integer): integer { x }\n",
    });
    expect(
      lines,
      `two files sharing the basename \`util.thetalib\` in different directories ` +
        `are two nodes with one edge between them, which is acyclic; the ` +
        `stem-keyed graph collapses them and draws a false ` +
        `\`util.thetalib → util.thetalib\` self-loop. Rendered: ${JSON.stringify(lines)}`,
    ).toEqual([]);
  });

  it("WITNESS (false negative): a real cycle must not be masked by a stem-twin sibling that overwrites the edge list", async () => {
    // `x → a/util → x` is a genuine cycle. `x` ALSO imports a second file named
    // `util.thetalib` (`b/util`), which shares the stem of `a/util`. Under the
    // stem-keyed graph `walkThetaLib` writes `graphEdges["util"] = ["x"]` for
    // `a/util`, then `graphEdges["util"] = []` for `b/util`, deleting the
    // back-edge; the DFS then walks `x → util → (nothing)` and finds no cycle.
    // The spec mandates the `E`-severity refusal regardless of what else `x`
    // imports, so the masked cycle must be surfaced.
    const lines = await diagLines('import { xf } from "./x.thetalib"\n', {
      "/proj/x.thetalib":
        'import { af } from "./a/util.thetalib"\n' +
        'import { bf } from "./b/util.thetalib"\n' +
        "fn xf(k: integer): integer { k }\n",
      "/proj/a/util.thetalib":
        'import { xf } from "../x.thetalib"\nfn af(k: integer): integer { k }\n',
      "/proj/b/util.thetalib": "fn bf(k: integer): integer { k }\n",
    });
    expect(
      lines,
      `\`x.thetalib → a/util.thetalib → x.thetalib\` is a cycle; the stem-twin ` +
        `\`b/util.thetalib\` overwrites the \`util\` node's edge list and masks ` +
        `it. imports.md:128 §Cycles mandates the refusal for any cycle between ` +
        `files. Rendered: ${JSON.stringify(lines)}`,
    ).toEqual([`error ${CYCLE_CODE}: import cycle: x.thetalib → util.thetalib → x.thetalib`]);
  });

  it("GUARD (control cycle): a real cycle with no stem twin is already refused, and stays refused", async () => {
    // Same fixture as the false-negative row MINUS the stem twin: only `a/util`
    // is imported, so no overwrite occurs and the back-edge survives. This is
    // the direction the bug doc measures as already-correct, so it is a
    // regression guard — green now and green after the fix.
    const lines = await diagLines('import { xf } from "./x.thetalib"\n', {
      "/proj/x.thetalib":
        'import { af } from "./a/util.thetalib"\nfn xf(k: integer): integer { k }\n',
      "/proj/a/util.thetalib":
        'import { xf } from "../x.thetalib"\nfn af(k: integer): integer { k }\n',
    });
    expect(
      lines,
      `a genuine \`x → a/util → x\` cycle with no stem collision must always be ` +
        `refused. Rendered: ${JSON.stringify(lines)}`,
    ).toEqual([`error ${CYCLE_CODE}: import cycle: x.thetalib → util.thetalib → x.thetalib`]);
  });

  it("GUARD (distinct-stem cycle): a two-file cycle between distinct stems is refused, and stays refused", async () => {
    // No stems collide, so the stem-keyed and path-keyed graphs agree here.
    // This guards that the path-keying fix does not stop detecting the ordinary
    // two-file cycle it already detects.
    const lines = await diagLines('import { xf } from "./x.thetalib"\n', {
      "/proj/x.thetalib":
        'import { yf } from "./y.thetalib"\nfn xf(k: integer): integer { k }\n',
      "/proj/y.thetalib":
        'import { xf } from "./x.thetalib"\nfn yf(k: integer): integer { k }\n',
    });
    expect(
      lines,
      `a distinct-stem \`x ↔ y\` cycle must be refused in both directions. ` +
        `Rendered: ${JSON.stringify(lines)}`,
    ).toEqual([`error ${CYCLE_CODE}: import cycle: x.thetalib → y.thetalib → x.thetalib`]);
  });

  it("GUARD (self-import): a lib importing itself is refused, and stays refused", async () => {
    // A genuine self-loop on a SINGLE file — the one case where
    // `self.thetalib → self.thetalib` is the correct verdict. It guards that
    // the fix does not silence real self-cycles while removing the FALSE
    // self-loop the false-positive row measures.
    const lines = await diagLines('import { sf } from "./self.thetalib"\n', {
      "/proj/self.thetalib":
        'import { sf } from "./self.thetalib"\nfn sf(k: integer): integer { k }\n',
    });
    expect(
      lines,
      `a file importing itself is a genuine cycle and must be refused. ` +
        `Rendered: ${JSON.stringify(lines)}`,
    ).toEqual([`error ${CYCLE_CODE}: import cycle: self.thetalib → self.thetalib`]);
  });
});
