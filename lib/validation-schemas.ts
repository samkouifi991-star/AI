import { z } from 'zod'

// Shared input validation for API route handlers (zod). Every mutating
// route parses its body through one of these before touching the database.

export const saveAnswerSchema = z.object({
  questionKey: z.string().min(1).max(200),
  repeaterIndex: z.number().int().min(0).max(50).default(0),
  value: z.unknown(),
})

export const saveAnswersBatchSchema = z.object({
  answers: z.array(saveAnswerSchema).min(1).max(50),
})

export const documentUploadMetaSchema = z.object({
  applicationDocumentId: z.string().uuid(),
  filename: z.string().min(1).max(255),
  contentType: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
  sizeBytes: z.number().int().positive().max(25 * 1024 * 1024), // 25MB
})

export const translationRequestSchema = z.object({
  applicationDocumentId: z.string().uuid(),
  sourceLanguage: z.string().min(2).max(60),
  pageCount: z.number().int().min(1).max(100).default(1),
})

export const checkoutSchema = z.object({
  applicationId: z.string().uuid(),
  includePrintMail: z.boolean().default(false),
})

export const supportRequestSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  subject: z.string().min(1).max(300),
  message: z.string().min(1).max(5000),
})
