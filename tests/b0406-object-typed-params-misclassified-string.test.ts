import { describe, expect, it } from "vitest";
import { parseDoc, parseDeps } from "./helpers/e2e-s1";
import {
  renderSystemPrompt,
  SYSTEM_INTERP_BAD_FIELD_CODE,
  type SystemTemplate,
} from "../src/parser/system-interpolation";
import { parseThetaDocument } from "../src/parser/theta-document";
import { checkThetaImports } from "../src/extension/import-static-checks";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import type { FileSystem } from "../src/seams/file-system";
import type { ThetaValue } from "../src/runtime/value";

// Witness tests for bug 0406
// (docs/bugs/0406-object-typed-params-misclassified-string.md).
//
// `toSystemParamType` collapses three object-valued `params:` spellings — an
// inline object type, an imported `.thetalib` schema name, and a recursive
// schema's self-typed field — to `{ kind: "string" }`. That one wrong kind
// forks into two observables the spec forbids: a `.Ident` step off such a
// param draws a spurious `theta/parse/system-interp-bad-field` (the theta
// fails to register), and a bare `${param}` renders JavaScript's
// `[object Object]` into the child's system prompt instead of the QRY-18
// compact-JSON object row.
//
// Harness: `parseDoc` (real `parseThetaDocument` front-end) + a direct
// `renderSystemPrompt` — the exact call pair the spawn site runs. The render
// input object carries theta-side keys, matching the validated-params boundary.
// The Wn cases assert the specified POST-FIX behaviour and red at the fork; the
// Gn cases assert a refusal the fix must PRESERVE and are green at the fork.

/** Error-severity diagnostic codes from a parsed doc, in source order. */
function errorCodes(doc: ReturnType<typeof parseDoc>): string[] {
  return doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
}

// W7 LOAD-path support (bug 0422 flip). W7 no longer pins the parse-only
// `undefined` render (parse behaviour is unchanged and still admits the typed
// path opaquely): bug 0422 route (a) re-points it at the LOAD outcome, where a
// walked-off imported field draws the phase=load sibling
// `theta/load/system-interp-bad-field` and the theta does not register. Driving
// that needs the import pass over a real `.thetalib` fixture, so W7 alone gains
// the b0303 LOAD-path harness below.

/** The load-phase sibling code bug 0422 route (a) mints. */
const LOAD_SYSTEM_INTERP_BAD_FIELD_CODE = "theta/load/system-interp-bad-field";

/** The imported `.thetalib` W7 resolves: fields `{name, role}`, so `typo` names none. */
const W7_TYPES_LIB = [
  "schema Author {",
  '  name as "FullName": string,',
  "  role: string,",
  "}",
  "",
].join("\n");

/** In-memory `FileSystem` serving only the fixture `.thetalib` (the b0303 double). */
function w7FakeFs(files: Record<string, string>): FileSystem {
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

/** Parse the W7 importing theta, then run the real import pass over the fixture. */
async function w7Load(): Promise<{ errorCodes: string[]; materialised: string[] }> {
  const src = [
    "---",
    "mode: subagent",
    "system: 'Hi ${author.typo}'",
    "params:",
    "  author: Author",
    "---",
    'import { Author } from "./types.thetalib"',
    "let x = 1",
    "",
  ].join("\n");
  const app = parseThetaDocument(
    { path: "/proj/app.theta", bytes: new TextEncoder().encode(src) },
    parseDeps(),
  );
  const input: ThetaCompositionInput = {
    slashName: "app",
    sourcePath: "/proj/app.theta",
    frontmatter: app.frontmatter as ParsedFrontmatter,
    body: app.body,
  };
  const check = await checkThetaImports(input, {
    fs: w7FakeFs({ "/proj/types.thetalib": W7_TYPES_LIB }),
    parseDeps: parseDeps(),
  });
  const diagnostics = [...app.diagnostics, ...check.diagnostics];
  return {
    errorCodes: diagnostics.filter((d) => d.severity === "error").map((d) => d.code),
    materialised: check.imports.map((m) => `${m.kind} ${m.name}`),
  };
}

describe("bug 0406 — object-typed params misclassified as string", () => {
  // W1 — inline object type declares its own fields in `params:`; the `.name`
  // step names one, so the path grammar admits it (Reproduction row 1). Fork:
  // spurious bad-field, no template.
  it("W1: inline-object `${author.name}` is admitted and renders the field", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'Hi \${author.name}'
params:
  author: '{name: string, role: string}'
---
let x = 1`);
    expect(errorCodes(doc), "no spurious bad-field on an admitted inline-object path").toEqual([]);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl, "the theta registers a `system:` template").toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { author: { name: "Ada", role: "dev" } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe("Hi Ada");
  });

  // W2 — the same inline object type in the UNQUOTED YAML flow-map spelling
  // (Reproduction row 2). Same admitted path, same render.
  it("W2: inline-object flow-map (unquoted) `${author.name}` is admitted and renders the field", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'Hi \${author.name}'
params:
  author: {name: string, role: string}
---
let x = 1`);
    expect(errorCodes(doc), "the unquoted flow-map spelling is the same admitted type").toEqual([]);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { author: { name: "Ada", role: "dev" } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe("Hi Ada");
  });

  // W3 — a bare `${author}` off an inline-object param must render the QRY-18
  // object row (compact JSON), never `[object Object]` (Reproduction row 5).
  // The inline object carries no `as` wire renames, so JSON uses its declared
  // theta-side keys.
  it("W3: inline-object bare `${author}` renders compact JSON, not `[object Object]`", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'Hi \${author}'
params:
  author: '{name: string, role: string}'
---
let x = 1`);
    expect(errorCodes(doc)).toEqual([]);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { author: { name: "Ada", role: "dev" } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('Hi {"name":"Ada","role":"dev"}');
  });

  // W4 — an imported `.thetalib` schema name resolves (no
  // `unresolved-named-type`); its `.name` step must be admitted, not refused
  // (Reproduction row 3). Fork: bad-field, no template.
  it("W4: imported-schema `${author.name}` is admitted and renders the walked field", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'Hi \${author.name}'
params:
  author: Author
---
import { Author } from "./types.thetalib"
let x = 1`);
    const codes = errorCodes(doc);
    expect(codes, "no spurious bad-field on an imported-schema path").toEqual([]);
    expect(
      codes.includes("theta/parse/unresolved-named-type"),
      "the imported name resolves — only its fields were invisible",
    ).toBe(false);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { author: { name: "Ada", role: "dev" } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe("Hi Ada");
  });

  // W5 — bug 0423 flip (route (a) LOAD-phase sidecar carry). A bare `${author}`
  // off an imported schema with a wire rename (`name as "FullName"`) must render
  // the WIRE name into the child's system prompt, matching the body-declared
  // class (b0407 W1) — QRY-18:34 does not qualify by where the schema is
  // declared. Parse behaviour is DELIBERATELY unchanged (the imported param is
  // still `opaque-object` at parse, so a parse-only render keeps theta-side
  // names); the fix carries the rename map onto the parsed template during
  // import resolution, so this is driven over the LOAD path — `parseThetaDocument`
  // + `checkThetaImports` over the real `./types.thetalib` fixture (`W7_TYPES_LIB`,
  // `name as "FullName"`). Per the decided (binding) surface the pass RETURNS the
  // patched template on `check.patchedSystemTemplate` (no in-place mutation of the
  // readonly `frontmatter.system`) and production-composition threads it onto the
  // composed frontmatter the spawn renders, so this cell renders the effective
  // template `check.patchedSystemTemplate ?? app.frontmatter.system`. RED at the
  // fork: `patchedSystemTemplate` is absent, so `?? fallback` yields the unpatched
  // template and the value-driven object row serialises the theta-side keys
  // unchanged (`Hi {"name":"Ada","role":"dev"}`).
  it("W5: imported-schema bare `${author}` renders wire names via the LOAD-phase sidecar carry", async () => {
    const src = [
      "---",
      "mode: subagent",
      "system: 'Hi ${author}'",
      "params:",
      "  author: Author",
      "---",
      'import { Author } from "./types.thetalib"',
      "let x = 1",
      "",
    ].join("\n");
    const app = parseThetaDocument(
      { path: "/proj/app.theta", bytes: new TextEncoder().encode(src) },
      parseDeps(),
    );
    const input: ThetaCompositionInput = {
      slashName: "app",
      sourcePath: "/proj/app.theta",
      frontmatter: app.frontmatter as ParsedFrontmatter,
      body: app.body,
    };
    const check = (await checkThetaImports(input, {
      fs: w7FakeFs({ "/proj/types.thetalib": W7_TYPES_LIB }),
      parseDeps: parseDeps(),
    })) as Awaited<ReturnType<typeof checkThetaImports>> & {
      readonly patchedSystemTemplate?: SystemTemplate;
    };
    expect(
      check.imports.map((m) => `${m.kind} ${m.name}`),
      "precondition: the imported `Author` schema resolves and materialises",
    ).toContain("schema Author");
    const tmpl = app.frontmatter?.system;
    expect(tmpl, "the `system:` template must be present for the spawn site to render").toBeDefined();
    // WHY: mirror production-composition threading the load-phase-patched
    // template onto the composed frontmatter (the object the spawn site renders);
    // the decided surface RETURNS it on `check.patchedSystemTemplate` (no in-place
    // mutation), `undefined` at the fork → unpatched fallback → theta-side bytes.
    const effectiveTemplate = check.patchedSystemTemplate ?? tmpl;
    const r = renderSystemPrompt({
      template: effectiveTemplate!,
      params: { author: { name: "Ada", role: "dev" } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('Hi {"FullName":"Ada","role":"dev"}');
  });

  // W6 — a recursive schema is legal and the path grammar has no depth bound,
  // so `${n.child.name}` must be admitted; the recursion-cut must become an
  // object kind that still descends, not `string` (Reproduction row 4).
  it("W6: recursive-schema `${n.child.name}` is admitted and renders the deep field", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'Node \${n.child.name}'
params:
  n: Node
---
schema Node { name: string, child: Node }
let x = 1`);
    expect(errorCodes(doc), "the recursion cut admits the deep path").toEqual([]);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: {
        n: { name: "root", child: { name: "leaf", child: null } } as unknown as ThetaValue,
      },
    });
    expect(r.ok && r.text).toBe("Node leaf");
  });

  // W7 — bug 0422 flip (route (a) LOAD refusal). Parse behaviour is DELIBERATELY
  // unchanged: at parse the imported-schema field step is still admitted
  // opaquely (the parse-only branch below stays true), so the old
  // `renders undefined` residual persists AT PARSE. The flip re-points W7 at the
  // LOAD outcome: after import resolution the now-known `.thetalib` field set
  // `{name, role}` is re-walked, and the walked-off `typo` draws the phase=load
  // sibling `theta/load/system-interp-bad-field` so the theta does NOT register.
  // RED at the fork: the load pass emits zero error diagnostics and the theta
  // registers clean (no load-phase revalidation exists yet).
  it("W7: imported-schema walked-off `${author.typo}` refuses at LOAD (theta does not register)", async () => {
    // Parse is unchanged — the typed path is admitted opaquely, no parse refusal.
    const doc = parseDoc(`---
mode: subagent
system: 'Hi \${author.typo}'
params:
  author: Author
---
import { Author } from "./types.thetalib"
let x = 1`);
    expect(
      errorCodes(doc),
      "parse behaviour is unchanged: an imported-schema field step is admitted opaquely at parse",
    ).toEqual([]);

    // Load re-walks the resolved field set and refuses the walked-off field.
    const load = await w7Load();
    expect(
      load.materialised,
      "precondition: the imported `Author` schema resolves and materialises",
    ).toContain("schema Author");
    expect(
      load.errorCodes,
      "a walked-off imported field must draw the load-phase `system-interp-bad-field` sibling (bug 0422 route (a))",
    ).toContain(LOAD_SYSTEM_INTERP_BAD_FIELD_CODE);
  });

  // --- Constraint guards: refusals the fix must PRESERVE (green at fork) -----

  // G1 — an inline object type carries its real fields, so a genuinely-absent
  // field is still a bad-field refusal (the fix must not admit it). §Fix: "the
  // `bad-field` still firing for genuinely absent fields".
  it("G1 (guard): inline-object genuinely-absent `${author.bogus}` is still refused", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'Hi \${author.bogus}'
params:
  author: '{name: string, role: string}'
---
let x = 1`);
    expect(
      errorCodes(doc).includes(SYSTEM_INTERP_BAD_FIELD_CODE),
      "a genuinely-absent inline-object field stays refused",
    ).toBe(true);
    expect(doc.frontmatter?.system, "a refused path yields no template").toBeUndefined();
  });

  // G2 — the recursive schema's real fields are `name`/`child`; `.child.bogus`
  // names no field of `Node`, so the refusal is preserved.
  it("G2 (guard): recursive genuinely-absent `${n.child.bogus}` is still refused", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'Node \${n.child.bogus}'
params:
  n: Node
---
schema Node { name: string, child: Node }
let x = 1`);
    expect(errorCodes(doc).includes(SYSTEM_INTERP_BAD_FIELD_CODE)).toBe(true);
    expect(doc.frontmatter?.system).toBeUndefined();
  });
});
