// H9a live acceptance — bug 0445: an `array<Import>` `system:` param whose
// imported `.thetalib` schema declares `as` renames must render each element's
// WIRE keys into the spawned child's `--system-prompt`, proved END-TO-END
// through the real `pi -p` binary for a REAL `.thetalib` import
// (docs/bugs/0445-imported-renames-static-container-positions.md).
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESSES DO NOT.
// tests/b0445-imported-renames-static-container-positions.test.ts pins the
// load-phase static-container patch bytes over the in-process load seams
// (`parseThetaDocument` + `checkThetaImports` + `renderSystemPrompt`) against an
// IN-MEMORY `FileSystem` double. This file spawns the real `pi` binary in print
// mode over its own throwaway discovery root and observes the outcome through
// real extension auto-load, `--theta` discovery, the shipped composition root,
// REAL `.thetalib` import resolution off disk, AND the RFC-0006 subagent
// child-process launch that installs the load-phase-patched (wire-name)
// `array<Import>` `system:` template as the child's `--system-prompt` at the
// spawn boundary — the channel an operator actually sees. This is the
// drive-outcome flip the offline witnesses cannot reach; bug 0423's live cell
// (b0422live) exercises the BARE imported position — this cell exercises the
// `array<Import>` CONTAINER position one container in, the new bug-0445 patch.
//
// WHY THE FLIP IS OBSERVED THROUGH `invoke`, NOT A PRINTED DIAGNOSTIC.
// `system:` is subagent-mode only, so the callee is `mode: subagent`; a subagent
// transcript is private, so its answer is not on the outer `pi -p` stdout — a
// prompt prober `invoke<integer>`s it (the TYPED form, so the child's integer
// crosses the PIC-59 envelope) and computes over the returned number.
//
// WHY A COMPUTE-FROM-INLINE-VALUE DISCRIMINATOR (never a verbatim echo — bug
// 0243 / AGENTS.md). The child's `system:` renders the array of author records
// at the spawn boundary. The imported `Author` schema renames its integer field
// `weight as "Weight"`, so the WIRE render keys that integer under `"Weight"`;
// the fork's theta-side render (no load-phase carry at the array position) keys
// it under `weight`. The child is instructed to sum every value stored under a
// key spelled EXACTLY `"Weight"` and add it to the number in its request. A WIRE
// render → both records expose `"Weight"` (10 + 20 = 30) → child computes
// 500 + 30 = 530 → the prober answers 530 + 100 = 630. The fork's theta-side
// render exposes no `"Weight"` key → child adds 0 → returns 500 → the prober
// answers 600. The discriminator is an ANSWER to a task question, computed over
// the rendered structure — not a demand to echo the prompt.
//
// WHY THE ARRAY ARRIVES SCHEMA-CONSTRUCTED. A bare object literal at an
// `invoke(...)` argument slot is `theta/parse/bare-object-literal`; the prober
// therefore declares its own `schema Author` (theta-side field names) and binds
// a type-annotated `array<Author>` value, admitted structurally against the
// child's `array<Author>` param. The per-element wire render is a property of
// the CALLEE's own imported schema, so the prober's un-renamed theta-side names
// do not decide it — only the imported `.thetalib`'s `as` renames do.
//
// SUBAGENT CHILD PINS (AGENTS.md §"In-process harnesses…need the child pins"):
// the prober's `invoke` launches an RFC-0006 child. The shared harness supplies
// both pins at every spawn: `spawnPiPrint` sets `PI_THETA_SUBAGENT_EXTENSION_PIN`
// to this tree's `extensions/` and carries the parent-pid so the control plane
// authenticates, and the outer process runs `-ne -e <this tree's extensions>` —
// so the child binds exactly the build under test.
//
// SCOPE ISOLATION (bug 0030). This file is deliberately OUTSIDE the nine-area
// H9a manifest: it adds no `FeatureArea`, touches none of the committed fixtures
// under `./fixtures`, and uses its own temp discovery root. It does NOT call
// `assertStderrClean` and does NOT call `assertCodesSubsetOfPermitted`, so it
// needs NO entry in `tests/fixtures/h7a/permitted-codes.json` — this cell
// asserts only a positive stdout number.
//
// Token-bounded: one `pi -p` spawn, one prober turn plus the invoked child's
// single typed-query turn.

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { failLoudly, requireLiveHost, resolveAcceptanceHost, spawnPiPrint } from "./harness";
import { parseThetaDocument, type ThetaDocument } from "../../../src/parser/theta-document";
import { checkThetaImports } from "../../../src/extension/import-static-checks";
import { renderSystemPrompt, type SystemTemplate } from "../../../src/parser/system-interpolation";
import type { ParsedFrontmatter } from "../../../src/parser/frontmatter";
import type { ThetaCompositionInput } from "../../../src/extension/theta-composition-producer";
import type { FileSystem } from "../../../src/seams/file-system";
import type { Diagnostic } from "../../../src/diagnostics/diagnostic";
import type { ThetaValue } from "../../../src/runtime/value";
import { parseDeps } from "../../helpers/e2e-s1";

const PROJ_DIR = "/proj";
const TYPES_LIB_PATH = `${PROJ_DIR}/types.thetalib`;

/**
 * The imported `.thetalib` with WIRE renames: `first_name as "FirstName"` and
 * `weight as "Weight"`. Fields are comma-separated (a newline-only `.thetalib`
 * schema body draws `theta/parse/unsupported-feature`).
 */
const TYPES_LIB = [
  "schema Author {",
  '  first_name as "FirstName": string,',
  '  weight as "Weight": integer,',
  "}",
  "",
].join("\n");

/**
 * The child: a subagent whose `system:` interpolates the `array<Author>` param
 * `${authors}` over the imported `.thetalib` schema. `weight as "Weight"` means
 * the WIRE render keys each element's integer under `"Weight"`; under the fix
 * the load-phase static-container carry renders `[{"FirstName":…,"Weight":10},…]`
 * so the child sums 10 + 20 = 30 and returns 500 + 30 = 530. With the fix
 * neutralised the array renders theta-side keys (`weight`), the child finds no
 * `"Weight"` key, adds 0, and returns 500. `<BIND_MODEL>` is rewritten to the
 * resolved live host so the params theta's load-time binder-model resolves (the
 * binder is bypassed at runtime on the marshalled invoke path, PIC-60 — this
 * line only clears the load check).
 */
const CHILD_TEMPLATE = [
  "---",
  "mode: subagent",
  "bind_model: <BIND_MODEL>",
  "system: 'You are a calculator. Your list of author records is ${authors}. Each record stores an integer under a key. Sum every integer stored under a key spelled EXACTLY \"Weight\" (capital W) across all records; if a record has no key spelled exactly \"Weight\", treat its contribution as 0. Add that sum to any number you are given in the request, then reply with only the single resulting integer.'",
  "params:",
  "  authors: 'array<Author>'",
  "---",
  'import { Author } from "./types.thetalib"',
  "let n: integer = @`The number is 500. Apply your standing instruction and reply with only the single resulting integer.`?",
  "n",
  "",
].join("\n");

/**
 * The prober: prompt-mode; declares its own `schema Author` (theta-side names),
 * binds a type-annotated `array<Author>` value, `invoke<integer>`s the child,
 * and computes over the returned integer. A wire-rendered child returns 530 →
 * the prober answers 630; the fork's theta-side render → child returns 500 →
 * the prober answers 600.
 */
const PROBE = [
  "---",
  "mode: prompt",
  "---",
  "schema Author { first_name: string, weight: integer }",
  'let authors: array<Author> = [Author { first_name: "Ada", weight: 10 }, Author { first_name: "Bob", weight: 20 }]',
  'let res = invoke<integer>("./b0445childwire.theta", authors)',
  "let d = match res {",
  "  Ok(v) => v,",
  "  Err(e) => 0",
  "}",
  "@`A calculator probe finished with code ${d}. What is ${d} plus 100? Answer with the number only.`",
  "",
].join("\n");

/** The wire-rendered answer (530 from the child + 100 from the prober). */
const WIRE_OK = "630";
/** The answer the prober prints for the fork's theta-side render (child returns 500). */
const NEUTRALISED_ANSWER = "600";

/** The marshalled (theta-side, un-renamed) array value the invoke argument carries. */
const MARSHALLED_AUTHORS = [
  { first_name: "Ada", weight: 10 },
  { first_name: "Bob", weight: 20 },
] as unknown as ThetaValue;

/** The wire form the load-phase array-face carry must render for MARSHALLED_AUTHORS. */
const EXPECTED_WIRE_RENDER =
  'You are a calculator. Your list of author records is [{"FirstName":"Ada","Weight":10},{"FirstName":"Bob","Weight":20}].';

/**
 * An in-memory `FileSystem` serving only the registered `.thetalib` fixture —
 * every other member REJECTS, so a resolution that reads off-fixture reds loudly
 * rather than resolving an empty buffer (the b0422/b0423 `fakeThetaLibFs`).
 */
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
    cwd: (): string => PROJ_DIR,
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

/** One measured child LOAD row: the effective template the spawn site renders + preconditions. */
interface ChildLoadRow {
  readonly errorCodes: readonly string[];
  readonly materialised: readonly string[];
  readonly effectiveTemplate: SystemTemplate;
  readonly patchedSystemTemplateDefined: boolean;
}

/**
 * Drive the REAL LOAD path for the child theta (the same seam the b0445 unit
 * test uses): parse `/proj/b0445childwire.theta`, then run `checkThetaImports`
 * over the in-memory `.thetalib` fixture. The effective template the spawn site
 * renders is `check.patchedSystemTemplate ?? doc.frontmatter.system`.
 */
async function measureChildLoad(childText: string): Promise<ChildLoadRow> {
  const doc: ThetaDocument = parseThetaDocument(
    { path: `${PROJ_DIR}/b0445childwire.theta`, bytes: new TextEncoder().encode(childText) },
    parseDeps(),
  );
  const input: ThetaCompositionInput = {
    slashName: "b0445childwire",
    sourcePath: `${PROJ_DIR}/b0445childwire.theta`,
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const check = (await checkThetaImports(input, {
    fs: fakeThetaLibFs({ [TYPES_LIB_PATH]: TYPES_LIB }),
    parseDeps: parseDeps(),
  })) as Awaited<ReturnType<typeof checkThetaImports>> & {
    readonly patchedSystemTemplate?: SystemTemplate;
  };
  const diagnostics = [...doc.diagnostics, ...check.diagnostics];
  return {
    errorCodes: diagnostics
      .filter((d: Diagnostic) => d.severity === "error")
      .map((d: Diagnostic) => d.code),
    materialised: check.imports.map((m) => `${m.kind} ${m.name}`),
    effectiveTemplate: check.patchedSystemTemplate ?? (doc.frontmatter as ParsedFrontmatter).system!,
    patchedSystemTemplateDefined: check.patchedSystemTemplate !== undefined,
  };
}

/** The error-severity parse codes a single prober source draws (probers carry no imports). */
function probeErrorCodes(text: string, path: string): readonly string[] {
  return parseThetaDocument({ path, bytes: new TextEncoder().encode(text) }, parseDeps())
    .diagnostics.filter((d: Diagnostic) => d.severity === "error")
    .map((d: Diagnostic) => d.code);
}

describe("H9a live — bug 0445 imported `array<Import>` element `system:` interpolation renders wire keys through the real `pi -p`", () => {
  it("renders each imported array element's wire keys into the spawned child's system prompt and drives", async () => {
    const host = await resolveAcceptanceHost();
    const child = CHILD_TEMPLATE.replace("<BIND_MODEL>", `${host.provider}/${host.model}`);

    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): under the fix the child registers with NO error, the
    // load-phase static-container carry fired (`patchedSystemTemplate` present),
    // and the effective template renders the imported WIRE keys (`"FirstName"`,
    // `"Weight"`) for the marshalled array. At the fork the array renders
    // theta-side keys (offline witness b0445 W1), so a green live 630 can only
    // come from this fix — no unrelated failure produces it.
    const row = await measureChildLoad(child);
    expect(
      row.materialised,
      "attribution: the imported `Author` schema must resolve or the load pass carries no rename map",
    ).toContain("schema Author");
    expect(
      row.errorCodes,
      "attribution: under the fix the `array<Author>`-`system:` child registers with no error",
    ).toEqual([]);
    expect(
      row.patchedSystemTemplateDefined,
      "attribution: the load-phase array-face static-container carry fired (patchedSystemTemplate present), so a green live 630 can only be the wire render",
    ).toBe(true);
    const rendered = renderSystemPrompt({
      template: row.effectiveTemplate,
      params: { authors: MARSHALLED_AUTHORS },
    });
    expect(
      rendered.ok && rendered.text.startsWith(EXPECTED_WIRE_RENDER),
      "attribution: the array-face carry renders the imported wire keys `FirstName`/`Weight` for the marshalled array; " +
        `the fork renders theta-side keys (b0445 W1). rendered: ${rendered.ok ? rendered.text : "<err>"}`,
    ).toBe(true);
    expect(
      probeErrorCodes(PROBE, `${PROJ_DIR}/b0445probe.theta`),
      "attribution: the prober (schema-constructed, type-annotated invoke argument) parses clean",
    ).toEqual([]);

    // Live-host precondition — fails loudly naming the unmet precondition; never
    // a skip or early return.
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver returned an empty model id.",
      );
    }

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0445-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0445-cwd-"));
    try {
      writeFileSync(join(thetaDir, "types.thetalib"), TYPES_LIB, "utf8");
      writeFileSync(join(thetaDir, "b0445childwire.theta"), child, "utf8");
      writeFileSync(join(thetaDir, "b0445probe.theta"), PROBE, "utf8");

      const probe = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0445probe",
        cwd: probeCwd,
      });
      expect(
        probe.exitCode,
        `probe: expected a no-error exit (0), got ${String(probe.exitCode)}. stderr: ${probe.stderr}`,
      ).toBe(0);
      expect(
        probe.stdout,
        `probe: the imported \`array<Author>\`-\`system:\` child must render each element's WIRE key ` +
          `\`"Weight"\` at the spawn boundary, so it sums 10 + 20 = 30, returns 500 + 30 = 530, and ` +
          `the prober computes 530 + 100 = ${WIRE_OK}. The fork's theta-side render exposes no ` +
          `\`"Weight"\` key → child adds 0 → returns 500 → the prober answers ${NEUTRALISED_ANSWER}. ` +
          `stdout: ${probe.stdout} stderr: ${probe.stderr}`,
      ).toContain(WIRE_OK);
    } finally {
      rmSync(thetaDir, { recursive: true, force: true });
      rmSync(probeCwd, { recursive: true, force: true });
    }
  });
});
