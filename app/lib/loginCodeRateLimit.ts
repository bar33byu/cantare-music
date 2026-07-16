const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 10;

interface FailureBucket {
  count: number;
  resetAt: number;
}

const failureBuckets = new Map<string, FailureBucket>();

export function getLoginCodeRateLimitKey(request: Request, email: string): string {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const clientAddress = forwardedFor || request.headers.get("x-real-ip")?.trim() || "unknown";
  return `${clientAddress}:${email.trim().toLowerCase()}`;
}

export function isLoginCodeRateLimited(key: string, now = Date.now()): boolean {
  const bucket = failureBuckets.get(key);
  if (!bucket) {
    return false;
  }
  if (bucket.resetAt <= now) {
    failureBuckets.delete(key);
    return false;
  }
  return bucket.count >= MAX_FAILURES;
}

export function recordLoginCodeFailure(key: string, now = Date.now()): void {
  const bucket = failureBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    failureBuckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  bucket.count += 1;
}

export function clearLoginCodeFailures(key: string): void {
  failureBuckets.delete(key);
}

export function resetLoginCodeRateLimitsForTests(): void {
  failureBuckets.clear();
}
