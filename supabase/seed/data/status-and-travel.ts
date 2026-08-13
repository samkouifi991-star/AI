import type { ApplicationTypeSeed } from '../types'
import { nameQuestions, otherNamesQuestions, contactQuestions, maritalQuestions } from '../shared-questions'

export const i90: ApplicationTypeSeed = {
  slug: 'green-card-renewal-replacement',
  form_code: 'I-90',
  name: 'Renew or Replace My Green Card',
  short_name: 'Green Card Renewal/Replacement',
  goal_categories: ['green-card'],
  edition_date: '2024-02-01',
  sort_order: 50,
  summary: 'Renew an expiring green card or replace one that was lost, stolen, damaged, or issued with incorrect information.',
  who_its_for: 'Current permanent residents whose card is expiring, expired, lost, stolen, damaged, or contains an error.',
  eligibility_overview: 'Most permanent residents with a valid basis (expiration, loss, damage, or a card error) are eligible to file.',
  workflow_overview: 'Tell us why you need a new card, confirm your details, and we prepare your I-90 and checklist.',
  sections: [
    {
      key: 'eligibility',
      title: 'Eligibility Basics',
      questions: [
        {
          key: 'i90_reason',
          prompt: 'Why do you need a new green card?',
          type: 'radio_cards',
          required: true,
          is_eligibility_question: true,
          options: [
            { value: 'expiring', label: 'My card is expiring or has expired' },
            { value: 'lost_stolen', label: 'My card was lost or stolen' },
            { value: 'damaged', label: 'My card was damaged' },
            { value: 'error', label: 'My card has incorrect information' },
            { value: 'never_received', label: 'I never received my card' },
          ],
        },
      ],
    },
    { key: 'about_you', title: 'About You', questions: [...nameQuestions('applicant', 'What is your full legal name?'), ...otherNamesQuestions('applicant'), { key: 'date_of_birth', prompt: 'What is your date of birth?', type: 'date', required: true }, { key: 'alien_number', prompt: 'What is your USCIS "A-Number"?', type: 'text', required: true, placeholder: 'A-000000000' }] },
    { key: 'contact', title: 'Contact Information', questions: contactQuestions() },
  ],
  documentRequirements: [
    { key: 'current_green_card', label: 'Copy of current green card (front and back)', category: 'immigration', show_if: [{ question_key: 'i90_reason', operator: 'not_equals', value: 'lost_stolen' }] },
    { key: 'police_report', label: 'Police report (if stolen)', category: 'other', show_if: [{ question_key: 'i90_reason', operator: 'equals', value: 'lost_stolen' }] },
    { key: 'two_photos', label: 'Two passport-style photos', category: 'identity', required: true },
  ],
  pricing: { service_fee_cents: 12900, print_mail_fee_cents: 1995 },
  governmentFee: { label: 'USCIS I-90 filing fee', amount_cents: 46500, source_note: 'Confirm the current fee on the USCIS Form I-90 fee page before filing.' },
}

export const i751: ApplicationTypeSeed = {
  slug: 'remove-conditions-green-card',
  form_code: 'I-751',
  name: 'Remove Conditions From My Green Card',
  short_name: 'Remove Conditions on Residence',
  goal_categories: ['green-card'],
  edition_date: '2023-09-01',
  sort_order: 60,
  summary: 'Petition to remove the 2-year conditions on your green card, usually filed jointly with your spouse.',
  who_its_for: 'Conditional permanent residents who obtained status through marriage less than 2 years old at approval.',
  eligibility_overview: 'You generally must file within the 90 days before your 2-year card expires, jointly with your spouse (with exceptions for divorce, abuse, or widowhood).',
  workflow_overview: 'We confirm your filing window and marriage details, then prepare your I-751 with a checklist of bona fide marriage evidence.',
  sections: [
    {
      key: 'eligibility',
      title: 'Eligibility Basics',
      questions: [
        { key: 'card_expiration', prompt: 'When does your conditional green card expire?', type: 'date', required: true, is_eligibility_question: true },
        {
          key: 'filing_basis',
          prompt: 'How are you filing?',
          type: 'radio_cards',
          required: true,
          is_eligibility_question: true,
          options: [
            { value: 'joint', label: 'Jointly with my spouse' },
            { value: 'divorced_waiver', label: 'Requesting a waiver — marriage ended in divorce' },
            { value: 'abuse_waiver', label: 'Requesting a waiver — abuse by my spouse' },
            { value: 'widowed_waiver', label: 'Requesting a waiver — my spouse passed away' },
          ],
        },
      ],
    },
    { key: 'about_you', title: 'About You', questions: [...nameQuestions('applicant', 'What is your full legal name?'), { key: 'alien_number', prompt: 'What is your USCIS "A-Number"?', type: 'text', required: true }] },
    { key: 'contact', title: 'Contact Information', questions: contactQuestions() },
    { key: 'marriage', title: 'Marriage', questions: maritalQuestions() },
  ],
  documentRequirements: [
    { key: 'joint_finances', label: 'Evidence of commingled finances (joint bank/lease/tax returns)', category: 'relationship', required: true },
    { key: 'green_card_copy', label: 'Copy of current conditional green card', category: 'immigration', required: true },
    { key: 'divorce_decree', label: 'Final divorce decree', category: 'relationship', show_if: [{ question_key: 'filing_basis', operator: 'equals', value: 'divorced_waiver' }] },
  ],
  pricing: { service_fee_cents: 24900, print_mail_fee_cents: 1995 },
  governmentFee: { label: 'USCIS I-751 filing fee (includes biometrics)', amount_cents: 75000, source_note: 'Confirm the current fee on the USCIS Form I-751 fee page before filing.' },
}

export const i129f: ApplicationTypeSeed = {
  slug: 'fiance-visa-petition',
  form_code: 'I-129F',
  name: "Bring My Fiancé(e) to the U.S.",
  short_name: 'Fiancé(e) Petition',
  goal_categories: ['fiance'],
  edition_date: '2023-10-01',
  sort_order: 70,
  summary: 'Petition for your foreign fiancé(e) to come to the United States on a K-1 visa so you can marry within 90 days of arrival.',
  who_its_for: 'U.S. citizens who intend to marry a foreign national fiancé(e) and have met them in person within the last 2 years.',
  eligibility_overview: 'You must be a U.S. citizen, both of you must be free to marry, and you generally must have met in person within the last 2 years.',
  workflow_overview: 'We gather your information and your fiancé(e)\'s information, then prepare your I-129F petition and evidence checklist.',
  sections: [
    {
      key: 'eligibility',
      title: 'Eligibility Basics',
      questions: [
        { key: 'petitioner_is_citizen', prompt: 'Are you a U.S. citizen?', type: 'yes_no', required: true, is_eligibility_question: true },
        { key: 'met_in_person', prompt: 'Have you and your fiancé(e) met in person within the last 2 years?', type: 'yes_no', required: true, is_eligibility_question: true },
        { key: 'free_to_marry', prompt: 'Are both of you legally free to marry (any prior marriages fully ended)?', type: 'yes_no', required: true, is_eligibility_question: true },
      ],
    },
    { key: 'about_you', title: 'About You (Petitioner)', questions: nameQuestions('petitioner', 'What is your full legal name?') },
    { key: 'contact', title: 'Your Contact Information', questions: contactQuestions() },
    {
      key: 'family',
      title: 'Your Fiancé(e)',
      questions: [
        ...nameQuestions('beneficiary', "What is your fiancé(e)'s full legal name?"),
        { key: 'beneficiary_dob', prompt: "What is your fiancé(e)'s date of birth?", type: 'date', required: true },
        { key: 'beneficiary_country', prompt: 'What country does your fiancé(e) currently live in?', type: 'text', required: true },
        { key: 'how_met', prompt: 'How and when did you meet in person?', type: 'textarea', required: true },
      ],
    },
  ],
  documentRequirements: [
    { key: 'proof_of_citizenship', label: 'Proof of your U.S. citizenship', category: 'immigration', required: true },
    { key: 'meeting_evidence', label: 'Evidence you met in person (photos, travel records)', category: 'relationship', required: true },
    { key: 'divorce_decrees', label: 'Divorce decree(s) from any prior marriages', category: 'relationship' },
  ],
  pricing: { service_fee_cents: 27900, print_mail_fee_cents: 1995 },
  governmentFee: { label: 'USCIS I-129F filing fee', amount_cents: 67500, source_note: 'Confirm the current fee on the USCIS Form I-129F fee page before filing.' },
}

export const i131: ApplicationTypeSeed = {
  slug: 'travel-document',
  form_code: 'I-131',
  name: 'Apply for a Travel Document',
  short_name: 'Travel Document (Advance Parole / Reentry Permit)',
  goal_categories: ['travel'],
  edition_date: '2024-01-01',
  sort_order: 80,
  summary: 'Apply for Advance Parole, a Reentry Permit, or a Refugee Travel Document so you can travel internationally without abandoning your pending application or status.',
  who_its_for: 'Applicants with a pending green card application who need to travel, permanent residents planning an extended trip, or refugees/asylees needing a travel document.',
  eligibility_overview: 'Eligibility and the correct document depend on your current status and reason for travel.',
  workflow_overview: 'We confirm which travel document fits your situation, then prepare your I-131 and checklist.',
  sections: [
    {
      key: 'eligibility',
      title: 'Eligibility Basics',
      questions: [
        {
          key: 'travel_doc_type',
          prompt: 'Which travel document do you need?',
          type: 'radio_cards',
          required: true,
          is_eligibility_question: true,
          options: [
            { value: 'advance_parole', label: 'Advance Parole (pending green card application)' },
            { value: 'reentry_permit', label: 'Reentry Permit (permanent resident, extended trip)' },
            { value: 'refugee_travel', label: 'Refugee Travel Document' },
          ],
        },
        { key: 'travel_reason', prompt: 'What is the purpose of your trip?', type: 'textarea', required: true },
      ],
    },
    { key: 'about_you', title: 'About You', questions: [...nameQuestions('applicant', 'What is your full legal name?'), { key: 'alien_number', prompt: 'What is your USCIS "A-Number"?', type: 'text', required: false }] },
    { key: 'contact', title: 'Contact Information', questions: contactQuestions() },
  ],
  documentRequirements: [
    { key: 'i485_receipt', label: 'I-485 receipt notice', category: 'immigration', show_if: [{ question_key: 'travel_doc_type', operator: 'equals', value: 'advance_parole' }] },
    { key: 'green_card_copy', label: 'Copy of green card', category: 'immigration', show_if: [{ question_key: 'travel_doc_type', operator: 'equals', value: 'reentry_permit' }] },
    { key: 'two_photos', label: 'Two passport-style photos', category: 'identity', required: true },
  ],
  pricing: { service_fee_cents: 17900, print_mail_fee_cents: 1995 },
  governmentFee: { label: 'USCIS I-131 filing fee', amount_cents: 63000, source_note: 'Fee varies by document type — confirm on the USCIS Form I-131 fee page before filing.' },
}

export const i864: ApplicationTypeSeed = {
  slug: 'affidavit-of-support',
  form_code: 'I-864',
  name: 'Financially Sponsor a Family Member',
  short_name: 'Affidavit of Support',
  goal_categories: ['sponsorship'],
  edition_date: '2023-08-01',
  sort_order: 90,
  summary: 'Complete an Affidavit of Support to demonstrate you can financially sponsor a relative applying for a green card.',
  who_its_for: 'Petitioners (and joint sponsors) who need to show income and assets meeting 125% of the federal poverty guidelines.',
  eligibility_overview: 'You generally must show household income at or above 125% of the federal poverty guidelines for your household size, or sufficient assets to make up the difference.',
  workflow_overview: 'We collect your household and financial information, then prepare your I-864 with the correct poverty-guideline calculation.',
  sections: [
    {
      key: 'eligibility',
      title: 'Eligibility Basics',
      questions: [
        { key: 'sponsor_role', prompt: 'Are you the petitioner or a joint sponsor?', type: 'radio_cards', required: true, is_eligibility_question: true, options: [{ value: 'petitioner', label: 'I am the petitioner' }, { value: 'joint_sponsor', label: 'I am a joint sponsor' }] },
        { key: 'household_size', prompt: 'How many people are in your household (including yourself and the immigrant you are sponsoring)?', type: 'number', required: true, is_eligibility_question: true },
      ],
    },
    { key: 'about_you', title: 'About You', questions: nameQuestions('sponsor', 'What is your full legal name?') },
    { key: 'contact', title: 'Contact Information', questions: contactQuestions() },
    {
      key: 'financial',
      title: 'Financial Information',
      questions: [
        { key: 'annual_income', prompt: 'What is your total individual annual income?', type: 'number', required: true, help_text: 'Enter the amount from your most recent federal tax return.' },
        { key: 'employer_current', prompt: 'Who is your current employer?', type: 'text', required: true },
        { key: 'uses_assets', prompt: 'Do you need to use assets (savings, property) to meet the income requirement?', type: 'yes_no', required: true },
        { key: 'asset_value', prompt: 'What is the total value of the assets you want to include?', type: 'number', show_if: [{ question_key: 'uses_assets', operator: 'equals', value: 'yes' }] },
      ],
    },
  ],
  documentRequirements: [
    { key: 'tax_transcripts', label: 'Most recent federal tax return or IRS transcript', category: 'financial', required: true },
    { key: 'employment_letter', label: 'Employment verification letter', category: 'financial', required: true },
    { key: 'pay_stubs', label: 'Recent pay stubs (last 6 months)', category: 'financial' },
  ],
  pricing: { service_fee_cents: 9900, print_mail_fee_cents: 1995 },
  governmentFee: { label: 'USCIS I-864 filing fee', amount_cents: 0, source_note: 'Form I-864 itself has no separate USCIS filing fee — it is submitted with the underlying green card application.' },
}

export const ar11: ApplicationTypeSeed = {
  slug: 'change-of-address',
  form_code: 'AR-11',
  name: 'Change My Address',
  short_name: 'Change of Address',
  goal_categories: ['address'],
  edition_date: '2023-01-01',
  sort_order: 100,
  summary: 'Notify USCIS of your new address, which is legally required within 10 days of moving for most noncitizens.',
  who_its_for: 'Any noncitizen who has moved and needs to update USCIS with their current address.',
  eligibility_overview: 'This is a notification, not an eligibility-based application — nearly everyone who has moved needs to file it.',
  workflow_overview: 'Confirm your old and new address and we prepare your AR-11 confirmation and, if you have pending cases, a reminder to update each one individually.',
  sections: [
    {
      key: 'about_you',
      title: 'About You',
      questions: [
        ...nameQuestions('applicant', 'What is your full legal name?'),
        { key: 'alien_number', prompt: 'What is your USCIS "A-Number"?', type: 'text', required: false },
        { key: 'date_of_birth', prompt: 'What is your date of birth?', type: 'date', required: true },
      ],
    },
    {
      key: 'address_history',
      title: 'Address Change',
      questions: [
        { key: 'previous_address', prompt: 'What was your previous address?', type: 'address', required: true },
        { key: 'current_address', prompt: 'What is your new address?', type: 'address', required: true },
        { key: 'move_date', prompt: 'When did you move?', type: 'date', required: true },
        { key: 'has_pending_cases', prompt: 'Do you have any pending USCIS applications or petitions?', type: 'yes_no', required: true, help_text: 'AR-11 alone does not update the address on a pending case — each pending case may need its own address update.' },
      ],
    },
  ],
  documentRequirements: [],
  pricing: { service_fee_cents: 2900, print_mail_fee_cents: 995 },
  governmentFee: { label: 'USCIS AR-11 filing fee', amount_cents: 0, source_note: 'There is no government filing fee for Form AR-11.' },
}
