// Bug 0511 Resolution A (§Approved ruling): only StmtBlock query tails are
// rejected. Shared bytes keep the offline whole-document and live production
// registration oracles aligned; no parser/runtime behavior is mocked here.
export const B0511_DISCARDED = "theta/parse/discarded-query-result";
export const b0511Prompt = (body: string): string => `---\nmode: prompt\n---\n${body}\n`;

const blocks = [
  { name: "if", wrap: (inside: string) => `if true { ${inside} }` },
  { name: "else", wrap: (inside: string) => `if false { 1 } else { ${inside} }` },
  { name: "while", wrap: (inside: string) => `while false { ${inside} }` },
  { name: "for", wrap: (inside: string) => `for c in [true] { ${inside} }` },
];
const layouts = [
  { name: "single", prefix: "" },
  { name: "let-newline", prefix: "let z = 1\n " },
  { name: "let-packed", prefix: "let z = 1 " },
  { name: "after-try", prefix: "let z = @`prepare`?\n " },
  { name: "after-brace", prefix: "if true { 1 }\n " },
];

export const b0511Rejected = blocks.flatMap((block) => layouts.map((layout) => ({
  name: `${block.name}-${layout.name}`,
  body: block.wrap(`${layout.prefix}@\`q\``),
})));

export const b0511Healthy = [
  { name: "explicit-discard", body: "if true { let _ = @`q` }" },
  { name: "propagate", body: "if true { @`q`? }" },
  { name: "bind-result", body: "if true { let r = @`q` }" },
  { name: "fn-tail", body: "fn f() { let z = 1\n @`q` }" },
  { name: "void-fn-tail", body: "fn f(): void { @`q` }" },
  { name: "block-expr-tail", body: "let r = { let z = 1\n @`q` }" },
];

// CTRL-4 independently forbids queries in ParForBody. It must remain a query
// TAIL (not a QRY-19 discarded statement), but cannot be a legal-load control.
export const b0511ParQuery = "let r = par for c in [true] max 1 { let z = 1\n @`q` }";
