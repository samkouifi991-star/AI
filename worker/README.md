# Voice worker (direct runtime)

The always-running process behind `businesses.voice_runtime = 'direct'`:

```
Twilio Media Streams → this worker → OpenAI Realtime → dispatchTool() → Supabase
```

Deployed separately from the Next.js app (which stays on Vercel) because a
phone call is a long-lived, bidirectional connection — not a request/response
workload a serverless function can hold open. This service imports
`dispatchTool()` and its dependencies directly from `../lib` (no npm
workspace, no duplicated code — see the top of `src/call-session.ts`) so
Vapi, `/practice`, and this worker all run the exact same business logic.

## Running locally

```
npm run worker:dev     # tsx watch worker/src/index.ts, restarts on change
npm run worker:start   # tsx worker/src/index.ts, no watch — what Railway runs
```

Needs the same `.env.local` the main app uses (`NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN` at minimum — `worker/src/config.ts` fails fast and
lists exactly what's missing if any are absent).

## Deploying on Railway

1. **New service → Deploy from GitHub repo**, pick this repo. Leave the
   root directory as the repo root (not `worker/`) — the worker imports
   shared code from `../lib` and expects the same `node_modules` the main
   app uses, both of which only exist if Railway's build runs at the repo
   root.
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

## What's here so far

- `src/config.ts` — env var loading, fails loudly on startup if anything's missing.
- `src/index.ts` — the persistent HTTP server: `/health` for Railway's health
  check, structured logs (the same `lib/logger.ts` the rest of the app
  uses), graceful shutdown on `SIGTERM`/`SIGINT` so a Railway-initiated
  restart closes cleanly instead of dropping connections mid-response.

Twilio Media Stream handling, the OpenAI Realtime bridge, and the
dispatcher wiring land in the commits after this one — see the reliability
architecture doc's migration plan for the full build order.
