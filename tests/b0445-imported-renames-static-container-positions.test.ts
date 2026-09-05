import { describe, expect, it } from "vitest";
import { parseThetaDocument, type ThetaDocument } from "../src/parser/theta-document";
import { checkThetaImports } from "../src/extension/import-static-checks";
import { renderSystemPrompt, type SystemTemplate } from "../src/parser/system-interpolation";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import type { FileSystem } from "../src/seams/file-system";
import type { ThetaValue } from "../src/runtime/value";
import { parseDeps } from "./helpers/e2e-s1";

// Witness tests for bug 0445
// (docs/bugs/0445-imported-renames-static-container-positions.md).
//
// Bug 0423 (fixed 0.436.0) built the load pass that, for every directly-imported
// schema a `params:` names, materialises the import's full sidecar-bearing shape
// (`importedSchemaShapes`) and PATCHES the template so a bare `${author}` typed
// by the import renders WIRE names. It consumed that map at EXACTLY one position:
// the bare root object terminal. This bug is the two STATIC container positions
// beside it, whose spec translation clauses are unconditional:
//   - query-escapes-stringification.md:26 — the `array<T>` row renders "with
//     wire-name translation applied recursively";
//   - query-escapes-stringification.md:27 — the Schema-typed-object row renders
//     "with wire-name translation applied recursively";
//   - query-escapes-stringification.md:36 — "the theta-side names an author
//     writes never appear in the rendered prompt".
// Neither clause qualifies by where the schema is declared, so factoring `Author`
// into a `.thetalib` (the refactor the format exists for) must not flip the bytes.
//
// TWO FACES, both RED at the fork:
//
//   ARRAY FACE (W1) — a param `authors: 'array<Author>'` over the imported
//   `Author`. At parse, `namedSchemaOf(element, bodyTypes.schemas)`
//   (src/parser/frontmatter.ts:1186–1190) is `undefined` for an imported element
//   (imports are a name-only set in `FrontmatterBodyTypes`), so the part is a
//   STATIC `{kind:"array"}` with no sidecars. At load, the bug-0423 patch skips
//   it twice: the `part.valueDriven !== true` guard
//   (src/extension/import-static-checks.ts:1294) excludes the static array part,
//   and the `importedSchemaShapes.get(typeSource.trim())` lookup (:1302) needs
//   the param type source to BE the import name verbatim, but it is
//   `array<Author>`. So every element serialises theta-side.
//
//   NESTED FACE (W2) — a BODY schema `schema Wrap { author: Author, tag as
//   "Tag": string }` wraps the import; a param `p: Wrap` takes the STATIC
//   Schema-typed-object row. This is the TWO-FACES cell: the wrapper's OWN
//   rename `tag→Tag` translates (parse-time body-schema sidecars, the b0424
//   class), but the field `author` typed by the imported name drops its
//   `refTarget` at parse (src/parser/frontmatter.ts:915–933 records no hop for
//   an imported-typed field), so the runtime walk finds no target
//   (src/render/query-render.ts:415–430) and the nested imported record keeps
//   theta-side names — two spellings in one prompt.
//
// Both faces reach the wire form only under bug 0445 §Fix option (a) (SETTLED):
// widen the load-phase patch to consume `importedSchemaShapes` at the
// `array<Imp>` static part and to merge the import's sidecar fragment into the
// enclosing body schema's map (adding the missing `refTarget`), in the SAME load
// pass — the has-rename gate mirrored from the bare-root patch so rename-free
// imports stay byte-identical.
//
// HOW THE HARNESS REACHES THE EFFECTIVE TEMPLATE (mirrors b0423). The fix does
// NOT mutate the readonly parsed `frontmatter.system`; `checkThetaImports`
// RETURNS the load-phase-patched template on `patchedSystemTemplate?:
// SystemTemplate`, and production-composition threads it onto the composed
// frontmatter the spawn site renders. This harness calls `checkThetaImports`
// DIRECTLY, so each render cell computes the effective template exactly as
// production-composition will:
//   const effectiveTemplate = check.patchedSystemTemplate ?? doc.frontmatter.system
// and renders over that. At the fork the two faces carry no patch (bug 0445:
// "patchedSystemTemplate absent"), so `?? fallback` yields the unpatched app
// template and the render emits theta-side bytes — the RED for the SYMPTOM
// (`first_name` reaching the prompt). Post-fix the returned patched template
// carries the imported sidecars at these positions and the assertions go green
// with no harness change.
//
// CONTROLS. W3 is the bug-0423 W1 class (bare `author: Author`): already fixed at
// this HEAD (post-0.436.0), so it is GREEN before AND after and its
// `patchedSystemTemplate` is DEFINED (the bare-root patch still fires). W4 is a
// rename-FREE import (`array<Plain>`, theta=wire): GREEN both, byte-identical,
// and its `patchedSystemTemplate` is UNDEFINED — byte-identity by ABSENCE of a
// patch (the b0423 W2 discipline: rename-free → the has-rename gate leaves it
// unpatched, so a no-op patch cannot mask a regression).
//
// TIER — unit, offline, deterministic, provider-free. The whole contract settles
// inside one `parseThetaDocument` over a string, one `checkThetaImports` over an
// in-memory `FileSystem` double, and one `renderSystemPrompt` — the exact load +
// render seams production runs before any turn (the b0422/b0423 LOAD-path
// pattern). An integration tier would re-drive discovery to reach a decision the
// load pass has already made; a live tier would add a provider/child to a
// rendering no model participates in.
//
// NO SILENT SKIPPING: the fake `readBytes`/`readdir` REJECT any unregistered
// path, every render cell asserts the imported schema materialised AND the
// `system:` template is present as preconditions (so a resolution/parse
// regression reds as an unmet precondition, not as this defect), and no cell
// early-returns. The bug doc's version token was a literal placeholder the
// lane parent filled with the real fixed version at merge.

/**
 * Forward view of `checkThetaImports`'s return over the bug-0423 fix surface: the
 * load-phase-patched template returned on `patchedSystemTemplate?`. The field is
 * present at this HEAD (0423 shipped it), but this view keeps the read type-safe
 * and documents which cells expect it defined vs absent under bug 0445.
 */
type CheckWithPatch = Awaited<ReturnType<typeof checkThetaImports>> & {
  readonly patchedSystemTemplate?: SystemTemplate;
};

const TYPES_LIB_PATH = "/proj/types.thetalib";

/**
 * The imported `.thetalib`. `Author` carries a WIRE rename
 * (`first_name as "FirstName"`: theta-side `first_name`, wire `FirstName`);
 * `Plain` is rename-free (theta=wire), the byte-identity control's second lib
 * schema. `Inner` (wire `a→A`) is a lib-INTERNAL schema referenced by two
 * container roots: `Nested` (root rename `first_name→FirstName`, W5's collision
 * root) and `Cfg` (root rename-free, W6's transitive-only-rename root). Fields
 * are comma-separated — a newline-only `.thetalib` schema body draws
 * `theta/parse/unsupported-feature`.
 */
const LIB = [
  "schema Author {",
  '  first_name as "FirstName": string,',
  "  role: string,",
  "}",
  "",
  "schema Plain {",
  "  name: string,",
  "  role: string,",
  "}",
  "",
  "schema Inner {",
  '  a as "A": string,',
  "}",
  "",
  "schema Nested {",
  "  inner: Inner,",
  '  first_name as "FirstName": string,',
  "}",
  "",
  "schema Cfg {",
  "  inner: Inner,",
  "  name: string,",
  "}",
  "",
].join("\n");

/**
 * The importing subagent theta, parameterised over its `system:` template, its
 * param, the imported symbol, and an optional BODY schema (the nested face's
 * `schema Wrap { author: Author, ... }`). `typeName` is inserted verbatim into
 * the `params:` line, so array params pass a quoted `'array<Author>'`.
 */
function appSource(opts: {
  readonly system: string;
  readonly paramName: string;
  readonly typeName: string;
  readonly importName: string;
  readonly bodySchema?: readonly string[];
}): string {
  return [
    "---",
    "mode: subagent",
    `system: '${opts.system}'`,
    "params:",
    `  ${opts.paramName}: ${opts.typeName}`,
    "---",
    `import { ${opts.importName} } from "./types.thetalib"`,
    ...(opts.bodySchema ?? []),
    "let x = 1",
    "",
  ].join("\n");
}

/**
 * An in-memory `FileSystem` serving only the registered `.thetalib` fixture —
 * every other member REJECTS, so a resolution that reads off-fixture reds
 * loudly rather than resolving an empty buffer (the b0422/b0423
 * `fakeThetaLibFs`).
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
 * unpatched fallback template), the raw `checkThetaImports` result (carrying
 * `patchedSystemTemplate?`), and derived diagnostics / materialised imports. A
 * render cell computes the effective template as
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
 * as `input.frontmatter`. The pass RETURNS the patched template on
 * `check.patchedSystemTemplate` (it does NOT mutate the readonly
 * `frontmatter.system`); the effective template the spawn site renders is
 * `check.patchedSystemTemplate ?? doc.frontmatter.system`, computed at each
 * render cell exactly as production-composition threads it.
 */
async function measureLoad(opts: {
  readonly system: string;
  readonly paramName: string;
  readonly typeName: string;
  readonly importName: string;
  readonly bodySchema?: readonly string[];
}): Promise<LoadRow> {
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
    fs: fakeThetaLibFs({ [TYPES_LIB_PATH]: LIB }),
    parseDeps: parseDeps(),
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
 * materialises, no error diagnostic aborts the load, and the `system:` template
 * is present. Asserted BEFORE the render so a resolution/parse regression reds as
 * an unmet precondition, not as this defect (the b0422/b0423
 * `expectSchemaMaterialised` discipline). Returns the fallback (unpatched)
 * template; the render cell applies `check.patchedSystemTemplate ?? template`.
 */
function templateAfterLoad(
  row: LoadRow,
  schema: string,
  label: string,
): NonNullable<ThetaDocument["frontmatter"]>["system"] {
  expect(
    row.materialised,
    `${label}: the imported schema must resolve and materialise or the load pass carries no rename map`,
  ).toContain(`schema ${schema}`);
  expect(
    row.errorCodes,
    `${label}: the load must be clean, or a render red would be an unrelated load error, not this defect`,
  ).toEqual([]);
  const template = row.doc.frontmatter?.system;
  expect(
    template,
    `${label}: the "system:" template must be present for the spawn site to render`,
  ).toBeDefined();
  return template;
}

describe("bug 0445 — imported renames drop at static array / nested-body container positions", () => {
  // W1 — ARRAY FACE, the RED. A param `authors: 'array<Author>'` over the
  // imported `Author` must apply the wire rename recursively inside each element
  // (query-escapes-stringification.md:26). RED at the fork: the STATIC array part
  // carries no sidecars (imports invisible at parse) and the bug-0423 patch skips
  // static, non-value-driven parts, so elements serialise theta-side —
  // `R: [{"first_name":"Ada","role":"dev"}]`.
  it("W1 RED (array face): array<Author> applies the imported wire rename inside each element", async () => {
    const row = await measureLoad({
      system: "R: ${authors}",
      paramName: "authors",
      typeName: "'array<Author>'",
      importName: "Author",
    });
    const template = templateAfterLoad(row, "Author", "W1");
    // WHY: mirror production-composition threading the load-phase-patched template
    // onto the composed frontmatter the spawn site renders.
    const effectiveTemplate = row.check.patchedSystemTemplate ?? template;
    const r = renderSystemPrompt({
      template: effectiveTemplate!,
      params: { authors: [{ first_name: "Ada", role: "dev" }] as unknown as ThetaValue },
    });
    expect(
      r.ok && r.text,
      "an imported schema's wire rename must be applied recursively inside array<Author> (QRY-18, the array<T> row), as the body-declared array<T> class already is",
    ).toBe('R: [{"FirstName":"Ada","role":"dev"}]');
  });

  // W2 — NESTED FACE, the RED (two-faces). A body `schema Wrap { author: Author,
  // tag as "Tag": string }`, param `p: Wrap`, takes the STATIC Schema-typed-object
  // row. Both the wrapper's OWN rename `tag→Tag` AND the imported field's
  // `first_name→FirstName` must apply (query-escapes-stringification.md:27, :36).
  // RED at the fork: `tag→Tag` applies (parse-time body sidecars) but the imported
  // field drops its refTarget, so one prompt carries two spellings —
  // `R: {"author":{"first_name":"Ada","role":"dev"},"Tag":"t"}`.
  it("W2 RED (nested face, two-faces): Wrap translates its own `tag→Tag` AND the imported `first_name→FirstName`", async () => {
    const row = await measureLoad({
      system: "R: ${p}",
      paramName: "p",
      typeName: "Wrap",
      importName: "Author",
      bodySchema: ["schema Wrap {", "  author: Author,", '  tag as "Tag": string', "}"],
    });
    const template = templateAfterLoad(row, "Author", "W2");
    const effectiveTemplate = row.check.patchedSystemTemplate ?? template;
    const r = renderSystemPrompt({
      template: effectiveTemplate!,
      params: {
        p: { author: { first_name: "Ada", role: "dev" }, tag: "t" } as unknown as ThetaValue,
      },
    });
    expect(
      r.ok && r.text,
      "a body schema wrapping an import must translate BOTH its own rename and the imported field's rename in one prompt (QRY-18, the Schema-typed-object row)",
    ).toBe('R: {"author":{"FirstName":"Ada","role":"dev"},"Tag":"t"}');
  });

  // W3 — CONTROL, green before AND after. The bug-0423 W1 class: a bare
  // `author: Author` over the imported schema. Already fixed at this HEAD
  // (post-0.436.0), so the bare-root patch fires — `patchedSystemTemplate` is
  // DEFINED and the render carries wire names. The bug 0445 fix must not regress
  // it.
  it("W3 CONTROL: bare `author: Author` renders WIRE names and IS patched (b0423 W1 class, stays green)", async () => {
    const row = await measureLoad({
      system: "R: ${author}",
      paramName: "author",
      typeName: "Author",
      importName: "Author",
    });
    const template = templateAfterLoad(row, "Author", "W3");
    expect(
      row.check.patchedSystemTemplate,
      "the bare-root imported patch (bug 0423) must still fire at this position",
    ).toBeDefined();
    const effectiveTemplate = row.check.patchedSystemTemplate ?? template;
    const r = renderSystemPrompt({
      template: effectiveTemplate!,
      params: { author: { first_name: "Ada", role: "dev" } as unknown as ThetaValue },
    });
    expect(
      r.ok && r.text,
      "the bare imported render must keep wire names (bug 0423 fix preserved)",
    ).toBe('R: {"FirstName":"Ada","role":"dev"}');
  });

  // W4 — CONTROL, green before AND after. A rename-FREE import `array<Plain>`
  // (theta=wire). The bytes must be byte-identical before and after the fix, and
  // the has-rename gate leaves it UNPATCHED — `patchedSystemTemplate` is
  // UNDEFINED, so byte-identity holds by ABSENCE of a patch, not by a no-op patch
  // masking a regression (the b0423 W2 discipline). This must hold at BOTH the
  // fork (static array never patched) and post-fix (rename-free → gate declines).
  it("W4 CONTROL: rename-free array<Plain> is NOT patched and renders byte-identical compact JSON", async () => {
    const row = await measureLoad({
      system: "R: ${authors}",
      paramName: "authors",
      typeName: "'array<Plain>'",
      importName: "Plain",
    });
    const template = templateAfterLoad(row, "Plain", "W4");
    expect(
      row.check.patchedSystemTemplate,
      "a rename-free imported schema carries no wire rename, so the has-rename gate leaves it UNPATCHED (byte-identity by absence)",
    ).toBeUndefined();
    const effectiveTemplate = row.check.patchedSystemTemplate ?? template;
    const r = renderSystemPrompt({
      template: effectiveTemplate!,
      params: { authors: [{ name: "Ada", role: "dev" }] as unknown as ThetaValue },
    });
    expect(
      r.ok && r.text,
      "a rename-free imported schema must render identical bytes before and after the fix",
    ).toBe('R: [{"name":"Ada","role":"dev"}]');
  });

  // W5 — COLLISION forces theta-side, NEVER a wrong wire name (F1). The imported
  // `Nested` carries an INTERNAL ref to the lib's `Inner` (`a→A`); the app also
  // declares a same-named `schema Inner { a as "AppA" }` and wraps both in
  // `schema Wrap { author: Nested, mine: Inner, tag as "Tag" }`. A flat
  // per-`$defs` map cannot host two `Inner` namespaces at once: if the load
  // patch merged `Nested`'s fragment (lib `Inner`: a→A) into `Wrap`'s map —
  // which already holds the app `Inner` (a→AppA) — `Nested`'s internal `$ref`
  // would resolve into the APP namespace and render `author.inner` as the WRONG
  // wire name `AppA`. So on a def-name collision the import-typed field declines
  // to translate and renders theta-side (never a wrong wire name; a recorded
  // residual). `mine` still uses the app's own `AppA` (parse-time body sidecar,
  // b0424 class) and `tag→Tag` still applies (Wrap's own rename), so the
  // collision is confined to the import-typed `author` field.
  it("W5 (collision → theta-side): a def-name clash keeps the import-typed field theta-side, never a wrong wire name", async () => {
    const row = await measureLoad({
      system: "R: ${p}",
      paramName: "p",
      typeName: "Wrap",
      importName: "Nested",
      bodySchema: [
        "schema Wrap {",
        "  author: Nested,",
        "  mine: Inner,",
        '  tag as "Tag": string',
        "}",
        "schema Inner {",
        '  a as "AppA": string',
        "}",
      ],
    });
    const template = templateAfterLoad(row, "Nested", "W5");
    const effectiveTemplate = row.check.patchedSystemTemplate ?? template;
    const r = renderSystemPrompt({
      template: effectiveTemplate!,
      params: {
        p: {
          author: { inner: { a: "x" }, first_name: "Ada" },
          mine: { a: "y" },
          tag: "t",
        } as unknown as ThetaValue,
      },
    });
    expect(r.ok, "W5: the render must succeed").toBe(true);
    const text = r.ok ? r.text : "";
    // KEY assertion: the collision keeps `author` theta-side, so the lib's `A`
    // wire name never reaches the `author` object (a wrong wire name would be a
    // resolved-into-the-app-namespace `AppA`, or the lib `A` re-derived wrongly).
    expect(
      text.includes('"author":{"inner":{"a":"x"},"first_name":"Ada"}'),
      "the import-typed field must render theta-side on a def-name collision (never a wrong wire name)",
    ).toBe(true);
    expect(
      text,
      "the collision confines to `author`; `mine` uses the app's own AppA and Wrap's tag→Tag still applies",
    ).toBe('R: {"author":{"inner":{"a":"x"},"first_name":"Ada"},"mine":{"AppA":"y"},"Tag":"t"}');
  });

  // W6 — TRANSITIVE-ONLY import stays unpatched, bare/container consistent (F2).
  // `Cfg`'s OWN root is rename-free (`inner`, `name` — no `as`); only its nested
  // `Inner` carries a rename. The has-rename gate is ROOT-DEF-ONLY — the SAME
  // condition the sibling bug-0423 bare-root patch uses — so a transitive-only-
  // renamed import is left unpatched at the `array<Cfg>` container position, and
  // `patchedSystemTemplate` is absent. This matches exactly what the bare `${p}`
  // position (0423, root-only) would render for the same import: theta-side at
  // every position, no bare-vs-container split. The transitive-only-rename is a
  // shared residual with 0423, not a new inconsistency.
  it("W6 (transitive-only import, root-only gate): array<Cfg> is NOT patched and renders bare/container-consistent theta-side", async () => {
    const row = await measureLoad({
      system: "R: ${authors}",
      paramName: "authors",
      typeName: "'array<Cfg>'",
      importName: "Cfg",
    });
    const template = templateAfterLoad(row, "Cfg", "W6");
    expect(
      row.check.patchedSystemTemplate,
      "a transitive-only-renamed import (root rename-free) is left unpatched by the root-only gate, matching the bare position",
    ).toBeUndefined();
    const effectiveTemplate = row.check.patchedSystemTemplate ?? template;
    const r = renderSystemPrompt({
      template: effectiveTemplate!,
      params: { authors: [{ inner: { a: "x" }, name: "n" }] as unknown as ThetaValue },
    });
    expect(
      r.ok && r.text,
      "the root-only gate keeps every position theta-side for a transitive-only-renamed import (no bare-vs-container split)",
    ).toBe('R: [{"inner":{"a":"x"},"name":"n"}]');
  });
});
