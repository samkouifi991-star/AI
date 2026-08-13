// Hand-maintained types for the tables this app reads/writes.
// Mirrors supabase/migrations/0001_core_schema.sql. Regenerate with
// `supabase gen types typescript` once a live project exists and keep this
// file as the source of truth for the shapes the app code depends on.

export type UserRole = 'customer' | 'admin' | 'support' | 'translator'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  created_at: string
}

export type QuestionType =
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

export interface ApplicationType {
  id: string
  slug: string
  form_code: string
  name: string
  short_name: string
  goal_categories: string[]
  summary: string
  who_its_for: string
  eligibility_overview: string
  workflow_overview: string
  is_active: boolean
  sort_order: number
}

export interface FormVersion {
  id: string
  application_type_id: string
  edition_date: string
  is_current: boolean
  pdf_storage_path: string | null
  field_map: Record<string, string> // question_key -> pdf field name
}

export interface Section {
  id: string
  application_type_id: string
  key: string
  title: string
  description: string | null
  sort_order: number
  icon: string | null
}

export interface AnswerOption {
  value: string
  label: string
  help_text?: string
}

export interface ConditionalRule {
  question_key: string
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'is_true' | 'is_false'
  value?: string | string[]
}

export interface Question {
  id: string
  section_id: string
  key: string
  prompt: string
  help_text: string | null
  type: QuestionType
  options: AnswerOption[] | null
  required: boolean
  sort_order: number
  placeholder: string | null
  repeat_group: string | null
  repeat_item_label: string | null
  validation: Record<string, unknown> | null
  show_if: ConditionalRule[] | null // AND of all rules
  is_eligibility_question: boolean
}

export type ApplicationStatus =
  | 'eligibility'
  | 'in_progress'
  | 'ready_for_review'
  | 'paid'
  | 'package_ready'
  | 'archived'

export interface Application {
  id: string
  user_id: string | null
  session_token: string | null
  application_type_id: string
  status: ApplicationStatus
  eligibility_flag: 'clear' | 'needs_review' | null
  progress_percent: number
  created_at: string
  updated_at: string
}

export interface Answer {
  id: string
  application_id: string
  question_key: string
  repeater_index: number
  value: unknown
  updated_at: string
}

export type DocumentCategory = 'identity' | 'immigration' | 'relationship' | 'financial' | 'other'
export type ApplicationDocumentStatus = 'missing' | 'uploaded' | 'accepted' | 'rejected'

export interface DocumentRequirement {
  id: string
  application_type_id: string
  key: string
  label: string
  category: DocumentCategory
  description: string | null
  required: boolean
  show_if: ConditionalRule[] | null
}

export interface ApplicationDocument {
  id: string
  application_id: string
  document_requirement_id: string | null
  custom_label: string | null
  status: ApplicationDocumentStatus
  storage_path: string | null
  original_filename: string | null
  needs_translation: boolean | null
  translation_id: string | null
  uploaded_at: string | null
}

export type TranslationStatus =
  | 'requested'
  | 'awaiting_payment'
  | 'in_progress'
  | 'completed'
  | 'delivered'

export interface Translation {
  id: string
  application_document_id: string
  source_language: string
  price_cents: number
  status: TranslationStatus
  provider_name: string | null
  translated_storage_path: string | null
  certification_storage_path: string | null
  created_at: string
}

export interface GovernmentFee {
  id: string
  application_type_id: string
  label: string
  amount_cents: number
  fee_waiver_available: boolean
  effective_date: string
  source_note: string | null
}

export interface Pricing {
  id: string
  application_type_id: string
  service_fee_cents: number
  promo_fee_cents: number | null
  promo_active: boolean
  print_mail_fee_cents: number
}

export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded'

export interface Payment {
  id: string
  application_id: string
  stripe_checkout_session_id: string | null
  stripe_payment_intent_id: string | null
  amount_cents: number
  status: PaymentStatus
  line_items: { label: string; amount_cents: number }[]
  created_at: string
}

export interface GeneratedPackage {
  id: string
  application_id: string
  forms_storage_path: string | null
  instructions_storage_path: string | null
  checklist_storage_path: string | null
  cover_sheet_storage_path: string | null
  bundle_storage_path: string | null
  generated_at: string
}

export type ValidationSeverity = 'complete' | 'needs_attention' | 'potential_issue'

export interface ValidationResult {
  section_key: string
  section_title: string
  severity: ValidationSeverity
  messages: { question_key?: string; message: string }[]
}
