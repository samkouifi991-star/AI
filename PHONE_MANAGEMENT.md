# Phone Management Module

Lets a business fully manage its phone system — forward an existing number,
buy a new Twilio number, or import a BYO Twilio account — without ever
logging into Twilio or Vapi directly. Built into the real application
(schema, API routes, dashboard pages), not a mockup.

**Read this before assuming anything works**: everything below has been
verified through real, static code checks (esbuild parsing every file,
import resolution against the real filesystem, env var consistency, a
transitive client/server-boundary graph-walk) — the same discipline as
every prior fix in this build. It has **not** been exercised against real
Twilio/Vapi staging credentials or a real phone call, because that requires
an actual deployment with real API keys, which this authoring environment
cannot provide (confirmed again this session: `npm install` still returns
a 403 from the npm registry — no outbound network access here). Treat the
checklist at the bottom as what still needs to happen, by you, on a real
staging deployment.

## Database migration

`supabase/migrations/0006_phone_management.sql` — 14 new tables, all with
RLS via the existing `is_business_owner()` pattern:

| Table | Purpose |
|---|---|
| `provider_connections` | BYO Twilio credentials (Account SID in clear, Auth Token encrypted) |
| `phone_numbers` | Every number the business has, however it was acquired |
| `phone_number_assignments` | Audit trail of assign/unassign/reassign actions |
| `forwarding_setups` | Option A: existing-number forwarding configuration |
| `carrier_forwarding_codes` | Static reference data — AT&T/Verizon/T-Mobile/other dial codes |
| `call_routing_rules` | Routing mode, fallback/emergency numbers, department routing |
| `transfer_destinations` | Named transfer targets (owner cell, kitchen, etc.) |
| `assistant_settings` | Customer-facing Vapi controls |
| `sms_settings` | Message types, templates, opt-out text, registration status |
| `provisioning_jobs` | Step-by-step tracking of buy/import workflows, with rollback state |
| `provider_usage` | Metered voice minutes / SMS / number rental |
| `provider_costs` | Platform-mode cost vs. customer price (markup as a generated column) |
| `customer_usage_summary` | Per-period included-vs-used rollup for billing display |
| `webhook_status` | Last-received timestamp + health per webhook type |
| `phone_test_results` | Test Center's log |

## New library code

- `lib/crypto.ts` — AES-256-GCM encrypt/decrypt for credentials at rest. Requires `CREDENTIAL_ENCRYPTION_KEY`.
- `lib/twilio.ts` (extended) — real number search (`searchAvailableNumbers`), pricing lookup, purchase, release, BYO client construction, webhook signature verification (`verifyTwilioSignature`), account number listing.
- `lib/vapi-assistant.ts` (extended) — `createAssistant`, `importTwilioNumberToVapi`, `deleteVapiPhoneNumber`, `deleteAssistant` (rollback), `syncAssistantSettings`.
- `lib/provisioning.ts` — the two orchestrated workflows (`runBuyNumberWorkflow`, `runImportByoNumberWorkflow`), each recording every step to `provisioning_jobs` and rolling back everything created so far on any failure (purchased number released, Vapi assistant/phone-number resources deleted).

## Route list

| Route | Method(s) | Purpose |
|---|---|---|
| `/api/phone/search` | GET | Real Twilio available-number search + pricing |
| `/api/phone/purchase` | POST | Runs the full buy-number provisioning workflow |
| `/api/phone/forwarding` | GET/POST | Option A setup, carrier codes, AI destination number |
| `/api/phone/numbers` | GET/PATCH/DELETE | List, rename, release (confirmation required) |
| `/api/phone/twilio-connect` | GET/POST | BYO Twilio connect — verifies credentials live, encrypts, stores |
| `/api/phone/twilio-connect/numbers` | GET | Lists numbers in the connected BYO account |
| `/api/phone/twilio-connect/import` | POST | Runs the BYO import-and-attach workflow |
| `/api/phone/routing` | GET/POST | Call routing mode, transfer destinations, business hours |
| `/api/phone/assistant-settings` | GET/POST | Customer-facing Vapi controls, syncs to the live assistant |
| `/api/phone/sms-settings` | GET/POST | SMS templates, opt-out text, sender info |
| `/api/phone/test` | GET/POST | Test Center — dispatches real or honestly-pending tests |
| `/api/webhooks/twilio-sms` | POST | Inbound SMS, with real Twilio signature verification |

Dashboard pages: `/phone` (overview), `/phone/numbers`, `/phone/routing`, `/phone/assistant`, `/phone/sms`, `/phone/test-center`.

## Setup instructions

1. Run the migration: `supabase/migrations/0006_phone_management.sql` (via `supabase db push` or your usual migration flow).
2. Generate and set `CREDENTIAL_ENCRYPTION_KEY`:
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
3. Set the platform Twilio/Vapi credentials in your environment (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `VAPI_API_KEY`, `VAPI_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL` — all already in `.env.example`).
4. In Twilio's console, no additional webhook setup is needed for purchased/imported numbers — `purchaseNumber()` and the import workflow set `voiceUrl`/`smsUrl` automatically to this deployment's routes.
5. For BYO customers: they'll need their own Twilio Account SID + Auth Token in hand (see "blocked by provider limitations" below for why this, not OAuth).

## Test checklist — run these against a real staging deployment

- [ ] **Existing-number forwarding**: enter a real number in `/phone/numbers` → "Use existing number", save, follow the carrier instructions shown, call the business number from another phone, confirm it reaches the AI, ask to speak to a person and confirm transfer works.
- [ ] **Buy a new number**: search by area code in `/phone/numbers` → "Buy a new number", confirm real results with real prices appear, buy one, confirm it shows Active in the numbers list, call it and confirm the AI answers.
- [ ] **Import a Twilio number**: connect a real Twilio account in "Import from Twilio", confirm its real numbers list, import one, confirm the assistant attaches, call it and confirm it works.
- [ ] **SMS**: send a test SMS from `/phone/sms`, confirm receipt; check whether messaging registration status blocks anything for your account.
- [ ] **Assistant controls**: change greeting/voice/language in `/phone/assistant`, save, call again, confirm the new configuration is actually what you hear.
- [ ] **Test Center**: run every button; confirm `sms`/`webhook`/`assistant_tools` give real pass/fail, and that `forwarding_check`/`inbound_call`/`transfer` correctly show "pending" with instructions rather than a fake pass (they can't be automated — see below).

## What's mocked, stubbed, or deferred — stated plainly

- **`inbound_call`, `transfer`, `forwarding_check` tests always return "pending," never an automated pass.** There is no way to make a server programmatically verify that a real phone rings — these need you to actually place a call. This is not a shortcut I plan to close; it's a structural limit of testing a phone system from a server.
- **Subscription-tier gating on number purchases** (`verify_subscription` step in `lib/provisioning.ts`) currently only checks that the business record exists — it does not yet check the business's actual plan against a purchase-eligibility rule. The step and its audit trail exist; the specific "which plans can buy numbers" rule is a one-line query once the billing/subscription table from the earlier payments module is joined in here.
- **SMS opt-out (STOP) handling** is logged but not yet enforced — `/api/webhooks/twilio-sms` recognizes STOP messages and logs them, but there's no opt-out list checked before sending future messages yet. The settings table and send path exist; wiring the actual suppression is a follow-up.
- **Department routing** (`department_routing` jsonb on `call_routing_rules`) has a column and is threaded through the routing API, but the dashboard UI for editing per-department AI behavior (kitchen vs. sales vs. reservations, etc.) is not yet built as its own interface — today it's structured data with no dedicated editor.
- **Usage/cost dashboards** (`provider_usage`, `provider_costs`, `customer_usage_summary`) have real tables and are read on the Overview page, but nothing yet *writes* to them automatically from actual call/SMS activity — that requires wiring Twilio's usage records API or Vapi's per-call billing data, which is a real, separate integration not built in this pass.
- **A dedicated "Twilio Settings" page** (caller ID, geographic permissions, delivery-failure logs) described in the spec was not built as its own page in this pass — the load-bearing pieces (voice/SMS/MMS capability tracking, webhook config, signature verification) exist in the schema and routes, but there's no dedicated settings screen surfacing every one of those fields yet.

## What's blocked by provider-account limitations, not by this code

- **Twilio has no universal OAuth/Connect flow** for third-party apps the way Stripe Connect does. The "Import an existing Twilio number" flow uses Account SID + encrypted Auth Token entry instead — this is the standard integration pattern other platforms use too, not a shortcut taken here.
- **A2P 10DLC messaging registration** (US SMS compliance) is an account-level Twilio/carrier requirement that has to be completed directly with Twilio — this app surfaces the registration status (`sms_settings.messaging_registration_status`) and warns the user when it's incomplete, but cannot complete registration on their behalf.
- **Toll-free number verification** (also a Twilio/carrier requirement for higher-volume toll-free SMS) is similarly outside this app's control — numbers will show as purchased/active, but Twilio may still restrict messaging until verification completes on their end.
- **International number availability and regulatory bundles** vary enormously by country — the search route passes through whatever Twilio's API actually returns for the requested country/type; it does not pre-validate or explain country-specific regulatory requirements beyond what Twilio's response includes.
