import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, getAuthenticatedUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/me
 * 
 * Returns the cryptographically verified session identity and authoritative
 * database role resolved strictly from public.profiles.role.
 * 
 * Never trusts client headers, localStorage, or user_metadata.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getAdminClient();
    const user = await getAuthenticatedUser(request, supabase);

    if (!user) {
      return NextResponse.json({
        authenticated: false,
        user: null,
      });
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error: any) {
    console.error("Error in /api/auth/me:", error?.message || error);
    return NextResponse.json(
      { authenticated: false, user: null, error: "Internal server error" },
      { status: 500 }
    );
  }
}

