# WP Agent Sandbox

Worktree-isolated WordPress environments for coding agents and humans. A project supplies a declarative manifest and optional WordPress seed scripts; this CLI owns provider lifecycle, per-worktree state, machine-readable discovery, and cleanup.

The default provider uses Docker-backed `wp-env` with MariaDB. The optional Playground provider is intended for quick, non-authoritative single-site feedback when a project's compatibility checks pass.

## Status

This is a public source repository. The package remains marked private in `package.json` because it is installed from GitHub and is not currently published to npm.

## Requirements

- Node.js 20.18 or newer.
- Docker Desktop or Docker Engine for the `wp-env` provider.
- Composer or any other host tools declared by the consuming project's preparation steps.

## Install

Install directly from the public GitHub repository:

```sh
npm install --global github:eLearningWP/wp-agent-sandbox
```

For a consuming project, prefer pinning an exact commit as a development dependency and exposing project-specific npm aliases.

For local engine development:

```sh
npm install
npm link
```

From a configured WordPress plugin worktree:

```sh
wp-agent-sandbox check
wp-agent-sandbox prepare
wp-agent-sandbox prepare --prepare browser-assets
wp-agent-sandbox up --profile minimal
wp-agent-sandbox status --json
wp-agent-sandbox wp -- plugin list
wp-agent-sandbox verify
wp-agent-sandbox stop
wp-agent-sandbox destroy
```

All commands are headless by default. The returned URL can be opened in a headed browser or used by Playwright/Chromium in headless mode.

The CLI never runs automatically on workspace startup, checkout, or dependency installation. `prepare` only runs host commands declared by the project; a provider environment is created only when `wp-agent-sandbox up` is explicitly invoked.

The same manifest can declare installed plugins/themes, pinned WordPress and PHP versions, preparation commands, seed scripts, verification commands, demo content, users, options, and plugin-owned database state. The project owns that profile data; this repository owns only the portable lifecycle engine.

## Provider roles

- Use `wp-env` for authoritative database behavior, MySQL/MariaDB custom tables, multisite/network activation, WP-CLI, and integration verification. The generated runtime disables `wp-env`'s redundant tests environment, so each sandbox starts one development WordPress/PHP runtime and one database runtime.
- Use Playground for a faster ephemeral, single-site SQLite browser or REST compatibility probe. WordPress Playground cannot run multisite on custom ports, so per-agent multisite validation remains a Docker responsibility.
- Neither provider reads or changes an existing LocalWP database. A consuming worktree is mounted as code into a new WordPress installation whose state is keyed by the worktree's canonical path.

## Project manifest

Place `wp-agent-sandbox.config.json` at the consuming project root. The CLI discovers it by walking upward from the current directory.

```json
{
  "$schema": "/path/to/wp-agent-sandbox/schema/config.schema.json",
  "name": "example",
  "project": {
    "type": "plugin",
    "slug": "example-plugin",
    "entrypoint": "example.php"
  },
  "defaults": {
    "provider": "wp-env",
    "profile": "minimal",
    "port": 8888
  },
  "wordpress": {
    "version": "7.0",
    "phpVersion": "8.3",
    "multisite": true
  },
  "prepare": [
    {
      "id": "composer",
      "command": ["composer", "install", "--no-interaction"],
      "unlessPathExists": "vendor/autoload.php"
    }
  ],
  "profiles": {
    "minimal": {
      "wpEnv": {
        "seed": [["plugin", "activate", "example-plugin", "--network"]],
        "verify": [["plugin", "status", "example-plugin"]]
      },
      "playground": {
        "blueprint": "sandbox/playground/minimal.blueprint.json",
        "httpChecks": ["/wp-json/"]
      }
    }
  }
}
```

Preparation entries marked `"optional": true` run only when selected with `--prepare <id>`. Profiles can compose other profiles with `"extends": ["minimal"]`. Seed commands are ordinary WP-CLI argument arrays, so they can run idempotent project-owned PHP scripts that create plugin tables, options, users, settings, and demo content.

`prepare` and `up` both run mandatory preparation. Use `--force` with either command to ignore `unlessPathExists` guards and rerun selected preparation after dependency-lock or source changes.

## Integrating a project

1. Pin an exact public commit as a development dependency; an HTTPS archive works on cloud agents without GitHub SSH credentials.
2. Commit `wp-agent-sandbox.config.json` with the project's versions, preparation, profiles, seeds, and verification commands.
3. Add short package aliases such as `sandbox:prepare`, `sandbox:up`, `sandbox:status`, `sandbox:verify`, and `sandbox:destroy`.
4. Add a concise section to `AGENTS.md` (and equivalent Cursor/Claude instructions if needed) that says when to use preparation only, when Docker is authoritative, which profiles exist, how to discover URLs, and how to stop or destroy state.

Example project scripts:

```json
{
  "scripts": {
    "sandbox:prepare": "wp-agent-sandbox prepare",
    "sandbox:up": "wp-agent-sandbox up",
    "sandbox:status": "wp-agent-sandbox status --json",
    "sandbox:verify": "wp-agent-sandbox verify",
    "sandbox:destroy": "wp-agent-sandbox destroy"
  }
}
```

Suggested `AGENTS.md` policy:

```md
- Run `npm install` once in a fresh worktree to install the pinned CLI.
- Use `npm run sandbox:prepare` for code dependencies only; add `-- --prepare browser-assets` when built UI assets are needed.
- Start WordPress only for integration or browser verification with `npm run sandbox:up -- --profile <profile> --json`.
- Use the returned URL with HTTP tools or a headless browser, then stop or destroy the sandbox promptly.
- Never point sandbox commands at the shared LocalWP site or database.
```

### Hooks and actions

A worktree-creation hook may explicitly run:

```sh
npm install
npm run sandbox:prepare -- --prepare browser-assets
```

For a post-change action that must rebuild even when outputs already exist:

```sh
npm run sandbox:prepare -- --prepare browser-assets --force
```

Neither command starts WordPress. Do not put `sandbox:up` in a generic workspace-start hook; start providers only when a task actually needs integration or browser verification.

The same preparation-only boundary works in a CI action:

```yaml
- run: npm ci
- run: npm run sandbox:prepare -- --prepare browser-assets
```

Add `sandbox:up`, verification, and teardown only to jobs that need WordPress integration. Unit, lint, and build jobs do not need Docker or a WordPress provider.

Preparation and provider mutations are protected by a worktree-scoped stale-safe lock, and lifecycle state is replaced atomically. Concurrent hooks or agents therefore serialize rather than running Composer, npm, or provider mutations over each other.

### Shared LocalWP workflows

If the acceptance target is the isolated sandbox, this workflow replaces branch-detach, build-copy, and restore-main scripts: the worktree's own code and generated assets are mounted directly. A separate `verify-branch`/`restore-main` workflow is still useful only when a check explicitly depends on LocalWP-specific web-server, certificate, mail, or host configuration.

## State and isolation

State defaults to `$XDG_CACHE_HOME/wp-agent-sandbox` or `~/.cache/wp-agent-sandbox`. Set `WP_AGENT_SANDBOX_HOME` to override it. The canonical project/worktree path is hashed into the sandbox identity, so two Git worktrees receive independent providers, ports, and databases.

Provider images and package-manager download caches may be shared. WordPress databases and lifecycle state are never shared between worktrees.
