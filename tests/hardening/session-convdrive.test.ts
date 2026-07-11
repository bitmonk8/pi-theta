// Hardening lens: MULTI-TURN CONVERSATION DRIVE / FINAL VALUE (FN-5) / using
// model replies as values in CODE.
//
// The guide promises "a small program that drives a conversation across as many
// turns as it needs" where "the model's responses flow back as values the code
// can inspect and branch on." This lens verifies the DATA FLOW is CORRECT — not
// visibility (prompt-mode chained-query visibility is QTL-1, KNOWN, not
// re-reported).
//
// Methodology note: the harness `toolCalls` channel only captures MODEL-driven
// tool calls, NOT loom-code-driven `read(...)` calls (an earlier draft that keyed
// on code-tool args observed nothing). And in prompt mode only the FIRST query is
// user-visible (QTL-1), so `userTexts` cannot observe a later same-conversation
// query. The single reliable deterministic channel for a computed value is a
// parent loom's FIRST (visible) query text. So every model-derived value under
// test is produced inside a SUBAGENT child (which drives its own multi-turn
// conversation and returns a FINAL VALUE) and read back by a prompt parent whose
// one visible query interpolates it. `userTexts` is computed by code BEFORE send,
// so it deterministically reflects the value the code held.
//
// Findings: see session-findings/convdrive.md (CONV-N).
//
// Dedupe: QTL-1 (prompt-mode chained queries invisible) is KNOWN — we observe
// value flow, not visibility. INVCEIL-3 (untyped invoke -> null), INV-6 (typed
// return validation), XMODE-* are prior findings and not re-reported.

import { describe, it, expect } from "vitest";
import { requireLiveProvider, runProbe } from "./probe-harness";
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
          F("fchild.loom", [
            "---",
            "description: fchild",
            "mode: subagent",
            "---",
            "@`Reply with exactly the word CHERRY and nothing else`?",
          ]),
          F("fparent.loom", [
            "---",
            "description: fparent",
            "mode: prompt",
            "---",
            'let v = invoke<string>("./fchild.loom")?',
            "@`FV=${v} and nothing else`?",
          ]),
        ],
        drives: ["/fparent"],
      });
      try {
        const t = probe.turns[0];
        const joined = t.userTexts.join("\n");
        console.log("CONV-3 userTexts:", JSON.stringify(t.userTexts));
        console.log("CONV-3 error:", t.error);
        expect(joined).toContain("FV=CHERRY");
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
          // interpolates query A's model answer (BANANA). Between them, a `match`
          // branches on the model's classification (CONV-5: control flow on a
          // model reply). The child's tail is query B's reply, so its final
          // value carries proof the interpolation + branch crossed the turn.
          F("chainchild.loom", [
            "---",
            "description: chainchild",
            "mode: subagent",
            "---",
            "let a = @`Reply with exactly the word BANANA and nothing else`?",
            'let tag = match a { "BANANA" => "HIT", _ => "MISS" }',
            "@`Say exactly: PREV=${a}-${tag}-DONE and nothing else`?",
          ]),
          // CONV-2: typed query binds a structured result; a FIELD of it is
          // interpolated into a later query in the same conversation.
          F("typedchild.loom", [
            "---",
            "description: typedchild",
            "mode: subagent",
            "---",
            "schema Cls { label: string }",
            'let c: Cls = @<Cls>`Reply with JSON exactly: {"label":"MANGO"}`?',
            "@`Say exactly: FIELD=${c.label}-END and nothing else`?",
          ]),
          // CONV-4: a `for` loop issues N queries; each interpolates the loop var
          // and its reply is concatenated. Final value proves all N fired with
          // correct per-iteration interpolation AND round-tripped through code.
          F("loopchild.loom", [
            "---",
            "description: loopchild",
            "mode: subagent",
            "---",
            'let mut acc = ""',
            'for it in ["A1", "B2"] {',
            "  let r = @`Reply with exactly the text: SEEN-${it} and nothing else`?",
            '  acc = acc + r + "|"',
            "}",
            "acc",
          ]),
          // CONV-6: final-value forms (0 model turns each).
          F("baretail.loom", [
            "---", "description: baretail", "mode: subagent", "---", '"DATE"',
          ]),
          F("oktail.loom", [
            "---", "description: oktail", "mode: subagent", "---", 'Ok("KIWI")',
          ]),
          F("emptytail.loom", [
            "---", "description: emptytail", "mode: subagent", "---", "let z = 1",
          ]),
          // Master parent: one visible query renders every child's final value.
          // Every invoke is `match`-guarded so a failure surfaces as a sentinel
          // in the rendered text rather than aborting the parent via `?`.
          F("drive.loom", [
            "---",
            "description: drive",
            "mode: prompt",
            "---",
            'let c1 = match invoke<string>("./chainchild.loom") { Ok(v) => v, Err(_) => "C1-ERR" }',
            'let c2 = match invoke<string>("./typedchild.loom") { Ok(v) => v, Err(_) => "C2-ERR" }',
            'let c4 = match invoke<string>("./loopchild.loom") { Ok(v) => v, Err(_) => "C4-ERR" }',
            'let bare = match invoke<string>("./baretail.loom") { Ok(v) => v, Err(_) => "BARE-ERR" }',
            'let okv = match invoke<string>("./oktail.loom") { Ok(v) => v, Err(_) => "OK-ERR" }',
            'let emp = match invoke<string>("./emptytail.loom") { Ok(_) => "EMPTY-OK", Err(_) => "EMPTY-ERR" }',
            "@`C1=[${c1}] C2=[${c2}] C4=[${c4}] BARE=[${bare}] OK=[${okv}] EMP=[${emp}] END`?",
          ]),
        ],
        drives: ["/drive"],
      });
      try {
        const t = probe.turns[0];
        const U = t.userTexts.join("\n");
        console.log("BATCH userTexts:", JSON.stringify(t.userTexts));
        console.log("BATCH error:", t.error);
        // CONV-1: query B's reply (child final value, in c1) contains BANANA =>
        // query A's model answer interpolated into query B's text across a turn.
        expect(U).toContain("BANANA");
        // CONV-5: the `match` branched on the model classification (a==BANANA).
        expect(U).toContain("HIT");
        // CONV-2: typed-query field MANGO interpolated into a later query.
        expect(U).toContain("MANGO");
        // CONV-4: BOTH loop iterations fired with correct per-iteration interp.
        expect(U).toContain("SEEN-A1");
        expect(U).toContain("SEEN-B2");
        // CONV-6: bare-value tail is the final value.
        expect(U).toContain("BARE=[DATE]");
        // CONV-6 (FIXED): a `Result`-typed tail `Ok("KIWI")` is the loom's
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
