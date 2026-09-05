// H9a live acceptance — bug 0444: an `array<Cat | Dog>` `system:` param whose
// UNION ELEMENT schemas declare `as` renames must render each element's WIRE
// keys into the spawned child's `--system-prompt`, proved END-TO-END through the
// real `pi -p` binary
// (docs/bugs/0444-array-of-union-element-renames-dropped.md).
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESSES DO NOT.
// tests/b0444-array-of-union-element-renames-dropped.test.ts pins the per-element
// arm pick + wire-name render over the in-process parser (`parseDoc`) +
// `renderSystemPrompt`. This file spawns the real `pi` binary in print mode over
// its own throwaway discovery root and observes the outcome through real
// extension auto-load, `--theta` discovery, the shipped composition root, the
// interpreter, AND the RFC-0006 subagent child-process launch that installs the
// rendered `system:` as the child's `--system-prompt` at the spawn boundary —
// the channel an operator actually sees. This is the drive-outcome flip the
// offline witnesses cannot reach: the render walks the NEW `elementArms` branch
// (`renderSystemPrompt`), one container out from the bug-0425 whole-value pick.
//
// WHY THE FLIP IS OBSERVED THROUGH `invoke`, NOT A PRINTED DIAGNOSTIC.
// `system:` is subagent-mode only, so the callee is `mode: subagent`; a subagent
// transcript is private, so its answer is not on the outer `pi -p` stdout — a
// prompt prober `invoke<integer>`s it (the TYPED form, so the child's integer
// crosses the PIC-59 envelope) and computes over the returned number.
//
// WHY A COMPUTE-FROM-INLINE-VALUE DISCRIMINATOR (never a verbatim echo — bug
// 0243 / AGENTS.md). The child's `system:` renders the array of pet records at
// the spawn boundary. Each `Cat` / `Dog` arm renames its integer field
// `weight as "W"`, so the WIRE render keys that integer under `"W"`; the
// theta-side render (the fork's behaviour) keys it under `weight`. The child is
// instructed to sum every value stored under a key spelled EXACTLY `"W"` and add
// it to the number in its request. A WIRE render → both records expose `"W"`
// (10 + 20 = 30) → child computes 500 + 30 = 530 → the prober answers
// 530 + 100 = 630. The fork's theta-side render exposes no `"W"` key → child adds
// 0 → returns 500 → the prober answers 600. The discriminator is an ANSWER to a
// task question, computed over the rendered structure — not a demand to echo the
// prompt.
//
// WHY THE ARRAY ARRIVES SCHEMA-CONSTRUCTED. A bare object literal at an
// `invoke(...)` argument slot is `theta/parse/bare-object-literal`; the prober
// therefore declares its own `schema Cat` / `schema Dog` (theta-side field
// names) and binds a type-annotated `array<Cat | Dog>` value (a heterogeneous
// array literal with no annotation is `theta/parse/array-no-common-type`),
// admitted structurally against the child's `array<Cat | Dog>` param. The
// per-element wire render is a property of the CALLEE's own arm schemas, so the
// prober's un-renamed theta-side names do not decide it — only the callee's `as`
// renames do; the arms are picked by field set at render
// (`{name,weight}` = Cat, `{breed,weight}` = Dog), so both marshalled elements
// translate.
//
// SUBAGENT CHILD PINS (AGENTS.md §"In-process harnesses…need the child pins"):
// the prober's `invoke` launches an RFC-0006 child. The shared harness supplies
// both pins at every spawn: `spawnPiPrint` sets `PI_THETA_SUBAGENT_EXTENSION_PIN`
// to this tree's `extensions/` and carries the parent-pid so the control plane
// authenticates, and the outer process runs `-ne -e <this tree's extensions>` —
// so the child binds exactly the build under test.
//
// SCOPE ISOLATION (bug 0030). This file is deliberately OUTSIDE the nine-area
// H9a manifest: it adds no `FeatureArea`, touches none of the committed fixtures
// under `./fixtures`, and uses its own temp discovery root. It does NOT call
// `assertStderrClean` and does NOT call `assertCodesSubsetOfPermitted`, so it
// needs NO entry in `tests/fixtures/h7a/permitted-codes.json` — this cell
// asserts only a positive stdout number.
//
// Token-bounded: one `pi -p` spawn, one prober turn plus the invoked child's
// single typed-query turn.

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { failLoudly, requireLiveHost, resolveAcceptanceHost, spawnPiPrint } from "./harness";
import { parseDoc } from "../../helpers/e2e-s1";
import { renderSystemPrompt } from "../../../src/parser/system-interpolation";
import type { Diagnostic } from "../../../src/diagnostics/diagnostic";
import type { ThetaValue } from "../../../src/runtime/value";

/**
 * The child: a subagent whose `system:` interpolates the `array<Cat | Dog>`
 * param `${pets}`. Each arm renames its integer field `weight as "W"`. Under the
 * fix the per-element arm pick renders the WIRE key `"W"` for every element, so
 * the child sums 10 + 20 = 30 and returns 500 + 30 = 530. With the fix
 * neutralised the array renders theta-side keys (`weight`), the child finds no
 * `"W"` key, adds 0, and returns 500. `<BIND_MODEL>` is rewritten to the
 * resolved live host so the params theta's load-time binder-model resolves (the
 * binder is bypassed at runtime on the marshalled invoke path, PIC-60 — this
 * line only clears the load check).
 */
const CHILD_TEMPLATE = [
  "---",
  "mode: subagent",
  "bind_model: <BIND_MODEL>",
  "system: 'You are a calculator. Your list of records is ${pets}. Each record stores an integer under a key. Sum every integer stored under a key spelled EXACTLY \"W\" (a single capital W) across all records; if a record has no key spelled exactly \"W\", treat its contribution as 0. Add that sum to any number you are given in the request, then reply with only the single resulting integer.'",
  "params:",
  "  pets: 'array<Cat | Dog>'",
  "---",
  'schema Cat { name as "N": string, weight as "W": integer }',
  'schema Dog { breed as "B": string, weight as "W": integer }',
  "let n: integer = @`The number is 500. Apply your standing instruction and reply with only the single resulting integer.`?",
  "n",
  "",
].join("\n");

/**
 * The prober: prompt-mode; declares its own `schema Cat` / `schema Dog`
 * (theta-side names), binds a type-annotated `array<Cat | Dog>` value,
 * `invoke<integer>`s the child with it, and computes over the returned integer.
 * A wire-rendered child returns 530 → the prober answers 630; the fork's
 * theta-side render → child returns 500 → the prober answers 600.
 */
const PROBE = [
  "---",
  "mode: prompt",
  "---",
  "schema Cat { name: string, weight: integer }",
  "schema Dog { breed: string, weight: integer }",
  'let pets: array<Cat | Dog> = [Cat { name: "tom", weight: 10 }, Dog { breed: "pug", weight: 20 }]',
  'let res = invoke<integer>("./b0444childwire.theta", pets)',
  "let d = match res {",
  "  Ok(v) => v,",
  "  Err(e) => 0",
  "}",
  "@`A calculator probe finished with code ${d}. What is ${d} plus 100? Answer with the number only.`",
  "",
].join("\n");

/** The wire-rendered answer (530 from the child + 100 from the prober). */
const WIRE_OK = "630";
/** The answer the prober prints for the fork's theta-side render (child returns 500). */
const NEUTRALISED_ANSWER = "600";

/** The marshalled (theta-side, un-renamed) array value the invoke argument carries. */
const MARSHALLED_PETS = [
  { name: "tom", weight: 10 },
  { breed: "pug", weight: 20 },
] as unknown as ThetaValue;

/** The wire form the child's per-element arm pick must render for MARSHALLED_PETS. */
const EXPECTED_WIRE_RENDER = 'You are a calculator. Your list of records is [{"N":"tom","W":10},{"B":"pug","W":20}].';

/** The error-severity load/parse codes `parseDoc` attributes to one source. */
function errorCodes(thetaText: string, thetaPath: string): readonly string[] {
  return parseDoc(thetaText, thetaPath)
    .diagnostics.filter((d: Diagnostic) => d.severity === "error")
    .map((d: Diagnostic) => d.code)
    .sort();
}

describe("H9a live — bug 0444 array-of-union element `system:` interpolation renders wire keys through the real `pi -p`", () => {
  it("renders each union element's wire keys into the spawned child's system prompt and drives", async () => {
    const host = await resolveAcceptanceHost();
    const child = CHILD_TEMPLATE.replace("<BIND_MODEL>", `${host.provider}/${host.model}`);

    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): under the fix the child registers with NO error, and its
    // `system:` renders the WIRE keys (`"W"`, `"N"`, `"B"`) for the marshalled
    // array — the per-element `elementArms` pick. At the fork the array renders
    // theta-side keys (offline witness b0444 W1/W3), so a green live answer can
    // only come from this fix — no unrelated failure produces 630.
    expect(
      errorCodes(child, "/proj/b0444childwire.theta"),
      "attribution: under the fix the array-of-union-`system:` child carries no error and registers",
    ).toEqual([]);
    const childDoc = parseDoc(child, "/proj/b0444childwire.theta");
    expect(
      childDoc.frontmatter?.system,
      "attribution: the child's `system:` template is built (the array interpolation is admitted)",
    ).toBeDefined();
    const rendered = renderSystemPrompt({
      template: childDoc.frontmatter!.system!,
      params: { pets: MARSHALLED_PETS },
    });
    expect(
      rendered.ok && rendered.text.startsWith(EXPECTED_WIRE_RENDER),
      "attribution: the per-element arm pick renders wire keys `W`/`N`/`B` for the marshalled array; " +
        `the fork renders theta-side keys (b0444 W1/W3). rendered: ${rendered.ok ? rendered.text : "<err>"}`,
    ).toBe(true);
    expect(
      errorCodes(PROBE, "/proj/b0444probe.theta"),
      "attribution: the prober (schema-constructed, type-annotated invoke argument) registers clean",
    ).toEqual([]);

    // Live-host precondition — fails loudly naming the unmet precondition; never
    // a skip or early return.
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver returned an empty model id.",
      );
    }

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0444-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0444-cwd-"));
    try {
      writeFileSync(join(thetaDir, "b0444childwire.theta"), child, "utf8");
      writeFileSync(join(thetaDir, "b0444probe.theta"), PROBE, "utf8");

      const probe = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0444probe",
        cwd: probeCwd,
      });
      expect(
        probe.exitCode,
        `probe: expected a no-error exit (0), got ${String(probe.exitCode)}. stderr: ${probe.stderr}`,
      ).toBe(0);
      expect(
        probe.stdout,
        `probe: the array-of-union-\`system:\` child must render each element's WIRE key \`"W"\` ` +
          `at the spawn boundary, so it sums 10 + 20 = 30, returns 500 + 30 = 530, and the prober ` +
          `computes 530 + 100 = ${WIRE_OK}. The fork's theta-side render exposes no \`"W"\` key → ` +
          `child adds 0 → returns 500 → the prober answers ${NEUTRALISED_ANSWER}. ` +
          `stdout: ${probe.stdout} stderr: ${probe.stderr}`,
      ).toContain(WIRE_OK);
    } finally {
      rmSync(thetaDir, { recursive: true, force: true });
      rmSync(probeCwd, { recursive: true, force: true });
    }
  });
});
