// V3c / V3c-T — the control-flow parse/type-check seam.
//
// This module owns the parse- and type-phase well-formedness checks for the
// loop and `break` / `continue` forms of control-flow.md:
//
//   - `for ... in` iterand   — the expression after `in` must have type
//     `array<T>`:
//       * `theta/parse/non-array-iterand` — `for x in expr` where `expr` is not
//         `array<T>` (iterating a string, object, or number). `type` phase
//         (control-flow.md §`for` / `in`).
//   - `break` / `continue`   — bare statements, legal only inside a `for` /
//     `while` body, carrying no value in theta 1.0:
//       * `theta/parse/break-outside-loop` — `break` outside any loop body
//         (`parse` phase).
//       * `theta/parse/continue-outside-loop` — `continue` outside any loop body
//         (`parse` phase).
//       * `theta/parse/break-with-value` — `break expr` (theta 1.0 `break` takes
//         no value) (`parse` phase).
//
// V3c-T (tests-task) declares these seam shapes and stubs the behaviour-bearing
// functions inertly (each returns `undefined`), so the failing tests compile
// and red on their own primary assertions (an absent expected diagnostic), not
// on a compile error, a missing fixture, or a harness throw. The paired V3c
// implementation leaf fills every check in.

import { type Diagnostic, type SourceRange } from "../diagnostics/diagnostic";
import { type CompatType, displayType, unfoldAlias, type TypeEnv } from "./type-compat";

/** A located site at which a control-flow form is checked. */
export interface ControlFlowSite {
  readonly file: string;
  readonly range: SourceRange;
}

/**
 * The iterand of a `for x in <iterand>` loop. `type` is the resolved static
 * type of the expression after `in`, as recorded by the caller —
 * `checkForIterand` applies TYPE-11 transparency to it against the
 * `TypeEnv` it is given, so an alias of `array<T>` is admissible wherever
 * `array<T>` itself would be.
 */
export interface ForIterand {
  readonly type: CompatType;
}

/**
 * Check a `for ... in` iterand, returning `theta/parse/non-array-iterand` (a
 * `type`-phase diagnostic) when the iterand's static type is not `array<T>`
 * (iterating a string, object, or number). Returns `undefined` for an
 * `array<T>` iterand (control-flow.md §`for` / `in`).
 *
 * `env` unfolds `iterand.type` through TYPE-11 before the `kind` test: a
 * type-alias schema (`schema L = array<string>`) IS `array<string>` under
 * `⊑`, so an alias must pass this gate exactly as the concrete array type
 * does. TYPE-10 bounds the unfolding — an object-schema `named` stays
 * nominal — and an unresolvable `named` stays intact, so both keep
 * rejecting. The rejection message renders the SAME unfolded value the
 * `kind` test decided on: the registry *Message* template is `got <type>`,
 * and under TYPE-11 the alias's right-hand side IS the type, so rendering
 * anything else would name a type this check no longer sees.
 *
 * V3c-T stubs this inert (always `undefined`); the paired V3c leaf fills it in.
 */
export function checkForIterand(
  iterand: ForIterand,
  site: ControlFlowSite,
  env: TypeEnv,
): Diagnostic | undefined {
  const type = unfoldAlias(iterand.type, env);
  if (type.kind === "array") {
    return undefined;
  }
  // Message from diagnostics/code-registry-parse.md.
  return {
    severity: "error",
    code: "theta/parse/non-array-iterand",
    file: site.file,
    range: site.range,
    message: `'for' expects array<T> after 'in'; got ${displayType(type)}`,
  };
}

/**
 * A `break` statement occurrence. `insideLoop` is whether the statement sits
 * lexically inside a `for` / `while` body; `hasValue` is whether it carries an
 * operand (`break expr`), which theta 1.0 forbids.
 */
export interface BreakStatement {
  readonly insideLoop: boolean;
  readonly hasValue: boolean;
}

/**
 * Check a `break` statement (`parse` phase), returning:
 *   - `theta/parse/break-outside-loop` when `break` sits outside any loop body;
 *   - `theta/parse/break-with-value` when `break` carries an operand (theta 1.0
 *     `break` takes no value).
 * Returns `undefined` for a valueless `break` inside a loop body
 * (control-flow.md §`break` / `continue`).
 *
 * V3c-T stubs this inert (always `undefined`); the paired V3c leaf fills it in.
 */
export function checkBreakStatement(
  brk: BreakStatement,
  site: ControlFlowSite,
): Diagnostic | undefined {
  if (!brk.insideLoop) {
    // Message from diagnostics/code-registry-parse.md.
    return {
      severity: "error",
      code: "theta/parse/break-outside-loop",
      file: site.file,
      range: site.range,
      message: "'break' outside of a loop",
    };
  }
  if (brk.hasValue) {
    // Message from diagnostics/code-registry-parse.md.
    return {
      severity: "error",
      code: "theta/parse/break-with-value",
      file: site.file,
      range: site.range,
      message: "'break' takes no value in theta 1.0",
    };
  }
  return undefined;
}

/**
 * A `continue` statement occurrence. `insideLoop` is whether the statement sits
 * lexically inside a `for` / `while` body.
 */
export interface ContinueStatement {
  readonly insideLoop: boolean;
}

/**
 * Check a `continue` statement (`parse` phase), returning
 * `theta/parse/continue-outside-loop` when `continue` sits outside any loop
 * body. Returns `undefined` for a `continue` inside a loop body
 * (control-flow.md §`break` / `continue`).
 *
 * V3c-T stubs this inert (always `undefined`); the paired V3c leaf fills it in.
 */
export function checkContinueStatement(
  cont: ContinueStatement,
  site: ControlFlowSite,
): Diagnostic | undefined {
  if (!cont.insideLoop) {
    // Message from diagnostics/code-registry-parse.md.
    return {
      severity: "error",
      code: "theta/parse/continue-outside-loop",
      file: site.file,
      range: site.range,
      message: "'continue' outside of a loop",
    };
  }
  return undefined;
}
