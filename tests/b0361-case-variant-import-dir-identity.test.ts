import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  promises as fsp,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import { checkThetaImports } from "../src/extension/import-static-checks";
import {
  IMPORT_NAME_COLLISION_CODE,
  UNRESOLVABLE_THETALIB_PATH_CODE,
} from "../src/parser/imports";
import {
  createProductionProducerDeps,
  type PiToolDispatch,
} from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import { parseThetaDocument, type ThetaDocument } from "../src/parser/theta-document";
import type { MaterializedImport } from "../src/runtime/lexical-environment";
import { executeBody } from "../src/runtime/statement-executor";
import type { AgentToolResultEnvelope } from "../src/runtime/tool-call-execute";
import { type ThetaValue } from "../src/runtime/value";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import { PiFileSystem } from "../src/seams/pi-file-system";
import { parseDeps } from "./helpers/e2e-s1";

// Bug 0361 — a case-variant DIRECTORY spelling in a `.thetalib` import path
// splits one physical file into two declaring identities on a case-insensitive
// host. `RelativeThetaLibResolver.resolve` (src/parser/imports.ts) joins the
// literal against the importer's directory and returns the joined string with
// no `realpath` canonicalisation; IMP-1's byte-for-byte check guards the FINAL
// segment only, so a case-variant parent segment (`../LIBS/` for on-disk
// `libs/`) whose `readdir` succeeds on a case-insensitive filesystem yields a
// second resolved-path string for the one physical file. Every downstream
// identity is that string: the declaring-enum tag
// (src/runtime/lexical-environment.ts) and the re-export collision site key
// (src/extension/import-static-checks.ts). Two spellings → two tags (face a) /
// two declaring sites (face b).
//
// Expected (the behaviour this test encodes, NOT current behaviour):
//   - runtime-value-model.md:29 — for an imported enum the tag identifies "the
//     declaring `.thetalib` file together with the declared name"; one physical
//     file + one declared name → ONE tag → the same variant reached via two
//     path spellings compares `==` true. Face (a) asserts that true.
//   - imports.md:126 — a diamond, "both edges resolving to the SAME declaring
//     site", is exempt from `theta/parse/import-name-collision`; both edges
//     open/parse/read the one physical `p.thetalib`, so the program loads
//     clean. Face (b) asserts no collision.
//   - imports.md:23 (IMP-1) — the byte-for-byte rule is the FINAL segment
//     against `readdir` bytes; on a case-SENSITIVE host a case-variant DIRECTORY
//     segment is itself unresolvable, so both programs are Windows-legal inputs
//     specifically. That branch is asserted too (no silent skip).
//
// WHY A REAL FILESYSTEM IS MANDATORY: the defect only reproduces where
// `readdir` of a case-variant DIRECTORY parent succeeds — a case-insensitive
// host. The bug-0305 harness's in-memory `FileSystem` double has case-SENSITIVE
// `readdir` (it keys a `Map` by the exact directory string), so it cannot mint
// the second resolved-path identity and cannot witness the split. This file
// therefore drives the PRODUCTION `PiFileSystem` (real `readdir` / `readBytes`
// / `realpath.native`) over a REAL NTFS scratch directory. Because the outcome
// is host-dependent, host case-sensitivity is RUNTIME-DETECTED and BOTH
// branches are asserted loudly — never an early return, never a skip
// (AGENTS.md / CLAUDE.md: a missing precondition fails loudly naming it).
//
// TIER: integration, offline, deterministic, real-FS, provider-free. The seam
// that mints the tag (`checkThetaImports` over `PiFileSystem`) and the seam
// that compares tags (`executeBody`) are both reachable in-process; no model
// participates in the identity decision, so a live tier would add a provider to
// a decision it does not touch. A pure unit tier (the b0305 in-memory double)
// is INSUFFICIENT — its case-sensitive `readdir` cannot reproduce the split
// (see the mandatory-real-FS note above).

/** The importing `.theta` frontmatter every fixture shares. */
const APP_FRONTMATTER = ["---", 'model: "sonnet"', "mode: prompt", "---"].join("\n");

function parse(source: string, path: string): ThetaDocument {
  return parseThetaDocument({ path, bytes: new TextEncoder().encode(source) }, parseDeps());
}

function parseApp(body: string, sourcePath: string): ThetaDocument {
  return parse(`${APP_FRONTMATTER}\n${body}`, sourcePath);
}

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

/** One measured row: the load pass and the settled runtime value. */
interface Ran {
  readonly appParseCodes: string[];
  readonly diagLines: string[];
  readonly materialised: string[];
  /** JSON projection of the settled value (face (a): the boolean `eq` produced). */
  readonly wire: unknown;
  readonly raw: ThetaValue | undefined;
}

/**
 * Parse the app `.theta` at `sourcePath`, run the real `checkThetaImports` over
 * the REAL `PiFileSystem` rooted at `root`, then run the real `executeBody`
 * with whatever the load pass materialised — the bug-0305 harness shape with
 * the in-memory `FileSystem` double replaced by `PiFileSystem`.
 *
 * `resolvePiTool` resolves any name to an "AMBIENT" sentinel and the callable
 * set is a frozen empty snapshot, so an ambient host-tool execution would
 * surface rather than be mistaken for a resolved import — no row here consults
 * it (copied verbatim from the b0305 deps wiring).
 */
async function run(appBody: string, sourcePath: string, root: string): Promise<Ran> {
  const app = parseApp(appBody, sourcePath);
  expect(
    app.frontmatter,
    `frontmatter must parse or the load pass reads nothing; parse diagnostics: ${JSON.stringify(
      app.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    )}`,
  ).not.toBeNull();
  const frontmatter = app.frontmatter as ParsedFrontmatter;
  const input: ThetaCompositionInput = {
    slashName: "app",
    sourcePath,
    frontmatter,
    body: app.body,
  };
  const check = await checkThetaImports(input, {
    fs: new PiFileSystem(root),
    parseDeps: parseDeps(),
  });
  const imports: readonly MaterializedImport[] = check.imports;

  const deps = createProductionProducerDeps({
    pi: {} as unknown as ExtensionAPI,
    root: {
      checkpoint: NOOP_CHECKPOINT,
      idSource: {
        newInvocationId: (): string => "inv-1",
        newToolCallId: (): string => "tc-1",
      },
    } as unknown as RuntimeRoot,
    modelRegistry: {} as unknown as ModelRegistry,
    resolvePiTool: (name: string): PiToolDispatch => ({
      toolName: name,
      execute: (): Promise<AgentToolResultEnvelope> =>
        Promise.resolve({ content: [{ type: "text", text: "AMBIENT" }] }),
    }),
  });
  const theta: ThetaCompositionInput = {
    slashName: "app",
    sourcePath,
    frontmatter,
    body: app.body,
    callableSet: Object.freeze({ entries: new Map() }),
    ...(imports.length > 0 ? { imports } : {}),
  } as ThetaCompositionInput;
  const bindInput: ConversationBindInput = {
    theta,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  };
  const binding = deps.bindPromptConversation(bindInput);
  // Face (b)'s error-severity collision un-registers the theta and may leave
  // `who` unmaterialised, so `who()` can reject at runtime. That face's
  // observable is the load-pass diagnostic, NOT the settled value, so a runtime
  // rejection must not mask the witness: the `.then(ok, err)` rejection arm is
  // the pipeline's sanctioned I/O-boundary pattern (mirrors
  // `PiFileSystem.exists`), not a broad `catch`. Face (a) settles normally.
  const execution = await executeBody(app.body, binding.executeDeps).then(
    (settled) => settled,
    () => undefined,
  );
  const value = execution?.result.value;

  return {
    appParseCodes: app.diagnostics.map((d) => d.code),
    diagLines: check.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    materialised: check.imports.map((m) => `${m.kind} ${m.name}`),
    wire: value === undefined ? null : (JSON.parse(JSON.stringify(value)) as unknown),
    raw: value as ThetaValue | undefined,
  };
}

/** Whether `diagLines` carries a diagnostic with the given code. */
function hasCode(row: Ran, code: string): boolean {
  return row.diagLines.some((line) => line.includes(code));
}

/**
 * The on-disk fixture layout (forward-slash spellings; the case variance lives
 * in the IMPORT LITERALS, not the on-disk names). Written once per scratch
 * root.
 */
function writeLayout(root: string): void {
  const libs = join(root, "libs");
  mkdirSync(join(libs, "shared"), { recursive: true });
  writeFileSync(join(libs, "color.thetalib"), "enum Color { Red, Green }\n", "utf8");
  // Face (a) PRIMARY helper: imports Color through a case-variant DIRECTORY
  // spelling (`../LIBS/` for on-disk `libs/`).
  writeFileSync(
    join(libs, "helper.thetalib"),
    'import { Color } from "../LIBS/color.thetalib"\nfn pick(): Color { Color.Red }\n',
    "utf8",
  );
  // Face (a) CONTROL helper: imports Color through the on-disk casing
  // (`../libs/`), byte-identical to the app's own `./libs/color.thetalib`.
  writeFileSync(
    join(libs, "helper-control.thetalib"),
    'import { Color } from "../libs/color.thetalib"\nfn pick(): Color { Color.Red }\n',
    "utf8",
  );
  writeFileSync(join(libs, "shade.thetalib"), "enum Shade { Dark, Light }\n", "utf8");
  // Face (a2): BOTH edges (color, shade) resolve through the SAME case-variant
  // parent `../LIBS/`, so the second edge (shade) reaches `precache` with that
  // parent already present in the entries-cache — the regression this cell
  // locks is the canonicalisation guard firing independently of the parent's
  // listing-cache state, not just on a directory's first visit.
  writeFileSync(
    join(libs, "multi.thetalib"),
    [
      'import { Color } from "../LIBS/color.thetalib"',
      'import { Shade } from "../LIBS/shade.thetalib"',
      "fn pickColor(): Color { Color.Red }",
      "fn pickShade(): Shade { Shade.Dark }",
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(join(libs, "shared", "p.thetalib"), 'fn who(): string { "p" }\n', "utf8");
  writeFileSync(join(libs, "a.thetalib"), 'export { who } from "./shared/p.thetalib"\n', "utf8");
  // Face (b) PRIMARY b-edge: case-variant DIRECTORY spelling (`./Shared/`).
  writeFileSync(join(libs, "b.thetalib"), 'export { who } from "./Shared/p.thetalib"\n', "utf8");
  // Face (b) CONTROL b-edge: on-disk casing (`./shared/`).
  writeFileSync(
    join(libs, "b-control.thetalib"),
    'export { who } from "./shared/p.thetalib"\n',
    "utf8",
  );
  writeFileSync(
    join(libs, "diamond.thetalib"),
    'export { who } from "./a.thetalib"\nexport { who } from "./b.thetalib"\n',
    "utf8",
  );
  writeFileSync(
    join(libs, "diamond-control.thetalib"),
    'export { who } from "./a.thetalib"\nexport { who } from "./b-control.thetalib"\n',
    "utf8",
  );
}

/**
 * Runtime host-case-sensitivity probe. After `<root>/libs/` exists, write a
 * probe entry and `readdir` the UPPERCASED directory (`<root>/LIBS`): a
 * resolution to the libs entries means the host is case-INSENSITIVE; an ENOENT
 * rejection means case-SENSITIVE. An unexpected error rejects (fails loudly),
 * never silently degrading the branch selection — the `.then(ok, err)`
 * rejection arm is the sanctioned pattern (mirrors `PiFileSystem.exists`), not
 * a broad `catch`.
 */
async function detectCaseInsensitiveHost(root: string): Promise<boolean> {
  writeFileSync(join(root, "libs", "probe.thetalib"), 'fn probe(): string { "p" }\n', "utf8");
  return fsp.readdir(join(root, "LIBS")).then(
    (entries) => entries.includes("probe.thetalib"),
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return false;
      }
      throw error;
    },
  );
}

describe("bug 0361 — a case-variant import directory must not split one physical `.thetalib` into two declaring identities", () => {
  let root: string;
  let caseInsensitive: boolean;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), "b0361-"));
    writeLayout(root);
    caseInsensitive = await detectCaseInsensitiveHost(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("(a) enum declaring identity: color.thetalib reached via `./libs` and `../LIBS` mints ONE tag", async () => {
    // App imports Color directly (`./libs/color.thetalib`) and imports `pick`
    // from a helper that imports the SAME file through the case-variant
    // `../LIBS/color.thetalib`. `pick()` returns `Color.Red`; `Color.Red` is
    // the app's own. Both are the ONE physical declaration.
    const body = [
      'import { Color } from "./libs/color.thetalib"',
      'import { pick } from "./libs/helper.thetalib"',
      "let a = pick()",
      "let eq = a == Color.Red",
      "eq",
    ].join("\n");
    const row = await run(body, join(root, "app.theta"), root);

    // Loud precondition on both branches: the importing file itself parses.
    expect(row.appParseCodes, "(a): the importing app parses clean").toEqual([]);

    if (caseInsensitive) {
      // PRIMARY red on this host: a well-formed enum import is legal at every
      // gate, so the load pass reports nothing.
      expect(
        row.diagLines,
        "IMP-1 (imports.md:23) — `../LIBS/color.thetalib` resolves clean on a case-insensitive host; a well-formed import is legal",
      ).toEqual([]);
      // TODAY settles `false` (two declaring tags); after the fix `true`.
      expect(
        row.wire,
        "runtime-value-model.md:29 — one physical file + one declared name → one tag → `pick() == Color.Red` is true",
      ).toBe(true);
    } else {
      // On a case-sensitive host `../LIBS/` is byte-unresolvable, so the
      // Windows-legal input is a case-sensitive-illegal input.
      expect(
        hasCode(row, UNRESOLVABLE_THETALIB_PATH_CODE),
        "IMP-1 (imports.md:23) — on a case-sensitive host `../LIBS/` is byte-unresolvable",
      ).toBe(true);
    }
  });

  it("(a)-CONTROL enum identity: on-disk-cased helper compares `==` true (green today and after, both hosts)", async () => {
    // The helper is spelled `../libs/color.thetalib` — byte-identical to the
    // app's own `./libs/color.thetalib` — so both operands carry one
    // resolved-path string under ANY minting scheme. This proves face (a)'s
    // red is the case-variant, not a general enum break.
    const body = [
      'import { Color } from "./libs/color.thetalib"',
      'import { pick } from "./libs/helper-control.thetalib"',
      "let a = pick()",
      "let eq = a == Color.Red",
      "eq",
    ].join("\n");
    const row = await run(body, join(root, "app.theta"), root);

    // Loud precondition: the on-disk-cased control setup is a clean load on
    // both hosts (a non-empty diagnostics list is an unmet precondition, not a
    // result under test).
    expect(row.appParseCodes, "(a)-CONTROL: the importing app parses clean").toEqual([]);
    expect(
      row.diagLines,
      "IMP-1 (imports.md:23) — byte-identical on-disk casing resolves on every host; the load pass reports nothing",
    ).toEqual([]);
    expect(
      row.wire,
      "runtime-value-model.md:29 — one resolved-path string on both operands → one tag → `pick() == Color.Red` is true",
    ).toBe(true);
  });

  it("(a2) two libs through one case-variant directory: the SECOND edge under an already-listed variant parent still mints ONE tag", async () => {
    // `multi.thetalib` imports Color THEN Shade, both through `../LIBS/` — the
    // same case-variant parent directory. By the time the Shade edge reaches
    // `precache`, that parent is already in the entries-cache from the Color
    // edge; the bug-0361 fix's canonicalisation guard sits BEFORE the
    // entries-cache early-return specifically so this second edge is not
    // skipped. A fold that moved canonicalisation into the entries-miss branch
    // would keep every other cell in this file green while regressing e2 here.
    const body = [
      'import { Color } from "./libs/color.thetalib"',
      'import { Shade } from "./libs/shade.thetalib"',
      'import { pickColor, pickShade } from "./libs/multi.thetalib"',
      "let e1 = pickColor() == Color.Red",
      "let e2 = pickShade() == Shade.Dark",
      "[e1, e2]",
    ].join("\n");
    const row = await run(body, join(root, "app.theta"), root);

    // Loud precondition on both branches: the importing file itself parses.
    expect(row.appParseCodes, "(a2): the importing app parses clean").toEqual([]);

    if (caseInsensitive) {
      // PRIMARY red on this host: a well-formed pair of enum imports is legal
      // at every gate, so the load pass reports nothing.
      expect(
        row.diagLines,
        "IMP-1 (imports.md:23) — both `../LIBS/` edges resolve clean on a case-insensitive host; a well-formed import is legal",
      ).toEqual([]);
      // e2 is the guard-independence witness: it exercises the SECOND edge
      // through an already-cached parent, so a true here proves the
      // canonicalisation guard in `CachingThetaLibProbe.precache` runs ahead of
      // the entries-cache early-return rather than only on a directory's first
      // visit (runtime-value-model.md:29 — one physical file + one declared
      // name → one tag → `==` is true for BOTH edges).
      expect(row.wire, "runtime-value-model.md:29 — both edges settle to one tag each").toEqual([
        true,
        true,
      ]);
    } else {
      // On a case-sensitive host `../LIBS/` is byte-unresolvable for either
      // edge, so the Windows-legal input is a case-sensitive-illegal input.
      expect(
        hasCode(row, UNRESOLVABLE_THETALIB_PATH_CODE),
        "IMP-1 (imports.md:23) — on a case-sensitive host `../LIBS/` is byte-unresolvable",
      ).toBe(true);
    }
  });

  it("(b) re-export diamond: two directory spellings of one `p.thetalib` draw NO import-name-collision", async () => {
    // `diamond.thetalib` re-exports `who` from `a.thetalib` (`./shared/p`) and
    // `b.thetalib` (`./Shared/p`). Both edges resolve/parse/read the ONE
    // physical `p.thetalib`.
    const row = await run(
      'import { who } from "./libs/diamond.thetalib"\nwho()',
      join(root, "app.theta"),
      root,
    );
    expect(row.appParseCodes, "(b): the importing app parses clean").toEqual([]);

    if (caseInsensitive) {
      // PRIMARY red on this host: TODAY `./Shared/` mints a second declaring
      // site and the collision fires; the diamond over one physical file is
      // exempt.
      expect(
        hasCode(row, IMPORT_NAME_COLLISION_CODE),
        "imports.md:126 — a diamond, both edges resolving to the SAME declaring site, is exempt from import-name-collision",
      ).toBe(false);
    } else {
      // On a case-sensitive host `./Shared/` is unresolvable, so the b-edge
      // simply fails to resolve — no collision, but assert a loud observable of
      // this branch so it is not vacuous.
      expect(
        hasCode(row, IMPORT_NAME_COLLISION_CODE),
        "imports.md:126 — the b-edge is unresolvable on a case-sensitive host, so no collision partner exists",
      ).toBe(false);
      expect(
        hasCode(row, UNRESOLVABLE_THETALIB_PATH_CODE),
        "IMP-1 (imports.md:23) — on a case-sensitive host `./Shared/p.thetalib` is byte-unresolvable",
      ).toBe(true);
    }
  });

  it("(b)-CONTROL re-export diamond: on-disk-cased b-edge draws NO import-name-collision (green today and after, both hosts)", async () => {
    // `diamond-control.thetalib` re-exports `who` from `a.thetalib`
    // (`./shared/p`) and `b-control.thetalib` (`./shared/p`) — both edges spell
    // the shared directory on-disk, so both resolve to one declaring-site
    // string under ANY minting scheme. This proves face (b)'s red is the
    // case-variant, not a general diamond break.
    const row = await run(
      'import { who } from "./libs/diamond-control.thetalib"\nwho()',
      join(root, "app.theta"),
      root,
    );
    // Loud precondition: the on-disk-cased control setup is a clean load on
    // both hosts.
    expect(row.appParseCodes, "(b)-CONTROL: the importing app parses clean").toEqual([]);
    expect(
      row.diagLines,
      "imports.md:126 — both edges resolve to one declaring site; the exempt diamond loads clean on every host",
    ).toEqual([]);
    expect(
      hasCode(row, IMPORT_NAME_COLLISION_CODE),
      "imports.md:126 — one declaring site reached by two on-disk-cased paths is exempt",
    ).toBe(false);
  });
});
