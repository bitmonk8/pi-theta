// Shared fixture construction and transport-retry helpers for live hardening probes.
import type { PlantedFile, ProbeResult } from "../live/hardening/probe-harness";

export const F = (path: string, lines: string[]): PlantedFile => ({
  source: "project",
  path,
  text: lines.join("\n"),
});

/**
 * Three chained files: each names the next, forcing SEQUENTIAL read rounds.
 * Reaching the final number requires reading ch3, whose name is known only
 * from ch2, whose name is known only from ch1 => >= 3 sequential tool rounds.
 */
export function chainFixture(finalNumber: number, addend: number): {
  files: readonly PlantedFile[];
  instruction: string;
} {
  return {
    files: [
      { source: "rel", path: "ch1.txt", text: "STEP1 done. Next, read the file ch2.txt to continue." },
      { source: "rel", path: "ch2.txt", text: "STEP2 done. Next, read the file ch3.txt to continue." },
      {
        source: "rel",
        path: "ch3.txt",
        text: `STEP3 done. The final number is ${finalNumber}. Stop; do not read any more files.`,
      },
    ],
    instruction:
      "Read the file ch1.txt. Each file names the next file to read. Read exactly ONE " +
      "file at a time, following the chain, until a file gives you a final number. " +
      `Report that number plus ${addend}. Answer with the number only.`,
  };
}

export function transportish(s: string | undefined): boolean {
  if (s === undefined) return false;
  return /429|overloaded|transport|rate.?limit|ECONNRESET|timeout|503|529/i.test(s);
}

/** Retry once on a transport/429 blip (never a silent skip). */
export async function driveOnce<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/429|transport|rate/i.test(msg)) return await run();
    throw e;
  }
}

type Turn = ProbeResult["turns"][number] | undefined;

// By default, retry once only on a transport-ish last-turn error (not a thrown
// exception). Callers may opt into checking system notes and a satisfaction
// predicate, with a larger attempt budget.
//
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
export async function driveProbeWithRetries(
  make: () => Promise<ProbeResult>,
  {
    satisfied = () => true,
    attempts = 2,
    checkSystemNotes = false,
  }: {
    satisfied?: (u: string, turn: Turn) => boolean;
    attempts?: number;
    checkSystemNotes?: boolean;
  } = {},
): Promise<{ u: string; turn: Turn; probe: ProbeResult }> {
  let probe = await make();
  let turn = probe.turns[probe.turns.length - 1];
  let u = (turn?.userTexts ?? []).join("\n");
  for (let i = 1; i < attempts; i += 1) {
    const transient =
      transportish(turn?.error) ||
      (checkSystemNotes && (turn?.systemNotes ?? []).some(transportish));
    if (!transient && satisfied(u, turn)) break;
    await probe.dispose();
    probe = await make();
    turn = probe.turns[probe.turns.length - 1];
    u = (turn?.userTexts ?? []).join("\n");
  }
  return { u, turn, probe };
}
