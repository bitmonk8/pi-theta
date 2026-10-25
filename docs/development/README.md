# Development research

These documents are for maintainers working on Theta's architecture and host
integrations. They are dated investigations and design proposals, **not end-user
guides, accepted specifications, or promises of supported hosts**. Shipped
behavior remains defined by the [Reference](../reference/README.md) and the
implementation.

## Start here: shared Theta core

- **[Theta Core: a shared semantic kernel](research/theta-core/REPORT.md)** —
  architecture, package boundaries, proposed execution interfaces, host profiles,
  compatibility, testing, and reversible migration stages.
- [Static dependency audit](research/theta-core/audit/focused-audit.md) — supporting
  runtime-versus-type dependency analysis.

The proposal now explicitly includes **Pi Agent, Pi Durable, Claude Code, Codex,
and OpenCode**. The recommended sequence is:

1. Preserve Pi's current behavior while extracting the shared language/kernel
   and redesigning the query, effect, and ownership boundaries.
2. Exercise that architecture in an ordinary Node-based Durable application
   with owned conversations; do not claim persistent Theta continuations.
3. Prototype **Claude Code's thin Mod plus Node engine bridge**, including
   detached command orchestration, native permission-aware tools, and explicit
   completion/cancellation ownership. Qualify structured inference, exact tool
   exposure, worker behavior, and headless lifetime before advertising support.
4. Develop Codex/OpenCode owned-worker profiles and any native entry surfaces
   only to the extent their demonstrated capabilities meet the contract.

The external-host slices can be investigated independently after the common
boundaries are established. This is not approval to implement all five complete
hosts. A missing capability must produce an explicit unsupported profile or
operation, not a weaker implementation presented as equivalent Theta semantics.
Claude Code's inclusion does not upgrade its earlier stubbed/offline evidence
into real-model or full-worker verification.

## Host feasibility investigations

| Host | Main report | Supporting analyses | Investigation pin |
|---|---|---|---|
| **Claude Code** | [Feasibility](research/hosts/claude-code/REPORT.md) | [Local port/dependencies](research/hosts/claude-code/local-port-analysis.md); [semantic gaps](research/hosts/claude-code/semantic-gaps-analysis.md) | 2.1.303 |
| **Codex** | [Feasibility](research/hosts/codex/REPORT.md) | [Released API](research/hosts/codex/api-audit/REPORT.md); [daemon/ownership](research/hosts/codex/daemon-audit/report.md); [Theta semantics](research/hosts/codex/theta-semantics/REPORT.md) | 0.163.0 |
| **OpenCode** | [Feasibility](research/hosts/opencode/REPORT.md) | [Released API](research/hosts/opencode/delegates/release-api/REPORT.md); [semantics](research/hosts/opencode/delegates/semantics/REPORT.md) | 1.19.3 |
| **Pi Durable** | [Feasibility](research/hosts/pi-durable/REPORT.md) | [API](research/hosts/pi-durable/api-analysis/report.md); [recovery/replay](research/hosts/pi-durable/recovery-analysis/REPORT.md) | 1.4.0 |

These are the releases examined during the investigations, not assertions about
what is latest today. Each report distinguishes release-source inspection,
provider-free experiments, simulated provider responses, and unresolved live
provider/account behavior. A native entry point, an isolated worker, a custom
frontend, and a launcher for another harness are different integration products.

## Related development investigation

- [Herdr subagent transport diagnosis](research/subagent-transport/REPORT.md).
  This is the original **pre-fix** research record. The subsequent pi-config fix
  was committed separately as `ff5b8ec` (`fix(subagent): resolve CLI symlinks
  before locating pane SDK`). Its inclusion here does not imply that the bug is
  still open or that end-to-end pane creation was verified by the original
  diagnostic probe.

## Evidence retention and document history

The authored research documents were moved out of gitignored `.pi/tmp/`
workspaces on **2026-10-25**. This directory tracks the reports and supporting
written analyses only. It does not vendor upstream documentation, downloaded
source/binaries, dependency installations, generated agent definitions,
authentication state, storage databases, experiment scripts, or raw logs.

Each relocated report identifies its original evidence workspace. Unless an
explicit link points to another tracked document, artifact paths and reproduction
instructions refer to that original workspace. Those artifacts remain
**gitignored, local-only, and unavailable in a fresh clone**. Reading the reports
and their linked analyses does not require them; rerunning an experiment may
require reconstructing the setup from the stated release pins and commands.
Original file/line citations are historical evidence at the report's recorded
source baseline, not moving-HEAD references.

The reports' original no-project-modification statements describe the research
runs. Their later publication here is an authorized documentation change, not a
claim that those earlier runs wrote tracked files. The core proposal's
publication revision adds Claude Code to its scope, architecture, capability
matrix, migration, and validation recommendations without claiming new probes.

## Provenance

- The reports and analyses were produced in this conversation's Claude Code,
  Codex, OpenCode, Pi Durable, Theta-core, and Herdr transport investigations.
- Each report retains its original release/source pins, methods, limitations,
  findings, and evidence paths. Report-to-report links were adjusted on move.
- The 2026-10-25 core-proposal revision draws its Claude Code constraints from
  the three tracked Claude Code reports; no additional host/model test was run.
- The Herdr follow-up commit identity was checked in the separate pi-config
  repository. No pi-config code was changed during this documentation move.
