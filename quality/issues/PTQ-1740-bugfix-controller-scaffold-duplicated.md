---
id: PTQ-1740
title: Four standalone bugfix fixtures repeat the Git repository and controller-start scaffold.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/bugfix-invocation-failure.test.ts:10-24
  - tests/bugfix-invocation-failure.test.ts:25-29
  - tests/bugfix-resume.test.ts:20-34
  - tests/bugfix-resume.test.ts:35-38
  - tests/bugfix-scope-revision.test.ts:11-24
  - tests/bugfix-workflow.test.ts:19-30
  - tests/bugfix-workflow.test.ts:34-41
sites: 4
fix_scope: cross-module
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# Four standalone bugfix fixtures repeat the Git repository and controller-start scaffold.

## Observation
Four standalone-controller fixtures independently allocate a temporary Git repository, initialize `main`, configure the same author, plant the same worktree/artifact ignore entries and an open bug plus `src/value.js`, and commit that baseline. Each then starts `tools/bugfix/run.mjs` with `init`, obtains the run path from stdout, and defines a reader for that run's `state.json`. The bug number, source contents, additional controls, and later workflow stages differ; the repository/start substrate repeats. The natural shared home for this test-only substrate is `tests/helpers/`, whose current files contain no bugfix-controller harness.

## Evidence
The count is four source-level standalone fixture builders in the briefed files, not their generated test cases or all Git fixtures in the repository. Each counted builder is quoted below; the excerpts stop before scenario-specific stage execution.

`tests/bugfix-invocation-failure.test.ts:10-24`:

```ts
function fixture(exactRequest = false) {
  const owner = mkdtempSync(join(tmpdir(), 'bugfix-invocation-'));
  const git = (...args: string[]) => {
    const r = spawnSync('git', args, { cwd: owner, encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0); return r.stdout.trim();
  };
  git('init', '-b', 'main'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'Test');
  mkdirSync(join(owner, 'docs/bugs'), { recursive: true });
  mkdirSync(join(owner, 'src')); mkdirSync(join(owner, '.pi/theta'), { recursive: true });
  writeFileSync(join(owner, '.gitignore'), '.pi/tmp/\n/.trees/\n');
  writeFileSync(join(owner, '.pi', 'theta', 'fix-bug.theta'), '// frozen controls');
  writeFileSync(join(owner, 'docs/bugs/0001-example.md'), '# Example\n- **Status:** open\n');
  writeFileSync(join(owner, 'src/value.js'), 'const value = 1;');
  writeFileSync(join(owner, 'package.json'), JSON.stringify({ scripts: { typecheck: 'node -e "process.exit(0)"', test: 'node -e "process.exit(0)"' } }));
  git('add', '.'); git('commit', '-m', 'fixture');
```

`tests/bugfix-invocation-failure.test.ts:25-29`:

```ts
  const call = (...args: string[]) => spawnSync(process.execPath, [helper, ...args], { cwd: owner, encoding: 'utf8' });
  const started = call('init', '1'); expect(started.status, started.stderr).toBe(0);
  const run = started.stdout.trim();
  const state = () => JSON.parse(readFileSync(join(run, 'state.json'), 'utf8'));
  const pass = (...args: string[]) => { const r = call(...args); expect(r.status, r.stderr).toBe(0); return r.stdout.trim(); };
```

`tests/bugfix-resume.test.ts:20-34`:

```ts
function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), "bugfix-resume-"));
  git(cwd, "init", "-b", "main");
  git(cwd, "config", "user.email", "test@example.invalid");
  git(cwd, "config", "user.name", "Test");
  mkdirSync(join(cwd, "docs/bugs"), { recursive: true });
  mkdirSync(join(cwd, "src"));
  mkdirSync(join(cwd, "tests"));
  mkdirSync(join(cwd, ".pi/theta"), { recursive: true });
  writeFileSync(join(cwd, ".gitignore"), ".pi/tmp/\n/.trees/\n");
  writeFileSync(join(cwd, ".pi", "theta", "fix-bug.theta"), "// frozen control identity\n");
  writeFileSync(join(cwd, "docs/bugs/0001-example.md"), "# Example\n- **Status:** open\n");
  writeFileSync(join(cwd, "src/value.js"), "export const value = 1;\n");
  git(cwd, "add", "."); git(cwd, "commit", "-m", "baseline");
  const started = call(cwd, "init", "1");
```

`tests/bugfix-resume.test.ts:35-38`:

```ts
  expect(started.status, started.stderr).toBe(0);
  const run = started.stdout.trim();
  const request = join(cwd, ".pi/tmp/resume-request.txt");
  const state = () => JSON.parse(readFileSync(join(run, "state.json"), "utf8"));
```

`tests/bugfix-scope-revision.test.ts:11-24`:

```ts
function fixture(failure: "plan" | "evidence" = "plan", legacy = false, deferredOwnerChoice = false) {
  const cwd = mkdtempSync(join(tmpdir(), "scope-revision-"));
  const put = (base: string, path: string, text: string) => { mkdirSync(dirname(join(base, path)), { recursive: true }); writeFileSync(join(base, path), text); };
  const git = (...args: string[]) => { const r = spawnSync("git", args, { cwd, encoding: "utf8" }); expect(r.status, r.stderr).toBe(0); };
  git("init", "-b", "main"); git("config", "user.email", "test@example.invalid"); git("config", "user.name", "Test");
  put(cwd, ".gitignore", ".pi/tmp/\n/.trees/\n"); put(cwd, "docs/bugs/0518-example.md", "# Marker\n- **Status:** open\n");
  put(cwd, "src/value.js", "original\n"); put(cwd, "tests/control.js", "retain\n");
  put(cwd, stageControl, "// retained control identity\n");
  git("add", "."); git("commit", "-m", "fixture");
  const call = (...args: string[]) => spawnSync(process.execPath, [helper, ...args], { cwd, encoding: "utf8" });
  const ok = (...args: string[]) => { const r = call(...args); expect(r.status, r.stderr + r.stdout).toBe(0); return r.stdout.trim(); };
  const run = ok("init", "518");
  const state = () => JSON.parse(readFileSync(join(run, "state.json"), "utf8"));
  const root = state().root;
```

`tests/bugfix-workflow.test.ts:19-30`:

```ts
function repo(remote = false) {
  const owner = mkdtempSync(join(tmpdir(), "bugfix-control-"));
  git(owner, "init", "-b", "main"); git(owner, "config", "user.email", "test@example.invalid"); git(owner, "config", "user.name", "Test");
  const putAt = (root: string, path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text);
  };
  putAt(owner, ".gitignore", ".pi/tmp/\n/.trees/\n");
  putAt(owner, "docs/bugs/0001-example.md", "# Example\n- **Status:** open\n");
  putAt(owner, "src/value.js", "export const value = 1;\n");
  putAt(owner, "tests/retained.js", "// original tests\n");
  putAt(owner, "package.json", JSON.stringify({ scripts: { typecheck: 'node -e "process.exit(0)"', test: 'node -e "process.exit(0)"' } }));
  git(owner, "add", "."); git(owner, "commit", "-m", "baseline");
```

`tests/bugfix-workflow.test.ts:34-41`:

```ts
  const call = (...args: string[]) => invoke(owner, ...args);
  const start = () => { const r = call("init", "1"); expect(r.status, r.stderr).toBe(0); return r.stdout.trim(); };
  const run = start();
  const state = () => JSON.parse(readFileSync(join(run, "state.json"), "utf8"));
  const root = state().root as string;
  const put = (path: string, text: string) => putAt(root, path, text);
  const putRun = (path: string, text: string) => putAt(run, path, text);
  const ok = (...args: string[]) => { const r = call(...args); expect(r.status, r.stderr + r.stdout).toBe(0); return r.stdout.trim(); };
```

## Why this is a problem
This is D7 **boilerplate duplication**: four test files maintain the same repository preconditions and controller-start sequence independently. The repeated `main` initialization, author identity, `.pi/tmp/` and `/.trees/` ignore contents, baseline commit, `init` invocation, stdout run-path extraction, and JSON state reader are visible in all four builders. Fixture-specific controls and subsequent review/resume/scope operations do not explain that repeated substrate. The observation is about existing setup code, not a runtime failure, a test-count preference, or a missing behavioural witness.

## False-positive check
- **Gate-pin check:** the four named files are standalone bugfix workflow tests, not census/pin gates. The counted code creates scratch repositories and starts controllers; no pinned inventory/count assertion is challenged.
- **Recording-double check:** these sites run real Git and controller subprocesses. No negative witness or recorded-call assertion is counted as duplication or described as vacuous.
- **docs/bugs/ signature search:** `rg -n 'bugfix-(invocation-failure|resume|scope-revision|workflow)\.test\.ts' docs/reference/coverage-matrix.md docs/bugs` returned no matches. No documented red is being treated as a skip; this claim concerns setup repetitions, not whether a test passes.
- **Coverage-matrix/bug-doc citation search:** the same exact-basename search returned no matches in either location. No test merge, rename, deletion, or change to a witness assertion is proposed.
- **Helper/intent check:** `rg -n 'bugfix|fix-bug|scope-revision|bugfix-resume' tests/helpers` returned no matches. Inspected the recent file histories (`git log` for the invocation/resume/workflow files and the scope-revision file); they introduce and evolve separate controller scenarios. The claim preserves those scenario differences and is limited to the repeated repository/start substrate, not an assertion that their whole fixtures are interchangeable.
- **Duplicate-topic check:** `rg -l 'bugfix-(invocation-failure|resume|scope-revision|workflow)\.test\.ts' quality/issues quality/resolved quality/intake` returned no matches before this filing. The existing compose-workspace lifecycle candidate concerns B0507/B0508 settings-file/disposal sequences, not these Git/controller builders.
- **Coverage boundary:** all four counted sites are existing `tests/` setup. No additional tests, path coverage, suite-composition change, E2E-versus-unit posture change, or production-code change is requested.

## Triage
verdict: confirmed — All seven excerpts match exactly across four live fixture builders, independently repeating Git main/author/ignore/baseline setup and controller init/run-path/state readers; scenario-specific payloads do not explain this D7 boilerplate duplication, and searches found no applicable carve-out, resolved prescribed shape, or existing duplicate. (triage: claude-opus-5-5)
