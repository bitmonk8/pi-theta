import { describe, expect, it } from "vitest";
import { parseThetaDocument, type ThetaDocument } from "../src/parser/theta-document";
import { checkThetaImports } from "../src/extension/import-static-checks";
import { renderSystemPrompt, type SystemTemplate } from "../src/parser/system-interpolation";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import type { FileSystem } from "../src/seams/file-system";
import type { ThetaValue } from "../src/runtime/value";
import { parseDeps } from "./helpers/e2e-s1";

// Witness tests for bug 0423
// (docs/bugs/0423-imported-schema-bare-render-theta-side-names.md).
//
// A bare `${author}` over an imported-`.thetalib`-schema `system:` param
// renders the schema's THETA-SIDE field names into the child's system prompt.
// The rename map for an imported schema does not exist at parse — the frontmatter
// parser is synchronous and `FileSystem`-free, so `toSystemParamType` classifies
// the param `opaque-object` (src/parser/frontmatter.ts:1092) with no sidecar
// slot. The render is value-driven (src/parser/system-interpolation.ts:532 takes
// the `part.valueDriven` arm) and the object row serialises unchanged because
// `type.sidecars === undefined` (src/render/query-render.ts:422). QRY-18:34
// ("the theta-side names an author writes never appear in the rendered prompt")
// is violated for the imported-schema class, while the body-declared class the
// bug-0407 fix wired renders wire names — the same value rendering different
// bytes by where its schema is declared.
//
// PARENT ADJUDICATION (binding) — route (a), load-phase sidecar carry: attach
// the imported schema's flat rename map + `rootDef` to the already-parsed
// template's opaque-object parts in the SAME import-resolution pass bug 0422
// route (a) uses (src/extension/import-static-checks.ts:1120 — the LOAD-phase
// `system:` revalidation block; :1144 its guard already iterates
// `input.frontmatter.system.parts`). This is a post-load template PATCH, not a
// re-parse. Scope is ONLY the ROOT/bare `${author}` case (root object terminal):
// nested-object renames are bug 0424, scalar-terminal paths (`${author.name}`)
// render the scalar unchanged. Constraint: a rename-FREE imported schema renders
// BYTE-IDENTICALLY to today.
//
// HOW THE HARNESS REACHES THE PATCHED TEMPLATE (decided surface, binding). The
// fix does NOT mutate the readonly parsed `frontmatter.system` in place. Instead
// `checkThetaImports` RETURNS the load-phase-patched template on a new field of
// `ThetaImportCheck`, `patchedSystemTemplate?: SystemTemplate`, and
// production-composition threads it onto the composed frontmatter — exactly as
// it already threads `importCheck.imports` (production-composition.ts:1210). The
// spawn site then renders that composed `theta.frontmatter.system`
// (production-theta-producer.ts:2234 reads it, :2244 renders it). This harness
// calls `checkThetaImports` DIRECTLY (not through production-composition), so it
// must compute the effective template production-composition will build:
//   const effectiveTemplate = check.patchedSystemTemplate ?? app.frontmatter.system
// and render over that. It drives the real load pass — `parseThetaDocument` then
// `checkThetaImports` over an in-memory `FileSystem` double holding a real
// `./types.thetalib` fixture (the b0422 LOAD-path pattern), passing the PARSED
// `app.frontmatter` straight through as `input.frontmatter`. At the fork
// `patchedSystemTemplate` is absent, so `?? fallback` yields the unpatched app
// template (the parse-only opaque-object value-driven terminal) and the render
// emits theta-side bytes — the RED for the right reason. Post-fix the returned
// `patchedSystemTemplate` is present and carries the sidecars, so the effective
// template renders wire bytes — the assertion goes green without any harness
// change.
//
// The decided `patchedSystemTemplate?` field is not on `ThetaImportCheck` at the
// fork, so each render cell reads it through {@link CheckWithPatch}, a forward
// view of the callee's return type; the read is `undefined` at the fork and the
// real template under the fix.
//
// TIER — unit, offline, deterministic, provider-free. The whole contract
// settles inside one `parseThetaDocument` over a string, one `checkThetaImports`
// over an in-memory `FileSystem` double, and one `renderSystemPrompt` — the
// exact load + render seams production runs before any turn. An integration tier
// would re-drive discovery to reach a decision the load pass has already made; a
// live tier would add a provider/child to a rendering no model participates in.
// The lane's separate live acceptance cell covers the one live-exercised
// surface (a real `.thetalib` rendering wire names end to end).
//
// NO SILENT SKIPPING: the fake `readBytes`/`readdir` REJECT any unregistered
// path, every cell asserts the imported schema materialised AND the `system:`
// template is present as preconditions (so a resolution/parse regression reds as
// an unmet precondition, not as this defect), and no cell early-returns. `0.436.0`
// is a literal version placeholder — the lane parent fills the real version.

/** The load-phase sibling code bug 0422 route (a) minted (a walked-off imported field). */
const LOAD_BAD_FIELD_CODE = "theta/load/system-interp-bad-field";

/**
 * Forward view of `checkThetaImports`'s return over the DECIDED (binding) fix
 * surface: the load-phase-patched template returned on `patchedSystemTemplate?`.
 * The field is not yet on `ThetaImportCheck` at the fork, so the render cells
 * read it through this view — `undefined` at the fork, the real template under
 * the fix — keeping the file tsc-clean either side of the implementation.
 */
type CheckWithPatch = Awaited<ReturnType<typeof checkThetaImports>> & {
  readonly patchedSystemTemplate?: SystemTemplate;
};

const TYPES_LIB_PATH = "/proj/types.thetalib";

/**
 * The imported `.thetalib` with a WIRE rename: `first_name as "FirstName"`. The
 * theta-side name is `first_name`, the wire name `FirstName`. Fields are
 * comma-separated — a newline-only `.thetalib` schema body draws
 * `theta/parse/unsupported-feature`.
 */
const RENAME_LIB = [
  "schema Author {",
  '  first_name as "FirstName": string,',
  "  role: string,",
  "}",
  "",
].join("\n");

/**
 * A rename-FREE imported `.thetalib` schema: theta-side names ARE the wire
 * names, so the render bytes must be identical before and after the fix (the
 * byte-identical constraint).
 */
const PLAIN_LIB = ["schema Plain {", "  name: string,", "  role: string,", "}", ""].join("\n");

/** The importing subagent theta, parameterised over its `system:` template, param, and imported symbol. */
function appSource(opts: {
  readonly system: string;
  readonly paramName: string;
  readonly typeName: string;
  readonly importName: string;
}): string {
  return [
    "---",
    "mode: subagent",
    `system: '${opts.system}'`,
    "params:",
    `  ${opts.paramName}: ${opts.typeName}`,
    "---",
    `import { ${opts.importName} } from "./types.thetalib"`,
    "let x = 1",
    "",
  ].join("\n");
}

/**
 * An in-memory `FileSystem` serving only the registered `.thetalib` fixture —
 * every other member REJECTS, so a resolution that reads off-fixture reds
 * loudly rather than resolving an empty buffer (the b0422 `fakeThetaLibFs`).
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

/**
 * One measured LOAD row: the parsed doc (its `frontmatter.system` is the
 * unpatched fallback template), the raw `checkThetaImports` result (carrying the
 * decided `patchedSystemTemplate?` under the fix), and derived diagnostics /
 * materialised imports. A render cell computes the effective template as
 * `check.patchedSystemTemplate ?? doc.frontmatter.system`.
 */
interface LoadRow {
  readonly doc: ThetaDocument;
  readonly check: CheckWithPatch;
  readonly errorCodes: readonly string[];
  readonly materialised: readonly string[];
}

/**
 * Drive the real LOAD path: parse `/proj/app.theta`, then run `checkThetaImports`
 * over the fixture `.thetalib`, passing the PARSED `frontmatter` straight through
 * as `input.frontmatter`. Per the decided surface the pass RETURNS the patched
 * template on `check.patchedSystemTemplate` (it does NOT mutate the readonly
 * `frontmatter.system` in place); the effective template the spawn site renders
 * is `check.patchedSystemTemplate ?? doc.frontmatter.system`, computed at each
 * render cell exactly as production-composition will thread it.
 */
async function measureLoad(
  opts: {
    readonly system: string;
    readonly paramName: string;
    readonly typeName: string;
    readonly importName: string;
    // Bug 0423 F1: mirror the invoke-callee dispatch's exact
    // `checkThetaImports` call (`calleeFailsOwnStructuralChecksBody` passes
    // `claimDelivery: false`). Absent → the discovered-theta compose default
    // (`true`), the slash-registration path. `claimDelivery` never affects
    // `patchedSystemTemplate` (it gates only the bug-0264 delivery dedup), so
    // both settings prove the same carry — the F1 cell asserts the invoke
    // path reaches it too.
    readonly claimDelivery?: boolean;
  },
  lib: string,
): Promise<LoadRow> {
  const doc = parseThetaDocument(
    { path: "/proj/app.theta", bytes: new TextEncoder().encode(appSource(opts)) },
    parseDeps(),
  );
  const input: ThetaCompositionInput = {
    slashName: "app",
    sourcePath: "/proj/app.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const check = (await checkThetaImports(input, {
    fs: fakeThetaLibFs({ [TYPES_LIB_PATH]: lib }),
    parseDeps: parseDeps(),
    ...(opts.claimDelivery !== undefined ? { claimDelivery: opts.claimDelivery } : {}),
  })) as CheckWithPatch;
  const diagnostics = [...doc.diagnostics, ...check.diagnostics];
  return {
    doc,
    check,
    errorCodes: diagnostics.filter((d) => d.severity === "error").map((d) => d.code),
    materialised: check.imports.map((m) => `${m.kind} ${m.name}`),
  };
}

/**
 * Every render cell shares these preconditions: the imported schema resolves and
 * materialises, and the `system:` template is present. Asserted BEFORE the
 * render so a resolution/parse regression reds as an unmet precondition, not as
 * this defect (the b0422 `expectSchemaMaterialised` discipline). Returns the
 * PATCHED template the spawn site would render.
 */
function templateAfterLoad(row: LoadRow, schema: string, label: string): NonNullable<
  ThetaDocument["frontmatter"]
>["system"] {
  expect(
    row.materialised,
    `${label}: the imported schema must resolve and materialise or the load pass carries no rename map`,
  ).toContain(`schema ${schema}`);
  const template = row.doc.frontmatter?.system;
  expect(
    template,
    `${label}: the "system:" template must be present for the spawn site to render`,
  ).toBeDefined();
  return template;
}

describe("bug 0423 — imported-schema bare `${author}` renders theta-side field names", () => {
  // W1 — the RED. A bare `${author}` over an imported schema with a wire rename
  // (`first_name as "FirstName"`) must render the WIRE name recursively into the
  // child's system prompt, matching the body-declared control bug 0407 W1 pins
  // (`{"FirstName":"Ada","role":"dev"}`). RED at the fork: no sidecar is carried
  // for the imported class, so the value-driven object row serialises the
  // theta-side keys unchanged — `Reviewer: {"first_name":"Ada","role":"dev"}`.
  it("W1 RED: imported-schema bare `${author}` renders WIRE names via the load-phase sidecar carry", async () => {
    const row = await measureLoad(
      { system: "Reviewer: ${author}", paramName: "author", typeName: "Author", importName: "Author" },
      RENAME_LIB,
    );
    const template = templateAfterLoad(row, "Author", "W1");
    // WHY: mirror production-composition threading the load-phase-patched
    // template onto the composed frontmatter (the object the spawn site renders).
    const effectiveTemplate = row.check.patchedSystemTemplate ?? template;
    const r = renderSystemPrompt({
      template: effectiveTemplate!,
      params: { author: { first_name: "Ada", role: "dev" } as unknown as ThetaValue },
    });
    expect(
      r.ok && r.text,
      "an imported schema's wire rename must be applied to a bare `${author}` (QRY-18:34), as the body-declared class already is (b0407 W1)",
    ).toBe('Reviewer: {"FirstName":"Ada","role":"dev"}');
  });

  // W2 — CONTROL, green before AND after. A rename-FREE imported schema's
  // theta-side names ARE its wire names, so the bare-render bytes must be
  // byte-identical before and after the sidecar carry (the fix's own
  // constraint). After the F3/F4 rename-gate a rename-free schema is NOT
  // patched at all, so `patchedSystemTemplate` is ABSENT and the effective
  // template the spawn site renders is the unpatched fallback: byte-identity
  // holds by ABSENCE, not by a no-op patch. The render is over the SAME
  // effective template production composes (`patchedSystemTemplate ??
  // template`) so the control cannot pass by reading a stale raw template.
  it("W2 CONTROL: rename-free imported schema bare `${p}` is not patched and renders byte-identical compact JSON", async () => {
    const row = await measureLoad(
      { system: "${p}", paramName: "p", typeName: "Plain", importName: "Plain" },
      PLAIN_LIB,
    );
    const template = templateAfterLoad(row, "Plain", "W2");
    expect(
      row.check.patchedSystemTemplate,
      "a rename-free imported schema carries no wire rename, so the F3/F4 rename-gate leaves it UNPATCHED (byte-identity by absence)",
    ).toBeUndefined();
    const effectiveTemplate = row.check.patchedSystemTemplate ?? template;
    const r = renderSystemPrompt({
      template: effectiveTemplate!,
      params: { p: { name: "Ada", role: "dev" } as unknown as ThetaValue },
    });
    expect(
      r.ok && r.text,
      "a rename-free imported schema must render identical bytes before and after the sidecar carry",
    ).toBe('{"name":"Ada","role":"dev"}');
  });

  // W3 — CONTROL, green before AND after. Bug 0422's LOAD refusal must survive
  // the sidecar carry: a walked-off `${author.typo}` (absent from the
  // `.thetalib`'s `{first_name, role}`) still draws
  // `theta/load/system-interp-bad-field`, so the theta does not register. The
  // sidecar carry must not weaken 0422's refusal.
  it("W3 CONTROL: walked-off `${author.typo}` still refuses at LOAD (0422 refusal preserved)", async () => {
    const row = await measureLoad(
      { system: "Hi ${author.typo}", paramName: "author", typeName: "Author", importName: "Author" },
      RENAME_LIB,
    );
    expect(
      row.materialised,
      "W3: the imported `Author` schema must resolve so the load pass has a field set to judge",
    ).toContain("schema Author");
    expect(
      row.errorCodes,
      "a walked-off imported field must still draw the load-phase `system-interp-bad-field` sibling (bug 0422)",
    ).toContain(LOAD_BAD_FIELD_CODE);
  });

  // Scalar-terminal CONTROL, green before AND after. `${author.first_name}`
  // terminates on a SCALAR (theta-side field name walked to its value), not the
  // root object, so the fix (root-only) leaves it unchanged: the render emits
  // the VALUE `Ada`, never a wire name. Scalar terminals are unaffected by the
  // sidecar carry.
  it("scalar CONTROL: `${author.first_name}` renders the value `Ada`, not a wire name", async () => {
    const row = await measureLoad(
      {
        system: "Reviewer: ${author.first_name}",
        paramName: "author",
        typeName: "Author",
        importName: "Author",
      },
      RENAME_LIB,
    );
    const template = templateAfterLoad(row, "Author", "scalar");
    expect(
      row.check.patchedSystemTemplate,
      "a scalar-terminal path is not a bare root-object param, so the F3/F4 rename-gate leaves the template UNPATCHED",
    ).toBeUndefined();
    const effectiveTemplate = row.check.patchedSystemTemplate ?? template;
    const r = renderSystemPrompt({
      template: effectiveTemplate!,
      params: { author: { first_name: "Ada", role: "dev" } as unknown as ThetaValue },
    });
    expect(
      r.ok && r.text,
      "a scalar terminal renders the field VALUE unchanged — root-only sidecar carry does not touch it",
    ).toBe("Reviewer: Ada");
  });

  // F1 witness — the INVOKE/`.theta`-callable dispatch path. An invoked
  // subagent callee has its `--system-prompt` rendered by the PARENT from the
  // callee's composed `frontmatter.system` (production-theta-producer.ts spawn
  // site). `parseCalleeTheta`'s dispatch builds that composed frontmatter and
  // now threads the load-phase-patched template surfaced by
  // `calleeFailsOwnStructuralChecksBody`, whose `checkThetaImports` call runs
  // with `claimDelivery: false` — the exact call this cell drives. At the fork
  // that dispatch discarded the patch, so the invoked child's system prompt
  // carried theta-side names; post-fix the composed callee `frontmatter.system`
  // the parent renders carries WIRE names, matching the slash-registered path
  // (W1). `claimDelivery` never alters `patchedSystemTemplate`, so the patched
  // template this cell reads IS the one the invoke dispatch threads.
  it("F1 witness: an invoked subagent callee's composed `system:` renders WIRE names (invoke path)", async () => {
    const row = await measureLoad(
      {
        system: "Reviewer: ${author}",
        paramName: "author",
        typeName: "Author",
        importName: "Author",
        claimDelivery: false,
      },
      RENAME_LIB,
    );
    const template = templateAfterLoad(row, "Author", "F1");
    expect(
      row.check.patchedSystemTemplate,
      "the invoke-dispatch `checkThetaImports` (claimDelivery: false) must surface the patched template `parseCalleeTheta` threads onto the composed callee frontmatter",
    ).toBeDefined();
    // The composed callee `frontmatter.system` the parent renders is exactly
    // this patched template (parseCalleeTheta sets it via a new frontmatter
    // object).
    const composedCalleeSystem = row.check.patchedSystemTemplate ?? template;
    const r = renderSystemPrompt({
      template: composedCalleeSystem!,
      params: { author: { first_name: "Ada", role: "dev" } as unknown as ThetaValue },
    });
    expect(
      r.ok && r.text,
      "an invoked callee's system prompt must carry the imported schema's WIRE names, not theta-side names (QRY-18:34), matching the slash-registered path (W1)",
    ).toBe('Reviewer: {"FirstName":"Ada","role":"dev"}');
  });
});
