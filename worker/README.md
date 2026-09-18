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
lists exactly what's missing if any are absent). `OPENAI_REALTIME_MODEL` is
optional — see the comment above `DEFAULT_MODEL` in `src/realtime-session.ts`.

This package pins `openai@^7.18.0` and `ws@^8.21.0` — newer than the root
app's own `openai@^4.56.0` (`lib/openai.ts`, `lib/voice/providers/openai.ts`,
used by the live Vapi call path, which is deliberately NOT touched by this).
npm workspaces resolve that version conflict by nesting a separate copy in
`worker/node_modules/openai` rather than hoisting one shared version — run
`npm install` at the repo root and confirm with `ls worker/node_modules/openai`
if this ever looks unresolved. `engines.node` is `>=22.0.0` here (the SDK's own requirement) — confirm
Railway's Nixpacks build actually picks Node 22+ (check the build log), and
if not, set the `NIXPACKS_NODE_VERSION=22` variable on the Railway service.
Deliberately not forced via a repo-root `.nvmrc`/root `engines` field: those
would also change Vercel's Node runtime selection for the main app, which is
out of scope here.

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
   - `OPENAI_REALTIME_MODEL` — optional, leave unset initially; see the
     comment above `DEFAULT_MODEL` in `src/realtime-session.ts`.
   - `PORT` — leave unset; Railway injects this automatically and
     `config.ts` reads it. `src/index.ts` binds it on `0.0.0.0` explicitly.
4. Confirm it's not sleeping: Railway's default "Web Service" deploy type
   is already an always-on persistent process (unlike some other
   platforms' free tiers) — nothing extra to configure for that, just
   don't deploy it as a Cron/scheduled service by mistake.
5. Once deployed, Railway gives the service a public URL
   (`*.up.railway.app` by default, or a custom domain). Set
   `VOICE_WORKER_URL` in **Vercel's** env vars (not Railway's) to
   `wss://<that-domain>/media-stream` — `app/api/twilio/voice/route.ts`
   reads it to build the TwiML that connects a `voice_runtime='direct'`
   business's call to this worker.

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
  `lib/logger.ts` the rest of the app uses), explicit `0.0.0.0` bind,
  graceful shutdown on `SIGTERM`/`SIGINT` so a Railway-initiated restart
  closes cleanly instead of dropping connections mid-response.
- `src/twilio-stream.ts` — parses/sends Twilio Media Streams protocol frames.
- `src/realtime-session.ts` — the OpenAI Realtime WS session wrapper:
  function-call correlation, audio streaming both directions, and
  transcript accumulation from both `response.audio_transcript.done`
  (Ava's side) and `conversation.item.input_audio_transcription.completed`
  (the caller's side, via Realtime's built-in whisper-1 pass — no audio is
  stored, only text). Transport-injected so it's unit-testable without a
  live connection — see `src/realtime-session.test.mjs`.
- `src/call-session.ts` — wires a Twilio stream to a Realtime session,
  loads the call-config snapshot, calls `dispatchTool()` for tool calls.
- `src/call-lifecycle.ts` — saves call start/end/transcript to Supabase.

This is already end-to-end for one call: Twilio → this worker →
OpenAI Realtime → `dispatchTool()` → Supabase, with `find_menu_item` as the
only wired tool. Payments, SMS, transfers, call recording (audio, not the
text transcript above), and provider failover are intentionally not wired
in yet — see the reliability architecture doc's migration plan for the
full build order.
