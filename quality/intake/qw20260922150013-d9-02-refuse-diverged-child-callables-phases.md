---
id: pending
title: refuseDivergedChildCallables spans 152 LOC across marshalled-read, snapshot alignment, file-derivation fallback, hash verification, and refusal-drop phases
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/production-composition.ts:1886-2037
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/production-composition.ts#refuseDivergedChildCallables
d9_band: justify
wave: qw20260922150013
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-22
---

# refuseDivergedChildCallables spans 152 LOC across marshalled-read, snapshot alignment, file-derivation fallback, hash verification, and refusal-drop phases

## Observation
The structural map places `refuseDivergedChildCallables` at
src/extension/production-composition.ts:1886-2037, 152 LOC, band justify
(FN justify 100-199), unexported, 0/0 importers. It is the RFC-0005
child-side callable-hash verification pass: read parent-marshalled hashes
off the authenticated child env, align each marshalled name to a
discovered theta and its closure sources, verify, and drop diverged
callables plus the marked root. 51 of the 152 LOC are comment lines, 101
are code.

## Evidence
Step inventory (phase | line range | LOC | locals read / written):

| phase | lines | LOC | reads | writes |
|---|---|---|---|---|
| marshalled-hash read + not-a-child early return | 1903-1915 | 13 | env | marshalled |
| snapshot alignment: marked-root callableSet entries -> byName via canonical realpath map + collectCallableClosureSources | 1916-1973 | 58 | thetas, regime, marshalled, fs, ctx, parseDeps | byName, markedRoot, thetaByCanonicalPath |
| file-derivation fallback: deriveCallableName over remaining thetas -> byName | 1974-1993 | 20 | thetas, marshalled, byName, fs, ctx, parseDeps | byName |
| verifyChildCallableHashes + no-refusal early return | 1994-2000 | 7 | env, byName | result |
| refusal emission, diverged-callable drop, marked-root drop, filter | 2001-2037 | 37 | result, byName, markedRoot, thetas | dropped |

src/extension/production-composition.ts:1994-2000:
```ts
  const result = verifyChildCallableHashes({
    env,
    discovery: (name) => byName.get(name)?.sources,
  });
  if (result.refusals.length === 0) {
    return [...thetas];
  }
```

Cross-phase locals: `marshalled` (3 phases), `byName` (4 phases),
`markedRoot` (2 phases), `thetas` (4 phases); only `byName` and
`marshalled` are multi-consumer collection state — `thetaByCanonicalPath`
is private to the alignment phase and `result`/`dropped` are
single-producer -> single-consumer handoffs.

## Why this is a problem
Justify band: presumption of breakdown unless a concrete reason is found.
Reasons considered and defeated:
- Single algorithm with shared local state: not cleanly met — the
  alignment seam (phases 2+3) needs (thetas, fs, ctx, parseDeps,
  marshalled, markedRoot) = 6 names of which 4 are ambient deps already in
  the signature, and the refusal-drop seam needs only (result, byName,
  markedRoot, emitDiagnostic, thetas) = 5; no invented state object beyond
  the `byName` map the function already builds.
- Closed-enumeration dispatch: no switch; the two alignment routes are a
  primary + fallback, not a spec-named closed set.
- Data-only / grammar production / generated code: none (0 marker hits).
- Human ruling: quality/exemptions.json has four keys, none for this file
  or function.
The bug/spec citations (RFC-0005 #subagent-theta-callable-hash, bugs
0328/0329/0330, subagent.md control-plane authentication) each pin one
phase's behaviour, not a single critical section a seam would interleave.

## Suggested direction (non-binding, optional)
Hypotheses, unproven; the human ratifies one. Seam A: phases 2+3
(1916-1993) -> `alignMarshalledCallables` helper (hypothesis) returning
the `byName` map — ~78 LOC, 0 exported symbols moved, 0 external
importers, cross-references back into the host:
collectCallableClosureSources, deriveCallableName. Seam B: phase 5
(2001-2037) -> `applyHashRefusals` (hypothesis) — ~37 LOC, 0 exports, 0
importers, takes result/byName/markedRoot/emitDiagnostic.

## False-positive check
Band: 152 LOC in [100, 199] per the authoritative map. Reasons-considered
list above with defeating evidence per item. Exemptions check: no key for
the file or `#refuseDivergedChildCallables` in quality/exemptions.json.
Generated-code check: 0 `@generated|DO NOT EDIT` hits. Spec-mirror check:
no spec-table switch; the RFC-0005 clause names the verification duty, not
an enumeration this body mirrors. Duplicate check: grep of
quality/resolved + quality/intake for the function name -> only PTQ-0080
(citation drift, resolved) and PTQ-0322's file-level inventory; no
d9_host row exists for this function.

## Triage
verdict: questionable — accounting verified: size-scan map gives refuseDivergedChildCallables 1886-2037, 152 LOC, band justify (FN bands 60/100/200), unexported 0/0 importers; 51/152 comment lines reproduce exactly; all five phase ranges match the code (1903 marshalled read/early return, 1916-1973 byName/markedRoot/thetaByCanonicalPath snapshot alignment, 1974-1993 deriveCallableName fallback, 1994-2000 verifyChildCallableHashes, 2001-2037 emit/drop/filter) and the alignment (byName-writing) and refusal-drop (dropped-writing) clusters are distinct state with thetaByCanonicalPath phase-2-private and result/dropped single-handoff as claimed; no exemptions.json key for file or function, 0 generated markers; the qw20260920223212 reviewer's keep-whole ("7 threaded locals") counts three signature params (fs/ctx/parseDeps) and one phase-private map, so the ≥ 6-shared-locals reason is contested rather than clearly met — the filing reports the alignment seam at 6 names / 4 ambient deps honestly; not a duplicate: PTQ-0322 Seam C proposes moving deriveCallableName+refuseDivergedChildCallables to a module (file-level placement), not a function breakdown, and no d9_host row exists for this function; whether the two-seam shape (or the single-pass keep-whole) stands is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — re-verified independently: size-scan map --files row `1886-2037 | 152 | function | refuseDivergedChildCallables | no | 0/0`, band justify (file itself strong at 4756 LOC); the five phase ranges match the code exactly (1903-1906 readMarshalledCallableHashes + early return, 1916-1973 byName/markedRoot/thetaByCanonicalPath alignment over markedRoot.callableSet.entries, 1977-1993 deriveCallableName fallback into byName, 1994-2000 verifyChildCallableHashes + early return, 2001-2036 emitDiagnostic/dropped/filter) and the excerpt at 1994-2000 is verbatim; the alignment cluster (writes byName, private thetaByCanonicalPath) and the refusal-drop cluster (writes dropped, reads result/byName/markedRoot) are distinct state, so the ≥ 2-concern inventory stands; no `production-composition` or `#refuseDivergedChildCallables` key in quality/exemptions.json (0 hits), no generated markers; the only applicable defeating reason is the REVIEW_LOG qw20260920223212 keep-whole ("7 threaded locals"), but of those only marshalled/byName/markedRoot are body locals shared across phases (fs/ctx/parseDeps are signature params, thetaByCanonicalPath is phase-2-private), so the ≥ 6-shared-locals reason is contested, not clearly met; not a duplicate (PTQ-0322 Seam C is file-level placement, PTQ-0348 was the closure-hash recompute, PTQ-1151 is runComposePass; no d9_host row for this function); whether the two-seam breakdown or the prior keep-whole stands is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified a third time at HEAD: `size-scan.mjs map --files` row `1886-2037 | 152 | function | refuseDivergedChildCallables | no | 0/0`, band justify (FN bands 60/100/200 from `size-scan bands`; file strong at 4756 LOC); 51 comment lines and 0 `@generated|DO NOT EDIT` hits in 1886-2037 reproduce; every phase range re-reads as filed (1903-1905 readMarshalledCallableHashes + early return, 1916-1973 byName/markedRoot/thetaByCanonicalPath snapshot alignment, 1974-1993 deriveCallableName fallback, 1994-2000 verifyChildCallableHashes verbatim, 2001-2037 emit/dropped/filter) and the alignment (writes byName, private thetaByCanonicalPath/rootPath) vs refusal-drop (writes dropped, reads result/byName/markedRoot) clusters are distinct state; `grep production-composition|refuseDiverged quality/exemptions.json` → 0 hits; `grep refuseDiverged quality/TRIAGE_LOG.md` → 0 hits, so the only defeating reason is the qw20260920223212 REVIEW_LOG reviewer keep-whole ("7 threaded locals"), not a human ruling, and its count includes 3 signature params (fs/ctx/parseDeps) and one phase-2-private map — a body-local recount gives only marshalled/byName/markedRoot crossing phase boundaries, so ≥ 6 shared locals is contested rather than met; not a duplicate (PTQ-0322 Seam C is file-level placement of deriveCallableName+this fn, PTQ-0348 closure-hash recompute, PTQ-1151 runComposePass; no d9_host row for `#refuseDivergedChildCallables`); the two-seam shape vs keep-whole is a design decision for a human ruling (triage: claude-fable-5-1)
