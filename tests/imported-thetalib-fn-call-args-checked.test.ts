import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { checkThetaImports } from "../src/extension/import-static-checks";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import type { Block, Expr, Stmt, ThetaDocument } from "../src/parser/theta-document";
import type { FileSystem } from "../src/seams/file-system";
import { parseDeps, parseDoc } from "./helpers/e2e-s1";

// Bug 0138 — an imported-`.thetalib` `fn` call's ARGUMENTS are judged by nothing.
// `checkFnCallArgs` (src/parser/type-layer-checks.ts) resolves the callee in four
// arms and arm 2 — `this.importedSymbols.has(e.callee)` — returns before both the
// arity check (`checkFnCallArity`, src/parser/invoke-diagnostics.ts) and the
// per-argument emission loop (`checkFnArgCompat`, src/parser/type-compat.ts), so
// `rate_strictness(3)` against an imported `fn rate_strictness(a: Author)` loads
// clean while the byte-identical same-file call is refused at `E`. The compose
// pass does not repair it: `checkThetaImports`
// (src/extension/import-static-checks.ts) resolves and parses the `.thetalib`,
// computes its export set and materialises each symbol — the library body is in
// hand — and emits no argument diagnostic
// (docs/bugs/0138-imported-thetalib-fn-arg-route-deferred.md).
//
// Bug 0131's fix (0.199.0) deferred its own arm (3) — imported-`.thetalib` fn
// ARITY — to bug 0138 BY NAME, in the minted *Trigger*s of
// `theta/parse/fn-arity-too-few` / `-too-many` and in its residual 1, so this
// file's subject is argument COUNT together with argument TYPE
// (docs/bugs/0131-in-document-fn-call-arity-unchecked.md §Fix (0.199.0)).
//
// SPEC ANCHORS (the contract, by symbol and section name — the two bug documents'
// own line citations are ~140 minors stale and every symbol below was re-derived
// at this HEAD by name):
//   - Code registry — parse, row `theta/parse/fn-arg-type-mismatch` (Sev E, phase
//     `type`): its *Trigger* is one sentence naming "a same-file or imported
//     `.thetalib` function call", with an exclusion list naming only `invoke(...)`
//     and `.theta`-callable calls. Both halves sit inside one *Trigger*.
//   - Code registry — parse, rows `theta/parse/fn-arity-too-few` /
//     `theta/parse/fn-arity-too-many` (Sev E, phase `type`): their *Trigger*s
//     currently say "An imported `.thetalib` symbol's call site is DEFERRED …
//     wiring one is bug 0138's plumbing". Group (j) is the DIAG-2 cell for that
//     text.
//   - docs/spec_topics/expressions.md §"Identifier resolution": a bare identifier
//     in call position resolves arm (1) local `let` binding or function parameter,
//     arm (2) same-file top-level `fn`, arm (3) "A symbol imported from a
//     `.thetalib` file", arm (4) the callable set. The *Trigger*'s two halves are
//     arms (2) and (3); arm (1) outranks arm (3) (groups (f1) / (f2)).
//   - docs/spec_topics/imports.md §"Visibility": every top-level `schema`, `enum`
//     and `fn` in a `.thetalib` is implicitly exported — which is why the
//     declaring library's declarations are available to the compose pass at all.
//   - docs/spec_topics/type-system.md §"Type compatibility", the *Unresolvable
//     operands* paragraph: a check whose operand is past the parser's static view
//     is SKIPPED, unconditionally on the target's kind. That rule is what licenses
//     every withhold cell in groups (d2), (e) and (f) — and, at HEAD, the whole
//     imported route.
//   - docs/spec_topics/diagnostics/diagnostic-shape.md DIAG-2 (the registry is
//     closed; a *Trigger* change is a spec change landing in the same commit) and
//     DIAG-4 (the *Message* column is normative). No message string is written out
//     in this file: every one is read from the registry through `parseRegistry` /
//     `registryMessage`, the oracle usage
//     tests/import-export-from-clause-required.test.ts establishes.
//   - docs/spec_topics/diagnostics/placeholder-rendering-b.md §"5. Source-derived
//     placeholders": `<name>` is identifier-shaped and taken from the offending
//     source text, so it renders the CALL-SITE spelling — the local binding the
//     author wrote, i.e. the `as` alias where one is written (cell b3).
//   - docs/spec_topics/governance/source-language-stability.md GOV-15, the
//     diagnostic-registry carve-out's ADDITION arm: every fixture in groups (b)
//     and (c) loads cleanly at HEAD and gains an `E`. Group (h) is the corpus
//     bound on that addition.
//
// THE PINNED POST-FIX CONTRACT (the orchestrator's settled disposition of §Fix
// (a)+(b): Reading A, ROUTE 2 — the check runs at the COMPOSE layer, inside/off
// `checkThetaImports`, where the resolved `.thetalib` already exists as a parsed
// `ThetaDocument`, reusing the landed compose-layer argument-type substrate of
// src/extension/invoke-static-checks.ts — `collectProvableArgTypes`,
// `StaticTypeInferencePass`, `collectTypeEnv`, `checkCompatible` — and the
// parser's existing, UNCHANGED emitters `checkFnCallArity` and
// `checkFnArgCompat`). The eleven items this file encodes, one to one with its
// groups:
//   1. PARSE STAYS SILENT on the imported route: the `importedSymbols` arm of
//      `checkFnCallArgs` still returns, so bug 0050's cell `i1` and bug 0131's
//      cell `e-imported-arm3` stay GREEN. Both tiers are pinned here — parse
//      silent (a), compose emitting (b)/(c) — so no future refactor can move the
//      route without redding something. GROUP (a).
//   2. No new code is minted: the three EXISTING rows carry the route —
//      `theta/parse/fn-arg-type-mismatch`, `theta/parse/fn-arity-too-few`,
//      `theta/parse/fn-arity-too-many` — with their *Message*s taken from the
//      registry (DIAG-4). GROUPS (b), (c).
//   3. `<name>` renders the CALL-SITE spelling, so an `as`-alias call renders the
//      alias. CELL b3.
//   4. ARITY BEFORE TYPE, arity row alone: a mis-arity imported call draws the
//      arity row and NOT the per-argument type row, mirroring the same-file
//      discipline in `checkFnCallArgs` / `checkInvokeCall`. CELL c3.
//   5. The EXPECTED side (the parameter's declared type) resolves through a
//      `TypeEnv` built from the DECLARING LIBRARY's statements, never the
//      importing file's (bug 0072's namespace rule): an importer's own unrelated
//      `schema Author { q: string }` does not change the verdict (d1), and a
//      library parameter type that is `named` but UNDECLARED IN THE LIBRARY
//      WITHHOLDS (d2 — bug 0138 row a7's constraint).
//   6. The ARGUMENT side uses `collectProvableArgTypes`' SET discipline
//      (every-member-incompatible) over the IMPORTING file's `TypeEnv` / pass, so
//      an unprovable argument withholds. GROUP (e).
//   7. Further withholds: a callee shadowed by a local `let` binding or a `fn`
//      parameter in the importer (expressions.md arm (1) outranks arm (3)); an
//      imported symbol that is a `schema` / `enum` rather than a `fn`; a library
//      `fn` whose recorded parameter list carries a name no `Ident` derives (bug
//      0131's junk-parameter-table withhold). GROUP (f).
//   8. DEFERRED as a fence: a call site INSIDE a `.thetalib` body against a symbol
//      that library itself imported (bug 0138 row d3) stays SILENT — the check
//      runs over the importing theta's own body only, and the deferral is to be
//      recorded in the fix record and in the registry *Trigger*s. GROUP (g).
//   9. The corpus NON-MOVERS, measured against REAL BYTES, each asserting the
//      (declared, provided) pair and the argument's shape rather than a bare
//      absence, so a corpus edit reds here instead of voiding the claim (the
//      discipline of tests/fn-call-arity-unchecked.test.ts group (i)). GROUP (h).
//  10. A POSITIVE REACHABILITY assertion the bug document owes: the imported
//      route's emitting direction is reachable at all, so a later refactor
//      silently re-deferring the route reds. GROUP (i).
//  11. DIAG-2: the two fn-arity rows' *Trigger* text no longer defers the imported
//      arm to bug 0138, read from the registry page rather than copied. GROUP (j).
//
// TIER — unit, offline, deterministic, provider-free. Every claim settles inside
// one `parseThetaDocument` (through the house driver `parseDoc`,
// tests/helpers/e2e-s1.ts) or one shipped `checkThetaImports` over an in-memory
// `FileSystem` double exposing the `readdir` / `readBytes` members that pass
// reads — the shape tests/import-export-from-clause-required.test.ts establishes.
// The adjudicated host IS `checkThetaImports`, so this tier drives the production
// seam directly; an integration tier would add a discovery round trip to a
// decision the load pass has already made and could not assert an absence more
// sharply, and a live tier would add a provider to an observable no model
// participates in (the bug document's own §Fix: "No live tier applies").
//
// NO SILENT SKIPPING (CLAUDE.md): nothing here early-returns, branches on the
// environment, or skips. A missing registry row, a frontmatter that did not
// parse, a library that did not resolve or materialise, and a fixture whose call
// node cannot be located each FAIL LOUDLY naming the unmet precondition — every
// absence cell is guarded by a precondition proving the fixture actually reached
// the check.

// ===========================================================================
// The three existing rows the route reuses (item 2 — no code is minted).
// ===========================================================================

/** Bug 0050's landed row; its *Trigger* names the imported half already. */
const FN_ARG_TYPE = "theta/parse/fn-arg-type-mismatch";
/** Bug 0131's minted row, arm (3) deferred to this bug by name. */
const TOO_FEW = "theta/parse/fn-arity-too-few";
/** Bug 0131's other minted row, same deferral. */
const TOO_MANY = "theta/parse/fn-arity-too-many";
/** Bug 0225's row — the library-side junk-parameter-table refusal (cell f4). */
const PARAM_NOT_IDENT = "theta/parse/fn-param-not-identifier";

/** The three codes this route may draw, and nothing else. */
const ROUTE_CODES: readonly string[] = [FN_ARG_TYPE, TOO_FEW, TOO_MANY];

// ===========================================================================
// The diagnostic oracle — the registry's *Message* column (DIAG-4).
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

const REGISTRY_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

const REGISTRY_TEXT = readFileSync(
  fileURLToPath(new URL(`../${REGISTRY_PAGE}`, import.meta.url)),
  "utf8",
);

const REGISTRY = parseRegistry(REGISTRY_TEXT) as RegistryRow[];

/** The registry row for `code`, asserted PRESENT before anything is read off it. */
function row(code: string): RegistryRow {
  const found = REGISTRY.find((r) => r.code === code);
  expect(
    found,
    `PRECONDITION (DIAG-2): ${REGISTRY_PAGE} must carry the registered row for ${code}. The registry is closed, so an emission with no row is not assertable; all three rows this route reuses exist at HEAD and none is minted by this fix.`,
  ).toBeDefined();
  return found as RegistryRow;
}

/**
 * `code`'s normative *Message* template with its named placeholders filled.
 *
 * Row presence, then each placeholder's presence, then the substitution — so a
 * reworded template reds by naming the registry rather than by a bare string
 * mismatch, and no message template is ever hand-copied into this file (DIAG-4).
 */
function msg(code: string, fills: ReadonlyArray<readonly [string, string]>): string {
  row(code);
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `PRECONDITION (DIAG-4): ${REGISTRY_PAGE} carries no *Message* column value for ${code}`,
  ).toBeDefined();
  let out = template as string;
  for (const [placeholder, value] of fills) {
    expect(
      out,
      `PRECONDITION (DIAG-4): the ${code} *Message* template must carry the ${placeholder} placeholder; template=${JSON.stringify(template)}`,
    ).toContain(placeholder);
    out = out.replace(placeholder, value);
  }
  return out;
}

/**
 * `fn '<name>' argument <i> ('<param>') type mismatch: expected <expected>, got
 * <actual>` — bug 0050's landed template. `<name>` is the CALL-SITE spelling
 * (item 3); `<expected>` is resolved through the DECLARING library's `TypeEnv`
 * (item 5).
 */
function typeMessage(
  name: string,
  index: number,
  param: string,
  expected: string,
  actual: string,
): string {
  return msg(FN_ARG_TYPE, [
    ["<name>", name],
    ["<i>", String(index)],
    ["<param>", param],
    ["<expected>", expected],
    ["<actual>", actual],
  ]);
}

/**
 * `fn '<name>' passes too few|many arguments: expected <required>, got
 * <provided>` — bug 0131's landed templates. `<required>` is the library `fn`'s
 * DECLARED parameter count (required equals total at a `fn` callee).
 */
function arityMessage(code: string, name: string, required: number, provided: number): string {
  return msg(code, [
    ["<name>", name],
    ["<required>", String(required)],
    ["<provided>", String(provided)],
  ]);
}

// ===========================================================================
// Fixtures. The library bytes are the two shapes the bug document measures:
// `PERSONAS` is the shipped docs/examples/personas.thetalib shape (a `named`
// parameter type declared IN THE LIBRARY — the half needing the declaring file's
// declarations), `PRIM_LIB` the structural half (`number`, needing the signature
// only). Bug-number stems are used only for fixture paths, per the house rule
// that a filename carries no bug number.
// ===========================================================================

const APP_PATH = "/proj/app.theta";
const PERSONAS_PATH = "/proj/b0138lib-personas.thetalib";
const PRIM_PATH = "/proj/b0138lib-prim.thetalib";

/** The importing `.theta`'s frontmatter; body starts on source line 5. */
const FM = ['---', 'model: "sonnet"', "mode: prompt", '---', ""].join("\n");

const PERSONAS = [
  "schema Author {",
  "  name: string,",
  "  role: string,",
  "  experience_years: integer",
  "}",
  "",
  "fn rate_strictness(a: Author): integer { 1 }",
  "",
].join("\n");

const PRIM_LIB = "fn helper(n: number): number { n }\n";

// ===========================================================================
// The in-memory `.thetalib` filesystem double, and the compose driver. Only
// `readdir` / `readBytes` are exercised by `checkThetaImports`; every other
// member REJECTS, so an unexpected call reds instead of silently returning a
// stand-in value.
// ===========================================================================

function fakeThetaLibFs(files: Record<string, string>): FileSystem {
  // Null-prototype for the parent→entries map's key space is unnecessary here
  // (a `Map` is used), but the `files` record is author-keyed and read below
  // with an explicit `=== undefined` test rather than a truthiness test.
  const dirs = new Map<string, string[]>();
  for (const path of Object.keys(files)) {
    const slash = path.lastIndexOf("/");
    const parent = path.slice(0, slash);
    const name = path.slice(slash + 1);
    const entries = dirs.get(parent) ?? [];
    entries.push(name);
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
      const content = Object.prototype.hasOwnProperty.call(files, path)
        ? files[path]
        : undefined;
      return content === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(new TextEncoder().encode(content));
    },
  };
}

interface ComposeResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly materialised: readonly string[];
  readonly rendered: readonly string[];
}

/** Every diagnostic rendered `<severity> <code> <file>: <message>`. */
function render(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map(
    (d) => `${d.severity} ${d.code} ${d.file === undefined ? "-" : d.file}: ${d.message}`,
  );
}

/** Parse an importing `.theta` body under the shared frontmatter. */
function parseApp(body: string, path = APP_PATH): ThetaDocument {
  return parseDoc(FM + body, path);
}

/**
 * Run the shipped load pass over one importing document and one library set.
 *
 * The frontmatter precondition is loud because `checkThetaImports` reads
 * `input.frontmatter`: a fixture whose frontmatter failed to parse would produce
 * an empty diagnostic list that measured nothing.
 */
async function compose(
  doc: ThetaDocument,
  libs: Record<string, string>,
  sourcePath = APP_PATH,
): Promise<ComposeResult> {
  expect(
    doc.frontmatter,
    `PRECONDITION: the importing theta's frontmatter must parse, or the load pass reads nothing. Parse diagnostics: ${JSON.stringify(render(doc.diagnostics))}`,
  ).not.toBeNull();
  const input: ThetaCompositionInput = {
    slashName: "app",
    sourcePath,
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const result = await checkThetaImports(input, {
    fs: fakeThetaLibFs(libs),
    parseDeps: parseDeps(),
  });
  return {
    diagnostics: result.diagnostics,
    materialised: result.imports.map((m) => `${m.kind} ${m.name}`),
    rendered: render(result.diagnostics),
  };
}

/**
 * The anti-vacuity precondition every compose cell runs: the named symbol
 * MATERIALISED, which proves the `.thetalib` path resolved, the library parsed,
 * and its declaration was found — i.e. the fixture reached the point where the
 * resolved library body is in hand, which is exactly where route 2 puts the
 * check. Without it, an absence assertion could be measuring an unresolvable
 * import.
 */
function expectMaterialised(result: ComposeResult, expected: string, cell: string): void {
  expect(
    result.materialised,
    `PRECONDITION (${cell}): the load pass must materialise \`${expected}\` — that is the proof the library resolved, parsed and exported the symbol, so the check route 2 hosts was genuinely reachable on this fixture. Diagnostics: ${JSON.stringify(result.rendered)}`,
  ).toContain(expected);
}

/** The route's three codes present in `result`, in emission order. */
function routeHits(result: ComposeResult): string[] {
  return result.diagnostics.filter((d) => ROUTE_CODES.includes(d.code)).map((d) => d.code);
}

/**
 * A POSITIVE compose cell: the load pass draws exactly one diagnostic, it is
 * `code`, at `error` severity, sited on the IMPORTING file (§Fix (b) route 2:
 * "The diagnostic's `file` must be the *importing* file with the *argument's*
 * range, as the same-file route does"), carrying the registry-sourced message.
 *
 * The whole-list form is deliberate: every positive fixture below draws `[]` at
 * HEAD, so the fix's only licensed addition at each is this one row. The range is
 * asserted PRESENT but not pinned — a `theta/parse/*` row is a located site
 * (diagnostic-shape.md), and whether the site is the argument or the whole call
 * expression is left to the implementation.
 */
function expectOneRouteDiagnostic(
  result: ComposeResult,
  code: string,
  expectedMessage: string,
  why: string,
): void {
  expect(
    result.rendered,
    `${why}\n  EXPECTED exactly one diagnostic: error ${code} sited on ${APP_PATH} carrying the registry *Message* ${JSON.stringify(expectedMessage)}.\n  At HEAD the imported route is judged by nothing at either tier, so this list is empty.\n  ACTUAL: ${JSON.stringify(result.rendered)}`,
  ).toEqual([`error ${code} ${APP_PATH}: ${expectedMessage}`]);
  const hit = result.diagnostics[0] as Diagnostic;
  expect(
    hit.range,
    `${why}: a \`theta/parse/*\` row is a located site (diagnostics/diagnostic-shape.md), so the diagnostic must carry a range in the importing file. Observed: ${JSON.stringify(hit)}`,
  ).toBeDefined();
}

/**
 * A WITHHOLD / silence compose cell: the route's three codes are absent, behind
 * the materialisation precondition above, and the whole diagnostic code list is
 * scored so an unrelated addition also reds.
 */
function expectRouteSilent(
  result: ComposeResult,
  otherCodes: readonly string[],
  why: string,
): void {
  expect(
    routeHits(result),
    `${why}\n  ACTUAL: ${JSON.stringify(result.rendered)}`,
  ).toEqual([]);
  expect(
    result.diagnostics.map((d) => d.code),
    `${why} — and no other diagnostic beside the expected ${JSON.stringify(otherCodes)}.\n  ACTUAL: ${JSON.stringify(result.rendered)}`,
  ).toEqual([...otherCodes]);
}

// ===========================================================================
// A compact call-node walker, for the loud "the fixture holds the call site"
// preconditions and for the corpus group's provided-argument counts. It reaches
// every position this file's fixtures and the two corpus files use: a `let`
// initialiser, an expression statement, a `fn` body, a block tail, a `?`
// operand, a ternary arm and a nested argument. A fixture whose call it cannot
// reach fails loudly rather than passing an absence assertion vacuously.
// ===========================================================================

interface CallSite {
  readonly callee: string;
  readonly argCount: number;
}

function collectCalls(doc: ThetaDocument): CallSite[] {
  const out: CallSite[] = [];
  const walkExpr = (e: Expr): void => {
    switch (e.kind) {
      case "call":
        out.push({ callee: e.callee, argCount: e.args.length });
        for (const a of e.args) walkExpr(a);
        return;
      case "try":
        walkExpr(e.operand);
        return;
      case "ternary":
        walkExpr(e.condition);
        walkExpr(e.consequent);
        walkExpr(e.alternate);
        return;
      case "binary":
        walkExpr(e.left);
        walkExpr(e.right);
        return;
      case "member":
        walkExpr(e.target);
        return;
      case "method-call":
        walkExpr(e.target);
        for (const a of e.args) walkExpr(a);
        return;
      case "array":
        for (const el of e.elements) walkExpr(el);
        return;
      case "object":
        for (const f of e.fields) walkExpr(f.value);
        return;
      case "invoke":
        for (const a of e.args) walkExpr(a);
        return;
      default:
        return;
    }
  };
  const walkBlock = (b: Block): void => {
    for (const s of b.statements) walkStmt(s);
    if (b.tail !== null) walkExpr(b.tail);
  };
  const walkStmt = (s: Stmt): void => {
    switch (s.kind) {
      case "let":
        if (s.init !== null) walkExpr(s.init);
        return;
      case "expr":
        walkExpr(s.expr);
        return;
      case "fn":
        walkBlock(s.body);
        return;
      case "invoke":
        walkExpr(s.invoke);
        return;
      default:
        return;
    }
  };
  walkBlock(doc.body);
  return out;
}

/** The provided argument count of the SOLE call of `callee`. Fails loudly. */
function providedArgCount(doc: ThetaDocument, where: string, callee: string): number {
  const hits = collectCalls(doc).filter((c) => c.callee === callee);
  expect(
    hits,
    `PRECONDITION: ${where} must hold exactly one call \`${callee}(…)\`; the walk found ${hits.length}. All calls: ${JSON.stringify(collectCalls(doc).map((c) => `${c.callee}/${c.argCount}`))}`,
  ).toHaveLength(1);
  return hits[0]!.argCount;
}

/** The top-level `fn <name>` declaration of a parsed document. Fails loudly. */
function fnDecl(doc: ThetaDocument, where: string, name: string): Extract<Stmt, { kind: "fn" }> {
  const decls = doc.body.statements.filter(
    (s): s is Extract<Stmt, { kind: "fn" }> => s.kind === "fn" && s.name === name,
  );
  expect(
    decls,
    `PRECONDITION: ${where} must declare exactly one top-level \`fn ${name}\`; the parse found ${decls.length}. A corpus move must red here, not silently void the non-mover claim.`,
  ).toHaveLength(1);
  return decls[0]!;
}

// ===========================================================================
// (a) ITEM 1 — the PARSE tier stays silent on the imported route, and the
//     same-file controls keep firing. GREEN at HEAD and required to stay green:
//     route 2 puts every new emission at compose, so a parse-tier emission here
//     would mean the `importedSymbols` arm of `checkFnCallArgs` moved — which
//     would also red bug 0050's cell `i1` and bug 0131's cell
//     `e-imported-arm3`.
// ===========================================================================

/** A parse cell's anti-vacuity guard plus its exact code list. */
function expectParseCodes(
  doc: ThetaDocument,
  units: number,
  expectedCodes: readonly string[],
  why: string,
): void {
  expect(
    doc.frontmatter,
    `anti-vacuity (${why}): the frontmatter did not parse, so this diagnostic list measures nothing`,
  ).not.toBeNull();
  expect(
    doc.body.statements.length + (doc.body.tail === null ? 0 : 1),
    `anti-vacuity (${why}): the body must walk to ${units} top-level unit(s) — statements plus a tail expression — before its diagnostic list is a measurement. Diagnostics: ${JSON.stringify(render(doc.diagnostics))}`,
  ).toBe(units);
  expect(
    doc.diagnostics.map((d) => d.code),
    `${why}\n  ACTUAL: ${JSON.stringify(render(doc.diagnostics))}`,
  ).toEqual([...expectedCodes]);
}

describe("bug 0138 (a) — the PARSE tier stays silent on the imported route (item 1)", () => {
  it("a1-parse-named-silent: an imported `named`-parameter call draws nothing at parse", () => {
    const doc = parseApp(
      [
        `import { rate_strictness } from "./b0138lib-personas.thetalib"`,
        "let r = rate_strictness(3)",
        "r",
        "",
      ].join("\n"),
    );
    expect(
      providedArgCount(doc, "a1's fixture", "rate_strictness"),
      "PRECONDITION (a1): the fixture must hold the one-argument imported call, or the silence below measures nothing",
    ).toBe(1);
    expectParseCodes(
      doc,
      3,
      [],
      "a1-parse-named-silent — a single-file parse carries no imported `fn`'s parameter types (type-system.md §\"Type compatibility\", *Unresolvable operands*), so route 2 leaves the `importedSymbols` arm of `checkFnCallArgs` returning and lands its emission at compose (cell b1)",
    );
  });

  it("a2-parse-structural-silent: an imported structural-parameter call draws nothing at parse", () => {
    const doc = parseApp(
      [`import { helper } from "./b0138lib-prim.thetalib"`, 'let r = helper("s")', "r", ""].join(
        "\n",
      ),
    );
    expectParseCodes(
      doc,
      3,
      [],
      "a2-parse-structural-silent — the structural half needs the signature only, and the parse tier does not have it either; the emission is cell b2's",
    );
  });

  it("a3-parse-alias-silent: the `as`-alias spelling takes the same arm at parse", () => {
    const doc = parseApp(
      [
        `import { rate_strictness as rate } from "./b0138lib-personas.thetalib"`,
        "let r = rate(3)",
        "r",
        "",
      ].join("\n"),
    );
    expect(
      providedArgCount(doc, "a3's fixture", "rate"),
      "PRECONDITION (a3): the call must be spelled with the ALIAS, which is the local binding `collectImportedSymbols` records",
    ).toBe(1);
    expectParseCodes(
      doc,
      3,
      [],
      "a3-parse-alias-silent — `collectImportedSymbols` records the LOCAL binding name, alias included, so the aliased call takes the same deferral arm",
    );
  });

  it("a4-parse-arity-silent: both mis-arity spellings draw nothing at parse (bug 0131 arm (3))", () => {
    // Bug 0131's cell `e-imported-arm3` pins exactly this silence and names this
    // bug as the plumbing. Route 2 keeps the parse tier silent, so that cell
    // stays green and the arity emission lands at compose (cells c1 / c2).
    const tooFew = parseApp(
      [`import { helper } from "./b0138lib-prim.thetalib"`, "let r = helper()", "r", ""].join("\n"),
    );
    expectParseCodes(
      tooFew,
      3,
      [],
      "a4-parse-arity-silent (too few) — the parser holds no cross-file `fn` signature, so it can count nothing",
    );
    const tooMany = parseApp(
      [`import { helper } from "./b0138lib-prim.thetalib"`, "let r = helper(1, 2)", "r", ""].join(
        "\n",
      ),
    );
    expectParseCodes(
      tooMany,
      3,
      [],
      "a4-parse-arity-silent (too many) — the opposite arm at the same boundary",
    );
  });

  it("a5-control-samefile-type: the byte-identical SAME-FILE call is refused at parse", () => {
    // The control that makes a1's silence a load/no-load difference rather than a
    // message difference: this row is `E`, so `hasLoadParseError` denies
    // registration, and the only thing that differs between the two fixtures is
    // which file the `fn` is declared in.
    const doc = parseApp(PERSONAS + "let r = rate_strictness(3)\nr\n");
    expect(
      doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
      `a5-control-samefile-type — bug 0050's landed same-file emission must stay byte-exact through this fix; it is the answer the imported route must reach (cell b1).\n  ACTUAL: ${JSON.stringify(render(doc.diagnostics))}`,
    ).toEqual([`error ${FN_ARG_TYPE}: ${typeMessage("rate_strictness", 0, "a", "Author", "integer")}`]);
  });

  it("a6-control-samefile-arity: the SAME-FILE mis-arity call is refused at parse", () => {
    const doc = parseApp(PRIM_LIB + "let r = helper()\nr\n");
    expect(
      doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
      `a6-control-samefile-arity — bug 0131's landed same-file arity emission must stay byte-exact; it is the answer cell c1 must reach.\n  ACTUAL: ${JSON.stringify(render(doc.diagnostics))}`,
    ).toEqual([`error ${TOO_FEW}: ${arityMessage(TOO_FEW, "helper", 1, 0)}`]);
  });
});

// ===========================================================================
// (b) ITEMS 2 + 3 — the COMPOSE tier judges the imported argument's TYPE, with
//     the message taken from the existing row and `<name>` rendering the
//     call-site spelling. RED at HEAD except the compatible control.
// ===========================================================================

describe("bug 0138 (b) — the compose tier judges an imported call's argument TYPE", () => {
  it("b1-compose-named: `rate_strictness(3)` against the library's `Author` is refused", async () => {
    const doc = parseApp(
      [
        `import { rate_strictness } from "./b0138lib-personas.thetalib"`,
        "let r = rate_strictness(3)",
        "r",
        "",
      ].join("\n"),
    );
    const result = await compose(doc, { [PERSONAS_PATH]: PERSONAS });
    expectMaterialised(result, "fn rate_strictness", "b1");
    expectOneRouteDiagnostic(
      result,
      FN_ARG_TYPE,
      typeMessage("rate_strictness", 0, "a", "Author", "integer"),
      "b1-compose-named — THE headline row (bug 0138 rows a1 / b1): the `named` half, whose expected side needs the DECLARING library's `TypeEnv` (item 5). `checkThetaImports` already holds the parsed library body, so the operand is not past the pipeline's static view",
    );
  });

  it("b2-compose-structural: `helper(\"s\")` against `n: number` is refused", async () => {
    const doc = parseApp(
      [`import { helper } from "./b0138lib-prim.thetalib"`, 'let r = helper("s")', "r", ""].join(
        "\n",
      ),
    );
    const result = await compose(doc, { [PRIM_PATH]: PRIM_LIB });
    expectMaterialised(result, "fn helper", "b2");
    expectOneRouteDiagnostic(
      result,
      FN_ARG_TYPE,
      typeMessage("helper", 0, "n", "number", "string"),
      "b2-compose-structural — the structural half (§Fix (d)): a `number` parameter needs no declarations at all, so the signature alone decides it",
    );
  });

  it("b3-compose-alias-renders-alias: `<name>` renders the CALL-SITE spelling", async () => {
    // ITEM 3. placeholder-rendering-b.md §"5. Source-derived placeholders":
    // `<name>` is identifier-shaped and taken from the offending source text, and
    // the text at the diagnostic's own range is the local binding the author
    // wrote — `rate`, not the library's `rate_strictness`.
    const doc = parseApp(
      [
        `import { rate_strictness as rate } from "./b0138lib-personas.thetalib"`,
        "let r = rate(3)",
        "r",
        "",
      ].join("\n"),
    );
    const result = await compose(doc, { [PERSONAS_PATH]: PERSONAS });
    expectMaterialised(result, "fn rate", "b3");
    expectOneRouteDiagnostic(
      result,
      FN_ARG_TYPE,
      typeMessage("rate", 0, "a", "Author", "integer"),
      "b3-compose-alias-renders-alias — the parameter name `a` and the expected type `Author` come from the LIBRARY, the callee name from the CALL SITE; rendering `rate_strictness` here would name text that appears nowhere on the offending line",
    );
  });

  it("b4-compose-compatible-control: a well-typed imported call stays silent", async () => {
    const doc = parseApp(
      [`import { helper } from "./b0138lib-prim.thetalib"`, "let r = helper(3)", "r", ""].join("\n"),
    );
    const result = await compose(doc, { [PRIM_PATH]: PRIM_LIB });
    expectMaterialised(result, "fn helper", "b4");
    expectRouteSilent(
      result,
      [],
      "b4-compose-compatible-control — the passing control that proves b2's emission is the MISMATCH and not the call shape; a fix that refused this over-reaches",
    );
  });
});

// ===========================================================================
// (c) ITEMS 2 + 4 — the COMPOSE tier judges an imported call's ARITY, and arity
//     is decided BEFORE type. RED at HEAD (the arity halves).
// ===========================================================================

describe("bug 0138 (c) — the compose tier judges an imported call's ARITY (bug 0131 arm (3))", () => {
  it("c1-compose-too-few: `helper()` against one declared parameter is too few", async () => {
    const doc = parseApp(
      [`import { helper } from "./b0138lib-prim.thetalib"`, "let r = helper()", "r", ""].join("\n"),
    );
    const result = await compose(doc, { [PRIM_PATH]: PRIM_LIB });
    expectMaterialised(result, "fn helper", "c1");
    expectOneRouteDiagnostic(
      result,
      TOO_FEW,
      arityMessage(TOO_FEW, "helper", 1, 0),
      "c1-compose-too-few — bug 0131 residual 1 deferred arm (3) to THIS bug by name; `<required>` is the library `fn`'s declared parameter count, since a `fn` parameter carries no default",
    );
  });

  it("c2-compose-too-many: `helper(1, 2)` against one declared parameter is too many", async () => {
    const doc = parseApp(
      [`import { helper } from "./b0138lib-prim.thetalib"`, "let r = helper(1, 2)", "r", ""].join(
        "\n",
      ),
    );
    const result = await compose(doc, { [PRIM_PATH]: PRIM_LIB });
    expectMaterialised(result, "fn helper", "c2");
    expectOneRouteDiagnostic(
      result,
      TOO_MANY,
      arityMessage(TOO_MANY, "helper", 1, 2),
      "c2-compose-too-many — the surplus argument has no destination under positional binding, and the count is readable from the resolved library signature",
    );
  });

  it("c3-compose-arity-before-type: a mis-arity mis-typed call draws the ARITY row alone", async () => {
    // ITEM 4. invocation.md §"Argument arity": arity is checked BEFORE
    // per-argument type, "so an arity error is reported as such rather than as a
    // confusing per-argument type error on the first extra slot". The same-file
    // discipline is an early `return` above the per-argument loop in
    // `checkFnCallArgs`, mirrored by `checkInvokeCall`; the imported route
    // inherits it. Argument 0 (`"s"` against `n: number`) is independently
    // mistyped, so this cell fails loudly if the type row is emitted beside the
    // arity row.
    const doc = parseApp(
      [`import { helper } from "./b0138lib-prim.thetalib"`, 'let r = helper("s", "t")', "r", ""].join(
        "\n",
      ),
    );
    const result = await compose(doc, { [PRIM_PATH]: PRIM_LIB });
    expectMaterialised(result, "fn helper", "c3");
    expectOneRouteDiagnostic(
      result,
      TOO_MANY,
      arityMessage(TOO_MANY, "helper", 1, 2),
      "c3-compose-arity-before-type — the arity row alone; the whole-list form is what pins the SUPPRESSION of the per-argument type row on a mis-arity call",
    );
  });
});

// ===========================================================================
// (d) ITEM 5 — the EXPECTED side resolves through the DECLARING LIBRARY's
//     `TypeEnv`, never the importing file's (bug 0072's namespace rule).
// ===========================================================================

describe("bug 0138 (d) — the expected side comes from the declaring library", () => {
  it("d1-importer-own-unrelated-author: an importer's own `schema Author` does not change the verdict", async () => {
    // The namespace hazard, measured. The importer imports ONLY
    // `rate_strictness` and declares its own unrelated `schema Author { q: string
    // }` — no collision, because `theta/parse/import-name-collision` covers only
    // an IMPORTED symbol colliding with a top-level declaration (imports.md
    // §"Name collisions"), and `Author` is not imported here. A carriage
    // resolving the library's parameter annotation `Author` through THIS file's
    // `TypeEnv` would judge `3` against `{ q: string }` and answer correctly only
    // by coincidence.
    const doc = parseApp(
      [
        `import { rate_strictness } from "./b0138lib-personas.thetalib"`,
        "schema Author { q: string }",
        "let r = rate_strictness(3)",
        "r",
        "",
      ].join("\n"),
    );
    const result = await compose(doc, { [PERSONAS_PATH]: PERSONAS });
    expectMaterialised(result, "fn rate_strictness", "d1");
    expectOneRouteDiagnostic(
      result,
      FN_ARG_TYPE,
      typeMessage("rate_strictness", 0, "a", "Author", "integer"),
      "d1-importer-own-unrelated-author — the verdict and the rendered `<expected>` must be the LIBRARY's `Author` (the object schema), identical to b1's; the importing file's homonym is irrelevant to a parameter the library declared",
    );
  });

  it("d2-lib-undeclared-named-withholds: a `named` parameter type undeclared IN THE LIBRARY withholds", async () => {
    // Bug 0138 row a7's constraint, moved across the boundary. The signature is
    // in hand and the argument is provably an integer, but the library declares
    // no `Author`, so `checkCompatible` answers `"unknown"` and
    // `checkFnArgCompat` defers (type-system.md §"Type compatibility",
    // *Unresolvable operands*). No route may make an unresolvable annotation
    // emit; an honestly-empty environment is bug 0072's requirement, not a
    // fallback to the importer's.
    const doc = parseApp(
      [`import { f } from "./b0138lib-undeclared.thetalib"`, "let r = f(3)", "r", ""].join("\n"),
    );
    const result = await compose(doc, {
      "/proj/b0138lib-undeclared.thetalib": "fn f(a: Author): integer { 1 }\n",
    });
    expectMaterialised(result, "fn f", "d2");
    expectRouteSilent(
      result,
      [],
      "d2-lib-undeclared-named-withholds — the arity is correct and the parameter type is unresolvable in the DECLARING file's environment, so the check is skipped; widening what counts as resolvable in the importer is exactly the hazard d1 fences",
    );
  });
});

// ===========================================================================
// (e) ITEM 6 — the ARGUMENT side uses `collectProvableArgTypes`' SET discipline
//     over the IMPORTING file's `TypeEnv` / `StaticTypeInferencePass`: a
//     diagnostic is drawn only when EVERY member of the collected set is
//     incompatible, so a mixed set withholds.
// ===========================================================================

describe("bug 0138 (e) — an unprovable argument withholds", () => {
  it("e1-mixed-ternary-withholds: `helper(flag ? 1 : \"a\")` draws nothing", async () => {
    // The collected set is {integer, string}; `integer` IS compatible with
    // `number`, so the every-member-incompatible predicate
    // (`collectProvableArgTypes` + `checkCompatible` in
    // src/extension/invoke-static-checks.ts, the substrate bugs 0072 / 0137 /
    // 0146 landed) does not hold and the site withholds.
    //
    // MEASURED DIVERGENCE from the bug document: its row d7 recorded the
    // SAME-FILE spelling of this fixture as `[]` at 0.77.0, but at this HEAD the
    // parse tier draws `expected number, got integer | string` — the parse tier
    // reduces the ternary to a union through `provableArgType` /
    // `isProvenReduction`, which is a different substrate from the compose tier's
    // SET. This cell pins the COMPOSE tier's discipline, which is the one route 2
    // reuses; cell e2 pins the same-file parse answer as measured, so the
    // asymmetry is recorded rather than assumed away.
    const doc = parseApp(
      [
        `import { helper } from "./b0138lib-prim.thetalib"`,
        "let flag = true",
        'let r = helper(flag ? 1 : "a")',
        "r",
        "",
      ].join("\n"),
    );
    const result = await compose(doc, { [PRIM_PATH]: PRIM_LIB });
    expectMaterialised(result, "fn helper", "e1");
    expectRouteSilent(
      result,
      [],
      "e1-mixed-ternary-withholds — one member of the provable set satisfies the parameter, so no `T₁ ⋢ T₂` verdict is available for the site; a cross-file route adds a callee, not a new argument-typing rule",
    );
  });

  it("e2-samefile-mixed-ternary-nonmover: the same-file parse answer is unchanged", () => {
    // The neighbour pin. This cell asserts the same-file parse verdict AS
    // MEASURED at this HEAD so that a compose-layer fix cannot quietly move the
    // parse tier's argument discipline while satisfying e1.
    const doc = parseApp(
      PRIM_LIB + 'let flag = true\nlet r = helper(flag ? 1 : "a")\nr\n',
    );
    expect(
      doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
      `e2-samefile-mixed-ternary-nonmover — the same-file parse route is not this fix's surface and must stay byte-exact.\n  ACTUAL: ${JSON.stringify(render(doc.diagnostics))}`,
    ).toEqual([
      `error ${FN_ARG_TYPE}: ${typeMessage("helper", 0, "n", "number", "integer | string")}`,
    ]);
  });
});

// ===========================================================================
// (f) ITEM 7 — the remaining withholds: arm (1) shadowing, a non-`fn` imported
//     symbol, and a junk parameter table in the library. All GREEN at HEAD and
//     required to stay green.
// ===========================================================================

describe("bug 0138 (f) — shadowed callees, non-`fn` symbols and junk parameter tables withhold", () => {
  it("f1-shadowed-by-let: a top-level `let` binding of the same name outranks the import", async () => {
    // expressions.md §"Identifier resolution": arm (1), "A local `let` binding or
    // function parameter currently in scope", is matched FIRST — "Local bindings
    // (1) shadow everything else lexically". The call site therefore does not
    // denote the imported `fn`, and judging it against the library signature
    // would report a contract the site does not name.
    const doc = parseApp(
      [
        `import { helper } from "./b0138lib-prim.thetalib"`,
        "let helper = 1",
        'let r = helper("s")',
        "r",
        "",
      ].join("\n"),
    );
    const result = await compose(doc, { [PRIM_PATH]: PRIM_LIB });
    expectMaterialised(result, "fn helper", "f1");
    expectRouteSilent(
      result,
      [],
      "f1-shadowed-by-let — arm (1) wins, so the callee is not the imported symbol; the resolution ladder a compose-layer check walks must test the importer's shadowing names first, exactly as `checkFnCallArgs` does",
    );
  });

  it("f2-shadowed-by-fn-param: a `fn` parameter of the same name outranks the import", async () => {
    const doc = parseApp(
      [
        `import { helper } from "./b0138lib-prim.thetalib"`,
        'fn wrap(helper: number): number { helper("s") }',
        "let r = wrap(1)",
        "r",
        "",
      ].join("\n"),
    );
    const result = await compose(doc, { [PRIM_PATH]: PRIM_LIB });
    expectMaterialised(result, "fn helper", "f2");
    expectRouteSilent(
      result,
      [],
      "f2-shadowed-by-fn-param — the same arm (1) rule at a lexical scope the walk must enter; a check that only tested top-level names would emit here",
    );
  });

  it("f3-imported-schema-callee: an imported `schema` in call position withholds", async () => {
    // The imported symbol materialises as `schema Author`, not a `fn`, so there
    // is no parameter list to judge against. The `fn`-argument rows are scoped to
    // a `fn`'s parameter list; whatever answer this shape deserves belongs to a
    // different row.
    const doc = parseApp(
      [
        `import { Author } from "./b0138lib-personas.thetalib"`,
        "let a = Author(3)",
        "a",
        "",
      ].join("\n"),
    );
    const result = await compose(doc, { [PERSONAS_PATH]: PERSONAS });
    expectMaterialised(result, "schema Author", "f3");
    expectRouteSilent(
      result,
      [],
      "f3-imported-schema-callee — the resolved declaration is a `schema`, so no `FnDecl` and no parameter list exists; the three rows this route reuses must not reach it",
    );
  });

  it("f4-junk-param-table-in-library: a library `fn` whose parameter list holds a non-`Ident` withholds", async () => {
    // Bug 0131's §(c) withhold, carried across the boundary: the library's
    // parameter list absorbed the following statement, so its recorded parameter
    // COUNT is a `theta/parse/fn-param-not-identifier` recovery artefact the
    // author never wrote. The library's own refusal is pushed by
    // `checkThetaImports` (the lib parse errors reach the importing theta's
    // diagnostic list), and it is the ONLY diagnostic this fixture may carry —
    // `h("q")` supplies one argument against a table recording two, so an arity
    // row would be exactly the count no author wrote.
    const doc = parseApp(
      [`import { h } from "./b0138lib-junk.thetalib"`, 'let r = h("q")', "r", ""].join("\n"),
    );
    const result = await compose(doc, {
      "/proj/b0138lib-junk.thetalib": ["fn h(a: string,", "x = 1", ") { 1 }", ""].join("\n"),
    });
    expectMaterialised(result, "fn h", "f4");
    expectRouteSilent(
      result,
      [PARAM_NOT_IDENT],
      "f4-junk-param-table-in-library — the library's own declaration-level refusal owns this source; since that refusal is `E`-severity the importing theta does not register either way, so no input is left both silent and loadable",
    );
  });

  it("f5-junk-param-table-mistyped-arg: the junk table withholds ARITY only — the per-slot TYPE judgement still runs", async () => {
    // The parity half of f4. `fnParamNamesAreIdentifiers` withholds the arity
    // verdict because the recorded COUNT is a `fn-param-not-identifier`
    // recovery artefact the author never wrote — but parameter 0's annotation
    // `a: string` IS the author's own text, so slot 0 is still judged, exactly
    // as the same-file `checkFnCallArgs` does (it withholds the arity block and
    // falls through to its per-argument loop). f4's argument is compatible and
    // therefore cannot measure this property; this cell supplies a mistyped one
    // and scores the WHOLE code list, so a route that `continue`d out of the
    // call site entirely reds here.
    const doc = parseApp(
      [`import { h } from "./b0138lib-junk.thetalib"`, "let r = h(1)", "r", ""].join("\n"),
    );
    const result = await compose(doc, {
      "/proj/b0138lib-junk.thetalib": ["fn h(a: string,", "x = 1", ") { 1 }", ""].join("\n"),
    });
    expectMaterialised(result, "fn h", "f5");
    expect(
      result.diagnostics.map((d) => d.code),
      `f5-junk-param-table-mistyped-arg — the library's own \`${PARAM_NOT_IDENT}\` beside the per-slot \`${FN_ARG_TYPE}\`, and no arity row (the recorded count is the recovery artefact).\n  ACTUAL: ${JSON.stringify(result.rendered)}`,
    ).toEqual([PARAM_NOT_IDENT, FN_ARG_TYPE]);
    expect(
      result.rendered,
      `f5 — the per-slot message must come from the registry oracle, naming slot 0's declared \`string\` against the provided integer.\n  ACTUAL: ${JSON.stringify(result.rendered)}`,
    ).toContain(
      `error ${FN_ARG_TYPE} ${APP_PATH}: ${typeMessage("h", 0, "a", "string", "integer")}`,
    );
  });
});

// ===========================================================================
// (g) ITEM 8 — the DEFERRED fence (bug 0138 row d3): a call site INSIDE a
//     `.thetalib` body, against a symbol that library itself imported, stays
//     SILENT. The check runs over the IMPORTING theta's own body only. GREEN at
//     HEAD; the deferral is to be recorded in the fix record and in the registry
//     *Trigger*s, so it is a stated fence and not a dropped route.
// ===========================================================================

describe("bug 0138 (g) — a lib-to-lib call site is deferred, recorded not dropped", () => {
  it("g1-lib-to-lib-deferred: `lib.thetalib` calling its own imported `helper(\"s\")` draws nothing", async () => {
    const doc = parseApp(
      [`import { g } from "./b0138lib-mid.thetalib"`, "let r = g()", "r", ""].join("\n"),
    );
    const result = await compose(doc, {
      "/proj/b0138lib-mid.thetalib": [
        `import { helper } from "./b0138lib-prim.thetalib"`,
        'fn g(): number { helper("s") }',
        "",
      ].join("\n"),
      [PRIM_PATH]: PRIM_LIB,
    });
    expectMaterialised(result, "fn g", "g1");
    expectRouteSilent(
      result,
      [],
      "g1-lib-to-lib-deferred — the fence: route 2's check walks the importing THETA's body against the libraries IT imports, so a call inside a library body against that library's OWN import is out of scope and stays silent; the deferral must be stated in the fix record and in the registry *Trigger*s rather than left implicit (the failure mode bug 0071 produced when a *Trigger* named an arm the emitter did not serve)",
    );
  });
});

// ===========================================================================
// (h) ITEM 9 — the corpus non-movers, against REAL BYTES. Each cell asserts the
//     (declared, provided) pair and the argument's shape, so a corpus edit reds
//     here instead of voiding the non-mover claim. GREEN at HEAD, and GOV-15's
//     blast radius for the addition rests on them.
// ===========================================================================

const CORPUS_APP = "docs/examples/import-thetalib.theta";
const CORPUS_LIB = "docs/examples/personas.thetalib";
const ACC_APP = "tests/live/acceptance/fixtures/acc-imports-invoke.theta";
const ACC_LIB = "tests/live/acceptance/fixtures/acc-lib.thetalib";

describe("bug 0138 (h) — the two shipped imported-`fn` call sites are non-movers", () => {
  it("h1-corpus-import-thetalib: `rate_strictness(reviewer)` — declared `Author`, argument the `params:` field", async () => {
    const libDoc = parseDoc(readFileSync(CORPUS_LIB, "utf8"), CORPUS_LIB);
    const decl = fnDecl(libDoc, CORPUS_LIB, "rate_strictness");
    expect(
      decl.params.length,
      `h1 — ${CORPUS_LIB} must declare \`rate_strictness\` with exactly one parameter; a corpus move must red here`,
    ).toBe(1);
    expect(
      decl.params[0]!.type,
      `h1 — the declared parameter type must still be the library-declared \`Author\` schema; that is the half of the route needing the DECLARING file's declarations. Observed: ${JSON.stringify(decl.params[0])}`,
    ).toBe("Author");

    const appSrc = readFileSync(CORPUS_APP, "utf8");
    const appDoc = parseDoc(appSrc, "/proj/import-thetalib.theta");
    expect(
      providedArgCount(appDoc, CORPUS_APP, "rate_strictness"),
      `h1 — the shipped call site must stay correct-arity (declared 1)`,
    ).toBe(1);
    // The argument is the frontmatter `params:` field `reviewer`, itself declared
    // `Author` — the SAME named type the parameter declares — so the site is
    // compatible whichever discipline decides it, and observes no change under
    // this fix. (The bug document predicted a WITHHOLD here on the ground that a
    // `params:`-bound identifier is unprovable; measured at this HEAD the
    // same-file route does resolve a `params:` field's declared type, so the
    // accurate ground for "no diagnostic" is compatibility, not withholding.
    // Either way the corpus does not move, which is what this cell locks.)
    expect(
      appSrc,
      `h1 — the shipped fixture must still pass the \`params:\` field \`reviewer\` and still declare it \`Author\`; either edit changes what this non-mover claim measures`,
    ).toContain("rate_strictness(reviewer)");
    expect(appSrc, `h1 — \`reviewer: Author\` must still be the declared \`params:\` shape`).toContain(
      "reviewer: Author",
    );
    expectParseCodes(appDoc, 3, [], "h1-corpus-import-thetalib — the shipped example parses clean");
    const result = await compose(
      appDoc,
      { "/proj/personas.thetalib": readFileSync(CORPUS_LIB, "utf8") },
      "/proj/import-thetalib.theta",
    );
    expectMaterialised(result, "fn rate_strictness", "h1");
    expect(
      routeHits(result),
      `h1-corpus-import-thetalib — the shipped example must keep loading clean through this fix (GOV-15's loads-cleanly predicate).\n  ACTUAL: ${JSON.stringify(result.rendered)}`,
    ).toEqual([]);
  });

  it("h2-corpus-acc-imports-invoke: `tagline()` — zero declared, zero provided", async () => {
    const libDoc = parseDoc(readFileSync(ACC_LIB, "utf8"), ACC_LIB);
    const decl = fnDecl(libDoc, ACC_LIB, "tagline");
    expect(
      decl.params.length,
      `h2 — ${ACC_LIB} must declare \`tagline\` with zero parameters; the zero/zero cell is where an off-by-one in either arity arm would show`,
    ).toBe(0);
    const appDoc = parseDoc(readFileSync(ACC_APP, "utf8"), "/proj/acc-imports-invoke.theta");
    expect(
      providedArgCount(appDoc, ACC_APP, "tagline"),
      `h2 — the H9a acceptance fixture's call site must stay zero-argument, matching the declared count`,
    ).toBe(0);
    const result = await compose(
      appDoc,
      { "/proj/acc-lib.thetalib": readFileSync(ACC_LIB, "utf8") },
      "/proj/acc-imports-invoke.theta",
    );
    expectMaterialised(result, "fn tagline", "h2");
    expect(
      routeHits(result),
      `h2-corpus-acc-imports-invoke — a correct-arity shipped fixture must keep loading clean, or the H9a acceptance run's permitted-codes gate moves.\n  ACTUAL: ${JSON.stringify(result.rendered)}`,
    ).toEqual([]);
  });
});

// ===========================================================================
// (i) ITEM 10 — the POSITIVE REACHABILITY cell the bug document owes: the
//     imported route's emitting direction must be reachable AT ALL, for each of
//     the three rows. A later refactor that silently re-defers the route reds
//     here even if it also deleted the group (b) / (c) fixtures' expectations.
// ===========================================================================

describe("bug 0138 (i) — the imported route's emitting direction is reachable", () => {
  it("i1-route-reachable: all three reused rows fire on some imported-route input", async () => {
    const fixtures: ReadonlyArray<{ readonly body: string; readonly libs: Record<string, string> }> =
      [
        {
          body: [
            `import { helper } from "./b0138lib-prim.thetalib"`,
            'let r = helper("s")',
            "r",
            "",
          ].join("\n"),
          libs: { [PRIM_PATH]: PRIM_LIB },
        },
        {
          body: [`import { helper } from "./b0138lib-prim.thetalib"`, "let r = helper()", "r", ""].join(
            "\n",
          ),
          libs: { [PRIM_PATH]: PRIM_LIB },
        },
        {
          body: [
            `import { helper } from "./b0138lib-prim.thetalib"`,
            "let r = helper(1, 2)",
            "r",
            "",
          ].join("\n"),
          libs: { [PRIM_PATH]: PRIM_LIB },
        },
      ];
    const seen = new Set<string>();
    for (const fixture of fixtures) {
      const result = await compose(parseApp(fixture.body), fixture.libs);
      expectMaterialised(result, "fn helper", "i1");
      for (const code of routeHits(result)) seen.add(code);
    }
    expect(
      [...seen].sort(),
      `i1-route-reachable — the bug document's §Fix owes "an assertion that the imported route's emitting direction is REACHABLE at all", so that a later refactor silently re-deferring the route reds. Each of the three reused rows must fire on at least one imported-route input.\n  OBSERVED codes across the three fixtures: ${JSON.stringify([...seen].sort())}`,
    ).toEqual([...ROUTE_CODES].sort());
  });
});

// ===========================================================================
// (j) ITEM 11 / DIAG-2 — the registry *Trigger* text. The two fn-arity rows
//     currently defer the imported arm to this bug BY NAME; the fix widens that
//     text in the same commit (DIAG-2: the registry is closed, so a *Trigger*
//     change is a spec change landing with the code). Sourced from the registry
//     page, never from copied prose. RED now, GREEN after the same-commit spec
//     edit.
// ===========================================================================

describe("bug 0138 (j) — the registry *Trigger*s no longer defer the imported arm", () => {
  it("j1-arity-triggers-no-longer-defer: neither fn-arity row's Trigger names bug 0138 as the deferral", () => {
    for (const code of [TOO_FEW, TOO_MANY]) {
      const trigger = row(code).trigger;
      expect(
        trigger.length,
        `PRECONDITION (j1): ${REGISTRY_PAGE}'s row for ${code} must carry a non-empty *Trigger* cell, or this cell measures nothing`,
      ).toBeGreaterThan(0);
      expect(
        trigger,
        `j1-arity-triggers-no-longer-defer — bug 0131 deferred its arm (3) to bug 0138 in this *Trigger*; once the imported arm is served the text must no longer defer it (DIAG-2, same-commit spec edit).\n  ACTUAL *Trigger* for ${code}: ${JSON.stringify(trigger)}`,
      ).not.toContain("0138");
      expect(
        trigger.toUpperCase(),
        `j1-arity-triggers-no-longer-defer — the *Trigger* for ${code} must not describe the imported \`.thetalib\` arm as DEFERRED once it emits.\n  ACTUAL: ${JSON.stringify(trigger)}`,
      ).not.toContain("DEFERRED");
    }
    // The type row's *Trigger* already names both halves of the disjunction; it
    // must keep doing so (the fix amends its prose to state where the imported
    // half is decided, it does not narrow the promise).
    expect(
      row(FN_ARG_TYPE).trigger,
      `j1 — the ${FN_ARG_TYPE} *Trigger* must keep naming the imported half; narrowing it is Reading B, which the settled disposition rejects`,
    ).toContain("imported");
  });
});

// ===========================================================================
// (k) The `integer-narrowing` MISMATCH CLASS at parity with the same-file half.
//     `checkFnArgCompat` (src/parser/type-compat.ts) is the row's emitter and it
//     refuses everything except `"compatible"` / `"unknown"` — "a `number⊑integer`
//     narrowing is equally a mismatch here; TYPE-9 routes both through
//     fn-arg-type-mismatch". The imported route's per-member predicate must
//     therefore admit that class too, or the byte-identical imported spelling of
//     a refused same-file program LOADS — and, unlike the invoke /
//     `.theta`-callable routes, this position registers no runtime AJV net to
//     defer such a set to.
// ===========================================================================

const NARROW_PATH = "/proj/b0138lib-narrow.thetalib";
const NARROW_LIB = "fn narrow(k: integer): integer { k }\n";

describe("bug 0138 (k) — the narrowing mismatch class emits at parity with the same-file half", () => {
  it("k1-compose-narrowing: `narrow(1.5)` against `k: integer` is refused", async () => {
    const doc = parseApp(
      [`import { narrow } from "./b0138lib-narrow.thetalib"`, "let r = narrow(1.5)", "r", ""].join(
        "\n",
      ),
    );
    const result = await compose(doc, { [NARROW_PATH]: NARROW_LIB });
    expectMaterialised(result, "fn narrow", "k1");
    expectOneRouteDiagnostic(
      result,
      FN_ARG_TYPE,
      typeMessage("narrow", 0, "k", "integer", "number"),
      "k1-compose-narrowing — `checkCompatible` answers `\"integer-narrowing\"` here, which is a REFUSAL for this row: a predicate testing only `=== \"incompatible\"` withholds the class its own emitter refuses, and the load/no-load asymmetry against cell k2 is exactly what this bug closes",
    );
  });

  it("k2-control-samefile-narrowing: the byte-identical SAME-FILE call is refused at parse", () => {
    // The parity control, MEASURED through the parse tier rather than assumed:
    // the same library bytes declared in the importing file itself, the same
    // argument, the same registry-sourced message.
    const doc = parseApp(NARROW_LIB + "let r = narrow(1.5)\nr\n");
    expect(
      doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
      `k2-control-samefile-narrowing — the same-file answer k1 must reach.\n  ACTUAL: ${JSON.stringify(render(doc.diagnostics))}`,
    ).toEqual([`error ${FN_ARG_TYPE}: ${typeMessage("narrow", 0, "k", "integer", "number")}`]);
  });
});

// ===========================================================================
// (l) The RE-EXPORT-CHAIN withhold, pinned. Callee resolution reads only the
//     DIRECTLY-resolved library's own top-level body, so a specifier that
//     library provides through its own `export … from` chain names no
//     declaration there and its call site stays silent at both tiers. That is a
//     STATED withhold — recorded in the *Trigger*s of all three rows this route
//     reuses and in the fix record — not a dropped route: widening resolution to
//     chase the chain would duplicate `materializeChain`'s own chain-following
//     at a second call site. The loud precondition below proves the chain
//     actually resolved and materialised, so these absence cells measure the
//     withhold rather than a broken fixture.
// ===========================================================================

const REEXPORT_MID = "/proj/b0138lib-reexport-mid.thetalib";
const REEXPORT_LIBS: Record<string, string> = {
  [REEXPORT_MID]: `export { f } from "./b0138lib-reexport-prim.thetalib"\n`,
  "/proj/b0138lib-reexport-prim.thetalib": "fn f(a: string): string { a }\n",
};

describe("bug 0138 (l) — a re-export-chain callee's call site is a stated withhold", () => {
  it("l1-reexport-chain-mistyped-withholds: `f(1)` through a re-export chain draws nothing", async () => {
    const doc = parseApp(
      [`import { f } from "./b0138lib-reexport-mid.thetalib"`, "let r = f(1)", "r", ""].join("\n"),
    );
    const result = await compose(doc, REEXPORT_LIBS);
    expectMaterialised(result, "fn f", "l1");
    expectRouteSilent(
      result,
      [],
      "l1-reexport-chain-mistyped-withholds — `a: string` against the integer `1` would be a refusal had the callee been declared directly in `b0138lib-reexport-mid.thetalib`; reached through that library's own `export \u2026 from` it is not in the resolved body this route reads, so the site is silent — the direct-declaration restriction the three rows' *Trigger*s state",
    );
  });

  it("l2-reexport-chain-arity-withholds: a mis-arity call through the same chain draws nothing", async () => {
    const doc = parseApp(
      [`import { f } from "./b0138lib-reexport-mid.thetalib"`, "let r = f()", "r", ""].join("\n"),
    );
    const result = await compose(doc, REEXPORT_LIBS);
    expectMaterialised(result, "fn f", "l2");
    expectRouteSilent(
      result,
      [],
      "l2-reexport-chain-arity-withholds — the same restriction on the ARITY half: no resolved parameter list, so no count to compare; the materialisation precondition above is what proves the chain itself worked",
    );
  });
});
