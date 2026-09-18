// Shared fixture construction and transport-retry helpers for live hardening probes.
import type { PlantedFile } from "../live/hardening/probe-harness";

export const F = (path: string, lines: string[]): PlantedFile => ({
  source: "project",
  path,
  text: lines.join("\n"),
});

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
