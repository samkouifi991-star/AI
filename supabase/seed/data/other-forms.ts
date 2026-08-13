import type { ApplicationTypeSeed } from '../types'
import { nameQuestions, contactQuestions } from '../shared-questions'

// This file covers forms with a narrower, more procedural scope. Each still
// gets a real, working questionnaire (About You + purpose-specific
// questions + document checklist) rather than a placeholder — just a
// shorter one, because the underlying form itself asks less.

export const i130a: ApplicationTypeSeed = {
  slug: 'supplemental-spouse-information',
  form_code: 'I-130A',
  name: 'Supplemental Spouse Information',
  short_name: 'Supplemental Beneficiary Information (Spouse)',
  goal_categories: ['family'],
  edition_date: '2023-11-01',
  sort_order: 110,
  cta_text: 'Start My I-130A',
  estimated_minutes: 15,
  summary: "Provide the biographic and immigration information required from a spouse beneficiary alongside a Form I-130 petition.",
  who_its_for: 'The spouse being sponsored on a Form I-130 filed by their U.S. citizen or permanent resident spouse.',
  eligibility_overview: 'Filed together with Form I-130 whenever the relationship is spousal — there is no separate eligibility test.',
  workflow_overview: "We collect the beneficiary spouse's background and immigration history to prepare the I-130A alongside your I-130.",
  sections: [
    { key: 'about_you', title: 'About You', questions: [...nameQuestions('beneficiary', 'What is your full legal name?'), { key: 'date_of_birth', prompt: 'What is your date of birth?', type: 'date', required: true }, { key: 'country_of_birth', prompt: 'What country were you born in?', type: 'text', required: true }] },
    { key: 'contact', title: 'Contact Information', questions: contactQuestions() },
    { key: 'immigration_history', title: 'Immigration History', questions: [{ key: 'current_visa_status', prompt: 'What is your current immigration status, if any?', type: 'text', required: false }, { key: 'i94_number', prompt: 'What is your I-94 number, if applicable?', type: 'text', required: false }] },
  ],
  documentRequirements: [{ key: 'passport_photo_page', label: 'Passport photo page', category: 'identity', required: true }],
  pricing: { service_fee_cents: 4900, print_mail_fee_cents: 995 },
  governmentFee: { label: 'USCIS I-130A filing fee', amount_cents: 0, source_note: 'No separate fee — filed together with Form I-130.' },
}

export const i131a: ApplicationTypeSeed = {
  slug: 'carrier-documentation',
  form_code: 'I-131A',
  name: 'Apply for Carrier Documentation',
  short_name: 'Carrier Documentation',
  goal_categories: ['travel'],
  edition_date: '2022-10-01',
  sort_order: 120,
  cta_text: 'Start My I-131A',
  estimated_minutes: 15,
  summary: 'Apply for a travel document so a transportation carrier will allow a permanent resident with a lost, stolen, or expired green card to board a flight back to the United States.',
  who_its_for: 'Permanent residents or returning residents currently outside the U.S. whose green card was lost, stolen, or has expired.',
  eligibility_overview: 'Typically filed at a U.S. embassy or consulate while abroad after a card loss, theft, or expiration.',
  workflow_overview: 'We collect your details and travel situation to prepare your I-131A and the checklist consulates typically request.',
  sections: [
    { key: 'about_you', title: 'About You', questions: [...nameQuestions('applicant', 'What is your full legal name?'), { key: 'alien_number', prompt: 'What is your USCIS "A-Number"?', type: 'text', required: true }] },
    { key: 'contact', title: 'Contact Information', questions: contactQuestions() },
    { key: 'travel', title: 'Travel Situation', questions: [{ key: 'current_country', prompt: 'What country are you currently in?', type: 'text', required: true }, { key: 'card_status', prompt: 'What happened to your green card?', type: 'select', required: true, options: [{ value: 'lost', label: 'Lost' }, { value: 'stolen', label: 'Stolen' }, { value: 'expired', label: 'Expired' }] }] },
  ],
  documentRequirements: [{ key: 'police_report', label: 'Police report (if stolen)', category: 'other', show_if: [{ question_key: 'card_status', operator: 'equals', value: 'stolen' }] }, { key: 'two_photos', label: 'Two passport-style photos', category: 'identity', required: true }],
  pricing: { service_fee_cents: 12900, print_mail_fee_cents: 0 },
  governmentFee: { label: 'USCIS I-131A filing fee', amount_cents: 63500, source_note: 'Confirm the current fee on the USCIS Form I-131A fee page before filing.' },
}

export const i134: ApplicationTypeSeed = {
  slug: 'financial-support-declaration',
  form_code: 'I-134',
  name: 'Prepare a Declaration of Financial Support',
  short_name: 'Declaration of Financial Support',
  goal_categories: ['sponsorship'],
  edition_date: '2023-04-01',
  sort_order: 130,
  cta_text: 'Start My I-134',
  estimated_minutes: 15,
  summary: "Declare that you will financially support a nonimmigrant visitor (such as a parole applicant) during their stay in the United States.",
  who_its_for: 'Individuals sponsoring a nonimmigrant visitor, including certain parole programs.',
  eligibility_overview: 'You must show sufficient income or assets to support the beneficiary without them becoming a public charge.',
  workflow_overview: 'We collect your financial information and the beneficiary details to prepare your I-134.',
  sections: [
    { key: 'about_you', title: 'About You', questions: nameQuestions('sponsor', 'What is your full legal name?') },
    { key: 'contact', title: 'Contact Information', questions: contactQuestions() },
    { key: 'family', title: 'Person You Are Supporting', questions: [...nameQuestions('beneficiary', "What is the visitor's full legal name?"), { key: 'beneficiary_dob', prompt: "What is the visitor's date of birth?", type: 'date', required: true }] },
    { key: 'financial', title: 'Financial Information', questions: [{ key: 'annual_income', prompt: 'What is your total annual income?', type: 'number', required: true }] },
  ],
  documentRequirements: [{ key: 'tax_transcripts', label: 'Most recent federal tax return', category: 'financial', required: true }],
  pricing: { service_fee_cents: 8900, print_mail_fee_cents: 995 },
  governmentFee: { label: 'USCIS I-134 filing fee', amount_cents: 0, source_note: 'There is no government filing fee for Form I-134.' },
}

export const i821: ApplicationTypeSeed = {
  slug: 'temporary-protected-status',
  form_code: 'I-821',
  name: 'Apply for Temporary Protected Status',
  short_name: 'Temporary Protected Status (TPS)',
  goal_categories: ['other'],
  edition_date: '2023-06-01',
  sort_order: 140,
  cta_text: 'Start My I-821',
  estimated_minutes: 20,
  faqs: [
    {
      question: 'How do I know if my country currently has a TPS designation?',
      answer: 'TPS designations are country-specific, time-limited, and change based on federal register notices — Smart USA Visa does not maintain a hardcoded list. Confirm your country\'s current designation and registration window on the USCIS TPS page before relying on this application.',
    },
  ],
  summary: 'Apply for Temporary Protected Status if you are a national of a country designated by the U.S. government due to conflict or disaster conditions.',
  who_its_for: 'Nationals of a currently TPS-designated country who meet continuous residence and physical presence requirements.',
  eligibility_overview: 'Your country of nationality must have an active TPS designation, and you must meet the residence/presence dates for that designation. Designated countries and windows change over time — this overview does not confirm current designation status.',
  workflow_overview: 'We confirm your country and dates, then prepare your I-821 and checklist.',
  sections: [
    {
      key: 'eligibility',
      title: 'Eligibility Basics',
      questions: [
        {
          key: 'tps_country',
          prompt: 'What country are you a national of?',
          type: 'text',
          required: true,
          is_eligibility_question: true,
          help_text: 'Whether this country currently has an active TPS designation changes over time — verify on the USCIS TPS page. We cannot confirm current designation status for you.',
        },
        { key: 'continuous_residence_date', prompt: 'Since what date have you continuously resided in the United States?', type: 'date', required: true, is_eligibility_question: true },
      ],
    },
    { key: 'about_you', title: 'About You', questions: nameQuestions('applicant', 'What is your full legal name?') },
    { key: 'contact', title: 'Contact Information', questions: contactQuestions() },
  ],
  documentRequirements: [{ key: 'nationality_proof', label: 'Proof of nationality (passport or national ID)', category: 'identity', required: true }, { key: 'residence_proof', label: 'Evidence of continuous residence (leases, bills, school records)', category: 'other', required: true }],
  pricing: { service_fee_cents: 17900, print_mail_fee_cents: 1995 },
  governmentFee: { label: 'USCIS I-821 filing fee', amount_cents: 5000, fee_waiver_available: true, source_note: 'Fee may also require a separate biometrics fee — confirm current amounts on the USCIS Form I-821 fee page.' },
}

export const i821d: ApplicationTypeSeed = {
  slug: 'daca',
  form_code: 'I-821D',
  name: 'Prepare a DACA Request',
  short_name: 'DACA Request',
  goal_categories: ['other'],
  edition_date: '2023-06-01',
  sort_order: 150,
  cta_text: 'Start My I-821D',
  estimated_minutes: 20,
  faqs: [
    {
      question: 'Is DACA currently accepting new applications?',
      answer: 'DACA availability — including whether USCIS is accepting first-time requests versus renewals only — has changed repeatedly due to ongoing litigation and policy changes. Confirm current program status on the USCIS DACA page before relying on this application; Smart USA Visa does not control or guarantee program availability.',
    },
  ],
  summary: 'Request or renew Deferred Action for Childhood Arrivals status.',
  who_its_for: 'Individuals who arrived in the U.S. as children and meet DACA program requirements, including current DACA recipients renewing.',
  eligibility_overview: 'Eligibility depends on age at arrival, continuous residence, education status, and no disqualifying criminal history. Program availability itself is subject to ongoing litigation — confirm current status before relying on this application.',
  workflow_overview: 'We confirm your DACA history and background, then prepare your I-821D.',
  sections: [
    { key: 'eligibility', title: 'Eligibility Basics', questions: [{ key: 'is_renewal', prompt: 'Is this a DACA renewal?', type: 'yes_no', required: true, is_eligibility_question: true }, { key: 'arrival_date', prompt: 'When did you first arrive in the United States?', type: 'date', required: true, is_eligibility_question: true }] },
    { key: 'about_you', title: 'About You', questions: nameQuestions('applicant', 'What is your full legal name?') },
    { key: 'contact', title: 'Contact Information', questions: contactQuestions() },
  ],
  documentRequirements: [{ key: 'school_records', label: 'School or education records', category: 'other' }, { key: 'residence_proof', label: 'Evidence of continuous residence', category: 'other', required: true }],
  pricing: { service_fee_cents: 17900, print_mail_fee_cents: 1995 },
  governmentFee: { label: 'USCIS I-821D filing fee (with I-765)', amount_cents: 52000, source_note: 'Confirm current combined fee on the USCIS DACA fee page.' },
}

export const i864a: ApplicationTypeSeed = {
  slug: 'household-member-financial-support',
  form_code: 'I-864A',
  name: 'Contribute Household Income to a Sponsorship',
  short_name: 'Contract Between Sponsor and Household Member',
  goal_categories: ['sponsorship'],
  edition_date: '2023-08-01',
  sort_order: 160,
  cta_text: 'Start My I-864A',
  estimated_minutes: 10,
  summary: "Combine a household member's income with the sponsor's to meet the Affidavit of Support income requirement.",
  who_its_for: 'A relative or household member living with the sponsor who is contributing income toward the I-864 requirement.',
  eligibility_overview: 'You must live in the same household as the sponsor and agree to be jointly liable for the support obligation.',
  workflow_overview: 'We collect your income information to prepare your I-864A alongside the sponsor\'s I-864.',
  sections: [
    { key: 'about_you', title: 'About You', questions: nameQuestions('household_member', 'What is your full legal name?') },
    { key: 'contact', title: 'Contact Information', questions: contactQuestions() },
    { key: 'financial', title: 'Financial Information', questions: [{ key: 'annual_income', prompt: 'What is your total annual income?', type: 'number', required: true }, { key: 'relationship_to_sponsor', prompt: 'What is your relationship to the sponsor?', type: 'text', required: true }] },
  ],
  documentRequirements: [{ key: 'tax_transcripts', label: 'Most recent federal tax return', category: 'financial', required: true }],
  pricing: { service_fee_cents: 6900, print_mail_fee_cents: 995 },
  governmentFee: { label: 'USCIS I-864A filing fee', amount_cents: 0, source_note: 'There is no separate government filing fee for Form I-864A.' },
}

export const n565: ApplicationTypeSeed = {
  slug: 'replace-citizenship-certificate',
  form_code: 'N-565',
  name: 'Replace Your Citizenship or Naturalization Certificate',
  short_name: 'Replace Citizenship/Naturalization Document',
  goal_categories: ['citizenship-documents', 'citizenship'],
  edition_date: '2023-05-01',
  sort_order: 170,
  cta_text: 'Start My N-565',
  estimated_minutes: 10,
  summary: 'Request a replacement or corrected Certificate of Naturalization or Certificate of Citizenship.',
  who_its_for: 'U.S. citizens whose certificate was lost, stolen, damaged, or contains an error, or who need a name-change replacement.',
  eligibility_overview: "You must already hold citizenship — this form doesn't grant citizenship, it replaces or corrects proof of it.",
  workflow_overview: 'We confirm the reason for replacement, then prepare your N-565 and checklist.',
  sections: [
    { key: 'eligibility', title: 'Eligibility Basics', questions: [{ key: 'n565_reason', prompt: 'Why do you need a replacement certificate?', type: 'radio_cards', required: true, is_eligibility_question: true, options: [{ value: 'lost_stolen', label: 'Lost or stolen' }, { value: 'damaged', label: 'Damaged' }, { value: 'error', label: 'Contains an error' }, { value: 'name_change', label: 'Legal name change' }] }] },
    { key: 'about_you', title: 'About You', questions: nameQuestions('applicant', 'What is your full legal name?') },
    { key: 'contact', title: 'Contact Information', questions: contactQuestions() },
  ],
  documentRequirements: [{ key: 'existing_certificate_copy', label: 'Copy of existing certificate, if available', category: 'immigration' }, { key: 'name_change_order', label: 'Court order or marriage certificate showing name change', category: 'other', show_if: [{ question_key: 'n565_reason', operator: 'equals', value: 'name_change' }] }],
  pricing: { service_fee_cents: 12900, print_mail_fee_cents: 1995 },
  governmentFee: { label: 'USCIS N-565 filing fee', amount_cents: 55500, source_note: 'Confirm the current fee on the USCIS Form N-565 fee page before filing.' },
}

export const n600: ApplicationTypeSeed = {
  slug: 'certificate-of-citizenship',
  form_code: 'N-600',
  name: 'Apply for a Certificate of Citizenship',
  short_name: 'Certificate of Citizenship',
  goal_categories: ['citizenship-documents', 'citizenship'],
  edition_date: '2023-05-01',
  sort_order: 180,
  cta_text: 'Start My N-600',
  estimated_minutes: 25,
  summary: 'Apply for proof of U.S. citizenship if you acquired or derived citizenship automatically, typically through a U.S. citizen parent.',
  who_its_for: 'People who became U.S. citizens automatically through a parent, but never received a certificate as proof.',
  eligibility_overview: 'You must show you acquired or derived citizenship under the law in effect at the relevant time — usually through a U.S. citizen parent.',
  workflow_overview: "We collect your family and immigration history to prepare your N-600 and evidence checklist.",
  sections: [
    { key: 'eligibility', title: 'Eligibility Basics', questions: [{ key: 'citizenship_basis', prompt: 'How did you become a citizen?', type: 'radio_cards', required: true, is_eligibility_question: true, options: [{ value: 'birth_to_citizen_parent', label: 'Born abroad to a U.S. citizen parent' }, { value: 'naturalization_of_parent', label: "Automatically, through a parent's naturalization" }] }] },
    { key: 'about_you', title: 'About You', questions: nameQuestions('applicant', 'What is your full legal name?') },
    { key: 'contact', title: 'Contact Information', questions: contactQuestions() },
    { key: 'family', title: 'Parent Information', questions: [...nameQuestions('parent', "What is your U.S. citizen parent's full legal name?"), { key: 'parent_citizenship_date', prompt: 'When did your parent become a U.S. citizen (birth or naturalization)?', type: 'date', required: true }] },
  ],
  documentRequirements: [{ key: 'parent_citizenship_proof', label: "Proof of your parent's U.S. citizenship", category: 'immigration', required: true }, { key: 'birth_certificate', label: 'Your birth certificate', category: 'identity', required: true }],
  pricing: { service_fee_cents: 22900, print_mail_fee_cents: 1995 },
  governmentFee: { label: 'USCIS N-600 filing fee', amount_cents: 137000, fee_waiver_available: true, source_note: 'Confirm the current fee on the USCIS Form N-600 fee page before filing.' },
}

export const g1145: ApplicationTypeSeed = {
  slug: 'e-notification',
  form_code: 'G-1145',
  name: 'Get Text/Email Notification of USCIS Acceptance',
  short_name: 'E-Notification of Application Acceptance',
  goal_categories: ['other'],
  edition_date: '2016-03-01',
  sort_order: 190,
  cta_text: 'Start My G-1145',
  estimated_minutes: 2,
  summary: 'Request an email and text notification when USCIS accepts a paper-filed application, rather than waiting for a mailed receipt notice.',
  who_its_for: 'Anyone filing a paper application with USCIS who wants faster confirmation of receipt.',
  eligibility_overview: 'No eligibility requirements — this is a convenience notification request attached to another filing.',
  workflow_overview: 'We generate a completed G-1145 to attach to the top of your paper filing.',
  sections: [
    { key: 'contact', title: 'Contact Information', questions: [{ key: 'notify_email', prompt: 'What email should USCIS notify?', type: 'email', required: true }, { key: 'notify_phone', prompt: 'What mobile number should USCIS text?', type: 'phone', required: true }] },
  ],
  documentRequirements: [],
  pricing: { service_fee_cents: 0, print_mail_fee_cents: 0 },
  governmentFee: { label: 'USCIS G-1145 filing fee', amount_cents: 0, source_note: 'There is no fee for Form G-1145 — it is a free add-on to another paper filing.' },
}
