// Shape of the seed data consumed by supabase/seed/run.ts.
// This is intentionally decoupled from lib/supabase/types.ts (the runtime
// app types) — seed rows don't have ids yet, and use question_key strings
// for cross-references instead of foreign key uuids.

export type ConditionalRuleSeed = {
  question_key: string
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'is_true' | 'is_false'
  value?: string | string[]
}

export type AnswerOptionSeed = { value: string; label: string; help_text?: string }

export type QuestionSeed = {
  key: string
  prompt: string
  help_text?: string
  type:
    | 'text'
    | 'textarea'
    | 'date'
    | 'select'
    | 'radio_cards'
    | 'yes_no'
    | 'name'
    | 'address'
    | 'number'
    | 'email'
    | 'phone'
    | 'file'
  options?: AnswerOptionSeed[]
  required?: boolean
  placeholder?: string
  repeat_group?: string
  repeat_item_label?: string
  validation?: Record<string, unknown>
  show_if?: ConditionalRuleSeed[]
  is_eligibility_question?: boolean
  pdf_field?: string // human-readable "Part 2, Item 1.a" style reference used in field_map
}

export type SectionSeed = {
  key: string
  title: string
  description?: string
  icon?: string
  questions: QuestionSeed[]
}

export type ValidationRuleSeed = {
  key: string
  section_key: string
  description: string
  rule_type: 'date_sequence' | 'coverage_gap' | 'conflicting_answers' | 'required_group'
  config?: Record<string, unknown>
  severity_on_fail?: 'needs_attention' | 'potential_issue'
}

export type FaqSeed = { question: string; answer: string }
export type AssociatedFormSeed = { form_code: string; label: string; note?: string }

export type DocumentRequirementSeed = {
  key: string
  label: string
  category: 'identity' | 'immigration' | 'relationship' | 'financial' | 'other'
  description?: string
  required?: boolean
  show_if?: ConditionalRuleSeed[]
}

export type ApplicationTypeSeed = {
  slug: string
  form_code: string
  name: string
  short_name: string
  goal_categories: string[]
  summary: string
  who_its_for: string
  eligibility_overview: string
  workflow_overview: string
  sort_order: number
  edition_date: string
  cta_text?: string
  estimated_minutes?: number
  faqs?: FaqSeed[]
  associatedForms?: AssociatedFormSeed[]
  sections: SectionSeed[]
  validationRules?: ValidationRuleSeed[]
  documentRequirements: DocumentRequirementSeed[]
  pricing: {
    service_fee_cents: number
    promo_fee_cents?: number
    promo_active?: boolean
    print_mail_fee_cents?: number
  }
  governmentFee: {
    label: string
    amount_cents: number
    fee_waiver_available?: boolean
    source_note?: string
  }
}
