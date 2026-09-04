import { describe, expect, it } from "vitest";
import { checkThetaImports } from "../src/extension/import-static-checks";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import {
  UNRESOLVABLE_THETALIB_PATH_CODE,
  unresolvableThetaLibPathMessage,
} from "../src/parser/imports";
import { parseThetaDocument, type ThetaDocument } from "../src/parser/theta-document";
import type { MaterializedImport } from "../src/runtime/lexical-environment";
import type { FileSystem } from "../src/seams/file-system";
import { parseDeps } from "./helpers/e2e-s1";

// Bug 0428 — a resolved `.thetalib` whose bytes cannot be read is silently
// accepted. IMP-1 (docs/spec_topics/imports.md:23) makes a byte-exact entry
// that exists but is not readable — EACCES/EPERM, a broken symlink, or a
// DIRECTORY named `*.thetalib` — "likewise unresolvable", owed
// `theta/load/unresolvable-thetalib-path` sited on the importing file, with the
// importer NOT registering. The shipped seam resolves such an entry (the probe
// marks every `readdir`-listed name readable, src/extension/import-static-checks.ts:334-336),
// then `parseThetaLib` settles the `readBytes` rejection to `undefined`
// (src/extension/import-static-checks.ts:448-457) and every consumer `continue`s
// on it (the direct decl loop at src/extension/import-static-checks.ts:964, the
// transitive walk edge, the re-export closure) — no diagnostic at any depth.
//
// §Fix option 1 (recommended, settled): make the read-failure arm push
// `theta/load/unresolvable-thetalib-path` sited on the importing file/statement,
// exactly as the resolution-failure arm does today, at direct + transitive +
// re-export depths. The registered code and message are pinned in
// src/parser/imports.ts:134 (`UNRESOLVABLE_THETALIB_PATH_CODE`) and
// src/parser/imports.ts:139 (`unresolvableThetaLibPathMessage`).
//
// TIER: unit, offline, deterministic, provider-free. The whole class settles
// inside one `parseThetaDocument` over a string plus one `checkThetaImports`
// over an in-memory `FileSystem` double: the read-failure seam
// (`parseThetaLib`'s `readBytes` rejection) is fully reachable in-process, so an
// integration or live tier would add a provider to a decision no model
// participates in. C1's runtime consequence (an unbound imported `fn` falling
// through to tool dispatch) is 0101's settled ground and a throw in an unrelated
// subsystem; the Expected behaviour under test is the LOAD diagnostic, so no
// `executeBody` observable is taken here.
//
// C4 (a real-NTFS DIRECTORY named `lib.thetalib`) is deliberately NOT witnessed:
// it is the same read-rejection mechanism (a directory read as a file rejects
// with `EISDIR`) exercised offline as an EACCES rejection below, and pinning it
// would require a real `PiFileSystem` and lose determinism.

/** The importing `.theta` frontmatter every fixture shares. */
const APP_FRONTMATTER = ["---", 'model: "sonnet"', "mode: prompt", "---"].join("\n");

function parse(source: string, path: string): ThetaDocument {
  return parseThetaDocument({ path, bytes: new TextEncoder().encode(source) }, parseDeps());
}

function parseApp(body: string): ThetaDocument {
  return parse(`${APP_FRONTMATTER}\n${body}`, "/proj/app.theta");
}

/**
 * In-memory `FileSystem` double. Mirrors b0306's `fakeThetaLibFs`, with one
 * addition for this bug: paths in `unreadable` are LISTED by `readdir` on their
 * parent (so IMP-1 resolution succeeds — the entry is byte-exact present) while
 * `readBytes` on them REJECTS with an EACCES-shaped error — the exact
 * "listed-but-unreadable" state the bug names. A path may appear in `files` OR
 * in `unreadable`, never both.
 */
function fakeThetaLibFs(
  files: Record<string, string>,
  unreadable: readonly string[] = [],
): FileSystem {
  const dirs = new Map<string, string[]>();
  const list = (path: string): void => {
    const slash = path.lastIndexOf("/");
    const parent = path.slice(0, slash);
    const entries = dirs.get(parent) ?? [];
    entries.push(path.slice(slash + 1));
    dirs.set(parent, entries);
  };
  for (const path of Object.keys(files)) list(path);
  for (const path of unreadable) list(path);
  const unreadableSet = new Set(unreadable);
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
      if (unreadableSet.has(path)) {
        // The read-failure the resolver's `entryReadable` refinement is meant
        // to pre-empt (IMP-1) but the shipped probe never surfaces.
        return Promise.reject(
          Object.assign(new Error(`EACCES: permission denied, open '${path}'`), {
            code: "EACCES",
          }),
        );
      }
      const content = files[path];
      return content === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(new TextEncoder().encode(content));
    },
  } as FileSystem;
}

/** One load-pass measurement over the double: parse codes + the check result. */
interface Loaded {
  readonly appParseCodes: string[];
  readonly diagnostics: readonly Diagnostic[];
  readonly diagLines: string[];
  readonly materialised: MaterializedImport[];
  readonly resolvedLibs: readonly string[];
}

async function loadCheck(
  appBody: string,
  files: Record<string, string>,
  unreadable: readonly string[] = [],
): Promise<Loaded> {
  const app = parseApp(appBody);
  // A frontmatter parse failure means the load pass reads nothing — an unmet
  // precondition, not the symptom under test. Fail loudly naming it.
  expect(
    app.frontmatter,
    `frontmatter must parse or the load pass reads nothing; parse diagnostics: ${JSON.stringify(
      app.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    )}`,
  ).not.toBeNull();
  const frontmatter = app.frontmatter as ParsedFrontmatter;
  const input: ThetaCompositionInput = {
    slashName: "app",
    sourcePath: "/proj/app.theta",
    frontmatter,
    body: app.body,
  };
  const check = await checkThetaImports(input, {
    fs: fakeThetaLibFs(files, unreadable),
    parseDeps: parseDeps(),
  });
  return {
    appParseCodes: app.diagnostics.map((d) => d.code),
    diagnostics: check.diagnostics,
    diagLines: check.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    materialised: check.imports,
    resolvedLibs: check.resolvedLibs,
  };
}

describe("bug 0428 — a resolved-but-unreadable .thetalib is refused, not silently accepted", () => {
  it("C1 (RED): a listed-but-unreadable direct import draws theta/load/unresolvable-thetalib-path", async () => {
    // `readdir(/proj)` lists `lib.thetalib`; `readBytes(/proj/lib.thetalib)`
    // rejects EACCES. Resolution succeeds (the probe marks the listed entry
    // readable), then the read fails — IMP-1's "exists but is not readable …
    // likewise unresolvable" clause. RED now: the read failure is discarded,
    // so `diagnostics` is empty.
    const row = await loadCheck(
      'import { af } from "./lib.thetalib"\nlet y = af(1)\ny',
      {},
      ["/proj/lib.thetalib"],
    );
    expect(row.appParseCodes, "C1: the importing file parses clean").toEqual([]);
    const unresolvable = row.diagnostics.filter(
      (d) => d.code === UNRESOLVABLE_THETALIB_PATH_CODE,
    );
    expect(
      row.diagLines,
      "C1: imports.md:23 (IMP-1) — a byte-exact entry that exists but is not readable is likewise unresolvable, owed theta/load/unresolvable-thetalib-path against the importing file",
    ).toContain(
      `error ${UNRESOLVABLE_THETALIB_PATH_CODE}: ${unresolvableThetaLibPathMessage("./lib.thetalib")}`,
    );
    expect(
      unresolvable[0]?.file,
      "C1: the diagnostic is sited on the importing file (imports.md:23 — 'against the importing file')",
    ).toBe("/proj/app.theta");
    expect(
      row.resolvedLibs,
      "C1: bug 0312 watch-set symmetry — a DIRECT resolved-but-unreadable lib is watched (present in resolvedLibs) exactly as a transitive one is, so repairing the permission/directory fault fires a reload",
    ).toContain("/proj/lib.thetalib");
    expect(
      unresolvable.length,
      "C1: exactly one unresolvable-thetalib-path row — the direct read failure is reported once, not double-reported",
    ).toBe(1);
    expect(
      row.materialised.map((m) => `${m.kind} ${m.name}`),
      "C1: an unresolvable import materialises nothing — its imported names stay unbound",
    ).toEqual([]);
  });

  it("C2 (GREEN control): an entry absent from readdir fires the identical code+message", async () => {
    // The byte-identical control the C1/C3 refusals must match: a decoy sibling
    // makes `readdir(/proj)` return a listing WITHOUT `lib.thetalib`, so the
    // resolver's byte-exact final-segment match fails and IMP-1 fires today.
    // This pins the exact code+message shape the read-failure arm owes.
    const row = await loadCheck('import { af } from "./lib.thetalib"\nlet y = af(1)\ny', {
      "/proj/other.thetalib": "// decoy sibling so /proj is listed but lacks lib.thetalib",
    });
    expect(row.appParseCodes, "C2: the importing file parses clean").toEqual([]);
    expect(
      row.diagLines,
      "C2: the resolution-failure arm's registered code+message — the shape C1/C3 must reproduce",
    ).toContain(
      `error ${UNRESOLVABLE_THETALIB_PATH_CODE}: ${unresolvableThetaLibPathMessage("./lib.thetalib")}`,
    );
    expect(
      row.diagnostics.find((d) => d.code === UNRESOLVABLE_THETALIB_PATH_CODE)?.file,
      "C2: sited on the importing file",
    ).toBe("/proj/app.theta");
    expect(
      row.materialised.map((m) => `${m.kind} ${m.name}`),
      "C2: an unresolvable import materialises nothing",
    ).toEqual([]);
  });

  it("C3 (RED): a transitive edge to a listed-but-unreadable lib is diagnosed too", async () => {
    // `a.thetalib` (readable, declares `Sev`) imports the listed-but-unreadable
    // `b.thetalib`. The app imports `Sev` from `a` — that edge is well-formed
    // and materialises. The transitive `a → b` import edge RESOLVES (b is
    // listed+marked-readable) then its read fails silently. Per §Fix the
    // transitive read failure must also draw theta/load/unresolvable-thetalib-path.
    // RED now: `diagnostics` carries nothing for the b edge.
    const row = await loadCheck(
      'import { Sev } from "./a.thetalib"\nlet x = Sev.Low\nx',
      {
        "/proj/a.thetalib": [
          'import { bf } from "./b.thetalib"',
          'enum Sev { Low = "low", High = "high" }',
        ].join("\n"),
      },
      ["/proj/b.thetalib"],
    );
    expect(row.appParseCodes, "C3: the importing file parses clean").toEqual([]);
    expect(
      row.materialised.map((m) => `${m.kind} ${m.name}`),
      "C3: the well-formed a → app edge still materialises Sev (only the b read fails)",
    ).toEqual(["enum Sev"]);
    expect(
      row.diagLines,
      "C3: §Fix — the transitive read failure must draw the registered code on the b edge, byte-identical to C2's control",
    ).toContain(
      `error ${UNRESOLVABLE_THETALIB_PATH_CODE}: ${unresolvableThetaLibPathMessage("./b.thetalib")}`,
    );
    const c3Unresolvable = row.diagnostics.filter(
      (d) => d.code === UNRESOLVABLE_THETALIB_PATH_CODE,
    );
    expect(
      c3Unresolvable.length,
      "C3: exactly one unresolvable-thetalib-path row — the transitive read failure is reported once, not double-reported",
    ).toBe(1);
    expect(
      c3Unresolvable[0]?.file,
      "C3: the transitive diagnostic is sited on the importing lib a (the statement bearing the b edge), not the app or b",
    ).toBe("/proj/a.thetalib");
  });

  it("C5 (RED before F1): a re-export from a listed-but-unreadable source draws exactly one unresolvable-thetalib-path and no import-unknown-symbol co-fire", async () => {
    // `a.thetalib` (readable) re-exports `x` from the listed-but-unreadable
    // `b.thetalib` and declares its own `af`. The app imports `af` from `a`, so
    // `a` is WALKED and the re-export closure runs over it. The `export … from`
    // source RESOLVES (b is listed + marked readable) then its read fails —
    // IMP-1 at re-export depth, owed exactly one
    // theta/load/unresolvable-thetalib-path sited on a's `export` statement.
    // RED before F1: the closure pushed the re-export edges over the empty
    // declared-name set BEFORE detecting the read failure, so diagnoseReExports
    // co-fired a spurious theta/parse/import-unknown-symbol for `x`. The
    // resolution-failure arm suppresses that by contributing no edge; the
    // read-failure arm must too.
    const row = await loadCheck(
      'import { af } from "./a.thetalib"\nlet y = af(1)\ny',
      {
        "/proj/a.thetalib": [
          'export { x } from "./b.thetalib"',
          "fn af(n: integer): integer {",
          "  n",
          "}",
        ].join("\n"),
      },
      ["/proj/b.thetalib"],
    );
    expect(row.appParseCodes, "C5: the importing file parses clean").toEqual([]);
    const unresolvable = row.diagnostics.filter(
      (d) => d.code === UNRESOLVABLE_THETALIB_PATH_CODE,
    );
    expect(
      unresolvable.length,
      "C5: exactly one unresolvable-thetalib-path — the re-export read failure is reported once, not double-reported",
    ).toBe(1);
    expect(
      unresolvable[0]?.file,
      "C5: sited on the re-exporting lib a's export statement (imports.md §Re-exports — reported over the statement's range)",
    ).toBe("/proj/a.thetalib");
    expect(
      row.diagLines.filter((line) => line.includes("theta/parse/import-unknown-symbol")),
      "C5 (F1): a resolved-but-unreadable re-export source contributes no edge, so it draws no second unknown-symbol report over the empty declared-name set — mirroring the resolution-failure arm's suppression",
    ).toEqual([]);
  });
});
