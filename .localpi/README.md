# .localpi/ — local user layer (not shared)

Personal, machine-local pi resources for this repository. Everything here is
gitignored except this README, which is tracked so the directory exists on
every clone (the committed `.pi/settings.json` references it, and pi-theta
treats a referenced-but-missing path as a load error while an existing empty
directory is silent).

- `*.theta` files placed directly in this directory are discovered as personal
  slash commands (via `thetaPaths: ["../.localpi"]` in the committed
  `.pi/settings.json` — settings entries resolve relative to the settings
  file's own directory, i.e. `.pi/`). A personal theta whose filename stem matches a
  committed `.pi/theta/` command shadows it (settings-sourced thetas rank
  higher; pi-theta emits a cross-source-shadow warning).
- Anything else (scratch, notes, experiments) may live here freely.

The shared, version-controlled project layer is `.pi/` (settings, the
quality-loop thetas). Local-only pi state that must stay in `.pi/` for
discovery reasons — `.pi/agents/`, `.pi/prompts/`, `.pi/bug-hunt/`,
`.pi/tmp/`, `.pi/git/`, `.pi/npm/` — is kept out of git by targeted
.gitignore rules instead.
