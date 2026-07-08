export type RateLimitPolicy = {
  id: string;
  maxRequests: number;
  windowMs: number;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitBucket>();
const UNKNOWN_CLIENT = "unknown";

const normalizeClient = (value: string | null | undefined) => {
  const normalized = value?.split(",")[0]?.trim().replace(/^"|"$/g, "") ?? "";
  return normalized || UNKNOWN_CLIENT;
};

const clientKey = (request: Request, route: string, fallback?: string) => {
  const ip = normalizeClient(
    request.headers.get("x-forwarded-for") ??
      request.headers.get("x-real-ip") ??
      fallback,
  );
  const agent = request.headers.get("user-agent")?.trim().toLowerCase().slice(0, 200) || "unknown";
  return `${route}:${ip}:${agent}`;
};

export const consumeRateLimit = (
  request: Request,
  route: string,
  policies: readonly RateLimitPolicy[],
  fallbackClientAddress?: string,
  now = Date.now(),
) => {
  const key = clientKey(request, route, fallbackClientAddress);
  const nextBuckets = new Map<string, RateLimitBucket>();

  for (const policy of policies) {
    const bucketId = `${policy.id}:${key}`;
    const current = buckets.get(bucketId);
    const bucket = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + policy.windowMs }
      : current;

    if (bucket.count + 1 > policy.maxRequests) {
      return {
        allowed: false,
        retryAfterMs: Math.max(bucket.resetAt - now, 0),
      } as const;
    }

    nextBuckets.set(bucketId, {
      count: bucket.count + 1,
      resetAt: bucket.resetAt,
    });
  }

  for (const [bucketId, bucket] of nextBuckets) {
    buckets.set(bucketId, bucket);
  }

  return { allowed: true } as const;
};

export const resetRateLimitStore = () => {
  buckets.clear();
};

