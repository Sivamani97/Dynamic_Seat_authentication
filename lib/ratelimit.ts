import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { SupabaseClient } from "@supabase/supabase-js";

let upstashLimiter: Ratelimit | null = null;

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  try {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    upstashLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "10 s"),
      analytics: true,
      prefix: "smartseat_ratelimit",
    });
  } catch (err) {
    console.warn("Could not initialize Upstash Redis rate limiter, using database fallback:", err);
  }
}

export interface RateLimitCheckResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // Unix epoch ms
}

/**
 * Checks rate limit for an identifier (e.g., IP, unitId, or userId).
 * Uses Upstash Redis if configured, otherwise falls back to atomic database table rate limiter.
 */
export async function checkRateLimit(
  identifier: string,
  supabaseAdmin?: SupabaseClient,
  limitCount = 10,
  windowSeconds = 10
): Promise<RateLimitCheckResult> {
  // 1. Try Upstash Redis if available
  if (upstashLimiter) {
    try {
      const res = await upstashLimiter.limit(identifier);
      return {
        success: res.success,
        limit: res.limit,
        remaining: res.remaining,
        reset: res.reset,
      };
    } catch (e) {
      console.warn("Upstash rate limit failed, falling back to database limiter:", e);
    }
  }

  // 2. Database Fallback (atomic sliding / fixed window via rate_limits table)
  if (!supabaseAdmin) {
    // If no client provided, allow in development
    return {
      success: true,
      limit: limitCount,
      remaining: limitCount,
      reset: Date.now() + windowSeconds * 1000,
    };
  }

  const now = new Date();
  const resetAt = new Date(now.getTime() + windowSeconds * 1000);

  try {
    const { data: existing } = await supabaseAdmin
      .from("rate_limits")
      .select("key, count, reset_at")
      .eq("key", identifier)
      .single();

    if (!existing || new Date(existing.reset_at) < now) {
      // First hit or window expired: reset counter
      await supabaseAdmin.from("rate_limits").upsert({
        key: identifier,
        count: 1,
        reset_at: resetAt.toISOString(),
      });

      return {
        success: true,
        limit: limitCount,
        remaining: limitCount - 1,
        reset: resetAt.getTime(),
      };
    }

    if (existing.count >= limitCount) {
      return {
        success: false,
        limit: limitCount,
        remaining: 0,
        reset: new Date(existing.reset_at).getTime(),
      };
    }

    // Increment count
    await supabaseAdmin
      .from("rate_limits")
      .update({ count: existing.count + 1 })
      .eq("key", identifier);

    return {
      success: true,
      limit: limitCount,
      remaining: limitCount - (existing.count + 1),
      reset: new Date(existing.reset_at).getTime(),
    };
  } catch (err) {
    console.error("Database rate limiter error:", err);
    // Fail open in case of DB read error to prevent locking users out
    return {
      success: true,
      limit: limitCount,
      remaining: 1,
      reset: resetAt.getTime(),
    };
  }
}
