# Tasty n Healthy — Website

A fast, modern, dependency-free marketing website for the Tasty n Healthy
restaurant: plain HTML/CSS/JS (no build step, no npm install), so it can be
previewed by opening `index.html` directly and deployed to literally any
static host in minutes.

This lives in its own folder inside this repository and is completely
independent from the Next.js app at the repo root (a different, unrelated
product) — nothing here touches or depends on that code.

## Pages

- `index.html` — Home: hero, feature highlights, fan-favorite dishes,
  story teaser, testimonials, gallery, newsletter signup, CTA.
- `menu.html` — Full menu with category filter tabs, dietary tags
  (GF / Vegan / High-Protein / Dairy-Free) and prices.
- `about.html` — Story, values, timeline, team.
- `contact.html` — Order/contact form, hours, address, map embed, FAQ.

Shared design system: `assets/css/style.css`. Shared interactivity
(mobile nav, scroll reveal, testimonial carousel, FAQ accordion, menu
filter, form validation): `assets/js/main.js`.

## ⚠️ Placeholder content — replace before launch

I could not reach the live tasty-n-healthy.com site from this environment
(outbound network here is restricted), so this was built from scratch with
realistic placeholder content. Before this goes live, replace:

1. **Real photography** — every dish card, gallery tile and hero visual
   currently uses a CSS gradient + icon in place of a photo. Recommended
   sizes: hero visual ~1000×1050px, dish cards ~800×600px, gallery tiles
   square ~600×600px. Swap the `.dish-media`, `.hero-visual`, and
   `.g-item` elements for `<img>` tags once you have photos.
2. **Menu items & prices** — `menu.html` (and the "Fan Favorites" preview
   in `index.html`) has a full sample menu. Replace with your real dishes,
   descriptions, and prices.
3. **Contact info** — phone (`(555) 010-2024`), email
   (`hello@tasty-n-healthy.com`), address (`123 Market Street...`), and
   hours appear in the header, footer, and `contact.html`. Search-and-replace
   across all four HTML files.
4. **Google Maps embed** — the iframe `src` in `contact.html` uses a generic
   query string. Replace with your actual address, or grab a real embed URL
   from Google Maps → Share → Embed a map.
5. **Social links** — Instagram/Facebook/TikTok icons in every footer
   currently link to `#`. Point them at your real profiles.
6. **JSON-LD structured data** — `index.html` has a `Restaurant` schema
   block in `<head>` with placeholder address/phone/hours for SEO. Update it
   to match your real details (this directly affects how Google displays
   your business in search results).
7. **Reviews/testimonials & team names** — in `index.html` and `about.html`,
   replace with real customer quotes (with permission) and your actual team.

## Making the forms actually send

The contact form (`contact.html`) and newsletter signup (`index.html`) are
client-side only right now — they validate input and show a success message,
but nothing is actually emailed or stored yet. Fastest ways to wire this up
with zero backend code:

- **Formspree** (formspree.io) — add `action="https://formspree.io/f/xxxx"`
  and `method="POST"` to the `<form id="contact-form">` tag, remove the
  `e.preventDefault()` in `main.js`'s `initContactForm`, done.
- **Netlify Forms** — if you deploy on Netlify, just add
  `data-netlify="true"` to the form tag.
- **A serverless function** — point the form's `fetch()` at your own
  endpoint (e.g. a small function that calls Resend/SendGrid); the existing
  `app/api/contact` route in this repo's root Next.js app is a working
  example of exactly this pattern if you want a reference implementation.

## Deployment (any static host)

This is a static site — no Node.js, no build step, no environment
variables required. To deploy on Hostinger specifically:

1. Zip the contents of this folder (or upload via FTP/File Manager).
2. In Hostinger's **File Manager**, upload and extract into `public_html`
   (or a subdomain's document root) so `index.html` sits at the root.
3. Point your domain/subdomain at that folder — no server restart needed.

It will also deploy as-is to Netlify, Vercel, GitHub Pages, Cloudflare
Pages, or S3 + CloudFront — just point any of them at this folder.

## Customizing the look

All colors, fonts and spacing are defined as CSS custom properties at the
top of `assets/css/style.css` (`:root { --green-900: ...; }`). Change the
palette there and it cascades through the whole site — no need to hunt
through individual pages.
