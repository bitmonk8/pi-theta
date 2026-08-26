import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";
import type { ThetaFixture } from "../src/extension/factory";
import { codes, errors, parseDoc } from "./helpers/e2e-s1";

// Bug 0025 — a constructor naming an undeclared or non-brace-constructible
// schema (`Mystery { r: Ok(1) }`, `Color { r: 1 }`) loads clean and evaluates
// as an unbranded plain object
// (docs/bugs/0025-ctor-unresolved-schema-name-passthrough.md).
//
// Spec: expressions.md §Object construction (:209) defines two regimes over
// constructed objects — a NAMED constructor gets the field-set checks
// (`theta/parse/extra-object-field` / `theta/parse/missing-object-field`), a
// NAMELESS literal is rejected (`theta/parse/bare-object-literal`, whose stated
// purpose is "every constructed object must name its schema, so the type is
// unambiguous from the syntax alone"). Both regimes presuppose the name
// resolves. §Object construction :214 directs discriminated unions to be
// constructed "via the variant schema name", so no reading admits an `enum`
// name in constructor position. frontmatter-fields-a.md:58 fixes `NamedType`
// resolution as whole-file. diagnostics/diagnostic-shape.md DIAG-2 (the
// registry is closed — a trigger widening is a spec change in lock-step) and
// DIAG-4 (the Message column is normative — every expected string below is
// sourced from the registry via `registryMessage`, never copied prose).
//
// The defect (HEAD 4eb0721c / 0.36.0 — probed): `checkObjectExpr`
// (src/parser/theta-document.ts:5038) looks the constructor name up in
// `StructuralRefs.schemas` — same-file OBJECT-form `schema` declarations only
// (:4746–4753) — and its lookup-miss arm (:5054–5060) returns silently,
// collapsing three classes into one: a name resolving to no declaration, a name
// resolving to a declaration that is not brace-constructible (`enum`), and an
// imported `.thetalib` symbol whose field bodies are genuinely unavailable. No
// later phase revisits the name (the identifier walk excludes constructor sites
// by design, :3981–3991; inference emits the `named <typeName>` placeholder,
// static-type-inference.ts:257–258; the compat engine maps an unresolvable
// `named` to "unknown", type-compat.ts:222–237), so the value also sails
// through every annotated sink.
//
// PINNED POST-FIX CONTRACT (bug doc §Fix, SETTLED — RED now, GREEN after):
//   (1) REJECT a constructor name resolving to NO declaration — no top-level
//       body `schema` of either form, no top-level body `enum`, no imported
//       `.thetalib` symbol — with `theta/parse/unresolved-named-type`,
//       severity error.
//   (2) REJECT a constructor name resolving to a declared but
//       NON-BRACE-CONSTRUCTIBLE declaration: an `enum`, or the fields-less
//       `schema` head an alias/union declaration leaves behind. The
//       classification consults `collectBodyTypes`'s `enums` / `schemas` sets
//       by design, keeping constructor-name resolution decoupled from
//       `StructuralRefs.enums` (:4749), which exists to resolve
//       `Enum.Variant` member access. A variant-less `enum` is covered either
//       way — `parseEnum` (:2161–2173) always supplies `variants`, so both
//       sets hold it.
//   (3) DEFER an IMPORTED `.thetalib` symbol, whatever its kind. The
//       classification reads `collectBodyTypes`'s `imports`
//       (src/parser/theta-document.ts:1084, filled at :1095–1099), a name-only
//       `Set<string>`: the importer's parse holds neither the symbol's field
//       bodies nor its kind, so it has no shape to check against and cannot
//       even decide whether the name is brace-constructible. Green at HEAD AND
//       post-fix.
//   (4) One registry row, not a per-site code: `theta/parse/unresolved-named-type`
//       (code-registry-parse.md:88) widens from the `params:` right-hand side to
//       the registry's closed four-position list — the `params:` RHS, the `@<T>`
//       query annotation, a `schema` body field type, and the object-constructor
//       name — message `unresolved named type '<name>'`.
//       `theta/parse/unknown-identifier` is NOT widened — `let a = Mystery` (no
//       brace) keeps its own row.
//   (5) No runtime change: the input never loads, so the unbranded plain object
//       is never constructed. Cell LOAD drives the production compose helper.
//
// Scope: constructor field-VALUE typing (`Point { x: "not a number" }`) is bug
// 0031 and is not pinned here.
//
// Tier: unit / offline. Nothing on this path crosses a provider — the whole fix
// is witnessable at the `parseThetaDocument` boundary, plus the offline
// discovery walk in cell LOAD.

// ===========================================================================
// The registered code and its normative message (DIAG-2 / DIAG-4).
// ===========================================================================

const CODE = "theta/parse/unresolved-named-type";

interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

// The live four-page sharded registry, read from the spec corpus and
// concatenated — the same input tests/code-registry.test.ts reconciles.
const REGISTRY_TEXT = [
  "code-registry-parse.md",
  "code-registry-load.md",
  "code-registry-runtime.md",
  "code-registry-host.md",
]
  .map((page) =>
    readFileSync(
      fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
      "utf8",
    ),
  )
  .join("\n");

const REGISTRY = parseRegistry(REGISTRY_TEXT) as RegistryRow[];

/**
 * The row's normative *Message* template with its single `<name>` placeholder
 * filled (DIAG-4). Definedness is asserted first so a missing row reds by
 * naming the registry, never by a bare undefined comparison.
 */
function unresolvedMessage(name: string): string {
  const template = registryMessage(REGISTRY, CODE) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-parse.md must carry the ` +
      `Message row for ${CODE}`,
  ).toBeDefined();
  return template!.replace("<name>", name);
}

// ===========================================================================
// Fixtures + assertion helpers.
// ===========================================================================

/** The frontmatter prelude every fixture carries (bug doc: all `mode: prompt`). */
const FM = "---\nmode: prompt\n---\n";

function parse(body: string): ThetaDocument {
  return parseDoc(FM + body, "bug0025.theta");
}

function hits(doc: ThetaDocument): Diagnostic[] {
  return doc.diagnostics.filter((d) => d.code === CODE);
}

/** Render a document's whole diagnostic list for a failure message. */
function render(doc: ThetaDocument): string {
  return JSON.stringify(
    doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
  );
}

/**
 * The reject contract: exactly one `theta/parse/unresolved-named-type`, error
 * severity, whose message is the registry's with `<name>` rendered as the
 * constructor name the author wrote.
 */
function expectRejected(doc: ThetaDocument, name: string, why: string): void {
  const found = hits(doc);
  expect(
    found.length,
    `${why} — expected exactly one ${CODE} naming '${name}'; actual diagnostics=${render(doc)}`,
  ).toBe(1);
  const d = found[0]!;
  expect(d.severity, "the constructed value is unusable, so the theta must not load").toBe(
    "error",
  );
  expect(d.message, "DIAG-4: the message is the registry's, with <name> rendered").toBe(
    unresolvedMessage(name),
  );
}

/** The defer contract: the code is silent, and no shape-dependent check guesses. */
function expectDeferred(doc: ThetaDocument, why: string): void {
  expect(codes(doc.diagnostics), `${why}; actual diagnostics=${render(doc)}`).not.toContain(
    CODE,
  );
  expect(
    codes(doc.diagnostics),
    `${why} — an imported symbol's field bodies AND its kind are both unavailable at ` +
      `the importer's parse, so no field-set check may run; actual diagnostics=${render(doc)}`,
  ).not.toContain("theta/parse/extra-object-field");
  expect(
    codes(doc.diagnostics),
    `${why} — an imported symbol's field bodies AND its kind are both unavailable at ` +
      `the importer's parse, so no field-set check may run; actual diagnostics=${render(doc)}`,
  ).not.toContain("theta/parse/missing-object-field");
}

// ===========================================================================
// Registry contract (DIAG-2) — the row widens from `params:` to the closed
// four-position list. RED at HEAD: the trigger names `params:` only.
// ===========================================================================

describe("bug 0025 registry contract — theta/parse/unresolved-named-type covers the constructor-name position (DIAG-2)", () => {
  it("RED REG: the parse-registry row's trigger reaches the object-constructor name, severity stays E", () => {
    const row = REGISTRY.find((r) => r.code === CODE);
    expect(
      row,
      `DIAG-2: docs/spec_topics/diagnostics/code-registry-parse.md must carry the ${CODE} row`,
    ).toBeDefined();
    expect(row!.severity, "GOV-15 diagnostic-registry carve-out; severity stays E").toBe("E");
    expect(row!.phase, "emitted by checkObjectExpr during the structural walk").toBe("parse");
    expect(
      row!.trigger,
      `DIAG-2 amendment (bug doc §Fix, "Registry"; shared with bug 0028): the row widens from ` +
        `the \`params:\` right-hand side to the registry's closed four-position list — the ` +
        `\`params:\` RHS, the \`@<T>\` query annotation, a \`schema\` body field type, and the ` +
        `object-constructor name — so the trigger must name the object-constructor ` +
        `position verbatim. At HEAD the trigger names the \`params:\` RHS ` +
        `only: ${JSON.stringify(row!.trigger)}`,
    ).toMatch(/object-constructor/i);
  });
});

// ===========================================================================
// (1) REJECT — the constructor name resolves to NO declaration.
// RED at HEAD: every fixture below parses with ZERO diagnostics (probed).
// ===========================================================================

describe("bug 0025 (1) reject — a constructor name resolving to no declaration", () => {
  it("RED u1: `let m = Mystery { r: Ok(1) }` fires unresolved-named-type naming 'Mystery'", () => {
    // The bare-object-literal ban (expressions.md §Object construction) is
    // evaded by naming a schema that does not exist: what evaluates is exactly
    // the unbranded object literal the ban forbids.
    const doc = parse("let m = Mystery { r: Ok(1) }\nm\n");
    expectRejected(doc, "Mystery", "u1 — the sole undeclared-constructor fixture");
  });

  it("RED u2: a typed `let` whose RHS constructs an undeclared name fires (the annotation does not rescue it)", () => {
    // c5 (`let q: Q = P { x: 1 }`) proves the typed-`let` sink check is live at
    // this exact site; it is dead only because the name is unresolvable, so the
    // rejection has to come from the constructor position itself.
    const doc = parse(
      "schema Point { x: number, y: number }\nlet p: Point = Mystery { x: 1, y: 2 }\np\n",
    );
    expectRejected(doc, "Mystery", "u2 — schema-annotated sink, undeclared constructor");
  });

  it("RED u4: a PRIMITIVE-annotated `let` whose RHS constructs an undeclared name fires", () => {
    // The `named` placeholder degrades the compat check to "unknown"-skip, so
    // even `number` accepts the object today (type-compat.ts:222–237).
    const doc = parse("let n: number = Mystery { a: 1 }\nn\n");
    expectRejected(doc, "Mystery", "u4 — primitive-annotated sink, undeclared constructor");
  });

  it("RED typo: a misspelling of a declared schema fires, naming what the author wrote", () => {
    // The natural authoring error. `Pointt` is the name to report — reporting
    // `Point` would misattribute the site.
    const doc = parse(
      "schema Point { x: number, y: number }\nlet p = Pointt { x: 1, y: 2 }\np\n",
    );
    expectRejected(doc, "Pointt", "typo of a declared schema");
  });

  it("RED nested: an undeclared constructor inside a DECLARED constructor's field value fires", () => {
    // Proves the classification rides the same descent the bare-literal check
    // already rides into field values, not only the `let`-RHS root position.
    const doc = parse("schema Box { v: number }\nlet b = Box { v: Mystery { a: 1 } }\nb\n");
    expectRejected(doc, "Mystery", "nested inner constructor position");
    // The enclosing declared constructor is well-formed: its field set matches,
    // so the inner rejection must not drag a field-set diagnostic onto `Box`.
    expect(codes(doc.diagnostics), render(doc)).not.toContain(
      "theta/parse/extra-object-field",
    );
    expect(codes(doc.diagnostics), render(doc)).not.toContain(
      "theta/parse/missing-object-field",
    );
  });

  it("RED block-nested: a `schema` declared inside a block resolves nothing, even for a constructor in that same block", () => {
    // Resolution is over the body's TOP-LEVEL declarations
    // (frontmatter-fields-a.md:58): `collectBodyTypes`
    // (src/parser/theta-document.ts:1088–1101) and the `refs.schemas` build
    // (:4787–4795) both iterate `statements` without descending into blocks.
    // Rejection is the wanted disposition, not a walk accident — the runtime
    // registers only top-level `schema` statements as well
    // (src/runtime/lexical-environment.ts:328–333), so a block-nested
    // declaration brands nothing and `S { x: 1 }` would evaluate as exactly
    // the unbranded plain object this bug closes.
    const doc = parse("if true {\n  schema S { x: number }\n  let s = S { x: 1 }\n}\n");
    expectRejected(doc, "S", "block-nested schema declaration, constructor in the same block");
  });
});

// ===========================================================================
// (2) REJECT — the name resolves to a declared but non-brace-constructible
// declaration. RED at HEAD: silent (probed).
// ===========================================================================

describe("bug 0025 (2) reject — a constructor naming a declared enum or alias/union head", () => {
  it("RED u3: `enum Color { Red }` + `let c = Color { r: 1 }` fires naming 'Color'", () => {
    // A decidable category error: the parser already recorded the declaration
    // (`StructuralRefs.enums`, theta-document.ts:4703) and no reading of
    // expressions.md admits an `enum` name in constructor position.
    const doc = parse("enum Color { Red }\nlet c = Color { r: 1 }\nc\n");
    expectRejected(doc, "Color", "u3 — enum in constructor position");
  });

  it("RED u3b: a VARIANT-LESS enum in constructor position fires too", () => {
    // The classification reads `collectBodyTypes`'s `enums` set
    // (frontmatter.ts:221), not `StructuralRefs.enums` — constructor-name
    // resolution stays decoupled from the `Enum.Variant` member-access map.
    // The variant-less enum sits in both (`parseEnum`, theta-document.ts:2161–
    // 2173, always supplies `variants`; `parseEnumVariants` returns `[]` for an
    // empty body), so this cell pins the outcome, not one set's membership. The
    // declaration's own `theta/parse/empty-enum-body` is orthogonal and stays.
    const doc = parse("enum Color { }\nlet c = Color { r: 1 }\nc\n");
    expectRejected(doc, "Color", "u3b — variant-less enum in constructor position");
    expect(
      codes(doc.diagnostics),
      `the enum declaration's own emptiness diagnostic is unaffected; ${render(doc)}`,
    ).toContain("theta/parse/empty-enum-body");
  });

  it("RED alias: a body-level alias/union head in constructor position fires naming 'Animal'", () => {
    // Bug 0033 landed: `schema Animal = Cat | Dog` now parses as a real
    // three-way `SchemaDecl` (theta-document.ts `parseSchema`) instead of
    // registering a fields-less head and leaving `= Cat | Dog` for the
    // statement loop to mis-lex as `stray '='` / `stray '|'`
    // (docs/bugs/0033-body-level-schema-alias-unsupported.md). `fields` is
    // still absent for this form — an alias/union decl carries `arms`
    // instead — so the head still lands in the whole-file schema set as a
    // declaration with no object body to brace-construct, and this bug's
    // classification is unchanged. Cat/Dog carry a valid discriminator so the
    // union itself checks clean, isolating the constructor-name rejection as
    // the theta's ONLY diagnostic — the residual this cell pinned at 0033
    // filing time is gone, per that bug's own "Fix ordering": "If 0025 lands
    // first, its classification must be re-run against alias/union
    // declarations when 0033 lands."
    const doc = parse(
      'schema Cat { kind: "cat", name: string }\nschema Dog { kind: "dog", name: string }\n' +
        "schema Animal = Cat | Dog\nlet a = Animal { x: 1 }\na\n",
    );
    expectRejected(doc, "Animal", "alias/union head in constructor position");
    expect(
      doc.diagnostics.map((d) => d.code),
      `0033 landed — the union declaration parses and checks clean, so the constructor ` +
        `rejection is the sole diagnostic; ${render(doc)}`,
    ).toEqual(["theta/parse/unresolved-named-type"]);
  });
});

// ===========================================================================
// (3) DEFER — an imported `.thetalib` symbol name. GREEN at HEAD and post-fix:
// this is the arm the current lookup-miss return exists to serve.
// ===========================================================================

describe("bug 0025 (3) defer — an imported .thetalib symbol name stays silent", () => {
  it("an imported symbol in constructor position raises no unresolved-named-type", () => {
    const doc = parse('import { Foo } from "./x.thetalib"\nlet f = Foo { a: 1 }\nf\n');
    expectDeferred(doc, "an imported symbol resolves whole-file — it names a declaration");
  });

  it("an imported constructor's field set is not guessed at either", () => {
    // The classification sees the imported NAME and nothing else —
    // `collectBodyTypes`'s `imports` is a name-only `Set<string>`, carrying
    // neither field bodies nor the symbol's kind (one of `fn` / `schema` /
    // `enum`, src/runtime/lexical-environment.ts:109) — so neither the
    // extra-field nor the missing-field check has an input.
    const doc = parse(
      'import { Foo } from "./x.thetalib"\nlet f = Foo { a: 1, b: 2, c: 3 }\nf\n',
    );
    expectDeferred(doc, "the importer's parse holds no shape for an imported symbol");
  });
});

// ===========================================================================
// Controls — the gates that already exist keep firing, and the fix widens
// exactly one registry row. GREEN at HEAD and post-fix.
// ===========================================================================

describe("bug 0025 controls — the existing constructor gates are unchanged", () => {
  it("c1: an extra field on a declared schema stays theta/parse/extra-object-field alone", () => {
    const doc = parse("schema Point { x: number }\nlet p = Point { x: 1, z: 3 }\np\n");
    expect(codes(doc.diagnostics), render(doc)).toContain("theta/parse/extra-object-field");
    expect(
      codes(doc.diagnostics),
      `a DECLARED schema resolves; ${render(doc)}`,
    ).not.toContain(CODE);
  });

  it("c2: an omitted field on a declared schema stays theta/parse/missing-object-field alone", () => {
    const doc = parse(
      "schema Point { x: number, y: number }\nlet p = Point { x: 1 }\np\n",
    );
    expect(codes(doc.diagnostics), render(doc)).toContain("theta/parse/missing-object-field");
    expect(
      codes(doc.diagnostics),
      `a DECLARED schema resolves; ${render(doc)}`,
    ).not.toContain(CODE);
  });

  it("c3: a nameless object literal stays theta/parse/bare-object-literal", () => {
    const doc = parse("let p = { x: 1 }\np\n");
    expect(codes(doc.diagnostics), render(doc)).toContain("theta/parse/bare-object-literal");
    expect(
      codes(doc.diagnostics),
      `there is no name to resolve; ${render(doc)}`,
    ).not.toContain(CODE);
  });

  it("c4: `let n: number = P { x: 1 }` (P declared) stays theta/parse/let-rhs-type-mismatch", () => {
    const doc = parse("schema P { x: number }\nlet n: number = P { x: 1 }\nn\n");
    expect(codes(doc.diagnostics), render(doc)).toContain("theta/parse/let-rhs-type-mismatch");
    expect(codes(doc.diagnostics), render(doc)).not.toContain(CODE);
  });

  it("c5: `let q: Q = P { x: 1 }` (both declared) stays theta/parse/let-rhs-type-mismatch", () => {
    const doc = parse(
      "schema P { x: number }\nschema Q { x: number }\nlet q: Q = P { x: 1 }\nq\n",
    );
    expect(codes(doc.diagnostics), render(doc)).toContain("theta/parse/let-rhs-type-mismatch");
    expect(codes(doc.diagnostics), render(doc)).not.toContain(CODE);
  });

  it("c6: `let a = Mystery` (no brace) stays theta/parse/unknown-identifier — that row is NOT widened", () => {
    const doc = parse("let a = Mystery\na\n");
    expect(codes(doc.diagnostics), render(doc)).toContain("theta/parse/unknown-identifier");
    expect(
      codes(doc.diagnostics),
      `the value-position row keeps its own code (bug doc §Fix: "do not widen ` +
        `theta/parse/unknown-identifier"); ${render(doc)}`,
    ).not.toContain(CODE);
  });

  it("c6-inverse: the constructor position does NOT gain theta/parse/unknown-identifier", () => {
    // The identifier-resolution walk excludes constructor-name sites by design
    // (theta-document.ts:3981–3991); the fix widens a different row.
    const doc = parse("let m = Mystery { r: Ok(1) }\nm\n");
    expect(
      codes(doc.diagnostics),
      `one row widens, and it is not this one; ${render(doc)}`,
    ).not.toContain("theta/parse/unknown-identifier");
  });

  it("forward reference: a constructor preceding its schema declaration stays clean (resolution is whole-file)", () => {
    // frontmatter-fields-a.md:58 — NamedType resolution is whole-file, so a
    // body forward reference is not itself a failure.
    const doc = parse("let p = Point { x: 1 }\nschema Point { x: number }\np\n");
    expect(
      doc.diagnostics,
      `a forward-referenced body schema resolves; ${render(doc)}`,
    ).toEqual([]);
  });

  it("a well-formed constructor over a declared schema stays clean", () => {
    const doc = parse(
      "schema Point { x: number, y: number }\nlet p = Point { x: 1, y: 2 }\np\n",
    );
    expect(doc.diagnostics, render(doc)).toEqual([]);
  });

  it("the Pi-tool sole-argument carve-out is untouched", () => {
    // The bare-literal carve-out position must not acquire a name-resolution
    // obligation: the tool's registered input schema supplies the shape.
    const doc = parseDoc(
      ["---", "mode: prompt", "tools: read", "---", 'let r = read({ path: "x" })?', "r"].join(
        "\n",
      ) + "\n",
      "bug0025.theta",
    );
    expect(doc.diagnostics, render(doc)).toEqual([]);
  });

  it("the `params:` default carve-out is untouched", () => {
    // Both spellings the carve-out admits: a named constructor over a
    // whole-file-resolved body schema, and a bare literal.
    const named = parseDoc(
      [
        "---",
        "mode: prompt",
        "params:",
        '  cfg: "Point = Point { x: 1 }"',
        "---",
        "schema Point { x: number }",
        "@`x is ${cfg.x}`",
      ].join("\n") + "\n",
      "bug0025.theta",
    );
    expect(named.diagnostics, render(named)).toEqual([]);
    const bare = parseDoc(
      [
        "---",
        "mode: prompt",
        "params:",
        '  cfg: "Point = { x: 1 }"',
        "---",
        "schema Point { x: number }",
        "@`x is ${cfg.x}`",
      ].join("\n") + "\n",
      "bug0025.theta",
    );
    expect(bare.diagnostics, render(bare)).toEqual([]);
  });
});

// ===========================================================================
// (5) Load consequence — the input never reaches evaluation, so the unbranded
// plain object (`schemaTagOf` undefined, keys rendered verbatim) is never
// constructed. Drives the PRODUCTION COMPOSE HELPER over a temp discovery root.
// RED at HEAD: the theta registers as a runnable slash command.
// ===========================================================================

describe("bug 0025 (5) load consequence — the production compose helper refuses the theta", () => {
  it("RED LOAD: discoverAndComposeFixtures drops the `Mystery { … }` theta and surfaces the registered message", async () => {
    const source = FM + "let m = Mystery { r: Ok(1) }\nm\n";
    const workspaceDir = mkdtempSync(join(tmpdir(), "theta-bug0025-"));
    try {
      const projectThetaDir = join(workspaceDir, ".pi", "theta");
      mkdirSync(projectThetaDir, { recursive: true });
      // A clean control theta: proves the discovery walk found the workspace,
      // so the not-registered assertion below can never pass vacuously.
      writeFileSync(
        join(projectThetaDir, "goodctl.theta"),
        "---\nmode: prompt\n---\n@`hi`\n",
        "utf8",
      );
      writeFileSync(join(projectThetaDir, "ctorunres.theta"), source, "utf8");

      const notifications: string[] = [];
      const pi = {
        getFlag: (): undefined => undefined,
        getCommands: (): readonly unknown[] => [],
        sendMessage: (): void => {},
        sendUserMessage: (): void => {},
        getActiveTools: (): readonly string[] => [],
        setActiveTools: (): void => {},
      } as unknown as ExtensionAPI;
      const ctx = {
        cwd: workspaceDir,
        // Interactive posture so the drop path does not also mirror to stderr;
        // the observable under test is ui.notify.
        hasUI: true,
        modelRegistry: { getAvailable: (): readonly unknown[] => [] },
        ui: {
          notify: (message: string, _type: "error"): void => {
            notifications.push(message);
          },
        },
      } as unknown as ExtensionContext;

      const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(pi, ctx);
      const registered = fixtures.map((f) => f.slashName);

      expect(
        registered,
        "setup guard: the project .pi/theta/ discovery walk must register the clean control " +
          `theta; registered=${JSON.stringify(registered)}`,
      ).toContain("goodctl");
      expect(
        registered,
        "POST-FIX CONTRACT (bug doc §Fix, \"No runtime change\"): the theta carries an " +
          "error-severity parse diagnostic, so parseDiscoveredTheta DROPS it and the unbranded " +
          "plain object is never constructed. AT HEAD the parse is silent, the theta registers, " +
          `and the value evaluates unbranded; registered=${JSON.stringify(registered)}; ` +
          `notified=${JSON.stringify(notifications)}`,
      ).not.toContain("ctorunres");
      // Attribution: the drop is caused by THIS code and nothing else, so the
      // not-registered assertion above can never pass for an unrelated reason.
      const doc = parseDoc(source, "ctorunres.theta");
      expect(
        errors(doc.diagnostics).map((d) => d.code),
        `the refusal must be the widened ${CODE} and only that; actual=${render(doc)}`,
      ).toEqual([CODE]);
      expect(
        notifications,
        "DIAG-1: the drop surfaces the registry code's message to the author; " +
          `notified=${JSON.stringify(notifications)}`,
      ).toContain(unresolvedMessage("Mystery"));
    } finally {
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  });
});
