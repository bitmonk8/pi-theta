// The shared four-page diagnostics-registry read (PTQ-0215).
//
// WHY THIS FILE EXISTS. `RegistryRow` and the `REGISTRY` load it backs — read
// the four sharded registry pages (code-registry-{parse,load,runtime,host}.md),
// parse each through the real `parseRegistry`, and join the rows into one
// array — were redeclared byte-for-byte (confirmed via `diff`) in several test
// files. This module centralises that read, placeholder interpolation and the
// identical live-cell fragment assertions. Readers whose assertion style and
// wording vary per file stay local, using the shared registry read.
//
// TIER: offline, deterministic, provider-free; also used by live cells.
import { PARSE_REGISTRY_PATH as REGISTRY_PAGE, registryMessageOf } from "./load-row-harness";
import { expect } from "vitest";
import { readFileSync } from "node:fs";
import { repoFile } from "./corpus-reader";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../../tools/code-registry/index.js";

/** A parsed row of the sharded code registry, as `parseRegistry` yields it. */
export interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

/** Read only the requested shards, preserving page-specific registry oracles. */
export function readRegistry(
  shards: readonly ("parse" | "load" | "runtime" | "host")[],
): readonly RegistryRow[] {
  return parseRegistry(
    shards
      .map((shard) =>
        readFileSync(
          repoFile(`docs/spec_topics/diagnostics/code-registry-${shard}.md`),
          "utf8",
        ),
      )
      .join("\n"),
  ) as RegistryRow[];
}

/** The live four-page sharded registry — the input tests/code-registry.test.ts reconciles. */
export const REGISTRY: readonly RegistryRow[] = readRegistry(["parse", "load", "runtime", "host"]);

const LOAD_REGISTRY = readRegistry(["load"]);

/** The load registry Message column, refusing an absent row. */
export function loadRowMessage(code: string): string {
  return registryMessageOf(LOAD_REGISTRY, "docs/spec_topics/diagnostics/code-registry-load.md", code);
}

/** `<code>: <message>` with `<descriptor>` substituted — DIAG-4: the message
 *  half is READ from the registry row, not transcribed. */
export function descriptorFragment(code: string, descriptor: string): string {
  const template = registryMessage(LOAD_REGISTRY, code) as string | undefined;
  expect(
    template,
    `${code} has no registry row — DIAG-2's closed registry does not carry ` +
      "the code this cell asserts",
  ).toBeTypeOf("string");
  const message = (template as string).replaceAll("<descriptor>", descriptor);
  expect(
    message,
    `${code}: an unsubstituted <…> placeholder remains — the registry row's ` +
      "Message template changed shape and this substitution is stale",
  ).not.toMatch(/<[a-z-]+>/);
  return `${code}: ${message}`;
}

/** Fill the named discovery descriptors, leaving unknown placeholders intact. */
export function interpolate(template: string, subs: Record<string, string>): string {
  return template.replace(/<([a-z-]+)>/g, (whole, name: string) => subs[name] ?? whole);
}

/**
 * Interpolate lowercase `<…>` placeholders in one pass, without re-scanning
 * substituted values. Unsupplied placeholders and unused substitutions both
 * throw using the caller's failure wording; literal `array<T>` stays intact.
 */
export function interpolateStrict(
  template: string,
  subs: ReadonlyMap<string, string>,
  unsupplied: (token: string) => string,
  unused: (token: string) => string,
): string {
  const used = new Set<string>();
  const message = template.replace(/<[a-z]+>/g, (token) => {
    const value = subs.get(token);
    if (value === undefined) {
      throw new Error(unsupplied(token));
    }
    used.add(token);
    return value;
  });
  for (const token of subs.keys()) {
    if (!used.has(token)) {
      throw new Error(unused(token));
    }
  }
  return message;
}

const PARSE_REGISTRY = readRegistry(["parse"]);

const RESERVED_KEYWORD_CODE = "theta/parse/reserved-keyword-as-identifier";

/**
 * `theta/parse/reserved-keyword-as-identifier: reserved keyword '<keyword>'
 * cannot be used as an identifier` — DIAG-4: the message half is read from the
 * registry row, not copied. The row's presence is asserted (DIAG-2), the
 * `<keyword>` slot's presence is asserted before it is filled, and the filled
 * result is checked for a second unsubstituted placeholder.
 */
export function reservedKeywordFragment(keyword: string): string {
  const template = registryMessage(PARSE_REGISTRY, RESERVED_KEYWORD_CODE) as
    | string
    | undefined;
  expect(
    template,
    `${RESERVED_KEYWORD_CODE} has no registry row — the code this cell asserts is not registered (DIAG-2)`,
  ).toBeTypeOf("string");
  const withSlot = template as string;
  expect(
    withSlot,
    `${RESERVED_KEYWORD_CODE}: the registry row's Message template must carry the <keyword> slot this cell fills — the row changed shape`,
  ).toContain("<keyword>");
  const message = withSlot.replace("<keyword>", keyword);
  expect(
    message,
    `${RESERVED_KEYWORD_CODE}: the registry row's Message template grew a second unsubstituted placeholder this reader does not fill`,
  ).not.toMatch(/<[a-z]+>/);
  return `${RESERVED_KEYWORD_CODE}: ${message}`;
}

/** DIAG-4: the message half is read from the registry row, not copied. */
export function registryFragment(code: string, substitutions: Readonly<Record<string, string>>): string {
  const template = registryMessage(PARSE_REGISTRY, code) as string | undefined;
  expect(
    template,
    `${code} has no registry row — the code this cell asserts is not registered (DIAG-2)`,
  ).toBeTypeOf("string");
  let message = template as string;
  for (const [key, value] of Object.entries(substitutions)) {
    message = message.replaceAll(`<${key}>`, value);
  }
  expect(
    message,
    `${code}: an unsubstituted placeholder remains — the registry row's Message template changed shape`,
  ).not.toMatch(/<[a-z]+>/);
  return `${code}: ${message}`;
}

/**
 * A registered code's normative *Message* template. Throws naming the registry
 * page when the row is absent, so a registry drift can never degrade an
 * assertion below into a comparison against `undefined`.
 */
function registeredParseMessage(code: string): string {
  const template = registryMessage(PARSE_REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: ${REGISTRY_PAGE} carries no Message row for ${code} — the DIAG-4 column is this file's oracle, so a missing row is a harness failure, never a skip`,
    );
  }
  return template;
}

/**
 * Interpolate a registered template's `<…>` placeholders from `subs`, in one
 * pass so a substituted value is never re-scanned.
 *
 * The placeholder set is derived from the TEMPLATE, not assumed: an unsupplied
 * placeholder and an unused substitution both throw, so a registry row that
 * changes shape fails loudly here instead of quietly producing a string no
 * emission can equal.
 */
export function fillParseMessage(code: string, subs: ReadonlyMap<string, string>): string {
  const template = registeredParseMessage(code);
  return interpolateStrict(
    template,
    subs,
    (token) =>
      `harness: the ${code} Message template carries placeholder ${token}, which this file supplies no substitution for — the registry row changed shape (${REGISTRY_PAGE})`,
    (token) =>
      `harness: this file substitutes ${token} into the ${code} Message, which no longer carries it — the registry row changed shape (${REGISTRY_PAGE})`,
  );
}

/** `fn '<name>' argument <i> ('<param>') type mismatch: expected <expected>, got <actual>`. */
export function fnArgMessage(
  fnName: string,
  index: number,
  paramName: string,
  expected: string,
  actual: string,
): string {
  return fillParseMessage(
    "theta/parse/fn-arg-type-mismatch",
    new Map([
      ["<name>", fnName],
      ["<i>", String(index)],
      ["<param>", paramName],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}

/** `cannot narrow number to integer` — a placeholder-free registered Message. */
export function narrowingMessage(): string {
  return fillParseMessage("theta/parse/integer-narrowing", new Map());
}

/** `array element type mismatch at index <i>: expected <expected>, got <actual>`. */
export function arrayElementMessage(index: number, expected: string, actual: string): string {
  return fillParseMessage(
    "theta/parse/array-element-type-mismatch",
    new Map([
      ["<i>", String(index)],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}

/** `let binding '<name>' initialiser type mismatch: expected <expected>, got <actual>`. */
export function letRhsMessage(name: string, expected: string, actual: string): string {
  return fillParseMessage(
    "theta/parse/let-rhs-type-mismatch",
    new Map([
      ["<name>", name],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}

/** `'<op>' requires two numeric operands; got <left> and <right>`. */
export function arithmeticMessage(op: string, left: string, right: string): string {
  return fillParseMessage(
    "theta/parse/non-numeric-arithmetic-operands",
    new Map([
      ["<op>", op],
      ["<left>", left],
      ["<right>", right],
    ]),
  );
}

/** `field '<field>' on schema '<schema>' type mismatch: expected <expected>, got <actual>`. */
export function objectFieldMismatchMessage(
  field: string,
  schema: string,
  expected: string,
  actual: string,
): string {
  return fillParseMessage(
    "theta/parse/object-field-type-mismatch",
    new Map([
      ["<field>", field],
      ["<schema>", schema],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}

const SCHEMA_REFUSAL = "theta/parse/schema-type-not-expression";
const PARAMS_REFUSAL = "theta/load/params-type-not-expression";

/**
 * A registry row's normative *Message* (DIAG-4, diagnostic-shape.md:74), read
 * rather than restated. Definedness is asserted first so a missing row reds by
 * naming the registry page instead of comparing against a bare `undefined`.
 */
function anchoredRegistryMessage(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: the diagnostics code registry must carry the *Message* row for ${code}; ` +
      `without it every expected message in this file would be a restatement, which DIAG-4 bars`,
  ).toBeDefined();
  return template as string;
}

/** `error <code>: <message>` for one substitution set, rendered from the registry. */
export function registryErrorLine(code: string, subs: ReadonlyArray<readonly [string, string]>): string {
  let message = anchoredRegistryMessage(code);
  for (const [placeholder, value] of subs) {
    expect(
      message.includes(placeholder),
      `DIAG-4 anchor: the registry *Message* for ${code} must carry the ${placeholder} ` +
        `placeholder this file interpolates; observed template ${JSON.stringify(message)}`,
    ).toBe(true);
    message = message.replace(placeholder, value);
  }
  return `error ${code}: ${message}`;
}

/** The schema-position refusal, rendered for the offending declaration's name. */
export function schemaRefusal(declName: string): string {
  return registryErrorLine(SCHEMA_REFUSAL, [["<X>", declName]]);
}

/** The `params:`-position refusal, rendered for one field name. */
export function paramsRefusal(field: string): string {
  return registryErrorLine(PARAMS_REFUSAL, [["<param>", field]]);
}
