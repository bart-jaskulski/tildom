const UNKNOWN_CLIENT = "unknown";
const UNKNOWN_USER_AGENT = "unknown";
const USER_AGENT_MAX_LENGTH = 200;
const PRUNE_INTERVAL = 100;
const rateLimitBuckets = new Map();
let accessCount = 0;
const normalizeUserAgent = (value) => {
    const normalized = value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
    return normalized ? normalized.slice(0, USER_AGENT_MAX_LENGTH) : UNKNOWN_USER_AGENT;
};
const normalizeClientAddress = (value) => {
    const normalized = value?.trim().replace(/^"|"$/g, "").replace(/^\[|\]$/g, "") ?? "";
    return normalized || UNKNOWN_CLIENT;
};
const parseForwardedHeader = (value) => {
    if (!value) {
        return null;
    }
    const firstEntry = value.split(",")[0]?.trim() ?? "";
    const match = firstEntry.match(/for=(?:"?\[?([^;\]",]+)\]?)/i);
    return normalizeClientAddress(match?.[1] ?? null);
};
const getRequestClientAddress = (request, fallbackAddress) => {
    const forwarded = parseForwardedHeader(request.headers.get("forwarded"));
    if (forwarded && forwarded !== UNKNOWN_CLIENT) {
        return forwarded;
    }
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) {
        const firstForwarded = normalizeClientAddress(forwardedFor.split(",")[0]);
        if (firstForwarded !== UNKNOWN_CLIENT) {
            return firstForwarded;
        }
    }
    const proxyHeaders = ["cf-connecting-ip", "x-real-ip"];
    for (const header of proxyHeaders) {
        const value = normalizeClientAddress(request.headers.get(header));
        if (value !== UNKNOWN_CLIENT) {
            return value;
        }
    }
    return normalizeClientAddress(fallbackAddress);
};
const getBucketState = (bucketId, policy, now) => {
    const current = rateLimitBuckets.get(bucketId);
    if (!current || current.resetAt <= now) {
        return {
            count: 0,
            resetAt: now + policy.windowMs,
        };
    }
    return current;
};
const pruneExpiredBuckets = (now) => {
    accessCount += 1;
    if (accessCount % PRUNE_INTERVAL !== 0) {
        return;
    }
    for (const [bucketId, bucket] of rateLimitBuckets) {
        if (bucket.resetAt <= now) {
            rateLimitBuckets.delete(bucketId);
        }
    }
};
export const buildRateLimitBucketKey = (request, routeFamily, clientAddress) => {
    const ip = getRequestClientAddress(request, clientAddress);
    const userAgent = normalizeUserAgent(request.headers.get("user-agent"));
    return `${routeFamily}:${ip}:${userAgent}`;
};
export const consumeRateLimit = (bucketKey, policies, now = Date.now()) => {
    pruneExpiredBuckets(now);
    const nextBuckets = new Map();
    for (const policy of policies) {
        const bucketId = `${policy.id}:${bucketKey}`;
        const current = getBucketState(bucketId, policy, now);
        if (current.count + 1 > policy.maxRequests) {
            return {
                allowed: false,
                retryAfterMs: Math.max(current.resetAt - now, 0),
            };
        }
        nextBuckets.set(bucketId, {
            count: current.count + 1,
            resetAt: current.resetAt,
        });
    }
    for (const [bucketId, bucket] of nextBuckets) {
        rateLimitBuckets.set(bucketId, bucket);
    }
    return { allowed: true };
};
export const createRateLimitResponse = (message, retryAfterMs) => {
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    return Response.json({ error: message }, {
        status: 429,
        headers: {
            "retry-after": String(retryAfterSeconds),
        },
    });
};
export const resetRateLimitStore = () => {
    rateLimitBuckets.clear();
    accessCount = 0;
};
