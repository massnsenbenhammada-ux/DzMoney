# DzMoney

DzMoney 2 — clean rebuild.

## Tech stack

- Node.js
- Express 5
- PostgreSQL
- Playwright for end-to-end tests
- esbuild for the generated Monetag browser adapter bundle

## Prerequisites

- Node.js 24 LTS is the recommended CI/runtime line. The repository declares `node >=20`, but Node 20 reached EOL on 2026-03-24.
- PostgreSQL for migrations and database-backed tests.
- A Telegram bot token for authenticated Telegram flows and the real Telegram E2E gate.

## Setup

```bash
npm install
```

Create a local `.env` file with the environment values required by the runtime or by the tests you intend to run. Do not commit secrets.

### Environment variables

The codebase's `process.env.*` references include the following variables:

#### Runtime / deployment

- `DATABASE_URL` — PostgreSQL connection string.
- `DATABASE_SSL` — set to `true` to enable PostgreSQL TLS; `false` disables it explicitly.
- `PORT` — HTTP port; defaults to `3000`.
- `BOT_TOKEN` — Telegram bot token used to verify Telegram WebApp init data.
- `ADMIN_TELEGRAM_USER_IDS` — comma-separated Telegram user IDs allowed through the admin authentication boundary.
- `MONETAG_POSTBACK_SECRET` — secret used by the Monetag postback route.
- `MONETAG_ENABLED` — enables the Monetag provider when set to `true`.
- `ADSGRAM_ENABLED` — enables AdsGram when set to `true`.
- `ADSGRAM_BLOCK_ID` — AdsGram block ID; the current code defaults it to `44442` when unset.
- `ONCLICKA_ENABLED` — enables OnClickA when set to `true`.
- `ONCLICKA_SPOT_ID` — OnClickA spot ID; the current code defaults it to `6134799` when unset.
- `GIGAPUB_ENABLED` — enables GigaPub for its supported gaming context when set to `true`.
- `GIGAPUB_PROJECT_ID` — GigaPub project ID; the current code defaults it to `7958` when unset.
- `RAILWAY_GIT_COMMIT_SHA` — optional Railway deployment commit identifier used for the served asset version.
- `GIT_COMMIT_SHA` — optional generic deployment commit identifier used when the Railway value is absent.
- `RAILWAY_DEPLOYMENT_ID` — optional Railway deployment identifier used as a further asset-version fallback.

#### CI / Playwright / release-gate variables

- `CI` — consumed by Playwright to enable CI retry behavior.
- `TEST_TELEGRAM_USER_ID` — test Telegram user ID used by database-backed load/E2E and real-state release tests.
- `REAL_MONETAG_E2E` — set to `1` to opt into the real Monetag 20-ad Playwright gate.
- `REAL_MONETAG_BASE_URL` — optional base URL for the real Monetag gate; defaults to the production deployment URL used by the test.
- `REAL_AD_PROVIDER_ROTATION_E2E` — set to `1` to opt into the real provider-rotation gate.
- `REAL_AD_PROVIDER_ROTATION_BASE_URL` — optional base URL for the real provider-rotation gate.
- `REAL_SQUAD_ADS_E2E` — set to `1` to opt into the real Squad ads gate.
- `REAL_SQUAD_ADS_BASE_URL` — optional base URL for the real Squad ads gate.

Some CI workflows also set provider toggles such as `ONCLICKA_ENABLED`, `ONCLICKA_SPOT_ID`, `MONETAG_ENABLED`, and `GIGAPUB_ENABLED` directly in the workflow environment.

## Database migrations

Run all pending migrations with:

```bash
npm run migrate
```

Migrations are tracked by filename in the `dzmoney_schema_migrations` registry. They are read from `migrations/` in sorted filename order.

## Start the server

```bash
npm start
```

`npm start` runs migrations first and then starts `server.js`. The `prestart` hook also builds the generated Monetag browser bundle.

For a direct server start without the npm lifecycle hooks:

```bash
node server.js
```

## Tests

The repository does not currently define an `npm test` script. The comprehensive repository test command is:

```bash
npm run test:all
```

Useful targeted commands include:

```bash
npm run test:e2e:daily-view-ads
npm run test:e2e:daily-view-ads:real-monetag
npm run test:e2e:daily-view-ads:real-rotation
npm run test:load:daily-view-ads
npm run test:frontend
npm run test:security-hardening
npm run reconcile:economy
```

Install the Playwright browser required by the E2E suite with:

```bash
npx playwright install --with-deps chromium
```

Real-provider and real-Telegram tests are explicit release gates and require their corresponding environment variables/secrets. They are not replaced by mocked callbacks.

## Project structure

```text
.
├── server.js                 # Express application entry point
├── src/
│   ├── http/                 # HTTP routes and transport boundaries
│   ├── services/             # Domain/application services and provider adapters
│   ├── config/               # Runtime/provider configuration
│   └── db/                   # PostgreSQL access and pool
├── migrations/               # Ordered PostgreSQL schema/data migrations
├── scripts/                  # Migration, reconciliation, contract and test scripts
├── tests/                    # Node and Playwright test suites
├── public/                   # Telegram Mini App frontend and static assets
├── docs/                     # ADRs, contracts, architecture and phase documentation
├── .github/workflows/        # CI, security and phase governance workflows
├── package.json              # Project metadata and npm scripts
└── TODO.md                   # Explicitly deferred engineering improvements
```

## Repository hygiene

Generated dependencies, build output, coverage, logs, local environment files, and the generated Monetag bundle are intentionally ignored by Git. Secrets must remain outside version control.
