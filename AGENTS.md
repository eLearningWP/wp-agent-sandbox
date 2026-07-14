# AGENTS.md

This repository provides reusable WordPress sandbox orchestration. Keep provider lifecycle generic; consuming projects own their plugins, themes, settings, content, and verification profiles.

## Principles

- Worktree isolation is the primary contract: never attach to or mutate an unrelated WordPress installation.
- Docker `wp-env` with MariaDB is authoritative. Playground is an optional quick provider and must not be represented as MySQL-equivalent.
- All lifecycle commands must work without a graphical desktop and expose machine-readable status.
- Use argument-array process spawning; do not pass project configuration through a shell.
- State is disposable and keyed by canonical project path. Cleanup must affect only the selected sandbox.
- Keep the dependency surface small and pin provider packages exactly.

## Verification

Run:

```sh
npm test
npm run lint
```

Provider changes also require a real smoke test against an example consuming project before release.
