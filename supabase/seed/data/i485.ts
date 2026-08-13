import type { ApplicationTypeSeed } from '../types'
import {
  nameQuestions,
  otherNamesQuestions,
  contactQuestions,
  addressHistoryQuestions,
  employmentHistoryQuestions,
  travelHistoryQuestions,
  maritalQuestions,
  criminalSecurityQuestions,
} from '../shared-questions'

export const i485: ApplicationTypeSeed = {
  slug: 'adjustment-of-status',
  form_code: 'I-485',
  name: 'Apply for a Green Card From Inside the United States',
  short_name: 'Green Card — Adjustment of Status',
  goal_categories: ['green-card'],
  edition_date: '2024-01-01',
  sort_order: 20,
  cta_text: 'Start My I-485',
  estimated_minutes: 50,
  faqs: [
    {
      question: 'Do I need an underlying petition before I can file this?',
      answer:
        'Almost always yes — a family petition (I-130), employment petition (I-140), or another qualifying category that makes a visa immediately available to you. We ask about this during eligibility screening.',
    },
    {
      question: 'Can I work while my I-485 is pending?',
      answer:
        'Not automatically — you generally need to separately apply for a work permit (Form I-765), which many applicants file at the same time as their I-485.',
    },
  ],
  summary:
    'Apply for lawful permanent resident status ("green card") from inside the United States, based on a family, employment, or other qualifying category.',
  who_its_for:
    'People who are currently inside the United States and have an approved or concurrently-filed immigrant petition (such as an I-130 or I-140) making a visa immediately available to them.',
  eligibility_overview:
    'You generally need an underlying petition, a visa immediately available under the applicable category, lawful entry into the U.S. (with some exceptions), and admissibility (no disqualifying health, criminal, or immigration-violation issues).',
  workflow_overview:
    'We collect your background, immigration history, and sponsor information, then prepare your I-485 with the required supporting schedules and your personalized document checklist.',
  sections: [
    {
      key: 'eligibility',
      title: 'Eligibility Basics',
      questions: [
        {
          key: 'current_location',
          prompt: 'Are you currently inside the United States?',
          type: 'yes_no',
          required: true,
          is_eligibility_question: true,
          help_text: 'Adjustment of status (Form I-485) is filed from inside the U.S. If you are outside the U.S., you may need consular processing instead.',
        },
        {
          key: 'underlying_petition',
          prompt: 'What is the basis for your green card?',
          type: 'radio_cards',
          required: true,
          is_eligibility_question: true,
          options: [
            { value: 'immediate_relative', label: 'Immediate relative of a U.S. citizen (spouse, parent, unmarried child under 21)' },
            { value: 'family_preference', label: 'Other family relationship' },
            { value: 'employment', label: 'Employment-based petition' },
            { value: 'asylee_refugee', label: 'Asylee or refugee status (after 1 year)' },
            { value: 'other', label: 'Another basis' },
          ],
        },
        {
          key: 'petition_status',
          prompt: "What is the status of the underlying petition (e.g. Form I-130 or I-140)?",
          type: 'select',
          required: true,
          is_eligibility_question: true,
          options: [
            { value: 'approved', label: 'Already approved' },
            { value: 'filing_concurrently', label: 'Filing at the same time as this application' },
            { value: 'pending', label: 'Already filed and pending' },
            { value: 'not_filed', label: 'Not filed yet' },
          ],
        },
        {
          key: 'last_entry_lawful',
          prompt: 'Did you last enter the United States with inspection (e.g. through a port of entry with a visa or ESTA)?',
          type: 'yes_no',
          required: true,
          is_eligibility_question: true,
        },
      ],
    },
    {
      key: 'about_you',
      title: 'About You',
      questions: [
        ...nameQuestions('applicant', 'What is your full legal name?'),
        ...otherNamesQuestions('applicant'),
        { key: 'date_of_birth', prompt: 'What is your date of birth?', type: 'date', required: true },
        { key: 'country_of_birth', prompt: 'What country were you born in?', type: 'text', required: true },
        { key: 'country_of_citizenship', prompt: 'What country are you a citizen of?', type: 'text', required: true },
        { key: 'alien_number', prompt: 'Do you have a USCIS "A-Number"?', type: 'text', required: false, placeholder: 'A-000000000' },
        { key: 'i94_number', prompt: 'What is your I-94 arrival/departure number?', type: 'text', required: false, help_text: 'Retrieve this from the CBP I-94 website if you do not have it saved.' },
      ],
    },
    { key: 'contact', title: 'Contact Information', questions: contactQuestions() },
    { key: 'address_history', title: 'Address History', questions: addressHistoryQuestions() },
    { key: 'employment_history', title: 'Employment History', questions: employmentHistoryQuestions() },
    {
      key: 'marriage',
      title: 'Marriage & Family',
      questions: [
        ...maritalQuestions(),
        {
          key: 'sponsor_relationship',
          prompt: 'What is your relationship to the person sponsoring you?',
          type: 'select',
          required: true,
          options: [
            { value: 'spouse', label: 'Spouse' },
            { value: 'parent', label: 'Parent' },
            { value: 'child', label: 'Child' },
            { value: 'sibling', label: 'Sibling' },
            { value: 'employer', label: 'Employer' },
          ],
        },
      ],
    },
    { key: 'travel', title: 'Travel History', questions: travelHistoryQuestions() },
    {
      key: 'immigration_history',
      title: 'Immigration History',
      questions: [
        { key: 'last_entry_date', prompt: 'When did you last enter the United States?', type: 'date', required: true },
        { key: 'last_entry_place', prompt: 'Where did you enter (city, and port of entry if known)?', type: 'text', required: true },
        { key: 'current_visa_status', prompt: 'What is your current nonimmigrant status, if any?', type: 'text', required: false },
        { key: 'status_expiration', prompt: 'When does/did your current status expire?', type: 'date', required: false },
        { key: 'previously_worked_without_authorization', prompt: 'Have you ever worked in the U.S. without authorization?', type: 'yes_no', required: true },
      ],
    },
    { key: 'criminal_security', title: 'Criminal & Security Questions', questions: criminalSecurityQuestions() },
  ],
  validationRules: [
    {
      key: 'i485_petition_required',
      section_key: 'eligibility',
      description: 'Flags cases with no approved or concurrently-filed petition, which usually cannot proceed yet.',
      rule_type: 'conflicting_answers',
      config: { if: { question_key: 'petition_status', value: 'not_filed' } },
      severity_on_fail: 'potential_issue',
    },
    {
      key: 'i485_entry_review',
      section_key: 'eligibility',
      description: 'Entries without inspection often require a different process or a waiver.',
      rule_type: 'conflicting_answers',
      config: { if: { question_key: 'last_entry_lawful', value: 'no' } },
      severity_on_fail: 'potential_issue',
    },
  ],
  documentRequirements: [
    { key: 'birth_certificate', label: 'Birth certificate', category: 'identity', required: true },
    { key: 'passport', label: 'Valid passport', category: 'identity', required: true },
    { key: 'i94', label: 'Form I-94 arrival/departure record', category: 'immigration', required: true },
    { key: 'medical_exam', label: 'Form I-693 medical examination', category: 'immigration', required: true },
    { key: 'marriage_cert', label: 'Marriage certificate', category: 'relationship', show_if: [{ question_key: 'marital_status', operator: 'equals', value: 'married' }] },
    { key: 'affidavit_of_support', label: 'Affidavit of Support (Form I-864) from your sponsor', category: 'financial', show_if: [{ question_key: 'underlying_petition', operator: 'in', value: ['immediate_relative', 'family_preference'] }] },
    { key: 'two_photos', label: 'Two passport-style photos', category: 'identity', required: true },
  ],
  pricing: { service_fee_cents: 34900, print_mail_fee_cents: 1995 },
  governmentFee: { label: 'USCIS I-485 filing fee (includes biometrics)', amount_cents: 113000, fee_waiver_available: true, source_note: 'Confirm the current fee on the USCIS Form I-485 fee page before filing — fees and biometric requirements change periodically.' },
}
