---
id: pending
title: BodyParser.parseFnParamList keeps parameter capture inline with list recovery and closing verdicts.
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/body-parser.ts:990-1161
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/parser/body-parser.ts#BodyParser.parseFnParamList
d9_band: justify
wave: qw20261028153325
reported_by: lens-d9-placement (openai/gpt-6.1-sol)
date: 2026-10-28
triaged_at: e071eada0d46fdc4e5ebc1a9f3bb2a97f028d3a5
---

# BodyParser.parseFnParamList keeps parameter capture inline with list recovery and closing verdicts.

## Observation
The authoritative map places `BodyParser.parseFnParamList` at 172 LOC, justify band, lines 990–1161. Its module header describes recursive-descent body parsing and token lookahead for the theta-document seam. The routine contains both the repeated single-parameter capture and the list's deferred closing/refusal verdicts. The map records it as private, with 0/0 src/tests importers for its enclosing `BodyParser` declaration.

## Evidence
Step inventory; LOC entries are inclusive mapped-source spans, including comments, not a new measurement of the host:

| phase | line ranges | LOC | locals read/written |
|---|---|---:|---|
| list accumulator and recovery-state initialization | 990–1024 | 35 | reads `openTok` in signature; writes `params`, `unclosed`, `closeParenAbsorbed`, `refusedTok`, `atParamStart` |
| iteration and body-open recovery gate | 1025–1034 | 10 | reads `closeParenAbsorbed`, cursor; writes `unclosed` |
| modifier and name-token capture | 1035–1049 | 15 | writes `mutConsumed`, `mutTok`, `pTok`, cursor and diagnostics; `diag` is temporary |
| first refused-name capture | 1050–1066 | 17 | reads `pTok`, `mutConsumed`, `refusedTok`; writes `refusedTok` |
| reserved/case verdicts | 1067–1100 | 34 | reads `pTok`, `atParamStart`; writes diagnostics |
| annotation capture and absorbed-closer provenance | 1101–1117 | 17 | writes `pType`, `typeAbsorbed`, `closeParenAbsorbed`; `typeStart` is temporary; calls `parseType` |
| parameter recording and separator transition | 1118–1129 | 12 | reads `pTok`, `pType`, `typeAbsorbed`; writes `params`, `atParamStart`, cursor |
| closer and deferred list verdicts | 1130–1161 | 32 | reads `refusedTok`, `closeParenAbsorbed`, `openTok`; writes `unclosed`, diagnostics, cursor; returns `params` |

`src/parser/body-parser.ts:1109-1122` shows the parameter capture's outputs:

```ts
      if (this.isPunct(":")) {
        this.advance();
        const typeStart = this.pos;
        pType = this.parseType();
        if (this.unmatchedCloseParens(typeStart, this.pos) > 0) {
          closeParenAbsorbed = true;
        }
        typeAbsorbed = pType.length > 0 && !this.isPunct(",") && !this.isPunct(")");
      }
      params.push({
        name: pTok.text,
        type: pType,
        ...(typeAbsorbed ? { typeAbsorbed: true } : {}),
      });
```

`src/parser/body-parser.ts:1139-1146` shows the separate list-level consumer of the accumulated recovery facts:

```ts
      if (refusedTok !== null && !closeParenAbsorbed) {
        this.diagnostics.push({
          severity: "error",
          code: "theta/parse/fn-param-not-identifier",
          file: this.file,
          range: refusedTok.range,
          message: "fn parameter name must be an identifier",
        });
```

Seam cost: the single-parameter region 1035–1122 needs the parser receiver, `atParamStart`, and the previous `refusedTok`; it produces a parameter, an updated first-refusal token, and the absorbed-closer fact. `openTok`, `unclosed`, and the `params` accumulator are not inputs to recognition of that parameter. `mutConsumed`, `pTok`, `pType`, `typeStart`, and `typeAbsorbed` are working locals inside that region, rather than state the next parameter must inherit.

## Why this is a problem
The justify band presumes breakdown without a concrete keep-whole reason. `docs/reference/grammar.md:335-342` names both `FnParams ::= FnParam ("," FnParam)* ","?` and `FnParam ::= Ident (":" Type)?`. The routine calls out `Type` through `parseType`, but keeps the 88-line single-parameter recognizer inline; thus the one-grammar-production-family reason's requirement to call out subproductions is not satisfied at the list/parameter boundary.

Shared-local-state was considered: there are five list-state variables, but they do not all cross this seam. Only the receiver and two incoming recovery values are needed for the per-parameter region, with three outgoing facts; six locals need not be threaded through its helper signature. The deferred closing verdicts do have an ordering/withhold dependency on `closeParenAbsorbed` and `refusedTok`. Keeping those verdicts together does not require modifier/name/type recognition to remain inline. Closed-enumeration dispatch does not explain a repeated list with a 35-line setup and 32-line epilogue; data-only and generated-code reasons do not explain its cursor and diagnostic work either.

## Suggested direction (non-binding, optional)
Seam A: modifier/name/type capture and per-parameter verdicts at 1035–1122 -> `BodyParser.parseFnParam` (hypothesis, unproven) - 88 LOC, 0 exported symbols moved, 0/0 external src/tests importers; cross-references back into the host: existing receiver cursor/diagnostic/file facilities, `parseType`, `unmatchedCloseParens`, incoming `atParamStart`/first-refusal state, and returned parameter/refusal/absorbed-closer facts. The list's closing verdicts remain one consumer of those facts. The human ratifies the seam.

## False-positive check
- **Band:** 172 LOC, justify, from the supplied map; not a finding against an exempt-band file or function.
- **Reasons considered:** grammar-family, shared locals, closed enumeration, data-only, and generated code were checked against the phase inventory and seam accounting above.
- **Exemptions check:** `quality/exemptions.json` has no key for this method; its `parseQuery` ruling is a different host.
- **Generated-code check:** hand-authored recursive descent; the commentary records the bug-0124/0148/0279 recovery rules, not a generator.
- **Spec-mirror check:** reference grammar lines 341–342 explicitly separate the repeated list from the individual parameter. Neither the setup nor the deferred verdict phase is a short enumeration arm.
- **Duplicate/history check:** PTQ-1172 filed the former 245-LOC `parseFn`, extracting this whole list while keeping parameter recognition and closing verdicts together. This finding concerns the resulting list's inline single-parameter subproduction, not re-separating its closing verdicts or re-filing `parseFn`. PTQ-1523 is file-level. `git log -S 'parseFnParamList' -- src/parser/body-parser.ts src/parser/theta-document.ts` identifies extraction/move commits `7a0d5e0e` and `702a1f2e`, not a reverted single-parameter split.
- **Caller check:** `rg -n 'parseFnParamList|parseImportSpecifierList' src tests extensions tools --glob '*.ts'` finds the declaration and its call at body-parser.ts:932, plus one type-compat.ts prose mention and the two import-specifier references. This is live private grammar code, not a D2 deadness claim. Importer counts are quoted from the map, not inferred from this search.
- **Range check:** the full 990–1161 method range was re-read immediately before filing; body-parser.ts was not read end to end.

## Triage
verdict: questionable — accounting verified: size-scan map reproduces 990–1161, 172 LOC, justify band, private member and 0/0 enclosing-declaration importers; both excerpts and the stated reference/history searches reproduce. Parameter capture has its own working locals, while list recovery and deferred closing verdicts retain five list-state variables; grammar.md:341–342 distinguishes FnParams from the inline FnParam subproduction. No applicable exemption or reverted split was found; PTQ-1172 concerns the enclosing parseFn extraction and PTQ-1523 the file-level breakdown, not this parameter-level boundary. The target breakdown shape needs a human ruling. (triage: claude-opus-5-5)
