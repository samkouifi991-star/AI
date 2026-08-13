import type { ApplicationTypeSeed } from '../types'
import { nameQuestions, otherNamesQuestions, contactQuestions } from '../shared-questions'

export const i765: ApplicationTypeSeed = {
  slug: 'work-permit',
  form_code: 'I-765',
  name: 'Apply for or Renew a Work Permit',
  short_name: 'Work Permit (EAD)',
  goal_categories: ['work'],
  edition_date: '2024-03-01',
  sort_order: 30,
  cta_text: 'Start My I-765',
  estimated_minutes: 25,
  faqs: [
    {
      question: 'How long is a work permit valid?',
      answer: 'Validity periods vary by category, typically 1–5 years. We recommend filing a renewal several months before expiration to avoid a gap in work authorization.',
    },
    {
      question: 'Can I file this at the same time as another application?',
      answer: 'Many categories, like a pending green card application, allow you to file Form I-765 concurrently — we ask about this during eligibility screening.',
    },
  ],
  summary: 'Apply for or renew an Employment Authorization Document (EAD) so you can legally work in the United States.',
  who_its_for: 'Applicants with a pending green card application, certain visa holders, asylees, DACA recipients, and other eligible categories.',
  eligibility_overview: 'Eligibility depends on your current immigration category — for example, a pending I-485, asylum application, or specific visa status. We ask which category applies and tailor the questionnaire accordingly.',
  workflow_overview: 'Tell us your eligibility category, confirm your details, and we prepare your I-765 and a checklist matched to your category.',
  sections: [
    {
      key: 'eligibility',
      title: 'Eligibility Basics',
      questions: [
        {
          key: 'ead_category',
          prompt: 'Which situation best describes why you need a work permit?',
          type: 'radio_cards',
          required: true,
          is_eligibility_question: true,
          options: [
            { value: 'pending_i485', label: 'I have a pending green card application (I-485)' },
            { value: 'asylum_pending', label: 'I have a pending asylum application' },
            { value: 'daca', label: 'DACA renewal' },
            { value: 'dependent_visa', label: 'I hold a dependent visa status (e.g. H-4, L-2)' },
            { value: 'other', label: 'Another category' },
          ],
        },
        {
          key: 'is_renewal',
          prompt: 'Is this a renewal of a work permit you already have?',
          type: 'yes_no',
          required: true,
          is_eligibility_question: true,
        },
        {
          key: 'current_ead_expiration',
          prompt: 'When does/did your current work permit expire?',
          type: 'date',
          show_if: [{ question_key: 'is_renewal', operator: 'equals', value: 'yes' }],
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
        { key: 'gender', prompt: 'What is your gender?', type: 'select', required: true, options: [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }] },
        { key: 'alien_number', prompt: 'Do you have a USCIS "A-Number"?', type: 'text', required: false, placeholder: 'A-000000000' },
        { key: 'ssn', prompt: 'Do you have a Social Security number?', type: 'text', required: false },
      ],
    },
    { key: 'contact', title: 'Contact Information', questions: contactQuestions() },
    {
      key: 'immigration_history',
      title: 'Immigration History',
      questions: [
        { key: 'last_entry_date', prompt: 'When did you last enter the United States?', type: 'date', required: true },
        { key: 'current_visa_status', prompt: 'What is your current immigration status?', type: 'text', required: true },
        { key: 'i94_number', prompt: 'What is your I-94 number?', type: 'text', required: false },
      ],
    },
  ],
  documentRequirements: [
    { key: 'passport_photo_page', label: 'Passport photo page', category: 'identity', required: true },
    { key: 'i94', label: 'Form I-94', category: 'immigration', required: true },
    { key: 'prior_ead', label: 'Copy of previous work permit (front and back)', category: 'immigration', show_if: [{ question_key: 'is_renewal', operator: 'equals', value: 'yes' }] },
    { key: 'i485_receipt', label: 'I-485 receipt notice', category: 'immigration', show_if: [{ question_key: 'ead_category', operator: 'equals', value: 'pending_i485' }] },
    { key: 'two_photos', label: 'Two passport-style photos', category: 'identity', required: true },
  ],
  pricing: { service_fee_cents: 14900, print_mail_fee_cents: 1995 },
  governmentFee: { label: 'USCIS I-765 filing fee', amount_cents: 52000, fee_waiver_available: true, source_note: 'Some categories file this fee-free alongside I-485 — confirm current USCIS fee rules for your category before filing.' },
}
