import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { isThetaPanic } from "../src/runtime/runtime-panics";
import { InterpolatedResultPanic } from "../src/render/query-render";

// b0265 — the panic-scoping remnant-surface oracle.
//
// Bug 0265 (docs/bugs/0265-panic-list-scoping-remnants-contradict-a2-ruling.md)
// records three surfaces that bug 0117's granted scope did not cover and that
// therefore still speak the pre-ruling language: they type EVERY panic note's
// diagnostic as `theta/runtime/*`, and they scope the `par for` downgrade to a
// six-entry source list, while the shipped predicate the prose describes
// (`isThetaPanic`) admits a seventh `ThetaPanic` whose registered code is
// parse-namespaced (`InterpolatedResultPanic`, `theta/parse/interpolated-result`).
//
// THE SETTLED DISPOSITION THIS FILE SCORES, from bug 0117's operator ruling
// (fifteenth set, ruling 1 = disposition (a)(2)), landed in 0.256.0 and NOT
// re-litigated here: the panic-source list stays six, scoped to the sources of
// `theta/runtime/*` panics, with QRY-18's runtime fallback stated beside it as
// the one exception — a `ThetaPanic` carrying a parse-namespaced code, keeping
// panic routing. Bug 0265 §Non-goals forbids widening the list to seven on any
// page and forbids changing `src/`; the remedy is per-surface requalification.
//
// So this oracle scores two directions, as the sibling b0117 oracle does:
//
//   Cells A-C are RED at the unfixed tree. They assert the requalification bug
//   0265 §Fix prescribes on the three consuming surfaces — the four panic-note
//   sites in docs/spec_topics/pi-integration-contract/runtime-event-channel.md,
//   the **always-log set** entry in docs/spec_topics/glossary.md, and ERR-20 in
//   docs/reference/errors-and-results.md.
//
//   Cells D-E are GREEN at the unfixed tree and MUST stay green. Cell D derives
//   from `src/` the observable ERR-20's scope clause misstates, so the sentence
//   the spec is about to state is checked against the code rather than against
//   itself. Cell E pins the half of the disposition that forbids the widening
//   remedy: the six-source prose, the five `console.error` exclusions, the
//   group A/B partition, and ERR-20's downgrade fields all stay as they are.
//
// Assertions are SEMANTIC PATTERNS over an extracted site located BY CONTENT,
// never a verbatim snapshot and never a hard-coded line index: the fix must
// survive editorial rewording and neighbouring insertions while still
// reddening on the pre-fix bytes. Derived line numbers appear in failure
// messages only, where they are recomputed from the tree on every run.
//
// Spec anchors (every line re-derived against this tree):
//   - docs/spec_topics/pi-integration-contract/runtime-event-channel.md line 22
//     — the `details: { diagnostics: Diagnostic[] }` payload bullet, whose
//     runtime-panic clause types the batch's diagnostic `theta/runtime/*`.
//   - docs/spec_topics/pi-integration-contract/runtime-event-channel.md line 32
//     — the per-variant `display` / `content` table row keyed "runtime panic
//     (single-element batch, `theta/runtime/*` code)".
//   - docs/spec_topics/pi-integration-contract/runtime-event-channel.md line 57
//     — the group-B enumeration bullet, "Runtime panics — every row of
//     [Diagnostics — `theta/runtime/*`]", minus the five `console.error`
//     exclusions.
//   - docs/spec_topics/pi-integration-contract/runtime-event-channel.md line 91
//     — the dedup bullet, "A panic emits exactly one `theta-system-note` per
//     top-level panic … carrying a single `theta/runtime/*` diagnostic".
//   - docs/spec_topics/pi-integration-contract/runtime-event-channel.md lines 40
//     and 46 and 55 — the group A/B partition sentence and the two group
//     headers, which cell E pins unchanged.
//   - docs/spec_topics/glossary.md line 7 — the **always-log set** entry, whose
//     panic members carry the same typing one level up and whose `See:` target
//     is where cell B lets the detail live.
//   - docs/reference/errors-and-results.md line 127 — the `<a id="err-20"></a>`
//     anchor cell C locates ERR-20 by; the downgrade's scope clause runs at
//     docs/reference/errors-and-results.md lines 129 and 130, and the
//     source-list statement at docs/reference/errors-and-results.md lines 139
//     to 141.
//   - docs/reference/errors-and-results.md lines 95 and 96 — the landed (a)(2)
//     exception wording the three surfaces are requalified to match.
//   - docs/spec_topics/diagnostics/code-registry-runtime.md line 7 — the
//     six-source prose bug 0265 §Non-goals pins true unmodified (cell E).
//   - `isThetaPanic` (`src/runtime/runtime-panics.ts`) and
//     `InterpolatedResultPanic` (`src/render/query-render.ts`) — the predicate
//     and the class cell D reads the observable off.

const repoFile = (rel: string): string =>
  fileURLToPath(new URL(`../${rel}`, import.meta.url));

/**
 * Read a corpus file. A missing or empty file is a HARNESS failure that names
 * the unmet precondition and throws — never a skip, never an early return.
 */
function readCorpus(rel: string): string {
  let text: string;
  try {
    text = readFileSync(repoFile(rel), "utf8");
  } catch (cause) {
    throw new Error(
      `harness precondition unmet: ${rel} is unreadable, and it is this oracle's only source for the bug 0265 surface it owns — a missing corpus file is a loud failure, never a skip (${String(cause)})`,
    );
  }
  if (text.trim() === "") {
    throw new Error(
      `harness precondition unmet: ${rel} is empty; nothing to score`,
    );
  }
  return text;
}

const linesOf = (text: string): readonly string[] => text.split(/\r?\n/);

/** Line wrapping is editorial, so every prose match runs over a flattened run. */
const flatten = (text: string): string => text.replace(/\s+/g, " ").trim();

const RUNTIME_EVENT_CHANNEL =
  "docs/spec_topics/pi-integration-contract/runtime-event-channel.md";
const GLOSSARY = "docs/spec_topics/glossary.md";
const REFERENCE = "docs/reference/errors-and-results.md";
const REGISTRY_RUNTIME =
  "docs/spec_topics/diagnostics/code-registry-runtime.md";

/** The one exception the settled disposition names, by code and by class. */
const EXCEPTION_CODE = "theta/parse/interpolated-result";
const EXCEPTION_CLASS = "InterpolatedResultPanic";

/**
 * Half (a) of the requalification contract: the site admits the one
 * parse-namespaced panic, either by naming its code or by naming the property.
 */
const PARSE_NAMESPACED_QUALIFIER =
  /theta\/parse\/interpolated-result|parse-namespaced/;

/**
 * Half (b): the site points at the page that owns the exception's statement,
 * so the qualifier stays one clause instead of restating the ruling in place.
 */
const RUNTIME_PANICS_XREF = /errors-and-results\.md(?:#runtime-panics)?/;

interface Site {
  /** What the site is, for the failure message. */
  readonly what: string;
  /** 1-based line number, re-derived on every run. */
  readonly line: number;
  /** The site's own text, flattened. */
  readonly text: string;
}

/**
 * Locate one site by content. Exactly one match is required: zero means the
 * page moved out from under the cell (a loud harness failure, since a
 * silently-absent site would score vacuously), and more than one means the
 * predicate no longer identifies a single sentence.
 */
function locateSite(
  rel: string,
  what: string,
  matches: (line: string) => boolean,
): Site {
  const lines = linesOf(readCorpus(rel));
  const hits: Site[] = [];
  lines.forEach((line, index) => {
    if (matches(line))
      hits.push({ what, line: index + 1, text: flatten(line) });
  });
  if (hits.length !== 1) {
    throw new Error(
      `harness precondition unmet: ${rel} carries ${hits.length} lines matching the ${what} site, expected exactly one — bug 0265 §Fix names this site, so a cell that cannot find it must fail loudly rather than pass vacuously${hits.length > 1 ? ` (found at ${rel} lines ${hits.map((h) => h.line).join(", ")})` : ""}`,
    );
  }
  return hits[0] as Site;
}

/** The four panic-note sites bug 0265 §Fix item 1 requalifies. */
function panicNoteSites(): readonly Site[] {
  return [
    locateSite(
      RUNTIME_EVENT_CHANNEL,
      "`details: { diagnostics: Diagnostic[] }` payload bullet",
      (l) =>
        l.startsWith("- `details: { diagnostics: Diagnostic[] }`") &&
        l.includes("runtime-panic case"),
    ),
    locateSite(
      RUNTIME_EVENT_CHANNEL,
      "per-variant `display` / `content` table row for the runtime-panic variant",
      (l) =>
        l.startsWith("|") && l.includes("runtime panic (single-element batch"),
    ),
    locateSite(RUNTIME_EVENT_CHANNEL, "group-B enumeration bullet", (l) =>
      l.startsWith("- Runtime panics — every row of"),
    ),
    locateSite(
      RUNTIME_EVENT_CHANNEL,
      "deduplication panic-emission bullet",
      (l) =>
        l.includes(
          "A panic emits exactly one `theta-system-note` per top-level panic",
        ),
    ),
  ];
}

/** The **always-log set** glossary entry bug 0265 §Fix item 2 requalifies. */
function alwaysLogEntry(): Site {
  return locateSite(GLOSSARY, "**always-log set** entry", (l) =>
    l.startsWith("- **always-log set**"),
  );
}

interface Err20 {
  /** ERR-20's contiguous paragraph run, flattened. */
  readonly flat: string;
  /** 1-based line of the `<a id="err-20"></a>` anchor. */
  readonly anchorLine: number;
  /** 1-based line the run ends on. */
  readonly endLine: number;
}

/** ERR-20, located by its anchor rather than by position. */
function extractErr20(): Err20 {
  const lines = linesOf(readCorpus(REFERENCE));
  const anchorIndex = lines.findIndex((l) =>
    l.startsWith('<a id="err-20"></a>'),
  );
  if (anchorIndex < 0) {
    throw new Error(
      `harness precondition unmet: ${REFERENCE} carries no <a id="err-20"></a> anchor (expected at ${REFERENCE} line 127) — ERR-20 cannot be located, so cells C and E would be vacuous`,
    );
  }
  let end = anchorIndex;
  while (end + 1 < lines.length && (lines[end + 1] ?? "").trim() !== "")
    end += 1;
  return {
    flat: flatten(lines.slice(anchorIndex, end + 1).join(" ")),
    anchorLine: anchorIndex + 1,
    endLine: end + 1,
  };
}

const PANIC_NOTE_SITES = panicNoteSites();
const ALWAYS_LOG = alwaysLogEntry();
const ERR20 = extractErr20();

describe("bug 0265 — the surfaces outside bug 0117's scope admit the one parse-namespaced panic", () => {
  // =========================================================================
  // RED-at-HEAD cells. Bug 0265 §Fix makes these green.
  // =========================================================================

  it("cell A — every panic-note site in runtime-event-channel.md requalifies its `theta/runtime/*` typing and cross-references the Runtime panics section", () => {
    // Scored per site rather than on the first hit: one requalified sentence
    // must not be able to cover for an unqualified sibling on the same page,
    // which is exactly how the pre-ruling claim survived on four lines at once.
    const unqualified = PANIC_NOTE_SITES.filter(
      (s) => !PARSE_NAMESPACED_QUALIFIER.test(s.text),
    ).map(
      (s) =>
        `${RUNTIME_EVENT_CHANNEL} line ${s.line} — the ${s.what} types the panic note's diagnostic \`theta/runtime/*\` with no admission of the one parse-namespaced panic (${EXCEPTION_CLASS}, ${EXCEPTION_CODE})`,
    );
    expect(
      unqualified,
      `cell A (bug 0265 §Fix item 1 — "qualify the panic-note diagnostic typing so the one parse-namespaced panic is admitted"): ${unqualified.length} of ${PANIC_NOTE_SITES.length} panic-note sites still carry the unqualified typing:\n${unqualified.join("\n")}`,
    ).toEqual([]);

    const unreferenced = PANIC_NOTE_SITES.filter(
      (s) => !RUNTIME_PANICS_XREF.test(s.text),
    ).map(
      (s) =>
        `${RUNTIME_EVENT_CHANNEL} line ${s.line} — the ${s.what} carries no cross-reference to the Runtime panics section that owns the exception statement`,
    );
    expect(
      unreferenced,
      `cell A (bug 0265 §Fix item 1 — "cross-referencing [Errors and Results — Runtime panics]"): ${unreferenced.length} of ${PANIC_NOTE_SITES.length} panic-note sites name no such target, so the qualifier has nowhere to send the reader:\n${unreferenced.join("\n")}`,
    ).toEqual([]);
  });

  it("cell B — the glossary **always-log set** entry qualifies its panic members and keeps its `See:` target in one bullet", () => {
    expect(
      PARSE_NAMESPACED_QUALIFIER.test(ALWAYS_LOG.text),
      `cell B (bug 0265 §Fix item 2 — "the same qualifier on the always-log entry's panic members"): the entry at ${GLOSSARY} line ${ALWAYS_LOG.line} types the set's panic members \`theta/runtime/*\` and calls the set closed, so a note carrying ${EXCEPTION_CODE} is either outside the always-log set or the entry is wrong. Entry head: ${ALWAYS_LOG.text.slice(0, 240)}`,
    ).toBe(true);
    expect(
      /See:/.test(ALWAYS_LOG.text),
      `cell B (bug 0265 §Fix item 2 — "keeps its \`See:\` target", which is what lets the qualifier stay one clause): the entry at ${GLOSSARY} line ${ALWAYS_LOG.line} must keep its \`See:\` reference to the canonical page.`,
    ).toBe(true);
    const nextLine = linesOf(readCorpus(GLOSSARY))[ALWAYS_LOG.line] ?? "";
    expect(
      nextLine.trim(),
      `cell B (bug 0265 §Fix item 2 — "the entry stays one paragraph"): the bullet at ${GLOSSARY} line ${ALWAYS_LOG.line} must stay a single physical line, matching every sibling entry on the page. Found continuation text at ${GLOSSARY} line ${ALWAYS_LOG.line + 1}: ${nextLine.slice(0, 120)}`,
    ).toBe("");
  });

  it("cell C — ERR-20 scopes the downgrade to the panic predicate the runtime evaluates and keeps its source-list statement", () => {
    const scopeStatesPredicate =
      /every panic|any `?ThetaPanic`?|all seven|the panic predicate/.test(
        ERR20.flat,
      );
    expect(
      scopeStatesPredicate && PARSE_NAMESPACED_QUALIFIER.test(ERR20.flat),
      `cell C (bug 0265 §Fix item 3 — "restate the downgrade's scope as every panic (\`ThetaPanic\`)"): ERR-20 at ${REFERENCE} lines ${ERR20.anchorLine} to ${ERR20.endLine} must state the downgrade covers every panic the \`ThetaPanic\` predicate admits, naming the one parse-namespaced exception. Found a six-source scope clause instead, which misstates the \`cause\` field cell D measures. ERR-20 head: ${ERR20.flat.slice(0, 320)}`,
    ).toBe(true);
    expect(
      ERR20.flat.includes("from any of the six panic sources above"),
      `cell C (same clause, removal half): the unscoped phrase "from any of the six panic sources above" must be gone from ERR-20 at ${REFERENCE} lines ${ERR20.anchorLine} to ${ERR20.endLine} — while it stands, the page restricts the downgrade to six of the seven panics the runtime downgrades identically.`,
    ).toBe(false);
    expect(
      /closed\s+panic-source list above is unchanged/.test(ERR20.flat),
      `cell C (bug 0265 §Fix item 3 — "stays a statement about the source list"; bug 0265 §Non-goals — the list is not widened): ERR-20 at ${REFERENCE} lines ${ERR20.anchorLine} to ${ERR20.endLine} must still assert the closed panic-source list is unchanged, since \`par for\` adds a downgrade boundary and no panic source.`,
    ).toBe(true);
  });

  // =========================================================================
  // GREEN-at-HEAD preservation cells. Green before AND after the fix.
  // =========================================================================

  it("cell D — the shipped predicate admits the parse-namespaced panic, which is the observable ERR-20's scope clause misstates", () => {
    const panic = new InterpolatedResultPanic("probe");
    expect(
      isThetaPanic(panic),
      `cell D (bug 0265 §Reproduction surface 3 — the measured fact): \`isThetaPanic\` (\`src/runtime/runtime-panics.ts\`) must admit ${EXCEPTION_CLASS} (\`src/render/query-render.ts\`), because \`parForPanicError\` reads that predicate to choose \`cause: "panic"\` over \`cause: "internal_error"\`.`,
    ).toBe(true);
    expect(
      panic.code,
      `cell D (bug 0265 §Summary — the seventh panic is parse-namespaced): ${EXCEPTION_CLASS} must carry ${EXCEPTION_CODE}, which is what puts it outside every \`theta/runtime/*\` typing cells A and B score.`,
    ).toBe(EXCEPTION_CODE);
  });

  it("cell E — the panic-source list, the `console.error` exclusions, the group A/B partition and ERR-20's downgrade fields are not widened or dropped", () => {
    const registryLine7 = linesOf(readCorpus(REGISTRY_RUNTIME))[6] ?? "";
    expect(
      /exactly six \*\*panic sources\*\*/.test(registryLine7),
      `cell E (bug 0265 §Non-goals — "code-registry-runtime.md line 7 and its mirror stay true unmodified"): ${REGISTRY_RUNTIME} line 7 must still say theta 1.0.0 has exactly six panic sources. Found: ${registryLine7.slice(0, 240)}`,
    ).toBe(true);

    const groupB = PANIC_NOTE_SITES[2] as Site;
    const exclusionCodes = [
      "theta/runtime/reload-teardown-timeout",
      "theta/host/session-shutdown-reason-unknown",
      "theta/host/session-shutdown-pinned-constant-unreadable",
      "theta/host/session-shutdown-teardown-step-failed",
      "theta/host/session-swap-instance-survived",
    ] as const;
    for (const code of exclusionCodes) {
      expect(
        groupB.text.includes(code),
        `cell E (bug 0265 §Fix item 1 — "line 57's five \`console.error\` exclusions … stay byte-unchanged"): the group-B bullet at ${RUNTIME_EVENT_CHANNEL} line ${groupB.line} must still exclude ${code} from this channel.`,
      ).toBe(true);
    }

    const channel = readCorpus(RUNTIME_EVENT_CHANNEL);
    const channelLines = linesOf(channel);
    const partitionLine =
      channelLines.findIndex((l) =>
        l.includes("always-log set partitions by routing channel"),
      ) + 1;
    expect(
      partitionLine,
      `cell E (bug 0265 §Fix item 1 — "the group A/B partition … stay byte-unchanged"): ${RUNTIME_EVENT_CHANNEL} must still state that the always-log set partitions by routing channel (expected at ${RUNTIME_EVENT_CHANNEL} line 40).`,
    ).toBeGreaterThan(0);
    for (const header of [
      "Group A — `details: { event: RuntimeEvent }`:",
      "Group B — `details: { diagnostics: Diagnostic[] }`:",
    ]) {
      expect(
        channelLines.filter((l) => l === header).length,
        `cell E (same clause): ${RUNTIME_EVENT_CHANNEL} must carry exactly one "${header}" header (expected at ${RUNTIME_EVENT_CHANNEL} lines 46 and 55).`,
      ).toBe(1);
    }

    for (const field of ['cause: "panic"', 'kind: "invoke_infra"']) {
      expect(
        ERR20.flat.includes(field),
        `cell E (bug 0265 §Why it matters — the downgrade's observable fields): ERR-20 at ${REFERENCE} lines ${ERR20.anchorLine} to ${ERR20.endLine} must still name \`${field}\` on the element's \`Err\`; the requalification widens the scope clause, not the payload.`,
      ).toBe(true);
    }
  });
});
