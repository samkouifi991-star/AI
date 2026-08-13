import type { QuestionSeed } from './types'

// Reusable question groups shared across multiple application types, so the
// wording stays consistent everywhere "what is your name" or "where do you
// live" is asked. Each function returns fresh objects (no shared references)
// so callers can safely splice a `show_if` onto one instance without
// affecting another.

export function nameQuestions(prefix: string, promptPrefix: string): QuestionSeed[] {
  return [
    {
      key: `${prefix}_name`,
      prompt: promptPrefix,
      type: 'name',
      required: true,
      help_text: 'Enter the name exactly as it appears on your current government-issued ID.',
      pdf_field: 'Full legal name',
    },
  ]
}

export function otherNamesQuestions(prefix = 'applicant'): QuestionSeed[] {
  return [
    {
      key: `${prefix}_used_other_names`,
      prompt: 'Have you ever used another name?',
      help_text: 'Include maiden names, nicknames used on official documents, and names before any legal change.',
      type: 'yes_no',
      required: true,
    },
    {
      key: `${prefix}_other_name`,
      prompt: "What was the other name you used?",
      type: 'name',
      required: true,
      repeat_group: `${prefix}_other_names`,
      repeat_item_label: 'Another name',
      show_if: [{ question_key: `${prefix}_used_other_names`, operator: 'equals', value: 'yes' }],
      pdf_field: 'Other names used',
    },
  ]
}

export function contactQuestions(): QuestionSeed[] {
  return [
    {
      key: 'current_address',
      prompt: 'What is your current home address?',
      type: 'address',
      required: true,
      help_text: "Use your physical address, not a P.O. box.",
      pdf_field: 'Physical Address',
    },
    {
      key: 'mailing_same_as_home',
      prompt: 'Is your mailing address the same as your home address?',
      type: 'yes_no',
      required: true,
    },
    {
      key: 'mailing_address',
      prompt: 'What is your mailing address?',
      type: 'address',
      required: true,
      show_if: [{ question_key: 'mailing_same_as_home', operator: 'equals', value: 'no' }],
      pdf_field: 'Mailing Address',
    },
    {
      key: 'phone_number',
      prompt: 'What is the best phone number to reach you?',
      type: 'phone',
      required: true,
      pdf_field: 'Daytime Telephone Number',
    },
    {
      key: 'email_address',
      prompt: 'What is your email address?',
      type: 'email',
      required: true,
      help_text: "We'll send filing updates here — this is not shared with USCIS unless the form requires it.",
      pdf_field: 'Email Address',
    },
  ]
}

export function addressHistoryQuestions(): QuestionSeed[] {
  return [
    {
      key: 'address_five_years',
      prompt: 'List every address where you have lived during the last 5 years.',
      help_text: 'Start with your current address. Add another entry for each place you lived, with no gaps.',
      type: 'address',
      required: true,
      repeat_group: 'address_history',
      repeat_item_label: 'Address',
    },
    {
      key: 'address_from_date',
      prompt: 'From what date did you live at this address?',
      type: 'date',
      required: true,
      repeat_group: 'address_history',
    },
    {
      key: 'address_to_date',
      prompt: 'Until what date did you live at this address? (Leave blank if current)',
      type: 'date',
      repeat_group: 'address_history',
    },
  ]
}

export function employmentHistoryQuestions(): QuestionSeed[] {
  return [
    {
      key: 'currently_employed',
      prompt: 'Are you currently employed or self-employed?',
      type: 'yes_no',
      required: true,
    },
    {
      key: 'employer_name',
      prompt: 'What is the name of your employer?',
      type: 'text',
      required: true,
      repeat_group: 'employment_history',
      repeat_item_label: 'Employer',
      show_if: [{ question_key: 'currently_employed', operator: 'equals', value: 'yes' }],
    },
    {
      key: 'employer_address',
      prompt: "What is your employer's address?",
      type: 'address',
      required: true,
      repeat_group: 'employment_history',
      show_if: [{ question_key: 'currently_employed', operator: 'equals', value: 'yes' }],
    },
    {
      key: 'employment_from_date',
      prompt: 'When did you start this job?',
      type: 'date',
      required: true,
      repeat_group: 'employment_history',
    },
    {
      key: 'occupation',
      prompt: 'What is your occupation or job title?',
      type: 'text',
      required: true,
      repeat_group: 'employment_history',
    },
  ]
}

export function travelHistoryQuestions(): QuestionSeed[] {
  return [
    {
      key: 'trips_outside_us',
      prompt: 'Have you taken any trips outside the United States in the relevant period?',
      type: 'yes_no',
      required: true,
    },
    {
      key: 'trip_departure_date',
      prompt: 'When did you leave the United States?',
      type: 'date',
      required: true,
      repeat_group: 'trips',
      repeat_item_label: 'Trip',
      show_if: [{ question_key: 'trips_outside_us', operator: 'equals', value: 'yes' }],
    },
    {
      key: 'trip_return_date',
      prompt: 'When did you return to the United States?',
      type: 'date',
      required: true,
      repeat_group: 'trips',
      show_if: [{ question_key: 'trips_outside_us', operator: 'equals', value: 'yes' }],
    },
    {
      key: 'trip_destination',
      prompt: 'What countries did you visit on this trip?',
      type: 'text',
      required: true,
      repeat_group: 'trips',
      show_if: [{ question_key: 'trips_outside_us', operator: 'equals', value: 'yes' }],
    },
    {
      key: 'trip_duration_six_months',
      prompt: 'Was any single trip 6 months or longer?',
      type: 'yes_no',
      required: true,
      show_if: [{ question_key: 'trips_outside_us', operator: 'equals', value: 'yes' }],
      help_text: 'Extended absences can affect continuous residence — this alone does not disqualify you.',
    },
  ]
}

export function maritalQuestions(): QuestionSeed[] {
  return [
    {
      key: 'marital_status',
      prompt: 'What is your current marital status?',
      type: 'select',
      required: true,
      options: [
        { value: 'single', label: 'Single, never married' },
        { value: 'married', label: 'Married' },
        { value: 'divorced', label: 'Divorced' },
        { value: 'widowed', label: 'Widowed' },
        { value: 'separated', label: 'Separated' },
      ],
      pdf_field: 'Marital Status',
    },
    {
      key: 'spouse_name',
      prompt: "What is your spouse's full legal name?",
      type: 'name',
      required: true,
      show_if: [{ question_key: 'marital_status', operator: 'equals', value: 'married' }],
    },
    {
      key: 'marriage_date',
      prompt: 'When did you get married?',
      type: 'date',
      required: true,
      show_if: [{ question_key: 'marital_status', operator: 'equals', value: 'married' }],
    },
    {
      key: 'prior_marriages',
      prompt: 'Have you or your spouse been married before?',
      type: 'yes_no',
      required: true,
      show_if: [{ question_key: 'marital_status', operator: 'equals', value: 'married' }],
    },
    {
      key: 'prior_marriage_end_how',
      prompt: 'How did the prior marriage end?',
      type: 'select',
      required: true,
      options: [
        { value: 'divorce', label: 'Divorce' },
        { value: 'death', label: 'Death of spouse' },
        { value: 'annulment', label: 'Annulment' },
      ],
      repeat_group: 'prior_marriages',
      repeat_item_label: 'Prior marriage',
      show_if: [{ question_key: 'prior_marriages', operator: 'equals', value: 'yes' }],
    },
  ]
}

export function criminalSecurityQuestions(): QuestionSeed[] {
  return [
    {
      key: 'ever_arrested',
      prompt: 'Have you ever been arrested, cited, or detained by any law enforcement officer?',
      type: 'yes_no',
      required: true,
      help_text: 'Answer yes even if the case was dismissed, sealed, or occurred outside the United States.',
    },
    {
      key: 'ever_arrested_explain',
      prompt: 'Please explain the circumstances.',
      type: 'textarea',
      required: true,
      show_if: [{ question_key: 'ever_arrested', operator: 'equals', value: 'yes' }],
      help_text: 'This alone does not mean you are ineligible. Provide dates, location, and the outcome.',
    },
    {
      key: 'affiliated_organizations',
      prompt: 'Have you ever been a member of or associated with any organization, association, fund, or party?',
      type: 'yes_no',
      required: true,
    },
    {
      key: 'affiliated_organizations_explain',
      prompt: 'List the organization(s) and your role.',
      type: 'textarea',
      required: true,
      show_if: [{ question_key: 'affiliated_organizations', operator: 'equals', value: 'yes' }],
    },
  ]
}

export function priorApplicationsQuestions(): QuestionSeed[] {
  return [
    {
      key: 'prior_uscis_applications',
      prompt: 'Have you previously filed any application or petition with USCIS?',
      type: 'yes_no',
      required: true,
    },
    {
      key: 'prior_application_type',
      prompt: 'What was the prior application or petition?',
      type: 'text',
      required: true,
      repeat_group: 'prior_applications',
      repeat_item_label: 'Prior filing',
      show_if: [{ question_key: 'prior_uscis_applications', operator: 'equals', value: 'yes' }],
    },
    {
      key: 'prior_application_result',
      prompt: 'What was the result?',
      type: 'select',
      required: true,
      options: [
        { value: 'approved', label: 'Approved' },
        { value: 'denied', label: 'Denied' },
        { value: 'pending', label: 'Still pending' },
        { value: 'withdrawn', label: 'Withdrawn' },
      ],
      repeat_group: 'prior_applications',
      show_if: [{ question_key: 'prior_uscis_applications', operator: 'equals', value: 'yes' }],
    },
  ]
}
