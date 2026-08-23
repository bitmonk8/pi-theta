// Hardening lens: MULTI-TURN CONVERSATION DRIVE / FINAL VALUE (FN-5) / using
// model replies as values in CODE.
//
// The guide promises "a small program that drives a conversation across as many
// turns as it needs" where "the model's responses flow back as values the code
// can inspect and branch on." This lens verifies the DATA FLOW is CORRECT.
// (Prompt-mode every-query visibility was QTL-1, now FIXED — see
// cli-findings/queries-toolloop.md and session-promptstream.test.ts.)
//
// Methodology note: the harness `toolCalls` channel only captures MODEL-driven
// tool calls, NOT theta-code-driven `read(...)` calls (an earlier draft that keyed
// on code-tool args observed nothing). This lens observes VALUE FLOW, not
// visibility, so every model-derived value under test is produced inside a
// SUBAGENT child (which drives its own multi-turn conversation and returns a
// FINAL VALUE) and read back by a prompt parent whose query interpolates it.
// `userTexts` is computed by code BEFORE send, so it deterministically reflects
// the value the code held.
//
// Findings: see session-findings/convdrive.md (CONV-N).
//
// Dedupe: QTL-1 (prompt-mode chained queries invisible) is FIXED — we observe
// value flow, not visibility. INVCEIL-3 (untyped invoke -> null), INV-6 (typed
// return validation), XMODE-* are prior findings and not re-reported.

import { describe, it, expect } from "vitest";
import { requireLiveProvider, runProbe, turnAt } from "./probe-harness";
import type { PlantedFile } from "./probe-harness";

const provider = requireLiveProvider();

const F = (path: string, lines: string[]): PlantedFile => ({
  source: "project",
  path,
  text: lines.join("\n"),
});

describe("multi-turn conversation drive / final value / model-reply-as-value", () => {
  // CONV-3 (baseline, FN-5): a subagent child's TAIL expression is a query
  // result; a programmatic invoke<string> parent reads that final value and
  // interpolates it into its OWN first (visible) query. Proves final value =
  // model reply, crossing the subagent boundary into the parent's query text.
  it(
    "CONV-3: subagent final value = model reply; crosses invoke boundary into parent query",
    { retry: 1, timeout: 180000 },
    async () => {
      const probe = await runProbe({
        provider,
        files: [
          F("fchild.theta", [
            "---",
            "description: fchild",
            "mode: subagent",
            "---",
            "@`What is 405 plus 376? Answer with the number only.`?",
          ]),
          F("fparent.theta", [
            "---",
            "description: fparent",
            "mode: prompt",
            "---",
            'let v = invoke<string>("./fchild.theta")?',
            "@`FV=${v}. What is 561 plus 238? Answer with the number only.`?",
          ]),
        ],
        drives: ["/fparent"],
      });
      try {
        const t = turnAt(probe);
        const joined = t.userTexts.join("\n");
        console.log("CONV-3 userTexts:", JSON.stringify(t.userTexts));
        console.log("CONV-3 error:", t.error);
        // Drive discriminators are ANSWERS to task questions over the theta's
        // own computed text -- deterministic content a degraded plain-prompt run
        // cannot produce. A verbatim-echo demand ("reply with exactly this") reads
        // as prompt injection to current models and draws refusals: the
        // sentinel-refusal class filed as bug 0243.
        expect(joined).toContain("FV=781");
      } finally {
        await probe.dispose();
      }
    },
  );

  // Batched drive covering CONV-1 (cross-turn interpolation), CONV-2 (typed field
  // into a later query), CONV-4 (for-loop N queries per-iteration interpolation),
  // CONV-6 (final-value forms: bare vs Ok(...) tail vs empty tail). Each model-
  // derived value is produced in its own subagent child; the parent's single
  // visible query renders all of them, so ONE live parent turn observes every
  // assertion (children spend their own turns internally).
  it(
    "CONV-1/2/4/6: cross-turn + typed-field + loop interpolation + final-value forms",
    { retry: 1, timeout: 240000 },
    async () => {
      const probe = await runProbe({
        provider,
        files: [
          // CONV-1 + CONV-5: two queries in ONE conversation; query B
          // interpolates query A's model answer (807). Between them, a `match`
          // branches on the model's classification (CONV-5: control flow on a
          // model reply). The child's tail is query B's reply, so its final
          // value carries proof the interpolation + branch crossed the turn.
          F("chainchild.theta", [
            "---",
            "description: chainchild",
            "mode: subagent",
            "---",
            "let a = @`What is 293 plus 514? Answer with the number only.`?",
            'let tag = match a { "807" => "HIT", _ => "MISS" }',
            "@`Here is a status record: PREV=${a}-${tag}-DONE. Report that record back as your whole answer.`?",
          ]),
          // CONV-2: typed query binds a structured result; a FIELD of it is
          // interpolated into a later query in the same conversation.
          F("typedchild.theta", [
            "---",
            "description: typedchild",
            "mode: subagent",
            "---",
            "schema Cls { label: string }",
            'let c: Cls = @<Cls>`Reply with JSON exactly: {"label":"MANGO"}`?',
            "@`Here is a classification record: FIELD=${c.label}-END. Report that record back as your whole answer.`?",
          ]),
          // CONV-4: a `for` loop issues N queries; each interpolates the loop var
          // and its reply is concatenated. Final value proves all N fired with
          // correct per-iteration interpolation AND round-tripped through code.
          F("loopchild.theta", [
            "---",
            "description: loopchild",
            "mode: subagent",
            "---",
            'let mut acc = ""',
            'for it in [647, 143] {',
            "  let r = @`What is ${it} plus 100? Answer with the number only.`?",
            '  acc = acc + r + "|"',
            "}",
            "acc",
          ]),
          // CONV-6: final-value forms (0 model turns each).
          F("baretail.theta", [
            "---", "description: baretail", "mode: subagent", "---", '"DATE"',
          ]),
          F("oktail.theta", [
            "---", "description: oktail", "mode: subagent", "---", 'Ok("KIWI")',
          ]),
          F("emptytail.theta", [
            "---", "description: emptytail", "mode: subagent", "---", "let z = 1",
          ]),
          // Master parent: one visible query renders every child's final value.
          // Every invoke is `match`-guarded so a failure surfaces as a sentinel
          // in the rendered text rather than aborting the parent via `?`.
          F("drive.theta", [
            "---",
            "description: drive",
            "mode: prompt",
            "---",
            'let c1 = match invoke<string>("./chainchild.theta") { Ok(v) => v, Err(_) => "C1-ERR" }',
            'let c2 = match invoke<string>("./typedchild.theta") { Ok(v) => v, Err(_) => "C2-ERR" }',
            'let c4 = match invoke<string>("./loopchild.theta") { Ok(v) => v, Err(_) => "C4-ERR" }',
            'let bare = match invoke<string>("./baretail.theta") { Ok(v) => v, Err(_) => "BARE-ERR" }',
            'let okv = match invoke<string>("./oktail.theta") { Ok(v) => v, Err(_) => "OK-ERR" }',
            'let emp = match invoke<string>("./emptytail.theta") { Ok(_) => "EMPTY-OK", Err(_) => "EMPTY-ERR" }',
            "@`C1=[${c1}] C2=[${c2}] C4=[${c4}] BARE=[${bare}] OK=[${okv}] EMP=[${emp}] END`?",
          ]),
        ],
        drives: ["/drive"],
      });
      try {
        const t = turnAt(probe);
        const U = t.userTexts.join("\n");
        console.log("BATCH userTexts:", JSON.stringify(t.userTexts));
        console.log("BATCH error:", t.error);
        // CONV-1: query B's reply (child final value, in c1) contains 807 =>
        // query A's model answer interpolated into query B's text across a turn.
        expect(U).toContain("807");
        // CONV-5: the `match` branched on the model classification (a=="807").
        expect(U).toContain("HIT");
        // CONV-2: typed-query field MANGO interpolated into a later query.
        expect(U).toContain("MANGO");
        // CONV-4: BOTH loop iterations fired with correct per-iteration interp.
        expect(U).toContain("747");
        expect(U).toContain("243");
        // CONV-6: bare-value tail is the final value.
        expect(U).toContain("BARE=[DATE]");
        // CONV-6 (FIXED): a `Result`-typed tail `Ok("KIWI")` is the theta's
        // terminal Result (FN-3: implicit Ok() only wraps a non-Result operand),
        // so invoke<string> unwraps its success payload "KIWI" — NOT the pre-fix
        // Ok(Ok("KIWI")) that failed return validation and hit the Err arm.
        expect(U).toContain("OK=[KIWI]");
        expect(U).not.toContain("OK=[OK-ERR]");
        // An empty-tail body's null final value still fails invoke<string> (FN-4).
        expect(U).toContain("EMP=[EMPTY-ERR]");
      } finally {
        await probe.dispose();
      }
    },
  );
});
