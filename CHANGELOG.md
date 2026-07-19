# Changelog

All notable changes to `@bitmonk8/pi-theta` will be documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Renamed the project Loom → Theta** (named after Turing's fixed-point
  combinator, Θ), to resolve a package-name collision with an unrelated
  `pi-loom`. This is a breaking rename across every surface:
  - Package `@bitmonk8/pi-loom` → `@bitmonk8/pi-theta` (to be published `0.2.0`).
  - File extensions `.loom` → `.theta` (programs), `.warp` → `.thetalib`
    (library modules).
  - CLI flag `--loom` → `--theta` (hard rename, no alias).
  - Discovery/settings/manifest surfaces `~/.pi/agent/looms/` →
    `~/.pi/agent/theta/`, `.pi/looms/` → `.pi/theta/`, `loomPaths` →
    `thetaPaths`, `pi.looms` → `pi.theta`, `looms.*` settings → `theta.*`.
    Old names are not honoured; an old-named dir/key surfaces a one-shot
    deprecation diagnostic.
  - Diagnostic-code prefix `loom/*` → `theta/*` (suffixes unchanged, except
    those naming the old extension, e.g. `import-non-warp-extension` →
    `import-non-thetalib-extension`).
  - Runtime identifiers `Loom*` → `Theta*`, `Warp*` → `ThetaLib*`.
  - Release-version literal `loom X.Y` → `theta X.Y`; governance anchors
    `loom-1-0-*` → `theta-1-0-*`.
  - Retired the legacy `v1-*` HTML-anchor dual-anchor governance machinery
    (GOV-25–GOV-29) wholesale, repointing all inbound `#v1-*` cross-references
    to their `theta-1-0-*` canonical arms.
  - See [`docs/rename-to-theta.md`](docs/rename-to-theta.md) for the full plan.

- Pre-release. No published version yet; the package is on a `0.x` line under
  active hardening. Release notes begin at the first published version.
