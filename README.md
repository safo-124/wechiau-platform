# Wechiau Poultry Platform

Field, vet and farmer apps, a web dashboard, and the sync server for the Wechiau Poultry Aggregation and Flock Health Venture.

The specification is the v0.3 technical documentation plus `Wechiau_Platform_Spec_Addendum_v0.4.md` (one folder up), which overrides v0.3 where they differ. The approved screen designs are in `wechiau-designs-handoff.zip`.

## What's where

| Folder | What | Built with |
|---|---|---|
| `apps/mobile` | One Expo project, three apps: `field`, `vet`, `farmer` (chosen by `APP_VARIANT`) | Expo SDK 58, Expo Router, expo-sqlite + Drizzle |
| `apps/web` | Dashboard for Gloria | React 19, Vite, TanStack Query, React Router |
| `apps/server` | API and sync server | NestJS 12, Prisma 7, PostgreSQL 17 |
| `packages/shared` | Table schemas, roles, permissions map, money helpers. Used by everything | TypeScript, zod |
| `packages/ui` | Design tokens (colours, fonts, sizes) from the designs | TypeScript |
| `infra` | Local database setup; later the VPS files (Caddy, systemd, backups) | |

## First-time setup

You need Node 22.12 or later (24 recommended) and PostgreSQL 17.

```bash
npm install
```

This also builds `packages/shared` and generates the Prisma client.

```bash
npm run db:setup
```

This creates the `wechiau` database user and the `wechiau_dev` and `wechiau_test` databases, and writes `apps/server/.env`. psql asks for your `postgres` superuser password; it is never saved.

```bash
npm run db:migrate
```

This creates the tables.

```bash
npm run db:seed
```

This adds sample logins and the default settings (development databases only):

| Role | Name | Phone |
|---|---|---|
| Admin | Gloria Gyimaa | 020 000 0001 |
| Field agent | Sample Field Agent | 020 000 0002 |
| Vet | Kofi | 020 000 0003 |
| Vet | Esi | 020 000 0004 |

They all share one password, `SEED_PASSWORD` in `apps/server/.env`. The seed also adds three Wa buyers, vaccination rounds 1 (free) and 2 (paid, today), and 800 doses of vaccine, so the field and vet apps can be tried straight away.

## Running

| Command | What it starts |
|---|---|
| `npm run dev:server` | API on http://localhost:3000/api (health check: `/api/health`) |
| `npm run dev:web` | Dashboard on http://localhost:5173 |
| `npm run dev:field` | Field app (also `dev:vet`, `dev:farmer`) in Expo |

**On a phone:**
1. Install Expo Go from the Play Store.
2. Put your laptop's Wi-Fi address in `apps/mobile/.env.local` (see `.env.example`). The phone and laptop must be on the same Wi-Fi.
3. Start the server and one app, then scan the QR code with Expo Go.
4. The first time the server starts, Windows may ask whether Node.js can use the network. Allow it on private networks, or phones can't reach it.

The three apps keep separate data and sign-ins, even when you switch between them in Expo Go.

**The farmer app:**
1. Register a farmer in the field app, then sync.
2. With network, open the farmer's profile and tap "Set up the farmer app". You get a 6-digit PIN.
3. Start `npm run dev:farmer` and sign in with the farmer's phone number and that PIN.
4. A report or message sent there reaches the vet app under Messages and on the case, and the vet's reply comes back.

Voice notes need the microphone, so allow it when the phone asks.

**The dashboard:** start the server and `dev:web`, open http://localhost:5173, and sign in with Gloria's email, `gloria@wechiau.test`, and the seed password. Only admins can use the dashboard. Vite passes `/api` on to the server, so the sign-in cookie works without any extra setup. A fresh seed has no starting grant, so the egg fund goes below zero after the first collection. Record one under Money › Add a grant or correction.

## Checks

| Command | What it does |
|---|---|
| `npm run typecheck` | TypeScript in every workspace |
| `npm test` | Unit tests (money, schemas, permissions, sync engine, server) |
| `npm run test:e2e -w @wechiau/server` | Server end-to-end tests, against `wechiau_test` (sign-in, sync, permissions, uploads, dashboard) |
| `npm run build` | Builds the server and dashboard |

CI (`.github/workflows/ci.yml`) runs all of these on every push, and bundles each phone app variant.

## Rules worth knowing before changing code

- Money is whole pesewas everywhere (GHS 40.00 is `4000`). Use the helpers in `packages/shared/src/money.ts`.
- Balances are always calculated from ledger rows, never stored.
- Who can read and change each table lives in one place: `packages/shared/src/permissions.ts`. The server enforces it; the apps use it to hide buttons.
- Every row records who entered it (`recorded_by`).
- Field agents are a full role: they collect, sell and register farmers, and see only their own cash.
- Screens save through `saveRecords` in `apps/mobile/src/db/records.ts`. It checks rows against the shared schema and writes each row and its outbox entry in one transaction.
- Dashboard changes (`apps/server/src/dashboard`) are saved with `saveThroughSync`, so they pass the same checks and reach the phones like any phone change. Don't write those tables with Prisma directly.
- Changing the phone's tables means editing `apps/mobile/src/db/schema.ts`, then running `npm run db:generate -w @wechiau/mobile`. A test checks the phone tables still match `packages/shared`.

## Putting it on the VPS

`npm run release` builds everything on the laptop into one archive for the Hetzner VPS. The steps (first-time setup, each new version, backups, logs) are in [infra/deploy/README.md](infra/deploy/README.md).

## Building installable apps

APKs are built in the cloud with EAS, one profile per app. This needs an Expo account and `npx eas-cli@latest init` once in `apps/mobile`.

```bash
npx eas-cli@latest build -p android --profile field-preview
```

The other profiles are `vet-preview` and `farmer-preview`. They talk to the VPS (`EXPO_PUBLIC_API_URL` in `apps/mobile/eas.json`). The Android package ids in `apps/mobile/app.config.ts` (`com.wechiau.field` and so on) are placeholders. Settle them before the first install on a real phone; they can't change after that.
