// Minimal, dependency-free rate limiter. Uses Upstash Redis when
// UPSTASH_REDIS_REST_URL/TOKEN are configured (safe for multi-instance
// deploys); otherwise falls back to an in-memory sliding window, which is
// fine for a single Node instance but will not coordinate across multiple
// server instances — configure Upstash before scaling horizontally.

const memoryBuckets = new Map<string, { count: number; resetAt: number }>()

export type RateLimitResult = { allowed: boolean; remaining: number }

export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN

  if (upstashUrl && upstashToken) {
    const res = await fetch(`${upstashUrl}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${upstashToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['INCR', key],
        ['EXPIRE', key, String(windowSeconds), 'NX'],
      ]),
    })
    const [incrResult] = (await res.json()) as [{ result: number }]
    const count = incrResult.result
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) }
  }

  const now = Date.now()
  const bucket = memoryBuckets.get(key)
  if (!bucket || bucket.resetAt < now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 })
    return { allowed: true, remaining: limit - 1 }
  }
  bucket.count += 1
  return { allowed: bucket.count <= limit, remaining: Math.max(0, limit - bucket.count) }
}

export function clientKeyFromRequest(request: Request, suffix: string): string {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  return `ratelimit:${suffix}:${ip}`
}
