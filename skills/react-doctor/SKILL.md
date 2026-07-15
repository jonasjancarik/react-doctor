---
name: react-doctor
description: Use when finishing a feature, fixing a bug, before committing React code, or when the user types `/doctor`, asks to scan, triage, or clean up React diagnostics. Covers lint, accessibility, bundle size, architecture. Includes a regression check and a full local-triage workflow that fetches the canonical playbook.
---

# React Doctor

Scans React codebases for security, performance, correctness, and architecture issues. Outputs a 0–100 health score.

<!-- personal-react-doctor-skill:start -->
## Choose the command

Before running React Doctor:

1. Prefer a repository-provided React Doctor script and use the repository's package manager.
2. Otherwise, if the repository declares `react-doctor`, run its local binary through the repository's package manager.
3. Otherwise, use the pinned fallback `npx --yes react-doctor@0.7.8 --no-telemetry`.

Never use `@latest`, and do not add React Doctor to a repository unless the user asks. Include `--no-telemetry` when invoking the CLI directly.
<!-- personal-react-doctor-skill:end -->

## After making React code changes:

Run the selected command with `--verbose --scope changed --no-telemetry` and check the score did not regress. If no local command is available, run `npx --yes react-doctor@0.7.8 --verbose --scope changed --no-telemetry`.

If the score dropped, fix the regressions before committing.

## For general cleanup or code improvement:

Run the selected command with `--verbose --no-telemetry` (the default `--scope full`) to scan the full codebase. If no local command is available, run `npx --yes react-doctor@0.7.8 --verbose --no-telemetry`. Fix issues by severity — errors first, then warnings.

## /doctor — full local triage workflow

When the user types `/doctor`, says "run react doctor", or asks for a full triage / cleanup pass (not just a regression check), fetch the canonical local-triage playbook and follow every step in it:

```bash
curl --fail --silent --show-error \
  --header 'Cache-Control: no-cache' \
  https://www.react.doctor/prompts/react-doctor-agent.md
```

The playbook is the single source of truth — a scan → filter → triage → fix → validate loop that edits the working tree directly (never commits, never opens PRs). Updating the prompt at its source updates every agent on its next fetch — no skill reinstall needed.

Pair it with the matching per-rule prompts at `https://www.react.doctor/prompts/rules/<plugin>/<rule>.md` (fetched on demand inside the playbook) so each fix uses the canonical, reviewer-tested recipe.

## Configuring or explaining rules

When the user wants to understand a rule, disagrees with one, or wants to disable / tune which rules run (not fix code), read [references/explain.md](references/explain.md) and follow it. Use the selected local command or pinned fallback for `rules explain <rule>`, then apply the narrowest control via `rules disable|set|category|ignore-tag …`, which edits your `doctor.config.*` (or `package.json#reactDoctor`).

## Command

```bash
npx --yes react-doctor@0.7.8 --no-telemetry --verbose --scope changed
```

| Flag              | Purpose                                                          |
| ----------------- | ---------------------------------------------------------------- |
| `.`               | Scan current directory                                           |
| `--verbose`       | Show affected files and line numbers per rule                    |
| `--scope changed` | Only report issues introduced vs the base branch (default: full) |
| `--scope lines`   | Only report issues on the changed lines                          |
| `--score`         | Output only the numeric score                                    |
