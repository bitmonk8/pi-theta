import { describe, expect, it } from "vitest";
import {
  checkBreakStatement,
  checkContinueStatement,
  checkForIterand,
} from "../src/parser/control-flow";
import { evaluateForLoop, type ForLoopHost } from "../src/runtime/control-flow";
import type { CompatType } from "../src/parser/type-compat";
import type { LoomValue } from "../src/runtime/value";
import type { SourceRange } from "../src/diagnostics/diagnostic";

// V3c-T — failing tests for the paired `V3c` "control flow" implementation.
//
// Spec: control-flow.md
//   - <a id="ctrl-1"> CTRL-1 — `for ... in` iterand evaluated exactly once at
//     loop entry; effect commits once even when the array is empty and the body
//     is skipped; a mid-body `let mut` reassignment does not alter the snapshot
//     (asserted against the runtime `evaluateForLoop` seam,
//     src/runtime/control-flow.ts).
//   - §`for` / `in`        → loom/parse/non-array-iterand   (type phase)
//   - §`break` / `continue`→ loom/parse/break-outside-loop  (parse phase)
//                          → loom/parse/continue-outside-loop (parse phase)
//                          → loom/parse/break-with-value    (parse phase)
//
// The parse/type checks need the resolved iterand type and the lexical
// in-loop / carries-a-value context the tokeniser does not carry, so they are
// asserted against the standalone `checkForIterand` / `checkBreakStatement` /
// `checkContinueStatement` seams (src/parser/control-flow.ts).
//
// Diagnostic *Message* strings are sourced from the diagnostics registry
// (diagnostics/code-registry-parse.md) per the *Diagnostic message anchors*
// rule.
//
// These tests red because the V3c control-flow checker and loop evaluator are
// absent: every parse/type seam is an inert stub returning `undefined`, and
// `evaluateForLoop` neither evaluates the iterand nor runs the body. Each
// obligation test reds on its own primary assertion (an absent expected
// diagnostic, or an iterand-evaluation count of `0` / no recorded iteration),
// not on a compile error, a missing fixture, or a harness throw.

/** A throwaway 1:1–1:2 span for the seam calls. */
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

/** A located site at the throwaway span. */
function site(): { file: string; range: SourceRange } {
  return { file: "test.loom", range: span() };
}

// --- control-flow.md CTRL-1 — `for ... in` snapshot semantics --------------

describe("V3c-T — `for ... in` iterand snapshot (CTRL-1)", () => {
  it("CTRL-1: the iterand is evaluated exactly once at loop entry, before the first iteration", () => {
    let iterandEvals = 0;
    const seen: LoomValue[] = [];
    const host: ForLoopHost = {
      evaluateIterand() {
        // The iterand's observable effect: it commits once per loop entry.
        iterandEvals += 1;
        return ["a", "b", "c"];
      },
      runIteration(element) {
        seen.push(element);
      },
    };

    evaluateForLoop(host);

    expect(
      iterandEvals,
      "CTRL-1: the `for` iterand is evaluated exactly once at loop entry",
    ).toBe(1);
    expect(
      seen,
      "CTRL-1: the body runs once per snapshot element, in order",
    ).toEqual(["a", "b", "c"]);
  });

  it("CTRL-1: the iterand effect commits once even when the array is empty and the body is skipped", () => {
    let iterandEvals = 0;
    let iterations = 0;
    const host: ForLoopHost = {
      evaluateIterand() {
        iterandEvals += 1;
        return [];
      },
      runIteration() {
        iterations += 1;
      },
    };

    evaluateForLoop(host);

    expect(
      iterandEvals,
      "CTRL-1: the iterand effect commits exactly once even for an empty array",
    ).toBe(1);
    expect(
      iterations,
      "CTRL-1: an empty-array iterand skips the body entirely",
    ).toBe(0);
  });

  it("CTRL-1: a mid-body `let mut` reassignment does not alter the already-snapshotted sequence", () => {
    // A `let mut` cell the iterand reads from once at loop entry; the body
    // reassigns it. CTRL-1 fixes the snapshot before iteration, so the iterated
    // sequence is the entry-time value, not the reassigned one.
    const cell: { items: readonly LoomValue[] } = { items: [1, 2, 3] };
    const seen: LoomValue[] = [];
    const host: ForLoopHost = {
      evaluateIterand() {
        return cell.items;
      },
      runIteration(element) {
        seen.push(element);
        // Reassigning the `let mut` mid-body must not change the snapshot.
        cell.items = [9, 9];
      },
    };

    evaluateForLoop(host);

    expect(
      seen,
      "CTRL-1: the snapshot is fixed at loop entry; a body-side reassignment does not change it",
    ).toEqual([1, 2, 3]);
  });
});

// --- control-flow.md §`for` / `in` -----------------------------------------

describe("V3c-T — non-array iterand (loom/parse/non-array-iterand)", () => {
  it("loom/parse/non-array-iterand: `for x in <string>` fires (type phase)", () => {
    const stringType: CompatType = { kind: "prim", name: "string" };
    const d = checkForIterand({ type: stringType }, site());
    expect(
      d,
      "loom/parse/non-array-iterand for a string iterand",
    ).toBeDefined();
    expect(d?.code).toBe("loom/parse/non-array-iterand");
    // Message from code-registry-parse.md (`'for' expects array<T> after 'in'; got <type>`).
    expect(d?.message).toBe("'for' expects array<T> after 'in'; got string");
  });

  it("loom/parse/non-array-iterand: `for x in <number>` fires (type phase)", () => {
    const numberType: CompatType = { kind: "prim", name: "number" };
    const d = checkForIterand({ type: numberType }, site());
    expect(
      d,
      "loom/parse/non-array-iterand for a number iterand",
    ).toBeDefined();
    expect(d?.code).toBe("loom/parse/non-array-iterand");
  });

  it("loom/parse/non-array-iterand: `for x in <object>` fires (type phase)", () => {
    const objectType: CompatType = { kind: "object", fields: [] };
    const d = checkForIterand({ type: objectType }, site());
    expect(
      d,
      "loom/parse/non-array-iterand for an object iterand",
    ).toBeDefined();
    expect(d?.code).toBe("loom/parse/non-array-iterand");
  });

  it("an `array<T>` iterand raises no non-array-iterand diagnostic", () => {
    const arrayType: CompatType = {
      kind: "array",
      element: { kind: "prim", name: "string" },
    };
    const d = checkForIterand({ type: arrayType }, site());
    expect(
      d,
      "an `array<T>` iterand is the legal `for ... in` form",
    ).toBeUndefined();
  });
});

// --- control-flow.md §`break` / `continue` ---------------------------------

describe("V3c-T — `break` outside a loop (loom/parse/break-outside-loop)", () => {
  it("loom/parse/break-outside-loop: a `break` outside any loop body fires (parse phase)", () => {
    const d = checkBreakStatement({ insideLoop: false, hasValue: false }, site());
    expect(
      d,
      "loom/parse/break-outside-loop for a `break` outside any loop",
    ).toBeDefined();
    expect(d?.code).toBe("loom/parse/break-outside-loop");
    // Message from code-registry-parse.md.
    expect(d?.message).toBe("'break' outside of a loop");
  });

  it("a valueless `break` inside a loop body raises no diagnostic", () => {
    const d = checkBreakStatement({ insideLoop: true, hasValue: false }, site());
    expect(
      d,
      "a valueless `break` inside a loop is well-formed",
    ).toBeUndefined();
  });
});

describe("V3c-T — `continue` outside a loop (loom/parse/continue-outside-loop)", () => {
  it("loom/parse/continue-outside-loop: a `continue` outside any loop body fires (parse phase)", () => {
    const d = checkContinueStatement({ insideLoop: false }, site());
    expect(
      d,
      "loom/parse/continue-outside-loop for a `continue` outside any loop",
    ).toBeDefined();
    expect(d?.code).toBe("loom/parse/continue-outside-loop");
    // Message from code-registry-parse.md.
    expect(d?.message).toBe("'continue' outside of a loop");
  });

  it("a `continue` inside a loop body raises no diagnostic", () => {
    const d = checkContinueStatement({ insideLoop: true }, site());
    expect(
      d,
      "a `continue` inside a loop is well-formed",
    ).toBeUndefined();
  });
});

describe("V3c-T — `break` with a value (loom/parse/break-with-value)", () => {
  it("loom/parse/break-with-value: a `break expr` fires (parse phase; loom 1.0 `break` carries no value)", () => {
    const d = checkBreakStatement({ insideLoop: true, hasValue: true }, site());
    expect(
      d,
      "loom/parse/break-with-value for a `break expr`",
    ).toBeDefined();
    expect(d?.code).toBe("loom/parse/break-with-value");
    // Message from code-registry-parse.md.
    expect(d?.message).toBe("'break' takes no value in loom 1.0");
  });
});
