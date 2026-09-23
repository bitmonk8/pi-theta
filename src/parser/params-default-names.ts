// `params:` default name checks: the NAME-resolution side conditions of a
// default's `Enum.Variant` forms (bug 0185 §Fix route 1).

import type { Diagnostic } from "../diagnostics/diagnostic";
import { checkVariantAccess, type SchemaDeclSite } from "./schema-declarations";
import type { ParamFieldInput } from "./params";
import type { Expr } from "./theta-ast";
import { parseExpressionSource, positionToOffset } from "./theta-document";
import { rangeKey } from "./structural-checks";

/**
 * Check the NAME-resolution side conditions of a `params:` default's
 * `Enum.Variant` forms (bug 0185 §Fix route 1).
 *
 * `NamedValueLit ::= Ident "." Ident` carries two side conditions in the grammar
 * itself — "head is an enum name in scope, tail a declared variant"
 * (grammar.md) — and the default half's is-literal check cannot test either: the
 * node it judges records only whether the head was a bare identifier, not what
 * the two identifiers spelled. The body tests them (`checkVariantAccess`, from
 * `checkStructural`'s walk, and `checkUnknownIdentifiers`), and
 * frontmatter-fields-a.md §Defaults requires the literal sublanguage to be a
 * SUBSET of the body expression grammar, so the same bytes must draw the same
 * code here. Without this check they draw none, and the unresolvable name
 * reaches the binder's defaults recovery instead, where it aborts the invocation
 * under a runtime panic code whose trigger the author's source does not match.
 *
 * Three arms:
 *
 *   - the head names a declared `enum` and the tail is not one of its variants
 *     — `theta/parse/unknown-variant`, via the body's own `checkVariantAccess`;
 *   - the head resolves to nothing in the whole-file root scope —
 *     `theta/parse/unknown-identifier`, the code the body raises for the same
 *     head;
 *   - the head RESOLVES (a `schema` name, another `params:` field, a `fn` —
 *     every `collectIdentRoots` source but a declared `enum`) and names no
 *     enum — `theta/parse/default-not-literal`.
 *
 * `grammar.md`'s "head is an enum name in scope" is a side condition OF the
 * `NamedValueLit` production, not a separate check on an otherwise-formed
 * `Literal`. A head that resolves to nothing leaves the intended form
 * undetermined, so the second arm stays a NAME question. A head that RESOLVES
 * but names no enum determines the form completely: the RHS is an identifier
 * reference that is not an `Enum.Variant` access, one of the forms
 * `default-not-literal`'s registered *Trigger* already enumerates, so the third
 * arm is a SHAPE question the moment the head is known.
 *
 * The enum arm runs FIRST, so a same-file `schema X` shadowing `enum X`
 * resolves the head against the declared `enum` at this gate, independently of
 * which declaration the type layer's own `member` arm prefers under the same
 * shadow (bug 0191's open subject).
 *
 * All three arms walk only a `params:` default. A member access at a body
 * VALUE position resolves through the body's own walk and the runtime
 * evaluator instead, so that position's disposition (bug 0140's open subject)
 * is unaffected by which of the three arms fires here.
 *
 * The range is the `params:` field's own, so the diagnostic points at the
 * declaration rather than at the top of the file. A field the frontmatter parse
 * has already refused is skipped, keeping the "exactly one diagnostic per
 * offending field" precedence the `params:` default checks hold among
 * themselves.
 */
function checkParamsDefaultNames(
  paramFields: readonly ParamFieldInput[],
  enums: ReadonlyMap<string, ReadonlySet<string>>,
  roots: ReadonlySet<string>,
  refusedRanges: ReadonlySet<string>,
  file: string,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const field of paramFields) {
    const defaultSource = field.defaultSource;
    if (defaultSource === undefined || refusedRanges.has(rangeKey(field.range))) {
      continue;
    }
    // The literal sublanguage's own node model discards both identifier texts,
    // so the RHS is re-parsed here through the body expression parser, which
    // retains them. A source that does not parse as one expression carries no
    // resolvable name and is the is-literal check's to refuse.
    const parsed = parseExpressionSource(defaultSource);
    if (parsed === null) {
      continue;
    }
    walkParamsDefaultNames(parsed, enums, roots, { file, range: field.range }, defaultSource, out);
  }
  return out;
}

/**
 * Descend a parsed `params:` default for `Enum.Variant` forms. The descent
 * covers exactly the literal sublanguage's container productions — `ArrayLit`
 * elements and the field values of `BareObjectLit` / `NamedObjectLit` — which
 * are the depths `Enum.Variant` is reachable at. Anything else is outside the
 * production set and is the is-literal check's subject, not this one's.
 *
 * `defaultSource` is the field's default RHS verbatim — the exact string
 * `expr` (and every node reachable from it) was parsed out of by
 * `parseExpressionSource` — so the third `member` arm can render `<expr>` as
 * the offending member access's own byte span (placeholder-rendering-a.md:49)
 * rather than a `<head>.<field>` reconstruction of it.
 */
function walkParamsDefaultNames(
  expr: Expr,
  enums: ReadonlyMap<string, ReadonlySet<string>>,
  roots: ReadonlySet<string>,
  site: SchemaDeclSite,
  defaultSource: string,
  out: Diagnostic[],
): void {
  switch (expr.kind) {
    case "array":
      for (const element of expr.elements) {
        walkParamsDefaultNames(element, enums, roots, site, defaultSource, out);
      }
      return;
    case "object":
      for (const field of expr.fields) {
        walkParamsDefaultNames(field.value, enums, roots, site, defaultSource, out);
      }
      return;
    case "member": {
      if (expr.target.kind !== "ident") {
        return;
      }
      const head = expr.target.name;
      const variants = enums.get(head);
      if (variants !== undefined) {
        const diagnostic = checkVariantAccess(
          { enumName: head, variant: expr.field, knownVariants: [...variants] },
          site,
        );
        if (diagnostic !== undefined) {
          out.push(diagnostic);
        }
        return;
      }
      if (!roots.has(head)) {
        out.push({
          severity: "error",
          code: "theta/parse/unknown-identifier",
          file: site.file,
          range: site.range,
          message: `unknown identifier '${head}'`,
        });
        return;
      }
      // The head RESOLVES and names no enum, so `grammar.md`'s "head is an
      // enum name in scope" side condition on `NamedValueLit` fails: the RHS
      // derives no arm of `Literal` and is an identifier reference that is not
      // an `Enum.Variant` access, one of the forms this code's registered
      // *Trigger* already enumerates. `<expr>` is sliced from `defaultSource`
      // by offset, not reassembled from `head` and `expr.field`, so an access
      // written with internal whitespace (`Box . sev`) renders that whitespace
      // back.
      const offendingSpan = defaultSource.slice(
        positionToOffset(defaultSource, expr.range.start),
        positionToOffset(defaultSource, expr.range.end),
      );
      out.push({
        severity: "error",
        code: "theta/parse/default-not-literal",
        file: site.file,
        range: site.range,
        message: `params default RHS must be a literal-sublanguage form; offending sub-expression: ${offendingSpan}`,
      });
      return;
    }
    default:
      return;
  }
}

export { checkParamsDefaultNames };
