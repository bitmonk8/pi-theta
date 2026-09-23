// Loop-variable recovery guard shared by the `for` and `par for` productions
// (bug 0153 §Fix): the reserved-keyword-as-identifier check on a captured
// loop-variable token, guarded against the `mut`-consumption recovery
// artefact, plus consumption of the grammar's own `in` keyword.

import type { Diagnostic } from "../diagnostics/diagnostic";
import type { Token } from "../lexer/lexer";
import { reservedKeywordAsIdentifierDiagnostic } from "./annotation-validation";

/**
 * File the reserved-keyword diagnostic for a consumed loop-variable token,
 * then consume the production's `in` keyword — the shared shape behind the
 * two `Ident` terminal positions `ForStmt ::= "for" Ident "in" Expr
 * StmtBlock` and `ParForExpr ::= "par" "for" Ident "in" Expr MaxClause?
 * ParForBody` (grammar.md) carry. lexical.md:20 reserves all 32 spellings
 * from identifier position with no scope list, and code-registry-parse.md:21's
 * Trigger names no position either: the loop variable is an `Ident` terminal
 * the lexer's adjacency dispatch cannot reach (it keys on
 * `let`/`fn`/`schema`/`enum` tokens, never on these productions). Guarded
 * against the same recovery artefact bug 0148's `atParamStart` guards for
 * `fn` parameters: `mutConsumed` true with the captured token reading `in`
 * means no variable was written at all — the `mut` modifier's own consumption
 * left `in` occupying this slot, and that artefact must not gain a second
 * diagnostic beside `mut-on-immutable-context`. The discriminator between
 * that artefact and a genuine iteration variable spelled `in` behind a `mut`
 * (`for mut in in xs`) is the FOLLOWING token: the artefact's next token is
 * the iterand (`xs`), while a genuine variable is followed by the grammar's
 * own `in` keyword, so only the artefact is suppressed. The lexer's own
 * adjacency diagnostic is left standing beside this one where the variable is
 * itself `let`/`fn`/`schema`/`enum` (misfire face, bug 0153 §Fix (c) route
 * (i)): narrowing the lexer to suppress it would drift bugs 0051/0135's
 * citations there, and requiring the following token to be `ident`-kind
 * (route (iii)) is refuted by `let let = 1` firing correctly.
 *
 * `isKeywordIn` answers whether the parser's cursor sits on the `in` keyword
 * and `advance` consumes one token; both close over the caller's parser
 * state, which this module does not otherwise touch.
 */
export function checkLoopVariableAndConsumeIn(
  diagnostics: Diagnostic[],
  file: string,
  variableTok: Token,
  mutConsumed: boolean,
  isKeywordIn: () => boolean,
  advance: () => void,
): void {
  const mutRecoveryArtefact =
    mutConsumed && variableTok.text === "in" && !isKeywordIn();
  if (variableTok.kind === "keyword" && !mutRecoveryArtefact) {
    diagnostics.push(
      reservedKeywordAsIdentifierDiagnostic(variableTok.text, variableTok.range, file),
    );
  }
  if (isKeywordIn()) {
    advance();
  }
}
