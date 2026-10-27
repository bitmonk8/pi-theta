// Lane-wave marker for the parallel merge of this wave's live additions:
//
// H9a live acceptance -- bug 0231: `TypeParser.parseObject`'s malformed-field
// `break` discarded every entry behind the first one that did not spell
// `Ident ":"`, so a well-formed field's own diagnostic went unchecked --
// and at a generic type argument (`array<...>`, bug 0227's registered
// raw-key carve-out) the field-name case rule was the ONLY check that would
// have fired, so `array<{a b: integer, Zs: string}> = [1]` loaded with an
// EMPTY diagnostic list and REGISTERED
// (docs/bugs/0231-well-formed-field-behind-malformed-entry-unchecked.md
// §Reproduction (d), row d1). §Fix (a) route 1 resynchronises the field loop
// at the malformed entry's next depth-0 `,` instead of ending the loop
// there, so `Zs`'s `theta/parse/binding-case-mismatch` now reaches the
// registration gate through the real `pi -p` binary.
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS AND THE H8a CELL DO NOT.
// `tests/inline-object-malformed-entry-resync.test.ts` group (D) pins the
// diagnostic bytes and the `registers()` predicate at the
// `parseThetaDocument` boundary; the H8a cell
// (`tests/live/inline-object-malformed-entry-resync-live.test.ts`)
// drives the same input through the shipped `createAgentSession`
// composition but never through the real `pi` BINARY in non-interactive
// print mode. This file spawns the real `pi -p` binary, mirroring
// `tests/live/acceptance/inline-object-field-name-case-load-refusal.test.ts`
// structure exactly (offender / probe / clean, same two measurements
// below).
//
// WHY THE REFUSAL IS OBSERVED THROUGH `invoke`, NOT AS A PRINTED DIAGNOSTIC OR
// A DIRECT SLASH INVOCATION -- the same two measurements
// `ctor-unresolved-load-refusal.test.ts` and bug 0176's H9a file record,
// reused here because they are properties of the SHIPPED session_start /
// print-mode plumbing, not of this bug: (1) load diagnostics route to the
// `theta-system-note` channel, which is not streamed to `pi -p` print-mode
// stdout; (2) invoking an unregistered slash directly makes `pi -p` hang with
// zero bytes on both streams. This file therefore drives the offender
// indirectly via `invoke("./cellmerooffender.theta")` from a well-formed
// prober, converting the refusal into one of two committed stdout sentinels
// through a `match` over the untyped `invoke`'s `Result<null, QueryError>` --
// never asserting on a promise merely resolving.
//
// ZERO-TOKEN CALLEE: the offender reproduces §Reproduction (d) row d1's
// shape at a generic type argument with no query in its body. The CLEAN
// spawn and the PROBE spawn each spend one turn on their final untyped
// query; even an admitted offender adds no callee query.
//
// MEASUREMENT (obligation 3(c) -- permitted-codes decision by measurement,
// never by assumption): the probe run's stdout+stderr is scanned with the
// SAME `parseSystemNoteCodes` regex the nine-area H9a manifest scores area
// (a)-(i) against, for the literal string
// `theta/parse/binding-case-mismatch`. See the cell body for the recorded
// result.
//
// SCOPE ISOLATION (bug 0030), same rule bug 0176's H9a file states for
// itself: this file is deliberately OUTSIDE the nine-area H9a manifest. It
// adds no `FeatureArea`, touches none of the nine committed fixtures under
// `./fixtures`, and uses its own temp discovery roots. The CLEAN spelling's
// own spawn IS scored by `assertStderrClean`'s empty-capture rule (bug 0030
// §Fix) directly, inline. The offender/probe spawn is NOT scored by that
// gate for the same reason bug 0154's H9a file states: its whole purpose is
// to observe a refusal that does not reach stdout/stderr at all.
//
// SUBAGENT CHILD PINS: NOT required. Every theta below is `mode: prompt`,
// and `invoke` between two `mode: prompt` thetas suspends the parent and
// attaches the callee to the caller's own session -- no RFC-0006 child
// process launches on this path. The pins are supplied anyway by the shared
// harness (`spawnPiPrint` sets `PI_THETA_SUBAGENT_EXTENSION_PIN`, and the
// outer process carries `-ne -e <this tree's extensions>`).
//
// Token-bounded: the original H9a case has two `pi -p` spawns; the three
// B0472 real-host regression cases add three more. Each host has one query,
// and the offender/admitted callee bodies have none.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { requireLiveHost, spawnPiPrint } from "./harness";
import { codesOf, diagnosticsOf, parseDoc } from "../../helpers/e2e-s1";
import { executeBody, type StatementEvalHost } from "../../../src/runtime/statement-executor";
import { buildEnvironment } from "../../../src/runtime/lexical-environment";
import { evaluatePureExpression } from "../../../src/runtime/pure-expression-evaluator";
import { renderQueryText } from "../../../src/runtime/query-interpolation";
import { makeErr, makeOk, type ResultValue } from "../../../src/runtime/value";
import { SEAM_NOOP_CHECKPOINT, SEAM_NOOP_MUTATOR } from "../../helpers/invoke-seam-scaffold";
import { expectOffenderProbeClean } from "../../helpers/pi-print-fixture-harness";

/** The registered code bug 0231's fix reaches at a generic argument (row d1). */
const CODE = "theta/parse/binding-case-mismatch";

/**
 * The CLEAN spelling: the case-fixed sibling of the same generic-argument
 * annotation -- `{a: integer, zs: string}` in place of
 * `{a b: integer, Zs: string}` -- bound to a literal, zero-token load, then
 * one pinned live turn.
 */
const CLEAN = [
  "---",
  "mode: prompt",
  "---",
  "let x: array<{a: integer, zs: string}> | null = null",
  "@`What is 341 plus 415? Answer with the number only.`",
  "",
].join("\n");

/**
 * The offending theta (§Reproduction (d) row d1's exact shape): a malformed
 * inline entry (`a b`) followed by a well-formed field (`Zs`) whose case
 * violation is the ONLY check reachable at a generic type argument.
 * Registers with an EMPTY diagnostic list pre-fix. No query in the body: the
 * pre-fix direction (where it loads and `invoke` actually runs it) costs no
 * extra model turn.
 */
const OFFENDER = [
  "---",
  "mode: prompt",
  "---",
  "let x: array<{a b: integer, Zs: string}> = [1]",
  'let a = "OFFENDER BODY RAN"',
  "a",
  "",
].join("\n");

/**
 * The prober: well-formed, registers either way, and converts the offender's
 * load disposition into a fixed-pair task selected by a `match` over the
 * untyped `invoke`'s `Result<null, QueryError>`. The query supplies only the
 * common `What is ` prefix, keeping a non-empty static body for QRY-6; the
 * model need not recover an arm-specific operand from prose.
 */
const PROBE = [
  "---",
  "mode: prompt",
  "---",
  'let r = invoke("./cellmerooffender.theta")',
  "let verdict = match r {",
  '  Ok(v) => "100 plus 200? Answer with the number only.",',
  '  Err(e) => "263 plus 514? Answer with the number only."',
  "}",
  "@`What is ${verdict}`",
  "",
].join("\n");

const REFUSED = "777";
const LOADED = "300";
// Answers pin a real task-framed provider turn, not a verbatim-echo demand
// (bug 0243). Fixed-pair arithmetic remains stochastic: a wrong answer still
// fails the witness, while exact outbound text independently pins arm selection.
const CLEAN_SENTINEL = "756";

// B0472: inspect the actual outbound turn, not whether this particular model
// happens to answer correctly. Reuse the shared probe fixture above so the
// regression cannot pass by fixing a disconnected copy of the fixture.
// Both invoke dispositions cost one provider turn: the admitted callee below
// has no query. The clean cell proves the same fixed-pair assertion can green.
interface ProbeMessage {
  readonly role?: string;
  readonly customType?: string;
  readonly stopReason?: string;
  readonly content?: string | readonly { readonly text?: string }[];
}

function probeMessageText(message: ProbeMessage): string {
  return typeof message.content === "string"
    ? message.content
    : (message.content ?? []).map(part => part.text ?? "").join("");
}

const FIXED_PAIR_QUESTION = /^What is [0-9]+ plus [0-9]+\? Answer with the number only\.$/;
const ADMITTED = ["---", "mode: prompt", "---", "null", ""].join("\n");

// Provider-free isolation of the same fixture: only invoke disposition and the
// query response are doubles. The parser, executor, Result match, environment,
// and outbound renderer are production code. This does NOT test load refusal,
// real registration, CLI plumbing, or provider arithmetic; the real-host cases do.
async function isolatedQuestion(source: string, disposition: ResultValue): Promise<string> {
  const doc = parseDoc(source, "cellmeroprobe.theta");
  expect(doc.diagnostics, "unit fixture must parse cleanly").toEqual([]);
  const env = buildEnvironment({ body: doc.body });
  const effects: string[] = [];
  const questions: string[] = [];
  const host: StatementEvalHost = {
    evaluatePure: evaluatePureExpression,
    checkpointFor(expr) {
      return expr.kind === "invoke" || expr.kind === "query"
        ? { kind: expr.kind, site: { file: "cellmeroprobe.theta", line: expr.range.start.line, column: expr.range.start.column } }
        : null;
    },
    async runEffect(expr, scope) {
      effects.push(expr.kind);
      if (expr.kind === "invoke") {
        expect(expr.path).toBe("./cellmerooffender.theta");
        return { ok: true, value: disposition };
      }
      if (expr.kind !== "query") throw new Error(`unexpected unit effect: ${expr.kind}`);
      questions.push(renderQueryText(expr, scope));
      return { ok: true, value: "unit response, not a provider answer" };
    },
  };
  const execution = await executeBody(doc.body, {
    env, host, checkpoint: SEAM_NOOP_CHECKPOINT,
    signal: new AbortController().signal, mutator: SEAM_NOOP_MUTATOR,
    mode: "prompt", file: "cellmeroprobe.theta",
  });
  expect(execution.outcome, "handled invoke failure must still reach the query").toBe("success");
  expect(effects, "one query per drive; no query in the callee double").toEqual(source === CLEAN ? ["query"] : ["invoke", "query"]);
  expect(questions).toHaveLength(1);
  return questions[0]!;
}

describe("B0472 unit arm question rendering", () => {
  it("healthy fixed-pair control", async () => {
    expect(await isolatedQuestion(CLEAN, makeOk(null))).toMatch(FIXED_PAIR_QUESTION);
  });

  for (const [name, result] of [
    ["refused Err arm", makeErr({ kind: "invoke_infra", message: "unit load refusal" })],
    ["admitted Ok arm", makeOk(null)],
  ] as const) {
    it(name, async () => {
      expect(
        await isolatedQuestion(PROBE, result),
        `B0472 unit ${name}: the selected arm must render a self-contained fixed-pair question`,
      ).toMatch(FIXED_PAIR_QUESTION);
    });
  }

  it("Result arms render distinct tasks and keep non-overlapping sentinels", async () => {
    const refused = await isolatedQuestion(PROBE, makeErr(null));
    const admitted = await isolatedQuestion(PROBE, makeOk(null));
    expect(refused).not.toBe(admitted);
    expect(refused).toBe("What is 263 plus 514? Answer with the number only.");
    expect(admitted).toBe("What is 100 plus 200? Answer with the number only.");
    expect(String(263 + 514)).toBe(REFUSED);
    expect(String(100 + 200)).toBe(LOADED);
    expect(String(341 + 415)).toBe(CLEAN_SENTINEL);
    for (const [left, right] of [[REFUSED, LOADED], [REFUSED, CLEAN_SENTINEL], [LOADED, CLEAN_SENTINEL]]) {
      expect(left).not.toContain(right);
      expect(right).not.toContain(left);
    }
  });

  it("refusal oracle rejects admitted, empty, and historical third replies", () => {
    for (const reply of [LOADED, "", "954"]) {
      expect(() => expect(reply).toContain(REFUSED)).toThrow();
    }
  });
});

// This witnesses the deterministic source of the fragility, NOT its frequency
// or a guarantee that even a fixed-pair question can never get a wrong answer.
describe("B0472 real-host arm discriminator task", () => {
  for (const [name, source, callee, answer, otherAnswer] of [
    ["healthy fixed-pair control", CLEAN, ADMITTED, CLEAN_SENTINEL, undefined],
    ["refused Err arm", PROBE, OFFENDER, REFUSED, LOADED],
    ["admitted Ok arm", PROBE, ADMITTED, LOADED, REFUSED],
  ] as const) {
    it(name, async () => {
      expect(diagnosticsOf(source, "cellmeroprobe.theta")).toEqual([]);
      expect(codesOf(callee, "cellmerooffender.theta")).toEqual(
        callee === OFFENDER ? [CODE, "theta/parse/inline-field-name-not-identifier"] : [],
      );
      await requireLiveHost(); // A missing provider/model must fail, never skip.
      const cwd = mkdtempSync(join(tmpdir(), "theta-b0472-task-"));
      try {
        const root = join(cwd, "thetas");
        mkdirSync(root);
        writeFileSync(join(root, "cellmeroprobe.theta"), source);
        writeFileSync(join(root, "cellmerooffender.theta"), callee);
        const result = await spawnPiPrint({
          cwd, thetaDir: root, slashInvocation: "/cellmeroprobe",
          extraArgs: ["--mode", "json", "--no-session"],
        });
        // Preserve complete host evidence in the enclosing invocation's log.
        console.log("B0472 HOST", JSON.stringify({ name, ...result }));
        const events = result.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line) as {
          readonly type?: string;
          readonly message?: ProbeMessage;
        });
        expect(events.filter(event => "theta_result" in event), "prompt-mode host must not inherit a worker root").toEqual([]);
        expect(result.exitCode, "real host must exit successfully").toBe(0);
        expect(result.stderr, "real host must have clean stderr").toBe("");
        const messages = events.flatMap(event => event.type === "message_end" && event.message !== undefined ? [event.message] : []);
        const users = messages.filter(message => message.role === "user").map(probeMessageText);
        const assistants = messages.filter(message => message.role === "assistant");
        expect(assistants.length, "real provider turn must complete").toBe(1);
        expect(assistants.map(message => message.stopReason), "provider errors/aborts are not bug witnesses").toEqual(["stop"]);
        const reply = assistants.map(probeMessageText).join("\n");
        expect(reply, "original arm sentinel must still discriminate the actual invoke disposition").toContain(answer);
        if (otherAnswer !== undefined) expect(reply, "opposite invoke arm must remain rejected").not.toContain(otherAnswer);
        expect(messages.filter(message => message.customType === "theta-system-note"), "drive must not fail closed").toEqual([]);
        expect(users, "exactly one query must reach the real provider").toHaveLength(1);
        expect(
          users[0],
          `B0472 ${name}: arm identity must select a self-contained fixed-pair question, not a code lookup followed by arithmetic`,
        ).toMatch(FIXED_PAIR_QUESTION);
        expect(users[0]).toBe(source === CLEAN
          ? "What is 341 plus 415? Answer with the number only."
          : callee === OFFENDER
            ? "What is 263 plus 514? Answer with the number only."
            : "What is 100 plus 200? Answer with the number only.");
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });
  }
});

describe("-- H9a live: bug 0231 field-loop resynchronisation reaches a well-formed field's case violation behind a malformed generic-argument entry through the real `pi -p`", () => {
  it(": refuses `array<{a b: integer, Zs: string}> = [1]`, still registers and drives the case-fixed sibling, and measures whether the code reaches the H9a capture", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the offender carries exactly the fixed code set and the
    // other two sources are clean, so neither live sentinel can be produced
    // by an unrelated load failure. Since bug 0233's widen (0.196.0) the
    // malformed `a b` entry inside the generic argument ALSO draws
    // `theta/parse/inline-field-name-not-identifier` beside the case
    // refusal this cell witnesses — an entailed second diagnostic, ratified
    // at merge under 0233's origin authority; the cell's subject (0231's
    // resync reaching `Zs`'s case rule) is unchanged.
    expect(
      codesOf(OFFENDER, "cellmerooffender.theta"),
      `attribution: the offending theta must carry exactly the fixed code set [binding-case-mismatch, inline-field-name-not-identifier]; actual=${JSON.stringify(diagnosticsOf(OFFENDER, "cellmerooffender.theta"))}`,
    ).toEqual([CODE, "theta/parse/inline-field-name-not-identifier"]);
    expect(
      diagnosticsOf(PROBE, "cellmeroprobe.theta"),
      "attribution: the prober must be clean, so it registers and its verdict reflects the OFFENDER's disposition only",
    ).toEqual([]);
    expect(
      diagnosticsOf(CLEAN, "cellmeroclean.theta"),
      "attribution: the case-fixed sibling must carry zero diagnostics -- the fix must not disturb the good path",
    ).toEqual([]);

    // Live-host precondition -- fails loudly naming the unmet precondition
    // (`resolveAcceptanceHost`); never a skip or early return.
    await requireLiveHost();

    await expectOffenderProbeClean({
      slug: "cellmero",
      files: {
        "cellmerooffender.theta": OFFENDER,
        "cellmeroprobe.theta": PROBE,
        "cellmeroclean.theta": CLEAN,
      },
      clean: {
        slashInvocation: "/cellmeroclean",
        expected: CLEAN_SENTINEL,
        message: (clean) => `clean: the case-fixed sibling must register and DRIVE a real turn -- without this the refusal assertion below could pass vacuously (wrong root, no registration at all). stdout: ${clean.stdout} stderr: ${clean.stderr}`,
        codesMessage: "clean: the case-fixed sibling must carry NO theta/{load,parse,runtime}/* code at all -- the fix must not emit anything on the good path.",
      },
      probe: {
        slashInvocation: "/cellmeroprobe",
        expected: REFUSED,
        unexpected: LOADED,
        message: (probe) => `probe: the offending theta must NOT load; its invoke("./cellmerooffender.theta") must select the Err arm question (263 plus 514), whose answer is "${REFUSED}". The Ok arm question (100 plus 200) answers "${LOADED}" and would indicate admission instead of refusal. A different answer is a failed drive witness, not by itself proof of a load regression. stdout: ${probe.stdout} stderr: ${probe.stderr}`,
      },
      measurementMessage: (probe, observedCodes) => `MEASUREMENT: ${CODE} ${observedCodes.includes(CODE) ? "DOES" : "does NOT"} reach the H9a stdout+stderr capture for this refusal path (probe stdout: ${probe.stdout} stderr: ${probe.stderr}). This is the recorded evidence for the permitted-codes.json disposition (obligation 3(c)).`,
    });
  });
});
