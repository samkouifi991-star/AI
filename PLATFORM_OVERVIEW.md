# Business Pilot AI — Platform Overview

This documents the unification work: the guided onboarding wizard, the
shared status system, audit logging, rate limiting, and Stripe Connect —
built on top of everything from prior sessions (AI receptionist, voice,
restaurant ordering, service-business estimates, phone management). See
`PHONE_MANAGEMENT.md` and `BUILD_REPORT.md` for the phone-module and
build-fix history specifically; this file covers the platform as a whole.

## Architecture notes

```
Customer                    Business Pilot AI                     Providers
--------                    ------------------                     ---------
                        ┌─ /onboarding (wizard) ─┐
                        │  Business → Phone →     │
Sign up ──────────────► │  Voice → Knowledge →    │
                        │  Calendar → Payments →  │
                        │  Test → Go Live         │
                        └───────────┬─────────────┘
                                    │ calls real routes at each stage,
                                    │ never re-implements their logic
                                    ▼
                    /api/phone/*  /api/voice/*  /api/menu/*
                    /api/calendar/google  /api/payments/stripe-connect
                                    │
                                    ▼
                    lib/twilio.ts  lib/vapi-assistant.ts  lib/crypto.ts
                    lib/calendar.ts  lib/stripe.ts  lib/provisioning.ts
                                    │
                                    ▼
                         Twilio · Vapi · ElevenLabs · Google · Stripe
                                    │
                                    ▼
                    Supabase (RLS-scoped per business) + audit_log
```

The onboarding wizard is deliberately a thin orchestration layer — every
stage calls the same real API routes the standalone dashboard pages use
(`/api/phone/purchase`, `/api/voice/list`, `/api/calendar/google`,
`/api/payments/stripe-connect`, etc.). Nothing was reimplemented just for
the wizard; that's what keeps "onboarding" and "the actual dashboard
pages" from drifting out of sync with each other over time.

`onboarding_progress` persists the wizard's current stage and completed
stages server-side, so refreshing, logging out, or navigating away and
back resumes exactly where the customer left off — same pattern already
proven for the restaurant menu persistence fix earlier in this build.

## Provider setup guide

| Provider | What it's for | How the customer connects | Account needed |
|---|---|---|---|
| Supabase | Database, auth, storage | N/A — platform infrastructure | Yours (the platform operator) |
| OpenAI | Knowledge-base answers, menu extraction, language detection | N/A — platform infrastructure | Yours |
| ElevenLabs | Primary voice provider | Browse/preview/select in Voice & Language — no account needed by the customer in platform-managed mode | Yours (platform-managed) or a future BYO mode (not built — see limitations) |
| Vapi | Call orchestration | Automatic — provisioned behind the scenes when a number is set up | Yours |
| Twilio | Phone numbers, SMS | "Keep my number" (forwarding), "Buy a number" (platform-managed), or "Import from Twilio" (BYO, Account SID + Auth Token — Twilio has no OAuth flow for third parties) | Yours (platform-managed) or the customer's own (BYO) |
| Google Calendar | Appointment availability | One-click "Connect Google Calendar" — real OAuth | The customer's own Google account |
| Stripe | Payments | One-click "Connect Stripe" — real Stripe Connect OAuth (new this session) — or skip to use the platform's built-in Stripe | The customer's own (BYO) or the platform's (built-in) |

For your own deployment, set every variable in `.env.example` — the new
ones this session are `CREDENTIAL_ENCRYPTION_KEY` (generate with
`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`)
and `STRIPE_CONNECT_CLIENT_ID` (from Stripe's Connect settings, distinct
from your regular API keys).

## Customer onboarding flow

1. **Business** — business type, name, current phone number, service area.
2. **Phone** — keep existing number (forwarding) or buy a new one, right inside the wizard.
3. **AI Voice** — browse and preview real ElevenLabs voices, pick one, saved and synced immediately.
4. **Knowledge** — link out to Menu (restaurants) or Knowledge Base (service businesses); can be finished later without blocking progress.
5. **Calendar** — one-click Google Calendar connect, or skip for now.
6. **Payments** — one-click Stripe connect, or use the platform's built-in payments.
7. **Test** — a real assistant-tools check, plus a link to the full Test Center.
8. **Go Live** — checklist review, then `businesses.is_live` is set true and the action is audit-logged.

Every stage's "skip for now" option is real — nothing blocks progress, and
the Go Live checklist honestly shows what's actually been completed versus
skipped.

## Testing checklist (run on a real staging deployment)

- [ ] Complete the full wizard start to finish as a new signup; confirm each stage persists after a refresh mid-way through.
- [ ] Log out mid-wizard, log back in, confirm you resume at the same stage.
- [ ] Connect Google Calendar via the wizard; confirm a real OAuth consent screen appears and completes.
- [ ] Connect Stripe via the wizard; confirm a real Stripe Connect consent screen appears, completes, and `provider_connections` shows `status = 'connected'` with no token visible anywhere in the browser.
- [ ] Buy a number via the wizard's Phone stage; confirm it appears in `/phone/numbers` afterward.
- [ ] Trigger a rate limit deliberately (e.g. hit `/api/phone/purchase` 6+ times in an hour) and confirm a 429 with a plain-English message, not a raw error.
- [ ] After a purchase, release, credential connect, and routing change, check `audit_log` for a corresponding row with no secret values in `metadata`.
- [ ] Confirm the Overview page's status badges show plain-English messages, and that "Show technical details" reveals real error text only when expanded.

## Security checklist

- [x] Provider secrets (Twilio Auth Token, Stripe Connect access token) encrypted at rest with AES-256-GCM (`lib/crypto.ts`), never stored or returned in plaintext.
- [x] Service-role Supabase client only ever used server-side, isolated to `lib/supabase/admin.ts`; verified via a transitive import-graph walk that zero client components can reach it.
- [x] RLS on every business-scoped table via `is_business_owner()`.
- [x] Twilio webhook signature verification (`verifyTwilioSignature`) on the inbound SMS webhook.
- [x] Vapi webhook shared-secret verification (pre-existing).
- [x] Stripe webhook signature verification (pre-existing, `lib/stripe.ts`).
- [x] Audit logging on number purchase/release/rename, credential connect, and routing changes — metadata deliberately excludes secret values by convention, documented in `lib/audit.ts`.
- [x] Rate limiting on number purchase and Twilio BYO connect (Postgres-backed, no external dependency).
- [ ] Rate limiting is not yet applied to every sensitive endpoint listed in the original spec (e.g. the test-center routes) — only purchase and BYO connect, as the two highest-risk actions, in this pass.
- [ ] No dedicated audit log *viewer* UI exists yet — the table and writes are real, but there's no dashboard page to browse `audit_log` yet.

## Honest implementation status

**Fully implemented and real** (schema + real API calls + wired into the UI):
AI receptionist core (knowledge RAG, calendar booking, estimates), ElevenLabs
voice selection/preview/sync with fallback, restaurant menu import/publish
with knowledge re-embedding, service-business estimate wizard, phone number
forwarding/buy/BYO-import with real Twilio+Vapi API calls and rollback,
Google Calendar OAuth, Stripe Connect OAuth (new), credential encryption,
audit logging (on the actions wired so far), Postgres-backed rate limiting
(on the two endpoints wired so far), the unified onboarding wizard with
persistent progress, the shared status-translation system.

**Partially implemented**: department-based call routing (schema + API
exist, no dedicated visual editor yet); SMS opt-out (recognized and logged,
not yet enforced against future sends); usage/cost tracking tables (exist,
read on the Overview page, but nothing yet writes to them from real
call/SMS activity); rate limiting and audit logging (wired into the
highest-risk actions, not literally every endpoint the spec lists).

**Mocked or simulated**: nothing in the code paths themselves is mocked —
every integration calls the real provider API. The three phone tests that
fundamentally require an actual ringing phone (`inbound_call`, `transfer`,
`forwarding_check`) honestly report "pending" with instructions rather
than a fabricated pass, because no server-side simulation can substitute
for a real call.

**Requires provider approval**: Twilio A2P 10DLC messaging registration
(US SMS compliance) and toll-free number verification are both carrier/
Twilio-side review processes outside this app's control — it surfaces
status and warns the customer, but cannot complete registration for them.

**Requires OAuth the provider doesn't offer**: Twilio and Vapi have no
OAuth/Connect flow for third-party platforms — hence the guided
Account-SID-and-Auth-Token entry for BYO Twilio, and platform-managed-only
for Vapi and ElevenLabs today. This is a provider limitation, not a
shortcut taken here; Google Calendar and Stripe *do* offer real OAuth, and
both are implemented that way.

**Requires production deployment to verify**: every live-call, live-SMS,
live-payment, and live-OAuth-consent-screen flow. This authoring
environment has no outbound network access (confirmed via repeated
`npm install` attempts returning a 403 from the npm registry throughout
this entire build) — nothing about that has changed, and no claim in this
document should be read as "tested live." Everything above was verified
through real static analysis: esbuild parsing every file (79 files, zero
errors), real import resolution against the filesystem, real env var
consistency checks, and a real transitive client/server-boundary graph
walk (14 `'use client'` files, zero reach `next/headers` or the
service-role client).

**Cannot be tested locally, categorically**: real OAuth consent screens
(Google, Stripe Connect) require a publicly reachable HTTPS callback URL;
real inbound calls/SMS require a real phone; real webhook delivery
requires a public endpoint Twilio/Vapi/Stripe can reach. All of this needs
an actual staging deployment with a real domain, exactly as
`HOSTINGER_DEPLOYMENT.md` describes.
