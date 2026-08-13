import type { ApplicationTypeSeed } from '../types'
import { nameQuestions, otherNamesQuestions, contactQuestions, maritalQuestions } from '../shared-questions'

export const i130: ApplicationTypeSeed = {
  slug: 'family-green-card-petition',
  form_code: 'I-130',
  name: 'Help a Family Member Get a Green Card',
  short_name: 'Family Petition',
  goal_categories: ['family'],
  edition_date: '2023-11-01',
  sort_order: 40,
  summary: 'File a petition as a U.S. citizen or permanent resident to establish a qualifying family relationship for a relative seeking a green card.',
  who_its_for: 'U.S. citizens and lawful permanent residents petitioning for a spouse, parent, child, or sibling.',
  eligibility_overview: 'You must be a U.S. citizen or permanent resident and prove a qualifying family relationship with documentary evidence.',
  workflow_overview: 'We collect your information and your relative\'s information, then prepare your I-130 petition and a checklist of relationship evidence.',
  sections: [
    {
      key: 'eligibility',
      title: 'Eligibility Basics',
      questions: [
        {
          key: 'petitioner_status',
          prompt: 'What is your immigration status?',
          type: 'radio_cards',
          required: true,
          is_eligibility_question: true,
          options: [
            { value: 'us_citizen', label: 'U.S. citizen' },
            { value: 'permanent_resident', label: 'Lawful permanent resident' },
          ],
        },
        {
          key: 'relationship_to_beneficiary',
          prompt: 'What is your relationship to the family member you are sponsoring?',
          type: 'radio_cards',
          required: true,
          is_eligibility_question: true,
          options: [
            { value: 'spouse', label: 'Spouse' },
            { value: 'parent', label: 'Parent' },
            { value: 'child', label: 'Child' },
            { value: 'sibling', label: 'Sibling' },
          ],
        },
        {
          key: 'beneficiary_location',
          prompt: 'Is your relative currently inside or outside the United States?',
          type: 'radio_cards',
          required: true,
          is_eligibility_question: true,
          options: [
            { value: 'inside', label: 'Inside the United States' },
            { value: 'outside', label: 'Outside the United States' },
          ],
        },
      ],
    },
    { key: 'about_you', title: 'About You (Petitioner)', questions: [...nameQuestions('petitioner', 'What is your full legal name?'), ...otherNamesQuestions('petitioner'), { key: 'petitioner_dob', prompt: 'What is your date of birth?', type: 'date', required: true }] },
    { key: 'contact', title: 'Your Contact Information', questions: contactQuestions() },
    {
      key: 'family',
      title: 'Your Relative (Beneficiary)',
      questions: [
        ...nameQuestions('beneficiary', "What is your relative's full legal name?"),
        { key: 'beneficiary_dob', prompt: "What is your relative's date of birth?", type: 'date', required: true },
        { key: 'beneficiary_country_of_birth', prompt: 'What country was your relative born in?', type: 'text', required: true },
        { key: 'beneficiary_address', prompt: "What is your relative's current address?", type: 'address', required: true },
        { key: 'relationship_began', prompt: 'When did this relationship begin (marriage date, birth date, etc.)?', type: 'date', required: true },
      ],
    },
    { key: 'marriage', title: 'Marriage (if applicable)', questions: maritalQuestions() },
  ],
  documentRequirements: [
    { key: 'proof_of_status', label: 'Proof of your U.S. citizenship or permanent resident status', category: 'immigration', required: true },
    { key: 'relationship_evidence', label: 'Evidence of the family relationship (birth/marriage certificate)', category: 'relationship', required: true },
    { key: 'passport_photo', label: "Relative's passport-style photo", category: 'identity', required: true },
    { key: 'divorce_decree', label: 'Proof any prior marriages ended', category: 'relationship', show_if: [{ question_key: 'prior_marriages', operator: 'equals', value: 'yes' }] },
  ],
  pricing: { service_fee_cents: 24900, print_mail_fee_cents: 1995 },
  governmentFee: { label: 'USCIS I-130 filing fee', amount_cents: 67500, source_note: 'Confirm the current fee on the USCIS Form I-130 fee page before filing.' },
}
