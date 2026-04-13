const buckets = new Map();

function cleanup(now) {
  for (const [key, entry] of buckets.entries()) {
    if (!entry || entry.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

function checkRateLimit(key, { windowMs, max }) {
  const now = Date.now();
  cleanup(now);

  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    const next = { count: 1, resetAt: now + windowMs };
    buckets.set(key, next);
    return { allowed: true, remaining: max - 1, retryAfterMs: windowMs };
  }

  current.count += 1;
  buckets.set(key, current);

  if (current.count > max) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, current.resetAt - now),
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, max - current.count),
    retryAfterMs: Math.max(0, current.resetAt - now),
  };
}

module.exports = {
  checkRateLimit,
};
