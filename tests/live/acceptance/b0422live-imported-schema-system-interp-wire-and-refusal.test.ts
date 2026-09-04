// H9a live acceptance — bugs 0422 / 0423: the imported-`.thetalib`-schema
// `system:` family, proved END-TO-END through the real `pi -p` binary for a
// REAL `.thetalib` import. Two directions, one `it` each:
//
//   DIRECTION 1 (0423 — bare-render wire names): a subagent child whose
//   `system:` reads the BARE imported-schema object `${cfg}` must render the
//   schema's WIRE key (`Addend`, from `addend as "Addend"`) into the child's
//   `--system-prompt`, not the theta-side key (`addend`). The child keys its
//   arithmetic off the wire spelling, so a wire render → child adds 277 and the
//   prober answers 877; the theta-side render the fix neutralises → child sees
//   no `Addend` key → adds 0 → prober answers 600.
//
//   DIRECTION 2 (0422 — load refusal): a subagent child whose `system:` walks
//   off the imported schema (`${cfg.typo}`, not a field of the imported `Cfg`)
//   must REFUSE at LOAD with `theta/load/system-interp-bad-field` and therefore
//   never register; the prober's `invoke` of that unregistered callee resolves
//   `Err` → `d = 0` → the prober answers 100.
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESSES DO NOT.
// tests/b0423-imported-schema-bare-render-wire-names.test.ts and
// tests/b0422-imported-schema-field-invisibility-load-refusal.test.ts pin the
// render bytes / the load refusal over the in-process load seams
// (`parseThetaDocument` + `checkThetaImports` + `renderSystemPrompt`) against an
// IN-MEMORY `FileSystem` double. This file spawns the real `pi` binary in print
// mode over its own throwaway discovery root and observes the outcome through
// real extension auto-load, `--theta` discovery, the shipped composition root,
// REAL `.thetalib` import resolution off disk, AND the RFC-0006 subagent
// child-process launch that installs the load-phase-patched (wire-name)
// `system:` template as the child's `--system-prompt` at the spawn boundary —
// the channel an operator actually sees. This is the registration / drive-
// outcome flip the offline witnesses cannot reach.
//
// WHY THE FLIP IS OBSERVED THROUGH `invoke`, NOT A PRINTED DIAGNOSTIC.
// On the shipped `session_start` path load diagnostics route to the
// `theta-system-note` channel, whose renderer output is NOT streamed to
// `pi -p` print-mode text stdout. A literal `invoke(...)` whose callee failed
// its own load checks surfaces at runtime as `Err(InvokeInfraError)`; a `match`
// over that Result turns the refusal into a POSITIVE, deterministic number on
// stdout, so each direction reds by printing the OPPOSITE number, not nothing.
//
// WHY A PROMPT PROBER INVOKING A SUBAGENT, WITH A COMPUTE-FROM-INLINE-VALUE
// DISCRIMINATOR. `system:` is subagent-mode only, so the callee is
// `mode: subagent`; a subagent transcript is private, so its answer is not on
// the outer `pi -p` stdout — a prompt prober `invoke<integer>`s it (the TYPED
// form, so the child's integer crosses the PIC-59 envelope) and computes over
// the returned number. The child's own answer is itself a
// compute-from-inline-value over the interpolated object: its `system:` renders
// the wire key `Addend` ONLY when the imported schema's rename is applied to the
// bare `${cfg}` at the spawn boundary, so it adds 277 to 500 and returns 777 →
// the prober answers 777 + 100 = 877. Every discriminator is an ANSWER to a task
// question, never a verbatim-echo demand (bug 0243 / AGENTS.md).
//
// WHY THE OBJECT ARRIVES SCHEMA-CONSTRUCTED. A bare object literal at an
// `invoke(...)` argument slot is `theta/parse/bare-object-literal`; each prober
// therefore declares its OWN `schema Cfg` (theta-side field names) and passes a
// named `Cfg { ... }` value, admitted structurally against the child's imported
// `Cfg` param. The wire-name render is a load-phase property of the CALLEE's
// imported schema, so the prober's theta-side names do not decide it — only the
// callee's `.thetalib` rename does.
//
// SUBAGENT CHILD PINS (AGENTS.md §"In-process harnesses…need the child pins"):
// the prober's `invoke` launches an RFC-0006 child. The shared harness supplies
// both pins at every spawn: `spawnPiPrint` sets `PI_THETA_SUBAGENT_EXTENSION_PIN`
// to this tree's `extensions/` and carries the parent-pid so the control plane
// authenticates, and the outer process runs `-ne -e <this tree's extensions>` —
// so the child binds exactly the build under test. This cell does NOT
// re-implement them.
//
// SCOPE ISOLATION (bug 0030). This file is deliberately OUTSIDE the nine-area
// H9a manifest: it adds no `FeatureArea`, touches none of the committed fixtures
// under `./fixtures`, and uses its own temp discovery root. It does NOT call
// `assertStderrClean` and does NOT call `assertCodesSubsetOfPermitted`, so it
// needs NO entry in `tests/fixtures/h7a/permitted-codes.json` — the load refusal
// routes to the system-note channel, not to stdout.
//
// Token-bounded: one `pi -p` spawn per `it`, one prober turn plus the invoked
// child's single typed-query turn.

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  failLoudly,
  requireLiveHost,
  resolveAcceptanceHost,
  spawnPiPrint,
} from "./harness";
import { parseThetaDocument, type ThetaDocument } from "../../../src/parser/theta-document";
import { checkThetaImports } from "../../../src/extension/import-static-checks";
import type { ThetaCompositionInput } from "../../../src/extension/theta-composition-producer";
import type { ParsedFrontmatter } from "../../../src/parser/frontmatter";
import type { Diagnostic } from "../../../src/diagnostics/diagnostic";
import type { FileSystem } from "../../../src/seams/file-system";
import { parseDeps } from "../../helpers/e2e-s1";

/** The load-phase sibling code bug 0422 route (a) mints for a walked-off imported field. */
const LOAD_BAD_FIELD_CODE = "theta/load/system-interp-bad-field";

/** The prober temp-root path the offline load double parses the child against. */
const PROJ_DIR = "/proj";
const CFG_LIB_PATH = `${PROJ_DIR}/cfg.thetalib`;

/**
 * The imported `.thetalib` schema. `addend` carries an `as "Addend"` WIRE
 * rename (theta-side `addend`, wire `Addend`); fields are comma-separated (a
 * `.thetalib` newline-only schema body draws `theta/parse/unsupported-feature`).
 */
const CFG_LIB = [
  "schema Cfg {",
  '  addend as "Addend": integer,',
  "  note: string,",
  "}",
  "",
].join("\n");

/**
 * DIRECTION 1 child: a subagent whose `system:` reads the BARE imported object
 * `${cfg}` and keys its arithmetic off the WIRE spelling `Addend`. Under the fix
 * the load-phase sidecar carry renders `{"Addend":277,"note":"seed"}` into the
 * child's `--system-prompt`, so it adds 277 to 500 and returns 777. With the
 * fix neutralised the bare object renders theta-side keys
 * (`{"addend":277,...}`), the child finds no `Addend` key, adds 0, and returns
 * 500. `<BIND_MODEL>` is rewritten to the resolved live host so the params
 * theta's load-time binder-model resolves (the binder is bypassed at runtime on
 * the marshalled invoke path, PIC-60 — this line only clears the load check).
 */
const CHILD_WIRE_TEMPLATE = [
  "---",
  "mode: subagent",
  "bind_model: <BIND_MODEL>",
  "system: 'You are a calculator. Your configuration object is ${cfg}. Read the integer value stored under the key spelled EXACTLY \"Addend\" (capital A) in that configuration object and add it to any number you are given in the request; if there is no key spelled exactly \"Addend\", add 0 instead. Reply with only the single resulting integer.'",
  "params:",
  "  cfg: Cfg",
  "---",
  'import { Cfg } from "./cfg.thetalib"',
  "let n: integer = @`The number is 500. Apply your standing instruction and reply with only the single resulting integer.`?",
  "n",
  "",
].join("\n");

/**
 * DIRECTION 1 prober: prompt-mode; declares its own `schema Cfg` (theta-side
 * names — a bare object literal at the invoke slot is
 * `theta/parse/bare-object-literal`), constructs `Cfg { addend: 277, note:
 * "seed" }`, `invoke<integer>`s the wire child, and computes over the returned
 * integer. Wire render → child returns 777 → prober answers 877; theta-side
 * render → child returns 500 → prober answers 600.
 */
const PROBE_WIRE = [
  "---",
  "mode: prompt",
  "---",
  "schema Cfg { addend: integer, note: string }",
  'let c = Cfg { addend: 277, note: "seed" }',
  'let res = invoke<integer>("./b0422childwire.theta", c)',
  "let d = match res {",
  "  Ok(v) => v,",
  "  Err(e) => 0",
  "}",
  "@`A calculator probe finished with code ${d}. What is ${d} plus 100? Answer with the number only.`",
  "",
].join("\n");

/**
 * DIRECTION 2 child: a subagent whose `system:` walks off the imported schema
 * (`${cfg.typo}` — `typo` is not a field of the imported `Cfg`). Under the fix
 * the LOAD re-walk draws `theta/load/system-interp-bad-field` and the callee
 * does NOT register.
 */
const CHILD_TYPO_TEMPLATE = [
  "---",
  "mode: subagent",
  "bind_model: <BIND_MODEL>",
  "system: 'Your configured addend is ${cfg.typo}. Add it to the number in the request and reply with only the integer.'",
  "params:",
  "  cfg: Cfg",
  "---",
  'import { Cfg } from "./cfg.thetalib"',
  "let n: integer = @`The number is 500. Apply your standing instruction and reply with only the single resulting integer.`?",
  "n",
  "",
].join("\n");

/**
 * DIRECTION 2 prober: same shape as the wire prober but invokes the typo child.
 * A callee that failed its own load checks resolves `Err` → `d = 0` → the prober
 * answers 100.
 */
const PROBE_TYPO = [
  "---",
  "mode: prompt",
  "---",
  "schema Cfg { addend: integer, note: string }",
  'let c = Cfg { addend: 277, note: "seed" }',
  'let res = invoke<integer>("./b0422childtypo.theta", c)',
  "let d = match res {",
  "  Ok(v) => v,",
  "  Err(e) => 0",
  "}",
  "@`A calculator probe finished with code ${d}. What is ${d} plus 100? Answer with the number only.`",
  "",
].join("\n");

/** DIRECTION 1 answers: wire render (777 child + 100 prober) vs neutralised render (500 child + 100 prober). */
const WIRE_OK = "877";
const WIRE_NEUTRALISED = "600";
/** DIRECTION 2 answer: the callee refused at load (d = 0). */
const REFUSED_ANSWER = "100";

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

/** One measured LOAD row for a child: parse + import-check diagnostics, materialised imports, and the load-phase-patched template. */
interface ChildLoadRow {
  readonly errorCodes: readonly string[];
  readonly materialised: readonly string[];
  readonly patchedSystemTemplateDefined: boolean;
}

/**
 * Drive the REAL LOAD path for one child theta (the same seam the b0422/b0423
 * unit tests use): parse `/proj/<stem>.theta`, then run `checkThetaImports` over
 * the in-memory `.thetalib` fixture. The load refusal for a walked-off imported
 * field and the wire-render sidecar carry are both phase=load, so the observable
 * is the UNION of the parse diagnostics and the import-check diagnostics, plus
 * the returned `patchedSystemTemplate` (present iff the wire-render carry fired).
 */
async function measureChildLoad(childText: string, stem: string): Promise<ChildLoadRow> {
  const doc: ThetaDocument = parseThetaDocument(
    { path: `${PROJ_DIR}/${stem}.theta`, bytes: new TextEncoder().encode(childText) },
    parseDeps(),
  );
  const input: ThetaCompositionInput = {
    slashName: stem,
    sourcePath: `${PROJ_DIR}/${stem}.theta`,
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const check = await checkThetaImports(input, {
    fs: fakeThetaLibFs({ [CFG_LIB_PATH]: CFG_LIB }),
    parseDeps: parseDeps(),
  });
  const diagnostics = [...doc.diagnostics, ...check.diagnostics];
  return {
    errorCodes: diagnostics
      .filter((d: Diagnostic) => d.severity === "error")
      .map((d: Diagnostic) => d.code),
    materialised: check.imports.map((m) => `${m.kind} ${m.name}`),
    patchedSystemTemplateDefined: check.patchedSystemTemplate !== undefined,
  };
}

/** The error-severity parse codes a single prober source draws (probers carry no imports). */
function probeErrorCodes(text: string, path: string): readonly string[] {
  return parseThetaDocument({ path, bytes: new TextEncoder().encode(text) }, parseDeps())
    .diagnostics.filter((d: Diagnostic) => d.severity === "error")
    .map((d: Diagnostic) => d.code);
}

describe("H9a live — bugs 0422/0423 imported-schema `system:` wire-render and load-refusal through the real `pi -p`", () => {
  it("DIRECTION 1 (0423): an imported schema's bare `${cfg}` renders WIRE keys into the spawned child's system prompt", async () => {
    const host = await resolveAcceptanceHost();
    const child = CHILD_WIRE_TEMPLATE.replace("<BIND_MODEL>", `${host.provider}/${host.model}`);

    // ATTRIBUTION GUARD (offline, token-free): under the fix the wire child
    // registers with NO error AND the load-phase sidecar carry fired
    // (`patchedSystemTemplate` present), so a green live 877 can only come from
    // the wire render — no unrelated failure produces it. The prober registers
    // clean.
    const wireRow = await measureChildLoad(child, "b0422childwire");
    expect(
      wireRow.materialised,
      "attribution: the imported `Cfg` schema must resolve or the load pass carries no rename map",
    ).toContain("schema Cfg");
    expect(
      wireRow.errorCodes,
      "attribution: under the fix the bare-`${cfg}` wire child registers with no error",
    ).toEqual([]);
    expect(
      wireRow.patchedSystemTemplateDefined,
      "attribution: the load-phase wire-render carry fired (patchedSystemTemplate present), so a green live 877 can only be the wire render",
    ).toBe(true);
    expect(
      probeErrorCodes(PROBE_WIRE, `${PROJ_DIR}/b0422probewire.theta`),
      "attribution: the wire prober (schema-constructed invoke argument) parses clean",
    ).toEqual([]);

    // Live-host precondition — fails loudly naming the unmet precondition; never
    // a skip or early return.
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver returned an empty model id.",
      );
    }

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0422wire-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0422wire-cwd-"));
    try {
      writeFileSync(join(thetaDir, "cfg.thetalib"), CFG_LIB, "utf8");
      writeFileSync(join(thetaDir, "b0422childwire.theta"), child, "utf8");
      writeFileSync(join(thetaDir, "b0422probewire.theta"), PROBE_WIRE, "utf8");

      const probe = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0422probewire",
        cwd: probeCwd,
      });
      expect(
        probe.exitCode,
        `probe: expected a no-error exit (0), got ${String(probe.exitCode)}. stderr: ${probe.stderr}`,
      ).toBe(0);
      expect(
        probe.stdout,
        `probe: the imported schema's bare \`\${cfg}\` must render the WIRE key "Addend" into ` +
          `the child's system prompt, so the child adds 277 to 500 = 777 and the prober computes ` +
          `777 + 100 = ${WIRE_OK}. With the fix neutralised the bare object renders the theta-side ` +
          `key "addend", the child finds no "Addend" key → adds 0 → returns 500 → the prober ` +
          `answers ${WIRE_NEUTRALISED}. stdout: ${probe.stdout} stderr: ${probe.stderr}`,
      ).toContain(WIRE_OK);
    } finally {
      rmSync(thetaDir, { recursive: true, force: true });
      rmSync(probeCwd, { recursive: true, force: true });
    }
  });

  it("DIRECTION 2 (0422): a walked-off imported field un-registers the callee at LOAD, so its `invoke` resolves Err", async () => {
    const host = await resolveAcceptanceHost();
    const child = CHILD_TYPO_TEMPLATE.replace("<BIND_MODEL>", `${host.provider}/${host.model}`);

    // ATTRIBUTION GUARD (offline, token-free): under the fix the typo child
    // draws the load-phase refusal `theta/load/system-interp-bad-field`, so it
    // does NOT register and its `invoke` resolves Err → d = 0 → the prober
    // answers 100. A green live 100 therefore comes from the load refusal, not
    // an unrelated failure. The prober registers clean.
    const typoRow = await measureChildLoad(child, "b0422childtypo");
    expect(
      typoRow.materialised,
      "attribution: the imported `Cfg` schema must resolve so the load pass has a field set to judge",
    ).toContain("schema Cfg");
    expect(
      typoRow.errorCodes,
      "attribution: a walked-off imported field draws the load-phase `system-interp-bad-field` sibling (bug 0422), so the callee does not register",
    ).toContain(LOAD_BAD_FIELD_CODE);
    expect(
      probeErrorCodes(PROBE_TYPO, `${PROJ_DIR}/b0422probetypo.theta`),
      "attribution: the typo prober (schema-constructed invoke argument) parses clean",
    ).toEqual([]);

    // Live-host precondition — fails loudly naming the unmet precondition; never
    // a skip or early return.
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver returned an empty model id.",
      );
    }

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0422typo-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0422typo-cwd-"));
    try {
      writeFileSync(join(thetaDir, "cfg.thetalib"), CFG_LIB, "utf8");
      writeFileSync(join(thetaDir, "b0422childtypo.theta"), child, "utf8");
      writeFileSync(join(thetaDir, "b0422probetypo.theta"), PROBE_TYPO, "utf8");

      const probe = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0422probetypo",
        cwd: probeCwd,
      });
      expect(
        probe.exitCode,
        `probe: expected a no-error exit (0), got ${String(probe.exitCode)}. stderr: ${probe.stderr}`,
      ).toBe(0);
      expect(
        probe.stdout,
        `probe: the walked-off \`\${cfg.typo}\` child must REFUSE at LOAD ` +
          `(${LOAD_BAD_FIELD_CODE}) and never register, so its \`invoke\` resolves Err → d = 0 → ` +
          `the prober answers ${REFUSED_ANSWER}. A child the fix did not refuse would register and ` +
          `drive, printing a different number. stdout: ${probe.stdout} stderr: ${probe.stderr}`,
      ).toContain(REFUSED_ANSWER);
    } finally {
      rmSync(thetaDir, { recursive: true, force: true });
      rmSync(probeCwd, { recursive: true, force: true });
    }
  });
});
