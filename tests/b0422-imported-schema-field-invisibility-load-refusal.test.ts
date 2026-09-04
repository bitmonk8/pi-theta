import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import { parseThetaDocument, type ThetaDocument } from "../src/parser/theta-document";
import { checkThetaImports } from "../src/extension/import-static-checks";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { FileSystem } from "../src/seams/file-system";
import type { RuntimeRoot } from "../src/runtime-root";
import { SYSTEM_NOTE_CHANNEL } from "../src/extension/system-note-channel";
import { makeOk, type ThetaValue } from "../src/runtime/value";
import { fakeExecutableHost, makeFakeJsonChildLauncher } from "./helpers/fake-json-child";
import { parseDeps } from "./helpers/e2e-s1";

// Witness tests for bug 0422
// (docs/bugs/0422-imported-schema-field-invisibility-renders-undefined.md).
//
// An imported `.thetalib` schema's fields are invisible to the synchronous,
// `FileSystem`-free frontmatter parser, so bug 0406 classifies such a `params:`
// name `opaque-object` (src/parser/system-interpolation.ts:397 as of the fix
// commit; :383 at the pre-fix fork this file's header narrates) and admits any
// `.Ident` chain at parse. Two shipped residuals, both zero-diagnostic on a
// document that registers:
//
//   (a) a typo'd field (`${author.typo}`) — precisely the mistake
//       `theta/parse/system-interp-bad-field` (system-interpolation.ts:61)
//       exists to catch — is admitted, resolves to JS `undefined`, and renders
//       the eight bytes `undefined` into the child's `--system-prompt`.
//   (c) a `Result`-valued param value fails `renderSystemPrompt`, and the spawn
//       site's `!ok` arm (production-theta-producer.ts:2244-2246 as of the fix
//       commit; :2242-2245 at the pre-fix fork — an `if (rendered.ok)` with NO
//       `else`) silently drops the WHOLE `system:` prompt (`systemPrompt ?? ""`
//       at :2491 as of the fix commit; :2466 at the pre-fix fork), so the child
//       spawns under the host's built-in default with no observable on any
//       channel.
//
// PARENT ADJUDICATION (binding): route (a) + (c).
//   (a) LOAD-phase template revalidation: after import resolution re-walk the
//       parsed template's opaque-object paths against the now-known imported
//       field sets and REFUSE at LOAD with the newly-minted sibling code
//       `theta/load/system-interp-bad-field` (E, phase=load;
//       docs/spec_topics/diagnostics/code-registry-load.md). Parse behaviour is
//       DELIBERATELY unchanged — opaque-object admit at parse stays — so the
//       refusal is reachable only through the load pass, driven here by
//       `parseThetaDocument` + `checkThetaImports` (import-static-checks.ts:438
//       as of the fix commit; :404 at the pre-fix fork)
//       over an in-memory `FileSystem` double holding a real `.thetalib`
//       fixture. The parent chose exactly this harness, so the fix MUST surface
//       the load diagnostic through this pass's returned diagnostics (the union
//       of the parse and import-check diagnostics below); if the implementer
//       emits it in a layer above `checkThetaImports`, this harness must be
//       extended with it — see the report's coordination note.
//   (c) The spawn site's silent `!ok` swallow becomes a LOUD refusal: a
//       `theta-system-note` (SYSTEM_NOTE_CHANNEL) naming the failed slot AND a
//       refusal via the site's established machinery, NOT a silent fallback to
//       the host default prompt.
//
// The Wn cases assert the specified POST-FIX behaviour and are RED at the fork;
// the control cases assert behaviour the fix must PRESERVE and are GREEN at the
// fork and after.
//
// TIER — unit, offline, deterministic, provider-free. The whole contract
// settles inside one `parseThetaDocument` over a string, one `checkThetaImports`
// over an in-memory `FileSystem` double (the b0303 LOAD-path pattern), and one
// `spawnSubagentConversation` over a fake JSON child launcher (the b0343/b0409
// spawn-capture pattern) — the exact load + spawn seams production runs. An
// integration tier would re-drive discovery to reach a decision the load pass
// has already made; a live tier would add a provider/child to a decision no
// model participates in (every observable here is computed load-side or
// spawn-side, before any turn). The one live-exercised surface — a real
// `.thetalib` typo refusing at load — is the lane's separate live acceptance
// cell.
//
// NO SILENT SKIPPING: the fake `readBytes`/`readdir` REJECT any unregistered
// path, every load cell asserts the schema materialised as a precondition (so a
// resolution regression reds as an unmet precondition, not as this defect), and
// the route-(c) cell asserts the parsed `system:` template is present before it
// drives the spawn. No cell early-returns. `0.435.0` is a literal version
// placeholder — the lane parent fills the real version.

/** The load-phase sibling code minted for route (a) (parent adjudication). */
const LOAD_BAD_FIELD_CODE = "theta/load/system-interp-bad-field";

/**
 * The imported `.thetalib` whose fields are invisible to the FS-free parser.
 * `name` carries an `as` wire rename to mirror the bug doc's W(a1) fixture; the
 * declared field set is `{name, role}`, so `typo` names no field. Schema fields
 * are comma-separated (a `.thetalib` newline-only schema draws
 * `theta/parse/unsupported-feature`).
 */
const TYPES_LIB = [
  "schema Author {",
  '  name as "FullName": string,',
  "  role: string,",
  "}",
  "",
].join("\n");

const TYPES_LIB_PATH = "/proj/types.thetalib";

/**
 * F1 fixture (bug 0422): a lib schema whose `extra` field is typed by the LIB's
 * OWN import (`Deep`). The shape builder leaves `extra` `opaque-object` (the
 * nested lib's fields are not resolved here), so a step off it (`.x`) must be
 * admitted at load, mirroring the parse-phase sibling's `opaque-object` arm.
 */
const NESTED_TYPES_LIB = [
  'import { Deep } from "./deep.thetalib"',
  "schema Author {",
  "  name: string,",
  "  extra: Deep,",
  "}",
  "",
].join("\n");

const DEEP_LIB = ["schema Deep {", "  x: string,", "}", ""].join("\n");

const DEEP_LIB_PATH = "/proj/deep.thetalib";

/**
 * F2 fixture (bug 0422): an imported alias-of-object schema
 * (`schema Author = Inner`). `toSystemParamType` builds a NON-object shell for
 * the head, so the load re-walk must not enter the walk and must leave the
 * head admitted, deferring its classification to bug 0427.
 */
const ALIAS_TYPES_LIB = [
  "schema Inner {",
  "  name: string,",
  "}",
  "",
  "schema Author = Inner",
  "",
].join("\n");

/** The importing subagent theta, parameterised over its `system:` template. */
function appSource(systemTemplate: string): string {
  return [
    "---",
    "mode: subagent",
    `system: '${systemTemplate}'`,
    "params:",
    "  author: Author",
    "---",
    'import { Author } from "./types.thetalib"',
    "let x = 1",
    "",
  ].join("\n");
}

/**
 * An in-memory `FileSystem` serving only the registered `.thetalib` fixtures —
 * every other member REJECTS, so a resolution that reads off-fixture reds
 * loudly rather than resolving an empty buffer (the b0303 `fakeThetaLibFs`).
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

function parseApp(systemTemplate: string): ThetaDocument {
  return parseThetaDocument(
    { path: "/proj/app.theta", bytes: new TextEncoder().encode(appSource(systemTemplate)) },
    parseDeps(),
  );
}

/** One measured LOAD row: the combined parse + import-check diagnostics and the materialised imports. */
interface LoadRow {
  readonly diagnostics: readonly Diagnostic[];
  readonly errorCodes: readonly string[];
  readonly materialised: readonly string[];
}

/**
 * Drive the real LOAD path for one `system:` template: parse `/proj/app.theta`,
 * then run `checkThetaImports` over the fixture `.thetalib`. The load refusal
 * for a walked-off imported field is a phase=load diagnostic, so the observable
 * is the UNION of the parse diagnostics and the import-check diagnostics — the
 * seam the parent adjudication chose (`parseThetaDocument` + `checkThetaImports`).
 */
async function measureLoadWith(
  systemTemplate: string,
  files: Record<string, string>,
): Promise<LoadRow> {
  const app = parseApp(systemTemplate);
  const input: ThetaCompositionInput = {
    slashName: "app",
    sourcePath: "/proj/app.theta",
    frontmatter: app.frontmatter as ParsedFrontmatter,
    body: app.body,
  };
  const check = await checkThetaImports(input, {
    fs: fakeThetaLibFs(files),
    parseDeps: parseDeps(),
  });
  const diagnostics = [...app.diagnostics, ...check.diagnostics];
  return {
    diagnostics,
    errorCodes: diagnostics.filter((d) => d.severity === "error").map((d) => d.code),
    materialised: check.imports.map((m) => `${m.kind} ${m.name}`),
  };
}

/** The shared `{name, role}` `TYPES_LIB` driver (the W(a1)–W(a3) cells). */
function measureLoad(systemTemplate: string): Promise<LoadRow> {
  return measureLoadWith(systemTemplate, { [TYPES_LIB_PATH]: TYPES_LIB });
}

/**
 * Every LOAD cell shares this precondition: the imported schema resolves and
 * materialises. Asserted BEFORE the refusal so an import-resolution regression
 * reds as an unmet precondition, not as this defect (the b0303 `expectCleanLoad`
 * discipline). The `.thetalib` schema's fields are only ever invisible at PARSE
 * — the import walk itself resolves the name cleanly.
 */
function expectSchemaMaterialised(row: LoadRow, label: string): void {
  expect(
    row.materialised,
    `${label}: the imported \`Author\` schema must resolve and materialise or the load pass sees no field set to judge against`,
  ).toContain("schema Author");
}

describe("bug 0422 — imported-schema field invisibility renders `undefined` / drops the prompt", () => {
  // W(a1) — the LOAD refusal (parent route (a)). A walked-off imported field
  // (`typo`, absent from the `.thetalib`'s `{name, role}`) must refuse at LOAD
  // with `theta/load/system-interp-bad-field`, so the theta does NOT register.
  // RED at the fork: opaque-object admits every step at parse, the load pass
  // knows the field set but never revalidates, so the combined pass emits ZERO
  // error diagnostics and the theta registers clean shipping `undefined`.
  it("W(a1) RED: imported-schema walked-off `${author.typo}` refuses at LOAD (theta does not register)", async () => {
    const row = await measureLoad("Hi ${author.typo}");
    expectSchemaMaterialised(row, "W(a1)");
    expect(
      row.errorCodes,
      "a walked-off imported field must draw the load-phase `system-interp-bad-field` sibling (docs/bugs/0422 §Fix route (a))",
    ).toContain(LOAD_BAD_FIELD_CODE);
    expect(
      row.errorCodes.length > 0,
      "an error-severity load diagnostic un-registers the importing theta",
    ).toBe(true);
  });

  // W(a2) — CONTROL, green before AND after. A REAL imported field
  // (`${author.name}`, declared in the `.thetalib`) must never draw the load
  // refusal: the theta registers clean. The fix distinguishes typo from valid,
  // so this stays green.
  it("W(a2) CONTROL: imported-schema real field `${author.name}` registers clean (no error diagnostic)", async () => {
    const row = await measureLoad("Hi ${author.name}");
    expectSchemaMaterialised(row, "W(a2)");
    expect(
      row.errorCodes,
      "a declared imported field is valid at load — no `system-interp-bad-field`",
    ).not.toContain(LOAD_BAD_FIELD_CODE);
    expect(row.errorCodes, "a valid imported-field path registers clean").toEqual([]);
  });

  // W(a3) — CONTROL, green before AND after. A bare `${author}` (no `.Ident`
  // step) is "always allowed" for every declared param
  // (frontmatter-fields-b-and-templates.md:42); the fix must keep it admitted
  // with no diagnostic.
  it("W(a3) CONTROL: imported-schema bare `${author}` stays admitted (no error diagnostic)", async () => {
    const row = await measureLoad("Hi ${author}");
    expectSchemaMaterialised(row, "W(a3)");
    expect(
      row.errorCodes,
      "a bare `${param}` is always allowed — the load walk judges only `.Ident` steps",
    ).not.toContain(LOAD_BAD_FIELD_CODE);
    expect(row.errorCodes, "a bare imported-schema param registers clean").toEqual([]);
  });

  // Route (c) — the spawn-site `!ok` arm must stop silently dropping the whole
  // system prompt. A `Result`-valued param (`makeOk(1)`) on a bare `${author}`
  // opaque-object terminal drives `renderSystemPrompt` to `!ok`
  // (`theta/parse/interpolated-result`); at the fork the spawn site
  // (production-theta-producer.ts:2244-2246 as of the fix commit; :2242-2245 at
  // the pre-fix fork) swallows it — `systemPrompt` stays
  // undefined, the child spawns with `--system-prompt ""` (:2466), and NOTHING
  // lands on the `theta-system-note` channel. POST-FIX: a note naming the failed
  // slot is emitted AND the spawn is refused (no silent host-default launch).
  //
  // The `Result` reaches the render because a bare `${author}` off an imported
  // (opaque-object) param is value-driven: `interpolationTypeOfValue` takes the
  // `result` arm and the render fails — the bug doc's Reproduction row 3.
  // `paramBindings` carries the `Result` directly, so this cell does not depend
  // on the imports-side permissive-`{}` lowering that lets a `Result` argument
  // reach `paramBindings` in production.
  it("route (c) RED: a failing `renderSystemPrompt` at the spawn site emits a note and refuses, not a silent host-default", async () => {
    const app = parseApp("Hi ${author}");
    expect(
      app.frontmatter?.system,
      "route (c) precondition: the `system:` template must parse (a value-driven opaque-object terminal)",
    ).toBeDefined();

    const notes: { readonly customType: string; readonly content: string }[] = [];
    const launcher = makeFakeJsonChildLauncher();
    const deps = createProductionProducerDeps({
      pi: {
        sendMessage: (message: { readonly customType: string; readonly content: string }): void => {
          notes.push(message);
        },
      } as unknown as ExtensionAPI,
      root: {
        checkpoint: { before: (): Promise<void> => Promise.resolve() },
        idSource: {
          newInvocationId: (): string => "inv-1",
          newToolCallId: (): string => "tc-1",
        },
        clock: {
          wallNow: (): number => 0,
          setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
          clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
        },
      } as unknown as RuntimeRoot,
      modelRegistry: {} as unknown as ModelRegistry,
      subagentSpawn: launcher.spawn,
      subagentExecutableHost: fakeExecutableHost(),
      subagentParentEnv: {},
      subagentParentPid: 4242,
    });

    const theta: ThetaCompositionInput = {
      slashName: "app",
      sourcePath: "/proj/app.theta",
      frontmatter: app.frontmatter as ParsedFrontmatter,
      body: app.body,
      callableSet: Object.freeze({ entries: new Map() }),
    } as unknown as ThetaCompositionInput;
    const ctx = {
      model: { id: "claude-test", provider: "anthropic" },
      cwd: "/tmp",
      signal: undefined,
    } as unknown as ExtensionCommandContext;
    const bindInput: ConversationBindInput = {
      theta,
      args: "",
      ctx,
      thetaAbort: new AbortController(),
      // A `Result` bound directly at the param the bare `${author}` renders — the
      // exact value-kind the spawn-site render fails on.
      paramBindings: new Map<string, ThetaValue>([
        ["author", makeOk(1 as unknown as ThetaValue)],
      ]),
    };

    // Capture a refusal as a value rather than letting it escape (the b0303
    // `.then(ok, err)` form — not a broad `catch`). At the fork the spawn
    // resolves silently; post-fix it refuses through the site's machinery.
    let refusal: string | undefined;
    await deps.spawnSubagentConversation(bindInput).then(
      () => {},
      (err: unknown) => {
        refusal = `${(err as Error).name}: ${(err as Error).message}`;
      },
    );

    // Observable 1 — a `theta-system-note` naming the failed slot is emitted.
    // RED at the fork: `notes` is empty (the silent swallow).
    const systemNotes = notes.filter((n) => n.customType === SYSTEM_NOTE_CHANNEL);
    expect(
      systemNotes.length > 0,
      "a failed `system:` render must emit an operator-visible `theta-system-note` (route (c)), never a silent drop",
    ).toBe(true);
    expect(
      systemNotes.some((n) => /system/i.test(n.content)),
      "the emitted note must name the failed `system:` slot",
    ).toBe(true);

    // Observable 2 — the spawn does not silently proceed under the host default.
    // RED at the fork: exactly one child was launched with `--system-prompt ""`.
    const hostDefaultLaunches = launcher.spawns.filter((s) => {
      const idx = s.args.indexOf("--system-prompt");
      return idx >= 0 && idx + 1 < s.args.length && s.args[idx + 1] === "";
    });
    expect(
      hostDefaultLaunches,
      "the spawn must not silently fall back to the host built-in default prompt (`--system-prompt \"\"`) on a failed render",
    ).toHaveLength(0);

    // The refusal path is reached post-fix (a value, not an escape). Kept as a
    // documenting observable — the RED above is carried by observables 1 and 2,
    // which hold whether the fix refuses by throw or by `Err`-value.
    void refusal;
  });

  // W(a4) — CONTROL, GREEN after the fix (RED against the pre-fix over-refusal
  // that treated every non-object intermediate as a walked-off step). The
  // imported `Author.extra` is typed by types.thetalib's OWN import (`Deep`),
  // which the shape builder leaves `opaque-object`; the load re-walk must
  // MIRROR the parse-phase sibling's `opaque-object` arm and ADMIT the
  // remainder (`.x`) rather than refuse it (bug 0422 F1), because the nested
  // lib's fields are not resolved here and cannot be judged. The theta
  // registers clean.
  it("W(a4) CONTROL: nested-import intermediate `${author.extra.x}` admits at load (no error diagnostic)", async () => {
    const row = await measureLoadWith("Hi ${author.extra.x}", {
      [TYPES_LIB_PATH]: NESTED_TYPES_LIB,
      [DEEP_LIB_PATH]: DEEP_LIB,
    });
    expectSchemaMaterialised(row, "W(a4)");
    expect(
      row.errorCodes,
      "a step off an opaque-object intermediate (a nested lib import) must be admitted, mirroring the parse-phase sibling (bug 0422 F1)",
    ).not.toContain(LOAD_BAD_FIELD_CODE);
    expect(row.errorCodes, "a nested-import intermediate path registers clean").toEqual([]);
  });

  // W(a5) — CONTROL, GREEN after the fix (RED against the pre-fix over-refusal).
  // An imported alias-of-object head (`schema Author = Inner`):
  // `toSystemParamType` builds a NON-object shell for the head, so the load
  // re-walk must NOT enter the walk at all and must leave the head admitted,
  // deferring its classification to bug 0427's arm dispatch (bug 0422 F2). The
  // theta registers clean.
  it("W(a5) CONTROL: imported alias-of-object head `${author.name}` admits at load (no error diagnostic)", async () => {
    const row = await measureLoadWith("Hi ${author.name}", {
      [TYPES_LIB_PATH]: ALIAS_TYPES_LIB,
    });
    expectSchemaMaterialised(row, "W(a5)");
    expect(
      row.errorCodes,
      "a non-object head shape (an imported alias-of-object schema) must be left admitted, deferred to bug 0427 (bug 0422 F2)",
    ).not.toContain(LOAD_BAD_FIELD_CODE);
    expect(row.errorCodes, "an imported alias-of-object head registers clean").toEqual([]);
  });
});
