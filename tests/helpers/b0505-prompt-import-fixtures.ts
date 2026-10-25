// Shared source only: both witnesses execute the shipped production pipeline.
export const B0505_LIBRARY = [
  "fn via_lib(): integer { 263 + 514 }",
  "enum Color { Red, Blue }",
  "schema Payload { n: integer }",
  "",
].join("\n");

export const B0505_CASES = [
  {
    name: "imported fn",
    declarations: 'import { via_lib } from "./lib.thetalib"',
    expression: "via_lib()",
  },
  {
    name: "imported enum",
    declarations: 'import { Color } from "./lib.thetalib"',
    expression: "Color.Red == Color.Red ? 777 : 0",
  },
  {
    name: "imported schema",
    declarations: 'import { Payload } from "./lib.thetalib"',
    expression: "Payload { n: 777 }.n",
  },
  {
    name: "same-file fn CONTROL",
    declarations: "fn local(): integer { 263 + 514 }",
    expression: "local()",
  },
] as const;

export const B0505_QUESTION = "Computed value: 777. What is that value plus 0? Answer with the number only.";

export function b0505Callee(cell: typeof B0505_CASES[number], live = false): string {
  return [
    "---", "mode: prompt", "---",
    cell.declarations,
    `let answer = ${cell.expression}`,
    ...(live ? ["@`Computed value: ${answer}. What is that value plus 0? Answer with the number only.`?"] : []),
    "answer", "",
  ].join("\n");
}

export function b0505Caller(live = false): string {
  return [
    "---", "mode: prompt", "---",
    // In live mode a healthy turn BEFORE invoke separates provider health from
    // the known import failure, which prevents the callee's own query running.
    ...(live ? ["@`What is 123 plus 321? Answer with the number only.`?"] : []),
    'let answer = invoke<integer>("./callee.theta")?',
    ...(live ? ["@`Computed value: ${answer}. What is that value plus 0? Answer with the number only.`?"] : []),
    "answer", "",
  ].join("\n");
}
