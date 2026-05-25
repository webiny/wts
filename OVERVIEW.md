# Webiny Telemetry System (WTS)

End-to-end overview of how Webiny captures anonymous product analytics across the marketing site, docs, learn site, CLI, and admin app — and how those events flow through to PostHog for funnel analysis.

---

## 1. What WTS does

WTS is the proxy + client library that powers Webiny's product analytics. The goals are, in priority order:

1. **Funnel-level visibility** of the user journey: marketing site → docs/learn → `npx create-webiny-project` → deploy → admin onboarding → first login.
2. **Adblocker resistance** — events are posted to `t.webiny.com` (a first-party Webiny domain) rather than directly to PostHog. uBlock-style filter lists block PostHog/Heap CDNs but not Webiny domains.
3. **Anonymous by design** — no per-user identification. The funnel works at cohort/session granularity. No `projectName`, `organizationName`, or other free-text user input is ever sent.
4. **Honor opt-out everywhere** — `WEBINY_TELEMETRY=false` (CLI/Node) and `localStorage.WEBINY_TELEMETRY=false` (browser) hard-disable all event emission.

PostHog (`eu.i.posthog.com`) is the destination. Heap was retired during the v3 rewrite.

---

## 2. Repositories

| Repo | Purpose |
|---|---|
| [`webiny/wts`](https://github.com/webiny/wts) | The client library. Published to npm as `@webiny/wts-client`. ESM-only TypeScript. Three entrypoints: `web`, `react`, `node`. |
| [`webiny/wts-server`](https://github.com/webiny/wts-server) | The proxy Lambda. Receives events at `t.webiny.com`, validates / parses them, forwards to PostHog. Private repo — not published. |
| [`webiny/webiny-v6-website`](https://github.com/webiny/webiny-v6-website) (subdir `nextjs/`) | Marketing site (`www.webiny.com`). Uses `@webiny/wts-client/react`. Hosts the `/install/finish` retro-merge page. |
| [`webiny/docs.webiny.com`](https://github.com/webiny/docs.webiny.com) | Docs / reference manual. Uses `@webiny/wts-client/react`. |
| [`webiny/learn-webiny-course-app`](https://github.com/webiny/learn-webiny-course-app) | Course site. Uses `@webiny/wts-client/react`. |
| [`webiny/webiny-js`](https://github.com/webiny/webiny-js) | The Webiny CMS monorepo. Houses `@webiny/telemetry` (internal wrapper around `@webiny/wts-client`), the CLI (`packages/cli-core`, `packages/create-webiny-project`), and the admin app (`packages/app-admin`). |

Local layout (developer machine):

```
~/Dev/
├── wts/                              # @webiny/wts-client source
├── wts-server/                       # t.webiny.com Lambda
└── webiny-v6-website/                # plain folder, NOT a monorepo
    ├── nextjs/                       # www.webiny.com
    ├── docs.webiny.com/
    ├── learn-webiny/
    └── webiny/                       # webiny-js / Webiny CMS source
```

---

## 3. Identity model

Three distinct identifiers, each scoped differently. Don't collapse them.

| ID | Scope | Persistence | Used as |
|---|---|---|---|
| **`wts_did`** | Browser visitor on `*.webiny.com` | First-party cookie on `.webiny.com`, 90-day TTL, with localStorage fallback | PostHog `distinct_id` for marketing/docs/learn page-view events |
| **`machine_id`** | Developer machine | UUID stored at `~/.webiny/config` (the existing `user.id` field). Stable across multiple Webiny projects on the same machine | PostHog `distinct_id` for CLI events. Also passed at admin build time as `REACT_APP_WEBINY_TELEMETRY_USER_ID` so admin events share the deployer's identity |
| **`installation_id`** | One Webiny project | UUID generated at `npx create-webiny-project` time, written to `<project>/webiny.installation.json` (tracked in git, NOT under `.webiny/`) | Super-property on every CLI/admin event for that project. Lets PostHog group events per-install regardless of which machine produced them |

The `wts_did` cookie and the `machine_id` are joined retroactively via the **install/finish handoff** (section 7). Until that handoff fires, the website cohort is decoupled from the CLI/admin cohort.

---

## 4. The client library — `@webiny/wts-client`

Source: [`webiny/wts`](https://github.com/webiny/wts), branch `v3`.
Published as `@webiny/wts-client@^3` on npm.

### Entrypoints

| Import | Use case |
|---|---|
| `@webiny/wts-client/web` | Browser. Cookie-based identity on `.webiny.com`, optional `distinctId` override (used by admin to inherit machine_id). |
| `@webiny/wts-client/react` | React provider + hooks. Mounted in marketing/docs/learn root layouts. Auto-tracks page-view events on route change. Exposes `useTelemetry()` and `useTrackPageView(path)`. |
| `@webiny/wts-client/node` | Node/CLI. Reads machine_id from `~/.webiny/config`. |

### API surface (all entrypoints)

```ts
const wts = new WTS({ source: "site" | "docs" | "learn" | "admin" | "cli" });

wts.track("event-name", { ...properties });
wts.alias(oldId, newId);  // emits $create_alias for retro-merge
WTS.getCookieId();         // static, reads .webiny.com cookie (web only)
```

### Transport

- POST to `t.webiny.com/event`
- Body: JSON, `Content-Type: text/plain;charset=UTF-8` (CORS-simple, no preflight)
- Browser: `fetch` with `keepalive: true`, falls back to `navigator.sendBeacon` on `pagehide`
- Node: plain `fetch` (Node 18+ global)

### Build & publish

- Build: `yarn build` → emits `dist/` with type declarations + sourcemaps
- CI: GitHub Actions workflow `release.yml` (manual trigger via `workflow_dispatch`), runs semantic-release with `publishConfig.access: public`
- `release.config.mjs` has `branches: ["v2", "v3"]` — multi-channel release

---

## 5. The server proxy — `wts-server`

Source: [`webiny/wts-server`](https://github.com/webiny/wts-server), branch `v3`.
**Private repo, not published.** Deployed via AWS SAM to a single Lambda behind API Gateway, fronted by the `t.webiny.com` custom domain.

### Endpoints

| Method + path | Purpose |
|---|---|
| `POST /event` | The v3 client format. Body is text/plain JSON. Validated, forwarded to PostHog. |
| `POST /` | **Legacy** wts-client v2 format (base64 form-urlencoded). Kept during cutover so older Webiny releases still hitting `t.webiny.com/` keep working. Will be removed once all consumers are on v3. |
| `GET /ip` | Returns the client's IP. Used by the legacy v2 client. Safe to keep indefinitely. |

### Pipeline

```
Lambda handler
   ├─ method routing (GET /ip, POST /event, POST /, OPTIONS *)
   ├─ Bot filter (UA blocklist: Googlebot, Slackbot, curl, headless Chrome, etc.)
   ├─ Per-IP rate limit (in-memory, 120/min, resets on cold-start)
   ├─ Parser (parsers.ts: parseV3 or parseLegacyV2)
   ├─ PostHog forwarder (posthog.ts)
   │     - api_key hardcoded in code (POSTHOG_KEY constant; this repo is private,
   │       and PostHog capture keys are designed to be public anyway)
   │     - X-Forwarded-For: real client IP (so PostHog GeoIP enrichment works)
   │     - Endpoint: https://eu.i.posthog.com/capture/
   └─ CORS headers (echoes Origin)
```

### Source layout

```
wts-server/src/
├── handler.ts          # Lambda entry, route dispatch
├── parsers.ts          # parseV3, parseLegacyV2
├── posthog.ts          # PostHog HTTP forwarder
├── botFilter.ts        # UA blocklist + rate limiter
└── types.ts            # NormalizedEvent, APIGatewayEvent shapes
```

### Build & deploy

- Build: `yarn build` → webpack bundles to `dist/bundle.js` (~13 KiB, CommonJS, exports `lambdaHandler`)
- Deploy: `sam deploy --profile sven-root-wts`
  - Stack name: `wts-server`, region `us-east-1`
  - SAM config in `samconfig.toml` (uses `confirm_changeset = false`)
  - No deploy-time parameters needed (PostHog key is in code)

Tests (22 across parsers, botFilter, handler routing): `yarn test`

---

## 6. Consumer apps

### Marketing site — `webiny-v6-website/nextjs`

- Next.js 15 app router
- `src/app/layout.tsx` wraps everything in `<Telemetry source="site">` (defined in `src/components/Telemetry.tsx`)
- Auto-tracks `page-view` events on every route change (uses Next.js `usePathname` + `useSearchParams`, wrapped in `<Suspense>` to avoid client-side bailout)
- Hosts the `/install/finish` page (see section 7) at `src/app/install/finish/page.tsx`
- `src/lib/wtsReturnTo.ts` — the strict CloudFront-only `return_to` validator (open-redirect protection)

### Docs site — `docs.webiny.com`

- Next.js pages router
- `src/components/Telemetry.js` mounts `<TelemetryProvider source="docs">` + a `useRouter().asPath`-driven `useTrackPageView`
- Mounted in `src/pages/_app.js`
- `_app.js` and `_document.js` are tracked-but-gitignored special cases — the gitignore has `/src/pages/` excluded with `!/src/pages/_*` un-excluding the underscore files. `git add` of those needs `-f`.
- Heap loader and Banquet script were removed from `_document.js` during migration

### Learn site — `learn-webiny-course-app`

- Next.js app router (similar shape to marketing site)
- `components/telemetry.tsx` wraps `<TelemetryProvider source="learn">`
- Mounted in `app/layout.tsx`

### Webiny admin + CLI — `webiny-js` (subdir `webiny/` of `webiny-v6-website`)

- `packages/telemetry/` — internal wrapper. Exports `sendEvent` from `cli.js` (Node) and `react.js` (admin). Owns identity resolution (URL params → localStorage → env var) and the `installation_id` injection.
- `packages/create-webiny-project/` — scaffolds new projects. Generates `webiny.installation.json` at scaffold time.
- `packages/cli-core/src/decorators/DeployCommandWithTelemetry.ts` — wraps the `webiny deploy` command with start/end/error telemetry events.
- `packages/app-admin/src/base/TelemetryAdminAppStart.tsx` — fires `admin-app-start` once on admin app mount.
- `packages/app-admin/src/presentation/installation/components/SystemInstaller/steps/FinishSetup.tsx` — the post-install onboarding wizard's final step. Hosts the "Activate Webiny" CTA that triggers the install/finish handoff.
- `packages/project/src/extensions/Project/SetAdminAppEnvVarsBefore{Build,Watch}.ts` — exposes build-time env vars (`REACT_APP_WEBINY_TELEMETRY_USER_ID`, `REACT_APP_WEBINY_INSTALLATION_ID`, etc.) to the admin webpack bundle.
- `packages/project/src/extensions/installationId.ts` — the `readInstallationId()` helper.

---

## 7. The install/finish retro-merge handoff

This is how the website visitor's anonymous `wts_did` gets unified with the developer's `machine_id` after they complete a Webiny install — without ever printing UUIDs in the user's terminal or asking them to do anything visible.

### Flow

```
1. User browses webiny.com / docs / learn
   ─ Sets cookie wts_did=A on .webiny.com
   ─ Page-view events fire with distinct_id=A

2. User runs `npx create-webiny-project my-project`
   ─ create-webiny-project generates UUID, writes <project>/webiny.installation.json
   ─ CLI events fire with distinct_id=<machine_id from ~/.webiny/config>
     and installation_id from webiny.installation.json

3. User runs `webiny deploy`
   ─ SetAdminAppEnvVarsBeforeBuild reads webiny.installation.json
     and exposes REACT_APP_WEBINY_INSTALLATION_ID to the admin bundle
   ─ Admin bundle ships with REACT_APP_WEBINY_TELEMETRY_USER_ID=<machine_id>
     and REACT_APP_WEBINY_INSTALLATION_ID=<installation_id>

4. User opens the printed CloudFront admin URL
   ─ Admin loads, fires admin-app-start with distinct_id=<machine_id>,
     project_id=<installation_id>
   ─ Wizard runs: introduction → basic-info → admin-account (cognito only) → finish

5. User clicks "Start using Webiny" on the FinishSetup step
   ─ FinishSetup.tsx checks: is admin on *.cloudfront.net AND is telemetry enabled?
   ─ If yes: navigates to https://www.webiny.com/install/finish?machine_id=<id>&return_to=<admin>
   ─ If no: falls through to the normal finishInstallation() flow

6. Browser navigates to webiny.com/install/finish (full top-level navigation,
   first-party context — works in every browser including Safari/Brave)
   ─ Server-side reads wts_did cookie (=A) on .webiny.com origin
   ─ Validates return_to against ^[a-z0-9-]+\.cloudfront\.net$ regex
     (open-redirect-proof; failure renders a non-redirecting error page)
   ─ POSTs $create_alias event to t.webiny.com/event:
       { event: "$create_alias", distinct_id: <machine_id>, alias: A,
         source: "site", timestamp: ... }
     (best-effort, 2-second timeout, never blocks redirect)
   ─ Renders splash ("Activating your Webiny installation...") with
     meta-refresh + JS location.replace
   ─ Redirects user back to admin

7. PostHog ingests the alias event
   ─ Retroactively merges A and machine_id
   ─ All historical website events (distinct_id=A) and all CLI/admin events
     (distinct_id=machine_id) now appear as the same person in funnels
```

### Why this design

The earlier plan considered three alternatives:

1. **A flag in the install command** (`npx create-webiny-project --tracking-id=...`) — rejected. The install command is the most-screenshotted artifact in Webiny's docs; cluttering it with a UUID hurts UX.
2. **A short-code paste prompt in the CLI** — rejected. Adds first-run friction.
3. **A hidden iframe on the admin page that reads the `.webiny.com` cookie** — rejected. Safari ITP and Brave block third-party-cookie reads in iframes; ~15-20% of users would silently miss the merge.

The redirect-through-webiny.com approach is **first-party** at every step (the user explicitly clicked a link, the navigation is top-level) so it works in every browser.

### Limitations honestly acknowledged

- Users who never reach the FinishSetup step (deploy fails, abandoned mid-onboarding) don't get merged. Their funnel is web→CLI cohort-only, not user-level.
- Users who clear cookies between web visit and admin open lose the merge.
- Users who deploy from machine A but open admin on machine B (rare) get B's machine_id merged with B's website cookie, not A's.

---

## 8. Event catalog

### Browser events (auto, all marketing sites)

| Event | Source | Fires when |
|---|---|---|
| `page-view` | `site` / `docs` / `learn` | Every route change (Next.js router) |

Properties: `url`, `referrer` (auto), `path` (the route), plus app-specific metadata if added.

### CLI events (`@webiny/telemetry/cli.js`)

| Event | Fires when |
|---|---|
| `cli-create-webiny-project-start` | `npx create-webiny-project` begins |
| `cli-create-webiny-project-end` | Scaffold completes |
| `cli-project-deploy-start` | `webiny deploy` begins |
| `cli-project-deploy-end` | Deploy succeeds |
| `cli-project-deploy-error` | Deploy fails (with error message) |
| `cli-project-deploy-error-graceful` | Deploy fails with a known/expected error |
| `cli-pulumi-command-deploy-*` | Per-app pulumi deploys (start/end/error variants) |
| `disable-telemetry` / `enable-telemetry` | User toggles telemetry |

Super-properties on every CLI event: `version` (Webiny version), `ci` (yes/no), `newUser`, `installation_id` (when `webiny.installation.json` is present), `wcpOrgId` / `wcpProjectId` (when WCP env vars are set).

### Admin events (`@webiny/telemetry/react.js`)

| Event | Fires when |
|---|---|
| `admin-app-start` | Admin app mounts (once per page load) |
| `install-wizard-start` | System installer is shown (system not yet installed) |
| `install-wizard-end` | System installer completes successfully |

Properties on `install-wizard-end`: `referralSource` only. **Not** `projectName` or `organizationName` — those are deliberately stripped to maintain anonymous-only telemetry posture.

Super-properties on every admin event: `version`, `ci`, `newUser`, `project_id` (= `installation_id`), `wcpOrgId` / `wcpProjectId` if set.

### Special

| Event | Source | Purpose |
|---|---|---|
| `$create_alias` | `site` | The retro-merge from the install/finish page. Server forwards it to PostHog as a `$create_alias` capture, merging `alias` (old id) into `distinct_id` (new id). |

---

## 9. Privacy & opt-out

### What's collected

- An anonymous UUID per browser visitor (`wts_did` cookie)
- An anonymous UUID per developer machine (`machine_id` from `~/.webiny/config`)
- An anonymous UUID per Webiny project (`installation_id` from `webiny.installation.json`)
- Event names + categorical properties (route paths, OS, version, referralSource, etc.)
- Client IP (used by PostHog for GeoIP enrichment; not stored in event properties)

### What's NEVER collected

- Project names typed by the user during install
- Organization names typed by the user during install
- Source code, schema content, environment variables
- Any free-text user input beyond categorical referralSource
- Personal data (email, name, etc.)

### Opting out

| Context | Mechanism |
|---|---|
| CLI / Node | `WEBINY_TELEMETRY=false` env var, or `webiny telemetry disable` (writes to `~/.webiny/config`) |
| Browser (marketing/docs/learn) | `localStorage.WEBINY_TELEMETRY=false` |
| Admin | `REACT_APP_WEBINY_TELEMETRY=false` env var at build time |

Every event-emitting code path checks this flag before posting. The `/install/finish` CTA also checks it — when telemetry is off, the CTA falls through to the local `finishInstallation()` and never navigates the user to webiny.com.

---

## 10. PostHog setup

- Project endpoint: `https://eu.i.posthog.com`
- Capture key: hardcoded in `wts-server/src/posthog.ts` as `POSTHOG_KEY` (this is a public capture key — designed to be exposed)
- Events arrive via `POST /capture/` from the Lambda, with the real client IP forwarded via `X-Forwarded-For`

### Suggested funnel in PostHog UI

```
1. page-view (path~/get-started)
2. cli-create-webiny-project-start
3. cli-project-deploy-end
4. admin-app-start
```

Conversion window: 7-14 days. Segment by:
- `source` (`site` / `docs` / `learn`) — which app drove conversion
- `properties.referralSource` — what referral source self-reports best
- `properties.installation_id` — for per-install drill-down once webiny-js v3 is released
- Country (auto-derived from PostHog GeoIP)

---

## 11. Operations / runbook

### Deploy the server

```
cd ~/Dev/wts-server
git checkout v3
yarn build
sam deploy --profile sven-root-wts
```

Verification:

```
curl https://t.webiny.com/ip
curl -X POST https://t.webiny.com/event \
  -H "Content-Type: text/plain;charset=UTF-8" \
  -H "User-Agent: Mozilla/5.0 ..." \
  -d '{"event":"smoke-test","distinct_id":"x","source":"site","properties":{},"timestamp":"2026-05-09T00:00:00.000Z"}'
```

Expected: `200 OK` with `{"message":"ok"}`. Bot UAs (e.g. `curl/8.0` without UA override) get `{"message":"filtered"}`.

### Publish a new client version

```
cd ~/Dev/wts
# make changes on v3 branch, commit with conventional-commit style
git push origin v3
# Trigger the workflow:
gh workflow run release.yml --ref v3 --repo webiny/wts
# Or via the GitHub UI: Actions → NPM Release → Run workflow → branch v3
```

`semantic-release` computes the next version from commit prefixes (`feat:`/`fix:`/`feat!:`) and publishes via the npm registry. `publishConfig.access: public` is set in `package.json` so scoped publishing works on the free npm tier.

### Migrate a new app to WTS

1. `yarn add @webiny/wts-client@^3`
2. Mount `<TelemetryProvider source="<app>">` in the root layout
3. Add `<PageViewTracker />` (using `usePathname` for Next.js, `router.asPath` for pages router)
4. Verify in PostHog Live Events feed that page-view events arrive with `source=<app>`

### Disable telemetry locally

- CLI / Node: `export WEBINY_TELEMETRY=false` or `webiny telemetry disable`
- Browser: `localStorage.setItem("WEBINY_TELEMETRY", "false")` in DevTools

---

## 12. Outstanding work

As of 2026-05-09:

| Item | Status |
|---|---|
| Release `webiny-js` `feat/wts-v3` (admin CTA + installation_id + PII fix) | PR open, awaiting next `@webiny/*` release |
| Build the conversion-window funnel in PostHog UI | Configuration only |
| Convert "Where did you hear about Webiny?" to a fixed dropdown | Optional UX work, separate PR |
| Decommission Heap dashboards or migrate to PostHog | The wts-server v3 deploy stopped sending to Heap; existing Heap data is still queryable until the account is closed |

---

## 13. Quick reference

| Thing | Where                                                    |
|---|----------------------------------------------------------|
| Production telemetry endpoint | `https://t.webiny.com/event` (POST, text/plain JSON)     |
| Legacy v2 endpoint (cutover) | `https://t.webiny.com/` (POST, base64 form-urlencoded)   |
| IP lookup | `https://t.webiny.com/ip` (GET)                          |
| PostHog | `https://eu.i.posthog.com`, capture key `phc_**********` |
| Client npm package | `@webiny/wts-client@^3`                                  |
| Server stack | CloudFormation `wts-server` in `us-east-1`               |
| Cookie domain | `.webiny.com` (90-day TTL)                               |
| Project installation file | `<project-root>/webiny.installation.json`                |
| Machine config | `~/.webiny/config` (JSON, `user.id` field)               |
