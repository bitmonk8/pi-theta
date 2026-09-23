// Identifier-resolution parse checker (`theta/parse/unknown-identifier`,
// `theta/parse/type-as-value`) for the V19a parser seam (theta-document.ts):
// the whole-file identifier root scope (`collectIdentRoots`) and the
// REQ-EXPR-7 unknown-identifier walk (expressions.md §"Identifier
// resolution") over the parsed body.

import type { Diagnostic, SourceRange } from "../diagnostics/diagnostic";
import type { ParsedFrontmatter } from "./frontmatter";
import { BUILTIN_VALUE_NAMES } from "./annotation-validation";
import { collectPatternBinderNames as collectPatternBindings } from "./match-result";
import type { Block, Expr, Stmt } from "./theta-ast";
// Shared document-seam helpers (theta-document.ts's own export-block comment:
// sibling modules call them only during parsing, never during module
// initialisation — the same two-way seam structural-checks.ts already rides).
import { callWithClauseValues, toolCallableName } from "./theta-document";

/**
 * Build the whole-file identifier root scope: every name visible everywhere in
 * the body regardless of source order — hoisted top-level `fn` names, `schema` /
 * `enum` names, imported symbols, `params:` field names, resolved
 * `tools:` callable names, and the stdlib builtins. Theta-level `let` bindings are
 * NOT roots (they bind sequentially and are accumulated as the walk descends).
 *
 * This one fold is deliberately coarser than either of its two callers' own
 * question, because it answers a THIRD, shared one — "is this name bound at
 * all, anywhere in the file" — and each caller narrows it differently. Bug
 * 0197's `checkParamsDefaultNames` reads this set exactly as built, once, over
 * every statement: its own question is whether a `params:` default's head
 * resolves at all, and a `schema` / `enum` name resolving is the right answer
 * to THAT question. `checkUnknownIdentifiers` asks a finer one —
 * `expressions.md` §"Identifier resolution" states four resolution arms and
 * names no declaration form, so a `schema` / `enum` name is not itself an arm
 * — and reads this set a SECOND time, over a `schema`/`enum`-free statement
 * list, to recover the value-binding sources alone; see its own doc comment
 * for the three-way judgement that produces.
 */
export function collectIdentRoots(
  statements: readonly Stmt[],
  frontmatter: ParsedFrontmatter | null,
): Set<string> {
  const roots = new Set<string>(BUILTIN_VALUE_NAMES);
  for (const s of statements) {
    switch (s.kind) {
      case "fn":
      case "schema":
      case "enum":
        roots.add(s.name);
        break;
      case "import":
        // expressions.md §"Identifier resolution" arm (3) is "a symbol
        // imported from a `.thetalib` file" — an `export` specifier creates
        // no local binding (imports.md §"Re-exports"), so it must not seed a
        // name this whole-file scope treats as bound.
        for (const sym of s.symbols) {
          roots.add(sym);
        }
        break;
      default:
        break;
    }
  }
  if (frontmatter !== null) {
    for (const f of frontmatter.params?.fields ?? []) {
      roots.add(f.wireName);
    }
    for (const entry of frontmatter.tools ?? []) {
      const name = toolCallableName(entry);
      if (name.length > 0) {
        roots.add(name);
      }
    }
  }
  return roots;
}

/**
 * The per-parse walk state `checkUnknownIdentifiers` threads through
 * `walkIdentBlock` / `walkIdentStmt` / `walkIdentExpr` in place of a bare
 * `ReadonlySet<string>` root scope (mirrors the sibling `CallSiteWalkContext`
 * / `walkCtx` convention the lexical call-site walk (lexical-call-sites.ts) uses, for the same
 * naming reason: a parameter literally named `ctx` collides with the
 * pi-integration-contract inventory audit's canonical-carrier convention for
 * that spelling). `roots` alone answers "does this name resolve at all" — the
 * question `collectIdentRoots` was built for, and the one
 * `checkParamsDefaultNames` still asks against its OWN, byte-unchanged call to
 * that function. This walk needs a second question for a name `roots` does
 * not itself resolve: is it declared as a `schema` / `enum` and nothing else?
 * `typeOnlyNames` and `declaredEnums` answer exactly that, without touching
 * `collectIdentRoots` or its first call.
 */
export interface IdentWalkContext {
  /**
   * Every name a genuine value-binding source contributes: `collectIdentRoots`
   * run over the statement list with `schema` / `enum` declarations filtered
   * OUT, so a `fn`, an imported symbol, a `params:` field, a resolved
   * `tools:` callable, and the stdlib builtins all still seed scope exactly
   * as before, and a name only a `schema` or `enum` declares does not.
   */
  readonly roots: ReadonlySet<string>;
  /**
   * Every `schema` / `enum` name this file declares that `roots` does NOT
   * also claim — a name a declaration introduces and no value-binding source
   * also binds. `bodyTypes.imports` is deliberately excluded from the
   * candidates this set is built from: an imported symbol is resolution arm
   * (3) (expressions.md:48), a genuine value, not a type-only name.
   */
  readonly typeOnlyNames: ReadonlySet<string>;
  /**
   * Declared `enum` names (`bodyTypes.enums`), read only by the `member` arm
   * below. `Enum.Variant` access is licensed at the same identifier-
   * resolution site a bare value read would use (expressions.md:22), so the
   * licence has to except the receiver there rather than by leaving the
   * enum's name in `roots` — which would also silence a bare `enum` name used
   * as a value. A declared SCHEMA receiver has no bare-member form to license
   * and keeps firing.
   */
  readonly declaredEnums: ReadonlySet<string>;
}

/**
 * The syntactic position `emitUnknownIdentifier` found a bare identifier at.
 * Read only for a name in `IdentWalkContext.typeOnlyNames` — every other name
 * is refused, or not, exactly as before this type existed, at every site.
 */
type IdentSite = "value" | "call" | "discarded";

/**
 * Resolve every identifier the walk reaches against three possibilities, not
 * the plain in-scope / not-in-scope test this pass answered before. A name in
 * `walkCtx.roots` — a `params:` field, a `let` binding, a top-level `fn`, an
 * imported symbol, a resolved `tools:` callable, or a stdlib builtin, each a
 * resolution arm `expressions.md` §"Identifier resolution" states (`:46–49`)
 * — is silent. A name that is NOT one of those arms but IS a declared
 * `schema` or `enum` (`walkCtx.typeOnlyNames`) is `theta/parse/type-as-value`
 * at a VALUE position — a declaration introduces a named type
 * (`schemas.md:3`) and matches no arm, the same ground FN-1
 * (`functions.md:20`) already refuses a bare `fn` name on — silent at a
 * DISCARDED expression-statement position (the no-op-statement class bug
 * 0033 / bug 0042 pinned), and `theta/parse/unknown-identifier` at a CALL
 * position: `:44` scopes the four-arm list to call position by its own
 * sentence, and a declaration fails it there exactly as an undeclared name
 * does. Every other name — resolving to no arm and no declaration — is
 * `theta/parse/unknown-identifier` regardless of position (`:51`).
 *
 * Scope is tracked block-locally: `let` bindings accumulate in declaration
 * order, nested blocks inherit a copy, and a `fn` body sees only the
 * whole-file roots plus its own parameters (theta 1.0 has no closures). Only
 * names the walk actually reaches in an identifier / call-callee /
 * member-or-method receiver position are checked; schema-constructor names,
 * member field names, method names, object keys, and `${…}` template
 * interpolations are not identifier-resolution sites here.
 */
export function checkUnknownIdentifiers(
  body: Block,
  walkCtx: IdentWalkContext,
  file: string,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  walkIdentBlock(body, new Set(walkCtx.roots), walkCtx, file, out);
  return out;
}

/**
 * The sink every identifier-resolution judgement in this walk funnels
 * through, so the three-way rule `checkUnknownIdentifiers`'s doc comment
 * states is decided in exactly one place. The scope-shadow test runs FIRST
 * and is unconditional: a `let`, a parameter, a `for` / `match` binder, a
 * `params:` field, or a callable-set entry sharing the declaration's spelling
 * is already IN `scope` by the time its own reads are walked, so it wins over
 * the declaration wherever it is in scope, whatever the name is ALSO declared
 * as (bug 0126 group (d); bug 0050's u9b / u9c / u13 rows) — this is why the
 * test is unchanged from before this code existed. Past it, `site` matters
 * only for a name in `walkCtx.typeOnlyNames`: `"value"` refuses it,
 * `"discarded"` leaves it silent, and `"call"` falls through unchanged to the
 * push below.
 */
function emitUnknownIdentifier(
  name: string,
  range: SourceRange,
  scope: ReadonlySet<string>,
  walkCtx: IdentWalkContext,
  file: string,
  out: Diagnostic[],
  site: IdentSite = "value",
): void {
  if (name.length === 0 || name === "_" || scope.has(name)) {
    return;
  }
  if (walkCtx.typeOnlyNames.has(name)) {
    if (site === "discarded") {
      return;
    }
    if (site === "value") {
      out.push({
        severity: "error",
        code: "theta/parse/type-as-value",
        file,
        range,
        message: `type '${name}' used as a value; a schema or enum declaration names a type, not a value`,
      });
      return;
    }
  }
  out.push({
    severity: "error",
    code: "theta/parse/unknown-identifier",
    file,
    range,
    message: `unknown identifier '${name}'`,
  });
}

/**
 * Refuse a reassignment TARGET that resolves against no value binding (bug 0370
 * §Fix F6). A write target is NOT a value read: unlike `emitUnknownIdentifier`'s
 * `"value"` site, a type-only `schema` / `enum` name here resolves to no value
 * binding to write, so it is `unknown-identifier`, never the read-position
 * `type-as-value` (which stays firing for genuine RHS reads through the
 * read-oriented emitter). `_` is the discard context, refused at `buildReassign`
 * as `immutable-rebinding`, so the target arm stays silent for it.
 */
function emitReassignTargetUnknown(
  target: string,
  range: SourceRange,
  file: string,
  out: Diagnostic[],
): void {
  if (target.length === 0 || target === "_") {
    return;
  }
  out.push({
    severity: "error",
    code: "theta/parse/unknown-identifier",
    file,
    range,
    message: `unknown identifier '${target}'`,
  });
}

function walkIdentBlock(
  block: Block,
  scope: Set<string>,
  walkCtx: IdentWalkContext,
  file: string,
  out: Diagnostic[],
): void {
  for (const s of block.statements) {
    walkIdentStmt(s, scope, walkCtx, file, out);
  }
  if (block.tail !== null) {
    walkIdentExpr(block.tail, scope, walkCtx, file, out);
  }
}

function walkIdentStmt(
  s: Stmt,
  scope: Set<string>,
  walkCtx: IdentWalkContext,
  file: string,
  out: Diagnostic[],
): void {
  switch (s.kind) {
    case "let":
      if (s.init !== null) {
        walkIdentExpr(s.init, scope, walkCtx, file, out);
      }
      if (s.name !== "_") {
        scope.add(s.name);
      }
      return;
    case "reassign": {
      walkIdentExpr(s.value, scope, walkCtx, file, out);
      // The TARGET resolves against the same scope reads use (bug 0370 §Fix
      // layer 1): an in-scope target (a `let`, a parameter, a `for` / `par for`
      // / `match` binder, or a `params:` field already added to `scope`) is
      // silent here — `buildReassign` handled its immutability, if any. An
      // out-of-scope target `buildReassign` already refused as immutable carries
      // `immutableRebindingEmitted`, the EXACT signal that the immutability
      // check fired (G6); the walk defers to it rather than ALSO drawing
      // `unknown-identifier`. A write `buildReassign` drew nothing on — an
      // order-reversed write to a later `let` (F2), or a redeclared name whose
      // shadowing `let mut` made `buildReassign` see a mutable target — has the
      // flag unset, so the walk refuses it. Every other out-of-scope or
      // undeclared target is genuinely unresolvable.
      if (!scope.has(s.target) && !s.immutableRebindingEmitted) {
        emitReassignTargetUnknown(s.target, s.range, file, out);
      }
      return;
    }
    case "if": {
      walkIdentExpr(s.condition, scope, walkCtx, file, out);
      walkIdentBlock(s.then, new Set(scope), walkCtx, file, out);
      if (s.otherwise !== null) {
        if ("statements" in s.otherwise) {
          walkIdentBlock(s.otherwise, new Set(scope), walkCtx, file, out);
        } else {
          walkIdentStmt(s.otherwise, new Set(scope), walkCtx, file, out);
        }
      }
      return;
    }
    case "while":
      walkIdentExpr(s.condition, scope, walkCtx, file, out);
      walkIdentBlock(s.body, new Set(scope), walkCtx, file, out);
      return;
    case "for": {
      walkIdentExpr(s.iterand, scope, walkCtx, file, out);
      const inner = new Set(scope);
      inner.add(s.variable);
      walkIdentBlock(s.body, inner, walkCtx, file, out);
      return;
    }
    case "fn": {
      // A `fn` body is closure-free: it sees only the whole-file roots plus its
      // own parameters, NOT the enclosing theta-level `let` bindings.
      const fnScope = new Set(walkCtx.roots);
      for (const p of s.params) {
        fnScope.add(p.name);
      }
      walkIdentBlock(s.body, fnScope, walkCtx, file, out);
      return;
    }
    case "return":
      if (s.operand !== null) {
        walkIdentExpr(s.operand, scope, walkCtx, file, out);
      }
      return;
    case "query":
      walkIdentExpr(s.query, scope, walkCtx, file, out);
      return;
    case "tool-call":
      walkIdentExpr(s.call, scope, walkCtx, file, out);
      return;
    case "invoke":
      walkIdentExpr(s.invoke, scope, walkCtx, file, out);
      return;
    case "expr":
      // A DISCARDED expression statement — the no-op-statement class bug 0033
      // / bug 0042 pinned silent for a bare declared name; an undeclared name
      // at the same position is unaffected and still resolves to nothing
      // (the walk's own contrast row over this same class).
      walkIdentExpr(s.expr, scope, walkCtx, file, out, "discarded");
      return;
    default:
      // schema / enum / import / export / break / continue / doc-comment carry
      // no identifier-resolution sites.
      return;
  }
}

function walkIdentExpr(
  e: Expr,
  scope: Set<string>,
  walkCtx: IdentWalkContext,
  file: string,
  out: Diagnostic[],
  site: IdentSite = "value",
): void {
  switch (e.kind) {
    case "ident":
      emitUnknownIdentifier(e.name, e.range, scope, walkCtx, file, out, site);
      return;
    case "call":
      // The callee is a bare identifier in CALL position (expressions.md:44);
      // a name in `typeOnlyNames` still falls through to `unknown-identifier`
      // here — the value-position refusal is a different sentence
      // (imports.md:50) for a different position.
      emitUnknownIdentifier(e.callee, e.range, scope, walkCtx, file, out, "call");
      // RFC 0009: identifiers inside a call-site `with` clause value resolve as
      // an argument's do.
      for (const arg of [...e.args, ...callWithClauseValues(e)]) {
        walkIdentExpr(arg, scope, walkCtx, file, out);
      }
      return;
    case "binary":
      walkIdentExpr(e.left, scope, walkCtx, file, out);
      walkIdentExpr(e.right, scope, walkCtx, file, out);
      return;
    case "ternary":
      walkIdentExpr(e.condition, scope, walkCtx, file, out);
      walkIdentExpr(e.consequent, scope, walkCtx, file, out);
      walkIdentExpr(e.alternate, scope, walkCtx, file, out);
      return;
    case "try":
      walkIdentExpr(e.operand, scope, walkCtx, file, out);
      return;
    case "invoke":
      // The callee path is a string literal, not an identifier.
      for (const arg of [...e.args, ...callWithClauseValues(e)]) {
        walkIdentExpr(arg, scope, walkCtx, file, out);
      }
      return;
    case "member":
      // The receiver is an identifier-resolution site; the `.field` name is
      // not. A receiver naming a declared ENUM is `Enum.Variant` access
      // (expressions.md:22), licensed here ahead of the walk; a declared
      // SCHEMA receiver has no such licensed bare-member form and keeps
      // firing.
      if (e.target.kind === "ident" && walkCtx.declaredEnums.has(e.target.name)) {
        return;
      }
      walkIdentExpr(e.target, scope, walkCtx, file, out);
      return;
    case "index":
      walkIdentExpr(e.target, scope, walkCtx, file, out);
      walkIdentExpr(e.index, scope, walkCtx, file, out);
      return;
    case "method-call":
      // The receiver is a resolution site; the method name is A2's concern.
      walkIdentExpr(e.target, scope, walkCtx, file, out);
      for (const arg of e.args) {
        walkIdentExpr(arg, scope, walkCtx, file, out);
      }
      return;
    case "object":
      // The constructor / object keys are not value-position identifiers.
      for (const field of e.fields) {
        walkIdentExpr(field.value, scope, walkCtx, file, out);
      }
      return;
    case "array":
      for (const el of e.elements) {
        walkIdentExpr(el, scope, walkCtx, file, out);
      }
      return;
    case "result-ctor":
      walkIdentExpr(e.arg, scope, walkCtx, file, out);
      return;
    case "match":
      walkIdentExpr(e.scrutinee, scope, walkCtx, file, out);
      for (const arm of e.arms) {
        const armScope = new Set(scope);
        collectPatternBindings(arm.pattern, armScope);
        walkIdentExpr(arm.body, armScope, walkCtx, file, out);
      }
      return;
    case "par-for": {
      // The body inherits a COPY of the enclosing scope, not `walkCtx.roots`:
      // CTRL-4 (control-flow.md:76) states outer bindings and the loop
      // variable are both readable inside a `par for` body, so the `fn`
      // arm's whole-file reseeding above is not the model here. Traversal
      // order (iterand, then `max`, then body) mirrors `walkCallSiteExpr`'s
      // `case "par-for"` and `walkExpr`'s `case "par-for"`.
      walkIdentExpr(e.iterand, scope, walkCtx, file, out);
      if (e.max !== null) {
        walkIdentExpr(e.max, scope, walkCtx, file, out);
      }
      const inner = new Set(scope);
      inner.add(e.variable);
      walkIdentBlock(e.body, inner, walkCtx, file, out);
      return;
    }
    case "block":
      // A CHILD scope (bug 0082 §Fix): a name the block's own `let`s
      // bind must not leak to the read that follows the block — mirrors the
      // `if` / `while` / `par-for` arms above, which likewise walk their body
      // over a COPY of `scope`.
      walkIdentBlock(e.body, new Set(scope), walkCtx, file, out);
      return;
    default:
      // number / string / bool / null / query — no identifier sites.
      return;
  }
}
