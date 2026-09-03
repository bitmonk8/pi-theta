// V18b / V18b-T — the build-time inventory-closure audit seam.
//
// This module owns the negative-direction *inventory-closure audit* the
// pi-integration-contract audit shards specify (a post-1.0 hardening that
// mechanizes the theta-1.0 *surface-set closure* MUST):
//
//   • inventory-audit-intro.md §"Inventory-closure audit"
//   • audit-resolution.md   (scope, per-category join keys, exemption /
//                            malformed- / stale-marker discriminators)
//   • audit-recognised-shapes.md (recognised category-(1)/(2)/(3) shapes and
//                            the non-exemptible family-(4) prohibited shapes)
//   • audit-target-categories.md (the three target surface categories + the
//                            typebox `{ Type }` / `{ Unsafe }` sibling
//                            allow-lists)
//   • audit-failures.md     (the five-family Failure-surface contract, the
//                            three-class `audit/<class>/<family>/<symptom>`
//                            discriminator shape, the per-family record shape)
//   • audit-wire-and-canary.md (wire serialisation, fail-closed
//                            infrastructure-failure handling, the non-empty
//                            two-counter canary)
//
// The audit resolves every recognised Pi-side surface reference in the audited
// source tree against the `SDK_SURFACE_INVENTORY` rows + entry-kind taxonomy
// `V18a` establishes, the typebox sibling allow-lists, or a declared
// `// allow-pi-surface:` marker, and surfaces every unresolved / prohibited
// reference under exactly one of the five families as an
// `audit/<class>/<family>/<symptom>` record. It additionally emits, on every
// invocation, the non-empty-scan canary's two counters.
//
// SEAM SHAPE (V18b-T). The audit core is a pure function over an already-read
// in-memory file map (POSIX-form audited-source-tree path -> UTF-8 content),
// the inventory, and the two typebox allow-lists — so file-system walking,
// symlink/encoding handling, and the fail-closed infrastructure wrapper the
// spec assigns to the audit's disk driver stay outside this pure core and off
// the *Sequential by default* blocking-runtime surface. The V18b implementation
// fills `runInventoryClosureAudit` in (and wires a thin disk-walk + `npm test`
// driver around it); this tests-task ships the seam + a non-compliant stub so
// the paired failing tests red on their own primary assertions.

import ts from "typescript";
import type { SurfaceInventoryEntry } from "./sdk-inventory";

/** The literal five-character `<n/a>` sentinel (audit-wire-and-canary.md). */
const NA = "<n/a>";

/** The four `@earendil-works/*` peer packages the audit's category (2) covers. */
const PEER_PACKAGES = [
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-tui",
] as const;

/** The canonical carrier-type literals (audit-target-categories.md (1)/(3)). */
const CTX_TYPES: ReadonlySet<string> = new Set(["ExtensionContext", "ExtensionCommandContext"]);
const PI_TYPE = "ExtensionAPI";

/**
 * The three-class partition every emitted record's discriminator carries in its
 * `<class>` segment (audit-failures.md §"Three-class partition"): the five
 * inventory-closure-audit violation families, infrastructure failures, and the
 * non-empty-scan canary.
 */
export type AuditClass = "violation" | "infra" | "canary";

/**
 * One emitted audit record (audit-failures.md §"Failure-surface contract" +
 * §"Per-family record-shape table"; audit-wire-and-canary.md §"Wire
 * serialisation"). `discriminator` is the leading `audit/<class>/<family>/
 * <symptom>` token; the four packed fields follow in fixed order.
 */
export interface AuditRecord {
  /** The `audit/<class>/<family>/<symptom>` discriminator token. */
  readonly discriminator: string;
  /** Offending source path, or the literal `<n/a>` sentinel. */
  readonly path: string;
  /** 1-based integer line as a string, or the literal `<n/a>` sentinel. */
  readonly line: string;
  /** Family-keyed symbol value, or the literal `<n/a>` sentinel. */
  readonly symbol: string;
  /** Plain-ASCII resolution arm the contributor would take. */
  readonly proposedResolution: string;
}

/**
 * The build-time inputs the closure audit resolves against.
 *
 * `files` is the already-read audited source tree keyed by POSIX-form path
 * (the disk driver the V18b implementation wraps this core in owns the
 * `src/**\/*.ts`-minus-exclusions glob, symlink, and encoding rules). The
 * `inventory` is the `SDK_SURFACE_INVENTORY` V18a pins; the two allow-lists are
 * the typebox `{ Type }` named-import and `{ Unsafe }` member-access siblings.
 */
export interface AuditInput {
  /** POSIX-form audited-source-tree path -> UTF-8 file content. */
  readonly files: ReadonlyMap<string, string>;
  /** The `SDK_SURFACE_INVENTORY` rows (V18a). */
  readonly inventory: readonly SurfaceInventoryEntry[];
  /** typebox named-import allow-list (theta 1.0: `{ Type }`). */
  readonly typeboxNamedImportAllowList: readonly string[];
  /** typebox member-access allow-list (theta 1.0: `{ Unsafe }`). */
  readonly typeboxMemberAccessAllowList: readonly string[];
}

/**
 * The audit's structured result: the ordered emitted records plus the
 * non-empty-scan canary's two counters (audit-wire-and-canary.md
 * §"Non-empty-scan canary") — the number of audited source files walked and
 * the number of in-scope surface references recognised.
 */
export interface AuditResult {
  readonly records: readonly AuditRecord[];
  readonly walked: number;
  readonly recognised: number;
}

/** A record plus its deterministic (file-index, byte-offset) sort key. */
interface OrderedRecord {
  readonly record: AuditRecord;
  readonly fileIndex: number;
  readonly pos: number;
}

/** Collapse every run of whitespace (incl. newlines) to a single ASCII space. */
function singleLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Rightmost dot-separated segment of an inventory `id` (category-(1)/(3) key). */
function rightmostSegment(id: string): string {
  const parts = id.split(".");
  return parts[parts.length - 1] ?? id;
}

/** Leftmost dot-separated segment of an inventory `id` (category-(2) key). */
function leftmostSegment(id: string): string {
  return id.split(".")[0] ?? id;
}

/** True iff `spec` names one of the four peer packages (bare or sub-path). */
function isPeerPackage(spec: string): boolean {
  return PEER_PACKAGES.some((p) => spec === p || spec.startsWith(`${p}/`));
}

/** True iff `spec` names the typebox package (bare or sub-path). */
function isTypebox(spec: string): boolean {
  return spec === "typebox" || spec.startsWith("typebox/");
}

/** True iff `spec` is any in-scope peer/typebox specifier. */
function isInScopeSpecifier(spec: string): boolean {
  return isPeerPackage(spec) || isTypebox(spec);
}

/** A single grammar clause (a)-(g) of the malformed-marker discriminator (clause (e)/(h) are contextual). */
type MarkerClause = "a" | "b" | "c" | "d" | "f" | "g";
type MarkerVerdict =
  | { readonly kind: "none" }
  | { readonly kind: "well-formed" }
  | { readonly kind: "malformed"; readonly clause: MarkerClause };

/**
 * The stable family-(5) `<symptom>` token each malformed grammar clause routes
 * to (bug 0374 §Fix). `satisfies` (not a bare object-literal binding) both keeps
 * the exhaustive clause coverage and keeps this off the H2a module-level
 * mutable-binding gate (conventions.md "no globals/statics").
 */
const MALFORMED_CLAUSE_TOKEN = {
  a: "missing-colon",
  b: "bad-citation",
  c: "bad-separator",
  d: "bad-justification",
  f: "non-lowercase-keyword",
  g: "block-comment-form",
} satisfies Record<MarkerClause, string>;

/**
 * Classify a same-line `// allow-pi-surface:` marker by its GRAMMAR, returning
 * the FIRST violated clause (bug 0374 §Fix: per-clause routing, no collapsing).
 * `commentText` is a REAL comment's trivia text (the `//` / `/*` opener anchors
 * the candidate at the start, so a `// allow-pi-surface` quoted inside the
 * comment's prose is not a candidate). Clauses (a)-(g) here are grammar; the
 * placement clause (e) and the family-(4)-line clause (h) are contextual and
 * applied by pass 2 (audit-resolution.md §Malformed-marker discriminator).
 * Returns `none` when the token-prefix is not a lexical exemption candidate.
 */
function classifyMarker(commentText: string): MarkerVerdict {
  const lineText = commentText;
  const m = /^(\/\/|\/\*)\s*([A-Za-z-]+)/.exec(lineText);
  const run = m?.[2];
  if (m === null || run === undefined || run.toLowerCase() !== "allow-pi-surface") {
    return { kind: "none" };
  }
  // (g) a block-comment opener is not the single-line `//` well-formed shape.
  if (m[1] === "/*") return { kind: "malformed", clause: "g" };
  // (f) the `allow-pi-surface` run must be byte-for-byte lowercase ASCII.
  if (run !== "allow-pi-surface") return { kind: "malformed", clause: "f" };
  const rest = lineText.slice(m.index + m[0].length);
  // (a) the trailing `:` immediately after the keyword run.
  if (!rest.startsWith(":")) return { kind: "malformed", clause: "a" };
  const afterColon = rest.slice(1);
  // (b) a REQ-<n> or PIC#<kebab> citation token filling the whole
  // whitespace-delimited slot (a valid PREFIX with trailing junk, e.g.
  // `REQ-12x`, is a clause-(b) violation, not a separator one).
  const cite = /^\s*(REQ-[0-9]+|PIC#[a-z0-9]+(?:-[a-z0-9]+)*)(?=\s|$)/.exec(afterColon);
  if (cite === null) return { kind: "malformed", clause: "b" };
  // (c) an em-dash or hyphen-minus separator with an ASCII space on each side.
  const sep = /^ +(?:—|-) +/.exec(afterColon.slice(cite[0].length));
  if (sep === null) return { kind: "malformed", clause: "c" };
  // (d) a >=4-char justification with at least one non-whitespace non-punct char.
  const justification = afterColon.slice(cite[0].length + sep[0].length).trim();
  if (justification.length < 4) return { kind: "malformed", clause: "d" };
  if (!/[^\s!-/:-@[-`{-~]/.test(justification)) return { kind: "malformed", clause: "d" };
  return { kind: "well-formed" };
}

/** The explicit textual type annotation of a parameter, or `null` if absent. */
function paramTypeText(p: ts.ParameterDeclaration, sf: ts.SourceFile): string | null {
  return p.type ? p.type.getText(sf).trim() : null;
}

/** Which canonical carrier a bare literal name denotes (`ExtensionAPI` -> pi, the two ctx literals -> ctx). */
type CarrierKind = "pi" | "ctx";
function carrierKindOfName(name: string): CarrierKind | null {
  if (name === PI_TYPE) return "pi";
  if (CTX_TYPES.has(name)) return "ctx";
  return null;
}

/**
 * The carrier a type node names when it is the BARE literal `ExtensionAPI` /
 * `ExtensionContext` / `ExtensionCommandContext` (a type-reference with no type
 * arguments), or `null`. A generic-applied form (`Pick<ExtensionAPI, ...>`) is
 * deliberately NOT a bare literal, so a `Pick`-narrowed structural cap is not a
 * carrier binding (bug 0373 §Fix).
 */
function bareCarrierLiteral(t: ts.TypeNode | undefined, sf: ts.SourceFile): CarrierKind | null {
  if (t === undefined || !ts.isTypeReferenceNode(t) || t.typeArguments !== undefined) return null;
  return carrierKindOfName(t.typeName.getText(sf).trim());
}

/**
 * The carrier a PARAMETER annotation wraps directly (bug 0373 §Fix, family-(4)
 * wrapped/intersected/union/generic-applied clause): a top-level type-operator
 * or generic wrapper carrying the bare carrier as a direct type-argument
 * (`Readonly<ExtensionAPI>`), a direct union/intersection member
 * (`ExtensionAPI & Mixin`), or the carrier's own generic application
 * (`ExtensionAPI<T>`). Bounded to the direct wrapping so a higher-order
 * signature whose INNER parameter is a canonical carrier (`(pi: ExtensionAPI)
 * => void`) is not itself flagged — its inner `pi` is the canonical carrier.
 */
function wrappedCarrierAnnotation(t: ts.TypeNode, sf: ts.SourceFile): CarrierKind | null {
  if (ts.isTypeReferenceNode(t)) {
    const own = carrierKindOfName(t.typeName.getText(sf).trim());
    if (own !== null && t.typeArguments !== undefined) return own;
    for (const ta of t.typeArguments ?? []) {
      const k = bareCarrierLiteral(ta, sf);
      if (k !== null) return k;
    }
    return null;
  }
  if (ts.isIntersectionTypeNode(t) || ts.isUnionTypeNode(t)) {
    for (const m of t.types) {
      const k = bareCarrierLiteral(m, sf);
      if (k !== null) return k;
    }
    return null;
  }
  if (ts.isTypeOperatorNode(t)) return bareCarrierLiteral(t.type, sf);
  return null;
}

/**
 * The carrier a declaration subtypes by naming it in `extends` / `implements` /
 * `&` position, or aliases directly (`type API = ExtensionAPI`). The generic
 * type-argument position is deliberately excluded, so `Pick<ExtensionAPI, ...>`
 * is not a subtype creation (bug 0373 §Fix).
 */
function subtypeCreationCarrier(n: ts.Node, sf: ts.SourceFile): CarrierKind | null {
  if (ts.isInterfaceDeclaration(n) || ts.isClassDeclaration(n)) {
    for (const h of n.heritageClauses ?? []) {
      for (const t of h.types) {
        const k = carrierKindOfName(t.expression.getText(sf).trim());
        if (k !== null) return k;
      }
    }
    return null;
  }
  if (ts.isTypeAliasDeclaration(n)) {
    const members = ts.isIntersectionTypeNode(n.type) ? [...n.type.types] : [n.type];
    for (const m of members) {
      const k = bareCarrierLiteral(m, sf);
      if (k !== null) return k;
    }
  }
  return null;
}

/** Verbatim node text truncated before any `{ ... }` body (declaration heads stay bounded). */
function declHeadText(n: ts.Node, sf: ts.SourceFile): string {
  const full = n.getText(sf);
  const brace = full.indexOf("{");
  return brace === -1 ? full : full.slice(0, brace).trim();
}

/**
 * True iff a `pi.<member>` / `ctx.<member>` property access is CAPTURED into a
 * durable binding rather than reached and used in place (bug 0373 §Fix
 * captured-rebinding context check). The prohibited scope is exactly the spec's
 * (audit-recognised-shapes.md family (4)): "any local variable, field, or
 * closure-captured binding ... whose initialiser is a reference to ... a
 * descendant member-access" — so a variable-declaration initialiser
 * (`const cwd = ctx.cwd`) or an `=` assignment RHS onto a variable/field
 * (`this.foo = ctx.foo`) is a capture, while an object-literal property value
 * (`{ modelRegistry: ctx.modelRegistry }` — in-place argument carriage at a
 * composition site, not a variable/field/closure binding) is NOT. A member
 * access that is the callee of a call (`pi.getFlag("x")`) has the CallExpression
 * as its parent and is likewise not a capture — the surface is reached through
 * the canonical carrier in place.
 */
function isCapturedRebinding(n: ts.PropertyAccessExpression): boolean {
  // Walk out through grouping / cast wrappers (`(pi.x)`, `pi.x as T`, `pi.x!`)
  // so a wrapped capture is still recognised (spec: "read broadly").
  let outer: ts.Node = n;
  while (outer.parent !== undefined && isOuterExprWrapperOf(outer.parent, outer)) {
    outer = outer.parent;
  }
  const p = outer.parent;
  if (p === undefined) return false;
  if (ts.isVariableDeclaration(p) && p.initializer === outer) return true;
  if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.EqualsToken && p.right === outer) {
    return true;
  }
  return false;
}

/** True iff `parent` is a grouping/cast wrapper whose wrapped operand is `child`. */
function isOuterExprWrapperOf(parent: ts.Node, child: ts.Node): boolean {
  if (ts.isParenthesizedExpression(parent)) return parent.expression === child;
  if (ts.isAsExpression(parent)) return parent.expression === child;
  if (ts.isSatisfiesExpression(parent)) return parent.expression === child;
  if (ts.isNonNullExpression(parent)) return parent.expression === child;
  if (ts.isTypeAssertionExpression(parent)) return parent.expression === child;
  return false;
}

/** Unwrap grouping/cast wrappers (`(x)`, `x as T`, `x satisfies T`, `x!`, `<T>x`) to the inner expression. */
function skipOuterWrappers(node: ts.Expression): ts.Expression {
  let cur = node;
  while (
    ts.isParenthesizedExpression(cur) ||
    ts.isAsExpression(cur) ||
    ts.isSatisfiesExpression(cur) ||
    ts.isNonNullExpression(cur) ||
    ts.isTypeAssertionExpression(cur)
  ) {
    cur = cur.expression;
  }
  return cur;
}

/**
 * Run the inventory-closure audit over an in-memory audited source tree.
 *
 * A static-AST walker (no TypeScript program load): each file is parsed with
 * `ts.createSourceFile`, and category-(1)/(2)/(3) references, the non-exemptible
 * family-(4) shapes, and `// allow-pi-surface:` markers are recognised by source
 * shape, resolved against the inventory + the two typebox sibling allow-lists +
 * same-line markers, and surfaced as `audit/<class>/<family>/<symptom>` records.
 * On every invocation it additionally emits the non-empty-scan canary's two
 * counters and exactly one `audit/canary/...` record.
 */
export function runInventoryClosureAudit(input: AuditInput): AuditResult {
  const inventory = input.inventory;
  const cat1Members = new Set(
    inventory.filter((e) => e.id.startsWith("pi.")).map((e) => rightmostSegment(e.id)),
  );
  const cat3Members = new Set(
    inventory
      .filter(
        (e) =>
          e.id.startsWith("ctx.") ||
          e.id.startsWith("ExtensionContext.") ||
          e.id.startsWith("ExtensionCommandContext."),
      )
      .map((e) => rightmostSegment(e.id)),
  );
  // Category-(2) leftmost-segment keys: only single-segment named-import entry
  // ids (a `pi.`/`ctx.`-prefixed member id is a carrier-member key, not a
  // named-import key, so it never resolves a category-(2) import).
  const cat2Names = new Set(
    inventory
      .filter((e) => !e.id.includes(".") || /^[A-Z]/.test(e.id))
      .map((e) => leftmostSegment(e.id)),
  );
  const typeboxNamed = new Set(input.typeboxNamedImportAllowList);
  const typeboxMembers = new Set(input.typeboxMemberAccessAllowList);

  const ordered: OrderedRecord[] = [];
  let walked = 0;
  let recognised = 0;

  const paths = [...input.files.keys()].sort();
  paths.forEach((path, fileIndex) => {
    walked += 1;
    const content = input.files.get(path) ?? "";
    const sf = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const lineOfPos = (pos: number): number =>
      sf.getLineAndCharacterOfPosition(pos).line + 1;

    // Lines carrying a non-exemptible family-(4) shape (clause-(h) + no-authorise).
    const familyFourLines = new Set<number>();

    const push = (
      pos: number,
      cls: AuditClass,
      family: string,
      symptom: string,
      line: string,
      symbol: string,
      proposedResolution: string,
    ): void => {
      ordered.push({
        record: {
          discriminator: `audit/${cls}/${family}/${symptom}`,
          path,
          line,
          symbol,
          proposedResolution,
        },
        fileIndex,
        pos,
      });
    };

    const emitFamilyFour = (pos: number, symptom: string, symbol: string): void => {
      const ln = lineOfPos(pos);
      familyFourLines.add(ln);
      recognised += 1;
      push(
        pos,
        "violation",
        "out-of-scope-shape",
        symptom,
        String(ln),
        singleLine(symbol),
        "rewrite-into-recognised-shape (see bump-step-2b-rewrite-shape)",
      );
    };

    // ---- Pass 1: family-(4) shapes (import/export/param shapes). ----
    const visitShapes = (n: ts.Node): void => {
      if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
        const spec = n.moduleSpecifier.text;
        if (isInScopeSpecifier(spec)) {
          const ic = n.importClause;
          if (!ic) {
            emitFamilyFour(n.getStart(sf), "side-effect-import", n.getText(sf));
          } else {
            if (ic.name) emitFamilyFour(n.getStart(sf), "default-import", n.getText(sf));
            if (ic.namedBindings && ts.isNamespaceImport(ic.namedBindings)) {
              emitFamilyFour(n.getStart(sf), "namespace-import", n.getText(sf));
            }
            if (ic.namedBindings && ts.isNamedImports(ic.namedBindings)) {
              for (const el of ic.namedBindings.elements) {
                if (el.propertyName) {
                  emitFamilyFour(n.getStart(sf), "aliased-import", n.getText(sf));
                }
              }
            }
          }
        }
      }
      if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
        const spec = n.moduleSpecifier.text;
        if (isInScopeSpecifier(spec)) {
          if (!n.exportClause) {
            emitFamilyFour(n.getStart(sf), "export-star", n.getText(sf));
          } else if (ts.isNamespaceExport(n.exportClause)) {
            emitFamilyFour(n.getStart(sf), "export-star", n.getText(sf));
          } else if (ts.isNamedExports(n.exportClause)) {
            for (const el of n.exportClause.elements) {
              if (el.propertyName) {
                emitFamilyFour(n.getStart(sf), "aliased-export", n.getText(sf));
              }
            }
          }
        }
      }
      // Dynamic import() of an in-scope package.
      if (
        ts.isCallExpression(n) &&
        n.expression.kind === ts.SyntaxKind.ImportKeyword &&
        n.arguments.length === 1
      ) {
        const arg = n.arguments[0];
        if (arg && ts.isStringLiteral(arg) && isInScopeSpecifier(arg.text)) {
          emitFamilyFour(n.getStart(sf), "dynamic-import", n.getText(sf));
        }
      }
      // Off-canonical parameter carriers.
      if (ts.isParameter(n) && ts.isIdentifier(n.name)) {
        const name = n.name.text;
        const ty = paramTypeText(n, sf);
        if (name === "ctx" && (ty === null || !CTX_TYPES.has(ty))) {
          emitFamilyFour(n.getStart(sf), "off-canonical-annotation-ctx", n.getText(sf));
        } else if (name !== "ctx" && ty !== null && CTX_TYPES.has(ty)) {
          emitFamilyFour(n.getStart(sf), "off-canonical-name-ctx", n.getText(sf));
        }
        if (name === "pi" && ty !== null && ty !== PI_TYPE) {
          emitFamilyFour(n.getStart(sf), "off-canonical-annotation-pi", n.getText(sf));
        } else if (name !== "pi" && ty === PI_TYPE) {
          emitFamilyFour(n.getStart(sf), "off-canonical-name-pi", n.getText(sf));
        }
      }
      // Destructured carrier parameter: `function f({ ui }: ExtensionContext)`.
      if (ts.isParameter(n) && !ts.isIdentifier(n.name) && bareCarrierLiteral(n.type, sf) !== null) {
        emitFamilyFour(n.getStart(sf), "destructured-carrier", n.getText(sf));
      }
      // Wrapped / intersected / union / generic-applied carrier annotation on a
      // non-canonical-named parameter (canonical `pi`/`ctx` names route to the
      // off-canonical-annotation arms above).
      if (ts.isParameter(n) && ts.isIdentifier(n.name) && n.type !== undefined) {
        const pname = n.name.text;
        if (pname !== "pi" && pname !== "ctx" && bareCarrierLiteral(n.type, sf) === null) {
          const wrapped = wrappedCarrierAnnotation(n.type, sf);
          if (wrapped !== null) emitFamilyFour(n.getStart(sf), "wrapped-annotation", n.getText(sf));
        }
      }
      // Type-parameter constraint laundering: `function wrap<C extends ExtensionContext>(c: C)`.
      if (ts.isTypeParameterDeclaration(n) && bareCarrierLiteral(n.constraint, sf) !== null) {
        emitFamilyFour(n.getStart(sf), "type-parameter-constraint", n.getText(sf));
      }
      // Subtype creation in extends / implements / & position, and pure carrier aliases.
      if (subtypeCreationCarrier(n, sf) !== null) {
        emitFamilyFour(n.getStart(sf), "subtype-creation", declHeadText(n, sf));
      }
      // Non-parameter carrier binding: a class field or `const`/`let`/`var`
      // whose explicit annotation is the bare carrier literal (interface /
      // object-type PROPERTY SIGNATURES are not `PropertyDeclaration`s and are
      // out of this clause). `deps.pi` object-type carriage is unaffected.
      if (
        (ts.isPropertyDeclaration(n) || ts.isVariableDeclaration(n)) &&
        bareCarrierLiteral(n.type, sf) !== null
      ) {
        emitFamilyFour(n.getStart(sf), "non-parameter-binding", n.getText(sf));
      }
      // Computed access `pi[..]` / `ctx[..]` on a canonical carrier identifier.
      if (ts.isElementAccessExpression(n) && ts.isIdentifier(n.expression)) {
        const recv = n.expression.text;
        if ((recv === "pi" && inPiCarrier(n)) || (recv === "ctx" && inCtxCarrier(n))) {
          emitFamilyFour(n.getStart(sf), "computed-access", n.getText(sf));
        }
      }
      // Namespace destructuring `const { ui } = ctx` and whole-carrier value-binding
      // aliases `const c = ctx` / `const api = pi` (initialiser is the bare carrier).
      if (ts.isVariableDeclaration(n) && n.initializer !== undefined) {
        const init = skipOuterWrappers(n.initializer);
        const recv = ts.isIdentifier(init) ? init.text : "";
        const inCarrier =
          (recv === "pi" && inPiCarrier(init)) || (recv === "ctx" && inCtxCarrier(init));
        if (inCarrier) {
          if (ts.isObjectBindingPattern(n.name) || ts.isArrayBindingPattern(n.name)) {
            emitFamilyFour(n.getStart(sf), "namespace-destructuring", n.getText(sf));
          } else {
            emitFamilyFour(n.getStart(sf), "captured-rebinding", n.getText(sf));
          }
        }
      }
      // Captured rebinding via `=` assignment of the bare carrier: `this.pi = pi`.
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const rhs = skipOuterWrappers(n.right);
        const recv = ts.isIdentifier(rhs) ? rhs.text : "";
        if ((recv === "pi" && inPiCarrier(rhs)) || (recv === "ctx" && inCtxCarrier(rhs))) {
          emitFamilyFour(n.getStart(sf), "captured-rebinding", n.getText(sf));
        }
      }
      // `Object.assign(..., pi)` spread of a canonical carrier.
      if (
        ts.isCallExpression(n) &&
        ts.isPropertyAccessExpression(n.expression) &&
        ts.isIdentifier(n.expression.expression) &&
        n.expression.expression.text === "Object" &&
        n.expression.name.text === "assign"
      ) {
        for (const arg of n.arguments) {
          if (
            ts.isIdentifier(arg) &&
            ((arg.text === "pi" && inPiCarrier(arg)) || (arg.text === "ctx" && inCtxCarrier(arg)))
          ) {
            emitFamilyFour(n.getStart(sf), "object-assign", n.getText(sf));
            break;
          }
        }
      }
      // `keyof typeof pi` / `keyof typeof ctx` in a canonical carrier scope.
      if (
        ts.isTypeOperatorNode(n) &&
        n.operator === ts.SyntaxKind.KeyOfKeyword &&
        ts.isTypeQueryNode(n.type) &&
        ts.isIdentifier(n.type.exprName)
      ) {
        const recv = n.type.exprName.text;
        if ((recv === "pi" && inPiCarrier(n)) || (recv === "ctx" && inCtxCarrier(n))) {
          emitFamilyFour(n.getStart(sf), "keyof-typeof", n.getText(sf));
        }
      }
      // CJS reach: `require("<in-scope>")` and `createRequire(...)("<in-scope>")`.
      // The `createRequire(...).resolve("<spec>")` path-read is carved out (its
      // callee is a `.resolve` property access, matched by neither arm).
      if (ts.isCallExpression(n)) {
        const arg0 = n.arguments[0];
        if (arg0 !== undefined && ts.isStringLiteral(arg0) && isInScopeSpecifier(arg0.text)) {
          const bareRequire = ts.isIdentifier(n.expression) && n.expression.text === "require";
          // `createRequire(...)("<spec>")` and `M.createRequire(...)("<spec>")` —
          // the callee is a call whose OWN callee names `createRequire` (bare or
          // via a `module` namespace import). Aliased-binding indirection needs
          // data-flow and is the spec's type-aware MAY, out of this static arm.
          const createRequireCall =
            ts.isCallExpression(n.expression) &&
            ((ts.isIdentifier(n.expression.expression) &&
              n.expression.expression.text === "createRequire") ||
              (ts.isPropertyAccessExpression(n.expression.expression) &&
                n.expression.expression.name.text === "createRequire"));
          if (bareRequire || createRequireCall) {
            emitFamilyFour(n.getStart(sf), "cjs-require", n.getText(sf));
          }
        }
      }
      ts.forEachChild(n, visitShapes);
    };
    visitShapes(sf);

    // ---- Pass 3: collect category-(1)/(2)/(3) references (emitted in pass 4). ----
    interface Ref {
      readonly pos: number;
      readonly line: number;
      /** Bug 0374 §Fix: the line(s) a marker may trail to authorise this ref (the per-shape originating-line map). */
      readonly authLines: readonly number[];
      readonly family: string;
      readonly resolved: boolean;
      readonly symbol: string;
      readonly proposedResolution: string;
    }
    const refs: Ref[] = [];
    // Bug 0374 §Fix: physical lines that are a NON-originating line of a
    // recognised multi-line member-access surface span — a well-formed marker
    // trailing one is off-originating-line (malformed clause (e)).
    const clauseELines = new Set<number>();
    const resolveRef = (
      pos: number,
      family: string,
      resolvedByInventoryOrAllowList: boolean,
      symbol: string,
      proposedResolution: string,
      authLines?: readonly number[],
    ): void => {
      recognised += 1;
      const line = lineOfPos(pos);
      refs.push({
        pos,
        line,
        authLines: authLines ?? [line],
        family,
        resolved: resolvedByInventoryOrAllowList,
        symbol,
        proposedResolution,
      });
    };

    // Is `Type` imported from typebox anywhere in this file (carrier for the
    // typebox member-access carve-out)?
    let typeboxTypeIsImported = false;
    const scanTypeImport = (n: ts.Node): void => {
      if (
        ts.isImportDeclaration(n) &&
        ts.isStringLiteral(n.moduleSpecifier) &&
        isTypebox(n.moduleSpecifier.text)
      ) {
        const ic = n.importClause;
        if (ic && ic.namedBindings && ts.isNamedImports(ic.namedBindings)) {
          for (const el of ic.namedBindings.elements) {
            if (!el.propertyName && el.name.text === "Type") typeboxTypeIsImported = true;
          }
        }
      }
      ts.forEachChild(n, scanTypeImport);
    };
    scanTypeImport(sf);

    // Category (2): named imports from the four peers + typebox.
    const visitRefs = (n: ts.Node): void => {
      if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
        const spec = n.moduleSpecifier.text;
        const ic = n.importClause;
        if (ic && ic.namedBindings && ts.isNamedImports(ic.namedBindings)) {
          // Bug 0374 §Fix rule (ii)/(iv): a named import is authorised by a marker
          // on EITHER the specifier's own line OR the `import`-keyword line.
          const importKwLine = lineOfPos(n.getStart(sf));
          for (const el of ic.namedBindings.elements) {
            if (el.propertyName) continue; // aliased → family (4), handled in pass 1
            const nm = el.name.text;
            const authLines = [lineOfPos(el.getStart(sf)), importKwLine];
            if (isTypebox(spec)) {
              resolveRef(
                el.getStart(sf),
                "peer-import",
                typeboxNamed.has(nm),
                `typebox#${nm}`,
                "promote-to-typebox-named-allow-list-or-add-allow-pi-surface-marker",
                authLines,
              );
            } else if (isPeerPackage(spec)) {
              resolveRef(
                el.getStart(sf),
                "peer-import",
                cat2Names.has(nm),
                `${spec}#${nm}`,
                "promote-to-inventory-or-add-allow-pi-surface-marker (see bump-step-2b-promote)",
                authLines,
              );
            }
          }
        }
      }
      // Member access on the canonical `pi` / `ctx` carriers, and typebox `Type`.
      if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression)) {
        const recv = n.expression.text;
        const member = n.name.text;
        if (recv === "pi" && inPiCarrier(n)) {
          if (isCapturedRebinding(n)) {
            // The member is captured into a binding rather than reached in place
            // (bug 0373 §Fix): family (4), not a category-(1) reference.
            emitFamilyFour(n.getStart(sf), "captured-rebinding", n.getText(sf));
          } else {
            // Bug 0374 §Fix rule (i): a `pi.<member>` split across lines
            // originates on the property line; a marker on the `pi` line is
            // off-originating-line (clause (e)).
            const memberLine = lineOfPos(n.name.getStart(sf));
            const carrierLine = lineOfPos(n.expression.getStart(sf));
            if (carrierLine !== memberLine) clauseELines.add(carrierLine);
            resolveRef(
              n.name.getStart(sf),
              "pi-member",
              cat1Members.has(member),
              member,
              "promote-to-inventory-or-add-allow-pi-surface-marker (see bump-step-2b-promote)",
            );
          }
        } else if (recv === "ctx" && inCtxCarrier(n)) {
          if (isCapturedRebinding(n)) {
            emitFamilyFour(n.getStart(sf), "captured-rebinding", n.getText(sf));
          } else {
            // Bug 0374 §Fix rule (iii): a `ctx`-rooted chain originates on the
            // `ctx` identifier line (deliberately asymmetric with rule (i)); a
            // marker on any property line of the chain is off-originating-line.
            const ctxLine = lineOfPos(n.expression.getStart(sf));
            const memberLine = lineOfPos(n.name.getStart(sf));
            if (memberLine !== ctxLine) clauseELines.add(memberLine);
            resolveRef(
              n.expression.getStart(sf),
              "ctx-member",
              cat3Members.has(member),
              member,
              "promote-to-inventory-or-add-allow-pi-surface-marker (see bump-step-2b-promote)",
            );
          }
        } else if (recv === "Type" && typeboxTypeIsImported) {
          resolveRef(
            n.name.getStart(sf),
            "peer-import",
            typeboxMembers.has(member),
            `typebox#Type.${member}`,
            "promote-to-typebox-member-allow-list-or-add-allow-pi-surface-marker",
          );
        }
      }
      ts.forEachChild(n, visitRefs);
    };

    visitRefs(sf);

    // Bug 0374 §Fix: the REAL comment trivia by line. Comment RANGES (leading /
    // trailing trivia between tokens) treat a whole `/** ... */` block as one
    // range, so a `// allow-pi-surface` quoted inside a block comment's or a
    // line comment's prose is never a separate marker candidate. The trailing /
    // last comment on a line wins.
    const commentByLine = new Map<number, string>();
    const seenComment = new Set<number>();
    const recordComment = (range: ts.CommentRange): void => {
      if (seenComment.has(range.pos)) return;
      seenComment.add(range.pos);
      commentByLine.set(lineOfPos(range.pos), content.slice(range.pos, range.end));
    };
    const collectComments = (node: ts.Node): void => {
      for (const range of ts.getLeadingCommentRanges(content, node.getFullStart()) ?? []) {
        recordComment(range);
      }
      for (const range of ts.getTrailingCommentRanges(content, node.getEnd()) ?? []) {
        recordComment(range);
      }
      // `getChildren` (not `forEachChild`) descends into punctuation tokens too
      // (`}`, `,`), so a marker trailing the last specifier before a closing
      // brace on a multi-line import is captured as that brace's leading trivia.
      for (const child of node.getChildren(sf)) collectComments(child);
    };
    collectComments(sf);

    // ---- Pass 2: markers over every real comment line (bug 0374 §Fix). A well-formed
    // marker authorises the UNRESOLVED in-scope references whose originating line
    // it trails (inventory-first resolution short-circuits before the marker, so
    // an all-resolved line is (s2)); malformed grammar (a)-(g), off-originating-
    // line placement (e), family-(4)-line placement (h), and the two stale
    // sub-kinds (s1)/(s2) each route to family (5) under their own token. ----
    const authorisedLines = new Set<number>();
    const refsByAuthLine = new Map<number, Ref[]>();
    for (const r of refs) {
      for (const ln of r.authLines) {
        const bucket = refsByAuthLine.get(ln);
        if (bucket === undefined) refsByAuthLine.set(ln, [r]);
        else bucket.push(r);
      }
    }
    const emitFamilyFive = (pos: number, ln: number, symptom: string, resolution: string): void => {
      push(pos, "violation", "stale-or-malformed-marker", symptom, String(ln), NA, resolution);
    };
    const STALE = "see bump-step-2b-stale-rewrite";
    for (const [ln, commentText] of commentByLine) {
      const verdict = classifyMarker(commentText);
      if (verdict.kind === "none") continue;
      const pos = sf.getPositionOfLineAndCharacter(ln - 1, 0);
      if (verdict.kind === "malformed") {
        emitFamilyFive(pos, ln, MALFORMED_CLAUSE_TOKEN[verdict.clause], `rewrite-marker-grammar (${STALE})`);
        continue;
      }
      // Clause (h): a marker on a non-exemptible family-(4) line; the family-(4)
      // record fires independently in pass 1 (dual emission).
      if (familyFourLines.has(ln)) {
        emitFamilyFive(pos, ln, "marker-on-non-exemptible-family-4-line", `delete-marker-and-rewrite-shape (${STALE})`);
        continue;
      }
      const attributed = refsByAuthLine.get(ln) ?? [];
      if (attributed.length > 0) {
        if (attributed.every((r) => r.resolved)) {
          // (s2) all-in-inventory: every reference this line authorises already
          // resolves upstream, so the marker authorises nothing.
          emitFamilyFive(pos, ln, "all-in-inventory", `delete-stale-marker-surface-now-in-inventory (${STALE})`);
        } else {
          authorisedLines.add(ln);
        }
        continue;
      }
      // Clause (e): a marker on a non-originating line of a multi-line surface.
      if (clauseELines.has(ln)) {
        emitFamilyFive(pos, ln, "off-originating-line", `move-marker-to-originating-line (${STALE})`);
        continue;
      }
      // (s1) no-surface-on-line: a well-formed marker on a line carrying zero
      // recognised in-scope references (placement error or all-removed leftover).
      emitFamilyFive(pos, ln, "no-surface-on-line", `delete-stale-marker-no-surface-on-line (${STALE})`);
    }

    // ---- Pass 4: emit reference violations (skip resolved / marker-authorised). ----
    for (const r of refs) {
      if (r.resolved) continue;
      if (r.authLines.some((ln) => authorisedLines.has(ln))) continue;
      push(r.pos, "violation", r.family, "off-inventory", String(r.line), r.symbol, r.proposedResolution);
    }
  });

  // ---- Non-empty-scan canary (fail-closed, once per invocation). ----
  const canaryOk = walked > 0 && recognised > 0;
  ordered.push({
    record: {
      discriminator: canaryOk
        ? "audit/canary/scan-floor/ok"
        : recognised === 0
          ? "audit/canary/scan-floor/recognised-zero"
          : "audit/canary/scan-floor/walked-zero",
      path: NA,
      line: NA,
      symbol: NA,
      proposedResolution: `walked=${walked} recognised=${recognised}`,
    },
    // Sort the canary after every violation record.
    fileIndex: Number.MAX_SAFE_INTEGER,
    pos: Number.MAX_SAFE_INTEGER,
  });

  ordered.sort((a, b) => a.fileIndex - b.fileIndex || a.pos - b.pos);
  return { records: ordered.map((o) => o.record), walked, recognised };
}

/**
 * Serialise one audit record to its line-delimited wire form
 * (audit-wire-and-canary.md §"Wire serialisation"): the
 * `audit/<class>/<family>/<symptom>` discriminator, then a single ASCII tab,
 * then the `path:line` segment, then a tab, then `symbol`, then a tab, then
 * `proposed-resolution` — four tab-delimited fields, no trailing newline.
 */
export function formatAuditRecordLine(r: AuditRecord): string {
  return [r.discriminator, `${r.path}:${r.line}`, r.symbol, r.proposedResolution].join("\t");
}

/** True iff `node` is inside a function whose parameter is a `pi: ExtensionAPI` carrier. */
function inPiCarrier(node: ts.Node): boolean {
  return hasCarrierAncestor(node, "pi", (ty) => ty === PI_TYPE);
}

/** True iff `node` is inside a function whose parameter is a canonical `ctx` carrier. */
function inCtxCarrier(node: ts.Node): boolean {
  return hasCarrierAncestor(node, "ctx", (ty) => ty !== null && CTX_TYPES.has(ty));
}

function hasCarrierAncestor(
  node: ts.Node,
  name: string,
  typeOk: (ty: string | null) => boolean,
): boolean {
  let cur: ts.Node | undefined = node;
  while (cur) {
    if (
      ts.isFunctionDeclaration(cur) ||
      ts.isFunctionExpression(cur) ||
      ts.isArrowFunction(cur) ||
      ts.isMethodDeclaration(cur) ||
      ts.isConstructorDeclaration(cur)
    ) {
      for (const p of cur.parameters) {
        if (ts.isIdentifier(p.name) && p.name.text === name) {
          const sf = cur.getSourceFile();
          return typeOk(p.type ? p.type.getText(sf).trim() : null);
        }
      }
    }
    cur = cur.parent;
  }
  return false;
}
