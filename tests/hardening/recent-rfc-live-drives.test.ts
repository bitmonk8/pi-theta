// Hardening tier: LIVE end-to-end drives for the three recently-implemented
// RFCs — one turn-issuing drive per RFC, closing the gap that each RFC had NO
// live test that issues real model turns (subagent fn had only a zero-turn load
// probe; par for and computed-tool-args had only offline coverage).
//
// State: LIVE tier (boots the shipped extension against a REAL AgentSession and
// a REAL provider via requireLiveProvider(); excluded from the default offline
// `npm test`, which does not collect tests/hardening/**). Each drive issues real
// model turns and is TOKEN-BOUNDED to a few short turns.
//
// DETERMINISM DISCIPLINE (binding): every assertion reads only a DETERMINISTIC
// channel — `turn.userTexts` (the exact text the theta CODE computed and sent,
// so it reflects control-flow / value-crossing / tool results, never the model's
// stochastic reply), `turn.error === undefined` (the success terminal),
// `probe.registeredNames`. NOTHING asserts on `assistantText`. Each surfaced
// value is COMPUTED IN CODE (arithmetic on the input / a planted sentinel),
// independent of the model's reply content; the in-body `@` turns exist only to
// PROVE a real turn happened (a failed turn would `?`-propagate to `turn.error`).
//
// Coverage:
//   RFC 0001 `subagent fn`  — a subagent fn issues one real turn in its spawned
//     session and returns a code-computed typed value; args cross by value, the
//     return crosses the boundary, and the spawned transcript stays private.
//   RFC 0003 `par for`      — a par for over a 3-element array where each
//     iteration issues a real turn via an isolated `subagent fn` call (CTRL-4:
//     a bare `@` in a par-for body is `theta/parse/par-query-in-body`), then
//     collects `array<Result<T, QueryError>>` and reduces it in INPUT-INDEX
//     order to a deterministic string.
//   RFC 0002 computed tool args — a `read({ path: <non-literal expr> })?` whose
//     path is an identifier `+` concatenation; the planted-file sentinel it
//     returns is surfaced, proving the computed argument resolved and the real
//     tool executed.

// PIC-57 WITNESS (teardown ordering). Every `probe.dispose()` here now drives a
// real `session_shutdown` emit (via `ExtensionRunner.emit`) BEFORE
// `AgentSession.dispose()` and the watched-tmp-dir `rmSync` — see
// probe-harness.ts's `dispose` closure. That runs the shipped extension's
// graceful `session_shutdown` handler while the ctx is still active, so the
// chokidar watcher is closed and the PIC-57 reload debouncer is quiesced
// (`markTornDown` + bounded `whenIdle`) end-to-end. The observable proof is
// negative and deterministic: with the fix, tearing these live probes down no
// longer leaks a watcher or fires a post-invalidate debounced rebuild, so the
// run is free of the `registry-swap-failed` / `stale after session replacement`
// / `system-note delivery failed` stderr noise it previously emitted.

import { describe, it, expect } from "vitest";
import { requireLiveProvider, runProbe } from "./probe-harness";
import type { ProbeResult, PlantedFile } from "./probe-harness";

const provider = requireLiveProvider();

function transportish(s: string | undefined): boolean {
  if (s === undefined) return false;
  return /429|overloaded|transport|rate.?limit|ECONNRESET|timeout|503|529/i.test(s);
}

type Turn = ProbeResult["turns"][number] | undefined;

// Live turns can fail for environmental (transport) reasons that are NOT the
// property under test. Some failure modes surface on `turn.error` (a final-turn
// transport fault propagated by `?`), but a per-iteration transport fault inside
// a `par for` body degrades an element to `Err` WITHOUT setting `turn.error` —
// the loop still runs to completion. So the retry decision is: retry when the
// last turn errored transport-ish, OR when the deterministic `expect` value the
// caller is about to assert is not yet present (`satisfied` is false). On the
// FINAL attempt we return whatever we have and let the caller's `expect` run, so
// a genuine (non-transport, persistent) defect still fails loudly — never a
// silent skip. `satisfied` is evaluated against the same code-computed channel
// the assertion reads, so this only ever masks transient environmental faults,
// not a real logic regression (which would fail every attempt).
async function driveRobust(
  make: () => Promise<ProbeResult>,
  satisfied: (u: string, turn: Turn) => boolean,
  attempts = 3,
): Promise<{ u: string; turn: Turn; probe: ProbeResult }> {
  let probe = await make();
  let turn = probe.turns[probe.turns.length - 1];
  let u = (turn?.userTexts ?? []).join("\n");
  for (let i = 1; i < attempts; i += 1) {
    const transient =
      transportish(turn?.error) || (turn?.systemNotes ?? []).some(transportish);
    if (!transient && satisfied(u, turn)) break;
    await probe.dispose();
    probe = await make();
    turn = probe.turns[probe.turns.length - 1];
    u = (turn?.userTexts ?? []).join("\n");
  }
  return { u, turn, probe };
}

// ===========================================================================
// RFC 0001 — `subagent fn`: real spawned-session turn + code-computed return
// ===========================================================================
//
// The subagent fn `bump` (a) issues ONE real `@` turn in its own spawned,
// isolated session and (b) returns `n + 1` (code-computed, independent of the
// model reply). The outer prompt-mode theta calls `bump(41)?` and surfaces the
// returned value into its final `@` userText.
//
// Deterministic channels & why non-stochastic:
//   * registeredNames ⊇ {sfnlive}     — discovery/parse/compose registered it.
//   * userTexts ⊇ "RES=42"            — 41 crossed by value → n+1 computed in
//                                        code → returned across the boundary;
//                                        reaching the tail proves the in-body
//                                        `@`? turn SUCCEEDED (else `?` would
//                                        surface on turn.error, not the tail).
//   * userTexts ∌ "CHILDTURN"         — the child's in-body turn text ran in the
//                                        private spawned session; it never
//                                        appears in the caller's transcript
//                                        (isolation).
//   * turn.error === undefined        — success terminal.
describe("RFC 0001 `subagent fn` — live spawned-session turn + code-computed return", () => {
  it(
    "FN-6: a subagent fn issues a real turn and returns a code-computed typed value across the isolation boundary",
    { timeout: 300000 },
    async () => {
      const files: PlantedFile[] = [
        {
          source: "project",
          path: "sfnlive.theta",
          text: [
            "---",
            "description: sfnlive",
            "mode: prompt",
            "---",
            // No return annotation: an inferred fn scope admits `?` (and infers
            // a `Result` return); an explicit non-`Result` annotation would
            // reject the in-body `?` as theta/parse/question-outside-result-fn.
            "subagent fn bump(n: integer) {",
            "  let _ = @`Reply with any short acknowledgement. Marker CHILDTURN-${n}.`?",
            "  n + 1",
            "}",
            "let v = bump(41)?",
            "@`RES=${v}|END`",
          ].join("\n"),
        },
      ];
      const { u, turn, probe } = await driveRobust(
        () => runProbe({ provider, files, drives: ["/sfnlive"] }),
        (text) => text.includes("RES=42"),
      );
      try {
        expect(probe.registeredNames).toContain("sfnlive");
        // Code-computed return crossed the boundary (41 → n+1 = 42). Its
        // presence + a success terminal proves the spawned session ran its turn.
        expect(u).toContain("RES=42");
        // Isolation: the child's private in-body turn text never reaches the
        // caller session's transcript.
        expect(u).not.toContain("CHILDTURN");
        expect(turn?.error).toBeUndefined();
      } finally {
        await probe.dispose();
      }
    },
  );
});

// ===========================================================================
// RFC 0003 — `par for`: each iteration issues a real turn via isolated work
// ===========================================================================
//
// CTRL-4: a bare `@` query against the enclosing conversation inside a par-for
// body is `theta/parse/par-query-in-body`, so each iteration does its live turn
// through an isolated `subagent fn` call (`work`), which issues one real turn in
// its own spawned session and returns `n + 100` (code-computed). The par for
// collects `array<Result<integer, QueryError>>`; the theta reduces it IN
// INPUT-INDEX ORDER (a count over the array + indexed reads) into a
// deterministic string.
//
// Deterministic channels & why non-stochastic:
//   * registeredNames ⊇ {parlive}     — registered.
//   * slot i holds EITHER input[i]+100 (an Ok iteration's code-computed value)
//     OR -1 (a per-iteration Err — legitimate under ERR-20). For input [2,3,5]:
//     v0 ∈ {102,-1}, v1 ∈ {103,-1}, v2 ∈ {105,-1}. A slot can NEVER hold another
//     index's value, so this catches any transposition/mis-ordering on EVERY
//     run (asserted, never retried) — independent of provider reliability.
//   * liveness: at least 2 of 3 iterations fanned out a real turn and succeeded
//     (a single transient per-iteration drop is tolerated — par for models it as
//     a per-iteration Err, so hard-requiring 3 would test the provider, not the
//     feature). Retry drives ONLY toward this liveness bar, never toward a
//     particular ordering, so an intermittent ordering defect cannot be masked.
//   * turn.error === undefined        — success terminal (whole-loop level).
describe("RFC 0003 `par for` — live per-iteration turns, ordered result collection", () => {
  it(
    "CTRL-3/CTRL-4: par for fans out real turns via isolated subagent fn calls and collects results in input-index order",
    { timeout: 300000 },
    async () => {
      const files: PlantedFile[] = [
        {
          source: "project",
          path: "parlive.theta",
          text: [
            "---",
            "description: parlive",
            "mode: prompt",
            "---",
            // Inferred (annotation-less) scope so the in-body `?` is admitted.
            "subagent fn work(n: integer) {",
            "  let _ = @`Reply with any short acknowledgement for ${n}.`?",
            "  n + 100",
            "}",
            "let results = par for x in [2, 3, 5] {",
            "  work(x)",
            "}",
            "let mut nok = 0",
            "for r in results {",
            "  let hit = match r { Ok(_) => 1, Err(_) => 0 }",
            "  nok = nok + hit",
            "}",
            "let v0 = match results[0] { Ok(n) => n, Err(_) => 0 - 1 }",
            "let v1 = match results[1] { Ok(n) => n, Err(_) => 0 - 1 }",
            "let v2 = match results[2] { Ok(n) => n, Err(_) => 0 - 1 }",
            "@`PARRES nok=${nok}|v0=${v0}|v1=${v1}|v2=${v2}|END`",
          ].join("\n"),
        },
      ];
      // Parse the code-computed per-index values: input[i]+100 for an Ok
      // iteration, or -1 for a per-iteration Err. Retry drives ONLY toward
      // liveness (>=2 of 3 succeeded); the ordering/value invariant below is
      // asserted on whatever we get and is NEVER retried, so an intermittent
      // mis-ordering cannot be masked by a lucky re-run.
      const parse = (text: string): { v: number[]; nok: number } => {
        const m = /v0=(-?\d+)\|v1=(-?\d+)\|v2=(-?\d+)/.exec(text);
        if (m === null) return { v: [], nok: 0 };
        const v = [Number(m[1]), Number(m[2]), Number(m[3])];
        return { v, nok: v.filter((x) => x !== -1).length };
      };
      const { u, turn, probe } = await driveRobust(
        () => runProbe({ provider, files, drives: ["/parlive"] }),
        (text) => parse(text).nok >= 2,
      );
      try {
        expect(probe.registeredNames).toContain("parlive");
        const { v, nok } = parse(u);
        // Three ordered slots were collected (input-index order preserved).
        expect(v.length).toBe(3);
        // CTRL-3: each slot holds its OWN input-ordered code-computed value or a
        // per-iteration Err (-1) — never another index's value. Catches any
        // transposition on every run, independent of provider reliability.
        expect([102, -1]).toContain(v[0]);
        expect([103, -1]).toContain(v[1]);
        expect([105, -1]).toContain(v[2]);
        // Liveness: at least two iterations actually fanned out real turns and
        // succeeded (a single transient per-iteration drop is tolerated because
        // par for models it as a per-iteration Err — see ERR-20).
        expect(nok).toBeGreaterThanOrEqual(2);
        expect(turn?.error).toBeUndefined();
      } finally {
        await probe.dispose();
      }
    },
  );
});

// ===========================================================================
// RFC 0002 — computed field values in Pi-tool arguments
// ===========================================================================
//
// A `read({ path: dir + "/" + name + ext })?` whose `path` is a NON-LITERAL
// expression (three `let`-bound identifiers joined by `+`) reads a planted data
// file (source "rel", so it lands relative to the theta's cwd). The known
// planted sentinel is surfaced into the final `@` userText, proving the computed
// argument resolved to the concrete path and the REAL `read` tool executed (a
// Pi-tool call issues no model turn, so the only live turn is the final `@`).
//
// Deterministic channels & why non-stochastic:
//   * registeredNames ⊇ {ctarg}       — registered.
//   * userTexts ⊇ SENTINEL            — the sentinel is planted by the test and
//                                        returned by the real tool; `?` unwraps
//                                        the tool's Ok(text) and the theta
//                                        interpolates it, so the surfaced value
//                                        is fixed data, not a model reply.
//   * turn.error === undefined        — success terminal.
describe("RFC 0002 computed tool args — live computed-path read of a planted file", () => {
  const SENTINEL = "THETA-SENTINEL-9K4Z-COMPUTED-ARG";

  it(
    "a non-literal computed `path` resolves and the real `read` tool returns the planted sentinel",
    { timeout: 300000 },
    async () => {
      const files: PlantedFile[] = [
        // Planted data file, relative to the theta's cwd (source "rel").
        { source: "rel", path: "data/sentinel.txt", text: SENTINEL },
        {
          source: "project",
          path: "ctarg.theta",
          text: [
            "---",
            "description: ctarg",
            "mode: prompt",
            "tools: read",
            "---",
            'let dir = "data"',
            'let name = "sentinel"',
            'let ext = ".txt"',
            // Computed argument: identifier references joined by `+` (non-literal).
            "let body = read({ path: dir + \"/\" + name + ext })?",
            "@`FILE=${body}|END`",
          ].join("\n"),
        },
      ];
      const { u, turn, probe } = await driveRobust(
        () => runProbe({ provider, files, drives: ["/ctarg"] }),
        (text) => text.includes(SENTINEL),
      );
      try {
        expect(probe.registeredNames).toContain("ctarg");
        // The computed path resolved and the real tool returned the planted
        // content — a code-fixed sentinel, not a model reply.
        expect(u).toContain(SENTINEL);
        expect(turn?.error).toBeUndefined();
      } finally {
        await probe.dispose();
      }
    },
  );
});
