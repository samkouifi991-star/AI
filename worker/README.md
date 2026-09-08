# Voice worker (direct runtime)

The always-running process behind `businesses.voice_runtime = 'direct'`:

```
Twilio Media Streams → this worker → OpenAI Realtime → dispatchTool() → Supabase
```

Deployed separately from the Next.js app (which stays on Vercel) because a
phone call is a long-lived, bidirectional connection — not a request/response
workload a serverless function can hold open. This service is its own npm
workspace package (`worker/package.json`, `worker/tsconfig.json`) — its own
dependencies (`ws`, `tsx`, etc.), its own TypeScript config — but it is
**not** a separate deployable copy of the business logic: it imports
`dispatchTool()` and its dependencies directly from `../../lib` (relative
imports into the repo root, no duplicated code — see the top of
`src/call-session.ts`), and npm workspaces hoist both the root app's and
this package's dependencies into one shared root `node_modules` so those
imports resolve correctly. Vapi, `/practice`, and this worker all run the
exact same business logic.

## Running locally

```
npm run worker:dev        # tsx watch worker/src/index.ts, restarts on change
npm run worker:start      # tsx worker/src/index.ts, no watch — what Railway runs
npm run worker:typecheck  # tsc --noEmit against worker/tsconfig.json
```

These are root-level scripts that delegate to the `worker` workspace
(`npm run <script> --workspace=worker`); a plain `npm install` at the repo
root installs and hoists both the root app's and the worker's dependencies.

Needs the same `.env.local` the main app uses (`NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN` at minimum — `worker/src/config.ts` fails fast and
lists exactly what's missing if any are absent).

## Deploying on Railway

1. **New service → Deploy from GitHub repo**, pick this repo. Leave the
   root directory as the repo root (not `worker/`) — this is an npm
   workspace, so `npm install` only hoists and links both the root app's
   and the worker's dependencies into one `node_modules` when it runs at
   the repo root, and the worker's imports of shared code from `../../lib`
   only resolve if that root `node_modules` exists.
2. Railway reads `railway.json` at the repo root automatically: build
   command `npm install`, start command `npm run worker:start`, health
   check `/health`, restart policy `ON_FAILURE` (10 retries). Nothing to
   configure by hand for those.
3. **Environment variables** — set these in the Railway service's
   Variables tab (values from the same place they're set in Vercel today,
   or from `.env.example` at the repo root):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY`
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `PORT` — leave unset; Railway injects this automatically and
     `config.ts` reads it.
4. Confirm it's not sleeping: Railway's default "Web Service" deploy type
   is already an always-on persistent process (unlike some other
   platforms' free tiers) — nothing extra to configure for that, just
   don't deploy it as a Cron/scheduled service by mistake.
5. Once deployed, Railway gives the service a public URL
   (`*.up.railway.app` by default, or a custom domain). That URL's
   `/media-stream` path (added in a later milestone) is what the staging
   restaurant's Twilio number needs to point its Media Stream at — not
   done yet as of this commit.

## What's here

- `package.json` / `tsconfig.json` — the worker's own workspace-member
  manifest and TypeScript config. `tsconfig.json`'s `lib` deliberately
  includes `"dom"` alongside `"ES2022"` (see the comment in the file) so
  `Response.json()` in `lib/vapi-assistant.ts` (pulled in transitively
  through `dispatchTool()`) typechecks the same way it does under the root
  app's own `next build` — without it, `tsc` sees a real type error there
  that `next build` doesn't.
- `src/config.ts` — env var loading, fails loudly on startup if anything's missing.
- `src/index.ts` — the persistent HTTP server: `/health` for Railway's health
  check, WS upgrade handling at `/media-stream`, structured logs (the same
  `lib/logger.ts` the rest of the app uses), graceful shutdown on
  `SIGTERM`/`SIGINT` so a Railway-initiated restart closes cleanly instead
  of dropping connections mid-response.
- `src/twilio-stream.ts` — parses/sends Twilio Media Streams protocol frames.
- `src/realtime-session.ts` — the OpenAI Realtime WS session wrapper
  (function-call correlation, audio streaming), transport-injected so it's
  unit-testable without a live connection — see
  `src/realtime-session.test.mjs`.
- `src/call-session.ts` — wires a Twilio stream to a Realtime session,
  loads the call-config snapshot, calls `dispatchTool()` for tool calls.
- `src/call-lifecycle.ts` — saves call start/end to Supabase.

Payments, SMS, transfers, recording, and failover are intentionally not
wired into the worker yet — see the reliability architecture doc's
migration plan for the full build order.
