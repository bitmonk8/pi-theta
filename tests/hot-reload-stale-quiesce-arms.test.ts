// Bug 0018 (PIC-67) — stage-2 quiesce-arm witnesses over a DIRECT
// `installHotReload` harness. The factory-level regression suite
// (tests/hot-reload-stale-ctx-replacement.test.ts) exercises the entry probe;
// the entry probe quiesces BEFORE the mid-flight machinery is reachable, so
// the belt-and-braces arm needs its own injection point: a harness whose probe
// passes (live runtime) and whose `rediscover` throws the byte-exact host
// stale-ctx error, modelling an invalidation landing after pass entry.
//
// Spec: session-shutdown-semantics.md PIC-67 clause (b) — the mid-pass escape
// is an evidence site: quiesce permanently, exactly one designed stderr line,
// never an ERR-7 attempt through the invalidated channel.

import { afterEach, describe, expect, it, vi } from "vitest";
import { installHotReload } from "../src/extension/hot-reload";
import { STALE_QUIESCE_STDERR_PREFIX } from "../src/extension/stale-ctx";
import { RELOAD_DEBOUNCE_WINDOW_MS } from "../src/extension/reload-debounce";
import { ThetaRegistry, type ParsedTheta } from "../src/extension/reload-wiring";
import type {
  SystemNoteChannelDeps,
  SystemNoteSender,
  SystemNoteDetails,
} from "../src/extension/system-note-channel";
import { FakeClock } from "./helpers/fake-clock";
import { FakeFileWatcher } from "./helpers/fake-file-watcher";

/** Byte-exact host stale-ctx message (see tests/system-note-channel.test.ts). */
const HOST_STALE_MESSAGE =
  "This extension ctx is stale after session replacement or reload. Do not use a captured pi or command ctx after ctx.newSession(), ctx.fork(), ctx.switchSession(), or ctx.reload(). For newSession, fork, and switchSession, move post-replacement work into withSession and use the ctx passed to withSession. For reload, do not use the old ctx after await ctx.reload().";

/** Flush the microtask queue so the in-flight reload pass settles. */
async function flush(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

const NOOP_RUN = async (): Promise<void> => {};
const theta = (slashName: string): ParsedTheta => ({
  slashName,
  frontmatter: { mode: "prompt" },
  body: { statements: [], tail: null },
  run: NOOP_RUN,
});

interface SentNote {
  readonly customType: string;
  readonly content: string;
  readonly display: boolean;
  readonly details?: SystemNoteDetails;
}

/** A recording (never-throwing) channel: any post-quiesce delivery would RECORD. */
function recordingChannel(): {
  readonly channel: SystemNoteChannelDeps;
  readonly sent: SentNote[];
} {
  const sent: SentNote[] = [];
  const pi: SystemNoteSender = {
    sendMessage(message, _options): void {
      sent.push({ ...message });
    },
  };
  return {
    channel: { pi, ui: { notify: vi.fn() }, emitDiagnostic: vi.fn() },
    sent,
  };
}

describe("bug 0018 (PIC-67) — mid-flight stale escape from the rediscover pass", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("PIC-67 belt-and-braces: a stale-ctx throw out of rediscover (entry probe passed) quiesces permanently with exactly one designed stderr line and no ERR-7 attempt", async () => {
    const calls: unknown[][] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]): void => {
      calls.push(args);
    });
    const quiesceLines = (): string[] =>
      calls
        .map((args) => args[0])
        .filter(
          (first): first is string =>
            typeof first === "string" &&
            first.startsWith(STALE_QUIESCE_STDERR_PREFIX),
        );
    const cascadeLines = (): string[] =>
      calls
        .map((args) => args[0])
        .filter(
          (first): first is string =>
            typeof first === "string" &&
            first.startsWith("system-note delivery failed:"),
        );

    const fakeWatcher = new FakeFileWatcher();
    const fakeClock = new FakeClock();
    const registry = new ThetaRegistry([["greet", theta("greet")]]);
    const { channel, sent } = recordingChannel();
    // The probe PASSES (live runtime at pass entry); the invalidation lands
    // mid-pass, surfacing as the host stale-ctx error out of the rediscover
    // closure — the belt-and-braces arm, not the entry probe.
    const probeRuntime = vi.fn((): void => {});
    const rediscover = vi.fn(async (): Promise<readonly ParsedTheta[]> => {
      throw new Error(HOST_STALE_MESSAGE);
    });
    const reRegister = vi.fn();

    installHotReload({
      watcher: fakeWatcher,
      clock: fakeClock,
      roots: ["/root"],
      registry,
      channel,
      rediscover,
      reRegister,
      initialNames: ["greet"],
      probeRuntime,
    });

    // First boundary: probe passes, rediscover throws stale mid-flight.
    fakeWatcher.emit({ kind: "change", path: "/root/greet.theta" });
    fakeClock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await flush();

    expect(probeRuntime).toHaveBeenCalledTimes(1);
    expect(rediscover).toHaveBeenCalledTimes(1);
    // Quiesce, not ERR-7: nothing was delivered through the channel and the
    // staged build never ran.
    expect(sent, "no ERR-7 attempt through the invalidated channel").toEqual([]);
    expect(reRegister).not.toHaveBeenCalled();
    expect(
      quiesceLines(),
      "exactly one designed stderr line on the mid-flight arm",
    ).toHaveLength(1);
    expect(cascadeLines(), "never a delivery-failed cascade").toEqual([]);

    // Permanence: a second event + boundary reaches neither the probe nor the
    // rediscover pass (watcher detached, debouncer torn down).
    fakeWatcher.emit({ kind: "change", path: "/root/greet.theta" });
    fakeClock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await flush();

    expect(probeRuntime, "the quiesce is permanent — no further probe").toHaveBeenCalledTimes(1);
    expect(rediscover).toHaveBeenCalledTimes(1);
    expect(quiesceLines(), "the stderr line is latched").toHaveLength(1);
  });
});
