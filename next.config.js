/** @type {import('next').NextConfig} */
// IMPORTANT: do NOT add `output: 'export'` here. This app requires server
// API routes, Supabase auth (via middleware), Stripe webhooks, and live
// calls to ElevenLabs/Vapi/Twilio — all of which need a running Node
// server, not a static export. Deploy with `next build` + `next start`
// on Hostinger's Node.js Web App hosting (see HOSTINGER_DEPLOYMENT.md).
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: '10mb' }
  }
};

module.exports = nextConfig;
