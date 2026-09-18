---
id: PTQ-0619
title: Three in-scope tools-field registration-refusal live cells share a near-identical fixture builder and precondition/fixed-observable assertion shape
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/tools-field-shape-refusal-live-cell.test.ts:52-54
  - tests/live/tools-field-zero-entry-scalar-refusal-live-cell.test.ts:60-62
  - tests/live/uppercase-pi-tool-name-refusal-live-cell.test.ts:119-121
  - tests/live/tools-field-shape-refusal-live-cell.test.ts:76-97
  - tests/live/tools-field-zero-entry-scalar-refusal-live-cell.test.ts:87-107
sites: 3                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# Three in-scope tools-field registration-refusal live cells share a near-identical fixture builder and precondition/fixed-observable assertion shape

## Observation
Three of the twelve in-scope files each build a small `.theta` fixture
consisting of `mode: prompt` frontmatter, a `tools:` field, and a body of
`` @`hi` `` through a locally declared `toolsTheta` function whose signature
differs only in whether it takes a line array, a single line string, or a
bare entry, and each then follows the same three-part assertion shape: a
precondition `expect(handle.command(<control-stem>), <"precondition unmet:
... control did not register ... regressed independent of bug NNNN, so the
refusal assertion below cannot witness anything">).toBeDefined()`, followed by
the fixed observable pair `expect(handle.command(<subject-stem>), <message>
).toBeUndefined()` and `expect(handle.registeredNames(), <message
>).not.toContain(<subject-stem>)`.

## Evidence
`tests/live/tools-field-shape-refusal-live-cell.test.ts:52-54`:
```ts
function toolsTheta(toolsLines: readonly string[]): string {
  return ["---", "mode: prompt", ...toolsLines, "---", "@`hi`"].join("\n") + "\n";
}
```

`tests/live/tools-field-zero-entry-scalar-refusal-live-cell.test.ts:60-62`:
```ts
function toolsTheta(toolsLine: string): string {
  return ["---", "mode: prompt", toolsLine, "---", "@`hi`"].join("\n") + "\n";
}
```

`tests/live/uppercase-pi-tool-name-refusal-live-cell.test.ts:119-121`:
```ts
function toolsTheta(entry: string): string {
  return ["---", "mode: prompt", "tools:", `  - ${entry}`, "---", "@`hi`"].join("\n") + "\n";
}
```

`tests/live/tools-field-shape-refusal-live-cell.test.ts:76-97` — the
precondition/fixed-observable shape:
```ts
      expect(
        handle.command("cellcscalar"),
        "bug-0104 live cell precondition unmet: the plain-scalar `tools: read` control did " +
          "not register — discovery or registration regressed independent of " +
          "bug 0104, so the refusal assertion below cannot witness anything. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: ...
      expect(
        handle.command("cellcmapping"),
        "bug-0104 live cell: a `tools: {read: bash}` theta registered — the field-shape " +
          "refusal (`theta/load/malformed-tools-field`) did not fire and the " +
          "theta loaded with the silently emptied callable set bug 0104 " +
          "reports. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "bug-0104 live cell: the mapping-valued theta's slash name must not appear in the " +
          "registered set.",
      ).not.toContain("cellcmapping");
```

`tests/live/tools-field-zero-entry-scalar-refusal-live-cell.test.ts:87-107` —
the same three-part shape over a different bug/stem pair:
```ts
      expect(
        handle.command("cellf2scalar"),
        "precondition unmet: the quoted one-entry `tools: \"read\"` control " +
          "did not register — discovery or registration regressed independent of " +
          "bug 0206, so the refusal assertion below cannot witness anything. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable, read off the settled `ExtensionRunner`.
      expect(
        handle.command("cellf2empty"),
        ': a `tools: ""` theta registered — the zero-entry refusal ' +
          "(`theta/load/malformed-tools-field`) did not fire and the theta loaded " +
          "with the silently emptied callable set bug 0206 reports, " +
          "indistinguishably from a file with no `tools:` line. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        ": the zero-entry theta's slash name must not appear in the " +
          "registered set.",
      ).not.toContain("cellf2empty");
```
`tests/live/uppercase-pi-tool-name-refusal-live-cell.test.ts` follows the same
three-part shape (precondition control(s), then `toBeUndefined()` +
`not.toContain()` on the subject stem) at its own `expect` calls, extended
with one additional precondition for its third fixture; not reproduced a
third time here for brevity, but confirmed by direct reading.

## Why this is a problem
All three files independently re-derive the same "build a minimal `tools:`
`.theta` fixture, then assert a registering control precedes an
absent-from-registration subject" sequence, each with its own near-duplicate
`toolsTheta` builder and its own copy of the same explanatory sentence
("precondition unmet: ... control did not register ... so the refusal
assertion below cannot witness anything" / "must not appear in the
registered set"). A change to the shape of this registration-refusal
assertion pattern — for example, adding a third state to check, or changing
how `registeredNames()` is read — would need to be applied at each of these
three sites independently, with the differing `toolsTheta` signatures already
showing the copies have started to diverge rather than share one source.

## Suggested direction (non-binding, optional)
A single shared fixture builder plus a single
`expectRegisteredControlThenAbsentSubject`-shaped assertion helper, living
beside the other live-cell test-support pieces this repo already extracts
into `tests/helpers/`, would give these three call sites one definition each
to change; that is an observation about a natural home, not a design this
filing owns.

## False-positive check
- Gate-pin carve-out: none of the three files match `*gate*.test.ts` or the
  named gate-file patterns; not applicable.
- Recording-double carve-out: no recording double or "never called" witness
  is involved; the assertions read real registration state off
  `handle.command`/`handle.registeredNames()`, not a fake's call log.
- docs/bugs/ signature search: grepped the three bug numbers narrated in
  these files (0104, 0206, 0108) — all are `status: fixed` entries these live
  cells verify the fix of, not documented correct-reason reds.
- coverage-matrix/bug-doc citation search: grepped
  `docs/reference/coverage-matrix.md` for each of the three filenames — no
  hits. Grepped `docs/bugs/*.md` for each filename — each bug doc names its
  own file as that bug's live cell (expected), but none pins the
  `toolsTheta` function or the precondition/fixed-observable block's line
  range specifically, so no citation blocks consolidating the shared shape.
- Live-suite convention check: `requireLiveProvider()` is called in the
  correct fail-loudly posture in all three (verified by reading each file's
  import and call site); this finding is not about the skip posture, only
  about the duplicated fixture-builder and assertion scaffolding around it.
- Confirmed the three `toolsTheta` bodies differ only in parameter shape (not
  a coverage claim, a duplication-shape claim) and the precondition/
  fixed-observable blocks share the same three-`expect()` structure and
  near-identical wording, by direct side-by-side reading of all cited ranges
  immediately before filing.

## Triage
<!-- triage appends here -->
verdict: confirmed — independently re-verified: all five excerpts reproduce verbatim at the cited lines; the three `toolsTheta` builders are the same `["---","mode: prompt",<tools lines>,"---","@`hi`"]` fixture differing only in parameter shape, and a FOURTH uncited copy (tests/live/malformed-tool-entry-message-single-line-live-cell.test.ts:83-85, same `readonly string[]` signature as the 0104 copy) confirms the pattern extends beyond the shard; each cell then repeats the same precondition-`toBeDefined()` / subject-`toBeUndefined()` + `registeredNames().not.toContain()` scaffold with only bug/stem narration varying; tests/live/harness.ts exports no theta-text builder or registration-refusal assertion helper (exports re-listed), so no shared source is being bypassed — it simply does not exist; carve-outs re-run: not gate files, no recording double, bugs 0104/0206/0108 all `Status: fixed`, coverage-matrix.md has zero hits for the three filenames and no bug doc pins `toolsTheta` or a line range in these files; store grep for `toolsTheta`/the three filenames hits only this intake file — D7 copy-paste-fixture / boilerplate-duplication class, same shape as resolved PTQ-0227/PTQ-0300 (triage: claude-fable-5-1)
