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
  priorApplicationsQuestions,
} from '../shared-questions'

export const n400: ApplicationTypeSeed = {
  slug: 'citizenship',
  form_code: 'N-400',
  name: 'Apply for U.S. Citizenship',
  short_name: 'Citizenship (Naturalization)',
  goal_categories: ['citizenship'],
  edition_date: '2024-04-01',
  sort_order: 10,
  cta_text: 'Start My N-400',
  estimated_minutes: 45,
  faqs: [
    {
      question: 'Do I need a lawyer to apply for citizenship?',
      answer:
        'No. Most naturalization cases are straightforward enough to prepare yourself with guided help. If your background includes prior removal proceedings, criminal history, or long absences from the U.S., consider a consultation with an immigration attorney first.',
    },
    {
      question: 'Will I need to take the English and civics test?',
      answer:
        'Most applicants do, with exemptions and modifications available based on age, length of permanent residence, or disability. Your local USCIS field office will schedule this as part of your naturalization interview.',
    },
  ],
  summary:
    'Apply to become a U.S. citizen through naturalization, including the right to vote, hold a U.S. passport, and pass citizenship to your children.',
  who_its_for:
    'Green card holders who meet the residence, physical presence, and good moral character requirements to naturalize — most commonly after 5 years as a permanent resident (or 3 years if married to a U.S. citizen).',
  eligibility_overview:
    'Generally you need continuous residence, enough physical presence in the U.S., good moral character, and basic English/civics knowledge, though some requirements are waived or modified for military service, age, or disability.',
  workflow_overview:
    'Answer a guided questionnaire covering your background, then Smart USA Visa prepares your N-400 and a checklist of supporting documents for you to file with USCIS and bring to your interview.',
  sections: [
    {
      key: 'eligibility',
      title: 'Eligibility Basics',
      description: 'A few quick questions to confirm the naturalization pathway that fits you.',
      questions: [
        {
          key: 'lpr_basis',
          prompt: 'How did you become a permanent resident?',
          type: 'radio_cards',
          required: true,
          is_eligibility_question: true,
          options: [
            { value: 'family', label: 'Through a family member' },
            { value: 'employment', label: 'Through an employer' },
            { value: 'asylum_refugee', label: 'As an asylee or refugee' },
            { value: 'other', label: 'Another way' },
          ],
        },
        {
          key: 'lpr_date',
          prompt: 'When did you become a permanent resident?',
          help_text: 'This is the "resident since" date on your green card.',
          type: 'date',
          required: true,
          is_eligibility_question: true,
        },
        {
          key: 'eligibility_basis',
          prompt: 'Which describes your situation?',
          type: 'radio_cards',
          required: true,
          is_eligibility_question: true,
          options: [
            { value: 'five_year', label: 'I have been a permanent resident for 5+ years' },
            { value: 'three_year_marriage', label: 'I have been a permanent resident for 3+ years and am married to a U.S. citizen' },
            { value: 'military', label: 'I am applying based on U.S. military service' },
            { value: 'unsure', label: "I'm not sure which applies to me" },
          ],
        },
        {
          key: 'extended_absence',
          prompt: 'Have you spent 6 months or more outside the United States in a single trip during the relevant period?',
          type: 'yes_no',
          required: true,
          is_eligibility_question: true,
          help_text: 'An extended absence can affect continuous residence, but often can be explained — it does not automatically disqualify you.',
        },
      ],
    },
    {
      key: 'about_you',
      title: 'About You',
      questions: [
        ...nameQuestions('applicant', 'What is your full legal name?'),
        ...otherNamesQuestions('applicant'),
        { key: 'date_of_birth', prompt: 'What is your date of birth?', type: 'date', required: true, pdf_field: 'Part 1, Item 3 — Date of Birth' },
        { key: 'country_of_birth', prompt: 'What country were you born in?', type: 'text', required: true },
        { key: 'country_of_citizenship', prompt: 'What country are you currently a citizen of?', type: 'text', required: true },
        { key: 'gender', prompt: 'What is your gender, as it should appear on your certificate?', type: 'select', required: true, options: [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }] },
        { key: 'alien_number', prompt: 'What is your USCIS "A-Number"?', help_text: 'Found on your green card, starting with "A" followed by 7-9 digits.', type: 'text', required: true, placeholder: 'A-000000000' },
        { key: 'ssn', prompt: 'What is your Social Security number?', type: 'text', required: false, help_text: 'Optional, but helps USCIS match your records.' },
      ],
    },
    {
      key: 'contact',
      title: 'Contact Information',
      questions: contactQuestions(),
    },
    {
      key: 'address_history',
      title: 'Address History',
      description: 'USCIS wants your residence history for the last 5 years.',
      questions: addressHistoryQuestions(),
    },
    {
      key: 'employment_history',
      title: 'Employment History',
      questions: employmentHistoryQuestions(),
    },
    {
      key: 'marriage',
      title: 'Marriage & Family',
      questions: [
        ...maritalQuestions(),
        { key: 'number_of_children', prompt: 'How many children do you have?', type: 'number', required: true },
      ],
    },
    {
      key: 'travel',
      title: 'Travel History',
      questions: travelHistoryQuestions(),
    },
    {
      key: 'previous_applications',
      title: 'Previous Applications',
      questions: priorApplicationsQuestions(),
    },
    {
      key: 'criminal_security',
      title: 'Criminal & Security Questions',
      description: 'These questions come directly from Part 12 of Form N-400. Answer honestly — Smart USA Visa cannot advise you on how to answer, and a "yes" does not automatically disqualify you.',
      questions: [
        ...criminalSecurityQuestions(),
        { key: 'ever_deported', prompt: 'Has anyone ever filed removal, exclusion, or deportation proceedings against you?', type: 'yes_no', required: true },
        { key: 'failed_to_file_taxes', prompt: 'Have you ever failed to file a required federal, state, or local tax return since becoming a permanent resident?', type: 'yes_no', required: true },
      ],
    },
  ],
  validationRules: [
    {
      key: 'n400_five_year_residence',
      section_key: 'eligibility',
      description: 'Confirms enough time has passed since becoming a permanent resident for the selected eligibility basis.',
      rule_type: 'date_sequence',
      config: { date_question: 'lpr_date', basis_question: 'eligibility_basis', min_years: { five_year: 5, three_year_marriage: 3 } },
      severity_on_fail: 'potential_issue',
    },
    {
      key: 'n400_address_gap',
      section_key: 'address_history',
      description: 'Checks the 5-year address history has no unexplained gaps.',
      rule_type: 'coverage_gap',
      config: { from_question: 'address_from_date', to_question: 'address_to_date', repeat_group: 'address_history', years: 5 },
    },
  ],
  documentRequirements: [
    { key: 'green_card', label: 'Permanent Resident Card (front and back)', category: 'immigration', required: true },
    { key: 'passport', label: 'Current or most recent passport', category: 'identity', required: true },
    { key: 'marriage_cert', label: 'Marriage certificate', category: 'relationship', show_if: [{ question_key: 'marital_status', operator: 'equals', value: 'married' }] },
    { key: 'divorce_decree', label: 'Final divorce decree from prior marriage', category: 'relationship', show_if: [{ question_key: 'prior_marriages', operator: 'equals', value: 'yes' }] },
    { key: 'tax_transcripts', label: 'IRS tax transcripts (last 5 years)', category: 'financial', description: 'Or 3 years if applying under the 3-year marriage-based rule.' },
    { key: 'arrest_records', label: 'Certified court disposition records', category: 'other', show_if: [{ question_key: 'ever_arrested', operator: 'equals', value: 'yes' }] },
    { key: 'two_photos', label: 'Two passport-style photos', category: 'identity', required: false, description: 'Only required if you live outside the U.S.' },
  ],
  pricing: { service_fee_cents: 27900, print_mail_fee_cents: 1995 },
  governmentFee: { label: 'USCIS N-400 filing fee', amount_cents: 71000, fee_waiver_available: true, source_note: 'Confirm the current fee on the USCIS Form N-400 fee page before filing — government fees change periodically.' },
}
