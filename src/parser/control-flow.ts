// V3c / V3c-T — the control-flow parse/type-check seam.
//
// This module owns the parse- and type-phase well-formedness checks for the
// loop and `break` / `continue` forms of control-flow.md:
//
//   - `for ... in` iterand   — the expression after `in` must have type
//     `array<T>`:
//       * `loom/parse/non-array-iterand` — `for x in expr` where `expr` is not
//         `array<T>` (iterating a string, object, or number). `type` phase
//         (control-flow.md §`for` / `in`).
//   - `break` / `continue`   — bare statements, legal only inside a `for` /
//     `while` body, carrying no value in loom 1.0:
//       * `loom/parse/break-outside-loop` — `break` outside any loop body
//         (`parse` phase).
//       * `loom/parse/continue-outside-loop` — `continue` outside any loop body
//         (`parse` phase).
//       * `loom/parse/break-with-value` — `break expr` (loom 1.0 `break` takes
//         no value) (`parse` phase).
//
// V3c-T (tests-task) declares these seam shapes and stubs the behaviour-bearing
// functions inertly (each returns `undefined`), so the failing tests compile
// and red on their own primary assertions (an absent expected diagnostic), not
// on a compile error, a missing fixture, or a harness throw. The paired V3c
// implementation leaf fills every check in.

import { type Diagnostic, type SourceRange } from "../diagnostics/diagnostic";
import { type CompatType } from "./type-compat";

/** A located site at which a control-flow form is checked. */
export interface ControlFlowSite {
  readonly file: string;
  readonly range: SourceRange;
}

/**
 * The iterand of a `for x in <iterand>` loop. `type` is the resolved static
 * type of the expression after `in`; only `array<T>` is admissible.
 */
export interface ForIterand {
  readonly type: CompatType;
}

/**
 * Check a `for ... in` iterand, returning `loom/parse/non-array-iterand` (a
 * `type`-phase diagnostic) when the iterand's static type is not `array<T>`
 * (iterating a string, object, or number). Returns `undefined` for an
 * `array<T>` iterand (control-flow.md §`for` / `in`).
 *
 * V3c-T stubs this inert (always `undefined`); the paired V3c leaf fills it in.
 */
export function checkForIterand(
  iterand: ForIterand,
  site: ControlFlowSite,
): Diagnostic | undefined {
  void iterand;
  void site;
  return undefined;
}

/**
 * A `break` statement occurrence. `insideLoop` is whether the statement sits
 * lexically inside a `for` / `while` body; `hasValue` is whether it carries an
 * operand (`break expr`), which loom 1.0 forbids.
 */
export interface BreakStatement {
  readonly insideLoop: boolean;
  readonly hasValue: boolean;
}

/**
 * Check a `break` statement (`parse` phase), returning:
 *   - `loom/parse/break-outside-loop` when `break` sits outside any loop body;
 *   - `loom/parse/break-with-value` when `break` carries an operand (loom 1.0
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
  void brk;
  void site;
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
 * `loom/parse/continue-outside-loop` when `continue` sits outside any loop
 * body. Returns `undefined` for a `continue` inside a loop body
 * (control-flow.md §`break` / `continue`).
 *
 * V3c-T stubs this inert (always `undefined`); the paired V3c leaf fills it in.
 */
export function checkContinueStatement(
  cont: ContinueStatement,
  site: ControlFlowSite,
): Diagnostic | undefined {
  void cont;
  void site;
  return undefined;
}
