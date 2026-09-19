// The shared four-page diagnostics-registry read (PTQ-0215).
//
// WHY THIS FILE EXISTS. `RegistryRow` and the `REGISTRY` load it backs — read
// the four sharded registry pages (code-registry-{parse,load,runtime,host}.md),
// parse each through the real `parseRegistry`, and join the rows into one
// array — were redeclared byte-for-byte (confirmed via `diff`) in several test
// files. This module centralises that read, placeholder interpolation,
// pointer-message composition and the identical live-cell fragment assertions.
// Readers whose assertion style and wording vary per file stay local, using
// the shared registry read.
//
// TIER: offline, deterministic, provider-free; also used by live cells.
import { PARSE_REGISTRY_PATH as REGISTRY_PAGE, registryLineOf, registryMessageOf } from "./load-row-harness";
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

/**
 * Read the raw Hint cell that `parseRegistry` omits, refusing a missing row or
 * empty hint with the caller's failure rationale. Table order is
 * Code | Sev | Phase | Trigger | Spec rule | Hint | Message.
 */
export function registryHintOf(
  registryText: string,
  registryPath: string,
  code: string,
  missingHintReason: string,
): string {
  const HINT_CELL_INDEX = 5;
  for (const line of registryText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    const cells = trimmed
      .replace(/^\|/, "")
      .replace(/\|\s*$/, "")
      .split(/(?<!\\)\|/)
      .map((cell) => cell.trim().replace(/\\\|/g, "|"));
    if (cells[0] !== `\`${code}\``) continue;
    const hint = cells[HINT_CELL_INDEX];
    if (hint === undefined || hint === "" || hint === "—") {
      throw new Error(
        `harness: the ${code} row at ${registryPath} carries no Hint cell (cell ${HINT_CELL_INDEX} is ${JSON.stringify(hint)}) — ${missingHintReason}, so an empty cell is a harness failure, never a skip`,
      );
    }
    return hint;
  }
  throw new Error(
    `harness: ${registryPath} carries no row for ${code} — this file's Hint oracle is stale`,
  );
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

/**
 * A registry Message template as a whole-string RegExp with every
 * `<placeholder>` slot widened to `.+` — used where the descriptor's exact
 * spelling is left open by the spec (`` package `foo` (pi.theta) `` at
 * package-and-settings.md:27 against `` package `foo` (pi.theta[0]) `` at
 * discovery-sources.md:63).
 */
export function templateToRegExp(template: string): RegExp {
  const escaped = template
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/<[a-z-]+>/g, ".+");
  return new RegExp(`^${escaped}$`);
}

/** Source a code's registered *Message* template and fill its `<…>` placeholders. */
export function expectedMessage(
  registry: readonly Pick<RegistryRow, "code" | "message">[],
  code: string,
  subs: Readonly<Record<string, string>>,
): string {
  let message = registryMessage(registry, code) as string;
  for (const [placeholder, value] of Object.entries(subs)) {
    // `replaceAll` — the rename template repeats `<name>`.
    message = message.replaceAll(placeholder, value);
  }
  return message;
}

/** Fill the named discovery descriptors, leaving unknown placeholders intact. */
export function interpolate(template: string, subs: Record<string, string>): string {
  return template.replace(/<([a-z-]+)>/g, (whole, name: string) => subs[name] ?? whole);
}

/**
 * Compose a refusal from its registry template, inserting ` at <pointer>`
 * before `: <value>` (no location at the root). A malformed template returns
 * `undefined` so callers retain their own throw or unavailable-marker wording.
 */
export function composePointerMessage(
  template: string,
  pointer: string,
  value: number,
): string | undefined {
  const valuePlaceholder = "<value>";
  const cut = template.indexOf(valuePlaceholder);
  const head = cut < 0 ? "" : template.slice(0, cut);
  const separator = ": ";
  if (cut < 0 || !head.endsWith(separator)) return undefined;
  const tail = template.slice(cut + valuePlaceholder.length);
  const subject = head.slice(0, head.length - separator.length);
  const location = pointer.length > 0 ? ` at ${pointer}` : "";
  return `${subject}${location}${separator}${String(value)}${tail}`;
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
 * registry row, not copied. The row's presence is asserted (DIAG-2), and the
 * filled result is checked for an unsubstituted placeholder.
 */
export function reservedKeywordFragment(keyword: string): string {
  return registryFragment(RESERVED_KEYWORD_CODE, { keyword });
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

/** `error <code>: <message>` for one substitution set, rendered from the registry. */
export function registryErrorLine(code: string, subs: ReadonlyArray<readonly [string, string]>): string {
  return registryLineOf(
    REGISTRY,
    "docs/spec_topics/diagnostics/code-registry-{parse,load,runtime,host}.md",
    code,
    subs,
  );
}

/** The schema-position refusal, rendered for the offending declaration's name. */
export function schemaRefusal(declName: string): string {
  return registryErrorLine(SCHEMA_REFUSAL, [["<X>", declName]]);
}

/** The `params:`-position refusal, rendered for one field name. */
export function paramsRefusal(field: string): string {
  return registryErrorLine(PARAMS_REFUSAL, [["<param>", field]]);
}
