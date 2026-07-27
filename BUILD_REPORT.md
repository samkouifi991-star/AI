# Build Report — Business Pilot AI

**Generated:** 2026-07-23 (this authoring session)
**Node.js:** v22.22.2 (confirmed in this environment)
**Next.js:** 14.2.5 (per `package.json`)
**TypeScript:** ^5.5.4 (per `package.json`)

## The one thing to read first

**`npm run build` has NOT been executed successfully in this session, or ever, by me.**
This authoring sandbox has no outbound network access — every attempt at
`npm install` fails immediately with a 403 from the npm registry:

```
npm error code E403
npm error 403 403 Forbidden - GET https://registry.npmjs.org/@supabase%2fssr
```

I re-confirmed this again just now, before writing this report. Without
`npm install` succeeding, `npm run build` cannot run at all — there is no
partial or simulated "build output" to show, and I have not fabricated one.
Everything below is **static verification** — real checks, run against the
real project files, but not a substitute for an actual compiler run against
real installed dependencies.

**What you need to do:** extract the zip, run `npm install`, then
`npm run build`. If it succeeds, that's your real proof. If it fails, send
me the exact error text and I'll fix it — same as every round so far.

## Errors encountered and fixed this session, in order

1. **Server/Client boundary violation** — `lib/supabase.ts` mixed
   `createBrowserClient` with `createServerClient` + `cookies()` from
   `next/headers` in one file. Any client component importing anything
   from that file transitively pulled in `next/headers`, which Next.js
   rejects outside Server Components.
   **Fix:** split into `lib/supabase/client.ts` (browser-only),
   `lib/supabase/server.ts` (`next/headers`, server-only), and
   `lib/supabase/admin.ts` (service-role, trusted backend only). Deleted
   the old `lib/supabase.ts`. Updated all 33 import sites across the
   project, each mapped to the correct module based on which function it
   actually called. Verified via a real transitive-import graph walk: zero
   of the 8 `'use client'` files reach `next/headers` or the admin client,
   through any import path.

2. **`withTimeout` generic collapsing to `unknown`** — in
   `app/api/health/route.ts`, `withTimeout(promise: Promise<T>, ...)` lost
   the real type when passed a Supabase query builder (a thenable, not a
   native `Promise`), because racing a raw custom thenable inside
   `Promise.race([...])` can make TypeScript's `Awaited<T>` fail to unwrap
   it, falling back to `unknown`.
   **Fix:** changed the parameter type to `PromiseLike<T>` and normalized
   with `Promise.resolve(promise)` before racing, so `Promise.race` always
   operates on two real `Promise` values. Also corrected the timeout
   branch's type from `Promise<T>` to `Promise<never>` (it only ever
   rejects). Confirmed no other `Promise.race`/`withTimeout` usage exists
   anywhere else in the project.

3. **`Buffer` not assignable to `BodyInit`** — in
   `app/api/voice/preview/route.ts`, `new NextResponse(preview.audio, ...)`
   failed because Node's `Buffer` isn't part of the DOM lib's `BodyInit`
   type. Tested two candidate fixes against the *real* TypeScript/DOM
   library types bundled with the compiler (no install needed for these,
   since they ship with `tsc` itself): wrapping in `Uint8Array` still
   failed under this TypeScript version (a real typed-array generics
   variance issue introduced in TS 5.7+); slicing to a plain `ArrayBuffer`
   compiled clean. **Fix:** used the `ArrayBuffer`-slice approach. Swept
   the rest of the project for the same `new NextResponse(...)` pattern —
   the only other usage (`app/api/twilio/voice/route.ts`) passes a
   `string`, which is natively part of `BodyInt`, so it was never at risk.

4. **`OPENAI_API_KEY` required at build time** — `lib/openai.ts` had
   `export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })`
   at module scope. The OpenAI SDK throws immediately if the key is
   missing/empty, and Next.js imports every route module while "collecting
   page data" at build time — so any route importing anything from that
   file (even indirectly) crashed the build.
   **Fix:** replaced with a cached `getOpenAI()` getter, called only inside
   function bodies. Updated the two other files that imported the eager
   `openai` instance directly (`lib/language.ts`, `lib/menu-import.ts`) to
   import and call `getOpenAI()` instead — simply not re-exporting the
   instance wouldn't have been enough, since importing anything from a
   module still runs that module's top-level code. Swept the entire
   project for the same top-level-instantiation pattern applied to any
   client (Stripe, Twilio, Google) — none found; those three were already
   written correctly as lazy functions.

## Static verification performed on the final state (all passed)

- **Syntax**: all 52 `.ts`/`.tsx` files parsed clean with a real parser (esbuild), zero errors.
- **Import resolution**: every local/`@/` import in the project resolves to a real file on disk.
- **Env var consistency**: every `process.env.X` reference in code is documented in `.env.example`; nothing undocumented.
- **Client/server boundary**: zero `'use client'` files transitively reach `next/headers` or the service-role admin client.
- **Module-scope instantiation sweep**: zero remaining top-level `const x = new Whatever(...)` client constructions anywhere in the project.
- **Junk-directory check**: none present (this was the cause of an earlier corrupted zip — verified clean this time too).

## What static verification cannot tell you

- Whether the code compiles against the *real* `@supabase/supabase-js`,
  `stripe`, `twilio`, `openai`, `googleapis`, and `next` type definitions —
  only `npm install` + `tsc`/`next build` on a machine with real network
  access can confirm that.
- Whether any *new* TypeScript error exists in a file untouched by the four
  fixes above. I have not introduced any changes outside the files listed,
  but I also cannot claim exhaustive foreknowledge of every possible type
  interaction the real compiler will find — that's exactly why this has
  been an iterative process, and why I'm not claiming it's over now.
- Runtime behavior against real ElevenLabs/Vapi/Stripe/Twilio credentials —
  unchanged from every prior report: not tested, requires a real staging
  deployment.

## Post-report fix: menu data not persisting across navigation

Reported after the report above was written, so documenting it here rather
than rewriting history:

**Bug:** `/menu` only ever populated its `categories` state from the
`/api/menu/import` response or a fresh publish — it never fetched the
already-published menu from the database on page load. The publish route
itself was writing correctly (real `delete` + `insert` into
`menu_categories`/`menu_items`/`menu_item_sizes`/`menu_modifier_groups`/
`menu_modifier_options`, confirmed by re-reading the file), so nothing was
actually being lost in the database — the page just never asked for it
back after the initial import/publish round of the session.

**Fix**, in `app/(dashboard)/menu/page.tsx`:
- Added `fetchPublishedMenu(businessId)`, a nested Supabase query
  (`menu_categories` → `menu_items` → `menu_item_sizes` /
  `menu_modifier_groups` → `menu_modifier_options`) filtered by
  `business_id`, transformed into the same draft shape the review UI and
  publish route already use.
- Called on mount (after resolving the authenticated user's business), so
  an existing published menu shows immediately on page load — no
  re-upload required.
- Called again immediately after a successful publish, and the *returned*
  data (not the local edit-state that was sent) becomes the new UI state —
  so publish is a verified round-trip through the database, not an
  assumption.
- Added distinct loading, error, and empty states, so "no menu published
  yet" and "still loading" and "failed to load" are visibly different
  rather than all rendering as a blank page.
- Confirmed existing RLS (`is_business_owner()`-based "tenant isolation"
  policies on all five menu tables, already in `0005_restaurant.sql`)
  already covers `SELECT` for the owning business — no migration change
  needed there.
- Fixed three stale doc comments (two SQL migrations, the README) still
  referencing the old deleted `lib/supabase.ts` from an earlier fix round.

**Not independently re-verified**: the exact manual click-through sequence
described (import → publish → Dashboard → Menu → refresh → log out → log
back in → Menu) requires a running app with a real browser and real
Supabase session — same constraint as everything else in this report. The
fix directly targets the described symptom (state not surviving
navigation) at its actual root cause (no fetch-on-mount), and the fetch is
filtered by `business_id` server-side and further constrained by RLS
independent of the query — but the only way to see it work is to actually
click through it.

## Post-report addition: Phone Management module

A complete customer-facing phone system (existing-number forwarding, buy-a-number,
BYO Twilio import, call routing, assistant/SMS settings, and a Test Center) was
added after this report was first written. Full details — migration, route
list, setup instructions, test checklist, what's mocked, and what's blocked
by provider-account limitations (Twilio has no OAuth flow, A2P 10DLC
registration, toll-free verification) — are in **`PHONE_MANAGEMENT.md`**
rather than duplicated here. Same verification discipline as everything
else in this report: real esbuild parsing (72 files, zero errors), real
import resolution, real env var consistency check, real client/server
boundary graph-walk (13 `'use client'` files, zero reach `next/headers` or
the admin client) — not a real `npm run build`, which still cannot execute
in this environment (confirmed again this session).

## Next step

Run `npm install && npm run build`. Send me the exact output. If it's clean,
I'll consider this closed and can help with the actual staging deployment
steps in `HOSTINGER_DEPLOYMENT.md`. If anything errors, paste it as-is and
I'll fix it in the next round.
