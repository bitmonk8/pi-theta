---
id: PTQ-1229
title: thetaBasename hand-rolls the separator-splitting basename + suffix strip that node:path's path.win32.basename already provides, in a module that already imports node:path
lens: D8
status: fixed
verdict: confirmed
locations:
  - src/extension/production-discovered-theta.ts:42-46
  - src/extension/production-discovered-theta.ts:20-20
  - src/extension/production-composition.ts:1831-1833
  - src/extension/production-composition.ts:3513-3513
  - src/extension/production-composition.ts:4139-4139
sites: 5
fix_scope: module
d8_class: reimplemented
d8_host: src/extension/production-discovered-theta.ts#thetaBasename
wave: qw20260921183818
reported_by: lens-d8-simplification (anthropic/claude-fable-5)
date: 2026-09-21
---

# thetaBasename hand-rolls the separator-splitting basename + suffix strip that node:path's path.win32.basename already provides, in a module that already imports node:path

## Observation
`thetaBasename` in production-discovered-theta.ts computes a path's final segment by normalising backslashes to forward slashes, slicing past the last `/`, then stripping a trailing `.theta` with `endsWith`/`slice`. The module already imports from `node:path` (it takes `delimiter`), whose `path.win32.basename(p, ".theta")` performs exactly this job — final-segment extraction splitting on both `\` and `/`, plus case-sensitive suffix removal. The helper is consumed at three production-composition.ts sites (callable-name derivation and two callee slash-name derivations).

## Evidence
The hand-rolled helper, src/extension/production-discovered-theta.ts:42-46 (re-read before filing):

```ts
/** The `.theta` basename (minus extension) of a path, for the callee slash name. */
export function thetaBasename(path: string): string {
  const base = path.slice(path.replace(/\\/g, "/").lastIndexOf("/") + 1);
  return base.endsWith(".theta") ? base.slice(0, -".theta".length) : base;
}
```

`node:path` is already a dependency of the same module, src/extension/production-discovered-theta.ts:20:

```ts
import { delimiter as PATH_DELIMITER } from "node:path";
```

The facility: `path.win32.basename(path[, suffix])` (node:path built-in; the win32 flavour splits on both `\` and `/`, matching this helper's backslash normalisation, and treats the suffix case-sensitively, matching `endsWith`).

Feature-for-feature comparison, verified by executing both against the call sites' real input shapes (discovered `.theta` file paths — absolute or relative, native or forward-slash separators):

| input | thetaBasename | path.win32.basename(p, ".theta") |
|---|---|---|
| `C:/a/b/greet-x.theta` | `greet-x` | `greet-x` |
| `a\b\c.theta` | `c` | `c` |
| `plain.theta` | `plain` | `plain` |
| `noext` | `noext` | `noext` |
| `/x/y/z.THETA` (case) | `z.THETA` | `z.THETA` |
| `C:\roots\mixed/sep\file.theta` | `file` | `file` |
| `dir/.theta` (pathological) | `""` | `.theta` |

Only the pathological file literally named `.theta` diverges (Node keeps the whole name when it equals the suffix; the hand-rolled form yields the empty string — neither is a usable slash name). Every real input at the call sites is a discovered `*.theta` file with a non-empty stem.

Live call sites (importer count from the structural map: 1 src importer, production-composition.ts):
- src/extension/production-composition.ts:1831-1833 — `deriveCallableName`: `return thetaBasename(sourcePath).replace(/-/g, "_");`
- src/extension/production-composition.ts:3513 — `slashName: thetaBasename(calleeAbsolutePath),`
- src/extension/production-composition.ts:4139 — `slashName: thetaBasename(absolute),`

## Why this is a problem
A four-line hand-rolled reimplementation of a platform built-in already imported by the module means two implementations of path-segment splitting must be kept in agreement: this shard's copy and the platform's. The same stem-derivation idiom is also hand-rolled again at parser/callable-set.ts:550,564-565 and parser/theta-document.ts:1874-1876 (out of this shard — duplication territory), so each additional hand-rolled copy widens the surface where the "split on either separator, strip `.theta`" rule can drift. The facility comparison above shows the built-in covers all real inputs identically; the only divergence is a file named exactly `.theta`, which produces a broken slash name under both forms.

## Suggested direction (non-binding, optional)
Unproven hypothesis: `path.win32.basename(path, ".theta")` substitutes directly for the helper body (or the helper stays as the named seam and its body becomes the one-line delegation), given the `.theta`-named-file edge is agreed to be out of the input domain or is guarded once. The cross-module copies of the same idiom (callable-set.ts, theta-document.ts) are a D4 concern, not part of this filing.

## False-positive check
- Reference search: `thetaBasename` has exactly 5 hits across src/ (declaration + import + 3 call sites, listed above); no test-only or string-keyed access.
- Facility verification: both implementations executed side-by-side over 8 input shapes (table above); one divergence found, only on the pathological `.theta`-named file, and disclosed rather than elided.
- Spec check: no docs/spec_topics/ clause pins a bespoke basename derivation; the callable-name derivation contract ("basename without the `.theta` extension, hyphens replaced by underscores", deriveCallableName's doc-comment) is preserved by the built-in.
- Exemption check: no D8 exemption exists for production-discovered-theta.ts or this function (the two durable D8 exemptions cover discovery-walk enumerateDirectory and production-theta-producer firstAdmittingArmProperties). The host file's "exempt" band bars only breakdown findings; this is a reimplemented claim.
- D2-precedent check: the helper is live production code with 3 production call sites — nothing here demotes live code to test-only reachability.
- Duplicate check: this wave's qw20260921183818-d8-01-basefilename-reimplements-path-basename.md files the same class against a different host/function; no filed or resolved issue names thetaBasename.

## Triage
verdict: questionable — accounting verified: excerpts byte-exact at production-discovered-theta.ts:42-46/:20, the 5 src hits (decl, import :226, call sites :1832/:3513/:4139) reproduce with one importer; side-by-side execution of the helper vs path.win32.basename(p, ".theta") over 16 shapes confirms identity on every real input and the disclosed `dir/.theta` divergence, plus undisclosed but out-of-domain ones (trailing-separator paths → "" vs stem, drive-relative `C:foo.theta` → `C:foo` vs `foo`) that cannot reach the call sites because :4092/:3513 feed resolvePath/isAbsolute output already passed through fs.readBytes and :1832 takes a discovery-walked file path; no D8 exemption for the host, no spec clause pins a bespoke derivation (code-registry-load.md's derived-name rule is preserved), no tracked issue names thetaBasename (sibling filings target footer-sink.ts / callable-set.ts); the simpler shape is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): confirmed - D8 wave-1 batch ruling; triage equivalence verification trusted.
