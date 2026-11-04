import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getAdminClient } from "@/lib/supabase/server";

/**
 * Administrative Role Management Endpoint
 * POST /api/admin/users/role
 * 
 * Strict Security Architecture:
 * 1. Derives acting identity exclusively from verified session cookies or Bearer token.
 * 2. Never trusts client-supplied actor IDs, role headers, or metadata.
 * 3. Enforces strict role transition rules before invoking the database RPC:
 *    - Caller must have authoritative ADMIN role in public.profiles.
 *    - ADMIN cannot modify their own role (prevents self-elevation anomalies or lockout).
 *    - ADMIN cannot promote any user to ADMIN (prevents unrestricted admin creation).
 *    - ADMIN cannot demote or modify another ADMIN account.
 *    - Permitted: ADMIN promoting USER to STAFF or demoting STAFF to USER.
 * 4. Executes the database RPC admin_set_user_role using the server-only service_role client.
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authoritative identity verification
    const actor = await getAuthenticatedUser(request);
    if (!actor) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // 2. Strict authorization: actor must be an ADMIN
    if (actor.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Forbidden: Only administrators can modify roles" },
        { status: 403 }
      );
    }

    // Parse JSON body
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid JSON payload" },
        { status: 400 }
      );
    }

    const { targetUserId, newRole } = body;

    // 3. Input validation
    if (!targetUserId || typeof targetUserId !== "string") {
      return NextResponse.json(
        { error: "targetUserId is required and must be a UUID string" },
        { status: 400 }
      );
    }

    const validRoles = ["USER", "STAFF", "ADMIN"];
    if (!newRole || !validRoles.includes(newRole)) {
      return NextResponse.json(
        { error: "newRole must be one of: USER, STAFF, ADMIN" },
        { status: 400 }
      );
    }

    // 4. Strict Role Transition Rules:
    // Rule: ADMIN cannot modify their own role
    if (actor.id === targetUserId) {
      return NextResponse.json(
        { error: "Forbidden: Administrators cannot modify their own account role" },
        { status: 403 }
      );
    }

    // Rule: ADMIN cannot promote any user to ADMIN
    // (Unrestricted admin creation is blocked; requires root service_role / DBA provisioning)
    if (newRole === "ADMIN") {
      return NextResponse.json(
        {
          error:
            "Forbidden: Administrators cannot grant ADMIN privileges. Administrator creation requires root service_role authorization.",
        },
        { status: 403 }
      );
    }

    // 5. Verify target profile via server-only service_role client
    const adminClient = getAdminClient();

    const { data: targetProfile, error: targetError } = await adminClient
      .from("profiles")
      .select("id, role, active")
      .eq("id", targetUserId)
      .maybeSingle();

    if (targetError) {
      console.error("Error verifying target profile:", targetError);
      return NextResponse.json(
        { error: "Failed to verify target profile" },
        { status: 500 }
      );
    }

    if (!targetProfile) {
      return NextResponse.json(
        { error: "Target user not found" },
        { status: 404 }
      );
    }

    // Rule: ADMIN cannot modify or demote another ADMIN
    if (targetProfile.role === "ADMIN") {
      return NextResponse.json(
        {
          error: "Forbidden: Administrators cannot demote or alter other administrator accounts",
        },
        { status: 403 }
      );
    }

    // Rule: Strict allowed transitions for ADMIN (USER <-> STAFF only)
    const isPromoteUserToStaff = targetProfile.role === "USER" && newRole === "STAFF";
    const isDemoteStaffToUser = targetProfile.role === "STAFF" && newRole === "USER";
    const isNoOp = targetProfile.role === newRole;

    if (!isPromoteUserToStaff && !isDemoteStaffToUser && !isNoOp) {
      return NextResponse.json(
        {
          error:
            "Forbidden: Disallowed role transition. Administrators can only promote USER to STAFF or demote STAFF to USER.",
        },
        { status: 403 }
      );
    }

    // 6. Invoke hardened database RPC with verified actor ID
    const { data: rpcResult, error: rpcError } = await adminClient.rpc(
      "admin_set_user_role",
      {
        p_target_user_id: targetUserId,
        p_new_role: newRole,
        p_actor_user_id: actor.id,
      }
    );

    if (rpcError) {
      console.error("admin_set_user_role RPC error:", rpcError);
      return NextResponse.json(
        { error: "Database error updating user role" },
        { status: 500 }
      );
    }

    if (!rpcResult?.success) {
      const statusCode =
        rpcResult?.code === "CANNOT_MODIFY_OWN_ROLE" || rpcResult?.code === "INVALID_ROLE"
          ? 400
          : rpcResult?.code === "USER_NOT_FOUND"
          ? 404
          : 403;

      return NextResponse.json(
        { error: rpcResult?.message || "Role update rejected" },
        { status: statusCode }
      );
    }

    return NextResponse.json({
      success: true,
      message: "User role updated successfully",
      data: rpcResult,
    });
  } catch (err: any) {
    console.error("Unhandled error in role assignment route:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

