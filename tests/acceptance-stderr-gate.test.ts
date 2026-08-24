// Bug 0030 defect (1) — the offline regression suite for the H9a stderr gate.
// It holds the two-direction contract of §Fix "Regression coverage" over one
// shared input set: the fix-direction assertions pin what the stderr gate
// rejects, and the gap-direction assertions pin what the permitted-code list
// scores instead. Together they hold the two gates on orthogonal axes.
//
// Why the gate exists
// (docs/bugs/0030-h9a-stderr-gate-gap-and-stale-intended-red-header.md):
// H9a (`tests/live/acceptance/noninteractive-acceptance.test.ts`) is the only
// always-run black-box capture of the real `pi -p` process tree's stderr.
// Without the gate this file locks, every assertion that scores that capture
// scores stream CONTENT, never line PRESENCE:
// `assertCodesSubsetOfPermitted` (all nine areas) extracts the
// `parseSystemNoteCodes` slug scan's substrings out of `stdout + "\n" + stderr`
// and checks them against `tests/fixtures/h7a/permitted-codes.json`, and area
// (e) adds `/cancel|aborted/i` plus a `theta/runtime/internal-error` absence
// check. The three theta-owned stderr line classes are prefix-marked plain
// lines carrying no `theta/<phase>/<slug>` substring, so the slug regex is blind
// to them by construction: with no presence gate, the PIC-67 quiesce line, a
// slug-less PIC-54 `system-note delivery failed:` cascade, and the reload
// debouncer's `theta hot-reload rebuild rejected:` sink each cross all ten H9a
// spawns green, and the three fix records naming a live suite as their stderr
// witness (0018/0021/0022) rest on nothing that can red.
//
// What this file locks — the §Fix "Regression coverage" paragraph, both
// directions, over the five synthetic stderr rows of §Reproduction:
//   • GAP: the existing predicates (`parseSystemNoteCodes` + the permitted-list
//     subset filter) pass rows 1, 2, 3 and 5 and red only on row 4. That is the
//     orthogonality lock — §Fix's orthogonality paragraph ("The new assertion
//     is **orthogonal** to `assertCodesSubsetOfPermitted`") keeps the permitted
//     list governing note CONTENT while the stderr gate scores the delivery
//     MECHANISM, so neither gate is a replacement for the other.
//   • FIX: `acceptanceStderrOffenders` / `assertStderrClean` reject all five
//     rows, accept a 0-byte and a whitespace-only capture, and ship an EMPTY
//     `ACCEPTANCE_STDERR_ALLOWLIST`.
//   • The H8a half's spy filter, `thetaOwnedStderrLines`, classifies all five
//     rows as theta-owned and lets host noise through.
//
// What the fix-direction assertions encode — the spec clause where one exists,
// the emit site where none does:
//   • PIC-67 (docs/spec_topics/pi-integration-contract/session-shutdown-semantics.md
//     #pic-67) clause (b): a stale-quiesced watcher emits exactly one designed
//     `theta hot-reload quiesced:` line per extension instance — so ZERO of them
//     in an ordinary acceptance run, which is bug 0021's recorded live
//     observable.
//   • PIC-54 (docs/spec_topics/pi-integration-contract/runtime-event-channel.md
//     #pic-54): `system-note delivery failed:` is the fallback chain's TERMINAL
//     sink; reaching it during an acceptance run is bug 0018's defect signature
//     whatever code the quoted note carries.
//   • Reload debouncer (`src/extension/reload-debounce.ts`, the bug 0018 /
//     0.28.0 rejection arm): `theta hot-reload rebuild rejected:` is that arm's
//     last-resort sink for an unrecognised rethrow. The arm is an
//     implementation detail inside the debouncer PIC-49 governs, not content of
//     `#pic-49` — that clause pins cross-window rebuild serialization and names
//     no stderr line.
//   • docs/plan_topics/real-host-smoke-gate.md — Phase 1 automated
//     non-interactive acceptance, the suite those records cite.
//   • AGENTS.md §"Verify both directions when adding or strengthening an
//     assertion": the live gate's red direction is proven HERE, offline and
//     token-free, so the live axis needs no token-burning injection run.
//
// Gate form: §Fix "Measured baseline (`dd4f3d3b`, 2026-07-29)" recorded 10/10
// green with 0 bytes of stderr on all ten H9a spawns, and §Fix's rule turns that
// measurement into the EMPTY-CAPTURE gate form rather than three-prefix
// rejection. `acceptanceStderrOffenders` therefore rejects any non-blank line —
// host noise included — and the committed allowlist ships empty.
//
// Zero tokens, no provider, no spawned process: the five stderr rows are the
// synthetic strings of §Reproduction and every `PiPrintResult` is hand-built, so
// this belongs in the default `npm test` (vitest.config.ts) and never in
// `tests/live/**`.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import { STALE_QUIESCE_STDERR_PREFIX as SRC_STALE_QUIESCE_STDERR_PREFIX } from "../src/extension/stale-ctx";
import {
  ACCEPTANCE_STDERR_ALLOWLIST,
  acceptanceStderrOffenders,
  assertStderrClean,
  featureTheta,
  loadPermittedCodes,
  parseSystemNoteCodes,
  type FeatureThetaSpec,
  type PiPrintResult,
} from "./live/acceptance/harness";
import {
  RELOAD_REBUILD_REJECTED_PREFIX,
  STALE_QUIESCE_STDERR_PREFIX,
  SYSTEM_NOTE_DELIVERY_FAILED_PREFIX,
  THETA_STDERR_LINE_PREFIXES,
  thetaOwnedStderrLines,
} from "./live/theta-stderr-prefixes";

// ---------------------------------------------------------------------------
// The five synthetic stderr rows of bug 0030 §Reproduction.
// ---------------------------------------------------------------------------

/** One row of the §Reproduction table: a theta-owned stderr line and its scoring. */
interface StderrRow {
  readonly n: 1 | 2 | 3 | 4 | 5;
  /** Which emit site the line stands for. */
  readonly what: string;
  /** The line itself, as one `console.error` write would render it. */
  readonly line: string;
  /** What the slug regex extracts from the line (§Reproduction column 2). */
  readonly extractedCodes: readonly string[];
  /** Whether the nine-area subset gate reds on it (§Reproduction column 3). */
  readonly redsNineAreaSubsetGate: boolean;
}

const ROWS: readonly StderrRow[] = [
  {
    n: 1,
    what: "PIC-67 clause (b) stale-quiesce line",
    // The prefix is imported, never re-literalised: a rename at the emit site
    // must reach this row rather than leave it silently scoring dead text.
    line: `${STALE_QUIESCE_STDERR_PREFIX} This extension ctx is stale…`,
    extractedCodes: [],
    redsNineAreaSubsetGate: false,
  },
  {
    n: 2,
    what: "PIC-54 cascade quoting a slug-less SLSH-3 note",
    line: "system-note delivery failed: theta /greet returned Err: …",
    extractedCodes: [],
    redsNineAreaSubsetGate: false,
  },
  {
    n: 3,
    what: "PIC-54 cascade quoting a PERMITTED code",
    line: "system-note delivery failed: theta/runtime/internal-error: …",
    extractedCodes: ["theta/runtime/internal-error"],
    redsNineAreaSubsetGate: false,
  },
  {
    n: 4,
    what: "PIC-54 cascade quoting a NON-permitted code",
    line: "system-note delivery failed: theta/runtime/registry-swap-failed: …",
    extractedCodes: ["theta/runtime/registry-swap-failed"],
    redsNineAreaSubsetGate: true,
  },
  {
    n: 5,
    what: "reload-debouncer rebuild-rejected sink",
    line: "theta hot-reload rebuild rejected: …",
    extractedCodes: [],
    redsNineAreaSubsetGate: false,
  },
];

/**
 * A line a real spawned `pi -p` child could write that theta does not own. Under
 * the measured-baseline gate form this is still an offender for the H9a capture
 * gate (which asserts an empty capture) while staying invisible to the H8a spy
 * filter (which scores only theta's own writes) — the two predicates differ here
 * and that difference is deliberate.
 */
const HOST_NOISE_LINE =
  "(node:4242) [DEP0040] DeprecationWarning: The `punycode` module is deprecated.";

/** Look up a row by its §Reproduction number, failing loudly on a mis-transcription. */
function row(n: StderrRow["n"]): StderrRow {
  const found = ROWS.find((candidate) => candidate.n === n);
  if (found === undefined) {
    throw new Error(
      `bug 0030 §Reproduction row ${n} is missing from the transcription above; ` +
        `the five-row table is this file's whole input set`,
    );
  }
  return found;
}

/** A captured stderr stream: one newline-terminated line per `console.error` write. */
function capture(...lines: readonly string[]): string {
  return lines.map((line) => `${line}\n`).join("");
}

/** A synthetic `pi -p` capture: no-error exit, empty stdout, the given stderr. */
function printResult(stderr: string): PiPrintResult {
  return { exitCode: 0, stdout: "", stderr };
}

/**
 * The nine-area subset gate's predicate, reproduced locally because the helper
 * it lives in (`assertCodesSubsetOfPermitted`, file-private in
 * `noninteractive-acceptance.test.ts`) is not importable. The real
 * `parseSystemNoteCodes` and `loadPermittedCodes` do the work, so a change to
 * either reaches these rows.
 */
function codesOutsidePermitted(result: PiPrintResult): readonly string[] {
  const permitted = new Set(loadPermittedCodes());
  const emitted = parseSystemNoteCodes(`${result.stdout}\n${result.stderr}`);
  return emitted.filter((code) => !permitted.has(code));
}

/** A real committed spec — `assertStderrClean` takes one for its failure label. */
const PROMPT_SENTINEL_SPEC: FeatureThetaSpec = featureTheta("prompt-sentinel");

/**
 * Assert the gate fails a capture. An absent export makes the call site throw
 * `TypeError`, which a bare `toThrow()` would accept — excluding it keeps each
 * row witnessing the gate REJECTING the line rather than the gate being missing.
 */
function expectGateRejects(stderr: string): void {
  const call = (): void => {
    assertStderrClean(printResult(stderr), PROMPT_SENTINEL_SPEC);
  };
  expect(call).toThrow();
  expect(call).not.toThrow(TypeError);
}

// ---------------------------------------------------------------------------
// Premises. If the committed permitted-code list shifts under this file, the
// rows stop isolating what they were transcribed to isolate — say so loudly
// rather than let a row quietly witness nothing.
// ---------------------------------------------------------------------------

describe("bug 0030 — premises the five §Reproduction rows rest on", () => {
  it("the committed permitted-code list still SANCTIONS `theta/runtime/internal-error` (row 3)", () => {
    expect(
      loadPermittedCodes(),
      "row 3 witnesses a cascade quoting a code the permitted list sanctions as " +
        "note content; without that the row stops separating note content " +
        "from stderr-line presence",
    ).toContain("theta/runtime/internal-error");
  });

  it("the committed permitted-code list still EXCLUDES `theta/runtime/registry-swap-failed` (row 4)", () => {
    expect(
      loadPermittedCodes(),
      "row 4 is the one shape the existing nine-area gate catches; were the code " +
        "added to the list, the existing gate would go blind to it as well",
    ).not.toContain("theta/runtime/registry-swap-failed");
  });
});

// ---------------------------------------------------------------------------
// GAP direction — the orthogonality lock. §Fix's orthogonality paragraph ("The
// new assertion is **orthogonal** to `assertCodesSubsetOfPermitted`") keeps the
// permitted-code list governing note CONTENT; the stderr gate scores the
// delivery MECHANISM. These assertions pin that separation by scoring the five
// rows with the permitted-codes predicates alone.
// ---------------------------------------------------------------------------

describe("bug 0030 gap — the H9a slug regex scores note content, never stderr-line presence", () => {
  for (const r of ROWS) {
    it(`row ${r.n} (${r.what}): the slug regex extracts ${JSON.stringify(r.extractedCodes)}`, () => {
      expect(
        parseSystemNoteCodes(capture(r.line)),
        `row ${r.n} is a prefix-marked plain line; the extraction is what decides ` +
          "whether the nine-area gate can see it at all",
      ).toStrictEqual(r.extractedCodes);
    });
  }

  it("rows 1, 2 and 5 carry no code at all, so the nine-area subset gate passes them", () => {
    for (const n of [1, 2, 5] as const) {
      const r = row(n);
      expect(
        codesOutsidePermitted(printResult(capture(r.line))),
        `row ${n} (${r.what}) must remain invisible to the permitted-codes gate — ` +
          "it is the gap bug 0030 files, and the new stderr gate is what closes it",
      ).toStrictEqual([]);
    }
  });

  it("row 3's code is on the committed permitted list, so the nine-area subset gate passes it too", () => {
    const r = row(3);
    expect(
      codesOutsidePermitted(printResult(capture(r.line))),
      "a delivery-failed cascade quoting a sanctioned code is a defect on stderr " +
        "and sanctioned content on stdout; only the stderr gate can tell them apart",
    ).toStrictEqual([]);
  });

  it("row 4 is the only row the nine-area subset gate reds on", () => {
    const reddening = ROWS.filter(
      (r) => codesOutsidePermitted(printResult(capture(r.line))).length > 0,
    ).map((r) => r.n);
    expect(
      reddening,
      "the 0022 fix record's claim is exactly this one shape; the four other " +
        "theta-owned stderr lines pass all nine areas",
    ).toStrictEqual(ROWS.filter((r) => r.redsNineAreaSubsetGate).map((r) => r.n));
  });

  it("no row reds area (e)'s two extra checks except row 3's `internal-error` absence check", () => {
    const cancelTokenRows = ROWS.filter((r) => /cancel|aborted/i.test(r.line)).map((r) => r.n);
    const internalErrorRows = ROWS.filter((r) =>
      r.line.includes("theta/runtime/internal-error"),
    ).map((r) => r.n);
    expect(
      cancelTokenRows,
      "area (e)'s `/cancel|aborted/i` check scores the subagent success terminal; " +
        "the two emitted quiesce detail strings (`hot-reload.ts`, " +
        "`watcher-recovery.ts`) carry no such token, and row 5's rebuild-rejected " +
        "detail here is synthetic and token-free by construction — a real " +
        "unrecognised rethrow appends its own reason, which can carry one",
    ).toStrictEqual([]);
    expect(
      internalErrorRows,
      "area (e)'s absence check reaches row 3 — in one area of nine, and only " +
        "for that one code",
    ).toStrictEqual([3]);
  });
});

// ---------------------------------------------------------------------------
// FIX direction — the pure predicate `acceptanceStderrOffenders`: which lines of
// a capture count as offenders under the empty-capture gate form.
// ---------------------------------------------------------------------------

describe("bug 0030 fix — `acceptanceStderrOffenders` rejects every theta-owned stderr line", () => {
  for (const r of ROWS) {
    it(`row ${r.n} (${r.what}) is reported as an offender`, () => {
      expect(
        acceptanceStderrOffenders(capture(r.line)),
        `row ${r.n} must red the new gate; it passes the permitted-codes gate ` +
          `(nine-area red: ${String(r.redsNineAreaSubsetGate)}), which is the ` +
          "gap bug 0030 files",
      ).toStrictEqual([r.line]);
    });
  }

  it("a 0-byte capture is clean — the recorded baseline for all ten H9a spawns", () => {
    expect(
      acceptanceStderrOffenders(""),
      "the measured baseline (§Fix, `dd4f3d3b`, 2026-07-29) is 0 bytes on every " +
        "spawn; a gate that reds on it could never land green",
    ).toStrictEqual([]);
  });

  it("a whitespace-only capture is clean — blank lines are dropped before the allowlist filter", () => {
    expect(
      acceptanceStderrOffenders("\n  \n\t\n"),
      "a trailing newline on an otherwise silent stream must not read as an offender",
    ).toStrictEqual([]);
  });

  it("host noise is an offender too — the measured baseline selected the empty-capture form", () => {
    expect(
      acceptanceStderrOffenders(capture(HOST_NOISE_LINE)),
      "§Fix's rule takes the three-prefix form only when the baseline carries host " +
        "noise; it carried none, so any non-blank line is an offender. Weakening " +
        "this to prefix rejection needs a re-recorded baseline in the bug document",
    ).toStrictEqual([HOST_NOISE_LINE]);
  });

  it("every offending line of a multi-line capture is reported in capture order", () => {
    const stderr = capture(row(1).line, HOST_NOISE_LINE, row(5).line);
    expect(
      acceptanceStderrOffenders(stderr),
      "a live red must name each line so the failure is diagnosable without a re-run",
    ).toStrictEqual([row(1).line, HOST_NOISE_LINE, row(5).line]);
  });

  it("the committed allowlist ships EMPTY", () => {
    expect(
      ACCEPTANCE_STDERR_ALLOWLIST,
      "the measured baseline (§Fix, `dd4f3d3b`, 2026-07-29) recorded 0 bytes of " +
        "stderr on all ten spawns, so nothing is admissible yet. An entry is " +
        "admissible only when it appears in a re-recorded baseline written into " +
        "the bug document; populating it reactively from a first red degrades the " +
        "empty-capture gate into prefix rejection with no record of the change",
    ).toStrictEqual([]);
  });
});

// ---------------------------------------------------------------------------
// FIX direction — `assertStderrClean`, the vitest assertion the ten H9a spawn
// sites call beside `assertCodesSubsetOfPermitted`.
// ---------------------------------------------------------------------------

describe("bug 0030 fix — `assertStderrClean` gates each spawned `pi -p` capture", () => {
  for (const r of ROWS) {
    it(`row ${r.n} (${r.what}) throws out of the gate`, () => {
      expectGateRejects(capture(r.line));
    });
  }

  it("a 0-byte capture passes the gate", () => {
    expect(() => assertStderrClean(printResult(""), PROMPT_SENTINEL_SPEC)).not.toThrow();
  });

  it("a theta-owned line on STDOUT does not red the stderr gate", () => {
    // §Fix's orthogonality paragraph: the permitted-code list keeps governing
    // note content on stdout; this gate scores the stderr stream alone, so the
    // two never contradict.
    const stdoutOnly: PiPrintResult = {
      exitCode: 0,
      stdout: capture(row(3).line),
      stderr: "",
    };
    expect(() => assertStderrClean(stdoutOnly, PROMPT_SENTINEL_SPEC)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// FIX direction — `tests/live/theta-stderr-prefixes.ts`: the shared prefix
// module and the H8a `console.error` spy filter that both live halves import.
// ---------------------------------------------------------------------------

describe("bug 0030 fix — `thetaOwnedStderrLines` is the H8a spy filter", () => {
  it("classifies all five rows as theta-owned", () => {
    const lines = ROWS.map((r) => r.line);
    expect(
      thetaOwnedStderrLines(lines),
      "an in-process spy over `console.error` must see every one of the three " +
        "theta-owned line classes, which is what makes the H8a zero assertion " +
        "able to red",
    ).toStrictEqual(lines);
  });

  it("lets host noise through — a spy also records writes theta does not own", () => {
    expect(
      thetaOwnedStderrLines([HOST_NOISE_LINE]),
      "the H8a gate scores theta's own writes; a node or provider warning is not " +
        "a theta regression",
    ).toStrictEqual([]);
  });

  it("keeps only the theta-owned lines out of a mixed capture, in order", () => {
    expect(
      thetaOwnedStderrLines([HOST_NOISE_LINE, row(1).line, HOST_NOISE_LINE, row(4).line]),
    ).toStrictEqual([row(1).line, row(4).line]);
  });

  it("exports the three prefixes, the quiesce one re-exported from src rather than re-literalised", () => {
    expect(
      STALE_QUIESCE_STDERR_PREFIX,
      "re-literalising the quiesce prefix here would let a rename at " +
        "`src/extension/stale-ctx.ts` leave both gates scoring dead text",
    ).toBe(SRC_STALE_QUIESCE_STDERR_PREFIX);
    expect(
      SYSTEM_NOTE_DELIVERY_FAILED_PREFIX,
      "byte-exact with the PIC-54 terminal sink at " +
        "`src/extension/system-note-channel.ts:296` and :373",
    ).toBe("system-note delivery failed:");
    expect(
      RELOAD_REBUILD_REJECTED_PREFIX,
      "byte-exact with the reload-debouncer rejection sink at " +
        "`src/extension/reload-debounce.ts:205`",
    ).toBe("theta hot-reload rebuild rejected:");
    expect([...THETA_STDERR_LINE_PREFIXES].sort()).toStrictEqual(
      [
        STALE_QUIESCE_STDERR_PREFIX,
        SYSTEM_NOTE_DELIVERY_FAILED_PREFIX,
        RELOAD_REBUILD_REJECTED_PREFIX,
      ].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// Bug 0047 — the same two-direction lock for the `theta/host/*` namespace.
//
// The rows above are all `theta/runtime/*` or slug-less, so nothing in the
// default suite scores a host code against the permitted-code gate. The
// registry's namespace set is closed and has four members — `theta/parse/*`,
// `theta/load/*`, `theta/runtime/*`, `theta/host/*`
// (docs/spec_topics/diagnostics/diagnostic-shape.md, §"Code namespaces") — and
// the committed permitted list carries one host entry,
// `theta/host/session-start-supersession-detach-failed`, appended by bug 0029's
// fix as coordination with this gate. A permission the gate cannot consult
// grants nothing, so both rows below are scored with the real
// `parseSystemNoteCodes` + `loadPermittedCodes` predicates: the permitted row
// must pass BECAUSE it is permitted, the unpermitted row must red.
//
// The shape scored is note CONTENT, not a stderr line: the supersession row is
// the one registered host row routed through the persistent-diagnostic
// channel's system-note fallback chain, and a location-less diagnostic renders
// as `<code>: <message>` (`renderDiagnosticLine`, `src/diagnostics/diagnostic.ts`)
// into one `theta-system-note` (`emitDiagnosticBatch`,
// `src/extension/system-note-channel.ts`). That surface is scored by the code
// gate alone, which is why the stderr gate above cannot substitute for it.
// ---------------------------------------------------------------------------

/** One parsed row of the sharded diagnostics registry (`tools/code-registry`). */
interface HostRegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

/**
 * The live `theta/host/*` registry shard, read from the spec corpus. Only the
 * host shard is read: both codes below live there, and a row that moved off the
 * page SHOULD red here rather than be silently found elsewhere.
 */
const HOST_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../docs/spec_topics/diagnostics/code-registry-host.md", import.meta.url),
    ),
    "utf8",
  ),
) as HostRegistryRow[];

/**
 * DIAG-4: the *Message* column is normative, so the synthetic note text is
 * rendered from the registry template rather than transcribed. A missing row
 * fails loudly naming the page and the code (AGENTS.md §"No silent skipping"),
 * never degrading into a note whose text is `undefined`.
 */
function hostNoteContent(code: string, placeholders: Readonly<Record<string, string>>): string {
  const template = registryMessage(HOST_REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-host.md must carry the ` +
        `Message row for ${code}`,
    );
  }
  let message = template;
  for (const [placeholder, value] of Object.entries(placeholders)) {
    if (!message.includes(placeholder)) {
      throw new Error(
        `DIAG-4 anchor: the registry Message for ${code} on ` +
          `docs/spec_topics/diagnostics/code-registry-host.md no longer carries the ` +
          `${placeholder} placeholder this row interpolates`,
      );
    }
    message = message.split(placeholder).join(value);
  }
  // The location-less diagnostic render form (`renderDiagnosticLine`,
  // `src/diagnostics/diagnostic.ts`) — the exact bytes the code gate scores.
  return `${code}: ${message}`;
}

/** The permitted host entry (`tests/fixtures/h7a/permitted-codes.json`, bug 0029's append). */
const PERMITTED_HOST_CODE = "theta/host/session-start-supersession-detach-failed";

/** A registered host code deliberately absent from the committed list. */
const UNPERMITTED_HOST_CODE = "theta/host/session-shutdown-teardown-step-failed";

/** One row of the bug 0047 §Reproduction table: a host-namespace system note and its scoring. */
interface HostRow {
  readonly n: 1 | 2;
  /** Which registered host row the note stands for. */
  readonly what: string;
  /** The note content, rendered from the registry Message template. */
  readonly content: string;
  /** Whether the committed permitted list sanctions the code. */
  readonly permitted: boolean;
  /** The code the extraction must yield — the namespace segment is the whole cut. */
  readonly code: string;
}

const HOST_ROWS: readonly HostRow[] = [
  {
    n: 1,
    what: "supersession detach failure, system-note routed and PERMITTED",
    content: hostNoteContent(PERMITTED_HOST_CODE, {
      "<call>": "hotReloadHandle.detach",
      "<error>": "boom",
    }),
    permitted: true,
    code: PERMITTED_HOST_CODE,
  },
  {
    n: 2,
    what: "teardown sub-step failure, NOT permitted",
    content: hostNoteContent(UNPERMITTED_HOST_CODE, {
      "<step>": "4",
      "<call>": "discoveryWatcher.close",
      "<error>": "boom",
    }),
    permitted: false,
    code: UNPERMITTED_HOST_CODE,
  },
];

describe("bug 0047 — premises the two host-namespace rows rest on", () => {
  it("the committed permitted-code list still SANCTIONS the supersession host code (row 1)", () => {
    expect(
      loadPermittedCodes(),
      "row 1 must witness a permission that is actually consulted; were the entry " +
        "dropped, the row would pass on absence instead and the gate would look fixed",
    ).toContain(PERMITTED_HOST_CODE);
  });

  it("the committed permitted-code list still EXCLUDES the teardown-step host code (row 2)", () => {
    expect(
      loadPermittedCodes(),
      "row 2 is the red direction; permitting the code would restore the blindness " +
        "through a different mechanism",
    ).not.toContain(UNPERMITTED_HOST_CODE);
  });
});

describe("bug 0047 — the H9a permitted-code gate scores the `theta/host/*` namespace", () => {
  for (const r of HOST_ROWS) {
    it(`row ${r.n} (${r.what}): the extraction yields the host code`, () => {
      expect(
        parseSystemNoteCodes(capture(r.content)),
        `row ${r.n} is a location-less host diagnostic rendered into note content; ` +
          "the extraction is what decides whether the gate can see it at all",
      ).toStrictEqual([r.code]);
    });
  }

  for (const r of HOST_ROWS) {
    it(`row ${r.n} (${r.what}): the subset gate ${r.permitted ? "passes it because it is permitted" : "reds and names the code"}`, () => {
      expect(
        codesOutsidePermitted(printResult(capture(r.content))),
        r.permitted
          ? "row 1 must be admitted BECAUSE the committed list sanctions it, not " +
              "because the gate cannot see the namespace at all"
          : "a host-lifecycle anomaly is not expected in an acceptance run; a gate " +
              "that cannot red on it scores nothing in this namespace",
      ).toStrictEqual(r.permitted ? [] : [r.code]);
    });
  }
});
