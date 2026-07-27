# Business Pilot AI — AI Receptionist (v0 scaffold)

This is a **real, working scaffold** for the AI Receptionist workflow of Business Pilot AI —
not a mockup. It's meant to be opened in **Claude Code**, wired up with your own API keys,
and extended from here (invoicing/payments, more dashboard pages, etc. come later).

## Deploying to production

See **[HOSTINGER_DEPLOYMENT.md](./HOSTINGER_DEPLOYMENT.md)** for the full step-by-step
checklist (GitHub → Hostinger → environment variables → webhooks → testing → staging mode).

Before deploying anywhere, run these three commands yourself in an environment with real
npm registry access (this scaffold was prepared in a sandbox with no network access to npm,
so every file has been reviewed and syntax-validated, but the actual `npm install`/`build`
has not been run here — you'll see the real output the first time you run it):

```bash
npm install
npm run build
npm start
```

If `npm run build` reports any error, paste it back and it can be fixed directly — the code
has been checked file-by-file for import/export correctness, but a live build with real
dependencies installed is the only way to catch true TypeScript type errors.

`GET /api/health` reports whether the database, ElevenLabs, Vapi, Stripe, and Twilio are all
reachable/configured, without ever exposing secret values — useful right after deploying.

## What's implemented end-to-end

1. **Multi-tenant Postgres schema** (Supabase) with row-level security so every business's
   data — calls, leads, documents, pricing — is fully isolated.
2. **Business onboarding + "Train My AI"** — forms that write directly into the knowledge
   base tables (services, FAQs, pricing rules, hours).
3. **Document ingestion + RAG** — upload a PDF/text file, it gets chunked and embedded
   (OpenAI embeddings → pgvector) so the voice AI can answer from it.
4. **Voice AI webhook (Vapi-style function calling)** — a single route that implements the
   actual receptionist brain: look up business info, answer FAQs via RAG, check calendar
   availability, calculate an estimate from pricing rules, save a lead, book an appointment,
   or flag the call for human transfer.
5. **Twilio inbound call handling** — forwards the business's number to the AI's Vapi number
   via TwiML.
6. **Google Calendar OAuth + free/busy check** stub, ready for real credentials.
7. **Dashboard pages**: calls & transcripts, leads, appointments, phone settings, calendar
   connection status — all reading real Supabase data (RLS-scoped to the logged-in business).

## Why some things are "stubs"

I built this without live network access, so I could not create real Supabase/Stripe/Twilio/
Vapi/Google accounts or test live API calls. Every integration point is written as **real,
correct client code against each provider's actual API** — you just need to:

1. Create the accounts (Supabase, Twilio, Vapi or Retell, OpenAI, Google Cloud project).
2. Fill in `.env.local` from `.env.example`.
3. Run the SQL migration in `supabase/migrations/0001_init.sql`.
4. Point your Vapi/Retell assistant's "server URL" at `/api/vapi/webhook`.
5. Point your Twilio number's voice webhook at `/api/twilio/voice`.

## Architecture

```
Customer calls Twilio number
        │
        ▼
/api/twilio/voice  (TwiML: <Dial> to Vapi SIP/phone number)
        │
        ▼
Vapi/Retell agent (holds the live conversation, does STT/TTS)
        │  function calls (tool use) during the call
        ▼
/api/vapi/webhook
   ├─ get_business_knowledge()  → lib/rag.ts → pgvector similarity search
   ├─ calculate_estimate()      → lib/pricing.ts → business's pricing_rules
   ├─ check_availability()      → Google Calendar freebusy
   ├─ book_appointment()        → writes appointments row + Calendar event
   ├─ save_lead()                → writes leads row
   └─ transfer_call()            → returns transfer instruction to Vapi
        │
        ▼
Call ends → Vapi sends end-of-call report → /api/vapi/webhook (call.ended)
   → saves transcript, recording URL, summary → calls table
   → sends SMS/email confirmation (Twilio/Resend)
```

## Folder guide

```
supabase/migrations/0001_init.sql   full schema + RLS policies
lib/supabase/                       browser, server, and admin Supabase clients
lib/openai.ts                       embeddings + chat completion helpers
lib/rag.ts                          knowledge base retrieval
lib/pricing.ts                      estimate calculator from pricing_rules
app/api/vapi/webhook                the receptionist "brain"
app/api/knowledge/ingest            document upload → chunk → embed
app/api/twilio/voice                inbound call → TwiML
app/api/calendar/google             OAuth connect + callback
app/(auth)/...                      login/signup (Supabase Auth)
app/(dashboard)/...                 onboarding, train-ai, knowledge-base,
                                     phone-settings, calendar, calls, leads,
                                     appointments
```

## Continuing in Claude Code

Open this folder in Claude Code and ask it to:
- Run `npm install` and `npm run dev`
- Wire up your real Supabase project (`supabase link`, then push the migration)
- Add the invoicing/payments workflow next (separate schema + Stripe Connect)
- Flesh out the marketing homepage, pricing page, analytics dashboard, team members,
  and billing pages listed in the original spec — those were intentionally left out of
  this first pass so the receptionist workflow could be done properly rather than
  everything half-done.

## Restaurant module

Businesses set `business_type` ('service' or 'restaurant') during onboarding,
which switches both the dashboard nav (`app/(dashboard)/layout.tsx`) and the
AI's behavior for that business.

**Menu import → review → publish** (`app/(dashboard)/menu/page.tsx`):
1. Owner picks a source — website URL, PDF, image, DOCX, or CSV — and either
   pastes a URL or uploads a file to the `menu-uploads` Storage bucket.
2. `POST /api/menu/import` runs *real* extraction per source
   (`lib/menu-import.ts`): fetches + strips the URL's HTML, or parses the
   uploaded file (`pdf-parse` for PDF, `mammoth` for DOCX, raw text for CSV,
   OpenAI vision for photos of a physical menu), then sends the result
   through a shared structured-extraction prompt (OpenAI JSON mode) that
   returns categories/items/prices/sizes/modifiers. Nothing is published yet.
3. The owner reviews and corrects the draft in the browser — this is real,
   editable state, not a static preview.
4. `POST /api/menu/publish` replaces the live `menu_categories`/`menu_items`/
   `menu_item_sizes`/`menu_modifier_groups` rows, and re-embeds every item
   into `knowledge_chunks` (same pgvector table the FAQ/RAG system already
   uses) — this is what lets the AI answer "do you have gluten-free pizza?"
   through the existing `get_business_knowledge` path with zero extra logic.

**Ordering, in the Vapi webhook** (`app/api/vapi/webhook/route.ts`):
`find_menu_item` → `add_order_item` (repeatable) → `remove_order_item` (as
needed) → `get_order_summary` (the repeat-back step, computed via
`lib/orders.ts` `computeOrderTotals`) → `confirm_order`, which generates a
real Stripe Checkout session (`lib/orders.ts` `createOrderPaymentLink`) and
texts it via `lib/twilio.ts`, unless the restaurant allows pay-at-pickup/
delivery. The Stripe webhook (`app/api/stripe/webhook/route.ts`) is what
actually flips an order from `pending_payment` to `paid` — nothing else does.

**Order status lifecycle**: `draft → pending_confirmation → pending_payment
→ paid → accepted → preparing → ready_for_pickup / out_for_delivery →
completed`, plus `cancelled`/`refunded`. Restaurant staff advance
accepted-through-completed manually from the Orders dashboard; `paid` is
Stripe-webhook-driven; `cancelled` also happens automatically via
`releaseExpiredHolds()` in `lib/orders.ts` — called lazily from the Orders
page load and before creating a new hold, since a real cron scheduler isn't
guaranteed on every Node host. If you deploy somewhere with a cron/queue
available, wire that function to a schedule instead for tighter timing.

**Known limitation, stated plainly**: none of this has been exercised
against live ElevenLabs/Vapi/Stripe/Twilio credentials or a real phone
call — that requires an actual deployment with real API keys, which this
authoring environment cannot provide (no outbound network access). Every
piece above was verified through real static analysis (parsed with esbuild,
every import resolved against the filesystem, every `process.env.*`
reference cross-checked against `.env.example`) but not through a live
end-to-end call. Treat the first real staging test as the actual proof.

## Voice & Language module

**ElevenLabs is the primary, default voice provider.** Settings > Voice &
Language loads the live ElevenLabs voice catalog server-side (never mock
data), lets the owner preview and select a real voice, and syncs that
choice to the business's live Vapi assistant — all backed by Supabase.

- **Test connection** — calls `/api/voice/test-connection`, which hits
  ElevenLabs' `/v1/user` endpoint server-side to confirm the API key works,
  without ever sending the key to the browser.
- **Sync voice to assistant** — calls `/api/voice/sync-assistant`, which
  re-checks the selected voice against the live ElevenLabs catalog and
  automatically substitutes `FALLBACK_VOICE` (see `lib/voice/index.ts`) if
  the saved voice is no longer available, before pushing the change to Vapi
  via `PATCH /assistant/{id}`.
- **API key handling** — `ELEVENLABS_API_KEY` is read only inside server
  route handlers (`app/api/voice/*`) via `lib/voice/providers/elevenlabs.ts`.
  It is never included in any client bundle, prop, or API response.

**Architecture:**

```
app/(dashboard)/settings/voice-language/page.tsx   the UI
        │
        ▼
app/api/voice/list          GET  → lib/voice/index.ts → getVoiceProvider()
app/api/voice/preview       POST → provider.synthesizePreview() (vendors w/o preview_url)
app/api/voice/sync-assistant POST → lib/vapi-assistant.ts → pushes voice to the live Vapi assistant
        │
        ▼
lib/voice/types.ts           the VoiceProvider contract every vendor implements
lib/voice/providers/*.ts     one file per vendor (elevenlabs.ts, openai.ts, ...)
        │
        ▼
supabase: business_voice_settings   (voice_provider, voice_id, languages, auto-detect, confirm-before-switch)
supabase: language_detection_events  (audit log: every detection/confirm/switch/decline)
calls.active_language / detected_language / translated_transcript
```

**How language actually works on a call:** the knowledge base stays in one
language (English, by convention). When `get_business_knowledge` is called
mid-call, the webhook translates the retrieved answer into the call's
`active_language` before returning it — so the AI always speaks the
knowledge base's real content, just translated. If `auto_detect_language`
is on, the assistant calls `detect_language` with the caller's utterance;
if the detected language differs from the current one, the webhook returns
`confirm_required` (when `confirm_before_switch` is on) with a ready-to-say
confirmation line, or switches immediately if that setting is off. Every
detection, confirmation prompt, switch, and decline is written to
`language_detection_events` — along with the call's own `detected_language`
and a `translated_transcript` (translated to English for the dashboard) —
so there's a full audit trail per call.

**Swapping voice providers** (e.g. moving from OpenAI to ElevenLabs, or
adding PlayHT/Azure/Deepgram later):

1. Create `lib/voice/providers/<vendor>.ts` implementing the `VoiceProvider`
   interface from `lib/voice/types.ts` (`listVoices()`, and optionally
   `synthesizePreview()` if the vendor doesn't return a static
   `preview_url` per voice).
2. Register it in `lib/voice/index.ts`'s `REGISTRY` map — one line.
3. Add the vendor's API key to `.env.example` and `.env.local`.
4. Set `VOICE_PROVIDER=<vendor-key>` (or pass `?provider=<vendor-key>` to
   `/api/voice/list` to let a business choose per-business).

Nothing in the Settings page, the API routes, or the call webhook needs to
change — they all depend on the `VoiceProvider` interface, never on a
specific vendor's SDK or response shape.

## Environment variables

See `.env.example`. You'll need keys for: Supabase, OpenAI, Twilio, Vapi (or Retell/Bland),
Google OAuth client, and Resend (or SendGrid) for email.
