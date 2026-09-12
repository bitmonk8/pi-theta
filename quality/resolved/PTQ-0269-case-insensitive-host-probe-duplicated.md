---
id: PTQ-0269
title: detectCaseInsensitiveHost (the async host-case-sensitivity probe) and its beforeEach/afterEach wrapper are redefined near-verbatim in a sibling bug-witness file
lens: D7                     # D2 | D7 — the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0361-case-variant-import-dir-identity.test.ts:263-283
  - tests/b0361-case-variant-import-dir-identity.test.ts:285-297
  - tests/b0362-case-variant-invoke-cycle-edge.test.ts:80-98
  - tests/b0362-case-variant-invoke-cycle-edge.test.ts:174-186
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# detectCaseInsensitiveHost (the async host-case-sensitivity probe) and its beforeEach/afterEach wrapper are redefined near-verbatim in a sibling bug-witness file

## Observation
`tests/b0361-case-variant-import-dir-identity.test.ts` and
`tests/b0362-case-variant-invoke-cycle-edge.test.ts` each declare their own
`async function detectCaseInsensitiveHost(root)`, and each wraps it in the
same `describe(...) { let root; let caseInsensitive; beforeEach(...);
afterEach(...); }` shell that populates `root`/`caseInsensitive` before every
test. The `beforeEach`/`afterEach` shell is byte-identical between the two
files apart from the `mkdtemp` prefix string (`"b0361-"` vs `"b0362-"`); the
probe function shares the identical `fsp.readdir(...).then(ok, err)` control
flow, the identical ENOENT-check-else-rethrow body, and the identical
"mirrors `PiFileSystem.exists`" justification wording, differing only in the
directory/file names each bug's fixture layout happens to probe.

## Evidence
`tests/b0361-case-variant-import-dir-identity.test.ts:263-283`:
```ts
/**
 * Runtime host-case-sensitivity probe. After `<root>/libs/` exists, write a
 * probe entry and `readdir` the UPPERCASED directory (`<root>/LIBS`): a
 * resolution to the libs entries means the host is case-INSENSITIVE; an ENOENT
 * rejection means case-SENSITIVE. An unexpected error rejects (fails loudly),
 * never silently degrading the branch selection — the `.then(ok, err)`
 * rejection arm is the sanctioned pattern (mirrors `PiFileSystem.exists`), not
 * a broad `catch`.
 */
async function detectCaseInsensitiveHost(root: string): Promise<boolean> {
  writeFileSync(join(root, "libs", "probe.thetalib"), 'fn probe(): string { "p" }\n', "utf8");
  return fsp.readdir(join(root, "LIBS")).then(
    (entries) => entries.includes("probe.thetalib"),
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return false;
      }
      throw error;
    },
  );
}
```

`tests/b0362-case-variant-invoke-cycle-edge.test.ts:80-98`, the same shape
(only the probed directory/file names and one extra setup line differ):
```ts
/**
 * Runtime host-case-sensitivity probe: after `<root>/x2/` exists, `readdir` the
 * UPPERCASED directory (`<root>/X2`). A resolution means case-INSENSITIVE; an
 * ENOENT rejection means case-SENSITIVE. Any other error rejects (fails
 * loudly), never silently degrading branch selection — the `.then(ok, err)`
 * rejection arm is the sanctioned pattern (mirrors `PiFileSystem.exists`), not
 * a broad `catch`.
 */
async function detectCaseInsensitiveHost(root: string): Promise<boolean> {
  return fsp.readdir(join(root, "X2")).then(
    (entries) => entries.includes("a.theta"),
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return false;
      }
      throw error;
    },
  );
}
```

`tests/b0361-case-variant-import-dir-identity.test.ts:285-297`:
```ts
describe("bug 0361 — a case-variant import directory must not split one physical `.thetalib` into two declaring identities", () => {
  let root: string;
  let caseInsensitive: boolean;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), "b0361-"));
    writeLayout(root);
    caseInsensitive = await detectCaseInsensitiveHost(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });
```

`tests/b0362-case-variant-invoke-cycle-edge.test.ts:174-186` — identical apart
from the describe label and the `mkdtemp` prefix:
```ts
describe("bug 0362 — a case-variant invoke directory spelling must not drop the cycle edge", () => {
  let root: string;
  let caseInsensitive: boolean;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), "b0362-"));
    writeLayout(root);
    caseInsensitive = await detectCaseInsensitiveHost(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });
```

Search performed: `grep -rn "^async function detectCaseInsensitiveHost" tests`
and `grep -rl "fsp\.readdir" tests` (recursive over `*.ts`) each return exactly
these two files — no third file in `tests/` defines this function or uses
`fsp.readdir` at all. (A structurally different, synchronous
`writeFileSync`/`readFileSync`-based probe named `filesystemIsCaseInsensitive`
exists in three other files — `b0329-hash-mismatch-refuses-invocation.test.ts`,
`b0363-file-entry-stem-judged-on-entry-spelling.test.ts`, and
`b0379-tools-entry-byte-match.test.ts` — but that is a separate implementation
of the same goal, and b0363's copy explicitly credits b0329 as its source in
its own header comment; it is not counted as a third instance of the async
probe cited here.)

## Why this is a problem
The `beforeEach`/`afterEach`/state-variable shell is byte-for-byte identical
across the two files apart from the `mkdtemp` prefix, and the probe function
inside it shares its control flow, its ENOENT branch, and its justification
comment verbatim. Neither file's comments credit the other as a source for
this specific probe/shell, unlike the demonstrated convention this same batch
of files otherwise follows — e.g. b0363's `filesystemIsCaseInsensitive` is
explicitly commented "mirroring tests/b0329-hash-mismatch-refuses-invocation.test.ts",
and b0361 itself credits `resolvePiTool`'s wiring as "copied verbatim from the
b0305 deps wiring" a few lines above this probe. The absence of any equivalent
note here indicates this probe and its wrapper were authored twice
independently. `tests/helpers/` holds no host-case-sensitivity probe of this
async/`fsp.readdir`-based shape.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` export for "detect whether the real host filesystem
folds case, given a root that already contains a known directory/entry pair,
returning a boolean for a `beforeEach` to branch on" would be the natural home
for this probe and its wrapper, parameterised on the directory/entry names
each bug's fixture layout needs.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kinds; not applicable.
- Recording-double check: `detectCaseInsensitiveHost` returns a boolean used to
  select which branch of real assertions a test runs; it is not a
  call-recording MUST-NOT double; not applicable.
- docs/bugs/ signature search: `docs/bugs/0361-case-variant-import-dir-splits-declaring-identity.md`
  and `docs/bugs/0362-invoke-cycle-graph-drops-case-variant-edges.md` both
  exist and are cited in each test file's own header. This finding does not
  contest either test's redness or behaviour, only the duplicated probe/shell
  code that runs before every cell.
- coverage-matrix/bug-doc citation search: `grep -n "b0361\|b0362"
  docs/reference/coverage-matrix.md` returns no hits. Each bug doc's own
  witness line (`docs/bugs/0361-...md:220`, `docs/bugs/0362-...md:189`) names
  only its own test file. This finding does not propose merging, renaming, or
  deleting either test.
- Coverage drift check: this observation is limited to code duplicated between
  two existing, currently-run test files; it does not claim any behaviour is
  untested.

## Triage
verdict: confirmed — grep confirms exactly these 2 files define the async fsp.readdir-based probe (line ranges verified byte-for-byte), and this pair breaks the corpus's own demonstrated convention of crediting duplicated probe code (b0361:122 credits b0305; the sibling b0329→b0363→b0379 chain explicitly cross-credits at each copy), with no D7 carve-out applying (triage: claude-opus-5)
