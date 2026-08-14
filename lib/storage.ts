import { createAdminClient } from '@/lib/supabase/admin'

export const DOCUMENTS_BUCKET = 'application-documents'
export const PACKAGES_BUCKET = 'generated-packages'

// Objects are namespaced `{applicationId}/...` so the storage RLS policies
// in 0003_storage.sql (and every server-side ownership check in this file's
// callers) can authorize by parsing the first path segment.
export function documentStoragePath(applicationId: string, applicationDocumentId: string, filename: string) {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  return `${applicationId}/${applicationDocumentId}-${Date.now()}-${safeName}`
}

export function packageStoragePath(applicationId: string, filename: string) {
  return `${applicationId}/${filename}`
}

export async function uploadToBucket(bucket: string, path: string, file: ArrayBuffer | Uint8Array, contentType: string) {
  const admin = createAdminClient()
  const { error } = await admin.storage.from(bucket).upload(path, file, { contentType, upsert: true })
  if (error) throw error
  return path
}

export async function downloadFromBucket(bucket: string, path: string): Promise<Uint8Array> {
  const admin = createAdminClient()
  const { data, error } = await admin.storage.from(bucket).download(path)
  if (error || !data) throw error ?? new Error('Could not download file')
  return new Uint8Array(await data.arrayBuffer())
}

export async function getSignedUrl(bucket: string, path: string, expiresInSeconds = 300) {
  const admin = createAdminClient()
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, expiresInSeconds)
  if (error || !data) throw error ?? new Error('Could not create signed URL')
  return data.signedUrl
}
