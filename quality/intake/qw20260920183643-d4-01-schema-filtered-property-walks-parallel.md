---
id: pending
title: Schema filtered-property detection and translation walks are parallel
lens: D4
status: intake
verdict: pending
locations:
  - src/seams/schema-validator.ts:121-160
  - src/seams/schema-validator.ts:237-296
sites: 2
fix_scope: module
d4_class: parallel
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# Schema filtered-property detection and translation walks are parallel

## Observation
`src/seams/schema-validator.ts` implements bug 0212's mitigation for an AJV
codegen quirk that drops `properties.__proto__` from schema enumeration. The
file contains two schema-walking functions: `declaresFilteredProperty` decides
whether a lowered schema needs the hardened AJV path, and
`translateFilteredProperties` produces the equivalent document that hardened
AJV can compile correctly. Both functions switch over the same three keyword
class constants (`SCHEMA_MAP_KEYWORDS`, `SCHEMA_VALUED_KEYWORDS`,
`SCHEMA_LIST_KEYWORDS`) and apply the same special cases for `properties`,
`patternProperties`, and tuple-form `items`.

## Evidence

`src/seams/schema-validator.ts:121-160` — detection pass:

```ts
function declaresFilteredProperty(schema: unknown): boolean {
  if (!isSchemaNode(schema)) {
    return false;
  }
  for (const key of Object.keys(schema)) {
    const value = schema[key];
    if (SCHEMA_MAP_KEYWORDS.includes(key)) {
      if (!isSchemaNode(value)) {
        continue;
      }
      if (key === "properties" && hasOwn(value, AJV_FILTERED_SCHEMA_PROPERTY)) {
        return true;
      }
      for (const mapKey of Object.keys(value)) {
        if (declaresFilteredProperty(value[mapKey])) {
          return true;
        }
      }
      continue;
    }
    if (SCHEMA_VALUED_KEYWORDS.includes(key)) {
      if (key === "items" && Array.isArray(value)) {
        if (value.some((item) => declaresFilteredProperty(item))) {
          return true;
        }
        continue;
      }
      if (declaresFilteredProperty(value)) {
        return true;
      }
      continue;
    }
    if (SCHEMA_LIST_KEYWORDS.includes(key)) {
      if (Array.isArray(value) && value.some((item) => declaresFilteredProperty(item))) {
        return true;
      }
      continue;
    }
  }
  return false;
}
```

`src/seams/schema-validator.ts:237-296` — translation pass:

```ts
function translateFilteredProperties(schema: unknown): unknown {
  if (!isSchemaNode(schema)) {
    return schema;
  }
  const propertiesValue = isSchemaNode(schema.properties) ? schema.properties : undefined;
  const hasFilteredEntry =
    propertiesValue !== undefined && hasOwn(propertiesValue, AJV_FILTERED_SCHEMA_PROPERTY);
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(schema)) {
    const value = schema[key];
    if (key === "properties") {
      const translatedMap =
        propertiesValue === undefined
          ? (value as Record<string, unknown>)
          : translateSchemaMap(
              propertiesValue,
              hasFilteredEntry ? AJV_FILTERED_SCHEMA_PROPERTY : undefined,
            );
      defineRecordField(result, "properties", translatedMap);
      continue;
    }
    if (key === "patternProperties") {
      const base = isSchemaNode(value) ? translateSchemaMap(value) : {};
      if (hasFilteredEntry) {
        relocateFilteredProperty(base, propertiesValue as Record<string, unknown>);
      }
      defineRecordField(result, key, base);
      continue;
    }
    if (SCHEMA_MAP_KEYWORDS.includes(key)) {
      defineRecordField(result, key, isSchemaNode(value) ? translateSchemaMap(value) : value);
      continue;
    }
    if (SCHEMA_VALUED_KEYWORDS.includes(key)) {
      if (key === "items" && Array.isArray(value)) {
        defineRecordField(result, key, value.map((item) => translateFilteredProperties(item)));
        continue;
      }
      defineRecordField(result, key, translateFilteredProperties(value));
      continue;
    }
    if (SCHEMA_LIST_KEYWORDS.includes(key)) {
      defineRecordField(
        result,
        key,
        Array.isArray(value) ? value.map((item) => translateFilteredProperties(item)) : value,
      );
      continue;
    }
    defineRecordField(result, key, value);
  }
  if (hasFilteredEntry && !hasOwn(schema, "patternProperties")) {
    const base: Record<string, unknown> = {};
    relocateFilteredProperty(base, propertiesValue as Record<string, unknown>);
    defineRecordField(result, "patternProperties", base);
  }
  return result;
}
```

Diff verdict: diverged in body but dispatch over identical keyword taxonomy.
The two functions are not copies; they are two passes that must cover the same
set of JSON-Schema sub-schema positions. The code's own comment at line 231
states that translation "Recurses only through the positions
`declaresFilteredProperty` classifies." Clone-map group id: none (the scanner
reported no clone groups for this shard).

## Why this is a problem
This is load-bearing parallel truth. `#build` chooses the hardened AJV instance
when `declaresFilteredProperty(schema)` is true and then compiles the result of
`translateFilteredProperties(schema)`. If a new JSON-Schema composition keyword
is added to one pass but missed by the other, the mitigation breaks:

- Detection misses a keyword that translation handles → a schema that carries
  `__proto__` through that keyword is compiled on the ordinary `#ajv`, where
  AJV's codegen silently drops the property.
- Translation misses a keyword that detection handles → detection raises the
  hardened path, but translation never relocates the filtered entry, so the
  hardened compilation still sees the original `properties.__proto__` and the
  bug is not repaired.

The special cases already show the drift risk: `properties` and
`patternProperties` are handled explicitly in translation but folded into the
`SCHEMA_MAP_KEYWORDS` branch in detection, with the `properties.__proto__`
probe only in detection. Both functions currently cover the same discriminant
set, but the duplicated branching logic is the parallel surface.

## Suggested direction (non-binding, optional)
A single shared schema-walking helper in `src/seams/schema-validator.ts` that
parameterises the three keyword-class actions and the special
`properties`/`patternProperties` handling would make the keyword taxonomy one
source of truth. Both detection and translation would plug visitor callbacks
into the same walker.

## False-positive check
- Clone-map re-verification: the scanner reported `(no clone groups)` for all
  three shard files; this finding is a parallel discovered by reading, not a
  scanner clone group.
- Identifier search across `src/` for `declaresFilteredProperty`,
  `translateFilteredProperties`, `SCHEMA_MAP_KEYWORDS`,
  `SCHEMA_VALUED_KEYWORDS`, and `SCHEMA_LIST_KEYWORDS` returned only
  `src/seams/schema-validator.ts`; no other production file shares this walker.
- The keyword tables are implementation-specific to the bug 0212 mitigation,
  not a spec-normative vector table repeated by the spec.
- Both functions are live: `AjvSchemaValidator.compile` calls
  `declaresFilteredProperty`, and `#build` calls `translateFilteredProperties`.
- No tests were reviewed; the finding is scoped to production code only.

## Triage
verdict: questionable — accounting verified: both excerpts match at :121-160/:237-296, both walkers are live (compile :430 / #build :432), both dispatch over the same shared constants (4 map + 8 valued + 3 list keywords) and duplicate the tuple-`items` special case and isSchemaNode/Array.isArray value-shape gating, clone-scan → no groups, identifier grep across src/extensions/tools/tests hits only this file, no tracked PTQ shares this root cause; note the keyword lists themselves are already one source of truth (the three constants) so the drift surface is the duplicated branch structure (properties probe vs explicit properties/patternProperties arms, items tuple), and detection does not special-case patternProperties as the Observation implies (the Why states this correctly) — a shared visitor walker is a design decision for a human ruling (triage: claude-fable-5-1)
