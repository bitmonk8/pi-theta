---
id: pending
title: SchemaBodyParser.parseSchemaObjectBody contains a 97-line field recognizer inside its 158-LOC body loop.
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/schema-body-parser.ts:538-695
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/parser/schema-body-parser.ts#SchemaBodyParser.parseSchemaObjectBody
d9_band: justify
wave: qw20261028153325
reported_by: lens-d9-placement (openai/gpt-6.1-sol)
date: 2026-10-28
triaged_at: e071eada0d46fdc4e5ebc1a9f3bb2a97f028d3a5
---

# SchemaBodyParser.parseSchemaObjectBody contains a 97-line field recognizer inside its 158-LOC body loop.

## Observation
The authoritative structural map reports `SchemaBodyParser.parseSchemaObjectBody` at 538-695, 158 LOC, justify band. The module header describes schema/enum declaration recognition and declaration-shape recovery driven through a parser-core interface. This method contains both the brace-delimited field-list loop and the recognition of one field's name, optional wire-name rename, name diagnostics, and type capture. The per-field recognition occupies 565-661; type recognition and malformed-field recovery are already delegated, but field recognition itself remains inline.

## Evidence
Step inventory partitions the map's 158-LOC range; row LOC are inclusive range spans, not a replacement measurement of the host.

| phase | line ranges | LOC | locals read/written and seam cost |
|---|---|---|---|
| opening brace and field-list state | 538-545 | 8 | Creates `openTok`, `fields`, `closeBraceAbsorbed`; starts the loop. |
| separators, EOF and closing brace | 546-564 | 19 | Reads `fields`, `closeBraceAbsorbed`, `openTok`; advances the parser core and writes diagnostics on unclosed input. |
| field name, wire-name rename and colon | 565-599 | 35 | Creates `nameTok`, `isFieldName`, `wireName`, `wireTok`; advances the core; reads `fields` only when invoking recovery. |
| field-name diagnostics | 600-650 | 51 | Reads `nameTok` and core-backed `file`; writes core-backed `diagnostics`; no list-state read. |
| field type and field recording | 651-661 | 11 | Creates `typeStart`, `typeSource`; reads `nameTok`, `wireName`; writes `fields` and the sticky `closeBraceAbsorbed` flag. |
| comma boundary | 662-692 | 31 | Reads `typeSource`; creates `boundary`, `startsNextField`; advances core or writes a boundary diagnostic. |
| loop and method completion | 693-695 | 3 | Returns `fields`. |

The proposed field region has three list-loop values crossing its boundary: `fields` enters (including recovery), `closeBraceAbsorbed` receives an update, and `typeSource` leaves for the comma check. `openTok` is used only by the outer EOF check. The remaining field locals (`nameTok`, `isFieldName`, `wireName`, `wireTok`, `typeStart`) do not escape the field region. The parser cursor, file and diagnostic sink already reside behind `this.core`, not in additional local variables that would require individual helper parameters.

`src/parser/schema-body-parser.ts:565-573`:

```ts
      const nameTok = this.peek();
      const isFieldName = nameTok.kind === "ident" || nameTok.kind === "keyword";
      if (!isFieldName) {
        // Not a plain `ident: Type` field list (a set-of / discriminated
        // shape): the token itself is what fails to derive a `Field`, so it
        // is the offending token this iteration names.
        return this.recoverMalformedSchemaField(fields, nameTok.range);
      }
      this.advance();
```

`src/parser/schema-body-parser.ts:651-661`:

```ts
      const typeStart = this.pos;
      const typeSource = this.parseType(true);
      if (this.unmatchedCloseBraces(typeStart, this.pos) > 0) {
        closeBraceAbsorbed = true;
      }
      fields.push({
        name: nameTok.text,
        typeSource,
        line: nameTok.range.start.line,
        ...(wireName !== undefined ? { wireName } : {}),
      });
```

Importer counts, quoted from the map: the private method has **0/0 src/tests** importers; its exported containing class `SchemaBodyParser` has **1/0**. The existing in-class call is `finishObjectSchema` at line 345. No exported declaration needs to move for an in-class seam.

## Why this is a problem
The justify band presumes breakdown unless a concrete reason to keep the method whole is established. Reasons considered:

- **One grammar production family:** `docs/reference/grammar.md:413-416` names `SchemaShape ::= "{" Field ("," Field)* ","? "}"`. This explains the outer ordered list recognition, but the keep-whole condition also requires sub-productions to be called out already. The `Field` recognition is the inline 97-line region, including the optional rename described in `docs/spec_topics/schemas.md` §Wire-name renaming; only its type and recovery have been called out. The missing sub-production boundary is the observation, not a demand to separate each grammar terminal.
- **Single algorithm with shared local state:** the field region crosses three list-loop values as inventoried above, not six or more locals through every helper signature. Its early recovery returns and sticky closer flag must remain accounted for, but do not establish the six-local reason.
- **Closed-enumeration dispatch:** this method is a sequential field-list loop, not a switch or if-chain enumerating a spec-named set of variants. The name-kind diagnostic branch is only one phase.
- **Data-only module or type family:** this host is a method doing cursor mutation, field recording and diagnostic emission, not a declaration/table family.
- **Generated or mechanically derived code:** the source is hand-authored recognition with bug-specific recovery commentary; no generator is identified.

This is function-level accounting. It does not contest keeping schema and enum declarations together in the 948-LOC containing module, nor change any parse or recovery verdict.

## Suggested direction (non-binding, optional)
Unproven hypothesis, subject to human ratification. Seam A: field recognition and recording at 565-661 -> an in-class `parseSchemaObjectField` helper (hypothesis) - 97 LOC of current source, 0 exported symbols moved, external importers 0/0 src/tests, cross-references back into the host: existing core delegates, `recoverMalformedSchemaField`, and the three field-list boundary values inventoried above. No further seam identified yet.

## False-positive check
- **Band:** 158 LOC, justify, from the supplied structural map; the containing file's zone band does not exempt this method.
- **Reasons considered:** grammar-family, shared-state, closed-enumeration, data-only and generated-code checks are recorded above with their defeating evidence. The 51-line naming phase includes rationale comments; no executable-only LOC claim is made.
- **Exemptions check:** `quality/exemptions.json` has no key for this method or containing file.
- **Generated-code check:** the file header names a parser-core-driven recognizer, not a generator; method source was read through its closing brace.
- **Spec-mirror check:** the outer `SchemaShape` sequence is real; the inline `Field` sub-production prevents the already-delegated-sub-productions reason from covering the whole method. The comments' placement invariant (name diagnostics after the shape-recovery exits) lies wholly inside the proposed region.
- **Prior-filing and intent check:** PTQ-1280/PTQ-1523 concern the former `BodyParser` file's declaration families. PTQ-1523's ratified Seam B and commit `63cafb11` extracted the schema/enum group into this module; neither is a finding against this function's field/list boundary. The listed prior topics and the search for D9 hosts naming `schema-body-parser` or `parseSchemaObjectBody` yielded no such function-level finding. PTQ-1544 concerns enum separator behavior, not this accounting. No misplacement, dead-code or duplication claim is made.
- **Range check:** header, full 538-695 method, call at 345 and cited grammar production were re-read before filing; each verbatim excerpt is at most 15 lines.

## Triage
verdict: questionable — Accounting verified: size-scan reproduces 538–695 / 158 LOC / justify and the quoted importer counts; both excerpts and all seven inventory spans match. The 97-line Field recognizer has field-local naming/rename/type state distinct from list termination/separator bookkeeping, with the three stated boundary values; grammar.md:413–416 names the repeated Field subproduction, which remains inline. The diagnostic-order invariant stays within that region; no exemption, reverted split, or same-root finding was found (PTQ-1280/1523 concern file-level groups, PTQ-1544 separator posture). Target shape needs a human ruling. (triage: claude-opus-5-5)
