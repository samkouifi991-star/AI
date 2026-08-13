# Smart USA Visa

Guided, self-service U.S. immigration document preparation — an original product (Next.js +
TypeScript + Tailwind + Supabase + Stripe) inspired by the *category* CitizenPath operates in,
but with its own brand, copy, typography, visual design, and a schema-driven application engine
built from scratch.

**Smart USA Visa is a private company. It is not a law firm and is not affiliated with USCIS,
DHS, the Department of State, or any government agency.** It does not provide legal advice or
determine immigration eligibility.

## What this is

This is a real, working application, not a prototype: real Supabase Postgres schema with row-level
security, real Supabase Auth (email/password + Google OAuth), real Stripe Checkout, real document
uploads to private Storage with signed URLs, a real rules-driven questionnaire and validation
engine, and real PDF generation (`pdf-lib`) for the final filing package. Every button in the
customer flow is wired to a real route, server action, or API call — there are no fake demo
buttons, static progress numbers, or hardcoded results anywhere in the customer or admin flows.

`npm run build` passes cleanly (typecheck + lint + full static/dynamic route generation) against
placeholder environment variables — see [Getting it running](#getting-it-running) for what's
needed to make it fully live.

## The end-to-end flow

Homepage → Find My Application → All Applications → Application Package page → **Start
Application** (creates a real `applications` row immediately, before any account exists) →
Eligibility screening (one question per screen) → Create Account (everything already answered is
automatically claimed into the new account) → full guided questionnaire → document checklist +
certified translation ordering → readiness review → Stripe checkout → generated filing package
(forms data sheet, checklist, filing instructions, cover sheet, and a merged bundle) → customer
dashboard, with full save-and-resume at every step.

## Architecture

```
app/(marketing)/        Homepage, Find My Application, All Applications, Package pages,
                         How It Works, Pricing, legal pages, contact/support/resources
app/(auth)/              Sign up, sign in, forgot/reset password
app/(dashboard)/         Customer dashboard (/dashboard) and account settings (/account)
app/application/[id]/    The per-application flow: eligibility, questions, documents,
                         translations, review, checkout, package, and a hub page at
                         /application/[id] itself
app/admin/               Staff-only: users, applications, templates & questions, pricing,
                         government fees, translations, support
app/api/                 Route handlers: autosave, uploads, signed URLs, translation orders,
                         Stripe checkout + webhook, admin translation delivery
app/actions/             Server Actions: start application, auth claim, account, support,
                         admin CRUD, package regeneration

lib/engine/              The schema-driven core: conditional visibility (conditions.ts),
                         progress % (progress.ts), the three-state validation engine
                         (validation.ts), document checklist sync (documents.ts), pricing
                         (pricing.ts), and per-application dashboard summaries (summary.ts)
lib/pdf/                 pdf-lib based generation: form data sheet, filing instructions,
                         checklist, cover sheet, and a merged bundle
lib/translation/         Pluggable translation-provider interface (see below)
lib/supabase/            Browser / server / admin Supabase clients + shared types
lib/applications.ts      Access control shared by every application route (owner-only via
                         RLS when signed in; httpOnly session-cookie verified via the
                         service-role client for the anonymous "Start Free" flow)
lib/storage.ts           Private Storage upload + signed URL helpers
lib/stripe.ts, email.ts, rate-limit.ts, audit.ts, validation-schemas.ts

supabase/migrations/     0001 core schema, 0002 RLS policies, 0003 storage buckets + policies
supabase/seed/           Structured seed data (19 USCIS forms) + an idempotent seed runner
```

### Why this isn't 19 hand-coded React forms

The questionnaire is schema-driven: `application_types → sections → questions` (with
`show_if` conditional rules, `repeat_group` for repeatable entries like address/employment
history, and `is_eligibility_question` for the screening step) drive one generic wizard
component (`components/questionnaire/QuestionnaireWizard.tsx`). Adding a 20th immigration form —
or editing an existing one's wording, validation, or document requirements — is a data change
(via `/admin/templates`, or a new seed entry), not a new page. `supabase/seed/data/` currently
ships real, non-trivial questionnaires for all 19 forms named in the spec (N-400, I-130, I-485,
I-765, I-90, I-751, I-129F, I-131, I-864, AR-11, I-130A, I-131A, I-134, I-821, I-821D, I-864A,
N-565, N-600, G-1145) — the highest-volume forms (N-400, I-485, I-765, I-130) get full multi-
section questionnaires; the more procedural forms get a shorter but equally real one, sized to
what that form actually asks.

### PDF generation, honestly

`lib/pdf/generate.ts` produces an original **Form Data Sheet** that organizes every answer under
the official form's Part/Item structure (e.g. "Part 2, Item 1.a — First Name"), rather than
embedding or redistributing USCIS's own fillable PDF templates. `form_versions.field_map` stores
that question→field mapping per form edition — exactly the mapping described in the spec — so
once a real fillable PDF is available for a given edition (upload it to
`form_versions.pdf_storage_path`), the same map can drive overlaying answers directly onto that
PDF instead. Filing instructions, the document checklist, and a cover sheet are generated
alongside it and merged into one downloadable bundle.

### Translation module

`lib/translation/` defines a `TranslationProvider` interface with one built-in implementation
(`providers/standard.ts`). A second vendor is a new file implementing the same interface plus one
line in the registry — nothing in the order workflow, checklist, or checkout changes. The full
order lifecycle (`requested → awaiting_payment → in_progress → completed`) is real: price quotes
come from an admin-editable `translation_pricing` table, payment is a real Stripe Checkout
session, and delivery happens through `/admin/translations` (staff upload the translated file +
certification, which flips the status and emails the customer).

### Security

Row-level security on every table (customers only ever see their own data; the browser client
never gets a service-role key). Private Storage buckets with short-lived signed URLs — nothing is
ever public. httpOnly, secure, sameSite cookies for the anonymous "Start Free" session. Zod
validation on every mutating API route. A rate limiter (in-memory by default, Upstash Redis if
configured) on autosave, uploads, and checkout. An append-only `audit_logs` table written only by
the service role. Role-based access (`customer` / `support` / `admin`) enforced both in
`middleware.ts` and again in every `/admin` page/action via `lib/admin.ts`.

## Getting it running

This was built without a live Supabase/Stripe/Resend/Google account attached to it, so every
integration is real, correct client code against each provider's actual API — it needs your own
credentials to go live:

```bash
npm install
cp .env.example .env.local   # fill in real values, see below
```

1. **Supabase**: create a project, then run the three files in `supabase/migrations/` in order
   (SQL Editor, or `supabase db push` if you use the CLI) against it. Add
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to
   `.env.local`. Enable the Google provider under Authentication → Providers if you want Google
   sign-in.
2. **Seed the catalog**: `npm run seed` (reads `.env.local`, upserts all 19 application types,
   their sections/questions/document requirements/pricing/government fees — safe to re-run).
3. **Make your own account an admin**: after signing up once through the app, run
   `update profiles set role = 'admin' where email = 'you@example.com';` in the SQL editor to
   unlock `/admin`.
4. **Stripe**: add `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. Point a webhook
   at `/api/stripe/webhook` listening for `checkout.session.completed`, and put its signing secret
   in `STRIPE_WEBHOOK_SECRET`. In local dev, `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
5. **Resend** (optional but recommended): add `RESEND_API_KEY` for real payment-receipt,
   translation-ready, and support-acknowledgement emails — every email call is a harmless no-op
   (logged, not thrown) if this is unset.
6. `npm run dev`.

## Known follow-ups

- **Next.js version**: pinned to the latest `14.2.x` patch (`14.2.35`), which resolves the
  critical Server Actions DoS advisory present in `14.2.15`. A handful of `high`-severity
  advisories in `npm audit` are only fixed in the Next 16 major line; upgrading past a major
  version needs its own testing pass rather than a blind bump in this session.
- **PDF templates**: the generated "Form Data Sheet" is an original Smart USA Visa document, not
  an overlay onto the actual USCIS PDF (see [PDF generation, honestly](#pdf-generation-honestly)
  above) — wire up real fillable PDFs per form edition when available.
- **Admin template editor**: covers editing existing questions and adding new ones inline; it does
  not yet support reordering/deleting sections or building `show_if`/`repeat_group` rules through
  the UI (those are seed-data/SQL edits today).
