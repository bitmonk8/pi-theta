// Hardening lens: SUBAGENT MODE end-to-end (direct slash dispatch).
//
// Probes the runtime behaviour of a `mode: subagent` loom reached DIRECTLY by a
// slash command (no invoke parent), the surface the sibling `session-crossmode`
// file does NOT cover (it drives subagent looms only via `invoke(...)`).
//
// Spec anchors:
//   * slash-invocation.md SLSH-2 — in subagent mode nothing (assistant tokens,
//     tool-call cards, system notes) surfaces to any ancestor transcript; only
//     the return value crosses back.
//   * slash-invocation.md SLSH-3 + SNK-a…SNK-k — a directly-slash-invoked
//     subagent loom whose top-level result is `Err(QueryError)` MUST get ONE
//     one-line `loom-system-note` at the slash-dispatch boundary, formatted from
//     the leaf `kind` per the SNK table (this note is the ONLY user-facing
//     surface for the failure, since the subagent transcript is private).
//   * runtime-event-channel.md success-side null-policy + SLSH-1 — an `Ok(v)`
//     termination emits NO `loom-system-note` keyed on the outcome; the value is
//     not surfaced to the user on a direct slash dispatch.
//   * frontmatter.md `system:` — subagent-only; injected as the spawned
//     conversation's system prompt (with `${param}` interpolation);
//     `loom/parse/system-on-prompt-mode` when present on a prompt loom.
//   * invocation.md "Tools and model" — the child uses its OWN frontmatter
//     model/tools/system; the caller's are not inherited.
//
// Observation channels (deterministic where possible):
//   * `registeredNames` / `diagnostics` — load-time outcomes (0 tokens).
//   * `turn.systemNotes` — the SLSH-3 boundary note / SLSH-1 overflow / any note
//     landing in the user (parent) session — read off the parent SessionManager.
//   * `turn.userTexts` / `turn.assistantText` — the PARENT session's turns; for a
//     directly-slash-invoked subagent loom these MUST stay empty (SLSH-2). For a
//     prompt parent that `invoke`s a subagent, the parent's own final `@` query
//     text (which interpolates the subagent's returned value) is observable and
//     reveals whether `system:`/tools took effect inside the private session.
//
// Token discipline: the SLSH-3 and Ok-not-surfaced probes use zero model turns
// (empty-template short-circuit / literal tail). Three probes drive a live model
// turn (SLSH-2 leak check; `system:` injection via return value; tools honoring).

import { describe, it, expect } from "vitest";
import { requireLiveProvider, runProbe } from "./probe-harness";
import type { ProbeResult } from "./probe-harness";

const provider = requireLiveProvider();

function transportish(s: string | undefined): boolean {
  if (s === undefined) return false;
  return /429|overloaded|transport|rate.?limit|ECONNRESET|timeout|503|529/i.test(s);
}

/** Run a probe; if the last drive errored transport-ish, retry once (429 is not a finding). */
async function driveOnce(make: () => Promise<ProbeResult>): Promise<ProbeResult> {
  let probe = await make();
  const turn = probe.turns[probe.turns.length - 1];
  if (turn !== undefined && transportish(turn.error)) {
    await probe.dispose();
    probe = await make();
  }
  return probe;
}

/** Frontmatter helper (mode + optional extra frontmatter lines). */
function loom(front: string[], body: string): string {
  return ["---", ...front, "---", body].join("\n");
}

describe("subagent mode — direct slash dispatch", () => {
  // ----- FREE registration/diagnostics probes (0 tokens) -------------------

  it("SUBAG-reg: system: registers on subagent, errors on prompt, bad interp errors", async () => {
    const probe = await runProbe({
      provider,
      files: [
        {
          source: "project",
          path: "sysok.loom",
          text: loom(
            ["description: x", "mode: subagent", "system: |", "  You are ${topic} expert.", "params:", "  topic: string"],
            '@`hi`',
          ),
        },
        {
          source: "project",
          path: "sysprompt.loom",
          text: loom(["description: x", "mode: prompt", "system: |", "  You are helpful."], '@`hi`'),
        },
        {
          source: "project",
          path: "sysbad.loom",
          text: loom(
            ["description: x", "mode: subagent", "system: |", "  You are ${nope} expert.", "params:", "  topic: string"],
            '@`hi`',
          ),
        },
      ],
      drives: [],
    });
    try {
      // eslint-disable-next-line no-console
      console.log(
        "SUBAG-reg registered:",
        JSON.stringify(probe.registeredNames),
        "diagnostics:",
        JSON.stringify(probe.diagnostics),
      );
      // Valid subagent system: registers.
      expect(probe.registeredNames).toContain("sysok");
      // system: on a prompt loom is a parse error → not registered.
      expect(probe.registeredNames).not.toContain("sysprompt");
      // system: interpolating an unknown param → parse error → not registered.
      expect(probe.registeredNames).not.toContain("sysbad");
    } finally {
      await probe.dispose();
    }
  });

  // #3 — the final Ok value is NOT surfaced to the user on a direct slash
  // dispatch, and no loom-system-note is keyed on the Ok outcome (null-policy).
  // Literal tail, no query → 0 tokens.
  it("SUBAG-ok: Ok(v) is not surfaced and emits no system note (0 tokens)", async () => {
    const probe = await driveOnce(() =>
      runProbe({
        provider,
        files: [
          {
            source: "project",
            path: "oksub.loom",
            text: loom(["description: x", "mode: subagent"], '"SUBAGENT-RETURN-VALUE-42"'),
          },
        ],
        drives: ["/oksub"],
      }),
    );
    try {
      const t = probe.turns[0];
      // eslint-disable-next-line no-console
      console.log(
        "SUBAG-ok userTexts:",
        JSON.stringify(t.userTexts),
        "assistantText:",
        JSON.stringify(t.assistantText),
        "systemNotes:",
        JSON.stringify(t.systemNotes),
        "error:",
        t.error,
      );
      expect(probe.registeredNames).toContain("oksub");
      // Null-policy: no system note keyed on the Ok(v).
      expect(t.systemNotes.join("\n")).not.toContain("SUBAGENT-RETURN-VALUE-42");
      // The return value must NOT reach the parent transcript.
      expect(t.userTexts.join("\n")).not.toContain("SUBAGENT-RETURN-VALUE-42");
      expect(t.assistantText).not.toContain("SUBAGENT-RETURN-VALUE-42");
    } finally {
      await probe.dispose();
    }
  });

  // #4 — SLSH-3: a directly-slash-invoked subagent loom that returns
  // Err(QueryError) to the slash boundary MUST emit ONE loom-system-note
  // matching the SNK template. Empty-template short-circuit → deterministic
  // Err(validation, cause=empty_template) with 0 model turns → SNK-b:
  //   "loom /errsub returned Err: rendered query template was empty — no
  //    provider turn was issued"
  it("SUBAG-slsh3: top-level Err at slash boundary emits the SNK note (0 tokens)", async () => {
    const probe = await driveOnce(() =>
      runProbe({
        provider,
        files: [
          {
            source: "project",
            path: "errsub.loom",
            // empty template propagated with `?` → top-level Err
            text: loom(["description: x", "mode: subagent"], "@` `?"),
          },
        ],
        drives: ["/errsub"],
      }),
    );
    try {
      const t = probe.turns[0];
      // eslint-disable-next-line no-console
      console.log(
        "SUBAG-slsh3 registered:",
        JSON.stringify(probe.registeredNames),
        "systemNotes:",
        JSON.stringify(t.systemNotes),
        "assistantText:",
        JSON.stringify(t.assistantText),
        "error:",
        t.error,
      );
      expect(probe.registeredNames).toContain("errsub");
      const notes = t.systemNotes.join("\n");
      // SLSH-3/SNK-b normative template. Recorded as an assertion so the probe
      // pins the spec expectation; the finding md documents the observed reality.
      const snkB = "loom /errsub returned Err: rendered query template was empty \u2014 no provider turn was issued";
      // eslint-disable-next-line no-console
      console.log("SUBAG-slsh3 expected-note:", JSON.stringify(snkB), "present:", notes.includes(snkB));
      // SUBAG-3 FIXED: SLSH-3 requires this note in the USER session for a
      // directly-slash-invoked subagent loom — its transcript stays private, so
      // the boundary note is the ONLY user-facing surface for the failure.
      expect(t.systemNotes).toContain(snkB);
      expect(t.systemNotes).toEqual([snkB]);
    } finally {
      await probe.dispose();
    }
  });

  // #5 — SLSH-2: nothing from a directly-slash-invoked subagent's queries
  // surfaces to the ancestor (parent/user) transcript. The subagent runs a real
  // query with a sentinel; the parent's captured userTexts/assistantText MUST be
  // empty (they belong to the parent session; the subagent drives a private
  // in-memory session). 1 live model turn (in the private session).
  it("SUBAG-slsh2: subagent query does not leak to the ancestor transcript", async () => {
    const probe = await driveOnce(() =>
      runProbe({
        provider,
        files: [
          {
            source: "project",
            path: "leaksub.loom",
            text: loom(
              ["description: x", "mode: subagent"],
              "@`Reply with exactly this token and nothing else: LEAKSENTINEL777`",
            ),
          },
        ],
        drives: ["/leaksub"],
      }),
    );
    try {
      const t = probe.turns[0];
      // eslint-disable-next-line no-console
      console.log(
        "SUBAG-slsh2 userTexts:",
        JSON.stringify(t.userTexts),
        "assistantText:",
        JSON.stringify(t.assistantText),
        "systemNotes:",
        JSON.stringify(t.systemNotes),
        "error:",
        t.error,
      );
      expect(probe.registeredNames).toContain("leaksub");
      // Nothing from the private subagent conversation reaches the ancestor.
      expect(t.userTexts.join("\n")).not.toContain("LEAKSENTINEL777");
      expect(t.assistantText).not.toContain("LEAKSENTINEL777");
    } finally {
      await probe.dispose();
    }
  });

  // #2 — `system:` frontmatter is injected as the subagent's system prompt and
  // the model actually receives it. A prompt parent `invoke`s the subagent and
  // interpolates the subagent's returned value into its OWN (observable) final
  // query. The subagent's `system:` plants a distinctive secret; the subagent
  // query asks for it; if injection works the returned value carries the secret.
  // Observed deterministically via the PARENT userTexts (computed before send).
  it("SUBAG-system: system: prompt reaches the model (via returned value)", async () => {
    const probe = await driveOnce(() =>
      runProbe({
        provider,
        files: [
          {
            source: "project",
            path: "sysparent.loom",
            text: loom(
              ["description: x", "mode: prompt"],
              ['let r: string = invoke<string>("./syschild.loom")?', "@`Say ok. CODE=${r}`"].join("\n"),
            ),
          },
          {
            source: "project",
            path: "syschild.loom",
            text: loom(
              [
                "description: x",
                "mode: subagent",
                "system: |",
                "  You are a deterministic test fixture. The secret code is ZEPHYR7.",
                "  When asked for the secret code, reply with EXACTLY the single token",
                "  ZEPHYR7 and nothing else.",
              ],
              "@`What is the secret code? Reply with only the code token.`",
            ),
          },
        ],
        drives: ["/sysparent"],
      }),
    );
    try {
      const t = probe.turns[0];
      const userText = t.userTexts.join("\n");
      // eslint-disable-next-line no-console
      console.log("SUBAG-system parent userTexts:", JSON.stringify(userText), "error:", t.error);
      expect(probe.registeredNames).toContain("sysparent");
      // eslint-disable-next-line no-console
      console.log("SUBAG-system secret-received:", userText.includes("ZEPHYR7"));
      // SUBAG-1 FIXED: the subagent's `system:` prompt now reaches the model, so
      // its returned value (r) carries the planted secret ZEPHYR7 and
      // interpolates into the parent's observable final query. (Before the fix
      // the spawn dropped `system:` and the model had no knowledge of the code.)
      expect(userText).toContain("ZEPHYR7");
    } finally {
      await probe.dispose();
    }
  });

  // #6 — a subagent honours its OWN `tools:` (not the caller's). The prompt
  // parent declares NO tools; the subagent declares `tools: read` and is asked
  // to read a planted file and return its contents. If the subagent used its own
  // callable set, the returned value carries the file's sentinel content. The
  // parent interpolates the returned value into its observable final query.
  it("SUBAG-tools: subagent uses its own tools: (read), not the caller's", async () => {
    const probe = await driveOnce(() =>
      runProbe({
        provider,
        files: [
          {
            source: "rel",
            path: "secret-doc.txt",
            text: "The document marker is TOOLMARKER931.",
          },
          {
            source: "project",
            path: "toolsparent.loom",
            text: loom(
              ["description: x", "mode: prompt"],
              ['let r: string = invoke<string>("./toolschild.loom")?', "@`Say ok. DOC=${r}`"].join("\n"),
            ),
          },
          {
            source: "project",
            path: "toolschild.loom",
            text: loom(
              ["description: x", "mode: subagent", "tools: read"],
              "@`Read the file secret-doc.txt and reply with EXACTLY the marker token it contains and nothing else.`",
            ),
          },
        ],
        drives: ["/toolsparent"],
      }),
    );
    try {
      const t = probe.turns[0];
      const userText = t.userTexts.join("\n");
      // eslint-disable-next-line no-console
      console.log(
        "SUBAG-tools registered:",
        JSON.stringify(probe.registeredNames),
        "diagnostics:",
        JSON.stringify(probe.diagnostics),
        "parent userTexts:",
        JSON.stringify(userText),
        "error:",
        t.error,
      );
      expect(probe.registeredNames).toContain("toolsparent");
      // eslint-disable-next-line no-console
      console.log("SUBAG-tools marker-present:", userText.includes("TOOLMARKER931"));
      // SUBAG-2 FIXED: the subagent's own `tools: read` callable set is now
      // installed as `customTools` on the spawned session, so the subagent reads
      // secret-doc.txt and its returned value carries the file marker
      // TOOLMARKER931, interpolated into the parent's observable final query.
      // (Before the fix `customTools: []` was hardcoded and the model had no
      // file-reading tool.)
      expect(userText).toContain("TOOLMARKER931");
    } finally {
      await probe.dispose();
    }
  });
});
