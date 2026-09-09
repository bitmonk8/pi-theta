// RFC 0010 Phase 3 spec-surface gate — live execution visibility (L0-L2).
//
// The RFC 0010 plan lands spec before code (Phase 3 = normative amendments;
// later phases = tests + implementation). This gate guards the Phase 3
// landing against drift in the window before the behavioral witnesses exist,
// and it is the citing test the closing gate's `mapped-req-id-no-citing-test`
// arm requires for the fifteen REQ-IDs the landing coined per GOV-22:
//
//   EXST-1  .. EXST-12  (execution-status.md — the execution-status bus)
//   PIC-71, PIC-72      (pi-integration-contract/runtime-event-channel.md —
//                        the theta-progress-entry entry channel + migration)
//   PIC-73              (pi-integration-contract/capability-probe.md —
//                        optional UI/entry capability class)
//
// Scope discipline: every assertion here pins NORMATIVE TEXT (anchors in
// GOV-1 dual form, the coverage-matrix mapping). None of it asserts runtime
// behaviour — the behavioral witnesses land with the implementation phases
// and MUST supersede nothing here (this file stays as the spec-drift gate).
//
// Each cell fails loudly naming the missing surface; no cell can pass
// vacuously (readCorpus throws on unreadable/empty files).

import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const repoFile = (rel: string): string =>
  fileURLToPath(new URL(`../${rel}`, import.meta.url));

function readCorpus(rel: string): string {
  let text: string;
  try {
    text = readFileSync(repoFile(rel), "utf8");
  } catch (cause) {
    throw new Error(
      `harness precondition unmet: ${rel} is unreadable — RFC 0010's spec surface lives there, so a missing file is a loud failure, never a skip (${String(cause)})`,
    );
  }
  if (text.trim() === "") {
    throw new Error(`harness precondition unmet: ${rel} is empty; nothing to gate`);
  }
  return text;
}

const EXECUTION_STATUS = "docs/spec_topics/execution-status.md";
const RUNTIME_EVENT_CHANNEL = "docs/spec_topics/pi-integration-contract/runtime-event-channel.md";
const CAPABILITY_PROBE = "docs/spec_topics/pi-integration-contract/capability-probe.md";
const MATRIX = "docs/plan_topics/coverage-matrix.md";

describe("RFC 0010 spec surface — live execution visibility (L0-L2)", () => {
  it("EXST-1 — execution-status output is never a custom message, in GOV-1 dual form on execution-status.md", () => {
    const text = readCorpus(EXECUTION_STATUS);
    expect(text).toContain('<a id="exst-1"></a> **EXST-1.**');
    expect(text).toMatch(/EXST-1\.\*\*[^\n]*Execution-status output MUST NOT be delivered through `pi\.sendMessage`/);
  });

  it("EXST-2 — one bus per extension instance, no module-level/global state, in GOV-1 dual form", () => {
    const text = readCorpus(EXECUTION_STATUS);
    expect(text).toContain('<a id="exst-2"></a> **EXST-2.**');
    expect(text).toMatch(
      /an implementation MUST NOT hold the bus \(or any sink\/producer state\) as module-level or process-global state/,
    );
  });

  it("EXST-3 — the producer-set registry has a closed five-member entry shape obligation", () => {
    const text = readCorpus(EXECUTION_STATUS);
    expect(text).toContain('<a id="exst-3"></a> **EXST-3.**');
    expect(text).toMatch(
      /the bus is a read-only observer and MUST NOT extend the registry's closed five-member entry shape/,
    );
  });

  it("EXST-4 — the checkpoint decorator publishes synchronously and preserves per-kind yield semantics", () => {
    const text = readCorpus(EXECUTION_STATUS);
    expect(text).toContain('<a id="exst-4"></a> **EXST-4.**');
    expect(text).toMatch(
      /`before\(kind, site\)` MUST publish `\(invocationId, kind, site\)` to the bus synchronously and then delegate/,
    );
    expect(text).toMatch(
      /the decorator MUST preserve the production wiring's per-kind yield semantics unchanged/,
    );
  });

  it("EXST-5 — the child-activity tap is non-consuming, never retains class-3 fields, and mints no diagnostics", () => {
    const text = readCorpus(EXECUTION_STATUS);
    expect(text).toContain('<a id="exst-5"></a> **EXST-5.**');
    expect(text).toMatch(
      /the tap MUST NOT consume, detach, or reorder lines the drive listener needs/,
    );
    expect(text).toMatch(
      /class-3 fields per \[EXST-12\]\(#exst-12\)\) MUST NOT be retained, rendered, or forwarded/,
    );
    expect(text).toMatch(
      /MUST emit no diagnostic for unparseable, oversized, or unrecognised lines/,
    );
  });

  it("EXST-6 — sink re-rendering MUST be coalesced and never extends to the diagnostic channel", () => {
    const text = readCorpus(EXECUTION_STATUS);
    expect(text).toContain('<a id="exst-6"></a> **EXST-6.**');
    expect(text).toMatch(/Sink re-rendering MUST be coalesced/);
    expect(text).toMatch(
      /This coalescing governs the execution-status surface only and MUST NOT be extended to the diagnostic channel/,
    );
  });

  it("EXST-7 — bus state MUST be memory-bounded", () => {
    const text = readCorpus(EXECUTION_STATUS);
    expect(text).toContain('<a id="exst-7"></a> **EXST-7.**');
    expect(text).toMatch(/Bus state MUST be memory-bounded/);
  });

  it("EXST-8 — the sink degradation ladder: first-hard-failure permanent degrade, never refuse registration, hasUI not the sole gate", () => {
    const text = readCorpus(EXECUTION_STATUS);
    expect(text).toContain('<a id="exst-8"></a> **EXST-8.**');
    expect(text).toMatch(
      /the first hard failure of a surface MUST permanently degrade that sink for the extension instance/,
    );
    expect(text).toMatch(
      /a missing or failing surface MUST NOT refuse or degrade theta registration/,
    );
    expect(text).toMatch(/MUST NOT be the sole gate for any sink/);
  });

  it("EXST-9 — failure containment at the bus boundary", () => {
    const text = readCorpus(EXECUTION_STATUS);
    expect(text).toContain('<a id="exst-9"></a> **EXST-9.**');
    expect(text).toMatch(
      /A throw from any sink call or producer hook MUST be caught at the bus boundary/,
    );
  });

  it("EXST-10 — `theta.progress` default is `names` among `off | counts | names`", () => {
    const text = readCorpus(EXECUTION_STATUS);
    expect(text).toContain('<a id="exst-10"></a> **EXST-10.**');
    expect(text).toMatch(
      /takes exactly one of the string values `"off" \| "counts" \| "names"`, defaulting to `names` when absent or invalid/,
    );
  });

  it("EXST-11 — `/theta-status` view override never persists to any settings file or durable store", () => {
    const text = readCorpus(EXECUTION_STATUS);
    expect(text).toContain('<a id="exst-11"></a> **EXST-11.**');
    expect(text).toMatch(
      /the handler MUST NOT persist the choice to any settings file or other durable store/,
    );
  });

  it("EXST-12 — the three-class partition: class 3 never surfaced, class 2 clamped", () => {
    const text = readCorpus(EXECUTION_STATUS);
    expect(text).toContain('<a id="exst-12"></a> **EXST-12.**');
    expect(text).toMatch(
      /the feature MUST NOT surface, retain, or forward class-3 fields on any sink at any verbosity/,
    );
    expect(text).toMatch(
      /MUST be rate- and length-clamped before rendering, and class-2 rendering MUST be disabled entirely under `theta\.progress: off`/,
    );
  });

  it("PIC-71 — the theta-progress-entry channel never uses pi.sendMessage and registers its renderer synchronously in the factory body", () => {
    const text = readCorpus(RUNTIME_EVENT_CHANNEL);
    expect(text).toContain('<a id="pic-71"></a> **PIC-71.');
    expect(text).toMatch(
      /every emission on this channel MUST use `pi\.appendEntry\("theta-progress-entry", data\)` — never `pi\.sendMessage`/,
    );
    expect(text).toMatch(
      /the factory MUST register the `theta-progress-entry` entry renderer synchronously inside the factory body beside the message-renderer registration/,
    );
  });

  it("PIC-72 — the three migrated note classes fall back to the message channel and dedup is suppressed on neither channel", () => {
    const text = readCorpus(RUNTIME_EVENT_CHANNEL);
    expect(text).toContain('<a id="pic-72"></a> **PIC-72.');
    expect(text).toMatch(
      /the note MUST fall back to the pre-existing `pi\.sendMessage` realization above/,
    );
    expect(text).toMatch(
      /the renderer MUST NOT suppress duplicate lines on either channel/,
    );
  });

  it("PIC-73 — the optional UI/entry capability class never refuses registration, mints no diagnostics, and stays off CAPABILITY_OBLIGATIONS", () => {
    const text = readCorpus(CAPABILITY_PROBE);
    expect(text).toContain('<a id="pic-73"></a> **PIC-73.');
    expect(text).toMatch(
      /a missing or failing member MUST NOT refuse factory registration, MUST NOT suppress or degrade any theta's registration, and MUST NOT mint any diagnostic/,
    );
    expect(text).toMatch(
      /its members MUST NOT be added to `CAPABILITY_OBLIGATIONS`/,
    );
  });

  it("the coverage matrix maps EXST-1…EXST-12 and PIC-71…PIC-73 to RFC 0010", () => {
    const text = readCorpus(MATRIX);
    expect(text).toMatch(/\| EXST-1 … EXST-12 \| RFC 0010/);
    expect(text).toMatch(/\| PIC-71, PIC-72 \| RFC 0010/);
    expect(text).toMatch(/\| PIC-73 \| RFC 0010/);
  });
});
