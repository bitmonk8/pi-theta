// Bug 0386 — dead-block-let-scope live cell, a standalone live registration
// cell (the 0104 / 0065 / 0182 / 0115 / 0370 standalone-live-file precedent;
// not a numbered live-production-acceptance cell — this lane's parent renumbers
// the H8a sequence at merge, so this file carries the literal token
// `dead-block-let-scope live cell` rather than a numeric id from the existing
// sequence).
//
// Additive H8a-T cell. The fixed surface is theta LOAD and REGISTRATION — the
// REVERSE of bug 0370's live cell: there a refused reassignment target must now
// be DENIED registration; here a LEGAL program that the fork falsely refuses at
// parse (a false `theta/parse/immutable-rebinding` from the flat mutability
// map's dead-block leak, src/parser/theta-document.ts:2652/:2722) must now
// REGISTER. An error-severity `theta/parse/*` diagnostic denies registration
// (`hasLoadParseError`, src/extension/production-composition.ts), so at the fork
// the legal theta un-registers and its slash name is absent from the registered
// set; post-fix the false refusal is gone and it registers.
// (docs/bugs/0386-dead-block-let-leaks-immutability-false-refusal.md, §Fix.)
//
// TWO shadow directions, one per §Fix witness class, exercised end-to-end:
//   - LEGAL (forward, A1 shape): `let mut x = 1` / `if true { let x = 2 }` /
//     `x = 3` — a block-scoped `let x` shadow, then a legal write to the outer
//     `let mut x`. At the fork the false immutable-rebinding denies
//     registration; post-fix it must be PRESENT. This is the fix's
//     end-to-end witness.
//   - REVERSE (R1 shape): `let x = 1` / `if true { let mut x = 2 }` / `x = 3`
//     — a block-scoped `let mut x` shadow of an immutable outer `let x`, then
//     an outer write. Post-fix block-scoping restores the outer immutable
//     binding after the dead block closes, so the write is now refused at parse
//     (immutable-rebinding) and the theta must be ABSENT. At the fork the leak
//     makes the map see the block `let mut`'s mutability, so it registers —
//     the ABSENT assertion reds at the fork, pinning the reverse direction
//     end-to-end.
//
// This cell proves the fix through the real shipped load path —
// `session_start` (→ `resources_discover`) → `composeExtensionInstance`, the
// shipped composition root — over a REAL on-disk `.pi/theta/` discovery walk
// driven by `bootShippedExtension` (tests/live/harness.ts), the same harness
// bug 0115's and bug 0370's live cells use. A registration-only observable: no
// live model turn is driven, so this cell spends NO TOKENS beyond
// `requireLiveProvider`'s credential resolution — registration is decided at
// load, so a turn is neither needed nor driven.
//
// Observable per AGENTS.md "Assert on real observables, not on `prompt()`
// resolving": `handle.command(stem)` / `handle.registeredNames()`, read off the
// real `ExtensionRunner` after the real `session_start` → `pi.registerCommand`
// step — never a `prompt()` resolution.
//
// Subagent child-process launch: NOT reached. All planted thetas are
// `mode: prompt` and this cell never invokes a command, so no query-time
// tool-call loop and no RFC-0006 subagent-child spawn occurs. `harness.ts`
// carries the `#subagent-child-pins` module-scope setters regardless (inherited
// by importing it), but this cell does not exercise that path — zero model
// turns as stated above.
//
// RED / GREEN (AGENTS.md "Verify both directions"). At the fork the legal
// theta is ABSENT (false immutable-rebinding denies registration) and the
// reverse theta is PRESENT (the leak parses it clean), so this cell reds on
// both the "legal must be PRESENT" and the "reverse must be ABSENT"
// assertions. With the fix — block-scoping the mutability map — the legal
// theta registers and the reverse theta is refused, and the control still
// registers. `0.398.0` is a literal version placeholder the lane parent fills.

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";

/** A `mode: prompt` `.theta` whose body is the given lines, no callable named. */
function bodyTheta(bodyLines: readonly string[]): string {
  return ["---", "mode: prompt", "---", ...bodyLines, "1"].join("\n") + "\n";
}

describe("bug 0386 dead-block-let-scope live cell — a legal program the flat mutability map falsely refuses must register, and the reverse dead-block shadow must now be refused", () => {
  it("registers the legal dead-block-shadow theta while the reverse dead-block shadow is refused, and a byte-identical control registers", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // LEGAL (forward, A1 shape) — a block-scoped `let x` shadow, then a legal
      // write to the outer `let mut x`. Per the lexical-shadowing rule
      // (expressions.md:51) the shadow ends at `}`, so `x = 3` targets the
      // outer `let mut x` and is legal (bindings.md:12). At the fork the flat
      // map's dead-block leak draws a false `theta/parse/immutable-rebinding`
      // and denies registration; post-fix it must be PRESENT.
      {
        source: "project",
        stem: "cell0386legal",
        text: bodyTheta(["let mut x = 1", "if true { let x = 2 }", "x = 3"]),
      },
      // REVERSE (R1 shape) — a block-scoped `let mut x` shadow of an immutable
      // outer `let x`, then an outer write. Post-fix block-scoping restores the
      // immutable outer after the dead block closes, so `x = 3` targets it and
      // is refused at parse (`theta/parse/immutable-rebinding`) — the theta must
      // be ABSENT. At the fork the leak makes the map see the block `let mut`'s
      // mutability, so it registers; the ABSENT assertion reds at the fork.
      {
        source: "project",
        stem: "cell0386reverse",
        text: bodyTheta(["let x = 1", "if true { let mut x = 2 }", "x = 3"]),
      },
      // CONTROL — a byte-identical always-registering theta with no shadow: a
      // plain mutable write. It carries no dead block, so it registers both
      // directions and bounds the assertions below (an empty registered set
      // cannot satisfy the PRESENT/ABSENT assertions vacuously).
      {
        source: "project",
        stem: "cell0386control",
        text: bodyTheta(["let mut x = 1", "x = 3"]),
      },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: the control must register before the shadow assertions
      // mean anything — otherwise an empty registered set would satisfy the
      // "reverse must be ABSENT" assertion vacuously (no silent skipping).
      expect(
        handle.command("cell0386control"),
        "bug-0386 dead-block-let-scope live cell precondition unmet: the no-shadow " +
          "control did not register — discovery or registration regressed " +
          "independent of bug 0386, so the assertions below cannot witness " +
          "anything. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fix's end-to-end witness: the legal dead-block-shadow theta must be
      // PRESENT — real observable off the settled `ExtensionRunner`, never a
      // `prompt()` resolution (no turn is driven; registration is decided at
      // load).
      expect(
        handle.command("cell0386legal"),
        "bug-0386 dead-block-let-scope live cell: a legal theta with a block-scoped `let x` " +
          "shadow and a later legal write `x = 3` to the outer `let mut x` did NOT register " +
          "— the flat mutability map's dead-block leak drew a false " +
          "`theta/parse/immutable-rebinding` and denied a valid program. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The reverse direction: the dead-block `let mut x` shadow of an immutable
      // outer `let x` must be ABSENT — post-fix block-scoping restores the
      // immutable outer and the write is refused at parse.
      expect(
        handle.command("cell0386reverse"),
        "bug-0386 dead-block-let-scope live cell: a theta with a block-scoped `let mut x` " +
          "shadow of an immutable outer `let x` registered — the outer write `x = 3` was not " +
          "refused as an immutable rebinding (`theta/parse/immutable-rebinding`), so the " +
          "block `let mut`'s writability leaked onto the immutable outer through the flat " +
          "map. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();

      const names = handle.registeredNames();
      expect(
        names,
        "bug-0386 dead-block-let-scope live cell: the legal dead-block-shadow theta's slash " +
          "name must appear in the registered set.",
      ).toContain("cell0386legal");
      expect(
        names,
        "bug-0386 dead-block-let-scope live cell: the reverse dead-block-shadow theta's slash " +
          "name must NOT appear in the registered set.",
      ).not.toContain("cell0386reverse");
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
