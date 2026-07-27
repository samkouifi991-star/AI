# Hostinger Deployment Checklist — Business Pilot AI

This is a step-by-step path from this codebase to a live URL on Hostinger's
Node.js Web App hosting. Follow it in order — later steps (webhooks) need
your live URL from earlier steps.

> **Before you start:** this app cannot be statically exported. It needs a
> running Node server for API routes, Supabase auth, Stripe webhooks, and
> live calls to ElevenLabs/Vapi/Twilio. Confirm your Hostinger plan supports
> **Node.js Web App hosting** (not just static/shared hosting).

---

## 1. Upload the project to GitHub

1. Create a new **private** GitHub repository (e.g. `business-pilot-ai`).
2. From this project's root:
   ```bash
   git init
   git add .
   git commit -m "Initial production-ready commit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/business-pilot-ai.git
   git push -u origin main
   ```
3. Double-check `.env` and `.env.local` are **not** in the commit — run
   `git status` and confirm only `.env.example` (no real values) appears.
   The included `.gitignore` already excludes real env files, `.next/`, and
   `node_modules/`.

## 2. Connect GitHub to Hostinger

1. In hPanel, go to **Websites → your domain (or create a new website) →
   Node.js**.
2. Choose **Create from GitHub repository** (or "Git" as the source).
3. Authorize Hostinger's GitHub App if prompted, then select the
   `business-pilot-ai` repository.

## 3. Select the correct branch

1. In the Node.js app's Git settings, set the deploy branch to **main**
   (or whichever branch holds your production-ready code).
2. Enable **auto-deploy on push** if you want every push to `main` to
   redeploy automatically; otherwise you'll trigger deploys manually from
   hPanel.

## 4. Add environment variables in Hostinger

In the Node.js app's **Environment Variables** section, add every variable
from `.env.example` with real production values:

```
NEXT_PUBLIC_APP_URL=https://yourdomain.com
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ELEVENLABS_API_KEY=
ELEVENLABS_FALLBACK_VOICE_ID=21m00Tcm4TlvDq8ikWAM
VOICE_PROVIDER=elevenlabs
VAPI_API_KEY=
VAPI_WEBHOOK_SECRET=
VAPI_ASSISTANT_ID=
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
OPENAI_API_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://yourdomain.com/api/calendar/google/callback
RESEND_API_KEY=
```

**Never** paste real secret values into this file, chat, or any doc — enter
them directly in Hostinger's environment variable UI only.

Set **Node.js version** to 18.18 or newer (Next.js 14 requirement) in the
same settings panel.

## 5. Run the production build

1. Set the **Install command** to:
   ```
   npm install
   ```
2. Set the **Build command** to:
   ```
   npm run build
   ```
3. Set the **Start command** to:
   ```
   npm run start
   ```
4. Trigger a deploy. Watch the build log — it should end with Next.js's
   standard `▲ Next.js 14.2.5` build summary and no red error lines.
   If it fails, copy the exact error from the log; the most common causes
   are a missing environment variable (Supabase/Stripe keys referenced
   with a trailing `!` in code will throw at build or first request if
   unset) or a Node version mismatch.

## 6. Connect the domain

1. In hPanel, point your domain's DNS (A record or CNAME, per Hostinger's
   instructions for Node.js apps) to the app.
2. Wait for DNS propagation (can take up to a few hours).
3. Update `NEXT_PUBLIC_APP_URL` to the final domain and redeploy — this
   value is used to build Stripe success/cancel URLs and the Google OAuth
   redirect, so it must match exactly.

## 7. Enable HTTPS

1. In hPanel, go to **SSL** for your domain and issue a free Let's Encrypt
   certificate (or upload your own).
2. Confirm the app is reachable at `https://yourdomain.com` before
   configuring any webhooks below — Stripe and Vapi both require HTTPS
   endpoints.

## 8. Configure Stripe webhooks

1. In the Stripe Dashboard → **Developers → Webhooks → Add endpoint**.
2. Endpoint URL: `https://yourdomain.com/api/stripe/webhook`
3. Select events: `checkout.session.completed`, `payment_intent.succeeded`,
   `payment_intent.payment_failed`, `charge.refunded`.
4. Copy the **Signing secret** (`whsec_...`) into `STRIPE_WEBHOOK_SECRET` in
   Hostinger's environment variables, then redeploy.
5. Use Stripe's **Send test webhook** button to confirm your endpoint
   returns `200`.

## 9. Configure Vapi webhooks

1. In your Vapi dashboard, open the assistant for this business (or create
   one from `vapi-assistant-config.example.json`).
2. Set **Server URL** to `https://yourdomain.com/api/vapi/webhook`.
3. Set **Server URL Secret** to the same value as `VAPI_WEBHOOK_SECRET`.
4. Save the assistant's id into that business's `businesses.vapi_assistant_id`
   column in Supabase (or set `VAPI_ASSISTANT_ID` as a shared fallback for
   staging).

## 10. Configure Twilio phone numbers

1. In the Twilio Console, open your phone number's configuration.
2. Set **A call comes in** webhook to `https://yourdomain.com/api/twilio/voice`
   (HTTP POST).
3. Forward the business's existing public number to this Twilio number
   using the business's own carrier's call-forwarding settings.

## 11. Test ElevenLabs voices

1. Log in, go to **Settings → Voice & Language**.
2. Click **Test connection** — should show *Connected*.
3. Confirm real voices load (not a loading spinner stuck, not an error).
4. Preview at least two voices, select one, and click **Sync voice to
   assistant** — confirm the success message.
5. Check `GET https://yourdomain.com/api/health` — `checks.elevenlabs.ok`
   should be `true`.

## 12. Test signup and login

1. Visit `/signup`, create a test account, confirm you land on
   `/onboarding` or `/dashboard`.
2. Log out, log back in at `/login`.
3. Confirm the session persists across a page refresh (middleware.ts
   handles this — if it doesn't, double check `NEXT_PUBLIC_SUPABASE_URL`
   and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set correctly).

## 13. Test restaurant orders

1. Create or switch a test business to **Restaurant** type.
2. Upload or manually add a small menu in **Menu**.
3. Place a call to the business's forwarded number (or use Vapi's test
   call feature) and place a full order.
4. Confirm the order appears in **Orders** with the correct status
   progression (Pending Payment → Paid → Accepted, etc.) once payment
   completes.

## 14. Test service-business appointments

1. Switch a test business to **Service business** type.
2. Confirm **Estimate & Booking Rules** are configured (at least a flat
   fee).
3. Call in, request an estimate, and book an appointment.
4. Confirm the appointment appears in **Appointments**, the estimate in
   the call record, and (if a deposit was required) the payment in
   **Payments**.

---

## Staging mode — test safely without charging real customers

Use this configuration until you're ready for real customer traffic:

- **Stripe test mode**: use your Stripe **test** keys (`sk_test_...` /
  `pk_test_...`) in `STRIPE_SECRET_KEY` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
  `lib/stripe.ts`'s `isStripeTestMode()` detects this automatically from the
  `sk_test_` prefix — every row written to the `payments` table is flagged
  `is_test: true` when running in test mode, so test and real payments are
  always distinguishable in the database, never mixed.
- **Test phone number**: use a Twilio trial number, or a second real number
  you control, rather than a business's live production line, until you've
  completed the checklist above end to end.
- **Test webhooks**: use Stripe's test webhook events (Dashboard → test
  mode toggle) and Vapi's test call feature rather than live calls.
- **No accidental production charges**: Stripe test-mode keys physically
  cannot move real money — this is Stripe's own guarantee, not something
  this app has to enforce separately. As long as `STRIPE_SECRET_KEY` starts
  with `sk_test_`, every checkout session created by `/api/stripe/checkout`
  is a test transaction.
- Check `GET /api/health` any time — `checks.stripe.mode` reports `"test"`
  or `"live"` so you can confirm at a glance which mode is active before
  testing.

When you're ready to go live: swap in `sk_live_`/`pk_live_` Stripe keys,
your real Twilio number, and re-run steps 8–14 once more against
production credentials before announcing launch.
