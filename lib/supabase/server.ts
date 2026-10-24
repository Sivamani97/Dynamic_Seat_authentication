import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createBaseClient, SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export function createServerSupabaseClient() {
  const cookieStore = cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dummy-project.supabase.co";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "dummy_anon_key";

  return createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // The `set` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing sessions.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: "", ...options });
        } catch {
          // Can be ignored if from Server Component
        }
      },
    },
  });
}

/**
 * Returns a Supabase Admin Client using the SERVICE_ROLE_KEY.
 * CRITICAL: Must ONLY be invoked in server Route Handlers and Server Actions, never exposed to client!
 */
export function getAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dummy-project.supabase.co";
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "dummy_service_role_key";

  return createBaseClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export interface AuditLogParams {
  eventType: string;
  bookingId?: string | null;
  bookingRef?: string | null;
  seatId?: string | null;
  seatLabel?: string | null;
  unitId?: string | null;
  actorId?: string | null;
  actorRole?: string | null;
  status?: string;
  meta?: Record<string, any>;
}

/**
 * Appends an entry to the tamper-evident hash-chained audit log via Postgres RPC
 */
export async function logAuditEvent(
  client: SupabaseClient,
  params: AuditLogParams
): Promise<number | null> {
  try {
    const { data, error } = await client.rpc("append_audit_log", {
      p_event_type: params.eventType,
      p_booking_id: params.bookingId || null,
      p_booking_ref: params.bookingRef || null,
      p_seat_id: params.seatId || null,
      p_seat_label: params.seatLabel || null,
      p_unit_id: params.unitId || null,
      p_actor_id: params.actorId || null,
      p_actor_role: params.actorRole || "SYSTEM",
      p_status: params.status || "SUCCESS",
      p_meta: params.meta || {},
    });

    if (error) {
      console.error("Failed to append audit log via RPC:", error.message);
      return null;
    }

    return data as number;
  } catch (err) {
    console.error("Unexpected error in logAuditEvent:", err);
    return null;
  }
}
