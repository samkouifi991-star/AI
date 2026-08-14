// Compares every active application_types row against the live
// /applications/[slug] route and fails (non-zero exit) if any active
// application 404s. Run this after any change that touches application
// slugs — seed data, migrations, or the Find My Application decision tree
// — so a slug drift is caught by a script instead of a customer.
//
// Usage:
//   cp .env.example .env.local   # needs NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
//   SITE_URL=https://smart-usa-visa.vercel.app npm run verify:routes
//   SITE_URL=http://localhost:3000 npm run verify:routes   # against a local dev server

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const siteUrl = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}

async function main() {
  const supabase = createClient(supabaseUrl!, supabaseAnonKey!)
  const { data: applications, error } = await supabase
    .from('application_types')
    .select('slug, form_code, name')
    .eq('is_active', true)
    .order('sort_order')

  if (error) {
    console.error('Could not load application_types:', error.message)
    process.exit(1)
  }

  console.log(`Checking ${applications.length} active applications against ${siteUrl} ...\n`)

  const failures: { slug: string; form_code: string; status: number | string }[] = []

  for (const app of applications) {
    const url = `${siteUrl}/applications/${app.slug}`
    try {
      const res = await fetch(url, { redirect: 'manual' })
      const ok = res.status === 200
      console.log(`${ok ? '✓' : '✗'} ${app.form_code.padEnd(8)} ${app.slug.padEnd(40)} ${res.status}`)
      if (!ok) failures.push({ slug: app.slug, form_code: app.form_code, status: res.status })
    } catch (err) {
      console.log(`✗ ${app.form_code.padEnd(8)} ${app.slug.padEnd(40)} ERROR`)
      failures.push({ slug: app.slug, form_code: app.form_code, status: String(err) })
    }
  }

  console.log('')
  if (failures.length > 0) {
    console.error(`FAILED: ${failures.length} of ${applications.length} active applications did not return 200:`)
    for (const f of failures) console.error(`  - ${f.form_code} (${f.slug}): ${f.status}`)
    process.exit(1)
  }

  console.log(`PASSED: all ${applications.length} active applications returned 200.`)
}

main()
