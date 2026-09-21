---
id: PTQ-1220
title: baseFileName hand-rolls the directory-prefix strip that node:path's win32.basename already provides
lens: D8
status: open
verdict: confirmed
locations:
  - src/extension/execution-status/footer-sink.ts:45-55
sites: 1
fix_scope: localized
d8_class: reimplemented
d8_host: src/extension/execution-status/footer-sink.ts
wave: qw20260921183818
reported_by: lens-d8-simplification (anthropic/claude-fable-5)
date: 2026-09-21
---

# baseFileName hand-rolls the directory-prefix strip that node:path's win32.basename already provides

## Observation
`baseFileName` (footer-sink.ts) derives a theta source path's display stem in two steps: a hand-rolled directory-prefix strip built from a `Math.max` over `lastIndexOf("/")` and `lastIndexOf("\\")` plus a `slice`, then two `endsWith` branches dropping the `.thetalib` / `.theta` extension. The first step is exactly `node:path`'s `win32.basename`, which handles both separator styles on every platform. The module currently imports nothing from `node:*`; sibling execution-status modules already import `node:fs` / `node:util` (progress-tool.ts:32-33), so the layer is not `node:*`-free by policy.

## Evidence
src/extension/execution-status/footer-sink.ts:45-55 (re-read before filing):
```ts
export function baseFileName(file: string): string {
  const lastSlash = Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\"));
  const base = lastSlash >= 0 ? file.slice(lastSlash + 1) : file;
  if (base.endsWith(".thetalib")) {
    return base.slice(0, -".thetalib".length);
  }
  if (base.endsWith(".theta")) {
    return base.slice(0, -".theta".length);
  }
  return base;
}
```
Facility: `node:path` `path.win32.basename` (Node ≥ 22 per the pinned floor, capability-probe.ts:130 `NODE_FLOOR = ">=22.19.0"`). The Node docs' POSIX-vs-Windows section states: "To achieve consistent results when working with Windows file paths on any operating system, use `path.win32`" — i.e. `win32.basename` splits on both `/` and `\` everywhere. Verified mechanically (scratch script under $TEMP): `win32.basename("a/b/c.theta") === "c.theta"`, `win32.basename("a\\b\\c.thetalib") === "c.thetalib"`, `win32.basename("C:file.theta") === "file.theta"`, `win32.basename("a/b/") === "b"`.

Call sites' real needs (importer counts from the structural map: `baseFileName` 0 external src importers; consumed inside `renderNodeHeader`, footer-sink.ts:108, which the widget sink imports — 1/2): the input is a checkpoint site's `file` (a theta/thetalib source path); the output feeds the `<stem>:<line>` footer token. The need is "drop the directory prefix under either separator, drop the known extension". `win32.basename` covers the prefix strip feature-for-feature and is stricter on the edges the hand-rolled scan misses: a drive-relative `C:file.theta` keeps its `C:` prefix under the `lastIndexOf` scan (neither separator matches) but is stripped correctly by the facility; a trailing separator yields `""` under the scan but the last component under the facility. The two `endsWith` extension branches are the only part `node:path` does not subsume as-is (`basename(p, ext)` strips one nominated extension per call) and would remain either way.

## Why this is a problem
Hand-rolled reimplementation of a `node:*` facility: the separator scan re-encodes path-component semantics (`/` vs `\`, prefix boundaries) that `node:path` already owns, and encodes them less completely (drive-relative and trailing-separator inputs diverge from the facility's answers). Repo precedent for the same shape: PTQ-0293 (progress-tool's hand-rolled ANSI strip replaced by `node:util`'s `stripVTControlCharacters`) was confirmed and fixed.

## Suggested direction (non-binding, optional)
Unproven hypothesis: `import { win32 } from "node:path"` and let `baseFileName` become `win32.basename(file)` followed by the existing two `endsWith` extension branches; behaviour on all real inputs (source paths with at least one separator) is unchanged, and the edge inputs move toward the facility's answers.

## False-positive check
- Exemption check: no D8 durable exemption names footer-sink.ts or `baseFileName` (the D8 ledger holds only discovery-walk.ts#enumerateDirectory and production-theta-producer.ts#firstAdmittingArmProperties).
- Duplicate check: no filed/pending issue matches (`ls quality/issues | grep -iE "clip|clamp|duration|basefile"` → no hits; the pending-candidate roster has no baseFileName/basename entry).
- Spec check: execution-status.md EXST-8/EXST-12 pin the rendered grammar (`base(file):line`), not the mechanism deriving the stem; no clause requires a hand-rolled scan. The doc comment on the function pins the OUTPUT shape (stem reads like the slash name), which the facility preserves.
- Ambient-primitive posture: `node:path` is a pure string library (no ambient state read), and sibling modules in the same directory already import `node:fs`/`node:util` (progress-tool.ts), so a `node:*` import here breaks no layer rule.
- Live-callers check: `baseFileName` is exercised in production via `renderNodeHeader` (footer-sink.ts:108), which both sinks render through — not test-only.

## Triage
verdict: questionable — accounting verified: excerpt byte-exact at footer-sink.ts:45-55; `win32.basename` re-verified under Node 24 (floor >=22.19.0) to split on both `/` and `\` and to reproduce the two cited divergences (`C:file.theta` → hand `C:file.theta` / facility `file.theta`; `a/b/` → hand `""` / facility `b`) while matching on every separator-bearing input; sole live caller renderNodeHeader:108; no D8 exemption for the host; no docs/spec_topics clause pins the stem mechanism (`base(file)` appears only in the file header); sibling intake basename candidates are different hosts (production-discovered-theta.ts, callable-set.ts) — the simpler shape (node:path import in the footer sink) is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): confirmed - D8 wave-1 batch ruling; triage equivalence verification trusted.
