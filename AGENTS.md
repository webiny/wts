# AGENTS.md — @webiny/wts-client

## Project overview

Webiny Telemetry Service (WTS) client library. Pure TypeScript, ESM-only, zero runtime dependencies. Three entry points: `web`, `node`, and `react`.

## Architecture

```
src/
  types.ts    — shared type definitions (EventSource, TrackEvent, AliasEvent, ClientConfig)
  core.ts     — TelemetryClient base class, Transport/Identity interfaces, uuid helper
  web.ts      — browser WTS client (cookie+localStorage identity, fetch/sendBeacon transport)
  node.ts     — Node.js WTS client (file-based identity in ~/.webiny/config, fetch transport)
  react.tsx   — React bindings (TelemetryProvider, useTelemetry, useTrackPageView)
```

`core.ts` defines the abstract plumbing. `web.ts` and `node.ts` each provide platform-specific `Identity` and `Transport` implementations. `react.tsx` wraps the web client in React context.

## Conventions

- **Package manager**: Yarn 4 — always use `yarn`, never `npm` or `npx`.
- **Module system**: ESM only (`"type": "module"`). All internal imports use `.js` extensions.
- **TypeScript**: strict mode, `verbatimModuleSyntax`, `isolatedDeclarations`. All exported functions must have explicit return types.
- **Formatting**: Prettier. Run `yarn lint:fix` before committing.
- **No runtime dependencies**. React is an optional peer dependency.

## Commands

| Task            | Command             |
| --------------- | ------------------- |
| Type-check      | `yarn tsc --noEmit` |
| Build           | `yarn build`        |
| Test all        | `yarn test`         |
| Test web only   | `yarn test:web`     |
| Test node only  | `yarn test:node`    |
| Test react only | `yarn test:react`   |
| Lint check      | `yarn lint`         |
| Lint fix        | `yarn lint:fix`     |

## Testing

Tests use Node's built-in test runner via `tsx --test`. Test files live in `__tests__/` and mirror the entry points: `web.test.ts`, `node.test.ts`, `react.test.tsx`.

## Build output

`yarn build` compiles `src/` into `dist/` and copies `package.json` into `dist/`. The package is published from `dist/`.

## Key patterns

- Opt-out is checked via `WEBINY_TELEMETRY=false` (env var in Node, localStorage in browser).
- The web client persists `distinct_id` in both a cookie (`wts_did`) and localStorage for cross-subdomain and same-origin resilience.
- `WTS.getCookieId()` is a static helper for the install/finish alias flow — it reads the cookie without instantiating a client.
- The `dispatch` method fires-and-forgets; send failures are logged to debug, never thrown.
