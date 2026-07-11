import { describe, expect, it } from "vitest";
import { requireLiveProvider, runProbe, type PlantedFile } from "./probe-harness";

// Lens: THE BINDER — extraction of typed `params:` from free-form slash args
// (docs/spec_topics/binder.md + binder/*, docs/reference/frontmatter.md,
// docs/reference/discovery-cli.md §Slash-command invocation / SLSH-1).
//
// Observation: DECISION (production conformance) — the binder now runs
// OFF-session and INVISIBLE: it dispatches via pi-ai `complete()` against the
// resolved binder model, adds NO user-visible turn, and its envelope JSON never
// reaches the user session. So `turn.userTexts` contains ONLY the loom body's
// computed query (length 1 for a single-query body) — NOT a binder-prompt turn.
// We grep the body's sentinel echo line to read what the binder extracted into
// `params`. `turn.systemNotes` carries the SLSH-1 overflow note, the bind_echo
// success echo (BND-1), and the needs_info/ambiguous failure notes (BND-3).
//
// Dedupe: BND-1 (success echo) / BND-3 (failure-envelope leak) are now FIXED
// (this pass); BND-2 (defaulted param → null) is FIXED. A non-bypass loom now
// requires a resolvable binder model (bind_model: or looms.binderModel) or it
// FAILS to load (DISCO-1); these probes set looms.binderModel via projectSettings.
//
// Model latitude: the binder is an LLM. Only CLEAR mis-binding (wrong value,
// crash, dropped param, wrong default) is a finding — not a defensible model
// interpretation.

describe("binder — typed-param extraction from free-form slash args", () => {
  const provider = requireLiveProvider();

  function loom(name: string, body: string, extraFm: readonly string[] = []): PlantedFile {
    return {
      source: "project",
      path: `${name}.loom`,
      text: ["---", `description: ${name}`, "mode: prompt", ...extraFm, "---", body].join("\n"),
    };
  }

  // A non-bypass loom needs a resolvable binder model at load time (DISCO-1) or
  // it fails to load. Pin the provider-qualified cli-findings binder model
  // `anthropic/claude-haiku-4-5` — the bare id is ambiguous across providers
  // (anthropic + two local gateways), so the qualified form is required to
  // resolve to exactly one model (binder-model-parse-rule). It is distinct from
  // the session/prompt model the harness drives (opus), so this doubles as the
  // DISCO-1 runtime-facet check that the binder runs against the RESOLVED binder
  // model, not the ambient session model. Bypass looms ignore this setting.
  const binderModelSettings = { looms: { binderModel: "anthropic/claude-haiku-4-5" } };

  const bodyLine = (probe: { turns: readonly { userTexts: readonly string[] }[] }, i: number): string =>
    probe.turns[i]?.userTexts.join("\n") ?? "";

  // (1) multi-param extraction + (4) integer coercion (word vs digit) +
  // (5) bind_echo default (echo-note presence check, BND-1 confirm).
  it(
    "BIND: multi-param city/days extraction, integer coercion, echo default",
    { timeout: 180000 },
    async () => {
      const probe = await runProbe({
        provider,
        files: [
          loom(
            "forecast",
            "@`Reply with exactly: OK. FCAST C=${city} D=${days}`",
            ["params:", "  city: string", "  days: integer"],
          ),
        ],
        projectSettings: binderModelSettings,
        drives: [
          "/forecast weather in Paris for three days",
          "/forecast weather in Paris for 3 days",
        ],
      });
      try {
        for (const t of probe.turns) {
          if (t.error !== undefined) throw new Error(`transport/drive error: ${t.error}`);
        }
        const wordCase = bodyLine(probe, 0);
        const digitCase = bodyLine(probe, 1);
        // Reported by the probe run for the finding write-up:
        console.log("BIND multi-param word-case body:", JSON.stringify(wordCase.match(/FCAST[^\n]*/)?.[0]));
        console.log("BIND multi-param digit-case body:", JSON.stringify(digitCase.match(/FCAST[^\n]*/)?.[0]));
        console.log("BIND forecast turn0 systemNotes:", JSON.stringify(probe.turns[0]?.systemNotes));
        // city must bind to Paris in both cases.
        expect(wordCase).toContain("FCAST C=Paris");
        expect(digitCase).toContain("FCAST C=Paris");
        // days: integer must coerce the word "three" and the digit "3" both to 3.
        expect(wordCase).toContain("D=3");
        expect(digitCase).toContain("D=3");
      } finally {
        await probe.dispose();
      }
    },
  );

  // (2) defaulting: STRING default + BOOLEAN default omitted from the invocation.
  it(
    "BIND: string + boolean defaults fill when omitted (BND-2 fixed, extended types)",
    { timeout: 180000 },
    async () => {
      const probe = await runProbe({
        provider,
        files: [
          loom(
            "greet",
            '@`Reply with exactly: OK. GREET t=${topic} tone=${tone} v=${verbose}`',
            [
              "bind_echo: true",
              "params:",
              "  topic: string",
              '  tone: string = "neutral"',
              "  verbose: boolean = false",
            ],
          ),
        ],
        projectSettings: binderModelSettings,
        drives: ["/greet cats"],
      });
      try {
        const t = probe.turns[0];
        if (t?.error !== undefined) throw new Error(`transport/drive error: ${t.error}`);
        const body = bodyLine(probe, 0);
        console.log("BIND defaulting body:", JSON.stringify(body.match(/GREET[^\n]*/)?.[0]));
        console.log("BIND defaulting systemNotes:", JSON.stringify(t?.systemNotes));
        // topic extracted (non-empty, non-default) — "cats" is unambiguous.
        expect(body).toContain("GREET t=cats");
        // Omitted string default fills to "neutral"; omitted boolean default to false.
        expect(body).toContain("tone=neutral");
        expect(body).toContain("v=false");
        // BND-1 FIXED: bind_echo:true (default) now emits the one-line success
        // echo note (`Running /greet: …`) on the loom-system-note channel before
        // the body runs. Before (buggy): systemNotes was [] on every success.
        expect(
          (t?.systemNotes ?? []).some((n) => n.startsWith("Running /greet:")),
        ).toBe(true);
        // The binder is OFF-session: exactly one user turn (the body), no binder
        // prompt turn.
        expect(t?.userTexts.length).toBe(1);
      } finally {
        await probe.dispose();
      }
    },
  );

  // (3) required param the args do not supply — binding-failure path.
  it(
    "BIND: required params unsatisfiable -> body must NOT run (failure path)",
    { timeout: 180000 },
    async () => {
      const probe = await runProbe({
        provider,
        files: [
          loom(
            "register",
            "@`Reply with exactly: OK. REGRAN name=${name} age=${age}`",
            ["params:", "  name: string", "  age: integer"],
          ),
        ],
        projectSettings: binderModelSettings,
        drives: ["/register"],
      });
      try {
        const t = probe.turns[0];
        if (t?.error !== undefined) throw new Error(`transport/drive error: ${t.error}`);
        const body = bodyLine(probe, 0);
        console.log("BIND failure body ran?:", body.includes("REGRAN"));
        console.log("BIND failure systemNotes:", JSON.stringify(t?.systemNotes));
        console.log("BIND failure assistantText:", JSON.stringify(t?.assistantText?.slice(0, 200)));
        // The loom body must not run when required params cannot be bound.
        expect(body).not.toContain("REGRAN");
        // BND-3 FIXED: the runtime-internal envelope never leaks to the user
        // session (no `"kind"` discriminator in the streamed assistant text), and
        // the non-binding arm emits a formatted `loom /register:` failure note
        // (needs_info / ambiguous) instead of the raw envelope. Before (buggy):
        // assistantText was the raw `{"kind":"needs_info",…}` and systemNotes [].
        expect(t?.assistantText ?? "").not.toContain('"kind"');
        expect(
          (t?.systemNotes ?? []).some((n) => n.startsWith("loom /register:")),
        ).toBe(true);
      } finally {
        await probe.dispose();
      }
    },
  );

  // (6) single-string bypass: one defaultless string param -> binder bypassed,
  // whole arg string bound verbatim, echo auto-suppressed. Deterministic (no LLM
  // binder call).
  it(
    "BIND: single-string bypass binds the whole arg string verbatim, echo suppressed",
    { timeout: 180000 },
    async () => {
      const probe = await runProbe({
        provider,
        files: [loom("search", "@`Reply with exactly: OK. BYPASS q=${q}`", ["params:", "  q: string"])],
        drives: ["/search foo bar baz qux"],
      });
      try {
        const t = probe.turns[0];
        if (t?.error !== undefined) throw new Error(`transport/drive error: ${t.error}`);
        const body = bodyLine(probe, 0);
        console.log("BIND bypass body:", JSON.stringify(body.match(/BYPASS[^\n]*/)?.[0]));
        console.log("BIND bypass systemNotes:", JSON.stringify(t?.systemNotes));
        // Whole trimmed arg string, verbatim.
        expect(body).toContain("BYPASS q=foo bar baz qux");
        // Echo auto-suppressed on the bypass.
        expect(t?.systemNotes ?? []).toHaveLength(0);
      } finally {
        await probe.dispose();
      }
    },
  );

  // (7) enum-typed param — BIND-1 FIXED. A NamedType param (here a body-level
  // `enum`) now lowers to a present `params.loweredSchema` (the enum lowers to
  // `{ type: "string", enum: [<wire values>] }`), so runBinder no longer takes
  // the no-params branch: the binder RUNS (binder-prompt turn + body turn), the
  // enum param binds to a valid variant (High/Low, NOT null), and NO false
  // SLSH-1 "this loom takes no parameters" note fires. Registers with no load
  // diagnostic.
  it(
    "BIND-1 FIXED: enum-typed param runs the binder, binds a variant (not null), no false SLSH-1 note",
    { timeout: 180000 },
    async () => {
      const probe = await runProbe({
        provider,
        files: [
          loom(
            "triage",
            "enum Severity { Low, High }\n@`Reply with exactly: OK. TRI s=${sev}`",
            ["params:", "  sev: Severity"],
          ),
        ],
        projectSettings: binderModelSettings,
        drives: ["/triage the login page crashes on submit, high severity"],
      });
      try {
        const t = probe.turns[0];
        if (t?.error !== undefined) throw new Error(`transport/drive error: ${t.error}`);
        // The loom registers with no diagnostic.
        expect(probe.registeredNames).toContain("triage");
        const body = bodyLine(probe, 0);
        console.log("BIND enum body:", JSON.stringify(body.match(/TRI[^\n]*/)?.[0]));
        console.log("BIND enum nUserTexts:", t?.userTexts.length);
        console.log("BIND enum systemNotes:", JSON.stringify(t?.systemNotes));
        // Binder ran OFF-session (no binder-prompt user turn) and the enum bound
        // to a valid variant — never the no-params-misclassification null. Exactly
        // one user turn (the body).
        expect(t?.userTexts.length).toBe(1);
        expect(body).toMatch(/TRI s=(High|Low)\b/);
        expect(body).not.toContain("TRI s=null");
        expect((t?.systemNotes ?? []).join("\n")).not.toContain("this loom takes no parameters");
      } finally {
        await probe.dispose();
      }
    },
  );

  // (7b/schema) BIND-1 FIXED, second manifestation: a params field typed as a
  // body-level `schema` (NamedType) also lowers to a present `loweredSchema`
  // (the schema's object body). The loom registers with no diagnostic AND the
  // binder runs at invoke time — no false SLSH-1 "this loom takes no parameters"
  // note. A constant body isolates the note (no `${p...}` deref). Confirms the
  // fix is NamedType-general (enum + schema), matching the array/primitive/
  // nullable params that already lowered.
  it(
    "BIND-1 FIXED (schema): schema-typed param runs the binder, no false SLSH-1 note",
    { timeout: 180000 },
    async () => {
      const probe = await runProbe({
        provider,
        files: [loom("shape", "schema P { a: string }\n@`Reply with exactly: OK. SHAPERAN`", ["params:", "  p: P"])],
        projectSettings: binderModelSettings,
        drives: ["/shape make a equal to hello"],
      });
      try {
        const t = probe.turns[0];
        if (t?.error !== undefined) throw new Error(`transport/drive error: ${t.error}`);
        console.log("BIND schema-param registered:", probe.registeredNames.includes("shape"));
        console.log("BIND schema-param diagnostics:", JSON.stringify(probe.diagnostics));
        console.log("BIND schema-param nUserTexts:", t?.userTexts.length);
        console.log("BIND schema-param systemNotes:", JSON.stringify(t?.systemNotes));
        // Registers clean (the binder-model strict-capability-unknown warning is
        // suppressed by the error-only route), and the binder runs OFF-session:
        // exactly one user turn (the constant body), no false SLSH-1 note.
        expect(probe.registeredNames).toContain("shape");
        expect(probe.diagnostics).toHaveLength(0);
        expect(t?.userTexts.length).toBe(1);
        expect((t?.systemNotes ?? []).join("\n")).not.toContain("this loom takes no parameters");
      } finally {
        await probe.dispose();
      }
    },
  );

  // (7c/mixed) BIND-1 FIXED, mixed manifestation: a NamedType field alongside a
  // nullable primitive. Pre-fix a single NamedType poisoned the whole params
  // block (both params dropped to null); post-fix BOTH bind (neither null) and
  // the binder runs.
  it(
    "BIND-1 FIXED (mixed): enum + nullable primitive both bind, neither null",
    { timeout: 180000 },
    async () => {
      const probe = await runProbe({
        provider,
        files: [
          loom(
            "triage2",
            "enum Severity { Low, High }\n@`Reply with exactly: OK. TRI2 s=${sev} n=${note}`",
            ["params:", "  sev: Severity", "  note: string | null"],
          ),
        ],
        projectSettings: binderModelSettings,
        drives: ["/triage2 the login page crashes on submit, high severity"],
      });
      try {
        const t = probe.turns[0];
        if (t?.error !== undefined) throw new Error(`transport/drive error: ${t.error}`);
        const body = bodyLine(probe, 0);
        console.log("BIND mixed body:", JSON.stringify(body.match(/TRI2[^\n]*/)?.[0]));
        console.log("BIND mixed nUserTexts:", t?.userTexts.length);
        console.log("BIND mixed systemNotes:", JSON.stringify(t?.systemNotes));
        expect(t?.userTexts.length).toBe(1);
        expect(body).toMatch(/TRI2 s=(High|Low)\b/);
        expect(body).not.toContain("s=null");
        expect((t?.systemNotes ?? []).join("\n")).not.toContain("this loom takes no parameters");
      } finally {
        await probe.dispose();
      }
    },
  );

  // (8) nullable/optional param — VERIFIED CONFORMANT (binder runs, binds a
  // string-or-null). One live drive as the positive control for the BIND-3 bug.
  it(
    "BIND: nullable param (string | null) goes through the binder and binds a value",
    { timeout: 180000 },
    async () => {
      const probe = await runProbe({
        provider,
        files: [loom("annotate", "@`Reply with exactly: OK. ANN n=${note}`", ["params:", "  note: string | null"])],
        projectSettings: binderModelSettings,
        drives: ["/annotate add a note about the crash"],
      });
      try {
        const t = probe.turns[0];
        if (t?.error !== undefined) throw new Error(`transport/drive error: ${t.error}`);
        console.log("BIND nullable nUserTexts:", t?.userTexts.length);
        console.log("BIND nullable body:", JSON.stringify(bodyLine(probe, 0).match(/ANN[^\n]*/)?.[0]));
        // Binder ran OFF-session and the param is not the no-params-
        // misclassification null: it carries the bound string. One user turn.
        expect(t?.userTexts.length).toBe(1);
        expect(bodyLine(probe, 0)).toMatch(/ANN n=\S/);
        expect((t?.systemNotes ?? []).join("\n")).not.toContain("this loom takes no parameters");
      } finally {
        await probe.dispose();
      }
    },
  );

  // (9) SLSH-1 overflow note for a no-params loom — positive control.
  it(
    "BIND: no-params loom emits SLSH-1 overflow note and still runs (control)",
    { timeout: 180000 },
    async () => {
      const probe = await runProbe({
        provider,
        files: [loom("nop", "@`Reply with exactly: OK. NOPRAN`")],
        drives: ["/nop some extra text here"],
      });
      try {
        const t = probe.turns[0];
        if (t?.error !== undefined) throw new Error(`transport/drive error: ${t.error}`);
        const body = bodyLine(probe, 0);
        const notes = (t?.systemNotes ?? []).join("\n");
        console.log("BIND slsh1 systemNotes:", JSON.stringify(t?.systemNotes));
        expect(body).toContain("NOPRAN"); // body still runs
        expect(notes).toContain("ignoring extra arguments");
      } finally {
        await probe.dispose();
      }
    },
  );

  // (10) key=value syntax — NOT part of the loom 1.0 surface. Record what the
  // binder does with `city=Paris country=France`; only CLEAR mis-binding is a bug.
  it(
    "BIND: key=value syntax /geo city=Paris country=France (record binder behaviour)",
    { timeout: 180000 },
    async () => {
      const probe = await runProbe({
        provider,
        files: [
          loom(
            "geo",
            "@`Reply with exactly: OK. GEO c=${city} co=${country}`",
            ["bind_echo: false", "params:", "  city: string", "  country: string"],
          ),
        ],
        projectSettings: binderModelSettings,
        drives: ["/geo city=Paris country=France"],
      });
      try {
        const t = probe.turns[0];
        if (t?.error !== undefined) throw new Error(`transport/drive error: ${t.error}`);
        const body = bodyLine(probe, 0);
        console.log("BIND keyvalue body:", JSON.stringify(body.match(/GEO[^\n]*/)?.[0]));
        console.log("BIND keyvalue systemNotes(bind_echo:false):", JSON.stringify(t?.systemNotes));
        // Loosely: some binding must reach the body (body ran with two params).
        expect(body).toMatch(/GEO c=/);
        // bind_echo:false suppresses the success echo note (BND-1): no
        // `Running /geo:` note is emitted even on a successful bind.
        expect(
          (t?.systemNotes ?? []).some((n) => n.startsWith("Running /geo:")),
        ).toBe(false);
      } finally {
        await probe.dispose();
      }
    },
  );
});
